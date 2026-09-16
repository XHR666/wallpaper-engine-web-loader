/* P-103 (2026-09-16) 音频频段契约：按 docs/AUDIO-BAND-SPEC.md 的规格实现。
 * 参照 `oneincase/webwallgl`（MIT © oneincase，commit b61e8910ae0a176288aed99ce9a93a13ea07df57）的
 * `renderer/src/web.ts` —— 只对齐**行为契约**：宿主/网页侧 `wallpaperRegisterAudioListener` 收到的是
 * **128 元数组**（左 0..63 + 右 64..127），逐项钳到 0..1；以及"频谱要尖"的观感（γ 对比扩展 + 固定增益）。
 * **未复制其代码**：命名、打包形态、γ/增益的落点、模拟源的确定性与相位口径均自写，
 * 差异清单见 spec §5 与 THIRD-PARTY.md §12（台账 docs/COPYING-RULES.md §4 #10）。
 *
 * 与既有渲染器的关系：本仓库此前**没有**"左右各 64 段的频段数组"这一形态（音频侧只有按文件扫描的
 * 音轨索引，见 P-89 洁净室重写）。本模块是**新增能力**，不改任何既有路径；接线留待音频源落地。
 */
// audio-band-array.mjs — 128 元频段数组契约（打包/钳位/γ 扩展/确定性模拟源）

/** 频段数组的长度契约：左 64 + 右 64（与 WE 网页 API 的 `wallpaperRegisterAudioListener` 一致） */
export const AUDIO_BAND_HALF = 64;
export const AUDIO_BAND_LEN = AUDIO_BAND_HALF * 2;

/** 对比扩展指数：真实音乐的 FFT 是尖的（底鼓瞬时接近 1、间隙约 0.05），
 *  平缓的合成波形必须先做 γ 扩展才"像"频谱（否则音条是一团平泥、阈值判定永不成立）。 */
export const AUDIO_BAND_GAMMA = 1.8;
/** 扩展后乘的固定增益：把峰值顶到 1 附近（与 γ 一起定义为一条曲线，缺一不可） */
export const AUDIO_BAND_GAIN = 1.8;

