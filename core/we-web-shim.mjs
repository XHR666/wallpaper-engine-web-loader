/* WE API shim 的**源文本**与**注入**（纯函数；shim 体在调用方页面里执行，本模块自身不碰 DOM）。
 * 2026-09-23 第 ⑥ 条 · docs/WEB-WALLPAPER-MERGE.md §3.4/§3.6/§3.5。
 *
 * 两条纪律：
 *  ① **只借协议形状，不复制实现**：需要覆盖哪些官方 API、注入点在哪、CSP/大小怎么判，这些是协议/事实；
 *     具体写法、命名、错误文案都是本仓自写（许可与出处：`docs/COPYING-RULES.md` §2.1 / `THIRD-PARTY.md` §7，
 *     A = 我们自己的 MIT 插件，B = 上游 MIT）。
 *  ② **不许语义造假**：音频频段必须带 `source`；没有数据源就如实空着；`simulated` 档要在日志里说明
 *     "模拟源，不是真实频谱"（§3.8）。
 */

/** 幂等标记：HTML 里见到它就**原样返回**（父页/服务端重复注入不叠加）。 */
export const WEB_SHIM_ATTR = 'data-mpw-we-shim';
/** 版本串进标记：能从产物 HTML 直接看出注入的是哪一版。 */
export const WEB_SHIM_VERSION = '1';
export const WEB_INJECT_MAX_BYTES = 8 * 1024 * 1024;

/** 把 `</script` 打断，避免 shim 文本里的字符串常量提前闭合宿主 `<script>`。 */
export function escapeScriptClose(s) {
  return String(s == null ? '' : s).replace(/<\/(script)/gi, '<\\/$1');
}

/**
 * 入口 HTML 自带的 CSP 会不会挡掉我们注入的 inline shim：`script-src` 里既没有 `'unsafe-inline'`
 * 也没有 `*` ⇒ 注了也是被浏览器拒绝的控制台报错，干脆不注入、原样返回并留痕
 * （由宿主写 `x-mpw-shim-skipped: csp`，页面的 2.5s 兜底照旧）。
 */
export function hasBlockingCsp(html) {
  const src = String(html == null ? '' : html);
  const re = /<meta[^>]+http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const tag = m[0];
    const content = (/content\s*=\s*"([^"]*)"/i.exec(tag) || [])[1]
      ?? (/content\s*=\s*'([^']*)'/i.exec(tag) || [])[1]
      ?? '';
    if (!/script-src/i.test(content)) continue;
    if (/script-src[^;]*'unsafe-inline'/i.test(content)) continue;
    if (/script-src[^;]*\*/i.test(content)) continue;
    return true;
  }
  return false;
}

/**
 * WE API shim 的源文本（一个自足 IIFE；只依赖 `window`，不依赖任何模块系统）。
 * 覆盖面与"为什么这么小"的取舍见 docs §3.4；明确**不提供** `$media*` / indexedDB / SW /
 * `wallpaperRegisterMediaListener`（不存在的名字）/ 定时器冻结（默认档）。
 * @param {{version?:string}} [opts]
 */
