// audio-band-wiring-test.mjs — P-112-BANDGEOM（任务书 §5-4 / P1-5）128 元频段数组**接线**验收
//
// 断言对象不是模块本身（那是 tests/audio-band-array-test.mjs 的活），而是**接线**：
//   `demo.html` 的 `MPW-BANDFEED` 块（`?bandfeed=`）与 `MPW-AUDIOBUFFERS` 块（脚本侧入口），
//   连同"模块真在链路里"的三处落点（服务端路由 / 产物根映射 / 源码 import）。
//
// 手法（与 baseline-test / props-panel-test / log-panel 同一套）：把**真源码切片**出来，
//   用 `new Function` 注入桩（假 analyser / 假 window.parent / 假 location），跑真实分支。
//   不碰 DOM、不碰 GPU、不碰网络 ⇒ 确定性、~0.1s。
//
// 五组：
//   T1 开关真值表（缺省关；sim/real/垃圾值）
//   T2 模拟源：128 元 + γ/gain 曲线**逐位**对拍 + 不是全零（"接上了"的第一手证据）
//   T3 真实源：只钳位不套 γ（规格 §2.1/§5 的口径差异）+ 单声道不伪造立体声
//   T4 场景层消费点：`audioBuffers(n)` 的 left/right 由 128 元数组重采样而来；关时逐位回到旧路径
//   T5 宿主桥（提案消息）+ 诊断 + 三处落点 + **反向变异必红**
//
// 运行：node tests/audio-band-wiring-test.mjs   （全过输出 ALL PASS，退出码 0）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  packBands, simulatedBands, simulatedBandArray, bandStats, shapeBand, AUDIO_BAND_LEN, AUDIO_BAND_HALF,
} from '../core/audio-band-array.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0
const ok = (cond, label, detail) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + label + (detail ? '  ' + detail : ''))
  if (!cond) failed++
}
const near = (a, b, eps = 1e-6) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps

const HTML = fs.readFileSync(path.join(ROOT, 'demo.html'), 'utf8')
function slice(src, begin, end) {
  const i = src.indexOf(begin)
  if (i < 0) throw new Error('切片起点缺失: ' + begin)
  const j = src.indexOf(end, i)
  if (j < 0) throw new Error('切片终点缺失: ' + end)
  return src.slice(i, j + end.length)
}
const BAND_BLOCK = slice(HTML, '// ═══ MPW-BANDFEED-BEGIN', '// ═══ MPW-BANDFEED-END ═══')
const BUF_BLOCK = slice(HTML, '// ═══ MPW-AUDIOBUFFERS-BEGIN', '// ═══ MPW-AUDIOBUFFERS-END ═══')

/* ── 桩环境：把两个真源码块拼起来跑（依赖全部注入，源码里的裸标识符由形参遮蔽） ── */
function makeEnv(opts = {}) {
  const posted = []
  const logs = []
  const win = { parent: null, __mpwAudioBands: null, __mpwAudioBandSource: null }
  if (opts.embedded) win.parent = { postMessage: (m) => posted.push(m) }
  else win.parent = win                                   // 顶层页面：parent === window
  const analyser = opts.analyser || null
  const freq = opts.freq || (analyser ? new Uint8Array(analyser.frequencyBinCount) : null)
  const sceneAudio = { ctx: null, analyser, els: [], freq, started: !!analyser, vols: [] }
  const location = { search: opts.search || '' }
  const body = BAND_BLOCK + '\n' + BUF_BLOCK + `
return { BANDFEED, bandArrayNow, bandPublish, bandFrameTick, audioBuffers, last: () => bandLast, clock: () => bandClock }`
  const fn = new Function(
    'packBands', 'simulatedBandArray', 'bandStats', 'shapeBand', 'AUDIO_BAND_LEN', 'AUDIO_BAND_HALF',
    'sceneAudio', 'location', 'window', 'logf', body,
  )
  const api = fn(packBands, simulatedBandArray, bandStats, shapeBand, AUDIO_BAND_LEN, AUDIO_BAND_HALF,
    sceneAudio, location, win, (m) => logs.push(m))
  return { api, win, posted, logs, sceneAudio, location }
}
/** 造一个"真实源"analyser 桩：每段固定字节值（0..255），可指定返回数组长度 */
function fakeAnalyser(values, binCount) {
  const bins = binCount || values.length
  const freq = new Uint8Array(bins)
  return {
    frequencyBinCount: bins,
    getByteFrequencyData(target) { for (let i = 0; i < bins; i++) target[i] = (values[i % values.length] || 0) & 255 },
    _freq: freq,
  }
}

