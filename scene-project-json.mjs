// scene-project-json.mjs — 官方 `project.json` 的**查找顺序**（服务端与 Node 工具共用同一份）
//
// ── 为什么需要这个文件（P-85 的真因）────────────────────────────────────────────
// WE 工坊布局 = **一个壁纸一个目录**，目录里有三样东西：
//     <workshop>/431960/<id>/{ scene.pkg , project.json , preview.gif }
// `project.json` **不是** scene.pkg 里的条目（`getEntry(pkg,'project.json')` 恒 null，语料 6/6 验证），
// 它是**同级文件**——这一点是 P-61「拿不到 project.json.general.properties → 无属性面板、无 {user:…}
// 绑定」的根因：我们手上的语料目录 `allwallpaper/dd/<id>/` 只留了 scene.pkg，于是：
//   · 属性面板空白（`propsSchema === null`）；
//   · `visible:{user:{condition:…}}` 这类**条件门控**全部走"属性表缺失 → 按可见"的灾难规避分支
//     ⇒ 白子 3327063360 的 4 个 Clock 变体**同时可见**（用户第 3 项"只有秒针"的另一半真相：
//     官方 project.json 里 `b1` 有真值，只有 1 个变体该显示）；
//   · 用户属性绑定（`{user:"clock"}` 等）全部回落到作者默认值。
// 而**用户本机装了 WE** ⇒ Steam 工坊目录里那份 project.json 一直在，只是我们从没去读。
//
// ── 顺序（先私有、后官方；先显式、后猜测）──────────────────────────────────────
//   1. `opts.dir` / `MPW_PROJECT_JSON_DIR`           显式指定（测试与部署用，最高优先级）
//   2. `<MPW_SCENE_ROOT>/<id>/project.json`         语料目录自己带的那份（有就用，行为不变）
//   3. `<MPW_WE_WORKSHOP>/<id>/project.json`        **Steam 工坊目录**（本文件要解决的那一档）
//   4. `<MPW_ROOT>/allwallpaper/<id>/project.json`  另一种历史语料布局
// 命中即返回，并回传 `source` 供日志/上报显示"这份属性表是从哪来的"（排查时最想知道的一件事）。
//
// ── 我们**不分发**任何 WE 资产 ────────────────────────────────────────────────
// 这里只读用户本机已存在的文件（与 `/weassist/**` 同一条原则）；找不到就返回 null，
// 调用方按"无属性表"的既有路径优雅降级。**不复制、不缓存、不打包**。

import fs from 'node:fs'
import path from 'node:path'

const HOME = process.env.HOME || ''

/** Steam 工坊 431960（Wallpaper Engine）的候选目录，按"最可能是本机真实安装"排序 */
export function workshopDirCandidates(opts = {}) {
  const root = opts.root || process.env.MPW_ROOT || '/root/Desktop/DSHarea'
  return [
    opts.workshopDir,
    process.env.MPW_WE_WORKSHOP,
    root + '/Steam/steamapps/workshop/content/431960',
    HOME + '/.steam/steam/steamapps/workshop/content/431960',
    HOME + '/.local/share/Steam/steamapps/workshop/content/431960',
    HOME + '/Library/Application Support/Steam/steamapps/workshop/content/431960',
    'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\431960',
    'D:\\Steam\\steamapps\\workshop\\content\\431960',
  ].filter(Boolean)
}

/** 找到本机存在的那一个工坊目录（没有则 null） */
export function findWorkshopDir(opts = {}) {
  for (const d of workshopDirCandidates(opts)) {
    try { if (d && fs.existsSync(d)) return d } catch { /* 权限/路径异常 → 试下一个 */ }
  }
  return null
}

/**
 * 按优先级列出 `<id>/project.json` 的候选路径（不判存在性，便于测试逐条断言顺序）。
 * @returns {{path:string, source:string}[]}
 */
export function projectJsonCandidates(id, opts = {}) {
  const root = opts.root || process.env.MPW_ROOT || '/root/Desktop/DSHarea'
  const sceneRoot = opts.sceneRoot || process.env.MPW_SCENE_ROOT || root + '/allwallpaper/dd'
  const out = []
  const push = (p, source) => { if (p) out.push({ path: p, source }) }
  if (opts.dir) push(path.join(opts.dir, String(id), 'project.json'), 'explicit-dir')
  if (process.env.MPW_PROJECT_JSON_DIR) push(path.join(process.env.MPW_PROJECT_JSON_DIR, String(id), 'project.json'), 'env-MPW_PROJECT_JSON_DIR')
  push(path.join(sceneRoot, String(id), 'project.json'), 'scene-root')
  const ws = opts.workshopDir || process.env.MPW_WE_WORKSHOP || findWorkshopDir(opts)
  if (ws) push(path.join(ws, String(id), 'project.json'), 'we-workshop')
  push(path.join(root, 'allwallpaper', String(id), 'project.json'), 'allwallpaper-flat')
  return out
}

/**
 * 读官方 project.json。
 * @returns {{path:string, source:string, json:object}|null} 读不到（或 JSON 坏）→ null
 */
export function readProjectJson(id, opts = {}) {
  for (const c of projectJsonCandidates(id, opts)) {
    try {
      if (!fs.existsSync(c.path)) continue
      const json = JSON.parse(fs.readFileSync(c.path, 'utf8').replace(/^\uFEFF/, ''))
      return { path: c.path, source: c.source, json }
    } catch { /* 坏文件不致命：继续找下一档 */ }
  }
  return null
}

/**
 * 便捷：只要 `general.properties`（属性表），没有就 null。
 * 与 demo.html 的 `propsSchema = pr?.general?.properties || null` 同一口径。
 */
export function readProjectProperties(id, opts = {}) {
  const r = readProjectJson(id, opts)
  const props = r && r.json && r.json.general && r.json.general.properties
  return props ? { path: r.path, source: r.source, properties: props } : null
}
