function mkdirSyncSafe(p) { try { fs.mkdirSync(p, { recursive: true }) } catch {} }
function statSyncSafe(p) { try { return fs.statSync(p) } catch { return null } }

// we-scene 验证服务器 v2：完整 loadScene 链路（model→material→texture）
// 用法: node server/we-scene-demo-server.mjs 8899
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packDir, collectFiles } from './pack-dir.mjs'; // ①(第22项) 目录源 → PKG 容器（混合加载）
// ①(P-85 2026-09-15) 官方 project.json 的**统一查找链**（与 demo/测试共用 core/scene-project-json.mjs）：
//   WE 工坊布局是"一个壁纸一个目录"，project.json 是 scene.pkg 的**同级文件**而不是包内条目
//   （getEntry(pkg,'project.json') 恒 null，语料 6/6 实测）。查找顺序：explicit-dir → env-MPW_PROJECT_JSON_DIR
//   → scene-root(<MPW_SCENE_ROOT>/<id>) → we-workshop(<Steam 工坊 431960 目录>/<id>) → allwallpaper-flat；
//   命中回传 source（这份属性表从哪来），全找不到返回 null → 调用方按"无属性表"既有路径优雅降级。
import { readProjectJson } from '../core/scene-project-json.mjs';
// ①(P-92 2026-09-16) PWA 外壳（manifest + Service Worker 注册）**服务器侧注入**：
//   为什么不写死在 demo.html 里 —— 那个文件同一时刻只允许一条线改（并发编辑互相覆盖），
//   而 PWA 与渲染逻辑零耦合 ⇒ 做成**可关的注入**：环境变量 `MPW_PWA=1` 或请求 `?pwa=1` 才开（默认关）。
//   缓存判据（**绝不缓存用户壁纸**）在 `sw-policy.mjs`；逐条反面断言见 `pwa-test.mjs`。
import { pwaEnabledFrom, injectPwa, readPwaAsset } from '../web/pwa-inject.mjs';
// ①(P-85) /project 命中来源的一次性日志去重：同一 id 只打一行"从哪来"，不刷屏
const PROJECT_SOURCE_LOGGED = new Set();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ①(P-101 2026-09-16 目录再整理) 本文件移入 `server/` ⇒ 落点常量集中在这里，别再散写相对路径：
//   REPO_ROOT = 仓库根（= 本文件的上一级）；站点外壳资源在 web/、渲染与解析内核在 core/、
//   自研 shader 头在 shaders/。URL 路径（/bundle.js、/sw.js、/manifest.webmanifest…）**不变**。
const REPO_ROOT = path.resolve(__dirname, '..');
const WEB_DIR = path.join(REPO_ROOT, 'web');
const CORE_DIR = path.join(REPO_ROOT, 'core');
const SHADERS_DIR = path.join(REPO_ROOT, 'shaders');
// ①(B6 2026-09-14) 端口来源：PORT 环境变量（测试用）> CLI 第 1 个参数（旧用法不变）> 8899
const port = Number(process.env.PORT || process.argv[2] || 8899);
// ═══ ①(第16项 发布去个人化 2026-09-14；P-91 2026-09-16 收尾) 所有个人绝对路径改为**环境变量可覆盖** ═══
//   默认值：`MPW_ROOT` 不再写死作者机绝对路径，改为**本仓库的父目录**（= "渲染器与语料放在同一父目录"
//   这个已经写进 README-PUBLIC §4 的约定布局）。作者机上 `__dirname/..` 与旧默认值**是同一个目录**
//   ⇒ 本机行为一字不变；公开副本也不会把作者的个人目录带进分发产物（`npm pack` 后逐条 grep 个人
//   绝对前缀的自查见 packaging-test.mjs）。覆盖方式示例：
//     MPW_ROOT=/path/to/workspace MPW_REPORTS_DIR=/tmp/reports node server/we-scene-demo-server.mjs
const MPW_ROOT = process.env.MPW_ROOT || path.resolve(REPO_ROOT, '..');
// ①(P-87 2026-09-15 版权) 场景根：显式环境变量 > <MPW_ROOT>/allwallpaper/dd（作者机 / 使用者自己的语料）
//   > **<repo>/samples**（本仓库自带样例的父目录 ⇒ `?id=sample-synthetic` 正好命中
//   `<root>/<id>/scene.pkg` = samples/sample-synthetic/scene.pkg，project.json 也在同级）。
//   历史：第二兜底原为 `<repo>/samples/wallpapers/`（198MB 真实 Steam 工坊壁纸）——因版权**已整体删除**，
//   本仓库**不分发任何真实壁纸**。三档都不存在时返回一个**明确不存在**的占位路径（绝不留"指向空目录
//   却当成成功"的假象）：此时 `?id=` 一律 404，启动日志会打印生效值 + "请用 ?pkgpath= 或自己放语料"。
const MPW_SCENE_ROOT = (() => {
  if (process.env.MPW_SCENE_ROOT) return process.env.MPW_SCENE_ROOT
  const cands = [MPW_ROOT + '/allwallpaper/dd', REPO_ROOT + '/samples']
  for (const c of cands) { try { if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c } catch {} }
  return REPO_ROOT + '/samples/NO-BUNDLED-CORPUS'   // 占位：明确不存在（见上行口径）
})();
const MPW_REPORTS_DIR = process.env.MPW_REPORTS_DIR || (MPW_ROOT + '/reports');
// ═══ ①(P-104 2026-09-17 发布纪律①②：自动上报默认关 + 一切"自动落盘"都要有上限) ═══
//   用户原话：①"像你这种测试用的自动上报的功能，这种你在上传仓库的时候要把它默认给关掉。"
//            ②"这种自动上报、自动把什么存储到本地的类型的东西，这种需要设置上限的，这上限别忘记了。"
//   **本块是服务端所有落盘上限的唯一来源**（要调上限只改这里；对照表见 docs/DATA-LIMITS.md）。
//   两条口径同时生效：**数量上限**（最旧先删）+ **总字节上限**（最旧先删到限内）。
//   环境变量只用于**测试/现场调参**（把上限压到很小才能在几秒内验完清理路径）；
//   非法/缺省值一律回落默认 —— 绝不出现"配错上限 = 把上限关掉"。
const numEnv = (name, def) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : def;
};
const MPW_LIMITS = {
  reportsMaxFiles: numEnv('MPW_LIMIT_REPORTS_MAX', 60),                      // reports/r<ts>.json ≤60 份
  selfcheckMaxFiles: numEnv('MPW_LIMIT_SELFCHECK_MAX', 40),                  // reports/selfcheck-<ts>.json ≤40 份
  reportsMaxBytes: numEnv('MPW_LIMIT_REPORTS_BYTES', 64 * 1024 * 1024),      // 上面两类**合计** ≤64MB
  shotPerIdMaxFiles: numEnv('MPW_LIMIT_SHOT_FILES', 400),                    // 每 id ≤400 帧
  shotPerIdMaxBytes: numEnv('MPW_LIMIT_SHOT_ID_BYTES', 200 * 1024 * 1024),   // 每 id ≤200MB
  shotTotalMaxBytes: numEnv('MPW_LIMIT_SHOT_TOTAL_BYTES', 500 * 1024 * 1024),// 所有 id 合计 ≤500MB
};
// 清理动作必须打日志（用户点名："已删除 N 个最旧文件，释放 X MB"）——0 个时不打，免得刷屏。
function logPrune(scope, removed, freedBytes, extra) {
  if (!removed) return;
  console.log('[prune] ' + scope + '：已删除 ' + removed + ' 个最旧文件，释放 ' + (freedBytes / 1048576).toFixed(2) + ' MB'
    + (extra ? '（' + extra + '）' : ''));
}
// 通用：把一个目录收进 maxFiles/maxBytes 之内，**最旧先删**。
//   filter：只统计/删除哪些文件（reports/ 只数 r*.json；shots/<id>/ 只数图片，index.jsonl 台账永不删）。
//   排序口径 = **文件名里的 epoch 优先**（r<ts>.json / <ts>-<tag>.jpg 都是"名字即时间"；同一毫秒灌
//   几十份时排序仍确定），拿不到数字时间戳才退回 mtime。
//   返回 {removed, freedBytes}。任何一步失败都吞掉：**清理绝不能让写入路径 500**。
function pruneDirToLimits(dir, opts) {
  const o = opts || {};
  const maxFiles = (o.maxFiles === undefined) ? Infinity : o.maxFiles;
  const maxBytes = (o.maxBytes === undefined) ? Infinity : o.maxBytes;
  let removed = 0, freedBytes = 0;
  try {
    let names;
    try { names = fs.readdirSync(dir) } catch { return { removed: 0, freedBytes: 0 } }
    const keep = o.filter || (() => true);
    const tsOf = (n) => { const m = /(\d{10,})/.exec(n); return m ? Number(m[1]) : null };
    const rows = [];
    for (const n of names) {
      if (!keep(n)) continue;
      const st = statSyncSafe(path.join(dir, n));
      if (!st || !st.isFile()) continue;
      rows.push({ n, size: st.size, mtime: st.mtimeMs });
    }
    rows.sort((a, b) => {
      const ta = tsOf(a.n), tb = tsOf(b.n);
      if (ta !== null && tb !== null && ta !== tb) return ta - tb;
      return (a.mtime - b.mtime) || a.n.localeCompare(b.n);
    });
    let total = rows.reduce((s, r) => s + r.size, 0);
    let count = rows.length;
    for (const r of rows) {
      if (count <= maxFiles && total <= maxBytes) break;
      try {
        fs.unlinkSync(path.join(dir, r.n));
        removed++; freedBytes += r.size; count--; total -= r.size;
      } catch { /* 单个删不掉不阻断其余 */ }
    }
  } catch { /* ignore */ }
  return { removed, freedBytes };
}
// reports/ 顶层：`r<ts>.json`（/report）与 `selfcheck-<ts>.json`（/diag）两类**各自数量封顶**，
//   再共享一份 **64MB 字节预算**。
//   ⚠ 过滤器只认这两类自造文件名：`MPW_REPORTS_DIR` 默认是**工作区根的 reports/**，那里还躺着
//   `parity-*.json` 等别条线的产物（parity-check 门禁要读）——**一个都不许删**。
function pruneReports(dir) {
  const d = dir || MPW_REPORTS_DIR;
  const a = pruneDirToLimits(d, { maxFiles: MPW_LIMITS.reportsMaxFiles, filter: (n) => /^r\d+\.json$/.test(n) });
  const b = pruneDirToLimits(d, { maxFiles: MPW_LIMITS.selfcheckMaxFiles, filter: (n) => /^selfcheck-\d+\.json$/.test(n) });
  const c = pruneDirToLimits(d, { maxBytes: MPW_LIMITS.reportsMaxBytes, filter: (n) => /^(r\d+|selfcheck-\d+)\.json$/.test(n) });
  const r = { removed: a.removed + b.removed + c.removed, freedBytes: a.freedBytes + b.freedBytes + c.freedBytes };
  logPrune('reports/', r.removed, r.freedBytes, '上限 r* ' + MPW_LIMITS.reportsMaxFiles + ' 份 / selfcheck* '
    + MPW_LIMITS.selfcheckMaxFiles + ' 份 / 合计 ' + Math.round(MPW_LIMITS.reportsMaxBytes / 1048576) + 'MB');
  return r;
}
// shots/<id>/：每 id ≤400 帧 + ≤200MB（只数图片；index.jsonl 是台账，永不删）
function pruneShotsId(id) {
  const dir = path.join(MPW_REPORTS_DIR, 'shots', id);
  const r = pruneDirToLimits(dir, {
    maxFiles: MPW_LIMITS.shotPerIdMaxFiles,
    maxBytes: MPW_LIMITS.shotPerIdMaxBytes,
    filter: (n) => /\.(jpg|png)$/i.test(n),
  });
  logPrune('shots/' + id + '/', r.removed, r.freedBytes, '每 id 上限 ' + MPW_LIMITS.shotPerIdMaxFiles + ' 帧 / ' + Math.round(MPW_LIMITS.shotPerIdMaxBytes / 1048576) + 'MB');
  return r;
}
function shotsDirIds() {
  const root = path.join(MPW_REPORTS_DIR, 'shots');
  try {
    return fs.readdirSync(root).filter((n) => { const st = statSyncSafe(path.join(root, n)); return !!st && st.isDirectory() });
  } catch { return [] }
}
// shots/** 全局字节上限：跨 id 合计超限时**每次删"所有 id 里最旧的那一帧"**（公平，
//   不会一次掏空某个 id）。上限 500MB —— 一台设备整个上报目录的硬顶。
function pruneShotsAll() {
  const root = path.join(MPW_REPORTS_DIR, 'shots');
  let removed = 0, freedBytes = 0;
  try {
    const ids = shotsDirIds();
    const scan = () => {
      let total = 0; const oldest = [];
      for (const id of ids) {
        const dir = path.join(root, id);
        let names = []; try { names = fs.readdirSync(dir) } catch { continue }
        const rows = [];
        for (const n of names) {
          if (!/\.(jpg|png)$/i.test(n)) continue;
          const st = statSyncSafe(path.join(dir, n));
          if (!st || !st.isFile()) continue;
          rows.push({ n, size: st.size, mtime: st.mtimeMs });
          total += st.size;
        }
        rows.sort((a, b) => (a.mtime - b.mtime) || a.n.localeCompare(b.n));
        if (rows.length) oldest.push({ id, dir, row: rows[0] });
      }
      return { total, oldest };
    };
    let guard = 0;
    while (guard++ < 200000) {
      const s = scan();
      if (s.total <= MPW_LIMITS.shotTotalMaxBytes || !s.oldest.length) break;
      s.oldest.sort((a, b) => (a.row.mtime - b.row.mtime) || a.id.localeCompare(b.id));
      const pick = s.oldest[0];
      try { fs.unlinkSync(path.join(pick.dir, pick.row.n)); removed++; freedBytes += pick.row.size } catch { break }
    }
  } catch { /* ignore */ }
  logPrune('shots/**', removed, freedBytes, '全局上限 ' + Math.round(MPW_LIMITS.shotTotalMaxBytes / 1048576) + 'MB');
  return { removed, freedBytes };
}
// 启动清理一次（用户要求"启动时清理一次"）：进程一起来就把上次遗留的超限目录收进限内。
function pruneAllOnStartup() {
  const r = pruneReports(MPW_REPORTS_DIR);
  let n = 0, b = 0;
  for (const id of shotsDirIds()) { const x = pruneShotsId(id); n += x.removed; b += x.freedBytes }
  const g = pruneShotsAll();
  console.log('[limits] 启动清理完成：reports 删 ' + r.removed + ' 份/' + (r.freedBytes / 1048576).toFixed(2) + 'MB'
    + '；shots 每 id 删 ' + n + ' 帧/' + (b / 1048576).toFixed(2) + 'MB'
    + '；shots 全局删 ' + g.removed + ' 帧/' + (g.freedBytes / 1048576).toFixed(2) + 'MB'
    + '（上限：reports ' + MPW_LIMITS.reportsMaxFiles + ' 份/' + Math.round(MPW_LIMITS.reportsMaxBytes / 1048576)
    + 'MB；每 id ' + MPW_LIMITS.shotPerIdMaxFiles + ' 帧/' + Math.round(MPW_LIMITS.shotPerIdMaxBytes / 1048576)
    + 'MB；shots 合计 ' + Math.round(MPW_LIMITS.shotTotalMaxBytes / 1048576) + 'MB）');
  return { reports: r, shotsPerId: { removed: n, freedBytes: b }, shotsGlobal: g };
}
// ①(2026-09-14 公开仓库可用性) WE 资产目录：显式环境变量 > 本仓库旁 > **常见 Steam 安装路径自动探测**。
//   为什么需要：公开副本的使用者不会把 WE 装在 `$MPW_ROOT/wallpaper_engine`；而 `/weassist` 兜底
//   （粒子预设/材质/着色器）只在能读到 WE 自己的 assets 时才有内容。**我们不随仓库分发任何 WE 资产**，
//   只是在用户本机存在安装时读取它；找不到就优雅降级（相关兜底跳过，不影响已打进包的资源）。
const WE_ASSET_CANDIDATES = [
  process.env.MPW_WE_ASSETS,
  MPW_ROOT + '/wallpaper_engine/assets',
  (process.env.HOME || '') + '/.steam/steam/steamapps/common/wallpaper_engine/assets',
  (process.env.HOME || '') + '/.local/share/Steam/steamapps/common/wallpaper_engine/assets',
  (process.env.HOME || '') + '/Library/Application Support/Steam/steamapps/common/wallpaper_engine/assets',
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine\\assets',
  'D:\\Steam\\steamapps\\common\\wallpaper_engine\\assets',
].filter(Boolean);
const MPW_WE_ASSETS = WE_ASSET_CANDIDATES.find((d) => { try { return fs.existsSync(d) } catch { return false } }) || WE_ASSET_CANDIDATES[1];
const MPW_ALLOW_DIRS = (process.env.MPW_ALLOW_DIRS || [
  // ①(去个人化 2026-09-16) 插件下载缓存与备用语料根：环境变量优先；无 HOME 时退到系统临时目录
  //   （P-91 收尾：删掉写死的个人主目录前缀 —— 它只会在"没有 HOME"的极少数环境生效，
  //    但会随分发产物泄露作者机布局。有 HOME 时的解析结果与改动前**逐字节相同**。）
  process.env.MPW_PLUGIN_CACHE || (process.env.HOME ? process.env.HOME + '/.dsh-mpkg-wallpaper' : (process.env.TMPDIR || '/tmp') + '/.dsh-mpkg-wallpaper'),
  process.env.MPW_SD_ROOT || '/mnt/sdcard/wallpapertest1',
  MPW_ROOT + '/allwallpaper',
  '/tmp/customwall2',
  // ①(P-87 2026-09-15 版权) 本仓库自带的**合成**样例目录也进白名单：`?pkgpath=<repo>/samples/sample-synthetic/scene.pkg`
  //   与 `/pkgdir?d=<repo>/samples/sample-synthetic-src` 是自带样例的官方打开方式，不该要求用户先改环境变量。
  //   （只放我们自己程序化生成的文件，无第三方内容，见 samples/README.md。）
  REPO_ROOT + '/samples',
].join(':')).split(':').filter(Boolean);
// 包解析器：优先本目录 vendor 副本（公开仓库自带），其次插件仓库
const MPW_PKG_EXTRACT = process.env.MPW_PKG_EXTRACT
  || (fs.existsSync(path.join(REPO_ROOT, 'pkg-extract.mjs'))
      ? path.join(REPO_ROOT, 'pkg-extract.mjs')
      : MPW_ROOT + '/dsh-mpkg-wallpaper/lib/pkg-extract.js');
