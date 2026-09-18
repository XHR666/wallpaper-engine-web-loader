// mpw-select-test.mjs —— 自绘下拉的门禁（①2026-09-19 用户第 6 项）
//
// 覆盖三块（秒级、无浏览器、无网络）：
//   A **纯决策逻辑**：`demo/mpw-select-math.mjs` 的每一个分支都被边界值钉死
//     （往下够 / 只够往上 / 两边都紧 / 空列表 / 键盘 wrap 与不 wrap / 点外面）
//   B **实现纪律（静态）**：CSS 全部落在 `.mpw_select` 子树内、不定义全局变量、不用 innerHTML 拼文案、
//     单开注册表在、监听器**配对**装卸（open 挂 close 卸 —— 本机内存紧，常驻监听是不允许的）
//   C **RED-IF-REVERTED**：把 math 模块复制到 /tmp 改坏（`decideFlip` 恒 'down'）⇒ 上翻判据必须变红
//     （真树只读；本机 `fs.cpSync` 抛 EINVAL ⇒ 用 readFileSync/writeFileSync）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as m from '../demo/mpw-select-math.mjs'
import { ROOT } from './_root.mjs'

let pass = 0; let fail = 0
const ok = (c, label, extra = '') => { if (c) { pass++; console.log('PASS ' + label + (extra ? '  ' + extra : '')) } else { fail++; console.log('FAIL ' + label + (extra ? '  ' + extra : '')) } }
const eq = (a, b, label) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), label, `实测 ${JSON.stringify(a)}，期望 ${JSON.stringify(b)}`)

const SRC = path.join(ROOT, 'demo/mpw-select.js')
const MATH = path.join(ROOT, 'demo/mpw-select-math.mjs')
const src = fs.readFileSync(SRC, 'utf8')
const mathSrc = fs.readFileSync(MATH, 'utf8')

// ── A 纯决策逻辑 ────────────────────────────────────────────────────────────
console.log('== A 纯决策逻辑 ==')
eq(m.ITEM_H, 26, 'A1 行高常量 = 26（CSS 里必须与它一致）')
eq(m.LIST_PAD, 8, 'A2 列表内边距合计 = 8')
eq(m.MIN_H, m.ITEM_H + m.LIST_PAD, 'A3 最小高度 = 一行 + 内边距')

eq(m.listHeight(0, 200), m.MIN_H, 'A4 空列表也给最小高度（不是 0，避免"看不见的空框"）')
eq(m.listHeight(3, 200), 3 * m.ITEM_H + m.LIST_PAD, 'A5 装得下 ⇒ 恰好装下（不多留白）')
eq(m.listHeight(50, 100), 100, 'A6 装不下 ⇒ 被 maxH 夹住（之后靠滚动）')
eq(m.listHeight(50, 1), m.MIN_H, 'A7 maxH 小于最小高度 ⇒ 仍然给最小高度（不能变成 0）')

eq(m.decideFlip({ spaceBelow: 300, spaceAbove: 10, wantHeight: 200 }), 'down', 'A8 下方够 ⇒ **默认往下**')
eq(m.decideFlip({ spaceBelow: 50, spaceAbove: 300, wantHeight: 200 }), 'up', 'A9 下方不够、上方够 ⇒ 往上（用户点名的那条）')
eq(m.decideFlip({ spaceBelow: 50, spaceAbove: 60, wantHeight: 200 }), 'up', 'A10 两边都不够 ⇒ 选更宽裕的一侧（上）')
eq(m.decideFlip({ spaceBelow: 60, spaceAbove: 50, wantHeight: 200 }), 'down', 'A11 两边都不够 ⇒ 选更宽裕的一侧（下）')
eq(m.decideFlip({ spaceBelow: 200, spaceAbove: 200, wantHeight: 200 }), 'down', 'A12 两边一样够 ⇒ 仍然往下（默认优先）')

const planDown = m.planList({ anchorTop: 100, anchorBottom: 130, viewportTop: 0, viewportBottom: 800, count: 5 })
eq(planDown.flip, 'down', 'A13 planList：锚点在顶部 ⇒ 往下')
eq(planDown.height, 5 * m.ITEM_H + m.LIST_PAD, 'A14 planList：高度 = 全部项')
eq(planDown.clamped, false, 'A15 planList：没被夹')
const planUp = m.planList({ anchorTop: 760, anchorBottom: 790, viewportTop: 0, viewportBottom: 800, count: 20 })
eq(planUp.flip, 'up', 'A16 planList：锚点贴底 ⇒ 往上')
ok(!planUp.clamped && planUp.height === 20 * m.ITEM_H + m.LIST_PAD, 'A17 planList：上方空间够时装满（754px 装 20 项 = 528px）', `h=${planUp.height} spaceAbove=${planUp.spaceAbove}`)
const planUpTight = m.planList({ anchorTop: 500, anchorBottom: 530, viewportTop: 0, viewportBottom: 540, count: 40 })
eq(planUpTight.flip, 'up', 'A17b 上方更宽裕 ⇒ 往上')
ok(planUpTight.clamped && planUpTight.height <= planUpTight.spaceAbove + 1, 'A17c 往上但装不下 ⇒ 夹到可用空间内（之后靠滚动）',
  `h=${planUpTight.height} spaceAbove=${planUpTight.spaceAbove} want=${40 * m.ITEM_H + m.LIST_PAD}`)
