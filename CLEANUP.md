# CLEANUP.md — P0 修复实施记录（2026-09-10）

> 全部改动集中于 `we-scene-bundle.js`；`demo.html` 本轮**无需改动**（P0 均在渲染器内核）。
> 服务器（we-scene-demo-server.mjs）按请求读盘返回 bundle/demo，改动即生效，**未重启任何服务**。
> 每条记录：位置（修复后行号）/ 问题 / 理由（含证据）/ 验证。
> 回归资产：`mock-gl-test.mjs`（mock-GL 端到端行为测试，12 断言）；`AUDIT-preview-before.png` / `AUDIT-preview-after.png`（修复前后 CPU 预览图，像素级一致）。

## 统一验证协议（每条改动后逐步执行，全部通过）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 语法 | `node --check we-scene-bundle.js` | ✅ OK（每条改动后各跑一次） |
| GLSL 真编译 | `node glsl-validate.mjs` | ✅ 128/128（与修复前基线一致） |
| CPU 预览出图 | `node preview.mjs 3719111841 /tmp/preview_final.png 960 540` | ✅ 22 层绘制成功 |
| GREEN 回归 | PNG 字节级对比 修复前 vs 修复后 | ✅ 0/2073600 字节差异（完全一致） |
| 第二场景出图 | `node preview.mjs 3544152633` | ✅ 24 层绘制成功 |
| 行为级端到端 | `node mock-gl-test.mjs`（mock WebGL2 驱动真实 createRenderer().render()） | ✅ 12/12 断言通过 |

---

## P0-1 效果链 bind 覆盖生效（eff.binds → mp.binds）

- **位置**：`we-scene-bundle.js:3463`（`const binds = ((ov && ov.bind) || mp.binds || [])`，随后的 `for (const b of binds)` 替换原 `for (const b of eff.binds || [])`）。
- **问题**：`resolveEffectChain`（~806-831 行）把 effect.json 每条 pass 的 `bind` 数组存进 `materialPasses[i].binds`，但 pass 循环读取 `eff.binds`（scene.json 效果条目，无该字段，恒 undefined）→ 官方 bind 强制纹理槽语义**从未生效过**。
- **理由**：全库扫描 11 场景 307 条效果：**104 条带 bind、93 条带 target、61 条多 pass**（典型：`3326873240` 的 blurprecise，pass1 `bind=[{0:"_rt_FullCompoBuffer1"},{1:"previous"}]`）。bind 丢失使 slot0 错绑 seqInput、slot1 绑透明纹理，多 pass 效果（可分离模糊等）输出错误。对照 REVERSE-FINDINGS-3 的链结构结论。
- **验证**：mock-gl-test 场景 1——fx1 的 T0=`tex#23`（命名 FBO `_rt_FullCompoBuffer1`，修复前会是 `tex#19`=链输入）、T1=`tex#19`（previous→链输入）✓✓。

## P0-2 效果 pass 独立 fxVao（主 VAO 指针不再被劫持）

- **位置**：`we-scene-bundle.js:2870-2915`（`progVAO` + `fxVao` + 重写 `bindVAOFor`）、`3449`（pass 循环 `gl.bindVertexArray(fxVao)`，原为 `vao`）。
- **问题**：旧 `bindVAOFor` 在**共享主 vao** 上把 attribute 0/1 指针重指到 `quadVBO`（`vertexAttribPointer` 在设置时刻捕获 buffer 绑定，成为 VAO 持久状态），此后 compositeLayer/copy pass 只向 `vbuf` 传数据但绘制仍读 quadVBO（内容=PASS_QUAD NDC quad）→ 效果层最终合成被 MVP 缩成 ~2×2px 角落小点（层不可见），**其后同帧所有直绘层同样损坏**。
- **理由**：代码路径唯一性证明——主 vao 指针只在创建时（~2600）指向 vbuf，全文件无恢复代码；`bindVAOFor` 是唯一改指针处。这是"效果层透明/灰层"之谜的候选根因（与 demo.html `?simplefx` 探针的历史结论吻合）。顺带修复：按 `cfg.key` 变化重设指针（vec2/vec3 a_Position 混用程序切换时指针不更新——旧实现首个 prog 缓存后永不重设）。
- **验证**：mock-gl-test 场景 1——渲染期所有 `vertexAttribPointer` 调用均落在 fxVao 上、主 vao（合成/copy 所用）零指针设置 ✓；copy/composite 绘制正常（copy T0=user_tex_a ✓、合成读 fx 输出 ✓）。

## P0-3 对象级视差生效（parEnabled 遮蔽修复）

- **位置**：`we-scene-bundle.js:3078`（原 `const parEnabled = …` → `parEnabled = …` 赋值外层闭包变量）。
- **问题**：`renderScene` 内 `const parEnabled` 遮蔽 createRenderer 闭包的 `let parEnabled`（2870 区外层声明，`compositeLayer` 在视差分支读取）→ 外层恒 false，`layer.parallaxDepth` 位移分支死亡。
- **理由**：JS 词法作用域规则（grep 全文件 3 处：外层声明/compositeLayer 读取/renderScene 遮蔽）；`parallaxDepth` 在 parseScene（~696）正常解析但从未被消费。
- **验证**：`node --check` ✓；preview 像素级一致 ✓（凯尔希无 cameraparallax/parallaxDepth 层，默认路径行为严格不变——这正是 GREEN 保持的证明）；视差分支现可被 `general.cameraparallax=true` + 层 `parallaxDepth` 激活（真机鼠标回归留待后续）。