const SCENE_ROOT = MPW_SCENE_ROOT;
// ①(P-87 2026-09-15 版权) 自带**合成**样例的父目录：`<repo>/samples/<id>/scene.pkg` 形式（id=sample-synthetic）。
//   真实壁纸不再随仓库分发，所以这是唯一"仓库内自带"的 id 来源。
const SAMPLE_ROOT = REPO_ROOT + '/samples';
// ①(P-87) id 形态统一：真实语料目录名是数字，自带样例是 slug（sample-synthetic）。统一常量避免各路由手写漂移；
//   **必须**排除以点开头的名字（`?id=..` 经 path.join 会逃出场景根）。
const ID_PAT = '[A-Za-z0-9_][A-Za-z0-9_.-]*';
const reIdRoute = (prefix) => new RegExp('^\\/' + prefix + '\\/(' + ID_PAT + ')$');

// ①(去个人化) 改为动态 import：路径由上面 MPW_PKG_EXTRACT 决定（顶层 await 在 ESM 里合法）
const { parsePkg, readPkgEntry } = await import(MPW_PKG_EXTRACT);

// ①(P-87 2026-09-15 版权) 场景查找改成**两档**：生效场景根（= 使用者自己的语料）→ `<repo>/samples`
//   （自带**合成**样例的父目录 ⇒ `?id=sample-synthetic` 在任何机器上都能打开自带样例）。
//   语义仍是"<root>/<id>/scene.pkg"，两档都没有就返回 null（调用方 404）——
//   **绝不**用别的包顶替（不留"看起来成功其实是另一张壁纸"的假象）。
function findScene(id) {
  for (const root of [SCENE_ROOT, SAMPLE_ROOT]) {
    const dir = path.join(root, String(id));
    const pkgPath = path.join(dir, 'scene.pkg');
    if (fs.existsSync(pkgPath)) return { dir, pkgPath };
  }
  return null;
}

