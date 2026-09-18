// we-scene-demo-server-8902.mjs —— **一站式测试台服务**（任务书 P2-2 骨架 + 让测试台在「带后端」模式下真正可用）
//
// 为什么要有第三个端口（用户原话：「我现在打开的离线页面是这样的，怎么去进入一个在线的页面」）：
//   `:8901` 是**纯静态**托管（服务 `demo/` 的产物）⇒ `/api/*` 与 `/diag` 全 404：壁纸库列表、属性保存、
//   删除、打开所在文件夹、渲染器诊断流**全部不可用**（页面自己会在左侧栏写明「静态托管（无 /api 后端）」）。
//   `:8899` 是**渲染器**页（`/`、`/bundle.js`、`/elysia/**`、`/shaders/**`、`/diag`、`/baseline`…），它**没有**测试台要的
//   `/api/*`，也**没有**测试台 iframe 写死的渲染器页路径。两个服务合起来也不构成"带后端的一站式测试台"。
//   本文件就是那第三个端口：**一个 origin 同时提供**「测试台静态面 + 测试台要的 /api/* + 渲染器 iframe 页 +
//   壁纸媒体面 + 诊断流」，且**不碰** :8899/:8901 的任何行为（新增文件，二者照旧可用）。
//
// 用法:
//   node server/we-scene-demo-server-8902.mjs [port] [--library=DIR] [--no-store|--store] [--static-root=DIR]
//   环境变量**优先**（与既有服务同风格：`process.env.X || argv`）：
//     PORT=8902                    端口
//     MPW_ROOT=/path/to/workspace  工作区根（默认 = 本仓库的上一级；决定库根/回收站/reports 的落点）
//     MPW_LIBRARY_DIR=/path/lib    壁纸库根（默认 <MPW_ROOT>/allwallpaper/dd）—— **只读**
//     MPW_REPORTS_DIR=/path/reports 上报根（默认 <MPW_ROOT>/reports）⇒ 属性覆盖落在 <reports>/bench-props/
//     MPW_BENCH_STATIC_DIR=/path/demo 测试台静态面根（默认 <repo>/demo；测试的变异副本靠它指回真树）
//     MPW_BENCH_STORE=1            静态面**不要** no-store（默认 no-store，与 :8901 同口径）
//     MPW_OPEN_CMD=/bin/true       `/api/reveal` 用的"打开器"（默认按 termux-open → xdg-open → open 查找）
//     MPW_LIMIT_*                  与 :8899 同名的上限变量在这里**不复用**（本服务只写属性覆盖文件，见 PROPS 上限）
//
// 一个 origin 提供的东西（逐条都对着产物里的**调用方**，不是猜的；证据见 docs/BENCH-8902.md）：
//   ① 静态测试台：`/` → `demo/index.html`；`demo/` 同时挂在 `/`（因产物 HTML 是 `<base href="./">` + `./assets/…`）、
//      `/demo/`、`/WEwebLoader/`、`/wallpaper-engine-webgl/` 四个挂载点下 —— 最后一个是**必需**的：
//      `demo/assets/bench-DSKWIqmS.js` 里 iframe 的 `k.src` 写死 `/wallpaper-engine-webgl/renderer/index.html?…`（3 处）。
//      静态面 no-store（`Cache-Control: no-store, must-revalidate`，与 :8901 逐字同口径）。
//   ② 媒体面：`/media/dev/<itemId>/<file>`（scene.pkg / preview.gif / 视频…，renderer bundle 的 `l1()` 依次试
//      `scene.pkg`、`scenes/scene.pkg`、`gifscene.pkg`，并取 `<mediaBase>/<src>/project.json`）与
//      `/web/dev/<itemId>/<file>`（web 类壁纸 iframe 的 src）—— 都是**库根内只读**，支持 Range（视频/拖动进度必需）。
//   ③ 8 个 `/api/*`（形状以调用方为准，逐条证据见 docs/BENCH-8902.md §2）：
//      GET  /api/library     列表：{dir, items:[{itemId,title,type,hasScene,file,preview,properties,dir,kind}]}
//      POST /api/library-dir 选择/收窄库根：{pick:true}⇒降级（见下）；{dir}⇒库根内的子目录；GET ⇒ 枚举子目录
//      GET  /api/props       属性表：?item=<id> ⇒ {props:[描述子…]}（描述子字段=调用方读的那些）
//      POST /api/props       保存覆盖：?item=<id>，body={属性名:值} ⇒ 落 <reports>/bench-props/<id>.json（**不写进壁纸包**）
//      POST /api/props-dir   目录型属性：{pick:true}⇒降级；GET 枚举 / POST {dir} 取库根内的绝对目录
//      POST /api/props-file  文件型属性导入：?item=&name= + `X-Filename` 头 + 原始 body ⇒ 落 reports 并回可回读的 value
//      POST /api/delete      删除：**默认 dryRun**（只回计划，绝不移动）；`?confirm=1` 才移到 <MPW_ROOT>/Delete/bench-trash/<ts>/
//      POST /api/reveal      打开所在文件夹：先做库根内校验；找不到打开器 ⇒ **501 + 说明**（绝不成 500）
//      GET  /api/diag-stream SSE：`data: {"msg":…}\n\n`（调用方 `JSON.parse(e.data)` 后取 `.msg`）
//   ④ 诊断来源（**本服务自己维护环形缓冲**这条路，没代理 :8899）：renderer bundle 的 `ce()` 用
//      `new Image().src = `${origin}/diag?msg=…``（origin 取自 `mediaBase`）上报 ⇒ 本服务接 `GET /diag?msg=`（回 1×1 gif，
//      图片不报错）与 `POST /diag`（JSON），进环形缓冲（上限 200 条）并广播给所有 `/api/diag-stream` 订阅者。
//   ⑤ `GET /__health` 自述：端口/库根/能力清单/**哪些端点降级为 501 及原因**/诊断缓冲条数。
//
// 安全红线（本文件里只有一条路径判据 `safeJoin()`，全部读写/删除/打开都必须过它）：
//   · 一律**规范化后前缀校验**（`path.relative` 判根内）→ 越界 403；相对路径里出现 `..` 直接 400；
//   · 再对**真身**做一次校验（`realpathSync` 逐级回溯）⇒ 符号链接逃逸也 403；
//   · `itemId` 只允许**单个路径段**（`/^[A-Za-z0-9][A-Za-z0-9._-]*$/`）⇒ `../`、绝对路径、`a/b` 连第一关都过不去；
//   · **没有**任何"任意路径读/写"端点：库根内的读只有 `/api/library`、`/api/props`(读 project.json)、
//     `/media/dev/**`、`/web/dev/**`；写只有 <reports>/bench-props/**（属性覆盖）与 <MPW_ROOT>/Delete/bench-trash/**（删除）。
//   · 删除**默认 dryRun**（响应里回 from/to 与"要移多少文件/字节"的计划）；真删=移到回收站（`?confirm=1`），响应回
//     回收站路径 ⇒ 一条 `mv` 即可回滚（文档里给了命令）。
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