console.log('\n== T1 开关真值表（?bandfeed=）==')
{
  const cases = [
    ['', 'off'], ['?bandfeed=0', 'off'], ['?bandfeed=off', 'off'], ['?bandfeed=no', 'off'], ['?bandfeed=false', 'off'],
    ['?bandfeed=1', 'auto'], ['?bandfeed=on', 'auto'], ['?bandfeed=true', 'auto'], ['?bandfeed=SIM', 'sim'],
    ['?bandfeed=simulated', 'sim'], ['?bandfeed=real', 'real'], ['?bandfeed=ANALYSER', 'real'],
    ['?bandfeed=banana', 'off'], ['?bandfeed=', 'off'],
  ]
  let bad = 0
  for (const [s, want] of cases) { const e = makeEnv({ search: s }); if (e.api.BANDFEED !== want) { bad++; console.log('   ✗ ' + s + ' → ' + e.api.BANDFEED + '（期望 ' + want + '）') } }
  ok(bad === 0, 'T1a 14 条真值表全部命中（非法/空值一律回落"关"，不静默开）', '坏 ' + bad + ' 条')
  ok(makeEnv({}).api.BANDFEED === 'off' && makeEnv({ search: '?audio=1' }).api.BANDFEED === 'off',
    'T1b 缺省 = 关（`?audio=1` 也不连带打开 bandfeed ⇒ 默认路径零变化）')
}

console.log('\n== T2 模拟源：128 元 + γ/gain 曲线 + "确实有数据" ==')
{
  const e = makeEnv({ search: '?bandfeed=1' })
  const r = e.api.bandFrameTick(1.25)
  ok(r === undefined || r === null || true, 'T2a bandFrameTick 不抛错')
  const bands = e.win.__mpwAudioBands
  ok(bands instanceof Float32Array && bands.length === AUDIO_BAND_LEN, 'T2a 喂到消费点的是 128 元 Float32Array', bands && (bands.length + ' 元'))
  const stats = bandStats(bands)
  ok(stats.length === 128 && stats.silent === false && stats.peak > 0.3,
    'T2b 有数据（silent=false；`silent` 是"接上没有"的判据）', 'peak=' + stats.peak.toFixed(4) + ' peakAt=' + stats.peakAt)
  // "频谱要尖"（规格 §2.3）：模拟源在**节拍点上**把峰值顶到 1 附近 —— 单点取样可能落在拍间隙，
  //   所以按一个 132BPM 周期扫一遍取极值（这也是作者阈值 `band > 0.9` 能成立的判据）。
  let sweepPeak = 0, sweepAt = 0
  for (let t = 0; t < 2; t += 0.02) { const s = bandStats(simulatedBandArray(t)); if (s.peak > sweepPeak) { sweepPeak = s.peak; sweepAt = t } }
  ok(sweepPeak > 0.95, 'T2b 曲线是"尖"的（一个节拍周期内峰值 >0.95 ⇒ 阈值判定型作者能用）', 'sweepPeak=' + sweepPeak.toFixed(4) + ' @t=' + sweepAt.toFixed(2))
  ok(stats.peakAt < 64, 'T2c 峰值落在低频侧（底鼓/贝斯权重；模拟源刻意做得"像音乐"）', 'peakAt=' + stats.peakAt)

  const want = simulatedBandArray(1.25)
  let diff = 0
  for (let i = 0; i < 128; i++) if (!Object.is(bands[i], want[i])) diff++
  ok(diff === 0, 'T2d 与 `simulatedBandArray(1.25)` **逐位**相同（纯函数、无随机数 ⇒ 可对拍）')

  const pre = simulatedBands(1.25)
  const shaped = packBands(pre.preL, pre.preR)
  let diff2 = 0
  for (let i = 0; i < 128; i++) if (!Object.is(bands[i], shaped[i])) diff2++
  ok(diff2 === 0, 'T2e 曲线就是模块默认 γ=1.8/gain=1.8 那一条（`packBands` 默认档逐位相同）')
  ok(near(bands[0], shapeBand(pre.preL[0])) && near(bands[64], shapeBand(pre.preR[0])),
    'T2e 左 0..63 / 右 64..127 的通道布局在链路上保持')
  ok(e.api.last().source === 'simulated' && e.win.__mpwAudioBandSource === 'simulated',
    'T2f 源的来源被如实标注（simulated=模拟，analyser=真实）')
  ok(e.api.last().stats.silent === false, 'T2f 诊断读数（`bandStats`）跟着链路更新')
}

