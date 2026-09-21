// bench-dropdown-theme-test.mjs —— 测试台三条真机报障的判据（2026-09-22）
//
// 覆盖用户第 25 / 29 / 12 条（都是"静态可判"的那类：一个未定义函数、一个捕获监听、一个缺省分支）：
//   25 叉掉几张贴后卡住 + `Uncaught ReferenceError: setTypeFilter is not defined`
//      → 根因：`switchToWallpaper` 调的 `setTypeFilter` **全仓从未定义**（重构时丢的）。
//        契约：那条路必须调**产物自己的**切档函数 `driveBundleType`，且全仓不再出现 `setTypeFilter`。
//   29 分辨率下拉里滚轮一滚就把浮层关掉
//      → 根因：捕获阶段的 `scroll ⇒ closeAll(null)` 把**列表自身**的滚动也收了（列表 `overflow-y:auto` 可滚）。
//        契约：捕获监听仍在、非内部滚动仍然 closeAll，但**浮层内部**的滚动要跳过。
//   12 一进 :8902 就是深色主题
//      → 根因：主题规范化对"从没设过"回落到 dark。
//        契约：**没存过 ⇒ light**；显式 dark/light 照办；历史 'auto' 仍按系统偏好迁移一次（旧语义不动）。
//
// 运行：node tests/bench-dropdown-theme-test.mjs   （全过 ALL PASS，退出码 0）
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './_root.mjs'
import { normalizeThemeMode, themePlan, nextThemeMode, resolveTheme } from '../demo/bench-patch.js'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  [' + d + ']' : '')) } else { fail++; console.log('  ✗ ' + n + (d ? '  [' + d + ']' : '')) } }
const PATCH_RAW = fs.readFileSync(path.join(ROOT, 'demo', 'bench-patch.js'), 'utf8')
/** 剥掉注释后的**代码文本**：判"某个标识符还在不在代码里"必须只看代码 —— 注释里提到它是正常的
 *  （本次修复的注释就写了"旧写法调的 setTypeFilter 从未定义"），拿注释判红会变成自指假红。 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const PATCH = stripComments(PATCH_RAW)
const HTML = fs.readFileSync(path.join(ROOT, 'demo', 'index.html'), 'utf8')
const HTML_CODE = stripComments(HTML)

console.log('== 25 未定义函数（`setTypeFilter`）==')
ok('25a 切档那条路调的是产物自己的 `driveBundleType(kind)`',
  /if \(kind && kind !== bundleType\) \{ driveBundleType\(kind\);/.test(PATCH))
ok('25b 全仓不再出现 `setTypeFilter`（调用/定义都不许有 —— 它从未存在过）',
  !/setTypeFilter/.test(PATCH), '命中 ' + (PATCH.match(/setTypeFilter/g) || []).length)
ok('25c `driveBundleType` 真的定义在同一文件（函数声明会提升 ⇒ 前面的调用合法）',
  /function driveBundleType\(type\) \{/.test(PATCH))

console.log('\n== 29 浮层内部滚动不该关掉自己 ==')
ok('29a 捕获阶段的 scroll 监听仍在（非内部滚动仍要收起 —— 这条没被放宽）',
  /addEventListener\('scroll', \(e\) => \{/.test(PATCH) && /closeAll\(null\)/.test(PATCH) && /\}, true\)/.test(PATCH))
ok('29b 处理器**先**判"事件源在某个已登记浮层内部"并 return',
  /addEventListener\('scroll', \(e\) => \{[\s\S]{0,900}?for \(const d of dropdowns\)[\s\S]{0,200}?d\.wrap\.contains\(t\)[\s\S]{0,120}?return[\s\S]{0,200}?closeAll\(null\)/.test(PATCH))
ok('29c resize 那条保持原样（窗口改尺寸时浮层仍要收起：坐标会脱开）',
  /addEventListener\('resize', \(\) => closeAll\(null\)\)/.test(PATCH))
ok('29d 下拉列表自身可滚（`overflow-y:auto` + 限高）—— 这正是"一滚滚轮就关"能发生的物理前提',
  /\.bench-rd-list\{[^}]*overflow-y:auto/.test(HTML) || /\.bench-rd-list\{[^}]*overflow-y:auto/.test(PATCH))

console.log('\n== 12 主题缺省 = 浅色（纯函数口径）==')
ok('12a **从没设过** ⇒ light（null / undefined / 空串都算没设过）',
  normalizeThemeMode(null, true) === 'light' && normalizeThemeMode(undefined, true) === 'light' && normalizeThemeMode('', true) === 'light',
  JSON.stringify([normalizeThemeMode(null, true), normalizeThemeMode(undefined, true), normalizeThemeMode('', true)]))
ok('12b 系统偏好是深色也仍然是 light（"缺省浅色"与系统无关 —— 这是用户要的默认）',
  normalizeThemeMode(null, true) === 'light' && normalizeThemeMode(null, false) === 'light')
ok('12c 显式 dark / light 照办（用户在设置里选过的不能被覆盖）',
  normalizeThemeMode('dark', false) === 'dark' && normalizeThemeMode('light', true) === 'light')
ok('12d 历史值 `auto` 仍按系统偏好**迁移一次**（旧语义逐位保留，不是被我一起改掉）',
  normalizeThemeMode('auto', true) === 'dark' && normalizeThemeMode('auto', false) === 'light')
ok('12e 非法值（垃圾字符串）也落到 light（与"没设过"同支）',
  normalizeThemeMode('nonsense', true) === 'light')
ok('12f `themePlan` 与实际生效 theme 自洽（light ⇒ data-theme=light）',
  themePlan(null, true).mode === 'light' && themePlan(null, true).theme === 'light' && resolveTheme('light', true) === 'light')
ok('12g 点击循环仍是两态（light ⇄ dark），没有被改成三态',
  nextThemeMode('light') === 'dark' && nextThemeMode('dark') === 'light')

console.log('\n== 26 配置按钮"选中"必须=真的展开且有内容 ==')
ok('26a 按下态由"未收起 **且** 属性表真有行"决定（旧写法只看收起与否 ⇒ 新加载壁纸时亮蓝底却是空的）',
  /let hasRows = false/.test(PATCH) && /c\.dataset && c\.dataset\.benchPropsEmpty/.test(PATCH) && /const on = !want && hasRows/.test(PATCH))
ok('26b 我们插的空态带 `data-bench-props-empty` 标记（不给空态也算"有行"）',
  /benchPropsEmpty/.test(PATCH))
ok('26c `aria-pressed` 与 `checked` 都由这同一个 `on` 写（两处不许各判一套）',
  /propsToggleBtn\.classList\.toggle\('checked', on\)/.test(PATCH) && /propsToggleBtn\.setAttribute\('aria-pressed', on \? 'true' : 'false'\)/.test(PATCH))

console.log('\n== 27 页签全叉光 ⇒ 属性面板必须清空 ==')
ok('27a `closeWallpaperTab` 里判"一个都不剩"（没打开项、没当前项，**且列表里没有 `.active`**）',
  /const noneLeft = \(\) => !\(Array\.isArray\(pinned\) && pinned\.length\) && !curId/.test(PATCH)
  && /querySelector\('#list li\.active'\)/.test(PATCH))
ok('27b 清空是**延迟一拍再判定**（切档瞬间 curId/pinned 都可能是空的 ⇒ 立刻清会误清新那张的面板）',
  /if \(noneLeft\(\)\) setTimeout\(\(\) => \{ try \{ if \(noneLeft\(\)\) \{ clearPropsBody\(\); paintPropsEmpty\(\) \}/.test(PATCH))
ok('27c 清空发生在落盘之后（用的是刚写回的 `pinned`/`curId`，不是旧的）',
  PATCH.indexOf('writePinned(plan.pinned)') < PATCH.indexOf('const noneLeft ='))

console.log('\n== D 分辨力自证：把三处改回旧写法必红 ==')
ok('D1 旧写法（`setTypeFilter`）一旦回到代码里，25b 立刻红 —— 这里证明该判据确实在扫"代码"（注释不算）',
  /setTypeFilter/.test(stripComments('switchToWallpaper(): setTypeFilter(kind)')) && !/setTypeFilter/.test(PATCH)
  && /setTypeFilter/.test(PATCH_RAW))   // 注释里提到它是允许的（本次修复的注释就是这么写的）
ok('D2 旧的主题缺省（回落 dark）在 12a 下必红：模拟旧函数',
  (() => { const old = (saved) => (String(saved == null ? '' : saved) === 'light' ? 'light' : 'dark'); return old(null) === 'dark' && normalizeThemeMode(null, true) === 'light' })())
ok('D3 旧的 scroll 处理（无条件 closeAll）不满足 29b（缺"跳过内部"这一段）',
  !/addEventListener\('scroll', \(e\) => \{[\s\S]{0,900}?for \(const d of dropdowns\)[\s\S]{0,200}?d\.wrap\.contains\(t\)[\s\S]{0,120}?return[\s\S]{0,200}?closeAll\(null\)/.test("addEventListener('scroll', (e) => { closeAll(null) }, true)"))

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败')
if (fail === 0) console.log('✓ 测试台三条（未定义函数 / 浮层内部滚动 / 主题缺省）通过：接线正确 + 纯函数口径 + 各有分辨力')
process.exit(fail > 0 ? 1 : 0)