// ── CLI 参数（环境变量优先，与 :8899 同风格：`process.env.X || argv`）───────────────────────────────
const argv = process.argv.slice(2)
const flag = (name) => argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
const flagVal = (name) => {
  const f = flag(name)
  if (!f) return undefined
  const eq = f.indexOf('=')
  return eq === -1 ? true : f.slice(eq + 1)
}
const positional = argv.filter((a) => !a.startsWith('--'))
const PORT = Number(process.env.PORT || positional[0] || 8902)
const MPW_ROOT = path.resolve(process.env.MPW_ROOT || path.resolve(REPO_ROOT, '..'))
const LIBRARY_ROOT_CONFIG = path.resolve(
  process.env.MPW_LIBRARY_DIR || (typeof flagVal('library') === 'string' ? flagVal('library') : '') || path.join(MPW_ROOT, 'allwallpaper', 'dd'),
)
const REPORTS_DIR = path.resolve(process.env.MPW_REPORTS_DIR || path.join(MPW_ROOT, 'reports'))
const PROPS_DIR = path.join(REPORTS_DIR, 'bench-props')
const TRASH_ROOT = path.join(MPW_ROOT, 'Delete', 'bench-trash')
const STATIC_ROOT = path.resolve(process.env.MPW_BENCH_STATIC_DIR || (typeof flagVal('static-root') === 'string' ? flagVal('static-root') : '') || path.join(REPO_ROOT, 'demo'))
// no-store 默认开（:8901 口径）；`--no-store` 显式、`--store` 或 MPW_BENCH_STORE=1 关闭（环境变量优先）
const STORE = process.env.MPW_BENCH_STORE === '1' ? true
  : process.env.MPW_BENCH_STORE === '0' ? false
    : flag('no-store') ? false
      : flagVal('store') === true
const STARTED_AT = new Date().toISOString()
const OPEN_CMD_ENV = process.env.MPW_OPEN_CMD || ''
// 上限（安全：所有落盘都要有上限；属性覆盖很小，这里给的是"单文件/单次请求"硬顶）
const LIMITS = {
  propsFileBytes: 64 * 1024 * 1024,   // 单次 props-file 上传 ≤64MB
  propsJsonBytes: 2 * 1024 * 1024,    // 单次 props 保存 body ≤2MB
  bodyBytes: 2 * 1024 * 1024,         // 其它 JSON body ≤2MB
  listItems: 5000,                    // /api/library 最多列 5000 项（防病态目录把响应撑爆）
  diagBuffer: 200,                    // 诊断环形缓冲条数（内存，不落盘）
  diagMsgChars: 2000,                 // 单条诊断消息截断长度
}

// ── 小工具 ──────────────────────────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.pkg': 'application/octet-stream', '.mpkg': 'application/octet-stream', '.bin': 'application/octet-stream',
  '.tex': 'application/octet-stream', '.zip': 'application/zip',
}
const mimeOf = (p) => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream'
const NO_STORE = 'no-store, must-revalidate'
function statSafe(p) { try { return fs.statSync(p) } catch { return null } }
function lstatSafe(p) { try { return fs.lstatSync(p) } catch { return null } }
function mkdirSafe(p) { try { fs.mkdirSync(p, { recursive: true }) } catch { /* 见调用点 */ } }

/** HTTP 错误：`status` 决定响应码；**一律不抛 500**（调用方要么按 error 文案显示，要么按非 2xx 抛错）。 */
class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || null }
}
const bad = (msg, extra) => new HttpError(400, msg, extra)
const forbidden = (msg, extra) => new HttpError(403, msg, extra)
const notFound = (msg, extra) => new HttpError(404, msg, extra)

function json(res, status, body, headers) {
  const text = JSON.stringify(body, null, 1)
  const h = Object.assign(
    { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': NO_STORE, 'X-Bench-Server': 'we-scene-demo-8902' },
    headers || {},
  )
  res.writeHead(status, h)
  res.end(text)
}
const jsonOk = (res, body, headers) => json(res, 200, Object.assign({ ok: true }, body || {}), headers)
const jsonErr = (res, e) => {
  const status = e instanceof HttpError ? e.status : 500
  const body = Object.assign({ ok: false, error: e && e.message ? e.message : String(e) }, e instanceof HttpError ? e.extra || {} : {})
  json(res, status, body)
}
const readBody = (req, cap) => new Promise((resolve, reject) => {
  const chunks = []
  let size = 0
  req.on('data', (c) => {
    size += c.length
    if (size > cap) { reject(new HttpError(413, `请求体超过上限 ${cap} 字节`)); req.destroy(); return }
    chunks.push(c)
  })
  req.on('end', () => resolve(Buffer.concat(chunks)))
  req.on('error', reject)
})
async function readJsonBody(req, cap) {
  const buf = await readBody(req, cap)
  if (!buf.length) return {}
  const text = buf.toString('utf8').replace(/^\uFEFF/, '')
  try {
    const v = JSON.parse(text)
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad('JSON body 必须是对象')
    return v
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw bad(`JSON 解析失败：${e.message}`)
  }
}

// ── 路径安全：唯一判据 ───────────────────────────────────────────────────────────────────────────
/** 前缀校验（规范化后）：p 必须在 root 内（root 自己算"内"）。 */
function isInside(root, p) {
  const rel = path.relative(root, p)
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel))
}
/** 取"最长存在前缀"的真实路径 + 未存在尾部（逐级回溯；缺失路径也能校验真身）。 */
function realpathDeepest(p) {
  let cur = path.resolve(p)
  const tail = []
  for (;;) {
    try {
      const real = fs.realpathSync(cur)
      return tail.length ? path.join(real, ...tail.slice().reverse()) : real
    } catch {
      const parent = path.dirname(cur)
      if (parent === cur) return path.resolve(cur, ...tail.slice().reverse())
      tail.push(path.basename(cur))
      cur = parent
    }
  }
}
/**
 * 库根内的路径解析（**唯一**入口）：相对路径里出现 `..` ⇒ 400；解析后越根 ⇒ 403；
 * 真身（realpath）越根 ⇒ 403（符号链接逃逸）。返回**词法**规范化路径（真身已验证在根内）。
 */
function safeJoin(rootReal, input, label) {
  const what = label || 'path'
  if (typeof input !== 'string' || !input) throw bad(`缺少 ${what}`)
  if (input.includes('\0')) throw bad(`${what} 含 NUL`)
  const dec = (() => { try { return decodeURIComponent(input) } catch { return input } })()
  if (dec.includes('\0')) throw bad(`${what} 含 NUL`)
  let norm
  if (path.isAbsolute(dec)) {
    norm = path.resolve(dec)
  } else {
    if (dec.split(/[\\/]+/).includes('..')) throw bad(`${what} 含 ".."：${input}`)
    norm = path.resolve(rootReal, dec)
  }
  if (!isInside(rootReal, norm)) throw forbidden(`${what} 越出库根：${input}`)
  const real = realpathDeepest(norm)
  if (!isInside(rootReal, real)) throw forbidden(`${what} 经符号链接越出库根：${input}`)
  return norm
}
/** itemId = **单个路径段**（工坊 id 是数字；夹具用简单名）⇒ `../`、绝对路径、`a/b` 全在 400。 */
const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
function assertItemId(id) {
  if (typeof id !== 'string' || !id) throw bad('缺少 itemId')
  if (id === '.' || id === '..' || !ITEM_ID_RE.test(id)) throw bad(`itemId 非法（只允许单个路径段 [A-Za-z0-9._-]）：${String(id).slice(0, 120)}`)
  return id
}
/** 属性名：WE 作者自定（`newproperty12`、`schemecolor`…）⇒ 同样只允许单段。 */
const PROP_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/
function assertPropName(n) {
  if (typeof n !== 'string' || !n) throw bad('缺少属性名 name')
  if (n === '.' || n === '..' || !PROP_NAME_RE.test(n)) throw bad(`属性名非法：${String(n).slice(0, 120)}`)
  return n
}
/** 上传文件名：只取 basename，且必须仍是单段（拒绝 `..`、分隔符、绝对路径）。 */
function assertFileName(raw, label) {
  const s = String(raw == null ? '' : raw)
  if (!s) throw bad(`缺少 ${label || '文件名'}`)
  if (s.includes('\0') || /[\\/]/.test(s)) throw bad(`${label || '文件名'} 不能含路径分隔符：${s.slice(0, 120)}`)
  if (s === '.' || s === '..') throw bad(`${label || '文件名'} 非法：${s}`)
  return s
}