console.log('\n== T3 真实源：只钳位（不套 γ）+ 不伪造立体声 ==')
{
  // 前 64 个 bin 恒定 51（=0.2）、其余 0 ⇒ 重采样到 64 段后每段都是 0.2
  const an = fakeAnalyser(new Array(64).fill(51), 128)
  const e = makeEnv({ search: '?bandfeed=1', analyser: an })
  e.api.bandFrameTick(0.5)
  const bands = e.win.__mpwAudioBands
  ok(bands.length === 128 && near(bands[0], 0.2, 1e-6) && near(bands[63], 0.2, 1e-6),
    'T3a 真实频谱按 0..1 原样进入左通道（0.2 仍是 0.2）', 'L[0]=' + bands[0].toFixed(6))
  ok(near(bands[64], 0.2, 1e-6) && near(bands[127], 0.2, 1e-6), 'T3b 右通道同位（单 analyser ⇒ 两声道同源，非伪造差异）')
  ok(Math.abs(bands[0] - shapeBand(0.2)) > 0.1,
    'T3c **没有**再套一次 γ（真源 clampOnly；套了会把 0.2 顶到 ' + shapeBand(0.2).toFixed(4) + '）')
  ok(e.api.last().source === 'analyser', 'T3d 来源标注 = analyser（真实源优先于模拟源）')

  const e2 = makeEnv({ search: '?bandfeed=sim', analyser: an })
  e2.api.bandFrameTick(0.5)
  ok(e2.api.last().source === 'simulated', 'T3e `?bandfeed=sim` 强制模拟源（真实源在场也不用；做 A/B 用）')

  const e3 = makeEnv({ search: '?bandfeed=real' })
  e3.api.bandFrameTick(0.5)
  ok(e3.api.last().source === 'silent' && bandStats(e3.win.__mpwAudioBands).silent === true,
    'T3f `?bandfeed=real` 且没有数据源 ⇒ **全零** + silent=true（不假装有声音 —— 无系统环回的诚实口径）')

  const anZero = fakeAnalyser(new Array(64).fill(0), 128)
  const e4 = makeEnv({ search: '?bandfeed=1', analyser: anZero })
  e4.api.bandFrameTick(0.5)
  ok(bandStats(e4.win.__mpwAudioBands).silent === true && e4.api.last().source === 'analyser',
    'T3g 真实源在场但很安静 ⇒ silent=true 且 source=analyser（"没数据源"与"数据源很安静"可区分）')
}

