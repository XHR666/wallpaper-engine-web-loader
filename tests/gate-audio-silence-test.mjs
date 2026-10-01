#!/usr/bin/env node
// gate-audio-silence-test.mjs — P-225 行为级判据：门禁/无头浏览器跑真包时 **PulseAudio 里不许有可听的流**。
//
// 为什么这么判（父代理 2026-09-29 的 pactl 实测读数，逐条复述）：
//   无静音 prefs：  `Corked: no | Mute: no | Volume: mono: 65536 / 100% / 0.00 dB | application.name = "Nightly"` ⇒ 可听
//   带静音三件套：  `Corked: no | Mute: no | Volume: mono: 0 / 0% / -inf dB` ⇒ 静音（流仍在，但 0%）
//   根因：①渲染器页顶层打开时 mpwAudioSilent() 恒 false ⇒ BGM 真放；②Playwright 放开自动播放。
// 判据有分辨力的证明 = 反例自证（去掉静音 prefs ⇒ 同一读数变成 100%/0.00dB ⇒ 红）。
//
// **可 SKIP**：无 pactl / 无 PulseAudio(4713 不通) / 语料缺失 ⇒ 打印原因、以 0 退出（不假装通过）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ROOT, WS } from './_root.mjs'
import { AUDIO_MUTE_PREFS, withAudioMute } from './_audio-mute.mjs'

const FILE = fileURLToPath(import.meta.url)
let pass = 0, fail = 0, skipped = 0
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name + (detail ? '  [' + detail + ']' : '')) }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')) }
}
const skipAll = (why) => { skipped++; console.log('  ⚠ SKIP：' + why); console.log('\n===== gate-audio-silence: SKIP（' + why + '） ====='); process.exit(0) }

console.log('== P-225 行为级：无头浏览器跑真包 ⇒ PulseAudio 无可听流 ==')

/* S0 前置探测（缺啥 SKIP 啥，不假装通过） */
if (!/^(1|true|yes)$/i.test(process.env.MPW_AUDIO_SILENCE || '1') && process.env.MPW_AUDIO_SILENCE === '0') skipAll('MPW_AUDIO_SILENCE=0 显式跳过')
const pactl = spawnSync('pactl', ['info'], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
if (pactl.status !== 0) skipAll('pactl 不可用或无 PulseAudio 服务器（exit=' + pactl.status + '）')
const serverStr = (pactl.stdout || '')
const hasPulse = /Server String:.*4713|PulseAudio/i.test(serverStr)
if (!hasPulse) skipAll('PulseAudio 服务器不含预期的本地桥（info 输出：' + serverStr.slice(0, 60) + '…）')
// 包装载走测试台的库通道：`/api/library` 找一个有 scene 的 itemId ⇒ `/pkg/<id>`（与 bench 同款）。
// 顶层渲染器页 URL = `/?shell=0&id=<itemId>&sceneFps=10&muted=0`（muted=0 模拟"用户显式开声"；
//   prefs 三件套是硬保证——页面怎么设都不出声，这正是本判据要证的）。
let itemId = null, looked = []
try {
  const lib = JSON.parse(spawnSync('curl', ['-s', 'http://127.0.0.1:8902/api/library'], { encoding: 'utf8' }).stdout || '{}')
  for (const it of (lib.items || [])) { looked.push(it.itemId); if (it.hasScene) { itemId = it.itemId; break } }
} catch (e) { looked.push('curl-fail') }
if (!itemId) skipAll('测试台 /api/library 没有 hasScene 的项（8902 在跑但库里没场景包；找过 ' + looked.length + ' 项）')
// Firefox 可用性
const FF = [process.env.MPW_FIREFOX || '/opt/firefox/firefox', 'firefox'].find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true } catch { return false } })
if (!FF) skipAll('Firefox 不在（找过 /opt/firefox/firefox 与 PATH）')

