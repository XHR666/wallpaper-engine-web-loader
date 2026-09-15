// build-pages.mjs —— 把仓库打成 GitHub Pages 的**纯静态**产物（P-93；形态口径见 docs/ONLINE-DEMO.md）
//
// 用法:
//   node build-pages.mjs                 # 产出到 ./_site（--out 可改）
//   node build-pages.mjs --out /tmp/site
//   node build-pages.mjs --json          # 机读摘要
//
// 设计约束（照 docs/ONLINE-DEMO.md §3 逐条落地）：
//   ① **零依赖、不联网**：只用 node: 内置模块（CI 里也不跑 pnpm install）；
//   ② **不改任何源文件**：整棵树是"读 + 拷贝"，源仓库保持原样；
//   ③ **显式白名单**（下面的 PAGES_KEEP_*）：站点只放"能看的东西"，测试脚本 / 服务端 /
//      打包工具 / 本机清单**一律不进产物**。白名单是发布面的**唯一**口径，读得出来、审得动；
//   ④ 产物里 `demo/` 出现两次：`/demo/` 与 `/wallpaper-engine-webgl/`。
//      为什么必须两份：上游静态产物（minified、**不可重建**）里写死了
//      `/wallpaper-engine-webgl/renderer/index.html`（iframe src）与 `/wallpaper-engine-webgl/sw.js`；
//      Pages 只能从仓库根发布 ⇒ 只有把测试台也放到根下的 `wallpaper-engine-webgl/`，那两条才不 404。
//      **仓库里只有一份物理文件**（demo/ 是真源，第二份只存在于构建产物里，且是真实拷贝不是软链）。
//   ⑤ 写 `.nojekyll`：否则 Jekyll 会吃掉下划线开头的文件；
//   ⑥ 软链**跟随解引用**（demo/samples → ../samples）：Pages 不解析软链，产物里必须是真文件。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = import.meta.dirname
const argv = process.argv.slice(2)
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const JSON_OUT = argv.includes('--json')
const OUT = path.resolve(ROOT, val('--out', '_site'))

// ── 发布面白名单（根级）──
const PAGES_KEEP_DIRS = ['demo', 'samples', 'assets', 'icons', 'vendor', 'elysia', 'extensions', 'docs']
const PAGES_KEEP_FILES = new Set([
  'index.html',        // 落地页（P-93 新增）
  'demo.html',         // 渲染器 demo
  'diag.html',
  'probe.html',
  'manifest.webmanifest',
  'sw.js',
  'we-scene-bundle.js', 'we-scene.mjs', 'we-scene-demo-server.mjs',
  'attach-transform.mjs', 'puppet-skin.js', 'scene-project-json.mjs',
  'make-sample.mjs', 'pack-dir.mjs',
  'LICENSE', 'THIRD-PARTY.md', 'PACKAGING.md',
  'README.md', 'README-PUBLIC.md', 'README-DIAGNOSTICS.md',
  'RENDERER-ARCHITECTURE.md', 'RENDERER-SANDBOX-CONTRACT.md',
  'TESTING.md', 'TESTING-PUBLIC.md', 'SELFCHECK.md', 'VISUAL-TESTING.md',
  'PATCHES.md', 'AUDIT.md', 'CLEANUP.md', 'KNOWN-ISSUES.md', 'EXTENSION-HOOKS.md',
])
// 白名单目录里也不发的形状（测试/闸门/上报产物）
const PAGES_SKIP_RE = [
  /-test\.mjs$/, /-check\.mjs$/, /-audit\.mjs$/, /-scan\.mjs$/, /-verify\.mjs$/, /-probe\.mjs$/,
  /^(run-all-tests\.sh|check\.sh|start-demo\.sh|keep-demo-server\.sh)$/,
  /^\.gitignore/, /(^|\/)\.DS_Store$/,
]
const skipByShape = (name) => PAGES_SKIP_RE.some((r) => r.test(name))