// 库根：配置值可能不存在 ⇒ 真身只在存在时算；所有校验都用"真身或词法根"
const LIBRARY_ROOT_REAL = (() => {
  try { return fs.realpathSync(LIBRARY_ROOT_CONFIG) } catch { return LIBRARY_ROOT_CONFIG }
})()
// 静态面允许的根（真身）：demo/ 自身 + demo/samples 软链指向的真身（`samples -> ../samples`，仓库自带合成样例）
const STATIC_ROOTS = (() => {
  const out = []
  try { out.push(fs.realpathSync(STATIC_ROOT)) } catch { out.push(STATIC_ROOT) }
  for (const cand of [path.join(STATIC_ROOT, 'samples')]) {
    try { const r = fs.realpathSync(cand); if (!out.includes(r)) out.push(r) } catch { /* 没有就没有 */ }
  }
  return out
})()
// 活动库根（可在库根内**收窄**到子目录；绝不越出配置的库根）
let activeRoot = LIBRARY_ROOT_REAL
const itemDirReal = (id) => path.join(activeRoot, assertItemId(id))

// ── 诊断环形缓冲（本服务自己的数据源，不代理 :8899）────────────────────────────────────────────
const diagBuffer = []
let diagSeq = 0
const sseClients = new Set()
function recordDiag(msg, level, source) {
  const text = String(msg == null ? '' : msg).slice(0, LIMITS.diagMsgChars)
  if (!text) return null
  const evt = { seq: ++diagSeq, ts: Date.now(), msg: text, level: level || (/fail|error|ERROR|失败/.test(text) ? 'error' : 'info'), source: source || 'bench' }
  diagBuffer.push(evt)
  while (diagBuffer.length > LIMITS.diagBuffer) diagBuffer.shift()
  const line = `data: ${JSON.stringify(evt)}\n\n`
  for (const c of sseClients) { try { c.write(line) } catch { /* 断开的连接由 close 事件清理 */ } }
  return evt
}
const GIF_1x1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

// ── /api/library：列表（只读）────────────────────────────────────────────────────────────────────
function readProjectJson(dir) {
  const p = path.join(dir, 'project.json')
  const st = statSafe(p)
  if (!st || !st.isFile()) return null
  try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}
const SCENE_CANDIDATES = ['scene.pkg', 'scenes/scene.pkg', 'gifscene.pkg']   // 与 renderer bundle 的 `c1` 逐字一致
const VIDEO_EXT = ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v']
function pickFirstFile(dir, preds, cap) {
  const names = listDirNames(dir, cap || 400)
  for (const pred of preds) { const hit = names.find(pred); if (hit) return hit }
  return null
}
function listDirNames(dir, cap) {
  let names = []
  try { names = fs.readdirSync(dir) } catch { return [] }
  names.sort()
  return cap ? names.slice(0, cap) : names
}
function hasScenePkg(dir) {
  for (const rel of SCENE_CANDIDATES) { const st = statSafe(path.join(dir, rel)); if (st && st.isFile()) return rel }
  return null
}
function previewName(dir, project) {
  const cands = []
  if (project && typeof project.preview === 'string' && project.preview) cands.push(path.basename(project.preview))
  cands.push('preview.gif', 'preview.jpg', 'preview.jpeg', 'preview.png', 'preview.webp')
  for (const c of cands) { const st = statSafe(path.join(dir, c)); if (st && st.isFile()) return c }
  return null
}
/** 一个库项 → 调用方要的形状（证据：bundle 的 `rt()`/`wt()`/列表渲染 + patch 的 `brandingForItemId()`）。 */
function libraryItem(id) {
  const dir = itemDirReal(id)
  const st = statSafe(dir)
  if (!st || !st.isDirectory()) return null
  const real = realpathDeepest(dir)
  if (!isInside(activeRoot, real)) throw forbidden(`条目经符号链接越出库根：${id}`)
  const project = readProjectJson(dir) || {}
  const sceneRel = hasScenePkg(dir)
  const typeRaw = String(project.type == null ? '' : project.type).trim()
  const lower = typeRaw.toLowerCase()
  const file = (() => {
    if (typeof project.file === 'string' && project.file) return project.file
    if (sceneRel) return 'scene.pkg'
    if (lower === 'web') return 'index.html'
    const vid = pickFirstFile(dir, [(n) => VIDEO_EXT.includes(path.extname(n).toLowerCase())])
    if (vid) return vid
    return null
  })()
  const type = typeRaw || (sceneRel ? 'scene' : lower === 'web' ? 'web' : file && VIDEO_EXT.includes(path.extname(file).toLowerCase()) ? 'video' : 'unknown')
  const hasScene = !!sceneRel
  return {
    itemId: id,
    dir: id,                                    // 相对库根（不把绝对路径塞满列表；`/api/library` 的 `dir` 字段才是绝对根）
    title: String(project.title == null ? '' : project.title).trim() || id,
    type,
    hasScene,
    file,
    preview: previewName(dir, project),
    scenePkg: sceneRel,                          // 命中哪一个（`scene.pkg` / `scenes/scene.pkg` / `gifscene.pkg`）
    // ⚠ patch 的 `propertiesForItemId()` 直接把这一项交给 `dragPropsToDisable()`（读 `v.type` / `v.text`）
    //   ⇒ 这里给的是 project.json 里的**原始 map**（不是 /api/props 的描述子数组）
    properties: (project.general && project.general.properties && typeof project.general.properties === 'object') ? project.general.properties : null,
    kind: hasScene ? 'scene' : (lower === 'web' ? 'web' : (lower === 'video' || lower === 'gif') ? 'video' : null),
    workshopid: project.workshopid == null ? null : String(project.workshopid),
  }
}
function listLibrary() {
  if (!statSafe(activeRoot)) return { dir: activeRoot, items: [], missing: true, error: `壁纸库根不存在或不可读：${activeRoot}` }
  const ids = []
  for (const name of listDirNames(activeRoot)) {
    if (name.startsWith('.')) continue
    if (ids.length >= LIMITS.listItems) break
    const full = path.join(activeRoot, name)
    const st = statSafe(full)                     // follow symlink + 真身校验（Dirent.isFile 在本机有误报 ⇒ 一律 statSync）
    if (!st || !st.isDirectory()) continue
    if (!ITEM_ID_RE.test(name)) continue
    try { const it = libraryItem(name); if (it) ids.push(it) } catch { /* 越界的符号链接条目：跳过（不是整表报错） */ }
  }
  return { dir: activeRoot, configuredDir: LIBRARY_ROOT_CONFIG, items: ids, count: ids.length }
}

