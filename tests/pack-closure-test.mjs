// pack-closure-test.mjs —— **发布面闭合性**门禁：真打一个 tarball、解开、把入口**真的 import 一次**，
//   再静态核对"代码里引用的相对模块与 URL 资源都在包里"。反方向也查：包里不许有"发了但谁也引不到"的运行时代码。
//
// 为什么需要它（2026-09-20 真实事故：0.2.0 已经发出去才发现）：
//   `package.json.files` 是**白名单**：新增源文件如果没人往白名单里加，它就不会进 tarball。
//   0.1.1 → 0.2.0 之间新增了 `core/we-pointer-source.mjs`、`core/we-particle-pointer.mjs`、
//   `server/pkg-entry-index.mjs`，三张都**没**进白名单 ⇒ 装下来的包一 `import` 就炸：
//     Cannot find module '…/core/we-particle-pointer.mjs' imported from '…/core/we-scene-bundle.js'
//   `packaging-test.mjs` 查的是"白名单里每条路径**存在**"（方向反了）：它管不了"代码 import 了但白名单里没有"。
//   本文件补上那个反方向，而且**以真实装载为准**（静态扫描只当第二道网）。
//
// 判据（任一不满足 ⇒ 退出码 1）：
//   A `npm pack --pack-destination <tmp> --json` 真打包 ⇒ 清单非空 + `main`/`exports` 目标都在包里；
//   B **真装载**（决定性判据）：解开 tarball
//     B1 `core/we-scene.mjs` / `core/we-scene-bundle.js` / `vendor/hlsl2glsl/hlsl2glsl.js` 三个入口
//        在**解开的包内**能被 `import()` 起来（消费者第一件事就是这个）；
//     B2 两个服务入口（`server/we-scene-demo-server.mjs`、`…-8902.mjs`）能在包内**启动到打印 banner**
//        且 stderr 没有 `Cannot find module` / `ERR_MODULE_NOT_FOUND`（跑 `PORT=0`，验完即杀）；
//   C 静态核对（第二道网，覆盖 URL 资源与 HTML 引用）：
//     C1 从入口走相对 import 闭包，每条都要在包里解析到；
//     C2 代码/页面里引用的**绝对 URL** 都能映射到包内文件（服务端挂载口径 + 下面那张别名表）；
//     C3 两份**明确不随包发布**的引用登记在案（每条给出理由与"谁引用"）；
//   D 反向：包里的运行时代码不许有"谁也引不到"的死文件；
//   E 复现力自证：把一条**被 import 的模块**从包里删掉（模拟"新增文件忘了进白名单"）⇒ B1 必须变红。
//
// 用法: node tests/pack-closure-test.mjs [--json]
// 退出码：0 全绿 / 1 有失败
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(import.meta.dirname, '..')
const JSON_OUT = process.argv.includes('--json')

let pass = 0, fail = 0
const results = []
const check = (name, cond, detail = '') => {
  const ok = !!cond
  results.push({ name, ok, detail: String(detail).slice(0, 400) })
  if (ok) { pass++; console.log('  ✓ ' + name + (detail ? '  [' + String(detail).slice(0, 220) + ']' : '')) }
  else { fail++; console.error('  ✗ ' + name + (detail ? '  [' + String(detail).slice(0, 400) + ']' : '')) }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-packclosure-'))
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* tmp 清不掉不致命 */ } })

