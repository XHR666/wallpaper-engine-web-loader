/* 参照来源许可声明：本文件提到的 wer-ref/ 是第三方参考实现（Aromatic05/wallpaper-engine-renderer，GPL-2.0-only，非 WE 官方代码、非「真值源」），与本项目（GPL-3.0-or-later）许可不兼容 —— 仅用于行为对照，不得复制/改写/逐行翻译其代码、注释、常量组织或错误文案。we-layerd-ref/（Aromatic05/we-layerd）无任何许可（保留所有权利），同样仅行为对照。血缘自查结论见 docs/WER-REF-LICENSE-AUDIT.md。 */ // WE scene scripts 运行时: 执行 {script, value} 对象的 JS 脚本 (NSL)
// 支持: export function update(value) — 每帧更新 (返回新值)
//       export function applyUserProperties(changed) — 用户属性变化更新
//       export function init(value) — 初始化一次 (返回新值; NSL init(value))
// 提供 WEColor / createScriptProperties / engine.canvasSize / Vec3 等引擎 API (vm 沙箱)
// 用户属性 (project.json general.properties) 注入 scriptProperties (user 映射)
//
// 关键设计 (sf35 重构): 脚本**编译一次、状态跨帧保留** — 旧实现每帧重编译导致
// NSL 脚本内部状态 (计数器/动画调度器) 每帧重置、大型脚本每帧编译 CPU 爆表,
// 且 init() 每帧重复调用。现在:
//   - createScriptCache() 持有 {map: Map<源码, 编译条目>, shared}
//   - 每个 SceneRenderer 实例一个 cache (scene-anim 多帧复用实例 → 状态跨帧保留)
//   - 同一源码只编译一次; init() 只在首次执行; 每帧只调 update(value)
//   - thisObject/thisLayer 通过 ownerRef 代理指向"当前脚本所属对象" (缓存共享
//     时对象不串); 读写真实渲染对象 (origin/scale/visible/alpha/animationlayers)
//   - engine API 补全 (isRunningInEditor 等) — NSL 库 (如 Mutsumi 788) 缺失
//     方法时中途抛错 → 后续 shared 赋值全部丢失 → 整个动画框架失效
import vm from './nsl.js';
import { WEColor, Vec2, Vec3, ScriptPropertiesBuilder, WEVector, DEG2RAD, RAD2DEG } from './scene-script-apis.js';

// NSL thisScene: getLayer(name) → 图层包装, 读写真实场景对象属性
// origin/scale/size 字符串 "x y z" ↔ Vec3; visible/alignment 直接读写
// 脚本对象 {script, value} 取 value (715 读 Launcher scale 时其脚本可能尚未
// 执行/已执行 — 读最终 value 而非原始 {script,value} 对象)
// ①(2026-09-12) 供 thisLayer / thisScene 两套引用共享的工具（矩阵 / 纹理动画句柄）
const parseVShared = (v, def) => {
  const raw = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
  const p = String(raw == null ? '' : raw).trim().split(/\s+/).map(Number);
  return new Vec3(p[0] ?? def[0], p[1] ?? def[1], p[2] ?? def[2]);
};
export function transformMatrixShared(obj) {
  const o = obj ? parseVShared(obj.origin, [0, 0, 0]) : new Vec3(0, 0, 0);
  const sc = obj ? parseVShared(obj.scale, [1, 1, 1]) : new Vec3(1, 1, 1);
  const a = obj ? parseVShared(obj.angles, [0, 0, 0]) : new Vec3(0, 0, 0);
  const c = Math.cos(a.z || 0), si = Math.sin(a.z || 0);
  return { m: [c * sc.x, si * sc.x, 0, 0, -si * sc.y, c * sc.y, 0, 0, 0, 0, 1, 0, o.x, o.y, o.z || 0, 1], x: o.x, y: o.y, z: o.z || 0 };
}
export function texAnimRefShared(obj) {
  return {
    play: () => { if (obj) obj.__texFramePlay = true },
    stop: () => { if (obj) obj.__texFramePlay = false },
    setFrame: (f) => { if (obj) { obj.__texFrame = Number(f) || 0; obj.__texFrameForced = true } },
    getFrame: () => (obj && obj.__texFrame) || 0,
    setFrameCount: () => {}, setTime: () => {}, setFps: () => {}, setRate: () => {},
  };
}

// ①(TIME-VARIATION) 官方 layer.getVideoTexture()：没有视频纹理也返回稳定命令对象，
//   让 play()/pause() 退化成 no-op 而不是每帧抛错（WPSceneScriptHost.cpp:1293-1300）。
export function videoTexRefShared(obj) {
  return {
    play: () => { if (obj) obj.__videoPlay = true },
    pause: () => { if (obj) obj.__videoPlay = false },
    stop: () => { if (obj) obj.__videoPlay = false },
    setCurrentTime: () => {}, getCurrentTime: () => 0,
    isPlaying: () => !!(obj && obj.__videoPlay),
    rate: 1,
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * ①(P-141 2026-09-19 用户第 ⑧ 项续) **SceneScript API 缺口收口（8 类 / 8 个包）**
 *
 * 背景：P-137 把 `thisLayer.size` 一类缺口清零后，全语料同族扫描（`tests/script-runtime-errors-test.mjs`
 *   的 S5）还剩 **8 个包**，全部在作者脚本的**第 1 帧**就抛，形态是"某个官方成员还没实现"：
 *     init:thisLayer.getAnimation(3 包) / getParticleSystem(3) / thisScene.getLayerIndex(2) /
 *     thisLayer.isPlaying(1) / thisScene.createLayer(1) / audioLayer.stop(1) / engine.setInterval(1)
 *     / update:Cannot read properties of undefined (reading 'toFixed')(1，是 createLayer 抛错后
 *       `shared.xx*` 从未被赋值引发的**级联**，不是独立缺口 —— 见 PATCHES P-141.2)。
 *
 * 官方语义（一手出处 = 随引擎发布的类型声明 `$MPW_ROOT/wallpaper_engine/ui/dist/monaco/autocomplete/
 *   lib.sceneScript.d.ts`，行号为该文件实测；官方文档 docs.wallpaperengine.io 作为补充）：
 *   · L494-499 `interface IObject { getAnimation(name?: String): IAnimation; }`
 *     （文档注释逐字 "Get an animation object by name. Leave empty to get the animation object
 *       bound to the current property."）⇒ **有返回值**，不是 void。
 *   · L1139 `interface ILayer extends IObject, IImageLayer, ISoundLayer, IEffectLayer, ITextLayer,
 *     IParticleSystem, IModel, ICamera` ⇒ ILayer **同时**是 ISoundLayer 与 IParticleSystem。
 *   · L744-771 `interface ISoundLayer`: `isPlaying(): Boolean` / `play(): void` / `stop(): void` /
 *     `pause(): void` / `volume: Number` ⇒ `thisLayer.isPlaying()` 是**方法**（不是属性），
 *     与本文件既有口径一致（语料 3351163962 写的就是 `thisLayer.isPlaying()`）。
 *   · L955-985 `interface IParticleSystem`: `play()/pause()/stop()/isPlaying()/emitParticles(count?)`
 *     + `instance: IParticleSystemInstance`；L874-952 `IParticleSystemInstance` 的字段是
 *     `alpha/size/count/speed/lifetime/rate/colorn/controlpoint0..7`（**rate 在 instance 上**）。
 *   · L1278 `IScene.createLayer(configuration: String|Object|IAssetHandle): ILayer`；
 *     L1282 `sortLayer(layer: String|Number|ILayer, index: Number): Boolean`；
 *     L1288 `getLayerIndex(layer: String|ILayer): Number`；
 *     L1292 `getInitialLayerConfig(layer: String|Number|ILayer): Object`。
 *   · L1519 `IEngine.setInterval(callback: Function, delay?: Number): Function`
 *     （"Starts a repeating interval callback in milliseconds. Returns a new callback that can be
 *       used to stop the interval."）；同段 L1523-1526 把 `clearTimeout` **注释掉**并注明
 *     "Not implemented. Use returned function to clear." ⇒ 官方唯一声明的清除路径是"调用返回的函数"。
 *   · L1568-1623 `interface IAnimation`：`readonly fps / readonly frameCount / readonly duration /
 *     readonly name`、`rate: Number`、`play()/pause()/stop()/isPlaying()/getFrame()/setFrame(frame)`。
 *   · `thisLayer.getParticleSystem` **不在** d.ts（也不在官方 ILayer 文档页）——它是语料里作者写的
 *     "取本层粒子系统"的写法；官方模型里这件事**已经是 `thisLayer` 自己**（ILayer extends
 *     IParticleSystem）。因此我们按官方模型实现：`getParticleSystem()` 返回**本层的 IParticleSystem
 *     视图**（同一个粒子系统句柄，不是第二份状态），并把语料直接写的 `.rate` 转发到官方落点
 *     `instance.rate`。行为对照（只读结论，不抄代码）：第三方参考实现 wer-ref
 *     `references/wer-ref/src/backend/scene/internal/scenescript/WPSceneScriptHost.cpp:1510`
 *     （layer proxy 的 `isPlaying` 仅在 `hasLayerMember(nodeId,'isPlaying')` 时存在）、
 *     `:1427-1434`（`getAnimation(name)` 解析不到就返回 undefined）、`:911-919`
 *     （`engine.setInterval` 返回一个带 `__timerId` 的 stop 函数、`clearInterval = clearTimeout`）。
 *     wer-ref 是 GPL-2.0-only（与本仓库 GPL-3.0-or-later 不兼容）⇒ **只取行为结论，未复制代码/注释**。
 *
 * 本块的四条通用口径（每一处实现都遵守）：
 *   ① **官方标 `readonly` 的成员只提供 getter**（fps/frameCount/duration/name）；同时挂一个
 *      **静默丢弃**的 setter —— 理由与 P-137 的 `size` 完全一致：只写 getter 会让 `'use strict'`
 *      作者脚本里的赋值由"静默成功"变成 **TypeError**（比"写入无效"更重的行为改变）。
 *      净效果 = 读得到、改不了、**不抛错**（新门禁断言这三条）。
 *   ② **不支持的调用不抛错**：按官方语义给 no-op 或 falsy（返回 `undefined` 是官方行为：
 *      wer-ref 对"该层没有这个动画"就是返回 undefined）。
 *   ③ **不得静默**：所有"我们只能记帐、无法真正作用到引擎"的调用都折进下面这份**可观测**计数表
 *      （`sceneScriptApiDiag()`），门禁与新测试直接读它。
 *   ④ **不做包补丁**：全部是通用成员/函数实现，语料里出现的包只是判据，不是分支条件。
 * ═══════════════════════════════════════════════════════════════════════════════ */

/** ①(P-141) 脚本 API 缺口收口的**可观测**计数表（只增不减；`sceneScriptApiDiag()` 读快照）。 */
export const SCENE_SCRIPT_API_DIAG = {
  getAnimation: 0,        // thisLayer/thisObject/层引用 .getAnimation() 命中次数
  getParticleSystem: 0,   // .getParticleSystem() 命中次数（官方无此成员，见上）
  getLayerIndex: 0,       // thisScene.getLayerIndex() 命中且解析成功
  getLayerIndexUnresolved: 0, // 同上但**解析不到**层（返回 -1；不抛错）
  createLayer: 0,         // thisScene.createLayer() 真正新建的层数
  createLayerReused: 0,   // createLayer 超过上限后返回的"脱离图层引用"数（见 MAX_DYNAMIC_LAYERS）
  sortLayer: 0,           // thisScene.sortLayer() 真正改了顺序的次数
  play: 0, pause: 0, stop: 0, isPlaying: 0,   // ILayer 的 ISoundLayer 面（脚本可见状态机）
  emitParticles: 0,       // IParticleSystem.emitParticles（本机无粒子发射注入点 ⇒ no-op + 计数）
  particleInstanceWrite: 0,   // IParticleSystemInstance 字段**写穿** obj.instanceoverride 的次数
  animationWrite: 0,      // IAnimation 的 rate/setFrame 等可写字段被写次数
  timerScheduled: 0, timerFired: 0, timerCleared: 0,  // engine.setInterval 家族
};
/** 计数表快照（浅拷贝；测试/诊断用，**不**暴露可变引用）。 */
export function sceneScriptApiDiag() { return Object.assign({}, SCENE_SCRIPT_API_DIAG); }
/** 计数表清零（测试用；返回被清的键数）。 */
export function resetSceneScriptApiDiag() {
  const keys = Object.keys(SCENE_SCRIPT_API_DIAG);
  for (const k of keys) SCENE_SCRIPT_API_DIAG[k] = 0;
  return keys.length;
}
const apiBump = (k, n) => { SCENE_SCRIPT_API_DIAG[k] = (SCENE_SCRIPT_API_DIAG[k] | 0) + (n === undefined ? 1 : n); };

/** ①(P-141) `{script,value}` 脚本节点的**写穿**取值：scene.json 里很多属性是节点而不是裸值。 */
const nodeRaw = (v) => ((v && typeof v === 'object' && 'value' in v) ? v.value : v);
/** ①(P-141) 写回：属性是脚本节点就写它的 `value`（不能整只替换 —— 那会把 author 的脚本删掉，
 *   而渲染器 `syncScriptOrigins` 明确读 `raw.origin.value`，说明节点形态是契约）。 */
const nodeWrite = (obj, key, v) => {
  const cur = obj ? obj[key] : undefined;
  if (cur && typeof cur === 'object' && 'value' in cur) cur.value = v;
  else if (obj) obj[key] = v;
};
/** ①(P-141) 定义**访问器**（不是数据属性）。为什么不用 `Object.assign(target, { get x() {} })`：
 *   `Object.assign` 对源对象的访问器是**取值后拷贝**（规范 [[Get]] + CreateDataProperty）⇒ 目标上
 *   变成普通数据属性 —— `a.fps = 1` 会真的覆盖它、`ps.rate = 2` 不会落到 instance。必须 defineProperty。 */
/** ①(P-141) `origin/scale/angles/color` 的写入归一化（与 `makeOwnerRef().toXYZ` 同一口径：
 *   接受 Vec3/Vec2/数组/`"x y z"` 字符串；无法解析 ⇒ null = 静默不写，绝不写坏坐标 —— P-60 的教训）。 */
const toXYZShared = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') {
    const p = v.trim().split(/\s+/).map(Number);
    if (!p.length || !isFinite(p[0])) return null;
    return [p[0], isFinite(p[1]) ? p[1] : 0, isFinite(p[2]) ? p[2] : 0];
  }
  const x = v.x != null ? v.x : v[0];
  const y = v.y != null ? v.y : v[1];
  const z = v.z != null ? v.z : (v[2] != null ? v[2] : 0);
  if (x == null || !isFinite(Number(x))) return null;
  return [Number(x), isFinite(Number(y)) ? Number(y) : 0, isFinite(Number(z)) ? Number(z) : 0];
};
const defineAccessors = (target, spec) => {
  for (const k of Object.keys(spec)) {
    Object.defineProperty(target, k, Object.assign({ enumerable: true, configurable: true }, spec[k]));
  }
  return target;
};

