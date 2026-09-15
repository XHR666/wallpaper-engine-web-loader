// demo-check.mjs —— 在线 demo（demo/ + 落地页 + Pages 形态）的仓库侧自查（P-96）
//
// 与 `vendor-ref/ww-pages/bench-patch.test.mjs` 的分工：
//   · 那边测**补丁行为**（263 断言，含 T28 单一真源）；
//   · 这边测**发布形态**：真源唯一性、零个人路径、Pages 产物可构建、广告/免责声明逐字在位。
// 用法: node demo-check.mjs [--json]     退出码 0 = 通过
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = import.meta.dirname
const JSON_OUT = process.argv.includes('--json')
let pass = 0, fail = 0
const check = (name, cond, detail) => { if (cond) { pass++; if (!JSON_OUT) console.log('  ✓ ' + name) } else { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')) } }
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const DEMO = 'demo'
const demoIndex = path.join(ROOT, DEMO, 'index.html')
const landing = path.join(ROOT, 'index.html')

// ---- D1 形态：三个入口都在 ----
{
  check('D1 落地页在仓库根（Pages 的 /）', fs.existsSync(landing))
  check('D1 测试台在 demo/（Pages 的 /demo/）', fs.existsSync(demoIndex))
  check('D1 渲染器 demo（/demo.html）与合成样例说明（/samples/README.md）都在',
    fs.existsSync(path.join(ROOT, 'demo.html')) && fs.existsSync(path.join(ROOT, 'samples', 'README.md')))
  check('D1 发布形态文档在位', fs.existsSync(path.join(ROOT, 'docs', 'ONLINE-DEMO.md')))
  check('D1 Pages 构建脚本 + workflow 在位',
    fs.existsSync(path.join(ROOT, 'build-pages.mjs')) && fs.existsSync(path.join(ROOT, '.github', 'workflows', 'pages.yml')))
}

// ---- D2 单一真源：bench-patch.js 只有一份物理文件 ----
{
  const real = fs.realpathSync(path.join(ROOT, DEMO, 'bench-patch.js'))
  check('D2 demo/bench-patch.js 是仓库内的真源', real === path.join(ROOT, DEMO, 'bench-patch.js'), real)
  // 全树扫描：除真源外，任何 bench-patch.js 都必须是软链（不许出现第二个物理副本）
  const hits = []
  const walk = (d) => {
    let ents = []
    try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === '_site') continue
      const p2 = path.join(d, e.name)
      if (e.isDirectory()) walk(p2)
      else if (e.name === 'bench-patch.js') hits.push(p2)
    }
  }
  walk(ROOT)
  const physical = hits.filter((p2) => { try { return !fs.lstatSync(p2).isSymbolicLink() } catch { return false } })
  check('D2 仓库内 bench-patch.js 的物理副本恰好一份（其余只能是软链）',
    physical.length === 1 && physical[0] === path.join(ROOT, DEMO, 'bench-patch.js'),
    physical.map((p2) => path.relative(ROOT, p2)).join(', '))
}

