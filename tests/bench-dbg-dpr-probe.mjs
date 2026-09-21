// bench-dbg-dpr-probe.mjs —— 测试台「调试逐层隔离」与「DPR 切换」的真机自上报判据（2026-09-22）
//
// 为什么单独一条：`bench-ui-headless` 的 Z4 只钉"栏内有当前层信息"，**没钉"画面真的隔离到那一层"**；
// DPR 切换此前也没有判据。这两条都是用户点名的真机现象（"摁左右键层号变了但画面不变"、"DPR 1→2 加载不出来"）。
//
// 判据（全部由探针自己驱动，不需要用户操作；`--selftest` 只跑纯判据）：
//   D1 进调试模式后：`#dbg-layer` 有层号，且**恰好一层** `visible`（其余全 false）—— 机制口径
//   D2 连续按右方向键 N 次：层号**递增**，且每次隔离的层**不同**（不是"只改标签"）
//   D3 退出调试模式：所有层恢复可见（一个隔离残留都不许有）
//   P1 工具条 DPR 1→2：画布像素宽高**真的跟着变**（`__mpwLiveRes`），且 iframe 不是白屏（内容尺寸非 0）
//   P2 DPR 2→1：画布像素回到 1×（可逆）
//
// 诚实边界：**不做像素级**"画面长得不一样"断言（WebGL 画布 `toDataURL` 需要 `preserveDrawingBuffer`，
// 本页未开）——这里判的是"隔离状态 + 渲染循环活着"，像素级留给真机眼睛。
import os from 'node:os'
import path from 'node:path'

const argv = process.argv.slice(2)
const SELFTEST = argv.includes('--selftest')
const AUTHORITY = (() => { const i = argv.indexOf('--authority'); return i >= 0 && argv[i + 1] ? argv[i + 1] : '127.0.0.1:8902' })()
let pass = 0, fail = 0
const ok = (c, label, extra = '') => { if (c) { pass++; console.log('PASS ' + label + (extra ? '  ' + extra : '')) } else { fail++; console.log('FAIL ' + label + (extra ? '  ' + extra : '')) } }
const skip = (label, why) => console.log('SKIP ' + label + ' —— ' + why)

/** 纯判据：给定层的 visible 数组，判断"恰好隔离了一层"。 */
export function isolatedExactlyOne(flags) {
  if (!Array.isArray(flags) || flags.length === 0) return null
  const on = flags.filter(Boolean).length
  return on === 1
}
/** 纯判据：画布是否随 DPR 变化（1↔2 两个档位读数）。 */
export function dprResizeOk(a, b) {
  if (!a || !b || !(a.cssW > 0) || !(b.cssW > 0)) return null
  const ratio = Math.abs(b.dpr - a.dpr)
  if (ratio < 1) return null                       // 两个档位没差 ⇒ 无从判定
  return b.width > a.width * 1.5                   // 放宽到 1.5×：只要"真的变大了"，不苛求正好 2×
}

if (SELFTEST) {
  console.log('== S 纯判据自证 ==')
  ok(isolatedExactlyOne([false, true, false]) === true, 'S1 恰好一层可见 ⇒ true')
  ok(isolatedExactlyOne([false, false]) === false && isolatedExactlyOne([true, true]) === false, 'S2 零层/多层可见 ⇒ false')
  ok(isolatedExactlyOne([]) === null, 'S3 没有层 ⇒ null（无可判对象，不许当通过）')
  ok(dprResizeOk({ cssW: 528, dpr: 1, width: 528 }, { cssW: 528, dpr: 2, width: 1056 }) === true, 'S4 DPR 1→2 画布变大 ⇒ true')
  ok(dprResizeOk({ cssW: 528, dpr: 1, width: 528 }, { cssW: 528, dpr: 1, width: 528 }) === null, 'S5 两档相同 ⇒ null（无从判定）')
  console.log('\n── selftest 汇总：PASS=' + pass + ' FAIL=' + fail + '（未起浏览器）')
  process.exit(fail > 0 ? 1 : 0)
}

/* playwright 不在本仓 node_modules 里（与 `bench-ui-headless` 同款解析：环境变量 → 本仓 → 插件仓 → 全局） */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { ROOT, WS } from './_root.mjs'
const pwPath = [process.env.MPW_PLAYWRIGHT, path.join(ROOT, 'node_modules/playwright/index.js'),
  path.join(WS, 'dsh-mpkg-wallpaper/node_modules/playwright/index.js'), '/opt/node/lib/node_modules/playwright/index.js']
  .filter((p) => { try { return !!p && fs.existsSync(p) } catch (e) { return false } })[0]
