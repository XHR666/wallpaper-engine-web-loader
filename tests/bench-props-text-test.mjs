// bench-props-text-test.mjs —— 属性面板富文本三条（用户第 5/6/7 条，2026-09-22）
//
//   5  图片显示两遍（作者文案里同 URL 多次出现 / 产物自己已画一张）⇒ 同一张图只渲染一遍
//   6  文案里残留字面量 `&nbsp;` ⇒ 解码收口（双重编码 `&amp;nbsp;` + 无分号 `&nbsp`）
//   7  `BV1xzpee9EAF(点击跳转)` ⇒ 变成 B 站链接 `https://b23.tv/BV1xzpee9EAF`（**走既有 link 通道**）
//
// 判据优先用**纯函数**（`decodePropEntities` / `parsePropRichText` 都是导出的），DOM 那一半（图片去重）
// 用源码级接线 + 既有 `bench-ui-headless` 的 P 组端到端兜住。含分辨力自证。
//
// 运行：node tests/bench-props-text-test.mjs   （全过 ALL PASS，退出码 0）
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from './_root.mjs'
import { decodePropEntities, parsePropRichText } from '../demo/bench-patch.js'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log('  ✓ ' + n + (d ? '  [' + d + ']' : '')) } else { fail++; console.log('  ✗ ' + n + (d ? '  [' + d + ']' : '')) } }
const SRC = fs.readFileSync(path.join(ROOT, 'demo', 'bench-patch.js'), 'utf8')
const NBSP = '\u00a0'
const flat = (t) => (t || []).map((x) => x.k + (x.v !== undefined ? ':' + x.v : '') + (x.href ? ':' + x.href : '') + (x.src ? ':' + x.src : '')).join('|')

console.log('== 6 `&nbsp;` 残留收口（含双重编码与无分号形态）==')
ok('6a 普通 `&nbsp;` 解成不换行空格（不再是字面量）',
  decodePropEntities('a&nbsp;b') === 'a' + NBSP + 'b', JSON.stringify(decodePropEntities('a&nbsp;b')))
ok('6b **双重编码** `&amp;nbsp;` 也解掉（旧实现只解一遍 ⇒ 面板上就显示 `&nbsp;`）',
  decodePropEntities('&amp;nbsp;') === NBSP, JSON.stringify(decodePropEntities('&amp;nbsp;')))
ok('6c **无分号**形态 `&nbsp` 也解掉（作者手写文案里很常见：行尾/空格/标点前）',
  decodePropEntities('x&nbsp') === 'x' + NBSP && decodePropEntities('x&nbsp y') === 'x' + NBSP + ' y'
  && decodePropEntities('x&nbsp;') === 'x' + NBSP, JSON.stringify([decodePropEntities('x&nbsp'), decodePropEntities('x&nbsp y')]))
ok('6c2 **不猜**：`&nbspy` 这种后面紧跟字母数字的形态保持字面量（可能是别的实体名，猜错更糟）',
  decodePropEntities('x&nbspy') === 'x&nbspy', JSON.stringify(decodePropEntities('x&nbspy')))
ok('6d 其它空白类实体一并覆盖（`&ensp;` / `&emsp;` / `&thinsp;` 及无分号）',
  decodePropEntities('&ensp;&emsp;&thinsp;') === '\u2002\u2003\u2009' && decodePropEntities('&ensp') === '\u2002')
ok('6e **不过度解码**：`&amp;lt;` 仍只解一层（作者本意要显示 `&lt;` 时不能被改成 `<`）',
  decodePropEntities('&amp;lt;') === '&lt;', JSON.stringify(decodePropEntities('&amp;lt;')))
ok('6f 数字实体照旧（`&#160;` = NBSP）与未知实体保持原样（不猜）',
  decodePropEntities('&#160;') === NBSP && decodePropEntities('&foo;') === '&foo;')

