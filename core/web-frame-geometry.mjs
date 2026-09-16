/* P-102 (2026-09-16) 帧几何模块：按 docs/WEB-FRAME-GEOMETRY-SPEC.md 的规格实现，
 * 参照 `oneincase/webwallgl`（MIT © oneincase，commit b61e8910ae0a176288aed99ce9a93a13ea07df57）的
 * `renderer/src/web.ts` 对齐**行为契约**（u/v → 帧内 client 像素、覆盖式视口取内容比例并居中裁切），
 * **未复制其代码**：命名、参数形态、适配模式三态、常量组织、回退开关均按本规格自写，
 * 差异清单见规格 §6 与 THIRD-PARTY.md §11（台账 docs/COPYING-RULES.md §4 #9）。
 *
 * 参照来源许可声明：本文件提到的 `vendor-ref/webwallgl` 是第三方参考实现（MIT，见上），
 * 与本项目（GPL-3.0-or-later）兼容，可借但必须署名并登记台账。
 *
 * 本模块零依赖、纯函数、浏览器与 Node 共用；
 * 用途：宿主 iframe 形态下的指针坐标换算与"内容比例 ≠ 舞台比例"时的覆盖式视口。
 * 回退开关：调用方按 `frameGeomModeFromQuery` 支持 `?frame=legacy`（回到 iframe 100%×100%）。
 */
// web-frame-geometry.mjs — 帧内坐标契约 + 覆盖式视口（纯函数）

/** 比例差在容差内视为"已贴合"，不再换视口（躲开 DPR 取整误差） */
export const FRAME_ASPECT_EPS = 0.005;
/** 合理的内容宽高比区间：超出即视为量错（元数据未到时盒子会塌成细条，别拿它当设计比例） */
export const FRAME_ASPECT_MIN = 0.2;
export const FRAME_ASPECT_MAX = 6;
/** 适配模式三态（未知值一律回落 cover：与既有 fillmode 缺省 aspectcrop 的"宁裁不留边"一致） */
export const FRAME_FIT = ['cover', 'contain', 'stretch'];

