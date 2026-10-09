/**
 * dsh-session-search — browser half.
 *
 * Hand-written module-loader bundle (no build step): the host serves this file
 * verbatim and the client module system runs the factory to get `apply`/`inject`.
 *
 * Surfaces:
 *   - `shell.overlay`        the search dialog (frame-wide floating layer)
 *   - `sidebar.footer.action` a trigger button beside Settings
 *   - a keyboard shortcut (Mod+Shift+K) when the shortcuts service is present
 */
window.__ModuleLoader__.load({
  id: "dsh-session-search",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    let React = require("react");

    //#region css
    const css = [
      ".dsss-root{position:fixed;inset:0;z-index:80;display:flex;align-items:flex-start;justify-content:center;padding-top:12vh;pointer-events:none;font-family:-apple-system,\"SF Pro Text\",\"PingFang SC\",\"Segoe UI\",system-ui,sans-serif}",
      ".dsss-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.32);backdrop-filter:blur(2px);pointer-events:auto}",
      ".dsss-dialog{position:relative;width:min(760px,92vw);max-height:74vh;display:flex;flex-direction:column;pointer-events:auto;border-radius:14px;overflow:hidden;background:#fff;color:#1d1d1f;border:1px solid rgba(0,0,0,.08);box-shadow:0 18px 60px rgba(0,0,0,.28)}",
      ".dsss-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.07)}",
      ".dsss-input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:15px;color:inherit;padding:4px 2px}",
      ".dsss-input::placeholder{color:#9a9aa0}",
      ".dsss-spin{flex:none;font-size:11px;color:#8a8a90;min-width:52px;text-align:right}",
      ".dsss-body{overflow:auto;padding:6px 0 10px}",
      ".dsss-empty{padding:26px 18px;text-align:center;color:#8a8a90;font-size:13px;line-height:1.7}",
      ".dsss-group{padding:2px 0 6px}",
      ".dsss-ghead{display:flex;align-items:baseline;gap:8px;padding:8px 16px 4px;font-size:11px;letter-spacing:.02em;color:#8a8a90}",
      ".dsss-gtitle{color:#3a3a40;font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:52%}",
      ".dsss-gcount{flex:none;background:rgba(0,0,0,.06);border-radius:9px;padding:1px 7px;font-size:10px}",
      ".dsss-gpath{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:right;font-size:10px}",
      ".dsss-gnew{flex:none;font-size:10px;color:#0a66c2}",
      ".dsss-hit{display:block;width:100%;text-align:left;border:0;background:transparent;cursor:pointer;padding:7px 16px;font:inherit;color:inherit;border-left:2px solid transparent}",
      ".dsss-hit:hover,.dsss-hit[data-sel=\"1\"]{background:rgba(10,102,194,.08);border-left-color:#0a66c2}",
      ".dsss-hit-top{display:flex;align-items:center;gap:7px;margin-bottom:3px}",
      ".dsss-kind{flex:none;font-size:9px;letter-spacing:.04em;text-transform:uppercase;padding:1px 6px;border-radius:5px;background:rgba(0,0,0,.06);color:#6a6a70}",
      ".dsss-kind[data-k=\"user\"]{background:rgba(10,102,194,.14);color:#0a66c2}",
      ".dsss-kind[data-k=\"title\"]{background:rgba(191,124,0,.16);color:#9a6200}",
      ".dsss-kind[data-k=\"assistant\"]{background:rgba(52,120,80,.14);color:#2f6b4a}",
      ".dsss-when{font-size:10px;color:#9a9aa0}",
      ".dsss-snip{font-size:12.5px;line-height:1.65;color:#3a3a40;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}",
      ".dsss-snip em{font-style:normal;background:rgba(255,214,0,.42);border-radius:2px;padding:0 1px;color:#1d1d1f}",
      ".dsss-more{font-size:11px;color:#8a8a90;padding:1px 16px 4px}",
      ".dsss-foot{display:flex;align-items:center;gap:12px;padding:8px 14px;border-top:1px solid rgba(0,0,0,.07);font-size:11px;color:#8a8a90;flex-wrap:wrap}",
      ".dsss-foot kbd{font:inherit;font-size:10px;background:rgba(0,0,0,.06);border-radius:4px;padding:1px 5px}",
      ".dsss-foot .dsss-sp{flex:1}",
      ".dsss-btn{border:1px solid rgba(0,0,0,.12);background:rgba(0,0,0,.03);border-radius:7px;padding:3px 9px;font:inherit;font-size:11px;cursor:pointer;color:#3a3a40}",
      ".dsss-btn:hover{background:rgba(0,0,0,.07)}",
      ".dsss-sortgroup{display:inline-flex;align-items:center;gap:4px}",
      ".dsss-sort{padding:2px 7px}",
      ".dsss-sort[data-on=\"1\"]{background:rgba(10,102,194,.14);border-color:rgba(10,102,194,.4);color:#0a66c2;font-weight:600}",
      ".dsss-rail{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:30px;min-width:30px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:12px;opacity:.75}",
      ".dsss-rail:hover{opacity:1;background:rgba(127,127,127,.16)}",
      ".dsss-err{color:#c0392b}",
      "@media (prefers-color-scheme:dark){",
      ".dsss-dialog{background:#1e1e20;color:#f5f5f7;border-color:rgba(255,255,255,.1)}",
      ".dsss-head,.dsss-foot{border-color:rgba(255,255,255,.09)}",
      ".dsss-gtitle{color:#e6e6ea}.dsss-gcount{background:rgba(255,255,255,.1)}",
      ".dsss-snip{color:#d6d6da}.dsss-hit:hover,.dsss-hit[data-sel=\"1\"]{background:rgba(120,180,255,.12)}",
      ".dsss-kind{background:rgba(255,255,255,.1);color:#b8b8be}",
      ".dsss-btn{border-color:rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#e6e6ea}",
      ".dsss-btn:hover{background:rgba(255,255,255,.1)}",
      ".dsss-sort[data-on=\"1\"]{background:rgba(120,180,255,.18);border-color:rgba(120,180,255,.45);color:#9dc7ff}",
      ".dsss-gnew{color:#9dc7ff}",
      ".dsss-snip em{background:rgba(255,214,0,.3);color:#fff}",
      "}",
    ].join("");
    const tagId = "dsh-session-search/panel.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-session-search";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }
    //#endregion

    const API = "/dsh-session-search/api";
    const h = React.createElement;
    const KIND_LABEL = { user: "你", title: "标题", assistant: "回复", tool: "工具", result: "结果" };

    //#region tiny store
    function createStore(initial) {
      let value = initial;
      const listeners = new Set();
      return {
        get: () => value,
        set: (next) => {
          value = typeof next === "function" ? next(value) : next;
          for (const fn of [...listeners]) fn();
        },
        subscribe: (fn) => {
          listeners.add(fn);
          return () => { listeners.delete(fn); };
        },
      };
    }
    function useStore(store) {
      const [value, setValue] = React.useState(store.get);
      React.useEffect(() => store.subscribe(() => setValue(store.get())), [store]);
      return value;
    }
    //#endregion

    function formatTime(ms) {
      if (!ms) return "";
      const d = new Date(ms);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function basename(value) {
      if (!value) return "";
      const parts = String(value).split(/[\\/]/).filter((p) => p !== "");
      return parts.length === 0 ? value : parts[parts.length - 1];
    }

    async function requestSearch(query, sort, signal) {
      const response = await fetch(`${API}/search?q=${encodeURIComponent(query)}&limit=30&perSession=3&sort=${sort}`, { signal, headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }

    function Highlight({ text, marks, prefix, suffix }) {
      const parts = [];
      if (prefix) parts.push(h("span", { key: "p" }, "…"));
      let at = 0;
      const sorted = [...(marks || [])].sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < sorted.length; i += 1) {
        const start = sorted[i][0];
        const end = start + sorted[i][1];
        if (start < at || end > text.length) continue;
        if (start > at) parts.push(text.slice(at, start));
        parts.push(h("em", { key: `m${i}` }, text.slice(start, end)));
        at = end;
      }
      if (at < text.length) parts.push(text.slice(at));
      if (suffix) parts.push(h("span", { key: "s" }, "…"));
      return h("div", { className: "dsss-snip" }, parts);
    }

    //#region dialog
    function SearchDialog({ store, onClose, onOpenSession }) {
      const state = useStore(store);
      const [query, setQuery] = React.useState("");
      const [sort, setSort] = React.useState("relevance");
      const [data, setData] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [sel, setSel] = React.useState(0);
      const inputRef = React.useRef(null);
      const abortRef = React.useRef(null);

      React.useEffect(() => {
        if (!state.open) return undefined;
        const timer = setTimeout(() => {
          const node = inputRef.current;
          if (node !== null) { node.focus(); node.select(); }
        }, 20);
        return () => clearTimeout(timer);
      }, [state.open]);

      React.useEffect(() => {
        if (!state.open) return undefined;
        if (query.trim() === "") {
          setData(null);
          setError(null);
          setBusy(false);
          return undefined;
        }
        setBusy(true);
        const timer = setTimeout(() => {
          if (abortRef.current !== null) abortRef.current.abort();
          const controller = new AbortController();
          abortRef.current = controller;
          requestSearch(query, sort, controller.signal).then(
            (value) => { if (!controller.signal.aborted) { setData(value); setError(null); setSel(0); setBusy(false); } },
            (err) => { if (!controller.signal.aborted) { setError(String((err && err.message) || err)); setBusy(false); } },
          );
        }, 160);
        return () => clearTimeout(timer);
      }, [query, sort, state.open]);

      const flat = React.useMemo(() => {
        const rows = [];
        for (const session of (data && data.sessions) || []) {
          for (const hit of session.hits) rows.push({ session, hit });
        }
        return rows;
      }, [data]);

      const openAt = React.useCallback((index) => {
        const row = flat[index];
        if (row === undefined) return;
        onOpenSession(row.session.sessionId);
        onClose();
      }, [flat, onOpenSession, onClose]);

      const onKeyDown = React.useCallback((event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
        if (event.key === "ArrowDown") { event.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); return; }
        if (event.key === "ArrowUp") { event.preventDefault(); setSel((s) => Math.max(0, s - 1)); return; }
        if (event.key === "Enter") { event.preventDefault(); openAt(sel); }
      }, [flat.length, openAt, onClose, sel]);

      if (!state.open) return null;

      const groups = (data && data.sessions) || [];
      const index = (data && data.index) || null;
      let cursor = -1;

      const body = [];
      if (error !== null) {
        body.push(h("div", { key: "err", className: "dsss-empty dsss-err" }, `搜索失败：${error}`));
      } else if (query.trim() === "") {
        body.push(h("div", { key: "idle", className: "dsss-empty" },
          h("div", null, "输入任意一个字或词即可定位到历史对话。"),
          h("div", null, "中文按字面匹配（一个字也能搜），多个词用空格分隔表示同时包含。"),
        ));
      } else if (data !== null && groups.length === 0) {
        body.push(h("div", { key: "none", className: "dsss-empty" }, `没有找到包含「${query.trim()}」的对话。`));
      } else {
        for (const session of groups) {
          const hits = session.hits.map((hit) => {
            cursor += 1;
            const index2 = cursor;
            return h("button", {
              key: `${session.sessionId}:${hit.kind}:${hit.seq}`,
              type: "button",
              className: "dsss-hit",
              "data-sel": index2 === sel ? "1" : "0",
              onMouseEnter: () => setSel(index2),
              onClick: () => openAt(index2),
            },
              h("div", { className: "dsss-hit-top" },
                h("span", { className: "dsss-kind", "data-k": hit.kind }, KIND_LABEL[hit.kind] || hit.kind),
                hit.seq ? h("span", { className: "dsss-when" }, `#${hit.seq}`) : null,
                hit.time ? h("span", { className: "dsss-when" }, formatTime(hit.time)) : null,
              ),
              h(Highlight, { text: hit.snippet, marks: hit.marks, prefix: hit.prefix, suffix: hit.suffix }),
            );
          });
          const extra = session.count - session.hits.length;
          body.push(h("div", { key: session.sessionId, className: "dsss-group" },
            h("div", { className: "dsss-ghead" },
              h("span", { className: "dsss-gtitle" }, session.title || basename(session.cwd) || session.sessionId),
              h("span", { className: "dsss-gcount" }, String(session.count)),
              sort === "time" && session.newest
                ? h("span", { className: "dsss-gnew" }, formatTime(session.newest))
                : null,
              h("span", { className: "dsss-gpath" }, basename(session.cwd)),
            ),
            ...hits,
            extra > 0 ? h("div", { key: "more", className: "dsss-more" }, `… 该会话另有 ${extra} 处匹配`) : null,
          ));
        }
      }

      const sortButton = (value, text) => h("button", {
        type: "button",
        className: "dsss-btn dsss-sort",
        "data-on": sort === value ? "1" : "0",
        title: value === "time" ? "按时间排序：最新匹配的会话排在最前" : "按相关度排序：命中权重高的会话排在最前",
        onClick: () => setSort(value),
      }, text);

      return h("div", { className: "dsss-root" },
        h("div", { className: "dsss-backdrop", onClick: onClose }),
        h("div", { className: "dsss-dialog", onKeyDown, role: "dialog", "aria-label": "搜索历史对话" },
          h("div", { className: "dsss-head" },
            h("span", { style: { fontSize: 15, opacity: 0.5 } }, "⌕"),
            h("input", {
              ref: inputRef,
              className: "dsss-input",
              value: query,
              placeholder: "搜索历史对话（中文一个字也能搜）",
              spellCheck: false,
              onChange: (event) => setQuery(event.target.value),
            }),
            h("span", { className: "dsss-spin" }, busy ? "搜索中…" : data !== null ? `${data.total} 处` : ""),
          ),
          h("div", { className: "dsss-body" }, ...body),
          h("div", { className: "dsss-foot" },
            h("span", null, h("kbd", null, "↑"), h("kbd", null, "↓"), " 选择"),
            h("span", null, h("kbd", null, "Enter"), " 打开会话"),
            h("span", null, h("kbd", null, "Esc"), " 关闭"),
            h("span", { className: "dsss-sp" }),
            h("span", { className: "dsss-sortgroup" }, "排序 ", sortButton("relevance", "相关度"), sortButton("time", "时间")),
            index !== undefined && index !== null
              ? h("span", null, `${index.sessions} 会话 / ${index.docs} 片段` + (data !== null ? ` · ${data.tookMs}ms` : ""))
              : null,
            h("button", {
              type: "button",
              className: "dsss-btn",
              onClick: () => { setData(null); setBusy(true); fetch(`${API}/search?q=${encodeURIComponent(query)}&sort=${sort}&refresh=1`).then((r) => r.json()).then((v) => { setData(v); setBusy(false); }, () => setBusy(false)); },
            }, "重建索引"),
          ),
        ),
      );
    }
    //#endregion

    //#region sidebar trigger
    function FooterAction({ wide }) {
      const store = React.useContext(StoreContext);
      const open = () => store.set({ open: true });
      return h("button", {
        type: "button",
        className: "dsss-rail",
        title: "搜索历史对话",
        "aria-label": "搜索历史对话",
        onClick: open,
      },
        h("svg", { width: 15, height: 15, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
          h("circle", { cx: 7, cy: 7, r: 4.6, stroke: "currentColor", strokeWidth: 1.5 }),
          h("path", { d: "M10.6 10.6 L14 14", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }),
        ),
        wide ? h("span", null, "搜索对话") : null,
      );
    }
    //#endregion

    const StoreContext = React.createContext(null);

    const inject = ["slots"];

    function apply(ctx) {
      const store = createStore({ open: false });

      /** Open a session through the workspace service, falling back to the sidebar row. */
      const openSession = (sessionId) => {
        const uiWorkspace = ctx.get("uiWorkspace");
        if (uiWorkspace !== undefined && typeof uiWorkspace.openSession === "function") {
          try { uiWorkspace.openSession(sessionId); return; } catch (error) { /* fall through to DOM */ }
        }
        const row = document.querySelector(`[data-row-key="${CSS.escape ? CSS.escape(sessionId) : sessionId}"]`);
        if (row !== null) { row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); return; }
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(sessionId).catch(() => {});
        }
      };

      const host = () => h(StoreContext.Provider, { value: store },
        h(SearchDialog, { store, onClose: () => store.set({ open: false }), onOpenSession: openSession }),
      );

      // The two seats are mounted by different parents, so each one needs its
      // own provider — the footer action cannot read the overlay's context.
      const rail = (props) => h(StoreContext.Provider, { value: store }, h(FooterAction, props));

      const toggle = () => store.set((value) => ({ open: !value.open }));

      ctx.slots.inject("shell.overlay", () => ctx.slots.register({ name: "shell.overlay", id: "session-search", order: 50, label: "搜索历史对话" }, host));
      ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({ name: "sidebar.footer.action", id: "session-search", order: 20, label: "搜索历史对话" }, rail));

      ctx.inject(["shortcuts"], (sctx) => {
        const shortcuts = sctx.get("shortcuts");
        sctx.effect(() => shortcuts.register({
          id: "session-search.open",
          label: () => "搜索历史对话",
          aliases: ["search history", "session search", "历史对话"],
          defaults: {
            "desktop:macos": { code: "KeyK", modifiers: ["primary", "shift"] },
            "desktop:windows": { code: "KeyK", modifiers: ["primary", "shift"] },
            "desktop:linux": { code: "KeyK", modifiers: ["primary", "shift"] },
            "web:macos": { code: "KeyK", modifiers: ["primary", "shift"] },
            "web:windows": { code: "KeyK", modifiers: ["primary", "shift"] },
          },
          regions: ["page", "editable"],
          modals: [],
          resolve: () => ({ status: "handled", run: toggle }),
        }), "session-search: Mod+Shift+K");
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
