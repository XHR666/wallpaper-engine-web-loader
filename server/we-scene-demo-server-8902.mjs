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
//   ⑥ 目录选择器（服务端只读浏览，**不弹任何系统对话框**）—— 契约见 docs/BENCH-LIBRARY-SOURCES.md：
//      **前端钉死的契约形状（环境内目录浏览器）**：
//        GET  /api/fs/roots             ⇒ {ok, roots:[{label,path(绝对),exists,listable,…}]}
//        GET  /api/fs/list?path=<绝对>  ⇒ {ok, path, parent, entries:[{name,type:'dir'|'file',size,kind}]}
//        POST /api/fs/pick {path}       ⇒ 选为壁纸库根，回 {ok, path, source:"user", library, scan}
//      同一套浏览能力的另几个入口（字段更细：上一级/计数/入口类型/插件同形兼容壳）：
//        GET  /api/dir-list?path=…   列目录（子目录 + 文件 + 上一级 + 计数 + 入口类型）
//        GET  /api/dir-parent?path=… 上一级（到根即 atRoot:true，不是错误）
//        POST /api/dir-pick {path}    "就选这个目录"：只读校验 + 该目录的壁纸扫描摘要（默认不改状态）
//        GET  /list-dirs?path=…       与插件 `dsh-mpkg-wallpaper` 的 `/list-dirs` **逐字段同形**的兼容壳
//      浏览边界 = 浏览根（`MPW_PICK_ROOT`，默认 = `MPW_ROOT`）；`..`/绝对越界/符号链接逃逸 ⇒ 400/403。
//      `GET /api/fs/roots` 会把 home 一并列出但标 `listable:false`（默认边界不含整个 home）——
//      要放宽就用 `MPW_PICK_ROOT=<更外层的目录>`。
//      所有浏览只做 readdir/stat（不写用户目录、不删除、不解包）。
//   ⑦ 库来源状态（**显式**，不假装已选）：`source: "env"|"cli"|"user"|"default"|"none"` + 实际路径，
//      见 `GET /api/library-source`、`GET /api/library`（顶层 `source`/`selected`/`explicit`/`library`）
//      与 `/__health.library`。默认值来自仓库约定 `<MPW_ROOT>/allwallpaper/dd`（**不是**用户选择）。
//      提交库根：`POST /api/library-dir {dir}`（也收 `?path=`）或 `POST /api/fs/pick {path}`。
//   ⑧ 全类型扫描：`scene.pkg`/`scenes/scene.pkg`/`gifscene.pkg`、`index.html` 等网页入口、
//      `.mp4/.webm/.mov` 视频、`.mpkg` 容器（只读容器目录表判类型）、`preview.*` 缩略图；
//      逐类计数在 `GET /api/library` 的 `scan.kinds` / `scan.containerKinds`，跳过的条目带**理由**。
//   ⑨ `GET /api/mpkg?item=&file=`（只读容器目录表）与 `GET /api/thumb?item=&w=`（缩略图：
//      优先库里现成的 `preview.*`；其次容器内**未压缩**的 `preview.*`；视频档用本机 ffmpeg 抽一帧
//      缓存到 `<reports>/bench-thumbs/`；都没有就**如实 501**）。
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
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
// 库根**来源**（显式记录，`/api/library` 与 `/__health` 都如实回报 —— 不把"仓库约定默认值"当成"用户已选"）：
//   env     = 环境变量 MPW_LIBRARY_DIR（优先级最高，与既有服务同风格）
//   cli     = 命令行 --library=DIR
//   default = 仓库约定 <MPW_ROOT>/allwallpaper/dd（**没人选过它**；MPW_ROOT 本身也可能是默认推出来的）
//   none    = 既没有显式配置、默认路径也不存在（运行期 /api/library 的 `source` 才会出现这个值）
const LIBRARY_SOURCE_INFO = (() => {
  const envVal = process.env.MPW_LIBRARY_DIR
  const cliVal = typeof flagVal('library') === 'string' ? flagVal('library') : ''
  if (envVal) return { source: 'env', from: 'env MPW_LIBRARY_DIR', raw: envVal }
  if (cliVal) return { source: 'cli', from: 'argv --library=DIR', raw: cliVal }
  return { source: 'default', from: '仓库约定 <MPW_ROOT>/allwallpaper/dd', raw: path.join(MPW_ROOT, 'allwallpaper', 'dd') }
})()
const MPW_ROOT_FROM = process.env.MPW_ROOT ? 'env MPW_ROOT' : '默认 = 本仓库的上一级目录'
const LIBRARY_ROOT_CONFIG = path.resolve(LIBRARY_SOURCE_INFO.raw)
// 目录浏览根（只读浏览的**信任边界**）：默认 = MPW_ROOT（本机工作区），可用 MPW_PICK_ROOT 覆盖。
// 与库根分开：库根可能只是浏览根里的一个子目录（例如 <MPW_ROOT>/allwallpaper/dd），
// 而选择器必须能浏览/选到 <MPW_ROOT>/allwallpaper/** 这类**库根之外、浏览根之内**的目录。
// ⚠ 边界**故意不默认放宽到整个 home**（home 常含 ~/.ssh、~/.dsh 等私人目录）：
//   `GET /api/fs/roots` 会把 home 列出来并标 `listable:false` + 放宽办法（MPW_PICK_ROOT=$HOME）。
const PICK_ROOT_CONFIG = path.resolve(process.env.MPW_PICK_ROOT || MPW_ROOT)
const PICK_ROOT_FROM = process.env.MPW_PICK_ROOT ? 'env MPW_PICK_ROOT' : '默认 = MPW_ROOT（工作区；不含整个 home）'
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
  scanOps: 20000,                     // 单次库扫描的探测操作上限（readdir/stat；防病态目录）
  dirEntries: 2000,                   // /api/dir-list 单层最多列 2000 个目录
  browserFiles: 1000,                 // /api/dir-list 单层最多列 1000 个文件
  projectJsonBytes: 512 * 1024,       // project.json 超过它就不读（绝不整包读大文件）
  pkgTableBytes: 64 * 1024,           // PKGV 容器目录表首读窗口（不够 ×4 倍增）
  pkgTableMaxBytes: 1024 * 1024,      // 目录表倍增硬顶（超过就放弃容器内类型判定，如实上报）
  thumbPixels: 640,                   // /api/thumb 的宽度上限
  thumbMs: 20000,                     // ffmpeg 抽帧单次上限
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
/** 目录可读性（只 try 一次 readdir，不看内容）—— 如实回报，不猜。 */
function dirReadable(dir) {
  try { fs.readdirSync(dir); return true } catch { return false }
}

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
  if (!isInside(rootReal, norm)) throw forbidden(`${what} 越出根目录（库根/浏览根）：${input}`)
  const real = realpathDeepest(norm)
  if (!isInside(rootReal, real)) throw forbidden(`${what} 经符号链接越出根目录（库根/浏览根）：${input}`)
  return norm
}
/** itemId = **单个路径段**（工坊 id 是数字；夹具用简单名）⇒ `../`、绝对路径、`a/b` 全在 400。 */
const ITEM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
// 国际口径：**非 ASCII 名**（中文/日文/西里尔目录名，实测语料里有「流萤」「纳西妲」这类收藏夹）
// 同样只允许单个路径段。ASCII 名一律仍走上面的严格口径（老行为零变化），
// 只有"含至少一个非 ASCII 字符 + 无分隔符/无控制符"的名字才走这一条。
const ITEM_ID_INTL_RE = /^[^\u0000-\u001f\u007f/\\]{1,120}$/
function assertItemId(id) {
  if (typeof id !== 'string' || !id) throw bad('缺少 itemId')
  if (id === '.' || id === '..' || id.startsWith('.')) throw bad(`itemId 非法（不许以 "." 开头）：${String(id).slice(0, 120)}`)
  if (/[\\/]/.test(id) || /[\u0000-\u001f\u007f]/.test(id) || id.length > 120) {
    throw bad(`itemId 含路径分隔符/控制符或过长（只允许单个路径段）：${String(id).slice(0, 120)}`)
  }
  if (ITEM_ID_RE.test(id)) return id
  if (/[^\x00-\x7f]/.test(id) && ITEM_ID_INTL_RE.test(id)) return id     // 非 ASCII 单段名
  throw bad(`itemId 非法（只允许单个路径段 [A-Za-z0-9._-]，或含非 ASCII 字符的单段名）：${String(id).slice(0, 120)}`)
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
// 浏览根（目录选择器的信任边界）：同样"真身优先"
const PICK_ROOT_REAL = (() => {
  try { return fs.realpathSync(PICK_ROOT_CONFIG) } catch { return PICK_ROOT_CONFIG }
})()
const LIBRARY_ROOT_EXISTS = !!statSafe(LIBRARY_ROOT_REAL)
/** 命中的浏览根（浏览边界只有**一个**：PICK_ROOT_REAL）。 */
function containingBrowseRoot(p) {
  const real = realpathDeepest(p)
  return isInside(PICK_ROOT_REAL, real) ? { label: 'browseRoot', path: PICK_ROOT_REAL } : null
}
/** `/api/fs/roots` 的roots[]：前端选择器的入口列表（`path` 一律绝对路径）。
 *  `listable` 才是"能不能列"（默认边界 = 工作区，home 通常在外 ⇒ 标 false 并给出放宽办法）。 */
function fsRoots() {
  const home = os.homedir() || '/'
  // 顺序即去重优先级（同路径只留先出现的那条 ⇒ "当前库目录"永远在列表里）
  const cands = [
    { label: '当前库目录', path: activeRoot, kind: 'library' },
    { label: '配置库根', path: LIBRARY_ROOT_CONFIG, kind: 'library-configured' },
    { label: '宿主 home', path: home, kind: 'home' },
    { label: '工作区（DSHAREA）', path: MPW_ROOT, kind: 'workspace' },
    { label: '壁纸总目录 allwallpaper', path: path.join(MPW_ROOT, 'allwallpaper'), kind: 'allwallpaper' },
  ]
  const out = []
  const seen = new Set()
  for (const c of cands) {
    const p = path.resolve(c.path)
    if (seen.has(p)) continue
    seen.add(p)
    const exists = !!statSafe(p)
    const inside = !!containingBrowseRoot(p)
    out.push(Object.assign({}, c, {
      path: p, exists, listable: inside && exists,
      reason: inside ? (exists ? null : '路径不存在') : `不在只读浏览边界内（当前边界：${PICK_ROOT_REAL}）`,
      enableHint: inside ? null : `把浏览边界放宽到它（或它的上层）即可：MPW_PICK_ROOT=${path.resolve(c.path)}`,
    }))
  }
  return out
}
// 静态面允许的根（真身）：demo/ 自身 + demo/samples 软链指向的真身（`samples -> ../samples`，仓库自带合成样例）
const STATIC_ROOTS = (() => {
  const out = []
  try { out.push(fs.realpathSync(STATIC_ROOT)) } catch { out.push(STATIC_ROOT) }
  for (const cand of [path.join(STATIC_ROOT, 'samples')]) {
    try { const r = fs.realpathSync(cand); if (!out.includes(r)) out.push(r) } catch { /* 没有就没有 */ }
  }
  return out
})()
// 活动库根（可在库根内**收窄**到子目录，也可由选择器**显式**选成浏览根内的另一个目录）
let activeRoot = LIBRARY_ROOT_REAL
// 运行期"用户显式选过"的痕迹（**只有** POST /api/library-dir {dir|pick} 会写它）：
// 它的存在与否决定 /api/library 里 `source` 是 `user` 还是配置来源 —— 未选择时**不假装已选**。
let selection = null            // { dir, at, mode }
const selectRoot = (dir, mode) => { activeRoot = dir; selection = { dir, at: Date.now(), mode: mode || 'dir' }; return selection }
const clearSelection = () => { selection = null; activeRoot = LIBRARY_ROOT_REAL; return null }
const itemDirReal = (id) => path.join(activeRoot, assertItemId(id))

/** 浏览路径解析（**唯一**入口）：`..` ⇒ 400；越浏览根 ⇒ 403；符号链接逃逸 ⇒ 403；NUL ⇒ 400。 *  返回 { norm, root }（root = 命中的浏览根），调用方要"只是校验"就用 assertBrowsePath()。 */
function resolveBrowsePath(input) {
  const what = 'path'
  if (typeof input !== 'string' || !input) throw bad(`缺少 ${what}`)
  if (input.includes('\0')) throw bad(`${what} 含 NUL`)
  const dec = (() => { try { return decodeURIComponent(input) } catch { return input } })()
  if (dec.includes('\0')) throw bad(`${what} 含 NUL`)
  let norm
  if (path.isAbsolute(dec)) {
    norm = path.resolve(dec)
  } else {
    if (dec.split(/[\\/]+/).includes('..')) throw bad(`${what} 含 ".."：${input}`)
    norm = path.resolve(PICK_ROOT_REAL, dec)
  }
  const root = containingBrowseRoot(norm)
  if (!root) throw forbidden(`${what} 越出浏览根（允许：${PICK_ROOT_REAL}）：${input}`)
  const real = realpathDeepest(norm)
  if (!containingBrowseRoot(real)) throw forbidden(`${what} 经符号链接越出浏览根：${input}`)
  return { norm, root, real }
}
function assertBrowsePath(input) {
  return resolveBrowsePath(input == null || input === '' ? '.' : String(input)).norm
}
/** 库来源状态（`source` 只可能是 env/cli/user/default/none；`selected` 才是"用户选过没有"）。 */
function librarySource() {
  const baseSource = selection ? 'user' : LIBRARY_SOURCE_INFO.source
  // 既没有显式配置、默认路径也不存在 ⇒ `none`（连"回退到仓库约定目录"都不成立）
  const source = (!selection && baseSource === 'default' && !LIBRARY_ROOT_EXISTS) ? 'none' : baseSource
  const exists = !!statSafe(activeRoot)
  const narrowed = activeRoot !== LIBRARY_ROOT_REAL
  const reason = (() => {
    if (source === 'user') return `用户在选择器里显式选定（${selection && selection.mode === 'pick' ? '{pick:true} 宿主对话框' : '路径提交'}）：${activeRoot}`
    if (source === 'env') return `环境变量 MPW_LIBRARY_DIR 指定：${LIBRARY_ROOT_CONFIG}`
    if (source === 'cli') return `命令行 --library= 指定：${LIBRARY_ROOT_CONFIG}`
    if (source === 'default') return `**没有人选过**：回退到仓库约定 ${LIBRARY_ROOT_CONFIG}（来源 ${LIBRARY_SOURCE_INFO.from}）；` +
      '要换库根请在页面里用选择器选，或设 MPW_LIBRARY_DIR / --library=DIR'
    return `没有任何可用库根：既没有 MPW_LIBRARY_DIR/--library=，默认路径 ${LIBRARY_ROOT_CONFIG} 也不存在`
  })()
  return {
    dir: activeRoot,
    source,
    selected: !!selection,                                      // 用户是否**显式**选过
    explicit: source === 'env' || source === 'cli' || source === 'user',   // 是否有显式配置来源
    configuredDir: LIBRARY_ROOT_CONFIG,
    configuredDirReal: LIBRARY_ROOT_REAL,
    configuredSource: LIBRARY_SOURCE_INFO.source,
    configuredFrom: LIBRARY_SOURCE_INFO.from,
    configuredExists: LIBRARY_ROOT_EXISTS,
    defaultDir: path.join(MPW_ROOT, 'allwallpaper', 'dd'),
    narrowed,
    withinConfiguredRoot: isInside(LIBRARY_ROOT_REAL, activeRoot),
    withinBrowseRoot: !!containingBrowseRoot(activeRoot),
    exists,
    readable: exists ? dirReadable(activeRoot) : false,
    env: {
      MPW_ROOT: process.env.MPW_ROOT || null,
      MPW_LIBRARY_DIR: process.env.MPW_LIBRARY_DIR || null,
      MPW_PICK_ROOT: process.env.MPW_PICK_ROOT || null,
    },
    roots: { mpwRoot: MPW_ROOT, mpwRootFrom: MPW_ROOT_FROM, browseRoot: PICK_ROOT_REAL, browseRootFrom: PICK_ROOT_FROM },
    reason,
  }
}
/** 浏览根自述（选择器的起始状态；`roots[]` 是给前端画"回到最上层"的入口）。 */
function browseRootInfo() {
  return {
    root: PICK_ROOT_REAL, configuredRoot: PICK_ROOT_CONFIG, from: PICK_ROOT_FROM,
    exists: !!statSafe(PICK_ROOT_REAL), home: os.homedir() || '/', platform: process.platform,
    readOnly: true,
  }
}

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
  if (st.size > LIMITS.projectJsonBytes) return null     // 大文件不读（绝不为一个属性表整包读盘）
  try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}
