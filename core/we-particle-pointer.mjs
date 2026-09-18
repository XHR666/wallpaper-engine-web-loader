// core/we-particle-pointer.mjs —— 粒子侧的「鼠标尾迹」指针通路（照抄上游，非独立实现）
//
// ①(P-136 用户第 4 项：照抄上游 MIT 实现) 来源 oneincase/webwallgl
//   · renderer/vendor/we-scene/render/particles.js:663-672（图层变换字段 originX/Y/Z、scaleX/Y、angleZ）
//   · renderer/vendor/we-scene/render/particles.js:686-697（`setPointer`）
//   · renderer/vendor/we-scene/render/particles.js:830-851（`mapsequencearoundcontrolpoint` 投放块）
//   · renderer/vendor/we-scene/render/particles.js:1010-1024（`vortex` 块）
//   · renderer/vendor/we-scene/render/particles.js:1154-1163（`_cpPos`）
//   · renderer/src/scene-mount.ts:1670-1676（每帧把活指针推进粒子系统）
//   （MIT © 2026 oneincase），源码 checkout 见 THIRD-PARTY.md §14，许可全文随仓库在
//   `demo/LICENSE-webwallgl-MIT.txt`。
//
// 用户第 4 项的原话是「你直接把 oneincase 跟鼠标尾迹有关的代码，你看看直接复制过来就算了」——
// 也就是**要照抄，不要按行为契约重写**。本仓库此前对 upstream 的纪律是"只引行为结论、
// 不复制代码"（THIRD-PARTY.md §8/§10）；本节按用户直接指令改成**允许复制**并登记（THIRD-PARTY.md §14）。
//
// ─────────────────────────────────────────────────────────────────────────────
// 逐块「照抄 / 适配」对照表（改了什么必须写在这里，不许悄悄改）
//
//  块 | 上游行号 | 处置
//  ---|---------|-----
//  A  | particles.js:663-672 | **逐字**，只有 `this.` → `sys.`；**唯一例外**是 angleZ 那一行见 A-1
//  B  | particles.js:686-697 | **逐字**，只有 `this.` → `sys.`；落点字段名 `this.pointer` → `sys.pointerLocal`（见 B-1）
//  C  | particles.js:830-851 | 位置部分（830-845）**逐字**（仅把 `p.x = …` 赋值形改成返回值）；
//     |                  | 初速部分（846-850）**未照抄**：上游用 `Math.random()`，本仓库必须用系统自己的
//     |                  | 确定性 RNG（见 C-1）
//  D  | particles.js:1010-1024 | **逐字**（仅把 `p.vx += …` 改成返回值），音频门控保留在本仓库算子层
//  E  | particles.js:1154-1163 | **逐字**，只有 `this.` → `sys.`、`this.controlPoints` → `sys.localControlPoints`
//  F  | scene-mount.ts:1670-1676 | **逐字语义**：每帧把**活指针**写进粒子系统，指针**不进**重建签名
//
//  A-1（角度单位 · 必须说明）：上游那一行是 `this.angleZ = ((la[2] || 0) * Math.PI) / 180`
//      ——它拿到的 `layer.angles` 是**度**。本仓库 `scene.json` 的 `angles` 是**弧度**
//      （①(P-21-ATTACH) 语料实测 π/π/2；bundle 直收、不再 ×π/180），故这里去掉 `× π/180`，
//      并把符号取成与 `spawnParticle` 的 `cos(-angle)` 同一手性。**这一行不是逐字**，其余各行逐字。
//  B-1（字段名 · 必须说明）：上游把局部指针写进 `this.pointer`，而本仓库 `sys.pointer` 已被
//      `tests/pointer-leave-test.mjs`（64 断言）钉成「**世界设计坐标**（y 向下）」——
//      改成上游的局部空间会让 A1b/A2b/A3b/A3c/P4b 五条断言变红。按任务纪律「上游行为与既有断言
//      冲突 ⇒ 先报告、不要擅自改断言」，这里**不动 `sys.pointer`**，把上游的局部指针落到
//      **新字段 `sys.pointerLocal`**，两条语义并存（冲突报告见 P-136 台账「未证实项」）。
//  C-1（随机源 · 必须说明）：上游 847 行是 `const k = Math.random()`（**非确定性**，与它的
//      `rng` 流不是同一个）。本仓库每次渲染必须可复现（门禁会逐位比两次运行），故初速仍吃
//      系统自己的 `rng()`；位置投放（830-845）**不含随机数**，逐字照抄不受影响。
// ─────────────────────────────────────────────────────────────────────────────
//
// 为什么这一份照抄能修好「看不见尾迹」：上游的指针是**每帧推进的活输入**
// （`scene-mount.ts:1670-1676` 在 `advance()` 之前调 `ps.setPointer(wx, py)`），粒子系统
// **只在时间轴上增量前进**，于是"光标走过的路径"被留在已存活粒子的坐标里 —— 那就是尾迹。
// 本仓库此前把指针坐标放进了粒子系统的**重建签名**（`core/we-scene-bundle.js` 的 `__sig`），
// 指针一动就整系统从 t=0 重放、且重放全程只用**当前**这一个坐标 ⇒ 历史被抹平、花瓣永远
// 糊在光标上（数字见 P-136 台账：尾迹跨度 67px → 1175px）。照抄本模块 = 把指针变成活输入。