const planTight = m.planList({ anchorTop: 10, anchorBottom: 700, viewportTop: 0, viewportBottom: 710, count: 40 })
ok(planTight.height >= m.MIN_H, 'A18 planList：上下都极窄时仍给最小高度（不许 0）', `h=${planTight.height} ${planTight.flip}`)

eq(m.nextIndex('ArrowDown', -1, 5), 0, 'A19 Down（无高亮）⇒ 第一项')
eq(m.nextIndex('ArrowUp', -1, 5), 4, 'A20 Up（无高亮）⇒ 最后一项')
eq(m.nextIndex('ArrowDown', 4, 5), 0, 'A21 Down 到底 ⇒ 回卷到第一项（wrap 默认开）')
eq(m.nextIndex('ArrowUp', 0, 5), 4, 'A22 Up 到顶 ⇒ 回卷到最后一项')
eq(m.nextIndex('ArrowDown', 4, 5, { wrap: false }), 4, 'A23 wrap=false ⇒ 停在最后一项')
eq(m.nextIndex('Home', 3, 5), 0, 'A24 Home ⇒ 第一项')
eq(m.nextIndex('End', 1, 5), 4, 'A25 End ⇒ 最后一项')
eq(m.nextIndex('ArrowDown', 0, 0), -1, 'A26 空列表 ⇒ -1（不越界）')
eq(m.nextIndex('PageDown', 0, 20), 5, 'A27 PageDown ⇒ +5')
eq(m.nextIndex('PageUp', 3, 20), 0, 'A28 PageUp ⇒ −5（下限 0）')

ok(m.isCommitKey('Enter') && m.isCommitKey(' '), 'A29 Enter/Space = 选中键')
ok(m.isCancelKey('Escape') && !m.isCancelKey('Enter'), 'A30 Escape = 取消键（且与选中键互斥）')

ok(m.isOutside({}, null) === true, 'A31 没有控件根 ⇒ 一切算外面（防御）')
const fakeRoot = { contains: (t) => t === 'inside' }
ok(m.isOutside('outside', fakeRoot) === true && m.isOutside('inside', fakeRoot) === false, 'A32 点外面/里面判定正确（用于"点别处就关"）')

// `<select>` 的极小替身（只用到 options/value/textContent/disabled）
const fakeSelect = {
  value: 'b',
  options: [
    { value: 'a', textContent: ' Alpha ', disabled: false },
    { value: 'b', textContent: 'Beta', disabled: false },
    { value: 'c', textContent: 'Gamma', disabled: true },
  ],
}
eq(m.optionsOf(fakeSelect), [{ value: 'a', label: 'Alpha', disabled: false }, { value: 'b', label: 'Beta', disabled: false }, { value: 'c', label: 'Gamma', disabled: true }],
  'A33 optionsOf：值/文案（trim）/disabled 都取到')
eq(m.selectedIndex(m.optionsOf(fakeSelect), 'b'), 1, 'A34 selectedIndex：命中')
eq(m.selectedIndex(m.optionsOf(fakeSelect), 'zzz'), 0, 'A35 selectedIndex：找不到 ⇒ 0（不返回 -1 造成空按钮）')
eq(m.selectedIndex([], 'a'), -1, 'A36 selectedIndex：空列表 ⇒ -1')

// ── B 实现纪律（静态） ──────────────────────────────────────────────────────
console.log('\n== B 实现纪律（静态） ==')
const cssMatch = src.match(/const CSS = `([\s\S]*?)`\n/)
ok(!!cssMatch, 'B1 能取出注入的 CSS 文本')
const css = cssMatch ? cssMatch[1] : ''
const selectors = css.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('@') && !l.startsWith('}') && l.includes('{'))
  .map((l) => l.slice(0, l.indexOf('{')).trim())
