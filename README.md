# dsh-session-search

DSH 插件：**真中文子串**历史会话搜索。

DSH 内置的会话搜索（侧栏搜索按钮 / `Mod+K`）后端是 SQLite FTS5 + `unicode61` 分词器，
**不切中文** —— 连续中文串会被当成一个 token，所以搜「会话」「压缩」这类词召回率只有 10~25%。
这个插件绕开 FTS，直接解压本地会话日志做**字面（literal）子串匹配**，中文一个字也能搜到。

## 用法

| 入口 | 说明 |
| --- | --- |
| 侧栏底部「搜索对话」按钮 | 在「设置」按钮旁边 |
| `Mod+Shift+K` | 桌面 `Ctrl+Shift+K` / Web 同 |

面板里输入任意一个字或词即可；多个词用空格分隔表示**同时包含**（AND）。
`↑` `↓` 选择，`Enter` 打开该会话，`Esc` 关闭。
底部「重建索引」按钮强制重新扫描日志（平时索引会自动检测新写入并重建）。

结果底部有 **排序** 开关，两种模式：

| 模式 | 含义 |
| --- | --- |
| 相关度（默认） | 会话按命中权重（`kind` 权重累加）排，命中片段按出现顺序 |
| 时间 | 会话按**最新命中消息**的时间排（最新的会话在最前），会话内片段也按时间倒序；每个会话标题旁显示该时间 |

## 实现

两个半身，**都不需要构建工具链**。

### 宿主半身 `lib/index.js`

- 扫描 `$DSH_HOME/sessions/<工作区>/<会话>/session.v4.jsonl.zstd`。
- **逐帧解压**：会话日志是追加式多帧 zstd，`zlib.zstdDecompressSync(整个文件)` 只解第一帧
  （静默返回头行，不报错）。所以先 `scanFrames()` 按 magic `0xFD2FB528` + descriptor
  + 3 字节 block header 切出帧边界，再逐帧解压拼接。
- 抽取可索引文本（与 DSH 后端对齐）：
  - `user/message` → `data.content` 的 text 块，**只保留 `data.source.kind === "user"`**
    （其余是 runtime-context / skill-catalog / 插件注入等，不过滤会淹没结果）
  - `assistant/message` → `data.message.content` 的 text 块
  - `tool/call` → `name + arguments`
  - `tool/result` → 消息文本 + `error.name/code`
  - `session/title` → 标题（单独一条文档）
- 内存里保持纯文本数组，查询时线性正则扫描。**不需要倒排索引**：
  4.5 万片段全扫一次约 10~30 ms。
- HTTP（`kind: "exact"`）：
  - `GET /dsh-session-search/api/search?q=&limit=20&perSession=3&kinds=&sort=&refresh=1`
    - `sort=relevance`（默认）：会话按命中权重排，会话内片段按出现顺序
    - `sort=time`：会话按最新命中时间排，会话内片段按时间倒序
  - `GET /dsh-session-search/api/status`

### 浏览器半身 `lib/client.js`

手写的 module-loader bundle（`window.__ModuleLoader__.load({id, factory})`），宿主只
`readFileSync` 原样发给浏览器。注册两个 slot + 一个快捷键：

- `shell.overlay`（id `session-search`）→ 搜索面板
- `sidebar.footer.action`（id `session-search`）→ 侧栏触发按钮
- `shortcuts.register({id: "session-search.open", defaults: 全平台 KeyK + primary + shift})`

点击结果跳转优先走 `ctx.get("uiWorkspace").openSession(sessionId)`，
退回点侧栏 `[data-row-key="<sessionId>"]` 行，再退回写剪贴板。

> DSH 没有会话 URL 路由，也没有消息级 DOM 锚点，所以只能定位到**会话**，
> 不能自动滚到具体那一条消息。

## 安装

### 从 GitHub 装（推荐）

```bash
dsh plugin --profile desktop add github:puppet0721/dsh-session-search
```

装完**不用重启**：profile 变了以后 HMR 会自动热重载（见下）。刷新一下页面即可。

### 手动装（PATH 上没有 `dsh`/`pnpm` 时）

profile 的 `package.json` 两处 + 一个 junction：

```jsonc
// C:\Users\30695\.dsh\profiles\desktop\package.json
{
  "dependencies": {
    "dsh-session-search": "link:C:/Users/30695/Documents/deepseek-harness/default-workspace/dsh-session-search"
  },
  "dsh": { "profile": { "bundles": ["...", "dsh-session-search"] } }
}
```

```
mklink /J "C:\Users\30695\.dsh\profiles\desktop\node_modules\dsh-session-search" ^
          "C:\Users\30695\Documents\deepseek-harness\default-workspace\dsh-session-search"
```

`dsh plugin --profile desktop add link:<路径>` 也可以，但本机 PATH 上没有 `dsh`/`pnpm`，
所以是手动改的。

**改完 profile patch 后 HMR 会自动热重载**（实测：写 `cordis.patch.yml` 后
`/plugins/events` 的 graph 从 `entries=73 sessionSearch=false` 变成 `entries=74 sessionSearch=true`），
不用重启 DSH。

> ⚠️ 但**改插件自身的 `lib/*.js` 需要重启 DSH**：宿主在启动时就把模块图固定了，
> 之后 `entry.update` 重新 import 拿到的仍是旧实例。实测无效的手段包括改
> `main`/`exports`、改 patch 里的 `name`（file URL / 新文件名）、加 HMR `config.root`、
> 只碰 mtime。改完源码请重启桌面端。

## 实测数据（本机 156 个会话）

- 索引：45344 片段 / 156 会话 / 88.8 MB zstd，建索引约 10~13 秒（首次请求时现建）
- 查询：`压` 493 处 / 22ms，`会话` 618 处 / 18ms，`插件` 904 处 / 9ms，`zstd` 63 处 / 35ms

## 已知边界

- 索引是**全内存**的（约 12 MB 纯文本 + 开销），每次进程重启后首次查询要重建。
- 只搜未归档会话；子代理会话也在内。
- 片段是纯文本匹配，不做分词；默认按 `kind` 权重排序
  （你 > 标题 > 回复 > 工具 > 结果）再按会话时间，可切换成按时间排序。