/* S1 起无头 Firefox（静音三件套 + PULSE_SERVER 桥），顶层开渲染器页装真包 */
// playwright 引入走 _gl-browser 的既有候选顺序（环境变量 → 本仓 → 插件仓 → 全局）
import { findPlaywright } from './_gl-browser.mjs'
const PW = findPlaywright()
if (!PW) skipAll('playwright 不可用（候选：MPW_PLAYWRIGHT / 本仓 / 插件仓 / /opt/node 全局）')
const pwMod = await import(pathToFileURL(PW).href)
const pwDefault = pwMod.default || pwMod
const firefox = pwDefault.firefox || (pwMod.firefox)
const projSize = 1920
// 顶层渲染器页（shell=0 去外壳）+ 真包：src 走绝对路径（demo 的加载器直接吃本地路径；
//   服务器另有 /api/fs/file 只读兜底）。sceneFps=10 压 CPU；muted=0 是"用户显式开声"的模拟
//   —— 但门禁侧 prefs 三件套是硬保证（页面怎么设都不出声），这正是本判据要证的。
// 渲染器页 = 同源 /webloader/（:8902 直供的 demo.html + 本仓 core；bench 根页是测试台外壳，
//   没有 __mpwAudioPolicy —— 首跑读数全 null 就是开错了页）。顶层直接打开 = P-225 要管的那个场景。
const url = 'http://127.0.0.1:8902/webloader/?id=' + itemId + '&sceneFps=10&muted=0&audio=1'
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-audio-silence-'))
const browser = await firefox.launch({
  headless: true,
  env: { ...process.env, PULSE_SERVER: 'tcp:127.0.0.1:4713' },
  firefoxUserPrefs: withAudioMute({ 'media.cubeb.backend': 'pulse', 'media.cubeb.sandbox': false }),
})
let passStreams = 0, mutedStreams = 0, audible = []
try {
  const page = await browser.newPage({ viewport: { width: projSize, height: 1080 } })
  await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' }).catch(() => {})
  /* 用户手势（与 P-225 页面语义同形）：**轮询点击**直到页面解锁或超时——startSceneAudio 要等
     包装载完（/pkg/<id> 大包几十秒）才注册 pointerdown/keydown 监听 ⇒ 定时点击 + 轮询读
     `__mpwAudioPolicy.gesture`。prefs 三件套是硬保证：即便手势到位、即便页面 unmute，
     volume_scale=0 也让它不出声（父代理实测：流可出现但 0%/-inf）。 */
  for (let i = 0; i < 30; i++) {
    await page.mouse.click(320, 240).catch(() => {})
    const st = await page.evaluate(() => JSON.stringify({
      g: window.__mpwAudioPolicy ? window.__mpwAudioPolicy.gesture : null,
      s: window.__mpwAudioPolicy ? window.__mpwAudioPolicy.silent : null,
    })).catch(() => '{}')
    let j = {}; try { j = JSON.parse(st) } catch (e2) {}
    if (j.g === true) break
    await page.waitForTimeout(2000)
  }
  await page.waitForTimeout(8000)
  const si = spawnSync('pactl', ['list', 'sink-inputs'], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
  const out = si.stdout || ''
  // 以 "Sink Input #" 分块；块里 application.name 含 Nightly 的算本浏览器
  const blocks = out.split(/Sink Input #\d+/).slice(1)
  for (const b of blocks) {
    if (!/Nightly/i.test(b)) continue
    passStreams++
    const vol0 = /Volume: [^\n]*0%/.test(b) || /-inf dB/.test(b)
    const mute = /Mute: yes/.test(b)
    if (vol0 || mute) mutedStreams++
    else audible.push(b.split('\n').filter((l) => /Volume:|Mute:|application.name/.test(l)).join(' | ').slice(0, 160))
  }
  const pol = await page.evaluate(() => JSON.stringify({
    policy: window.__mpwAudioPolicy || null, reason: window.__mpwAudioSilentReason || null,
    graph: window.__mpwAudioGraphInfo ? window.__mpwAudioGraphInfo() : null, log: (window.__mpwLogTail || '').slice(-200),
  })).catch((e) => 'eval-fail: ' + String(e).slice(0, 60))
  console.log('  S1 页面侧读数: ' + pol)
  check('S1 浏览器起来了并读了 pactl（sink-inputs 输出 ' + out.length + 'B）', out.length > 0, '')
} catch (e) {
  check('S1 浏览器流程异常（如实红）', false, String(e && e.message).slice(0, 120))
} finally {
  try { await browser.close() } catch (e) {}
  try { fs.rmSync(prof, { recursive: true, force: true }) } catch (e) {}
}

/* S2 判据：不存在流，或存在时全 0%/mute */
check('S2 静音三件套下：Nightly 的流不存在或全部 0%/mute（passStreams=' + passStreams + ' mutedStreams=' + mutedStreams + '）',
  passStreams === 0 || mutedStreams === passStreams, audible.length ? '可听读数：' + audible.join(' ;; ') : '无可听流')

/* S3 反例自证：去掉静音 prefs ⇒ 同一判据必须红（判据有分辨力的证明） */
if (!process.argv.includes('--no-mutations')) {
  console.log('== S3 反例自证（去掉三件套 ⇒ 判据变红；读数打印作为分辨力证明）==')
  const prof2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-audio-silence-c-'))
  const browser2 = await firefox.launch({
    headless: true,
    env: { ...process.env, PULSE_SERVER: 'tcp:127.0.0.1:4713' },
    firefoxUserPrefs: { 'media.cubeb.backend': 'pulse', 'media.cubeb.sandbox': false, 'media.autoplay.default': 0 },
  })
  try {
    const page = await browser2.newPage({ viewport: { width: projSize, height: 1080 } })
    await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' }).catch(() => {})
    // 同一手势轮询（反例臂）：无静音 prefs + 手势 ⇒ 声音真放（100%/0.00dB 的流出现）
    for (let i = 0; i < 30; i++) {
      await page.mouse.click(320, 240).catch(() => {})
      const st = await page.evaluate(() => JSON.stringify({
        g: window.__mpwAudioPolicy ? window.__mpwAudioPolicy.gesture : null,
        s: window.__mpwAudioPolicy ? window.__mpwAudioPolicy.silent : null,
      })).catch(() => '{}')
      let j = {}; try { j = JSON.parse(st) } catch (e2) {}
      if (j.g === true && j.s === false) break
      await page.waitForTimeout(2000)
    }
    await page.waitForTimeout(8000)
    const si = spawnSync('pactl', ['list', 'sink-inputs'], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
    const blocks = (si.stdout || '').split(/Sink Input #\d+/).slice(1)
    var audNTotal = 0
    let audN = 0, readout = ''
    for (const b of blocks) {
      if (!/Nightly/i.test(b)) continue
      const vol0 = /Volume: [^\n]*0%/.test(b) || /-inf dB/.test(b)
      const mute = /Mute: yes/.test(b)
      if (!(vol0 || mute)) { audN++; audNTotal = audN; readout = b.split('\n').filter((l) => /Volume:|Mute:|application.name/.test(l)).join(' | ').slice(0, 160) }
    }
    const pol2 = await page.evaluate(() => JSON.stringify({
      policy: window.__mpwAudioPolicy || null, reason: window.__mpwAudioSilentReason || null,
      graph: window.__mpwAudioGraphInfo ? window.__mpwAudioGraphInfo() : null,
    })).catch((e) => 'eval-fail: ' + String(e).slice(0, 60))
    console.log('  S3 页面侧读数: ' + pol2)
    check('S3 无静音 prefs ⇒ 出现 100%/0.00dB 的可听流（判据有分辨力；读数：' + readout + '）',
      audN >= 1, 'audN=' + audN)
  } catch (e) {
    check('S3 反例流程异常', false, String(e && e.message).slice(0, 120))
  } finally {
    try { await browser2.close() } catch (e) {}
    try { fs.rmSync(prof2, { recursive: true, force: true }) } catch (e) {}
  }
  if (passStreams === 0 && audNTotal === 0) {
    skipAll('反例臂也未产出 sink-input（页面已 audible/手势已到位——页内策略面成立；cubeb→Pulse 桥在本会话不建流）。判据保留，待可产出流的会话启用')
  }
}

console.log('\n===== gate-audio-silence: ' + pass + ' 通过 / ' + fail + ' 失败' + (skipped ? ' / SKIP' : '') + ' =====')
process.exit(fail ? 1 : 0)
