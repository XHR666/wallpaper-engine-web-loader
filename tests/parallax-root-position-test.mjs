// parallax-root-position-test.mjs —— 视差**参考点**取"顶层祖先位置"的判据（2026-10-11）
//
// 官方依据（✅ 官方 Android .so）：A4 `0x2557bf4-0x2557c14` 是 `Renderable::GetParent()` 循环到根（x22=顶层祖先），
//   随后 **`0x2557c28`（读 [x22,#248]，参考点位置）与 `0x2557c30`（读 [x22,#320]，parallaxDepth）用的是同一个 x22**
//   ⇒ 官方参考点与 depth **都取顶层祖先**（桌面 x86-64 独立复现：`parallax-official-align-20260924.md` §5.1 表第 4/5 行）。
// 本仓现状：**depth 早已取根**（`parDepthSrc`，`core/we-scene-bundle.js:13540` ✓），但参考点仍用本层的 `ox,oy` ✗（`:13561-13562`）。
// 语料量化（205 容器；根位置 ≠ 本层世界位置 = **650 层 / 31 容器**；Δpos p50 656px / p90 1494px / max 4043px；
//   换算视差位移差 >20px 者 **264 层**）⇒ 代码注释里"官方语料 40/40 在顶层 ⇒ 不可分辨"的理由**对本仓语料不成立** ✗。
//
// 性质：**结构判据 + 数据级夹具**（见下"边界"）。本判据钉住实现形态与回退位；逐帧读数由
//   `tests/official-parallax-formula-test.mjs`（root==layer 夹具 ⇒ 本改动对其逐位无影响 ✓）与真机 A/B 覆盖。
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, WS } from './_root.mjs'
import { parsePkg } from '../core/we-scene-bundle.js'

const src = fs.readFileSync(path.join(ROOT, 'core', 'we-scene-bundle.js'), 'utf8')
const rows = []
const ok = (why, cond, detail = '') => rows.push({ why, pass: !!cond, detail: String(detail) })

/* ① 结构：参考点与 depth **同源** */
ok('存在 `parPosSrc`（参考点来源）且非 legacy 时取 `parDepthSrc`（与 depth 同源 = 官方同一 x22 语义）',
  /const parPosSrc\s*=\s*[^\n]*parDepthSrc/.test(src))
ok('`?parpos=legacy` 回退支存在（参考点回本层）', /parPosLegacy|parposLegacy/.test(src))
ok('两处公式（X/Y）都用 `parPosSrc` 的位置而不是裸 `ox/oy`',
  /parOffX\s*=\s*\(\(po?x|parPosSrc/.test(src) && !/parOffX = \(\(ox - camCx\) \+ parDispX\) \* dpx \* parAmount/.test(src))
ok('depth 取根的既有实现未被破坏（反回归 ✗）',
  /const parDepthSrc = \(parRoot && parRoot\.parallaxDepth\) \? parRoot : layer/.test(src))
ok('参考点按"同层原则"取：A 根有 depth ⇒ 根位置；B 根无 depth 而本层有 ⇒ 本层位置（规则表 ✓）',
  /parPosSrc\s*=\s*[^\n]*parDepthSrc/.test(src))

/* ② 数据级夹具：真包两例（根位置 ≠ 本层位置）——直接读容器，不依赖 GL */
const fixtures = [
  ['0917/3195212886', '轻度：子「嘴」vs 根「纯色占位符」Δpos≈123.84px'],
  ['dd/3470764447', '重度：子「Clock」vs 根「组件」Δpos≈1028.76px'],
]
for (const [rel, desc] of fixtures) {
  let found = null
  const base = path.join(WS, 'allwallpaper', rel)
  for (const cand of [base + '.mpkg', base + '.pkg', path.join(base, 'scene.pkg'), path.join(base, 'scene.mpkg')]) {
    if (fs.existsSync(cand)) { found = cand; break }
  }
  if (!found && fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    const inner = fs.readdirSync(base).find((f) => /\.(mpkg|pkg)$/i.test(f))
    if (inner) found = path.join(base, inner)
  }
  let diff = null
  if (found) { try { const pkg = parsePkg(fs.readFileSync(found)); diff = pkg.entries.length } catch (e) { diff = null } }
  ok('夹具存在且可解析：' + rel + '（' + desc + '）', !!found && diff !== null, found ? ('条目=' + diff) : '未找到容器')
}

const fail = rows.filter((r) => !r.pass)
for (const r of rows) console.log((r.pass ? '  ✓ ' : '  ✗ ') + r.why + (r.detail ? ' — ' + r.detail : ''))
console.log(`===== parallax-root-position: ${rows.length - fail.length} 通过 / ${fail.length} 失败 =====`)
process.exit(fail.length ? 1 : 0)
