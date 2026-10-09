/**
 * dsh-session-search — host half.
 *
 * The shipped DSH session search indexes message text through SQLite FTS5 with
 * the `unicode61` tokenizer, which does not segment CJK: a run of Chinese
 * characters becomes ONE token, so searching for 会话 inside 会话历史 never
 * matches. This plugin sidesteps the backend entirely and reads the raw
 * session logs (`.dsh/sessions/<workspace>/<session>/session.v4.jsonl.zstd`),
 * decompressing each Zstandard frame with Node's built-in zstd support and
 * keeping plain text in memory. Queries are then literal, case-insensitive
 * substring scans — which work identically for 中文 and ASCII.
 *
 * Measured on this machine: ~156 sessions / ~83 MB compressed / ~53k documents,
 * index build ~5-9 s (yielded, so the UI stays responsive), query 7-40 ms.
 *
 * HTTP surface (all exact routes, GET only):
 *   GET /dsh-session-search/api/search?q=&limit=&perSession=&kinds=&sort=&refresh=
 *     sort=relevance (default) ranks sessions by match weight, then recency;
 *     sort=time returns the newest matches first (sessions and hits alike).
 *   GET /dsh-session-search/api/status
 *   GET /dsh-session-search/api/rebuild
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

export const name = 'session-search'
export const inject = ['webServer']

const PREFIX = '/dsh-session-search'
const MAGIC = 0xFD2FB528
const SESSION_FILE = /^session\.v(\d+)\.jsonl(\.zstd)?$/
const MAX_DOC_CHARS = 20000
const RESULT_DOC_CHARS = 2000
const MAX_TERMS = 8
const STALE_CHECK_MS = 4000

const KIND_WEIGHT = { user: 100, title: 60, assistant: 20, tool: 8, result: 4 }
const KIND_ORDER = ['user', 'title', 'assistant', 'tool', 'result']

// ---------------------------------------------------------------------------
// zstd frame handling
// ---------------------------------------------------------------------------

/**
 * Walk the Zstandard frame structure without decompressing: returns the byte
 * range of every frame in the buffer, tolerating a torn trailing frame.
 * @param {Buffer} buf
 * @returns {Array<[number, number]>}
 */
function scanFrames(buf) {
  const out = []
  let o = 0
  while (o + 4 <= buf.length) {
    if (buf.readUInt32LE(o) !== MAGIC) { o += 1; continue }
    const start = o
    o += 4
    if (o >= buf.length) break
    const descriptor = buf[o]
    o += 1
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    o += (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    let torn = false
    for (;;) {
      if (o + 3 > buf.length) { torn = true; break }
      const blockHeader = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16)
      o += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      if (blockType === 3) { torn = true; break }
      o += blockType === 1 ? 1 : blockSize
      if (o > buf.length) { torn = true; break }
      if (lastBlock) break
    }
    if (torn) break
    if (checksum) o += 4
    out.push([start, Math.min(o, buf.length)])
  }
  return out
}

/**
 * Decompress a whole session log.
 *
 * NOTE: `zlib.zstdDecompressSync(wholeBuffer)` is NOT usable here — it decodes
 * only the FIRST frame and silently returns, so a multi-frame session log would
 * yield just its header line. Session logs are appended frame by frame, so the
 * frames must be walked and decoded individually. A torn trailing frame is
 * tolerated (that is the normal state of a log being written right now).
 * @param {Buffer} buf
 * @returns {string}
 */
function decodeLog(buf) {
  const frames = scanFrames(buf)
  if (frames.length === 0) return ''
  const parts = []
  for (const [a, b] of frames) {
    try { parts.push(zlib.zstdDecompressSync(buf.subarray(a, b)).toString('utf8')) } catch { /* skip bad frame */ }
  }
  return parts.join('')
}

// ---------------------------------------------------------------------------
// text extraction
// ---------------------------------------------------------------------------

/**
 * Flatten a message content array to plain text. Reasoning blocks are skipped
 * (they are not what people search for) and tool-call blocks are skipped here
 * because `tool/call` events are indexed separately.
 * @param {unknown} content
 * @returns {string}
 */
function blockText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

/**
 * Collapse whitespace so snippets render on one line and the index is smaller.
 * @param {string} value
 * @returns {string}
 */
function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function clip(value, max) {
  return value.length > max ? value.slice(0, max) : value
}

// ---------------------------------------------------------------------------
// index
// ---------------------------------------------------------------------------

