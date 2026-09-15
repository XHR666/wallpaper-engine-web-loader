// sw.js —— P-92：离线可用的 Service Worker（**只缓存 app shell**）
//
// 注册方式（由 we-scene-demo-server.mjs 在 `?pwa=1` / `MPW_PWA=1` 时注入）：
//   navigator.serviceWorker.register('/sw.js', { type: 'module', scope: '/' })
//
// 三条设计决定（都是"更保守的那条"）：
//   ① **module worker**：判据从 `sw-policy.mjs` import（单一事实源）。代价是要求浏览器支持
//      module service worker（Chrome/Edge 91+、Safari 16.4+、Firefox 111+）；不支持时
//      `register()` 直接 reject ⇒ 页面只是**没有离线能力**，不影响任何渲染功能（注册失败只写日志）。
//   ② **网络优先 + 缓存兜底**（不是 cache-first）：本机服务器随时可能换包/改代码，
//      cache-first 会让人看到旧 bundle 却查不出原因。离线时才回落到缓存。
//   ③ **不缓存任何用户素材**：判据在 `sw-policy.mjs`（默认拒绝 + 白名单），
//      并有逐条反面断言的测试 `pwa-test.mjs`。
//
// 版本号变更 ⇒ 旧缓存整批清理（避免"旧 shell + 新 bundle"的错配）。
const VERSION = 'v1'
const CACHE = 'we-scene-shell-' + VERSION
const PRECACHE = [
  '/',
  '/demo.html',
  '/manifest.webmanifest',
  '/we-scene-bundle.js',
  '/attach-transform.mjs',
  '/puppet-skin.js',
  '/pkg/sample-synthetic',
  '/project/sample-synthetic',
  '/type/sample-synthetic',
  '/assets/fonts/Blackout.ttf',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

import { shouldCache, shouldStoreResponse } from './sw-policy.mjs'

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE)
    // 逐个 add：**任何一个 404 都不许让整次安装失败**（预缓存清单里有可选字体时尤其重要）
    await Promise.all(PRECACHE.map(async (u) => {
      try {
        const res = await fetch(u, { cache: 'reload' })
        if (shouldStoreResponse(res)) await c.put(u, res)
      } catch { /* 预缓存失败不影响安装 */ }
    }))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  // 非 GET / 跨源 / 用户素材：**完全不拦截**（不读缓存、不写缓存，交给网络）
  if (!shouldCache(req.url, { method: req.method, origin: self.location.origin })) return
  e.respondWith((async () => {
    try {
      const res = await fetch(req)
      if (shouldStoreResponse(res)) {
        const c = await caches.open(CACHE)
        // 导航请求（`/`）用 URL 本身做键，避免 `?pwa=1&id=…` 的组合爆炸
        c.put(req.mode === 'navigate' ? url.pathname : req, res.clone()).catch(() => {})
      }
      return res
    } catch (err) {
      const c = await caches.open(CACHE)
      const hit = (await c.match(req)) || (req.mode === 'navigate' ? await c.match(url.pathname) : null) || (req.mode === 'navigate' ? await c.match('/') : null)
      if (hit) return hit
      return new Response('离线且未缓存：' + url.pathname, { status: 504, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }
  })())
})
