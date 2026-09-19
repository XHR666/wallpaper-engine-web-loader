// mpw-select.js —— 自绘下拉（①2026-09-19 用户第 6 项）
//
// 用户原话：「壁纸属性里面的一些下拉的菜单框，他的这个下拉栏**设计成你自己的那种形式**（然后也要符合
// **下面如果没有空间就自动显示到上面，上面没有空间就自动显示到下面**）然后**不要出什么 bug 了**，
// 就像**点几次能重复打开**的那种 bug，这种 bug 就不要出现了；还有点两下，它是**关闭**的状态，而不是继续存在之类的」
//
// 设计取舍（为什么这么做）：
//   1. **增强原生 `<select>`，而不是替换它**：本仓两个面（`demo.html` 的属性面板、`demo/index.html` 的测试台）
//      都已有代码在读 `select.value` / 监听 `change` 事件。把原生 select **留在 DOM 里当值容器**（`hidden`），
//      只在它旁边插一个自绘控件 ⇒ 既有逻辑一行不用改，回退也很干净（`destroy()` 把原生 select 放回来）。
//   2. **纯决策逻辑在 `demo/mpw-select-math.mjs`**：往上开还是往下开、列表多高、键盘下一个索引，
//      全部是纯函数（可测），本文件只负责"量尺寸 → 问 math → 应用"。
//   3. **单开注册表**：模块级只允许一个展开项（`openRoot`），点开的瞬间先关掉上一个 ⇒ 从结构上不可能
//      "点几次重复打开"。**再点触发按钮 = 关**（不是"又开一个"）。
//   4. **监听器只在展开期间存在**：`document` 的 pointerdown / 窗口的 resize、scroll 都是 open 时装、close 时卸
//      （不掉常驻监听、不涨内存 —— 本机是 15 GB 的 Android 环境，这条是硬要求）。
//   5. 自绘的事件全部只在 `.mpw_select` 子树里（CSS 也一样）⇒ 不会碰到宿主 UI 的任何样式（本仓有
//      `style-scope-guard` 那套纪律，这里按同一精神做）。
import {
  ITEM_H, LIST_PAD, MIN_H, planList, nextIndex, isCommitKey, isCancelKey, isOutside,
  optionsOf, selectedIndex,
} from './mpw-select-math.mjs'

/** `position:fixed` 后代的**包含块原点**（视口坐标里要减掉的那一份）。
 *
 *  为什么放在这里：本仓**两套**自绘下拉（`mpw_select` 与 `bench-patch.js` 的 `.bench-rd`）都要减它。
 *  真因：`#pages-track{contain:paint}`（测试台静态表里的那条）会让它成为**固定定位后代的包含块** ⇒
 *  内联 `left/top` 是相对它的 padding box，而不是视口。实测（1360×900 / :8902）：
 *  `planList` 算出 `top = br.bottom + 2`（视口坐标），渲染出来却整体下移了 `#pages-track.top`
 *  （= header 44px）⇒ 列表与触发框之间露出 44~48px 的缝。
 *  `anchoredInside=false`（锚不在 `#pages-track` 子树里，例如宿主自己挂的控件）⇒ 包含块就是视口，偏移 0。
 *  @param {{left:number,top:number}|null} trackRect `#pages-track` 的 rect（拿不到就传 null）
 *  @param {boolean} anchoredInside 触发按钮是否在 `#pages-track` 子树里
 *  @returns {{dx:number, dy:number}} 要从视口坐标里减掉的原点
 */
export function layerFixedOffset(trackRect, anchoredInside) {
  if (!anchoredInside) return { dx: 0, dy: 0 }
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  return { dx: n(trackRect && trackRect.left), dy: n(trackRect && trackRect.top) }
}

/** 目标元素的**包含块原点**：在 `#pages-track` 里就返回它的 left/top，否则 0（视口坐标系）。 */
function containingOffset(doc, el, win) {
  let track = null
  let inside = false
  try {
    track = doc.querySelector ? doc.querySelector('#pages-track') : null
    if (track && typeof track.contains === 'function') inside = !!track.contains(el)
    else if (track && typeof track.getBoundingClientRect === 'function' && el && typeof el.getBoundingClientRect === 'function') {
      // 桩 DOM 没有 contains 时的退化判据：锚落在 track 的 rect 里且 track 是它的祖先（用 parentNode 链）
      let n = el
      while (n && n !== track) n = n.parentNode
      inside = n === track
    }
  } catch { inside = false }
  const rect = (track && typeof track.getBoundingClientRect === 'function') ? track.getBoundingClientRect() : null
  const off = layerFixedOffset(rect, inside)
  return { off, trackRect: rect, inside, win }
}

