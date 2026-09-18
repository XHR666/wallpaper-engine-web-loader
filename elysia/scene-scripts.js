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

export function makeSceneRef(objects) {
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
    get scale() { return parseV(obj.scale, [1, 1, 1]); },
    get origin() { return parseV(obj.origin, [0, 0, 0]); },
    set origin(v) {
      if (v == null) return;
      const x = v.x != null ? v.x : v[0];
      const y = v.y != null ? v.y : v[1];
      const z = v.z != null ? v.z : v[2];
      obj.origin = `${Number(x).toFixed(6)} ${Number(y).toFixed(6)} ${Number(z).toFixed(6)}`;
    },
    get name() { return obj.name || ''; },
    get id() { return obj.id; },
    clicked: false,
    cursorDetected: false,
  });
  const objList = Array.isArray(objects) ? objects : [];
  return {
    // ①(2026-09-12) 上报错误 "thisScene.enumerateLayers is not a function"（3544152633 的 Clock/
    //   $mediaThumbnail/playerplay 都用它遍历层找 player/媒体层）→ 返回全部层引用。
    enumerateLayers: () => objList.map((o) => layer(o)),
    getLayer: (name) => {
      const obj = objList.find((o) => o && o.name === name);
      return obj ? layer(obj) : layer({ name, origin: '0 0 0', scale: '1 1 1', size: '0 0 0', visible: true, id: -1 });
    },
    getSceneObject: (id) => {
      const obj = objList.find((o) => o && o.id === id);
      return obj ? layer(obj) : null;
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
  const animRef = (obj) => ({
    play: () => {}, setFrame: () => {}, setTime: () => {}, setFps: () => {},
    setVisible: () => {}, setBlend: () => {}, setRate: () => {}, setScale: () => {},
    setOrigin: () => {}, setAngles: () => {}, setAlpha: () => {}, setColor: () => {},
    setSize: () => {}, setParallaxDepth: () => {}, setPosition: () => {}, setBrightness: () => {},
    setColorBlendMode: () => {}, getAnimationLayerCount: () => (obj && obj.animationlayers ? obj.animationlayers.length : 1),
    setFrameCount: () => {},
    addEndedCallback: () => {},
  });
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
    return Object.assign(Object.create(null), emptyLayerRef(), {
      getTransformMatrix: () => transformMatrixOf(obj),
      getParent: () => layerRefFor(parentObj),
      getTextureAnimation: () => texAnimRef(obj),
      getVideoTexture: () => videoTexRefShared(obj),
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
    })
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
      get alpha() { const obj = cur(); return obj ? (obj.alpha != null ? obj.alpha : 1) : 1; },
      set alpha(v) { const obj = cur(); if (obj) obj.alpha = Number(v); },
      get name() { const obj = cur(); return obj ? obj.name || '' : ''; },
      get id() { const obj = cur(); return obj ? obj.id : 0; },
      cursorDetected: false,
      clicked: false,
    };
  };
  // ①(P-60) 同 layerRef：惰性取 ref.current（编译期快照 = 上一个脚本节点的对象）
  const objectRef = () => {
    const cur = () => ref.current;
    return {
      getMaterial: () => ({}),
      getAnimation: () => animRef(cur()),
      get origin() { const obj = cur(); return obj ? parseV(obj.origin, [0, 0, 0]) : new Vec3(0, 0, 0); },
      set origin(v) { const obj = cur(); const p = toXYZ(v); if (obj && p) obj.origin = `${p[0]} ${p[1]} ${p[2]}`; },
      get scale() { const obj = cur(); return obj ? parseV(obj.scale, [1, 1, 1]) : new Vec3(1, 1, 1); },
      set scale(v) { const obj = cur(); const p = toXYZ(v); if (obj && p) obj.scale = `${p[0]} ${p[1]} ${p[2]}`; },
      get visible() { const obj = cur(); return obj ? obj.visible !== false : true; },
      set visible(v) { const obj = cur(); if (obj) obj.visible = !!v; },
      get name() { const obj = cur(); return obj ? obj.name || '' : ''; },
      get id() { const obj = cur(); return obj ? obj.id : 0; },
    };
  };
  return {
    ref,
    makeLayer: layerRef,
    makeObject: objectRef,
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
      registerAsset: () => ({ getAsset: () => null }),
      canvasSize: opts.canvasSize || { x: 3840, y: 2160 },
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
  const sceneObjects = opts.renderObjects || (scene.objects || []).map((o) => o);
  // ①(P-127 A①) 调用方可以**自带** thisScene 引用（此前这里无条件 `makeSceneRef(sceneObjects)`，
  //   `opts.thisScene` 在本函数里被静默忽略 —— 而 compileScript 那一层是认它的）。
  //   加这条缝是为了让"某个 `thisScene` 方法尚未实现"的缺口**可以被测试精确隔离**，而不是被
  //   更早的错误掩盖（P-127 的 WEVector 复现就靠它：桩只补 makeSceneRef 里缺的那几个方法）。
  //   不给 opts.thisScene 时行为**逐位不变**（走原来的 makeSceneRef）。
  const thisScene = opts.thisScene || makeSceneRef(sceneObjects);
  const ownerRef = makeOwnerRef();
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
