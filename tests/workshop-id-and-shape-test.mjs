// 资源管理器右键复制创意工坊 ID；shape:"quad" 尺寸为 0 时要补成投影尺寸，否则光束效果链进不去。
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './_root.mjs'
import { workshopIdFromItemId } from '../demo/bench-patch.js'
import { fillZeroLayerSize } from '../core/we-scene-bundle.js'

const patch = fs.readFileSync(path.join(ROOT, 'demo', 'bench-patch.js'), 'utf8')
const html = fs.readFileSync(path.join(ROOT, 'demo', 'index.html'), 'utf8')
let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  [' + detail + ']' : '')) }
}

ok('A1 纯数字工坊 ID 原样', workshopIdFromItemId('2887099508') === '2887099508')
ok('A2 带目录的 itemId 取最后一段', workshopIdFromItemId('0923/2887099508') === '2887099508')
ok('A3 反斜杠同样取最后一段', workshopIdFromItemId('dd\\3544152633') === '3544152633')
ok('A4 空串没有 ID', workshopIdFromItemId('') === '' && workshopIdFromItemId(null) === '')

ok('B1 右键菜单在删除前插入复制按钮', patch.includes('data-mpw-copy-id') && patch.includes("querySelector('.ctx-item.danger')") && patch.includes('installWorkshopIdCopy'))
ok('B2 复制的是右键那一行的 dataset.id，不是当前选中项', patch.includes("li.dataset.id") && patch.includes('workshopIdFromItemId'))

ok('C1 首屏标题与品牌是产品名', /<title>WEwebLoader<\/title>/.test(html) && /id="site-brand-name" class="brand-name">WEwebLoader</.test(html))
ok('C2 品牌节点不再挂 app.title（产物启动不会写回上游名）', !/data-i18n="app\.title"/.test(html))
ok('C3 语言切换不再先把标题写成词典里的上游名', !/function applyLang\(/.test(patch) || patch.slice(patch.indexOf('function applyLang('), patch.indexOf('function applyLang(') + 1200).indexOf('applyTitle(') < 0)

const quad = { shape: 'quad', solid: false, size: [0, 0] }
ok('D1 光束 quad 的 0 尺寸补成投影', fillZeroLayerSize(quad, 3840, 2160) === true && quad.size[0] === 3840 && quad.size[1] === 2160)
const solid = { solid: true, size: [0, 0] }
ok('D2 纯色层仍走同一条回退', fillZeroLayerSize(solid, 1920, 1080) === true && solid.size.join(',') === '1920,1080')
const plain = { solid: false, size: [0, 0] }
ok('D3 普通空层不补尺寸', fillZeroLayerSize(plain, 1920, 1080) === false && plain.size.join(',') === '0,0')
const sized = { shape: 'quad', size: [100, 40] }
ok('D4 已经有尺寸的 quad 不动', fillZeroLayerSize(sized, 1920, 1080) === false && sized.size.join(',') === '100,40')

const core = fs.readFileSync(path.join(ROOT, 'core', 'we-scene-bundle.js'), 'utf8')
ok('D5 渲染回退调用的是这个函数', core.includes('fillZeroLayerSize(layer, cam.projW, cam.projH)'))

console.log(pass + ' pass / ' + fail + ' fail')
process.exit(fail ? 1 : 0)
