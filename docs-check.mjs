// docs-check.mjs — 文档一致性检查（MERGED-2 第 4 项 I；任务书 C5.2 扩展）
// 三类检查，任一失败非零退出：
//   ① 引用完整性：TESTING/PATCHES/SELFCHECK/README-DIAGNOSTICS/EXTENSION-HOOKS/ZCODE-*.md（we-scene-demo）
//      + DSHarea 根的 TASK-*.md / TASKS-INDEX.md 里反引号引用的文件都存在；
//   ② PATCHES.md P-编号健康：`## P-<id>` 头唯一（完整 id 含 -ATTACH 等后缀）且数字部分按文件顺序非降；
//   ③ 诊断开关一致性：跑 `node diag-flag-check.mjs`（子进程）并归并其结论（README-DIAGNOSTICS ↔ 代码双向）。
// 用法: node docs-check.mjs            # 人读输出
//       node docs-check.mjs --json     # 机读输出
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = import.meta.dirname
// ①(2026-09-13 主会话整合修) 与调用目录无关：文档里引用的相对路径（如 AUDIT.md）与
//   子进程 `node diag-flag-check.mjs` 都按 cwd 解析，从父目录调用会 ENOENT 崩掉（实测）。
try { process.chdir(ROOT) } catch {}
const DSHAREA = process.env.MPW_ROOT || '/root/Desktop/DSHarea'
const JSON_OUT = process.argv.includes('--json')

// ---- ① 引用完整性 ----
const docFiles = fs.readdirSync(ROOT)
  .filter((f) => /^(TESTING|PATCHES|SELFCHECK|README-DIAGNOSTICS|EXTENSION-HOOKS|RENDERER-ARCHITECTURE|LIBRARY-MANIFEST|VISUAL-TESTING|AUDIT|ELYSIA-DIFF-AUDIT|POSITION-FINDINGS|KNOWN-ISSUES|PACKAGING)\.md$/.test(f))
  .concat(fs.readdirSync(ROOT).filter((f) => /^ZCODE-.*\.md$/.test(f)))
// 任务书与索引（DSHarea 根）——任务书引用的文件必须存在（任务书 C5.2②）
for (const root of [DSHAREA]) {
  for (const f of fs.readdirSync(root)) {
    if (/^(TASK-[A-C]-.*|TASKS-INDEX)\.md$/.test(f)) docFiles.push(path.join(root, f))
  }
}
const uniqDocs = [...new Set(docFiles)]