// ═══ ①(B6 渲染器沙箱 2026-09-14) CORS：iframe 去掉 allow-same-origin 后是不透明源，
//   渲染器**自己**的 fetch('/report' | '/pkg/' | '/pkgurl' | '/noise' | '/weassist/…') 全变跨源。
//   唯一入口 applyCors() 给**所有**响应挂三头（setHeader 与各路由的 writeHead 自动合并且不重复，
//   含 res.writeHead(200); res.end('ok') 这类无显式 content-type 的健康路由、createReadStream 管道流、
//   206 分支、404/500 的 catch 兜底）——所以路由内一个都不用各写一遍。
//   本机渲染器只服务自己的静态资源与包数据（无凭据/无秘密），`*` 是开发场景口径；插件宿主路由不加。
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
};
const PKGDIR_CACHE = new Map(); // ①(第22项) /pkgdir 打包缓存（键=目录+mtime，最多 4 份）
function applyCors(res) {
  for (const k of Object.keys(CORS_HEADERS)) {
    try { if (!res.hasHeader(k)) res.setHeader(k, CORS_HEADERS[k]) } catch {}
  }
}

// ①(B6) 单区间 Range（RFC 7233：bytes=start-end / start- / -suffix）集中实现。
//   只有请求带 Range 才走 206；不带 Range 的 200 响应与改动前逐字节一致（含各自的 content-type）。
//   非法/多区间 → 退回整文件 200（不引入 416 语义，避免影响既有客户端）。
function parseSingleRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start, end;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (!Number.isFinite(n) || n <= 0) return null;
    start = Math.max(0, size - n); end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end };
}
function sendBuffer(req, res, buf, contentType) {
  const range = parseSingleRange(req.headers && req.headers.range, buf.length);
  if (range) {
    const body = buf.subarray(range.start, range.end + 1);
    res.writeHead(206, {
      'content-type': contentType,
      'content-range': 'bytes ' + range.start + '-' + range.end + '/' + buf.length,
      'content-length': body.length,
      'accept-ranges': 'bytes',
    });
    res.end(body);
    return;
  }
  res.writeHead(200, { 'content-type': contentType });
  res.end(buf);
}
function sendFileStream(req, res, full, size, contentType) {
  const range = parseSingleRange(req.headers && req.headers.range, size);
  if (range) {
    res.writeHead(206, {
      'content-type': contentType,
      'content-range': 'bytes ' + range.start + '-' + range.end + '/' + size,
      'content-length': range.end - range.start + 1,
      'accept-ranges': 'bytes',
    });
    fs.createReadStream(full, { start: range.start, end: range.end }).pipe(res);
    return;
  }
  res.writeHead(200, { 'content-type': contentType, 'content-length': size, 'accept-ranges': 'bytes' });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer(async (req, res) => {
  applyCors(res);
  try {
    // ①(B6) 预检：不透明源下渲染器带 content-type 的 POST（/report、/diag）会触发预检请求。
    //   集中应答 204 + 上面三头（allow-headers: content-type），与具体路由无关。
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;

    if (p === '/' || p === '/index.html') {
      // ①(2026-09-14 修) **先读后写**：原顺序是 writeHead(200) 再 readFileSync → 缺 demo.html 时
      //   头已发出、异常只能变成 500/崩溃（公开副本实测复现）。现在缺文件是干净 404。
      const fp = path.join(REPO_ROOT, 'demo.html');
      let buf = null;
      try { buf = fs.readFileSync(fp) } catch { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('demo.html not found'); return }
      // ①(P-92) PWA 注入（默认关；`MPW_PWA=1` 或 `?pwa=1`）。注入是**纯增量**（`</head>` 前插
      //   manifest 链接 + 注册脚本），关闭时**逐字节等于改动前**的 demo.html 字节流。
      if (pwaEnabledFrom(url.searchParams, process.env)) {
        buf = Buffer.from(injectPwa(buf), 'utf8');
      }
      sendBuffer(req, res, buf, 'text/html; charset=utf-8');
      return;
    }
    // ①(P-92) PWA 静态资源：manifest / Service Worker / 缓存判据 / 图标。
    //   `sw.js` 与 `sw-policy.mjs` 必须与首页同源同目录（SW 的 scope 就是它自己的路径）。
    if (readPwaAsset(WEB_DIR, p)) {
      const a = readPwaAsset(WEB_DIR, p);
      res.writeHead(200, { 'content-type': a.type, 'cache-control': 'no-cache' });
      res.end(a.buf);
      return;
    }
    if (p === '/bundle.js') {
      sendBuffer(req, res, fs.readFileSync(path.join(CORE_DIR, 'we-scene-bundle.js')), 'text/javascript');
      return;
    }
    // ①(新) ?mode=elysia: elysia CPU 渲染器源码静态服务 + we-scene-bundle 别名
    // elysia/demo-elysia.js 用相对路径 import '../we-scene-bundle.js' → /we-scene-bundle.js
    if (p === '/we-scene-bundle.js') {
      sendBuffer(req, res, fs.readFileSync(path.join(CORE_DIR, 'we-scene-bundle.js')), 'text/javascript');
      return;
    }
    // ①(P-21-ATTACH 2026-09-13) bundle 的 import './attach-transform.mjs'（浏览器解析为 /attach-transform.mjs）
    if (p === '/attach-transform.mjs') {
      sendBuffer(req, res, fs.readFileSync(path.join(CORE_DIR, 'attach-transform.mjs')), 'text/javascript');
      return;
    }
    // ①(MERGED-3 1.3 2026-09-14) 诊断开关速查 JSON（diag-flag-check.mjs 脚本生成）：
    //  插件面板在线数据源（离线用 client.js 内置副本）；文件不存在时按生成脚本提示返回
    if (p === '/diag-flags.json') {
      const fp = path.join(WEB_DIR, 'diag-flags.json');
      if (fs.existsSync(fp)) {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' });
        res.end(fs.readFileSync(fp));
      } else {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'diag-flags.json 不存在，先跑 node diag-flag-check.mjs' }));
      }
      return;
    }
    if (p.startsWith('/elysia/')) {
      const rel = p.slice('/elysia/'.length);
      const base = path.join(REPO_ROOT, 'elysia');
      const full = path.join(base, rel);
      if (full.startsWith(base) && fs.existsSync(full) && fs.statSync(full).isFile()) {
        const ct = rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.json') ? 'application/json' : 'application/octet-stream';
        res.writeHead(200, { 'content-type': ct });
        res.end(fs.readFileSync(full));
        return;
      }
      res.writeHead(404); res.end('no elysia file');
      return;
    }
    if (p === '/diag' && req.method === 'POST') {
      // ①(MERGED-2 E 2026-09-12) ?selfcheck=1 / ?perf=1 的紧凑报告接收端（≤16KB）
      try {
        let body = ''
        req.on('data', (c) => { body += c; if (body.length > 16 * 1024) req.destroy() })
        req.on('end', () => {
          try {
            const dir = MPW_REPORTS_DIR
            mkdirSyncSafe(dir)
            pruneReports(dir)   // ①(P-104) 写入前检查：先把上一次遗留的超限收回去
            fs.writeFileSync(path.join(dir, 'selfcheck-' + Date.now() + '.json'), body)
            pruneReports(dir)   // ①(P-104) 写入后检查：本次这份也计入数量/字节上限（历史：这条路**完全没有滚动**）
            res.writeHead(200); res.end('ok')
          } catch { res.writeHead(500); res.end('err') }
        })
      } catch { res.writeHead(500); res.end('err') }
      return
    }
    if (p === '/diag') {
      // ①同上：先读后写，缺文件 404（原来缺 diag.html 会先发 200 再抛）
      const fp = path.join(WEB_DIR, 'diag.html');
      let buf = null;
      try { buf = fs.readFileSync(fp) } catch { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('diag.html not found'); return }
      sendBuffer(req, res, buf, 'text/html; charset=utf-8');
    } else if (p === '/probe') {
      // ①(P-41 A6) 与其它路由对齐的错误语义：文件缺失 → 404 + JSON 说明；读失败 → 500（不再把
      //   ENOENT 直接抛成未捕获异常炸掉整个请求管线）
      const fp = path.join(WEB_DIR, 'probe.html');
      if (fs.existsSync(fp)) {
        try {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(fs.readFileSync(fp));
        } catch (e) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'probe.html 读取失败: ' + e.message }));
        }
      } else {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'probe.html 不存在' }));
      }
      return;
    }
    // WE 公共 shader 头（等价实现：common.h/common_blending.h 等）
    // waterwaves/shake 等效果 #include 依赖；场景 pkg 不含这些（WE 全局资产）
    const WE_SHADERS = MPW_WE_ASSETS + '/shaders';
    const HEADER_FILES = {};
    // ①(2026-09-14 公开副本自足性) **本仓库自研头优先**，WE 安装目录仅作兜底：
    //   本项目已把实际引用的 6 个头换成自研实现（见 docs/COMMON-HEADERS-REPLACEMENT.md），
    //   不再需要读 WE 的字节；用户机器没装 WE 时也能正常编译着色器。
    // ①(P-87 2026-09-15 公开副本自足性) 这一行原来**无条件** scandir WE 安装目录：没装 WE 的机器
    //   （= 公开副本的正常情况）**每个请求**都在这里抛 ENOENT → 全站 500（实测：连 /pkg/<自带合成样例>
    //   都 500，验证服务器形同报废）。而本仓库自研的 common*.h 就在 __dirname，下面第二个循环无条件加载
    //   ⇒ 缺 WE 只是少一层"官方同名头兜底"，不该致命。故把 scandir 包进 try/catch：
    //   装了 WE 的机器 readdirSync 成功、HEADER_FILES 与改动前逐位相同（author 机行为不变）。
    try {
      for (const f of fs.readdirSync(WE_SHADERS)) {
        if (/^common.*\.h$/.test(f)) {
          const own = path.join(SHADERS_DIR, f);
          HEADER_FILES[f] = fs.existsSync(own) ? own : path.join(WE_SHADERS, f);
        }
      }
    } catch { /* 未安装 WE / 无 assets：只用仓库自研头（下个循环），不致命 */ }
    for (const f of fs.readdirSync(SHADERS_DIR)) {
      if (/^common.*\.h$/.test(f)) HEADER_FILES[f] = path.join(SHADERS_DIR, f);
    }
    let m = null;
    const pm = (re) => (m = p.match(re));
    if (p.startsWith('/shaders/')) {
      const fname = p.slice('/shaders/'.length);
      if (HEADER_FILES[fname]) {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end(fs.readFileSync(HEADER_FILES[fname]));
        return;
      }
    }
    if (HEADER_FILES[p.slice(1)]) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(fs.readFileSync(HEADER_FILES[p.slice(1)]));
      return;
    }

    m = p.match(/^\/report$/);
    if (m) {
      try {
        let body = ''
        req.on('data', (c) => { body += c; if (body.length > 4 * 1024 * 1024) req.destroy() })
        req.on('end', () => {
          try {
            const dir = MPW_REPORTS_DIR
            mkdirSyncSafe(dir)
            pruneReports(dir)   // ①(P-104) 写入前检查（上限常量集中在 MPW_LIMITS）
            fs.writeFileSync(path.join(dir, 'r' + Date.now() + '.json'), body)
            // ①(P-104 2026-09-17) 上限从"只有数量 60 份"升级成 **数量 + 合计 64MB**。
            //   写**后**再收一次：本次这份也算进账（写前那次管的是上一次遗留）。
            pruneReports(dir)
            res.writeHead(200); res.end('ok')
          } catch { res.writeHead(500); res.end('err') }
        })
      } catch { res.writeHead(500); res.end('err') }
      return
    }
    // ═══ ①(P-88 2026-09-15 用户点名："加一个一键连拍上报截图的功能 —— 这样我就不用下载下来，
    //   点一下不需确认就能直接上传到你的后台，因为我下载下来可能卡不好他的时机") ═══
    //   POST /shot?id=<壁纸id>&tag=<burst-07|single>&t=<场景秒>&note=<备注>
    //   body = **原始图片字节**（就是 JPEG/PNG 本身，不是 base64 JSON —— base64 会把 4MB 上限
    //   白白吃掉 33%，而这条需求的画面是**原分辨率的人物面部/眉毛**，体积本来就紧）。
    //   与 /report 的关系：**完全分开**。上报目录仍是 MPW_REPORTS_DIR，但帧走 shots/ 子目录、
    //   自己按"每 id 最多 400 帧"滚动 ⇒ 一个字的 60 份滚动策略都不动（shots 目录也不参与它）。
    //   落盘：<MPW_REPORTS_DIR>/shots/<id>/<ts>-<tag>.<jpg|png> + 同目录 index.jsonl 一行一条元数据。
    //   限制：单帧 >4MB → 413；content-type 非 image/jpeg|image/png → 415；id 不合 ID_PAT 或含 `..` → 400。
    //   返回：{"ok":true,"file":"shots/<id>/<name>","bytes":N}（file 相对 MPW_REPORTS_DIR；绝对路径同时打到服务端 stdout）。
    m = p.match(/^\/shot$/);
    if (m && req.method === 'POST') {
      const q = new URL(req.url || '', 'http://localhost').searchParams;
      const sid = String(q.get('id') || '');
      // tag 只当**文件名片段**用：白名单化（防 `../`、防奇怪字符），限长 64
      const tag = String(q.get('tag') || 'single').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64) || 'single';
      const tq = String(q.get('t') || '').slice(0, 32);
      const note = String(q.get('note') || '').slice(0, 200);
      const ct = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      // id 安全过滤：与 /pkg/<id> 同一个 ID_PAT（首字符不许是点），并**显式拒 `..`**
      //   （正则允许点号出现在中间，`a..b` 这种仍会经 path.join 语义可疑 ⇒ 直接挡在门外）
      if (!new RegExp('^' + ID_PAT + '$').test(sid) || sid.includes('..')) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'bad id：只接受 [A-Za-z0-9_][A-Za-z0-9_.-]*，拒 `..` / 斜杠 / 空' }));
        return;
      }
      if (ct !== 'image/jpeg' && ct !== 'image/png') {
        res.writeHead(415, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'unsupported content-type: ' + (ct || '(none)') + '（只接受 image/jpeg / image/png 的原始字节）' }));
        return;
      }
      const MAX_SHOT = 4 * 1024 * 1024, HARD_SHOT = 64 * 1024 * 1024;
      const chunks = []; let size = 0, tooBig = false;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_SHOT) {
          // 超限后**继续把 socket 读干净**（不再缓存），到 end 再回 413 ——
          // 这样客户端拿到的是明确的 413 JSON，而不是半路断连的 ECONNRESET。
          tooBig = true;
          if (size > HARD_SHOT) req.destroy();     // 绝对硬上限：再大就不陪它读了
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (tooBig) {
          res.writeHead(413, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'frame too large: ' + size + ' > ' + MAX_SHOT + ' bytes（单帧上限 4MB；请降 JPEG 质量或按 1920 宽等比缩小）' }));
          return;
        }
        try {
          const dir = path.join(MPW_REPORTS_DIR, 'shots', sid);
          mkdirSyncSafe(dir);
          const ts = Date.now();
          const ext = ct === 'image/png' ? '.png' : '.jpg';
          // 同名（同一毫秒同一 tag）不覆盖：追加 -2/-3…（连拍 100ms 一帧不会撞，但手快连按 j 会）
          let name = ts + '-' + tag + ext, n = 1;
          while (fs.existsSync(path.join(dir, name))) name = ts + '-' + tag + '-' + (++n) + ext;
          const buf = Buffer.concat(chunks, size);
          pruneShotsId(sid);   // ①(P-104) 写入前检查：本 id 目录已超限就先把最旧的收掉
          fs.writeFileSync(path.join(dir, name), buf);
          const rel = 'shots/' + sid + '/' + name;   // 统一正斜杠（file 字段是给文档/日志看的相对路径）
          // 元数据：一行一条 JSON（追加）。写失败**不影响**这一帧已落盘的事实，只记一行警告。
          // 数字字段用 numOrNull：缺参/非数字 → null，但 **0 是真的 0**（帧号 0 = 首帧，不能被吞掉）。
          const numOrNull = (v) => { const n = Number(v); return (v === null || v === '' || !isFinite(n)) ? null : n };
          try {
            fs.appendFileSync(path.join(dir, 'index.jsonl'), JSON.stringify({
              id: sid, tag, t: tq, note, file: name, rel,
              bytes: buf.length, ts, at: new Date(ts).toISOString(),
              // 画面尺寸/原始尺寸（前端 ?w/?h/?ow/?oh）：只有连拍路径带；单帧 j 也带。
              w: numOrNull(q.get('w')), h: numOrNull(q.get('h')),
              ow: numOrNull(q.get('ow')), oh: numOrNull(q.get('oh')),
              frame: numOrNull(q.get('frame')),
              ua: String(req.headers['user-agent'] || '').replace(/\s+/g, ' ').slice(0, 120),
            }) + '\n');
          } catch (e) { console.warn('[shot] index.jsonl 追加失败：' + (e && e.message)); }
          // 滚动（①P-104 2026-09-17 用户发布纪律②"自动落盘的东西要设上限"）：
          //   **每 id ≤400 帧 + ≤200MB**，再叠一层 **shots/ 全局 ≤500MB**（跨 id 合计，公平地删"所有 id 里
          //   最旧的那一帧"）。三条上限都从 MPW_LIMITS 取（唯一来源）；index.jsonl 是台账，永不删。
          //   与 /report 的"60 份 + 64MB"策略各自独立 —— 两边互不碰对方的目录。
          pruneShotsId(sid);
          pruneShotsAll();
          console.log('[shot] ' + path.join(dir, name) + ' ' + buf.length + 'B tag=' + tag + (tq ? ' t=' + tq : ''));
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true, file: rel, bytes: buf.length }));
        } catch (e) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
        }
      });
      return;
    }
    // ═══ ①(RE-25 场景集成 2026-09-12) 让渲染器能加载"任意来源的 PKG/PKGM 容器" ═══
    //   /pkgurl?u=<encoded url>  服务端代理抓取（绕 CORS，插件宿主只需提供 /raw 流）
    //   /pkgpath?p=<绝对路径>     直接读本地文件（限白名单根，供本机/调试用）
    m = p.match(/^\/pkgurl$/);
    if (m) {
      try {
        const u = new URL(req.url || '', 'http://localhost').searchParams.get('u') || '';
        if (!/^https?:\/\//i.test(u)) { res.writeHead(400); res.end('bad url'); return }
        fetch(u).then(async (r) => {
          if (!r.ok) { res.writeHead(r.status); res.end('upstream ' + r.status); return }
          const buf = Buffer.from(await r.arrayBuffer())
          res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': buf.length, 'cache-control': 'no-cache' })
          res.end(buf)
        }).catch((e) => { res.writeHead(502); res.end('fetch fail: ' + e.message) })
      } catch (e) { res.writeHead(500); res.end(String(e && e.message)) }
      return
    }
    // ═══ ①(用户第22项「MPKG 与 workshop 源目录混合加载」2026-09-14) ═══
    //   渲染器只吃**一个包文件**；这里把 workshop 源目录即时打包成 PKG 容器再喂给它，
    //   于是前端只需把 "目录源" 也当成一个 pkgurl 即可，渲染器与既有链路一行都不用改。
    //   - GET /pkgdir?d=<绝对目录>   → 打包（同一目录按 mtime+条目数缓存）后按 octet-stream 返回
    //   - GET /pkgdir?scan=1[&root=<白名单内目录>] → 列出可直接打包的目录（供前端列表混排）
    //   白名单与 /pkgpath 同款（禁 .. 穿越）。CORS 由 applyCors 统一挂。
    m = p.match(/^\/pkgdir$/);
    if (m) {
      try {
        const q = new URL(req.url || '', 'http://localhost').searchParams
        const ALLOW = MPW_ALLOW_DIRS
        const okPath = (fp) => !!fp && ALLOW.some((a) => fp.startsWith(a)) && !fp.includes('..')
        if (q.get('scan') === '1') {
          const roots = q.get('root') ? [q.get('root')] : ALLOW
          const hits = []
          const walk = (dir, depth) => {
            if (depth > 6) return
            let ents = []
            try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
            const names = new Set(ents.map((e) => e.name))
            if (names.has('scene.pkg') || names.has('project.json')) {
              try { hits.push({ dir, entries: collectFiles(dir).length }) } catch {}
            }
            for (const e of ents) if (e.isDirectory() && !e.isSymbolicLink()) walk(path.join(dir, e.name), depth + 1)
          }
          for (const r of roots) if (okPath(r)) walk(r, 0)
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-cache' })
          res.end(JSON.stringify({ ok: true, count: hits.length, dirs: hits }))
          return
        }
        const dir = q.get('d') || ''
        if (!okPath(dir)) { res.writeHead(403); res.end('forbidden'); return }
        let st = null
        try { st = fs.statSync(dir) } catch { res.writeHead(404); res.end('no dir'); return }
        if (!st.isDirectory()) { res.writeHead(400); res.end('not a directory'); return }
        // 缓存键 = 目录 mtime + 条目数（目录内容变了 mtime 会变）；最多留 4 份，防内存膨胀
        const cacheKey = dir + '|' + st.mtimeMs
        let hit = PKGDIR_CACHE.get(cacheKey)
        if (!hit) {
          const packed = packDir(dir)                       // 原样存储，不压缩
          hit = { buf: packed.buf, entries: packed.entries.length, at: Date.now() }
          PKGDIR_CACHE.set(cacheKey, hit)
          if (PKGDIR_CACHE.size > 4) PKGDIR_CACHE.delete(PKGDIR_CACHE.keys().next().value)
          console.log('[pkgdir] 打包 ' + dir + ' → ' + hit.entries + ' 条目 / ' + (hit.buf.length / 1048576).toFixed(2) + ' MiB')
        }
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': hit.buf.length, 'cache-control': 'no-cache', 'x-mpw-pkgdir': String(hit.entries) })
        res.end(hit.buf)
      } catch (e) { res.writeHead(500); res.end('pack failed: ' + (e && e.message || e)) }
      return
    }
    m = p.match(/^\/pkgpath$/);
    if (m) {
      try {
        const fp = new URL(req.url || '', 'http://localhost').searchParams.get('p') || ''
        const ALLOW = MPW_ALLOW_DIRS
        const okPath = ALLOW.some((a) => fp.startsWith(a)) && !fp.includes('..')
        if (!okPath) { res.writeHead(403); res.end('forbidden'); return }
        const st = fs.statSync(fp)
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' })
        res.end(fs.readFileSync(fp))
      } catch (e) { res.writeHead(404); res.end('not found') }
      return
    }
    m = p.match(reIdRoute('project'));
    if (m) {
      try {
        // ①(P-85 2026-09-15) 改用统一查找链：原来只读 <MPW_SCENE_ROOT>/<id>/project.json，语料目录
        //   没有这份文件时（公开副本无 allwallpaper/、语料只留容器）恒 404 → 前端 propsSchema=null
        //   → 属性面板空白、visible:{user:{condition:…}} 全走"缺失→按可见"兜底。现在会兜到本机
        //   Steam 工坊目录里的同名文件。行为保持"返回该 json 的原始体 + application/json"；
        //   命中时额外带 x-project-source: <source>（排查"这份属性表从哪来"）。
        //   ①(P-87) sceneRoot 用 findScene 真正命中的那一档根（语料根 **或** 自带样例父目录），
        //   这样 `?id=sample-synthetic` 的属性表也能读到；两档都没命中时退回既有默认值（行为不变）。
        const sc = findScene(m[1]);
        const pr = readProjectJson(m[1], { root: MPW_ROOT, sceneRoot: sc ? path.dirname(sc.dir) : MPW_SCENE_ROOT });
        if (!pr) { res.writeHead(404); res.end('no project.json'); return }
        const buf = fs.readFileSync(pr.path) // 原始字节直出（命中同一文件时与改动前逐字节一致）
        res.writeHead(200, { 'content-type': 'application/json', 'x-project-source': pr.source })
        res.end(buf)
        if (!PROJECT_SOURCE_LOGGED.has(m[1])) {
          PROJECT_SOURCE_LOGGED.add(m[1]);
          console.log('[project] ' + m[1] + ' ← ' + pr.source + ' (' + pr.path + ')');
        }
      } catch (e) { res.writeHead(404); res.end('no project.json') }
      return
    }
    m = p.match(reIdRoute('ddlist'));
    if (m) {
      try {
        // ①(P-87) 同样用 findScene 命中的那一档根：`?id=sample-synthetic` 也能列出自带样例目录的文件。
        const sc = findScene(m[1]);
        const base = sc ? sc.dir : path.join(MPW_SCENE_ROOT, m[1])
        const files = fs.readdirSync(base).filter((f) => f !== 'scene.pkg')
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, files }))
      } catch { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, files: [] })) }
      return
    }
    m = p.match(/^\/elysia-video\/(\d+)$/);
    if (m) {
      // elysia CPU 渲染 90 帧 → mp4（后台生成；缓存）
      const mp4 = '/tmp/elysia-render/' + m[1] + '-video.mp4'
      if (fs.existsSync(mp4)) {
        const st = statSyncSafe(mp4)
        sendFileStream(req, res, mp4, st.size, 'video/mp4')
        return
      }
      res.writeHead(404); res.end('在后台生成中（先 /elysia/<id> 触发）')
      return
    }
    m = p.match(/^\/elysia\/(\d+)$/);
    if (m) {
      const sid = m[1]
      const cached = '/tmp/elysia-render/' + sid + '.png'
      try {
        if (!fs.existsSync(cached)) {
          const { execFileSync } = await import('node:child_process')
          mkdirSyncSafe('/tmp/elysia-render')
          execFileSync('node', ['/tmp/elysia-run/render-one.mjs'], { timeout: 600000, env: { ...process.env, ELYSIA_ID: sid } })
        }
        if (fs.existsSync(cached)) {
          const st = statSyncSafe(cached)
          res.writeHead(200, { 'content-type': 'image/png', 'content-length': st.size })
          fs.createReadStream(cached).pipe(res)
          return
        }
        res.writeHead(500); res.end('render fail')
      } catch (e) { res.writeHead(500); res.end(String(e && e.message || e)) }
      return
    }
    m = p.match(reIdRoute('type'));
    if (m) {
      // ①(P-85 2026-09-15) 同 /project 改走统一查找链（原来也是只读 <MPW_SCENE_ROOT>/<id>/project.json）；
      //   读不到时**逐字保留**既有兜底（ok:true, type:'unknown'），调用方行为不变。
      //   ①(P-87) sceneRoot 同 /project：用 findScene 命中的那一档根（自带样例也能读）。
      const scT = findScene(m[1]);
      const pr = readProjectJson(m[1], { root: MPW_ROOT, sceneRoot: scT ? path.dirname(scT.dir) : MPW_SCENE_ROOT })
      try {
        if (!pr) throw new Error('no project.json')
        const j = pr.json
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, type: j.type || '?', title: j.title || '', file: j.file || '' }))
      } catch { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, type: 'unknown' })) }
      return
    }
    m = p.match(/^\/ddvideo\/(\d+)\/(.+)$/);
    if (m) {
      const rel = decodeURIComponent(m[2])
      const base = path.join(MPW_SCENE_ROOT, m[1])
      const full = path.join(base, rel)
      const st = statSyncSafe(full)
      if (full.startsWith(base) && st && st.isFile()) {
        sendFileStream(req, res, full, st.size, 'video/mp4')
        return
      }
      res.writeHead(404); res.end('no video')
      return
    }

    pm(/^\/videolib\/(.+)$/);
    if (m) {
      const rel = decodeURIComponent(m[1])
      const base = '/tmp/loose-cmp'
      const full = path.join(base, rel)
      const st = statSyncSafe(full)
      if (full.startsWith(base) && st && st.isFile()) {
        sendFileStream(req, res, full, st.size, 'video/mp4')
        return
      }
      res.writeHead(404); res.end('no video')
      return
    }

    // ①(预留接口 2026-09-13) 外部扩展钩子：/ext（索引 JSON）+ /ext/<name>（ES 模块）
    //   目录：we-scene-demo/extensions/（不存在时自动创建并放 README）。
    //   页面侧用法：?extbase=http://127.0.0.1:8899/ext 或 ?exthooks=<绝对 URL>
    //   钩子槽位见 EXTENSION-HOOKS.md（resolveTexture / layerRect / shaderSource / postFrame / stats）
    if (p === '/ext' || p === '/ext/') {
      const dir = path.join(REPO_ROOT, 'extensions')
      let hooks = []
      try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        hooks = fs.readdirSync(dir).filter((f) => /\.(m?js)$/.test(f) && !f.startsWith('_'))
      } catch {}
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok: true, note: '把扩展模块放进 we-scene-demo/extensions/，页面加 ?extbase=<base>/ext 即自动加载', slots: ['resolveTexture', 'layerRect', 'shaderSource', 'postFrame', 'stats'], hooks }, null, 2))
      return
    }
    m = p.match(/^\/ext\/([\w.-]+)$/);
    if (m) {
      const base = path.join(REPO_ROOT, 'extensions')
      const full = path.join(base, m[1])
      if (full.startsWith(base) && fs.existsSync(full)) {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' })
        res.end(fs.readFileSync(full))
        return
      }
      res.writeHead(404, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: '扩展模块不存在: ' + m[1], hint: '放到 we-scene-demo/extensions/ 下' }))
      return
    }

    // ①(P-86 2026-09-15) 仓库自带字体：`/assets/fonts/<文件>` → **本仓库** `we-scene-demo/assets/fonts/**`。
    //   四级字体链的第二级（demo.html 的 `repoFontUrl()` 生成该 URL；`?repofonts=off` 时不请求它）。
    //   这里只放**我们有权分发**的字体（只从作者/上游取件，**绝不从 `<WE>/assets/fonts/` 复制**），
    //   逐文件许可/版权行/上游 URL/取件日期/sha256 见 THIRD-PARTY.md §4，目录说明见 assets/fonts/README.md。
    //   路径穿越防护与下面 `/weassist/(.+)` 同款（decodeURIComponent 后剥前导 `./`，`path.join` 归一化，
    //   再以 `full.startsWith(base)` 兜底），并**只放行**字体与随附说明这几类扩展名。
    //   content-type 按扩展名给（.ttf → font/ttf、.otf → font/otf），FontFace 与 curl 都能一眼核对。
    m = p.match(/^\/assets\/fonts\/(.+)$/);
    if (m) {
      const rel = decodeURIComponent(m[1]).replace(/^\.+\//, '')
      const base = path.join(REPO_ROOT, 'assets', 'fonts')
      const full = path.join(base, rel)
      const st = statSyncSafe(full)
      const ct = /\.ttf$/i.test(rel) ? 'font/ttf'
        : /\.otf$/i.test(rel) ? 'font/otf'
        : /\.json$/i.test(rel) ? 'application/json'
        : /\.md$/i.test(rel) ? 'text/markdown; charset=utf-8'
          : /\.txt$/i.test(rel) ? 'text/plain; charset=utf-8'
            : null
      if (ct && full.startsWith(base) && st && st.isFile()) {
        sendFileStream(req, res, full, st.size, ct)
        return
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('no repo font');
      return
    }

    m = p.match(/^\/weassist\/(.+)$/);
    if (m) {
      const rel = decodeURIComponent(m[1]).replace(/^\.+\//, '')
      const base = MPW_WE_ASSETS
      const full = path.join(base, rel)
      if (full.startsWith(base) && fs.existsSync(full)) {
        res.writeHead(200, { 'content-type': rel.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
        res.end(fs.readFileSync(full));
        return;
      }
      res.writeHead(404); res.end('no we asset');
      return;
    }

    m = p.match(reIdRoute('pkg'));
    if (m) {
      const sc = findScene(m[1]);
      if (!sc) { res.writeHead(404); res.end('no scene'); return; }
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(fs.readFileSync(sc.pkgPath));
      return;
    }

    if (p === '/noise') {
      for (const id of fs.readdirSync(SCENE_ROOT)) {
        const sc = findScene(id);
        if (!sc) continue;
        const buf = new Uint8Array(fs.readFileSync(sc.pkgPath));
        const entries = parsePkg(buf);
        const e = entries.find((x) => /noise/i.test(x.path) && x.path.toLowerCase().endsWith('.tex'));
        if (e) {
          res.writeHead(200, { 'content-type': 'application/octet-stream' });
          res.end(Buffer.from(readPkgEntry(buf, e)));
          return;
        }
      }
      res.writeHead(404); res.end('no noise tex');
      return;
    }

    let rm = p.match(/^\/render\/(\d+)\.png$/);
    if (rm) {
      const sid = rm[1]
      const cached = path.join('/tmp/elysia-render', sid + '.png')
      try {
        if (!fs.existsSync(cached)) {
          // 异步渲染（防阻塞事件循环）；轮询等待最多 120s
          mkdirSyncSafe('/tmp/elysia-render')
          try { spawn('node', ['/tmp/elysia-run/render-one.mjs', sid], { env: { ...process.env, ELYSIA_ID: sid }, detached: true, stdio: 'ignore' }).unref() } catch {}
          const wait = async () => {
            for (let i = 0; i < 240; i++) {
              if (fs.existsSync(cached)) return true
              await new Promise((r2) => setTimeout(r2, 500))
            }
            return false
          }
          if (!(await wait())) { res.writeHead(503); res.end('渲染中（超时）'); return }
        }
        const st = statSyncSafe(cached)
        res.writeHead(200, { 'content-type': 'image/png', 'content-length': st.size })
        fs.createReadStream(cached).pipe(res)
        return
      } catch (e) { res.writeHead(500); res.end(String(e && e.message || e)) }
      return
    }

    let refm = p.match(/^\/refrender\/(\d+)$/);
    if (refm) {
      const fp = path.join(path.dirname(fileURLToPath(import.meta.url)), 'refrender-' + refm[1] + '.json')
      if (fs.existsSync(fp)) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(fs.readFileSync(fp)); return }
      res.writeHead(404); res.end('no refrender')
      return
    }
    refm = p.match(/^\/ref\/(\d+)$/);
    if (refm) {
      const fp = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ref-' + refm[1] + '.json')
      if (fs.existsSync(fp)) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(fs.readFileSync(fp)); return }
      res.writeHead(404); res.end('no ref'); return
    }

let trm = p.match(/^\/transpiled\/(\d+)\/(.+)$/);
    if (trm) {
      try {
        const { hlsl2glsl, parsePkg, getEntry } = await import('../core/we-scene-bundle.js')
        const pkg = parsePkg(new Uint8Array(fs.readFileSync(path.join(MPW_SCENE_ROOT, trm[1], 'scene.pkg'))))
        const rel = decodeURIComponent(trm[2])
        const e = pkg.entries.find((x) => x.name === rel)
        if (!e) { res.writeHead(404); res.end('no shader'); return }
        const src = new TextDecoder().decode(getEntry(pkg, e.name))
        const stage = rel.endsWith('.vert') ? 'vert' : 'frag'
        const inc = (n) => {
          n = String(n || '').replace(/^["']|["']$/g, '')
          const ie = pkg.entries.find((x) => x.name === 'shaders/' + n)
          if (ie) return new TextDecoder().decode(getEntry(pkg, ie.name))
          const f = path.join(MPW_WE_ASSETS, 'shaders', n)
          if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8')
          return null
        }
        const out = hlsl2glsl(src, stage, {}, inc)
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end(out)
      } catch (err) { res.writeHead(500); res.end('ERR ' + String(err && err.message || err)) }
      return
    }

    m = p.match(/^\/shader\/(\d+)\/(.+)$/);
    if (m) {
      const sc = findScene(m[1]);
      const rel = decodeURIComponent(m[2]);
      const buf = new Uint8Array(fs.readFileSync(sc.pkgPath));
      const entries = parsePkg(buf);
      for (const c of ['shaders/' + rel, rel]) {
        const e = entries.find((x) => x.path.toLowerCase() === c.toLowerCase());
        if (e) { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(new TextDecoder().decode(readPkgEntry(buf, e))); return; }
      }
      res.writeHead(404); res.end('no shader');
      return;
    }

    res.writeHead(404); res.end('not found: ' + p);
  } catch (e) {
    // ①(2026-09-14 公开副本实测崩溃修复) 某些路由在**已经写过响应头**之后才抛错（例如缺文件/流错误），
    //   此时再 writeHead(500) 会抛 ERR_HTTP_HEADERS_SENT —— 未捕获的话整个进程退出，表现为"一请求就崩"。
    //   修法：只在还没发头时写 500；已发头就只结束响应；并打印 URL 便于定位。
    try {
      console.warn('[server] 请求处理异常 ' + (req && req.url) + ' → ' + (e && e.message));
      if (!res.headersSent) { res.writeHead(500); res.end('server error: ' + (e && e.message)) }
      else { try { res.end() } catch {} }
    } catch { /* 兜底：绝不让异常冒泡到进程 */ }
  }
});


const osInfo = await import('node:os')

server.listen(port, '0.0.0.0', () => {
  // ①(P-104 2026-09-17 用户发布纪律②) **启动清理一次**：把上次遗留的超限上报目录收回限内，
  //   并在 stdout 打出"删了几个 / 释放多少 MB / 当前上限"（清理动作必须留痕）。
  try { pruneAllOnStartup() } catch (e) { console.warn('[limits] 启动清理失败（不影响服务）：' + (e && e.message)) }
  console.log('[weassist] WE 资产目录: ' + (fs.existsSync(MPW_WE_ASSETS) ? MPW_WE_ASSETS : '未找到（粒子预设/材质兜底将被跳过；可用 MPW_WE_ASSETS 指定）'));
  // ①(P-87 2026-09-15 版权) 场景根必须**如实播报**：真实壁纸已从仓库移除，别让人以为"自带包但打不开"。
  console.log('[scene] 场景根 MPW_SCENE_ROOT=' + MPW_SCENE_ROOT
    + (fs.existsSync(MPW_SCENE_ROOT) ? '' : '（**不存在**：?id= 一律 404）'));
  console.log('        本仓库**不打包任何真实壁纸**（第三方版权）；真实语料请自己放：'
    + 'MPW_SCENE_ROOT=<你的语料根>（形如 <root>/<id>/scene.pkg）或 ?pkgpath=<绝对路径>/scene.pkg。'
    + '随仓库自带的只有程序化生成的合成样例：?id=sample-synthetic');
  const ips = []
  const nets = osInfo.default.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address)
    }
  }
  console.log('we-scene 验证服务器 v2: http://0.0.0.0:' + port)
  console.log('  访问地址:', ips.map((i) => 'http://' + i + ':' + port).join('   ') || 'http://127.0.0.1:' + port)
})
