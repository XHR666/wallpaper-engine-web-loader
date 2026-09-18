// 增强 scene-scripts.js: createScriptProperties + engine.canvasSize + Vec3 + 用户属性
// 支持 829 类定位脚本: value.x = scriptProperties.x * engine.canvasSize.x
// 以及 App Dock 等复杂脚本的基础 API
import { parseVec3 } from './we-renderer/math.js';

// WEColor API (引擎颜色工具)
// ①(2026-09-12) 颜色值类型：脚本常把 WEColor 的结果存进 shared，之后另一个脚本再调
//   `.mix()/.lerp()`（上报：`shared.miPrimaryColor.mix is not a function`）。
//   纯 {x,y,z} 字面量没有方法 → 统一返回带颜色运算的实例（同时兼容 {x,y,z} 读取/写入）。
export class WEColorValue {
  constructor(x, y, z) { this.x = x; this.y = y; this.z = z }
  mix(o, t) { return WEColor.mix(this, o, t) }
  lerp(o, t) { return WEColor.mix(this, o, t) }
  multiply(k) { return WEColor.multiply(this, k) }
  add(o) { return WEColor.add(this, o) }
  clone() { return new WEColorValue(this.x, this.y, this.z) }
  copy() { return this.clone() }
  toString() { return `${this.x} ${this.y} ${this.z}` }
}
const colorValue = (x, y, z) => new WEColorValue(x, y, z)
export const WEColor = {
  // ①(2026-09-12) 上报 "shared.miPrimaryColor.mix is not a function"：脚本把 WEColor 生成的颜色
  //   存进 shared，另一个脚本再调 .mix()/.lerp() —— 引擎的 WEColor 是个带方法的对象，
  //   这里补齐常用运算（输入输出都用 {x,y,z}，与 hsv2rgb/rgb2hsv 的返回一致）。
  mix(a, b, t) {
    const A = a || { x: 0, y: 0, z: 0 }, B = b || { x: 0, y: 0, z: 0 }
    const k = Number(t) || 0
    return colorValue(A.x + (B.x - A.x) * k, A.y + (B.y - A.y) * k, A.z + (B.z - A.z) * k)
  },
  lerp(a, b, t) { return WEColor.mix(a, b, t) },
  multiply(a, k) { const A = a || { x: 0, y: 0, z: 0 }; const s = Number(k) || 0; return colorValue(A.x * s, A.y * s, A.z * s) },
  add(a, b) { const A = a || { x: 0, y: 0, z: 0 }, B = b || { x: 0, y: 0, z: 0 }; return colorValue(A.x + B.x, A.y + B.y, A.z + B.z) },
  hsv2rgb({ x: h, y: s, z: v }) {
    h = ((h % 1) + 1) % 1;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    const rgb = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    return colorValue(rgb[0], rgb[1], rgb[2]);
  },
  rgb2hsv({ x: r, y: g, z: b }) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d !== 0) {
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = h / 6;
    }
    const s = mx === 0 ? 0 : d / mx;
    return colorValue(((h % 1) + 1) % 1, s, mx);
  },
  // ①(P-127 A①) 官方 `WEColor` **模块**（`import * as WEColor from 'WEColor'`）的导出面是
  //   rgb2hsv / hsv2rgb / normalizeColor / expandColor 四个（来源：官方随引擎发布的脚本类型声明
  //   `ui/dist/monaco/autocomplete/lib.sceneScript.d.ts` 的 `declare module 'WEColor'` 一节，
  //   以及 https://docs.wallpaperengine.io/scene/scenescript/reference/module/WEColor —— 只读**签名与量纲**）。
  //   本对象此前只有 hsv2rgb（语料 3 处 WEColor 导入里唯一被调用的就是它）；补齐另外两个量纲换算，
  //   否则脚本调 `WEColor.normalizeColor(...)` 会抛 "is not a function"（同一类静默别名缺陷）。
  //   量纲：`normalizeColor` 0..255 → 0..1，`expandColor` 0..1 → 0..255；返回 Vec3（官方签名如此）。
  normalizeColor(color) {
    const c = color || { x: 0, y: 0, z: 0 };
    return new Vec3((Number(c.x) || 0) / 255, (Number(c.y) || 0) / 255, (Number(c.z) || 0) / 255);
  },
  expandColor(color) {
    const c = color || { x: 0, y: 0, z: 0 };
    return new Vec3((Number(c.x) || 0) * 255, (Number(c.y) || 0) * 255, (Number(c.z) || 0) * 255);
  },
};