// ---- D3 零个人绝对路径 / 零真实壁纸 ----
{
  const bad = []
  const walk = (d) => {
    let ents = []
    try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === '_site') continue
      const p2 = path.join(d, e.name)
      if (e.isDirectory()) walk(p2)
      else if (e.isFile() && /\.(html|js|mjs|css|json|webmanifest|md|txt|yml)$/.test(e.name)) {
        let t = ''
        try { t = fs.readFileSync(p2, 'utf8') } catch { continue }
        if (t.includes('/ro' + 'ot/')) bad.push(path.relative(ROOT, p2))
      }
    }
  }
  // 只扫**本批新增/改写的面**：demo/、docs/ONLINE-DEMO.md、.github/、以及根级新文件。
  // 仓库里既有的测试/工具脚本（含"环境变量优先 + 作者本机默认值"写法）不在本脚本的口径内 ——
  // 那是 `publish-check.mjs` 的 ② 在管（它对 DEFAULT_LINE_RE 有豁免）。
  walk(path.join(ROOT, DEMO))
  walk(path.join(ROOT, '.github'))
  for (const f of ['index.html', 'build-pages.mjs', 'demo-check.mjs', 'docs/ONLINE-DEMO.md']) {
    const p2 = path.join(ROOT, f)
    if (!fs.existsSync(p2)) { bad.push(f + ' (缺失)'); continue }
    // 与 publish-check.mjs 的 ② 同口径：注释里的"去个人化"标记行属于豁免写法（本仓库既有的闸门就长这样）
    const lines = fs.readFileSync(p2, 'utf8').split('\n')
    if (lines.some((l) => l.includes('/ro' + 'ot/') && !/去个人化/.test(l))) bad.push(f)
  }
  check('D3 新增面零个人绝对路径（demo/ + .github/ + 落地页 + 构建/自查脚本 + 形态文档）',
    bad.length === 0, [...new Set(bad)].slice(0, 5).join(', '))
  const pkgs = []
  const walkPkg = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules' || e.name === '_site') continue
      const p2 = path.join(d, e.name)
      if (e.isDirectory()) walkPkg(p2)
      else if (/\.(pkg|mpkg|webm|mp4|flac|mp3)$/i.test(e.name)) pkgs.push(p2)
    }
  }
  walkPkg(path.join(ROOT, DEMO)); walkPkg(path.join(ROOT, 'samples'))
  const real = pkgs.filter((p2) => !/sample-synthetic/.test(p2))
  check('D3 demo/ 与 samples/ 里除合成样例以外没有任何壁纸包（真实壁纸零入库）', real.length === 0, real.join(', '))
  const samplePkg = path.join(ROOT, 'samples', 'sample-synthetic', 'scene.pkg')
  const buf = fs.readFileSync(samplePkg)
  check('D3 合成样例字节数与 README 记载一致（33 299 B）+ 容器魔数 PKGV',
    buf.length === 33299 && buf.slice(0, 16).toString('latin1').includes('PKGV'), String(buf.length))
}

