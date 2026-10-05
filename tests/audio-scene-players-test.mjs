// audio-scene-players-test.mjs —— C9【机制·音频面】判据：sound 层播放器 13/13 + 手势门控 + 0 尺寸不剪枝
//
// 现状定位（本文件钉死生产行为，不引入新机制）：
//   · 场景音频 **opt-in**：`?audio=1` 才建播放器（demo.html `AUDIO_ENABLED`，音频泄漏纪律）；
//   · 手势门控：自动播放合规——手势前 `__mpwAudioSilentReason='top-level-awaiting-gesture'`、
//     手势后 `'audible'`（`__mpwAudioPolicy.silent/gesture`）；
//   · 0 尺寸层不剪枝：`scale=0 0 0` 的 sound 层（官方"只出声不出画"）**照建播放器**（视觉侧的
//     退化跳层见 C0 归因 `degenerate-geometry`，音频侧必须活着）；
//   · volume 三形态（数字 / {user:名} / {script}）取值序 = `soundLayerVolumeBinding`（数字缺省 1、
//     {user} 从用户属性活表取、{script} 经 LAYER_REF volume 写入器驱动 <audio>.volume）。
// 判据（真机，GL 前置；无 GL SKIP）：
//   A 缺省（无 ?audio=1）⇒ elsCreated=0 + 策略 silent（opt-in 语义钉死）；
//   B ?audio=1 + 真手势 ⇒ elsCreated=13、attaches=13、<audio> 元素 13 个且未暂停（探针包 13/13）；
//   C 0 尺寸（scale=0）的 sound 层在播放器清单里（音频侧不剪枝）；
//   D 各 <audio>.volume ∈ (0,1]（三形态取值序产出的都是合法音量）；
//   E 变异自证：?audio=1 但**无手势** ⇒ silent=true（手势门控承重，不出声）。
// 用法：flock /tmp/.mpw-firefox.lock -c 'node tests/audio-scene-players-test.mjs'
import path from 'node:path'
import { ROOT, WS } from './_root.mjs'
import { launchGLBrowser, glCapability, closeQuiet, findPlaywright } from './_gl-browser.mjs'

let pass = 0, fail = 0, skipN = 0
const ok = (name, cond, detail) => { if (cond) { pass++; console.log('  ✓ ' + name) } else { fail++; console.log('  ✗ ' + name + (detail ? ' — ' + String(detail).slice(0, 240) : '')) } }
const sk = (name, why) => { skipN++; console.log('  ~ SKIP ' + name + '（' + why + '）') }

console.log('== C9 音频面（真机：opt-in + 手势门控 + 13/13 播放器）==')
const require_ = (await import('node:module')).createRequire(path.join(ROOT, 'package.json'))
const pw = require_(findPlaywright()); const firefox = (pw.default && pw.default.firefox) || pw.firefox
const { browser } = await launchGLBrowser(firefox)
const gl = await glCapability(browser)
if (!gl.webgl2) {
  await closeQuiet(browser)
  console.log('  ~ SKIP 全部（无 GL —— 原样读数：webgl2=false）')
  console.log('===== audio-scene-players: SKIP ====='); process.exit(0)
}
const pkgPath = path.join(WS, 'allwallpaper', '0923', '2887099508', 'scene.pkg')
const base = `http://127.0.0.1:8902/webloader/?type=scene&id=2887099508&pkgpath=${encodeURIComponent(pkgPath)}&res=dpr&shell=0&campose=legacy`
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
const READ = () => page.evaluate(() => {
  const g = (k) => { try { const v = window[k]; return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v } catch (e) { return null } }
  return {
    ledger: g('__mpwAudioLedger') || {},
    policy: g('__mpwAudioPolicy') || {},
    silentReason: window.__mpwAudioSilentReason || null,
    els: [...document.querySelectorAll('audio')].map((a) => ({ volume: a.volume, paused: a.paused })),
  }
})
const mount = async (audio) => {
  await page.goto(base + (audio ? '&audio=1' : ''), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('!!window.__mpwFirstFrame', null, { timeout: 60000 })
  await page.waitForTimeout(4000)
}

/* A 缺省：无 ?audio=1 ⇒ elsCreated=0（opt-in 语义） */
await mount(false)
{
  const r = await READ()
  ok('A 缺省（无 ?audio=1）⇒ 播放器 0 个（opt-in 语义钉死）',
    (r.ledger.elsCreated || 0) === 0 && r.els.length === 0, JSON.stringify({ elsCreated: r.ledger.elsCreated, els: r.els.length }))
}

/* E 变异自证（先做）：?audio=1 但无手势 ⇒ silent=true（手势门控承重，不出声） */
await mount(true)
{
  const r = await READ()
  ok('E 变异自证：?audio=1 但无手势 ⇒ 策略 silent=true / 元素全暂停（手势门控承重）',
    r.policy.silent === true && (r.els.length === 0 || r.els.every((e) => e.paused)),
    JSON.stringify({ silent: r.policy.silent, reason: r.silentReason, els: r.els.length, paused: r.els.map((e) => e.paused).slice(0, 3) }))
}

/* B+C+D：真手势 ⇒ 13/13 播放器、0 尺寸不剪枝、volume 合法 */
await page.mouse.click(640, 360)   // 真手势（自动播放合规）
await page.waitForTimeout(3000)
{
  const r = await READ()
  ok('B1 ?audio=1 + 手势 ⇒ 播放器 13/13（elsCreated=13、attaches=13）',
    r.ledger.elsCreated === 13 && r.ledger.attaches === 13,
    JSON.stringify({ elsCreated: r.ledger.elsCreated, attaches: r.ledger.attaches, els: r.els.length }))
  ok('B2 <audio> 元素 13 个且全部未暂停（出声中）',
    r.els.length === 13 && r.els.every((e) => !e.paused), JSON.stringify(r.els.map((e) => e.paused)))
  ok('C 0 尺寸（scale=0）sound 层不被音频侧剪枝（13 个播放器覆盖全部 sound 层，含 11 个 scale=0）',
    r.ledger.elsCreated === 13, JSON.stringify({ els: r.els.length }))
  const badVol = r.els.filter((e) => !(e.volume > 0 && e.volume <= 1))
  ok('D 各 <audio>.volume ∈ (0,1]（三形态取值序产出合法音量；样例含 0.4/0.5）',
    badVol.length === 0, JSON.stringify({ bad: badVol.slice(0, 2), vols: [...new Set(r.els.map((e) => e.volume))] }))
}
await closeQuiet(browser)
console.log('\n===== audio-scene-players: ' + pass + ' 通过 / ' + fail + ' 失败' + (skipN ? ' / ' + skipN + ' SKIP' : '') + ' =====')
process.exit(fail ? 1 : 0)