// ── /api/props：描述子（形状完全按调用方读的字段）─────────────────────────────────────────────────
/** 从 WE 的 HTML 文案里抽 media（调用方 `St()` 渲染 `{src, href}`；`fn()` 把相对 src 解析成
 *  `${mediaBase}/${itemId}/${src}`）——本服务只**如实搬运**，不做任何下载。 */
function extractMedia(html) {
  const text = String(html || '')
  const out = []
  const imgRe = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  let m
  while ((m = imgRe.exec(text))) {
    const src = (m[1] || m[2] || m[3] || '').trim()
    if (!src) continue
    const before = text.slice(0, m.index)
    const lastClose = before.toLowerCase().lastIndexOf('</a>')
    let href = ''
    const aRe = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
    let am
    while ((am = aRe.exec(before))) {
      if (am.index > lastClose) href = (am[1] || am[2] || am[3] || '').trim()
    }
    out.push(href ? { src, href } : { src })
  }
  return out
}
const HTML_HINT_RE = /^\s*(imgsrc|ahref|hrbig|brahref)/i     // 与调用方 `Be()` 同口径：这种 text 不当标题用
/** WE `general.properties`（**map**）→ 调用方要的**扁平数组**（group 是分隔项，之后的项属于它 —— 调用方自己分组）。 */
function buildProps(dir, overrides) {
  const project = readProjectJson(dir)
  const raw = project && project.general && project.general.properties
  if (!raw || typeof raw !== 'object') return []
  const keys = Object.keys(raw)
  const orderOf = (k, i) => {
    const d = raw[k] || {}
    const o = Number(d.order)
    if (Number.isFinite(o)) return o
    const idx = Number(d.index)
    if (Number.isFinite(idx)) return 100 + idx
    return 1000 + i
  }
  const sorted = keys.map((k, i) => ({ k, o: orderOf(k, i) })).sort((a, b) => (a.o - b.o) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
  const out = []
  for (const { k } of sorted) {
    const d = raw[k] && typeof raw[k] === 'object' ? raw[k] : {}
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, k)
    const def = Object.prototype.hasOwnProperty.call(d, 'value') ? d.value : null
    const desc = {
      name: k,
      text: d.text == null ? '' : String(d.text),
      ptype: d.type == null || d.type === '' ? 'text' : String(d.type),
      value: hasOverride ? overrides[k] : def,
      default: def,
      overridden: hasOverride,
    }
    if (d.condition) desc.condition = String(d.condition)
    const media = extractMedia(desc.text)
    if (media.length) desc.media = media
    for (const f of ['min', 'max', 'precision', 'step']) if (d[f] != null && Number.isFinite(Number(d[f]))) desc[f] = Number(d[f])
    if (Array.isArray(d.options)) desc.options = d.options
    if (d.fileType) desc.fileType = String(d.fileType)
    if (Array.isArray(d.filters)) desc.filters = d.filters
    out.push(desc)
  }
  return out
}
// 属性覆盖：落 <reports>/bench-props/<id>.json（**绝不写进壁纸包** —— 库里只有 project.json 是读的）
const propsFileFor = (id) => path.join(PROPS_DIR, `${assertItemId(id)}.json`)
function readOverrides(id) {
  const p = propsFileFor(id)
  const st = statSafe(p)
  if (!st || !st.isFile()) return {}
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
    const o = j && typeof j === 'object' ? (j.overrides && typeof j.overrides === 'object' ? j.overrides : j) : {}
    const out = {}
    for (const [k, v] of Object.entries(o)) {
      if (typeof k !== 'string' || !PROP_NAME_RE.test(k)) continue
      if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) out[k] = v
    }
    return out
  } catch { return {} }
}
function writeOverrides(id, overrides) {
  const p = propsFileFor(id)
  mkdirSafe(PROPS_DIR)
  const body = JSON.stringify({ itemId: id, savedAt: new Date().toISOString(), libraryRoot: activeRoot, overrides }, null, 1)
  const tmp = `${p}.tmp-${process.pid}`
  fs.writeFileSync(tmp, body)
  fs.renameSync(tmp, p)     // 原子落盘：半个 JSON 不会留在盘上
  return p
}

// ── /api/delete：默认 dryRun；真删=移进回收站 ─────────────────────────────────────────────────────
function collectPlan(root) {
  const files = []
  let bytes = 0
  const walk = (p) => {
    const st = lstatSafe(p)
    if (!st) return
    if (st.isSymbolicLink()) { files.push({ rel: path.relative(root, p), link: true, size: 0 }); return }
    if (st.isDirectory()) { for (const n of listDirNames(p)) walk(path.join(p, n)); return }
    if (st.isFile()) { files.push({ rel: path.relative(root, p), size: st.size }); bytes += st.size }
  }
  walk(root)
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  return { files, bytes, count: files.length }
}
function moveToTrash(itemId, fromDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const destRoot = path.join(TRASH_ROOT, stamp)
  mkdirSafe(destRoot)
  const to = path.join(destRoot, itemId)
  if (statSafe(to)) throw new HttpError(409, `回收站目标已存在：${to}`)
  try {
    fs.renameSync(fromDir, to)
  } catch (e) {
    if (e && e.code === 'EXDEV') {
      fs.cpSync(fromDir, to, { recursive: true, dereference: false, force: false, errorOnExist: false })
      fs.rmSync(fromDir, { recursive: true, force: true })
    } else throw e
  }
  return { to, trashRoot: destRoot }
}

// ── /api/reveal：先库根校验，再找打开器（找不到 501，绝不成 500）──────────────────────────────────
function isExecutableFile(p) {
  const st = statSafe(p)
  if (!st || !st.isFile()) return false
  try { fs.accessSync(p, fs.constants.X_OK); return true } catch { return false }
}
function whichSync(cmd) {
  if (cmd.includes(path.sep)) return isExecutableFile(path.resolve(cmd)) ? path.resolve(cmd) : null
  for (const d of String(process.env.PATH || '').split(path.delimiter)) {
    if (!d) continue
    const p = path.join(d, cmd)
    if (isExecutableFile(p)) return p
  }
  return null
}
function findOpener() {
  const cands = [OPEN_CMD_ENV, 'termux-open', 'xdg-open', 'open'].filter(Boolean)
  for (const c of cands) { const hit = whichSync(c); if (hit) return { cmd: c, path: hit } }
  return null
}
function spawnDetached(opener, args) {
  return new Promise((resolve) => {
    let settled = false
    const done = (r) => { if (!settled) { settled = true; resolve(r) } }
    try {
      const child = spawn(opener, args, { detached: true, stdio: 'ignore' })
      child.on('error', (e) => done({ ok: false, code: (e && e.code) || 'SPAWN_ERROR', message: e && e.message }))
      child.unref()
      setTimeout(() => done({ ok: true }), 150)
    } catch (e) {
      done({ ok: false, code: (e && e.code) || 'SPAWN_THROW', message: e && e.message })
    }
  })
}

