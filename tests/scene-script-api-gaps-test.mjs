// scene-script-api-gaps-test.mjs —— P-141：P-137 之后残余的 **8 类 SceneScript API 缺口**
//   （thisLayer.getAnimation / thisLayer.getParticleSystem / thisLayer.isPlaying /
//     thisScene.getLayerIndex / thisScene.createLayer / audioLayer.stop / engine.setInterval /
//     createLayer 级联出来的文本 `toFixed`）是否**真的**被收口：存在性 + 官方签名面 +
//   readonly 只读语义 + 真包 N 帧 0 错 + 全语料逐包第 1 帧 0 错 + 3 组变异必红。
//
// 登记待办（P-141 分工：`tests/run-all-tests.sh` 由主对话统一落账，本文件**不**改它）：
//   建议条目：add "scene-script-api-gaps" "node tests/scene-script-api-gaps-test.mjs" "" "^SKIP scene-script-api-gaps"
//
// ── 官方语义出处（一手，逐条行号是实测）────────────────────────────────────────────────────
//   `$MPW_ROOT/wallpaper_engine/ui/dist/monaco/autocomplete/lib.sceneScript.d.ts`
//     · L494-499  `interface IObject { getAnimation(name?: String): IAnimation; }`
//     · L1139     `interface ILayer extends IObject, IImageLayer, ISoundLayer, IEffectLayer,
//                  ITextLayer, IParticleSystem, IModel, ICamera`
//     · L744-771  `interface ISoundLayer { isPlaying(): Boolean; play(): void; stop(): void;
//                  pause(): void; volume: Number; }`（⇒ `isPlaying` 是**方法**）
//     · L955-985  `interface IParticleSystem { play/pause/stop/isPlaying/emitParticles(count?);
//                  instance: IParticleSystemInstance; }`
//     · L874-952  `IParticleSystemInstance`：alpha/size/count/speed/lifetime/rate/colorn/controlpoint0..7
//     · L1278/1282/1288/1292 `IScene.createLayer / sortLayer / getLayerIndex / getInitialLayerConfig`
//     · L1519     `IEngine.setInterval(callback: Function, delay?: Number): Function`
//                 （同段 L1523-1526 把 `clearTimeout` 注释掉并写 "Not implemented. Use returned
//                   function to clear." ⇒ 官方清除路径 = **调用返回的函数**；我们额外提供
//                   `engine.clearInterval(handle)`，行为对照 wer-ref `WPSceneScriptHost.cpp:919`）
//     · L1568-1623 `interface IAnimation`：`readonly fps/frameCount/duration/name`、`rate: Number`、
//                 `play/pause/stop/isPlaying/getFrame/setFrame`
//     · `thisLayer.getParticleSystem` **不在** d.ts（也不在官方 ILayer 文档页）—— 语料作者的写法，
//       官方模型里"本层的粒子系统"就是 `thisLayer` 自己（L1139）⇒ 我们返回同一个 IParticleSystem 视图。
//   ⚠ 官方文档（docs.wallpaperengine.io/en/scene/scenescript/reference/class/*.html）只作**补充**；
//     `references/wer-ref`（GPL-2.0-only，与本仓库 GPL-3.0-or-later 不兼容）只作**行为对照**，
//     未复制任何代码/注释/文案。
//
// ── 本文件钉住什么（每条都是真跑出来的判据，无浏览器、无网络、秒级）────────────────────────
//   S0  基线：被测沙箱可加载，且 P-141 的**两个可观测入口**（`sceneScriptApiDiag` /
//       `resetSceneScriptApiDiag`）存在 —— 没有它们，"no-op"与"静默丢弃"无法区分。
//   S1  存在性与签名（全部在**真沙箱**里跑作者风格的 `'use strict'` 脚本再读回值）：
//       S1a `thisLayer.getAnimation(name?)` → IAnimation 面（含返回真值）
//       S1b IAnimation 的四个官方 `readonly`：**赋值不抛错、值也不变**（只写 getter 会在 strict
//           下抛 TypeError ⇒ 这不是"多余 setter"，是行为契约；同 P-137 的 `size`）
//       S1c `thisLayer.getParticleSystem()` → IParticleSystem 面 + `instance` 官方字段 +
//           `.rate` 写穿到 `obj.instanceoverride.rate`（渲染器真正读的那个对象，可观测）
//       S1d `thisLayer.isPlaying` 是**方法**（不是属性），且 play/pause/stop 状态机自洽
//       S1e `thisScene.getLayerIndex(thisLayer | name | 不存在)` → 0 / 1 / -1（不抛错）
//       S1f `thisScene.createLayer(对象 | 字符串 | IAssetHandle)` → 可用 ILayer + 属性写穿 +
//           `enumerateLayers()` 可见
//       S1g `thisScene.sortLayer(layer, index)` → 真的改顺序（Boolean true）
//       S1h `engine.setInterval` 是函数、返回 stop 函数；`engine.clearInterval` 是函数
//       S1i `thisScene.getLayer(name)` 的层带 ISoundLayer 面（语料的 `audioLayer.stop()`）
//       S1j P-137 的 `thisLayer.size` 回归面（本批不得改坏：读得到、赋值不抛错、值不变）
//   S2  `engine.setInterval` **真的按 ms 触发**：场景时钟 0→1s 逐 0.2s 走，
//       500ms 之前 0 次、之后 ≥1 次；`clearInterval` 之后不再增长。（不是"排了就算"）
//   S3  8 个真包整包跑 N 帧 ⇒ `scriptErrs` 为空（逐包一条断言；真包缺失 ⇒ SKIP）
//   S4  全语料（`$MPW_ROOT/allwallpaper`）**逐包第 1 帧** 0 错（计数断言：有错的包 = 0 /
//       带 scripts 的包数 = 逐包检查数；语料缺失 ⇒ SKIP）
//   S5  红-if-reverted ×3：把 `elysia/` 复制进 mkdtemp，**只改副本**（readFileSync/writeFileSync），
//       分别摘掉 `thisLayer.getAnimation` / `thisLayer.getParticleSystem` / `engine.setInterval`
//       ⇒ 各自点名的那条断言必红（子进程 rc=1）+ 该变异体里基线仍 ✓（证明红不是"副本起不来"）。
//       并且先跑**未变异副本**要求全绿（对照组：证明红是被点名那条语义，不是环境）。
//
// 用法：node tests/scene-script-api-gaps-test.mjs [--no-mutation] [--quick] [--verbose]
//   --no-mutation  跳过 S5 自检（变异子进程用；避免递归）
//   --quick        跳过 S4 语料扫描（变异子进程用，省时间）
// 退出码：0 全过（含 SKIP）/ 1 有失败 / 2 用法错误
//
// 环境：`MPW_SCENE_SCRIPTS` 覆盖被测沙箱（变异用）；`MPW_ROOT` 覆盖语料根（默认工作区根）。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { ROOT, WS } from './_root.mjs'
import { readSceneJsonText, walkContainers } from './_pkg-index.mjs'