/**
 * 块 A：图层变换字段。
 *
 * ①(P-136 用户第 4 项：照抄上游 MIT 实现) 来源 oneincase/webwallgl
 * renderer/vendor/we-scene/render/particles.js:663-672（MIT © 2026 oneincase），
 * 除 angleZ 的单位（见文件头 A-1）外未做语义改写。
 *
 * 上游 `syncLayerTransform()` 的 663-672 行；上游 673-684 行是精灵 quad 的非等比拉伸
 * （`sysScale` / `spriteStretchX/Y`），**与鼠标尾迹无关，未复制**（任务纪律：不复制无关大段）。
 *
 * @param {object} sys  本仓库的粒子系统对象
 * @param {{origin?:number[],scale?:number[],angles?:number[]}} layer
 */
export function syncLayerTransform(sys, layer) {
  const lo = layer && layer.origin ? layer.origin : [0, 0, 0]
  const ls = layer && layer.scale ? layer.scale : [1, 1, 1]
  const la = layer && layer.angles ? layer.angles : [0, 0, 0]
  sys.originX = lo[0] || 0
  sys.originY = lo[1] || 0
  sys.originZ = lo[2] || 0
  sys.scaleX = ls[0] === 0 ? 1 : ls[0]
  sys.scaleY = ls[1] === 0 ? 1 : ls[1]
  // ①(P-136 适配 A-1) 上游：`this.angleZ = ((la[2] || 0) * Math.PI) / 180`
  //   本仓库 angles 是弧度、手性与 spawnParticle 的 cos(-angle) 一致 ⇒ 去掉 ×π/180 并取负。
  sys.angleZ = -(la[2] || 0)
}

/**
 * 块 B：宿主每帧提供鼠标位置（世界像素）；转到局部空间供控制点使用。
 *
 * ①(P-136 用户第 4 项：照抄上游 MIT 实现) 来源 oneincase/webwallgl
 * renderer/vendor/we-scene/render/particles.js:686-697（MIT © 2026 oneincase），未做语义改写
 * （仅 `this.` → `sys.`，落点字段 `this.pointer` → `sys.pointerLocal`，理由见文件头 B-1）。
 *
 * 上游 `renderer/src/scene-mount.ts:1674` 每帧在 `advance()` **之前**调用它；本仓库同序。
 *
 * @param {number} worldX 世界像素（y 向下，本仓库口径）
 * @param {number} worldY 世界像素（y 向下）
 */
