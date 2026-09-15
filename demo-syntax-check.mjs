// demo-syntax-check.mjs — 提取 demo.html 的全部内联 <script> 做语法检查
// 为什么需要：demo.html 是单文件 4000+ 行，内联脚本语法错误在浏览器里只表现为"整页白屏"，
// 而它不在任何 Node 测试的覆盖范围内（run-all-tests.sh 里只有 bundle 的 node --check）。
// 用法: node demo-syntax-check.mjs [demo.html]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const file = process.argv[2] || 'demo.html'
const src = fs.readFileSync(file, 'utf8')
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
let m, i = 0, fail = 0
const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-syn-'))
while ((m = re.exec(src))) {
  const attrs = m[1] || ''
  const body = m[2] || ''
  if (/\bsrc\s*=/.test(attrs)) continue                 // 外链脚本不查
  if (!body.trim()) continue
  i++
  const isModule = /type\s*=\s*["']module["']/.test(attrs)
  const line = src.slice(0, m.index).split('\n').length
  const f = path.join(tmpdir, `blk${i}.${isModule ? 'mjs' : 'js'}`)
  fs.writeFileSync(f, body)
  try {
    execFileSync('node', ['--check', f], { stdio: 'pipe' })
    console.log(`  ✓ 内联脚本 #${i}（${isModule ? 'module' : 'classic'}，起始行 ${line}，${body.split('\n').length} 行）`)
  } catch (e) {
    fail++
    const out = String((e.stderr || e.stdout || '') || e.message).split('\n').slice(0, 6).join('\n     ')
    console.error(`  ✗ 内联脚本 #${i}（起始行 ${line}）语法错误:\n     ${out}`)
  }
}
try { fs.rmSync(tmpdir, { recursive: true, force: true }) } catch {}
if (!i) { console.error('✗ 未找到内联脚本'); process.exit(1) }
console.log(`demo 内联脚本语法：${i - fail}/${i} 通过`)
if (fail) process.exit(1)
