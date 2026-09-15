// internal-shader-validate.mjs — 校验**我们引擎内置**的 shader 常量（glsl-validate 只覆盖效果链转译产物）
// 用法: node internal-shader-validate.mjs
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
// ①(去个人化 2026-09-16) 工作区根：环境变量优先；下面的默认值只是作者本机路径，发布副本请设 MPW_ROOT。
const MPW_WS = process.env.MPW_ROOT || '/root/Desktop/DSHarea'

const src = fs.readFileSync(`${MPW_WS}/we-scene-demo/we-scene-bundle.js`, 'utf8')
// 任意 `const NAME = \`#version 300 es ...\`` 形式都收集（避免命名后缀漏检）
const re = /const\s+([A-Z][A-Z0-9_]*)\s*=\s*`(#version 300 es[\s\S]*?)`/g
let m, n = 0, bad = 0
const tmp = '/tmp/mpw-shader.glsl'
while ((m = re.exec(src))) {
  const name = m[1], body = m[2]
  const stage = /(VS|VERT)$/.test(name) ? 'vert' : 'frag'
  fs.writeFileSync(tmp, body)
  n++
  try {
    execFileSync('glslangValidator', ['-S', stage, tmp], { stdio: 'pipe' })
    console.log(`✓ ${name} (${stage})`)
  } catch (e) {
    bad++
    const out = String(e.stdout || e.message || '').slice(0, 700)
    console.error(`✗ ${name} (${stage})\n${out}`)
  }
}
console.log(`\n内置 shader 编译：${n - bad}/${n} 通过` + (bad ? ' ✗' : ' ✓'))
process.exit(bad ? 1 : 0)