/* ①(P-141) 层引用 → 场景对象的**身份表**。
 *   `thisScene.getLayerIndex(thisLayer)` 必须能把"层引用"映射回 `scene.objects` 里的那个对象；
 *   引用是每次访问新建的对象字面量（`layer()`/`layerRefFor()`/`createLayer()`），所以用 WeakMap
 *   记账（不往 scene.json 对象上写任何记号 —— 那些对象会被渲染器烘焙/序列化）。 */
const LAYER_OBJ_OF = new WeakMap();
function bindLayerObject(ref, obj) { if (ref && obj) { try { LAYER_OBJ_OF.set(ref, obj) } catch { /* ignore */ } } return ref; }
function layerObjectOf(ref) { try { return (ref && typeof ref === 'object') ? (LAYER_OBJ_OF.get(ref) || null) : null } catch { return null } }

/** ①(P-141) 官方 `IAnimationLayer` 的既有句柄（原 `makeOwnerRef()` 内的 `animRef`，本批提到模块级：
 *    `getAnimationLayer()` 与新的 `getAnimation()` 都要用它；**语义逐位不变**（全 no-op + 层数计数），
 *    `makeAnimationRef()` 在它之上**覆盖/追加**官方 `IAnimation` 面 ⇒ 是超集，不会打破任何既有调用。 */
export function animRefShared(obj) {
  return {
    play: () => {}, setFrame: () => {}, setTime: () => {}, setFps: () => {},
    setVisible: () => {}, setBlend: () => {}, setRate: () => {}, setScale: () => {},
    setOrigin: () => {}, setAngles: () => {}, setAlpha: () => {}, setColor: () => {},
    setSize: () => {}, setParallaxDepth: () => {}, setPosition: () => {}, setBrightness: () => {},
    setColorBlendMode: () => {}, getAnimationLayerCount: () => (obj && obj.animationlayers ? obj.animationlayers.length : 1),
    setFrameCount: () => {},
    addEndedCallback: () => {},
  };
}

/* ①(P-141) `ISoundLayer` + `IParticleSystem` 的**共用**播放面（官方：ILayer 同时继承这两个接口 ⇒
 *   同一个 `thisLayer` 上就有这批方法，不需要两套）。
 *   状态放在 WeakMap（不写进 scene.json）：宿主**没有**把脚本侧的 play/stop 接到 demo.html 的
 *   <audio> 池（那需要改 demo.html，本批不动）⇒ 这是"脚本可见的状态机"，不是解码器真实状态：
 *     isPlaying() 默认 false（= 没有已知在播的声音），play()→true，pause()/stop()→false。
 *   这样作者脚本的"播放/停止"逻辑内部自洽（先 play 再查得到 true），且**每一次调用都计数**。 */
const PLAYBACK_STATE = new WeakMap();
function makePlaybackRef(obj) {
  const st = (v) => { if (obj) { try { PLAYBACK_STATE.set(obj, v) } catch { /* ignore */ } } };
  return {
    play() { apiBump('play'); st(true); },
    pause() { apiBump('pause'); st(false); },
    stop() { apiBump('stop'); st(false); },
    isPlaying() { apiBump('isPlaying'); try { return obj ? !!PLAYBACK_STATE.get(obj) : false } catch { return false } },
    // ①(P-141) `IParticleSystem.emitParticles(count?)`：官方"立即发射 count 个粒子，无视播放状态"。
    //   本机沙箱没有粒子发射注入点（渲染器的粒子子系统在 core/，本批不动）⇒ **no-op + 计数**，
    //   把请求量记在对象上（`__psEmitRequest`）以便日后接线与日志核对，不抛错、不静默。
    emitParticles(count) {
      apiBump('emitParticles');
      const n = Math.max(0, Math.trunc(Number(count)) || 1);
      if (obj) { try { obj.__psEmitRequest = (obj.__psEmitRequest | 0) + n } catch { /* ignore */ } }
    },
  };
}

/* ①(P-141) `IParticleSystemInstance`（d.ts L874-952）：字段是**层上 `instanceoverride` 的同名量**。
 *   语料（0917/3448877775 与两份夜莺包）用 `getParticleSystem().rate = …` 调速 ⇒ 这里把字段
 *   **写穿到 `obj.instanceoverride`**：渲染器（core/we-scene-bundle.js:1530/2270/3410）正是从同一个
 *   对象解析 `rate/count/size/…`（`resolveParticleOverride` 认裸数字）⇒ 这不是记账，是**真生效**。 */
const PARTICLE_INSTANCE_KEYS = ['alpha', 'size', 'count', 'speed', 'lifetime', 'rate', 'colorn',
  'controlpoint0', 'controlpoint1', 'controlpoint2', 'controlpoint3',
  'controlpoint4', 'controlpoint5', 'controlpoint6', 'controlpoint7'];
const PARTICLE_REF_OF = new WeakMap();
function particleInstanceOf(obj) {
  const box = obj || {};                       // 空层引用 ⇒ 挂在临时对象上（读写都不抛错）
  const fill = (o) => { for (const k of PARTICLE_INSTANCE_KEYS) if (!(k in o)) o[k] = undefined; return o };
  if (!obj.instanceoverride || typeof obj.instanceoverride !== 'object') {
    // 只有**真的是粒子层**（有 particle 字段）才新建 instanceoverride：往非粒子层上凭空造一个
    // 会让渲染器的 resolveParticleOverride 多出一组"全 1 覆写"，是不必要的副作用。
    if (obj.particle) { const io = fill({}); obj.instanceoverride = io }
    else { let side = PARTICLE_REF_OF.get(box); if (!side) { side = fill({}); PARTICLE_REF_OF.set(box, side) } return side }
  }
  // 官方 `IParticleSystemInstance` 的 15 个字段在实例上**都存在**（缺的置 undefined）。
  //   ⚠ 对渲染器零影响：`resolveParticleOverride` 的 num/vec 对 undefined 与"键不存在"同结果
  //   （num 走默认值、vec 返回 null），而 `JSON.stringify` 会丢掉 undefined ⇒ 序列化形状不变。
  return fill(obj.instanceoverride);
}
function makeParticleSystemRef(obj) {
  const inst = particleInstanceOf(obj);
  const ref = Object.assign(makePlaybackRef(obj), {});
  const spec = {
    // 官方 `IParticleSystem.instance`：**同一个**字段表（每次访问同一对象 ⇒ 改一处不会分叉）
    instance: { get: () => inst, set: () => { /* 官方只读引用：静默丢弃 */ } },
    // ①(P-141) 语料把官方 `instance.rate` 写成 `getParticleSystem().rate`（官方 IParticleSystem 上
    //   **没有** rate）⇒ 手柄上做**转发**（读/写都落到 inst.rate），不是第二份状态。
    rate: {
      get: () => (Number(nodeRaw(inst.rate)) || 0),
      set: (v) => { inst.rate = Number(v) || 0; apiBump('particleInstanceWrite') },
    },
  };
  for (const k of PARTICLE_INSTANCE_KEYS) {
    if (k === 'rate') continue;
    spec[k] = {
      get: () => nodeRaw(inst[k]),
      set: (v) => { inst[k] = v; apiBump('particleInstanceWrite') },
    };
  }
  return defineAccessors(ref, spec);
}
/** 稳定句柄：同一层的 `getParticleSystem()` 永远返回同一对象（作者在 init 里缓存它）。 */
function particleRefFor(obj) {
  const key = obj || {};
  let r = PARTICLE_REF_OF.get(key);
  if (!r || !obj) r = makeParticleSystemRef(obj);
  if (obj) PARTICLE_REF_OF.set(key, r);
  return r;
}

/* ①(P-141) `IAnimation`（d.ts L1568-1623）。
 *   官方四个 `readonly` 字段（fps/frameCount/duration/name）给 getter + 静默 setter（口径 ①）。
 *   状态同样**不写进 scene.json**：本机渲染器没有时间轴动画播放器（精灵表帧由 core 按 `time`
 *   推进），所以 `play/pause/stop/setFrame/getFrame` 是脚本可见的状态机 + 计数，**不改渲染**。
 *   `rate` 可写（官方非 readonly），记进状态并计数。
 *   返回值**永远是真值句柄**（官方在"该层没有该动画"时返回 undefined；我们无从判断作者的绑定，
 *   给句柄能让作者脚本的 `animation.rate = …` 有着落，并且是可观测的记账而不是静默丢弃）。 */
const ANIM_STATE = new WeakMap();
const ANIM_NULL_KEY = {};
function animStateOf(obj) {
  const key = obj || ANIM_NULL_KEY;
  let s = ANIM_STATE.get(key);
  if (!s) { s = { frame: 0, rate: 1, playing: false, name: '' }; ANIM_STATE.set(key, s); }
  return s;
}
function makeAnimationRef(obj, name) {
  const s = animStateOf(obj);
  if (typeof name === 'string' && name) s.name = name;
  const ref = animRefShared(obj);
  // ── 官方 readonly 四个：**只写 getter + 静默丢弃的 setter**（口径 ①，理由见上方长注释）──
  defineAccessors(ref, {
    fps: { get: () => 0, set: () => { /* readonly ⇒ 静默丢弃 */ } },
    frameCount: { get: () => 0, set: () => { /* readonly */ } },
    duration: { get: () => 0, set: () => { /* readonly */ } },
    name: { get: () => s.name, set: () => { /* readonly */ } },
    rate: { get: () => s.rate, set: (v) => { s.rate = Number(v) || 0; apiBump('animationWrite') } },
  });
  Object.assign(ref, {
    play() { s.playing = true; apiBump('animationWrite') },
    pause() { s.playing = false; apiBump('animationWrite') },
    stop() { s.playing = false; s.frame = 0; apiBump('animationWrite') },
    isPlaying() { return !!s.playing },
    getFrame() { return s.frame },
    setFrame(f) { s.frame = Math.max(0, Math.trunc(Number(f)) || 0); apiBump('animationWrite') },
  });
  return ref;
}

/* ①(P-141) `engine.setInterval/clearInterval`（d.ts L1519；官方文档 "Starts a repeating interval
 *   callback in milliseconds"）。
 *   驱动点 = `applySceneScripts` 的**每一帧**，时间基准 = 传进来的场景时钟 `time`（秒，
 *   = `engine.runtime` 的同一条时间轴）—— 这样定时器精度与"脚本节拍分层"无关（demo 的
 *   慢档是 4Hz、快档 30Hz；若按调用次数累加 frametime 会少算 ~15 倍）。
 *   回调在**注册它的那次编译上下文**里跑，并且先 `ownerRef.setOwner(注册时的对象)` 再调用 ⇒
 *   回调里的 `thisLayer/thisObject` 仍指向作者那一层（官方"每个脚本实例一个定时器"的等价物）。
 *   返回值 = "stop 函数"（官方：返回一个新的回调，可用于停止；wer-ref 同款带 `__timerId`）。 */
const ENGINE_TIMERS = new WeakMap();
function engineTimerTable(engine) {
  let t = ENGINE_TIMERS.get(engine);
  if (!t) { t = { seq: 0, timers: new Map(), lastClock: null }; ENGINE_TIMERS.set(engine, t); }
  return t;
}
/** 每帧推进某个脚本上下文的定时器。`clockSec` = 场景时钟（秒，可 undefined）；`fallbackDt` = 帧秒数。 */
function pumpEngineTimers(engine, clockSec, fallbackDt) {
  const t = engine && ENGINE_TIMERS.get(engine);
  if (!t || !t.timers.size) return 0;
  let dtMs;
  if (Number.isFinite(clockSec)) {
    if (t.lastClock === null) { t.lastClock = clockSec; return 0 }   // 首次只对表，不给"补发"
    dtMs = (clockSec - t.lastClock) * 1000;
    t.lastClock = clockSec;
  } else {
    dtMs = (Number(fallbackDt) || 0) * 1000;
  }
  if (!Number.isFinite(dtMs) || dtMs <= 0) return 0;
  dtMs = Math.min(dtMs, 5000);            // 单帧最多补 5s（标签页挂起回来不雪崩）
  let fired = 0;
  for (const rec of [...t.timers.values()]) {
    rec.accum += dtMs;
    const delay = rec.delayMs > 0 ? rec.delayMs : 0;
    // delay ≤ 0：官方默认值 ⇒ 每帧一次（不 while 循环，避免 0 延迟把一帧撑爆）
    const times = delay > 0 ? Math.min(64, Math.floor(rec.accum / delay)) : 1;
    if (delay > 0) rec.accum -= times * delay; else rec.accum = 0;
    for (let i = 0; i < times; i++) {
      if (!t.timers.has(rec.id)) break;      // 回调里把自己清了
      try {
        if (rec.ownerRef && rec.ownerRef.setOwner) rec.ownerRef.setOwner(rec.owner || null);
        rec.cb();
        fired++; apiBump('timerFired');
      } catch { /* 官方容错：定时器回调失败不拖垮宿主（与 scene.on('update') 同一条口径） */ }
    }
  }
  return fired;
}
function clearEngineTimer(engine, handle) {
  const t = engine && ENGINE_TIMERS.get(engine);
  if (!t) return false;
  if (handle === undefined || handle === null) return false;
  if (typeof handle === 'function') {
    // 官方"用返回的函数清除"；兼容 `clearInterval(stopFn)` 与 wer-ref 的 id 归一化
    const id = handle.__timerId;
    if (handle.__mpwInterval && id !== undefined) { const had = t.timers.delete(id); if (had) apiBump('timerCleared'); return had }
    try { handle(); apiBump('timerCleared'); return true } catch { return false }
  }
  const had = t.timers.delete(Number(handle));
  if (had) apiBump('timerCleared');
  return had;
}