function num(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

/**
 * 取值归一：`cover`（缺省/未知）| `contain` | `stretch`。
 * 别名：`fit`→contain、`fill`→stretch（大小写无关）。
 */
export function normalizeFrameFit(mode) {
  const s = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
  if (s === 'contain' || s === 'fit') return 'contain';
  if (s === 'stretch' || s === 'fill') return 'stretch';
  return 'cover';
}

/**
 * 窗口（视口）坐标 → **帧内 client 像素**。
 *
 * 为什么必须看 `clientX/clientY` 而不是 `pageX/pageY`：`getBoundingClientRect()` 是**视口坐标**，
 * page 坐标含滚动量，两者混用会让坐标整体偏移一个滚动量（不报错，只是"鼠标位置不对"）。
 * 为什么要除以 `scale`：祖先 CSS `transform` 的缩放会体现在 `getBoundingClientRect()`（显示盒）里，
 * 而帧内部视口（`clientWidth/clientHeight`）不含缩放。
 *
 * @param {{clientX:number, clientY:number}} ev
 * @param {{left:number, top:number, width:number, height:number}} frameRect 显示盒
 * @param {{width:number, height:number}} frameViewport 内部视口
 * @returns {{x:number, y:number, inside:boolean, scaleX:number, scaleY:number}|null}
 *   null = 无法计算（非有限值 / 尺寸为 0）⇒ 调用方必须丢弃（NaN 会污染调用方状态且不报错）
 */
export function frameClientPoint(ev, frameRect, frameViewport) {
  const r = frameRect || {};
  const v = frameViewport || {};
  const cx = ev ? Number(ev.clientX) : NaN;
  const cy = ev ? Number(ev.clientY) : NaN;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const fw = num(r.width, 0), fh = num(r.height, 0);
  const iw = num(v.width, 0), ih = num(v.height, 0);
  if (!(fw > 0) || !(fh > 0) || !(iw > 0) || !(ih > 0)) return null;
  const scaleX = fw / iw, scaleY = fh / ih;
  const x = (cx - num(r.left, 0)) / (scaleX || 1);
  const y = (cy - num(r.top, 0)) / (scaleY || 1);
  return { x, y, inside: x >= 0 && y >= 0 && x <= iw && y <= ih, scaleX, scaleY };
}

/**
 * 内容比例：**只认内在尺寸**（videoWidth/naturalWidth 之类），元数据没到时才退回渲染盒，
 * 且结果必须落在 [FRAME_ASPECT_MIN, FRAME_ASPECT_MAX] 内（否则视为量错 ⇒ null）。
 * @param {{width:number,height:number}} box 渲染盒
 * @param {{width:number,height:number}} natural 内在尺寸（可缺省）
 */
export function contentAspectOf(box, natural) {
  const cands = [];
  if (natural) cands.push([natural.width, natural.height]);
  if (box) cands.push([box.width, box.height]);
  for (const [w0, h0] of cands) {
    const w = num(w0, 0), h = num(h0, 0);
    if (!(w > 0) || !(h > 0)) continue;
    const a = w / h;
    if (!Number.isFinite(a) || a < FRAME_ASPECT_MIN || a > FRAME_ASPECT_MAX) return null;
    return a;
  }
  return null;
}

/**
 * 覆盖式视口：把 `contentAspect` 的内容铺满舞台，溢出的一边**居中裁掉**。
 * 返回给帧用的 CSS 尺寸与相对舞台的居中偏移；`null` = 无需处理（直接 100%×100%）。
 *
 * 不用 transform 缩放：视口本身取内容比例 ⇒ 1 CSS px 仍是 1 舞台 px，文字/视频不重采样。
 */
export function coverViewport(stageW, stageH, contentAspect) {
  const sw = num(stageW, 0), sh = num(stageH, 0), ca = num(contentAspect, 0);
  if (!(sw > 0) || !(sh > 0) || !(ca > 0)) return null;
  const stageAspect = sw / sh;
  if (Math.abs(stageAspect - ca) <= FRAME_ASPECT_EPS) return null;   // 已贴合：不动
  if (stageAspect < ca) {
    // 舞台更"高"：对齐高度，宽度溢出居中裁掉
    const width = sh * ca;
    return { width, height: sh, left: (sw - width) / 2, top: 0 };
  }
  // 舞台更"宽"：对齐宽度，高度溢出居中裁掉
  const height = sw / ca;
  return { width: sw, height, left: 0, top: (sh - height) / 2 };
}

/**
 * 覆盖式视口在舞台坐标系里的**可见子矩形**（`null` = 整帧可见 / 无输入）。
 * 用途：把帧内坐标反查回舞台坐标（诊断、点击穿透判定、露底量测），
 * 与 `coverViewport` 共用同一套几何（不变量：可见区恒在舞台内，且与帧盒的交非空）。
 */
export function frameVisibleRect(stageW, stageH, frameBox) {
  const sw = num(stageW, 0), sh = num(stageH, 0);
  const f = frameBox || {};
  const left = num(f.left, 0), top = num(f.top, 0), w = num(f.width, 0), h = num(f.height, 0);
  if (!(sw > 0) || !(sh > 0) || !(w > 0) || !(h > 0)) return null;
  const x0 = Math.max(0, left), y0 = Math.max(0, top);
  const x1 = Math.min(sw, left + w), y1 = Math.min(sh, top + h);
  if (!(x1 > x0) || !(y1 > y0)) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * 回退开关解析（`?frame=legacy|off` → `'legacy'`；其余/缺省 → `'cover'`）。
 * 调用方在 legacy 档**不调用本模块**（iframe 100%×100%），使回退路径本身也能被断言。
 */
export function frameGeomModeFromQuery(search) {
  const s = typeof search === 'string' ? search : '';
  let v = '';
  try {
    v = String(new URLSearchParams(s).get('frame') || '').trim().toLowerCase();
  } catch {
    v = '';
  }
  if (v === 'legacy' || v === 'off' || v === '0') return 'legacy';
  return 'cover';
}