export function buildWebShimSource(opts = {}) {
  const version = String(opts.version || WEB_SHIM_VERSION);
  return `(function () {
  'use strict';
  var W = window, D = document;
  if (W.__mpwWebShim && W.__mpwWebShim.version) return;   /* 幂等：重复注入不叠加 */
  var VERSION = ${JSON.stringify(version)};
  var STATE = {
    user: null, general: null, paused: false,
    audio: null, mediaProps: null, mediaThumb: null, mediaPlayback: null, mediaTimeline: null, mediaStatus: null,
    randomFiles: null,
  };
  var LOG_BUDGET = 50, logged = 0;
  function note(kind, detail) {
    try { if (logged++ < LOG_BUDGET && W.console && W.console.warn) W.console.warn('[mpw-web-shim] ' + kind + (detail ? ': ' + detail : '')); } catch (e) {}
    try { if (W.parent && W.parent !== W) W.parent.postMessage({ mpw: 'mpw:web', op: 'author-error', kind: kind, detail: String(detail || '').slice(0, 300) }, '*'); } catch (e) {}
  }
  function post(op, payload) {
    try { if (W.parent && W.parent !== W) W.parent.postMessage(Object.assign({ mpw: 'mpw:web', op: op }, payload || {}), '*'); } catch (e) {}
  }
  /* 回调一律**延后到微任务**：同步回调会重入 React 类作者的渲染函数（白屏），这是 A/B 两侧共同的现场结论。 */
  function later(fn, arg) {
    if (typeof fn !== 'function') return;
    try { Promise.resolve().then(function () { try { fn(arg); } catch (e) { note('listener-threw', e && e.message); } }); } catch (e) { note('defer-failed', e && e.message); }
  }
  /* ── 属性面：赋值只登记；晚挂的 listener 拿**全量快照**；**同一个对象重复赋值不重放** ── */
  var listener = null, assignedProp = null;
  var snapProps = null, snapGeneral = null;
  function replayTo(l) {
    if (!l || typeof l !== 'object') return;
    if (snapProps) later(l.applyUserProperties, snapProps);
    if (snapGeneral) later(l.applyGeneralProperties, snapGeneral);
  }
  try {
    Object.defineProperty(W, 'wallpaperPropertyListener', {
      configurable: true, enumerable: true,
      get: function () { return assignedProp; },
      set: function (v) { if (v === assignedProp) return; assignedProp = v; listener = (v && typeof v === 'object') ? v : null; replayTo(listener); },
    });
  } catch (e) { note('listener-define-failed', e && e.message); W.wallpaperPropertyListener = null; }
  /* ── 官方 API ── */
  W.wallpaperRegisterAudioListener = function (cb) { W.__mpwWebAudioCb = (typeof cb === 'function') ? cb : null; if (STATE.audio && W.__mpwWebAudioCb && !STATE.paused) later(W.__mpwWebAudioCb, STATE.audio); };
  function regMedia(name, key) {
    W[name] = function (cb) { if (typeof cb !== 'function') return; W['__mpw' + key + 'Cb'] = cb; if (STATE[key]) later(cb, STATE[key]); };
  }
  regMedia('wallpaperRegisterMediaPropertiesListener', 'mediaProps');
  regMedia('wallpaperRegisterMediaThumbnailListener', 'mediaThumb');
  regMedia('wallpaperRegisterMediaPlaybackListener', 'mediaPlayback');
  regMedia('wallpaperRegisterMediaTimelineListener', 'mediaTimeline');
  regMedia('wallpaperRegisterMediaStatusListener', 'mediaStatus');
  /* ⚠ 取值必须是官方那三个数：缺省会让作者的 \`PLAYING || 0\` 把"播放"误判成 0（§3.4）。 */
  W.wallpaperMediaIntegration = { PLAYBACK_STOPPED: 0, PLAYING: 1, PAUSED: 2 };
  /* 池空 ⇒ 回调空串（作者普遍 \`if (p)\` 守卫）。 */
  W.wallpaperRequestRandomFileForProperty = function (prop, cb) {
    if (typeof cb !== 'function') return;
    var pool = (STATE.randomFiles && STATE.randomFiles[prop]) || null;
    later(cb, (pool && pool.length) ? pool[Math.floor(Math.random() * pool.length)] : '');
  };
  W.wallpaperPluginListener = W.wallpaperPluginListener || { onPluginLoaded: function () {} };
  /* ── 控制面（宿主 → 帧）：同一套语义既走 postMessage 也走 __mpwWebControl ── */
  function control(msg) {
    if (!msg || typeof msg !== 'object') return null;
    switch (msg.op) {
      case 'props':
        snapProps = (msg.props && typeof msg.props === 'object') ? msg.props : null;
        STATE.user = snapProps;
        replayTo(listener);
        return { ok: true };
      case 'general':
        snapGeneral = (msg.general && typeof msg.general === 'object') ? msg.general : null;
        STATE.general = snapGeneral;
        replayTo(listener);
        return { ok: true };
      case 'pause': {
        var p = !!msg.paused;
        STATE.paused = p;
        if (listener && typeof listener.setPaused === 'function') later(listener.setPaused, p);
        freezeMedia(p);
        return { ok: true, paused: p };
      }
      case 'audio':
        STATE.audio = Array.isArray(msg.bands) ? msg.bands : null;
        if (STATE.audio && !STATE.paused && W.__mpwWebAudioCb) later(W.__mpwWebAudioCb, STATE.audio);
        return { ok: true };
      case 'media':
        for (var k of ['mediaProps', 'mediaThumb', 'mediaPlayback', 'mediaTimeline', 'mediaStatus']) {
          if (msg[k] === undefined) continue;
          STATE[k] = msg[k];
          if (W['__mpw' + k + 'Cb']) later(W['__mpw' + k + 'Cb'], STATE[k]);
        }
        return { ok: true };
      case 'random':
        STATE.randomFiles = (msg.files && typeof msg.files === 'object') ? msg.files : null;
        return { ok: true };
      default:
        return null;
    }
  }
  W.__mpwWebControl = control;
  try { W.addEventListener('message', function (ev) { if (ev && ev.data && ev.data.mpw === 'mpw:web') control(ev.data); }); } catch (e) {}
  /* ── 暂停：帧内 media 一并冻结/解冻（温和档；不改作者计时器语义） ── */
  var frozen = [];
  function mediaEls() {
    var out = [];
    try { out = [].slice.call(D.querySelectorAll('audio,video')); } catch (e) {}
    try { if (W.__mpwWebMedia && W.__mpwWebMedia.length) out = out.concat(W.__mpwWebMedia); } catch (e) {}
    return out;
  }
  function freezeMedia(on) {
    var els = mediaEls();
    if (on) {
      frozen = [];
      for (var i = 0; i < els.length; i++) { var el = els[i]; try { if (!el.paused) { frozen.push(el); el.pause(); } } catch (e) {} }
    } else {
      for (var j = 0; j < frozen.length; j++) { try { var f = frozen[j]; if (f && f.play) f.play().catch(function () {}); } catch (e) {} }
      frozen = [];
    }
  }
  /* ── 存储 facade：**只在真 storage 访问就抛**时安装（不透明源），真能用时一个字节都不动 ── */
  function realStorageOk(name) {
    try { var s = W[name]; s.setItem('__mpw_probe', '1'); s.removeItem('__mpw_probe'); return true; } catch (e) { return false; }
  }
  var STORE_LIMITS = { value: 4096, keys: 64, bytes: 65536 };
  function quotaError() { try { return new DOMException('quota exceeded', 'QuotaExceededError'); } catch (e) { var err = new Error('quota exceeded'); err.name = 'QuotaExceededError'; return err; } }
  function installFacade(name) {
    var mem = Object.create(null), size = 0, hydrated = false;
    /* 种子回灌（懒加载）：种子脚本插在 shim **之后**（与插件的顺序一致），所以这里不能在安装时读；
       第一次访问时再取 __mpwWebSeed.store.data，语义上仍然"首帧就有值"（同步读得到）。 */
    function hydrate() {
      if (hydrated) return;
      hydrated = true;
      try {
        var seed = W.__mpwWebSeed;
        var data = seed && seed.store && seed.store.data;
        if (data && typeof data === 'object') {
          for (var k in data) { if (!Object.prototype.hasOwnProperty.call(data, k)) continue; var v = String(data[k]); if (v.length > STORE_LIMITS.value) continue; if (Object.keys(mem).length >= STORE_LIMITS.keys) break; mem[k] = v; size += v.length; }
        }
      } catch (e) { note('store-hydrate-failed', e && e.message); }
    }
    var q = (function () { try { return new URLSearchParams(W.location.search).get('webstore'); } catch (e) { return null; } })();
    if (q === '0') return;                                  /* webstore=0 = 保留旧行为（访问即抛） */
    var memOnly = (q === 'mem');
    var timer = null;
    function flush() {
      timer = null;
      if (memOnly) return;
      var body = { wallId: (function () { try { return new URLSearchParams(W.location.search).get('id') || ''; } catch (e) { return ''; } })(), data: mem };
      try { W.fetch('/api/web-store', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) }).catch(function () {}); } catch (e) {}
    }
    function schedule() { if (timer != null) return; timer = setTimeout(flush, 400); }
    var api = {
      getItem: function (k) { hydrate(); k = String(k); return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { k = String(k); v = String(v); if (v.length > STORE_LIMITS.value) throw quotaError(); var had = Object.prototype.hasOwnProperty.call(mem, k); var delta = (had ? mem[k].length : 0); size += v.length - delta; if (Object.keys(mem).length + (had ? 0 : 1) > STORE_LIMITS.keys || size > STORE_LIMITS.bytes) { size -= v.length - delta; throw quotaError(); } mem[k] = v; schedule(); },
      removeItem: function (k) { k = String(k); if (Object.prototype.hasOwnProperty.call(mem, k)) { size -= mem[k].length; delete mem[k]; schedule(); } },
      clear: function () { mem = Object.create(null); size = 0; schedule(); },
      key: function (i) { hydrate(); var ks = Object.keys(mem); return i >= 0 && i < ks.length ? ks[i] : null; },
    };
    try { Object.defineProperty(api, 'length', { get: function () { hydrate(); return Object.keys(mem).length; } }); } catch (e) {}
    try { Object.defineProperty(W, name, { configurable: true, get: function () { return api; } }); } catch (e) {}
  }
  try { if (!realStorageOk('localStorage')) installFacade('localStorage'); } catch (e) {}
  try { if (!realStorageOk('sessionStorage')) installFacade('sessionStorage'); } catch (e) {}
  /* ── 作者异常兜住（不弹框、不改壁纸状态） ── */
  try { W.addEventListener('error', function (ev) { note('error', ev && ev.message); }); } catch (e) {}
  try { W.addEventListener('unhandledrejection', function (ev) { note('rejection', ev && ev.reason && (ev.reason.message || ev.reason)); }); } catch (e) {}
  /* ── 种子（首帧策略：免等宿主 postMessage）+ ready ── */
  try { if (W.__mpwWebSeed && typeof W.__mpwWebSeed === 'object') { control(W.__mpwWebSeed); } } catch (e) { note('seed-failed', e && e.message); }
  W.__mpwWebShim = { version: VERSION, state: STATE, control: control };
  post('ready', { version: VERSION });
})();`;
}

