/* 参照来源许可声明：本文件提到的 wer-ref/ 是第三方参考实现（Aromatic05/wallpaper-engine-renderer，GPL-2.0-only，非 WE 官方代码、非「真值源」），与本项目（GPL-3.0-or-later）许可不兼容 —— 仅用于行为对照，不得复制/改写/逐行翻译其代码、注释、常量组织或错误文案。we-layerd-ref/（Aromatic05/we-layerd）无任何许可（保留所有权利），同样仅行为对照。血缘自查结论见 docs/WER-REF-LICENSE-AUDIT.md。 */ // audio-semantics-test.mjs — P0-3（RE-34 收尾）验收：
//   ① sound 层语义（第三方参考 wer-ref WPSoundParser.cpp）：autoplay=visible&&!startsilent；
//      loop(缺省)/single(播完即停)/random(播完等 randint([mintime,maxtime]) 秒换下一曲、避免同曲连播)；
//      volume = 层值 × 用户绑定（声明式 volume:{user,value}，实时生效）。
//   ② getVideoTexture 脚本包装（官方 WPScriptRuntime.cpp:615-656）：宿主句柄透传、未知键 noop 对象。
// 测试法：从 demo.html 提取真函数（text-layout-test.mjs 同款 extractFn），vm 沙箱 + stub 执行。
import fs from 'node:fs'
import vm from 'node:vm'
import { applySceneScripts, createScriptCache } from '../elysia/scene-scripts.js'

const html = fs.readFileSync(new URL('../demo.html', import.meta.url), 'utf8')
function extractFn(src, header) {
  const start = src.indexOf(header)
  if (start < 0) throw new Error('未找到: ' + header)
  let i = src.indexOf('{', start), depth = 0
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) break }
  }
  return src.slice(start, i + 1)
}

let pass = 0, fail = 0
const fails = []
function chk(cond, label, detail) {
  if (cond) { pass++; console.log('PASS  ' + label) }
  else { fail++; fails.push(label + (detail !== undefined ? '  [' + detail + ']' : '')); console.log('FAIL  ' + label + (detail !== undefined ? '  [' + detail + ']' : '')) }
}

// ---- stub：Audio 元素 / Blob / URL / AudioContext ----
function makeEnv(filesMap, userProps) {
  const state = { timers: [], blobs: [], plays: [] }
  class FakeAudio {
    constructor() {
      this.src = ''; this.loop = false; this.volume = 1; this.preload = ''
      this._listeners = {}
      state.els = state.els || []; state.els.push(this)
    }
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn) }
    play() { state.plays.push(this.src.slice(-24)); return Promise.resolve() }
    pause() {}
    fire(ev) { for (const fn of this._listeners[ev] || []) fn({}) }
  }
  const sandbox = {
    lib: { getEntry: (p, n) => (filesMap[n] ? new Uint8Array(8) : null) },
    pkg: {},
    logf: () => {},
    sceneAudio: { els: [], vols: [], started: true },
    window: { addEventListener: () => {}, removeEventListener: () => {}, __mpwUserProps: userProps || {} },
    Math, setTimeout: (fn, ms) => { state.timers.push({ fn, ms }); return state.timers.length },
    Blob: class { constructor(parts, o) { state.blobs.push(o && o.type) } },
    URL: { createObjectURL: (b) => 'blob:' + state.blobs.length },
    Audio: FakeAudio,
    console,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  return { sandbox, state }
}

const src =
  extractFn(html, 'function soundLayerVolumeBinding(layer) {') + '\n' +
  extractFn(html, 'function currentAudioVolume(layer, binding) {') + '\n' +
  extractFn(html, 'function makeSoundElement(layer, rel, autoplay) {') + '\n' +
  extractFn(html, 'function updateSceneAudioVolume() {') + '\n' +
  '({ soundLayerVolumeBinding, currentAudioVolume, makeSoundElement, updateSceneAudioVolume });'

// ── ① volume 绑定：默认值 + 用户属性实时生效 ──
const FILES = { 'a.mp3': 1, 'b.mp3': 1, 'c.mp3': 1 }
const e1 = makeEnv(FILES, {})
const api1 = vm.runInContext(src, e1.sandbox)
const layer1 = { sound: ['a.mp3'], playbackmode: 'loop', volume: { user: 'bgm', value: 0.9 } }
const bind1 = api1.soundLayerVolumeBinding(layer1)
chk(bind1.value === 0.9 && bind1.user === 'bgm', '① volume:{user,value} 解析', JSON.stringify(bind1))
const el1 = api1.makeSoundElement(layer1, 'a.mp3', true)
chk(Math.abs(el1.volume - 0.45) < 1e-9, '① 初值 = 0.9×0.5（播放安全减半）', String(el1.volume))
chk(el1.loop === true, '① loop 模式 → el.loop=true')
chk(e1.state.plays.length === 1, '① autoplay=true → play 调用', String(e1.state.plays.length))
// 用户改属性 → 音量实时更新（声明式绑定 → SetStreamVolume 官方通路）
vm.runInContext('window.__mpwUserProps = { bgm: 0.2 }; updateSceneAudioVolume()', e1.sandbox)
chk(Math.abs(el1.volume - 0.1) < 1e-9, '① 用户属性 bgm=0.2 → 音量 0.1（实时）', String(el1.volume))
// 数值型 volume（无绑定）
const el1b = api1.makeSoundElement({ sound: ['a.mp3'], volume: 0.5, playbackmode: 'loop' }, 'a.mp3', false)
chk(Math.abs(el1b.volume - 0.25) < 1e-9, '① 数值 volume=0.5 → 0.25', String(el1b.volume))