const ARGV = process.argv.slice(2)
const MUTATION = !ARGV.includes('--no-mutation')
const QUICK = ARGV.includes('--quick')
const VERBOSE = ARGV.includes('--verbose')
for (const a of ARGV) if (!['--no-mutation', '--quick', '--verbose'].includes(a)) {
  console.error('未知参数：' + a + '\n用法：node tests/scene-script-api-gaps-test.mjs [--no-mutation] [--quick] [--verbose]')
  process.exit(2)
}

const SAVED_LOG = console.log
const out = (...a) => { try { SAVED_LOG(...a) } catch { /* ignore */ } }
let pass = 0, fail = 0, skip = 0
const note = (name, detail) => { out('  · ' + name + (detail ? '  [' + detail + ']' : '')) }
const ok = (name, cond, detail) => {
  if (cond) { pass++; out('  ✓ ' + name + (detail ? '  [' + detail + ']' : '')) }
  else { fail++; out('  ✗ ' + name + (detail ? '  — ' + detail : '')) }
}
const skipItem = (name, reason) => { skip++; out('  SKIP scene-script-api-gaps ' + name + ' — ' + reason) }

// ═══════════════════════════ 0. 被测沙箱 ═══════════════════════════
const MODULE = process.env.MPW_SCENE_SCRIPTS
  ? path.resolve(process.env.MPW_SCENE_SCRIPTS)
  : path.join(ROOT, 'elysia', 'scene-scripts.js')
const IS_MUTANT_RUN = !!process.env.MPW_SCENE_SCRIPTS
let applySceneScripts, createScriptCache, sceneScriptApiDiag, resetSceneScriptApiDiag
try {
  const mod = await import(pathToFileURL(MODULE).href)
  applySceneScripts = mod.applySceneScripts
  createScriptCache = mod.createScriptCache
  sceneScriptApiDiag = mod.sceneScriptApiDiag
  resetSceneScriptApiDiag = mod.resetSceneScriptApiDiag
} catch (e) {
  out('  沙箱实现加载失败：' + path.relative(ROOT, MODULE) + ' — ' + (e && e.message))
  process.exit(1)
}
out('scene-script-api-gaps-test —— P-141：8 类 SceneScript API 缺口（getAnimation / getParticleSystem /'
  + ' getLayerIndex / isPlaying / createLayer / audioLayer.stop / setInterval / toFixed 级联）'
  + '（沙箱实现=' + path.relative(ROOT, MODULE) + (IS_MUTANT_RUN ? '（变异体）' : '') + '）')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'p141-api-gaps-'))
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }) } catch { /* ignore */ } })

const CORPUS_ROOT = process.env.MPW_ROOT || WS
const ALLWALLPAPER = path.join(CORPUS_ROOT, 'allwallpaper')