/**
 * 把 shim（+ 可选种子脚本）插到入口 HTML 里，保证**作者脚本执行前** shim 已在位。
 * 插入点：`<head>` 之后 > `<html>` 之后（自造 head）> 整段前缀（残缺 HTML）。
 * 只做这些：幂等、转义 `</script`、无 head 自造、超限跳过、CSP 命中跳过；**抛错只 warn 不 500**。
 * @param {string} html
 * @param {{shimSource?:string, seed?:object|null, maxBytes?:number, skipCsp?:boolean}} [opts]
 * @returns {{html:string, injected:boolean, skipped:boolean, reason:string, bytes:number}}
 */
export function injectWebShim(html, opts = {}) {
  const src = typeof html === 'string' ? html : '';
  const bytes = src.length;
  const maxBytes = Number.isFinite(Number(opts.maxBytes)) ? Number(opts.maxBytes) : WEB_INJECT_MAX_BYTES;
  if (!src) return { html: src, injected: false, skipped: true, reason: 'empty', bytes };
  if (bytes > maxBytes) return { html: src, injected: false, skipped: true, reason: 'too-large', bytes };
  if (new RegExp(WEB_SHIM_ATTR + '(=|\\s|>)', 'i').test(src)) return { html: src, injected: false, skipped: true, reason: 'already', bytes };
  if (opts.skipCsp !== false && hasBlockingCsp(src)) return { html: src, injected: false, skipped: true, reason: 'csp', bytes };
  const shim = typeof opts.shimSource === 'string' && opts.shimSource ? opts.shimSource : buildWebShimSource();
  const seed = opts.seed && typeof opts.seed === 'object'
    ? '\n<script ' + WEB_SHIM_ATTR + '-seed="' + WEB_SHIM_VERSION + '">\nwindow.__mpwWebSeed=' + escapeScriptClose(JSON.stringify(opts.seed)) + ';\n</script>'
    : '';
  const inject = '<script ' + WEB_SHIM_ATTR + '="' + WEB_SHIM_VERSION + '">\n' + escapeScriptClose(shim) + '\n</script>' + seed;
  const head = /<head(\s[^>]*)?>/i.exec(src);
  if (head) {
    const at = head.index + head[0].length;
    return { html: src.slice(0, at) + inject + src.slice(at), injected: true, skipped: false, reason: 'head', bytes };
  }
  const htmlOpen = /<html(\s[^>]*)?>/i.exec(src);
  if (htmlOpen) {
    const at = htmlOpen.index + htmlOpen[0].length;
    return { html: src.slice(0, at) + '<head>' + inject + '</head>' + src.slice(at), injected: true, skipped: false, reason: 'made-head', bytes };
  }
  return {
    html: '<!DOCTYPE html><html><head>' + inject + '</head><body>' + src + '</body></html>',
    injected: true, skipped: false, reason: 'made-document', bytes,
  };
}