export function setPointer(sys, worldX, worldY) {
  const dx = worldX - sys.originX
  const dy = worldY - sys.originY
  const c = Math.cos(-sys.angleZ)
  const s = Math.sin(-sys.angleZ)
  sys.pointerLocal = {
    x: (dx * c - dy * s) / (sys.scaleX || 1),
    y: (dx * s + dy * c) / (sys.scaleY || 1),
  }
}

/**
 * 块 E：控制点当前位置（局部空间）。
 *
 * ①(P-136 用户第 4 项：照抄上游 MIT 实现) 来源 oneincase/webwallgl
 * renderer/vendor/we-scene/render/particles.js:1154-1163（MIT © 2026 oneincase），未做语义改写
 * （仅 `this.` → `sys.`、`this.controlPoints` → `sys.localControlPoints`）。
 *
 * `sys.localControlPoints[i].offset` 是**本地 y 向下**的偏移 —— 上游的局部空间是 y 向上，
 * 所以上游存 authored offset 原值；本仓库在 buildParticleSystem 里把 authored（y 向上）
 * 的 `offset[1]` 取了负存进来（数据口径，不改这里的算式）。
 *
 * @returns {[number,number,number]|null} 局部空间控制点位置；无该控制点/无指针 ⇒ null
 */
export function cpPos(sys, id) {
  const cp = sys.localControlPoints.find((c) => c.id === id)
  if (!cp) return null
  if (cp.lockToPointer) {
    if (!sys.pointerLocal) return null
    return [sys.pointerLocal.x + cp.offset[0], sys.pointerLocal.y + cp.offset[1], cp.offset[2]]
  }
  return cp.offset
}

/**
 * 局部 → 世界（本仓库口径：世界即渲染设计像素、y 向下）。
 *
 * 逐字取自上游 `render()` 里的 `toWorld`（`particles.js:1300-1305`）的**前两行**：
 *   `const px = lx * sx; const py = ly * sy; return [ox + px*cos - py*sin, …]`
 * 唯一差别：上游第三个分量要做 `projH - (…)`（它的局部是 y 向上，要翻到投影空间），
 * 本仓库的世界本身就是 y 向下 ⇒ 不做那次翻转。
 *
 * @param {number[]} lo 局部空间坐标（y 向下，本仓库口径）
 * @returns {[number,number,number]}
 */
export function localToWorld(sys, lo) {
  const px = lo[0] * sys.scaleX
  const py = lo[1] * sys.scaleY
  const cos = Math.cos(sys.angleZ)
  const sin = Math.sin(sys.angleZ)
  return [sys.originX + px * cos - py * sin, sys.originY + px * sin + py * cos, sys.originZ + lo[2]]
}

/**
 * `cpPos`（上游 `_cpPos`）+ `localToWorld`（上游 `toWorld`）的复合 —— 控制点的**世界**位置。
 *
 * @returns {[number,number,number]|null}
 */
export function cpWorld(sys, id) {
  const lo = cpPos(sys, id)
  if (!lo) return null
  return localToWorld(sys, lo)
}

/**
 * 块 C（位置部分）：`mapsequencearoundcontrolpoint` 绕控制点按 count 等分圆轮流投放。
 *
 * ①(P-136 用户第 4 项：照抄上游 MIT 实现) 来源 oneincase/webwallgl
 * renderer/vendor/we-scene/render/particles.js:830-845（MIT © 2026 oneincase），
 * 除把 `p.x = …` 三个赋值改成返回值外未做语义改写。
 *
 * 上游 846-850 的初速用 `Math.random()`，本仓库**未照抄**（见文件头 C-1）：
 * 调用方仍吃确定性的 `rng()`，算式（三轴共用同一个随机数）与上游同构。
 *
 * 坐标：本函数在**局部空间**算（与上游同），调用方用 `toWorldLocal` 落到世界。
 *
 * @param {[number,number,number]} around 控制点当前位置（局部空间，来自 `cpPos`）
 * @param {number} seqIndex 轮转序号（调用方每次投放 +1）
 * @param {number} count   `count`（等分份数）
 * @param {number[]} bounds `bounds`（[start, end] 圆周参数）
 * @param {number} rmin    `em.distanceMin[0]`
 * @param {number} rmax    `em.distanceMax[0]`
 */