// ═══════════════════════════ 1. 通用宿主工具 ═══════════════════════════
// 作者脚本会 console.log（跑过缺口之后才走到那一行）⇒ 跑真包时静音宿主 console.log，
// 免得把作者日志混进门禁输出（demo.html 只把 console.warn/error 桥到 #log）。
function withMutedLog(fn) {
  const saved = console.log
  console.log = () => {}
  try { return fn() } finally { console.log = saved }
}
function collectNodes(root, out2 = [], p = '') {
  if (Array.isArray(root)) { root.forEach((v, i) => collectNodes(v, out2, p + '[' + i + ']')); return out2 }
  if (!root || typeof root !== 'object') return out2
  if ('script' in root && 'value' in root && typeof root.script === 'string') { out2.push({ node: root, path: p }); return out2 }
  for (const k of Object.keys(root)) collectNodes(root[k], out2, p ? p + '.' + k : k)
  return out2
}
/** 跑 ticks 次 `applySceneScripts`；`clock` 决定每帧的场景时钟（默认 0,1,2,…）。 */
function runTicks(scene, ticks, extra = {}, clock = null) {
  const cache = createScriptCache()
  const byStage = { init: 0, update: 0, applyUserProperties: 0, other: 0 }
  const msgs = []
  const frames = []
  withMutedLog(() => {
    for (let t = 0; t < ticks; t++) {
      const time = clock ? clock(t) : t
      applySceneScripts(scene, time, Object.assign({
        scriptCache: cache,
        canvasSize: { x: 1920, y: 1080 },
        frametime: 1 / 60,
        onError: (stage, e) => { byStage[stage] = (byStage[stage] || 0) + 1; msgs.push(stage + ':' + ((e && e.message) || e)) },
      }, extra))
      frames.push(time)
    }
  })
  return { byStage, msgs, total: msgs.length, frames, shared: cache.shared }
}
/**
 * 一段作者脚本放进真宿主跑一趟。`exports` 里的函数可在跑完后从宿主侧调用（读脚本内部状态）。
 * `extraObjects` 追加在探针节点**之后**（objects[1..]），于是探针永远是 objects[0]、owner 就是它自己
 * —— `thisScene.getLayerIndex(thisLayer)` 的期望值因此固定为 0。
 * 返回 { value, msgs, total, node, exportsOf }。
 */
function runProbe(script, nodeExtra = {}, ticks = 1, extraObjects = null, opts = {}) {
  const node = Object.assign({ id: 1, name: 'p141-probe', script, value: '0 0 0' }, nodeExtra)
  const scene = { general: {}, objects: extraObjects ? [node, ...extraObjects] : [node] }
  const r = runTicks(scene, ticks, opts.extra || {}, opts.clock || null)
  return { value: node.value, msgs: r.msgs, total: r.total, node, r, scene }
}
const want = (x, y, z) => `${Number(x).toFixed(6)} ${Number(y).toFixed(6)} ${Number(z).toFixed(6)}`

// ═══════════════════════════ 2. S0 基线 ═══════════════════════════
out('\nS0 基线')
ok('S0a 沙箱模块可加载（applySceneScripts / createScriptCache / sceneScriptApiDiag / resetSceneScriptApiDiag）',
  typeof applySceneScripts === 'function' && typeof createScriptCache === 'function'
  && typeof sceneScriptApiDiag === 'function' && typeof resetSceneScriptApiDiag === 'function',
  path.relative(ROOT, MODULE))