// ── 静态面 ──────────────────────────────────────────────────────────────────────────────────────
const MOUNTS = ['/demo', '/WEwebLoader', '/wallpaper-engine-webgl', '']   // `''` = 直接挂根（产物 HTML 是 <base href="./">）
function mapStatic(pathname) {
  for (const m of MOUNTS) {
    if (m === '') continue
    if (pathname === m) return { rel: '', redirect: pathname + '/' }
    if (pathname.startsWith(m + '/')) return { rel: pathname.slice(m.length + 1) }
  }
  return { rel: pathname.replace(/^\/+/, '') }
}
function staticTarget(relPath) {
  const dec = (() => { try { return decodeURIComponent(relPath) } catch { throw bad('URL 解码失败') } })()
  if (dec.includes('\0')) throw bad('路径含 NUL')
  const norm = path.resolve(STATIC_ROOT, dec)
  const real = realpathDeepest(norm)
  const ok = STATIC_ROOTS.some((root) => isInside(root, real))
  if (!ok) throw forbidden(`静态路径越出静态根：/${relPath}`)
  return norm
}
function sendFile(req, res, file, opts) {
  const st = statSafe(file)
  if (!st || !st.isFile()) return false
  const headers = Object.assign({
    'Content-Type': mimeOf(file),
    'Cache-Control': STORE ? 'no-cache' : NO_STORE,
    'Accept-Ranges': 'bytes',
    'X-Bench-Server': 'we-scene-demo-8902',
  }, (opts && opts.headers) || {})
  const range = req.headers.range
  let status = 200
  let start = 0
  let end = st.size - 1
  if (range && /^bytes=/.test(range)) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
    if (m) {
      const hasA = m[1] !== ''
      const hasB = m[2] !== ''
      if (hasA && hasB) { start = Number(m[1]); end = Number(m[2]) }
      else if (hasA) { start = Number(m[1]); end = st.size - 1 }
      else if (hasB) { start = Math.max(0, st.size - Number(m[2])); end = st.size - 1 }
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}`, 'Cache-Control': NO_STORE })
        res.end()
        return true
      }
      end = Math.min(end, st.size - 1)
      status = 206
      headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`
    }
  }
  headers['Content-Length'] = String(end - start + 1)
  res.writeHead(status, headers)
  if (req.method === 'HEAD') { res.end(); return true }
  const stream = fs.createReadStream(file, { start, end })
  stream.on('error', () => { try { res.destroy() } catch { /* 已断开 */ } })
  stream.pipe(res)
  return true
}