export function makeSceneRef(objects, hooks) {
  const hk = hooks || {};
  const rawVal = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v);
  const parseV = (s, def) => {
    const v = rawVal(s);
    const p = String(v == null ? '' : v).trim().split(/\s+/).map(Number);
    return new Vec3(p[0] ?? def[0], p[1] ?? def[1], p[2] ?? def[2]);
  };
  const layer = (obj) => ({
    // ①(2026-09-12) thisScene.getLayer(name) / enumerateLayers() 返回的层引用必须与 thisLayer 同一套 API
    //   （上报：`thisScene.getLayer(...).getTextureAnimation is not a function`）。
    getTextureAnimation: () => texAnimRefShared(obj),
    getVideoTexture: () => videoTexRefShared(obj),
    getTransformMatrix: () => transformMatrixShared(obj),
    getParent: () => {
      const p = obj && obj.parent !== undefined && obj.parent !== null ? objList.find((x) => x && x.id === obj.parent) : null
      return p ? layer(p) : layer({ name: '', origin: '0 0 0', scale: '1 1 1', size: '0 0 0', visible: true, id: -1 })
    },
    get visible() { return obj.visible !== false; },
    set visible(v) { obj.visible = !!v; },
    get alignment() { return obj.alignment; },
    set alignment(v) { obj.alignment = v; },
    get size() { return parseV(obj.size, [0, 0, 0]); },
    set size(v) { /* 官方 IEffectLayer.size readonly：与 thisLayer 同一口径（P-137），静默丢弃不抛错 */ },
    get scale() { return parseV(obj.scale, [1, 1, 1]); },
    // ①(P-141) 官方 `ILayer.scale: Vec3`（d.ts L1146-1150）。**原来这里只有 getter** ⇒ 在
    //   `thisScene.createLayer()` 返回的层上写 `bar.scale = new Vec3(...)`（洛茜_07/11 的音频条、
    //   0917/3509243656 的轨迹点）既不报错也不生效（本机沙箱剥掉顶层 'use strict' ⇒ 访问器无 setter
    //   时赋值在非严格模式下静默失败；若是严格模式则会抛，两种都不可接受）⇒ 补**写穿** setter。
    set scale(v) { const p = toXYZShared(v); if (p) nodeWrite(obj, 'scale', `${p[0].toFixed(6)} ${p[1].toFixed(6)} ${p[2].toFixed(6)}`) },
    get origin() { return parseV(obj.origin, [0, 0, 0]); },
    set origin(v) {
      if (v == null) return;
      const x = v.x != null ? v.x : v[0];
      const y = v.y != null ? v.y : v[1];
      const z = v.z != null ? v.z : v[2];
      obj.origin = `${Number(x).toFixed(6)} ${Number(y).toFixed(6)} ${Number(z).toFixed(6)}`;
    },
    // ①(P-141) 官方 `ILayer.angles: Vec3`（d.ts L1150-1153）/ `ILayer.parallaxDepth: Vec2`（L1155-1158）/
    //   `IImageLayer.alpha: Number`（L995-998）/ `IImageLayer.color: Vec3`（L1000-1003）。
    //   这四项是语料在新**建层**上真正会写的（洛茜_11 写 origin/angles/alpha/color/parallaxDepth；
    //   3509243656 写 color/alpha/scale/visible）⇒ 缺了就是"新建层只能看不能动"。
    get angles() { return parseV(obj.angles, [0, 0, 0]); },
    set angles(v) { const p = toXYZShared(v); if (p) nodeWrite(obj, 'angles', `${p[0].toFixed(6)} ${p[1].toFixed(6)} ${p[2].toFixed(6)}`) },
    get parallaxDepth() { return parseV(obj.parallaxDepth, [1, 1, 0]); },
    set parallaxDepth(v) {
      if (v == null) return;
      const x = v.x != null ? v.x : v[0];
      const y = v.y != null ? v.y : (v[1] != null ? v[1] : 0);
      nodeWrite(obj, 'parallaxDepth', `${Number(x) || 0} ${Number(y) || 0}`);
    },
    // ①(P-141) 读也要拆节点：scene.json 里 `alpha` 可能是 `{script,value}` 节点，直接返回会把
    //   节点对象当成数字（旧行为），作者脚本 `bar.alpha + 0.1` 立刻得到 NaN。
    get alpha() { const a = nodeRaw(obj.alpha); return a === undefined || a === null ? 1 : Number(a) },
    set alpha(v) { nodeWrite(obj, 'alpha', Number(v) || 0) },
    get color() { return parseV(obj.color, [1, 1, 1]); },
    set color(v) { const p = toXYZShared(v); if (p) nodeWrite(obj, 'color', `${p[0].toFixed(6)} ${p[1].toFixed(6)} ${p[2].toFixed(6)}`) },
    get name() { return obj.name || ''; },
    get id() { return obj.id; },
    // ①(P-141) 官方 `ILayer extends … ISoundLayer, … IParticleSystem`（d.ts L1139）⇒ 同一个层引用上
    //   就有这批方法。语料 0917/3600630828 的 `thisScene.getLayer('bloom').stop()/play()` 就落在这里
    //   （长注释见文件上方 P-141 块）。`stop` 之前不存在 ⇒ init 抛 "audioLayer.stop is not a function"。
    ...makePlaybackRef(obj),
    // ①(P-141) 官方 `IObject.getAnimation(name?: String): IAnimation`（d.ts L494-499）
    getAnimation: (name) => { apiBump('getAnimation'); return makeAnimationRef(obj, name) },
    // ①(P-141) 语料写法（官方无此成员；官方模型里"本层的粒子系统"就是本层自己）⇒ 返回 IParticleSystem 视图
    getParticleSystem: () => { apiBump('getParticleSystem'); return particleRefFor(obj) },
    get instance() { return particleInstanceOf(obj) },
    clicked: false,
    cursorDetected: false,
  });
  const objList = Array.isArray(objects) ? objects : [];
  // ①(P-141) 层引用 → 场景对象身份表（`getLayerIndex(thisLayer)` 靠它解析；见文件上方 P-141 块）
  const asLayer = (obj) => bindLayerObject(layer(obj), obj);
  const emptyLayer = (name) => asLayer({ name: name || '', origin: '0 0 0', scale: '1 1 1', size: '0 0 0', visible: true, id: -1 });
  // ①(P-141) `IScene.createLayer` 的上限：作者在 0917/3509243656 的脚本注释里自己写明
  //   "WE有最大2048图层限制"；我们照同一个数封顶，超过后**仍然返回可用层引用**（属性齐全、
  //   写入不抛错），只是不再进入 objList/`enumerateLayers()`，并计入 `createLayerReused`（可观测）。
  const MAX_DYNAMIC_LAYERS = 2048;
  let dynSeq = 0;
  return {
    // ①(2026-09-12) 上报错误 "thisScene.enumerateLayers is not a function"（3544152633 的 Clock/
    //   $mediaThumbnail/playerplay 都用它遍历层找 player/媒体层）→ 返回全部层引用。
    enumerateLayers: () => objList.map((o) => asLayer(o)),
    getLayer: (name) => {
      const obj = objList.find((o) => o && o.name === name);
      return obj ? asLayer(obj) : emptyLayer(name);
    },
    getSceneObject: (id) => {
      const obj = objList.find((o) => o && o.id === id);
      return obj ? asLayer(obj) : null;
    },
    /* ①(P-141) `IScene.getLayerIndex(layer: String|ILayer): Number`（d.ts L1288）。
     *   语料（洛茜_07 objects[13] / 洛茜_11 objects[21]）传的是 **`thisLayer`**，也就是
     *   `makeOwnerRef().makeLayer()` 造的那个层引用 —— 它不在 `layer()` 的身份表里，所以还要认
     *   `hooks.ownerLayerRef()/ownerObj()` 这条缝（`applySceneScripts` 把当前 ownerRef 交进来）。
     *   解析不到 ⇒ 返回 **-1**（官方返回 Number；不抛错，并计入 `getLayerIndexUnresolved`）。 */
    getLayerIndex: (layerOrName) => {
      const idxOf = (o) => {
        const i = o ? objList.indexOf(o) : -1;
        if (i >= 0) apiBump('getLayerIndex'); else apiBump('getLayerIndexUnresolved');
        return i;
      };
      if (typeof layerOrName === 'string') return idxOf(objList.find((o) => o && o.name === layerOrName) || null);
      if (typeof layerOrName === 'number') return idxOf(objList[Math.trunc(layerOrName)] || null);
      if (layerOrName && typeof layerOrName === 'object') {
        let o = layerObjectOf(layerOrName);
        if (!o && typeof hk.ownerLayerRef === 'function' && layerOrName === hk.ownerLayerRef()) {
          o = (typeof hk.ownerObj === 'function' ? hk.ownerObj() : null) || null;
        }
        return idxOf(o);
      }
      return idxOf(null);
    },
    /* ①(P-141) `IScene.createLayer(configuration: String|Object|IAssetHandle): ILayer`（d.ts L1278）。
     *   官方文档（docs.wallpaperengine.io/en/scene/scenescript/reference/class/IScene.html）：
     *   "Creates a new layer … Make sure to register the required asset in IEngine or it won't be pushed
     *    to Workshop when publishing"，并明确 configuration 可以是 `engine.registerAsset(file)` 的返回值。
     *   语料两种形态都出现：对象字面量（0917/3509243656 的轨迹点，字段 castshadow/image/origin/color/
     *     alpha/scale/visible）与字符串（洛茜_07/11 的 `'models/bar.json'`）。
     *   字符串形态的归属按 WE 工程目录约定推断（行为对照 wer-ref 的 `normalizeCreateLayerConfig`：
     *     particles/ → 粒子层、models/ → 模型/图片层）：`particles/*.json` → `{particle}`，
     *     其余 `models/*.json` → `{image}`（语料里两个字符串都是内置图片模型）。
     *   返回的层引用是**同一套** `layer()` 面（P-137 的教训：同一个 ILayer 概念不能有两套属性面），
     *   并且写进 `objList` ⇒ `enumerateLayers()/getLayer()/getLayerIndex()` 都能看到它。
     *   ⚠ 已知限制（写在 PATCHES P-141 未证实项）：渲染器的对象表是**场景载入时烘焙**的
     *     （`core/we-scene-bundle.js` 的 `scene.layers`），本批不动 core/ ⇒ 动态层不会上屏。 */
    createLayer: (configuration) => {
      let cfg = configuration;
      if (typeof cfg === 'string') {
        const f = cfg;
        cfg = /^particles\//i.test(f) ? { particle: f } : { image: f };
      } else if (cfg && typeof cfg === 'object' && !Array.isArray(cfg) && typeof cfg.file === 'string') {
        cfg = /^particles\//i.test(cfg.file) ? { particle: cfg.file } : { image: cfg.file };   // IAssetHandle
      }
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) cfg = {};
      const src = Object.assign({}, cfg);
      if (src.origin && typeof src.origin === 'object') src.origin = String(nodeRaw(src.origin));
      if (src.scale && typeof src.scale === 'object') src.scale = String(nodeRaw(src.scale));
      if (src.color && typeof src.color === 'object') src.color = String(nodeRaw(src.color));
      const top = objList.length ? Math.max(...objList.map((o) => (o && Number(o.id)) || 0)) : 0;
      // ①(P-141) 先铺 WE 的**层默认值**再套作者配置：WE 新建层的 origin/scale/angles 是 0/1/0，
      //   缺字段时本文件的 parseV 会给出 0（`Number('')===0` 不是 nullish ⇒ 默认值不生效）——
      //   作者脚本紧跟的 `bar.scale.x` 就会读到 0 而不是 1（乘出来全 0）。铺默认值比改共享 parseV
      //   的默认语义安全（后者会影响 15 个包既有的 thisScene.getLayer 读数）。
      const obj = Object.assign({
        origin: '0.000000 0.000000 0.000000',
        scale: '1.000000 1.000000 1.000000',
        angles: '0.000000 0.000000 0.000000',
        alpha: 1,
        visible: true,
      }, src, { id: top + (++dynSeq), name: src.name || ('__mpw_dyn_' + dynSeq) });
      obj.__dynamic = true;                       // 记号：宿主/诊断可区分"脚本新建的层"
      if (objList.length < MAX_DYNAMIC_LAYERS) { objList.push(obj); apiBump('createLayer'); return asLayer(obj) }
      apiBump('createLayerReused');
      return layer(obj);                          // 超上限：仍给属性齐全的层引用，只是不进场景表
    },
    /* ①(P-141) `IScene.sortLayer(layer: String|Number|ILayer, index: Number): Boolean`（d.ts L1282）。
     *   洛茜_07/11 在 createLayer 之后紧接着 `thisScene.sortLayer(bar, thisIndex)`（官方文档注释：
     *   "Sort layer differently by inserting it at a new index"）—— `getLayerIndex` 修好后这条会**立刻**
     *   变成下一个 "is not a function"（链式暴露），所以同批实现：真在 objList 里搬位置并计数，
     *   解析不到层返回 false（官方 Boolean，不抛错）。 */
    sortLayer: (layerOrName, index) => {
      const want = Math.trunc(Number(index));
      if (!isFinite(want)) return false;
      let o = null;
      if (typeof layerOrName === 'string') o = objList.find((x) => x && x.name === layerOrName) || null;
      else if (typeof layerOrName === 'number') o = objList[Math.trunc(layerOrName)] || null;
      else if (layerOrName && typeof layerOrName === 'object') {
        o = layerObjectOf(layerOrName);
        if (!o && typeof hk.ownerLayerRef === 'function' && layerOrName === hk.ownerLayerRef()) o = (typeof hk.ownerObj === 'function' ? hk.ownerObj() : null) || null;
      }
      const from = o ? objList.indexOf(o) : -1;
      if (from < 0) return false;
      const to = Math.max(0, Math.min(objList.length - 1, want));
      if (to !== from) { objList.splice(from, 1); objList.splice(to, 0, o); }
      apiBump('sortLayer');
      return true;
    },
    /* ①(P-141) `IScene.getInitialLayerConfig(layer: String|Number|ILayer): Object`（d.ts L1292）。
     *   语料 dd/3544152633 的 `thisScene.createLayer(thisScene.getInitialLayerConfig(origbar))` 是
     *   "复制一个已有层"的官方写法；返回该层的**参数快照**（脚本节点只取当前 value），
     *   找不到 ⇒ 返回 null（官方 Object；不抛错）。 */
    getInitialLayerConfig: (layerOrName) => {
      let o = null;
      if (typeof layerOrName === 'string') o = objList.find((x) => x && x.name === layerOrName) || null;
      else if (typeof layerOrName === 'number') o = objList[Math.trunc(layerOrName)] || null;
      else if (layerOrName && typeof layerOrName === 'object') {
        o = layerObjectOf(layerOrName);
        if (!o && typeof hk.ownerLayerRef === 'function' && layerOrName === hk.ownerLayerRef()) o = (typeof hk.ownerObj === 'function' ? hk.ownerObj() : null) || null;
      }
      if (!o) return null;
      const out = {};
      for (const k of Object.keys(o)) {
        if (k === 'script' || k === 'value' || k.startsWith('__')) continue;
        const v = o[k];
        out[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v, (kk, vv) => (kk === 'script' ? undefined : vv))) : v;
      }
      return out;
    },
  };
}

