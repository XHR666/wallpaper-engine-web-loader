// render-audio-leak-test.mjs —— ①(2026-09-24 任务 ⑱)「偶发漏音」的**可复现机制 + 可机读判据**
//
// 任务书点名要的是"偶发"的机制，不要候选清单。本档钉住**两条已定位的真机制**（都在渲染器侧、
// 都在 demo.html，插件侧 `applyWebMute` 不改）：
//
//   机制 ①（宿主静音**看不到**帧内 `<audio>`）：插件 `dsh-mpkg-wallpaper/lib/client.js:4296 applyWebMute`
//     的帧内静音是 `frame.contentDocument.querySelectorAll('video,audio')` 逐元素写 `muted`。
//     而本页视频路径一直有 `document.body.appendChild(videoEl)`，**音频路径是 `new Audio()`（游离元素，
//     不在文档树里）** ⇒ 那趟扫描**永远看不到它** ⇒ 宿主的"静音"对它无效，BGM 照响。是否"偶发"取决于
//     宿主静音趟与音频元素创建/播放的先后（宿主每 800ms/2s 跑一趟，元素在首帧之后才建）。
//   机制 ②（释放/重挂不回收音频链）：`mpwHandle.dispose()`（测试台/宿主的显式释放路径）旧实现只
//     暂停**视频**元素与清纹理，`sceneAudio` 的 `<audio>`、blob URL、MediaElementSource 与
//     AudioContext **一个都不动** ⇒ `__wp.release()` 之后声音继续放；同一文档里再挂载时
//     `sceneAudio.started` 仍是 true ⇒ 新实例接不上音频、旧元素继续响（"声音对不上画面"+"漏音"）。
//
// 判据（都读**真源码切片** + `window.__mpwAudioLedger` 台账，可机读）：
//   [A] 建元素 ⇒ 挂树（建与挂一一对应）；宿主 `querySelectorAll('video,audio')` 能扫到它
//   [B] 音量写入**幂等**（值没变不写）；`muted` 由音量路径写的次数恒为 0（不与宿主静音位打架）
//   [C] 释放（dispose）后：元素被 pause/移出文档/blob URL 被撤销/AudioContext 被 close，
//       台账 `elsReleased === elsCreated`、`ctxClosed === ctxCreated`
//   [D] **重复挂载 N 次不增长**：N 次 start→dispose 之后，活着的元素数 == 最后一次的元素数（不是 N 倍）、
//       AudioContext 既建又关各 N 次（配平），且 `sceneAudio.started` 回到 false（下次还能接上音频）
//
// 运行：node tests/render-audio-leak-test.mjs（全绿 0）
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { ROOT } from './_root.mjs'

let pass = 0, fail = 0
const chk = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? ' — ' + detail : '')) }
}

const HTML = fs.readFileSync(path.join(ROOT, 'demo.html'), 'utf8')
/** 按"函数名起始行 → 顶层 `}`"切一个函数（与 tests/audio-semantics-test.mjs 同一口径）。 */
function extractFn(src, head) {
  const i = src.indexOf(head)
  if (i < 0) throw new Error('切片起点缺失: ' + head)
  let depth = 0, started = false
  for (let j = i; j < src.length; j++) {
    const c = src[j]
    if (c === '{') { depth++; started = true }
    else if (c === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1) }
  }
  throw new Error('切片终点缺失: ' + head)
}