console.log('\n== T4 场景层消费点：脚本 `registerAudioBuffers` 拿到的是同一份契约 ==')
{
  const e = makeEnv({ search: '?bandfeed=1' })
  e.api.bandFrameTick(2.0)
  const n = 16
  const bufs = e.api.audioBuffers(n)
  ok(bufs && bufs.left.length === n && bufs.right.length === n && bufs.average.length === n,
    'T4a `audioBuffers(n)` 三件套长度 = n（脚本侧契约不变）')
  const bands = e.api.last().bands
  let bad = 0
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * 64 / n), z = Math.max(a + 1, Math.floor((i + 1) * n / n * 64 / n) + 0)
    // 独立复算同一口径（左通道 0..63 → n 段均值）
    const a2 = Math.floor(i * AUDIO_BAND_HALF / n), z2 = Math.max(a2 + 1, Math.floor((i + 1) * AUDIO_BAND_HALF / n))
    let s = 0
    for (let k = a2; k < z2; k++) s += bands[k]
    if (!near(bufs.left[i], s / (z2 - a2))) bad++
    void a; void z
  }
  ok(bad === 0, 'T4b left 逐段等于"128 元数组左半 → n 段均值"的独立复算（接线真到了消费点）', '坏 ' + bad + ' 段')
  ok(bufs.left.some((v) => v > 0), 'T4c 非全零（脚本的音条会动，不是"静默 shim"）')
  let sum = 0
  for (let k = 0; k < AUDIO_BAND_LEN; k++) sum += bands[k]
  ok(near(bufs.average[0], sum / AUDIO_BAND_LEN), 'T4d average 用**整条 128 元**归一（左右都算，不是左半）')

  const e2 = makeEnv({})                                    // 关：旧路径（无 analyser ⇒ null）
  ok(e2.api.audioBuffers(8) === null, 'T4e 关时逐位回到旧路径（无 analyser ⇒ null，脚本走静默 shim）')
  const an = fakeAnalyser(new Array(64).fill(255), 128)
  const e3 = makeEnv({ analyser: an })                      // 关：旧路径（有 analyser ⇒ 旧口径 0..1 均值）
  const old = e3.api.audioBuffers(4)
  ok(old && old.left.length === 4 && near(old.left[0], 1) && old.right[0] === old.left[0] && old.left !== old.right,
    'T4e 关时旧路径照旧（`left` 是新数组、`right` 是它的 slice ⇒ 消费方改写 left 不会串到 right）')
}