// 当前脚本所属对象代理: thisObject/thisLayer 通过它指向"当前对象",
// 使缓存共享的编译条目在多个对象间不串 (每次 update 前 ownerRef.current 更新)。
function makeOwnerRef() {
  const ref = { current: null };
  const rawVal = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v);
  const parseV = (s, def) => {
    const v = rawVal(s);
    const p = String(v == null ? '' : v).trim().split(/\s+/).map(Number);
    return new Vec3(p[0] ?? def[0], p[1] ?? def[1], p[2] ?? def[2]);
  };
  // ①(P-60) 写入归一化：脚本可以给 origin/scale 赋 Vec3，也可以赋 "x y z" 字符串。
  //   旧 setter 用 `v.x != null ? v.x : v[0]` 取分量 → 字符串会按**字符下标**取值
  //   （'4242 2424 0' → x='4', y='2', z='4' → 静默写成 "4 2 4"，坐标被写坏且无报错）。
  const toXYZ = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') {
      const p = v.trim().split(/\s+/).map(Number);
      if (!p.length || !isFinite(p[0])) return null;
      return [p[0], isFinite(p[1]) ? p[1] : 0, isFinite(p[2]) ? p[2] : 0];
    }
    const x = v.x != null ? v.x : v[0];
    const y = v.y != null ? v.y : v[1];
    const z = v.z != null ? v.z : (v[2] != null ? v[2] : 0);
    if (x == null || !isFinite(Number(x))) return null;
    return [Number(x), isFinite(Number(y)) ? Number(y) : 0, isFinite(Number(z)) ? Number(z) : 0];
  };
  // ①(P-141) 原局部 `animRef` 提到模块级 `animRefShared`（`getAnimation()` 与 `getAnimationLayer()`
  //   共用同一份，避免两处漂移）；语义逐位不变。
  const animRef = (obj) => animRefShared(obj);
  // ①(2026-09-12) 行向量 4x4（平移在 [12],[13],[14]）：脚本用 `.m[13]` 判断"层在屏幕上半/下半"
  //   （3326873240 Clock Container: `parent.getTransformMatrix().m[13] > engine.canvasSize.y / 2`）
  // 复用模块级共享实现（thisScene 的层引用用同一份，避免两处漂移）
  const transformMatrixOf = (obj) => transformMatrixShared(obj)
  // ①(2026-09-12) getParent() 必须返回**可继续链式调用**的图层引用（脚本里 parent.getParent()/
  //   parent.getTransformMatrix() 都有用到）；找不到父级时返回安全空引用而不是抛错。
  const emptyLayerRef = () => {
    const self = {
      getTransformMatrix: () => transformMatrixOf(null),
      getParent: () => self,
      getTextureAnimation: () => texAnimRef(null),
      getVideoTexture: () => videoTexRefShared(null),
      getAnimationLayer: () => animRef(null),
      // ①(P-141) 空层引用也要有完整 ILayer 面（官方 IObject.getAnimation / ISoundLayer / IParticleSystem）
      ...makePlaybackRef(null),
      getAnimation: (name) => { apiBump('getAnimation'); return makeAnimationRef(null, name) },
      getParticleSystem: () => { apiBump('getParticleSystem'); return particleRefFor(null) },
      get instance() { return particleInstanceOf(null) },
      get visible() { return true }, set visible(v) {},
      get origin() { return new Vec3(0, 0, 0) }, set origin(v) {},
      get scale() { return new Vec3(1, 1, 1) }, set scale(v) {},
      get size() { return new Vec3(0, 0, 0) }, set size(v) {},
      get name() { return '' }, get id() { return -1 },
      clicked: false, cursorDetected: false,
    }
    return self
  }
  // ①(2026-09-12) 纹理动画句柄（`thisLayer.getTextureAnimation()`）：脚本用 stop()/setFrame()/play()
  //   驱动精灵表帧（3326873240 的 dragAndDropToggle/clockHideToggle）。帧号写进 obj.__texFrame，
  //   渲染器侧若看到该字段就优先用它（否则按时间自动推进）。
  const texAnimRef = (obj) => texAnimRefShared(obj)
  const layerRefFor = (obj) => {
    if (!obj) return emptyLayerRef()
    const parentObj = (obj.parent !== undefined && obj.parent !== null && ref.byId) ? ref.byId.get(obj.parent) : null
    return bindLayerObject(Object.assign(Object.create(null), emptyLayerRef(), {
      getTransformMatrix: () => transformMatrixOf(obj),
      getParent: () => layerRefFor(parentObj),
      getTextureAnimation: () => texAnimRef(obj),
      getVideoTexture: () => videoTexRefShared(obj),
      // ①(P-141) 同一套 ILayer 面（见文件上方 P-141 块）：IObject.getAnimation / ISoundLayer / IParticleSystem
      ...makePlaybackRef(obj),
      getAnimation: (name) => { apiBump('getAnimation'); return makeAnimationRef(obj, name) },
      getParticleSystem: () => { apiBump('getParticleSystem'); return particleRefFor(obj) },
      get instance() { return particleInstanceOf(obj) },
      get visible() { return obj.visible !== false },
      set visible(v) { obj.visible = !!v },
      get origin() { return parseV(obj.origin, [0, 0, 0]) },
      set origin(v) { if (v == null) return; obj.origin = `${Number(v.x != null ? v.x : v[0]).toFixed(6)} ${Number(v.y != null ? v.y : v[1]).toFixed(6)} ${Number(v.z != null ? v.z : v[2] || 0).toFixed(6)}` },
      get scale() { return parseV(obj.scale, [1, 1, 1]) },
      set scale(v) { if (v == null) return; obj.scale = `${Number(v.x != null ? v.x : v[0]).toFixed(6)} ${Number(v.y != null ? v.y : v[1]).toFixed(6)} ${Number(v.z != null ? v.z : v[2] || 0).toFixed(6)}` },
      get size() { return parseV(obj.size, [0, 0, 0]) },
      set size(v) { if (v == null) return; obj.size = `${Number(v.x != null ? v.x : v[0]).toFixed(6)} ${Number(v.y != null ? v.y : v[1]).toFixed(6)} ${Number(v.z != null ? v.z : v[2] || 0).toFixed(6)}` },
      get name() { return obj.name || '' },
      get id() { return obj.id },
      get alpha() { return obj.alpha === undefined ? 1 : Number(obj.alpha) },
      set alpha(v) { obj.alpha = v },
      clicked: false, cursorDetected: false,
    }))
  }
  // ①(P-60 2026-09-14 第1项时钟错位根因) **必须每次属性访问时重新读 ref.current**：
  //   旧实现把 `const obj = ref.current` 写在工厂函数体开头，而 makeLayer()/makeObject() 在
  //   compileScript 里**只调用一次**（编译期），编译结果又按脚本源缓存 → 捕获到的是"编译那一刻"
  //   ref.current，即**上一个脚本节点 setOwner 留下的对象**。后果：每个"首次编译的脚本属性"
  //   都拿错 thisLayer/thisObject（真机 3554161528 时钟层 id398 的 origin 脚本把 id1592 的
  //   origin 2833.34644,1378.56702 写进了自己 → 时钟跑到歌曲名位置；Δ1638 疑案）。
  //   同一层的第 2/3 个脚本属性因为编译时 ref.current 恰好已是本层而"看起来正常"，所以极难发现。
  //   修法：cur() 惰性取值，所有 getter/setter 内联调用。
  const layerRef = () => {
    const cur = () => ref.current;
    return {
      getAnimationLayer: (i) => animRef(cur()),
      getParent: () => { const obj = cur(); return layerRefFor(obj && ref.byId ? ref.byId.get(obj.parent) : null) },
      getTransformMatrix: () => transformMatrixOf(cur()),
      getTextureAnimation: () => texAnimRef(cur()),
      getVideoTexture: () => videoTexRefShared(cur()),
      // ①(P-141) 官方 `IObject.getAnimation(name?: String): IAnimation`（d.ts L494-499）——
      //   语料 3 个包（0917/3448877775 与两份夜莺 alone_孤独の少女）在 init 里
      //   `animation = thisLayer.getAnimation()`，缺了它就是 "init:thisLayer.getAnimation is not a function"。
      //   `objectRef().getAnimation` 早就有（同源）；这里补的是 thisLayer 那一半。
      getAnimation: (name) => { apiBump('getAnimation'); return makeAnimationRef(cur(), name) },
      // ①(P-141) 语料 `thisLayer.getParticleSystem()`（官方无此成员）：按官方模型
      //   "ILayer 自己就是 IParticleSystem"（d.ts L1139）返回**本层的粒子系统视图**。
      getParticleSystem: () => { apiBump('getParticleSystem'); return particleRefFor(cur()) },
      // ①(P-141) 官方 `IParticleSystem.instance`（d.ts L984）—— 与 getParticleSystem().instance 同一对象
      get instance() { return particleInstanceOf(cur()) },
      // ①(P-141) 官方 `ISoundLayer`（d.ts L744-771）的 play/pause/stop/isPlaying 四项。
      //   ⚠ 必须**惰性取 cur()**：编译期 ref.current 还是上一个脚本节点的对象（P-60 的根因），
      //   所以这四个不能像普通字段那样在工厂函数体里一次性绑定对象。
      play() { apiBump('play'); const o = cur(); if (o) { try { PLAYBACK_STATE.set(o, true) } catch { /* ignore */ } } },
      pause() { apiBump('pause'); const o = cur(); if (o) { try { PLAYBACK_STATE.set(o, false) } catch { /* ignore */ } } },
      stop() { apiBump('stop'); const o = cur(); if (o) { try { PLAYBACK_STATE.set(o, false) } catch { /* ignore */ } } },
      isPlaying() { apiBump('isPlaying'); const o = cur(); try { return o ? !!PLAYBACK_STATE.get(o) : false } catch { return false } },
      emitParticles(count) {
        apiBump('emitParticles');
        const o = cur(); const n = Math.max(0, Math.trunc(Number(count)) || 1);
        if (o) { try { o.__psEmitRequest = (o.__psEmitRequest | 0) + n } catch { /* ignore */ } }
      },
      get visible() { const obj = cur(); return obj ? obj.visible !== false : true; },
      set visible(v) { const obj = cur(); if (obj) obj.visible = !!v; },
      get origin() { const obj = cur(); return obj ? parseV(obj.origin, [0, 0, 0]) : new Vec3(0, 0, 0); },
      set origin(v) {
        const obj = cur(); const p = toXYZ(v);
        if (!obj || !p) return;
        obj.origin = `${p[0].toFixed(6)} ${p[1].toFixed(6)} ${p[2].toFixed(6)}`;
      },
      get scale() { const obj = cur(); return obj ? parseV(obj.scale, [1, 1, 1]) : new Vec3(1, 1, 1); },
      set scale(v) {
        const obj = cur(); const p = toXYZ(v);
        if (!obj || !p) return;
        obj.scale = `${p[0].toFixed(6)} ${p[1].toFixed(6)} ${p[2].toFixed(6)}`;
      },
      // ①(P-137) `thisLayer.size`（IEffectLayer.size，官方 Vec2 / readonly）：长注释见 sizeOf 定义处
      get size() { return sizeOf(cur()); },
      set size(v) { /* 官方 readonly：静默丢弃而不抛错，理由见 sizeOf 上方注释 */ },
      get alpha() { const obj = cur(); return obj ? (obj.alpha != null ? obj.alpha : 1) : 1; },
      set alpha(v) { const obj = cur(); if (obj) obj.alpha = Number(v); },
      get name() { const obj = cur(); return obj ? obj.name || '' : ''; },
      get id() { const obj = cur(); return obj ? obj.id : 0; },
      cursorDetected: false,
      clicked: false,
    };
  };
  /* ①(P-137 2026-09-19 用户第 8 项) `thisLayer.size` / `thisObject.size`：**上一次缺失的读取器**
   *
   * ── 现场（真机手动上报，`$MPW_ROOT/reports/r<ts>.json`）────────────────────────────────
   *   · `r1789751541247.json` 包 3327063360：`subsystems.scriptErrs = ["update:Cannot read
   *     properties of undefined (reading 'x')×511"]`（511 帧 = 每帧一次）；
   *   · `r1789751395466.json` 包 3660962877：同一条错 ×72；第三个包（3719111841）无此错。
   *   出错的**就是** `.size`：两包的脚本分别是
   *     `3327063360` objects[50].scale : `value.x = width / (thisLayer.size.x * initScale.x) * initScale.x;`
   *     `3660962877` objects[122].origin: `let imageSize = thisLayer.size; imageSize.x *= scale.x * 0.5;`
   *   全语料静态扫描（98 容器 / 37 个带脚本的包）里 `thisLayer.size` 共 **73 次**读取、分布在 11 个包，
   *   修复前**每一个**都在第 1 帧抛这条 TypeError —— 也就是用户看到的"一堆错"。
   *
   * ── 官方语义出处（一手）────────────────────────────────────────────────────────────────
   *   `$MPW_ROOT/wallpaper_engine/ui/dist/monaco/autocomplete/lib.sceneScript.d.ts`
   *     · L775-795 `interface IEffectLayer` 的 `readonly size: Vec2`，其上方文档注释逐字为
   *       "Resolution of the image layer in pixels. Only read this, do not write."
   *     · L1139 `interface ILayer extends IObject, IImageLayer, ISoundLayer, IEffectLayer, …`
   *       ⇒ `size` 是 `ILayer`（L1242 `declare let thisLayer: ILayer`）的**合法成员**。
   *   官方文档：https://docs.wallpaperengine.io/scene/scenescript/reference/class/ILayer
   *   行为对照（只读结论、不抄代码）：第三方参考实现 wer-ref
   *   `src/backend/scene/internal/scenescript/WPSceneScriptHost.cpp:437`
   *   `if (property_name == "size") return { WPDynamicValue::Type::Float2, true };`（size 是二维量）。
   *
   * ── 我们为什么给成 undefined（根因）────────────────────────────────────────────────────
   *   `makeOwnerRef()` 的 `layerRef()`（= 沙箱里的 `thisLayer`）与 `objectRef()`（= `thisObject`）
   *   是**对象字面量**，此前只声明了 origin/scale/alpha/name/id/visible…，**从来没有 `size` 这个键**；
   *   同文件的 `emptyLayerRef()`（空引用）与 `layerRefFor()`（thisScene.getLayer 返回的层）都**有** size
   *   —— 于是"同一个 ILayer 概念"在本文件里有两套属性面：缺的那套读出来是 `undefined`，
   *   作者脚本紧跟的 `.x` 就抛 `Cannot read properties of undefined (reading 'x')`，每帧一次。
   *
   * ── 为什么返回 Vec3（官方写的是 Vec2）与 setter 的口径 ────────────────────────────────
   *   · 读取统一走本文件既有的 `parseV` 口径（origin/scale/size 同一个函数、同一个 Vec3 返回类型，
   *     `emptyLayerRef()`/`layerRefFor()` 的 size 本来就是 Vec3）⇒ 不引入第二套"二维/三维"分叉；
   *     Vec3 是 Vec2 的**超集**（.x/.y 同值，.z = 0 而**不是** undefined），作者脚本哪怕读 size.z
   *     也不会新造一个 TypeError。场景里 size 字符串本身就只有两段（`"1206.00000 512.00000"`），
   *     `parseV` 的 `p[2] ?? def[2]` 自然补 0。
   *   · setter 是**存在但不落盘**的 no-op：官方 d.ts 标注 `readonly` + "Only read this, do not write"；
   *     而**只写 getter** 会让访问器没有 setter ⇒ 作者脚本（绝大多数 `'use strict'`）里
   *     `thisLayer.size = …` 由"静默成功（在普通对象上新建自有属性）"变成 **TypeError**，
   *     那是比"写入无效"更重的行为改变，所以宁可静默丢弃（size 由纹理/文本布局决定，渲染侧不读它）。
   *   · ⚠ 已知口径差异（记在 PATCHES P-137 未证实项）：`layerRefFor()` 的 `set size` 目前是**写穿**
   *     `obj.size`。同一 ILayer 概念两处 setter 语义不同，本批**不改它**（与本条 bug 无关、改动有回归面），
   *     留给后续单独定夺。 */
  const sizeOf = (obj) => parseV(obj ? obj.size : null, [0, 0, 0])
  // ①(P-60) 同 layerRef：惰性取 ref.current（编译期快照 = 上一个脚本节点的对象）
  const objectRef = () => {
    const cur = () => ref.current;
    return {
      getMaterial: () => ({}),
      // ①(P-141) `objectRef().getAnimation` 此前返回 `animRef`（IAnimationLayer 的 no-op 面）。
      //   官方 `IObject.getAnimation` 的返回类型是 **IAnimation**（d.ts L494-499）⇒ 换成
      //   `makeAnimationRef`：它是 `animRefShared` 的**超集**（原有 setVisible/setRate/… 全在），
      //   所以既有调用（语料 11 个包用 thisObject.getAnimation()）一个都不少，只是多出官方 IAnimation 面。
      getAnimation: (name) => { apiBump('getAnimation'); return makeAnimationRef(cur(), name) },
      get origin() { const obj = cur(); return obj ? parseV(obj.origin, [0, 0, 0]) : new Vec3(0, 0, 0); },
      set origin(v) { const obj = cur(); const p = toXYZ(v); if (obj && p) obj.origin = `${p[0]} ${p[1]} ${p[2]}`; },
      get scale() { const obj = cur(); return obj ? parseV(obj.scale, [1, 1, 1]) : new Vec3(1, 1, 1); },
      set scale(v) { const obj = cur(); const p = toXYZ(v); if (obj && p) obj.scale = `${p[0]} ${p[1]} ${p[2]}`; },
      // ①(P-137) `thisObject.size`：与 thisLayer 同一个 ILayer 概念（属性绑定的对象就是该层），
      //   同一份 sizeOf 读取器 —— 缺了它，把 size 写在 thisObject 上的作者脚本会掉进同一条 TypeError。
      get size() { return sizeOf(cur()); },
      set size(v) { /* 官方 readonly：静默丢弃而不抛错，理由见 sizeOf 上方注释 */ },
      get visible() { const obj = cur(); return obj ? obj.visible !== false : true; },
      set visible(v) { const obj = cur(); if (obj) obj.visible = !!v; },
      get name() { const obj = cur(); return obj ? obj.name || '' : ''; },
      get id() { const obj = cur(); return obj ? obj.id : 0; },
    };
  };
  // ①(P-141) `thisLayer` 那个**层引用实例**（`compileScript` 只调用一次 `makeLayer()`）：
  //   `thisScene.getLayerIndex(thisLayer)` 需要把"层引用对象"还原成 `scene.objects` 里的对象，
  //   而 ownerRef 的引用是惰性绑定 `ref.current` 的，所以这里把**实例**暴露出去，
  //   由 `applySceneScripts` 通过 `makeSceneRef(objects, { ownerLayerRef, ownerObj })` 传进来。
  let layerRefInstance = null;
  return {
    ref,
    makeLayer: () => (layerRefInstance || (layerRefInstance = layerRef())),
    makeObject: objectRef,
    layerRefObj: () => layerRefInstance,
    setOwner(o) { ref.current = o; },
  };
}