// ═══════════════════════════ 3. S1 存在性与签名 ═══════════════════════════
out('\nS1 8 个 API 的存在性 / 签名 / readonly 语义（真沙箱里跑作者风格脚本再读回）')
resetSceneScriptApiDiag()
{
  // S1a `thisLayer.getAnimation(name?)` → IAnimation（d.ts L494-499 / L1568-1623）
  const src = `'use strict';
export function update(value) {
  const a = thisLayer.getAnimation('probe');
  value.x = (a && typeof a === 'object') ? 1 : 0;
  value.y = (typeof a.play === 'function' && typeof a.pause === 'function' && typeof a.stop === 'function'
    && typeof a.isPlaying === 'function' && typeof a.getFrame === 'function' && typeof a.setFrame === 'function') ? 1 : 0;
  value.z = 0;
  return value;
}`
  const r = runProbe(src)
  ok('S1a thisLayer.getAnimation(name) 存在且返回带官方 IAnimation 方法面的真值对象',
    r.total === 0 && r.value === want(1, 1, 0),
    'value=' + JSON.stringify(r.value) + (r.total ? ' 错=' + r.msgs[0] : ''))
}
{
  // S1b 官方 readonly 四字段：赋值**不抛错**、值**也不变**（'use strict' 下只写 getter 会抛 TypeError）
  const src = `'use strict';
export function update(value) {
  const a = thisLayer.getAnimation('probe');
  const f0 = a.fps, c0 = a.frameCount, d0 = a.duration, n0 = a.name;
  a.fps = 12345; a.frameCount = 999; a.duration = 7.5; a.name = 'changed';
  value.x = (a.fps === f0 && a.frameCount === c0 && a.duration === d0 && a.name === n0) ? 1 : 0;
  value.y = (typeof f0 === 'number' && typeof c0 === 'number' && typeof d0 === 'number'
    && typeof n0 === 'string' && n0 === 'probe') ? 1 : 0;
  value.z = 0;
  return value;
}`
  const r = runProbe(src)
  ok('S1b IAnimation 的 readonly（fps/frameCount/duration/name）赋值不抛错且值不变',
    r.total === 0 && r.value === want(1, 1, 0),
    'value=' + JSON.stringify(r.value) + (r.total ? ' 错=' + r.msgs[0] : ''))
}
{
  // S1c `thisLayer.getParticleSystem()` → IParticleSystem + instance 字段；`.rate` 写穿 instanceoverride
  const src = `'use strict';
export function update(value) {
  const ps = thisLayer.getParticleSystem();
  value.x = (ps && typeof ps.play === 'function' && typeof ps.pause === 'function' && typeof ps.stop === 'function'
    && typeof ps.isPlaying === 'function' && typeof ps.emitParticles === 'function') ? 1 : 0;
  const inst = ps.instance;
  const keys = ['alpha','size','count','speed','lifetime','rate','colorn',
    'controlpoint0','controlpoint1','controlpoint2','controlpoint3',
    'controlpoint4','controlpoint5','controlpoint6','controlpoint7'];
  value.y = (inst && typeof inst === 'object' && keys.every((k) => k in inst)) ? 1 : 0;
  ps.rate = 2.5;
  value.z = (ps.rate === 2.5 && inst.rate === 2.5) ? 1 : 0;
  return value;
}`
  const probe = { id: 1, name: 'p141-probe', script: src, value: '0 0 0', particle: 'particles/p141.json', instanceoverride: { rate: 1, count: 3 } }
  const r = runProbe(src, { particle: probe.particle, instanceoverride: probe.instanceoverride })
  const io = probe.instanceoverride
  ok('S1c thisLayer.getParticleSystem() 返回 IParticleSystem 面（play/pause/stop/isPlaying/emitParticles/instance）',
    r.total === 0 && String(r.value).startsWith(want(1, 1, 0).slice(0, 10)),
    'value=' + JSON.stringify(r.value) + (r.total ? ' 错=' + r.msgs[0] : ''))
  ok('S1c2 `.rate` 写穿到 obj.instanceoverride.rate（渲染器真正解析的那份：core resolveParticleOverride）',
    r.total === 0 && r.value === want(1, 1, 1) && io.rate === 2.5,
    'instanceoverride.rate=' + JSON.stringify(io.rate) + ' value=' + JSON.stringify(r.value))
}
{
  // S1d `isPlaying` 是**方法**（d.ts L744-748），play/pause/stop 状态机自洽
  const src = `'use strict';
export function update(value) {
  const t0 = typeof thisLayer.isPlaying;
  const p0 = thisLayer.isPlaying();
  thisLayer.play();
  const p1 = thisLayer.isPlaying();
  thisLayer.pause();
  const p2 = thisLayer.isPlaying();
  thisLayer.play();
  thisLayer.stop();
  const p3 = thisLayer.isPlaying();
  value.x = (t0 === 'function') ? 1 : 0;
  value.y = (p0 === false && p1 === true && p2 === false && p3 === false) ? 1 : 0;
  value.z = (typeof thisLayer.play === 'function' && typeof thisLayer.pause === 'function'
    && typeof thisLayer.stop === 'function' && typeof thisLayer.emitParticles === 'function') ? 1 : 0;
  return value;
}`
  const r = runProbe(src, {}, 2)
  ok('S1d thisLayer.isPlaying 是**方法**（官方 ISoundLayer.isPlaying(): Boolean）且 play/pause/stop 状态机自洽',
    r.total === 0 && r.value === want(1, 1, 1),
    'value=' + JSON.stringify(r.value) + (r.total ? ' 错=' + r.msgs[0] : ''))
}
{
  // S1e `thisScene.getLayerIndex(layer | name)`：官方 ILayer / String；解析不到返回 -1 而不是抛错
  const src = `'use strict';
export function update(value) {
  value.x = thisScene.getLayerIndex(thisLayer);      // owner = objects[0]
  value.y = thisScene.getLayerIndex('holder');       // objects[1]
  value.z = thisScene.getLayerIndex('does-not-exist');
  return value;
}`
  const holder = { id: 2, name: 'holder', origin: '0 0 0' }
  const r = runProbe(src, {}, 1, [holder])
  ok('S1e thisScene.getLayerIndex(thisLayer|name|不存在) → 0 / 1 / -1（不抛错）',
    r.total === 0 && r.value === want(0, 1, -1),
    'value=' + JSON.stringify(r.value) + (r.total ? ' 错=' + r.msgs[0] : ''))
}
{
  // S1f `thisScene.createLayer(configuration)` 三种形态 + 属性写穿 + enumerateLayers 可见
  const src = `'use strict';
let A = null, B = null, C = null;
export function init() {
  A = thisScene.createLayer({ image: 'models/x.json', origin: new Vec3(11, 22, 33), alpha: 0.5, visible: false });
  B = thisScene.createLayer('models/bar.json');
  C = thisScene.createLayer(engine.registerAsset('particles/p141.json'));
  A.scale = new Vec3(2, 2, 1);
  A.origin = new Vec3(7, 8, 9);
  A.visible = true;
  return 1;
}
export function update(value) {
  value.x = (A && typeof A.getAnimation === 'function' && typeof A.getTextureAnimation === 'function'
    && typeof A.getTransformMatrix === 'function' && typeof A.getParent === 'function') ? 1 : 0;
  value.y = thisScene.enumerateLayers().length;      // 2 个原始层 + 3 个新建层
  value.z = (A.origin.x === 7 && A.scale.x === 2 && A.visible === true) ? 1 : 0;
  return value;
}`
  const holder = { id: 2, name: 'holder', origin: '0 0 0' }
  const r = runProbe(src, {}, 2, [holder])
  const names = r.scene.objects.map((o) => o && o.name)
  const created = r.scene.objects.filter((o) => o && o.__dynamic)
  ok('S1f thisScene.createLayer(对象 | 字符串 | IAssetHandle) 返回可用 ILayer（与 getLayer 同一套面）',
    r.total === 0 && r.value === want(1, 5, 1),
    'value=' + JSON.stringify(r.value) + ' 新建=' + JSON.stringify(created.map((o) => ({ i: o.image || o.particle, o: o.origin })))
    + (r.total ? ' 错=' + r.msgs[0] : ''))
  note('S1f 层表', JSON.stringify(names))
}
{
  // S1g `thisScene.sortLayer(layer, index): Boolean`：真的改顺序（洛茜 createLayer 后紧接着调它）
  // ⚠ 首帧的 **init 趟在 init() 之后还会跑一次 update()**（`runScriptValueCached` 的既有语义，
  //   P-137 的 S1/S2 就是按这个算窗口的）⇒ "排序前"的下标必须在**第一次** update 里记下来，
  //   否则第二次 update 看到的是已经排好序的结果（实测：不记就是 0/0，看起来像 sortLayer 没生效）。
  const src = `'use strict';
let L = null, before = -1, recorded = false;
export function init() {
  L = thisScene.createLayer({ image: 'models/y.json' });
  return 1;
}
export function update(value) {
  if (!recorded) { before = thisScene.getLayerIndex(L); recorded = true; }
  const ret = thisScene.sortLayer(L, 0);
  value.x = (typeof ret === 'boolean' && ret === true) ? 1 : 0;
  value.y = before;
  value.z = thisScene.getLayerIndex(L);
  return value;
}`
  const holder = { id: 2, name: 'holder', origin: '0 0 0' }
  const r = runProbe(src, {}, 1, [holder])
  ok('S1g thisScene.sortLayer(layer, index) 返回 true 且真的把层搬到目标下标',
    r.total === 0 && r.value === want(1, 2, 0),
    'value=' + JSON.stringify(r.value) + (r.total ? ' 错=' + r.msgs[0] : ''))
}
{
  // S1h `engine.setInterval` 是函数且返回 stop 函数；`engine.clearInterval` 是函数（官方 d.ts 只声明前者）
  const src = `'use strict';
export function update(value) {
  const stop = engine.setInterval(() => {}, 500);
  value.x = (typeof engine.setInterval === 'function') ? 1 : 0;
  value.y = (typeof stop === 'function') ? 1 : 0;
  value.z = (typeof engine.clearInterval === 'function') ? 1 : 0;
  stop();
  return value;
}`
  const r = runProbe(src)
  ok('S1h engine.setInterval 返回可调用的 stop 函数、engine.clearInterval 存在',
    r.total === 0 && r.value === want(1, 1, 1),
    'value=' + JSON.stringify(r.value) + (r.total ? ' 错=' + r.msgs[0] : ''))
}
{
  // S1i `thisScene.getLayer(name)` 的层带 ISoundLayer 面（语料 0917/3600630828 的 audioLayer.stop()）
  const src = `'use strict';
export function init() {
  const audioLayer = thisScene.getLayer('bloom');
  if (!audioLayer) return 1;
  audioLayer.stop();
  audioLayer.play();
  audioLayer.pause();
  audioLayer.stop();
  return 1;
}
export function update(value) {
  const audioLayer = thisScene.getLayer('bloom');
  value.x = (audioLayer && typeof audioLayer.stop === 'function' && typeof audioLayer.play === 'function'
    && typeof audioLayer.pause === 'function' && typeof audioLayer.isPlaying === 'function') ? 1 : 0;
  value.y = (typeof audioLayer.isPlaying() === 'boolean') ? 1 : 0;
  value.z = (typeof thisScene.getLayer('nope').stop === 'function') ? 1 : 0;   // 缺层引用也要有这套面
  return value;
}`
  const bloom = { id: 2, name: 'bloom', origin: '0 0 0', sound: ['sounds/x.mp3'] }
  const r = runProbe(src, {}, 2, [bloom])
  ok('S1i thisScene.getLayer(name) 返回的层有 ISoundLayer 面（stop/play/pause/isPlaying，含"层不存在"的空引用）',
    r.total === 0 && r.value === want(1, 1, 1),
    'value=' + JSON.stringify(r.value) + (r.total ? ' 错=' + r.msgs[0] : ''))
}
{
  // S1j P-137 的 size 回归面（本批不得改坏）；同时确认读数走的是同一条 parseV 口径
  const src = `'use strict';
export function update(value) {
  const s = thisLayer.size;
  thisLayer.size = new Vec3(1, 2, 3);
  const s2 = thisLayer.size;
  value.x = s.x + s.y + s.z; value.y = s2.x; value.z = 0;
  return value;
}`
  const r = runProbe(src, { size: '1206.00000 512.00000' })
  ok('S1j 回归面：P-137 的 thisLayer.size 仍可读（1206/512/0）且赋值不抛错、值不变',
    r.total === 0 && r.value === want(1718, 1206, 0), JSON.stringify(r.value) + (r.total ? ' 错=' + r.msgs[0] : ''))
}
{
  // ①(P-141) "不得静默"：上面这些调用必须落在计数表里（否则 no-op 与"静默丢弃"无法区分）
  const d = sceneScriptApiDiag()
  const hot = ['getAnimation', 'getParticleSystem', 'getLayerIndex', 'createLayer', 'sortLayer', 'play', 'stop', 'isPlaying', 'timerScheduled']
  const zero = hot.filter((k) => !(d[k] > 0))
  ok('S1k 每一次缺口调用都折进 SCENE_SCRIPT_API_DIAG（可观测、不静默）', zero.length === 0,
    zero.length ? ('未计数：' + JSON.stringify(zero)) : hot.map((k) => k + '=' + d[k]).join(' '))
}

