// publish-check.mjs —— 公开仓库发布前的自动闸门（第16项）。
//
// 为什么要有它：本项目的公开副本踩过两类"发出去才发现"的坑 ——
//   ① 个人绝对路径 / 私有库清单 / 实机截图（隐私）；
//   ② **专有文件混入**：`common*.h` 一度与 Wallpaper Engine 官方着色器头逐字节相同（法律）。
// 人工核查会漏，脚本不会。每次准备发布前跑一遍；也可直接进 CI。
//
// 用法:
//   node publish-check.mjs              # 扫描当前树（默认 = 本文件所在目录）
//   node publish-check.mjs --json       # 机读
//   node publish-check.mjs --assets /path/to/wallpaper_engine/assets   # 指定 WE 官方资产根做"逐字节相同"比对
//   node publish-check.mjs --max-mb 50  # 单文件告警阈值（默认 50；>100MB 是 GitHub 硬上限，永远算失败）
//
// 只读：不修改任何文件。退出码 0 = 可以进入人工复核；1 = 有阻塞项。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const JSON_OUT = has('--json')
const MAX_MB = Number(val('--max-mb', '50'))
const WE_ASSETS = val('--assets', process.env.MPW_WE_ASSETS || '')

// 不属于"要发布的仓库"的本地目录（本机数据/缓存/上报），扫描时跳过
const SKIP_DIRS = new Set(['.git', 'node_modules', 'reports', '__pycache__', 'archive', 'Testphoto'])
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.webm', '.mpkg', '.pkg', '.flac', '.mp3'])

// ①(2026-09-14 自查修复) **不要**依赖 readdir 的 dirent 类型：本机（PRoot/overlay）下
//   `Dirent.isFile()` 对部分普通文件返回 false → 7 个 common*.h 里漏掉 5 个，发布闸门差点漏报专有文件。
//   改为逐项 `lstat` 判定（慢一点但正确）。
const walk = (dir, out = []) => {
  let ents = []
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    let st = null
    try { st = fs.lstatSync(p) } catch { continue }
    if (st.isSymbolicLink()) continue
    if (st.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, out) }
    else if (st.isFile()) out.push(p)
  }
  return out
}

// ── 忽略清单（.gitignore.public）：**只报"真正会进仓库"的问题**，否则会把已排除的本机数据算成阻塞 ──
const IGNORE_FILE = path.join(ROOT, '.gitignore.public')
let ignoreRules = []
if (fs.existsSync(IGNORE_FILE)) {
  ignoreRules = fs.readFileSync(IGNORE_FILE, 'utf8').split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}
// ①(2026-09-14 修) 原来的 glob 处理太天真：`*.bak-*` 会被当成"以 .bak-* 结尾"的字面量匹配（永远不命中）。
//   改为 glob→正则（支持 `*` 与 `?`），并同时匹配 basename 与相对路径。
const globToRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$')
const ignoreRes = ignoreRules.map((r) => ({ dir: r.endsWith('/'), re: globToRe(r.replace(/\/$/, '')) }))
// ①(2026-09-14 自查修复) 目录规则必须逐层比对**目录名**；此前用"文件自身首段"去 startsWith，
//   导致任何目录规则都会连带排除同一顶层目录下的所有文件（实测把 samples/** 254MB 全部误排）。
const isIgnored = (relPath) => {
  const segs = relPath.split(path.sep).join('/').split('/')
  const base = segs[segs.length - 1]
  const dirs = segs.slice(0, -1)
  return ignoreRes.some(({ dir, re }) => {
    if (dir) return dirs.some((d) => re.test(d))
    return re.test(base) || re.test(segs.join('/')) || dirs.some((d) => re.test(d))
  })
}
const allFiles = walk(ROOT)
const skippedByIgnore = allFiles.filter((p) => isIgnored(path.relative(ROOT, p)))
const files = allFiles.filter((p) => !isIgnored(path.relative(ROOT, p)))
const rel = (p) => path.relative(ROOT, p)
const findings = { blocking: [], warnings: [], info: [] }