// ①(P-127 A①) 度/弧度换算常数：**一处定义**，`WEMath` 模块与 `WEVector` 共用
//   （官方 `WEMath.deg2rad` = π/180、`rad2deg` = 180/π；两模块必须同值，否则往返不闭合）。
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

// ①(P-127 A①) 官方 `WEVector` **模块**的独立实现（`import * as WEVector from 'WEVector'`）。
//   行为契约（只读官方签名，不取实现）：
//     · `angleVector2(angle: Number): Vec2` —— 角度单位是**度**；返回单位圆上的 2D 方向向量
//       （cos/sin，x 向右、y 向上）。来源：官方 `lib.sceneScript.d.ts` 的
//       `declare module 'WEVector'` 注释 "Create a 2D directional vector from an angle (degrees)"，
//       以及 https://docs.wallpaperengine.io/scene/scenescript/reference/module/WEVector 。
//     · `vectorAngle2(direction: Vec2): Number` —— 反向换算，返回**度**，范围 (-180, 180]
//       （atan2 的口径；0° = +x，逆时针为正）。
//   语料实况（全 98 个容器实测，P-127 回报）：`WEVector.angleVector2` 共 57 处文本命中 / 7 个包，
//   其中**活代码只有 1 处**（`wallpaperE/洛茜/洛茜_11.mpkg` 的
//   `new Vec3(WEVector.angleVector2(angle)).multiply(circleScale)`，在 `init()` 里给音频条排环）。
export const WEVector = {
  angleVector2(angle) {
    const rad = (Number(angle) || 0) * DEG2RAD;
    return new Vec2(Math.cos(rad), Math.sin(rad));
  },
  vectorAngle2(direction) {
    const d = direction || { x: 0, y: 0 };
    return Math.atan2(Number(d.y) || 0, Number(d.x) || 0) * RAD2DEG;
  },
};

// createScriptProperties() 链式构建器: .addSlider({...}).addCheckbox({...})...finish()
// 属性值: 优先 user 属性映射, 否则 name.value (脚本默认值)
//
// ①(P-127 A①) `slot`：宿主传进来的**活引用槽**（脚本顶层 `const props = scriptProperties`
//   捕获到的就是它）。每 `addX()` 一次就把该属性的值**同时**写进槽 ⇒ 脚本在
//   `export var scriptProperties = createScriptProperties()….finish();` **之后**的顶层读取
//   （语料里确有这种写法，例：0917/3509243656 的物理脚本 `const FIXED_TIMESTEP = scriptProperties.step/1000`）
//   拿到的是**真值**，而不是旧实现的 `null.foo` → TypeError（整脚本被判编译失败、永久禁用）。
//   官方运行时里 `scriptProperties` 就是引擎提供的活对象，这条是向官方语义靠拢。
export class ScriptPropertiesBuilder {
  constructor(userProps, slot) {
    this.userProps = userProps || {};
    this.props = {};
    this.slot = slot && typeof slot === 'object' ? slot : null;
  }
  _add(prop) {
    // prop: {name, label, value, min, max, user?, ...}
    let val = prop.value;
    if (prop.user) {
      const uv = this.userProps[prop.user];
      if (uv !== undefined && uv !== null) val = uv;
    }
    this.props[prop.name] = val;
    if (this.slot) this.slot[prop.name] = val;
    return this;
  }
  addSlider(p) { return this._add(p); }
  addCheckbox(p) { return this._add(p); }
  addColor(p) { return this._add(p); }
  addTextinput(p) { return this._add(p); }
  addText(p) { return this._add(p); }
  addCombo(p) { return this._add(p); }
  addDropdown(p) { return this._add(p); }
  // finish() 返回**活槽**（无槽时退回旧行为：返回自己的 props 表）
  finish() { return this.slot || this.props; }
}

