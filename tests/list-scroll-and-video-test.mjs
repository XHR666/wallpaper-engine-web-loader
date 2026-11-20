// 侧栏选中壁纸不得把滚动条打回顶部；shell=0 不得藏掉视频和网页帧。
// 判据会红的情况：listScrollKeep 把正的滚动收成 0，或外壳样式重新只放行 canvas。
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './_root.mjs'
import { shellShimScript } from '../server/we-scene-demo-server.mjs'

const patch = fs.readFileSync(path.join(ROOT, 'demo', 'bench-patch.js'), 'utf8')
const demo = fs.readFileSync(path.join(ROOT, 'demo.html'), 'utf8')
let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  [' + detail + ']' : '')) }
}

const fnSrc = patch.slice(patch.indexOf('export function listScrollKeep'), patch.indexOf('export function pickerRestoreScroll')).replace(/^export /m, '')
const listScrollKeep = new Function(fnSrc + '\nreturn listScrollKeep')()
ok('A1 已滚动的列表重建后仍停在原处', listScrollKeep(480, 4000, 600) === 480, String(listScrollKeep(480, 4000, 600)))
ok('A2 列表变短时夹到最大滚动', listScrollKeep(900, 700, 600) === 100, String(listScrollKeep(900, 700, 600)))
ok('A3 本来就在顶上保持 0', listScrollKeep(0, 4000, 600) === 0)
ok('A4 非有限输入保持 0', listScrollKeep(NaN, 4000, 600) === 0 && listScrollKeep(-3, 4000, 600) === 0)

const bad = new Function(fnSrc.replace('return Math.min(prev, max)', 'return 0') + '\nreturn listScrollKeep')()
ok('M1 把保留改成恒 0 ⇒ A1 必红', bad(480, 4000, 600) !== 480)

ok('B1 选中壁纸的清空钩子接在 #list 上', patch.includes('installListScrollKeep(listEl)') && patch.includes("String(v) !== ''"))
const shim = shellShimScript()
ok('B2 外壳样式放行 video 和网页帧', /not\(video\)/.test(shim) && /not\(#mpw-web-frame-box\)/.test(shim) && /not\(canvas\)/.test(shim))
ok('B3 视频目录表按 files 数组取 mp4（对象上没有 find）', demo.includes('listed.files') && demo.includes('mpwYieldSceneCanvas'))
ok('B4 网页帧加载后记首帧并让出场景画布', demo.includes('__mpwFirstFrame = window.__mpwFirstFrame || 1') && demo.includes('mpwYieldSceneCanvas()'))

console.log(pass + ' pass / ' + fail + ' fail')
process.exit(fail ? 1 : 0)