// ═══════════════════════════ 4. S2 setInterval 真的按 ms 触发 ═══════════════════════════
out('\nS2 engine.setInterval 按 ms 触发（场景时钟驱动，不是"排了就算"）')
{
  const src = `'use strict';
let stop = null;
export function init() { stop = engine.setInterval(() => { shared.__ticks = (shared.__ticks || 0) + 1; }, 500); return 1; }
export function update() { return shared.__ticks || 0; }
export function halt() { if (stop) stop(); }
`
  const probe = { id: 1, name: 'p141-probe', script: src, value: 0 }
  const scene = { general: {}, objects: [probe] }
  const cache = createScriptCache()
  const at = []
  const CLOCK = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4]
  withMutedLog(() => {
    for (const t of CLOCK) {
      applySceneScripts(scene, t, { scriptCache: cache, canvasSize: { x: 1920, y: 1080 }, frametime: 1 / 60, onError: () => {} })
      at.push({ t, n: probe.value })
    }
  })
  const before500 = at.filter((x) => x.t < 0.5).map((x) => x.n)
  const at1000 = (at.find((x) => x.t === 1.0) || {}).n
  ok('S2a 500ms 之前回调 0 次、≥500ms 之后回调 ≥1 次（按场景时钟 ms 计时）',
    before500.every((n) => n === 0) && at1000 >= 1,
    '逐帧 n=' + JSON.stringify(at.map((x) => x.t + 's:' + x.n)))
  // clearInterval / 返回的 stop 函数都能停
  const entry = [...cache.map.values()][0]
  const stops = entry && entry.exports && typeof entry.exports.halt === 'function' ? entry.exports.halt : null
  let after = null
  withMutedLog(() => {
    if (stops) stops()
    applySceneScripts(scene, 3.0, { scriptCache: cache, canvasSize: { x: 1920, y: 1080 }, frametime: 1 / 60, onError: () => {} })
    applySceneScripts(scene, 5.0, { scriptCache: cache, canvasSize: { x: 1920, y: 1080 }, frametime: 1 / 60, onError: () => {} })
    after = probe.value
  })
  ok('S2b 停止之后（stop() / clearInterval）不再有新回调', after === at[at.length - 1].n,
    '停止前 n=' + at[at.length - 1].n + ' ⇒ 3s/5s 之后 n=' + after)
}