// ── 路由 ────────────────────────────────────────────────────────────────────────────────────────
async function handleApi(req, res, url) {
  const p = url.pathname
  const q = url.searchParams

  // ① GET /api/library —— 列表（只读）
  if (p === '/api/library' && (req.method === 'GET' || req.method === 'HEAD')) {
    return jsonOk(res, listLibrary())
  }

  // ② /api/library-dir —— 选择库根：{pick:true} 降级；{dir} 是**库根内**收窄；GET 枚举子目录
  if (p === '/api/library-dir') {
    if (req.method === 'GET') {
      const dir = safeJoin(LIBRARY_ROOT_REAL, q.get('dir') || '.', 'dir')
      const dirs = []
      for (const n of listDirNames(dir)) {
        if (n.startsWith('.')) continue
        const sub = path.join(dir, n)
        const st = statSafe(sub)
        if (!st || !st.isDirectory()) continue
        if (!isInside(LIBRARY_ROOT_REAL, realpathDeepest(sub))) continue   // 逃逸的符号链接**不列出来**
        dirs.push({ name: n, path: path.relative(LIBRARY_ROOT_REAL, sub) })
      }
      return jsonOk(res, { dir, root: LIBRARY_ROOT_REAL, activeDir: activeRoot, dirs, count: dirs.length, picker: 'unsupported' })
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req, LIMITS.bodyBytes)
      if (body.pick) {
        // 没有 Electron/宿主对话框 ⇒ 明确降级。**注意 HTTP 码**：调用方是
        //   `if(!e.ok||t.error) throw` … `if(t.cancelled){ if(!t.unsupported) return; window.prompt(...) }`
        //   —— 非 2xx 会**掐掉**它自己的 prompt 回退 ⇒ 这里回 200 + {cancelled:true, unsupported:true, degraded:true}，
        //   并把"能力状态 501"如实写进 body.degradedStatus 与 /__health.degraded[]（不假装成功：cancelled=true）。
        const reason = '本服务没有宿主对话框（不是 Electron/termux 宿主）：无法弹系统"选择文件夹"'
        recordDiag(`bench: 选择文件夹降级（501 能力）—— ${reason}；页面会用 window.prompt 让用户手输路径`, 'info', 'library-dir')
        return jsonOk(res, {
          cancelled: true, unsupported: true, degraded: true, degradedStatus: 501, picker: 'unsupported',
          reason, hint: '在提示框里输入库根内的绝对/相对路径（或用启动参数 --library=DIR / MPW_LIBRARY_DIR）',
          dir: activeRoot, configuredDir: LIBRARY_ROOT_CONFIG,
        })
      }
      if (body.reset) { activeRoot = LIBRARY_ROOT_REAL; return jsonOk(res, { dir: activeRoot, reset: true, root: LIBRARY_ROOT_REAL }) }
      if (typeof body.dir === 'string' && body.dir) {
        const target = safeJoin(LIBRARY_ROOT_REAL, body.dir, 'dir')
        const st = statSafe(target)
        if (!st || !st.isDirectory()) throw notFound(`目录不存在：${body.dir}`)
        activeRoot = target
        recordDiag(`bench: 壁纸库根收窄到 ${activeRoot}（仍在配置库根内）`, 'info', 'library-dir')
        return jsonOk(res, { dir: activeRoot, root: LIBRARY_ROOT_REAL, narrowed: activeRoot !== LIBRARY_ROOT_REAL })
      }
      throw bad('需要 {pick:true} 或 {dir:"库根内的路径"}')
    }
  }

  // ③ GET/POST /api/props —— 读属性表 / 保存覆盖（覆盖落在 reports，**不写进壁纸包**）
  if (p === '/api/props') {
    const item = assertItemId(q.get('item') || '')
    const dir = itemDirReal(item)
    const st = statSafe(dir)
    if (!st || !st.isDirectory()) throw notFound(`壁纸不存在：${item}`)
    const real = realpathDeepest(dir)
    if (!isInside(activeRoot, real)) throw forbidden(`条目经符号链接越出库根：${item}`)
    if (req.method === 'GET' || req.method === 'HEAD') {
      const overrides = readOverrides(item)
      const props = buildProps(dir, overrides)
      return jsonOk(res, {
        item, itemId: item, props, overridden: overrides, propsFile: propsFileFor(item),
        declared: props.length, overriddenCount: Object.keys(overrides).length,
        projectJson: !!readProjectJson(dir),
      })
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req, LIMITS.propsJsonBytes)
      const overrides = {}
      for (const [k, v] of Object.entries(body)) {
        assertPropName(k)
        if (v === null || !['string', 'number', 'boolean'].includes(typeof v)) throw bad(`属性 ${k} 的值只允许 string/number/boolean/null`)
        if (v !== null) overrides[k] = v
      }
      const file = writeOverrides(item, overrides)
      recordDiag(`bench: 属性保存 ${item}（${Object.keys(overrides).length} 项覆盖）→ ${file}`, 'info', 'props')
      return jsonOk(res, { item: item, itemId: item, saved: overrides, count: Object.keys(overrides).length, propsFile: file, wroteIntoWallpaper: false })
    }
  }

  // ④ /api/props-dir —— 目录型属性：{pick:true} 降级；GET 枚举库根内目录；POST {dir} 取绝对目录
  if (p === '/api/props-dir') {
    if (req.method === 'GET') {
      const item = q.get('item') ? assertItemId(q.get('item')) : null
      const base = item ? itemDirReal(item) : activeRoot
      const st = statSafe(base)
      if (!st || !st.isDirectory()) throw notFound(`目录不存在：${item || activeRoot}`)
      const dir = safeJoin(LIBRARY_ROOT_REAL, q.get('dir') || path.relative(LIBRARY_ROOT_REAL, base) || '.', 'dir')
      const dirs = []
      for (const n of listDirNames(dir)) {
        if (n.startsWith('.')) continue
        const sub = path.join(dir, n)
        const s2 = statSafe(sub)
        if (!s2 || !s2.isDirectory()) continue
        if (!isInside(LIBRARY_ROOT_REAL, realpathDeepest(sub))) continue   // 逃逸的符号链接不列出来
        dirs.push({ name: n, path: path.relative(LIBRARY_ROOT_REAL, sub) })
      }
      return jsonOk(res, { item, dir, root: LIBRARY_ROOT_REAL, dirs, count: dirs.length })
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req, LIMITS.bodyBytes)
      if (body.pick) {
        const reason = '没有宿主对话框：无法弹系统"选择目录"（调用方随后用 window.prompt 让用户手输绝对路径）'
        recordDiag(`bench: 目录型属性选择器降级（501 能力）—— ${reason}`, 'info', 'props-dir')
        return jsonOk(res, {
          cancelled: true, unsupported: true, degraded: true, degradedStatus: 501, picker: 'unsupported',
          reason, hint: '直接输入绝对路径；本服务不校验该属性值（它只是写进属性覆盖文件的一个字符串）',
        })
      }
      if (typeof body.dir === 'string' && body.dir) {
        const target = safeJoin(LIBRARY_ROOT_REAL, body.dir, 'dir')
        const st = statSafe(target)
        if (!st || !st.isDirectory()) throw notFound(`目录不存在：${body.dir}`)
        return jsonOk(res, { item: body.item ? assertItemId(body.item) : null, name: body.name ? assertPropName(body.name) : null, dir: target, value: target })
      }
      throw bad('需要 {pick:true} 或 {dir:"库根内的路径"}')
    }
  }

  // ⑤ /api/props-file —— 文件型属性导入（写 reports/bench-props/files/**，**不写进壁纸包**）
  //    GET 的形状是 `/api/props-file/<itemId>/<name>/<filename>`（回读）⇒ 这里必须按**前缀**匹配，
  //    只按相等匹配会让回读落到"未知端点"404（实测踩到）。
  if (p === '/api/props-file' || p.startsWith('/api/props-file/')) {
    if (req.method === 'GET') {
      // 回读：/api/props-file/<itemId>/<name>/<filename>
      const segs = p.split('/').filter(Boolean).slice(2).map((s) => { try { return decodeURIComponent(s) } catch { throw bad('URL 解码失败') } })
      if (segs.length !== 3) throw bad('形状：/api/props-file/<itemId>/<name>/<filename>')
      const [item, name, file] = [assertItemId(segs[0]), assertPropName(segs[1]), assertFileName(segs[2], '文件名')]
      const target = path.join(PROPS_DIR, 'files', item, name, file)
      const st = statSafe(target)
      if (!st || !st.isFile()) throw notFound(`未导入过该文件：${item}/${name}/${file}`)
      res.writeHead(200, { 'Content-Type': mimeOf(target), 'Content-Length': String(st.size), 'Cache-Control': NO_STORE, 'X-Bench-Server': 'we-scene-demo-8902' })
      if (req.method === 'HEAD') return res.end()
      return fs.createReadStream(target).pipe(res)
    }
    if (req.method === 'POST') {
      const item = assertItemId(q.get('item') || '')
      const name = assertPropName(q.get('name') || '')
      const dir = itemDirReal(item)
      if (!statSafe(dir)) throw notFound(`壁纸不存在：${item}`)
      const real = realpathDeepest(dir)
      if (!isInside(activeRoot, real)) throw forbidden(`条目经符号链接越出库根：${item}`)
      let rawName = String(req.headers['x-filename'] || '')
      try { rawName = decodeURIComponent(rawName) } catch { /* 未编码就算了 */ }
      const filename = assertFileName(rawName, 'X-Filename')
      const buf = await readBody(req, LIMITS.propsFileBytes)
      if (!buf.length) throw bad('空文件（body 为空）')
      const outDir = path.join(PROPS_DIR, 'files', item, name)
      mkdirSafe(outDir)
      const target = path.join(outDir, filename)
      if (!isInside(path.join(PROPS_DIR, 'files'), target)) throw forbidden('导入路径越出 reports')
      fs.writeFileSync(target, buf)
      // 调用方要 `r.value`（`if(!o.ok||r.error||!r.value) throw`）⇒ 给**同源可回读的 URL**：
      //   runner 与渲染器同源，能直接 fetch 它；绝对磁盘路径另放 filePath（见 docs/BENCH-8902.md §5 未证实项）。
      const urlPath = `/api/props-file/${encodeURIComponent(item)}/${encodeURIComponent(name)}/${encodeURIComponent(filename)}`
      recordDiag(`bench: 导入文件属性 ${item}.${name} ← ${filename}（${buf.length} B，落 ${target}，未写进壁纸包）`, 'info', 'props-file')
      return jsonOk(res, { item, name, filename, bytes: buf.length, value: urlPath, url: urlPath, filePath: target, wroteIntoWallpaper: false })
    }
  }

  // ⑥ POST /api/delete —— 默认 dryRun；`?confirm=1` 才移进回收站（可回滚）
  if (p === '/api/delete') {
    if (req.method !== 'POST') throw new HttpError(405, '只支持 POST')
    const body = await readJsonBody(req, LIMITS.bodyBytes)
    const item = assertItemId(body.itemId || body.item || '')
    const dir = itemDirReal(item)
    const st = statSafe(dir)
    if (!st || !st.isDirectory()) throw notFound(`壁纸不存在：${item}`)
    const real = realpathDeepest(dir)
    if (!isInside(activeRoot, real)) throw forbidden(`条目经符号链接越出库根：${item}`)
    const confirm = q.get('confirm') === '1' || body.confirm === true || body.confirm === 1
    const plan = collectPlan(dir)
    if (!confirm) {
      recordDiag(`bench: 删除为 **dryRun**（未移动任何文件）：${item}（${plan.count} 个文件 / ${plan.bytes} B）` +
        `—— 真要删请用 ?confirm=1（移到 ${path.join(TRASH_ROOT, '<时间戳>')}，可回滚）`, 'info', 'delete')
      return jsonOk(res, {
        item, itemId: item, dryRun: true, wouldMove: true, confirm: false, action: 'move-to-trash',
        from: dir, to: path.join(TRASH_ROOT, '<ts>', item), trashRoot: TRASH_ROOT,
        files: plan.files, fileCount: plan.count, bytes: plan.bytes,
        hint: '重发 POST /api/delete?confirm=1 才真删（移到回收站，不永久删除）',
      })
    }
    const moved = moveToTrash(item, dir)
    recordDiag(`bench: 已删除 ${item} → ${moved.to}（移到回收站，可回滚：mv "${moved.to}" "${dir}"）`, 'info', 'delete')
    return jsonOk(res, {
      item, itemId: item, dryRun: false, wouldMove: false, confirm: true, action: 'move-to-trash',
      from: dir, to: moved.to, trashRoot: moved.trashRoot, files: plan.files, fileCount: plan.count, bytes: plan.bytes,
      rollback: `mv "${moved.to}" "${dir}"`,
    })
  }

  // ⑦ POST /api/reveal —— 只对库根内的路径；找不到打开器 ⇒ 501 + 说明（绝不成 500）
  if (p === '/api/reveal') {
    if (req.method !== 'POST') throw new HttpError(405, '只支持 POST')
    const body = await readJsonBody(req, LIMITS.bodyBytes)
    let target
    if (body.itemId || body.item) {
      const item = assertItemId(body.itemId || body.item)
      const dir = itemDirReal(item)
      if (!statSafe(dir)) throw notFound(`壁纸不存在：${item}`)
      target = dir
    } else if (typeof body.path === 'string' && body.path) {
      target = safeJoin(activeRoot, body.path, 'path')
    } else throw bad('需要 {itemId} 或 {path:"库根内的路径"}')
    const st = statSafe(target)
    if (!st || !st.isDirectory()) throw notFound(`目录不存在：${target}`)
    const real = realpathDeepest(target)
    if (!isInside(activeRoot, real)) throw forbidden(`路径经符号链接越出库根：${body.itemId || body.path}`)
    const opener = findOpener()
    if (!opener) {
      // 诚实降级：501 + 说明（调用方把它当错误显示在日志里；**不是** 500，也不是假装成功）
      return json(res, 501, {
        ok: false, unsupported: true, degraded: true, itemId: body.itemId || null, path: target,
        error: '本机没有可用的"打开文件夹"程序（找不到 termux-open / xdg-open / open）',
        reason: '无头/精简环境常见：没有 X11 打开器；本服务**不会**替你启动浏览器或文件管理器',
        hint: '装 termux-open 或 xdg-open，或用 MPW_OPEN_CMD=/path/to/opener 指定；也可以直接 `cd` 到上面这个 path',
        tried: [OPEN_CMD_ENV, 'termux-open', 'xdg-open', 'open'].filter(Boolean),
      })
    }
    const r = await spawnDetached(opener.path, [target])
    if (!r.ok) {
      return json(res, 501, {
        ok: false, unsupported: true, degraded: true, path: target,
        error: `打开器启动失败：${opener.path}（${r.code || ''} ${r.message || ''}）`.trim(),
        reason: '打开器存在但无法启动（无显示环境 / 权限）——按"能力不可用"降级，不是 500', opener: opener.path,
      })
    }
    recordDiag(`bench: 打开所在文件夹 ${target}（opener=${opener.path}）`, 'info', 'reveal')
    return jsonOk(res, { itemId: body.itemId || null, path: target, opened: true, opener: opener.path })
  }

  // ⑧ GET /api/diag-stream —— SSE（调用方 `JSON.parse(e.data).msg`）
  if (p === '/api/diag-stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': NO_STORE,
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Bench-Server': 'we-scene-demo-8902',
    })
    res.write('retry: 3000\n\n')
    for (const evt of diagBuffer.slice(-50)) res.write(`data: ${JSON.stringify(evt)}\n\n`)   // 回放：调用方 onmessage 收默认事件
    sseClients.add(res)
    const ping = setInterval(() => { try { res.write(': ping\n\n') } catch { /* 清理在 close */ } }, 15000)
    const bye = () => { clearInterval(ping); sseClients.delete(res) }
    res.on('close', bye)
    res.on('error', bye)
    req.on('close', bye)
    return undefined
  }

  throw notFound(`未知端点：${req.method} ${p}`)
}