const badSel = selectors.filter((s) => !s.startsWith('.mpw_select'))
ok(badSel.length === 0, 'B2 CSS 每条选择器都以 `.mpw_select` 开头（不碰宿主 UI）', badSel.length ? `越界: ${badSel.join(' | ')}` : `${selectors.length} 条全部合规`)
ok(!/:root|html\s|body\s|\*\s*\{/.test(css), 'B3 CSS 里没有 `:root` / 裸 `html|body|*` 选择器')
const declaredVars = [...css.matchAll(/(^|[;{\s])(--[a-z0-9-]+)\s*:/gi)].map((mm) => mm[2])
eq(declaredVars, [], 'B4 CSS **不定义任何自定义属性**（不外泄 token；宿主已有自己的主题）')
ok(css.includes('${ITEM_H}'), 'B5 行高来自常量插值（CSS 与 math 不会各写一个数字）')
ok(/padding:\s*4px 0/.test(css), 'B6 列表内边距与 `LIST_PAD=8`（4+4）一致')

ok(!/\.innerHTML\s*=/.test(src), 'B7 不用 `innerHTML` 拼文案（只用 textContent ⇒ 选项文本不会被当 HTML）')
ok(/textContent\s*=/.test(src), 'B8 用 textContent 写文案')
ok(/let openRoot = null/.test(src), 'B9 有**模块级单开注册表**（结构上不可能"点几次重复打开"）')
ok(/if \(list\) close\(true\); else open\(\)/.test(src), 'B10 触发按钮是 **toggle**（再点即关，不是又开一个）')

const addCount = (src.match(/addEventListener\(/g) || []).length
const rmCount = (src.match(/removeEventListener\(/g) || []).length
ok(addCount >= 6 && rmCount >= 4, 'B11 监听器**配对装卸**（open 挂、close 卸 ⇒ 无常驻监听、不涨内存）', `add=${addCount} remove=${rmCount}`)
const closeBody = src.slice(src.indexOf('const close = (focusBack'), src.indexOf('const onDocDown'))
ok(/removeEventListener/.test(closeBody), 'B12 `close()` 里确实卸掉了 document/窗口监听')
ok(/openRoot = null/.test(closeBody), 'B13 `close()` 会清空单开注册表')
ok(!/requestAnimationFrame\s*\(/.test(src), 'B14 没有常驻 rAF 循环（下拉静止时零帧回调）')
ok(/destroy:/.test(src) && /selectEl\.hidden = false/.test(src), 'B15 提供 destroy() 并把原生 select 放回来（可回退）')
ok(/MutationObserver/.test(src) && /disconnect\(\)/.test(src), 'B16 选项变化用 MutationObserver 跟随，且 disconnect 在 destroy 里')
ok(!/document\.body\.style/.test(src) && !/documentElement\.style/.test(src), 'B17 不往 body/documentElement 写样式')

console.log('\n== C RED-IF-REVERTED（真树只读，变异在 /tmp 副本） ==')
const shaBefore = (() => { const c = fs.readFileSync(MATH); return c.length + ':' + c.subarray(0, 32).toString('hex') })()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-sel-'))
const mutantPath = path.join(tmp, 'mpw-select-math.mjs')
const mutant = mathSrc.replace(
  /export function decideFlip\(\{ spaceBelow, spaceAbove, wantHeight \}\) \{[\s\S]*?\n\}/,
  "export function decideFlip({ spaceBelow, spaceAbove, wantHeight }) {\n  void spaceAbove; void wantHeight; void spaceBelow\n  return 'down'\n}",
)
ok(mutant !== mathSrc, 'C1 变异确实改到了源码（锚点命中）')
fs.writeFileSync(mutantPath, mutant)
const mm = await import(pathToFileURL(mutantPath).href)
const mutantFlip = mm.decideFlip({ spaceBelow: 50, spaceAbove: 300, wantHeight: 200 })
ok(mutantFlip === 'down' && m.decideFlip({ spaceBelow: 50, spaceAbove: 300, wantHeight: 200 }) === 'up',
  'C2 ★ 变异生效：`decideFlip` 恒 down ⇒ A9/A10/A16 这类"上翻"判据必红（真文件仍是 up）',
  `变异=${mutantFlip} 真文件=${m.decideFlip({ spaceBelow: 50, spaceAbove: 300, wantHeight: 200 })}`)
const shaAfter = (() => { const c = fs.readFileSync(MATH); return c.length + ':' + c.subarray(0, 32).toString('hex') })()
ok(shaBefore === shaAfter, 'C3 真树 `demo/mpw-select-math.mjs` 跑前跑后一致（变异只落 /tmp）', shaAfter)
fs.rmSync(tmp, { recursive: true, force: true })

console.log(`\n── 汇总：PASS=${pass} FAIL=${fail}`)
process.exitCode = fail ? 1 : 0