const STYLE_ID = 'mpw-select-style'
const CSS = `
.mpw_select{position:relative;display:inline-flex;align-items:center;max-width:100%;font:12px monospace;vertical-align:middle}
.mpw_select_btn{display:inline-flex;align-items:center;gap:6px;max-width:100%;min-height:20px;padding:1px 6px;border:1px solid #666;border-radius:6px;background:#141414;color:#eee;font:inherit;cursor:pointer;box-sizing:border-box}
.mpw_select_btn:hover{border-color:#8a8a8a}
.mpw_select_btn:focus-visible{outline:none;border-color:#eee;box-shadow:0 0 0 1px #eee}
.mpw_select[data-open="1"] .mpw_select_btn{border-color:#eee}
.mpw_select_label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mpw_select_caret{flex:none;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid #bbb}
.mpw_select[data-open="1"] .mpw_select_caret{border-top:0;border-bottom:5px solid #bbb}
.mpw_select_list{position:fixed;z-index:2147483000;min-width:60px;max-width:min(360px,92vw);margin:0;padding:4px 0;list-style:none;overflow-y:auto;overscroll-behavior:contain;border:1px solid #666;border-radius:6px;background:#1b1b1b;color:#eee;box-shadow:0 6px 18px rgba(0,0,0,.45);box-sizing:border-box}
.mpw_select_item{height:${ITEM_H}px;line-height:${ITEM_H}px;padding:0 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.mpw_select_item[data-active="1"]{background:#2f2f2f}
.mpw_select_item[aria-selected="true"]{color:#8f8}
.mpw_select_item[aria-disabled="true"]{opacity:.45;cursor:default}
@media (prefers-reduced-motion: reduce){.mpw_select_btn,.mpw_select_caret{transition:none}}
`

function ensureStyle(doc) {
  if (doc.getElementById && doc.getElementById(STYLE_ID)) return
  const st = doc.createElement('style')
  st.id = STYLE_ID
  st.textContent = CSS
  ;(doc.head || doc.documentElement).appendChild(st)
}

/** 目标元素可滚动祖先链上的"可视窗口"（与视口取交集）。 */
function visibleWindow(el, win) {
  let top = 0
  let bottom = win.innerHeight || 0
  const scan = (node) => {
    if (!node || node.nodeType !== 1) return
    const cs = win.getComputedStyle ? win.getComputedStyle(node) : null
    const oy = cs ? cs.overflowY : ''
    if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
      const r = node.getBoundingClientRect()
      top = Math.max(top, r.top)
      bottom = Math.min(bottom, r.bottom)
    }
    scan(node.parentElement)
  }
  scan(el.parentElement)
  return { top, bottom }
}

/** 当前展开的控件根（模块级唯一）。 */
let openRoot = null

/**
 * 把一个原生 `<select>` 增强成自绘下拉。
 * @param {HTMLSelectElement} selectEl 原生 select（留在 DOM 里当值容器，会被 `hidden`）
 * @param {{doc?:Document, win?:Window, onChange?:(value:string, opt:{value:string,label:string})=>void, title?:string}} [opt]
 * @returns {{destroy:()=>void, refresh:()=>void, open:()=>void, close:()=>void, root:Element, isOpen:()=>boolean}}
 */
