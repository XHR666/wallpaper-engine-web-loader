// 全 dd 场景：按渲染器真实效果链路径转译 shader，并用 glslangValidator 做 GLSL ES 300 真编译
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
// ①(去个人化 2026-09-16) 工作区根：环境变量优先；下面的默认值只是作者本机路径，发布副本请设 MPW_ROOT。
const MPW_WS = process.env.MPW_ROOT || '/root/Desktop/DSHarea'

const BUNDLE = `${MPW_WS}/we-scene-demo/we-scene-bundle.js`
const SCENE_ROOT = `${MPW_WS}/allwallpaper/dd`
const lib = await import(pathToFileURL(BUNDLE).href)
const { parsePkg, getEntry, parseScene, resolveEffectChain, hlsl2glsl } = lib

const commonH = fs.readFileSync(`${MPW_WS}/we-scene-demo/common.h`, 'utf8')
const blendH = fs.readFileSync(`${MPW_WS}/we-scene-demo/common_blending.h`, 'utf8')
const DEMO = `${MPW_WS}/we-scene-demo`
const resolver = (name) => {
  const n = name.replace(/^["']|["']$/g, '')
  const local = (f) => fs.existsSync(path.join(DEMO, f)) ? fs.readFileSync(path.join(DEMO, f), 'utf8') : null
  if (n === 'common.h' || n.endsWith('/common.h')) return commonH
  if (n === 'common_blending.h') return blendH
  if (n === 'common_blur.h') return local('common_blur.h')
  if (n === 'common_perspective.h') return local('common_perspective.h')
  if (n === 'common_composite.h') return local('common_composite.h')
  return null
}
const rd = (b) => new TextDecoder().decode(b).replace(/^\uFEFF/, '')

const jobs = [] // {scene, shader, stage, combos, glsl}
const seen = new Set()
const missingShaders = new Set()
const dirs = fs.readdirSync(SCENE_ROOT).filter((d) => /^\d+$/.test(d)).sort()

for (const d of dirs) {
  const p = path.join(SCENE_ROOT, d, 'scene.pkg')
  if (!fs.existsSync(p)) continue
  let pkg
  try { pkg = parsePkg(new Uint8Array(fs.readFileSync(p))) } catch { continue }
  const sceneJson = JSON.parse(rd(getEntry(pkg, pkg.entries.find((x) => x.name === 'scene.json').name)))
  const scene = parseScene(sceneJson, null)
  for (const layer of scene.layers) {
    // 镜像渲染器：跳过不可见/粒子/容器层（其 shader 永不被编译）
    if (!layer.visible || layer.particle || layer.isContainer) continue
    for (const eff of layer.effects || []) {
      if (!eff.visible) continue
      resolveEffectChain(pkg, eff, rd)
      const passes = eff.materialPasses || []
      for (let pi = 0; pi < passes.length; pi++) {
        const mp = passes[pi]
        if (!mp.shader || mp.copyCommand) continue
        const ov = (eff.passes && eff.passes[pi]) || {}
        const combos = { ...(mp.combos || {}), ...(ov.combos || {}) }
        for (const stage of ['vert', 'frag']) {
          const full = 'shaders/' + mp.shader + '.' + stage
          const srcE = getEntry(pkg, full)
          if (srcE === null) {
            missingShaders.add(`${d} ${full}`)
            continue
          }
          const key = full + '|' + JSON.stringify(combos) + '|' + stage
          if (seen.has(key)) continue
          seen.add(key)
          const src = rd(srcE)
          try {
            const glsl = hlsl2glsl(src, stage, combos, resolver)
            jobs.push({ scene: d, shader: mp.shader, stage, combos, glsl })
          } catch (e) {
            console.log(`[TRANSPILE-FAIL] ${d} ${full} combos=${JSON.stringify(combos)}: ${e.message}`)
          }
        }
      }
    }
  }
}

console.log(`共 ${jobs.length} 个 (shader, combos, stage) 待真编译`)
if (missingShaders.size) {
  console.log(`⚠ 场景引用了 pkg 内不存在的 shader（demo 中会编译空源→跳过）: ${missingShaders.size} 个`)
  for (const m of [...missingShaders].slice(0, 20)) console.log('   ', m)
}

const fails = []
const tmp = '/tmp/glsl-check'
fs.mkdirSync(tmp, { recursive: true })
let n = 0
for (const j of jobs) {
  const fn = path.join(tmp, `s${String(++n).padStart(4, '0')}.${j.stage}`)
  fs.writeFileSync(fn, j.glsl)
  try {
    execFileSync('glslangValidator', ['-S', j.stage === 'vert' ? 'vert' : 'frag', fn], { stdio: 'pipe' })
  } catch (e) {
    const stderr = (e.stderr && e.stderr.length ? Buffer.from(e.stderr).toString() : '').trim()
    const stdout = (e.stdout && e.stdout.length ? Buffer.from(e.stdout).toString() : '').trim()
    const err = stderr || stdout || ('EXIT ' + e.status + ' ' + (e.message || ''))
    const firstLines = err.split('\n').filter((l) => l.trim()).slice(0, 8).join(' | ')
    fails.push({ scene: j.scene, shader: j.shader, stage: j.stage, combos: JSON.stringify(j.combos), file: fn, err: firstLines })
  }
}

console.log(`\n===== 结果: ${jobs.length - fails.length}/${jobs.length} 通过 =====`)
if (fails.length) {
  console.log(`❌ ${fails.length} 个编译失败:`)
  const byShader = {}
  for (const f of fails) {
    const k = `${f.shader}.${f.stage}`
    ;(byShader[k] = byShader[k] || []).push(f)
  }
  for (const [k, arr] of Object.entries(byShader)) {
    console.log(`\n  ${k}  (${arr.length} 处, 场景 ${[...new Set(arr.map((x) => x.scene))].join(',')})`)
    console.log(`    e.g. combos=${arr[0].combos} → ${arr[0].err}`)
  }
}