// ── ① 体积：GitHub 单文件硬上限 100MB（超了推送直接被拒） ──
const sizes = files.map((p) => ({ p, mb: fs.statSync(p).size / 1048576 })).sort((a, b) => b.mb - a.mb)
for (const { p, mb } of sizes) {
  if (mb > 100) findings.blocking.push({ kind: 'size', file: rel(p), msg: `${mb.toFixed(1)}MB > GitHub 100MB 硬上限（推送会被拒）` })
  else if (mb > MAX_MB) findings.warnings.push({ kind: 'size', file: rel(p), msg: `${mb.toFixed(1)}MB > ${MAX_MB}MB 告警阈值` })
}
findings.info.push({ kind: 'size', msg: `按 .gitignore.public 排除 ${skippedByIgnore.length} 个本机文件后，扫描 ${files.length} 个文件，合计 ${(sizes.reduce((s, x) => s + x.mb, 0)).toFixed(1)}MB；最大 ${sizes[0] ? sizes[0].mb.toFixed(1) + 'MB (' + rel(sizes[0].p) + ')' : '—'}` })

// ── ② 隐私：个人绝对路径 / 私有库清单 / 凭据（文本文件才扫） ──
// ①(2026-09-14 加强) 凭据形态：私钥头 / 常见厂商 key / JWT / 赋值式口令。
//   注意 `\.key$` 这类**文件名**规则不要写成行内正则——JS 里的 `ev.key`、`cfg.key` 会被误报（本机实测 4/4 全是误报）。
const SECRET_RE = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{20,}|\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bAKIA[0-9A-Z]{16}|\bAIza[0-9A-Za-z_-]{30,}|\bxox[baprs]-[A-Za-z0-9-]{10,}|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9._-]{20,}|(access_token|api[_-]?key|apikey|passwd|password)\s*[:=]\s*['"][^'"]{12,}['"]|cookie\s*[:=]\s*['"][^'"]{20,}['"])/i
// 文件名级：私钥/证书/密钥文件本身
const SECRET_FILE_RE = /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519|\.env(\..+)?|[^/]+\.(pem|p12|pfx|jks|keystore))$/i
// ①(去个人化) 覆盖面补齐 2026-09-16：原来只认作者工作区路径 `/root/Desktop/`、`/home/<user>/`、`C:\Users\`，
//   结果**漏掉了同类本机路径**：插件下载缓存（root 家目录下的同名点目录）与设备/SD 语料根
//   （实测各漏 15+ 处，含 `known.json`、`known-issues.json`）。
//   现把它们并入 PATH_RE；"环境变量优先 + 作者本机默认值"的写法仍由 DEFAULT_LINE_RE 豁免。
const PATH_RE = /(\/root\/Desktop\/|\/root\/\.dsh-mpkg-wallpaper|\/mnt\/sdcard\/|\/home\/[a-z]+\/|C:\\\\?Users\\\\?[A-Za-z]+)/
const DEFAULT_LINE_RE = /process\.env\.[A-Z_]+ \|\||MPW_[A-Z_]+ \|\||\$\{MPW_ROOT:-|\|\| '\/root\/Desktop\/DSHarea'|\/\/ ①\(去个人化\)/
for (const p of files) {
  if (SECRET_FILE_RE.test(rel(p))) { findings.blocking.push({ kind: 'secret-file', file: rel(p), msg: '疑似私钥/证书/环境变量文件，不要进公开仓库' }); continue }
  if (SKIP_EXT.has(path.extname(p).toLowerCase())) continue
  let s = ''
  try { if (fs.statSync(p).size > 4 * 1048576) continue; s = fs.readFileSync(p, 'utf8') } catch { continue }
  s.split('\n').forEach((line, i) => {
    if (SECRET_RE.test(line)) findings.blocking.push({ kind: 'secret', file: rel(p) + ':' + (i + 1), msg: '疑似凭据字面量' })
    if (PATH_RE.test(line) && !DEFAULT_LINE_RE.test(line)) findings.warnings.push({ kind: 'path', file: rel(p) + ':' + (i + 1), msg: '出现个人绝对路径（若非"环境变量默认值"需改造）' })
  })
}
// 私有库清单类文件（内嵌本机包列表/路径）
for (const p of files) {
  const b = path.basename(p)
  if (/^(library-manifest|package-matrix|package-baseline|perf-matrix|perf-baseline)\.json$/.test(b)) {
    findings.blocking.push({ kind: 'private-list', file: rel(p), msg: '内嵌本机壁纸/工坊清单与路径，**不要进公开仓库**' })
  }
}

// ── ③ 专有文件混入：与 WE 官方资产逐字节相同（common*.h 就是这么抓到的） ──
if (WE_ASSETS && fs.existsSync(WE_ASSETS)) {
  const official = new Map() // sha256 → 官方相对路径
  for (const p of walk(WE_ASSETS)) {
    try { if (fs.statSync(p).size > 2 * 1048576) continue; official.set(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'), path.relative(WE_ASSETS, p)) } catch {}
  }
  // ①(2026-09-14 自查加强) **归一化比对**：只比字节哈希会被“加注释/改空白式改写”骗过
  //   （实测：某次“重写”去掉注释后与原文逐行 100% 相同）。故再建一份去注释/空白的索引。
  const normText = (t) => t.split('\n').map((l) => l.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '').trim()).filter((l) => l.length > 3).join('\n')
  const officialNorm = new Map()
  for (const p of walk(WE_ASSETS)) {
    try {
      if (fs.statSync(p).size > 2 * 1048576) continue
      const nt = normText(fs.readFileSync(p, 'utf8'))
      if (nt) officialNorm.set(nt, path.relative(WE_ASSETS, p))
    } catch {}
  }
  let hits = 0
  for (const p of files) {
    if (SKIP_EXT.has(path.extname(p).toLowerCase())) continue
    let buf = null
    try { if (fs.statSync(p).size > 2 * 1048576) continue; buf = fs.readFileSync(p) } catch { continue }
    const h = crypto.createHash('sha256').update(buf).digest('hex')
    if (official.has(h)) { hits++; findings.blocking.push({ kind: 'proprietary', file: rel(p), msg: '与 WE 官方资产逐字节相同：' + official.get(h) + '（不得随公开仓库分发）' }) }
    // ①归一化二次比对：去掉注释/空白后若与官方完全相同 = 照抄再排版，同样阻塞
    try {
      const nt = normText(fs.readFileSync(p, 'utf8'))
      if (nt && officialNorm.has(nt)) { hits++; findings.blocking.push({ kind: 'proprietary-normalized', file: rel(p), msg: '去掉注释/空白后与 WE 官方完全相同：' + officialNorm.get(nt) + '（等同照抄再排版，不得发布）' }) }
    } catch {}
  }
  // ①(2026-09-14 加强 v3) **按同名文件的有效行重合率**判定"照抄再排版"：
  //   整文件归一化太严格（少一行就漏判），而逐行重合率对"加注释/改空白/换行序"都稳。
  const sigLines = (p) => { try { return new Set(fs.readFileSync(p, 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '').trim()).filter((l) => l.length > 3)) } catch { return new Set() } }
  const officialByName = new Map()
  for (const p of walk(WE_ASSETS)) { try { const b = path.basename(p); if (!officialByName.has(b)) officialByName.set(b, p) } catch {} }
  for (const p of files) {
    const b = path.basename(p)
    const op = officialByName.get(b)
    if (!op) continue
    const mine = sigLines(p), off = sigLines(op)
    if (!off.size) continue
    let same = 0
    for (const l of off) if (mine.has(l)) same++
    const ratio = same / off.size
    if (ratio >= 0.9) findings.blocking.push({ kind: 'proprietary-overlap', file: rel(p), msg: `有效行与 WE 官方同名文件重合 ${(ratio * 100).toFixed(0)}%（${same}/${off.size}）→ 属"照抄再排版"，不得发布` })
    else if (ratio >= 0.5) findings.warnings.push({ kind: 'proprietary-overlap', file: rel(p), msg: `与 WE 官方同名文件有效行重合 ${(ratio * 100).toFixed(0)}% → 请人工确认是否独立实现` })
  }
  findings.info.push({ kind: 'proprietary', msg: `与 WE 官方资产比对：${official.size} 个官方文件做索引，命中 ${hits} 个` })
} else {
  findings.warnings.push({ kind: 'proprietary', msg: '未提供 WE 资产根（--assets / MPW_WE_ASSETS）→ 跳过"专有文件混入"比对（建议发布前务必跑一次）' })
}

// ── ④ 发布必需文件 ──
const REQUIRED = ['LICENSE', 'THIRD-PARTY.md', 'README-PUBLIC.md', 'elysia/LICENSE', 'elysia/vendor/@shaderfrog/glsl-parser/LICENSE', 'samples/sample-synthetic/scene.pkg', 'make-sample.mjs']
for (const f of REQUIRED) {
  if (!fs.existsSync(path.join(ROOT, f))) findings.blocking.push({ kind: 'missing', file: f, msg: '发布必需文件缺失' })
}

// ── ⑤ 许可一致性自检（P-89，2026-09-16：渲染器切 GPL-3.0-or-later，插件保持 MIT） ──
//    ① LICENSE ↔ package.json.license 一致（渲染器无 package.json，则以 LICENSE 自证为准）
//    ② 发布物里不含插件的 GPL 违规内容（插件必须仍是 MIT，且不得被 vendored 进本 GPL 仓库）
//    ③ docs/COPYING-RULES.md 与 THIRD-PARTY.md 在位
//    ④ vendored webwallgl 的 MIT 声明与字体许可文件都在
const licensePath = path.join(ROOT, 'LICENSE')
const SPDX_WANT = 'GPL-3.0-or-later'
try {
  const lic = fs.readFileSync(licensePath, 'utf8')
  // ①-a LICENSE 必须是 GNU GPL v3 条款原文（首行/关键词）
  const firstLine = lic.split('\n').find((l) => l.trim()) || ''
  const hasGplTitle = /GNU GENERAL PUBLIC LICENSE/.test(firstLine)
  const hasVersion3 = /Version 3,\s*29 June 2007/.test(lic)
  const hasOrLater = /either version 3 of the License, or \(at your option\)\s+any later version/.test(lic.replace(/\s+/g, ' '))
  const hasHolder = /Copyright \(C\) 2026 XHR666/.test(lic)
  if (!hasGplTitle) findings.blocking.push({ kind: 'license', file: 'LICENSE', msg: `首行不是 GNU GPL 标题（实际：${JSON.stringify(firstLine.trim())}）` })
  if (!hasVersion3 || !hasOrLater) findings.blocking.push({ kind: 'license', file: 'LICENSE', msg: 'LICENSE 缺少 "Version 3, 29 June 2007" 或 "or any later version" 措辞（必须声明 GPL-3.0-**or-later**）' })
  if (!hasHolder) findings.blocking.push({ kind: 'license', file: 'LICENSE', msg: 'LICENSE 缺少版权声明 "Copyright (C) 2026 XHR666"' })
  // ①-b package.json 若存在，license 字段必须与 SPDX 一致
  const pkgPath = path.join(ROOT, 'package.json')
  if (fs.existsSync(pkgPath)) {
    let pkg = null
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) } catch { findings.blocking.push({ kind: 'license', file: 'package.json', msg: 'JSON 解析失败，无法核对 license 字段' }) }
    if (pkg) {
      if (pkg.license !== SPDX_WANT) findings.blocking.push({ kind: 'license', file: 'package.json', msg: `license = ${JSON.stringify(pkg.license)}，与 LICENSE 的 ${SPDX_WANT} 不一致` })
      else findings.info.push({ kind: 'license', msg: `package.json license=${SPDX_WANT} 与 LICENSE 一致` })
    }
  } else {
    findings.info.push({ kind: 'license', msg: `仓库无 package.json（渲染器是 .mjs + demo.html）→ 许可一致性以 LICENSE 自证为准（${SPDX_WANT}，含版权声明与 or-later 措辞）` })
  }
} catch (e) {
  findings.blocking.push({ kind: 'license', file: 'LICENSE', msg: '读取失败：' + ((e && e.message) || e) })
}