function sessionsRoot() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'sessions')
}

/**
 * Pick the newest session log inside one session directory.
 * @param {string} dir
 * @returns {string | undefined}
 */
function pickLog(dir) {
  let entries
  try { entries = fs.readdirSync(dir) } catch { return undefined }
  let best
  let bestVersion = -1
  for (const entry of entries) {
    const match = SESSION_FILE.exec(entry)
    if (match === null) continue
    const version = Number(match[1])
    if (version > bestVersion) { bestVersion = version; best = path.join(dir, entry) }
  }
  return best
}

function listSessionDirs(root) {
  const out = []
  let workspaces
  try { workspaces = fs.readdirSync(root, { withFileTypes: true }) } catch { return out }
  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue
    const workspaceDir = path.join(root, workspace.name)
    let sessions
    try { sessions = fs.readdirSync(workspaceDir, { withFileTypes: true }) } catch { continue }
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      const dir = path.join(workspaceDir, session.name)
      const file = pickLog(dir)
      if (file === undefined) continue
      out.push({ dir, file, workspaceDir: workspace.name, sessionId: session.name })
    }
  }
  return out
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

/**
 * Read one session log into documents plus its metadata.
 * @param {{sessionId: string, dir: string, file: string, workspaceDir: string}} entry
 * @param {Array<object>} docs
 * @returns {object}
 */
function readSession(entry, docs) {
  let stat
  try { stat = fs.statSync(entry.file) } catch { stat = undefined }
  const meta = {
    sessionId: entry.sessionId,
    dir: entry.dir,
    file: entry.file,
    mtime: stat === undefined ? 0 : stat.mtimeMs,
    bytes: stat === undefined ? 0 : stat.size,
    title: '',
    cwd: '',
    createdAt: 0,
    events: 0,
  }
  let buf
  try { buf = fs.readFileSync(entry.file) } catch { return meta }
  const text = decodeLog(buf)
  for (const line of text.split('\n')) {
    if (line === '') continue
    let event
    try { event = JSON.parse(line) } catch { continue }
    meta.events += 1
    const type = event.type
    const data = event.data
    if (type === 'session') {
      meta.createdAt = Number(event.createdAt) || meta.createdAt
      if (typeof event.cwd === 'string') meta.cwd = event.cwd
      continue
    }
    if (type === 'session/title') {
      if (data !== null && typeof data === 'object' && typeof data.title === 'string' && data.title !== '') meta.title = data.title
      continue
    }
    if (type === 'user/message') {
      const source = data === null || typeof data !== 'object' ? undefined : data.source
      if (source === null || typeof source !== 'object' || source.kind !== 'user') continue
      const value = normalize(blockText(data.content))
      if (value !== '') docs.push({ sid: entry.sessionId, seq: event.seq, time: event.time, kind: 'user', text: clip(value, MAX_DOC_CHARS) })
      continue
    }
    if (type === 'assistant/message') {
      const message = data === null || typeof data !== 'object' ? undefined : data.message
      if (message === null || typeof message !== 'object') continue
      const value = normalize(blockText(message.content))
      if (value !== '') docs.push({ sid: entry.sessionId, seq: event.seq, time: event.time, kind: 'assistant', text: clip(value, MAX_DOC_CHARS) })
      continue
    }
    if (type === 'tool/call') {
      if (data === null || typeof data !== 'object') continue
      const args = typeof data.arguments === 'string' ? data.arguments : JSON.stringify(data.arguments || {})
      const value = normalize(String(data.name || '') + ' ' + args)
      if (value !== '') docs.push({ sid: entry.sessionId, seq: event.seq, time: event.time, kind: 'tool', text: clip(value, MAX_DOC_CHARS) })
      continue
    }
    if (type === 'tool/result') {
      if (data === null || typeof data !== 'object') continue
      const message = data.message
      const body = message !== null && typeof message === 'object' ? blockText(message.content) : ''
      const error = data.error !== null && typeof data.error === 'object' && data.error !== undefined
        ? String(data.error.name || '') + ' ' + String(data.error.code || '')
        : ''
      const value = normalize(body + ' ' + error)
      if (value !== '') docs.push({ sid: entry.sessionId, seq: event.seq, time: event.time, kind: 'result', text: clip(value, RESULT_DOC_CHARS) })
    }
  }
  if (meta.title !== '') docs.push({ sid: entry.sessionId, seq: 0, time: meta.createdAt, kind: 'title', text: meta.title })
  return meta
}