// ── A 真打包 ───────────────────────────────────────────────────────────────────────────────────────
const packOut = execFileSync('npm', ['pack', '--pack-destination', tmp, '--json'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 })
const packInfo = JSON.parse(packOut)[0] || {}
const tgz = path.join(tmp, String(packInfo.filename || ''))
const shipped = (packInfo.files || []).map((f) => String(f.path).replace(/\\/g, '/')).filter(Boolean)
const shippedSet = new Set(shipped)
check('A1 `npm pack` 打出 tarball 且清单非空（发布面以 npm 自己的展开为准）',
  fs.existsSync(tgz) && shipped.length > 50, `${packInfo.filename} · ${shipped.length} 个文件 · ${(packInfo.size / 1048576).toFixed(2)}MB`)

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const exportTargets = []
for (const v of Object.values(pkg.exports || {})) {
  if (typeof v === 'string') exportTargets.push(v)
  else if (v && typeof v === 'object') for (const t of Object.values(v)) if (typeof t === 'string') exportTargets.push(t)
}
const jsEntries = [...new Set([pkg.main, ...exportTargets].filter(Boolean).map((s) => s.replace(/^\.\//, '')))]
const missingEntries = jsEntries.filter((e) => e !== 'package.json' && !shippedSet.has(e))
check('A2 `main` 与 `exports` 的每个目标都在包里（入口本身先别缺）', jsEntries.length >= 4 && missingEntries.length === 0,
  '入口=' + jsEntries.join(',') + (missingEntries.length ? ' —— 缺:' + missingEntries.join(',') : ''))

// ── B 真装载（决定性判据）──────────────────────────────────────────────────────────────────────────
const extract = path.join(tmp, 'x')
fs.mkdirSync(extract, { recursive: true })
execFileSync('tar', ['-xzf', tgz, '-C', extract], { stdio: ['ignore', 'pipe', 'pipe'] })
const PKG = path.join(extract, 'package')
check('B0 tarball 解开后是 `package/`（布局符合 npm 约定）', fs.existsSync(path.join(PKG, 'package.json')), PKG)

/** 在**解开的包内**真 import 三个入口。子进程做：一个入口炸了不影响其余，且不会污染本进程的模块缓存。 */
const importScript = `
const list = ${JSON.stringify(['core/we-scene.mjs', 'core/we-scene-bundle.js', 'vendor/hlsl2glsl/hlsl2glsl.js'])}
const out = []
for (const rel of list) {
  try { const m = await import(new URL(rel, ${JSON.stringify(pathToFileURL(PKG).href + '/')})); out.push({ rel, ok: true, exports: Object.keys(m).length }) }
  catch (e) { out.push({ rel, ok: false, err: (e && (e.code || e.message)) || String(e) }) }
}
console.log('IMPORT-JSON ' + JSON.stringify(out))
`
const imp = spawnSync(process.execPath, ['--input-type=module', '-e', importScript], { encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 })
const impLine = (imp.stdout || '').split('\n').filter((l) => l.startsWith('IMPORT-JSON ')).pop()
let impRows = []
try { impRows = JSON.parse(impLine.slice('IMPORT-JSON '.length)) } catch { impRows = [] }
const badImports = impRows.filter((r) => !r.ok)
check('B1 **消费者视角**：`import("wallpaper-engine-web-loader")` 那三个入口在解开的包里真的能 import 起来',
  impRows.length === 3 && badImports.length === 0,
  badImports.length ? badImports.map((r) => r.rel + ' ⇒ ' + r.err).join(' ; ') : impRows.map((r) => r.rel + '(' + r.exports + ' 导出)').join(' · '))
/** 服务入口：跑 `PORT=0` 到打印 banner；只看 stderr 有没有"找不到模块"。 */
for (const rel of ['server/we-scene-demo-server.mjs', 'server/we-scene-demo-server-8902.mjs']) {
  const r = spawnSync(process.execPath, [path.join(PKG, rel)], {
    encoding: 'utf8', timeout: 9000, maxBuffer: 32 * 1024 * 1024,
    // ⚠ MPW_ROOT 用**真工作区根**（`<repo>/..`）：README「自带服务器需要一个包解析器（MIT 插件
    //   dsh-mpkg-wallpaper 的 lib/pkg-extract.js）：把它与渲染器放在同一父目录即可」—— 这正是本仓的布局；
    //   语料根指到不存在的目录（不读用户壁纸），reports 落 tmp（不写工作区）。
    env: { ...process.env, PORT: '0', MPW_SCENE_ROOT: path.join(tmp, 'no-corpus'), MPW_ROOT: path.resolve(ROOT, '..'), MPW_REPORTS_DIR: path.join(tmp, 'reports'), MPW_OPEN_CMD: '/bin/true' },
  })
  const err = String(r.stderr || '')
  const out = String(r.stdout || '')
  const bad = /Cannot find module|ERR_MODULE_NOT_FOUND/.test(err + out)
  check('B2 服务入口在包内能启动（`' + rel + '`，PORT=0）：stderr 无"找不到模块"',
    !bad, bad ? (err + out).split('\n').filter((l) => /Cannot find module|ERR_MODULE_NOT_FOUND/.test(l)).slice(0, 2).join(' | ') : '已跑到 banner 后被杀（timeout=' + (r.error && r.error.code) + '）')
}

// ── C 静态核对（第二道网）──────────────────────────────────────────────────────────────────────────
/** 只删**行首/块**注释：避免"注释里出现 import 字样"造成假红；用状态机而不是正则，免得字符串里的 `/*` 把代码吃掉。 */
function stripJsComments(src) {
  let out = '', i = 0, mode = null   // mode: null | "'" | '"' | '`' | '//' | '/*'
  while (i < src.length) {
    const c = src[i], n = src[i + 1]
    if (mode === null) {
      if (c === '/' && n === '/') { mode = '//'; i += 2; continue }
      if (c === '/' && n === '*') { mode = '/*'; i += 2; continue }
      if (c === "'" || c === '"' || c === '`') mode = c
      out += c; i++; continue
    }
    if (mode === '//') { if (c === '\n') { mode = null; out += c } i++; continue }
    if (mode === '/*') { if (c === '*' && n === '/') { mode = null; i += 2; continue } if (c === '\n') out += c; i++; continue }
    // 字符串/模板里：照抄，处理转义与闭合
    if (c === '\\') { out += c + (n || ''); i += 2; continue }
    if (c === mode) mode = null
    out += c; i++
  }
  return out
}
const CAND = (t) => [t, t + '.mjs', t + '.js', t + '.cjs', t + '.json', t + '/index.mjs', t + '/index.js', t + '/index.json']
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"](\.\.?\/[^'"]+)['"]/g
const HTML_REF_RE = /(?:src|href)\s*=\s*["'](\.\.?\/[^"']+)["']/g
const URL_REF_RE = /['"`](\/[A-Za-z0-9._@-][A-Za-z0-9._@/-]*\.(?:mjs|js|cjs|json|html|css|wasm|png|jpg|jpeg|gif|webp|svg|ttf|otf|woff2?|pkg|mpkg))['"`]/g
/** 显然**不是包内资源**的宿主路径前缀（运行期临时目录/用户目录）：扫到就跳过，别当成"包缺文件"。 */
const HOST_PATH_PREFIXES = ['/tmp/', '/var/', '/root/', '/home/', '/data/', '/proc/', '/dev/']
/** 服务端挂载口径：`/x` ⇒ 仓库根 / `web/` / `core/` / `assets/`（都是真存在的映射，见 server/**）。 */
const URL_MOUNT_TRIES = [(u) => u.replace(/^\//, ''), (u) => 'web/' + u.replace(/^\//, ''), (u) => 'core/' + u.replace(/^\//, ''), (u) => 'assets/' + u.replace(/^\//, '')]
/** **服务端别名路由**：URL ≠ 包内路径，但服务端把它映射到某个真文件。
 *  这里**从服务端源码自动提取**（`path.join(CORE_DIR, 'x')` 那几行就是"根 URL ⇒ core/ 下文件"的映射表），
 *  免得手抄一张会腐烂的表；提取不到任何一条时判据会红（说明服务端改了写法，得回来看这里）。 */
function coreAliasesFromServer() {
  const src = fs.readFileSync(path.join(ROOT, 'server', 'we-scene-demo-server.mjs'), 'utf8')
  const m = new Map([['/bundle.js', { file: 'core/we-scene-bundle.js', why: '服务端把 /bundle.js 映射到 core/we-scene-bundle.js（产物根文件名约定）' }]])
  const re = /path\.join\(CORE_DIR,\s*'([^']+)'\)/g
  let x
  while ((x = re.exec(src))) m.set('/' + x[1], { file: 'core/' + x[1], why: 'server/we-scene-demo-server.mjs 的 CORE_DIR 路由表' })
  return m
}
const URL_ALIASES = coreAliasesFromServer()
check('C0 服务端别名表能从源码提取到（`CORE_DIR` 路由）', URL_ALIASES.size >= 5, [...URL_ALIASES.keys()].join(' '))
/** 明确**不随包发布**的引用（每条都要写清理由；判据要求那句话真的能在引用文件里找到，防"白名单变遮羞布"）。 */
const NOT_SHIPPED_OK = [
  { url: './demo/', in: 'index.html', why: '测试台目录（66MB，含本机构建残留）按 docs/RELEASE.md §5 不进 tarball；落地页那条链接在包里会 404，是已登记的口径' },
  { url: './demo/mpw-select.js', in: 'demo.html', why: '测试台自绘下拉：demo.html 引用它，但测试台整体不进包（同上）' },
  { url: './demo/mpw-select-math.mjs', in: 'demo.html', why: '同上一行' },
  { url: '/diag-flags.json', in: 'web/sw-policy.mjs', why: '面板开关数据源随站点外壳发布，不在 npm 运行面（docs/PACKAGING.md 的白名单口径）' },
  { url: '/demo/mpw-select.js', in: 'web/sw-policy.mjs', why: '测试台自绘下拉，属测试台（同上不进包）' },
  { url: '/demo/mpw-select-math.mjs', in: 'web/sw-policy.mjs', why: '测试台自绘下拉的纯函数模块（同上不进包）' },
  { url: '/demo/mpw-select.js', in: 'web/sw.js', why: 'SW 自己的预缓存清单里也列了测试台那两个模块（同上不进包）' },
  { url: '/demo/mpw-select-math.mjs', in: 'web/sw.js', why: '同上一行' },
  { url: '/diag-flags.json', in: 'server/we-scene-demo-server.mjs', why: '服务端的静态路由表里登记了这个数据源（随站点外壳发布，不在 npm 运行面）' },
  { url: '/demo/mpw-select.js', in: 'server/we-scene-demo-server.mjs', why: '服务端的静态路由表里提到测试台模块（测试台不进包）' },
  { url: '/demo/mpw-select-math.mjs', in: 'server/we-scene-demo-server.mjs', why: '同上一行' },
  /* `:8902` 服务里那条**产物写死的 iframe 路径**指向的是上游渲染器产物（在 `demo/assets/**` 里），
     而 `demo/` 整体不进 tarball（见 docs/RELEASE.md §5）⇒ 与上一条同一口径；服务自己会以 404 如实回应。 */
  { url: '/wallpaper-engine-webgl/renderer/index.html', in: 'server/we-scene-demo-server-8902.mjs', why: '测试台 iframe 写死的渲染器页路径：产物在 demo/（按 docs/RELEASE.md §5 不进包）' },
]
/** 明确**依赖包外**的引用（下游自备，理由要与仓库文档逐字对得上，判据会去核对那句 needle）。 */
const EXTERNAL_OK = [
  {
    url: '/dsh-mpkg-wallpaper/lib/pkg-extract.js', in: 'server/we-scene-demo-server.mjs',
    why: '包解析器是**另一个仓库**（MIT 插件）；README「直接从源码跑」节写明：把它与渲染器放同一父目录，或用 MPW_PKG_EXTRACT= 指定',
    needleIn: 'README.md', needle: 'MPW_PKG_EXTRACT',
  },
]
const htmlEntries = shipped.filter((f) => /\.html$/.test(f))
/* ①(`:8902` 服务是**随包发布但不在 `exports` 里**的独立入口：`node server/we-scene-demo-server-8902.mjs`）
   ⇒ 它必须也当闭包根：否则它 import 的东西（例如 `server/upload-policy.mjs`）会被 D1 判成"发了没人引用的死文件"
   （实测踩到）。这条与 `DYNAMIC_OK` 里的"文档登记的独立入口"是同一条事实，两处都要一致。 */
const standaloneEntries = shipped.filter((f) => f === 'server/we-scene-demo-server-8902.mjs')
const entries = [...jsEntries, ...htmlEntries, ...standaloneEntries]

function closure(fileSet, entryList) {
  const visited = new Set()
  const missingImports = []
  const missingUrls = []
  const visit = (rel) => {
    if (visited.has(rel)) return
    visited.add(rel)
    let raw = ''
    try { raw = fs.readFileSync(path.join(PKG, rel), 'utf8') } catch { try { raw = fs.readFileSync(path.join(ROOT, rel), 'utf8') } catch { return } }
    if (!/\.(mjs|js|cjs|html|htm)$/.test(rel)) return
    const src = stripJsComments(raw)
    let m
    /** 解析一个相对说明符：先当文件系统路径，再当**服务端 URL 别名**（`./bundle.js`、`../../we-scene-bundle.js`
     *  这类在文件系统里不存在，但服务端按 URL 映射到 `core/` 下的真文件），最后看"已登记不进包"的清单。 */
    const resolveSpec = (relFile, spec) => {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(relFile), spec))
      const hit = CAND(target).find((c) => fileSet.has(c))
      if (hit) return { hit }
      const alias = URL_ALIASES.get('/' + target)
      if (alias && fileSet.has(alias.file)) return { hit: alias.file }
      const excused = NOT_SHIPPED_OK.some((x) => x.in === relFile && (x.url === spec || x.url === './' + target || x.url === target))
      if (excused) return { excused: true }
      return { missing: target }
    }
    IMPORT_RE.lastIndex = 0
    while ((m = IMPORT_RE.exec(src))) {
      const r = resolveSpec(rel, m[1])
      if (r.hit) visit(r.hit)
      else if (!r.excused) missingImports.push({ from: rel, spec: m[1], target: r.missing })
    }
    if (/\.html?$/.test(rel)) {
      HTML_REF_RE.lastIndex = 0
      while ((m = HTML_REF_RE.exec(src))) {
        const r = resolveSpec(rel, m[1])
        if (r.hit) visit(r.hit)
        else if (!r.excused) missingImports.push({ from: rel, spec: m[1], target: r.missing, html: true })
      }
    }
    URL_REF_RE.lastIndex = 0
    while ((m = URL_REF_RE.exec(src))) {
      const u = m[1]
      if (HOST_PATH_PREFIXES.some((pre) => u.startsWith(pre))) continue   // 宿主临时/用户路径：不是包内资源
      const direct = URL_MOUNT_TRIES.map((f) => f(u)).find((c) => fileSet.has(c))
      const alias = URL_ALIASES.get(u)
      const aliasHit = alias && fileSet.has(alias.file)
      const excused = NOT_SHIPPED_OK.some((x) => x.url === u && x.in === rel && raw.includes(u))
      const external = EXTERNAL_OK.some((x) => {
        if (x.url !== u || x.in !== rel || !raw.includes(u)) return false
        try { return fs.readFileSync(path.join(ROOT, x.needleIn), 'utf8').includes(x.needle) } catch { return false }
      })
      if (direct || aliasHit || excused || external) { if (direct) visit(direct); if (aliasHit) visit(alias.file); continue }
      missingUrls.push({ from: rel, url: u })
    }
  }
  for (const e of entryList) if (fileSet.has(e)) visit(e)
  return { visited, missingImports, missingUrls }
}
const { visited, missingImports, missingUrls } = closure(shippedSet, entries)
check('C1 入口闭包内每条**相对 import** 都能在包里解析到（含扩展名候选与 index.*）', missingImports.length === 0,
  missingImports.length ? missingImports.slice(0, 6).map((x) => x.from + ' → ' + x.spec).join(' ; ') + (missingImports.length > 6 ? ` …共 ${missingImports.length} 条` : '') : '闭包 ' + visited.size + ' 个模块')
check('C2 代码/页面里引用的**绝对 URL** 都能映射到包内文件（挂载口径 + 别名表 + 已登记的不进包项）', missingUrls.length === 0,
  missingUrls.length ? missingUrls.slice(0, 6).map((x) => x.from + ' → ' + x.url).join(' ; ') + (missingUrls.length > 6 ? ` …共 ${missingUrls.length} 条` : '') : 'URL 引用全部命中')
check('C3 闭包至少走到 25 个模块（防止"入口只剩一个空壳"也算绿）', visited.size >= 25, 'visited=' + visited.size)

// ── D 反向：运行时代码不许有死文件 ──────────────────────────────────────────────────────────────────
const RUNTIME_DIRS = ['core/', 'server/', 'web/', 'elysia/', 'vendor/']
const runtimeShipped = shipped.filter((f) => RUNTIME_DIRS.some((d) => f.startsWith(d)) && /\.(mjs|js|cjs)$/.test(f))
// 由**运行期动态 import / 宿主直接当脚本跑**取用的：每条都给出可核对的引用点（判据会去文件里找那句话）。
const DYNAMIC_OK = new Map([
  ['web/sw-policy.mjs', { in: 'web/sw.js', needle: "from './sw-policy.mjs'", why: 'SW 的 module worker 按相对说明符 import' }],
  ['server/we-scene-demo-server.mjs', { in: 'package.json', needle: '"server/we-scene-demo-server.mjs"', why: 'exports["./server"] 指向它（也是 start-demo.sh 的入口）' }],
  ['server/we-scene-demo-server-8902.mjs', { in: 'docs/RELEASE.md', needle: 'server/we-scene-demo-server-8902.mjs', why: '文档登记的独立入口（`node server/…-8902.mjs` 起一站式测试台）' }],
  // 上游 vendor 树自带的**空 stub**（文件内容只有 `export {}`）：vendor 整树按原样分发，不单独裁剪
  //   （裁剪会让 THIRD-PARTY/许可校验与上游逐字节对不上）。
  ['elysia/vendor/@shaderfrog/glsl-parser/preprocessor/preprocessor-node.js',
    { in: 'elysia/vendor/@shaderfrog/glsl-parser/preprocessor/preprocessor-node.js', needle: 'export {}', why: '上游 vendor 空 stub，vendor 整树原样分发' }],
])
const dead = []
for (const f of runtimeShipped) {
  if (visited.has(f)) continue
  const ex = DYNAMIC_OK.get(f)
  if (ex) {
    let ok = false
    try { ok = fs.readFileSync(path.join(ROOT, ex.in), 'utf8').includes(ex.needle) } catch { ok = false }
    if (ok) continue
    dead.push(f + '（登记理由核对失败：' + ex.in + ' 里找不到 ' + ex.needle + '）')
    continue
  }
  dead.push(f)
}
check('D1 包里的运行时代码**没有"发了但谁也引不到"的死文件**（否则要么收窄白名单，要么补接线）',
  dead.length === 0, dead.length ? dead.slice(0, 8).join(', ') + (dead.length > 8 ? ` …共 ${dead.length} 个` : '') : `运行时代码 ${runtimeShipped.length} 个全部可达`)

// ── E 复现力自证：从包里删掉一条被 import 的模块 ⇒ B1 必红 ──────────────────────────────────────────
{
  const victim = ['core/we-particle-pointer.mjs', 'core/we-pointer-source.mjs'].find((f) => shippedSet.has(f)) ||
    [...visited].find((f) => /^core\/we-.*\.mjs$/.test(f) && f !== 'core/we-scene.mjs')
  if (!victim) {
    check('E1 找到可删的"被 import 的模块"做剔除实验', false, '包里没有 core/we-*.mjs')
  } else {
    const copyDir = path.join(tmp, 'mutant')
    fs.mkdirSync(copyDir, { recursive: true })
    execFileSync('tar', ['-xzf', tgz, '-C', copyDir], { stdio: ['ignore', 'pipe', 'pipe'] })
    const victimAbs = path.join(copyDir, 'package', victim)
    fs.rmSync(victimAbs, { force: true })
    const script = `
try { await import(new URL(${JSON.stringify('core/we-scene.mjs')}, ${JSON.stringify(pathToFileURL(path.join(copyDir, 'package')).href + '/')})); console.log('MUTANT-OK') }
catch (e) { console.log('MUTANT-FAIL ' + ((e && (e.code || e.message)) || e)) }
`
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 })
    const red = /MUTANT-FAIL/.test(r.stdout || '')
    check('E1 把「' + victim + '」从包里删掉（模拟"新增文件忘了进白名单"）⇒ 真装载必须失败（= 这条判据有分辨力）',
      red, red ? (r.stdout || '').split('\n').filter((l) => l.startsWith('MUTANT-FAIL'))[0].slice(0, 160) : '居然还能 import ⇒ 判据没有分辨力')
  }
}

console.log(`\n────\npack-closure-test：${pass} 通过 / ${fail} 失败（包内 ${shipped.length} 个文件，静态可达 ${visited.size} 个模块）`)
if (JSON_OUT) console.log('PACK-CLOSURE-TEST-JSON ' + JSON.stringify({ ok: fail === 0, shipped: shipped.length, visited: visited.size, failed: results.filter((r) => !r.ok) }))
process.exit(fail ? 1 : 0)