function handleDiagSink(req, res, url) {
  if (req.method === 'POST') {
    return readBody(req, LIMITS.bodyBytes).then((buf) => {
      let msg = ''
      const text = buf.toString('utf8')
      try { const j = JSON.parse(text); msg = j && typeof j === 'object' ? String(j.msg == null ? text : j.msg) : text } catch { msg = text }
      const evt = recordDiag(msg, url.searchParams.get('level') || undefined, 'renderer')
      return jsonOk(res, { buffered: diagBuffer.length, seq: evt ? evt.seq : null, msg: evt ? evt.msg : '' })
    })
  }
  // GET /diag?msg=…：renderer bundle 的 `ce()` 用 `new Image().src=…` 上报 ⇒ 回 1×1 gif（图片不报错）
  const evt = recordDiag(url.searchParams.get('msg') || '', url.searchParams.get('level') || undefined, 'renderer')
  res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': String(GIF_1x1.length), 'Cache-Control': NO_STORE, 'X-Bench-Server': 'we-scene-demo-8902' })
  res.end(GIF_1x1)
  void evt
}

function health() {
  const opener = findOpener()
  return {
    ok: true, service: 'we-scene-demo-8902', port: PORT, pid: process.pid, node: process.version,
    startedAt: STARTED_AT, uptimeSec: Math.round((Date.now() - Date.parse(STARTED_AT)) / 1000),
    libraryRoot: activeRoot, configuredLibraryRoot: LIBRARY_ROOT_REAL, libraryRootExists: !!statSafe(activeRoot),
    libraryItems: (() => { try { return listLibrary().items.length } catch { return null } })(),
    reportsDir: REPORTS_DIR, propsDir: PROPS_DIR, trashRoot: TRASH_ROOT,
    staticRoot: STATIC_ROOT, staticMounts: ['/', '/demo/', '/WEwebLoader/', '/wallpaper-engine-webgl/'], staticStore: STORE ? 'cache' : 'no-store',
    mediaBase: '/media/dev', webBase: '/web/dev', rendererPage: '/wallpaper-engine-webgl/renderer/index.html',
    diag: { buffer: diagBuffer.length, bufferLimit: LIMITS.diagBuffer, seq: diagSeq, sseClients: sseClients.size, sink: ['GET /diag?msg=', 'POST /diag'], source: 'self (ring buffer; not a :8899 proxy)' },
    reveal: opener ? { available: true, opener: opener.path } : { available: false, status: 501, tried: [OPEN_CMD_ENV, 'termux-open', 'xdg-open', 'open'].filter(Boolean) },
    capabilities: {
      staticBench: true, mediaDev: true, webDev: true, rangeRequests: true,
      libraryList: true, libraryDirEnumerate: true, libraryDirNarrow: true,
      propsRead: true, propsWrite: true, propsDirEnumerate: true,
      propsFileImport: true, propsFileReadBack: true,
      deleteDryRun: true, deleteConfirmToTrash: true, trashRollback: true,
      diagSink: true, diagStream: true, health: true,
      nativeFolderPicker: false, nativeFilePicker: false,// 没有宿主对话框 ⇒ 见 degraded[]
      reveal: !!opener,
    },
    degraded: [
      {
        endpoint: 'POST /api/library-dir', when: '{pick:true}', capability: 'native-folder-picker', capabilityStatus: 501,
        httpStatusUsed: 200, body: '{cancelled:true, unsupported:true, degraded:true, degradedStatus:501}',
        reason: '没有 Electron/宿主对话框；调用方 bench-DSKWIqmS.js 用 `if(!e.ok||t.error) throw` 判失败 ⇒ 回 501 会把它的 window.prompt 回退**掐掉**，故用 200 + unsupported 明确降级（不假装成功）',
      },
      {
        endpoint: 'POST /api/props-dir', when: '{pick:true}', capability: 'native-folder-picker', capabilityStatus: 501,
        httpStatusUsed: 200, body: '{cancelled:true, unsupported:true, degraded:true, degradedStatus:501}',
        reason: '同上：目录型用户属性只能由宿主弹选择器；降级后调用方改用 window.prompt 让用户手输绝对路径',
      },
      {
        endpoint: 'POST /api/reveal', when: '找不到 termux-open/xdg-open/open 或启动失败', capability: 'open-in-file-manager', capabilityStatus: 501,
        httpStatusUsed: 501, body: '{ok:false, unsupported:true, error, reason, hint}',
        reason: '无头/精简环境没有打开器；按能力不可用**真回 501**（调用方本来就把它当错误显示），绝不是 500',
      },
    ],
    limits: LIMITS,
  }
}