function num(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

/** 单频段整形：`0..1` 钳位输入 → γ 对比扩展 → 增益 → 再钳到 0..1（曲线严格单调不减）。 */
export function shapeBand(v) {
  const x = Math.max(0, Math.min(1, num(v, 0)));
  if (x <= 0) return 0;
  return Math.min(1, Math.pow(x, AUDIO_BAND_GAMMA) * AUDIO_BAND_GAIN);
}

/**
 * 左右频段 → 128 元 Float32Array（左 0..63、右 64..127）。
 * 输入比 64 短 ⇒ 余下填 0；比 64 长 ⇒ 只取前 64（契约长度**恒定**，调用方无需再判长度）。
 * 逐项 `0..1` 钳位（越界值来自噪声/未归一化的源，交给下游会让无关阈值全亮）。
 * @param {ArrayLike<number>} left
 * @param {ArrayLike<number>} right
 * @param {Float32Array|null} out 可选复用缓冲（长度必须是 128；长度不对则忽略并新建）
 * @param {{gamma?:number, gain?:number, clampOnly?:boolean}} [opts]
 *   clampOnly=true → 只做 0..1 钳位（真实频谱已是归一化值，再套 γ 会把音条整体顶满）
 */
export function packBands(left, right, out = null, opts = {}) {
  const dst = out && out.length === AUDIO_BAND_LEN ? out : new Float32Array(AUDIO_BAND_LEN);
  const gamma = num(opts.gamma, AUDIO_BAND_GAMMA);
  const gain = num(opts.gain, AUDIO_BAND_GAIN);
  const shape = (v) => {
    const x = Math.max(0, Math.min(1, num(v, 0)));
    if (opts.clampOnly) return x;
    if (x <= 0) return 0;
    return Math.min(1, Math.pow(x, gamma) * gain);
  };
  for (let i = 0; i < AUDIO_BAND_HALF; i++) {
    dst[i] = shape(left ? left[i] : 0);
    dst[AUDIO_BAND_HALF + i] = shape(right ? right[i] : 0);
  }
  return dst;
}

/**
 * 确定性模拟频谱源（没有真实音频源时的回落；也让"频谱相关功能"能被自动化测试）。
 *
 * 形态刻意做得"像音乐"：低频段（底鼓/贝斯）能量高且有**强节拍**、高频段（镲片）弱而快、
 * 通道间有相位差（消除单声道感）。全程 **Lissajous 叠加 + 无随机数** ⇒ 同一 `(t, seed)`
 * 永远给出同一组值（测试可逐位对拍；真机上也不会每帧抖成噪点）。
 *
 * @param {number} t 秒
 * @param {{seed?:number}} [opts]
 * @returns {{left:Float32Array, right:Float32Array, preL:Float32Array, preR:Float32Array}}
 *   `pre*` = **未**做 γ/钳位的原始值（0..1 内）；`left/right` = 已按 `packBands` 曲线整形。
 *   两者都给，是因为"阈值判定型"作者要峰值、"积分型"作者要均值，只有一种口径必然顾此失彼。
 */
export function simulatedBands(t, opts = {}) {
  const sec = num(t, 0);
  const seed = num(opts.seed, 1);
  const preL = new Float32Array(AUDIO_BAND_HALF);
  const preR = new Float32Array(AUDIO_BAND_HALF);
  const beat = 2.2;                                   // 每秒 2.2 拍 ≈ 132 BPM
  const kick = Math.pow(Math.max(0, Math.sin(Math.PI * sec * beat)), 6);   // 每拍一个尖峰
  for (let i = 0; i < AUDIO_BAND_HALF; i++) {
    const f = i / (AUDIO_BAND_HALF - 1);              // 0（最低频）..1（最高频）
    const low = Math.pow(1 - f, 2.2);                 // 低频权重（底鼓/贝斯）
    const high = Math.pow(f, 1.6) * 0.35;             // 高频权重（镲片/空气声），弱
    const wob = 0.5 + 0.5 * Math.sin(sec * (1.1 + 3.7 * f) + seed + f * 9.1);
    const flick = 0.5 + 0.5 * Math.sin(sec * (7.3 + 21 * f) + seed * 1.7 + i);
    const base = low * (0.35 + 0.65 * kick) + high * flick;
    preL[i] = Math.max(0, Math.min(1, base * (0.55 + 0.45 * wob)));
    // 右通道：相位偏移 + 轻微不同的摆动 ⇒ 通道间有差异（不是单声道复制）
    const wobR = 0.5 + 0.5 * Math.sin(sec * (1.1 + 3.7 * f) + seed + 1.31 + f * 8.3);
    preR[i] = Math.max(0, Math.min(1, base * (0.55 + 0.45 * wobR)));
  }
  const shapedL = packBands(preL, preL, null, { clampOnly: false });
  const shapedR = packBands(preR, preR, null, { clampOnly: false });
  return {
    left: shapedL.slice(0, AUDIO_BAND_HALF),
    right: shapedR.slice(AUDIO_BAND_HALF),
    preL,
    preR,
  };
}

/**
 * 打包成 128 元数组（模拟源的便捷入口；真实源请直接用 `packBands`）。
 */
export function simulatedBandArray(t, opts = {}) {
  const s = simulatedBands(t, opts);
  return packBands(s.preL, s.preR, null, { clampOnly: false });
}

/** 频段数组诊断摘要（进 diag/日志：一眼看出"有没有数据 / 是不是全零 / 峰值在哪一段"）。 */
export function bandStats(arr) {
  const a = arr && typeof arr.length === 'number' ? arr : [];
  let sum = 0, peak = 0, peakAt = -1, nonzero = 0;
  for (let i = 0; i < a.length; i++) {
    const v = num(a[i], 0);
    sum += v;
    if (v > peak) { peak = v; peakAt = i; }
    if (v > 0) nonzero++;
  }
  const n = a.length || 1;
  return { length: a.length, mean: sum / n, peak, peakAt, nonzero, silent: nonzero === 0 };
}