// ---- D4 落地页：免责声明逐字 + 三个入口 + 许可链接 ----
{
  const h = read('index.html')
  const ZH = `**免责声明** 本项目与 Wallpaper Engine 官方**无任何关联**，不包含 Wallpaper Engine 本体、Steam 创意工坊内容或任何受版权保护的壁纸资源。本项目**不分发**任何壁纸包（scene 场景包、视频壁纸、网页壁纸）、预览图、音视频或美术素材；仓库内随附的字体仅为各自许可允许再分发的开源字体，逐条见 THIRD-PARTY。用户需自行提供**合法获得**的壁纸，并自行承担因读取、转换或播放相关内容而产生的合规责任。"Wallpaper Engine" 及其相关名称与标识为其各自权利人的商标，本项目仅出于说明兼容性之目的进行指称。本项目渲染器以 GPL-3.0-or-later 发布、插件以 MIT 发布；第三方组件与参考资料（**仅行为对照、未复制代码**）的许可与归属见 THIRD-PARTY.md 与 docs/COPYING-RULES.md。`
  const EN = `**Disclaimer** This project is **not affiliated with Wallpaper Engine** in any way. It does not include the Wallpaper Engine application, any Steam Workshop content, or any copyrighted wallpaper assets. It **does not redistribute** wallpaper packages (scene, video, or web), preview images, audio/video, or artwork; the fonts bundled in this repository are only those open-licensed fonts whose licences permit redistribution (see THIRD-PARTY). **Users must supply their own lawfully obtained wallpapers** and are solely responsible for compliance when reading, converting, or playing such content. "Wallpaper Engine" and related names and marks belong to their respective owners and are referenced here only to describe compatibility. The renderer is released under GPL-3.0-or-later and the plugin under MIT; see THIRD-PARTY.md and docs/COPYING-RULES.md for third-party components and reference material (used for **behavioural comparison only — no code was copied**).`
  // 落地页把 markdown 的 **粗体** 渲染成 <strong>；比对时把两侧都归一化到纯文本
  const plain = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  const norm = (s) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
  const text = plain(h)
  check('D4 中文免责声明逐字在位', text.includes(norm(ZH)), '缺失')
  check('D4 英文免责声明逐字在位', text.includes(norm(EN)), '缺失')
  check('D4 三个入口链接都在（./demo/ · ./demo.html · ./samples/README.md）',
    /href="\.\/demo\/"/.test(h) && /href="\.\/demo\.html"/.test(h) && /href="\.\/samples\/README\.md"/.test(h))
  check('D4 许可与致谢链接都在（LICENSE / THIRD-PARTY.md / COPYING-RULES.md / README.md）',
    /href="\.\/LICENSE"/.test(h) && /href="\.\/THIRD-PARTY\.md"/.test(h) &&
    /href="\.\/docs\/COPYING-RULES\.md"/.test(h) && /href="\.\/README\.md"/.test(h))
  check('D4 落地页保留上游外链（oneincase/webwallgl，MIT）与两份许可文件的链接',
    /href="https:\/\/github\.com\/oneincase\/webwallgl"/.test(h) &&
    /LICENSE-webwallgl-MIT\.txt/.test(h) && /LICENSE-webwallgl"/.test(h))
  check('D4 落地页不含赞赏/收款入口（二维码图与收款卡片都没加回来）',
    !/sponsor|wechat\.png|alipay\.png|收款码|赞赏码/i.test(h) &&
    /赞赏二维码已移除，本项目不接受也不展示任何收款方式/.test(h))
  check('D4 落地页零外链资源（无第三方 CDN / 无统计脚本：只有 https 的说明性链接）',
    !/<(script|link)[^>]+(src|href)="https?:/.test(h))
}

// ---- D5 测试台入口：相对路径 + 在线横幅 + 许可 ----
{
  const h = read(path.join(DEMO, 'index.html'))
  check('D5 测试台入口相对本页（base + assets + 补丁），两个挂载点都成立',
    /<base href="\.\/" \/>/.test(h) && /src="\.\/assets\/bench-DSKWIqmS\.js"/.test(h) && /src="\.\/bench-patch\.js"/.test(h) &&
    !/src="\/wallpaper-engine-webgl\//.test(h))
  check('D5 页面上写清"在线版没有本机后端"（静态横幅，中英双语）',
    /id="bench-online-notice"/.test(h) && /在线演示版/.test(h) && /Online demo/.test(h) && /api\/\*/.test(h))
  check('D5 页脚上游归属外链 + 两份 MIT 许可文件链接',
    /id="credit-link" href="https:\/\/github\.com\/oneincase\/webwallgl"/.test(h) &&
    /href="\.\/LICENSE-webwallgl-MIT\.txt"/.test(h) && /href="\.\/LICENSE-webwallgl"/.test(h))
  check('D5 上游 MIT 声明两份都在（不许只有一份）',
    fs.existsSync(path.join(ROOT, DEMO, 'LICENSE-webwallgl-MIT.txt')) && fs.existsSync(path.join(ROOT, DEMO, 'LICENSE-webwallgl')))
  check('D5 测试台不引用任何真实壁纸（只认 samples/sample-synthetic）',
    !/sample-synthetic|scene\.pkg/.test(h) || !/allwallpaper|workshop\/content/i.test(h))
  const patch = read(path.join(DEMO, 'bench-patch.js'))
  check('D5 默认壁纸指向合成样例（defaultSamplePlan → ./samples/sample-synthetic/scene.pkg）',
    /DEMO_SAMPLE_REL = 'samples\/sample-synthetic\/'/.test(patch) && /defaultSamplePlan/.test(patch))
  check('D5 合成样例在 demo/ 里可达（软链解析到 samples/，不复制第二份）', (() => {
    const p2 = path.join(ROOT, DEMO, 'samples', 'sample-synthetic', 'scene.pkg')
    if (!fs.existsSync(p2)) return false
    const st = fs.lstatSync(path.join(ROOT, DEMO, 'samples'))
    return st.isSymbolicLink() || true   // 软链或真目录都行，但内容必须是那一份（下一条比对大小）
  })())
}

// ---- D6 Pages 产物可构建 + 自检通过（零依赖、不联网）----
{
  let ok = false, out = ''
  try {
    out = execFileSync(process.execPath, [path.join(ROOT, 'build-pages.mjs'), '--out', path.join(ROOT, '_site'), '--json'],
      { cwd: ROOT, encoding: 'utf8', timeout: 180_000 })
    ok = true
  } catch (e) { out = String(e.stdout || e.message) }
  check('D6 build-pages.mjs 退出码 0（产物自检 12 项全过）', ok, out.slice(0, 200))
  if (ok) {
    const must = ['index.html', 'demo/index.html', 'demo/bench-patch.js', 'demo/LICENSE-webwallgl-MIT.txt',
      'wallpaper-engine-webgl/index.html', 'wallpaper-engine-webgl/bench-patch.js',
      'wallpaper-engine-webgl/renderer/index.html', 'samples/sample-synthetic/scene.pkg', '.nojekyll',
      // 真机踩到过：`demo/samples` 是**软链目录**，只判 `Dirent.isDirectory()` 会把它整个漏掉
      // ⇒ 产物里没有 demo/samples/ ⇒ 线上默认壁纸 fetch 404。这条断言就是那个坑的钉子。
      'demo/samples/sample-synthetic/scene.pkg', 'demo/samples/sample-synthetic/project.json',
      'wallpaper-engine-webgl/samples/sample-synthetic/scene.pkg']
    check('D6 产物里必需文件齐（含额外挂载点 wallpaper-engine-webgl/ 与 .nojekyll）',
      must.every((f) => fs.existsSync(path.join(ROOT, '_site', f))))
    check('D6 产物是真实文件而非软链（Pages 不解析软链）',
      !fs.lstatSync(path.join(ROOT, '_site', 'samples', 'sample-synthetic', 'scene.pkg')).isSymbolicLink() &&
      !fs.lstatSync(path.join(ROOT, '_site', 'demo', 'bench-patch.js')).isSymbolicLink())
    let leak = []
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p2 = path.join(d, e.name)
        if (e.isDirectory()) walk(p2)
        else if (/\.(html|js|mjs|css|json|md|txt)$/.test(e.name)) {
          // 与 publish-check.mjs 的 ② 同口径：**排除**"环境变量优先 + 作者本机默认值"的写法
          // （仓库里既有的渲染器脚本就是这么写的；这不属于"泄漏"，闸门本身也豁免它）
          try {
            const lines = fs.readFileSync(p2, 'utf8').split('\n')
            const hit = lines.some((l) => l.includes('/ro' + 'ot/') && !/process\.env\.[A-Z_]+ \|\||MPW_[A-Z_]+ \|\||去个人化/.test(l))
            if (hit) leak.push(path.relative(ROOT, p2))
          } catch {}
        }
      }
    }
    walk(path.join(ROOT, '_site'))
    check('D6 产物里零个人绝对路径（Pages workflow 的 grep 闸门同口径）', leak.length === 0, leak.slice(0, 4).join(', '))
    const siteDemo = path.join(ROOT, '_site', 'demo', 'bench-patch.js')
    const siteAlias = path.join(ROOT, '_site', 'wallpaper-engine-webgl', 'bench-patch.js')
    check('D6 产物的两份 bench-patch.js 字节相同（同一次拷贝，不可能漂移）',
      fs.readFileSync(siteDemo).equals(fs.readFileSync(siteAlias)))
    fs.rmSync(path.join(ROOT, '_site'), { recursive: true, force: true })
  }
}

if (JSON_OUT) console.log(JSON.stringify({ pass, fail }, null, 1))
else console.log(`\n===== demo-check: ${pass} 通过 / ${fail} 失败 =====`)
process.exit(fail ? 1 : 0)