const SCENE_CANDIDATES = ['scene.pkg', 'scenes/scene.pkg', 'gifscene.pkg']   // 与 renderer bundle 的 `c1` 逐字一致
// 网页入口候选：**白名单路径**（不是递归搜索）—— 与插件 detectWebWallpaperKind 的"入口"口径一致，
// 常见布局：根 / web/ / html/ / dist/ 下的 index.html。
const HTML_ENTRY_CANDIDATES = ['index.html', 'index.htm', 'index.xhtml', 'web/index.html', 'html/index.html', 'dist/index.html']
const VIDEO_EXT = ['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v']
const MPKG_EXT = ['.mpkg', '.pkg']
const PREVIEW_CANDIDATES = ['preview.gif', 'preview.jpg', 'preview.jpeg', 'preview.png', 'preview.webp', 'preview.bmp', 'preview.avif']
const MPKG_EXT_RE = /\.(mpkg|pkg)$/i          // PKG 家族文件（选择器给"容器族"标 kind 用）
const MPKG_COLLECTION_RE = /\.mpkg$/i         // **只有 .mpkg** = 合集容器（语料里的收藏夹形态）
const PKG_ONLY_RE = /\.pkg$/i                 // 单场景包（scene.pkg 等）—— 不是"合集容器"，别混为一谈
const VIDEO_EXT_RE = /\.(mp4|webm|mov|mkv|avi|m4v)$/i
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
/** 探测预算：一次库扫描里所有 readdir/stat 都计数，超过上限就停止深挖（并在 scan 里如实上报）。 */
function makeBudget(ops) {
  return {
    limit: ops, used: 0, exceeded: false,
    op() { this.used++; if (this.used > this.limit) { this.exceeded = true; return false } return true },
  }
}
/** 在**白名单相对路径**里找第一个存在的文件（不递归、不遍历整棵树）。 */
function pickExisting(dir, rels, budget) {
  for (const rel of rels) {
    if (budget && !budget.op()) return null
    const st = statSafe(path.join(dir, rel))
    if (st && st.isFile()) return rel
  }
  return null
}
// ── PKGV 容器目录表（**只读文件头**，不解包、不整包读）────────────────────────────────────────────
// 格式（与 dsh-mpkg-wallpaper/lib/pkg-extract.js 的 readPkgTable 逐字段一致）：
//   sizedString(magic='PKGV00xx') | i32 count | count × { sizedString(path), u32 offset, u32 length }
// 压缩标志不在表里（由读取端探测条目字节决定）⇒ 本服务**只读表**即可判定容器内有什么类型。
function parsePkgTable(buf, fileSize) {
  const need = (at, len) => at + len <= buf.length
  if (!need(0, 4)) return { ok: false, reason: '头部不足 4 字节', needMore: true }
  const magicLen = buf.readInt32LE(0)
  if (magicLen <= 0 || magicLen > 32) return { ok: false, reason: `magic 长度非法：${magicLen}` }
  if (!need(4, magicLen + 4)) return { ok: false, reason: '头部不足（magic）', needMore: true }
  const magic = buf.toString('utf8', 4, 4 + magicLen)
  // PKG 家族：`PKGV####` = 场景包；`PKGM####` = .mpkg 合集包（**实测语料里 .mpkg 全是 PKGM**）。
  // 目录表布局两者一致（packages/we-core/src/pkg.js 的解析口径）。
  if (!/^PKG[VM]\d{4}$/.test(magic)) return { ok: false, reason: `magic 不匹配：${magic.slice(0, 16)}`, magic }
  let at = 4 + magicLen
  const count = buf.readInt32LE(at); at += 4
  if (count < 0 || count > 1048576) return { ok: false, reason: `条目数非法：${count}`, magic }
  const entries = []
  for (let i = 0; i < count; i++) {
    if (!need(at, 4)) return { ok: false, reason: '目录表被截断', needMore: true, magic, count, parsedEntries: entries.length }
    const nl = buf.readInt32LE(at); at += 4
    if (nl < 0 || nl > 1024) return { ok: false, reason: `条目名长度非法：${nl}`, magic, count }
    if (!need(at, nl + 8)) return { ok: false, reason: '目录表被截断', needMore: true, magic, count, parsedEntries: entries.length }
    const name = buf.toString('utf8', at, at + nl); at += nl
    const offset = buf.readUInt32LE(at); at += 4
    const length = buf.readUInt32LE(at); at += 4
    entries.push({ path: name, offset, length })
  }
  return { ok: true, magic, count, dataStart: at, entries, fileSize: fileSize == null ? null : fileSize }
}
function readPkgTableHead(file) {
  const st = statSafe(file)
  if (!st || !st.isFile()) return { ok: false, reason: '不是普通文件' }
  if (st.size < 8) return { ok: false, reason: `文件太小（${st.size} B）` }
  let fd = null
  try { fd = fs.openSync(file, 'r') } catch (e) { return { ok: false, reason: `打不开：${(e && e.code) || e}` } }
  try {
    let n = Math.min(LIMITS.pkgTableBytes, st.size)
    for (;;) {
      const buf = Buffer.allocUnsafe(n)
      let got = 0
      while (got < n) { const r = fs.readSync(fd, buf, got, n - got, got); if (r <= 0) break; got += r }
      const parsed = parsePkgTable(buf.subarray(0, got), st.size)
      if (parsed.ok) return Object.assign({ headBytes: got, fileSize: st.size }, parsed)
      if (parsed.needMore && n < st.size && n < LIMITS.pkgTableMaxBytes) { n = Math.min(st.size, n * 4); continue }
      return Object.assign({ headBytes: got, fileSize: st.size, tableComplete: false }, parsed)
    }
  } finally { try { fs.closeSync(fd) } catch { /* 已关 */ } }
}
/** 容器内条目 → 类型信号（只按**路径名**判定，不读条目内容）。 */
function classifyPkgEntries(entries) {
  const paths = (entries || []).map((e) => String(e.path || ''))
  const find = (re) => paths.find((p) => re.test(p)) || null
  const scene = find(/(^|\/)(scene\.pkg|gifscene\.pkg)$/i) || find(/(^|\/)scene\.json$/i)
  const html = find(/(^|\/)(index\.html?|index\.xhtml)$/i) || find(/\.html?$/i)
  const video = find(VIDEO_EXT_RE)
  const mpkg = find(MPKG_COLLECTION_RE)
  const project = find(/(^|\/)project\.json$/i)
  const preview = find(/(^|\/)preview\.(gif|png|jpe?g|webp|bmp|avif)$/i)
  // 顺序与目录口径一致：scene 容器 > 网页入口 > 视频 > 嵌套容器 > 未知
  const kind = scene ? 'scene' : html ? 'web' : video ? 'video' : mpkg ? 'mpkg' : 'unknown'
  return { kind, scene, html, video, mpkg, project, preview, count: paths.length }
}
/** 只读容器里某个条目的**开头**并尝试当 JSON 解析（project.json 通常是未压缩的普通 JSON）。
 *  解析不出来 ⇒ null（**不猜**、不解压）。 */