const copied = []
const skipped = []
function copyFile(src, dst, rel) {
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.copyFileSync(src, dst)
  copied.push(rel)
}
function copyTree(srcDir, dstDir, relBase) {
  fs.mkdirSync(dstDir, { recursive: true })
  for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const rel = relBase ? relBase + '/' + e.name : e.name
    if (skipByShape(e.name)) { skipped.push(rel); continue }
    const src = path.join(srcDir, e.name)
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'reports' || e.name === '__pycache__') { skipped.push(rel + '/'); continue }
    // ⚠ 软链**目录**必须跟随（真机踩到：`demo/samples → ../samples` 是软链目录，
    //   只看 `e.isDirectory()` 会把它整个漏掉 ⇒ 产物里没有 `demo/samples/` ⇒ 默认壁纸 404）。
    //   这里的判据一律用 statSync（跟随软链），不用 Dirent。
    let st = null
    try { st = fs.statSync(src) } catch { skipped.push(rel + ' (断链)'); continue }
    if (st.isDirectory()) { copyTree(src, path.join(dstDir, e.name), rel); continue }
    if (!st.isFile()) { skipped.push(rel + ' (非普通文件)'); continue }
    copyFile(src, path.join(dstDir, e.name), rel)
  }
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
for (const d of PAGES_KEEP_DIRS) {
  const src = path.join(ROOT, d)
  if (!fs.existsSync(src)) { skipped.push(d + '/ (不存在)'); continue }
  copyTree(src, path.join(OUT, d), d)
}
for (const f of PAGES_KEEP_FILES) {
  const src = path.join(ROOT, f)
  if (!fs.existsSync(src)) { skipped.push(f + ' (不存在)'); continue }
  copyFile(src, path.join(OUT, f), f)
}

// ④ 第二份测试台：demo/ → wallpaper-engine-webgl/（只为产物里那两条写死的绝对路径）
const DEMO_SRC = path.join(ROOT, 'demo')
const ALIAS = path.join(OUT, 'wallpaper-engine-webgl')
if (!fs.existsSync(path.join(OUT, 'demo', 'index.html'))) {
  console.error('✗ 产物里没有 demo/index.html —— 测试台真源缺失，构建中止')
  process.exit(1)
}
copyTree(DEMO_SRC, ALIAS, 'wallpaper-engine-webgl')

// ⑤ 关掉 Jekyll
fs.writeFileSync(path.join(OUT, '.nojekyll'), '')

// 完整性自检：产物必须能直接当站点用（这几条缺一个就是"发上去才发现"）
const MUST = ['index.html', 'demo/index.html', 'demo/bench-patch.js', 'demo/LICENSE-webwallgl-MIT.txt',
  'wallpaper-engine-webgl/index.html', 'wallpaper-engine-webgl/bench-patch.js',
  'wallpaper-engine-webgl/renderer/index.html', 'samples/sample-synthetic/scene.pkg',
  'samples/sample-synthetic/project.json', 'THIRD-PARTY.md', 'LICENSE', '.nojekyll']
const missing = MUST.filter((f) => !fs.existsSync(path.join(OUT, f)))
if (missing.length) {
  console.error('✗ 产物缺少必需文件：' + missing.join('、'))
  process.exit(1)
}
// 显式递归（不用 readdirSync({recursive:true})：那是 Node 20.1+ 才有，而 engines 只保证 >=20）
const countFiles = (d) => {
  let n = 0
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p2 = path.join(d, e.name)
    if (e.isDirectory()) n += countFiles(p2)
    else if (e.isFile()) n++
  }
  return n
}
const summary = { out: OUT, files: countFiles(OUT), demoStagedTwice: true, nojekyll: true, must: MUST.length, skipped: skipped.length }
if (JSON_OUT) console.log(JSON.stringify(summary, null, 1))
else {
  console.log(`✓ Pages 产物：${OUT}`)
  console.log(`  · 文件 ${summary.files} 个（白名单口径：PAGES_KEEP_DIRS / PAGES_KEEP_FILES）`)
  console.log('  · demo/ 与 wallpaper-engine-webgl/ 两份（后者是产物里写死的绝对路径所需）')
  console.log('  · .nojekyll 已写；必需文件自检 ' + MUST.length + ' 项全过')
}