// ①(P-121 A) 沙箱 `console` 门面：**每个沙箱一个独立对象**，脚本里 `console.log = () => {}`
//   只改这个门面，宿主进程/宿主页面的真 `console` 一个属性都不动。
//
// 现场（P-120 交付里记录的原始观察 + 本次逐字节复核）：
//   `allwallpaper/0917/3462491575/scene.pkg` 的作者脚本正文含
//     `if (!isRunningInEditor) {\n\tconsole.log = () => { }`（脚本节点 1 个，实测命中）
//   而沙箱（`elysia/nsl.js` 的 `new Function` + `with (ctx)`，浏览器/Node 同一份实现）此前把
//   `context.console` 直接指向**宿主真 console 对象** ⇒ 跑过这个包之后宿主进程的 `console.log`
//   被全局改写成空函数（复现：本文件改动前 `applySceneScripts()` 一趟后 `console.log === before`
//   为 false、且宿主再 log 什么都不输出），旁证是 `tests/camera-script-origin-probe.mjs` 里
//   专门为它写的 `muteConsole` 规避。
//
// 语义（三条都钉在 `tests/script-sandbox-globals-test.mjs`）：
//   · 写：只落到门面自己（作者"把 console 静音"的意图在**它自己的沙箱内**照常生效）；
//   · 读：转发到**当前**宿主 `console` 的同名方法 —— 调用时按名字重取，所以
//     `demo.html:929-931` 把 `console.warn/error` 桥到页面 `#log` 面板之后，沙箱日志照样进 #log；
//     Node 侧则照常进 stdout（**日志不被沙箱吞掉**）。
//   · 门面绝不能被冻结：作者脚本 `'use strict'` 下 `console.log = …` 若抛 TypeError，
//     整个脚本会加载失败（那是比"静音"更重的行为改变）。
function makeSandboxConsole() {
  const own = Object.create(null);   // 脚本自己写过的键（含"作者把 console.log 静音"）
  const fwd = new Map();             // 复用转发函数：`console.log === console.log` 保持稳定
  const hostConsole = () => { try { return (typeof console !== 'undefined' && console) ? console : null; } catch (e) { return null; } };
  return new Proxy(own, {
    get(t, p) {
      if (p in t) return t[p];                       // 脚本写过的（例如静音函数）优先
      const h = hostConsole();
      if (!h) return undefined;
      const v = h[p];
      if (typeof v !== 'function') return v;
      let f = fwd.get(p);
      if (!f) {
        f = (...args) => {                            // 调用时再取一次 ⇒ 宿主替换 console.* 也跟得上
          try {
            const hh = hostConsole();
            const fn = hh ? hh[p] : null;
            if (typeof fn === 'function') return fn.apply(hh, args);
          } catch (e) { /* 日志失败不影响脚本/宿主 */ }
          return undefined;
        };
        fwd.set(p, f);
      }
      return f;
    },
    set(t, p, v) { try { t[p] = v } catch (e) { /* 冻结/只读 ⇒ 静默（宿主 console 不受影响） */ } return true; },
    has(t, p) { const h = hostConsole(); return (p in t) || !!(h && (p in h)); },
  });
}

// ①(P-121 A③) 宿主**进程句柄**这一类全局：WE 运行时不提供、浏览器里本来就不存在 ——
//   而 `elysia/nsl.js` 的 `with (ctx)` 只遮蔽 ctx 上**有**的键，`new Function` 的兜底作用域是
//   Node 的**进程全局** ⇒ 不显式 shadow 的话脚本能直接摸到 `process`/`Buffer`/`global`
//   （脚本写 `process.exitCode = 1` 之类就是宿主级副作用）。显式 shadow 成 `undefined` =
//   「浏览器里本来就没有这些标识符」这一事实，Node 侧从此与浏览器/WE 运行时同形。
//   语料实测：11 个 dd 包正文里 `typeof process` = 0 命中（`Buffer` 命中都是 `MpwBuffer`/
//   `vertexBuffer` 一类名字，不是 Node 全局），所以这条 shadow 不改变任何语料行为。
const SANDBOX_HOST_ONLY_GLOBALS = {
  process: undefined, require: undefined, module: undefined, exports: undefined, Buffer: undefined, global: undefined,
};