console.log('\n== T5 宿主桥 + 诊断 + 落点 + 反向变异 ==')
{
  const e = makeEnv({ search: '?bandfeed=1', embedded: true })
  e.api.bandFrameTick(3.0)
  ok(e.posted.length === 1, 'T5a 嵌在宿主里 ⇒ 发出一帧（顶层页面不发：parent===window 直接返回）')
  const m = e.posted[0]
  ok(m && m.type === 'mpw-audio-bands' && m.v === 1 && m.len === AUDIO_BAND_LEN && Array.isArray(m.bands) && m.bands.length === 128,
    'T5a 消息形态 `{type:"mpw-audio-bands", v:1, len:128, bands:[128]}`')
  ok(Array.from(e.api.last().bands).every((v, i) => Object.is(v, m.bands[i])),
    'T5b 载荷与渲染侧同一份值（可 JSON 化 ⇒ 过得了 postMessage 结构化克隆）')
  ok(m.source === 'simulated' && typeof m.t === 'number', 'T5b 带 source/t（宿主可判"有没有数据源"）')
  const again = e.api.bandPublish(3.01)
  ok(again === null && e.posted.length === 1, 'T5c 节流：同 50ms 内不重复发（不影响渲染帧率）')
  ok(e.api.bandPublish(3.2) !== null && e.posted.length === 2, 'T5c 过窗口后恢复发送')
  const e2 = makeEnv({ search: '?bandfeed=1', embedded: false })
  e2.api.bandFrameTick(3.0)
  ok(e2.posted.length === 0, 'T5d 顶层页面零 postMessage（默认关之外的又一道"不外发"保险）')
  const e3 = makeEnv({ embedded: true })
  e3.api.bandFrameTick(3.0)
  ok(e3.posted.length === 0, 'T5d 关时零 postMessage')

  const stats = e.api.last().stats
  ok(stats && stats.length === 128 && typeof stats.silent === 'boolean', 'T5e `bandStats` 摘要进状态（诊断口径）')

  ok(HTML.indexOf("from './audio-band-array.mjs'") > 0, 'T5f demo.html 真源码里有模块 import（接线落点 1/3）')
  const server = fs.readFileSync(path.join(ROOT, 'server', 'we-scene-demo-server.mjs'), 'utf8')
  ok(server.indexOf("p === '/audio-band-array.mjs'") > 0, 'T5f 自带服务器有同名路由（落点 2/3：浏览器相对说明符解析得到）')
  const bp = fs.readFileSync(path.join(ROOT, 'build-pages.mjs'), 'utf8')
  ok(/core\/audio-band-array\.mjs', 'audio-band-array\.mjs'/.test(bp), 'T5f 产物根映射在位（落点 3/3：Pages 下也 200）')
  const spec = fs.readFileSync(path.join(ROOT, 'docs', 'AUDIO-BAND-SPEC.md'), 'utf8')
  ok(spec.indexOf('AUDIO-BAND-WIRING.md') > 0, 'T5g 规格 §6 已指向接线文档（"未接线"口径不再陈旧）')
  ok(fs.existsSync(path.join(ROOT, 'docs', 'AUDIO-BAND-WIRING.md')), 'T5g 接线文档在位（docs/AUDIO-BAND-WIRING.md）')

  /* ── 反向变异：把接线改回旧行为 ⇒ 上面两条最关键的断言必须变红 ── */
  const red = []
  // 变异 1：真实源不再 clampOnly（改成默认 γ/gain 曲线）⇒ T3c 必红
  const mutated1 = BAND_BLOCK.replace('packBands(pair.left, pair.right, bandReuse, { clampOnly: true })',
    'packBands(pair.left, pair.right, bandReuse, {})')
  ok(mutated1 !== BAND_BLOCK, 'T5h 变异生效（真源分支确有 clampOnly 字样可改）')
  {
    const an = fakeAnalyser(new Array(64).fill(51), 128)
    const posted = []
    const win = { parent: { postMessage: (x) => posted.push(x) }, __mpwAudioBands: null }
    const sceneAudio = { analyser: an, freq: null, started: true, els: [], vols: [] }
    const body = mutated1 + '\nreturn { bandArrayNow, bandFrameTick, last: () => bandLast }'
    const api = new Function('packBands', 'simulatedBandArray', 'bandStats', 'shapeBand', 'AUDIO_BAND_LEN', 'AUDIO_BAND_HALF',
      'sceneAudio', 'location', 'window', 'logf', body)(
      packBands, simulatedBandArray, bandStats, shapeBand, AUDIO_BAND_LEN, AUDIO_BAND_HALF,
      sceneAudio, { search: '?bandfeed=1' }, win, () => {})
    api.bandFrameTick(0.5)
    const v = win.__mpwAudioBands[0]
    const redOk = Math.abs(v - 0.2) > 1e-9                    // 期望"变异后不再是 0.2"
    if (redOk) red.push('变异1(去 clampOnly)：0.2 → ' + v.toFixed(6) + ' ⇒ T3c「没有套 γ」变红')
  }
  // 变异 2：关掉 bandfeed 分支（audioBuffers 回到旧路径）⇒ T4a/T4c 必红
  const mutated2 = BUF_BLOCK.replace("if (BANDFEED !== 'off') {", "if (false) {")
  ok(mutated2 !== BUF_BLOCK, 'T5h 变异生效（脚本侧分支确有 BANDFEED 判据可改）')
  {
    const win = { parent: null, __mpwAudioBands: null }
    const sceneAudio = { analyser: null, freq: null, started: false, els: [], vols: [] }
    const body = BAND_BLOCK + '\n' + mutated2 + '\nreturn { audioBuffers, bandFrameTick }'
    const api = new Function('packBands', 'simulatedBandArray', 'bandStats', 'shapeBand', 'AUDIO_BAND_LEN', 'AUDIO_BAND_HALF',
      'sceneAudio', 'location', 'window', 'logf', body)(
      packBands, simulatedBandArray, bandStats, shapeBand, AUDIO_BAND_LEN, AUDIO_BAND_HALF,
      sceneAudio, { search: '?bandfeed=1' }, win, () => {})
    api.bandFrameTick(1.0)
    const bufs = api.audioBuffers(16)
    if (bufs === null) red.push('变异2(关分支)：`audioBuffers(16)` 变回 null ⇒ T4a/T4c 变红')
  }
  ok(red.length === 2, 'T5h RED-IF-REVERTED：两条最关键的断言在"改回旧行为"后确实变红')
  for (const r of red) console.log('   RED ' + r)
}

console.log(failed ? `\n${failed} 项失败` : '\nALL PASS')
process.exit(failed ? 1 : 0)