// Vec3 (引擎坐标类)
// 构造兼容: new Vec3(otherVec3) 复制 (733 Lens Flare 等脚本 new Vec3(thisLayer.size));
// 旧实现把 Vec3 实例存进 this.x → 后续运算 NaN → origin 级联 NaN → 组件渲染异常
// ①(2026-09-12 上报错误 "Vec2 is not defined") WE 脚本常用 Vec2（2D 向量）——沙箱里原本没有，
//   导致 3660962877 等壁纸的定位脚本每帧抛错、层位置停在 authored 值。接口与 Vec3 对齐。
export class Vec2 {
  constructor(x, y) {
    if (x && typeof x === 'object' && 'x' in x) { this.x = x.x; this.y = x.y; }
    else { this.x = x; this.y = y; }
  }
  add(o) { return new Vec2(this.x + o.x, this.y + o.y); }
  subtract(o) { return new Vec2(this.x - o.x, this.y - o.y); }
  multiply(o) { return new Vec2(this.x * o, this.y * o); }
  divide(o) { return new Vec2(this.x / o, this.y / o); }
  negate() { return new Vec2(-this.x, -this.y); }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
  normalize() { const l = this.length() || 1; return new Vec2(this.x / l, this.y / l); }
  distance(o) { return Math.sqrt((this.x - o.x) ** 2 + (this.y - o.y) ** 2); }
  clone() { return new Vec2(this.x, this.y); }
  copy() { return new Vec2(this.x, this.y); }
  mix(o, t) { const k = Number(t) || 0; const B = o || { x: 0, y: 0 }; return new Vec2(this.x + (B.x - this.x) * k, this.y + (B.y - this.y) * k); }
  lerp(o, t) { return this.mix(o, t); }
  scale(k) { return this.multiply(k); }
  toString() { return `${this.x} ${this.y}`; }
}
export class Vec3 {
  constructor(x, y, z) {
    // ①(P-127 A①) 官方构造签名是 `Vec3(x: Number|Vec2|String, y?, z?)`（据官方
    //   `lib.sceneScript.d.ts` 的 `class Vec3`）。从 **Vec2** 构造时 z 分量必须是 **0**：
    //   旧实现直接取 `x.z` ⇒ 对 Vec2 得到 `undefined` ⇒ 下游 `multiply()/add()` 级联 NaN
    //   （语料实证：洛茜_11 `new Vec3(WEVector.angleVector2(a)).multiply(k)` → origin 的 z 变 NaN）。
    //   只补 z 缺失这一条；`String` 形态与 `Vec2` 的 `x: Number|Vec3|String` 仍未实现（见 PATCHES 未证实项）。
    if (x && typeof x === 'object' && 'x' in x) { this.x = x.x; this.y = x.y; this.z = x.z !== undefined ? x.z : 0; }
    else { this.x = x; this.y = y; this.z = z; }
  }
  add(o) { return new Vec3(this.x + o.x, this.y + o.y, this.z + o.z); }
  subtract(o) { return new Vec3(this.x - o.x, this.y - o.y, this.z - o.z); }
  multiply(o) { return new Vec3(this.x * o, this.y * o, this.z * o); }
  divide(o) { return new Vec3(this.x / o, this.y / o, this.z / o); }
  negate() { return new Vec3(-this.x, -this.y, -this.z); }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  normalize() { const l = this.length() || 1; return new Vec3(this.x / l, this.y / l, this.z / l); }
  distance(o) { return Math.sqrt((this.x-o.x)**2 + (this.y-o.y)**2 + (this.z-o.z)**2); }
  clone() { return new Vec3(this.x, this.y, this.z); }
  // NSL 脚本常用 copy() (726 Launcher init: value.copy())
  copy() { return new Vec3(this.x, this.y, this.z); }
  // ①(2026-09-12) 上报 "shared.miPrimaryColor.mix is not a function"：媒体层脚本把 Vec3 存进 shared，
  //   另一脚本对它调 .mix()/lerp()（颜色插值）→ 引擎的向量带这些运算，补齐。
  mix(o, t) { const k = Number(t) || 0; const B = o || { x: 0, y: 0, z: 0 }; return new Vec3(this.x + (B.x - this.x) * k, this.y + (B.y - this.y) * k, this.z + (B.z - this.z) * k); }
  lerp(o, t) { return this.mix(o, t); }
  scale(k) { return this.multiply(k); }
  toString() { return `${this.x} ${this.y} ${this.z}`; }
}