// 编译脚本: 返回 { update, applyUserProperties, init, ... } 函数 (vm 沙箱)
// opts: { canvasSize, userProps, shared, thisScene, ownerRef, runtime }
//
// ①(P-127 A①) **逐名映射**官方 scene-script 模块 —— 旧实现是
//   `mod === 'WEMath' ? '__WEMath' : '__WEColor'`：**除 WEMath 外的一切模块名**（含官方 `WEVector`）
//   都被静默别名成 `__WEColor` ⇒ `WEVector.angleVector2` 是 undefined ⇒ 脚本抛
//   "WEVector.angleVector2 is not a function"。现在：**每个模块名一条自己的映射**，
//   官方三模块（`WEMath`/`WEVector`/`WEColor`）各自的命名空间与官方导出面同形；
//   表外的未知模块名 → `__WEEmptyModule`（空命名空间：属性读取得到 undefined、**不再兜底到 WEColor**）。
//   模块清单来自**全语料实测**（98 个 .pkg/.mpkg 容器内全部 scene.json，共 3 个名字：
//   `WEMath` 60 次 / `WEVector` 57 次 / `WEColor` 3 次）——见 tests/script-wevector-module-test.mjs 的 V1。
//   命名空间落点：`WEMath` → `__WEMath`（官方 4 名 + 既有超集别名）；`WEVector` → `__WEVector`；
//   `WEColor` → `__WEColor`（既有对象 + 官方 normalizeColor/expandColor）。
export const NSL_MODULE_GLOBALS = {
  WEMath: '__WEMath',
  WEVector: '__WEVector',
  WEColor: '__WEColor',
};
// 表外模块名落点：空命名空间。**故意不是 `__WEColor`** —— 别名到 WEColor 会把
// "模块不存在"变成"函数不存在"，且会让 `X.mix` 之类**看似可用**（静默错值比报错更难查）。
export const NSL_UNKNOWN_MODULE_GLOBAL = '__WEEmptyModule';
export function moduleGlobalFor(mod) {
  return Object.prototype.hasOwnProperty.call(NSL_MODULE_GLOBALS, mod)
    ? NSL_MODULE_GLOBALS[mod]
    : NSL_UNKNOWN_MODULE_GLOBAL;
}
function compileScript(source, opts = {}) {
  // 转译 ESM 导入/导出为 CommonJS
  let code = source;
  code = code.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, (m, name, mod) => {
    return `const ${name} = ${moduleGlobalFor(mod)};`;
  });
  code = code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g, (m, names, mod) => {
    const src = moduleGlobalFor(mod);
    return `const { ${names} } = ${src};`;
  });
  // ①(修复 2026-09-12 "翻译错误") 旧实现把 `export function X(...)` 改成 `__exports.X = function (...)` ——
  //   这是**函数表达式**，作用域里**没有** X 这个绑定：脚本内部自调 `X()`（例：3544152633
  //   的 init 里调 logTracks()）会抛 "X is not defined"。同理 `export let/const X = ...` 也被改成
  //   纯属性赋值 → 脚本内部引用 X 报未定义。现在**保留声明**，只追加导出登记。
  const exported = [];
  code = code.replace(/export\s+function\s+([\w$]+)\s*\(/g, (m, n) => { exported.push(n); return `function ${n}(`; });
  code = code.replace(/export\s+var\s+scriptProperties\s*=\s*([^;]+);/g, '__scriptProps = $1;');
  code = code.replace(/export\s+let\s+([\w$]+)\s*=\s*([^;]+);/g, (m, n, v) => { exported.push(n); return `let ${n} = ${v};`; });
  code = code.replace(/export\s+const\s+([\w$]+)\s*=\s*([^;]+);/g, (m, n, v) => { exported.push(n); return `const ${n} = ${v};`; });
  if (exported.length) code += '\n' + exported.map((n) => `__exports.${n} = ${n};`).join('\n') + '\n';
  code = code.replace(/export\s*\{([^}]+)\}/g, (m, names) => {
    return names.split(',').map((n) => {
      const nn = n.trim();
      const [orig, alias] = nn.includes(' as ') ? nn.split(' as ').map((s) => s.trim()) : [nn, nn];
      return `__exports.${alias} = ${orig};`;
    }).join('\n');
  });
  // scriptProperties 使用: 脚本内 `scriptProperties.x` 需指向构建的属性对象
  code = code.replace(/\bscriptProperties\b/g, '__scriptProperties');
  const shared = opts.shared || {};
  const ownerRef = opts.ownerRef || makeOwnerRef();
  // ①(P-127 A①) `scriptProperties` 的**活引用槽**：脚本顶层写法
  //   `const props = scriptProperties;`（语料实测**只有洛茜_11 这一处**）在 `vm.runInContext`
  //   期间求值，而属性值要等脚本自己声明完 `createScriptProperties()...finish()` 才拿得到 ——
  //   旧实现先给 `__scriptProperties = null`、run 完才赋值 ⇒ 顶层捕获恒为 **null** ⇒
  //   脚本首个 `props.xxx` 就抛 "Cannot read properties of null"，`init` 直接失败、实例被永久禁用
  //   （**这一条正好把洛茜_11 的 WEVector 缺陷挡在后面**：见 PATCHES P-127 的"先抛/后抛"实测）。
  //   官方运行时里 `scriptProperties` 是引擎提供的**活对象**，顶层捕获拿到的是同一个引用；
  //   这里把槽预先建好，属性值算出来后**写进同一个对象**，顶层捕获因此不再是 null。
  const scriptPropsSlot = {};
  const context = {
    __WEColor: WEColor,
    // ①(P-127 A①) 官方 WEVector 模块命名空间（独立实现见 scene-script-apis.js）
    __WEVector: WEVector,
    // ①(P-127 A①) 表外模块名的落点：空命名空间（读取得到 undefined，不别名到任何真模块）
    __WEEmptyModule: Object.freeze(Object.create(null)),
    // NSL WEMath 模块 (脚本 import * as WEMath from 'WEMath')
    __WEMath: {
      mix: (a, b, t) => a + (b - a) * t,
      lerp: (a, b, t) => a + (b - a) * t,
      clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
      smoothstep: (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1))); return t * t * (3 - 2 * t); },
      smoothStep: (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1))); return t * t * (3 - 2 * t); },
      // 角度换算 (733 Lens Flare 等用 WEMath.rad2deg; 缺失 → angles NaN → 组件渲染异常)
      // ①(P-127 A①) 与 `WEVector` 共用同一对常数（scene-script-apis.js 的 DEG2RAD/RAD2DEG）
      rad2deg: RAD2DEG,
      deg2rad: DEG2RAD,
      min: Math.min,
      max: Math.max,
      abs: Math.abs,
      floor: Math.floor,
      ceil: Math.ceil,
      pow: Math.pow,
      sqrt: Math.sqrt,
      sin: Math.sin,
      cos: Math.cos,
      PI: Math.PI,
    },
    __exports: {},
    __scriptProps: null, // export var scriptProperties = ... 写入
    __scriptProperties: scriptPropsSlot, // 脚本内 scriptProperties 引用（①P-127 A① 活槽，见上）
    // ①(P-127 A①) `scriptProperties` 一旦被 `const props = scriptProperties` 在**顶层**捕获，
    //   捕获到的是上面那个活槽对象 —— 槽必须在 run 之前就存在（否则捕获 null）。
    __scriptPropsSlot: scriptPropsSlot,
    Date, Math, JSON, Number, String, Boolean, Object, Array, Set, Map, Promise,
    // ①(P-121 A) `console` 换成**每沙箱一个**的门面（见 makeSandboxConsole）：脚本对 console 的
    //   写（含 `console.log = () => {}`）不再落到宿主的真 console 对象上；正常日志照旧转发到宿主。
    console: makeSandboxConsole(),
    // ①(P-121 A③) 宿主进程句柄显式 shadow（同一处真相：SANDBOX_HOST_ONLY_GLOBALS 的注释）
    ...SANDBOX_HOST_ONLY_GLOBALS,
    parseFloat, parseInt, isNaN, isFinite, Infinity, NaN, undefined,
    Vec3,
    Vec2,   // ①(2026-09-12) 上报错误 "Vec2 is not defined" → 补进沙箱
    // NSL 数学工具 (726 Launcher 等用 WEMath.mix/clamp/smoothStep)
    WEMath: {
      mix: (a, b, t) => a + (b - a) * t,
      clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
      smoothstep: (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1))); return t * t * (3 - 2 * t); },
      smoothStep: (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a || 1))); return t * t * (3 - 2 * t); },
      rad2deg: RAD2DEG,
      deg2rad: DEG2RAD,
      min: Math.min,
      max: Math.max,
      abs: Math.abs,
    },
    // 鼠标/输入 (本地无鼠标 → 画布中心, 静止): NSL Dock 逻辑 (715 L126
    // input.cursorWorldPosition) 缺失 → update 抛错 → shared 值不计算
    input: {
      cursorWorldPosition: new Vec3((opts.canvasSize || { x: 3840 }).x / 2, (opts.canvasSize || { y: 2160 }).y / 2, 0),
      // ①(P-141) 官方 `IInput.cursorScreenPosition: Vec2`（d.ts L1385-1388
      //   "Position of the cursor on the screen in pixels."）。**上一个缺口修完后立刻暴露的下一个**：
      //   0917/3509243656 的 objects[8] 在 `getTrailPoint()`（曾抛 createLayer）之后走到
      //   `input.cursorScreenPosition.x` ⇒ 新 TypeError。本机无鼠标 ⇒ 屏幕坐标也取**画布中心**
      //   （与 cursorWorldPosition 同一口径：静止的鼠标在正中），是数值而不是 undefined。
      cursorScreenPosition: new Vec2((opts.screenResolution || opts.canvasSize || { x: 3840 }).x / 2, (opts.screenResolution || opts.canvasSize || { y: 2160 }).y / 2),
      // ①(P-141) 官方 `IInput.cursorLeftDown: Boolean`（d.ts L1390-1393）：同一接口的第三个成员，
      //   语料暂无使用者，但"接口成员缺失 ⇒ 读到 undefined"正是本批要收的错类 ⇒ 一并给 false。
      cursorLeftDown: false,
      cursorDelta: new Vec3(0, 0, 0),
      cursorVelocity: 0,
      mousePressed: false,
      mouseDelta: new Vec3(0, 0, 0),
    },
    // ①(P-127 A①) 把活槽交给构建器：属性值在链式声明执行时就逐个写进槽，
    //   于是声明之后的**顶层**读取拿到真值（不再是要等 run 结束才赋值的 null）。
    createScriptProperties: () => new ScriptPropertiesBuilder(opts.userProps, scriptPropsSlot),
    // ①(2026-09-12) 上报错误 "MediaPlaybackEvent is not defined"（3326873240 的
    //   mediaPlaybackChanged(event) 用 event.state !== MediaPlaybackEvent.PLAYBACK_STOPPED）
    //   → 提供枚举常量（无媒体集成时宿主不会回调，层保持 authored 可见性）。
    MediaPlaybackEvent: { PLAYBACK_STOPPED: 0, PLAYBACK_PLAYING: 1, PLAYBACK_PAUSED: 2, PLAYBACK_UNKNOWN: -1 },
    // ①(修复 2026-09-12) WE 的 localStorage 是**脚本 API**（get/set/remove/has/clear），
    //   与浏览器 Storage（getItem/setItem）不同名。此前沙箱里根本没有它：
    //     · 浏览器里标识符落到页面真实 localStorage → `localStorage.get is not a function`
    //       （真机上报：3554161528 / 3326873240 "init:localStorage.get is not a function"×N）
    //     · Node 里 undefined → 脚本 init 直接抛错
    //   这里提供沙箱内存实现（两种命名都支持）：脚本可正常读写，且**不碰**宿主页面的存储。
    localStorage: (() => {
      const m = new Map();
      const get = (k, dflt) => (m.has(String(k)) ? m.get(String(k)) : (dflt !== undefined ? dflt : null));
      return {
        get, set: (k, v) => { m.set(String(k), v); }, remove: (k) => { m.delete(String(k)); },
        has: (k) => m.has(String(k)), clear: () => m.clear(),
        getItem: (k) => get(k), setItem: (k, v) => { m.set(String(k), v); }, removeItem: (k) => { m.delete(String(k)); },
      };
    })(),
    // thisScene: NSL 场景引用 — getLayer(name) 返回图层包装 (读写真实场景对象)
    thisScene: opts.thisScene || makeSceneRef([]),
    // ①(P-41 A4 2026-09-13) `scene` 全局（日月循环 3326873240 实锤）：作者脚本（非 NSL 标准）
    //   用 `scene.getLayer(...)` + `scene.on("update", cb)` + `scene.timeVarying` 控制
    //   "实心占位层的显隐"（timeVarying=运行时在跑时间驱动内容 → 隐藏占位白层）。
    //   旧宿主三缺一 → 脚本 init 抛 ReferenceError 永久禁用 → 占位层保持 authored 可见
    //   → 整屏白块盖住主题。这里提供 scene = thisScene + on() + timeVarying（默认 true =
    //   官方运行时语义；`opts.timeVarying` 可显式覆盖）。update 回调在每次 update 趟末尾触发。
    scene: (() => {
      const base = opts.thisScene || makeSceneRef([]);
      const cbs = [];
      const ref = {
        enumerateLayers: base.enumerateLayers,
        getLayer: base.getLayer,
        getSceneObject: base.getSceneObject,
        on: (ev, cb) => { if (typeof cb === 'function') cbs.push(cb); return base },
        get timeVarying() { return opts.timeVarying !== undefined ? !!opts.timeVarying : true },
        set timeVarying(v) { if (opts) opts.timeVarying = !!v },
        __fireUpdate: () => { for (const cb of cbs) { try { cb() } catch { /* 官方容错：回调失败不拖垮宿主 */ } } },
      }
      return ref
    })(),
    engine: {
      // ①(P-141) `engine.registerAsset(file): IAssetHandle`（d.ts L1523 + 官方文档 IEngine 一节：
      //   "Reference the image model config file from `models` directory in the registerAsset call"
      //    并给出 `thisScene.createLayer(engine.registerAsset('models/x.json'))` 的官方用法）
      //   ⇒ 返回值必须带上 `file`，否则 createLayer(handle) 只能拿到一个空壳。
      //   旧实现返回 `{getAsset:()=>null}`（无 file）—— `createLayer(handle)` 会退化成空配置层。
      registerAsset: (file) => ({ file: String(file == null ? '' : file), getAsset: () => null }),
      canvasSize: opts.canvasSize || { x: 3840, y: 2160 },
      // ①(P-141) 官方 `IEngine.screenResolution: Vec2`（d.ts L1548-1551 "Screen resolution in pixels."）
      //   —— 语料 0917/3509243656 的鼠标视角脚本用 `engine.screenResolution.x/2` 归一化光标；
      //   缺了它 ⇒ `undefined.x` ⇒ 正是本批要收的 "reading 'x'"。宿主没给就与 canvasSize 同值
      //   （本地无真实窗口，这是唯一可用的"屏幕像素"口径），保证读到的是数字。
      screenResolution: opts.screenResolution || opts.canvasSize || { x: 3840, y: 2160 },
      runtime: opts.runtime || 0,
      frametime: opts.frametime || 1 / 60,
      userProperties: opts.userProps || {},
      // NSL 库 (Mutsumi 788 等) 依赖编辑器环境探测; 缺失此方法 → 脚本中途抛错,
      // 后续 shared 赋值全部丢失 → 整个动画框架失效
      isRunningInEditor: () => false,
      // ①(RE-35) 未实现 API 的安全 shim（wer-ref 对 systemInfo/localIZE 零命中；
      //   缺失会让脚本在主干上抛 TypeError → 整个动画/时钟逻辑失效）。shim 后脚本可继续跑。
      localize: (s) => s,
      localIZE: (s) => s,
      systemInfo: { platform: 'windows', os: 'windows', isDesktop: true, isMobile: false, gpuVendor: '', gpuModel: '' },
      // ①(RE-35/RE-34) 音频反应：宿主提供真实 FFT 数据（opts.audioBuffers）时用之，
      //   否则退回全 0 数组（官方 registerAudioBuffers 的静默版；脚本主干仍可运行）
      // ①(P-131 批 D) **返回值是活视图**（同一 n 永远同一批 Float32Array，每帧原地更新，见上方
      //   `AUDIO_LIVE_VIEWS` 注释）：官方示例在脚本顶层调一次并长期持有 ⇒ 旧实现"每次新建数组"
      //   让顶层 `const` 拿到编译那一刻的全 0 快照（25 个包 / 386 次调用的音频响应因此是平线）。
      //   `average` 由本函数按官方口径逐段算（(left+right)/2），不采信宿主可能给的"总均值填满"。
      registerAudioBuffers: (n) => fillAudioView(liveAudioView(n), opts.audioBuffers),
      AUDIO_RESOLUTION_8: 8, AUDIO_RESOLUTION_16: 16, AUDIO_RESOLUTION_32: 32, AUDIO_RESOLUTION_64: 64,
      // ①(RE-34) WE 脚本 API `getVideoTexture` 的包装：宿主可提供真实控制句柄
      //   （play/pause/stop/setCurrentTime/isPlaying）；无视频纹理时返回 **noop 回退**
      //   （就是下面那 5 个方法的空实现 —— 方法集由 API 契约决定，属接口唯一表达），
      //   脚本主干照常运行。
      getVideoTexture: (name) => {
        if (typeof opts.getVideoTexture === 'function') {
          try { const v = opts.getVideoTexture(String(name || '')); if (v) return v } catch { /* 回退 noop */ }
        }
        return { play() {}, pause() {}, stop() {}, setCurrentTime() {}, isPlaying() { return false } }
      },
      // ①(RE-35) 平台探测常量 shim（第三方参考实现 wer-ref WPSceneScriptHost.cpp:895-905 同款语义）
      isDesktopDevice: () => true, isMobileDevice: () => false,
      isWallpaper: () => true, isScreensaver: () => false,
      // setTimeout 必须异步延迟 — 旧实现立即同步执行回调, NSL 库的调度递归
      // (动画推进/节流) 会同步无限递归卡死主线程
      setTimeout: (fn, ms) => {
        const t = setTimeout(() => { try { fn(); } catch { /* ignore */ } }, Math.max(0, Number(ms) || 0));
        return () => clearTimeout(t);
      },
      clearTimeout: (t) => { try { clearTimeout(t); } catch { /* ignore */ } },
      /* ①(P-141) `engine.setInterval(callback, delay?): Function`（d.ts L1519 + 官方文档 IEngine
       *   "Starts a repeating interval callback in milliseconds. Returns a new callback that can be
       *    used to stop the interval."）。语料 1 个包（洛茜_07 objects[8].alpha）用它做 500ms 闪烁。
       *   为什么不用宿主 `setTimeout/setInterval`（与上面的 setTimeout 不同）：
       *     · 真实 ms 定时器会在**脚本执行上下文之外**触发 ⇒ `thisLayer/thisObject` 指向别的层
       *       （ownerRef.current 是全局"当前脚本"槽），并且与 rAF 帧解耦 → 同一帧里写入竞争；
       *     · 本沙箱的官方对应物是"引擎每帧推进的脚本定时器"，所以按**场景时钟**推进（见
       *       `pumpEngineTimers`：时间基准 = 传进 `applySceneScripts` 的 `time` 秒数 = `engine.runtime`
       *       的同一条时间轴，与 demo 的"脚本节拍分层"无关），回调前恢复注册时的 owner。
       *   `delay` 缺省 0 ⇒ 官方默认值；我们按"每帧一次"处理（不做 while(0) 死循环）。
       *   `clearInterval` 官方 d.ts 未声明（同段的 `clearTimeout` 被注释掉并写 "Not implemented.
       *   Use returned function to clear."）⇒ **官方路径是调用返回的函数**；我们两个都给：
       *   返回的 stop 函数（带 `__timerId`，wer-ref 同款行为对照）与 `engine.clearInterval(handle)`。 */
      setInterval: (callback, delay) => {
        if (typeof callback !== 'function') return () => {};
        const table = engineTimerTable(context.engine);
        const id = ++table.seq;
        const rec = {
          id,
          cb: callback,
          delayMs: Math.max(0, Number(delay) || 0),
          accum: 0,
          owner: (ownerRef && ownerRef.ref) ? ownerRef.ref.current : null,
          ownerRef: ownerRef || null,
        };
        table.timers.set(id, rec);
        apiBump('timerScheduled');
        const stop = () => { clearEngineTimer(context.engine, id); };
        stop.__timerId = id;
        stop.__mpwInterval = true;
        return stop;
      },
      clearInterval: (handle) => clearEngineTimer(context.engine, handle),
    },
    shared,
    thisObject: ownerRef.makeObject(),
    thisLayer: ownerRef.makeLayer(),
  };
  context.globalThis = context;
  vm.createContext(context);
  try {
    vm.runInContext(code, context, { timeout: 2000 });
  } catch (e) {
    return { error: e.message, exports: context.__exports, scriptProps: context.__scriptProps, ownerRef };
  }
  // scriptProperties 构建: __scriptProps 是 builder 或对象
  let props = null;
  if (context.__scriptProps instanceof ScriptPropertiesBuilder) {
    props = context.__scriptProps.finish();
  } else if (context.__scriptProps && typeof context.__scriptProps === 'object') {
    props = context.__scriptProps;
  }
  // ①(P-127 A①) 官方语义：`scriptProperties` 是**引擎提供的活对象**。把算出来的属性值
  //   **写进脚本顶层已经捕获的那个槽**（`const props = scriptProperties`），再把 context 上的
  //   标识符也指向同一个槽 ⇒ 顶层捕获与函数内读取看到**同一份**默认值。
  //   槽里此前没有任何键（空对象），所以这是一次纯粹的"从 null 变成默认值表"，不会覆盖既有键。
  if (props && typeof props === 'object') {
    Object.assign(scriptPropsSlot, props);
    context.__scriptProperties = scriptPropsSlot;
  }
  return { exports: context.__exports, scriptProps: props, context, ownerRef, scriptPropsSlot };
}