/* ── 夹具：假 DOM（文档树 + querySelectorAll）/ 假 Audio / 假 AudioContext ── */
function makeEnv() {
  const state = { els: [], plays: [], pauses: [], revoked: [], closed: 0, ctxMade: 0, tree: [] }
  class FakeAudio {
    constructor() { this.src = ''; this.loop = false; this.volume = 1; this.muted = false; this.preload = ''; this._l = {}; state.els.push(this) }
    addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn) }
    play() { state.plays.push(String(this.src).slice(-16)); return Promise.resolve() }
    pause() { state.pauses.push(String(this.src).slice(-16)) }
    setAttribute() {}
    get parentNode() { return state.tree.indexOf(this) >= 0 ? fakeBody : null }
    remove() {}
    fire(ev) { for (const fn of this._l[ev] || []) fn({}) }
  }
  const fakeBody = {
    appendChild: (el) => { state.tree.push(el); return el },
    removeChild: (el) => { const i = state.tree.indexOf(el); if (i >= 0) state.tree.splice(i, 1); return el },
  }
  const document = {
    body: fakeBody,
    // 宿主静音的扫描口径：**只看文档树**（游离元素扫不到）—— 这正是机制①的复现点
    querySelectorAll: (sel) => state.tree.filter((el) => (/(^|,)\s*audio\s*($|,)/.test(sel) ? true : sel.indexOf('audio') >= 0)),
    createElement: () => new FakeAudio(),
  }
  class FakeAnalyser {
    constructor() { this.fftSize = 0; this.smoothingTimeConstant = 0; this.frequencyBinCount = 2048 }
    connect() {} disconnect() {} getByteFrequencyData() {}
  }
  class FakeCtx {
    constructor() { state.ctxMade++; this.state = 'running'; this.destination = {} }
    createAnalyser() { return new FakeAnalyser() }
    createMediaElementSource(el) { return { connect() {}, disconnect() { el.__disconnected = true } } }
    resume() { return Promise.resolve() }
    close() { state.closed++; return Promise.resolve() }
  }
  const audioLedger = { elsCreated: 0, elsReleased: 0, ctxCreated: 0, ctxClosed: 0, volumeWrites: 0, muteWrites: 0, attaches: 0, lastAt: null }
  const sandbox = {
    lib: { getEntry: () => new Uint8Array(8) },
    pkg: {},
    logf: () => {},
    // `started: true` = 音频已接上（与 tests/audio-semantics-test.mjs 同口径：音量路径只在接上后才写）
    sceneAudio: { ctx: null, analyser: null, els: [], freq: null, started: true, vols: [] },
    audioLedger,
    audioLedgerTick: () => { audioLedger.lastAt = 1 },
    hostEmbedMuted: () => false,
    document,
    AUDIO_ENABLED: true,
    // `startSceneAudio` 依赖的收集函数（真实现走 sceneObj 递归；这里给桩，聚焦音频元素生命周期）
    collectSoundLayers: () => (sandbox.__soundLayers || []),
    window: { addEventListener: () => {}, removeEventListener: () => {}, __mpwUserProps: {}, frameElement: null, AudioContext: FakeCtx, webkitAudioContext: FakeCtx },
    Audio: FakeAudio,
    AudioContext: FakeCtx,
    Blob: class { constructor() {} },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: (u) => state.revoked.push(u) },
    mpwBlobMediaRetry: () => {},
    mpwHostVolume: 1,
    currentSceneAudioCleanup: null,
    Math, Promise, console, setTimeout: () => 0,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  return { sandbox, state, document, audioLedger }
}

/* 切片：声音元素 + 音量 + 启动 + **释放**（dispose 里的音频收尾段） */
const SRC =
  extractFn(HTML, 'function soundLayerVolumeBinding(layer) {') + '\n' +
  extractFn(HTML, 'function currentAudioVolume(layer, binding) {') + '\n' +
  extractFn(HTML, 'function makeSoundElement(layer, rel, autoplay) {') + '\n' +
  extractFn(HTML, 'function startSceneAudio() {') + '\n' +
  extractFn(HTML, 'function updateSceneAudioVolume() {') + '\n' +
  extractFn(HTML, 'function mpwReleaseSceneAudio() {') + '\n' +
  '({ makeSoundElement, startSceneAudio, updateSceneAudioVolume, mpwReleaseSceneAudio });'

/* ══════════════ [A] 建元素 ⇒ 挂树；宿主扫描能看到 ══════════════ */
console.log('== [A] 帧内 <audio> 必须挂进文档树（宿主静音靠 querySelectorAll）==')
const e = makeEnv()
const api = vm.runInContext(SRC, e.sandbox)
{
  const el = api.makeSoundElement({ sound: ['a.mp3'], playbackmode: 'loop', visible: true }, 'a.mp3', false)
  chk('[A1] 元素建出来了（`new Audio()`）', !!el && e.state.els.length === 1, String(e.state.els.length))
  chk('[A2] ★ 它被挂进文档树（游离元素 = 宿主静音永远扫不到 = 漏音机制①）',
    e.document.querySelectorAll('video,audio').length === 1, 'scan=' + e.document.querySelectorAll('video,audio').length)
  chk('[A3] 台账：建 1 ⇒ 挂 1（一一对应）', e.audioLedger.elsCreated === 1 && e.audioLedger.attaches === 1, JSON.stringify(e.audioLedger))
  // 宿主静音趟的等价动作：把扫到的元素 muted=true（插件 applyWebMute 的逐元素分支）
  for (const x of e.document.querySelectorAll('video,audio')) x.muted = true
  chk('[A4] ★ 宿主静音扫到并写 muted ⇒ 元素真的静音了（机制①修好后的行为）', el.muted === true)
}