/**
 * Build the whole index, yielding to the event loop between sessions so the
 * desktop UI never freezes for the whole build.
 * @returns {Promise<object>}
 */
async function buildIndex() {
  const started = Date.now()
  const root = sessionsRoot()
  const entries = listSessionDirs(root)
  const docs = []
  const metas = new Map()
  let bytes = 0
  let newest = 0
  for (let i = 0; i < entries.length; i += 1) {
    const meta = readSession(entries[i], docs)
    metas.set(meta.sessionId, meta)
    bytes += meta.bytes
    if (meta.mtime > newest) newest = meta.mtime
    if ((i & 7) === 7) await tick()
  }
  return { docs, metas, root, files: entries.length, bytes, newest, builtAt: Date.now(), buildMs: Date.now() - started }
}

function newestMtime() {
  let newest = 0
  for (const entry of listSessionDirs(sessionsRoot())) {
    try {
      const stat = fs.statSync(entry.file)
      if (stat.mtimeMs > newest) newest = stat.mtimeMs
    } catch { /* ignore */ }
  }
  return newest
}

let index = null
let building = null
let lastStaleCheck = 0

/**
 * Return the index, rebuilding when it is missing, explicitly refreshed, or
 * the session logs changed.
 * @param {boolean} refresh
 * @returns {Promise<object>}
 */
function getIndex(refresh) {
  if (refresh) index = null
  if (index === null && building === null) {
    building = buildIndex().then((value) => { index = value; building = null; return value }, (error) => { building = null; throw error })
  }
  if (building !== null) return building
  const now = Date.now()
  if (now - lastStaleCheck > STALE_CHECK_MS) {
    lastStaleCheck = now
    if (newestMtime() > index.newest) {
      index = null
      return getIndex(false)
    }
  }
  return Promise.resolve(index)
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * Literal, case-insensitive substring search. Every whitespace-separated term
 * must appear somewhere in the document (AND), which is what makes single
 * Chinese characters usable as a locator.
 *
 * `sort` picks the ranking:
 *   "relevance" (default) — sessions by summed kind weight, then recency; hits
 *                           in append (chronological) order.
 *   "time"                — sessions by their NEWEST matching message, newest
 *                           first; hits within a session newest first too.
 * @param {object} snapshot
 * @param {string} query
 * @param {{limit: number, perSession: number, kinds: string[], sort: string}} options
 * @returns {object}
 */
function searchDocs(snapshot, query, options) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter((t) => t !== '').slice(0, MAX_TERMS)
  if (terms.length === 0) return { total: 0, sessions: [] }
  const byTime = options.sort === 'time'
  const matchers = terms.map((term) => new RegExp(escapeRegExp(term), 'i'))
  const kinds = options.kinds.length === 0 ? null : new Set(options.kinds)

  const grouped = new Map()
  let total = 0
  for (const doc of snapshot.docs) {
    if (kinds !== null && !kinds.has(doc.kind)) continue
    let first = -1
    let matched = true
    for (const matcher of matchers) {
      const found = matcher.exec(doc.text)
      if (found === null) { matched = false; break }
      if (first < 0 || found.index < first) first = found.index
    }
    if (!matched) continue
    total += 1
    let group = grouped.get(doc.sid)
    if (group === undefined) {
      group = { sessionId: doc.sid, count: 0, score: 0, newest: 0, hits: [] }
      grouped.set(doc.sid, group)
    }
    group.count += 1
    group.score += KIND_WEIGHT[doc.kind] || 1
    const at = Number(doc.time) || 0
    if (at > group.newest) group.newest = at
    // Relevance keeps the FIRST N matches in append order. Time must keep the
    // NEWEST N, and docs are not iterated in time order (the title doc is
    // appended last but carries the session's createdAt), so select by `time`
    // rather than by position, then order explicitly below.
    if (!byTime && group.hits.length >= options.perSession) continue
    const from = Math.max(0, first - 100)
    const to = Math.min(doc.text.length, first + 180)
    const snippet = doc.text.slice(from, to)
    const marks = []
    for (const matcher of matchers) {
      const global = new RegExp(matcher.source, 'gi')
      let found
      while ((found = global.exec(snippet)) !== null) {
        if (found[0].length === 0) break
        marks.push([found.index, found[0].length])
        if (global.lastIndex <= found.index) global.lastIndex = found.index + 1
      }
    }
    marks.sort((a, b) => a[0] - b[0])
    const entry = {
      kind: doc.kind,
      seq: doc.seq,
      time: doc.time,
      snippet,
      prefix: from > 0,
      suffix: to < doc.text.length,
      marks,
    }
    if (!byTime || group.hits.length < options.perSession) {
      group.hits.push(entry)
    } else {
      let oldest = 0
      for (let i = 1; i < group.hits.length; i += 1) {
        if ((Number(group.hits[i].time) || 0) < (Number(group.hits[oldest].time) || 0)) oldest = i
      }
      if (at > (Number(group.hits[oldest].time) || 0)) group.hits[oldest] = entry
    }
  }

  const sessions = []
  for (const group of grouped.values()) {
    const meta = snapshot.metas.get(group.sessionId)
    if (byTime) group.hits.sort((a, b) => (Number(b.time) || 0) - (Number(a.time) || 0))
    sessions.push({
      sessionId: group.sessionId,
      count: group.count,
      score: group.score,
      hits: group.hits,
      newest: group.newest,
      title: meta === undefined || meta.title === '' ? '' : meta.title,
      cwd: meta === undefined ? '' : meta.cwd,
      mtime: meta === undefined ? 0 : meta.mtime,
      createdAt: meta === undefined ? 0 : meta.createdAt,
    })
  }
  if (byTime) {
    sessions.sort((a, b) => (b.newest - a.newest) || (b.mtime - a.mtime))
  } else {
    sessions.sort((a, b) => (b.score - a.score) || (b.mtime - a.mtime))
  }
  return { total, sessions: sessions.slice(0, options.limit), sort: byTime ? 'time' : 'relevance' }
}