export function mapSequenceAroundControlPoint(around, seqIndex, count, bounds, rmin, rmax) {
  const n = count
  const i = seqIndex
  const u = n > 0 ? (i % n) / n : 0
  const t = bounds[0] + (bounds[1] - bounds[0]) * u
  const ang = t * Math.PI * 2
  const rad = rmax > 0 ? rmax : rmin
  return [around[0] + Math.cos(ang) * rad, around[1] + Math.sin(ang) * rad, around[2]]
}

/**
 * 块 D：`vortex` 的切向加速（绕控制点）。
 *
 * ①(P-136 用户第 4 项：照抄上游 MIT 实现) 来源 oneincase/webwallgl
 * renderer/vendor/we-scene/render/particles.js:1010-1024（MIT © 2026 oneincase），
 * 除把 `p.vx += …` 两个赋值改成返回值外未做语义改写。
 *
 * 上游 1019-1020 的音频门控 `vK`（`v.audioMode ? audioGate(...) : 1`）由本仓库算子层
 * 的 `audioK` 提供（等价：无音频视图时 audioK = 1），故本函数不含音频参数。
 *
 * @param {number} px 粒子 x（与 base 同一空间）
 * @param {number} py 粒子 y
 * @param {number[]} base 控制点当前位置（与粒子同一空间）
 * @param {{offset:number[],distanceInner:number,distanceOuter:number,speedInner:number,speedOuter:number}} v
 * @param {number} dt
 * @returns {[number,number]|null} `[dvx, dvy]`；距离 < 1e-3（上游 `continue`）⇒ null
 */
export function vortexSwirl(px, py, base, v, dt) {
  const dx = px - (base[0] + v.offset[0])
  const dy = py - (base[1] + v.offset[1])
  const dist = Math.hypot(dx, dy)
  if (dist < 1e-3) return null
  const span = v.distanceOuter - v.distanceInner
  const k = span > 0 ? Math.min(1, Math.max(0, (dist - v.distanceInner) / span)) : 0
  const speed = v.speedInner + (v.speedOuter - v.speedInner) * k
  return [(-dy / dist) * speed * dt, (dx / dist) * speed * dt]
}

/**
 * 块 F：上游 `renderer/src/scene-mount.ts:1670-1676` 的每帧推进语义 ——
 *
 *   世界指针位置：locktopointer 的控制点用它做吸引/排斥（controlpointattract）。
 *   if (pointerSrc.state.has) { const { wx, wy, originY } = pointerSrc.state;
 *     const py = originY != null ? originY : wy;
 *     for (const ps of particleSystems) ps.setPointer(wx, py); }
 *
 * 关键**不在于**这几行的字面，而在于它是**每帧**调用、并且指针**从不参与**粒子系统的
 * 构造/缓存签名 —— 系统只在时间轴上增量前进，指针路径因此留在粒子坐标里（= 尾迹）。
 *
 * 本仓库把这条语义放在这里，由 `core/we-scene-bundle.js` 的 `renderParticleLayer`
 * 在 `simulateParticleSystem()` **之前**调用一次。
 *
 * @param {object} sys 粒子系统
 * @param {[number,number]|null} pointerWorld 设计坐标（y 向下）；null = 本帧无指针
 * @returns {boolean} 是否推进了指针（false = 本帧无指针 ⇒ lockToPointer 发射器不发射）
 */
export function pushPointerFrame(sys, pointerWorld) {
  if (pointerWorld) setPointer(sys, pointerWorld[0], pointerWorld[1])
  return !!pointerWorld
}