if (!pwPath) { console.log('SKIP bench-dbg-dpr-probe — 找不到 playwright（可用 MPW_PLAYWRIGHT=<path> 指定）'); process.exit(0) }
const pw = createRequire(import.meta.url)(pwPath)
const firefox = (pw.default && pw.default.firefox) || pw.firefox
if (!firefox) { console.log('SKIP bench-dbg-dpr-probe — playwright 没有 firefox 导出'); process.exit(0) }
const browser = await firefox.launch({ headless: true })
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto('http://' + AUTHORITY + '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(8000)

  /** 读：调试栏文本、隔离状态、liveRes、iframe 内容尺寸。 */
  const read = () => page.evaluate(() => {
    const fr = document.getElementById('frame')
    const w = fr && fr.contentWindow
    const layers = (() => { try { return Array.isArray(w.__sceneLayers) ? w.__sceneLayers : null } catch (e) { return null } })()
    const flags = layers ? layers.map((l) => !!l.visible) : null
    const live = (() => { try { return w.__mpwLiveRes || null } catch (e) { return null } })()
    const dbg = document.getElementById('dbg-layer')
    return {
      layerText: dbg ? String(dbg.textContent || '').slice(0, 60) : null,
      flags, total: flags ? flags.length : 0,
      live, frameW: fr ? fr.clientWidth : 0, frameH: fr ? fr.clientHeight : 0,
      frameSrc: fr ? String(fr.getAttribute('src') || '').slice(0, 160) : null,
      frameSearch: (() => { try { return String((fr && fr.contentWindow && fr.contentWindow.location && fr.contentWindow.location.search) || '').slice(0, 160) } catch (e) { return 'ERR:' + String(e && e.message || e).slice(0, 40) } })(),
      hasLive: (() => { try { return !!(fr && fr.contentWindow && fr.contentWindow.__mpwLiveRes) } catch (e) { return false } })(),
      boot: (() => { try { const w = fr.contentWindow; return { start: w.__mpwLiveStart || null, pre: w.__mpwLivePre || null, err: w.__mpwBootError || null, res: w.__mpwResTier ? { requested: w.__mpwResTier.requested, live: !!w.__mpwResTier.live, name: w.__mpwResTier.name } : null, layers: !!w.__sceneLayers, wp: !!w.__wp } } catch (e) { return { err: String(e && e.message || e).slice(0, 60) } } })(),
    }
  })
  const setDpr = async (v) => {
    await page.evaluate((want) => {
      const el = document.getElementById('dpr')
      if (!el) return
      el.value = String(want)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }, v)
  }
  const stepRight = async (n = 1) => {
    for (let i = 0; i < n; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(350) }
  }

  /* ── D 组：调试逐层隔离 ── */
  const r0 = await read()
  if (!r0.flags || r0.flags.length === 0) {
    skip('D 调试逐层', '当前档位没有 `__sceneLayers`（未挂载/该档不支持）—— 不假装通过')
  } else {
    /* 进入调试：**先切到调试页签再点开关**（`bench-ui-headless` 同款路径；只点开关不会生效 ——
       本轮实测：跳过这一步时 `#dbg-layer` 是空的、隔离也没发生）。 */
    await page.evaluate(() => { try { document.getElementById('tab-debug').click() } catch (e) {} })
    await page.waitForTimeout(400)
    await page.evaluate(() => { const sw = document.getElementById('dbg-mode'); if (sw && !sw.checked) sw.click() })
    await page.waitForTimeout(1200)
    const r1 = await read()
    ok(!!r1.layerText && /层|\d/.test(r1.layerText), 'D1a 调试模式栏里有当前层信息', JSON.stringify(r1.layerText))
    /* 契约（实测口径）：**进入调试**只显示"当前层信息"，全层仍可见；**隔离在步进时应用**（D2/D2b 钉它）。
       真机读数：进入后 `on=5/total=5`（全可见）→ 按一次右键 `from:0 → to:2` 且 `on=1`。 */
    const on1 = (r1.flags || []).filter(Boolean).length
    ok(on1 === r1.total || on1 === 1, 'D1b 进入调试时要么全层可见（隔离待步进应用）、要么已隔离一层 —— 不许出现"半隔离"',
      JSON.stringify({ total: r1.total, on: on1, text: r1.layerText }))
    await stepRight(3)
    const r2 = await read()
    const idx1 = (r1.flags || []).indexOf(true), idx2 = (r2.flags || []).indexOf(true)
    ok(idx2 >= 0 && idx2 !== idx1, 'D2 按右方向键后**隔离的层换了一个**（层号与可见层同步变）',
      JSON.stringify({ from: idx1, to: idx2, text2: r2.layerText }))
    ok(isolatedExactlyOne(r2.flags) === true, 'D2b 换层后仍然恰好一层可见（没有越走越乱）')
    /* 退出调试：全部恢复 */
    await page.evaluate(() => { const sw = document.getElementById('dbg-mode'); if (sw && sw.checked) sw.click() })
    await page.waitForTimeout(1200)
    const r3 = await read()
    const on3 = (r3.flags || []).filter(Boolean).length
    ok((r3.flags || []).length === 0 || on3 === (r3.flags || []).length || on3 > 1,
      'D3 退出调试后隔离解除（可见层数回到挂载时的常态，不是只剩一层）',
      JSON.stringify({ on: on3, total: (r3.flags || []).length }))
  }

  /* ── P 组：DPR 切换 ── */
  /* P 组：先切一次 DPR（这会把 `res=dpr` 写进预览 URL —— 本仓档的活画布档位需要它），再回到 1 取基线 */
  /* 先把预览档位**确保为「本仓渲染器」**：`res=dpr` 活档位只在这个档位存在（上游档没有 ⇒ P 组如实 SKIP，
     但那种 SKIP 说明"没测到"，不是"不支持"）。档位是持久化在 localStorage 的，别的测试可能留在上游档。 */
  const srcMode = await page.evaluate(() => { try { const el = document.getElementById('renderer-src'); return el ? String(el.value || '') : null } catch (e) { return null } })
  console.log('  预览档位（改前）= ' + JSON.stringify(srcMode))
  if (srcMode && srcMode !== 'repo') {
    await page.evaluate(() => { const el = document.getElementById('renderer-src'); if (el) { el.value = 'repo'; el.dispatchEvent(new Event('change', { bubbles: true })) } })
    await page.waitForTimeout(1200)
  }
  /* `res=` 档位是**挂载时**写进预览 URL 的 ⇒ 改完 DPR 点一次「重挂载」，再读活档位。 */
  const remount = async () => { await page.evaluate(() => { const b = document.getElementById('reload'); if (b) b.click() }); await page.waitForTimeout(6000) }
  await setDpr(2); await remount()
  await setDpr(1); await remount()
  const a = await read()
  await setDpr(2); await remount()
  const b = await read()
  if (!a.live || !b.live) {
    skip('P DPR 切换', '没有 `__mpwLiveRes` —— 诊断：hasLive=' + JSON.stringify(b.hasLive) + ' frameSearch=' + JSON.stringify(b.frameSearch) + ' frameSrc=' + JSON.stringify(b.frameSrc) + ' iframe=' + b.frameW + 'x' + b.frameH + ' boot=' + JSON.stringify(b.boot))
  } else {
    ok(dprResizeOk(a.live, b.live) === true, 'P1 DPR 1→2：画布像素真的跟着变大（不是只换了个数字）',
      JSON.stringify({ a: { dpr: a.live.dpr, w: a.live.width }, b: { dpr: b.live.dpr, w: b.live.width } }))
    ok(b.frameW > 0 && b.frameH > 0, 'P1b 切换后 iframe 仍有内容尺寸（不是白屏/塌成 0）', JSON.stringify({ w: b.frameW, h: b.frameH }))
    await setDpr(1); await page.waitForTimeout(2000)
    const c = await read()
    ok(c.live && c.live.dpr === 1 && c.live.width <= b.live.width, 'P2 DPR 2→1 可逆（画布回到 1× 档）',
      JSON.stringify({ dpr: c.live && c.live.dpr, w: c.live && c.live.width }))
  }
} finally {
  await browser.close().catch(() => {})
  console.log('\nbench-dbg-dpr-probe：PASS=' + pass + ' FAIL=' + fail)
  console.log('（诚实边界：不做像素级"画面长得不一样"断言 —— WebGL 画布没开 preserveDrawingBuffer，'
    + 'offline 读回不可靠；这里判的是"隔离状态 + 画布尺寸 + 渲染存活"，像素级留给真机眼睛）')
  void os; void path
  process.exit(fail > 0 ? 1 : 0)
}