## P0-4 additive 混合 alpha 通道对齐官方 BlendState 表

- **位置**：`we-scene-bundle.js:2976`（`gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.SRC_ALPHA, gl.ONE)`，原 alpha 通道为 `(ONE, ONE)`）。
- **问题**：REVERSE-FINDINGS-2 §2 从 wallpaper64.exe `CreateBlendState` 静态构造表二进制提取的 **idx2：RGB 与 Alpha 均为 SRC_ALPHA(5)/ONE(2)**；旧实现 alpha 通道 (ONE,ONE) 使 dst.a 按 src.a=1 累加，多层 additive 叠加处画布 alpha 偏大。
- **理由**：官方表为二进制静态提取（确定级）；additive 仅光效/粒子路径使用，影响面小。
- **验证**：`node --check` ✓；preview 像素级一致 ✓（直绘路径不走 additive）；mock-gl-test 全程 getError=NO_ERROR ✓。

## P0-5 反馈环守卫（bind/target 同 FBO 时改绑链输入）

- **位置**：`we-scene-bundle.js:3476-3486`（纹理绑定循环内，`entry` 解析后：`if (entry.fbo && outFBO && entry.fbo === outFBO.fbo) entry = passInput` + 一次性日志）。
- **问题**：P0-1 修复后 bind 把槽指向 `_rt_*` 命名 FBO 的场景大量启用；若某效果 target 与 bind 同名（官方结构不出现，防御必须有），同 pass 采样+绘制同一纹理 = WebGL 反馈环 UB → Adreno 抛 0x502 → 触发整层回退直绘（历史白块/黑屏根因）。原代码仅有"反馈断言"日志（原 3446-3456），**检测但不阻止**。
- **理由**：REVERSE-FINDINGS-3 §3 明确反馈环是兼容层 0x502 的头号来源；`passInput ∈ {fboA, fboB}`，而 ping/pong 轮换只发生在无 target 的 pass（代码 3472-3477），命名 FBO 永不进入轮换 → 替换目标恒安全。
- **验证**：mock-gl-test 场景 2——target 与 bind 同为 `_rt_X` 时，守卫日志 `[we-scene] 反馈环拦截` 触发 ✓、采样纹理改绑为 400×400 链输入 FBO（非 1×1/空）✓。

## P0-6 粒子逐粒子 alpha 入顶点（u_Alpha 恒 1 → v_Alpha）

- **位置**：
  - `we-scene-bundle.js:2498-2523`（PARTICLE_VS 增 `in float a_Alpha; out float v_Alpha;`；PARTICLE_FS 增 `in float v_Alpha`，alpha = `u_Alpha * v_Alpha * texR`，对齐官方 genericparticle "alpha=v_Color.a" 语义）；
  - `we-scene-bundle.js:2605-2620`（新增专用 `partVao`：stride 24 = pos3+uv2+alpha1，`partAlphaLoc = getAttribLocation(particleProg,'a_Alpha')` 守卫 ≥0）；
  - `we-scene-bundle.js:3583-3613`（顶点缓冲扩为 6 float/顶点，`verts[vi++] = a` 写入逐粒子 alpha，绘制绑定 partVao）。
- **问题**：`renderParticleLayer` 逐粒子计算 `a/colorR/G/B`（vis 列表），但顶点格式只有 pos3+uv2，绘制时 `uniform3f(u_Color,1,1,1)`、`uniform1f(u_Alpha,1)`——**全部粒子全白、全不透明**；alphafade/alpharandom/oscillatealpha 等 initializer/operator 全部失效。旧实现还借用主 vao（5 float stride）传 6 float 数据（越界读）。
- **理由**：代码自注释引用的官方 genericparticle.frag 语义（v_Color.a = alpha）；粒子颜色 color1=color2=[1,1,1] 恒白，rgb 选择器无观感差异，故最小修复只把 alpha 顶点化（AUDIT #6 如实记录 rgb 未顶点化）。
- **验证**：mock-gl-test 场景 3——partVao 初始化指针 stride=24/偏移=20/size=1 ✓、批绘制发生（count>6）✓、bufferData 长度 ≡ 0 (mod 36) ✓。粒子默认隐藏（GREEN 约束"粒子关"），默认路径不执行该函数，preview 像素级一致 ✓。

---

## 未实施（按 AUDIT 优先级留档）

- **P1**：MDLA frameCount 硬编码 90（demo.html，?anim 默认关）、相机 cover 取景（需官图回归）、hideUI 正则收窄（可能改变其他场景现状）、FBO clear/fit 字段、材质多 pass。
- **P2**：mul(M,v) 转译分支、MVP 逆矩阵、PointerPosition、RGBA16F FBO、GIF/WEBP、死代码清理等——见 AUDIT.md #7-#22。
- 所有未实施项均**不影响本次 P0 的正确性**；实施顺序与风险已在 AUDIT.md 各条标注。

## 约束遵守确认

- ✅ 未重启 dsh/任何服务（bundle 由服务器按请求读盘返回，改动即生效）。
- ✅ GREEN 路径未破坏：附件/眼睛（uvRect 直绘）、背景直绘（clearBgFx）、粒子关——全部不走本次改动的代码分支，preview 像素级一致是直接证据。
- ✅ 无新增依赖、无接口变更（`createRenderer`/`renderScene` 签名不变）。