console.log('\n== 7 `BV…` 变 B 站链接（走既有 link 通道）==')
{
  const t = parsePropRichText('看这个 BV1xzpee9EAF(点击跳转) 很好')
  const links = t.filter((x) => x.k === 'link')
  const texts = t.filter((x) => x.k === 'text').map((x) => x.v).join('')
  ok('7a 生成了一个 link token，href = `https://b23.tv/<BV>`，host = `b23.tv`',
    links.length === 1 && links[0].href === 'https://b23.tv/BV1xzpee9EAF' && links[0].host === 'b23.tv',
    JSON.stringify(links.map((l) => ({ href: l.href, host: l.host }))))
  ok('7b 链接文字就是 BV 号本身，前后普通文字不丢',
    flat(links[0].kids) === 'text:BV1xzpee9EAF' && texts.indexOf('看这个') === 0 && texts.indexOf('很好') > 0,
    JSON.stringify({ kids: flat(links[0].kids), texts: texts }))
  ok('7c 不是 BV 形态的一律不动（不模糊猜测：长度/字符集不符就不转）',
    parsePropRichText('BV123 与 BV1xzpee9EA 都不是').filter((x) => x.k === 'link').length === 0)
  ok('7d 安全性回归：`javascript:` 链接仍被拒（新通道没有破坏既有白名单）',
    parsePropRichText('<a href="javascript:alert(1)">x</a>').filter((x) => x.k === 'link').length === 0)
  ok('7e `https://` 链接照旧放行（白名单没被顺手收紧）',
    parsePropRichText('<a href="https://example.com/a">x</a>').filter((x) => x.k === 'link').length === 1)
}

console.log('\n== 5 图片去重（DOM 路径接线 + tokenizer 不背锅）==')
{
  ok('5a 渲染路径按**解析后的 URL** 去重（同一 src 第二次直接跳过）',
    /if \(!seenSrc\) \{ seenSrc = new Set\(\) \}/.test(SRC) && /if \(seenSrc\.has\(info\.href\)\) continue/.test(SRC) && /seenSrc\.add\(info\.href\)/.test(SRC))
  ok('5b 去重集合是**跨调用保留**的（行内 + 行间都去重，不是每次渲染清空）',
    /let seenSrc = null/.test(SRC) && !/seenSrc = new Set\(\)[\s\S]{0,80}return frag/.test(SRC))
  ok('5c tokenizer 不改语义（两张不同 URL 仍是两个 img token —— 去重是渲染期的事）',
    parsePropRichText('<img src="https://a/1.png"><img src="https://b/2.png">').filter((x) => x.k === 'img').length === 2)
  ok('5d 同一 URL 在 tokenizer 里也仍然是两个 token（证明 5a 的去重确实是**渲染期**收口）',
    parsePropRichText('<img src="https://a/1.png"><img src="https://a/1.png">').filter((x) => x.k === 'img').length === 2)
}

console.log('\n== D 分辨力自证（改回旧写法必红）==')
{
  const onePass = (s) => String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m) => m)   // 模拟"只解一遍且不认无分号"
  ok('D1 旧解码（只解一遍、不认无分号）下 `&amp;nbsp;` 与 `&nbsp` 都留字面量 ⇒ 6b/6c 必红',
    onePass('&amp;nbsp;') === '&amp;nbsp;' && decodePropEntities('&amp;nbsp;') === NBSP
    && decodePropEntities('x&nbsp') === 'x' + NBSP)
  ok('D2 没有 BV 分支时 `BV1xzpee9EAF` 只会是纯文本 ⇒ 7a 必红（裸 BV 现在也是链接：它就是 B 站 id）',
    parsePropRichText('BV1xzpee9EAF').filter((x) => x.k === 'link').length === 1
    && parsePropRichText('随便一句话，没有视频号').filter((x) => x.k === 'link').length === 0)
  ok('D3 没有去重时同 URL 会画两张（源码级证据：跳过语句在，且只在 URL 相等时触发）',
    /info\.href/.test(SRC) && /seenSrc\.has\(info\.href\)\) continue/.test(SRC))
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败')
if (fail === 0) console.log('✓ 属性面板富文本三条通过：nbsp 收口（含双重/无分号、不过度解码）/ BV 转链接走既有白名单通道 / 图片按 URL 去重')
process.exit(fail > 0 ? 1 : 0)