// value → 脚本可操作对象 (Vec3 / number / 原样)
// 注意: 只有"纯数字"字符串才转 Vec3 (如 "0.5 0.5 0") — 文本类脚本的 value
// 是多词字符串 (如 "Text Layer"、"Good day!"), 误转 Vec3 会让 update 返回
// 的文本被 formatResult 格式化破坏 (FPS 计数器实测 "Text Layer" → "0.000000 ...")
function toValueObj(value) {
  if (typeof value === 'string') {
    const parts = value.trim().split(/\s+/);
    if (parts.length >= 2 && parts.every((p) => p !== '' && isFinite(Number(p)))) {
      const nums = parts.map(Number);
      return new Vec3(nums[0], nums[1], nums[2] || 0);
    }
    return value; // 非纯数字字符串 → 保持原样 (文本)
  }
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') return value;
  return value;
}
// 脚本返回值 → 存储值 (Vec3/{x,y,z} → "x y z")
function formatResult(result) {
  if (result instanceof Vec3 || (typeof result === 'object' && !Array.isArray(result) && 'x' in result && 'y' in result && 'z' in result)) {
    return `${Number(result.x).toFixed(6)} ${Number(result.y).toFixed(6)} ${Number(result.z).toFixed(6)}`;
  }
  return result;
}

// 创建脚本运行时: 缓存 Map + shared 对象 (每个 SceneRenderer 实例一个)
export function createScriptCache() {
  return { map: new Map(), shared: {} };
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * ①(P-131 批 D 2026-09-19) **AudioBuffers 活视图** —— `engine.registerAudioBuffers(n)`
 *
 * 官方语义（一手出处：官方设计文档 `docs.wallpaperengine.io/en/scene/scenescript/reference/
 * class/AudioBuffers.html`，逐字要点）：
 *   · `left` / `right` / `average` 是 **Float32Array**，长度 = `registerAudioBuffers(resolution)`；
 *   · "Their contents will be **updated for every frame automatically**, so you can continuously
 *     read the audio levels from this object."；
 *   · 官方教程示例把返回值存进**顶层 `const`**、只在加载时调一次函数。
 * ⇒ 返回值必须是**每帧被原地写入的同一批数组对象**，不能是"调用那一刻的快照"。
 *
 * 旧实现的两个坑（本批修掉；P-131 有复现命令）：
 *   ① 每次调用 `new Array(len).fill(0)`（无宿主）/ 直接转发宿主返回的新数组 ⇒ 顶层 `const` 拿到的是
 *      **编译那一刻的全 0 快照**，此后永不更新 ⇒ 25 个包（386 次调用）的音频响应是一条平线；
 *   ② `average` 应当是**逐段的左右均值**（官方 "arithmetic mean of both channels"），而宿主侧
 *      （demo.html 的 `audioBuffers(n)`）曾把整条 128 元数组的**总均值**填满 n 段 ⇒ 即使有数据，
 *      `average[i]` 对任何 i 都是同一个数（语料 344 处读的就是 `average[frequency]`）⇒ 频谱条依然平。
 *   本函数按官方口径**自己**从 `left/right` 算 `average[i] = (left[i]+right[i])/2`，不信任宿主的 average。
 *
 * 为什么视图键只按 `n`（页内一份）而不是按宿主函数：官方 `engine` 是引擎级单例，页内只有一个音频源；
 *   宿主（demo.html）每帧传给 `applySceneScripts` 的是**新的箭头函数** ⇒ 用函数做键会每帧新建视图，
 *   活视图又会退化成快照。`n` 作键与"同一 resolution ⇒ 同一 AudioBuffers 实例"的官方口径也一致。
 * 为什么在本文件内自实现而不是 import `core/audio-band-array.mjs`：`core/` 与 `elysia/` 在产物里是
 *   **两个顶层目录**（`build-pages.mjs` 把 `core/*.mjs` 拷到站点根、`elysia/` 整目录保留）⇒ 跨目录
 *   相对说明符在线上会 404（同 `core/we-scene-bundle.js:4705` 的既定约束）。本文件的活视图逻辑是
 *   30 行的拷贝/重采样，不含算法口径（包络算法在 `core/audio-band-array.mjs`，渲染器侧调用）。
 * ═══════════════════════════════════════════════════════════════════════════════ */
const AUDIO_LIVE_VIEWS = new Map()   // resolution → 活视图（同一 n 永远同一对象）
const numOr0 = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 };

/** 把 `src` 重采样进 `dst`（逐段均值；低频在前；越界当 0）。`dst` 是**已存在**的数组，原地写。 */
function writeResampled(dst, src) {
  const n = dst.length
  const m = (src && typeof src.length === 'number') ? Math.max(0, Math.trunc(src.length)) : 0
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * m / n), z = Math.max(a + 1, Math.floor((i + 1) * m / n))
    let s = 0
    for (let k = a; k < z; k++) s += numOr0(src[k])
    dst[i] = m ? s / (z - a) : 0
  }
}

/** 取（必要时新建）某一分辨率的活视图。长度非法按官方常用值 64 兜底，上限防脚本传 1e9。 */
function liveAudioView(n) {
  const len = Math.max(1, Math.min(4096, Math.trunc(Number(n)) || 64))
  let v = AUDIO_LIVE_VIEWS.get(len)
  if (!v) {
    v = {
      resolution: len,
      left: new Float32Array(len), right: new Float32Array(len), average: new Float32Array(len),
      kind: 'silent', hasSource: false, revision: 0,
    }
    AUDIO_LIVE_VIEWS.set(len, v)
  }
  return v
}

/** 用宿主这一次的返回值**原地**刷新视图（宿主返回新数组/同一数组都可）。 */
function fillAudioView(view, hostFn) {
  let b = null
  if (typeof hostFn === 'function') { try { b = hostFn(view.resolution) } catch { b = null } }
  const src = (b && typeof b === 'object') ? b : null
  let haveAvg = false
  if (src) {
    writeResampled(view.left, src.left || src.average)
    writeResampled(view.right, src.right || src.left || src.average)
    // 宿主**给了** average 就原样用（内缝契约：宿主给什么用什么；`elysia/media-host.js` 给的就是
    // 逐段 (left+right)/2）；没给才按官方文档的 "arithmetic mean of both channels" 补齐。
    if (src.average && typeof src.average.length === 'number' && src.average.length) {
      writeResampled(view.average, src.average)
      haveAvg = true
    }
  } else {
    view.left.fill(0); view.right.fill(0)
  }
  if (!haveAvg) for (let i = 0; i < view.resolution; i++) view.average[i] = (view.left[i] + view.right[i]) / 2
  // 数据源标注：宿主给了就用宿主的（demo.html 会标 analyser/mic/simulated/silent），
  // 没给则"宿主确实交了对象"视为有源（media-host 等）。
  view.kind = src && typeof src.kind === 'string' ? src.kind : (src ? 'host' : 'silent')
  view.hasSource = src ? (src.hasSource !== undefined ? !!src.hasSource : true) : false
  view.revision = (view.revision | 0) + 1
  return view
}

/**
 * 每帧刷新**所有**已注册分辨率的活视图（`applySceneScripts` 每帧开头调一次）。
 * 这是"脚本顶层只调一次 `registerAudioBuffers` 也照样每帧更新"的关键：脚本不再调用也没关系。
 * 返回被刷新的视图数（0 = 本帧没有脚本用过音频 ⇒ 零成本）。
 */
export function refreshAudioViews(hostFn) {
  for (const view of AUDIO_LIVE_VIEWS.values()) fillAudioView(view, hostFn)
  return AUDIO_LIVE_VIEWS.size
}

/** 诊断/测试用只读入口：某分辨率的活视图（不存在则 null，**不**创建）。 */
export function peekAudioView(n) {
  const len = Math.trunc(Number(n)) || 64
  return AUDIO_LIVE_VIEWS.get(len) || null
}

// 执行脚本值 (缓存模式): 编译一次, init 一次, 每帧 update(value) → 写回 obj.value
// opts: { canvasSize, userProps, shared, sceneObjects, thisScene, cache, runtime, frametime, ownerRef }
function runScriptValueCached(scriptVal, time, opts = {}) {
  const phase = opts.phase || 'both';   // ①(2026-09-12) 'init' | 'update' | 'both'（两趟执行用）
  if (!scriptVal || typeof scriptVal !== 'object' || !('script' in scriptVal)) return;
  const src = scriptVal.script;
  const cache = opts.cache;
  let entry = cache ? cache.get(src) : null;
  if (!entry) {
    const compiled = compileScript(src, {
      canvasSize: opts.canvasSize,
      userProps: opts.userProps,
      shared: opts.shared,
      thisScene: opts.thisScene,
      ownerRef: opts.ownerRef,
      runtime: opts.runtime != null ? opts.runtime : time,
      frametime: opts.frametime,
      audioBuffers: opts.audioBuffers,
      getVideoTexture: opts.getVideoTexture,
    });
    entry = {
      exports: compiled.exports || {},
      error: compiled.error,
      scriptProps: compiled.scriptProps,
      // ①(P-127 A①) 脚本顶层捕获的 `scriptProperties` 活槽（对象级覆盖要写回这里，见下方）
      scriptPropsSlot: compiled.scriptPropsSlot || null,
      context: compiled.context || null,
      initialized: false,
      ownerRef: compiled.ownerRef,
      // ①(P-62) 事件派发 (dispatchScriptEvent) 要用：该脚本源被哪些对象用过（插入序 = 首次
      //   运行顺序），以及最后一次运行的 owner。缓存按**脚本源**共享 → 同一源码被 N 个层
      //   复用时只有一个 entry：官方语义是"每层一个脚本实例、每个实例都收到回调"，
      //   所以派发时对 owners 里每个对象各调一次（幂等赋值类回调无副作用，而
      //   `thisLayer.visible = …` 这类必须逐层生效）。
      owners: new Set(),
      lastOwner: null,
    };
    if (cache) cache.set(src, entry);
  }
  const exports = entry.exports;
  if (entry.error && !exports.update && !exports.applyUserProperties && !exports.init) {
    return; // 脚本编译失败且无可用导出 → 保持静态 value
  }
  // 对象级 scriptproperties 覆盖 (WE 编辑器保存的用户调整 + user 属性绑定):
  // scene.json 对象上的 scriptproperties 是设计器存盘值, 格式 {name: value} 或
  // {name: {user: 用户属性名, value: 默认}} — 运行时读 userProps 当前值 (用户
  // 在 project.json 改过则生效), 无该键回退 value。脚本编译期 createScriptProperties
  // 只含脚本内声明的默认, 不含对象存盘覆盖 → 不应用则时钟 12/24h、分隔符等
  // 全用脚本默认 (用户调整丢失)。缓存按 src 共享, context.__scriptProperties
  // 每次按当前对象重新覆盖 (同脚本多对象不同覆盖不串)。
  if (scriptVal.scriptproperties && entry.context) {
    const props = Object.assign({}, entry.scriptProps || {});
    // ①(修复 2026-09-12) scene.json 里对象的 `scriptproperties` 常是**JSON 字符串**
    //   （例：Shiroko 时钟层 '{"delimiter":":","showSeconds":false,"use24hFormat":true}'）。
    //   旧实现对字符串做 Object.entries → 得到 '0','1','2'… 索引键，作者存盘的覆盖全部丢失。
    //   这里先尝试解析成对象再套用（解析失败保持旧行为）。
    let sp = scriptVal.scriptproperties;
    if (typeof sp === 'string') { try { const j = JSON.parse(sp); if (j && typeof j === 'object') sp = j } catch { /* 非 JSON → 原样 */ } }
    for (const [k, v] of Object.entries(sp)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (typeof v.user === 'string' && v.user) {
          const uv = (opts.userProps || {})[v.user];
          props[k] = uv !== undefined && uv !== null ? uv : v.value;
        } else if ('value' in v) {
          props[k] = v.value;
        } else {
          props[k] = v;
        }
      } else {
        props[k] = v;
      }
    }
    // ①(P-127 A①) 覆盖结果要落进**同一个活槽**（`scriptPropsSlot`），否则脚本顶层
    //   `const props = scriptProperties` 捕获到的那份引用永远只有脚本默认值、看不到对象级覆盖。
    //   槽是"全等镜像"语义：先删掉不在本次 props 里的键，再整份写入 ——
    //   这样缓存按脚本源共享时，上一个对象的覆盖键不会漏给下一个对象。
    const slot = entry.scriptPropsSlot || entry.context.__scriptProperties;
    if (slot && typeof slot === 'object') {
      for (const k of Object.keys(slot)) if (!Object.prototype.hasOwnProperty.call(props, k)) delete slot[k];
      Object.assign(slot, props);
      entry.context.__scriptProperties = slot;
    } else {
      entry.context.__scriptProperties = props;
    }
  }
  // ownerRef 是首次编译时创建的共享代理 (entry 持有); setOwner 指向当前脚本
  // 所属对象 — 缓存共享条目在多个对象间不串
  const ownerRef = entry.ownerRef;
  // ①(2026-09-12) 给 ownerRef 挂 id→对象 表：thisLayer.getParent() 要靠它拿父层（否则父链断）
  try {
    if (ownerRef && !ownerRef.byId) {
      const m = new Map();
      for (const o of (opts.sceneObjects || [])) if (o && o.id !== undefined) m.set(o.id, o);
      ownerRef.byId = m;
    }
  } catch { /* ignore */ }
  if (ownerRef && ownerRef.setOwner) ownerRef.setOwner(opts.currentObject || null);
  // ①(P-62) 记下本次运行的 owner，供 dispatchScriptEvent 还原（见 entry 创建处注释）
  entry.lastOwner = opts.currentObject || null;
  if (entry.owners && opts.currentObject) { try { entry.owners.add(opts.currentObject) } catch { /* ignore */ } }
  // ①(N7 2026-09-14) **真实 frametime**：`engine` 对象在**编译期**构造（缓存按脚本源共享），
  //   旧实现只在那一刻写入 opts.frametime（demo 从不传 → 恒 1/60，语料里 22 个容器用
  //   `engine.frametime` 做平滑/积分）。节拍提到 ≥30Hz 后必须给它真值：每次运行前把缓存
  //   context 上的 engine.frametime 刷新为调用方给的"上一帧真实秒数"。
  if (entry.context && entry.context.engine && opts.frametime !== undefined && opts.frametime !== null) {
    const ft = Number(opts.frametime);
    if (isFinite(ft) && ft >= 0) entry.context.engine.frametime = ft;
  }
  if (phase === 'init' && entry.initialized) return;      // 已初始化过 → init 趟不重复
  const valueObj = toValueObj(scriptVal.value);
  // ①(RE-35 官方错误矩阵 WPSceneScriptHost:8802-8812 / :9503-9508)：
  //   · init 失败 → **永久禁用该实例**（避免每帧把同一根因变成噪音），authored 值保持
  //   · update 失败 → 只跳过本帧、保留 last-known 值、下一帧继续
  //   · 返回 undefined → 不写属性（authored 值保持）
  if (entry.disabled) return;
  if (phase === 'update' && !entry.initialized) return;   // init 趟还没跑过 → update 趟跳过
  if (!entry.initialized && typeof exports.init === 'function') {
    try {
      // NSL init(value): 一次性初始化 (如启动骨骼动画), 返回新值
      const r = exports.init(valueObj);
      if (r != null) scriptVal.value = formatResult(r);
      entry.initialized = true;
    } catch (e) {
      entry.disabled = true;
      entry.initError = (e && (e.stack || e.message)) || String(e);
      if (typeof opts.onError === 'function') { try { opts.onError('init', e) } catch { /* ignore */ } }
      return;
    }
  }
  // applyUserProperties: NSL 语义在用户属性变化时调用 (715 Dock 逻辑的
  // shared.minScale/maxScale/radius 都在这里计算)。本地无变化检测 → 首次
  // 执行一次 (属性固定, 幂等); 不执行则依赖它的脚本读到 undefined。
  if (!entry.userPropsApplied && typeof exports.applyUserProperties === 'function') {
    try {
      // ①(TIME-VARIATION 2026-09-14 第5项) 官方语义：changed = 当前用户属性表
      //   （project.json general.properties 展开 value）。旧实现恒传 {} → 依赖它的脚本
      //   （3326873240 后处理层：timevarying/display/morningtime…）永远读不到 →
      //   update() 两个分支都不成立 → 5 个时段层停在 authored 状态（只剩 morning）。
      //   ?nouserprops=1 可回退旧行为对照。
      exports.applyUserProperties((typeof opts.noUserProps === 'function' && opts.noUserProps()) ? {} : (opts.userProps || {}));
      entry.userPropsApplied = true;
    } catch (e) {
      entry.userPropsApplied = true;   // 失败不重试（与官方"调用点独立容错"一致）
      if (typeof opts.onError === 'function') { try { opts.onError('applyUserProperties', e) } catch { /* ignore */ } }
    }
  }
  if (typeof exports.update === 'function') {
    try {
      const result = exports.update(valueObj);
      if (result != null) scriptVal.value = formatResult(result);
    } catch (e) {
      entry.updateErrors = (entry.updateErrors || 0) + 1;
      if (typeof opts.onError === 'function') { try { opts.onError('update', e) } catch { /* ignore */ } }
    }
  }
}