// ② 插件侧必须仍是 MIT（"没有被 GPL 文本污染"），且不得被 vendored 进本仓库
const PLUGIN_DIR = path.join(ROOT, '..', 'dsh-mpkg-wallpaper')
if (fs.existsSync(PLUGIN_DIR)) {
  try {
    const plic = fs.readFileSync(path.join(PLUGIN_DIR, 'LICENSE'), 'utf8')
    const pluginMit = /^MIT License/m.test(plic) && !/GNU GENERAL PUBLIC LICENSE/.test(plic)
    if (!pluginMit) findings.blocking.push({ kind: 'license', file: '../dsh-mpkg-wallpaper/LICENSE', msg: '插件 LICENSE 不再是纯 MIT（出现 GPL 文本）→ 违反"GPL 不得回流 MIT"规则' })
    else findings.info.push({ kind: 'license', msg: '插件 dsh-mpkg-wallpaper：LICENSE 为 MIT（无 GPL 文本）' })
    const ppkg = path.join(PLUGIN_DIR, 'package.json')
    if (pluginMit && fs.existsSync(ppkg)) {
      try {
        const j = JSON.parse(fs.readFileSync(ppkg, 'utf8'))
        if (j.license !== 'MIT') findings.blocking.push({ kind: 'license', file: '../dsh-mpkg-wallpaper/package.json', msg: `插件 license = ${JSON.stringify(j.license)}，应为 MIT` })
      } catch { findings.warnings.push({ kind: 'license', file: '../dsh-mpkg-wallpaper/package.json', msg: 'JSON 解析失败，未核对 license 字段' }) }
    }
  } catch { findings.warnings.push({ kind: 'license', file: '../dsh-mpkg-wallpaper/LICENSE', msg: '插件 LICENSE 读取失败 → 未核对"插件仍是 MIT"' }) }
} else {
  findings.warnings.push({ kind: 'license', msg: '未找到姊妹目录 dsh-mpkg-wallpaper/ → 跳过"插件仍是 MIT"核对（独立发布本仓库时属正常）' })
}
// ②-b 本仓库不得 vendored 插件的任何文件（借用应改为 import 外部包并在 THIRD-PARTY.md 声明）
const vendoredPlugin = files.filter((p) => /(^|\/)dsh-mpkg-wallpaper(\/|$)/.test(rel(p)) || /(^|\/)pkg-extract\.(mjs|js)$/.test(rel(p)))
if (vendoredPlugin.length) findings.blocking.push({ kind: 'license', file: rel(vendoredPlugin[0]), msg: `本仓库出现插件的 vendored 副本（${vendoredPlugin.length} 个文件）→ 改为 import 外部包，并在 THIRD-PARTY.md 声明其 MIT` })