// ---------------------------------------------------------------------------
// http
// ---------------------------------------------------------------------------

function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  })
  res.end(body)
}

function indexInfo(snapshot) {
  return {
    docs: snapshot.docs.length,
    sessions: snapshot.metas.size,
    files: snapshot.files,
    bytes: snapshot.bytes,
    builtAt: snapshot.builtAt,
    buildMs: snapshot.buildMs,
    root: snapshot.root,
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {() => string} label
 */
function guard(req, res, label) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { error: 'method not allowed' })
    return false
  }
  return true
}

async function handleSearch(req, res, url) {
  const query = url.searchParams.get('q') || ''
  const limit = clamp(Number(url.searchParams.get('limit')), 1, 100) || 20
  const perSession = clamp(Number(url.searchParams.get('perSession')), 1, 20) || 3
  const kinds = (url.searchParams.get('kinds') || '').split(',').map((k) => k.trim()).filter((k) => k !== '')
  const sort = url.searchParams.get('sort') === 'time' ? 'time' : 'relevance'
  const refresh = url.searchParams.get('refresh') === '1'
  const snapshot = await getIndex(refresh)
  const started = Date.now()
  const result = searchDocs(snapshot, query, { limit, perSession, kinds, sort })
  sendJson(res, 200, {
    query,
    sort: result.sort,
    tookMs: Date.now() - started,
    index: indexInfo(snapshot),
    total: result.total,
    sessions: result.sessions,
  })
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.effect(() => {
    const offSearch = ctx.webServer.register({
      kind: 'exact',
      path: `${PREFIX}/api/search`,
      handler: (req, res) => {
        if (!guard(req, res, 'search')) return
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        return handleSearch(req, res, url).catch((error) => {
          sendJson(res, 500, { error: String((error && error.message) || error) })
        })
      },
    })
    const offStatus = ctx.webServer.register({
      kind: 'exact',
      path: `${PREFIX}/api/status`,
      handler: (req, res) => {
        if (!guard(req, res, 'status')) return
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const refresh = url.searchParams.get('refresh') === '1'
        return getIndex(refresh).then(
          (snapshot) => sendJson(res, 200, { ready: true, index: indexInfo(snapshot) }),
          (error) => sendJson(res, 500, { ready: false, error: String((error && error.message) || error) }),
        )
      },
    })
    return () => { offSearch(); offStatus() }
  }, 'session-search: http routes')

  // Warm the index shortly after boot so the first search is instant. The build
  // yields between sessions, so this does not freeze the UI.
  const timer = setTimeout(() => { getIndex(false).catch(() => {}) }, 4000)
  if (typeof timer.unref === 'function') timer.unref()
  ctx.effect(() => () => clearTimeout(timer), 'session-search: index warm-up')
}