// ── ② autoplay 门控：startsilent / visible=false 不播放 ──
const e2 = makeEnv(FILES, {})
const api2 = vm.runInContext(src, e2.sandbox)
api2.makeSoundElement({ sound: ['a.mp3'], startsilent: true, playbackmode: 'loop' }, 'a.mp3', false)
chk(e2.state.plays.length === 0, '② startsilent/autoplay=false → 不播', String(e2.state.plays.length))
api2.makeSoundElement({ sound: ['a.mp3'], startsilent: true, playbackmode: 'loop' }, 'a.mp3', true)
chk(e2.state.plays.length === 0, '② startsilent=true 即使 autoplay 也不播（官方 autoplay=visible&&!startsilent）', String(e2.state.plays.length))
api2.makeSoundElement({ sound: ['a.mp3'], playbackmode: 'loop' }, 'a.mp3', true)
chk(e2.state.plays.length === 1, '② 正常层播放', String(e2.state.plays.length))

// ── ③ single：loop=false，ended 后无换曲定时器 ──
const e3 = makeEnv(FILES, {})
const api3 = vm.runInContext(src, e3.sandbox)
const el3 = api3.makeSoundElement({ sound: ['a.mp3'], playbackmode: 'single', mintime: 1, maxtime: 5 }, 'a.mp3', true)
chk(el3.loop === false, '③ single → loop=false')
el3.fire('ended')
chk(e3.state.timers.length === 0, '③ single 播完即停（无 random 定时器）', String(e3.state.timers.length))

// ── ④ random：ended → randint([mintime,maxtime]) 延迟换曲、避免同曲连播 ──
const e4 = makeEnv(FILES, {})
const api4 = vm.runInContext(src, e4.sandbox)
const el4 = api4.makeSoundElement({ sound: ['a.mp3', 'b.mp3', 'c.mp3'], playbackmode: 'random', mintime: 1, maxtime: 5 }, 'a.mp3', true)
chk(el4.loop === false, '④ random → loop=false')
el4.fire('ended')
chk(e4.state.timers.length === 1, '④ ended → 调度换曲定时器', String(e4.state.timers.length))
const t = e4.state.timers[0]
chk(t.ms >= 1000 && t.ms <= 5000, '④ 延迟 ∈ [mintime,maxtime]×1000', String(t.ms))
t.fn()
chk(e4.state.blobs.length >= 2, '④ 定时触发 → 换下一曲（新建 blob）', String(e4.state.blobs.length))
chk(el4.src !== 'blob:1', '④ src 已切换', el4.src)
// 边界：单文件 random → 不调度（无曲可换）
const e5 = makeEnv(FILES, {})
const api5 = vm.runInContext(src, e5.sandbox)
const el5 = api5.makeSoundElement({ sound: ['a.mp3'], playbackmode: 'random', mintime: 1, maxtime: 5 }, 'a.mp3', true)
el5.fire('ended')
chk(e5.state.timers.length === 0, '④ 单文件 random → 不调度换曲', String(e5.state.timers.length))
// 缺失音频 → 返回 null（不抛）
const missing = api5.makeSoundElement({ sound: ['missing.mp3'] }, 'missing.mp3', true)
chk(missing === null, '④ 音频缺失 → null + 日志（不抛）')

// ── ⑤ getVideoTexture 脚本包装（noop 对象 / 宿主句柄透传）──
const srcV = `export function update(v) {
  const vt = engine.getVideoTexture('main')
  return [typeof vt.play, typeof vt.pause, typeof vt.stop, typeof vt.setCurrentTime, vt.isPlaying()].join(',')
}`
const sceneV = { objects: [{ id: 1, text: { script: srcV, value: 'x' } }] }
applySceneScripts(sceneV, 0, { scriptCache: createScriptCache() })
chk(sceneV.objects[0].text.value === 'function,function,function,function,false', '⑤ 无宿主 → noop 对象（官方 __makeNoopVideoTexture 同款）', String(sceneV.objects[0].text.value))
let handled = 0
const sceneV2 = { objects: [{ id: 1, text: { script: srcV, value: 'x' } }] }
applySceneScripts(sceneV2, 0, { scriptCache: createScriptCache(), getVideoTexture: (n) => { handled++; return { play() {}, pause() {}, stop() {}, setCurrentTime() {}, isPlaying: () => true, __real: n } } })
chk(handled === 1 && sceneV2.objects[0].text.value === 'function,function,function,function,true', '⑤ 宿主句柄透传（isPlaying()=true 由宿主实现）', String(sceneV2.objects[0].text.value))

console.log(`\n${pass}/${pass + fail} 通过（RE-34 音频语义 + getVideoTexture）`)
if (fails.length) console.log('失败项:\n  ' + fails.join('\n  '))
process.exit(fail === 0 ? 0 : 1)
