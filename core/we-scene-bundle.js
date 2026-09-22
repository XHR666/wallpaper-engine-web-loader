/* 参照来源许可声明：本文件提到的 wer-ref/ 是第三方参考实现（Aromatic05/wallpaper-engine-renderer，GPL-2.0-only，非 WE 官方代码、非「真值源」），与本项目（GPL-3.0-or-later）许可不兼容 —— 仅用于行为对照，不得复制/改写/逐行翻译其代码、注释、常量组织或错误文案。we-layerd-ref/（Aromatic05/we-layerd）无任何许可（保留所有权利），同样仅行为对照。血缘自查结论见 docs/WER-REF-LICENSE-AUDIT.md。 本文件中所有 `wer-ref …` 形式的引用都是**行为对照**引注（只引用行为结论，未复制其代码/注释/常量组织）。 */ // we-scene 浏览器渲染器打包（保留 export，剥离 import）
// ①(P-21-ATTACH 2026-09-13) 附件/父链变换（移植自 elysia，浏览器/Node 共用；服务器有 /attach-transform.mjs 路由）
import { buildAttachOffsets, attachOffsetDeltas, parseMdl, parseMdatAnchors, matMulRow as __matMulRow16 } from './attach-transform.mjs'
// ①(P-110 2026-09-17) bind 世界链的**唯一实现处**（子先乘修正序 + `?bindorder=legacy` 回退）。
//   转发导出：宿主（demo.html）与测试共用同一份链序，避免"四处各写一遍、一处不同步就复发"。
import { bindWorldChain, bindWorldPolar, bindOrderLegacy } from './puppet-skin.js'
export { bindWorldChain, bindWorldPolar, bindOrderLegacy, attachOffsetDeltas, parseMdl, parseMdatAnchors }
// ①(P-112-BANDGEOM 2026-09-17 帧几何接线) 帧内坐标契约（纯函数，规格 docs/WEB-FRAME-GEOMETRY-SPEC.md）：
//   "窗口坐标 → 帧内 client 像素"的换算在**唯一实现处** `core/web-frame-geometry.mjs`，
//   本文件只做接线（`?framegeom=cover`，缺省 legacy = 逐位等于改动前的内联算式）。
//   为什么必须借它：画布/iframe 的 `getBoundingClientRect()` 含祖先 CSS transform 的缩放，
//   而帧内部视口（`clientWidth/clientHeight`）不含 —— 内联算式在"被缩放的宿主"下会把
//   pointer 坐标算错（不报错、只是位置整体偏），这正是 P-102 立规格的动机。
//   ⚠ 本仓库**没有** web 壁纸 iframe 宿主（三方 minified 渲染器内部自算 + 插件侧在别的树），
//   ⇒ 只接"指针口径"这一半；帧宽高比那一半（coverViewport/contentAspectOf）的消费点见
//   `demo.html`（video 壁纸帧盒）与 `docs/AUDIO-BAND-WIRING.md` §4 的未定清单。
import { frameClientPoint, frameGeomModeFromQuery } from './web-frame-geometry.mjs'
// ①(P-136 用户第 4 项：照抄上游 MIT 实现) **鼠标尾迹**指针通路，整块照抄上游
//   oneincase/webwallgl（MIT © 2026 oneincase）：
//   · `we-particle-pointer.mjs` ← `renderer/vendor/we-scene/render/particles.js:663-672/686-697/830-851/1010-1024/1154-1163`
//     + `renderer/src/scene-mount.ts:1670-1676`（粒子侧 `setPointer` / `_cpPos` / 投放 / 涡流 / 每帧推指针）
//   · `we-pointer-source.mjs`   ← `renderer/vendor/we-scene/render/pointer.js:1-320`（统一指针输入源，整文件逐字）
//   各文件的来源行号、许可、以及「哪几行做了适配、为什么」写在文件头；登记见 THIRD-PARTY.md §14。
//   ①(P-144 子系) 追加照抄三块：`particles.js:698-707` `attachFollow` / `:709-713` `leaderParticle` /
//   `:724-743` `_syncFollow` + `renderer/src/scene-mount.ts:1449-1560`（递归建子系、followMode 判定、
//   子系图层变换的合成）—— 这就是 `children` 的 `static`/`eventfollow` 两个 type 的实现来源。
//   登记见 THIRD-PARTY.md §15。
import { syncLayerTransform, setPointer, cpPos, cpWorld, localToWorld, mapSequenceAroundControlPoint, vortexSwirl, pushPointerFrame, attachFollow, leaderParticle, syncFollowOrigin, shadowCpWorld, finishTrailInPlace, pointerShadowWorld } from './we-particle-pointer.mjs'
import { createPointerSource } from './we-pointer-source.mjs'
// ①(P-131 批 D 2026-09-19 音频驱动发射) 粒子 `audioprocessing*`（官方编辑器里叫 **Audio response**）
//   的包络与频段口径在**唯一实现处** `core/audio-band-array.mjs`（纯函数、无 DOM）：
//   本文件只做接线（把 16 段活视图喂进去 + 按官方语义作用到发射率/相位/速度）。
//   为什么能同目录 import：`build-pages.mjs` 把 `core/audio-band-array.mjs` 拷到**站点根**同名文件
//   （`['core/audio-band-array.mjs','audio-band-array.mjs']`），而 bundle 自己也在站点根 ⇒
//   `./audio-band-array.mjs` 在"仓库 + 产物"两种布局下都命中（同 `./web-frame-geometry.mjs` 的既有形态）。
//   ①(P-134 ⑥ 第二处) 其余频谱分辨率（32/64）也走同一实现处的 `resampleBands`（均值重采样）。
import { parseAudioResponse, audioEnvelope, resampleBands } from './audio-band-array.mjs'

/** `?framegeom=` 的合法档位（缺省 legacy ⇒ 一行行为都不变） */
export const FRAME_GEOM_MODES = ['legacy', 'cover']

/**
 * 帧几何挡位解析：`?framegeom=cover`（或 `=frame`）启用模块换算；其余/缺省 ⇒ `'legacy'`。
 * 模块自带的回退开关 `?frame=legacy|off|0`（规格 §5）**优先级最高** —— 即使写了 `?framegeom=cover`
 * 也强制回 legacy，保证模块规格里的逃生口在任何调用方都成立。
 */
export function frameGeomMode(search) {
  try {
    const q = new URLSearchParams(search == null ? '' : String(search))
    const v = String(q.get('framegeom') || '').trim().toLowerCase()
    if (v !== 'cover' && v !== 'frame') return 'legacy'
    return frameGeomModeFromQuery(search) === 'legacy' ? 'legacy' : 'cover'
  } catch (e) { return 'legacy' }
}

/**
 * 指针事件 → 帧内坐标（`{x, y, nx, ny, scaleX, scaleY, inside}`；量不到 ⇒ null）。
 * - `mode='cover'`：走 `frameClientPoint`（换算含祖先 transform 补偿，规格 §1.3）；
 * - `mode='legacy'`：**逐位等于改动前的内联算式** `(clientX − rect.left) / rect.width`
 *   （只做显示盒归一，不碰 `clientWidth`；NaN 输入照旧透传，不新增丢弃行为）。
 * - `flipX`（P-113，缺省 false = **逐位不变**）：输出元素被 `transform: scaleX(-1)` 水平翻转时，
 *   屏幕 x 处**看到的是**未翻转内容的 `1 − x`（镜像关于元素中心）⇒ 归一坐标必须镜像一次，
 *   指针才仍然指着"光标底下那点内容"。**只在这里镜像一次**：注入通道 `window.__mpwPointer`
 *   给的是**设计坐标**（宿主算好的场景空间），CSS transform 不改变它 ⇒ 那条路径不翻转。
 */
export function framePointerMap(ev, el, mode, flipX) {
  const r = (el && typeof el.getBoundingClientRect === 'function') ? el.getBoundingClientRect() : null
  if (!r || !(r.width > 0) || !(r.height > 0)) return null
  if (mode === 'cover') {
    const vw = Number(el.clientWidth) || 0, vh = Number(el.clientHeight) || 0
    const p = frameClientPoint(ev, r, { width: vw, height: vh })
    if (!p) return null
    const x = flipX ? (vw - p.x) : p.x          // 帧内 client 像素的镜像（宽度对称 ⇒ inside 不变）
    return { x, y: p.y, nx: vw > 0 ? x / vw : 0, ny: vh > 0 ? p.y / vh : 0, scaleX: p.scaleX, scaleY: p.scaleY, inside: p.inside, flipX: !!flipX }
  }
  const x0 = (ev ? ev.clientX : NaN) - r.left, y = (ev ? ev.clientY : NaN) - r.top
  const x = flipX ? (r.width - x0) : x0
  return { x, y, nx: x / r.width, ny: y / r.height, scaleX: 1, scaleY: 1, inside: true, flipX: !!flipX }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 显示选项（P-113）—— 水平翻转 / 播放速度 0.5–2× / 颜色选项（亮度·对比度·饱和度·色调偏移）
//
// 契约来源：测试台「壁纸设置」页的表（插件 dsh-mpkg-wallpaper 的壁纸显示选项，MIT）——
//   `__wp.setDisplay({flipH:true})` / `?fliph=1`、`__wp.setPlaybackRate(1.5)` / `?rate=1.5`、
//   `__wp.setDisplay({colorOptions:false})` / `?coloropts=0`、
//   `?bright=1.1&contrast=1.05&satur=1.2&hue=15`。完整口径见 `docs/DISPLAY-OPTIONS.md`。
// 机制（与上游 oneincase/webwallgl MIT 的 `?fx=`/`setFilter` **同一机制**，非同一份代码）：
//   **CSS `filter` / `transform` 作用在"拥有渲染输出的那个元素"上**（上游是 wrap 容器，
//   本仓库是 canvas `#sc`）：不重挂载、不进 GL 管线、不改一帧像素。
// 三条硬口径（都能被 `tests/display-options-test.mjs` 断言）：
//   ① **参数全缺省 ⇒ 一个字节都不改**：`buildDisplayFilter` 全中性时返回 `''`，
//      `buildDisplayTransform` 关时返回 `''` ⇒ 页面**不写** `style.filter` / `style.transform`；
//   ② **和既有滤镜写入者（`?fx=`/宿主）不打架**：颜色选项**追加在既有 filter 串之后**
//      （CSS 从左到右依次作用 ⇒ 颜色项看到的是既有滤镜的输出），关掉时**逐字还原**原串；
//   ③ 回退 `?display=legacy` ⇒ 解析结果全中性，且 API 也不再生效（`setDisplay` 变成只读）。
// ⚠ 未证实/边界：`transform` 的既有写入者在 demo.html 里**不存在**（grep 0 命中），
//   `composeTransformCss` 的"镜像在前"顺序只对"以后有人往输出元素上写 transform"生效。
/** 合法区间（超范围**钳位**、非有限值/空值 ⇒ 默认；文档 `docs/DISPLAY-OPTIONS.md` §2 表） */
export const DISPLAY_LIMITS = {
  brightness: [0, 2], contrast: [0, 2], saturation: [0, 2], hue: [-180, 180], playbackRate: [0.5, 2],
}
/** 中性值（= 不产生任何视觉变化的那一组） */
export const DISPLAY_NEUTRAL = { brightness: 1, contrast: 1, saturation: 1, hue: 0 }
export const PLAYBACK_RATE_MIN = 0.5
export const PLAYBACK_RATE_MAX = 2
export const PLAYBACK_RATE_DEFAULT = 1
/** 显示状态里"可由 URL/API 设置"的键（顺序 = 文档与 UI 的顺序） */
export const DISPLAY_KEYS = ['flipH', 'colorOptions', 'brightness', 'contrast', 'saturation', 'hue']
/** 全默认状态（`--` 前缀的字段是**派生**字段，只读） */
export function defaultDisplayState() {
  return {
    legacy: false, flipH: false, colorOptions: true,
    brightness: 1, contrast: 1, saturation: 1, hue: 0,
    playbackRate: PLAYBACK_RATE_DEFAULT, present: [],
  }
}
/** 播放速度：非有限/空/非法 ⇒ 1；超范围 ⇒ 钳到 [0.5, 2]（不是"非法⇒1"，两者都测） */
export function parsePlaybackRate(raw) {
  if (raw === null || raw === undefined) return PLAYBACK_RATE_DEFAULT
  const s = String(raw).trim()
  if (s === '') return PLAYBACK_RATE_DEFAULT
  const n = Number(s)
  if (!Number.isFinite(n)) return PLAYBACK_RATE_DEFAULT
  return Math.min(PLAYBACK_RATE_MAX, Math.max(PLAYBACK_RATE_MIN, n))
}
/** 数值型显示项：非有限/空/非法 ⇒ 默认；超范围 ⇒ 钳位 */
export function clampDisplayNumber(key, raw) {
  const lim = DISPLAY_LIMITS[key]
  const dflt = DISPLAY_NEUTRAL[key]
  if (!lim || dflt === undefined) return undefined      // 未知键
  if (raw === null || raw === undefined) return dflt
  const s = String(raw).trim()
  if (s === '') return dflt
  const n = Number(s)
  if (!Number.isFinite(n)) return dflt
  return Math.min(lim[1], Math.max(lim[0], n))
}
/** 布尔开关：缺省 false；`0/off/no/false` = 关；其余（含空值 = 只写了名字） = 开 */
export function displayFlagOn(raw) {
  if (raw === null || raw === undefined) return false
  const s = String(raw).trim().toLowerCase()
  if (s === '' ) return true
  return !(s === '0' || s === 'off' || s === 'no' || s === 'false')
}
/**
 * `?display=legacy|off|0|no|false` = **总回退**：解析结果全中性（`legacy:true`）。
 * 语义：忽略下面全部显示开关（含 localStorage 里的持久化 UI 状态与 `__wp.setDisplay`）。
 */
export function displayLegacyFrom(search) {
  try {
    const q = new URLSearchParams(search == null ? '' : String(search))
    const v = String(q.get('display') || '').trim().toLowerCase()
    return v === 'legacy' || v === 'off' || v === '0' || v === 'no' || v === 'false'
  } catch (e) { return false }
}
/**
 * URL → 显示状态（纯函数，浏览器/Node 共用）。
 * `present` = 真正出现在 query 里的开关名（页面靠它决定"URL 覆盖 localStorage"的**逐键**粒度）。
 */
export function parseDisplayOptions(search) {
  const out = defaultDisplayState()
  let q = null
  try { q = new URLSearchParams(search == null ? '' : String(search)) } catch (e) { return out }
  const g = (k) => { try { return q.get(k) } catch (e) { return null } }
  if (displayLegacyFrom(search)) { out.legacy = true; out.present = ['display']; return out }
  if (g('display') !== null) out.present.push('display')
  const flag = (param, key) => {
    const v = g(param)
    if (v === null) return
    out.present.push(param)
    out[key] = displayFlagOn(v)
  }
  const num = (param, key) => {
    const v = g(param)
    if (v === null) return
    out.present.push(param)
    const n = clampDisplayNumber(key, v)
    if (n !== undefined) out[key] = n
  }
  flag('fliph', 'flipH')
  flag('coloropts', 'colorOptions')
  num('bright', 'brightness')
  num('contrast', 'contrast')
  num('satur', 'saturation')
  num('hue', 'hue')
  const r = g('rate')
  if (r !== null) { out.present.push('rate'); out.playbackRate = parsePlaybackRate(r) }
  return out
}
/** URL 开关名 → 显示状态键（页面做"逐键覆盖 localStorage"用） */
export const DISPLAY_URL_KEYS = {
  fliph: 'flipH', coloropts: 'colorOptions', bright: 'brightness', contrast: 'contrast',
  satur: 'saturation', hue: 'hue', rate: 'playbackRate',
}
/**
 * 打补丁（`__wp.setDisplay` 与"URL 覆盖持久化状态"共用）：只认已知键，逐键钳位；
 * 未出现在 patch 里的键**保持 base**（幂等的前提：同一个 patch 反复打结果不变）。
 */
export function applyDisplayPatch(base, patch) {
  const out = Object.assign(defaultDisplayState(), base || {})
  out.present = Array.isArray(base && base.present) ? base.present.slice() : []
  if (!patch || typeof patch !== 'object') return out
  for (const k of DISPLAY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, k) || patch[k] === undefined) continue
    if (k === 'flipH' || k === 'colorOptions') out[k] = !!patch[k]
    else out[k] = clampDisplayNumber(k, patch[k])
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'playbackRate') && patch.playbackRate !== undefined) {
    out.playbackRate = parsePlaybackRate(patch.playbackRate)
  }
  return out
}
/** 状态比较（幂等/去重用；只比可设置的键，不比 `present`） */
export function displayStateEquals(a, b) {
  if (!a || !b) return false
  if (a.legacy !== b.legacy) return false
  for (const k of DISPLAY_KEYS) if (a[k] !== b[k]) return false
  return a.playbackRate === b.playbackRate
}
/** 数值格式化：最多 3 位小数、去掉多余的 0（`1.10 → 1.1`、`0 → 0`） */
function fmtNum(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return String(Number(n.toFixed(3)))
}
/**
 * 颜色选项 → CSS filter 串（**唯一实现处**）。
 * 返回 `''` 的三种情形：`colorOptions === false`（总开关关）/ 四项全中性 / 状态缺失。
 * ⚠ 为什么全中性也返回 `''` 而不是 `brightness(1) contrast(1) saturate(1) hue-rotate(0deg)`：
 *   后者虽然视觉等价，但会让浏览器**凭空多一个合成层**，与"缺省零行为变化"的红线冲突。
 */
export function buildDisplayFilter(state) {
  if (!state || state.legacy) return ''
  if (state.colorOptions === false) return ''
  const b = clampDisplayNumber('brightness', state.brightness)
  const c = clampDisplayNumber('contrast', state.contrast)
  const s = clampDisplayNumber('saturation', state.saturation)
  const h = clampDisplayNumber('hue', state.hue)
  if (b === 1 && c === 1 && s === 1 && h === 0) return ''
  return 'brightness(' + fmtNum(b) + ') contrast(' + fmtNum(c) + ') saturate(' + fmtNum(s) + ') hue-rotate(' + fmtNum(h) + 'deg)'
}
/** 水平翻转 → CSS transform 串（关 ⇒ `''`） */
export function buildDisplayTransform(state) {
  if (!state || state.legacy) return ''
  return state.flipH ? 'scaleX(-1)' : ''
}
/**
 * 与**既有** filter 串合成（`?fx=` 白名单滤镜 / 宿主自己写的 filter）：
 * - 本次为空 ⇒ 逐字返回既有串（关掉显示选项 = 还原，不覆盖别人的写入）；
 * - 既有为空 ⇒ 返回本次串（最常见的缺省情形）；
 * - 两者都有 ⇒ `既有 本次`（CSS 从左到右依次作用 ⇒ 颜色项作用在既有滤镜的**输出**上）。
 */
export function composeFilterCss(prev, own) {
  const p = (prev == null ? '' : String(prev)).trim()
  const o = (own == null ? '' : String(own)).trim()
  if (!o) return p
  if (!p) return o
  return p + ' ' + o
}
/** 与既有 transform 串合成：镜像**在最外层**（先做既有变换、再整体镜像），关 ⇒ 逐字还原 */
export function composeTransformCss(prev, own) {
  const p = (prev == null ? '' : String(prev)).trim()
  const o = (own == null ? '' : String(own)).trim()
  if (!o) return p
  if (!p) return o
  return o + ' ' + p
}
/**
 * 把状态写进"拥有渲染输出的元素"（幂等：值没变就不写）。
 * `prev` = 该元素**原始**内联值快照 `{filter, transform}`（页面在注册画布时记一次），
 * 这样反复开关不会把上一次的颜色串套娃叠进去。
 */
export function applyDisplayOptions(el, state, prev) {
  const empty = { filter: '', transform: '', wrote: false }
  if (!el || !el.style) return empty
  const pf = prev && prev.filter != null ? prev.filter : (el.style.filter || '')
  const pt = prev && prev.transform != null ? prev.transform : (el.style.transform || '')
  const f = composeFilterCss(pf, buildDisplayFilter(state))
  const t = composeTransformCss(pt, buildDisplayTransform(state))
  let wrote = false
  if ((el.style.filter || '') !== f) { el.style.filter = f; wrote = true }
  if ((el.style.transform || '') !== t) { el.style.transform = t; wrote = true }
  return { filter: f, transform: t, wrote }
}
/**
 * 指针路径的翻转判据（优先级与 `resolveProjMode` 同形，唯一实现处）：
 *   `optsVal`（测试/宿主显式传，最高）→ `liveVal`（`window.__mpwDisplay.flipH`，页面实时写）→
 *   `fallbackVal`（`?fliph=1`，加载时读一次）。
 */
export function displayFlipH(optsVal, liveVal, fallbackVal) {
  if (typeof optsVal === 'boolean') return optsVal
  if (typeof liveVal === 'boolean') return liveVal
  if (liveVal && typeof liveVal === 'object' && typeof liveVal.flipH === 'boolean') return liveVal.flipH
  return !!fallbackVal
}
/**
 * 场景时钟（播放速度的唯一实现处）：把"墙上时间"换算成"场景时间"。
 * - **没被 `setRate` 碰过** ⇒ `at(now, legacyTime)` 原样返回 `legacyTime`
 *   （页面传的就是改动前的 `(now − last0) / 1000` ⇒ 缺省逐位不变）；
 * - 被碰过 ⇒ 以"切换那一刻的场景时间 + 墙上时间差 × rate"推进（切回 1 也不跳变）。
 * 幂等：`setRate(当前值)` 直接返回（**不**把时钟标成 touched ⇒ `?rate=1` 仍是逐位缺省）。
 */
export function createSceneClock(opts = {}) {
  let rate = PLAYBACK_RATE_DEFAULT
  let touched = false
  let anchorWall = null
  let anchorScene = 0
  const api = {
    get rate() { return rate },
    get touched() { return touched },
    setRate(r) {
      const v = parsePlaybackRate(r)
      if (v === rate) return rate
      rate = v
      touched = true
      anchorWall = null            // 下一帧用 legacyTime 重新锚定（不跳变）
      return rate
    },
    at(now, legacyTime) {
      const lt = Number(legacyTime)
      const base = Number.isFinite(lt) ? lt : 0
      if (!touched) return base
      const n = Number(now)
      if (!Number.isFinite(n)) return anchorWall === null ? base : anchorScene
      if (anchorWall === null) { anchorScene = base; anchorWall = n; return anchorScene }
      anchorScene += (n - anchorWall) / 1000 * rate
      anchorWall = n
      return anchorScene
    },
  }
  if (opts && opts.rate !== undefined) api.setRate(opts.rate)
  return api
}
/** 动画 dt 的倍率（`engine.frametime` 口径）：rate=1 ⇒ **逐位返回原值**（含 NaN 透传） */
export function scaleSceneDt(dt, rate) {
  const r = parsePlaybackRate(rate)
  return r === 1 ? dt : dt * r
}
/**
 * 把所有 `<video>` 的 `playbackRate` 同步到全局倍率（画面/音频一起变；不重挂载）。
 * `rate === 1 && !force` ⇒ **一个属性都不写**（缺省零行为变化）；`force` 用于"从非 1 倍切回 1"。
 * 返回被改动的元素数（诊断用）。
 */
export function syncVideoPlaybackRate(doc, rate, force) {
  const r = parsePlaybackRate(rate)
  if (r === PLAYBACK_RATE_DEFAULT && !force) return 0
  let n = 0
  try {
    const list = doc && typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('video') : null
    if (list) for (const v of list) { try { if (v && v.playbackRate !== r) { v.playbackRate = r; n++ } } catch (e) { /* 只读元素 */ } }
  } catch (e) { /* 无 DOM */ }
  return n
}
// ===== src/pkg/container.js =====
// scene.pkg 容器解析器
// 格式（实测 PKGV0012 ~ PKGV0023）：
//   [0]    uint32 LE  魔数字符串长度（实测恒为 8）
//   [4]    n 字节     魔数 "PKGVxxxx"（版本号）
//   [4+n]  uint32 LE  入口数量
//   随后 count 个入口：{ uint32 nameLen, name 字节, uint32 offset, uint32 size }
//   dataStart = 入口表结束位置；入口数据 = dataStart + offset，长度 size。
//   offset 为相对 dataStart 的偏移（首个入口 offset 恒为 0）。
export function parsePkg(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (buf.length < 16) throw new Error('文件太小，不是 scene.pkg')
  // ①(RE-25 官方容器族 2026-09-12) PKGV0024(scene.pkg) / PKGM0014(视频壁纸) / PKGM0018(场景束)
  //   与打包器的 "v1.0" 缩略图壳**布局完全相同**：`[u32 strlen][magic][u32 count]{nameLen,name,offset,size}`，
  //   offset 相对目录表末尾、无压缩。此前只接受 PKGV，导致 .mpkg 用户包全部无法渲染。
  const magicLen = dv.getUint32(0, true)
  if (magicLen < 1 || magicLen > 64) throw new Error('魔数长度异常: ' + magicLen)
  const magic = ascii(buf, 4, magicLen)
  const knownPkg = /^PKGV/i.test(magic) || /^PKGM/i.test(magic) || /^v\d/i.test(magic)
  if (!knownPkg) throw new Error('不是 PKG/PKGM 容器，魔数: ' + magic)
  const count = dv.getUint32(4 + magicLen, true)
  let p = 4 + magicLen + 4
  const entries = []
  for (let i = 0; i < count; i++) {
    if (p + 8 > buf.length) throw new Error('入口表越界 @' + i)
    const nameLen = dv.getUint32(p, true)
    p += 4
    if (p + nameLen + 8 > buf.length) throw new Error('入口 ' + i + ' 越界')
    const name = decodeName(buf, p, nameLen)
    p += nameLen
    const offset = dv.getUint32(p, true)
    p += 4
    const size = dv.getUint32(p, true)
    p += 4
    entries.push({ name, offset, size })
  }
  const dataStart = p
  return {
    magic,
    version: magic.slice(4),
    count,
    entries,
    dataStart,
    fileSize: buf.length,
    buf,
  }
}

// 取指定路径的入口数据（副本）
export function getEntry(pkg, name) {
  const e = pkg.entries.find((x) => x.name === name)
  if (e === undefined) return null
  const start = pkg.dataStart + e.offset
  const end = start + e.size
  if (start < 0 || end > pkg.fileSize) throw new Error('入口 ' + name + ' 越界')
  return pkg.buf.subarray(start, end).slice()
}

// 入口数据末尾应恰好贴住文件末尾（结构自检）
export function verifyLayout(pkg) {
  let end = 0
  for (const e of pkg.entries) end = Math.max(end, e.offset + e.size)
  return { dataEnd: pkg.dataStart + end, fileSize: pkg.fileSize, ok: pkg.dataStart + end <= pkg.fileSize }
}

function ascii(buf, start, len) {
  let s = ''
  for (let i = start; i < start + len; i++) s += String.fromCharCode(buf[i])
  return s
}

// 入口名：WE 以 UTF-8 存储（中文名场景实测）；非法 UTF-8 时回退 Latin-1 逐字节
function decodeName(buf, start, len) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(start, start + len))
  } catch (e) {
    return ascii(buf, start, len)
  }
}

// ===== src/pkg/texture.js =====
// Wallpaper Engine .tex 纹理容器解析与解码
// 格式依据：linux-wallpaperengine TextureParser / RePKG（实测 TEXV0005 + TEXI0001 + TEXB0001~0004）
export const TEXTURE_FORMATS = {
  0: 'ARGB8888',
  1: 'RGB888',
  2: 'RGB565',
  4: 'DXT5',
  // RE-40：格式 5 的载荷与格式 4 完全一致（DXT5/BC3），区别在容器声明的宽高是实际纹理的 2 倍
  // （编辑器对超大纹理的半分辨率存法）。实测 141/456 张用户包纹理会命中该格式。
  5: 'DXT5（半分辨率）',
  6: 'DXT3',
  7: 'DXT1',
  8: 'RG88',
  9: 'R8',
  10: 'RG1616f',
  11: 'R16f',
  12: 'BC7',
  13: 'RGBa1010102',
  14: 'RGBA16161616f',
  15: 'RGB161616f',
}

export const FIF = { UNKNOWN: -1, JPEG: 2, PNG: 13, GIF: 25, WEBP: 35, MP4: 35 }

/** ①(2026-09-22) 在头部**有界搜索** `TEXB000x\0` 魔数（不再假定固定偏移）。
 *  为什么要搜索：语料实测 231 张 .tex 里有 **30 张**（全部 `lut/`，`flags=0x42`）在 TEXI 头之后
 *  **多一个 u32** ⇒ TEXB 在偏移 **50** 而不是 46。旧实现按固定偏移读 ⇒ 这 30 张**必然抛错**
 *  （LUT 整条效果链拿不到贴图）。format/flags 的位置两种版式一致（18/22），所以只需要把"剩下几个
 *  字段"与魔数之间的距离变成**可搜索**的。有界（默认 40 字节）= 不误命中像素数据里的偶然字节序列。
 *  @returns {number} TEXB 魔数起始偏移；找不到返回 -1（调用方保持原有的报错口径）。 */
function findTexbMagic(buf, from, limit = 40) {
  const end = Math.min(buf.length - 9, from + limit)
  for (let i = Math.max(0, from); i <= end; i++) {
    if (buf[i] !== 0x54 || buf[i + 1] !== 0x45 || buf[i + 2] !== 0x58 || buf[i + 3] !== 0x42) continue  // TEXB
    if (buf[i + 4] !== 0x30 || buf[i + 5] !== 0x30 || buf[i + 6] !== 0x30) continue                  // 000
    if (buf[i + 7] < 0x31 || buf[i + 7] > 0x38) continue                                             // 1..8
    if (buf[i + 8] !== 0x00) continue                                                                // NUL
    return i
  }
  return -1
}
export function parseTex(buf) {
  let p = 0
  const magic1 = asciiTex(buf, p, 9)
  p += 9
  if (magic1 !== 'TEXV0005\0') throw new Error('不是 .tex 文件: ' + magic1)
  const magic2 = asciiTex(buf, p, 9)
  p += 9
  if (magic2 !== 'TEXI0001\0') throw new Error('未知 TEXI 子容器: ' + magic2)

  const format = u32(buf, p)
  p += 4
  const flags = u32(buf, p)
  p += 4
  const textureWidth = u32(buf, p)
  p += 4
  const textureHeight = u32(buf, p)
  p += 4
  const width = u32(buf, p)
  p += 4
  const height = u32(buf, p)
  p += 4
  p += 4 // ignored（实测 0xFF000000，编辑器用途）

  /* ①(2026-09-22) 容器魔数**搜索定位**（两种版式：TEXB 在 46 或 50）。找不到就保持原有报错文案。 */
  const texbAt = findTexbMagic(buf, p)
  if (texbAt < 0) throw new Error('未知 TEXB 容器: ' + asciiTex(buf, p, 9))
  p = texbAt
  const containerMagic = asciiTex(buf, p, 9)
  p += 9
  const imageCount = u32(buf, p)
  p += 4

  let freeImageFormat = FIF.UNKNOWN
  let containerVersion = 0
  if (containerMagic === 'TEXB0004\0') {
    freeImageFormat = u32(buf, p) | 0
    p += 4
    const isMp4 = u32(buf, p)
    p += 4
    if (freeImageFormat === FIF.UNKNOWN && isMp4 === 1) freeImageFormat = FIF.MP4
    // 非 MP4 时降级为 V3 布局（与 linux-wallpaperengine / RePKG 行为一致）
    containerVersion = freeImageFormat === FIF.MP4 ? 4 : 3
  } else if (containerMagic === 'TEXB0003\0') {
    freeImageFormat = u32(buf, p) | 0
    p += 4
    containerVersion = 3
  } else if (containerMagic === 'TEXB0002\0') {
    containerVersion = 2
  } else if (containerMagic === 'TEXB0001\0') {
    containerVersion = 1
  } else {
    throw new Error('未知 TEXB 容器: ' + containerMagic)
  }

  const isVideo = (flags & 32) !== 0 || freeImageFormat === FIF.MP4
  const images = []
  for (let i = 0; i < imageCount; i++) {
    const mipCount = u32(buf, p)
    p += 4
    const mips = []
    for (let m = 0; m < mipCount; m++) {
      if (containerVersion === 4) {
        p += 8 // param1/param2（编辑器参数）
        while (p < buf.length && buf[p] !== 0) p++
        p += 1 // conditionJson（null 结尾）
        p += 4 // param3
      }
      const mw = u32(buf, p)
      p += 4
      const mh = u32(buf, p)
      p += 4
      let compression = 0
      let uncompressedSize = 0
      if (containerVersion >= 2) {
        compression = u32(buf, p)
        p += 4
        uncompressedSize = i32(buf, p)
        p += 4
      }
      const compressedSize = i32(buf, p)
      p += 4
      if (isVideo) {
        // 视频纹理：byteCount 字段不可信，直接取剩余全部字节（mp4 载荷）
        mips.push({ width: mw, height: mh, compression: 0, data: buf.subarray(p) })
        p = buf.length
        continue
      }
      if (compression === 0) uncompressedSize = compressedSize
      const raw = buf.subarray(p, p + compressedSize)
      p += compressedSize
      let data = raw
      if (compression === 1) data = lz4Decompress(raw, uncompressedSize)
      mips.push({ width: mw, height: mh, compression, data })
    }
    images.push(mips)
  }

  // ①(RE-31) 精灵表（sprite sheet）帧表：TEXS0001~0003 位于**全部图像数据之后**（lwe parse:10-38 同序），
  //   仅当 flags bit2（0x4，lwe 名 IsGif / 官方名 isSprite）置位时存在。
  //   记录 32B：{frameNumber u32, frametime f32, x f32, y f32, xAxis[2], yAxis[2]}；
  //   TEXS0003 在帧数后额外两个 u32 = gifWidth/gifHeight（实测=截断后的帧像素尺寸）。
  let sprite = null
  if ((flags & 4) !== 0 && asciiTex(buf, p, 4) === 'TEXS') {
    const spriteMagic = asciiTex(buf, p, 9)
    p += 9
    const frameCount = u32(buf, p)
    p += 4
    let gifWidth = 0, gifHeight = 0
    if (spriteMagic === 'TEXS0003\0') {
      gifWidth = u32(buf, p)
      p += 4
      gifHeight = u32(buf, p)
      p += 4
    }
    const frames = []
    const isV1 = spriteMagic === 'TEXS0001\0'
    for (let i = 0; i < frameCount && p + 32 <= buf.length; i++) {
      const imageId = u32(buf, p)
      const frametime = f32(buf, p + 4)
      let x, y, xAxis, yAxis
      if (isV1) {
        // v1：x/y/轴为整数像素，中间两字段未使用
        x = u32(buf, p + 8)
        y = u32(buf, p + 12)
        xAxis = [u32(buf, p + 16), 0]
        yAxis = [0, u32(buf, p + 28)]
      } else {
        x = f32(buf, p + 8)
        y = f32(buf, p + 12)
        xAxis = [f32(buf, p + 16), f32(buf, p + 20)]
        yAxis = [f32(buf, p + 24), f32(buf, p + 28)]
      }
      frames.push({ imageId, frametime, x, y, xAxis, yAxis })
      p += 32
    }
    if (frames.length) sprite = { magic: spriteMagic, gifWidth, gifHeight, frames }
  }

  return {
    format,
    formatName: TEXTURE_FORMATS[format] || String(format),
    flags,
    textureWidth,
    textureHeight,
    width,
    height,
    freeImageFormat,
    containerMagic,
    containerVersion,
    isVideo,
    images,
    sprite,
  }
}

// ①(RE-31) 精灵表布局：帧宽高 UV 跨度取首帧轴长/纹理物理尺寸，rate = 帧高/帧宽（官方 g_RenderVar1）
export function spriteInfo(tex) {
  const sp = tex && tex.sprite
  if (!sp || !sp.frames || !sp.frames.length) return null
  const f0 = sp.frames[0]
  const fw = Math.hypot(f0.xAxis[0], f0.xAxis[1])
  const fh = Math.hypot(f0.yAxis[0], f0.yAxis[1])
  if (!(fw > 0) || !(fh > 0)) return null
  // NPOT 精灵表用物理（padded）分辨率归一，POT 用内容分辨率；两者一致时无差别
  const texW = tex.textureWidth || tex.width
  const texH = tex.textureHeight || tex.height
  if (!(texW > 0) || !(texH > 0)) return null
  const frameWidthUV = fw / texW
  const frameHeightUV = fh / texH
  const numFrames = sp.frames.length
  let duration = 0
  for (const f of sp.frames) duration += f.frametime
  return {
    numFrames,
    frameWidthUV,
    frameHeightUV,
    rate: fh / fw,
    cols: Math.max(1, Math.round(1 / frameWidthUV)),
    rows: Math.max(1, Math.round(1 / frameHeightUV)),
    frameWidthPx: fw,
    frameHeightPx: fh,
    frametime: f0.frametime,
    duration,
    imageIds: new Set(sp.frames.map((f) => f.imageId)).size,
    // ①(RE-31 多图精灵) imageId 不恒为 0 → 帧=换图（wer-ref CustomShaderPass.cpp:1296-1299
    //   ImageSlotsRef.active=imageId）。实测回归资产：夜莺包 合成1_00000.tex（151帧/7图）、
    //   背景合成1_00000.tex（53帧/3图），均为 TEXS0003 图集格式。
    multiImage: new Set(sp.frames.map((f) => f.imageId)).size > 1,
  }
}

// ①(RE-31 多图精灵) imageId 不恒为 0 → 帧=**换纹理**（第三方参考实现 wer-ref CustomShaderPass.cpp:1296-1299
//   ImageSlotsRef.active=imageId）。实测回归资产（TEXS0003 图集序列）：
//   夜莺·alone「合成1_00000.tex」= 151帧/7图（6×3752² + 1×752²，每图 5×5 帧网格）；
//   夜莺·firefly「背景合成1_00000.tex」= 53帧/3图。
//   绘制端按 cur 帧的 imageId 分组、各组绑定自己的纹理（atlas 方案会超 4096 GPU 上限与内存预算，弃用）。
// 解码全部被帧引用的 image（各槽独立）；整组解码内存超预算时按 2 的幂抽点降采样（保官方"半分辨率"观感）。
const SPRITE_SET_BUDGET = 96 * 1024 * 1024
export function spriteMultiImages(tex) {
  const sp = tex && tex.sprite
  if (!sp || !sp.frames || !sp.frames.length) return null
  const usedIds = [...new Set(sp.frames.map((f) => f.imageId))]
  if (usedIds.length <= 1 || usedIds.length > 16) return null
  const decs = []
  let need = 0
  for (const id of usedIds) {
    if (!tex.images[id]) return null
    let dec
    try { dec = decodeImageMip0(tex, id) } catch { return null }
    if (!dec || !dec.rgba) return null
    decs.push([id, dec])
    need += dec.rgba.length
  }
  let scale = 1
  while (need > SPRITE_SET_BUDGET && scale < 8) {
    scale *= 2
    need = 0
    for (const [, dec] of decs) need += Math.ceil(dec.width / scale) * Math.ceil(dec.height / scale) * 4
  }
  const imgs = []
  for (const [id, dec] of decs) {
    let rgba = dec.rgba
    let w = dec.width, h = dec.height
    if (scale > 1) {
      w = Math.max(1, Math.floor(w / scale)); h = Math.max(1, Math.floor(h / scale))
      const out = new Uint8Array(w * h * 4)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const si = ((y * scale) * dec.width + x * scale) * 4
        out.set(rgba.subarray(si, si + 4), (y * w + x) * 4)
      }
      rgba = out
    }
    imgs.push({ id, w, h, rgba })
  }
  return { scale, imgs }
}

// 帧 → 其所属 image 内的 UV 矩形（第三方参考实现 wer-ref WPTexHeaderParser.cpp:292-315：按 slotDimensions[imageId] 归一）。
// 返回 {cur, nxt, blend}；cur/nxt 跨 image 时 blend=0（官方帧混合只在同纹理内进行）。
export function spriteFrameImageRects(tex, frameValue, noBlend) {
  const sp = tex && tex.sprite
  if (!sp || !sp.frames || !sp.frames.length) return null
  if (frameValue < 0) frameValue = 0
  const life = frameValue - Math.floor(frameValue)
  const n = sp.frames.length
  const cur = Math.floor(life * n)
  const nxt = Math.min(n - 1, cur + 1)
  const rectFor = (fi) => {
    const f = sp.frames[fi]
    const img = tex.images[f.imageId]
    if (!img || !img.length) return null
    const iw = img[0].width, ih = img[0].height
    if (!(iw > 0) || !(ih > 0)) return null
    const fw = Math.hypot(f.xAxis[0], f.xAxis[1])
    const fh = Math.hypot(f.yAxis[0], f.yAxis[1])
    if (!(fw > 0) || !(fh > 0)) return null
    // 非轴对齐帧（旋转帧）不支持 → 整图兜底
    const ax = Math.abs(f.xAxis[1]) > 0.5 || Math.abs(f.yAxis[0]) > 0.5
    const w = ax ? iw : fw, h = ax ? ih : fh
    const x = ax ? 0 : f.x, y = ax ? 0 : f.y
    return {
      imageId: f.imageId,
      u0: x / iw, v0: y / ih,
      u1: (x + w) / iw, v1: (y + h) / ih,
      ratio: h / w,
    }
  }
  const cur0 = rectFor(cur)
  if (!cur0) return null
  const nxt0 = rectFor(nxt) || cur0
  let blend = (life * n) - Math.floor(life * n)
  if (noBlend || cur0.imageId !== nxt0.imageId) blend = 0
  return { cur: cur0, nxt: nxt0, blend }
}

// ①(RE-31) 官方 ComputeSpriteFrame（common_particles.h:59-84，unpadded=1 分支）
//   输入 lifeScalar（CPU 侧帧值，已含 sequence/random 语义），输出两组 UV 偏移与混合系数
// ①(P-133 #1) **新增 `su`/`sv` = 单帧的 UV 尺寸** —— 官方同一个函数用 `out vec2 uvFrameSize`
//   把它一起吐出来（`common_particles.h:81` `uvFrameSize = vec2(frameWidth, frameHeight)`），
//   消费方必须 `uv * uvFrameSize + offset` 才落在**一帧**里。
//   我们此前把返回的 u0/v0/u1/v1（**帧原点**）当成"加到 [0,1] 上的偏移"用 ⇒ 每颗粒子采样的
//   u 跨度恒为 **1.0**（= 整张图集宽度）而不是 `frameWidthUV`（如落花 13 帧 = 1/13）。
//   判据/影响面见 docs/PATCHES.md P-133。`u0/v0/u1/v1` 语义**不变**（仍是 cur/nxt 两帧的原点），
//   既有调用方（sprite-sheet-test / multi-sprite-test）逐位不变。
export function computeSpriteFrameUV(sprite, frameValue, noBlend) {
  if (!sprite) return null
  if (frameValue < 0) frameValue = 0
  const life = frameValue - Math.floor(frameValue)   // frac（多重 SEQUENCE 循环在此折返）
  const n = sprite.numFrames
  const cur = Math.floor(life * n)
  const nxt = Math.min(n - 1, cur + 1)
  const fw = sprite.frameWidthUV, fh = sprite.frameHeightUV
  const aU = (cur * fw) - Math.floor(cur * fw)
  const aV = Math.floor(cur * fw) * fh
  const bU = (nxt * fw) - Math.floor(nxt * fw)
  const bV = Math.floor(nxt * fw) * fh
  let blend = (life * n) - Math.floor(life * n)
  if (noBlend) blend = 0
  // `su`/`sv` 缺省 1 = "整张图 = 一帧"（手搓 sprite 对象 / 旧调用方 ⇒ 逐位等于改动前）
  const su = (typeof fw === 'number' && isFinite(fw) && fw > 0) ? fw : 1
  const sv = (typeof fh === 'number' && isFinite(fh) && fh > 0) ? fh : 1
  return { u0: aU, v0: aV, u1: bU, v1: bV, su, sv, blend }
}

// ①(P-133 #1) 帧 UV 映射函数：把 quad 的 [0,1]² uv 映射到 **cur/nxt 两帧各自的矩形**。
//   两种输入形态（都由本文件产出，不再有第二份实现）：
//     · 单图精灵 `computeSpriteFrameUV` → `{u0,v0,su,sv}`（帧**原点 + 尺寸**）；
//     · 多图精灵 `spriteFrameImageRects` → `{u0,v0,u1,v1}`（帧在该图内的**绝对矩形**）。
//   两者都归约成矩形后用同一个线性插值（= 官方 `v_TexCoord = a_uv · uvFrameSize + uvs.xy`，
//   `common_particles.h:59-84` + `genericparticle.vert:78-84`）。
//   ⚠ 缺 `su` 也缺 `u1` 的手搓对象 ⇒ 退化成"整张图 = 一帧"（与改动前的最终像素一致，不静默错位）。
export function frameRectUVFn(cur, nxt, blend) {
  const rect = (f) => {
    const u0 = (f && typeof f.u0 === 'number') ? f.u0 : 0
    const v0 = (f && typeof f.v0 === 'number') ? f.v0 : 0
    if (f && typeof f.su === 'number' && typeof f.sv === 'number') return [u0, v0, u0 + f.su, v0 + f.sv]
    if (f && typeof f.u1 === 'number' && typeof f.v1 === 'number') return [u0, v0, f.u1, f.v1]
    return [u0, v0, u0 + 1, v0 + 1]
  }
  const a = rect(cur), b = rect(nxt)
  const b0 = blend || 0
  return (u, v) => [
    a[0] + u * (a[2] - a[0]), a[1] + v * (a[3] - a[1]),
    b[0] + u * (b[2] - b[0]), b[1] + v * (b[3] - b[1]), b0,
  ]
}

// ①(W4 P-36) 图片层精灵帧：第 frame 帧的 UV 矩形（TEXS 帧表 row-major，先横后竖换行，
//   与 computeSpriteFrameUV 的 aU/aV 同一换算；图片层合成用单帧矩形，不需要帧间混合）。
export function spriteFrameRectUV(sprite, frame) {
  if (!sprite || !(sprite.numFrames > 0) || !(sprite.frameWidthUV > 0) || !(sprite.frameHeightUV > 0)) return null
  const n = sprite.numFrames
  const f = ((Math.floor(frame) % n) + n) % n
  const fw = sprite.frameWidthUV, fh = sprite.frameHeightUV
  const u = (f * fw) - Math.floor(f * fw)
  const v = Math.floor(f * fw) * fh
  return { u0: u, v0: v, u1: u + fw, v1: v + fh }
}

// RE-40：格式 5（DXT5 半分辨率）的真实尺寸判定。
// 容器 TEXI 声明的宽高是实际纹理的 2 倍，真实尺寸由 mip 头给出；
// 但若 mip 载荷够大（≥ 声明尺寸的 BC3 体积），说明确实是全分辨率数据，按声明尺寸解码。
function bc3Bytes(w, h) {
  return Math.ceil(w / 4) * Math.ceil(h / 4) * 16
}

function isHalfResDxt5(tex) {
  return tex.format === 5
}

function texPayloadDims(tex, m, isMip0) {
  if (!isHalfResDxt5(tex)) return { width: m.width, height: m.height }
  if (isMip0 && m.data.length >= bc3Bytes(tex.width, tex.height)) return { width: tex.width, height: tex.height }
  return { width: m.width, height: m.height }
}

// mip0 → { width, height, rgba } 或 { width, height, png } / { ..., image, fif } / { ..., video }
export function decodeMip0(tex) {
  return decodeImageMip0(tex, 0)
}

// ①(P-163 2026-09-19 8K 贴图黑屏) **按目标边长选 mip 级**（free-image 与原始像素格式都适用）。
//
// 为什么必须有：`decodeMip0` 恒取 image[0]，而 WE 的 .tex **自己就带完整 mip 链**——语料实测
// `3669681034/materials/4k-16-9origin_waifu2x_2x_jpg.tex` 是 5 级独立 PNG：
//   7680×4320(31.7MB) / 3840×2160(8.7MB) / 1920×1080(2.4MB) / 960×540 / 480×270。
// 上传端的目标尺寸却是 `texDownsampleCap()` 给的 min(2048, 设备上限) ⇒ 先解码 7680×4320
// （浏览器里 = 132.7MB RGBA 位图），再丢掉 15/16 的像素缩到 2048×1152（9.4MB）。这条"解全尺寸
// 再降采样"的链在手机上正是 P-36 记录过的"大位图上传失败 ⇒ 整层采样为黑（整屏黑）"的入口，
// 首帧多花的时间也挤在宿主首帧看门狗（插件侧 `first-frame-timeout-fallback` 的 `secs:8`）以内。
//
// 语义（= 缩放时的标准 LOD 选择）：取**长边 ≥ target 的最小一级**——它比 target 大不了多少，
// 因此降采样后的画质**不劣于**"从 mip0 缩"，解码/内存却按级数下降（8K→4K 是 4×）。
// 没有满足的级（target 比最小一级还小）→ 用最小一级（继续往下缩，画质最优）；
// **target 比 mip0 还大**（不需要切级）→ 0；target 无效/≤0 → 0（= mip0，与改动前逐位一致，
// 便于 A/B 与旧调用点零行为变化）。
export function pickMipForTarget(tex, targetMaxSide) {
  try {
    const image = tex && tex.images && tex.images[0]
    const lvls = image && image.length
    if (!lvls || lvls < 2) return 0
    const target = Number(targetMaxSide)
    if (!Number.isFinite(target) || target <= 0) return 0
    let best = 0                       // 兜底 = mip0（没有任何一级"≥ target"时 = 本来就不该切）
    for (let i = 0; i < lvls; i++) {
      const m = image[i]
      const side = Math.max(Number(m.width) || 0, Number(m.height) || 0)
      if (side >= target) best = i     // 从大到小扫，最后一个"≥ target"的就是"≥target 的最小一级"
      else break
    }
    return best
  } catch (e) { return 0 }
}

// ①(P-163) `decodeImageMip0(tex, idx)` 的**指定 mip 级**版本：逐字段同语义，只是取 `image[mipLevel]`。
//   越界/非法级 → 回落 mip0（绝不抛"级不存在"，调用方按"要哪级给哪级、给不了给 0 级"用）。
export function decodeImageMip(tex, idx = 0, mipLevel = 0) {
  const image = tex && tex.images && tex.images[idx]
  const lv = (image && Number.isInteger(mipLevel) && mipLevel > 0 && mipLevel < image.length) ? mipLevel : 0
  return decodeImageMip0(tex, idx, lv)
}

// ①(RE-31 多图精灵) TEXB count>1 时按 imageId 解码任意槽位；idx>0 的 mip0 尺寸即该槽真实尺寸
//   （全局 width/height 只描述槽 0，跨槽不裁剪——夜莺包 实测 7 槽各自整尺寸）
// ①(P-163) 追加第 3 参 mipLevel（缺省 0 = 逐位等于改动前）：free-image 格式（PNG/JPEG/video）的
//   每一级在容器里都是**独立完整文件**，取哪级就解哪级；原始像素格式每级是同一格式的更小一层，
//   `texPayloadDims` 的"声明尺寸"与裁剪只对**槽 0 的 0 级**成立（更高层的 m 宽高即真值）。
export function decodeImageMip0(tex, idx = 0, mipLevel = 0) {
  const image = tex.images[idx]
  if (!image || image.length === 0) throw new Error('无图像数据(image ' + idx + ')')
  const lv = (Number.isInteger(mipLevel) && mipLevel > 0 && mipLevel < image.length) ? mipLevel : 0
  const m = image[lv]
  // ①(P-65) 把 .tex format 带在解码结果上：上传链路（makeTextureMip）据此给 GL 纹理对象盖
  //   `__mpwTexFmt`，粒子 FS 的 ConvertTexture0Format 才有 TEX0FORMAT 可用。盒子只加字段，
  //   所有既有消费方（demo.html loadTex / preview.mjs）读的还是 width/height/rgba，零行为变化。
  const F = { fmt: tex.format }
  if (tex.isVideo) return Object.assign({ width: m.width, height: m.height, video: m.data }, F)
  if (tex.freeImageFormat === FIF.PNG) return Object.assign({ width: m.width, height: m.height, png: m.data }, F)
  if (tex.freeImageFormat !== FIF.UNKNOWN) {
    return Object.assign({ width: m.width, height: m.height, image: m.data, fif: tex.freeImageFormat }, F)
  }
  const dims = texPayloadDims(tex, m, idx === 0 && lv === 0)
  const rgba = decodePixels(tex.format, m.data, dims.width, dims.height)
  // 格式 5 的 mip 尺寸就是真实尺寸，不需要裁剪（声明尺寸是 2 倍，裁剪会得到空白图）
  if (isHalfResDxt5(tex)) return Object.assign({ width: dims.width, height: dims.height, rgba }, F)
  // mip0 尺寸可能是对齐填充值，裁剪到声明尺寸（仅槽 0 的 0 级有声明值，与 RePKG 行为一致；
  // ①P-163：更高层级的 m 宽高就是该层真值，拿 tex.width 去裁会把 4K 层裁成 8K 画布左上角）
  if (idx === 0 && lv === 0 && (m.width !== tex.width || m.height !== tex.height)) {
    return Object.assign({ width: tex.width, height: tex.height, rgba: cropRgba(rgba, m.width, m.height, tex.width, tex.height) }, F)
  }
  return Object.assign({ width: m.width, height: m.height, rgba }, F)
}

// 解码全部 mip 级别 → [{ width, height, rgba }]（PNG/JPEG 等 freeImage 格式只有一级）
export function decodeMips(tex) {
  const image = tex.images[0]
  if (!image || image.length === 0) throw new Error('无图像数据')
  const halfRes = isHalfResDxt5(tex)
  const out = []
  for (let i = 0; i < image.length; i++) {
    const m = image[i]
    if (tex.freeImageFormat !== FIF.UNKNOWN) {
      out.push({ width: m.width, height: m.height, image: m.data, fif: tex.freeImageFormat, fmt: tex.format })
      continue
    }
    const dims = texPayloadDims(tex, m, i === 0)
    const rgba = decodePixels(tex.format, m.data, dims.width, dims.height)
    out.push({ width: dims.width, height: dims.height, rgba, fmt: tex.format })
  }
  // 第 0 级可能带对齐填充，裁剪到声明尺寸
  if (!halfRes && out.length > 0 && (out[0].width !== tex.width || out[0].height !== tex.height) && out[0].rgba) {
    out[0] = { width: tex.width, height: tex.height, rgba: cropRgba(out[0].rgba, out[0].width, out[0].height, tex.width, tex.height), fmt: out[0].fmt }
  }
  return out
}

function cropRgba(rgba, sw, sh, w, h) {
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    out.set(rgba.subarray(y * sw * 4, y * sw * 4 + w * 4), y * w * 4)
  }
  return out
}

export function decodePixels(format, data, w, h) {
  switch (format) {
    case 0: return fromARGB8888(data, w, h)
    case 1: return fromRGB888(data, w, h)
    case 2: return fromRGB565(data, w, h)
    case 4: return decodeDXT5(data, w, h)
    // RE-40：格式 5 = DXT5，载荷同格式 4，仅容器声明宽高为实际尺寸 2 倍
    case 5: return decodeDXT5(data, w, h)
    case 6: return decodeDXT3(data, w, h)
    case 7: return decodeDXT1(data, w, h)
    case 8: return fromRG88(data, w, h)
    case 9: return fromR8(data, w, h)
    case 12: throw new Error('BC7 解码暂未实现（format=12）')
    default: throw new Error('未支持的纹理格式: ' + (TEXTURE_FORMATS[format] || format))
  }
}

function fromARGB8888(d, w, h) {
  // WE 的 "ARGB8888" 实际存储为 RGBA 字节序（与 RePKG/ImageSharp Rgba32 一致）
  return new Uint8Array(d.buffer, d.byteOffset, w * h * 4).slice()
}

function fromRGB888(d, w, h) {
  const out = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = d[i * 3]
    out[i * 4 + 1] = d[i * 3 + 1]
    out[i * 4 + 2] = d[i * 3 + 2]
    out[i * 4 + 3] = 255
  }
  return out
}

function fromRGB565(d, w, h) {
  const out = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const c = d[i * 2] | (d[i * 2 + 1] << 8)
    const r = (c >> 11) & 0x1f
    const g = (c >> 5) & 0x3f
    const b = c & 0x1f
    out[i * 4] = (r << 3) | (r >> 2)
    out[i * 4 + 1] = (g << 2) | (g >> 4)
    out[i * 4 + 2] = (b << 3) | (b >> 2)
    out[i * 4 + 3] = 255
  }
  return out
}

function fromRG88(d, w, h) {
  // RG88 → 灰度+alpha（与 RePKG/ImageSharp 一致：灰度=第二通道 G，alpha=第一通道 R）
  const out = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = d[i * 2 + 1]
    out[i * 4 + 1] = d[i * 2 + 1]
    out[i * 4 + 2] = d[i * 2 + 1]
    out[i * 4 + 3] = d[i * 2]
  }
  return out
}

function fromR8(d, w, h) {
  const out = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = d[i]
    out[i * 4 + 1] = d[i]
    out[i * 4 + 2] = d[i]
    out[i * 4 + 3] = 255
  }
  return out
}

// ---- BC1/BC2/BC3（逐行对齐 RePKG 的 LibSquish 移植实现，保证像素级一致） ----

function decodeDXT1(d, w, h) {
  return decodeDxtCommon(d, w, h, true, 0)
}

function decodeDXT3(d, w, h) {
  return decodeDxtCommon(d, w, h, false, 3)
}

function decodeDXT5(d, w, h) {
  return decodeDxtCommon(d, w, h, false, 5)
}

function decodeDxtCommon(d, w, h, isDxt1, alphaMode) {
  const rgba = new Uint8Array(w * h * 4)
  const bytesPerBlock = isDxt1 ? 8 : 16
  const block = new Uint8Array(16)
  let src = 0
  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      if (src + bytesPerBlock > d.length) return rgba
      block.set(d.subarray(src, src + bytesPerBlock))
      src += bytesPerBlock
      const colors = colorCodes(block, isDxt1)
      const indices = colorIndices(block, isDxt1)
      const alphas = alphaMode === 3 ? dxt3Alphas(block) : alphaMode === 5 ? dxt5Alphas(block) : null
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const sx = x + px
          const sy = y + py
          if (sx >= w || sy >= h) continue
          const i = py * 4 + px
          const o = (sy * w + sx) * 4
          rgba[o] = colors[indices[i] * 4]
          rgba[o + 1] = colors[indices[i] * 4 + 1]
          rgba[o + 2] = colors[indices[i] * 4 + 2]
          rgba[o + 3] = alphas !== null ? alphas[i] : colors[indices[i] * 4 + 3]
        }
      }
    }
  }
  return rgba
}

function unpack565(block, off) {
  const value = block[off] | (block[off + 1] << 8)
  const red = (value >> 11) & 0x1f
  const green = (value >> 5) & 0x3f
  const blue = value & 0x1f
  return [
    value,
    (red << 3) | (red >> 2),
    (green << 2) | (green >> 4),
    (blue << 3) | (blue >> 2),
  ]
}

function colorCodes(block, isDxt1) {
  const colorOff = isDxt1 ? 0 : 8
  const a = unpack565(block, colorOff)
  const b = unpack565(block, colorOff + 2)
  const codes = new Uint8Array(16)
  codes[0] = a[1]
  codes[1] = a[2]
  codes[2] = a[3]
  codes[3] = 255
  codes[4] = b[1]
  codes[5] = b[2]
  codes[6] = b[3]
  codes[7] = 255
  if (isDxt1 && a[0] <= b[0]) {
    codes[8] = (a[1] + b[1]) >> 1
    codes[9] = (a[2] + b[2]) >> 1
    codes[10] = (a[3] + b[3]) >> 1
    codes[11] = 255
    codes[12] = 0
    codes[13] = 0
    codes[14] = 0
    codes[15] = 0
  } else {
    codes[8] = Math.floor((2 * a[1] + b[1]) / 3)
    codes[9] = Math.floor((2 * a[2] + b[2]) / 3)
    codes[10] = Math.floor((2 * a[3] + b[3]) / 3)
    codes[11] = 255
    codes[12] = Math.floor((a[1] + 2 * b[1]) / 3)
    codes[13] = Math.floor((a[2] + 2 * b[2]) / 3)
    codes[14] = Math.floor((a[3] + 2 * b[3]) / 3)
    codes[15] = 255
  }
  return codes
}

function colorIndices(block, isDxt1) {
  // DXT3/5 颜色块从偏移 8 开始，索引字节在 12-15；DXT1 在 4-7
  const base = isDxt1 ? 4 : 12
  const indices = new Uint8Array(16)
  for (let i = 0; i < 4; i++) {
    const packed = block[base + i]
    indices[i * 4] = packed & 0x3
    indices[i * 4 + 1] = (packed >> 2) & 0x3
    indices[i * 4 + 2] = (packed >> 4) & 0x3
    indices[i * 4 + 3] = (packed >> 6) & 0x3
  }
  return indices
}

function dxt3Alphas(block) {
  const alphas = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    const quant = block[i]
    const lo = quant & 0x0f
    const hi = quant & 0xf0
    alphas[2 * i] = lo | (lo << 4)
    alphas[2 * i + 1] = hi | (hi >> 4)
  }
  return alphas
}

function dxt5Alphas(block) {
  const a0 = block[0]
  const a1 = block[1]
  const codes = new Uint8Array(8)
  codes[0] = a0
  codes[1] = a1
  if (a0 <= a1) {
    for (let i = 1; i < 5; i++) codes[1 + i] = Math.floor(((5 - i) * a0 + i * a1) / 5)
    codes[6] = 0
    codes[7] = 255
  } else {
    for (let i = 1; i < 7; i++) codes[i + 1] = Math.floor(((7 - i) * a0 + i * a1) / 7)
  }
  const indices = new Uint8Array(16)
  let p = 0
  for (let g = 0; g < 2; g++) {
    let value = 0
    for (let j = 0; j < 3; j++) value |= block[2 + g * 3 + j] << (8 * j)
    for (let j = 0; j < 8; j++) indices[p++] = (value >> (3 * j)) & 7
  }
  const alphas = new Uint8Array(16)
  for (let i = 0; i < 16; i++) alphas[i] = codes[indices[i]]
  return alphas
}

// ---- LZ4 块格式解压（对应 LZ4_decompress_safe） ----

export function lz4Decompress(src, outSize) {
  const out = new Uint8Array(outSize)
  let ip = 0
  let op = 0
  while (ip < src.length) {
    const token = src[ip++]
    let litLen = token >> 4
    if (litLen === 15) {
      let b
      do {
        b = src[ip++]
        litLen += b
      } while (b === 255)
    }
    for (let i = 0; i < litLen; i++) out[op++] = src[ip++]
    if (ip >= src.length) break
    const offset = src[ip] | (src[ip + 1] << 8)
    ip += 2
    let matchLen = 4 + (token & 15)
    if ((token & 15) === 15) {
      let b
      do {
        b = src[ip++]
        matchLen += b
      } while (b === 255)
    }
    const start = op - offset
    for (let i = 0; i < matchLen; i++) out[op++] = out[start + i]
  }
  return out
}

function u32(buf, p) {
  return (buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24)) >>> 0
}

function i32(buf, p) {
  return u32(buf, p) | 0
}

// ①(RE-31) TEXS 帧表里的浮点字段（frametime / 帧轴）
function f32(buf, p) {
  return new DataView(buf.buffer, buf.byteOffset + p, 4).getFloat32(0, true)
}

function asciiTex(buf, start, len) {
  let s = ''
  for (let i = start; i < start + len; i++) s += String.fromCharCode(buf[i])
  return s
}

// ===== src/scene/parse.js =====
// 场景对象模型：scene.json + project.json → 归一化图层列表

// 从属性对象提取动画轨道（WE: {"animation":{"c0":[{frame,value},...]}, "value":...}）：
// 返回 {t: 秒, v: 值}[] 升序；frame 按 WE 30fps 折算。无效返回 null
export function extractAnimKf(propObj, fps = 30) {
  if (!propObj || typeof propObj !== 'object' || !propObj.animation) return null
  const out = []
  for (const ch of ['c0', 'c1', 'c2', 'c3']) {
    const kfs = propObj.animation[ch]
    if (!Array.isArray(kfs) || !kfs.length) continue
    for (const kf of kfs) {
      const v = kf.value
      if (v === undefined || v === null) continue
      const num = typeof v === 'number' ? v : parseFloat(v)
      if (!Number.isFinite(num)) continue
      out.push({ t: (kf.frame || 0) / fps, v: num, ch })
    }
  }
  if (!out.length) return null
  // 按通道重组：ch -> [{t,v}]
  const byCh = new Map()
  for (const k of out) {
    if (!byCh.has(k.ch)) byCh.set(k.ch, [])
    byCh.get(k.ch).push({ t: k.t, v: k.v })
  }
  for (const arr of byCh.values()) arr.sort((a, b) => a.t - b.t)
  return byCh
}

// 给定通道列表，t 时刻值（线性插值 + 循环）
export function animValueAt(ch, t) {
  if (!ch || !ch.length) return null
  const dur = ch[ch.length - 1].t || 1
  let tt = t % dur
  if (tt < 0) tt += dur
  for (let i = 0; i < ch.length - 1; i++) {
    const a = ch[i], b = ch[i + 1]
    if (tt >= a.t && tt <= b.t) {
      const k = b.t === a.t ? 0 : (tt - a.t) / (b.t - a.t)
      return a.v + (b.v - a.v) * k
    }
  }
  return ch[ch.length - 1].v
}

// ①(MERGED-1 D 相机节点 2026-09-12) 属性动画求值（elysia core.js _resolveAnimations/_animValueAt 逐式移植）
// 与 extractAnimKf/animValueAt 的差异：读 **options.fps/length/mode**（语料相机动画 fps=18、mode=single，
// 硬编码 30+恒循环会把入场运镜播成 1.67 倍速且首尾循环）；关键帧带 back/front 贝塞尔切线时按官方
// Tween 语义解 x(u)=frame（牛顿迭代），无切线回退线性。返回 [x,y,z]（单通道 → [v,0,0]）或 null。
export function evalPropAnimation(propObj, t) {
  if (!propObj || typeof propObj !== 'object' || !propObj.animation) return null
  const a = propObj.animation
  const opts = a.options || {}
  const fps = opts.fps || 30
  const length = opts.length || 0
  const mode = opts.mode || 'single'
  let frame = t * fps
  if (length > 0) {
    if (mode === 'loop') frame = frame % length
    else if (mode === 'reverse') {
      const m = frame % (length * 2)
      frame = m <= length ? m : length * 2 - m
    }
  }
  const evalChannel = (ch) => {
    const frames = (a[ch] || []).filter((f) => f && typeof f.frame === 'number' && f.value != null)
    if (!frames.length) return null
    frames.sort((x, y) => x.frame - y.frame)
    const last = frames[frames.length - 1]
    let value
    if (frame <= frames[0].frame) value = frames[0].value
    else if (frame >= last.frame) value = last.value
    else {
      for (let i = 0; i < frames.length - 1; i++) {
        const a0 = frames[i], a1 = frames[i + 1]
        if (frame >= a0.frame && frame <= a1.frame) {
          value = bezierValueAt(a0, a1, frame)
          break
        }
      }
      if (value === undefined) value = last.value
    }
    return value
  }
  const hasMulti = ['c1', 'c2'].some((ch) => a[ch] && a[ch].length) ||
    (a.c0 && a.c0.length && typeof a.c0[0].value === 'string' && String(a.c0[0].value).trim().split(/\s+/).length > 1)
  let value
  if (hasMulti) {
    const parts = []
    for (const ch of ['c0', 'c1', 'c2']) {
      const cv = evalChannel(ch)
      parts.push(cv != null ? cv : 0)
    }
    value = parts.join(' ')
  } else {
    value = evalChannel('c0')
    if (value === undefined || value === null) return null
  }
  // relative: 基准值 + 动画偏移（逐分量）
  if (a.relative === true && propObj.value != null) {
    const base = propObj.value
    const valStr = typeof value === 'number' ? String(value) : value
    const pb = typeof base === 'string' ? base.trim().split(/\s+/).map(Number) : [base]
    const pv = typeof valStr === 'string' ? valStr.trim().split(/\s+/).map(Number) : [valStr]
    const out = pv.map((x, i) => x + (pb[i] ?? 0))
    value = out.join(' ')
  }
  const p = String(value).trim().split(/\s+/).map(Number)
  return [Number.isFinite(p[0]) ? p[0] : 0, Number.isFinite(p[1]) ? p[1] : 0, Number.isFinite(p[2]) ? p[2] : 0]
}

// 关键帧贝塞尔插值（elysia _animValueAt 逐式）：a0(f0,v0)→a1(f1,v1)，切线 {back,front} 为相对偏移；
// P0=(f0,v0) P1=(f0+front.x, v0+front.y) P2=(f1+back.x, v1+back.y) P3=(f1,v1)；牛顿迭代解 x(u)=frame。
function bezierValueAt(a0, a1, frame) {
  const f0 = a0.frame, f1 = a1.frame
  const v0 = Number(a0.value), v1 = Number(a1.value)
  if (!isFinite(v0) || !isFinite(v1) || f1 <= f0) {
    const k = (frame - f0) / (f1 - f0 || 1)
    return v0 + (v1 - v0) * k
  }
  const ft = a0.front, bt = a1.back
  const hasTangent = (ft && ft.enabled && (ft.x != null || ft.y != null)) || (bt && bt.enabled && (bt.x != null || bt.y != null))
  if (!hasTangent) return v0 + (v1 - v0) * ((frame - f0) / (f1 - f0))
  const p1x = ft && ft.enabled && ft.x != null ? f0 + ft.x : f0
  const p1y = ft && ft.enabled && ft.y != null ? v0 + ft.y : v0
  const p2x = bt && bt.enabled && bt.x != null ? f1 + bt.x : f1
  const p2y = bt && bt.enabled && bt.y != null ? v1 + bt.y : v1
  const bx = (u) => { const om = 1 - u; return om * om * om * f0 + 3 * om * om * u * p1x + 3 * om * u * u * p2x + u * u * u * f1 }
  const dx = (u) => { const om = 1 - u; return 3 * om * om * (p1x - f0) + 6 * om * u * (p2x - p1x) + 3 * u * u * (f1 - p2x) }
  const by = (u) => { const om = 1 - u; return om * om * om * v0 + 3 * om * om * u * p1y + 3 * om * u * u * p2y + u * u * u * v1 }
  let u = (frame - f0) / (f1 - f0)
  let ok = true
  for (let i = 0; i < 10; i++) {
    const x = bx(u) - frame
    const d = dx(u)
    if (Math.abs(d) < 1e-9) break
    const nu = u - x / d
    if (nu < -0.5 || nu > 1.5) { ok = false; break }
    u = nu
    if (Math.abs(x) < 1e-6) break
  }
  if (!ok || u < 0 || u > 1) u = (frame - f0) / (f1 - f0)
  return by(Math.max(0, Math.min(1, u)))
}

export function parseVec3(s) {
  // 脚本/动画驱动的属性是对象（origin 可能是 {animation:...}/{script:...}）：取 value / 动画首帧 / 回退 0
  let str = s
  if (typeof s === 'object' && s !== null) {
    if (s.value !== undefined) str = s.value
    else if (s.animation && Array.isArray(s.animation.c0) && s.animation.c0[0] && s.animation.c0[0].value !== undefined) str = s.animation.c0[0].value
    else str = '0 0 0'
  }
  const p = String(str).trim().split(/\s+/).map(Number)
  return [Number.isFinite(p[0]) ? p[0] : 0, Number.isFinite(p[1]) ? p[1] : 0, Number.isFinite(p[2]) ? p[2] : 0]
}

export function parseVec2(s) {
  let str = s
  if (typeof s === 'object' && s !== null) {
    if (s.value !== undefined) str = s.value
    else if (s.animation && Array.isArray(s.animation.c0) && s.animation.c0[0] && s.animation.c0[0].value !== undefined) str = s.animation.c0[0].value
    else str = '0 0'
  }
  const p = String(str).trim().split(/\s+/).map(Number)
  return [Number.isFinite(p[0]) ? p[0] : 0, Number.isFinite(p[1]) ? p[1] : 0]
}

export function parseColor(c) {
  if (c === undefined || c === null) return [1, 1, 1]
  if (typeof c === 'string') return parseVec3(c)
  if (typeof c === 'object' && c !== null) return parseVec3(c.value)
  return [1, 1, 1]
}

export function parseBool(v, dflt = false) {
  if (v === undefined || v === null) return dflt
  if (typeof v === 'boolean') return v
  if (typeof v === 'object' && v !== null) return !!v.value
  return dflt
}

// ①(W3 P-36) 文本数值字段（pointsize/maxwidth/maxrows）的属性绑定解包：
//   number 直接用；{user:"属性名", value:默认值}（WE 用户属性绑定）取 value；
//   其余/非法回落 def。maxrows 这类"必须 >0"的字段由调用方语义保证（<=0 → def）。
function textNum(v, def) {
  let n = v
  if (n && typeof n === 'object' && n.value !== undefined) n = n.value
  n = Number(n)
  return Number.isFinite(n) && n > 0 ? n : def
}

// (P-95 洁净室重写 2026-09-16) 图像 alpha 量纲归一化。
// 行为规格：docs/IMAGE-ALPHA-ALIGN-SPEC.md §1（只依据规格实现，未参考任何第三方源码）。
// 场景文件在同一字段名下混用单位量纲(0..1)与百分数量纲(0..100)，两者都要能进管线。
// 结构：分类(classify) 与 换算(convert) 分离 + switch 分派；上下界用具名常量。
const ALPHA_UNIT_MAX = 1
const ALPHA_PERCENT_MAX = 100
function classifyAlphaDomain(raw) {
  if (!Number.isFinite(raw)) return 'nonfinite'
  if (raw > ALPHA_UNIT_MAX) return raw <= ALPHA_PERCENT_MAX ? 'percent' : 'beyond'
  return 'unit'
}
// [0,1] 截断。`n <= 0` 分支同时把 -0 归成 +0（管线不接受负零）。
function saturateUnitInterval(n) { return n <= 0 ? 0 : n > 1 ? 1 : n }
export function coerceImageAlphaMode(raw) {
  switch (classifyAlphaDomain(raw)) {
    case 'percent': return saturateUnitInterval(raw / ALPHA_PERCENT_MAX)
    case 'beyond': return ALPHA_UNIT_MAX
    case 'unit': return saturateUnitInterval(raw)
    default: return 0
  }
}

export function parseScene(sceneJson, project, opts = {}) {
  // WE 场景坐标 = 编辑器 y-up 空间：world.y = projH - merged.y（已用 Hina/GirlCat 官方预览对照验证）
  const PROJ_H = (sceneJson.general && sceneJson.general.orthogonalprojection && sceneJson.general.orthogonalprojection.height) || 1080
  const properties = (project && project.general && project.general.properties) || {}
  const objects = sceneJson.objects || []

  // ①(P-21-ATTACH 2026-09-13) 附件锚点偏移：默认走移植自 elysia 的实现（core/attach-transform.mjs）。
  //   opts.attachCtx = { readEntry(name)->Uint8Array, time?, fps?, bindOrder? } → 对所有带 attachment 的子层
  //   计算 "MDAT0001 锚点 × 锚点骨骼动画帧0 世界位姿"偏移（y-up 空间，翻转前）。
  //   证据：elysia-transform-check 3719111841 = 19/22 层 Δ<5px；移植 A/B 六包 Δ=0。
  //   ?att=legacy（demo）或 opts.attachmentOffsets（外部表）仍可覆盖/回退。
  //   ①(P-110 2026-09-17) attachCtx.bindOrder 下传（`'legacy'` = 父先乘旧链序，只作 A/B）
  //   ①(P-139 2026-09-19) `actx.time` 允许是**函数**（每帧动画时间取值器）：每层读一次，
  //     锚点即随动画骨走（官方 `WPNodeTransformResolver` 每帧解析语义）。传数字时逐位等于旧行为
  //     （同一个 `ctx.time` 字段，只在被动画骨骼上才有差别）。
  //     为什么需要：时间写死 0 ⇒ 附件层锚点冻在 t=0、父网格逐帧呼吸 ⇒ 相对错位 70.55u（用户第 5 项）。
  let attachOffsets = null
  let attachInfo = null
  if (opts && opts.attachCtx && typeof opts.attachCtx.readEntry === 'function') {
    try {
      const actx = opts.attachCtx
      const aopts = {}
      if (actx.fps) aopts.fps = actx.fps
      if (actx.bindOrder) aopts.bindOrder = actx.bindOrder
      const attTime = (typeof actx.time === 'function') ? actx.time() : actx.time
      attachOffsets = buildAttachOffsets(objects, actx.readEntry, null, attTime || 0, (aopts.fps || aopts.bindOrder) ? aopts : null)
      // ①(P-139) 暴露"本次 parse 实际把**哪个**锚点烘进了层 origin"：宿主逐帧跟随锚点时必须做
      //   **增量**（`origin − frozenAnchor + Δ(t)`），否则会把已烘入的锚点再应用一次 ⇒ 整批附件层
      //   多偏 70.55u（本改动第一版就是这个 bug，门禁 A-1e 判据把它钉住）。
      //   `frozenAnchor` 的选取口径**必须是可复算的**（宿主用同一 objects 顺序 + 同一 readEntry 就能
      //   得到同一个值）：取 objects 里**第一个**带 attachment 且有父级的子层的锚点。同父同锚点的
      //   附件层锚点逐位相同（本包 14 个"头部"层都是 [734.3032820141401, 856.4423128148994]），
      //   所以"第一个"与"哪一个"无关，是确定性口径。
      const __fzId = objects.find((o) => o && o.attachment != null && o.parent != null && attachOffsets.has(o.id))
      const __fz = __fzId ? attachOffsets.get(__fzId.id) : null
      if (__fz) attachInfo = { frozenTime: attTime || 0, frozenAnchor: [__fz[0], __fz[1]] }
    } catch { /* 锚点计算失败 → 无锚点（与 elysia 行为一致） */ }
  }

  // ---- 父子层级：子对象坐标是相对父级的局部坐标，需合并到世界坐标 ----
  // WE 语义：子 origin 相对父原点；父旋转/缩放作用于子。父级无动画时静态合并等价。
  // P-21 A4（wer-ref WPNodeTransformResolver.cpp:103 RemoveImageAlignmentOffsetFromModel）：
  // 官方子层继承的是父的 **authored pivot**（父的 alignment 网格偏移被后乘 T(−align) 剔除）。
  // 我们 alignment 偏移只在 compositeLayer 绘制期作用于**本层网格**、从不并入 origin，
  // 因此这里的 pc.origin 天然就是 authored pivot —— 等价于官方剔除后继承，勿在此叠加父 alignment。
  const byId = new Map()
  for (const o of objects) {
    if (o.id !== undefined) byId.set(o.id, o)
  }
  const local = objects.map((o) => ({
    id: o.id,
    parent: o.parent,
    origin: parseVec3(o.origin || '0 0 0'),
    scale: parseVec3(o.scale || '1 1 1'),
    angles: parseVec3(o.angles || '0 0 0'),
  }))
  // ①(P-61) 用户属性绑定可能改写 origin/scale：记下**作者局部值**与父链累计变换，
  //   这样 origin 绑定的增量能按 parseScene 同一套公式搬到世界坐标（根层直接写 y-down 世界值）。
  const authoredLocal = local.map((c) => ({ origin: c.origin.slice(), scale: c.scale.slice() }))
  const parentXf = new Map()
  // 自底向上迭代合并（层级深时循环至收敛）
  for (let pass = 0; pass < 8; pass++) {
    let changed = false
    for (const c of local) {
      if (c.parent === undefined || c.parent === null) continue
      const p = byId.get(c.parent)
      if (!p) continue
      const pIdx = local.findIndex((x) => x.id === c.parent)
      if (pIdx < 0) continue
      const pc = local[pIdx]
      if (pc.parent !== undefined && pc.parent !== null) continue // 父级还未合并完成，下一轮
      // 父级已合并：应用父变换（旋转仅考虑 z；WE 2D 层只用 z 旋转）
      // ①(P-21-ATTACH 2026-09-13) scene.json 的 angles 是**弧度**（语料实测 3.14159=π、1.57080=π/2；
      //   wer-ref SceneNode.cpp 的 Eigen AngleAxis 直收弧度，elysia resolveTransform 原样直收）。
      //   此前 ×π/180 把弧度当度 → 带旋转父级的子层位置错（π/2 被放大 5730 倍）。
      const ca = pc.angles[2]
      const cos = Math.cos(ca)
      const sin = Math.sin(ca)
      // ①(P-61) 父链累计变换快照（origin/scale 绑定按它把"局部增量"搬到世界坐标）
      if (!parentXf.has(c.id)) parentXf.set(c.id, { cos, sin, sx: pc.scale[0], sy: pc.scale[1], pz: pc.scale[2] })
      // ①(P-21-ATTACH) 附件锚点偏移来源（二选一）：
      //   - opts.attachCtx（新默认）：由移植自 elysia 的 core/attach-transform.mjs 计算
      //     （MDAT0001 锚点表 + MDLA 动画帧0 骨骼世界位姿，见 POSITION-FINDINGS.md §4）；
      //   - opts.attachmentOffsets（旧）：外部（demo.html legacy 路径）预计算好的表。
      const _off = (opts && opts.attachmentOffsets && opts.attachmentOffsets.get(c.id)) || (attachOffsets && attachOffsets.get(c.id)) || null
      const ox = (c.origin[0] + (_off ? _off[0] : 0)) * pc.scale[0]
      const oy = (c.origin[1] + (_off ? _off[1] : 0)) * pc.scale[1]
      c.origin[0] = pc.origin[0] + ox * cos - oy * sin
      c.origin[1] = pc.origin[1] + ox * sin + oy * cos
      c.origin[2] = pc.origin[2] + c.origin[2]
      c.angles[2] = pc.angles[2] + c.angles[2]
      c.scale[0] = pc.scale[0] * c.scale[0]
      c.scale[1] = pc.scale[1] * c.scale[1]
      c.scale[2] = pc.scale[2] * c.scale[2]
      c.parent = null // 标记已合并
      changed = true
    }
    if (!changed) break
  }

  const layers = objects.map((o, i) => {
    const world = local[i]
    // 编辑器 y-up → 渲染 y-down：**所有层统一翻转一次**（官方语义；elysia 绘制端 H−y 同款）。
    // ①(P-21-ATTACH 2026-09-13) 删除"animL 层不翻转"的例外——3554161528 实测裁决：elysia(统一翻转)
    //   人物层 y=595，例外(不翻)=1565，elysia 是官方基准 → 例外是错的。旧行为仅在
    //   opts.legacyAnimY=true 时原样保留（demo ?att=legacy 传回，配合 uniformFlipY 复现旧条件）。
    const hasAnimL = Array.isArray(o.animationlayers) && o.animationlayers.length > 0
    const wy = (hasAnimL && opts && opts.legacyAnimY && !(opts && opts.uniformFlipY)) ? world.origin[1] : PROJ_H - world.origin[1]
    const animProp = (p) => (typeof p === 'object' && p !== null) ? extractAnimKf(p) : null
    const layerAnim = {}
    for (const pk of ['origin', 'scale', 'angles', 'alpha', 'visible']) {
      const kf = animProp(o[pk])
      if (kf) layerAnim[pk] = kf
    }
    return {
      id: o.id !== undefined ? o.id : i,
      name: o.name || '',
      parent: o.parent !== undefined && o.parent !== null ? o.parent : undefined,
      // ①(P-61 用户属性面板) 对象属性上的 `{user:...}` 绑定原文 + 父链变换：
      //   applyUserProperties() 每次面板改动就按它重写真实渲染字段（幂等）。
      __bindRaw: layerBindings(o),
      __localOrigin: authoredLocal[i].origin,
      __authOriginWorld: [world.origin[0], wy, world.origin[2]],
      __parentXf: parentXf.get(o.id) || null,
      __parentScale: parentXf.has(o.id) ? [parentXf.get(o.id).sx, parentXf.get(o.id).sy, parentXf.get(o.id).pz] : null,
      anim: Object.keys(layerAnim).length ? layerAnim : undefined,
      animLayers: Array.isArray(o.animationlayers) && o.animationlayers.length > 0,
      // ①(RE-22) 动画层原始数组：{ animation(id), blend, rate, additive, visible }。
      //   第三方参考实现实测：additive/blendin/blendout/blendtime 在 wer-ref 是**未实现字段**；
      //   真正生效的是"按数组序、逐层相对第 0 帧增量 × authored blend 叠加"，每层独立时间相位。
      __animLayers: Array.isArray(o.animationlayers) && o.animationlayers.length
        ? o.animationlayers.map((x) => ({
            animId: x && typeof x.animation === 'number' ? x.animation : null,
            name: x && x.name ? String(x.name) : '',
            blend: x && typeof x.blend === 'number' ? x.blend : 1,
            rate: x && typeof x.rate === 'number' && x.rate > 0 ? x.rate : 1,
            additive: !!(x && x.additive),
            visible: !(x && x.visible === false),
          }))
        : undefined,
      visible: parseBool(o.visible, true),
      __visibleRaw: o.visible,
      image: typeof o.image === 'string' ? o.image : null,
      particle: typeof o.particle === 'string' ? o.particle : null,
      // ①(RE-19 官方文本层 2026-09-12) text 对象：字段表见 RE-19（pointsize/horizontalalign/
      //   verticalalign/maxwidth/padding/limitrows/... 为真实键；无描边/阴影路径）。
      //   这里只做**解析**，光栅化由调用方（demo，具备 canvas/FontFace）完成并回填 textureName+size。
      // ①(W3 P-36) pointsize/maxwidth/maxrows 支持**用户属性绑定对象** {user:"属性名", value:默认值}：
      //   白子 mpkg 实测 文本1 pointsize={user:"newproperty53",value:45.896}——旧解析只认 number，
      //   对象直接回落默认 32 → 文字"特别小"（45.9px 的字被画成 32px，且脚本/属性调大也无感）。
      //   无用户属性覆盖表时取 value（官方默认）；?props= 可显式覆盖（RE-06 已有该通道，仅用于可见性）。
      __text: (typeof o.text === 'string' || (o.text && typeof o.text === 'object')) ? {
        text: typeof o.text === 'string' ? o.text : String((o.text && o.text.value) || ''),
        scriptDriven: !!(o.text && typeof o.text === 'object' && o.text.script),
        font: typeof o.font === 'string' ? o.font : '',
        color: (() => { const c = o.color && typeof o.color === 'object' ? o.color.value : o.color; const v = parseVec3(c || '1 1 1'); return v }) (),
        alpha: typeof o.alpha === 'number' ? o.alpha : 1,
        backgroundcolor: parseVec3((o.backgroundcolor && typeof o.backgroundcolor === 'object' ? o.backgroundcolor.value : o.backgroundcolor) || '0 0 0'),
        backgroundbrightness: typeof o.backgroundbrightness === 'number' ? o.backgroundbrightness : 1,
        pointsize: textNum(o.pointsize, 32),
        maxwidth: textNum(o.maxwidth, 0),
        padding: o.padding,
        horizontalalign: typeof o.horizontalalign === 'string' ? o.horizontalalign : 'left',
        verticalalign: typeof o.verticalalign === 'string' ? o.verticalalign : 'top',
        blockalign: !!o.blockalign,
        limitwidth: !!o.limitwidth,
        limitrows: !!o.limitrows,
        maxrows: textNum(o.maxrows, 1),
        limituseellipsis: !!o.limituseellipsis,
        opaquebackground: !!o.opaquebackground,
      } : undefined,
      // 粒子定义：字符串(pkg 路径)→经 opts.readParticleDef 读 JSON（需调用方注入 pkg 读取器）；
      // 内联对象 → 直接作为 def。渲染阶段 buildParticleSystem 才解析 emitter/initializer/operator。
      particleDef: ensureParticleDef(o.particle, opts && opts.readParticleDef),
      // ①(P-74) instanceoverride（层→粒子资产实例覆写）：`__ioRaw` 保留原文供面板改动重解析，
      //   `instanceoverride` 是当前生效的归一化值（props 缺失时取作者 value）。
      //   此前 bundle/demo **零命中** ⇒ 41/49 个粒子层的 size/count/alpha/speed/lifetime/rate 全丢。
      __ioRaw: (o.instanceoverride && typeof o.instanceoverride === 'object') ? o.instanceoverride : null,
      instanceoverride: resolveParticleOverride(o.instanceoverride, (opts && opts.properties) || null),
      // WE 的 solid 层：无 image/particle，或 image 指向内置 models/util/solidlayer*（纯色层，无纹理，用 layer.color 渲染）
      solid:
        typeof o.particle !== 'string' &&
        (typeof o.image === 'string' && o.image.indexOf('models/util/solidlayer') === 0
          ? true
          : !!o.solid && (typeof o.image !== 'string' || o.image.indexOf('models/util/') === 0)),
      // composelayer 是分组容器（子层已合并为世界坐标），容器自身不渲染
      isContainer: typeof o.image === 'string' && o.image.indexOf('models/util/composelayer') === 0,
      origin: [world.origin[0], wy, world.origin[2]],
      scale: world.scale,
      angles: world.angles,
      size: parseVec2(o.size || '0 0'),
      alignment: o.alignment || 'center',
      color: parseColor(o.color),
      // 见上 `coerceImageAlphaMode`：编辑器允许 alpha 以百分数(≤100)存储 → 归一化后再 clamp[0,1]；
      // 字段不是数值（缺省/属性绑定对象/关键帧对象）时用 1（完全不透明），不交给本函数。
      alpha: coerceImageAlphaMode(typeof o.alpha === 'number' ? o.alpha : 1),
      brightness: typeof o.brightness === 'number' ? o.brightness : 1,
      copybackground: !!o.copybackground,
      colorBlendMode: o.colorBlendMode || 0,
      // 视差深度（vec2：x/y 方向分量；近景正值位移大、远景负值反向）
      parallaxDepth: o.parallaxDepth !== undefined ? parseVec2(o.parallaxDepth) : null,
      effects: (o.effects || []).map((e) => ({
        file: e.file || '',
        visible: parseBool(e.visible, true),
        passes: (e.passes || []).map((p) => ({
          combos: p.combos || {},
          constantshadervalues: p.constantshadervalues || {},
          textures: p.textures || [],
        })),
      })),
    }
  })
  return {
    camera: sceneJson.camera || null,
    general: sceneJson.general || {},
    layers,
    properties,
    // ①(P-139) 锚点烘入信息（`attachCtx` 生效时有值；宿主逐帧跟随锚点用它做增量，见该处注释）。
    //   无 attachCtx / 无锚点层 = null ⇒ 既有消费方逐位不变（只多一个字段）。
    __attachInfo: attachInfo,
    // ①(P-61) origin 绑定换算要用同一个投影高度（编辑器 y-up → 渲染 y-down 的翻转基准）
    projH: PROJ_H,
    // ①(MERGED-1 D 相机节点 2026-09-12) camera:"default" 空对象（WER-ALIGN B4）：
    //   origin/zoom 属性动画驱动运镜（官方 Scene::UpdateActiveCameraLayer → 节点=ortho/2+origin，
    //   视图=节点世界帧逆，窗口=framed/zoom）。仅当 origin 为**动画关键帧**时生效
    //   （originStatic/script 的 21 包是用户属性滑块驱动，脚本引擎不写相机对象 → 保持 inert 零回归；
    //   其静态基值=编辑器残留，非运行时值）。elysia 对应：core.js _resolveAnimations + camera.js _setupCamera/_viewShift。
    //   ①(P-120 2026-09-18) **`origin: {script:…}` 不再是 inert**：作者原意就是脚本按用户属性算镜头位置
    //   （全语料 14 个包/14 个相机对象，同一段 781 字符脚本，`value.x = scriptProperties.x * engine.canvasSize.x`）。
    //   下面多存 5 个字段供 `renderScene` 的相机分支**用求值结果代替静态 `.value`**（求值走既有宿主
    //   `elysia/scene-scripts.js`，由宿主注册口 `setCameraScriptHost` 注入 —— core/ 不能 import ../elysia/，
    //   发布产物把 core/we-scene-bundle.js 放在站点根，`../elysia/…` 会越过站点根 404）。
    //   `originStatic` 是**解析那一刻**的冻结快照：宿主求值会**就地改写** `.value`（宿主语义就是"更新到原对象树"），
    //   冻结它才能让 `?cam=node` 的"施加快照"语义与求值失败回退都有确定的落点。
    cameraNode: (() => {
      const o = (sceneJson.objects || []).find((x) => x && typeof x.camera === 'string')
      if (!o) return null
      const animated = !!(o.origin && typeof o.origin === 'object' && o.origin.animation)
      const originObj = (o.origin && typeof o.origin === 'object' && !Array.isArray(o.origin)) ? o.origin : null
      const originScriptSrc = (originObj && typeof originObj.script === 'string' && originObj.script) ? originObj.script : null
      return {
        id: o.id,
        camera: o.camera,
        fov: typeof o.fov === 'number' ? o.fov : 50,
        originRaw: o.origin || null,
        zoomRaw: o.zoom || null,
        // ①(P-76) 相机层 `zoom: {user:…}` 的绑定原文（官方对 zoom 注册 PropertyBinding，见
        //   wer-ref WPSceneParser.cpp:7349）——applyUserProperties 末尾据此算 zoomFromUser。
        zoomBinding: (o.zoom && typeof o.zoom === 'object' && !o.zoom.animation && o.zoom.user !== undefined)
          ? { user: o.zoom.user, value: o.zoom.value } : null,
        // ①(P-81) fov 的关键帧原文。①(P-107 更正) **fov 不再是"无落点"**：`?projmode=persp`（或缺省
        //   auto + 无 `general.orthogonalprojection`，语料唯一例 = 3509243656）时由 `buildCamera`
        //   的透视档消费；正交档仍逐位不变。原文里既可能是关键帧（`{animation}`，走 pose.fov）、
        //   也可能是**用户属性绑定**（`{user:"newproperty71", value:50}`，3509243656 的"视场"滑块 ∈[40,65]，
        //   走下面的 fovBinding → fovFromUser）或静态数。
        fovRaw: o.fov !== undefined ? o.fov : null,
        // ①(P-107) 与 P-76 的 `zoomBinding` 同形：相机层 fov 的 `{user:…}` 绑定原文（applyUserProperties
        //   末尾据此算 fovFromUser；正交档不消费 ⇒ 对既有语料零影响）。
        fovBinding: (o.fov && typeof o.fov === 'object' && !o.fov.animation && o.fov.user !== undefined)
          ? { user: o.fov.user, value: o.fov.value } : null,
        // 用户属性绑定的解析结果（由 applyUserProperties 写；未绑定/未给值 = null ⇒ 行为与今天逐位相同）
        zoomFromUser: null,
        fovFromUser: null,
        active: animated,
        // ①(P-120) 相机 origin 逐属性脚本（无脚本 = 全 null，本组字段一个都不消费 ⇒ 逐值不变）
        originObj: o,                                  // 原始相机对象（宿主 thisLayer/thisScene 的 owner + 写回点）
        originStatic: parseVec3(o.origin),              // **冻结**的静态快照（编辑器残留值）
        originScriptSrc,                                // 脚本源（null = 无脚本）
        originScriptAnchor: originScriptSrc ? originObj : null,
        // 对象级脚本属性：语料实测**挂在 origin 节点自己身上**（`origin.scriptproperties`，见
        // `tests/camera-script-origin-probe.mjs` 的"脚本自定义属性"行）；相机对象级同名键兜底。
        originScriptProps: (originObj && originObj.scriptproperties !== undefined) ? originObj.scriptproperties
          : ((o.scriptproperties !== undefined) ? o.scriptproperties : null),
        originEval: null,                               // 最近一次**求值结果**（Vec3；null = 还没求过/不适用）
        originEvalState: originScriptSrc ? 'pending' : 'none',
        originEvalWhy: '',
        originEvalStats: { evals: 0, fallbacks: 0, lastAt: -1 },
      }
    })(),
  }
}

// ── 渲染配置固化（demo.html WebGL 默认路径 & preview.mjs 共用，保证两端一致）──
// 把"refrender 实绘定位 + 长条眼窗 + 背景直绘 + 粒子关 + 隐藏UI/音频层"一次性应用到 scene。
// refrender: {id:[x,y,w,h]}（3840×2160 y-down 实绘矩形，官方绘制值）。anchor:
//   'refcenter'=直接置于实绘中心（=以主体实绘中心为锚的相对位移，不引入相机缩放）；
//   'scene'=相对主体 scene origin 位移（保留主体设计位）。
// ①(W3 P-36) 长条眼窗白名单：只为凯尔希标定过；?eyehack=1 可对任意场景强制开（对照/回退）。
const EYE_HACK_SCENES = ['3719111841']
// ===== TIME-VARIATION (2026-09-14 用户第 5 项 日月循环) =====
// WE 引擎没有内置"时间变化"；带时段变体的场景靠作者脚本（objects[].visible.script）按
// new Date().getHours() 切换同组层（3326873240 的 `后处理层`）。脚本失败/缺失时这些层停在
// authored 状态（display=0 → 只剩 morning）。这里补一条**不依赖脚本**的渲染器通路：
// 识别"变体组"（visible 绑定同一 user.name、condition 互异、≥2 层）→ 按时钟/覆盖参数选层。
const TIME_SLOT_RE = [
  ['morning', /morning|dawn|sunrise|清晨|早晨|日出/i],
  ['day', /(^|[^a-z])day([^a-z]|$)|noon|白天|正午|中午/i],
  ['dusk', /dusk|evening|sunset|黄昏|傍晚|日落/i],
  ['night', /night|midnight|夜晚|夜里|午夜/i],
]
export function slotOfTimeLayer(name) {
  const n = String(name || '')
  for (const [slot, re] of TIME_SLOT_RE) if (re.test(n)) return slot
  return null            // 例："mddn" / "昼夜渐变" → 渐变档，时钟不选（官方脚本同样只选 0..3）
}
export function timeVariantGroups(scene) {
  const byProp = new Map()
  for (const l of (scene.layers || [])) {
    const raw = (l.__visibleRaw !== undefined) ? l.__visibleRaw : l.visible
    const u = raw && typeof raw === 'object' ? raw.user : null
    if (!u || typeof u !== 'object' || !u.name) continue
    const k = String(u.name)
    if (!byProp.has(k)) byProp.set(k, [])
    byProp.get(k).push({ layer: l, cond: String(u.condition === undefined ? '' : u.condition) })
  }
  const out = []
  for (const [name, members] of byProp) {
    if (members.length < 2) continue
    if (new Set(members.map((m) => m.cond)).size < 2) continue
    // ②(偏差记录 TIME-VARIATION P-55) 必须命中**≥2 个不同时段**才算时段变体组：
    //   补丁原文只要求"任一成员名字像时段"，于是把别的包的 UI 组也误判成时段组 →
    //   R1b 的 hideUI 豁免会把它们放出来（实测：3326873240 之外，3544152633 的
    //   `clockdraganddrop`[Clock,DAY DATE TIME(EN/JP)] 与 3660962877 的 `week1`[横Day,竖Day×2]
    //   都只有单一 "day" 字样 → 时钟/星期 UI 层被显示，audit 24→25 层、+1.3s）。
    const slots = new Set(members.map((m) => slotOfTimeLayer(m.layer.name)).filter(Boolean))
    const named = slots.size >= 2
    if (!named && !(name === 'display' && members.length >= 4)) continue   // 作者模板约定
    out.push({ name, members })
  }
  return out
}
export function timeVariantIds(scene) {
  const ids = new Set()
  for (const g of timeVariantGroups(scene)) for (const m of g.members) ids.add(m.layer.id)
  return ids
}
/* ══════════════════════════════════════════════════════════════════════════════════════════
   ①(2026-09-21 音频条被自家 UI 正则吞掉) **音频响应型美术层**豁免 UI 隐藏
   ──────────────────────────────────────────────────────────────────────────────────────────
   现场：用户点名"我的音频条没有做出来"。离线逐层审计（`tests/render-audit.mjs 3544152633`）
   显示 `#3 Audio bar vis=0` —— 不是没有音频源，而是它被**我们自己的** hideUI 正则
   （`Audio|音频|Spectrum|播放|音量|sound`…）无条件隐藏了；同一类层在语料里还有
   `Audio Bars`（3326873240 / 3327063360 / 3470764447，均 fx=2）与
   `音频线Audio Spectrum Visualizer`（3719111841，绑 `audiobar`，fx=1）。
   语料取证（11 包 / 17 个音频类名字层）把两类分得很干净：
     · **美术层**：名字含 Audio bar(s)/Spectrum/频谱/Visualizer，**且有特效 / 粒子 / 作者属性绑定**（= 作者做的可视化条）；
     · **播放器外壳与音源对象**：`Song Title`/`Artist Name`/`Play Icon`/`.mp3`/`----MUSIC PLAYER----`（无可视内容）。
   因此判据 = 名字命中音频美术词 **且** 有特效|粒子|作者绑定 ⇒ 豁免（与 `timeVariantIds` 同款豁免机制；
   `opts.hideAudioArt === true` 可关掉豁免，供回归/对照使用）。 */
const AUDIO_ART_RE = /Audio\s?Bars?|音频|Spectrum|频谱|Visualizer|visualizer/i
/** 音频响应型美术层的 id 集合（hideUI 必须放过它们）。 */
export function audioArtIds(scene) {
  const ids = new Set()
  for (const l of (scene && scene.layers) || []) {
    const n = String(l.name || '')
    if (!AUDIO_ART_RE.test(n)) continue
    const hasFx = !!(l.effects && l.effects.length)
    const hasPart = !!(l.particles && l.particles.length)
    const b = l.__bindRaw || null
    const bound = !!(b && (b.visible || b.alpha || b.color || b.audiobars || b.audioopacity || b.audiobarcolor))
    if (hasFx || hasPart || bound) ids.add(l.id)
  }
  return ids
}
// opts: { properties, time: 层名/condition/"morning|day|dusk|night", hour: 固定小时(自检用), log }
export function applyTimeVariation(scene, opts = {}) {
  const groups = timeVariantGroups(scene)
  const group = groups.find((g) => g.members.some((m) => slotOfTimeLayer(m.layer.name))) || groups[0] || null
  if (!group) return null
  const log = typeof opts.log === 'function' ? opts.log : () => {}
  const props = opts.properties || {}
  const num = (k, d) => { const v = Number(props[k]); return isFinite(v) ? v : d }
  const th = { morning: num('morningtime', 5), day: num('daytime', 9), dusk: num('dusktime', 16), night: num('nighttime', 19) }
  const hourOverride = (opts.hour === null || opts.hour === undefined || !isFinite(Number(opts.hour))) ? null : (Number(opts.hour) | 0)
  const hourNow = () => (hourOverride === null ? new Date().getHours() : hourOverride)
  const slotForHour = (h) => (h > th.morning && h <= th.day) ? 'morning'
    : (h > th.day && h <= th.dusk) ? 'day'
      : (h > th.dusk && h <= th.night) ? 'dusk' : 'night'
  const write = (want) => {
    let hit = null
    for (const m of group.members) { const on = !!want(m); if (on) hit = m; m.layer.visible = on }
    return hit
  }
  let pinned = null
  const pickByClock = () => {
    const h = hourNow(), slot = slotForHour(h)
    const hit = write((m) => slotOfTimeLayer(m.layer.name) === slot)
    log('TIME-VARIATION: ' + h + ' 时 → ' + slot + '（' + (hit ? hit.layer.name : '⚠ 组内无同名时段层') + '）')
    return hit
  }
  const req = (opts.time === null || opts.time === undefined) ? null : String(opts.time)
  let mode = 'clock'
  let picked = null
  if (req) {
    const m = group.members.find((x) => x.cond === req) || group.members.find((x) => String(x.layer.name) === req)
      || group.members.find((x) => slotOfTimeLayer(x.layer.name) === req)
    if (!m) { log('TIME-VARIATION: ?time=' + req + ' 未命中（' + group.name + '），回退时钟'); picked = pickByClock() }
    else { pinned = String(m.layer.name); mode = 'pin'; picked = write((x) => x === m); log('TIME-VARIATION: ?time=' + req + ' → ' + m.layer.name + '（钉住）') }
  } else picked = pickByClock()
  return {
    prop: group.name,
    members: group.members.map((m) => String(m.layer.name)),
    hour: hourNow(), mode, pinned,
    picked: picked ? String(picked.layer.name) : null,
    isTimeLayer(l) { return !!(l && group.members.some((m) => m.layer === l || m.layer.id === l.id)) },
    pin(name) {
      const m = group.members.find((x) => String(x.layer.name) === String(name) || x.cond === String(name))
      if (!m) return false
      pinned = String(m.layer.name); mode = 'pin'
      for (const x of group.members) x.layer.visible = (x === m)
      log('TIME-VARIATION: 钉住 ' + pinned)
      return true
    },
    clearPin() { pinned = null; mode = 'clock'; const hit = pickByClock(); return !!hit },
    reassert() {                      // 每帧在脚本同步之后调用：把被脚本抢走的时段扳回用户钉的层
      if (!pinned) return false
      let hit = null
      for (const m of group.members) { const on = String(m.layer.name) === pinned; if (on) hit = m; m.layer.visible = on }
      return !!hit
    },
  }
}
// ===== /TIME-VARIATION =====

// ①(N2 2026-09-14 第6项 伊蕾娜相框 3660962877) 脚本驱动 origin 的"近整屏层"兜底：
//   **判据按 alignment 反推的实绘矩形，兜底也按 alignment 放锚点**。
//   旧实现（原 demo.html 内联块）把 origin 无条件设成画布中心 (CW/2, CH/2)，完全忽略 layer.alignment：
//   对 `bottomleft` 这类**四角锚点**层，origin 是四边形的一个角而不是几何中心 → 居中化后四边形只剩
//   "中心点右上"那一象限（真机 layerLedger.rd=[1920,-1221,3999,2301]、截图 = 视频只铺右下 1/4）。
//   它当年的触发判据"origin 落在 [−50, 画布+50] 之外"对四角锚点整屏层**天然成立** —— 那些层是
//   **出血**（本层 authored y-down 枢轴 2249.85 只比画布底边多 89.85 px），不是"脚本没跑的残缺值"。
//   现在：① 由 origin+alignment 反推实绘矩形，**矩形覆盖投影 ⇒ 判定 origin 合法并原样保留**
//   （脚本增量叠加后即作者意图：3660962877 → origin=(0,2160) → rd=[0,-140,4000,2300] 满屏）；
//   ② 确实不覆盖（脚本没跑/NaN/真残缺）才兜底，且把**矩形**居中（origin = 中心 − 半宽 + 锚点偏移），
//   alignment 语义与绘制端一致。
//   `?align=0`（opts.alignZero）仍是 A/B 逃逸口：绘制端此时把一切层视作 center（compositeLayer
//   `opts.align === false → a=[0.5,0.5]`），判定/兜底同步用 center 锚点 → 与旧行为逐像素一致。
// 返回 { recentered, kept, skipped }（skipped = 非近整屏层，日志由调用方决定）。
export function applyScriptedFullscreenFallback(scene, opts = {}) {
  const out = { recentered: 0, kept: 0, skipped: 0 }
  if (!scene || !Array.isArray(scene.layers)) return out
  const g = scene.general || {}
  const proj = g.orthogonalprojection || null
  const CW = (proj && Number(proj.width)) || Number(opts.canvasW) || 0
  const CH = (proj && Number(proj.height)) || Number(opts.canvasH) || 0
  if (!(CW > 0) || !(CH > 0)) return out
  const EPS = 1                                   // 1 设计像素容差（出血/取整不算"没覆盖"）
  const alignZero = opts.alignZero === true
  for (const l of scene.layers) {
    if (!l || !l.size || !l.scale || !l.origin) continue
    const w = Number(l.size[0]) * Number(l.scale[0])
    const h = Number(l.size[1]) * Number(l.scale[1])
    if (!(w >= CW * 0.85) || !(h >= CH * 0.85)) { out.skipped++; continue }   // 旧口径不变：只管近整屏层
    const a = alignZero ? [0.5, 0.5] : alignmentAnchor(l.alignment)
    const ox = Number(l.origin[0]), oy = Number(l.origin[1])
    const x0 = ox - w * a[0], y0 = oy - h * a[1]
    const covers = isFinite(x0) && isFinite(y0) &&
      x0 <= EPS && y0 <= EPS && (x0 + w) >= CW - EPS && (y0 + h) >= CH - EPS
    if (covers) { out.kept++; continue }
    l.origin = [CW / 2 - w / 2 + w * a[0], CH / 2 - h / 2 + h * a[1], isFinite(Number(l.origin[2])) ? Number(l.origin[2]) : 0]
    out.recentered++
  }
  return out
}

// alignment → **y-down 归一化锚点**（origin 落在四边形的哪个位置；与绘制端 ALIGN 同表，
// 未知/缺省 → center，与 compositeLayer `ALIGN[layer.alignment] || [0.5,0.5]` 一致）。
export function alignmentAnchor(alignment) {
  const a = ALIGN[alignment]
  return a ? [a[0], a[1]] : [0.5, 0.5]
}

// ===== 用户属性面板与绑定（P-61，官方 project.json properties 面板的等价物）=====
// 官方机制（证据：docs/HINA-CLOCK-AND-PROPERTIES.md §3，全部来自包内原始数据）：
//   · `project.json → general.properties` 一条 = 面板一个控件
//     （type/value/text/order/condition/min/max/step/precision/options/index）。
//   · 对象属性上的 `{user:"名", value:默认}` = 运行期取用户属性**当前值**（无该键回退 value）。
//   · combo 形态 `{user:{condition:"3", name:"newproperty23"}}` = 用户属性等于 condition 时为真。
//   · `condition` 是**表达式**（语料 22 包 723 条属性实测：`clock.value`、`tishi.value==0`、
//     `!timevarying.value`、`a.value == true && b.value == true`、`x.value || y.value`）
//     → 必须一个小表达式求值器，不能只支持 `name.value`。
// 类型口径（P-61 冻结，脚本宿主依赖它）：
//   bool → boolean / slider → number / combo → **string**（脚本里是字符串比较）/
//   color → `"r g b"`（0..1 浮点，WE 是线性 0..1 不是 0..255）/ text 类 → string。
// 面板**渲染**集合：bool/slider/color/combo/group/text/textinput/txt；
//   `schemecolor`（编辑器配色）与无 type/`None`（HTML 营销块）不渲染；
//   `scenetexture`/`usershortcut`/`file` 官方语义未实现 → 只跳过并记账（不猜）。

// 单个属性的类型规范化（面板输入 / URL / localStorage 三种来源共用）
export function propToBool(v, def = false) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === '' || s === '0' || s === 'false' || s === 'no' || s === 'off') return false
    if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true
    return true            // 非空字符串 = 真（复选框语义）
  }
  if (v === undefined || v === null) return !!def
  return !!v
}
// 颜色：`"r g b"`(0..1) ↔ `#rrggbb`。WE 的颜色是**线性 0..1 浮点**，不是 0..255。
export function colorPropToHex(v) {
  const arr = Array.isArray(v) ? v : String(v === undefined || v === null ? '' : v).trim().split(/[\s,]+/)
  if (arr.length < 3) return null
  const n = arr.slice(0, 3).map(Number)
  if (!n.every((x) => isFinite(x))) return null
  const hx = n.map((x) => Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, '0')).join('')
  return '#' + hx
}
export function hexToColorProp(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const s = m[1]
  const n = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255)
  return n.map((x) => String(Math.round(x * 1e6) / 1e6)).join(' ')
}
export function normalizePropValue(type, v, def) {
  const t = String(type === undefined || type === null ? '' : type)
  switch (t) {
    case 'bool': return propToBool(v, propToBool(def, false))
    case 'slider': {
      const n = Number(v)
      return (v === '' || v === null || v === undefined || !isFinite(n)) ? def : n
    }
    case 'combo': return (v === undefined || v === null) ? def : String(v)
    case 'color': {
      if (v === undefined || v === null || v === '') return def
      const hx = hexToColorProp(v)
      if (hx) return hx
      const s = Array.isArray(v) ? v.join(' ') : String(v)
      return /^\s*-?[\d.]+\s+[\d.eE+-]+\s+[\d.eE+-]+\s*$/.test(s) ? s.trim() : def
    }
    case 'text': case 'textinput': case 'txt': return (v === undefined || v === null) ? def : String(v)
    default: return v === undefined ? def : v
  }
}
// 作者默认值表（= 面板打开时的初值；含不渲染的属性，脚本可能读它们）
export function propsDefaults(schema) {
  const out = {}
  for (const [k, p] of Object.entries(schema || {})) {
    out[k] = normalizePropValue(p && p.type, p && p.value, p && p.value)
  }
  return out
}
// 生效值合并：URL `?props=` **优先级最高** > localStorage > 作者默认。
// 返回 {props, locked:Set(被 URL 钉住、面板控件置灰的键), url:{}, stored:{}}
export function mergeUserProps(opts = {}) {
  const schema = opts.schema || null
  const props = propsDefaults(schema)
  const typeOf = (k) => (schema && schema[k] && schema[k].type) || null
  const apply = (src) => {
    const hit = {}
    for (const [k, v] of Object.entries(src || {})) {
      if (v === undefined) continue
      const t = typeOf(k)
      // 有官方 type 才规范化；无 type 的条目（语料 4 条 HTML 块、以及测试里的合成 schema）保持原值
      props[k] = t ? normalizePropValue(t, v, props[k]) : v
      hit[k] = props[k]
    }
    return hit
  }
  const stored = apply(opts.stored)
  const url = apply(opts.url)
  return { props, stored, url, locked: new Set(Object.keys(url)) }
}
// 解析 `?props=name=value,...`（与 demo 既有行为逐字一致：按 ',' 切、按第一个 '=' 切）
export function parsePropsQuery(q) {
  const out = {}
  if (!q) return out
  for (const kv of String(q).split(',')) {
    const [k, v] = kv.split('=')
    if (k) out[k] = v
  }
  return out
}

// ── condition 表达式求值（严格白名单子集，不做 eval）────────────────────────
// 语法：名字（可带 `.value`）、true/false/数字/'字符串'、! == != === !== > < >= <= && || ( )
function condTokenize(src) {
  const toks = []
  let i = 0
  const three = ['===', '!==']
  const two = ['==', '!=', '>=', '<=', '&&', '||']
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    // 多字符算符必须先于单字符判定（否则 `!=` 会被切成 `!` + `=`）
    let m = three.find((t) => src.startsWith(t, i)) || two.find((t) => src.startsWith(t, i))
    if (m) { toks.push(m); i += m.length; continue }
    if (c === '(' || c === ')' || c === '!' || c === '>' || c === '<') { toks.push(c); i++; continue }
    if (c === '"' || c === "'") {
      const j = src.indexOf(c, i + 1)
      if (j < 0) return null
      toks.push({ str: src.slice(i + 1, j) }); i = j + 1; continue
    }
    m = /^-?\d+(\.\d+)?/.exec(src.slice(i))
    if (m) { toks.push({ num: Number(m[0]) }); i += m[0].length; continue }
    m = /^[A-Za-z_$][\w$]*(\.value)?/.exec(src.slice(i))
    if (m) {
      const raw = m[0]
      toks.push({ name: raw.endsWith('.value') ? raw.slice(0, -6) : raw, lit: raw === 'true' ? true : raw === 'false' ? false : undefined })
      i += raw.length; continue
    }
    return null                    // 未知字符 → 解析失败
  }
  return toks
}
function condTruthy(v) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') { const s = v.trim().toLowerCase(); return !(s === '' || s === '0' || s === 'false' || s === 'null' || s === 'undefined') }
  return !!v
}
export function evalPropCondition(expr, props) {
  if (expr === undefined || expr === null || expr === '') return true
  if (typeof expr === 'boolean') return expr
  const toks = condTokenize(String(expr))
  if (!toks || !toks.length) return true         // 解析失败 → fail-open（显示控件比全隐藏安全）
  const pos = { i: 0 }
  const val = (t) => {
    if (!t) return undefined
    if (t.str !== undefined) return t.str
    if (t.num !== undefined) return t.num
    if (t.lit !== undefined) return t.lit
    if (t.name !== undefined) return props ? props[t.name] : undefined
    return undefined
  }
  const prim = () => {
    const t = toks[pos.i]
    if (!t) return undefined
    if (t === '(') { pos.i++; const v = or(); if (toks[pos.i] === ')') pos.i++; return v }
    if (t === '!') { pos.i++; return !condTruthy(body()) }
    pos.i++
    return val(t)
  }
  const body = () => prim()
  const cmp = () => {
    let a = body()
    while (toks[pos.i] === '>' || toks[pos.i] === '<' || toks[pos.i] === '>=' || toks[pos.i] === '<=') {
      const op = toks[pos.i++]; const b = body()
      const x = Number(a), y = Number(b)
      a = op === '>' ? x > y : op === '<' ? x < y : op === '>=' ? x >= y : x <= y
    }
    return a
  }
  const eq = () => {
    let a = cmp()
    while (toks[pos.i] === '==' || toks[pos.i] === '!=' || toks[pos.i] === '===' || toks[pos.i] === '!==') {
      const op = toks[pos.i++]; const b = cmp()
      /* eslint-disable eqeqeq */
      a = op === '==' ? a == b : op === '!=' ? a != b : op === '===' ? a === b : a !== b
    }
    return a
  }
  const and = () => { let a = eq(); while (toks[pos.i] === '&&') { pos.i++; const b = eq(); a = condTruthy(a) && condTruthy(b) } return a }
  const or = () => { let a = and(); while (toks[pos.i] === '||') { pos.i++; const b = and(); a = condTruthy(a) || condTruthy(b) } return a }
  const r = or()
  return condTruthy(r)
}
// condition 里引用的用户属性名（去重）
export function propConditionNames(expr) {
  const toks = condTokenize(String(expr === undefined || expr === null ? '' : expr))
  if (!toks) return []
  const out = []
  for (const t of toks) if (t && t.name !== undefined && t.lit === undefined && out.indexOf(t.name) < 0) out.push(t.name)
  return out
}
// 「门控关闭」集合：自身 condition 为假，**或**它引用的任一父属性本身被门控关闭（传递闭包）。
// 例：hina `clock=false` → newproperty22 关闭 → 依赖它的 newproperty23 也关闭（T2/T3 的依据）。
export function gatedOffNames(schema, props) {
  const names = Object.keys(schema || {})
  const memo = new Map()
  const on = (name, stack) => {
    if (memo.has(name)) return memo.get(name)
    if (stack.has(name)) return true                    // 环 → 视为开（宁可多显示一个控件）
    stack.add(name)
    const p = (schema || {})[name]
    const cond = p && p.condition ? String(p.condition) : ''
    let ok = cond ? evalPropCondition(cond, props) : true
    if (ok) for (const d of propConditionNames(cond)) { if (d === name) continue; if (!on(d, stack)) { ok = false; break } }
    stack.delete(name)
    memo.set(name, ok)
    return ok
  }
  const off = new Set()
  for (const n of names) if (!on(n, new Set())) off.add(n)
  return off
}

// ── 绑定解析 ──────────────────────────────────────────────────────────────
// 返回 null（非绑定）/ {plain|combo, name, hasProp, value, matched, cond}
export function resolveUserBinding(bind, props) {
  if (!bind || typeof bind !== 'object') return null
  const u = bind.user
  if (typeof u === 'string' && u) {
    const has = !!(props && Object.prototype.hasOwnProperty.call(props, u))
    return { plain: true, name: u, hasProp: has, value: has ? props[u] : bind.value }
  }
  if (u && typeof u === 'object' && u.name) {
    const cond = String(u.condition === undefined ? '' : u.condition)
    const has = !!(props && Object.prototype.hasOwnProperty.call(props, u.name))
    if (!has) return { combo: true, name: u.name, hasProp: false, cond, value: !!bind.value, matched: !!bind.value }
    const pv = props[u.name]
    // ①(bool 特例沿用 RE-06 既有官方口径：condition "0" = 勾选时匹配、"1" = 未勾时匹配)
    const matched = (typeof pv === 'boolean')
      ? (cond === '0' ? pv === true : (cond === '1' ? pv === false : pv === true))
      : String(pv) === cond
    return { combo: true, name: u.name, hasProp: true, cond, value: matched, matched }
  }
  return null
}
// 层可见性：**与 RE-06 原实现逐字等价**（含"属性表缺失 → 带 user 的层按可见"这条灾难规避），
// 仅多一条：属性被门控关闭 → 绑定不生效、回落 authored value（P-61「父项关掉 → 子项不生效」）。
export function evalVisibleWithProps(raw, props, gated) {
  if (raw === undefined || raw === null) return true
  if (typeof raw !== 'object') return !!raw
  const u = raw.user
  if (u === undefined || u === null) return raw.value === undefined ? true : !!raw.value
  const name = typeof u === 'string' ? u : (u && u.name)
  const has = !!(props && name && Object.prototype.hasOwnProperty.call(props, name))
  if (!has) return true                                   // 未知（拿不到 project.json）→ 可见
  if (gated && gated.has(name)) return raw.value === undefined ? true : !!raw.value
  const r = resolveUserBinding(raw, props)
  if (!r) return raw.value === undefined ? true : !!raw.value
  if (r.combo) return r.matched
  const pv = r.value
  if (typeof pv === 'boolean') {
    const cond = String(u.condition === undefined ? '' : u.condition)
    return cond === '0' ? pv === true : (cond === '1' ? pv === false : pv === true)
  }
  return String(pv) === String(u.condition === undefined ? '' : u.condition)
}

// ── 面板模型（纯数据，demo 的 DOM 层与测试共用）────────────────────────────
export const PROP_RENDER_TYPES = ['bool', 'slider', 'color', 'combo', 'group', 'text', 'textinput', 'txt']
export const PROP_UNIMPL_TYPES = { scenetexture: 1, usershortcut: 1, file: 1 }
export function propLabel(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/<br\s*\/?>/gi, '\n')          // 作者的 `<br>` = 换行
    .replace(/<[^>]*>/g, '')                // 去掉 HTML 标签（营销块不会走到这里）
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .trim()
}
export function propsPanelModel(schema, props, opts = {}) {
  const entries = Object.entries(schema || {})
  const gated = opts.gated || gatedOffNames(schema, props)
  const locked = opts.locked || null
  const parseFailed = []
  const condParseOk = (c) => {
    if (!c) return true
    const ok = condTokenize(String(c)) !== null
    if (!ok && parseFailed.indexOf(String(c)) < 0) parseFailed.push(String(c))
    return ok
  }
  const dependents = {}
  for (const [k, p] of entries) for (const d of propConditionNames(p && p.condition)) (dependents[d] = dependents[d] || []).push(k)
  const skipped = { html: [], editor: [], unimpl: [], dead: [] }
  const skip = new Set()
  // 第一趟：类型分类
  for (const [k, p] of entries) {
    const t = (p && p.type === undefined) ? '' : String((p && p.type) || '')
    condParseOk(p && p.condition)
    if (!t || t === 'None') { skipped.html.push(k); skip.add(k); continue }
    if (t === 'color' && (k === 'schemecolor' || /ui_browse_properties_scheme_color/i.test(String((p && p.text) || '')))) {
      skipped.editor.push(k); skip.add(k); continue
    }
    if (PROP_UNIMPL_TYPES[t] || PROP_RENDER_TYPES.indexOf(t) < 0) { skipped.unimpl.push(k); skip.add(k); continue }
  }
  // 第二趟：死开关（bool，且**全部**依赖它的条目都已被跳过 —— 例：hina `brhidemarketingwords`
  //   只控制 3 条 HTML 营销块，而那些块本就不渲染 → 显示它等于给用户一个没有任何效果的勾选框）
  for (let pass = 0; pass < 3; pass++) {
    let changed = false
    for (const [k, p] of entries) {
      if (skip.has(k) || !p || p.type !== 'bool') continue
      const deps = dependents[k] || []
      if (!deps.length) continue
      if (deps.every((d) => skip.has(d))) { skipped.dead.push(k); skip.add(k); changed = true }
    }
    if (!changed) break
  }
  const items = []
  let condTotal = 0, condShown = 0
  for (const [k, p] of entries) {
    if (skip.has(k)) continue
    const t = String((p && p.type) || '')
    const hasCond = !!(p && p.condition)
    if (hasCond) condTotal++
    const visible = !gated.has(k)
    if (hasCond && visible) condShown++
    const def = normalizePropValue(t, p && p.value, p && p.value)
    const cur = normalizePropValue(t, props && Object.prototype.hasOwnProperty.call(props, k) ? props[k] : def, def)
    const it = {
      key: k, type: t, label: propLabel(p && p.text), order: Number(p && p.order), index: Number(p && p.index),
      isGroup: t === 'group', visible, condition: hasCond ? String(p.condition) : '',
      defValue: def, value: cur, locked: !!(locked && locked.has(k)),
      min: p && p.min, max: p && p.max, step: p && p.step,
      precision: (p && p.precision) === undefined ? null : Number(p.precision),
    }
    if (t === 'combo') it.options = (Array.isArray(p && p.options) ? p.options : []).map((o) => ({ label: propLabel(o && o.label), value: String(o && o.value) }))
    if (t === 'color') it.hex = colorPropToHex(cur)
    items.push(it)
  }
  items.sort((a, b) => {
    const ao = isFinite(a.order) ? a.order : 1e6, bo = isFinite(b.order) ? b.order : 1e6
    if (ao !== bo) return ao - bo
    const ai = isFinite(a.index) ? a.index : 1e6, bi = isFinite(b.index) ? b.index : 1e6
    if (ai !== bi) return ai - bi
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })
  const controls = items.filter((i) => !i.isGroup)
  return {
    items, groups: items.filter((i) => i.isGroup),
    counts: {
      total: entries.length,
      // ①口径（P-61，T1 断言用）：`rendered` = 面板上**真实出现的条目数**（控件 + group 标题）。
      //   hina：35 条 − 5 条跳过（schemecolor / 3 条 None 营销块 / brhidemarketingwords）= **30**。
      rendered: items.length,
      controls: controls.length,               // 其中可操作的控件数（hina 25）
      groups: items.filter((i) => i.isGroup).length,
      skipped: skip.size,
      skippedHtml: skipped.html.length, skippedEditor: skipped.editor.length,
      skippedUnimpl: skipped.unimpl.length, skippedDead: skipped.dead.length,
      conditions: condTotal,
    },
    skipped, conditionSummary: { total: condTotal, shown: condShown, off: [...gated] },
    condParseFailed: parseFailed,
    values: props || {},
  }
}

// ── 对象属性绑定 → 真实渲染字段 ───────────────────────────────────────────
// ①(P-76 追加，父 agent 要求) 语料里 `volume` / `zoom` 的 `{user:…}` 对象绑定此前都不在这个表里
//   ⇒ 面板改了完全不生效。逐个语料核实后的结论（**不硬塞假开关**）：
//   · `zoom` —— **有落点，但落点不在这个表里**：14 处全部在 `camera:"default"` 的**相机对象**上（7 个不同包），
//     官方明确说"Camera zoom/fov 不是普通可绘层属性，只对相机层扫描、走 **camera target kind** 路由"
//     （wer-ref `WPSceneParser.cpp:7345-7355`：`zoom`/`fov` 注册 Property + Animation + Script 三种绑定，
//     且 `:6128-6135` 相机层**无条件注册**并 `UpdateActiveCameraLayer()`）。
//     故此键**不加进本表**（那是"可绘层字段"的表），改在 `applyUserProperties` 末尾按相机层单独解析
//     → `scene.cameraNode.zoomFromUser`（见那里的注释；消费点 = renderScene 的 camPose 分支）。
//   · `volume` —— **本文件无落点，不接**：28 处**全部**在 `sound` 对象上（11 个不同包），官方语义是
//     逐 sound 层音量（wer-ref `WPSoundParser.cpp` / `ApplySoundPropertyValue → SetStreamVolume`），
//     而**音频播放整条链都在宿主**：`core/we-scene-bundle.js` 里 `volume`/`gain`/`setVolume` **零命中**，
//     真实落点是 `demo.html:2051-2091` 的 `<audio>`（`soundLayerVolumeBinding` / `currentAudioVolume`
//     / 2176-2181 的 4Hz `updateSceneAudioVolume`）—— 它读 demo 自己的 `sceneObj.objects[].volume`
//     与 `window.__mpwUserProps`，**不经过本文件的 layer 模型**。在这里加 `volume` 绑定只会写进一个
//     没人读的字段（= 假开关），所以不加。详见 PATCHES P-76 的「volume/zoom」一节。
const USER_BIND_KEYS = ['visible', 'alpha', 'color', 'brightness', 'pointsize', 'origin', 'scale', 'size', 'parallaxDepth', 'text']
export const USER_BIND_KEY_LIST = USER_BIND_KEYS
function bindValueOf(v) { return v && typeof v === 'object' && v.user !== undefined ? { user: v.user, value: v.value } : null }
export function layerBindings(o) {
  const m = {}
  for (const k of USER_BIND_KEYS) { const b = bindValueOf(o && o[k]); if (b) m[k] = b }
  return Object.keys(m).length ? m : undefined
}
function finiteNum(v) { const n = Number(v); return isFinite(n) ? n : null }
// ①(P-61) 数值字段的**严格**取值：布尔属性绑到数值字段（语料唯一样本：hina id1592 的
//   `pointsize:{user:"newproperty18"}` 而 newproperty18 是 bool 高光开关）不写入 ——
//   Number(true)=1 会把歌曲名字号写成 1px。WE 真机行为未定，这里保守保持 authored 值并记账。
function numOf(v) {
  if (typeof v === 'boolean' || v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}
// 严格向量解析（parseVec3/parseVec2 对垃圾输入会回落 0 → 会把坐标写坏，绑定路径必须判空）
function strictVec(v, n) {
  const s = Array.isArray(v) ? v.join(' ') : (v === undefined || v === null ? '' : String(v))
  const p = s.trim().split(/[\s,]+/).map(Number)
  if (p.length < n || !p.slice(0, n).every((x) => isFinite(x))) return null
  return p.slice(0, n)
}
// 写一个绑定字段；返回是否真的写入了（诊断计数用）
function writeBindField(l, key, r, projH, props, gated) {
  const v = r.value
  switch (key) {
    case 'visible': {
      const b = evalVisibleWithProps(l.__bindRaw && l.__bindRaw.visible, props, gated)
      if (l.visible !== b) { l.visible = b; return true }
      return false
    }
    case 'alpha': {
      const n = numOf(v); if (n === null) return false
      l.alpha = coerceImageAlphaMode(n)
      if (l.__text) l.__text.alpha = l.alpha
      return true
    }
    case 'color': {
      const c = strictVec(v, 3)
      if (!c) return false
      l.color = c
      if (l.__text) l.__text.color = c
      return true
    }
    case 'pointsize': {
      const n = numOf(v)
      if (n === null || n <= 0 || !l.__text) return false
      l.__text.pointsize = n
      return true
    }
    case 'brightness': { const n = numOf(v); if (n === null) return false; l.brightness = n; return true }
    case 'size': { const s = strictVec(v, 2); if (!s) return false; l.size = s; return true }
    case 'parallaxDepth': { const s = strictVec(v, 2); if (!s) return false; l.parallaxDepth = s; return true }
    case 'text': {
      if (!l.__text) return false
      if (typeof v === 'boolean' || v === null || v === undefined || typeof v === 'object') return false
      const s = String(v)
      if (l.__text.text === s) return false
      l.__text.text = s; l.textureName = ''      // 清掉纹理名 → demo 下帧按新文本重新光栅化
      return true
    }
    case 'origin': {
      const o = strictVec(v, 3); if (!o) return false
      if (l.__parentXf && l.__localOrigin && l.__authOriginWorld) {
        // 子层：作者局部 origin 变了多少 → 按父链累计变换搬到世界坐标（与 parseScene 合并式同源）
        const dx0 = o[0] - l.__localOrigin[0], dy0 = o[1] - l.__localOrigin[1]
        const { cos, sin, sx, sy } = l.__parentXf
        const dx = dx0 * sx, dy = dy0 * sy
        l.origin = [
          l.__authOriginWorld[0] + dx * cos - dy * sin,
          l.__authOriginWorld[1] + dx * sin + dy * cos,
          (l.__authOriginWorld[2] || 0) + (o[2] - (l.__localOrigin[2] || 0)),
        ]
      } else {
        l.origin = [o[0], projH - o[1], o[2]]     // 根层：编辑器 y-up → 渲染 y-down
      }
      return true
    }
    case 'scale': {
      const s = strictVec(v, 3); if (!s) return false
      const p = l.__parentScale
      l.scale = p ? [s[0] * p[0], s[1] * p[1], s[2] * p[2]] : s
      return true
    }
    default: return false
  }
}
// 把用户属性写进已解析的 scene.layers（`{user:...}` 绑定）。幂等：可反复调用（面板每次改动调一次）。
// opts: { schema, gated, log }
export function applyUserProperties(scene, props, opts = {}) {
  const schema = opts.schema || null
  const gated = (opts.gated instanceof Set) ? opts.gated : (schema ? gatedOffNames(schema, props) : new Set())
  const projH = finiteNum(scene && scene.projH) || 1080
  const stats = { layers: 0, bound: 0, applied: 0, gated: 0, missing: 0, fields: {}, unhandled: {} }
  for (const l of ((scene && scene.layers) || [])) {
    // ①(P-74) instanceoverride 的 `{user:...}` 绑定：与可见性/文本同一条通道（面板改动即刻生效）
    if (l.__ioRaw) { try { l.instanceoverride = resolveParticleOverride(l.__ioRaw, props, gated) } catch (e) { /* 保持旧值 */ } }
    const binds = l.__bindRaw
    if (!binds) continue
    stats.bound++
    let wrote = 0
    for (const key of Object.keys(binds)) {
      const bind = binds[key]
      const name = typeof bind.user === 'string' ? bind.user : (bind.user && bind.user.name)
      if (name && gated.has(name)) { stats.gated++; stats.fields[key + ':gated'] = (stats.fields[key + ':gated'] || 0) + 1; continue }
      if (!name || !props || !Object.prototype.hasOwnProperty.call(props, name)) { stats.missing++; continue }
      const r = resolveUserBinding(bind, props)
      if (!r) continue
      let ok = false
      try { ok = writeBindField(l, key, r, projH, props, gated) } catch (e) { ok = false }
      if (ok) { wrote++; stats.applied++; stats.fields[key] = (stats.fields[key] || 0) + 1 }
    }
    if (wrote) stats.layers++
  }
  // ①(P-76) **相机层 `zoom` 的 `{user:…}` 绑定**：官方说"Camera zoom/fov 不是普通可绘层属性，
  //   只对相机层扫描、走 camera target kind 路由"（wer-ref `WPSceneParser.cpp:7345-7355` 给 `zoom`
  //   注册 Property/Animation/Script 三种绑定）⇒ 这里按**相机节点**单独解析，不混进上面那张"可绘层字段"表。
  //   幂等：每次调用都从 `zoomBinding` 原文重算（属性缺失/门控 → 视为无用户值 ⇒ zoomFromUser=null）。
  //   **只接 zoom、不接 origin 的 `{user:…}` 绑定**：语料 14 个相机包的 `origin` 是**逐属性脚本**
  //   （`{script:…, value:"2434.38 725.25 500"}`），
  //   其静态基值是编辑器残留 —— 实测若按它平移，取景会整体偏 **2434px**（P-69 因此明确保持 inert）。
  //   ①(P-120) origin 现在走**脚本求值**（不是 `{user:…}` 绑定、也不是静态快照），落点在 renderScene
  //   的 `originScriptSrc` 分支 → 这条"不接用户绑定"的口径不变。
  //   而 zoom 是面板上一个真实滑块（`newproperty30` = "🔘镜头大小 / Lens size"，0.1~2，默认 1）——
  //   默认值 1 时 `framed/1` 与今天**逐位相同**，只有用户真的拖了滑块画面才变 ⇒ 零回归。
  if (scene && scene.cameraNode && scene.cameraNode.zoomBinding) {
    const cn = scene.cameraNode
    const name = typeof cn.zoomBinding.user === 'string' ? cn.zoomBinding.user : (cn.zoomBinding.user && cn.zoomBinding.user.name)
    let val = null
    if (name && !gated.has(name) && props && Object.prototype.hasOwnProperty.call(props, name)) {
      const r = resolveUserBinding(cn.zoomBinding, props)
      const n = r ? numOf(r.value) : null
      if (n !== null && n > 0) val = n
    }
    cn.zoomFromUser = val
    stats.fields['zoom:cameraNode'] = val === null ? 0 : 1
  }
  // ①(P-107) **相机层 `fov` 的 `{user:…}` 绑定**（与上面 zoom 完全同形；官方对 `fov` 注册的也是
  //   PropertyBinding，见 P-81 的引注）。语料实证：3509243656 的相机层 `fov = {"user":"newproperty71",
  //   value:50}`，project.json 里 `newproperty71` = {text:"视场", type:slider, min:40, max:65, step:0.1,
  //   precision:2, value:50} ⇒ 这是面板上真实的"视场"滑块，默认 50 时与今天**逐位相同**。
  //   与 zoom 一样只解析**绑定值本身**（不求解 `{script:…}`：那是编辑器快照，P-81 已量化过 −2434px 教训）。
  if (scene && scene.cameraNode && scene.cameraNode.fovBinding) {
    const cn = scene.cameraNode
    const name = typeof cn.fovBinding.user === 'string' ? cn.fovBinding.user : (cn.fovBinding.user && cn.fovBinding.user.name)
    let val = null
    if (name && !gated.has(name) && props && Object.prototype.hasOwnProperty.call(props, name)) {
      const r = resolveUserBinding(cn.fovBinding, props)
      const n = r ? numOf(r.value) : null
      if (n !== null && n > 0) val = n
    }
    cn.fovFromUser = val
    stats.fields['fov:cameraNode'] = val === null ? 0 : 1
  }
  if (typeof window !== 'undefined') { try { window.__mpwPropsApply = stats } catch (e) { /* ignore */ } }
  if (opts.log && (stats.applied || stats.gated)) {
    opts.log('P-61 用户属性绑定：' + stats.applied + ' 处写入 / ' + stats.bound + ' 个绑定层'
      + (stats.gated ? '（门控未生效 ' + stats.gated + ' 处）' : ''))
  }
  return stats
}

// ── 对象 scriptproperties 绑定 → 交给脚本宿主 ─────────────────────────────
// elysia/scene-scripts.js 只会解 `{user:"名", value}`（字符串 user），**combo 形态
// `{user:{condition,name}}` 会被它当成普通 value 兜底** → 日期格式三选一永远停在作者默认。
// 本函数在对象上把 scriptproperties **就地解析成字面量**（宿主每帧按当前对象重新覆盖，
// 所以面板一改、下帧脚本就读到新值）；原文快照存在模块内 WeakMap，反复调用可重解析。
const SCRIPT_PROP_ORIG = new WeakMap()
export function resolveScriptProperties(sp, props, gated) {
  let src = sp
  if (typeof src === 'string') { try { const j = JSON.parse(src); if (j && typeof j === 'object') src = j } catch (e) { return null } }
  if (!src || typeof src !== 'object' || Array.isArray(src)) return null
  const out = {}
  let resolved = 0
  for (const [k, v] of Object.entries(src)) {
    const bind = bindValueOf(v)
    if (bind) {
      const name = typeof bind.user === 'string' ? bind.user : (bind.user && bind.user.name)
      if (gated && name && gated.has(name)) { out[k] = bind.value; continue }   // 门控关闭 → 作者默认
      const r = resolveUserBinding(bind, props)
      if (r && r.hasProp) { out[k] = r.combo ? !!r.matched : r.value; resolved++ } else out[k] = bind.value
    } else if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) {
      out[k] = v.value
    } else {
      out[k] = v
    }
  }
  return { props: out, resolved }
}
// 遍历 scene.json 的 objects（含嵌套 objects），把每个"脚本属性值对象"的 scriptproperties 解析成字面量。
export function applyScriptProps(sceneJson, props, opts = {}) {
  const schema = opts.schema || null
  const gated = (opts.gated instanceof Set) ? opts.gated : (schema ? gatedOffNames(schema, props) : new Set())
  const stats = { objects: 0, scripts: 0, entries: 0, resolved: 0 }
  const walk = (list) => {
    for (const o of (list || [])) {
      if (!o || typeof o !== 'object') continue
      stats.objects++
      for (const k of Object.keys(o)) {
        const sv = o[k]
        if (!sv || typeof sv !== 'object' || Array.isArray(sv) || typeof sv.script !== 'string' || !sv.scriptproperties) continue
        stats.scripts++
        let orig = SCRIPT_PROP_ORIG.get(sv)
        if (!orig) {
          orig = (typeof sv.scriptproperties === 'string') ? sv.scriptproperties : JSON.parse(JSON.stringify(sv.scriptproperties))
          SCRIPT_PROP_ORIG.set(sv, orig)
        }
        const r = resolveScriptProperties(orig, props, gated)
        if (!r) continue
        sv.scriptproperties = r.props
        stats.entries += Object.keys(r.props).length
        stats.resolved += r.resolved
      }
      if (o.objects) walk(o.objects)
    }
  }
  walk(sceneJson && sceneJson.objects)
  if (typeof window !== 'undefined') { try { window.__mpwScriptProps = stats } catch (e) { /* ignore */ } }
  if (opts.log && stats.scripts) opts.log('P-61 脚本属性绑定：' + stats.scripts + ' 个脚本属性块、' + stats.resolved + ' 条由用户属性解析')
  return stats
}

export function applyRenderConfig(scene, opts = {}) {
  const refrender = opts.refrender || null
  const anchor = opts.anchor || 'refcenter'
  const hideUI = opts.hideUI !== false
  const hideParticles = opts.hideParticles !== false
  const clearBgFx = opts.clearBgFx !== false
  const hideBars = opts.hideBars !== false

  // 1) refrender 实绘定位（用主体层作为锚）
  if (refrender) {
    const body = scene.layers.find((l) => String(l.name || '').indexOf('主体') >= 0)
    const brev = refrender[String(body ? body.id : '')]
    const bx = brev ? brev[0] + brev[2] / 2 : 0
    const by = brev ? brev[1] + brev[3] / 2 : 0
    let applied = 0
    for (const l of scene.layers) {
      const v = refrender[String(l.id)]
      if (!v) continue
      const cx = v[0] + v[2] / 2, cy = v[1] + v[3] / 2
      if (anchor === 'scene' && body) l.origin = [body.origin[0] + (cx - bx), body.origin[1] + (cy - by), l.origin[2] || 0]
      else l.origin = [cx, cy, l.origin[2] || 0]
      applied++
    }
    if (applied && opts.log) opts.log('refrender 实绘定位 ' + applied + ' 层（anchor=' + anchor + '）')
  }
  // 2) 眼睛长条眼窗（uvRect 横带 [0.04,0.30,0.96,0.70]）+ 眼皮窗
  // ①(W3 P-36) **限定凯尔希 3719111841**：该 hack 是为凯尔希 3/4 侧脸逐位标定的
  //   （CALIBRATION-3719111841），对所有场景的"眼睛组合"层生效会把别的场景的眼睛
  //   压成 405×120 横条（真机 凯尔希 眼睛窗口/头发/飘带 观感错位 清单里的主嫌疑）。
  //   opts.eyeHack 显式三态：true=强制开（?eyehack=1 回退口）、false=强制关、
  //   undefined=仅 sceneId 命中白名单时开。
  {
    // ①(P-76) 回退开关：`?eyehack=legacy` 恢复"覆写 l.scale=[1,1]"的旧口径（真机 A/B / 回退用）；
    //   缺省 = 新口径（只把 es 折进 size，不动 scale）。opts.eyeHackLegacy 供测试在同进程内切两态。
    const __eyeHackLegacy = (opts.eyeHackLegacy !== undefined)
      ? !!opts.eyeHackLegacy
      : (() => { try { return new URLSearchParams(location.search).get('eyehack') === 'legacy' } catch (e) { return false } })()
    const __eyeHack = (opts.eyeHack !== undefined)
      ? !!opts.eyeHack
      : EYE_HACK_SCENES.includes(String(opts.sceneId || ''))
    if (__eyeHack) for (const l of scene.layers) {
      if (l.name === '眼睛组合') {
        // 长条眼窗：uvRect 横带选"绿瞳部件"，quad=405×120（横长条，暗睫弧在上构成杏仁眼，
        // 贴合官方 3/4 侧脸观感；比例优先"长条眼"视觉，而非实绘 169.78×277.88 的高度比）。
        l.uvRect = [0.04, 0.30, 0.96, 0.70]
        const es = opts.eyeSize || [405, 120]
        // ①(P-76 真机：凯尔希"眼睛位置不对") **不再覆写 l.scale**。
        //   旧实现 `l.size=[405,120]; l.scale=[1,1,…]` 是按"四边形层 w=size×scale"写的，
        //   但本层是 **puppet 蒙皮层**：demo.html:3521 把 `layer.scale` 直接当 u_Scale 交给
        //   renderMeshLayer（wpos = u_Origin + u_Scale·蒙皮后顶点），**不读 layer.size/uvRect**。
        //   而该层对象没有 scale 键、父链（115→91→475）解析出的世界 scale = 0.69297 ⇒ 覆写成 1
        //   让眼睛网格被放大 1/0.69297 = 1.4431 倍，并把实绘框从 x[2219,2430] 挪到 x[1912,2217]
        //   （真机台账 rd=[1912,541,305,253]、sc=[1,1]；同门 sibling 右眼上眼睑 sc=[0.693,0.693]、
        //   rd 与官方标定 refrender[67] 逐位吻合）。
        //   改法：把 es **反向折进 size**（`size×scale ≡ es`）⇒ 四边形路径的 w/h = size×scale
        //   与旧行为逐位不变（drawGuard / isFullCanvasLayer / renderLayer FBO 全用同一乘积），
        //   而 layer.scale 保持 authored ⇒ 蒙皮路径回到正确比例。
        //   scale 退化（0/NaN）时保留旧写法兜底。回退开关：`?eyehack=legacy`（旧口径）。
        const __sx = Number(l.scale && l.scale[0]), __sy = Number(l.scale && l.scale[1])
        if (__eyeHackLegacy || !isFinite(__sx) || !isFinite(__sy) || Math.abs(__sx) <= 1e-6 || Math.abs(__sy) <= 1e-6) {
          l.size = [es[0], es[1]]; l.scale = [1, 1, l.scale[2] || 1]
        } else {
          l.size = [es[0] / __sx, es[1] / __sy]
        }
      }
      else if (l.name === '左眼皮' || l.name === '右眼上眼睑') l.uvRect = [0.08, 0.10, 0.92, 0.90]
    }
  }
  // 2.4) ①(P-61 用户属性面板) 对象属性 `{user:...}` 绑定 → 真实渲染字段
  //   （visible/alpha/color/brightness/pointsize/origin/scale/size/parallaxDepth/text）。
  //   口径：包自带用户属性的层**以包的属性为准**（面板驱动）；同一次调用里 RE-06 会再按
  //   同一套 evalVisibleWithProps 复算 visible + 做父链级联，所以这里不会与旧行为分叉。
  //   **新路径只在调用方给出官方属性表（opts.propertiesSchema）时启用**：condition 门控与
  //   类型规范化都依赖它；旧调用点（package-matrix / preview / render-audit / parity-check
  //   只传值表）逐位不变 —— 这是 package-baseline 不漂移的保证。
  const __schema = opts.propertiesSchema || null
  const __gated = (opts.properties && __schema) ? gatedOffNames(__schema, opts.properties) : null
  if (__schema && opts.properties && scene && Array.isArray(scene.layers)) {
    try {
      applyUserProperties(scene, opts.properties, { schema: __schema, gated: __gated || undefined, log: opts.log })
    } catch (e) { if (opts.log) opts.log('⚠ P-61 用户属性绑定失败: ' + (e && e.message)) }
  }
  // 2.5) ①(RE-06 官方语义 2026-09-12) 层可见性：**可见性 = 条件匹配结果本身**，authored `value` 仅兜底。
  //   project.json general.properties 提供用户属性（combo "0"/"1"、bool、slider…）：
  //     - bool 属性：condition "0" = 勾选时匹配、"1" = 未勾时匹配（官方反直觉规则）
  //     - 其它属性：String(属性值) === String(condition) 即匹配
  //     - 属性缺失/未启用 → 用 authored value 兜底
  //   随后做**父链级联**：任一祖先不可见 → 本层不可见。
  //   ①(P-61) 求值收敛到 evalVisibleWithProps()（口径逐字不变；新增"属性被 condition 门控关闭 →
  //   绑定不生效"一条，见 PATCHES P-61）。
  try {
    const props = opts.properties || null
    const byId = new Map(scene.layers.map((l) => [l.id, l]))
    const evalOne = (l) => {
      const v = (l.__visibleRaw !== undefined) ? l.__visibleRaw : l.visible
      if (v === undefined || v === null) return true
      if (typeof v !== 'object') return !!v
      const user = v.user
      if (props && user && user.name && Object.prototype.hasOwnProperty.call(props, user.name)) {
        return evalVisibleWithProps(v, props, __gated)
      }
      // ①(P-61) **字符串形态**绑定 `{"user":"clock", value:true}`（hina 时钟层 id398 就是这个）：
      //   旧实现只认 user.name（对象形态），字符串形态一律落回 authored value → 面板开关不动层。
      //   只有拿到官方属性表（propertiesSchema）时才启用，旧调用点逐位不变。
      if (__schema && props && typeof user === 'string' && user && Object.prototype.hasOwnProperty.call(props, user)) {
        return evalVisibleWithProps(v, props, __gated)
      }
      // ①(修正) 没有属性表时**不能**按 value 兜底：官方 value 只是"属性缺失时"的兜底，
      //   而我们拿不到 project.json 时属于"未知"——按 value:false 会直接隐藏主体（伊蕾娜实测）。
      //   未知 → 带 user 条件的层按可见（legacy 行为，多显示一层无害，隐藏主体是灾难）。
      if (user && user.name) return true
      return v.value === undefined ? true : !!v.value
    }
    const cache = new Map()
    const visibleOf = (l) => {
      if (cache.has(l.id)) return cache.get(l.id)
      cache.set(l.id, true)   // 防环
      let vis = evalOne(l)
      if (vis && l.parent !== undefined && l.parent !== null) {
        const par = byId.get(l.parent)
        if (par && !visibleOf(par)) vis = false
      }
      cache.set(l.id, vis)
      return vis
    }
    let n = 0
    for (const l of scene.layers) { const vis = visibleOf(l); if (l.visible !== vis) { l.visible = vis; n++ } }
    if (n && opts.log) opts.log('RE-06 可见性：按条件匹配/父链级联调整了 ' + n + ' 层')
  } catch (e) { console.error('[RE06-DEBUG]', e && e.message) }
  // 3) 粒子默认关
  if (hideParticles) for (const l of scene.layers) if (l.particle) l.visible = false
  // 4) 背景类超大层效果链停用（直绘基色，灰/白块根治）
  if (clearBgFx) for (const l of scene.layers) {
    if (l.effects && l.effects.length && l.size && ((l.size[0] || 0) >= 3800 || (l.size[1] || 0) >= 2000)) l.effects = []
  }
  // 5) 隐藏播放器/音频/UI/歌曲组件层（官方预览无这些 UI）
  // ①(N5 2026-09-14 用户决策 A：四类文本做开关) 时钟/日期/星期三类此前被 uiRe **无条件**隐藏
  //   （语料实测 319/439 = 73% 文本层因此从未显示，11 个容器"一个字都没有"；第 11 项共因②）。
  //   现在拆成四个开关（契约名已冻结，插件白名单 MPW_SCENE_DEBUG_KEYS 已放行）：
  //     showclock / showdate / showweekday / showfps   取值 0/1
  //   默认：clock / date / weekday **显示**、fps **隐藏**（用户口径）。
  //   实现：四类词从 uiRe 移出，改为按类别 + 开关逐个判定（先过 uiRe，再判类别）；
  //   `?showui`（hideUI=false）仍是"整组全显示"，语义不变。
  //   注意：`Clock Container` / `Text Container` 等**容器**名仍留在 uiRe 里无条件隐藏 ——
  //   容器本身无纹理，且渲染器不做绘制期的父链可见性级联（hideUI 只改本层），子层开关结果不受影响。
  /* ①(2026-09-21) 音频响应型美术层（`Audio bar` / `Audio Bars` / `音频线…Spectrum Visualizer`）
     豁免**两条**隐藏启发式：hideUI 的名字正则、hideBars 的"父组纯色遮罩条"（可视化条本身就是
     `models/util/solidlayer.json` 的实体遮罩层 —— 实测 3326873240 的 `Audio Bars` 正是被后者吞掉的）。
     取证与判据见 `audioArtIds()` 上方。`opts.hideAudioArt === true` 可整体关掉豁免（对照/回归用）。 */
  const __audioIds = opts.hideAudioArt === true ? new Set() : audioArtIds(scene)
  if (hideUI) {
    const __tvIds = timeVariantIds(scene)   // TIME-VARIATION: 时段变体层豁免 UI 正则
    // ①(2026-09-12 用户要求) 提示框（prompt box）一律隐藏：WE 场景里常见 "提示框"/"Hint"/"Prompt" 层
    //   （例：3326873240 的 `提示框2`(伊蕾娜 提示框)、3660962877 的 `伊蕾娜 提示框`）——官方预览不显示这些
    //   交互提示，留着只会挡住画面。用户明确："遇到就直接把这一层删掉"。?showui 可整组恢复。
    const uiRe = /Cube|Song Title|Artist Name|Album Title|Play Icon|Pause Icon|dragAndDrop|clockHide|clockOrientation|textOrientation|Clock Container|Text Container|Rounded Corners|Round R|Round L|toggle|Audio|音频|Spectrum|播放|音量|sound|Launcher|歌词|Lyrics|music|Music|UI|mp3|MSR|唱片|Spectrum Visualizer|提示框|提示窗|prompt|Prompt/i
    // N5 四类文本的类别正则（与旧 uiRe 里的对应词同口径，逐条搬出）
    const catRe = {
      clock: /Clock|时间/i,
      date: /Date|日期/i,
      weekday: /D a y|Day|星期/i,
      fps: /帧率|[Ff][Pp][Ss]|(^| )Frame($| )/,
    }
    const catOn = {
      clock: opts.showClock !== false,
      date: opts.showDate !== false,
      weekday: opts.showWeekday !== false,
      fps: opts.showFps === true,
    }
    const hiddenByCat = { clock: 0, date: 0, weekday: 0, fps: 0 }
    const hiddenNonText = { clock: 0, date: 0, weekday: 0, fps: 0 }
    // ①(P-61) "包自带开关优先"：包的面板里有**同名 bool 开关**（WE 约定名 clock/date/weekday/fps，
    //   例 hina 的 `clock`(时间/clock)）时，该类别里**可见性由用户属性绑定**的层由包的属性驱动，
    //   N5 的 URL 开关不再插手（两套开关打架时以作者面板为准）。
    //   没有属性表（旧调用点 / 测试）→ 全 false → N5 行为逐位不变（text-switches-test 冻结口径）。
    const __panelCat = { clock: false, date: false, weekday: false, fps: false }
    if (__schema) for (const k of Object.keys(__panelCat)) {
      const p = __schema[k]
      __panelCat[k] = !!(p && String(p.type) === 'bool')
    }
    const panelDriven = { clock: 0, date: 0, weekday: 0, fps: 0 }
    for (const l of scene.layers) {
      if (__tvIds.has(l.id)) continue
      if (__audioIds.has(l.id)) continue
      const n = String(l.name || '')
      if (uiRe.test(n)) { l.visible = false; continue }
      for (const k of ['clock', 'date', 'weekday', 'fps']) {
        if (!catRe[k].test(n)) continue
        if (__panelCat[k] && l.__bindRaw && l.__bindRaw.visible) { panelDriven[k]++; break }
        // ①(N5) 开关**只对文本层**（`__text`）生效 —— 用户口径是"四类**文本**做开关"。
        //   同名**非文本**层（时钟/日期的 solid 底板、分组层、`Frame` 框等）保持旧行为（隐藏）：
        //   · 它们不是用户要看的那四类文本；
        //   · 放出来会改变 package-matrix 的透明回退计数（实测 22 行 +1~2 退化：包内
        //     `Clock`/`Date`/`Day` 的 solid 底板层被 mock-GL 记为 transparentFallback）。
        if (l.__text && catOn[k]) break          // 文本层 + 开关开 → 保留可见
        l.visible = false
        if (l.__text) hiddenByCat[k]++; else hiddenNonText[k]++
        break
      }
    }
    if (opts.log && (hiddenByCat.clock || hiddenByCat.date || hiddenByCat.weekday || hiddenByCat.fps)) {
      opts.log('N5 文本开关：隐藏 clock=' + hiddenByCat.clock + ' / date=' + hiddenByCat.date + ' / weekday=' + hiddenByCat.weekday
        + ' / fps=' + hiddenByCat.fps + '（showclock=' + (catOn.clock ? 1 : 0) + ' showdate=' + (catOn.date ? 1 : 0)
        + ' showweekday=' + (catOn.weekday ? 1 : 0) + ' showfps=' + (catOn.fps ? 1 : 0) + '）')
    }
    if (opts.log && (hiddenNonText.clock || hiddenNonText.date || hiddenNonText.weekday || hiddenNonText.fps)) {
      opts.log('N5 非文本同名层（底板/分组）仍按旧口径隐藏：' + ['clock', 'date', 'weekday', 'fps'].map((k) => k + '=' + hiddenNonText[k]).join(' '))
    }
    if (opts.log && (panelDriven.clock || panelDriven.date || panelDriven.weekday || panelDriven.fps)) {
      opts.log('P-61 包自带开关优先：' + ['clock', 'date', 'weekday', 'fps'].map((k) => k + '=' + panelDriven[k]).join(' ')
        + ' 层由包的用户属性驱动（N5 的 show* 开关对它们不生效）')
    }
    /* ①(2026-09-21) 豁免了哪些音频美术层要能被看见（否则"音频条不显示"又变成只能靠猜） */
    if (opts.log && __audioIds.size) {
      const names = scene.layers.filter((l) => __audioIds.has(l.id)).map((l) => l.name).slice(0, 6)
      opts.log('① 音频响应型美术层豁免 hideUI：' + __audioIds.size + ' 层（' + names.join(' / ') + '）')
    }
    if (opts.log && opts.hideAudioArt === true) opts.log('① 音频美术层豁免被显式关闭（opts.hideAudioArt=true）')
  }
  // 6) 父组纯色遮罩条默认隐藏（①2026-09-21：音频美术层豁免 —— 可视化条自己就是这种遮罩层）
  if (hideBars) for (const l of scene.layers) {
    if (__audioIds.has(l.id)) continue
    if (l.parent !== undefined && l.solid && l.image && l.image.indexOf('models/util/solidlayer') === 0) l.visible = false
  }
  return scene
}

// 从对象模型解析材质链：object.image → models/x.json → materials/y.json → passes
export function resolveMaterial(modelJson) {
  if (!modelJson || typeof modelJson.material !== 'string') return null
  return {
    materialPath: modelJson.material,
    autosize: !!modelJson.autosize,
    cropoffset: modelJson.cropoffset ? parseVec2(modelJson.cropoffset) : null,
  }
}

// ===== src/scene/effects-parse.js =====
// 解析效果的 material 链：effects/<name>/effect.json → materials/effects/*.json 的 passes
// 产出 layer.effects[i] 的 { materialPasses, fbos, binds }，供通用 pass 管线使用。

// pkg: parsePkg 结果；effect: scene.json 的效果条目（file/passes/visible）
export function resolveEffectChain(pkg, effect, readText) {
  const entry = getEntry(pkg, effect.file)
  if (entry === null) return
  let ej
  try {
    ej = JSON.parse(readText(entry))
  } catch (e) {
    return
  }
  effect.fbos = ej.fbos || []
  effect.commands = []
  let compose = false
  effect.materialPasses = []
  for (const p of (ej.passes || [])) {
    if (!p.material) {
      // WER-ALIGN C8（wer-ref WPEffect.cpp:200-208）：无 material 的 command pass
      // 不进 materialPasses，单独存 commands，afterpos=当前 material pass 数（官方语义：
      // 在第 afterpos 个 pass 前执行，WESceneRenderPlanBuilder.cpp:216-233）
      if (p.command) {
        effect.commands.push({
          command: p.command,
          source: p.source || null,
          target: p.target || null,
          afterpos: effect.materialPasses.length,
        })
        continue
      }
      continue // 既无 material 又无 command：官方 LOG_ERROR 并失败（WPEffect.cpp:209-210）
    }
    if (p.compose) compose = true
    const me = getEntry(pkg, p.material)
    if (me === null) {
      effect.materialPasses.push({ shader: null, copyCommand: false, target: p.target || null, binds: p.bind || [], blending: 'normal', textures: [], combos: {}, constants: {} })
      continue
    }
    const mj = JSON.parse(readText(me))
    const mp = (mj.passes && mj.passes[0]) || {}
    effect.materialPasses.push({
      shader: mp.shader || null,
      copyCommand: false,
      target: p.target || null,
      binds: p.bind || [],
      blending: mp.blending || 'normal',
      textures: mp.textures || [],
      combos: mp.combos || {},
      constants: mp.constantshadervalues || {},
    })
  }
  // WER-ALIGN C9（wer-ref WPEffect.cpp:222-236）：compose:true → 自动追加
  // _rt_FullCompoBuffer1 FBO；pass0.bind[previous→槽0] 且 target=该 FBO；pass1.bind[该 FBO→槽0]。
  if (compose && effect.materialPasses.length === 2) {
    if (!effect.fbos.some((f) => f.name === '_rt_FullCompoBuffer1')) {
      effect.fbos.push({ name: '_rt_FullCompoBuffer1', scale: 1, fit: 0 })
    }
    const p0 = effect.materialPasses[0]
    const p1 = effect.materialPasses[1]
    p0.binds = (p0.binds || []).concat([{ index: 0, name: 'previous' }])
    p0.target = '_rt_FullCompoBuffer1'
    p1.binds = (p1.binds || []).concat([{ index: 0, name: '_rt_FullCompoBuffer1' }])
  }
}

// 内置模型（pkg 内没有 models/util/*）：返回内置 material 路径或 null
export const BUILTIN_MODELS = {
  'models/util/solidlayer.json': { material: 'materials/util/solidlayer.json' },
  // 分组容器（parse 已标 isContainer 不渲染）与整屏后处理层：pkg 通常不打包这两个内置模型，
  // 提供内置 material 避免“缺 model/material”报错；内容透明，效果仍会执行
  'models/util/composelayer.json': { material: 'materials/util/composelayer.json' },
  'models/util/fullscreenlayer.json': { material: 'materials/util/fullscreenlayer.json' },
}

// 内置 material（pkg 内没有 materials/util/*）：返回 passes 定义或 null
export const BUILTIN_MATERIALS = {

  'materials/util/solidlayer.json': {
    passes: [{ shader: 'flat', blending: 'translucent', cullmode: 'nocull', depthtest: 'disabled', depthwrite: 'disabled', textures: [], combos: {} }],
  },
  'materials/util/composelayer.json': {
    passes: [{ shader: 'flat', blending: 'translucent', cullmode: 'nocull', depthtest: 'disabled', depthwrite: 'disabled', textures: [], combos: {} }],
  },
  'materials/util/fullscreenlayer.json': {
    passes: [{ shader: 'flat', blending: 'translucent', cullmode: 'nocull', depthtest: 'disabled', depthwrite: 'disabled', textures: [], combos: {} }],
  },
}
export function resolveBuiltin(path) {
  if (!path) return null
  if (BUILTIN_MODELS[path]) return { kind: 'model', value: BUILTIN_MODELS[path] }
  if (BUILTIN_MATERIALS[path]) return { kind: 'material', value: BUILTIN_MATERIALS[path] }
  for (const k of Object.keys(BUILTIN_MODELS)) {
    const base = k.slice(0, -'.json'.length)
    if (path.startsWith(base) && path.endsWith('.json')) return { kind: 'model', value: BUILTIN_MODELS[k] }
  }
  for (const k of Object.keys(BUILTIN_MATERIALS)) {
    const base = k.slice(0, -'.json'.length)
    if (path.startsWith(base) && path.endsWith('.json')) return { kind: 'material', value: BUILTIN_MATERIALS[k] }
  }
  return null
}

// ===== src/render/math.js =====
// 最小 4x4 矩阵库（列主序，与 WebGL 一致）
export function mat4Identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
}

export function mat4Multiply(a, b) {
  const out = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]
      out[c * 4 + r] = s
    }
  }
  return out
}

// 正交投影（世界 y 向下：top=0, bottom=height）
export function mat4Ortho(left, right, top, bottom, near, far) {
  const out = mat4Identity()
  out[0] = 2 / (right - left)
  out[5] = 2 / (bottom - top)
  out[10] = -2 / (far - near)
  out[12] = -(right + left) / (right - left)
  out[13] = -(bottom + top) / (bottom - top)
  out[14] = -(far + near) / (far - near)
  return out
}

// ①(P-107) 透视投影（与 glMatrix `perspective` 逐式同构：右手系、相机看 −z ⇒ `clip.w = −z_view`，
//   所以**可见点的 z_view 必须为负**）。必须与 `mat4LookAt` 同约定（同一套列主序行=基向量的布局），
//   否则把 view 与 proj 乘起来会得到一个"斜"的相机。`?projmode=persp` / 非正交包（无
//   `general.orthogonalprojection`）时由 `buildCamera` 消费，见那里的"透视档"一节。
//   参数：fovy=垂直视场角（弧度）、aspect=宽/高、near/far=视空间 z 的裁剪距离（正数、near<far）。
export function mat4Perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2)
  const nf = 1 / (near - far)
  const out = mat4Identity()
  out[0] = f / aspect
  out[5] = f
  out[10] = (far + near) * nf
  out[11] = -1
  out[14] = 2 * far * near * nf
  out[15] = 0
  return out
}

export function mat4Translate(m, x, y, z) {
  return mat4Multiply(m, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]))
}

export function mat4Scale(m, sx, sy, sz) {
  return mat4Multiply(m, new Float32Array([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1]))
}

export function mat4RotateZ(m, rad) {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return mat4Multiply(m, new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]))
}

export function mat4LookAt(eye, center, up) {
  const z = normalize([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]])
  const x = normalize(cross(up, z))
  const y = cross(z, x)
  const out = new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, 0, 0, 0, 1])
  out[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2])
  out[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2])
  out[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2])
  return out
}

export function mat4TransformPoint(m, x, y, z) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15]
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ]
}

// 场景默认相机（WE 2D 约定：世界坐标 = 像素，y 向下）
// 注意：2D 正交场景渲染时忽略 scene.json 的 eye/center/up（那是编辑器最后保存的相机状态，运行时不用），使用固定相机
// WER-ALIGN B1/B2（wer-ref VulkanRender.cpp:1531-1576 UpdateCameraFillMode + WESceneRuntimeDriver.cpp:681）：
// 官方默认 fillmode = ASPECTCROP（cover：画布更宽→保设计宽裁设计高；更窄→保设计高扩设计宽），
// ①(P-69 2026-09-15) 投影 y 轴口径开关（见 buildCamera 内注释）。
//   默认 **fix**：世界 y-down（y=0 → 屏幕顶），与 parseScene 的 `PROJ_H − y`、MESH_VERT 的
//   `1 − wpos.y*2/u_Proj.y`、以及 CPU 预览 preview.mjs 的 `orthoYDown` 四处同口径。
//   `?projy=legacy`（别名 `?parenty=legacy`）逐位回到旧的镜像口径做 A/B。
//   测试可用 `setProjectionYFix(true|false)` 强制；传 null/undefined 恢复按 URL 判定。
let __projYMode = null
export function setProjectionYFix(on) { __projYMode = (on === undefined || on === null) ? null : !!on; return projectionYFix() }
export function projectionYFix() {
  if (__projYMode === null) {
    let legacy = false
    try {
      const q = new URLSearchParams(location.search)
      legacy = (q.get('projy') === 'legacy') || (q.get('parenty') === 'legacy')
    } catch (e) { /* 无 location（Node 测试）→ 默认 fix */ }
    __projYMode = !legacy
  }
  return __projYMode
}

// 再除以 general.zoom（缺省 1）。16:9 设计 + 16:9 画布时与旧实现（STRETCH）数值完全一致。
// STRETCH/ASPECTFIT/CENTER 分支与官方逐式同构；zoom≤0 时官方回退 1（Scene.cpp:202-209）。
export function buildCamera(scene, width, height, opts = null) {
  const general = scene.general
  const cam = scene.camera
  const eyeV = cam && cam.eye ? parseVec(cam.eye) : [0, 0, 0]
  const centerV = cam && cam.center ? parseVec(cam.center) : [0, 0, -1]
  const upV = cam && cam.up ? parseVec(cam.up) : [0, 1, 0]
  const isOrtho = !general || general.orthogonalprojection || !general.fov
  // ①(MERGED-1 D 相机节点 2026-09-12) 节点相机姿态（opts.cameraPose = {x,y,zoom}，调用方逐帧采样）：
  //   第三方参考实现的 SceneCamera（wer-ref SceneCamera.cpp:103-105）= Ortho(±framed/2z) · inverse(节点帧)，
  //   节点平移=(ortho/2+origin)（Scene.cpp:542-552）→ 展开到我们 y-down 0..W 顶点空间：
  //   **view = 平移(−origin.x, +origin.y)**（窗口仍居中画布中心）——与 elysia _viewShift 的
  //   (−eye.x, +eye.y)·ps 一致。zoom 替换 general.zoom（第三方参考实现 wer-ref UpdateActiveCameraLayer：活动相机层
  //   zoom 覆盖 defaultGlobalCameraZoom；无效值回退 general.zoom，elysia camera.js :186-189 同式）。
  //   满幅背景层豁免平移（elysia _viewShift isBg=size≥ortho−1，sf32/sf33 与官方预览逐帧核对），
  //   经 viewBg（恒等）在渲染循环按层选择；zoom 窗口对所有层生效（与 elysia 一致）。
  const pose = opts && opts.cameraPose && typeof opts.cameraPose === 'object' ? opts.cameraPose : null
  // ①(P-107) 投影档（`?projmode=`，见 projModeFrom 的注释）：`auto` 缺省 ⇒ 有正交矩形走正交（逐位不变），
  //   **没有矩形且声明了 `general.fov`**（= 旧 `isOrtho` 谓词取反，正是"3D 场景"的判据）才走下面的透视档。
  //   `ortho` 恒逐位回退、`persp` 强制透视（A/B：z=0 平面与正交档只差 Float32 舍入）。
  const projMode = resolveProjMode(opts && opts.proj,
    (typeof window !== 'undefined' && window) ? window.__mpwProjMode : undefined, PROJMODE)
  const orthoRect = (general && general.orthogonalprojection && Number(general.orthogonalprojection.width) > 0)
    ? general.orthogonalprojection : null
  const wantPersp = (projMode === 'persp')
    || (projMode === 'auto' && !orthoRect && !!(general && general.fov))
  let view = isOrtho ? mat4Identity() : mat4LookAt(eyeV, centerV, upV)
  let viewBg = view
  let nodeZoom = null
  if (pose) {
    const pz = (typeof pose.zoom === 'number' && isFinite(pose.zoom) && pose.zoom > 0.0001) ? pose.zoom : null
    nodeZoom = pz
    view = mat4Translate(mat4Identity(), -pose.x, pose.y, 0)
    viewBg = mat4Identity()
  }
  const sw = general && general.orthogonalprojection ? general.orthogonalprojection.width || width : width
  const sh = general && general.orthogonalprojection ? general.orthogonalprojection.height || height : height
  // 取景窗口：默认 ASPECTCROP（与 wer-ref 帧循环 FillMode 默认一致）
  // ①(WER-ALIGN B1 补全 2026-09-14) 四分支齐备：fillmode 可由 scene.general.fillmode /
  //   opts.fillmode 显式指定（官方是宿主侧设置，scene.json 语料 0 次出现 → 缺省恒 ASPECTCROP）：
  //   STRETCH=(sw,sh)；ASPECTFIT=窗口≥场景（留边）；ASPECTCROP=窗口≤场景（裁边）；CENTER=窗口=输出像素（1:1）。
  let framedW = sw
  let framedH = sh
  if (width > 0 && height > 0) {
    const fboAspect = width / height
    const sAspect = sw / sh
    const zoom = nodeZoom || ((typeof general.zoom === 'number' && general.zoom > 0.0001) ? general.zoom : 1)
    const fmRaw = String((opts && opts.fillmode) || general.fillmode || 'aspectcrop').toLowerCase()
    const fitLike = (fboAspect < sAspect) // 输出更"高"（更窄）
    if (fmRaw === 'stretch') {
      framedW = sw; framedH = sh
    } else if (fmRaw === 'aspectfit') {
      // contain：窗口包住场景（任一维扩展到 ≥ 场景）
      if (fboAspect < sAspect) { framedW = sw; framedH = sw / fboAspect }
      else { framedW = sh * fboAspect; framedH = sh }
    } else if (fmRaw === 'center') {
      // wer-ref VulkanRender.cpp:1564-1570：framed = 输出尺寸（1 场景单位 = 1 输出像素）
      framedW = width; framedH = height
    } else {
      // ASPECTCROP（默认）：cover：窗口 ≤ 场景（裁边）
      if (fitLike) { framedW = sh * fboAspect; framedH = sh }
      else { framedW = sw; framedH = sw / fboAspect }
    }
    framedW = Math.max(1, framedW / zoom)
    framedH = Math.max(1, framedH / zoom)
  }
  // 世界 y 向下：y=0 → NDC +1（屏幕顶）。
  // ①(P-69 根因，2026-09-15) **旧实现把 framed 窗口的 top/bottom 传反了**：
  //   `mat4Ortho(left,right,top,bottom,…)` 的形参名是 (…,top,bottom)，内部公式却是 glMatrix 的
  //   `out[5]=2/(bottom−top)`、`out[13]=−(bottom+top)/(bottom−top)`（即第 3/4 个实参是 bottom/top）。
  //   传 (cy−fh/2, cy+fh/2) → out[5]=+2/fh、out[13]=−1 → clip_y = 2y/fh − 1 ⇒ **世界 y=0 → NDC −1
  //   （屏幕底）**，与"y-down"注释正好相反。GL 里 NDC y=+1 才是视口顶 ⇒ 所有走 viewProj 的
  //   **四边形层 / 粒子层都绕屏幕水平中线镜像**（花朵 cy=1640.55 画到 519.45、钢琴 1053→1107、
  //   背景 1080→1080 看不出来）。蒙皮层不受影响（MESH_VERT 自己算 `1 − wpos.y*2/u_Proj.y`，
  //   本来就是 y-down ⇒ 人物一直是对的，这正是"只有部分层看着不对"的原因）。
  //   现在与 MESH_VERT 同式：clip_y = 1 − 2y/fh。`?projy=legacy`（别名 `?parenty=legacy`）回到旧口径。
  const projW = sw
  const projH = sh
  const cx = projW / 2, cy = projH / 2
  let projection = projectionYFix()
    ? mat4Ortho(cx - framedW / 2, cx + framedW / 2, cy + framedH / 2, cy - framedH / 2, -10000, 10000)
    : mat4Ortho(cx - framedW / 2, cx + framedW / 2, cy - framedH / 2, cy + framedH / 2, -10000, 10000)
  // ── ①(P-107) 透视档（`?projmode=persp`，或缺省 auto 且**无正交矩形**；只在这里替换 view/projection）──
  //   为什么要有：`general.fov` 此前**没有落点**（buildCamera 只构造 mat4Ortho）；`fov` 是 WE 相机层
  //   的运行时属性（与 `zoom`/`origin` 同级，官方按 camera target kind 路由 —— 见 P-81 的引注），
  //   只有"没有勾正交投影"的 3D 场景才真的用它。语料实证：`3509243656`（142 对象 / 8 模型 /
  //   4 粒子 / 59 图 / 53 文本）的 `general.orthogonalprojection = null` + 相机层 `fov =
  //   {"user":"newproperty71"}`（project.json 里该属性 text="视场"、min 40 max 65 step 0.1、默认 50）
  //   + 相机层 origin `0 0 6`（作者把相机放在 z=6，场景 z 跨 −50..+6）⇒ **它必须走透视**，否则
  //   96 个 z=0 层与 46 个 z≠0 层会被压成一个平面。
  //   两条锚定（这一处是唯一真值表；正交档不会执行到这里面任何一行）：
  //   ① **节点锚定**（3D 包）：`orthogonalprojection` 缺省/空 **且** 有相机节点、其原点 z 可用
  //      ⇒ 相机 = 节点 origin（x,y,z 就是世界坐标里的相机位置），朝 **−z** 看。
  //      ⚠ parseScene 把世界 y 翻成 `PROJ_H − 作者y`（2D 口径）⇒ 相机的 y 必须按**同一式子**搬
  //      （`ey = PROJ_H − origin.y`）才与图层同空间；屏幕仍是 y-down（`view_y = −(world_y − ey)`，
  //      即相机 up = 作者 +y），这样屏幕方向与正交档**同号**（不会上下镜像，贴图 v 也不会翻）。
  //      深度：`view_z = world_z − ez` ⇒ 可见 = z < ez（相机前方），w = ez − z = 距离。
  //   ② **帧平面锚定**（其余一切透视档，含把正交包强制成 persp 的 A/B）：相机钉在 (窗口中心, −d)、
  //      `d = (framedH/2)/tan(fovy/2)` ⇒ **z=0 平面逐位等于正交档**（近处 z<0 放大、远处 z>0 缩小）；
  //      zoom 已经进了 framedH ⇒ 帧平面锚定档**不再**乘 zoom（否则双重施加）。
  //   行为对照（非代码引用）：第三方参考实现对 2D 场景的 global_perspective 就是"相机 z=1000 +
  //      fov=atan(h/1000/2)×2"（h=设计画布高）——即"帧平面锚定 + 由画布高反推 fov"；我们保留作者写的
  //      fov、反过来求 d，是同一族口径（1080p/fov50 ⇒ d≈1158，与 1000 同量级，`dsOf` 粒子通路同源）。
  //   未定：`angles`（相机朝向）没接（语料唯一 3D 包 3509243656 相机无 angles）；蒙皮层（MESH_VS 走
  //      u_Proj/u_Framed）与粒子 CPU NDC 仍是各自旧通路 ⇒ 透视只作用于走 viewProj 的四边形层/粒子层。
  let projKind = 'ortho', projAnchor = null, fovYDeg = null, perspDist = 0
  if (wantPersp) {
    const cn = (scene && scene.cameraNode) ? scene.cameraNode : null
    const cStat = cn && cn.originRaw ? parseVec3(cn.originRaw) : null   // {script:{value}} → 静态快照（与图层同口径）
    const pz = (pose && typeof pose.z === 'number' && isFinite(pose.z)) ? pose.z : null
    const oz = pz !== null ? pz : (cStat ? cStat[2] : 0)
    const nodeAnchor = !!(!orthoRect && cn && cStat && isFinite(oz) && Math.abs(oz) > 1e-6)
    // fov 取值链：pose（关键帧动画）→ 用户属性绑定（面板"视场"滑块）→ 绑定原文静态值 → 相机节点值 → general.fov → 50
    const fovPick = [
      (pose && typeof pose.fov === 'number' && isFinite(pose.fov) && pose.fov > 0) ? pose.fov : null,
      (cn && typeof cn.fovFromUser === 'number' && isFinite(cn.fovFromUser) && cn.fovFromUser > 0) ? cn.fovFromUser : null,
      (cn && cn.fovRaw && typeof cn.fovRaw === 'object' && cn.fovRaw.value !== undefined
        && isFinite(Number(cn.fovRaw.value)) && Number(cn.fovRaw.value) > 0) ? Number(cn.fovRaw.value) : null,
      (cn && typeof cn.fov === 'number' && isFinite(cn.fov) && cn.fov > 0) ? cn.fov : null,
      (typeof general.fov === 'number' && isFinite(general.fov) && general.fov > 0) ? general.fov : null,
    ].find((v) => v !== null)
    fovYDeg = Math.min(179, Math.max(1, fovPick === undefined ? 50 : fovPick))
    const fovy = fovYDeg * Math.PI / 180
    const aspect = framedW / framedH   // 默认 ASPECTCROP 下 framed 窗口 = 画布本身 ⇒ 就是画布宽高比
    const near = (typeof general.nearz === 'number' && general.nearz > 0) ? general.nearz : 0.01
    const far = (typeof general.farz === 'number' && general.farz > near) ? general.farz : (near + 10000)
    if (nodeAnchor) {
      projAnchor = 'node'
      const ex = (pose && isFinite(pose.x)) ? pose.x : cStat[0]
      const ey0 = (pose && isFinite(pose.y)) ? pose.y : cStat[1]
      const C = (scene && typeof scene.projH === 'number') ? scene.projH : ((orthoRect && orthoRect.height) || 1080)
      const ey = C - ey0
      view = mat4Scale(mat4Translate(mat4Identity(), -ex, ey, -oz), 1, -1, 1)
      perspDist = oz
      projection = mat4Perspective(fovy, aspect, near, far)
      // zoom 在节点锚定档只能进投影（相机位置是作者定的）：与 elysia 透视分支同式 proj[0]/proj[5] × zoom
      const zoomN = nodeZoom || ((typeof general.zoom === 'number' && general.zoom > 0.0001) ? general.zoom : 1)
      if (zoomN !== 1) { projection[0] *= zoomN; projection[5] *= zoomN }
    } else {
      projAnchor = 'canvas'
      const d = (framedH / 2) / Math.tan(fovy / 2)
      const px = pose && isFinite(pose.x) ? pose.x : 0
      const py = pose && isFinite(pose.y) ? pose.y : 0
      view = mat4Scale(mat4Translate(mat4Identity(), -(cx + px), (cy - py), -d), 1, -1, -1)
      perspDist = d
      projection = mat4Perspective(fovy, aspect, near, far)   // zoom 已进 framedH/d ⇒ 不重复乘
    }
    viewBg = view      // 透视档不做"满幅背景层豁免平移"（那是 2D 场景的概念：世界即画布）
    projKind = 'persp'
  }
  // ①(P-100) 把"view 平移"与"取景窗口"显式回传：蒙皮层（MESH_VS 走 u_View/u_Framed）与宿主台账
  //   都要用与四边形层（viewProj）**同一份**相机参数，否则两条路各算一次必然漂移。
  //   viewX/viewY = T 的平移量（世界像素；无姿态时 0/0）；framedW/framedH = 取景窗口（= 设计画布 / zoom）。
  //   hasCameraNode = 场景里**有相机节点**（不看档位）：P-100 的"角色层兜底适配"只在无相机层时才允许。
  //   ①(P-107) 追加只读台账：projMode（解析后的档）/ projKind（正交|透视）/ projAnchor（canvas|node）/
  //   fovY（度）/ perspDist（帧平面锚定的 d 或节点锚定的相机 z；世界单位）—— 宿主、`?audit` 与测试
  //   都靠这几个字段回答"这一帧到底走没走透视、fov 是多少"。
  return {
    view, viewBg, projection, eye: eyeV, projW, projH, cameraPose: pose,
    viewX: pose ? -pose.x : 0, viewY: pose ? pose.y : 0,
    framedW, framedH, hasCameraNode: !!(scene && scene.cameraNode),
    projMode, projKind, projAnchor, fovY: fovYDeg, perspDist,
  }
}

function parseVec(s) {
  return String(s).trim().split(/\s+/).map(Number)
}

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

// ===== src/render/noise.js =====
// 可平铺双通道值噪声（近似 WE 内置 util/noise 的 RG 噪声，Phase 3 摆动/脉冲用）
export function generateNoiseTexture(size = 256, cellSize = 8) {
  const cells = size / cellSize
  const randA = mulberry32(1337)
  const randB = mulberry32(4242)
  const gridA = new Float32Array(cells * cells)
  const gridB = new Float32Array(cells * cells)
  for (let i = 0; i < cells * cells; i++) {
    gridA[i] = randA()
    gridB[i] = randB()
  }
  const rgba = new Uint8Array(size * size * 4)
  const cell = cellSize
  for (let y = 0; y < size; y++) {
    const cy = Math.floor(y / cell)
    const fy = (y % cell) / cell
    const sy = fy * fy * (3 - 2 * fy)
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell)
      const fx = (x % cell) / cell
      const sx = fx * fx * (3 - 2 * fx)
      const x0 = cx % cells
      const x1 = (cx + 1) % cells
      const y0 = cy % cells
      const y1 = (cy + 1) % cells
      const a00 = gridA[y0 * cells + x0]
      const a10 = gridA[y0 * cells + x1]
      const a01 = gridA[y1 * cells + x0]
      const a11 = gridA[y1 * cells + x1]
      const b00 = gridB[y0 * cells + x0]
      const b10 = gridB[y0 * cells + x1]
      const b01 = gridB[y1 * cells + x0]
      const b11 = gridB[y1 * cells + x1]
      const va = (a00 + (a10 - a00) * sx + (a01 - a00) * sy + (a00 - a10 - a01 + a11) * sx * sy)
      const vb = (b00 + (b10 - b00) * sx + (b01 - b00) * sy + (b00 - b10 - b01 + b11) * sx * sy)
      const o = (y * size + x) * 4
      rgba[o] = Math.round(va * 255)
      rgba[o + 1] = Math.round(vb * 255)
      rgba[o + 2] = 0
      rgba[o + 3] = 255
    }
  }
  return rgba
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ===== src/render/particles.js =====
// WE 粒子系统（port 自 elysia we-renderer/particles.js 的 installParticles mixin，
// 逻辑零改动，仅将依赖 this 的状态改为显式参数）。纯函数：解析 emitter/initializer/operator、
// 确定性 mulberry32 rng、逐帧模拟。绘制（WebGL2 光斑 quad）由 renderer 内 renderParticleLayer 使用。
// 注：build/spawn/apply* 全部使用 sys.rng（不再临时替换全局 Math.random），序列与参考实现一致。

// 粒子路径解析：'string'（pkg 路径）→ 经 readDef 读出 JSON；'object' → 内联 def
export function ensureParticleDef(particleVal, readDef) {
  if (particleVal == null) return null
  if (typeof particleVal === 'string') {
    if (typeof readDef !== 'function') return null
    return readDef(particleVal) || null
  }
  if (typeof particleVal === 'object') return particleVal
  return null
}

export function makeParticleRng(seedStr) {
  let seed = 0x9e3779b9
  const str = String(seedStr == null ? '' : seedStr)
  for (let i = 0; i < str.length; i++) seed = ((seed ^ str.charCodeAt(i)) * 16777619) >>> 0
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// elysia math.js getVal / parseVec3（带默认值）语义
function pGetVal(o, key, def) {
  const v = o && o[key]
  if (v == null) return def
  if (typeof v === 'object' && v !== null && 'value' in v) return v.value
  return v
}
function pVec3(s, def = [0, 0, 0]) {
  if (s == null) return def
  if (typeof s === 'number') return [s, s, s]
  if (Array.isArray(s)) return [s[0] ?? def[0], s[1] ?? def[1], s[2] ?? def[2]]
  const p = String(s).trim().split(/\s+/).map(Number)
  return [p[0] ?? def[0], p[1] ?? def[1], p[2] ?? def[2]]
}

// ═══════════════════════════════════════════════════════════════════════════════
// ①(P-131 批 D 2026-09-19) **音频驱动发射**（官方粒子编辑器的 *Audio response*）
//
// 语料：`audioprocessing*` **52 层 / 9 包**（`docs/PARTICLE-CORPUS-SCAN.md` §3-#5 的第 5 条）；
//   其中带 `audioprocessingmode > 0`（真正开着的）是 16 个 def / 3 个包（emitter + turbulence
//   operator + turbulentvelocityrandom initializer 三类组件）。旧实现**一个键都不读** ⇒ 速率按
//   常数 `rate` 发射、相位/速度完全不受音频影响（"应随音乐跳动"的 36 层星点是一条平线）。
//
// 官方语义（一手出处：`docs.wallpaperengine.io` 的 Particle Component - **Emitters / Initializers /
//   Operators** 三页的 "Audio response" 段落；缺省数字的另一处对照见 `docs/PATCHES.md` P-131）：
//     · **mode** = `None`(0) / `Left`(1) / `Right`(2) / `Center`(3)；"To enable the audio response
//       feature, first configure the mode." ⇒ 缺省 0 = 不调制（语料里 13 处全是 3 = Center）。
//     · **exponent** = 幂次（"By increasing this value, you will reduce how strongly low audio
//       volume will affect the emitter."）⇒ `env = t ** exponent`。
//     · **bounds** = 起止阈值（"the audio responsiveness will only take effect for volume levels
//       between 0.8 and 1"）⇒ `t = clamp((raw − b0)/(b1 − b0), 0, 1)`。
//     · **frequency min/max** = **16 段频谱下标 0..15**（"0 is bass sounds and 15 higher frequency
//       treble sounds"）⇒ 在 16 段活视图上取 `[min,max]` 闭区间的**均值**（均值 vs 峰值官方未写，
//       本实现取均值，列在 P-131 的未证实项）。
//     · **emitter**（原文）："Setting this to Center means that the particle system will be audio
//       responsive to the left and right audio channel at the same time. **The emitter will only be
//       active when audio is playing.**" ⇒ 发射率**乘性**门控（静音 ⇒ 不发射）。
//     · **turbulentvelocityrandom / turbulence**（原文）："The audio response feature adds a factor
//       to the **Phase** values of the particles … as this feature has no effect on particles with a
//       `0.00` phase." ⇒ 相位**乘性** `phase·(1+env)`（phase=0 的粒子不受影响 —— 这正是官方那句
//       "no effect on particles with a 0.00 phase" 的判据）。
//     · **vortex**（原文）："ties the particle speed to audio playback, causing the vortex to stop
//       spinning when no audio is being played." ⇒ 速度乘性 `speed·env`。
//   本文件按上述行为规格**独立实现**（包络算法在 `core/audio-band-array.mjs` 的 `audioEnvelope`）。
//
// 档位 `?audioemit=`：
//   · `auto`（**缺省**）= 有采集源（活视图 `hasSource=true`）⇒ 按官方语义调制；**没有采集源**
//     （渲染器侧没有系统声环回、插件侧 0 行采集）⇒ **保持旧行为不调制** + 记账/一次日志。
//     为什么不做"无源 ⇒ 一律按静音门控"：那会把 52 层（含 `0917/3299228616` 的 36 层星点）在
//     "我们本来就没有音频能力"的机器上**整片抹掉**（= 用户最初报的"壁纸少了几层"）；官方那 25 个
//     包在 `supportsaudioprocessing` 语境下**永远有音频源**，与我们的"无源"不是同一件事。
//   · `strict` = 没有采集源也照官方算（全 0 频段 ⇒ env=0 ⇒ 不发射）——复现官方的静音画面，
//     也是"注入固定频段"单变量对拍的另一半。
//   · `legacy`（或 `off`/`0`）= **完全不调制** = 批 D 之前的画面（逐位复现旧行为）。
// 数据入口：宿主（demo.html）每帧把 16 段左右的活视图原地写好，`setAudioBands(view)` 注入一次即可
//   （引用恒定、内容自更新）。没有注入 ⇒ 与旧行为逐位一致（这是所有既有 mock-GL/真包门禁的前提）。
// ═══════════════════════════════════════════════════════════════════════════════
const AUDIO_EMIT_MODE = (() => {
  try {
    if (typeof location !== 'undefined' && location.search) {
      const v = String(new URLSearchParams(location.search).get('audioemit') || '').trim().toLowerCase()
      if (v === 'legacy' || v === 'off' || v === '0') return 'legacy'
      if (v === 'strict') return 'strict'
    }
  } catch (e) { /* 无 location（node 测试）→ 默认 auto */ }
  return 'auto'
})()
/** 频段活视图（宿主注入；引用恒定、内容每帧原地更新）。null = 没有数据源 */
let AUDIO_BANDS_VIEW = null
/** "全 0 频段"的虚拟视图：`?audioemit=strict` 在没有数据源时按**静音**算包络（官方全 0 频谱 ⇒ env=0） */
const AUDIO_SILENT_VIEW = (() => {
  const v = { resolution: 16, left: new Float32Array(16), right: new Float32Array(16), average: new Float32Array(16), kind: 'silent', hasSource: false, revision: 0 }
  return v
})()
/** 是否已经有层因为"有音频响应但无采集源"被豁免过（只记一次日志用） */
let AUDIO_NO_SOURCE_LOGGED = false
let AUDIO_NO_SOURCE_HITS = 0

/** 注入音频频段活视图（幂等：宿主每帧只写数组内容，不必重复调用）。返回被接受的视图或 null。 */
export function setAudioBands(view) {
  AUDIO_BANDS_VIEW = (view && view.left && typeof view.left.length === 'number' && view.left.length) ? view : null
  return AUDIO_BANDS_VIEW
}
/** 只读诊断（真机上报/测试用；不复制数组）。 */
export function audioBandsInfo() {
  const v = AUDIO_BANDS_VIEW
  return {
    mode: AUDIO_EMIT_MODE, hasView: !!v, resolution: v ? v.left.length : 0,
    kind: v ? v.kind : null, hasSource: v ? !!v.hasSource : false, revision: v ? (v.revision | 0) : 0,
    noSourceHits: AUDIO_NO_SOURCE_HITS,
  }
}
/**
 * 某个粒子组件的音频包络：**`null` = 不做音频调制**（mode<=0 / 没有视图 / `?audioemit=legacy` /
 * auto 档且没有采集源 ⇒ 调用方保持旧算式），**数值 ∈ [0,1]** = 官方意义上的"当前音频响应量"
 * （0 = 有数据源但此刻静音 ⇒ 发射器不发射、涡旋不转）。
 * 三处作用方式（官方 docs 逐段原文见上）：emitter `rate·env`、turbulence/turbulentvelocityrandom
 * `phase·(1+env)`、vortex `speed·env`。`sys` 可选：给了就记账（渲染层汇总进粒子台账）。
 */
export function audioFactor(spec, sys) {
  if (!spec || !(spec.mode > 0) || AUDIO_EMIT_MODE === 'legacy') return null
  const view = AUDIO_BANDS_VIEW
  const hasSource = !!(view && view.hasSource)
  if (!hasSource && AUDIO_EMIT_MODE !== 'strict') {
    AUDIO_NO_SOURCE_HITS++
    if (sys) sys.audioNoSource = (sys.audioNoSource | 0) + 1
    return null
  }
  // strict 档且没有视图 ⇒ 用"全 0 频段"当输入（官方"没有声音 ⇒ 频谱全 0 ⇒ env=0 ⇒ 不发射"）
  const env = audioEnvelope(spec, view || AUDIO_SILENT_VIEW)
  if (env === null) return null
  if (sys) {
    sys.audioModulated = (sys.audioModulated | 0) + 1
    sys.audioLastEnv = env
  }
  return env
}
/** 该组件有没有开音频响应（`audioprocessingmode > 0`）——供"无源豁免"的一次性日志判断。 */
export function audioSpecOn(spec) { return !!(spec && spec.mode > 0) }

export function parseParticleEmitters(list, scale, angle) {
  return (list || []).map((e) => {
    const name = e.name || 'boxrandom'
    return {
      name,
      // ①(P-130 批A #3) 发射率缺省 = **5**（官方 `ParticleEmitter::rate { 5.0f }`；行为对照取自第三方
      //   参考实现，未反汇编官方二进制）。我们旧缺省 10 ⇒ 未写 `rate` 的 14 个 emitter / 8 包发射率翻倍。
      //   ⚠ 与 `renderParticleLayer` 的预算记账（rateMul 的 sumRate）必须**同改**，否则两边不一致。
      rate: e.rate || 5,
      instantaneous: e.instantaneous || 0,
      delay: e.delay || 0,
      duration: e.duration || 0,
      origin: pVec3(e.origin, [0, 0, 0]),
      directions: pVec3(e.directions, [1, 1, 0]),
      distanceMin: pVec3(e.distancemin, [0, 0, 0]),
      distanceMax: pVec3(e.distancemax, [256, 256, 0]),
      sign: pVec3(e.sign, [0, 0, 0]).map((x) => (typeof x === 'number' ? x : 0)),
      speedMin: e.speedmin || 0,
      speedMax: e.speedmax || 0,
      cone: e.cone || 0,
      controlPoint: e.controlpoint != null ? e.controlpoint : -1,
      flags: e.flags || 0,
      // ①(P-131 批 D) 官方音频响应（`audioprocessing*`，缺省数字按 emitter 一套）；null = 没开
      audio: parseAudioResponse(e, 'emitter'),
      scale, angle,
    }
  })
}
export function parseParticleInitializers(list) {
  // ①(P-131 批 D) initializer 上的音频响应（语料：`Stars_copy1.json` 的 initializer[4]，mode 3）
  return (list || []).map((i) => ({ name: i.name || '', params: i, audio: parseAudioResponse(i, 'operator') }))
}

// ═══════════════════════════════════════════════════════════════════════════════
// ①(P-144 2026-09-19) **`children`（子系 / 拖尾）全家族** —— 语料里"拖尾"的最大缺口。
//
// 规模（只读普查：`docs/PARTICLE-CORPUS-SCAN.md` §2.5 + 本轮复算 149 条逐条字段面）：
//   **76 个父层 / 21 个包 / 149 条子系**；type 分布 `eventfollow` 37、`static` 34、
//   `eventdeath` 30、`eventspawn` 8、**`type` 缺失 40（官方缺省 = `static`）**；
//   83 条子系的贴图在**包外**（`particle/halo`(34)、`particle/halo_4`(34)、`util/white`(10)、
//   `particle/beam/beam_1`(1)），63 条包内、3 条 def 本体取不到。用户最初抱怨的
//   「萤火虫没有拖尾」就是这条（`dd/3554161528` ln=22 id=4569「萤火虫」→ `firefliestrail`）。
//
// 官方语义（**只读行为结论**，出处逐条给出；GPL 参考实现只读、未复制任何代码/注释）：
//   · `type`：`references/wer-ref/src/backend/scene/internal/parser/WPSceneParser.cpp:1446-1460`
//     `ParseSpawnType`：**只识别** `eventfollow` / `eventspawn` / `eventdeath` 三个字符串，
//     其余（**含缺失**）= `STATIC`（缺省）。⇒ 我们这里"未知字符串"也回落到 `static`。
//   · 字段缺省：同文件 `:5778-5800` 的 `ChildData`：`maxcount 20`、`probability 1.0`、
//     `controlpointstartindex 0`；子系图层变换 = 子系自己的 `origin/scale/angles`。
//   · `static`（含缺省）：**一个常驻子系统**（`:5879-5888`：STATIC ⇒ 实例数 = 1，常驻发射）
//     —— 不是"预铺 maxcount 个实例"。
//   · `eventfollow`：跟随**父粒子**（`:5887-5893`：实例数 = `min(authored maxcount, 父系活粒子数)`；
//     `ParticleSystem.cpp:366-394`：锚点每帧取父粒子位置、父粒子死 ⇒ 实例死、`EVENT_FOLLOW`
//     死时清空粒子）。⇒ 父粒子飞行途中持续吐子系 = 拖尾/流星辉光。
//   · `eventspawn` / `eventdeath`：`:5894-5900` 各自保留 authored `maxcount` 作**实例上限**；
//     `ParticleSystem.cpp:414-449`：父粒子 `IsNew` ⇒ 给 EVENT_FOLLOW/EVENT_SPAWN 取一个新实例；
//     父粒子"刚死" ⇒ 给 EVENT_DEATH 取一个新实例（死亡那一帧在**父粒子位置**上吐一发）。
//   · `probability`：`ParticleSystem.cpp:311-323` `QueryNewInstance()`：**每个实例**取用前抽一次
//     `Random::get(0,1) <= probability`，不过就放弃（也不占 `maxcount` 名额）。
//   · `maxcount`：同处 `m_instances.size() < m_maxcount_instance` ⇒ **并发实例上限**。
//   · 锚点：`WPParticleRawGener.cpp:84`（`pos = inst->GetBoundedData().pos + p.position`）
//     ⇒ 子系粒子画在"父粒子位置 + 子系自己的局部位置"，即子系变换套在锚点**外围**。
//   · 子系贴图/材质：子系是一个**独立的粒子资产**（自己的 `def.material`），与父层同链解析。
//
// **我们的口径**（与官方不同处**逐条**写清；全部有门禁钉住）：
//   ① `static`/`eventfollow` 各只建**一个**子系系统（不是每父粒子一个实例）：本仓库
//      `spawnParticle` 出生即写**绝对世界坐标** ⇒ 原点一移，"新粒子在新位置出生、老粒子留在原地"
//      就是拖尾；`static` 的原点 = 父层变换 × 子系 authored origin（走照抄来的 `localToWorld`），
//      `eventfollow` 的原点每帧跟**父系最早出生的活粒子**（照抄来的 `leaderParticle`）。
//   ② `eventspawn`/`eventdeath`：父系在 `stepParticles` 里把"本步新生/本步死亡"的粒子位置记进
//      `sys.pSpawnEv` / `sys.pDeathEv`（**只记坐标、不抽随机数**），渲染子系时按 `probability`
//      门控制在那些位置各吐一发（每一发 = 子系 emitter 的 `instantaneous`，缺省 1 颗）。
//   ③ `maxcount` 折算：`static` = 子系 def 的 `maxcount`（1 个实例）；`eventfollow` = 子系
//      存活粒子数上限（一个实例 ≈ 一粒拖尾粒子）；`eventspawn/eventdeath` = **并发事件实例**
//      上限（每个事件实例 = 一发子粒子，存活期间占一个名额，粒子全死则名额回收）。
//   ④ `probability`：`eventspawn/eventdeath` 按**每个父粒子事件**抽一次；`static/eventfollow`
//      按**每帧一次发射许可**抽（≈ 发射率 × p）。`p >= 1` 与 `p <= 0` **不抽随机数**
//      （边界逐位可控）；抽取一律走**子系自己的 RNG**，父系 RNG 流一个数都不动。
//   ⑤ `controlpointstartindex`（缺省 0）：子系控制点 `i` 的"活"状态（`lockToPointer`）
//      继承父层控制点 `controlpointstartindex + i`；语料 149 条**全是缺省**（写了键的 50 条
//      值都是 `null`）⇒ 事实上零影响，见 `applyChildControlPointBase`。
//   ⑥ 子系 `def` / `material` / 贴图走**与父层同一条回退链**（包内 → `/weassist` → 预设 basename
//      索引）；贴图缺了**只跳该条子系**并打 `⚠ 缺纹理`，**父层与其余子系照画**（不许整层不画）。
//   ⑦ 档位 `?children=legacy` = **一条子系都不生成、一个随机数都不抽**（逐位回到改动前）。
//
// 递归：子系可以再挂子系（官方同构），深度上限 3（上游同一处的守卫 `scene-mount.ts:1458`）。
// ═══════════════════════════════════════════════════════════════════════════════

/** 官方 `ParseSpawnType` 认得的三类 + 缺省；未知字符串按官方语义回落到 `static`。 */
export const PARTICLE_CHILD_TYPES = ['static', 'eventfollow', 'eventspawn', 'eventdeath']

/** 子系 authored 字段的官方缺省（wer-ref `WPSceneParser.cpp:5778-5800` 的 `ChildData`）。 */
export const PARTICLE_CHILD_DEFAULTS = { maxcount: 20, probability: 1, controlpointstartindex: 0 }

function pNum(v, def) {
  const n = (v && typeof v === 'object' && 'value' in v) ? v.value : v
  if (n === null || n === undefined || n === '' || typeof n === 'boolean') return def
  const x = Number(n)
  return isFinite(x) ? x : def
}

/**
 * 解析 `def.children` → 子系规格数组（字段面 = 全语料 149 条实际出现的 **10 个键**：
 * `id/name/type/maxcount/probability/controlpointstartindex/origin/scale/angles/flags`；
 * 语料里**没有**任何 `emitter`/`rate`/`lifetime` 覆盖项 ⇒ 不存在"子系 emitter 覆盖"这回事）。
 */
export function parseParticleChildren(def) {
  const list = Array.isArray(def && def.children) ? def.children : []
  const out = []
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (!c || typeof c !== 'object' || typeof c.name !== 'string' || !c.name) continue
    const raw = (c.type === null || c.type === undefined || c.type === '') ? null : String(c.type)
    const type = (raw && PARTICLE_CHILD_TYPES.indexOf(raw) >= 0) ? raw : 'static'
    const pRaw = pNum(c.probability, PARTICLE_CHILD_DEFAULTS.probability)
    out.push({
      index: i,
      id: c.id !== undefined ? c.id : null,
      name: c.name,
      type,
      typeRaw: raw,
      // `maxcount` 缺省 20、至少 1（官方 `std::max<i32>(1, child_data.maxcount)`）
      maxCount: Math.max(1, Math.round(pNum(c.maxcount, PARTICLE_CHILD_DEFAULTS.maxcount))),
      // `probability` 缺省 1.0，钳到 [0,1]
      probability: Math.max(0, Math.min(1, pNum(c.probability, PARTICLE_CHILD_DEFAULTS.probability))),
      // `controlpointstartindex` 缺省 0
      cpStart: Math.max(0, Math.round(pNum(c.controlpointstartindex, PARTICLE_CHILD_DEFAULTS.controlpointstartindex))),
      // 子系自己的图层变换（叠加在父层变换上）
      origin: pVec3(c.origin, [0, 0, 0]),
      scale: pVec3(c.scale, [1, 1, 1]),
      angles: pVec3(c.angles, [0, 0, 0]),
      // 语料 51 条写了 `flags`（**值全是 null**）⇒ 官方语义未证实，只原样记下、不参与判断
      flags: c.flags === undefined ? null : c.flags,
      // 上游 `scene-mount.ts:1540-1544`：子系没有自己的 `instanceoverride` 时**继承父层**的
      // （否则"颜色滑块"只作用在父层上，子系永远不上色）。
      instanceoverride: (c.instanceoverride && typeof c.instanceoverride === 'object') ? c.instanceoverride : null,
    })
  }
  return out
}

/**
 * `controlpointstartindex` 的落地：把父层的"活控制点"状态（照抄块 E 的 `lockToPointer`）
 * 按基址搬到子系的控制点上。语料 149 条全是缺省 0 ⇒ 调用它前后**逐位不变**（门禁钉住）。
 *
 * @param {object} childSys 子系粒子系统（`buildParticleSystem` 建的）
 * @param {object|null} parentSys 父系粒子系统
 * @param {number} start `spec.cpStart`
 */
export function applyChildControlPointBase(childSys, parentSys, start) {
  const n = Math.max(0, Math.round(pNum(start, 0)))
  if (!n || !childSys || !Array.isArray(childSys.localControlPoints) || !parentSys || !Array.isArray(parentSys.localControlPoints)) return 0
  let hit = 0
  for (let i = 0; i < childSys.localControlPoints.length; i++) {
    const src = parentSys.localControlPoints[n + i]
    if (!src) break
    childSys.localControlPoints[i].lockToPointer = !!src.lockToPointer
    hit++
  }
  return hit
}

// ①(P-74 2026-09-15) **instanceoverride** —— 作者在**层**上对粒子资产做的实例覆写（倍率语义）。
//   一手依据（官方 .cpp/.h，逐条给出）：
//     · 字段表：wer-ref/.../wpscene/WPParticleObject.h:138-158 `ParticleInstanceoverride`
//       {enabled, alpha, count, lifetime, rate, speed, size, color, colorn, controlpointOffsets}，
//       全部**缺省 1.0**（= 不覆写）；解析 `WPParticleObject.cpp:116-141`（color→overColor、colorn→overColorn）。
//     · 作用点（wer-ref）：`ParticleInstanceoverride` 作为**追加 initializer** 在全部作者 initializer
//       之后执行 —— `WPSceneParser.cpp:1417-1428`（作者的 initializer 装载函数）（先跳过作者 colorrandom，
//       再 `AddInitializer(genOverrideInitOp(over))`），实现 `WPParticleParser.cpp:297-312`：
//         MutiplyInitLifeTime(p, over.lifetime) / MutiplyInitAlpha(p, over.alpha) /
//         MutiplyInitSize(p, over.size)     / MutiplyVelocity(p, over.speed) /
//         overColor → InitColor(p, color/255) ; overColorn → InitColor(p, colorn)
//       倍率定义（行为对照，仅记语义不引代码文本）：`ParticleModify.h:127` 速度倍率、`:165` 初速生命
//       倍率（同时改写 current 与 init）、`:169` 初速 alpha 倍率、`:173` 初速尺寸倍率。
//     · `size` 是**倍率**（不是绝对像素）：`ParticleSystem.h:148-151` 注释
//       "instanceoverride.size is a multiplier baked into each particle's initializer state"；
//       `ParticleSystem.cpp:168` `ApplyRuntimeSizeOverrideToNewParticle`（运行期改 size 用比例）。
//     · `count` → **发射率倍率**（解析期）：`WPSceneParser.cpp:1435-1440`（装载发射器时把 count 一并带入）
//       → `newEm.rate *= count`；REVERSE-FINDINGS-5.md:104 亦记"count 解析期乘 rate"。
//     · `rate` → **子系统仿真时钟倍率**（不只发射数）：`ParticleSystem.h:124-127` 注释 +
//       `ParticleSystem.cpp:329` 的帧步进口径（行为对照：每帧推进量 = 帧时长 × 该倍率）。
//     · `controlpointN` → 该层独立覆写控制点槽偏移：`WPParticleObject.cpp:130-140` +
//       `WPSceneParser.cpp:1375-1398`（该层的控制点覆写装载函数）。
//   语料实测（allwallpaper/dd 11 包 / 467 对象 / 49 粒子层 / 41 带 instanceoverride）：
//     size 27、count 19、colorn 15、alpha 15、rate 15、speed 12、lifetime 8、controlpoint1/2 各 1；
//     **color 0 例**（按官方头文件实现，见 PATCHES P-74 表）。
//   取值可为 `{user:"属性名", value:默认}`（作者面板绑定，语料 5 例）→ 走 resolveUserBinding。
export function resolveParticleOverride(raw, props, gated) {
  if (!raw || typeof raw !== 'object') return null
  const pick = (key) => {
    if (!(key in raw)) return null
    let v = raw[key]
    if (v && typeof v === 'object' && v.user !== undefined) {
      const name = typeof v.user === 'string' ? v.user : (v.user && v.user.name)
      if (gated && name && gated.has(name)) return null          // 门控关闭 → 不覆写（回落作者/资产值）
      const r = resolveUserBinding(v, props)
      v = (r && r.hasProp) ? (r.combo ? (r.matched ? 1 : 0) : r.value) : v.value
    }
    if (v && typeof v === 'object' && 'value' in v && v.user === undefined) v = v.value
    return v
  }
  const num = (key, def) => { const v = pick(key); if (v === null || v === undefined || v === '' || typeof v === 'boolean') return def; const n = Number(v); return isFinite(n) ? n : def }
  const vec = (key) => { const v = pick(key); if (v === null || v === undefined) return null; const p = strictVec(v, 3); return p }
  const colorn = vec('colorn')
  const color = vec('color')
  const cps = []
  for (let i = 0; i < 8; i++) { const v = vec('controlpoint' + i); if (v) cps[i] = v }
  const out = {
    enabled: true,
    size: num('size', 1), count: num('count', 1), alpha: num('alpha', 1),
    rate: num('rate', 1), speed: num('speed', 1), lifetime: num('lifetime', 1),
    colorn: colorn || null,
    // 官方 color 是**字节色**（0..255）→ InitColor(color/255)；colorn 已归一化
    color: color || null,
    overColorn: !!colorn, overColor: !!color,
    // 是否"替换颜色"：官方在解析期**跳过作者 colorrandom**（WPSceneParser.cpp:1419-1424）
    replacesColor: !!(colorn || color),
    controlpoints: cps.length ? cps : null,
  }
  return out
}
export function parseParticleOperators(list) {
  // ①(P-131 批 D) operator 上的音频响应（语料：`Star_Reactive.json` 的 operator[2] = turbulence，mode 3）
  return (list || []).map((op) => ({ name: op.name || '', params: op, audio: parseAudioResponse(op, 'operator') }))
}

// ①(P-65 2026-09-15 用户第 8/9/10 项) 粒子 renderer 家族与 trail 几何参数。
//   官方语义（全部有一手出处，不猜）：
//     · wer-ref/src/backend/scene/internal/parser/WPSceneParser.cpp:5915-5924 →
//       `g_RenderVar0 = {renderer.length, renderer.maxlength, 0, maxcount-1}`，且
//       combos THICKFORMAT=1 / TRAILRENDERER=1。
//     · official common_particles.h:41-50 ComputeParticleTrailTangents（spritetrail）：
//         right = normalize(cross(localVelocity, eyeDirection));
//         up    = normalize(localVelocity) * min(|localVelocity| * g_RenderVar0.x, g_RenderVar0.y);
//     · official common_particles.h:52-57 ComputeParticlePosition：
//         position = pos + size*right*(u-0.5) - size*up*(v-0.5)*textureRatio;
//       ⇒ 贴图 **u 横跨（垂直于速度）**、**v 沿速度**，v=0 在前进端。
//     · official genericropeparticle.vert（非 GS 分支）：rope/ropetrail 每段 4 顶点，
//       start=a_PositionVec4.xyz、end=a_TexCoordVec4.xyz、CP=a_TexCoordVec4C1.xyz，
//       right = normalize(cross(eyeDirection, trailDelta + CPStart)) * sizeStart，
//       v_TexCoord = (u 横跨, v 沿轨迹按段推进)。
//     · 缺省值：lwe-ref/.../ObjectParser.cpp:770 `lengthDefault = (name=="ropetrail") ? 1.0 : 0.05`；
//       REVERSE-FINDINGS-6.md:45 `maxlength` 缺省 10.0。
//     · REVERSE-FINDINGS-5.md:106「rope = live 粒子数组即样条控制点（Catmull-Rom 按 subdivision 细分，
//       按发射序 stable_sort）」⇒ rope 不按"每粒子一条历史"，而是把**存活粒子按出生序连成折线**。
export const PARTICLE_TRAIL_KINDS = { spritetrail: 1, rope: 1, ropetrail: 1 }
export function particleTrailCfg(def) {
  const raw = def && def.renderer
  const r = Array.isArray(raw) ? raw[0] : raw
  const name = (r && r.name) ? String(r.name) : 'sprite'
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d)
  return {
    name,
    trail: !!PARTICLE_TRAIL_KINDS[name],
    // g_RenderVar0.x / .y（只对 spritetrail 有意义的拉伸上限；rope/ropetrail 的 length 另有语义）
    length: num(r && r.length, name === 'ropetrail' ? 1.0 : 0.05),
    maxLength: num(r && r.maxlength, 10),
    // rope/ropetrail 的历史点数（官方 `segments`；REVERSE-FINDINGS-6 记 .z/.w 供 rope 段 UV）
    segments: (() => { const s = Math.round(num(r && r.segments, 0)); return s >= 2 ? Math.min(32, s) : 8 })(),
  }
}
// spritetrail 的沿速度拉伸倍率 = min(|V|·length, maxlength)（官方公式，逐字）。
export function spriteTrailStretch(speed, cfg) {
  if (!cfg) return 1
  const m = Math.min(Math.abs(speed) * cfg.length, cfg.maxLength)
  return (isFinite(m) && m > 0) ? m : 1
}

// ①(P-140 用户第 7 项 2026-09-19) 湍流初速场的**空间频率** `k`（单位 1/设计像素；相干长度 ≈ 1/k）。
//   ⚠⚠ **这是待标定量，不是官方值。** `docs/VAPOR-LAYER-3544152633.md` §6-1 记录：**三个参考实现
//   对 `scale`（`vapor1.json` 写 0.1）的量纲互相冲突** ——
//     · MIT oneincase/webwallgl：`noiseVec3(p.x*scale+offset, p.y*scale+offset, t+seed*phasemax)`（每像素域）；
//     · GPL lwe-ref：`curlNoise(p.position*0.1f + …)`，把 0.1 **硬编码**（同域）；
//     · GPL wer-ref：`CurlNoise` 走步（既不是"每像素"也不是"归一化"，是场自身的尺度）。
//   我们**没有**官方二进制/文档可对拍 ⇒ 相干长度只能"大到能消掉乱线"，具体值靠真机观感定。
//   缺省 `0.002` ≈ **500px 特征尺度**：取的是报告 §3.1-G 单变量反证里用过的那一档
//   （相干长度 ≳200px 就能让"发散长线"整条消失；200px 档与 500px 档读数同量级，见报告 §3.1-G 表）。
//   **真机对拍官方 `preview.gif` 后可调**：第一刀调相位/手性，第二刀才谈 `scale` 的真实量纲。
//   调法：k 调小 = 相干更长 = 更"整团"；k 调大 = 更碎 = 更接近改前的乱线（0.1 ≈ 10px 相干 ≈ 旧观感）。
export const PTURB_K = 0.002

// ctx: { origin, scale, angle, alphaMul, rateMul, maxCount, seedStr }
export function buildParticleSystem(def, ctx = {}) {
  const scale = ctx.scale || [1, 1, 1]
  const angle = ctx.angle || 0
  // ①(P-69 第 6 项) lockToPointer 控制点索引（见下方 pointerCp 注释）
  const pointerCp = (() => {
    const cps = (def && def.controlpoint) || []
    for (let i = 0; i < cps.length; i++) if (cps[i] && (Number(cps[i].flags) & 1)) return i
    return -1
  })()
  // 该发射器是否"挂在鼠标指针上"：① 显式 controlpoint == pointerCp；或
  //   ② 未显式指定（controlpoint<0，官方缺省=0）且本层有 `mapsequencearoundcontrolpoint`
  //   （该 initializer 的缺省控制点也是 0）⇒ 认定它跟随指针。
  const emittersOf = () => {
    const list = parseParticleEmitters(def && def.emitter, scale, angle)
    if (pointerCp < 0) return list
    const seqUsesCp0 = ((def && def.initializer) || []).some((it) => it && it.name === 'mapsequencearoundcontrolpoint'
      && (it.controlpoint == null || Number(it.controlpoint) === pointerCp))
    for (const em of list) {
      em.__ptrLocked = (em.controlPoint === pointerCp) || (em.controlPoint < 0 && seqUsesCp0)
    }
    return list
  }
  const sys = {
    def,
    origin: ctx.origin || [0, 0, 0],
    scale,
    angle,
    alphaMul: ctx.alphaMul != null ? ctx.alphaMul : 1,
    rateMul: ctx.rateMul != null ? ctx.rateMul : 1,
    // ①(RE-42) 第三方参考/wer-ref 守卫：maxcount 上限 20000（超出部分丢弃，而不是停止发射）
    // ①(MERGED-2 B) ctx.maxCount（?perf=auto 降级）优先于 def.maxcount —— 只降上限、发射器不停发；
    //   ctx 不传时与旧行为逐位一致。
    maxCount: Math.max(1, Math.min(ctx.maxCount != null ? ctx.maxCount : ((def && def.maxcount) || 100), 20000)),
    emitters: emittersOf(),
    initializers: parseParticleInitializers(def && def.initializer).filter((it) => !(ctx.instanceoverride && ctx.instanceoverride.replacesColor && it.name === 'colorrandom')),
    operators: parseParticleOperators(def && def.operator),
    // ①(P-74) instanceoverride（归一化）：
    //   · io.count  → 发射率倍率（wer-ref WPSceneParser.cpp:1435-1440）
    //   · io.rate   → 子系统仿真时钟倍率（wer-ref ParticleSystem.cpp:329）
    //   · io.size/lifetime/alpha/speed/color(n) → 出生期倍率（WPParticleParser.cpp:297-312）
    //   · replacesColor → 解析期跳过作者 colorrandom（WPSceneParser.cpp:1419-1424）
    io: ctx.instanceoverride || null,
    rateScale: (() => { const r = ctx.instanceoverride && ctx.instanceoverride.rate; return (typeof r === 'number' && isFinite(r) && r >= 0) ? r : 1 })(),
    // ①(P-74 ③) velocityrandom 的 y 口径（见 VY_MODE）
    vyLegacy: !!ctx.vyLegacy,
    // ①(P-126 C/D/F) 粒子算子口径（oscillatealpha 乘性 / oscillateposition 增量 / attract 判据 / turbulence mask）
    popsLegacy: !!ctx.popsLegacy,
    // ①(P-130 批A 跨批) **A 类颜色口径**档位（`?pcolor=legacy`）：回到 P-126 的颜色计算口径
    //   （`colorrandom` 缺 `max` 用旧归一化缺省 `[1,1,1]`、`colorchange` 用旧的"赋值"式）。
    //   颜色**照常上屏**（绘制通路不变）—— 否则 legacy 侧与 official 侧都是白点，真机无法对拍。
    pcolorLegacy: !!ctx.pcolorLegacy,
    // ①(P-103③/④) 本轮两个"出生期"档位：exponent 非线性分布、发射器 speedmin/speedmax 初速。
    //   不传（测试/第三方调用）⇒ false = 官方默认，与渲染器默认档一致。
    expLegacy: !!ctx.expLegacy,
    speedLegacy: !!ctx.speedLegacy,
    // ①(P-140 用户第 7 项) **湍流初速场口径**（`?pturb=legacy`）：true = 改前的"每颗粒子独立随机出生角"。
    //   不传（测试/第三方调用）⇒ false = official（方向是位置的函数），与渲染器默认档一致。
    pturbLegacy: !!ctx.pturbLegacy,
    countMul: (() => { const c = ctx.instanceoverride && ctx.instanceoverride.count; return (typeof c === 'number' && isFinite(c) && c >= 0) ? c : 1 })(),
    // ①(RE-20) 控制点：controlpointattract 的目标（offset 为层空间坐标）
    controlPoints: (def && def.controlpoint) || [],
    // ①(P-69 第 6 项) lockToPointer：`controlpoint[i].flags` bit0（=1）= 该控制点锁定鼠标指针。
    //   依据：hina 3554161528 的 `cherry blossoms on cursor`（id389）controlpoint[0].flags=1，
    //   名字/官方截图都要求"发射器跟着指针"；官方 W1.jpg 画面正中**没有**放射花瓣爆 ⇒ 无指针时
    //   该发射器不应发射。flag 的 bit 定义未见权威文档/Lua 绑定（lwe-ref/wer-ref 里 `controlpoint`
    //   只作为 attract 目标），故按 flags=1 推断并在此标注**未定**（?cursor=off 可整体关掉）。
    pointerCp,
    animMode: (def && def.animationmode) || '',
    seqMul: (def && def.sequencemultiplier) || 1,
    animFrames: def && def.animationmode === 'sequence' ? (def.sequencemultiplier || 1) : 0,
    starttime: (def && def.starttime) || 0,
    particles: [],
    acc: 0, count: 0,
    rng: makeParticleRng(ctx.seedStr),
    // ①(P-65) ropetrail 需要"每粒子一条位置历史"（官方 genericropeparticle 的段折线）。
    //   只有 ropetrail 才建历史：rope 用的是"存活粒子数组"本身（见 renderParticleLayer），
    //   sprite/spritetrail 完全不用 → 零额外开销、零行为变化。
    trail: (() => {
      const cfg = particleTrailCfg(def)
      if (cfg.name !== 'ropetrail') return null
      // 官方 semantics：length = 历史**时长(秒)**，segments = 采样点数（缺省 8，2..32）。
      const n = cfg.segments
      return { n, duration: cfg.length > 0 ? cfg.length : 0.2, dt: (cfg.length > 0 ? cfg.length : 0.2) / Math.max(1, n - 1) }
    })(),
  }
  // ①(P-136 用户第 4 项：照抄上游 MIT 实现) 上游 `particles.js:195-201` 把控制点编译成
  //   `{id, lockToPointer, offset, x, y, z}`（`locktopointer` 显式 true **或** `flags` bit0）；
  //   本仓库的 `controlPoints` 是 **raw def 数组**（`{flags, id, offset:"x y z"}`），被别处按
  //   作者空间直接读（attract 的非指针分支），**不能就地改**。这里另建一份上游形状的
  //   `localControlPoints` 专供照抄来的 `cpPos`/`cpWorld`。
  //   数据口径（不改上游算式）：上游局部空间是 **y 向上**，所以它把 authored `offset[1]` 原值存下；
  //   本仓库模拟/渲染都在 **y 向下**的世界设计坐标 ⇒ 这里把 `offset[1]` 取负存进来，
  //   `cpPos` 里那行 `pointerLocal.y + cp.offset[1]` 因此逐字可用。
  sys.localControlPoints = ((def && def.controlpoint) || []).filter(Boolean).map((cp) => {
    const off = pVec3(cp.offset, [0, 0, 0])
    return {
      id: Number(cp.id != null ? cp.id : 0),
      lockToPointer: !!cp.locktopointer || ((Number(cp.flags) || 0) & 1) !== 0,
      offset: [off[0], -off[1], off[2]],
    }
  })
  // ①(P-144 子系) `children` 规格 + 事件记录开关。
  //   · `?children=legacy` ⇒ `children` 恒为空数组、`pSpawnEv/pDeathEv` 恒 null
  //     ⇒ `stepParticles` 里那两个 `if (sys.pSpawnEv)` 一次都不进 ⇒ 父系 RNG/顶点流逐位不变。
  //   · `childDepth` = 子系嵌套深度（上游 `scene-mount.ts:1458` 同一守卫：>3 不再展开）。
  //   · 事件数组只在**真有该类子系**时存在（零成本原则：没有 children 的层连一个数组都不建）。
  sys.children = (ctx.childrenMode === 'legacy') ? [] : parseParticleChildren(def)
  sys.childrenMode = ctx.childrenMode === 'legacy' ? 'legacy' : 'official'
  sys.childDepth = (typeof ctx.childDepth === 'number' && ctx.childDepth > 0) ? ctx.childDepth : 0
  if (sys.children.length) {
    if (sys.children.some((c) => c.type === 'eventspawn')) sys.pSpawnEv = []
    if (sys.children.some((c) => c.type === 'eventdeath')) sys.pDeathEv = []
  }
  syncLayerTransform(sys, { origin: sys.origin, scale, angles: [0, 0, angle] })
  sys.pointerLocal = null       // 上游 `particles.js:197`：`this.pointer = null`（无指针 ⇒ 锁指针控制点为 null）
  return sys
}

// ①(P-136 用户第 4 项) 照抄上游后，本仓库**消费方**取控制点世界位置的一个入口。
//   · `__cpWorldLocked(sys, cpIdx)`：`cpIdx` 就是本层那个 lockToPointer 控制点（= 光标）时，
//     走**照抄来的** `cpWorld`（= 上游 `_cpPos` + 上游 `toWorld` 的复合）⇒ 控制点世界位置 = 光标 + authored offset。
//   · 否则返回 null，调用方**逐字沿用 P-69/P-133 的既有算法**（非指针控制点不在本次照抄范围内，
//     动它会改到 149 个语料系统里与"尾迹"无关的那些 —— 见 THIRD-PARTY.md §14.4）。
function __cpWorldLocked(sys, cpIdx) {
  const ptrCp = (typeof sys.pointerCp === 'number') ? sys.pointerCp : -1
  if (ptrCp < 0 || Number(cpIdx) !== ptrCp) return null
  const P = sys.pointer
  if (!P) {
    sys.pointerLocal = null; sys.__ptrLocalKey = null
    // ①(尾迹离开 2026-09-19) 本帧无活指针（离开窗口 / `inside:false` / `?cursor=off` / 失焦）：
    //   控制点**冻结在最后已知指针**上，而不是让调用方退化。
    //   为什么必须兜住：上游 `particles.js:1011` 的涡流写的是 `this._cpPos(v.cp) || [0, 0, 0]` ——
    //   无指针 ⇒ 圆心 = **系统原点**（本仓库 `sys.origin` = 图层原点，全屏尾迹层就是**画面中心**）；
    //   吸附算子的退化目标则是 authored `cp.offset` 当世界坐标用（= 画面左上角）。
    //   上游自己的宿主在离开时保留最后位置（`pointer.js` 的 `pushExternalLeave`），所以它走不到这两条；
    //   本仓库 P-118/P-121 的语义是「离开 ⇒ 无指针」⇒ 必须在这里兜住，否则尾迹会被**拽到画面中心**。
    //   从未有过指针（首帧 / `?cursor=off` 全程）⇒ 影子为空 ⇒ 保持旧行为（退化到层原点）。
    return shadowCpWorld(sys, Number(cpIdx))
  }
  // ①(P-136) 上游 `setPointer`（照抄）是局部指针的**唯一**写入路径；`sys.pointer` 仍是本仓库
  //   对外/对门禁的公共字段（世界设计坐标）。这里按坐标指纹做一次幂等同步（每帧每层一次，
  //   不是每颗粒子一次），保证"直接写 `sys.pointer` 的既有调用方（测试/门禁）"也走照抄来的通路。
  const key = P[0] + ',' + P[1]
  if (sys.__ptrLocalKey !== key) { setPointer(sys, P[0], P[1]); sys.__ptrLocalKey = key }
  return cpWorld(sys, Number(cpIdx))
}

export function simulateParticleSystem(sys, t, maxSteps) {
  const st = sys.starttime || 0
  if (sys._simulatedTo == null) sys._simulatedTo = 0
  let simT = sys._simulatedTo
  const target = Math.max(0, t - st)
  // ①(P-59 2026-09-14 用户第 2 项"两帧") 调用方可给**单帧步数上限**：渲染器每帧都是从 0 重放历史
  //   （system 逐帧重建，见 renderParticleLayer），旧实现固定 0.05s 步长 + guard 2000 → 每帧最多
  //   2000 次"全粒子更新"，且 guard 用尽后仍把 _simulatedTo 记成 target（= 100s 之后状态静默冻结）。
  //   传 maxSteps 时超出部分**放粗步长**（总时长不变、状态继续推进），默认（不传）= 旧行为逐位一致。
  const limit = (typeof maxSteps === 'number' && maxSteps > 0) ? Math.max(1, Math.floor(maxSteps)) : 2000
  const step = (typeof maxSteps === 'number' && maxSteps > 0) ? Math.max(0.05, (target - simT) / limit) : 0.05
  let guard = 0
  // ①(P-69) 返回本帧实际代价（步数 + 粒子更新次数），供 ?perf / 测试量化"改前→改后每帧粒子数"
  let updates = 0
  while (simT < target && guard < limit) {
    const dt = Math.min(step, target - simT)
    updates += (sys.particles ? sys.particles.length : 0)
    stepParticles(sys, dt, simT)
    simT += dt
    guard++
  }
  sys._simulatedTo = target
  return { steps: guard, updates, alive: sys.particles ? sys.particles.length : 0 }
}

export function stepParticles(sys, dt, simT) {
  // ①(P-74) instanceoverride.rate = **子系统仿真时钟**倍率（wer-ref ParticleSystem.cpp:329
  //   `simulationTime = frameTime * m_rate`）：发射累积、年龄衰减、全部算子都用 sdt；
  //   rateScale=1（无 override / rate=1）时 sdt===dt ⇒ 与改动前逐位一致。
  const rateScale = (typeof sys.rateScale === 'number' && isFinite(sys.rateScale) && sys.rateScale >= 0) ? sys.rateScale : 1
  const sdt = dt * rateScale
  const scaledT = (sys._scaledT = (sys._scaledT || 0) + sdt)
  for (const em of sys.emitters) {
    if (em.delay > 0 && simT < em.delay) continue
    let toEmit = 0
    if (em.instantaneous > 0 && !em._emitted) {
      toEmit = em.instantaneous
      em._emitted = true
    }
    // ①(P-131 批 D) 音频驱动发射：官方 "The emitter will only be active when audio is playing."
    //   ⇒ 本步的有效发射率 = `rate × env`（env=1 时逐位等于旧算式；没有频段视图/mode=0/legacy 档
    //   时 audioFactor 返回 null ⇒ 系数 1 ⇒ 既有门禁与真包数字一字不变）。
    const __env = audioFactor(em.audio, sys)
    const audioK = __env === null ? 1 : __env
    em.audioLastEnv = audioK
    // ①(P-74) instanceoverride.count 解析期乘 rate（wer-ref WPSceneParser.cpp:1435-1440）
    sys.acc += sdt * em.rate * audioK * sys.rateMul * ((typeof sys.countMul === 'number' && isFinite(sys.countMul)) ? sys.countMul : 1)
    toEmit += Math.floor(sys.acc)
    sys.acc -= Math.floor(sys.acc)
    // ①(P-144 子系 `probability`) 子系（`static`/`eventfollow`）的**每步发射许可**：
    //   调用方（`renderParticleLayer` 的子系准备）每步先抽一次子系自己的 RNG 写进
    //   `sys.__emitGate`；父系从不设它（`undefined`）⇒ 这个 `if` 对父系是空操作、
    //   对 `?children=legacy` 也是空操作（逐位不变）。`false` = 本步不发（年龄/算子照跑）。
    if (sys.__emitGate !== false) {
      const cap = em.flags & 2 ? 1 : toEmit
      for (let k = 0; k < cap && sys.count < sys.maxCount; k++) {
        const p = spawnParticle(sys, em)
        if (!p) break            // ①(P-69) lockToPointer 发射器无指针信息 → 本步不发射
        sys.particles.push(p)
        sys.count++
        // ①(P-144 子系 `eventspawn`) 新生那一帧把**出生位置**记下（只记坐标、不抽随机数）
        if (sys.pSpawnEv) __pushParticleEvent(sys.pSpawnEv, p.pos)
      }
    }
  }
  for (const p of sys.particles) p.age += sdt
  for (const op of sys.operators) applyOperator(sys, op, sdt, scaledT)
  // ①(P-65) ropetrail 历史采样：位置在算子跑完后才定稿（movement 在算子序列里改 pos），
  //   所以采样必须放在这里。每步最多采 1 个点，间隔 = length/(segments-1)（官方 rope 段 UV 口径）；
  //   步长被预算放粗时（simulateParticleSystem 的 maxSteps 分支）历史会稀一些，但不丢点、不倒退。
  if (sys.trail) {
    for (const p of sys.particles) {
      if (!p.trail) p.trail = []
      if (p.trail.length === 0) { p.trail.push([p.pos[0], p.pos[1], p.pos[2]]); p.trailT = scaledT }
      else if (scaledT - (p.trailT || 0) >= sys.trail.dt) {
        p.trail.push([p.pos[0], p.pos[1], p.pos[2]])
        p.trailT = scaledT
        if (p.trail.length > sys.trail.n) p.trail.shift()
      }
    }
  }
  // 移除死亡（参考实现用 p.lifetime 恒为 undefined 不回收，属疏漏；此处用 p.life）。
  // 回收时递减 count：否则 count 触顶后不再发射（连续发射器（尘埃/光束）会在首批死后变空）。
  for (let i = sys.particles.length - 1; i >= 0; i--) {
    if (sys.particles[i].age >= sys.particles[i].life) {
      // ①(P-144 子系 `eventdeath`) 死亡那一帧把**死亡位置**记下（只记坐标，**不抽随机数**
      //   ⇒ 父系 RNG 流与 `?children=legacy` 逐位一致）；子系渲染时在这些位置各吐一发。
      if (sys.pDeathEv) __pushParticleEvent(sys.pDeathEv, sys.particles[i].pos)
      sys.particles.splice(i, 1)
      sys.count--
    }
  }
}

/**
 * ①(P-144) 父系事件位置入队（`eventspawn`/`eventdeath` 子系用）。
 * 只 push 三个浮点数，**不消耗任何随机数**；容量上限 512（超出丢最老的）——
 * `?psim=replay` 档下每帧会重放整段历史，不设上限会积到几十万条。
 */
function __pushParticleEvent(arr, pos) {
  if (arr.length >= 512) arr.shift()
  arr.push([pos[0], pos[1], pos[2] || 0])
}

// 发射一个粒子：pos = 世界（设计像素，y 向下）；scenePos = 编辑器 y-up 局部（供 operator 用）
// ①(P-133 #3) `mapsequencearoundcontrolpoint` 的求解上下文。
//   语义（**行为对照**：MIT 的 oneincase/webwallgl `renderer/vendor/we-scene/render/particles.js:828-850`
//   的 `mapAround` 段 + 同文件 :368-376 的解析；本实现按该行为规格独立书写，未复制其代码/注释）：
//     · 位置 = **控制点当前位置** + (cos θ, sin θ)·rad，θ = bounds[0] + (bounds[1]−bounds[0])·((i mod count)/count)，
//       rad = 发射器第一轴距离（`distancemax[0]` > 0 用它，否则 `distancemin[0]`）——**替换**发射器随机偏移，
//       而不是叠加；轮转序号 i 每发射一颗粒子 +1（跨步骤、跨发射器共用）。
//     · 速度 = 逐轴在 [speedmin, speedmax] 抽一次（**三个轴共用同一个随机数**，与参考实现同构）。
//   为什么必须有它：`Cherry_Blossoms_2.json`（hina 第 28 层"cherry blossoms on cursor"）**只靠这条**
//   initializer 给花瓣初速 `0 100 0` 与绕圈分布；不实现 ⇒ 花瓣原地堆在光标上（用户第 ③ 项"缩成一个球"）。
//   语料 6 份 def 用到它（全部是 workshop/2093672045 的 Cherry_Blossoms_2）。
//   ①(P-136 用户第 4 项：照抄上游 MIT 实现) 控制点当前位置改为走**照抄来的**上游 `_cpPos`
//   （`core/we-particle-pointer.mjs` 的 `cpPos`/`cpWorld` ← 上游 `particles.js:1154-1163` + `:1300-1305`），
//   圆周投放走**照抄来的** `mapSequenceAroundControlPoint`（← 上游 `:830-845`）。
//   与 P-133 独立实现的差别只有一处且是刻意的：投放半径 `rad` 现在按上游在**局部**空间算、
//   再经图层 scale 落到世界（P-133 是把 rad 直接当世界像素）。图层 scale=1 时两者逐位相同
//   （`Cherry_Blossoms_2` 的 scale 是 `1 1 5`，x/y 都是 1 ⇒ 本层零差异）。
function __mapAroundCtx(sys, em, wx, wy, wz) {
  const cps = sys.controlPoints || []
  let cp = cps.find((c) => Number(c && c.id) === Number(sys.pointerCp))
  if (!cp) cp = cps[0] || null
  let cx = wx, cy = wy, cz = wz
  // ①(P-136) 锁指针控制点（= 光标）世界位置：照抄来的 `cpPos` + `localToWorld`。
  //   上游局部空间是 y 向上，本仓库是 y 向下 ⇒ 圆周那一步在上游朝向（y-up）里算，
  //   结果再翻回 y-down 交 `localToWorld`（两处翻转互为逆，不等于"改了算式"）。
  const cpLockedWorld = (cp && em.__ptrLocked) ? __cpWorldLocked(sys, sys.pointerCp) : null
  const placement = cpLockedWorld ? (() => {
    const lo = cpPos(sys, Number(sys.pointerCp))
    return (i, count, bounds) => {
      const aroundYUp = [lo[0], -lo[1], lo[2]]                        // y-down 局部 → 上游朝向（y-up）
      const r = mapSequenceAroundControlPoint(aroundYUp, i, count, bounds,
        em.distanceMin ? em.distanceMin[0] : 0, em.distanceMax ? em.distanceMax[0] : 0)
      return localToWorld(sys, [r[0], -r[1], r[2]])                   // 上游朝向 → y-down 世界
    }
  })() : null
  if (placement) {
    cx = cpLockedWorld[0]; cy = cpLockedWorld[1]; cz = cpLockedWorld[2]
  } else if (cp) {
    const off = pVec3(cp.offset || cp.origin, [0, 0, 0])
    if (em.__ptrLocked) {
      // 锁指针的控制点：当前位置 = 指针（`sys.pointer`）、加 authored offset（层空间 ⇒ y 取反进世界）
      // ①(尾迹离开 2026-09-19) `sys.pointer` 为空时**不再回落到层原点**（原点 = 画面中心）：
      //   先用最后已知指针的影子。这一行当前不可达（`spawnParticle` 在无指针时提前 `return null`），
      //   属于同一类退化路径的**拆雷**：一旦将来放宽发射门，这里不会再把人拽到画面中央。
      const P = sys.pointer || pointerShadowWorld(sys) || [sys.origin[0], sys.origin[1]]
      cx = P[0] + off[0] * em.scale[0]
      cy = P[1] - off[1] * em.scale[1]
      cz = wz
    } else {
      cx = sys.origin[0] + off[0] * em.scale[0]
      cy = sys.origin[1] - off[1] * em.scale[1]
      cz = sys.origin[2] + off[2] * (em.scale[2] !== undefined ? em.scale[2] : 1)
    }
  }
  const rmin = em.distanceMin ? em.distanceMin[0] : 0
  const rmax = em.distanceMax ? em.distanceMax[0] : 0
  return { cx, cy, cz, radius: (rmax > 0 ? rmax : rmin) || 0, placement,
    originX0: sys.origin[0], originY0: sys.origin[1],
    nextIndex: () => (sys.__mapAroundSeq = (sys.__mapAroundSeq || 0) + 1) - 1 }
}
export function spawnParticle(sys, em) {
  const rng = sys.rng
  let px, py, pz
  // ①(RE-37 配套) 发射器第三维：官方 boxrandom/sphererandom 都是 3D，z 参与透视相机
  //   （flags&4 → global_perspective）。此前我们恒置 z=0 → 透视层退化成平面。
  //   sign[i]（发射器字段）：1=强制正、-1=强制负、0/缺省=随机翻转。
  const signOf = (i) => {
    const v = (em.sign && em.sign[i]) || 0
    if (v > 0) return 1
    if (v < 0) return -1
    return rng() < 0.5 ? -1 : 1
  }
  const randRange = (a, b) => (Math.min(a, b) + rng() * Math.abs(b - a))
  if (em.name === 'sphererandom') {
    const angle = rng() * Math.PI * 2
    const minR = em.distanceMin[0], maxR = em.distanceMax[0]
    const r = minR + rng() * (maxR - minR)
    const zr = em.distanceMin[2] !== undefined ? (em.distanceMin[2] + rng() * Math.abs((em.distanceMax[2] || 0) - em.distanceMin[2])) : r
    px = Math.cos(angle) * r * em.directions[0]
    py = Math.sin(angle) * r * em.directions[1]
    pz = (em.directions[2] ? signOf(2) * zr * em.directions[2] : signOf(2) * zr)
  } else {
    // boxrandom：每轴在 [distancemin, distancemax] 范围内随机距离 + sign 指定/随机翻转符号
    const rx = randRange(em.distanceMin[0], em.distanceMax[0])
    const ry = randRange(em.distanceMin[1], em.distanceMax[1])
    const rz = randRange(em.distanceMin[2] !== undefined ? em.distanceMin[2] : 0, em.distanceMax[2] !== undefined ? em.distanceMax[2] : 0)
    px = signOf(0) * rx * em.directions[0]
    py = signOf(1) * ry * em.directions[1]
    pz = signOf(2) * rz * (em.directions[2] !== undefined ? em.directions[2] : 1)
  }
  const cos = Math.cos(-em.angle), sin = Math.sin(-em.angle)
  const rpx = px * cos - py * sin
  const rpy = px * sin + py * cos
  // 世界坐标（设计像素，y 向下）：x 同向；y 经一次翻转（编辑器 y-up → 渲染 y-down）；z 同向
  // ①(P-69 第 6 项) lockToPointer 发射器：基准点换成**指针位置**（设计坐标，已是 y-down），
  //   而不是 layer.origin + em.origin。没有指针信息时**根本不发射**（`?cursor=off` 亦然）——
  //   官方 3554161528 截图（Testphoto/TP11/W1.jpg）画面正中没有任何放射花瓣爆；我们因为不实现
  //   `controlpoint[0].flags:1`，把发射器退化到 authored origin（=1920,1080 画布正中）⇒ 永久多出
  //   一个中心爆炸，也是这层 9 万次/帧粒子更新的来源。
  const __P = em.__ptrLocked ? sys.pointer : null
  if (em.__ptrLocked && !__P) { sys.__ptrSkipped = (sys.__ptrSkipped || 0) + 1; return null }
  const wz = em.origin[2] * (em.scale[2] !== undefined ? em.scale[2] : 1) + pz
  const wx = (em.__ptrLocked ? __P[0] : sys.origin[0] + em.origin[0] * em.scale[0]) + rpx * em.scale[0]
  const wy = (em.__ptrLocked ? __P[1] : sys.origin[1] - em.origin[1] * em.scale[1]) + rpy * em.scale[1]
  // ①(P-103④) 发射器 speedmin/speedmax：官方（MIT 对照 webwallgl particles.js:804-806）在出生时
  //   **沿"发射器基准点 → 出生点"方向**给一个初速 rand(speedmin,speedmax)。
  //   这里直接用**已经算好的世界偏移方向**，与位置同一个空间（不再引入第二次 y 翻转，
  //   避免与 P-74③ 已标定的 velocityrandom 口径打架）。偏移为 0（distancemax=0）时干净地不加初速。
  let vx0 = 0, vy0 = 0
  if (!sys.speedLegacy && (em.speedMax || em.speedMin)) {
    const ox = rpx * em.scale[0], oy = rpy * em.scale[1]
    const olen = Math.hypot(ox, oy)
    if (olen > 1e-6) {
      // 注意：这次 rng() 只在"该发射器真的写了两字段且档位为 official"时发生 ⇒ legacy 档的
      // 随机数流与 P-100 逐位一致（A/B 可比）。
      const sp = em.speedMin + rng() * (em.speedMax - em.speedMin)
      vx0 = (ox / olen) * sp
      vy0 = (oy / olen) * sp
      sys.__spawnSpeeds = (sys.__spawnSpeeds || 0) + 1
    }
  }
  const p = {
    pos: [wx, wy, wz],
    // scenePos = 相对层 origin 的层空间（y-up：指针 y-down 差取反）
    scenePos: em.__ptrLocked
      ? [__P[0] - sys.origin[0] + rpx * em.scale[0], -(__P[1] - sys.origin[1]) + rpy * em.scale[1], wz]
      : [em.origin[0] * em.scale[0] + rpx * em.scale[0], em.origin[1] * em.scale[1] + rpy * em.scale[1], em.origin[2] * (em.scale[2] !== undefined ? em.scale[2] : 1) + pz],
    vel: [vx0, vy0, 0], angVel: 0, rot: 0,
    alpha: 1, size: 20, color: [1, 1, 1],
    life: 1, age: 0, alive: true,
    // ①(RE-20/RANDOMONE) 每粒子一次性随机数：randomframe 终身固定帧、colorrandom 灰度域、
    //   oscillate 的相位/频率/幅度也由它派生（官方均为"出生时抽一次"）。
    random: rng(),
    // ①(P-140 用户第 7 项) 出生时刻的**子系统仿真时钟**（`stepParticles` 在本步发射前写入
    //   `sys._scaledT`）—— `turbulentvelocityrandom` 的相干场相位要它（"不同出生时刻的方向不同"
    //   ⇒ 烟是一缕弯的而不是一根直棍）。纯粹是"记一下当时几点"，**不抽随机数、不动任何既有字段**
    //   ⇒ RNG 流与顶点流都不受影响；`?pturb=legacy` 分支根本不读它。
    turbT: sys._scaledT || 0,
    oscAlpha: null, oscSize: null, oscPos: null,
  }
  for (const init of sys.initializers) {
    applyInitializer(p, init, rng, sys.vyLegacy, sys.expLegacy, sys.pcolorLegacy, audioFactor(init.audio, sys),
      // ①(P-133 #3) `mapsequencearoundcontrolpoint` 的上下文（只有该 initializer 会读）：
      //   控制点世界坐标（lockToPointer 时 = 指针）+ 本发射器的分布半径 + 轮转序号。
      //   其他 initializer 忽略第 8 实参 ⇒ 零行为变化、不额外消耗 RNG。
      (init.name === 'mapsequencearoundcontrolpoint') ? __mapAroundCtx(sys, em, wx, wy, wz) : null,
      // ①(P-140 用户第 7 项) 第 9 实参 = 湍流初速场口径（`?pturb=legacy`）；只有
      //   `turbulentvelocityrandom` 会读，其余 initializer 忽略 ⇒ 零行为变化。
      sys.pturbLegacy)
  }
  // ①(P-103③) 记账：本粒子至少有一个 initializer 真的吃了 exponent≠1（legacy 档恒不置位）
  if (p.__expApplied) { sys.__spawnExps = (sys.__spawnExps || 0) + 1; delete p.__expApplied }
  // ①(P-74 ①) instanceoverride：官方把它作为**追加 initializer** 排在全部作者 initializer 之后
  //   （行为对照：wer-ref WPSceneParser.cpp:1427 在作者 initializer 全部登记完之后、且仅当 override 启用时，
  //   再追加一条覆盖 initializer），
  //   倍率定义见 WPParticleParser.cpp:297-312 + ParticleModify.h:127/165/169/173。
  if (sys.io) applyInstanceOverride(p, sys.io)
  p.initLife = p.life || 1        // ①(官方生命周期插值用 1 − lifetime/init)
  p.baseColor = p.color.slice()
  return p
}

// ═══════════════════════════════════════════════════════════════════════════════
// ①(P-144 子系) 子系的**位置锚定**与**每帧准备**（模块级 = 渲染层与语料扫描/门禁共用同一份实现）
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 在**指定位置**发射一颗粒子（`eventspawn`/`eventdeath` 的锚点 = 父粒子的出生/死亡位置）。
 * 做法：把子系的 `sys.origin` 临时挪到该位置，走**同一个** `spawnParticle`（initializer /
 * operator / instanceoverride / 音频门控语义完全一致），随后原值恢复。
 * **不新增任何随机数抽取**（抽取全在 `spawnParticle` 内部，走子系自己的 RNG）。
 */
export function spawnParticleAt(sys, em, at) {
  const o = sys.origin
  const sx = o[0], sy = o[1], sz = o[2]
  o[0] = at[0]; o[1] = at[1]; o[2] = at[2] || 0
  let p = null
  try { p = spawnParticle(sys, em) } finally { o[0] = sx; o[1] = sy; o[2] = sz }
  return p
}

/**
 * 子系的**每帧准备**（在 `simulateParticleSystem` 之前调用一次）。四种 type 的全部行为：
 *
 *  · `static`（含 `type` 缺失）：**什么都不用做** —— 原点在建立时就固定在
 *    "父层变换 × 子系 authored origin"（`particleChildAnchorWorld`），之后按自己的 emitter 持续发射。
 *    只有 `controlpointstartindex > 0` 时按基址继承父层控制点的"活"状态（语料全是 0）。
 *  · `eventfollow`：每帧把原点对到父系的 leader 粒子（照抄块 G `attachFollow` 只在新建时挂一次，
 *    之后每帧走照抄块 I `syncFollow` + 本仓库适配层 `syncFollowOrigin`）。父系没有活粒子 ⇒
 *    官方语义"实例死"（`ParticleSystem.cpp:394-400`）⇒ **清空 + 本帧不发**。
 *  · `eventspawn` / `eventdeath`：**不做持续发射**（`__emitGate = false`），只把父系本帧记下的
 *    "新生/死亡位置"各吐一发。一发 = 子系 emitter 的 `instantaneous`（缺省 1 颗）。
 *  · `probability`：事件类**每事件**抽一次（`p<=0` ⇒ 直接不发且不抽；`p>=1` ⇒ 不抽，直接发）；
 *    `static`/`eventfollow`**每帧**抽一次"发射许可"（写进 `sys.__emitGate`，≈ 发射率 × p）。
 *    抽取**一律走子系自己的 `sys.rng`** ⇒ 父系 RNG 流一个数都不动（`?children=legacy` 逐位的前提）。
 *  · `maxcount`（缺省 20）：`static` = 子系 def 的 `maxcount`（一个实例）；`eventfollow` = 子系
 *    存活粒子上限（在渲染层用 `ctx.maxCount` 折算，一个实例 ≈ 一粒拖尾粒子）；
 *    事件类 = **并发实例上限**（每个事件实例 = 一发，粒子存活期间占一个名额，粒子全死则名额回收）。
 *
 * @param {object} childSys 子系粒子系统
 * @param {object} spec `parseParticleChildren` 的一条
 * @param {object|null} parentSys 父系粒子系统
 * @param {Array<number[]>|null} events 父系本帧的出生/死亡位置快照（按 type 取其一）
 * @param {object} [st] 记账对象（渲染层传 `partStat.children`；缺省 = 不记账）
 * @returns {{spawned:number, instances:number, cleared:boolean, gate:(boolean|undefined)}}
 */
export function prepareParticleChildSys(childSys, spec, parentSys, events, st) {
  const out = { spawned: 0, instances: 0, cleared: false, gate: undefined }
  if (!childSys || !spec) return out
  const isEvent = spec.type === 'eventspawn' || spec.type === 'eventdeath'
  // 事件类只按事件吐（否则 8 条 eventspawn 会退化成常驻发射器）
  childSys.__emitGate = isEvent ? false : undefined
  childSys.__childType = spec.type
  if (spec.type === 'eventfollow') {
    if (!parentSys) { childSys.__emitGate = false; if (st) st.noParent++; return out }
    if (childSys._followParent !== parentSys || childSys._followMode !== 'particle') {
      attachFollow(childSys, parentSys, 'particle', spec.origin)   // 照抄块 G
    }
    const ok = syncFollowOrigin(childSys)                          // 照抄块 I + 适配层
    if (!ok) {
      // 官方 `EVENT_FOLLOW`：父粒子死 ⇒ 实例死、**清空**它的粒子（`ParticleSystem.cpp:394-400`）
      if (childSys.particles.length) {
        childSys.particles.length = 0
        childSys.count = 0
        out.cleared = true
        if (st) st.followCleared++
      }
      childSys.__emitGate = false
      return out
    }
  }
  if (spec.type === 'static' && spec.cpStart > 0 && parentSys) {
    // `controlpointstartindex`（语料 149 条全是缺省 0 ⇒ 这条分支一次都不进）
    applyChildControlPointBase(childSys, parentSys, spec.cpStart)
  }
  if (isEvent && events && events.length) {
    const cap = spec.maxCount
    // 并发实例上限：先数一遍"还活着的实例"（粒子上的 `__childInst` 标记），再边吐边加
    const live = new Set()
    for (const p of childSys.particles) if (p.__childInst !== undefined) live.add(p.__childInst)
    let skippedByCap = 0
    for (let i = 0; i < events.length; i++) {
      // 官方 `QueryNewInstance()`：**先**抽概率门、**再**看实例上限（`ParticleSystem.cpp:311-323`）
      if (spec.probability < 1) {
        if (!(spec.probability > 0)) break
        if (!(childSys.rng() < spec.probability)) { if (st) st.probRejected++; continue }
      }
      if (live.size >= cap) { skippedByCap++; continue }
      const inst = (childSys.__pInstSeq = (childSys.__pInstSeq || 0) + 1)
      let n = 0
      for (const em of childSys.emitters) {
        // 一发 = 该 emitter 的 `instantaneous`（官方事件子系的写法；语料 `shootingstarglow`
        // 就是 `instantaneous:1, rate:0`），缺省 1 颗。
        const cnt = Math.max(1, Math.round(em.instantaneous > 0 ? em.instantaneous : 1))
        for (let k = 0; k < cnt; k++) {
          if (childSys.count >= childSys.maxCount) break
          const p = spawnParticleAt(childSys, em, events[i])
          if (!p) break
          p.__childInst = inst
          childSys.particles.push(p)
          childSys.count++
          n++; out.spawned++
        }
      }
      if (n > 0) live.add(inst)
    }
    out.instances = live.size
    if (st) {
      st.bursts += live.size
      st.spawned += out.spawned
      if (skippedByCap) st.capSkipped += skippedByCap
    }
  } else if (!isEvent && spec.probability < 1) {
    // `static`/`eventfollow`：每帧一次发射许可（≈ 发射率 × probability）
    if (!(spec.probability > 0)) childSys.__emitGate = false
    else childSys.__emitGate = (childSys.rng() < spec.probability)
    if (childSys.__emitGate === false && st) st.gateClosed++
  }
  out.gate = childSys.__emitGate
  return out
}

// ①(P-74) 官方 genOverrideInitOp 的逐字移植（WPParticleParser.cpp:297-312）：
//   MutiplyInitLifeTime → MutiplyInitAlpha → MutiplyInitSize → MutiplyVelocity → InitColor
//   顺序与官方一致（size 之后没有别的 initializer 会再改 size，故顺序对结果等价；
//   保持同序便于逐行对拍）。
export function applyInstanceOverride(p, io) {
  if (!io || !io.enabled) return p
  const m = (v) => (typeof v === 'number' && isFinite(v) ? v : 1)
  p.life *= m(io.lifetime)
  p.alpha *= m(io.alpha)
  p.size *= m(io.size)
  const sp = m(io.speed)
  p.vel[0] *= sp; p.vel[1] *= sp; p.vel[2] *= sp
  if (io.overColor && io.color) p.color = [io.color[0] / 255, io.color[1] / 255, io.color[2] / 255]
  else if (io.overColorn && io.colorn) p.color = [io.colorn[0], io.colorn[1], io.colorn[2]]
  // 官方此处不做 clamp；alpha 越界（语料 max 1.4）由渲染端的 `Math.max(0,p.alpha)*alphaMul` 兜住
  return p
}

// 第 9 实参 `pturbLegacy`（①P-140 用户第 7 项）= 湍流初速场口径（`?pturb=legacy`），缺省 false
//   = official（方向 = 位置的函数）。只有 `turbulentvelocityrandom` 会读它；外部（测试/第三方）
//   只传前 3~4 个实参的既有调用**逐位不变**。
export function applyInitializer(p, init, rng, vyLegacy, expLegacy, pcolorLegacy, audioEnv = null, ctx = null, pturbLegacy = false) {
  const pr = init.params
  // ①(P-103③ 洁净室实现) 官方 exponent **非线性分布**：`值 = min + pow(u, exponent)·(max−min)`，u=rng()。
  //   行为规格（不照抄任何 GPL 实现的行文/命名/结构，见 docs/PATCHES.md P-103 的"新旧差异"清单）：
  //     · exponent 缺省 / =1 / 非正 / 非有限 ⇒ 恒等退化为均匀分布（**同一个 rng() 调用**、同一个算式 ⇒
  //       P-100 行为逐位不变；这也让"语料里 17 处 colorrandom exponent:1"天然无副作用）。
  //     · exponent>1 ⇒ 向 min 偏置（pow(u,2) 的均值 = 1/3）；0<exponent<1 ⇒ 向 max 偏置。
  //   证据：官方资产 `assets/presets/**/particles/**/*.json` 里 sizerandom 15 / lifetimerandom 14 /
  //     alpharandom 10 处带该字段（取值 1/2/5/10/50）；MIT 的 webwallgl `particle-util.js:15-20`；
  //     lwe **行为对照**（size / 角速度上用 pow(t, exponent)）。
  const rnd = (min, max) => {
    const u = rng()
    const ex = pGetVal(pr, 'exponent', 1)
    const useEx = !expLegacy && typeof ex === 'number' && isFinite(ex) && ex > 0 && ex !== 1
    const t = useEx ? Math.pow(u, ex) : u
    if (useEx) p.__expApplied = true
    return min + t * (max - min)
  }
  switch (init.name) {
    case 'sizerandom': {
      const min = pGetVal(pr, 'min', 1), max = pGetVal(pr, 'max', 20)
      p.size = rnd(min, max)
      p._initSize = p.size
      break
    }
    case 'alpharandom': {
      const min = pGetVal(pr, 'min', 0.05), max = pGetVal(pr, 'max', 1)
      p.alpha = rnd(min, max)
      p._initAlpha = p.alpha
      break
    }
    case 'lifetimerandom': {
      const min = pGetVal(pr, 'min', 0), max = pGetVal(pr, 'max', 1)
      p.life = rnd(min, max)
      break
    }
    case 'velocityrandom': {
      const min = pVec3(pGetVal(pr, 'min'), [-32, -32, -32])
      const max = pVec3(pGetVal(pr, 'max'), [32, 32, 32])
      // ①(P-74 ③) **y 必须翻**：作者矢量是编辑器 y-up，而 `p.vel` 是渲染 y-down
      //   （`movement` 里 `p.pos[1] += p.vel[1]*dt` 与 `p.vel[1] += -gravity[1]*dt` 已确立该口径；
      //    `spawnParticle` 的发射器偏移同样翻了一次）。
      //   官方依据：lwe-ref/.../CParticle.cpp:767-778 createVelocityRandomInitializer
      //     `glm::vec3 vel = randomVec3(min,max) * speedOverride; vel.y = -vel.y;`
      //   语料反例：`Rain perspective`(218051) 恒 `velocityrandom 0 -3000 0` + `gravity 0` ⇒
      //     不翻 = 雨往上跑（P-69 把屏幕镜像掰正后暴露）。
      const vy = min[1] + rng() * (max[1] - min[1])
      p.vel = [min[0] + rng() * (max[0] - min[0]), vyLegacy ? vy : -vy, min[2] + rng() * (max[2] - min[2])]
      break
    }
    case 'rotationrandom': {
      const min = pVec3(pGetVal(pr, 'min'), [0, 0, 0])
      const max = pVec3(pGetVal(pr, 'max'), [0, 0, Math.PI * 2])
      p.rot = min[2] + rng() * (max[2] - min[2])
      break
    }
    case 'angularvelocityrandom': {
      const min = pVec3(pGetVal(pr, 'min'), [0, 0, -5])
      const max = pVec3(pGetVal(pr, 'max'), [0, 0, 5])
      // ①(P-103③) 只对**实际被消费的 z 分量**抽一次（与 P-100 同一次 rng() 调用 ⇒ legacy 档逐位一致）；
      //   x/y 分量本渲染器不用（2D 场景），不为它们多抽随机数（那会平移整条 RNG 流）。
      p.angVel = rnd(min[2], max[2])
      break
    }
    // ①(RE-20) turbulentvelocityrandom（实测 24 次）：沿 Curl 场给一个初始速度扰动。
    //   官方是"沿 curl 噪声场走 duration 秒后的方向"。
    //
    //   ①(P-140 用户第 7 项 2026-09-19) **旧实现的语义错**（不是"近似"）：方向取的是
    //     `p.random`（每颗粒子出生时抽一次的独立 0..2π 角）⇒ **同一处出生的粒子各自飞散**；
    //     官方是**按位置采样的 curl 噪声场**（同地同向、邻地平滑），三个独立参考实现都如此
    //     （见 `docs/VAPOR-LAYER-3544152633.md` §4.1/§6-1：MIT `noiseVec3(p.x*scale…, p.y*scale…)`、
    //     lwe-ref `curlNoise(p.position*0.1f…)`、wer-ref `CurlNoise` 走步 —— 它们对 `scale` 的
    //     **量纲互相冲突**，所以下面的 `PTURB_K` 是**待标定量、不是官方值**）。
    //     `0917/3233141951` 的「龙烟」(段长中位 2221px)、`dd/3544152633` 第 26 层「Vapor (double)」
    //     （`renderer=rope`：把存活粒子按发射序连成 ribbon）就是这样变成"各种发散线条"的。
    //   `?pturb=legacy` = **改前逐位口径**（独立随机角），A/B 用；判据/读数见上述报告 §3.1-G、§5。
    case 'turbulentvelocityrandom': {
      const smin = pGetVal(pr, 'speedmin', 0), smax = pGetVal(pr, 'speedmax', 0)
      // ⚠ 这次 `rng()` 调用是**唯一**一次、两档都在**同一位置**抽 ⇒ RNG 流与改动前逐位一致
      //   （只有"方向怎么算"变了，粒子数/寿命/尺寸/颜色序列一个都不动）。
      const amp = smin + rng() * (smax - smin)
      if (amp) {
        // ①(P-131 批 D / P-132 批 D 落地物，P-140 保留) 官方音频响应（本 initializer 专属段落）：
        //   "adds a factor to the **Phase** values … this feature has no effect on particles with a
        //   `0.00` phase." ⇒ **每粒子相位乘 (1+env)**。**逐字沿用 P-132 批 D 的落点结构**：
        //   旧算式 = `p.random·2π·(1+env) + (pos0+pos1)·1e-3` —— 因子只乘"每粒子随机相位"那一项，
        //   位置/时间项**不乘**。这里同样只乘 `zp`（= `p.random·phasemax`）。后果正是官方那句话：
        //   `phasemax=0`（本层 vapor1.json 就是）⇒ `zp≡0` ⇒ **音频对它没有任何影响**；
        //   `phasemax>0` ⇒ env 改变方向（`tests/particle-render-correctness-test.mjs` ⑧-6 钉住）。
        //   `env=0`/无音频视图 ⇒ 系数 1 ⇒ 与"没有视图"逐位相同。
        const phK = 1 + (audioEnv || 0)
        if (pturbLegacy) {
          // 改前口径（逐位）：独立随机出生角 + 与位置成正比的微小平移（发射半径 5px ⇒ 相干性≈0）。
          const a = p.random * Math.PI * 2 * phK + (p.pos[0] + p.pos[1]) * 1e-3
          p.vel = [Math.cos(a) * amp, Math.sin(a) * amp, 0]
        } else {
          // 官方口径：方向 = **位置 + 场时间**的函数（相干场）⇒ 同地同向、邻地平滑。
          //   · `k = PTURB_K`（**待标定量**，不是官方值 —— 三个参考实现对 `scale` 的量纲互相冲突，
          //     我们没有官方二进制可对拍）：缺省 `0.002` ≈ **500px 特征尺度**，取的是
          //     `docs/VAPOR-LAYER-3544152633.md` §3.1-G 反证里用过的量级（那一档把本层 ribbon 总长
          //     6796px→309px、段长中位 190px→8.5px、>60px 的段 23→0）。**真机对拍官方 `preview.gif`
          //     后可调**（第一刀调相位/手性，第二刀才谈 `scale` 的真实量纲）。
          //   · 相位 = 场时间 `zt`（出生时刻的子系统仿真时钟 × `timescale`，**不受音频影响**）
          //     + 每粒子相位 `zp`（`p.random × phasemax`，受 `(1+env)` 调制，见上）
          //     ⇒ "不同出生时刻的方向缓慢转动" = 一缕弯的烟（而不是一条直棍）。
          //   · 场形取自本仓库 `turbulence` operator 的确定性 sin/cos 场（下方 operator 段：
          //     `sin(x·3.1 + …)·cos(y·2.3 − …)` / `cos(x·2.7 − …)·sin(y·3.3 + …)`），initializer 与
          //     operator 同族、物理自洽；未复制任何参考实现代码。
          //   ⚠ **与 `docs/VAPOR-LAYER-3544152633.md` §4.1 代码片段的一处必要偏离**（该片段直接照抄
          //     会在 `p.pos=(0,0)` 处**退化**）：片段的 `n2` 与 `n1` 在 s=t2=0 时恒等
          //     （`n1 ≡ n2 = sin z·cos z`）⇒ 归一化后方向只剩 `±45°` **两个值**，相位只影响符号 ⇒
          //     音频 env 对"出生在 (0,0) 的层"完全不生效（`particle-render-correctness` ⑧-6 实测就是
          //     这么变红的）。这里按该片段自己的话"复用本仓库 turbulence operator 已有的确定性
          //     sin/cos 场"把两个分量的**时间系数拆开**（operator 是 `t·0.7` / `t·0.5`）：
          //     `n2` 的时间项取 `z·0.5` ⇒ (0,0) 处 `n1=sin z·cos z`、`n2=cos z·sin(z/2)`，不再退化。
          const k = PTURB_K
          const zt = (p.turbT || 0) * pGetVal(pr, 'timescale', 1)
          const zp = p.random * pGetVal(pr, 'phasemax', 0) * phK
          const z = zt + zp
          const s = p.pos[0] * k, t2 = p.pos[1] * k
          const n1 = Math.sin(s * 3.1 + t2 * 1.7 + z) * Math.cos(t2 * 2.3 - z)
          const n2 = Math.cos(s * 2.3 - t2 * 2.9 + z) * Math.sin(s * 1.9 + z * 0.5)
          const m = Math.hypot(n1, n2) || 1
          p.vel = [n1 / m * amp, n2 / m * amp, 0]
        }
      }
      p.turbSeed = p.random * 1000
      break
    }
    // ①(P-133 #3) `mapsequencearoundcontrolpoint`（语料 6 份 def，全是 Cherry_Blossoms_2）：
    //   绕控制点（lockToPointer 时 = 光标）按 count 等分圆**轮流投放**，并给一个作者初速。
    //   语义/出处见 `__mapAroundCtx` 头注（行为对照：MIT oneincase/webwallgl
    //   `renderer/vendor/we-scene/render/particles.js:828-850`）。旧实现**整条 initializer 未实现**
    //   ⇒ 花瓣只吃到发射器 speedmax=20 且半径 1px ⇒ 全堆在光标上（用户第 ③ 项"缩成一个球 + 没有尾迹"）。
    //   缺省（无 ctx / 没写字段）时**一个字节都不改**：不抽随机数、不动 pos/vel。
    case 'mapsequencearoundcontrolpoint': {
      if (!ctx) break
      const count = Math.max(1, Math.round(pGetVal(pr, 'count', 1)))
      const bounds = pVec3(pGetVal(pr, 'bounds'), [0, 1, 0])
      const i = ctx.nextIndex()
      const u = (i % count) / count
      const tt = bounds[0] + (bounds[1] - bounds[0]) * u
      const ang = tt * Math.PI * 2
      const rad = ctx.radius || 0
      // ①(P-136 用户第 4 项) 锁指针 + authored 控制点存在时，位置由**照抄来的**上游
      //   `mapSequenceAroundControlPoint` 给出（局部圆周 → 图层变换 → 世界）；否则逐字沿用 P-133。
      if (ctx.placement) {
        const wp = ctx.placement(i, count, bounds)
        p.pos[0] = wp[0]; p.pos[1] = wp[1]; p.pos[2] = wp[2]
      } else {
        // 位置 = 控制点 + 圆周点（**替换**发射器偏移；作者空间 y-up ⇒ 世界 y 取反）
        p.pos[0] = ctx.cx + Math.cos(ang) * rad
        p.pos[1] = ctx.cy - Math.sin(ang) * rad
        p.pos[2] = ctx.cz
      }
      if (p.scenePos) {
        p.scenePos[0] = p.pos[0] - ctx.originX0
        p.scenePos[1] = -(p.pos[1] - ctx.originY0)
      }
      // 初速：逐轴 rand(speedmin, speedmax)，**三轴共用一次随机数**（与参考实现同构）；
      //   y 分量取反（作者 y-up → 渲染 y-down，与 velocityrandom/movement.gravity 同一口径）。
      const smin = pVec3(pGetVal(pr, 'speedmin'), [0, 0, 0])
      const smax = pVec3(pGetVal(pr, 'speedmax'), [0, 0, 0])
      const k = rng()
      p.vel[0] += smin[0] + (smax[0] - smin[0]) * k
      p.vel[1] += -(smin[1] + (smax[1] - smin[1]) * k)
      p.vel[2] += smin[2] + (smax[2] - smin[2]) * k
      p.__mapAround = i
      break
    }
    case 'colorrandom': {
      // ①(P-130 批A #2) `max` 缺省 = **{255,255,255}**（官方 `VecRandom` 的 `r.min = {0,0,0}` /
      //   `r.max = {255,255,255}`，两者都 ÷255 后使用 —— 行为对照取自第三方参考实现，未反汇编官方二进制）。
      //   我们旧缺省是 `[1,1,1]`（**归一化域**）⇒ 与字节域 `min` 混算：只写 `min:"255 255 255"` 的
      //   **68 层 / 13 包**（含 hina `dd/3554161528` ln=17「雾 2」）被算成 `1 − 0.996·u` 的随机灰度
      //   （最暗近黑），官方应为**恒白 (1,1,1)**。
      //   `?pcolor=legacy` = 回到旧缺省 `[1,1,1]`（P-126 口径，真机 A/B 复现灰雾用）。
      const min = pVec3(pGetVal(pr, 'min'), [0, 0, 0])
      const max = pVec3(pGetVal(pr, 'max'), pcolorLegacy ? [1, 1, 1] : [255, 255, 255])
      const k = (max[0] > 1 || max[1] > 1 || max[2] > 1 || min[0] > 1 || min[1] > 1 || min[2] > 1) ? 1 / 255 : 1
      p.color = [(min[0] + rng() * (max[0] - min[0])) * k, (min[1] + rng() * (max[1] - min[1])) * k, (min[2] + rng() * (max[2] - min[2])) * k]
      break
    }
  }
}

// ①(P-130 批A #1/#4/#5) `FrequencyValue`（oscillate* 家族）的**官方缺省 + 频率量纲 + 相位抽取**。
//   依据：**两个独立第三方参考实现的行为对照结论一致**（本实现按该行为规格独立书写，未复制其代码/
//   注释/常量组织；**未反汇编官方二进制**，缺省数字同样取自第三方参考实现，见 docs/PATCHES.md P-130）：
//     · **ω ≡ frequency（rad/s）**：参考实现甲 `f = frequency/(2π); w = 2π·f`（⇒ w = frequency）；
//       参考实现乙 `w = frequency`。⇒ 作者写的 `frequencymin/max` **就是角速度**，不是 Hz。
//       旧实现 `cos(2π·frequency·age)` 把 authored 值当 Hz ⇒ 摆动/闪烁快 **2π ≈ 6.28 倍**。
//     · **相位 = random(phasemin, phasemax + 2π)**（两实现都带 `+2π`）；旧实现恒 `random(0, phasemax)`
//       ⇒ 写了 `phasemin` 的层相位基准错。
//     · 缺省：frequencymin 0 / frequencymax **10** / scalemin 0 / scalemax 1 / phasemin 0 / phasemax 2π；
//       名称分支：`oscillatesize` → scalemin **0.8** / scalemax **1.2**；`oscillateposition` → frequencymax **5**。
//     · `frequencymax == 0`（显式写 0）⇒ 取 `frequencymin`（官方 ReadFromJson 的归一）。
//   ⚠ `oscillateposition.mask`：参考实现甲是**门**（`mask[d] < 0.01` 才跳过）、乙是**乘**（幅度 ×mask），
//     两派冲突 ⇒ 本批**不动** mask（沿用"乘"，见 docs/PARTICLE-CORPUS-SCAN.md §5-2）。
function partFreqDefaults(name) {
  const d = { fmin: 0, fmax: 10, smin: 0, smax: 1, phmin: 0, phmax: Math.PI * 2 }
  if (name === 'oscillatesize') { d.smin = 0.8; d.smax = 1.2 } else if (name === 'oscillateposition') { d.fmax = 5 }
  return d
}
function readFreqValue(pr, name) {
  const d = partFreqDefaults(name)
  const fmin = pGetVal(pr, 'frequencymin', d.fmin)
  let fmax = pGetVal(pr, 'frequencymax', d.fmax)
  if (fmax === 0) fmax = fmin
  const smaxRaw = pGetVal(pr, 'scalemax', null)
  return {
    fmin, fmax,
    smin: pGetVal(pr, 'scalemin', d.smin),
    smaxRaw,                                   // 缺省判定要区分"没写"与"写了 0"
    smax: smaxRaw == null ? d.smax : smaxRaw,  // 官方缺省 1（oscillatesize 为 1.2）
    phmin: pGetVal(pr, 'phasemin', d.phmin),
    phmax: pGetVal(pr, 'phasemax', d.phmax),
  }
}
// 相位抽取（官方口径）。`r` 必须是**出生时已抽好的** [0,1) 随机数 —— 这里**不额外消耗 RNG**，
//   否则会平移整条 RNG 流（连带改变发射数 ⇒ 与"只改本算子"的 A/B 不可比）。
const freqPhase = (v, r) => v.phmin + r * (v.phmax + Math.PI * 2 - v.phmin)
// `?pops=legacy` 档的相位（P-126 口径）：不读 phasemin、上界 = phasemax（缺省同为 2π ⇒ 与改动前逐位一致）。
const freqPhaseLegacy = (v, r) => r * v.phmax

// ①(P-130 批A #7) 官方 `FadeValueChange`（colorchange 用）：**线性**、分支不 clamp、不 smoothstep。
//   `life <= start → startvalue`；`life > end → endvalue`；其间 `lerp((life−start)/(end−start))`。
//   （分支顺序保证 `start < life <= end` ⇒ `end > start`，除法不会为 0。）
function fadeValueChange(life, start, end, sv, ev) {
  if (life <= start) return sv
  if (life > end) return ev
  const pass = (life - start) / (end - start)
  return [sv[0] + (ev[0] - sv[0]) * pass, sv[1] + (ev[1] - sv[1]) * pass, sv[2] + (ev[2] - sv[2]) * pass]
}
// ①(P-133 #5) 标量版（sizechange / alphachange 用）：与上面同一个官方函数 `FadeValueChange`
//   （wer-ref `WPParticleParser.cpp:311-321`：`life<=start → startvalue`；`life>end → endvalue`；
//   其间 **线性** lerp，**不 clamp、不 smoothstep**）。
//   旧实现对 size/alpha 用的是 smoothstep + clamp ⇒ 中段比官方**小**（如 `sizechange{starttime:0.2}`
//   在 life=0.4 时官方 0.25、我们 0.156）—— 语料 20 处 `sizechange` 只写 `starttime`，
//   旧曲线让花瓣/雪片提前缩没。`?pops=legacy` 回退旧曲线（A/B）。
function fadeValueChange1(life, start, end, sv, ev) {
  if (life <= start) return sv
  if (life > end) return ev
  return sv + (ev - sv) * ((life - start) / (end - start))
}

export function applyOperator(sys, op, dt, t) {
  const pr = op.params
  const rng = sys.rng
  // ①(P-131 批 D) 音频系数**每个算子每帧只算一次**（不放进粒子循环：既省 pow，也让记账是"算子次数"）
  const __env = audioFactor(op.audio, sys)
  const audioK = __env === null ? 1 : __env          // 速度类：乘性（vortex `speed·env`）
  const audioPhase = __env === null ? 0 : __env      // 相位类：`phase·(1+env)`（无调制 ⇒ 1×）
  op.audioLastEnv = audioK
  for (const p of sys.particles) {
    switch (op.name) {
      case 'movement': {
        const gravity = pVec3(pGetVal(pr, 'gravity'), [0, 0, 0])
        const drag = pGetVal(pr, 'drag', 0)
        p.pos[0] += p.vel[0] * dt
        p.pos[1] += p.vel[1] * dt
        p.vel[0] += gravity[0] * dt
        p.vel[1] += -gravity[1] * dt // Y flip
        const df = Math.max(0, 1 - drag * dt)
        p.vel[0] *= df; p.vel[1] *= df
        if (p.scenePos) {
          p.scenePos[0] += p.vel[0] * dt
          p.scenePos[1] += -p.vel[1] * dt
        }
        break
      }
      case 'angularmovement': {
        const force = pVec3(pGetVal(pr, 'force'), [0, 0, 0])
        const drag = pGetVal(pr, 'drag', 0)
        p.rot += p.angVel * dt
        p.angVel += force[2] * dt
        p.angVel *= Math.max(0, 1 - drag * dt)
        break
      }
      case 'alphafade': {
        const fadeIn = pGetVal(pr, 'fadeintime', 0.5)
        const fadeOut = pGetVal(pr, 'fadeouttime', 0.5)
        const lifePos = p.life > 0 ? p.age / p.life : 1
        const base = p._initAlpha ?? 1
        let fade
        if (lifePos <= fadeIn) {
          const tt = fadeIn > 0 ? Math.min(1, Math.max(0, lifePos / fadeIn)) : 1
          fade = tt * tt * (3 - 2 * tt)
        } else if (lifePos > fadeOut) {
          const tt = 1 - fadeOut > 0 ? Math.min(1, Math.max(0, (lifePos - fadeOut) / (1 - fadeOut))) : 1
          fade = 1 - tt * tt * (3 - 2 * tt)
        } else fade = 1
        p.alpha = base * fade
        if (p.oscAlpha) p.oscAlpha.base = p.alpha
        break
      }
      case 'sizechange': {
        const st = pGetVal(pr, 'starttime', 0), et = pGetVal(pr, 'endtime', 1)
        const sv = pGetVal(pr, 'startvalue', 1), ev = pGetVal(pr, 'endvalue', 0)
        const lifePos = p.life > 0 ? p.age / p.life : 1
        // ①(P-133 #5) 官方 = 线性 `FadeValueChange`（缺省 starttime 0/endtime 1/startvalue 1/endvalue 0，
        //   与 wer-ref `ValueChange` 逐字一致）；`?pops=legacy` 保留旧的 smoothstep+clamp 曲线。
        let mul
        if (sys.popsLegacy) {
          const t01 = et > st ? Math.max(0, Math.min(1, (lifePos - st) / (et - st))) : 1
          const tt = t01 * t01 * (3 - 2 * t01)
          mul = sv + (ev - sv) * tt
        } else {
          mul = fadeValueChange1(lifePos, st, et, sv, ev)
        }
        p.size = (p._initSize ?? 20) * mul
        if (p.oscSize) p.oscSize.base = p.size
        break
      }
      case 'alphachange': {
        const st = pGetVal(pr, 'starttime', 0), et = pGetVal(pr, 'endtime', 1)
        const sv = pGetVal(pr, 'startvalue', 1), ev = pGetVal(pr, 'endvalue', 0)
        const lifePos = p.life > 0 ? p.age / p.life : 1
        // ①(P-133 #5) 同 sizechange：官方线性 `FadeValueChange`（`?pops=legacy` 回退 smoothstep）。
        let mul
        if (sys.popsLegacy) {
          const t01 = et > st ? Math.max(0, Math.min(1, (lifePos - st) / (et - st))) : 1
          const tt = t01 * t01 * (3 - 2 * t01)
          mul = sv + (ev - sv) * tt
        } else {
          mul = fadeValueChange1(lifePos, st, et, sv, ev)
        }
        p.alpha = (p._initAlpha ?? 1) * mul
        if (p.oscAlpha) p.oscAlpha.base = p.alpha
        break
      }
      // ═══ ①(RE-20 官方算子补全 2026-09-12) 按真实资产用量排序实现缺失算子 ═══
      // oscillate 家族（88 次）：官方 = cos(ωt+phase) 及其导数；频率/幅度在出生时抽一次
      //   （真实参数：frequencymin/max、scalemin/max、phasemax）。
      case 'oscillatealpha': {
        // ①(P-126 C 用户第 8 项) **乘性**摆动（官方语义；`?pops=legacy` 回退加性）：
        //   `multiplier = mix(scalemin, scalemax, (cos(2πf·age+φ)+1)/2)`、`alpha = base · multiplier`。
        //   旧实现是 `clamp(base + a·cos(...), 0, 1)` 且 `scalemax` 缺省取 **smin**（⇒ 只写
        //   `scalemin` 的层幅度恒 0），实测 base=1 时摆到 0.30（官方下限 0.70）、base=0.5 时
        //   24.8% 的周期 α=0（**整颗消失**，真机观感=高频闪烁/闪没）。语料三处萤火虫 def 都是
        //   `oscillatealpha{frequencymin:10..20, scalemin:0.7}`（无 scalemax）⇒ 正是这条路径。
        if (!p.oscAlpha) {
          // ①(P-130 批A #1/#4/#5) 官方 `FrequencyValue` 缺省表（见文件内 `readFreqValue`）：
          //   frequencymax 缺省 **10**（旧 1）⇒ 只写 `frequencymin` 的层频率域不再被截到 ≤1；
          //   相位 = random(phasemin, phasemax+2π)；频率量纲 ω = frequency（旧 `2π·frequency`）。
          const v = readFreqValue(pr, 'oscillatealpha')
          const smaxLegacy = v.smaxRaw == null ? v.smin : v.smaxRaw // P-124 缺省 = smin（⇒ 只写 scalemin 时幅度恒 0）
          p.oscAlpha = { f: v.fmin + p.random * (v.fmax - v.fmin), smin: v.smin, smax: v.smax,
            a: (v.smin + ((p.random * 7919) % 1) * (smaxLegacy - v.smin)),   // legacy 档的加性幅度（不改 RNG 流）
            ph: freqPhase(v, p.random), phL: freqPhaseLegacy(v, p.random), base: p.alpha }
        }
        const o = p.oscAlpha
        if (sys.popsLegacy) {
          p.alpha = Math.max(0, Math.min(1, o.base + o.a * Math.cos(o.f * t * Math.PI * 2 + o.phL)))
        } else {
          // ①(P-130 批A #1) `ω = frequency`（rad/s）：官方两个独立参考实现一致，旧实现多乘了 2π ⇒ 快 6.28×。
          const mixv = (Math.cos(o.f * (p.age || 0) + o.ph) + 1) * 0.5
          p.alpha = o.base * (o.smin + (o.smax - o.smin) * mixv)
        }
        break
      }
      case 'oscillatesize': {
        if (!p.oscSize) {
          // ①(P-130 批A #4/#5) 官方缺省（本算子专属）：scalemin/scalemax = **0.8/1.2**、
          //   frequencymax = **10**（旧实现 1）、相位 ∈ [phasemin, phasemax+2π]（旧实现 [0,2π]）。
          const v = readFreqValue(pr, 'oscillatesize')
          const mid = (v.smin + v.smax) / 2, amp = (v.smax - v.smin) / 2
          p.oscSize = { f: v.fmin + p.random * (v.fmax - v.fmin), mid, amp, ph: freqPhase(v, p.random), base: p.size }
        }
        const o = p.oscSize
        // ①(P-130 批A #1) `ω = frequency`（旧实现 `2π·frequency`）
        p.size = Math.max(0.01, o.base * (o.mid + o.amp * Math.cos(o.f * (p.age || 0) + o.ph)))
        break
      }
      case 'oscillateposition': {
        // ①(P-126 D 用户第 8 项) **逐轴增量式**（官方语义；`?pops=legacy` 回退覆盖式）：
        //   `pos[轴] += −scale[轴] · ω · sin(ω·age + φ[轴]) · dt`，三轴各自频率/幅度/相位。
        //   旧实现是 `pos = 首次坐标锚点 + 幅度·cos(单一频率/相位)` —— **每帧覆盖位置** ⇒
        //   movement(drag)/turbulence/controlpointattract 累积出的漂移**全部被抹掉**，萤火虫沿
        //   一条固定对角线来回机械摆动（实测 x 跨度 = y 跨度 = 139.9px、corr(x,y) = −1.0000）。
        //   注意：三轴的频率/幅度/相位仍**只由出生时那一个 `p.random` 派生**（不额外抽 rng()），
        //   以免平移整条 RNG 流（那会连带改变其它算子/发射数 ⇒ 与"只改本算子"的 A/B 不可比）。
        if (!p.oscPos) {
          // ①(P-130 批A #1/#4/#5) 官方 `FrequencyValue`（名称分支：frequencymax 缺省 **5**、
          //   scalemax 缺省 **1**；相位 ∈ [phasemin, phasemax+2π]；ω = frequency）。
          const v = readFreqValue(pr, 'oscillateposition')
          const mask = pVec3(pGetVal(pr, 'mask'), [1, 1, 0])
          const pr3 = [1, 7919, 104729].map((k) => (p.random * k) % 1)
          p.oscPos = {
            f: pr3.map((r) => v.fmin + r * (v.fmax - v.fmin)),
            sc: pr3.map((r) => v.smin + ((r * 104729) % 1) * (v.smax - v.smin)),
            ph: pr3.map((r) => freqPhase(v, r)),
            mask, ox: p.pos[0], oy: p.pos[1],
            // legacy 档：单一频率/相位 + 覆盖式（与 P-124 逐位一致）
            lf: v.fmin + p.random * (v.fmax - v.fmin), lamp: v.smax, lph: p.random * Math.PI * 2,
          }
        }
        const o = p.oscPos
        if (sys.popsLegacy) {
          const c = Math.cos(o.lf * t * Math.PI * 2 + o.lph)
          p.pos[0] = o.ox + o.mask[0] * o.lamp * c
          p.pos[1] = o.oy - o.mask[1] * o.lamp * c   // y 翻转一次
        } else {
          for (let ax = 0; ax < 3; ax++) {
            // ①(P-130 批A #1) `ω = frequency`（rad/s；旧实现 `2π·frequency` ⇒ 快 6.28×）
            const w = o.f[ax]
            const move = -o.sc[ax] * w * Math.sin(w * (p.age || 0) + o.ph[ax]) * dt
            p.pos[ax] += move * o.mask[ax]
            // scenePos 是编辑器 y-up 局部量 ⇒ y 轴增量取反（与 movement 的 scenePos 口径一致）
            if (p.scenePos) p.scenePos[ax] += (ax === 1 ? -move : move) * o.mask[ax]
          }
        }
        break
      }
      // controlpointattract（35 次）：朝控制点加速；scale<0 = 排斥（官方 threshold×0.5 + Accelerate(dir×scale)）
      case 'controlpointattract': {
        const cpIdx = pGetVal(pr, 'controlpoint', 0)
        const cp = (sys.controlPoints || [])[cpIdx]
        const target = cp ? pVec3(cp.offset || cp.origin, [0, 0, 0]) : pVec3(pGetVal(pr, 'origin'), [0, 0, 0])
        const scaleA = pGetVal(pr, 'scale', 0)
        // ①(P-130 批A #6) `threshold` 缺省 = **512**（官方 ControlPointForce 的 `threshold {512.0f}`，
        //   行为对照取自第三方参考实现，未反汇编官方二进制）。我们旧缺省 0 ⇒ `thr = 0` ⇒ 判据 `d < 0`
        //   **恒假** ⇒ 整条算子从不生效（语料 2 层：`0917/3351163962` ln=12/13，scale=-1001000 的排斥）。
        //   官方此处 `threshold × 0.5` 的用法不变（P-126 已按官方口径改成 `d < threshold/2`）。
        const thr = pGetVal(pr, 'threshold', 512) * 0.5
        // ①(P-69 第 6 项) 控制点是 lockToPointer 且有指针 → 目标 = 指针（世界设计坐标，已是 y-down，
        //   不能再做下面那次 y 取反）；否则沿用层空间 target 的旧算法（本次不改其语义）。
        const __cpPtr = __cpWorldLocked(sys, cpIdx) || ((sys.pointer && cpIdx === sys.pointerCp) ? sys.pointer : null)
        // ①(尾迹离开 2026-09-19 · 只读记账，零行为变化) 本算子**实际用的力中心**（世界设计坐标）。
        //   无指针时旧写法会退化成"层空间 offset 当世界坐标用"（= 画面左上角）；这里把有效中心
        //   如实记在 `sys.__ptrForce*` 上，供 `tests/trail-leave-test.mjs` 断言"离开后中心 = 最后离开点、
        //   不是层原点/画面中心"。只在**指针控制点**上当帧写两个 number（就地覆盖，不分配对象、
        //   不进顶点流、不改 RNG）⇒ 稳态代价可忽略；非指针控制点一次都不写。
        if (cpIdx === sys.pointerCp) {
          sys.__ptrForceX = __cpPtr ? __cpPtr[0] : target[0]
          sys.__ptrForceY = __cpPtr ? __cpPtr[1] : -target[1]
          sys.__ptrForceKind = 'controlpointattract'
        }
        const dx = __cpPtr ? (__cpPtr[0] - p.pos[0]) : (target[0] - p.pos[0])
        const dy = __cpPtr ? (__cpPtr[1] - p.pos[1]) : -(target[1] - p.pos[1])
        const d = Math.hypot(dx, dy) || 1
        // ①(P-126 D 用户第 8 项) **判据方向**：官方是 `d < threshold/2` 才施力（近距才吸引/排斥），
        //   旧实现写成 `d > threshold/2`（**正好反了**）⇒ 无指针时全体萤火虫被一个恒定力推离
        //   退化目标（层空间 offset 当世界坐标用 ⇒ 世界 (0,0)=画布左上角）。
        //   ⚠ 这一条与上面的 oscillateposition 必须同批改：只改 oscillateposition 会让粒子
        //   真的被这个反判据推走（实测 x≈9700px，画布宽 3840）。目标空间的换算仍未定（见
        //   docs/PARTICLE-FIREFLY-INVESTIGATION.md §5.4），本批只纠正判据方向。
        if (sys.popsLegacy ? (d > thr) : (d < thr)) {
          const k = (scaleA >= 0 ? 1 : -1) * Math.abs(scaleA) * dt
          p.vel[0] += (dx / d) * k
          p.vel[1] += (dy / d) * k
        }
        break
      }
      // turbulence（28 次）：官方 speed×CurlNoise(pos·2scale+phase+timescale·t)；这里用确定性伪噪声近似
      case 'turbulence': {
        const sc = pGetVal(pr, 'scale', 0.002)
        const smin = pGetVal(pr, 'speedmin', 0), smax = pGetVal(pr, 'speedmax', smin)
        const amp = (smin + ((p.random * 104729) % 1) * (smax - smin)) || smax || 0
        // ①(P-130 批A #5) `phasemin` 也要读：官方 = `random(phasemin, phasemax)`。
        //   ⚠ 与 oscillate* **不同**：两个独立参考实现的 turbulence 相位**都不加 `+2π`**
        //   （`+2π` 只属 `FrequencyValue`，见本文件 `freqPhase`）⇒ 这里按 `[phasemin, phasemax]` 抽。
        //   `?pops=legacy` 保留旧口径（`r × phasemax`，不读 phasemin）。顺带把相位记到粒子上，
        //   供 mock-GL 探针/门禁断言（不改 RNG 流、不进顶点流 ⇒ 零行为副作用）。
        const __phRaw = p.random
        const ph0 = sys.popsLegacy
          ? __phRaw * pGetVal(pr, 'phasemax', 6.28)
          : pGetVal(pr, 'phasemin', 0) + __phRaw * (pGetVal(pr, 'phasemax', 6.28) - pGetVal(pr, 'phasemin', 0))
        // ①(P-131 批 D) 官方 "Audio response … adds a factor to the **Phase** values … this feature
        //   has no effect on particles with a `0.00` phase." ⇒ `ph = ph0 × (1 + env)`（乘性；
        //   ph0=0 的粒子严格不受影响，这正是官方那句话的判据）。env=1（无视图/无源/legacy）时逐位不变。
        const ph = ph0 * (1 + audioPhase)
        p.turbPh = ph
        // ①(P-126 F 用户第 8 项) `mask` 缺省 = **(1,1,0)**（`?pops=legacy` 回退 [1,0,0]）：
        //   hina 两个萤火虫 def 都**没写 mask** ⇒ 旧实现只沿 x 推、y 恒不受力（官方 x+y）。
        //   依据：行为对照的第三方参考实现里 emitter/operator 的 mask 缺省是 (1,1,0)（本实现按
        //   "缺省=两轴都开"的语义独立写死，未复制其代码）。语料里显式写 `"1 1 0"` 的 def
        //   （如 3327063360 的萤火虫）两档一致 ⇒ 只影响"没写 mask"的层。
        const mask = pVec3(pGetVal(pr, 'mask'), sys.popsLegacy ? [1, 0, 0] : [1, 1, 0])
        const n1 = Math.sin((p.pos[0] * sc + ph + t * 0.7) * 3.1) * Math.cos((p.pos[1] * sc - ph) * 2.3)
        const n2 = Math.cos((p.pos[0] * sc - ph) * 2.7) * Math.sin((p.pos[1] * sc + ph + t * 0.5) * 3.3)
        p.vel[0] += n1 * amp * mask[0] * dt
        p.vel[1] += n2 * amp * mask[1] * dt
        break
      }
      // vortex（全语料 7 次，6 次带 distanceinner/distanceouter/speedinner/speedouter）：
      //   绕控制点的切向加速（`v_tangent = (pos − cp) × axis`），速度按半径从 speedinner 线性降到 speedouter。
      // ①(P-133 #4) 两处根因（行为对照：wer-ref `WPParticleParser.cpp:695-722` 的 vortex 分支 +
      //   MIT oneincase/webwallgl `renderer/vendor/we-scene/render/particles.js:1011-1023`）：
      //   ① **字段名全错**：旧实现读 `innerradius`/`outerradius`/`scale`/`speed`，而作者写的是
      //      `distanceinner`/`distanceouter`/`speedinner`/`speedouter`（语料 6/7 处）⇒ 旧代码恒取缺省
      //      `inner=0 / outer=1e9 / 强度=1`：**半径门形同虚设、强度被压成 1px/s²**（等于没有涡流）。
      //   ② **圆心错**：旧实现把圆心缺省成"**每颗粒子自己的出生点**"（`p._vortexCx`，首帧写死），
      //      而官方圆心 = `controlpoints[controlpoint].offset`（缺省 cp0）—— lockToPointer 层就是**光标**。
      //      ⇒ 花瓣不会被光标附近的涡流甩开，"尾迹"整条不成立（用户第 ③ 项）。
      //   单位/符号：`distanceouter − distanceinner` 是**半径**区间（官方 `dis_mid = outer − inner + 0.1`，
      //   旧实现误把外半径当成"世界坐标上界"）；切向用 `axis × radial` 的等价二维式 `(−ry, rx)/d`，
      //   手性由 axis.z 的符号决定（`axis` 缺省 +z）。`?pops=legacy` 逐位回到旧口径（A/B）。
      case 'vortex': {
        const axis = pVec3(pGetVal(pr, 'axis'), [0, 0, 1])
        // ①(P-131 批 D) 官方 "ties the particle speed to audio playback, causing the vortex to stop
        //   spinning when no audio is being played." ⇒ 强度乘 `env`（env=1 = 旧行为逐位不变）。
        const legacy = !!sys.popsLegacy
        const sgn = axis[2] >= 0 ? 1 : -1
        let ccx, ccy, w
        if (legacy) {
          // ── 旧口径（P-131 及之前，逐位保留做 A/B）──────────────────────────────
          const sp = pGetVal(pr, 'scale', pGetVal(pr, 'speed', 1)) * audioK
          const o = pGetVal(pr, 'origin', null) ? pVec3(pGetVal(pr, 'origin'), [0, 0, 0]) : null
          ccx = o ? o[0] : p._vortexCx || (p._vortexCx = p.pos[0])
          ccy = o ? -o[1] : p._vortexCy || (p._vortexCy = p.pos[1])
          const dOld = Math.hypot(p.pos[0] - ccx, p.pos[1] - ccy) || 1
          const innerOld = pGetVal(pr, 'innerradius', 0), outerOld = pGetVal(pr, 'outerradius', 1e9)
          const tx = -(p.pos[1] - ccy) / dOld, ty = (p.pos[0] - ccx) / dOld
          w = (dOld < innerOld || dOld > outerOld) ? 0 : sp
          p.vel[0] += tx * w * sgn * dt
          p.vel[1] += ty * w * sgn * dt
          break
        }
        // ── 官方口径 ──────────────────────────────────────────────────────────
        const baseIn = pGetVal(pr, 'speedinner', pGetVal(pr, 'scale', pGetVal(pr, 'speed', 1)))
        const spIn = baseIn * audioK
        const spOut = pGetVal(pr, 'speedouter', baseIn) * audioK
        const inner = pGetVal(pr, 'distanceinner', 0)
        const outer = pGetVal(pr, 'distanceouter', 1e9)
        // 该 vortex 相对控制点的偏移（`offset` / 旧名 `origin`，层空间 ⇒ y 取反）
        const off = pVec3(pGetVal(pr, 'offset', pGetVal(pr, 'origin', null)), [0, 0, 0])
        // 圆心（世界设计坐标，y-down）= 控制点当前位置 + cp.offset + 本算子 offset。
        //   lockToPointer 的控制点 ⇒ **光标**（这就是"尾迹"的来源）；非指针控制点 ⇒ 层 origin。
        const cpIdx = pGetVal(pr, 'controlpoint', 0)
        const cp = (sys.controlPoints || [])[cpIdx]
        const ptrCp = (typeof sys.pointerCp === 'number') ? sys.pointerCp : -1
        const cpOff = cp ? pVec3(cp.offset || cp.origin, [0, 0, 0]) : [0, 0, 0]
        // ①(P-136 用户第 4 项：照抄上游 MIT 实现) 锁指针控制点 ⇒ 圆心走照抄来的 `cpWorld`
        //   （上游 `_cpPos` + `toWorld`）；非指针控制点 ⇒ 逐字沿用 P-133 的旧算式。
        const __cpPtrW = __cpWorldLocked(sys, cpIdx)
        const usePtr = !!__cpPtrW
        const baseX = usePtr ? __cpPtrW[0] : sys.origin[0]
        const baseY = usePtr ? __cpPtrW[1] : sys.origin[1]
        ccx = baseX + cpOff[0] + off[0]
        ccy = baseY - cpOff[1] - off[1]
        // ①(尾迹离开 2026-09-19 · 只读记账，零行为变化) 同 controlpointattract：把本帧**实际用的圆心**
        //   记在 `sys.__ptrForce*` 上。无指针时 `usePtr=false` ⇒ 圆心 = `sys.origin`（图层原点；
        //   全屏尾迹层就是**画面中心**）—— 上游 `particles.js:1011` 的 `|| [0, 0, 0]` 同一形态。
        //   "离开后被拖到画面中央"就是这条记下来的圆心换了地方。只在指针控制点上写（见上）。
        if (!legacy && cpIdx === ptrCp) {
          sys.__ptrForceX = ccx
          sys.__ptrForceY = ccy
          sys.__ptrForceKind = 'vortex'
        }
        // ①(P-136 用户第 4 项：照抄上游 MIT 实现) 切向加速这一段**整块**改为调用照抄来的
        //   `vortexSwirl`（← 上游 `renderer/vendor/we-scene/render/particles.js:1010-1024`）。
        //   本仓库只留在外面：圆心解析、音频门控 `audioK`、`axis.z` 手性 `sgn`。
        //   ⚠ 与 P-133 独立实现的唯一差别：半径权重上游是 `k = clamp((d−inner)/(outer−inner))`，
        //   P-133 用的是 wer-ref 的 `(d−inner)/(outer−inner+0.1)`；`③-c-1` 的容差 0.5 覆盖这 0.299
        //   （实测 150.00 vs 150.30 px/s²，判据见 P-136 台账「行为差」）。
        const dv = vortexSwirl(p.pos[0], p.pos[1], [ccx, ccy, 0],
          { offset: [0, 0, 0], distanceInner: inner, distanceOuter: outer, speedInner: spIn, speedOuter: spOut }, dt)
        if (dv) { p.vel[0] += dv[0] * sgn; p.vel[1] += dv[1] * sgn }
        break
      }
      // colorchange（6 次）：官方是**乘**（`MutiplyColor`），不是赋值 —— 逐粒子色差被保留。
      // ①(P-130 批A #7) 行为对照（第三方参考实现，未反汇编官方二进制）：
      //   官方对每颗粒子算 `change[i] = FadeValueChange(life, starttime, endtime, startvalue[i], endvalue[i])`
      //   再 `p.color *= change`；`FadeValueChange` 是**线性**的（`life<=start → startvalue`、
      //   `life>end → endvalue`、其间 `lerp((life−start)/(end−start))`，**不 clamp、不 smoothstep**）。
      //   缺省：starttime 0 / endtime 1 / startvalue {0,0,0} / endvalue {0,0,0}（⇒ 没写 startvalue 的层
      //   在 `life<=starttime` 段被乘成 0 = 官方语义，不是 bug）。
      //   我们旧实现是 `p.color = mix(startvalue, endvalue, u)`（**赋值** + smoothstep）⇒ 末段**所有粒子同色**
      //   （语料 13 层 / 4 包被抹平，如 `0917/3233141951` ln=13「龙烟」`.
      //   `?pcolor=legacy` = 回到旧的赋值口径（真机 A/B）。
      case 'colorchange': {
        if (sys.pcolorLegacy) {
          const endT = pGetVal(pr, 'endtime', 1)
          const endV = pVec3(pGetVal(pr, 'endvalue'), [1, 1, 1])
          const startV = pVec3(pGetVal(pr, 'startvalue'), p.baseColor || [1, 1, 1])
          const u = endT > 0 ? Math.max(0, Math.min(1, p.age / endT)) : 1
          p.color = [
            startV[0] + (endV[0] - startV[0]) * u,
            startV[1] + (endV[1] - startV[1]) * u,
            startV[2] + (endV[2] - startV[2]) * u,
          ]
          break
        }
        const startT = pGetVal(pr, 'starttime', 0)
        const endT = pGetVal(pr, 'endtime', 1)
        const endV = pVec3(pGetVal(pr, 'endvalue'), [0, 0, 0])
        const startV = pVec3(pGetVal(pr, 'startvalue'), [0, 0, 0])
        const life = p.life > 0 ? p.age / p.life : 1
        const ch = fadeValueChange(life, startT, endT, startV, endV)
        // 乘的**基准**必须是"出生期快照色"（`p.baseColor` = 作者 initializer + instanceoverride 之后的值）：
        //   官方每帧先 `PM::Reset(p)`（`p.color = p.init.color`）再跑算子 ⇒ `MutiplyColor` 每帧只乘一次；
        //   若像加法那样在**上一帧结果**上累乘，颜色会按帧数指数衰减到 0（实测 t=0.05s 起恒 [0,0,0]）。
        const bc = p.baseColor || p.color
        p.color = [bc[0] * ch[0], bc[1] * ch[1], bc[2] * ch[2]]
        break
      }
      // ①(P-126 C/D/F 清理) 这里原本还有 4 个**重复的 `case` 标签**（turbulence / oscillatealpha /
      //   oscillatesize / oscillateposition）：JS `switch` 取**第一个**匹配分支，所以它们永远执行不到，
      //   却是同一批算子的第二套（官方口径的）实现 —— 这既是"看起来像已修其实没生效"的来源，
      //   也是一颗雷（任何人重排 case 都会静默换语义）。本批把官方口径**合并进上面活代码**，
      //   然后删掉这 4 段死代码；`?pops=legacy` 提供旧行为的 A/B 回退（见上面各 case 内的分支）。
    }
  }
}

// ===== src/render/hlsl2glsl.js =====
// WE shader（HLSL 方言）→ GLSL ES 3.0 转译器
// 覆盖 WE 效果 shader 的实际语法面：预处理（#include/#define/#if combo）+ 方言转换。
// 依据：linux-wallpaperengine 的 GLSLContext 思路 + 本仓库提取的全部效果 shader 实测语法。
// mul 语义：HLSL 行向量约定 → GLSL 列向量约定（transpose 处理）；效果 pass 的 MVP=单位矩阵时二者等价。

// ---------- 预处理 ----------

// 收集宏定义（对象宏 + 函数宏）
function collectMacros(src) {
  const defs = new Map()
  const fns = new Map()
  const re = /^[ \t]*#define[ \t]+([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]*)\))?[ \t]*(.*)$/gm
  let m
  while ((m = re.exec(src)) !== null) {
    if (m[2] !== undefined) {
      fns.set(m[1], { args: m[2].split(',').map((s) => s.trim()).filter(Boolean), body: m[3].trim() })
    } else {
      defs.set(m[1], m[3].trim())
    }
  }
  return { defs, fns }
}

// 函数宏展开（平衡括号取参，递归深度限制）
function expandFunctionMacro(text, name, info, depth) {
  const out = []
  let i = 0
  while (i < text.length) {
    const idx = text.indexOf(name, i)
    if (idx === -1) {
      out.push(text.slice(i))
      break
    }
    out.push(text.slice(i, idx))
    const p = idx + name.length
    // 必须是函数调用形式：下一个非空白字符是 '('
    let q = p
    while (q < text.length && /\s/.test(text[q])) q++
    if (text[q] !== '(') {
      out.push(text.slice(idx, q))
      i = q
      continue
    }
    // 平衡括号取参数
    let depthCount = 0
    let end = q
    for (; end < text.length; end++) {
      if (text[end] === '(') depthCount++
      else if (text[end] === ')') {
        depthCount--
        if (depthCount === 0) break
      }
    }
    if (end >= text.length) {
      out.push(text.slice(idx))
      break
    }
    const argsStr = text.slice(q + 1, end)
    const args = splitArgs(argsStr)
    let body = info.body
    info.args.forEach((name, k) => {
      const val = args[k] !== undefined ? args[k].trim() : ''
      body = replaceWord(body, name, val)
    })
    if (depth > 0) body = expandMacrosIn(body, depth - 1)
    out.push('(' + body + ')')
    i = end + 1
  }
  return out.join('')
}

function replaceWord(text, word, replacement) {
  return text.replace(new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), replacement)
}

function splitArgs(s) {
  const out = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    if (c === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  if (cur.trim() !== '') out.push(cur)
  return out
}

// 展开宏（对象宏 + 函数宏），多轮迭代直到无宏残留（宏可互相引用）。
// 预处理行（# 开头）不展开，避免 #define 行自身被误当作调用。
function expandMacrosIn(text, depth) {
  // 按行序展开：HLSL 预处理语义 = #define 只影响定义之后的行。
  // （WE shader 存在先声明同名变量、后 #define 覆盖用的写法，全局展开会破坏声明行，
  //   例如 light_map.frag: `vec3 lightMap = CAST3(0.0), emitters;` + 后面 `#define emitters 1.0`）
  for (let round = 0; round < 12; round++) {
    const lines = text.split('\n')
    const defs = new Map()
    const fns = new Map()
    let changed = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const t = line.trim()
      const dm = /^#define[ \t]+([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]*)\))?[ \t]*(.*)$/.exec(t)
      if (dm) {
        // 本行注册宏（不展开本行；#define 行随后由调用方剥离）
        if (dm[2] !== undefined) {
          fns.set(dm[1], { args: dm[2].split(',').map((x) => x.trim()).filter(Boolean), body: dm[3].trim() })
        } else {
          defs.set(dm[1], dm[3].trim() === '' ? '1' : dm[3].trim())
        }
        continue
      }
      if (/^[ \t]*#/.test(line)) continue
      let l = line
      for (const [name, val] of defs) {
        if (l === line && new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(l)) changed = true
        l = replaceWord(l, name, val)
      }
      for (const [name, info] of fns) {
        if (l.includes(name)) {
          l = expandFunctionMacro(l, name, info, depth)
          changed = true
        }
      }
      lines[i] = l
    }
    text = lines.join('\n')
    if (!changed) break
  }
  return text
}

// 求值 #if 表达式（安全自写求值器：|| && ! ( ) == != < > <= >= 数字 标识符）
function evalIfExpr(expr, combos, defs) {
  const resolve = (name) => {
    if (combos[name] !== undefined) return String(combos[name])
    if (defs.has(name)) return '(' + defs.get(name) + ')'
    return '0'
  }
  let s = expr.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (n) => resolve(n))
  // 递归下降
  let i = 0
  function skipWs() {
    while (i < s.length && /\s/.test(s[i])) i++
  }
  function parseOr() {
    let v = parseAnd()
    skipWs()
    while (s.startsWith('||', i)) {
      i += 2
      const r = parseAnd()
      v = v || r
      skipWs()
    }
    return v
  }
  function parseAnd() {
    let v = parseEq()
    skipWs()
    while (s.startsWith('&&', i)) {
      i += 2
      const r = parseEq()
      v = v && r
      skipWs()
    }
    return v
  }
  function parseEq() {
    let v = parseRel()
    skipWs()
    while (s.startsWith('==', i) || s.startsWith('!=', i)) {
      const op = s[i] === '=' ? '==' : '!='
      i += 2
      const r = parseRel()
      v = op === '==' ? v === r : v !== r
      skipWs()
    }
    return v
  }
  function parseRel() {
    let v = parseUnary()
    skipWs()
    while (/^[<>]/.test(s[i] || '')) {
      let op = s[i]
      if (s[i + 1] === '=') {
        op += '='
        i++
      }
      i++
      const r = parseUnary()
      if (op === '<') v = v < r
      else if (op === '>') v = v > r
      else if (op === '<=') v = v <= r
      else v = v >= r
      skipWs()
    }
    return v
  }
  function parseUnary() {
    skipWs()
    if (s[i] === '!') {
      i++
      return !parseUnary()
    }
    return parseAtom()
  }
  function parseAtom() {
    skipWs()
    if (s[i] === '(') {
      i++
      const v = parseOr()
      skipWs()
      i++ // )
      return v
    }
    const m = /^-?\d+(\.\d+)?/.exec(s.slice(i))
    if (m) {
      i += m[0].length
      return Number(m[0])
    }
    return false
  }
  return parseOr()
}

// 行级预处理：展开 #include、按 combo 裁剪 #if 块
function preprocess(src, combos, includeResolver, depth) {
  const lines = src.split('\n')
  const out = []
  const stack = [] // { parent, hit }（不支持 #elif；#else 取反 hit）
  const defs = new Map()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.trim()
    if (t.startsWith('#include')) {
      if (allActive(stack)) {
        const m = /^#include[ \t]+"([^"]+)"|^#include[ \t]+<([^>]+)>/.exec(t)
        const file = m && (m[1] || m[2])
        const inc = file && includeResolver ? includeResolver(file) : null
        if (inc !== null && inc !== undefined) {
          out.push(preprocess(inc, combos, includeResolver, depth + 1))
        } else {
          out.push('// [include 缺失: ' + file + ']')
        }
      }
      continue
    }
    if (t.startsWith('#define')) {
      if (allActive(stack)) {
        out.push(line)
        const m = /^#define[ \t]+([A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?[ \t]*(.*)$/.exec(t)
        if (m) defs.set(m[1], m[2].trim())
      }
      continue
    }
    if (t.startsWith('#undef')) {
      if (allActive(stack)) out.push(line)
      continue
    }
    if (t.startsWith('#ifdef') || t.startsWith('#ifndef') || t.startsWith('#if')) {
      const parent = allActive(stack)
      let cond = false
      if (t.startsWith('#ifdef')) {
        const name = t.slice(6).trim().split(/\s+/)[0]
        cond = combos[name] !== undefined || defs.has(name)
      } else if (t.startsWith('#ifndef')) {
        const name = t.slice(7).trim().split(/\s+/)[0]
        cond = !(combos[name] !== undefined || defs.has(name))
      } else {
        try {
          cond = !!evalIfExpr(t.slice(3).trim(), combos, defs)
        } catch (e) {
          cond = false
        }
      }
      stack.push({ parent, hit: cond })
      continue
    }
    if (t.startsWith('#else')) {
      if (stack.length > 0) stack[stack.length - 1].hit = !stack[stack.length - 1].hit
      continue
    }
    if (t.startsWith('#elif')) {
      // 不支持 #elif（WE shader 未使用）：当作终止
      continue
    }
    if (t.startsWith('#endif')) {
      if (stack.length > 0) stack.pop()
      continue
    }
    if (t.startsWith('#')) {
      continue
    }
    if (allActive(stack)) out.push(line)
  }
  return out.join('\n')
}

function allActive(stack) {
  return stack.every((s) => s.parent && s.hit)
}

// ---------- 方言语法转换 ----------

// 平衡括号内内容（返回右括号位置）
function matchParen(text, openIdx) {
  let depth = 0
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

// 替换 callName(args) 形式（嵌套安全；callName 前必须是词边界，避免误匹配 Desaturate→saturate 之类）
function rewriteCall(text, callName, fn) {
  let out = ''
  let i = 0
  while (i < text.length) {
    const idx = text.indexOf(callName, i)
    if (idx === -1) {
      out += text.slice(i)
      break
    }
    // 词边界：前一个字符不能是标识符字符
    if (idx > 0 && /[A-Za-z0-9_]/.test(text[idx - 1])) {
      out += text.slice(i, idx + 1)
      i = idx + 1
      continue
    }
    out += text.slice(i, idx)
    let q = idx + callName.length
    while (q < text.length && /\s/.test(text[q])) q++
    if (text[q] !== '(') {
      out += text.slice(idx, q)
      i = q
      continue
    }
    const end = matchParen(text, q)
    if (end === -1) {
      out += text.slice(idx)
      break
    }
    const inner = text.slice(q + 1, end)
    out += fn(inner, idx)
    i = end + 1
  }
  return out
}
function floatifyIntArgs(text) {
  // 在 (step|pow|mix|clamp|...) 调用的参数区里，把独立整数字面量补 .0（GLSL ES 无 int→float 隐式转换）
  const re = /\b(step|smoothstep|mix|clamp|min|max|pow|log|log2|exp|sqrt|abs|floor|ceil|fract|sign|mod|atan|asin|acos|length|distance)\s*\(/g
  let out = ''
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    const open = m.index + m[0].length - 1
    const end = matchParen(text, open)
    if (end === -1) {
      out += text.slice(last, m.index + m[0].length)
      last = m.index + m[0].length
      continue
    }
    const args = text.slice(open + 1, end)
    const fixed = args.replace(/(?<![.\wEe])(?<![eE][+-])(-?\d+)(?![.\dEe])/g, (num) => (num.includes('.') ? num : num + '.0'))
    out += text.slice(last, open + 1) + fixed
    last = end
    re.lastIndex = end
  }
  out += text.slice(last)
  return out
}

export { preprocess }

/** ①(P-134 ⑥ 第三处) 从一段 shader 源码里取 `// [COMBO] {…}` 声明的默认值（无 `default` 的项不产出）。 */
export function parseComboDefaults(text) {
  const defaults = {}
  const comboRe = /\[COMBO\][^\n]*?"combo"\s*:\s*"([^"]+)"[^\n]*?"default"\s*:\s*(-?\d+)/g
  let m
  while ((m = comboRe.exec(String(text || ''))) !== null) defaults[m[1]] = Number(m[2])
  return defaults
}

/** ①(P-134 ⑥ 第三处) 把 `siblingText` 里**本方没有声明**的 `[COMBO]` 声明行补到 `srcText` 末尾。
 *
 *  为什么：combo 声明是**按文件**解析的，而 WE 的一个材质 pass = vert + frag **两张源共用一张
 *  combo 表** —— 官方（行为对照：`references/wer-ref` GPL-2.0-only 的 `WPSceneParser.cpp:3691-3713`
 *  `compile_shader` 只用**一个** `WPShaderInfo`，两个 stage 依次 `PreShaderSrc` 填同一张 `combos` 表，
 *  再一起 `PreprocessDxcWeSource(unit.src, unit.stage, shader_info->combos, …)`）。
 *  典型的现实后果：`Simple_Audio_Bars` 的 `BAR_STYLE` **只在 .vert 里声明**（default 1 = 圆角矩形），
 *  frag 里没有 ⇒ frag 按"无声明 = 0"编译（直角矩形）⇒ 顶点侧按圆角定位、片元侧按直角判覆盖。
 *  这里取**并集**：把对方独有的声明行以 `//` 注释形式**追加到本源末尾**（不改任何 GLSL 语义、
 *  不动行号；`parseMaterialMeta`/`parseTextureCombos` 都要求注释前有 `uniform …;` ⇒ 不受影响）。
 *  同名 combo 两边都声明时**本方保留自己的值**（对方不覆盖）—— 与 wer-ref "后解析者覆盖"的差异
 *  只在这类冲突上出现，属未证实项（见 P-134 台账）。 */
export function withSiblingComboDefaults(srcText, siblingText) {
  const own = parseComboDefaults(srcText)
  const lines = []
  for (const ln of String(siblingText || '').split('\n')) {
    if (!ln.includes('[COMBO]')) continue
    const m = /"combo"\s*:\s*"([^"]+)"/.exec(ln)
    if (!m || own[m[1]] !== undefined || lines.some((x) => x.name === m[1])) continue
    const d = /"default"\s*:\s*(-?\d+)/.exec(ln)
    if (!d) continue
    lines.push({ name: m[1], text: ln.trim() })
  }
  if (!lines.length) return srcText
  const text = String(srcText || '')
  return text + (text.endsWith('\n') || text === '' ? '' : '\n') + lines.map((x) => x.text).join('\n') + '\n'
}

export function hlsl2glsl(src, stage, combos, includeResolver) {
  // combo 默认值：WE 语义 = 未显式提供时用声明里的 default（无声明 → 0）
  // （依据 linux-wallpaperengine ShaderUnit.cpp:442-477 parseComboConfiguration）
  // ①(P-134 ⑥ 第三处)：渲染路径交给本函数的 `src` 已由 `withSiblingComboDefaults()` 补过对方 stage
  //   独有的声明（见 getEffectProgram）⇒ 两 stage 拿到同一套默认值；直接调用本函数（工具/测试）时
  //   仍只按传入的这一个文件解析，行为一字不变。
  const defaults = parseComboDefaults(src)
  const effective = { ...defaults, ...(combos || {}) }
  let code = preprocess(src, effective, includeResolver, 0)  // 展开本文件保留的宏（#define 行仍在，GLSL 预处理器会展开；但函数宏在 GLSL ES 也支持，
  // 为稳妥起见用 JS 预展开，然后移除 #define 行）
  code = expandMacrosIn(code, 20)
  code = code.replace(/^[ \t]*#define[^\n]*\n?/gm, '')

  // 代码中作为标识符使用的 combo（如 ApplyBlending(BLENDMODE, ...)）替换为数值；未定义 combo 用声明 default，无声明 = 0
  // 从 [COMBO] 注释提取全部 combo 名（含未提供的）
  {
    const comboNames = new Set()
    const comboRe2 = /\[COMBO\][^\n]*"combo"\s*:\s*"([^"]+)"/g
    let c2
    while ((c2 = comboRe2.exec(code)) !== null) comboNames.add(c2[1])
    for (const name of comboNames) {
      const v = effective[name] !== undefined ? effective[name] : 0
      code = replaceWord(code, name, String(v))
    }
  }

  // GLSL ES 3.0 保留字（WE 变量名与之冲突）
  code = replaceWord(code, 'sample', 'smp')

  // 数值后缀 f/h
  code = code.replace(/(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)[fh]\b/g, '$1')

  // 类型名
  code = code.replace(/\bfloat4x4\b/g, 'mat4')
    .replace(/\bfloat3x3\b/g, 'mat3')
    .replace(/\bfloat2x2\b/g, 'mat2')
    .replace(/\bfloat4\b/g, 'vec4')
    .replace(/\bfloat3\b/g, 'vec3')
    .replace(/\bfloat2\b/g, 'vec2')
    .replace(/\bhalf4\b/g, 'vec4')
    .replace(/\bhalf3\b/g, 'vec3')
    .replace(/\bhalf2\b/g, 'vec2')
    .replace(/\bhalf\b/g, 'float')

  // 纹理采样与饱和
  code = code.replace(/\btexSample2DLod\b/g, 'textureLod').replace(/\btexSample2D\b/g, 'texture')
  code = rewriteCall(code, 'saturate', (inner) => 'clamp(' + inner + ', 0.0, 1.0)')
  // HLSL atan2(y, x) → GLSL atan(y, x)
  code = rewriteCall(code, 'atan2', (inner) => 'atan(' + inner + ')')
  // 矩阵 CAST（WE HLSL 的 CAST3X3 等 → GLSL matN 构造；参数多为 mat4/mat3，ES 3.0 支持取左上子阵）
  code = rewriteCall(code, 'CAST3X3', (inner) => 'mat3(' + inner + ')')
  code = rewriteCall(code, 'CAST2X2', (inner) => 'mat2(' + inner + ')')
  code = rewriteCall(code, 'CAST4X4', (inner) => 'mat4(' + inner + ')')
  code = rewriteCall(code, 'CAST4', (inner) => 'vec4(' + inner + ')')
  code = rewriteCall(code, 'CAST3', (inner) => 'vec3(' + inner + ')')
  code = rewriteCall(code, 'CAST2', (inner) => 'vec2(' + inner + ')')

  // HLSL 标量广播：max(0, x.rgb) → max(vec3(0), x.rgb)（同样 min）
  code = code.replace(/\b(max|min)\(\s*(-?\d+(?:\.\d+)?)\s*,\s*([A-Za-z_]\w*\.(rgb|xyz|rg|xy|r|x))\s*\)/g, (all, fn, num, expr, sw) => {
    const dim = sw.length
    return fn + '(vec' + dim + '(' + num + '), ' + expr + ')'
  })

  // HLSL 隐式 int→float 转换：乘除两侧的整数字面量补 .0（WE 效果 shader 中此类仅出现在 float 上下文）
  // 左侧字面量需排除标识符尾部数字（如 diffx1 * diffy2 不得改写成 diffx1.0）
  code = code.replace(/(^|[^\w.])(\d+)\s*([*/])\s*([A-Za-z_][A-Za-z0-9_]*)/g, '$1$2.0 $3 $4')
  code = code.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\s*([*/])\s*(\d+)(?![\d.])/g, '$1 $2 $3.0')
  // 字面量 × 字面量（如 3.14159 * 2）
  code = code.replace(/(\d+\.\d+)\s*([*/])\s*(\d+)(?![\d.])/g, '$1 $2 $3.0')
  code = code.replace(/(^|[^\w.])(\d+)\s*([*/])\s*(\d+\.\d+)/g, '$1$2.0 $3 $4')

  // + / - 的隐式 int→float（GLSL 无此隐式转换，WE HLSL 有）：
  // 仅当可证明浮点上下文时转换——左侧为浮点字面量（2.0 - 1）或 swizzle 表达式（x.xyz - 1），
  // 以及左侧整数字面量、右侧为浮点字面量或 swizzle 表达式（1 + 2.0 / 1 + x.xyz）。
  code = code.replace(/(\.\d+)\s*([+-])\s*(\d+)(?![\d.])/g, '$1 $2 $3.0')
  code = code.replace(/([A-Za-z_]\w*\.(?:xyzw|xyz|xy|zw|rgba|rgb|rg|x|y|z|w|r|g|b|a))\s*([+-])\s*(\d+)(?![\d.])/g, '$1 $2 $3.0')
  code = code.replace(/(^|[^\w.])(\d+)\s*([+-])\s*(\d+\.\d+)/g, '$1$2.0 $3 $4')
  code = code.replace(/(^|[^\w.])(\d+)\s*([+-])\s*([A-Za-z_]\w*\.(?:xyzw|xyz|xy|zw|rgba|rgb|rg|x|y|z|w|r|g|b|a))/g, '$1$2.0 $3 $4')
  // 整数字面量 ± 浮点类型变量（如 1 - g_Rough、1 + time）：
  // 收集声明为 float/vec/mat 的 uniform 与局部变量名，仅对这些名字补 .0（int 变量不受影响）
  {
    const floatNames = new Set()
    // ①(patch) 补 varying/attribute 前缀（varying float x 在转译前仍是 varying）
    const declRe = /\b(?:uniform|varying|attribute)\s+(?:highp|mediump|lowp\s+)?(?:float|vec2|vec3|vec4|mat2|mat3|mat4)\s+([A-Za-z_][A-Za-z0-9_]*)/g
    let dm
    while ((dm = declRe.exec(code)) !== null) floatNames.add(dm[1])
    if (floatNames.size > 0) {
      const alt = Array.from(floatNames).sort((a, b) => b.length - a.length).join('|')
      code = code.replace(new RegExp('(^|[^\\w.])(\\d+)\\s*([+-])\\s*(' + alt + ')(?![A-Za-z0-9_])', 'g'), '$1$2.0 $3 $4')
      // ①(patch) float/vec 变量的纯赋值右侧整数字面量补 .0（如 i_DCorrectingFactor = 1;）
      // GLSL ES 无 int→float 隐式转换；WE shader 常写 var = 0/1 赋给 float
      code = code.replace(new RegExp('\\b(' + alt + ')\\s*=\\s*(\\d+)(?![\\d.])', 'g'), '$1 = $2.0')
    }
  }

  // GLSL 内置 float 函数的实参中不允许裸 int（无隐式转换）：smoothstep 等调用内的整数字面量补 .0
  code = code.replace(/smoothstep\([^)]*\)/g, (call) => call.replace(/(?<![A-Za-z0-9_.])(\d+)(?![.\d])/g, '$1.0'))

  // ---- 综合 int 字面量浮点化（WE HLSL 允许 int→float 隐式转换；GLSL ES 3.0 不允许）----
  // 收集 int/uint 变量名（下标/循环计数等整数上下文；这些名字旁的 int 字面量保持 int）
  const intNames2 = new Set()
  {
    const ir = /\b(?:const\s+)?(?:highp|mediump|lowp\s+)?(?:int|uint)\s+([A-Za-z_][A-Za-z0-9_]*)/g
    let im
    while ((im = ir.exec(code)) !== null) intNames2.add(im[1])
  }
  // 收集 float/vec/mat 变量名（含分量赋值/算术左操作数判定）
  const floatNames2 = new Set()
  {
    const dr = /\b(?:const\s+)?(?:uniform\s+)?(?:highp|mediump|lowp\s+)?(?:float|vec2|vec3|vec4|mat2|mat3|mat4)\s+([A-Za-z_][A-Za-z0-9_]*)/g
    let dm
    while ((dm = dr.exec(code)) !== null) floatNames2.add(dm[1])
  }
  const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const intNamesRe2 = intNames2.size ? new RegExp('\\b(?:' + [...intNames2].map(escRe).join('|') + ')\\b') : null
  // 2a. 声明初始化：float x = 1; / vec3 y = 2;
  code = code.replace(/\b(?:const\s+)?(?:highp|mediump|lowp\s+)?(float|vec2|vec3|vec4|mat2|mat3|mat4)\s+([A-Za-z_]\w*)\s*=\s*(-?\d+)(?![.\deE])/g, '$1 $2 = $3.0')
  // 2b. 赋值/复合赋值给浮点变量或其分量：v_TexCoord.w = 0; x = 1; x += 2;（int 变量除外）
  if (floatNames2.size) {
    const alt = [...floatNames2].sort((a, b) => b.length - a.length).map(escRe).join('|')
    code = code.replace(new RegExp('\\b(' + alt + ')(\\.[xyzwrgbast]{1,4})?\\s*([+\\-*/]?=)\\s*(-?\\d+)(?![.\\deE])', 'g'), (all, nm, sw, op, n) => {
      if (intNamesRe2 && intNamesRe2.test(nm)) return all
      return nm + (sw || '') + ' ' + op + ' ' + n + '.0'
    })
  }
  // 2c. 算术右侧整数字面量（左侧为浮点名/分量/闭括号/浮点字面量；int 变量左侧除外）
  code = code.replace(/(?<![.\w])([A-Za-z_]\w*\.(?:xyzw|xyz|xy|zw|rgba|rgb|rg|x|y|z|w|r|g|b|a)|[A-Za-z_]\w*|\)|\.\d+|\d+\.\d+)\s*([+\-*/])\s*(-?\d+)(?![.\deE])/g, (all, lhs, op, n) => {
    const m = lhs.match(/([A-Za-z_]\w*)$/)
    if (m && intNamesRe2 && intNamesRe2.test(m[1])) return all
    return lhs + ' ' + op + ' ' + n + '.0'
  })
  // 2d. 浮点 % 整数字面量 → mod(x, n.0)（GLSL ES 3.0 的 % 仅限整数）
  code = code.replace(/(?<![.\w])([A-Za-z_]\w*|\w+\.(?:xyzw|xyz|xy|rgba|rgb|rg|x|y|z|w|r|g|b|a))\s*%\s*(-?\d+)(?![.\deE])/g, (all, lhs, n) => {
    const m = lhs.match(/([A-Za-z_]\w*)$/)
    if (m && intNamesRe2 && intNamesRe2.test(m[1])) return all
    return 'mod(' + lhs + ', ' + n + '.0)'
  })
  // 2e. 浮点内建函数调用参数里的独立整数字面量 → .0（step(0, x)、pow(x, 2) 等；参数为 sampler 的函数不在列表内）
  code = floatifyIntArgs(code)
  // 2e2. clamp/min/max 首个参数为 int/uint 变量时（GLSL 有 int 重载），把参数区整浮点字面量还原为 int
  //      （audioline.frag: int index; index = clamp(index, 0.0, BANDS - 1.0); 应为整数语义）
  if (intNamesRe2) {
    const alt = [...intNames2].sort((a, b) => b.length - a.length).map(escRe).join('|')
    code = code.replace(new RegExp('\\b(clamp|min|max)\\(\\s*(' + alt + ')\\s*,([^()]*)\\)', 'g'), (all, fn, nm, rest) => {
      const fixedRest = rest.replace(/\b(\d+)\.0+\b/g, '$1')
      return fn + '(' + nm + ',' + fixedRest + ')'
    })
  }

  // 2f. HLSL 向量→标量隐式转换：float x = <vec表达式>;（无函数调用时安全标量化取 .x）
  code = code.replace(/\bfloat\s+([A-Za-z_]\w*)\s*=\s*([^;()]*?\.(?:xy|xyz|xyw|rg|rgb|rgba)\b[^;()]*?);/g, (all, nm, rhs) => 'float ' + nm + ' = (' + rhs + ').x;')
  // 2g. HLSL bool 参与算术的惯用法：(a < b) * x 等 → float(bool)
  code = code.replace(/(\s)(\([^()]*?(?:<=|>=|==|!=|<|>)[^()]*?\))(\s*[*\/])/g, '$1float$2$3')
  code = code.replace(/([*\/]\s*)(\([^()]*?(?:<=|>=|==|!=|<|>)[^()]*?\))/g, '$1float$2')
  code = code.replace(/([+\-*/]?=)\s*(\([^()]*?(?:<=|>=|==|!=|<|>)[^()]*?\))(?=\s*[;,)])/g, '$1 float$2')

  // mul(a, b)：HLSL 行向量语义
  // 收集矩阵类型 uniform/局部变量名
  const matNames = new Set()
  const matRe = /\b(?:uniform\s+)?(?:mat4|mat3|mat2|float4x4)\s+([A-Za-z_][A-Za-z0-9_]*)/g
  let mm
  while ((mm = matRe.exec(code)) !== null) matNames.add(mm[1])
  code = rewriteCall(code, 'mul', (inner) => {
    const args = splitArgs(inner)
    if (args.length !== 2) return 'mul(' + inner + ')'
    const a = args[0].trim()
    const b = args[1].trim()
    const isMat = (s) => matNames.has(s.split(/[\[.\s]/)[0]) || /^mat[234]\(/.test(s)
    if (isMat(a) && isMat(b)) return '(transpose(' + b + ') * transpose(' + a + '))'
    if (isMat(b)) return '(transpose(' + b + ') * ' + a + ')'
    return '(' + a + ' * ' + b + ')'
  })

  // lerp → mix；frac → fract（HLSL 名）
  code = code.replace(/\blerp\b/g, 'mix').replace(/\bfrac\b/g, 'fract')

  // varying/attribute → in/out
  if (stage === 'vert') {
    code = code.replace(/\battribute\b/g, 'in').replace(/\bvarying\b/g, 'out')
  } else {
    code = code.replace(/\bvarying\b/g, 'in').replace(/\battribute\b/g, 'in')
  }

  // 2i. 片元阶段若写入 varying 输入（WE 部分效果会修改 v_TexCoord，如 geometric_transform 的 Orbicular）：
  //     转成影子局部变量（GLSL ES 的 in 是只读的）。输入声明保留原名保证与顶点着色器链接。
  //     注：函数内已有同名局部重声明（HLSL/GLSL 遮蔽合法，如 lens_flare_sun 的 varying timer + 局部 timer）时跳过。
  if (stage === 'frag') {
    const inRe = /\bin\s+(float|vec2|vec3|vec4|mat2|mat3|mat4)\s+([A-Za-z_][A-Za-z0-9_]*);/g
    const mainBody = (() => { const mi = code.indexOf('void main'); return mi === -1 ? '' : code.slice(mi) })()
    const written = new Map()
    let dm2
    while ((dm2 = inRe.exec(code)) !== null) {
      const nm = dm2[2]
      // main 内有同名局部声明 → 写入针对局部，无需影子化
      const shadowRe = new RegExp('\\b(?:float|vec2|vec3|vec4|mat2|mat3|mat4)\\s+' + nm + '\\s*(?:=|;)')
      if (shadowRe.test(mainBody)) continue
      const writeRe = new RegExp('\\b' + nm + '\\b(?:\\.[xyzwrgbast]{1,4})?\\s*(?:[+\\-*/]?=|\\+\\+|--)')
      if (writeRe.test(code) && !written.has(nm)) written.set(nm, dm2[1])
    }
    if (written.size) {
      const lines = code.split('\n')
      const inits = []
      const outLines = []
      for (const line of lines) {
        let skip = false
        for (const [nm, ty] of written) {
          if (new RegExp('^\\s*in\\s+' + ty + '\\s+' + nm + ';').test(line)) { skip = true; break }
        }
        let l = line
        if (!skip) {
          for (const [nm] of written) l = replaceWord(l, nm, nm + '_l')
        }
        outLines.push(l)
      }
      for (const [nm, ty] of written) inits.push(ty + ' ' + nm + '_l = ' + nm + ';')
      code = outLines.join('\n')
      const mi = code.indexOf('void main')
      const br = code.indexOf('{', mi)
      if (mi !== -1 && br !== -1) {
        code = code.slice(0, br + 1) + '\n  ' + inits.join('\n  ') + code.slice(br + 1)
      }
    }
  }

  // HLSL 属性/修饰符
  code = code.replace(/\[(?:unroll|loop|branch|flatten)\]\s*/g, '')
  code = code.replace(/\bstatic\s+/g, '')

  // 3b. HLSL 允许 float/int 作 if/三元条件（非零即真）；GLSL ES 只接受 bool
  {
    const condType = new Map() // 名字 -> bool|int|float（从声明收集）
    const cdRe = /\b(?:const\s+)?(?:highp|mediump|lowp\s+)?(bool|int|uint|float|vec2|vec3|vec4)\s+([A-Za-z_][A-Za-z0-9_]*)/g
    let cm3
    while ((cm3 = cdRe.exec(code)) !== null) {
      if (!condType.has(cm3[2])) condType.set(cm3[2], cm3[1])
    }
    // 三元条件：`cond ? a : b`（cond 为简单标识符且是 float/int 类型）
    code = code.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\?\s*([^;]*?):/g, (all, c, t) => {
      const ty = condType.get(c)
      if (ty === 'float') return '(' + c + ' != 0.0) ? ' + t + ':'
      if (ty === 'int' || ty === 'uint') return '(' + c + ' != 0) ? ' + t + ':'
      return all
    })
    // if (cond) 条件
    code = code.replace(/\bif\s*\(([A-Za-z_][A-Za-z0-9_]*)\s*\)/g, (all, c) => {
      const ty = condType.get(c)
      if (ty === 'float') return 'if (' + c + ' != 0.0)'
      if (ty === 'int' || ty === 'uint') return 'if (' + c + ' != 0)'
      return all
    })
  }

  // 3a. uniform 声明提前：公共头函数（common_blur.h 等）可能先于 uniform 声明引用 g_Texture0，
  //     GLSL ES 要求先声明后使用（WE 桌面端拼接头文件位置不同无此问题）
  {
    const uniRe = /^[ \t]*uniform[ \t]+(?:(?:highp|mediump|lowp)[ \t]+)?[A-Za-z0-9_]+[ \t]+[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?[ \t]*;/gm
    const uniLines = []
    code = code.replace(uniRe, (all) => { uniLines.push(all.trim()); return '' })
    if (uniLines.length) code = uniLines.join('\n') + '\n' + code
  }

  // 输出：float 精度统一 highp（顶点默认即 highp；片元若用 mediump 会与顶点共享 uniform 精度不一致导致链接失败）
  let prologue = '#version 300 es\n'
  if (stage === 'vert') {
    prologue += 'precision highp float;\n'
  }
  if (stage === 'frag') {
    prologue += 'precision highp float;\n'
    if (/\bgl_FragColor\b/.test(code)) {
      prologue += 'out vec4 fragColor;\n'
      code = code.replace(/\bgl_FragColor\b/g, 'fragColor')
    }
  }
  return prologue + code
}

// ===== src/render/effects.js =====
// 场景效果链的 CPU 侧求值（离线预览、数值对拍与 mock-GL 共用）。
// 实现口径（只依据公开标准与本项目自己的约定，见 docs/EFFECTS-COMPUTE-SPEC.md）：
//   · 混合模式 = W3C Compositing and Blending Level 1 与 PDF 1.7 §11.3 的**公开**分离式公式，
//     按场景包里的 blendMode id 索引（id 表属包格式事实，不是任何实现方的表达）；
//   · HSL = 公开的 hexcone 模型；smoothstep / fract / 双线性采样 = GLSL 规范里的标准定义；
//   · 空间：显示空间 v-down（v=0 = 图层画面顶部）；效果内部一律在原始 uv (u0,v0) 上取蒙版/噪声/相位，
//     位移只累加到最终采样坐标；waterflow 与像素级颜色效果在采样之后处理。
//   · 数值口径：与重写前的 CPU 结果**逐位等价**（Object.is；见规格 §6）。

export const M_2PI = 6.28318530718

// 贴图缺失时的**统一**兜底：1×1 纯白（不透明 + 无方向信息）。各处都复用它，不各自新建。
const WHITE = { width: 1, height: 1, rgba: new Uint8Array([255, 255, 255, 255]), rg88: false }

// ═══════════════════════════════════════════════════════════════════════════════════════
// ①(预留接口 2026-09-13) 扩展钩子注册表 —— 给"现在没用上、将来可能用得上"的能力留出入口。
//   设计原则：全部为**可选、默认无操作**，核心渲染路径不因缺少钩子而改变行为。
//   槽位（slot）：
//     resolveTexture(name, ctx)          → 返回 { glTex, width, height, rg88?, sprite? } 或 null
//                                           （外部资源服务 / 远程纹理 / 程序化纹理）
//     layerRect(layer, rect, ctx)        → 返回 [x, y, w, h] 覆盖层实绘矩形（外部标定表 / 校正）
//     shaderSource(rel, ctx)             → 返回 GLSL 源或 null（外部 shader 库）
//     postFrame(ctx)                     → 每帧合成后调用（额外后处理 / 埋点 / 截图）
//     stats(stats, ctx)                  → 帧统计回调（性能监控）
//   注册方式：
//     globalThis.__mpwHooks = { resolveTexture: fn, ... }        // 直接挂对象
//     registerMpwHook('resolveTexture', fn)                       // 或调用本函数（可多个，链式）
//   远程配置（浏览器）：?exthooks=<url[,url2]> 每个 URL 导出 default 对象或 hooks 对象
//   （见 EXTENSION-HOOKS.md；渲染器服务器保留 /ext 与 /ext/<name> 路由）
// ═══════════════════════════════════════════════════════════════════════════════════════
export const MPW_HOOK_SLOTS = ['resolveTexture', 'layerRect', 'shaderSource', 'postFrame', 'stats']

function mpwHookBag() {
  const g = (typeof globalThis !== 'undefined') ? globalThis : null
  if (!g) return null
  if (!g.__mpwHooks || typeof g.__mpwHooks !== 'object') g.__mpwHooks = {}
  return g.__mpwHooks
}

export function registerMpwHook(slot, fn) {
  if (typeof fn !== 'function' || MPW_HOOK_SLOTS.indexOf(slot) < 0) return false
  const bag = mpwHookBag()
  if (!bag) return false
  const cur = bag[slot]
  if (!cur) bag[slot] = fn
  else if (Array.isArray(cur)) cur.push(fn)
  else bag[slot] = [cur, fn]
  return true
}

// 运行一个槽位：任一钩子返回非空即作为结果（多钩子按注册序，首个有效胜出）
export function runMpwHook(slot, args) {
  const bag = mpwHookBag()
  if (!bag) return null
  const h = bag[slot]
  if (!h) return null
  const list = Array.isArray(h) ? h : [h]
  for (const fn of list) {
    try {
      const r = fn.apply(null, args || [])
      if (r !== undefined && r !== null) return r
    } catch (e) { /* 钩子异常不影响渲染 */ }
  }
  return null
}

// ①(RE-41) 缺失纹理回退视觉开关：默认白块（官方一致），?whitefallback=0 退回透明
// ①(P-21-ATTACH 2026-09-13) 网格包围盒中心补偿默认**关闭**（官方/lwe/elysia 都是"MDL 顶点即模型空间，
//   对象变换直接作用"，没有"把 bbox 中心搬到 origin"这一步；POSITION-FINDINGS.md §5.2）。
//   ?mcc=1 强制开启（旧行为，逐壁纸 A/B 用）；?mcc=0 保持关闭。
const MCC_ENABLED = (() => {
  try {
    if (typeof location === 'undefined' || !location.search) return false
    return /[?&]mcc=1/.test(location.search)
  } catch { return false }
})()

// ①(P-81) 相机层姿态口径（`?campose=`）：`full`（缺省，完整接 origin 关键帧动画 + zoom）/
//   `legacy`（只接用户属性绑定的 zoom，= P-76 行为）/ `off`（完全不接，逐位回到 P-76 之前）。
//   非法值/未知值按缺省 `full`。用户原话："相机层动画要完整接 **但是你要保留可以回退的按钮**"
//   ⇒ 两个回退档都在这里（测试可用 opts.campose 在同进程内切三态）。
// 纯函数（CAMPOSE_MODE 与 camera-pose-test 共用同一份真值表 ⇒ 不会两边漂移）：
// `?campose=legacy|off` 原样返回；`full`/缺省/非法/未知/空串 → `'full'`。
export function camposeModeFrom(search) {
  try {
    const v = new URLSearchParams(String(search === undefined || search === null ? '' : search)).get('campose')
    return (v === 'legacy' || v === 'off') ? v : 'full'
  } catch (e) { return 'full' }
}
const CAMPOSE_MODE = (() => {
  try {
    if (typeof location === 'undefined' || !location.search) return 'full'
    // ① 这里**故意用与 `?blinkty`/`?mcc` 同形的 `new URLSearchParams(location.search).get(...)` 写法**：
    //   `diag-flag-check.mjs` 的抓取口径要求 URLSearchParams 绑定在 `location.*` 上才认（纯函数
    //   `camposeModeFrom(String(search))` 那种形态抓不到）——否则这个用户可见开关会从 README 主表漏掉。
    const v = new URLSearchParams(location.search).get('campose')
    return (v === 'legacy' || v === 'off') ? v : 'full'
  } catch (e) { return 'full' }
})()
// ①(P-84 用户："相机层动画要完整接 **但是你要保留可以回退的按钮**") **三档优先级的唯一真值表**：
//   `opts.campose`（测试/宿主显式传，最高）→ `liveVal`（`window.__mpwCampose`，demo 的
//   **🎥 相机 按钮**实时写它，**无需刷新**）→ `fallbackVal`（模块加载时从 `?campose=` 读到的档）。
//   为什么必须有 live 档：档位原先只在模块初始化时从 URL 读一次，按钮改 URL 也得刷新才生效
//   （用户要的是"能回退的按钮"，不是"改地址栏"）。为什么 opts 优先：`camera-pose-test.mjs`
//   在同一进程内切三态做逐位对照，绝不能被页面上的按钮状态污染。
//   非法/未知/空串 → `'full'`（与缺省一致；空串视为"没设"）。
export function resolveCamposeMode(optsVal, liveVal, fallbackVal) {
  const pick = (v) => (v === 'legacy' || v === 'off') ? v : 'full'
  if (optsVal !== undefined && optsVal !== null) return pick(String(optsVal))
  if (liveVal !== undefined && liveVal !== null && String(liveVal) !== '') return pick(String(liveVal))
  return pick(fallbackVal === undefined || fallbackVal === null ? 'full' : String(fallbackVal))
}

// ①(P-100 用户真机实测："入场动画把人物固定在屏幕中间，然后去移动背景 —— 它应该是只移动摄像头")
//   **`?charfit=` 三档**：角色层（无父级 + `animationlayers` 的 puppet/立绘层）的"超屏适配"口径。
//   `auto`（缺省）= 官方语义优先：**场景里有相机节点 ⇒ 一律不适配**（角色只吃世界变换 + 相机取景，
//     相机怎么动角色就怎么动）；**没有相机节点**且该层确实超出投影时才保留旧的兜底适配
//     （等比缩到赛宽内 + 画布中心）——那类包（凯尔希 3719111841 的"长发3"）没有相机会跟它打架。
//   `off`   = 完全关掉适配（任何包都不缩不居中；相机语义照旧）。
//   `legacy`= 逐位回到改动前：角色层**恒**按旧判据适配，且蒙皮层**不接相机**（MESH_VS 的
//     u_View/u_Framed 回落到 (0,0)/设计画布）。一键 A/B 旧画面用。
//   非法值/未知/空串 → `auto`。纯函数是唯一真值表（测试与 bundle 共用同一份，不两边漂移）。
export function charfitModeFrom(search) {
  try {
    const v = new URLSearchParams(String(search === undefined || search === null ? '' : search)).get('charfit')
    return (v === 'off' || v === 'legacy') ? v : 'auto'
  } catch (e) { return 'auto' }
}
const CHARFIT_MODE = (() => {
  try {
    if (typeof location === 'undefined' || !location.search) return 'auto'
    // ① 与 `?campose`/`?blinkty` 同形：diag-flag-check.mjs 只认"URLSearchParams 绑在 location.* 上"
    //   的写法，纯函数 `charfitModeFrom(String(search))` 那种形态抓不到 ⇒ 开关会从 README 主表漏掉。
    const v = new URLSearchParams(location.search).get('charfit')
    return (v === 'off' || v === 'legacy') ? v : 'auto'
  } catch (e) { return 'auto' }
})()
// 三档优先级的唯一真值表：`opts.charfit`（测试/宿主显式传，最高）→ `?charfit=`（加载时读一次）。
export function resolveCharfitMode(optsVal, fallbackVal) {
  const pick = (v) => (v === 'off' || v === 'legacy') ? v : 'auto'
  if (optsVal !== undefined && optsVal !== null && String(optsVal) !== '') return pick(String(optsVal))
  return pick(fallbackVal === undefined || fallbackVal === null ? 'auto' : String(fallbackVal))
}

// ①(P-107 用户第 13 项 P1-3) **投影档（`?projmode=persp|ortho|auto`）**—— `general.fov` 透视相机的落地开关。
//   `auto`（缺省）= 按场景自己的声明走：`general.orthogonalprojection` 有矩形 ⇒ 正交（正交路径**逐位**等于
//     改动前，全语料 20 个正交包零回归）；矩形缺省/`null`/宽 0 ⇒ 透视（此时 `buildCamera` 才构造
//     `mat4Perspective`）—— 这与 WE 的"2D 场景作者勾了正交投影 / 3D 场景没有"一一对应。
//   `persp` = 强制透视（正交包也照透视画）：**z=0 平面与正交档逐位相同**（帧平面锚定，见 buildCamera），
//     只有 z≠0 的层被近大远小缩放过 ⇒ 安全的 A/B 探针。
//   `ortho` = 强制正交 ⇒ **全语料逐位回到改动前**（连 scene.camera 的 lookAt 视图都照旧）——一键回退口。
//   非法/未知/空串 → `auto`。真值表 = 纯函数 `projModeFrom()` / `resolveProjMode()`（测试与 bundle 共用一份）。
//   ⚠ **不能叫 `?proj=`**：那个名字已被 P-85 占用（`?proj=off` = 跳过官方 project.json 读取，demo.html:3039），
//     语义完全不同，共用一个名字会"改属性表 + 改投影"同时发生（README 主表的 `proj` 行）。
export function projModeFrom(search) {
  try {
    const v = new URLSearchParams(String(search === undefined || search === null ? '' : search)).get('projmode')
    return (v === 'persp' || v === 'ortho') ? v : 'auto'
  } catch (e) { return 'auto' }
}
const PROJMODE = (() => {
  try {
    if (typeof location === 'undefined' || !location.search) return 'auto'
    // ① 与 `?campose`/`?charfit` 同形：diag-flag-check.mjs 只认"URLSearchParams 绑在 location.* 上"
    //   的写法，纯函数 `projModeFrom(String(search))` 那种形态抓不到 ⇒ 开关会从 README 主表漏掉。
    const v = new URLSearchParams(location.search).get('projmode')
    return (v === 'persp' || v === 'ortho') ? v : 'auto'
  } catch (e) { return 'auto' }
})()
// 优先级：`opts.proj`（测试/宿主显式传，最高）→ `window.__mpwProjMode`（宿主/按钮实时写）→ `?projmode=`（加载时读一次）。
export function resolveProjMode(optsVal, liveVal, fallbackVal) {
  const pick = (v) => (v === 'persp' || v === 'ortho') ? v : 'auto'
  if (optsVal !== undefined && optsVal !== null && String(optsVal) !== '') return pick(String(optsVal))
  if (liveVal !== undefined && liveVal !== null && String(liveVal) !== '') return pick(String(liveVal))
  return pick(fallbackVal === undefined || fallbackVal === null ? 'auto' : String(fallbackVal))
}

// ═══════════════════════════════════════════════════════════════════════════════
// ①(P-120 2026-09-18) 相机 origin 逐属性脚本（`origin: {script:…, value:…}`）—— 接线层
//
// 现象（量化见 `tests/camera-script-origin-probe.mjs`，全语料 98 包容器 + 171 散装 scene.json）：
//   16 个相机对象里 **14 个**的 `origin` 是 `{script:…}`（同一段 781 字符脚本，sha256 151da988…），
//   静态 `.value` = `2434.38477 725.25134 500`（编辑器保存时刻的快照），而脚本真跑起来
//   （userProps = project.json `general.properties` 默认值）算出来是 `0 0 500` ⇒ Δx −2434.38 / Δy −725.25。
//   渲染器此前把它当"无落点"（`cameraNode.active` 只看 `{animation}`）⇒ 相机取景**根本没用作者写的脚本**。
//
// 接线口径（**唯一求值器仍然是既有宿主** `elysia/scene-scripts.js`，本文件不自造 evaluator）：
//   · 宿主注入：`setCameraScriptHost({applySceneScripts, createScriptCache})`（demo.html 传它已经 import 的
//     那个模块；`createRenderer(canvas, {cameraScriptHost})` 可逐实例覆盖）。**为什么不是 import**：
//     `core/we-scene-bundle.js` 会被原样拷到发布产物**站点根**（`build-pages.mjs` 的 PAGES_KEEP_FILES），
//     写给它的 `../elysia/scene-scripts.js` 在线上会越过站点根 404；隔离副本型测试（`bind-order-test` TN6 /
//     `pointer-leave-test` 只拷 core/ 的 bundle）也会 ERR_MODULE_NOT_FOUND ⇒ core/ 保持零跨目录 import。
//   · 求值作用域 = **相机对象自己**（`applySceneScripts(camObj, t, {renderObjects:[camObj]})`）：宿主把
//     `{script,value}` 的 `update()` 返回值**就地写回** `camObj.origin.value`（既有宿主语义），本函数读回。
//   · 重算触发（渲染器自己的节奏 = **每个渲染帧检查一次输入签名**，签名不变 ⇒ 复用上次结果、不发生宿主调用）：
//       ① 脚本源长度 ② 对象 `scriptproperties` 经 `resolveScriptProperties` 解析出的字面量（用户属性绑定的落点）
//       ③ `userProps` 全表指纹（对象没写 scriptproperties 时用户属性仍影响脚本内声明的属性默认值）
//       ④ `canvasSize`（脚本里的 `engine.canvasSize`）⑤ 相机 origin 原文串（宿主按自己的节拍写回会改它 ⇒
//          与 demo 既有的 4Hz/30Hz 脚本趟天然对齐，时间型相机脚本不会被"缓存冻住"）
//   · 失败/缺失 ⇒ **回退到冻结的静态快照**（`cameraNode.originStatic`）并留痕（`camNode.originEvalStats`
//     + 渲染器 `cameraOriginScript` 台账 + `window.__mpwCameraOriginScript`），**绝不向上抛**。
//     ⚠ 唯一例外：**没有注册宿主**（`nohost`）或**没有用户属性表**（`nouserprops`）时保持**不施加**（= 改动前
//     行为），不套用静态快照 —— 那种环境下"施加快照"就是 P-69 量到的 −2434px 编辑器残留，属于回归。
//   · 开关：`opts.cameraScript='off'` / `window.__mpwCameraScript='off'`（**不新增 `?` 开关**，
//     所以 `docs/README-DIAGNOSTICS.md` 无需登记）。
// ═══════════════════════════════════════════════════════════════════════════════
let CAMERA_SCRIPT_HOST = null
/** 注册相机 origin 脚本宿主（幂等；返回是否被接受）。`h` 需含 `applySceneScripts` + `createScriptCache`。 */
export function setCameraScriptHost(h) {
  const ok = !!(h && typeof h.applySceneScripts === 'function' && typeof h.createScriptCache === 'function')
  CAMERA_SCRIPT_HOST = ok ? h : null
  return ok
}
export function getCameraScriptHost() { return CAMERA_SCRIPT_HOST }
/** 三档真值表：`opts.cameraScript`（测试/宿主显式传，最高）→ `window.__mpwCameraScript`（宿主实时写）→ 缺省 'on'。 */
export function cameraScriptModeFrom(optsVal, liveVal, fallbackVal) {
  const pick = (v) => (String(v) === 'off' ? 'off' : 'on')
  if (optsVal !== undefined && optsVal !== null && String(optsVal) !== '') return pick(optsVal)
  if (liveVal !== undefined && liveVal !== null && String(liveVal) !== '') return pick(liveVal)
  return pick(fallbackVal === undefined || fallbackVal === null ? 'on' : String(fallbackVal))
}
/** 用户属性表指纹（滚动数字哈希，零大字符串分配；只用于"要不要重算"的签名，不参与求值）。 */
export function userPropsStamp(props) {
  if (!props || typeof props !== 'object') return 'none'
  let h = 0, n = 0
  for (const k of Object.keys(props)) {
    const v = props[k]
    const s = (v && typeof v === 'object') ? JSON.stringify(v) : String(v)
    for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0
    for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0
    n++
  }
  return n + ':' + h
}
/** origin 节点的"人读原文"（`{…,value}` 取 value；Vec3/字符串原样）。 */
export function cameraOriginText(node) {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    if ('value' in node) return String(node.value)
    if ('x' in node && 'y' in node) return node.x + ' ' + node.y + ' ' + (node.z || 0)
    return JSON.stringify(node).slice(0, 80)
  }
  return String(node)
}
/** origin 节点 → [x,y,z]（**任一非有限即 null**，与 parseVec3 的"静默补 0"区分开）。 */
export function finiteVec3Of(node) {
  const t = cameraOriginText(node)
  const p = t.trim().split(/\s+/).map(Number)
  if (!p.length || !p.every((x) => Number.isFinite(x))) return null
  return [p[0], p[1], p[2] || 0]
}
/**
 * 在**相机对象局部**跑一次 `origin.script`（复用宿主）。返回
 * `{ok, value:[x,y,z]|null, why, errs}`；**任何失败都不抛**，由调用方决定回退。
 * `cache` 用 `host.createScriptCache()` 的返回值（同一个 cache 内脚本只编译一次、init 只跑一次）。
 */
export function evalCameraOriginScriptOnce(camNode, host, cache, time, userProps, canvasSize, frametime) {
  const obj = camNode && camNode.originObj
  if (!obj || !(camNode && camNode.originScriptSrc)) return { ok: false, why: 'no-script', value: null, errs: [] }
  if (!host || typeof host.applySceneScripts !== 'function') return { ok: false, why: 'no-host', value: null, errs: [] }
  const errs = []
  try {
    host.applySceneScripts(obj, time, {
      renderObjects: [obj],
      userProps: (userProps && typeof userProps === 'object') ? userProps : {},
      canvasSize: canvasSize || null,
      frametime: (typeof frametime === 'number' && isFinite(frametime) && frametime >= 0) ? frametime : (1 / 60),
      ...(cache ? { scriptCache: cache } : {}),
      onError: (stage, e) => { try { errs.push(stage + ': ' + ((e && e.message) || e)) } catch { errs.push(String(stage)) } },
    })
  } catch (e) {
    return { ok: false, why: 'host-throw: ' + ((e && e.message) || e), value: null, errs }
  }
  const entry = (cache && cache.map && typeof cache.map.get === 'function') ? cache.map.get(String(camNode.originScriptSrc)) : null
  if (!entry) return { ok: false, why: 'host-no-entry', value: null, errs }
  if (entry.error) return { ok: false, why: 'compile: ' + String(entry.error).slice(0, 120), value: null, errs }
  if (entry.disabled) return { ok: false, why: 'init-disabled: ' + String(entry.initError || '').slice(0, 120), value: null, errs }
  if (entry.updateErrors) return { ok: false, why: 'update-errors:' + entry.updateErrors + (errs.length ? ' (' + errs[0] + ')' : ''), value: null, errs }
  if (errs.length) return { ok: false, why: 'host-error: ' + errs[0], value: null, errs }
  const v = finiteVec3Of(obj.origin)
  if (!v) return { ok: false, why: 'non-finite: ' + cameraOriginText(obj.origin).slice(0, 60), value: null, errs }
  return { ok: true, value: v, why: '', errs }
}

// ①(P-76) 对象级视差位移的**空间**口径回退开关：`?parspace=legacy` → 回到"位移在 S(w,h) 之后后乘"
//   的旧口径（位移被本层 w/h 放大；凯尔希背景层实测 0.3863px → 1639.4px，即真机"背景没画到左侧"
//   的根因）。缺省 false = 位移按**世界像素**与 origin 合并。仅作真机 A/B 与回退，不参与新行为默认。
const PARALLAX_SPACE_LEGACY = (() => {
  try {
    if (typeof location === 'undefined' || !location.search) return false
    return /[?&]parspace=legacy/.test(location.search)
  } catch { return false }
})()

// ①(P-76) `opts.parallaxOff` 对**对象级**视差的门控回退开关：`?paroff=legacy` → 回到"只停鼠标项、
//   对象级 (node_pos − cam_pos) 项照旧生效"的旧口径。缺省 false = parallaxOff 时对象级视差整体停用
//   （与 demo.html「视差整体停用」的注释契约、以及场景级视差的门控一致）。
const PARALLAX_OFF_LEGACY = (() => {
  try {
    if (typeof location === 'undefined' || !location.search) return false
    return /[?&]paroff=legacy/.test(location.search)
  } catch { return false }
})()

// ①(RE-37) 粒子透视相机开关（?pp=0 退回正交，便于 A/B 对照）
const PP_DISABLED = (() => {
  try {
    if (typeof location === 'undefined' || !location.search) return false
    return /[?&]pp=0/.test(location.search)
  } catch { return false }
})()

// ①(2026-09-12 用户实测"白屏/白块") 纹理缺失/解码失败时的兜底：默认改为**透明**（层不画），
//   而不是官方语义的 1x1 白块。原因：满屏白块比"少一层"严重得多（用户多张壁纸的"白屏"就是
//   若干 3840x2160 的 white-fallback 层叠出来的）；而"哪些纹理没解出来"现在由上报的
//   texStats / texMissing 字段暴露，不再依赖白块当信号。`?whitefallback=1` 可切回白块做对照。
const WHITE_FALLBACK = (() => {
  try {
    if (typeof location === 'undefined' || !location.search) return false
    return /[?&]whitefallback=1/.test(location.search)
  } catch { return false }
})()

// ---------- 采样 ----------

// 双线性采样（与目标运行时的线性过滤口径一致；噪声这类高频贴图必须双线性，否则位移会成块）
export function sampleTex(tex, u, v) {
  return sampleRgba(tex.rgba, tex.width, tex.height, u, v)
}

// 带 mip 的采样（场景贴图带 mip 链，按线性 mip 过滤：缩小采样自动平滑）
// level 由调用方按缩放因子给出（级别内双线性，不做级间插值）
export function sampleTexLod(tex, u, v, level = 0) {
  if (tex.mips && tex.mips.length > 1) {
    const lv = Math.max(0, Math.min(tex.mips.length - 1, level))
    const m = tex.mips[lv]
    return sampleRgba(m.rgba, m.width, m.height, u, v)
  }
  return sampleTex(tex, u, v)
}

// 级别估算（线性 mip 过滤）：采样区域 ≈ texW*scale 像素 → level = -log2(scale)
export function mipLevelForScale(scale, texWidth) {
  if (texWidth <= 1 || scale >= 1) return 0
  return Math.max(0, Math.round(-Math.log2(scale)))
}

function sampleRgba(rgba, w, h, u, v) {
  const x = u * w - 0.5
  const y = v * h - 0.5
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const cx = (xi) => (xi < 0 ? 0 : xi >= w ? w - 1 : xi)
  const cy = (yi) => (yi < 0 ? 0 : yi >= h ? h - 1 : yi)
  const o00 = (cy(y0) * w + cx(x0)) * 4
  const o10 = (cy(y0) * w + cx(x0 + 1)) * 4
  const o01 = (cy(y0 + 1) * w + cx(x0)) * 4
  const o11 = (cy(y0 + 1) * w + cx(x0 + 1)) * 4
  const out = [0, 0, 0, 0]
  for (let c = 0; c < 4; c++) {
    const a = rgba[o00 + c] * (1 - fx) + rgba[o10 + c] * fx
    const b = rgba[o01 + c] * (1 - fx) + rgba[o11 + c] * fx
    out[c] = a * (1 - fy) + b * fy
  }
  return out
}

// 流图通道：RG88 打包贴图的顺序是 (b, r)；普通 RGBA 贴图是 (r, g)
export function flowChannels(tex, f) {
  return tex.rg88 ? [f[3] / 255, f[0] / 255] : [f[0] / 255, f[1] / 255]
}

// 蒙版通道：RG88 打包贴图取 b；普通 RGBA 贴图取 r
export function maskChannel(tex, f) {
  return tex.rg88 ? f[3] / 255 : f[0] / 255
}

// ---------- 通用标量与向量工具（GLSL 规范里的标准定义） ----------

/** 二维旋转：把 v 按 a 弧度旋转（cos/sin 各算一次复用）。 */
export function rotate2(v, a) {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]
}

/** 取小数部分（标准 fract 语义：负数结果也落在 [0,1)，不是 JS 的 % ）。 */
export function frac(x) {
  return x - Math.floor(x)
}

/** 四分量线性插值（逐分量 x*(1-k) + y*k）。 */
export function mix4(a, b, k) {
  return [a[0] * (1 - k) + b[0] * k, a[1] * (1 - k) + b[1] * k, a[2] * (1 - k) + b[2] * k, a[3] * (1 - k) + b[3] * k]
}

/** 平滑阶跃（标准 smoothstep 语义：先归一化、夹取到 [0,1]，再走 3k²-2k³）。 */
export function smoothstep(e0, e1, x) {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return k * k * (3 - 2 * k)
}

// ---------- 位移类效果：折算成最终采样坐标 ----------
//
// 口径（docs/EFFECTS-COMPUTE-SPEC.md §4）：效果自己用到的蒙版/噪声/相位贴图一律在**原始 uv**
// 上采样；位移只累加到最终采样坐标。scroll 例外 —— 按包格式约定它**替换**坐标（后续效果在其上累加）。
// 每一项的实现都写成"增量函数"（四个增量函数共用同一签名 `(item, u0, v0, layerTex, textures, time)`，
// 用不到的形参留空 —— 这样分派表可以统一调用），由 resolveDisplacedUv 统一累加；
// shake 的增量函数同时被 applyShakeMaskMix 复用（蒙版混回用的是同一个位移量，两处不再各写一份公式）。

/** 流图的"无位移"中心值：0.5 略回收 0.002，使 ±1 映射不贴边。 */
const FLOW_NEUTRAL = 0.498
/** shake 包络的映射中心（把 -1..1 的正弦抬到 0.002..0.998，避免两端贴边）。 */
const SHAKE_WAVE_CENTER = 0.498

/** 流图采样 → 二分量方向（-1..1）。贴图缺失时用 1×1 纯白兜底（等价于"没有方向信息"）。 */
function flowDirection(textures, name, u, v) {
  const tex = textures.get(name) || WHITE
  const sampled = sampleTex(tex, u, v)
  const channels = flowChannels(tex, sampled)
  return [(channels[0] - FLOW_NEUTRAL) * 2, (channels[1] - FLOW_NEUTRAL) * 2]
}

/** 把相位折回一个 2π 周期（sin 的周期化写法）。 */
function cyclePhase(x) {
  return frac(x / M_2PI) * M_2PI
}

/** scroll：保号平方位移 + 重复次数，按 fract 环绕；**替换**采样坐标。 */
function scrollOffset(item, u0, v0, time) {
  const dx = Math.sign(item.sx) * item.sx * item.sx * time
  const dy = Math.sign(item.sy) * item.sy * item.sy * time
  return { su: frac((u0 + dx) * item.rx), sv: frac((v0 + dy) * item.ry) }
}

/**
 * shake：相位贴图给初相、流图给方向，幅度经 |cos| 选幂次、bounds 归一化、direction 映射。
 * 返回**采样坐标增量**（含 amp² 缩放）。
 */
function shakeOffset(item, u0, v0, layerTex, textures, time) {
  const phaseTex = textures.get(item.phase) || WHITE
  const phaseSample = sampleTex(phaseTex, u0, v0)
  const angle = item.speed * time + (phaseSample[0] / 255) * M_2PI
  const envelope = Math.sin(cyclePhase(angle)) * SHAKE_WAVE_CENTER + 0.5
  const rising = Math.cos(angle) >= 0
  let amount = rising ? Math.pow(envelope, item.fy) : 1 - Math.pow(1 - envelope, item.fx)
  amount = Math.min(1, Math.max(0, (amount - item.bounds[0]) * (1 / (item.bounds[1] - item.bounds[0]))))
  if (item.direction === 0) amount = amount * 2 - 1
  else if (item.direction === 2) amount = amount - 1
  const direction = flowDirection(textures, item.flow, u0, v0)
  const amplitude = item.amp * item.amp
  return { du: amount * amplitude * direction[0], dv: amount * amplitude * direction[1] }
}

/** waves：沿 direction 的行波正弦，幅度受蒙版与"透视因子"（离画面中线的距离）调制。 */
function waveOffset(item, u0, v0, layerTex, textures, time) {
  const maskTex = textures.get(item.mask) || WHITE
  const mask = maskChannel(maskTex, sampleTex(maskTex, u0, v0))
  const axis = rotate2([0, 1], item.direction)
  const across = Math.abs((u0 - 0.5) * axis[0] + (v0 - 0.5) * axis[1])
  const travel = time * item.speed + (u0 * axis[0] + v0 * axis[1]) * (item.scale + item.perspective * across)
  const wave = Math.sin(travel) * (item.strength * item.strength + item.perspective * across) * mask
  // 垂直于传播方向： (axis.y, -axis.x)
  return { du: axis[1] * wave, dv: -axis[0] * wave }
}

// sway 的两组四项三角级数（公开的 sin/cos 级数系数；改精度会改画面，不是"化简空间"）
const SWAY_SIN_SERIES = [1, -0.16161616, 0.0083333, -0.00019841]
const SWAY_COS_SERIES = [-0.5, 0.041666666, -0.0013888889, 0.000024801587]
const SWAY_AMPLITUDE_SCALE = 0.005

/** sway：噪声相位 + 两组级数（sin 侧给横向、cos 侧给纵向），噪声按缩放级别取 mip。 */
function swayOffset(item, u0, v0, layerTex, textures, time) {
  const noiseTex = textures.get(item.noise) || WHITE
  // 噪声贴图带 mip 链：缩得越小越该取低级别（否则高频位移场会闪）
  const noise = sampleTexLod(noiseTex, u0 * item.noiseScale, v0 * item.noiseScale, mipLevelForScale(item.noiseScale, noiseTex.width))
  const aspect = (layerTex.width / layerTex.height) * item.ratio
  const axis = rotate2([1 / aspect, aspect], item.direction)
  const rotated = rotate2([u0, v0], item.direction)
  let amplitude = item.strength * item.strength * SWAY_AMPLITUDE_SCALE
  if (item.masked && item.mask) {
    const maskTex = textures.get(item.mask)
    if (maskTex) amplitude *= maskChannel(maskTex, sampleTex(maskTex, u0, v0))
  }
  const phase = (noise[1] / 255 * M_2PI + rotated[0] * 10 + rotated[1] * 5) * item.phase
  let sinSum = 0
  let cosSum = 0
  for (let i = 0; i < SWAY_SIN_SERIES.length; i++) {
    let x = Math.sin(phase + item.speed * time * SWAY_SIN_SERIES[i])
    sinSum += Math.pow(Math.abs(x), item.power) * Math.sign(x)
    x = Math.sin(0.4 + phase + item.speed * time * SWAY_COS_SERIES[i])
    cosSum += Math.pow(Math.abs(x), item.power) * Math.sign(x)
  }
  return { du: axis[0] * sinSum * amplitude, dv: axis[1] * cosSum * amplitude }
}

/** 位移效果求值表：type → 增量函数。未列出的 type 一律跳过（flow 由 applyWaterFlowOverlay 处理）。 */
const UV_OFFSETS = new Map([
  ['shake', shakeOffset],
  ['waves', waveOffset],
  ['sway', swayOffset],
])

/**
 * 由位移类效果算出最终采样坐标。
 * @param {Array} items 效果参数列表（`type` + 各自参数；非可迭代输入按 JS 语义抛 TypeError，属既有行为）
 * @returns {{su:number, sv:number}}
 */
export function resolveDisplacedUv(items, u0, v0, layerTex, textures, time) {
  let su = u0
  let sv = v0
  for (const item of items) {
    const kind = item.type
    if (kind === 'scroll') {
      const scrolled = scrollOffset(item, u0, v0, time)
      su = scrolled.su
      sv = scrolled.sv
      continue
    }
    const offset = UV_OFFSETS.get(kind)
    if (!offset) continue
    const delta = offset(item, u0, v0, layerTex, textures, time)
    su += delta.du
    sv += delta.dv
  }
  return { su, sv }
}

/**
 * 带蒙版的 shake：蒙版在**位移后**的 uv 上采样，把位移结果按蒙版混回原图（四通道原地改写）。
 * 注：只有"该层唯一位移效果就是这个 shake"时，它才严格等价于"整体位移后采样"；
 * 多个位移效果并存时仍按上式独立求值（既有口径）。
 */
export function applyShakeMaskMix(items, u0, v0, su, sv, layerTex, textures, time, pixel) {
  for (const item of items) {
    if (item.type !== 'shake' || !item.masked) continue
    const maskTex = textures.get(item.mask) || WHITE
    const delta = shakeOffset(item, u0, v0, layerTex, textures, time)
    const mask = maskChannel(maskTex, sampleTex(maskTex, u0 + delta.du, v0 + delta.dv))
    const original = sampleTex(layerTex, u0, v0)
    for (let c = 0; c < 4; c++) pixel[c] = original[c] * (1 - mask) + pixel[c] * mask
  }
  return pixel
}

// ---------- waterflow：四相循环采样叠加 ----------

const FLOW_STRENGTH_SCALE = 0.1
/** 相位 → 混合权重的平滑斜坡两端（相位低于低端取 0、高于高端取 1）。 */
const FLOW_RAMP_LOW = 0.2
const FLOW_RAMP_HIGH = 0.8

/**
 * waterflow：在 (su,sv) 上按四个相位各采一次，两两混合后按流图模长与原图叠加。
 * 流图模长**不截断**（>1 时 mix 允许外插，属既有口径）。
 */
export function applyWaterFlowOverlay(items, u0, v0, su, sv, layerTex, textures, time, pixel) {
  let out = pixel
  for (const item of items) {
    if (item.type !== 'flow') continue
    const phaseTex = textures.get(item.phase) || WHITE
    const phase = sampleTex(phaseTex, u0 * item.phaseScale, v0 * item.phaseScale)[0] / 255
    const direction = flowDirection(textures, item.flow, u0, v0)
    const spread = Math.hypot(direction[0], direction[1])
    const amplitude = item.strength * FLOW_STRENGTH_SCALE
    const c0 = frac(time * item.speed)
    const c1 = frac(time * item.speed + 0.5)
    const c2 = frac(0.25 + time * item.speed)
    const c3 = frac(0.25 + time * item.speed + 0.5)
    const s0 = c0 - 0.5
    const s1 = c1 - 0.5
    const s2 = c2 - 0.5
    const s3 = c3 - 0.5
    const base = sampleTex(layerTex, su, sv)
    const tap0 = sampleTex(layerTex, su + direction[0] * amplitude * s0, sv + direction[1] * amplitude * s0)
    const tap1 = sampleTex(layerTex, su + direction[0] * amplitude * s1, sv + direction[1] * amplitude * s1)
    const tap2 = sampleTex(layerTex, su + direction[0] * amplitude * s2, sv + direction[1] * amplitude * s2)
    const tap3 = sampleTex(layerTex, su + direction[0] * amplitude * s3, sv + direction[1] * amplitude * s3)
    const half0 = mix4(tap0, tap1, 2 * Math.abs(c0 - 0.5))
    const half1 = mix4(tap2, tap3, 2 * Math.abs(c2 - 0.5))
    const flowing = mix4(half0, half1, smoothstep(FLOW_RAMP_LOW, FLOW_RAMP_HIGH, phase))
    out = mix4(base, flowing, spread)
  }
  return out
}

// ---------- 混合模式（公开标准的分离式混合公式）+ HSL ----------
//
// 公式来源：W3C Compositing and Blending Level 1 与 PDF 1.7 §11.3 的**公开**分离式混合定义，
// HSL 用公开的 hexcone（六棱锥）模型。模式 id 表本身是场景包格式的一部分（接口事实，见
// docs/EFFECTS-COMPUTE-SPEC.md §1.3）；这里只把"id → 公式"按本项目的结构重新组织。
// 求值形状是契约：加权族的整色合成固定为 x*(1-k) + y*k（先乘后加），不许改写成 x + (y-x)*k。

/** 三通道线性插值（见上：求值形状不可改）。 */
function lerpRgb(x, y, t) {
  return [x[0] * (1 - t) + y[0] * t, x[1] * (1 - t) + y[1] * t, x[2] * (1 - t) + y[2] * t]
}

/** 把"单通道公式"提升为"三通道算子"。 */
const perChannel = (channelOp) => (A, B) => [channelOp(A[0], B[0]), channelOp(A[1], B[1]), channelOp(A[2], B[2])]

// —— 逐通道公式（a = 底色通道，b = 效果色通道；均为 0..1 量纲且不 clamp）——
const darkenChannel = (a, b) => Math.min(b, a)
const lightenChannel = (a, b) => Math.max(b, a)
const multiplyChannel = (a, b) => a * b
const screenChannel = (a, b) => 1 - (1 - a) * (1 - b)
const colorBurnChannel = (a, b) => (b === 0 ? 0 : Math.max(1 - (1 - a) / b, 0))
const colorDodgeChannel = (a, b) => (b === 1 ? 1 : Math.min(a / (1 - b), 1))
const linearBurnChannel = (a, b) => Math.max(a + b - 1, 0)
const linearDodgeChannel = (a, b) => Math.min(a + b, 1)
const overlayChannel = (a, b) => (a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b))
const softLightChannel = (a, b) => (b < 0.5 ? 2 * a * b + a * a * (1 - 2 * b) : Math.sqrt(a) * (2 * b - 1) + 2 * a * (1 - b))
const hardLightChannel = (a, b) => overlayChannel(b, a)
const linearLightChannel = (a, b) => (b < 0.5 ? Math.max(a + 2 * b - 1, 0) : Math.min(a + 2 * (b - 0.5), 1))
const pinLightChannel = (a, b) => (b < 0.5 ? Math.min(a, 2 * b) : Math.max(a, 2 * (b - 0.5)))
const differenceChannel = (a, b) => Math.abs(a - b)
const exclusionChannel = (a, b) => a + b - 2 * a * b
const reflectChannel = (a, b) => (b === 1 ? 1 : Math.min(a * a / (1 - b), 1))
const glowChannel = (a, b) => reflectChannel(b, a)
const phoenixChannel = (a, b) => Math.min(a, b) - Math.max(a, b) + 1
const averageChannel = (a, b) => (a + b) / 2
const negationChannel = (a, b) => 1 - Math.abs(1 - a - b)

/**
 * Vivid Light：暗半段当 Color Burn、亮半段当 Color Dodge。
 * 两段的短路条件（2b == 0 / 2(b-0.5) == 1）必须保留 —— 否则会算出 ±Infinity/NaN。
 */
function vividLightChannel(a, b) {
  if (b < 0.5) {
    const doubled = 2 * b
    return doubled === 0 ? 0 : Math.max(1 - (1 - a) / doubled, 0)
  }
  const doubled = 2 * (b - 0.5)
  return doubled === 1 ? 1 : Math.min(a / (1 - doubled), 1)
}

const hardMixChannel = (a, b) => (vividLightChannel(a, b) < 0.5 ? 0 : 1)

// —— HSL（hexcone 模型；分支顺序与"并列取首"规则见规格 §1.5）——
function hslFromRgb(rgb) {
  const low = Math.min(rgb[0], Math.min(rgb[1], rgb[2]))
  const high = Math.max(rgb[0], Math.max(rgb[1], rgb[2]))
  const span = high - low
  const hsl = [0, 0, 0]
  hsl[2] = (high + low) / 2
  if (span === 0) return hsl                       // 灰：色相/饱和度都无定义，取 0
  hsl[1] = hsl[2] < 0.5 ? span / (high + low) : span / (2 - high - low)
  const red = ((high - rgb[0]) / 6 + span / 2) / span
  const green = ((high - rgb[1]) / 6 + span / 2) / span
  const blue = ((high - rgb[2]) / 6 + span / 2) / span
  if (rgb[0] === high) hsl[0] = blue - green
  else if (rgb[1] === high) hsl[0] = 1 / 3 + red - blue
  else if (rgb[2] === high) hsl[0] = 2 / 3 + green - red
  if (hsl[0] < 0) hsl[0] += 1
  else if (hsl[0] > 1) hsl[0] -= 1
  return hsl
}

/** 色相 → 通道值：把色相轮三等分做"上/平/下"三段斜坡。 */
function hueToChannel(low, high, hue) {
  let h = hue
  if (h < 0) h += 1
  else if (h > 1) h -= 1
  if (6 * h < 1) return low + (high - low) * 6 * h
  if (2 * h < 1) return high
  if (3 * h < 2) return low + (high - low) * ((2 / 3 - h) * 6)
  return low
}

function rgbFromHsl(hsl) {
  if (hsl[1] === 0) return [hsl[2], hsl[2], hsl[2]]
  const high = hsl[2] < 0.5 ? hsl[2] * (1 + hsl[1]) : hsl[2] + hsl[1] - hsl[1] * hsl[2]
  const low = 2 * hsl[2] - high
  return [
    hueToChannel(low, high, hsl[0] + 1 / 3),
    hueToChannel(low, high, hsl[0]),
    hueToChannel(low, high, hsl[0] - 1 / 3),
  ]
}

// —— 模式表：id → { op, weighted } ——
// op(A, B, opacity) 给出"未加权"的混合结果；weighted 为真时再与 A 按 opacity 插值。
const BLEND_TABLE = new Map()
const defineBlend = (id, op, weighted = true) => BLEND_TABLE.set(id, { op, weighted })

defineBlend(1, perChannel(darkenChannel))
defineBlend(2, perChannel(multiplyChannel))
defineBlend(3, perChannel(colorBurnChannel))
defineBlend(4, perChannel(linearBurnChannel))
defineBlend(5, perChannel((a, b) => Math.min(a, b)), false)          // 定义上不加权
defineBlend(6, perChannel(lightenChannel))
defineBlend(7, perChannel(screenChannel))
defineBlend(8, perChannel(colorDodgeChannel))
defineBlend(9, perChannel(linearDodgeChannel))
defineBlend(10, perChannel((a, b) => Math.max(a, b)), false)         // 定义上不加权
defineBlend(11, perChannel(overlayChannel))
defineBlend(12, perChannel(softLightChannel))
defineBlend(13, perChannel(hardLightChannel))
defineBlend(14, perChannel(vividLightChannel))
defineBlend(15, perChannel(linearLightChannel))
defineBlend(16, perChannel(pinLightChannel))
defineBlend(17, perChannel(hardMixChannel))
defineBlend(18, perChannel(differenceChannel))
defineBlend(19, perChannel(exclusionChannel))
defineBlend(20, perChannel(linearBurnChannel))                        // 与 4 同义（包格式里的两个 id）
defineBlend(21, perChannel(reflectChannel))
defineBlend(22, perChannel(glowChannel))
defineBlend(23, perChannel(phoenixChannel))
defineBlend(24, perChannel(averageChannel))
defineBlend(25, perChannel(negationChannel))
// 26–29：HSL 三取一（色相/饱和度/明度分别来自哪一侧见各分支）
defineBlend(26, (A, B) => {
  const base = hslFromRgb(A)
  const over = hslFromRgb(B)
  return rgbFromHsl([over[0], base[1], base[2]])
})
defineBlend(27, (A, B) => {
  const base = hslFromRgb(A)
  return rgbFromHsl([base[0], hslFromRgb(B)[1], base[2]])
})
defineBlend(28, (A, B) => {
  const over = hslFromRgb(B)
  return rgbFromHsl([over[0], over[1], hslFromRgb(A)[2]])
})
defineBlend(29, (A, B) => {
  const base = hslFromRgb(A)
  return rgbFromHsl([base[0], base[1], hslFromRgb(B)[2]])
})
// 30：Tint —— 用底色最大分量当增益，整体推效果色
defineBlend(30, (A, B) => {
  const peak = Math.max(A[0], Math.max(A[1], A[2]))
  return [peak * B[0], peak * B[1], peak * B[2]]
})
// 31：权重写在算子里（结果不再插值）
defineBlend(31, (A, B, opacity) => [A[0] + B[0] * opacity, A[1] + B[1] * opacity, A[2] + B[2] * opacity], false)
// 32：底色自乘的线性减淡变体
defineBlend(32, perChannel((a, b) => a + a * b))

/**
 * 按混合模式 id 把效果色 B 叠到底色 A 上。
 * @param {number} mode 0..32；其它值（含缺省/非法）走 Normal
 * @param {number[]} A 底色 [r,g,b]，0..1 量纲，不 clamp
 * @param {number[]} B 效果色 [r,g,b]
 * @param {number} opacity 透明度权重
 * @returns {number[]} 新数组；**不 clamp**（越界值原样返回）
 */
export function blendRgbByMode(mode, A, B, opacity) {
  const entry = BLEND_TABLE.get(mode)
  if (!entry) return lerpRgb(A, B, opacity)
  const blended = entry.op(A, B, opacity)
  return entry.weighted ? lerpRgb(A, blended, opacity) : blended
}

// ---------- 像素级颜色效果栈（tint / pulse / colorkey） ----------
//
// 三类效果各自的语义见 docs/EFFECTS-COMPUTE-SPEC.md §3。共同口径：
//   · 权重/蒙版在**原始 uv**（u0,v0）上取；脉冲噪声在时间轴上取；
//   · 像素是 [r,g,b,a] 的 0..255 浮点量纲（允许越界）；
//   · 部分分支会**原地改写**调用方数组（见规格 §3.4），这个细节可观测，不得统一。

/** tint：整层往一个色相混合；mode 0 会把层写不透明。 */
function applyTintEffect(pixel, item, textures, time, u0, v0) {
  let weight = item.alpha
  if (item.masked && item.mask) {
    const maskTex = textures.get(item.mask)
    if (maskTex) weight *= maskChannel(maskTex, sampleTex(maskTex, u0, v0))
  }
  const blended = blendRgbByMode(item.blendMode, [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255], item.color, weight)
  return [blended[0] * 255, blended[1] * 255, blended[2] * 255, item.blendMode === 0 ? 255 : pixel[3]]
}

/** pulse：时间（可叠噪声）驱动的周期脉冲；可染双色、可改 alpha、可按蒙版混回原图。 */
function applyPulseEffect(pixel, item, textures, time, u0, v0) {
  let out = pixel
  // "混回原图"要用**进入本步之前**的像素：先留一份副本（只有 masked 时用得上）
  const untouched = item.masked ? pixel.slice() : null
  let pulse = smoothstep(item.bounds[0], item.bounds[1], Math.sin(time * item.speed + item.phase) * 0.5 + 0.5) * item.amount
  if (item.noiseAmount > 0) {
    const noiseTex = textures.get(item.noise) || WHITE
    const noise = sampleTex(noiseTex, time * item.noiseSpeed, time * 0.333 * item.noiseSpeed)
    pulse += (noise[0] / 255) * item.noiseAmount
  }
  pulse = Math.pow(pulse, item.power)
  if (item.pulseColor) {
    const low = [pixel[0] / 255 * item.tintLow[0], pixel[1] / 255 * item.tintLow[1], pixel[2] / 255 * item.tintLow[2]]
    const high = [pixel[0] / 255 * item.tintHigh[0], pixel[1] / 255 * item.tintHigh[1], pixel[2] / 255 * item.tintHigh[2]]
    const blended = blendRgbByMode(item.blendMode, low, high, pulse)
    out = [blended[0] * 255, blended[1] * 255, blended[2] * 255, pixel[3]]
  }
  if (item.pulseAlpha) out[3] *= pulse
  out[0] = Math.max(0, out[0])
  out[1] = Math.max(0, out[1])
  out[2] = Math.max(0, out[2])
  if (untouched && item.mask) {
    const maskTex = textures.get(item.mask)
    if (maskTex) out = mix4(untouched, out, maskChannel(maskTex, sampleTex(maskTex, u0, v0)))
  }
  return out
}

/** colorkey 的软边：距离超过容差后，用这个宽度的 smoothstep 过渡（fuzz 在此之上加宽）。 */
const KEY_EDGE_MIN = 0.001
const KEY_EDGE_BASE = 0.002

/** colorkey：按与 key 色的曼哈顿距离抠除（或反选保留），可选 flatten 预乘。 */
function applyKeyEffect(pixel, item, textures, time, u0, v0) {
  const distance = Math.abs(item.key[0] - pixel[0] / 255) + Math.abs(item.key[1] - pixel[1] / 255) + Math.abs(item.key[2] - pixel[2] / 255)
  let keyMask = smoothstep(KEY_EDGE_MIN, KEY_EDGE_BASE + item.fuzz, distance - item.tol)
  if (item.invert) keyMask = 1 - keyMask
  pixel[3] *= item.keyAlpha * (1 - keyMask) + 1 * keyMask
  if (item.flatten) {
    pixel[0] *= pixel[3] / 255
    pixel[1] *= pixel[3] / 255
    pixel[2] *= pixel[3] / 255
  }
  return pixel
}

/** 像素级效果求值表（用 Map：不与 Object.prototype 的键撞名）。未列出的 type 一律跳过。 */
const PIXEL_EFFECTS = new Map([
  ['tint', applyTintEffect],
  ['pulse', applyPulseEffect],
  ['key', applyKeyEffect],
])

/**
 * 按效果链顺序作用像素级颜色效果。
 * @param {Array} items tint/pulse/colorkey 参数列表（非可迭代输入按 JS 语义抛 TypeError，属既有行为）
 * @param {number[]} t 当前像素 [r,g,b,a]（0..255 量纲；可能被原地改写，见规格 §3.4）
 * @returns {number[]} 结果像素
 */
export function composeColorEffectStack(items, t, textures, time, u0 = 0.5, v0 = 0.5) {
  let pixel = t
  for (const item of items) {
    const effect = PIXEL_EFFECTS.get(item.type)
    if (effect) pixel = effect(pixel, item, textures, time, u0, v0)
  }
  return pixel
}

// ===== src/render/renderer.js =====
// WebGL2 通用 pass 管线渲染器（移植 linux-wallpaperengine 架构）：
// 每层 copy pass → 效果链（WE shader 转译执行，FBO 乒乓）→ 合成到画布。
// copy/合成用自写 shader；效果 pass 用转译 WE shader（MVP=单位矩阵，mul 转置无影响）。
// 空间：层 FBO 内容正立（v-down 显示空间），与 WE 帧缓冲空间（v-up+倒置画面）数学等价（docs/WE_RENDER_CONVENTIONS.md §1）。

const ALIGN = {
  center: [0.5, 0.5],
  left: [0, 0.5],
  right: [1, 0.5],
  top: [0.5, 0],
  bottom: [0.5, 1],
  topleft: [0, 0],
  topright: [1, 0],
  bottomleft: [0, 1],
  bottomright: [1, 1],
}

// (P-95 洁净室重写 2026-09-16) alignment token → 实绘中心偏移。
// 行为规格：docs/IMAGE-ALPHA-ALIGN-SPEC.md §2（只依据规格实现，未参考任何第三方源码）。
// origin 是 alignment 隐含的枢轴（如 left = origin 落在网格左边缘），实绘中心要从枢轴
// 平移 ±size/2。返回 **y-up 编辑器空间** 的像素偏移（y-down 调用方自行取反）。
//
// 结构：两段式 —— ① parse：从 token 串抽出「x 轴符号 / y 轴符号」二元组（小写单词的**子串包含**；
// 同轴两 token 并存时 left / top 优先，互斥择一不叠加）；② lookup：符号元组查表得到
// 「半身位的整数倍」，再乘半宽/半高。token 字形与偏移量在这张表里彻底解耦。
// size 传"有符号的 size×scale"时负 scale 自动翻转偏移方向（与局部矩阵 T(align) 内乘 S 的语义一致）。
// y-down 设计空间的调用方需自行取反 y（parseScene 已做 PROJ_H−y 翻转，偏移在绘制期同步换算）。
const ALIGNMENT_HALF_SHIFTS = Object.freeze({
  '0,0': [0, 0],      // 无 token 命中 / 未知 token
  '1,0': [1, 0],      // left
  '-1,0': [-1, 0],    // right
  '0,-1': [0, -1],    // top
  '0,1': [0, 1],      // bottom
  '1,-1': [1, -1],    // topleft
  '-1,-1': [-1, -1],  // topright
  '1,1': [1, 1],      // bottomleft
  '-1,1': [-1, 1],    // bottomright
})
// token 文法见规格 §2.2：大小写敏感、容忍多余空白；含 center 但不等于 center 的串不短路。
function readAlignmentAxisSigns(alignment) {
  const s = String(alignment)
  const xSign = s.includes('left') ? 1 : s.includes('right') ? -1 : 0
  const ySign = s.includes('top') ? -1 : s.includes('bottom') ? 1 : 0
  return [xSign, ySign]
}
export function alignmentOffsetForToken(alignment, w, h) {
  if (alignment === undefined || alignment === null || alignment === 'center') return [0, 0]
  const signs = readAlignmentAxisSigns(alignment)
  const shift = ALIGNMENT_HALF_SHIFTS[signs[0] + ',' + signs[1]]
  if (!shift) return [0, 0]
  // 0 符号必须返回字面量 0（不是 0*w —— w 非有限时 0*Infinity = NaN，会改变既有行为）
  const ox = shift[0] === 0 ? 0 : shift[0] * (w / 2)
  const oy = shift[1] === 0 ? 0 : shift[1] * (h / 2)
  return [ox, oy]
}

// ①(P-58 H0-1) 自动 HDR 判据（纯函数：renderScene 与 hdr-predicate-test.mjs 共用同一份逻辑）。
//   显式开关优先，语义与 P-41 完全一致：
//     opts.hdr 0/false/'0' → 强制 LDR（不变）
//     opts.hdr 1/true/'1'  → 强制尝试浮点 RT（不变；hdrForceLdrSession 熔断不拦显式强制）
//     缺省（自动）         → general.hdr 为真 **且 general.bloom 为真** 且本会话未熔断
//   为什么要求 bloom：HDR FBO 的唯一消费者是 bloom 链（runBloom 的 HDR 分支直接采该纹理），
//   而 compositeLayer 把每层无条件画进默认帧缓冲 → bloom 关时 HDR FBO 从未被写入，
//   帧末 presentHdrScene 却把它全屏合成 ⇒ 层画对了也会被整屏替换（hina 3554161528 白屏根因；
//   mock-GL 实证：进 HDR FBO 的 draw=0、采样它=1）。bloom=true/hdr=false 的包行为不变（本就 LDR）。
export function resolveHdrWant(opts = {}, general = {}, hdrForceLdrSession = null) {
  if (opts.hdr === 0 || opts.hdr === false || opts.hdr === '0') return false
  if (opts.hdr === 1 || opts.hdr === true || opts.hdr === '1') return true
  // 旧内联式在缺键时可能返回 null/undefined；这里规范化成严格布尔（真值语义逐位不变：
  // 调用点只有 `if (hdrWant && hdrExt)` 一处真值判断）。
  const on = (v) => v === true || (!!v && typeof v === 'object' && v.value === true)
  return !!(!hdrForceLdrSession && on(general.hdr) && on(general.bloom))
}

// ①(P-58 H1) 网格原始包围盒（缓存在 mesh.__bbox，形状 [x0,y0,x1,y1] = min/max）。
//   `?meshsize=1` 的 scaleXY=size/bbox 与 demo 台账矩形都以它为唯一口径
//   （台账自己也会懒填同名键，两处扫描同一 vertices 数组 → 值逐位相同）。
export function meshBBox(mesh) {
  if (!mesh || !mesh.positions || !mesh.positions.length) return null
  if (Array.isArray(mesh.__bbox) && mesh.__bbox.length >= 4) return mesh.__bbox
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  for (const p of mesh.positions) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]
  }
  mesh.__bbox = [x0, y0, x1, y1]
  if (!mesh.__center) mesh.__center = [(x0 + x1) / 2, (y0 + y1) / 2]
  return mesh.__bbox
}

// ①(P-58 H1) `?meshsize=1` 的网格层"按作者 size 框"缩放/定位算术（纯函数：demo 调用点与
//   meshsize-test.mjs 共用同一份逻辑）。
//
// 现状（旗标关，= 官方标定口径）：wpos = origin + (scale.x, ySign·scale.y)·v_raw，即网格按
//   **原始顶点范围 × 层 scale** 1:1 绘制。凯尔希实测：refrender-3719111841.json 的官方标定矩形
//   （91 主体 [1268.18,251.97,1399.8,2073.37]、475 长发3 [245.46,718,1986.05,1619.47]、
//   303 左耳朵1 [1777.93,77.98,444.89,394.99]）与"bbox×scale"逐位吻合（≤1.4px）。
//   而这一路径画出的矩形比 authored size 小（主体 0.838×0.923、长发3 0.853×0.891、左耳朵1
//   0.528×0.496）——差异来自纹理透明留白：网格 UV footprint 恰好等于纹理不透明 footprint
//   （P-58 实测：5 个 puppet 层"不透明像素落在网格 UV 框外"的计数全为 0），所以两种画法的
//   **可见像素相同**，比值差异只是"bbox 台账 vs size 框基线"的口径分叉。
//
// 本函数实现的是**另一个方向**的实验（用户真机 A/B 用）：把网格放大到 authored size 框，
//    scaleXY = size·layer.scale / bbox（y 方向再乘 ySign），
//    实绘中心 = origin + alignment 隐含枢轴偏移（与 quad/CPU 基线同式），
//    网格空间"落到实绘中心"的点默认取 bbox 中心（opts.cropOffset 给出时改取裁剪窗中心，
//    即研究稿的 cropoffset 校正；RE-02 已用二进制证据判定官方运行时不消费该字段，故须显式开）。
// 返回 null = 数据不完整（size/bbox 退化）→ 调用方必须回退今天的路径。
export function meshLayerFit(layer, bbox, opts = {}) {
  if (!layer) return null
  const bb = (Array.isArray(bbox) && bbox.length >= 4) ? bbox : (bbox ? [bbox[0], bbox[1], bbox[2], bbox[3]] : null)
  if (!bb) return null
  const x0 = Number(bb[0]), y0 = Number(bb[1]), x1 = Number(bb[2]), y1 = Number(bb[3])
  const bw = x1 - x0, bh = y1 - y0
  if (!(bw > 0) || !(bh > 0) || !isFinite(bw) || !isFinite(bh)) return null
  const size = layer.size || [0, 0]
  const lsc = layer.scale || [1, 1]
  const org = layer.origin || [0, 0, 0]
  const w = (size[0] || 0) * (lsc[0] || 1)      // 有符号实绘宽（负 scale = 镜像）
  const h = (size[1] || 0) * (lsc[1] || 1)
  if (!(Math.abs(w) > 0) || !(Math.abs(h) > 0) || !isFinite(w) || !isFinite(h)) return null
  const ySign = opts.ySign === 1 ? 1 : -1
  const sx = w / bw
  const sy = h / bh
  // 实绘中心（y-down 设计空间）：origin 是 alignment 隐含枢轴；`?align=0` 时按 center 口径（与绘制端一致）
  const alignZero = opts.alignZero === true
  const off = alignZero ? [0, 0] : alignmentOffsetForToken(layer.alignment, w, h)
  const cx = (org[0] || 0) + off[0]
  const cy = (org[1] || 0) - off[1]
  // 网格空间里"应当落在实绘中心"的点：默认 bbox 中心（= 官方 1:1 画法的自然中心），
  // opts.cropOffset 给出时改用作者裁剪窗中心（研究稿提案；官方运行时不消费，见 RE-02）
  const useCrop = !!(opts.cropOffset && isFinite(opts.cropOffset[0]) && isFinite(opts.cropOffset[1]))
  const mx = useCrop ? opts.cropOffset[0] : (x0 + x1) / 2
  const my = useCrop ? opts.cropOffset[1] : (y0 + y1) / 2
  return {
    scale: [sx, ySign * sy],
    origin: [cx - sx * mx, cy - ySign * sy * my],
    box: [w, h],
    meshCenter: [mx, my],
    dispCenter: [cx, cy],
    centerMode: useCrop ? 'cropoffset' : 'bbox',
    bbox: [x0, y0, x1, y1],
  }
}

const COPY_VERT = `#version 300 es
in vec3 a_Position;
in vec2 a_TexCoord;
uniform mat4 u_MVP;
out vec2 v_UV;
void main() {
  gl_Position = u_MVP * vec4(a_Position, 1.0);
  v_UV = a_TexCoord;
}`

const COPY_FRAG = `#version 300 es
precision mediump float;
in vec2 v_UV;
uniform sampler2D u_Tex;
uniform vec4 u_Color4;
out vec4 fragColor;
void main() {
  fragColor = texture(u_Tex, v_UV) * u_Color4;
}`

const COMPOSITE_FRAG = `#version 300 es
precision mediump float;
in vec2 v_UV;
uniform sampler2D u_Tex;
out vec4 fragColor;
void main() {
  fragColor = texture(u_Tex, v_UV);
}`

// ①(RE-18 官方语义 2026-09-12) 层颜色混合 colorBlendMode：官方在 shader 里用 common_blending.h
//   的 ApplyBlending(BLENDMODE, A, B, opacity) 实现（A=底层/纹理色，B=层颜色，opacity=层 alpha）。
//   全量壁纸实测生效值只有 1/6/11/21/31 —— 这里按官方公式逐字实现这 5 个 + 0（默认=纯乘）：
//     1  = mix(A, min(A,B), o)      6  = mix(A, max(A,B), o)
//     11 = mix(A, Overlay(A,B), o)  21 = mix(A, Reflect(A,B), o)
//     31 = A + B * o
//   未实现的模式走 0（并在设备日志里记一条，便于发现新样本）。

// ①(RE-18 官方语义 2026-09-12) colorBlendMode：A=**当前屏幕背景**、B=本层颜色、opacity=本层 alpha，
//   输出 `out.a = A.a`（alpha 直接取背景，不是 max/mix）。逐分支公式取自官方 common_blending.h:170-263。
//   绑定：u_Tex=本层纹理，u_Screen=绘制本层前的屏幕拷贝（每层 blit 一次），u_Mode=colorBlendMode。
const COPY_FRAG_SCREENBLEND = `#version 300 es
precision mediump float;
in vec2 v_UV;
uniform sampler2D u_Tex;
uniform sampler2D u_Screen;
uniform vec4 u_Color4;
uniform vec2 u_Viewport;
uniform int u_Mode;
out vec4 fragColor;
vec3 bDarken(vec3 b, vec3 s){ return min(b, s); }
vec3 bMultiply(vec3 b, vec3 s){ return b * s; }
vec3 bColorBurn(vec3 b, vec3 s){ return 1.0 - min(vec3(1.0), (1.0 - b) / max(s, vec3(1e-4))); }
vec3 bSubstract(vec3 b, vec3 s){ return max(vec3(0.0), b - s); }
vec3 bLighten(vec3 b, vec3 s){ return max(b, s); }
vec3 bScreen(vec3 b, vec3 s){ return 1.0 - (1.0 - b) * (1.0 - s); }
vec3 bColorDodge(vec3 b, vec3 s){ return min(vec3(1.0), b / max(1.0 - s, vec3(1e-4))); }
vec3 bAdd(vec3 b, vec3 s){ return min(vec3(1.0), b + s); }
vec3 bOverlay(vec3 b, vec3 s){ return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b)); }
vec3 bSoftLight(vec3 b, vec3 s){
  vec3 d = mix(sqrt(b), ((16.0 * b - 12.0) * b + 4.0) * b, step(0.25, b));
  return mix(b - (1.0 - 2.0 * s) * b * (1.0 - b), b + (2.0 * s - 1.0) * (d - b), step(0.5, s));
}
vec3 bHardLight(vec3 b, vec3 s){ return bOverlay(s, b); }
vec3 bVividLight(vec3 b, vec3 s){ return mix(bColorBurn(b, 2.0 * s), bColorDodge(b, 2.0 * (s - 0.5)), step(0.5, s)); }
vec3 bLinearLight(vec3 b, vec3 s){ return clamp(b + 2.0 * s - 1.0, 0.0, 1.0); }
vec3 bPinLight(vec3 b, vec3 s){ return mix(bDarken(b, 2.0 * s), bLighten(b, 2.0 * (s - 0.5)), step(0.5, s)); }
vec3 bHardMix(vec3 b, vec3 s){ return step(1.0, b + s); }
vec3 bDifference(vec3 b, vec3 s){ return abs(b - s); }
vec3 bExclusion(vec3 b, vec3 s){ return b + s - 2.0 * b * s; }
vec3 bReflect(vec3 b, vec3 s){ return mix(min(b * b / max(1.0 - s, vec3(1e-4)), vec3(1.0)), s, step(0.999, s)); }
vec3 bGlow(vec3 b, vec3 s){ return mix(min(s * s / max(1.0 - b, vec3(1e-4)), vec3(1.0)), b, step(0.999, b)); }
vec3 bAverage(vec3 b, vec3 s){ return (b + s) * 0.5; }
vec3 bNegation(vec3 b, vec3 s){ return 1.0 - abs(1.0 - b - s); }
vec3 bPhoenix(vec3 b, vec3 s){ return min(b, s) - max(b, s) + vec3(1.0); }
// ①(RE-38) HSL 系（26-30）逐字取自官方 common_blending.h（实测 60 个语料包 0 次使用，完整性补齐）
vec3 RGBToHSL(vec3 c){
  float mn = min(min(c.r, c.g), c.b), mx = max(max(c.r, c.g), c.b), d = mx - mn;
  float L = (mx + mn) * 0.5, H = 0.0, S = 0.0;
  if (d != 0.0) {
    S = L < 0.5 ? d / (mx + mn) : d / (2.0 - mx - mn);
    float dr = ((mx - c.r) / 6.0 + d * 0.5) / d, dg = ((mx - c.g) / 6.0 + d * 0.5) / d, db = ((mx - c.b) / 6.0 + d * 0.5) / d;
    H = c.r == mx ? db - dg : (c.g == mx ? (1.0 / 3.0) + dr - db : (2.0 / 3.0) + dg - dr);
    if (H < 0.0) H += 1.0; else if (H > 1.0) H -= 1.0;
  }
  return vec3(H, S, L);
}
float HueToRGB(float f1, float f2, float h){
  if (h < 0.0) h += 1.0; else if (h > 1.0) h -= 1.0;
  if ((6.0 * h) < 1.0) return f1 + (f2 - f1) * 6.0 * h;
  if ((2.0 * h) < 1.0) return f2;
  if ((3.0 * h) < 2.0) return f1 + (f2 - f1) * ((2.0 / 3.0) - h) * 6.0;
  return f1;
}
vec3 HSLToRGB(vec3 hsl){
  float f2 = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : (hsl.z + hsl.y) - hsl.z * hsl.y;
  float f1 = 2.0 * hsl.z - f2;
  return vec3(HueToRGB(f1, f2, hsl.x + (1.0 / 3.0)), HueToRGB(f1, f2, hsl.x), HueToRGB(f1, f2, hsl.x - (1.0 / 3.0)));
}
vec3 bHue(vec3 base, vec3 b){ vec3 hb = RGBToHSL(b), hbase = RGBToHSL(base); return HSLToRGB(vec3(hb.r, hbase.g, hbase.b)); }
vec3 bSaturation(vec3 base, vec3 b){ vec3 hb = RGBToHSL(b), hbase = RGBToHSL(base); return HSLToRGB(vec3(hbase.r, hb.g, hbase.b)); }
vec3 bColor(vec3 base, vec3 b){ vec3 hb = RGBToHSL(b), hbase = RGBToHSL(base); return HSLToRGB(vec3(hb.r, hb.g, hbase.b)); }
vec3 bLuminosity(vec3 base, vec3 b){ vec3 hb = RGBToHSL(b), hbase = RGBToHSL(base); return HSLToRGB(vec3(hbase.r, hbase.g, hb.b)); }
vec3 applyBlend(int m, vec3 A, vec3 B, float o) {
  if (m == 0)  return mix(A, B, o);
  if (m == 1)  return mix(A, bDarken(A, B), o);
  if (m == 2)  return mix(A, bMultiply(A, B), o);
  if (m == 3)  return mix(A, bColorBurn(A, B), o);
  if (m == 4 || m == 20) return mix(A, bSubstract(A, B), o);
  if (m == 5)  return min(A, B);
  if (m == 6)  return mix(A, bLighten(A, B), o);
  if (m == 7)  return mix(A, bScreen(A, B), o);
  if (m == 8)  return mix(A, bColorDodge(A, B), o);
  if (m == 9)  return mix(A, bAdd(A, B), o);
  if (m == 10) return max(A, B);
  if (m == 11) return mix(A, bOverlay(A, B), o);
  if (m == 12) return mix(A, bSoftLight(A, B), o);
  if (m == 13) return mix(A, bHardLight(A, B), o);
  if (m == 14) return mix(A, bVividLight(A, B), o);
  if (m == 15) return mix(A, bLinearLight(A, B), o);
  if (m == 16) return mix(A, bPinLight(A, B), o);
  if (m == 17) return mix(A, bHardMix(A, B), o);
  if (m == 18) return mix(A, bDifference(A, B), o);
  if (m == 19) return mix(A, bExclusion(A, B), o);
  if (m == 21) return mix(A, bReflect(A, B), o);
  if (m == 22) return mix(A, bGlow(A, B), o);
  if (m == 23) return mix(A, bPhoenix(A, B), o);
  if (m == 24) return mix(A, bAverage(A, B), o);
  if (m == 25) return mix(A, bNegation(A, B), o);
  if (m == 26) return mix(A, bHue(A, B), o);
  if (m == 27) return mix(A, bSaturation(A, B), o);
  if (m == 28) return mix(A, bColor(A, B), o);
  if (m == 29) return mix(A, bLuminosity(A, B), o);
  if (m == 30) return mix(A, B, o);   // 30 未见官方定义（保留 Normal）
  if (m == 31) return A + B * o;
  return mix(A, B, o);   // 越界值(如 32) → 官方 Normal 兜底
}
void main() {
  vec4 B = texture(u_Tex, v_UV) * u_Color4;
  vec2 uv = gl_FragCoord.xy / max(u_Viewport, vec2(1.0));
  vec4 A = texture(u_Screen, uv);
  fragColor = vec4(applyBlend(u_Mode, A.rgb, B.rgb, B.a), A.a);
}`

const COPY_FRAG_BLEND = `#version 300 es
precision mediump float;
in vec2 v_UV;
uniform sampler2D u_Tex;
uniform vec4 u_Color4;
uniform int u_BlendMode;
out vec4 fragColor;
vec3 overlayf(vec3 A, vec3 B) {
  return vec3(
    A.r < 0.5 ? (2.0 * A.r * B.r) : (1.0 - 2.0 * (1.0 - A.r) * (1.0 - B.r)),
    A.g < 0.5 ? (2.0 * A.g * B.g) : (1.0 - 2.0 * (1.0 - A.g) * (1.0 - B.g)),
    A.b < 0.5 ? (2.0 * A.b * B.b) : (1.0 - 2.0 * (1.0 - A.b) * (1.0 - B.b)));
}
vec3 reflectf(vec3 A, vec3 B) {
  return vec3(
    B.r == 1.0 ? B.r : min(A.r * A.r / (1.0 - B.r), 1.0),
    B.g == 1.0 ? B.g : min(A.g * A.g / (1.0 - B.g), 1.0),
    B.b == 1.0 ? B.b : min(A.b * A.b / (1.0 - B.b), 1.0));
}
void main() {
  vec4 c = texture(u_Tex, v_UV);
  vec3 A = c.rgb;
  vec3 B = u_Color4.rgb;
  float o = u_Color4.a;
  vec3 outRgb = A;
  if (u_BlendMode == 1) outRgb = mix(A, min(A, B), o);
  else if (u_BlendMode == 6) outRgb = mix(A, max(A, B), o);
  else if (u_BlendMode == 11) outRgb = mix(A, overlayf(A, B), o);
  else if (u_BlendMode == 21) outRgb = mix(A, reflectf(A, B), o);
  else if (u_BlendMode == 31) outRgb = A + B * o;
  else outRgb = A * mix(vec3(1.0), B, o);
  fragColor = vec4(outRgb, c.a);
}`

// 粒子光斑 quad：局部 [-0.5,0.5]^2，CPU 端每粒子算 u_MVP（translate*rot*scale）+ 纹理 red 通道形状。
// 官方 genericparticle.frag 语义：v_Color.rgb = mix(color1, color2, v_Color.r)，alpha = v_Color.a；
// 形状 = tex.r（red 通道即渐变软点），additive 走 SRC_ALPHA/ONE → dst += color * (alpha*texR)。
// ①(RE-33 官方语义 2026-09-13) general.bloom / HDR 后处理链：恒定 4 pass（bloomhdriterations 不参与）。
//   1 extract  _rt_default → mip1（4-tap 对角均值下采样；LDR 硬线性斜坡阈值 + 去灰；禁用→写黑=中性）
//   2 blurX    mip1 → mip2（13-tap 一维高斯，间距 8×mip1 texel）
//   3 blurY    mip2 → aux （13-tap 一维高斯，间距 8×mip2 texel）
//   4 compose  scene + aux（加法直写，无混合状态、无 gamma）
//   权重来自官方内嵌 shader（±6..0 对称，和≈1）；LUMA=(0.2989,0.5870,0.1140)。
const BLOOM_VS = `#version 300 es
in vec3 a_Position;
in vec2 a_TexCoord;
out vec2 v_UV;
void main() {
  v_UV = a_TexCoord;
  gl_Position = vec4(a_Position.xy, 0.0, 1.0);
}`

// ①(P-90 2026-09-16) **FXAA 片元着色器** —— 借自 `oneincase/webwallgl`（**MIT**）1.3.23
//   `renderer/vendor/we-scene/render/renderer-glsl.js:452-489` 的 `FXAA_FRAG`
//   （本地副本 `vendor-ref/webwallgl`，`git show origin/main:…` 取证）。
//   署名与台账：`THIRD-PARTY.md`（oneincase/webwallgl 条目）、`docs/COPYING-RULES.md` §4 台账。
//   移植差异（**逐条记录**，便于后人核对）：
//     · 上游用 `out vec4 fragColor` + `precision highp float`（原样保留）；顶点着色器复用本仓库的
//       `BLOOM_VS`（同为 `a_Position`/`a_TexCoord` → `v_UV` 的全屏三角形对），上游用自己的 quad。
//     · 上游常量名/数值**逐字保留**（SPAN_MAX=8.0 / REDUCE_MUL=1/8 / REDUCE_MIN=1/128 /
//       LUMA=(0.299,0.587,0.114)），算法**一行未改** —— FXAA 是 Lottes 的公开算法，
//       这里是"照抄 MIT 实现"而不是"重新发明"。
//     · 输出 alpha 恒 1.0（与上游一致：画布 `alpha:false`，写出 alpha 无意义）。
const FXAA_FS = `#version 300 es
precision highp float;
in vec2 v_UV;
uniform sampler2D u_Tex;
uniform vec2 u_Texel; // 1/width, 1/height
out vec4 fragColor;
void main() {
  const float SPAN_MAX = 8.0;
  const float REDUCE_MUL = 1.0 / 8.0;
  const float REDUCE_MIN = 1.0 / 128.0;
  const vec3 LUMA = vec3(0.299, 0.587, 0.114);
  vec3 rgbNW = texture(u_Tex, v_UV + vec2(-1.0, -1.0) * u_Texel).rgb;
  vec3 rgbNE = texture(u_Tex, v_UV + vec2( 1.0, -1.0) * u_Texel).rgb;
  vec3 rgbSW = texture(u_Tex, v_UV + vec2(-1.0,  1.0) * u_Texel).rgb;
  vec3 rgbSE = texture(u_Tex, v_UV + vec2( 1.0,  1.0) * u_Texel).rgb;
  vec3 rgbM  = texture(u_Tex, v_UV).rgb;
  float lumaNW = dot(rgbNW, LUMA);
  float lumaNE = dot(rgbNE, LUMA);
  float lumaSW = dot(rgbSW, LUMA);
  float lumaSE = dot(rgbSE, LUMA);
  float lumaM  = dot(rgbM,  LUMA);
  float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
  float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));
  vec2 dir = vec2(
    -((lumaNW + lumaNE) - (lumaSW + lumaSE)),
     ((lumaNW + lumaSW) - (lumaNE + lumaSE)));
  float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * REDUCE_MUL), REDUCE_MIN);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = min(vec2(SPAN_MAX), max(vec2(-SPAN_MAX), dir * rcpDirMin)) * u_Texel;
  vec3 rgbA = 0.5 * (
    texture(u_Tex, v_UV + dir * (1.0 / 3.0 - 0.5)).rgb +
    texture(u_Tex, v_UV + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (
    texture(u_Tex, v_UV + dir * -0.5).rgb +
    texture(u_Tex, v_UV + dir *  0.5).rgb);
  float lumaB = dot(rgbB, LUMA);
  fragColor = vec4((lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB, 1.0);
}`

// ①(P-90) `q != off` 时把内部离屏 FBO 上采样到画布用的呈现着色器（直写、无混合、无 gamma）。
//   与 `presentHdrScene` 同语义（`scene + 黑 = scene`）：采样一张纹理，1:1 覆盖。
const Q_PRESENT_FS = `#version 300 es
precision mediump float;
in vec2 v_UV;
uniform sampler2D u_Tex;
out vec4 fragColor;
void main() { fragColor = texture(u_Tex, v_UV); }`

// pass1：4-tap 对角均值 + 阈值/去灰（LDR 分支照抄官方；HDR 用 Karis soft-knee，RT 非浮点时退化为硬阈值）
const BLOOM_EXTRACT_FS = `#version 300 es
precision mediump float;
in vec2 v_UV;
uniform sampler2D u_Scene;
uniform vec2 u_Texel;      // 目标 texel（=1/mip1 尺寸）
uniform float u_Threshold;
uniform float u_Feather;
uniform float u_Strength;
uniform float u_Enabled;   // 0 → 写黑（禁用中性）
uniform vec3 u_Tint;
uniform float u_Hdr;
out vec4 fragColor;
const vec3 LUMA = vec3(0.2989, 0.5870, 0.1140);
void main() {
  vec4 c = texture(u_Scene, v_UV + vec2(-u_Texel.x, -u_Texel.y))
         + texture(u_Scene, v_UV + vec2( u_Texel.x, -u_Texel.y))
         + texture(u_Scene, v_UV + vec2(-u_Texel.x,  u_Texel.y))
         + texture(u_Scene, v_UV + vec2( u_Texel.x,  u_Texel.y));
  c *= 0.25;
  vec3 rgb;
  if (u_Hdr > 0.5) {
    // Karis soft-knee（feather 缺省 0 → 硬阈值）
    float knee = max(u_Threshold * u_Feather, 1e-4);
    float br = max(max(c.r, c.g), c.b);
    float soft = clamp(br - u_Threshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee);
    float w = max(soft, br - u_Threshold) / max(br, 1e-4);
    rgb = c.rgb * w;
  } else {
    float mx = max(max(c.r, c.g), c.b);
    rgb = c.rgb * clamp(mx - u_Threshold, 0.0, 1.0);   // 硬线性斜坡
    rgb = 2.0 * rgb - dot(rgb, LUMA);                  // 去灰
  }
  rgb = max(vec3(0.0), rgb * u_Strength * u_Tint);
  fragColor = vec4(rgb * (u_Enabled > 0.5 ? 1.0 : 0.0), 1.0);
}`

// pass2/3：13-tap 一维高斯（官方权重）
const BLOOM_BLUR_FS = `#version 300 es
precision mediump float;
in vec2 v_UV;
uniform sampler2D u_Tex;
uniform vec2 u_Dir;        // (1,0) 或 (0,1)
uniform vec2 u_Step;       // 8×texel，逐级尺寸不同
out vec4 fragColor;
void main() {
  vec2 d = u_Dir * u_Step;
  vec3 c = texture(u_Tex, v_UV).rgb * 0.171834;
  c += (texture(u_Tex, v_UV + d * 1.0).rgb + texture(u_Tex, v_UV - d * 1.0).rgb) * 0.156756;
  c += (texture(u_Tex, v_UV + d * 2.0).rgb + texture(u_Tex, v_UV - d * 2.0).rgb) * 0.119007;
  c += (texture(u_Tex, v_UV + d * 3.0).rgb + texture(u_Tex, v_UV - d * 3.0).rgb) * 0.075189;
  c += (texture(u_Tex, v_UV + d * 4.0).rgb + texture(u_Tex, v_UV - d * 4.0).rgb) * 0.039533;
  c += (texture(u_Tex, v_UV + d * 5.0).rgb + texture(u_Tex, v_UV - d * 5.0).rgb) * 0.017298;
  c += (texture(u_Tex, v_UV + d * 6.0).rgb + texture(u_Tex, v_UV - d * 6.0).rgb) * 0.006299;
  fragColor = vec4(c, 1.0);
}`

// pass4：scene + bloom（直写，无混合状态、无 gamma）
const BLOOM_COMPOSE_FS = `#version 300 es
precision mediump float;
in vec2 v_UV;
uniform sampler2D u_Scene;
uniform sampler2D u_Bloom;
out vec4 fragColor;
void main() {
  vec4 s = texture(u_Scene, v_UV);
  vec4 b = texture(u_Bloom, v_UV);
  fragColor = vec4(s.rgb + b.rgb, s.a);
}`

const PARTICLE_VS = `#version 300 es
in vec3 a_Position;
in vec2 a_TexCoord;
in vec2 a_TexCoordB;   // ①(RE-31) 精灵表下一帧 UV（非精灵表时等于 a_TexCoord）
in float a_Blend;      // ①(RE-31) 帧间混合系数（SPRITESHEETBLEND）
in float a_Alpha;
// ①(P-126 A) **逐粒子 RGB**：colorrandom / instanceoverride.colorn|color 算出的颜色。
//   走**独立顶点缓冲**（partColorVBO，3 float/顶点）：几何缓冲的 36B 布局一个字节都不动，
//   所以既有顶点流断言 / render-audit 参考产物 / 形状审计全部逐位不变。
in vec3 a_Color;
uniform mat4 u_MVP;
out vec2 v_TexCoord;
out vec2 v_TexCoordB;
out float v_Blend;
out float v_Alpha;
out vec3 v_Color;
void main() {
  gl_Position = u_MVP * vec4(a_Position, 1.0);
  v_TexCoord = a_TexCoord;
  v_TexCoordB = a_TexCoordB;
  v_Blend = a_Blend;
  v_Alpha = a_Alpha;
  v_Color = a_Color;
}`
// ①(新 2026-09-12) puppet mesh 蒙皮渲染（官方语义：assets/shaders/base/model_vertex_v1.h）
//   position' = mul(vec4(position,1), Σ w_i · g_Bones[blendIndices_i])；再乘 u_MVP（层矩阵）
//   g_Bones 布局：每骨 4×vec4（mat4 列）= 官方 ToDxcRowVectorSkinningUniform 的 64B 步长
const MESH_VS = `#version 300 es
in vec3 a_Position;
in vec2 a_TexCoord;
in vec4 a_BlendIdx;
in vec4 a_BlendWeight;
uniform mat4 u_Bones[32];
uniform vec2 u_Origin;   // 层 origin（设计坐标，= 网格中心位置）
uniform vec2 u_Scale;    // (scaleX, -scaleY)（mesh 局部 y-up → 世界 y-down）
uniform vec2 u_Proj;     // (projW, projH) 设计画布（= 无相机时的取景窗口；见 u_Framed）
uniform vec2 u_View;     // ①(P-100) 相机 view 平移（世界像素，= (−pose.x, +pose.y)）；无相机 (0,0)
uniform vec2 u_Framed;   // ①(P-100) 相机取景窗口（= 设计画布 / zoom）；无相机 = u_Proj
uniform float u_VFlip;   // 0/1：纹理 v 轴是否翻转（A/B 诊断用，?vflip=1）
out vec2 v_TexCoord;
void main() {
  vec4 p = vec4(a_Position, 1.0);
  vec4 sk = vec4(0.0);
  for (int k = 0; k < 4; k++) {
    int bi = int(a_BlendIdx[k]);
    float w = a_BlendWeight[k];
    if (w != 0.0) sk += (p * u_Bones[bi]) * w;
  }
  // ①(P-100 根因) 相机取景：**与四边形层同一个变换**（compositeLayer 走 viewProj = P·V）——
  //   wpos_cam = V·wpos，再按 framed 窗口以**画布中心**为基准投影（mat4Ortho 的实参是 cx±fw/2
  //   ⇒ clip_x = (2·w.x − projW)/framedW）。旧实现只按 u_Proj（设计画布）1:1 映射、
  //   **完全不读相机** ⇒ 相机层动画（hina 3554161528 入场 zoom 3→1 + 平移）带不动蒙皮角色：
  //   背景/钢琴/花朵都跟着镜头缩放平移，角色却钉死在屏幕上 ⇒ 用户实测"把人物固定在屏幕中间、
  //   去移动背景"。⚠ 缩放基准必须是**画布中心**而非 0：无相机（u_View=0、u_Framed=u_Proj）时
  //   两者数值相同（= 改动前逐位不变）；有相机时"绕 0 缩放"会把角色再推出去（实测同一世界点
  //   (2200.5,595.2) 在 t=0 应为 x=6719.8，绕 0 缩放会算成 10559.8 —— 与四边形层不配准）。
  vec2 c = u_Proj * 0.5;
  vec2 wpos = u_Origin + u_Scale * sk.xy + u_View;
  gl_Position = vec4((wpos.x - c.x) * 2.0 / u_Framed.x, (c.y - wpos.y) * 2.0 / u_Framed.y, 0.0, 1.0);
  // ?vflip=1：纹理 v 轴翻转（一次刷新即可 A/B 判定"头发/飘带倒着"是否 v 轴反）
  v_TexCoord = vec2(a_TexCoord.x, mix(a_TexCoord.y, 1.0 - a_TexCoord.y, u_VFlip));
}`
const MESH_FS = `#version 300 es
precision mediump float;
in vec2 v_TexCoord;
uniform sampler2D u_Tex;
out vec4 fragColor;
void main() { fragColor = texture(u_Tex, v_TexCoord); }`

const PARTICLE_FS = `#version 300 es
precision mediump float;
in vec2 v_TexCoord;
in vec2 v_TexCoordB;
in float v_Blend;
in float v_Alpha;
in vec3 v_Color;          // ①(P-126 A) 逐粒子 RGB（u_Color 是"整批同色"时的上提值，两者相乘）
uniform sampler2D u_Tex;
uniform vec3 u_Color;
uniform float u_Alpha;
uniform float u_TexFmt;   // ①(P-65) 贴图 .tex format id（TEX0FORMAT 等价物）
out vec4 fragColor;
// ①(P-65 2026-09-15 用户第 12/13 项) 官方 common_fragment.h:92-113 ConvertTexture0Format **逐字**：
//   RG88/RG1616F → _sample.rrrg（RGB=R 通道、A=G 通道）
//   R8/R16F      → vec4(1,1,1,_sample.r)（RGB 恒白、A=R 通道）
//   其余格式      → 原样透传（ARGB8888/DXT1/3/5/BC7…）
//   为什么必须做：这两类贴图的**形状在单通道里**，而我们的解码器按 RePKG 约定把 RG88 展成
//   (rgb=G, a=R)、把 R8 展成 (rgb=R, a=255)。不转换时 R8/RG88 粒子会得到 alpha=1 的**实心矩形**
//   —— 用户第 12 项「Girl and cat 后面渲染成一个红色方块、中间一点黄色」就是这个
//   （particle/fog/fog1=R8、particle/light/light_shafts_0/beam_1=RG88，
//    quad 四角 alpha 实测 1.000、不透明片元 100%），第 13 项「只是部分粒子有问题」也由此解释：
//   halo/drop/流星/particle3（ARGB8888/DXT5）走的仍是原样透传分支，逐位不变。
//   GL 侧通道序：RG88 由 makeTextureMip 以 GL_RG 上传（.r=原始 R、.g=原始 G，与官方一致），
//   WebGL1 回退按 (r=R,g=G,b=R,a=1) 展开，两种布局下下面两式都成立。
vec4 weTexFmt(vec4 s) {
  bool rg = (u_TexFmt > 7.5 && u_TexFmt < 8.5) || (u_TexFmt > 9.5 && u_TexFmt < 10.5);
  bool r8 = (u_TexFmt > 8.5 && u_TexFmt < 9.5) || (u_TexFmt > 10.5 && u_TexFmt < 11.5);
  if (rg) return vec4(s.r, s.r, s.r, s.g);
  if (r8) return vec4(1.0, 1.0, 1.0, s.r);
  return s;
}
void main() {
  // 官方 genericparticle.frag:36-46：SPRITESHEETBLEND 时 mix(tex(uv.xy), tex(uv.zw), blend)，
  //   color = v_Color * ConvertTexture0Format(texSample2D(...)) —— 乘的是**完整 RGBA**。
  vec4 tex = weTexFmt(mix(texture(u_Tex, v_TexCoord), texture(u_Tex, v_TexCoordB), v_Blend));
  // ①(P-59 2026-09-14) 形状/透明度 = 纹理 **alpha**（旧实现取 tex.r 当形状 → 白色三角块）。
  //   实测语料：particle/halo、halo_3/4/6、download、drop 等全部是「RGB 恒 255 + 形状在 alpha」
  //   （red255pct=100%，avgA 10~48，aMax 225~255）→ 用 .r 时 alpha 恒 1 = 实心白 quad；
  //   反向的 fog/beam/light_shafts 是「alpha 恒 255 + 形状在 RGB」，用 .r 又会让它几乎全透明。
  //   两种形态只有官方口径（RGBA 直乘 + SRC_ALPHA 混合）同时正确。
  // ①(P-126 A) 逐粒子颜色：官方 genericparticle.frag:39/43/46 是 v_Color * Convert(tex)
  //   —— 颜色**逐粒子**来自 mix(color1,color2,random)（colorrandom）或 instanceoverride 的
  //   colorn/color。旧实现把算好的 RGB 丢在 vis[3..5] 没人用、绘制时恒 u_Color=(1,1,1)
  //   ⇒ 萤火虫 authored 的紫色永远不上屏（白点）。现在 u_Color（整批同色时上提）与
  //   v_Color（逐粒子，独立 VBO）相乘，两者都缺省为 1 时与改前**逐位一致**。
  fragColor = vec4(u_Color * v_Color * tex.rgb, u_Alpha * v_Alpha * tex.a);
}`

// quad 顶点（每顶点 5 float：x,y,z,u,v）
// WE 同款空间：层 FBO 内容倒置（FBO 顶=纹理底行），pass quad 顶 v=1（顶采顶直通），合成时再正过来。
function layerQuadVerts(w, h) {
  return new Float32Array([
    0, h, 0, 0, 1, // 层空间顶（y=h）采样 v=1（纹理底行）→ FBO 顶=纹理底（倒置，与 WE 一致）
    0, 0, 0, 0, 0,
    w, h, 0, 1, 1,
    w, h, 0, 1, 1,
    0, 0, 0, 0, 0,
    w, 0, 0, 1, 0,
  ])
}
function passQuadVerts() {
  return new Float32Array([
    -1, 1, 0, 0, 1, // NDC 顶 v=1（FBO 纹理 v=1=顶行，顶采顶直通）
    -1, -1, 0, 0, 0,
    1, 1, 0, 1, 1,
    1, 1, 0, 1, 1,
    -1, -1, 0, 0, 0,
    1, -1, 0, 1, 0,
  ])
}
function localQuadVerts() {
  return new Float32Array([
    -0.5, 0.5, 0, 0, 1, // local +y = 屏幕下方（y-down 世界）：屏幕底采样 v=1（FBO 顶=纹理底）→ 屏幕底=纹理底
    -0.5, -0.5, 0, 0, 0, // local -y = 屏幕上方：屏幕顶采样 v=0（FBO 底=纹理顶）→ 屏幕顶=纹理顶（正立）
    0.5, 0.5, 0, 1, 1,
    0.5, 0.5, 0, 1, 1,
    -0.5, -0.5, 0, 0, 0,
    0.5, -0.5, 0, 1, 0,
  ])
}
// ①(长条眼窗) 同 localQuadVerts 几何（quad=layer.size×scale），但把 UV 窗 [u0,v0]-[u1,v1]
// 映射到整个 quad —— 供无效果直绘层（眼睛组合/眼皮）显示纹理子窗口，避免整条垂直条上屏。
function localQuadVertsUV(uvRect) {
  const u0 = uvRect[0], v0 = uvRect[1], u1 = uvRect[2], v1 = uvRect[3]
  return new Float32Array([
    -0.5, 0.5, 0, u0, v1,
    -0.5, -0.5, 0, u0, v0,
    0.5, 0.5, 0, u1, v1,
    0.5, 0.5, 0, u1, v1,
    -0.5, -0.5, 0, u0, v0,
    0.5, -0.5, 0, u1, v0,
  ])
}

const GL_TYPES = {
  0x1406: 'float', // FLOAT
  0x8b50: 'vec2', // FLOAT_VEC2
  0x8b51: 'vec3', // FLOAT_VEC3
  0x8b52: 'vec4', // FLOAT_VEC4
  0x1404: 'int', // INT
  0x8b53: 'ivec2',
  0x8b54: 'ivec3',
  0x8b55: 'ivec4',
  0x8b56: 'bool',
  0x8b5c: 'mat4', // FLOAT_MAT4
  0x8b5b: 'mat3', // FLOAT_MAT3
}

// ===== ①(P-68 2026-09-15 用户第 20 项「MP4 视频画质」) 分辨率档位 + 视频纹理上传参数 =====
// 背景（docs/MP4-QUALITY-RESEARCH.md ①/②/③）：:8899 渲染路径把视频画质主动降了两级半 ——
//   demo.html 画布硬编码 1280×720、视频纹理上传硬编码 ≤1280×720、4K→1280 走 2D canvas 中转
//   （`imageSmoothingQuality` 未设 = 浏览器默认 'low'）、33 ms 上传节流（60 fps 源最多 30 fps
//   上屏）、视频纹理无 mip 链（MIN_FILTER=LINEAR）。而包内源片是 3840×2160@60 /
//   4000×2300@60（13.8 / 34.4 Mbps）—— 是自伤，不是源的问题。
// 本段把两处硬编码换成显式档位（默认 1080p），并保留 `?res=720p` / `?res=legacy` 作为
// **逐位等于改动前行为**的回归基线（video-quality-test.mjs 用"冻结的旧算法"逐值对拍）。
//
// 档位表（16:9）：720p=1280×720 / 1080p=1920×1080 / 1440p=2560×1440 / 2160p(=4k)=3840×2160
//   · 画布尺寸 = 档位尺寸；demo.html 用**同一个** parseResTier 解析**同一个** `?res=` ⇒ 同源同值。
//   · 视频纹理上传上限 = 档位尺寸；源 ≤ 上限时**直传** `<video>`（不经 2D canvas，省一次全幅拷贝）。
//   · 720p 与 legacy 是同一档且 legacy=1：节流 33 ms、**不设置** `imageSmoothingQuality`
//     （= 浏览器默认 'low'）、超限必走 2D canvas —— 即改动前那三条行为逐位一致。
//   · 直传为什么不需要 mip 链：上传上限 ≤ 画布 ⇒ 纹理永不会被"缩得比画布还小"再采样
//     （最坏 1:1；legacy 档 4000×2300→1280×736 对 720 高画布也只 0.98:1），LINEAR 4-tap 足矣。
//     视频纹理走 makeTexture（不建 mip 级），且 3840×2160 / 4000×2300 都是 NPOT —— 本仓库已有
//     实锤（见下方 makeTextureMip 注释：Adreno 大 NPOT generateMipmap 静默失败 → 不完整纹理
//     采样 = 透明层）⇒ 不开 mip（videoStats.mip 恒 0，可对账）。
export const RES_TIER_SIZES = { '720p': [1280, 720], '1080p': [1920, 1080], '1440p': [2560, 1440], '2160p': [3840, 2160] }
export const DEFAULT_RES_TIER = '1080p'
// `?res=legacy` 的历史别名集合（都映射到 legacy 档 = 改动前行为）
const RES_LEGACY_TIER = '720p'
// ①(2026-09-21 「画布跟着显示尺寸走」) **活档位**名字：`?res=dpr` / `?res=dpr1`…`?res=dpr5`。
//   与 `auto` 的区别（**为什么不用 auto 顶替**）：`auto` 是**启动时一次**按 `innerWidth×min(dpr,2)`
//   向上取整到命名档（`720p|1080p|1440p|2160p`），它的四条读数被 `tests/video-quality-test.mjs:161-165`
//   逐值钉住 ⇒ 改它的语义 = 改既有判据。本档位是**新增值**（不新增开关名，见下），语义是
//   「画布 = 画布的 **CSS 显示尺寸** × min(devicePixelRatio, 上限)，随尺寸/DPR 变化**重算**」，
//   并且有硬上限（见 LIVE_CANVAS_LIMITS）—— 这正是"面板小就按面板出图、全屏要重算"那条链。
export const RES_LIVE_TIER = RES_LIVE_TIER_NAME()
function RES_LIVE_TIER_NAME() { return 'dpr' }
// 活档位的上限（**有上限**是要求的一部分：没有上限时 4K 全屏 × DPR3 = 11520×6480 ≈ 75 MPix/帧，
// 移动 GPU 上必然掉帧/丢上下文）。两条同时生效：单边 ≤ 4096、总像素 ≤ 3840×2160（8.29 MPix）。
// 数字来历：4096 是本仓库 `DEV_MAX_TEX` 的兜底值（core 里同口径），8.29 MPix = 本仓库 `?res=2160p`
// 档的像素数 —— 活档位**不该比显式最大档更贵**。
export const LIVE_CANVAS_LIMITS = { maxDim: 4096, maxPixels: 3840 * 2160, minDim: 2 }

/**
 * 活档位的**唯一**尺寸算式（纯函数 ⇒ Node 可直接钉住；demo.html 只做接线）。
 * 输入 `{ cssW, cssH, deviceDpr, dprCap, limits }`：
 *   · `cssW/cssH` = 画布的 **CSS 显示尺寸**（clientWidth/clientHeight，不是窗口，也不是设计分辨率）；
 *   · `deviceDpr`  = `window.devicePixelRatio`；
 *   · `dprCap`     = 可选上限（`?res=dprN` 的 N；缺省/非法 ⇒ 不设上限 = 用设备 DPR）。
 * 输出 `{ width, height, dpr, capped, deviceDpr, dprCap, cssW, cssH }`，`capped ∈ ok|dim-cap|pixel-cap|bad-input`。
 * 两条**诚实边界**：① 非有限/非正的 CSS 尺寸 ⇒ 退化成 `minDim×minDim` 并标 `bad-input`（不猜、不抛）；
 * ② 收缩是**等比**的，宽高比不变（画布比例 = 显示比例，不会把画面拉变形）。
 */
export function resolveLiveCanvasSize(input) {
  const v = input || {}
  const cssW = Number(v.cssW), cssH = Number(v.cssH)
  const lim = Object.assign({}, LIVE_CANVAS_LIMITS, v.limits || {})
  if (!Number.isFinite(cssW) || !Number.isFinite(cssH) || cssW <= 0 || cssH <= 0) {
    return { width: lim.minDim, height: lim.minDim, dpr: 1, capped: 'bad-input', deviceDpr: 1, dprCap: null, cssW: 0, cssH: 0 }
  }
  const dev = Math.max(1, Number(v.deviceDpr) || 1)
  const capRaw = Number(v.dprCap)
  const hasCap = Number.isFinite(capRaw) && capRaw >= 1
  /* ①(2026-09-22) **显式乘数** `dprWanted`（来自 `?res=dpr1..dpr5` 或宿主 `setRenderDpr(N)`）：
     它是"我要按 N 倍出图"（超采样），**不是上限** —— 在 1× 屏上选 2 也必须真的变 2×。
     真机复现（修前）：无头/1× 屏上 `dpr = min(deviceDpr=1, cap=2) = 1` ⇒ 切 DPR 画布一点不变
     （用户报的"DPR 1→2 无法显示"）。缺省档（不带 N）行为**逐位不变**：`min(设备 DPR, 上限)`。
     安全上限仍由 `LIVE_CANVAS_LIMITS`（单边 ≤4096 / 总像素 ≤3840×2160）在下面兜住。 */
  const wantRaw = Number(v.dprWanted)
  const hasWant = Number.isFinite(wantRaw) && wantRaw >= 1
  const dpr = hasWant ? wantRaw : Math.min(dev, hasCap ? capRaw : Infinity)
  let w = cssW * dpr, h = cssH * dpr, capped = 'ok'
  const shrink = (k, why) => { if (k < 1) { w *= k; h *= k; capped = why } }
  if (w > lim.maxDim || h > lim.maxDim) shrink(Math.min(lim.maxDim / w, lim.maxDim / h), 'dim-cap')
  if (w * h > lim.maxPixels) shrink(Math.sqrt(lim.maxPixels / (w * h)), 'pixel-cap')
  const even = (x) => Math.max(lim.minDim, Math.round(x / 2) * 2)
  return {
    width: even(w), height: even(h), dpr: Math.round(dpr * 1000) / 1000, capped,
    deviceDpr: dev, dprCap: hasCap ? capRaw : null, cssW: Math.round(cssW), cssH: Math.round(cssH),
  }
}

/** 解析档位。raw 为 URL `?res=` 原值（null/'' = 默认 1080p）。env 供 auto 用（默认取 window）。 */
export function parseResTier(raw, env) {
  const e = env || (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}))
  const req = (raw === null || raw === undefined) ? '' : String(raw).trim().toLowerCase()
  const mk = (name, w, h, legacy, extra) => Object.assign({
    requested: req || null, name, width: w, height: h,
    capW: w, capH: h,                       // 视频纹理上传上限 = 画布尺寸（同源同值）
    legacy: !!legacy,
    throttleMs: legacy ? 33 : 1000 / 60,    // legacy 档 = 改动前的硬编码 33ms；其余默认目标 60fps
    throttleFps: legacy ? 1000 / 33 : 60,
    smoothing: legacy ? 'low' : 'high',     // legacy 档不写 imageSmoothingQuality（= 浏览器默认 low）
    invalid: null, defaulted: false, auto: false,
  }, extra || {})
  if (!req) return mk(DEFAULT_RES_TIER, 1920, 1080, false, { defaulted: true })
  if (req === 'legacy') return mk(RES_LEGACY_TIER, 1280, 720, true, { alias: 'legacy' })
  if (RES_TIER_SIZES[req]) { const s = RES_TIER_SIZES[req]; return mk(req, s[0], s[1], req === RES_LEGACY_TIER) }
  if (req === '4k') return mk('2160p', 3840, 2160, false, { alias: '4k' })
  if (req === 'auto') {
    // 屏幕物理像素（CSS 像素 × dpr，dpr 夹到 1..2：>2 的收益远小于 9 倍像素的成本）
    const dpr = Math.max(1, Math.min(2, Number(e && e.devicePixelRatio) || 1))
    const iw = Number(e && e.innerWidth) || 1920
    const pxW = Math.round(iw * dpr)
    let pick = 1280
    for (const w of [1280, 1920, 2560, 3840]) { pick = w; if (w >= pxW) break }
    const nm = pick === 1280 ? '720p' : pick === 1920 ? '1080p' : pick === 2560 ? '1440p' : '2160p'
    // auto 命中 720p 时**不是** legacy 档（沿用新上传参数：60fps / smoothing high）；
    // 只有显式 `?res=720p|legacy` 才是逐位兼容档。
    return mk(nm, pick, Math.round(pick * 9 / 16), false, { auto: true, autoPxW: pxW, autoDpr: dpr })
  }
  // 活档位：`dpr`（= 不设上限，用设备 DPR）或 `dprN`（N=1..5 ⇒ `?res=dpr1` 上限 1×，与测试台「DPR」档同值域）。
  // **为什么不新增开关名**：`tests/diag-flag-check.mjs` 把"页面里 `URLSearchParams.get('x')` 的名字"与
  // `docs/README-DIAGNOSTICS.md` 主表**双向**比对 —— 上限放进 `res` 的取值域 ⇒ 不新增开关名、不改那张表。
  const liveM = /^dpr([0-9]?)$/.exec(req)
  if (liveM) {
    const size = resolveLiveCanvasSize({
      cssW: Number(e && e.innerWidth) || 1920,
      cssH: Number(e && e.innerHeight) || 1080,
      deviceDpr: Number(e && e.devicePixelRatio) || 1,
      dprCap: liveM[1] === '' ? null : Number(liveM[1]),
    })
    return mk(RES_LIVE_TIER, size.width, size.height, false, {
      live: true, liveDpr: size.dpr, liveDprCap: size.dprCap, liveCap: size.capped,
    })
  }
  const m = /^([0-9]{2,5})x([0-9]{2,5})$/.exec(req)
  if (m) {
    const w = Math.max(2, Math.round(Number(m[1]) / 2) * 2)
    const h = Math.max(2, Math.round(Number(m[2]) / 2) * 2)
    // 显式 WxH 与某命名档位同尺寸 → 归一成该命名档（于是 `?res=1280x720` 与 `?res=720p` 同路径）
    for (const k of Object.keys(RES_TIER_SIZES)) {
      const s = RES_TIER_SIZES[k]
      if (s[0] === w && s[1] === h) return mk(k, w, h, k === RES_LEGACY_TIER, { explicit: req })
    }
    return mk('custom', w, h, false, { custom: true, explicit: req })
  }
  // 非法值：回退默认档，但**显式标记**（日志/诊断里看得见，不静默）
  return mk(DEFAULT_RES_TIER, 1920, 1080, false, { defaulted: true, invalid: String(raw) })
}

/**
 * 视频纹理上传决策（纯函数，便于用"冻结的旧算法"逐值对拍）。
 * 返回 { upload, reason, tw, th, direct, capW, capH }
 *   · tier.legacy（`?res=720p|legacy`）时与改动前的硬编码表达式**逐位同值**：
 *     `gap < 33 → 跳过`；`videoWidth > 1280 || videoHeight > 720 → canvas 缩到 min(1280,videoWidth)`；
 *     否则直传并按 `videoWidth || texObj.width` 保持旧尺寸。
 *   · 其余档位：capW/capH = 档位尺寸；源 ≤ 上限 → 直传（不放大），否则按宽等比缩到上限。
 */
export function videoUploadPlan(input) {
  const v = input || {}
  const tier = v.tier || parseResTier(null)
  const thr = (v.throttleMs === undefined || v.throttleMs === null) ? tier.throttleMs : v.throttleMs
  const gap = (Number(v.now) || 0) - (Number(v.lastUploadAt) || 0)
  if (gap < thr) return { upload: false, reason: 'throttle', gap, throttleMs: thr, capW: tier.capW, capH: tier.capH }
  // 与旧实现同口径的兜底（videoWidth/videoHeight 未就绪时用 1280/720 占位，不改变旧行为）
  const vw = v.videoWidth || (tier.legacy ? 1280 : 0)
  const vh = v.videoHeight || (tier.legacy ? 720 : 0)
  if (!vw || !vh) return { upload: false, reason: 'nodims', gap, throttleMs: thr, capW: tier.capW, capH: tier.capH }
  const needsScale = (v.videoWidth > tier.capW || v.videoHeight > tier.capH)
  if (!needsScale) return { upload: true, reason: 'ok', direct: true, tw: vw, th: vh, srcW: v.videoWidth || 0, srcH: v.videoHeight || 0, capW: tier.capW, capH: tier.capH, throttleMs: thr, gap }
  const tw = Math.min(tier.capW, vw)
  const th = Math.round(tw * (vh / vw))
  return { upload: true, reason: 'ok', direct: false, tw, th, srcW: v.videoWidth || 0, srcH: v.videoHeight || 0, capW: tier.capW, capH: tier.capH, throttleMs: thr, gap }
}

/** `?vthrottle=`：裸数字 = 目标 fps；带 `ms` 后缀 = 毫秒；`0`/`off`/`none` = 不节流（每帧）。 */
export function parseVideoThrottle(raw, tier) {
  const t = tier || parseResTier(null)
  const def = { ms: t.throttleMs, fps: t.throttleFps, source: t.legacy ? 'tier-legacy' : 'tier-default' }
  if (raw === null || raw === undefined || String(raw).trim() === '') return def
  const s = String(raw).trim().toLowerCase()
  if (s === '0' || s === 'off' || s === 'none') return { ms: 0, fps: 0, source: 'url-unthrottled' }
  const mms = /^([0-9]+(?:\.[0-9]+)?)ms$/.exec(s)
  if (mms) { const ms = Math.max(0, Number(mms[1])); return { ms, fps: ms > 0 ? +(1000 / ms).toFixed(2) : 0, source: 'url-ms' } }
  const n = Number(s)
  if (isFinite(n) && n > 0) return { ms: 1000 / n, fps: n, source: 'url-fps' }
  return { ms: t.throttleMs, fps: t.throttleFps, source: 'url-invalid:' + s }
}

// `?perf=auto` 的效果链降采样阶梯（0=全质量）
export const PERF_FBO_LADDER = [0, 0.75, 0.5, 0.35]
/**
 * `?perf=auto` 某一档实际生效的 fboCap。
 * 高分辨率档（非 legacy）下**抑制**效果链降采样：用户显式要 ≥1080p 时把效果链 FBO 降到画布
 * 以下就是"自己把刚提上去的分辨率糊回去"。`?fbocap=low`（或 opts.fboAutoLow）恢复旧阶梯做 A/B。
 * 粒子降档（partMul）不受影响。
 */
export function perfLadderFboCap(level, tier, fboAutoLow) {
  const lv = Math.max(0, Math.min(PERF_FBO_LADDER.length - 1, Number(level) || 0))
  if (lv === 0) return 0
  if (!(tier && tier.legacy) && !fboAutoLow) return 0
  return PERF_FBO_LADDER[lv]
}

// =====================================================================================
// ①(P-90 2026-09-16) **质量档位三开关** `?q=` / `?aa=` / `?pp=`（纯函数区，可无 GL 单测）
//
// 上游语义出处（`oneincase/webwallgl` **MIT**，1.3.23；本地副本 `vendor-ref/webwallgl`
// 的 `origin/main`，逐行 `git show origin/main:<path>` 取证）：
//   · `renderer/src/quality.ts:22-26`  `DEFAULT_QUALITY = {antiAliasing:'off', particles:'high',
//     postProcessing:'high'}` —— **AA 默认 off、后处理默认 high**。
//   · `renderer/src/quality.ts:29-33`  `PARTICLE_QUALITY_SCALE = {low:0.4, medium:0.7, high:1}`
//     ⇒ 上游 `?pq=` 的 0.4/0.7/1 **不是分辨率比例、也不是内部渲染尺寸**，而是**粒子数量
//     （maxcount 上限）与发射率**的倍率；消费点 `render/vendor/we-scene/render/particles.js`
//     （`maxcount` 封顶与发射率各乘一次，见 `docs/WEBWALLGL-UPSTREAM-STUDY.md` §5 表）。
//     **我们没有 `?pq=` 粒子档**（本仓库粒子预算走 `PARTICLE_BUDGET`/`?perf=auto`），
//     故 P-90 **不引入 pq**，只把上游这张表的口径写清（避免后人误当"分辨率比例"）。
//   · `renderer/src/quality.ts:37-41`  `POST_FBO_CAP = {low:0.5, medium:1, high:0}` —— 后处理档
//     → `fboCapFactor`（0 = 全质量；>0 时效果链 FBO 上限 = 屏幕占比 × 系数）。
//   · `renderer/src/quality.ts:44-47`  `MSAA_SAMPLES = {msaa2:2, msaa4:4}`。
//   · `renderer/src/quality.ts:70-79`  `qualityFromQuery()` 读 **`aa` / `pq` / `pp`** 三个 key。
//   · `renderer/src/scene-mount.ts:1979-1989` `applyQuality()` + `renderer.setAntiAliasing?.()`
//     / `setEffectsEnabled?.()` / `setFboCapFactor?.()` ⇒ **热更、不重挂载**
//     （`api/types.ts:391-398` 的 `setQuality()` 注释原文：「就地生效，不重挂载」）。
//   · `pp=off` 门控**三处**（`renderer/vendor/we-scene/render/renderer.js`，origin/main）：
//     ① `:2933` 图层效果列表置空（直通）；② `:2429` 整屏后期层（`isPostProcess`）整层跳过；
//     ③ `:2512` 内置 Bloom 关闭。
//   · AA 语义（`api/types.ts:264-282` 注释原文）：`fxaa` = 帧末后处理 pass，**平滑所有边缘
//     （含纹理 alpha 边）**；`msaa2/msaa4` = 多重采样，**只平滑几何边缘**；**单选不叠加**。
//     FXAA 与后处理档**正交**（`pp=off` 时仍生效）。
//   · MSAA 不可用时的上游行为（`renderer.js:455-456 / 471-472`）：**回退 off 并 diag**
//     （`msaa: 驱动不支持 Nx 多重采样，回退 off`）。**我们改回退 FXAA**（见 `resolveAaMode`
//     注释：回退 off = 静默丢掉用户要的抗锯齿；上游 diag 只报不救）。
//
// ---- 与上游的**有意的**差异（逐条给理由，见 PATCHES.md P-90）----
//   1. 上游第三组档位叫 `pq`（**粒子**）；本仓库按任务书用 `?q=` 表达**内部渲染分辨率档位**
//      （上游 1.3.23 **没有**这一档 —— 它的画布尺寸由 `shell.ts` 的 `renderDpr` 管）。
//      理由：本仓库已有 `?res=`（P-68，改**画布**尺寸），缺的正是"画布不变、内部怎么渲"这一档。
//   2. 上游 `?pp=` 只有后处理一种含义；本仓库 `?pp=0` **早已是**"粒子正交相机"开关
//      （RE-37，`/[?&]pp=0/` 正则，见 `PP_DISABLED`）。⇒ 我们**扩展 `pp` 的取值域**而不是
//      另起名字：`pp=0` 仍按旧义（正则不动），只有 `off|low|medium|high` 才进后处理档。
//      **`pp` 在 README 主表里早已登记** ⇒ diag-flag-check 的**名字总数不变**（114 → 116，不是 117）。
//
// ---- 默认值论证（任务书要求「优先与现状逐位相同」）----
//   `q` 默认 **`off`**、`aa` 默认 **`off`**、`pp` 默认 **`high`**：
//   · `q=off` ⇒ 内部渲染比例 0 = **不启用离屏内部渲染路径**（不建 FBO、不加上采样 → 与改动前
//     **逐位相同**）；`low/medium/high` 才启用。任务书原文即「默认 off/现有行为」。
//   · `aa=off` ⇒ 不建 FXAA 程序、不加上采样 pass、context `antialias:false`（**与改动前同一份
//     `getContext` 实参**）⇒ 逐位相同。同时这也是**上游默认**（`quality.ts:23`）。
//   · `pp=high` ⇒ `fboCapFactor = 0` = 全质量、效果链/Bloom 全开 ⇒ 逐位相同。这也是**上游默认**
//     （`quality.ts:25` `postProcessing:'high'`）。
//   ⇒ 三个默认值**同时**满足"与现状逐位相同"与"按上游默认"。`?aa=off&q=high&pp=off` 里
//     `q=high` 与 `pp=off` 是**显式非默认**档，本就不承诺逐位；承诺逐位的是**三键全默认/全 off-系**。
// =====================================================================================

/** 三组档位的**唯一真值表**（顺序即日志/文档里的展示顺序）。 */
export const QUALITY_TIER_VALUES = {
  q: ['off', 'low', 'medium', 'high'],
  aa: ['off', 'fxaa', 'msaa2', 'msaa4'],
  pp: ['off', 'low', 'medium', 'high'],
}

/** 默认档（理由见上方「默认值论证」）。 */
export const DEFAULT_QUALITY_TIERS = { q: 'off', aa: 'off', pp: 'high' }

/**
 * `q` 档 → **内部渲染分辨率比例**。`off` = **关闭内部渲染路径**（0 是哨兵，不是比例 0）。
 * `low/medium/high` = 0.5 / 0.75 / 1.0（内部离屏 FBO 边长 = 画布边长 × 比例，帧末上采样回画布）。
 */
export const Q_RENDER_SCALE = { off: 0, low: 0.5, medium: 0.75, high: 1 }

/** `pp` 档 → `fboCapFactor`（照抄上游 `POST_FBO_CAP`；`off` 由调用方走效果链门控，此处返 0）。 */
export const PP_FBO_CAP = { off: 0, low: 0.5, medium: 1, high: 0 }

/** `aa` 档 → 多重采样数（照抄上游 `MSAA_SAMPLES`；非 msaa 档返 0）。 */
export const AA_MSAA_SAMPLES = { off: 0, fxaa: 0, msaa2: 2, msaa4: 4 }

/**
 * 单档规范化：**大小写不敏感**、去首尾空白；`null`/`undefined`/`''` = **未指定**（回落默认、
 * **不记 invalid** —— `?q=` 空值等价于没写，这是"空值"与"非法值"的分界）；
 * 其余未知值 = **非法**（回落默认并**显式标记** `invalid`，日志里看得见，不静默）。
 */
export function normalizeQualityTier(kind, raw) {
  const dflt = DEFAULT_QUALITY_TIERS[kind]
  const allowed = QUALITY_TIER_VALUES[kind]
  if (!allowed) throw new Error('未知质量档位种类: ' + String(kind))
  const given = raw !== null && raw !== undefined
  const s = given ? String(raw).trim().toLowerCase() : ''
  if (!given || s === '') return { value: dflt, defaulted: true, invalid: null, requested: null }
  if (allowed.indexOf(s) >= 0) return { value: s, defaulted: false, invalid: null, requested: s }
  return { value: dflt, defaulted: true, invalid: String(raw), requested: s }
}

/**
 * 从 query 三段解析（`get` 是 `(key)=>string|null`，生产上是
 * `new URLSearchParams(location.search).get.bind(...)`）。**只认显式出现的键**；没带的键
 * 回落默认。`pp=0` 是**既有**的"粒子正交相机"旧义（RE-37）⇒ 这里**当未指定**处理，
 * 免得把老开关报成"非法后处理档"。
 */
export function parseQualityTiers(get) {
  const out = { q: DEFAULT_QUALITY_TIERS.q, aa: DEFAULT_QUALITY_TIERS.aa, pp: DEFAULT_QUALITY_TIERS.pp, invalid: {} }
  const g = typeof get === 'function' ? get : () => null
  const rq = normalizeQualityTier('q', g('q')); out.q = rq.value; if (rq.invalid) out.invalid.q = rq.invalid
  const ra = normalizeQualityTier('aa', g('aa')); out.aa = ra.value; if (ra.invalid) out.invalid.aa = ra.invalid
  const rawPp = g('pp')
  if (String(rawPp === null || rawPp === undefined ? '' : rawPp).trim() === '0') {
    out.ppLegacyParticleOrtho = true            // 旧义：粒子正交相机，不进后处理档
  } else {
    const rp = normalizeQualityTier('pp', rawPp); out.pp = rp.value; if (rp.invalid) out.invalid.pp = rp.invalid
  }
  return out
}

/** `q` → 内部渲染比例（0 = 关闭内部离屏路径）。 */
export function qRenderScale(q) {
  const s = Q_RENDER_SCALE[q]
  return typeof s === 'number' ? s : 0
}

/**
 * `q` → 内部渲染尺寸 `[w,h]`（**偶数对齐**，与 `parseResTier` 的显式 WxH 同口径）。
 * `q=off` ⇒ **原样返回**（调用方据此判断"不建离屏 FBO"）。
 */
export function qInternalSize(width, height, q) {
  const s = qRenderScale(q)
  if (!(s > 0)) return [width, height]
  const w = Math.max(2, Math.round(width * s / 2) * 2)
  const h = Math.max(2, Math.round(height * s / 2) * 2)
  return [w, h]
}

/** `pp` → `fboCapFactor`（`off` 返 0：off 的实际门控是"效果链直通 + 关 Bloom"，不是压分辨率）。 */
export function ppFboCap(pp) {
  const v = PP_FBO_CAP[pp]
  return typeof v === 'number' ? v : 0
}

/**
 * AA 档解析（**带回退**，纯函数，无 GL 可单测）。
 *   · `off`            → `{mode:'off'}`（与改动前逐位相同）
 *   · `fxaa`           → `{mode:'fxaa'}`
 *   · `msaa2`/`msaa4`  → 原生多重采样**可行**时 `mode=该档`（`native:true`）；
 *                        **不可行时一律回落 `fxaa`**并返回 `reason`（调用方必须写日志 —— 不许静默）：
 *      - `internal-render`：`q != off` ⇒ 场景画进**单采样**离屏 FBO，默认帧缓冲的 MSAA
 *        完全用不上（多重采样只在默认帧缓冲/多重采样 RT 上成立）⇒ 必须回落。
 *      - `ctx-samples-<n>`：`gl.getParameter(gl.SAMPLES)` 实测采样数 `< 请求档`
 *        （驱动/浏览器没给到，`antialias:true` 只是**请求**不是保证）⇒ 回落。
 *   上游此处是"回退 **off**"（`renderer.js:455-456`）；我们改成回退 **fxaa**：用户显式点了
 *   `msaa` = 明确要抗锯齿，回退 off 等于**静默丢掉**该诉求，而 FXAA 是同一诉求的另一条可行路径。
 */
export function resolveAaMode(requested, ctxSamples, internalRender) {
  const req = QUALITY_TIER_VALUES.aa.indexOf(requested) >= 0 ? requested : DEFAULT_QUALITY_TIERS.aa
  if (req === 'off') return { requested: req, mode: 'off', native: false, samples: 0, fallback: false, reason: null }
  if (req === 'fxaa') return { requested: req, mode: 'fxaa', native: false, samples: 0, fallback: false, reason: null }
  const need = AA_MSAA_SAMPLES[req]
  if (internalRender) return { requested: req, mode: 'fxaa', native: false, samples: 0, fallback: true, reason: 'internal-render' }
  const got = Math.max(0, Number(ctxSamples) || 0)
  if (got >= need) return { requested: req, mode: req, native: true, samples: got, fallback: false, reason: null }
  return { requested: req, mode: 'fxaa', native: false, samples: got, fallback: true, reason: 'ctx-samples-' + got }
}

/** 诊断/上报用的一句话（`?q/?aa/?pp` 三档 + AA 实际落点）。 */
export function describeQualityTiers(t) {
  const q = t && t.q ? t.q : DEFAULT_QUALITY_TIERS.q
  const aa = t && t.aa ? t.aa : DEFAULT_QUALITY_TIERS.aa
  const pp = t && t.pp ? t.pp : DEFAULT_QUALITY_TIERS.pp
  const s = qRenderScale(q)
  return 'q=' + q + (s > 0 ? '(内部×' + s + ')' : '(关闭内部缩比)') + ' aa=' + aa + ' pp=' + pp
}

// ①(P-149 上游 overbright) 粒子材质常量 `ui_editor_properties_overbright` 的**取值契约**（唯一实现处）。
//
// 语义（上游 MIT `oneincase/webwallgl` `19c5fab:renderer/vendor/we-scene/render/particles.js:590-593`，
// 消费点同文件 `:1300`）：材质 `passes[].constantshadervalues.ui_editor_properties_overbright` 是
// **乘在精灵实例 RGB 上的亮度系数（不动 alpha）**，编辑器滑条缺省 **1**；上游自报影响面
// "全库 68 壁纸 / 159 材质带该键（0.17–10）此前全被静默丢弃"（`3151551777` 的 Bokeh 光斑材质写 0.25
// ⇒ 旧实现亮 4 倍、additive 大光斑糊屏）。
//
// ⚠ **键缺失必须显式落缺省 1**：`Number(null) === 0`、`Number(undefined) === NaN`，
//   若直接 `Number(raw)` 就把"没写这个键"当成 0（整层全黑）。所以判定式是
//   `raw == null || !Number.isFinite(n)` ⇒ 1（同时吃掉 `"abc"`/`NaN` 这类脏值）。
// ⚠ 只做**下界** `Math.max(0, n)`、**不设上界**：上界会把 `overbright=5`（语料 `reactive Stars`/
//   `Glass Shards`）钳回 1，等于没修；`0` 是合法值（整层不亮）。
//
// 宿主（`demo.html` 粒子材质段）与渲染端（`createRenderer` 的实例色装配）都调这一个函数，
// 口径只有一份；纯函数、无副作用，Node 侧可直测（门禁 `particle-overbright` [1]）。
export function particleOverbrightFactor(pass) {
  const cv = pass && pass.constantshadervalues
  const raw = cv ? cv.ui_editor_properties_overbright : undefined
  const n = Number(raw)
  return (raw == null || !Number.isFinite(n)) ? 1 : Math.max(0, n)
}

export function createRenderer(canvas, opts = {}) {
  // ①(P-90) 质量档位：解析优先级 = `opts.qualityTiers`（测试/宿主显式传）> `?q=`/`?aa=`/`?pp=` > 默认。
  //   解析必须在 `getContext` **之前**：`antialias` 是 **context 创建属性**，`msaa2/msaa4` 档
  //   要求 `antialias:true`，而 context 属性**创建后不可变**（详见下方 aaLive 注释）。
  const __qQ = (() => { try { return (typeof location !== 'undefined' && location.search) ? new URLSearchParams(location.search).get('q') : null } catch (e) { return null } })()
  const __aaQ = (() => { try { return (typeof location !== 'undefined' && location.search) ? new URLSearchParams(location.search).get('aa') : null } catch (e) { return null } })()
  const __ppQ = (() => { try { return (typeof location !== 'undefined' && location.search) ? new URLSearchParams(location.search).get('pp') : null } catch (e) { return null } })()
  const TIERS = (opts.qualityTiers && typeof opts.qualityTiers === 'object')
    ? {
        q: normalizeQualityTier('q', opts.qualityTiers.q).value,
        aa: normalizeQualityTier('aa', opts.qualityTiers.aa).value,
        pp: normalizeQualityTier('pp', opts.qualityTiers.pp).value,
        invalid: {},
        ppLegacyParticleOrtho: false,
      }
    : parseQualityTiers((k) => (k === 'q' ? __qQ : k === 'aa' ? __aaQ : k === 'pp' ? __ppQ : null))
  // msaa 档才请求 `antialias:true`；off/fxaa 档**与改动前逐字相同的实参**（`antialias:false`）
  // ⇒ 默认路径的 context 创建逐位不变（`?aa=off` 与不加开关同一份实参）。
  const AA_WANT_NATIVE = AA_MSAA_SAMPLES[TIERS.aa] > 0
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: AA_WANT_NATIVE, alpha: false, preserveDrawingBuffer: true })
  if (!gl) throw new Error('当前浏览器不支持 WebGL2')
  // 实测采样数（`antialias:true` 只是**请求**；驱动可静默给 0）。
  let aaCtxSamples = 0
  try { aaCtxSamples = Math.max(0, Number(gl.getParameter(gl.SAMPLES)) || 0) } catch (e) { aaCtxSamples = 0 }
  // 当前生效档位（`setQuality` 热更会就地改这里）。
  const quality = { q: TIERS.q, aa: TIERS.aa, pp: TIERS.pp }
  let qfbo = null            // q!=off 时的内部离屏渲染目标（null = 直接画默认帧缓冲，逐位=改动前）
  let qInternal = [0, 0]     // 内部渲染尺寸（q=off 时等于画布尺寸）
  // ①(P-90) 本帧"场景该画到哪"。`null` = 默认帧缓冲 = **改动前行为**（逐位）；
  //   `q != off` 时 renderScene 开头把它设成内部 FBO，帧末上采样后清回 null。
  //   所有原本 `bindFramebuffer(gl.FRAMEBUFFER, null)` / `READ_FRAMEBUFFER = null` 的
  //   "屏幕"位置一律改走这个出口 ⇒ 默认路径取到 null 时与改动前**同一次 GL 调用**。
  let frameTarget = null
  function sceneTargetFbo() { return frameTarget ? frameTarget.fbo : null }
  let qFallbackLogged = false
  let qPresentRuns = 0
  // ①(P-90) **热更能力矩阵（诚实版）**：
  //   · `pp`  → **热更**（只改门控 + fboCapFactor，零重建）
  //   · `q`   → **热更**（FBO 池按 `tag|WxH` 缓存，换档只是下一次 `getFBO` 拿新尺寸）
  //   · `aa`  → `off`↔`fxaa` **热更**；**`msaa2`/`msaa4` 需刷新页面** —— `antialias` 是
  //     context 创建属性，WebGL 规范里没有运行期改采样数的 API（`gl.getContextAttributes()`
  //     只读）。运行期切到 msaa 档时**不静默**：写日志说明"需刷新"，本帧按已解析的落点走。
  //   · 上游 1.3.23 把 MSAA 做在**离屏多重采样 FBO/RBO**（`renderer.js:438-477`）上，所以它能
  //     热切；我们走的是**默认帧缓冲的原生 antialias**（`preserveDrawingBuffer:true` 下由浏览器
  //     自动 resolve）⇒ 换来"零额外 FBO/零 resolve blit"（不重复上游 WebKit blit 那个坑，
  //     `renderer.js:485-492` 注释所述），代价就是 msaa 档要刷新。**这是有意的取舍**。
  let aaLive = resolveAaMode(quality.aa, aaCtxSamples, qRenderScale(quality.q) > 0)
  let aaLogged = false
  function logTiers() {
    if (aaLogged) return
    aaLogged = true
    try {
      const parts = [describeQualityTiers(quality)]
      parts.push('aa实际落点=' + aaLive.mode + (aaLive.native ? '(原生 ' + aaLive.samples + 'x MSAA)' : (aaLive.fallback ? '(回落 FXAA: ' + aaLive.reason + ')' : '')))
      if (TIERS.invalid && TIERS.invalid.q) parts.push('?q=' + TIERS.invalid.q + ' 非法→off')
      if (TIERS.invalid && TIERS.invalid.aa) parts.push('?aa=' + TIERS.invalid.aa + ' 非法→off')
      if (TIERS.invalid && TIERS.invalid.pp) parts.push('?pp=' + TIERS.invalid.pp + ' 非法→high')
      if (TIERS.ppLegacyParticleOrtho) parts.push('pp=0 走既有粒子正交相机旧义(RE-37)')
      parts.push('context antialias=' + (AA_WANT_NATIVE ? 'true' : 'false') + '，实测 SAMPLES=' + aaCtxSamples)
      onLog('[P-90] 质量档位 ' + parts.join('，'))
    } catch (e) { /* 日志失败不影响渲染 */ }
  }
  const shaderResolver = opts.shaderResolver || (async () => null)
  // FBO 分辨率限幅系数：0 = 关闭（全质量）；>0 时效果链 FBO 上限 = 屏幕占比 × 系数
  let fboCapFactor = opts.fboCapFactor === undefined ? ppFboCap(quality.pp) : opts.fboCapFactor
  let MAX_TEX_SIZE_CACHE = 0

  // ①(MERGED-2 B 2026-09-12) ?perf=1 / ?perf=auto 性能计时与自适应降级（**默认关**）。
  //   关闭时（mode=''）所有路径被 if (perfState.enabled) 短路：零额外 GL 调用、零状态写入，
  //   与无 perf 开关逐位一致（render-audit / mock-gl-test 走的即关闭路径）。
  //   开启时：优先 EXT_disjoint_timer_query_webgl2 GPU 计时（不可用→performance.now() 包住 render 主体），
  //   帧末经 runPostFrameHooks 的 stats 槽把 { frameMs, gpuMs, draws, layerMs, … } 交给页面（EXTENSION-HOOKS.md）。
  //   ?perf=auto 另开自适应降级：① 粒子层 maxcount 按 p95 帧时间降 1/2→1/4（不停发，ctx.maxCount 封顶）；
  //   ② 复用 setFboCapFactor 阶梯 0→0.75→0.5→0.35；每档写 onLog 并报"降级前/后帧时间"。
  const PERF_MODE = (opts.perf !== undefined && opts.perf !== null)
    ? (opts.perf === 1 || opts.perf === true || opts.perf === '1' ? '1' : (opts.perf === 'auto' ? 'auto' : ''))
    : (() => { try {
        if (typeof location === 'undefined' || !location.search) return ''
        const m = new URLSearchParams(location.search).get('perf')
        return (m === '1' || m === 'auto') ? m : ''
      } catch { return '' } })()
  const perfState = {
    mode: PERF_MODE, enabled: PERF_MODE !== '', auto: PERF_MODE === 'auto',
    gpuExt: null, pendingQuery: null, lastGpuMs: null, gpuOk: false,
    qring: [], qidx: 0,
    frames: [],            // 最近 120 帧 { ms, gpuMs, draws }
    layerRoll: new Map(),  // 层名 → { sum, n }（滚动累计，stats.layerMs 输出增量）
    draws: 0,
    autoLevel: 0,          // 0=原始，1=粒子×1/2+fboCap0.75，2=粒子×1/4+fboCap0.5，3=粒子×1/4+fboCap0.35
    autoLog: [],           // 降级事件（before/after p95）
    texBytesEst: 0,
  }
  if (perfState.enabled) {
    try {
      perfState.gpuExt = gl.getExtension('EXT_disjoint_timer_query_webgl2')
      if (perfState.gpuExt) perfState.qring = [0, 1, 2, 3].map(() => { try { return gl.createQuery() } catch { return null } })
    } catch (e) { perfState.gpuExt = null }
    try {
      // draw call 计数：只在 perf 开启时包一层（mock/关闭路径不经过这里）
      const rawDA = gl.drawArrays.bind(gl), rawDE = gl.drawElements.bind(gl)
      gl.drawArrays = (...a) => { perfState.draws++; return rawDA(...a) }
      gl.drawElements = (...a) => { perfState.draws++; return rawDE(...a) }
    } catch (e) { /* 只读环境（mock）允许无计数 */ }
  }
  // ①(P-68) 分辨率档位 / 视频上传参数 / 视频诊断台账。
  //   解析优先级：opts（测试与外部接线）> `?res=` / `?vthrottle=` / `?fbocap=` > 默认。
  //   与 demo.html 是**同一次解析的两个调用点**（demo 用同一函数取画布尺寸）⇒ 不会打架。
  const __resQ = (() => { try { return (typeof location !== 'undefined' && location.search) ? new URLSearchParams(location.search).get('res') : null } catch (e) { return null } })()
  const RES_TIER = (opts.resTier && typeof opts.resTier === 'object') ? opts.resTier : parseResTier(opts.res !== undefined ? opts.res : __resQ)
  const __vthrQ = (() => { try { return (typeof location !== 'undefined' && location.search) ? new URLSearchParams(location.search).get('vthrottle') : null } catch (e) { return null } })()
  const VTHROTTLE = parseVideoThrottle(opts.vthrottle !== undefined ? opts.vthrottle : __vthrQ, RES_TIER)
  const __fboQ = (() => { try { return (typeof location !== 'undefined' && location.search) ? new URLSearchParams(location.search).get('fbocap') : null } catch (e) { return null } })()
  const FBO_AUTO_LOW = (opts.fboAutoLow !== undefined) ? !!opts.fboAutoLow : (String(__fboQ || '').toLowerCase() === 'low')
  const videoStat = {
    res: RES_TIER.requested, tier: RES_TIER.name, legacy: RES_TIER.legacy ? 1 : 0,
    canvas: RES_TIER.width + 'x' + RES_TIER.height, cap: RES_TIER.capW + 'x' + RES_TIER.capH,
    throttleMs: +VTHROTTLE.ms.toFixed(2), throttleFps: VTHROTTLE.fps, throttleSrc: VTHROTTLE.source,
    smoothing: RES_TIER.smoothing, mip: 0, fboAutoLow: FBO_AUTO_LOW ? 1 : 0,
    src: null, up: null, direct: 0, bytesPerFrame: 0, MBps: 0,
    uploads: 0, upFps: 0, frames: 0, skipThrottle: 0, skipNotReady: 0,
    viaCanvas: 0, err: 0, firstAt: null, lastAt: null,
    perfMode: perfState.mode || '', perfLevel: 0, perfFboCap: fboCapFactor, perfSuppressed: 0,
    play: { seen: 0, play: 0, pause: 0, seek: 0, rate: 0, src: null },
    tex: [],
  }
  const videoTexStatByKey = new Map()
  const __upWin = []   // 上传时间戳滑动窗（最近 1s → 实测上传 fps）
  // 每个视频纹理一条台账（texStats 侧只记"源尺寸"，这里补"实际上传尺寸 + 档位"）
  const videoTexStatOf = (key, name) => {
    let e = videoTexStatByKey.get(key)
    if (!e) { e = { n: String(name || key).slice(0, 24), src: null, up: null, tier: RES_TIER.name, cap: RES_TIER.capW + 'x' + RES_TIER.capH, direct: 0, uploads: 0, upFps: 0, viaCanvas: 0 }; videoTexStatByKey.set(key, e); videoStat.tex.push(e) }
    return e
  }
  const videoUploadTick = (now) => {
    videoStat.uploads++
    videoStat.lastAt = +Number(now).toFixed(1)
    if (videoStat.firstAt === null) videoStat.firstAt = videoStat.lastAt
    __upWin.push(now)
    while (__upWin.length && now - __upWin[0] > 1000) __upWin.shift()
    videoStat.upFps = __upWin.length >= 2 ? +((( __upWin.length - 1) * 1000) / (now - __upWin[0])).toFixed(1) : 0
  }
  // ①(P-68) 脚本侧视频控制读取点。`elysia/scene-scripts.js:50-58 videoTexRefShared()` 的
  //   play()/pause()/stop() 只往对象上写 `__videoPlay` 布尔，**改动前全仓无读取点** ⇒ 场景里的
  //   播放/暂停按钮是空操作（3326873240 / 3470764447 真的调用 `getVideoTexture().play()|pause()`，
  //   已实测）。这里补上读取点；`__videoSeek` / `__videoRate` 是给脚本侧 setCurrentTime()/rate
  //   预留的同名接口（见 PATCHES P-68 §未定项）。
  //   注意：脚本写的是 **raw scene.json 对象**（thisScene.getLayer(name) → sceneObj.objects 里的
  //   那一项），而渲染循环用的是 parseScene 产出的 layer（不同实例）⇒ 按 id/name 找回 raw 对象。
  const videoFlagSrc = (layer) => {
    if (layer.__videoPlay !== undefined || layer.__videoSeek !== undefined || layer.__videoRate !== undefined) return layer
    if (layer.__videoFlagSrc) return layer.__videoFlagSrc
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    if (layer.__videoFlagAt && now - layer.__videoFlagAt < 2000) return null   // 2s 内不重复线性查找
    layer.__videoFlagAt = now
    let raw = null
    try {
      const list = Array.isArray(opts.scriptRawObjects) ? opts.scriptRawObjects
        : ((typeof window !== 'undefined' && Array.isArray(window.__mpwRawObjects)) ? window.__mpwRawObjects : null)
      if (list && layer && layer.id !== undefined) raw = list.find((o) => o && o.id === layer.id) || null
      if (!raw && list && layer && layer.name) raw = list.find((o) => o && String(o.name) === String(layer.name)) || null
    } catch (e) { raw = null }
    if (raw) layer.__videoFlagSrc = raw
    return raw
  }
  const applyVideoScriptControl = (layer, v) => {
    const srcObj = videoFlagSrc(layer)
    if (!srcObj) return
    const want = srcObj.__videoPlay
    if (want !== undefined) {
      videoStat.play.seen++
      videoStat.play.src = String(layer.name || layer.id || '')
      try {
        if (want === true && v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); videoStat.play.play++ }
        else if (want === false && !v.paused) { v.pause(); videoStat.play.pause++ }
      } catch (e) {}
    }
    const seek = srcObj.__videoSeek
    if (seek !== undefined && seek !== null) {
      try { v.currentTime = Number(seek) || 0; videoStat.play.seek++ } catch (e) {}
      try { delete srcObj.__videoSeek } catch (e) {}
    }
    const rate = Number(srcObj.__videoRate)
    if (srcObj.__videoRate !== undefined && isFinite(rate) && rate > 0 && v.playbackRate !== rate) {
      try { v.playbackRate = rate; videoStat.play.rate++ } catch (e) {}
    }
  }
  // texStats（demo.html 侧 push，只有源尺寸 d=声明尺寸）补上"实际上传尺寸/档位/直传/中转"。
  // 只匹配 kind==='video' 的条目，且按 textureName 优先、层名兜底（demo 里 n = 纹理名.slice(0,14)）。
  const syncVideoTexStat = (layer, e) => {
    try {
      const arr = (typeof window !== 'undefined' && window.__mpwTexStats) ? window.__mpwTexStats : null
      if (!arr || !arr.length) return
      const short = (s) => String(s == null ? '' : s).slice(0, 14)
      let ent = arr.find((x) => x && x.kind === 'video' && x.n === short(layer.textureName))
      if (!ent && layer.name) ent = arr.find((x) => x && x.kind === 'video' && x.n === short(layer.name))
      if (!ent) return
      ent.src = e.src; ent.up = e.up; ent.tier = e.tier; ent.cap = e.cap
      ent.direct = e.direct; ent.upFps = e.upFps; ent.viaCanvas = e.viaCanvas
    } catch (err) {}
  }
  let __vstatLogAt = 0
  const maybeLogVideoStats = (now) => {
    if (now - __vstatLogAt < 5000) return
    __vstatLogAt = now
    try { onLog('[we-scene][P-68] videoStats ' + JSON.stringify(videoStat)) } catch (e) {}
  }
  if (RES_TIER.requested !== null || RES_TIER.invalid) {
    // 注意：`onLog` 在本函数稍后才声明（TDZ）→ 启动期这条日志直接用 opts.onLog
    try { (opts.onLog || (() => {}))('[we-scene][P-68] 视频分辨率档位 ?res=' + (RES_TIER.invalid ? RES_TIER.invalid + '(非法→回退)' : RES_TIER.requested) + ' → ' + RES_TIER.name + ' 画布 ' + RES_TIER.width + 'x' + RES_TIER.height + '，视频上传上限 ' + RES_TIER.capW + 'x' + RES_TIER.capH + '，节流 ' + videoStat.throttleMs + 'ms(' + VTHROTTLE.source + ')，smoothing=' + RES_TIER.smoothing + (RES_TIER.legacy ? ' [legacy 逐位兼容]' : '')) } catch (e) {}
  }
  const PERF_P95_LIMIT = 25 // ms，auto 档位升级阈值（约 40fps）

  // ①(P-59 2026-09-14 用户第 1/2/5/6 项回归) **粒子预算**：粒子默认开之后，语料里出现
  //   `maxcount:10000` 的雨层（真机模拟存活 9609 粒 / 65418 顶点/帧）与 16 层粒子叠加，
  //   每一粒又是实心白 quad（形状 bug）→ 用户实测"直接两帧"。
  //   三档硬上限（都不停发，只封顶本帧**绘制/模拟**的粒子数）：
  //     perLayer 单层本帧粒子上限；total 整帧全部粒子层共享的总上限（按剩余层数均分，用不完的
  //     份额顺延给后面的层，避免"前几层吃光预算、后面整层消失"）；layers 本帧最多画几个粒子层。
  //   档位：默认 normal；`?lowmem=1`（插件对低内存设备自动透传，见 PLUGIN-BUGS-TRACKER B5）→ low 激进档；
  //   `?pmax=<n>` 单参数覆盖 perLayer（真机现场调参用，不动档位）。`?noparticles` / `?np` 仍是总开关。
  //   steps：单帧"从 0 重放历史"的步数上限（simulateParticleSystem 原为固定 0.05s 步长、guard 2000 步
  //     = 每帧 2000 次全粒子更新，10s 内与旧行为逐位一致；超过后自动放粗步长而不是像旧 guard 那样
  //     静默冻结在 100s 状态）。
  //   rate：单层**发射率**上限（粒子/秒，多发射器求和）。官方预设 rate 中位 10，但 15/233 个定义 >240、
  //     最大 5000（magic_vortex_orb，maxcount 15000）——`toEmit=floor(dt·rate)` 单步就能生成上千粒，
  //     只封顶存活数（maxcount）挡不住这个瞬时成本，所以对总和超上限的层按比例降 rate（只降不升）。
  const PARTICLE_BUDGET = (() => {
    const TIERS = {
      normal: { perLayer: 240, total: 1200, layers: 16, steps: 400, rate: 240 },
      low: { perLayer: 80, total: 320, layers: 6, steps: 200, rate: 80 },
    }
    if (opts.particleBudget) return Object.assign({ tier: 'opts' }, opts.particleBudget)
    let low = false, pmax = 0
    try {
      if (typeof location !== 'undefined' && location.search) {
        const q = new URLSearchParams(location.search)
        low = q.has('lowmem') && q.get('lowmem') !== '0'
        pmax = parseInt(q.get('pmax') || '', 10)
      }
    } catch (e) { /* 无 location（node 测试）→ 默认档 */ }
    const t = Object.assign({}, low ? TIERS.low : TIERS.normal)
    if (pmax > 0) t.perLayer = pmax
    t.tier = low ? 'lowmem' : 'default'
    return t
  })()
  // ①(P-65 2026-09-15 用户第 8/9/10 项) trail 几何档位：
  //   on（默认）= spritetrail 沿速度拉伸、rope/ropetrail 连成 ribbon（官方几何）
  //   quad       = P-59 旧行为（普通贴图 quad 近似；长条贴图会画成竖线，仅 A/B 对照）
  //   off        = 这些层整层不画（"宁可没有，也不要画成竖线"的兜底）
  const TRAIL_MODE = (() => {
    let v = 'on'
    try {
      if (typeof location !== 'undefined' && location.search) {
        const q = new URLSearchParams(location.search)
        const s = q.get('trail')
        if (s === 'quad' || s === 'off') v = s
      }
    } catch (e) { /* 无 location（node 测试）→ 默认 on */ }
    return v
  })()
  // ①(P-74 ②) 粒子 quad 尺寸口径：
  //   official（默认）= 边长 p.size/2 —— 行为对照：第三方参考实现 wer-ref WPParticleRawGener.cpp:85
  //     在**写顶点属性之前**先把 size 减半，减半后的值即 `genericparticle.vert:55` 的 `in_ParticleSize`
  //     （= `common_particles.h:52-56 ComputeParticlePosition` 的 `positionAndSize.w`）；
  //     `common_particles.h:52-56` 以 `w·right·(uvs.x−0.5)` 展开，而顶点 uvs ∈ {0,1}
  //     （WPParticleRawGener.cpp:91-96 的四角表）⇒ **quad 边长 = w = p.size/2**（spritetrail 同式）。
  //   legacy = P-65 旧口径（跨度 = p.size，即官方的 2×，`?psize=legacy` 回退 A/B）。
  const PSIZE_MODE = (() => {
    let v = 'official'
    try {
      if (typeof location !== 'undefined' && location.search) {
        const s = new URLSearchParams(location.search).get('psize')
        if (s === 'legacy') v = 'legacy'
      }
    } catch (e) { /* 无 location（node 测试）→ 默认 official */ }
    return v
  })()
  // ①(P-74 ①) instanceoverride 档位：on（默认）= 按官方语义吃 size/count/alpha/rate/speed/lifetime/color(n)；
  //   off = 回到 P-73 及之前（**一个字段都不读**，41/49 粒子层全部按资产原值），供 A/B 与门禁对拍。
  const IO_MODE = (() => {
    let v = 'on'
    try {
      if (typeof location !== 'undefined' && location.search) {
        if (new URLSearchParams(location.search).get('io') === 'off') v = 'off'
      }
    } catch (e) { /* 无 location（node 测试）→ 默认 on */ }
    return v
  })()
  // ①(P-74 ④) 效果链 FBO 尺寸档位：fix（默认）= 按设备 MAX_TEXTURE_SIZE 正确封顶 + 退化链短路；
  //   `?maxtex=0` = 回到 P-73 的哨兵判定（`MAX_TEX_SIZE_CACHE` 初值 0 ⇒ maxT 恒 0 ⇒ 每层 FBO 0×0）
  //   且**关掉**退化短路 —— 仅用于 ④ 的改前/改后 A/B 与门禁对拍。
  const MAXTEX_FIX = (() => {
    try {
      if (typeof location !== 'undefined' && location.search) {
        return new URLSearchParams(location.search).get('maxtex') !== '0'
      }
    } catch (e) { /* 无 location → 默认修复档 */ }
    return true
  })()
  // ①(P-74 ③) `velocityrandom` 的 y 口径：official（默认）= 与 gravity 同口径翻一次（lwe-ref:775）；
  //   `?vy=legacy` = P-73 原样（不翻）—— 用于"雨往上跑"的改前/改后 A/B。
  const VY_MODE = (() => {
    try {
      if (typeof location !== 'undefined' && location.search) {
        return new URLSearchParams(location.search).get('vy') === 'legacy' ? 'legacy' : 'official'
      }
    } catch (e) { /* 无 location → 默认 official */ }
    return 'official'
  })()
  // ①(P-103② 用户第 12 项) 粒子**自转**档位：
  //   official（默认）= 把 `rotationrandom` / `angularvelocityrandom` + `angularmovement` 逐帧算出来的
  //     `p.rot` 真正施加到 quad 的两条局部轴上（z 轴 roll）。官方依据：
  //     `common_particles.h:20-38 ComputeParticleTangents（切线基）` 取
  //     `right = mul(vec3(1,0,0), mRotation)`、`up = mul(vec3(0,1,0), mRotation)`，而
  //     `genericparticle.vert:83`（非 GS 分支、非 TRAILRENDERER）就是 `ComputeParticleTangents(in_ParticleRotation, …)`
  //     —— 即**普通 sprite renderer 的 quad 也吃旋转**。开源对照：MIT 的 webwallgl
  //     `renderer/vendor/we-scene/render/particles.js:1356/1420` 把 `p.rot` 作为实例属性交给 shader
  //     （该文件头 :9 自述"点精灵无法旋转，但 54/149 个系统用 rotationrandom、15 个用 angularvelocityrandom"）。
  //   `?prot=legacy` = P-100 及之前：`p.rot` 逐帧算但从不进顶点 ⇒ 14/40 个测试包粒子层里
  //     花瓣/玻璃碎片/hex 光斑全部轴对齐（"僵死的贴片"）。
  const PROT_MODE = (() => {
    try {
      if (typeof location !== 'undefined' && location.search) {
        return new URLSearchParams(location.search).get('prot') === 'legacy' ? 'legacy' : 'official'
      }
    } catch (e) { /* 无 location（node 测试）→ 默认 official */ }
    return 'official'
  })()
  // ①(P-103① 用户第 12 项) 粒子 quad 的**图层变换**档位（局部偏移 → 世界偏移）：
  //   official（默认）= 局部偏移先按图层 `scale` 逐轴缩放、再按图层 z 角旋转 —— 官方
  //     `genericparticle.vert:86-87`（`ComputeParticlePosition` 之后即乘 `g_ModelViewProjectionMatrix`）里
  //     模型矩阵 = 图层 T·R·S，`ComputeParticlePosition` 算出的 size 偏移同样被它缩放；
  //     开源对照（MIT）webwallgl `particles.js:1298-1330 toWorld()`：`px = lx*sx; py = ly*sy` 再按 angleZ 旋转，
  //     且 `data[k++] = Math.abs(p.size) * sysScale`（尺寸同样吃图层 scale）。
  //   `?pquad=legacy` = P-100 及之前：发射器偏移已经乘过 scale（位置铺开对），但**每颗粒子自己的
  //     尺寸/朝向不吃图层 transform** ⇒ 30/40 个测试包粒子层有 scale≠1 或 z 角≠0，尺寸偏差最大 7.06×（萤火虫）。
  //   注：本轮只接 **sprite renderer**（30/40 层）；trail 三兄弟的图层变换见 PATCHES 未定项。
  const PQUAD_MODE = (() => {
    try {
      if (typeof location !== 'undefined' && location.search) {
        return new URLSearchParams(location.search).get('pquad') === 'legacy' ? 'legacy' : 'official'
      }
    } catch (e) { /* 无 location → 默认 official */ }
    return 'official'
  })()
  // ①(P-103③ 用户第 12 项) 随机 initializer 的 **exponent 非线性分布**档位：
  //   official（默认）= `值 = min + pow(u, exponent) · (max − min)`（u=rng() 均匀）。
  //   依据：① 官方资产自己写这个字段（`assets/presets/**/particles/**/*.json`：sizerandom 15 处、
  //     lifetimerandom 14 处、alpharandom 10 处带 exponent，取值 1/2/5/10/50；如 emberglow.json 的
  //     `alpharandom min .1 max .2 exponent 2`）；② MIT 的 webwallgl `particle-util.js:15-20 randExp`
  //     `t = pow(random(), exponent)`（用在 life/size）；③ lwe 行为对照：`pow(t, exponent)`（size/角速度）。
  //   `?pexp=legacy` = P-100 及之前：完全不读 exponent（Hina 的两个「落花」层 `sizerandom 40..80 exponent 2`
  //     被当成均匀分布 ⇒ 花瓣尺寸分布偏大、均值 60 而不是官方的 53.3）。
  const PEXP_MODE = (() => {
    try {
      if (typeof location !== 'undefined' && location.search) {
        return new URLSearchParams(location.search).get('pexp') === 'legacy' ? 'legacy' : 'official'
      }
    } catch (e) { /* 无 location → 默认 official */ }
    return 'official'
  })()
  // ①(P-103④ 用户第 12 项) 发射器 **speedmin/speedmax** 档位：
  //   official（默认）= 出生时沿"发射器基准点 → 出生点"方向给一个初速 `rand(speedmin, speedmax)`
  //     （`parseParticleEmitters` 早就收了这两个字段，`spawnParticle` 却从不读）。
  //   开源对照：MIT 的 webwallgl `particles.js:804-806`「发射器自身的 speedmin/max：沿发射方向的初速」。
  //   `?pspeed=legacy` = P-100 及之前：这些层的初速只可能来自 `velocityrandom`/`turbulentvelocityrandom`，
  //     只写 speedmin/speedmax 的发射器（Hina/遐蝶 的 `cherry blossoms on cursor`）粒子原地不动。
  const PSPEED_MODE = (() => {
    try {
      if (typeof location !== 'undefined' && location.search) {
        return new URLSearchParams(location.search).get('pspeed') === 'legacy' ? 'legacy' : 'official'
      }
    } catch (e) { /* 无 location → 默认 official */ }
    return 'official'
  })()
  // ①(P-126 B) 精灵表（spritesheet）**帧时序**档位：
  //   official（默认）= 按 TEXS 帧表的 `duration`（= Σ frametime，fog3 实测 64 帧/1s）与**粒子年龄**
  //     取帧：`frame = fmod(age·speed, duration) / duration · N` —— 正放、与 age 同步（同年龄同帧）。
  //     官方依据：`genericparticle.frag`/`genericparticle.vert` 的 SEQUENCE 分支按帧表时间推进；
  //     行为对照的第三方参考实现同样以 `fmod(age·speed, duration)` 取帧值（本实现按**本机 .tex 帧表实测**
  //     `frametime=0.015625 / duration=1` 独立推导，不复制参考实现代码）。
  //   `?pframe=legacy` = P-124 及之前：`fv = (1 − lifePos) · sequencemultiplier`
  //     ⇒ 倒放、速率 = 1/life（hina 雾 2 的 life 3..5s ⇒ 仅 16 帧/s）、且**逐粒子各自相位**
  //     （粒子间 life 不同 ⇒ 同屏粒子显示不同帧 —— 真机看到的就是"帧几乎不动/缓慢倒放"）。
  //   只在贴图真带 `duration > 0`（TEXS 帧表有 frametime）时改变行为；无帧表的贴图两档逐位一致。
  const PFRAME_MODE = (() => {
    try {
      if (typeof location !== 'undefined' && location.search) {
        return new URLSearchParams(location.search).get('pframe') === 'legacy' ? 'legacy' : 'official'
      }
    } catch (e) { /* 无 location → 默认 official */ }
    return 'official'
  })()
  // ①(P-126 C/D/F) **粒子算子口径**档位（oscillatealpha / oscillateposition / controlpointattract / turbulence 缺省）：
  //   official（默认）：
  //     · oscillatealpha  = **乘性**：`alpha = base · mix(scalemin, scalemax, (cos(2πf·age+φ)+1)/2)`，scalemax 缺省 1；
  //     · oscillateposition = **逐轴增量**：`pos[轴] += −scale[轴]·ω·sin(ω·age+φ[轴])·dt`（三轴各自频率/幅度/相位，
  //       不再每帧覆盖位置 ⇒ movement/turbulence/attract 累积的漂移得以保留）；
  //     · controlpointattract = 判据 `d < threshold/2` 才施力（旧实现写成 `d > threshold/2`，**正好反了**）；
  //     · turbulence 的 `mask` 缺省 = (1,1,0)（旧实现 [1,0,0] ⇒ 只沿 x 推）。
  //   `?pops=legacy` = P-124 及之前：加性+clamp 的 oscillatealpha（base=0.5 时 24.8% 周期 α=0）、
  //     覆盖式 oscillateposition（同屏粒子沿固定对角线机械摆动、漂移被抹掉）、反判据 attract、mask=[1,0,0]。
  //   ⚠ ⑧-4 与 ⑧-5 **必须同批**：只把 oscillateposition 换成增量式、不同时纠正 attract 判据，
  //     萤火虫会被"反判据 + 层空间退化目标(世界 0,0)"推离画布（实测漂到 x≈9700px，画布宽 3840）。
  const POPS_MODE = (() => {
    try {
      if (typeof location !== 'undefined' && location.search) {
        return new URLSearchParams(location.search).get('pops') === 'legacy' ? 'legacy' : 'official'
      }
    } catch (e) { /* 无 location → 默认 official */ }
    return 'official'
  })()
  // ①(P-130 批A 跨批必做) **A 类颜色口径**档位（`?pcolor=legacy`）：
  //   official（默认）= 本批修完的口径：`colorrandom` 缺 `max` 用官方缺省 `{255,255,255}`（恒白）、
  //     `colorchange` 用官方的**乘**（`MutiplyColor`，保留逐粒子色差）。
  //   `?pcolor=legacy` = P-126 及之前的颜色**计算**口径（改动前画面）：`colorrandom` 缺 `max` 用旧
  //     归一化缺省 `[1,1,1]`（⇒ 与字节域 `min` 混算成随机灰度）、`colorchange` 用旧的赋值式
  //     （⇒ 末段所有粒子同色）。绘制通路不变（颜色仍上屏）。
  //   ⚠ 与 SCAN 报告 §4 的措辞差异：那里把这条备注成"回退成恒 (1,1,1)"——那是 **P-126 之前**的
  //     *绘制常量*（颜色算完但不进顶点 ⇒ 白点）；本批按仓库既有 legacy 约定（`?pops`/`?pframe`/`?psize`
  //     都是"回到改动前的画面"）实现为**颜色计算口径**档位，理由：A 类回退口的用途是真机 A/B 本批两条
  //     颜色修复；若连绘制也退回恒白，legacy 与 official **两侧都是白点**，等于没有回退口。
  const PCOLOR_MODE = (() => {
    try {
      if (typeof location !== 'undefined' && location.search) {
        return new URLSearchParams(location.search).get('pcolor') === 'legacy' ? 'legacy' : 'official'
      }
    } catch (e) { /* 无 location → 默认 official */ }
    return 'official'
  })()
  // ①(P-140 用户第 7 项) **湍流初速场的口径档位**（`turbulentvelocityrandom` initializer）：
  //   official（默认）= **方向是位置的函数**（相干场）：`dir = f(p.pos·PTURB_K, 出生时刻×timescale)`
  //     ⇒ 同一处出生的粒子**同向**、相邻位置方向**平滑**。官方语义 = 按位置采样的 curl 噪声场
  //     （三个独立参考实现都如此，出处见 `docs/VAPOR-LAYER-3544152633.md` §4.1/§6-1）。
  //   `?pturb=legacy` = 改动前（P-139 及之前）的口径：方向 = `p.random` 抽的**独立随机出生角**
  //     ⇒ 同处出生的粒子各自飞散。逐位回退（不放宽任何断言，是"换回旧算式"）。
  //   ⚠ 为什么必须给回退口：这条 initializer 被语料 **28 层**吃到（rope 13 / sprite 14 / spritetrail 1，
  //     复算命令见报告 §7），其中 sprite 族的观感会从"四散"变成"整团漂移"（落花/樱花/灰烬），
  //     真机逐层对拍官方 `preview.gif` 之前必须能一键回到今天的画面。
  //   档位随 `ctx.pturbLegacy` 进 `buildParticleSystem` → `sys.pturbLegacy` → `applyInitializer`；
  //   场频率是**模块级**常量 `PTURB_K`（见文件上方 `PTURB_K` 的定义与"待标定量"警告）。
  const PTURB_MODE = (() => {
    try {
      if (typeof location !== 'undefined' && location.search) {
        return new URLSearchParams(location.search).get('pturb') === 'legacy' ? 'legacy' : 'official'
      }
    } catch (e) { /* 无 location → 默认 official */ }
    return 'official'
  })()
  // ①(P-144) **粒子 `children`（子系 / 拖尾）档位**（`?children=legacy`）：
  //   official（默认）= 按官方语义生成子系（`static` / `eventfollow` / `eventspawn` / `eventdeath`，
  //     缺省 `maxcount 20`、`probability 1.0`、`controlpointstartindex 0`；见 `parseParticleChildren`
  //     上方的整段注释）。
  //   `?children=legacy` = **改动前**：一条子系都不生成、一个随机数都不抽、连父系的
  //     `pSpawnEv`/`pDeathEv` 事件数组都不建 ⇒ 顶点流/粒子数/RNG 流逐位回到 P-143 的画面。
  //   为什么必须给回退口：`children` 命中 **76 个父层 / 21 个包 / 149 条**（本仓语料的最大单项），
  //   其中 eventfollow 37 条会让"本来安静的一层"多出一整条拖尾 ⇒ 真机逐层对拍官方
  //     `preview.gif` 之前必须能一键回到今天的画面。
  const CHILDREN_MODE = (() => {
    try {
      if (typeof location !== 'undefined' && location.search) {
        return new URLSearchParams(location.search).get('children') === 'legacy' ? 'legacy' : 'official'
      }
    } catch (e) { /* 无 location → 默认 official */ }
    return 'official'
  })()
  // ①(P-149) **粒子 `overbright`（材质常量 `ui_editor_properties_overbright`）档位**（`?overbright=legacy`）：
  //   official（默认）= 实例 RGB × 材质里的 `overbright`（缺省 1；取值契约见 `particleOverbrightFactor`）。
  //   `legacy` = **恒 1**：三个颜色分量与改动前逐位相同（= 这个键被静默丢弃的旧画面）。
  //   为什么必须给回退口：语料 **25 个粒子层**的亮度今天就与作者本意不符（最大 `5×`、最小 `0.17×`；
  //   `dd/3719111841` 的 Bokeh Hex/Cir = 0.25 ⇒ 今天亮 4 倍），真机逐层对拍官方 `preview.gif`
  //   与各包既有观感之前，必须能一键回到"键被忽略"的画面。
  // ⚠ 判定式写成**正则字面量**（与 `?bindorder=legacy`/`?parspace=legacy` 同形）：
  //   `tests/diag-flag-check.mjs` 的规则 (c) 只认这种写法。
  const OVERBRIGHT_MODE = (() => {
    try {
      if (typeof location !== 'undefined' && location.search) {
        return /[?&]overbright=legacy/.test(location.search) ? 'legacy' : 'official'
      }
    } catch (e) { /* 无 location → 默认 official */ }
    return 'official'
  })()
  // ①(P-131 批 D) 音频驱动发射的状态与求值在**模块级**（`AUDIO_EMIT_MODE` / `AUDIO_BANDS_VIEW` /
  //   `setAudioBands()` / `audioFactor()`，见 `parseParticleEmitters` 上方的整段注释）：页内一个音频源，
  //   所有渲染器实例共用同一份活视图（官方 `engine` 是引擎级单例）。这里只在签名里带上档位，
  //   让 `?audioemit=` 切换后粒子系统必须重建（否则缓存里的 sys 还带旧档位算出的出生流）。
  // 逐帧预算游标 + 统计（统计经 stats 钩子 / 渲染器 particleStats 暴露，供真机上报取证）
  const partFrame = { left: 0, layerTotal: 0, layers: 0 }
  const partStat = { tier: PARTICLE_BUDGET.tier, perLayer: PARTICLE_BUDGET.perLayer, total: PARTICLE_BUDGET.total,
    layerCap: PARTICLE_BUDGET.layers, rateCap: PARTICLE_BUDGET.rate, layers: 0, drawn: 0, alive: 0,
    skippedTex: 0, skippedBudget: 0, capped: 0, rateCapped: 0, renderers: {},
    // ①(P-69) simMode：incr=按输入签名缓存+每帧只推进 dt；replay=旧"逐帧重建+从 0 重放"
    simMode: 'incr', simSteps: 0, simUpdates: 0,
    // ①(P-65) trail 几何与形状通道记账（真机上报可区分"走了哪条几何/哪个形状通道"）
    trailMode: TRAIL_MODE, trailLayers: {}, trailSegments: 0, trailDrawn: 0, trailDegenerate: 0, trailSkipped: 0,
    // ①(P-74 ②) 粒子 quad 尺寸口径（official=p.size/2；legacy=旧 p.size）
    psizeMode: PSIZE_MODE,
    // ①(P-74 ③) velocityrandom y 口径（official/legacy）
    vyMode: VY_MODE,
    // ①(P-74 ①) instanceoverride 档位（on=官方语义 / off=?io=off 回退）
    ioMode: IO_MODE,
    // ①(P-103) 本轮四个档位（真机上报可回答"这一台到底走的哪一档"）
    protMode: PROT_MODE, pquadMode: PQUAD_MODE, pexpMode: PEXP_MODE, pspeedMode: PSPEED_MODE,
    // ①(P-126 B) 精灵表帧时序档位（official=按 age×duration 取帧；legacy=(1−lifePos)×seqMul 倒放）
    pframeMode: PFRAME_MODE,
    // ①(P-126 C/D/F) 粒子算子口径档位（official / legacy）
    popsMode: POPS_MODE,
    // ①(P-130 批A) A 类颜色口径档位（official=本批修完的口径 / legacy=P-126 的颜色计算口径）
    pcolorMode: PCOLOR_MODE,
    // ①(P-140 用户第 7 项) 湍流初速场口径档位（official=方向是位置的函数 / legacy=独立随机出生角）
    pturbMode: PTURB_MODE,
    // ①(P-131 批D) 音频驱动发射档位与生效记账（真机上报可回答"这一台到底有没有音频源、调没调制"）
    audioEmitMode: AUDIO_EMIT_MODE, audioModulated: 0, audioNoSource: 0, audioLayers: {},
    // ①(P-144 子系) 子系口径档位与生效记账（真机上报可回答"这一台到底画了几条子系、哪一类、
    //   有没有因为缺定义/缺纹理/超预算被跳过"）。字段逐帧重置（`children` 那一行在帧首）。
    childrenMode: CHILDREN_MODE,
    // ①(P-149) overbright 档位 + 生效记账（真机上报可回答"这一台吃了几层、因子最大/最小是多少"）
    overbrightMode: OVERBRIGHT_MODE,
    overbright: { layers: 0, lastFactor: 1, minFactor: 1, maxFactor: 1, lastLayer: '' },
    children: { parents: 0, specs: 0, drawn: 0, kinds: { static: 0, eventfollow: 0, eventspawn: 0, eventdeath: 0 },
      unresolved: 0, texMissing: 0, budgetSkipped: 0, depthCapped: 0, noParent: 0, followCleared: 0,
      bursts: 0, spawned: 0, capSkipped: 0, probRejected: 0, gateClosed: 0 },
    // ①(P-103) 生效记账（逐帧重置）：吃自转的 quad 数 / 吃图层变换的 quad 数 / 吃 exponent 的 initializer 次数 /
    //   拿到发射器初速的粒子数。默认档下这四个数应当 >0（语料有对应层），legacy 档下必须恒 0。
    protQuads: 0, pquadQuads: 0, expApplied: 0, spawnSpeeds: 0,
    // ①(P-74 ①) instanceoverride 生效记账（真机上报可回答"这一层到底吃没吃 override"）
    io: { layers: 0, applied: 0, fields: {}, lastLayer: null },
    // ①(P-126 A) 逐粒子颜色通道记账（真机上报可回答"这一层的颜色走的是 u_Color 上提还是 a_Color 顶点属性"）
    colorUni: 0, colorAttr: 0,
    shapeFrom: { rgba: 0, rg88: 0, r8: 0, unknown: 0 } }
  const partLogOnce = new Set()
  // ①(P-74 ④) 效果链输入台账（每帧重置；见 renderLayer 里的 fxRec 注释）
  const fxStat = { layers: 0, last: null, perLayer: {} }
  const onLog = opts.onLog || ((m) => { try { console.warn(m) } catch {} })
  const copyProg = linkProgram(gl, COPY_VERT, COPY_FRAG)
  const compProg = linkProgram(gl, COPY_VERT, COMPOSITE_FRAG)
  // ①(RE-18) 层颜色混合（colorBlendMode）专用程序
  const copyBlendProg = linkProgram(gl, COPY_VERT, COPY_FRAG_BLEND)
  // ①(RE-18 官方语义) 屏幕混合程序：A=屏幕背景、B=本层、输出 alpha 取背景
  const screenBlendProg = linkProgram(gl, COPY_VERT, COPY_FRAG_SCREENBLEND)
  const screenBlendUni = {
    mvp: gl.getUniformLocation(screenBlendProg, 'u_MVP'),
    tex: gl.getUniformLocation(screenBlendProg, 'u_Tex'),
    screen: gl.getUniformLocation(screenBlendProg, 'u_Screen'),
    color: gl.getUniformLocation(screenBlendProg, 'u_Color4'),
    viewport: gl.getUniformLocation(screenBlendProg, 'u_Viewport'),
    mode: gl.getUniformLocation(screenBlendProg, 'u_Mode'),
  }
  const copyBlendUni = {
    mvp: gl.getUniformLocation(copyBlendProg, 'u_MVP'),
    tex: gl.getUniformLocation(copyBlendProg, 'u_Tex'),
    color: gl.getUniformLocation(copyBlendProg, 'u_Color4'),
    mode: gl.getUniformLocation(copyBlendProg, 'u_BlendMode'),
  }
  const particleProg = linkProgram(gl, PARTICLE_VS, PARTICLE_FS)
  // ①(新) mesh 蒙皮程序与缓冲（懒创建；仅 puppet 层使用）
  let meshProg = null, meshUni = null
  const meshBuffers = new Map()   // layerId -> { vao, vbo, ebo, count }
  function ensureMeshProg() {
    if (meshProg) return meshProg
    meshProg = linkProgram(gl, MESH_VS, MESH_FS)
    meshUni = {
      bones: gl.getUniformLocation(meshProg, 'u_Bones'),
      origin: gl.getUniformLocation(meshProg, 'u_Origin'),
      scale: gl.getUniformLocation(meshProg, 'u_Scale'),
      proj: gl.getUniformLocation(meshProg, 'u_Proj'),
      view: gl.getUniformLocation(meshProg, 'u_View'),      // ①(P-100) 相机 view 平移
      framed: gl.getUniformLocation(meshProg, 'u_Framed'),  // ①(P-100) 相机取景窗口
      tex: gl.getUniformLocation(meshProg, 'u_Tex'),
      vflip: gl.getUniformLocation(meshProg, 'u_VFlip'),
    }
    return meshProg
  }
  function uploadMeshLayer(layerId, mesh) {
    if (meshBuffers.has(layerId)) return meshBuffers.get(layerId)
    const n = mesh.positions.length
    // ①(修复 2026-09-12) 网格顶点以"网格包围盒中心"为原点：puppet 网格常有偏心
    // （如凯尔希'眼睛组合'中心≈(-848,-19)）→ 不归心会让整层偏移数百像素、顶点飞出屏幕
    // → 巨大三角形覆盖半屏（真机"以屏幕中心为原点的放射状彩色闪烁"根因）。
    // 我们的层 origin 已是"实绘中心"（校准值），故顶点必须同以网格中心为基准。
    let mc = mesh.__center
    if (!mc) {
      let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9
      for (const p of mesh.positions) {
        if (p[0] < mnx) mnx = p[0]; if (p[0] > mxx) mxx = p[0]
        if (p[1] < mny) mny = p[1]; if (p[1] > mxy) mxy = p[1]
      }
      mc = mesh.__center = [(mnx + mxx) / 2, (mny + mxy) / 2]
      // ①(P-58 H1) 顺手把网格原始包围盒留在 mesh 上：`?meshsize=1` 的 scaleXY 要用它
      //   算 size/bbox；demo 台账（onMeshLayer）本来就会自行扫一遍顶点填同名键。
      //   形状取 [x0,y0,x1,y1]（min/max，与台账既有口径一致——**不是** [w,h]，否则台账把
      //   bb[2]/bb[3] 当 min/max 用会得到 NaN 矩形）。
      if (!mesh.__bbox) mesh.__bbox = [mnx, mny, mxx, mxy]
    }
    const inter = new Float32Array(n * 11)   // pos3 + uv2 + idx4 + w4? -> 实际 3+2+4+4=13
    const verts = new Float32Array(n * 13)
    for (let i = 0; i < n; i++) {
      const o = i * 13, p = mesh.positions[i], uv = mesh.uvs[i] || [0, 0]
      // ①(2026-09-12 定案) **不平移顶点**：骨骼矩阵是在 MDL 原始坐标系里算的，
      //   顶点若单独按 bbox 中心平移，网格与骨骼就错开（眼睛组合偏心 848px → 骨骼一动就绕错枢轴甩出去）。
      //   改为把中心补偿放到绘制 origin（见 renderMeshLayer），两者恒在同一坐标系。
      const px = p[0], py = p[1], pz = p[2]
      const bi = mesh.blendIndices[i] || [0, 0, 0, 0], bw = mesh.blendWeights[i] || [1, 0, 0, 0]
      verts[o] = px; verts[o + 1] = py; verts[o + 2] = pz
      verts[o + 3] = uv[0]; verts[o + 4] = uv[1]
      verts[o + 5] = bi[0]; verts[o + 6] = bi[1]; verts[o + 7] = bi[2]; verts[o + 8] = bi[3]
      verts[o + 9] = bw[0]; verts[o + 10] = bw[1]; verts[o + 11] = bw[2]; verts[o + 12] = bw[3]
    }
    const vbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
    const ebo = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices), gl.STATIC_DRAW)
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const S = 13 * 4
    const attr = (prog, name, size, off) => {
      const loc = gl.getAttribLocation(prog, name)
      if (loc < 0) return
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, S, off)
    }
    const prog = ensureMeshProg()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo)
    attr(prog, 'a_Position', 3, 0)
    attr(prog, 'a_TexCoord', 2, 12)
    attr(prog, 'a_BlendIdx', 4, 20)
    attr(prog, 'a_BlendWeight', 4, 36)
    gl.bindVertexArray(null)
    const rec = { vao, vbo, ebo, count: mesh.indices.length,
      // ①(P-41 A3) 子块表：mesh.submeshes=[{start,count},…]（未来多材质块 MDL）时建立；
      //   当前语料全部单块 → null（?ln Ctrl 子块维度按"不可拆"报告）
      submeshes: Array.isArray(mesh.submeshes) && mesh.submeshes.length > 1 ? mesh.submeshes : null }
    meshBuffers.set(layerId, rec)
    return rec
  }
  // 绘制 puppet mesh 层：gBones=Float32Array(骨骼数×16)，mvp=层矩阵，tex=纹理
  // ?vflip=1：全局 v 轴翻转（诊断 A/B；官方语义应为不翻转 tex 行0=图顶）
  const VFLIP_FLAG = (() => { try { return new URLSearchParams(location.search).has('vflip') ? 1 : 0 } catch { return 0 } })()
  // ?qflip=1：只翻**四边形层**的纹理 v 轴（mesh 不动）——用于判定背景/飘带/发片"倒着"是否四边形路径 v 轴反
  // ①(2026-09-12 定案) 当时默认**开启**：设备实测（?qflip=1）四边形层背景/飘带/头顶发片同时变正 →
  //   结论写成了"四边形路径的纹理 v 轴与官方相反（官方 tex 行0=图顶=v0）"。
  // ①(P-69 2026-09-15 修正定案) 那个结论是**误诊**：真正的原因是相机投影 y 轴反了（世界 y=0 画到屏幕底，
  //   见 buildCamera），于是每个四边形层的内容都被**绕屏幕水平中线**翻了一次；而 v 翻转恰好是"绕该层
  //   自己的中心翻一次"。对**中心落在 y=1080 的层**（背景/飘带/满幅发片）两者等价 ⇒ qflip=1 看起来
  //   "同时变正"；对**中心不在 1080 的层**（花朵 cy=1640.55、钢琴 cy=1053、时钟 cy=8…）v 翻转只能翻
  //   内容、翻不动位置 ⇒ 位置误差一直留着（就是用户第 1 项）。
  //   现在：投影修正打开（默认）时 qflip 默认**关**（内容方向本来就是对的，再翻就错）；
  //        `?projy=legacy` 时 qflip 默认**开**（逐位保留旧行为）。
  //   `?qflip=1|0` 仍可显式覆盖，做 A/B。
  const QFLIP = (() => {
    try {
      const v = new URLSearchParams(location.search).get('qflip')
      if (v === '1') return true
      if (v === '0') return false
      return !projectionYFix()          // 未显式指定 → 跟随投影口径（旧口径开、修正后关）
    } catch (e) { return !projectionYFix() }
  })()
  // ①(P-69) 口径自报（进 demo 的 #log → 进设备上报的 log 字段，供真机复测确认跑在哪一档）
  try {
    onLog('P-69 投影 y 口径=' + (projectionYFix() ? 'fix(世界y=0→屏幕顶，与 MESH_VERT/CPU 预览同式)' : 'legacy(旧:世界y=0→屏幕底，所有四边形/粒子层绕屏中线镜像)')
      + '，四边形 v 翻转 qflip=' + (QFLIP ? 'on' : 'off') + '（?projy=legacy 回退旧口径）')
  } catch (e) { /* 日志失败不影响渲染 */ }
  // ①(P-100) 角色层适配档自报（进 #log → 进上报 log 字段：真机复测时一眼看出跑在哪一档）
  try {
    const cm = resolveCharfitMode(undefined, CHARFIT_MODE)
    onLog('P-100 角色层适配档 charfit=' + cm
      + (cm === 'legacy' ? '（旧行为：蒙皮层不接相机 + 超屏角色钉画布中心）'
        : cm === 'off' ? '（适配关闭：角色只吃世界变换 + 相机取景）'
          : '（缺省：有相机层则不适配，无相机层且超屏才兜底）（?charfit=legacy|off 回退）'))
  } catch (e) { /* 日志失败不影响渲染 */ }
  // ①(P-107) 投影档自报（进 #log → 进上报 log 字段：真机/测试一眼看出这一帧走的是正交还是透视）
  try {
    const pm = resolveProjMode(undefined, (typeof window !== 'undefined' && window) ? window.__mpwProjMode : undefined, PROJMODE)
    onLog('P-107 投影档 projmode=' + pm
      + (pm === 'ortho' ? '（强制正交 = 逐位回到改动前）'
        : pm === 'persp' ? '（强制透视：正交包也按 fov 画，z=0 平面与正交档逐位相同）（?projmode=auto|ortho 回退）'
          : '（缺省 auto：有 general.orthogonalprojection ⇒ 正交；无矩形（3D 包）⇒ 透视 fov）（?projmode=persp|ortho）'))
  } catch (e) { /* 日志失败不影响渲染 */ }
  // ①(P-90) 质量档位自报（**进既有启动日志** ⇒ 进 demo 的 #log ⇒ 进设备上报的 log 字段，
  //   真机复测时能直接看出跑在哪一档、AA 落到哪条路径、有没有非法值被回落）。
  logTiers()
  // ①(P-69 第 6 项) 鼠标指针来源（lockToPointer 发射器的基准点）：
  //   · `?cursor=off` → 整类发射器不发射（用户的即时逃生口；与 ?noparticles 全局关不同）；
  //   · `window.__mpwPointer = {x, y, inside}` —— 设计坐标（0..projW/0..projH，y 向下）；
  //     宿主/测试台注入用，优先级最高；
  //   · 否则用画布上的 `pointermove`（passive，不抢事件）：按"画布归一化 0..1"存，
  //     渲染时按相机 framed 窗口换算成设计坐标（分辨率/取景无关）。
  //   ①(P-118) 上面两条通道**都有生产者**，优先规则说全（每一条都被 `tests/pointer-leave-test.mjs` 钉住）：
  //     · DOM 通道**自举**：建渲染器就把画布钩子装上（不依赖"已经有指针"，见 `__hookPointer` 调用点）；
  //     · 宿主**显式** `inside:false` ⇒ 无指针（不是"回落到上一次画布坐标"）；
  //     · 画布 `pointerleave` 后、注入值**没变** ⇒ 无指针（旧坐标不许继续喂）；注入值变了 ⇒ 认注入；
  //     · 其余情况注入优先；注入缺席才回落画布归一坐标。
  const CURSOR_OFF = (() => { try { return new URLSearchParams(location.search).get('cursor') === 'off' } catch (e) { return false } })()
  // ①(P-112-BANDGEOM) 帧几何档（`?framegeom=cover`；缺省 legacy ⇒ 下面的换算与改动前逐位相同）。
  //   解析点在 `frameGeomMode`（本文件顶部导出，测试与宿主共用；`?frame=legacy|off` 仍是最高优先回退）。
  const FRAME_GEOM = frameGeomMode((typeof location !== 'undefined' && location) ? location.search : '')
  // ①(P-113 显示选项) 水平翻转（`?fliph=1` / `__wp.setDisplay({flipH:true})`）：页面把
  //   `transform: scaleX(-1)` 写在**画布**上 ⇒ 屏幕 x 处看到的是未翻转内容的 `1 − x`。
  //   指针归一坐标因此必须**镜像一次**（`framePointerMap` 的第四个参数），否则鼠标与画面反着走。
  //   注入通道 `window.__mpwPointer`（设计坐标）**不镜像** —— CSS transform 不改变宿主给的设计坐标。
  //   优先级：`opts.displayFlipH`（测试/宿主显式传）→ `window.__mpwDisplay.flipH`（页面实时写）→
  //   `?fliph=`（加载时读一次）；缺省 false ⇒ 指针路径逐位不变。
  const FLIPH_QUERY = (() => {
    try { return parseDisplayOptions((typeof location !== 'undefined' && location) ? location.search : '').flipH } catch (e) { return false }
  })()
  const __pointerFlip = () => displayFlipH(opts.displayFlipH, (typeof window !== 'undefined' && window) ? window.__mpwDisplay : undefined, FLIPH_QUERY)
  let __pointerN = null      // { nx, ny } ∈[0,1]（画布归一化）
  let __pointerHooked = false
  // ①(P-136 用户第 4 项：照抄上游 MIT 实现) 上游的**统一指针输入源**（整文件逐字照抄，
  //   见 `core/we-pointer-source.mjs` ← `renderer/vendor/we-scene/render/pointer.js:1-320`）。
  //   上游 `renderer/src/scene-mount.ts:657-676` 每帧只读同一个 state 对象、多方消费；
  //   本仓库把它接在**画布归一坐标**这条路上（注入通道是宿主契约、由 P-118 的优先级规则钉住，
  //   不进这里，见文件头「接线口径」）。
  //   `target` 传一个**没有 addEventListener 的假对象**：上游 `pointer.js:199-210` 只有在
  //   `target && target.addEventListener` 为真时才挂 mousemove/mousedown/mouseup/blur 与
  //   document 的 mouseleave —— 那套"离开只清按键、保留位置与 has"的语义与本仓库 P-118/P-121
  //   钉住的「离开 ⇒ 无指针 ⇒ 停发」**不同**（冲突已在 P-136 台账报告，未擅自改断言）。
  //   `viewport` 由 `__pointerDesign` 每帧填（projW/projH），供 `syncWorld` 的屏幕像素口径用。
  const __ptrViewport = { w: 1, h: 1 }
  const __ptrSource = createPointerSource({ target: { __noDom: true }, viewport: () => __ptrViewport })
  // ①(P-118 G1/G5) 两条输入源的**状态分开记**（注入通道 vs 画布 DOM 通道），判定才不会互相盖：
  //   · `__pointerGone` = 画布 `pointerleave` 已宣告"指针不在画布内"；
  //   · `__pointerGoneInj` / `__pointerGoneKey` = 宣告那一刻注入通道的值（**对象引用 + 指纹**）：
  //     注入没变 ⇒ 宿主喂的还是"离开前那份旧值"，不许它盖过"人已经把鼠标移出画布"（G1）；
  //     注入变了（宿主写了新对象/新坐标/新 inside）⇒ 当作新证据接受并清掉"已离开"（纯注入的台子
  //     不会因为一发 stray `pointerleave` 被永久锁死）。
  let __pointerGone = false
  let __pointerGoneInj = null
  let __pointerGoneKey = 'none'
  /** 注入通道当前值（`window.__mpwPointer` 优先，Node 侧取证工具用 `globalThis.__mpwPointer`，同一口）。 */
  const __injectedPointer = () => {
    try {
      if (typeof window !== 'undefined' && window && window.__mpwPointer) return window.__mpwPointer
      return (typeof globalThis !== 'undefined' && globalThis.__mpwPointer) ? globalThis.__mpwPointer : null
    } catch (e) { return null }
  }
  /** 注入值指纹（用**数值**而不是对象身份之外的东西：宿主原地改字段也能被认出来）。 */
  const __injKey = (inj) => (inj && Number.isFinite(inj.x) && Number.isFinite(inj.y))
    ? (inj.x + '|' + inj.y + '|' + (inj.inside === false ? '0' : '1')) : 'none'
  // ①(P-121 B-G2/G3) "离开"信号的**统一处置**（`pointerleave` / `pointerout` / 页面级 blur·visibilitychange
  //   走同一条路）：清掉画布归一坐标 + 记"已离开"，并记下**那一刻**注入通道的值（对象 + 指纹）——
  //   语义与 P-118 的 `pointerleave` 逐字相同（注入值没变不许盖过"已离开"，变了=新证据）。
  //   `why` 只进台账（`__pointerLeaveWhy`，离线取证/真机复现时能一眼看出是哪条信号关的门）。
  let __pointerLeaveWhy = ''
  const __pointerLeave = (why) => {
    try {
      __pointerLeaveWhy = why
      __pointerN = null
      __pointerGone = true
      __pointerGoneInj = __injectedPointer()
      __pointerGoneKey = __injKey(__pointerGoneInj)
    } catch (e) { /* ignore */ }
  }
  // ①(P-121 B-G3) **页面级**"离开"（切窗口 / 切标签 / 系统弹窗）：`blur` 与 `visibilitychange:hidden`
  //   走"挂起"而不是"清坐标" —— 指针可能还停在画布上（浏览器在失焦窗口上照样发 pointermove、
  //   只是 `pointerleave` 不一定发），所以两条通道一起让路（`__pointerDesign` 首行判 `__pointerSuspended`），
  //   但 `__pointerN` **保留**：焦点/可见性回来时若指针仍在画布内 ⇒ 立刻继续发射（G3c 钉住这条，
  //   不许把"临时失焦"误判成"永久停发"）；若失焦期间指针真的离开了画布，`pointerleave/pointerout`
  //   会把 `__pointerN` 清掉 ⇒ 回来也不会无中生有（G3e 钉住另一面）。
  let __pointerSuspended = false
  let __pointerSuspendWhy = ''
  let __pointerReturnWhy = ''
  let __pageHookedOn = null      // { win, doc }：已挂钩的页面目标（只在**换了对象**时重挂，幂等）
  const __pointerSuspend = (why) => { try { __pointerSuspended = true; __pointerSuspendWhy = why } catch (e) { /* ignore */ } }
  const __pointerResume = (why) => {
    try {
      if (!__pointerSuspended) return
      __pointerSuspended = false
      __pointerReturnWhy = why
    } catch (e) { /* ignore */ }
  }
  // ①(P-121 B-G3) 页面级钩子：挂在 `window`（blur/focus）与 `document`（visibilitychange）上。
  //   **幂等 + 目标可变**：ctx.window/document 只在换了个对象时重挂（同一目标二次调用直接返回）——
  //   与 `__hookPointer` 的"挂不上就不置位"同一条纪律：Node 侧（离线工具/本仓库的假 DOM harness）
  //   一开始可能压根没有 window/document，等它们出现时必须还能装上。`?cursor=off` 下**不调用**
  //   （逃生口语义：一个监听器都不装，D4b 把画布侧与页面侧一起钉住）。
  function __hookPageLeave() {
    try {
      const win = (typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') ? window : null
      const doc = (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') ? document : null
      if (!win && !doc) return
      if (__pageHookedOn && __pageHookedOn.win === win && __pageHookedOn.doc === doc) return
      __pageHookedOn = { win, doc }
      if (win) {
        win.addEventListener('blur', () => __pointerSuspend('blur'), { passive: true })
        win.addEventListener('focus', () => __pointerResume('focus'), { passive: true })
      }
      if (doc) {
        doc.addEventListener('visibilitychange', () => {
          const hidden = (doc.hidden === true) || (doc.visibilityState === 'hidden')
          if (hidden) __pointerSuspend('visibilitychange:hidden'); else __pointerResume('visibilitychange:visible')
        }, { passive: true })
      }
    } catch (e) { /* 无 DOM → 只认 window.__mpwPointer */ }
  }
  function __hookPointer() {
    if (__pointerHooked) return
    try {
      const el = (gl && gl.canvas && gl.canvas.addEventListener) ? gl.canvas : null
      // ①(P-118 G4) 挂不上元素就**不置位**（旧写法先进门就置位 ⇒ 之后即使元素可用也永不再试）。
      if (!el) return
      __pointerHooked = true
      const set = (ev) => {
        try {
          const p = framePointerMap(ev, el, FRAME_GEOM, __pointerFlip())
          if (!p) return
          __pointerN = { nx: p.nx, ny: p.ny }
          __pointerGone = false      // ①(P-118 G1) 画布又收到新坐标 ⇒ "已离开"作废
          // ①(P-136 用户第 4 项) 照抄来的指针源同时收下这一发（上游 `pushExternal` 是
          //   "宿主/测试台注入"与 DOM 监听**共用**的写入路径，见 pointer.js:53-63/231-242）。
          //   本仓库这里只用它的状态容器与 `syncWorld`，DOM 监听仍由本函数自己装。
          __ptrSource.pushExternal({ u: p.nx, v: p.ny })
        } catch (e) { /* ignore */ }
      }
      el.addEventListener('pointermove', set, { passive: true })
      el.addEventListener('pointerdown', set, { passive: true })
      el.addEventListener('pointerleave', () => __pointerLeave('pointerleave'), { passive: true })
      // ①(P-121 B-G2) `pointerout` + `relatedTarget === null` 是"离开文档/窗口"的**等价路径**
      //   （切窗口/系统弹窗时有的实现只发 pointerout 不发 pointerleave）⇒ 与 pointerleave 同一处置。
      //   `relatedTarget` 指向画布**内部**元素时**不算**离开（pointerout 会从子元素冒泡上来：
      //   指针从子元素移回画布本体时 relatedTarget === 画布本身）；`contains` 不存在（最小假 DOM）
      //   时只认 `relatedTarget == null` 这一条，绝不因为"量不出来"就把指针判成离开。
      el.addEventListener('pointerout', (ev) => {
        try {
          const rt = ev ? ev.relatedTarget : null
          if (!rt) { __pointerLeave('pointerout(null)'); return }
          if (typeof el.contains === 'function' && !el.contains(rt)) __pointerLeave('pointerout(outside)')
        } catch (e) { /* ignore */ }
      }, { passive: true })
    } catch (e) { /* 无 DOM → 只认 window.__mpwPointer */ }
  }
  // ①(P-118 G4 **自举死锁**）建渲染器即装 DOM 钩子 —— **不依赖"本帧已经有指针"**。
  //   旧写法只在 `__ptrNow` 为真时调 `__hookPointer()`（下面每层那处）：`__ptrNow` 只能来自"钩子已装"
  //   或"宿主注入"⇒ 页面不注入就永远装不上钩子。全仓库 `__mpwPointer` **零生产者**（demo.html 里那个
  //   window pointermove 是日志面板拖动）⇒ 出货页面（demo.html → ./bundle.js）的 lockToPointer 发射器
  //   一次都不发射（"鼠标拖尾"整个是死的）。"本帧没有指针" ≠ "不需要监听 DOM"。
  //   `?cursor=off` 语义**不变**：这条逃生口下不装钩子、也不发射。
  if (!CURSOR_OFF) __hookPointer()
  // ①(P-121 B-G3) 页面级"离开"钩子（window blur/focus + document visibilitychange）与画布钩子一起、
  //   同一条件下安装；同样是幂等兜底（建渲染器时窗口/文档可能还不可用 ⇒ 每帧再试一次）。
  if (!CURSOR_OFF) __hookPageLeave()
  // 当前指针（设计坐标）；null = 无指针信息 ⇒ lockToPointer 发射器不发射
  // ①(P-112-BANDGEOM) 画布归一化 → 设计坐标的换算（原 `__pointerDesign` 内联式**逐字搬来**，一处实现）：
  //   framed 窗口宽度按 `?projmode=` 分档（P-107），与改动前逐位相同。
  function __pointerDesignFromNorm(nx, ny, cam) {
    // ①(P-107) 透视档不能用 `2/proj[0]` 反推窗口宽度（persp[0]=f/aspect，反推出来没有长度含义）
    //   ⇒ 直接用台账里的 framedW/framedH（正交档下两者逐位相同：persp[0]=2/framedW）。
    const fw = (cam.projKind === 'persp') ? cam.framedW : (cam.projection[0] ? 2 / cam.projection[0] : cam.projW)
    const fh = (cam.projKind === 'persp') ? cam.framedH : (cam.projection[5] ? 2 / Math.abs(cam.projection[5]) : cam.projH)
    return [cam.projW / 2 + (nx - 0.5) * fw, cam.projH / 2 + (ny - 0.5) * fh]
  }
  function __pointerDesign(cam) {
    try {
      // ①(P-121 B-G3) 页面级"离开"（窗口失焦 / 标签隐藏）⇒ 无指针：**注入通道与 DOM 通道一起让路**
      //   （放在最前 = 与"宿主还在按 pointermove 写注入值"这种自然写法无关；焦点/可见性恢复即解除，
      //   `__pointerN` 没被清 ⇒ 若指针仍在画布内，下一帧就继续发射）。
      if (__pointerSuspended) return null
      // Node 侧取证工具（package-matrix / render-audit / particle-shape-audit…）没有 window：
      // 认 globalThis.__mpwPointer 作为同一注入口（让它们既能测"无指针=不发射"，也能注入指针测发射路径）。
      const inj = __injectedPointer()
      // ①(P-118 G5) 宿主**显式**声明 `inside:false` = "指针不在画布内" ⇒ 无指针。
      //   旧写法把它读成"别信注入值"、接着**回落到 `__pointerN`**（上一次画布内 pointermove 留下的旧
      //   归一坐标）⇒ 宿主说"离开了"、发射器却继续在旧坐标发射（实测 inside:false 后累计 189→276、
      //   基准点仍是 (1440,810)）。这里直接 null：**不**回落到任何缓存坐标。
      if (inj && inj.inside === false) return null
      if (inj && Number.isFinite(inj.x) && Number.isFinite(inj.y)) {
        // ①(P-118 G1) 画布已宣告"指针离开"、且注入值与那一刻**同一份**（同一对象 + 同一指纹）
        //   ⇒ 注入通道不许盖过这个事实（旧写法先看注入 ⇒ 人移出画布后继续在旧坐标发射：实测
        //   离开后累计 39→54、基准点仍 (800,400)；同一发 leave 在注入撤掉后立刻生效 ⇒ 是优先级问题）。
        if (__pointerGone && inj === __pointerGoneInj && __injKey(inj) === __pointerGoneKey) return null
        __pointerGone = false      // 注入变了 = 新证据（宿主重新给了坐标/inside）⇒ "已离开"作废
        // `space:'css'`：注入方给的是 **CSS 像素**（窗口/视口坐标，即 clientX/clientY 同空间），
        //   需换算成"帧内 client 像素"再归一。口径与实测见 docs/AUDIO-BAND-WIRING.md §4：
        //   本仓库**没有任何** `space:'css'` 的生产者（grep 0 命中），且"css"是窗口空间还是
        //   帧内空间**未定** ⇒ 只在 `?framegeom=cover` 下按"窗口空间"换算，缺省照旧当设计坐标。
        if (inj.space === 'css' && cam && FRAME_GEOM === 'cover') {
          const el = (gl && gl.canvas) ? gl.canvas : null
          // ①(P-113) 这条路的输入也是**窗口坐标** ⇒ 与 DOM 路径同口径镜像（`__pointerFlip()`）
          const p = el ? framePointerMap({ clientX: inj.x, clientY: inj.y }, el, 'cover', __pointerFlip()) : null
          if (!p) return null      // 量不到 ⇒ 没有指针信息（不退回一个猜出来的坐标）
          return __pointerDesignFromNorm(p.nx, p.ny, cam)
        }
        return [inj.x, inj.y]
      }
      if (__pointerN && cam) {
        // ①(P-136 用户第 4 项：照抄上游 MIT 实现) 归一坐标 → 世界像素这一段改由照抄来的
        //   上游 `syncWorld`（`core/we-pointer-source.mjs` ← `pointer.js:286-299`）给出。
        //   等价性（本文件内可逐位核对，门禁里也有断言）：
        //     上游  wx = offX + u·viewW，本仓库 __pointerDesignFromNorm = projW/2 + (nx−0.5)·fw
        //     取 offX = projW/2 − fw/2、viewW = fw、u = nx ⇒ 两式**同一式子**（与 ?projmode= 无关，
        //     因为 fw/fh 就是下面那一支算出来的 framed 窗口）。
        //   上游 `beginFrame()`（把 last 推到 current）由渲染循环在**消费之后**调用，见 render()。
        const fw = (cam.projKind === 'persp') ? cam.framedW : (cam.projection[0] ? 2 / cam.projection[0] : cam.projW)
        const fh = (cam.projKind === 'persp') ? cam.framedH : (cam.projection[5] ? 2 / Math.abs(cam.projection[5]) : cam.projH)
        __ptrViewport.w = cam.projW || 1
        __ptrViewport.h = cam.projH || 1
        __ptrSource.syncWorld({
          offX: cam.projW / 2 - fw / 2, offY: cam.projH / 2 - fh / 2,
          viewW: fw, viewH: fh, projH: cam.projH,
        }, 0, 0)
        return [__ptrSource.state.wx, __ptrSource.state.wy]
      }
    } catch (e) { /* ignore */ }
    return null
  }
  // ①(P-69 第 4 项取证) `?bones=<层id|层名子串>`：**只读**逐骨位姿探针。
  //   动机：用户第 3/5 项（眉毛眨眼时左右翻 180°、眼睛随呼吸左右移动）都发生在 **puppet 骨骼**上，
  //   而 hina 的 37 个对象里**没有**眼睛/眉毛层（它们是 人物_puppet.mdl 的骨/子网格）⇒ `?ln` 那种
  //   层粒度开关看不到；需要一个"点名一层、把每根骨每帧的 (angle,tx,ty) 打出来"的手段。
  //   口径：demo.html 每帧填的 `sk.gBones[b] = bindInv[b] × RT(angle,tx,ty)`（行主序），
  //   所以本探针反解的是**绝对世界位姿**：`pose = bindWorld[b] × gBones[b] = RT`（与
  //   `sampleAnimRT`/`sampleCompositeAdditivePose` 的输出同空间同量纲，可直接对拍）。
  //   默认关：不开时**一个字段都不写**、不建 bindWorld、不跑反解 ⇒ 渲染逐位不变。
  //   打开时每帧写 `window.__mpwBones = { layer, nb, t, frames:[{t,bones:[[ang,tx,ty]…],flips:[…]}…] }`
  //   （环形缓冲，最近 180 帧），并**每 ~2s 往 #log 打一行结构化摘要**（log 会进设备上报 ⇒ 用户刷新
  //   一次即可回传逐骨数据；专用上报字段需 demo.html 加一行，见 PATCHES P-69 交接）。
  // ①(P-80) 眨眼判定阈值（px，单帧 |Δty|）：`?blinkty=<px>` 可调，默认 25。
  //   为什么要有这个开关：真机第一轮 3.01s 采样里全骨 max|Δty| 只有 14.9px（= 没眨眼），
  //   而"眨眼时眼皮骨该动多少"我们**还没有实测值** ⇒ 阈值必须能在真机上现场调，不用重编译。
  //   量级参考：hina 人物层 `u_Scale` 的 y 分量 ≈ 1（`[1, -1]`），所以 Δty 基本就是设计像素。
  const BLINK_TY = (() => {
    try {
      const v = new URLSearchParams(location.search).get('blinkty')
      const n = Number(v)
      return (v !== null && v !== '' && isFinite(n) && n > 0) ? n : 25
    } catch (e) { return 25 }
  })()
  // ①(P-80) 会话摘要（给上报/日志用）：一眼回答"这次会话里到底有没有眨眼、哪几根骨在动"。
  function __bonesSummary(st, nb) {
    let mB = -1, mD = 0, mAt = 0, aB = -1, aD = 0, aAt = 0
    for (let b = 0; b < nb; b++) {
      const d = st.maxDty[b] || 0
      if (d > mD) { mD = d; mB = b; mAt = st.maxDtyAt[b] || 0 }
      const a = st.maxDang[b] || 0
      if (a > aD) { aD = a; aB = b; aAt = st.maxDangAt[b] || 0 }
    }
    return {
      frames: st.nFrames, sessionSec: +(((st.lastT === null ? (__bonesNowT || 0) : st.lastT) - (st.t0 || 0))).toFixed(2),
      maxDtyBone: mB, maxDty: +mD.toFixed(2), maxDtyAt: +mAt.toFixed(3),
      maxDangBone: aB, maxDang: +aD.toFixed(4), maxDangAt: +aAt.toFixed(3),
      blinkCount: st.nBlinks, blinkSamples: st.blinks.length, blinksPending: st.open.length,
      mirrorEver: st.mirrorEver.slice(),
      blinkThreshold: BLINK_TY,
    }
  }
  const BONES_WANT = (() => {
    try {
      const v = new URLSearchParams(location.search).get('bones')
      return (v === null || v === '') ? null : String(v)
    } catch (e) { return null }
  })()
  // ①(P-110 2026-09-17) `?bindorder=legacy`：bind 世界链序回退开关（与既有 `?parspace=legacy`/`?paroff=legacy`
  //   同形）。缺省 = **子先乘**（`W[b] = L_b × W[parent]`，与 `sampleAnimRT` 同空间，见
  //   `core/puppet-skin.js::bindWorldChain` 的判据）；`legacy` = P-110 之前的"父先乘"
  //   （`W[b] = W[parent] × L_b`）—— 那是"眉毛整组翻转 / 睫毛位移 102px"的数值根因，只作 A/B 复现。
  //   影响面：`?bones=` 探针的反解基准（本文件）、demo.html 的 `bindInv`/`bindRT`、附件锚点
  //   （`parseScene` opts.attachCtx 缺省不带 ⇒ 走修正序；`?bindorder=legacy` 由 demo.html 下传）。
  //   ⚠ 判定式在 `core/puppet-skin.js::bindOrderLegacy`（唯一实现处，防四处写法漂移）；
  //   这里用 `new URLSearchParams(location.search).get('bindorder')` 的**同形写法**，便于
  //   `tests/diag-flag-check.mjs` 抓到本文件的解析点（diag-flag-check.mjs 规则 a）。
  const BIND_ORDER_LEGACY = (() => {
    try {
      const q = new URLSearchParams(location.search)
      return q.get('bindorder') === 'legacy'
    } catch (e) { return false }
  })()
  const __bonesLayers = new Map()   // layerId -> { bindWorld, buf, last, logAt }
  function __bonesWanted(layer) {
    if (!BONES_WANT) return false
    const id = String(layer && layer.id)
    const nm = String((layer && layer.name) || '')
    return BONES_WANT === id || (nm && (BONES_WANT === nm || nm.indexOf(BONES_WANT) >= 0))
  }
  // ①(P-109 任务书 P1-4 · UNTOUCHED-AREAS D 项) `?submesh=<骨筛选>`：**只读**子网格隔离探针。
  //   动机：hina 3554161528 的 37 个对象里**没有**独立眼/眉层（脸是一张 `materials/人物.tex`），
  //   用户报的"眉毛翻转/眼睛乱动"只可能是**骨/蒙皮权重**的产物；而 `?ln` 只到**层**粒度，
  //   `layer.__subMeshOnly`（P-44）是 MDL **多材质子块**维度、hina 单块 ⇒ 用不上。
  //   本探针按 `blendIndices` 把顶点按**主影响骨**分组（主影响骨 = 4 个 `blendWeights` 里最大的那根，
  //   并列取下标小的；全零权重时退回 `blendIndices[0]`），**只画"选中骨组"的顶点/三角形**（其余跳过）。
  //   筛选语法（`?submesh=` 整体，逗号分隔）：
  //     `24`（单骨）/ `24-27`（闭区间）/ `24*` / `24-27*`（`*` = 该骨 + 其在 `mesh.bones[].parent`
  //     父链下的**所有后代**，即任务书里的"只画骨 24–27 及其子骨影响的顶点"）；
  //     `all` = **只出台账、绘制逐位不变**（给"分组表/权重表对不对"做对照）；
  //     `off`/`0`/`none`/空/缺省 = **关**（默认）。
  //   三角形归属规则 `?subtri=all|major|any`（默认 `all`）：`all` = 三个顶点主骨同组（严格＝
  //     "只画本组顶点"）、`major` = ≥2 个顶点同组、`any` = ≥1 个（含边界三角形；同一三角形可被多组计入）。
  //   台账（只读，写 `globalThis.__mpwSubMesh`；与 `?bones=` 的 `__mpwBones` **互不干扰、可叠加**）：
  //     每组的顶点数/bbox/质心（bind 网格空间）+ 影响该组的骨表（含权重和）+ 主骨父链 +
  //     三种规则下的三角形数 + **蒙皮后**的位移时程（相对首帧的 (dx,dy)，skin 空间；世界设计像素
  //     = `origin + scale⊙skin`，见台账 `origin`/`scale`）+ 翻转计数（本组三角形**有向面积变号**的
  //     条数 —— "眉毛翻转"的机器可判形式，比 `?bones=` 的角度/det 判据更贴近"看得见的画变形"）
  //     + 采样时程 `hist`。
  //   默认关 ⇒ **一个字段都不写、不建分组表、不改 `drawElements` 实参**（逐位不变）。
  const SUB_WANT = (() => {
    try {
      const v = new URLSearchParams(location.search).get('submesh')
      if (v === null || v === '') return null
      const s = String(v).trim()
      return (!s || s === 'off' || s === '0' || s === 'none') ? null : s
    } catch (e) { return null }
  })()
  const SUB_TRI = (() => {
    try {
      const v = new URLSearchParams(location.search).get('subtri')
      if (v === null || v === '') return 'all'
      const s = String(v).trim().toLowerCase()
      return (s === 'all' || s === 'major' || s === 'any') ? s : 'all'
    } catch (e) { return 'all' }
  })()
  // ①(P-117 2026-09-18) `?subbase=legacy`：`?submesh=` 台账里"三角形有向面积**变号**"的**基线口径**回退。
  //   缺省（修正口径）= 基线取 **bind 姿态**（= 顶点原始绕序，直接由 `mesh.positions` 算出）⇒ 台账回答的是
  //     "这一帧有没有三角形相对**绑定姿态**翻了"，与"探针从哪一帧开始记账"无关。
  //   `legacy` = P-109 的旧口径：基线取**探针看到的第一个采样帧**。旧口径的真实缺陷（P-117 取证）：
  //     ① 会话若恰从"已经折叠/已经镜像"的那一帧开始（`?time=`、刷新时机、中途打开 `?submesh=`），基线就把
  //        **翻转态当成正常态** ⇒ 持续存在的镜像会**整个漏报**（`invert.max` 报 0，正是"越查越没事"的陷阱）；
  //     ② 同一个包的读数随开始时刻漂移（同一段动画换个起点得到不同的"翻转条数"）。
  //   判定式与既有 `?parspace=legacy`/`?bindorder=legacy` 同形（正则字面量，`diag-flag-check` 规则 c 抓取）。
  const SUB_BASE_LEGACY = (() => {
    try { return /[?&]subbase=legacy/.test(String((typeof location !== 'undefined' && location.search) || '')) } catch (e) { return false }
  })()
  const __subLayers = new Map()      // layerId -> 分组表 / 筛选索引缓存（只在 SUB_WANT 非空时建立）
  let __bonesNowT = 0    // ①(P-69) 当前帧时间（只给 ?bones 探针记账用；不影响渲染）
  let __renderSeq = 0   // 首帧审计用（每次 render 调用递增，见 opts.auditFrames）
  // ①(P-69) 粒子系统缓存（按层 id；换场景清空）+ 上一帧的场景引用
  const __partSysCache = (opts.particleSysCache instanceof Map) ? opts.particleSysCache : new Map()
  let __partSceneRef = null
  let __auditNow = false  // 当前帧是否审计（模块级，供 renderLayer 等子函数读取，避免作用域错误）
  function renderMeshLayer(layer, mesh, gBonesArr, boneCount, originXY, scaleXY, projWH, tex, opts2) {
    try {
      const prog = ensureMeshProg()
      const rec = uploadMeshLayer(layer.id, mesh)
      gl.useProgram(prog)
      setBlend('translucent')
      // ①(2026-09-12) bone 矩阵为行主序 → uniformMatrix4fv 需 transpose=true（WebGL2 支持）。
      // 层变换改用 u_Origin/u_Scale/u_Proj 在顶点着色器内直算（避免矩阵表示混用错误）。
      gl.uniformMatrix4fv(meshUni.bones, true, gBonesArr.subarray(0, boneCount * 16))
      // ①(P-69 第 4 项) ?bones= 只读探针：反解绝对世界位姿（bindWorld × gBones = RT）并记账
      try { if (BONES_WANT && __bonesWanted(layer)) __dumpBones(layer, mesh, gBonesArr, boneCount) } catch (e) { /* 探针失败不影响渲染 */ }
      // 中心补偿：wpos = origin + u_Scale·(v_raw − c) = (origin − u_Scale⊙c) + u_Scale·v_raw
      // ①(2026-09-13) 官方语义（lwe CImage / elysia renderPuppet）：MDL 顶点就是模型空间坐标，
      //   对象变换**直接**作用其上，没有"把包围盒中心搬到 origin"这一步。我们的中心补偿是为早期
      //   "网格中心 ≠ 原点"的素材打的补丁，但它会按每个网格的 bbox 中心平移 ⇒ 同一父级下的
      //   各发片/眼睛错位量各不相同。
      //   ⚠(P-76 注释修正) **补偿默认是关闭的** —— 真正的默认在 :3879 `MCC_ENABLED`（默认 false，
      //   仅 `?mcc=1` 才开）。下面那个「(−509,+593)」是**当年补偿默认开启时期**的实测值，
      //   不代表当前默认行为，勿据此推断默认路径会平移。旧注释"默认沿用开启"已过期。
      //   `?mcc=1` 强制开启（旧行为，逐壁纸 A/B 用），`?mcc=0`（= 缺省）保持官方直算。
      // ①(P-58 H1) opts2.noCenterComp：调用方（`?meshsize=1`）已经用 meshLayerFit 把
      //   "网格中心 → 实绘中心"算进 origin 了，这里再补一次就是双重校正 ⇒ 显式关闭。
      //   默认（不传 opts2 / noCenterComp 假）时逐位保持旧行为。
      const __c = mesh && mesh.__center
      const __useC = MCC_ENABLED && !!__c && !(opts2 && opts2.noCenterComp)
      const __ox = __useC ? originXY[0] - scaleXY[0] * __c[0] : originXY[0]
      const __oy = __useC ? originXY[1] - scaleXY[1] * __c[1] : originXY[1]
      gl.uniform2f(meshUni.origin, __ox, __oy)
      gl.uniform2f(meshUni.scale, scaleXY[0], scaleXY[1])
      gl.uniform2f(meshUni.proj, projWH[0], projWH[1])
      // ①(P-100 根因) 相机取景接线：`opts2.camera = { view:[vx,vy], framed:[fw,fh] }` 由
      //   `renderScene` 通过 `onMeshLayer(layer, camInfo)` 交给宿主、宿主原样转交到这里。
      //   **不传 / 非法 ⇒ u_View=(0,0)、u_Framed=projWH** ⇒ 顶点着色器与改动前**逐位相同**
      //   （u_Proj 照旧上传，语义不变：设计画布尺寸）。
      const __mc = (opts2 && opts2.camera && Array.isArray(opts2.camera.view) && Array.isArray(opts2.camera.framed)
        && isFinite(opts2.camera.framed[0]) && opts2.camera.framed[0] > 0
        && isFinite(opts2.camera.framed[1]) && opts2.camera.framed[1] > 0) ? opts2.camera : null
      gl.uniform2f(meshUni.view, __mc ? Number(__mc.view[0]) || 0 : 0, __mc ? Number(__mc.view[1]) || 0 : 0)
      gl.uniform2f(meshUni.framed, __mc ? __mc.framed[0] : projWH[0], __mc ? __mc.framed[1] : projWH[1])
      if (meshUni.vflip) gl.uniform1f(meshUni.vflip, VFLIP_FLAG)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform1i(meshUni.tex, 0)
      gl.bindVertexArray(rec.vao)
      // ①(P-41 A3 2026-09-13) 子网格隔离：layer.__subMeshOnly = 子块序号时只画该子块的索引区间
      //   （跳过其它子块）。子块表由 uploadMeshLayer 在 mesh.submeshes=[{start,count},…] 时建立；
      //   当前语料全部 MDL 为单材质块（单顶点块）→ submeshes 为空，请求时记一次日志（?ln 的 Ctrl
      //   子块维度会显示"不可拆"）——与任务书备注"眼睛组合 MDL 只有一个网格块"一致。
      const __sm = (layer.__subMeshOnly != null && rec.submeshes && rec.submeshes.length > 1) ? rec.submeshes[layer.__subMeshOnly | 0] : null
      // ①(P-109) 子网格隔离探针：**只在 `?submesh=` 打开时介入**（`SUB_WANT` 为 null 时这一行
      //   连一次函数调用都不发生 ⇒ 默认路径与改动前逐字相同；`?submesh=all` 也返回 null ⇒ 原实参）。
      let __subDraw = null
      if (SUB_WANT) { try { __subDraw = __subMeshTick(layer, mesh, rec, __sm, gBonesArr, boneCount, originXY, scaleXY, __mc) } catch (e) { __subDraw = null } }
      if (__subDraw) {
        // 筛选生效：只画命中的索引区间（`count === 0` = 该筛选下没有三角形 ⇒ **一个 draw 都不发**，
        //   ⚠ 绝不退回全量——否则"按不存在的骨号筛选"会画出整个网格，是最危险的误判）。
        if (__subDraw.count > 0) {
          gl.bindVertexArray(__subDraw.vao)
          gl.drawElements(gl.TRIANGLES, __subDraw.count, gl.UNSIGNED_SHORT, 0)
          gl.bindVertexArray(null)
        }
      } else if (__sm) gl.drawElements(gl.TRIANGLES, __sm.count, gl.UNSIGNED_SHORT, __sm.start * 2)
      else gl.drawElements(gl.TRIANGLES, rec.count, gl.UNSIGNED_SHORT, 0)
      gl.bindVertexArray(null)
    } catch (e) { try { onLog('[mesh] 绘制失败: ' + (e && e.message || e)) } catch {} }
  }

  // ①(RE-33) bloom 链程序（惰性编译：只有场景声明 bloom 时才创建）
  let bloomProgs = null
  // ①(MERGED-1 C HDR) 本帧场景浮点 RT 状态（renderScene 写、runBloom 读；独立调用 runBloom 时为 null=旧口径）
  let hdrSceneState = null
  let hdrLogged = false
  // ①(P-41 A1 2026-09-13) HDR 自动路径会话级熔断：真机实锤（hina 3554161528 上报 r1789233*），
  //   general.hdr=true 的场景在 Adreno/PRoot 设备上"整场景渲进 RGBA16F FBO"后**每层 draw 0x502**、
  //   呈现趟失败 → 画布只剩清屏灰。修法：HDR 帧逐层做 getError 前后对照（先排空旧旗标再绘制，
  //   只把"本层绘制后新出现"的错误归因），命中即本会话禁用自动 HDR 并**当场按 LDR 重渲本帧**
  //   （首帧/缩略图即正确）。?hdr=1 显式强制时不熔断（用户在诊断）；状态经 renderer.hdrFallback 进上报。
  let hdrForceLdrSession = null
  let hdrBlackTex = null
  function ensureHdrBlackTex() {
    if (hdrBlackTex) return hdrBlackTex
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]))
    hdrBlackTex = tex
    return tex
  }
  // HDR 呈现：场景 FBO → 默认 framebuffer（compose 直写语义：scene + 黑 = scene，无混合无 gamma）
  function presentHdrScene(state) {
    try {
      const progs = ensureBloomProgs()
      // ①(P-90) "屏幕"出口走 `sceneTargetFbo()`：q=off 时它就是 null（**与改动前同一次调用**），
      //   q!=off 时是内部离屏 FBO（HDR 呈现落进内部缓冲，再由 q 的上采样统一放大到画布）。
      const __dst = sceneTargetFbo()
      gl.bindFramebuffer(gl.FRAMEBUFFER, __dst)
      gl.viewport(0, 0, state.width, state.height)
      if (!progs) { // 编译失败兜底：WebGL2 blit（同为直绘）
        // ①(P-58 H0-2) WebGL2 的 blitFramebuffer 是 **10 参**（srcX0,srcY0,srcX1,srcY1,
        //   dstX0,dstY0,dstX1,dstY1,mask,filter），源/目标由 READ/DRAW_FRAMEBUFFER 绑定决定，
        //   没有 FBO 形参。旧代码把 FBO 当第 1 参传了 11 个参 → 整体错位 → INVALID_OPERATION/空 blit
        //   （正确写法见同文件 copybackground 分支）。用与那里同款的显式 READ/DRAW 绑定。
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, state.fbo.fbo)
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, __dst)
        gl.blitFramebuffer(0, 0, state.width, state.height, 0, 0, state.width, state.height, gl.COLOR_BUFFER_BIT, gl.NEAREST)
        gl.bindFramebuffer(gl.FRAMEBUFFER, __dst)
        return
      }
      gl.disable(gl.BLEND)
      gl.disable(gl.DEPTH_TEST)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, state.fbo.tex)
      gl.uniform1i(progs.uc.scene, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, ensureHdrBlackTex())
      gl.uniform1i(progs.uc.bloom, 1)
      drawFullscreen(progs.compose)
      gl.activeTexture(gl.TEXTURE0)
    } catch (e) {
      try { onLog('[hdr] 呈现失败: ' + (e && e.message)) } catch {}
    }
  }
  function ensureBloomProgs() {
    if (bloomProgs) return bloomProgs
    try {
      const extract = linkProgram(gl, BLOOM_VS, BLOOM_EXTRACT_FS)
      const blur = linkProgram(gl, BLOOM_VS, BLOOM_BLUR_FS)
      const compose = linkProgram(gl, BLOOM_VS, BLOOM_COMPOSE_FS)
      bloomProgs = {
        extract, blur, compose,
        ue: { scene: gl.getUniformLocation(extract, 'u_Scene'), texel: gl.getUniformLocation(extract, 'u_Texel'),
          threshold: gl.getUniformLocation(extract, 'u_Threshold'), feather: gl.getUniformLocation(extract, 'u_Feather'),
          strength: gl.getUniformLocation(extract, 'u_Strength'), enabled: gl.getUniformLocation(extract, 'u_Enabled'),
          tint: gl.getUniformLocation(extract, 'u_Tint'), hdr: gl.getUniformLocation(extract, 'u_Hdr') },
        ub: { tex: gl.getUniformLocation(blur, 'u_Tex'), dir: gl.getUniformLocation(blur, 'u_Dir'), step: gl.getUniformLocation(blur, 'u_Step') },
        uc: { scene: gl.getUniformLocation(compose, 'u_Scene'), bloom: gl.getUniformLocation(compose, 'u_Bloom') },
      }
    } catch (e) { bloomProgs = null; try { onLog('[bloom] 程序编译失败: ' + e.message) } catch {} }
    return bloomProgs
  }
  // 全屏直写四边形的 VAO（NDC 三角形对 + 0..1 UV）
  let bloomVao = null
  function ensureBloomVao() {
    if (bloomVao) return bloomVao
    bloomVao = gl.createVertexArray()
    gl.bindVertexArray(bloomVao)
    const vbo = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 0, 0, 1, -1, 0, 1, 0, -1, 1, 0, 0, 1,
      -1, 1, 0, 0, 1, 1, -1, 0, 1, 0, 1, 1, 0, 1, 1,
    ]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12)
    gl.bindVertexArray(null)
    return bloomVao
  }
  function drawFullscreen(prog) {
    gl.useProgram(prog)
    gl.bindVertexArray(ensureBloomVao())
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.bindVertexArray(null)
  }
  // 场景颜色拷贝纹理（从默认 framebuffer copyTexSubImage2D；尺寸变化时重建）
  let bloomSceneTex = null
  function ensureBloomSceneTex(w, h) {
    if (bloomSceneTex && bloomSceneTex.__w === w && bloomSceneTex.__h === h) return bloomSceneTex
    if (bloomSceneTex) { try { gl.deleteTexture(bloomSceneTex) } catch {} }
    const tex = gl.createTexture()
    tex.__mpwId = 'bloomScene'
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    tex.__w = w; tex.__h = h
    bloomSceneTex = tex
    return tex
  }

  // ===================================================================================
  // ①(P-90) `?aa=` 抗锯齿 pass + `?q=` 内部渲染上采样 —— 帧末后处理链的最后两段。
  //
  // 链路顺序（**与 demo.html 的帧循环一致**，也是"FXAA 真的被加入链"的判据）：
  //   renderScene（画进 内部FBO 或 默认帧缓冲）
  //     → [q!=off] presentInternalScene：内部 FBO → 默认帧缓冲（双线性上采样，1 draw）
  //     → [bloom]  runBloom（既有 4 pass，读**默认帧缓冲** ⇒ 上采样必须排在它前面）
  //     → [aa=fxaa] runAAPass：默认帧缓冲 → 拷贝纹理 → 全屏 FXAA（1 draw）
  //     → runPostFrameHooks
  // ⇒ `q` 的呈现**必须**在 `renderScene` 末尾（本文件内），而 FXAA 在 `runBloom` 之后
  //   （`runAA` 由 demo.html 调用；见 `runAA` 注释里的帧内幂等守卫）。
  //
  // FXAA 的**读写冲突**处理：FXAA 采样它要写的默认帧缓冲。用与 bloom 同款手法 ——
  // `copyTexSubImage2D` 先把帧缓冲回读进一张纹理，再以该纹理为输入直写帧缓冲。
  // 上游同样是"输入是 captureBackdrop 的画布回读纹理"（`renderer-glsl.js:449-451` 注释）。
  // ===================================================================================
  let aaProgs = null
  function ensureAaProgs() {
    if (aaProgs) return aaProgs
    try {
      const fxaa = linkProgram(gl, BLOOM_VS, FXAA_FS)
      const present = linkProgram(gl, BLOOM_VS, Q_PRESENT_FS)
      aaProgs = {
        fxaa, present,
        uf: { tex: gl.getUniformLocation(fxaa, 'u_Tex'), texel: gl.getUniformLocation(fxaa, 'u_Texel') },
        up: { tex: gl.getUniformLocation(present, 'u_Tex') },
      }
    } catch (e) { aaProgs = null; try { onLog('[P-90] AA/呈现程序编译失败: ' + (e && e.message)) } catch {} }
    return aaProgs
  }
  // FXAA 输入纹理（默认帧缓冲回读；尺寸变化时重建）——与 bloomSceneTex 分开持有：
  // 两者尺寸语义不同（本张按**画布**尺寸），且 bloom 可能在 FXAA 之前已绑定过自己的那张。
  let aaSceneTex = null
  function ensureAaSceneTex(w, h) {
    if (aaSceneTex && aaSceneTex.__w === w && aaSceneTex.__h === h) return aaSceneTex
    if (aaSceneTex) { try { gl.deleteTexture(aaSceneTex) } catch {} }
    const tex = gl.createTexture()
    tex.__mpwId = 'aaScene'
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    tex.__w = w; tex.__h = h
    aaSceneTex = tex
    return tex
  }
  // 帧内幂等守卫：`runAA` 一帧只跑一次（demo.html 与外部扩展都可能在帧末调它；
  // 二次调用会是"对已 FXAA 过的画面再 FXAA 一遍"= 过度模糊且多一次 draw）。
  // 初值 `0/0` 表示"**还没渲染过任何一帧**" ⇒ `runAA` 在首帧 `renderScene` 之前是空操作
  // （否则会对一块没画过的画布做回读 + 滤波）。
  let aaFrameToken = 0
  let aaFrameSeq = 0
  let aaRuns = 0
  /**
   * 帧末 FXAA pass。**只在 `aaLive.mode === 'fxaa'` 时做事**；其余档（off / 原生 MSAA）
   * 立即返回 `false`（零 GL 调用 ⇒ `?aa=off` 与改动前逐位一致）。
   * @returns {boolean} 本帧是否真的画了 FXAA pass
   */
  function runAAPass(width, height) {
    if (aaLive.mode !== 'fxaa') return false
    if (aaFrameToken === aaFrameSeq) return false   // 本帧已跑过（幂等）
    const progs = ensureAaProgs()
    if (!progs) return false
    aaFrameToken = aaFrameSeq
    try {
      const tex = ensureAaSceneTex(width, height)
      // ① 回读当前（默认）帧缓冲 → 纹理。必须在**未绑定 FBO** 时调用。
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, width, height)
      // ② 全屏 FXAA 直写（alpha 恒 1、禁混合、禁深度 ⇒ 覆盖写）
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, width, height)
      gl.disable(gl.BLEND)
      gl.disable(gl.DEPTH_TEST)
      gl.useProgram(progs.fxaa)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform1i(progs.uf.tex, 0)
      gl.uniform2f(progs.uf.texel, 1 / Math.max(1, width), 1 / Math.max(1, height))
      gl.bindVertexArray(ensureBloomVao())
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.bindVertexArray(null)
      aaRuns++
      if (aaRuns === 1) {
        try {
          onLog('[P-90] FXAA pass 已接入帧末后处理链 ' + width + 'x' + height
            + '（输入=画布回读纹理，1 次全屏 draw；?aa=off 时不建程序、不画）')
        } catch (e) {}
      }
      return true
    } catch (e) {
      try { onLog('[P-90] FXAA pass 失败，本帧跳过: ' + (e && e.message)) } catch {}
      return false
    }
  }
  /** `q != off`：内部离屏 FBO → 默认帧缓冲（双线性上采样）。返回是否画了。 */
  function presentInternalScene(state) {
    if (!state || !state.fbo) return false
    try {
      const progs = ensureAaProgs()
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, state.outW, state.outH)
      if (!progs) {   // 程序编译失败兜底：WebGL2 blit（与 presentHdrScene 同款显式 READ/DRAW 绑定）
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, state.fbo.fbo)
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
        gl.blitFramebuffer(0, 0, state.w, state.h, 0, 0, state.outW, state.outH, gl.COLOR_BUFFER_BIT, gl.LINEAR)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        try { onLog('[P-90] q 上采样回退 blitFramebuffer（呈现程序不可用）') } catch {}
        return true
      }
      gl.disable(gl.BLEND)
      gl.disable(gl.DEPTH_TEST)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, state.fbo.tex)
      gl.uniform1i(progs.up.tex, 0)
      gl.bindVertexArray(ensureBloomVao())
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.bindVertexArray(null)
      return true
    } catch (e) {
      try { onLog('[P-90] q 上采样失败: ' + (e && e.message)) } catch {}
      return false
    }
  }

  const partUni = {
    mvp: gl.getUniformLocation(particleProg, 'u_MVP'),
    tex: gl.getUniformLocation(particleProg, 'u_Tex'),
    color: gl.getUniformLocation(particleProg, 'u_Color'),
    alpha: gl.getUniformLocation(particleProg, 'u_Alpha'),
    // ①(P-65) TEX0FORMAT：贴图 .tex format id（-1 = 未知 → 透传分支，与旧行为逐位一致）
    fmt: gl.getUniformLocation(particleProg, 'u_TexFmt'),
  }

  const quadBatchVBO = gl.createBuffer()
  // 粒子 batch 专用 VAO。修复(2026-09-10)前借用主 vao（5 float stride）导致逐粒子 alpha
  // 无法入顶点——u_Alpha 恒 1，全部粒子全不透明（官方 genericparticle：alpha = v_Color.a）。
  // ①(RE-31) stride 扩到 36：pos3 + uv2 + uv2B(下一帧) + blend + alpha（精灵表帧间混合）。
  const PARTICLE_STRIDE = 36
  // ①(P-126 A) 逐粒子颜色走**独立顶点缓冲**（3 float/顶点、连续无交错）：
  //   几何缓冲保持 36B 交错布局不变 ⇒ 既有 mock-GL 顶点流断言、`render-audit` 参考产物、
  //   `particle-shape-audit` 的形状解析全部逐位不变（改动只新增一个属性，不改老属性）。
  const PARTICLE_COLOR_STRIDE = 12
  const partColorVBO = gl.createBuffer()
  const partVao = gl.createVertexArray()
  const partAlphaLoc = gl.getAttribLocation(particleProg, 'a_Alpha')
  const partUvBLoc = gl.getAttribLocation(particleProg, 'a_TexCoordB')
  const partBlendLoc = gl.getAttribLocation(particleProg, 'a_Blend')
  const partColorLoc = gl.getAttribLocation(particleProg, 'a_Color')
  gl.bindVertexArray(partVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBatchVBO)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, PARTICLE_STRIDE, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, PARTICLE_STRIDE, 12)
  if (partUvBLoc >= 0) {
    gl.enableVertexAttribArray(partUvBLoc)
    gl.vertexAttribPointer(partUvBLoc, 2, gl.FLOAT, false, PARTICLE_STRIDE, 20)
  }
  if (partBlendLoc >= 0) {
    gl.enableVertexAttribArray(partBlendLoc)
    gl.vertexAttribPointer(partBlendLoc, 1, gl.FLOAT, false, PARTICLE_STRIDE, 28)
  }
  if (partAlphaLoc >= 0) {
    gl.enableVertexAttribArray(partAlphaLoc)
    gl.vertexAttribPointer(partAlphaLoc, 1, gl.FLOAT, false, PARTICLE_STRIDE, 32)
  }
  // ①(P-126 A) a_Color：独立 VBO（stride 12、offset 0）。`getAttribLocation` 返回 -1 时
  //   （程序里没有该属性，或 mock-GL 不认识该名字）不启用 —— 此时靠 `u_Color` 上提值兜住"整批同色"。
  if (partColorLoc >= 0) {
    gl.bindBuffer(gl.ARRAY_BUFFER, partColorVBO)
    gl.enableVertexAttribArray(partColorLoc)
    gl.vertexAttribPointer(partColorLoc, 3, gl.FLOAT, false, PARTICLE_COLOR_STRIDE, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBatchVBO)
  }
  gl.bindVertexArray(null)
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const vbuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12)
  gl.bindVertexArray(null)

  // FBO 缓存（tag 区分用途：乒乓 A/B 必须是两个独立实例；同一 tag+尺寸复用）
  const fboCache = new Map()
  function getFBO(w, h, tag, fopts = null) {
    // ①(修复) 零尺寸防线：0×0 纹理被绑定采样 → Adreno 0x502（GirlCat lens_flare T0=tex0x0 实锤）
    w = Math.max(1, Math.round(w) || 1)
    h = Math.max(1, Math.round(h) || 1)
    // ①(MERGED-1 C HDR 2026-09-12) fopts.float='half'|'full' → RGBA16F/RGBA32F 浮点 RT
    //   （half 优先：可混合无需 EXT_float_blend；完整性检查沿用，不完整回退 1x1 并清掉 .hdr 标记）
    const floatMode = fopts && (fopts.float === 'half' || fopts.float === 'full') ? fopts.float : null
    const key = (tag || '') + '|' + w + 'x' + h + (floatMode ? '|' + floatMode : '')
    if (fboCache.has(key)) return fboCache.get(key)
    const mkTex = (tw, th, fl) => {
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      if (fl === 'half') gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, tw, th, 0, gl.RGBA, gl.HALF_FLOAT, null)
      else if (fl === 'full') gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, tw, th, 0, gl.RGBA, gl.FLOAT, null)
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      return tex
    }
    const fbo = gl.createFramebuffer()
    const tex = mkTex(w, h, floatMode)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    const fboStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (fboStatus !== gl.FRAMEBUFFER_COMPLETE) {
      // 尺寸为 0/过大的 FBO 会不完整 → 退回 1x1 占位，避免 0x502/0x506 连锁
      try { onLog('[we-scene] FBO 不完整 ' + w + 'x' + h + ' status=0x' + fboStatus.toString(16) + '（tag=' + (tag || '?') + '），回退 1x1') } catch {}
      gl.deleteFramebuffer(fbo)
      gl.deleteTexture(tex)
      const fbo2 = gl.createFramebuffer()
      const tex2 = mkTex(1, 1, floatMode)
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo2)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex2, 0)
      const st2 = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      // 浮点 1x1 也不完整（设备不支持浮点渲染）→ 再退 RGBA8 并清除 .hdr（调用方据此走 LDR）
      let hdrOut = floatMode
      if (st2 !== gl.FRAMEBUFFER_COMPLETE) {
        try { onLog('[we-scene] 浮点 FBO 1x1 仍不完整 status=0x' + st2.toString(16) + '，回退 RGBA8') } catch {}
        gl.deleteFramebuffer(fbo2)
        gl.deleteTexture(tex2)
        const fbo3 = gl.createFramebuffer()
        const tex3 = mkTex(1, 1, null)
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo3)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex3, 0)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        hdrOut = null
        const entry = { fbo: fbo3, tex: tex3, width: 1, height: 1, hdr: null }
        fboCache.set(key, entry)
        return entry
      }
      const entry = { fbo: fbo2, tex: tex2, width: 1, height: 1, hdr: hdrOut }
      fboCache.set(key, entry)
      return entry
    }
    const entry = { fbo, tex, width: w, height: h, hdr: floatMode }
    fboCache.set(key, entry)
    return entry
  }

  // 效果 shader 缓存：key = shaderName + '|' + JSON.stringify(combos)
  const progCache = new Map()
  const includeCache = new Map()
  const shaderSrcCache = new Map()
  // 解析 material 元数据：uniform 声明行注释里的 {"material":"speedx","default":1} → { speedx: { uniform, default } }
  function parseMaterialMeta(src) {
    const meta = {}
    const re = /uniform\s+[A-Za-z0-9_]+\s+([A-Za-z_][A-Za-z0-9_]*)[^;]*;\s*\/\/([^\n]*)/g
    let m
    while ((m = re.exec(src)) !== null) {
      const uniformName = m[1]
      const comment = m[2]
      const mat = /"material"\s*:\s*"([^"]+)"/.exec(comment)
      if (!mat) continue
      const def = /"default"\s*:\s*("(?:[^"]*)"|-?\d+(?:\.\d+)?)/.exec(comment)
      meta[mat[1]] = { uniform: uniformName, default: def ? parseDefaultValue(def[1]) : undefined }
    }
    return meta
  }
  // 纹理关联 combo：sampler uniform 注释声明 combo，且该槽提供了纹理 → combo = 1（ShaderUnit.cpp:545-617）
  function parseTextureCombos(src) {
    const out = []
    const re = /uniform\s+sampler2D\s+(g_Texture(\d+))[^;]*;\s*\/\/([^\n]*)/g
    let m
    while ((m = re.exec(src)) !== null) {
      const combo = /"combo"\s*:\s*"([^"]+)"/.exec(m[3])
      if (combo) out.push({ slot: Number(m[2]), name: m[1], combo: combo[1] })
    }
    return out
  }
  function parseDefaultValue(s) {
    if (s.startsWith('"')) return s.slice(1, -1)
    const n = Number(s)
    return Number.isFinite(n) ? n : undefined
  }
  async function getEffectProgram(shaderName, combos, providedTextures) {
    // shader 源与纹理 combo 按名缓存：避免每帧每 pass 重新 fetch/正则
    let src = shaderSrcCache.get(shaderName)
    if (src === undefined) {
      const fragSrc = (await shaderResolver('shaders/' + shaderName + '.frag')) || ''
      const vertSrc = (await shaderResolver('shaders/' + shaderName + '.vert')) || ''
      // ①(P-134 ⑥ 第三处) 同一材质 pass 的 vert/frag = **一张** combo 表（官方语义，见
      //   `withSiblingComboDefaults` 的注释）：各自补上对方独有的 `[COMBO]` 声明再编译，
      //   否则只在 .vert 里声明的 combo（如 `Simple_Audio_Bars` 的 `BAR_STYLE`）在 frag 里按 0 编译，
      //   顶点/片元几何口径不一致。`texCombos` 仍按**原始** frag 解析（纹理槽声明只在 frag 里）。
      src = { frag: withSiblingComboDefaults(fragSrc, vertSrc), vert: withSiblingComboDefaults(vertSrc, fragSrc), texCombos: parseTextureCombos(fragSrc) }
      shaderSrcCache.set(shaderName, src)
    }
    // 纹理关联 combo 并入 combos（有显式值则不覆盖）
    const effectiveCombos = { ...combos }
    for (const tc of src.texCombos) {
      if (providedTextures && providedTextures[tc.slot] && effectiveCombos[tc.combo] === undefined) {
        effectiveCombos[tc.combo] = 1
      }
    }
    const key = shaderName + '|' + JSON.stringify(effectiveCombos)
    if (progCache.has(key)) return progCache.get(key)
    // include 同步缓存：miss 时记录并补拉，重试转译
    for (let attempt = 0; attempt < 4; attempt++) {
      const missing = new Set()
      const resolver = (file) => {
        if (includeCache.has(file)) return includeCache.get(file)
        missing.add(file)
        return null
      }
      const fragGlsl = hlsl2glsl(src.frag, 'frag', effectiveCombos, resolver)
      const vertGlsl = hlsl2glsl(src.vert, 'vert', effectiveCombos, resolver)
      if (missing.size === 0) {
        let prog
        try {
          prog = linkProgram(gl, vertGlsl, fragGlsl)
        } catch (e) {
          throw new Error('shader=' + shaderName + ' ' + (e && e.message))
        }
        const uni = new Map()
        const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
        for (let i = 0; i < n; i++) {
          const info = gl.getActiveUniform(prog, i)
          const base = info.name.replace(/\[0\]$/, '')
          uni.set(base, { loc: gl.getUniformLocation(prog, info.name), type: GL_TYPES[info.type] || 'unknown' })
        }
        const matMeta = { ...parseMaterialMeta(src.vert), ...parseMaterialMeta(src.frag) }
        const entry = { prog, uni, matMeta, fragGlsl, vertGlsl }
        progCache.set(key, entry)
        return entry
      }
      await Promise.all(Array.from(missing).map(async (f) => {
        includeCache.set(f, (await shaderResolver('shaders/' + f)) || '')
      }))
    }
    throw new Error('include 解析失败: ' + shaderName)
  }

  const whiteTex = makeTexture(gl, new Uint8Array([255, 255, 255, 255]), 1, 1)
  // 无纹理的非 solid 层（纯效果层/文字对象层）：WE 语义为空层内容透明（白会导致纯白方块）
  const transparentTex = makeTexture(gl, new Uint8Array([0, 0, 0, 0]), 1, 1)
  // 失败层/失败 pass 去重日志（每帧都可能重试，只报一次避免刷屏）
  const layerErrorLogged = new Set()
  const passErrorLogged = new Set()

  // ---- 视差（cameraparallax + 对象 parallaxDepth）----
  // ①(RE-24 2026-09-14 修正) parallaxState 存**归一化鼠标**(0..1，默认画布中心 0.5)。
  //   本仓库自己的坐标系推导（y-down 世界空间）：
  //     鼠标相对画布中心的归一化偏移 = (0.5 − mx, 0.5 − my)
  //     乘正交投影尺寸换算成世界像素      → ·(orthoW, orthoH)
  //     再乘鼠标影响系数 influence        → 得 mouse_vec
  //   y 分量符号由本项目的 y-down 约定决定（parseScene 期已做 PROJ_H−y 翻转）。
  //   此前 bug：状态存 (client/size−0.5) 且未乘 ortho（3840 倍量级差）→ 鼠标视差几乎不可见。
  const parallaxState = { x: 0.5, y: 0.5 }
  let lastParallaxTime = 0
  let parDispX = 0
  let parDispY = 0
  let parAmount = 0
  let parEnabled = false
  // ①(P-100) 角色层适配档（`?charfit=`，见 `charfitModeFrom`）：每帧在 `renderScene` 里按
  //   `opts.charfit` > `?charfit=` 解析一次，`compositeLayer` 消费（避免逐层重复解析）。
  let charfitMode = 'auto'
  let parallaxAttached = false
  function attachParallaxListener() {
    if (parallaxAttached || typeof window === 'undefined' || !window.addEventListener) return
    parallaxAttached = true
    window.addEventListener('mousemove', (ev) => {
      const w = window.innerWidth || 1
      const h = window.innerHeight || 1
      parallaxState.x = Math.max(0, Math.min(1, ev.clientX / w))
      parallaxState.y = Math.max(0, Math.min(1, ev.clientY / h))
    })
  }
  // 层视差缩放（每帧由 renderScene 更新）
  
  // ---------- uniform 设置 ----------
  function setVal(uni, name, setter) {
    const u = uni.get(name)
    if (u && u.loc !== null) setter(u.loc, u.type)
  }
  function parseVecValue(v) {
    if (typeof v === 'number') return [v, v, v, v]
    const p = String(v).trim().split(/\s+/).map(Number)
    return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] || 0]
  }
  function setConstant(uni, name, value) {
    const u = uni.get(name)
    if (!u || u.loc === null) return
    const raw = value && value.value !== undefined ? value.value : value
    const arr = parseVecValue(raw)
    switch (u.type) {
      case 'float': gl.uniform1f(u.loc, arr[0]); break
      case 'int':
      case 'bool': gl.uniform1i(u.loc, raw === true || raw === 1 ? 1 : Math.round(arr[0])); break
      case 'vec2': gl.uniform2f(u.loc, arr[0], arr[1]); break
      case 'vec3': gl.uniform3f(u.loc, arr[0], arr[1], arr[2]); break
      case 'vec4': gl.uniform4f(u.loc, arr[0], arr[1], arr[2], arr[3]); break
      case 'mat4': gl.uniformMatrix4fv(u.loc, false, IDENT_M4); break
      case 'mat3': gl.uniformMatrix3fv(u.loc, false, IDENT_M3); break
      default: break
    }
  }
  const mat3Identity = () => new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])

  function bindSystemUniforms(uni, layer, time, projW, projH, mvp, modelM, viewProjM, resolutions, outW, outH) {
    setVal(uni, 'g_Time', (l) => gl.uniform1f(l, time))
    setVal(uni, 'g_Daytime', (l) => gl.uniform1f(l, 0))
    setVal(uni, 'g_ModelViewProjectionMatrix', (l) => gl.uniformMatrix4fv(l, false, mvp))
    setVal(uni, 'g_ModelMatrix', (l) => gl.uniformMatrix4fv(l, false, modelM))
    setVal(uni, 'g_ViewProjectionMatrix', (l) => gl.uniformMatrix4fv(l, false, viewProjM))
    setVal(uni, 'g_ModelViewProjectionMatrixInverse', (l) => gl.uniformMatrix4fv(l, false, IDENT_M4))
    setVal(uni, 'g_Brightness', (l) => gl.uniform1f(l, layer.brightness))
    setVal(uni, 'g_UserAlpha', (l) => gl.uniform1f(l, layer.alpha))
    setVal(uni, 'g_Alpha', (l) => gl.uniform1f(l, layer.alpha))
    setVal(uni, 'g_Color', (l) => gl.uniform3f(l, layer.color[0], layer.color[1], layer.color[2]))
    setVal(uni, 'g_Color4', (l) => gl.uniform4f(l, layer.color[0], layer.color[1], layer.color[2], 1))
    setVal(uni, 'g_CompositeColor', (l) => gl.uniform3f(l, layer.color[0], layer.color[1], layer.color[2]))
    setVal(uni, 'g_TexelSize', (l) => gl.uniform2f(l, 1 / projW, 1 / projH))
    setVal(uni, 'g_TexelSizeHalf', (l) => gl.uniform2f(l, 0.5 / projW, 0.5 / projH))
    setVal(uni, 'g_TextureReductionScale', (l) => gl.uniform1f(l, 1))
    // WER-ALIGN F9（wer-ref WPShaderValueUpdater.cpp:684-687）：g_Screen=(输出宽,输出高,宽/高比)
    const sw = outW || projW, sh = outH || projH
    setVal(uni, 'g_Screen', (l) => gl.uniform3f(l, sw, sh, sw / sh))
    setVal(uni, 'g_PointerPosition', (l) => gl.uniform2f(l, 0, 0))
    setVal(uni, 'g_PointerPositionLast', (l) => gl.uniform2f(l, 0, 0))
    for (let i = 0; i < 8; i++) {
      setVal(uni, 'g_Texture' + i, (l) => gl.uniform1i(l, i))
    }
    for (const [i, res] of resolutions) {
      setVal(uni, 'g_Texture' + i + 'Resolution', (l) => gl.uniform4f(l, res[0], res[1], res[2], res[3]))
    }
  }

  // constantshadervalues 的键是 material 名 → 经 matMeta 映射到 uniform 名并设值；缺省用注释 default
  function bindConstants(uni, constants, matMeta) {
    for (const [matKey, value] of Object.entries(constants || {})) {
      const entry = matMeta && matMeta[matKey]
      if (!entry) continue
      setConstant(uni, entry.uniform, value)
    }
    // 未提供的常数用 shader 注释里的 default
    for (const [matKey, entry] of Object.entries(matMeta || {})) {
      if (!constants || !(matKey in constants)) {
        if (entry.default !== undefined) setConstant(uni, entry.uniform, entry.default)
      }
    }
  }

  // ①(P-134 ⑥ 第二处) 效果 shader 的音频频谱 uniform `g_AudioSpectrum{16,32,64}{Left,Right}`。
  //   官方语义（行为对照：`references/wer-ref` GPL-2.0-only 的 `WPShaderValueUpdater.cpp:726-793`）：
  //   频谱源按 16/32/64 三个分辨率**各上传一组**，且**只上传该程序里真的存在**的 uniform；
  //   没有音频源时一个都不写（uniform 保持 GL 初值 0）。此前渲染器**从不设置**它们 ⇒ 音频条类效果
  //   （`enhanced_simple_audio_bars` 的 `bar = u_AudioSpectrum*[...]`）恒为 0 ⇒ 修好主修后整层会
  //   "什么都不画"（对比度：官方是有音乐才出条）。
  //   数据源 = 宿主注入的 16 段活视图（`setAudioBands()`，与粒子 `audioprocessing*` **同源同曲线**）：
  //     · 没有活视图 / 视图 `hasSource=false`（`?bandfeed=off`、`auto` 档无音轨无麦克风）⇒ **一个都不写**
  //       ⇒ 与接线前逐位相同（`?bandfeed=off` 下 demo 不注入 ⇒ 行为零变化）；
  //     · 有数据源 ⇒ 16 段直取，32/64 段用 `resampleBands`（同一实现处，均值重采样；16→32/64 是
  //       频段复制上采样）——官方是 64 段源按峰值重采样（`WPShaderValueUpdater.cpp` 的
  //       `PeakResampleSpectrum`），我们只有 16 段源 ⇒ 数值曲线差异属**未证实项**（见台账）。
  //   缓冲区**复用**（每帧每 pass 不分配）：一次重采样写满 64 槽，三个分辨率共用同一批缓冲。
  const AUDIO_SPECTRUM_UNIFORMS = [
    [16, 'g_AudioSpectrum16Left', 'g_AudioSpectrum16Right'],
    [32, 'g_AudioSpectrum32Left', 'g_AudioSpectrum32Right'],
    [64, 'g_AudioSpectrum64Left', 'g_AudioSpectrum64Right'],
  ]
  const AUDIO_SPECTRUM_BUF = new Map()
  /** 按活视图写入存在的音频频谱 uniform；返回写入的 uniform 个数（0 = 无数据源 ⇒ 一个都没写）。 */
  function bindAudioSpectrum(uni) {
    const v = AUDIO_BANDS_VIEW
    if (!v || !v.hasSource || !v.left || !v.left.length) return 0
    const right = v.right && v.right.length ? v.right : v.left
    let wrote = 0
    for (const [n, lName, rName] of AUDIO_SPECTRUM_UNIFORMS) {
      let buf = AUDIO_SPECTRUM_BUF.get(n)
      if (!buf) { buf = { left: new Float32Array(n), right: new Float32Array(n) }; AUDIO_SPECTRUM_BUF.set(n, buf) }
      resampleBands(v.left, n, buf.left)
      resampleBands(right, n, buf.right)
      for (const [name, arr] of [[lName, buf.left], [rName, buf.right]]) {
        const u = uni.get(name)
        if (u && u.loc !== null) { gl.uniform1fv(u.loc, arr); wrote++ }
      }
    }
    return wrote
  }

  function resolveTextureName(name, inputFBO, effectFBOs, textures) {
    if (name === null || name === undefined || name === '') return null
    if (name.startsWith('_rt_')) {
      if (name.startsWith('_rt_imageLayerComposite')) return inputFBO
      if (effectFBOs.has(name)) return effectFBOs.get(name)
      return null
    }
    return textures.get(name) || null
  }


  // 按程序活动属性重建指针尺寸：WE 效果着色器有 vec3 a_Position（而默认 VAO 是 vec2 指针）——
  // 规范允许但部分驱动(Adreno/ANGLE)在 draw 时抛 0x502/0x501。按 gl.getActiveAttrib 实际尺寸配指针。
  const progVAO = new Map()
  // 修复(2026-09-10)：效果 pass 改用独立 fxVao——此前在共享主 vao 上把 attribute 指针重指到
  // quadVBO（VAO 在设置时刻捕获 buffer 绑定，成为持久状态），此后 compositeLayer/copy pass
  // 只向 vbuf 传数据但绘制仍读 quadVBO（内容=PASS_QUAD NDC quad）→ 效果层合成及其后所有
  // 直绘层被缩成 ~2×2px 角落小点（"效果层透明"的根因）。主 vao 指针从此不再被动。
  const fxVao = gl.createVertexArray()
  // 效果 pass 顶点独立缓冲：fxVao 的 attribute 指针在设置时刻捕获此 buffer（VAO 持久状态）。
  // 修复(2026-09-10)：此前 quadVBO 未声明 → bindVAOFor 首次调用即抛 ReferenceError（被
  // try/catch 静默吞掉）→ fxVao 始终为空 VAO → pass 顶点全落常量 (0,0,0,1)（NDC 原点退化）
  // → 效果 FBO 保持初始透明黑 → 合成 alpha=max(0,base)=base → fx 层整体隐形（灰层根因）。
  const quadVBO = gl.createBuffer()
  let fxCfgKey = ''
  function bindVAOFor(prog, verts, count) {
    gl.bindVertexArray(fxVao)
    let cfg = progVAO.get(prog)
    if (!cfg) {
      cfg = { pos: 2, uv: 2, key: '' }
      try {
        const n = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES)
        for (let i = 0; i < n; i++) {
          const info = gl.getActiveAttrib(prog, i)
          const loc = gl.getAttribLocation(prog, info.name)
          if (loc === 0 || loc === 1) {
            // 修复(2026-09-10)：getActiveAttrib().size 是数组元素个数（非数组属性恒为 1），
            // 分量数必须按 type 换算——此前 size=1/stride=8 → 顶点退化线（潜伏第二处同因）
            const ncomp = { [gl.FLOAT]: 1, [gl.FLOAT_VEC2]: 2, [gl.FLOAT_VEC3]: 3, [gl.FLOAT_VEC4]: 4 }[info.type] || 2
            if (loc === 0) cfg.pos = ncomp
            else cfg.uv = ncomp
          }
        }
      } catch {}
      cfg.key = cfg.pos + '|' + cfg.uv
      progVAO.set(prog, cfg)
    }
    // 指针绑定按布局键切换：vec2/vec3 a_Position 混用（不同 prog）时必须重设
    if (cfg.key !== fxCfgKey) {
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, cfg.pos, gl.FLOAT, false, (cfg.pos + cfg.uv) * 4, 0)
      gl.enableVertexAttribArray(1)
      gl.vertexAttribPointer(1, cfg.uv, gl.FLOAT, false, (cfg.pos + cfg.uv) * 4, cfg.pos * 4)
      fxCfgKey = cfg.key
    }
    // 顶点数据按布局（pos+uv）上传
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO)
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW)
    return count
  }

  // ---------- 绘制辅助 ----------
  // 静态 quad 单例 + 变更才上传：避免每帧每 pass 新建 Float32Array 与 bufferData
  const PASS_QUAD = passQuadVerts()
  const LOCAL_QUAD = localQuadVerts()
  const layerQuadCache = new Map()
  // 裁剪窗 quad（cropoffset 语义）：几何=窗大小、窗心对齐层中心+偏移，UV=0..1
  function uvQuadVerts(uvRect, fboW, fboH) {
    const u0 = uvRect[0], v0 = uvRect[1], u1 = uvRect[2], v1 = uvRect[3]
    const uw = u1 - u0, uh = v1 - v0
    const ox = ((u0 + u1) / 2 - 0.5), oy = ((v0 + v1) / 2 - 0.5)
    const px = (x) => x * (uw * fboW) + ox * fboW
    const py = (y) => y * (uh * fboH) + oy * fboH
    return new Float32Array([
      px(-0.5), py(-0.5), 0, 0, 1,
      px(-0.5), py(0.5), 0, 0, 0,
      px(0.5), py(-0.5), 0, 1, 1,
      px(0.5), py(-0.5), 0, 1, 1,
      px(-0.5), py(0.5), 0, 0, 0,
      px(0.5), py(0.5), 0, 1, 0,
    ])
  }
  function layerQuad(w, h) {
    const key = w + 'x' + h
    let q = layerQuadCache.get(key)
    if (q === undefined) {
      q = layerQuadVerts(w, h)
      layerQuadCache.set(key, q)
    }
    return q
  }
  let currentQuadKey = null
  const qflipCache = new Map()
  function uploadQuad(key, verts) {
    if (QFLIP && String(key).indexOf('pass') !== 0) {
      let f = qflipCache.get(key)
      if (!f) {
        f = Float32Array.from(verts)
        for (let i = 4; i < f.length; i += 5) f[i] = 1 - f[i]
        qflipCache.set(key, f)
      }
      verts = f
    }
    if (currentQuadKey === key) return
    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf)
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW)
    currentQuadKey = key
  }

  // copy/composite 程序 uniform 位置缓存（每帧查找 → 一次初始化）
  const copyUni = {
    mvp: gl.getUniformLocation(copyProg, 'u_MVP'),
    tex: gl.getUniformLocation(copyProg, 'u_Tex'),
    color: gl.getUniformLocation(copyProg, 'u_Color4'),
  }
  const compUni = {
    mvp: gl.getUniformLocation(compProg, 'u_MVP'),
    tex: gl.getUniformLocation(compProg, 'u_Tex'),
  }
  const IDENT_M4 = mat4Identity()
  const IDENT_M3 = mat3Identity()
  function setBlend(mode) {
    if (mode === 'translucent') {
      gl.enable(gl.BLEND)
      // WER-ALIGN E1：对齐 wer-ref PassCommon.hpp:23-27 —— translucent RGB 与 Alpha 均
      // (SRC_ALPHA, ONE_MINUS_SRC_ALPHA)。此前 alpha 用 (ONE, ONE_MINUS_SRC_ALPHA)（旧二进制表），
      // 离屏 FBO 的 alpha 累积偏大；RGB 不变 → 画布(alpha:false)观感不变。
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    } else if (mode === 'additive') {
      gl.enable(gl.BLEND)
      // WER-ALIGN E1：wer-ref PassCommon.hpp:29-33 additive RGB/Alpha 均 (SRC_ALPHA, ONE)（已一致）
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.SRC_ALPHA, gl.ONE)
    } else {
      // WER-ALIGN E2：官方 Normal=(ONE,ZERO) 固定替换混合；disable(BLEND) 输出等价
      gl.disable(gl.BLEND)
    }
  }
  function drawQuad(prog, fbo, w, h, verts, mvp, blending) {
    gl.useProgram(prog)
    setBlend(blending)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo ? fbo.fbo : null)
    gl.viewport(0, 0, w, h)
    gl.bindVertexArray(vao)
    uploadQuad('draw', verts)
    const loc = gl.getUniformLocation(prog, 'u_MVP')
    gl.uniformMatrix4fv(loc, false, mvp)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
      traceChk('copyprog-draw')
  }

  // ---------- 合成（层 → 画布） ----------
  // ── W1③(P-36) 可绘制性校验（drawArrays 前置门卫）──
  // 三项：采样纹理必须是合法 GL 纹理对象（isTexture，mock-GL 无此 API 时视为通过）；
  // 无反馈环（采样纹理 ≠ 绘制目标 FBO 的颜色附件，同帧采样-绘制=UB，Adreno 0x502）；
  // 由调用方传入的 why（尺寸退化等）。不合法 → 跳过绘制并记一条上报（key 去重）。
  const drawGuardSkipped = new Set()
  function drawGuard(where, inputTex, dstRt, tag, why) {
    let reason = why || null
    try {
      // isTexture 只在**明确 false** 时拦截：真机返回 true/false；mock-GL 代理对任意方法名
      // 返回 undefined（未实现）→ 视为通过，本地审计语义不变。
      if (!reason && inputTex && typeof gl.isTexture === 'function' && gl.isTexture(inputTex) === false) reason = 'tex-invalid'
      if (!reason && inputTex && dstRt && dstRt.tex && inputTex === dstRt.tex) reason = 'feedback-loop'
    } catch (e) { reason = null } // 判定本身异常 → 保守放行（照常绘制）
    if (reason) {
      const key = where + '::' + reason + '::' + (tag || '')
      if (!drawGuardSkipped.has(key)) {
        drawGuardSkipped.add(key)
        try { onLog('[we-scene] 跳过不可绘制(' + reason + '): ' + where + (tag ? ' [' + tag + ']' : '')) } catch {}
      }
      return false
    }
    return true
  }
  function compositeLayer(prog, inputTex, color4, layer, cam, viewProj, width, height, time) {
    // ①(2026-09-12 用户："hina 空白 + GPU错误0x502"）**退化层不发绘制**：
    //   真机上 `层 "79"`（无纹理、size=0x0、origin 有效）与 `层 "背景"` 各抛一次
    //   GL_INVALID_OPERATION(0x502) —— 0 尺寸四边形/非法纹理绑定会让这一帧的 GL 状态被污染
    //   （后续绘制可能整帧丢弃 → 空白）。这里在进入绘制前挡掉 w/h≤0 的退化四边形。
    //   ①(P-36) 改走 drawGuard：跳过时记一条上报（原先静默 return，无法对号）。
    try {
      const __w = Math.abs((layer.size && layer.size[0] || 0) * (layer.scale && layer.scale[0] || 1))
      const __h = Math.abs((layer.size && layer.size[1] || 0) * (layer.scale && layer.scale[1] || 1))
      if (!drawGuard('compositeLayer', inputTex, null, String(layer.name || layer.id), (!(__w > 0.5) || !(__h > 0.5)) ? 'degenerate' : null)) return
    } catch { /* 尺寸取不到 → 照常绘制 */ }
    // P-21 A3：?align=0（opts.align === false）→ 视作 center，复现旧"origin 恒几何中心"行为
    const a = opts.align === false ? [0.5, 0.5] : (ALIGN[layer.alignment] || [0.5, 0.5])
    // 动画属性：origin/scale 每帧按关键帧插值（WE 动画壁纸核心）
    let ox = layer.origin[0], oy = layer.origin[1]
    let sx = layer.scale[0], sy = layer.scale[1]
    if (layer.anim && time !== undefined) {
      const okf = layer.anim.origin
      if (okf) {
        const c0 = okf.get('c0'), c1 = okf.get('c1'), c2 = okf.get('c2')
        ox = animValueAt(c0, time) ?? ox
        oy = animValueAt(c1, time) ?? oy
      }
      const skf = layer.anim.scale
      if (skf) {
        sx = animValueAt(skf.get('c0'), time) ?? sx
        sy = animValueAt(skf.get('c1'), time) ?? sy
      }
    }
    let w = layer.size[0] * sx
    let h = layer.size[1] * sy
    // 角色层自动适配（无父级 + animationlayers 角色动画层 且超屏）：等比缩到赛宽内 + 垂直居中。
    // 立绘数据（如 Hina 人物 1405x2013）固定投影下必然裁切；适配后头部/脚部完整可见。
    // ①(P-100 用户真机实测"入场动画把人物固定在屏幕中间、去移动背景 —— 应该只移动摄像头") **默认收窄**：
    //   这条兜底会把角色层的 **origin 改写成画布中心**（世界坐标），于是相机层动画（hina 入场
    //   zoom 3→1 + origin (−1319,−709)→(0,0)）只能把"已被抠出来的角色"推来推去，而不是让角色
    //   留在作者摆的位置上被镜头看见 ⇒ 观感 = 角色钉在屏幕中心、背景自己动。
    //   现行口径（`?charfit=` 三档，见 `charfitModeFrom`）：
    //     `auto`（缺省）—— **场景有相机节点 ⇒ 不适配**（取景交给相机）；无相机节点且真超屏才兜底；
    //     `off`        —— 任何情况下都不适配；`legacy` —— 恒按旧判据适配（逐位回到改动前）。
    //   为什么默认不是"永远关"：凯尔希 3719111841 的"长发3"（3359x2620，无相机层）就是靠这条兜底
    //   才不出屏，那类包没有相机会跟它打架（全语料 10 包里命中该分支的只有 3 层：hina 人物〈有相机〉
    //   + 凯尔希 长发3〈无相机〉+ 两层的 OOB 断言同为 true，前者的 k 恰为 1 = 只居中不缩放）。
    if (charfitMode !== 'off' && layer.animLayers && layer.parent === undefined
        && (charfitMode === 'legacy' || !cam.hasCameraNode)) {
      const oob = oy - h / 2 < 0 || oy + h / 2 > cam.projH || ox - w / 2 < 0 || ox + w / 2 > cam.projW
      if (oob) {
        const k = Math.min(1, (cam.projW * 0.96) / w, (cam.projH * 0.96) / h)
        w *= k; h *= k
        ox = cam.projW / 2
        oy = cam.projH / 2
      }
    }
    // ①(P-76 真机：凯尔希 3719111841「身后的背景没有」/ 屏幕左侧盖不到) **对象级视差的两处口径错**：
    //   (A) 空间：官方 offset = ((node_pos − cam_pos) + mouse) ∘ depth × amount 的量纲是**世界像素**
    //       （同式里 node_pos/cam_pos/mouse 都是设计像素），但旧实现把它 `mat4Translate` 在
    //       `mat4Scale(m, w, h, 1)` **之后** ⇒ 位移又被 (w,h) 放大一次。背景正常 w=4244.28 ⇒
    //       offx 0.3863px 被放大成 **1639.4px**、offy 0.9193px → **2341.0px** —— 真机每一帧
    //       `【帧N】左缘=178,178,178`（页面灰，没被覆盖）与台账 rd x0=1430（应 −209）就是它。
    //   (B) 门控：`opts.parallaxOff`（demo.html 默认 true，注释写着"视差整体停用"）旧实现只停了
    //       **鼠标项**（parDispX/Y 置 0），对象级 `(node_pos − cam_pos)` 项照旧生效 ⇒ "关掉视差"
    //       之后仍有与鼠标无关的常量位移。
    //   修法：(A) 位移与 origin 同空间 ⇒ 与 origin 合并成一次平移（等价于 T(off)·T(o)·R·S）；
    //        (B) 对象级视差同样受 `opts.parallaxOff` 门控，与场景级门控（见 renderScene 的
    //            `opts.parallaxOff !== true` 分支）一致。
    //   回退：`?parspace=legacy`（回到后乘 S 的旧空间）/ `?paroff=legacy`（回到不门控的旧口径）；
    //        测试可用 opts.parallaxSpaceLegacy / opts.parallaxOffLegacy 在同进程内切两态。
    const __parSpaceLegacy = (opts.parallaxSpaceLegacy !== undefined)
      ? !!opts.parallaxSpaceLegacy : PARALLAX_SPACE_LEGACY
    const __parOffLegacy = (opts.parallaxOffLegacy !== undefined)
      ? !!opts.parallaxOffLegacy : PARALLAX_OFF_LEGACY
    let parOffX = 0, parOffY = 0
    if (parEnabled && layer.parallaxDepth && (opts.parallaxOff !== true || __parOffLegacy)) {
      const camCx = cam.projW / 2, camCy = cam.projH / 2
      const dpx = Number(layer.parallaxDepth[0]) || 0
      const dpy = Number(layer.parallaxDepth[1]) || 0
      if (opts.parallaxLegacy) {
        // 旧 lwe 近似（?parallax=legacy 回退 A/B 用）：(depth+amount)×disp（世界像素）
        parOffX = (dpx + parAmount) * parDispX
        parOffY = (dpy + parAmount) * parDispY
      } else {
        // ①(RE-24 官方公式) offset = ((node_pos − cam_pos) + mouse) ∘ depth × amount（世界像素）
        parOffX = ((ox - camCx) + parDispX) * dpx * parAmount
        parOffY = ((oy - camCy) + parDispY) * dpy * parAmount
      }
    }
    let m = mat4Identity()
    // 世界坐标 = 设计像素（y 向下，投影 mat4Ortho(0,cw,ch,0) 已 y-down 映射），origin 即图层中心。
    // ①(P-76) 视差位移是**世界像素**，与 origin 同空间 → 合并进这一次平移（旧口径见下方 legacy 分支）。
    m = mat4Translate(m, ox + (__parSpaceLegacy ? 0 : parOffX), oy + (__parSpaceLegacy ? 0 : parOffY), layer.origin[2])
    // 旋转（WE 语义：y 翻转坐标系下 rotate(-angle)；围绕图层中心）
    m = mat4RotateZ(m, -layer.angles[2])
    m = mat4Scale(m, w, h, 1)
    // 对齐偏移的消费点（生成式见 docs/IMAGE-ALPHA-ALIGN-SPEC.md §2；helper 名 alignmentOffsetForToken）：
    // origin 是 alignment 隐含的枢轴，网格中心相对枢轴平移（left→+x、right→−x、top→+y[y-down]、bottom→−y）。
    // parseScene 的 PROJ_H−y 翻转发生在解析期，这里在**翻转后的 y-down 空间**同步换算
    // （y-up 的 top→−h/2 取反即 +h/2）。offset 在 S(w,h) 之后
    // 后乘 → 受本层缩放/旋转影响，且负 scale 自动翻转方向（与局部变换 T(align) 内乘 S 的语义一致）。
    m = mat4Translate(m, 0.5 - a[0], 0.5 - a[1], 0)
    // ①(P-76 `?parspace=legacy`) 旧空间口径复现：位移在 S(w,h) 之后 → 被 (w,h) 放大（= 真机那个 1639px bug）
    if (__parSpaceLegacy && (parOffX || parOffY)) m = mat4Translate(m, parOffX, parOffY, 0)
    const mvp = mat4Multiply(viewProj, m)
    // ①(2026-09-12 诊断) 背景层前 12 帧逐帧参数（定位"第一帧正常、之后消失"是参数跳变还是绘制被跳过）
    try {
      if (__renderSeq <= 12 && /背景正常/.test(String(layer.name || ''))) {
        onLog('[bg帧' + __renderSeq + '] ox=' + Math.round(ox) + ' oy=' + Math.round(oy) + ' w=' + Math.round(w) + ' h=' + Math.round(h) +
          ' ang=' + layer.angles[2] + ' mvpT=' + Math.round(mvp[12]) + ',' + Math.round(mvp[13]) +
          ' proj=' + cam.projW + 'x' + cam.projH + ' tex=' + (inputTex === whiteTex ? 'white' : inputTex === transparentTex ? 'transparent' : 'layer') +
          ' fbo=' + (gl.getParameter(gl.FRAMEBUFFER_BINDING) ? 'bound' : 'null'))
      }
    } catch (e) {}
    // ①(RE-18 官方语义 2026-09-12) colorBlendMode != 0：先 blit 当前屏幕背景 → u_Screen，
    //   再用屏幕混合程序绘制（A=背景、B=本层、opacity=本层 alpha、输出 alpha 取背景），并**关闭固定混合**
    //   （混合在 shader 内完成，避免二次合成）。旧实现把 A 当成层纹理、B 当成层颜色，是错的。
    const __bm = (layer.colorBlendMode | 0)
    let __useScreen = false
    let __screenTex = null
    if (__bm > 0 && prog !== compProg) {
      try {
        const rt = getFBO(width, height, 'screenblend')
        if (rt && rt.fbo && rt.tex) {
          // ①(P-90) "屏幕背景" = **本帧目标**（q=off 时 null，与改动前同一次调用）
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sceneTargetFbo())
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, rt.fbo)
          gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST)
          gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTargetFbo())
          __screenTex = rt.tex
          __useScreen = true
        }
      } catch (e) { __useScreen = false }
      if (!__useScreen && __auditNow) { try { onLog('[blend] ' + (layer.name || layer.id) + ' 屏幕拷贝失败，回退普通绘制') } catch {} }
    }
    const uni = __useScreen ? screenBlendUni : ((prog === compProg) ? compUni : copyUni)
    gl.useProgram(__useScreen ? screenBlendProg : prog)
    setBlend('translucent')
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTargetFbo())
    gl.viewport(0, 0, width, height)
    gl.bindVertexArray(vao)
    // ①(长条眼窗) 无效果直绘层：layer.uvRect 把纹理子窗铺满 quad（几何=layer.size×scale）
    // ①(W4 P-36) 精灵帧 UV：renderLayer 已把脚本驱动的帧矩形算好挂在 layer.__spriteUV
    //   （仅当 getTextureAnimation 的 setFrame/play 真的驱动过该层才接管；纯 sprite 表但
    //   无脚本的层保持旧行为，避免凯尔希标定观感被自发动画改写）。
    if (layer.__spriteUV) {
      uploadQuad('localsprite' + layer.__spriteUV.map((v) => +v.toFixed(4)).join(','), localQuadVertsUV(layer.__spriteUV))
    } else if (layer.uvRect) {
      uploadQuad('localuv' + layer.uvRect.map((v) => +v.toFixed(4)).join(','), localQuadVertsUV(layer.uvRect))
    } else uploadQuad('local', LOCAL_QUAD)
    if (__useScreen) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, inputTex)
      gl.uniform1i(uni.tex, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, __screenTex)
      gl.uniform1i(uni.screen, 1)
      gl.uniform2f(uni.viewport, width, height)
      gl.uniform1i(uni.mode, __bm)
      gl.disable(gl.BLEND)   // 混合已在 shader 内完成
    }
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, inputTex)
    gl.uniform1i(uni.tex, 0)
    gl.uniformMatrix4fv(uni.mvp, false, mvp)
    if (uni.color !== null && uni.color !== undefined) gl.uniform4f(uni.color, color4[0], color4[1], color4[2], color4[3])
    // ①(RE-18) 旧 `copyBlendProg`（A=层纹理、B=层颜色）已被屏幕混合取代，此处不再上传其 mode。
    gl.drawArrays(gl.TRIANGLES, 0, 6)
      traceChk('layercopy-draw')
    // ①(2026-09-12 诊断) 逐层绘制台账回调：把"本层实际画到屏幕哪里 + 用了什么纹理"交给调用方。
    //   设备侧只在自报前的那一帧采集（readPixels 有流水线停顿，不能每帧都读），
    //   用来回答"某层到底画没画、画在哪"——比只看 origin 可靠（origin 是枢轴，可能落在透明像素上）。
    try {
      if (opts.onLayerDraw) {
        opts.onLayerDraw(layer, { mvp, width, height, quadW: w, quadH: h,
          isWhite: inputTex === whiteTex, isTransparent: inputTex === transparentTex })
      }
    } catch (e) { /* 台账失败不影响渲染 */ }
  }

  // ①(P-109) 子网格隔离探针的实现（只在 `?submesh=` 非空时被调用；语义见 SUB_WANT 注释）。
  //   分组表按 **mesh 对象身份**缓存（layerId → table），筛选后的 EBO/VAO 按"规格+规则"缓存。
  function __subTable(mesh) {
    const nv = mesh.positions.length
    const nb = (mesh.bones && mesh.bones.length) || 0
    const dom = new Int32Array(nv)
    const groups = new Map()
    const idxs = mesh.blendIndices, wts = mesh.blendWeights
    for (let i = 0; i < nv; i++) {
      const w = wts[i] || [1, 0, 0, 0], bi = idxs[i] || [0, 0, 0, 0]
      let k = 0
      for (let j = 1; j < 4; j++) if ((w[j] || 0) > (w[k] || 0)) k = j
      // 权重全零/缺失 ⇒ 退回 blendIndices[0]（与 MESH_VS 里 w==0 跳过的口径一致：此时不蒙皮）
      let b = bi[k] | 0
      let wsz = 0
      for (let j = 0; j < 4; j++) wsz += Math.abs(w[j] || 0)
      if (!(wsz > 0)) b = (bi[0] | 0)
      dom[i] = b
      let g = groups.get(b)
      if (!g) { g = { b, verts: [], bbox: [Infinity, Infinity, -Infinity, -Infinity], c: [0, 0], bones: new Map(), chain: [] }; groups.set(b, g) }
      g.verts.push(i)
      const p = mesh.positions[i]
      if (p[0] < g.bbox[0]) g.bbox[0] = p[0]
      if (p[1] < g.bbox[1]) g.bbox[1] = p[1]
      if (p[0] > g.bbox[2]) g.bbox[2] = p[0]
      if (p[1] > g.bbox[3]) g.bbox[3] = p[1]
      g.c[0] += p[0]; g.c[1] += p[1]
      for (let j = 0; j < 4; j++) {
        const ww = w[j] || 0
        if (ww === 0) continue
        const bb = bi[j] | 0
        const cur = g.bones.get(bb) || { b: bb, w: 0, n: 0 }
        cur.w += ww; cur.n++
        g.bones.set(bb, cur)
      }
    }
    // 主骨父链（根在前？——统一为"由近及远"：[parent, grandparent, …, root]）
    for (const g of groups.values()) {
      g.c[0] /= g.verts.length; g.c[1] /= g.verts.length
      g.bonesArr = [...g.bones.values()].sort((a, b2) => b2.w - a.w || a.b - b2.b)
      let p = (mesh.bones[g.b] && mesh.bones[g.b].parent)
      let guard = 0
      while (p >= 0 && p < nb && guard++ < 64) { g.chain.push(p); p = (mesh.bones[p] && mesh.bones[p].parent) }
      g.bbox = g.bbox.map((v) => +v.toFixed(4))
      g.c = g.c.map((v) => +v.toFixed(4))
    }
    // 三角形归属：三种规则各一张 group → 三角形序号表
    const tris = { all: new Map(), major: new Map(), any: new Map() }
    const idx = mesh.indices
    const nTri = Math.floor(idx.length / 3)
    for (let ti = 0; ti < nTri; ti++) {
      const a = dom[idx[ti * 3]] | 0, b2 = dom[idx[ti * 3 + 1]] | 0, c2 = dom[idx[ti * 3 + 2]] | 0
      if (a === b2 && b2 === c2) { if (!tris.all.has(a)) tris.all.set(a, []); tris.all.get(a).push(ti) }
      let gMaj = a
      if (b2 === c2) gMaj = b2
      else if (a === c2) gMaj = a
      if (!tris.major.has(gMaj)) tris.major.set(gMaj, [])
      tris.major.get(gMaj).push(ti)
      for (const g of (a === b2 ? [a, c2] : (b2 === c2 ? [b2, a] : (a === c2 ? [a, b2] : [a, b2, c2])))) {
        if (!tris.any.has(g)) tris.any.set(g, [])
        tris.any.get(g).push(ti)
      }
    }
    // ①(P-117) 逐三角形 bind 绕序符号（`invert` 计数的**基线**；口径见 SUB_BASE_LEGACY 与 __subBindTriSign）
    const triSign = __subBindTriSign(mesh.positions, idx, nTri)
    return { nv, nb, dom, groups, tris, nTri, triSign }
  }
  /** ①(P-117) 一组顶点在 **bind** 姿态下的逐三角形**有向面积符号**（= 顶点原始绕序）。
   *  为什么必须单独算：①(P-117) 起 `invert` 的基线改为"相对 bind 翻没翻"，而 bind 姿态的蒙皮矩阵是
   *  单位阵 ⇒ 直接用 `mesh.positions` 算出的符号与"gBones=I 时蒙皮后算出的符号"逐位一致（测试有断言）。
   *  死区 1e-9 与蒙皮侧同式（两边都不把"面积恰为 0"计成任何一种符号）。 */
  function __subBindTriSign(pos, idx, nTri) {
    const out = new Int8Array(nTri)
    for (let ti = 0; ti < nTri; ti++) {
      const p0 = pos[idx[ti * 3]], p1 = pos[idx[ti * 3 + 1]], p2 = pos[idx[ti * 3 + 2]]
      const ar = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])
      out[ti] = ar > 1e-9 ? 1 : (ar < -1e-9 ? -1 : 0)
    }
    return out
  }
  /** ①(P-117) 一组顶点的"bind 位置"法方程 3×3 的逆（bind 是常量 ⇒ 每组只算一次）。
   *  拟合模型 `X ≈ a·x + b·y + c`、`Y ≈ d·x + e·y + f`（x,y = bind 位置，X,Y = 蒙皮后位置）；
   *  奇异组（三点共线/退化）返回 null ⇒ 该组不参与方向判据（如实置 null，绝不猜一个 det 出来）。 */
  function __subFitMat(verts, pos) {
    let Sxx = 0, Sxy = 0, Syy = 0, Sx = 0, Sy = 0
    for (const i of verts) { const x = pos[i][0], y = pos[i][1]; Sxx += x * x; Sxy += x * y; Syy += y * y; Sx += x; Sy += y }
    const n = verts.length
    const a = Sxx, b = Sxy, c = Sx, d = Sxy, e = Syy, f = Sy, g = Sx, h = Sy, k = n
    const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g)
    if (!(Math.abs(det) > 1e-9)) return null
    return [
      (e * k - f * h) / det, (c * h - b * k) / det, (b * f - c * e) / det,
      (f * g - d * k) / det, (a * k - c * g) / det, (c * d - a * f) / det,
      (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
    ]
  }
  /** ①(P-117) **组级方向判据**：把"bind→蒙皮"最小二乘仿射的 2×2 线性部分行列式算出来。
   *  为什么必须与"三角形变号"分开报：用户报的"眉毛整组翻 180°"是**整组方向反转**（det<0、|det|≈1）。
   *  单个三角形有向面积过零只说明那个三角形**塌成一条线**（局部折面/多骨权重剪切），此时该组 det 仍是正的。
   *  两者混在一个 `invert` 计数里 ⇒ "那个 bug 到底还在不在"无法判定（P-117 的取证结论）。
   *  口径自证：bind 姿态下拟合结果就是恒等映射 ⇒ 每组 det 恰为 1（测试断言 ≤1e-9）。 */
  function __subFit(m, r0, r1, r2, r3, r4, r5) {
    const a = m[0] * r0 + m[1] * r2 + m[2] * r4
    const b = m[0] * r1 + m[1] * r3 + m[2] * r5
    const d = m[3] * r0 + m[4] * r2 + m[5] * r4
    const e = m[3] * r1 + m[4] * r3 + m[5] * r5
    return a * e - b * d
  }
  /** 解析 `?submesh=` 规格 → { all, sel:Set<骨号>, missing:[] }（`*` 展开父链后代）
   *  ⚠ `missing` 必须记账：**越界骨号/非法 token 一律进 missing**，绝不静默变成"空选中"——
   *  空选中在本探针里的正确语义是"一个三角形都不画"，若静默退回全量就等于把整块网格画出来。 */
  function __subParse(spec, table) {
    const raw = String(spec || '')
    if (raw.trim().toLowerCase() === 'all') return { all: true, sel: null, missing: [] }
    const sel = new Set()
    const missing = []
    for (const tok0 of raw.split(',')) {
      const tok = tok0.trim()
      if (!tok) continue
      const desc = tok.endsWith('*')
      const body = desc ? tok.slice(0, -1).trim() : tok
      let lo, hi
      const m = body.match(/^(\d+)\s*-\s*(\d+)$/)
      if (m) { lo = parseInt(m[1], 10); hi = parseInt(m[2], 10) }
      else if (/^\d+$/.test(body)) { lo = hi = parseInt(body, 10) }
      else { missing.push(tok); continue }        // 非法 token：记账（不改语义）
      if (hi < lo) { const t = lo; lo = hi; hi = t }
      for (let b = lo; b <= hi; b++) {
        if (b >= 0 && b < table.nb) sel.add(b)
        else if (!missing.includes(b)) missing.push(b)
      }
      if (desc) {
        let added = true
        while (added) {
          added = false
          for (let b = 0; b < table.nb; b++) {
            const p = (table.parentOf) ? table.parentOf[b] : -1
            if (p >= 0 && sel.has(p) && !sel.has(b)) { sel.add(b); added = true }
          }
        }
      }
    }
    return { all: false, sel, missing }
  }
  /** 建/取"选中组 × 规则"的过滤 VAO（复用同一 VBO；count = 索引个数） */
  function __subFilterVao(layer, mesh, rec, table, parsed, mode) {
    const key = (SUB_WANT.replace(/\s+/g, '')) + '|' + mode + '|' + (layer.__subMeshOnly != null ? layer.__subMeshOnly : 'x')
    if (!rec.subFilters) rec.subFilters = new Map()
    const hit = rec.subFilters.get(key)
    if (hit) return hit
    const triSet = new Set()
    if (parsed.all) { for (let ti = 0; ti < table.nTri; ti++) triSet.add(ti) }
    else {
      const src = table.tris[mode]
      for (const b of parsed.sel) { const arr = src.get(b); if (arr) for (const ti of arr) triSet.add(ti) }
    }
    let minTi = 0, maxTi = table.nTri
    if (layer.__subMeshOnly != null && rec.submeshes && rec.submeshes.length > 1) {
      const sm = rec.submeshes[layer.__subMeshOnly | 0]
      if (sm) { minTi = Math.floor(sm.start / 3); maxTi = Math.floor((sm.start + sm.count) / 3) }
    }
    const list = [...triSet].filter((ti) => ti >= minTi && ti < maxTi).sort((a, b) => a - b)
    const out = new Uint16Array(list.length * 3)
    for (let k = 0; k < list.length; k++) {
      out[k * 3] = mesh.indices[list[k] * 3]
      out[k * 3 + 1] = mesh.indices[list[k] * 3 + 1]
      out[k * 3 + 2] = mesh.indices[list[k] * 3 + 2]
    }
    const ebo = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, out, gl.STATIC_DRAW)
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const S = 13 * 4
    const prog = ensureMeshProg()
    gl.bindBuffer(gl.ARRAY_BUFFER, rec.vbo)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo)
    const attr = (name, size, off) => {
      const loc = gl.getAttribLocation(prog, name)
      if (loc < 0) return
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, S, off)
    }
    attr('a_Position', 3, 0); attr('a_TexCoord', 2, 12); attr('a_BlendIdx', 4, 20); attr('a_BlendWeight', 4, 36)
    gl.bindVertexArray(null)
    const outRec = { vao, count: out.length, tris: list.length, triList: list }
    rec.subFilters.set(key, outRec)
    return outRec
  }
  /** 每帧：出台账 + 返回过滤绘制信息（`null` = 用原路径/原实参逐位不变） */
  function __subMeshTick(layer, mesh, rec, smRange, gBonesArr, boneCount, originXY, scaleXY, camInfo) {
    let st = __subLayers.get(layer.id)
    if (!st || st.mesh !== mesh) {
      const table = __subTable(mesh)
      table.parentOf = new Int32Array(table.nb)
      for (let b = 0; b < table.nb; b++) table.parentOf[b] = (mesh.bones[b] && mesh.bones[b].parent != null) ? (mesh.bones[b].parent | 0) : -1
      st = { mesh, table, parsed: __subParse(SUB_WANT, table), st2: new Map(), logs: 0, samples: 0, t0: null, t1: null, lastSampleT: null, bad: [] }
      // `missing` = 越界骨号 / 非法 token（解析器记账）；`bad` 再补一层"骨号合法但组里没有顶点"
      for (const b of (st.parsed.sel || [])) if (!table.groups.has(b)) st.bad.push(b)
      __subLayers.set(layer.id, st)
      try {
        onLog('[submesh] 层"' + String(layer.name || layer.id) + '" id=' + layer.id + ' 顶点=' + table.nv + ' 骨=' + table.nb
          + ' 组=' + table.groups.size + ' 规则=' + SUB_TRI + ' 筛选=' + SUB_WANT
          + (st.parsed.all ? '（all = 只出台账、绘制不变）' : '（选中骨 ' + [...st.parsed.sel].sort((a, b) => a - b).join(',') + '）')
          + ((st.parsed.missing.length || st.bad.length) ? ' ⚠ 无效/无顶点的骨号 ' + st.parsed.missing.concat(st.bad).join(',') : ''))
      } catch (e) { /* ignore */ }
    }
    const table = st.table
    const nb = Math.min(boneCount | 0, table.nb)
    const nv = table.nv
    // 过滤绘制信息（只有 `all` ⇒ null ⇒ 原 drawElements 实参逐位不变）；
    //   **筛选规格一律走过滤路径**（哪怕选中集为空 ⇒ 0 个三角形 ⇒ 一个 draw 都不发）
    let draw = null
    if (!st.parsed.all) draw = __subFilterVao(layer, mesh, rec, table, st.parsed, SUB_TRI)
    // ── 台账：蒙皮后的组质心/位移 + 组内三角形有向面积变号统计 ──
    //   ⚠ 口径：这里用的是**上传给着色器的那一份** `u_Bones`（= 宿主算好的 gBones = bindInv×RT），
    //   与 `MESH_VS` 的 `sk += (p * u_Bones[bi]) * w` **逐字同式** ⇒ 台账里的 skin/world 就是
    //   "这一帧画到屏幕上的那个形状"，而不是骨骼姿势（骨骼姿势归 `?bones=` 探针）。
    const nowT = __bonesNowT || 0
    const gm = st.gm || (st.gm = new Float32Array(nb * 16))
    for (let b = 0; b < nb; b++) {
      for (let k = 0; k < 16; k++) gm[b * 16 + k] = gBonesArr[b * 16 + k] || 0
    }
    const skin = st.skin || (st.skin = new Float32Array(nv * 2))
    const pos = mesh.positions, wts = mesh.blendWeights, idxs = mesh.blendIndices
    // ①(P-117) 每组一次：bind 位置的法方程逆（bind 是常量；用于组级**方向/镜像**判据，见 __subFit）
    if (!st.fit) {
      st.fit = new Map()
      for (const g of table.groups.values()) {
        if (g.verts.length < 3) continue
        st.fit.set(g.b, __subFitMat(g.verts, pos))
      }
    }
    for (let i = 0; i < nv; i++) {
      const p = pos[i], w = wts[i] || [1, 0, 0, 0], bi = idxs[i] || [0, 0, 0, 0]
      let x = 0, y = 0
      for (let k = 0; k < 4; k++) {
        const ww = w[k] || 0
        if (ww === 0) continue
        const o = ((bi[k] | 0) < nb ? (bi[k] | 0) : 0) * 16
        x += (p[0] * gm[o] + p[1] * gm[o + 4] + p[2] * gm[o + 8] + gm[o + 12]) * ww
        y += (p[0] * gm[o + 1] + p[1] * gm[o + 5] + p[2] * gm[o + 9] + gm[o + 13]) * ww
      }
      skin[i * 2] = x; skin[i * 2 + 1] = y
    }
    const sample = (st.lastSampleT === null) || (nowT - st.lastSampleT >= 0.1) || (nowT < st.lastSampleT)
    st.samples++; if (st.t0 === null) st.t0 = nowT; st.t1 = nowT
    const view = (camInfo && Array.isArray(camInfo.view)) ? camInfo.view : [0, 0]
    const sx = scaleXY ? scaleXY[0] : 1, sy = scaleXY ? scaleXY[1] : 1
    const ox = originXY ? originXY[0] : 0, oy = originXY ? originXY[1] : 0
    const groupsOut = []
    for (const g of [...table.groups.values()].sort((a, b) => a.b - b.b)) {
      let rs = st.st2.get(g.b)
      if (!rs) {
        rs = { hist: [], base: null, baseSign: null, maxMag: 0, maxAt: 0, maxD: [0, 0], last: null,
          invert: 0, invertAt: 0, zero: 0, triList: (table.tris.all.get(g.b) || []),
          // ①(P-117) 组级方向（镜像）判据的会话累计：minDet = 该组 det 的最小值（<0 ⇒ 这一组被镜像过）
          detMin: null, detMinAt: 0, detMirror: false }
        st.st2.set(g.b, rs)
      }
      let cx = 0, cy = 0
      // ①(P-117) 顺带累计"bind→蒙皮"最小二乘拟合的 6 个右端项（同一趟循环，零额外遍历）：
      //   r0=Σx·X r1=Σx·Y r2=Σy·X r3=Σy·Y r4=ΣX r5=ΣY（x,y=bind 位置；X,Y=蒙皮后位置）
      let r0 = 0, r1 = 0, r2 = 0, r3 = 0, r4 = 0, r5 = 0
      const fitM = st.fit ? st.fit.get(g.b) : null
      for (const i of g.verts) {
        const X = skin[i * 2], Y = skin[i * 2 + 1]
        cx += X; cy += Y
        if (fitM) { const x = pos[i][0], y = pos[i][1]; r0 += x * X; r1 += x * Y; r2 += y * X; r3 += y * Y; r4 += X; r5 += Y }
      }
      cx /= g.verts.length; cy /= g.verts.length
      if (!rs.base) { rs.base = [cx, cy]; rs.baseSign = [] }
      // ①(P-117) 组级方向判据：det<0 = 该组被**镜像**（用户报的"眉毛整组翻 180°"的机器形式）；
      //   单三角形面积过零（下面的 invert）只是**局部塌陷/折面**，两者必须分开报。
      const detNow = fitM ? __subFit(fitM, r0, r1, r2, r3, r4, r5) : null
      if (detNow !== null) {
        if (rs.detMin === null || detNow < rs.detMin) { rs.detMin = detNow; rs.detMinAt = nowT }
        if (detNow < 0) rs.detMirror = true
      }
      rs.last = { t: +nowT.toFixed(3), skin: [+cx.toFixed(4), +cy.toFixed(4)] }
      const dx = cx - rs.base[0], dy = cy - rs.base[1]
      const mag = Math.hypot(dx, dy)
      if (mag > rs.maxMag) { rs.maxMag = mag; rs.maxAt = nowT; rs.maxD = [dx, dy] }
      // 组内三角形有向面积变号（"翻转"的机器可判形式；只看严格归属本组的三角形）
      // ①(P-117) 基线口径：缺省 = **bind 姿态**（table.triSign）⇒ 与"会话从哪一帧开始"无关；
      //   `?subbase=legacy` = P-109 旧口径（本组第一个被记账的采样帧的符号，见 SUB_BASE_LEGACY 注释）。
      let invNow = 0
      for (let k = 0; k < rs.triList.length; k++) {
        const ti = rs.triList[k]
        const i0 = mesh.indices[ti * 3], i1 = mesh.indices[ti * 3 + 1], i2 = mesh.indices[ti * 3 + 2]
        const ax = skin[i0 * 2], ay = skin[i0 * 2 + 1], bx = skin[i1 * 2], by = skin[i1 * 2 + 1], cx2 = skin[i2 * 2], cy2 = skin[i2 * 2 + 1]
        const ar = (bx - ax) * (cy2 - ay) - (cx2 - ax) * (by - ay)
        const sg = ar > 1e-9 ? 1 : (ar < -1e-9 ? -1 : 0)
        if (rs.baseSign.length <= k) rs.baseSign.push(sg)
        const baseSg = SUB_BASE_LEGACY ? rs.baseSign[k] : table.triSign[ti]
        if (sg !== 0 && baseSg !== 0 && sg !== baseSg) invNow++
      }
      if (invNow > rs.invert) { rs.invert = invNow; rs.invertAt = nowT }
      if (sample) {
        rs.hist.push([+nowT.toFixed(3), +dx.toFixed(3), +dy.toFixed(3)])
        if (rs.hist.length > 120) rs.hist.shift()
      }
      groupsOut.push({
        b: g.b, nv: g.verts.length, bbox: g.bbox, c: g.c, chain: g.chain,
        bones: g.bonesArr.map((o) => ({ b: o.b, w: +o.w.toFixed(4), n: o.n })),
        tri: { all: (table.tris.all.get(g.b) || []).length, major: (table.tris.major.get(g.b) || []).length, any: (table.tris.any.get(g.b) || []).length },
        sel: !!(st.parsed.all || (st.parsed.sel && st.parsed.sel.has(g.b))),
        verts: g.verts.length <= 32 ? g.verts.slice() : g.verts.slice(0, 32),
        last: { t: rs.last.t, skin: rs.last.skin, world: [+(ox + sx * cx + (view[0] || 0)).toFixed(3), +(oy + sy * cy + (view[1] || 0)).toFixed(3)] },
        disp: { dx: +rs.maxD[0].toFixed(3), dy: +rs.maxD[1].toFixed(3), mag: +rs.maxMag.toFixed(3), at: +rs.maxAt.toFixed(3) },
        invert: { now: invNow, max: rs.invert, at: +rs.invertAt.toFixed(3), nTri: rs.triList.length },
        // ①(P-117) 组级方向判据（det<0 ⇒ 该组被镜像；null = 该组顶点退化、不参与判据）
        orient: { det: detNow === null ? null : +detNow.toFixed(8),
          minDet: rs.detMin === null ? null : +rs.detMin.toFixed(8), minDetAt: +rs.detMinAt.toFixed(3),
          mirror: rs.detMirror, nv: g.verts.length },
        hist: rs.hist,
      })
    }
    if (sample) st.lastSampleT = nowT
    let sel = 0, selV = 0, maxG = -1, maxM = 0, maxAt = 0, invG = -1, invM = 0, invAt = 0
    // ①(P-117) 会话级镜像汇总：mirrorGroups = 曾经 det<0 的组数（0 = "没有任何子网格被镜像过"），
    //   minDet* = 全体组里 det 最小值（判据的另一半：不仅不能为负，还应贴近 1 = 无镜像无塌陷）
    let mirGroups = 0, mirBones = [], minDet = null, minDetGroup = -1, minDetAt = 0
    for (const o of groupsOut) {
      const od = o.orient || {}
      if (od.mirror) { mirGroups++; mirBones.push(o.b) }
      if (od.minDet !== null && od.minDet !== undefined && (minDet === null || od.minDet < minDet)) {
        minDet = od.minDet; minDetGroup = o.b; minDetAt = od.minDetAt
      }
    }
    for (const o of groupsOut) {
      if (o.sel) { sel++; selV += o.nv }
      if (o.disp.mag > maxM) { maxM = o.disp.mag; maxG = o.b; maxAt = o.disp.at }
      if (o.invert.max > invM) { invM = o.invert.max; invG = o.b; invAt = o.invert.at }
    }
    const ledger = {
      layer: String(layer.name || layer.id), id: layer.id, nb: table.nb, nv, nTri: table.nTri,
      spec: SUB_WANT, triMode: SUB_TRI, all: !!st.parsed.all,
      // ①(P-117) 变号计数用的基线口径（自描述；`?subbase=legacy` 时为 'legacy'）
      base: SUB_BASE_LEGACY ? 'legacy' : 'bind',
      sel: st.parsed.all ? [...table.groups.keys()].sort((a, b) => a - b) : [...(st.parsed.sel || [])].sort((a, b) => a - b),
      missing: st.parsed.missing.concat(st.bad), origin: [ox, oy], scale: [sx, sy], view: [view[0] || 0, view[1] || 0],
      drawn: draw ? { tris: draw.tris, indices: draw.count } : { tris: table.nTri, indices: mesh.indices.length, unchanged: true },
      samples: { n: st.samples, kept: groupsOut.length ? groupsOut[0].hist.length : 0, t0: +(st.t0 || 0).toFixed(3), t1: +(st.t1 || 0).toFixed(3) },
      groups: groupsOut,
      summary: { nGroups: table.groups.size, nSelected: sel, vertsSelected: selV, trisSelected: draw ? draw.tris : table.nTri,
        maxDispGroup: maxG, maxDisp: +maxM.toFixed(3), maxDispAt: +maxAt.toFixed(3),
        maxInvertGroup: invG, maxInvert: invM, maxInvertAt: +invAt.toFixed(3), missing: st.parsed.missing.length + st.bad.length,
        mirrorGroups: mirGroups, mirrorBones: mirBones,
        minDetGroup: minDetGroup, minDet, minDetAt: +minDetAt.toFixed(3) },
    }
    try { globalThis.__mpwSubMesh = ledger } catch (e) { /* ignore */ }
    // 每 ~2s 一行结构化摘要（进 #log → 进设备上报）：选中组/全体组里位移与翻转最大的三组
    if (st.logs < 8 && (st.nextLogAt === undefined || nowT >= st.nextLogAt)) {
      st.logs++
      st.nextLogAt = nowT + 2
      const byDisp = groupsOut.slice().sort((a, b) => b.disp.mag - a.disp.mag).slice(0, 3)
      const byInv = groupsOut.slice().sort((a, b) => b.invert.max - a.invert.max).slice(0, 3)
      const fmt = (o) => 'b' + o.b + '(n=' + o.nv + ',c=' + o.c[0].toFixed(1) + ',' + o.c[1].toFixed(1)
        + ',d=' + o.disp.dx.toFixed(1) + ',' + o.disp.dy.toFixed(1) + '@' + o.disp.at.toFixed(1) + 's'
        + ',inv=' + o.invert.max + '/' + o.invert.nTri + ')'
      try {
        onLog('[submesh] 层"' + String(layer.name || layer.id) + '" id=' + layer.id + ' 组=' + table.groups.size
          + ' 选中组=' + sel + '(' + selV + '顶点/' + (draw ? draw.tris : table.nTri) + '三角形)'
          + ' | 位移top3: ' + byDisp.map(fmt).join(' ')
          + ' | 翻转top3: ' + byInv.map(fmt).join(' '))
      } catch (e) { /* ignore */ }
    }
    return draw
  }

  // ①(P-69 第 4 项) 逐骨位姿探针的实现（只在 ?bones= 点名层时被调用；见 BONES_WANT 注释）
  function __dumpBones(layer, mesh, gBonesArr, boneCount) {
    let st = __bonesLayers.get(layer.id)
    if (!st) {
      st = { bindWorld: null, frames: [], last: null, logs: 0 }
      __bonesLayers.set(layer.id, st)
    }
    const nb = Math.max(0, Math.min(boneCount | 0, (mesh && mesh.bones && mesh.bones.length) || boneCount | 0))
    // ①(P-80) **会话级记账**（不受下面 180 帧环形缓冲窗口限制）：真机第一轮数据（105 帧/3.01s）
    //   全骨 maxΔty=14.9px、maxΔang=0.31rad、mirror 空、flips 0 ⇒ 只能得出"这 3 秒里没有眨眼"，
    //   而**不是**"眨眼不走骨骼"。根因是窗口/选段问题：环形缓冲一被冲掉、极值就丢了。
    //   这里按 **整个会话累计** 每根骨的 ang/tx/ty 极值 + 每骨 max|Δty| / max|Δang|：
    //   一次刷新就能回答"这次会话里到底有没有眨眼、是哪几根骨在动"，不用扫 105×32 个元组。
    if (!st.ext || st.ext.length !== nb) {
      st.ext = Array.from({ length: nb }, () => [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity])
      st.extT = Array.from({ length: nb }, () => [0, 0, 0, 0, 0, 0])   // 对应极值出现的时刻 t
      st.maxDty = new Array(nb).fill(0)                                 // 会话累计 max|Δty|（眨眼主判据）
      st.maxDtyAt = new Array(nb).fill(0)
      st.maxDang = new Array(nb).fill(0)
      st.maxDangAt = new Array(nb).fill(0)
      st.blinks = []                                                    // 眨眼事件样本（含 ±5 帧片段，上限 20）
      st.nBlinks = 0                                                    // 眨眼**累计**计数（不受样本上限影响）
      st.open = []                                                      // 正在补"后 5 帧"的事件
      st.nFrames = 0
      st.t0 = null
      st.mirrorEver = []
      st.lastT = null
    }
    if (!st.bindWorld || st.bindWorld.length !== nb) {
      // ①(P-110 2026-09-17) bindWorld 改走唯一实现处 `core/puppet-skin.js::bindWorldChain`：
      //   缺省 **子先乘** `W[b] = L_b × W[parent]`（与 `sampleAnimRT` 的动画链同空间；
      //   旧写法 `bw[parent] × local` = 父先乘，只由 `?bindorder=legacy` 启用，见 BIND_ORDER_LEGACY）。
      //   静止帧两种序都看不出（`pose = bindWorld × gBones = bindWorld × bindInv × RT = RT`，逐位正确），
      //   一走动就把"错序基准 + 正确序增量"相加 ⇒ 这里反解出的 pose 会偏几百 px（P-109.2 面部翻转）。
      st.bindWorld = bindWorldChain(mesh && mesh.bones, { legacy: BIND_ORDER_LEGACY })
    }
    const bones = new Array(nb)
    const flips = []
    const mirror = []
    const nowT = __bonesNowT || 0
    for (let b = 0; b < nb; b++) {
      const g = Array.from(gBonesArr.subarray(b * 16, b * 16 + 16))
      const pose = __matMulRow16(st.bindWorld[b], g)          // = RT（绝对世界位姿）
      const ang = Math.atan2(pose[1], pose[0])
      const tx = pose[12], ty = pose[13]
      // ①(P-76 追加，父 agent 要求) **镜像（det<0）与两轴 scale 符号**：
      //   为什么必须要：`[ang, tx, ty]` 反解自 `pose`，而 **一个带负行列式的矩阵（镜像）解出来的角度
      //   完全可以看起来正常** —— 所以"180 帧 0 次 flip、跨帧最大 Δ角 2°"这条只能排除"角度反号/长边插值"，
      //   **排除不了"眉毛左右翻转"是镜像**。补上 det 符号才能一次定案。
      //   2×2 线性部分（**行主序**：pose[0..2]=第0行）[[m00,m01],[m10,m11]] = R(θ)·diag(sx,sy)
      //     ⇒ det = sx·sy、|sx| = hypot(m00,m10)、|sy| = hypot(m01,m11)。
      //   注意 (θ,sx,sy) 与 (θ+π,−sx,−sy) 给出**同一个**矩阵 ⇒ 单看矩阵无法唯一分解出 sx/sy 的符号，
      //   故这里报三个**可从矩阵唯一读出**的量：
      //     detS = sign(det)（<0 ⇔ 含镜像）、sxS = sign(m00)、syS = sign(m11)
      //     —— 三者合起来足以区分 单位 / 纯 180° 旋转（sxS=syS=−1, detS=+1）/ x 镜像（m00<0, m11>0, detS<0）/
      //        y 镜像（m00>0, m11<0, detS<0）。
      //   **追加在 [ang,tx,ty] 之后（索引 3..7），不改变既有顺序** ⇒ demo.html 的 payload 与
      //   projection-y-test 的 `f0[b][0..2]` 断言逐位不变。
      const det = pose[0] * pose[5] - pose[1] * pose[4]
      const detS = det > 1e-9 ? 1 : (det < -1e-9 ? -1 : 0)
      const sxS = pose[0] > 0 ? 1 : (pose[0] < 0 ? -1 : 0)
      const syS = pose[5] > 0 ? 1 : (pose[5] < 0 ? -1 : 0)
      bones[b] = [ang, tx, ty, detS, sxS, syS, +Math.hypot(pose[0], pose[4]).toFixed(4), +Math.hypot(pose[1], pose[5]).toFixed(4)]
      if (detS < 0) mirror.push(b)
      // ①(P-80) 会话累计极值（6 个数/骨：angMin,angMax,txMin,txMax,tyMin,tyMax）+ argmax 时刻
      const ex = st.ext[b], exT = st.extT[b]
      const put = (i0, v) => { if (v < ex[i0]) { ex[i0] = v; exT[i0] = nowT } if (v > ex[i0 + 1]) { ex[i0 + 1] = v; exT[i0 + 1] = nowT } }
      put(0, ang); put(2, tx); put(4, ty)
      const prev = st.last && st.last[b]
      if (prev) {
        let d = ang - prev[0]
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        // ①(P-80) 会话累计每骨 max|Δty| / max|Δang|（眨眼主判据；不看窗口）
        const dty = Math.abs(ty - prev[2])
        if (dty > st.maxDty[b]) { st.maxDty[b] = dty; st.maxDtyAt[b] = nowT }
        if (Math.abs(d) > st.maxDang[b]) { st.maxDang[b] = Math.abs(d); st.maxDangAt[b] = nowT }
        // "反号"判据：跨帧角度跳变 ≥90°（≈π/2）—— 用户口述"左右翻转 180°"的机器可判形式
        if (Math.abs(d) >= Math.PI / 2) flips.push({ b, from: +prev[0].toFixed(4), to: +ang.toFixed(4), d: +d.toFixed(4) })
        // ①(P-76 追加) det 符号跨帧翻转 = **镜像事件**（角度判据看不见这一类）
        const pdet = prev[3]
        if (pdet !== undefined && detS !== 0 && pdet !== 0 && detS !== pdet) flips.push({ b, det: 1, from: pdet, to: detS })
        // ①(P-80) **眨眼事件捕获**：单帧 |Δty| ≥ 阈值（?blinkty=，默认 25px）即记一条，
        //   并把"该帧前后各 5 帧"存进片段（不依赖 180 帧环形缓冲 —— 它会被后续帧冲掉）。
        if (dty >= BLINK_TY) {
          const rec = {
            t: +nowT.toFixed(3), bone: b, dty: +dty.toFixed(2),
            from: +prev[2].toFixed(2), to: +ty.toFixed(2),
            // 前 5 帧（含当前帧共 6 条；后面 5 帧由 st.open 的 pending 补齐）
            seg: st.frames.slice(-5).map((fr) => {
              const bb2 = fr.bones[b]
              return [fr.t, bb2 ? +bb2[2].toFixed(2) : null, bb2 ? +bb2[0].toFixed(3) : null, bb2 ? bb2[3] : null]
            }),
            segLeft: 5,
          }
          rec.seg.push([+nowT.toFixed(3), +ty.toFixed(2), +ang.toFixed(3), detS])
          st.nBlinks++
          if (st.blinks.length < 20) { st.blinks.push(rec); st.open.push(rec) }
          else if (st.open.length < 20) st.open.push(rec)
        }
      }
    }
    // ①(P-80) 给已开事件补"后 5 帧"（每帧每个未闭合事件各补一条，闭合后移出 st.open）
    if (st.open.length) {
      for (let i = st.open.length - 1; i >= 0; i--) {
        const rec = st.open[i]
        const bb2 = bones[rec.bone]
        if (bb2) rec.seg.push([+nowT.toFixed(3), +bb2[2].toFixed(2), +bb2[0].toFixed(3), bb2[3]])
        if (--rec.segLeft <= 0) st.open.splice(i, 1)
      }
    }
    st.nFrames++
    if (st.t0 === null) st.t0 = nowT
    st.lastT = nowT
    if (mirror.length) for (const b of mirror) if (!st.mirrorEver.includes(b)) st.mirrorEver.push(b)
    const frame = { t: +nowT.toFixed(3), bones, flips }
    st.frames.push(frame)
    if (st.frames.length > 180) st.frames.shift()
    st.last = bones
    const summary = __bonesSummary(st, nb)
    try {
      // 浏览器里 window === globalThis ⇒ 与文档里的 `window.__mpwBones` 同一个对象；
      // Node 取证工具（无 window）也能读到，便于断言。
      // ①(P-76) `mirror` = 本帧 det<0（含镜像）的骨号列表 —— 直接可断言/可直接读。
      // ①(P-80) 追加 `ext`/`dty`/`dang`/`blinks`/`summary` —— **会话累计**，不受 180 帧窗口限制。
      globalThis.__mpwBones = {
        layer: String(layer.name || layer.id), id: layer.id, nb, mirror, frames: st.frames,
        ext: st.ext.map((a) => a.map((v) => (isFinite(v) ? +v.toFixed(2) : null))),
        extT: st.extT.map((a) => a.map((v) => +v.toFixed(3))),
        dty: st.maxDty.map((v) => +v.toFixed(2)),
        dang: st.maxDang.map((v) => +v.toFixed(4)),
        blinks: st.blinks,
        summary,
      }
    } catch (e) { /* ignore */ }
    // 每 ~2s 打一行结构化摘要（进 #log → 进设备上报）：角度/位移极值 + 跳变骨表
    const now = nowT
    if (st.logs < 8 && (st.nextLogAt === undefined || now >= st.nextLogAt)) {
      st.logs++
      st.nextLogAt = now + 2
      const f = st.frames
      const rng = (k) => {
        let lo = Infinity, hi = -Infinity
        for (const fr of f) for (const bb of fr.bones) { const v = bb[k]; if (v < lo) lo = v; if (v > hi) hi = v }
        return [!isFinite(lo) ? 0 : +lo.toFixed(3), !isFinite(hi) ? 0 : +hi.toFixed(3)]
      }
      const flipAgg = {}
      const detFlipAgg = {}
      for (const fr of f) for (const fl of fr.flips) {
        if (fl.det) detFlipAgg[fl.b] = (detFlipAgg[fl.b] || 0) + 1
        else flipAgg[fl.b] = (flipAgg[fl.b] || 0) + 1
      }
      const flipsTxt = Object.keys(flipAgg).length
        ? Object.entries(flipAgg).map(([b, n]) => 'b' + b + '×' + n).join(',')
        : '无'
      // ①(P-76 追加) 镜像骨与镜像事件：`det<0` 的骨（本窗口内出现过即计入）+ det 跨帧翻转次数。
      //   角度判据（上面那行）看不见镜像，这一节才是"眉毛左右翻转"的判据。
      const mirSet = new Set()
      for (let b = 0; b < nb; b++) for (const fr of f) { const bb = fr.bones[b]; if (bb && bb[3] < 0) { mirSet.add(b); break } }
      const mirTxt = mirSet.size ? [...mirSet].sort((x, y) => x - y).map((b) => 'b' + b).join(',') : '无'
      const detFlipsTxt = Object.keys(detFlipAgg).length
        ? Object.entries(detFlipAgg).map(([b, n]) => 'b' + b + '×' + n).join(',')
        : '无'
      // 每骨在窗口内的"横向/纵向活动量"（max−min）；用于回答"眼睛骨的水平位移是否为 0"
      const act = []
      for (let b = 0; b < nb; b++) {
        let lo = Infinity, hi = -Infinity, lo2 = Infinity, hi2 = -Infinity
        for (const fr of f) { const bb = fr.bones[b]; if (!bb) continue; if (bb[1] < lo) lo = bb[1]; if (bb[1] > hi) hi = bb[1]; if (bb[2] < lo2) lo2 = bb[2]; if (bb[2] > hi2) hi2 = bb[2] }
        act.push({ b, dx: (isFinite(hi) ? hi - lo : 0), dy: (isFinite(hi2) ? hi2 - lo2 : 0) })
      }
      act.sort((x, y) => y.dx - x.dx)
      const dxTop = act.slice(0, 3).filter((a) => a.dx > 0.01).map((a) => 'b' + a.b + '=' + a.dx.toFixed(2)).join(',') || '全骨 Δx≈0'
      try {
        onLog('[bones] 层"' + String(layer.name || layer.id) + '" id=' + layer.id + ' nb=' + nb + ' 帧=' + f.length
          + ' | 角度极值(rad) ' + JSON.stringify(rng(0)) + ' | tx极值 ' + JSON.stringify(rng(1)) + ' | ty极值 ' + JSON.stringify(rng(2))
          + ' | 跳变≥90°的骨: ' + flipsTxt
          + ' | 镜像骨(det<0): ' + mirTxt + ' | det跨帧翻转: ' + detFlipsTxt
          + ' | 【会话累计】帧=' + summary.frames + ' 时长=' + summary.sessionSec + 's'
          + ' maxΔty=b' + summary.maxDtyBone + '@' + summary.maxDtyAt + 's=' + summary.maxDty + 'px(阈值' + summary.blinkThreshold + ')'
          + ' maxΔang=b' + summary.maxDangBone + '=' + summary.maxDang + 'rad'
          + ' 眨眼事件=' + summary.blinkCount + (summary.blinksPending ? '(补帧中' + summary.blinksPending + ')' : '')
          + ' 镜像骨(会话内出现过)=' + (summary.mirrorEver.length ? summary.mirrorEver.map((b) => 'b' + b).join(',') : '无')
          + ' | 窗口内横向活动 top3: ' + dxTop
          + ' | 纵向活动 top1: b' + (act.slice().sort((x, y) => y.dy - x.dy)[0] || { b: -1, dy: 0 }).b + ' Δy='
          + ((act.slice().sort((x, y) => y.dy - x.dy)[0] || { dy: 0 }).dy).toFixed(2))
      } catch (e) { /* ignore */ }
    }
  }

  // ---------- ①(P-120) 相机 origin 逐属性脚本：宿主接线 + 重算签名 + 台账 ----------
  // 每一条口径的理由都写在模块头 P-120 那段注释里（这里只放实现）。要点：
  //   · 宿主 = `opts.cameraScriptHost`（逐实例）> `setCameraScriptHost()`（模块注册口，demo.html 用）；
  //     **没有宿主 ⇒ 不施加**（不是套静态快照，那会复现 P-69 量到的 −2434px 编辑器残留）。
  //   · 专属脚本缓存（每个渲染器一个）：相机脚本与图层趟互不干扰；
  //   · 签名不变 ⇒ 复用上次结果（不调宿主）；签名见 `cameraScriptSignature`；
  //   · 求值失败 ⇒ 静态快照回退 + 计数 + 每个原因只打一次日志（`camNode.originEvalStats` / `cameraOriginScript` 台账）。
  const camScript = { mode: null, host: null, cache: null, node: null, sig: null, result: null, ledger: null, logged: {} }
  function cameraScriptMode() {
    if (camScript.mode === null) {
      const live = (typeof window !== 'undefined' && window) ? window.__mpwCameraScript : undefined
      camScript.mode = cameraScriptModeFrom(opts.cameraScript, live, 'on')
    }
    return camScript.mode
  }
  function cameraScriptHostOf() {
    if (camScript.host) return camScript.host
    const o = opts.cameraScriptHost
    if (o && typeof o.applySceneScripts === 'function' && typeof o.createScriptCache === 'function') { camScript.host = o; return o }
    return CAMERA_SCRIPT_HOST
  }
  /** 用户属性表：`opts.cameraScript.userProps`（对象或取值函数）> `window.__mpwUserProps` > null（= 不施加）。 */
  function cameraScriptUserProps() {
    const cs = opts.cameraScript
    let up = (cs && cs.userProps !== undefined) ? cs.userProps : undefined
    if (typeof up === 'function') { try { up = up() } catch (e) { up = undefined } }
    if (up === undefined || up === null) {
      up = (typeof window !== 'undefined' && window && typeof window.__mpwUserProps === 'object') ? window.__mpwUserProps : null
    }
    return (up && typeof up === 'object') ? up : null
  }
  /** 脚本 `engine.canvasSize`：`opts.cameraScript.canvasSize` > **渲染输出尺寸**（= demo 的 mpwEngineCanvasSize 缺省口径）。 */
  function cameraScriptCanvasSize(outW, outH) {
    const cs = opts.cameraScript
    const s = cs && cs.canvasSize
    if (s && isFinite(s.x) && isFinite(s.y) && s.x > 0 && s.y > 0) return { x: s.x, y: s.y }
    return { x: outW, y: outH }
  }
  function cameraScriptSignature(camNode, up, canvasSize) {
    const sp = resolveScriptProperties(camNode.originScriptProps, up, null)
    return [
      String(camNode.originScriptSrc).length,
      sp ? JSON.stringify(sp.props) : 'no-sp',
      userPropsStamp(up),
      canvasSize.x + 'x' + canvasSize.y,
      cameraOriginText(camNode.originObj ? camNode.originObj.origin : null),
    ].join('|')
  }
  function camScriptLogOnce(key, msg) {
    if (camScript.logged[key]) return
    camScript.logged[key] = 1
    try { onLog('⚠ P-120 相机 origin 脚本 ' + msg) } catch (e) { /* 日志失败不影响渲染 */ }
  }
  /**
   * 本帧的相机 origin 脚本结果。返回
   * `{state:'ok'|'static'|'off'|'nohost'|'nouserprops'|'error', value:[x,y,z]|null, static, why, …}`。
   * **任何异常都在内部吞掉**（回退静态快照）——调用方拿到的永远是确定值。
   */
  function cameraOriginFromScript(camNode, outW, outH, time) {
    const st = {
      state: 'none', value: null,
      static: Array.isArray(camNode.originStatic) ? camNode.originStatic.slice() : [0, 0, 0],
      why: '', cached: false, srcLen: String(camNode.originScriptSrc || '').length,
      t: time, evals: 0, fallbacks: 0,
    }
    const stats = camNode.originEvalStats || (camNode.originEvalStats = { evals: 0, fallbacks: 0, lastAt: -1 })
    // 每条出口都记台账（含 'off'/'nohost'/'nouserprops'）：浏览器里 `window.__mpwCameraOriginScript`
    // 是"这一帧相机 origin 为什么是这个值"的唯一出口，缺一条就会出现"看起来没接线"的假象。
    const finish = (r) => {
      stats.lastAt = time
      r.evals = stats.evals; r.fallbacks = stats.fallbacks
      camScript.ledger = r
      if (typeof window !== 'undefined') { try { window.__mpwCameraOriginScript = r } catch (e) { /* ignore */ } }
      return r
    }
    try {
      if (cameraScriptMode() === 'off') { st.state = 'off'; return finish(st) }
      const up = cameraScriptUserProps()
      if (!up) { st.state = 'nouserprops'; camScriptLogOnce('nouserprops', '无用户属性表 ⇒ 保持不施加（与改动前一致；传 opts.cameraScript.userProps 或等面板就绪）'); return finish(st) }
      const host = cameraScriptHostOf()
      if (!host) { st.state = 'nohost'; camScriptLogOnce('nohost', '没有注册脚本宿主 ⇒ 保持不施加（setCameraScriptHost / opts.cameraScriptHost）'); return finish(st) }
      if (!camScript.cache) camScript.cache = host.createScriptCache()
      const canvasSize = cameraScriptCanvasSize(outW, outH)
      const sig = cameraScriptSignature(camNode, up, canvasSize)
      if (camScript.node === camNode && camScript.sig === sig && camScript.result) {
        st.cached = true
      } else {
        camScript.node = camNode
        camScript.result = evalCameraOriginScriptOnce(camNode, host, camScript.cache, time, up, canvasSize, opts.frametime)
        camScript.sig = cameraScriptSignature(camNode, up, canvasSize)   // 求值后重算（宿主就地改写了 origin 原文）
        stats.evals++
      }
      const r = camScript.result || { ok: false, why: 'no-result', value: null }
      if (r.ok && Array.isArray(r.value)) {
        st.state = 'ok'; st.value = r.value.slice()
        camNode.originEval = r.value.slice(); camNode.originEvalState = 'ok'; camNode.originEvalWhy = ''
      } else {
        st.state = 'static'; st.why = r.why || 'unknown'; st.value = st.static.slice()
        camNode.originEval = st.value.slice(); camNode.originEvalState = 'static'; camNode.originEvalWhy = st.why
        stats.fallbacks++
        camScriptLogOnce('fail:' + st.why.slice(0, 40), '求值失败（' + st.why + '）⇒ 回退静态快照 ' + st.value.join(' '))
      }
    } catch (e) {
      st.state = 'error'; st.why = 'throw: ' + ((e && e.message) || e); st.value = st.static.slice()
      camNode.originEval = st.value.slice(); camNode.originEvalState = 'error'; camNode.originEvalWhy = st.why
      stats.fallbacks++
      camScriptLogOnce('throw', '接线层异常（' + st.why + '）⇒ 回退静态快照')
    }
    return finish(st)
  }

  // ---------- 渲染入口 ----------
  async function renderScene(scene, textures, width, height, time, __hdrRetry) {
    // ①(P-90) `?q=` **内部渲染档位**：把整场景画进 `内部尺寸` 的离屏 FBO，帧末上采样到画布。
    //   `q=off`（默认）⇒ `frameTarget=null`、`qfbo=null`、**width/height 原样** ⇒ 与改动前逐位相同。
    //   `q=low|medium|high` ⇒ 把 `width/height` **就地遮蔽**成内部尺寸：下游所有
    //   `gl.viewport(0,0,width,height)` / 几何换算 / 效果链 FBO 自动落在内部尺寸上，
    //   "屏幕"出口统一走 `sceneTargetFbo()`；只有帧末上采样用原始的 `outW/outH`。
    const __qOutW = width
    const __qOutH = height
    if (qRenderScale(quality.q) > 0) {
      const sz = qInternalSize(width, height, quality.q)
      const f = getFBO(sz[0], sz[1], 'q-scene')
      if (f && f.width === sz[0] && f.height === sz[1]) {
        // 字段口径（别混）：
        //   · `entry` = `getFBO()` 的返回体 `{fbo, tex, width, height, hdr}`
        //   · `fbo`   = **裸的 WebGLFramebuffer**（`gl.bindFramebuffer(t, X)` 要的是它，
        //                传 entry 会直接 TypeError/INVALID_OPERATION）
        //   `sceneTargetFbo()` 读 `frameTarget.fbo` ⇒ 必须是裸对象。
        qfbo = { entry: f, fbo: f.fbo, w: sz[0], h: sz[1], outW: __qOutW, outH: __qOutH }
        frameTarget = qfbo
        width = sz[0]; height = sz[1]
      } else {
        // 内部 FBO 不完整（getFBO 已回退 1x1）⇒ **不静默**：记一次日志，本帧按 q=off 渲染
        qfbo = null; frameTarget = null
        if (!qFallbackLogged) {
          qFallbackLogged = true
          try { onLog('[P-90] q=' + quality.q + ' 的内部渲染 FBO 不可用（回退 1x1）→ 本帧按 q=off 渲染，画质档无效') } catch (e) {}
        }
      }
    } else {
      qfbo = null; frameTarget = null
    }
    qInternal = [width, height]
    // ①(P-90) 新的一帧 ⇒ FXAA 的帧内幂等令牌前进（`runAA` 在帧末被调时才真的画）
    aaFrameSeq++
    gl.viewport(0, 0, width, height)
    // ①(P-69) 换场景 → 粒子系统缓存作废（层 id 可能复用，缓存跨场景会串状态）
    if (scene !== __partSceneRef) { __partSceneRef = scene; __partSysCache.clear() }
    __bonesNowT = time   // ①(P-69) ?bones 探针的帧时间戳
    // ①(MERGED-2 B) 帧计时开始（仅 perf 开启；GPU 计时优先，不可用退 CPU performance.now()）
    //   GPU 查询用 4 槽环形池：本帧 begin，下一帧 end+读上一帧结果（GPU 异步，读可用槽不阻塞）
    const __pfT0 = perfState.enabled ? performance.now() : 0
    let __pfQuery = null
    if (perfState.enabled && perfState.gpuExt) {
      const q = perfState.qring[perfState.qidx % perfState.qring.length]
      try { gl.beginQuery(perfState.gpuExt.TIME_ELAPSED_EXT, q); __pfQuery = q } catch (e) { __pfQuery = null }
    }
    if (perfState.enabled) perfState.layerRoll.clear()
    const general = scene.general || {}
    // ①(MERGED-1 C HDR 2026-09-12) 绝对 HDR：general.hdr（或 ?hdr=1 强制）+ 浮点 RT 扩展（half 优先）可用时，
    //   **全部场景层渲进 RGBA16F FBO**（尺寸=输出，getFBO 完整性检查沿用），帧末经 bloom compose 程序
    //   直绘呈现（无 gamma——RE-33 全链无 pow/2.2）。扩展不可用/FBO 不完整 → 退回现有 LDR 管线并记日志。
    //   bloom 的 HDR 分支（/2、/4 链 + bloomhdr* uniform）直接消费该 FBO 纹理（免 RGBA8 拷贝钳制）。
    //   开关：opts.hdr 0/false 强制 LDR、1/true 强制尝试；缺省跟随 general.hdr。
    // ①(P-41 A1) 会话级 HDR 熔断后，自动路径（general.hdr）视为 false；?hdr=1 显式强制仍走 HDR
    // ①(P-58 H0-1) 自动分支再收紧：**只有场景确实消费 HDR 才自动开**（判据抽成 resolveHdrWant，
    //   纯函数、可无浏览器单测）。理由：HDR 链的唯一消费者是 bloom（framebuffer 纹理只在
    //   runBloom 的 HDR 分支被采样），而 compositeLayer 把每层**无条件画进默认帧缓冲**（不画进 HDR FBO）
    //   → bloom 关时开 HDR 只会得到"从未被写入的 RGBA16F 纹理在帧末被全屏合成"= 整屏白/空。
    //   hina 3554161528 恰是全语料唯一 general.hdr=true 且 bloom=false 的包（第1项白屏的根因）。
    const hdrWant = resolveHdrWant(opts, general, hdrForceLdrSession)
    const hdrExt = !!(gl.getExtension && (gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float')))
    let hdrFbo = null
    if (hdrWant && hdrExt) {
      const f = getFBO(width, height, 'hdr-scene', { float: 'half' })
      if (f && f.hdr === 'half') hdrFbo = f
    }
    hdrSceneState = { active: !!hdrFbo, fbo: hdrFbo, width, height }
    if (hdrFbo) {
      if (!hdrLogged) {
        hdrLogged = true
        try { onLog('[hdr] 场景渲进 RGBA16F FBO ' + width + 'x' + height + '（合成直绘无 gamma）') } catch {}
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, hdrFbo.fbo)
    } else {
      if (hdrWant && !hdrLogged) {
        hdrLogged = true
        try { onLog('[hdr] 浮点 RT 不可用（EXT_color_buffer_half_float/EXT_color_buffer_float 缺失或 FBO 不完整），退回 LDR 管线') } catch {}
      }
      // ①(P-90) 非 HDR：场景画到"本帧目标" —— `q=off` 时就是 `null`（默认帧缓冲，
      //   **与改动前同一次调用**）；`q!=off` 时是内部离屏 FBO（`sceneTargetFbo()`）。
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTargetFbo())
    }
    if (general.clearenabled !== false) {
      const cc = parseVec3Local(general.clearcolor || '0 0 0')
      gl.clearColor(cc[0], cc[1], cc[2], 1)
    } else {
      gl.clearColor(0, 0, 0, 1)
    }
    gl.clear(gl.COLOR_BUFFER_BIT)
    // ①(MERGED-1 D 相机节点 2026-09-12) 节点相机：origin/zoom 属性动画逐帧采样（evalPropAnimation，
    //   options.fps/length/mode 官方 Tween 口径）。开关：opts.cam===0/'0' 关（静态相机）；
    //   缺省=节点 origin 有动画即用（cameraNode.active）；?cam=node 强制（无动画节点时按静态基值，
    //   语料 0 例，行为同缺省）。满幅背景层豁免平移（viewBg=恒等），zoom 窗口对全部层生效。
    // ①(P-81 用户批准"相机层动画要完整接，但是你要保留可以回退的按钮") **`?campose=` 四档**：
    //   `full`（缺省）= 相机层激活 ⇒ pose = origin（**关键帧动画**优先）+ zoom（动画→用户属性绑定→静态值）；
    //   `legacy` = **P-76 的行为**（只接"用户属性绑定的 zoom"，origin 平移恒等）；
    //   `off`  = 完全不接相机层（**逐位**回到 P-76 之前）。
    //   为什么 full 默认**不**施加脚本 origin 的**静态快照**：语料 14 个相机包的 `origin` 是逐属性脚本
    //   （`{script:…, value:"2434.38477 725.25134 500"}`），静态基值是**编辑器保存时刻的快照**；
    //   施加快照会把整幅取景平移 **−2434px**（实测：砂狼白子 3327063360 的 `纯色/文本1/文本2`
    //   在 `?cam=node` 下 x0 各 −2434），那既不是官方运行时值、也不是今天的画面。
    //   ⇒ ①(P-120 2026-09-18) 这 14 个包的 origin 改走**宿主求值结果**（`origin.script` 真的跑，
    //     见下面的 `originScriptSrc` 分支与文件头 P-120 注释）；`?cam=node`（既有开关，语义不变）
    //     仍然是"强制施加快照"的 A/B 口。
    //   `fov`：①(P-107 更正) **已有落点** —— 透视档（`?projmode=persp`，或缺省 auto + 无
    //   `general.orthogonalprojection`）由 `buildCamera` 的透视档消费，取值链见那里的 fovPick
    //   （pose 关键帧 → 用户属性绑定 fovFromUser → 绑定静态值 → 节点值 → `general.fov` → 50）。
    //   正交包（语料 20/21）投影仍是 `mat4Ortho` ⇒ fov 写进 pose 对它们**零影响**（`camera-pose-test` 有逐位回归）。
    const __camposeMode = (() => {
      // ①(P-84) 唯一真值表：opts（测试）> window.__mpwCampose（demo 的 🎥 相机 按钮，实时）
      //   > ?campose=（模块加载时读一次）。见 resolveCamposeMode 的注释。
      const live = (typeof window !== 'undefined' && window) ? window.__mpwCampose : undefined
      let fb = 'full'
      try { fb = String(CAMPOSE_MODE) } catch (e) { fb = 'full' }
      return resolveCamposeMode(opts.campose, live, fb)
    })()
    let camPose = null
    let camPoseFull = false
    const camNode = scene.cameraNode
    if (camNode && opts.cam !== 0 && opts.cam !== '0' && __camposeMode !== 'off') {
      const force = opts.cam === 'node'
      if ((__camposeMode === 'full') && (camNode.active || force)) {
        // 动画优先；`{script:…}` 的静态快照只在 `?cam=node` 强制时才用（见上：实测 −2434px，默认不碰）
        const ovAnim = evalPropAnimation(camNode.originRaw, time)
        // ①(P-107) `?cam=node` 的静态回退改用 parseVec3（同时吃 `{…,value}` 与**静态字符串**两种原文）：
        //   旧写法只读 `originRaw.value`，对静态字符串（3509243656 `origin:"0 0 6"`）会得到 [0,0,0]
        //   ⇒ 那个包的相机位置永远施加不上。语料 10 个相机对象里只有它用字符串 ⇒ 其余包逐位不变。
        const ovStatic = force ? parseVec3(camNode.originRaw) : null
        const ov = ovAnim || ovStatic
        let zv = null
        if (camNode.zoomRaw) {
          const z = evalPropAnimation(camNode.zoomRaw, time)
          if (z && z[0] > 0.0001 && isFinite(z[0])) zv = z[0]
          else if (camNode.zoomRaw.value !== undefined) {
            const b = Number(camNode.zoomRaw.value)
            if (isFinite(b) && b > 0.0001) zv = b
          }
        }
        // ①(P-81) zoom 还可以来自**用户属性绑定**（面板"🔘镜头大小"）：动画/静态都没有时用它
        if (zv === null && typeof camNode.zoomFromUser === 'number' && camNode.zoomFromUser > 0.0001) zv = camNode.zoomFromUser
        let fv = null
        const fa = evalPropAnimation(camNode.fovRaw, time)
        if (fa && isFinite(fa[0]) && fa[0] > 0) fv = fa[0]
        // ①(P-107) fov 的三级回退与 zoom 同形：关键帧（fa）→ **用户属性绑定**（面板"视场"滑块）
        //   → 绑定原文静态值 / 节点值。透视档消费；正交档写进 pose 也无落点。
        else if (typeof camNode.fovFromUser === 'number' && isFinite(camNode.fovFromUser) && camNode.fovFromUser > 0) fv = camNode.fovFromUser
        else if (camNode.fovRaw && typeof camNode.fovRaw === 'object' && camNode.fovRaw.value !== undefined
          && isFinite(Number(camNode.fovRaw.value)) && Number(camNode.fovRaw.value) > 0) fv = Number(camNode.fovRaw.value)
        else if (typeof camNode.fov === 'number' && camNode.fov > 0) fv = camNode.fov
        // ①(P-107) pose 带上 **z**（相机位置的第 3 个分量）：透视档的"节点锚定"要用它当相机 z；
        //   正交档只读 x/y/zoom/fov ⇒ 多一个字段对既有画面零影响。
        if (ov) { camPose = { x: ov[0], y: ov[1], z: ov[2], zoom: zv, fov: fv }; camPoseFull = true }
      } else if (__camposeMode === 'full' && !force && camNode.originScriptSrc) {
        // ①(P-120) **相机 origin 逐属性脚本**：用宿主求值结果代替静态 `.value`（失败回退静态快照；
        //   无宿主/无用户属性表 ⇒ 保持不施加 = 改动前行为）。求值/重算/留痕全在
        //   `cameraOriginFromScript` 里（宿主 = 既有 `elysia/scene-scripts.js`，见文件头 P-120 注释）。
        const st = cameraOriginFromScript(camNode, __qOutW, __qOutH, time)
        const ovEval = st.value
        if (ovEval) {
          // zoom/fov 取值链与上面的关键帧档**同形**，只有一处刻意的顺序差别：zoom 用户绑定优先
          //   —— 这 14 个包的 zoom 是 `{user:"newproperty30"}`，改动前它们走的是 P-76 的
          //   `__zoomOnly` 兜底（= 施加用户滑块的 zoom、origin 平移取 0）⇒ 这里保持"用户绑定优先"
          //   才能让 zoom 滑块的**可观测行为逐值不变**（默认 1 时 framed/1 两档相同）。
          let zv = null
          if (typeof camNode.zoomFromUser === 'number' && isFinite(camNode.zoomFromUser) && camNode.zoomFromUser > 0.0001) zv = camNode.zoomFromUser
          else if (camNode.zoomRaw) {
            const z = evalPropAnimation(camNode.zoomRaw, time)
            if (z && z[0] > 0.0001 && isFinite(z[0])) zv = z[0]
            else if (camNode.zoomRaw.value !== undefined) {
              const b = Number(camNode.zoomRaw.value)
              if (isFinite(b) && b > 0.0001) zv = b
            }
          }
          let fv = null
          const fa = evalPropAnimation(camNode.fovRaw, time)
          if (fa && isFinite(fa[0]) && fa[0] > 0) fv = fa[0]
          else if (typeof camNode.fovFromUser === 'number' && isFinite(camNode.fovFromUser) && camNode.fovFromUser > 0) fv = camNode.fovFromUser
          else if (camNode.fovRaw && typeof camNode.fovRaw === 'object' && camNode.fovRaw.value !== undefined
            && isFinite(Number(camNode.fovRaw.value)) && Number(camNode.fovRaw.value) > 0) fv = Number(camNode.fovRaw.value)
          else if (typeof camNode.fov === 'number' && camNode.fov > 0) fv = camNode.fov
          camPose = { x: ovEval[0], y: ovEval[1], z: ovEval[2], zoom: zv, fov: fv }
          camPoseFull = true
        }
      }
    }
    // ①(P-76) 相机层**不是**"origin 关键帧"激活，但 `zoom` 来自**用户属性绑定**（面板"🔘镜头大小"滑块）：
    //   只应用 **zoom 窗口**、**origin 平移取 0**（x=y=0 ⇒ view 恒等，与今天逐位相同；zoom=1 时
    //   framed/1 也不变 ⇒ 默认值零回归）。为什么不连 origin 一起用：语料 14 个包的 origin 是逐属性
    //   脚本，静态基值 `2434.38 725.25 500` 是编辑器残留，实测按它平移取景会偏 **2434px**（P-69 保持 inert）。
    //   ①(P-120) 这 14 个包走上面的 `originScriptSrc` 分支（脚本求值），到不了这一路；本路仍是
    //   "无脚本相机 + 用户拖了 zoom 滑块"的兜底，`legacy` 档行为不变。
    //   ⚠ 这一路在 `full` 下是**兜底**（相机未激活时才走），在 `legacy` 下就是全部行为。
    if (!camPose && camNode && opts.cam !== 0 && opts.cam !== '0' && __camposeMode !== 'off'
        && typeof camNode.zoomFromUser === 'number' && camNode.zoomFromUser > 0.0001 && camNode.zoomFromUser !== 1) {
      camPose = { x: 0, y: 0, zoom: camNode.zoomFromUser, __zoomOnly: true }
    }
    // ①(P-76 关键发现 / P-81 已接) **`camPose` 过去从来没交给 `buildCamera`** —— `buildCamera` 读的是
    //   `opts.cameraPose`（全仓库只有 `camera-node-test.mjs` 传它，demo.html 不传）⇒ 相机层的
    //   origin/zoom 关键帧动画在真实渲染路径里**从未生效**。P-81 起 `full` 档把它交过去
    //   （`legacy` 档仍只交"用户绑定的 zoom"，`off` 档两条都不交）。
    const cam = camPoseFull
      ? buildCamera(scene, width, height, Object.assign({}, opts, { cameraPose: { x: camPose.x, y: camPose.y, z: camPose.z, zoom: camPose.zoom, fov: camPose.fov } }))
      : ((camPose && camPose.__zoomOnly)
        ? buildCamera(scene, width, height, Object.assign({}, opts, { cameraPose: { x: 0, y: 0, zoom: camPose.zoom } }))
        : buildCamera(scene, width, height, opts))
    let viewProj = mat4Multiply(cam.projection, cam.view)
    // 满幅背景层专用（相机平移豁免；无相机姿态时与 viewProj 相同）
    let viewProjBg = cam.viewBg ? mat4Multiply(cam.projection, cam.viewBg) : viewProj
    // ①(P-100) 角色层适配档 + 蒙皮层相机参数（每帧解析一次；`compositeLayer` 与 `onMeshLayer` 共用）。
    //   `charfit=legacy` 是"逐位回到改动前"的逃生口 ⇒ 它同时要**关掉蒙皮层的相机接线**
    //   （旧的 MESH_VS 只按设计画布 1:1 映射，角色钉在屏幕上不动）。
    const __charfit = resolveCharfitMode(opts.charfit, CHARFIT_MODE)
    charfitMode = __charfit
    const meshCamInfo = (__charfit !== 'legacy' && cam.cameraPose)
      ? { view: [cam.viewX, cam.viewY], framed: [cam.framedW, cam.framedH] }
      : null
    const isFullCanvasLayer = (layer) => {
      if (!camPose) return true // 无相机姿态 → 全层同矩阵
      const sw2 = cam.projW || width, sh2 = cam.projH || height
      return layer.size[0] * layer.scale[0] >= sw2 - 1 && layer.size[1] * layer.scale[1] >= sh2 - 1
    }

    // ---- 场景级视差（cameraparallax）——移植 linux-wallpaperengine 语义 ----
    // disp = 平滑后的(鼠标中心偏移 × amount × influence)；每层位移 = (parallaxDepth + amount) × disp × 场景宽/高
    const parRaw = general.cameraparallax
    // 修复(2026-09-10)：此处此前声明 const parEnabled 遮蔽了闭包外层 let parEnabled（compositeLayer
    // 读外层恒 false）→ 对象级视差（layer.parallaxDepth）永不生效。改为赋值外层变量。
    parEnabled = parRaw === true || (parRaw !== null && typeof parRaw === 'object' && parRaw.value === true)
    parAmount = typeof general.cameraparallaxamount === 'number' ? general.cameraparallaxamount : 0
    // ①(2026-09-12 用户要求) opts.parallaxOff（demo 默认给 true，`?parallax=1` 关掉该开关）→ 视差整体停用
    if (parEnabled && opts.parallax !== false && opts.parallaxOff !== true) {
      attachParallaxListener()
      const influence = typeof general.cameraparallaxmouseinfluence === 'number' ? general.cameraparallaxmouseinfluence : 1
      const delay = typeof general.cameraparallaxdelay === 'number' ? general.cameraparallaxdelay : 1
      const parDt = time - lastParallaxTime
      lastParallaxTime = time
      // ①(RE-24 官方) 平滑：t = 1 − exp(−(frameTime·ln100)/delay) → delay 秒后残余 ≈1%（100 倍沉降）。
      //   旧实现用 `delay*dt` 线性系数（无单位含义，delay<1 时几乎瞬时、delay>1 时抖动）。
      let k = 1
      if (isFinite(delay) && delay > 0) k = 1 - Math.exp(-(Math.max(0, parDt) * Math.LN100) / delay)
      k = Math.min(1, Math.max(0, k))
      // ①(RE-24 官方 2026-09-14) 鼠标向量：归一化 → **世界像素**（乘设计画布）+ y 取反
      //   （换算与推导见本文件「视差」段落头部注释：按我们自己的 y-down 世界空间推出，不引用上游表达式）。
      //   depth 与 amount 在每层位移时按官方公式相乘（旧 `(depth + amount)` 相加已废弃）。
      const orthoW = cam && cam.projW ? cam.projW : width
      const orthoH = cam && cam.projH ? cam.projH : height
      const tx = (0.5 - parallaxState.x) * orthoW * influence
      const ty = (0.5 - parallaxState.y) * orthoH * influence
      if (k > 0) {
        parDispX += (tx - parDispX) * k
        parDispY += (ty - parDispY) * k
      }
    } else {
      parDispX = 0; parDispY = 0
    }

    __renderSeq++
    const __audit = __renderSeq <= Number(opts.auditFrames || 1)
    __auditNow = __audit
    // ①(P-59) 粒子预算按帧重置：总份额 = total，均分基数 = 本帧可见粒子层数（含没纹理会被跳过的层，
    //   偏差只影响"每层多拿一点份额"，不会超总量）。
    partFrame.left = PARTICLE_BUDGET.total
    partFrame.layers = 0
    partFrame.layerTotal = 0
    for (const l of scene.layers) if (l.particleDef && l.visible) partFrame.layerTotal++
    partStat.layers = 0; partStat.drawn = 0; partStat.alive = 0; partStat.skippedTex = 0; partStat.skippedBudget = 0; partStat.capped = 0
    partStat.rateCapped = 0; partStat.renderers = {}
    // ①(P-131 批D) 音频发射记账逐帧重置（audioLayers 记"本帧哪些层真的在吃音频包络"）
    partStat.audioModulated = 0; partStat.audioNoSource = 0; partStat.audioLayers = {}
    // ①(P-144 子系) 子系记账逐帧重置
    partStat.children = { parents: 0, specs: 0, drawn: 0, kinds: { static: 0, eventfollow: 0, eventspawn: 0, eventdeath: 0 },
      unresolved: 0, texMissing: 0, budgetSkipped: 0, depthCapped: 0, noParent: 0, followCleared: 0,
      bursts: 0, spawned: 0, capSkipped: 0, probRejected: 0, gateClosed: 0 }
    // ①(P-74 ④) 效果链台账每帧重置
    fxStat.layers = 0; fxStat.last = null; fxStat.perLayer = {}
    // ①(P-149) overbright 生效记账逐帧重置（`minFactor/maxFactor` 缺省 1 = "本帧没有层吃因子"）
    partStat.overbright = { layers: 0, lastFactor: 1, minFactor: 1, maxFactor: 1, lastLayer: '' }
    // ①(P-65) trail/形状通道记账同样逐帧重置
    partStat.trailLayers = {}; partStat.trailSegments = 0; partStat.trailDrawn = 0; partStat.trailDegenerate = 0; partStat.trailSkipped = 0
    partStat.shapeFrom = { rgba: 0, rg88: 0, r8: 0, unknown: 0 }
    partStat.simSteps = 0; partStat.simUpdates = 0   // ①(P-69) 本帧粒子模拟代价（步数 / 粒子更新次数）
    // ①(P-103) 本轮四个档位的逐帧记账同样逐帧重置
    partStat.protQuads = 0; partStat.pquadQuads = 0; partStat.expApplied = 0; partStat.spawnSpeeds = 0
    partStat.colorUni = 0; partStat.colorAttr = 0   // ①(P-126 A) 颜色通道记账（u_Color 上提 / 顶点属性批数）
    let __li = -1
    // ①(P-41 A1) HDR 帧错误探针：本帧 HDR FBO 绑定期间"绘制后新出现"的首个 GL 错误
    let __hdrFrameErr = null
    const __hdrActive = !!(hdrSceneState && hdrSceneState.active)
    for (const layer of scene.layers) {
      __li++
      if (__audit) { try { onLog('[首帧] #' + __li + ' ' + (layer.name || layer.id) + ' vis=' + (layer.visible ? 1 : 0) +
        ' tex=' + (layer.textureName || '-') + ' skin=' + (layer.__skinReady ? 1 : 0) +
        ' fx=' + ((layer.effects && layer.effects.length) || 0) + ' part=' + (layer.particleDef ? 1 : 0)) } catch {} }
      // ①(P1-9 官方 2026-09-14) 动画驱动的 visible：parseScene 已把 visible 关键帧收进 layer.anim.visible
      //   （extractAnimKf）；官方 ApplyLayerVisibility 每帧求值（WPSceneScriptHost.cpp:5452-5481 同层每帧）。
      //   阶跃语义：关键帧插值 >0.5 即可见。
      let __layerVis = layer.visible
      if (layer.anim && layer.anim.visible && time !== undefined) {
        try {
          const ch = layer.anim.visible.get ? layer.anim.visible.get('c0') : layer.anim.visible
          const vv = animValueAt(ch, time)
          if (vv !== null && vv !== undefined) __layerVis = vv > 0.5
        } catch (e) { /* 关键帧异常 → 静态值兜底 */ }
      }
      // ①(2026-09-12) `?ln=N` 逐层调试：demo 给非目标层打 __lnHidden（容器保留，父链/定位不变）
      if (layer.__lnHidden) { if (__audit) { try { onLog('[首帧] . #' + __li + ' 跳过(逐层调试)') } catch {} } continue }
      if (!__layerVis || layer.isContainer) { if (__audit) { try { onLog('[首帧] . #' + __li + ' 跳过(不可见/容器)') } catch {} } continue }
      // ①(2026-09-12) 蒙皮层：在**其原层序位置**回调外部绘制 GPU mesh（而不是全部画在最后）。
      // 之前"全部最后画"会覆盖本该在它前面的层（用户实测：飘带跑到身后、头发/眼睛错位）。
      if (opts.onMeshLayer && layer.__skinReady) {
        // ①(P-41 A1) HDR 探针：mesh 回调趟同样做前后对照（原来 continue 跳过了错误检测）
        let __preErr = 0
        if (__hdrActive) { try { __preErr = gl.getError() } catch (e) {} }
        try { opts.onMeshLayer(layer, meshCamInfo) } catch (e) {}
        if (__hdrActive) {
          const ge = gl.getError()
          if (ge !== gl.NO_ERROR) {
            if (!__hdrFrameErr) __hdrFrameErr = { layer: String(layer.name || layer.id), code: '0x' + ge.toString(16), path: 'mesh' }
            const key = (layer.name || ('layer#' + layer.id)) + ' :: glErr=0x' + ge.toString(16)
            if (!layerErrorLogged.has(key)) {
              layerErrorLogged.add(key)
              try { onLog('[we-scene] 层 "' + (layer.name || layer.id) + '" GPU 错误 0x' + ge.toString(16)) } catch {}
            }
          }
        }
        continue
      }
      // 粒子层：parseScene 已把 o.particle（字符串路径/内联对象）解析为 particleDef。
      // 无 def（字符串路径但未注入 readParticleDef）时跳过——不该被 ?nofx 关闭（粒子不是效果）。
      if (layer.particle && !layer.particleDef) continue
      // ①(P-41 A1) HDR 探针前排水：先吃掉历史残留旗标，之后 getError 只可能是本层绘制产生的
      if (__hdrActive) { try { gl.getError() } catch (e) {} }
      try {
        // ①(MERGED-1 D) 满幅背景层用 viewProjBg（相机平移豁免；无姿态时两矩阵相同）
        const vpL = isFullCanvasLayer(layer) ? viewProjBg : viewProj
        const __lt0 = perfState.enabled ? performance.now() : 0
        if (layer.particleDef) {
          renderParticleLayer(layer, textures, cam, vpL, width, height, time)
          // ①(P-136 用户第 4 项：照抄上游 MIT 实现) 上游 `render/vendor/we-scene/render/pointer.js`
          //   的文件头把这条顺序写成硬约束：「beginFrame 必须在**本帧所有消费方之后**调用」
          //   —— 若在消费前把 last 推到 current，帧间位移当场归零。本仓库的消费方是粒子层
          //   （lockToPointer 控制点 + 每帧 `setPointer`），故在每层消费完之后推进一次。
          //   没有消费方时是无副作用的幂等记账（`last*` 只是给下一帧留快照）。
          if (!CURSOR_OFF) __ptrSource.beginFrame()
        } else {
          await renderLayer(layer, textures, cam, vpL, width, height, time)
        }
        if (perfState.enabled) {
          const nm = String(layer.name || layer.id)
          const rec = perfState.layerRoll.get(nm) || { sum: 0, n: 0 }
          rec.sum += performance.now() - __lt0; rec.n++
          perfState.layerRoll.set(nm, rec)
        }
      } catch (e) {
        // 单层失败不拖垮整帧：记录后继续渲染其余层
        const key = (layer.name || ('layer#' + layer.id)) + ' :: ' + (e && e.message)
        if (!layerErrorLogged.has(key)) {
          layerErrorLogged.add(key)
          try { onLog('[we-scene] 跳过渲染失败的层 "' + (layer.name || layer.id) + '": ' + (e && e.message)) } catch {}
        }
      }
      // GPU 静默错误检测（WebGL 很多错误不抛异常）
      {
        const ge = gl.getError()
        if (ge !== gl.NO_ERROR) {
          // ①(P-41 A1) HDR 帧把首个"绘制后新出现"的错误归因（驱动不支持浮点场景 RT 的实锤）
          if (__hdrActive && !__hdrFrameErr) __hdrFrameErr = { layer: String(layer.name || layer.id), code: '0x' + ge.toString(16), path: 'layer' }
          const key = (layer.name || ('layer#' + layer.id)) + ' :: glErr=0x' + ge.toString(16)
          if (!layerErrorLogged.has(key)) {
            layerErrorLogged.add(key)
            try { onLog('[we-scene] 层 "' + (layer.name || layer.id) + '" GPU 错误 0x' + ge.toString(16)) } catch {}
          }
        }
      }
    }
    if (__audit) { try { onLog('[首帧] 层循环结束（共 ' + (__li + 1) + ' 层）') } catch {} }
    gl.bindVertexArray(null)
    // ①(MERGED-1 C HDR) 场景浮点 RT → 默认 framebuffer 直绘呈现（无 gamma）
    // ①(P-41 A1) 自动 HDR 熔断：本帧（HDR FBO 绑定期）出现"绘制后新出现"的 GL 错误 → 该设备的
    //   浮点场景 RT 不可用（真机 hina 实锤：每层 0x502 + 呈现失败 = 全屏只剩清屏色）。
    //   记录会话熔断（general.hdr 自动路径不再启用 HDR），**当场按 LDR 重渲本帧**（首帧/缩略图即正确）。
    //   ?hdr=1 显式强制时不熔断（诊断用）；renderer.hdrFallback 供上报取证。
    if (__hdrActive && __hdrFrameErr && !__hdrRetry &&
        !(opts.hdr === 1 || opts.hdr === true || opts.hdr === '1')) {
      hdrForceLdrSession = { at: new Date().toISOString(), layer: __hdrFrameErr.layer, code: __hdrFrameErr.code, path: __hdrFrameErr.path }
      try { onLog('[hdr] 浮点场景 FBO 绘制错误 ' + __hdrFrameErr.code + '（层 "' + __hdrFrameErr.layer + '"）→ 本会话退回 LDR 管线（?hdr=1 可强制重试）') } catch {}
      hdrSceneState = { active: false, fbo: null, width, height }
      // ①(P-90) 重试必须传**原始输出尺寸**（`__qOutW/__qOutH`），不能传这里的 `width/height` ——
      //   开了 `?q=` 之后 `width/height` 已被遮蔽成**内部尺寸**，拿它重入会把内部比例**再乘一次**
      //   （q=low 下 640×360 → 320×180，且帧末上采样目标也缩成内部尺寸）。
      return renderScene(scene, textures, __qOutW, __qOutH, time, true)
    }
    if (hdrSceneState && hdrSceneState.active) presentHdrScene(hdrSceneState)
    // ①(P-90) `?q=` 帧末上采样：内部离屏 FBO → 默认帧缓冲（把 width/height 的遮蔽还回去）。
    //   **必须在 runBloom 之前**（bloom 从默认帧缓冲 copyTexSubImage2D 取场景色），
    //   也必须在 FXAA 之前（FXAA 采样的就是上采样后的画布）。
    //   顺序：内部FBO →[此处]→ 画布 → bloom → FXAA。
    if (qfbo) {
      presentInternalScene({ fbo: qfbo.entry, w: qfbo.w, h: qfbo.h, outW: qfbo.outW, outH: qfbo.outH })
      qPresentRuns++
      if (qPresentRuns === 1) {
        try {
          onLog('[P-90] q=' + quality.q + ' 内部渲染 ' + qfbo.w + 'x' + qfbo.h + ' → 画布 ' + qfbo.outW + 'x' + qfbo.outH
            + '（双线性上采样，1 次全屏 draw；?q=off 时不建 FBO、不加上采样）')
        } catch (e) {}
      }
    }
    frameTarget = null
    // ①(MERGED-2 B) 帧计时结束：GPU 查询收尾 + 滚动窗口 + auto 降级判定 + stats 钩子（关闭时整段跳过）
    if (perfState.enabled) {
      let gpuMs = null
      if (__pfQuery) {
        try { gl.endQuery(perfState.gpuExt.TIME_ELAPSED_EXT) } catch (e) {}
      }
      // 读上一帧的查询槽（GPU 异步，跳过未就绪的帧）
      {
        const prevQ = perfState.qring[(perfState.qidx + perfState.qring.length - 1) % perfState.qring.length]
        if (prevQ && perfState.qidx > 0) {
          try {
            if (gl.getQueryParameter(prevQ, gl.QUERY_RESULT_AVAILABLE)) {
              const ns = gl.getQueryParameter(prevQ, gl.QUERY_RESULT)
              if (typeof ns === 'number' && ns > 0) { perfState.lastGpuMs = ns / 1e6; perfState.gpuOk = true }
            }
          } catch (e) {}
        }
      }
      perfState.qidx++
      const frameMs = performance.now() - __pfT0
      perfState.frames.push({ ms: +frameMs.toFixed(2), gpuMs: perfState.lastGpuMs != null ? +perfState.lastGpuMs.toFixed(2) : null, draws: perfState.draws })
      if (perfState.frames.length > 120) perfState.frames.shift()
      perfState.draws = 0
      // 纹理显存估算（宽×高×4；视频/未解出像素的条目按条目宽高）
      let texBytes = 0
      try { for (const t of textures.values()) { if (t && t.width && t.height) texBytes += t.width * t.height * 4 } } catch (e) {}
      perfState.texBytesEst = texBytes
      // ?perf=auto：p95 帧时间超 25ms → 升一档（粒子 maxcount 1/2→1/4 不停发；fboCap 0→0.75→0.5→0.35）
      if (perfState.auto && perfState.frames.length >= 30) {
        const sorted = perfState.frames.map((f) => f.ms).sort((a, b) => a - b)
        const p95 = sorted[Math.floor(sorted.length * 0.95)]
        const nextLevel = Math.min(3, perfState.autoLevel + 1)
        const LADDER = [
          { fboCap: 0, partMul: 1 },
          { fboCap: 0.75, partMul: 0.5 },
          { fboCap: 0.5, partMul: 0.25 },
          { fboCap: 0.35, partMul: 0.25 },
        ]
        if (p95 > PERF_P95_LIMIT && perfState.autoLevel < 3) {
          const before = p95
          perfState.autoLevel = nextLevel
          const L = LADDER[nextLevel]
          perfState.partMul = L.partMul
          // ①(P-68) 高分辨率档（非 legacy）抑制效果链降采样：用户显式要 ≥1080p 时再把效果链 FBO
          //   降到画布以下 = 把刚提上去的分辨率糊回去（视频层带效果链时尤其明显）。
          //   粒子降档照常；`?fbocap=low` 恢复旧阶梯做 A/B。effective 值记账进 videoStats.perfFboCap。
          const effFboCap = perfLadderFboCap(nextLevel, RES_TIER, FBO_AUTO_LOW)
          fboCapFactor = effFboCap
          videoStat.perfLevel = nextLevel
          videoStat.perfFboCap = effFboCap
          if (effFboCap !== L.fboCap) videoStat.perfSuppressed++
          const msg = '[perf] 降级档位 ' + nextLevel + '（p95 ' + before.toFixed(1) + 'ms > ' + PERF_P95_LIMIT + 'ms）：粒子×' + L.partMul + '，fboCap=' + effFboCap + (effFboCap !== L.fboCap ? '（P-68：' + RES_TIER.name + ' 档抑制效果链降采样，原阶梯 ' + L.fboCap + '，?fbocap=low 恢复）' : '') + '（不停发；观察帧时间）'
          perfState.autoLog.push({ at: Date.now(), level: nextLevel, beforeP95: +before.toFixed(1) })
          try { onLog(msg) } catch (e) {}
          perfState._afterMark = { at: Date.now(), level: nextLevel }
        } else if (perfState._afterMark && Date.now() - perfState._afterMark.at > 3000) {
          // 降级后 3s：报告"降级后帧时间"
          const msg = '[perf] 档位 ' + perfState.autoLevel + ' 生效后 p95=' + p95.toFixed(1) + 'ms（降级前 ' + perfState.autoLog[perfState.autoLog.length - 1].beforeP95 + 'ms）'
          perfState.autoLog[perfState.autoLog.length - 1].afterP95 = +p95.toFixed(1)
          try { onLog(msg) } catch (e) {}
          perfState._afterMark = null
        }
      }
      // stats 槽：demo 面板 / 外部扩展消费（EXTENSION-HOOKS.md）。关闭 perf 时也调用
      // runPostFrameHooks（预留接口的既定语义），但 stats 内容最小化。
      try {
        runPostFrameHooks({
          t: time, frameMs: +frameMs.toFixed(2), gpuMs: perfState.lastGpuMs != null ? +perfState.lastGpuMs.toFixed(2) : null,
          draws: perfState.frames.length ? perfState.frames[perfState.frames.length - 1].draws : 0,
          layers: scene.layers.length, textures: textures.size, texBytesEst: texBytes,
          layerMs: [...perfState.layerRoll.entries()].map(([k, v]) => [k, +(v.sum / Math.max(1, v.n)).toFixed(2), v.n]),
          auto: perfState.auto ? { level: perfState.autoLevel, log: perfState.autoLog.slice(-4) } : null,
          perf: perfState.enabled,
          // ①(P-59) 粒子预算取证：档位/上限/本帧命中数（真机上报能区分"没贴图跳过"与"预算跳过"）
          particles: Object.assign({}, partStat),
        })
      } catch (e) {}
    } else {
      // perf 关闭：保持预留钩子的既有语义（外部扩展仍能拿到最小 stats），不带计时字段
      try { runPostFrameHooks({ t: time, perf: false, layers: scene.layers.length, particles: Object.assign({}, partStat) }) } catch (e) {}
    }
  }

  function texUnitSnapshot() {
    try {
      let s = ''
      const snap = (u) => {
        gl.activeTexture(gl.TEXTURE0 + u)
        const t = gl.getParameter(gl.TEXTURE_BINDING_2D)
        s += (t ? 'T' + u + ':' + (t.__mpwId || t.__mpwS || '?') : 'T' + u + ':null') + ' '
        return t
      }
      for (let u = 0; u < 4; u++) snap(u)
      return s.trim()
    } catch { return '' }
  }
  const passTagErr = async (tag, ctx) => {
    const ge = gl.getError()
    if (ge !== gl.NO_ERROR) {
      fxChainGpuErr = ge
      const key = (ctx || '?') + ' @' + tag + ' :: 0x' + ge.toString(16) + ' :: ' + texUnitSnapshot()
      if (!passErrorLogged.has(key)) {
        passErrorLogged.add(key)
        try { onLog('[we-scene] GL 错误 ' + key) } catch {}
      }
    }
    return ge
  }
  const TRACE_ON = (() => { try { return new URLSearchParams(location.search).has('trace') } catch { return false } })()
  const traceChk = (tag) => {
    if (!TRACE_ON) return
    try {
      const ge = gl.getError()
      if (ge !== gl.NO_ERROR) {
        const key = 'TRACE @' + tag + ' :: 0x' + ge.toString(16)
        if (!passErrorLogged.has(key)) {
          passErrorLogged.add(key)
          try { onLog('[we-scene] GL 错误 ' + key) } catch {}
        }
      }
    } catch {}
  }
  const FX_DISABLED = (() => { try { return new URLSearchParams(location.search).has('nofx') } catch { return false } })()
  const FX_FILTER = (() => { try { return new URLSearchParams(location.search).get('fx') || '' } catch { return '' } })()
  function fxAllowed(effectName) {
    if (FX_DISABLED) return false
    // ①(P-90) `?pp=off` 门控①（对上游 `renderer.js:2933`「图层效果列表置空 ⇒ 直通」）：
    //   后处理档 = off 时该层的效果链整体不跑，层走"无效果直绘"（`effects.length===0` 分支）。
    //   `pp=low|medium|high` 都**不**关效果链（只改 fboCapFactor 分辨率预算），与上游一致。
    if (quality.pp === 'off') return false
    if (!FX_FILTER) return true
    return String(effectName || '').indexOf(FX_FILTER) >= 0
  }
  // 方案B：效果链 GPU 回退。本层效果链内任何一步读到 GL 错误（如 0x502/0x501，
  // 凯尔希 背景正常 waterwaves 等）→ 放弃效果 FBO，直接画 base 纹理（绿幕/图层内容恢复）。
  // gpuErrProbe 在 renderLayer 效果分支入口清零；?nofxfb=1 可关掉回退（对照调试）。
  let fxChainGpuErr = gl.NO_ERROR
  const FXFB_DISABLED = (() => { try { return new URLSearchParams(location.search).has('nofxfb') } catch { return false } })()
  function fxFallbackActive(layer, where) {
    if (fxChainGpuErr === gl.NO_ERROR || FXFB_DISABLED) return false
    const key = 'fxfb::' + (layer.name || layer.id) + '::' + where
    if (!passErrorLogged.has(key)) {
      passErrorLogged.add(key)
      try { onLog('[we-scene] 效果链 GL 错误(' + where + ' 0x' + fxChainGpuErr.toString(16) + ') → 该层回退直接画 base 纹理: ' + (layer.name || layer.id)) } catch {}
    }
    return true
  }
  async function renderLayer(layer, textures, cam, viewProj, width, height, time) {
    if (opts.trace && /长发1|后发2|背景正常|右侧发|主体|眼睛组合/.test(String(layer.name || ''))) {
      try {
        const t = !layer.solid && layer.textureName ? textures.get(layer.textureName) : null
        onLog('[trace] ' + (layer.name || layer.id) + ' solid=' + layer.solid + ' texName=' + layer.textureName + ' texObj=' + (t ? ('ok' + t.width + 'x' + t.height + '@' + (t.glTex ? 'glTex' : 'NOGL')) : 'null') + ' origin=' + JSON.stringify(layer.origin && layer.origin.slice(0, 2)) + ' size=' + JSON.stringify(layer.size && layer.size.slice(0, 2)) + ' fx=' + ((layer.effects || []).length))
      } catch (e) { onLog('[trace] ' + (layer.name || '?') + ' ERR ' + e.message) }
    }
    // ①(终极二分) ?dbgred=1：目标层绘制为纯红块（区分 draw 是否发生 vs 纹理问题）
    if (layer.__dbgRed) {
      compositeLayer(copyProg, whiteTex, [1, 0, 0, 1], layer, cam, viewProj, width, height, time)
      return
    }
    const texObj = !layer.solid && layer.textureName ? textures.get(layer.textureName) : null
    // ①(W4 P-36) 图片层精灵帧 UV：仅当脚本宿主真的驱动过该层（setFrame→__texFrameForced
    //   钉帧 / play→__texFramePlay 按时间×frametime 自动推进）才接管 UV；否则清掉，
    //   保持 uvRect/整图旧行为（凯尔希眼睛等无脚本 sprite 层零影响）。
    try {
      if (texObj && texObj.sprite) {
        // ①(2026-09-21 官方 ITextureAnimation) 帧元数据**盖章**到图层：`frameCount`/`duration` 的真值
        //   只有这里拿得到（`texObj.sprite` 由 TEXS 帧表算出）。脚本侧的
        //   `getTextureAnimation().frameCount/duration` 由宿主把它回填进脚本可见对象
        //   （demo.html 的同帧同步），没有它作者脚本会静默走 `undefined` 分支。
        if (typeof layer.__texFrameCount !== 'number') layer.__texFrameCount = Number(texObj.sprite.numFrames) || 0
        if (typeof layer.__texFrameDuration !== 'number') layer.__texFrameDuration = Number(texObj.sprite.duration) || 0
      }
      if (texObj && texObj.sprite && (layer.__texFrameForced || layer.__texFramePlay)) {
        const ft = (texObj.sprite.frametime > 0) ? texObj.sprite.frametime : 0.1
        // ①(2026-09-21 官方 ITextureAnimation.rate) 速度倍率（默认 1）：
        //   · 未写过 `rate` ⇒ 算式与改动前**逐位相同**（`floor(time/ft)`）；
        //   · `rate > 0` ⇒ `floor(time*rate/ft)`（快放/慢放）；
        //   · `rate === 0` ⇒ **冻结在上一帧**（官方语义"速度为 0"= 停住；不能退化成 frame 0，
        //     真机语料 `playerplay.origin` 就是靠 `rate=0` 停在动画末帧做"播完就停"）；
        //   · 负值/非有限 ⇒ 当 0 处理（冻结）—— 倒放没有实现，不假装支持。
        const rateRaw = layer.__texRate
        const rate = (typeof rateRaw === 'number' && isFinite(rateRaw)) ? rateRaw : 1
        let frame
        if (layer.__texFrameForced) { frame = Number(layer.__texFrame) || 0; layer.__spriteFrame = frame }
        else if (!(rate > 0)) { frame = (typeof layer.__spriteFrame === 'number') ? layer.__spriteFrame : 0 }
        else { frame = Math.floor((time || 0) * rate / ft); layer.__spriteFrame = frame }
        const rct = spriteFrameRectUV(texObj.sprite, frame)
        layer.__spriteUV = rct ? [rct.u0, rct.v0, rct.u1, rct.v1] : null
      } else if (layer.__spriteUV) layer.__spriteUV = null
    } catch (e) { layer.__spriteUV = null }
    // WE 语义：对象 size 为 0 时回退（有纹理→纹理实际像素尺寸；solid/无纹理→整屏投影尺寸）
    if ((layer.size[0] === 0 || layer.size[1] === 0)) {
      if (texObj && texObj.width && texObj.height) {
        layer.size = [layer.size[0] === 0 ? texObj.width : layer.size[0], layer.size[1] === 0 ? texObj.height : layer.size[1]]
      } else if (layer.solid) {
        layer.size = [cam.projW, cam.projH]
      }
    }
    // 视频纹理层：把当前视频帧上传到 WebGL（①P-68：档位化上限 / 可配节流 / 直传 / 台账）
    if (texObj && texObj.video) {
      const v = texObj.video
      // ①(P-68) 脚本侧播放/暂停/跳转真正作用到 <video>（改动前 __videoPlay 只有写入点）
      applyVideoScriptControl(layer, v)
      // 就绪门槛放宽：部分 WebView readyState 停在 1 但已有可解码帧
      const ready = v.readyState >= 2 || (v.readyState >= 1 && v.currentTime > 0)
      if (ready) {
        videoStat.frames++
        // 上传门控：①P-68 起由档位/`?vthrottle=` 决定（legacy 档 = 改动前的硬编码 33ms）；
        // 部分设备 currentTime 不动但帧在变，也有设备 currentTime 变化但首帧未及时就绪——都不用作判据。
        const now = performance.now()
        const plan = videoUploadPlan({ videoWidth: v.videoWidth, videoHeight: v.videoHeight, now, lastUploadAt: texObj.lastUploadAt || 0, tier: RES_TIER, throttleMs: VTHROTTLE.ms })
        if (!plan.upload) {
          if (plan.reason === 'throttle') videoStat.skipThrottle++
        }
        else {
          gl.bindTexture(gl.TEXTURE_2D, texObj.glTex)
          try {
            let src = v
            if (!plan.direct) {
              // 超档位上限：2D canvas 等比缩到上限（legacy 档 = 改动前的 min(1280, videoWidth)）
              if (!texObj.canvas) {
                texObj.canvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null
              }
              if (texObj.canvas) {
                const tw = plan.tw
                const th = plan.th
                if (texObj.canvas.width !== tw || texObj.canvas.height !== th) {
                  texObj.canvas.width = tw; texObj.canvas.height = th
                }
                const ctx = texObj.canvas.getContext('2d')
                // ①(P-68) 旧实现不设 imageSmoothingQuality ⇒ 浏览器默认 'low'（3× 降采样只有廉价滤波）。
                //   legacy 档**不写**（逐位兼容）；其余档位显式 'high'（同一纹理尺寸下更少锯齿，纯软件滤波）。
                if (ctx && !RES_TIER.legacy && ctx.imageSmoothingQuality !== RES_TIER.smoothing) {
                  try { ctx.imageSmoothingQuality = RES_TIER.smoothing } catch (e) {}
                }
                ctx.drawImage(v, 0, 0, tw, th)
                src = texObj.canvas
                texObj.width = tw
                texObj.height = th
                videoStat.viaCanvas++
              }
            } else {
              // ①(P-68) 直传：源 ≤ 档位上限 ⇒ 不经 2D canvas、不缩尺寸（上限 ≤ 画布 ⇒ 无需 mip 链）
              texObj.width = v.videoWidth || texObj.width
              texObj.height = v.videoHeight || texObj.height
            }
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
            texObj.lastUploaded = v.currentTime
            texObj.lastUploadAt = now
            // ①(P-68) 上传台账（源 vs 实际、直传/中转、实测上传 fps、每秒字节）
            videoUploadTick(now)
            const vt = videoTexStatOf(String(layer.textureName || layer.name || layer.id), layer.textureName || layer.name)
            vt.src = (v.videoWidth || 0) + 'x' + (v.videoHeight || 0)
            vt.up = (texObj.width || 0) + 'x' + (texObj.height || 0)
            vt.direct = (src === v) ? 1 : 0   // 按**实际**上传源记账（无 document 时 canvas 建不出来 → 仍算直传）
            vt.uploads = videoStat.uploads
            vt.upFps = videoStat.upFps
            vt.viaCanvas = videoStat.viaCanvas
            videoStat.src = vt.src
            videoStat.up = vt.up
            videoStat.direct = vt.direct
            videoStat.bytesPerFrame = (texObj.width || 0) * (texObj.height || 0) * 4
            videoStat.MBps = +((videoStat.bytesPerFrame * videoStat.upFps) / 1e6).toFixed(1)
            videoStat.perfLevel = perfState.autoLevel
            syncVideoTexStat(layer, vt)
            maybeLogVideoStats(now)
            if (!texObj.firstUploaded) {
              texObj.firstUploaded = true
              try {
                onLog('[we-scene] 视频首帧已上传 ' + (texObj.width || '?') + 'x' + (texObj.height || '?') +
                  '（源 ' + vt.src + '，档位 ' + RES_TIER.name + '，上限 ' + vt.cap + '，' + (plan.direct ? '直传' : '2D 中转') + '，节流 ' + videoStat.throttleMs + 'ms）')
                // 亮度探针：canvas 1x1 抽样，判断 drawImage 是否为空/黑
                if (texObj.canvas) {
                  const px = texObj.canvas.getContext('2d').getImageData(Math.floor(texObj.canvas.width / 2), Math.floor(texObj.canvas.height / 2), 1, 1).data
                  onLog('[we-scene] 视频中心像素 rgba=' + px[0] + ',' + px[1] + ',' + px[2] + ',' + px[3])
                }
              } catch {}
            }
            if (texObj.uploadErr) { texObj.uploadErr = false; try { onLog('[we-scene] 视频上传恢复') } catch {} }
          } catch (e) {
            // 视频帧不可用（如跨域/解码中）：保留上一帧，仅首次记录
            videoStat.err++
            if (!texObj.uploadErr) {
              texObj.uploadErr = true
              try { onLog('[we-scene] 视频帧上传失败: ' + (e && e.message)) } catch {}
            }
          }
        }
      } else {
        videoStat.skipNotReady++
      }
    }
    // 空层防护：无纹理、非纯色、尺寸≤0 的层没有可见内容，跳过（否则会建 0 尺寸 FBO 触发 GL 错误）
    // ①(RE-08) 用 let：copybackground 需要把链输入替换为背景拷贝
    // ①(RE-41 官方回退) 纹理缺失/解码失败 → **1×1 不透明白**（官方 fallback 视觉；FINDINGS-1 B.4）。
    //   以前这里回退透明（层直接消失）——但官方是白块，而且白块正好是发现解码缺口的信号
    //   （本轮 format 5 的 31% 纹理就是靠它暴露的）。`?whitefallback=0` 可退回透明。
    //   仅对"声明了纹理名但加载失败"的非纯色层生效；容器层/无纹理层行为不变。
    const missingTex = !texObj && !!layer.textureName && !layer.solid
    // ①(预留接口) 纹理缺失时先问外部钩子（远程资源服务），未命中再走官方白块/透明回退
    let hookTexObj = null
    if (missingTex) {
      hookTexObj = runMpwHook('resolveTexture', [layer.textureName, { layer, textures }])
      if (hookTexObj && hookTexObj.glTex) { try { textures.set(layer.textureName, hookTexObj) } catch {} }
    }
    const effTex = (texObj && texObj.glTex) ? texObj : (hookTexObj && hookTexObj.glTex ? hookTexObj : null)
    // ①(2026-09-12 用户实测回归："背景本来做好了，现在不见了，只显示成灰色") —— 兜底分档：
    //   · **满幅/背景级层**（≥3800×2000，或铺满投影）纹理缺失时仍画白：这类层是"背景/光晕"，
    //     画白=可见的底子（此前用户看到的背景就是这样来的）；改成透明后会直接露出清屏灰（回归）。
    //   · **小层**（细节/UI/光斑）纹理缺失时保持透明：避免以前那种"一块块白块"。
    //   `?whitefallback=1` 全部画白、`?whitefallback=0` 全部透明，可对照。
    // ①(2026-09-12 撤销"满幅层画白"分档：日月循环被整屏刷白) —— 判据选错了：
    //   那个场景有多张 3840×2160 的层纹理缺失（组件类），画白就是"整屏白层"；而凯尔希的背景层
    //   本来就**有**真实纹理（台账 tex=layer），它的灰底与兜底无关。所以恢复"缺失即透明"，
    //   白块只保留给"确实需要白底"的场景：`?whitefallback=1` 显式打开。
    // ①(P-41 A4 2026-09-13) **无 image 的 solid 占位层默认透明**（原 `layer.solid → whiteTex` 撤销）：
    //   真机实锤（日月循环 3326873240，r1789233487520）：myLayer/193/组件/1054 等都是
    //   `solid:true 且无 image` 的作者占位/容器层（193 还是 morning/dusk/day/night 的父容器），
    //   旧逻辑给它们统一画白 → 整屏白块盖住 day/night 主体（P-34 的"缺失即透明"只覆盖了
    //   missingTex 分支，没盖住 solid 分支）。真·纯色层走 models/util/solidlayer* 内置模型
    //   （effTex 路径 + layer.color），不受影响。`?whitefallback=1` 恢复画白可 A/B。
    // ①(2026-09-13 主会话整合修订) 上面的"solid 一律透明"会**吃掉真正的纯色填充层**：
    //   语料里存在"无纹理但有颜色"的 solid 层（3327063360 的 Background 深红 / Audio Bars、
    //   3544152633 的 playerprogexception 绿、3554161528 的 4 个黑色纯色）——它们的画法本来就是
    //   `whiteTex × layer.color`（颜色全在 color4 里）。所以细化判据：
    //     · solid + **非白颜色** → 照旧画（whiteTex + color4）→ 颜色填充保留；
    //     · solid + 白色/未定义颜色（作者的占位/容器层，如 myLayer/193/组件/1054）→ 透明；
    //     · 非 solid 且缺纹理 → 只在 `?whitefallback=1` 时画白（默认透明，避免白块）。
    const __solidColored = (() => {
      try {
        if (!layer.solid || effTex) return false
        const c = layer.color || [1, 1, 1]
        return Math.abs(c[0] - 1) > 0.02 || Math.abs(c[1] - 1) > 0.02 || Math.abs(c[2] - 1) > 0.02
      } catch { return false }
    })()
    let srcTex = effTex ? effTex.glTex
      : ((__solidColored || ((layer.solid || missingTex) && WHITE_FALLBACK)) ? whiteTex : transparentTex)
    const lw0 = layer.size[0] * layer.scale[0]
    const lh0 = layer.size[1] * layer.scale[1]
    if (lw0 <= 0 || lh0 <= 0) {
      if (!layer.solid && !texObj) return
    }
    // ①(P-134 ⑥ 主修；报告 §3.3 根因行) 无纹理层（纯色 / 文本 / 容器）也要用**实绘尺寸**建效果链 FBO。
    //   旧写法无纹理分支恒取 `1` ⇒ FBO 塌成 1×1 ⇒ 下面 `fboW < 2 || fboH < 2` 的退化短路命中
    //   ⇒ **效果链从不执行**，层退回"原始纯色 × colorBlendMode"整块合成（用户报的"视频壁纸左侧 1/4 反相"：
    //   纯色层#935 的 `colorBlendMode:23`=Phoenix≈反相，2998×987 的 quad 铺满整块）。
    //   `lw0/lh0` = size×scale = 实绘尺寸（与有纹理分支同源）；`lw0/lh0 = 0/NaN` ⇒ `|| 1` = 1
    //   ⇒ **零几何**层仍是 1×1（`Math.max(1, …)` 再兜一道负数），行为与旧写法逐位相同。
    //   ⚠ 口径更正（实测，见 P-134 台账"未证实项"）：`size=0` 的 **solid** 层到不了这里 —— 本函数
    //   上方那条 WE 语义回退（"对象 size 为 0 时回退"）已把它的 size 改成**整屏投影尺寸**，所以它的
    //   实绘尺寸就是整屏（FBO 跟着整屏，与它的绘制 quad 一致）。语料实测：size 含 0 且带 effects 的
    //   14 层**全部 `solid=false`**（⇒ 命中上面的早退），回退生效的 13 层**全部 fx=0** ⇒ 两种口径在
    //   语料上逐位相同。
    const w = Math.max(1, texObj ? (layer.size[0] ? (lw0 || texObj.width) : texObj.width) : (lw0 || 1))
    const h = Math.max(1, texObj ? (layer.size[1] ? (lh0 || texObj.height) : texObj.height) : (lh0 || 1))
    const color4 = [layer.color[0] * layer.brightness, layer.color[1] * layer.brightness, layer.color[2] * layer.brightness, layer.alpha]
    // WER-ALIGN C13：保留全部效果（含隐藏），可见性在链内以 bypass 拷贝承载（不再在此丢弃）
    let effects = (layer.effects || []).slice()

    // 效果降采样（性能档位）：fboCapFactor > 0 时效果链 FBO 上限 = 屏幕占比 × 系数（0=全质量）
    let fboW = w
    let fboH = h
    // ①(修) 效果 FBO 封顶设备 MAX_TEXTURE_SIZE（6000px 层→FBO 超限→getFBO 回退 1×1 白纹理→整屏白块）
    // ①(P-74 ④) **根因修复**：`MAX_TEX_SIZE_CACHE` 的初值是 `0`（见其声明处 `let MAX_TEX_SIZE_CACHE = 0`），
    //   而这里原来写 `maxT = (MAX_TEX_SIZE_CACHE !== undefined) ? MAX_TEX_SIZE_CACHE : 4096` +
    //   `if (maxT === 4096) { 查询设备; MAX_TEX_SIZE_CACHE = maxT }`。`0 !== undefined` 恒真 ⇒ maxT 恒 0
    //   ⇒ 查询分支**永不执行**（缓存也永不被写入）⇒ `if (fboW > maxT) fboW = maxT` 把**每一层**的效果
    //   FBO 尺寸打成 **0×0**（getFBO 再钳到 1×1，"零尺寸防线"）。
    //   代码级后果（真包 3544152633 `cat` 层 `fxStats` 实测）：`quadW=0 quadH=0` ⇒ fx-copy 的
    //   `layerQuadVerts(0,0)` 六顶点位置全 (0,0,0)（零面积三角形 = 不写任何像素）⇒ 链输入 FBO 恒空
    //   ⇒ shake 只是把空拷成空 ⇒ 合成出"1 个透明纹素铺满 603×389" = **画了但零像素**（`drawn=1` 却看不见）。
    //   修法：把"未查询"的哨兵判据从 `=== 4096` 改成 `> 0`（并保留 0/负值防御）。
    try {
      if (!MAXTEX_FIX) {
        // ?maxtex=0：P-73 原样（哨兵 = MAX_TEX_SIZE_CACHE 初值 0 ⇒ maxT 恒 0 ⇒ fboW=fboH=0）
        let maxT = (MAX_TEX_SIZE_CACHE !== undefined) ? MAX_TEX_SIZE_CACHE : 4096
        if (maxT === 4096 && gl.getParameter) { try { maxT = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096 } catch {} ; MAX_TEX_SIZE_CACHE = maxT }
        if (fboW > maxT) fboW = maxT
        if (fboH > maxT) fboH = maxT
      } else {
        let maxT = (MAX_TEX_SIZE_CACHE > 0) ? MAX_TEX_SIZE_CACHE : 0
        if (!(maxT > 0) && gl.getParameter) {
          try { maxT = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096 } catch { maxT = 4096 }
          MAX_TEX_SIZE_CACHE = maxT
        }
        if (maxT > 0) { if (fboW > maxT) fboW = maxT; if (fboH > maxT) fboH = maxT }
      }
    } catch {}
    if (fboCapFactor > 0 && cam.projW > 0 && cam.projH > 0) {
      const screenW = layer.size[0] * layer.scale[0] * (width / cam.projW)
      const screenH = layer.size[1] * layer.scale[1] * (height / cam.projH)
      if (screenW > 0 && screenH > 0) {
        const capW = Math.max(64, Math.round(screenW * fboCapFactor))
        const capH = Math.max(64, Math.round(screenH * fboCapFactor))
        if (capW < w) fboW = capW
        if (capH < h) fboH = capH
      }
    }

    // ①(P-74 ④) 效果链输入判定台账：回答"这一层到底是'链输入为空'还是'链外其它原因'看不见"。
    //   口径（全部是**代码事实**，不是像素猜测）：
    //     inputKind : 'layer'=真实层贴图 / 'white'=1×1 白哨兵 / 'transparent'=1×1 透明哨兵
    //     copyDrawn : fx-copy（层→fboA）这一次 drawArrays 是否真的执行（drawGuard 未拦截）
    //     quadW/H   : 效果 FBO 尺寸（=0/1 表示几何退化 ⇒ 拷进去也等于空）
    //     passes    : 本帧实际执行的材质 pass 数
    //     outKind   : 最终合成采样的纹理（'fbo'=链尾 FBO / 'sentinel'=哨兵）
    //     fallback  : 非空 = 走了哪条回退（'direct'=无效果直绘 / 'fxFail'=链失败回退 base）
    //   经渲染器 `fxStats` 只读快照暴露（mock-GL 测试与真机上报共用）。
    const fxRec = (effects.length || (layer.effects || []).length) ? {
      name: String(layer.name || layer.id) + '#' + layer.id,
      effects: (layer.effects || []).length,
      passes: 0, inputKind: 'layer', copyDrawn: false, copySkipped: null,
      quadW: Math.round(fboW), quadH: Math.round(fboH), outKind: 'fbo', fallback: null,
    } : null
    if (fxRec) {
      fxRec.inputKind = srcTex === whiteTex ? 'white' : (srcTex === transparentTex ? 'transparent' : 'layer')
      fxStat.layers++
      fxStat.perLayer[fxRec.name] = fxRec
      fxStat.last = fxRec
    }

    // ①(P-74 ④) **退化链短路**：效果链的输入 FBO <2px（0×0 / 1×1）时，链内每一次 pass 都只能
    //   产出"1 个纹素" ⇒ 无论作者效果是什么，本层必然变成"单色/透明铺满"。这种情况一律
    //   **直通合成层自己的贴图**（而不是输出空/白）——这与 `?nofx=1` 的 A/B 结论一致，
    //   也是"无输入的 pass 应短路为直通"这条通用兜底。正常尺寸（≥2px）时零行为变化。
    if (MAXTEX_FIX && fxRec && effects.length && (fboW < 2 || fboH < 2)) {
      fxRec.fallback = 'degenerateFbo'
      fxRec.degenerate = true
      compositeLayer(copyProg, srcTex, color4, layer, cam, viewProj, width, height, time)
      return
    }
    // ①(修) base 纹理未就绪（视频未出帧/未加载）→ 跳过绘制（否则空白 base 上屏=白块/灰底）
    const baseReady = !(texObj && texObj.video) || (texObj.videoReady !== false)
    if (!baseReady && texObj && texObj.video) {
      return
    }
    // ①(RE-08 #1 官方语义 2026-09-12) copybackground：该层的效果链**输入 = 背景帧缓冲的拷贝**
    //   （逆向目标 0x140178c00：材质选 effectpassthrough[_4]（通道数≥4），恒等 blit；第三方参考 wer-ref 用
    //   composelayer_clearalpha 采主帧缓冲并注入 COPYBG combo）。此前我们只解析该键、渲染时忽略，
    //   导致"水面/反射/波纹"类效果只能扭曲自身贴图（视觉明显不对）。
    let copyBgEntry = null
    if (layer.copybackground || opts.copyBackground) {
      try {
        const rt = getFBO(width, height, 'copybackground')
        if (rt && rt.fbo && rt.tex) {
          // ①(P-90) 背景帧缓冲 = **本帧目标**（q=off 时 null，与改动前同一次调用）
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sceneTargetFbo())
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, rt.fbo)
          gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST)
          gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTargetFbo())
          srcTex = rt.tex
          copyBgEntry = rt
          // ①(RE-23 官方) 层 copybackground=true → 该层**每个**效果材质注入 combos.COPYBG=1
          //   （shader 端 `#if COPYBG` 才会去采 `g_Texture2 = _rt_FullFrameBuffer`；组合进程序缓存 key）
          for (const e2 of effects) for (const mp2 of (e2.materialPasses || [])) {
            mp2.combos = Object.assign({}, mp2.combos || {}, { COPYBG: 1 })
          }
          if (__auditNow) { try { onLog('[copybg] ' + (layer.name || layer.id) + ' COPYBG=1 + 链输入=背景拷贝 ' + width + 'x' + height) } catch {} }
        }
      } catch (e) { try { onLog('[we-scene] copybackground blit 失败: ' + e.message) } catch {} }
    }
    // 无效果：直接合成
    if (effects.length === 0) {
      // ①(2026-09-12 诊断) 大层直绘审计：srcTex 是否落成 white/transparent（层会变纯色块或消失）
      //   注意：整段必须在 try 内（诊断日志绝不能让图层绘制被跳过——曾因变量作用域错误把背景层整层干掉）
      try {
        if (__auditNow && layer.size && ((layer.size[0] || 0) >= 3800 || (layer.size[1] || 0) >= 2000)) {
          onLog('[fx0] ' + (layer.name || layer.id) + ' srcTex=' +
            (srcTex === whiteTex ? 'white(纯色!)' : srcTex === transparentTex ? 'transparent(空!)' : 'ok') +
            ' texObj=' + (texObj ? texObj.width + 'x' + texObj.height : 'null') + ' solid=' + !!layer.solid +
            ' color=' + JSON.stringify(color4) + ' size=' + JSON.stringify(layer.size))
        }
      } catch (e) {}
      if (fxRec) { fxRec.fallback = 'direct'; fxRec.outKind = 'sentinel' }
      compositeLayer(copyProg, srcTex, color4, layer, cam, viewProj, width, height, time)
      return
    }
    // ?nofx=1 / ?fx=名称：调试效果链用（0x501/0x502 归因隔离）。
    // WER-ALIGN C13：不可见/被过滤的效果不再直接丢弃——标记 __bypass，链内以"输入→输出拷贝"
    // 保持连通（wer-ref SceneImageEffectLayer.cpp:309 SetBypassTargets + WESceneRenderPlanBuilder.cpp:234-240）
    for (const ef of effects) {
      ef.__bypass = !ef.visible || !fxAllowed(ef.material || (ef && ef.materialPath) || '')
    }
    if (effects.every((ef) => ef.__bypass)) {
      // 全部效果隐藏：官方 bypass copy 串联等价于恒等链 → 直接合成输入，避免多余 blit
      if (fxRec) { fxRec.fallback = 'bypassAll' }
      compositeLayer(copyProg, srcTex, color4, layer, cam, viewProj, width, height, time)
      return
    }

    // ── 方案B（回退）：效果链任一环节 GPU 出错 → 放弃效果 FBO，直接画 base 纹理 ──
    // 现象：凯尔希'背景正常'(waterwaves)/GirlCat houseback 等效果链在部分设备抛 0x501/0x502
    // （use-blend-fbo / 反馈环 / 采样-绘制同一纹理），画面黑屏 + 大白块。与其显示垃圾，
    // 不如让该层回退为"无效果直绘"（绿幕/图层内容恢复）。?nofxfb=1 可关闭回退做对照。
  // ①(4a 修复2026-09-10) 效果链执行后无条件恢复默认帧缓冲/视口/裁剪：
  // fx FBO 残留绑定→合成采样=反馈环→Adreno 静默丢弃→层输出透明（灰层 fx=1 全部透明之谜）
  // ①(P-90) "默认帧缓冲"改走 `sceneTargetFbo()`：q=off 时仍是 null（与改动前同一次调用）。
  try { gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTargetFbo()); gl.viewport(0, 0, width, height); gl.disable(gl.SCISSOR_TEST) } catch {}
    fxChainGpuErr = gl.NO_ERROR
    let fxFxErr = false
    const fxFail = (ge, where) => {
      fxChainGpuErr = ge
      fxFxErr = true
      if (FXFB_DISABLED) return false
      const key = (layer.name || layer.id) + ' :: fx-fallback ' + where
      if (!passErrorLogged.has(key)) {
        passErrorLogged.add(key)
        try { onLog('[we-scene] 效果链失败(' + where + ') → 回退直接画 base 纹理: "' + (layer.name || layer.id) + '"') } catch {}
      }
      return true
    }

    // copy pass → FBO A（乒乓 A/B 必须独立实例）
    const fboA = getFBO(fboW, fboH, 'ping')
    const fboB = getFBO(fboW, fboH, 'pong')
    const layerOrtho = mat4Ortho(0, fboW, 0, fboH, -10000, 10000)
    gl.useProgram(copyProg)
    setBlend('normal')
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboA.fbo)
    gl.viewport(0, 0, fboW, fboH)
    gl.bindVertexArray(vao)
    uploadQuad('layer' + fboW + 'x' + fboH + (layer.uvRect ? '_uv' + layer.uvRect.join(',') : ''), layer.uvRect ? uvQuadVerts(layer.uvRect, fboW, fboH) : layerQuad(fboW, fboH))
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, srcTex)
    gl.uniform1i(copyUni.tex, 0)
    gl.uniform4f(copyUni.color, color4[0], color4[1], color4[2], color4[3])
      traceChk('effectpass-draw')
    gl.uniformMatrix4fv(copyUni.mvp, false, layerOrtho)
    // ①(P-74 ④) fx-copy = 链输入的唯一写入点：记下"到底画没画"（这是"链输入为空"判定的第一手事实）
    fxRec && (fxRec.copyDrawn = false)
    if (drawGuard('fx-copy', srcTex, fboA, String(layer.name || layer.id), null)) {
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      fxRec && (fxRec.copyDrawn = true)
    } else if (fxRec) fxRec.copySkipped = 'drawGuard'
    {
      const ge = gl.getError()
      if (ge !== gl.NO_ERROR) fxFail(ge, 'copy-draw')
    }
    if (fxFxErr) {
      // 即使回退被关闭，也不能继续在损坏的 GL 状态下画（避免白块）：仍走直绘
      compositeLayer(copyProg, srcTex, color4, layer, cam, viewProj, width, height, time)
      return
    }

    // 效果链
    let curInput = fboA // 当前主 FBO（asInput）
    let curDraw = fboB // 乒乓目标
    const effectFBOs = new Map()
    // WER-ALIGN C7：fit>0 的 FBO 按官方 ResolveSize 取"最长边=fit 像素"缩放（WPEffect.cpp:61-79）；
    // 否则 size/scale（scale=0 视为 1，WPEffect.cpp:54-57）
    const fboSizeOf = (f) => {
      const sw = Math.max(1, fboW), sh = Math.max(1, fboH)
      if (f.fit > 0) {
        const longest = Math.max(sw, sh)
        const k = f.fit / longest
        return [Math.max(1, Math.round(sw * k)), Math.max(1, Math.round(sh * k))]
      }
      const div = Math.max(1, f.scale || 1)
      return [Math.max(1, Math.round(sw / div)), Math.max(1, Math.round(sh / div))]
    }
    const flatPasses = []
    effects.forEach((eff, ei) => {
      for (const f of eff.fbos || []) {
        if (!effectFBOs.has(f.name)) {
          // WER-ALIGN C6（wer-ref WPSceneParser.cpp:5086）：命名 FBO 的真实名 = fbo.name + "_" + effaddr，
          // 每效果独立命名空间；tag 带效果序号避免跨效果同名 FBO 共享同一 GL 实例
          const [fw, fh] = fboSizeOf(f)
          effectFBOs.set(f.name, getFBO(fw, fh, ei + '|' + f.name))
        }
      }
      const passes = eff.materialPasses || []
      if (!eff.__bypass) {
        for (let pi = 0; pi < passes.length; pi++) {
          flatPasses.push({ eff, mp: passes[pi], ov: eff.passes && eff.passes[pi], ei, pi })
        }
      }
      if (flatPasses.every((x) => x.ei !== ei)) {
        // WER-ALIGN C13：被隐藏/?nofx 过滤（或无可执行 pass）的效果以"bypass 哨兵"占位，
        // 保持链连通与乒乓轮换位置（哨兵在 pass 循环里执行输入→输出拷贝）
        flatPasses.push({ bypass: true, eff, ei, pi: 0 })
      }
    })
    // WER-ALIGN C2/C3（wer-ref WPSceneParser.cpp:5075/5083/5163、SceneImageEffectLayer.cpp:349）：
    // "previous"与空槽 0 的输入 = 本效果开始时的链输入（inRT，效果内恒定）；
    // 效果内所有无 target 的 pass 都写同一输出（ppong_b）；swap 以"效果"为单位（每效果一次），
    // 不再是每 pass 一次。单 pass 效果行为与旧实现完全一致。
    let curEffectIdx = -1
    let effectInput = fboA
    let effectOutput = fboB
    for (let fi = 0; fi < flatPasses.length; fi++) {
      const item = flatPasses[fi]
      if (item.bypass) {
        // WER-ALIGN C13：隐藏效果 bypass copy——输入→输出（替换写入），随后推进一次乒乓。
        // 官方以 should_execute=!LocalVisible 的条件 CopyPass 实现；可见性与状态在此等价落地。
        const bei = item.ei
        if (bei !== curEffectIdx) {
          effectInput = curInput
          effectOutput = curDraw
          curEffectIdx = bei
        }
        gl.useProgram(copyProg)
        setBlend('normal')
        gl.bindFramebuffer(gl.FRAMEBUFFER, effectOutput.fbo)
        gl.viewport(0, 0, effectOutput.width, effectOutput.height)
        gl.bindVertexArray(vao)
        uploadQuad('pass', PASS_QUAD)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, effectInput.tex)
        gl.uniform1i(copyUni.tex, 0)
        gl.uniformMatrix4fv(copyUni.mvp, false, IDENT_M4)
        if (drawGuard('fx-bypass', effectInput.tex, effectOutput, String(layer.name || layer.id), null)) gl.drawArrays(gl.TRIANGLES, 0, 6)
        traceChk('bypass-copy')
        curInput = effectOutput
        curDraw = (curInput === fboA) ? fboB : fboA
        continue
      }
      const { eff, mp, ov, ei, pi } = item
      if (ei !== curEffectIdx) {
        effectInput = curInput
        effectOutput = curDraw
        curEffectIdx = ei
      }
      // WER-ALIGN C8（wer-ref WPEffect.cpp:40-45,200-208 + WESceneRenderPlanBuilder.cpp:216-233）：
      // 本效果的 copy 命令在第 afterpos 个 material pass 之前执行（blit source→target，替换写入）
      for (const cmd of (eff.commands || [])) {
        if (cmd.afterpos !== pi || cmd.command !== 'copy') continue
        const cmdRes = (name) => {
          if (!name) return null
          if (name === 'previous') return effectInput
          return effectFBOs.get(name) || null
        }
        const cmdSrc = cmdRes(cmd.source)
        const cmdDst = cmdRes(cmd.target)
        if (!cmdSrc || !cmdDst || !cmdSrc.tex || !cmdDst.fbo) continue
        gl.useProgram(copyProg)
        setBlend('normal')
        gl.bindFramebuffer(gl.FRAMEBUFFER, cmdDst.fbo)
        gl.viewport(0, 0, cmdDst.width, cmdDst.height)
        gl.bindVertexArray(vao)
        uploadQuad('pass', PASS_QUAD)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, cmdSrc.tex)
        gl.uniform1i(copyUni.tex, 0)
        gl.uniformMatrix4fv(copyUni.mvp, false, IDENT_M4)
        if (drawGuard('fx-cmdcopy', cmdSrc.tex, cmdDst, String(layer.name || layer.id), null)) gl.drawArrays(gl.TRIANGLES, 0, 6)
        traceChk('command-copy')
        const geCmd = gl.getError()
        if (geCmd !== gl.NO_ERROR) {
          fxChainGpuErr = geCmd
          break
        }
      }
      if (fxChainGpuErr !== gl.NO_ERROR) { fxFail(fxChainGpuErr, 'command-copy'); break }
      const combos = { ...(mp.combos || {}), ...((ov && ov.combos) || {}) }
      // 本 pass 提供的纹理（material + scene override 合并，用于纹理关联 combo）
      const mpT = mp.textures || []
      const ovT = (ov && ov.textures) || []
      const mergedTex = []
      for (let i = 0; i < Math.max(mpT.length, ovT.length); i++) {
        if (ovT[i] !== undefined && ovT[i] !== null) mergedTex[i] = ovT[i]
        else mergedTex[i] = mpT[i] !== undefined ? mpT[i] : null
      }
      const progEntry = await getEffectProgram(mp.shader, combos, mergedTex).catch((e) => {
        // 单个 pass 编译失败：记录一次并中断该层剩余效果链（保留已完成的 pass 结果继续合成）
        const msg = (e && e.message) || String(e)
        if (!passErrorLogged.has(mp.shader + ' :: ' + msg)) {
          passErrorLogged.add(mp.shader + ' :: ' + msg)
          try { onLog('[we-scene] 跳过编译失败的 pass "' + mp.shader + '": ' + msg) } catch {}
        }
        return null
      })
      if (progEntry === null) break
      const prog = progEntry.prog
      const uni = progEntry.uni
      // 目标与输入（WER-ALIGN C2/C3：输入=效果输入；输出=target 命名 FBO 或效果输出）
      let outFBO
      let passInput
      if (mp.target) {
        // ①(修复) 目标 FBO 缺失时按需创建——原来回退到 curInput 导致
        // outFBO === passInput（同帧采样-绘制反馈，Adreno 0x502 铁证点）
        let tgt = effectFBOs.get(mp.target)
        if (!tgt) {
          tgt = getFBO(fboW, fboH, ei + '|' + mp.target)
          effectFBOs.set(mp.target, tgt)
        }
        outFBO = tgt
        passInput = effectInput
      } else {
        outFBO = effectOutput
        passInput = effectInput
      }
      gl.useProgram(prog)
      // ①(修) 按程序属性尺寸重建 VAO（vec3/vec2 与默认 vao 指针匹配；bindVAOFor 此前零调用）
      try { bindVAOFor(prog, PASS_QUAD) } catch {}
      // ①(WER-ALIGN C12 官方 2026-09-14) 效果链**全部中间 pass 强制 Normal（替换写）**：
      //   wer-ref SceneImageEffectLayer.cpp:331（行为对照：链内 pass 的 blendmode 被就地覆盖成 Normal）——
      //   链内 pass 写的是私有 pingpong FBO，材质声明的 translucent/additive 只属于
      //   "层→屏幕"合成；照抄会导致半透明层在链内叠出鬼影/alpha 累积错误。
      setBlend('normal')
      gl.bindFramebuffer(gl.FRAMEBUFFER, outFBO.fbo)
      await passTagErr('use-blend-fbo', mp.shader)
      // 方案B：效果链 GPU 错误（0x501/0x502）→ 本层直接回退画 base 纹理
      if (fxChainGpuErr !== gl.NO_ERROR) { fxFail(fxChainGpuErr, 'use-blend-fbo'); break }
      // 清空全部纹理槽，避免上一 pass 残留绑定构成采样-绘制反馈
      for (let zi = 0; zi < 8; zi++) {
        gl.activeTexture(gl.TEXTURE0 + zi)
        gl.bindTexture(gl.TEXTURE_2D, null)
      }
      await passTagErr('texclear', mp.shader)
      gl.viewport(0, 0, outFBO.width, outFBO.height)
      gl.bindVertexArray(fxVao) // 效果 pass 专用 VAO（主 vao 保持 vbuf 指针，供 copy/合成使用）
      uploadQuad('pass', PASS_QUAD) // 维持 currentQuadKey 状态一致（绘制实际读 fxVao→quadVBO）
      await passTagErr('quad-upload', mp.shader)
      // 纹理绑定
      const texNames = mp.textures || []
      const maxTex = Math.max(texNames.length, 8)
      const resolutions = new Map()
      const usedUnits = new Set()
      for (let ti = 0; ti < maxTex; ti++) {
        let name = ti < texNames.length ? texNames[ti] : null
        if (ov && ov.textures && ov.textures[ti] !== undefined && ov.textures[ti] !== null) name = ov.textures[ti]
        // binds 覆盖（官方语义：effect.json pass.bind 强制把槽 index 绑到指定资源，
        // previous=链输入、_rt_*=命名 FBO；scene 端 ov.bind 可再覆盖）。
        // 修复：此前读 eff.binds（scene 效果条目无此字段，恒 undefined）→ bind 从未生效。
        const binds = ((ov && ov.bind) || mp.binds || [])
        for (const b of binds) {
          if (b && b.index === ti) name = b.name
        }
        // WE 语义：槽 0 为空 = 当前输入 FBO（asInput）；'previous' 同义
        let entry
        // ①(RE-23) 全帧缓冲（屏幕）引用 → 层的屏幕拷贝（COPYBG 语义的 g_Texture2 来源）
        if (copyBgEntry && (name === '_rt_FullFrameBuffer' || name === '_rt_default' || name === 'fullframebuffer')) {
          entry = copyBgEntry
          const tt = { tex: entry.glTex || entry.tex, width: entry.width || 1, height: entry.height || 1 }
          gl.activeTexture(gl.TEXTURE0 + ti)
          gl.bindTexture(gl.TEXTURE_2D, tt.tex)
          usedUnits.add(ti)
          resolutions.set(ti, [tt.width, tt.height, tt.width, tt.height])
          continue
        }
        if (ti === 0 && (name === null || name === undefined || name === '')) {
          entry = passInput
        } else {
          entry = resolveTextureName(name, passInput, effectFBOs, textures)
        }
        if (name === 'previous') entry = passInput
        if (entry === null) entry = { glTex: transparentTex, width: 1, height: 1, tex: transparentTex }
        // 反馈环守卫：bind/target 指向同一 FBO 时采样-绘制同纹理=UB（Adreno 0x502）。
        // 回退链输入（passInput ∈ {fboA,fboB}，与命名 target FBO 恒不同）。
        if (entry.fbo && outFBO && entry.fbo === outFBO.fbo) {
          const k = 'FBGUARD ' + (mp.shader || '?')
          if (!passErrorLogged.has(k)) {
            passErrorLogged.add(k)
            try { onLog('[we-scene] 反馈环拦截: pass ' + (mp.shader || '?') + ' 槽 ' + ti + ' 与绘制目标相同 → 改绑链输入') } catch {}
          }
          entry = passInput
        }
        const t = entry.fbo ? entry : { tex: entry.glTex || whiteTex, width: entry.width || 1, height: entry.height || 1 }
        gl.activeTexture(gl.TEXTURE0 + ti)
        gl.bindTexture(gl.TEXTURE_2D, t.tex)
        usedUnits.add(ti)
        resolutions.set(ti, [t.width, t.height, t.width, t.height])
      }
      // 系统 uniform
      bindSystemUniforms(uni, layer, time, cam.projW, cam.projH, IDENT_M4, layerOrtho, IDENT_M4, resolutions, width, height)
      await passTagErr('system-uniforms', mp.shader)
      // 常量（material 名 → uniform 映射）
      bindConstants(uni, { ...(mp.constants || {}), ...((ov && ov.constantshadervalues) || {}) }, progEntry.matMeta)
      // ①(P-134 ⑥ 第二处) 音频频谱 uniform：**只在这条效果 pass 路径上**写（无数据源 ⇒ 一个都不写）
      bindAudioSpectrum(uni)
      traceChk('composite-draw')
      await passTagErr('constants', mp.shader)
      // 反馈断言：绘制目标纹理与 T0 采样纹理是否同一对象（0x502 实锤前的最后验证）
      // ①(W1③ P-36) 由"仅记日志"升级为**跳过该次绘制**：反馈环=UB，Adreno 0x502，
      //   画出去只会污染 GL 状态（整帧丢弃→空白），跳过并记上报。
      try {
        const inTex = (passInput && (passInput.tex || passInput.glTex));
        const outTex = (outFBO && outFBO.tex);
        if (inTex && outTex && inTex === outTex) {
          const k = 'FEEDBACK ' + mp.shader
          if (!passErrorLogged.has(k)) {
            passErrorLogged.add(k)
            try { onLog('[we-scene] ★反馈环拦截: pass ' + mp.shader + ' 采样与绘制同一纹理 → 跳过该 pass 绘制') } catch {}
          }
          await passTagErr('feedback-skip', mp.shader)
          if (fxChainGpuErr !== gl.NO_ERROR) { fxFail(fxChainGpuErr, 'pass-draw'); break }
          continue
        }
      } catch {}
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      if (fxRec) fxRec.passes++
      await passTagErr('draw', mp.shader)
      if (fxChainGpuErr !== gl.NO_ERROR) { fxFail(fxChainGpuErr, 'pass-draw'); break }
      // GPU 错误逐 pass 归因（0x501/0x502 溯源用；只报一次避免刷屏）
      {
        const ge = gl.getError()
        if (ge !== gl.NO_ERROR) {
          const key = 'pass ' + (mp.shader || '?') + ' :: 0x' + ge.toString(16) + ' (层 ' + (layer.name || layer.id) + ')'
          if (!passErrorLogged.has(key)) {
            passErrorLogged.add(key)
            try { onLog('[we-scene] 效果 pass GPU 错误: ' + key) } catch {}
          }
        }
      }
      // 更新乒乓（WER-ALIGN C3：以效果为单位——本效果最后一个 pass 完成后交换一次）
      const isLastOfEffect = (fi + 1 >= flatPasses.length) || (flatPasses[fi + 1].ei !== ei)
      if (isLastOfEffect) {
        curInput = effectOutput
        curDraw = (curInput === fboA) ? fboB : fboA
      }
    }
    // 合成（方案B：效果链失败时直接画 base 纹理，不再合成可能已损坏的效果 FBO）
    if (fxChainGpuErr !== gl.NO_ERROR && !FXFB_DISABLED) {
      fxFail(fxChainGpuErr, 'chain-end')
      if (fxRec) fxRec.fallback = 'fxFail'
      compositeLayer(copyProg, srcTex, color4, layer, cam, viewProj, width, height, time)
      return
    }
    // ①(P-74 ④) 最终合成采样的纹理：链尾 FBO 还是哨兵（哨兵 ⇒ 链输出为空，层必然不可见）
    if (fxRec) {
      fxRec.outKind = (curInput.tex === whiteTex || curInput.tex === transparentTex) ? 'sentinel' : 'fbo'
      fxRec.outSize = curInput.width + 'x' + curInput.height
    }
    compositeLayer(compProg, curInput.tex, [1, 1, 1, 1], layer, cam, viewProj, width, height, time)
  }

  // ── 粒子层（凯尔希 官方柔和中央光雾 = 粒子光叠加）──
  // 理想路径：CPU 移植 elysia 模拟 + 每帧把每个粒子画成一个小 quad（光斑贴图 additively）
  // 合成到当前 framebuffer（默认画布）。位置=世界设计像素（y 向下）经 viewProj 投影。
  // 纹理形状取 red 通道（genericparticle 语义），additive → dst += color * (alpha*texR)。
  // ①(P-144 子系) **分层**：`renderParticleLayer` = 本层（body）+ 本层的 `children`（子系）。
  //   为什么要拆：`children` 的静态子系**必须能在父层自己缺贴图时照画**（否则 83 条包外贴图的
  //   子系会被父层一起拖死），而父层的 body 在缺贴图时是**早退**（连 sys 都不建）⇒ 早退前
  //   拿不到父系锚点。拆开之后 body 把 `sys`（可能为 null）返回给 wrapper，wrapper 用
  //   "父系锚点为空"分支继续画 static 子系（eventfollow/事件类需要父系 ⇒ 那几种才跳过）。
  function renderParticleLayer(layer, textures, cam, viewProj, width, height, time) {
    const __r = renderParticleLayerBody(layer, textures, cam, viewProj, width, height, time)
    renderParticleChildren(layer, __r ? __r.sys : null, textures, cam, viewProj, width, height, time)
  }

  function renderParticleLayerBody(layer, textures, cam, viewProj, width, height, time) {
    const def = layer.particleDef
    if (!def) return { sys: null, reason: 'nodef' }
    const texName = layer.particleTexName
    const texObj = texName ? textures.get(texName) : null
    // ①(P-59) 贴图没解析/没解码出来的粒子层**直接跳过**（不画白块）：白 quad 比不画更糟。
    //   这里同时记账，真机上报可区分"没贴图跳过"与"预算跳过"。
    //   ①(P-144 子系) 子系（`layer.__pchild`）缺贴图**只跳这一条子系**：父层与兄弟子系照画
    //   （口径见 `parseParticleChildren` 上方第 ⑥ 条）。
    if (!texObj || !texObj.glTex) {
      partStat.skippedTex++
      if (layer.__pchild) {
        partStat.children.texMissing++
        if (!partLogOnce.has('ctex:' + layer.id)) {
          partLogOnce.add('ctex:' + layer.id)
          try { onLog('[粒子子系] ⚠ 缺纹理 ' + (texName ? ('materials/' + texName + '.tex') : '（子系无 particleTexName）')
            + ' ⇒ 只跳过这一条子系 "' + (layer.name || layer.id) + '"（父层与其余子系照常绘制）') } catch {}
        }
      }
      if (!partLogOnce.has('tex:' + texName)) {
        partLogOnce.add('tex:' + texName)
        try { onLog('[粒子] 跳过无贴图层 "' + (layer.name || layer.id) + '"（' + (texName || '无 particleTexName') + '）') } catch {}
      }
      return { sys: null, reason: 'tex' }
    }
    // ①(P-59) 粒子预算：本帧剩余份额 ÷ 剩余粒子层数 = 本层的公平份额（用不完顺延给后面的层）
    if (partFrame.layers >= PARTICLE_BUDGET.layers || partFrame.left <= 0) {
      partStat.skippedBudget++
      if (layer.__pchild) partStat.children.budgetSkipped++
      if (!partLogOnce.has('bud:' + (layer.name || layer.id))) {
        partLogOnce.add('bud:' + (layer.name || layer.id))
        try { onLog('[粒子预算] 层 "' + (layer.name || layer.id) + '" 超预算跳过（档=' + PARTICLE_BUDGET.tier + '，已画 '
          + partFrame.layers + '/' + PARTICLE_BUDGET.layers + ' 层，剩余份额 ' + Math.max(0, partFrame.left) + '/' + PARTICLE_BUDGET.total + '）') } catch {}
      }
      return { sys: null, reason: 'budget' }
    }
    const remainLayers = Math.max(1, partFrame.layerTotal - partFrame.layers)
    const share = Math.max(1, Math.ceil(partFrame.left / remainLayers))
    const budgetCap = Math.max(1, Math.min(PARTICLE_BUDGET.perLayer, share, partFrame.left))
    partFrame.layers++
    // ①(P-59 B 2026-09-14 / P-65 2026-09-15 重写) **renderer 分派**：官方预设 renderer 分布
    //   sprite 142 / spritetrail 40 / rope 25 / ropetrail 18。
    //   P-59 时三者都按**普通贴图 quad** 绘制（只留证）→ 长条贴图（particle/流星 256x794、
    //   particle/drop 32x128、particle/light/light_shafts_0 256x512）在屏幕上就是**一条条竖线**，
    //   且绳段之间留空隙 = 用户第 10 项「一条竖线空开，一条竖线空开…在屏幕上移动」；
    //   Trails 2（rope，origin 恰在画布中心）也因此在屏幕中间堆出一摞竖条 = 第 8/9 项。
    //   P-65 起按官方几何绘制（spritetrail/rope/ropetrail，见 renderParticleLayer 的几何分支），
    //   renderers 计数保留（真机上报仍能看出"哪层走了哪条几何路径"）。
    const trailCfg = particleTrailCfg(def)
    const rname = trailCfg.name
    partStat.renderers[rname] = (partStat.renderers[rname] || 0) + 1
    partStat.trailLayers[rname] = (partStat.trailLayers[rname] || 0) + 1
    if (TRAIL_MODE === 'off' && trailCfg.trail) {
      // ?trail=off：整层不画（用户口径"宁可没有，也不要画成竖线"的兜底开关）
      partStat.trailSkipped++
      if (!partLogOnce.has('trailoff:' + (layer.name || layer.id))) {
        partLogOnce.add('trailoff:' + (layer.name || layer.id))
        try { onLog('[粒子] 层 "' + (layer.name || layer.id) + '" renderer=' + rname + ' 因 ?trail=off 整层跳过（贴图=' + texName + '）') } catch {}
      }
      return { sys: null, reason: 'trailoff' }
    }
    if (rname !== 'sprite' && !partLogOnce.has('rnd:' + rname + ':' + (layer.name || layer.id))) {
      partLogOnce.add('rnd:' + rname + ':' + (layer.name || layer.id))
      try { onLog('[粒子] 层 "' + (layer.name || layer.id) + '" renderer=' + rname
        + (TRAIL_MODE === 'quad'
          ? ' → ?trail=quad 走旧"普通贴图 quad 近似"路径（对照用；会画成竖线）'
          : ' → 官方几何（spritetrail=沿速度拉伸一条精灵；rope/ropetrail=按发射序/历史连成 ribbon）')
        + '；贴图=' + texName) } catch {}
    }
    // ①(P-59) 发射率上限：多发射器 rate 求和超上限 → 按比例降（只降不升；0/缺省按官方缺省 **5** 计）
    // ①(P-130 批A #3) 缺省 10 → **5**（官方口径，与 `parseParticleEmitters` 的 `rate` 缺省同改；
    //   两处不同步会让"预算记账"与"实际发射"用两个速率）。
    const emitterList = Array.isArray(def && def.emitter) ? def.emitter : []
    let sumRate = 0
    for (const e2 of emitterList) sumRate += (e2 && typeof e2.rate === 'number' && e2.rate > 0) ? e2.rate : (e2 && e2.instantaneous) ? 0 : 5
    const rateMul = (sumRate > PARTICLE_BUDGET.rate) ? (PARTICLE_BUDGET.rate / sumRate) : 1
    if (rateMul < 1) {
      partStat.rateCapped++
      if (!partLogOnce.has('rate:' + (layer.name || layer.id))) {
        partLogOnce.add('rate:' + (layer.name || layer.id))
        try { onLog('[粒子预算] 层 "' + (layer.name || layer.id) + '" 发射率 ' + Math.round(sumRate) + '/s → ' + PARTICLE_BUDGET.rate
          + '/s（档=' + PARTICLE_BUDGET.tier + '，×' + rateMul.toFixed(3) + '；只限流不掉粒子）') } catch {}
      }
    }
    const blending = layer.particleBlending || 'translucent'
    // ①(P-69 第 6 项) lockToPointer：本帧指针（设计坐标）；无指针/`?cursor=off` → null → 该发射器不发射。
    const __ptrNow = CURSOR_OFF ? null : __pointerDesign(cam)
    // ①(P-118 G4) 钩子安装与"本帧有没有指针"**解耦**（旧写法 `if (!CURSOR_OFF && __ptrNow) __hookPointer()`
    //   = 自举死锁：没注入就永远装不上 ⇒ 出货页面一次都不发射）。建渲染器时已装过，这里只是幂等兜底
    //   （`__hookPointer` 首行即返回）；`?cursor=off` 下不装、也不发射，逃生口语义不变。
    if (!CURSOR_OFF) __hookPointer()
    // ①(P-121 B-G3) 页面级离开钩子（blur/focus/visibilitychange）同一处幂等兜底 —— 见 `__hookPageLeave`。
    if (!CURSOR_OFF) __hookPageLeave()
    // 确定性：seed = 层 id/name|origin（参考实现 pkgPath|id|origin）
    // ①(P-69 2026-09-15 用户第 2 项"很多粒子一直在一起渲染，导致画面变得非常卡") 逐帧**重建 + 从 0 重放**
    //   是卡顿主因：hina 的 `cherry blossoms on cursor`(id389, origin=画布正中 1920,1080, rate=100/s,
    //   maxcount=1000, renderer=spritetrail, 带 vortex/两个 controlpointattract) 在 t=12.5s 时
    //   每帧要跑 `guard` 步 × 存活粒子（本机实测 250 步 × 165 粒 ≈ 4.1 万次粒子更新，单层渲染 95ms，
    //   其余 12 个粒子层各 0–20ms；见 particle-shape-audit.mjs 数字）。t≥20s 后步数吃满上限 400 步。
    //   而**输入是静态的**（原语层 origin 固定；`controlpoint[0].flags:1`=lockToPointer 我们根本没实现，
    //   控制点 offset 恒 0）⇒ 同一份输入逐帧重放同一段历史纯属白烧 CPU。
    //   改法：按"输入签名"缓存粒子系统，稳态每帧只推进 dt（1 步）而不是重放 250–400 步；
    //   时间倒退（?time 循环/seek）、签名变化（origin/scale/alpha/rate/maxcount/perf 倍率变了）→ 重建重放
    //   （与旧实现同一起点、同一 RNG 序列 ⇒ 首帧与旧行为逐位一致）。
    //   `?psim=replay` 回到旧的"逐帧重建 + 从 0 重放"做 A/B。
    const PSIM = (() => {
      try { return (typeof location !== 'undefined' && location.search && new URLSearchParams(location.search).get('psim') === 'replay') ? 'replay' : 'incr' } catch (e) { return 'incr' }
    })()
    const PartSysCache = (opts.particleSysCache instanceof Map) ? opts.particleSysCache : __partSysCache
    // ①(P-136 用户第 4 项) 本层有没有"挂在指针上"的发射器。
    //   旧 P-69 这里叫 `sys0ptrLocked()`，唯一用途是"把指针坐标写进缓存签名"；照抄上游后指针
    //   **不再是构造输入**（上游只在每帧 `advance()` 前调 `ps.setPointer`），签名那一项恒为常量。
    //   但"**无指针 ⇒ 该层没有存活粒子**"这条**对外可观察语义必须保住**：它此前是"指针进签名
    //   ⇒ 指针变 null 触发重建 ⇒ 重放时空发射"的**副作用**，现在改成下面那句**显式清空**
    //   （tests/pointer-leave-test.mjs 的 P3b/D1b/G5/G1/G1b/G2b/G2c/G3a/G3c/G3e 十条钉住它）。
    const sys0ptrLocked = () => {
      try {
        if (def && def.__ptrLockedHint === undefined) {
          const pcp = (() => { const cps = (def.controlpoint) || []; for (let i = 0; i < cps.length; i++) if (cps[i] && (Number(cps[i].flags) & 1)) return i; return -1 })()
          const list = Array.isArray(def.emitter) ? def.emitter : []
          const seqUsesCp0 = ((def.initializer) || []).some((it) => it && it.name === 'mapsequencearoundcontrolpoint' && (it.controlpoint == null || Number(it.controlpoint) === pcp))
          def.__ptrLockedHint = pcp >= 0 && list.some((e) => (e && e.controlpoint != null && Number(e.controlpoint) === pcp) || (e && e.controlpoint == null && seqUsesCp0))
        }
        return !!def.__ptrLockedHint
      } catch (e) { return false }
    }
    // 本帧该层的存活上限（与旧实现逐位同式；perf 倍率 × def.maxcount 再与预算取 min）
    const __capNow = (def && def.maxcount > 0)
      ? Math.max(1, Math.min(budgetCap, Math.floor(def.maxcount * (perfState.partMul || 1)))) : budgetCap
    // ①(P-144 子系) 子系 authored `maxcount`（官方 = **并发实例上限**，缺省 20）折算成"本系统的
    //   存活粒子上限"：`static` 只有一个实例 ⇒ 不缩（上限就是子系 def 的 maxcount）；
    //   `eventfollow` 一个实例 ≈ 一粒拖尾粒子 ⇒ `min(def.maxcount, spec.maxCount)`；
    //   `eventspawn`/`eventdeath` 的上限由 `prepareParticleChildSys` 的**实例计数**单独管
    //   （粒子总数仍受子系 def 的 maxcount 与预算约束）。
    const __capChild = (() => {
      const sp = layer.__pchild && layer.__pchild.spec
      if (!sp || sp.type !== 'eventfollow') return __capNow
      return Math.max(1, Math.min(__capNow, sp.maxCount))
    })()
    // 缓存签名**只含真正影响 RNG 流与粒子状态的输入**：origin/scale/angle/alpha/rateMul/maxcount/贴图。
    //   注意**不含 budgetCap**（它随本帧剩余预算浮动，逐帧变 → 会把缓存打成每帧重建）；
    //   存活上限逐帧直接写进 sys.maxCount（见下），不需要重放。
    const __sig = [
      layer.id, layer.origin && layer.origin[0], layer.origin && layer.origin[1], layer.origin && layer.origin[2],
      layer.scale && layer.scale[0], layer.scale && layer.scale[1],
      layer.angles && layer.angles[2], layer.alpha, rateMul,
      (def && def.maxcount) || 0, perfState.partMul || 1, texName || '',
      // ①(P-74 ①) instanceoverride 进签名：面板改 size/count/alpha/speed/lifetime/color 后必须重建
      //   （RNG 流与出生状态都变）；无 override 的层恒 'x' ⇒ 缓存行为与改动前一致。
      (layer.instanceoverride ? JSON.stringify([layer.instanceoverride.size, layer.instanceoverride.count,
        layer.instanceoverride.alpha, layer.instanceoverride.rate, layer.instanceoverride.speed,
        layer.instanceoverride.lifetime, layer.instanceoverride.colorn, layer.instanceoverride.color]) : 'x'),
      // ①(P-74 ②) quad 尺寸口径进签名（改 ?psize= 不必重放，但重建更省心且只在切换时发生一次）
      PSIZE_MODE,
      // ①(P-136 用户第 4 项：照抄上游 MIT 实现) **指针不再进重建签名 —— 这就是尾迹的成因修复。**
      //   上游从不让指针参与粒子系统的构造（`renderer/src/scene-mount.ts:1670-1676` 只在每帧
      //   `advance()` 前调 `ps.setPointer`），系统因此**增量**前进、把光标路径留在粒子坐标里。
      //   旧写法（P-69，已移除）把指针写进签名：指针一动 ⇒ 每帧从 t=0 重放 400 步、且全历史只用
      //   **当前**坐标 ⇒ 花瓣永远糊在光标上（实测尾迹跨度 67px）。这里恒为常量，与上游同语义；
      //   无指针（`none`）时同样不重建 —— 发射门在 `pushPointerFrame` / `spawnParticle` 上，
      //   不靠"重建一次空系统"来实现（`tests/pointer-leave-test.mjs` P3b/P4a 钉住"离开停发、
      //   回来继续发射"，靠的是门而不是重建）。
      'x',
      // ①(P-126 C/D/F) 算子口径进签名：`?pops=` 切换后必须重建粒子系统（算子行为不同）
      POPS_MODE,
      // ①(P-130 批A) 颜色口径进签名：`?pcolor=` 切换后必须重建（colorrandom/colorchange 的出生与逐帧结果都变）
      PCOLOR_MODE,
      // ①(P-140 用户第 7 项) 湍流初速场口径进签名：`?pturb=` 切换后必须重建（出生速度方向整批不同）
      PTURB_MODE,
      // ①(P-131 批D) 音频口径进签名：`?audioemit=` 切换后必须重建（发射门控改变出生流与 RNG 流）
      AUDIO_EMIT_MODE,
      // ①(P-144 子系) 子系口径进签名：`?children=` 切换后必须重建（子系是否生成会改变
      //   事件记录数组是否存在；虽然父系顶点流两档逐位相同，但重建能让 `children` 记账与
      //   sys 上的子系规格同步，避免"切档后缓存里还挂着旧档的 sys"）
      CHILDREN_MODE,
    ].join('|')
    const __cached = PartSysCache.get(layer.id)
    let sys
    if (PSIM === 'incr' && __cached && __cached.sig === __sig && (time - (__cached.sys.starttime || 0)) + 1e-9 >= (__cached.sys._simulatedTo || 0)) {
      sys = __cached.sys
      // 本帧预算变了 → 直接改存活上限（降上限时裁掉超出的粒子，不重放）
      if (sys.maxCount !== __capChild) {
        sys.maxCount = __capChild
        if (sys.particles && sys.particles.length > __capChild) { sys.particles.length = __capChild; sys.count = __capChild }
      }
    } else {
      sys = buildParticleSystem(def, {
        origin: layer.origin,
        scale: layer.scale,
        // ①(P-21-ATTACH) scene.json 的 angles 是弧度（语料实测 π/π/2 值；直收，不再 ×π/180）。
        //   手性由 parseParticleEmitters 内部 cos(-angle) 处理（y-down 绘制空间取反）。
        angle: (layer.angles && layer.angles[2]) || 0,
        alphaMul: typeof layer.alpha === 'number' ? layer.alpha : 1,
        rateMul: rateMul,
        seedStr: String(layer.id != null ? layer.id : (layer.name || '')) + '|' + String(layer.origin || ''),
        // ①(MERGED-2 B ?perf=auto) 降级封顶：perfState.partMul（1/0.5/0.25）× def.maxcount。
        //   只降存活上限、发射器不停发；partMul 未定义（perf 关）时 ×1 → 与旧行为逐位一致；
        //   def.maxcount 缺失/0 时传 undefined → buildParticleSystem 内部保持旧回退（||100）。
        // ①(P-59) 再与预算上限取 min：真机语料里存在 maxcount=10000 的雨层（模拟存活 9609 粒）。
        maxCount: __capChild,
        // ①(P-74 ①) instanceoverride（层→粒子资产实例覆写）；`?io=off` 回到"一个字段都不读"
        instanceoverride: IO_MODE === 'off' ? null : (layer.instanceoverride || null),
        // ①(P-74 ③) `?vy=legacy` 回退 velocityrandom 的 y 翻转
        vyLegacy: VY_MODE === 'legacy',
        // ①(P-103③/④) 本轮两个出生期档位（`?pexp=legacy` / `?pspeed=legacy`）
        expLegacy: PEXP_MODE === 'legacy',
        speedLegacy: PSPEED_MODE === 'legacy',
        // ①(P-126 C/D/F) 粒子算子口径档位（`?pops=legacy`）
        popsLegacy: POPS_MODE === 'legacy',
        // ①(P-130 批A) A 类颜色口径档位（`?pcolor=legacy`）
        pcolorLegacy: PCOLOR_MODE === 'legacy',
        // ①(P-140 用户第 7 项) 湍流初速场口径档位（`?pturb=legacy` ⇒ 回到"每颗粒子独立随机出生角"）
        pturbLegacy: PTURB_MODE === 'legacy',
        // ①(P-144 子系) `?children=legacy` ⇒ 不解析任何子系（`sys.children = []`、事件数组不建）
        childrenMode: CHILDREN_MODE,
        childDepth: typeof layer.__pdepth === 'number' ? layer.__pdepth : 0,
      })
      if (PSIM === 'incr') PartSysCache.set(layer.id, { sig: __sig, sys })
    }
    // ①(P-74 ①) 记账：override 生效的层数/字段（真机上报用）
    if (layer.instanceoverride) {
      partStat.io.layers++
      partStat.io.lastLayer = String(layer.name || layer.id)
      for (const k of ['size', 'count', 'alpha', 'rate', 'speed', 'lifetime', 'colorn', 'color']) {
        const v = layer.instanceoverride[k]
        if (v !== null && v !== undefined && !(typeof v === 'number' && v === 1)) {
          partStat.io.fields[k] = (partStat.io.fields[k] || 0) + 1
          partStat.io.applied++
        }
      }
    }
    // ①(P-144 子系) 子系自己的**每帧准备**，必须在 `simulateParticleSystem` **之前**：
    //   · `eventfollow`：原点对到父系的 leader 粒子（照抄块 I `syncFollow` + 本仓库适配层
    //     `syncFollowOrigin`），父系没有活粒子 ⇒ 按官方语义"实例死 ⇒ 清空"且本帧不发；
    //   · `eventspawn`/`eventdeath`：把父系本帧记下的出生/死亡位置各吐一发（概率门 + 实例上限），
    //     这两类**不做持续发射**（`__emitGate=false`），只按事件吐；
    //   · `static` 与 `eventfollow` 的 `probability`：每帧抽一次"发射许可"（吃子系自己的 RNG）。
    //   父层（没有 `__pchild`）与 `?children=legacy` 都**不进这个函数** ⇒ 逐位不变。
    if (layer.__pchild) __prepareParticleChild(layer, sys)
    const __ptrLockedLayerNow = sys0ptrLocked()
    sys.pointer = __ptrNow      // ①(P-69) null = 无指针 ⇒ lockToPointer 发射器不发射
    // ①(P-136 用户第 4 项：照抄上游 MIT 实现) **鼠标尾迹能不能看见的那一步。**
    //   上游 `renderer/src/scene-mount.ts:1670-1676` 在 `advance()` **之前**、**每一帧**把活指针
    //   推进粒子系统（`ps.setPointer(wx, py)`），指针**从不参与**系统的构造/缓存签名 ⇒ 系统只在
    //   时间轴上增量前进，"光标走过的路径"被留在已存活粒子的坐标里 —— 那就是尾迹。
    //   本仓库此前的写法把指针坐标放进了下面的 `__sig`：指针一动签名就变 ⇒ 整系统从 t=0 重放，
    //   且重放全程只用**当前**这一个坐标 ⇒ 历史被抹平，花瓣永远糊在光标上（实测：尾迹跨度
    //   67px、每帧 400 步重放 ≈6.1 万次粒子更新；照抄后 1175px、每帧 1 步。数字见 P-136 台账）。
    //   `pushPointerFrame` 即上游那一块的落点（`core/we-particle-pointer.mjs` 块 F）。
    pushPointerFrame(sys, __ptrNow)
    // ①(尾迹离开 2026-09-19 · 改写 P-136 的"一帧清空") **无指针 ⇒ 就地收尾**。
    //   语义来源：无指针（离开画布 / `inside:false` / 页面失焦 / `?cursor=off`）时本层不再发射，
    //   已存活的粒子在**最后离开点**上渐隐、并在 `TRAIL_FINISH_FRAMES` 帧内归零。
    //   为什么不是旧的 `sys.particles.length = 0`（P-136 写法）：
    //     · 旧写法是**一帧蒸发**：离开帧整条尾迹直接不见，观感是"啪"地消失（用户口径：可以直接消失，
    //       但要有收尾）；且它让"离开后质心有没有被拽到画面中心"这条判据没有可观测对象；
    //     · 收尾窗口内**位置一帧都不动**（力中心由 `__cpWorldLocked` 冻结在最后离开点，见那里的注释），
    //       所以既不会"回到画面中心"，也不会"在边缘一直转圈"（上游宿主保留旧坐标 + 不停发 ⇒ 才会转圈）。
    //   仍然满足既有门禁（tests/pointer-leave-test.mjs 的 D1b/G5/G1/G1b/G2b/G2c/G3a/G3e/P3b…）：
    //   那些断言要求"离开后**第 1 帧**存活粒子就为 0"（P3b 连看 3 帧）⇒ 渲染器侧收尾窗口取
    //   `TRAIL_FINISH_FRAMES = 1`（离开帧当场归零，与用户口径"挪出去就直接消失"一致）；
    //   `finishTrailInPlace(sys, k)` 的 k>1 衰减性质在 `tests/trail-leave-test.mjs` 单元层钉住，
    //   将来 P3b 放宽成"第 2 帧起为 0"时把那个常量改成 2~4 即可（一行）。
    //   语义只在**无指针**时生效：指针在画布内移动时粒子照常存活（尾迹就靠这个），
    //   所以这条不会把尾迹抹掉（对照：A3d/P4c 两条断言要求"指针一动，全部粒子就在新指针 6px 内"，
    //   与"尾迹"在定义上互斥 —— 该冲突已在 P-136 台账报告，未擅自改断言）。
    if (__ptrLockedLayerNow && !__ptrNow && sys.particles && sys.particles.length) {
      const __left = finishTrailInPlace(sys)
      if (!__left) sys.__ptrCleared = (sys.__ptrCleared || 0) + 1
      else sys.__ptrFinishing = (sys.__ptrFinishing || 0) + 1
    }
    if (def && def.maxcount > sys.maxCount) partStat.capped++
    const __sim = simulateParticleSystem(sys, time, PARTICLE_BUDGET.steps)
    if (__sim) { partStat.simSteps += __sim.steps; partStat.simUpdates += __sim.updates }
    // ①(P-131 批D) **音频驱动发射**：本层开了音频响应吗、本帧包络多少、有没有采集源。
    //   记账进 `particleStats.audioLayers`（真机上报/门禁断言用）；"开了但没源"另出一条**一次性日志**
    //   —— 这是"没有麦克风/没有 <audio> 源时保持可观测、不静默"的落点之一。
    {
      const __audioEms = sys.emitters.filter((e) => audioSpecOn(e.audio))
      if (__audioEms.length) {
        const __ai = audioBandsInfo()
        const __envNow = __audioEms[0].audioLastEnv
        // `env` 只在**真的调制**时给数（`?audioemit=legacy` / 没有采集源的 auto 档 ⇒ null = "本层没吃包络"）：
        //   否则读上报的人会把"恒发射"误读成"音量满"。
        const __modulated = __ai.hasSource && __ai.mode !== 'legacy'
        partStat.audioLayers[String(layer.name || layer.id)] = {
          emitters: __audioEms.length, mode: __audioEms[0].audio.mode,
          env: (__modulated && typeof __envNow === 'number') ? +__envNow.toFixed(6) : null,
          modulated: __modulated,
          source: __ai.hasSource, emit: __ai.mode, viewKind: __ai.kind,
        }
        if (__ai.hasSource) partStat.audioModulated++
        else {
          partStat.audioNoSource++
          if (!partLogOnce.has('audionosrc:' + layer.id)) {
            partLogOnce.add('audionosrc:' + layer.id)
            try {
              onLog('[音频发射] 层 "' + (layer.name || layer.id) + '" 开了音频响应（audioprocessingmode=' + __audioEms[0].audio.mode
                + '）但**没有采集源** ⇒ 本层保持旧行为（恒发射）。要真正联动：`?audio=1&bandfeed=auto`（包内音轨）或 `?bandfeed=mic`；'
                + '想看官方的"无音乐不发射"用 `?audioemit=strict`；回到批 D 之前用 `?audioemit=legacy`')
            } catch (e) { /* ignore */ }
          }
        }
      }
    }
    // ①(P-103③/④) 出生期记账：本帧新吃了 exponent 的粒子数 / 新拿到发射器初速的粒子数
    const __expNow = sys.__spawnExps || 0, __spdNow = sys.__spawnSpeeds || 0
    if (__expNow > (sys.__spawnExpsSeen || 0)) { partStat.expApplied += __expNow - (sys.__spawnExpsSeen || 0); sys.__spawnExpsSeen = __expNow }
    if (__spdNow > (sys.__spawnSpeedsSeen || 0)) { partStat.spawnSpeeds += __spdNow - (sys.__spawnSpeedsSeen || 0); sys.__spawnSpeedsSeen = __spdNow }
    if (PSIM === 'incr') partStat.simMode = 'incr'
    else partStat.simMode = 'replay'
    const alphaMul = sys.alphaMul
    // ①(RE-31) 精灵表：帧尺寸来自 .tex TEXS（texObj.sprite），quad 纵横比取帧纵横比 rate=帧高/帧宽
    const sprite = texObj.sprite || null
    // ①(RE-31 多图精灵) imageId 不恒为 0 → 帧**换纹理**：按 cur 帧 imageId 分组、各组绑定各自纹理
    //   （行为对照：wer-ref CustomShaderPass.cpp:1296-1299 把当前帧的 imageId 直接写成活动贴图槽号；单图路径仍走 UV 偏移）
    const multiSprite = !!(sprite && sprite.multiImage && texObj.images && texObj.images.length > 1)
    let spriteImgs = null
    let spriteTexMap = null
    if (multiSprite) {
      try {
        if (!texObj.__mpwSpriteImgs) texObj.__mpwSpriteImgs = spriteMultiImages(texObj)
        spriteImgs = texObj.__mpwSpriteImgs
        if (spriteImgs) {
          // 纹理按 texObj 缓存（逐帧重建会浪费 96MB 级上传带宽）
          if (!texObj.__mpwSpriteTexs) {
            texObj.__mpwSpriteTexs = new Map()
            for (const im of spriteImgs.imgs) {
              const t = makeTexture(gl, im.rgba, im.w, im.h)
              if (t) texObj.__mpwSpriteTexs.set(im.id, t)
            }
          }
          spriteTexMap = texObj.__mpwSpriteTexs
          if (!spriteTexMap.size) { spriteImgs = null; spriteTexMap = null }
        }
      } catch { spriteImgs = null; spriteTexMap = null }
    }
    const ratio = sprite ? sprite.rate : ((texObj.width > 0) ? (texObj.height || texObj.width) / texObj.width : 1)
    // ①(P-126 B) 精灵表**帧值**（归一化到 [0,1)，`computeSpriteFrameUV` 再乘 N 取整帧）：
    //   randomframe → 出生抽一次 `p.random` 终身固定（官方 RANDOMONE 语义，不变）。
    //   sequence（缺省档）→ official：`frac(age · speed / duration)`；legacy：`(1 − lifePos) · speed`。
    //   无帧表 duration（非精灵表 / frametime 全 0）时两档**逐位一致**（回退旧式），
    //   所以本改动只影响"真带帧表的贴图"，其余粒子层顶点流一个字节都不变。
    const spriteDuration = (sprite && typeof sprite.duration === 'number' && isFinite(sprite.duration) && sprite.duration > 0)
      ? sprite.duration : 0
    const seqSpeed = (typeof sys.seqMul === 'number' && isFinite(sys.seqMul) && sys.seqMul > 0) ? sys.seqMul : 1
    const spriteFrameValue = (p, lifePos) => {
      if (sys.animMode === 'randomframe') return Math.max(0, Math.min(1, p.random || 0))
      const t2 = ((p.age || 0) * seqSpeed) % spriteDuration
      if (PFRAME_MODE === 'official' && spriteDuration > 0) return (t2 < 0 ? t2 + spriteDuration : t2) / spriteDuration
      return (1 - lifePos) * (sys.seqMul || 1)
    }
    // 帧混合开关：randomframe 必须关（第三方参考实现 wer-ref WPSceneParser.cpp:5928-5936 注释：避免"两片花瓣"）。
    // ①(修正 2026-09-13) flags 值 4 **不是** noframeblending 而是透视相机（实测命中该值的层
    //   材质为 presets/rainperspective、presets/snowperspective）；按位读 bit2=2 才是 spritenoframeblending。
    const pflags = (def && def.flags) || 0
    const spriteNoBlend = sys.animMode === 'randomframe' || (pflags & 2) !== 0
    // ①(RE-37) flags 值 4 → 第三方参考实现 wer-ref SetCamera("global_perspective")：fov=atan(h/1000/2)×2、相机 z=1000
    const perspCam = (pflags & 4) !== 0 && !PP_DISABLED
    gl.useProgram(particleProg)
    setBlend(blending === 'additive' ? 'additive' : 'translucent')
    gl.bindVertexArray(vao)
    uploadQuad('local', LOCAL_QUAD)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, (multiSprite && spriteAtlasTex) ? spriteAtlasTex : texObj.glTex)
    gl.uniform1i(partUni.tex, 0)
    // ①(修复) 合批单次绘制：所有粒子拼进一个顶点缓冲（CPU 端 NDC 变换+颜色/alpha 入顶点色），
    // 一次 drawArrays —— 原"每粒子一次 draw"导致 5fps 卡顿（50+粒子×8层×逐帧）
    const vis = []
    // ①(P-149 overbright) **实例色因子**：宿主（`demo.html` 粒子材质段）从 `pass.constantshadervalues`
    //   按取值契约算好写进 `layer.__particleOverbright`（缺省 1，见 `particleOverbrightFactor`），
    //   这里只做"取用 + 兜底"：非有限数/负数 ⇒ 1/0；`?overbright=legacy` ⇒ **恒 1**（逐位回到旧画面）。
    //   上游 `particles.js:1300` 的同构式：`bright = (this._ov.brightness || 1) * (this.overbright ?? 1)`，
    //   乘在实例 RGB 上、**不动 alpha**（同文件 `:1341-1343` 的 rope 分支就是三个分量各 `* bright`）。
    const __obRaw = OVERBRIGHT_MODE === 'legacy' ? 1 : layer.__particleOverbright
    const obf = (typeof __obRaw === 'number' && Number.isFinite(__obRaw)) ? Math.max(0, __obRaw) : 1
    if (obf !== 1) {
      partStat.overbright.layers++
      // 首个吃因子的层直接定基准（否则 min 恒停在初值 1 ⇒ "只见 >1 的因子"这种误读）
      if (partStat.overbright.layers === 1) { partStat.overbright.minFactor = obf; partStat.overbright.maxFactor = obf } else {
        if (obf < partStat.overbright.minFactor) partStat.overbright.minFactor = obf
        if (obf > partStat.overbright.maxFactor) partStat.overbright.maxFactor = obf
      }
      partStat.overbright.lastFactor = obf
      partStat.overbright.lastLayer = String(layer.name || layer.id)
    }
    for (const p of sys.particles) {
      const lifePos = p.life > 0 ? p.age / p.life : 1
      if (lifePos >= 1) continue
      const a = Math.max(0, p.alpha) * alphaMul
      if (a <= 0.002) continue
      const szRaw = Math.max(0.5, p.size)
      // ①(P-74 ②) 官方口径：quad 边长 = p.size/2（`WPParticleRawGener.cpp:85` 先 /2 写进
      //   `a_TexCoordVec4.w`，`common_particles.h:52-57` 再以 (uv-0.5) 跨度 1 展开）。
      //   我们此前直接把 p.size 当跨度 ⇒ 边长 = 官方的 2×（凯尔希"粒子非常大"的主因之一）。
      //   `?psize=legacy` 回到旧口径（逐位复现 P-65 行为）。
      const sz = PSIZE_MODE === 'legacy' ? szRaw : szRaw * 0.5
      // ①(RE-31) 帧值：randomframe=RANDOMONE（出生抽一次 p.random 终身固定）；其余=SEQUENCE
      //   （官方 (1 − lifetime/init) × sequencemultiplier，可 >1 由 shader frac 折返循环）
      let frameUV = null
      let ratioP = ratio
      if (multiSprite && spriteImgs) {
        const fv = spriteFrameValue(p, lifePos)
        const fr = spriteFrameImageRects(texObj, fv, spriteNoBlend)
        if (fr) {
          frameUV = { abs: true, cur: fr.cur, nxt: fr.nxt, blend: fr.blend, imageId: fr.cur.imageId }
          ratioP = fr.cur.ratio
        }
      } else if (sprite) {
        const fv = spriteFrameValue(p, lifePos)
        frameUV = computeSpriteFrameUV(sprite, fv, spriteNoBlend)
      }
      // ①(P-126 A) 逐粒子颜色 = `p.color`（`colorrandom` 插值出的 RGB / `colorchange` /
      //   `instanceoverride.colorn|color`）。⚠ 旧实现在这里写了
      //   `mix(color1, color2, p.color[0])`，而 `color1`/`color2` **恒被硬编码成 [1,1,1]**
      //   ⇒ 三个分量恒等于 1：**即使把 `vis[3..5]` 接进顶点也还是白色**（真正把颜色丢掉的是这一步，
      //   不只是解构时空位跳过）。官方 `genericparticle.frag:39/43/46` 是
      //   `color = v_Color * Convert(tex)`，`v_Color` 是**逐粒子 vec4**（rgb=本行三个分量、
      //   a=已有的逐粒子 alpha 通道）—— 没有 color1/color2 uniform，故直接取其值。
      // ①(P-149 overbright) `overbright` 乘在**三个颜色分量**上（`obf` 恒 ≥0）：
      //   `obf === 1` 时 `x * 1 === x` ⇒ 与改动前**逐位相同**（29/54 层、13/38 材质走这一档）。
      //   ⚠ **不能**把 `Math.min(1, …)` 套在乘之后：`overbright = 5`（`reactive Stars` / `Glass Shards`）
      //   会被钳回 1，等于没修；这里只对**逐粒子基色**钳 `[0,1]`（P-126 既有口径），因子本身不设上界。
      //   alpha 不上因子（`a` 已在上面算好，与上游 `:1344` 的 `(a.alpha + b.alpha) * 0.5` 同口径）。
      const colorR = Math.max(0, Math.min(1, p.color[0] || 0)) * obf
      const colorG = Math.max(0, Math.min(1, p.color[1] || 0)) * obf
      const colorB = Math.max(0, Math.min(1, p.color[2] || 0)) * obf
      vis.push([p, sz, a, colorR, colorG, colorB, frameUV, ratioP])
    }
    // ①(P-59) 预算记账：本层实际进入顶点的粒子数从总份额里扣（未用满的份额自然顺延给后面的层）
    partStat.drawn++
    partStat.alive += vis.length
    partFrame.left -= vis.length
    if (vis.length) {
      // ①(RE-31 多图精灵) 分组：multi 时按 cur 帧 imageId 分组（各组绑定各自纹理），单图/无精灵=组 0
      const groups = new Map()
      if (multiSprite && spriteImgs) {
        for (const e of vis) groups.set(e[6] && e[6].abs ? e[6].imageId : 0, (groups.get(e[6] && e[6].abs ? e[6].imageId : 0) || []).concat([e]))
      } else {
        groups.set(0, vis)
      }
      // CPU NDC：世界→裁剪（viewProj 为设计正交投影，缩放比例 worldToNdc）
      // ①(P-65) 世界(设计像素, y-down) → NDC 的**唯一**换算，与层路径同号。
      // ①(P-133 #2) **P-69 把层路径的投影 y 掰正后，这里没跟着改** —— 本处旧注释引用的
      //   "viewProj 把 world(0,0)→NDC(-1,-1)" 是 P-69 **之前**的读数；P-69 之后
      //   `projectionYFix()=true`（缺省）时 viewProj 把 world(0,0)→NDC **+1（屏幕顶）**
      //   （`buildCamera` 的 `mat4Ortho` 修正；判据见 tests/projection-y-test.mjs [1]）。
      //   而粒子 VS 的 `u_MVP` 上传的是 **IDENT_M4**（见下方 uniformMatrix4fv）⇒ CPU 算的 NDC
      //   就是最终 NDC ⇒ 整条粒子路径相对所有四边形/蒙皮层**绕画布中线 y 镜像**。
      //   现场（`node tests/particle-render-correctness-test.mjs --verbose` 的 NDC 断言 +
      //   `/tmp` 探针 probe-ln.mjs）：world y=540 → 粒子 NDC −0.5、层路径 +0.5。
      //   ⇒ 用户第 ③ 项"鼠标往中线上方走、粒子反而往下走"（该层 origin 恰是画布中线 y=1080，
      //   镜像的不动点，所以**只有 midline 上看着是跟手的**）。
      //   现在跟随 `projectionYFix()`：缺省 fix（y=0→屏幕顶，与层路径/MESH_VERT 同口径）；
      //   `?projy=legacy` 逐位回到旧的镜像口径（层 + 粒子一起回退，A/B 仍可做，不新增开关）。
      const W = cam.projW, H = cam.projH
      const cx0 = W / 2, cy0 = H / 2
      const dsOf = (z) => (perspCam ? (1000 / Math.max(1, 1000 - (z || 0))) : 1)
      const NDC_YFIX = projectionYFix()
      const nX = (x, ds) => ((cx0 + (x - cx0) * ds) / W) * 2 - 1
      const nY = (y, ds) => {
        const t = (((cy0 + (y - cy0) * ds)) / H) * 2 - 1
        return NDC_YFIX ? -t : t          // fix: 世界 y↓ = 屏幕 y↓（y=0 在屏幕顶）
      }
      // ①(P-103① 用户第 12 项) **粒子 quad 的图层变换**（局部偏移 → 世界偏移）。
      //   官方：`genericparticle.vert:86-87` 把 `ComputeParticlePosition`（同文件 :86）的结果乘 `g_ModelViewProjectionMatrix`（:87）
      //   —— 模型矩阵 = 图层 T·R·S ⇒ **size 偏移也吃图层 scale/角度**（不是只缩放位置）。
      //   本实现的次序与 `spawnParticle` 的发射器偏移**逐字同序**（先按 z 角旋转、再逐轴乘 scale，
      //   见那里 `rpx/rpy → *em.scale[i]`），否则同一层里"位置"与"贴片形状"会用两套空间。
      //   `?pquad=legacy` = P-100 行为（恒等变换：quad 只随 p.pos 走，形状不吃 scale/角度）。
      const LS = layer.scale || [1, 1, 1]
      // legacy 档把整条通路归零（scale=1、角=0 ⇒ toWorldOff 恒等），而不是只关角度
      const lsx = (PQUAD_MODE !== 'legacy' && typeof LS[0] === 'number' && isFinite(LS[0])) ? LS[0] : 1
      const lsy = (PQUAD_MODE !== 'legacy' && typeof LS[1] === 'number' && isFinite(LS[1])) ? LS[1] : 1
      const lang = (PQUAD_MODE === 'legacy') ? 0 : ((layer.angles && layer.angles[2]) || 0)
      const lc = Math.cos(-lang), lsn = Math.sin(-lang)
      // 局部 (u 轴, v 轴) 偏移 → 世界偏移；legacy 档下 lc=1/lsn=0/lsx=lsy=1 ⇒ 与 P-100 逐位一致。
      const toWorldOff = (ou, ov) => {
        const rx2 = ou * lc - ov * lsn
        const ry2 = ou * lsn + ov * lc
        return [rx2 * lsx, ry2 * lsy]
      }
      const PQUAD_ON = (PQUAD_MODE !== 'legacy') && (lsx !== 1 || lsy !== 1 || lang !== 0)
      // ①(P-65) 形状通道记账（官方 ConvertTexture0Format，TEX0FORMAT 来自 .tex format）
      const texFmt = texFormatOf(texObj)
      const fmtKey = (texFmt === 8 || texFmt === 10) ? 'rg88' : ((texFmt === 9 || texFmt === 11) ? 'r8' : (texFmt < 0 ? 'unknown' : 'rgba'))
      partStat.shapeFrom[fmtKey] = (partStat.shapeFrom[fmtKey] || 0) + 1
      // trail 几何开关：?trail=quad → 退回 P-59 的"普通贴图 quad 近似"（长条贴图会画成竖线）
      const useTrailGeom = (TRAIL_MODE !== 'quad')
      const kind = useTrailGeom ? rname : 'sprite'
      let layerTrailSegs = 0
      if (useTrailGeom && trailCfg.trail && !partLogOnce.has('trailgeo:' + kind + ':' + (layer.name || layer.id))) {
        partLogOnce.add('trailgeo:' + kind + ':' + (layer.name || layer.id))
        try {
          onLog('[粒子] 层 "' + (layer.name || layer.id) + '" renderer=' + kind + ' 官方几何生效：'
            + (kind === 'spritetrail'
              ? ('沿速度拉伸一条精灵（length=' + trailCfg.length + '，maxlength=' + trailCfg.maxLength + '）')
              : ('按' + (kind === 'rope' ? '发射序' : '每粒子历史') + '连 ribbon（segments=' + trailCfg.segments + '）'))
            + '；贴图=' + texName) } catch {}
      }
      for (const [gkey, gvis] of groups) {
        // 顶点数不再是固定 6×N（rope 按段数、ropetrail 按历史长度）→ 先攒成普通数组再定型
        const out = []
        // ①(P-126 A) 逐粒子颜色缓冲（与 out 同顶点数；每顶点 3 float，独立 VBO）。
        const outC = []
        // **整批同色上提**：`instanceoverride.colorn/color`（replacesColor）与"无 colorrandom /
        //   min==max"这几类占语料粒子层的大多数，此时整批颜色相同 ⇒ 写进 `u_Color`、
        //   顶点色恒 (1,1,1)（省 12B/顶点，且绘制时的 `u_Color` 就是该层的真实颜色，便于门禁断言）。
        //   只有颜色逐粒子不同（连续 colorrandom）时才走逐顶点色、`u_Color=(1,1,1)`。
        //   两种情形在 FS 里都是 `u_Color * v_Color * tex.rgb` ⇒ 等价，缺省层（全白）与改前**逐位一致**。
        let batchUniCol = true
        const cA = gvis.length ? gvis[0][3] : 1, cB = gvis.length ? gvis[0][4] : 1, cC = gvis.length ? gvis[0][5] : 1
        for (let e2 = 1; e2 < gvis.length; e2++) {
          const g2 = gvis[e2]
          if (Math.abs(g2[3] - cA) > 1e-6 || Math.abs(g2[4] - cB) > 1e-6 || Math.abs(g2[5] - cC) > 1e-6) { batchUniCol = false; break }
        }
        const uniCol = batchUniCol ? [cA, cB, cC] : null
        if (batchUniCol) partStat.colorUni++; else partStat.colorAttr++
        for (const [p, sz, a, pR, pG, pB, frameUV, ratioP = ratio] of gvis) {
          const z = p.pos[2] || 0
          const ds = dsOf(z)
          // ①(P-126 A) 逐粒子颜色（上提时恒 1，避免与 u_Color 二次相乘）
          const vR = uniCol ? 1 : pR, vG = uniCol ? 1 : pG, vB = uniCol ? 1 : pB
          // 帧 UV：**两条路都用"帧内矩形"插值** ——
          //   abs（多图精灵）= 该帧在自己那张图里的绝对矩形；
          //   单图精灵 = 帧原点 + uv · 帧尺寸（①(P-133 #1)：`su/sv` = 官方 `uvFrameSize`）。
          //   ⚠ P-133 之前单图路写的是 `u + cu.u0`（只加原点、**不乘帧尺寸**）⇒ 每颗粒子 u 跨度
          //   恒 1.0 = 整张图集，13 帧横排图集被压成"一条条竖线"（用户第 ①/② 项）。
          const cu = frameUV ? (frameUV.abs ? frameUV.cur : frameUV) : null
          const nu = frameUV ? (frameUV.abs ? frameUV.nxt : frameUV) : null
          const okFrame = !!(cu && typeof cu.u0 === 'number' && nu && typeof nu.u0 === 'number')
          const fB = okFrame ? (frameUV.blend || 0) : 0
          const uvf = okFrame ? frameRectUVFn(cu, nu, fB) : (u, v) => [u, v, u, v, 0]
          // 一个顶点：世界 (x,y) + 纹理 (u,v)（帧映射 + 逐粒子 alpha 写进顶点）
          const push = (x, y, u, v) => {
            const q = uvf(u, v)
            out.push(nX(x, ds), nY(y, ds), 0, q[0], q[1], q[2], q[3], q[4], a)
            outC.push(vR, vG, vB)
          }
          if (kind === 'rope' || kind === 'ropetrail') continue   // 这两类在下面按段/按历史整体构建
          if (kind === 'spritetrail') {
            // ── 官方 spritetrail（切轴 `common_particles.h:41-49` + 展开 `:52-56` 同式）──
            //   right = normalize(cross(V, eye))；up = V̂ · min(|V|·length, maxlength)
            //   corner(u,v) = P + size·right·(u−0.5) − size·up·(v−0.5)·textureRatio
            //   ⇒ 贴图 u 横跨（⊥速度）、v 沿速度，v=0 在前进端。
            const vx = p.vel[0], vy = p.vel[1]
            const spd = Math.hypot(vx, vy)
            let rx = 1, ry = 0, ux = 0, uy = 0
            if (spd > 1e-6) {
              rx = vy / spd; ry = -vx / spd                     // normalize(cross(V,(0,0,1)))
              const st = spriteTrailStretch(spd, trailCfg)
              ux = (vx / spd) * st; uy = (vy / spd) * st
            }
            const usArr = [0, 0, 1, 1, 0, 1], vsArr = [1, 0, 1, 1, 0, 0]
            for (let k = 0; k < 6; k++) {
              const u = usArr[k], v = vsArr[k]
              const du = sz * (u - 0.5), dv = sz * ratioP * (v - 0.5)
              push(p.pos[0] + rx * du - ux * dv, p.pos[1] + ry * du - uy * dv, u, v)
            }
            continue
          }
          // ── sprite（含 ?trail=quad 回退）：P-59 六顶点表的**同一张 UV 表**，位移按官方两条公式重建 ──
          //   k0..k5 = BL,TL,BR,BR,TL,TR（UV 与 P-59/P-65 逐个相同 ⇒ 贴图朝向零回归）
          //   ①(P-103②) 局部轴由**粒子自转**给出（官方 `common_particles.h:20-38 ComputeParticleTangents`
          //     的 z 轴 roll：right=(cosθ, sinθ)、up=(−sinθ, cosθ)；θ=0 时逐位退化成旧表的 (±hw,±hh)）。
          //     注：官方那个 3×3 还含 rotation.x/rotation.y（把 quad 掰出屏幕平面），2D 场景语料不用，未接。
          //   ②(P-103①) 局部偏移再过图层变换 `toWorldOff`（scale + z 角）。
          const us  = [ 0, 0, 1, 1, 0, 1 ]
          const vs  = [ 1, 0, 1, 1, 0, 0 ]
          const rotOn = (PROT_MODE !== 'legacy') && !!p.rot
          const rc = rotOn ? Math.cos(p.rot) : 1
          const rs = rotOn ? Math.sin(p.rot) : 0
          if (rotOn) partStat.protQuads++
          if (PQUAD_ON) partStat.pquadQuads++
          for (let k = 0; k < 6; k++) {
            const A = us[k] - 0.5, B = vs[k] - 0.5
            const lx = sz * A * rc + sz * ratioP * B * rs
            const ly = sz * A * rs - sz * ratioP * B * rc
            const off = toWorldOff(lx, ly)
            push(p.pos[0] + off[0], p.pos[1] + off[1], us[k], vs[k])
          }
        }
        // ── rope：官方把**存活粒子按出生序连成折线**（REVERSE-FINDINGS-5.md:106；粒子数组即控制点）
        //    ── ropetrail：每粒子一条位置历史（buildParticleSystem/stepParticles 采样，length 秒 × segments 点）
        //    两者共用同一段 ribbon 代码：每段 2 三角形，半宽 = 两端 size/2 的线性插值，
        //    贴图 u 横跨绳宽、v 沿整条轨迹推进（官方 genericropeparticle.vert:148-167 同式（两端 size 混合展开 ribbon））。
        if (kind === 'rope' || kind === 'ropetrail') {
          const N = gvis.length
          for (let gi = 0; gi < N; gi++) {
            const e = gvis[gi]
            const p = e[0], sz = e[1], a = e[2], frameUV = e[6]
            // ①(P-126 A) 逐粒子颜色（整批同色时上提进 u_Color ⇒ 顶点色恒 1）
            const vcR = uniCol ? 1 : e[3], vcG = uniCol ? 1 : e[4], vcB = uniCol ? 1 : e[5]
            const cu = frameUV ? (frameUV.abs ? frameUV.cur : frameUV) : null
            const nu = frameUV ? (frameUV.abs ? frameUV.nxt : frameUV) : null
            const okFrame = !!(cu && typeof cu.u0 === 'number' && nu && typeof nu.u0 === 'number')
            const fB = okFrame ? (frameUV.blend || 0) : 0
            const uvf = okFrame ? frameRectUVFn(cu, nu, fB) : (u, v) => [u, v, u, v, 0]
            const pushA = (x, y, z2, u, v) => {
              const q = uvf(u, v)
              const ds2 = dsOf(z2)
              out.push(nX(x, ds2), nY(y, ds2), 0, q[0], q[1], q[2], q[3], q[4], a)
              outC.push(vcR, vcG, vcB)
            }
            // 段端点序列：rope = [本粒子, 下一个粒子]；ropetrail = 该粒子的历史点（末尾接当前位置）
            let segs = null
            if (kind === 'rope') {
              if (gi + 1 >= N) continue
              const q = gvis[gi + 1]
              segs = [[p.pos, sz], [q[0].pos, q[1]]]
            } else {
              const hist = (p.trail && p.trail.length >= 2) ? p.trail : null
              if (!hist) { partStat.trailDegenerate++; continue }
              segs = hist.map((h) => [h, sz])
              const last = hist[hist.length - 1]
              if (Math.hypot(p.pos[0] - last[0], p.pos[1] - last[1]) > 1e-3) segs.push([p.pos, sz])
              if (segs.length < 2) { partStat.trailDegenerate++; continue }
            }
            const nseg = segs.length - 1
            for (let si = 0; si < nseg; si++) {
              const A = segs[si], B = segs[si + 1]
              const ax = A[0][0], ay = A[0][1], az = A[0][2] || 0
              const bx = B[0][0], by = B[0][1], bz = B[0][2] || 0
              const dx = bx - ax, dy = by - ay
              const len = Math.hypot(dx, dy)
              // 退化段（两粒子重合，如 Trails 2 的 distancemax=0 + drag=0 全静止）：
              //   官方 ribbon 面积恒 0 → 本就不该有像素。旧实现在这里画出"一摞竖条"，
              //   正是用户第 8/9 项"屏幕中间红块"的来源，故显式跳过并记账。
              if (!(len > 1e-3)) { partStat.trailDegenerate++; continue }
              // right = normalize(cross(eye, trailDelta)) * 半宽（两边各 ±半宽 ⇒ 总宽 = 平均 size）
              const nx2 = -dy / len, ny2 = dx / len
              // ①(P-74 ②) **rope/ropetrail 不走 sprite 的 /2 口径**：官方 ribbon 的顶点尺寸来自
              //   wer-ref WPParticleRawGener.cpp:194 的样条（行为对照：两端各按"该端 size 的一半"做线性插值）
              //   → `genericropeparticle.vert:133/138` 的 `sizeStart/sizeEnd`，再以 `right*(uvs.x*2-1)` 展开
              //   ⇒ **总宽 = 2×spline_size = p.size**（是 sprite 的 2 倍口径，官方两条生成器本就不同）。
              //   所以 official 档要把上面已经 /2 的 sz 还原回 p.size 再算半宽。
              const szRib = (v) => (PSIZE_MODE === 'legacy' ? v : v * 2)
              const hwa = Math.max(0.5, szRib(A[1]) / 2), hwb = Math.max(0.5, szRib(B[1]) / 2)
              // V 沿轨迹推进。官方 genericropeparticle.vert:53-56（THICK=rope 分支，逐字）：
              //   "New particles are at the end of the array" ⇒ usableLength = trailLength-1、
              //   uvMin = 1 − trailPosition/usableLength、uvDelta = −1/usableLength
              //   ⇒ **最新端 V≈0、最老端 V≈1**（V 随段号递减）。
              //   ropetrail 走另一分支（:62-75，in_SegmentUVTimeOffset/表 0）：uvMin=(pos−1)/(N−1)、
              //   uvDelta=+1/(N−1) ⇒ V 随历史点递增（最老 0 → 最新 1）。两条分支方向本就相反。
              //   ⚠ 分母必须用**整条轨迹**的段数：rope 每次只发 1 个 pair（nseg==1），
              //     用 nseg 会让第二段起 V 变成负数（实测段 28 的 V=1/0 —— 与首段相同）。
              const uvTotal = (kind === 'rope') ? Math.max(1, N - 1) : nseg
              const v0 = (kind === 'rope') ? (1 - gi / uvTotal) : (si / uvTotal)
              const v1 = (kind === 'rope') ? (1 - (gi + 1) / uvTotal) : ((si + 1) / uvTotal)
              const pt = (u, t) => {
                const x = ax + dx * t + (nx2 * (hwa + (hwb - hwa) * t)) * (u * 2 - 1)
                const y = ay + dy * t + (ny2 * (hwa + (hwb - hwa) * t)) * (u * 2 - 1)
                const zz = az + (bz - az) * t
                return [x, y, zz]
              }
              const VT = v0 + (v1 - v0) * 0, VB = v0 + (v1 - v0) * 1
              const c00 = pt(0, 0), c01 = pt(0, 1), c10 = pt(1, 0), c11 = pt(1, 1)
              pushA(c00[0], c00[1], c00[2], 0, VT)
              pushA(c01[0], c01[1], c01[2], 0, VB)
              pushA(c10[0], c10[1], c10[2], 1, VT)
              pushA(c10[0], c10[1], c10[2], 1, VT)
              pushA(c01[0], c01[1], c01[2], 0, VB)
              pushA(c11[0], c11[1], c11[2], 1, VB)
              partStat.trailSegments++
              layerTrailSegs++
            }
          }
        }
        if (!out.length) continue
        const verts = Float32Array.from(out)
        gl.useProgram(particleProg)
        setBlend(blending === 'additive' ? 'additive' : 'translucent')
        gl.bindVertexArray(partVao)
        // ①(P-126 A) 逐粒子颜色缓冲**先上传**、几何缓冲后上传：本仓库既有的 mock-GL 探针
        //   （`mock-gl-test` 的 `bufLast`、`particle-render-correctness-test` 的 `rec.verts[last]`、
        //   `particle-shape-audit` 的 `curVerts`）都以"最后一次 bufferData = 几何顶点流"为约定，
        //   顺序颠倒会把这些门的输入变成颜色流。a_Color 的 VBO 绑定在 partVao 里已固化，
        //   运行期只往它写数据即可。
        if (partColorLoc >= 0) {
          gl.bindBuffer(gl.ARRAY_BUFFER, partColorVBO)
          gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(outC), gl.DYNAMIC_DRAW)
        }
        // 直接上传粒子 batch 缓冲（vao 端点 0/1 布局同 LOCAL_QUAD：pos3+uv2）
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBatchVBO)
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW)
        gl.activeTexture(gl.TEXTURE0)
        const __ptex = (multiSprite && spriteTexMap && spriteTexMap.get(gkey)) ? spriteTexMap.get(gkey) : texObj.glTex
        gl.bindTexture(gl.TEXTURE_2D, __ptex)
        gl.uniform1i(partUni.tex, 0)
        // ①(P-126 A) 旧实现恒 (1,1,1) ⇒ 逐粒子 RGB 整条丢弃（萤火虫 authored 紫色不上屏）。
        //   现在：整批同色 → 该颜色（层 4569 的 instanceoverride.colorn = 0.412/0.306/0.694 就在这条路上）；
        //   逐粒子不同色 → (1,1,1)，真实颜色由 a_Color 顶点属性带入（FS 里两者相乘）。
        if (uniCol) gl.uniform3f(partUni.color, uniCol[0], uniCol[1], uniCol[2])
        else gl.uniform3f(partUni.color, 1, 1, 1)
        gl.uniform1f(partUni.alpha, 1)
        // ①(P-65) TEX0FORMAT：单/双通道贴图（R8/RG88…）在 FS 里过官方 ConvertTexture0Format
        if (partUni.fmt) gl.uniform1f(partUni.fmt, texFmt)
        gl.uniformMatrix4fv(partUni.mvp, false, IDENT_M4)
        // ①(W1③ P-36) 粒子批量绘制同样过可绘制性校验（纹理失效/反馈环 → 跳过本组）
        if (drawGuard('particle', __ptex, null, String(layer.name || layer.id), null)) gl.drawArrays(gl.TRIANGLES, 0, verts.length / 9)
        if (kind === 'rope' || kind === 'ropetrail') partStat.trailDrawn++
      }
      // ①(P-65) 应画却没画（段全退化）也留证：`Trails 2`（rope / origin=画布中心 / 发射器
      //   distancemax=0 且 drag=0 → 20 个粒子全停在同一点）走官方几何后面积恒 0，
      //   本就不该上屏；旧实现在这里画出"一摞竖条" = 用户第 8/9 项的"屏幕中间红色块"。
      if ((kind === 'rope' || kind === 'ropetrail') && layerTrailSegs === 0 && !partLogOnce.has('traildegen:' + (layer.name || layer.id))) {
        partLogOnce.add('traildegen:' + (layer.name || layer.id))
        try { onLog('[粒子] 层 "' + (layer.name || layer.id) + '" renderer=' + kind
          + ' 本帧 0 有效段（粒子重合/历史不足，官方 ribbon 面积恒 0 → 不上屏，不再画成竖条）；'
          + '退化段累计=' + partStat.trailDegenerate + '；贴图=' + texName) } catch {}
      }
    }
    gl.bindVertexArray(null)
    try { const ge2 = gl.getError(); if (ge2 !== gl.NO_ERROR && !passErrorLogged.has('particle-draw 0x' + ge2.toString(16))) { passErrorLogged.add('particle-draw 0x' + ge2.toString(16)); try { onLog('[we-scene] 粒子绘制错误 0x' + ge2.toString(16)) } catch {} } } catch {}
    return { sys }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ①(P-144 2026-09-19) **子系（`children`）的渲染侧**：把 `layer.particleDef.children` 的每一条
  // 变成一个"伪层"再走一遍 `renderParticleLayerBody` —— 于是子系的**贴图/材质/几何/blending/
  // 预算/缺纹理日志**全部复用父层那条通路（不抄第二份绘制代码），并且子系自己也能再挂子系
  // （递归深度上限 3，与上游 `scene-mount.ts:1458` 同一守卫）。
  //
  //   子系 def/材质/贴图从哪来：**宿主解析**（`demo.html` 的 `resolveParticleChildren`，走
  //   包内 → `/weassist` → 预设 basename 索引的同一条回退链）存进 `layer.__pchildMap`
  //   （`Map<defPath, {def, texName, blending, src}>`，同名的 33 条 Matrix 子系只解析一次）。
  //   宿主没解析（测试/第三方直用 bundle）⇒ 该条子系记 `unresolved` 并跳过绘制，
  //   **父层与其余子系照画**。
  // ═══════════════════════════════════════════════════════════════════════════
  function renderParticleChildren(layer, parentSys, textures, cam, viewProj, width, height, time) {
    if (CHILDREN_MODE === 'legacy') return 0
    const specs = (parentSys && Array.isArray(parentSys.children) && parentSys.children.length)
      ? parentSys.children
      : (() => {
        const d = layer.particleDef
        if (!d || !Array.isArray(d.children) || !d.children.length) return null
        if (!layer.__pchildSpecs) layer.__pchildSpecs = parseParticleChildren(d)
        return layer.__pchildSpecs.length ? layer.__pchildSpecs : null
      })()
    if (!specs || !specs.length) return 0
    const depth = (typeof layer.__pdepth === 'number' && layer.__pdepth > 0) ? layer.__pdepth : 0
    if (depth >= 3) {
      // 上游 `scene-mount.ts:1458`：`if (depth > 3) return null`（防病态数据指数展开）
      partStat.children.depthCapped++
      if (!partLogOnce.has('cdepth:' + layer.id)) {
        partLogOnce.add('cdepth:' + layer.id)
        try { onLog('[粒子子系] 层 "' + (layer.name || layer.id) + '" 子系嵌套深度到顶（3）⇒ 本层不再展开') } catch {}
      }
      return 0
    }
    // 事件快照：**父系本帧**的出生/死亡位置（`stepParticles` 只记坐标、不抽随机数）。
    // 先整份取走再清空父系的队列 —— 同一父系的多条同 type 子系要吃**同一份**事件，
    // 若让某一条子系"消费掉"，其余子系就一条都收不到。
    const evSpawn = (parentSys && parentSys.pSpawnEv && parentSys.pSpawnEv.length) ? parentSys.pSpawnEv.slice() : null
    const evDeath = (parentSys && parentSys.pDeathEv && parentSys.pDeathEv.length) ? parentSys.pDeathEv.slice() : null
    if (parentSys) {
      if (parentSys.pSpawnEv) parentSys.pSpawnEv.length = 0
      if (parentSys.pDeathEv) parentSys.pDeathEv.length = 0
    }
    partStat.children.specs += specs.length
    partStat.children.parents++
    let drawnChild = 0
    for (const spec of specs) {
      const res = layer.__pchildMap ? layer.__pchildMap.get(spec.name) : null
      if (!res || !res.def) {
        partStat.children.unresolved++
        if (!partLogOnce.has('cdef:' + spec.name)) {
          partLogOnce.add('cdef:' + spec.name)
          try { onLog('[粒子子系] ⚠ 缺子系定义 "' + spec.name + '"（父层 "' + (layer.name || layer.id)
            + '"，type=' + spec.type + '）⇒ 只跳过这一条子系') } catch {}
        }
        continue
      }
      // 父层变换 × 子系 authored 变换（scale 逐轴相乘、angles 逐轴相加；origin 见下）
      const LS = layer.scale || [1, 1, 1]
      const LA = layer.angles || [0, 0, 0]
      const baseName = String(spec.name).split('/').pop().replace(/\.json$/, '')
      // `static`/事件类：原点是**固定**的锚点（父层变换 × 子系 origin，走照抄来的 `localToWorld`）；
      // `eventfollow`：原点是固定基准，**每帧**由 `__prepareParticleChild` 改 `sys.origin` 跟父粒子走
      //   —— 绝不能把"跟着动的锚点"写进 `layer.origin`：那会让重建签名每帧变化 ⇒ 每帧从 0 重放
      //   （P-136 的同一类坑，见 `__sig` 注释）。
      const anchor = particleChildAnchorWorld(parentSys || layer, layer, spec)
      const childLayer = {
        __pchild: { spec, parentSys: parentSys || null, parentLayer: layer, res, events: (spec.type === 'eventspawn' ? evSpawn : (spec.type === 'eventdeath' ? evDeath : null)), depth },
        __pdepth: depth + 1,
        // 子系的子系也能解析：map 是"全 def 名 → 解析结果"，整棵树共用一份
        __pchildMap: layer.__pchildMap || null,
        id: String(layer.id) + '#' + spec.index,
        name: (layer.name || layer.id) + ' → 子系' + (spec.typeRaw === null ? '(缺省=static)' : '') + '[' + spec.type + ']' + baseName,
        visible: layer.visible,
        particleDef: res.def,
        particleTexName: res.texName || null,
        particleBlending: res.blending || layer.particleBlending || 'translucent',
        // ①(P-149 overbright) 子系用**自己的材质因子**（宿主 `demo.html` 的 `resolveChildDefs` 按
        //   同一条取值契约算好放进 map 条目），**不继承父层因子** —— 父层与子系是两个材质，
        //   上游也是一实例一份 `overbright`（`particles.js:592` 在实例构造里取自己的 pass）。
        __particleOverbright: res.overbright,
        origin: anchor,
        scale: [(LS[0] === 0 ? 1 : (LS[0] || 1)) * (spec.scale[0] || 1), (LS[1] === 0 ? 1 : (LS[1] || 1)) * (spec.scale[1] || 1), (LS[2] || 1) * (spec.scale[2] || 1)],
        angles: [(LA[0] || 0) + (spec.angles[0] || 0), (LA[1] || 0) + (spec.angles[1] || 0), (LA[2] || 0) + (spec.angles[2] || 0)],
        // 上游 `scene-mount.ts:1540-1544`：子系没有自己的 instanceoverride 时继承父层的
        //   （否则用户颜色/尺寸滑块只作用在父层上、子系永远不上色）。
        instanceoverride: spec.instanceoverride || layer.instanceoverride || null,
      }
      partStat.children.kinds[spec.type] = (partStat.children.kinds[spec.type] || 0) + 1
      renderParticleLayerBody(childLayer, textures, cam, viewProj, width, height, time)
      drawnChild++
    }
    partStat.children.drawn += drawnChild
    return drawnChild
  }

  /** 子系锚点（世界，设计像素）：父层变换 × 子系 authored origin（照抄来的 `localToWorld`）。 */
  function particleChildAnchorWorld(parentSys, layer, spec) {
    // 父系已建（`buildParticleSystem` 尾部 `syncLayerTransform` 写过 originX/Y/Z、scaleX/Y、angleZ）
    if (parentSys && typeof parentSys.originX === 'number') return localToWorld(parentSys, spec.origin)
    // 父系没建（缺贴图/超预算早退）⇒ 用父层 raw 变换现搭一个只含变换字段的对象（与
    // `buildParticleSystem` 里 `syncLayerTransform` 的口径一致），static 子系因此照画。
    const tmp = {}
    syncLayerTransform(tmp, { origin: (layer && layer.origin) || [0, 0, 0], scale: (layer && layer.scale) || [1, 1, 1], angles: (layer && layer.angles) || [0, 0, 0] })
    return localToWorld(tmp, spec.origin)
  }

  /**
   * 子系的**每帧准备**（在 `simulateParticleSystem` 之前调用一次）：见模块级
   * `prepareParticleChildSys` 的完整口径说明；这里只把渲染层的记账对象传下去。
   */
  function __prepareParticleChild(layer, childSys) {
    const pc = layer.__pchild
    if (!pc || !pc.spec || !childSys) return
    prepareParticleChildSys(childSys, pc.spec, pc.parentSys, pc.events, partStat.children)
  }

  // ①(RE-33) bloom 链执行：默认 framebuffer → copyTex → 4 pass → 加法合成回默认 framebuffer。
  //   enabled 与 strength 都为 0/假时直接跳过（官方虽建链但 pass1 写黑 = 视觉中性，跳过等价且省 3 次全屏 pass）。
  function runBloom(general, width, height) {
    const bloom = general.bloom === true || (general.bloom && general.bloom.value === true)
    const strength = typeof general.bloomstrength === 'number' ? general.bloomstrength : 1
    if (!bloom && !(strength > 0)) return false
    // ①(P-90) `?pp=off` 门控③（对上游 `renderer.js:2512`「内置 Bloom 关闭」）：
    //   后处理档 = off ⇒ 整条 bloom 链不跑（4 个 pass 全省），与上游同语义。
    //   注意：上游把 Bloom 归在后处理档下，**不是**独立开关 —— 所以这里用 `quality.pp` 而不是
    //   另造一个 `?nobloom`。
    if (quality.pp === 'off') return false
    const progs = ensureBloomProgs()
    if (!progs) return false
    const enabled = bloom ? 1 : 0
    const hdr = general.hdr === true || (general.hdr && general.hdr.value === true)
    // ①(P1-7 2026-09-14) HDR 浮点分支门控：EXT_color_buffer_float **或** EXT_color_buffer_half_float
    //   （Adreno 常只暴露 half 变体）任一可用即走 HDR（/2、/4 尺寸链 + Karis soft-knee）。
    // ①(MERGED-1 C 2026-09-12) "绝对 HDR"落地：renderScene 已把整场景渲进 RGBA16F FBO（hdrSceneState），
    //   本链直接采该浮点纹理（免 RGBA8 copyTexSubImage2D 钳制）；isHdr 以渲染帧的实际状态为准
    //   （?hdr=1 强制/general.hdr 均可驱动；?hdr=0 → active=false → LDR 阈值）。独立调用（测试）无
    //   渲染帧状态 → 沿用旧口径 hdr && 扩展可用。
    const extOk = !!(gl.getExtension && (gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float')))
    const isHdr = extOk && (hdrSceneState ? hdrSceneState.active === true : hdr)
    const hdrFbo = (isHdr && hdrSceneState && hdrSceneState.active &&
      hdrSceneState.width === width && hdrSceneState.height === height) ? hdrSceneState.fbo : null
    const threshold = isHdr
      ? (typeof general.bloomhdrthreshold === 'number' ? general.bloomhdrthreshold : 1)
      : (typeof general.bloomthreshold === 'number' ? general.bloomthreshold : 0.8)
    const feather = isHdr && typeof general.bloomhdrfeather === 'number' ? general.bloomhdrfeather : 0
    const sHdr = isHdr && typeof general.bloomhdrstrength === 'number' ? general.bloomhdrstrength : strength
    // ①(MERGED-1 C 2026-09-12) bloomhdrscatter：模糊散布（步长 8×texel×scatter；缺省 1，≤0 取 1）
    const scatter = isHdr
      ? (typeof general.bloomhdrscatter === 'number' && general.bloomhdrscatter > 0 ? general.bloomhdrscatter : 1)
      : 1
    const tintV = parseVec3Local(general.bloomtint || '1 1 1')
    const div = isHdr ? 2 : 4
    const w1 = Math.max(1, Math.round(width / div)), h1 = Math.max(1, Math.round(height / div))
    const w2 = Math.max(1, Math.round(width / (div * 2))), h2 = Math.max(1, Math.round(height / (div * 2)))
    try {
      const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING)
      // 场景颜色 → 纹理：HDR 帧直接用浮点场景 RT（无钳制）；LDR 从默认 framebuffer 拷贝（WebGL2）
      let sceneTex
      if (hdrFbo) {
        sceneTex = hdrFbo.tex
      } else {
        sceneTex = ensureBloomSceneTex(width, height)
        gl.bindTexture(gl.TEXTURE_2D, sceneTex)
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, width, height)
      }
      const mip1 = getFBO(w1, h1, 'bloom-mip1')
      const mip2 = getFBO(w2, h2, 'bloom-mip2')
      const aux = getFBO(w2, h2, 'bloom-aux')
      gl.disable(gl.BLEND)
      gl.disable(gl.DEPTH_TEST)
      // pass1 extract
      gl.bindFramebuffer(gl.FRAMEBUFFER, mip1.fbo)
      gl.viewport(0, 0, mip1.width, mip1.height)
      gl.useProgram(progs.extract)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, sceneTex)
      gl.uniform1i(progs.ue.scene, 0)
      gl.uniform2f(progs.ue.texel, 1 / width, 1 / height)
      gl.uniform1f(progs.ue.threshold, threshold)
      gl.uniform1f(progs.ue.feather, feather)
      gl.uniform1f(progs.ue.strength, sHdr)
      gl.uniform1f(progs.ue.enabled, enabled)
      gl.uniform3f(progs.ue.tint, tintV[0], tintV[1], tintV[2])
      gl.uniform1f(progs.ue.hdr, isHdr ? 1 : 0)
      gl.bindVertexArray(ensureBloomVao())
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      // pass2 blurX：mip1 → mip2（间距 = 8×mip1 texel）
      gl.bindFramebuffer(gl.FRAMEBUFFER, mip2.fbo)
      gl.viewport(0, 0, mip2.width, mip2.height)
      gl.useProgram(progs.blur)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, mip1.tex)
      gl.uniform1i(progs.ub.tex, 0)
      gl.uniform2f(progs.ub.dir, 1, 0)
      gl.uniform2f(progs.ub.step, (8 / mip1.width) * scatter, (8 / mip1.height) * scatter)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      // pass3 blurY：mip2 → aux（间距 = 8×mip2 texel）
      gl.bindFramebuffer(gl.FRAMEBUFFER, aux.fbo)
      gl.viewport(0, 0, aux.width, aux.height)
      gl.bindTexture(gl.TEXTURE_2D, mip2.tex)
      gl.uniform2f(progs.ub.dir, 0, 1)
      gl.uniform2f(progs.ub.step, (8 / mip2.width) * scatter, (8 / mip2.height) * scatter)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      // pass4 compose：scene + aux → 默认 framebuffer（直写，无混合）
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo || null)
      gl.viewport(0, 0, width, height)
      gl.useProgram(progs.compose)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, sceneTex)
      gl.uniform1i(progs.uc.scene, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, aux.tex)
      gl.uniform1i(progs.uc.bloom, 1)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.bindVertexArray(null)
      gl.activeTexture(gl.TEXTURE0)
      if (typeof window !== 'undefined') { window.__mpwBloomRuns = (window.__mpwBloomRuns || 0) + 1; window.__mpwBloomInfo = { enabled, isHdr, threshold, strength: sHdr, mip1: [mip1.width, mip1.height], mip2: [mip2.width, mip2.height] } }
      return true
    } catch (e) {
      try { onLog('[bloom] 链执行失败: ' + (e && e.message)) } catch {}
      return false
    }
  }

  // ①(预留接口) 帧末钩子：外部可在此做额外后处理 / 埋点 / 截图（默认无操作）
  function runPostFrameHooks(stats) {
    try { runMpwHook('postFrame', [stats]) } catch { /* ignore */ }
    try { runMpwHook('stats', [stats]) } catch { /* ignore */ }
  }

  return {
    gl,
    render: renderScene,
    // ①(P-41 A1) HDR 会话熔断状态（上报取证：{at,layer,code,path} 或 null）
    get hdrFallback() { return hdrForceLdrSession },
    runBloom,
    runPostFrameHooks,
    renderMeshLayer,
    // ①(P-100) 当前帧生效的角色层适配档（`?charfit=` / `opts.charfit`）：demo 启动日志与上报取证用
    get charfitMode() { return charfitMode },
    // ①(P-120) 当前帧相机 origin 脚本台账（只读）：{state,value,static,why,cached,evals,fallbacks}
    //   state: 'none'（无脚本）/ 'ok'（用求值结果）/ 'static'（求值失败 → 回退静态快照）/
    //          'off'（开关关）/ 'nohost'（没注册宿主）/ 'nouserprops'（无用户属性表）/ 'error'（接线层异常）
    get cameraOriginScript() { return camScript.ledger },
    ensureMeshProg,
    getFBO,
    getEffectProgram,
    progCache,
    shaderResolver,
    whiteTex,
    // 场景切换时清空 shader 相关缓存（避免复用上一个场景的 shader 源/程序）
    resetShaderCaches: function () {
      progCache.clear()
      includeCache.clear()
      if (shaderSrcCache) shaderSrcCache.clear()
    },
    // 运行时切换效果降采样系数（性能档位：0=全质量，1=效果链 ≤ 屏幕尺寸）
    setFboCapFactor: function (v) {
      fboCapFactor = v
    },
    // ①(P-90) 帧末 FXAA pass。**默认档（aa=off）下这是空操作**（零 GL 调用 ⇒ 逐位=改动前）。
    //   demo.html 在 `runBloom` 之后调用（顺序见文件里 AA 段注释）；一帧内幂等。
    runAA: function (width, height) { return runAAPass(width, height) },
    /**
     * ①(P-90) 质量档位**热更**（对标上游 `SceneInstance.setQuality()`：部分更新、只传要改的键、
     * **就地生效不重挂载**）。@returns 生效后的快照（同 `getQuality()`）
     */
    setQuality: function (patch) {
      const p = patch || {}
      try {
        if (p.pp !== undefined) {
          quality.pp = normalizeQualityTier('pp', p.pp).value
          // 门控②"整屏后期层"在本渲染器**无落点**（我们不解析 isPostProcess，见 PATCHES P-90 未定项）
          fboCapFactor = ppFboCap(quality.pp)
          try { onLog('[P-90] 热更 pp=' + quality.pp + '（fboCapFactor=' + fboCapFactor + '，效果链/Bloom 门控同期生效）') } catch (e) {}
        }
        if (p.q !== undefined) {
          const before = quality.q
          quality.q = normalizeQualityTier('q', p.q).value
          // 内部 FBO 换尺寸 = 下一次 renderScene 里 getFBO(tag|WxH) 取新尺寸；旧的那张留在池里可复用
          if (quality.q !== before) { try { onLog('[P-90] 热更 q=' + quality.q + '（下一帧起内部渲染尺寸生效，无需刷新）') } catch (e) {} }
          // q 从 off 变非 off（或反之）会改变 AA 的可行性：q!=off 时场景在单采样离屏 FBO 里，
          // 原生 MSAA 用不上 ⇒ 重新解析 AA 落点（回落 FXAA）。
          aaLive = resolveAaMode(quality.aa, aaCtxSamples, qRenderScale(quality.q) > 0)
        }
        if (p.aa !== undefined) {
          const before = quality.aa
          quality.aa = normalizeQualityTier('aa', p.aa).value
          const wantNative = AA_MSAA_SAMPLES[quality.aa] > 0
          if (wantNative && !AA_WANT_NATIVE) {
            // 创建 context 时用的是 `antialias:false` ⇒ 运行期给不出多重采样缓冲。
            // **不静默**：显式告知需刷新，并说明本帧落在哪条路径。
            const r = resolveAaMode(quality.aa, aaCtxSamples, qRenderScale(quality.q) > 0)
            try {
              onLog('[P-90] aa=' + quality.aa + ' **需刷新页面**：WebGL2 的 `antialias` 是 context 创建属性，'
                + '运行期无 API 可改采样数。本帧按 ' + r.mode + ' 生效（' + (r.reason || 'native') + '）；'
                + '刷新后 ' + quality.aa + ' 才会真正启用多重采样（实测 SAMPLES=' + aaCtxSamples + '）')
            } catch (e) {}
            if (quality.aa !== before) quality.aa = before      // 未刷新时档位不真的变（如实记账）
          }
          aaLive = resolveAaMode(quality.aa, aaCtxSamples, qRenderScale(quality.q) > 0)
          if (!aaLive.native && aaLive.fallback) {
            try { onLog('[P-90] aa=' + quality.aa + ' → **回落 FXAA**（' + aaLive.reason + '），非静默') } catch (e) {}
          }
          if (quality.aa !== before) { try { onLog('[P-90] 热更 aa=' + quality.aa + '（实际落点 ' + aaLive.mode + '，无需刷新）') } catch (e) {} }
        }
      } catch (e) {
        try { onLog('[P-90] setQuality 失败: ' + (e && e.message)) } catch (e2) {}
      }
      return this.getQuality()
    },
    /** ①(P-90) 当前生效的三档（三项齐全，供上报/测试断言）。 */
    getQuality: function () {
      return {
        q: quality.q, aa: quality.aa, pp: quality.pp,
        aaMode: aaLive.mode, aaNative: !!aaLive.native, aaFallback: !!aaLive.fallback,
        aaReason: aaLive.reason, ctxSamples: aaCtxSamples, fboCapFactor,
      }
    },
    // ①(P-90) 质量档位台账（测试与真机上报共用）：档位 + **实际**内部渲染尺寸/上采样次数/
    //   FXAA 次数 + context 实测采样数。`internalW/H` 是"q=low 内部尺寸确实下降"的判据。
    get qualityStats() {
      return {
        q: quality.q, aa: quality.aa, pp: quality.pp,
        aaMode: aaLive.mode, aaNative: !!aaLive.native, aaFallback: !!aaLive.fallback, aaReason: aaLive.reason,
        ctxSamples: aaCtxSamples, frameTargetActive: !!frameTarget,
        internalW: qInternal[0], internalH: qInternal[1],
        presentRuns: qPresentRuns, aaRuns,
        invalid: Object.assign({}, TIERS.invalid || {}),
        ppLegacyParticleOrtho: !!TIERS.ppLegacyParticleOrtho,
        fboCapFactor,
      }
    },
    // ①(P-59) 粒子预算/统计只读快照（mock-GL 测试与真机上报共用）
    get particleStats() { return Object.assign({}, partStat, { budget: Object.assign({}, PARTICLE_BUDGET) }) },
    // ①(P-74 ④) 效果链输入台账只读快照（回答"链输入为空？"的代码级判据）
    get fxStats() { return { layers: fxStat.layers, last: fxStat.last, perLayer: fxStat.perLayer } },
    // ①(P-68) 视频档位/上传台账只读快照（档位、源 vs 实际上传尺寸、上传 fps、节流命中、
    //   直传/2D 中转、?perf=auto 是否降级过）。字段口径见 README-DIAGNOSTICS.md「videoStats」。
    get videoStats() { return Object.assign({}, videoStat, { tex: videoStat.tex.map((t) => Object.assign({}, t)), play: Object.assign({}, videoStat.play) }) },
    get resTier() { return Object.assign({}, RES_TIER) },
  }
}

function linkProgram(gl, vsSrc, fsSrc) {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc)
  const p = gl.createProgram()
  gl.attachShader(p, vs)
  gl.attachShader(p, fs)
  gl.bindAttribLocation(p, 0, 'a_Position')
  gl.bindAttribLocation(p, 1, 'a_TexCoord')
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('着色器链接失败: ' + gl.getProgramInfoLog(p))
  }
  return p
}

function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    try { window.__lastShader = src; window.__lastShaderType = type === gl.VERTEX_SHADER ? 'vert' : 'frag'; } catch {}
    throw new Error('着色器编译失败: ' + gl.getShaderInfoLog(s))
  }
  return s
}

function parseVec3Local(s) {
  const p = String(s).trim().split(/\s+/).map(Number)
  return [p[0] || 0, p[1] || 0, p[2] || 0]
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════
   ①(P-168 2026-09-20 · 上游 1.3.18 `4b7b07e` 的 REPEAT 契约) 哪些贴图必须**平铺采样**
   ──────────────────────────────────────────────────────────────────────────────────────────────────
   上游原文（`<UP>/renderer/vendor/we-scene/render/gl-util.js:41-45`）：
     `const wrap = opts && opts.wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE`
   为什么需要：云/神光这类效果的 uv 随 `g_Time` **无界增长**（`uv = uv0 + t*speed`），
   CLAMP 下超过 1 的范围会被"拉边" ⇒ 云密度恒等、天空变成一层**静止伪影**（1.3.18 修的就是这个）。
   ⚠ 我们**不是**给所有贴图改 REPEAT：只有**可平铺**的那几张才该 REPEAT（改错会让本不该接缝的
   贴图在边缘出现一圈复制 —— 例如角色/UI 图集）。所以用**名单**而不是全局开关，名单就在下面这一处。
   ⚠ 我们**不内置任何 WE 素材**（本仓库红线）：这些名字只决定"从用户本机 WE 资产 / `/weassist` 取来的
   那张图用什么 wrap 采样"，取不到就还是跳过该效果（既有行为不变）。
   回退开关（A/B 与排障）：`?texwrap=clamp` 全部按旧行为（CLAMP）；`?texwrap=repeat` 全部 REPEAT。 */
export const REPEAT_TEX_NAMES = [
  // 云密度图：clouds 效果链的 uv 随 g_Time 无界增长（上游 1.3.18 的原始场景）
  'util/clouds_256',
];
/** 名字归一化：`materials/` 前缀与扩展名都不参与判定（宿主两处调用口径不同，见 demo.html 的 loadTex）。 */
function texNameKey(name) {
  try {
    return String(name == null ? '' : name)
      .replace(/^materials\//, '').replace(/\.tex$/i, '').replace(/\\/g, '/').trim();
  } catch (e) { return '' }
}
/** 该贴图该用哪种 wrap：`'repeat'` | `'clamp'`。
 *  `search` 可显式传入（测试用；浏览器里缺省取 `location.search`）——避免判据依赖全局 location。 */
export function texWrapMode(name, search) {
  const q = (() => {
    try {
      const s = (search !== undefined && search !== null) ? String(search)
        : (typeof location !== 'undefined' && location && location.search ? String(location.search) : '');
      return new URLSearchParams(s);
    } catch (e) { return null }
  })();
  try {
    const force = q ? q.get('texwrap') : null;
    if (force === 'clamp') return 'clamp';
    if (force === 'repeat') return 'repeat';
  } catch (e) {}
  return REPEAT_TEX_NAMES.indexOf(texNameKey(name)) >= 0 ? 'repeat' : 'clamp';
}
/** 把 wrap 落到**已经创建好**的 GL 纹理上（`makeTexture*` 的缺省是 CLAMP，本函数只在需要时改）。
 *  返回实际用的模式，便于调用方/测试断言。`gl` 缺任一常量时静默跳过（假 GL 夹具不会因此炸）。 */
export function applyTexWrap(gl, tex, name, search) {
  const mode = texWrapMode(name, search);
  try {
    if (!gl || !tex) return mode;
    const want = mode === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    if (want === undefined || want === null) return mode;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, want);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, want);
  } catch (e) { /* 假 GL / 上下文丢失：保持既有 wrap，不抛 */ }
  return mode;
}
export function makeTexture(gl, rgba, width, height, bitmap = null, fmt = null) {
  // ①(P-65) fmt（可选第 6 参 / rgba.__mpwFmt）= 该纹理所出 .tex 的 format id。
  //   只有 makeTextureMip 那条主链路能自动带上它；本函数由宿主（demo.html）直接调用，
  //   拿不到 format → 传 null，粒子 FS 走透传分支 = 旧行为。详见 texFormatOf()。
  if (fmt == null && rgba && typeof rgba.__mpwFmt === 'number') fmt = rgba.__mpwFmt
  // ①(修复) RGBA 长度消毒：RG88(2ch)/RGB(3ch) 解码产物直接上传会 0x502（探针 S8 实锤），
  // 不足 4 通道时补位展开（G 复制到 B，A=255 保 mask 形状）
  if (rgba && width > 0 && height > 0) {
    const need = width * height * 4
    if (rgba.length === need * 0.5) {
      const out = new Uint8Array(need)
      for (let i = 0, n = width * height; i < n; i++) {
        out[i * 4] = rgba[i * 2]
        out[i * 4 + 1] = rgba[i * 2 + 1]
        out[i * 4 + 2] = rgba[i * 2 + 1]
        out[i * 4 + 3] = 255
      }
      rgba = out
  } else if (rgba.length === need * 0.75) {
      const out = new Uint8Array(need)
      for (let i = 0; i < n; i++) {
        out[i * 4] = rgba[i * 3]
        out[i * 4 + 1] = rgba[i * 3 + 1]
        out[i * 4 + 2] = rgba[i * 3 + 2]
        out[i * 4 + 3] = 255
      }
      rgba = out
    }
    // ①(W1② P-36) 长度终检：走到这里 rgba.length 必须恰好 w*h*4。不匹配 = 解码器缺口，
    //   直接上传必 0x501 且错误旗标污染后续逐层归因（hina "79"误报同类）。就地补零成合法
    //   缓冲（上传永不非法），计数挂 globalThis 供上报回答"为什么缺"。
    if (rgba.length !== need) {
      const g = (typeof globalThis !== 'undefined') ? globalThis : window
      g.__mpwTexSanitizeCount = (g.__mpwTexSanitizeCount || 0) + 1
      g.__mpwTexSanitizeLast = { want: need, got: rgba.length }
      const fixed = new Uint8Array(need)
      fixed.set(rgba.subarray(0, Math.min(rgba.length, need)))
      rgba = fixed
    }
  }
  const tex = gl.createTexture()
  tex.__mpwId = 'tex' + width + 'x' + height + '#' + (((typeof window !== 'undefined') ? (window.__mpwTexSeq = (window.__mpwTexSeq || 0) + 1) : (globalThis.__mpwTexSeq = (globalThis.__mpwTexSeq || 0) + 1)))
  if (fmt != null) { try { tex.__mpwTexFmt = fmt } catch {} }
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  if (bitmap) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba)
  }
  return tex
}

// ①(P-65) 取一个纹素对象的 .tex format id（= 官方 TEX0FORMAT 的输入）。优先级：
//   ① `texObj.format`（宿主直给；demo.html 的 loadTex 现在只给 `rg88`，见报告"需要 demo.html 配合"）；
//   ② `texObj.glTex.__mpwTexFmt`（本文件的上传链路自动盖的章，主链路都命中）；
//   ③ `texObj.rg88 === true` → 8（旧宿主的唯一可判据，等价于 format===8）；
//   否则 -1 = 未知 → 粒子 FS 走透传分支（与 P-59 旧行为逐位一致，不引入猜测）。
export function texFormatOf(texObj) {
  if (!texObj) return -1
  try {
    if (typeof texObj.format === 'number') return texObj.format
    const t = texObj.glTex
    if (t && typeof t.__mpwTexFmt === 'number') return t.__mpwTexFmt
    if (texObj.rg88 === true) return 8
  } catch {}
  return -1
}

// ①(P-65) 单/双通道格式（官方 common_fragment.h:92-113 ConvertTexture0Format 要转换的那些）。
export function isNarrowTexFormat(fmt) {
  return fmt === 8 || fmt === 9 || fmt === 10 || fmt === 11
}

// ①(W1① P-36) 降采样策略（demo 加载端共用，纯函数可单测）：//   触发条件 = 长边超 min(4096, 设备 MAX_TEXTURE_SIZE)——以前写死 >4096，设备上限更小的机型
//   （2048/1024）超限纹理直接上传即非法。返回 cap 像素值（目标长边上限）或 null（无需降采样）。
//   源任一边 >2048 时目标 2048（背景类本就模糊/闪烁，肉眼无损），否则 min(4096, 长边)。
export function texDownsampleCap(w, h, devMax) {
  const mw = Math.max(1, w | 0), mh = Math.max(1, h | 0)
  const dm = Math.max(64, Math.min(4096, (devMax | 0) || 4096))
  const maxSide = Math.max(mw, mh)
  if (maxSide <= dm && maxSide <= 4096) return null
  const cap = (mw > 2048 || mh > 2048) ? Math.min(2048, dm) : Math.min(4096, dm, maxSide)
  return Math.max(2, cap)
}

export function makeTextureMip(gl, levels, rg88 = false) {
  const tex = gl.createTexture()
  // ①(P-65) 把 .tex format 盖在 GL 纹理对象上（decodeMip0/decodeMips 已带 levels[0].fmt）。
  //   demo.html:840 / :3128 的既有调用签名不变；rg88 是旧宿主唯一的格式信息 → 回退成 8。
  try {
    const f = (levels && levels[0] && typeof levels[0].fmt === 'number') ? levels[0].fmt : (rg88 ? 8 : null)
    if (f != null) tex.__mpwTexFmt = f
  } catch {}
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)  // ①(终局修复) 无 mip 链则 LEVEL 过滤：Adreno 大 NPOT generateMipmap 静默失败→不完整纹理采样=透明（灰层尺寸相关）
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  // 只上传基础级；generateMipmap 尽力而为（失败也不影响采样——MIN_FILTER=LINEAR 走 level0）
  // WE 的 TEXI 容器可能只存部分 mip 级（如 5000×3000 仅 5 级），
  // 不完整的 mip 链在 WebGL 下纹理不完整 → 采样恒黑。
  const lv = levels[0]
  if (lv.bitmap) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lv.bitmap)
  } else if (rg88 && lv.rgba) {
    // RGBA 解码（rgb=G, a=R）→ GL_RG 上传（原始 R,G；shader .r=原始R .g=原始G，与参考实现一致）
    const n = lv.width * lv.height
    const rg = new Uint8Array(n * 2)
    for (let p = 0; p < n; p++) {
      rg[p * 2] = lv.rgba[p * 4 + 3]
      rg[p * 2 + 1] = lv.rgba[p * 4]
    }
    // ①(W1② P-36) WebGL1 无 RG8/RG 常量 → 展开回 RGBA（r=g=R, a=G 保 shader 语义）
    if (gl.RG8 !== undefined && gl.RG !== undefined) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, lv.width, lv.height, 0, gl.RG, gl.UNSIGNED_BYTE, rg)
    } else {
      const rgba = new Uint8Array(n * 4)
      for (let p = 0; p < n; p++) { rgba[p * 4] = rg[p * 2]; rgba[p * 4 + 1] = rg[p * 2 + 1]; rgba[p * 4 + 2] = rg[p * 2]; rgba[p * 4 + 3] = 255 }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lv.width, lv.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba)
    }
  } else {
    // ①(W1② P-36) 长度终检（同 makeTexture）：解码产物不足 w*h*4 时补零成合法缓冲，
    //   错误旗标一旦置位会被逐层探针误归因到下一层（hina "79"/"背景" 0x502 双误报同类）。
    const need = lv.width * lv.height * 4
    let data = lv.rgba
    if (data && data.length !== need) {
      const g = (typeof globalThis !== 'undefined') ? globalThis : window
      g.__mpwTexSanitizeCount = (g.__mpwTexSanitizeCount || 0) + 1
      g.__mpwTexSanitizeLast = { want: need, got: data.length }
      const fixed = new Uint8Array(need)
      fixed.set(data.subarray(0, Math.min(data.length, need)))
      data = fixed
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lv.width, lv.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  }
  // ①(W1 P-36) generateMipmap 只对 POT 调用。MIN_FILTER=LINEAR 从不读 mip（上方注释、
  //   2796 的 mip 平滑是 shader 侧模拟），而大 NPOT（hina 背景 3840×2260）的 generateMipmap
  //   在部分驱动抛 INVALID_OPERATION：错误旗标被逐层探针误归因（上报"79" 0x502）、纹理被
  //   驱动标记不完整后 draw 0x502 + 采黑（上报"背景" 0x502 + DIAG 黑像素，三症状一根因）。
  const __pot = (v) => (v | 0) > 0 && ((v | 0) & ((v | 0) - 1)) === 0
  if (__pot(lv.width) && __pot(lv.height)) gl.generateMipmap(gl.TEXTURE_2D)
  return tex
}


/* ===== 脚本 origin 同步（RE-28 回归修复 2026-09-12）=====
 * 背景：demo.html 的 RE-28 脚本运行时让场景脚本能驱动层属性；同步回 scene.layers 时，
 *   `origin` 这一项曾按"把 raw 的 authored origin 直接写进 l.origin"实现——但默认路径下
 *   parseScene 算出的 l.origin 已经是**父链合并 + 附件锚点偏移**后的世界坐标（core/attach-transform.mjs），
 *   而 raw.origin 是**未加锚点**的局部 authored 值。于是每个带 attachment 的层都被"打回原形"：
 *   设备实测（3719111841，DIAG 行）右侧发/底发/衣袖 的 origin = (67,2675)/(-277,1719)/(-517,2661)，
 *   与 raw authored 逐位相同、与锚点后的 (2575,743)/(2284,342)/(1948,1965) 相差数百 px → 头发/衣袖/发片
 *   全部飞出画面（用户："渲染还是有问题"、画面只剩主体/耳朵/眼睛几个 mesh 层）。
 *
 * 修法：以"脚本是否**真的改过** authored origin"为判据，只施加**增量**：
 *   base = 脚本运行前抓的 authored origin 快照（y-up 局部）
 *   脚本写了新值 → dx = x - base.x, dy = y - base.y；l.origin += (dx, -dy)（y-up → y-down 取反），
 *   然后把 base 更新为新值（逐帧增量累加）。
 * 与旧行为的关系：无锚点层 parseScene 的 origin == authored，增量累加后逐位等于旧实现（零行为差异）；
 *   有锚点层则**保住锚点偏移**（这正是修复目标）。
 */
export function syncScriptOrigins(scene, rawObjects, base, skip = null) {
  if (!scene || !Array.isArray(scene.layers) || !base) return 0
  const rawById = new Map()
  for (const o of rawObjects || []) if (o && o.id !== undefined) rawById.set(o.id, o)
  let synced = 0
  for (const l of scene.layers) {
    if (l.__skin) continue
    if (skip && skip.has(l.id)) continue
    const raw = rawById.get(l.id)
    if (!raw) continue
    const ro = raw.origin && typeof raw.origin === 'object' ? raw.origin.value : raw.origin
    if (typeof ro !== 'string') continue
    const v = ro.trim().split(/\s+/).map(Number)
    if (v.length < 2 || !isFinite(v[0]) || !isFinite(v[1])) continue
    const b = base.get(l.id)
    if (!b) continue
    const dx = v[0] - b[0], dy = v[1] - b[1]
    if (Math.abs(dx) <= 1e-3 && Math.abs(dy) <= 1e-3) continue   // 脚本没碰 origin → 保留锚点后的世界坐标
    if (l.origin) { l.origin[0] += dx; l.origin[1] -= dy }
    b[0] = v[0]; b[1] = v[1]
    synced++
  }
  return synced
}

// ①(P-41 A1-b 2026-09-13) 网格动画坏帧检测 v3（demo.html 蒙皮层用；抽成纯函数可测）。
//   真机+语料实锤（hina 3554161528 人物 75 帧、凯尔希 主体/眼睛组合/左耳朵1、girl——
//   设备日志 r1789233100291 + 2026-09-12 demo 注释"每条轨道存 length+1 帧，结尾 1~17 帧是导出垃圾"）：
//   旧"迭代二阶差分（骨骼和 sig）"过滤器三个结构性缺陷——
//   ①垃圾平台内部帧漏杀：和信号在垃圾区间内部相邻差小（f67-69,71,72 存活）→ 每周期姿态瞬间
//     跳进垃圾再跳回 = 用户看到的"挂饰随机抽动"；
//   ②回绕污染：f0 的环形邻居是尾部垃圾 → dev(f0) 巨大 → f0-3 级联误杀（hina 实测）→ 开头姿态错；
//   ③骨骼和会抵消：单骨乱跳可在求和里抵消，和信号对"哪些帧是垃圾"失真（把 58-61 好帧也拖下水）。
//   v3 = **双通道**：
//   A) 尾部切除：per-bone 绝对步长剖面（demo 逐帧算 maxStep[f]=max_b |Δbone(f→f+1)|）中，
//      从末帧向前把 >T 的**连续后缀**判垃圾（文档结构=垃圾只在结尾 1~17 帧；中段的合法快速段
//      如左耳朵 f35-40/f55-57 不受影响）。骨和剖面会抵消，必须用逐骨最大值。
//   B) 邻域精修（原实现保留）：sig 二阶差分抓中段孤立尖峰；此时尾部已切除，f0 的环形邻居必是好帧，
//      回绕污染消失。阈值 = max(10×dev中位, 5)，须显著大于局部最大步进（防误杀合法快速段）。
//   profile: { maxStep: ArrayLike（每帧逐骨最大绝对步长，循环序）, sig: ArrayLike（骨骼和签名） }
//   返回 {bad:Set<number>, thr:number}（thr 供日志）。
export function detectBadAnimFrames(profile, opts = {}) {
  const maxStep = profile && profile.maxStep
  const sig = (profile && profile.sig) || (maxStep || [])
  const rawLen = sig.length
  const bad = new Set()
  if (rawLen < 8) return { bad, thr: 5 }
  const T_ABS = Number(opts.absStepThr) > 0 ? Number(opts.absStepThr) : 30
  // A) 尾部切除（≤17 帧，与文档"结尾 1~17 帧导出垃圾"一致；全动画都快时该阈值无意义 → 跳过）
  if (maxStep && maxStep.length === rawLen) {
    const ms = Array.from(maxStep).sort((a, b) => a - b)
    if (ms[rawLen >> 1] <= T_ABS / 3) {
      let cut = 0
      for (let f = rawLen - 1; f >= 0 && cut < 17; f--) {
        if (Number(maxStep[f]) > T_ABS) { bad.add(f); cut++ } else break
      }
    }
  }
  // B) 邻域精修（原实现；环形邻居在坏帧集合中查找 → 尾部已切除后不污染开头）
  const step = new Float64Array(rawLen)
  for (let f = 0; f < rawLen; f++) step[f] = Math.abs(sig[(f + 1) % rawLen] - sig[f])
  let thr = 5
  for (let pass = 0; pass < 4; pass++) {
    const goodIdx = []
    for (let f = 0; f < rawLen; f++) if (!bad.has(f)) goodIdx.push(f)
    if (goodIdx.length < 4) break
    const dev = new Float64Array(rawLen)
    for (const f of goodIdx) {
      let pg = f, ng = f
      for (let k = 1; k <= rawLen; k++) { const i = (f - k + rawLen * 4) % rawLen; if (!bad.has(i)) { pg = i; break } }
      for (let k = 1; k <= rawLen; k++) { const i = (f + k) % rawLen; if (!bad.has(i)) { ng = i; break } }
      dev[f] = Math.abs(sig[f] - (sig[pg] + sig[ng]) / 2)
    }
    const ds = goodIdx.map((f) => dev[f]).sort((x, y) => x - y)
    const medDev = ds.length ? ds[ds.length >> 1] : 0
    thr = Math.max(medDev * 10, 5)
    let added = 0
    for (const f of goodIdx) {
      let ls = 0
      for (let k = -2; k <= 2; k++) { const i = (f + k + rawLen * 4) % rawLen; if (step[i] > ls) ls = step[i] }
      if (dev[f] > thr && dev[f] > 0.45 * ls) { bad.add(f); added++ }
    }
    if (!added) break
  }
  // 兜底：精修把 >40% 帧标坏 = 阈值误配（动画真的这么动）→ 只保留尾部切除结果
  if (bad.size > rawLen * 0.4) {
    bad.clear()
    if (maxStep && maxStep.length === rawLen) {
      for (let f = rawLen - 1; f >= 0 && bad.size < 17; f--) { if (Number(maxStep[f]) > T_ABS) bad.add(f); else break }
    }
  }
  return { bad, thr }
}

// ①(N3 2026-09-14 第2项 Girl and cat) **按动画**建"好帧表"（不再只做 animations[0]）。
//   为什么必须按动画：夜莺Night 系导出的 MDLA 每条动画末尾都有 1~17 帧垃圾，而长度各不相同
//   （girl 实测 anim65 的 174-179、anim71 的 84-89、anim73 的 174-179、anim94 的 174-179）；
//   旧实现只对 `mesh.animations[0]` 跑 detectBadAnimFrames（demo.html 里那段只在 base 动画上），
//   其它动画层的相位照样采到垃圾帧 → 每 6.0s / 7.89s 抽一次（合成位移 1354/1462/1877 单位 vs 中位 2.26）。
//   mesh: _parseMdl 结果；sampleRT: (mesh, anim, frame, nb, bones) → [{angle,tx,ty}]（puppet mixin 注入）。
//   返回 [{len, good:number[], bad:Set, thr, sig:Float64Array, maxStep:Float64Array}]（按 animations 顺序）。
export function analyzeAnimGoodFrames(mesh, sampleRT, opts = {}) {
  const out = []
  const anims = (mesh && mesh.animations) || []
  const bones = (mesh && mesh.bones) || null
  const nb = bones ? bones.length : 0
  if (!nb || typeof sampleRT !== 'function') return out
  for (const an of anims) {
    const len = Math.max(3, (an && an.frameCount) || 3)
    const good = []
    const bad = new Set()
    let thr = 5
    let sig = null, maxStep = null
    try {
      sig = new Float64Array(len)
      maxStep = new Float64Array(len)
      for (let f = 0; f < len; f++) {
        const rt = sampleRT(mesh, an, f, nb, bones)
        let sum = 0
        for (let b = 0; b < nb; b++) sum += rt[b].tx + rt[b].ty + rt[b].angle * 100
        sig[f] = sum
        // ①(P-41 A1-b) 逐骨最大绝对步长（循环序）：骨骼和会抵消单骨乱跳，垃圾判定必须用逐骨最大值
        const rn = sampleRT(mesh, an, (f + 1) % len, nb, bones)
        let mx = 0
        for (let b = 0; b < nb; b++) {
          const d = Math.abs(rn[b].tx - rt[b].tx) + Math.abs(rn[b].ty - rt[b].ty) + Math.abs(rn[b].angle - rt[b].angle) * 100
          if (d > mx) mx = d
        }
        maxStep[f] = mx
      }
      // ①(P-41 A1-b 2026-09-13) 坏帧检测 v3（detectBadAnimFrames，单测 mesh-badframe-test）：
      //   尾部逐骨绝对步长切除 + 原邻域精修（f0 环形邻居不再被尾部垃圾污染）
      const __bf = detectBadAnimFrames({ sig, maxStep })
      thr = __bf.thr
      for (const f of __bf.bad) bad.add(f)
      for (let f = 0; f < len; f++) if (!bad.has(f)) good.push(f)
      if (good.length < 4) { bad.clear(); good.length = 0; for (let f = 0; f < len; f++) good.push(f) }
    } catch (e) {
      bad.clear(); good.length = 0
      for (let f = 0; f < len; f++) good.push(f)
    }
    out.push({ len, good, bad, thr, sig, maxStep })
  }
  return out
}

// ①(N3 2026-09-14 第2项 Girl and cat) 采样"多 additive 动画层"合成姿势：
//   官方语义（elysia _skinPuppet / P-42）= `final = bindRT 基准 + Σ_additive(层相位姿势 − 该动画帧0)×blend`
//   （普通层 `final = mix(final, 层姿势, blend)`，角度最短弧）。**N3 的改动**：每层相位不再直接取
//   原始帧号，而是映射到**该动画自己的好帧集合**上（gPrev/gNext 之间线性插值）→ 相位进垃圾尾巴时
//   位移被分摊到相邻好帧之间，结构上不可能跳变（与单动画分支 P-41 的写法完全同构）。
//   opts: { mesh, bindRT, animSpec:[{animIdx,blend,rate,additive}], animGood（analyzeAnimGoodFrames 结果，
//           可空 → 退回原始帧号旧行为）, tAnim, fps, nb, sampleRT }
//   返回 final: [{angle,tx,ty}]（每骨骼世界姿势）。
export function sampleCompositeAdditivePose(opts = {}) {
  const mesh = opts.mesh
  const bindRT = opts.bindRT || []
  const animSpec = opts.animSpec || []
  const animGood = opts.animGood || null
  const sampleRT = opts.sampleRT
  const bones = (mesh && mesh.bones) || null
  const nb = (typeof opts.nb === 'number' && opts.nb > 0) ? opts.nb : (bones ? bones.length : 0)
  const tAnim = Number(opts.tAnim) || 0
  const fps = (typeof opts.fps === 'number' && opts.fps > 0) ? opts.fps : 30
  const final = bindRT.map((r) => ({ angle: r.angle, tx: r.tx, ty: r.ty }))
  if (!mesh || !nb || typeof sampleRT !== 'function' || !animSpec.length) return final
  const refCache = new Map()
  const refOf = (an) => {
    let r = refCache.get(an)
    if (!r) { r = sampleRT(mesh, an, 0, nb, bones); refCache.set(an, r) }
    return r
  }
  for (const spec of animSpec) {
    const ai = mesh.animations[spec.animIdx] ? spec.animIdx : 0
    const an = mesh.animations[ai]
    if (!an) continue
    const len = Math.max(3, an.frameCount || 3)
    const rate = tAnim * fps * (spec.rate || 1)
    const ph = rate - Math.floor(rate / len) * len          // 相位 ∈ [0, len)
    // ①(N3) 相位 → 好帧集合（跨坏帧插值）；无好帧表/全帧皆好 → 原始帧号 + 帧间插值（旧行为）
    let fa, fb, w
    const tbl = animGood && animGood[ai]
    const good = tbl && tbl.good
    if (good && good.length && good.length < len) {
      let i = 0
      while (i < good.length && good[i] <= ph) i++
      const gPrev = (i === 0) ? good[good.length - 1] - len : good[i - 1]
      const gNext = (i === good.length) ? good[0] + len : good[i]
      const span = gNext - gPrev
      w = span > 1e-6 ? (ph - gPrev) / span : 0
      fa = ((gPrev % len) + len) % len
      fb = ((gNext % len) + len) % len
    } else {
      fa = Math.floor(ph) % len
      fb = (fa + 1) % len
      w = ph - fa
    }
    const ref = refOf(an)
    const pA = sampleRT(mesh, an, fa, nb, bones)
    const pB = (w > 0.001) ? sampleRT(mesh, an, fb, nb, bones) : pA
    const blend = (typeof spec.blend === 'number' && spec.blend >= 0 && spec.blend <= 1) ? spec.blend : 1
    for (let b = 0; b < nb; b++) {
      // 层相位姿势 = pA→pB 线性插值（角度走最短弧）
      let da = pB[b].angle - pA[b].angle
      while (da > Math.PI) da -= 2 * Math.PI
      while (da < -Math.PI) da += 2 * Math.PI
      const la = pA[b].angle + da * w
      const lx = pA[b].tx + (pB[b].tx - pA[b].tx) * w
      const ly = pA[b].ty + (pB[b].ty - pA[b].ty) * w
      if (spec.additive) {
        let dr = la - ref[b].angle
        while (dr > Math.PI) dr -= 2 * Math.PI
        while (dr < -Math.PI) dr += 2 * Math.PI
        final[b].angle += dr * blend
        final[b].tx += (lx - ref[b].tx) * blend
        final[b].ty += (ly - ref[b].ty) * blend
      } else {
        let dr = la - final[b].angle
        while (dr > Math.PI) dr -= 2 * Math.PI
        while (dr < -Math.PI) dr += 2 * Math.PI
        final[b].angle += dr * blend
        final[b].tx += (lx - final[b].tx) * blend
        final[b].ty += (ly - final[b].ty) * blend
      }
    }
  }
  return final
}

/** 抓 authored origin 快照（脚本首帧运行**之前**调用；y-up 局部坐标，与 raw.origin 同空间） */
export function snapshotAuthoredOrigins(rawObjects) {
  const base = new Map()
  for (const o of rawObjects || []) {
    if (!o || o.id === undefined || o.origin === undefined || o.origin === null) continue
    const ro = o.origin && typeof o.origin === 'object' ? o.origin.value : o.origin
    if (typeof ro !== 'string') continue
    const v = ro.trim().split(/\s+/).map(Number)
    if (v.length >= 2 && isFinite(v[0]) && isFinite(v[1])) base.set(o.id, [v[0], v[1]])
  }
  return base
}

/**
 * ①(2026-09-23 第 24 条取证) **画布上下文属性的唯一来源**。
 *
 * 为什么需要它（真机读数，不是推测）：同一个 canvas 只有一个 WebGL 上下文，**先 `getContext` 的那次
 * 决定全部属性**，后面再请求别的属性会被**静默忽略**。本仓 `demo.html` 为了早期探测/多实例，在渲染器
 * 之前就用 `{ antialias:true, alpha:true, preserveDrawingBuffer:true }` 建好了上下文 ⇒ 渲染器那句
 * `{ premultipliedAlpha:false, antialias:AA_WANT_NATIVE, alpha:false, preserveDrawingBuffer:true }`
 * 一个字都没生效。两档实测属性对照（同一张壁纸、同一个测试台）：
 *   · 本仓：`alpha:true, premultipliedAlpha:true, antialias:true`
 *   · 上游：`alpha:false, premultipliedAlpha:false, antialias:false`
 * 透明语义不同 ⇒「该透的地方发黑」这类观感差异；MSAA 也被意外打开（与 `?aa=` 档位无关）。
 * 现在页面与渲染器都从这一个函数取实参（渲染器内部仍用同一份 `AA_WANT_NATIVE` 语义）。
 *
 * @param {string|URLSearchParams|null} search 页面 URL 的查询串（算 `?aa=` 档位用）
 * @returns {{alpha:false, premultipliedAlpha:false, preserveDrawingBuffer:true, antialias:boolean, depth:boolean, stencil:boolean}}
 */
export function glCanvasAttrs(search) {
  const tier = parseQualityTiers((k) => {
    if (k !== 'aa') return null
    try {
      if (search instanceof URLSearchParams) return search.get('aa')
      return (typeof search === 'string' && search) ? new URLSearchParams(search).get('aa') : null
    } catch (e) { return null }
  })
  return {
    premultipliedAlpha: false,          // 与上游同值：输出 alpha 恒 1.0，不做预乘
    antialias: AA_MSAA_SAMPLES[tier.aa] > 0,   // 只有 msaa 档请求硬件 AA（off/fxaa 档为 false）
    alpha: false,                       // 画布不透明（上游同值；"透明壁纸"靠场景自身颜色，不靠画布 alpha）
    preserveDrawingBuffer: true,
    depth: true,
    stencil: false,
  }
}