// ③ 复制/许可规则文档与第三方声明必须随仓库
const COPYING_CANDIDATES = [path.join(ROOT, 'docs', 'COPYING-RULES.md'), path.join(ROOT, '..', 'docs', 'COPYING-RULES.md')]
const COPYING_HIT = COPYING_CANDIDATES.find((p) => fs.existsSync(p))
if (!COPYING_HIT) findings.blocking.push({ kind: 'license', file: 'docs/COPYING-RULES.md', msg: '单向流动规则/借鉴台账文档缺失（本仓库 docs/ 或工作区 docs/ 都没有）' })
else findings.info.push({ kind: 'license', msg: '复制规则台账：' + path.relative(ROOT, COPYING_HIT) + '（+ THIRD-PARTY.md）' })
if (!fs.existsSync(path.join(ROOT, 'THIRD-PARTY.md'))) findings.blocking.push({ kind: 'license', file: 'THIRD-PARTY.md', msg: '第三方声明缺失' })

// ④ vendored webwallgl（若有）必须带 MIT 声明；字体许可文件必须齐全
const webwallglFiles = files.filter((p) => /webwallgl/i.test(rel(p)))
if (webwallglFiles.length) {
  const withMit = webwallglFiles.some((p) => /(^|\/)(LICENSE|COPYING)/i.test(rel(p)) && /MIT/i.test((() => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } })()))
  if (!withMit) findings.blocking.push({ kind: 'license', file: rel(webwallglFiles[0]), msg: 'Vendored webwallgl 未随附 MIT 声明（缺 LICENSE/COPYING 或其中无 MIT 字样）' })
  else findings.info.push({ kind: 'license', msg: `Vendored webwallgl：${webwallglFiles.length} 个文件，MIT 声明在位` })
} else {
  findings.info.push({ kind: 'license', msg: 'Vendored webwallgl：未 vendored（仓库外研读副本）→ 无需随附声明；将来引入必须登记 THIRD-PARTY.md' })
}
// ④b (P-93) **任何 `vendor/<x>/` 下的 vendored 代码都必须带自己的许可全文**：
//   ④ 那条是按"路径里含 webwallgl"抓的（历史写法），抓不到"上游文件被改名后放进我们自己的目录"
//   这类 vendoring —— P-93 的 `vendor/hlsl2glsl/` 正是如此（路径里没有上游名，于是 ④ 只报了 1 个文件）。
//   这里补一条**目录级**规则：`vendor/*/` 里只要有代码文件，就必须 ① 有 LICENSE/COPYING 且含许可关键字、
//   ② 在 `THIRD-PARTY.md` 里被点名（否则"已署名"只是口头承诺，删掉声明也没人拦）。
const vendorDir = path.join(ROOT, 'vendor')
if (fs.existsSync(vendorDir)) {
  const thirdPartyText = (() => { try { return fs.readFileSync(path.join(ROOT, 'THIRD-PARTY.md'), 'utf8') } catch { return '' } })()
  for (const d of fs.readdirSync(vendorDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const dp = path.join(vendorDir, d.name)
    let ents = []
    try { ents = fs.readdirSync(dp) } catch { continue }
    const code = ents.filter((n) => /\.(js|mjs|cjs|ts|tsx|glsl|vert|frag|h|inc)$/i.test(n))
    if (!code.length) continue
    const lic = ents.find((n) => /^(LICENSE|COPYING|NOTICE)/i.test(n))
    const licText = lic ? (() => { try { return fs.readFileSync(path.join(dp, lic), 'utf8') } catch { return '' } })() : ''
    const hasSpdx = /MIT|ISC|Apache|BSD|OFL|GPL|CC-BY|zlib|Unlicense/i.test(licText)
    if (!lic || !hasSpdx) findings.blocking.push({ kind: 'license', file: 'vendor/' + d.name + '/', msg: 'vendored 代码缺少许可全文（需 LICENSE/COPYING 且含 MIT/ISC/Apache/… 关键字）' })
    else if (!thirdPartyText.includes(d.name)) findings.blocking.push({ kind: 'license', file: 'vendor/' + d.name + '/', msg: `THIRD-PARTY.md 未点名 vendored 目录 "${d.name}"（署名必须随仓库分发）` })
    else findings.info.push({ kind: 'license', msg: `Vendored 目录 vendor/${d.name}/：${code.length} 个代码文件，${lic} 在位且 THIRD-PARTY.md 已点名` })
  }
}

const fontsDir = path.join(ROOT, 'assets', 'fonts')
const fontLicDir = path.join(fontsDir, 'licenses')
if (!fs.existsSync(fontLicDir)) findings.blocking.push({ kind: 'license', file: 'assets/fonts/licenses/', msg: '字体许可目录缺失（OFL/Apache/CC-BY 全文必须随仓库）' })
else {
  const licFiles = fs.readdirSync(fontLicDir)
  const need = [
    ['OFL 全文', (n) => /OFL/i.test(n)],
    ['Apache-2.0 全文', (n) => /^Apache-2\.0\.txt$/i.test(n)],
    ['CC-BY-4.0 归属声明', (n) => /^CC-BY-4\.0/i.test(n)],
  ]
  const missing = need.filter(([, f]) => !licFiles.some(f)).map(([label]) => label)
  if (missing.length) findings.blocking.push({ kind: 'license', file: 'assets/fonts/licenses/', msg: '字体许可文件缺失：' + missing.join('、') + `（现有 ${licFiles.length} 个）` })
  else findings.info.push({ kind: 'license', msg: `字体许可：${licFiles.length} 个文件（OFL 全文 / Apache-2.0 / CC-BY-4.0 归属都在位）` })
  const fontFiles = fs.readdirSync(fontsDir).filter((n) => /\.(ttf|otf)$/i.test(n))
  if (!fontFiles.length) findings.warnings.push({ kind: 'license', file: 'assets/fonts/', msg: '未发现随仓库分发的字体文件（若已全部移除，请同步清理 THIRD-PARTY.md §4 与 assets/fonts/README.md）' })
}

// ── 输出 ──
if (JSON_OUT) { console.log(JSON.stringify(findings, null, 1)); process.exit(findings.blocking.length ? 1 : 0) }
for (const f of findings.info) console.log('· ' + (f.file ? f.file + ' — ' : '') + f.msg)
if (findings.warnings.length) { console.log(`\n⚠ 告警 ${findings.warnings.length} 条：`); for (const w of findings.warnings.slice(0, 20)) console.log('  ⚠ ' + w.file + ' — ' + w.msg); if (findings.warnings.length > 20) console.log(`  …还有 ${findings.warnings.length - 20} 条`) }
if (findings.blocking.length) {
  console.log(`\n✗ 阻塞项 ${findings.blocking.length} 条（发布前必须处理）：`)
  for (const b of findings.blocking.slice(0, 30)) console.log('  ✗ ' + b.file + ' — ' + b.msg)
  console.log('\n提示：把"删除候选"移入 ../Delete/ 而不是删除；改造完重跑本脚本直到 0 阻塞项，再由用户确认发布。')
  process.exit(1)
}
console.log('\n✓ 无阻塞项：可以进入人工复核（**发布仍需用户明确确认**）')