const tokenRe = /`([^`\s]+)`/g
// 已知"容器内部条目路径/占位名"，不是磁盘文件（scene.json 等是 pkg/mpkg 内的条目；src/* 是 bundle 内部分节标记）
const SKIP_TOKEN = /^(scene|project|effect)\.json$|^wallpaper\.mp4$|^\.(tex|mdl|mpkg)$|^src\/|^fonts\/|^materials\/|^models\/|^workshop\/|^effects\//
// mpkg 裸文件名兜底：在 allwallpaper 下有界查找（语料只有 ~90 目录，一次性）
const mpkgFindCache = new Map()
function findInCorpus(name) {
  if (mpkgFindCache.has(name)) return mpkgFindCache.get(name)
  let hit = null
  const base = path.join(DSHAREA, 'allwallpaper')
  try {
    for (const d1 of fs.readdirSync(base)) {
      const p1 = path.join(base, d1)
      if (!fs.statSync(p1).isDirectory()) continue
      for (const d2 of fs.readdirSync(p1)) {
        const p2 = path.join(p1, d2)
        const st = fs.statSync(p2)
        if (st.isFile()) { if (d2 === name) { hit = p2; mpkgFindCache.set(name, hit); return hit } continue }
        if (!st.isDirectory()) continue
        for (const d3 of fs.readdirSync(p2)) {
          if (d3 === name) { hit = path.join(p2, d3); mpkgFindCache.set(name, hit); return hit }
        }
      }
    }
  } catch {}
  mpkgFindCache.set(name, hit)
  return hit
}
const missing = []
const checked = new Set()
for (const doc of uniqDocs) {
  const rel = path.relative(ROOT, doc)
  const text = fs.readFileSync(doc, 'utf8')
  for (const m of text.matchAll(tokenRe)) {
    let tok = m[1]
    tok = tok.replace(/[,.;:）)]+$/, '')
    if (SKIP_TOKEN.test(tok)) continue
    if (!/\.(mjs|js|sh|md|json|html|gif|png|pkg|mpkg|tex|ttf|jpg)$/.test(tok)) continue
    if (/^(http|node |bash |npm |cp |rm |mv |grep |curl |ls |ffmpeg )/.test(tok)) continue
    if (tok.includes('*') || tok.includes('{') || tok.includes('$') || tok.includes('<') || tok.includes('>')) continue
    if (/^\//.test(tok) && !tok.startsWith('/root/')) continue
    if (/^[A-Z]:/.test(tok)) continue
    const key = rel + '::' + tok
    if (checked.has(key)) continue
    checked.add(key)
    const candidates = tok.startsWith('/root/')
      ? [tok]
      : [path.join(ROOT, tok), path.join(DSHAREA, tok)]
    if (/^(lib|tools)\//.test(tok)) candidates.push(path.join(DSHAREA, 'dsh-mpkg-wallpaper', tok))
    candidates.push(path.join(DSHAREA, 'we-scene-demo', tok))
    // elysia 裸文件名（core.js/puppet.js/nsl.js…——历史取证文档的惯用引用）
    if (/^[a-z-]+\.js$/.test(tok)) candidates.push(path.join(DSHAREA, 'we-scene-demo', 'elysia', tok), path.join(DSHAREA, 'we-scene-demo', 'elysia', 'we-renderer', tok))
    if (/\.mpkg$/.test(tok)) candidates.push(path.join('/root', '.dsh-mpkg-wallpaper', tok))
    // ①(P-75b 2026-09-15) `reports/r<ts>.json` 是**真机上报的滚动产物**（按体积/数量轮转清理），
    //   文档里引用它只是"当时的证据出处"，文件本身**天然会消失** ⇒ 不能当"缺失被引用文件"报红。
    //   实测：PATCHES.md 里两条这样的引用让 docs-check 红了两次（每次有人引用新的上报就会再红一次）。
    //   注意只豁免 `reports/r<digits>.json` 这一种形态：`reports/parity-*.json`、`docs/*.md` 等
    //   **是仓库产物、必须存在**，仍然照旧校验。
    const isTransientReport = /(^|\/)reports\/r\d+\.json$/.test(tok)
    let found = isTransientReport || candidates.some((c) => fs.existsSync(c))
    if (!found && /\.mpkg$/.test(tok) && !tok.includes('/')) found = !!findInCorpus(tok)
    if (!found) missing.push({ doc: rel, ref: tok })
  }
}

// ---- ② PATCHES.md P-编号健康 ----
const patchProblems = []
{
  const text = fs.readFileSync(path.join(ROOT, 'PATCHES.md'), 'utf8')
  const ids = []
  for (const m of text.matchAll(/^## (P-[A-Za-z0-9-]+)(?=[（(:\s]|$)/gm)) ids.push({ id: m[1], num: Number(m[1].replace(/^P-/, '').replace(/[^0-9].*$/, '')) })
  const seen = new Set()
  let last = -1
  for (const { id, num } of ids) {
    if (seen.has(id)) patchProblems.push(`重复的 P 编号头：${id}`)
    seen.add(id)
    if (!(num >= last)) patchProblems.push(`P 编号顺序回退：${id}（num=${num}，前一个 num=${last}）`)
    last = num
  }
  if (!ids.length) patchProblems.push('PATCHES.md 里没有任何 `## P-…` 头')
}

// ---- ③ diag-flag-check 归并（README-DIAGNOSTICS ↔ 代码开关双向比对）----
let diagFlag = { ok: true, out: '' }
try {
  const out = execFileSync('node', [path.join(ROOT, 'diag-flag-check.mjs')], { encoding: 'utf8', timeout: 60000 })
  diagFlag = { ok: true, out: out.trim().split('\n').pop() }
} catch (e) {
  diagFlag = { ok: false, out: String(e.stdout || e.message).trim().split('\n').filter(Boolean).slice(-3).join(' ⏎ ') }
}

const ok = !missing.length && !patchProblems.length && diagFlag.ok
if (JSON_OUT) {
  console.log(JSON.stringify({ docs: uniqDocs.length, refs: checked.size, missing, patchProblems, diagFlags: diagFlag, ok }, null, 1))
  process.exit(ok ? 0 : 1)
}
console.log(`检查 ${uniqDocs.length} 个文档 · ${checked.size} 个文件引用 · P-编号健康 ${patchProblems.length ? '✗' : '✓'} · diag-flags ${diagFlag.ok ? '✓ ' + diagFlag.out : '✗'}`)
if (missing.length) {
  console.error(`✗ 缺失 ${missing.length} 个被引用文件：`)
  for (const m of missing) console.error(`  ✗ ${m.doc} → ${m.ref}`)
}
for (const p of patchProblems) console.error(`✗ PATCHES.md：${p}`)
if (!diagFlag.ok) console.error(`✗ diag-flag-check 失败：${diagFlag.out}`)
if (ok) console.log('✓ 文档一致性全部通过')
process.exit(ok ? 0 : 1)