// 扫描并执行场景所有 {script, value} 对象 (更新到原对象树)
// opts: { canvasSize, userProps, scriptCache, renderObjects, runtime }
export function applySceneScripts(scene, time, opts = {}) {
  const cache = opts.scriptCache && opts.scriptCache.map ? opts.scriptCache : null;
  const shared = (cache ? cache.shared : null) || opts.shared || {};
  // ①(P-131 批 D) **每帧先刷新音频活视图**（脚本顶层只调一次 `registerAudioBuffers` 时，
  //   这是"内容随帧变化"的唯一驱动点）。没有脚本用过音频 ⇒ Map 为空、零成本。
  refreshAudioViews(opts.audioBuffers);
  // 渲染对象列表 (this.objects, 已烘焙) — 脚本写这些对象 → 渲染直接生效
  // ①(P-141) 旧实现 `(scene.objects||[]).map(o=>o)` 是**浅拷贝** ⇒ `thisScene.createLayer()/sortLayer()`
  //   在"调用方没给 renderObjects"时只改到副本：层表（enumerateLayers/getLayerIndex）看得见，
  //   宿主 `scene.objects` 看不见。demo.html 传了 renderObjects（与 scene.objects **同一个数组**）
  //   所以浏览器里本来就一致；这里直接取原数组，让两边的语义相同（数组本身不被替换，
  //   `opts.renderObjects` 优先级一字不变）。
  const sceneObjects = opts.renderObjects || (Array.isArray(scene.objects) ? scene.objects : []);
  // ①(P-127 A①) 调用方可以**自带** thisScene 引用（此前这里无条件 `makeSceneRef(sceneObjects)`，
  //   `opts.thisScene` 在本函数里被静默忽略 —— 而 compileScript 那一层是认它的）。
  //   加这条缝是为了让"某个 `thisScene` 方法尚未实现"的缺口**可以被测试精确隔离**，而不是被
  //   更早的错误掩盖（P-127 的 WEVector 复现就靠它：桩只补 makeSceneRef 里缺的那几个方法）。
  //   不给 opts.thisScene 时行为**逐位不变**（走原来的 makeSceneRef）。
  const ownerRef = makeOwnerRef();
  // ①(P-141) `IScene.getLayerIndex(thisLayer)` 必须能把 ownerRef 的那个层引用实例还原成场景对象
  //   （ownerRef 的引用是惰性读 ref.current 的，所以两条缝都要给：实例身份 + 当前对象）。
  const thisScene = opts.thisScene || makeSceneRef(sceneObjects, {
    ownerLayerRef: () => ownerRef.layerRefObj(),
    ownerObj: () => ownerRef.ref.current,
  });
  const nodes = [];
  const collect = (obj, owner) => {
    if (!obj || typeof obj !== 'object') return;
    if ('script' in obj && 'value' in obj && typeof obj.script === 'string') { nodes.push([obj, owner || null]); return; }
    if (Array.isArray(obj)) { obj.forEach((x) => collect(x, x)); return; }
    for (const k of Object.keys(obj)) collect(obj[k], obj);
  };
  collect(scene, null);
  const run = (obj, owner, phase) => runScriptValueCached(obj, time, {
    canvasSize: opts.canvasSize,
    userProps: opts.userProps,
    // ②(偏差记录 TIME-VARIATION S1) 补丁原文只在 runScriptValueCached 里读 opts.noUserProps，
    //   但那个 opts 是这里新构造的对象 → 不转发的话 ?nouserprops=1 回退开关静默失效。
    noUserProps: opts.noUserProps,
    shared,
    sceneObjects,
    thisScene,
    cache: cache ? cache.map : null,
    ownerRef,
    currentObject: owner,
    runtime: opts.runtime,
    frametime: opts.frametime,
    onError: opts.onError,
    audioBuffers: opts.audioBuffers,
    getVideoTexture: opts.getVideoTexture,
    phase,
  });
  // ①(2026-09-12 官方语义) **先跑完所有 init，再跑 update**：旧实现是"每个对象 init+update 交替"，
  //   于是"生产者脚本 init 里写 shared.miPrimaryColor、消费者脚本 update 里读它"的壁纸
  //   在首帧会读到 undefined（上报：`update:Cannot read properties of undefined (reading 'x')`）。
  //   第三方参考实现 wer-ref 的 WPSceneScriptHost 是先初始化全部脚本实例，再逐帧 update。
  // ①(N7 2026-09-14) 脚本节拍分层：`opts.nodeFilter(obj, owner)` 选中要跑的脚本节点子集
  //   （demo 用它把"文本/时钟/帧率类"脚本提到 ≥30Hz，其余保持 4Hz 控 CPU）。
  //   未提供 = 全跑（旧行为）。`opts.fireUpdate === false` 时不触发 scene.on('update') 回调
  //   （高频子集趟不重复触发作者 update 回调，避免回调里的重活被放大 8 倍）。
  const nodeFilter = (typeof opts.nodeFilter === 'function') ? opts.nodeFilter : null
  const pick = (obj, owner) => (!nodeFilter || !!nodeFilter(obj, owner))
  for (const [obj, owner] of nodes) { if (!pick(obj, owner)) continue; try { run(obj, owner, 'init') } catch (e) { if (typeof opts.onError === 'function') try { opts.onError('init', e) } catch {} } }
  for (const [obj, owner] of nodes) { if (!pick(obj, owner)) continue; try { run(obj, owner, 'update') } catch (e) { if (typeof opts.onError === 'function') try { opts.onError('update', e) } catch {} } }
  // ①(P-141) **每帧推进脚本定时器**（`engine.setInterval` 的驱动点）。放在 init/update 两趟**之后**：
  //   本帧新注册的定时器能在同一帧拿到时钟原点（`lastClock = time`），下一帧起按真实 Δt 累积 ——
  //   放在趟前会让"首帧注册"白丢一帧的时间（μs 级代码，语义差别却是一整帧）。
  //   时间基准 = 场景时钟 `time`（秒，= `engine.runtime` 的同一条时间轴），与 demo 的"脚本节拍分层"
  //   无关（慢档 4Hz / 快档 30Hz 下 Δt 都正确）；`time` 不可用时退化用 `opts.frametime`。
  //   没有脚本排过定时器 ⇒ ENGINE_TIMERS 里没有表、零成本。
  if (cache && cache.map) {
    for (const entry of cache.map.values()) {
      try { pumpEngineTimers(entry && entry.context && entry.context.engine, time, opts.frametime) } catch { /* ignore */ }
    }
  }
  // ①(P-41 A4) `scene.on("update", cb)` 注册的回调在每帧 update 趟末尾触发（官方 update 事件语义）
  if (opts.fireUpdate !== false && cache && cache.map) {
    for (const entry of cache.map.values()) {
      try { if (entry && entry.context && entry.context.scene && typeof entry.context.scene.__fireUpdate === 'function') entry.context.scene.__fireUpdate() } catch { /* ignore */ }
    }
  }
  return shared;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ①(P-62) 事件广播：把宿主侧事件投递给**所有已编译脚本**里同名导出函数
//
// 官方语义（语料 + 官方 d.ts 双证）：
//   WE 引擎把"当前正在播放的媒体"以**回调**推给壁纸脚本，不是轮询：
//     export function mediaPropertiesChanged(event)   // {title,artist,subTitle,albumTitle,albumArtist,genres,contentType}
//     export function mediaThumbnailChanged(event)    // {hasThumbnail,primaryColor,secondaryColor,tertiaryColor,textColor,highContrastColor}
//     export function mediaPlaybackChanged(event)     // {state}（MediaPlaybackEvent.PLAYBACK_*）
//     export function mediaTimelineChanged(event)     // {position,duration}
//     export function mediaStatusChanged(event)       // {enabled}
//   官方插入菜单（wallpaper_engine/ui/dist/scripts/scripts.js 的 "mediaPropertiesChanged/
//   mediaThumbnailChanged/mediaPlaybackChanged/mediaTimelineChanged/mediaStatusChanged" 按钮）
//   与官方 TS 定义（ui/dist/monaco/autocomplete/lib.sceneScript.d.ts L292-415）逐字对应。
//
// 语料实证的 5 个回调分布（包 id → 调用）：见 PATCHES.md P-62。
//
// 本函数是**该机制唯一的宿主入口**：遍历 cache.map 的所有 entry，凡 entry.exports[name]
// 存在即调用。缓存按脚本源共享 → 同一源码被 N 层复用时对 owners 里每个对象各调一次
// （官方"每层一个实例都收事件"的等价物）。
//
// 参数：
//   cache    createScriptCache() 的返回值（或直接一个 Map<src, entry>）
//   name     回调名（'mediaPropertiesChanged' 等；未知名字 = 无脚本导出 → 0 调用，不报错）
//   payload  官方 event 对象（media-host.js 组装；**颜色字段必须是 Vec3 实例**，语料脚本会
//            对它调 .subtract()/.multiply()/.add() 做渐变，给普通字面量会 TypeError）
//   opts.onError(name, err) 可选错误回调（与 applySceneScripts 的 onError 同风格）
// 返回 { entries, calls, errors }：命中的 entry 数 / 实际调用次数 / 抛错次数。
//
// 【P-60 约束】必须保留 ownerRef 的**惰性**语义：`layerRef()/objectRef()` 在每次属性访问时
//   读 ref.current，而 ref.current 由每次运行前的 setOwner 设定。派发发生在两次
//   applySceneScripts 之间 → 这里对每个 owner 显式 setOwner 还原，回调里的
//   thisLayer/thisObject 才指向"该脚本所属的层"（真机 3554161528 的
//   `mediaThumbnailChanged(event){ thisObject.getAnimation().play() }` 就靠这条）。
//   不得退回"工厂函数体开头 const obj = ref.current"的写法。
export function dispatchScriptEvent(cache, name, payload, opts = {}) {
  const map = cache && cache.map instanceof Map ? cache.map : (cache instanceof Map ? cache : null);
  const out = { entries: 0, calls: 0, errors: 0 };
  if (!map || typeof name !== 'string' || !name) return out;
  const onError = typeof opts.onError === 'function' ? opts.onError : null;
  for (const entry of map.values()) {
    if (!entry || !entry.exports) continue;
    const fn = entry.exports[name];
    if (typeof fn !== 'function') continue;
    out.entries++;
    let owners;
    try { owners = (entry.owners && entry.owners.size) ? Array.from(entry.owners) : [entry.lastOwner || null]; }
    catch { owners = [entry.lastOwner || null]; }
    for (const obj of owners) {
      if (entry.ownerRef && entry.ownerRef.setOwner) { try { entry.ownerRef.setOwner(obj) } catch { /* ignore */ } }
      try { fn(payload); out.calls++; }
      catch (e) {
        out.errors++;
        // 与 applySceneScripts 一致：单个回调失败不拖垮其它脚本/宿主
        if (onError) { try { onError(name, e) } catch { /* ignore */ } }
      }
    }
  }
  return out;
}

// ①(P-62) 让所有脚本实例**重跑一次** `applyUserProperties(changed)`。
//
// 为什么需要它（接 P-62 的 `scriptCache` 时必须一并接线）：
//   `demo.html` 目前**没有**传 `scriptCache`（只有 `shared`）→ 每帧重编译、`applyUserProperties`
//   每帧都被调用。一旦为了 `dispatchScriptEvent` 引入 `createScriptCache()`，按官方语义
//   `entry.userPropsApplied` 只置一次 → "只靠 applyUserProperties 生效"的脚本（如 3326873240 的
//   后处理层 timevarying/display/morningtime…）在用户改属性后**不再收到回调** → P-61 属性面板
//   的即时生效看起来坏了。
//   本函数把该标志清掉 → 下一帧 `applyUserProperties(opts.userProps)` 重新收到**当前**属性表，
//   语义与旧行为（每帧都跑）等价，是接入缓存时的安全阀。
// 用法：P-61 属性面板 / `?props=` 变更后调一次（幂等，返回被重置的 entry 数）。
export function invalidateUserProps(cache) {
  const map = cache && cache.map instanceof Map ? cache.map : (cache instanceof Map ? cache : null);
  if (!map) return 0;
  let n = 0;
  for (const entry of map.values()) {
    if (entry && entry.userPropsApplied) { entry.userPropsApplied = false; n++; }
  }
  return n;
}