function readPkgEntryHeadJson(file, dataStart, entry) {
  if (!entry || !(entry.length > 0) || entry.length > LIMITS.projectJsonBytes) return null
  const n = Math.min(entry.length, 64 * 1024)
  let fd = null
  try { fd = fs.openSync(file, 'r') } catch { return null }
  try {
    const buf = Buffer.allocUnsafe(n)
    let got = 0
    while (got < n) { const r = fs.readSync(fd, buf, got, n - got, dataStart + entry.offset + got); if (r <= 0) break; got += r }
    const text = buf.subarray(0, got).toString('utf8').replace(/^\uFEFF/, '')
    const j = JSON.parse(text)
    return j && typeof j === 'object' && !Array.isArray(j) ? j : null
  } catch { return null } finally { try { fs.closeSync(fd) } catch { /* 已关 */ } }
}
/** `.mpkg`/`.pkg` 容器摘要：目录表 + 内层类型 + （能从容器里读到的）project.json。 */
function mpkgSummary(file, name) {
  const table = readPkgTableHead(file)
  const size = (statSafe(file) || {}).size || 0
  if (!table.ok) {
    return { name, size, tableOk: false, tableReason: table.reason, tableComplete: false, entries: 0, kind: 'unknown', signals: null, project: null, previewInContainer: null, entryNames: [] }
  }
  const sig = classifyPkgEntries(table.entries)
  const pjEntry = table.entries.find((e) => /(^|\/)project\.json$/i.test(String(e.path || '')))
  const project = pjEntry ? readPkgEntryHeadJson(file, table.dataStart, pjEntry) : null
  return {
    name, size, tableOk: true, tableReason: null, tableComplete: true,
    magic: table.magic, dataStart: table.dataStart, entries: table.entries.length, kind: sig.kind, signals: sig,
    entryNames: table.entries.slice(0, 40).map((e) => String(e.path)),
    project: project ? {
      title: project.title == null ? null : String(project.title),
      type: project.type == null ? null : String(project.type),
      file: project.file == null ? null : String(project.file),
      preview: project.preview == null ? null : String(project.preview),
      workshopid: project.workshopid == null ? null : String(project.workshopid),
    } : null,
    previewInContainer: sig.preview,
  }
}
/** 容器内**未压缩**条目的字节（只读该条目那一段，**上限 2MB**）：解不开/太大/越界 ⇒ null。 */
function readPkgEntryBytesBounded(file, table, entry, cap) {
  const max = cap || 2 * 1024 * 1024
  if (!entry || !(entry.length > 0) || entry.length > max) return null
  let fd = null
  try { fd = fs.openSync(file, 'r') } catch { return null }
  try {
    const buf = Buffer.allocUnsafe(entry.length)
    let got = 0
    const at = table.dataStart + entry.offset
    while (got < entry.length) { const r = fs.readSync(fd, buf, got, entry.length - got, at + got); if (r <= 0) break; got += r }
    return got === entry.length ? buf : null
  } catch { return null } finally { try { fs.closeSync(fd) } catch { /* 已关 */ } }
}
/** 图像魔数校验（容器里可能是 LZ4 压缩条目 ⇒ 头几个字节不是图像就**不当图用**）。 */
function imageMagicMime(buf) {
  if (!buf || buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.toString('latin1', 0, 4) === 'GIF8') return 'image/gif'
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp'
  return null
}
/** 容器内预览图（只在**未压缩**且魔数对得上时才回；否则 null + 理由）。 */
function containerPreviewBytes(file, containerFile) {
  const table = readPkgTableHead(file)
  if (!table.ok) return { ok: false, reason: `容器目录表读不出来：${table.reason}` }
  const want = PREVIEW_CANDIDATES.map((c) => c.toLowerCase())
  const entry = table.entries.find((e) => want.includes(String(e.path || '').toLowerCase())) ||
    table.entries.find((e) => /(^|\/)preview\.(gif|png|jpe?g|webp|bmp|avif)$/i.test(String(e.path || '')))
  if (!entry) return { ok: false, reason: '容器里没有 preview.*' }
  const buf = readPkgEntryBytesBounded(file, table, entry, 2 * 1024 * 1024)
  if (!buf) return { ok: false, reason: `容器内 ${entry.path} 读不出来或超过 2MB 上限（可能是压缩条目）`, entry: String(entry.path) }
  const mime = imageMagicMime(buf)
  if (!mime) return { ok: false, reason: `容器内 ${entry.path} 不是图像字节（很可能是 LZ4 压缩条目，本服务不解压）`, entry: String(entry.path) }
  return { ok: true, buf, mime, entry: String(entry.path), bytes: buf.length, container: containerFile }
}
// ── 目录信号（全类型）────────────────────────────────────────────────────────────────────────────
/** 一个壁纸目录的**内容信号**：scene 容器 / 网页入口 / 视频 / mpkg 容器 / 预览图 / project.json。 */
function dirSignals(dir, project, budget) {
  const names = listDirNames(dir, 4000)
  if (budget) budget.op()
  const declaredFile = project && typeof project.file === 'string' ? project.file.replace(/^\.\//, '') : ''
  // ① scene 容器：优先 project.json 声明的 file（存在才算），再走白名单路径
  let scene = null
  if (declaredFile && /^(scene\.pkg|scenes\/scene\.pkg|gifscene\.pkg)$/i.test(declaredFile)) {
    if (budget) budget.op()
    const st = statSafe(path.join(dir, declaredFile))
    if (st && st.isFile()) scene = declaredFile
  }
  if (!scene) scene = pickExisting(dir, SCENE_CANDIDATES, budget)
  // ② 网页入口：同样先认声明（存在才算），再走白名单
  let html = null
  if (declaredFile && /\.(html?|xhtml)$/i.test(declaredFile)) {
    if (budget) budget.op()
    const st = statSafe(path.join(dir, declaredFile))
    if (st && st.isFile()) html = declaredFile
  }
  if (!html) html = pickExisting(dir, HTML_ENTRY_CANDIDATES, budget)
  // ③ 视频：先认声明，再按"体积最大"挑（插件同序：大文件更可能是正片而不是彩蛋）
  const videoNames = names.filter((n) => VIDEO_EXT_RE.test(n)).slice(0, 24)
  let video = null
  if (declaredFile && VIDEO_EXT_RE.test(declaredFile)) {
    if (budget) budget.op()
    const st = statSafe(path.join(dir, declaredFile))
    if (st && st.isFile()) video = declaredFile
  }
  if (!video && videoNames.length) {
    let best = null
    for (const n of videoNames) {
      if (budget && !budget.op()) break
      const st = statSafe(path.join(dir, n))
      if (!st || !st.isFile()) continue
      if (!best || st.size > best.size) best = { name: n, size: st.size }
    }
    video = best ? best.name : null
  }
  // ④ mpkg/pk 容器（顶层，单层；容器内类型只读目录表判定）
  const mpkgNames = names.filter((n) => MPKG_COLLECTION_RE.test(n)).slice(0, 12)   // 合集容器只认 .mpkg
  const pkgNames = names.filter((n) => PKG_ONLY_RE.test(n) && !MPKG_COLLECTION_RE.test(n)).slice(0, 12)
  const containers = mpkgNames.map((n) => { if (budget) budget.op(); return mpkgSummary(path.join(dir, n), n) })
  // ⑤ 预览图：先认声明（**允许子目录相对路径**：`assets/preview.jpg` 这类真实存在），再走候选名
  let preview = null
  let previewSource = 'none'
  if (project && typeof project.preview === 'string' && project.preview) {
    const rel = project.preview.replace(/^\.\//, '')
    if (!rel.includes('..') && !path.isAbsolute(rel)) {
      if (budget) budget.op()
      const st = statSafe(path.join(dir, rel))
      if (st && st.isFile()) { preview = rel; previewSource = 'declared' }
    }
  }
  if (!preview) {
    const hit = PREVIEW_CANDIDATES.map((c) => names.find((n) => n.toLowerCase() === c)).find(Boolean) || null
    if (hit) { preview = hit; previewSource = 'fallback' }
  }
  const subdirs = names.filter((n) => { if (budget && !budget.op()) return false; const st = statSafe(path.join(dir, n)); return !!(st && st.isDirectory()) })
  return {
    names, declaredFile, scene, html, video, preview, previewSource,
    containers, mpkgNames, pkgNames, subdirs, videoNames,
    audio: names.filter((n) => /\.(mp3|ogg|wav|m4a|flac|opus)$/i.test(n)).length,
    project: !!project,
  }
}
/** 类型判定（内容优先，声明只作线索）—— 顺序与插件 detectWebWallpaperKind 对齐。 */
function decideKind(lower, sig) {
  const c = sig.containers.find((x) => x.tableOk && x.kind !== 'unknown') || null
  if (sig.scene) return { kind: 'scene', kindSource: 'content', reason: 'scene-container' }
  if ((lower === 'video' || lower === 'gif') && sig.video) return { kind: 'video', kindSource: 'declared', reason: 'declared-video' }
  if (sig.html) return { kind: 'web', kindSource: 'content', reason: c && lower === 'web' ? 'declared-html' : 'html-entry' }
  if (sig.video) return { kind: 'video', kindSource: 'content', reason: 'video-file' }
  if (sig.containers.length) return { kind: 'mpkg', kindSource: 'content', reason: c ? 'mpkg-container' : 'mpkg-container-unparsed' }
  if (lower === 'scene') return { kind: 'scene', kindSource: 'declared', reason: 'declared-scene-no-container' }
  if (lower === 'web') return { kind: 'web', kindSource: 'declared', reason: 'declared-web-no-entry' }
  if (lower === 'video' || lower === 'gif') return { kind: 'video', kindSource: 'declared', reason: 'declared-video-no-file' }
  return { kind: 'unknown', kindSource: 'none', reason: 'no-entry-signal' }
}
/** 未知条目：给一层"子目录里像不像壁纸"的提示（**只做提示**，不影响 kind 判定）。 */
function probeSubdirHints(dir, subdirs, budget) {
  let withSignals = 0
  const sample = []
  for (const n of subdirs.slice(0, 24)) {
    if (budget && !budget.op()) break
    const sub = path.join(dir, n)
    const hit = pickExisting(sub, SCENE_CANDIDATES, budget) || pickExisting(sub, HTML_ENTRY_CANDIDATES, budget) ||
      pickFirstFile(sub, [(x) => VIDEO_EXT_RE.test(x), (x) => MPKG_COLLECTION_RE.test(x)], 200)
    if (hit) { withSignals++; if (sample.length < 5) sample.push(n) }
  }
  return { subdirs: subdirs.length, subdirsWithSignals: withSignals, sample }
}
/** 一个库项 → 调用方要的形状（证据：bundle 的 `rt()`/`wt()`/列表渲染 + patch 的 `brandingForItemId()`）。
 *  ⚠ 老字段（itemId/dir/title/type/hasScene/file/preview/scenePkg/properties/kind/workshopid）语义**不变**
 *  （`type` 仍是 project.json 的原始声明值），新能力一律**加字段**：`kind` 改为内容优先判定，
 *  并补 `kindSource/kindReason/signals/entryFile/container/...`。 */
function libraryItemFromDir(id, dir, budget) {
  const projectRaw = readProjectJson(dir)                     // null = 这个目录**没有** project.json
  const project = projectRaw || {}
  const lower = String(project.type == null ? '' : project.type).trim().toLowerCase()
  const sig = dirSignals(dir, projectRaw, budget)
  const decided = decideKind(lower, sig)
  const container = sig.containers[0] || null
  const isContainerItem = decided.kind === 'mpkg'
  const containerPreview = isContainerItem && container && container.tableOk && container.previewInContainer
    ? { container: container.name, entry: container.previewInContainer }
    : null
  const entryFile = sig.scene || sig.html || sig.video || (isContainerItem ? container.name : null) ||
    (sig.declaredFile && !sig.declaredFile.includes('..') && !path.isAbsolute(sig.declaredFile) ? sig.declaredFile : null)
  const file = (() => {
    if (typeof project.file === 'string' && project.file) return project.file     // 声明优先（老契约逐字保留）
    if (sig.scene) return sig.scene
    if (sig.html) return sig.html
    if (sig.video) return sig.video
    if (isContainerItem) return container.name
    return null
  })()
  const typeRaw = String(project.type == null ? '' : project.type).trim()
  const type = typeRaw || (sig.scene ? 'scene' : sig.html ? 'web' : sig.video ? 'video' : isContainerItem ? 'mpkg' : 'unknown')
  const hasScene = !!sig.scene
  const renderable = (decided.kind === 'scene' && !!sig.scene) || (decided.kind === 'web' && !!sig.html) || (decided.kind === 'video' && !!sig.video)
  const renderReason = renderable ? null
    : isContainerItem ? 'mpkg 容器：网页渲染器读不了容器内条目（服务端只做类型判定；解包用 server/pack-dir.mjs / 插件侧 pkg-extract）'
      : decided.kind === 'unknown' ? '没有识别到壁纸入口（scene 容器 / 网页入口 / 视频 / mpkg 容器）'
        : `${decided.kind} 已声明但入口文件缺失（${decided.reason}）`
  const hint = (decided.kind === 'unknown' && sig.subdirs.length) ? probeSubdirHints(dir, sig.subdirs, budget) : null
  const preview = sig.preview
  const previewUrl = preview ? `/media/dev/${encodeURIComponent(id)}/${preview.split('/').map(encodeURIComponent).join('/')}` : null
  const ffmpegReady = !!findFfmpeg()
  const thumbUrl = previewUrl
    || (containerPreview ? `/api/thumb?item=${encodeURIComponent(id)}` : null)
    || (decided.kind === 'video' && sig.video && ffmpegReady ? `/api/thumb?item=${encodeURIComponent(id)}` : null)
  return {
    itemId: id,
    dir: id,                                    // 相对库根（不把绝对路径塞满列表；`/api/library` 的 `dir` 字段才是绝对根）
    title: String(project.title == null ? '' : project.title).trim() || (container && container.project && container.project.title) || id,
    type,
    hasScene,
    file,
    preview,
    scenePkg: sig.scene,                         // 命中哪一个（`scene.pkg` / `scenes/scene.pkg` / `gifscene.pkg`）
    // ⚠ patch 的 `propertiesForItemId()` 直接把这一项交给 `dragPropsToDisable()`（读 `v.type` / `v.text`）
    //   ⇒ 这里给的是 project.json 里的**原始 map**（不是 /api/props 的描述子数组）
    properties: (project.general && project.general.properties && typeof project.general.properties === 'object') ? project.general.properties : null,
    kind: decided.kind,                          // 内容优先的全类型判定：scene | video | web | mpkg | unknown
    workshopid: project.workshopid == null ? null : String(project.workshopid),
    // ── 新字段（全类型扫描的"证据面"；前端可以不读，但不必猜）──
    kindSource: decided.kindSource,              // content | declared | none
    kindReason: decided.reason,
    declaredType: typeRaw || null,
    mismatch: !!typeRaw && typeRaw.toLowerCase() !== decided.kind && !(typeRaw.toLowerCase() === 'gif' && decided.kind === 'video'),
    entryFile,
    entryExists: !!entryFile && !!statSafe(path.join(dir, entryFile)) && (statSafe(path.join(dir, entryFile)) || {}).isFile() === true,
    renderable,
    renderReason,
    hasHtml: !!sig.html,
    hasVideo: !!sig.video,
    hasPreview: !!preview,
    hasProject: !!sig.project,
    previewSource: sig.previewSource,            // declared | fallback | none
    previewUrl,
    thumbUrl,
    thumbReason: thumbUrl ? null : (isContainerItem ? 'mpkg 容器里没有可直出的 preview.*（或它是压缩条目）' : '库里没有 preview.* 且该档不是视频（无法抽帧）'),
    signals: {
      scene: sig.scene, sceneJson: null, html: sig.html, video: sig.video, videoCount: sig.videoNames.length,
      mpkg: sig.mpkgNames.length ? sig.mpkgNames : null, preview: sig.preview, previewSource: sig.previewSource,
      project: !!sig.project, audio: sig.audio, subdirs: sig.subdirs.length,
    },
    container: isContainerItem,
    containerKind: isContainerItem ? (container.kind || 'unknown') : null,
    containerEntry: isContainerItem && container.signals ? (container.signals.scene || container.signals.html || container.signals.video || null) : null,
    mpkgFiles: sig.containers.map((c) => ({ name: c.name, size: c.size, tableOk: c.tableOk, tableReason: c.tableReason, entries: c.entries, kind: c.kind, previewInContainer: c.previewInContainer })),
    containerPreview,
    probe: hint,
  }
}
function libraryItem(id, budget) {
  const dir = itemDirReal(id)
  const st = statSafe(dir)
  if (!st || !st.isDirectory()) return null
  const real = realpathDeepest(dir)
  if (!isInside(activeRoot, real)) throw forbidden(`条目经符号链接越出库根：${id}`)
  return libraryItemFromDir(id, dir, budget)
}
const KINDS = ['scene', 'video', 'web', 'mpkg', 'unknown']
function listLibrary() {
  const t0 = Date.now()
  const budget = makeBudget(LIMITS.scanOps)
  const items = []
  const skipped = []
  const kinds = { scene: 0, video: 0, web: 0, mpkg: 0, unknown: 0 }
  const containerKinds = { scene: 0, video: 0, web: 0, mpkg: 0, unknown: 0 }
  const signals = { withScene: 0, withHtml: 0, withVideo: 0, withMpkg: 0, withPreview: 0, withProject: 0, noPreview: 0, renderable: 0, mismatch: 0 }
  let hiddenDirs = 0, looseFiles = 0, dirCount = 0
  const looseMpkg = []
  const loosePkg = []
  const src = librarySource()
  if (!statSafe(activeRoot)) {
    return {
      dir: activeRoot, configuredDir: LIBRARY_ROOT_CONFIG, items: [], count: 0, missing: true,
      error: `壁纸库根不存在或不可读：${activeRoot}`, source: src.source, selected: src.selected,
      scan: { root: activeRoot, exists: false, items: 0, kinds, containerKinds, skipped: 0, durationMs: Date.now() - t0, budgetExceeded: budget.exceeded },
    }
  }
  for (const name of listDirNames(activeRoot)) {
    if (name.startsWith('.')) { hiddenDirs++; continue }
    const full = path.join(activeRoot, name)
    const st = statSafe(full)                     // follow symlink + 真身校验（Dirent.isFile 在本机有误报 ⇒ 一律 statSync）
    if (!st) { skipped.push({ name, reason: 'stat 失败（断链 / 权限不足）' }); continue }
    if (!st.isDirectory()) {
      // 顶层**散文件**：不进列表（列表 = 目录型壁纸条目），但如实计数 + 给理由（别让用户以为"扫不出来"是 bug）
      looseFiles++
      if (MPKG_COLLECTION_RE.test(name) && looseMpkg.length < 20) looseMpkg.push(name)
      if (PKG_ONLY_RE.test(name) && loosePkg.length < 20) loosePkg.push(name)
      continue
    }
    dirCount++
    if (items.length >= LIMITS.listItems) { skipped.push({ name, reason: `超过 listItems 上限 ${LIMITS.listItems}（截断）` }); continue }
    let id
    try { id = assertItemId(name) } catch (e) { skipped.push({ name, reason: `itemId 非法：${e instanceof HttpError ? e.message : String(e && e.message || e)}` }); continue }
    try {
      const it = libraryItem(id, budget)
      if (!it) { skipped.push({ name, reason: '不是目录' }); continue }
      items.push(it)
      kinds[it.kind] = (kinds[it.kind] || 0) + 1
      if (it.container) containerKinds[it.containerKind || 'unknown'] = (containerKinds[it.containerKind || 'unknown'] || 0) + 1
      if (it.hasScene) signals.withScene++
      if (it.hasHtml) signals.withHtml++
      if (it.hasVideo) signals.withVideo++
      if (it.hasPreview) signals.withPreview++; else signals.noPreview++
      if (it.hasProject) signals.withProject++
      if (it.mpkgFiles && it.mpkgFiles.length) signals.withMpkg++
      if (it.mismatch) signals.mismatch++
      if (it.renderable) signals.renderable++
    } catch (e) {
      // 越界的符号链接 / 真身逃逸条目：跳过（不是整表报错），但**必须留痕**（`scan.skipped` 里能查到）
      skipped.push({ name, reason: e instanceof HttpError ? e.message : String(e && e.message || e) })
    }
  }
  return {
    dir: activeRoot, configuredDir: LIBRARY_ROOT_CONFIG, items, count: items.length,
    source: src.source, selected: src.selected, explicit: src.explicit, librarySource: src,
    scan: {
      root: activeRoot, exists: true, dirs: dirCount, items: items.length, hiddenDirs, looseFiles,
      looseMpkgFiles: looseMpkg, loosePkgFiles: loosePkg,
      looseFileNote: looseFiles
        ? `${looseFiles} 个顶层文件不在列表里（列表只收**目录型**壁纸条目` +
          (looseMpkg.length ? `；其中 ${looseMpkg.length} 个是 .mpkg/.pkg 容器：容器内类型见 GET /api/mpkg?item=&file= 或 POST /api/dir-pick 的 scan.looseContainers（本服务只读容器目录表，不解包）` : '') + '）'
        : undefined,
      kinds, containerKinds, signals,
      skipped: skipped.length, skippedList: skipped.slice(0, 20),
      budgetExceeded: budget.exceeded, opsUsed: budget.used, opsLimit: budget.limit,
      durationMs: Date.now() - t0,
      limits: {
        listItems: LIMITS.listItems, scanOps: LIMITS.scanOps,
        projectJsonBytes: LIMITS.projectJsonBytes, pkgTableBytes: LIMITS.pkgTableBytes,
      },
    },
  }
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

// ── 目录选择器（服务端**只读**浏览；前端不再需要系统对话框）────────────────────────────────────────
// 与插件 `dsh-mpkg-wallpaper` 的 `/list-dirs` 同形（`dir` + `subdirs` + `home` + `platform`），
// 但多了"上一级 / 计数 / 文件列表 / 浏览根自述"，以及**必须**能进 `<MPW_ROOT>/allwallpaper/**` 这类环境内路径。
/** 文件类型（选择器筛选用；与库扫描同一套扩展名）。 */
function fileKindOf(name) {
  const ext = path.extname(name).toLowerCase()
  if (VIDEO_EXT_RE.test(name)) return 'video'
  if (MPKG_EXT_RE.test(name)) return 'mpkg'
  if (/\.(png|jpe?g|gif|webp|bmp|avif|svg|ico)$/i.test(name)) return 'image'
  if (/\.(mp3|ogg|wav|m4a|flac|opus)$/i.test(name)) return 'audio'
  if (/\.(html?|xhtml)$/i.test(name)) return 'html'
  if (ext === '.json') return 'json'
  if (ext === '.pkg') return 'pkg'
  return 'other'
}
/** 一个子目录"像不像壁纸"的**单层**探测（只用白名单名，不递归）：给选择器标 kind 用。 */
function dirWallpaperSignal(sub, budget) {
  const project = readProjectJson(sub)
  if (budget && !budget.op()) return { signal: null, kind: 'other' }
  const scene = pickExisting(sub, SCENE_CANDIDATES, budget)
  if (scene) return { signal: scene, kind: 'scene' }
  const html = pickExisting(sub, HTML_ENTRY_CANDIDATES, budget)
  if (html) return { signal: html, kind: 'web' }
  const names = listDirNames(sub, 200)
  const video = names.find((x) => VIDEO_EXT_RE.test(x))
  if (video) return { signal: video, kind: 'video' }
  const mpkg = names.find((x) => MPKG_COLLECTION_RE.test(x))
  if (mpkg) return { signal: mpkg, kind: 'mpkg' }
  if (project) return { signal: 'project.json', kind: String(project.type || 'unknown').toLowerCase() === 'web' ? 'web' : String(project.type || '').toLowerCase() === 'video' ? 'video' : 'scene' }
  return { signal: null, kind: 'other' }
}
/** 单层目录清单（**只 readdir/stat**；逃逸的符号链接不列出、断链不列出、隐藏项只计数）。 */
function dirListing(dir, opts) {
  const o = opts || {}
  const st = statSafe(dir)
  if (!st || !st.isDirectory()) throw notFound(`目录不存在或不是目录：${dir}`)
  const real = realpathDeepest(dir)
  if (!containingBrowseRoot(real)) throw forbidden(`目录经符号链接越出浏览根：${dir}`)
  const budget = makeBudget(6000)
  const names = listDirNames(dir, LIMITS.dirEntries + LIMITS.browserFiles + 200)
  const dirs = []
  const files = []
  let hidden = 0, linksSkipped = 0, truncated = false
  for (const n of names) {
    if (n.startsWith('.')) { hidden++; continue }
    const sub = path.join(dir, n)
    const s2 = statSafe(sub)                        // follow symlink（断链 ⇒ null）
    if (!s2) { linksSkipped++; continue }
    let r2
    try { r2 = realpathDeepest(sub) } catch { linksSkipped++; continue }
    if (!containingBrowseRoot(r2)) { linksSkipped++; continue }   // 逃逸的符号链接**不列出来**
    if (s2.isDirectory()) {
      if (dirs.length >= LIMITS.dirEntries) { truncated = true; continue }
      const probed = dirWallpaperSignal(sub, budget)
      dirs.push({
        name: n, path: path.relative(PICK_ROOT_REAL, sub), abs: sub,
        looksLikeWallpaper: probed.kind !== 'other', entryKind: probed.kind, signal: probed.signal,
      })
    } else if (s2.isFile() && o.files !== false) {
      if (files.length >= LIMITS.browserFiles) { truncated = true; continue }
      files.push({ name: n, ext: path.extname(n).toLowerCase(), size: s2.size, kind: fileKindOf(n), abs: sub })
    }
  }
  const parent = (() => { const par = path.dirname(dir); return (par !== dir && containingBrowseRoot(par)) ? par : null })()
  const rootInfo = browseRootInfo()
  return {
    dir,
    path: path.relative(PICK_ROOT_REAL, dir) || '.',
    browseRoot: PICK_ROOT_REAL, root: PICK_ROOT_REAL, configuredRoot: rootInfo.configuredRoot, rootFrom: rootInfo.from,
    parent, atRoot: !parent, insideRoot: true, readOnly: true,
    home: rootInfo.home, platform: rootInfo.platform,
    roots: [{ name: rootInfo.root, path: rootInfo.root, kind: 'browseRoot' }],
    dirs, files, counts: { dirs: dirs.length, files: files.length, hidden, linksSkipped },
    truncated,
    libRoot: { dir: activeRoot, source: librarySource().source, insideThisDir: isInside(dir, activeRoot) || dir === activeRoot },
    pickHint: { commit: 'POST /api/dir-pick {path}（只读校验 + 扫描摘要）', asLibrary: 'POST /api/library-dir {dir:<绝对路径>}（把它设为壁纸库根）' },
  }
}
/** 单条目扫描摘要（选择器"就选这个目录"时给前端的预览：这里到底有没有壁纸）。
 *  除了子目录，还如实报告**顶层散文件**与**顶层 .mpkg 容器**（后者不进列表，但容器里是什么类型要能看见）。 */
function scanDirForPicker(dir, budget) {
  const b = budget || makeBudget(LIMITS.scanOps)
  const names = listDirNames(dir, LIMITS.dirEntries)
  const kinds = { scene: 0, video: 0, web: 0, mpkg: 0, unknown: 0 }
  const sample = []
  const looseContainers = []
  let dirs = 0, looseFiles = 0, unclassified = 0, escaped = 0
  const looseExt = {}
  for (const n of names) {
    if (n.startsWith('.')) continue
    const sub = path.join(dir, n)
    const st = statSafe(sub)
    if (!st) continue
    if (!st.isDirectory()) {
      looseFiles++
      const ext = path.extname(n).toLowerCase() || '(无扩展名)'
      looseExt[ext] = (looseExt[ext] || 0) + 1
      if (MPKG_EXT_RE.test(n) && looseContainers.length < 12 && b.op()) {   // 散落的 .mpkg/.pkg 都报（真身是容器）
        const sum = mpkgSummary(sub, n)
        looseContainers.push({ name: n, size: sum.size, tableOk: sum.tableOk, tableReason: sum.tableReason, entries: sum.entries, kind: sum.kind, entryNames: sum.entryNames, declared: sum.project })
      }
      continue
    }
    dirs++
    // ⚠ 计数与"样例"是两件事：**每个目录都要计数**（否则 count 会被样例上限截断，看起来像"只有 8 个"），
    //   样例只留前 8 条给前端做预览；预算用尽时**如实**记 unclassified（绝不假装数完了）。
    //   ⚠ 逃逸的符号链接目录**不算**壁纸条目（与 dirListing / libraryItem 同一判据）—— 这里也要查，
    //   否则一个指向库外的软链会被数成"一个 unknown 壁纸"（实测踩到）。
    if (!containingBrowseRoot(realpathDeepest(sub))) { escaped++; continue }
    if (!b.op()) { unclassified++; continue }
    let id = n
    try { id = assertItemId(n) } catch { unclassified++; continue }
    try {
      const it = libraryItemFromDir(id, sub, b)
      kinds[it.kind] = (kinds[it.kind] || 0) + 1
      if (sample.length < 8) sample.push({ itemId: it.itemId, kind: it.kind, type: it.type, file: it.file, preview: it.preview, renderable: it.renderable, containerKind: it.containerKind })
    } catch { escaped++ }        // 逃逸的符号链接条目：不进摘要（如实计数）
  }
  const looseKinds = { scene: 0, video: 0, web: 0, mpkg: 0, unknown: 0 }
  for (const c of looseContainers) looseKinds[c.kind] = (looseKinds[c.kind] || 0) + 1
  return {
    dir, scanned: true, dirs, looseFiles, looseExt, escaped, unclassified,
    count: Object.values(kinds).reduce((a, c) => a + c, 0),
    kinds, sample, looseContainers, looseContainerKinds: looseKinds,
    looseNote: (looseFiles && !looseContainers.length)
      ? `${looseFiles} 个顶层文件不在"壁纸条目"列表里（本服务只把**目录**当条目；散文件如实计数）` : undefined,
    budgetExceeded: b.exceeded,
  }
}
// ── 缩略图（缺什么补什么）：库里现成 preview.* → 视频档用本机 ffmpeg 抽一帧（缓存到 reports）────────
let ffmpegPathCache
function findFfmpeg() {
  if (ffmpegPathCache === undefined) ffmpegPathCache = whichSync('ffmpeg')
  return ffmpegPathCache
}
const THUMB_DIR = path.join(REPORTS_DIR, 'bench-thumbs')
function thumbCachePath(item, w) { return path.join(THUMB_DIR, `${assertItemId(item)}-${w}.jpg`) }
function runFfmpegFrame(src, out, w) {
  return new Promise((resolve) => {
    const bin = findFfmpeg()
    if (!bin) return resolve({ ok: false, code: 'NO_FFMPEG', message: '本机没有 ffmpeg' })
    let err = ''
    let child
    try {
      child = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-frames:v', '1', '-vf', `scale=${w}:-2`, '-q:v', '3', out], { stdio: ['ignore', 'ignore', 'pipe'] })
    } catch (e) { return resolve({ ok: false, code: 'SPAWN_THROW', message: String(e && e.message || e) }) }
    const kill = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* 已退 */ } }, LIMITS.thumbMs)
    child.stderr.on('data', (c) => { if (err.length < 2000) err += c.toString() })
    child.on('error', (e) => { clearTimeout(kill); resolve({ ok: false, code: (e && e.code) || 'SPAWN_ERROR', message: String(e && e.message || e) }) })
    child.on('close', (code) => {
      clearTimeout(kill)
      const st = statSafe(out)
      if (code === 0 && st && st.isFile() && st.size > 0) return resolve({ ok: true, bytes: st.size })
      try { fs.rmSync(out, { force: true }) } catch { /* 清理失败不致命 */ }
      resolve({ ok: false, code: `EXIT_${code}`, message: err.trim().slice(0, 300) || 'ffmpeg 没有产出帧' })
    })
  })
}
/** 缩略图计划：`file` = 直接回库里的图；`container` = 容器内未压缩 preview.*；`ffmpeg` = 抽帧后回；
 *  `none` = 明确 501（给理由）。 */