const server = http.createServer((req, res) => {
  let url
  try { url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`) } catch { return jsonErr(res, bad('URL 解析失败')) }
  const p = url.pathname
  // ⚠ 两个**必须**在路由前做的事：
  //   ① `new URL()` 会把路径里的 `.`/`..` **规范化掉**（`/media/dev/a/../../out` → `/media/out`）⇒ 想"拒绝 `..`"
  //      就得先看**原始** req.url（含 `%2e%2e` 解码后），否则越界请求会被静默改写成另一个合法形状（实测踩到）。
  //   ② 处理函数里的**同步** throw 必须也被 `done()` 接住，否则一个 404 就能把整个服务打崩（实测踩到）。
  const rawPath = String(req.url || '/').split('?')[0].split('#')[0]
  const decodedPath = (() => { try { return decodeURIComponent(rawPath) } catch { return rawPath } })()
  if (decodedPath.includes('\0')) return jsonErr(res, bad('URL 路径含 NUL'))
  if (decodedPath.split('/').some((seg) => seg === '..')) return jsonErr(res, bad(`URL 路径含 ".."（拒绝）：${rawPath.slice(0, 200)}`))
  const onErr = (e) => {
    if (!(e instanceof HttpError)) {
      // 非预期错误也照实报（500）——但**库里那些"能力不可用"一律走 HttpError(501)**，见 /api/reveal
      console.error('[8902] 未预期错误', p, e)
    }
    jsonErr(res, e)
  }
  const done = (fn) => { try { return Promise.resolve(fn()).catch(onErr) } catch (e) { return onErr(e) } }

  // 诊断入口（renderer 的 `/diag?msg=` 与 `POST /diag`）
  if (p === '/diag') return done(() => handleDiagSink(req, res, url))
  if (p === '/__health' || p === '/__health/') return done(() => jsonOk(res, health()))
  if (p === '/favicon.ico') {
    const cand = path.join(STATIC_ROOT, 'icons', 'pwa-192.png')
    if (statSafe(cand) && sendFile(req, res, cand)) return undefined
    res.writeHead(204, { 'Cache-Control': NO_STORE }); return res.end()
  }
  if (p.startsWith('/api/')) return done(() => handleApi(req, res, url))

  // 媒体面（库根内只读）：/media/dev/<itemId>/<rel…>（scene.pkg / preview.gif / 视频）与 /web/dev/<itemId>/<rel…>
  for (const prefix of ['/media/dev/', '/web/dev/']) {
    if (p.startsWith(prefix)) {
      return done(() => {
        const segs = p.slice(prefix.length).split('/')
        const rawItem = segs.shift() || ''
        const item = assertItemId(decodeURIComponent(rawItem))
        return mediaServe(req, res, item, segs, prefix)
      })
    }
  }

  // 静态测试台
  return done(() => {
    const mapped = mapStatic(p)
    if (mapped.redirect) {
      const loc = mapped.redirect + (url.search || '')   // `?` 原样带走（hash 不发给服务器，天然保留）
      res.writeHead(302, { Location: loc, 'Cache-Control': NO_STORE })
      return res.end()
    }
    let rel = mapped.rel
    if (rel === '') rel = 'index.html'
    let target = staticTarget(rel)
    let st = statSafe(target)
    if (st && st.isDirectory()) {
      const idx = path.join(target, 'index.html')
      const ist = statSafe(idx)
      if (ist && ist.isFile()) target = idx
      else throw notFound(`目录下没有 index.html：${p}`)
    }
    if (!statSafe(target)) throw notFound(`静态文件不存在：${p}`)
    if (!sendFile(req, res, target)) throw notFound(`静态文件不可读：${p}`)
    return undefined
  })
})
/** `/media/dev/<itemId>/<rel>`：库根内只读 + Range。 */
function mediaServe(req, res, item, segs, prefix) {
  const dir = itemDirReal(item)
  const st = statSafe(dir)
  if (!st || !st.isDirectory()) throw notFound(`壁纸不存在：${item}`)
  const real = realpathDeepest(dir)
  if (!isInside(activeRoot, real)) throw forbidden(`条目经符号链接越出库根：${item}`)
  const rel = segs.join('/')
  if (!rel) throw notFound(`缺少文件路径：${prefix}${item}/`)
  const file = safeJoin(dir, rel, '文件路径')
  const fst = statSafe(file)
  if (!fst || !fst.isFile()) throw notFound(`文件不存在：${prefix}${item}/${rel}`)
  const freal = realpathDeepest(file)
  if (!isInside(activeRoot, freal)) throw forbidden(`文件经符号链接越出库根：${rel}`)
  if (!sendFile(req, res, file)) throw notFound(`文件不可读：${rel}`)
  return undefined
}

server.on('clientError', (err, socket) => {
  try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n') } catch { /* 已断开 */ }
  void err
})
server.listen(PORT, () => {
  const opener = findOpener()
  const healthSnap = health()
  const line = (s) => console.log(`[8902] ${s}`)
  line(`一站式测试台服务已启动：http://127.0.0.1:${PORT}/`)
  line(`  静态测试台     : ${STATIC_ROOT} 挂载在 / 、/demo/ 、/WEwebLoader/ 、/wallpaper-engine-webgl/（${STORE ? 'cache' : 'no-store'}）`)
  line(`  渲染器 iframe  : http://127.0.0.1:${PORT}/wallpaper-engine-webgl/renderer/index.html?type=scene&src=<itemId>（产物写死的路径）`)
  line(`  壁纸库根(只读) : ${activeRoot}${statSafe(activeRoot) ? '' : '  ← **不存在**（/api/library 会返回 missing+error）'}`)
  line(`  属性覆盖落点   : ${PROPS_DIR}/<itemId>.json（不写进壁纸包）`)
  line(`  回收站         : ${TRASH_ROOT}/<时间戳>/<itemId>（删除默认 dryRun；?confirm=1 才移入；可 mv 回滚）`)
  line(`  诊断流         : GET /api/diag-stream（SSE，环形缓冲 ${LIMITS.diagBuffer} 条；来源 GET /diag?msg= 与 POST /diag，**不代理 :8899**）`)
  line(`  健康自述       : http://127.0.0.1:${PORT}/__health`)
  line(`  降级为 501 的能力（见 /__health.degraded）：`)
  for (const d of healthSnap.degraded) line(`    · ${d.endpoint} ${d.when} → 能力 501（${d.capability}）；HTTP 用 ${d.httpStatusUsed}：${d.reason.slice(0, 60)}…`)
  line(opener ? `  /api/reveal 打开器：${opener.path}` : '  /api/reveal 打开器：**没有**（找不到 termux-open/xdg-open/open ⇒ 真回 501 + 说明）')
  line(`已就绪。curl 自检： curl -s http://127.0.0.1:${PORT}/__health | head -30`)
})