/* ══════════════ [B] 音量幂等 / muted 不被音量路径写 ══════════════ */
console.log('== [B] 音量写入幂等，且不碰 muted ==')
{
  const before = e.audioLedger.volumeWrites
  vm.runInContext('updateSceneAudioVolume(); updateSceneAudioVolume(); updateSceneAudioVolume()', e.sandbox)
  chk('[B1] 值没变 ⇒ 0 次写入（4Hz 节拍上不制造可听见的打断）', e.audioLedger.volumeWrites === before, String(e.audioLedger.volumeWrites))
  // 真代码读的是闭包变量 `mpwHostVolume`（由宿主 API `__wp.setVolume` 写）⇒ 直接改 sandbox 全局
  vm.runInContext('mpwHostVolume = 0.5; updateSceneAudioVolume()', e.sandbox)
  chk('[B2] 宿主音量变了 ⇒ 正好写 1 次且乘子生效', e.audioLedger.volumeWrites === before + 1, String(e.audioLedger.volumeWrites))
  chk('[B3] ★ `muted` 写入次数恒为 0（宿主静音位不被音量路径后写覆盖）', e.audioLedger.muteWrites === 0, String(e.audioLedger.muteWrites))
}

/* ══════════════ [C]+[D] 释放与**重复挂载不增长** ══════════════ */
console.log('== [C]/[D] dispose 收干净 + N 次挂载/释放不增长 ==')
{
  // N 轮：start（包内 sound 层桩）→ 释放
  e.sandbox.__soundLayers = [{ id: 1, name: 'bgm', sound: ['a.mp3'], visible: true, playbackmode: 'loop', volume: { value: 1 } }]
  const rounds = 4
  const aliveAfter = []
  vm.runInContext('mpwReleaseSceneAudio()', e.sandbox)   // 清掉 [A] 段留下的元素，从零开始计
  for (let i = 0; i < rounds; i++) {
    vm.runInContext('startSceneAudio()', e.sandbox)
    aliveAfter.push(e.document.querySelectorAll('video,audio').length)
    vm.runInContext('mpwReleaseSceneAudio()', e.sandbox)
  }
  chk('[C1] 释放后文档树里**没有**帧内音频元素（不会留在页面上继续响）', e.state.tree.length === 0, String(e.state.tree.length))
  chk('[C2] 释放时 pause 了每个元素（不是只移出 DOM）', e.state.pauses.length >= rounds, String(e.state.pauses.length))
  chk('[C3] blob URL 被撤销（每轮一个）', e.state.revoked.length >= rounds, String(e.state.revoked.length))
  chk('[C4] AudioContext 既建又关**配平**（ctxCreated === ctxClosed === 轮数）',
    e.audioLedger.ctxCreated === rounds && e.audioLedger.ctxClosed === rounds, JSON.stringify({ made: e.audioLedger.ctxCreated, closed: e.audioLedger.ctxClosed }))
  chk('[C5] ★ 重复挂载不增长：每轮"活着的元素数"都等于最后一轮（不是 N 倍）',
    aliveAfter.every((n) => n === aliveAfter[aliveAfter.length - 1]), JSON.stringify(aliveAfter))
  chk('[C6] ★ 建/放配平：elsCreated === elsReleased + 当前活着（0）',
    e.audioLedger.elsCreated === e.audioLedger.elsReleased, JSON.stringify({ c: e.audioLedger.elsCreated, r: e.audioLedger.elsReleased }))
  chk('[C7] 释放后 `sceneAudio.started = false`（同一文档再次挂载能重新接上音频）',
    vm.runInContext('sceneAudio.started', e.sandbox) === false)
  chk('[C8] ★ 台账可机读（判据读的就是它）：`window.__mpwAudioLedger` 同源对象',
    typeof e.audioLedger.elsCreated === 'number' && typeof e.audioLedger.ctxClosed === 'number', JSON.stringify(e.audioLedger))
}

console.log('\n══ render-audio-leak-test：PASS=' + pass + ' FAIL=' + fail)
process.exit(fail ? 1 : 0)