function thumbPlan(item) {
  const dir = itemDirReal(item)
  const st = statSafe(dir)
  if (!st || !st.isDirectory()) throw notFound(`壁纸不存在：${item}`)
  const real = realpathDeepest(dir)
  if (!isInside(activeRoot, real)) throw forbidden(`条目经符号链接越出库根：${item}`)
  const it = libraryItem(item, makeBudget(4000))
  if (it.preview) {
    const p = path.join(dir, it.preview)
    const pst = statSafe(p)
    if (pst && pst.isFile()) return { kind: 'file', path: p, item: it, from: it.previewSource === 'declared' ? 'declared-preview' : 'preview-file' }
  }
  if (it.containerPreview) {
    const cfile = path.join(dir, it.containerPreview.container)
    const cst = statSafe(cfile)
    if (cst && cst.isFile()) {
      const r = containerPreviewBytes(cfile, it.containerPreview.container)
      if (r.ok) return { kind: 'container', bytes: r.buf, mime: r.mime, entry: r.entry, container: r.container, item: it, from: 'container-preview' }
      // 压缩条目 / 超大 / 读不出来 ⇒ 如实降级（下面的 none 分支会带上这句理由）
      it.containerPreviewReason = r.reason
    }
  }
  if (it.kind === 'video' && it.entryFile) {
    const src = path.join(dir, it.entryFile)
    const sst = statSafe(src)
    if (sst && sst.isFile()) return { kind: 'ffmpeg', src, item: it, from: 'ffmpeg-frame' }
  }
  if (it.container) {
    return {
      kind: 'none', item: it,
      reason: `mpkg 容器条目没有库内预览图（${it.containerPreviewReason || `容器内 ${(it.containerPreview && it.containerPreview.entry) || '没有 preview.*'} 取不到`}）`,
      hint: '本服务只读容器目录表 + 未压缩的 preview.*；压缩条目/其它素材要解包请用插件侧 pkg-extract',
    }
  }
  return { kind: 'none', item: it, reason: `该条目没有 preview.* 且不是视频（kind=${it.kind}）`, hint: '把 preview.gif/jpg/png 放进壁纸目录即可' }
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

  // ① GET /api/library —— 列表（只读；带**显式**库来源 + 全类型逐类计数）
  if (p === '/api/library' && (req.method === 'GET' || req.method === 'HEAD')) {
    return jsonOk(res, listLibrary())
  }

  // ①b GET /api/library-source —— 只看库来源状态（选择器/页面据此显示"未选择"，不必先扫全库）
  if (p === '/api/library-source' && (req.method === 'GET' || req.method === 'HEAD')) {
    const src = librarySource()
    return jsonOk(res, {
      library: src, source: src.source, selected: src.selected, explicit: src.explicit, dir: src.dir,
      configuredDir: src.configuredDir, exists: src.exists, readable: src.readable, reason: src.reason,
      picker: Object.assign(browseRootInfo(), {
        routes: {
          list: 'GET /api/dir-list?path=', parent: 'GET /api/dir-parent?path=',
          pick: 'POST /api/dir-pick {path}', commit: 'POST /api/library-dir {dir}',
          compat: 'GET /list-dirs?path=', thumb: 'GET /api/thumb?item=', mpkg: 'GET /api/mpkg?item=&file=',
        },
        systemPickerFallback: 'Android/桌面系统对话框只能由页面自己调（showDirectoryPicker/webkitdirectory）——本服务**不经手**也**替代不了**，只作为兜底',
      }),
    })
  }

  // ①c /api/dir-list · /api/dir-parent · /api/dir-pick —— 服务端只读目录浏览（不需要系统对话框）
  if ((p === '/api/dir-list' || p === '/api/dir-parent') && (req.method === 'GET' || req.method === 'HEAD')) {
    const cur = assertBrowsePath(q.get('path') || '')
    const wantFiles = q.get('files') !== '0'
    if (p === '/api/dir-parent') {
      const par = (() => { const x = path.dirname(cur); return (x !== cur && isInside(PICK_ROOT_REAL, x)) ? x : null })()
      const payload = dirListing(par || cur, { files: wantFiles })
      payload.from = cur                      // 从哪个目录上来
      payload.atRoot = !payload.parent        // atRoot = **列出来的这个目录**已在浏览根（与 dirListing 同义）
      payload.moved = par ? 'up' : 'stayed'   // stayed = 已经在根上，没有再上一级
      payload.stayedAtRoot = !par
      return jsonOk(res, Object.assign(payload, { source: librarySource().source }))
    }
    return jsonOk(res, Object.assign(dirListing(cur, { files: wantFiles }), { source: librarySource().source }))
  }
  if (p === '/api/dir-pick') {
    if (req.method !== 'POST') throw new HttpError(405, '只支持 POST')
    const body = await readJsonBody(req, LIMITS.bodyBytes)
    const dir = assertBrowsePath(body.path)
    const st = statSafe(dir)
    if (!st || !st.isDirectory()) throw notFound(`目录不存在或不是目录：${body.path}`)
    const real = realpathDeepest(dir)
    if (!isInside(PICK_ROOT_REAL, real)) throw forbidden(`目录经符号链接越出浏览根：${body.path}`)
    recordDiag(`bench: 选择器"就选这个目录" = ${dir}（只读校验；未改任何状态${body.asLibrary ? '；随后设为库根' : ''}）`, 'info', 'dir-pick')
    const out = {
      picked: true, dir, abs: dir, path: path.relative(PICK_ROOT_REAL, dir) || '.',
      browseRoot: PICK_ROOT_REAL, isDirectory: true, readable: dirReadable(dir), readOnly: true,
      scan: body.scan === false ? null : scanDirForPicker(dir),
      asLibrary: !!body.asLibrary,
      libraryBefore: { dir: activeRoot, source: librarySource().source, selected: librarySource().selected },
    }
    if (body.asLibrary) {
      selectRoot(dir, 'pick')
      out.libraryAfter = librarySource()
      out.dir = dir
    }
    return jsonOk(res, out)
  }

  // ①d /api/fs/* —— **前端钉死的契约形状**（环境内目录浏览器）：roots / list / pick
  //     GET  /api/fs/roots ⇒ {ok, roots:[{label,path(绝对),…}]}
  //     GET  /api/fs/list?path=<绝对> ⇒ {ok, path, parent, entries:[{name,type,size,kind}]}
  //     POST /api/fs/pick {path} ⇒ 选为库根并回 {ok, path, source:'user', library}
  //     错误码：400 参数非法 / 403 越界（`..`、绝对跳转、符号链接逃逸）/ 404 不存在；只读。
  if (p === '/api/fs/roots' && (req.method === 'GET' || req.method === 'HEAD')) {
    return jsonOk(res, {
      roots: fsRoots().map((r) => ({ label: r.label, path: r.path, kind: r.kind, exists: r.exists, listable: r.listable, reason: r.reason, enableHint: r.enableHint })),
      browseRoot: PICK_ROOT_REAL, browseRootFrom: PICK_ROOT_FROM,
      home: os.homedir() || '/', homeListable: !!containingBrowseRoot(os.homedir() || '/'),
      library: { dir: activeRoot, source: librarySource().source, selected: librarySource().selected },
      note: '只读：本服务不经手系统选择器（Android/桌面对话框只能由页面自己调，且只作兜底）',
    })
  }
  if (p === '/api/fs/list' && (req.method === 'GET' || req.method === 'HEAD')) {
    const raw = q.get('path')
    if (raw != null && raw !== '' && !path.isAbsolute((() => { try { return decodeURIComponent(raw) } catch { return raw } })())) {
      throw bad(`path 必须是绝对路径：${raw}`)
    }
    const dir = assertBrowsePath(raw == null || raw === '' ? '.' : raw)
    const listing = dirListing(dir, { files: q.get('files') !== '0' })
    const entries = [
      ...listing.dirs.map((d) => ({ name: d.name, type: 'dir', size: 0, kind: d.looksLikeWallpaper ? 'wallpaper' : 'other', path: d.abs, entryKind: d.entryKind, signal: d.signal })),
      ...listing.files.map((f) => ({
        name: f.name, type: 'file', size: f.size,
        kind: f.kind === 'video' ? 'video' : (f.kind === 'html' ? 'web' : (f.kind === 'mpkg' || f.kind === 'pkg' ? 'scene' : 'other')),
        path: f.abs, ext: f.ext, container: (f.kind === 'mpkg' || f.kind === 'pkg'),
      })),
    ]
    return jsonOk(res, {
      path: listing.dir, parent: listing.parent, entries, count: entries.length,
      atRoot: listing.atRoot, browseRoot: PICK_ROOT_REAL, roots: fsRoots().map((r) => ({ label: r.label, path: r.path, listable: r.listable })),
      counts: listing.counts, truncated: listing.truncated, readOnly: true,
      kindLegend: {
        dir: '"wallpaper" = 目录本身像壁纸（含 scene 容器 / 网页入口 / 视频 / mpkg / project.json）；"other" = 其余（可能还要再进一层）',
        file: '"scene" = .pkg/.mpkg 容器族；"video" = mp4/webm/mov/…；"web" = html；"other" = 其余',
        dirEntryKind: '"scene"|"video"|"web"|"mpkg"|"other" = 目录里命中的**入口类型**（更细的一层）',
      },
    })
  }
  if (p === '/api/fs/pick') {
    if (req.method !== 'POST') throw new HttpError(405, '只支持 POST')
    const body = await readJsonBody(req, LIMITS.bodyBytes)
    const spec = body.path != null ? body.path : q.get('path')
    const dir = assertBrowsePath(spec)
    const st = statSafe(dir)
    if (!st || !st.isDirectory()) throw notFound(`目录不存在或不是目录：${spec}`)
    const real = realpathDeepest(dir)
    if (!containingBrowseRoot(real)) throw forbidden(`目录经符号链接越出浏览根：${spec}`)
    selectRoot(dir, 'pick')
    const src = librarySource()
    recordDiag(`bench: /api/fs/pick 选定库根 ${dir}（source=user）`, 'info', 'fs-pick')
    return jsonOk(res, {
      picked: true, path: dir, dir, source: src.source, selected: src.selected, library: src,
      scan: body.scan === false ? null : scanDirForPicker(dir),
      browseRoot: PICK_ROOT_REAL, readOnly: true,
    })
  }

  // ② /api/library-dir —— 选择库根：{pick:true} 降级；{dir} 收窄/显式选定；GET 枚举子目录
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
        dirs.push({ name: n, path: path.relative(LIBRARY_ROOT_REAL, sub), abs: sub })
      }
      return jsonOk(res, {
        dir, root: LIBRARY_ROOT_REAL, activeDir: activeRoot, dirs, count: dirs.length,
        picker: 'server',                                  // 服务端选择器**可用**（见 /api/dir-list）
        browseRoot: PICK_ROOT_REAL,
        routes: { list: 'GET /api/dir-list', parent: 'GET /api/dir-parent', pick: 'POST /api/dir-pick' },
        source: librarySource().source, selected: librarySource().selected,
      })
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req, LIMITS.bodyBytes)
      // 前端契约：`POST /api/library-dir?path=<绝对路径>` 与 `{dir:<绝对路径>}` 等价（两种都收）
      if (!body.dir && q.get('path')) body.dir = q.get('path')
      if (body.pick) {
        // 没有 Electron/宿主对话框 ⇒ 明确降级。**注意 HTTP 码**：调用方是
        //   `if(!e.ok||t.error) throw` … `if(t.cancelled){ if(!t.unsupported) return; window.prompt(...) }`
        //   —— 非 2xx 会**掐掉**它自己的 prompt 回退 ⇒ 这里回 200 + {cancelled:true, unsupported:true, degraded:true}，
        //   并把"能力状态 501"如实写进 body.degradedStatus 与 /__health.degraded[]（不假装成功：cancelled=true）。
        //   ⚠ 系统对话框这条能力**确实**不存在（本服务是 Node 服务，不经手 Android/桌面选择器）；
        //     但页面**不需要**再退到系统对话框：服务端自带只读目录浏览（下面 picker.server 那几条路由）。
        const reason = '本服务没有宿主对话框（不是 Electron/termux 宿主）：无法弹系统"选择文件夹"'
        recordDiag(`bench: 系统"选择文件夹"对话框不可用（能力 501）—— ${reason}；` +
          '页面应改用服务端只读选择器 GET /api/dir-list + POST /api/dir-pick（不要退回系统选择器）', 'info', 'library-dir')
        return jsonOk(res, {
          cancelled: true, unsupported: true, degraded: true, degradedStatus: 501, picker: 'server',
          reason,
          hint: '页面请改用服务端选择器：GET /api/dir-list?path=…（列目录）→ POST /api/dir-pick {path}（就选这个目录）→ POST /api/library-dir {dir}（设为库根）',
          serverPicker: {
            available: true, readOnly: true, browseRoot: PICK_ROOT_REAL,
            list: 'GET /api/dir-list?path=', parent: 'GET /api/dir-parent?path=', pick: 'POST /api/dir-pick',
            commit: 'POST /api/library-dir {dir}', compat: 'GET /list-dirs?path=',
          },
          systemPickerFallback: '仅当页面在无后端（静态托管）或用户坚持时，才由页面自己调 showDirectoryPicker/webkitdirectory（Android 上就是系统选择器）',
          dir: activeRoot, configuredDir: LIBRARY_ROOT_CONFIG,
          source: librarySource().source, selected: librarySource().selected,
        })
      }
      if (body.reset) {
        clearSelection()
        return jsonOk(res, { dir: activeRoot, reset: true, root: LIBRARY_ROOT_REAL, source: librarySource().source, selected: false, library: librarySource() })
      }
      if (typeof body.dir === 'string' && body.dir) {
        // 相对路径：老语义（**库根内**收窄）；绝对路径：新语义（浏览根内任意目录 ⇒ 能选到
        // `<MPW_ROOT>/allwallpaper` 这类库根之外的收藏夹）。两条都过同一套 `..`/真身校验。
        const spec = String(body.dir).trim()
        const absolute = path.isAbsolute(spec)
        // 绝对路径走浏览根（safeJoin 内部已做 `..`/越根/真身三道校验）；
        // 相对路径走**老语义**（配置库根内收窄 —— 库根可能不在浏览根里，故这里不加浏览根判据）。
        const target = absolute ? assertBrowsePath(spec) : safeJoin(LIBRARY_ROOT_REAL, spec, 'dir')
        const st = statSafe(target)
        if (!st || !st.isDirectory()) throw notFound(`目录不存在：${body.dir}`)
        const insideConfigured = isInside(LIBRARY_ROOT_REAL, target)
        selectRoot(target, absolute ? 'absolute' : 'relative')
        recordDiag(`bench: 壁纸库根${insideConfigured ? '收窄' : '**改选**'}到 ${activeRoot}（${absolute ? '绝对路径' : '库根内相对路径'}；source=user）`, 'info', 'library-dir')
        const src = librarySource()
        return jsonOk(res, {
          dir: activeRoot, root: LIBRARY_ROOT_REAL, narrowed: activeRoot !== LIBRARY_ROOT_REAL,
          outsideConfiguredRoot: !insideConfigured, configuredRoot: LIBRARY_ROOT_REAL,
          source: src.source, selected: src.selected, library: src,
        })
      }
      throw bad('需要 {pick:true} / {reset:true} / {dir:"库根内相对路径或浏览根内绝对路径"}')
    }
  }

  // ②b GET /api/thumb —— 缩略图（web/mp4 档都要能出图；缺什么补什么）
  if (p === '/api/thumb' && (req.method === 'GET' || req.method === 'HEAD')) {
    const item = assertItemId(q.get('item') || '')
    const w = Math.max(16, Math.min(LIMITS.thumbPixels, Number(q.get('w')) || 320))
    const plan = thumbPlan(item)
    if (plan.kind === 'file') {
      return sendFile(req, res, plan.path, {
        headers: {
          'X-Bench-Thumb': plan.from, 'X-Bench-Item': encodeURIComponent(item),
          'Cache-Control': STORE ? 'no-cache' : NO_STORE,
        },
      }) ? undefined : (() => { throw notFound(`缩略图不可读：${item}`) })()
    }
    if (plan.kind === 'none') {
      return json(res, 501, {
        ok: false, unsupported: true, degraded: true, itemId: item, kind: plan.item.kind,
        error: `无法为 ${item} 生成缩略图：${plan.reason}`, reason: plan.reason, hint: plan.hint,
      })
    }
    if (plan.kind === 'container') {
      // 容器内**未压缩** preview.*：只回这一段字节（先过图像魔数校验，上限 2MB）
      res.writeHead(200, {
        'Content-Type': plan.mime, 'Content-Length': String(plan.bytes.length),
        'Cache-Control': NO_STORE, 'X-Bench-Server': 'we-scene-demo-8902',
        'X-Bench-Thumb': plan.from, 'X-Bench-Item': encodeURIComponent(item),
        'X-Bench-Container': encodeURIComponent(plan.container), 'X-Bench-Entry': encodeURIComponent(plan.entry),
      })
      if (req.method === 'HEAD') return res.end()
      return res.end(plan.bytes)
    }
    // 视频档：库里没有 preview.* ⇒ 用本机 ffmpeg 抽一帧，缓存到 <reports>/bench-thumbs/<item>-<w>.jpg
    const bin = findFfmpeg()
    if (!bin) {
      return json(res, 501, {
        ok: false, unsupported: true, degraded: true, itemId: item, kind: plan.item.kind,
        error: `无法为 ${item} 生成缩略图：本机没有 ffmpeg（PATH 里找不到）`,
        reason: '视频档没有 preview.* 时必须抽帧；抽帧需要本机 ffmpeg',
        hint: '装 ffmpeg，或把 preview.gif/jpg/png 放进壁纸目录',
      })
    }
    const out = thumbCachePath(item, w)
    const srcSt = statSafe(plan.src)
    const cached = statSafe(out)
    const fresh = cached && cached.isFile() && cached.size > 0 && srcSt && cached.mtimeMs >= srcSt.mtimeMs
    if (!fresh) {
      mkdirSafe(THUMB_DIR)
      const r = await runFfmpegFrame(plan.src, out, w)
      if (!r.ok) {
        return json(res, 501, {
          ok: false, unsupported: true, degraded: true, itemId: item, kind: plan.item.kind,
          error: `ffmpeg 抽帧失败：${r.code} ${r.message || ''}`.trim(),
          reason: '视频档没有 preview.*，抽帧也没成功（如实降级，不假装有图）', ffmpeg: bin,
        })
      }
      recordDiag(`bench: 缩略图抽帧 ${item} ← ${path.basename(plan.src)}（${r.bytes} B → ${out}）`, 'info', 'thumb')
    }
    if (!sendFile(req, res, out, { headers: { 'X-Bench-Thumb': plan.from, 'X-Bench-Item': encodeURIComponent(item), 'Cache-Control': NO_STORE } })) {
      throw notFound(`缩略图生成后不可读：${item}`)
    }
    return undefined
  }

  // ②c GET /api/mpkg —— 只读容器目录表（`.mpkg`/`.pkg` 里到底是 scene / video / web）
  if (p === '/api/mpkg' && (req.method === 'GET' || req.method === 'HEAD')) {
    const item = assertItemId(q.get('item') || '')
    const dir = itemDirReal(item)
    const st = statSafe(dir)
    if (!st || !st.isDirectory()) throw notFound(`壁纸不存在：${item}`)
    const real = realpathDeepest(dir)
    if (!isInside(activeRoot, real)) throw forbidden(`条目经符号链接越出库根：${item}`)
    const want = q.get('file') || ''
    const names = listDirNames(dir, 400).filter((n) => MPKG_EXT_RE.test(n))   // .mpkg 与 .pkg 都是 PKG 家族，都读表
    const file = want ? assertFileName(want, 'file') : names[0]
    if (!file) throw notFound(`${item} 里没有 .mpkg/.pkg 文件`)
    if (!names.includes(file)) throw notFound(`${item} 里没有这个容器：${file}`)
    const abs = path.join(dir, file)
    const absReal = realpathDeepest(abs)
    if (!isInside(activeRoot, absReal)) throw forbidden(`容器经符号链接越出库根：${file}`)
    const sum = mpkgSummary(abs, file)
    return jsonOk(res, {
      itemId: item, file, abs, size: sum.size, magic: sum.magic || null,
      tableOk: sum.tableOk, tableReason: sum.tableReason, entries: sum.entries,
      kind: sum.kind, signals: sum.signals, entryNames: sum.entryNames,
      declared: sum.project, previewInContainer: sum.previewInContainer,
      readOnly: true, note: '只读容器**目录表**（不解包、不解压、不整包读）；条目字节不在本服务职责内',
      available: names,
    })
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
    // 安全闸（①2026-09-19 选择器轮）：库根现在可以由选择器指到浏览根内**任何**目录 ⇒ 真删前先确认
    //   这一项**确实像壁纸**。没有任何壁纸信号（kind=unknown 且无 project.json）时，必须显式 ack。
    //   dryRun 不受影响（上面那条分支照旧只回计划）。
    const sig = libraryItem(item, makeBudget(4000))
    if (sig && !sig.renderable && sig.kind === 'unknown' && !sig.hasProject && body.ack !== true) {
      throw new HttpError(409, `拒绝删除：${item} 没有任何壁纸信号（不是壁纸目录）`, {
        needsAck: true, itemId: item, kind: sig.kind, signals: sig.signals,
        reason: '选择器可以把库根指到任意目录 ⇒ 删"不像壁纸"的目录需要显式确认，防误删',
        hint: '确实要删就带 {ack:true} 重发（仍只移到回收站，可 mv 回滚）',
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
  const lib = librarySource()
  const libScan = (() => { try { const s = listLibrary(); return { count: s.count, missing: !!s.missing, kinds: s.scan.kinds, containerKinds: s.scan.containerKinds, signals: s.scan.signals, skipped: s.scan.skipped, skippedList: s.scan.skippedList, durationMs: s.scan.durationMs, budgetExceeded: s.scan.budgetExceeded, looseFiles: s.scan.looseFiles, looseMpkgFiles: s.scan.looseMpkgFiles } } catch (e) { return { error: String(e && e.message || e) } } })()
  const ffmpeg = findFfmpeg()
  return {
    ok: true, service: 'we-scene-demo-8902', port: PORT, pid: process.pid, node: process.version,
    startedAt: STARTED_AT, uptimeSec: Math.round((Date.now() - Date.parse(STARTED_AT)) / 1000),
    libraryRoot: activeRoot, configuredLibraryRoot: LIBRARY_ROOT_REAL, libraryRootExists: !!statSafe(activeRoot),
    libraryItems: libScan.count == null ? null : libScan.count,
    // 库来源（**显式**）：source ∈ env|cli|user|default|none；selected = 用户到底选过没有
    library: lib, libraryScan: libScan,
    librarySource: lib.source, librarySelected: lib.selected, libraryExplicit: lib.explicit,
    reportsDir: REPORTS_DIR, propsDir: PROPS_DIR, trashRoot: TRASH_ROOT, thumbDir: THUMB_DIR,
    staticRoot: STATIC_ROOT, staticMounts: ['/', '/demo/', '/WEwebLoader/', '/wallpaper-engine-webgl/'], staticStore: STORE ? 'cache' : 'no-store',
    mediaBase: '/media/dev', webBase: '/web/dev', rendererPage: '/wallpaper-engine-webgl/renderer/index.html',
    dirPicker: {
      available: !!statSafe(PICK_ROOT_REAL), readOnly: true, browseRoot: PICK_ROOT_REAL, browseRootFrom: PICK_ROOT_FROM,
      home: os.homedir() || '/', platform: process.platform,
      routes: {
        roots: 'GET /api/fs/roots', listAbs: 'GET /api/fs/list?path=', pickAbs: 'POST /api/fs/pick',
        list: 'GET /api/dir-list?path=', parent: 'GET /api/dir-parent?path=', pick: 'POST /api/dir-pick',
        commit: 'POST /api/library-dir {dir|?path=}', compat: 'GET /list-dirs?path=', source: 'GET /api/library-source',
      },
      escapes: '相对路径含 .. ⇒ 400；绝对路径越浏览根 ⇒ 403；符号链接逃逸 ⇒ 403（不列出）；NUL/控制符 ⇒ 400',
      systemPickerFallback: '页面自带 showDirectoryPicker/webkitdirectory（Android 上即系统选择器）只能作兜底；服务端这条路由才是环境内路径的正路',
    },
    thumb: ffmpeg
      ? { available: true, engine: 'ffmpeg', ffmpeg, dir: THUMB_DIR, route: 'GET /api/thumb?item=&w=' }
      : { available: false, engine: 'preview-file-only', status: 501, route: 'GET /api/thumb?item=&w=', reason: '没有 preview.* 的视频档无法抽帧（PATH 里没有 ffmpeg）' },
    diag: { buffer: diagBuffer.length, bufferLimit: LIMITS.diagBuffer, seq: diagSeq, sseClients: sseClients.size, sink: ['GET /diag?msg=', 'POST /diag'], source: 'self (ring buffer; not a :8899 proxy)' },
    reveal: opener ? { available: true, opener: opener.path } : { available: false, status: 501, tried: [OPEN_CMD_ENV, 'termux-open', 'xdg-open', 'open'].filter(Boolean) },
    capabilities: {
      staticBench: true, mediaDev: true, webDev: true, rangeRequests: true,
      libraryList: true, libraryDirEnumerate: true, libraryDirNarrow: true,
      librarySourceReport: true, librarySelectAbsolute: true, fullTypeScan: true, mpkgContainerIndex: true,
      dirBrowse: true, dirParent: true, dirPick: true, dirPickerCompat: true, serverDirPicker: true,
      thumbRoute: true, thumbFfmpeg: !!ffmpeg,
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
        httpStatusUsed: 200, body: '{cancelled:true, unsupported:true, degraded:true, degradedStatus:501, picker:"server", serverPicker:{…}}',
        reason: '宿主系统对话框这条能力真的没有（本服务是 Node 服务，不经手 Android/桌面选择器）；调用方 bench-DSKWIqmS.js 用 `if(!e.ok||t.error) throw` 判失败 ⇒ 回 501 会把它的回退**掐掉**，故用 200 + unsupported 明确降级。**页面不再需要退回系统选择器**：browse 用 GET /api/dir-list、commit 用 POST /api/library-dir {dir}（绝对路径，浏览根内任意目录）',
      },
      {
        endpoint: 'POST /api/props-dir', when: '{pick:true}', capability: 'native-folder-picker', capabilityStatus: 501,
        httpStatusUsed: 200, body: '{cancelled:true, unsupported:true, degraded:true, degradedStatus:501}',
        reason: '同上：宿主对话框没有；目录型用户属性请改用服务端选择器（GET /api/dir-list → POST /api/dir-pick）',
      },
      {
        endpoint: 'POST /api/reveal', when: '找不到 termux-open/xdg-open/open 或启动失败', capability: 'open-in-file-manager', capabilityStatus: 501,
        httpStatusUsed: 501, body: '{ok:false, unsupported:true, error, reason, hint}',
        reason: '无头/精简环境没有打开器；按能力不可用**真回 501**（调用方本来就把它当错误显示），绝不是 500',
      },
      {
        endpoint: 'GET /api/thumb', when: '视频档没有 preview.* 且本机没有 ffmpeg', capability: 'video-thumbnail', capabilityStatus: ffmpeg ? 200 : 501,
        httpStatusUsed: ffmpeg ? 200 : 501, body: ffmpeg ? 'image/jpeg（ffmpeg 抽帧，缓存到 <reports>/bench-thumbs/）' : '{ok:false, unsupported:true, degraded:true, error, reason, hint}',
        reason: ffmpeg ? '有 ffmpeg：视频档能抽帧' : '没有 ffmpeg：视频档缩略图只能用库里现成的 preview.*，没有就如实 501',
      },
      {
        endpoint: 'GET /api/thumb', when: 'mpkg 容器条目没有库内 preview.*', capability: 'container-thumbnail', capabilityStatus: 501,
        httpStatusUsed: 501, body: '{ok:false, unsupported:true, degraded:true, error, reason, hint}',
        reason: '本服务只读容器**目录表**（不解包）；容器内 preview.gif 需要插件侧 pkg-extract 解包后才有图',
      },
      {
        endpoint: 'GET /api/library', when: '顶层散落 .mpkg 文件（不是目录）', capability: 'loose-container-item', capabilityStatus: 501,
        httpStatusUsed: 200, body: '{items:[…], scan:{looseFiles, looseMpkgFiles}}',
        reason: '列表只收**目录型**壁纸条目；顶层 .mpkg 文件如实计数在 scan.looseMpkgFiles 里（不假装扫到了，也不静默丢掉）',
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

  // 兼容壳：与插件 `dsh-mpkg-wallpaper` 的 `GET /list-dirs?path=` **逐字段同形**
  //   （`{ok, dir, subdirs, home, platform}`）—— 从插件侧搬过来的选择器代码可以一行不改地跑在本服务上。
  if (p === '/list-dirs' || p === '/list-dirs/') {
    return done(() => {
      const dir = assertBrowsePath(url.searchParams.get('path') || '')
      const payload = dirListing(dir, { files: false })
      const home = os.homedir() || '/'
      const within = isInside(PICK_ROOT_REAL, home)
      return jsonOk(res, {
        dir: payload.dir, subdirs: payload.dirs.map((d) => d.name), home,
        platform: process.platform,
        // 兼容字段之外**额外**给出服务端选择器的事实（不改变上面的形状）
        parent: payload.parent, atRoot: payload.atRoot, browseRoot: PICK_ROOT_REAL,
        homeInsideBrowseRoot: within, dirs: payload.dirs, counts: payload.counts,
        note: within ? undefined : '家目录不在浏览根内：home 只作展示，path 必须落在 browseRoot 之内',
      })
    })
  }

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
  const lib = healthSnap.library
  line(`  库来源(显式)   : source=${lib.source} selected=${lib.selected}（${lib.reason}）`)
  line(`  浏览根(只读)   : ${PICK_ROOT_REAL}（${PICK_ROOT_FROM}）—— 选择器：GET /api/dir-list · GET /api/dir-parent · POST /api/dir-pick · 兼容壳 GET /list-dirs`)
  line(`  全类型扫描     : ${JSON.stringify(healthSnap.libraryScan.kinds || {})}（container: ${JSON.stringify(healthSnap.libraryScan.containerKinds || {})}）` +
    `；跳过 ${healthSnap.libraryScan.skipped == null ? '?' : healthSnap.libraryScan.skipped} 项（原因见 /api/library 的 scan.skippedList）`)
  line(`  缩略图         : GET /api/thumb?item=&w=（现成 preview.* 直出${healthSnap.thumb.available ? '；视频档用 ' + healthSnap.thumb.ffmpeg + ' 抽帧' : '；**没有 ffmpeg** ⇒ 无 preview 的视频档如实 501'}）`)
  line(`  属性覆盖落点   : ${PROPS_DIR}/<itemId>.json（不写进壁纸包；缩略图缓存落 ${THUMB_DIR}）`)
  line(`  回收站         : ${TRASH_ROOT}/<时间戳>/<itemId>（删除默认 dryRun；?confirm=1 才移入；可 mv 回滚）`)
  line(`  诊断流         : GET /api/diag-stream（SSE，环形缓冲 ${LIMITS.diagBuffer} 条；来源 GET /diag?msg= 与 POST /diag，**不代理 :8899**）`)
  line(`  健康自述       : http://127.0.0.1:${PORT}/__health`)
  line(`  降级为 501 的能力（见 /__health.degraded）：`)
  for (const d of healthSnap.degraded) line(`    · ${d.endpoint} ${d.when} → 能力 501（${d.capability}）；HTTP 用 ${d.httpStatusUsed}：${d.reason.slice(0, 60)}…`)
  line(opener ? `  /api/reveal 打开器：${opener.path}` : '  /api/reveal 打开器：**没有**（找不到 termux-open/xdg-open/open ⇒ 真回 501 + 说明）')
  line(`已就绪。curl 自检： curl -s http://127.0.0.1:${PORT}/__health | head -30`)
})