// ═══════════════════════════ 5. S3 真包 N 帧 0 错 ═══════════════════════════
out('\nS3 8 个真包整包跑 N 帧 ⇒ scriptErrs 为空')
// 缺口 → 包 → 该包里的锚点（证明"定位到的确实是那个脚本节点"）
const PACKS = [
  { gap: 'thisLayer.getAnimation', rel: '0917/3448877775/scene.pkg', at: 'objects[12].alpha', line: 'thisLayer.getAnimation()' },
  { gap: 'thisLayer.getAnimation', rel: 'wallpaperE/other/夜莺night——【time_variation_时间变化】alone_孤独の少女【原画：rella].mpkg', at: 'objects[12].alpha', line: 'thisLayer.getAnimation()' },
  { gap: 'thisLayer.getAnimation', rel: 'wallpapertest1/夜莺night——【time_variation_时间变化】alone_孤独の少女【原画：rella].mpkg', at: 'objects[12].alpha', line: 'thisLayer.getAnimation()' },
  { gap: 'thisLayer.getParticleSystem', rel: '0917/3448877775/scene.pkg', at: 'objects[15].instanceoverride.alpha', line: 'thisLayer.getParticleSystem()' },
  { gap: 'thisLayer.getParticleSystem', rel: 'wallpaperE/other/夜莺night——【time_variation_时间变化】alone_孤独の少女【原画：rella].mpkg', at: 'objects[15].instanceoverride.alpha', line: 'thisLayer.getParticleSystem()' },
  { gap: 'thisScene.getLayerIndex', rel: 'wallpaperE/洛茜/洛茜_07.mpkg', at: 'objects[13].visible', line: 'thisScene.getLayerIndex(thisLayer)' },
  { gap: 'thisScene.getLayerIndex', rel: 'wallpaperE/洛茜/洛茜_11.mpkg', at: 'objects[21].visible', line: 'thisScene.getLayerIndex(thisLayer)' },
  { gap: 'thisLayer.isPlaying', rel: '0917/3351163962/scene.pkg', at: 'objects[134].volume', line: 'thisLayer.isPlaying()' },
  { gap: 'thisScene.createLayer', rel: '0917/3509243656/scene.pkg', at: 'objects[8].visible', line: 'thisScene.createLayer(' },
  { gap: 'update:toFixed（级联）', rel: '0917/3509243656/scene.pkg', at: 'objects[98].text', line: 'shared.xx1.toFixed(2)' },
  { gap: 'audioLayer.stop', rel: '0917/3600630828/scene.pkg', at: 'objects[8].visible', line: 'audioLayer.stop()' },
  { gap: 'engine.setInterval', rel: 'wallpaperE/洛茜/洛茜_07.mpkg', at: 'objects[8].alpha', line: 'engine.setInterval(' },
]
const FRAMES = QUICK ? 1 : 4
function nodeAtPath(sj, dotted) {
  const m = /^objects\[(\d+)\]$/.exec(dotted.split('.')[0])
  if (!m) return null
  let cur = sj && Array.isArray(sj.objects) ? sj.objects[Number(m[1])] : null
  for (const k of dotted.split('.').slice(1)) { if (cur == null) return null; cur = cur[k] }
  return cur && typeof cur === 'object' ? cur : null
}
function loadScene(rel) {
  const p = path.join(ALLWALLPAPER, rel)
  if (!fs.existsSync(p)) return null
  try { const t = readSceneJsonText(p); return t ? JSON.parse(t.replace(/^\uFEFF/, '')) : null } catch { return null }
}
const missing = []
for (const P of PACKS) {
  const sj = loadScene(P.rel)
  if (!sj) { missing.push(P.rel); continue }
  const label = P.rel.replace(/^.*\//, '').replace(/\.(m?pkg)$/i, '') + ' · ' + P.gap
  // 锚点自证：定位到的确实是"用了这个 API"的那个脚本节点（否则"0 错"毫无意义）
  const node = nodeAtPath(sj, P.at)
  const anchored = !!node && typeof node.script === 'string' && node.script.includes(P.line)
  const r = runTicks(sj, FRAMES)
  const tag = 'S3 ' + label
  ok(tag + ' 跑 ' + FRAMES + ' 帧 ⇒ scriptErrs 为空',
    anchored && r.total === 0,
    (anchored ? ('锚点「' + P.line + '」命中 · ') : ('**锚点未命中**（' + P.at + ' 里没有「' + P.line + '」）· '))
    + (r.total === 0 ? '0 错' : JSON.stringify([...new Set(r.msgs)].slice(0, 3))))
}
const missingPacks = [...new Set(missing)]
if (missingPacks.length) {
  // 真包是本机语料（不进仓库）⇒ 缺了必须 SKIP 而不是红（run-all-tests.sh 的硬约束）；
  // 逐条 SKIP（1 个包 1 条），并给出包名，避免"12 条缺 12 个"这种把重复计数当结论的说法。
  // 标签要用"父目录/文件名"（语料里有 4 个包都叫 scene.pkg ⇒ 只留文件名会出现同名 SKIP）
  for (const rel of missingPacks) skipItem('S3 真包 ' + rel.split('/').slice(-2).join('/'), path.join('$MPW_ROOT', 'allwallpaper', rel) + ' 不存在')
}
const HAVE_CORPUS = fs.existsSync(ALLWALLPAPER)

// ═══════════════════════════ 6. S4 全语料逐包第 1 帧 0 错 ═══════════════════════════
if (QUICK) skipItem('S4 全语料逐包扫描', '--quick（变异子进程）跳过')
else if (!HAVE_CORPUS) skipItem('S4 全语料逐包扫描', path.join('$MPW_ROOT', 'allwallpaper') + ' 不存在（属本机资产，不进仓库）')
else {
  out('\nS4 全语料逐包第 1 帧 0 错（$MPW_ROOT/allwallpaper）')
  const files = walkContainers(ALLWALLPAPER)
  let withScripts = 0, nodes = 0, errPacks = 0, checked = 0
  const bad = []
  const t0 = Date.now()
  for (const f of files) {
    let sj = null
    try { const t = readSceneJsonText(f); if (t) sj = JSON.parse(t.replace(/^\uFEFF/, '')) } catch { continue }
    if (!sj) continue
    const ns = collectNodes(sj).length
    if (!ns) continue
    withScripts++; nodes += ns
    const msgs = []
    withMutedLog(() => {
      try {
        applySceneScripts(sj, 0, { scriptCache: createScriptCache(), canvasSize: { x: 1920, y: 1080 }, frametime: 1 / 60, onError: (st, e) => msgs.push(st + ':' + ((e && e.message) || e)) })
      } catch (e) { msgs.push('host:' + e.message) }
    })
    checked++
    if (msgs.length) { errPacks++; bad.push(path.relative(ALLWALLPAPER, f) + ' :: ' + JSON.stringify([...new Set(msgs)].slice(0, 2))) }
  }
  const ms = Date.now() - t0
  note('扫描面：' + files.length + ' 个容器 / ' + withScripts + ' 个带 scripts 的包 / ' + nodes + ' 个脚本节点 · ' + ms + 'ms')
  ok('S4a 扫描非空（带 scripts 的包 ≥ 20，否则"0 个包抛错"是假绿）', withScripts >= 20, withScripts + ' 个包')
  ok('S4b 逐包检查数 = 带 scripts 的包数（计数一致性：没有包被静默跳过）', checked === withScripts,
    checked + ' 检查 / ' + withScripts + ' 带脚本')
  ok('S4c 有脚本错的包 = 0（8 类缺口修前 8 个包 ⇒ 修后 0 个）', errPacks === 0,
    errPacks === 0 ? ('0 / ' + withScripts + ' 个包有错') : (errPacks + ' 个包有错：' + JSON.stringify(bad.slice(0, 5))))
}

// ═══════════════════════════ 7. S5 红-if-reverted（变异自检）═══════════════════════════
if (IS_MUTANT_RUN) note('S5 变异体运行（MPW_SCENE_SCRIPTS 已设）⇒ 跳过自检，避免递归')
else if (!MUTATION) note('S5 红-if-reverted 自检被 --no-mutation 跳过（本次运行**未**复核变异必红）')
else {
  out('\nS5 红-if-reverted：分别摘掉 getAnimation / getParticleSystem / engine.setInterval ⇒ 各自必红')
  const copyTree = (fromDir, toDir, filter) => {
    fs.mkdirSync(toDir, { recursive: true })
    for (const name of fs.readdirSync(fromDir)) {
      const src = path.join(fromDir, name), dst = path.join(toDir, name)
      let st = null
      try { st = fs.statSync(src) } catch { st = null }
      if (!st) continue
      if (st.isDirectory()) { copyTree(src, dst, filter); continue }
      if (!st.isFile()) continue
      if (filter && !filter(src, name)) continue
      fs.writeFileSync(dst, fs.readFileSync(src))
    }
  }
  const tmpEly = path.join(TMP, 'elysia')
  copyTree(path.join(ROOT, 'elysia'), tmpEly, (src) => !src.includes(path.sep + 'vendor' + path.sep))
  const MUTANTS = [
    {
      id: 'M1', fix: 'thisLayer.getAnimation', expect: /✗ S1a /, baseline: /✓ S0a /,
      baselineName: 'S0a（副本可加载）',
      desc: '把 layerRef() 的 getAnimation 改名（= 该成员不存在，回到 init 抛 is not a function 的旧状态）',
      // 锚点必须带上一行注释：objectRef() 里也有一行同样的 `getAnimation: (name) => …cur()…`
      //   （thisObject 那一半，P-141 一并换成了 IAnimation 句柄）⇒ 只匹配那一行会命中 2 次。
      anchor: "      //   `objectRef().getAnimation` 早就有（同源）；这里补的是 thisLayer 那一半。\n"
        + "      getAnimation: (name) => { apiBump('getAnimation'); return makeAnimationRef(cur(), name) },\n",
      to: "      //   MUTANT：thisLayer.getAnimation 被摘掉（该成员不存在）\n"
        + "      __mutant_getAnimation: (name) => { apiBump('getAnimation'); return makeAnimationRef(cur(), name) },\n",
    },
    {
      id: 'M2', fix: 'thisLayer.getParticleSystem', expect: /✗ S1c /, baseline: /✓ S0a /,
      baselineName: 'S0a（副本可加载）',
      desc: '把 layerRef() 的 getParticleSystem 改名（= 该成员不存在）',
      anchor: "      getParticleSystem: () => { apiBump('getParticleSystem'); return particleRefFor(cur()) },\n",
      to: "      __mutant_getParticleSystem: () => { apiBump('getParticleSystem'); return particleRefFor(cur()) },\n",
    },
    {
      id: 'M3', fix: 'engine.setInterval', expect: /✗ S1h /, baseline: /✓ S0a /,
      baselineName: 'S0a（副本可加载）',
      desc: '把 engine.setInterval 改名（= 该函数不存在，回到 update 抛 is not a function 的旧状态）',
      anchor: '      setInterval: (callback, delay) => {\n',
      to: '      __mutant_setInterval: (callback, delay) => {\n',
    },
  ]
  // 对照组：**未变异**的副本必须全绿（证明红是被点名那条语义，不是"副本/环境本身跑不起来"）
  const pristine = path.join(tmpEly, 'scene-scripts.js')
  fs.writeFileSync(pristine, fs.readFileSync(MODULE))
  const runCopy = (extraArgs = []) => spawnSync(process.execPath, [process.argv[1], '--no-mutation', '--quick', ...extraArgs], {
    encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024,
    env: Object.assign({}, process.env, { MPW_SCENE_SCRIPTS: pristine }),
  })
  const rc = runCopy()
  const rcOut = String(rc.stdout || '') + String(rc.stderr || '')
  ok('S5-0 对照组：未变异的 /tmp 副本跑本文件全绿（rc=0）',
    rc.status === 0 && /ALL PASS/.test(rcOut),
    'rc=' + rc.status + ' ' + ((rcOut.match(/\(计票：[^)]*\)/) || [''])[0]))
  if (VERBOSE && rc.status !== 0) note('S5-0 副本输出尾部', JSON.stringify(rcOut.slice(-600)))

  const SRC = fs.readFileSync(MODULE, 'utf8')
  for (const m of MUTANTS) {
    const n = SRC.split(m.anchor).length - 1
    if (n !== 1) {
      skipItem('mutation-selfcheck ' + m.id, '锚点命中 ' + n + ' 次：' + JSON.stringify(m.anchor.slice(0, 60))
        + '（沙箱那几行已被改写 ⇒ 需重新标定；不做变异＝不算证据）')
      continue
    }
    fs.writeFileSync(pristine, SRC.split(m.anchor).join(m.to))
    const r = runCopy()
    const so = String(r.stdout || '') + String(r.stderr || '')
    const redLine = (so.match(m.expect) || [])[0] || (so.match(/✗ [^\n]*/) || [])[0] || ''
    ok('S5-' + m.id + '（' + m.fix + '）变异「' + m.desc + '」⇒ 子进程 rc=1 且点名断言变红',
      r.status === 1 && m.expect.test(so),
      'rc=' + r.status + ' 失败断言=' + JSON.stringify(redLine.slice(0, 150)))
    ok('S5-' + m.id + 'b 变异体里基线仍 ✓（' + m.baselineName + ' ⇒ 红是被点名那条，不是副本起不来）',
      m.baseline.test(so), '')
    if (r.status !== 1 && VERBOSE) note('S5-' + m.id + ' 子进程输出尾部', JSON.stringify(so.slice(-600)))
  }
  fs.writeFileSync(pristine, SRC)   // 还原副本（对照组已用完；保持目录"未变异"语义）
}

// ═══════════════════════════ 8. 汇总 ═══════════════════════════
const peak = (() => { try { const m = fs.readFileSync('/proc/self/status', 'utf8').match(/VmHWM:\s*(\d+)/); return m ? Math.round(+m[1] / 1024) + 'MB' : '?' } catch { return '?' } })()
out('\n(计票：pass=' + pass + ' fail=' + fail + ' skip=' + skip + '；PeakRSS=' + peak + ')')
if (fail) { out('\n' + fail + ' 项失败'); process.exit(1) }
out('\nALL PASS （' + pass + ' 项' + (skip ? '，另 SKIP ' + skip : '') + '）')
process.exit(0)