export function enhanceSelect(selectEl, opt = {}) {
  //  ①**幂等**：同一个 `<select>` 已经有一个"活着的"自绘控件 ⇒ 直接返回它。
  //    调用方（宿主页面可能多处调用/多次重渲染）不需要自己记账；重复调用不会造出第二个控件
  //    —— 这正是"点几次重复打开/叠几个节点"那类 bug 的结构性防线。
  const prev = selectEl && selectEl.__mpwSelectHandle
  if (prev && prev.root && prev.root.isConnected) return prev
  const doc = opt.doc || selectEl.ownerDocument
  const win = opt.win || doc.defaultView || globalThis
  ensureStyle(doc)
  if (!selectEl.hasAttribute('data-mpw-select-native')) selectEl.setAttribute('data-mpw-select-native', '')
  selectEl.hidden = true
  selectEl.setAttribute('tabindex', '-1')
  selectEl.setAttribute('aria-hidden', 'true')

  const root = doc.createElement('span')
  root.className = 'mpw_select'
  const btn = doc.createElement('button')
  btn.type = 'button'
  btn.className = 'mpw_select_btn'
  btn.setAttribute('aria-haspopup', 'listbox')
  btn.setAttribute('aria-expanded', 'false')
  if (opt.title) btn.title = opt.title
  const label = doc.createElement('span')
  label.className = 'mpw_select_label'
  const caret = doc.createElement('span')
  caret.className = 'mpw_select_caret'
  btn.appendChild(label)
  btn.appendChild(caret)
  root.appendChild(btn)
  selectEl.parentNode.insertBefore(root, selectEl.nextSibling)

  let list = null
  let active = -1
  let model = []

  const isOpen = () => !!list
  /** 当前选中项：**每次现读** `selectEl`（不是闭包里的 `model`）。
   *  ①(P-159) 旧实现读的是 `model`，而 `model` 只在 `open()` 里赋值 ⇒ **首次展开之前** `currentOption()`
   *  恒为 null ⇒ 按钮一直写「（空）」（选项明明在 select 里）；展开一次之后才对上。
   *  修法：直接从 `selectEl.options[selectedIndex]` 现取（`optionsOf` 是纯函数，读的也是 DOM，代价可忽略）。
   *  这样：选项在运行期被填进来（产物属性面板就是）或在语言切换时被改文案，按钮都会立刻跟上。 */
  const currentOption = () => {
    const opts = optionsOf(selectEl)
    const i = selectedIndex(opts, selectEl.value)
    return i < 0 ? null : opts[i]
  }
  const paintButton = () => {
    const cur = currentOption()
    const next = cur ? cur.label : '（空）'
    if (label.textContent !== next) label.textContent = next
    btn.disabled = !!selectEl.disabled
    btn.setAttribute('aria-disabled', selectEl.disabled ? 'true' : 'false')
    try { root.setAttribute('data-mpw-label', next) } catch { /* 桩 DOM */ }
  }
  const close = (focusBack = false) => {
    if (!list) return
    list.remove()
    list = null
    active = -1
    root.removeAttribute('data-open')
    btn.setAttribute('aria-expanded', 'false')
    doc.removeEventListener('pointerdown', onDocDown, true)
    win.removeEventListener('resize', close)
    win.removeEventListener('scroll', close, true)
    if (openRoot === root) openRoot = null
    if (focusBack) { try { btn.focus() } catch { /* ignore */ } }
  }
  const onDocDown = (ev) => {
    // ①点"外面"才关；点自己（按钮或列表）交给各自的处理器（按钮 = toggle，项 = 选中后关）
    if (isOutside(ev.target, root) && !(list && list.contains(ev.target))) close(false)
  }
  const applyActive = () => {
    if (!list) return
    const items = list.children
    for (let i = 0; i < items.length; i++) {
      items[i].setAttribute('data-active', i === active ? '1' : '0')
    }
    if (active >= 0 && items[active] && items[active].scrollIntoView) {
      try { items[active].scrollIntoView({ block: 'nearest' }) } catch { /* ignore */ }
    }
  }
  const commit = (i) => {
    const o = model[i]
    if (!o || o.disabled) return
    if (selectEl.value !== o.value) {
      selectEl.value = o.value
      try { selectEl.dispatchEvent(new win.Event('change', { bubbles: true })) } catch { /* ignore */ }
    }
    paintButton()
    if (opt.onChange) { try { opt.onChange(o.value, o) } catch { /* 宿主回调抛错不拖垮控件 */ } }
    close(true)
  }
  /** 展开：单开注册表 + 自动翻转 + 只在展开期间挂监听。 */
  const open = () => {
    if (list) return
    if (openRoot && openRoot !== root) {
      //  ①上一个控件若已被宿主从 DOM 里摘掉（属性面板整块重渲染就是这样），它的 close() 没被调过
      //    ⇒ document/window 上的监听还挂着。这里补一刀：先关它，再清空注册表（防监听泄漏、防"幽灵下拉"）。
      const prev = openRoot.__mpwSelectClose
      if (typeof prev === 'function') prev()
      if (openRoot && openRoot !== root) openRoot = null
    }
    model = optionsOf(selectEl)
    if (!model.length) return
    const winRect = visibleWindow(btn, win)
    const br = btn.getBoundingClientRect()
    const plan = planList({
      anchorTop: br.top, anchorBottom: br.bottom,
      viewportTop: winRect.top, viewportBottom: winRect.bottom,
      count: model.length,
    })
    list = doc.createElement('ul')
    list.className = 'mpw_select_list'
    list.setAttribute('role', 'listbox')
    list.style.maxHeight = plan.height + 'px'
    list.style.minHeight = Math.min(MIN_H, plan.height) + 'px'
    // ①(P-159) 坐标要减掉**包含块原点**（否则整体下移一个 header —— 就是"下拉与触发框之间有缝"）。
    const { off, trackRect } = containingOffset(doc, btn, win)
    const gap = 2
    list.style.left = Math.round(br.left - off.dx) + 'px'
    if (plan.flip === 'down') list.style.top = (br.bottom + gap - off.dy) + 'px'
    else {
      // 上翻按**下边缘**锚定：内容比 max-height 矮时也不会留缝。
      const cbBottom = trackRect && Number.isFinite(Number(trackRect.bottom)) ? Number(trackRect.bottom) : (win.innerHeight || br.bottom)
      list.style.bottom = ((cbBottom - (br.top - gap))) + 'px'
    }
    list.setAttribute('data-flip', plan.flip)
    try { list.setAttribute('data-origin', off.dx || off.dy ? 'containing-block' : 'viewport') } catch { /* 桩 DOM */ }
    const sel = selectedIndex(model, selectEl.value)
    model.forEach((o, i) => {
      const li = doc.createElement('li')
      li.className = 'mpw_select_item'
      li.setAttribute('role', 'option')
      li.setAttribute('aria-selected', i === sel ? 'true' : 'false')
      if (o.disabled) li.setAttribute('aria-disabled', 'true')
      li.textContent = o.label            // ①只用 textContent（不拼 innerHTML）
      li.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation() })
      li.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); commit(i) })
      li.addEventListener('pointerenter', () => { if (!o.disabled) { active = i; applyActive() } })
      list.appendChild(li)
    })
    root.appendChild(list)
    root.setAttribute('data-open', '1')
    root.__mpwSelectClose = close          // 给"单开注册表"用：上一个控件由它自己关
    btn.setAttribute('aria-expanded', 'true')
    openRoot = root
    active = sel
    applyActive()
    //  ①监听只在展开期间存在（close 里全部卸掉）
    doc.addEventListener('pointerdown', onDocDown, true)
    win.addEventListener('resize', close)
    win.addEventListener('scroll', close, true)
  }
  const toggle = () => { if (list) close(true); else open() }

  const onBtnDown = (ev) => { ev.preventDefault(); ev.stopPropagation() }
  const onClick = (ev) => { ev.preventDefault(); ev.stopPropagation(); if (!selectEl.disabled) toggle() }
  const onKey = (ev) => {
    const k = ev.key
    if (isCancelKey(k)) { if (list) { ev.preventDefault(); close(true) } return }
    if (isCommitKey(k)) { ev.preventDefault(); if (!list) open(); else if (active >= 0) commit(active); return }
    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Home' || k === 'End' || k === 'PageDown' || k === 'PageUp') {
      ev.preventDefault()
      if (!list) { open(); return }
      active = nextIndex(k, active, model.length)
      applyActive()
      return
    }
    if (k === 'Tab') { close(false) }
  }
  btn.addEventListener('pointerdown', onBtnDown)
  btn.addEventListener('click', onClick)
  btn.addEventListener('keydown', onKey)
  //  ①原生 select 被程序改动（既有代码 setValue）后按钮要跟上；选项变了也要重建
  const mo = win.MutationObserver ? new win.MutationObserver(() => { if (!list) paintButton() }) : null
  if (mo) mo.observe(selectEl, { childList: true, subtree: true, attributes: true })
  // ①(P-159) 宿主程序化改值（`sel.value = x`）或用户用键盘改原生 select 时也要跟上：
  //   这条监听挂在 **select 自己**身上（与 `.bench-rd` 的 `sel.addEventListener('change', label)` 同形），
  //   不是 document/window 上的常驻监听 ⇒ 不违反"监听器只在展开期间存在"那条纪律。
  const onSelChange = () => paintButton()
  selectEl.addEventListener('change', onSelChange)
  paintButton()

  const handle = {
    root, isOpen, open, close,
    refresh: () => { if (list) { close(false); open() } else paintButton() },
    destroy: () => {
      close(false)
      if (mo) mo.disconnect()
      selectEl.removeEventListener('change', onSelChange)
      btn.removeEventListener('pointerdown', onBtnDown)
      btn.removeEventListener('click', onClick)
      btn.removeEventListener('keydown', onKey)
      root.remove()
      selectEl.hidden = false
      selectEl.removeAttribute('tabindex')
      selectEl.removeAttribute('aria-hidden')
      selectEl.removeAttribute('data-mpw-select-native')
      try { delete selectEl.__mpwSelectHandle } catch (e) { selectEl.__mpwSelectHandle = null }
    },
  }
  selectEl.__mpwSelectHandle = handle
  return handle
}

/**
 * 把 `root` 里所有匹配的原生 `<select>` 都增强（已增强过的跳过）。
 * @returns {Array} handles
 */
export function enhanceAll(root, selector = 'select:not([data-mpw-select-native])', opt = {}) {
  const doc = root.ownerDocument || root
  const list = root.querySelectorAll ? [...root.querySelectorAll(selector)] : []
  void doc
  return list.map((s) => enhanceSelect(s, opt))
}
