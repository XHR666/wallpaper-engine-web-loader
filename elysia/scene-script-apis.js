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
};

// createScriptProperties() 链式构建器: .addSlider({...}).addCheckbox({...})...finish()
// 属性值: 优先 user 属性映射, 否则 name.value (脚本默认值)
export class ScriptPropertiesBuilder {
  constructor(userProps) {
    this.userProps = userProps || {};
    this.props = {};
  }
  _add(prop) {
    // prop: {name, label, value, min, max, user?, ...}
    let val = prop.value;
    if (prop.user) {
      const uv = this.userProps[prop.user];
      if (uv !== undefined && uv !== null) val = uv;
    }
    this.props[prop.name] = val;
    return this;
  }
  addSlider(p) { return this._add(p); }
  addCheckbox(p) { return this._add(p); }
  addColor(p) { return this._add(p); }
  addTextinput(p) { return this._add(p); }
  addText(p) { return this._add(p); }
  addCombo(p) { return this._add(p); }
  addDropdown(p) { return this._add(p); }
  finish() { return this.props; }
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
    if (x && typeof x === 'object' && 'x' in x) { this.x = x.x; this.y = x.y; this.z = x.z; }
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
