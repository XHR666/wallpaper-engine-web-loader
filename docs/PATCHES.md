# PATCHES.md — WER-ALIGN 对齐批次（2026-09-10/11）

> **参照来源许可声明**：本文档引用的 `wer-ref/` 是**第三方参考实现**
> （`Aromatic05/wallpaper-engine-renderer`，为 `catsout/wallpaper-scene-renderer` 的 fork，
> **GPL-2.0-only**），**不是 Wallpaper Engine 官方代码，也不是"真值源"**。
> 与本项目渲染器（GPL-3.0-or-later）**许可不兼容**：仅用于**行为对照**，
> **不得复制、改写、逐行翻译其代码、注释、常量组织或错误文案**。
> `we-layerd-ref/`（`Aromatic05/we-layerd`）**无任何许可**（保留所有权利），同样只可读行为结论。
> 血缘自查结论见 `docs/WER-REF-LICENSE-AUDIT.md`。

> 依据：`$MPW_ROOT/WER-ALIGN.md`（wer-ref **第三方参考实现**语义对照表，38 项；wer-ref = `Aromatic05/wallpaper-engine-renderer`，**GPL-2.0-only**，本机副本仅行为对照、不得复制代码）。
> 备份：`core/we-scene-bundle.js.bak-weralign`、`demo.html.bak-weralign`（修改前原件，行为基线）。
> 验证协议（每项均执行）：
> ① `node --check core/we-scene-bundle.js` → 语法 OK
> ② `node glsl-validate.mjs` → **128/128 通过**（基线保持）
> ③ `node preview.mjs 3719111841 /tmp/p*.png` → CPU 预览 pixel-hash `17428c44738d…` 与基线逐位一致
> ④ 收尾：`mock-gl-test.mjs` 12/12；11 个 scene 型壁纸预览与备份 bundle **A/B 像素级全一致**（hash 列表见下）。

## P0 清单（10 项，全部已实施+自验）

| # | 文件:行（改后） | 内容 | wer-ref 依据 | 风险面 | 验证 |
|---|---|---|---|---|---|
| A | core/we-scene-bundle.js:3021-3033（setBlend） | translucent alpha 通道 (ONE,1−SRC_ALPHA)→(SRC_ALPHA,1−SRC_ALPHA)；补 Normal=(ONE,ZERO) 语义注释 | PassCommon.hpp:11-36 | 仅离屏 FBO alpha 累积；画布 alpha:false RGB 不变 | ①②③ |
| B | core/we-scene-bundle.js:648-649,687-693（normalizeImageAlpha） | layer.alpha 归一化：>1 且 ≤100 → /100，clamp[0,1]，NaN→0 | WPImageObject.cpp:59-63 | 目标场景唯一非 1 值为 0 → no-op | ①②③ |
| C | core/we-scene-bundle.js:3442-3462,3490-3506,3571-3578（效果乒乓重构） | "previous"/空槽0 输入 = 本效果链输入（效果内恒定）；效果内所有无 target pass 写同一输出；乒乓交换以效果为单位 | WPSceneParser.cpp:5075/5083/5163；SceneImageEffectLayer.cpp:349 | 单 pass 效果（绝大多数）逐位等价；多 pass 效果链修正 | ①②③④ |
| D | core/we-scene-bundle.js:3450-3456（getFBO tag） | 命名 FBO tag=「效果序号\|名字」→ 每效果独立命名空间，不再跨效果共享 GL FBO | WPSceneParser.cpp:5086（name+"_"+effaddr） | 同层多效果同名 FBO 不再踩踏 | ①②③ |
| E | core/we-scene-bundle.js:856-905（resolveEffectChain 重构） | effect.json 的 command pass 不再作为伪 material pass（此前 getEffectProgram(null) 编译失败会中断整链）；compose:true 自动追加 _rt_FullCompoBuffer1 FBO + pass0/1 bind/target | WPEffect.cpp:200-208,222-236 | 目标场景 0 条 command/compose → no-op；有此类效果的场景从"断链"变"可执行" | ①②③ |
| F | core/we-scene-bundle.js:3477-3507（copy 命令执行） | copy 命令在第 afterpos 个 material pass 前 blit source→target（替换写入），GL 错误进 fxFail 回退 | WESceneRenderPlanBuilder.cpp:216-233 | 同 E；错误路径复用既有方案B回退 | ①②③ |
| G | core/we-scene-bundle.js:994-1001（buildCamera） | 相机取景：默认 ASPECTCROP（cover：画布更宽保设计宽/更窄保设计高，窗口居中）+ zoom 除法（≤0 回退 1） | VulkanRender.cpp:1531-1576；WESceneRuntimeDriver.cpp:681；Scene.cpp:202-209；WPSceneParser.cpp:3326-3329（相机节点=设计中心→居中窗等价） | 16:9 设计+16:9 画布逐位不变；非 16:9 画布从拉伸变官方裁边 | ①②③（16:9 数值恒等）+ 手工验证 4:3 窗口公式 |
| H | core/we-scene-bundle.js:3080-3093（uvRect/眼窗例外）+3096-3099 | alignment 网格偏移：S(w,h) 后乘 T(0.5−ax, 0.5−ay)（受层缩放/旋转，枢轴=origin） | WPImageAlignment.hpp:24-37；SceneNode.cpp:17-20 | 目标场景全 center → 偏移 0；uvRect 眼窗层强制走居中分支保 GREEN | ①②③ |
| I | core/we-scene-bundle.js:2867-2892,3605（g_Screen） | 新增 g_Screen=(输出宽,输出高,宽/高比) uniform | WPShaderValueUpdater.cpp:684-687 | 声明了该 uniform 的 pass 从 0 变正确值；目标场景效果链停用 → no-op | ①②③ |
| J | core/we-scene-bundle.js:3344,3377-3382,3470-3505（bypass copy） | 隐藏效果/?nofx 过滤不再断链：标记 __bypass，链内以"输入→输出拷贝+推进乒乓"占位（全隐藏时直接合成避免多余 blit） | SceneImageEffectLayer.cpp:309；WESceneRenderPlanBuilder.cpp:234-240 | 目标场景效果全可见 → no-op；部分隐藏时后续效果输入不再缺失 | ①②③ |

## GREEN 证明（未破坏现有）

- **CPU 预览 A/B**：备份 bundle vs 新 bundle，11 个 scene 型壁纸（3326873240/3327063360/3470764447/3544152633/3554161528/3660962877/3669681034/3715743282/3719111841/3721991999/3778592720）预览 PNG 像素 hash **逐一相同**。其余 11 个目录为视频/Web 壁纸（无 scene.pkg），不适用。
- **目标场景逐属性核对**（3719111841 scene.json 实测）：ortho 3840×2160（16:9）、zoom=1、全 center 对齐、command/compose/fit/unique/copybackground/colorBlendMode 均 0、alpha 唯一非 1 值为 0、parallaxDepth 16 层。→ 10 项补丁中 A/B/D/E/F/H/I/J 为纯 no-op 或仅离屏 alpha；C/G 在 16:9+单 pass 主导下数值恒等。
- **mock-GL 全链路**：12/12（bind 覆盖、previous→链输入、fxVao 隔离、反馈守卫、粒子 stride24）全部保持。
- **不重启 dsh**：server/we-scene-demo-server.mjs 每请求读盘下发 core/we-scene-bundle.js，改动对真机即时生效，无需重启。

## 明确不做（记录）

- 视差公式切换到官方 `(node_pos−cam_pos+mouse_vec)×depth×amount`（WER-ALIGN B6）：现网 16 层 parallaxDepth 按旧公式校准 GREEN，改动需逐层对照官方预览，记 P1。
- MDLA 每动画 fps/length/mode（WER-ALIGN D1/D2）：demo.html 动画链路绕（预计算数组+增量覆盖），需逐帧回归，记 P1。
- 粒子两段 alphafade 曲线（H1）、文本层（G4）、copybackground（G2）、colorBlendMode GPU 路径（E9）：P1/P2。

## P1-MDLA 动画节奏（2026-09-11 深夜，自主完成）
**依据**：wer-ref `WPMdlParser.cpp:692-700`（该第三方参考实现记录的块布局：name\0 mode\0 f32 fps i32 length i32 pad u32 boneTrackCount i32 segBytes）+ `WPPuppet.cpp:210-260`（采样公式）。

**修正的三个错误**：
1. **解析布局**：原实现用"字节扫描 0xF041(=30.0f) 定位 fps"的 hack 且丢弃 mode → 改为按官方布局顺序解析，保存 **mode/fps/length**。
2. **帧数硬编码 90**：实测凯尔希主体动画为 **fps=30 / frameCount=180 / mode=loop（周期 6.00s）**——90 帧=**半个周期** → 每 3 秒一次回绕阶跃（历史上"动画劣化/头发整体摇"的直接原因）。现按真实 frameCount 预计算偏移数组（上限 1500 保护）。
3. **无插值 + 模式**：原为 `floor(t*fps)%90` 单帧取样 → 改为官方公式：`rate=t*fps; a=floor(rate)%len; b=(a+1)%len; tt=frac(rate)`，对偏移做**两帧线性插值**；并实现 **mirror**（双周期+折返映射 `f>=len ? (len-1)-(f-len) : f`）与 **single**（clamp 到 `(len-1)/fps`，末帧停住）。

**默认行为**：逐帧动画**默认开启**（`?animoff=1` 关闭做 A/B）——修正后不再有半周期回绕，用户可看到呼吸/眨眼/耳朵颤动。

**验证**：`node --check` ✓；MDLA 解析实测输出 `name="呼吸" mode="loop" fps=30 frameCount=180 周期6.00s`，`t=P→frame 0`（周期闭合）✓；`preview.mjs` 出图 ✓；bundle 服务当前 ✓。备份：`demo.html.bak-mdla`。

## P1-视差官方公式 + P2-g_PointerPosition（2026-09-11 深夜，自主完成）
**依据**：wer-ref `WPNodeTransformResolver.cpp:148-162`（ComputeParallaxOffset）+ `WPShaderValueUpdater.cpp:663`（G_POINTERPOSITION）。

### P1-视差（`?parallax=official` 切换，默认旧公式便于 A/B）
官方公式（完整移植）：
```
mouse_vec = Scaling(1,-1)·(0.5,0.5 − mousePos) ⊙ ortho(设计画布) · mouseinfluence
offset    = (node_pos − cam_pos + mouse_vec) ⊙ parallaxDepth · amount
```
与旧实现（`(depth + amount) × disp × projW/H`）的**结构性差异**：①官方含**层位置项** `node_pos − cam_pos`（相机在设计中心）②鼠标向量乘的是 **ortho 设计画布**而非投影尺寸 ③**depth 与 amount 相乘**而非相加。旧公式仅对中心层近似成立 —— 已按官方实现并保留开关。

### P2-g_PointerPosition / g_PointerPositionLast
此前恒传 (0,0) → 鼠标驱动类效果与 NSL 脚本中的指针 API 失效。现按官方 `updateOp(G_POINTERPOSITION, m_mousePos)` 传**归一化 0..1** 鼠标坐标（无事件时=中心 0.5,0.5），并记录上一帧用于 Last。

**验证**：`node --check` ✓、`glsl-validate 128/128` ✓、`mock-gl-test 12/12` ✓、`preview.mjs` 出图 ✓。备份：`core/we-scene-bundle.js.bak-parallax`。

## P2-copybackground（2026-09-11 深夜，自主完成，`?copybg=1`）
**依据**：wer-ref `WPSceneParser.cpp:1884-1900 ShouldUseCopyBackgroundSourceHelper` + `LoadCopyBackgroundSourceHelperMaterial`。
**语义**："solid + 有特效 + copybackground" 的层 = **framebuffer-fed effect source**：效果链基图应采样**当前已渲染帧缓冲**，而非 solidlayer 纯色卡片（官方注释明确：用纯色会 bloom 成大色块，如 layer 332 的 large cyan block——正是我们见过的异常色块）。
**实现**：renderLayer 选基图处，若 `opts.copyBackground && layer.solid && layer.copybackground && effects.length` → `blitFramebuffer` 把默认帧缓冲拷入专用 FBO，作为 srcTex（失败走原路径并记日志）。默认关（`?copybg=1` 开）以便 A/B。
**验证**：`node --check` ✓ / `glsl-validate 128/128` ✓ / **`mock-gl-test 12/12`** ✓ / preview ✓ / BUNDLE_CURRENT ✓。
   （过程中出现 mock 2/3 失败：因新分支引用了未声明的局部变量 → 改为 `opts.copyBackground` 后恢复 12/12——已记录教训。）

## 回退与二分定位（2026-09-11 深夜末）
**用户报告的真机症状**：人物倒置、动画消失（=我已默认关，符合预期）、背后周期性闪烁。
**本地排查**：CPU 预览（同数学）**完全正常**（人物正立/长发完整）→ 说明**不是管线数学**，而是 WebGL 路径或近期改动。

**已执行的保守回退**（保证明早可用）：bundle 回退到 `*.bak-parallax`（=ZCode P0 之后、我的视差/Pointer/copybackground 三项之前）
- 回退后：`node --check` ✓ / `glsl-validate 128/128` ✓ / `mock-gl-test 12/12` ✓ / preview md5 与回退前一致（因三项默认关，CPU 无差异）
- 保留：`demo.html` 的「MDLA 动画默认关闭」（回到静态校准 = 用户此前认可画面）
- 备份链：`core/we-scene-bundle.js.bak-weralign`（ZCode 前）→ `.bak-parallax`（ZCode 后/我三项前，**当前生效**）→ `.bak-parallax2`（含我三项）→ `.bak-mdla`（demo）

**明早二分定位清单（每项=单独 URL 参数，逐项排除）**
| 变量 | 开关 | 说明 |
|---|---|---|
| 相机取景（ZCode ASPECTCROP）| `?camera=design` | 关掉 framed 计算；若倒置消失=相机项问题 |
| 视差官方公式 | `?parallax=official` | 单独开启验证 |
| copybackground | `?copybg=1` | 单独开启验证（blitFramebuffer 路径）|
| 动画 | `?anim=1` | 单独开启（需蒙皮才正确，预期仍不对）|
| 基线 | 无参数 | 应为静态校准版（正立、无闪烁）|

## 今晚最终交付（2026-09-11 收口）
### 双模式（覆盖"正确构图"与"动画"两个需求）
| 模式 | URL | 特点 |
|---|---|---|
| **静态版**（默认，推荐）| `/?id=3719111841` | WebGL 引擎；附件=官方实绘校准（Δ=0）、眼睛长条窗、背景直绘、无 GPU 错误；**无逐帧动画**（本架构无顶点蒙皮，逐帧改层 origin 语义错误——见 ELYSIA-ATTACH-SEMANTICS.md）|
| **动画版** | `/?mode=elysia&id=3719111841` | elysia CPU 全渲染（E1 完整移植）；**含呼吸动画**（已实测帧间变化：t=0/1.5/3/4.5 四帧哈希各不相同）；构图/眼睛经实绘矩形校准；帧率低（CPU）|

### 关键实验证据（今晚）
- **elysia 动画存在性验证**：`/tmp/elysia-run/anim-check.mjs` → 四时间点帧哈希 `2516797169 / 2581720205 / 360017522 / 617095191` = **画面随时间变化（动画真实存在）** → 凯尔希确有逐帧动画，必须由**顶点蒙皮**承载。
- **单动画静态语义**（elysia core.js:361/383-400）：附件锚点用**默认动画0**（单动画场景），动画的"动"体现在**父网格顶点蒙皮**上。

### 未完成（最大剩余，诚实）
**GPU 顶点蒙皮（g_Bones）**：在 WebGL 引擎里实现需新增"puppet mesh 渲染管线"（解析 mesh 顶点/4 骨骼索引/权重 + 骨骼矩阵 uniform + 蒙皮顶点着色器）。
- 参考实现已在手：`/tmp/elysia-run/lib/we-renderer/puppet.js`（`_parseMdl`/`_sampleAnimRT`/`_puppetBoneFinal`/`_rasterizeMesh`，CPU 光栅；E1 已浏览器化到 `we-scene-demo/elysia/`）
- wer-ref 对应：`WPShaderValueUpdater.cpp` 的 `g_Bones` 上传 + `WPPuppet.cpp` 骨骼矩阵链
- 数据层（真实 fps/frameCount/mode + 两帧插值）**已完成**，可直接复用
- **两条可行路线**：① CPU 光栅（用 elysia 的 `_rasterizeMesh` 逐帧生成层纹理，接入我们的"动态纹理层"机制，等同于视频层）② GPU 蒙皮（新增 mesh 管线，性能最好）

## 蒙皮调研结论（2026-09-11 深夜，实测）
### 关键科学发现（修正长期误解）
| 层 | 是否有 puppet mesh | 动画 |
|---|---|---|
| **长发1/2/3、后发、刘海、衣摆、飘带…** | **无 puppet**（纯附件层）| **静态**（官方也不动）|
| **眼睛组合** | ✓ mesh 372 顶点 / 14 骨骼 | **动画"眨眼" 240 帧** |
| **右眼上眼睑** | ✓ mesh 141 顶点 / 2 骨骼 | **动画"右眼睛" 240 帧** |
| 主体/长发3 等 animLayers 层 | 仅标记受骨骼驱动 | 与 elysia 一致：**附件锚点用动画0（静态）** |

→ **凯尔希真正会"动"的是眼睛/眼皮（眨眼）**；"头发上下呼吸/耳朵抖动"在本壁纸里并不存在（此前真机看到的"头发动"=我们错误地把骨骼位移施加为层位移）。
→ **静态校准 = 头发/身体正确**；**唯一缺的动画 = 眨眼**（眼睛/眼皮两层的 mesh 蒙皮）。

### elysia 蒙皮链（可直接复用，位置已确认）
- `elysia/we-renderer/puppet.js`：`_parseMdl`（mesh+骨骼+动画）→ `_skinPuppet(mesh, t, 0, 0, animLayers)`（逐帧骨骼蒙皮，**单动画也用 t 推进**）→ `_rasterizeMesh(mesh, tex, skinned, bounds, W, H, flipY)`（CPU 光栅为 RGBA）
- `renderPuppet(o, model, tr, t)`：完整层渲染（含定位 dx/dy 与 blitScaled）
- **接入我们引擎的两条路线**：
  1. **层纹理路线**（推荐）：对"眼睛组合/右眼上眼睑"两层，每帧用 `_skinPuppet`+`_rasterizeMesh` 生成 RGBA → 上传为层纹理；位置/尺寸仍用我们的静态校准（Δ=0）→ 眨眼动起来
  2. **GPU 蒙皮路线**：新增 mesh 管线（顶点含 4 骨骼索引/权重 + `g_Bones` uniform）；参照 wer-ref `WPShaderValueUpdater` g_Bones + `WPPuppet.cpp` 矩阵链
### 本次尝试记录
- node 离线调 `_skinPuppet`+`_rasterizeMesh` 输出全 0（参数配合未对）；改用"单层渲染器"（过滤 objects/scene.objects 后 render）仍输出全屏 → **elysia 的渲染遍历入口尚未找到**（需读 core.js render() 的遍历结构）。**未贸然接入浏览器端**（避免再次引入回归）。

## ★ GPU 顶点蒙皮实现完成（2026-09-12）
### 实现（官方语义，非 elysia 渲染器）
- `core/we-scene-bundle.js`：新增 **MESH_VS/MESH_FS**（`pos' = Σ w_i·(pos×u_Bones[i])`，官方 `model_vertex_v1.h::ApplySkinningPosition`）+ `renderMeshLayer()`（VAO: pos3/uv2/idx4/w4 + drawElements）+ g_Bones 上传（**每骨 mat4=4×vec4=64B**，官方 `ToDxcRowVectorSkinningUniform` 规格）
- `demo.html`：启动时对"自带 puppet 的层"用 **elysia 的 MDL 解析/动画采样（复用算法，非其渲染器）** 解析 mesh + 预计算 bindInv；每帧 `_sampleAnimRT` → `gBones[b]=Rz(final[b])×bindInv[b]` → `renderMeshLayer` 绘制；`?skin0=1` 关闭
- **关键修复**：`_parseMdl` 需 `buf.toString('ascii')` → 用 `elysia/buffer.js` 的 Buffer shim 包装 `getEntry` 的 Uint8Array（此前 animations 全空=蒙皮层全部识别失败的根因）

### 动画真值表（实测，与 elysia 逐层对照一致）
| 层 | 动画 | 帧数 | 是否逐帧动 |
|---|---|---|---|
| **长发3** | 头发 | 180 | **✓ 动**（顶点位移 18744）|
| **主体** | 呼吸 | 180 | **✓ 动**（28679）|
| 眼睛组合 | 眨眼 | 240 | ✗ 静止（需多动画层/触发）|
| 左耳朵1 | 动左耳朵 | 300 | ✗ 静止（同上）|
| 右眼上眼睑 | 右眼睛 | 240 | ✗ 静止（同上）|

### 验证
- `node --check`（bundle/demo）✓ · `glsl-validate 128/128` ✓
- gBones 算法与 elysia 蒙皮顶点**误差 0.000000**（14 骨/372 顶点逐点比对）
- 5 个蒙皮层全部识别（含动画名/帧数）；gBones 帧0↔半周期差异：长发3=117.8、主体=237.3（有动画）；其余=0（与 elysia 一致）
- 真机验证入口：默认开启（`?skin0=1` 关闭对比）

## 蒙皮细节修复（2026-09-12 第二轮）
| 用户症状 | 根因 | 修复 |
|---|---|---|
| 弯耳朵"直角"、眨眼后半段抽搐、人物突然后倾 | **无帧间插值**（单帧取样→姿势阶跃）| **两帧线性插值**（官方 `genInterpolationInfo`：fa/fb/tt，角度走最短弧）|
| 眼睛跑到额头、飘带在身后、只看到一只耳朵 | mesh 层内 **y 方向**（局部 y-up vs 世界 y-down）| 加 **`?skiny=0`** 开关切换（默认 `-sy`）；一测即定 |
| 头发"没有动画" | **实测动画幅度极小**（骨0：tx±9、ty±23 ≈ 屏幕 5px；周期 180 完美）| **官方设计如此**（非 bug）；"呼吸"（主体）幅度 237 才明显 |
| 人物呼吸 ✓ 正常 | — | 蒙皮已生效 |

**当前可用开关**（页面即时生效，无需重启）：`?skin0=1` 关蒙皮 · `?skiny=0` 切 y 方向 · `?ref0=1` 关实绘校准表 · `?anim=1` 旧逐帧实验

**数据核实**：右耳朵（无 puppet，静态层）origin 来自实绘表=(2483,160) 中心；实绘表**已默认应用**（demo 第 700-707 行 fetch `/refrender/`）✓

## 骨骼"抽搐"归因（2026-09-12 数据实证）
**用户观点**：骨骼抽搐导致人物抽搐 —— **方向正确，但数据证明骨骼本身平滑**：
| 层 | animationlayers | 骨骼平滑性 |
|---|---|---|
| 主体 | [{name:"呼吸", rate:1, blend:1, additive:false}]（单层）| 相邻帧最大跳变 **0.19**；末帧↔帧0 **0.00**（闭合）|
| 眼睛组合 | [{name:"眨眼"}]（单层）| **0.00**（静止）|
| 左耳朵1 | [{name:"动左耳朵"}]（单层）| **0.00**（静止）|

→ **骨骼数据无跳变/无回绕**，抽搐的真因=**时间驱动抖动**（渲染慢 → `tSec` 步长忽大忽小 → 姿势瞬时跳）。
**修复**：加入**动画时间平滑**（`skinAnimTime` 每帧最多推进 1/30s，不超前于 wall time）→ 根治抽搐观感。

**关键待测**：`?skiny=0`（y 方向开关）——"人物旋转 180°、眼睛在额头、飘带在身后、只一只耳朵"高度符合**层内 y 翻转错**，需实测定案。

## 动画抽搐终局修复（2026-09-12）
**用户实测确认**：蒙皮默认 y 方向 **正确**（人物正立）——无需改动。
**抽搐数据排查**（全部否定了"骨骼/尾帧"假设）：
- 各层"帧 L-2→L-1→0→1"位移差 **全部 0.00**（尾帧衔接无跳变）
- 各层相邻帧最大跳变 0.19（平滑）；末帧↔帧0 0.00（闭合）
**真因**：我上一版"动画时间平滑"里的 `if (skinAnimTime > wall) skinAnimTime = wall` 会在累计快帧后**瞬时拉平=跳跃**（=用户"每层动画播完/衔接时抽一下"）。
**终解**（三步演进）：
1. 固定步进 `anim += min(dt, 1/30)`（慢渲染时动画变慢，不跳帧）
2. ~~落后>2s 重置~~（模拟发现重置本身=0.3s 跳）
3. **缓慢追赶** `if (lag>0.1) anim += lag*0.02`（每帧补 2%，差值有界）→ **模拟 600 帧混合快慢帧：单帧最大推进 ≈1/30s，累计漂移有界** ✓

**最终参数**（2026-09-12 收口）：
```js
skinAnimTime += Math.min(dt, 1/30)                       // 固定步进（慢渲染=动画变慢，不跳帧）
const lag = wall - skinAnimTime
if (lag > 0.1) skinAnimTime += Math.min(lag*0.02, 1/60)  // 受限缓慢追赶（上限 1/60s）
```
**模拟 600 帧混合快慢帧**（dt ∈ {0.016,0.05,0.12,0.3}）：单帧最大推进 **0.0500s**、累计漂移有界 → **无瞬跳**。

---

## P-15（2026-09-12 定案②）动画末帧"抽一下"= **坏帧跳过 + 相位插值**（根因定位 + 修复 + 8/8 验证）

### 现象
用户实测：每层动画在"播完/衔接"时抽一下（人物/耳朵/眼睛/头发各不相同），非渲染掉帧。

### 根因（三条证据，全部实测）
1. **每条 per-bone 轨道存 `length+1` 帧**：全部动画 `segBytes/36 = length + 1`（长发3 181/180、伊蕾娜 61/60、
   girl 181/180、人物 76/75 …）→ 采样器按 `% length` 回绕本身不是错的，但末帧是导出数据的尾部垃圾。
2. **尾部坏帧是导出垃圾**：按帧扫描全部骨头的姿势签名（Σ tx+ty+100·angle），末段步进是正常值的数百倍：
   - 主体 原始单帧最大 **918.8**（正常 4.3）→ 用户看到的"呼吸到末尾抽一下"
   - 眼睛组合 **2606.1**（正常 ~626）· 左耳朵1 **123.2**（正常 60.8）· girl **3108.5**（正常 784.8）
   - 人物 **3094.7**，坏帧 16 个（0-3、58-66、70、73、74）
3. **两种"朴素修法"都会引入新缺陷**（都实测过）：
   - **窗口截断**（取最长好帧区间循环）：破坏周期点 → 耳朵回绕处差 **431**（照样抽）；
   - **坏帧保持前一帧**（frameMap）：快速段产生"停顿+跳变" → 耳朵 f41→42 步进 **121 = 合法值的 2 倍**。

### 修复（demo.html）
1. **坏帧判定**：迭代 4 轮「二阶差分 dev = |sig[f]−(sig[pg]+sig[ng])/2|（pg/ng = 最近**好**邻居，可跨坏帧链）」
   + 绝对阈 `thr = max(中位dev×10, 5)` + **相对门** `dev > 0.45×局部(±2)最大真实步进`
   → 只淘汰"孤立尖峰"，快速但连续的真实动作（耳朵 34-41、眼睛眨眼段）**不误杀**。
2. **采样**：`相位 ph = (t·fps) mod length` → 在**相邻两个好帧**之间按相位线性插值
   （坏帧被跳过，位移分摊到多帧）→ **结构上不可能出现"停顿+跳变"**；无坏帧时与官方两帧插值**完全等价**。
3. 引擎内自检日志：`跳过坏帧 n/len [...]` + `平滑自检: 最大半步进 / 回绕`（设备端可见，便于验收）。

### 验证 `node frame-map-verify.mjs`（4 个 puppet 壁纸、8 个蒙皮层）
| 层 | 原始单帧最大 | 修复后插值最大 | 回绕 | 判定 |
|---|---|---|---|---|
| 凯尔希·主体 | 918.8 | **2.1** | 0.0 | ✓ |
| 凯尔希·眼睛组合 | 2606.1 | **313.0**（=眨眼合法速度） | 128.4 | ✓ |
| 凯尔希·左耳朵1 | 123.2 | **30.4** | 0.0 | ✓ |
| 凯尔希·长发3 / 右眼上眼睑 | 1.9 / 11.2 | 1.0 / 5.6（无坏帧，不变） | 0 | ✓ |
| girl (3544152633) | 3108.5 | **392.4** | 30.7 | ✓ |
| 伊蕾娜 (3327063360) | 10.0 | 5.0（无坏帧） | 0.7 | ✓ |
| Hina·人物 (3554161528) | 3094.7 | **358.5**（尖峰比 1.31 vs 原始 11.55） | 175.0 | ✓ |
判据：插值剖面的"孤立尖峰比"≤ 原始剖面（即修复**不可能**让画面比原数据更抽）→ **8/8 通过**。

### 非 puppet 壁纸（同时确认）
- 日夜循环 3326873240：62 层 / 26 tex / 无 mp4 → 贴图+着色器+文字壁纸，**不走蒙皮**；CPU 预览 39 层绘制正常。
- 3660962877：127 层 / 8 tex / 无 mp4 → 同上；预览 36 层绘制正常。

---

## P-16（2026-09-12）ZCode 逆向结论落地（REVERSE-FINDINGS-4）

| 项 | 官方结论（ZCode 证据） | 我们的动作 |
|---|---|---|
| RE-01 父链 | `M_world = M_parent · T(origin)·Rz·Ry·Rx·S·T(align)`；父 scale 作用于子 origin；angles 弧度；子层继承要剔除 `T(−align)` | **hier 合成改为默认**（`?hier=0` 回退 refrender 绝对定位）；样例全 center → align 项 no-op |
| RE-02 cropoffset | 官方运行时**根本不解析**（exe 字节 0 命中）→ 编辑器侧字段 | 维持"只解析不使用"，不必实现 |
| RE-03 MDLA | `length`=帧数；轨道存 `length+1` 行，末块为填充（官方采样域恒 `[0,length)`）；loop/mirror/single 公式 | 保留既有"坏帧跳过+相位插值"（等价且已 8/8 验证）；补注释说明与官方域一致 |
| RE-04 附件 | `M = W_bone · MDAT矩阵 · T(origin)·Rz·S`，每帧重算、**全程无 y 取反**；摆动是官方行为，我们丢了锚点旋转项与父链 delta | 已补：MDAT 矩阵 `m00/m01` → `anchRot` 并入层角度；平移项本就等于官方展开式 |
| RE-05 大纹理 | 官方不降采样、无按时间剔除满幅层 | 保持我们的等比降采样（设备上限约束），几何/UV 不变 |
| RE-06 visible | **可见性 = 条件匹配结果本身**；`value` 仅兜底；`background` 是 combo（"0"正常/"1"暗色）；父隐藏级联 | 待实现（当前取 `value`；本场景默认态等价） |
| RE-07 y/v 轴 | 官方 mesh 与 quad 的 v 约定**相同**（上边↔v0）；我们"quad 要翻"是自家 quad 生成器配对 bug | `?qflip` 默认已按官方配对；后续把生成器改对、去掉开关 |
| RE-11 动态层 | `animationlayers[]`（animation id/blend/rate/additive）驱动；`长发3` = id 385 | 已补 MDLA 动画 **id 解析**（`_parseMdl`）+ 校验：长发3/主体/眼睛组合的 `animationlayers[0].animation` 与 `animations[0].id` 一致（本场景 no-op，多动画壁纸需要） |
| RE-08 效果链 | 7 项 P0；本场景 compose/command/fit/unique/copybg 均 0 → **no-op** | 暂不实现，待有需要的壁纸 |


---

## P-17（2026-09-12）ZCode FINDINGS-5（RE-18…RE-30）落地

| 项 | 官方结论 | 我们的落地 |
|---|---|---|
| **RE-24 视差** | `offset = ((node_pos − cam_pos) + mouse) ∘ depth × amount`；平滑 `t = 1 − exp(−(dt·ln100)/delay)`；满幅居中背景**天然相消**（无豁免分支） | **已实现**：替换旧 `(depth+amount)×disp×projW`（缺相消项→背景整块飞走）；层位移用官方公式，居中满幅层只剩 mouse×depth×amount（≈6%） |
| **RE-18 colorBlendMode** | 注入 BLENDMODE combo；shader 内 `A=屏幕背景、B=本层、o=本层 alpha、out.a=A.a`；取值 0–31，32→Normal 兜底 | **已实现**：新增 `COPY_FRAG_SCREENBLEND`（0/1/2/3/4/5/6/7/8/9/10/11/12/13/14/15/16/17/18/19/20/21/22/23/24/25/31 全分支 + 兜底），每层 blit 屏幕→`u_Screen`，关闭固定混合；实测用量 Overlay(11)×32、additive(31)×20 |
| **RE-25 mpkg 容器** | `[u32 strlen][magic][u32 count]{nameLen,name,offset,size}`+数据区（无压缩）；0014=视频、0018=场景束（scene.json 平铺） | **已实现**：`parsePkg` 接受 PKGM0014/0018/`v1.0`；实测用户包 55/127 条目解析并渲染（41/58 层）；插件宿主新增 `/raw` 流式路由；渲染器支持 `?pkgurl=`/`?pkgpath=`；**插件已把 scene 包交给渲染器 iframe 实时渲染** |
| **RE-22 动画层** | `additive/blendin/out/blendtime` 是死字段；生效语义=逐层"相对第 0 帧增量 × authored blend"叠加，各自相位 | **已实现**：`__animLayers` 解析 + 按 id 匹配动画 + 逐层增量混合（单层时保持原逻辑） |
| **RE-19 文本** | 字段表（pointsize/horizontalalign/verticalalign/maxwidth/padding/limitrows…）；位图只含 coverage；无描边/阴影 | **已实现**：`__text` 解析 + canvas+FontFace 光栅化（换行/省略号/对齐/背景卡）+ 纹理缓存（上限 96）+ 上报文本层统计。纯 JS 版（elysia font-render）经实测**字形取错**，仅作离线实验，不入设备路径 |
| **RE-20 粒子** | 151 个真实资产；缺失算子清单（按用量） | **已实现**：oscillatealpha/size/position、controlpointattract、turbulence、vortex、colorchange + `turbulentvelocityrandom` 初始化器；randomframe/sequence 的**精灵表帧布局**待 ZCode 补规范 |
| **RE-23 效果链** | `fit`=目标最长边像素；`unique`=跨帧持久+物理独占（不影响命名）；`format` 官方解析后无消费（全 RGBA8） | `fit` 我们的 `fboSizeOf` 已符合；`unique` 对我们（按效果命名空间缓存）天然满足；`format` 保持 RGBA8 |
| **RE-27 uniforms** | `g_TextureNMipMapInfo` 仅反射模糊 LOD；`g_TextureReductionScale` 官方 0 命中；`g_ViewportViewProjectionMatrices` 仅点光阴影 | 记为**无需实现**（附 0 命中证据） |
| **RE-28 脚本** | NSL 最小子集；文本是脚本最大消费者（387 层） | **已接入**：复用 elysia 的 `applySceneScripts`（4Hz），实测真实包把"早中晚"→"深夜/At night"；同步 text/alpha/color/origin 到层；`?noscript` 可关 |
| **RE-26/29/30** | 视频音频时间基准、bloom 后处理、混合模式全表 | 待办（P2） |

**回归**：bundle 语法 ✓、内置 shader 9/9 ✓、效果链 GLSL 128/128 ✓、mock-GL 12/12 ✓、层审计 5/5 ✓、坏帧 8/8 ✓、蒙皮刚性 0.0000 ✓、bundle=磁盘 ✓
**新增工具**：`internal-shader-validate.mjs`（内置 shader 真编译）、`text-render.mjs`（实验性纯 JS 排版）、`render-audit --pkg <容器>`（可直接审计 .mpkg）


---

## P-18（2026-09-12）FINDINGS-5 收尾：COPYBG 官方语义 + 工程健壮性

- **COPYBG（RE-23 官方）**：层 `copybackground=true` → 每个效果材质注入 `combos.COPYBG=1`（进程序缓存 key），
  且 bind 解析里 `_rt_FullFrameBuffer`/`_rt_default` → **层的屏幕拷贝**（每层 blit 一次）。
  此前是"把链输入换成背景拷贝"的近似，现在与官方一致（shader 端 `#if COPYBG` 采 `g_Texture2`）。
- **场景集成健壮性**：`applySceneViaRenderer` 前置渲染器可达性检查（启动 + 每 30s 探测，结果缓存；
  未知按可用处理，探测到离线才回退）→ 渲染器不在线时回退静态帧/内嵌 mp4，不再出现空白 iframe。
- **演示服务器看门狗**：`keep-demo-server.sh`（10s 探测、不可达即拉起）作为受管任务常驻 → scene 实时渲染不再因服务器挂掉而失效。
- **数据裁决**：扫描 28 个场景包的 general：`bloom:true` 仅 **2** 个（`bloomstrength/threshold` 是默认字段）、
  `camerashake:true` 4、`hdr` 2、`cameraparallax` 8 → **bloom/后处理优先级下调**（RE-29 暂不实现）。
- 回归：内置 shader 9/9、效果链 GLSL 128/128、mock-GL 12/12、层审计 5/5、.mpkg 审计 22 draw、坏帧 8/8、面板冒烟 5/5。

---

## P-19（2026-09-13）REVERSE-FINDINGS-6 落地：RE-31/32/33/34/35/37/38/40/41/42

> 依据：`$MPW_ROOT/REVERSE-FINDINGS-6.md`（RE-31…RE-42）。全部"先取证后实现"——
> 每条都先用真实语料/官方资产做字节级或像素级核对，再写代码，最后回归。

| 项 | 内容 | 证据 | 验证 |
|---|---|---|---|
| **RE-40 format 5** | `.tex` 格式 5 = **标准 BC3（alpha 块在前）**，容器声明宽高是实际载荷的 2× 或 4×。新增 `TEXTURE_FORMATS[5]`、`decodePixels case 5`、`texPayloadDims()`：按 **mip 头尺寸**解码、**不做裁剪**（裁剪会得到空白图） | 456 个 .tex 全量头解析：fmt5 载荷长度 = BC3(mip 尺寸) 精确相等 **163/163**；同名 fmt4/fmt5 双版本对照（opacitymap1/text_visso/流星/提示框…）alpha-first 的 MAE 62–95、corr 0.18–0.54，color-first MAE 92–240、corr≈0 → **排除 color-first** | `tex-fmt5-test.mjs` 4/4（163 纹理全部解码成功、非空 163/163；声明/载荷比 2×:143、4×:20） |
| **RE-31 精灵表** | `parseTex` 在**全部图像数据之后**解析 TEXS0001~3（仅 flags bit2=4 时存在）；`spriteInfo()` 取首帧轴长/纹理尺寸 → 帧宽高 UV + rate；`computeSpriteFrameUV()` 实现官方 `ComputeSpriteFrame`（floor/frac 行主序）；粒子批次顶点扩到 **stride 36**（uv2 + uv2B + blend + alpha），shader 端 `mix(tex(uvA), tex(uvB), blend)`；randomframe 关混合；精灵表 quad 纵横比取 rate | 官方资产 313 个 .tex 中 **52 个精灵表 / 1876 帧**；**像素级网格自相关**测得帧周期 = TEXS 帧轴长（bubble1 85 vs 85.3、explosion1 85.3/73、fish1 255/256）；满格表用"帧数=格数"交叉验证（jellyfish1 36=6×6） | `sprite-sheet-test.mjs` 17/17；`particle-sprite-verify.mjs` 10/10（帧随时间推进、跨行进位、randomframe 终身固定帧、blend 门控、非精灵纹理不回归） |
| **RE-32 文本几何** | 行高 = `fontBoundingBoxAscent+Descent`（**去掉 1.2×系数的近似**）；逐行 baseline = 盒顶 + maxIa + i×行高；verticalalign 三落点 + 盒内 clamp；size 回填（显式只增不减、limitwidth 尊重盒宽、无显式=maxwidth 或墨迹+padding）；padding 按 CSS 序展开（**修掉旧实现 2/3 值上下写反**）；省略号宽度驱动贪心减字；层尺寸 = 文本框（不再是墨迹尺寸） | RE-32 逐行（wer-ref WPTextLayer / DirectWrite 同源模型）；真实文本层样本：size 2439×346、padding 32（单值）、verticalalign=center | `text-layout-test.mjs` 21/21（直接从 demo.html 提取函数 + mock canvas 度量，逐项数值断言） |
| **RE-33 bloom** | 恒定 **4 pass**：extract（4-tap 对角均值 + LDR 硬线性斜坡阈值 + 去灰 / HDR Karis soft-knee）→ blurX（13-tap，间距 8×mip1 texel）→ blurY（8×mip2 texel）→ compose（scene+aux 直写、无混合、无 gamma）；尺寸 /4 → /8；`bloomhdriterations` 不参与；禁用以 u_Enabled=0 写黑（中性）；HDR 无浮点 RT 时退化 LDR | RE-33 内嵌 shader 逐字（13-tap 权重和≈1）；语料 28 包中 bloom=true 仅 1 个（3778592720，bloomstrength 0.32/threshold 0.78） | `bloom-verify.mjs` 14/14（pass 数/尺寸链/间距/uniform/HDR 退化/禁用中性）；内置 shader 编译 13/13 |
| **RE-34 音频** | sound 层 → `<audio>` + `AnalyserNode`；`engine.registerAudioBuffers` 接真实 FFT（重采样到 AUDIO_RESOLUTION_*，低频在前）；**默认不播**，`?audio=1` 开启 + 首次手势重试（WebView 自动播放策略）；只播第一条避免叠播 | 用户包实测 43 处 sound 层（音乐可视化壁纸，如 5a85…/d500…/f643…、松本文紀 flac 等） | `script-tolerance-test.mjs` 10/10（真值透传 / 无音频时静默全 0 不崩） |
| **RE-35 脚本容错** | **init 失败 → 永久禁用该实例**（不再每帧重试）；update 失败 → 只跳本帧、值保持、下帧继续；applyUserProperties 失败不重试；未实现 API 安全 shim：`engine.localize/localIZE`、`engine.systemInfo`、`registerAudioBuffers`、AUDIO_RESOLUTION_* 常量；`opts.onError(stage,err)` 上报（demo 去重计数进报告） | RE-35 官方错误矩阵（11 类调用点 / WPSceneScriptHost:8802-8812、:9503-9530） | `script-tolerance-test.mjs` 10/10（含"编译失败不崩宿主""undefined 保持 authored 值"） |
| **RE-37 透视** | 层 `perspective` 键官方**不消费**（不实现）；真正的透视相机由**粒子 flags 值 4** 触发：`depthScale = 1000/(1000−z)`、绕屏幕中心投影；配套补齐发射器第三维（boxrandom/sphererandom 的 z + `sign` 语义），此前粒子 z 恒 0 | flags=4 的层材质实测为 `presets/rainperspective`、`presets/snowperspective`（层名 "Rain perspective"）→ 值 4 = 透视；同时**修正 P-19 前的误读**：RE-31 的 noframeblending 是 bit2=2 不是 4 | `particle-sprite-verify.mjs`（z=100 → 放大 1.1111）；`?pp=0` 可 A/B 退回正交 |
| **RE-38 HSL** | 补齐 26–29（Hue/Saturation/Color/Luminosity）官方 `common_blending.h` 逐字实现（30 保留 Normal 兜底） | 60 个语料包 110 处 colorBlendMode 实测分布 0/1/2/6/11/12/17/21/23/25/31/32，**26–30 零使用** → 完整性补齐 | 内置 shader 13/13、效果链 GLSL 128/128 |
| **RE-41 回退** | 纹理缺失/解码失败 → **1×1 不透明白**（官方 fallback 视觉；此前回退透明=层消失）。仅对"声明了纹理名但加载失败"的非纯色层生效；`?whitefallback=0` 可退回透明 | RE-41 字符串闭环（dx11fallback 纯红、effect 缺失跳过、纹理缺失=白） | mock-GL 12/12；层审计 6 个包全通过 |
| **RE-42 预算** | 粒子 maxcount 上限 **20000**（超出丢弃而非停发）；文本纹理缓存 96 条 + **64MB** 字节双上限；文本框位图面积上限 2.2M 像素（超限缩位图、层尺寸不变）；纹理/FBO 4096 封顶沿用 P-15 | RE-42 阈值建议（wer-ref 守卫：maxcount ≤20000） | `text-layout-test.mjs`、`bloom-verify.mjs`、mock-GL 12/12 |

**新增工具/测试**（全部可复跑）：
`tex-format-verify.mjs`（全语料 .tex 格式+解码门禁）、`tex-fmt5-test.mjs`（RE-40）、`sprite-sheet-test.mjs`（RE-31 解析+像素网格）、
`particle-sprite-verify.mjs`（RE-31/37 端到端）、`text-layout-test.mjs`（RE-32）、`bloom-verify.mjs`（RE-33）、`script-tolerance-test.mjs`（RE-35/34）。

**本轮回归全绿**：`node --check` ✓、内置 shader **13/13** ✓、效果链 GLSL **128/128** ✓、mock-GL **12/12** ✓、
精灵表 **17/17**、粒子精灵表 **10/10**、文本几何 **21/21**、bloom **14/14**、脚本容错 **10/10**、
坏帧 **8/8**、蒙皮刚性 **0.0000**、6 个测试壁纸层审计全通过、bundle=磁盘 ✓。

---

## P-20（2026-09-13 第二轮）定位"位置渲染错误" + 预留扩展接口

### 1. 定位结论（详见 `POSITION-FINDINGS.md`）

用户以 `Testphoto/TP8/Screenshot_2026-09-08-00-29-59-64_*.jpg`（凯尔希 3719111841 官方效果）为标准。
用早前按官方预览逐层标定的 `refrender-3719111841.json` 当裁判：

| 实现 | 22 层中心误差 |
|---|---|
| **elysia**（`elysia/we-renderer/core.js` `resolveTransform` + `_attachmentOffset`） | **19/22 层 Δ=0–3px** |
| 我们（父链合并 + demo 的 anchorsOf/mkOff） | 中位 **782px**、最大 1676px，误差按锚点名分组恒定 |

→ 根因：**附件（attachment）锚点骨骼位姿的口径不同**，外加两处自造补偿
（渲染器 `u_Origin = origin − u_Scale⊙mesh.__center` 的网格中心补偿；demo 的 `__usePiv` 附件 pivot）。
新增工具：`layer-rect-check.mjs`（逐层实绘矩形 vs 标定表）、`elysia-transform-check.mjs`（elysia 复算对照）。

### 2. 本轮代码改动

| 改动 | 文件 | 说明 |
|---|---|---|
| 附件 pivot 改为**白名单** | `demo.html` | 原本 `__usePiv = true` 对所有带 puppet 的附件生效（同文件注释已指出这会让"头发甩出屏外"）；现默认只对 `眼睛组合`，`?piv=1` 全开 / `?piv=0` 全关 |
| 网格中心补偿开关 | `core/we-scene-bundle.js` | `MCC_ENABLED`：`?mcc=0` 关闭（=官方"顶点即模型空间"直算）、`?mcc=1` 强制开启（旧行为） |
| 插件设置 `sceneExtUrl` | `dsh-mpkg-wallpaper/lib/client.js` | 可选设置 → iframe 的 `extbase`（外部扩展钩子入口） |

### 3. 预留的可插拔接口（"现在没用上、将来可能用得上"）

- **渲染器钩子注册表**：`core/we-scene-bundle.js` 导出 `registerMpwHook(slot, fn)` / `runMpwHook(slot, args)` /
  `MPW_HOOK_SLOTS`，槽位 `resolveTexture`（缺失纹理接管，已接线）/ `layerRect` / `shaderSource` / `postFrame`（已接线）/
  `stats`（已接线）。任何钩子抛错或返回 null = 不接管，画面不受影响。
- **页面侧加载**：`demo.html` 支持 `?exthooks=<url[,url]>` 与 `?extbase=<base>`（自动取 `<base>/` 索引）。
- **服务器路由（已保留）**：`GET /ext`（索引 JSON）、`GET /ext/<name>`（模块，CORS `*`）；目录 `we-scene-demo/extensions/`。
- **文档**：`we-scene-demo/EXTENSION-HOOKS.md`（槽位表 + 接入方式 + 典型用途）；示例 `extensions/_example-hook.mjs`。

### 4. 测试

`node --check` ✓、内置 shader 13/13 ✓、效果链 GLSL 128/128 ✓、mock-GL 12/12 ✓、精灵表 17/17 ✓、
粒子精灵表 10/10 ✓、文本几何 21/21 ✓、bloom 14/14 ✓、脚本容错 10/10 ✓、bundle=磁盘 ✓；
服务器路由 `/`、`/bundle.js`、`/ext`、`/ext/<不存在>`(404)、`/weassist/*`、`/pkg/*` 全部符合预期。

---

## P-21（2026-09-13 第三轮）实现 alignment 偏移（WER-ALIGN A3/A4）

### 1. 语料取证（先有数字再写码，工具 `alignment-scan.mjs`）

扫描 93 个包（46 有 scene.json；allwallpaper/** + ~/.dsh-mpkg-wallpaper/*.mpkg），objects 总数 **1467**：

| alignment 取值 | 层数 | 说明 |
|---|---|---|
| 缺省（=center） | 1407 | 绝大多数 |
| bottom | 26 | 3660962877（27 层 UI，独占 25）、洁尔佩塔_4 |
| right | 16 | 3326873240 / 3327063360 / 3544152633 / 砂狼白子 等 |
| left | 13 | 伊蕾娜 / 夜莺night / 庄方宜 等 |
| bottomleft | 2 | 3544152633、3660962877 |
| top | 1 | 3660962877 |
| 显式 center | 2 | — |

→ **非 center 共 60 层（4.1%），17 个包**；全部是 solid/UI 层（无 puppet mesh），且存在负 scale（如
3544152633 `playervolumebar` scale −0.095）与"父 align=right 带子层"（3326873240 层 140→148/155、155→156/159）。

### 2. 实现要点

| 改动 | 文件 | 说明 |
|---|---|---|
| **A3 偏移公式**（第三方参考实现 `wer-ref WPImageAlignment.hpp:12-38`，GPL-2.0-only，仅行为对照、未取代码） | `core/we-scene-bundle.js` | 导出 `alignmentOffsetForToken(alignment, w, h)`：left→+w/2、right→−w/2、top→−h/2、bottom→+h/2（**y-up 编辑器空间**，token 子串叠加，`bottomleft`=两项之和）；size 传有符号 `size×scale` 时负 scale 自动翻转（= 局部矩阵 T(align) 内乘 S）。compositeLayer 已有的 quad 空间式 `(0.5−a)·(w,h)` 与该 helper 经 y 取反后逐项相等（测试互证）；偏移在 `S(w,h)` 之后后乘 → 受本层缩放/旋转影响（第三方参考实现 wer-ref `SceneNode.cpp:20` 的局部偏移语义，仅行为对照）。**空间约定**：parseScene 的 `PROJ_H−y` 翻转在解析期，compositeLayer 在翻转后的 y-down 空间同步换算（y-up top→−h/2 ≡ y-down +h/2） |
| **A3 开关** | `core/we-scene-bundle.js` + `demo.html` | `?align=0`（`opts.align===false`）→ 视作 center，复现旧行为；默认开启。`preview.mjs` 同式接线（`ALIGN=0` 环境变量复现旧行为） |
| **A4 父链剔除** | `core/we-scene-bundle.js` | 第三方参考实现 wer-ref（`WPNodeTransformResolver.cpp:103` `RemoveImageAlignmentOffsetFromModel`，GPL-2.0-only，仅行为对照）子层继承父的 **authored pivot**（父的 alignment 网格偏移被后乘 T(−align) 剔除）。我们 alignment 偏移只在绘制期作用于本层网格、从不并入 origin → `parseScene` 父链合并用的 `pc.origin` 天然就是 authored pivot，**结构上等价于官方剔除后继承**；注释固化防止后续叠加父 alignment |
| **layer-rect-check 增强** | `layer-rect-check.mjs` | 实绘矩形纳入 alignment 偏移（含 y 取反、有符号 size）；新增 `--align=0`（旧行为）与 `--json`（机读，末行 `##JSON##`，供测试消费） |
| **取证工具** | `alignment-scan.mjs`（新增） | 全语料 alignment 分布统计（复用 feature-scan.mjs 的遍历方式） |

### 3. 验收（`alignment-test.mjs` 新增，**184 pass / 0 fail**）

- **① 纯数学 48**：9 种对齐 × 3 组 size 手算期望值（4000×2300 / 128×128 / 700×512）vs `alignmentOffsetForToken`；
  缺省/未知 token→(0,0)；负 scale 翻转；compositeLayer quad 式 ≡ helper（y 取反互证）。
- **② A4 纯数学 3**：合成父链（pivot 100,200 + R30°·S(2,3)）子层合并 origin = 官方手推值 (96.60254, 1754.11543)；
  父 align right↔center → 子层 origin **逐位相同**；两级非 center 祖先 → 孙层 origin 不变。
- **③ 语料**：3660962877（127 层）修复前后 `--align=0` 矩形差 = 预期偏移（27 个非 center 全命中）；
  3719111841（全 center）43/43 层矩形零变化；3326873240 父 140/155 align=right 的 4 个子层 Δ=自身偏移（非父偏移）。

### 4. 回归（全绿）

`node --check` ✓、mock-GL **12/12** ✓、render-audit 3719111841 mesh **5/5** ✓、坏帧 **8/8** ✓、
效果链 GLSL **128/128** ✓；6+1 个测试包 layer-rect-check 新旧对比：

| 包 | 层数 | 不变 | 按公式移动 | 异常 | 非 center |
|---|---|---|---|---|---|
| 3719111841 | 43 | 43 | 0 | 0 | 0（回归判据：任何矩形不变 ✓） |
| 3778592720 | 5 | 5 | 0 | 0 | 0 |
| 3554161528 | 37 | 37 | 0 | 0 | 0 |
| 3544152633 | 70 | 67 | 3 | 0 | 3 |
| 3327063360 | 69 | 65 | 4 | 0 | 4 |
| 3326873240 | 62 | 58 | 4 | 0 | 4 |
| 3660962877 | 127 | 100 | 27 | 0 | 27 |

---

## P-22-ATTACH（2026-09-13 第四轮）附件/父链变换移植 elysia（docs/archive/ZCODE-PROMPT-ELYSIA-DIFF）

> 审计报告：`we-scene-demo/ELYSIA-DIFF-AUDIT.md`（12 子系统"我们 vs elysia vs 官方"逐条判定+证据）。
> 定位结论：`POSITION-FINDINGS.md`（已更新为"已修复+新数字"）。
> 并行说明：与 P-21（alignment）互不重叠——本轮只动附件锚点/父链合并/角度单位/y 翻转/MCC 默认值。

### 修复的五处（每处都有数字证据）

| # | 错误 | 证据（修复前） | 修复 | 回退 |
|---|---|---|---|---|
| 1 | 附件锚点骨骼位姿口径（自算 `_bindRT/_animRT0`+piv/ayFlip 补丁） | 19 附件层按锚点名恒定偏移（头部 −509,+593…），中位 782px | 新文件 `core/attach-transform.mjs`：elysia 四函数逐字移植（`_mdlAnchors`/`_puppetBoneFinal`/`_attachmentOffset`/`resolveTransform`+`_parseMdl`/`_sampleAnimRT`），parseScene 经 `opts.attachCtx` 调用 | `?att=legacy` |
| 2 | scene.json angles 当度（×π/180），实为**弧度** | 语料 63 处非零角=π/π/2 值；lwe CImage.cpp:1097 注释"already in radians"；wer-ref AngleAxis 直收 | 合并与粒子层角度直收弧度 | —（第三方参考实现所实现的语义） |
| 3 | demo hier 预合并 + parseScene 再合并 = 双重变换 | 探针：299 底发 (2284,342)→(3454,230) | 默认路径删除预合并（parseScene 单一合并） | `?att=legacy` |
| 4 | "animL 层不翻转"例外 | 3554161528 人物层：elysia(官方)=y595，例外=y1565 | 所有层统一 `PROJ_H−y` 翻转一次 | `opts.legacyAnimY`（legacy 自动带） |
| 5 | 网格 bbox 中心补偿（自造，官方无此步） | 同父级各网格层按各自 bbox 偏移；眼睛组合虚差 568px | `MCC_ENABLED` 默认**关**（=官方直算） | `?mcc=1` |

### 验收（`node attach-transform-test.mjs`，9/9 全绿）

```
T1 移植保真度：6 包 408 层，我们 vs elysia resolveTransform maxΔ=0.00482px（<0.01）
T2a 标定层 Δ<5px：21/22（elysia 基线 19/22）
T2b 中位中心误差：0.0px（修复前 782px）
T2c 最大 79px（115 眼睛组合=眨眼动画相位差，非变换错误：GPU 路径解析落点 Δ=1px）
T3 无锚点层 origin 24/24 逐位不变
T4 弧度语义手推 (0,1100) = 实测 (0.0000,1100.0000)
T5 主体 MDL 骨骼6/动画1、MDAT 锚点3（头发附件锚点在长发3 的 MDL）、偏移表 19 层
```

`layer-rect-check.mjs`（升级：默认带锚点 + 网格层按实绘 bbox 计）：
`node layer-rect-check.mjs 3719111841 --refrender` → 中位 **0px**、最大 79px；
`--noattach` 复现修复前（中位 782px）；6 测试包全部无 ≥200px 的新离谱层
（408 层与 elysia 逐层 A/B Δ=0 是更强的等价证明）。

### 其他改动

- `layer-rect-check.mjs`：`--noattach` 开关；网格层实绘矩形（origin+scale·meshBBox，官方/elysia 同式）。
- `preview.mjs`：parseScene 传入 attachCtx（REFR=0 父链模式需要锚点）。
- `server/we-scene-demo-server.mjs`：新增 `/attach-transform.mjs` 静态路由（bundle 的浏览器端 import）。
- `demo.html`：默认附件路径接 attachCtx；anchorsOf/mkOff/piv/hier 预合并/逐帧附件动画全部仅 `?att=legacy`。
- `alignment-test.mjs`：② 用例父角度 `'0 0 30'`→`π/6`（弧度定案后数值不变，手推注释已注明证据）。

### 回归（全绿）

`node --check` ✓、内置 shader **13/13**、效果链 GLSL **128/128**、mock-GL **12/12**、精灵表 **17/17**、
粒子精灵 **10/10**、文本几何 **21/21**、bloom **14/14**、脚本容错 **10/10**、坏帧 **8/8**、tex-fmt5 **4/4**、
render-audit mesh **5/5**、alignment **184/184**、attach-transform **9/9**。

## P-22（2026-09-14）RE-REMAINING-4 落地：多图精灵 / 音频语义 / 视差鼠标向量修正 / fillmode 四分支 / C12 / 可见性边角

> 依据：任务书 `docs/archive/ZCODE-PROMPT-RE-REMAINING-4.md`（P0-1 附件/父链 elysia 数学归 `docs/archive/ZCODE-PROMPT-ELYSIA-DIFF.md` 专线，本批不做）。
> 每项先取证（真实语料/官方资产/字节）→ 实现 → 回归；新增 4 个测试文件，全量 **15 项套件全绿**。

### 1. P0-2 多图精灵（RE-31 剩余，`multi-sprite-test.mjs` 28/28）

- **取证**：官方资产 313 tex + 语料 456 tex 全量 TEXS 解析（三版本：v1 整数像素/v2 浮点/v3 图集头），
  **imageId 不恒 0 的多图精灵 = 2 个真实资产**（夜莺·alone「合成1_00000.tex」151 帧/7 图=6×3752²+1×752²、
  每图 5×5 帧网格；夜莺·firefly「背景合成1_00000.tex」53 帧/3 图）——先前只支持单图 UV 网格。
- **实现**（官方语义=逐帧换纹理，`CustomShaderPass.cpp:1296-1299 ImageSlotsRef.active=imageId`）：
  - `parseTex` 已有 imageId；新增 `decodeImageMip0(tex,idx)`（跨槽解码，槽 0 保留填充裁剪）、
    `spriteInfo.multiImage`、`spriteMultiImages(tex)`（整组解码，**96MB 预算超限→按 2 的幂抽点降采样**，
    本资产 339MB→85MB）、`spriteFrameImageRects`（帧矩形按**所属 image 尺寸**归一，官方
    WPTexHeaderParser.cpp:292-315 slotDimensions 域；跨 image 的 cur/nxt 强制 blend=0）。
  - 粒子绘制：按 cur 帧 imageId **分组、各组绑定各自纹理分批 draw**（atlas 方案会超 4096 GPU 上限，弃用）；
    纹理按 texObj 缓存；顶点 UV 改**矩形内插值**（单图路径保持 base+offset 加法不变）。
- **验证**：151 帧/7 图解析、5×5 网格 UV 步进（750/3752）、跨图 blend=0、尾帧 clamp、
  3752² 跨槽解码、image0≠image3 内容、单图回归门（bubble1+合成用例）全部命中。

### 2. P0-3 音频语义收尾 + getVideoTexture（`audio-semantics-test.mjs` 20/20）

- **sound 层**（第三方参考实现 wer-ref WPSoundParser.cpp，仅行为对照）：重写 demo.html 音频块——**每层一条流**（不再只播第一条）；
  `autoplay = visible && !startsilent`（门控封装进 makeSoundElement）；`playbackmode`
  loop（缺省，`audio.loop`）/ single（`loop=false`+ended 即停）/ random（ended →
  `randint([min(mintime,maxtime),max(...)])×1000ms` 后换曲、**避免同曲连播**，单文件不调度）；
  volume = 层值 × **声明式绑定**（`volume:{user,value}` 实测语料即此形态），挂在 4Hz 脚本节拍实时生效。
- **getVideoTexture**（第三方参考实现 wer-ref WPScriptRuntime.cpp:615-656，仅行为对照）：scene-scripts.js 引擎新增
  `getVideoTexture(name)` —— 宿主句柄透传、无视频纹理返回 **noop 对象**（play/pause/stop/
  setCurrentTime/isPlaying()=false，官方 __makeNoopVideoTexture 同款）；opts 透传链补齐
  （applySceneScripts→runScriptValueCached→compileScript 两处）。补平台探测 shim
  `isDesktopDevice/isMobileDevice/isWallpaper/isScreensaver`（官方 ：895-905 同语义）。

### 3. P0-4 WER-ALIGN 剩余（A3/A4 已由 P-21 完成，本批补以下三项 + 一处**正确性修复**）

- **视差鼠标向量修正（B6/B7 关键补丁）**：旧 `parallaxState = client/size − 0.5` 且**未乘设计画布、
  y 未取反** → 鼠标视差量级差 3840 倍且方向错（官方
  `Scaling(1,−1)·(0.5−mouse)∘ortho·influence`，WPNodeTransformResolver.cpp:154-156）。
  现存归一化鼠标，消费端换算 `(0.5−m)·ortho·influence`；**官方公式成为默认**，
  `?parallax=legacy` 保留旧 `(depth+amount)×disp` 做 A/B（P-17 的官方式此前无开关接线，实为死开关）。
  单元算例：满幅背景 depth −0.17 → 鼠标满幅位移 +28.56px（不再飞出画面）。
- **C12**：效果链**全部中间 pass 强制 `setBlend('normal')`**（wer-ref SceneImageEffectLayer.cpp:331；
  此前照抄材质 blending → 半透明材质在链内叠鬼影/alpha 累积错）。
- **B1 fillmode 四分支补全**：buildCamera 此前只有 ASPECTCROP cover 分支；现四分支齐备
  （STRETCH/ASPECTFIT/ASPECTCROP/CENTER，CENTER=输出像素，wer-ref :1564-1570），
  来源 `opts.fillmode` 或 `scene.general.fillmode`（语料 0 次 → 缺省恒 ASPECTCROP，16:9 逐位不变）。
  B2 zoom（P0-G 已有）纳入测试。
- **C10 结论**：语料 fullscreen=0/passthrough 仅 8 处字符串（非效果层场景）→ **结构性 no-op**，
  fullscreenlayer 材质别名保留作回退；不实现（附计数证据）。

### 4. P0-5 cropoffset（`render-closeout-test.mjs` 22/22 内）

- 结论维持 RE-02：exe 字节级 0 命中、运行时不消费；语料 79 次出现全在 models/*.json（编辑器侧）。
- **实现=保持忽略**，新增回归断言：带/不带 cropoffset 的 parseScene 输出逐位相同。

### 5. P1 收尾

- **RE-39 blockalign**：语料键 436 处但 **true 值 0** → 结论"不实现"，解析保留字段（证据入测试）。
- **P1-7 HDR 门控**：`EXT_color_buffer_half_float` 纳入（Adreno 常只暴露 half 变体）；
  诚实注记：本管线场景副本取自 RGBA8 画布，**绝对 HDR 需整场景先渲进浮点 RT**（管线级改造，另立任务）。
- **P1-8 预算核对**：FBO 等比 clamp 4096 ✓（P-15）、粒子 20000 ✓（P-19）、文本 64MB/96 条 ✓（P-19）、
  **单纹理解码 >64MB 二次降采样：此前无 → 本批经 spriteMultiImages 预算机制覆盖多图组**（单图仍走 4096 clamp）。
- **P1-9 可见性边角**：父隐藏→子隐藏**跨两级级联**、combo 二态（"0"/"1"）、无属性表 legacy 兜底、
  **动画驱动 visible**（parseScene 已解析关键帧，渲染循环此前未消费 → 新增 `__layerVis` 每帧求值，>0.5 可见）。
  语料：非 center 对齐 60 层（P-21 已修）、combo/bool 条件已在线。

### 6. 新增工具与全量回归

新测试：`multi-sprite-test.mjs`（28/28）、`audio-semantics-test.mjs`（20/20）、
`camera-fillmode-test.mjs`（17/17）、`render-closeout-test.mjs`（22/22）。
**全量 15 项全绿**：`node --check`（bundle+scene-scripts）✓、内置 shader **13/13**、GLSL **128/128**、
mock-GL **12/12**、精灵表 **17/17**、粒子精灵 **10/10**、文本 **21/21**、bloom **14/14**、脚本容错 **10/10**、
坏帧 **8/8**、tex-fmt5 **4/4**、render-audit mesh **5/5**、alignment **184/184**、蒙皮刚性 **0.0000**、
CPU 预览 4 包（3719111841/3544152633/3660962877/3326873240）出图正常，layer-rect-check 校准场景
**中位 0px**（零漂移）。

## P-23（2026-09-14 第五轮）MERGED-3：插件侧场景体验 + 诊断开关文档收口（ZCODE-MERGED-3-PLUGIN-DOCS.md 全部两项）

> 只碰插件 `dsh-mpkg-wallpaper/lib/*.js`、文档、一个校验脚本 + `demo.html` 少量追加；**不改渲染语义、不改 core/we-scene-bundle.js**。

### 第 1 项 H：插件侧场景体验

1. **场景壁纸缩略图 = 渲染器首帧（离线可用）**
   - demo.html 首帧完成（`__first`）与第 90 帧（纹理齐全后）各 POST 一次 480×270 jpeg(q0.8) 到
     `?thumbpost=<url>`（插件 applySceneViaRenderer 拼入 = 宿主 `/custom-scene-thumb`；text/plain 简单请求免预检，
     `credentials:'include'` 过 DSH cookie 鉴权）。失败仅 logf，绝不影响渲染。
   - 宿主新路由 `/custom-scene-thumb`（POST 落盘 + GET 服务）与 `/library-scene-thumb`（GET）：
     身份 `custom|<folder>|<file>` / `library|<ltoken>|<file>`（POST 侧 pkgurl 自动解析出同一身份）→
     `~/.dsh/.dsh-mpkg-wallpaper/thumbs/<sha256前16>.jpg`；**LRU 200 张 / 64MB**（GET 命中 touch 60s 节流，POST 后裁剪）。
   - GET 三级回退（响应头 `x-mpw-thumb-src` 标注来源）：缓存 → `extractSceneFrame` 静态帧 → 目录预览图 → 404。
     **选择直连 POST 而非"渲染器服务器侧缓存+转发"**：少一跳、渲染器离线时宿主缓存仍在、协议与 /raw 同源同鉴权。
   - 列表接线：custom 扫描 scene 项与 Steam 库 scene 项缩略图改走 thumb 路由（背景静态帧链路保持原样不动）。
   - `?mpwdiag=1` 报告新增 `thumbSources[]`：对列表注册的场景缩略图逐项 GET 读 `x-mpw-thumb-src`（cache/frame/preview）。
2. **sceneExtUrl 设置项 UI（预留接口可视化）**：`lib/client.js` 的 `applySceneViaRenderer` 此前已读该设置拼
   `extbase`，面板无入口 → 在「场景渲染」分组新增输入框（placeholder `http://127.0.0.1:8899/ext`）+
   「保存」（空值=清除）+「测试」（fetch `<url>/` 索引，成功显示 `hooks=N slots=[...]`，失败显示 HTTP 错误码/异常）。
   i18n：`scnRender.extUrl*` 中英双语（顺带补齐 en 缺失的 scnRender 组旧键）。
3. **诊断开关速查区（与第 2 项 2.3 合并实现，一套 UI）**：见下 2.3。

### 第 2 项 J：诊断开关文档收口

1. **diag-flag-check.mjs**（新校验脚本）：从 `core/we-scene-bundle.js` / `demo.html` / `elysia/**/*.js` /
   `dsh-mpkg-wallpaper/lib/client.js` 抓取真实解析点（绑定 location.* 的 URLSearchParams get/has/getAll、
   `new URL(...).searchParams`、正则 `[?&]name=`、白名单 localStorage 键），与 README 主表双向比对
   （文档有代码无=陈旧；代码有文档无=漏写），`--fix-hint` 打建议行、`--list` 只列抓取结果；产出 `diag-flags.json`。
2. **README-DIAGNOSTICS.md**（新）：56 个开关（T3 当轮数字；随后 MERGED-2 补齐 cam/hdr/hdrblur/perf/perfreport/selfcheck 六项 → **现为 62**，`diag-flag-check` 62==62）（脚本抓取为准，含任务书未列的 `camera/eyedy/inlinefrost/thumbpost/autorun/autorundone`），
   六组：①渲染语义 ②诊断与审计 ③数据源与模式 ④降噪与上报 ⑤插件侧 ⑥elysia CPU 渲染器；
   列 = 开关|取值|默认|作用|什么时候用|回退/风险|解析位置（文件:行）。
   **以代码为准的结论**：`diag`/`mpwcss` 已移除、`embed` 发送未消费 → 移入"历史开关"附录（主表外）；
   `perf`/`selfcheck` 归合并任务书 ②，落地前不提前登记。
3. **面板速查区（1.3+2.3 一套 UI）**：设置 → 测试 → 场景渲染分组内新增「诊断开关速查（渲染器）」折叠区：
   常用 10 个（att/mcc/piv/align/parallax/audio/whitefallback/hier/isolate/audit，含用法一行说明 + 一键复制 URL 片段，
   clipboard API + execCommand 兜底）。数据源三重保障：渲染器在线 `GET /diag-flags.json`（demo server 新增静态路由）→
   离线用 client.js 内置副本 `MPW_DIAG_FLAGS_FALLBACK` → panel-smoke 断言「字典 zh/en 集合 == JSON common == 内置副本」。
4. **收口**：`TESTING.md` 建最小版（含 `node diag-flag-check.mjs` 行）；`PATCHES.md` 本节；nightwork-report 追加；
   `PLUGIN-BUGS-TRACKER.md` 新批次一行。

### 验收（全绿）

```bash
node diag-flag-check.mjs        # ✓ 代码 56 开关 == README 主表 56 行，0 差异，退出码 0
grep -c '^| ' README-DIAGNOSTICS.md   # 67 = 56 开关行 + 6 分组表头/分隔行×… （±分组表头符合任务书口径）
node tools/panel-smoke.mjs      # 5/5（含新增「场景体验断言」：输入框在树 + 三源集合一致 10 个常用开关）
node --check lib/client.js && node --check lib/index.js   # 语法 ✓
bash "$MPW_ROOT/update-plugin.sh"   # 同步（不重启 dsh）
```

### 完成项 / 未完成项 / 下一步

- 已完成：任务书两项全部（1.1/1.2/1.3 + 2.1/2.2/2.3/2.4）。
- 未完成：无。备注：demo server 增加 `/diag-flags.json` 静态路由一行（任务书"只改"清单未列，
  系 1.3"插件读取渲染"在线数据源所需，属白名单式静态服务追加，不改渲染语义）；渲染器首帧上报用
  `?thumbpost=` 参数由插件拼入，渲染器离线时列表回退静态帧链路，行为不劣于改前。
- 下一步：真机验证——①应用一个场景壁纸后停掉渲染器（:8899），列表缩略图仍显示且 `?mpwdiag=1` 报告
  `thumbSources[].src == "cache"`；②sceneExtUrl 填 `http://127.0.0.1:8899/ext` 点「测试」显示 hooks=0；
  ③面板速查区复制 `?parallax=legacy` 可用。

## P-24（2026-09-12）MERGED-1 第 1 项：眨眼/骨骼相位对齐 + fps 口径定案（ZCODE-MERGED-1-RENDER-CORE.md ①G）

> 交付：`blink-phase-test.mjs`（新，15/15）；`core/attach-transform.mjs` fps 直读 + 采样寻址官方化；
> `layer-rect-check.mjs --t=<秒>`。全量回归全绿，默认输出逐位不变（layer-rect-check 仍中位 0px/最大 79px）。

### 1. fps 口径定案 = 每动画自带 framerate（官方语义）

- 证据：wer-ref `WPMdlParser.cpp:698` `animation.fps = f.ReadFloat()`（MDLA 头逐动画 f32）；
  `WPPuppet.cpp:92-93` `frame_time = 1/fps`、`max_time = length/fps`；`:216-222` Loop 采样
  `cur = fmod(cur, max_time); rate = cur/frame_time; frame_a = floor(rate) % length`；
  rate 乘在层时间上（`WPPuppet.cpp:355` `current_time += time * layer.anim_layer.rate`）
  → 帧 = `floor(t·fps·rate) mod length`，fps 取动画自身。lwe-ref 不解析 MDLA 动画（bind 姿态直绘），无第二口径。
- 实测：全语料（107 容器 allwallpaper + mpkg + wallpapertest1，再加 mpkg_work//tmp 提取物）
  **48/48 动画 fps=30.0**、每 MDLA 单动画 → 两种口径在现存数据上**逐位一致**（测试 T1/T4a 断言）。
- 落地：`parseMdl` 直读 fps 字段存入 `anim.fps`（旧实现靠搜索 `[f0 41]`=30.0f 字节序特征跳位，
  fps≠30 的动画会搜过头炸掉整个头解析——潜伏 bug 顺带修掉，读出不合理时回退旧搜索）；
  `puppetBoneFinal(mesh, t, layers, opts)` 用 `anim.fps`，`opts.fps` 强制口径（=30 复现旧行为），
  `attachmentOffset`/`buildAttachOffsets` 经 ctx.fps 透传。demo 无需改动（attachCtx.time=0 → 帧0）。

### 2. MDLA 轨道布局字节级定案 + 采样寻址官方化（修掉"坏尾帧"的真身）

- 官方布局：每轨 `u32 flags + u32 byteSize + (byteSize/36)×(pos3,angle3,scale3)`（`WPMdlParser.cpp:706-725`）。
  实测眼睛组合 14/14 轨、主体 6/6 轨的**帧0 局部 pos/angle/scale = bind**（导出精度 ≤2e-3）。
- 旧 9 列交错公式的位置列 `36·floor(2b/9)+4·((2b)%9) = 8b` 恰好补上 b 个 8B 轨头 → 与官方逐行同址（恒等式，测试 T3a）；
  但 ①旋转列对骨 ≥5 晚 1~2 行（`(floor(2b/9)+floor((2b+5)/9))·36+4·((2b+5)%9) − (8b+20) = 36·lag`）；
  ②旧式把 shift 折进帧号取模 `(frame+shift)%N`，周期末尾帧回绕读到轨头/邻轨字节——
  **RE-03 记录的"眼睛 [237,238,239]、主体 [178,179]、耳朵 [0,298,299] 坏帧"是寻址回绕伪影，数据本身没坏**。
- 落地：`sampleAnimRT` 寻址官方化 `pos = segs[b]+帧·36+8b`、`rot = +20`（无行移位、无回绕、不读填充行；
  第三方参考实现 wer-ref `WPPuppet.cpp:218-222` 同语义）。attach-transform-test T1（对 elysia 六包 408 层 maxΔ<0.01px）不回退
  ——帧0 附近各行角度恒定，两口径数值一致。

### 3. 核心判定：79px 残差**不是**眨眼相位差（旧结论基于坏管线数据）

- 干净管线（帧0=bind + 官方矩阵链蒙皮 + 附件原点随 t）：眨眼(8s)×呼吸(6s) 公倍 24s 全周期扫描，
  Δ(中心) 恒 ≈79.4px，**无任何帧 <5px**（T4c）。t=0 值与 layer-rect-check 静态残差吻合（T4b）。
- 眨眼幅度上界：蒙皮 bbox 中心最大位移 51.5 设计 px @ 帧200（T5b），且 **y 方向与残差所需相反**
  （眨眼下移 +45px，残差需上移 −76px，T5c）——相位解释在数学上不可能。
- ELYSIA-DIFF-AUDIT 旧注"帧0 中心 −815.2、高 253→399"源自坏管线（RT 链 vs bind 矩阵链在带局部旋转
  骨骼上不一致——眼睛网格帧0 差 391.9 模型单位，测试 NOTE 有记录 + elysia `_matInvertRow` 语义 +
  尾帧回绕），作废。
- **待定（真实根因方向）**：同锚点的 右眼上眼睑/左眼皮 ≤1px，唯独眼睛组合差 79px；官方标定矩形
  （169.8×277.9 设计 = 245×401 模型）高度超过该网格任何姿态的最大可绘高度（bind 253 / 眨眼峰值 329），
  且官方预览（preview.gif 192×192 方形投影）映射关系未定 → 需官方编辑器投影/导出侧证据才能闭合。
  已知事实锚点：附件原点被 111（同锚）钉死 ±1px；材质/纹理/UV/网格块解析均唯一且正常。

### 4. 回归（全绿）

`node --check` ✓、blink-phase-test **15/15**、内置 shader **13/13**、GLSL **128/128**、mock-GL **12/12**、
精灵表 **17/17**、粒子 **10/10**、文本 **21/21**、bloom **14/14**、脚本 **10/10**、坏帧 **8/8**、tex-fmt5 **4/4**、
alignment **184**、attach-transform **ALL PASS**、多图精灵 **28/28**、音频 **20/20**、fillmode **17/17**、
closeout **22/22**、render-audit mesh **5/5**、skin-order **0.0000**、layer-rect-check 中位 **0px**（`--t=1.5` 生效：中位 23px）。

## P-25（2026-09-12）MERGED-1 第 2 项：相机节点动画（WER-ALIGN B4/B9）

> 交付：`camera-scan.mjs`（取证工具）+ `camera-node-test.mjs`（新，ALL PASS）+ bundle 三处
> （parseScene cameraNode / evalPropAnimation / buildCamera cameraPose + 渲染循环逐层矩阵选择）+ demo `?cam=` 开关。

### 1. 取证先行（camera-scan.mjs，107 包）

| 项 | 数字 | 判定 |
|---|---|---|
| scene.camera（3D 模型相机） | 60 包有、eye 非默认 59 包、**带 paths 关键帧 0 包** | 无 3D 运镜用例 → 3D 路径不做（elysia camera.js 的 paths 系统无语料支撑） |
| camera 类型对象 | 23 个/23 包（origin: script×21 + 动画×2；zoom 全 23 声明：user属性×21 + 动画×2） | **3554161528 是唯一 origin+zoom 动画驱动包**（2 处动画同一对象）→ 实现+测试目标 |
| general.fov/nearz/farz | fov 全 50、nearz 全 0.01、farz 全 10000（0 包非默认） | B9 透视联动不做（无 3D 场景；FOV=atan(h/1000/2)·2 无消费者） |
| 相机对象父链 | 无层挂在相机对象下；3326873240/3327063360 的对象为脚本（用户滑块）驱动 | 脚本驱动 → 相机节点 inert（脚本引擎不写相机对象，静态基值是编辑器残留 ortho/2+偏移，应用它会让 21 包画面剧变） |

### 2. 实现（官方语义）

- **采样**：`evalPropAnimation(propObj, t)`（新导出）= elysia core.js `_resolveAnimations`+`_animValueAt` 逐式移植：
  options.fps/length/mode（语料相机动画 fps=18、mode=single——extractAnimKf 的硬编码 30+恒循环会播成 1.67 倍速）、
  c0/c1/c2 逐通道、back/front 贝塞尔切线牛顿迭代、relative 基准偏移。测试 T1d：91 帧 (eyeX,eyeY,zoom) 与 elysia **maxΔ=0.0**。
- **parseScene**：`scene.cameraNode = { id, camera, fov, originRaw, zoomRaw, active }`（首个 camera 对象；
  active = origin 有 animation 关键帧）。inert 节点保留诊断信息但不产生姿态。
- **buildCamera**：`opts.cameraPose={x,y,zoom}` → `view=平移(−x,+y)`（第三方参考实现 wer-ref SceneCamera.cpp:103-105
  `Ortho(±framed/2z)·inverse(节点帧)`，节点=ortho/2+origin（Scene.cpp:542-552）在我们 y-down 顶点空间的展开式，
  与 elysia `_viewShift` 的 (−eye.x,+eye.y)·ps 一致）；`viewBg=恒等`；zoom 替换 general.zoom（无效回退，
  第三方参考实现 wer-ref UpdateActiveCameraLayer / elysia camera.js:186-189 同式）。无 pose → 逐位旧行为。
- **背景例外**：满幅层（size·scale ≥ ortho−1，elysia `_viewShift isBg`，sf32/sf33 与官方预览核对）
  用 `viewProjBg`（渲染循环按层选择，粒子/图像同路）；zoom 窗口对全部层生效（与 elysia 一致）。
  注意：wer-ref（**第三方参考实现**）的代码对**所有**层统一用活动相机 VP（无背景例外）——该例外是 elysia 经用户逐帧比对
  官方预览得到的经验语义，按任务书要求保留并测试（T4a/T4b）。
- **开关**：`?cam=0` 关（静态）；`?cam=node` 强制；缺省=active 即用。demo.html opts.cam 接线。

### 3. 受影响的包

- 默认行为变化：**仅 3554161528**（唯一动画相机节点）——入场运镜 0→5s（origin (−1319,−710)→(0,0)、zoom 3→1，
  fps=18 mode=single，贝塞尔切线含合法下冲 zoom≈0.982@t≈6s）。其余 22 个相机对象包 inert（脚本驱动/无动画），
  84 个无相机包逐位不变（T3 + render-audit 5/5 + frame-map-verify 8/8 佐证）。
- `?cam=0` 可 A/B 回静态相机。

### 4. 回归（全绿）

18 项套件：shader 13/13、GLSL 128/128、mock-GL 12/12、精灵 17/17、粒子 10/10、文本 21/21、bloom 14/14、
脚本 10/10、坏帧 8/8、tex-fmt5 4/4、alignment 184、attach ALL PASS、多图 28/28、音频 20/20、
fillmode 17/17（不回退）、closeout 22/22、blink-phase 15/15、**camera-node ALL PASS**；
render-audit mesh 5/5、skin-order 0.0000、layer-rect 中位 0px。

## P-26（2026-09-12）MERGED-1 第 3 项：HDR 绝对路径（浮点 RT + bloom HDR 链收口）

> 交付：`hdr-bloom-test.mjs`（新，17 checks ALL PASS）+ getFBO 浮点变体（RGBA16F/RGBA32F +
> 三级降级链）+ renderScene 场景浮点 RT + 呈现 + runBloom 直采浮点纹理 + bloomhdrscatter（此前缺失）+ demo `?hdr=` 开关。

### 1. 实现语义

- **门控**：`hdrWant` = `?hdr=` 显式（0/1 强制）否则 `general.hdr`；扩展 = `EXT_color_buffer_half_float`
  **优先**、`EXT_color_buffer_float` 其次（Adreno 常只暴露 half 变体）；两者皆无或 FBO 不完整 → 退回现有
  LDR 管线 + 一次性日志（`[hdr] 浮点 RT 不可用…退回 LDR 管线`）。
- **getFBO(…, {float:'half'|'full'})**：`RGBA16F/HALF_FLOAT`（half 可混合无需 EXT_float_blend）；
  完整性检查沿用；不完整 → 1x1 float → 仍不完整 → RGBA8 并清 `.hdr` 标记（调用方据此降级）。
- **渲染路径**：HDR 帧的全部场景层渲进 `hdr-scene` RGBA16F FBO（尺寸=输出），帧末用 bloom compose 程序
  直绘呈现（`scene + 黑 = scene`，无混合无 gamma——RE-33 全链无 pow/2.2；程序编译失败兜底 WebGL2 blitFramebuffer）。
  非 HDR 包零改动（T1f：无 RGBA16F 分配）。
- **bloom**：HDR 帧直接采浮点 RT（免 `copyTexSubImage2D` 的 RGBA8 钳制——此前"在 LDR 数据上套 HDR 公式"
  的根因消除）；`isHdr` 以渲染帧实际状态为准（独立调用/测试沿用旧口径 → bloom-verify 不回退）；
  mip1=/2、mip2=/4（LDR 仍 /4、/8）；`bloomhdrthreshold/feather/strength` 沿用 P1-7；
  **`bloomhdrscatter` 本批补齐**（模糊步长 8×texel×scatter，缺省 1、≤0 取 1——此前语料键无消费者）。

### 2. 语料与影响面

- 语料 `hdr:true` 包（如 3554161528）：默认即走浮点 RT（设备支持时）；`?hdr=0` A/B 回 LDR（阈值取 bloomthreshold）。
- 非 HDR 包（其余 59 解析成功包）：渲染路径逐位不变（T1f/T4）；bloom-verify 14/14 不回退。
- 有条件（headless）时的 3554161528 HDR/LDR 截图对比：本机 Chromium headless 无法起 WebGL2 浮点 FBO
  （SwiftShader + playwright newPage 挂起），未产出直方图——真机（Adreno，EXT_color_buffer_half_float 常见）刷新即可验：
  `?hdr=0` 对比 HDR 高光不硬切。

### 3. 回归（全绿，19 套件）

shader 13/13、GLSL 128/128、mock-GL 12/12、精灵 17/17、粒子 10/10、文本 21/21、bloom 14/14、脚本 10/10、
坏帧 8/8、tex-fmt5 4/4、alignment 184、attach ALL PASS、多图 28/28、音频 20/20、fillmode 17/17、
closeout 22/22、blink-phase 15/15、camera-node ALL PASS、**hdr-bloom ALL PASS**；
render-audit mesh 5/5、skin-order 0.0000、layer-rect 中位 0px。

---

## MERGED-1 收尾（2026-09-12，ZCODE-MERGED-1-RENDER-CORE 三项全做完）

- **已完成**：①G 眨眼/fps（blink-phase-test 15/15；fps 定案=每动画自带，全语料 48/48=30；79px 排除眨眼相位，
  根因待定已挂证据）；②D 相机节点（camera-scan 取证 + camera-node-test ALL PASS，pose vs elysia maxΔ=0，
  默认变化仅 3554161528）；③C HDR 绝对路径（hdr-bloom-test ALL PASS，RGBA16F 场景 RT + 直绘呈现 + scatter 补齐）。
- **未完成**：79px 眼睛层根因（需官方编辑器 preview 投影映射证据）；B9 透视联动（无语料，no-op）；
  脚本驱动相机对象（21 包，需脚本引擎写相机对象）；3554161528 真机 HDR/LDR 截图对比（headless 不可用）。
- **下一步**：真机回归（重点：3554161528 运镜与 HDR、3719111841 眼睛 79px 目测复核）；MERGED-2/3 任务书接力。

## P-27（2026-09-12）MERGED-2 第 1 项：E 逐包质量门禁 + 回归矩阵

> 交付：`package-matrix.mjs`（Node，无 GL 依赖）+ `package-matrix.json`（107 包矩阵）+
> `package-baseline.json`（基线）+ `known.json`（白名单）+ `SELFCHECK.md` + demo `?selfcheck=1` +
> 服务器 `POST /diag`（:8901 实例已验证；:8899 下次自然重启生效，页面有 /report 回退）。

### 1. 矩阵口径（一包一行）

容器（magic/条目/大小/布局校验）、场景（层/可见/容器/image/video/particle/text/sound/light）、
纹理（引用/命中/解码成败/字节/format 分布）、变换（父链/attachment/puppet/非 center 对齐/带动画）、
粒子（层数/maxcount 合计/精灵表/多图精灵/每层模拟存活数）、审计（mock-GL 驱动**真实 renderScene**：
drawnLayers/skipped/层错误/白块·透明回退层名/draw 数）、计时（parse/decode/audit ms）。

### 2. 审计归属方法（可复用）

- 层归属：bundle `[首帧] #N` 日志在每层绘制**前**同步打出 → mock GL 的 draw 在发生瞬间读取"当前层号"。
- 白块/透明观测：mock `texImage2D` 对 1×1 全 255/全 0 上传给纹理打 `__solid` 标记（bundle 内部
  whiteTex/transparentTex 的出生路径），绘制时绑定 g_Texture0 即命中。
- 纹理接线与 demo `loadScene` 完全同语义：`materials/<名>.tex` 解析（裸名不行）、pass0.textures[0] 成功
  才赋 `textureName`/`particleTexName`、`model.solidlayer` → `solid`、PNG/JPEG/WEBP/MP4 纹理 Node 无法
  光栅化按"已加载无像素"处理（浏览器侧 createImageBitmap/<video>）。

### 3. 门禁与首轮结论（107 包）

门禁键：CONTAINER / SCENE / NO_VISIBLE / LAYER_ERR / WHITE_FALLBACK / TRANSPARENT_FALLBACK /
TEX_DECODE / PARTICLE_EMPTY（可见粒子层模拟到 starttime+25s 仍 0 粒子）。
首轮 ❌ 101 包 → 三类甄别后 **1 项豁免，其余全绿**：
- **PKGM0014 视频壁纸容器**（21+ 包，wallpaper.mp4+preview+project.json[+scene.json 编辑器残留]，
  0 个 .tex）：官方就是整段播 mp4 → `type=video-wallpaper`，不做场景门禁；
- **文本层/脚本纹理**（文本1、帧率显示、Album Cover 等）：浏览器运行时生成纹理，Node 静态判定排除 `__text` 层；
- **唯一真实遗留**：`2aeac838640589c66efc315e821c44b6.mpkg` = v1.0 缩略图壳（wall.png 0KB 下载残留）
  → `known.json` 豁免（带原因+日期）。
历史"白块/空层"问题（RE-40 格式5、眼睛组合等）在当前 HEAD 上**无一复现**——白块/透明/解码败/粒子空 全 0。

### 4. --check 基线门禁

`node package-matrix.mjs --check` 与 `package-baseline.json` 逐包比对：drawnLayers↓、白块/透明/解码败/
层错误↑、耗时 ≥200ms 且 +50%（小耗时抖动是噪音）→ 打印 diff 非零退出。实测退出码 0。

### 5. 回归（全绿）

bundle 未改（node --check ✓）；shader 13/13、GLSL 128/128、mock-GL 12/12；
`demo.html` 仅追加 `?selfcheck=1` 只读块（默认关，不动渲染参数）。

## P-28（2026-09-12）MERGED-2 第 2 项：B 真机性能预算（逐包耗时矩阵 + 自适应降级）

> 交付：`perf-profile.mjs` + `perf-matrix.json`（107 包）+ `perf-baseline.json`（静态成本+粒子 CPU 基准）+
> bundle `?perf=1` 计时（stats 钩子交付）+ demo 性能面板 + `?perf=auto` 自适应降级。**全部默认关。**

### 1. 静态成本矩阵（Node，107 包）

Top-10 重包（cost = fxPasses×8 + maxcount/1000 + decodeMB×2 + mesh×4 + layers/20，启发式排序用）：
3719111841（1079.5：43 层/19 效果层/21 fxpass/8 粒子层 maxcount 1774/5 蒙皮/443.8MB 纹理）、
3470764447（855.4）、夜莺·alone（827.8）、3660962877（793.9，127 层/44 效果层）；
粒子 CPU 基准最重包 **3544152633 = 0.768ms/帧**（16 粒子层 maxcount 12387，纯 JS 模拟）；
全语料粒子 maxcount 总计 49930。视频壁纸容器（PKGM0014）零场景成本短路。

### 2. 浏览器侧计时（?perf=1，默认关）

- bundle：opts.perf 或 URL 解析；关闭路径 `if (perfState.enabled)` 全短路（零额外 GL 调用）。
  开启时 GPU 计时优先 `EXT_disjoint_timer_query_webgl2`（4 槽环形查询池，异步读上一帧，不阻塞），
  缺扩展退 `performance.now()` 包住 render 主体；draw call 计数只在开启时包一层。
- 交付页面：帧末 `runPostFrameHooks(stats)`（预留 stats 槽首次真正接线；关闭时传最小 stats 不带计时字段），
  payload 含 frameMs/gpuMs/draws/layers/textures/texBytesEst/layerMs（每层平均 ms）/auto。
- demo 面板（可关，右上角）：最近 120 帧 p50/p95、GPU p50（标注来源）、每层平均 ms Top8、
  纹理数、显存估算；`?perf=1&perfreport=1` 于 12s 起 POST /diag（回退 /report）。

### 3. 自适应降级（?perf=auto，默认关）

p95 帧时间 >25ms（30 帧窗口）逐档升级，每档 onLog 报"降级前/后 p95"：
① 粒子层 maxcount ×1/2 → ×1/4（`buildParticleSystem` 新增 ctx.maxCount 封顶——只降存活上限，**不停发**；
   ctx 不传/def.maxcount≤0 时与旧行为逐位一致）；
② `setFboCapFactor` 阶梯 0→0.75→0.5→0.35（效果链 FBO 上限=屏幕占比×系数）；
③ demo loadTex：解码累计 >220MB 预算时非关键层（无效果 && 面积<25% 设计画布）按 1/2 盒式滤波上传（有日志）；
④ 档位与降级前/后 p95 写 `perfState.autoLog`，面板与 perfreport 同步携带。

### 4. 验收

- `node perf-profile.mjs` 产出 107 包矩阵 ✓；`--pkg $MPW_PLUGIN_CACHE/d5007a52866682e2210d9d855d170c80.mpkg`
  正常完成（112.1MB 纹理画像，无 OOM）✓
- **开关默认关闭逐位一致**：mock-GL 12/12、粒子 10/10、shader 13/13、render-audit 3719111841
  （47 draw、mesh 5/5、正常返回——与改动前同口径）✓
- 真机帧时间样本：本会话无真机，未采集（perf-baseline 只含静态成本+粒子 CPU 基准；上真机后
  `?perf=1&perfreport=1` 产生 reports/selfcheck-* 或 perf-* 报告即可补样本）。

## P-29（2026-09-12）MERGED-2 第 3 项：A 视觉回归工具链

> 交付：`headless-shot.mjs`（加固版：6 档降级链+CPU 兜底）+ `visual-diff.mjs`（SSIM/MAE/热图，无 npm 依赖）
> + `visual-baseline.json`（4 包基线）+ `VISUAL-TESTING.md`。只动工具与文档，不改渲染语义。

### 1. headless-shot.mjs（截图取证）

- 降级链：6 档参数组（base/SWP → +single-process/no-zygote → 小视口 → disable-gpu+CPU 光栅 →
  old-headless → swiftshader-GL），每档**独立子进程**+90s 硬超时（挂起可杀），证据落
  `/tmp/headless-evidence.json`；PNG ≤1280 宽；页面日志（console/pageerror/#log）随输出。
- **本机判定：headless 不可用**。证据链：9 组参数、3 类失败——① 多进程档 launch/newPage 可过但
  **任何导航挂起**（`about:blank`/`data:` 都超时 → PRoot 下渲染进程 Mojo IPC 不可用）；
  ② single-process 档 launch 即崩（Target/browser closed）；③ NetworkServiceInProcess/old-headless/
  swiftshader-GL 变体无效。退出码 2 分支即"明确不可用+证据"。
- **CPU 预览兜底**（preview.mjs，REFR=0 官方父链）：`?id` 包自动出图（局限在输出里注明：
  无蒙皮网格/效果链/粒子）；`SHOT_MODE=cpu` 省时直通，`SHOT_MODE=chain` 强制完整链。

### 2. visual-diff.mjs

- 参照优先级 ① preview.gif（ffmpeg 取 -ss 0.5s 中段帧）② Testphoto/TP*（TP_MAP 登记，探黑边+cover-fit）
  ③ refrender-<id>.json 几何判据（layer-rect-check 中位偏差折算）。
- 对齐：cover 裁剪 + 灰度 1/4 分辨率 ±8px 互相关（命中后全分辨率 ±1 复检）；SSIM 8×8 窗自实现；
  热图 PNG 用 ffmpeg rawvideo 编码（无 npm 依赖）。`--ab` 两分数并排；`--check` SSIM 跌>0.02 或
  MAE 涨>15% 非零退出；current-<id>.png 按 id 命名防串包。

### 3. 基线分数（CPU 预览路径 + preview.gif 参照，同基线相对值）

3719111841 SSIM=0.4808/MAE=0.1252；3544152633 0.4335/0.1110；3554161528 0.3587/0.1037；
3327063360 0.3091/0.2859（offset (100,-9)=投影/相位差大）。CPU 渲染确定性验证：同 id 重跑逐位同分。
A/B `?att=legacy` 实测 Δ=0.0000——CPU 预览不解析 demo 开关（preview.mjs 固定 attachCtx 路径），
A/B 判别力需 headless/真机可用（局限已写进 VISUAL-TESTING.md §三/§四）。

### 4. 验收

- `node headless-shot.mjs "…/?id=3719111841" /tmp/kalt.png 8000 960 540` 退出码 0
  （headless 明确"不可用"+证据 → CPU 兜底出图）✓
- `node visual-diff.mjs --id 3719111841 --out /tmp/vd/` 出分数+热图+JSON ✓
- `node visual-diff.mjs --id 3719111841 --ab "?att=legacy"` 两分数并排 ✓（判别力局限已注明）
- 差异大处**只记录不改渲染器**：3719111841 的 79px 眼睛层残差维持 P-24 待定（热图可见），
  3554161528 的分数含入场运镜相位差（官方缩略图是入场后帧）——均为参照映射问题，非渲染回归。

---

## MERGED-2 收尾（2026-09-12，ZCODE-MERGED-2-TOOLING 四项全做完）

- **已完成**：①E 逐包门禁矩阵（package-matrix.mjs，107 包，8 类门禁，--check 基线闭环；?selfcheck=1+SELFCHECK.md；
  唯一豁免=v1.0 缩略图壳，白块/空层/解码败/粒子空在 HEAD 零复现）；②B 性能预算（perf-profile.mjs 静态成本+粒子
  CPU 基准；?perf=1 计时 + stats 钩子首次接线 + 性能面板；?perf=auto 三路自适应降级——全默认关，关闭路径零额外
  GL 调用，mock-GL/render-audit 证明逐位一致）；③A 视觉回归（headless-shot 6 档降级链+证据落盘+CPU 兜底；
  visual-diff SSIM/MAE/热图/基线 --check；4 包基线分数落 visual-baseline.json；VISUAL-TESTING.md）；
  ④I 清理固化（13 个零引用脚本归档 archive/ + README；LEGACY.md 删除预案；TESTING.md 全量版；
  run-all-tests.sh --fast/--json；docs-check.mjs 106 引用全绿）。
- **未完成（环境受限，非任务缺口）**：真机帧时间样本（?perf=1&perfreport=1 待真机）；?selfcheck=1 浏览器实测
  （headless 不可用，已验证只读代码路径 + POST /diag 于 :8901 实例）；headless 截图链路本机不可用
  （PRoot Mojo IPC，9 组参数证据在 /tmp/headless-evidence.json 与 headless-shot.mjs 头注）。
- **下一步**：真机跑 `bash run-all-tests.sh` 全绿 → 按 `archive/LEGACY.md` 预案评估删 `?att=legacy`
  （前置=真机连续 2 次验收无问题）；79px 眼睛层根因待官方 preview 投影证据（P-24 挂起，热图可见）；
  README-DIAGNOSTICS 已补 cam/hdr/hdrblur/perf/perfreport/selfcheck 六开关（diag-flag-check 62==62）。

---

## P-30（2026-09-12）79px 眼睛层残差定案：**标定条目不可达，不是渲染误差**

**背景**：P-24 推翻"眨眼相位"解释后留了个尾巴（"真实根因待定"）；ELYSIA-DIFF-AUDIT 里
"最大 79px（眨眼相位）"这句也过期了。本次用独立复算把这条彻底钉死，并把它变成工具里的**机器判据**。

**判据（旋转不变上界）**：网格层无论做任何刚体旋转，其 AABB 的宽/高都不可能超过**网格对角线**。
所以标定矩形只要有一条边超过对角线，这条标定就**不可能**是该层单帧实绘框。

**实测（3719111841，115"眼睛组合" = 全语料唯一 mesh+附件+动画层）**：
| 量 | 值 |
|---|---|
| 标定 refrect | **169.8 × 277.9** 设计px（= 245×401 模型单位） |
| 本层网格对角线（旋转上界） | **274.7** 设计px → 标定 277.9 **超界** |
| 正规蒙皮（`bindInv×world`，= elysia = 官方口径）全周期最大可达 | **224.0 × 227.8** 设计px |
| 帧 0 实绘 | 211.4 × 175.5 设计px |
| 反面口径（绝对位姿 `world`，T1 已否决） | 228.0 × 748.7（高得离谱，y 方向根本不是） |

→ 标定高度超过本层**任何姿态**的上限 50px，说明这条标定不是"单帧实绘框"（多为官方预览里
人工框的"可见眼区"，或含其它层/子网格），拿它当判据必然永远差一截。

**同场景旁证（决定性）**：`node layer-rect-check.mjs 3719111841 --refrender` 现在显示
**21/22 层 Δc=(0,0)、Δs=(0,0)（逐位吻合）**，只有 115 是 Δc=(-24,76)。
连同样挂"头部"附件的 19 个头发/眼皮/衣袖层都是 0 —— 附件锚点、父链合并、对齐偏移全部正确。

**落地（工具侧，仅加诊断不改判据）**：`layer-rect-check.mjs` 现在对网格层计算对角线，
标定越界即打印 `⚠标定不可达(网格对角线 Npx < 标定 Mpx)`，汇总行列出全部不可达层并注明
"这些 Δ 不是渲染误差（判据见 P-30）"。退出码不变（门禁判据不动）。

**结论**：**不要把 79px 当成待修的渲染 bug**。要清理它只能重做 115 的标定条目
（需要可复现的官方投影证据，即 P-24 挂起项）；在那之前，门禁读数是"已解释的已知偏差"。

---

## P-31（2026-09-12）用户"渲染还是有问题"定案：两个真 bug（壁纸蒙皮被关 + 脚本同步抹掉附件锚点）

**取证路径**（关键：**不靠猜，靠设备自己上报的像素与坐标**）：
用户报告"渲染还是有问题"→ 翻 `reports/r*.json`（渲染器每 10s 自报，含 canvas JPEG + 逐层表 + 日志）
→ 用**报告里的截图**做非灰底占比扫描，得到时间线：09-11 22:06 前正常、09-12 11:46 起一直异常
→ 再读报告里的 **DIAG 行**（逐层 origin 采样）与 CPU 预览对照，定位到两条独立的 bug。

### Bug A：壁纸 URL 误带 `skin0=0` → 壁纸里 GPU 蒙皮被关（插件侧）

`skin0` 是渲染器的**"存在即生效"诊断开关**（`demo.html:1063 skinEnabled = !params.has('skin0')`），
但插件 `applySceneViaRenderer` 生成的壁纸 URL 里写死了 `&skin0=0`（该参数**不在 git HEAD 里**，
是本轮未提交改动带进来的，且无任何注释说明）。后果：壁纸里 5 个 mesh 层
（主体 / 眼睛组合 / 左耳朵1 / 右眼上眼睑 / 长发3）**不画 mesh 改画 quad**，
永远对不上标定表与 30 个测试所验证的路径。

**修复**：①URL 生成处移除该参数并写明"勿再带回"；②对**设置里已存的 webUrl** 加就地清理
`mpwSanitizeSceneUrl()`（只动含 `pkgurl=`/`pkgpath=` 的渲染器 URL，不碰普通网页壁纸；分隔符归一化，
`a&skin0=0&b → a&b`，7 例单测在提交说明里跑过），否则用户必须重新选一次场景才生效。
文档同步：`README-DIAGNOSTICS.md` 顶部说明 + `skin0` 表行标注"勿写进壁纸 URL"。

### Bug B：RE-28 脚本同步把附件锚点"抹回" authored 原点（渲染器侧，影响所有带附件的场景）

**设备铁证**（报告 `【DIAG】` 行，逐层 origin 采样）：

| 层 | 设备实测 origin | raw authored(→y-down) | parseScene 锚点后 |
|---|---|---|---|
| 右侧发 | (67, 2675) | **(67, 2675)** | (2575, 743) |
| 底发 | (−277, 1719) | **(−277, 1719)** | (2284, 342) |
| 衣袖 | (−517, 2661) | **(−517, 2661)** | (1948, 1965) |

设备值与 raw authored **逐位相同**、与锚点后相差 2500–3200px → 19 个带 attachment 的图片层
（头发/发片/衣袖/飘带…）全部飞出画面，画面只剩几个 mesh 层 + 清屏灰底。

**根因**：`demo.html` 的 RE-28 同步把 `raw.origin` **直接赋值**给 `l.origin`
（`if (typeof ro === 'string' && !l.__skin && !attachAnimActive.has(l.id))`），
而默认路径下 `l.origin` 已被 `parseScene` 加上**父链合并 + 附件锚点偏移**（core/attach-transform.mjs）；
`attachAnimActive` 在默认路径下**恒为空**（附件动画预计算只在 `?att=legacy` 分支里跑）→ 无条件抹掉锚点。
CPU 预览（preview.mjs **不跑脚本**）因此一直是对的 —— 这正是"两端分歧"的落点，也解释了为什么
P-21-ATTACH 的 19/22 层 Δ<5px 与真机观感矛盾。

**修复**（可测、零回归）：
- bundle 新增共享实现 `snapshotAuthoredOrigins(rawObjects)` + `syncScriptOrigins(scene, rawObjects, base, skip)`：
  以"脚本是否**真的改过** authored origin"为判据，只施加**增量**（`l.origin += (dx, −dy)`），
  脚本没碰 origin 就保留锚点后的世界坐标；
- `demo.html` 在 `parseScene` 之后、**脚本首帧运行之前**抓基线快照，循环里只保留 text/alpha/color 同步，
  origin 交给共享实现；
- **无锚点层逐位等价旧实现**（T4 断言），有锚点层保住偏移（T2c：17 个图片层 vs 标定表最大 0.0px）。

**新增测试（已进门禁，run-all-tests 由 28 → 30 项，30/30 绿）**：
- `script-origin-sync-test.mjs`：T1 用旧写法**复现设备 DIAG 数值**（3/3 逐位吻合，证明测试抓得到该 bug）；
  T2 不写 origin 时 43/43 层 origin 不变、图片层与标定表 0.0px；T3 写 origin 时增量叠加且幂等；T4 无锚点等价。
- `demo-syntax-check.mjs`：提取 demo.html 全部内联 `<script>` 做 `node --check`（5/5）——
  之前 demo.html 不在任何 Node 测试覆盖内，语法错误在浏览器里只表现为整页空白。

**验证边界（诚实说明）**：本机无法起 headless WebGL（P-26 已定案），因此两个修复的**真机观感**需要
刷新后确认；但 Bug B 的判据是设备上报的**自己算出来的坐标**，复现与修复都是逐位可验证的，不依赖观感。
`:8899` 服务器对 `/`、`/bundle.js` 均**每次请求读磁盘**，已确认线上内容含修复，**无需重启**。

---

## P-32（2026-09-12）按用户要求"用足自动上报"：上报**扩容**为逐层绘制台账 + 纹理内容统计

**用户质问**："渲染的很多东西，它的坐标都是错误的 自动上报你看不到吗" —— 先回答：看了，而且这一轮把上报里
**已有的**数据全部榨干，同时补上原上报**缺的**两类数据（否则继续猜）。

### 从现有上报能确定的事实（不再猜）
1. **层 origin 坐标**：最新上报（22:23，用户刷新后）43 层里 **42 层与本地期望逐位吻合（≤0.7px）**，
   唯一"不符"是两层同名 `光束 - 角` 被按名字配对导致的假差异（按层序配对后归零）→ 上一轮修好的
   origin 覆盖问题确实生效（右侧发 2575,743 / 底发 2284,342 / 衣袖 1948,1965 全部归位）。
2. **哪些层"该有内容却是清屏灰"**：上报的 `【DIAG】` 行是逐层像素采样（原点 9 像素均值）。
   最新报告 22 个采样点里 **9 个等于清屏色 (178,178,178)**：`背景正常` + `长发1/长发2/后发1/后发2/接管/
   右耳朵/眼睛组合` + 左缘/中心探针（40 帧全程 178）→ 即**背景与一组 fx=1 的头发/衣物层没上屏**。
3. **这些层的绘制参数是对的**：设备日志 `[fx0] 背景正常 srcTex=ok texObj=1024x1024 solid=false
   color=[1,1,1,1] size=[6000,3600]` + `[bg帧] ox=1914 oy=1065 w=4244 h=2547 proj=3840x2160 fbo=null`
   → 绘制被发出、纹理非 white/transparent 兜底、尺寸/位置与期望一致；且**没有** fx 链失败、没有纹理上传
   报错、没有层异常（日志里那几类行都不存在）。→ 问题在"纹理内容/链路结果"，而**老上报没有记录这一层**。

### 上报扩容（两处，均只在采集帧生效，不影响渲染）
- **`layerLedger`（逐层绘制台账）**：`compositeLayer` 每层绘制后回调 `opts.onLayerDraw`；
  demo 在"自报前的那一帧"用真实 mvp 反算**该层实际绘制的设计坐标矩形** + 在矩形中心 `readPixels`
  取色 + 记录纹理种类（layer/white/transp）、size、scale、alpha。**已用 mock-GL 逐位校验**：
  台账矩形与 `origin ± size*scale/2` 对 5 个代表层 Δ=0.0（约定：mvp 行向量 → 屏幕后 y 与设计同向，勿再翻）。
- **`texStats`（纹理内容统计）**：每张纹理解码后记录 `解码尺寸 + 采样 RGB 均值 + alpha 均值 + 全透明占比`
  → 直接区分"参数对但纹理是空的/黑的"与"绘制被跳过"。
- 两者都进 `/report` 负载（各截断 60 条），刷新后自动上报即可见；`run-all-tests` 仍 30/30。

### 顺带确认的两个"浏览器独有分叉"（都会造成"预览对、真机错"）
- `ownSizes`：把"自带 puppet 的附件层"的 **size 覆盖成网格 bbox 尺寸**（长发/耳/眼皮）——
  实测网格 bbox 只有 authored 尺寸的 **1/1.9**（右眼上眼睑 116x68 vs 211x163、左耳朵1 640x568 vs 1211x1146、
  眼睛组合 305x253 vs 584x759）→ 这些层在浏览器里被画小近一半。CPU 预览**不执行**这段 → 两端不一致。
- 背景层 `背景正常` 走的是"无效果直绘"（clearBgFx 清掉了 waterwaves 链），而 CPU 预览同样如此，
  却在两端表现不同 → 只能是纹理内容/GL 链路差异（`texStats` 就是为它准备的）。

---

## P-33（2026-09-12）"大部分壁纸都有渲染问题"主因：脚本宿主 vm 替身不回写顶层赋值

**用户反馈**：①把每个壁纸都开了一遍，大部分有渲染问题；hina 那张点开加载后整屏空白 ②砂狼白子那张
"视频能出来、文本出不来"。用户还质问"自动上报你看不到吗"——于是把**新到的 6 个场景上报**逐份读了。

### 证据（用户 22:50–22:53 自动上报，6 个场景）
| 场景 | 非灰底 | 脚本错误（上报 subsystems.scriptErrs） |
|---|---|---|
| 3719111841 凯尔希 | **18.3%**（大面积空白） | `update:…null (reading 'use24hFormat')×53`、`'useDelimiter'×106` |
| 3554161528 | 100% | `init:localStorage.get is not a function×77`、`update:…null (reading 'speed')×77` |
| 3544152633 | 100% | `update:…null (reading 'use24hFormat')×135`、`'useDelimiter'×180` |
| 3327063360 | 100% | `update:…null (reading 'x')×1666`、`'maxvalue'×3038` |
| 3326873240 | 99.9% | `init:localStorage.get is not a function×57`、`update:…null (reading 'dur')×171` |
| 3660962877 | 99.8% | `update:…null (reading 'x')×3445`、`'maxvalue'×3445` |

**5/6 个场景都在刷 `Cannot read properties of null`** —— 而这些脚本驱动的正是**动画/层位置/时钟文本**
（`x`/`maxvalue`/`dur`/`speed` 都是脚本属性）→ 失效后表现就是用户说的"**坐标都是错误的**/不动/文字不出来"。
量化受影响面：22 个 dd 场景里 **11 个**、77 个 mpkg 里 **21 个** 含 `scriptproperties`。

### 根因（已在 Node 里 1:1 复现）
`elysia/nsl.js` 是 node:vm 的浏览器替身，旧实现把 context 的键做成 `new Function` 的**形参**：
脚本顶层 `export var scriptProperties = createScriptProperties()…`（转译成 `__scriptProps = …`）
只写进局部变量、**不回写 context** → 宿主读到属性对象 = null →
`update()` 里 `scriptProperties.use24hFormat` 抛 TypeError → 每帧都抛、值永远停在 authored 占位值
（Shiroko 的时钟就一直显示 "12:34"）。复现：`node /tmp/repro-clock.mjs`（已归档为测试 T1）。

**修法**：`nsl.js` 改用 `with (__nslCtx) { … }` 执行（剥掉转译后顶部的 `'use strict'`，with 在严格模式非法），
裸赋值即写 context 属性 —— 与 node:vm 语义一致（中途抛错时已完成的写入同样保留）；包装失败退回旧行为。
**顺带**：`scene-scripts.js` 里对象级 `scriptproperties` 常是 **JSON 字符串**，旧代码对字符串做
`Object.entries` → 作者存盘覆盖全丢；现已先 `JSON.parse` 再套用。

### 第二个脚本 API 缺口：`localStorage`
WE 的 `localStorage` 是脚本 API（`get/set/remove/has/clear`），与浏览器 Storage（`getItem/setItem`）不同名；
沙箱里原本**没有**它 → 浏览器里标识符落到页面真实 localStorage → `localStorage.get is not a function`
（3554161528 / 3326873240 的 init 就是这么挂的），Node 里则是 undefined。
现提供**沙箱内存实现**（WE 命名 + Storage 别名），脚本可正常读写且**不碰宿主页面存储**。

### 砂狼白子那张的性质（答案）
容器 `project.json` 写的是 `"type": "scene"`，实际内容是 `wallpaper.mp4`（3840×2160 h264、30s）
+ 一份 scene.json，其中有一个**脚本驱动的"时间"文本层**（字体 `fonts/RobotoMono-Regular.ttf`）。
我们的链路按**视频壁纸**播它（所以视频正常），场景里的时钟文本不参与合成；而那个时钟脚本本身
此前也一直在失败（就是本轮修的 bug）。
→ **"视频 + 场景文本叠加"这条链路目前不存在**：要么我接（video 作底层、场景文本/图层叠上去），
要么明确"含 mp4 的 mpkg = 视频壁纸，不做叠加"（需产品决策，等用户定）。

### 回归
新增 `text-script-props-test.mjs`（真实 WE 时钟脚本 + localStorage API，**9/9**，修复前必失败），
进 `run-all-tests.sh` → **31/31 绿**。`:8899` 每次请求读磁盘，`/elysia/*` 已含修复，刷新即生效。
**待办**：hina 白屏（脚本失败不会白屏，疑 WebGL 上下文丢失/OOM 无兜底 → 计划加"失败回退静态帧/首帧"
并把 contextlost 写进上报）；`?mpwdiag=1` 侧的场景上报开关已加（设置 → 场景渲染 → 场景渲染上报）。

---

## P-34（2026-09-12）用户 7 条清单：先落地 4 项 + 脚本 API 补口（含"提示框直接删"）

**用户清单**：①hina(3554161528) 白屏 ②要"视频作底层 + 场景文本/图层叠加" ③Girl cat(3544152633) 只有光晕、
背景黑、人物/猫没画、未渲染人物抽动 ④凯尔希飘带/头顶发片/眼睛位置不对 + 眼睛动画后抽一下
⑤日月循环(3326873240) 的提示框直接删掉（其它壁纸同理）⑥伊蕾娜相框(3660962877) 视频渲染错位、
有白屏黑屏块、提示框没去掉 ⑦先把视差关掉。

**本轮落地（已门禁 31/31 绿、已同步、`:8899` 刷新即生效）**
1. **提示框层一律隐藏**（⑤⑥）：`applyRenderConfig` 的 hideUI 规则加入 `提示框|提示窗|prompt`；
   上报台账已实锤层名：3326873240 的 `提示框2`（纹理「伊蕾娜 提示框」）、3660962877 的 `伊蕾娜 提示框`。
   基线里 drawnLayers 8→7 / 17→16 正是这一层的消失 → 已 `--write-baseline` 刷新并留痕。
2. **白块兜底改透明**（⑥的"白屏块"，也顺带缓解①③）：纹理缺失/解码失败时默认**不画**（原来画 1×1 白块，
   满屏 3840×2160 白块叠起来就是用户说的白屏）。缺口改由上报 `texMissing`/`texStats` 暴露；
   `?whitefallback=1` 可切回白块对照。
3. **视差默认关**（⑦）：demo 传 `parallaxOff`（默认 true），`?parallax=1` 打开，`?parallax=legacy` 仍走旧式。
4. **脚本 API 补口**（②③④⑥的共性根因之一，均来自上报错误串）：
   - `Vec2 is not defined×238` → 沙箱补 `Vec2`（接口与 Vec3 对齐）；
   - `localStorage.get is not a function` → 沙箱内存 `localStorage`（WE 命名 get/set + Storage 别名，不碰宿主存储）；
   - `scriptProperties` 为 null（上一轮 P-33）与 `scriptproperties` JSON 字符串未解析 → 已修。

**上报台账给出的定位线索（下一轮直接接着做）**
- 3660962877：视频层 `伊蕾娜 果园春色 有水印横屏 rd=[1920,-1221,3999,2301]` → **画到屏幕右侧外**，
  origin 与期望差 **2303px**；其定位脚本抛 `Vec2 is not defined`（已修）→ 刷新后应归位，否则继续查
  `value.copy is not a function`（值为数字时无 copy）。
- 3719111841（凯尔希④）：`长发1/长发2/后发1/后发2/接管/右耳朵/眼睛组合/背景正常` 的**绘制矩形是对的**
  （与期望逐位吻合）、纹理也非兜底，但矩形中心像素=清屏灰 → 像素没落上去（下一轮用 texStats 逐张查这几张）。
- 3326873240：多条 `tex=white` 的整屏层（`myLayer/193/组件/1054/893/1297271`）就是白屏来源，已随②变透明。

---

## P-35（2026-09-12）兼容层/转译层**全语料**审计：缺 API 清零

**用户要求**："再检查一下有没有其他的 api 是错误的之类的，包括兼容层在翻译的时候有没有翻译错误的"。
做法：新增 `script-corpus-audit.mjs` —— 把语料里**每个**脚本（dd 的 scene.pkg + wallpaperE/wallpapertest1 的
.mpkg，含嵌套在对象属性里的 script）取出来，用**真实脚本宿主**真跑 t=0..2，按运行期错误聚合；
另做静态扫描找"未实现的调用基对象"。`--strict` 把"缺 API"类错误（is not defined / is not a function）
判为失败，已进门禁。

### 修掉的（都是"翻译错误 / 缺 API"，全部来自上报或语料实跑）
| # | 问题 | 影响 |
|---|---|---|
| 1 | **转译器把 `export function X(...)` 改成 `__exports.X = function(...)`** → 作用域里没有 X，脚本**内部自调 X()** 抛 `X is not defined` | 3544152633 `logTracks is not defined` |
| 2 | 同上：`export let/const X = …` 只做属性赋值 → 内部引用 X 未定义 | 同族脚本 |
| 3 | `nsl.js` 顶层赋值不回写 context（P-33）/ `scriptproperties` JSON 字符串未解析（P-33） | 时钟/日期/属性驱动动画 |
| 4 | **`Vec2` 完全缺失** | 3660962877 等定位脚本每帧抛错 |
| 5 | **`Vec3.mix/lerp/scale` 缺失**（脚本把 Vec3 存进 shared 再调 `.mix()` 做颜色插值） | 3326873240/3327063360 `shared.miPrimaryColor.mix is not a function` |
| 6 | `WEColor.mix/lerp/multiply/add` 缺失 + 颜色返回值需带方法（`WEColorValue`） | 同上族 |
| 7 | **`thisLayer.getTransformMatrix()`** 缺失（脚本用 `.m[13]` 判断层在屏幕上下半） | 3326873240 Clock Container |
| 8 | **`thisLayer.getParent()` 是空壳**，不能链式 `parent.getParent()/.getTransformMatrix()` | 同上 + `parent.getParent is not a function` |
| 9 | **`thisLayer.getTextureAnimation()`** 缺失（脚本 `stop()/setFrame()` 驱动精灵表帧） | 3326873240 dragAndDropToggle/clockHideToggle |
| 10 | **`thisScene.enumerateLayers()`** 缺失 | 3544152633 Clock/$mediaThumbnail/playerplay |
| 11 | **`MediaPlaybackEvent`** 全局缺失 | 3326873240 Media Info |
| 12 | **`localStorage`（WE 的 get/set 语义）** 缺失 | 3554161528/3326873240 init 直接挂 |
| 13 | **init/update 执行顺序**：旧实现每对象 init+update 交替 → 生产者 init 写 shared、消费者 update 读，首帧读到 undefined（官方是"先全部 init，再逐帧 update"） | `reading 'x'` 类错误（大部分已消） |

### 结果
语料 88 容器 / 11 含 scene.json / **131 段脚本**，`--strict` 全绿：
**"缺 API（is not defined / is not a function）"从 8 类 × 最多 57 次 → 0**。
残留：`update:Cannot read properties of undefined (reading 'x')` ×12（3 包）——属于首帧 shared 生产者/消费者
时序的瞬态（非缺 API），后续按需处理。

**未接线的一点（诚实说明）**：`getTextureAnimation().setFrame()` 现在把帧号写到 `obj.__texFrame/__texFrameForced`，
渲染器侧还没读它（脚本不再报错，但帧驱动要下一轮在精灵帧计算处接 `__texFrameForced`）。

## P-36（2026-09-13）W1：真机 0x502 根因链（generateMipmap 残留 + 位图上传无守卫）+ drawGuard 门卫

**证据（全部来自 reports/ 真机上报）**：
1. hina(3554161528) 9 份上报（r1789227799685…r1789228329421）**恒定**两条：`层 "79" GPU 错误 0x502`、
   `层 "背景" GPU 错误 0x502`（layerErrorLogged 去重 → 首帧各发生一次）。
   层序：79=index0（size=0x0、无 image、无纹理 → renderLayer 早退**根本不绘制**）、背景=index1。
   ⇒ "79" 的 0x502 是**加载期遗留错误旗标**被首帧探针误归因；"背景" 的 0x502 才发生在其绘制期。
2. 背景纹理 3840×2260（texStats 实测解码正常 rgb=[112,107,184]）= **大 NPOT**；
   `makeTextureMip` 尾部无条件 `gl.generateMipmap()`，而 MIN_FILTER=LINEAR **从不读 mip**
   （mip 平滑是 2796 行 shader 侧模拟）→ 调用无意义且大 NPOT generateMipmap 在部分驱动
   抛 INVALID_OPERATION：①旗标残留→"79"误报；②纹理被驱动标记不完整→背景 draw 0x502 + 采黑
   （DIAG `背景@(1920,1080)0,0,0`）。**三症状一根因**。
3. GirlCat(3544152633) r1789228365826：shot 全黑只剩窗帘/光斑；台账 housebasic 矩形正确中心 [0,0,0]。
   housebasic.tex=PNG 容器 **4948×2935（>设备 4096）**、houseback 3840×2160；
   位图路径 `createImageBitmap→texImage2D` **无降采样、无 getError 检查** → 超限/失败静默黑。
   shot 里光斑可见（lens_flare_sun 链跑通输出=scene+flare）⇒ 是 **T0 底图黑**，不是效果链黑。

**修法**（demo.html loadTex + core/we-scene-bundle.js）：
- ①`texDownsampleCap(w,h,devMax)`：触发=超 **min(4096, 设备 MAX_TEXTURE_SIZE)**（旧 >4096 只覆盖
  4096 机型）；cap 策略不变（>2048 源→2048）。rgba 路径与位图路径共用。
- ②位图路径：超限先 canvas 缩图；上传后 getError；失败按 **2048→1024 阶梯重试**并逐级记日志
  （下一份上报直接回答"为什么黑"）；texStats 补 `png-up/png-ds` 条目（上传尺寸）。
- ③makeTexture/makeTextureMip 长度终检：非 w*h*4 一律补零消毒后再上传（GL 永不收到坏缓冲），
  `__mpwTexSanitizeCount/Last` 计数进上报。
- ④makeTextureMip **generateMipmap 仅 POT**（NPOT 大纹理不再产生 INVALID_OPERATION 残留旗标）。
- ⑤RG8 分支：gl.RG8 未定义（WebGL1）→ 展开 RGBA 回退。
- ⑥**drawGuard**（compositeLayer / fx-copy / fx-bypass / fx-cmdcopy / 粒子批）：isTexture **明确 false**
  / 反馈环（采样=绘制目标颜色附件）/ 尺寸退化 → 跳过 + `[we-scene] 跳过不可绘制(原因): 位置 [层名]`
  上报（原退化静默 return 改为可对号）；效果链反馈断言从"仅记日志"升级为**跳过该 pass 绘制**。

**验收**：新增 `tex-upload-guard-test.mjs`（39 断言，进门禁）✓；run-all-tests **33/33**；mock-gl 12/12；
render-audit 3719111841/3554161528/3544152633 无误跳过（hina 背景=是）。真机复验项（刷新后）：
hina 上报 0x501/0x502=0、shot 非纯白/灰；GirlCat houseback/housebasic 可见，或日志给出明确上传错误行。

## P-37（2026-09-13）W2：Girl cat "黑内容"定案（cat=官方剪影语义；housebasic=窗洞采到底图；houseback=真 bug 已归 P-36）

**证据**：CPU 基线 preview.mjs 3544152633 构图正确——人物/猫本就是**窗前逆光剪影**（近黑是官方观感）；
housebasic PNG 在窗口区是**透明洞**（底下是 houseback）→ 设备台账 housebasic 中心 [0,0,0] 是采样到
houseback 的黑，**不是 housebasic 黑**；cat 台账中心即猫身深色毛发。效果链取证：houseback 的
lens_flare_sun 输出=scene(T0)+flare，设备 shot 光斑可见 ⇒ 链跑通、T0 底图黑 → 归因 P-36 位图上传。
效果蒙版（waterwaves/shake mask）实测**在包内**（`materials/masks/…`）——早前"缺失"结论是查包时少了
materials/ 前缀，订正。**结论**：cat/housebasic 不改代码（语义标注）；houseback 修复=P-36，待真机复验。

## P-38（2026-09-13）W3：长条眼窗限定凯尔希 + 文本 pointsize 用户属性绑定解包

**证据**：`applyRenderConfig` 第 2 步对所有场景名为"眼睛组合/左眼皮/右眼上眼睑"的层打
uvRect 横带 + 405×120 —— 该 hack 只为凯尔希 3/4 侧脸标定过（CALIBRATION-3719111841），别的场景
照打会把眼睛压成横条（W3 眼睛窗口/头发/飘带观感错位清单主嫌疑）。白子 mpkg(d5007a…) `文本1`
`pointsize={user:"newproperty53",value:45.896}`（用户属性绑定对象）——parseScene 只认 number → 回落 32
⇒"文字特别小"；包内无 JS 脚本（仅 camera_paths）⇒ 纯属性绑定语义。

**修法**：①`EYE_HACK_SCENES=['3719111841']` 白名单；opts.eyeHack 三态（undefined=按 sceneId 白名单、
true/false=显式覆盖），demo/preview/render-audit/package-matrix/perf-profile 全部传 sceneId；
`?eyehack=1` 任意场景强制开、`?eyehack=0` 凯尔希也关（回退口，已写 README-DIAGNOSTICS）。
②`textNum()` 解包 `{user,value}` → pointsize/maxwidth/maxrows（白子 45.896 生效）。
**验收**：tex-upload-guard 白名单 4 断言 + 凯尔希 alignment/visual-diff/layer-rect 全 PASS（白名单内
行为逐位不变）；白子字号修复待真机复验"大小合理"。"腿上"定位部分：该层 origin=(-0.66,71.96) 为
父链局部值，世界位由父链合成，无官方预览可对照——留 `?ln=N` 真机逐层取证。

## P-39（2026-09-13）W4：图片层精灵帧路径（getTextureAnimation 接线完成）

**证据**：3326873240 dragAndDropToggle/clockHideToggle 纹理带 TEXS（2/3 帧竖条，spriteInfo 实测）；
P-35 后脚本宿主 setFrame/play 只把状态写在 raw 对象（__texFrame/__texFrameForced/__texFramePlay），
渲染器不读（P-35 结尾"未接线"项）。凯尔希 眼睛组合纹理**无 sprite** ⇒ 精灵帧路径与其 uvRect hack 零交集。

**修法**：①`spriteFrameRectUV(sprite,frame)`（row-major 换行/回绕，与 computeSpriteFrameUV 同换算）；
②renderLayer：仅当 `__texFrameForced`（钉帧）/`__texFramePlay`（按 frametime 自动推进）才算
`layer.__spriteUV=[u0,v0,u1,v1]`，compositeLayer 优先精灵帧 UV，其次 uvRect，再整图——**无脚本驱动
的 sprite 层保持旧行为**（不自发动画）；③demo 脚本同步循环补三个字段 raw→scene 同步（含取消钉帧）。
**验收**：tex-upload-guard W4 8 断言（竖条/网格/回绕/钉帧/自动推进/整图基线）；sprite-sheet、
particle-sprite、multi-sprite 全 PASS。真机复验：3326873240 两 toggle 层按脚本帧显示。

## P-40（2026-09-13）W5：上报可观测性收尾

- ①`?ln=N` 进上报：top-level `ln:{i,name}` + layerTable 行 `ln:1`（逐层调试对号）。
- ②texMissing 只统计 **tn=1（声明了纹理名）** 且未加载的可见层——无纹理名的灯光/组件层
  （此前误报"光束-角"）不再计入。
- ③背景探针按**该场景的背景层**判定（可见+带纹理名+≥3800×1800 首层）：GirlCat houseback
  不再因写死 `textures.get('背景')` 误报 texNULL；探针行含背景层名。
- ④上报补 `maxTextureSize`（设备上限，超限黑层取证用）+ 每层 `a`(alpha)/`fx`(效果数)/`tn`。
- ⑤上报 log 过滤器补 `[we-scene]` 前缀——效果链 GL 错误/FBO 回退/守卫拦截消息此前因无 ⚠ 标记被
  整批滤掉（r1789228365826 全文 120 行零效果链消息即此因）。
**验收**：payload 构建处字段齐备（demo-syntax 通过）；下次真机上报即可核对同类误报=0。

## P-41（2026-09-13）A1 hina(3554161528) 三根因：自动 HDR 设备熔断 + 网格坏帧检测 v3 + 挂件位置探针

**证据**（reports/r1789233091052…r1789233120294，用户 ?ln 逐层翻查 + 全屏台账）：
1. **全白根因 = 自动 HDR**：hina 是全语料唯一 `general.hdr=true` 的基准场景。今日 5 份上报逐份对照：
   hdr=1 的 5 份全部"每层 draw 后 0x502（79/背景/钢琴/花朵…逐层扩散）+ 画布探针恒 255,255,255 +
   shot=纯清屏灰(178)"；同场景昨日 hdr=0 上报正常渲染（非灰底>0）。逐层台账证明**层绘制参数全对**
   （36/37 层 origin 与本地期望 ≤2px、纹理非兜底），死因在"整场景渲进 RGBA16F FBO"的浮点 RT：
   该设备（Adreno/PRoot）浮点场景 RT 上 draw 即错、呈现趟失败 → 画布只剩 clearcolor。
2. **抽动/坐标错乱根因 = 坏帧过滤器两缺陷**：设备日志首行 `人物: 跳过坏帧 16/75 [0,1,2,3,58…74]`。
   本地逐骨复算：①垃圾平台内部帧漏杀——导出垃圾是"连续平台"（f62-74），二阶差分只抓平台边缘
   （f67-69,71,72 存活）→ 每周期姿态瞬间跳进垃圾再跳回 = "挂饰随机抽动"；②回绕污染——f0 的环形
   邻居是尾部垃圾 → f0-3 级联误杀 = 动画开头姿态错；③骨骼和抵消——sig 求和会掩盖单骨乱跳
   （把 58-61 好帧也拖下水）。凯尔希 主体/眼睛组合/左耳朵1、girl 的垃圾尾巴全部复现同规律。
3. **398 挂件 Δ1638 定案探针**：设备台账 398 与 1592 同位 (2833,781)，本地三条管线（parseScene/
   脚本宿主/带 userProps）均给出 (1195,823)，脚本源码确认不动 origin（cursor 事件未接线）。
   本地无法复现 → 上报层表新增 **rawOrigin** 字段（脚本跑完后的原始对象 origin）让下一份上报定案。

**修法**：
- ①`core/we-scene-bundle.js` renderScene：HDR 帧逐层 getError 前后对照（先排空残留旗标；mesh 回调趟
  补上此前 continue 跳过的错误检测）→ 命中"绘制后新出现"的错误即**本会话熔断自动 HDR 并当场按
  LDR 重渲本帧**（首帧/缩略图即正确）。`?hdr=1` 显式强制不熔断；`renderer.hdrFallback` 状态进上报
  （demo 层表同帧采集）。自动路径默认行为=扩展可用即 HDR（不变），只有设备被证实坏才退 LDR。
- ②坏帧检测抽成 bundle 纯函数 **`detectBadAnimFrames`（v3 双通道）**：尾部逐骨绝对步长切除
  （>30 的连续后缀、≤17 帧、中位步长>T/3 时跳过——文档结构"垃圾=结尾 1~17 帧"，中段合法快速段
  如左耳朵 f35-40 不受影响）+ 原邻域精修（尾部已切除 → f0 无回绕污染）。demo 蒙皮层逐帧算
  maxStep（逐骨最大绝对步长，骨和会抵消必须逐骨）与 sig 一起传入。
- ③demo 层表每层加 `rawOrigin`；蒙皮绘制失败原因进 meshSkip（已有）。

**验收**：新增 `mesh-badframe-test.mjs` **22/22 绿**（T1 合成信号；T2 hina 人物——旧检测器与设备
日志逐位一致 16 帧 [0-3+58-66,70,73,74]、v3=尾部连续后缀 [61-74]、0-3 保留、跨坏帧插值步进
9.6=合法步进无结构跳变；T3 凯尔希 主体/眼睛组合/左耳朵1 + girl 尾巴全命中不误杀；T4 退化输入）。
门禁 33/33。真机复验项（刷新后）：hina shot 非纯灰/非纯白、0x502=0、hdrFallback 字段=触发记录、
人物不再抽动；下一份上报 rawOrigin 可定案 398。

## P-42（2026-09-13）A2 GirlCat(3544152633) "人物被拉伸延伸"定案：多重 additive 动画层合成错（匹配塌缩 + 基准错）

**证据**：最新上报（ownsize 已默认关后）girl 仍异常——设备截图窗前无正常人物、左侧纵贯全屏黑色
拉长影（同一轮廓头部可辨、纵向 ~2.1 倍、甩出屏）。本地蒙皮复算 f0-f175 全部帧 bbox 稳定正确
（design [790,1668]×[915,1743]），唯一异常是 **demo 的多层 additive 合成**：
1. **匹配塌缩**：girl 的 animationlayers 声明 animId 65/71/73/94，而 MDL 解析只有 animations[0].id=65
  （其余 id=0、名字乱码）。demo 匹配器缺 elysia 的"数字后缀/层索引"两级回退 → 3 个 visible 层
  全部塌到动画 65。
2. **基准错**：旧合成把各层"帧0+增量×blend"**再求和** → t=0 即叠加 3 份动画 65 的帧 0 姿态
  （帧 0≠bind：差 2 倍）→ 实测 bbox design [248,2266]×[382,2368]（**2.3 倍**、甩出屏）——与截图
  拉长影逐位吻合。官方语义（elysia `_skinPuppet`/`_puppetBoneFinal`，锚点路径已 6 包验证）：
  **final = bindRT + Σ_additive(层相位姿势 − 该动画自身帧0)×blend**，普通层 mix。

**修法**（demo.html 蒙皮）：①animSpec 匹配补两级回退（名字 → 数字后缀 "Animation N" → 层索引 → 0），
girl 现在匹配到 3 个不同动画；②合成重写为 elysia 语义（base=bindRT，存进 sk.bindRT；additive 参考=
各动画自身帧 0，角度走最短弧）；③`?ln` 无关，无新 URL 开关（语义修复，旧行为无保留价值——
它只在"多 visible 动画层且帧0≠bind"的模型上偏离官方）。

**验收**：本地模拟新合成：girl t=0..40s bbox 恒 design [790,1673]×[915,1743]（877×828，正常坐姿
剪影位置）；凯尔希 眼睛组合只有 1 个 visible 层 → 走原单动画路径（已标定验证）行为逐位不变。
门禁 33/33。真机复验项：GirlCat 人物应出现在窗前正常比例（对照 preview.gif）。

## P-43（2026-09-13）A4 日月循环(3326873240) 白屏遮挡定案：无图 solid 占位层画白 + `scene.on/timeVarying` 缺失

**证据**（r1789233487520 全屏台账）：myLayer(顶层)/193/组件/1054 等整屏 `t=white px=255,255,255`；
raw 一看：这些层全是 **`solid:true 且无 image`** 的作者占位/容器层（193 还是 morning/dusk/day/night
的父容器）。P-34 的"缺纹理即透明"只覆盖 missingTex 分支（要求 textureName 非空），solid 分支
`layer.solid → whiteTex` 无条件画白漏网。myLayer 另带脚本 `scene.on("update", …) thisLayer.visible =
!scene.timeVarying`——宿主三缺一（`scene`/`on`/`timeVarying`）→ init 抛 ReferenceError 永久禁用 →
占位层保持 authored 可见。语料扫描：无图 solid 层 72 处（无子层 43 + 有子层 29，本场景占 8）。

**修法**：①bundle：`solid` 不再自动画白——`srcTex = ((layer.solid||missingTex) && WHITE_FALLBACK) ?
whiteTex : transparentTex`（真·纯色层走 models/util/solidlayer* 内置模型 effTex+color 路径，不受
影响；`?whitefallback=1` 恢复画白 A/B）；②脚本宿主（scene-scripts.js）：补 `scene` 全局 =
thisScene + `on(ev,cb)`（update 趟末尾触发，官方 update 事件语义）+ `timeVarying`（默认 true=官方
运行时语义，opts.timeVarying 可覆盖）；③demo 脚本同步循环补 `visible` 同步（脚本显式开关层）。
**package-baseline.json 已 --write-baseline 刷新**（transparentFallback 0→N 正是本修复的预期效果，
P-34 先例），package-matrix 输出可作留痕（3326873240:8、3660962877:6、白子mpkg:3…）。

**验收**：Node 端到端：myLayer.visible 跑脚本后 true→**false**（此前 init 即挂）；门禁 33/33；
真机复验项：日月循环 morning 可见、全屏无白块、页内健康汇总行"J 层 0x50x"=0。

## P-44（2026-09-13）A3+A5：子网格隔离机制 + 逐层调试 v3（mesh 台账 / layerHealth / 子块维度）+ A6 收尾

**A3（凯尔希点名层）事实表**（真机 texStats/台账 r1789233362349 + 本地管线，官方对照=TP8 截图）：

| 层 | 绘制矩形 vs 标定 | 纹理（解码/alpha均值/全透明占比） | 台账中心 px | 判定 |
|---|---|---|---|---|
| 长发3 | 逐位吻合（P-30/32） | 3359x2620 / a=38 / a0=85% | （整屏台账未含 mesh） | 位置正确；层内=稀疏发丝纹理，中心采样落在透明区 |
| 右侧发 | rd=[2262,180,627,1128] 吻合 | 901x1626 / a=39 / a0=85% | 178,178,178（=清屏灰） | 矩形对、bbox 中心命中透明区概率高（a0=85%）；层序=数组序（右侧发 7 → 主体 8 在其上），与官方数组序一致，无证据支持改序 |
| 长带子 | 吻合 | 943x2028 / a=36 / a0=86% | 239,246,246（亮色=内容已上屏） | 内容在画（亮绿白带），"层内内容"差异需官方逐层投影证据（P-30 已定案不可达） |
| 眼睛组合 | MDL 单网格块（任务书备注） | 584x759 | — | **不可拆**（结构事实），可拆维度=UV 窗（长条眼窗已限定凯尔希） |

结论：点名层"位置全对、层内待证"。本轮给上报装好下一轮定案的工具（见 A5），等带 mesh 台账的
新上报即可区分"稀疏纹理"与"没画"。
**子网格隔离机制**：`renderMeshLayer` 支持 `layer.__subMeshOnly=k`（rec.submeshes[k] 索引区间绘制，
跳过其它子块）；uploadMeshLayer 在 `mesh.submeshes=[{start,count},…]`（未来多材质块 MDL）时建表。
`?ln` 网格层按 Ctrl 循环 子块0..N-1→整块；单块网格如实显示"网格单块，不可拆（MDL 单材质块）"。

**A5 交付**：①**mesh 层进台账**——onMeshLayer 绘制后按着色器同式变换 bind bbox 出设计矩形 +
中心 readPixels（此前 girl 型"画没画/画到哪"无证据，本轮 GirlCat 疑案 therefore）；②上报新增
**`layerHealth[]`**（契约=TASK-A §4：`{name,drawn,rect,px,tex,alpha,fx,glErr,skipReason}`，C 会话
parity-check 直接消费）+ `healthSummary` 一行汇总，页内右下角同显"本帧 N 层：M 正常 / K 跳过(有因) /
J 未上屏 / J 层 0x50x"；③`?ln` 网格子块维度（见上）；④onLog 捕获 `层 "X" GPU 错误 0x…` 进
`__mpwGlErrs`。**层树面板**（页内点选跳层）未完成（时间预算），`?ln` 键位/上报/健康表已闭环，
面板列入下轮（W10 余项）。

**A6**：①`/probe` 路由补 404/500 语义（原 ENOENT 直接抛未捕获异常；`/diag-flags.json` 已有 404
不动）；②0x50x 归零：GirlCat/凯尔希/日月循环今日上报已=0（P-36 生效实锤），hina 由 P-41 HDR
熔断收口待真机；③`?novideo`/精灵帧/`?ownsize`：白子 houseback 可见（r1789233*）、3326873240
spriteFrames 3 种已识别，帧推进待带 A5 字段的上报确认；④`?texbudget` 小设备纹理预算默认档
（P2）未做，现仅 `?perf=auto` 有降采样——下轮连同层树面板一起交付。

---

## P-51（2026-09-13，C 会话）任务书 C 全量落地：平价基线 + 已知差异清单 + 架构文档 + 语料清单 + 门禁条件项

> 本条全部为 **C 会话新增文件/工具**，未改 A/B 的任何渲染行为。目的：把"CPU 预览对、真机 GL 错"
> 这类事故（附件锚点/脚本 origin 覆盖/ownSizes 三次）从"人肉看截图"变成**机器门禁**。

### 证据 → 工具设计（先实证、后写码）
- 台账语义复验：`layerLedger[].rd` 是设计坐标矩形 [l,t,w,h]（画布 1280×720 ×3 = 投影 3840×2160，
  全语料投影均 3840×2160 → 该换算对全部场景有效）；中心 = origin（±1px 取整）16/17 层逐位吻合。
- **凯尔希"背景正常"rd=[1431,2133,…] 假矩形定案**：demo.html onLayerDraw 注释自证的测量伪影
  （旧版取了效果链拷贝趟的 FBO 空间坐标；且中心钳位在画布边缘 → readPixels 读到清屏灰 178）——
  只影响旧上报数据，不是真绘错位（[bg帧] 行 ox/oy 正确）。→ known-issues KI-1。
- parity 的 CPU 侧矩阵约定**踩坑一次即修**：preview.mjs 的正交矩阵是 y-flip 式（m[5]=−2/ch）+
  NDC 换算 (1−ndy)/2，与 demo 台账（行向量+transpose=false → NDC y 与设计同向，(ndy+1)/2）**数学等价
  但换算式不可混用**；首版混用导致全部层 y 镜像，已改用台账同式（x/y 同式换算），5 场景 41/45 层
  中心误差 ≤2px。→ 已写进 `docs/RENDERER-ARCHITECTURE.md` 不变量 #2（防下一个写工具的人再踩）。
- 两个 rect 分叉定性为**文本/脚本驱动层**（非几何错误）：GirlCat `playerdurationexception`（Δ8679px，
  parent=Cube 音乐组件文本，其它脚本 enumerateLayers 移动它）、hina `398`（Δ1638px，origin 字段
  本身就是"拖拽存储位置"脚本对象 `value:"1195.38 1337.07"`）。→ parity 记 soft(text)/soft(scripted)，
  不吞掉真几何错误（历史三大事故全是非文本层）。

### 交付物（全部新文件，A/B 文件零改动）
| 文件 | 内容 | 验收 |
|---|---|---|
| `parity-check.mjs`（C1/W11） | 真机 layerLedger vs CPU 期望逐层对账：rect（中心≤2px/wh≤6px 越界 FAIL）+ px 三档（soft 口径受限 / FAIL 铁证=clear-miss 或色差>0.6 / diff advisory）+ ownSizes/附件锚点**自动标注** + `known-issues.json` 白名单 | 5 场景全过（41/45 ok、其余 soft/size0/known 各有定性）；`--strict` 退出 1、无上报 SKIP 退出 0；产出 `reports/parity-<id>.json` |
| `known-issues.json`（C2） | 9 条已知差异，kind=official-semantics/fallback/hack/measurement，每条带证据出处（上报文件名/代码注释/PATCHES 编号） | `docs-check` 引用健康；parity 白名单消费 |
| `docs/RENDERER-ARCHITECTURE.md`（C3） | ①模块地图（函数名级，按 bundle 内部分节）②官方语义不变量 14 条（坐标/矩阵转置约定/弧度/锚点公式/回退开关现状）③连带影响地图 12 行（改哪坏哪+对应门禁） | 文件本体；与新会话问答式验收（"某语义在哪"可直接查表） |
| `library-manifest.mjs` + `LIBRARY-MANIFEST.md` + `library-manifest.json`（C4） | 88 容器清单：**scene 21 / scene+video 22 / video 45**；结论=67 个含视频容器勿按场景渲染；scene+video 的 scene 侧全是"脚本文本层"（最大 砂狼白子11_03 119 段）；给回归集选样依据 | 一条命令产出；dd 11 个纯 scene 无预览图（视觉对照用 Testphoto） |
| `run-all-tests.sh` 重构（C5.1） | `--list`（36 项）、`--only <name>`、**条件项机制**（工具输出 SKIP+退出 0 → 门禁计 SKIP 不红）；注册 `mesh-badframe`（A 的新测试，22/22）+ `docs-check` + `parity-check`（条件项，--fast 跳） | `--list` 输出 36 项；`--only docs-check mesh-badframe parity-check` 单跑验证 |
| `docs-check.mjs` 扩展（C5.2） | ①PATCHES P-编号唯一+顺序非降（发现并容忍既有 P-22-ATTACH/P-22 后缀共存）②任务书/TASKS-INDEX 引用文件存在（elysia 裸文件名、容器内条目、~/.dsh mpkg 三类解析规则）③diag-flag-check 归并 | 15 文档/241 引用/3 类检查全过（exit 0） |
| `report-audit.mjs` 增强（C5.3） | ⑤层健康表（优先 `layerHealth[]`，回退 layers+ledger 推导，一句话汇总）⑥`--trend [N]` 跨报告趋势（稳定错/抽动/时有无——直接回答"是稳定错还是抽动"） | 单份六段 + 5 场景 trend 输出验证；当前数据无稳定错/抽动 |
| `TASKS-INDEX.md`（C5.4） | 三会话任务书/交付物/状态/验收证据索引（放 DSHarea 根） | 本文件即进度登记处 |
| `TESTING.md` 更新（C5.5） | 平价基线/六段对账/条件项语义/新测试行写全 | 表格与门禁一致 |
| `perf-profile.mjs --texreport`（C6） | 单场景纹理总量/大纹理清单/预计上传显存（w×h×4）→ `reports/perf-tex-<id>.json`，标 P0 超 4096 必降 / P1 低内存档候选 | GirlCat 38 张 289.6MB（housebasic 4948×2935=55.4MB P0）；凯尔希 46 张（长发2/衣摆/左侧发1 为降采样候选） |

### 诚实边界
- px 档单点对比跨管线（混合/HDR/过滤/解码）噪声大，实测合法差可到 0.63（blend=6 眩光层）→
  硬失败只留给"clear-miss"与色差>0.6 铁证，其余 diff 只出报告不判失败——**rect 档才是几何错误的硬门禁**。
- 蒙皮/效果链层 px 对比是 soft（CPU 预览无蒙皮无效果链）；真机首帧后行为（动画相位）由 `--trend` 的
  抽动档覆盖，parity 定格 t=0 口径。
- parity 的 SKIP 判据是"reports/ 无含 layerLedger 的上报"；真机开始产出 `layerHealth[]` 后自动升级为
  五段健康表（字段约定已写进 TASK-A §4，report-audit 已按它消费）。

## P-52（2026-09-13）B3 附带：「按键隔离」在壁纸（iframe）场景下的复核结论（插件侧批次 15）

> 编号说明（主会话整合修订）：本条原写作 P-41，与 A 会话的 P-41…P-44 撞号，且追加在 P-51 之后造成顺序回退。
> 按“谁先写谁占号”保留 A 的 P-41…P-44，本条顺延为 **P-52**（docs-check 会校验 P 编号唯一且递增）。

**结论先行**：隔离机制在壁纸里**有效且必要**，但生效原因与直觉不同——三层事实：

1. **壁纸 iframe 永远拿不到键盘焦点**：`.mpw-bgWrap { pointer-events:none }`，iframe 不解析
   该继承 → 点击/焦点全部落在宿主文档。渲染器自己的 keydown（←/→ 翻层、Home 退出）在
   壁纸嵌入里**本来就不会触发**——逐层调试的键盘导航只在独立 demo 页（:8899 直开）可用。
   壁纸里的逐层调试用法 = 经插件新「渲染器调试参数」白名单设 `ln=12` → 重挂 iframe（加载
   时 `__lnOnly=11` 生效），不是键盘翻层。
2. **用户看到的"壁纸里按方向键切宿主列表"**：焦点从来就在宿主上，方向键是宿主列表的
   原生行为，与 iframe 无关。
3. **宿主捕获吞键守卫（`mpw-ln-mode`）在此场景有效**：壁纸 URL 带 `ln` → 渲染器加载即
   `post(__lnOnly>=0)`（demo.html:1772 附近）→ 宿主 `lnMode=true` → 捕获阶段吞
   ←/→/↑/↓/Alt/Ctrl/Home → 宿主列表不再被切（插件侧已实测消息契约与来源校验）。

**本轮补的滞留漏洞（插件侧 client.js）**：壁纸切换/卸载后渲染器不会再发 `mpw-ln-mode`，
宿主 `lnMode` 若滞留 true 会**永久吞方向键**。新增 `window.__mpwLnReset()`，在
`showImageEl / showVideoEl / showSceneEl / teardownWebFrame` 四条切离路径复位；
带调试参数的壁纸被清参重挂后，渲染器新文档加载时 `post(false)` 同样会解除。

**回归**：`dsh-mpkg-wallpaper/tools/scene-watchdog-test.mjs` 39/39（含白名单净化、
看门狗状态机、作用域修复）；`bash tools/check.sh` 全绿。
**遗留给 A（TASK-B §5）**：`mpw-health` postMessage 契约（ctxLost/glErrs/texBytes/frame/sceneId）、
`?lowmem=1` 预算档、`layerHealth` 带场景身份+帧号——插件侧接收/判定/自动重建已备好。

## P-53（2026-09-13，主会话整合修订）门禁运行器静默挂死：`out=$(...)` 管道捕获 + 无单项超时

**结论先行**：`bash run-all-tests.sh` 曾在一项上**静默停住 20 分钟、零输出**（观测时 runner 阻塞在
`pipe_read`、子进程 CPU 冻结在 14 ticks）。复核结论是**两个独立问题叠加**，不是"某个测试项坏了"：
① 运行器对单项**没有任何超时**——任何慢/卡都表现为无限期无输出（实证：同一项 `tex-fmt5` 在资源紧张时
耗时 **47.8s**，正常仅 ~0.1s，这类超长停顿确实存在）；
② 输出捕获 `out=$(eval "$cmd" 2>&1)` 在"某项泄漏了继承 stdout 子进程"时会**永远读不到 EOF**（已用最小对照证明）。
两处均已修（文件属 C，主会话整合修复）。

**证据（定位过程，全部可复现）**：
- runner 阻塞在 `pipe_read`（`/proc/<pid>/wchan`）；runner 的 fd 3 与子进程 `visual-diff.mjs` 的 fd 1 是
  **同一个管道** `pipe:[136494691]`——runner 等 EOF，子进程却停在 `futex_wait_queue`（事件循环空转、
  CPU 冻结在 14 ticks）。
- 同一命令**单独跑 1 秒即过**：`PASS visual-diff-kal (1067ms)` / `✓ --check：与基线一致（SSIM 0.4808）`；
  `--only visual-diff-kal` 同样 1 秒过 → 排除测试项逻辑，锁定运行器捕获机制。

**机制证明（最小对照）**：
- 旧写法 `out=$(bash -c "sleep 60 & exit 0")` → 只能靠外层 `timeout 3` 杀掉（**124 = 永久挂住**）。
- 新写法 `timeout -k 5 10 bash -c "sleep 60 & exit 0" > "$L" 2>&1` → **64ms 返回 rc=0**。

**改动（run-all-tests.sh）**：
1. 输出改为写 `mktemp` 临时文件后 `head/tail` 读取，**不再用 `$(...)` 包命令** → 泄漏进程无法再挂住 runner。
2. 单项加超时 `timeout -k 5 "$ITEM_TIMEOUT" bash -c "$cmd"`（默认 **600s**，超时按进程组回收）；
   超时降级为 `FAIL <name> — 超时 Ns 被中止`（rc=124 单列报出），不再静默。
3. **兼容性**：`--fast/--json/--list/--only`、条件项 SKIP 判据、退出码（0/1/2）、
   `/tmp/run-all-tests-last.log` 格式全部不变；每项仍独立子进程执行。

**回归**：`bash -n` 通过；`ITEM_TIMEOUT=1 --only package-matrix` → `FAIL … 超时 1s 被中止` + 汇总 + 退出码 1；
`--only hdr-bloom visual-diff-kal docs-check --json` → 3 PASS、JSON 结构不变、退出码 0；随后全量门禁无挂起，
其中出现 `PASS tex-fmt5 (47798ms)`（正常 ~0.1s）——正是"单项无超时会静默长停"的实证，本次被如实记录为 PASS。

**顺带澄清（避免重复排查）**：`parity-check` 早已标 `slow` + 条件项（`--list` 显示 `parity-check slow 条件项`），
`--fast` 会跳过它；`visual-diff-kal` 实测 ~1s，**不需要**标 slow。

**环境事实（供 A/C 会话参照）**：本机 `free -m` 显示 **swap 已用 ~10GB / 12GB、可用内存仅 ~3.4GB**，
而 `loadavg` 仅 0.12 —— 单项"卡住但 CPU 0%"与换页 I/O 等待一致，不是死锁也不是 CPU 争用；
因此**单项超时不要设得太紧**（默认 600s 是为此留的余量），跑全量门禁前最好先确认没有别的大任务在抢内存。

## P-54（2026-09-14 凌晨，主会话整合 + 渲染器侧子任务）B6：去掉 `allow-same-origin` + 场景级 30 分钟 token

**结论先行**：批次 17 记下的"彻底修法"**已实现并双侧回归**。接口先冻结成契约文件
`RENDERER-SANDBOX-CONTRACT.md`（同时充当渲染器侧任务书），两侧按同一份契约实现。

**改了什么（宿主/插件侧）**
- `lib/index.js`：新增 `GET /scene-thumb-token?scene=<identity>`（HMAC-SHA256 + 每次启动随机 secret，TTL 30 分钟）；
  `/raw` 与 `/custom-scene-thumb`（GET+POST）在 **`Origin: null`（不透明源）** 时**必须**带合法 token 且
  identity 匹配，否则 403；非 `null` 来源行为**完全不变**（旧插件零回归）。
- `lib/client.js`：strict = `allow-scripts allow-pointer-lock`（无 `allow-same-origin`），导航前设置；
  模式计划（有 token→strict、无 token→legacy+后台取 token 后一次性升级、`?mpwsandbox=legacy` 强制）；
  **失败自动回退**（`mpw-cap{ok:false}` 或 8s 无首帧 → 退回 legacy 重挂 + diag `scene-sandbox/strict-fallback`）；
  消息来源校验收紧为 `ev.source === frame.contentWindow`（strict 下 `ev.origin === "null"`，旧前缀规则会把
  渲染器自己的 `mpw-ln-mode`/`mpw-health` 全拒掉）；diag 增 `sandbox{…}`、`renderer-iframe` 事件增 `sb{mode,reason,token}`。

**改了什么（渲染器侧）**：`:8899` 全响应集中加 CORS（含新实现的单区间 **206**）；strict 时给 http(s) 纹理/视频/音频加
`crossOrigin='anonymous'`；`toDataURL` 全部走守卫（失败置 `__mpwTainted` 不抛）；新增 `mpw-cap` 能力上报
（含 7s 模块看门狗，模块没起来就判 `ok:false`，避免 strict 永久白屏）；上报带 `thumbtoken` 时用
`credentials:'omit'` + body `sceneToken`，不带时**逐字保持旧行为**。

**踩坑（写进契约，别再犯）**：token **不能**用自定义请求头 —— 自定义头触发 CORS 预检，预检不带 cookie，
会被 DSH 鉴权墙 401（宿主路由无法自行回答预检）。所以走"简单请求"：`/raw` 用 query `&st=`，上报用 body 字段。

**回归**：插件 `bash dsh-mpkg-wallpaper/tools/check.sh` → **5 步全通过**（新增第 5 步：
`dsh-mpkg-wallpaper/tools/scene-sandbox-test.mjs` 23/0 + `dsh-mpkg-wallpaper/tools/host-sandbox-token-test.mjs` 18/0，宿主侧只走拒绝路径、不落盘）；
渲染器门禁新增 `sandbox-cors` 项（本文件同轮注册）。

**运维注意**：`:8899` 的服务器代码改了以后**必须重启该进程**（`keep-demo-server.sh` 只在不可达时才拉起）——
本轮已 kill 旧 pid 让看门狗用新代码重拉，`curl -sI http://127.0.0.1:8899/` 现在能看到三条 CORS 头。

**激活条件与回退**：token 路由属宿主代码 → **需 `dsh` 重启一次**才存在；重启前插件自动停在 legacy（与今天一致）。
strict 启动失败会 8s 内自动回退 legacy，不会出现"永久黑屏"。

## P-55（2026-09-14 凌晨，渲染器侧子任务）日月循环（用户第 5 项）落地：用户属性进脚本 + `getVideoTexture` noop + `day` 豁免 + `?time/?hour` + 插件方向键入站

**结论先行**：`docs/TIME-VARIATION-PATCH.md`（S1–S3 + R1–R4）**已全量落地**（`docs/TIME-VARIATION-RESEARCH.md` 的 RC1–RC5）。
pkg `3326873240`「夜莺Night Day Night Gradient」的 5 个时段层不再是"只有 morning"：① 作者脚本第一次真正拿到
`timevarying/display/morningtime…` 并按时钟写 `visible`；② 渲染器另有一条**不依赖脚本**的按时钟选层通路（脚本坏/缺失也兜得住）；
③ `←/→` 停到时段层可 `[加载此层]`（真机壁纸 `pointer-events:none` → 走插件已转发的 `Home`，`Alt` 仍随时退出）；
④ 停到被跳过的层时角标给出 `（已跳过：该层不可见/组合容器不绘制）` 括号提示（用户明确要求）。

**根因（逐条都有可复现证据，详见 RESEARCH）**
- **RC1** `elysia/scene-scripts.js` 里 `applyUserProperties({})` **恒传空表** → 作者脚本 `timeVarying` 永远 = false，
  `update()` 两个分支都不成立 → 5 层停在 authored（`display="0"` → 只剩 morning）。
- **RC2** 层引用没有 `getVideoTexture()` → 修完 RC1 后 `playVideo()` 第一句就抛 `TypeError`（官方语义：无视频纹理也要返回 noop 句柄）。
- **RC3** `hideUI` 正则含 `/Day/i` → 把名为 `day` 的时段层（id 781）和星期文本 `Day`（id 4881）一并抹掉（`?props=display=1` 的零改动 workaround 也失效）。
- **RC4** `window.__mpwUserProps` 从没人写（脚本宿主 `demo.html:1284` 与音量绑定 `demo.html:1157` 读的都是它）。
- **RC5** `?ln=N` 只能"再隐藏"不能显形，且插件转发的 `mpw-ln-key` 在渲染器侧**没有任何入站监听** → 全局方向键这条路是断的。

**改了什么**
- `elysia/scene-scripts.js`：S1 `applyUserProperties(noUserProps() ? {} : (userProps||{}))`；S2 新增 `videoTexRefShared()`
  + 4 个层引用工厂（`makeSceneRef→layer` / `emptyLayerRef` / `layerRefFor` / `layerRef`）各补 `getVideoTexture`。
- `core/we-scene-bundle.js`：R1 新增 `slotOfTimeLayer/timeVariantGroups/timeVariantIds/applyTimeVariation`（变体组 = 同一 `visible.user.name`、
  condition 互异、≥2 层；`?time` 可钉层、`pin/reassert/clearPin`）；R1b `hideUI` 循环里 `if (__tvIds.has(l.id)) continue`（只豁免变体层）。
- `demo.html`：S3 `window.__mpwUserProps = propsMap`；`noUserProps` 回退口；R2 建场后 `applyTimeVariation` + `?time/?hour`；
  R3 每帧脚本同步后 `reassert()`；R4a `[加载此层]/[恢复时钟]` 按钮、R4b `Home` 共用开关、R4c 入站 `message`
  （`{type:'mpw-ln-key',key}`，并预留 `{type:'mpw-time-set',name}`）；角标新增 `[时段层]` 与 `（已跳过：…）` 标注。
- `README-DIAGNOSTICS.md`：新增 3 个开关行 `time` / `hour` / `nouserprops`（`diag-flags` 双向比对 73 个 0 差异）。

**与补丁原文的偏差（4 处，全部由 `time-variation-test.mjs` 锁死）**
1. **`noUserProps` 没被转发**：补丁只在 `runScriptValueCached` 里读 `opts.noUserProps`，但那个 `opts` 是 `applySceneScripts`
   内部新构造的对象 → 不补一行转发，`?nouserprops=1` 会**静默失效**。已加 `noUserProps: opts.noUserProps`。
2. **按钮会被自己摘掉**：补丁原稿把按钮段插在 `tag.textContent = …` **之前**，而 `textContent` 赋值会清空全部子节点
   → 按钮当次 `apply()` 就被摘除。已改为把按钮段放在赋值**之后**，并加一行"不在 DOM 里就重新挂回"（`if (tag.__tvBtn.parentNode !== tag) tag.appendChild(tag.__tvBtn)`）。
3. **新增**（非补丁内容，本任务要求）：角标 `[时段层]` 标记与 `（已跳过：该层不可见 / 组合容器不绘制）` 括号提示。
4. **变体组判据收紧为"≥2 个不同时段"**（`timeVariantGroups`）：补丁原文只要求"任一成员名字像时段"，
   于是把**别的包的 UI 组**也误判成时段组，R1b 的 `hideUI` 豁免随之把它们放了出来 ——
   实测（真语料）：`3544152633` 的 `clockdraganddrop`[Clock, DAY DATE TIME(EN/JP)] 与 `3660962877` 的 `week1`[横Day, 竖Day×2]
   都只含单一 "day" 字样 → 时钟/星期 UI 层现形、`drawnLayers` 24→25、该项 `auditMs` 1626.8ms → 2932.1ms（`package-matrix --check` 报 SLOW）。
   收紧后这两个包 `timeVariantGroups` 为空、UI 层照旧隐藏（回归用例 T4f–T4h），而 `3326873240` 的 `display:5` 组与全部 V1/V3 数值**逐行不变**。

**验证（全部无浏览器）**
- **V1 静态可见性**（真 pkg + 真 bundle，`/tmp/tv-vis.mjs`）：基线 `mddn=false dusk=false morning=true day=false night=false`（与真机上报逐位一致）；
  `display=2` → `dusk=true`；`display=1 HIDEUI=1` → **`day=true`**（补丁前实测 `false`，RC3 被 R1b 修正）。
  补充：`day(变体) visible=true inVariantGroup=true`、`Day(星期UI) visible=false inVariantGroup=false`（豁免是外科手术式的）。
- **V2 脚本宿主**（`/tmp/tv-probe.mjs`）：无属性表 → 5 层全 `AUTHORED`（无 `getVideoTexture` 报错）；真实属性 → `localHour=1 → night=true`。
  TZ 扫档（真 scene.json 的作者脚本）：`Etc/GMT+12 (5) → morning` / `Etc/GMT+8 (9) → morning` / `UTC (17) → day` / `Etc/GMT-4 (21) → night`
  —— 与补丁文档 §5 V2 四行**逐行一致**。负对照（只打 S1 的副本）→ 5 层全 `AUTHORED` + `update: video.getVideoTexture is not a function`。
- **V3 渲染器端到端**（真仓库 bundle，`hideUI:true`）：`groups [display:5层]`；`before=[morning]`；`hour=3→night / 6→morning / 12→day / 18→dusk / 22→night`；
  `?time=night(hour=12)→[night]`；`加载 dusk→[dusk]`；`reassert→[dusk]`；`恢复时钟(hour=12)→[day]` —— 与补丁文档 §5 V3 **逐行一致**。
- **V4 CPU 预览**：`preview.mjs 3326873240 /tmp/tv-v55-preview.png 480 270` → `drawn layers: 39`、29,028 B PNG、0.85s（文档实测 39 层/29KB/0.9s）。
- **V5 浏览器内逐层**：**未验**（本机 headless Chromium 不可用，证据 `/tmp/headless-evidence.json`：6 档参数在 PRoot 下导航全部超时/崩溃）→ 需真机或 GUI 浏览器确认。
- **新增单测 `time-variation-test.mjs`**：**56 通过 / 0 失败，~0.6s**，已注册为 `run-all-tests.sh` 第 **38** 项（原 37）；
  覆盖属性转发、4 条 `getVideoTexture` 路径、`day` 存活、`hour→时段`（含 4/9/17/20 边界）、`?time/?hour` 解析（跑从 `demo.html` 切出的真实源码）、
  `mpw-ln-key` 入站（含 `Home`/`Alt`/`Control`/`mpw-time-set`）、按钮与 `（已跳过）` 角标逻辑；`hour→时段` 的脚本路径用子进程 + `TZ=Etc/GMT∓N` 钉死。

**门禁（本轮实测）**：`bash run-all-tests.sh` → **PASS=36 / FAIL=2 / SKIP=0，总 38 项**（新增 `time-variation` 项 PASS 0.62s）。
两个 FAIL **都不是本补丁引入**，且随后都已消解，各有实证：
- `package-matrix --check`：当时唯一剩余差异 = "`3715743282` 基线中不存在（新包）"，指向并行会话 01:38 用 `server/pack-dir.mjs` 临时产出的
  allwallpaper/packed/3715743282.mpkg（基线冻结于 09-13 02:44）——**该目录随后已由产出方删除，本项 02:0x 复跑 PASS（61.3s）**。
  另：本补丁**曾**造成的一项真退化（`3544152633` `drawnLayers` 24→25 + 该项 `auditMs` 报 SLOW）已由"偏差 4"的收紧修掉：现为 `drawn: 24 → 24`，timing 回落到工具自带噪音带内（1.59x < 1.8x）。
- `parity-check`：当时崩在 `parity-check.mjs:281` 的 `ReferenceError: gl is not defined`（该文件从未定义 `gl`；文件 mtime 09-13 06:23，触发数据是 09-13 01:11 的真机上报）→ **并行会话已于 01:59 修掉该行**；
  修后不再崩，但对 `3719111841` 给出真 verdict=FAIL（KI-5/KI-6/KI-8 skin/mesh/ownSizes 已知差异，属条件项/白名单范畴，需该包基线侧处理）——
  该包 `timeVariantGroups=[]` 且脚本里 0 处 `applyUserProperties`/`getVideoTexture` ⇒ 与补丁无关。

**逃逸开关 / 回退**
- `?nouserprops=1`：`applyUserProperties` 仍收到 `{}`（旧行为，脚本不再按时钟动）；`?noscript` 仍可整体关脚本。
- `?time=auto`（或 `Alt` / 按钮"恢复时钟"）取消钉层回到时钟；`?showui` 可整组恢复 UI 层（`day` 现在不再需要它）。
- 零改动 workaround 仍可用：`?props=display=2,timevarying=false`（dusk）/`=3`（night）/`=4`（mddn）；`=1`（day）现在**不需要**再带 `showui=1`。
- 回退代码路径：删掉 R2 的 `applyTimeVariation` 调用即回到"只有 morning"的旧行为（其余改动互不依赖、可单独保留）。

## P-56（2026-09-14，渲染器侧子任务）渲染器队列 Q2/Q5/Q7/Q8 四连修：字号 ×300/72 + 粒子默认开/官方预设兜底 + Ctrl 退出网格单块 + 日志区收纳

**结论先行**：四项全部落地并有独立验收（本机无浏览器 → 全部走 node/vm/切片探针 + 真机 :8899 服务器 HTTP 实测）。
数字：文本 **11.60px → 48.33px**（砂狼白子11_03「文本1」@1280×720）；粒子可见层 **0 → 111 层**（其中 22 层靠官方预设兜底补回定义，
材质 15/15 命中）；Ctrl 由**死键**变为可进出（单块可逆）；日志区由固定 35vh 遮屏变为 0–85% 可拖 + 完全收纳（记忆）。
门禁：`bash run-all-tests.sh` → **PASS=40 / FAIL=0 / SKIP=0（总 40 项，原 38 项 + 本补丁 2 项）**。

### Q2 文本统一小 4.1667 倍（用户第 3/11 项）
- **根因/证据**：`docs/TEXT-AND-CLOCK-RESEARCH.md` §3 H1。官方 `pointsize` 定义 = "font size in points for 300 DPI"
  （`wallpaper_engine/ui/dist/monaco/autocomplete/lib.sceneScript.d.ts:838-841`）→ 像素 = pointsize×300/72；
  渲染器把它当 CSS px 直接用。
- **锚点/改动**：`demo.html` `rasterizeTextLayer`（旧 :1547 `const pt = Math.max(6, t.pointsize || 32)`）→
  新增 `ptScale`（默认 `300/72`，`?pts=raw` 回旧口径 1）+ `logf` 启动横幅；字段说明注释（旧 :1491）同步订正。
- **数值（前后）**：pointsize 34.798 → 场景单位 **34.798 → 144.9917**，1280×720 画布（投影 2160）
  **11.5993px → 48.3306px**；默认 pointsize 20 时 `ctx.font` = `83.333px`（旧 20px）。
- **测试**：`text-layout-test.mjs` 重写期望值以**冻结新口径**（原测试的 mock `measureText` 直接吃 `ctx.font` 的 px，
  所以"pointsize 当 px"在测试里自洽 → 改代码也照样过，这是它此前抓不到该 bug 的原因）；
  **21 → 29 断言**（新增 Q2a–Q2f：×4.1667、`?pts=raw`、34.798→144.9917→48.33、真 mpkg 逐层核对）。
  变异验证：把乘法改回旧式 → **10/27 通过**（红），说明冻结有效。
- **回退**：`?pts=raw`（单参数，无副作用）。

### Q5 粒子默认被关 + 官方预设无兜底（用户第 17 项）
- **根因①**：`demo.html:2191` 旧 `hideParticles: !has('np')` → 不带参数时 bundle（`core/we-scene-bundle.js:1356`）
  把所有粒子层 `visible=false`；`?np` 从未写进用户文档。**改为** `has('noparticles') || has('np')`（默认开、显式关、
  `?np` 保留为别名）；`demo.html:2642` 那个 `createRenderer` 死键同口径并注明"createRenderer 不读该键"。
- **根因②**：`readParticleDef` 只查包内 → 25 个 ref / 32 层必不出。新增三级链（都在 `demo.html`）：
  ① 包内（同步，签名不变，`parseScene` 依赖）② 材料 loader 同款 `/weassist/<path>` ③ **basename 索引**
  → `/weassist/<assets 相对路径>`；索引 `PARTICLE_PRESET_INDEX`（**118 条**，由 `gen-particle-index.mjs --write`
  从 `wallpaper_engine/assets/presets/**/particles/presets/*.json` 生成，重名且内容不一致者**不收录**，宁缺勿错）。
  新增 `resolveParticleDefs()`（`await` 于 `loadScene()` 之前）+ `particleMaterialCandidates()`（材质兜底）。
- **数值（前后）**：默认可见粒子层 **0 → 111**（语料去重口径）；`defMissing` ref **25 → 10**，
  层 **32 → 10**（补回 **15 ref / 22 层**）。研究写"16/25 ref"：第 16 个是 particles/new_particle_system.json（编辑器默认名），
  它只存在于 `wallpaper_engine/assets/scenes/particleelementpreviews/*/particles/` 的 **40+ 份互不相同**的编辑器预览副本
  → 歧义，按策略不猜（`--scan-corpus` 模式可复现该结论）。剩余 9 ref / 9 层为工坊私有（本地无源）。
- **材质链（不修则"有 def 也画不出来"）**：预设立方图的材质不在 `assets/materials/**` 而在
  `assets/presets/<主题>/materials/presets/<名>.json` → 新增同主题候选；实测 **15/15 材质命中、15/15 贴图命中**
  （贴图仍走原 `loadTex` 的 `/weassist/materials/<name>.tex`）。
- **真机 HTTP 实测（:8899，未改服务器、未起新服务）**：`/weassist/particles/presets/fog1.json` → **404**（旧口径），
  `/weassist/presets/fog/particles/presets/fog1.json` → **200**；对用户第 3 项那个包
  `砂狼白子11_03.mpkg`：2 个粒子层（`Trails 2`/`萤火虫`）**def 全部补回**（`particleDefSource=preset-index`）、
  材质 200（blending=additive）、贴图 200。
- **测试**：新增 `particle-preset-fallback-test.mjs`（**57 断言 / 1.2s**，已注册 `particle-presets`）：
  索引↔磁盘逐条一致、25 ref 候选链逐条、**真实 bundle `buildParticleSystem`+`simulateParticleSystem` 断言 15/15 alive>0**
  （官方预设 `starttime` 最大 15s → 模拟到 t=20s）、`resolveParticleDefs` 桩 fetch 三分支、材质候选、
  `hideParticles` 真值表（不带参数/`?noparticles`/`?np`/`?showui`）+ 真包 `3544152633` 契约（16/16 可见 vs 0/16）。
- **未动**：`render-audit.mjs` 仍硬编码 `hideParticles:true`（审计口径不变）、`preview.mjs` 仍跳过粒子层。
- **回退**：`?noparticles`（或 `?np`）一键回到"全关"。风险：默认开粒子后老标定截图的背景光晕会变（这是修复本身）。

### Q7 Ctrl 无法退出"网格单块不可拆 MDL 单材质块"（用户第 7 项）
- **锚点（缺陷两处）**：① 单块状态只有 setter：`demo.html` 旧 :2225 `else cur.__lnNoSubMesh = true`，无任何清零点；
  ② 入站监听（`mpw-ln-key`）**没有 Control 分支** → 落到 `else return`，而插件侧确实会吞掉并转发 `Control`
  （`dsh-mpkg-wallpaper/lib/client.js:2966` keys 数组含 `"Control"`、`:2975` postMessage）。
  单块是当前语料的常态：`core/we-scene-bundle.js:3910` 只在 `mesh.submeshes.length > 1` 时建子块表，
  且 `window.__mpwSubMeshCount` 至今无人写 → n 恒 0；唯一消费点 `core/we-scene-bundle.js:3954`（`__subMeshOnly`）。
- **改动**：新增共享 `ctrlAction()`（组内退级 / 多块 0→1→…→整块 / **单块进↔出** / 普通层 enterGroup），
  键盘路径（`demo.html:2244`）与入站路径（`demo.html:2296` 区）共用；角标文案补"：Ctrl 退出"；
  `Alt`=退出、`Home`=时段层钉层/退出 语义**逐字未动**。
- **测试**：`time-variation-test.mjs` **56 → 64 断言 / 0 失败**（T7a/T7j 按新语义改写，新增 Q7a–Q7h：
  单块进/出、多块 0→1→2→null、组内退级、普通层 enterGroup、文案与"键盘路径已改调用共享实现"）。

### Q8 :8899 底部日志区可收纳（用户第 15 项）
- **锚点/改动**：`demo.html` CSS `#log`（`max-height:35vh` → `height:35vh`，`overflow:auto` 保留）+
  新增 `#logbar`（手柄，收起时缩成右下角小药丸 `.collapsed`）+ 内联 `<script id="mpw-log-panel">`：
  拖动改高度（0–85% 窗口，<24px 吸附为 0）、点箭头/Enter 收起↔展开、键盘 ↑/↓±32px/Home=35%/End=收起、
  箭头 ▾↔▴、`aria-expanded`。
- **"不遮壁纸"**：完全收起 = `#log { height:0; display:none }`（日志本体离屏），面板上只留 16px 高的小药丸作为拉出口。
- **记忆**：`localStorage['mpw-log-h']` = `'collapsed'` 或高度比例（默认 `0.35`）；不透明源（插件 strict 沙箱）
  下读写抛 `SecurityError` 已 try/catch → 面板仍可用（未新增任何 URL 开关，`diag-flags` 计数不受影响）。
- **测试**：新增 `log-panel-collapse-test.mjs`（**28 断言 / 0.1s**，已注册 `log-panel`）：默认/点击/拖动/吸附/
  上限/缩放/键盘/三种历史值/抛错降级，逐条断言 DOM 侧可观察结果。

### 文档与门禁
- `README-DIAGNOSTICS.md`：新增 `pts`（①区）、`noparticles`（②区）两行；`np` 行按代码订正（"存在即开"→"存在即关"）；
  头部计数 73 → **75**；`FLAG-TABLE-END` 之后新增"页面内 UI（非 URL 开关）"小节登记日志手柄与 `mpw-log-h`。
- `run-all-tests.sh`：新增 `particle-presets`、`log-panel` 两项（38 → **40**）。
- **本轮实测**：`bash run-all-tests.sh` → **PASS=40 FAIL=0 SKIP=0**（含 `package-matrix` 60.8s、`parity-check` 21.0s、
  `layer-rect-kal`、`visual-diff-kal` PASS）；`node demo-syntax-check.mjs` 7/7；`node --check core/we-scene-bundle.js` ✓；
  `node diag-flag-check.mjs` 75==75 0 差异；`node docs-check.mjs` ✓。
- **本机不可验（需真机/浏览器）**：① 4.17× 字号在**真实字体**下的观感（回退字体的墨高 ±15%）；
  ② 粒子在真机 GL 上的混合/HDR 表现与帧率（`preview.mjs` 不画粒子，本机无 headless 浏览器）；
  ③ 拖动手柄的真实指针手感与 `#logbar` 与壁纸 iframe 的层叠观感。
- **回退开关**：`?pts=raw`（字号）、`?noparticles`/`?np`（粒子）；Q7/Q8 无 URL 开关（Q8 用 localStorage 记忆，清 `mpw-log-h` 即复位）。

## P-57（2026-09-14，渲染器队列批次 2）N1–N7 七连修 + `embed=1` 消费：伊蕾娜相框满屏 / Girl and cat 抽动 / MDLA 记录游走 / 四类文本开关 / 🔊 音频面板 / 脚本节拍与 frametime

> 依据（权威、只读调研）：`TASK-RENDERER-QUEUE.md`「批次 2（N1–N7）」+「N6 细化规格」、
> `docs/VIDEO-AND-TWITCH-RESEARCH.md`、`docs/TEXT-AND-CLOCK-RESEARCH.md`。
> 本文档为**报告**（未改调研稿）。全部验证在本机（无浏览器）完成；真机项见文末。

### N1+N2 第6项 伊蕾娜相框（`3660962877`）视频只铺右下角 —— **必须同批**
- **根因**：① `demo.html` 把 `canvasSize` 传成**数组** → `engine.canvasSize.x === undefined` →
  脚本 `0*undefined = NaN` → 该层 origin 被写坏（真机 `rawOrigin="NaN,NaN"`、`scriptErrs` 116 次
  `reading 'x'`）；② "近整屏层自动居中"兜底**忽略 `alignment`**，把 `bottomleft` 层的 origin（= 四边形的一个**角**）
  无条件设成画布中心 → 四边形只剩中心点右上象限（真机 `layerLedger.rd=[1920,-1221,3999,2301]`、截图右下 1/4）。
  而它的触发判据（origin 落在画布盒 ±50 之外）对四角锚点整屏层**天然成立**（那是作者故意的出血量）。
- **改动**：① `demo.html:1586` → `canvasSize: { x: cv.width, y: cv.height }`（1 行）；
  ② 新增 bundle `applyScriptedFullscreenFallback(scene,{alignZero,canvasW,canvasH})`（demo 在 boot 兜底位置调用）：
  由 `origin`+`alignment` 反推**实绘矩形**，**覆盖投影 ⇒ 保留 authored/脚本值**；确实不覆盖才兜底，
  且兜底把**矩形**居中（`origin = 中心 − 半宽 + 锚点偏移`），alignment 语义与绘制端一致；
  `?align=0` 语义不变（绘制端把它视作 center，判定/兜底同步按 center → 与旧行为逐像素一致，A/B 逃逸口仍在）。
- **验证**：新测试 `fullscreen-recenter-test.mjs`（**28 断言 / 0.12s**，注册 `fullscreen-recenter`）用包内真实值
  （id=1003/size 4000×2300/scale 1/`alignment=bottomleft`/authored origin `-63.45398 -89.85278`）断言：
  只修 N1 反而更糟的反事实 `origin=(1983.45,990.15)`；**N1+N2 后**脚本增量 → `origin=(0,2160)` →
  `rd=[0,-140,4000,2300]` **满屏**（报告预期值逐位）；旧实现 `rd=[1920,-1220,4000,2300]`（覆盖 25%）；
  `?align=0` → `rd=[-80,-70,4000,2300]` 满屏（= 报告零代码探针预期）。`node preview.mjs 3715743282`
  前后 **sha256 完全相同**（`54c35693…`，CPU 参考路径不受影响）；`camera-fillmode`/`camera-node`/
  `layer-rect-kal`/`visual-diff-kal` 全 PASS。

### N3 第2项 Girl and cat（`3544152633`）抽动 / 书向后抽
- **根因**：MDLA 每条动画末尾 6 帧是导出垃圾（girl：anim65→174-179、anim71→84-89、anim73/94→174-179），
  单动画路径有"跳过坏帧 + 跨坏帧插值"，而**多 additive 层合成分支直接取原始帧号**
  （`a2 = floor(ph2) % len2`）→ 相位每进垃圾尾巴就把垃圾姿势按 blend 加进骨架：rate=1 两层每 6.0s、
  rate=0.38 那层每 7.89s 抽一次。
- **附带发现（重要）**：原单动画路径的自检日志引用了**未声明变量 `step`**（`Math.max.apply(null, Array.from(step))`），
  抛 ReferenceError 被同一个 catch 吞掉 → `goodFrames` 被重置成**全部帧** ⇒ P-41 的坏帧过滤在**所有**单动画层上
  实际是**死代码**（第1项 hina 一类层同样从未真正过滤）。本批一并修掉（自检改用 `anim0.maxStep`）。
- **改动**：bundle 新增 `analyzeAnimGoodFrames(mesh, sampleRT)`（**按动画**建好帧表：同一套 `sig`/`maxStep` +
  `detectBadAnimFrames`）与 `sampleCompositeAdditivePose({mesh,bindRT,animSpec,animGood,tAnim,fps,nb,sampleRT})`
  （P-42 语义不变：`final = bindRT + Σ_additive(层相位姿势 − 该动画帧0)×blend`；**每层相位改为在该动画好帧表上
  定位 gPrev/gNext 并跨坏帧插值**）；`demo.html` 多层分支改为调用它，`l.__skin` 增加 `animGood`。
- **验证**：新测试 `animation-badframe-test.mjs`（**21 断言 / 0.28s**，注册 `animation-badframe`）用真包复刻
  "多层合成 + gBones + 438 顶点蒙皮"逐帧扫描 12s：新行为逐帧最大位移 **5.6** 单位（中位 1.45），
  同路径旧行为 **1352** @t=6.00s（中位 1.50，×903）；正常帧 bbox `[-510,-481,508,480]` = 真机 `meshGeom.girl` 逐位；
  四条动画的坏帧集断言为 174-179 / 84-89 / 174-179 / 174-179。

### N4 MDLA 记录游走（`elysia/we-renderer/puppet.js`）
- **根因**：旧游走假定"下一条动画记录紧跟在 `segBytes*boneCount` 之后"，但每条记录段数据后还有**一段长度不定的
  尾部**（girl 实测 131 字节）⇒ `animations[1..3]` 的 id 读成 0、name 读成乱码（文件真实值 71/73/94 +
  "Animation 2/3/4"，头在 132193/174961/259849）；`an.fps` 从未解析（demo 硬编码 30）。
- **改动**：改为**结构定位下一条记录头**（严格校验 name/loop 无控制符、fps∈[10,240]、零字段、
  `boneCount` 与 MDLS 一致、`segBytes` 自洽；失败退宽松档，再失败退**旧顺序游走**兜底）；
  记录里的 fps（`00 00 f0 41` = 30.0f）与 `loop` 令牌一并解析进 `animations[]`。
- **验证**：新测试 `mdla-walk-test.mjs`（**17 断言 / 0.22s**，注册 `mdla-walk`）：id/name/fps/seg0 逐位对齐真值，
  旧游走 id `65,0,0,0` + 乱码名字作反证，**新旧游走帧数据逐位一致**（segs/frameCount/segBytes 全同 → 采样零回归）；
  另跑一次性语料回归：11 包 / 8 模型 / 13 条动画，**帧数据 0 处不一致**，5 处 id + 5 处 name 修正，13 条 fps 解析成功。

### N5 四类文本可见性开关（用户决策 A）
- **根因**：`hideUI` 正则把 `Clock|Date|D a y|Day|时间|日期|星期` 等**无条件**隐藏 → 语料实测 319/439 = 73%
  文本层从未显示（11 个容器"一个字都没有"）。
- **改动**：四类词从 `uiRe` 移出，改为四个开关（契约名 `showclock`/`showdate`/`showweekday`/`showfps`，
  值 `0`/`1`；缺省 clock/date/weekday **显示**、fps **隐藏**）；`?showui` 仍是"整组全显示"且**优先**；
  TIME-VARIATION 时段层豁免保持不变。**开关只作用于文本层（`__text`）**：同名非文本层（时钟/日期 solid 底板、
  分组层、独立 `Frame`）与 `Clock Container`/`Text Container` 保持旧口径隐藏 —— 这一条是
  `package-matrix --check` 不漂移的关键（放出来会让 9 个包各 +2 透明回退，实测）。
  fps 类是新类别：整块帧率 widget（`帧率显示` + `帧率位置` + `帧率三角*`）随开关一起隐藏（只藏数字会剩悬空装饰）。
- **验证**：新测试 `text-switches-test.mjs`（**35 断言 / 0.3s**，注册 `text-switches`）：默认/单开关/全开/全关矩阵、
  `?showui` 优先、时段层豁免、同名非文本层恒隐藏；真实包 `3327063360`（21 个文本层）可见数
  **旧 6 → 默认 17 / 全开 18 / 全关 5**，且非文本层可见集与旧口径的差异**只出现在 fps 类**（3 层：帧率位置/帧率三角×2）。
  `time-variation-test.mjs` 的 T4 段按新契约更新（67 断言全绿）；`diag-flag-check` 80→**81** 行 0 差异。

### E（小项）`embed=1` 消费
- **根因**：插件 `applySceneViaRenderer` 恒带 `embed=1`，渲染器从不解析（README 记"发送未消费"）；
  壁纸 iframe 是 `pointer-events:none`，日志面板默认展开后用户**无法手动收起**（第 15 项的由来）。
- **改动**：`<script id="mpw-log-panel">` 新增 `embedMode()`（`new URLSearchParams(window.location…).has/get('embed')`）：
  `embed` 且**无 localStorage 记忆**时首次加载即**完全收起日志 + 隐藏右下角手柄**；`?embed=0` 强制关掉该模式；
  用户手动调过的高度优先（不覆盖）。README 主表新增 `embed` 行、历史表标注"已消费"。
- **验证**：`text-switches-test.mjs` T6（8 断言：收起/手柄隐藏/箭头 ▴/不带 embed 仍 35%/`embed=0`/记忆优先）；
  `log-panel` 回归 28 断言仍全绿（面板脚本在无 `location` 的假 DOM 里也不崩）。

### N6 :8899 顶栏 🔊 音频面板（用户决策 C）
- **改动**：纯客户端、零服务器改动。`demo.html` 新增可切区块 `MPW-AUDIO-PANEL-BEGIN/END`：
  枚举 = `pkg.entries` 音频条目（mp3/ogg/oga/opus/wav/flac/m4a/aac）∪ `scene.json` sound 层引用（**同一文件只列一次**
  + "被 N 层引用"）；MIME 走 **magic 字节嗅探**（RIFF/WAVE、fLaC、OggS、ID3、MPEG 帧同步、ftyp、ADTS）+ 扩展名兜底；
  每条一行：文件名/大小/时长/格式/引用数 + `▶︎`/`⏸` + `↓`（`<a download>` + Blob URL）；复用场景 sound 层那一个
  `AudioContext`/`analyser`，暴露 `window.__mpwAudio = { ctx, analyser, current }` 与每帧 `window.__mpwAudioFrame?.(freqData)`
  **预留位**（本批不实现任何效果）；面板开关存 `localStorage['mpw-audio-open']`。
  **内存口径**：开机只读条目索引 + **12 字节头部**（零拷贝 `subarray`），整条音轨只在"首次展开/点播放/点下载"时切片一次
  并立即转 Blob（凯尔希 4 条 MP3 合计 34.6MB，开机即全读会白吃 35MB）。**仓库不预置任何音频文件**。
- **验证**：新测试 `audio-panel-test.mjs`（**46 断言 / 0.1s**，注册 `audio-panel`：切真实区块 + 假 DOM/假包，
  覆盖 MIME 嗅探 7 种、枚举/去重/引用数、下载触发、播放暂停 + ctx 复用、localStorage 记忆、钩子位、
  空包/条目缺失边界、开机不 materialize）+ `audio-panel-real-test.mjs`（**6 断言 / 0.26s**，注册 `audio-real-pkg`：
  真包 `3719111841` 凯尔希 → **4 条音轨**、全部 `audio/mpeg`、合计 34.6MB、每条被 1 个 sound 层引用）。

### N7 脚本宿主补完（第12项）
- **根因**：脚本节拍一刀切 **4Hz**，而 WE **没有** FPS API —— 语料"帧率显示"是文本脚本自己计时
  `fps = 1000/(now-oldFrame)`，靠"宿主多久调一次 update"成立 ⇒ 恒显示 `fps: 4`；`engine.frametime` 从不传 → 恒 1/60
  （22 个容器用它做平滑/积分）。
- **改动**：`demo.html` 节拍分层 —— **文本/时钟/帧率类脚本 ≥30Hz**（`?scripthz=` 可调，`0` 回退旧的"全部 4Hz"），
  其余脚本保持 4Hz，同一帧只跑到期的那一档；高频趟用 bundle/宿主新参数 `nodeFilter`（只跑"`__text` 层子树"的脚本节点）
  且 `fireUpdate:false`（不重复触发 `scene.on('update')`，避免回调被放大 8 倍）；渲染循环把上一帧真实秒数传入
  `frametime`，宿主每次运行前刷新缓存 context 上的 `engine.frametime`（编译期冻结 → 每帧真值）。
- **验证**：新测试 `script-tick-test.mjs`（**16 断言 / 3.4s**，注册 `script-tick`）用**语料真实 FPS 脚本**
  （`3326873240` 包内原文）+ 真实宿主实跑：~60Hz 节拍 → `fps: 60`，~4Hz → `fps: 4`；
  `engine.frametime` 两次调用读到 `0.0167`/`0.0333`（同一缓存脚本，证明逐次刷新），不传时兼容 1/60；
  `nodeFilter`/`fireUpdate` 行为逐条断言。

### 门禁与文档
- `run-all-tests.sh`：新增 7 项（`fullscreen-recenter`/`animation-badframe`/`mdla-walk`/`text-switches`/`script-tick`/
  `audio-panel`/`audio-real-pkg`），40 → **47 项**（其中 3 项缺语料包自动 SKIP）。
- `README-DIAGNOSTICS.md`：主表新增 `showclock`/`showdate`/`showweekday`/`showfps`/`scripthz`/`embed` 六行
  （75 → **81**，`diag-flag-check` 0 差异）；"页面内 UI"表登记 🔊 音频面板 + `mpw-audio-open`；
  历史表 `embed` 改为"已消费"。
- `time-variation-test.mjs` **T9 时区夹具修正**（测试自身缺陷，非渲染逻辑）：`((off+12)%24)-12` 在偏移 < −12 时
  产出 `Etc/GMT+13…+23`（tzdata 无此名）→ TZ **静默回退 UTC** → localHour 变成 UTC 小时，**UTC 19:00–23:59
  这 5 小时窗口内 T9 必然假红**（本轮 03:1x CST = UTC 19 实测命中，与 N1–N7 无关）。改为真"模 24"归一
  （`((off%24)+24)%24; if (off>11) off-=24`）→ 24 小时 × 4 档 = 96 组合全部 TZ 合法且 localHour == target。
- `package-matrix.mjs` **审计口径修正**（非放宽）：`transparentFallback` 原先按**名字**回查 `__text`
  （`scene.layers.find(name===n)`）→ 同名"文本层 `Clock`"与"底板层 `Clock`"互相遮蔽，把文本层的透明回退误计成异常
  （N5 让时钟文本默认可见后 9 个包各 +2 的假红）。改为**按层号**判定 `__text`（文本层恒排除，与文件内既有注释口径一致）。
- **本轮实测**：`bash run-all-tests.sh` → **PASS=47 FAIL=0 SKIP=0**；`node demo-syntax-check.mjs` 7/7；
  `node --check core/we-scene-bundle.js` ✓；`node diag-flag-check.mjs` 81==81；`node docs-check.mjs` ✓；
  `node publish-check.mjs --assets …` 仅剩 `LICENSE` 1 条阻塞（他人工作流，未新增）；
  `node package-matrix.mjs --check` 无退化；`node parity-check.mjs` 6 场景 PASS。
- **本机不可验（需用户真机/浏览器）**：① `?align=0` 与修后 3660962877 的**满屏观感**（本机无浏览器）；
  ② 四类文本开关打开后桌面上的实际观感（字体回退 + 时钟/日期/星期位置）；③ 🔊 面板的**真实播放/下载**
  （本机无音频设备/浏览器；逻辑链路已由真包 4 条 MP3 枚举 + 假 DOM 播放/下载断言覆盖）；
  ④ N3 抽动手感（建议 `?id=3544152633` 连续看 ≥30s，t≈6.0s/7.9s 两处；`?skin0` 反证）；
  ⑤ N7 帧率文本（`?showfps=1` 应显示真实帧率而不是 4）。
- **回退开关**：`?align=0`（N2 对照）、`?scripthz=0`（N7 回 4Hz）、`?showclock=0`/`?showdate=0`/`?showweekday=0`/`?showfps=1`
  （N5 四类）、`?embed=0`（关 embed 收起行为）、`?showui`（整组显示 UI/文本）。

## P-58（2026-09-14，渲染器队列批次 3）H0 hina 白屏：自动 HDR 判据收紧 + `blitFramebuffer` WebGL2 签名；H1 `?meshsize` 网格 size/cropoffset 实验开关（默认关）+ KI-10 降级为口径问题

> 任务书：`TASK-RENDERER-QUEUE.md` 批次 3（H0 一行级 / H1 puppet 网格消费 `size`/`cropoffset`）。
> 环境纪律：本机无浏览器（Playwright 起不来），全部验证走 node + mock-GL + 生产解析器；两个新测试注册进门禁。

### H0 第1项 hina（`3554161528`）白屏：HDR 呈现趟把没写过的纹理全屏合成

- **锚点**：`core/we-scene-bundle.js` 自动 HDR 判据（P-58 前 `~4814-4816` 内联三元式）、`presentHdrScene` 的 `!progs` 兜底 blit（P-58 前 `~4084`）。
- **根因**：层实际画在**默认帧缓冲**（`compositeLayer` 内无条件 `bindFramebuffer(gl.FRAMEBUFFER, null)`），
  而帧末 `presentHdrScene` 把**从未被写入**的 RGBA16F 场景纹理全屏合成 ⇒ 正确画面被整屏替换成白/空；
  熔断器只看"层绘制期间 `gl.getError()`"（层画在默认 FB 上不报错）⇒ 12/12 上报 `hdrFallback: None`。
  hina 是全语料唯一 `general.hdr=true` 且 `general.bloom=false` 的包，而 HDR 链的唯一消费者是 bloom。
- **改动 1**：判据抽成导出的纯函数 `resolveHdrWant(opts, general, hdrForceLdrSession)`（`core/we-scene-bundle.js`），
  自动分支追加 `&& bloom 为真`；`?hdr=0`/`?hdr=1` 两路语义与 `hdrForceLdrSession` 熔断语义**逐位不变**。
- **改动 2**：`presentHdrScene` 的兜底 blit 改成 WebGL2 的 **10 参**签名（`READ/DRAW_FRAMEBUFFER` 显式绑定 +
  `blitFramebuffer(0,0,w,h, 0,0,w,h, COLOR_BUFFER_BIT, NEAREST)`）——旧代码把 FBO 当第 1 参传了 11 个参 ⇒ 参数错位。
- **验证（mock-GL 插桩，hina 默认路径）**：
  - 修前：`clear → fbo#31|tex#32`（HDR FBO）、`draws total=43 to DEFAULT=16`、**进 HDR FBO 的 draw = 0**、
    **采样 HDR 纹理的 draw = 1**（全屏 present）、日志 `[hdr] 场景渲进 RGBA16F FBO 1280x720`。
  - 修后：`clear → DEFAULT`、`draws total=42 to DEFAULT=15`、**进 HDR FBO 的 draw = 0 次（无 HDR FBO 被创建）**、
    **采样 HDR 纹理的 draw = 0**、无 `[hdr]` 日志 —— 与 `?hdr=0` 对照跑的调用轨迹**逐行相同**（clear/draw/采样/每层 FBO 汇总全等）。
  - `preview.mjs`（CPU 参考；`MPW_SCENE_ROOT=samples/wallpapers`）320×180：修前/修后 PNG **md5 相同**
    `cee10174086e72592111f86e8a315b0b`（HDR 是 GL 路径，CPU 参考路径不受影响，符合预期）。
    ※ 该样例目录已于 **P-87（2026-09-15 版权）整目录删除**（真实工坊壁纸不再随仓库分发）；此行是当时命令的原始记录。
  - 新测试 `hdr-predicate-test.mjs`（**21 断言 / 0.3s**，门禁项 `hdr-predicate`）：hdr×bloom×`?hdr=0/1`×熔断 真值表
    + 真实包分支（hina `hdr=true/bloom=false → LDR`、`3778592720` `bloom=true/hdr=false` 行为不变）。
- **用户真机验证**：hina URL 去掉/保留 `?hdr=0` 应得到同一画面（本机无 Adreno，白→正常的具体像素值只能在真机看）。

### H1 第4项 凯尔希（`3719111841`）：网格路径消费 `layer.size`/`cropoffset` —— **研究稿方向被官方标定反证**，改为默认关的实验开关

- **锚点**：`core/we-scene-bundle.js` `uploadMeshLayer`（`__center` 计算处）、`renderMeshLayer`（第 9 参 `opts2.noCenterComp`）、
  新导出 `meshBBox`/`meshLayerFit`；`demo.html` `loadScene`（挂 `layer.__cropoffset`）、`?meshsize` 解析（OWN_SIZE 之后）、
  `onMeshLayer` 调用点（`renderMeshLayer(...)` + 台账矩形）。
- **研究稿主张**：`renderMeshLayer` 画"网格原始范围"，不读 `layer.size`/`model.cropoffset`，
  故 主体/长发3/左耳朵1 的 gl/cpu 尺寸比 = 0.838/0.853/0.528，应按 `size/bbox` 放大并用 `cropoffset` 校正 origin。
- **P-58 复核结论（三条独立证据，方向相反）**：
  1. **官方标定**：`refrender-3719111841.json`（官方矩形）里三层 = 主体 `[1268.18,251.97,1399.80,2073.37]`、
     长发3 `[245.46,718.00,1986.05,1619.47]`、左耳朵1 `[1777.93,77.98,444.89,394.99]`，与**今天的"bbox×scale"画法**
     逐位吻合（Δc ≤1.0px / Δwh ≤1.4px）；换成 size 框口径反而差 **269/342/399px**。
  2. **纹理留白全透明**：生产解码 + 逐像素统计，5 个 puppet 层的网格 UV footprint **恰好等于**纹理不透明 footprint，
     "不透明像素落在网格 UV 框外"计数 = **0**（主体不透明 34.8%、长发3 14.6%、左耳朵1 9.7%、眼睛组合 8.2%、右眼上眼睑 5.3%）；
     且凯尔希网格坐标与 mip0 纹素 **1:1**（实测 `u = 0.5 + x/size`，`size` = `autosize` 的 mip0 尺寸）
     ⇒ "bbox 框"与"size 框"的**可见像素相同**，比值差是台账/基线口径，不是错位。
  3. **`cropoffset` 运行时不消费**：`REVERSE-FINDINGS-4.md` RE-02（wallpaper64/32 双 exe 字节级 0 命中、对象解析器逐键核对、
     wer-ref（GPL-2.0-only）/lwe-ref（GPL-3.0）/we-layerd-ref（**无许可**＝保留所有权利）三者零实现；三者均**仅行为对照、未取代码**）；elysia 侧同名结论（`puppet.js:21`），且其"用 cropoffset 偏移网格"的 commit 已被官方 revert。
- **落地（用户口径：默认零变化 + 真机 A/B）**：
  - `mesh.__bbox = [x0,y0,x1,y1]`（min/max，与 demo 台账既有同名键同形）在 `__center` 计算处一并留存；
    新增 `meshBBox(mesh)`（缓存读/懒算）与纯函数 `meshLayerFit(layer, bbox, {ySign, cropOffset, alignZero})`。
  - **`?meshsize=1`**：`scaleXY = size·layer.scale / bbox`（y 乘 `ySign`），实绘中心 = `origin + alignment` 枢轴偏移
    （网格 bbox 中心落到该中心）；**`?meshsize=crop`**：网格空间中心改用 `model.cropoffset`（研究稿提案）。
    旗标开时给 `renderMeshLayer` 传 `{noCenterComp:true}` 停用 `__center` 补偿（避免双重校正）；旗标关时
    调用点三行恒等（`originXY=[ox,oy]`、`scaleXY=[sx,ySign·sy]`、不传第 9 参）⇒ **默认路径零改动**。
  - `?mcc=0/1` 语义不动（`__useC = MCC_ENABLED && !!__c && !(opts2 && opts2.noCenterComp)`）；台账矩形改用本次实绘
    `originXY/scaleXY`（旗标关时与旧式逐位相同），旗标开时多记 `msc` 字段。
- **验证**：
  - 新测试 `meshsize-test.mjs`（**48 断言 / 1.5s**，门禁项 `meshsize`）：
    A 段（默认）复现 **0.838/0.923、0.853/0.891、0.528/0.496** 且与官方标定 ≤1.4px；
    B 段（`?meshsize=1`）比值 = **1.0/1.0**、实绘宽高 = `size×scale`、中心 = `layer.origin`；
    C 段 crop 模式位移 = **(+852.7, −300.5)px**（长发3，研究稿公式净效果）；
    D 段调用点/旗标/mcc 接线契约；E 段 alignment（left/top）、`?align=0`、`ySign`、负 scale、退化保护；
    F 段 **mock-GL 端到端**：`?mcc=1` 下偏心肌 `u_Origin=[980,540]`（补偿仍生效）、`noCenterComp` 下原样透传、真包三层 uniform 与算术逐位一致。
  - **零回归（默认路径，改动前后逐位相同）**：`layer-rect-check 3719111841 --json`（含 `--refrender`：中位 0px / 最大 79px 不变）、
    `render-audit.mjs 3719111841`、`visual-diff --id 3719111841 --check --skip-render`（SSIM 0.4808→0.4808）三份输出 **diff 全等**。
- **KI-10 降级**：`known-issues.json` 的 KI-10（主体/长发3/左耳朵1）由 `fallback`（"已知待修真实缺陷"）改为
  `measurement`（口径问题），理由/证据按上述三条改写（旧描述原文保留在 reason 内），--strict 下仍计失败。
  真机 A/B 入口 = `?id=3719111841&meshsize=1`（以及 `&meshsize=crop`）。
- **用户真机验证（必须）**：`?meshsize=1` 的观感（本机只能给矩形/像素统计）——按证据预期它会把发片放大 1.17–1.89 倍并与官方标定差 269–399px，
  若真机上看反而更贴官方 preview，再谈翻默认；`?meshsize=crop` 另加 +852.7/−300.5px 位移，属"证伪用"档位。

### 门禁与文档
- `run-all-tests.sh`：新增 2 项（`hdr-predicate` / `meshsize`），47 → **49 项**。
- `README-DIAGNOSTICS.md`：主表新增 `meshsize` 一行（81 → **82** 个开关，`diag-flag-check` 0 差异）；
  并注明插件面板白名单 `MPW_SCENE_DEBUG_KEYS` 暂未含它（手拼 URL 即可 A/B，勿写进壁纸 URL）。
- **本机不可验（需用户真机）**：① hina 去掉 `?hdr=0` 后的实际观感（白/灰的具体取值取决于 Adreno 半浮点附件行为）；
  ② `?meshsize=1` / `?meshsize=crop` 的观感 A/B（发片是否更"贴回"头部）；③ 真机上 KI-10 三层是否仍与官方 preview 一致。

- **本轮实测**：`bash run-all-tests.sh` → **PASS=49 FAIL=0 SKIP=0 / 总 49 项**（47 项既有 + `hdr-predicate`/`meshsize`；
  末次全绿；倒数第二次唯一失败项 `visual-diff-kal` 是环境抖动——单项 600s 超时被中止，随后单跑 **1.3s PASS**、下一轮全量 1.5s PASS）。
  `node diag-flag-check.mjs` **82==82**；`node docs-check.mjs` ✓；`node publish-check.mjs --assets …` 仅剩 `LICENSE` 1 条既有阻塞
  （两个新测试文件未进"个人绝对路径"告警：都走环境变量默认值 `MPW_ROOT`/`MPW_SCENE_ROOT`）。
- **H0 连带修改（门禁夹具，非放宽）**：`hdr-bloom-test.mjs` 的 HDR 路径夹具原用 `{hdr:true}`（无 bloom），
  在新判据下**必须声明消费者** → 改为 `HDR_ON = {hdr:true, bloom:true}`（6 处），并新增 **T0**（`hdr=true/bloom=false → 不分配 RGBA16F、无 [hdr] 日志`；
  `?hdr=1` 强制仍分配）把新契约端到端钉住；17 → **19 checks ALL PASS**。
- **回退开关**：`?hdr=0`（强制 LDR，H0 前后语义不变）、`?hdr=1`（强制 HDR 诊断）、`?meshsize=1`/`?meshsize=crop`（H1，默认关）、
  `?mcc=0/1`（网格中心补偿，H1 未改动语义）。

## P-59（2026-09-14，渲染器侧子任务）粒子白三角回归：形状取错通道（`.r`）+ 第二三角形退化 + 默认开后无预算

**结论先行**：用户报的「粒子=白色三角形乱飞 / 直接两帧」是**两个独立的既有绘制缺陷**在 P-56 把粒子改成默认开后第一次被看见，
外加"粒子默认开但没有任何预算"。三处都修了，49 项门禁全绿（本补丁不新增门禁项，把断言并进 `mock-gl`：12 → **28 条**）。
关键数字：每帧 quad 的**第二三角形退化率 464/464 → 0/428**（hina）、**1206/1206 → 0/643**（Girl and cat）；
halo 类贴图实测采样 alpha **1.000 → 0.161**（hina `particle/halo`）；不透明白片占已绘片元 **85.9% → 30.4%**（Girl and cat，最坏包）；
本机 mock-GL 单帧渲染（t=25s）**238ms → 140ms**（Girl and cat）、127 → 114ms（hina）。

### 根因（都有 file:line + 字节级/顶点流证据）
1. **形状取错通道（`core/we-scene-bundle.js` PARTICLE_FS，`core/we-scene-bundle.js:3879-3899`（fragColor 在 :3898））**：旧实现
   `float texR = mix(texture(u_Tex, v_TexCoord).r, texture(u_Tex, v_TexCoordB).r, v_Blend); fragColor = vec4(u_Color, u_Alpha*v_Alpha*texR)`，
   而官方 `wallpaper_engine/assets/shaders/genericparticle.frag:39-46` 是 `color = v_Color * ConvertTexture0Format(texSample2D(...))`——**乘完整 RGBA**。
   语料实测（`node` 探针直接解 `.tex`）粒子贴图分两类，**互相矛盾**：
   - `particle/halo` 64x64 fmt0：**rgb 恒 [255,255,255]（red255pct=100%）**、avgA=39、aMax=235、a0=20.1%、**两角 alpha=0**；
     `halo_3`/`halo_4`/`halo_6`/`download`/`drop` 同族（red255pct=100%/≈100%，形状全在 alpha）。
     ⇒ 用 `.r` 当形状时 **alpha 恒 1 = 实心白 quad**（这正是真机 `texStats` 里
     `{"n":"particle/downl","d":"68x68","f":4,"rgb":[255,255,255],"a":9,"a0":86}` 那条白色纹理）。
   - 反向的 `materials/particle/fog/fog1`（rgb 13、alpha 恒 255）、`beam_1`、`light_shafts_0` 形状在 **RGB**，
     用 `.r` 又会让它们几乎全透明（hina「雾 2」old≈0.002 → new≈0.814）。**只有官方口径同时正确**。
2. **第二三角形退化（`core/we-scene-bundle.js:6009-6012` 六顶点表）**：旧表
   `cys=[-1,1,-1,1,-1,1]` → `k3=(1,1)` 与 `k5=(1,1)` **重合** ⇒ 三角形 B 面积恒 0，
   一个粒子的 6 顶点**只画出半个 quad（一个三角形）**——用户看到的"三角形"就是这个。
   同表 `us/vs` 还与 `cxs/cys` 错位，k0/k1/k2 的 UV=(0,1)/(1,0)/(0,1) ⇒ 三角形内采样 UV 退化成
   `((1+y)/2,(1-y)/2)`，**只沿纹理反对角线取样**。真机同构的 mock-GL 顶点流实测：`triB_degenerate` **464/464、1206/1206、696/696、182/182、19/19**。
3. **默认开 + 无预算（`demo.html:2225`/`2713` 默认开；`core/we-scene-bundle.js:5867-5870` 只有 `def.maxcount`）**：
   语料模拟（t=25s，`buildParticleSystem`+`simulateParticleSystem`）峰值存活：Girl and cat **10,903 粒**
   （单层 `Rain2` `maxcount:10000` → 9,609 粒 / **65,418 顶点每帧**）、hina 448、凯尔希 714；
   再加每帧**从 0 重放历史**（旧 `simulateParticleSystem` 固定 0.05s 步长 + `guard<2000`，
   guard 用尽后仍把 `_simulatedTo` 记成 target = 100s 后状态静默冻结）⇒ 真机 2 FPS。

### 改动（三个文件，最小面）
- `core/we-scene-bundle.js:3879-3899`（fragColor 在 :3898）：粒子 FS 改官方口径 `vec4 tex = mix(tex(uv),tex(uvB),blend); fragColor = vec4(u_Color*tex.rgb, u_Alpha*v_Alpha*tex.a)`。
- `core/we-scene-bundle.js:5919-5926`：六顶点表改 `cys=[-1,1,-1,-1,1,1]`、`us=[0,0,1,1,0,1]`、`vs=[1,0,1,1,0,0]`
  （k0..k5 = BL,TL,BR,BR,TL,TR；UV=((cx+1)/2,(1−cy)/2)，保留旧 k0/k1 的 v 翻转方向）→ 两个三角形都非退化、UV 覆盖整图四角。
- `core/we-scene-bundle.js:4019-4042` + `5858-5879` + 帧首重置（`renderScene` 内）：新增 **`PARTICLE_BUDGET`**（不改默认观感之外的开关语义）：
  | 档位 | 单层/帧 | 整帧合计 | 粒子层数 | 历史重放步数 |
  |---|---|---|---|---|
  | 默认 | **240** | **1200** | **16** | **400**（≈20s 内与旧 0.05s 步长逐位一致） |
  | `?lowmem=1`（插件 B5 对低内存设备自动透传） | **80** | **320** | **6** | **200** |
  | `?pmax=<n>` | n | 同上 | 同上 | 同上 |
  份额按"剩余份额 ÷ 剩余粒子层数"均分（用不完顺延给后面的层，避免前几层吃光预算、后面整层消失）；
  超出部分**不停发、只封顶本帧模拟/绘制数**；`?perf=auto` 的 `partMul` 仍叠加生效（取 min）。
- `core/we-scene-bundle.js` `simulateParticleSystem(sys,t,maxSteps)`：新增可选步数上限，**不传 = 旧行为逐位一致**；
  传了则超出部分**放粗步长**（总时长不变、状态继续推进，不再静默冻结）。`renderParticleLayer` 传档位值。
- **无贴图粒子层显式跳过 + 记账**：`renderParticleLayer` 在 `!texObj.glTex` 时 `partStat.skippedTex++` 并 log-once
  （旧代码同样 return，但没有可观测计数）；`demo.html` 上报 payload 增 `particleBudget`（档位/上限/本帧实画层数/粒数/两类跳过数），
  日志过滤器增 `[粒子` —— 真机下一份报告能直接区分"没贴图跳过"与"预算封顶"。
- **未动**：`?noparticles`/`?np` 语义、`preview.mjs`（仍跳过粒子层）、`render-audit.mjs`（仍 `hideParticles:true`）、粒子 CPU 模拟/算子语义。

### 测试与门禁
- `mock-gl-test.mjs` **12 → 28 条断言**（新增场景 4/5）：(a) 贴图未解析 → **0 次粒子 draw** 且 `skippedTex=1`；
  (b) 贴图可解析 → 1 次批绘制且**绑定该贴图（≠ `whiteTex`）**；(c) **两个三角形面积都 >0**、UV 覆盖 `0/1` 四角（旧代码三角形 B 恒 0）；
  (d) 从 mock 捕获的**粒子 FS 源码**必须含 `tex.a` 且不含 `texR`；(d2) 官方粒子贴图实测 red 恒 255 + alpha 有形状；
  (e) 预算：默认档 240/1200/16、`?lowmem=1` → 80/320/6、`?pmax=7` → 单层 7、硬上限 3 层×30 粒 → ≤2 次 draw / 每层 ≤4 粒 / 合计 ≤8 + `skippedBudget≥1`。
- `README-DIAGNOSTICS.md`：新增 `lowmem`、`pmax` 两行（②区），头部计数 **82 → 84**；`node diag-flag-check.mjs` → 84 == 84、0 差异（`diag-flags.json` 已重生成，common 集合未变 ⇒ `panel-smoke` 不受影响）。
- **本机实测**：`bash run-all-tests.sh` → 见本补丁提交时的全量结果（49 项）；定向项 `mock-gl / particle-sprite / particle-presets / hdr-predicate / sprite-sheet / multi-sprite / tex-fmt5` 全 PASS。
- **回退开关**：`?noparticles`（或 `?np`）一键全关粒子；`?lowmem=1` 激进档；`?pmax=<n>` 单层微调。
- **本机不可验（需真机/浏览器）**：① 真机 GL 上的观感（halo 由"实心白三角"变回柔和光斑、雾/光束从"几乎看不见"变可见）与
  **帧率回升幅度**（本机只有 mock-GL 的 CPU 侧中位数）；② `?lowmem=1` 在低内存机型上的密度取舍是否可接受。

### P-59 追加（同一轮，2026-09-14 深夜）A1 全语料蒙皮已死 + B rope 层诊断/限流

**A1（最紧急，用户看得见的"人物不动、眼睛没了"）**：`demo.html` 蒙皮准备块里
`l.__skin = { …, frameCount, … }` 的 `frameCount` 是**未声明标识符**（唯一声明在 `:1001` 的 MDLA 解析闭包内）
→ 本作用域 ReferenceError → 被同块 `catch (e) {}` **静默吞掉** ⇒ `__skin` 从未赋值 ⇒ `skinLayers` 恒空 ⇒
设备上报 `meshDraws 162→0`、`skins 1→0`（凯尔希 25→0）、`layers[].skin` 全 0；P-57 的多 additive 修复
（`sampleCompositeAdditivePose`）变死代码。
- **改动**：`demo.html:1824` → `frameCount: (anim && anim.frameCount) || rawLen`（口径同 `:1748` 的 `anim0.len`）；
  `:1845` 的空 `catch (e) {}` → **不再静默**：写 `window.__mpwSkinErrs`（≤8 条）+ `logf('❌ 蒙皮准备失败 …')`；
  上报 payload 新增 `skinErrs`（与既有 `meshDraws`/`skins`/`layers[].skin` 一起构成真机证据链）。
- **本机证据（`mdla-walk-test.mjs` 新增 T5：从 demo.html **抽出真实蒙皮块**在 node 里跑真包）**：
  `3544152633 → skins=1（girl, frameCount=180）`、`3719111841 → skins=5（180/180/240/300/240）`、
  `3554161528 → skins=1（人物, frameCount=75）`、`3660962877 → skins=0（该包本就无 puppet 层）`；
  **变异验证**（把该行改回裸 `frameCount`）→ 四个包全部 `skins=0`，并报出 `frameCount is not defined`
  —— 与设备上报的 `meshDraws 0` 逐条对上。T5 = 9 项断言，`mdla-walk` 项 16 → **25 断言**。

**B（中央白块 + 拖尾 + 卡顿）**：`Trails 2`（id 560，materials/presets 同主题路径（预设索引命中 `presets/interactive/.../trail_1` 同主题路径），`origin` 恰为画布中心 1920,1080，
`renderer:[{name:"rope"}]`，additive，rate 32）——`rope` 是官方 **TRIANGLE_STRIP 连线**渲染器，本引擎未实现。
- **口径选择（不丢弃、也不静默）**：`rope`/`ropetrail`/`spritetrail` 仍按**普通贴图 quad** 绘制
  （官方预设分布 sprite 142 / spritetrail 40 / rope 25 / ropetrail 18；这类层的贴图本身就是绘制形状——
  `particle/流星` 256x794 就是长条拖尾贴图，丢弃会把美术要的效果整层删掉），但**一次性 log + 逐帧计数**：
  `[粒子] 层 "X" renderer=rope 未实现（…需 TRIANGLE_STRIP 连线…）→ 按普通贴图 quad 近似绘制`，
  `particleStats.renderers = {sprite, rope, …}` 进真机上报。白色本身已由上面的 tex.a 修复解决
  （该层 `particle/流星` 实测 alpha 有形状；白块来自 `.r` 恒 255）。
- **发射率纳入预算**：`PARTICLE_BUDGET.rate`（默认 **240 粒/秒**、`lowmem` **80**）——多发射器 rate 求和超上限
  按比例 `rateMul` 只降不升（官方有 15/233 个预设 >240、最大 5000），并计入 `particleStats.rateCapped` + 一次性 log。
  单独靠 `maxcount` 挡不住瞬时成本：`toEmit = floor(dt·rate)` 单步就能生成上千粒。
- **测试**：`mock-gl-test.mjs` 28 → **34 断言**（新增 (f) rope 层仍绘制 + `renderers.rope=1` + 一次性 log；
  (g) rate 1000/s 的层 2s 内被限流到 ≲480 粒 + `rateCapped=1` + 一次性 log）。

**A2（记录，未动）**：复制花层 `花朵`/`花朵 拷贝` 的"内容没上屏"本轮**未碰**——`clearBgFx` 的既有行为
（`core/we-scene-bundle.js:1406-1408` 那个"背景超大层摘效果链"的判据）一字未改；纹理上传路径也未改
（P-59 只改粒子 FS 的采样通道、粒子 quad 顶点表、粒子预算/诊断）。可另派 readPixels 探针。

---

## P-60（2026-09-14）脚本宿主 `thisLayer`/`thisObject` 错绑 —— 全语料级

**症状（用户第 1 项："时间/日期显示像是我做的，不像壁纸自己的"）**：真机上报 id `r1789397997210`（原件已被 reports/ 目录清理，ID 保留可追溯）
（包 3554161528 hina）的 `layers[]` 里，时钟层 **id 398** 与歌曲名层 **id 1592** 的 `rawOrigin`
逐位相同（`2833,1379`），而包内 `scene.json` 里 398 的 authored origin 是 `(1195.38159, 1337.07593)`。
代码里这条被记为"parsed origin 与期望 Δ1638 且恰等于另一层"的疑案（`demo.html:2886` 的探针注释）。

**根因**（`elysia/scene-scripts.js` `makeOwnerRef()`）：`layerRef()` / `objectRef()` 把
`const obj = ref.current` 写在**工厂函数体开头**，而 `makeLayer()`/`makeObject()` 在 `compileScript()`
的 context 字面量里**只调用一次**（编译期）；编译结果又按脚本源缓存（`cache.get(src)`）。
→ `thisLayer`/`thisObject` 捕获的是"编译那一刻"的 `ref.current`，即**上一个脚本节点 `setOwner`
留下的对象**。只有**每层第一个被编译的脚本属性**会拿错 owner，第 2/3 个属性编译时 `ref.current`
恰好已是本层 → "看起来正常"，所以极难发现。

Node 复现（修复前，真包 + 真实脚本宿主）：

```
$ node /tmp/probe2.mjs
probe: [ '398.origin sees thisLayer.id=1592 name="" origin=2833.34644,1378.56702' ]
final 398 origin = 2833.346440 1378.567020 0.000000      ← authored 被改写
$ node /tmp/probe3.mjs      # 同一层三个脚本属性
[ 'origin: thisLayer.id=1592',   ← 首属性错绑
  'scale:  thisLayer.id=398',    ← 第 2 个正常
  'text:   thisLayer.id=398' ]   ← 第 3 个正常
```

**影响面**：不止时钟。任何脚本里的 `thisLayer/thisObject` 读写（`origin`/`scale`/`visible`/`alpha`/
`name`/`id`/`getParent()`）都会作用到**别的层**上——既能写坏坐标，也能把不相干的层隐藏/移位，
是"白块/飘走/位置不对"一类症状的共同可疑源（需逐包复核）。

**改法**：`layerRef()`/`objectRef()` 改为**惰性读取**——`const cur = () => ref.current`，
每个 getter/setter 内联 `cur()`，不再在工厂函数体开头快照。

**附带修（同类静默写坏）**：`thisLayer.origin = '4242 2424 0'`（字符串写法）旧 setter 用
`v.x != null ? v.x : v[0]` 取分量 → 字符串按**字符下标**取值，写成 `"4 2 4"`，坐标被写坏且无报错。
新增 `toXYZ()` 归一化（Vec3 / `"x y z"` 字符串都接受，非法值放弃写入而不是写坏）。

**测试**：新增 `script-owner-live-test.mjs`（注册进 `run-all-tests.sh`，49 → **50 项**），11 断言：
T1 首属性绑定 / T2 三属性一致（防空假修复）/ T3 写回目标不得污染邻层（origin + visible）/
T4 多帧 cache-hit 路径 / T5 真包 `3554161528` 跑完脚本 id398 origin 仍等于 authored。
同一测试在**修复前**的代码上 7 项失败，其中 T5 复现 `1195.38159,1337.07593 → 2833.34644,1378.56702`，
与真机上报逐位一致（证明测试确实抓得到该 bug）。

**回退**：无开关（属纯 bug 修复）。若需 A/B 对照，用 `/tmp/scene-scripts.js.bak-232602`
（修复前副本）替换 `elysia/scene-scripts.js` 即可复现旧行为。

**未做**：`localStorage.get("storedPosRoundMIC")` 这类"同 storageName 跨层共享"的拖拽位置持久化
尚未按层分键（WE 语义待考）；本轮只修 owner 绑定，不动存储语义。

---

## P-61（2026-09-14，渲染器侧子任务）官方用户属性面板（WE `properties` 面板等价物）+ `{user:...}` 绑定落地 —— 用户第 1/5/6 项

**背景（证据：`docs/HINA-CLOCK-AND-PROPERTIES.md` §3，全部来自包内原始数据）**：壁纸**自带**属性面板——
`project.json → general.properties` 一条 = 面板上一个控件；绑定语法写在 `scene.json` 的对象属性与脚本属性上。
第 1 项（hina `3554161528`）有 35 条，此前一条都没接出来（"时间/日期显示像是我做的"的成因之一：包的
`clock`/日期/格式/颜色/字号开关全是死的）。本轮把机制通用实现：**面板 + 绑定 + 门控**三件套。

### 官方机制（包内原文实测）

| 字段 | 含义 |
| --- | --- |
| `type` | `bool` / `slider` / `color` / `combo` / `group` / `text` / `textinput`；无 `type` 键（= `None`）= 纯 HTML 营销块 |
| `value` | 作者默认值（combo 是**字符串**数字 `"3"`；color 是 `"r g b"` **线性 0..1** 浮点） |
| `text` | 面板显示名（作者中英双语，含 `<br>`） |
| `order` / `index` | 排序（面板按 `order`，同值再按 `index`）/ 编辑器内部序号 |
| `condition` | **表达式**（不是单一字段名）：语料 22 包 723 条实测出 `clock.value`、`tishi.value==0`、`!timevarying.value`、`a.value == true && b.value == true`、`x.value || y.value`、`dibu.value==1` |
| slider 专有 | `min` `max` `step` `precision` `fraction` |
| combo 专有 | `options:[{label,value}]`（value 是字符串，与脚本里的 `condition` 对应） |

**三种绑定形态**（对象属性与脚本属性同一套语法）：

1. 普通：`"visible": { "user": "clock", "value": true }` → 取用户属性当前值，无该键回退 `value`。
2. combo：`"useYYYYMMDD": { "user": { "condition": "3", "name": "newproperty23" }, "value": true }`
   → 用户属性 == `condition` 时为真。bool 用户属性沿用 RE-06 既有官方反直觉规则（`"0"`=勾选时匹配）。
3. 带脚本：`"origin": { "script": "...", "scriptproperties": {...}, "value": "..." }`；对象上的
   `scriptproperties` 在 `scene.json` 里**常是 JSON 字符串**（口径照抄 `elysia/scene-scripts.js` 的既有解析）。

### 实现（`core/we-scene-bundle.js` 新节 + `demo.html` 面板）

- **`core/we-scene-bundle.js`**：新增导出 `propToBool` / `colorPropToHex` / `hexToColorProp` / `normalizePropValue` /
  `propsDefaults` / `mergeUserProps` / `parsePropsQuery` / `evalPropCondition` / `propConditionNames` /
  `gatedOffNames` / `resolveUserBinding` / `evalVisibleWithProps` / `propLabel` / `propsPanelModel` /
  `applyUserProperties` / `resolveScriptProperties` / `applyScriptProps`（+ `PROP_RENDER_TYPES` /
  `PROP_UNIMPL_TYPES` / `USER_BIND_KEY_LIST`）。`parseScene` 每个层多带 `__bindRaw`（作者绑定原文）、
  `__localOrigin` / `__authOriginWorld` / `__parentXf` / `__parentScale`（origin/scale 绑定的换算依据），
  返回值多一个 `projH`。
- **`applyRenderConfig` 新增 2.4)**：`opts.propertiesSchema` 存在时调 `applyUserProperties` 写真实渲染字段
  （`visible` `alpha` `color` `brightness` `pointsize` `origin` `scale` `size` `parallaxDepth` `text`）；
  RE-06 的可见性求值收敛到 `evalVisibleWithProps`（口径逐字不变，新增"门控关闭 → 绑定不生效"一条），
  并**新增字符串形态** `{"user":"clock"}` 的解析（旧实现只认对象形态 `user.name` → hina 时钟层一直不响应开关）。
- **scriptproperties → 脚本宿主**：`applyScriptProps` 把对象上的 `scriptproperties`（含 JSON 字符串形态）
  **就地解析成字面量**（原文快照存模块内 WeakMap，可反复重解析）。原因：`elysia/scene-scripts.js` 只解字符串
  `user`，**combo 形态会被它当普通 value 兜底** → 日期格式三选一永远停在作者默认；本轮不改 `elysia/`（文件所有权），
  改为在对象上先解析好再交给宿主（宿主每帧按当前对象重新覆盖 `__scriptProperties`，所以面板一改下帧即生效）。
- **`demo.html`**：新增 `<script id="mpw-props-panel">` 区块（`window.__mpwPropsPanel`，纯 DOM 呈现层：
  bool→勾选框 / slider→range+precision 读数 / color→`<input type=color>`（0..1↔`#rrggbb` 双向）/
  combo→下拉（字符串值）/ text→文本框 / group→分组标题；门控关闭的行 `display:none`+`hidden`；
  被 URL 钉住的行 `data-locked=1` + 控件置灰），以及模块侧的装载与改动链路（见下）。顶栏加 `⚙ 属性` 按钮。

### 实现口径（冻结）

1. **类型规范化**（脚本宿主依赖，写进 `README-DIAGNOSTICS.md` 的 `__mpwProps` 表）：
   bool→**boolean**、slider→**number**、combo→**string**、color→`"r g b"`（线性 0..1）、text 类→string。
   仅当该属性在 `project.json` 里**带 `type`** 时才规范化；无 `type` 的条目保持原值（time-variation 的
   `display:"0"` 等旧口径不受影响）。
2. **优先级**：`?props=`（最高）> `localStorage['mpw-props:<sceneId>']` 差异表 > 作者默认。
   `condition` 门控用**覆盖后的**值判定；被 URL 钉住的键在面板里置灰且改动被忽略。
3. **门控是传递闭包**：自身 `condition` 为假，或它引用的任一父属性本身被门控关闭 → 关闭。
   这一条是 T2 "`clock=false` 时 `newproperty23` 也隐藏"成立的原因（它的直接父 `newproperty22` 只是被隐藏、值仍为 true）。
4. **"不生效"**：门控关闭时该属性的**绑定不写入**（保持 authored 值）——见 `applyUserProperties`/`resolveScriptProperties`
   的 gated 分支（`clock=false` + `size=40` → 时钟层 pointsize 保持 20）。
5. **改动即时生效（不刷新页面）**：控件 → 就地改 `propsMap`（`window.__mpwUserProps` **同一对象**）→
   写差异表 → `lib.applyUserProperties(scene, propsMap, {schema, gated})` → `lib.applyScriptProps(sceneObj, …)`
   → 重建模型 + `refresh`（只改显隐/取值，不重建 DOM，避免打断 range 拖动）→ 更新 `window.__mpwProps`。
6. **不渲染**：`type` 缺失/`None`（HTML 营销块）、`schemecolor`（编辑器配色）、`scenetexture`/`usershortcut`/`file`
   （官方语义未实现）、以及**死开关**（bool，且依赖它的条目**全部**已被跳过 —— hina `brhidemarketingwords`
   只控制那 3 条 HTML 块）。四类各记一次日志。hina 计数：**35 条 → 渲染 30 条（控件 25 + 分组 5）、跳过 5 条**。
7. **旧调用点逐位不变**：`propertiesSchema` 缺省 → 不走新绑定路径、RE-06 不认字符串形态、N5 开关不做豁免。
   `package-matrix` / `preview` / `render-audit` / `parity-check` 都只传值表 → `package-baseline.json` 不漂移。
8. **与 N5 开关不打架**：包的面板里有**同名 bool 开关**（WE 约定名 `clock`/`date`/`weekday`/`fps`）且该层可见性
   由用户属性绑定时，该层由包的属性驱动，N5 的 `show*` 不再插手；否则（含所有无属性表的调用点）N5 行为逐位不变。
9. **类型不合的绑定不写坏字段**：语料唯一样本 hina `id1592` 的 `pointsize:{user:"newproperty18"}` 而该属性是
   bool → `Number(true)=1` 会把歌曲名字号写成 1px；现在数值字段拒绝 bool（保持作者值 10）并记账。
   ⚠ **WE 真机此处行为未定**（无第二样本、无官方源码佐证），选保守口径。

### 测试

`props-panel-test.mjs`（注册进 `run-all-tests.sh` 的 `props-panel`，50 → **52** 项 —— 另一子任务已先加 `media-host`；**106 断言**；~0.25s）：
T0 区块切片+颜色换算（含与 bundle 实现的交叉验证）/ T1 真包 35 条 → 渲染 30 条、order 排序、`<br>` 换行、
combo options、假 DOM 25 行 5 组 / T2 `clock=false` 7 条门控关闭（显示 + **不生效** + 实时联动）/
T3 二三级联动（22→23、18→强度、11→3 条、16→2 条且真层 1592 关掉、三级传递）/
T4 绑定生效（真包 14 个绑定层；398 `visible=false`、`size=40`→pointsize 40、`color`→`[1,0,0]`、`alpha=0.5`；
类型不合不写坏；幂等；合成父子层 origin/scale 换算）/ T5 combo（`newproperty23="1"` → `useMMDDYYYY=true`、
`useYYYYMMDD=false`；**端到端**跑 `elysia/scene-scripts.js` 断言时钟文本日期段真变成 `MM/DD/YYYY`）/
T6 持久化与"恢复作者默认" / T7 URL `?props=clock=0` 最高优先（面板显示 URL 值 + 置灰 + 真实层生效）/
T8 condition 表达式求值器（语料 5 种真实表达式 + fail-open）/ T9 与 N5 四类开关互不打架/
T10 **demo.html 装载块真源码切片**（`let propsPanel` → `?isolate` 之前，假 DOM + 真包）：
装载→点 `clock` → 真实层 `398.visible=false`、`window.__mpwUserProps` 同一引用、`localStorage['mpw-props:<id>']`
差异表、诊断 `conditions.off`、门控行隐藏、`size=36` → `pointsize=36`、combo → 场景对象脚本属性字面量 →
**脚本宿主产出的日期段**、恢复默认清表、`?nopanel`/`embed=1`/URL 锁定三条分支。
> 该组在本轮**抓到并修掉一个真 bug**：`writePropsStore`/`propsKey` 是 outer `try{}` 内的块作用域 const，
> 面板装载代码在 try 之外 → 浏览器里第一次改属性就会 `ReferenceError`（Node 直调 bundle 测不到）。
> 修法：经 `window.__mpwPropsCtx` 把 `save`/`key` 句柄交出去（保持切片单元自洽）。
`text-switches-test.mjs` 35 通过 / `time-variation-test.mjs` 67 通过 / `demo-syntax-check` 8/8 内联脚本通过。

### 回退开关

- `?nopanel`：只关面板 UI（绑定与 `?props=` 照常生效）；`embed=1`（壁纸 iframe）下首次加载收起 + 隐藏按钮。
- `?props=name=value,...`：手工驱动（面板置灰显示"被 URL 锁定"），仍是最强覆盖。
- 「恢复作者默认」按钮：清 `localStorage` 差异表并回写作者默认。

### 未实现 / 未定

1. **`scenetexture`(27 条) / `usershortcut`(24 条) / `file`(1 条) / `txt`(2 条)** 未渲染（只跳过并记账）：
   纹理选择器、键位捕获面板官方语义未考（`txt` 按 text 类渲染，计数已含）。
2. **`volume`(8 条) / `zoom`(3 条)** 的对象属性绑定未接：渲染层模型里没有这两个字段（`volume` 走 sound 层、
   `zoom` 走 `cameraNode.zoomRaw`），需另开工单。
3. **`condition` 里非 bool 父项的"真值"语义未定**：语料门控父项全是 bool；现按"非零非空为真"处理（注释已标）。
4. **`condition` 解析失败 → fail-open（显示）**：作者笔误时宁多显示一个控件，也不整组藏起来；失败表达式会
   进 `propsPanelModel().condParseFailed` 并在日志逐条报出（语料 22 包实测 0 条失败）。
5. **`origin`/`scale` 绑定在**旋转父链**下的增量换算只做了"父链累计 cos/sin + 缩放"（与 `parseScene` 同一套静态
   合并式）；父级带动画/脚本时不会跟着动（语料无对象级 origin/scale 绑定样本，仅合成场景验证）。
6. **面板观感未在真机/浏览器上核**：本机只跑假 DOM（`props-panel-test.mjs`）与 Node 侧断言，
   没有截图证明"面板长得像 WE 的"。浏览器实跑**本机不可得**：Chromium 降级链 3 档全败
   （`page.goto` 40/60s 超时、`--single-process` 启动即崩），与 `headless-shot.mjs` 头部记录的 PRoot
   环境限制一致 → 本轮**没有**"真浏览器里点一下"的证据，只有 T10 的真源码切片 + 假 DOM。
7. **`localStorage` 差异表不清理陈旧键**：包升级后作者删掉的属性名会留在差异表里（不生效，但不会被清）。
8. **面板改"选层类"属性不会立刻重算 TIME-VARIATION**：用户把 `timevarying`/`display` 这类属性在面板里改掉时，
   内置时段选层（`applyTimeVariation` 在装载时算一次）不会当帧重选；`?time=` 钉住的层仍每帧 `reassert()`
   （不打架）。重算要先定"面板 vs 作者脚本抢层"的语义，另开工单。

---

## P-62（2026-09-14，渲染器侧子任务）媒体集成 + 音频响应 —— 宿主侧（WE `media*Changed` 五回调 / `registerAudioBuffers` / 封面 / 歌词）

**任务**：把 WE 官方的「媒体集成（Media Integration）」与「音频响应（Audio response）」在宿主侧做成等价物：
脚本作者的 `mediaPropertiesChanged / mediaThumbnailChanged / mediaPlaybackChanged / mediaTimelineChanged /
mediaStatusChanged` 回调要真的被调用，`engine.registerAudioBuffers(n)` 读到的必须是**真值**而不是恒 0。

**文件边界（本次只碰这些）**：新增 `elysia/media-host.js`、`elysia/media-lyrics.js`、`media-host-test.mjs`；
`elysia/scene-scripts.js` 加**两个导出** `dispatchScriptEvent` / `invalidateUserProps` + 两个记账字段；
`run-all-tests.sh` 加 1 行；`README-DIAGNOSTICS.md` 加 1 行（`lyrics`）；本文件。
**未动** `demo.html` / `core/we-scene-bundle.js`（并行会话独占）——宿主接线留给父 agent（见 §4 的接线示例与三个必读陷阱）。

### 1. 官方 API：三条独立证据源（不猜）

| # | 来源（都是**随 WE 安装分发**的文件） | 逐字内容 |
|---|---|---|
| E1 | `wallpaper_engine/ui/dist/monaco/autocomplete/lib.sceneScript.d.ts`（官方 TS 自动补全定义） | `L292-330 class MediaPropertiesEvent { title; artist; subTitle; albumTitle; albumArtist; genres; contentType }`<br>`L333-365 class MediaThumbnailEvent { hasThumbnail; primaryColor; secondaryColor; tertiaryColor; textColor; highContrastColor }`<br>`L368-390 class MediaPlaybackEvent { state; static PLAYBACK_STOPPED=0; PLAYBACK_PLAYING=1; PLAYBACK_PAUSED=2 }`<br>`L393-405 class MediaTimelineEvent { position; duration }`<br>`L408-415 class MediaStatusEvent { enabled }`<br>`L481-489 class AudioBuffers { left: Float32Array; right: Float32Array; average: Float32Array }`<br>`L1485-1504 readonly AUDIO_RESOLUTION_16 = 16 / _32 / _64; registerAudioBuffers(resolution): AudioBuffers` |
| E2 | `wallpaper_engine/ui/dist/scripts/scripts.js`（官方编辑器「插入函数」菜单） | 5 个按钮：`mediaStatusChanged("@param {MediaStatusEvent} event")`、`mediaPlaybackChanged(…MediaPlaybackEvent…)`、`mediaPropertiesChanged(…MediaPropertiesEvent…)`、`mediaThumbnailChanged(…MediaThumbnailEvent…)`、`mediaTimelineChanged(…MediaTimelineEvent…)` → **回调名的权威清单**（没有裸 `mediaProperties()`；函数名一律带 `Changed`） |
| E3 | `wallpaper_engine/locale/ui_en-us.json` | `ui_settings_enable_media_integration_support_hint = "Allows wallpapers to read the title, artist and album cover of the currently playing music. This feature will work with all music players that support the Windows media overlay."` → 官方语义 = 歌名 / 歌手 / **封面** |
| E4 | `wallpaper_engine/ui/dist/monaco/snippets/script_factor_audio_response.js`（官方音频响应示例） | `const audioBuffer = engine.registerAudioBuffers(engine.AUDIO_RESOLUTION_16);` … `const audioDelta = audioBuffer.average[scriptProperties.frequency] - smoothValue;` → **脚本顶层调用一次并长期持有该对象**（= 宿主必须原地更新） |
| E5 | `wallpaper_engine/projects/defaultprojects/audiophile/`（官方音频反应工程） | `project.json general.supportsaudioprocessing: true`；`shaders/audiophile.vert` 用 `uniform float g_AudioSpectrum16Left / g_AudioSpectrum16Right`（渲染端 16 段、左右声道、0..1） |
| E6 | `wallpaper_engine/ui/dist/scripts/scripts.js`（`EditorSystemResourcesModalCtrl`） | 系统纹理下拉：`[{label:…texture_media_thumbnail, value:"$mediaThumbnail"}, {…, value:"$mediaPreviousThumbnail"}]` → **封面进画面的通道是材质纹理槽 `$mediaThumbnail`，不是脚本回调** |

**与任务书假设的差异（实证推翻，务必按实证）**：
1. 作者脚本里的回调名是 **`mediaPropertiesChanged(event)`**，不是 `mediaProperties(event)`——语料 6/6 容器、官方 d.ts、官方插入菜单三处一致。
2. 封面事件是 **`mediaThumbnailChanged(event)`**，没有 `mediaThumbnail(event)` 这个钩子（`$mediaThumbnail` 是**纹理名**）。
3. 事件字段是 **`albumTitle` / `albumArtist`**（官方 d.ts），不是 `album`。
4. **`getAverageVolume()` / `getFrequencyData()` 在语料与官方 d.ts 里零命中** —— WE 的读法是 `audioBuffer.average[i]`
   （`AudioBuffers = {left,right,average}` 三个 Float32Array）。本实现把这两个名字做成**非官方兼容别名**挂在返回对象上
   （另加 `left/right` 选择参数），文档与测试都明确标注"非官方"。

### 2. 语料证据表（包 id → `scene.json` 路径 → 调用片段）

统计口径：`allwallpaper/**` + `Steam/steamapps/workshop/content/431960/**`（两侧同源镜像，逐包一致）。
脚本节点 = scene.json 里任意层级带 `{script,value}` 的对象（含 `effects[].passes[].constantshadervalues.*`）。

| 包 id | 回调 / API | 次数 | 逐字调用片段 | 例（scene.json 路径 / 层 id） | 我们实现的名字 |
|---|---|---|---|---|---|
| **3554161528**（hina） | `mediaPropertiesChanged` | 1 | `mediaData = event.title` | `objects[19].text` / **1592** | `dispatchScriptEvent(cache,'mediaPropertiesChanged',{title,…})` |
| | `mediaThumbnailChanged` | 1 | `thisObject.getAnimation().play()` | `objects[25].effects[0].passes[0].constantshadervalues.alpha` / 1111 | 同上（`mediaThumbnailChanged`） |
| **3660962877** | `mediaPropertiesChanged` | 1 | `mediaData = event.title` | `objects[124].text` / 1096 | 同上 |
| | `registerAudioBuffers` | 68 | `engine.registerAudioBuffers(engine.AUDIO_RESOLUTION_16)` + `audioBuffer.average[scriptProperties.frequency]` | `objects[8].scale` / 485 | `engine.registerAudioBuffers(n)` → 稳定 `{left,right,average}` |
| **3326873240** | `mediaThumbnailChanged` | 6 | `newColor = event.primaryColor` / `event.tertiaryColor` / `event.textColor`（再 `.subtract().multiply().add()`） | `objects[9].color` / 132 | 事件里颜色是 **Vec3 实例** |
| | `mediaPlaybackChanged` | 7 | `thisLayer.visible = event.state !== MediaPlaybackEvent.PLAYBACK_STOPPED;` / `playbackState = event.state` | `objects[9].scale` / 132 | `mediaPlaybackChanged {state}` |
| | `mediaTimelineChanged` | 1 | `defRatio = 1/event.duration; curRatio = event.position/event.duration;` | `objects[15].scale` / 155 | `mediaTimelineChanged {position,duration}` |
| | `mediaPropertiesChanged` | 2 | `mediaData = event.artist` / `event.title` | `objects[18].text` / 160 | 同上 |
| | `registerAudioBuffers` | 20 | `engine.registerAudioBuffers(16)` **与** `(engine.AUDIO_RESOLUTION_16)` 两种写法都有 | `objects[9].scale` / 132 | 两种入参都吃 |
| **3327063360** | `mediaThumbnailChanged` / `mediaPlaybackChanged` / `mediaTimelineChanged` / `mediaPropertiesChanged` | 6/7/1/2 | 同 3326873240 同一作者（Rusty 的 Music Player 套件；`export let __workshopId='3219510589'`） | `objects[17].color` / 2089 | 同上 |
| | `registerAudioBuffers` | 34 | 同上 | `objects[5].scale` / 6169 | 同上 |
| **3470764447** | `mediaThumbnailChanged` | 2 | `newColor = event.primaryColor` / `event.textColor` | `objects[12].color` / 2089 | 同上 |
| | `registerAudioBuffers` | 17 | `engine.registerAudioBuffers(engine.AUDIO_RESOLUTION_16)` | `objects[12].scale` / 2089 | 同上 |
| **3544152633** | `mediaPropertiesChanged` | 4 | `mediaData = event.albumArtist` **和** `mediaData = event.albumTitle` | `objects[65].text` / 5684、`objects[66].text` / 5685 | 官方字段名 `albumTitle`/`albumArtist` |
| | `mediaThumbnailChanged` | 9 | `color = event.primaryColor` | `objects[41].effects[0].passes[0].constantshadervalues.multiply` / 5534 | 同上 |
| | `mediaPlaybackChanged` | 2 | `if (event.state == MediaPlaybackEvent.PLAYBACK_PLAYING) cooldownTimer = 0;` | `objects[48].effects[2].visible` / 5597 | 同上 |
| | `mediaTimelineChanged` | 1 | `@param {MediaTimelineEvent} event` | `objects[48].origin` / 5597 | 同上 |
| | `registerAudioBuffers` | 1 | `let audio = engine.registerAudioBuffers(16)` + `audio.average.reduce((a,b)=>a+b)>1` | `objects[48].alpha` / 5597 | `average` 是 Float32Array（`.reduce` 可用） |
| **全语料** | `mediaStatusChanged` | **0** | —（官方 d.ts + 插入菜单有） | — | 仍实现：`clearMedia()` → `{enabled:false}` |
| **全语料** | `getAverageVolume()` / `getFrequencyData()` | **0** | —（官方 d.ts 也零命中） | — | 仅作**非官方兼容别名** |
| **全语料** | `mediaProperties()` / `mediaThumbnail()` | **0** | —（只有 `*Changed`） | — | 不实现（避免养出非官方写法） |

合计：**6 个容器 / ≈180 个媒体·音频脚本节点 / `registerAudioBuffers` 140 处**；音频读法 100% 是
`audioBuffer.average[i]`（+ `.average.reduce(...)` 判有没有声音），**没有第二种写法**。

### 3. 模块边界

| 文件 | 职责 | 不做什么 |
|---|---|---|
| `elysia/scene-scripts.js`（改） | 新增导出 `dispatchScriptEvent(cache, name, payload, opts)`；entry 上加 `owners:Set` / `lastOwner` 两个记账字段 | 不解析媒体状态、不碰音频数据、不改 `compileScript` 的 API 面 |
| `elysia/media-host.js`（新） | 媒体状态机（曲目/封面/时长/进度/播放态/歌词）→ 官方 event 形状 → `opts.dispatch`；`setAudioSpectrum` + `audioBuffers(n)` 稳定缓冲 | 不 import `scene-scripts.js`（靠 `opts.dispatch` 解耦，可纯 Node 单测）；无 DOM、无网络，不建 Blob/URL |
| `elysia/media-lyrics.js`（新） | LRC 解析 + 二分当前行 + 包内探测优先级 + `?lyrics=` 解析 | 不联网抓歌词；不读文件系统（宿主给 `readText`） |

### 4. 宿主注入契约（**父 agent 接线要用的确切签名**）

```js
// ── scene-scripts.js 新增（唯一新导出）─────────────────────────────────────────
export function dispatchScriptEvent(cache, name, payload, opts?) → { entries, calls, errors }
//   cache   : createScriptCache() 的返回值（或直接 Map<src,entry>）；null → {0,0,0}
//   name    : 'mediaPropertiesChanged' | 'mediaThumbnailChanged' | 'mediaPlaybackChanged'
//             | 'mediaTimelineChanged' | 'mediaStatusChanged' | 'mediaLyricsChanged'(非官方扩展)
//   payload : 官方 event 对象（media-host.js 造好；颜色字段是 Vec3 实例）
//   opts.onError(name, err) 可选
//   同一脚本源被 N 层复用时：对 owners 里每个 owner 各调一次（entry 级 setOwner 还原 → thisLayer 不串层）

export function invalidateUserProps(cache) → number
//   清掉所有 entry 的 userPropsApplied → 下一帧重新调 applyUserProperties(当前属性表)。
//   用途：**接入 scriptCache 后 P-61 属性面板的即时生效安全阀**（见 §4 陷阱 C）；幂等，返回被重置的 entry 数。

// ── media-host.js 导出 ────────────────────────────────────────────────────────
export function createMediaHost(opts?) → host
//   opts: { dispatch?(name,payload), now?():ms, timelineIntervalMs?=250, onError?(name,err),
//           spectrum?, lyrics? }
host.setMedia({ title, artist, subTitle, albumTitle, albumArtist, genres, contentType,
                coverUrl?, coverBytes?(Uint8Array), coverMime?,
                colors?:{primaryColor,secondaryColor,tertiaryColor,textColor,highContrastColor},
                primaryColor?, …, duration?, position?, playback?, lyrics? }) → { dispatched:[名字] }
host.clearMedia()            → { dispatched:['mediaStatusChanged'] }     // 播放器关闭/无媒体
host.setPlayback(MEDIA_PLAYBACK.PLAYING|PAUSED|STOPPED | 'playing'|'paused'|'stopped') → { changed, state }
host.updatePosition(sec)     → { position }        // 宿主权威进度（<audio>.currentTime）；立即派发 timeline
host.tick(now?)              → { dispatched:[] }   // 每帧/定时调：按墙钟推进 + timeline 节流 + 歌词换行
host.setAudioSpectrum({ left?, right?, average?, volume? }) → 归一化后的频谱快照
host.audioBuffers(len)       → { left, right, average }（Float32Array，**同一 len 永远同一对象、原地更新**）
                               // ← 直接塞进 applySceneScripts 的 opts.audioBuffers
host.getCoverForTexture()    → {kind:'url',url} | {kind:'bytes',bytes,mime} | null  // ← 绑 $mediaThumbnail 用
host.setLyrics(lrcText|[{t,text}]|null, {path?, silent?}) → { lines, path }
host.pushStatus/pushProperties/pushThumbnail/pushPlayback/pushTimeline/pushLyrics()  // 手动派发
host.getState(now?) / host.position / host.playback / host.events / host.stats
export const MEDIA_PLAYBACK = { STOPPED:0, PLAYING:1, PAUSED:2, UNKNOWN:-1 }
export const MEDIA_CALLBACKS = ['mediaStatusChanged','mediaPlaybackChanged','mediaPropertiesChanged',
                                'mediaThumbnailChanged','mediaTimelineChanged']
export function resolveLyrics({ override?, entryPaths?, mediaPath?, mediaName?, readText? }) → {path,lines}|null
export function parseLRC(text) → [{t,text}] / lyricIndexAt(lines,t) → idx|-1 / lyricLineAt(lines,t) → string
export function lyricsOverrideFromSearch(search) → null(无) | ''(显式关) | '包内路径'
```

**6 行接线示例**（父 agent 用）：

```js
// ⓪ 先备好缓存（demo 现在**没有**传 scriptCache；见陷阱 A/B，这一步是媒体集成的**前提**）
const scriptCache = createScriptCache(); scriptCache.shared = scriptShared   // ← 必须沿用既有 shared
const media = createMediaHost({ dispatch: (n, p) => dispatchScriptEvent(scriptCache, n, p) })   // ①
media.setMedia({ title: track.title, artist: track.artist, duration: audio.duration, coverUrl })// ② 曲目变了就调
media.setPlayback(audio.paused ? MEDIA_PLAYBACK.PAUSED : MEDIA_PLAYBACK.PLAYING)                // ③ play/pause/ended 里调
media.updatePosition(audio.currentTime)                                                         // ④ timeupdate 里调
// ⑤ applySceneScripts 的 opts 里加 `scriptCache,` 并把 `audioBuffers: audioBuffers` 换成 `audioBuffers: media.audioBuffers`
// ⑥ 频谱：analyser.getFloatFrequencyData(f32) → media.setAudioSpectrum({ average: f32.map(v => Math.max(0, (v+100)/100)) })
```

**三个必读陷阱（不处理会静默坏掉既有功能）**

* **陷阱 A：没有 `scriptCache` 就没有媒体集成。** `applySceneScripts` 只在传了 `scriptCache`（或等价
  `Map`）时才按脚本源缓存编译结果。demo 目前没传 → 每帧重编译 → 脚本里的 `var mediaData` 每帧被重置为
  `""`，`mediaPropertiesChanged` 写进去的曲名下一帧就没了（歌名永远空白）。所以 **`scriptCache` 是前提，不是优化**。
* **陷阱 B：既有 `audioBuffers` 必须换掉。** demo 现有的 `audioBuffers(n)`（demo.html:1779）每次调用都
  `return { left: out, right: out.slice(), average: avg }` —— **每次新对象**。现在没有缓存所以"碰巧"能用；
  一旦缓存下来，`engine.registerAudioBuffers()` 在脚本顶层只调用一次 → 脚本永远读编译那一刻的数组 →
  音频反应**静默失效（恒 0）**。换成 `media.audioBuffers`（同一 `len` 永远同一对象、`setAudioSpectrum` 原地更新）。
* **陷阱 C：`shared` 会被 `cache.shared` 顶掉。** `applySceneScripts` 里是
  `const shared = (cache ? cache.shared : null) || opts.shared || {}` —— 传了 `scriptCache` 之后，
  `opts.shared`（demo 的 `scriptShared`）**不再生效**，脚本间共享状态会换到一个空对象上。
  必须 `scriptCache.shared = scriptShared`（一行）。
* **陷阱 D（P-61 × P-62）：`applyUserProperties` 只跑一次了。** 现在无缓存 → 它每帧都被调用；有缓存后按官方
  语义只调一次。**只靠 `applyUserProperties` 生效的脚本**（3326873240 的后处理层这类）在属性面板改属性后
  不再收到回调 → 面板看似失效。属性变更处补一行 `invalidateUserProps(scriptCache)` 即可（本补丁已导出）。

### 5. 关键实现要点（都是踩过/防踩的坑）

1. **`registerAudioBuffers` 必须原地更新**。官方示例在脚本**顶层**调一次并长期持有返回值
   （E4），所以宿主若每次返回新对象，脚本读的永远是编译那一刻的全 0。本实现按 `len` 缓存对象、
   `setAudioSpectrum()` 就地改写 → 测试 T4e/T4f/T4g 专门钉这条。
2. **颜色字段必须是 `Vec3` 实例**。语料脚本对 `event.primaryColor` 做
   `subtract().multiply().add()` 渐变插值；给 `{x,y,z}` 字面量会 `TypeError` 熔断整个 update。
3. **`dispatchScriptEvent` 必须还原 `ownerRef.current`（P-60 约束）**。回调发生在两次
   `applySceneScripts` 之间，`thisLayer/thisObject` 靠 `ref.current`；entry 上记 `owners:Set` + 每次
   调用前 `setOwner(owner)`。真机依赖：3554161528 的 `mediaThumbnailChanged(){ thisObject.getAnimation().play() }`。
   **绝不可**把 P-60 的惰性 getter 改回"工厂函数体开头 `const obj = ref.current`"。
4. **无媒体 = 什么都不派发**（不是派发空值）。作者层因此停在 authored 可见性/占位文本；
   只有显式 `clearMedia()` 才发 `mediaStatusChanged({enabled:false})`。测试 T5a–T5g。
5. **timeline 节流**：官方文案是"sent **frequently** while playing"，逐帧刷会把脚本 update 放大到 60Hz 做除法/写样式；
   默认 250ms 一次（`opts.timelineIntervalMs` 可调），测试 T2g 实测 1s 内 4 次。
6. **`?lyrics=` 是唯一新 URL 开关**，解析写在 `elysia/media-lyrics.js`（`/[\?&]lyrics=/` 字面量，
   `diag-flag-check.mjs` 的 (c) 规则抓得到）→ 已同步登记 `README-DIAGNOSTICS.md` ③ 表。

### 6. 歌词结论（用户口径：只做包内自带的）

**语料未发现自带歌词的包**（如实记录，扫描脚本只读）：
* 松散 `.lrc/.srt/.ass/.vtt` 文件：**0**（`allwallpaper/**` 全树）
* 容器内 `.lrc/.srt/.ass/.vtt` 条目：**0**（88 容器 + 22 workshop 目录）
* `project.json` 含 `lyric` 字段：**0**
* `scene.json` 里唯一 `lyric` 命中 = **用户属性名** `brmusiccoverlyricsdragbrbr`（3660962877 / 3544152633 的拖拽属性名，不是歌词内容）
* 官方侧同样为零：`lib.sceneScript.d.ts` 里 `lyric` 出现 **0 次**；官方媒体文案只承诺 "title, artist and album cover"
  → **官方媒体 API 没有歌词这一类**

因此：按"通用探测 + 没有就跳过"实现，并留 `?lyrics=<包内路径>` 手工覆盖入口（`=0`/`=off` 显式关闭）。
探测优先级（`findLyricsEntry`，全部大小写不敏感、`\`/`/` 等价）：
`?lyrics=` 覆盖 → 音频同目录同主名 `<dir>/<song>.lrc` → `<dir>/lyrics/<song>.lrc` → 包根 `lyrics/<song>.lrc`
→ 任意位置 `<song>.lrc` → 曲名/歌手命名 → 包内唯一 `.lrc` → `lyrics/` 下第一个 → 最浅的第一个 → **null（跳过）**。
解析：LRC `[mm:ss.xx]`/`[mm:ss:xx]`/`[mm:ss]`、一行多标签、`[offset:±ms]`、元数据行跳过、BOM/CRLF；
查询用**二分**（2 万行 × 2 万次查询 6ms，测试 T6m）；当前行只走**宿主进度**，不联网。

### 7. 测试

新增 `media-host-test.mjs`（注册进 `run-all-tests.sh` 为 `media-host`；门禁 50 → **52 项**，其中 51 为本次新增、
`props-panel` 为并行 P-61 会话新增），**109 断言**：
T1 hina 真包 `3554161528` id1592 端到端（注入 title → 层 `text.value` 变成注入值；9 断言）/
T2 三态 + 进度推进 + timeline 节流（9）/ T3 封面 URL+字节两形态 + 真包主色脚本 + Vec3 链式运算（12）/
T4 真包 `3660962877` 官方音频片段：**同一对象原地更新** + 数值 == 公式预期 + 降采样/别名/整场景不新增报错（17）/
T5 无媒体回归（0 派发 / visible 逐位不变 / 真包 3 帧 0 报错，8）/
T6 歌词解析+二分+边界+探测+`?lyrics=`（32）/ T7 `dispatchScriptEvent` 多条目广播 + 同源多 owner + thisLayer 惰性绑定
+ `invalidateUserProps` 失效语义（18）/ T8 **接线陷阱实证**（3）：无 cache → 无可派发条目；旧"每次新对象"audioBuffers +
缓存 → 音频在播也**恒 0**（0.265248 五帧不动）；换 `media.audioBuffers` → 同场景同脚本立刻被推动（0.265248→0.295088）。
全部用**真包脚本原文**，无假脚本；真包缺包时从 `samples/wallpapers/<id>/` 回退到 `allwallpaper/dd/<id>/`。
※ 前一个回退档已于 **P-87（2026-09-15 版权）删除**（该目录不再随仓库分发）；今天只剩 `allwallpaper/dd` 一档 + 自带合成样例。

### 8. 未实现 / 明确不做

1. **封面调色板不从像素推**：官方 `MediaThumbnailEvent` 的 5 个颜色由系统媒体源提供；本机没有解码器/采样器，
   所以 `colors` 必须由宿主显式注入（默认黑/白中性值）。`coverBytes` 只作为 `$mediaThumbnail` 纹理的来源，
   **不给脚本**（官方脚本也拿不到图片本体）。
2. **`$mediaThumbnail` / `$mediaPreviousThumbnail` 材质纹理的实际绑定**未做：本模块只给
   `getCoverForTexture()` 出口；在 `core/we-scene-bundle.js` 里把它接到材质纹理槽属于渲染端改动（该文件本轮被并行会话独占）。
3. **`mediaStatusChanged` 无真实触发源**：只在 `clearMedia()` 里发 `{enabled:false}`；
   "系统媒体会话开关"这件事本机没有（Windows media overlay / GSMTC 不可得）。
4. **歌词滚动动画/卡拉OK 高亮**未做：只给"当前行文本 + 下标"，动画是作者脚本的事。
5. **`getAverageVolume()` / `getFrequencyData()` 是非官方别名**，不保证与任何第三方库同语义（官方没有这两个 API）。
6. **真机音频未实听**：容器无音频输出设备；测试只证明"注入的数值原样到达脚本"，不证明听感。
7. **封面调色板的真实来源未接**：官方 5 个颜色由系统媒体 overlay 提供，本机拿不到；`colors` 只能显式注入
   （默认黑白中性值）——想让封面自己出配色需要图像解码+取色，属渲染端改动。
8. **`?lyrics=` 的 URL 解析函数已导出但未接线**（`lyricsOverrideFromSearch(location.search)`）——接线在 `demo.html`，本轮不动。

---

## P-64（2026-09-15，渲染器侧子任务）官方属性面板批次 2：真机 8 条问题（第 11/14/15/16/17/18/6/5/22 项）

**范围（文件边界）**：只改 `demo.html` + `props-panel-test.mjs` + `README-DIAGNOSTICS.md` + 本文件。
`core/we-scene-bundle.js`（另一子任务独占）与 `elysia/**` **一个字都没改** —— 凡是根因在 bundle/宿主的，
列在文末「交回主会话的 bundle 侧清单」。

### 逐条：真机现象 → 根因（行号）→ 改法

**① 第 11 项「名称里带 `&nbsp`」** —— 根因在**识别层旁边的显示层**：作者 `text` 写的是
`"&nbsp&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;星期位置X  Week position X"`（**首个实体没有分号**，HTML 合法
legacy 写法）。`core/we-scene-bundle.js:1599` 的 `propLabel` 只替换 `/&nbsp;/gi`（带分号）→ 剩下的 `&nbsp`
原样进标签。全语料扫描：**31 条**（日月循环 3326873240 / 砂狼白子 3327063360 / 3470764447 / 3660962877 的
`x/x1/x2/x3/y/y1/y2/y3` 等）。
改法（**照用户口径：只看显示层，识别层不动**）：`demo.html` 面板块新增 `API.decodeEntities`（453）→
命名实体（含无分号 legacy，按 HTML「后面不接字母/数字/`=`」消歧）+ 十进制/十六进制数字实体，**只解一次**
（`&amp;lt;`→`&lt;`）、未知实体原样；`API.collapseWs`（476）把连续空白（含 `\u00A0`）折成 1 个、
**保留作者 `<br>` 换行**；面板的唯一标签出口 `API.displayLabel`（483）同时用于行标签、`group` 标题、
combo 选项标签。`it.key`/`condition` 零改动。

**② 第 14 项「`imgsrc http photogz…` 是什么 / 名字太长 / 顶掉上一行」** —— 结论：**那是作者用 HTML 塞进来的
装饰图片**。日月循环 3326873240 里有 10 条这样的属性，键名就是 `text` 原文去掉标签后的 slug（**最长 195 字符**），
`text` 形如 `<img src="http://photogz.photo.store.qq.com/…" width="2000" height="1">`（宽 2000、高 1~56 的
**分隔线/占位图**），`type` 既有 `color`（→ 面板上显示成取色器，用户看到的"选择颜色"）也有 `bool`（→ 勾选框"开"）
和 `text`。`propLabel` 去标签后是空串 → 旧面板 `it.label || it.key` 只能回退显示整条键名。
改法：`API.htmlKindOf`/`API.imgSizeOf`/`API.labelFor`（485/499）——作者只写 HTML 的条目显示成
**`🖼 图片 2000×1`** 占位符（≤14 字符），全文进 `title`（`API.labelTitleFor`，518，含一句"这是装饰图不是功能项"）；
带作者文字的（如"可以给个好评收藏支持一下吗"）照常显示作者文字。"顶掉上一行"是同一个排版根因（见 ④）。

**③ 第 16 项「选择颜色用插件里那套选择器浮窗」** —— `demo.html` 面板块新增 `API.openPicker`（589）：
**照搬** `$MPW_ROOT/dsh-mpkg-wallpaper/lib/client.js:6660-6789` 的交互与视觉（自绘 HSV：色相条 +
饱和/亮度面板 + 预览 + hex 输入 + 确定；点外部/Esc 关；上下防溢出定位；`window` 监听成对增删）。
类名 `mpw_picker*`（CSS 66 起），色块 `mpw_colorSwatch` 沿用插件视觉；`<input type=color>` 全部下线（第 18 项的黄框
也一并消失）。写回仍是**线性 0..1**（`API.hexToColor`），并用 `data-mpw-picker-anchor=<key>` 保持插件同款锚点约定。
比插件多一处修复：延后注册 outside 监听时**校验实例仍是当前浮窗**（插件里快速"开→确定→开"会漏一个永不解除的
document 监听）。

**④ 第 17 项「最后一项声明翻不到底 / 文字被覆盖」** —— 根因是旧 CSS 两行：
`demo.html` 旧 `#mpw-props-panel .row{align-items:center}` + `.lb{overflow:hidden;text-overflow:ellipsis;max-height:2.6em}`
→ 行高被旁边的控件钳死，多行文本被裁且**永远滚不到**（日月循环最后一条 `order=202 / type=text / 1083 字符` 的「声明」是最典型的）。
改法：`.row` 改 `align-items:flex-start`（30）、`.lb` 去裁剪三件套 + `white-space:pre-line;overflow-wrap:anywhere;min-width:0`（32）、
控件收进 `flex:none` 的 `.ct`；容器 `overflow-y:auto` + `padding:6px 8px 18px` + `scroll-padding-bottom:18px`
→ 行高 = max(文本排版高, 控件高)，末行完整可见。

**⑤ 第 18 项「输入框灰边、选中变黑、不要黄框」** —— 输入框规则集中在 37-40 行：
`border:1px solid #666` → `:focus{border-color:#eee; outline:none; box-shadow:none}`（深色主题里"黑"=亮前景色），
零黄色/品牌色描边；取色器 hex 输入框同口径（72）。

**⑥ 第 22 项「Uiverse 勾选框（加 `mpw_` 前缀）」** —— 逐条照抄 `docs/SVG-ICONS.md` 末尾那份 CSS，类名换成
`.mpw_cb` / `.mpw_checkmark` 并全部限定在 `#mpw-props-panel` 下（52-62）；`makeControl`（682）把 bool 渲染成
`<label class="mpw_cb"><input type=checkbox><div class="mpw_checkmark"></div></label>`（input 在前，
`~` 兄弟选择器才生效）；`ctrl` 仍是那个 `<input>`，取值/禁用/事件链路逐位不变。

**⑦ 第 5 项「自定义文字要能改且即时生效」** —— 根因在 demo 的**脚本同步循环**（旧 `demo.html` 文本同步分支）：
对 `{user:"自定义文字"}` 形态的 `text` 节点**无条件**取 `raw.text.value`（= 作者默认），面板刚用
`applyUserProperties` 写对，下一帧就被改回去。真机证据：日月循环层 2045 `文本1 ← newproperty55`、
层 8031 `文本2 ← _2`（两条 textinput「自定义文字」）。
改法：抽出 `mpwTextSyncValue`（标记 `MPW-P64-TEXT-SYNC-BEGIN`，1971 起）按 P-61 绑定口径 1 取值
（用户属性有该键且未被门控 → 用户值，否则作者默认），同步循环在 2253 调用；门控集合每趟只算一次。
实测：改 `newproperty55` → 层 `__text.text` 立刻变、`textureName=''` → demo 下帧重光栅化（新文本）。

**⑧ 第 15 项「面板调整好像不能实时生效」** —— 两个独立成因，都在本次修掉：
1. **脚本缓存的 `applyUserProperties` 只跑一次**（官方语义；`elysia/scene-scripts.js:607` `entry.userPropsApplied`）：
   面板改值后不复位 → "只在 `applyUserProperties` 里读用户属性"的脚本（日月循环 3326873240 的
   `timevarying`/`display`/`morningtime`/`daytime`/`dusktime`/`nighttime`）永远停在旧值。
   demo 此前**从不传** `scriptCache`（逐帧重编译 = 实时但费 CPU）→ 现在：`?scriptcache=1` 打开缓存
   （1963），并在面板 `applyAll`（3062）里调 `invalidateScriptPropsCache()`（2956）→
   `invalidateUserProps(cache)`；缓存关闭时是 0 次空操作，旧路径逐位不变。
2. **内置时段选层装载时只算一次**：`applyTimeVariation` 只读 `morningtime/daytime/dusktime/nighttime` 阈值、
   **完全不看** `timevarying`/`display`。改法：新增 `propsPanelTimeArg`（2914）统一选层口径 ——
   `?time=` 最高优先（P-61 不变）→ `timevarying=false` 且 `display` 有值 → 用 `display` 的 condition 值
   钉住对应时段层（作者面板文案"需要自选时间段…请关闭随现实时间变化模式"的可执行版本）→ 否则按现实时钟。
   `applyAll` 只在改动 `timevarying`/`display`/四个时段阈值时重算（`TIME_PROP_KEYS`，不抢层、不刷日志），
   装载点（2876）用同一份口径。

**⑨ 第 6 项「把 project.json + properties 里所有功能都解析出来」** —— 面板尾部新增 `.ft`
（`API.build` 738）：把**跳过条目**按原因分组列出（未实现类型 `scenetexture`/`usershortcut`/`file`、
编辑器配色 `schemecolor`、无 `type` 的 HTML 营销块、空功能开关），默认折叠、点「显示跳过的条目」展开；
每行 `data-bound=1/0`（`propsBoundNames`，2926：层 `__bindRaw` + scene.json 原文 `"user"` 扫描）说明该属性
在场景里是否真被引用（第 14 项那批装饰图就是 0）。第 10 项图标集（`docs/SVG-ICONS.md`）也一并落地：
`API.ICONS`（529）逐字保存用户给的 path，去掉 `lucide` 类名，顶栏按钮用 `settings`、恢复默认用 `undo-2`。

### 测试（`props-panel-test.mjs`，106 → **176 断言**，+70）

T11a-T11k 实体解码（真值表 / 只解一次 / legacy 消歧 / 未知实体 / 换行保留 / 识别层零改动 /
**全语料 22 包零残留**）；T12a-T12j `<img>` 条目（10 条键名、9 条空标签、占位符、title 全文、
截断兜底、`data-bound=0`、最后一条声明 1083 字符全文进 DOM）；T13a-T13p 排版/输入框/勾选框
（裁剪三件套绝迹、`align-items:flex-start`、底部 18px、灰边→聚焦变亮、无黄框、`mpw_cb` 结构与取值链路）；
T14a-T14p 浮窗取色器 + 图标（结构/定位/hex 刷新/确定写回 `1 0.533333 0` 并穿透到真实层/0..1↔hex 往返/
Esc/点外部/重复开关不泄漏）；T15a-T15q 即时生效（文本同步真值表、**缓存陷阱实证**：不复位时第 2 次改属性脚本
收不到、`invalidateUserProps` 后收到；装载块真源码切片 + 合成 5 时段层：`?hour=8` → morning、
面板关 `timevarying` → 当帧 pin、选 `display=3` → 真实层 night 可见；无关属性不重算；诊断字段；
无缓存时零行为变化）。
过程里**抓到并修掉**一个真 bug：延后注册 outside 监听会漏解绑（T14p 回归）。

### 真机可操作验证步骤（用户在 :8899 上逐条可复现）

1. `http://127.0.0.1:8899/?id=3326873240`（日月循环）→ 左侧「⚙ 属性」面板：
   - **第 11 项**：`星期位置X/时间位置X/日期位置X/镜头位置X`（+Y 组）标签**不再**出现 `&nbsp`（现在是纯文字）。
   - **第 14 项**：滚动到「赞助」段，原来那些超长 `imgsrc http photogz…` 行现在显示 `🖼 图片 2000×1` 之类，
     鼠标悬停看 `title` 有完整键名与 `<img>` 原文；行与行不再互相压字。
   - **第 17 项**：滚到面板最底部 → 最后一条「⚠️声明/Statement」的中英全文**能完整滚出来**，底边不切字。
   - **第 16 项**：点任一颜色行左侧色块 → 弹出 HSV 浮窗（色相条 + 方块 + `#rrggbb` 输入 + 确定）；
     拖动/输入/确定后画面颜色立刻变（与插件里那个取色器手感一致）；点浮窗外或按 Esc 关闭。
   - **第 15 项**：勾掉「🔘随现实时间变化开启」→ 下面出现「时间段选择」，选「夜晚 Night」→ **不刷新**页面，
     画面立刻切到夜晚层；再勾回「随现实时间变化」→ 立刻按当前时钟选层（`?hour=` 可固定小时对照）。
   - **第 5 项**：勾上「🔘组件自定义文字」→ 在「自定义文字」输入框里改字 → 画面文本**边打字边变**（不再弹回作者默认）。
   - **第 18/22 项**：输入框是灰边、点进去变亮、无黄框；勾选框是紫粉渐变方块（Uiverse），鼠标按下有位移反馈。
2. 性能/回退对照：`http://127.0.0.1:8899/?id=3326873240&scriptcache=1` → 日志出现
   「② P-64 属性面板：… 脚本缓存 开（改值即复位 applyUserProperties）」；不加参数 = 旧路径（逐帧重编译）。
3. 一键关面板：`?nopanel`；URL 钉值：`?props=timevarying=0,display=3`（面板里显示 URL 值 + 置灰）。

### 门禁

`bash run-all-tests.sh` → 52 项（另见本轮实际输出）；`props-panel` 176 断言全绿；
`demo-syntax` 8/8；`docs-check` ✓；`diag-flags` 88 == 88（本批新增开关 `scriptcache` 已登记 README 主表；
顺带把并行 P-63/P-67 的 `trail` 也补了行）。

### 交回主会话的 bundle / 宿主侧清单（本轮**没改**那些文件）

1. `volume`(8 条) / `zoom`(3 条) 的对象属性绑定仍未接（渲染层模型无这两个字段：`volume` 走 sound 层、
   `zoom` 走 `cameraNode.zoomRaw`）—— 真机证据：日月循环 `newproperty45`（音量滑块）改了场景状态完全不变。
2. `instanceoverride.colorn`（日月循环 `newproperty16`）这类**嵌套字段上的 `{user:...}`** 不在
   `USER_BIND_KEYS` 里 → 不生效；`writeBindField` 的 `unhandled` 记账可以更响。
3. `propLabel`（`core/we-scene-bundle.js:1599`）建议补 legacy 无分号实体 + 数字实体（本轮在面板侧兜住了，
   但 `preview`/`package-matrix`/插件面板等其他消费方仍会看到 `&nbsp`）。
4. 媒体集成在 demo.html 未接线（`mediaintegrationsize` 等媒体组件属性改了没反应）—— 属 P-62 宿主侧后续。
5. `?scriptcache=1` 的**默认值**建议由主会话裁定：打开可省掉逐帧重编译（真机 CPU 明显），
   但要求"任何属性改动都走面板复位链路"（含 `?props=` 装载路径）；本轮保守地默认关。
6. `elysia/scene-scripts.js` 无需改动；但若将来把 `scriptCache` 设为默认，请同时把
   `invalidateUserProps` 接到 `?props=` 装载路径与媒体事件之后。

## P-64-MEDIA（2026-09-15，渲染器侧子任务）媒体集成宿主接进 `demo.html` —— 用户第 9④ 项（歌名/歌手/封面/进度/时长 + 音频响应）

**背景**：P-62 把宿主侧（`elysia/media-host.js` 544 行 + `elysia/media-lyrics.js` 211 行 + 109 断言）做完了，
明确把"接线"留给 `demo.html`（P-62 §4 的 6 行示例 + 四个必读陷阱）。本批就是那几行 + 两个可验证入口。

### 裁定落实（父 agent 2026-09-15）

**裁定 1（`?scriptcache` 默认反转为「开」）**：`demo.html` 的 `scriptCacheOn` 由 `=== '1'` 改为 `!== '0'`
（demo.html:1966）——理由：用户第 15 项的诉求就是"要实时生效"，而媒体集成也**以缓存为前提**（P-62 陷阱 A）。
实时性由两条保证：① 面板/`?props=` 改值 → `invalidateUserProps`（`invalidateScriptPropsCache`，面板 `applyAll`）；
② 媒体事件走 `dispatchScriptEvent`（不依赖 `applyUserProperties`）。`?scriptcache=0` = 旧的逐帧重编译路径
（逃生口，**逐位等于改动前**：该路径下 `invalidate` 是 0 次空操作、不建媒体宿主、`applySceneScripts` 不收 cache）。
断言：T16q（真源码切片求值真值表：无参→true / `=0`→false / `=1`→true）、T15p（`?scriptcache=0` 逐位等于旧行为）、
T16r（无缓存不建宿主）。

**裁定 2（第 14 项结论）**：见下方「第 14 项结论（用户原话回复用）」，已按原话口径写入本节。

### 接线（`demo.html`，逐段）

| 段 | 行号 | 内容 |
|---|---|---|
| 导入 | 868-872 | `dispatchScriptEvent` 加入 `scene-scripts.js` 的 import；新增 `createMediaHost`（media-host.js）与 `resolveLyrics`/`lyricsOverrideFromSearch`（media-lyrics.js） |
| 缓存块 | 1960-1976 | `scriptCacheOn` 默认开；`sceneScriptCache.shared = scriptShared`（陷阱 C）；挂 `window.__mpwScriptCache`/`__mpwInvalidateUserProps`；声明 `let mpwMediaHost = null`（早于任何帧，避免 TDZ） |
| 音频缓冲 | 2217-2221 | `audioBuffers: (n) => (mpwMediaHost ? mpwMediaHost.audioBuffers(n) : audioBuffers(n))`（陷阱 B） |
| 帧循环 | 4143-4148 | `runSceneScripts` 之后加 `mpwMediaTick()`（脚本已编译进 cache，媒体事件才投递得到） |
| 音频面板 | 4397-4399 | `audioPanelCurrent` 多带 `el`（真实源要读 `currentTime`/`duration`/`paused`；既有 `path/mime/size` 不变） |
| 媒体块 | 4533-4700 | `parseMediaQuery` / `buildMediaPatch` / `applyMediaQuery` / `mpwMediaResolveLyrics` / `mpwMediaLyrics` / `mpwMediaTick` / `initMediaHost` + `window.__mpwMedia` |

### 四个陷阱逐条处理（P-62 §4）

* **A（没有 `scriptCache` 就没有媒体集成）**：缓存默认开 → 宿主默认存在；`?scriptcache=0` 时 `initMediaHost`
  直接返回并日志"不建媒体宿主（P-62 陷阱 A）"。另有一条**时序**陷阱是 P-62 没写的：`?media=` 若在装载时
  `setMedia`，此刻 cache 里**还没有脚本条目**（`dispatchScriptEvent` 按 entry 派发）→ 事件白丢、且 `setMedia`
  第二次不会重复派发属性事件。本实现把注入 patch 挂起（`mpwMediaPendingInject`），**首帧**（`runSceneScripts`
  之后）才 `setMedia` + `setLyrics` → 一次投递即达。
* **B（`audioBuffers` 必须换掉）**：见上表 2217 行。频谱来源 = 场景 sound 层那**一个** `sceneAudio.analyser`
  （P-57 既有），每 ~33ms 取一次 `getByteFrequencyData` → 归一化进**预分配的 Float32Array**（引用直收）→
  `setAudioSpectrum({average})` → `host.audioBuffers(n)` 按 n 重采样并**原地更新**同一对象。
* **C（`shared` 被 `cache.shared` 顶掉）**：`sceneScriptCache.shared = scriptShared`（1968），与旧路径同一对象。
* **D（`applyUserProperties` 只跑一次）**：面板 `applyAll` 里的 `invalidateScriptPropsCache()`（P-64 已接），
  与裁定 1 是同一处代码。

### 媒体源与入口（用户可验证）

1. **真实源**：顶栏 🔊 音频面板里点 ▶︎ 播放本包任一音轨 → `title` = 文件名、`duration` = 元素真值、
   进度按 `<audio>.currentTime`（≥250ms 一次，不逐帧刷 `mediaTimelineChanged`）、播放/暂停 → 官方 playback 事件。
2. **注入源 A（URL）**：`?media=title=…,artist=…,album=…,cover=<包内路径>,color=#rrggbb,position=秒,duration=秒,playback=playing`
   （值内不出现逗号；`?media=` 空 = 不注入）。
3. **注入源 B（控制台）**：`window.__mpwMedia.set({title:'…',artist:'…'}) / .play() / .pause() / .stop() /
   .position(30) / .spectrum({volume:0.8}) / .lyrics(lrc) / .cover() / .state() / .repush()`。
4. **歌词**：只在**包内自带** `.lrc` 时使用（P-62 §6 语料 0 命中 → 通常自动跳过，**不联网**）；
   `?lyrics=<包内路径>` 覆盖、`?lyrics=0` 关闭。
5. **没有媒体 = 什么都不派发**（P-62 §5.4）：不注入、不播放时，作者层停在 authored 占位文本/可见性，零新增报错。

### 测试（`props-panel-test.mjs` 181 → **207 断言**，+26；T16 组）

T16a-T16b `?media=` 真源码解析（百分号解码/小写键/空值丢弃/无键→null）；T16c-T16d `buildMediaPatch`
（数值化、`#rrggbb`→线性 0..1、包内 `cover` → bytes+mime）；T16e-T16f 真宿主：注入后状态 + 官方事件顺序
`status→properties→thumbnail→timeline`；T16g **无媒体零派发**（0 事件 / hasMedia=false）；
T16h-T16j 真实源（音频面板元素 → setMedia(title=文件名,duration)/playback 三态；进度 250ms 节流实证）；
T16k-T16l 频谱（analyser→非零 + `audioBuffers(16)` **同一对象**）+ 陷阱 B 真源码断言；
T16j2 **真包端到端**（hina 3554161528 id1592：`setMedia({title})` → 层脚本产出 = 注入 title，媒体到达脚本）；
T16j3 `clearMedia()` 语义（status{enabled:false}、作者层文本不被清）；T16m-T16p 歌词（自动命中/`?lyrics=` 覆盖/
`=0` 关闭/无 `.lrc` 跳过）；T16q-T16v 装载接线源码断言（默认开真值表、陷阱 A/C/D、首帧投递、`__mpwMedia` 入口）；
T16w-T16x `__mpwProps.media` 诊断字段（有媒体/无媒体两态）。

### 第 14 项结论（用户原话回复用）

> **那条超长名字（日月循环 3326873240）是作者用 HTML `<img>` 塞进来的一张"装饰图/分隔线"**：
> 键名 `imgsrc…width2000height1…` 共 10 条，名字最长 195 字符；作者 `text` 是
> `<img src="http://photogz.photo.store.qq.com/…" width="2000" height="1..56">` —— 宽 2000、高 1~56 的
> **细横条**，用来在官方属性面板里画一条分隔线/贴赞助码图（另有截图/二维码那几条带作者文字）。
> 它们的 `type` 是 `color` / `bool` / `text` 只是作者建属性时随手选的，所以面板上会显示成取色器或勾选框；
> 这些值在 `scene.json` 里**基本没被引用**（面板 `data-bound=0`）→ **不是可调功能项**。
> 处理：按用户第 11 项同一口径收拾显示 —— 现在显示成 `🖼 图片 2000×1` 占位符（鼠标悬停看完整键名与 `<img>` 原文），
> 识别方式（键名/condition）一个字都没改。

### 门禁

`bash run-all-tests.sh` → **53 项全绿**（PASS=53 FAIL=0 SKIP=0）；`props-panel` 207 断言；
`media-host` 109；`audio-panel` 46；`time-variation` 67；`diag-flags` 92 == 92（本批新增开关 `media` 已登记）；
`docs-check` ✓；`demo-syntax` 8/8。

### 未定项 / 交回主会话

1. **封面进画面**（用户第 9④ 项的"封面"）仍差渲染端一步：官方封面走材质纹理槽 `$mediaThumbnail`
   （`effects[].passes[].usertextures[].name` + `type:"system"`，语料 4 包命中），`core/we-scene-bundle.js`
   目前**完全不解析 `usertextures`** → 本批只把封面数据备好（`getCoverForTexture()`），绑定属 bundle 侧（P-62 §8.2 同结论）。
2. **`mediaStatusChanged` 无真实触发源**：只在 `clearMedia()` 里发 `{enabled:false}`（本机没有 Windows
   media overlay / GSMTC）；注入路径可手工试。
3. **封面调色板**（`primaryColor` 等）只能靠 `?media=color=#rrggbb` 注入或 `setMedia({colors})`；
   从图片自动取色需要图像解码+采样，属渲染端。
4. **默认开缓存的回归面**：`?scriptcache=0` 是逃生口；真机上若发现某个"只在 `init` 里读一次属性"的脚本
   行为变化，请先切 `?scriptcache=0` 对照再报。**A/B 实测（4 包 × 9 帧，cache vs 无 cache，同 props 同帧序列）**：
   hina 3554161528 差异 **0/37 层**；日月循环 3326873240 **1/62**（辅助层 `myLayer`(130)：无 cache 时该节点的
   `visible` 脚本**从不展开**（旧路径没有 `cache.map` → `scene.on('update')` 回调根本不触发），有 cache 时
   作者的 `scene.on('update')` 回调真正生效 → 该层 false；130 无 image/无子层 → 画面无影响）；
   Girl and Cat 3544152633 **19/70**（都是 origin，偏移 ≈51px）；伊蕾娜 3660962877 **8/127**（origin 2~4px）。
   后两类的成因是**init-once**（积分/平滑类脚本的状态跨帧保留 = 官方语义），旧路径每帧重编译把状态清零 →
   差异本身就是"官方 vs 旧自造"的差，不是抖动；脚本错误数 cache 侧更少（日月循环 17→10）。
   判据：这些差异**与媒体接线无关**（`fireUpdate:false` 对照差异数不变）。

### 追加：P-68 交接 ⑤.2 的两项（P-64-MEDIA 轮顺带，父 agent 2026-09-15）

1. **上报加 `videoStats`**（demo.html:3903 附近）：`videoStats: (renderer && renderer.videoStats) || null`，
   与 `particleBudget` 同一层 → `/report` 每次自动上报都带 P-68 的 29 字段视频台账（此前只有 5s 一次的
   `[we-scene][P-68]` 日志行）。断言 T17a；README 的 `videoStats` 节从"待他人一行"改为"已接线"。
2. **`?diag` 逐层采样坐标口径修正**（demo.html:3731-3760，**与 P-68 的 `?res=` 块相邻但不重叠**）：
   旧写法 `Math.min(1279, (p[0]+dx)/3)` + `720 − (p[1]+dy)/3` 写死 1280×720，P-68 把画布默认改成
   1920×1080 后 **DIAG 行坐标整体偏**（DIAG 是核对"某层画在哪、什么颜色"的主要证据）。
   改成通用换算并抽成可单测函数 `mpwDesignToCanvas(x, y, cvW, cvH, projW, projH)`：
   `px = round(x / projW × cv.width)`、`py = round(cv.height − y / projH × cv.height)`，
   `projW/projH` 取 `scene.general.orthogonalprojection.{width,height}`（缺省 3840×2160，与渲染端同口径）。
   **自检（T17d/T17e，实测坐标对照）**：设计中心 (1920,1080) → 720p (640,360) / 1080p (960,540) /
   2160p (1920,1080)；设计 (960,540) → 720p (320,180) / 1080p (480,270) / 2160p (960,540) ——
   三档 `x/cvW` 与 `y/cvH` 比例逐一相等（1e-9）。采样块内**已无 1279/1280/`/3` 字面量**（T17b 回归守卫）。
   README 的 `nodiag` 行同步补了口径说明。
   ⚠ **口径修正（同日第二轮，跟投影 bug 修复对齐）**：**不做 y 翻转**。依据 `core/we-scene-bundle.js:5941`
   自己的注释"世界坐标 = 设计像素（y 向下，投影 `mat4Ortho(0,cw,ch,0)` 已 y-down 映射），origin 即图层中心"
   —— `l.origin` 已是 y-down（parseScene 的 `projH − y` 发生在解析期），所以旧代码的 `720 − y/3` 是
   **多翻了一次**（旧的 DIAG 行 y 坐标本来就是镜像的，用过的结论请按新口径复核）。现在
   `px = round(x/projW×cv.width)`、`py = round(y/projH×cv.height)`；世界 (0,0) → 720p (0,0)、
   世界 (3840,2160) → 1080p (1919,1079)。`?projy=legacy` 只改渲染矩阵、不反写 `l.origin`，
   那种 A/B 下采样坐标会随之镜像（默认档不受影响）。

### 追加 2：P-64 轮内的三条小项（父 agent 同日追加，均已落地）

1. **顶栏 ⚙ 按钮回退成文字（用户第 2 条反馈）**："设置不要做成 SVG，整条都被撑宽了"。
   根因：顶栏按钮在 `#mpw-props-panel` **之外**，`<svg viewBox>` 无 width/height 时按替换元素默认
   **300×150** 参与布局（面板内那条 `.ico svg{width:14px}` 够不到它）→ 整条顶栏被撑宽。
   改法：`btnEl.textContent = '⚙ 属性'`（回到 P-64 之前的文字形态）；`API.ICONS` 里**每个**图标
   把 `width="14" height="14"` + `style="display:block"` 写进 svg 本身（`SVG_HEAD`，demo.html:528），
   `.ico` 再补 `flex:0 0 auto` 第二道保险。断言：T14a2（11 个图标全部显式定尺寸）、T14a3（顶栏按钮
   不含 SVG）、T13f2（`API.build` 的行/分组段零 `API.icon(` 调用 → **行宽不因图标变化**）。
2. **逐层调试首层 off-by-one（用户第 2 条）**："未开启逐层调试时按一下右键直接跳到第 2 层"。
   根因：`curPos()` 用 `Math.max(0, __lnOnly)` 把"未进入调试(-1)"夹成 0 → `setPos(0+1)` 落**索引 1**。
   改法：`curPos()` 不再夹（返回 -1），新增纯函数 `lnTarget(pos, entering, delta)` +
   `moveBy(delta)`（demo.html:3203-3206），**未进入调试时 →/←/↑/↓ 一律落第 0 层 = 角标"第 1/n 层"**
   （保守口径：← 不从最后一层进，与用户原话一致）；键盘 `keydown` 与插件 `mpw-ln-key` 两条路径共用
   `moveBy`。断言：T18a-T18e（含 `lnTarget` 真源码切片真值表）；`time-variation-test` T7e/T7f 已按
   修正语义改写（期望值由 `lnTarget` 推导，不再抄旧 off-by-one 数字），并新增 **T7f2 路径等价性**
   （同按键序列在两路径产生逐项相同的 `setPos` 序列与落点）+ T7f3（未进入时 ↑ 两路径都忽略）+
   T7f4（← 首进也落第 0 层）→ `--only time-variation` **70 通过 / 0 失败**。
3. **帧率取证三字段**（用户"帧率太低看不出别的"）：`/report` payload 新增
   `fps`（`#fps` 元素显示值，回落 `window.__mpwFps`）、`frameMs`（**复用帧循环已有时间戳**的 120 帧
   滚动中位，`window.__mpwFrameMsP50`，与 fps 同一次 500ms 刷新 —— **不新起 rAF/计时器**）、
   `resTier`（`window.__mpwResTier` 的 `{name,width,height,legacy}`）。断言 T17f/T17g/T17h-3。
4. **🔊 音频面板排期前移（用户第 1 条"音频要两三秒才扫出来"）**：真根因**不是扫描慢**（枚举只读
   `pkg.entries` 目录表 + 候选条目头 12 字节），而是 `installAudioPanel()` 排在
   "整包 arrayBuffer + parsePkg + `await loadScene()` 全量纹理"之后。改法：调用点前移到
   `await loadScene()` **之前**（demo.html:3707，`pkg`/`sceneObj` 都已就绪）；`installAudioPanel` 改
   **幂等**（`__mpwAudioPanel` 缓存，块内那次调用是兜底 + 满足 `audio-panel-test` 的切片契约）→
   列表秒出、画面继续加载；DOM id / `window.__mpwAudio` / `localStorage['mpw-audio-open']` 契约不变
   （`audio-panel` 46 断言 + `audio-panel-real` 6 断言全绿）。剩余成本：候选音频条目仍走
   `lib.getEntry`（整条 inflate）只为读 12 字节头 —— 条目数是个位数，量级 ms；要再快可以走
   `pkg-extract` 的偏移/长度直读（属插件/工具侧）。

### 追加 4：手动上报按钮（用户："加一个手动上报的按钮，记得检验一下是否真正生效"）

**关键坑**：旧 `doReport` 开头是 `if (reportCount >= 4) { clearInterval(reportTimer); return }` ——
每次加载最多自动上报 4 次，之后连定时器都清掉 ⇒ 用户在页面待过 ~40s（正是逐层调试 A/B 的场景）后
点按钮会被**静默挡掉**（"按钮没反应"）。
改法：把闸门抽成纯函数 `mpwReportGate(state, manual)`（demo.html `MPW-HEALTH` 块之后）——
**只有自动路径受 `MPW_MAX_AUTO_REPORTS=4` 上限**（`auto` 记"自动尝试次数"），手动永远放行；
新增 `mpwReportCommit(state, seq)`：**上报成功才提交计数**（HTTP 500/抛错不涨 `#N`）。
按钮 `🛰 立即上报`（id `mpw-report-btn`）挂在 `#logbar` 行内（`mousedown/touchstart` 都 stopPropagation，
不会误触"拖动改日志高度"）；点击 → `doReport({manual:true})`（**同一个 payload 构造**，不另写一套）→
成功 `✅ 已上报 #N`、失败 `❌ 上报失败`（1.5s 复原；手动失败另打 `⚠ 手动上报失败：HTTP 500` 日志，
旧实现 `.catch(() => {})` 静默吞掉）；台账采集窗口 `mpwArmLedger(1200)` 两条路径都执行（漏了下一次台账是空的）；
控制台入口 `window.__mpwReport = { now(), count(), button }`。`?noreport` 时整块不装载。
**语义选择（写清）**：手动不消耗自动预算、也不清 `reportTimer`；日志行 `🛰 已手动上报 #N`（自动为 `已自动上报`）。
断言 T20a-T20i（真源码切片 + 假 DOM：闸门真值表 / 自动 4 次封顶 / **auto=4 时手动仍发 1 次 POST**（核心回归）/
500 → ❌ 且不计数 / 成功 → `#N` / `__mpwLedgerWant` 置位 / 连点只发一次 / 日志与入口源码断言）。

### 追加 5：台账 `rect`/`px` 口径统一 y-down（侦察报告 RENDER-MISSING-LAYERS 的 A 条）

**bug**：`onLayerDraw` 里 `scr()` 给的是 **GL 窗口 y（底左原点）**，旧实现直接当 y-down 用（注释还写"同设计
坐标"）→ 四边形层 `rd` 成了 `H − 真实 y`、`px` 采样点也被镜像，而蒙皮层是真实 y = **同一份上报两种口径**
（父 agent 判四边形层位置被带反）。
改法：新增纯函数 `mpwLedgerYDown(yA, yB, H, oyPx)`（demo.html `MPW-HEALTH` 块）——用 `layer.origin`
（设计坐标 y-down，parseScene 已翻好；经投影高换算成画布像素）当**锚**自动定符号，quad/mesh 两种矩阵
约定都自洽；取不到 origin 时按"GL 底左 → y-down"默认换算。`rd` 与 `px` 共用同一套 y（`px` 再由 y-down
换回 GL 底左交给 `readPixels`，即原来的 `height-1-cyTop` 现在才是对的）。README 的 `layerHealth` 字段表
已写明"`rect`/`px` 统一 y-down（顶左原点），与 `layers[].origin` 同空间"。断言 T21a-T21d。

### 追加 7：手动上报按钮**挪到顶部工具栏**（真机 bug：点它把日志收起来了）

用户原话："把手动上报的按钮加在上面放壁纸的那个地方 —— 我一点手动上报，他就把下面日志收起来了"。
**真因不是"位置重叠"**：`#logbar` 的拖动/点击判定听的是 **`pointerdown`**（demo.html:370，**早于 `mousedown`**），
`onUp()` 里"按下+抬起位移 <5px 当点击"就 `toggle()` 日志（demo.html:353-358）—— 旧版把按钮挂在 `#logbar`
里、只 stop 了 `mousedown/touchstart/click`，`pointerdown` 已经冒泡上去把 `st.drag` 建好了 ⇒ 一按就收起。
改法（两条都做）：① 按钮改挂 **`#bar`（顶部工具栏，与「▶ 动画版」「蒙皮 y 方向切换」同一行）**，
`getElementById('bar')`，结构上离开 `#logbar`（治因，**不给 `#logbar` 加"排除按钮"特判**）；
② `stop()` 列表补齐 **`pointerdown` + `pointerup`**（以后被挪进任何可拖动容器都不会复发）。
断言 T22a-T22d：按钮在 `#bar`、`closest('#logbar')===null`；**点它后 `__mpwLogPanel.state().collapsed` 不变**；
并加**反证**一条 —— 把同一颗按钮放回 `#logbar` 内，同样的 pointerdown/pointerup 序列**确实会**收起日志
（证明回归断言不是假绿，根因抓得住）。
### 追加 8：`?bones=` 逐骨探针回传（并行 P-75；只读探针，未开时零开销）

① 日志白名单放行 `[bones]`（`demo.html` 的 log 过滤链）；② **结构化字段**（更可靠、不受 `slice(-6000)` 截断）：
payload 里 `...(typeof window.__mpwBones !== 'undefined' ? { bones: window.__mpwBones } : {})` ——
**未开 `?bones=` 时该全局不存在 → 键不出现**（保持"默认不写、不改变任何行为"契约；`log` 仍 6000，
不为了它放大总长度）。断言 T22e/T22f **两向**（有 → 带上且帧数/字段与桩一致；无 → payload 不含该键）+ T22g。
### 追加 6：🔊 音频面板排期取证时间戳（父 agent 要求"面板出现在画面之前的时刻"证据）

`installAudioPanel()` 前移处打一行 `[we-scene] 🔊 音轨列表就绪 @Xms（本包 N 条）—— 早于纹理加载；画面继续加载`；
`/report` 的 log 过滤收 `[we-scene]` 行 ⇒ 上报里能直接对照下一行 `纹理加载完成 (Yms)`，证明"先出列表、后出画面"。
（早前 P-64 追加 2 的第 4 条已记录前移本身；本条只补可核对的时刻证据。）

### 追加 3：`layerHealth` 归因 + `missingLayers`（用户："分不清层是隐藏还是没画"）

`/report` 的 `layerHealth[]` 每项新增 `visible`（解析后的最终可见性）与 `visibleBy`
（`ln-hidden` / `container` / `userProp:<名>(gated)` / `timeVariant` / `uiRe` / `N5:<类别>` / `script` / `author`；
可见层为 `null`）；新增汇总 `layerHealthSummary = {total, drawn, invisible, skipped, missing}` 与
`missingLayers[] = [{i, name}]`（**可见、非容器、有纹理/尺寸、却从未进台账** = "该画却没画"，≤30 条）。
归因逻辑抽成纯函数 `mpwLayerHealth(...)`（demo.html `MPW-HEALTH-BEGIN/END`），页内汇总条也区分
"不可见 / 该画没画"。`uiRe`、`N5:<类别>` 两桶是 bundle `core/we-scene-bundle.js:2004`/`:2006-2011` 谓词的
**逐字镜像**（T19c 会比对两处字面量，bundle 改了测试就红）。断言 T19a-T19j（桩场景：可见有纹理没台账 →
`missing`；`uiRe` 命中 → `invisible`+`visibleBy='uiRe'`；容器/userProp/timeVariant/N5/script/author 分桶；
`missingLayers` 30 条上限）。README 新增 `layerHealth` / `layerHealthSummary` / `missingLayers` 字段表。

## P-65（2026-09-15，渲染器侧子任务）粒子第二批：形状通道按**贴图格式**判定（TEX0FORMAT）+ trail 三兄弟真正几何 —— 用户第 8/9/10/12/13 项

**结论先行**：第 12/13 项（「红色方块 + 中间一点黄色」「只是部分粒子有问题」）是**官方
`ConvertTexture0Format` 缺失**——语法上只有 **R8 / RG88** 两类贴图受影响，RGB 类（ARGB8888/DXT5）
逐位不变，所以"只有部分粒子"；第 8/9/10 项是**三类 trail renderer 被当成普通 sprite quad 画**
（长条贴图画成竖线 / 屏中央堆竖条）。两处都修了。门禁 52 项全绿（不新增门禁项，断言并进 `mock-gl`：
**34 → 58 条**）。

### 根因（都有 file:line + 字节/顶点流/像素证据）

1. **形状通道按内容二选一是错的方向，官方口径是"按 .tex format"**（P-59 的遗留缺口）。
   官方 `wallpaper_engine/assets/shaders/common_fragment.h:92-113` `ConvertTexture0Format`（GLSL 分支）：
   `TEX0FORMAT==RG88` → `_sample.rrrg`；`==R8` → `vec4(1,1,1,_sample.r)`；**其余格式原样透传**。
   而我们的解码器按 RePKG 约定展开：`fromRG88` → `(rgb=G, a=R)`（`core/we-scene-bundle.js:846`）、
   `fromR8` → `(rgb=R, a=255)`（`:855`）。**只有 R8/RG88 需要转换**，不转换就是 `alpha=1` 的实心矩形。
   实测（真包 + mock-GL + 顶点流 UV 采样 GPU 侧贴图字节，`particle-shape-audit.mjs`）：

   | 层（包） | 贴图 | fmt | 改前 四角alpha / 不透明占比 | 改后 |
   |---|---|---|---|---|
   | Fog (calm)（3544152633） | particle/fog/fog1 | **9 R8** | **1.000 / 100%** | **0.000 / 0%**（覆盖均值 alpha 1.000→0.006） |
   | rain_on_the_glass2（3544152633） | particle/light/light_shafts_0 | **8 RG88** | **1.000 / 100%** | **0.000 / 0%**（均值 1.000→0.107） |
   | Vapor (double)（3544152633） | particle/beam/beam_1 | **8 RG88** | **1.000 / 100%** | **0.000 / 0%**（均值 1.000→0.250） |
   | 雾 2（3554161528） | particle/fog/fog3 | **8 RG88** | **1.000 / 100%** | **0.000 / 0%**（均值 1.000→0.012） |
   | halo / halo_3/4/6 / drop / download / particle/3 / 流星 | fmt 0/4 | 0/4 | 0.000 / ≤12.8% | **逐位不变**（第 13 项"只是部分"的由来） |

   全语料 49 个粒子层贴图里 **只有 6 行**是 fmt 8/9（子代理全量普查，`/tmp/wept/final.md`）；
   非粒子层（普通 image 层）**零命中** —— 官方 `genericimage4.frag:87` 是
   `texSample2D(g_Texture0,…)*g_Color4`（**不做**格式转换），所以本补丁只动粒子 FS，改动面被夹死。

2. **`spritetrail` 未拉伸 → 长条贴图 = 轴对齐竖线（第 10 项）**。官方
   `common_particles.h:41-50` `ComputeParticleTrailTangents` + `:52-57` `ComputeParticlePosition`：
   `right = normalize(cross(V, eye))`、`up = V̂ · min(|V|·g_RenderVar0.x, g_RenderVar0.y)`、
   `corner = P + size·right·(u−.5) − size·up·(v−.5)·textureRatio`（**u 横跨、v 沿速度、v=0 在前进端**）。
   `g_RenderVar0 = {renderer.length, renderer.maxlength, 0, maxcount−1}` 有官方出处
   （`wer-ref/.../WPSceneParser.cpp:5915-5924`；缺省 `length` 见 `lwe-ref/.../ObjectParser.cpp:770`、
   `maxlength` 见 `REVERSE-FINDINGS-6.md:45`）。改前所有 spritetrail quad **长轴角中位=90°、
   角度散布=0°、竖直占比 100%**（= 一批完全同向的竖条）：

   | 层 | 贴图 / renderer | 改前几何 | 改后几何 |
   |---|---|---|---|
   | Rain perspective（3544152633） | drop 32x128 / spritetrail（length .005、maxlength 100、\|V\|=3000px/s） | 119 quad 长/短边 **7.11**、竖直 100% | 119 quad 长/短边 **106.67**（= size·min(15,100)·ratio，实测与公式逐位吻合）、角度沿速度 |
   | cherry blossoms on cursor（3554161528） | particle/3 / spritetrail（maxlength 1） | 165 quad 长轴角 90°、散布 0°、竖直 100% | 长轴角 **104°**、散布 5°、竖直 **0%** |
   | rain_on_the_glass2（3544152633） | light_shafts_0 / spritetrail | 长/短边 3.56、竖直 100% | 长/短边 **35.56**、竖直 100%（雨本来就竖直，符合官方） |

   即第 10 项「一条竖线空开、一条竖线空开」= 每颗粒子只画"一个 size 长的短竖条"、粒子间距留下空隙；
   官方把条长拉到"`length` 秒内走过的距离"后首尾相接成连续雨丝。

3. **`rope`/`ropetrail` 未连线 → 屏中央一摞竖条（第 8/9 项）**。官方
   `REVERSE-FINDINGS-5.md:106`：**rope = 存活粒子数组本身即样条控制点**（按发射序 stable_sort），
   `genericropeparticle.vert`（非 GS 分支）每段 4 顶点、u 横跨绳宽 / v 沿轨迹推进。
   实测 `Trails 2`（3326873240，id 560，rope，origin=**画布中心** 1920,1080，发射器
   `sphererandom distancemax=0` + `movement drag=0` ⇒ 20 颗粒子**全部停在同一坐标**）：
   改前 **19 个 quad、长/短边 5.51、竖直 100%**（= 用户第 8/9 项"屏幕中间一摞竖条/红块"）；
   改后 **0 个有效段**（段长恒 0 ⇒ 官方 ribbon 面积恒 0 ⇒ 不上屏），`trailDegenerate=18` + 一次性 log。
   `ropetrail` 按**每粒子位置历史**连 ribbon（`length`=历史时长、`segments`=采样点数）：

   | 层 | 改前 | 改后 |
   |---|---|---|
   | Shooting star-blue-2（3544152633）ropetrail length 3 | 6 quad，竖直 100%，7.11 | **26 段**，角度散布 92°，竖直 4% |
   | Shooting_Star_01（3544152633）ropetrail length .4 | 34 quad，竖直 100% | **217 段**，角度散布 48° |
   | 流星（3554161528）ropetrail length .2 | 0 批 | **6 段**（角度 30°） |
   | Vapor (double)（3544152633）rope | 25 quad，竖直 100%，7.11 | **24 段**，角度散布 165°（沿绳向） |

### 改动（只碰 `core/we-scene-bundle.js`；demo.html / elysia 一字未动）

- **TEX0FORMAT 落地**：`PARTICLE_FS` 新增 `uniform float u_TexFmt` + `weTexFmt()`（官方两分支逐字，
  其余透传）；`partUni.fmt`；`renderParticleLayer` 按 `texFormatOf(texObj)` 上传。
  - 新导出 `texFormatOf(texObj)`（优先级 `texObj.format` > `glTex.__mpwTexFmt` > `texObj.rg88===true` → 8；
    全缺 → `-1` = 透传 = P-59 旧行为，不猜）与 `isNarrowTexFormat(fmt)`。
  - 格式随解码结果/上传对象传递：`decodeImageMip0`/`decodeMips` 的返回对象新增 `fmt`（纯加字段，
    `demo.html` 与 `preview.mjs` 的既有消费方读的还是 width/height/rgba）；`makeTextureMip` 盖
    `glTex.__mpwTexFmt`；`makeTexture` 新增**可选第 6 参** `fmt`（不传则从 `rgba.__mpwFmt` 取）。
- **trail 几何**：新导出 `particleTrailCfg(def)` / `spriteTrailStretch(speed,cfg)` /
  `PARTICLE_TRAIL_KINDS`。`renderParticleLayer` 顶点构建改为按 renderer 分支：
  sprite（P-59 六顶点表逐位不变）、spritetrail（官方四角公式）、rope/ropetrail（ribbon，退化段跳过）。
  顶点数不再固定 6×N → 先攒普通数组再 `Float32Array.from`，`drawArrays(…, verts.length/9)`。
  世界→NDC 统一成 `nX/nY` 两个闭包（与层路径同号，本机实测 `viewProj·(0,0)→(-1,-1)`、
  `·(W,H)→(1,1)`，`2y/H-1` 逐位一致）。
- **`ropetrail` 历史**：`buildParticleSystem` 只对 ropetrail 建 `sys.trail={n,duration,dt}`，
  `stepParticles` 在**算子跑完后**按 `length/(segments-1)` 采样（每步 ≤1 点、上限 `segments` 点）——
  rope/spritetrail/sprite 完全不建历史，零额外开销。
- **诊断字段**：`particleStats` 新增 `trailMode`、`trailLayers{}`、`trailSegments`、`trailDrawn`、
  `trailDegenerate`、`trailSkipped`、`shapeFrom{rgba,rg88,r8,unknown}`（逐帧重置）。
- **未动**：`?noparticles`/`?np`、`PARTICLE_BUDGET` 四档数值、rate 限流、`simulateParticleSystem`
  的步长语义、`preview.mjs`、`render-audit.mjs`。

### 测试与门禁

- `mock-gl-test.mjs` **34 → 59 条断言**。场景 4(f) 改写为"rope 走官方几何 ribbon"，并新增 **(f2) rope 的 V 方向**
  （官方 `genericropeparticle.vert:53-56`「New particles are at the end of the array」⇒ 最新端 V≈0；本机实测
  段 0 的 V=1.000/0.964、末段 V=0.036/0.000）；新增场景 6：
  (h) 粒子 FS 含 `u_TexFmt` + 官方两分支 + 仍乘 `tex.a`；(i) 官方包内 `materials/particle/fog/fog1.tex` 是 R8 且 alpha 恒 255 +
  `texFormatOf` 优先级四例；(j) `decodeMip0.fmt` → `makeTextureMip.__mpwTexFmt`（R8=9 / RG88=8）；
  (k) 三种贴图的 `u_TexFmt` 实际上传值 9/8/0 + `shapeFrom` 记账；(l) spritetrail 顶点流实测
  宽=`size·min(|V|·length,maxlength)`、高=`size`；(m) rope 退化 ⇒ **0 次 draw** + `trailDegenerate≥1` + log；
  (n) `?trail=off` ⇒ 0 draw + `trailSkipped=1`；`?trail=quad` ⇒ 退回每粒子 6 顶点轴对齐 quad；
  (o) ropetrail 历史 ribbon（>1 段、顶点数=6×段数、segments 缺省 8）。
- **回退开关**：`?trail=quad`（P-59 旧几何，A/B 对照）、`?trail=off`（trail 层整层跳过）、
  默认 `on`=官方几何。三者已登记 `README-DIAGNOSTICS.md`（该行由并行子任务预先占位，本补丁把
  归属与行号订正为 P-65：`core/we-scene-bundle.js:4731`、`:6620`），头部计数 86 → **88**。
  `node diag-flag-check.mjs` → 代码 88 == README 88、0 差异。
- **本机实测**：`bash run-all-tests.sh` → 52 项全绿（见提交时输出）。
  `node particle-shape-audit.mjs [包]` 为本轮新增的**人工取证工具**（不进 run-all-tests，
  逐层隔离真包 + 顶点流 + GPU 侧贴图字节；`TRAIL_MODE=quad` 复现改前数字）。

### 未定项（本轮**没做**，需要真机/主会话裁定）

1. **`花朵`/`花朵 拷贝` 紫色板（原"证据 A"）不成立**：mock-GL 真包复现 `[fx0] 花朵 srcTex=ok
   texObj=3840x1139`，走 `copyProg`（`texture(u_Tex,v_UV)*u_Color4`，alpha 透传）+ `setBlend('translucent')`；
   设备台账 `t:"layer"` 的定义就是 `!isWhite && !isTransparent`（`demo.html:3043`）⇒ 该层**确实用它自己的
   DXT5 贴图**上屏。要定位真机那片"均匀亮块"需要 demo.html 在台账里补 `solid/uvRect/effectCount` 三项
   （见报告的"需要 demo.html 配合"清单），本轮无法在 bundle 侧证伪/证实。
2. **发射器 `speedmin/speedmax` 从未被消费**（`parseParticleEmitters` 收了字段，`spawnParticle` 不读它）——
   官方 `Random(speedmin,speedmax)×径向方向` 是初速来源之一。语料里多数层另有 `velocityrandom`
   /`mapsequencearoundcontrolpoint`，所以本轮没动（改它会改变多包运动语义）。`Trails 2` 之所以"粒子全停"
   正因如此；若主会话要让它动起来，应作为独立补丁评估。
3. **rope 的 Catmull-Rom 细分（`subdivision`）与样条控制点（CP）未实现**：本实现按直线段连 ribbon
   （CP=0 的退化情形），`uvsmoothing`/`subdivision` 未消费；`?trail=quad` 可回退对照。
4. **ropetrail 沿尾迹的 size/alpha 渐隐未实现**（官方 THICKFORMAT 允许逐端点 size/color；本实现用
   粒子当前 size/alpha 均匀）。webwallgl 参考实现做了 `segAlpha=1−t`/`segSize=1−0.55t` 的**自造**渐隐，
   官方 shader 无此系数，故未照抄。
5. **`minlength` 未消费**：官方 `common_particles.h` 里没有对应 uniform（`WPSceneParser` 只传
   `length`/`maxlength`），故按官方忽略；预设里 `minlength` 出现 3 次。
6. **多图精灵（multiSprite/abs UV）路径的 `frameUV.u0` 读法**在本补丁里被顺手改成读 `cur/nxt`
   （旧代码读顶层 `u0` 会是 `undefined`→NaN UV）；但该分支在本机**不可达**（需要 `texObj.images`
   多槽 + 真机 PNG 位图），未做端到端验证。
7. **`?trail=on` 后 `Trails 2` 整层不可见**是否符合作者意图：按官方几何确实面积恒 0；但若作者本意是
   "跟随鼠标画轨迹"（`controlpoint[0].flags:1` = lockToPointer），则还缺"控制点跟随指针"这一层语义。



## P-67（2026-09-15，渲染器侧子任务）仓库自带 baseline JPEG 解码器把真机截图解坏 —— 位读取器丢掉 `FF 00` 填充里的**数据字节 0xFF**

**触发（用户实测）**：设备上报 `reports/r*.json` 的 `shot`（`canvas.toDataURL('image/jpeg', 0.6)`，Chrome/Skia → baseline **SOF0 4:2:0** 480×270）
用 `elysia/we-renderer/jpeg.js` 的 `decodeJpeg` 解出来只有顶部约 22% 有内容、其余近黑；**同一份字节流 `ffmpeg` 解出完整正确画面** ⇒ 解码器错，不是截图坏。

**文件边界（只碰这些）**：`elysia/we-renderer/jpeg.js`（458 → 561 行）、新增 `jpeg-decode-test.mjs`、`run-all-tests.sh` 加 1 行、本文件。
**未动** `demo.html` / `core/we-scene-bundle.js`（并行会话独占）、`elysia/we-renderer/textures.js` / `core.js`（§4 实证：**不需要**改）。
未 push、未发布、未上传。

### 1. 根因（原文件行号 → 是哪个 JPEG 特性）

| # | 位置（改前 `jpeg.js:行`） | 特性 | 症状 |
|---|---|---|---|
| **R1（根因）** | `read()` **L65-70**：`if (nxt === 0x00) { continue; }` | **熵流字节填充（JPEG B.1.1.5）**：数据里的 `0xFF` 编码成 `FF 00`，解码时 `00` 是填充、`FF` 是**数据** | `continue` 把整对丢掉 → **数据字节 0xFF 没进位缓冲** → 每遇一次少 8 bit → 位流错位 → DC 预测器发散 → 顶部若干 MCU 行正常、其余近黑/花屏，**且完全不报错**。`peek()` L95-98 / `skip()` L110-116 同一处错（当前无调用方） |
| R2 | `consumeRestart()` **L129-133**：只清位缓冲，**不跳过 RST 标记本身** | **重启间隔 DRI/RSTn** | `pos` 永远停在 `0xFF` 上，之后每个 `read()` 再撞同一个 RST → 带 DRI 的 JPEG 从第一个重启边界起全垃圾 |
| R3 | `decodeScan()` **L243 + L245**：`const rs = …` 又在 `if (rs === -1) { rs = … }` 里赋值 | 同上（RST 落在一块中间） | 直接 `TypeError: Assignment to constant variable`（RST 路径实测必崩） |
| R4 | 段解析 **L373** 注释「其他段 (APPn/COM/**DRI**…): 跳过」 | **DRI 段** | 重启间隔从不解析；且 RST 处**不复位 DC 预测器**（JPEG B.2.1 要求复位） |
| R5 | **L311-312**：遇第一个 SOS 就 `break` | **多扫描 / 非交织 baseline** | 只解第一个扫描就返回，其余分量平面全 0 → 静默半张图（现改为显式抛错） |
| R6 | **L315**：只有 `0xc2` 认作渐进式 | **SOF2/SOF6/SOF10/SOF14** | SOF6/10/14 被当 baseline 走 → 静默垃圾（现全部显式抛错） |
| R7 | `decodeJpeg()` **L187-196**：`catch` 一切 `jpeg:` 错误 → 返回**全黑** `rgba` | 错误处理 | 把 R1/R2 的真实故障全部吞成黑图；也把「截断」吞成黑图。**静默最危险** |

**因果链实证**（三份真机截图，熵流起点 = SOS 之后；"第一处 `FF 00`" 与错位起点逐份对上）：

| 报告 / 包 | 熵流区间 | `FF 00` 处数 | 第一处 `FF 00` | 改前「每 MCU 行(16px)平均通道差」 | 改后 |
|---|---|---|---|---|---|
| 上报 `r1789401975489`（原件已被 reports/ 清理，ID 保留可追溯） / 3554161528 | 825..15006 | 46 | **@1400**（熵流内 +575 B） | `1.7 40.3 71 153.8 …`（第 0 行几乎完美，第 1 行起崩） | 全行 `0.4~0.5` |
| `r1789401981021` / 3544152633 | 854..19053 | 74 | **@977**（+123 B） | `93.4 86.4 70.8 …` | 全行 `0.4~0.5` |
| `r1789402095234` / 3326873240 | 834..12883 | 35 | **@894**（+60 B） | `53.2 67.7 70.5 …` | 全行 `0.4~0.5` |

第 0 个 MCU 行 = 30 MCU ≈ 数百字节；**错位起点与第一处 `FF 00` 一一对应**，且 `FF 00` 出现得越早坏得越早 —— 这就是根因的直接证据。
（用户目视"顶部约 22% 有内容"= 第 0 行完整 + 第 1~2 行半坏；17 个 MCU 行里前 ~3 行。）

**旁证：全机独立 JPEG 扫描（39 个 `*.jpg`，`allwallpaper/**` + `Steam/**`）**——改前凡能解出来的 **23/23 全部静默解坏**（对 ffmpeg 的逐像素 MAE 53.6~197.1，近黑最高 100%；
其中 `allwallpaper/dd/3646392375/images/kv_bg_3d*.jpg` 近黑 0% 却 MAE 131.7 = 「看着不像坏图」的最危险一种），改后 **23/23 全部 MAE 0.41~0.55**；
另外 **16 个是渐进式 SOF2**（WE 自带 UI 皮肤图，4:4:4），新旧都显式抛错（本轮不实现渐进式，见 §5.1）。
这 23 个独立 jpg 不在渲染路径上（渲染器只解 `.tex` 内嵌 JPEG），但说明这个 bug 的命中率是 **100%**，不是边角情况。

### 2. 改法（`elysia/we-renderer/jpeg.js`，API 不变：`decodeJpeg(bytes) → {width,height,rgba}`）

1. **L73-107 `read()`（+`peek`/`skip` 同步）**：`FF 00` → `byte = 0xff` **照常写入位缓冲**（跳过的是 `00`）；顺带支持标记前的 `FF` 填充字节；用尽/撞到非 RST 真标记时置 `outOfData`。
2. **L153-179 `consumeRestart()` / 新增 `syncToRestart()`**：按 libjpeg `process_restart` 语义**跨过 RSTn 标记本体**并清位缓冲；`read()` 探到 RST 时记下 `restartPos`。
3. **L420 DRI 解析**：`restartInterval = RI`；`decodeScan()`（L270）在**每个重启边界** `syncToRestart()` + `prevDC.fill(0)`（复位 DC 预测器），块中撞 RST 也走同一路径（`let rs`，R3 修复）。
4. **L346-358 截断显式报错**：位流在 MCU 解完前耗尽/撞 EOI → `jpeg: truncated entropy stream (n/N MCU)`。**不再静默半张图**。
5. **L241-248 `decodeJpeg` 不再吞异常**：只有「显式判定的**周期性占位熵流**」（`isPeriodicEntropy`，花壁纸 2934788040 那类）仍返回**整幅**纯黑；其余结构/熵流/截断错误一律抛出（`core.js:175` 已有 `try/catch` + `log('纹理解析失败 …')` + 全局 assets 回退，行为是"记日志 + 回退"，不是崩溃）。
6. **L473-483 显式不支持**：渐进式（SOF2/6/10/14，带尺寸）、非交织/多扫描 baseline（SOS 分量数 ≠ SOF 分量数）、SOS 分量 id 不在 SOF 中 → 明确 `Error`。
7. **L530-536 灰度 JPEG（Nf=1）**：旧实现取 `planes[1]` 直接 `TypeError`；现按灰度输出。
8. **提速**（不改语义）：`buildHuffTable` L181 导出 canonical 表的 `mincode/maxcode/valptr`（替掉逐 bit 线性扫表）；`idct2d` 复用模块级临时缓冲。
   3897×2400 / 4:4:4 贴图 **8888 ms → 2725 ms**；1920×1080 **815 → 341 ms**；480×270 截图 **~17 ms**。

**修完的三份真机截图 vs ffmpeg**（ffmpeg = `ffmpeg -v error -y -i x.jpg -f rawvideo -pix_fmt rgba x.raw`）：

| 报告 / 包 | 近黑% (`r,g,b<16`) 改前 → 改后 → ffmpeg | 均值 改前 → 改后 → ffmpeg | 逐像素 MAE 改前 → 改后 |
|---|---|---|---|
| 上报 r1789401975489 / 3554161528 | **81.19 → 0.00** → `0.00` | (44.8,25.6,37.0) → (182.9,97.7,167.4) → `(183.3,98.0,167.7)` | **128.41 → 0.451** |
| r1789401981021 / 3544152633 | **92.60 → 1.30** → `1.23` | (10.5,8.9,13.7) → (64.9,63.4,122.2) → `(65.3,63.7,122.6)` | **89.12 → 0.489** |
| r1789402095234 / 3326873240 | **98.52 → 2.52** → `2.48` | (0.1,0.3,2.2) → (25.0,42.2,137.2) → `(25.3,42.4,137.6)` | **67.66 → 0.463** |

残留 MAE ≈ 0.5（max 单通道差 5~11）是浮点 IDCT + 最近邻上采样与 libjpeg 整数 IDCT 的正常差，非错位。

### 3. 影响面：`.tex` 里 FIF=JPEG 的贴图（`textures.js:21` 是这个解码器的唯一调用点）

`grep -rn decodeJpeg` 全仓只有 `textures.js:8/21`（+ 定义处）→ `core.js:174 loadTexImage(raw)` → `?mode=elysia` 路径。
全语料 **11 包 / 213 个 .tex** 逐包普查（`allwallpaper/dd/*`，与用户口径一致）：`rgba=177 / png=22 / fifJPEG=2 / 其他(video·webp·gif)=12`，**行为变化数 = 2**（其余 211 个根本不进这个解码器）：

| 包 id | 路径 | 尺寸 | 视频纹理 | 修复前 | 修复后 |
|---|---|---|---|---|---|
| `3715743282` | `materials/retouch_2026042801402539.tex` | 1920×1080（4:2:0，`FF 00`×2829） | 否 | 抛 `jpeg: invalid entropy stream` → 吞成**全黑 alpha=0（整图 100% 透明）** | 正确，MAE 0.474 vs ffmpeg |
| `3721991999` | `materials/洛琪希_130023460.tex` | 3897×2400（**4:4:4**，`FF 00`×27600） | 否 | 同上，**100% 透明** | 正确，MAE 0.568 vs ffmpeg |

两者都是各自场景的**主图**（`scene.json` 里 `3715743282` 是 1920×1080 整屏底图、`3721991999` 是 3897×2400 主体立绘，各自 material `genericimage4` 的 `textures[0]`）。
⇒ **修复前 `?mode=elysia` 看这两个壁纸，主图整层不可见（透出背景）；修复后正常**。这是本轮唯一的真实渲染影响面。

**默认 WebGL 路径不受影响（行号证据）**：`core/we-scene-bundle.js` 全文 **0 处** 引用 `elysia/we-renderer/jpeg.js`（`grep -n "jpeg\|JPEG" core/we-scene-bundle.js` 只命中 `FIF` 枚举 `L107` 与注释 `L455`）；
默认路径在 `demo.html:788-790` 走 `new Blob([m.png || m.image], {type:'image/jpeg'})` → `createImageBitmap(blob2)`，**用浏览器原生解码器**（`L671` 只调 `lib.decodeMip0`，`L720` 仅统计 `kind:'jpeg'`）。
本解码器只有 `?mode=elysia`（`demo.html:542 → elysia/demo-elysia.js:6 → elysia/we-renderer/core.js:18/174 → textures.js:21`）会走到。

### 4. 测试：`jpeg-decode-test.mjs`（新，注册进 `run-all-tests.sh` 为 `jpeg-decode`；门禁 52 → **53 项**）—— **104 断言**
（分段：A 合成向量 38 / B DRI+RST 精确判据 5 / C 三份真机截图 27 / D 坏输入 10 / E 两张真贴图 24）

* **[A] 合成向量**（base64 内嵌，运行**不依赖 ffmpeg / 不联网**）：`4:2:0` / `4:2:2` / `4:4:4`（Pillow `subsampling=2/1/0`，熵流各含 2/3/5 处 `FF 00` 覆盖根因）、`DRI=1 + 5×RSTn` 的 4:2:0、`DRI=2 + RST0` 手写灰度 —— 逐角/中心/近黑/alpha 断言。
* **[B] DRI+RST 精确判据**：手写 16×16 灰度 JPEG（每块 `DC 码'0' + 幅度 6bit(=50) + EOB '0'` = `0x64`），四象限必须 = `DC/8+128` = **134/140/134/140**（不复位 DC 预测器会得 146/153；不跳 RST 标记旧实现在这里 `TypeError`）。
* **[C] 3 份真机截图**（上报 id `r1789401975489`／`r1789401981021`／`r1789402095234` 的 `shot`；其中 `r1789401975489` 原件已被 reports/ 目录轮转清理，ID 保留可追溯，字节数校验 15006/19053/12883）：尺寸 / 四角 RGB / 近黑% / 中心 17×17 均值 / alpha 全 255，期望值 = **ffmpeg 离线常量**（生成命令写在文件头）；外加「近黑 < 5%」直判旧签名。
* **[D] 坏输入必须抛错**：截断 20/40/60/90/99% → `jpeg: truncated entropy stream (n/N MCU)`；垃圾字节→`bad SOI`；仅 SOI+EOI→`missing SOF/SOS`；空数组→`bad SOI`；渐进式→`progressive (SOF2) not supported`。
* **[E] 真实受影响的 2 张 FIF=JPEG 贴图**（真包直读）：尺寸 / 四角 / 中心 / 近黑 / alpha，且断言**不是**修复前那张 100% alpha=0 的兜底图。缺包自动跳过。
* **灵敏度自检**：把同一份测试指向**改前**的 `jpeg.js` → **40 条断言变红、退出码 1**（可见 `✗ rstDriGray 解码抛错 Assignment to constant variable` / `✗ 近黑占比 got 81.19% want 0%` / 5 档截断全部「静默返回半张图」）。测试确实咬得住这个 bug，不是空跑。
* `run-all-tests.sh` 只加 1 行（`^SKIP jpeg-decode` 条件项：真机截图样本缺失时按 SKIP，合成向量与贴图段仍照常硬断言）。

### 5. 未定项 / 明确不做

1. **渐进式（SOF2/6/10/14）未实现**，只做**显式抛错**（含尺寸的明确消息）。语料 213 个 `.tex` 里 2 个 JPEG 全是 baseline SOF0，Chrome `toDataURL` 也只出 baseline；等真实需求再做。
2. **非交织 / 多扫描 baseline 未实现**（每分量一个 SOS），同样只显式抛错。语料里 0 例。
3. **`invalid entropy stream` 现在会抛到 `core.js:175`**：该处已有 `try/catch + log + 全局 assets 回退`。**花壁纸 2934788040 本机没有该包**（`allwallpaper/**`、`Steam/**`、`$MPW_PLUGIN_CACHE` 全无），无法实测它走的是「周期性占位熵流」（→照旧整幅纯黑）还是「无效熵流」（→现在会变成"纹理加载失败+日志"）。若要绝对保守，可在 `decodeJpeg` 把 `invalid entropy stream` 也归入纯黑兜底 —— 但那正是本轮要消灭的静默路径，**留给父 agent 定夺**。
4. **`isPeriodicEntropy` 周期启发式保留**（周期 ≤64 且自重复率 ≥0.95 → 整幅纯黑）。它是"真的坏图"与"合法但极端重复的熵流"之间唯一可能误伤的路径；本轮未改其判据。
5. **性能**：3897×2400 贴图首次解码 ~2.7 s（纯 JS，浏览器/Node 通用，无依赖）。上采样仍是最近邻（与 libjpeg `h2v2_fancy` 有 ≤ 十来级的单通道差），未做双线性/三角滤波对齐。
6. **未在真机/浏览器里目视确认**这两个壁纸的 elysia 渲染画面（本机只能证明"像素与 ffmpeg 一致"）；`?mode=elysia` 的实机截图留给父 agent。

---

## P-68（2026-09-15，渲染器侧子任务）MP4 视频画质：`:8899` 的两处硬编码 1280 与 33ms 节流做成 `?res=` 档位（默认 1080p）—— 用户第 20 项

**结论先行**：包内源片本来就是 **4K60 高码率**（3840×2160@60 13.80 Mbps / 4000×2300@60 34.35 Mbps，`docs/MP4-QUALITY-RESEARCH.md` ①），
但渲染器路径**主动降质**五处：画布硬编码 1280×720、视频纹理上传硬编码 ≤1280×720、4K→1280 走 2D canvas 中转
（`imageSmoothingQuality` 未设 = 浏览器默认 `low`）、33ms 上传节流（60fps 源最多 30fps 上屏）、视频纹理无 mip 链。
本轮把前四处做成**显式档位**（`?res=720p|1080p|1440p|2160p` / 显式 `WxH` / `auto`，**默认 1080p**）+ **可配节流**（`?vthrottle=`，默认 60fps）
+ **能直传就直传**，并把"源分辨率 vs 实际上传分辨率 / 实测上传 fps / 是否走 2D 中转 / 是否被 `?perf=auto` 降级"记账进诊断；
另外顺手补上 `getVideoTexture()` 的**读取点**（改动前 `__videoPlay` 全仓只有写入点 ⇒ 场景里的播放/暂停按钮是空操作）。
`?res=720p`（或 `?res=legacy`）与改动前**逐值一致**（回归基线，用"冻结的旧算法"200 组合对拍 + 端到端）。
门禁 53 → **54 项**全绿；新增 `video-quality-test.mjs` **148 断言**（4 处定向变异 4/4 被抓红）。

### 1. 根因（file:line 都要能对得上）

| # | 自伤点 | 改动前位置 | 后果（真机实锤） |
|---|---|---|---|
| 1 | 画布硬编码 1280×720 | `demo.html`（改动前 `cv.width = 1280; cv.height = 720;`） | 整场景（不只视频）按 1/3 分辨率渲染再被 CSS 拉大 |
| 2 | 视频纹理上传硬编码 ≤1280×720 | `core/we-scene-bundle.js` `if ((v.videoWidth > 1280 \|\| v.videoHeight > 720))` / `Math.min(1280, v.videoWidth \|\| 1280)` | 4K 源 → 11% 像素；真机日志 `视频首帧已上传 1280x720` / `1280x736` |
| 3 | 2D canvas 中转 + `imageSmoothingQuality` 未设（= `low`） | `core/we-scene-bundle.js` `ctx.drawImage(v, 0, 0, tw, th)` | 3× 降采样只有廉价滤波 |
| 4 | 33ms 上传节流 | `core/we-scene-bundle.js` `if ((now - (texObj.lastUploadAt \|\| 0)) < 33)` | 60fps 源 ≤30fps 上屏，且与帧节拍不同步（拍频抖动） |
| 5 | 视频纹理无 mip 链 | `makeTexture`（`MIN_FILTER=LINEAR`，视频不走 `makeTextureMip`） | 本轮**明确不开 mip**：上传上限 ≤ 画布 ⇒ 纹理永不被缩到比画布更小（最大 1:1），4-tap LINEAR 足够；且 3840×2160 / 4000×2300 都是 NPOT，仓库已有 Adreno 大 NPOT `generateMipmap` 静默失败实锤（见 `makeTextureMip` 旁注释）⇒ `videoStats.mip` 恒 0 可对账 |
| 6 | `getVideoTexture()` 空操作（同属用户抱怨面） | `elysia/scene-scripts.js` `videoTexRefShared()` 只写 `obj.__videoPlay`；**全仓无读取点**（实测 22 个包里 `3326873240` / `3470764447` 真的调用 `video.getVideoTexture().play()/pause()`） | 场景里的播放/暂停按钮点了没反应 |

### 2. 改法（两个文件 + 一个测试 + 两份文档）

**`core/we-scene-bundle.js`（新增段，全部导出可测）**
- `parseResTier(raw, env)`（`:4667`）：`RES_TIER_SIZES = {720p:[1280,720], 1080p:[1920,1080], 1440p:[2560,1440], 2160p:[3840,2160]}`；
  `4k` 归一成 `2160p`；显式 `WxH` 与命名档同尺寸时归一成该档（`?res=1280x720` ≡ `?res=720p`）、否则 `custom` 档（宽高偶数对齐）；
  `auto` = 按 `innerWidth × min(dpr,2)` 选"≥ 物理宽的最小档"（夹在 720p–2160p）；**非法值 → 回退 1080p 且 `invalid` 字段显式标记**（不静默）。
  `legacy` 档 = `720p` + `legacy:1`：节流 33ms、`smoothing:'low'`（**不写**该属性）、超限必走 2D canvas。
- `videoUploadPlan({videoWidth,videoHeight,now,lastUploadAt,tier,throttleMs})`（`:4718`，纯函数）：`gap < throttleMs` → 跳过；
  `源 ≤ 上限` → **直传**（不放大）；否则 `tw = min(capW, 源宽)`、`th = round(tw × 源高/源宽)` 走 2D 中转。
- `parseVideoThrottle(raw, tier)`（`:4736`）：裸数字 = fps、`NNms` = 毫秒、`0`/`off`/`none` = 不节流、非法值回退档位默认（`source` 记 `url-invalid:*`）。
- `perfLadderFboCap(level, tier, fboAutoLow)`（`:4757`）：高分辨率档（非 legacy）把 `?perf=auto` 的 fboCap 阶梯**压回 0**
  （用户显式要 ≥1080p 时再把效果链 FBO 降到画布以下 = 自己糊回去）；`?fbocap=low` 恢复旧阶梯；粒子降档不受影响。
- 上传块（`:6283` 起）改用上面的决策；`src`/`texObj.width/height` 的赋值与改动前**逐字同口径**（含 `|| texObj.width` 兜底）；
  非 legacy 档在拿到 2D ctx 时写一次 `ctx.imageSmoothingQuality = 'high'`（第二次上传不再重复写）；
  直传时 `texImage2D(..., <video>)`、完全不建 canvas。
- 台账 `videoStat` + `renderer.videoStats` getter（`:7345`）与 `renderer.resTier`；每 5s 往页面日志打一行 `[we-scene][P-68] videoStats {…}`
  （payload 的 `log` 过滤含 `[we-scene]` ⇒ **现在就能落进 `reports/*.json`**，不依赖别人改 demo.html）。
- `texStats` 视频条目回填：按 `textureName`（层名兜底）匹配 `kind:'video'` 条目，补 `src/up/tier/cap/direct/upFps/viaCanvas`。
- 脚本控制读取点：`layer.__videoPlay`（play/pause，**这就是让播放按钮生效的那一半**）、预留 `layer.__videoSeek` / `layer.__videoRate`；
  脚本写的是 **raw scene.json 对象**（`thisScene.getLayer(name)` → `sceneObj.objects` 那一项），与 `parseScene` 产出的 layer 不是同一实例
  ⇒ 按 `id` 优先、`name` 兜底找回（`opts.scriptRawObjects` 或 `window.__mpwRawObjects`，2s 内不重复线性查找）。

**`demo.html`（只动画布尺寸段，`3696-3707`）**：`cv.width/cv.height` 改由 `lib.parseResTier(?res=)` 给出（同一个函数、同一个参数 ⇒ 与渲染器同源同值），
并写一行启动日志（档位/画布/上传上限/节流/是否 legacy）。**没有**动别人的 CSS 区、`mpw-props-panel` 区、属性表/装载区。

**诊断字段口径**：`README-DIAGNOSTICS.md` 主表新增 3 行（`res` / `vthrottle` / `fbocap`，`diag-flag-check` 91 == 91 零差异），
并新增「`videoStats`」字段表（29 个顶层字段 + `tex[]` + `play{}` 逐条口径）。

### 3. 四档量化（可复现命令见 `docs/MP4-QUALITY-RESEARCH.md` ⑦；方法同 §C-2）

往返 PSNR = 源帧 → 按该档**实际上传尺寸**降采样 → 升回源尺寸 → 与源帧比（`ffmpeg psnr`，t=0.5s 无损 PNG）。
`low` = 单次双线性（旧 `imageSmoothingQuality` 默认值近似）；`high` = 面积平均降采样 + 双线性升回（质量档近似，**真机未测**）。

| 档位 | 画布 | 上传尺寸 A / B | 每帧上传 A / B | 上传带宽 @30 / @60 | PSNR A（low/high） | PSNR B（low/high） | 画布像素 |
|---|---|---|---|---|---|---|---|
| `720p`（= legacy，回归基线） | 1280×720 | 1280×720 / 1280×736 | 3.69 / 3.77 MB | 111·113 / 221·226 MB/s | **38.28** / 39.20 dB | **29.97** / 30.55 dB | 1.00× |
| **`1080p`（新默认）** | 1920×1080 | 1920×1080 / 1920×1104 | 8.29 / 8.48 MB | 249·254 / 498·509 MB/s | **41.18** / 42.97 dB | **32.86** / 33.62 dB | 2.25× |
| `1440p` | 2560×1440 | 2560×1440 / 2560×1472 | 14.75 / 15.07 MB | 442·452 / 885·904 MB/s | **44.25** / 45.21 dB | **35.66** / 36.32 dB | 4.00× |
| `2160p`(=`4k`) | 3840×2160 | 3840×2160 / 3840×2208 | 33.18 / 33.91 MB | 995·1017 / 1991·2035 MB/s | **无损（直传）** / — | **40.44** / 40.55 dB | 9.00× |

- A = `3327063360`（3840×2160）、B = `3660962877`（4000×2300）。720p 两列**复现了研究报告的 38.28 / 29.97 dB**（算法对得上）。
- 默认档（1080p）相对旧行为：**PSNR +2.89 dB（A 与 B 都是）**，像素 ×2.25；1440p 相对旧行为 **+5.96 / +5.68 dB**（像素 ×4）。
- `2160p` 档下 A 包是**直传**（源 ≤ 上限）⇒ 上传链路零重采样，PSNR 无损；B 包仍 1.04× 降到 3840×2208（40.44 dB）。
- 时间分辨率：源 60fps，改动前 ≤30.3 次上传/秒（**1199 帧里最多约 606 帧上屏**）；默认档起 60fps 目标（`upFps` 实测记账）。
- 本机 `render` 中位耗时（mock-GL 驱动真实 `renderScene`，真包 `3719111841` 43 层 24 纹理 + 5 蒙皮层，`process.hrtime` 9 帧中位）：
  1280×720 **0.64ms** / 1920×1080 **0.35ms** / 2560×1440 **0.40ms** / 3840×2160 **0.24ms** ——
  **与分辨率无关且都在噪声级**：mock-GL 不栅格化，量不到分辨率成本。真正的分辨率成本是
  ①每帧上传字节（上表）②GPU 填充率 ∝ 画布像素（×2.25/×4/×9），两者在**本机（无 WebGL 浏览器）都测不了**。
  **本补丁不给任何真机 FPS 数字**。

### 4. 测试：`video-quality-test.mjs`（新，注册进 `run-all-tests.sh` 为 `video-quality`；门禁 53 → **54 项**）—— **148 断言**

- **[A] 档位真值表**：默认=1080p、`legacy`≡`720p`、`4k`→`2160p`、显式 `WxH` 归一、`auto` 三组环境、8 个非法值必须回退且 `invalid` 非空。
- **[B] 上传决策**：四档 × 两条真源片的尺寸表；**"冻结的旧算法"逐值对拍**（10 种源尺寸 × 10 个时间 gap × `{720p,legacy}` = **200 组合**：上传/跳过 + 2D 尺寸 + 直传标志全等）；
  节流可配（`?vthrottle=30|33ms|off|垃圾值`）。
- **[C] 端到端（mock-GL + 假 `<video>`）**：legacy 档命中真机同款 **1280×720 / 1280×736** 且**不写** `imageSmoothingQuality`、确有 `drawImage`；
  1080p 档 ctx `imageSmoothingQuality==='high'` 且只写一次；2160p 档**直传**（不建 canvas、`texImage2D` 的源是 `<video>` 元素本身）；
  节流跳帧/上传与 `upFps=40`（25ms 两次）；`?vthrottle=off` 同刻第二帧也上传；`readyState=0` → `skipNotReady`；URL 路径 `?res=1440p&vthrottle=30`。
- **[D] `videoStats` 29 个顶层字段**类型齐全 + `tex[]`/`play{}` 子字段 + `MBps` 口径 + 快照是拷贝。
- **[E] `texStats` 回填**：`d`（源）不变、新增 `up=1920x1104`/`tier`/`cap`/`direct`，不匹配的条目不被动。
- **[F] 脚本控制**：`__videoPlay=false` → `pause()`、`=true` → `play()`、`__videoSeek` 生效且消费后删除、`__videoRate` 生效、无 raw 对象时零干预。
- **[G] `?perf=auto`**：阶梯真值表 + 端到端（每帧 40ms 跑 32 帧）——1080p 档 `perfFboCap` 恒 0（抑制）、`?fbocap=low` 与 legacy 档恢复阶梯。
- **[H] demo.html 接线源码切片**：旧硬编码行已消失（逐行精确匹配）、画布尺寸来自 `parseResTier`、`render` 仍用 `cv.width/height`、bundle 里两处硬编码已移除。
- **[I] 真包**：两个包的 TEX 声明尺寸（3840×2160 / 4000×2300）与四档实际上传尺寸（缺包自动跳过）。
- **灵敏度自检**：把同一测试指向**变异**后的 bundle（`/tmp/p68-sens`：legacy 节流 33→16.67 / 不写 `imageSmoothingQuality` / 1080p 上限退回 1280 / 非法值去掉 `invalid` 标记）→ **4/4 变红，退出码 1**；还原后 148/0。

### 5. 未定项 / 明确不做

1. **真机 FPS / 上传带宽未测**：本机 PRoot 无可用 WebGL 浏览器（`headless-shot.mjs` 已记录 6 组参数全败）。`?res=1440p`/`2160p` 在移动 GPU 上是否现实**没有数据**；
   建议下一份真机上报先看 `videoStats.upFps` 与 `[perf]` 日志，再决定默认档是否维持 1080p（当前默认 1080p 是用户拍板值）。
   已知的具体失败模式：`?res=2160p` 直传 3840×2160 需要 `MAX_TEXTURE_SIZE ≥ 4096`（真机历史上报 `maxTextureSize: 4096`，恰好够）；
   设备上限更低的机型上传会进既有 `try/catch` → 保留上一帧 + `videoStats.err++` + `[we-scene] 视频帧上传失败` 日志（**不会黑屏**；
   `texDownsampleCap` 那条路只保护位图纹理、不覆盖视频纹理）。
2. **`imageSmoothingQuality='high'` 的真实收益未测**（表里 `high` 列是面积平均近似）。它只影响 2D 中转那一步，同尺寸下不增显存；Chrome 用更贵的滤波，代价未知。
3. **`?res=2160p` 的 mip 取舍**：本轮**不开 mip**（理由见 §1 第 5 条：上限 ≤ 画布 ⇒ 不需缩小采样；NPOT + Adreno 有静默失败史）。若哪天真要在 4K 档把纹理**缩小**绘制（层 size < 画布），需要重新评估。
4. **`elysia/scene-scripts.js` 侧的 3 个接口未接线（属他人文件，本补丁只动 bundle）**：
   `setCurrentTime: () => {}` → `(t) => { if (obj) obj.__videoSeek = Number(t) || 0 }`；`getCurrentTime: () => 0` → `() => (obj && obj.__videoEl ? obj.__videoEl.currentTime : 0)`；
   `rate: 1` → getter 读 `obj.__videoRate`。渲染器侧**已经把读取点写好了**（`__videoPlay` 已经所以"播放/暂停"按钮现在就生效）。
5. **`?diag` 逐层采样仍是 1280×720 口径**（`demo.html` 里 `Math.min(1279, …)` + `/3` 那段，属他人区域未改）：画布换档后该处采样坐标会偏，
   应改成 `cv.width / 投影宽` 的通用换算。已在 `demo.html` 的 P-68 注释里标出。
6. **上报接线（一行，属他人区域）**：`demo.html` payload 加 `videoStats: (renderer && renderer.videoStats) || null`（在那之前靠 5s 一次的 `[we-scene][P-68]` 日志行落盘）。
7. **`?res=auto` 的口径**是"按 `innerWidth × min(dpr,2)` 选最小够用档"，**没有**考虑设备 GPU 能力/内存（`?lowmem=1` 只管粒子）；真机若不稳，应在插件侧透传 `&res=1080p` 而不是改 auto。
8. **插件壁纸 iframe（`embed=1`）默认继承新档位**：默认画布 1280×720 → 1920×1080（像素 ×2.25）。低端机若发热/掉帧，插件侧**一行**就能退回旧行为（iframe URL 透传 `&res=720p`，逐位等于改动前）。
   本轮**没有**改插件（`dsh-mpkg-wallpaper/lib/client.js` 属别人文件），也没有按 `deviceMemory` 自动选档——这属于插件侧决策。`?lowmem=1` 只降粒子，不动分辨率。

---

---

## P-69（2026-09-15，渲染器侧子任务）**相机投影 y 轴反了（全语料级）** + 粒子逐帧重放导致卡顿 + `lockToPointer` 未实现 —— 用户第 1/2/4/6 项

**结论先行（三句话）**
1. 用户第 1 项「花朵被画到屏幕上半部分」的根因**不是**父子合并口径，而是 `buildCamera` 的正交投影
   **把世界 y=0 映射到了 NDC −1（屏幕底）**：所有走 `viewProj` 的**四边形层/粒子层绕屏幕水平中线
   镜像**；蒙皮层走自己的 `MESH_VERT`（本来就是 y-down）所以一直是对的 —— 这正是"只有一部分层不对"。
2. 用户第 2 项「屏幕中间向右下放射性粒子、非常卡」= hina `cherry blossoms on cursor`(id389)：
   ① 我们没实现 `controlpoint[0].flags:1`(lockToPointer) ⇒ 发射器退化到 authored origin = (1920,1080)
   **画布正中**（官方截图正中没有任何放射爆）；② 粒子系统**逐帧重建 + 从 0 重放历史** ⇒ 每帧
   1286 步 × ~165 粒 ≈ **9.2 万次粒子更新**、单层 **62.8ms/帧**。两处都修了。
3. 用户第 4 项「人物没坐到钢琴上」与第 1 项**同源**：钢琴是四边形层（被镜像 54px），人物是蒙皮层
   （没被镜像）⇒ 视觉上错位；本补丁同一处修正即可。

**改动 3 处 + 1 处开关耦合（只碰 `core/we-scene-bundle.js`；`demo.html`/`elysia/` 一字未动）**

### ① 相机投影 y 轴（根因，`core/we-scene-bundle.js:2340`）

`mat4Ortho(left, right, top, bottom, …)` 的**形参名**是 `(…,top,bottom)`，内部公式却是 glMatrix 的
`out[5]=2/(bottom−top)`、`out[13]=−(bottom+top)/(bottom−top)`（即第 3/4 个**实参**是 bottom/top）。
旧调用 `mat4Ortho(cx−fw/2, cx+fw/2, cy−fh/2, cy+fh/2, …)` → `out[5]=+2/fh`、`out[13]=−1` ⇒
`clip_y = 2y/fh − 1` ⇒ **世界 y=0 → NDC −1 = 视口底**（GL 里 NDC +1 才是视口顶）。
与三处 y-down 口径互相矛盾（都是"世界 y=0 = 顶"）：

| 口径 | 出处 | y=0 → |
|---|---|---|
| `parseScene` 产出 | `core/we-scene-bundle.js:1044` `wy = PROJ_H − origin.y` | 顶（y-down） |
| `MESH_VERT`（蒙皮） | `core/we-scene-bundle.js:4529` `1.0 − wpos.y*2.0/u_Proj.y` | 顶 ✅ 一直是对的 |
| `preview.mjs`（CPU 预览） | `orthoYDown()`：`m[5]=−2/ch, m[13]=+1` | 顶 ✅ |
| **相机 `cam.projection`（改前）** | `core/we-scene-bundle.js:2340`（旧） | **底 ❌ 镜像** |

修法：与 `MESH_VERT` 同式（`clip_y = 1 − 2y/fh`），`?projy=legacy`（别名 `?parenty=legacy`）回到旧口径。
新导出 `projectionYFix()` / `setProjectionYFix(on)`（测试可强制），`core/we-scene-bundle.js:2250-2268`。

**开关耦合（必须一起改，否则改完更错）**：`QFLIP`（`core/we-scene-bundle.js:5166`）默认值改为**跟随 projy**
（fix→关、legacy→开）。理由（写进了注释与 README）：2026-09-12 "四边形路径 v 轴与官方相反"的**定案是误诊**
—— v 翻转对**中心恰在 y=1080 的层**等价于那次镜像（背景/满幅飘带因此"同时变正"），对中心不在 1080 的层
（花朵 1640.55、时钟 8、钢琴 1053）只能翻内容、翻不动位置 ⇒ 位置误差一直留着。`?qflip=1|0` 仍可显式覆盖。

### ② 粒子：按输入签名缓存 + 每帧只推进 dt（`core/we-scene-bundle.js:7067-7130`）

旧路径每帧 `buildParticleSystem` 后 `simulateParticleSystem(sys, time, 400)` **从 0 重放**：t≥20s 吃满
400 步。而输入是**静态的**（层 origin 固定；lockToPointer 我们没实现，控制点 offset 恒 0）⇒ 白烧 CPU。
新路径：按 `层id|origin|scale|angle|alpha|rateMul|maxcount|partMul|贴图|指针(仅指针层)` 签名缓存系统，
稳态每帧 1 步；时间倒退 / 签名变化 / 换场景 → 重建重放（**首帧与旧行为逐位一致**）。
新记账：`particleStats.simMode/simSteps/simUpdates`。回退 `?psim=replay`。

### ③ `lockToPointer`（`core/we-scene-bundle.js:2537-2552、2704-2725、2898-2910、5185-5225、7070-7080`）

`controlpoint[i].flags & 1` → 该控制点锁指针；发射器"挂指针"判据 = 显式 `controlpoint==pointerCp`，
或未显式指定（缺省 0）且本层有 `mapsequencearoundcontrolpoint`（该 initializer 缺省控制点也是 0）。
指针来源（可注入，优先级从高到低）：`window.__mpwPointer={x,y,inside}`（**设计坐标**，y 向下）→
画布 `pointermove`（passive，按画布归一化 × 相机 framed 窗口换算）→ **都没有 = 不发射**。
`controlpointattract` 在指针锁定时目标改为指针（否则会把花瓣拽向世界原点 (0,0)）。
**flags 的 bit 定义未在 `lwe-ref`/`wer-ref` 找到权威出处 ⇒ 按 `flags:1` 推断，标注未定**；
`?cursor=off` 可整类关掉（用户的即时逃生口，与 `?noparticles` 全局关独立）。

### 定量：问题 1（白/淡色低饱和像素 10 带占比，上→下；口径 = lum≥170 且 max−min≤76，
由官方 W1.jpg 反解、复现用户给的向量 RMSE 0.76）

| 来源 | 10 带占比 | 花朵外接框（设计 y） |
|---|---|---|
| 官方 `Testphoto/TP11/W1.jpg` | `[2.55,16.98,29.67,29.97,23.99,2.36,5.43,8.08,6.69,8.53]` | 花瓣自 ~1071 起铺到底 |
| 真机改前 `reports/r1789405811216.json` | `[5.13,16.9,13.61,30.19,16.58,1.13,0.75,0.46,0.21,0.03]` | **0..1095（上半屏，镜像）** |
| CPU 预览 / 修正后 GPU 目标 | `[2.62,16.37,32.34,28.63,34.35,2.23,4.83,6.07,0.5,3.78]` | 1065..2216 ✅ |

复原实验（**决定性**）：把两个花朵层的 origin 关于 1080 镜像后用 `preview.mjs` 重渲 →
`[3.65,17.88,17.81,28.93,21.44,1.49,0.88,0.46,0.01,0]`，与真机向量几乎重合（RMSE 2.2；未镜像的
CPU 与真机 RMSE 11.8），且画面逐处吻合（顶部花瓣 + y≈1095 硬接缝 + 底部干净）。全帧 ZNCC：
"除人物外全部镜像" = **0.497**（最佳）、"只镜像花朵" = 0.421、"不镜像" = **0.112** ⇒ 真机 = 所有
四边形层被镜像、蒙皮人物未被镜像。

### 假设裁定（用户给的"子层 y 当 y 向下加"假设：**证伪**）

- 两种读法都算过：y-up 子偏移（`868.18−(−348.73)=1216.91` → y-down **943.09**）与 y-down 相加
  （`868.18+(−348.73)=519.45` → y-down **1640.55**）。解析器产出的是 **1640.55**，与真机上报
  `layers[].origin=1641` **逐位一致**，且与官方一致 ⇒ **父链合并是对的**，不必改。
- 真机画到的 **519.45** 不是解析结果，而是"1640.55 被相机镜像"（2160−1640.55）。
- 对照层 `钢琴`(id82)：解析 1052.95（真机 1053 ✓），镜像后 1107 ⇒ 只差 **54px**，肉眼看不出来 ——
  这就是"假设成立但它没偏"的原因（**不是**它没偏，而是偏得太小）。`?projy=legacy` 下三层的落点
  在测试里有硬断言（花朵 519.45 / 花朵拷贝 284.57 / 钢琴 54.09px）。

### 全语料影响面扫描（`/tmp/corpus-scan.mjs`，11 个包 467 层，其中四边形层 266）

修正后**位置变化 >24px 或进出屏 = 251 / 266 层**（近对称的满幅层变化 <24px）。偏移量 top：
`伊蕾娜 果园春色`(3660962877) 2340px、`4k-16-9origin_wall`(3669681034) 2160px、
`帧率显示/Clock/Date/Day`(3327063360, cy=8) 2144px、`歌词`(3660962877, cy=2072) 1984px。
受影响层数：3660962877:65、3327063360:49、3326873240:38、3544152633:35、3719111841:27、…、3554161528:9。
⇒ **这是一次全局口径修正，不是花朵特例**；`?projy=legacy` 是逐位回退口。

### 定量：问题 2（`node particle-cost-probe.mjs 3554161528 --frames 30`，mock-GL 真实 renderScene，1/30s 步进，t 从 12.5s 起）

| 配置 | render 中位 | 最差 | alive | 每帧模拟步数 | 每帧粒子更新 |
|---|---|---|---|---|---|
| 改前（`?psim=replay`） | **62.8 ms/帧** | 127.5 ms | 394 | 1346–1401 | **~96,000** |
| 改后（incr，无指针） | **1.7 ms/帧** | 53.7 ms（首帧重放） | **237**（id389 = 0 粒） | 6 | **245** |
| 改后（incr，指针在中心） | **1.5 ms/帧** | 133 ms（首帧重放） | 397 | 6 | 403 |

即 **37× 中位耗时下降 / 392× 粒子更新下降**，且 `particle-shape-audit.mjs` 的几何与像素指标
（id389：165 quad、长轴角中位 104°、覆盖均值 alpha 0.076、不透明占比 7.6%）**改前改后逐位相同**
—— 只改 CPU 代价，不动一个顶点。无指针时该层 0 粒 = 官方截图表现（用户第 6 项）。

### 问题 3/4/5

- **第 4 项（人物坐姿）**：与第 1 项同源。真机 vs 官方（区域 ZNCC 最佳偏移，设计 px）：
  人物区 (−8,−24)、钢琴区 (+10, **+40~54**)；修正后（CPU 预览 = 修正后 GPU）两区都是
  (≈0, −8~−10)（全局取景差，非线性误差）⇒ 钢琴回到 authored 位置后人物与琴凳对齐（用户要的"再向下"）
  。x 方向镜像不产生位移（Δx=0），残余横向偏差在测量噪声（~10px）以内。
- **第 3 项（眉毛眨眼时左右翻转 180°）**：**数据侧排除**。真包 `models/人物_puppet.mdl` 3 个动画 ×
  32 骨 × 全部帧 = 12960 个样本：`sampleAnimRT` 的合理性 guard 触发 **0 次**、帧间 rotZ 跳变 >90°
  **0 次**；`sampleCompositeAdditivePose`（`core/we-scene-bundle.js:7900+`）对**帧间插值**与**additive 增量**
  都做了最短弧展开（`while (da>π) da−=2π`）⇒ "角度插值走长边"假设**证伪**。剩下两个可疑点：
  ① `core/attach-transform.mjs:305` 的 guard 失败会**回落到 bind 姿势**（`atan2` ∈ [−π,π]）而邻帧是累计角
  ⇒ 一旦某帧数据被判非法就会出现一次 ≈180° 摆动（本包 0 次，别的包可能有）；
  ② 眉毛在 MDL 里是**骨骼/蒙皮权重**而不是独立层（hina 的 scene.json 37 个对象里**没有**眼睛/眉毛层），
  权重表（`blendIndices/blendWeights`）分错骨也会产生同样签名。**未定**：需要用户提供一个
  `?ln` 单层隔离 + 眨眼瞬间的截图，或允许我们给 `elysia/we-renderer/puppet.js` 加逐帧骨骼 dump。
- **第 5 项（眼睛随呼吸左右移动）**：同上，眼睛**不是独立层**而是 人物 puppet 的骨/子网格（hina 37 个
  对象里无眼睛层），因此它只会被**骨骼姿势合成**带走。`sampleCompositeAdditivePose` 对 additive 层把
  `(层姿势 − 该动画帧0)` 的**角度分量也加进 final**（官方语义如此）⇒ 若眼睛骨的父链里含呼吸骨，
  它就会按父骨的**旋转**倾斜移动（与用户"按倾斜程度左右移动"的描述一致）。**未定**：需要
  ① 打印 32 骨在呼吸周期的 (angle,tx,ty)（当前 `?ln` 只到层粒度）；② 或确认官方是否把眼骨挂在头骨上。
  **未做任何猜测性改动。**

### 测试与门禁

- 新增 `projection-y-test.mjs`（注册进 `run-all-tests.sh`，**54 → 55 项**），**44 断言**：
  [1] 投影真值表（fix: y=0→NDC+1 / y=2160→−1 / 与 MESH_VERT 同式；legacy 复现镜像；两口径互镜）；
  [2] 真包 `3554161528` 花朵落点 1640.55（fix）vs 519.45（legacy）、花朵拷贝 284.57、钢琴只偏 54px；
  [3] 粒子 incr 缓存不变量（首帧与 replay 存活/批次逐位一致、第二帧更新次数 ≥20× 下降）；
  [4] lockToPointer（无指针 ⇒ 0 粒、`?cursor=off` ⇒ 0 粒、注入两个已知指针坐标 ⇒ 生成点 max|Δ|≤1.4px、
  雪景远景/落花等无 flags=1 的发射器不受影响）。
- 新增人工取证工具（不进run-all-tests）：`particle-cost-probe.mjs`（每帧 `simSteps/simUpdates/ms`）、
  `flower-band-metric.mjs`（官方/真机/CPU 三方 10 带 + 花朵外接框）。`particle-shape-audit.mjs` 复用。
- `node diag-flag-check.mjs` → 代码 96 == README 96、0 差异（新增 `projy`/`parenty`/`psim`/`cursor` 四行，
  `qflip` 行改写为"跟随 projy"）。

### 真机复测（用户刷新后自动上报，**已确认**）

报告 `reports/r1789407474876.json`（2026-09-14T17:37:54，`?id=3554161528`）—— 日志里带本补丁的口径自报：
`⚠ P-69 投影 y 口径=fix(世界y=0→屏幕顶，与 MESH_VERT/CPU 预览同式)，四边形 v 翻转 qflip=off`。

| 指标（官方 `Testphoto/TP11/W1.jpg` 为基准） | 真机**改前** r1789405811216 | 真机**改后** r1789407474876 | CPU 预览 |
|---|---|---|---|
| 花瓣 10 带占比 | `[5.13,16.9,13.61,30.19,16.58,1.13,0.75,0.46,0.21,0.03]`（底部全空） | `[2.65,17.21,29.39,28.69,30.26,1.95,3.93,5.46,0.81,1.44]`（底部有花） | `[2.62,16.37,32.34,28.63,34.35,2.23,4.83,6.07,0.5,3.78]` |
| 与官方 10 带 RMSE | **7.18** | **3.68** ✅ | 4.27 |
| 台账 花朵 rd.y | 1066..2216（镜像位） | −56..1094 | — |
| 台账 钢琴 rd.y | −52..2158 | **2..2212**（=解析值，向上 54px） | — |
| 人物区 ZNCC / 钢琴区 ZNCC | 0.372 / 0.235 | **0.768 / 0.766** | — |
| 人物区 vs 官方最佳偏移 | (−8,−24)、钢琴 (+10,+40~54)（**两层相对错位**） | 人物 (−6,−14)、钢琴 (−10,−10)（**同一位移=全局取景差**） | — |
| 粒子每帧更新 `simUpdates` / 步数 | 旧字段不存在（等价 ~9.2 万） | **464 / 10**（`simMode:"incr"`） | 245 / 6 |
| 画面中心放射爆 | 有 | **无**（新 shot 中心只有人物/钢琴） | 无 |

⇒ ① 花朵回到下半屏、与官方 10 带 RMSE 从 7.18 降到 3.68；② 钢琴相对人物回正 ⇒ **用户第 4 项
"没坐到钢琴上"同源解决**（人物是蒙皮层不受镜像影响，钢琴回位后两者同位移）；③ 粒子每帧更新
≈198× 下降（9.2 万 → 464），中心爆消失。

### 跨文件适配清单（原 owner 请过目；都是**符号适配**，没有放宽任何断言）

| 文件:行 | 改了什么 | 为什么是"符号适配"而不是"放宽断言" | 原 owner（据文件头） |
|---|---|---|---|
| `camera-fillmode-test.mjs:29,43`（helper `framed()`） | `2 / m[5]` → `2 / Math.abs(m[5])` | 该 helper 是**从投影矩阵反解 framed 窗口高**：修正后 `m[5]` 必为负（`clip_y = 1 − 2y/fh` 的必要条件），取模只是还原"窗口高"这个正数量；同文件 17 条断言（3840×2160 / 2880×2160 / zoom=2…）**一条没改**，改后全绿 | P0-4（WER-ALIGN B1/B2） |
| `camera-fillmode-test.mjs:74,84`（内联取值） | `2 / m[5]`、`2 / camB.projection[5]` → 同加 `Math.abs` | 同上（同一 helper 的内联写法） | 同上 |
| `parity-check.mjs:120`（自带 `orthoYDown`） | `m[5]=+2/ch, m[13]=−1` → `−2/ch, +1` | 该 helper 原本与**真机台账 rd** 用同一套错误口径（台账 rd 是 y-up），两边"一起错"所以长期绿灯 —— 这正是 P-69 这个全语料镜像 bug 的盲点。改后与 `buildCamera` / `preview.mjs:164` / `MESH_VERT` **四处同式**；判定阈值/soft 规则/size0 规则**一条没改**（实测两种口径下逐包 verdict 完全一致，唯一 FAIL 是 3326873240 的既有差异） | W11（任务书 C1 平价基线） |
| `tex-upload-guard-test.mjs`（文件顶，import 之前） | 加 2 行：`globalThis.location = { search: '?qflip=1' }` | 该用例两条精灵帧 UV 断言写的就是"**QFLIP 后**"的值（下半帧 `maxV=0.5`、回绕帧 `minV=0.5`）；P-69 把 qflip 默认值改成跟随 `projy`，默认路径不再翻 v ⇒ 显式钉住 qflip 后，被断言的量与原意图逐位相同（qflip 默认值本身由 `projection-y-test` 覆盖）。39 断言全绿 | W1/W3/W4（P-36） |
| `package-matrix.mjs:446-448`（渲染前钩子） | 加 4 行：`globalThis.__mpwPointer = {x:1920,y:1080,inside:true}` + 渲染后 `delete` | 父会话裁定方案①：lockToPointer 发射器需要指针才发射，审计原先没有指针 ⇒ `drawnLayers 16→15` 且误触 `PARTICLE_EMPTY`。注入"鼠标在画面正中"= 真机常态，**基线零改动**，并顺带覆盖"有指针会发射"这条新路径（无指针⇒0 粒 由 `projection-y-test` 断言）。判定规则与基线**一条没改** | MERGED-2 第 1 项 E |
| `run-all-tests.sh:91` | 新增一行 `add "projection-y" …` | 注册 P-69 的新门禁项（54 → 55 项）；其余行未动 | MERGED-2 第 4 项 I（门禁） |
| `PATCHES.md`（P-60 / P-67 段各 1 处） | 把 `reports/` 下**已被轮转清理**的两处上报文件引用（r1789397997210 / r1789401975489）改成"上报 id …（原件已清理，ID 保留可追溯）" | `docs-check` 会把文档里的 `reports/*.json` 当文件引用校验；这几份原件已不在 `reports/`（只有 ID 可追溯）。证据内容一个字没删，只是去掉了失效路径 | P-60 / P-67 轮次 |

### 因本次口径修正而必须同步的**既有测试**（都在测试侧，语义未变，仅随口径适配）

| 文件 | 改动 | 为什么 |
|---|---|---|
| `camera-fillmode-test.mjs` | 4 处 `2/m[5]` → `2/Math.abs(m[5])` | 该文件从投影矩阵反解 framed 窗口高；修正后 `m[5]` 为负（y-down 的必要条件），取模还原窗口高，其余断言逐条不变 |
| `parity-check.mjs` | 自带 `orthoYDown` 的 `m[5]=+2/ch,m[13]=−1` → `−2/ch,+1` | 该 helper 原本与**真机台账**一起用错口径（台账 rd 是 y-up），两边"一起错"所以一直绿——这正是本 bug 的盲点。改后与 `buildCamera`/`preview.mjs`/`MESH_VERT` 四处一致 |
| `tex-upload-guard-test.mjs` | 顶部钉 `location.search='?qflip=1'` | 该用例两条精灵帧 UV 断言写的是"QFLIP 后"的值；P-69 改了 qflip 默认值（跟随 projy），显式钉住后断言逐条不变（默认值本身由 `projection-y-test` 覆盖） |

（文件边界说明：这三个文件属其他会话，改动都是"随口径适配"的机械修改，语义与断言未改；主会话如不同意可回退这 3 处。）

### 门禁与遗留

- `bash run-all-tests.sh`（最终轮）：**53 PASS / 1 FAIL / 1 SKIP（共 55）**。
  唯一 FAIL = `visual-diff-kal` **600s 超时被中止**，属既有环境 flake（P-70 段已记录"偶发挂到 600s、
  单独跑 1.1s"）：根因是 `/tmp/vd/` 被清空后 `--skip-render` 的 current 图不存在 → 回落到
  `headless-shot.mjs` 的 Chromium 六档重试（本 PROot 环境必挂）。**同一条命令换 `--out /tmp/vd2/`
  单独复跑 2s PASS**（`✓ --check：与基线一致（SSIM 0.4808 → 0.4808）`）⇒ 与本补丁无关。
  `package-matrix` 在按父会话裁定①注入指针后 **PASS**（`✓ --check：与基线逐包比对无退化`，
  基线零改动）；`time-variation` / `tex-upload-guard` / `parity-check` / `camera-fillmode` / `docs-check`
  / `diag-flags` / `projection-y` 全绿。

### 第 4 项取证能力：`?bones=<层id|层名子串>` 只读逐骨探针（新增）

用户第 3/5 项（眉毛眨眼翻 180°、眼睛随呼吸左右移）都发生在 **puppet 骨骼**上，而 hina 的 37 个对象里
**没有**独立的眼睛/眉毛层（它们是 `models/人物_puppet.mdl` 的骨/子网格）⇒ `?ln` 那种层粒度开关看不到。

- 口径：demo.html 每帧填 `sk.gBones[b] = bindInv[b] × RT(angle,tx,ty)`（行主序），探针反解
  `pose = bindWorld[b] × gBones[b] = RT` ⇒ 与 `sampleAnimRT`/`sampleCompositeAdditivePose` **同空间同量纲**，
  可与参考实现逐位对拍（测试用"姿态=bind"验证反解 == `bindWorld` 极坐标，maxErr=0）。
- 产出：`window.__mpwBones = {layer,id,nb,frames:[{t,bones:[[ang,tx,ty]…],flips:[{b,from,to,d}]}]}`
  （环形缓冲 180 帧）+ **每 2s 一行 `[bones]` 结构化日志**（角度/tx/ty 极值、跨帧跳变 ≥90° 的骨、
  水平位移最大的骨）——日志进 `#log` ⇒ 进设备上报，**用户刷新一次即可回传逐骨数据**。
  "反号"的机器判据取"跨帧角度跳变 ≥ π/2"（用户口述"左右翻转 180°"的可判形式）。
- 纯只读：不开时**不建 bindWorld、不跑反解、一个字段都不写**（`projection-y-test` 断言默认
  `__mpwBones === undefined` 且渲染逐位不变）；打开时只有被点名那层有 32×16 次乘法/帧的开销。
- **交接 demo.html**（可选，1 行）：想把逐骨数据作为**独立上报字段**（而不是挤在 log 里），
  在 payload 里加 `...(typeof window.__mpwBones !== 'undefined' ? { bones: window.__mpwBones } : {})`；
  现方案不依赖它（log 已能带出摘要）。

### 未定项

1. **`flags` 位定义无官方出处**（lockToPointer 按 `flags:1` 推断）；若官方是别的位，受影响面也只是
   "哪些发射器挂指针"，`?cursor=off` 仍能兜住。
2. **`?cursor` 默认开是否会让所有包都少画一层**：本补丁只把**指针锁定**的发射器改成"无指针不发射"，
   全语料扫描里带 `flags:1` 控制点的层只有 4 个（hina 389 命中；notes1_simple/萤火虫×2 的发射器不引用
   该控制点 ⇒ 不受影响）。真机上"鼠标在画布上移动"会出现花瓣拖尾（作者本意），**待用户确认观感**。
3. **真机复测待用户刷新上报**：本补丁的定量全部来自 mock-GL + CPU 预览 + 官方截图；帧率数字是
   Node 侧 mock-GL 的**相对**对比（不含真实光栅化），真机绝对值要靠 `?perf` 上报。
4. 第 3/5 项（眉毛/眼睛）见上——**证据不足，未改**。
5. 相机口径修正对**效果链 FBO 内部**（`layerOrtho = mat4Ortho(0,fboW,0,fboH)`）未动：它自成一套
   y-up 约定，与相机正交投影是两回事；带效果链的层（hina 的 裙子底/1/2/纯色）位置会随相机一起修正，
   但**内容方向**是否有二次翻转需真机 A/B 确认。

---

## P-70（2026-09-15）门禁互斥锁 + 每次运行唯一临时产物 —— 治「并发跑门禁假红」

**症状**：同一天里 **4 个会话各遇到一次** `visual-diff-kal` 在**整条门禁**里挂到 600s 超时被中止
（单独 `--only visual-diff-kal` 跑 **1.0–1.7s** 且 SSIM 与基线一致），另有 `time-variation`、
`package-matrix` 各被拖红一次。四个会话在各自报告里都写了"中途红是并发污染、单独复跑即绿"。

**根因**（两条）：
1. **没有互斥**：两个 `run-all-tests.sh` 同时跑时互抢 CPU/swap（本机 15G 内存、free 0），
   单个重项（`tex-fmt5` 45s / `package-matrix` 38–51s / `layer-rect-kal`）把 `visual-diff-kal`
   挤到 600s 超时；受害项的"红"与被测代码无关。
2. **共享临时产物**：`LASTLOG=/tmp/run-all-tests-last.log` 与 `visual-diff-kal --out /tmp/vd/`
   是**写死路径**，两个门禁互相覆盖 → 事后排障看到的是别人的日志/产物。

**改法**（都在 `run-all-tests.sh`，单跑行为逐位不变）：
- **门禁锁**：`mkdir /tmp/.mpw-gate.lock` 原子获取；拿不到就**等待**（每 5s 轮询，最多 20 分钟），
  首次等待打印一行提示；**超过 30 分钟的锁按陈旧自动回收**（防上次被 Ctrl-C 留下死锁）；
  `trap ... EXIT INT TERM` 保证正常/异常退出都释放；**`MPW_GATE_NOLOCK=1` 逃生口**。
- **唯一临时目录**：`RUNTMP=/tmp/mpw-gate-<pid>-<epoch>`，`visual-diff-kal` 的 `--out` 改为
  `"${MPW_VD_OUT:-/tmp/vd}/"`，结尾打印「本次运行产物 / 日志副本」；共享 `LASTLOG` 保留
  （既有文档引用它），但同时落一份到 `RUNTMP`。

**验收（实测）**：
```
$ mkdir /tmp/.mpw-gate.lock
$ timeout 6 bash run-all-tests.sh --only demo-syntax
⏳ 另一个 run-all-tests 正在运行 —— 等待它结束（最多 20 分钟；MPW_GATE_NOLOCK=1 可跳过）
（被 timeout 杀掉，退出码 124 —— 即"确实在等"，不是立刻失败）
$ rmdir /tmp/.mpw-gate.lock && bash run-all-tests.sh --only demo-syntax
PASS demo-syntax (685ms)
══ 汇总：PASS=1 FAIL=0 SKIP=0 / 总 1 项
（本次运行产物：/tmp/mpw-gate-25026-1789406066 ；日志副本：/tmp/mpw-gate-25026-1789406066/last.log）
```

**为什么不改成"检测到并发就直接失败"**：各会话仍需要跑到门禁才能交付，直接失败会把"等待"变成
"反复重试"，反而制造更多并发；等待 + 陈旧回收是唯一不会互相伤害的策略。

**未定**：锁只覆盖 `run-all-tests.sh` 这一条入口；**手工单独跑某项**（`node xxx-test.mjs`）仍可并发——
这类并发只影响共享 `/tmp/vd` 之类产物（现已唯一化），不影响正确性。

### P-70b（同日追加）`visual-diff-kal` 600s 超时的**真根因**与修法

**先纠正一个误判**：另一个会话推断"是 P-70 把 `--out` 换成每次运行唯一目录 ⇒ `--skip-render` 找不到
`current-<id>.png` ⇒ 回落 headless-shot 的 Chromium 重试 ⇒ 必挂"。**实测证伪**：删掉目录、
用全新空目录 + `--skip-render` 跑，**4.9s PASS**（`visual-diff.mjs:196-200` 在文件不存在时会走
`renderCurrent`，而 `SHOT_MODE` 默认 `cpu` = CPU 预览直通，**不碰 Chromium**）。

**真根因**：**排在重项之后的资源压力**。该项单独跑 4.9s，但排在 `tex-fmt5`(45s)、
`package-matrix`(38–52s) 之后时，机器（15G 内存、free 0）换页抖动 ⇒ **>600s 被 `ITEM_TIMEOUT` 中止**。
判据：① 单独复跑永远绿；② 换 `--out` 目录也绿（排除产物缺失）；③ 同一份代码在门禁里红、在门禁外绿，
只有"排在第几位"这一个变量。

**改法**（一行搬家）：把 `visual-diff-kal` 从质量门禁区**上移到 `demo-syntax` 之后**，即整条门禁的
**最前面** ⇒ 在最干净的内存状态下跑。顺序变化**不影响任何判定**（`--list` 顺序随之变化，属预期）。

**与 P-70 锁的关系**：锁治的是"两个门禁**并发**"，本次治的是"**同一个**门禁内部**顺序**造成的资源压力"——
两个不同的失效模式，都需要。

---

## P-75（2026-09-15）`missingLayers` 假阳性 —— **我自己提的诊断把"所有可见层"报成"没画出来"**

**背景**：用户第 4 项原话「有好多层数它的渲染它都渲染不出来……你这些层数它都没有标该层不可见，却渲染不出来」。
我据此要求 demo 侧补了 `layerHealth.visibleBy` + `missingLayers`（"可见、有几何、却从未进台账"的层）。

**症状**：真机上报里 `missing` 忽而 25、忽而 1、忽而 0。逐份对账发现**与台账长度完全反相关**：

| 台账条数 | missing | 份数 |
| --- | --- | --- |
| 0 | **25**（= 该包全部可见层） | 多份 |
| 25 | 0 | 多份 |

**根因**（`demo.html` 的 `mpwLayerHealth`）：台账是"**清空 → 请求下一帧采集（1200ms 窗口）**"的**异步采样**，
有些上报天然采不到（标签页切走 / 未出帧 / 窗口太短）。旧实现**不判这个前提**，于是台账一空，
每个"可见 + 有几何"的层都因为 `drawn=0` 被算成 `missing` ⇒ 一次性报出 25 个根本不存在的 bug。

**为什么必须修**：这种假阳性**比没有诊断更糟** —— 它会让人（包括我）去追几十个不存在的"该画没画"，
并且掩盖真正的 missing（有台账时 missing 恒 0）。我自己就差点据此开展一轮排查。

**改法**：
- 记账前先判 `ledgerSamples = ledger.length`；`ledgerEmpty = (ledgerSamples === 0)`。
- **台账为空 ⇒ `missing: null`（不可判定，不是 0 也不是全量）**，`missingLayers: []`。
- `layerHealthSummary` 增 `ledgerSamples` / `ledgerEmpty` 两键，供判读"这份上报能不能用来判 missing"。
- 页内汇总行同步分支：不可判定时显示「该层是否画漏**本次未采样**（台账空，等下一次上报）」，
  **绝不显示 "null 该画没画"**（那会读成"一个都没漏"）。

**测试**（`props-panel-test.mjs`，260 断言全绿）：
- **T19k（新增，本次回归）**：空台账 + 50 个可见层 ⇒ `missingLayers.length===0`、`missing===null`、
  `ledgerEmpty===true`、且这些层**既不算 invisible 也不算 missing**。
- T19g/T19h/T19j 按新口径更新：T19h 原来用**空台账**测"30 条截断"，其实测到的是本 bug 的假阳性 ⇒
  改为**非空台账**（1 条无关记录）后才真正测到截断；T19j 改为断言"**分支处理 null**"而不是直接拼字符串。

**教训（写进注释）**：**异步采样的诊断字段必须先判"这次采到了没有"**，否则"没数据"会被读成"全都没画"。
同类风险还有：`layerHealth.rect/px` 对四边形层是 `2160−真实y`（另一个已知口径 bug，已另派）。

**回退**：无开关（纯诊断正确性修复）。判定与渲染行为零改动 —— 若某份上报此前显示 `missing: 25`，
现在会显示 `missing: null` + `ledgerEmpty: true`，**这不是行为变化，是把不可判定如实标出来**。

## P-75b ~ P-75f（2026-09-15）门禁三连红 —— 三条都不是"被测代码坏了"

P-75（`missingLayers` 假阳性）之外，同一轮还有 `docs-check` / `parity-check` / `package-matrix`
三项红。逐条查完，**没有一条是真的渲染回归**，但每一条背后都藏着一个"会持续误报"的机制缺陷。

### P-75b `docs-check`：把**滚动产物**当成"缺失的被引用文件"
`PATCHES.md` 里引用 `reports/r1789405801216.json` 之类的**真机上报**（当时证据的出处），
而 `reports/r*.json` 是**按体积/数量轮转清理**的 ⇒ 每次有人引用新的上报，`docs-check` 就红一次
（本晚已红过两轮，前一轮由别的会话手工删引用糊过去，**治标**）。
- 改：`docs-check.mjs` 对 `(^|/)reports/r\d+\.json$` **豁免存在性校验**；
  `reports/parity-*.json`、`docs/*.md` 等**仓库产物仍然照旧校验**（只放开这一种形态）。

### P-75c `parity-check`：CPU 参考的 **y 反解没跟着投影一起翻**
P-69 修了 `mat4Ortho` 的 y 口径后，另一个会话把 `parity-check.mjs` 的 `orthoYDown` 也改了
（`m[5]=-2/ch, m[13]=1`）——**但漏了 NDC→设计坐标的反解**：`dy` 仍是旧投影的
`(v*0.5+0.5)*projH`。于是本参考**仍在镜像每个四边形层**：真机花朵画在 y=1641（正确），
本参考算成 519，Δc=**1121.5**——正好是镜像量（2160−2×519），这就是它的指纹。
- 改：`dy(v) = (1-v)*0.5*projH`（`clip_y = 1−2y/ch` 的逆）。

### P-75d `parity-check`：拿**改动之前**的真机上报跟**改动之后**的 CPU 参考比
`pickReports()` 的评分是 `led.length*1e13 + mtimeMs` ⇒ **"台账条数最多"压倒"最新"**。
渲染管线一改（P-69 全语料投影修正），它仍挑中改动前那份（条目多）⇒ 每层都报镜像差。
设备数据的价值在于"**是不是当前渲染器画的**"，**过期的样本再多也是错的**。
- 改：`mtimeMs*1e3 + min(led.length,999)`（新近主导，条数只作同会话内的并列打破）。
- 效果：6 场景 0 越界；其中 hina 用**改动后**的上报比 **11 层**全部 ok —— 这是投影修复的
  一条独立佐证。

### P-75e `package-matrix`：直接模拟路径**没给指针**
`package-matrix` 有两条粒子路径：① 渲染（已注入 `__mpwPointer`）；② **直接
`buildParticleSystem` + `simulateParticleSystem`** 数存活——**②完全没设 `sys.pointer`** ⇒
`controlpoint[].flags&1`（lockToPointer）的发射器在这条路径上恒 0 ⇒ 误报
`[PARTICLE_EMPTY] 层 "cherry blossoms on cursor" maxcount=1000 但 t=25s 存活 0`（hina/3660962877/红鸾樱落）。
- 改：② 也 `sys.pointer = [1920,1080]`（= 真机"鼠标在画面里"的常态）。
- 量化：`--import` 注入指针 A/B，hina t=1.03s `alive 91 → 194`（该层 +103 粒）。

### P-75f `package-matrix`：`drawnLayers 16→15` —— **已解释的基线变化**（不是白名单）
根因是 P-69 的**正确**语义：该层锁定指针，无指针不发射 ⇒ 不再产生 GL draw。
- 做法：新增 `EXPLAINED_BASE_DROPS` 表（`id+field+base+now` 四元组精确匹配 + 必填 `reason`），
  命中则走 `explained` 列表：**照旧打印**（防止"静默豁免"），只是不计入退化。
- **刻意不做**：`--write-baseline` 一把梭（会掩盖其它真退化）、给规则加通配豁免（白名单式糊过去）。
- **待查（已写进 reason）**：注入指针后该层**已发射（+103 粒）却仍未产生 GL draw** ——
  可能是另一个真 bug（发射了但没画），需要下一步定位。

**本轮的共同教训**：门禁红的时候，**先问"这条红是不是在测一件已经过期/不可判定的事"**。
三条里有两条属于这一类；把它们当成"渲染回归"去查，就是白烧一整轮。


## P-75g（2026-09-15）两条操作纪律 + 一条待办（都不是代码 bug，但不写下来会反复踩）

### ① **不要在 `run-all-tests.sh` 正在运行时编辑它**
实测：门禁跑动中有会话往该文件插了一行注册，bash 是**按字节偏移增量读脚本**的 ⇒ 偏移错位后执行到碎片，
抛出一句毫无上下文的 `run-all-tests.sh: 行 198: e: 未找到命令`（该行当时是空行）。门禁本身仍绿，
但这种错误会让人误以为门禁坏了。**要加测试项：等门禁跑完再加，或者加完重跑。**

### ② **代理/人的"独立复核"要针对数字，不要针对结论**
本轮两次真实教训：
- 有会话推断 `visual-diff-kal` 超时是"P-70 把 `--out` 换成每次唯一目录 ⇒ `--skip-render` 找不到 current 图"。
  我没采信，**用全新空目录实测 4.9s PASS**（文件不存在时走 `renderCurrent` 的 CPU 直通，不碰 Chromium）⇒ 证伪，
  真因是**排队位置造成的资源压力**（P-70b）。
- 有会话（我自己）差点把 `?mcc` 当凯尔希眼睛错位的根因，因为 `core/we-scene-bundle.js:5442-5446` 的注释写着"默认沿用开启"，
  而真正的默认在 `:3854-3861`（**默认关**）。⇒ **注释会过期，判默认值只认代码/README 表**。

### ③ 待办（P-61/P-64 明确留下的、尚未实现的属性面板能力）
- `scenetexture`(27) / `usershortcut`(24) / `file`(1) 三类属性**只解析不渲染**（面板尾部清单里列了原因，不假装可用）
- `volume`(8) / `zoom`(3) 的**对象绑定**未接（`USER_BIND_KEYS` 不含它们；真机实测改了完全不变）
- `instanceoverride.colorn` 这类**嵌套字段**的 `{user:…}` 绑定不在 `USER_BIND_KEYS` 的解析范围内
- `core/we-scene-bundle.js` 的 `propLabel`（bundle:1599）建议补**无分号 legacy 实体 + 数字实体**解码
  （面板侧已在 `demo.html` 修好，但 preview/package-matrix/插件面板仍会显示 `&nbsp`）

### ④ 本期完成的用户可见项（便于对账）
- **第 9④ 媒体集成已接线并默认开启**：`?scriptcache` 默认 **开**（`?scriptcache=0` 关），
  四个陷阱全部处理（A 缓存前提 / B `audioBuffers` 走 `mpwMediaHost.audioBuffers(n)` 原地更新 /
  C `sceneScriptCache.shared = scriptShared` / D 面板改值调 `invalidateUserProps`）；
  注入口：`?media=title=…,artist=…,cover=<包内路径>,position=…,duration=…,playback=playing` 与控制台 `__mpwMedia`。
- **第 5 项**（界面改文本即时生效）：`mpwTextSyncValue`（P-64）。
- **手动上报按钮**：顶部工具栏 `#mpw-report-btn`，不受 4 次自动上限约束，成功/失败可见，
  并有"点它不会收起日志"的回归 + 反证断言（P-64-MEDIA / T20·T22）。


## P-76（2026-09-15，渲染器侧子任务）凯尔希(3719111841) 两条真机 bug：**背景层被视差位移放大 1639px 平移出屏** + **`?eyehack` 在蒙皮路径覆写 `layer.scale` 把眼珠放大 1.4431 倍**

> **本段必须排在所有 `## P-75*` 段之后**（P-编号按文件顺序非降，`docs-check` 会校验）。
> 后续 P-75x 段请插到**本段之前**。
> **编号说明**：任务书指定 P-75，但 `grep PATCHES.md` 显示 **P-75 已被占用**
> （`## P-75（2026-09-15）missingLayers 假阳性`，见本文件 3285 行；且 3192 行另有"并行 P-75"的
> `?bones=` 探针交接），按"被占就顺延"改为 **P-76**。P-71..P-74 在本文件**没有** `## P-` 头
> （P-74 只在 `run-all-tests.sh` 与测试文件里被引用），故 `## P-` 编号序列 P-70 → P-75 → P-76 非降，
> `docs-check` 通过。

只改 `core/we-scene-bundle.js`（+ 新增测试 `p76-parallax-eye-test.mjs`、`run-all-tests.sh` 一行注册、
README-DIAGNOSTICS 三行开关、本段）。`demo.html` / `elysia/` / `vendor-ref/` / `dsh-mpkg-wallpaper/` 零改动
（需要 demo 侧配合的清单见文末「交接」）。

---

### 问题 1：背景层被画偏，屏幕左侧盖不到（用户：「身后的背景没有」）

#### 现象与真机证据（都来自真机上报 `reports/r1789410844086.json`，21 帧全一致）
- 每帧 `【帧N】左缘=178,178,178 中心=65,106,94 背景层=背景正常texOK 背景vis=1`
  ⇒ **左缘是页面灰 = 没被任何层覆盖**，而该层确实在画、贴图确实上传成功
  （`✅ 降采样纹理已上传 背景 2048x1229（9.6MB, glErr=0, tex=ok）` + `[fx0] … solid=false color=[1,1,1,1] size=[6000,3600]`）。
- 台账 `背景正常` `rd=[1430,-2518,4246,2546]`；**官方标定** `refrender-3719111841.json["31"]=[-208.63,-208.73,4244.28,2546.57]`
  ⇒ Δ = **(+1638.6, −2309.3, +1.7, −0.6)**：**w/h 对得上（差 ≤2px），只有平移错**。
- 全包横向对照（真机台账 vs 官方标定，逐层 Δ）**只有两层异常**：

| 层 | 台账 rd | 标定 [x,y,w,h] | Δ | 路径 / ledger `sc` |
|---|---|---|---|---|
| **背景正常** | **[1430,-2518,4246,2546]** | [-208.63,-208.73,4244.28,2546.57] | **+1638.6, −2309.3**, +1.7, −0.6 | layer / [0.707,0.707] |
| **眼睛组合** | **[1912,541,305,253]** | [2263.7,447.35,169.78,277.88] | **−351.7, +93.6**, +135.2, −24.9 | mesh / **[1,1]** ← 见问题 2 |
| 长发3 | [245,718,1985,1618] | [245.46,718,1986.05,1619.47] | −0.5, 0, −1.0, −1.5 | mesh / [0.693,0.693] |
| 右侧发 | [2264,180,624,1126] | [2263.24,179.85,624.37,1126.77] | +0.8, +0.2, −0.4, −0.8 | layer / [0.693,0.693] |
| 主体 | [1268,252,1398,2072] | [1268.18,251.97,1399.8,2073.37] | −0.2, 0.0, −1.8, −1.4 | mesh / [0.693,0.693] |
| 左眼皮 | [2306,594,132,90] | [2306.37,593.17,130.97,90.78] | −0.4, +0.8, +1.0, −0.8 | layer / [0.693,0.693] |
| 右眼上眼睑 | [2512,568,80,47] | [2512.42,568.07,81.77,47.81] | −0.4, −0.1, −1.8, −0.8 | mesh / [0.693,0.693] |
| 左耳朵1 | [1778,78,444,394] | [1777.93,77.98,444.89,394.99] | +0.1, 0.0, −0.9, −1.0 | mesh / [0.693,0.693] |
| 底发 | [1912,114,744,454] | [1912.56,114.83,742.86,453.9] | −0.6, −0.8, +1.1, +0.1 | layer / [0.693,0.693] |
| 衣摆 | [1036,1292,1670,1070] | [1035.48,1291.55,1670.06,1071.33] | +0.5, +0.5, −0.1, −1.3 | layer / [0.693,0.693] |

#### 先排除两条被怀疑过的路（都是"算过真数"再排除，不是猜）
1. **`alignment` 偏移不是原因**。`parseScene:1128` 是 `alignment: o.alignment || 'center'` ⇒ 缺键时 `layer.alignment === 'center'`，
   `compositeLayer:6104` 取 `ALIGN['center'] = [0.5,0.5]`，`:6203` 的 `mat4Translate(m, 0.5−a[0], 0.5−a[1], 0)` 恒为 `(0,0)`。
   实测：**本包 43 层 alignment 直方图 = `{"center":43}`**（0 层非 center），`背景正常` 的 w=4244.28 / h=2546.57、
   offset = (0.5−0.5)×4244.28 = **0.000**、(0.5−0.5)×2546.57 = **0.000**。
   ⇒ 任务书里"若按未缩放 6000 算 a0≈0.227"的反推**不成立**：a0 就是 0.5，offset 就是 0。
2. **视差"量级本身过大"也不是原因**。对象级公式（`:6187-6190`）的世界位移
   `off = ((o − camC) + mouse) ∘ depth × amount`，真数：`ox−camCx = 1913.5083 − 1920 = −6.4917`、
   `oy−camCy = 1064.5498 − 1080 = −15.4502`、`depth = (−0.17,−0.17)`、`amount = general.cameraparallaxamount = 0.35`、
   `influence = general.cameraparallaxmouseinfluence = 0.25` ⇒ 鼠标从画布最左滑到最右（`disp = ±480px`）时
   **offx ∈ [−28.17, +28.95]、offy ∈ [−27.64, +29.48]**。**上限 ~±29px，不可能产生 1639px** ⇒ 视差量级排除。

#### 根因（两处口径错，都在 `compositeLayer`）
- **(A) 位移被画在了错误的矩阵空间**（这是 1639px 的来源）
  官方 `offset = ((node_pos − cam_pos) + mouse) ∘ depth × amount` 的量纲是**世界像素**（同式里 `node_pos`/`cam_pos`/`mouse` 都是设计像素），
  但旧实现在 `core/we-scene-bundle.js:6197` 的 `mat4Scale(m, w, h, 1)` **之后**才 `mat4Translate(m, offx, offy, 0)`（旧 `:6169`）
  ⇒ 位移又被本层 `(w, h)` 乘了一次。真数：
  - `offx = ((1913.5083 − 1920) + 0) × (−0.17) × 0.35 = +0.386258` 世界像素 → **× w(4244.28) = +1639.43px**
  - `offy = ((1064.5498 − 1080) + 0) × (−0.17) × 0.35 = +0.919286` 世界像素 → **× h(2546.57) = +2341.03px**
  真机 Δx0 = +1638.63（差 0.8px = `rd` 取整）；Δy 用 `mvp` 反解 = **+2341.0**（逐位吻合）。
  > 台账里 y 显示 −2309.3 而不是 +2341：那是**已知的四边形层 y 口径 bug**（`rd` 报了 `2160 − y_down`）——
  > 2160 − 4678.86 = −2518.86，与台账 `rd[1] = −2518` 吻合。y 我以 `mvp` 为准，不引 `rd`。
- **(B) `opts.parallaxOff` 不门控"对象级"视差**（`compositeLayer` 的视差块从不读它）
  `demo.html:3638` 默认 `parallaxOff: true`（注释写"**视差整体停用**"，理由是"不然有些壁纸不好测试/截图位置带随机偏移"），
  但旧实现只在 `renderScene` 侧把**鼠标项** `parDispX/parDispY` 置 0（`:6519`），
  对象级 `(node_pos − cam_pos)` 项照旧生效 ⇒ **"关掉视差"之后仍有一个与鼠标无关的常量位移**。
  → 这就是为什么真机在**没开视差**（默认）的情况下也会偏 1639px。

#### 为什么**只有这一层**（用上面那张真机对照表说话）
本包 17 个 `parallaxDepth` 非空层里：
- **`背景正常`**：`depth=(−0.17,−0.17)` 非 0 + **可见** + **四边形路径**（`fx=0`，无蒙皮） ⇒ **唯一命中 (A)×(B)** ⇒ Δx=+1639.4。
- **`背景暗色`**：同 `depth=(−0.17,−0.17)`、同四边形路径，但用户属性 `background`（combo，真机 value `"0"`）把它门控成
  `vis=0`（真机 `[首帧] #2 背景暗色 vis=0`）⇒ 没画。若画了，同一式子给 **Δx = +4481.6**（尺寸更大、离中心更远）。
- **`长发3`**（`depth=(0.41,−0.36)`，唯一非 0 的**蒙皮**层）：走 `renderMeshLayer`，
  **对象级视差在蒙皮路径上根本没有施加点** ⇒ 不受影响（其台账 Δ 全 ≤1.5px）。
- 其余 13 层（`音频线…`/`Glass Shards`/`灰烬大`/`光束-角`×2/`Bokeh Hex`/`Bokeh Cir`/`尘埃`/`Clock`/`后处理层`…）
  `depth = "0 0"` ⇒ `off = 0`；`光束 2 (旧)` `depth=(−0.01,−0.01)` 但 `vis=0` 且 `size=0×0`。
- 其它 26 个无 `parallaxDepth` 的层完全不进这个分支 ⇒ 对照表里 Δ 全在 ±2px。

#### 改法（`core/we-scene-bundle.js`）
1. 把视差位移**算在 `mat4Identity()` 之前**，与 `ox/oy` **合并成同一次平移**
   （`m = mat4Translate(m, ox + parOffX, oy + parOffY, layer.origin[2])`，新 `:6194`）
   —— 数学上等价于官方 `T(offset)·T(origin)·R·S(w,h)·T(align)`，位移不再被 `(w,h)` 放大。
2. 视差块加门控 `(opts.parallaxOff !== true || __parOffLegacy)`（新 `:6177`），与场景级门控同口径。
3. 旧口径原样保留在新 `:6205`（`if (__parSpaceLegacy && (parOffX || parOffY)) m = mat4Translate(m, parOffX, parOffY, 0)`）。

#### 量化（mock-GL 走**真实** `render()`/`compositeLayer`，逐字复刻 `demo.html:3588-3626` + `mpwLedgerYDown` 口径）

| 开关组合 | 背景正常 rd | 覆盖整屏? | 对应真机 |
|---|---|---|---|
| **真机（双回退）** `parallaxOff=true` + 旧空间 + 不门控 | `[1431,-2519,4244,2547]` | ✗ 左侧漏 1431px | 真机 `[1430,-2518,4246,2546]`（差 ≤2px = 取整） |
| **改后默认** `parallaxOff=true` | **`[-209,-209,4245,2547]`** | ✓ x[−209,4036]⊇[0,3840]、y[−209,2338]⊇[0,2160] | — |
| 改后 + `?parallax=1`（视差开，鼠标居中） | `[-208,-208,4244,2547]` | ✓ | — |
| 仅 `?parspace=legacy`（视差开） | `[1431,-2519,4244,2547]` | ✗ | 证明 (A) 单独就足以造成 1639px |
| 仅 `?paroff=legacy` | `[-208,-208,4244,2547]` | ✓ | 证明 (B) 单独无害（世界位移只 0.386px） |
| `?parallax=legacy` 旧公式（disp=0） | `[-209,-209,4245,2547]` | ✓ | 旧公式不回归 |

与官方标定 `refrender["31"]` 的 Δ 从 **(+1638.6, −2309.3, +1.7, −0.6)** → **(0, 0, +1, 0)**。
**真机可核对证据**：改后 `【帧N】左缘=` 不再是 `178,178,178`（页面灰）而是背景色；台账 `rd[0]` 从 `1430` → `-209`。

#### 回退开关（**默认行为改了，两条都登记**）
- **默认改了**：位移从"后乘 S(w,h)"改成"世界像素与 origin 合并"；`parallaxOff` 从"只停鼠标项"改成"对象级也停"。
  理由：前者是**量纲错**（官方公式就是设计像素，没有第二种解释）；后者是**代码与它自己注释的契约不一致**
  （`demo.html`/bundle 都写"视差整体停用"）。改后默认值让 `背景正常` 与官方标定**逐位吻合（Δ=0）**，
  这正是该工程"截图/验收位置要稳"的目标。
- `?parspace=legacy` —— 回到后乘 S 的旧空间（复现 1639px bug，真机 A/B 用）。
- `?paroff=legacy` —— 回到"`parallaxOff` 不门控对象级视差"的旧口径。
- `opts.parallaxSpaceLegacy` / `opts.parallaxOffLegacy` —— 同义的程序化入口（给测试在同进程内切两态）。

---

### 问题 2：眼睛位置不对（眼皮与眼珠错位）

#### 现象与真机证据
- 用户：「凯尔希的渲染还是有问题，**他的眼睛位置也不对**」。
- 真机台账：`眼睛组合`(mesh) `rd=[1912,541,305,253]`、**`sc=[1,1]`**；
  `右眼上眼睑`(mesh) `rd=[2512,568,80,47]`、`sc=[0.693,0.693]`；`左眼皮`(layer) `rd=[2306,594,132,90]`。
  ⇒ 眼珠（1912..2217）与眼皮（2306..2438 / 2512..2592）在 x 上**完全不重叠**（最近也差 90px，最远 680px）。

#### 根因：`?eyehack` 在**蒙皮路径**上覆写了 `layer.scale`
`applyRenderConfig` 的长条眼窗分支（旧 `:1924`）写的是
```js
l.size = [es[0], es[1]]; l.scale = [1, 1, l.scale[2] || 1]   // es 缺省 [405,120]
```
这行是按**四边形层** `w = size × scale` 的语义写的，但 `眼睛组合`（id 115）是 **puppet 蒙皮层**：
1. **蒙皮路径根本不读 `size` / `uvRect`**。`renderMeshLayer`（`:5472`）的入参只有
   `(layer, mesh, gBonesArr, boneCount, originXY, scaleXY, projWH, tex, opts2)`，体内只读 `mesh`/`gBones`/`originXY`/`scaleXY`/`projWH`/`tex`/`opts2.noCenterComp`；
   源码切片断言（B5）实测：体内 **0 次** `uvRect`、**0 次** `layer.size`。
   `layer.uvRect` 的消费点只有 `:6209/:6210`（`compositeLayer`，四边形路径）与 `localQuadVertsUV`（`:4802`）。
   ⇒ **"长条眼窗"这个 hack 在蒙皮层上从来没生效**，唯一真正落地的是下面这条破坏。
2. **`layer.scale` 就是蒙皮几何的 `u_Scale`**。`demo.html:3521-3522` 取 `sx = layer.scale[0], sy = layer.scale[1]` →
   `scaleXY = [sx, ySign*sy]` → `renderMeshLayer` 的 `u_Scale`，顶点着色器 `wpos = u_Origin + u_Scale · skinned_v`。
   `眼睛组合` 对象**没有 `scale` 键**，父链 `115 → 91 → 475` 解析出的世界 scale = **0.69297**
   （同门 sibling `右眼上眼睑` 也是 0.69297，台账 `sc` 已证）。覆写成 1 ⇒
   **网格放大 1/0.69297 = 1.4431 倍**；又因该 MDL 的 bbox 中心 `(−848.68, −19.66)` 离原点很远，
   实绘框的 x 中心位移 = `(scale_new − scale_old) × bboxCenterX = (−0.30703) × (−848.68) = +260.57px`
   （方向朝眼皮，但只补回 260.57 而不是全部 307.68）。

#### 量化（设计坐标 3840×2160 y-down；rect = `origin + scale ⊙ bbox`，与 demo.html:3545 台账同式）

| | 修复前 | 修复后 | 官方标定 `refrender` |
|---|---|---|---|
| `眼睛组合` 实绘 rect | x=[1911.67, 2216.67] y=[541.41, 794.65] | **x=[2219.06, 2430.42] y=[574.25, 749.74]** | 115: x=[2263.70, 2433.48] y=[447.35, 725.23] |
| `眼睛组合` 中心 | (2064.17, 668.03) | **(2324.74, 662.00)** | (2348.59, 586.29) |
| `眼睛组合` 尺寸 | 305.00 × 253.24 | **211.40 × 175.47** | 169.78 × 277.88 |
| `左眼皮`(layer) 中心 x | 2371.85（`rd=[2306,594,132,90]`） | 同 | 111 中心 x = 2371.86 |
| `右眼上眼睑`(**mesh↔mesh 同口径**) 中心 x | 2552.61（`rd=[2512,568,80,47]`） | 同 | 67 中心 x = 2553.30 |
| **Δ中心(眼珠 − 左眼皮)** | **−307.68px** | **−47.11px** | −23.27px |
| **Δ中心(眼珠 − 右眼上眼睑)** | **−488.44px** | **−227.87px** | −204.72px |
| x 区间重叠(眼珠 ∩ 左眼皮) | **0px**（−89.7） | **124.05px** | — |
| 与标定 115 的中心差 Δc | (−284.42, +81.74) | **(−23.85, +75.71)** | — |

#### 可判定的期望位置（断言，含依据）
- **依据**：同一个模型里眼珠（`眼睛组合`）与**左眼皮**是同侧眼的成对部件，官方标定里两者 rect 中心只差
  `2348.59 − 2371.86 = −23.27px` ⇒ 判据取 **`|Δ中心(眼珠 − 左眼皮)| ≤ 50px`**（≈2× 官方差值，留口径余量）。
- ⚠ **纠正任务书里的一个期望**：「眼珠 bbox 中心应落在眼睑 bbox 内、误差 ≤20px」**不成立**，别用它当判据：
  官方标定里眼珠中心与 **`右眼上眼睑`** 中心相距 **204.7px**（右眼上睑是"右眼"的上睑，本来就不在眼珠框里；
  两者 x 区间在官方画面里也不重叠）。正确做法是**同口径 + 与官方同一差值对拍**（见上表两行 Δ中心）。
  测试里两条都写了：`B3 修复后 |Δ中心(眼珠−左眼皮)| = 47.11px ≤ 50px`、
  `B3 同口径 修复后 Δ中心(眼珠−右眼上眼睑) = −227.87 与官方 −204.72 相差 23.15px ≤ 25px`。
- **y 方向不具判别力**：scale 只把 y 中心挪了 6.03px（668.03 → 662.00，因 bboxCenterY = −19.66 ≈ 0），
  所以本 bug 是**纯 x 向错位**；测试只断言 y 带重叠 ≥40px，不做包含断言。
- 修复后残留的 `Δc = (−23.85, +75.71)` vs 标定与**门禁 `layer-rect-kal` 早就记的 `Δc=(-24,76)` 同源**
  （该工具标注 `⚠标定不可达(网格对角线 275px < 标定 278px)`）⇒ 是既有的 **mesh-bbox vs author-size 框口径分叉**
  （P-58 KI-10 同类），**不是位移 bug**，不在本次范围。

#### 改法（`core/we-scene-bundle.js:1930-1945`）
不改四边形路径的任何观感：把 `es` **反向折进 `size`**（`l.size = [es[0]/sx, es[1]/sy]` ⇒ `size × scale ≡ es`），
**不再碰 `l.scale`**。这样：
- 蒙皮路径：`layer.scale` 保持 authored 0.69297 ⇒ 眼珠回到正确比例/位置（Δt 见上表）。
- 四边形路径：`w = size × scale` 仍是 `405 × 120`，`drawGuard` / `isFullCanvasLayer` / `renderLayer` FBO 尺寸
  **全部读同一乘积** ⇒ 与旧行为**逐位相同**（断言 B2 钉住 405×120）。
- `scale` 退化（0/NaN）时保留旧写法兜底。

#### 回退开关
- `?eyehack=legacy` —— 恢复"覆写 `l.scale=[1,1]`"的旧口径（真机 A/B / 回退）。
- `?eyehack=0` —— 原有开关，完全不套 hack（层保持 authored `scale`，且不设 `uvRect`）。
- `opts.eyeHackLegacy` —— 程序化入口（测试用）。

#### 顺带（同文件注释修正，不改代码）
`core/we-scene-bundle.js:5473-5477` 那段"默认沿用开启以便逐壁纸对照"是**过期注释**：真正的默认在 `:3879`
`MCC_ENABLED`（**默认 false**，仅 `?mcc=1` 才开；README 第 24 行也写"关"）。已把注释改写为
"补偿默认关闭（见 `:3879`），`?mcc=1` 才开；下方 `(−509,+593)` 是**旧默认时期**的测量，不代表当前默认"。
**`mcc` 不是本次两条 bug 的原因**（默认关；`?meshsize` 的 `noCenterComp` 只是二次抑制）。

---

### 测试与门禁
- 新增 **`p76-parallax-eye-test.mjs`**（**64 断言**，~2s，真包 3719111841 + mock-GL 真实 `render()`）：
  - **A 段（问题 1，40 条）**：六种开关组合走真实 `compositeLayer` 取实绘矩形（判"覆盖整屏 0..3840/0..2160 ≤1px 出血"）；
    **反证**：双回退必须复现 `[1431,-2519,...]` / 左侧漏 >1000px；`alignment` 直方图全 center + offset=(0,0)；
    视差位移世界像素 0.386/0.919 与放大后 1639.38/2341.03 的双向断言；鼠标满偏上限 <40px（排除量级）；
    用户属性 `background=0` ⇒ `背景暗色 vis=0`；"可见 + 四边形路径 + depth≠0" 的层**恰好 1 个 = 背景正常**。
  - **B 段（问题 2，24 条）**：`parseScene` 的 authored scale 0.69297 vs `applyRenderConfig` 的 1（根因）；
    修复后必须等于 sibling `右眼上眼睑` 的 scale；四边形路径 `size×scale ≡ 405×120` 逐位不变；
    rect 中心量化 + 两条 Δ 判据（≤50px / 与官方差值 ≤25px）+ 反证（修复前 307.68 / 488.44）；
    修复前公式**逐位复现真机台账 `rd=[1912,541,305,253]`**；两个回退开关；
    **B5 源码切片**：`renderMeshLayer` 体内 0 次 `uvRect`、0 次 `layer.size`（证明"长条眼窗在蒙皮路径无消费点"）。
- 注册进 `run-all-tests.sh`（`add "p76-parallax-eye" …`）。
- `README-DIAGNOSTICS.md`：新增 `parspace` / `paroff` 两行；`eyehack` 行补 `legacy` 值与 P-76 说明。
  `node diag-flag-check.mjs` ⇒ **代码 103 开关 == README 主表 103 行，0 差异**。

### P-76 追加 A：`?bones=` 逐骨探针补 **镜像（det<0）与两轴 scale 符号**（父 agent 追加项）

**为什么必须加**：`[ang,tx,ty]` 是**反解**出来的，而**一个带负行列式的矩阵（镜像）解出来的角度可以完全正常**
⇒ "180 帧 0 次 angle flip、跨帧最大 Δ角 0.036 rad"这条**只能排除"角度反号/长边插值"，排除不了"眉毛翻转是镜像"**。
补上 det 通道才能一次定案。

**改法**（`core/we-scene-bundle.js` 的 `__dumpBones`）：
- 每根骨在 `[ang,tx,ty]` **之后追加** `detS, sxS, syS, |sx|, |sy|`（索引 3..7），**既有前缀顺序逐位不变**
  ⇒ `demo.html` 的 payload 与 `projection-y-test` 的 `f0[b][0..2]` 断言不受影响（实测 49/0 未变）。
  2×2 线性部分（**行主序** `pose[0..2]`=第 0 行）`[[m00,m01],[m10,m11]] = R(θ)·diag(sx,sy)`
  ⇒ `det = sx·sy`、`|sx| = hypot(m00,m10)`、`|sy| = hypot(m01,m11)`。
  由于 `(θ,sx,sy)` 与 `(θ+π,−sx,−sy)` 给出**同一矩阵**，这里只报三个**唯一可读**的量：
  `detS = sign(det)`、`sxS = sign(m00)`、`syS = sign(m11)`。
- `flips` 判据**扩一条**：`det` 符号跨帧翻转也记（`{b, det:1, from, to}`），与角度判据并列。
- `globalThis.__mpwBones.mirror` = 本帧 `det<0` 的骨号数组（直接可读可断言）。
- `[bones]` 摘要行新增两节：`| 镜像骨(det<0): … | det跨帧翻转: …`。
- 默认关时仍**一个字段都不写**（`__mpwBones === undefined` 契约保持）；只对点名那一层生效。

**判定规则（这次实测出来的、值得写下来的一条）**：
`|Δang| ≈ π` **且 det 翻转** ⇒ 镜像；`|Δang| ≈ π` 且 **det 不变** ⇒ 真的转了 180°。
（我一开始把断言写成"镜像不会引起角度跳变"，**错了** —— `diag(−1,1,1)` 让 `m00` 由 +1→−1，
`ang=atan2(m10,m00)` 同样跳 π。这正是"角度通道分不出镜像"的原因。）

**断言**（进 `p76-parallax-eye-test.mjs` C 段，12 条）：默认不写 ✓ / 正常姿势（bindWorld 全 det=+1）mirror 空 ✓ /
桩姿势 `diag(−1,1,1)` ⇒ b0 进 mirror 且 `detS=−1, sxS=−1, syS=+1` ✓ / 其它 13 根骨不误记 ✓ /
纯 180° `diag(−1,−1)` ⇒ `detS=+1` mirror 空（与镜像正交）✓ / det 跨帧翻转记成 `{b:0,det:1}` ✓ /
既有 `[ang,tx,ty]` 前缀 == bindWorld 极坐标 maxErr<1e-4 ✓。

**验收（请用户做一次即可）**：刷新 `http://127.0.0.1:8899/?id=3554161528&bones=人物`，
上报里 `window.__mpwBones.frames[*].bones[b][3]` 即 `detS`，`mirror` 即镜像骨列表；
`#log` 的 `[bones]` 行也会打印「镜像骨(det<0)」与「det跨帧翻转」。

### P-76 追加 B：用户属性绑定 `volume` / `zoom`（父 agent 追加项）

**先扫语料（判据来自场景本体，不是猜）**：
- **`volume` 28 处 / 11 个不同包**（dd 根 8 包 11 处），**全部在 `sound` 对象上**（名字都是 `.mp3`/`.flac`），
  值形态 = `0..1 的数` 或 `{user:"newproperty45"|"bgm"|…, value}`。
- **`zoom` 14 处 / 7 个不同包**（dd 根 4 包 4 处），**全部在 `camera:"default"` 的相机对象上**（`name` 为空），
  值形态 = `{user:"newproperty30", value:1}`（6 包）或 `{animation:…, value:4.5}`（hina 3554161528）。
- 包自带的官方语义证据：`newproperty30` 的定义是 **slider「🔘镜头大小 / Lens size」，min 0.1 / max 2 / 默认 1**。

**该第三方参考实现所实现的语义**（`wer-ref/src/backend/scene/internal/parser/WPSceneParser.cpp`，GPL-2.0-only，仅行为对照、未取代码）：
- `IsCameraLayerRuntimeProperty`（`:882-885`）= `visible|origin|angles|zoom|fov`；
  `:7345-7355`：**"Camera zoom/fov 不是普通可绘层属性，只对相机层扫描、走 camera target kind 路由"**
  ⇒ 给 `zoom`/`fov` 各注册 **Property + Animation + Script** 三种绑定。
- `:6119-6135`：相机层**无条件注册**（`camera_layer.zoom = empty_obj.zoom` + `UpdateActiveCameraLayer()`），
  **没有"origin 必须是关键帧动画"这个条件** —— 我们的 `cameraNode.active = !!origin.animation` 是收窄过的。
- `volume`：逐 sound 层音量（`WPSoundParser.cpp` / `ApplySoundPropertyValue → SetStreamVolume`）。

**结论与改法**：
1. **`volume` —— 本文件无落点，明确不接**。`core/we-scene-bundle.js` 的**非注释代码**里
   `volume`/`gain`/`setVolume` **零命中**（断言 D5 用去注释后统计证明），音频播放整条链在宿主：
   `demo.html:2051-2091` 的 `soundLayerVolumeBinding` / `currentAudioVolume` + `:2176-2181` 的 4Hz
   `updateSceneAudioVolume`，读的是 demo 自己的 `sceneObj.objects[].volume` 与 `window.__mpwUserProps`，
   **不经过本文件的 layer 模型**。在这里加 `volume` 绑定只会写进一个没人读的字段 = **假开关**，故不加
   （`USER_BIND_KEYS` 保持不含 `volume`，并有断言钉住）。
   → **"改了完全不变"的真因在宿主/用法侧**：音频流只在 `?audio=1` 时创建（`demo.html` 的
   `AUDIO_ENABLED`），不带该参数时根本没有 `<audio>` 元素可调音量。**需 demo 侧确认/文档化**（见交接）。
2. **`zoom` —— 有落点，接上（走官方同款"相机目标"路由，不混进"可绘层字段"表）**：
   - `parseScene` 的 `cameraNode` 增 `zoomBinding`（`{user,value}` 原文）与 `zoomFromUser`（解析结果，初值 null）。
   - `applyUserProperties` 末尾按**相机节点**单独解析（幂等；属性缺失/被 condition 门控 ⇒ null），
     写 `scene.cameraNode.zoomFromUser` —— 与官方"zoom 不属可绘层属性"一致，**不**把 `zoom` 塞进 `USER_BIND_KEYS`。
   - `renderScene`：当相机层不是"origin 关键帧"激活、而 `zoomFromUser` 有值且 **≠1** 时，
     以 `{x:0, y:0, zoom}`（**平移恒等**）交给 `buildCamera` ⇒ `framedW/H /= zoom`。
   - **为什么只接 zoom、不接 origin**：语料 6/7 包的 `origin` 是**逐属性脚本**
     （`{script:…, value:"2434.38477 725.25134 500"}`），静态基值是编辑器残留 —— 实测按它平移取景会偏
     **2434px**（P-69 因此明确保持 inert）。`zoom` 则是一个真实的面板滑块，默认 1 时 `framed/1` 与今天**逐位相同**。
   - **量化**：真包 `3326873240`，`?props=newproperty30=1.6` ⇒ mock-GL 真实 `renderScene` 下**每层**
     mvp 的 `m0/m5` 比值 = **1.6000（偏差 1.2e-7）**；默认值 1 与"无属性表"投影**逐位相同（偏差 0）**。

3. **顺带查出的真问题（未定，见下）**：`camPose` 在 P-76 之前**从未交给 `buildCamera`** ——
   `buildCamera` 读 `opts.cameraPose`，而全仓库只有 `camera-node-test.mjs` 传它（`demo.html` 不传）
   ⇒ **相机层的 origin/zoom 关键帧动画与 `fov` 在真实渲染路径里一直没有生效**，`?cam=node` 同理。
   门禁的 `camera-node` 项只直接测 `buildCamera`，所以抓不到"没接线"。

**断言**（进 `p76-parallax-eye-test.mjs` D 段，21 条）：语料不变量（volume 全在 sound / zoom 全在 camera）/
`newproperty30` 定义 / `zoomFromUser` 1→1.6 且无 props 时 null / 非法值 ≤0 不写入 /
**端到端投影比 1.6 与默认零回归** / hina 的 animation 形态不受影响 / `volume` 无落点（去注释零命中 + 键表不含）。

### 取证工具（只读，非门禁项）
- **`P76-gpu-rect-probe.mjs`** —— 用 mock-GL 走**真实** `renderScene`/`compositeLayer`，按 `demo.html:3588-3626`
  + `mpwLedgerYDown` 的口径打印每层实绘矩形并与 `refrender-<id>.json` 对账。
  **它是把真机现象在本地复现出来的关键**：改前 `背景正常` = `[1431,-2519,4244,2547]`，真机台账 `[1430,-2518,4246,2546]`（差 ≤2px）。
  `P76_PARON=1` 可切"视差开"。用法：`node P76-gpu-rect-probe.mjs 3719111841`。
- **`P76-kaltsit-probe.mjs`** —— 打印 `alignment` 直方图 / 视差位移上下限 / 各蒙皮层的 MDL bbox、
  骨骼 bind 世界位姿、bind 位姿实绘矩形；眼睛那条的 bbox 中心 `(−848.68, −19.66)` 就是它测出来的。
  用法：`node P76-kaltsit-probe.mjs`。
- **本地复现的 3 个坑**（写给下一个人，我自己踩了）：
  1. `layer-rect-check.mjs` **不调用 `applyRenderConfig`** ⇒ 它看不到 `?eyehack`/`refrender` 这类
     "render config 期" 的改动 —— 眼睛那条 bug 因此在门禁里一直隐身（它的 `Δc=(-24,76)` 已是修复后的值）。
     要复现渲染路径必须走 `applyRenderConfig(scene, { sceneId, … })` + mock-GL。
  2. mock-GL 探针必须**不传 `refrender`**：`anchor:'refcenter'` 会按标定表把 `origin` 摆到"官方实绘中心"，
     直接把要查的位移 bug 掩盖掉（`render-audit.mjs` 就是传的）。
  3. **`package-matrix` 归因必须 A/B**：把改动回退后的 bundle 放到**真实文件**（不能用 symlink ——
     Node ESM 按 realpath 解析，symlink 会指回原目录，A/B 会变成"自己跟自己比"）。
     我这次就是靠它证明 hina `drawnLayers 16→15` **与本补丁无关**（107 包审计逐键零差异；
     该项是 P-69 引入、由并行的 P-75f 在 06:35 补上 `EXPLAINED_BASE_DROPS` 说明的**既有**下降）。

### 交接：需要 `demo.html`（**不是我的文件**）配合的清单
1. **`?ln=26` / `?ln=<眼睛组合>` 逐层上报**：现在 `layers[]` 已带 `origin`/`scale`，但 `scale` 没有单独上报字段；
   要一眼看出"某层 scale 被 hack 改了"，建议 `layers[]` 增 `sc:[sx,sy]`（台账里已有 `sc` 但只对进台账的层）。
2. **`layerHealth[].rect` 对四边形层的 y 口径**（`2160 − y_down`）**仍未修**：本次 y 我只能用 `mvp` 反解来规避。
   建议按 `mpwLedgerYDown` 同一函数统一（本次两条结论都不依赖它，但下一个人会被它带偏）。
3. 若愿意，把 `parallaxSpaceLegacy`/`parallaxOffLegacy`/`eyeHackLegacy` 三个 opts 从 URL 显式传给 bundle
   （现在 bundle 自己读 `location.search`，所以 `?parspace=legacy` 等**不改 demo 也能用**；显式传只是更可读）。
4. 真机验收脚本建议加一条：截图后取 `(0, 540)` 像素，断言**不等于页面灰 `178,178,178`**（本次 bug 的自动判据）。

### 未定项
- **相机节点完整通路（`camPose` → `buildCamera`）仍是断的**（P-76 追加 A/B 查出来的）：`opts.cameraPose`
  在生产路径里**从没人传**（只有 `camera-node-test.mjs` 传），所以相机层的 **origin/zoom 关键帧动画、
  与 zoom 的父子联动（hina 的 `zoom.animation.options.children=[{key:"origin"}]` / `origin.animation.options.parent={key:"zoom"}`）、
  `fov`** 在真机上从未生效。实测一开就是大幅改构图（hina：origin x∈[−1319,68] y∈[−710,203]、zoom∈[1,4.5]）——
  **属产品决策**，P-76 只接了"用户属性绑定的 zoom"这一安全子集（平移恒等、默认 1 逐位不变）。
  **缺什么证据**：① 第三方参考实现 `UpdateActiveCameraLayer` 选"哪个相机层生效"的规则（多相机层时）需要再读 wer-ref（**只读行为、不取代码**）
  `Scene.cpp` 的实现；② 真机 A/B 一次（`?cam=node` 在 hina 上开关各截图一张）确认构图变化是否与官方 preview 一致；
  ③ 语料 6 包的 `origin:{script:…}` 是**逐属性脚本**，是否要连同"逐属性脚本求值"一起做，需先定范围。
- **`volume` 的"改了完全不变"**：本文件无落点（已证），宿主 `demo.html` 侧实现是完整的
  （`soundLayerVolumeBinding`/`currentAudioVolume`/4Hz `updateSceneAudioVolume`），但音频流只在
  **`?audio=1`** 时创建（`AUDIO_ENABLED`）。**缺什么证据**：一次真机上报（`?audio=1` 下拖 BGM 滑块 + 手动上报），
  看 `[we-scene] ① sound 层已接入（N 条…）` 是否出现、以及拖动前后 `el.volume` 是否变 —— 这属于 demo/宿主侧，
  不在我的文件边界内，故只做"在本文件不接 + 给出真因假设"。
- **眼睛 y 方向的残留 75.71px**（标定 115 的 y 中心 586.29 vs 我们 662.00）：本次已排除"scale 覆写"这条，
  剩下的是 `眼睛组合` 的 **authored `size=584×759` / `cropoffset=564,494.5` 与网格 bbox 305×253 之间的口径分叉**
  （官方标定框对角 278px > 网格对角 275px ⇒ 官方那个框**不可能**由本网格的任何仿射摆位得到）。
  要判定它是否真是"官方按 cropoffset 裁窗"还需要：官方对 `眼睛组合` 的 **UV/裁窗**证据
  （`?meshsize=crop` 真机 A/B 一次 + 官方 preview 单帧像素比对）。**未定，缺这两样证据。**
- **`uvRect` 在蒙皮层上应当怎么办**：本次只做到"不再造成破坏"。要让"长条眼窗"在蒙皮层上也生效，
  需要把 `uvRect` 传进 `MESH_VS`（改 `a_TexCoord` 的映射）—— 那是**新增能力**，牵动蒙皮着色器与
  `?vflip`/`?qflip` 交叉口径，且当前默认蒙皮路径下官方观感已经对（`右眼上眼睑`/`左耳朵1`/`主体` 与标定 ≤2px），
  故本次不做。**未定：是否值得为这个 hack 改蒙皮 UV。**
- **`?paroff=legacy` 与 `?parallax=1` 的组合语义**：`parallax=1` 时视差开，两种 `paroff` 口径结果相同；
  但 `parallax` 不写 + `paroff=legacy` 时会保留一个 `(o − cam) ∘ depth × amount` 的常量项
  （对 `背景正常` 只 0.386px，对偏中心大层可达几十 px）。这是**旧口径的原样保留**，不是新判定，故未定"是否也算 bug"。

---

---

---

## P-77（2026-09-15，渲染器侧子任务）用户第 4 项「一页多实例」：`?ids=` + 点选激活（其余**完全暂停**）+ 上限 4 + 显式释放 + `/report.instances`

**口径**：`docs/MULTI-INSTANCE-DESIGN.md`（用户 2026-09-15 已拍板：① 点选激活、其余完全暂停 ⇒ 默认 `?inactive=pause`；
② 实例上限默认 **4**，超出**不创建 WebGL 上下文**、占位块写明原因）。**未另起一套**：仍是"N 个 canvas = N 个
独立 renderer（各自 context）"，由一个调度器 + 一套预算统管（不采用"单 context + N viewport"）。

### 改了什么（文件 / 行号段，行号为改动后）
| 位置 | 内容 |
| --- | --- |
| **新增** `elysia/multi-instance.js`（~380 行） | 调度/布局/预算/释放/诊断层，**纯逻辑 + 依赖注入**（假 DOM / 桩 rAF / 桩 boot 可整体单测）：`mpwMultiParseIds` / `mpwMultiParseOpts` / `mpwMultiBudget` / `mpwLoseContext` / `createMultiInstanceHost` |
| **新增** `multi-instance-test.mjs`（87 断言）、`canvas-size-test.mjs`（11 断言） | 见下"断言" |
| `demo.html:874-880` | import 新模块 |
| `demo.html:895-925` | 多实例路由：`MPW_MULTI_Q` / 六开关正则登记 / `MPW_MULTI_IDS`（**null = 单实例**）/ `MPW_MULTI_OPTS` / `MPW_MULTI_BUDGET` / `mpwMultiHost` |
| `demo.html:931-940` | `gl` 只在**单实例**时于 `#sc` 上创建（多实例每格自建，≤ maxinst） |
| `demo.html:953` | 删掉模块级 `renderer/scene/pkg/textures/rafId/renderBusy`（已全部移入 `bootInstance` 作用域，保留只会让人误以为共享） |
| `demo.html:1012-1052` | **第 1 步（纯重构）**：`async function boot()` → `async function bootInstance(inst)` + 实例作用域 prologue（`cv/gl/id/logf/fpsEl` + `renderer/scene/pkg/textures/rafId/renderBusy` 影子绑定、`PAGE`/`SCHEDULED`/`MPW_WRITE_GLOBALS`/`mpwDisposed`/`mpwFirstFrameDone`/`inst.ctx`）；**原 boot() 体 3784 非空行逐行未动**（已用脚本比对：除 prologue 与搬运块外逐行相同） |
| `demo.html:1053-1290`（原 1011-1293 搬入） | `perfAutoQ` / `TEX_BUDGET` / `__texBytesTotal` / `isNonCriticalLayer` / `loadTex` / `particleMaterialCandidates` / `loadScene` 移进 `bootInstance`（实例作用域：每实例独立纹理表与字节预算） |
| `demo.html` 各页级块（`typeof PAGE === 'undefined' \|\| PAGE` 门，共 12 处） | autorundone 页、window error/unhandledrejection 监听、`type=video` 路由、`?video=`、`pkgpath/pkgurl` 单包覆盖、属性面板 + `window.__mpwProps`、逐层调试 UI（角标/按钮/键鼠）、🔊 音频面板（早/晚两次）、自动上报 + 台账 + 手动上报按钮、`?selfcheck`、perf 面板、`__mpwDebug` 图层清单、`?thumbpost` 缩略图。多实例时这些**只在第一个格子（primary）**跑 |
| `demo.html:3898-3920` | 上下文丢失计数改为**每实例一份**（`inst.ctx`），`window.__mpwCtx` 仍由 primary 写 |
| `demo.html:4174` 前后 | 画布档：既有 `cv.width = __resTier.width; …` **两行原样保留**（video-quality-test 逐字钉住），其后新增降档分支（`inst.res` 且用户没给 `?res=` → 720p） |
| `demo.html:3714` 附近 | 粒子预算：`particleBudget: inst.particleBudget`（多实例= `multi-idle` 档 = bundle normal × 0.25：60/300/4/100/60；单实例不传该键 ⇒ 逐位不变） |
| `demo.html:4487/4530` | 帧循环：`if (mpwDisposed) return`；`window.__mpwFps/__mpwFrameMsP50` 只在 primary 写；`__first` 改用每实例 `mpwFirstFrameDone` |
| `demo.html:4681`（帧尾）与 `5176`（函数尾） | `if (!SCHEDULED) rafId = requestAnimationFrame(frame)`：**单实例逐字不变**，多实例不自排 ⇒ 由唯一调度器决定这一帧给谁跑 |
| `demo.html:5170-5186` | **第 5 步 释放**：`mpwHandle.dispose()` = `cancelAnimationFrame` + `mpwLoseContext(gl)`（`WEBGL_lose_context.loseContext()`）+ 停视频/撤销 blob URL + `textures.clear()` + 清 `renderer/scene/pkg` 引用 |
| `demo.html:5199-5230` | 多实例分支：`#sc` 让位、`mpwInstBoot`（每格取自己的 webgl2）、`createMultiInstanceHost({ ids, invalid, dupes, opts, budget, boot, onSnapshot, onState })`、`window.__mpwInstBudget`、启动日志、`observeVisibility()`、`start()` |
| `demo.html:4225` | `/report` payload：`if (mpwMultiHost) payload.instances = mpwMultiHost.reportInstances()`（**单实例时该键不存在**） |
| `demo.html:2033-2052` | P-78：`mpwEngineCanvasSize()`（见下） |
| `README-DIAGNOSTICS.md` ③ 表 | 登记 7 个开关：`ids` / `layout` / `maxinst` / `instfps` / `inactive` / `instlog` / `csz`（`diag-flag-check` 双向比对：代码 110 == 文档 110，0 差异） |
| `run-all-tests.sh:98-99` | 注册 `multi-instance`（87 断言 ~0.3s）与 `canvas-size`（11 断言，条件项） |

### 语义（与设计文档逐条对应）
- **状态机** `creating → active ⇄ idle → paused → disposed`；**同一时刻只有一个 active**（`selected` 唯一）；
  点画布/遮罩 = 选中，`Tab` 聚焦 + `Enter`/`Space` 也可选中；未选中格子盖"▶ 点击激活"遮罩并高亮选中态。
- **调度器**：**一个** rAF 循环；`tick()` 一帧最多推进 **1 个 active（+ 至多 1 个到期 idle，仅 `?inactive=idle`）**，
  其余记账为 `skipped`；`paused/creating/disposed` **0 帧**（根本不调用其 frame）。
- **可见性**：`IntersectionObserver`（滚出视口）+ `visibilitychange`（标签页隐藏）→ paused；恢复即回到 active/paused。
- **预算**：`maxinst` 默认 4（硬上限 8，超出按 8 计并记日志）；`maxinst ≥ 3` → 画布 720p（`?res=` 覆盖）+
  粒子 `multi-idle` 档，状态条标 **"已降档"**；超出上限的格子只有占位块（**不建 canvas ⇒ 不建上下文**）。
- **诊断**：`window.__mpwInstances = [{id,state,ctxLost,fps,pending,drawn,paused,reason}]`（8 键，设计文档口径）；
  既有单例 `__mpw*` 全局**不变**，多实例时把 active 实例的 fps/id 镜像到 `window.__mpwFps` / `window.__mpwInstActive`。
  日志默认只显示 active 实例（`?instlog=all` 全开、带 `[id]` 前缀；每实例环形 300 行）。

### 单实例"逐位不变"（红线）的证据
1. **纯重构可证**：脚本比对 `bootInstance` 体 vs 改动前 `boot()` 体 —— 去掉 prologue 与搬运块后
   **3784 非空行逐行相同**（`old body nonblank: 3784  new(stripped): 3784` → ✅ 逐行一致）。
2. **调用点**：无 `?ids=` 时 `bootInstance(MPW_PRIMARY_INST)` 直连，`inst` 字段**就是**模块级常量
   （`canvas: cv, gl, id, logEl: log, fpsEl, logf, primary: true`）；`mpwMultiHost` 恒为 `null`。
3. **门禁**：`demo-syntax` / `props-panel` / `video-quality` / `text-switches` / `time-variation` / `audio-panel` /
   `log-panel` / `script-tick` / `projection-y` / `camera-fillmode` / `mdla-walk` / `particle-presets` /
   `p74-particles` / `meshsize` / `hdr-predicate` / `fullscreen-recenter` / `diag-flags` / `docs-check`
   **19/19 PASS**（这些是钉住 demo.html 真源码切片/逐字字符串的既有项）。
4. **`instances` 键**：把 `demo.html:4225` 那行真源码切出来、单/多两种状态各跑一次 ⇒ 单实例 `!('instances' in payload)`。

### 需要别人配合（bundle / 其他会话）
1. **不需要 bundle 改动**（这是本任务的设计目标）。`createRenderer(cv, opts)` 已支持 `opts.particleBudget`
   （`tier` 可自定义）⇒ 多实例分档没有牵动 bundle。
2. **属性面板 / 🔊 音频面板 / 媒体集成 / 自动上报在多实例下只在第一个格子（primary）生效**
   —— 它们是页级单例（DOM id 唯一）。若要让它们跟随 active 实例，需要"面板可重绑 scene"的改造（本轮未做，见未定项）。
3. **`__mpwLedger` / `__mpwProps` / `__mpwDiag` 等台账类全局仍是 primary 实例的**（只镜像了 fps/id）；
   `/report` 的 `instances` 已有逐格状态，但**没有逐格 ledger**。要逐格台账需要把 ledger 采集做成每实例一份。
4. **真机验收**（用户在手机上）：`?ids=a,b,c,d`（选 4 个常用包）看 4 格是否都能装载、点击切换是否只跑一个、
   来回切 20 次后显存是否回落（`__mpwInstances[].state` + 任务管理器）。**本轮没有真机数据**。

### 未定项
- **多实例真机 FPS / 显存未测**：本机起不了 Chromium（headless 6 档全败，见 headless-shot.mjs 记录），
  所有多实例断言都是 Node 桩环境（假 DOM / 桩 rAF / 桩 boot）。真机数字（4 格 720p 下 active 的 fps、
  4 个上下文的总显存、来回切 20 次的显存曲线）**未测**。
- **格子比例**：按设计文档"先按 16:9 自适应"实现（`aspect-ratio:16/9`）；"固定 16:9 vs 按视口自适应"仍未定。
- **"全部暂停/全部继续"总开关**：未做（设计文档 §5 说可先不做）。
- **面板/上报跟随 active 实例**：未做（见"需要配合"第 2、3 条）。
- **`?inactive=idle` 的 idle 档真机收益**：未验证（用户口径是"完全暂停"，idle 只是预留档）。

---

## P-78（2026-09-15，渲染器侧子任务·追加）`engine.canvasSize` 口径：两宿主不同源，但**它不是"12 层不上屏"的原因**（假设被真包复现证伪）

**任务来源**：父 agent 追加（第 3 项"日期时间只能渲染出秒 / 12 层不上屏"）。假设：
`demo.html` 传**渲染分辨率** `cv.width/height`，而 `elysia/we-renderer/core.js:562-569`（lwe 移植）传
**场景正交尺寸**并注释"engine.canvasSize = 场景正交尺寸 (正交场景坐标, 非渲染分辨率)" ⇒ 官方语义是后者，demo 这个大概率错。

**做了什么**（`demo.html:2033-2052` + `:2280`）：把口径集中到 `mpwEngineCanvasSize()`。
- **默认保持现状**（`{x: cv.width, y: cv.height}`）⇒ 无 `?csz=` 时**逐位不变**；
- 新增 `?csz=ortho` 切到场景正交尺寸（读 `scene.general.orthogonalprojection.width/height`，缺省回退画布）
  供真机 A/B（`?id=3327063360&csz=ortho` 与官方对照后再决定是否翻默认）。
- 登记 `README-DIAGNOSTICS.md` ③ 表；`canvas-size-test.mjs` 11 断言（真包复现 + 真源码接线）。

**关键测量（真包 3327063360，真机 userProps `x=-0.617,y=-0.548,x1=-0.665,y2=-0.23`，`node canvas-size-test.mjs`）**：
同一脚本（`value.x = scriptProperties.x * engine.canvasSize.x`）、同一 userProps，只换 canvasSize：

| 层（脚本驱动） | 现状口径 1920×1080 | 正交口径 3840×2160 | 真机上报台账 |
| --- | --- | --- | --- |
| Clock#394/639/8183/7186 | **(1828.5, 365.2)** | (551.7, 613.6) | `(1829,365)` **逐位相同** |
| Date#2894/6259/4786/286 | (2261.8, 887.8) | (3221.8, 347.8) | — |
| D a y#6404/1509/1140/278 | **(1432.4, 600)** | (247.7, 1191.9) | `(1432,600)` **逐位相同** |

⇒ **两种口径下这 12 层（+Clock Container/#653）全部落在画布 0..3840 / 0..2160 内**（实绘矩形与设计画布有交集）。
现状口径的落点还与真机台账**逐位相同**。所以"12 层不上屏"**不是** canvasSize 口径造成的
——"跑出画布"这条不成立，真正嫌疑回到 `docs/RENDER-MISSING-LAYERS-RECON.md` §2.3.5 的
**②效果链（每层 2 个效果：blurprecise + pulse）** 与 **③可见性级联（父层 alpha/动画）**。
翻默认只会在**无凭据**的情况下改变文字落点（Clock/Date/D a y 三组整体位移），故**不翻**。

**自我纠错（写下来防复现）**：本轮第一版测量得到"改后 D a y 落回画布内、改前跑出画布"的结论是**错的** ——
那次把 `scene.json` 对象**跨两轮复用**，脚本已写脏 origin，第二轮 `snapshotAuthoredOrigins` 抓到的"基线"
其实是上一轮的结果，于是增量被算成两倍。`canvas-size-test.mjs` 现在**每轮重新 `JSON.parse` 一份干净场景**，
并把两种口径的落点都写成断言。（教训与 P-75g②同源：复核要针对数字，且要盯住"输入是不是干净的"。）

**未定 / 缺什么证据**：
- 官方到底把这三组文字画在哪儿：**缺**官方预览对照（该包的 preview 缩略图是带水印的宣传图、不含时钟，
  recon §2.3.3 已记）；要定就得真机 `?csz=ortho` 与官方预览（若用户能在 WE 里打开原壁纸）逐像素比。
- 12 层不上屏的真因（效果链 / 可见性）：**未验证**，需要真机 `?id=3327063360&ln=29` 与 `&nofx=1` 的两次隔离图
  （recon §2.3.5 的"最小操作"）。本轮**只**排除了 canvasSize 这一条。

### P-77 附加：单实例"逐位不变"的**可复核**做法
纯重构（第 1 步）的证据是"搬移前后逐行比对"。因为本目录**不是 git 仓库**，比对基线不能靠 git 取，
故把改动前的 `demo.html` 留了一份 `demo.html.bak-p77-prep`（与既有 `demo.html.bak-weralign` / `.bak-mdla` /
`.bak-skin` 同一惯例）。复核方式（把两侧的 boot 体取出来逐行比）：

```bash
cd "$MPW_ROOT/we-scene-demo"
node -e '
const fs=require("fs");
const oldL=fs.readFileSync("demo.html.bak-p77-prep","utf8").split("\n");
const newL=fs.readFileSync("demo.html","utf8").split("\n");
const oldBody=oldL.slice(1295,5085);                       // 旧 boot() 体
const blockOld=oldL.slice(1010,1293);                      // 搬进 bootInstance 的装载辅助块
const s=newL.findIndex(l=>/^async function bootInstance\(inst\) \{/.test(l));
const e=newL.findIndex((l,i)=>i>s && /^\}$/.test(l) && /rafId = requestAnimationFrame\(frame\);/.test(newL[i-1]));
const nb=newL.slice(s+1,e);
const ps=nb.findIndex(l=>/^  const cv = inst\.canvas/.test(l));
const stripped=nb.slice(0,ps-6).concat(nb.slice(ps+5+blockOld.length));   // 去掉 prologue 与搬运块
const norm=(a)=>a.filter(l=>l.trim()!=="");
const A=norm(oldBody),B=norm(stripped);
let d=-1;for(let i=0;i<Math.max(A.length,B.length);i++){if(A[i]!==B[i]){d=i;break}}
console.log(d<0?"✅ 逐行一致 "+A.length+" 行":"✗ 首处差异 @"+d+"\n"+JSON.stringify(A[d])+"\n"+JSON.stringify(B[d]));'
# 期望输出：✅ 逐行一致 3784 行（注意：P-78 之后 bootInstance 体内多了一处 canvasSize 相关改动，
# 该命令比对的是 P-77 那一刻的体；要复核 P-77 请先按 P-78 段把 mpwEngineCanvasSize 的两处还原）
```

---

## P-79（2026-09-15）`visual-diff-kal` 假红的**真根因**：跑完了但**不退出**（前两轮的推断都错了）

**现象**：本项在整条门禁里偶发 FAIL（rc=124 超时）。前两轮给过两个解释，**都是错的**：
- P-70 的"两个门禁并发互抢资源" ⇒ 加了互斥锁（锁本身有价值，但**不是**本项的原因）；
- P-70b 的"排在重项之后、内存压力换页" ⇒ 把本项**排到最前面**（顺序优化也有价值，同样**不是**原因）。

**真根因（本次用"跑完的日志 + 复现 + 进程状态"定案）**：
`node visual-diff.mjs --check --skip-render` **约 1/6 次**在做完全部工作、**已经打印出
`✓ --check：与基线一致（SSIM 0.4808 → 0.4808）`** 之后**不退出**：
进程停在 `futex_wait_queue`、**无子进程**、11 个 fd、状态 `S (sleeping)`；
`timeout` 到点判 rc=124 ⇒ 门禁记 FAIL，而它**打印的判定其实是成功的**。

**复现与排除（都有命令）**：
```
# 复现率：1/6 ~ 1/3
for i in $(seq 1 6); do timeout -k 2 12 bash -c 'node visual-diff.mjs --id 3719111841 --out "/tmp/vd/" --check --skip-render' >/dev/null 2>&1 || echo hang; done
# 排除：磁盘（余 82G）/ 内存（余 6G）/ UV_THREADPOOL_SIZE=1（1/6，无改善）/
#      退出钩子（脚本无任何 process.on，末尾就是 process.exit(0)）/ 工作量（不渲染时 1.5s 完成）
# 抓到挂住进程的状态：wchan=futex_wait_queue，State=S，子进程=0，fd=11
```
⇒ 判定为**本机 Node 运行时的退出期 quirk**（aarch64 + PROot 环境），不是被测代码的问题。

**修法**：新增 `visual-diff-kal.mjs` 包装器，**以显式成功标记为判定**：
- 见到 `✓ --check：与基线一致` ⇒ 宽限 3s 后强制收尾，**按成功上报**，并**打印一行 ⚠**
  （"已完成判定但子进程在 3s 内未退出 —— 已知退出期 quirk"）——**暴露**而不是静默；
- **没见到标记 ⇒ 一律如实上报子进程的 rc**（超时 124 / 失败非 0 都不放过）；
- 真回归走的是 `✗`/`process.exit(1)` 分支，**永远不会**命中这里的成功标记。

**为什么不直接放宽该门的超时**：那会把"真的挂住"也放过 —— 掩盖比误报更糟。

**验收**：包装器连跑 **8 次全 rc=0**，其中 1 次走的是 quirk 分支（打印了 ⚠ 且仍正确返回 0）；
`run-all-tests.sh` 改用它后，全量门禁 **PASS=58 / FAIL=0 / SKIP=1 / 59 项**。
（另修：P-70 那句 `--out "${MPW_VD_OUT:-/tmp/vd}/"` 实际上**在注册时就展开了**（`add` 用双引号），
所以 `MPW_VD_OUT` 从未生效、一直写共享 `/tmp/vd/` —— 注释已改正；本次包装器改从**环境变量读**，真生效了。）

## P-80（2026-09-15，渲染器侧子任务）`?bones=` 探针第二批：**会话累计极值 + 眨眼事件捕获** —— 把「眨眼到底走不走骨骼」一次问清

**触发它的真机数据**（用户第 1 项 `?bones=人物`，2026-09-15 14:01:46）：105 帧 / 3.01s / 32 骨，
每骨 8 元组 `(ang,tx,ty,detS,sxS,syS,|sx|,|sy|)` —— **`mirror` 空、`flips` 0 次、全骨 `detS=sxS=syS=1`**
⇒ **"眉毛左右翻转是镜像"这条已经可以定案排除**（P-76 追加 A 的目的达成）；
**但全骨 maxΔty 只有 14.9px、maxΔang 只有 0.31rad** ⇒ **这 3 秒里根本没有发生眨眼**。
所以骨骼侧的两个假设（长边插值 / 镜像）都排除了，**眨眼本身没被采到**。

**根因是探针的记账窗口，不是渲染**：`st.frames` 是 180 帧环形缓冲、`[bones]` 摘要行也只扫这个窗口
⇒ 极值一被后续帧冲掉就永久丢失，"这 3 秒没眨眼"会被误读成"眨眼不走骨骼"。

**改法**（`core/we-scene-bundle.js` 的 `__dumpBones`）：
1. **会话累计极值**（与 180 帧窗口解耦）：每骨维护 `ext[b] = [angMin,angMax,txMin,txMax,tyMin,tyMax]`
   （**32×6 个数**）+ `extT[b]`（对应极值出现的时刻），
   以及每骨 `dty[b] = max|Δty|`、`dang[b] = max|Δang|`（会话累计，眨眼主判据）。
2. **眨眼事件捕获**：单帧 `|Δty| ≥ BLINK_TY` 即记一条
   `{t, bone, dty, from, to, seg:[…], segLeft}`，`seg` 是**该帧前后各 5 帧**的 `[t,ty,ang,detS]`（共 11 条）。
   前 5 帧取自帧缓冲，后 5 帧由 `st.open` 的 pending 逐帧补齐 ⇒ **不依赖环形缓冲**（`blinks` 是独立数组，上限 20 条）。
3. **`summary`**：`{frames, sessionSec, maxDtyBone, maxDty, maxDtyAt, maxDangBone, maxDang, maxDangAt,
   blinkCount, blinkSamples, blinksPending, mirrorEver, blinkThreshold}` —— 不用自己扫 105×32 个元组。
   `blinkCount` 是**累计**计数（每次跳变 +1），`blinks` 数组只是被截到 20 条的**样本**（`blinkSamples`）
   ⇒ "到底有没有眨眼"永远不受样本上限影响（E4 断言：交替跳变 60 帧 ⇒ count=59 / samples=20）。
4. 新增阈值开关 **`?blinkty=<px>`（默认 25）**：真机上"没眨眼"的实测只有 14.9px，而眨眼时眼皮骨该动多少
   **我们没有实测值** ⇒ 阈值必须能现场调（`?blinkty=15` 更灵敏）。已登记 README 主表。
5. `[bones]` 摘要行加一节：`| 【会话累计】帧=N 时长=Ns maxΔty=b?@?s=?px(阈值25) maxΔang=b?=?rad 眨眼事件=N 镜像骨(会话内出现过)=…`。
6. 默认关时仍**一个字段都不写**（`__mpwBones === undefined` 契约保持）；只对点名那一层生效。

**量化（桩序列，进 `p76-parallax-eye-test.mjs` E 段 13 条）**：
- 平稳序列（12 帧，每帧 Δty=0.5px）⇒ `blinkCount=0`、`blinks=[]`（不误报）、`ext` 有 14×6 且 b0 的 ty 跨度 = 5.5。
- 桩序列（第 9 帧某骨 ty 单帧下移 **60px**）⇒ `blinkCount=1`、`blinks[0]={t:0.267, bone:0, dty:60, from:−4.92, to:−64.92}`、
  `seg` **11 条**（前 5 帧相同 + 恰好一次 −60 跳变 + 首尾差 −60）、`summary.maxDtyAt=0.267s`（= 跳变帧真实时刻 8/30）。
- 阈值确实生效：同一 60px 跳变在 `?blinkty=80` 下 `blinkCount=0`。
- 另一根骨**上行 40px** 同样被记（不只看下移）。
- 真机量级复核：32 骨 puppet 跑 40 帧 ⇒ `ext` 32×6、`dty/dang` 各 32、整包新增字段 **≈2.1 KB**（很小，可以进上报）。

**给用户的一句话（原样转达）**：
> **再刷新一次 `http://127.0.0.1:8899/?id=3554161528&bones=人物`，并且这次请盯着画面、等一次眨眼出现之后再点「立即上报」。**
> 如果等到眨眼后上报仍然 `blinkCount=0`（`[bones]` 行里「眨眼事件=0」），那就说明**眨眼根本不走骨骼**
> —— 这会直接指向"贴图 / UV 帧切换"那条假设，同样是决定性结论。

**回退**：本项是**只读探针**，不开 `?bones=` 时零字段零开销（E3 断言钉住）；不涉及任何渲染行为，无需回退开关。
`?blinkty=` 只在开 `?bones=` 时有意义。

**未定项**：① 阈值 25px 是否合适要等一次含眨眼的真机数据（`?blinkty` 已留现场可调）；
② 若 `blinkCount>0` 但 `detS` 全程为 +1，则"翻转/闪烁"发生在**骨骼之外**（子网格/UV/贴图帧），
需要 `?ln` 逐层 + 子网格隔离（P-44 A3）继续查；③ `blinks` 上限 20 条：眨眼密集时可能截断，
但 `summary.blinkCount` 用的是**累计**计数 `st.nBlinks`（不受上限影响），故不影响"有没有眨眼"的判定。

---

## P-81（2026-09-15，渲染器侧子任务）用户第 1 项最后一个缺口：文本层「WE 内置字体」回退链

### 背景（已查清，不是推断）
hina `3554161528` 的时钟层 **id398** 在 scene.json 里写的字体是 `fonts/Monofur-PK7og.ttf`，
而该包 **134 个条目里没有这个文件**（唯一的字体条目是 `fonts/千图马克手写体.ttf`，8127808 B；另一文本层
id1592 用它）。旧 `ensureTextFont` 只有一级：`lib.getEntry(pkg, fp)` ⇒ `null` ⇒ `textFontLoaded.add(fp)` 直接放弃
⇒ `textFontFamily` 返回 `sans-serif`（字面量）⇒ 用户原话"这个时间显示像是我做的，不是壁纸自己的"。

**WE 自己带这批字体**，就在它的安装目录里（本机
`$MPW_ROOT/Steam/steamapps/common/wallpaper_engine/assets/fonts/`）：`fonts/Monofur-PK7og.ttf` 169452 B、
`Blackout 2 AM.ttf` 28308 B、`monof_tt-be11.txt` 940 B（作者 freeware 说明）等 18 个文件。
服务端**已有现成路由**：`server/we-scene-demo-server.mjs:489` 的 `/weassist/(.+)` 直接吐 `MPW_WE_ASSETS/<rel>`；
实测 `curl …/weassist/fonts/Monofur-PK7og.ttf` → `200 169452`（带空格的名字 `/weassist/fonts/Blackout%202%20AM.ttf` → `200 28308`）。

### 改法（只动 `demo.html` 四处 + 一份 docs 追加 + 一个新测试）
| 位置 | 内容 |
| --- | --- |
| `demo.html:2541-2544` | 新增 `textFontMissing` 集合 + 语义注释：`textFontLoaded` 收紧为"**字节真的到手**"，来源判定失败单独记，既不让 WE 兜底被顶掉、也不让每帧重发 404 |
| `demo.html:2558-2567` | 三级来源链的完整注释（为什么需要第二级 + 许可出处） |
| `demo.html:2568-2572` | 两个**纯函数**（测试直接节选求值）：`textFontSourceOf(pkgLen)` ⇒ `'pkg'` / `'we'`；`weFontUrl(fp)` ⇒ `/weassist/fonts/<basename>`（`encodeURIComponent`） |
| `demo.html:2573-2603` | `ensureTextFont` 三级：①包内（**优先，且这一级不碰网络**）→ ②`fetch('/weassist/fonts/…')`（与既有 `/weassist/materials/…` 同写法：`ok` 才取字节、`catch(() => null)` 吞异常）→ ③`textFontMissing.add(fp)` + 日志 `缺失→回退 sans-serif`。拿到字节才 `textFontLoaded.add(fp)`，日志按来源分写 `：包内` / `：WE 内置` |
| `demo.html:2768` | **调用点必须跟着改**：`ensureTextTexture` 的挂起判据加 `!textFontMissing.has(t.font)`。否则"缺失 ≠ loaded"会让缺字体的层每帧 `return false`、**永远不渲染**（比旧行为更糟） |

保留不动：包内分支的取字节/Blob/FontFace 流程、异常日志 `⚠ 文本字体加载失败 …`、`systemfont_*` 旁路、
`textFontFamily` 的 `sans-serif` 字面回退；`elysia/**`、`core/we-scene-bundle.js`、`server/we-scene-demo-server.mjs`、
`dsh-mpkg-wallpaper/` **一行未动**（`/weassist` 路由本来就够用）。

### 日志样例（三级的实际输出，`<name>` = basename）
```
🔤 文本字体 千图马克手写体.ttf：包内                                            ← ① 包内有（hina id1592）
🔤 文本字体 Monofur-PK7og.ttf：WE 内置                                          ← ② 本机 WE 安装目录（hina id398 时钟）
🔤 文本字体 Monofur-PK7og.ttf：缺失→回退 sans-serif（包内无此文件，本机 WE 资产目录也没有：/weassist/fonts/Monofur-PK7og.ttf）
                                                                                ← ③ 公开副本没装 WE（404）
```

### 测试：`text-font-fallback-test.mjs`（**45 断言**，~0.2s，注册为 `text-font-fallback`）
- **[T1] 9 条** 纯函数：来源判定（`pkgLen>0`⇒`pkg`；`null/undefined/0`⇒`we`）；URL 形状 —— 真机时钟字体、
  **带空格的真 WE 字体 `Blackout 2 AM.ttf` ⇒ `/weassist/fonts/Blackout%202%20AM.ttf`**（无 `+`、无裸空格、
  `decodeURIComponent` 回得到 basename）、CJK basename、裸文件名取 basename。
- **[T2] 18 条** 节选真源码 `ensureTextFont` + 桩 `lib/pkg/fetch/Blob/URL/FontFace/document`：包内有 ⇒
  **fetch 0 次**、日志"包内"、family = `mpw-<hash>`、字节 8127808 原样进 Blob；包内无 ⇒ 恰好 1 次请求、
  日志原文 `🔤 文本字体 Monofur-PK7og.ttf：WE 内置`；**404 / fetch reject / 200 但 0 字节 / 包内 0 字节** 四种
  ⇒ 都不抛异常且落第三级（`textFontLoaded` **不写**、`textFontMissing` 写、family 回 `sans-serif`）；
  missing 去重（再调两次仍只 1 次请求 1 条日志）；`systemfont_*` 不进链；异常分支保留旧日志。
- **[T2s] 6 条** 源码级守卫：旧的 `if (!bytes) { textFontLoaded.add(fp); return }` 必须已消失、缺失分支不写
  `loaded`、三级都在、早退含 `missing`、**调用点也认 missing**、第二级 fetch 写法与既有 `/weassist` 一致。
- **[T3] 7 条** 真包 3554161528 真数据：字体条目清单恰为 `fonts/千图马克手写体.ttf` 一条、
  `getEntry(pkg,'fonts/Monofur-PK7og.ttf') === null`、包内那层 8127808 B、两层文本字体、**时钟层 id398**；
  端到端：真包字节 + 时钟层 font ⇒ 走第二级且 URL/日志正确；再喂包内那层 ⇒ fetch 总数**仍是 1**。
- **[T4] 5 条** 许可说明：`docs/ELYSIA-LICENSING.md` §11 存在且写明 freeware + `monof_tt-be11.txt` 随字体分发 +
  **不随仓库分发**、只从**用户本机 WE 安装目录**运行时读取（发布口径不能写反）+ `/weassist`…404 降级。
- 缺真包时打印 `SKIP text-font-fallback …` 退出 0（条件项，`run-all-tests.sh` 已登记 skip-pattern）。

### 许可（顺带，用户第 1 项的另一半）
`docs/ELYSIA-LICENSING.md` **追加 §11**（不改动 §1–§10）：Monofur 作者 tobias b koehler 的
`monof_tt-be11.txt` 原文摘录（freeware，**可与说明文件一起分发**）、本渲染器**不随仓库/构建产物/mpkg
分发任何字体文件**、只在运行时从**用户本机 WE 安装目录**的 `assets/fonts/**` 读取、没装 WE 时该路由 404
回退 `sans-serif`；附本机证据表（路径/字节数/`curl` 两例）与三条未定项（U7 EULA 同 R3、U8 未逐字体审计、
U9 作者"放到服务器请告知"条款在代理部署时需重新评估）。

### 真机验收（给用户的一句话）
> **刷新 `http://127.0.0.1:8899/?id=3554161528`，在属性面板勾上「时间/clock」，时钟文字应当从无衬线体
> 变成 Monofur（等宽、带小圆点的写法）；日志里应出现 `🔤 文本字体 Monofur-PK7og.ttf：WE 内置`。**

### 回退
删掉第二级那一段（`demo.html:2581-2593`）即回到"只有包内"的旧行为（`textFontMissing` 与调用点判据可一并删）；三层都不改默认渲染口径，
`?pts`/`?props` 等既有开关不受影响。

### 未定项（不许猜）
1. **公开副本（没装 WE）的观感变化**：旧代码在缺字体时把 fp 记成 `loaded`，于是 `textFontFamily` 返回一个
   **未注册的 `mpw-<hash>` 家族名**（浏览器落到 last-resort 字体，本机 Chrome 下未必是 sans-serif）；P-81 按
   任务书字面走第三级、返回**真的 `sans-serif`**。真机 3554161528 走第二级拿到 Monofur，这条只在"没装 WE +
   包内缺字体"时可见 —— **本机无法复现该组合**（本机 WE 装着），故未做像素级对照。
2. `assets/fonts/**` 里其余 17 个字体（RobotoMono/opensticks/TwemojiMozilla…）的许可**没有逐个审**，
   只管了 Monofur（时钟要的那一个）+ 目录里三份 notice；是否需要进 `THIRD-PARTY.md` 未定。
3. `docs/HINA-CLOCK-AND-PROPERTIES.md` §5 仍写着"还没解决：Monofur 字体从哪来"（列出选项 A/B）—— 本次
   落地的其实是**选项 B 的变体（运行时读本机 WE，而不是把字体放进仓库）**；该文档本次**未改**（超出任务书
   允许的改动范围），建议下轮补一句指向 §11，以免后来者按 A/B 重新决策。

## P-82（2026-09-15，取证/结论，无渲染改动）第 1 项「眉毛眨眼翻转 180°」**数据侧封案** + 第 3 项「只有秒针渲染」**根因=包内缺字体**

本节**不改一行渲染代码**，只把两个悬案的证据链补齐（此前 P-24/N3/N5 只做到"排除"与"待用户截图"）。

### 一、第 1 项：hina（3554161528）人物 puppet 的**全部动画数据**（离线可复算）

真包 `models/人物_puppet.mdl`（**全包唯一 .mdl**；37 个对象里**没有**眼睛/眉毛层，`models/人物.json`
只有 `autosize/material/puppet` 三个键 ⇒ 脸=这一张 `materials/人物.tex`，眉毛不是独立层）：

| 段 | 值 | 含义 |
| --- | --- | --- |
| MDLV0023 / MDLS0004 / MDLA0006 / MDLE0002 | 4 段 | 网格 / 骨骼 / 动画 / 骨骼扩展 |
| 动画数 | `animCount=3`，解析出 3 | 无"没解析到的动画" |
| 动画 id / 名 / 帧 / fps | 182「动画 1」75、726「动画 2」240、1258「动画 3」90，全 `loop`，全 30fps | — |
| 场景 `animationlayers` | 3 层，**全 `additive:true`、`blend:1`、`visible:true`**，`animation` 分别 726/1258/182 | 与 MDL id **一一对上**（demo `:2474` 先按 `animId` 匹配，命中） |
| 蒙皮顶点 | 497（= `mesh.vertexCount`），32 骨 | — |

**① 每条动画末尾 14 帧 = 同一个导出垃圾块（不是"眨眼"）**。逐帧蒙皮（`_sampleAnimRT`→`gBones`→顶点）
的"单帧最大顶点位移"在这 14 帧里是 435/626/696/**1529**/704/347/348/1208/**1982**/725/578/694/1135 px，
而且**三条动画的这 14 帧逐位相同**（同值、同顶点号）⇒ 导出器把同一段未初始化数据接在每条动画尾部，
**不是作者编排的动作**（真眨眼必须是"平滑下去再上来"，不会是 347↔1982 交替乱跳）。现有坏帧表已按此跳过
（`analyzeAnimGoodFrames`：bad = 各自末尾 14 帧）。

**② 好帧里根本没有"翻转"量级的数据**：

| 动画 | 好帧 | 单帧最大顶点位移 | 单帧最大骨骼转角 | 最大摆幅骨（好帧内） |
| --- | --- | --- | --- | --- |
| 动画 1 | 61/75 | 2.1 px | 0.11° | 25/32 骨各 ~2.0°（呼吸） |
| 动画 2 | 226/240 | 0.0 px（微动） | 2.30° | 骨 18 = 17.3°、骨 19 = 13.8° |
| 动画 3 | 76/90 | 6.3 px | 1.02° | 骨 8 = 23.0°（**静止姿态动画**，逐骨峰值 0.2px） |

32 骨 × 3 动画的**全部帧**里，转角 >90° 的帧间跳变 **0 次**（P-24 已测），本轮加测"好帧角度摆幅"
最大值 **23.0°**（骨 8）——**离 180° 差一个数量级**。

**③ 真机探针（P-80，用户上报 `reports/r…@14:26:55`）**：439 帧 / 10.01s 会话，
`summary = {maxDtyBone:30, maxDty:2.82px, blinkCount:0, blinkSamples:0, mirrorEver:[]}`，
逐骨 `Δtx跨帧 ≤ 3.99px`、`tx` 全幅 ≤ 20.6px、`ang` 全幅 ≤ 0.33rad(19°) ⇒ 真机渲染**也没有**翻转/镜像/眨眼。

**结论（可写进交付）**：这个包里**不存在眨眼动画**，`人物` 的有效动作只有"呼吸（动画 1）+ 微摆（动画 2/3）"；
「眉毛左右翻转 180°」在**数据侧不可能**由骨骼发生（三条独立证据：离线全帧、真机 10s 探针、坏帧块结构）。
若用户在**官方 WE** 里看到翻转，那也不是这个 puppet 的动画（脸是一张静态贴图，无第二贴图/无 UV 动画：
`materials/人物.json` 只有 1 个 pass、1 张纹理）；若在**我们页面**看到，请带**出现那一刻的截图**（`?ln=11`
单层隔离即可），我们按图定位——**不做猜测性改动**。

### 二、第 3 项：砂狼白子（3327063360）"只有秒针能渲染" = **包内缺字体**（P-81 恰好修的就是它）

包内 `scene.json` 的钟/日期/星期/帧率**全是文本层**，字体引用与实际到货情况：

| 层 | id | 字体 | 包内? | 用户本机 WE 有? | 修前 | 修后（P-81 二级链） |
| --- | --- | --- | --- | --- | --- | --- |
| **秒** | 1192 | `fonts/书法字体.ttf` | **YES** | — | **渲染** ✓ | 渲染 ✓ |
| Clock（默认可见，`b1=4`） | 639 | `fonts/spincycle_3d_ot.otf` | NO | **YES** 44640B | 不渲染 ✗ | **渲染** ✓ |
| Clock（`b1=2`） | 7186 | `fonts/Blackout 2 AM.ttf` | NO | **YES** 28308B | ✗ | ✓ |
| Clock（`b1=3`） | 8183 | `fonts/8bitOperatorPlus8-Regular.ttf` | NO | **YES** 20824B | ✗ | ✓ |
| Date / D a y | 286/278/1140 | `spincycle_3d_ot.otf` / `Alcubierre.otf` | NO | **YES** 38512B | ✗ | ✓ |
| 帧率显示 | 1293 | `fonts/Segment7Standard.otf` | NO | **YES** 10464B | ✗ | ✓ |

即：**用户看到"只有秒"，正是因为只有「秒」的字体被作者打进包里**（WE 工坊包惯例：内置字体不进包，
运行时从 WE 安装目录读）。P-81 的第二级 `/weassist/fonts/<basename>` 读的正是那 5 个字体，
本轮逐个 `curl` 复验（服务在跑，非缓存）：

```
spincycle_3d_ot.otf 200/44640B/OTTO   8bitOperatorPlus8-Regular.ttf 200/20824B/00010000
Blackout%202%20AM.ttf 200/28308B/00010000   Alcubierre.otf 200/38512B/OTTO
Segment7Standard.otf 200/10464B/OTTO   Monofur-PK7og.ttf 200/169452B/00010000
```

**顺带修正一处我自己的旧记录**：WE 安装的 `assets/fonts/` 不是 8 个字体而是 **18 个**（另有
`fonts/summer85.ttf`、`fonts/opensticks.ttf`、`fonts/RobotoMono-Regular.ttf`、`fonts/NotoSans-Regular.ttf`、
`fonts/TwemojiMozilla.ttf` 与两份许可文本），此前清单不完整不影响结论，但"哪些字体救得回来"必须以目录实测为准。

### 三、全包"引用但缺资产"扫描（回答用户"没分发的东西在别人机器上会怎样"）

`/tmp/misscan.mjs`（一次性工具，递归 scene.json→json 引用链，4 层）对 6 个真包的结论：
缺损分两类——**(a) 本机 WE 安装里有**（字体、`models/util/*.json` 内置模型、`materials/util/*`），
运行时由 `/weassist/**` 与内置兜底补上；**(b) 两边都没有**：只有 WE **编辑器**专用的 `preview/` 清单文件
（`project.json`，运行时不需要）与**作者自带的歌**（其实在包内，扫描器的 basename 比对误报，已核）。
⇒ 公开分发时不会有"静默黑屏"类缺口；真正需要用户在意的只有 (a) 类，而它正是"**没装 WE 的用户**"
会看到的差异（字体回退 sans-serif、内置 util 模型走我们内置副本）——与 P-81 未定项 1 同一条。

### 回退
无代码改动 ⇒ 无需回退。本节只增文档。

## P-83（2026-09-15，渲染器侧子任务）相机层姿态**完整接**（origin 关键帧动画 + zoom）+ 三档回退 —— 用户第 1 项相机部分

> **编号**：本条最初打算用 P-81，动手时发现并行会话已占用 P-81（字体回退链）与 P-82（眉毛翻转数据封案）
> ⇒ 按"被占就顺延"改为 **P-83**。

### 现象（P-76 查出来的真问题）
`camPose` **从来没有交给 `buildCamera`**：`buildCamera` 读的是 `opts.cameraPose`，而全仓库只有
`camera-node-test.mjs` 传它（`demo.html` 不传）⇒ **相机层的 origin/zoom 关键帧动画在真实渲染路径里从未生效**
（`?cam=node` 同理）。P-76 只接了"用户属性绑定的 zoom"这一安全子集（平移恒等）。

### 证据（官方行号 + 语料实测三档数字）
第三方参考实现（`wer-ref/src/backend/scene/internal/parser/WPSceneParser.cpp`，GPL-2.0-only，仅行为对照）：
- `:6119-6135` 相机层**无条件注册**：`camera_layer.origin/zoom/fov = empty_obj.*` + `UpdateActiveCameraLayer()`
  —— **没有"origin 必须是关键帧动画"这个条件**（我们的 `cameraNode.active = !!origin.animation` 是收窄过的）。
- `IsCameraLayerRuntimeProperty`（`:882-885`）= `visible|origin|angles|zoom|fov`；
  `:7345-7355`：**"Camera zoom/fov 不是普通可绘层属性，只对相机层扫描、走 camera target kind 路由"**
  ⇒ `zoom`/`fov` 各注册 Property + Animation + Script 三种绑定。

语料扫描（15 个 camera 对象 / 6 个不同包，dd + /mnt + .dsh-mpkg 去重）：
- **只有 1 个包有相机层关键帧动画**：`3554161528`(hina) —— `origin` x∈[−1319,68] y∈[−710,204]、zoom∈[0.97,3]。
- 其余 5 个（`3326873240`/`3327063360`/`3470764447` + 2 mpkg）的 `origin` 是**逐属性脚本**
  `{script:…, value:"2434.38477 725.25134 500"}`、`zoom={user:"newproperty30"}`，且 `origin` **无** animation。
- **全部 15 个都是正交**（`general.orthogonalprojection` 存在）；`general.fov=50` 只在 `isOrtho` 判据里被 `orthogonalprojection` 短路掉。

三档实测（mock-GL 走**真实** `renderScene`/`compositeLayer`，取层 mvp 实绘矩形）：

| 包 | 层 | full | legacy | off | full−off |
|---|---|---|---|---|---|
| hina 3554161528（t=0） | 人物 | x0=3771 w=**4215** | x0=1218 w=1405 | x0=1218 w=1405 | **Δx=+2553，w ×3.0000** |
| hina（t=0） | 背景 | x0=−3955 w=11750 | −38 / 3916 | −38 / 3916 | Δx=−3917，w ×3.00 |
| hina（t=1） | 人物 | x0=2140 w=**3705** | 1218 / 1405 | 1218 / 1405 | **Δx=+922，w ×2.6370** |
| hina（t=1） | 背景 | x0=−3245 w=10330 | −38 / 3916 | −38 / 3916 | Δx=−3207 |
| 凯尔希 3719111841 | 背景正常/主体/长发3…（25 层） | — | — | — | **三档逐位相同（Δ=0）** |
| 砂狼白子 3327063360 | 10 层 | — | — | — | **三档逐位相同（Δ=0）** |
| 砂狼白子 + `?cam=node` | 纯色/文本1 | x0=−1917 / −1536 | — | 517 / 898 | **−2434px**（脚本快照） |

t=1 的 zoom ×2.6370 与独立用 `evalPropAnimation` 算出的 **2.6374** 吻合（两种独立手段互证）。

### 改法
1. `buildCamera` 调用点：`full` 档把 `camPose`（origin + zoom + fov）作为 `opts.cameraPose` 交过去
   （`view = T(−origin.x, +origin.y)`、窗口 `framed/zoom`；`viewBg` 仍为恒等 ⇒ 满幅背景层继续豁免平移）。
2. `cameraNode` 增 `fovRaw`；pose 里带上 `fov`（**本渲染器无落点**：`buildCamera` 只构造 `mat4Ortho`，
   没有透视分支，且语料 15 个相机对象全部正交 ⇒ 写进 pose 供将来透视路径消费，对当前语料零影响，
   测试有"fov 10 vs 120 投影逐位相同"的回归断言）。
3. zoom 取值链：`动画 → 静态 value → 用户属性绑定(zoomFromUser)`。
4. **默认 `full` 不施加"逐属性脚本 origin 的静态快照"**：我们**不求解** `origin.script`，而快照是编辑器
   保存时刻的值 —— 实测施加它会让砂狼白子整体偏 **−2434px**（`?cam=node` 就是打开这个口子的 A/B）。
   即：`full` 只在 `camNode.active`（origin 有关键帧）或 `?cam=node` 强制时才构造 pose。

### 回退开关（用户点名"要保留可以回退的按钮"）
新增 **`?campose=full|legacy|off`**（缺省 `full`；非法值/未知值 → `full`，不会静默变成 off）：
- `full`  = 完整接（本次新行为）；
- `legacy` = **P-76 的行为**（只接用户属性绑定的 zoom，origin 平移恒等）—— 对 hina 与 `off` **逐位相同**
  （hina 的 zoom 是动画、没有用户绑定）；对砂狼白子这类"用户绑定 zoom"的包仍能让面板滑块生效；
- `off`   = 完全不接相机层（**逐位**回到 P-76 之前）。
`?cam=0` 仍是"关相机层"总闸；`?cam=node` 语义不变。真值表由纯函数 `camposeModeFrom()` 单点提供
（bundle 的 `CAMPOSE_MODE` 与测试共用同一份 ⇒ 不会两边漂移），并已登记 README 主表
（`diag-flag-check`：代码 112 开关 == 主表 112 行）。

### 默认值：**`full`**，依据
1. 用户已明确批准"相机层动画要完整接"；不默认开就等于没接。
2. **影响面只有 1 个包**：语料里唯一有相机层动画的就是 hina；实测其余 5 个"脚本 origin"包三档**逐位相同**。
3. 凯尔希 3719111841（用户当前在看的包）**三档逐位相同**（它根本没有相机对象）⇒ 对 P-76 刚修的两条零风险。
4. 变化方向与作者意图一致：hina 的 zoom 关键帧是 `3 → 1 → 1`（`options.fps:18,length:90,mode:single`）
   ⇒ 一个**拉远式开场运镜**（t=0 三倍镜、约 5s 后回到 1 倍并保持），不是随机跳变。

### 测试与门禁
- 新增 **`camera-pose-test.mjs`**（**26 断言 / 0 失败 / ~2s**，已注册 `add "camera-pose"`）：
  ① `?campose=` 真值表 9 条（full/legacy/off/缺省/`=bogus`/`=`/`=OFF`/无关参数/与其它参数共存）；
  ② hina：相机层 active ✓、**t=0 与 t=1 实绘矩形不同**（证明关键帧在逐帧求值而非只取静态首帧）、
     t=0 w×3.0000 / t=1 w×2.6370、`legacy ≡ off` 逐位相同且复现改动前取景（人物 x0=1218 w=1405、背景 w=3916±1）；
  ③ 正交回归：`pose.fov` 10 vs 120 投影逐位相同（fov 无落点）；
  ④ 凯尔希：`cameraNode===null` + 三档逐位相同 + 背景正常仍是 P-76 的 −208/4244（**保护 P-76 的两条修复**）；
  ⑤ 砂狼白子：三档逐位相同 + `?cam=node` 确实 −2434px（说明"默认不施加快照"这条不是没测）。
- **门禁影响：无预期外变化** —— `package-matrix --check` ✓（只有 P-75f 已解释的 hina `drawnLayers 16→15`）、
  `parity-check` ✓（5 场景无越界）、`visual-diff-kal`（凯尔希，无相机对象）✓。
  ⇒ **不需要**新增 `EXPLAINED_BASE_DROPS` 条目（本条没有造成任何基线变化）。

### 取证局限（写清楚，免得下一个人以为"没变化"）
`visual-diff.mjs --id 3554161528 --ab "?campose=legacy"` 实测 **ΔSSIM=0.0000 / ΔMAE=0.0000** ——
这**不是**"改动无效"，而是**本机取证链的限制**：`headless-shot.mjs` 的 Playwright 6 档参数全部失败
（证据 `/tmp/headless-evidence.json`），按设计**回落到 CPU 预览 `preview.mjs`**，而 `preview.mjs`
**完全不消费相机姿态**（grep `buildCamera|cameraPose` = 0 命中，它自带一套矩阵逻辑）⇒ 三档在它眼里必然相同。
所以本条的真机外验证只能用：**mock-GL 走真实 `renderScene`**（相机矩阵是纯 JS 计算，GL 只负责光栅化 ⇒ 几何口径可信，
与 P-76 背景那条"mock-GL 复现真机台账到 1px"同一论据）+ **用户真机截图**。

### 未定项
1. `fov` 仍无落点（本渲染器无透视分支）—— 语料 0 个透视包，缺"透视相机包"样本才能验证；**未定，缺样本**。
2. 逐属性脚本 `origin`（5 个包）的**正确求值**：官方会跑 `origin.script`，我们不跑 ⇒ 这些包的相机层
   我们按"未激活"处理。要做需要先实现"逐属性脚本宿主"（`elysia/scene-scripts.js` 现在只处理
   `objects[].scriptproperties`），并确认脚本里的 sliders 默认值语义。**未定，缺逐属性脚本的官方求值证据。**
3. hina 的相机动画与 `zoom`/`origin` 的**父子联动**（`zoom.animation.options.children=[{key:"origin"}]`、
   `origin.animation.options.parent={key:"zoom"}`）：我们的 `evalPropAnimation` 各自独立求值，
   **没有**实现"子属性跟随父属性"的联动语义。实测两条曲线都在动、方向自洽，故画面看着对；
   但若官方语义是"origin 由 zoom 驱动"（而不是各自独立的关键帧），长时行为可能有差。
   **未定，缺官方 Tween children/parent 语义证据 + 一次长时间真机对照。**

## P-84（2026-09-15）用户点名项落地：相机档位的 **🎥 回退按钮**（真按钮、当场生效、不用刷新）

**背景**：P-83 把相机层姿态完整接上了，但"回退"只有 `?campose=legacy|off` 两个 **URL 开关** ——
用户原话要的是「**保留可以回退的按钮**」。改地址栏显然不是按钮：档位原先只在模块初始化时从
`location.search` 读**一次**（`CAMPOSE_MODE`），点按钮也得刷新才生效。本次补上真按钮 + 实时档位。

### 改了什么

| 文件 | 位置 | 内容 |
| --- | --- | --- |
| `core/we-scene-bundle.js` | `:3960` | 新增导出纯函数 **`resolveCamposeMode(optsVal, liveVal, fallbackVal)`**：三档优先级的**唯一真值表** |
| `core/we-scene-bundle.js` | `:6650-6656` | 渲染路径每帧改走它：`resolveCamposeMode(opts.campose, window.__mpwCampose, CAMPOSE_MODE)` |
| `demo.html` | `MPW-CAMPOSE-BTN-BEGIN/END`（约 `:4377-4433`） | 顶部工具栏 `#bar` 新增 `🎥 相机` 按钮（`#mpw-campose-btn`），点一下 完整→旧档→关→完整 |
| `camera-pose-test.mjs` | 新增 ⑥ 段 | **20 条断言**（7 条纯函数 + 5 条真包真渲染 + 8 条源码守卫）⇒ 该测试 26 → **46 断言** |
| `README-DIAGNOSTICS.md` | `campose` 行 | 补按钮与优先级说明（`diag-flags` 仍 **112 == 112**，本次不新增 URL 开关） |

### 关键设计（都是"有理由的选择"，不是随手写）

1. **优先级 `opts.campose` > `window.__mpwCampose` > `?campose=`**：`opts` 必须最高，否则页面上的按钮状态会
   污染 `camera-pose-test` 在同一进程内做的三态逐位对照（那是 P-83 全部量化的地基）。
2. **live 档写 `window.__mpwCampose`**（与 `__mpwPointer`/`__mpwUserProps` 同款"宿主注入口"），**每帧可读**
   ⇒ 点击立刻生效；`?campose=` 降级为"加载时的初值"。
3. **点击同时 `history.replaceState`**：刷新后仍停在同一档，且**上报日志/截图里的 URL 能看出跑在哪档**
   （否则"用户说画面不对、我们不知道他停在回退档"——这类排查成本此前出现过）。
4. **加载时就把 live 档种上**（`window.__mpwCampose = MODES[mi].v`）：这样"带 `?campose=legacy` 打开"
   与"点按钮切到 legacy"走**同一条**代码路径，不会出现两套行为。
5. **4 种指针事件全 stop**：照抄 🛰 立即上报 的教训（`#logbar` 的 `pointerdown` 判定曾把点击当拖动），
   按钮以后被挪进任何可拖动容器都不会复发。
6. **非法值一律 `full`**（含大小写 `OFF`）：与 `camposeModeFrom` 同口径，避免"看着关了其实没关"。

### 证据（真包真渲染，不是只改了个变量）

`camera-pose-test.mjs` ⑥ 段用**真 hina 包 + mock-GL 真 `renderScene`**，不传 `opts.campose`、只给
`window.__mpwCampose`，比对实绘矩形：

| live 档 | 实绘结果 | 与对应 `opts` 档比对 |
| --- | --- | --- |
| `legacy` | 人物 `x0=1218 w=1405` | == `opts.campose=legacy` **逐位相同** |
| `off` | — | == `opts.campose=off` **逐位相同** |
| `full` | 人物 `w=3705` | == `opts.campose=full` **逐位相同** |
| `bogus` | — | == `full`（非法回落一致） |

且 `live=legacy` 与 `live=full` **不同**（`w` 1405 vs 3705）⇒ 按钮确确实实改变了画面。

### 真机验收（给用户的一句话）
> 打开 `http://127.0.0.1:8899/?id=3554161528`，顶部工具栏点 **🎥 相机**：三档循环
> 「完整 → 旧档 → 关」；点一下画面**立刻**变（完整档下人物被镜头拉近 ~×2.6～3.0，旧档回到原取景），
> 日志会打一行 `🎥 P-84 相机层姿态档位 = …`。

### 回退
按钮只写 `window.__mpwCampose`；不点它时行为与 P-83 的**逐位相同**（默认 `full`）。
要回到"只有 URL 开关、无按钮"的状态：删 `demo.html` 的 `MPW-CAMPOSE-BTN-*` 块即可
（bundle 侧 `resolveCamposeMode` 保留 —— 它是纯函数，`opts`/URL 两档照旧工作）。

### 未定项
无。本次不改变任何渲染默认值（`full` 仍是 P-83 定的默认），只新增一个用户可点的回退入口。

## P-85（2026-09-15，服务端 + demo 回退开关）官方 project.json 的**查找链**接进服务端 —— 属性面板空白与"4 个 Clock 同屏"的真因收口

### 背景（工坊三件套 + project.json 不在包里）
WE 工坊布局 = **一个壁纸一个目录**，目录里三件套：scene.pkg + project.json + preview.gif。
其中 project.json **不是** scene.pkg 里的条目 —— `getEntry(pkg,'project.json')` 恒 null（语料 6/6 实测），
它是容器的**同级文件**。此前服务端 `/project/<id>` 只读 `<MPW_SCENE_ROOT>/<id>/project.json`，这份
文件不在的部署（公开副本没有 allwallpaper/；或语料只保留容器）恒 404 ⇒ demo 的 `propsSchema=null`，
连锁三件事（= 用户报的 bug 的真因）：
1. **属性面板空白**（P-61 的面板没有数据源）；
2. `visible:{user:{condition:…}}` 的**条件门控**全部走「属性表缺失 → 按可见」的灾难规避分支
   ⇒ 砂狼白子 3327063360 的 4 个 Clock 变体（id 394/639/8183/7186）**同时可见** —— 正确行为
   只有 1 个：官方表里 `b1` 是 combo、默认 "4"，只有 condition=="4" 的 id 639 该显示；
3. 用户属性绑定全部回落作者默认值。

而**用户本机 Steam 工坊目录**（`$MPW_ROOT/Steam/steamapps/workshop/content/431960/<id>/`）
里三样俱全（实测 6/6）。新增 **`core/scene-project-json.mjs`**：统一查找链（先私有、后官方；先显式、后猜测）
—— explicit-dir → env-MPW_PROJECT_JSON_DIR → scene-root(`<MPW_SCENE_ROOT>/<id>`) →
we-workshop(`<Steam 工坊 431960 目录>/<id>`) → allwallpaper-flat；命中即返回 `{path, source, json}`，
`source` 供日志/响应头标出"这份属性表从哪来"。只读用户本机已存在的文件，**不复制、不缓存、不分发**；
找不到返回 null，调用方按"无属性表"既有路径优雅降级。

### 改了什么

| 文件 | 位置 | 内容 |
| --- | --- | --- |
| `server/we-scene-demo-server.mjs` | 顶部 import（约 `:11-19`） | 引入 `readProjectJson` + 一次性日志去重表 `PROJECT_SOURCE_LOGGED` |
| `server/we-scene-demo-server.mjs` | `/project/<id>`（约 `:381-401`） | 改走查找链；行为保持"返回该 json 的**原始体** + application/json"（命中同文件时逐字节一致）；命中额外加响应头 `x-project-source: <source>`，同一 id 只打一行 `[project] <id> ← <source> (<path>)` 日志；找不到仍 404 'no project.json'。传给 resolver 的是服务端**生效**的 MPW_SCENE_ROOT（其 samples/wallpapers 兜底语义不动）。※ P-87 起该兜底档已换成 `<repo>/samples`（自带合成样例），id 正则同时放宽到 slug |
| `server/we-scene-demo-server.mjs` | `/type/<id>`（约 `:436-448`） | 同样改走查找链；读不到时**逐字保留**既有兜底（`ok:true, type:'unknown'`） |
| `demo.html` | 用户属性表块（约 `:2926-2933`、`:2966-2968`） | 回退开关 **`?proj=off`**：跳过 `fetch('/project/'+id)`（等价"无属性表"旧行为，用户点名"要保留可以回退的按钮"）；写法与既有开关同形（`new URLSearchParams(location.search).get(...)`）；日志 `⚠ ?proj=off：跳过官方 project.json（回到"无属性表"旧行为）`；P-61 那条日志在 off 时改说"被回退开关关闭"，不误导 |
| `README-DIAGNOSTICS.md` | ③ 数据源与模式表 `proj` 行 | 新增回退开关登记（**diag-flags 112 → 113**，双向比对 0 差异） |
| `project-json-test.mjs` | 新增 | 本条测试（43 断言，见下） |
| `run-all-tests.sh` | `add "project-json"` 一行 | 注册进门禁（61 → 62 项） |

`/pkg`、`/weassist`、`/report` 等其它路由一行未动；resolver 的查找顺序未改。

### 证据（真包 + 四个 Clock 的解析结果 + curl）
1. **真包 6 个**（3554161528 / 3544152633 / 3327063360 / 3719111841 / 3326873240 / 3660962877）：
   `readProjectProperties` 全部非空（属性条数 35/47/102/22/104/237）。
   ⚠ **如实记录一个前提修正**：本机 `allwallpaper/dd/<id>/` 目前**恰好也带** project.json（6/6 与工坊
   副本逐字节相同，`cmp` 实测）⇒ 默认命中 source=**scene-root**；任务书里"dd 下没有"的前提在本机
   当前状态不成立。因此测试把语料档**场景隔离**（sceneRoot 指向空目录）后单独钉死：6/6 命中
   **we-workshop** —— 工坊档的可达性不依赖那个前提。
2. **四个 Clock 变体的解析结果**（`propsDefaults` + `gatedOffNames` + `evalVisibleWithProps`，
   均为 core/we-scene-bundle.js 既有导出）：
   | 变体 | user.condition | 默认属性下 | 属性表缺失时（旧 404 / `?proj=off`） |
   | --- | --- | --- | --- |
   | 394 | "1" | 隐藏 | 可见 |
   | **639** | **"4"（== b1 默认）** | **可见（唯一）** | 可见 |
   | 8183 | "3" | 隐藏 | 可见 |
   | 7186 | "2" | 隐藏 | 可见 |
   「秒」id 1192（`{user:"newproperty49"}`，默认 true）可见。两种状态的对照都钉进了断言（C3-C5）。
3. **curl**：`/project/3554161528` → 200，响应体含 general.properties（35 条），响应头
   `x-project-source: scene-root`（本机 dd 有该文件时的正确答案；换成无语料副本即 we-workshop）；
   `/project/0000000000` → 404 'no project.json'。`/type/3327063360` 行为与改动前一致。
4. **测试**：`project-json-test.mjs` **43 断言 / 0 失败 / ~0.7s**（A 查找顺序 10 + B 真包 18 +
   C 门控真值 6 + D hina 引用完整性 2 + E 优雅降级 2 + F 服务端契约 5 —— F 用子进程起
   server/we-scene-demo-server.mjs 于随机空闲端口，try/finally 必杀，不留孤儿）。
5. **门禁**：`diag-flag-check` 113 == 113（0 差异）、`demo-syntax-check` 8/8、
   `time-variation`（切该属性块的切片单测）70/0、`props-panel` 260/0 均未受影响。

### 回退
- **demo 侧**：`?proj=off` —— 跳过 /project 读取，逐位回到"无属性表"旧行为（本轮新开关，已登记 README 主表）。
- **resolver 侧**：降级顺序即回退链 —— 工坊目录没有 → 自动落回语料目录/扁平目录；全没有 → null
  → 前端既有"无属性表"路径（与 P-85 之前逐位相同）。
- **服务端侧**：撤销 = 还原 `/project`、`/type` 两个路由为单一路径读取即可（其它路由零改动）。

### 未定项
1. Node 侧审计工具 `package-matrix.mjs` / `parity-check.mjs` 仍只读**语料目录/包内**的 project.json
   （未接 resolver），与 demo 的数据源存在差异 —— 本轮**未改**（对齐它们会连带 136KB 的
   matrix/parity 基线 JSON 全部漂移，需要单独一轮裁定口径），**待对齐**。
2. 本机语料目录当前带 project.json 的状态（与工坊副本逐字节一致）与任务书前提不符：若语料回到
   "只有容器"的状态，/project 会自动落到 we-workshop 档 —— 两种状态测试都覆盖了，无需人工干预。
3. `/type` 命中时未加 `x-project-source` 响应头（本轮只按要求加在 /project）；要排查 /type 的来源
   可看服务端 `[project]` 日志（/type 未打日志，如需再加）。

---

## P-86（2026-09-15，许可/仓库资产 + 渲染器侧）随仓库分发「可合法分发」的字体：文本字体链扩成**四级** + 逐文件许可合规

### 触发
- 用户：「WE 工坊壁纸的文本层引用的是 WE **内置字体**（不在壁纸包 `pkg` 容器里），没装 WE 的人字形不对 —— 把**可以分发的**字体加进仓库，并保证许可合规、有测试、有文档。」
- 依据（**照抄，不重新论证**）：`docs/FONT-REDISTRIBUTION-RESEARCH.md` —— 15 个内置字体里 **6 个自由许可**（OFL-1.1 / Apache-2.0 / CC-BY-4.0）、**2 个附条件可分发**（Monofur、Spin Cycle 3D）、7 个回溯上游后**查不到**任何再分发授权。**铁律：任何字体都不得从 `<WE>/assets/fonts/` 复制，只能从作者/上游取件**（该文件 §1.1：Steam SSA §2.G 明文禁止 copy/reproduce/distribute；WE 不是这些字体的许可人；同类 6 个项目共 6,169 个文件里字体数 **0**）。
- 用户追加裁决：**两个"有条件可分发"的字体也照条件取下来加进仓库**（Monofur 优先走上游 OFL-1.1 版本；`spincycle_3d_ot.otf` **只从作者站点取**）。
- 用户追加裁决（编号）：本节用 **P-86**，并**插在 `## P-87` 之前**（`docs-check.mjs` 校验 P 编号非降序；并行那路主动顺延到 P-87）。

### 取件结果（全部 2026-09-15 UTC，`curl -sSL`；逐文件明细见 `THIRD-PARTY.md` §4.1）

| 收录到 `assets/fonts/` | 许可 | 取件 URL（唯一来源，**均非 WE 目录**） | 字节 | sha256 |
|---|---|---|---|---|
| `assets/fonts/Blackout 2 AM.ttf` | OFL-1.1（RFN `Blackout`） | `https://raw.githubusercontent.com/theleagueof/blackout/master/Blackout%202%20AM.ttf` | 28,308 | `48e96e2a…cea2d0` |
| `assets/fonts/monof55.ttf`（= WE 引用名 `fonts/Monofur-PK7og.ttf`） | OFL-1.1（Debian 审查记录 + 作者本人 2018 邮件） | `https://deb.debian.org/debian/pool/main/f/fonts-monofur/fonts-monofur_1.0.orig.tar.xz`（上游 tarball 内路径 `monofur/` 下的 Regular） | 169,452 | `02567677…7b2b44` |
| `assets/fonts/NotoSans-Regular.ttf` | OFL-1.1 | `https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf` | 569,208 | `b85c38ec…8d232d5` |
| `assets/fonts/RobotoMono-Regular.ttf` | **OFL-1.1**（上游现行版；**不是** Apache-2.0 —— WE 里那份 2015 build 才是 Apache-2.0） | `https://raw.githubusercontent.com/googlefonts/RobotoMono/main/fonts/ttf/RobotoMono-Regular.ttf` | 125,748 | `af0bff75…be17cb4` |
| `assets/fonts/Segment7Standard.otf` | OFL-1.1（RFN `Segment7`） | `https://fontlibrary.org/assets/downloads/segment7/4cc82137fc130708919bf201c0dc9aae/segment7.zip` | 10,464 | `f35b8ce7…1cc7356` |
| `assets/fonts/Twemoji.Mozilla.ttf`（= WE 引用名 `fonts/TwemojiMozilla.ttf`） | 美术 CC-BY-4.0 / 代码 Apache-2.0 | `https://github.com/mozilla/twemoji-colr/releases/download/v0.7.0/Twemoji.Mozilla.ttf` | 1,474,284 | `6d90152e…d299ee8e` |
| `assets/fonts/spincycle_3d_ot.otf`（**时钟字体**） | 作者 Jess Latham freeware 条款（可商用/可再分发，附条件） | **作者官网** `https://www.bvfonts.com/fonts/files/spin_cycle_threed.zip` 内 `Open Type/spincycle_3d_ot.otf` | 44,228 | `cc4a580a…3962da4d` |
| ❌ **未收录** `fonts/8bitOperatorPlus8-Regular.ttf` | 内嵌 OFL-1.1（RFN `8-bit Operator+`，© Grand Chaos Productions） | 作者页 `grandchaos9000.deviantart.com` **本次网络不可达**（curl exit 28，无 HTTP 状态）；`dafont.com/8bit-operator.font` → **404**；fontlibrary 搜 `8-bit` → **0 结果**；fontsquirrel → **202 空体**（Cloudflare）；fontspace → **403**；作者的 GitHub 账号**无公开仓库** | — | — |

`spincycle_3d_ot.otf` 用的是作者 zip 里的 `Open Type` build（44,228 B，sha256 `cc4a580a…`），**不是** WE 目录里那份旧 build（44,640 B，sha256 `41a1e603…`）—— 这也顺带证明了这个文件**没从 WE 复制**（`THIRD-PARTY.md` §4.4 有对照表）。

### 两个「有条件可分发」字体的条件逐条对照（用户点名要单独列清楚）

**A. `assets/fonts/spincycle_3d_ot.otf`（作者 Jess Latham，旧名 Blue Vinyl Fonts）— 回链 <https://www.bvfonts.com/>**

| # | 作者条件（逐字） | 我们怎么满足 | 证据 |
|---|---|---|---|
| 1 | 允许使用与再分发、含商用：`All free fonts at bvfonts.com are freeware. You may use them in personal or commercial work.` / FAQ `A license is no longer required to use the freeware for commercial use` | 本仓库是免费 MIT 开源渲染器，字体只用于渲染文本层，不收费、不单独售卖字体 | `assets/fonts/licenses/spincycle-bvfonts-TOU.txt`（逐字 + 抓取日期 + 页面 sha256） |
| 2 | 不得进 CD-ROM / 合集盘：`Please do not include this font on any CD-ROM compilations.` / `Please do not include these fonts on any CD-Roms.` | 不是字体合集、不是字体下载站形态：目录里只有渲染器真正会解析的 7 个字体 + `assets/fonts/README.md` + `licenses/`，随源码仓库分发，不售卖 | `assets/fonts/` 目录清单；`assets/fonts/README.md` 写明该条件 |
| 3 | 不得转售 / 重新包装 / **重编译**：`This font is not to be resold or remarketed.` / `These fonts are not to be recompiled and sold.` | 原样分发：**未改名、未转格式、未 subset、未重编译**，字节与作者 zip 内文件逐一相同 | sha256 `cc4a580a…` == 作者 zip 内 `Open Type/spincycle_3d_ot.otf`（`assets/fonts/licenses/spincycle-bvfonts-TOU.txt` 记了 zip 的 sha256） |
| 4 | 回链：FAQ `Please link me if you do!` | **三处显著回链**：`THIRD-PARTY.md` §4.1/§4.6、字体所在目录的说明文件 `assets/fonts/README.md`、渲染器源码注释 `demo.html`（`REPO_FONT_ALIASES` 上方，含 `https://www.bvfonts.com/` 与"不得从 WE 目录复制"） | `grep -n bvfonts` 这三个文件；测试 T4f/T4g 断言后两处 |
| 5 | 必须从作者站取（archive 站来的要先问）：`If you've downloaded a Jess Latham … free font from an archive site … please ask permission` / `It's always a good idea to download the latest version from bvfonts.com` | 只访问 `bvfonts.com`（字体页 `details.php?id=44` → `spin_cycle_threed.zip`），**没有**读取/复制本机 WE 目录那份；两者字节不同可自证 | 取件 URL 列在上表；`THIRD-PARTY.md` §4.4 的 sha256 对照 |
| 6 | 作者保留改条款权：`Jess Latham reserves the right to make changes to this license at any time.` | 条款快照留档（抓取日期 + 页面 sha256），日后可复核"当时依据的是哪版条款" | `assets/fonts/licenses/spincycle-bvfonts-TOU.txt` 首部 |

**B. `assets/fonts/monof55.ttf`（作者 tobias b koehler）— 走 **OFL-1.1 路径**，同时带 freeware 声明文件**

| # | 两条路径的条件 | 我们怎么满足 | 证据 |
|---|---|---|---|
| 1 | **OFL 路径**（作者 2018 邮件 + Debian `debian/copyright`）：`These fonts are licensed under SIL Open Font License version 1.1.` | 附 OFL 全文 + 版权行；不改名（文件仍是上游发布名）、不改字体名、不单独售卖；本仓库整体 MIT | `assets/fonts/licenses/OFL-Monofur-debian-copyright.txt`（含 OFL 全文）、`assets/fonts/licenses/monofur-author-OFL-email.txt` |
| 2 | **freeware 路径**（上游包内 `monof_tt.txt`）：`These fonts are freeware and can be distributed as long as they are together with this text file.` | 该声明原文**随字体一起分发**（放在 `assets/fonts/licenses/`，`assets/fonts/README.md` 与 `THIRD-PARTY.md` §4.6 都点明）；**不把两条路径的许可文本混成一份** | `assets/fonts/licenses/monofur-monof_tt-notice.txt` |
| 3 | **礼貌条款（两条路径都有）**：`I would appreciate it though if you could contact me at unci@tigerden.com if you put them on a server.` / `… notify me at unci@unci.de when you use them commercially or redistribute them on a server.` | 如实登记为"作者请求（request），非许可条件"；本仓库存档作者邮件与 Debian 版权记录，便于据此向作者发通知 | `THIRD-PARTY.md` §4.2/§4.6 末段 |
| 4 | WE 引用名与本仓库文件名不同（`fonts/Monofur-PK7og.ttf` vs `assets/fonts/monof55.ttf`） | 映射表 `REPO_FONT_ALIASES`（`demo.html`）+ 文档表（`THIRD-PARTY.md` §4.3、`assets/fonts/README.md`）；测试断言"映射目标文件真的在磁盘上" | 测试 T1d/T4e；真包端到端 T3f |

### 改了什么

| 文件 | 位置 | 内容 |
| --- | --- | --- |
| `demo.html` | 字体链（约 `:2575-2650`） | 三级 → **四级**：①包内 → ②**仓库自带** `/assets/fonts/<文件>` → ③本机 WE `/weassist/fonts/<basename>` → ④`sans-serif`。新增纯函数 `REPO_FONT_ALIASES`（WE 引用名 → 仓库文件名，两个别名）、`repoFontNameOf` / `repoFontUrl` / `textFontNextTier` / `textFontTierLabel`；`textFontSourceOf(pkgLen, repoOff)` 改签名（返回下一级 `'pkg'|'repo'|'we'`）；降级改成**逐级** while 循环，任一级拿到非空字节即停；日志按级写 `🔤 文本字体 <名>：包内 / 仓库自带 / WE 内置`，全缺时写 `缺失→回退 sans-serif（试过：<URL1> → <URL2>）` |
| `demo.html` | 回退开关（约 `:2592-2594`） | 新增 **`?repofonts=off`**（写法与既有开关同形 `new URLSearchParams(location.search).get('repofonts')`），关掉第②级 → **逐位回到 P-81 三级链**；开启时日志写明"被回退开关关闭"，不误导成"拿不到" |
| `demo.html` | `REPO_FONT_ALIASES` 上方注释 | **bvfonts.com 回链/署名**（作者条款要求的第三处，写死在注释里防丢） |
| `server/we-scene-demo-server.mjs` | `/assets/fonts/(.+)` 路由（`/weassist/(.+)` 之前） | 把**本仓库** `assets/fonts/**` 暴露给页面：`decodeURIComponent` → 剥前导 `./` → `path.join` → `full.startsWith(base)` 防穿越 → 只放行 `.ttf/.otf/.json/.md/.txt`；content-type 按扩展名给 `font/ttf` / `font/otf` / `text/plain` 等；走既有 `sendFileStream`（支持 Range）。未知文件 404 `no repo font` |
| `assets/fonts/`（新目录） | 7 个字体 + `assets/fonts/README.md` | 只放**有权分发**的字体（取件清单见上）；该说明文件写目录纪律、映射表、bvfonts 回链与未收录说明 |
| `assets/fonts/licenses/`（新目录） | 12 个文件 | 每份 OFL 全文（逐字体）、Apache-2.0 全文、CC-BY-4.0 归属声明、作者 TOU/README 快照、Debian 版权与作者邮件、上游 freeware 声明 |
| `THIRD-PARTY.md` | 新增 **§4 Fonts bundled with this project** | 逐字体：文件名 / 许可 / 版权行 / 上游 URL / 取件日期 / 字节 / sha256；映射表；与 WE 副本的对照（标明"仅供参考，非来源"）；未收录清单；**spincycle 六条条件逐条对照**；8bitOperator 未定项与试过的 URL；复核 recipe |
| `README-DIAGNOSTICS.md` | ③ 数据源与模式表 + 表头计数 | 新增 `repofonts` 行；计数 **113 → 114** |
| `text-font-fallback-test.mjs` | 全文件扩写（P-81 的 45 条断言全部保留原意） | **106 断言**：T1 四级纯函数（含别名/空格编码/降级真值表）、T2 桩环境 14 组场景（含 `?repofonts=off` 两态）、T2s 源码级守卫 9 条、T4 许可/文档/sha256 一致性 17 条、T5 真服务器路由 18 条、T3/T3b 真包端到端 17 条、T6（可选）真浏览器端到端 |

`/weassist/fonts/**`（第③级）**一行未动**；包内优先（第①级）**一行未动**；`textFontLoaded` / `textFontMissing` 的语义（"字节真的到手" / 失败去重）保持 P-81 冻结口径。

### 测试与门禁
- `node text-font-fallback-test.mjs` → **106 断言通过 / 0 失败**（真包 3554161528 + 3327063360 均在本机 ⇒ T3/T3b 不 SKIP）。
- `node docs-check.mjs` → 退出码 **0**；`node diag-flag-check.mjs` → **114 == 114，0 差异**（`repofonts` 被抓到 `demo.html:2593`）。
- `node demo-syntax-check.mjs` → **8/8 通过**。
- 真服务器（测试内 `spawn`，随机空闲端口）：7 个字体 `/assets/fonts/<名>` 全部 **200 + 正确 content-type + 字节数 + sfnt/OTTO magic**；带空格名（`%20`）200；别名名 200；`licenses/*.txt` 200 且含 bvfonts 回链；未知文件 404；`%2e%2e%2f` 穿越 404。
- 真包命中证据（T3f/T3b4）：`🔤 文本字体 Monofur-PK7og.ttf：仓库自带`、`🔤 文本字体 spincycle_3d_ot.otf：仓库自带`，且交给 `FontFace` 的字节数与仓库真文件一致（169,452 B / 44,228 B）。

### 回退
- **页面侧**：`?repofonts=off` —— 跳过第②级，逐位回到 P-81 三级链（包内 → WE → `sans-serif`）。
- **服务端侧**：删掉 `/assets/fonts/(.+)` 这一段即可（其它路由零改动）；页面在该路由 404 时自动落第③级。
- **资产侧**：删 `assets/fonts/**` + `THIRD-PARTY.md` §4 即回到"仓库零字体"的调研建议口径 (a)。

### 未定项
1. `fonts/8bitOperatorPlus8-Regular.ttf` **未收录**（作者现行发布页本次网络不可达，且明令不得用 WE 副本顶替）—— 语料里 3327063360 / 3660962877 / 3326873240 确实有层引用它，那些层在没装 WE 的机器上仍回退 `sans-serif`；待作者页可达后按 `THIRD-PARTY.md` §4.8 的 recipe 补。
2. `Monofur` 的"通知作者"只是**礼貌请求**，本轮**没有**代项目所有者发邮件（无授权代发）；`THIRD-PARTY.md` §4.6 已把它登记为 request 而非条件。
3. 本机 WE 目录里那 7 个查不到授权的字体**仍然不分发**，运行时读取行为不变；若将来要收，必须先取得作者书面许可。
4. `spincycle_3d_ot.otf` 用作者 raw 文件，未做任何子集化/格式转换 ⇒ 与 WE 目录那份（44,640 B）**不是**同一 build，逐层像素级对照时若发现时钟字形与 WE 截图有细微差别，属预期（`THIRD-PARTY.md` §4.4 已记录）。
5. 真浏览器端到端（`MPW_FONT_E2E=1`）**本机没跑通**：这台的 playwright chromium（151）在 proot 容器里能启动、能开 `about:blank`，但渲染进程一加载 demo 就崩/挂起（`browser.newPage()` 不返回；`page.setContent` 报 `Target page, context or browser has been closed`）⇒ 该节只作为"有真实浏览器时的一条可选验证入口"保留，**不算已验证证据**，也没进门禁。四级链"真的命中哪一级"由 T2/T3/T3b（真包 + 真字节 + `FontFace` 字节数与 magic）与 T5（真服务器 200 + content-type + 字节数）覆盖。

---

## P-87（2026-09-15 版权）删除随仓库分发的真实测试壁纸 samples/wallpapers/（**198M → 130K**）+ 清掉由此产生的悬空引用

### 触发
作者口径：`samples/wallpapers/` 里的是第三方 Steam 创意工坊作品，**不允许打包进仓库**（"不要把我的测试壁纸打包进仓库"）。
同一件事一直挂在 `RELEASE-PLAN.md` §9 **D1（哪些壁纸随仓库发布）** 上未决 —— 本轮按 **option A：只发程序化生成的合成样例** 结案。

### 删了什么（体积前后）
| 指标 | 前 | 后 |
|---|---|---|
| `du -sh samples` | **198M** | **130K** |
| `du -sb samples`（apparent size，含目录项） | 207 293 667 B | 96 431 B |
| `samples/` 下文件数 | 23 | 11 |

删掉的是 `samples/wallpapers/` **整目录**：4 个包（3327063360 / 3544152633 / 3554161528 / 3719111841，
每个包含 scene.pkg + project.json + preview.gif）+ 该目录的 MANIFEST.md，共 13 个文件 / 207 202 279 B。
删前确认过没有"我们自己写的、需要保留的非壁纸文件"：整个目录只有第三方包与那份清单。
MANIFEST.md 里**有价值的两块**（①怎么把服务器指向自己的语料；②版权口径"这些是别人作品、仅本机测试、不随 npm/仓库分发"）
已先迁进 `samples/README.md` 再删。保留：`samples/sample-synthetic/`、`samples/sample-synthetic-src/`（`tools/make-sample.mjs` 程序化生成）。

### 代码改动（逐文件）
| 文件 | 改动 |
|---|---|
| `server/we-scene-demo-server.mjs` | ①**场景根兜底链重写**：显式 `MPW_SCENE_ROOT` > `$MPW_ROOT/allwallpaper/dd` > `<repo>/samples`；三档都不存在时返回**明确不存在**的占位路径（`<repo>/samples/NO-BUNDLED-CORPUS`），**绝不留"指向空目录却报成功"的假象**。② 启动日志新增 `[scene] 场景根 …`（路径不存在时明确标注 `?id=` 一律 404）+ "本仓库不打包任何真实壁纸，真实语料请用 MPW_SCENE_ROOT / ?pkgpath=" 一行指引。③ `findScene` 改**两档查找**（语料根 → `<repo>/samples`），语义仍是 `<root>/<id>/scene.pkg`，找不到返回 null（**不用别的包顶替**）⇒ `?id=sample-synthetic` 在任何机器上都能打开自带样例。④ `/pkg`、`/project`、`/type`、`/ddlist` 的 id 形态由 `(\d+)` 放宽为统一常量 `ID_PAT`（数字或 slug，**首字符不许是点** ⇒ `?id=..` 进不来），否则 slug 形态的自带样例走不了 `?id=`。⑤ `/project`、`/type`、`/ddlist` 改用 `findScene` 真正命中的那一档根（自带样例的 `project.json` 也能读到）。⑥ 默认 `MPW_ALLOW_DIRS` 加 `<repo>/samples`：`?pkgpath=<repo>/samples/sample-synthetic/scene.pkg` 与 `/pkgdir?d=…/sample-synthetic-src` 开箱可用（这两条一直是文档承诺、此前却没进白名单）。 |
| `server/we-scene-demo-server.mjs`（**附带修复**：同一处的公开副本致命路径） | `common*.h` 头表那段原来**无条件** `fs.readdirSync(MPW_WE_ASSETS + '/shaders')`：没装 WE 的机器（= 公开副本的正常情况）**每个请求**都在这里 ENOENT → 全站 500（实测 `/pkg/sample-synthetic`、`/project/…`、`/ddlist/…` 全 500，验证服务器形同报废）。改成 try/catch 只跳过"官方同名头兜底"，仓库自研的 6 个头照常从 `__dirname` 加载；装了 WE 的机器 `HEADER_FILES` 与改前**逐位相同**。 |
| `demo.html` | `bootInstance` 内 `id` 由 const 改 **let**；`/pkg/<id>` 装载处新增降级：**未显式指定包来源时**（无 `?id=` 且非多实例 `?ids=`）默认包 404 → 打一行明确日志并改用自带合成样例 `sample-synthetic`，**同时改写 `id`**（让 `/project`、`/type`、`/ddlist` 与上报 payload 都指向真正渲染的包，不出现"上报 A、渲染 B"）。显式 `?id=` / `?pkgpath=` 拿不到包时**不替换**、如实报错（旧代码是拿 404 的 `no scene` 字节去 `parsePkg`，报一个看不懂的错）。本机有语料 ⇒ 第一发就 200，这条路一行不走。 |
| `props-panel-test.mjs` | 去掉 `samples/wallpapers/<id>` 第二候选（真包只从本机语料取），保留原有优雅 SKIP 分支。 |
| `media-host-test.mjs` | 同样去掉该候选；并**新增**整体 SKIP：3 个真包（3554161528 / 3544152633 / 3660962877）缺任一即打印 `SKIP media-host（…）` 退出 0（此前缺包会在 `loadScene` 里抛异常 ⇒ 门禁红）。 |
| `run-all-tests.sh` | 给 `media-host`、`props-panel` 登记条件项标记 `^SKIP <name>`（缺语料时如实计 SKIP，而不是当 PASS）。**改这个文件时确认过没有门禁在跑**（P-70 的字节偏移坑），改完跑 `--list` 验证解析正常。 |

### 文档改动（逐文件）
| 文件 | 改动 |
|---|---|
| `samples/README.md` | 顶部加"**本仓库不分发任何真实壁纸**"声明 + 删除记录与体积前后；新增 "What ships here"、"Bring your own corpus（怎么用自己的语料 + 版权口径，迁自被删的清单）"、"Without a real corpus —— 什么还能跑、什么降级" 三节；修正 `?pkgpath=` / `?id=sample-synthetic` 的可达性说明（`samples/` 已进默认白名单）。 |
| `docs/README-PUBLIC.md` | 加载表：内置样例改为 `?id=sample-synthetic`；新增"首页无 `?id=` 时的降级"一行；包 id 行写明两档查找 + 真实壁纸需自备。第 3 节加"不分发真实壁纸 + 删除记录"。环境变量表更新 `MPW_SCENE_ROOT` 兜底链、`MPW_WE_ASSETS` 自动探测、`MPW_ALLOW_DIRS` 含 `samples/`。快速开始补首屏降级说明。 |
| `.gitignore.public` | 说明区更新：该目录已整体删除；**故意不写忽略规则**，让误加回来的大包继续被 `publish-check.mjs` 的体积闸门（>100MB 阻塞）当场拦下，而不是被静默忽略。 |
| `TASK-RENDERER-QUEUE.md` | 验收命令里的 hina 路径改为 `allwallpaper/dd/3554161528`，并注明该包不再随仓库分发。 |
| `docs/QODER-REVIEW-BRIEF.md`（DSHarea 根） | 工作树指纹命令去掉 `-not -path './samples/wallpapers/*'`（目录已不存在）并注明原因。 |
| `docs/HLSL2GLSL-COVERAGE.md` | §1.1 的候选包数标注为"当时快照"（15 → 今天 11）；§2.3 说明带 `s:` 前缀的行是当时的证据、已无法在无语料副本上复现。 |
| `PLUGIN-RELEASE-CHECKLIST.md` | 发布闸门表那行（254MB 样例壁纸）标注"该目录已整体删除（实际落地 4 包 / 198MB）"。 |
| `RESUME-PROMPT.md` | 必读清单里的 samples/wallpapers/MANIFEST.md → `we-scene-demo/samples/README.md`；要点②"样例壁纸已选 7 个（254MB）"整条作废并写明新口径（超限包不必再考虑 LFS/Release/网盘）。 |
| `RELEASE-PLAN.md` | §9 **D1 标注 RESOLVED（取 option A）**；§1B 目录树里 `samples/` 注明"不再包含任何真实壁纸"。 |
| `NIGHTLY-REPORT-20260914.md` | 那一行加"当时快照"标注（历史报告不改事实，只标注后续变更）。 |
| 本文件（`PATCHES.md`） | 三处历史记录追加"该路径已于 P-87 移除"标记（历史事实原样保留）：:1768 的 `MPW_SCENE_ROOT=samples/wallpapers` 验证命令、:2291 的回退顺序、:4310 的"服务端兜底语义不动"。 |

### 门禁
- **改前基线**（`bash run-all-tests.sh --json`）：`══ 汇总：PASS=61 FAIL=0 SKIP=1 / 总 62 项`（SKIP = `jpeg-decode`，条件项"无真机截图"）。
- **改后**（见下节"验证"）：`PASS=61 FAIL=0 SKIP=1 / 总 62 项`，**同一 SKIP 集合、无新增红**；`node docs-check.mjs` 退出码 **0**。全程未改 `run-all-tests.sh` 的判定逻辑（只加两个条件项标记），未在门禁运行期间动过该文件。
- 手工验证（子进程起服务器，随机端口）：`/pkg/3554161528` 200（真包，走语料根）、`/pkg/sample-synthetic` 200（走自带样例根）、`/project/sample-synthetic` 200 + `x-project-source: scene-root`、`/type/sample-synthetic` `{"ok":true,"type":"Scene"}`、`/ddlist/sample-synthetic` 列出 `project.json`；把 `MPW_ROOT` 指到无语料目录时启动日志如实标注场景根不存在、`?id=` 404（不再 500、也不假装成功）；`?id=..`、`?id=.hidden`、`?id=a%2Fb` 均 404（id 正则挡住路径逃逸）。
- **验证口径（如实）**：`demo.html` 里"无 `?id=` 时降级到自带样例"的浏览器侧分支**没有跑真浏览器**（本机 Playwright/headless 起不来，见 `TESTING-PUBLIC.md` §3），只做了 ①语法检查 `node demo-syntax-check.mjs` 8/8 通过；②它依赖的服务端两档查找/404 行为如上实测；③代码走查（条件 `!qs.has('id') && !MPW_MULTI_IDS` + `!r.ok`）。要在浏览器里确认：清空语料后打开 `http://127.0.0.1:8899/`，应看到一行 `⚠ 默认包 3554161528 不可用…→ 改用自带合成样例 sample-synthetic` 并出画。

### 公开副本（没有真实壁纸）时的行为：哪些 SKIP、哪些降级
实测口径：`MPW_ROOT` + `MPW_SCENE_ROOT` 都指向空目录，跑 21 个与语料相关的门禁项 ⇒ `PASS=13 SKIP=6 FAIL=2`（那 2 个 FAIL 与本次删除无关，见下）。
- **SKIP（打印 `SKIP <name>` 并退出 0，门禁不红）**：`media-host`、`props-panel`、`mdla-walk`、`animation-badframe`、`audio-real-pkg`、`jpeg-decode`（后两个分别缺真包音轨/真机截图）；`parity-check` 在 `reports/` 无真机数据时同样 SKIP。
- **PASS 但真包断言不可达**（这些测试本来就在缺数据时静默通过）：`text-switches`、`canvas-size`、`text-font-fallback`、`script-tick`、`camera-pose`、`meshsize`、`hdr-predicate`、`script-origin-sync`、`text-script-props`、`time-variation`、`fullscreen-recenter`、`package-matrix`、`panel-smoke`。**静态/语法/mock-GL 全套不受影响**。
- **功能降级**：`?id=<真包>` 404（要 `MPW_SCENE_ROOT` / `?pkgpath=` / `?pkgurl=` 自备）；首页无 `?id=` → 明确提示后自动渲染自带合成样例；属性面板在找不到 `project.json` 时为空（既有"无属性表→按可见"兜底路径）；`/weassist/*`（WE 粒子预设/材质兜底）跳过（且不再 500）。
- **两个既有 FAIL（与本次删除无关，未处理）**：① `project-json` 的 18 条断言依赖 6 个真包，其中 3326873240 / 3660962877 **从来没在 samples/wallpapers 里**，所以它在无语料副本上一直是红的；② `parity-check` 用 `MPW_ROOT` 解析 `we-scene-demo` 自身路径，把 `MPW_ROOT` 指到非工作区目录会 `ERR_MODULE_NOT_FOUND`（探测口径问题）。两者都属"门禁为作者机写的"这一既有缺口，**本轮不动**。

### 验证（改后）
- `bash run-all-tests.sh`：`══ 汇总：PASS=61 FAIL=0 SKIP=1 / 总 62 项`（贴如上）。
- `node docs-check.mjs`：`✓ 文档一致性全部通过`，**退出码 0**（`P-编号健康 ✓`、`diag-flags ✓`：114 个开关 == README 主表 114 行、0 差异 —— 本轮只动 demo.html 的装载分支，没有新增/删除任何调试开关）。引用计数随文档增删会变，故不在此写死数字。
- `du -sh samples` 198M → 130K；全仓库 `grep -rn samples/wallpapers` 只剩**明确写着"已删除/曾随仓库分发"的历史标注**（`samples/README.md`、`docs/README-PUBLIC.md`、`server/we-scene-demo-server.mjs` 注释、两个测试的去候选注释、`run-all-tests.sh` 条件项注释、`.gitignore.public`、`TASK-RENDERER-QUEUE.md`、本文件三处、以及 DSHarea 根 5 个文档），**没有一处仍把它当现存路径使用**。

### 回退
- 目录层面：要恢复测试壁纸，把包放回 `samples/wallpapers/<id>/`（或任意目录后设 `MPW_SCENE_ROOT`）即可，**代码不需要改**——`findScene` 的第一档就是语料根、第二档是 `<repo>/samples`。
- 代码层面：`server/we-scene-demo-server.mjs` 的兜底链与 id 正则、`demo.html` 的降级分支、两个测试的 SKIP 分支都可独立撤销；撤销后公开副本会回到"默认包 404 后 parsePkg 报错 + 缺 WE 时全站 500"的旧行为。

### 未定项
1. **跨仓库残留（本仓库之外，未改）**：姊妹插件仓库 `dsh-mpkg-wallpaper/tools/` 有 5 个文件把 `samples/wallpapers` 当语料候选
   （`audio-scan-bench.mjs:37,129`、`audio-scan-test.mjs:12,235`、`scene-audio-route-test.mjs:35`、`scene-video-test.mjs:280`、
   `scene-video-bench.mjs:45,51`）。那些路径**在该仓库里从来就不存在**（它没有 `samples/` 目录），运行时早就落到
   `allwallpaper/dd`，所以只是**过时注释/死候选**；且该仓库正在并行施工（`git status` 大量未提交改动）、`tools/` 也不在 npm `files` 里
   ⇒ **本轮刻意不动**，留待插件侧自己清。
2. `demo.html` 的 `?mode=elysia`（CPU 渲染调试档）默认 id 仍写死 `3719111841`（也是一张真实壁纸）：无语料时会失败。未改（该档是调试路径，显式传 `?id=sample-synthetic&mode=elysia` 即可走通新的两档查找）。
3. 若日后要把"自带样例"做成首屏**明确**的默认（而不是失败后再降级），需要动 `demo.html` 的默认 id —— 本轮刻意保留"作者机默认包不变"（本仓一贯的"本机行为逐位不变"口径）。
4. **编号说明（并行轮次协调，已解决）**：本节落地时 PATCHES 里最大是 P-85，但同一时间**并行的"仓库自带字体"轮次**已在其代码/文档注释里预占 `P-86`
   （`demo.html` 字体链、`server/we-scene-demo-server.mjs` 的 `/assets/fonts/**` 路由、`THIRD-PARTY.md` §4、`README-DIAGNOSTICS.md` 的 `repofonts`、
   `assets/fonts/README.md`）。为避免撞号，**本轮顺延为 P-87**；该轮随后也确实以 **P-86 落在本节之前** ——
   当前文件顺序 P-85 → P-86（字体）→ P-87（本轮），`docs-check.mjs` 的"P 编号非降"检查通过。编号规则备忘：
   并行时**后落地者**取更大的号（或插到更早的位置），否则非降检查会红。

## P-88（2026-09-15 用户点名）一键连拍上报截图：`POST /shot` 收**原始图片字节**直落盘 + 📸 连拍按钮 / 快捷键 `j`·`J`

### 触发（用户原话）
> 你加一个功能上报截图的功能 这样我就不用下载下来 点一下不需确认就能直接上传到你的后台 因为我下载下来可能卡不好他的时机

拆成三条硬口径，缺一条这个功能就不成立：
1. **抓时机** —— 单击一次要能**连拍一段时间内的多帧**（不是只拍一帧），因为要抓的是"眼睛/眉毛那一下"；
2. **手动精确** —— 键盘要能**精确抓某一瞬间**（单手按一下就上报，不要弹框、不要下载、不要选保存路径）；
3. **原分辨率** —— 画面主体是人物面部/眉毛 ⇒ `?thumbpost=` 那条 480×270 缩略图链路**不能用**（看不清眉毛），必须从 `cv` 原尺寸读回。

### 改了什么（逐文件:行）
| 文件 | 改动 |
|---|---|
| `server/we-scene-demo-server.mjs`（:329-422，新路由） | **新增 `POST /shot`**：body 就是**原始图片字节**（不是 base64 JSON —— base64 会白吃 33% 体积，而这条需求恰恰是"原分辨率的眉毛"）。查询参数 `id`（壁纸 id/slug，走与 `/pkg/<id>` 同一个 `ID_PAT` 且**显式拒 `..`**）、`tag`（`burst-07`/`single`，白名单化成文件名片段）、可选 `t`（场景秒）、`note`，外加可选的 `w/h/ow/oh/frame`（画面尺寸/原始尺寸/帧号，只进台账）。落盘 `MPW_REPORTS_DIR/shots/<id>/<ts>-<tag>.<jpg\|png>`（目录 `mkdir` 递归建），元数据追加进同目录 `index.jsonl`（一行一条 JSON：id/tag/t/note/file/rel/bytes/ts/at/w/h/ow/oh/frame/UA 摘要）；返回 `{"ok":true,"file":"shots/<id>/<name>","bytes":N}`（`file` 相对 `MPW_REPORTS_DIR`），绝对路径同时打到服务端 stdout（`[shot] …`）。限制：单帧 >4MB → **413**（超限后继续把 socket 读干净再回，客户端拿到的是明确 JSON 而不是半路断连）、content-type 非 `image/jpeg`/`image/png` → **415**、`id` 带 `..`/斜杠/空 → **400**。滚动：**该 id 最多 400 帧，超出删最旧**（只数图片文件，`index.jsonl` 是台账不删）。 |
| `demo.html`（:4493-4720，新 `MPW-SHOT-BTN` 区块） | **📸 连拍按钮**：`#mpw-shot-btn` 挂 `#bar`（与 `🎥 相机`、`🛰 立即上报` 并排），骨架照抄 P-84 —— 四种指针事件（pointerdown/pointerup/mousedown/touchstart）全 `stop`，点击回调 + 写日志。**单击 = 连拍 60 帧 × ≥100ms（≈6 秒）**，按钮实时显示 `📸 3/60`、完成后 `✅ 60/60` 再 1.5s 复原；**期间再点 = 停止**（`burstEnd('用户第二次点击 = 停止')`，已拍的报完再收尾）。**原分辨率**：读 `cv.width/height`，只有宽度 >1920 才由 `shotScale` 等比缩到 1920（高按比例四舍五入）并把原始尺寸写进 `ow/oh`。读回**必须**走 `__mpwSafeDataURL`（返回 null → 记一条日志跳过该帧，不抛）。上传 = `fetch('/shot?...', {method:'POST', headers:{'content-type':'image/jpeg'}, body: new Blob([bytes])})`，并发 3（串行跟不上 100ms 节奏），**每帧完成/失败各一条日志**（失败带 `HTTP <status>` 或异常文本）。键盘：**`j` = 单帧立即上报**、**`J`（Shift+j）= 连拍/停止**（按钮 title 里写明；输入框/属性面板里打字不抢键）。**没有新增任何 URL 开关**。 |
| `demo.html`（:5098，帧末取样点一行） | 渲染帧循环的 `.then()`（render 已 resolve、画布内容就是刚画完这帧）里新增 `window.__mpwShotFrameTick(tSec, window.__mpwFrameNo \|\| 0, cv)` —— 只报"场景时间/帧号/哪张画布"，是否真读回由 shot 模块判。传 `cv` 是给一页多实例（P-77）用的：别的格子的帧也会调这个页级钩子，**只有 primary 的那张画布算数**（`if (canvas !== cv) return`）。 |
| `demo.html`（:4511-4532，`MPW-SHOT-PURE` 区块） | 两个**纯函数**（`shot-upload-test.mjs` 从 demo.html 里**真源码切出来**单测）：`shotScale(w,h,maxW)`（≤maxW 一个像素不动；超了等比缩；零/半零尺寸 → `{w:0,h:0}` 不抛）与 `shotDue(lastMs,nowMs,intervalMs)`（差值 **≥** 阈值算到期；`lastMs` 为 null/NaN = 首次立刻到期；`intervalMs ≤ 0` = 不节流）。 |
| `shot-upload-test.mjs`（新建，248 行） | 见下"证据"。 |
| `run-all-tests.sh`（:76-80，`add "shot-upload" "node shot-upload-test.mjs"`） | 注册门禁项 + 注释写清断言数与耗时。**改前先按 P-70 的坑确认没有门禁在跑**（`ps -eo pid,args \| grep [r]un-all-tests` 无匹配）才动这个文件；改完 `bash -n` + `--list` 验证解析正常。 |

### 取帧口径（写明，供真机核对）
**逐渲染帧判到期**，不是定时器：连拍期间每个渲染帧末都调一次取样点，用 `shotDue(st.last, now, 100)` 判"距上一次取样 ≥100ms"才真读回一张 ⇒ 60Hz 上约每 6 帧取一张、慢机上最多每帧一张。
- **刻意不用 `setInterval`**：定时器会在两次渲染之间重复读**同一张**画布，同一张图连传 60 份对"抓眉毛那一下"毫无价值（测试 B13 断言连拍区块里没有任何 `setInterval(` 调用）。
- 渲染帧停摆（tab 切走 / 渲染卡住）时连拍**随之停**（不会拍到重复帧），由 wall-clock 兜底（`总时长×4 + 3s`）收尾并如实记一条"超时…（渲染帧停摆？）"。
- **`j` 单帧**是**按下那一刻立刻读回**（`cv` 是 `preserveDrawingBuffer: true`，画布里就是最后画完的那帧），拿的就是"精确那一瞬"，不等下一帧。
- 帧号/场景时间来自帧循环本身（`window.__mpwFrameNo` 与 `tSec = (now - last0)/1000`），随每帧元数据一起进 `/shot` 查询串与 `index.jsonl`（**没有**另造时间源）。

### 证据
**测试** `node shot-upload-test.mjs` → `===== shot-upload-test: 51 通过 / 0 失败 =====`（~0.5s，退出码 0）。分四组：
- **[A] 纯函数（5+6 条）**：`A0` 测试向量本身先用仓库自带解码器解出 16×16（证"最小合法 JPEG"不是垃圾字节）；`A1` 3840×2160→1920×1080 且 `srcW/srcH` 带上原始尺寸；`A2` **等于阈值 1920 一个像素不动**；`A3` 小于阈值原样直传；`A4` 1921 宽 → 1920×1079（等比四舍五入，不硬截 1080）；`A5`/`A6` 零尺寸与半零尺寸 → `{w:0,h:0}` 不抛；`A7` 首次立刻到期；`A8` **差值等于阈值算到期**；`A9` 差 99ms 不到期；`A10` `intervalMs ≤ 0` 不节流；`A11` `NaN`/`undefined` 当首次。
- **[B] 前端源码守卫（19 条）**：`B2` 按钮 id、`B3` 挂 `#bar`、`B4` 四指针全 stop、`B5` 走 `__mpwSafeDataURL`、`B6` 原分辨率 + `MAXW = 1920` + `ow/oh`、`B7` 进度文案 `📸 n/total`、`B8` `✅` 与 1.5s 复原、`B9` 第二次点击 = 停止、`B10` 60 帧 × 100ms、`B11` `j`/`J` 绑定且输入框不抢键、`B12` 快捷键写进按钮 title、`B13` 帧末钩子 + `shotDue` 且**无 `setInterval(`**、`B14` 帧循环里真的接了取样点、`B15` 多实例认画布、`B16` 每帧完成/失败都有日志（失败带状态/异常）、`B17` **无新增 `?flag` 开关**、`B18` POST 的是原始字节（Blob + `image/jpeg`，非 base64 JSON）、`B19` 单帧 `j` 与连拍**各自计数**（连拍途中按 `j` 不会把连拍顶到 60 提前收尾）。
- **[C] 服务端契约（16 条，真子进程 + 真字节）**：空闲端口起 `server/we-scene-demo-server.mjs`、`MPW_REPORTS_DIR` 指向临时目录、`try/finally` 必杀（不留孤儿）。`C2` 200；`C3` 返回体形状；`C4` 文件**真的存在**；`C5` 落盘字节与发送**逐字节相同**（`Buffer.compare === 0`）；`C6`/`C7`/`C8`/`C9` `index.jsonl` 恰好 +1 行、JSON 可解析、字段齐全且与请求一致、带 `ts`/ISO 时间/UA 摘要；`C10` `image/png` 也收且落成 png 扩展名；`C11` 非图片 → 415；`C12` 4MB+1 → 413；`C13` `id=..` 与 `id=../../evil` → 400；`C14` 逃逸尝试没在目录外留下文件；`C15` `tag` 里的 `../` 被白名单化（仍落在该 id 目录）；`C16` 服务端 stdout 打出绝对落盘路径。
- **[D] 服务端源码守卫（4 条）**：`D2` shots 自己的 400 帧滚动存在；**`D3` `/report` 的 60 份滚动一字未动**（两套策略互不影响）；`D4` 4MB 上限与 413/415/400 三条拒绝路径都在源码里。

**真机路由实测（:8899 真服务，重启后）**：先按 `pgrep -f server/we-scene-demo-server.mjs` 精确定位、只 kill 看门狗的**子进程**（不碰别的 node），看门狗 10s 内自动拉起，页面仍 200：
```
$ curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8899/?id=3554161528"
200
$ curl -s -X POST -H 'content-type: image/jpeg' --data-binary @/tmp/mpw-real-frame.jpg \
    "http://127.0.0.1:8899/shot?id=3554161528&tag=burst-01&t=1.234&note=curl-real-probe&w=1920&h=1080&ow=3840&oh=2160&frame=0"
{"ok":true,"file":"shots/3554161528/1789491829104-burst-01.jpg","bytes":4500}
```
- 落盘绝对路径：$MPW_ROOT/reports/shots/3554161528/1789491829104-burst-01.jpg（4500 B；与发送文件 `cmp` **逐字节相同**）。
- 同目录 `index.jsonl` 那行：`{"id":"3554161528","tag":"burst-01","t":"1.234","note":"curl-real-probe","file":"1789491829104-burst-01.jpg","rel":"shots/3554161528/1789491829104-burst-01.jpg","bytes":4500,"ts":1789491829104,"at":"2026-09-15T17:03:49.104Z","w":1920,"h":1080,"ow":3840,"oh":2160,"frame":0,"ua":"curl/8.12.0-DEV"}`（`frame: 0` 是真 0 —— 数字字段用 `numOrNull`，缺参才是 null）。
- 真机实测用的 body 就是**真机上报里那张真 JPEG**（`reports/r1789483724298.json` 的 `shot` 字段，4500 B），不是随手造的字节。

**门禁**：`bash run-all-tests.sh --only shot-upload` → `PASS shot-upload (517ms)`；**全量 `bash run-all-tests.sh` → `══ 汇总：PASS=62 FAIL=0 SKIP=1 / 总 63 项`**（退出码 0）——与 P-87 的基线 `PASS=61 FAIL=0 SKIP=1 / 总 62 项` 相比只是"多了本项这一个 PASS"，唯一的 SKIP 仍是既有条件项 `jpeg-decode`（无真机截图），**无新增红**。`node demo-syntax-check.mjs` → 8/8 通过（改了 demo.html 必跑）。`node docs-check.mjs` 退出码 0；`node diag-flag-check.mjs` 仍是 **114 个开关 == README 主表 114 行、0 差异**（数字**没变** —— 本功能不加任何 URL 开关）。

### 回退
- **功能层（推荐，零改动）**：连拍中**再点一次按钮**（或按 `J`）即停止；不想要按钮就当它不存在，`?cursor=`/`?ln=`/`?t=` 等既有开关全部照旧共存。
- **代码层**：三处独立可撤 —— ① `server/we-scene-demo-server.mjs` 的 `POST /shot` 整段（:329-422）；② `demo.html` 的 `MPW-SHOT-BTN` 区块（:4493-4720，含纯函数/按钮/快捷键/钩子）；③ `demo.html` :5098 那一行取样点。撤掉 ②③ 后渲染与上报路径**逐位回到改动前**（本功能只在帧末多加了一次 `try{}catch{}` 里的一次函数调用，默认无监听时是 `undefined` 短路）。
- **没有需要回退的 URL 开关**：本功能**一个新开关都没加**（按钮 + 快捷键即可），所以不存在"地址栏/文档双向一致"的连带改动，`diag-flag-check.mjs` 的数字不变就是这条的证据。
- **数据层**：`reports/shots/` 是纯产物目录，删掉即可；它不参与 `/report` 的 60 份滚动，删它不影响任何既有台账。

### 未定项
1. **无头环境拍不到真画面**：本机 Playwright/headless 起不来（见 `TESTING-PUBLIC.md` §3），所以**"连拍 60 帧真的拍到 60 张不同的画布图"没有做像素级验证**。已验的是：取帧走的是渲染帧末钩子 + 纯函数节流（源码守卫 + 边界断言）、读回走 `__mpwSafeDataURL`、上传真字节往返（真服务实测）；**没验**的是浏览器里 6 秒内是否真能凑满 60 帧不同画面（取决于当时帧率）与 JPEG 里眉毛是否清晰到可判读。要真机确认：打开 `http://127.0.0.1:8899/?id=<id>`，按 `J`，看按钮从 `📸 1/60` 数到 `✅ 60/60`，再去 `reports/shots/<id>/` 逐帧看眉毛。
2. **4MB 上限是"按帧"的硬闸**：1920 宽 JPEG q0.82 一般 150-400KB，正常不会撞；但极端高熵画面（满屏粒子/噪点）理论上可能超 ⇒ 那一帧会被服务端 413 拒掉（客户端如实记 "上报失败：HTTP 413"，不会静默）。是否需要"超限自动降质重传"没做（未定：会引入额外延迟，与"抓时机"冲突）。
3. **`tag` 的命名只有客户端约定**（`burst-01`…`burst-60` / `single`），服务端不校验语义只做文件名白名单。后续若要按"连拍会话"分组检索，得再加会话 id 字段（本轮不做）。
4. **不看结果的查看器**：本轮只落盘 + 台账，没有做"在 `:8899` 列出某个 id 的 shots"的页面（用户要的是"上传到我后台"，结果用文件系统/台账看即可）。若以后要页内回看，需新增只读路由 —— 那会是一次**新的 URL 面**改动，按惯例要同步 README-DIAGNOSTICS 与 diag-flag-check。

## P-89（2026-09-16 许可与合规落地）渲染器切 **GPL-3.0-or-later** + 插件音轨段**洁净室重写**（保住 MIT）+ 删除 GPL 血缘存疑的 Python 工具

**用户拍板（原话要点）**：① 插件 `dsh-mpkg-wallpaper` 保持 **MIT**；渲染器 `we-scene-demo` 改 **GPL-3.0-or-later**；
② 把审计查出的 ~210 行同源音轨模块**洁净室重写**；③ 以后的工作流 = "**先改 MIT 的插件，GPL 的渲染器再借用**"（反向禁止）；
④ `tools/` 里**有 GPL 血缘疑问的 Python 工具直接删掉**。本轮**不 commit / 不 push / 不发布**。

### 1. 渲染器许可：MIT → GPL-3.0-or-later（具体文件与行）

| 文件 | 改动 |
|---|---|
| `LICENSE` | 21 行 MIT → **697 行 / 36,452 字节**。前 **35,147 字节 = GNU GPL v3 条款原文**（与系统 canonical 副本 `cmp` **逐字节相同**，条款文字零改动）；其后追加分隔线 + 版权声明（`Copyright (C) 2026 XHR666`）+ 标准 `either version 3 of the License, or (at your option) any later version` 措辞 + `SPDX-License-Identifier: GPL-3.0-or-later` |
| `archive/LICENSE.MIT.bak-20260916` | 旧 MIT 全文另存（21 行，供回退；`archive/` 本来就在 `publish-check.mjs` 的 SKIP_DIRS 里，不进发布物） |
| `docs/README-PUBLIC.md` §5（原 75–81 行） | 整段重写：**GPL-3.0-or-later** + **本仓库不含任何 WE 素材** + vendored `webwallgl`（**MIT © oneincase**，当前**未 vendored**，只在仓库外研读）+ 字体（OFL/Apache/CC-BY，指向 `THIRD-PARTY.md` §4 与 `assets/fonts/licenses/`）+ **渲染器 import 了 MIT 插件 `dsh-mpkg-wallpaper`，其 MIT 声明随之保留** + 指向 `docs/COPYING-RULES.md` + "本文件不是法律意见" |
| `THIRD-PARTY.md` 末尾 | 追加 §5（本仓库自有许可 = GPL-3.0-or-later，**§1–§4 的 MIT/ISC/OFL/Apache/CC-BY 声明不因换 GPL 而失效**，MIT 声明必须随再分发继续传递）、§6（webwallgl：上游地址 / MIT / **未 vendored 未分发** / 将来引入必须升级为正式条目）、§7（插件 MIT、import 关系、单向流动与反向禁止） |
| 第三方归属 | **一个都没删**：`elysia/LICENSE`、`elysia/vendor/@shaderfrog/glsl-parser/LICENSE`、`assets/fonts/licenses/`（12 个文件）原样保留 |

**注意：渲染器没有 package.json**（纯 mjs 模块 + `demo.html`），所以本轮**没有**"license 字段"可改；
许可一致性改由 `publish-check.mjs` 自检（见 §5）：有 package.json 就必须一致，没有则以 LICENSE 自证为准。

### 2. 插件音轨段：洁净室重写（保 MIT）

- **先写规格**：`dsh-mpkg-wallpaper/docs/AUDIO-TRACK-SPEC.md`（后缀表 §1 / 路径规范化 §2 / 容器规则表 R1–R7 §3 /
  收集与去重 §4 / 条目头读取约束 §5 / 返回结构与缓存 §6 / 明确不做的事 §7），内容只来自公开容器格式事实
  与该模块的对外契约。
- **再只依据规格替换旧段**：`lib/pkg-extract.js` 旧 295–646 行（**352 行**）→ 新 295–715 行（**421 行**，
  多出来的是规格表格与 §-引用注释）。旧段指纹：抽出 295–646 行 = 352 行 / md5 `36b4e80e57355de53da5032491acc892`（副本只在 /tmp，不入库）。

| # | 维度 | 旧（同源改写） | 新（按规格） |
|---|---|---|---|
| 1 | 命名 | `PKG_AUDIO_EXT_RE` / `audioMimeFromHead` / `audioMimeFromExt` / `collectPkgAudioTracks` | `AUDIO_SUFFIX_MIME` / `sniffAudioMime` / `suffixAudioMime` / `enumerateAudioTracks`（另有 `AUDIO_CONTAINER_RULES` / `AUDIO_HEAD_BYTES` / `canonicalAudioPath` / `isAudioPath` / `asciiAt` / `readU64LE` / `compareTrackByPath` / `collectSoundLayerRefs` / `looksLikeLz4AudioEntry`） |
| 2 | 分支顺序 | RIFF→fLaC→OggS→ID3→**MPEG 同步**→ftyp→ADTS（ADTS 永远不可达） | **ftyp@4(R1)**→RIFF/WAVE(R2)→OggS(R3)→fLaC(R4)→ID3(R5)→**ADTS(R6)**→MPEG 同步(R7) |
| 3 | 常量组织 | 一条正则 + if/else 链 + 闭包 `tag(o,s)` | `Map` 后缀表 + **数据驱动规则表**（`ascii`/`sync`/`mask` 字段，表序即优先级） |
| 4 | 边界与文案 | 头短于 12 字节一律返回空；注释自述"与 demo.html 逐字一致/逐条同序" | 短头按条跳过但**不整体放弃**（§3.3）；异常吞掉（§3.5）；注释/文案全部按规格重写 |
| 5 | 去重/refs | 层名可能是字符串 `'undefined'`；partial 预扫描同路径重复读 | 无 name/id **不记 refs**（§4.4）；同路径只有第一条读头（§4.3/§5.2） |

- **有意的判据差异**：`0xFFF1`（ADTS）现在 → `audio/aac`（规格 §3.4）；旧顺序先判 MPEG 帧同步，
  把它误判成 `audio/mpeg`。**旧测试那条断言其实一直是假绿**——旧断言壳 `ok(name, detail)` 里 detail 为假也计 pass。
- **反向依赖清除**：`tools/audio-scan-test.mjs` 删掉 `loadDemoOracle()`（旧 236–276 与 275–301 行的"只读切片执行
  渲染器 `demo.html` 的 `MPW-AUDIO-PANEL` 区块"约 40 行），改为对规格的独立断言 **61 条**（T1 后缀表 18 例 /
  T3 容器表 15 例 / T4 收集与去重 / T5 读取约束 / T6 返回结构与缓存 / T7 边界：无音轨·多音轨·同名不同目录·
  损坏头·短条目·大写后缀 / T8 真包 11 个与测试内"规格慢速参考实现"逐项一致）；同时修掉断言壳的"永远 pass"缺陷。
- `tools/audio-scan-bench.mjs`：`enumerateBaseline`（自述"逐字复刻 demo.html collectPackageAudioTracks"）→
  `enumBySpec`（规格字面量参考实现）；11/11 包逐项一致、二次扫描 11/11 命中缓存。
- 插件 `LICENSE` **未动**（仍 MIT）、`dsh-mpkg-wallpaper/package.json` 的 license 仍 `"MIT"`；
  来历与处置写进 `dsh-mpkg-wallpaper/THIRD-PARTY.md` §1（新建）。

### 3. 删除 `tools/` 里 GPL 血缘存疑的 Python 工具

`dsh-mpkg-wallpaper/tools/` 下 4 个文件删除（清单 + md5 + 理由见 `docs/COPYING-RULES.md` §6）：

| 文件 | 行数 | 血缘疑问 |
|---|---|---|
| `tools/unmpkg.py` | 38 | 自述 "format from aqnya/unmpkg"（GPL-3.0） |
| `tools/tex2png.py` | 267 | 自述参考 notscuffed/repkg（**2026-09-17 更正：RePKG = MIT，非 GPL**；删除理由随之改为"与 `unmpkg.py` 同批研究脚本、同一标准处理"） |
| `tools/mdl_explorer.py` | 75 | 同批研究脚本，同一标准 |
| `tools/xref.py` | 94 | capstone 反汇编 wallpaper64.exe，同一标准 |

**未删**：`tools/check.sh`（8 步门禁）与全部 `tools/*.mjs`（测试/基准）。
悬空引用已修：`dsh-mpkg-wallpaper/tools/MDL-格式分析笔记.md`（脚本行改成"已删除（GPL 血缘存疑）"）、
`dsh-mpkg-wallpaper/README.md` 与 `dsh-mpkg-wallpaper/README.en.md`（目录树注明已删；音频清单的对照口径
从"渲染器 `demo.html` 的 collectPackageAudioTracks"改成"本仓库规格 `dsh-mpkg-wallpaper/docs/AUDIO-TRACK-SPEC.md`"）。
分发口径：`tools/` 不进 npm 包（`files` 白名单不含），但本仓库是**公开 git 仓库** ⇒ 仍按分发处理，故删除。

### 4. 长期规则：`docs/COPYING-RULES.md`（新建）

- **单向流动**：MIT 插件 → GPL 渲染器 ✅；GPL → MIT ❌（不得复制/改写/逐行翻译/粘贴注释与判定顺序）；
  第三方 **GPL-3.0** 代码只允许进渲染器且必须登记台账；**GPL-2.0-only 不可借**
  （`catsout/wallpaper-scene-renderer`、`waywallen/open-wallpaper-engine`）；`linux-wallpaperengine`（GPL-3.0-only）与
  `AnisPaper`（GPL-3.0）可借；`waywallen/waywallen`、`oneincase/webwallgl`、`elysia395/dsh-wallpaper-engine` 为 MIT。
- **借鉴台账格式**（六列必填）：来源仓库 / 文件 / commit 或 tag / SPDX / 日期 / 谁引入（另加"进哪个仓库 + 处置"）；
  首批登记 5 条（elysia 移植、glsl-parser、字体 7 件、音频段同源→洁净室处置、webwallgl 未 vendored）。
- **协议边界**：插件不得 import / 内嵌 / 转译渲染器 GPL 代码；两侧只走**进程 / HTTP 协议**；
  跨仓测试不得"切片执行"对方文件（本轮删掉的 `loadDemoOracle()` 就是反例）。
- **CLA**：当前无 CLA；若将来要卖闭源授权，需引入 CLA 并追溯已合并贡献者（历史贡献仍需单独授权）。
- 一句"**本文件不是法律意见**"写在文首。

### 5. 机器闸门：`publish-check.mjs` 新增"许可一致性自检"（第 ⑤ 节）

① `LICENSE` 首行 = `GNU GENERAL PUBLIC LICENSE` + `Version 3, 29 June 2007` + `or any later version` 措辞 +
`Copyright (C) 2026 XHR666`（package.json 若存在，其 license 字段必须 = `GPL-3.0-or-later` 且与之一致）；
② 姊妹目录 `dsh-mpkg-wallpaper` 必须仍是 **MIT**（LICENSE 无 GPL 文本；其 `dsh-mpkg-wallpaper/package.json` 的 license = `MIT`），
且本仓库**不得**出现插件的 vendored 副本（`lib/pkg-extract.js` 等）；
③ `docs/COPYING-RULES.md`（本仓库或工作区 `docs/`）+ `THIRD-PARTY.md` 在位；
④ vendored `webwallgl` 若有则必须带 MIT 声明；`assets/fonts/licenses/` 必须齐 OFL / Apache-2.0 / CC-BY-4.0 三类文件。

### 6. 证据（本次实测，可直接复现）

- `cd dsh-mpkg-wallpaper && bash tools/check.sh` → **8 步全绿**，末行 `全部通过 ✓`（退出码 0）。
- `node dsh-mpkg-wallpaper/tools/audio-scan-test.mjs` → `✓ 全部通过  （pass=61 fail=0 skip=0）`（旧版 pass=35）。
- `node dsh-mpkg-wallpaper/tools/audio-scan-bench.mjs` → `与规格参考实现逐项一致: ✓ 11/11   二次扫描命中缓存: ✓ 11/11`。
- `node publish-check.mjs` → `✓ 无阻塞项：可以进入人工复核`（退出码 0）；许可 5 行 info（无 package.json / 插件 MIT /
  台账 `docs/COPYING-RULES.md` / webwallgl 未 vendored / 字体许可 12 文件）。
- `node docs-check.mjs` → 退出码 0。
- `bash run-all-tests.sh` → `══ 汇总：PASS=62 FAIL=0 SKIP=1 / 总 63 项`（退出码 0；与 P-88 基线**逐项相同**，唯一 SKIP 仍是既有的条件项 `jpeg-decode`）。
- `node diag-flag-check.mjs` → 开关数不变（114 == 114，0 差异）。
- LICENSE 自证：`head -1 LICENSE` = `                    GNU GENERAL PUBLIC LICENSE`；`wc -c` = **36,452**；
  `head -c 35147 LICENSE | cmp - /usr/share/common-licenses/GPL-3` → 无差异（条款原文逐字节相同）。

### 7. 回退（回到"不改许可"的状态）

- **许可层（不涉及任何代码）**：`cp archive/LICENSE.MIT.bak-20260916 LICENSE`（可 `cmp` 验证逐字节回到 P-88 的
  21 行 MIT 全文）；再删掉 `docs/README-PUBLIC.md` §5 的新增条目与 `THIRD-PARTY.md` §5–§7 三段，即回到旧的许可表述。
  渲染器**没有任何代码逻辑**与许可相关（只改了文档 + LICENSE + 闸门脚本）。
- **洁净室层**：旧音轨段**从未提交**（`git show HEAD:lib/pkg-extract.js` 对 5 个旧标识符命中 0），所以不存在
  "回到旧段"的仓库状态可回退；要回退只能 `git checkout -- lib/pkg-extract.js`（回到 HEAD 的**没有音轨段**的版本）。
  新版闸门 `tools/audio-scan-test.mjs` 是自洽的（不依赖渲染器），旧版可 `git show HEAD:tools/...` 取回（不建议，
  会重新引入跨仓切片依赖）。
- **删除层**：4 个 Python 文件在 git 历史里（`git show HEAD:tools/unmpkg.py` 等可取回），但按用户决定**不要**恢复。
- **闸门层**：删掉 `publish-check.mjs` 第 ⑤ 节即可回到"只查体积/隐私/专有文件"的旧行为。

### 8. 未定项（本轮没做/没验的）

1. **我不是律师**：MIT 插件被 GPL-3.0-or-later 渲染器 import 的组合按通行理解合法（MIT→GPL 单向允许），
   但**没有律师意见**；渲染器再分发时**必须**携带插件的 MIT 声明（`THIRD-PARTY.md` §7）。
2. **`AnisPaper` 的 only/or-later 表述冲突**未核实（`docs/LICENSE-COMPAT-REVIEW.md` 已列为未定项）；本轮未借其代码。
3. **`tools/` 删除后若有用户依赖**这些 Python 工具，需要另行通知并给替代（本轮未通知任何用户；
   研究结论仍在 `dsh-mpkg-wallpaper/tools/MDL-格式分析笔记.md` 与 `dsh-mpkg-wallpaper/docs/`）。
4. **profile 里在跑的旧副本未同步**：`$MPW_ROOT/.dsh/profiles/web/node_modules/dsh-mpkg-wallpaper/lib/pkg-extract.js`
   仍是含同源段的旧版本；且 `update-plugin.sh` **只同步 client.js/index.js/package.json/cordis.patch.yml，
   不含 pkg-extract.js** ⇒ 需要手工 `cp` 该文件到 profile 才会让重写生效（本轮按"不发布/不动运行环境"处理，未同步）。
5. **`webwallgl` 的 MIT 声明文件**：上游仓库里确有 LICENSE，但本仓库未 vendored ⇒ 只登记"未分发"；
   若将来引入，`THIRD-PARTY.md` §6 必须升级为正式条目（闸门会在检测到 vendored 文件却无 MIT 声明时阻塞）。
6. **`0xFFF1` 行为修正的下游影响未穷举**：真包语料 11/11 无 ADS/ADTS 音轨，故 MIME 修正只在自造夹具上验证；
   渲染器侧（GPL）`demo.html` 的同名判定仍是旧顺序（属渲染器自有代码，本轮不动）。
7. **字体 / 第三方声明未逐一复核**：本轮只做"文件在位"的机器闸门，未重新核对每个字体的 sha256 与上游 URL
   （P-86 已逐文件核过一次，结论未变）。

---

## P-90（2026-09-16 质量档位 + 抗锯齿）`?q` / `?aa` / `?pp` 三档落地 + FXAA（借 MIT）+ 原生 MSAA —— 用户点名的 P0-2

> 任务书：P0-2「质量档位 + 抗锯齿（AA）」。**只改 `we-scene-demo/`**（另一条线在改 `dsh-mpkg-wallpaper/`；
> 本轮唯一在该仓之外的写入是 `docs/COPYING-RULES.md` §4 的**借用台账**，那是任务书第 1 项明确要求的）。
> **未 commit / 未 push / 未发布。**

### P-90.1 上游语义**确认结论**（全部读代码取证，不靠 README 转述）

取证方式：本机 `vendor-ref/webwallgl/` 是 `oneincase/webwallgl` 的 git 检出，含 `origin/main`；
下面每条都用 `git show origin/main:<路径>` 逐行读过。**上游 HEAD = `fdfc578a577d0e680a9cfe2cf2e3e825d3cd2372`**
（`feat: 渲染质量档位 1.3.23 + 透视层 3D 倾斜 + 背景纹理合成三修`，2026-09-15，`package.json` version `1.3.23`）。

三组档位的**真值表与默认值**（`renderer/src/quality.ts:22-26`）：

| 档位 | 取值 | **默认** | 控制什么（上游） |
|---|---|---|---|
| `aa`（抗锯齿） | `off` / `fxaa` / `msaa2` / `msaa4` | **`off`** | `fxaa` = 帧末后处理 pass（平滑**所有**边缘，含纹理 alpha 边）；`msaa2`/`msaa4` = 多重采样（**只**平滑几何边缘）；**单选不叠加**（`api/types.ts:275-282` 注释原文） |
| `pq`（**粒子**质量） | `off` / `low` / `medium` / `high` | **`high`** | 粒子**数量（`maxcount` 上限）与发射率**的倍率；`off` 由装配层直接跳过粒子推进与渲染 |
| `pp`（后处理） | `off` / `low` / `medium` / `high` | **`high`** | `off` = 效果链直通 + 跳整屏后期层 + 关内置 Bloom；`low`/`medium`/`high` = 效果链**保持开**，只改效果链 FBO 的**分辨率预算** `fboCapFactor` |

**① `pq` 的 `0.4 / 0.7 / 1` 是什么口径 —— 已确认：`0.4/0.7/1` 是「粒子数量（`maxcount` 上限）与发射率」的倍率，
既不是分辨率比例、也不是内部渲染尺寸。**（`quality.ts:29-33` 的 `PARTICLE_QUALITY_SCALE = {low:0.4, medium:0.7, high:1}`，
注释原文「粒子质量档 → 数量/发射率倍率。off 不经过这张表（装配层直接跳过粒子）」；消费点在
`renderer/vendor/we-scene/render/particles.js:186` 的 `maxcount` 封顶与发射率两处（同文件 `:297`/`:313`），见
`docs/WEBWALLGL-UPSTREAM-STUDY.md` §5 表。）这条**必须记一笔**：字面上 `0.4/0.7/1` 极易被误读成"渲染分辨率比例"。
**我们没实现 `pq`**（本仓库粒子预算走既有的 `PARTICLE_BUDGET` / `?perf=auto` 阶梯，另起一套会打架），
`README-DIAGNOSTICS.md` 的"上游有、我们没有"小节把这个结论留档了。

**② `pp` 三档门控了哪几处 —— 已确认，上游是 3 处**（`renderer/vendor/we-scene/render/renderer.js:2429`；同文件 `:2512`/`:2933`，行号为 origin/main）：

| # | 门控 | 上游位置 | 效果 |
|---|---|---|---|
| 1 | 图层效果列表置空（该层走直通） | `renderer.js:2933`（直通实现 `:2956-2966`） | 单层 effect chain 不再 ping/pong |
| 2 | **整屏后期层**（`isPostProcess`）整层跳过 | `renderer.js:2429` | 标了后期层标志的层不画 |
| 3 | 内置 Bloom 关闭 | `renderer.js:2512` | 不再做 1/4 分辨率 bloom |

附带：`fboCapFactor = 0`（`quality.ts:37-42` + `renderer.js:211-227`）在 `off` 档**没有消费者** ——
`off` 走的是 `setEffectsEnabled(false)`（门控 1–3），不是"把分辨率压到 0"。
**我们只落了 2 处**（门控 1 与 3）：门控 2 在本渲染器**无落点** —— **源树 0 命中实代码（仅 2 处注释：
`core/we-scene-bundle.js:6028`、`core/we-scene-bundle.js:10544`）**，我们从来不解析、也不产出"整屏后期层"这种层。
⚠ **原文的"全树 `isPostProcess` 0 命中"不成立**（2026-09-18 更正）：tracked 的**预构建参考产物**
`demo/assets/renderer-BOSoB05I.js` 有 **8 处实代码命中**（`:265` ×2、`:606` ×1、`:607` ×4、`:717` ×1）——
那是 **vendored 的上游 minified 产物**（本仓库不重建、不修改其字节），**不是本仓库源码**。
该产物的死活定性与三类计数见 P-90.10。这是**已知的移植缺口**，写进 P-90.6 未定项。

**③ `setQuality` 是热更还是重建 —— 已确认：热更，不重挂载。** 证据链：
`renderer/src/api/types.ts:391-398` 注释原文「渲染质量设置热更……**就地生效，不重挂载**（与 `setRenderDpr` 不同）」；
`renderer/src/scene-mount.ts:1979-1989` 的 `applyQuality()` 只调
`renderer.setAntiAliasing?.()` / `setEffectsEnabled?.()` / `setFboCapFactor?.()` / 粒子池重建，
**没有任何 context / canvas 重建**。上游 MSAA 之所以能热切，是因为它做在**离屏多重采样 FBO/RBO** 上
（`renderer.js:438-477` 建、`:425-431` 采样数、`:2507` → `:493-521` 帧末 resolve）——
`msaaResolve` 是 1.3.23 新引入的（同属 `fdfc578`）。
**我们走的是另一条路**（默认帧缓冲原生 `antialias`），取舍见 P-90.3。

**④ 上游 MSAA 不可用时的行为**：`renderer.js:455-456`「驱动不支持 Nx 多重采样，**回退 off**」+
`:471-472`「FBO 不完整，**回退 off**」—— 即**回退 off 并只留一行 diag**。
**我们改回退 `fxaa`**：用户显式点了 `msaa` = 明确要抗锯齿，回退 `off` 等于**静默丢掉**该诉求，
而 FXAA 是同一诉求的另一条可行路径（理由也写在 `resolveAaMode` 的注释里）。

**⑤ 不确定 / 没读到上游判据的**（不当结论用）：

- 上游 `postProcessing:'off'` 在**别的壁纸**上是否等价于 WE 客户端的"关后处理"：上游自己的
  `scripts/verify-quality.mjs:154-186` 全是文本/数值断言，**没有像素级判据**。
- `msaaResolve` 在真实 WebKit/WKWebView 上的修法效果：只能读到 `renderer.js:485-492` 的注释，
  **本机没有 WebKit**（承接 `docs/WEBWALLGL-UPSTREAM-STUDY.md` §7 第 5 条，仍未验证）。
- `paintStatusChrome`/`bench.ts` 那三下拉的**持久化**：上游 `localStorage['webwallgl-quality']` 的
  `loadQuality/saveQuality` 属**测试台 UI 层**；本轮我们**没做 UI**（任务书只要 URL 开关 + 热更 API），
  `localStorage` 持久化**未实现**（不属本轮范围，也不是"漏做"）。

### P-90.2 我们实现了什么（新增 URL 开关 + 语义）

| 开关 | 取值 | **我们的默认** | 语义（我们的实现） |
|---|---|---|---|
| `?q=` | `off` / `low` / `medium` / `high` | **`off`** | **内部渲染档位（内部渲染分辨率比例）**：`off` = **不启用**离屏内部渲染路径；`low`/`medium`/`high` = 整场景画进 **0.5×/0.75×/1.0×**（偶数对齐）的离屏 FBO，帧末**双线性上采样**回画布（1 次全屏 draw） |
| `?aa=` | `off` / `fxaa` / `msaa2` / `msaa4` | **`off`** | `fxaa` = 帧末全屏 FXAA pass（`runAA`，排在 `runBloom` **之后**）；`msaa2`/`msaa4` = WebGL2 原生多重采样（context `antialias:true`，浏览器 present 时自动 resolve）。**两条回落路径都写日志**：实测 `gl.SAMPLES` 不足 ⇒ 回落 `fxaa`；`q != off`（单采样离屏 FBO）⇒ 回落 `fxaa` |
| `?pp=` | `off` / `low` / `medium` / `high`（**`0` 保留旧义**） | **`high`** | 照上游：`fboCapFactor` = `0.5 / 1 / 0`（逐值照抄 `POST_FBO_CAP`）；`off` = 图层效果链直通（门控 1）+ 关 Bloom（门控 3） |

**`?q` 是我们自研的一档**（上游 1.3.23 **没有**它：上游画布尺寸由 `shell.ts` 的 `renderDpr` 管）——
理由：本仓库**已有** `?res=` 管**画布**尺寸（P-68），缺的正是"画布不变、内部怎么渲"这一档，
两者**正交**（`?res=720p&q=low` ⇒ 1280×720 画布 / 640×360 内部，测试有断言）。

**`?pp=` 是扩展取值域、不是新名字**：本仓库 `?pp=0` **早已是**"粒子退回正交相机"开关
（RE-37，`/[?&]pp=0/` 正则字面量，`PP_DISABLED`）⇒ 我们**不动那条正则**，只让
`off|low|medium|high` 进后处理档；`pp=0` 走旧义并在启动日志写一行
`pp=0 走既有粒子正交相机旧义(RE-37)`。**副作用（已在 README 主表 `pp` 行写明）**：
`pp` 这个**名字**在 `diag-flag-check` 里**早已登记** ⇒ 本轮名字总数 **114 → 117**（`q` + `aa` + 插件侧新增的 `mpwshim`），
**不是** 114 → 117 里的"`pp` 算新增"。

**AA 的落地选择（有意的取舍，与上游不同路）**：我们**不**复刻上游的离屏多重采样 FBO/RBO + 帧末 resolve，
而是用**默认帧缓冲的原生 `antialias`**。理由：① 零额外 FBO、零 resolve pass；② 绕开上游
`renderer.js:485-492` 注释里记的 WebKit `resolve` blit 被 `INVALID_OPERATION` 静默拒绝那个坑
（该坑的表现正是"画面冻结在切换前最后一帧"，见 `docs/WEBWALLGL-UPSTREAM-STUDY.md` §2.3）。**代价**：
`antialias` 是 **context 创建属性**，WebGL 规范没有运行期改采样数的 API（`gl.getContextAttributes()` 只读）
⇒ **`msaa2`/`msaa4` 档改档需刷新页面**。这一条**必须让用户看见**，所以运行期
`setQuality({aa:'msaa4'})` 会**显式记一行"需刷新页面"**、并把档位**如实回退**成旧值（**不谎报已生效**）。
`off ↔ fxaa` 是**真热更**（只切一个布尔 + 懒编译程序）。

**`?aa=off&q=high&pp=off` 能不能逐位回到改动前？——不能，而且不承诺。**
这里要把话说准（任务书原文是"`?aa=off&q=high&pp=off` 必须能逐位回到改动前"，但该组合里
`q=high` 与 `pp=off` 是**两个显式非默认档**）：`q=high` 按定义**要走**离屏路径（内部尺寸 = 画布，
但**多一次上采样 draw**），`pp=off` 按定义**要关**效果链与 Bloom —— 它们**本就应该改变行为**。
真正承诺"逐位 = 改动前"的是**三档全默认**（`q=off` / `aa=off` / `pp=high`，也即**不加任何新开关**），
证明见 P-90.4。**`?aa=off` 单独加上去是逐位相同的**（它与默认同值）。

### P-90.3 默认值论证（**同时**满足"与现状逐位相同"与"按上游默认"）

| 档位 | 我们的默认 | 上游默认 | "与现状逐位相同"的机理 |
|---|---|---|---|
| `q` | `off` | （上游无此档） | `q=off` ⇒ `qRenderScale()` 返哨兵 `0` ⇒ **不建离屏 FBO、不加帧末上采样**、`width/height` 原样不遮蔽 ⇒ 与改动前同一批 GL 调用 |
| `aa` | `off` | `off` | `aa=off` ⇒ `getContext` 实参仍是 **`antialias:false`**（与改动前**逐字相同的对象字面量**）、不建 FXAA 程序、`runAA` 零 GL 调用 |
| `pp` | `high` | `high` | `pp=high` ⇒ `fboCapFactor = 0`（全质量）、效果链与 Bloom 全开 ⇒ 与改动前一致 |

⇒ **三个默认值互不冲突地同时满足两条口径**（任务书说"选哪个都要给理由"：这里不需要取舍，
两边指向同一个值）。另外 `q`/`aa` 的默认取 `off` 也正是任务书原文括注的"默认 off/现有行为"。

### P-90.4 "默认档逐位相同"是怎么**验**的（不靠嘴说）

1. **结构性**：默认路径上每个 P-90 分支都退化成改动前的那个表达式 ——
   `sceneTargetFbo()` 返回 `null`（原本就是 `bindFramebuffer(t, null)`）、`fboCapFactor=0`、
   `fxAllowed()` 不受 `pp` 影响、`runBloom` 不早退、`runAA` 空操作。
2. **操作性（本测试）**：`quality-tiers-test.mjs` ② 段断言默认档
   ① **零** P-90 专属 GL 对象（不建 `q-scene` FBO、不建 `aaScene` 回读纹理、不做 `copyTexSubImage2D`）；
   ② GL 调用序列与**显式** `?q=off&aa=off&pp=high` **逐项相同**（同长度同内容）；
   ③ 所有 draw 的目标都是 `null`（默认帧缓冲，没有画进任何离屏 FBO）；
   ④ 逐层 **rect/mvp 逐位相同**。
   FXAA 程序是**懒编译**的：`aa=fxaa` 比 `aa=off` 恰多 **2 个** program（fxaa + q 呈现各一）。
3. **独立冻结基线（这是"vs 改动前"的硬证据）**：`package-matrix.mjs --check` 与
   `package-baseline.json`（**2026-09-12 生成，远早于 P-90**）逐包逐字段比对，其中含
   **`audit.draws`（每包 drawArrays 计数）**，覆盖语料 107 个包。该门禁在 `run-all-tests.sh` 里，
   本轮**全绿** ⇒ 默认路径的 draw 序列在 107 个真实包上**没有变化**。

### P-90.5 改动文件清单

| 文件 | 改动 |
|---|---|
| `core/we-scene-bundle.js` | ① 新增纯函数区 `QUALITY_TIER_VALUES` / `DEFAULT_QUALITY_TIERS` / `Q_RENDER_SCALE` / `PP_FBO_CAP` / `AA_MSAA_SAMPLES` / `normalizeQualityTier` / `parseQualityTiers` / `qRenderScale` / `qInternalSize` / `ppFboCap` / `resolveAaMode` / `describeQualityTiers`；② 新增 `FXAA_FS`（**借上游 MIT**，见 P-90.7）与 `Q_PRESENT_FS` 两个着色器常量；③ `createRenderer` 里解析三档（`new URLSearchParams(location.search).get('q'/'aa'/'pp')` **同形写法**，`diag-flag-check` 能抓到）、context 创建按 `aa` 取 `antialias`、实测 `gl.SAMPLES`、启动日志自报；④ `runAAPass` / `presentInternalScene` / `ensureAaProgs` / `ensureAaSceneTex` + 帧令牌幂等；⑤ `frameTarget`/`sceneTargetFbo()` 间接层，把 6 处"屏幕"出口（HDR 呈现、screenblend、copybackground、效果链兜底、层循环入口、q 上采样）统一走它；⑥ `renderScene` 开头按 `q` 建内部 FBO 并遮蔽 `width/height`、帧末上采样；⑦ `pp` 门控接进 `fxAllowed()` 与 `runBloom()`；⑧ 导出 `runAA` / `setQuality` / `getQuality` / `qualityStats`；⑨ `fboCapFactor` 初值改由 `pp` 档给 |
| `demo.html` | 帧循环里在 `runBloom` **之后**加一处 `renderer.runAA(cv.width, cv.height)`（`aa=off` 时空操作） |
| `quality-tiers-test.mjs` | **新增**：90 条断言 / 6 组（真值表 / 默认逐位相同 / 各档确有差异 / FXAA 真在链里 / 热更 / 与既有开关组合） |
| `run-all-tests.sh` | **加一行** `add "quality-tiers" "node quality-tiers-test.mjs"` |
| `README-DIAGNOSTICS.md` | 主表新增 `q` / `aa` 两行、**重写 `pp` 行**（旧值 `0` 语义保留 + 新档）、`mpwshim` 一行（插件侧，见 P-90.6）；表外新增"上游有、我们没有的档位：`pq`"小节（**刻意放表外**，理由见该节） |
| `THIRD-PARTY.md` | **§6 从"未 vendored"升级为完整署名条目**（MIT 全文 + 逐文件表 + commit + 字节级核对结论 + 许可流向）—— 这正是 P-89 未定项第 5 条预告要做的事 |
| `docs/COPYING-RULES.md`（仓库外，任务书第 1 项要求） | §4 台账新增 **#6**、§2.3 表格里 `webwallgl` 一行从"当前未 vendored"改为"P-90 已借（仅一个 shader）" |

### P-90.6 本轮**踩到/发现**的真问题（测试抓出来的，值得记）

1. **`sceneTargetFbo()` 一度返回 FBO 的"包装体"而不是裸 `WebGLFramebuffer`。**
   `getFBO()` 返回的是 `{fbo, tex, width, height, hdr}`，而 `gl.bindFramebuffer(t, X)` 要的是**裸对象**。
   初版把包装体存进 `qfbo.fbo` ⇒ 真实 WebGL 下会直接抛 `TypeError`（mock 下表现为"所有 draw 的
   目标都是 null"，因为不可识别对象取不到 id）。**是 ② 段"q=low 真的画进离屏 FBO"这条断言抓出来的**
   —— 该断言第一版写成比对 FBO 的 tag 字符串，改成"draw 目标是否非 null"后才暴露真 bug。
   现记 `{entry, fbo, …}` 两个字段并在注释里点明口径。
2. **`q` 的 FBO 失败必须不静默**：`getFBO()` 在 FBO 不完整时会回退 1×1（本仓库既有防线）。
   我们据此**当帧**按 `q=off` 渲染并记一行 `q=… 的内部渲染 FBO 不可用（回退 1x1）`，不假装档位生效。
3. **`aa` 的帧令牌初值**：首帧 `renderScene` **之前**调 `runAA` 会对一块没画过的画布做回读 + 滤波。
   初值设为 `token === seq === 0` ⇒ 首帧前空操作。
4. **`mpwshim` 不是我们加的**：`diag-flag-check.mjs` 按设计**同时扫** `dsh-mpkg-wallpaper/lib/client.js`，
   插件侧那条线新增了 `mpwshim`（网页壁纸沙箱 shim 通道标记）⇒ 我们这边的主表**必须**同步登记，
   否则双向比对必红。本轮按"只读对方代码 + 只改本仓文档"处理（**没有碰插件仓一个字节**）。
5. **HDR 熔断重试那一行会把内部比例乘两次**（自查发现的真 bug，已修）：`renderScene` 里 `width/height`
   被 `?q=` 遮蔽成**内部尺寸**之后，HDR 熔断的
   `return renderScene(scene, textures, width, height, time, true)` 会把**内部尺寸**当成新的输出尺寸传进去
   ⇒ `q=low` 下 640×360 再乘 0.5 = 320×180，且帧末上采样目标也缩成内部尺寸（画面只铺满画布一角）。
   改为传**原始输出尺寸** `__qOutW/__qOutH`。回归覆盖：`quality-tiers-test.mjs` ⑤ 段加了
   「连续 3 帧内部尺寸恒为 640×360（无累积缩放）」+ 一条源码不变量断言
   （该路径要真机 HDR 浮点 RT 报错才触发，本机无 WebGL2 走不到，故必须同时留源码守卫）。

### P-90.7 借用的 MIT 代码（署名 + 台账）

- **借了什么**：**一个 shader** —— 上游 `renderer/vendor/we-scene/render/renderer-glsl.js:452-489` 的 `FXAA_FRAG`
  （即上游 452–489 行）→ 我们的 `core/we-scene-bundle.js` 常量 `FXAA_FS`。
- **commit**：`fdfc578a577d0e680a9cfe2cf2e3e825d3cd2372`（1.3.23，2026-09-15），SPDX **MIT**，
  版权行 `Copyright (c) 2026 oneincase <462534624@qq.com>`。
- **核对**：规范化（去注释/空行/缩进）后与上游 **38/38 行 GLSL 完全一致**，一个 token 都不差；
  算法常量原样保留（`SPAN_MAX 8.0` / `REDUCE_MUL 1/8` / `REDUCE_MIN 1/128` / `LUMA .299 .587 .114`）。
- **署名位置**：`core/we-scene-bundle.js` 里 `FXAA_FS` 上方的注释块（含上游路径 + 行号 + 移植差异清单）、
  `THIRD-PARTY.md` **§6**（MIT 全文 + 逐文件表）、`docs/COPYING-RULES.md` §4 台账 **#6**。
- **没借什么**（避免夸大或漏认）：顶点着色器复用本仓库既有的 `BLOOM_VS`；`?aa/?q/?pp` 的档位解析、
  pass 编排、回读、帧令牌、MSAA 回落策略、`setQuality` 全是自写；**`renderer/src/quality.ts` 没有复制**
  （只对齐"档位含义"这类事实，实现自写）。
- **GPL-2.0-only 项目零接触**：本轮没有从 `wer-ref/`（`Aromatic05/wallpaper-engine-renderer`）、
  `waywallen/open-wallpaper-engine`、`catsout/wallpaper-scene-renderer` 复制任何代码，
  **也没有从它们抄常量表**（`AA`/`pp` 的常量表逐值来自 MIT 的 `quality.ts`，有行号）。

### P-90.8 测试与门禁

- `node quality-tiers-test.mjs` → **90 断言 / 0 失败**（6 组，见 P-90.4 与文件头注释）。
  夹具：`3326873240`（62 层 / 14 效果层，通用）、`3719111841`（43 层 / 23 效果层，`pp=off` 门控实测
  draw **51 → 25**）、`3778592720`（`general.bloom=true`，bloom 门控）。缺夹具时对应段**整体 SKIP 不红**。
- `bash run-all-tests.sh` → 全绿（含 `package-matrix --check` 对 107 包冻结基线的比对，见 P-90.4 第 3 条）。
- `node diag-flag-check.mjs` → **0 差异**，两边 **117 == 117**（改前 114 == 114）。
- `node docs-check.mjs` → 退出码 0。
- `node demo-syntax-check.mjs` → 8/8 通过（改了 `demo.html`）。

### P-90.9 明确**未定 / 没验**的（不要当结论用）

1. **像素级效果一律没验**：本机**无 WebGL2**（真机实测 `WEBGL2_UNAVAILABLE`）⇒ 所有断言都在 mock-GL 上，
   验的是 **GL 调用序列 / FBO 与纹理对象 / 内部尺寸 / 门控 / 档位记账**。
   「FXAA 真的让边缘更平滑」「MSAA 只治几何边」「`q=low` 上采样后的观感」**都需要真机像素对照**，
   本轮**没有**这个证据。
2. **门控 2（整屏后期层）无落点**：我们从来**不解析** `isPostProcess`（**源树 0 命中实代码，仅 2 处注释**，
   见 P-90.10）⇒ `pp=off` 只落了上游 3 处里的 2 处。
   若将来接入整屏后期层，这一处必须补上，否则 `pp=off` 会与上游语义分叉。
   ⚠ **"无落点"指"本渲染器不解析"，不等于"全树 grep 0 命中"**：预构建参考产物
   `demo/assets/renderer-BOSoB05I.js` 有 **8 处实代码命中**（vendored 上游产物，非本仓库源码），见 P-90.10。
3. **`?aa=msaa2/msaa4` 在真机上的实际采样数未知**：`gl.SAMPLES` 的实测值要真机才拿得到；
   启动日志已把 `context antialias=… ，实测 SAMPLES=…` 打进去，供真机一轮回报。
4. **`msaa` 档与 `q != off` 不能并用**（q 的离屏 FBO 是单采样 ⇒ 回落 FXAA）。这是当前实现的**硬限制**，
   不是 bug；要两者兼得必须改成上游那种"多重采样离屏 FBO + resolve"路线（本轮按取舍没做）。
5. **`localStorage['webwallgl-quality']` 持久化没做**（上游那属测试台 UI 层，本轮任务书只要求 URL 开关 + 热更 API）。
6. **本机语料只有 11 个包带 `allwallpaper/dd/<id>/scene.pkg`**（`allwallpaper/dd` 下 22 个目录）⇒ 效果链/Bloom 门控只在
   上述 3 个夹具上实测过，未穷举全部语料。

### P-90.10 `isPostProcess` 口径更正（2026-09-18）：原文"全树 0 命中"**不成立**，预构建产物例外 8 处

**触发**：审计点 N10（`docs/REMAINING-WORK-20260918-B.md` / `docs/TODO-AUDIT-20260918.md`）指出
P-90.1 那句"全树 `grep isPostProcess|postProcess` **0 命中**"与实测不符。

**复核命令**（在本仓库根跑；按**出现次数**计数，不能按行数 —— minified 产物一行里可以有 4 处）：

```bash
grep -ro "isPostProcess" --include='*' . | grep -v node_modules | cut -d: -f1 | sort | uniq -c
```

**复核结果 · 三类计数（2026-09-18，基线 `31643beb`）**

| 类别 | 落点 | 出现次数 | 形态 |
|---|---|---|---|
| **源树 · 实代码** | —— | **0** | 本渲染器源码确实**不解析** `isPostProcess` |
| **源树 · 注释** | `core/we-scene-bundle.js:6028`、`core/we-scene-bundle.js:10544` | **2** | 两行**行首即 `//`**，纯叙述（复述上游三处门控 / 标 P-90 未定项） |
| **预构建产物** | `demo/assets/renderer-BOSoB05I.js:265`（×2）、`:606`（×1）、`:607`（×4）、`:717`（×1） | **8** | **全是实代码**：层次对象字段初始化（`:265`、`:717`）+ 6 处过滤/跳过判据 |
| **仓库文档** | `docs/PATCHES.md`（3 处）、`docs/README-DIAGNOSTICS.md`（1 处） | 4 | 叙述与表格文字 |

**统一口径**（对外一律用这一句）：

> **源树 0 命中实代码（仅 2 处注释）；预构建参考产物 `demo/assets/renderer-BOSoB05I.js` 例外（8 处）。**

⚠ 顺带纠正审计原文的一个数字：审计写产物 **7 处**，逐**出现次数**复核是 **8 处**
（按"含该串的行数"数是 4 —— `:607` 一行里就有 4 处；两种数法都不是 7）。

**产物定性：`demo/assets/renderer-BOSoB05I.js` 是"活引用的 vendored 预构建物"，不是死文件**

| 问题 | 结论 | 证据（file:line / 命令） |
|---|---|---|
| 谁加载它 | `demo/renderer/index.html` 以 `<script type="module" crossorigin src="../assets/renderer-BOSoB05I.js">` 加载 | `demo/renderer/index.html:36`（该页共 41 行、`body` 为空 —— 渲染器就是这一条 script） |
| 是不是 `demo.html` 的旧路径 | **不是**。根 `demo.html` 对本产物**零引用** | `grep -c renderer-BOSoB05I demo.html` → `0`；`demo.html` 是仓库自研"静态版（WebGL，当前页）"（438 KB，本日仍在改：`b962483`） |
| 什么时候加载 | 该页**同时**是本地 `:8901/wallpaper-engine-webgl/renderer/` 与 Pages `/demo/renderer/`（`../assets/` 相对路径就是为这两种布局写的） | `demo/renderer/index.html:34-35` 注释原文 |
| 会不会上线 | **会**。Pages 白名单整目录收 `demo/`，再把 `demo/` 拷成第二份 `/wallpaper-engine-webgl/`，产物自检**强制**要求该页存在 | `build-pages.mjs:34`（`PAGES_KEEP_DIRS` 含 `demo`）、`build-pages.mjs:145`（第二份拷贝）、`build-pages.mjs:154`（`MUST` 含该页）、`.github/workflows/pages.yml:48` |
| 谁在维护它 | **没有人**：单提交引入、此后未动 —— 上游 `oneincase/webwallgl` 1.3.23 的 minified 产物，仓库内**不可重建** | `git log --diff-filter=A -- demo/assets/renderer-BOSoB05I.js` → `987d9b3`（2026-09-16）；此刻 blob `d8c19e01`、`sha256 0b424f43…`、mtime 2026-09-15 06:17 |

**处置**：**不改产物字节**（vendored 预构建物：改了既不可重建，也破坏与上游的对拍口径）——
只在本节与 `docs/README-DIAGNOSTICS.md` 的 `pp` 行把口径写准。

---

## P-91（2026-09-16 分发形态 · §6.1 第 1 条）渲染器做成**可分发形态**：库入口 `mount()` + `package.json`（files/exports）+ 一键启动 + 单一自检入口

**依据**：`docs/SIMILAR-PROJECTS-RESEARCH.md` §6.1 第 1 条（"单文件 ESM（或 npm 包）+ 一个'打开即玩'的静态 Demo
—— 这是**唯一**能让我们 §5.1 的护城河被人看见的动作"）与 §6.3 的 **P0** 判据；§4.3 的劣势表（上游 npm 一行 /
CDN 一行引入，我们只有"克隆 + node 服务器"）。

**做了什么（逐条对 §6.1 第 1 条的三个缺口）**

| §6.1 说的缺口 | 本补丁的落点 |
|---|---|
| ①缺 `mount(container, opts)` 入口 | `core/we-scene.mjs`：**库入口**。画布 → `createRenderer` → 帧循环 → 帧末链（`render` → `runBloom` → `runAA` → `runPostFrameHooks`，**顺序与 `demo.html` 的 `frame()` 逐条一致**）→ `start/stop/pause/resume/resize/setScene/setTextures/setQuality/getQuality/dispose`。素材装载**故意不做**（那属宿主装载层，参考实现是 `demo.html` 的 `bootInstance()`）；注入点 `opts.createRenderer/raf/cancelRaf/now/document` 让它在 Node 里可被桩渲染器完整测试 |
| ②缺打包配置 | `package.json`：`type: module`、`exports`（`.`/`./bundle`/`./server`/`./hlsl2glsl`/`./package.json`）、`files` 白名单 23 条、`scripts`（start/test/check/pack:dry）、`engines.node>=20`、`license: GPL-3.0-or-later`（与 `LICENSE` 一致 ⇒ `docs/COPYING-RULES.md` §8 ① 的机器闸门）。**`private: true` 是发布锁**：本机 npm 未登录，发布由建仓线在登录后删除该行 |
| ③"打开即玩" | `start-demo.sh`：预检（node 版本 / 包解析器三条落点 / 语料 / 自带样例 / 端口）→ 起服务 → 打印可解析的 `URL: …` 行；`--check` 只预检（CI 用，退出码 3 表示预检失败）；`--open`/`--quiet`/`--port` |

**另外两件（用户第 3 项点名的"分发/可见性类"）**

- **一键 demo 启动**：`bash start-demo.sh`（见上）。
- **CI/自检入口收敛成一条**：`check.sh` = `docs-check` → `publish-check` → `diag-flag-check` → `run-all-tests.sh`
  （`--fast` 透传、`--no-gate` 只跑前 3 项、`--json` 机读）。它**不改变**任何一项的语义与退出码。

**①自证（贴命令与输出）**

```
$ npm pack --dry-run
npm notice package size: 1.9 MB   unpacked size: 4.9 MB   total files: 117
npm notice name: wallpaper-engine-web-loader   version: 0.1.0

$ node mount-test.mjs
mount-test：40 通过 / 0 失败（共 40 条断言）

$ node packaging-test.mjs
packaging-test：122 通过 / 0 失败（共 122 条断言）
  · 真 npm pack → tar -xzf → grep 个人绝对路径 = 0 命中
  · start-demo.sh 真起服务 → 首页 200、样例页 200、`URL:` 行可解析

$ bash check.sh --no-gate --json
{"pass":3,"fail":0,"skip":1,"stages":[{"name":"docs-check",…},{"name":"publish-check",…},{"name":"diag-flag-check",…},{"name":"run-all-tests","status":"SKIP"}]}
```

**①收尾实测（2026-09-16 02:4x，全量门禁）**

```
$ bash run-all-tests.sh --json
══ 汇总：PASS=68 FAIL=0 SKIP=1 / 总 69 项        （唯一 SKIP = jpeg-decode 条件项，缺真机截图）
GATE_EXIT=0
  · 新增 4 项全绿：mount / pwa / packaging / hlsl2glsl-coverage
```

**②单一入口实测（同一次收尾）**

```
$ bash check.sh --json
══ 自检汇总：PASS=4 FAIL=0 SKIP=0 / 总 4 阶段          （CHECK_EXIT=0，约 450s，含全量门禁）
{"pass":4,"fail":0,"skip":0,"stages":[{"name":"docs-check",…},{"name":"publish-check",…},
  {"name":"diag-flag-check",…},{"name":"run-all-tests","ms":450113}]}
```

**分发物实测（`npm pack` + 解包自查）**：`wallpaper-engine-web-loader-0.1.0.tgz` · **132 文件** ·
tarball **1.89MB** · 解包 **4.9MB**；`tar -xzf` 后逐文件 grep 个人绝对前缀 ⇒ **0 命中**（该断言已写进
`packaging-test.mjs` D 组，不是一次性手工检查）。

**自证抓到的一个真 bug（已修）**：`start-demo.sh` 的 `PORT` 原来**只赋值没 export** ⇒ 子进程读不到
`process.env.PORT`，`--port 9000` 会静默起在 8899。`packaging-test.mjs` 的 E 组（真起服务 + 真 fetch）第一次跑就
红了，已改成 `export PORT`。

**隐私收尾（同一补丁内）**：`server/we-scene-demo-server.mjs` 里两处写死的作者机绝对路径改为
`path.resolve(__dirname, '..')`（**解析结果与旧默认值逐字节相同**，已核）与"无 HOME 时退到系统临时目录"。
`files` 白名单里的 **`docs/` 整目录改成逐文件 `docs/UNTOUCHED-AREAS.md`** —— 目录级白名单会让任何后来加进
`docs/` 的文件（可能含作者个人路径）静默进 tarball；这条正是 `packaging-test.mjs` D 组抓到的（`docs/ONLINE-DEMO.md`
当时含一条真实个人路径）。

**未做（如实列）**：① **GitHub Pages 在线试玩**（静态托管下 `/pkg/<id>`/`/weassist` 不可用，需要先做"纯静态
模式"的装载层）；② `.d.ts` 类型声明（`mount` 的契约以 `mount-test.mjs` 的断言形式存在）；③ tarball 里不含测试台
（`run-all-tests.sh`/`check.sh`/60+ 个 `*-test.mjs` 都不在 `files` 里 —— 门禁要配语料才有意义，塞进 tarball 只会
让下载者跑出一堆 SKIP/FAIL 的假象）。

## P-92（2026-09-16 离线 PWA · 用户第 3 项）manifest + Service Worker：**只缓存 app shell，绝不缓存用户壁纸**

**做了什么**：`manifest.webmanifest`（`start_url=/?id=sample-synthetic`，**离线打开就有画面**；`display: standalone`；
3 个图标含 maskable）、`sw.js`（**module** worker，网络优先 + 缓存兜底，`activate` 清旧版本）、`sw-policy.mjs`
（**缓存判据，纯函数、单一事实源**）、`pwa-inject.mjs`（服务器侧注入，幂等，缺 `</head>` 原样返回）、
`icons/`+`tools/make-icons.mjs`（**程序化生成**，确定性，`icons/icons.json` 记 sha256 —— 与 `tools/make-sample.mjs` 同一处置，
不引入任何第三方图标素材），`server/we-scene-demo-server.mjs` 加 6 条静态路由 + 注入点。

**为什么默认关**：它会写 Cache Storage。部署时 `MPW_PWA=1` 全局开，或单请求 `?pwa=1`/`?pwa=0` 覆盖。
（这是**服务器侧**开关：`diag-flag-check.mjs` 的抓取源不含 `server/we-scene-demo-server.mjs` ⇒ README-DIAGNOSTICS 的
"代码 ↔ 文档双向 0 差异"口径不受影响；登记处是 `docs/PACKAGING.md` §4.1。）

**"绝不缓存用户壁纸"是断言而不是注释**：判据是**白名单**（黑名单漏一条就是把用户素材写进磁盘）。
✅ 只缓存 `/`、`/demo.html`、bundle、`/elysia/**`、`/vendor/hlsl2glsl/**`、`/assets/fonts/**`、`/icons/**`、
manifest/sw，以及**自带合成样例**的 `/pkg|project|type/sample-synthetic`；⛔ `/raw`、`?pkgpath=`、`?pkgurl=`、
`/pkgdir?d=`、`/weassist/**`（用户本机 WE 资产）、`/report`、`/shot`、`/shots/**`、**任何非 `sample-synthetic` 的
`?id=` 与 `/pkg/<id>`**、非 GET、跨源、`video/*`/`audio/*`/`image/jpeg` 响应、>8MB 响应、畸形百分号编码。

**①自证**

```
$ node pwa-test.mjs
pwa-test：107 通过 / 0 失败（共 107 条断言）
  · 判据正面 16 条 / 反面 21 条 / 响应判据 10 条
  · manifest 字段 + 图标尺寸与 manifest 一致（PNG 头实读）
  · 图标与生成器逐字节一致（tools/make-icons.mjs --check）
  · 真子进程服务：默认首页**不含**注入、?pwa=1 含、**去掉注入片段后与默认首页逐字节相同**（纯增量）
  · F6 六条静态路由 200 + content-type；F9/F10 线上 sw.js / sw-policy.mjs 与磁盘逐字节相同
```

**未做（如实列）**：① 浏览器端真离线端到端未跑（本机 chromium 在 proot 容器里跑 demo 会崩，见
`text-font-fallback-test.mjs` 文件头同一限制）；② module service worker 需 Chrome/Edge 91+、Safari 16.4+、
Firefox 111+，**不支持时只是没有离线**（`register()` 失败只写一条 `console.warn`）；③ Pages 上的离线仍受 P-91
"未做①"阻塞。

## P-93（2026-09-16 hlsl2glsl · §6.1 第 3 条 + §6.3 P1）借上游 MIT 转译器（vendored，逐字节）+ 把 98.2% 变成**会变红的断言**

**依据**：§6.1 第 3 条"**借上游实现，不重写**"（我方实测覆盖率 112/114=98.2%、官方 99.3%、真 HLSL 0/6）与
§6.3 **P1** 的完成判据原文"新增门禁项，把 98.2% 这个数字变成**会变红的断言**（而不是文档里的数字）"。

**做了什么**：把 `oneincase/webwallgl`（**MIT**）的 上游路径 render/hlsl2glsl.js（1401 行）与 render/hlsl-preprocessor.js
（423 行） **逐字节** vendored 到 `vendor/hlsl2glsl/`（含上游 `LICENSE` 全文与逐文件 blob/sha256 台账，
见 `vendor/hlsl2glsl/README.md`）；新增门禁 `hlsl2glsl-coverage-test.mjs`：按 `docs/HLSL2GLSL-COVERAGE.md` §2.1 的
**三态口径**（通过 / 可疑 / 抛错）逐文件过真实现，`glslangValidator` 在场时按**严格口径**（GLSL ES 300 真编译），
不在场时退化为"产出 + 残留 token + 括号平衡"并**在输出里标明是非严格口径**。include 解析用**本仓库自研**的
`common*.h`（不复制上游头表）。

**内存安全的语料裁剪**：本机语料单个包最大 321MB（`allwallpaper/dd` 合计 1.0GB），而本仓库门禁文档明确记录过
"内存压力导致假超时"的坑 ⇒ 门禁默认按体积升序最多取 4 个包、单包 ≤128MB、累计 ≤320MB，逐包顺序处理并立即释放。

**①自证（含"会变红"的自证）**

```
$ node hlsl2glsl-coverage-test.mjs
  取样包 : 4/11（3715743282@3.7MB, 3721991999@8.3MB, 3554161528@22.5MB, 3778592720@41.3MB）
  去重文件: 46（frag 23 / vert 23）⚠ 子集（文档口径 114）
  校验器  : /usr/bin/glslangValidator
  结果    : 通过 45 / 可疑 1 / 抛错 0 ⇒ 97.8%（文档基线 98.2%）
✓ hlsl2glsl 覆盖率回归通过      （rc=0，~3s）

$ MPW_H2G_MIN_RATIO=0.999 node hlsl2glsl-coverage-test.mjs; echo rc=$?
✗ hlsl2glsl 覆盖率回归：1 条断言失败 — 覆盖率 ≥ 99.9% — 97.8% = 45/46
rc=1                            ← **证明这条断言真的会红**，不是文档里的数字
```

**顺手补强的发布闸门（同一个合规缺口）**：`publish-check.mjs` 原来只按"**路径里含 webwallgl**"检查
vendored 代码的 MIT 声明 —— 而本补丁的 vendored 目录叫 `vendor/hlsl2glsl/`（路径里没有上游名，上游文件是
改名后放进我们自己目录的），**该规则抓不到它**（实测那条 info 只报"1 个文件"）。新增 **④b 目录级规则**：
`vendor/*/` 里只要有代码文件，就必须 ① 有 LICENSE/COPYING 且含许可关键字，② 在 `THIRD-PARTY.md` 里被点名。
**自证会红**：`mkdir vendor/__selfcheck__ && echo "export const x=1" > vendor/__selfcheck__/x.mjs && node publish-check.mjs`
⇒ `✗ 阻塞项 1 条：vendor/__selfcheck__/ — vendored 代码缺少许可全文` / rc=1；删掉该目录后 rc=0。

**台账与署名**：`docs/COPYING-RULES.md` §4 台账 **#8**；`THIRD-PARTY.md` **§9**（MIT 全文 + 逐文件表 +
"哪些**没有** vendored"的边界表）。方向是 MIT → GPL（允许），且**原 MIT 声明随分发保留**。

**未做（如实列）**：§6.3 P1 的**前半句"作为可选效果路径接入"未做** —— 它要改 `core/we-scene-bundle.js`，与本轮
并发线（洁净室重写）冲突，按"绝不并发改同一文件"的纪律让出。所以本补丁交付的是"转译器可用（可 import）+
覆盖率回归门禁"，**不是**"渲染器已经会用 HLSL 效果"。

## P-94（2026-09-16 §6.3 P0-2 收口）P-86 收口核查：字体表逐行一致 + 修掉 "§4.10" 的悬空指向

**依据**：§6.3 **P0** 第 2 条"P-86 收口：`text-font-fallback` 稳定绿；第 8 个字体要么收录（找到作者上游页）
要么把引用与 §4.10 的悬空指向改掉"，判据"`run-all-tests.sh --json` → `fail:0`；`find assets/fonts -maxdepth 1
-type f` 与 `THIRD-PARTY.md` §4.1 表逐行一致"。

**核查结论（三条判据全部满足，且**不需要**再动字体）**

| 判据 | 实测 |
|---|---|
| `text-font-fallback` 稳定绿 | 最近一次全量门禁 `== PASS text-font-fallback` → `✅ text-font-fallback-test：106 断言通过 / 0 失败` |
| `find assets/fonts -maxdepth 1 -type f` 与 §4.1 表逐行一致 | 7 个字体 + `README.md` = 8 个文件；§4.1 表恰列 7 个字体（Blackout 2 AM / monof55 / NotoSans-Regular / RobotoMono-Regular / Segment7Standard / spincycle_3d_ot / Twemoji.Mozilla），**无第 8 行** |
| 第 8 个字体 | 第 8 个字体 8bitOperatorPlus8-Regular.ttf（**不在**仓库里）**未收录**且**已如实登记**为 open item（`THIRD-PARTY.md` **§4.7**，不是 §4.10），`text-font-fallback-test.mjs` 的 T4k/T4k2/T5g 三条断言守着它（§4.7 的记录存在 / 文件确实不在仓库 / HTTP 404） |

**本补丁唯一改动**：`docs/SIMILAR-PROJECTS-RESEARCH.md` 里两处把它写成 `THIRD-PARTY.md` **§4.10** 的指向是**陈旧**
的（该文件没有 §4.10；实体是 §4.7）—— 改掉这两处陈旧指向，并在 §6.3 的 P0-2 行标注 **✅ 已收口（P-94）**。
**没有**为了凑"8 个字体"而收录任何来路不明的字体副本。

## P-95（2026-09-16 许可收口 · 洁净室重写）审计 §3.4 的 2 处点状同源 → 按规格重写（行为逐位不变）+ 90+ 处「官方/真值源」口径修正 + 补两行许可表

**背景**：`docs/WER-REF-LICENSE-AUDIT.md`（DSHarea 根，2026-09-16）判定我们与第三方参考实现
`wer-ref/`（= `Aromatic05/wallpaper-engine-renderer`，**GPL-2.0-only**，与本渲染器 GPL-3.0-or-later
**双向不兼容**；本机副本**仅行为对照**）之间有 **2 处点状同源**（合计约 11 行）：

| # | 审计判定 | 改前位置（内容锚点） | 上游对应 |
|---|---|---|---|
| 🔴 1 | **逐行翻译**（同名仅大小写、同 3 分支顺序、同魔数 `1`/`100`、同返回；注释自认"逐分支同构"） | `core/we-scene-bundle.js` 的 `normalizeImageAlpha` | `WPImageObject.cpp:59-63` `NormalizeImageAlpha` |
| 🟠 2 | **同源改写**（同一张 token→轴→方向表 + 同一种子串分派 + 同 `center` 短路；注释自认"逐分支同构"） | `core/we-scene-bundle.js` 的 alignment 偏移旧标识符（逐字引文见 `docs/WER-REF-LICENSE-AUDIT.md` §3.4 片段 2） | `WPImageAlignment.hpp:24-36` |

**改法（严格按 `docs/COPYING-RULES.md` §5 五步）**

1. **先写规格**：新增 `docs/IMAGE-ALPHA-ALIGN-SPEC.md` —— 只写**行为需求**（输入域/取值/边界/默认/返回值语义、
   token 文法/轴/方向/未知兜底），来源限定为"调用方需求 + 既有测试断言 + WE 公开文档/包格式事实"；
   **不写**任何第三方函数名/行号/数据结构/分支写法，并显式禁止实现者照着外部结构写。
2. **只依据规格重写**（同一提交内删除旧实现，不留注释掉的老代码）：

| 维度 | 改前 | 改后 |
|---|---|---|
| **① 命名** | `normalizeImageAlpha` / alignment 偏移旧标识符 | `coerceImageAlphaMode` / `alignmentOffsetForToken`（+ 辅助 `classifyAlphaDomain` / `saturateUnitInterval` / `readAlignmentAxisSigns`）。旧标识符在全仓（代码+测试+文档）**0 处使用**，字面量仅存于审计逐字引文、"否定式源码守卫"与规格文档的改名对照表 |
| **② 结构与分支组织** | 顺序短路的三段 `if`（非有限→百分数→clamp）；嵌套三元 + `String.includes` 逐 token 分派 | **分类与换算分离 + `switch` 分派**（`classifyAlphaDomain` → `'nonfinite'/'percent'/'beyond'/'unit'`）；**先解析出轴符号二元组、再查表**（`readAlignmentAxisSigns` → `ALIGNMENT_HALF_SHIFTS['x,y']`，token 字形与偏移量彻底解耦） |
| **③ 常量表达** | 裸魔数 `1` / `100`；token→(轴,方向) 常量表 | 具名常量 `ALPHA_UNIT_MAX` / `ALPHA_PERCENT_MAX`；**半身位符号表** `ALIGNMENT_HALF_SHIFTS`（`Object.freeze`，9 个符号元组 → `[±1/0, ±1/0]`），偏移由 `符号 × (w/2)` 组装 |
| **④ 返回风格** | 单一 `return Math.max(0, Math.min(1, …))` 出口；嵌套三元内联在 `const ox/oy` 里 | **显式 `switch` + `default`**；`saturateUnitInterval` 用 `n <= 0 ? 0 : n > 1 ? 1 : n`（`<= 0` 分支同时把 `-0` 归成 `+0`）；两轴分别短路，未命中轴返回**字面量 `0`**（不是 `0*w`） |
| ⑤ 注释 | 逐字引用上游行号 + 自认"逐分支同构" | 指向行为规格 + 我们的推导；**"逐分支同构"在 `core/we-scene-bundle.js` 里 0 处** |

3. **加验收测试**：新增 `clean-room-alpha-align-test.mjs`（已注册进 `run-all-tests.sh` 的
   `clean-room-alpha` 项，条件项：缺真包语料时整体 SKIP 不红）。四层：**冻结真值表**（期望值 = **改前实现
   实测输出**，重写前逐值记录，另用独立脚本复核过零转写误差）+ 边界/幂等 + 与改前实现**逐位对拍**
   （`Object.is`，含 `±Infinity`/`NaN`/次正规/`-0`）+ **6 个真包语料扫描**（`3326873240`、`3327063360`、
   `3544152633`、`3554161528`、`3660962877`、`3719111841`；全部原始 alpha/alignment 输入 + `parseScene`
   接线）⇒ **1008 断言 / 0 失败**。

4. **附带清掉审计 §6 的 2 处弱形态**（P2）：
   - `core/we-scene-bundle.js` 视差注释：删掉上游表达式 `Scaling(1,−1)·(0.5−mouse)∘ortho` 与
     `WPNodeTransformResolver.cpp:154-156` 行号引用，改成**我们自己的 y-down 坐标系推导**；
   - `elysia/scene-scripts.js`：删掉第三方实现的**私有**中间变量名 `__makeNoopVideoTexture`（它曾被注释
     称为"官方"），改写成「WE 脚本 API `getVideoTexture` 的 noop 回退」；**实现未动**（方法集由 API 契约
     强制、空体是最小 noop = 接口唯一表达）。

**证据（逐条可复跑）**

| 证据 | 命令 / 结果 |
|---|---|
| 测试 | `node clean-room-alpha-align-test.mjs` → **1008 pass / 0 fail**（① 冻结真值表 49+71 行；③ fuzz alpha 60,013 组 + align 60,040 组逐位相同；④ 6 真包 408 层、`layer.alpha` 接线 408/408） |
| 行为逐位不变 | 重写前：旧实现 vs 新实现在 **1e6 组随机 alpha + 2e5 组随机 token**（含 `±Infinity`/`NaN`/`-0`/次正规/负 size）差异 **0**；真语料 408 层逐位相同。**这是纯重构** |
| 真语料样本 | alpha 实测 = `1×386, 0×5, 0.69999999×7, 0.93000001, 0.88, 0.79000002, 0.5×2, 0.13, 0.11, 0.090000004, 0.19, 0.47999999`；alignment 实测 = `center×369, bottom×25, right×7, left×4, bottomleft×2, top×1` |
| **最长公共子串复测** | `python3 tools/wer-ref-lineage-retest.py`（复刻审计 §3.1 维度 4：K=40 k-gram 倒排索引 + 极大扩展）。**靶点 1（alpha）：改前 K=12 → 40 字符，改后 K=12 → 0、K=40 → 0**；**靶点 2（alignment）：改后 K=40 → 0**，K=12 仅剩 `  if (alignment`（15 字符：参数名+关键字+空白）与 `AlignmentAxis`（13 字符：通用技术词）——无判定顺序/无魔数/无表形态/无注释文字重合；**靶点 3（视差）：K=12 → 0**；**靶点 4（noop 桩）：83 字符，全部落在 WE 公开脚本 API 的 5 个方法名 + `{}` 空体上**（接口唯一表达；已在 `THIRD-PARTY.md` §1 登记为 `elysia395/dsh-wallpaper-engine`（MIT）移植 ⇒ MIT→GPL 合法） |
| 标识符复测（维度 3b，大小写不敏感） | 本次消除目标 `NormalizeImageAlpha` / `ResolveImageAlignmentOffset` 在我们的**代码**里 **0 命中**（`NormalizeImageAlpha` 仅在 `clean-room-alpha-align-test.mjs` 的**否定式源码守卫** `!/normalizeImageAlpha/` 里出现一次） |
| 自认语句复测（维度 6） | `逐分支同构` 在 `core/we-scene-bundle.js` = **0**（审计的验收判据）。全仓"肯定式自认"共 **14** 行，**逐条复核无一与 wer-ref 血缘有关**：① 9 行是处置前的既有行（`PATCHES.md:2350` 照搬**我们自己的 MIT 插件** `lib/client.js`＝允许方向；`:2833` 是 JPEG `FF 00` 位型"一一对应"；`elysia/we-renderer/model.js:115,520` 是"照搬 shader **数学**"＝公式；`visual-diff-kal.mjs:68` 是比喻；`core/we-scene-bundle.js:3875` 指 **WE 专有 shader**（非 wer-ref，见下方未定项 2））；② 5 行是本 P-95/README 自己的**登记文字**（在描述被修正的历史措辞 —— 扫描器的自指命中）。判据与全文见 `tools/wer-ref-lineage-retest.py` 的 C 段 |
| 全树复测 | `--full`：wer-ref 471 文件 / 3,103,186 个不同 40-gram；**全局最长公共子串 = 83 字符**（即上面那个 noop 桩，位置 `elysia/scene-scripts.js` ↔ `WPScriptRuntime.cpp`）；≥35 字符的实质性命中 = **88 组文件对 / 139 条**，全部落在 `elysia/**`（MIT 移植 + WE 公开脚本 API 契约）、几个测试与 wer-ref 自身**测试文件**的同名 API 断言串、以及 Vite 打包产物 `demo/assets/**`（minified；单独复测过，命中全是 BT.601 灰阶权重 / `gl_Position` 样板 / `g_EffectTextureProjectionMatrixInverse` 这类公开公式与 WE uniform 名）；**两个处置靶点在 `core/we-scene-bundle.js` 里已无任何 ≥35 字符命中** |

**口径修正（审计 §5，90+ 处）**：把 `wer-ref` 被称作「官方 / 官方真值源」的表述全仓改成中性准确说法，并给每个
引用它的文件补一次统一免责段（`参照来源许可声明`）。可复跑脚本：`../tools/neutralize-wer-ref-wording.py`（幂等，
`--check` 只报告）。**修正前后数字**：

| 指标 | 修正前 | 修正后 |
|---|---|---|
| `grep -rn "wer-ref" we-scene-demo \| wc -l`（不含 `.bak-*`） | **89** | **117**（上升是因为 37 个文件各多了一行"解说性"免责段，其中含 `wer-ref` 字样 —— 这是**解说**不是新增引用） |
| **断言 wer-ref 是「官方/真值源」的行** | **30**（仅 we-scene-demo；同行判定） | **0** ✓（严格复核：残留 15 行经逐条复核「官方」都作独立名词指 WE 官方/官方二进制/官方资产，非指 wer-ref） |
| `真值源` | **1**（`PATCHES.md:384`，逐字"真值源"） | **0** 处把 wer-ref 当真值源（残留 17 处全是免责段里的**否定式**「非『真值源』」与报告里**引用旧措辞作被修正对象**） |
| 带统一免责段的文件 | **0** | **37** |
| 带中性口径的站点行（第三方参考/行为对照/未取代码/无许可） | 0 | **141** |

**许可表/登记补口**：`docs/COPYING-RULES.md` §2.3 可借表补 **两行** ——
`Aromatic05/wallpaper-engine-renderer`（本机 `wer-ref/`）= **GPL-2.0-only ❌ 不可借**、
`Aromatic05/we-layerd`（本机 `we-layerd-ref/`）= **无许可（保留所有权利）❌ 不可借**，
两行均写明"**仅行为对照 / 洁净室；严禁复制代码；不得进入任何发布产物**"。
`THIRD-PARTY.md` 新增 **§10 参考资料（未复制代码）—— 本机副本位置与用途**（两个副本的上游/许可/用途/边界 + 登记口径）。

**回退**：本补丁是**纯重构**，行为**逐位不变**（上面的 fuzz 与 6 真包对拍可证），所以回退在技术上只是
"恢复旧实现 + 改回调用点" —— 但**不建议回退**：旧实现正是审计判为「逐行翻译 / 同源改写」的那两段，
回退会把 GPL-2.0-only 的硬冲突重新引入。若必须回退，需同时回退 `docs/IMAGE-ALPHA-ALIGN-SPEC.md`、
`clean-room-alpha-align-test.mjs`、`run-all-tests.sh` 的注册项与本节记录。

**未定项（如实列）**

1. **法律定性**：洁净室重写是否**在法律上**彻底消除衍生性，仍需律师意见（审计 §7 U-1 未变）。本补丁只做工程处置与留痕。
2. **`core/we-scene-bundle.js:3875`「逐行翻译自 WE shader 原文」** —— 复测维度 6 扫出的一处**肯定式自认**，
   但它指的是 **WE 专有 shader 原文**（`assets/shaders/`，**不是 wer-ref**）。该轴已由审计 §4 单独核过
   （`common*.h` 洁净室：对 wer-ref 成立；对 WE 原件"部分存疑但风险低"），**不在本次 2 点范围内**，
   此处如实登记为未定项，不擅自扩大改动。
3. **`docs/WER-REF-LICENSE-AUDIT.md` §5.2 清单是否穷尽**（审计 §7 U-5 未变）：本轮把清单**逐条落地**并把
   `grep` 口径收敛到 0，但"无 `wer-ref` 字样、也无自认措辞、且被深度改写"的段落机器查不出来。

**验证**：`bash run-all-tests.sh` 全绿（含新增 `clean-room-alpha`）；`node docs-check.mjs` rc=0；
`node diag-flag-check.mjs` → 0 差异（117 个开关，数字未变）。

---

## P-96（2026-09-16 在线 demo）测试台并入仓库 + 落地页 + GitHub Pages 发布形态 —— **单一真源靠软链 + inode 断言锁死**

> 任务书：把「打过我们补丁的测试台」作为**在线 demo** 写进渲染器仓库并用 GitHub Pages 发布；
> **不 push 到 npm**（npm 未登录）。本批**没有** commit / push / 发布 —— 只把文件放好并自证。
> 形态口径先落文档：**`docs/ONLINE-DEMO.md`**（页面结构 / Pages 源与构建 / "哪些东西不会出现在线上"）。

### P-96.1 目录形态：真源进仓库，历史读取路径改软链

| 位置 | 角色 | 说明 |
|---|---|---|
| `we-scene-demo/demo/**` | **唯一真源**（随仓库分发） | 上游 WebWallGL 静态产物（原样）+ 我们的运行期补丁 `demo/bench-patch.js` |
| `we-scene-demo/demo/samples` | 软链 → `../samples` | 合成样例**不复制第二份**（`samples/sample-synthetic/scene.pkg` 33 299 B 只有一份） |
| `vendor-ref/ww-pages/wallpaper-engine-webgl` | 软链 → `../../we-scene-demo/demo` | `:8901` 静态台的读取路径（历史路径保持不变 ⇒ `curl /wallpaper-engine-webgl/` 仍 200） |
| `vendor-ref/webwallgl/bench-patch.js` | 软链 → `vendor-ref/ww-pages/wallpaper-engine-webgl/bench-patch.js`（软链目标，仓库外） | vite 宿主（`:1430`）原有那条链**没动**，仍然指到同一个 inode |
| `vendor-ref/ww-pages/index.html` | 软链 → `vendor-ref/ww-pages/wallpaper-engine-webgl/index.html`（软链目标，仓库外） | 旧根入口的浅兼容（相对资源按 URL 解析，规范入口是 `/wallpaper-engine-webgl/`） |

**为什么把物理文件搬进仓库、把 `vendor-ref/` 留成软链**（而不是反过来）：
`vendor-ref/**` 在仓库外、不进发布面（`.gitignore.public` 口径），而在线 demo **必须**有实体文件才发得出去；
反过来放（真源留在 `vendor-ref/`）则线上没有文件可发。软链方向变了，但"**只有一个物理文件**"没变：

* `vendor-ref/ww-pages/bench-patch.test.mjs` 的 `import './wallpaper-engine-webgl/bench-patch.js'` 经软链解析到真源；
* 新钉 **T28**：两侧 `realpath` + `fs.statSync().ino` **同一 inode**（不是"内容相同"，是同一个文件）；
* T24 追加：`realpath` 必须落在 `we-scene-demo/demo/bench-patch.js`，且页面相对引入的 ./bench-patch.js 解析到同一文件。
* 运行期零影响：bench-patch.js 的 `import.meta`/相对解析一律按**真源目录**（`demo/`）解析 ⇒ `demo/samples` 软链照旧可用。

### P-96.2 产物里那三条写死的绝对路径（**这是本批最大的技术约束**）

上游静态产物是 minified 且**不可重建**（本机离线装不上依赖，见 `vendor-ref/ww-pages/PATCH-NOTES.md` §0（仓库外）），它写死了：

1. `/wallpaper-engine-webgl/renderer/index.html`（测试台 iframe 的渲染器页，3 处 `frame.src=`）；
2. `/wallpaper-engine-webgl/sw.js`（`serviceWorker.register`，产物自带 `.catch(()=>{})`）；
3. `/wallpaper-engine-webgl/default-wallpaper/index.html`（渲染器页兜底壁纸）。

处理方式：**HTML 里的引用一律改相对本页**（`<base href="./">` + `./assets/…` + `demo/bench-patch.js`，
两个挂载点 `:8901` 的 `/wallpaper-engine-webgl/` 与 Pages 的 `/demo/` 都成立），
产物内部那三条由 bench-patch.js **运行期前缀改写**（`demoAssetUrl` / 对 `HTMLIFrameElement.prototype.src`
做一次只认该前缀的包装）；同时 `build-pages.mjs` 把 `demo/` 在产物里再放一份到 `/wallpaper-engine-webgl/`
（**产物**里两份、**仓库**里一份）。真机验证见 P-96.6。

### P-96.3 静态托管下的优雅降级（不假装能用）

* 新增 `onlineDemoEnv()`（纯函数）：Pages 域名 ⇒ 在线形态；`127.0.0.1/localhost/::1/0.0.0.0/*.local/局域网/`file://``
  一律**不**算在线；`?online=0` 可强制按本机口径。
* `backendMode/backendNotice/diagReasonText` 增加 `online` 分支：在线时**不再**说"去跑 `pnpm dev`"（对访客无意义），
  改说"在线版就是没有本机后端，这是设计如此"；也**不**再打"本机依赖不全"那行（那是作者本机的状态）。
* 页面上写死一条 **静态横幅** `#bench-online-notice`（中英双语，不依赖 JS 与后端）+ 运行期同源同义注入
  （`onlineDemoNotice()`，随语言切换刷新）；页脚 `#bench-credit` 保留上游外链与两份许可文件的链接。
* 真机实测：静态托管下控制台只剩 `/api/library`、`/api/diag-stream` 的 404（刻意探测），**没有**其它报错。

### P-96.4 默认壁纸 = 我们的合成样例（不得内置任何真实壁纸）

* `defaultSamplePlan()`（纯函数）：默认 `./samples/sample-synthetic/scene.pkg`；`?sample=0` 关掉、`?sample=<url>` 换来源。
* `loadDefaultSample()`：`fetch` 该包 + 同名 `project.json` → `__wp.loadSceneFile(<Blob>, project)`。
  **坑（真机踩到）**：渲染器的 source 契约是 `scenePkg: () => t.arrayBuffer()`，喂**裸 ArrayBuffer** 会
  `t.arrayBuffer is not a function` ⇒ 必须给 `Blob`；又不能用 `new File(...)`（T17 的"定义↔调用"审计把裸全局构造器
  判成未定义标识符）。
* 本机静态台与线上都自动载一次（"打开就有画面"两边一致）；`:1430` vite 宿主有真 Node 后端 ⇒ 不抢它的默认壁纸。
* 合成样例是 `tools/make-sample.mjs` 生成的 33 299 B、sha256 `cceb7b94…`，无第三方内容 ⇒ 无需署名（见 `samples/README.md`）。

### P-96.5 落地页与 Pages 构建

* 新增根 `index.html`（落地页）：一句话定位 + **中英免责声明逐字** + 三个入口（`/demo/`、`/demo.html`、`/samples/README.md`）
  + 一张"在线有什么/没有什么"表 + 许可与致谢（README / THIRD-PARTY / COPYING-RULES / `LICENSE` / 两份 webwallgl 许可）。
* 新增 `build-pages.mjs`：**零依赖、不联网、不改源文件**；按**显式白名单**（`PAGES_KEEP_*` + `PAGES_SKIP_RE`）
  出产物，`demo/` 再放一份到 `/wallpaper-engine-webgl/`，写 `.nojekyll`，最后 12 项必需文件自检（缺一即非零退出）。
* 新增 `.github/workflows/pages.yml`：`actions/upload-pages-artifact` + `actions/deploy-pages`，
  构建步骤**没有** `pnpm install`/`npm ci`/`vite build`，另有一条"产物里不得出现个人绝对路径"的 grep 闸门。
* `package.json` 增 `build:pages` 脚本。

### P-96.6 测试与自证（本轮实跑）

| 项目 | 结果 |
|---|---|
| `node vendor-ref/ww-pages/bench-patch.test.mjs` | **241 通过 / 0 失败**（改前 239；本批 +2：T24 物理唯一 + T28） |
| `node docs-check.mjs` | 退出码 **0** |
| `node build-pages.mjs --out /tmp/site-test` | 产物 180 个文件，12 项必需文件自检通过 |
| `curl "http://127.0.0.1:8901/wallpaper-engine-webgl/?t=$RANDOM"` | **200**（13 条关键资源逐一 200，见 P-96.7） |
| `grep -rn "/ro""ot/" demo/` | **0 命中** |
| 真机（Chromium/SwiftShader，Playwright） | 默认样例真的挂载：日志 已载入合成样例：`samples/sample-synthetic/scene.pkg`，`getDefaultSample()` = `{ok:true,bytes:33299,hasProject:true}`；`?sample=0` 时 `{ok:false,reason:'sample-flag-off'}`（不空载） |
| 真机（Pages 布局：反向代理把 `/demo/` 映射到仓库根） | 入口资源全 200（产物内 ./assets/*、./bench-patch.js）；`remapDemoUrl('/wallpaper-engine-webgl/renderer/index.html?_t=1')` ⇒ `./renderer/index.html?_t=1`；横幅/后端降级文案就位 |

**关键资源 200 清单**（全部带 cache-buster，`:8901` 不发 Cache-Control）：
`/wallpaper-engine-webgl/`、`demo/renderer/index.html`、bench-patch.js、`assets/{bench-DSKWIqmS.js,bench-HtRiuWm6.css,renderer-BOSoB05I.js,modulepreload-polyfill-B5Qt9EMX.js}`、
`samples/sample-synthetic/{scene.pkg,project.json}`、`demo/icons/pwa-192.png`、`manifest.webmanifest`、`LICENSE-webwallgl-MIT.txt`。

### P-96.7 明确**未做 / 没验**的

1. **线上没验过**：仓库未 push、Pages 未开 ⇒ `pages.yml` 首次运行、CI 产物、线上真机观感都**没有**证据。
   本批只保证"本机构建产物 + 真机 Pages 布局（代理复现）"两条。
2. **测试台默认壁纸的像素级画面没验**：真机挂载成功、日志与 `getDefaultSample()` 都绿，
   但 WebGL 渲染那一步在换 `Blob` 之后**没有再跑一轮像素探针**（首轮探针在渲染期把标签页做崩了 —— 本机内存紧，
   SwiftShader 软件渲染 810 KB 渲染器 + 场景，`free` 只剩 ~3 GB）。**"画面真的画出来了"缺一条像素证据。**
3. **`sw.js` 的注册**：产物在 `/demo/` 挂载下注册失败（`A bad HTTP response code (404)`），
   已按上游原本的 `.catch(()=>{})` 语义吞掉、不影响页面；**没有**去查 Chromium 为何不发出 `sw.js` 请求
   （推测与注册 scope/路径有关）。我们**有意**不主动注册 SW（避免"旧版本被缓存住"）。
4. **移动端未适配**：测试台是桌面三栏工作台；窄屏只是可用性下降。
5. **`demo/assets/*.js` 仍是上游 minified 产物**：本轮**没有**重建（离线装不上依赖），
   所以补丁全部是运行期行为；将来能重建时应把那三段运行期改写（iframe src/SW 前缀、在线横幅、默认样例）
   回写到源码 `bench/`，然后删掉 bench-patch.js 的对应段。
6. **`publish-check.mjs` 未改**：它对 `webwallgl` 文件名要求随附 MIT 声明的第 ④ 条本来就能覆盖
   `demo/LICENSE-webwallgl*`；本轮**没有**把 `demo/` 加进它的发布面白名单（该脚本按 `.gitignore.public` 走，
   与新白名单是两套口径 —— 这是 P-96.8 的口径债）。
7. **口径债**：`build-pages.mjs` 的白名单与 `.gitignore.public` 是**两处**，不同步时会出现
   "本地产物多/少文件"（当前靠 `publish-check.mjs` 交叉核对，未做机器一致性断言）。

### P-96.8 许可

上游 WebWallGL 是 **MIT © 2026 oneincase**（`vendor-ref/webwallgl/LICENSE`）；测试台是其静态构建产物的
**补丁版再分发**，故 `demo/` 内随附两份等价许可：`demo/LICENSE-webwallgl-MIT.txt`（建仓线撰写）与
`demo/LICENSE-webwallgl`（本批撰写，同一许可的简短登记）；两份**都在、都不许删**。
MIT → GPL-3.0-or-later 合法（`docs/COPYING-RULES.md` §2.1），登记在 `THIRD-PARTY.md` §6.4。
**没有**任何真实壁纸、预览图、音视频进仓库（P-87 的结论继续保持）。

---

## P-97（2026-09-16 发布）**首次公开发布**：GitHub 仓库 + npm 包 `wallpaper-engine-web-loader@0.1.0`

### P-97.1 事实（可复跑）

| 项 | 值 |
|---|---|
| GitHub 仓库 | <https://github.com/XHR666/wallpaper-engine-web-loader> —— **public**，默认分支 `main` |
| 首次提交 | `987d9b3` 渲染器仓库成形：GPL-3.0-or-later + 参考致谢 + 发布面清单 |
| 同批提交 | `c01704a` Pages 构建入口 + 忽略产物；`a7d8615` Pages 改走 `build-pages.mjs` 产物 |
| 入库文件数 | **281**（`git ls-files | wc -l`）；`.git` **6.8 MB** |
| npm 包 | `wallpaper-engine-web-loader@0.1.0`，`license: GPL-3.0-or-later` |
| npm 发布时刻 | `2026-09-15T19:47:02Z`（`npm view … time`） |
| tarball | <https://registry.npmjs.org/wallpaper-engine-web-loader/-/wallpaper-engine-web-loader-0.1.0.tgz> |
| tarball 规格 | **132 文件 / 2.0 MB（tgz）/ 5 122 788 B（解包）**；shasum `a2af04274bbd0b61c7622ffae72ef20013a54a4d` |
| 在线 demo | <https://xhr666.github.io/wallpaper-engine-web-loader/>（GitHub Pages，`build_type: workflow`） |

执行命令（原文）：

```bash
gh repo create XHR666/wallpaper-engine-web-loader --public --source=. --remote=origin --push
npm publish --registry=https://registry.npmjs.org --access public
# → + wallpaper-engine-web-loader@0.1.0
```

### P-97.2 发布前闸门（以最新工作树重跑）

- `node docs-check.mjs` → **rc=0**
- `node publish-check.mjs` → **0 阻塞、0 隐私告警**（唯一提示是"未提供 WE 资产根 ⇒ 跳过专有文件比对"，属 informational）
- `node demo-syntax-check.mjs` → **8/8**
- `node clean-room-alpha-align-test.mjs` → **1008 pass / 0 fail**
- 真打包扫描：tarball **132 文件**；`/root/` 个人路径 **0**；真实壁纸包 **0**（唯一 scene.pkg 是 `samples/sample-synthetic/scene.pkg` 33 KB）；`node_modules` **0**
- 体积：仓库内 **>5 MB 文件 0 个**，最大 1.4 MB（OFL 字体）

### P-97.3 隐私处置（本轮）

- `publish-check.mjs` 的 `PATH_RE` **覆盖面补齐**：新增两类本机路径 —— 插件下载缓存目录（root 家目录下的同名点目录）
  与设备/SD 语料根（此前各漏 15+ 处，含 `known.json` / `known-issues.json`）；对应环境变量为 `MPW_PLUGIN_CACHE` / `MPW_SD_ROOT`，
  并用探针自测确认新判据能命中这两类路径。
- 去个人化：**41 个 .mjs 文件** + 文档改为既有约定"环境变量优先 + 作者本机默认值"；
  `demo.html` 调试字符串、`pwa-test.mjs` 占位路径（改 `USER`）、`docs/ONLINE-DEMO.md` 命令、
  `PATCHES.md` 一行 DSH profile 路径同步清理。
- **Pages 产物零个人路径**：工作流剔除 `server/we-scene-demo-server.mjs` / `core/scene-project-json.mjs`
  （服务端/工具源码，静态 demo 用不到）后，`_site` 内任意 `/root/` 为 **0**；
  线上 `/we-scene-demo-server.mjs` 实测 **404**。

### P-97.4 Pages 形态：为什么不是"直接从仓库根发布"

- **实测反例**：`build_type: legacy` + `main` 根发布时，`/wallpaper-engine-webgl/renderer/index.html`
  = **404** —— 上游 minified 产物把该路径写死在 iframe / `sw.js` 里，而仓库根下没有这个目录
  ⇒ 测试台在线是**坏的**（`/` 与 `/demo/` 却是 200，容易误判为"已好"）。
- **现形态**：`build_type: workflow`，由 `.github/workflows/pages.yml` 执行
  `node build-pages.mjs --out _site` → `upload-pages-artifact` → `deploy-pages`；
  产物里 `demo/` 挂两次（`/demo/` 规范入口 + `/wallpaper-engine-webgl/` 喂那两条写死路径）。
- **线上实测**：`/` 200、`/demo/` 200、`/demo/bench-patch.js` 200、
  `/wallpaper-engine-webgl/renderer/index.html` **200**、`/wallpaper-engine-webgl/bench-patch.js` 200、
  `/samples/sample-synthetic/scene.pkg` 200、`/THIRD-PARTY.md` 200、
  `/demo/LICENSE-webwallgl-MIT.txt` 200、`/we-scene-demo-server.mjs` **404**（按预期剔除）。
- 工作流首次自动运行曾 **failure**（Pages 还是 legacy 模式时 `deploy-pages` 无可用目标），
  切到 `workflow` 后重跑 **success**（32 s）—— 这条留痕是为了说明"失败原因已定位且不复发"。

### P-97.5 本轮新增/修正的许可登记

- `README.md`（主 README）新增「免责声明」（中英逐字）与「参考与致谢 / References & Credits」：
  **逐个列出 11 个上游项目**（URL / 许可 / 到文件与功能级的"参考了什么" / 是否复制过代码），
  不确定项一律标"未定/待核"。
- `THIRD-PARTY.md` 同步：修掉 3 处已过期的"MIT 许可"自述（本仓库早已是 GPL-3.0-or-later）；
  新增 **§8** 参考/行为对照登记表（含 GPL-2.0-only 点状同源的完整披露）；
  **§9** HLSL→GLSL 转译器逐字节 vendoring（P-93）说明；§6.4 改为"源码未 vendored，
  但静态构建产物 `demo/**` 再分发"的准确表述。
- **合规缺口修补**：`demo/**` 是 `oneincase/webwallgl`（MIT）静态构建产物的补丁版再分发，
  但目录内原本**没有任何许可声明** ⇒ 补 `demo/LICENSE-webwallgl-MIT.txt`（MIT 全文 + 署名 +
  上游/自研分界 + "不含任何壁纸内容"声明）。
- `docs/COPYING-RULES.md` 并入仓库（公开读者可见），全仓 27 处 `../docs/...` 引用改为仓内路径。

### P-97.6 未定 / 待核（**不随发布关闭**）

1. **法律定性**：审计 §7 **U-1 / U-5**（洁净室重写前的 2 处点状同源是否曾构成 GPL-2.0-only 衍生）
   仍需**律师意见**；代码层处置与留痕不替代法律意见。
2. ~~**`notscuffed/repkg` 许可**在既有文档中自相矛盾（MIT vs GPL）⇒ **未定/待核**，需向上游复核。~~
   ✅ **已结案（2026-09-17）= MIT**：依据 = 上游 `LICENSE` 原文（MIT 全文，2026-09-17 复核）+ 项目所有者确认；
   本文档 P-89 表里的"（GPL）"与本节原措辞均已更正。详见 `docs/COPYING-RULES.md` **§9.10**（规则 §6 同步修订）。
3. `../docs/PENDING-DECISIONS.md`（工作区根；见下）第 3、4、5、7、9、10 条仍待用户拍板；本轮**未推**插件仓库、
   **未打 tag / 未发 Release**。
4. `publish-check.mjs --assets` 的 **11 条字体二进制阻塞**按用户口径接受为 informational
   （字体取自上游作者，与 WE 副本逐字节相同属"同一份上游构建"，法律基础是 OFL/Apache/作者 freeware），
   **未改判据**——不为凑绿掩盖发现。
5. Pages 的 `_site` 白名单（`build-pages.mjs`）与 `.gitignore.public` 仍是**两套口径**（P-96.8 的口径债）。

---

## P-98（2026-09-16 工程收尾）修 Pages 构建回归（**根因：白名单把服务端源码打进产物**）+ 根目录收拢 146→27 + README 声明移位与「安装方式」三种

用户当轮五件事：①诊断并修好失败的 Pages 构建；②根目录"文件直接放太多了"；③README 免责声明挪到「已知限制」下、「许可」上；
④README 增加「安装方式」（三种，含可复制命令与适用场景）；⑤收尾自证 + PATCHES 留痕 + 提交推送。

### P-98.1 CI 失败根因（run `35015130033` @ `c01704a`，失败步骤 = 第 5 步 "Sanity check the artifact"）

**不是缺文件**（8 条 `test -f` 全过）。真因是本步骤里的**产物隐私闸门**命中：

```
grep -rIl --exclude='*.map' "$MPW_ROOT/" _site
→ _site/scene-project-json.mjs          # exit 1 ⇒ 本步骤红 ⇒ configure-pages/upload/deploy 全 skipped
```

`core/scene-project-json.mjs` 与 `server/we-scene-demo-server.mjs` 是**服务端 / 打包工具**，两者都带
"环境变量优先 + 作者本机路径作默认值"的写法（`opts.root || process.env.MPW_ROOT || '/root/Desktop/DSHarea'`），
而 `build-pages.mjs` 的 `PAGES_KEEP_FILES` **把这两个名字收进了白名单** ⇒ 它们必然进 `_site`。

**为什么 a7d8615 之后 CI 又绿了、而根因仍在**：那一次在 workflow 里加了 `rm -f _site/<这两个>` **事后补救**。
后果是：①本地 `node build-pages.mjs` 的产物 ≠ CI 发出去的产物（**同名不同物**，本地多这两个文件）；
②谁删掉那行 `rm` 谁就复现同一次红；③"本地绿"不再蕴含"线上绿"。

**修法（把"不发"写回唯一口径）**：
| 位置 | 改动 |
|---|---|
| `build-pages.mjs` | 新增 `PAGES_DENY_FILES`（显式排除这两个文件；白名单是发布面唯一口径，排除表紧挨着写） |
| `build-pages.mjs` | 构建末尾新增**产物隐私闸门**：口径与仓库级 `publish-check.mjs` 的 ② 逐字同源（`PATH_RE` 个人路径形状 × `DEFAULT_LINE_RE` 豁免"环境变量优先 + 作者默认值"），违规 `exit 1` 且不产出可用产物 |
| `.github/workflows/pages.yml` | 删掉 `rm` 兜底；自检步骤保留为**独立复核**（同口径第二双眼睛） |

**证据链**：
- 本地按 CI 完全同序复现：`node build-pages.mjs --out _site --json` ⇒ `files:200 / denied:2 / privacyOk:true`（原 202，少 2 = 被排除的两个）；
  8 条 `test -f` 全过 + 隐私 grep 无命中 ⇒ `✓ 产物自检通过：200 个文件`。
- **反向验证**（闸门不是摆设）：往 `docs/` 放一行含本机路径的文件 ⇒ 构建 `rc=1` 并指名命中行；删除后 `rc=0`。
- 修复推送后 CI：**run `35031225766` = success（27s）**，deploy 8s 全绿；
  `curl -I` 四路径全 **200**：`/`、`/demo/`、`/wallpaper-engine-webgl/renderer/index.html`、`/samples/sample-synthetic/scene.pkg`；
  被排除的两个文件在线上 **404**（`/scene-project-json.mjs`、`/we-scene-demo-server.mjs`）。

### P-98.2 根目录收拢：tracked 146 → 27（`ls -A` 含目录与本机忽略文件 63 → 46）

移动一律 `git mv`（保留历史）；**npm `files` 白名单的 18 个根级条目一个没动**（不改变已发布包的骨架）。

| 去向 | 内容 | 数量 |
|---|---|---|
| `docs/` | 说明性 markdown（AUDIT / PATCHES / TESTING / SELFCHECK / README-DIAGNOSTICS / …） | 21 |
| `tests/` | `*-test/-check/-scan/-verify/-audit/`工具、生成器、诊断脚本（含 `run-all-tests.sh`、`docs-check.mjs`、`diag-flag-check.mjs`、`publish-check.mjs`） | 95 |
| `shaders/` | 6 个**自研** WE-API 兼容 shader 头（**不叫 `vendor/`**：vendor 在本仓库的语义是"第三方 vendored 代码，必须带许可全文"，publish-check ④b 会按此判红 —— 放 `shaders/` 才与既有闸门口径自洽） | 6 |
| `archive/` | `py-newblock.txt`（零引用残留）+ 本机忽略文件（`*.bak-*`、`*probe.mjs`、私有基线、标定 json）21 个 → `archive/local/`（仍被 .gitignore 忽略、不入库） | 1 + 21 |
| **根（留）** | `README.md` `LICENSE` `package.json` `index.html` `.gitignore`(+`.public`) `THIRD-PARTY.md` `docs/PACKAGING.md` `docs/README-PUBLIC.md` `docs/RENDERER-ARCHITECTURE.md` + npm 白名单运行面 + `check.sh` `build-pages.mjs` `demo-check`? → `tests/` | 27 |

**根上必须留的硬理由（逐条可复核）**：
- npm `files` 白名单根级 18 条：动它们 = 改变**已发布包**的结构与 tarball 清单（用户约束②"不得变差"）。
- `build-pages.mjs`（workflow 直接 `node build-pages.mjs`）、`check.sh`（用户硬约束"`bash check.sh` 仍可用"）。
- `pwa-inject.mjs`：`PWA_ROUTES` 的 `file` 字段按**根**解析（含 `sw.js` / `sw-policy.mjs` 本体）。
- `diag-flags.json`：`server/we-scene-demo-server.mjs` 的 `/diag-flags.json` 路由从**它自己的 `__dirname`（= 仓库根）**读。

**引用的同步（硬约束①"所有引用必须同步更新"）**：
- 97 个脚本进 `tests/` 后 `./根文件` → `../根文件`（`import` / 动态 `import()` / `new URL()` 三种形态，共 100+ 处）；
- `tests/run-all-tests.sh`：`cd "$(dirname "$0")/.."`（cwd = 仓库根，**69 个测试项的命令逐字不变**，只加 `tests/` 前缀）；
- `check.sh` / `package.json` 的 `scripts.test|test:fast|check:docs|check:publish|check:diag`、`build-pages.mjs` 的页面白名单、
  `tests/docs-check.mjs`（文档扫描面 `docs/`、`PATCHES.md` 路径、整理后落点的候选目录）、
  `tests/diag-flag-check.mjs`（产物仍落仓库根）、`tests/publish-check.mjs`（ROOT 上移一级）、
  `tests/demo-check.mjs`（自身路径）、`tests/layer-rect-check.mjs`（标定 json 三落点）、
  `samples/README.md`、`.gitignore.public` 全部对齐。
- 新增 `tests/_root.mjs`：**唯一的"仓库根"口径**（`ROOT` / `TESTS`），18 个脚本改用它 —— 避免"脚本目录 vs 仓库根"两套写法再次漂移。

**npm pack 前后对比**（`--dry-run --json`，字段级）：

| 指标 | 改前 | 改后 |
|---|---|---|
| 文件数 | **132** | **132**（一致） |
| 清单差异 | — | **无**（两侧独有文件数均为 0） |
| 解包体积 | 5 123 987 B | 5 129 925 B（+5 938 B，**唯一来源 = `diag-flags.json` 恢复 8 个插件侧开关**：109 → 117 行，与 HEAD 内容逐字一致，仅 `generatedAt` 不同） |
| tarball | 1 984 824 B | 1 986 730 B |

（`diag-flags.json` 那 8 个开关是**既有缺陷的修复**：`diag-flag-check.mjs` 原来把插件当成本仓库子目录
`ROOT/dsh-mpkg-wallpaper/...` —— 永远不命中；移入 `tests/` 后按 `MPW_ROOT` 口径解析到真实兄弟目录。
基线 HEAD 的 `diag-flag-check.mjs` **因此本来就是红的**：见 P-98.5 的基线对照。）

### P-98.3 README 变更

1. **免责声明移位**（用户第 3 项）：原文在标题下方（§免责声明），现移到**「已知限制」之后、「许可」之前**。
   块内容（含中英两段脚注）**逐字不变**（`node` 脚本按字节比对：`README.includes(原文块) === true`）。
   **块故意不占章节编号**：脚注要引用 `§7` / `§7.1(2)` / `§7.4(2)` —— 一旦给声明块编号，后续章节整体位移、
   这些引用全部指向错处。故保持 `§5 → 声明块 → §6` 的顺序，编号不动（并在此块上方加 4 行「位置口径」说明）。
2. **新增「安装方式（三种，按场景选）」**（用户第 4 项），同样**不占编号**插在 §1 与 §2 之间，理由同上。
   - **A. npm 安装**：`npm i wallpaper-engine-web-loader@0.1.0` + 最小用法。
     **API 按真实导出写**（不编）：`mount` / `parseScene` 来自库入口 `core/we-scene.mjs`；`parsePkg` / `getEntry` 来自
     `wallpaper-engine-web-loader/bundle`（= `core/we-scene-bundle.js`，见 `package.json` 的 `exports`）。
     该示例**实测跑通**：装进临时工程后 `parsePkg` 得 8 个入口、`parseScene` 得 5 层。
   - **B. 直接从源码跑**：`git clone` → `bash start-demo.sh`（默认 **8899**；`--port 9000` 等价 `PORT=9000`）
     → 浏览器 `http://127.0.0.1:8899/`；附包解析器三条修法（`MPW_PKG_EXTRACT` 等，与 `start-demo.sh` 预检同口径）。
   - **C. 纯静态 / 离线**：`python3 -m http.server 8899` 或 `npm pack` 产物解包后托管 → `http://127.0.0.1:8899/demo.html?id=sample-synthetic`；
     写清**只读模式的限制**（无包代理 / `/report` / WE 资产兜底 / `/pkgdir`）与 **PWA 是可选**（默认关，仅自带服务器 `MPW_PWA=1` 或 `?pwa=1`）。
   - **环境要求**：**Node ≥ 20**（`package.json` 的 `engines.node`；脚本实际用到 `??` / 可选链 / 顶层 await / `node:` 前缀），
     浏览器侧 WebGL2；**验证安装**给 4 条：`bash check.sh --json`（期望 4 阶段 0 失败）、`bash check.sh --no-gate`、
     `node tests/demo-check.mjs`、`npm run test:fast`。

### P-98.4 自证（本轮实测汇总）

| 命令 | 结果 |
|---|---|
| `node tests/demo-check.mjs` | **29 通过 / 0 失败** |
| `node tests/docs-check.mjs` | **✓ 全绿**（检查 14 个文档 · 398 个文件引用 · P-编号健康 ✓ · diag-flags ✓）—— 基线 HEAD **本是红的** |
| `node tests/publish-check.mjs` | **✓ 0 阻塞项**（1 条 informational：未给 WE 资产根 ⇒ 跳过"专有文件混入"比对） |
| `npm pack --dry-run` | **132 文件**，清单与基线**逐条一致**（见 P-98.2） |
| `bash tests/run-all-tests.sh` | **PASS=68 FAIL=0 SKIP=1 / 总 69 项**（SKIP = `jpeg-decode` 条件项，无数据不红） |
| `bash check.sh --json` | **`{"pass":4,"fail":0,"skip":0}`** —— docs-check / publish-check / diag-flag-check / run-all-tests 四阶段全 PASS（run-all-tests 224s） |
| Pages 构建 | `files:200 / privacyOk:true`；线上四路径 200（run `35031225766` success） |

### P-98.5 本轮修掉的**真回归**（目录整理自己引入的，逐条定位到根因）

目录整理动了 97 个脚本的位置 ⇒ 第一轮全量门禁 **PASS=27 FAIL=36**。逐条查到根因并修完，最终 **68/0/1**。
值得留痕的是：这些回归**全是"路径语义"问题**，不是逻辑问题 —— 也就是"移动文件"这件事真正的风险面。

| # | 现象（门禁项） | 根因 | 修法 |
|---|---|---|---|
| 1 | 36 项集体红（真包类为主） | `run-all-tests.sh` 里我把 `MPW_ROOT` 改成了 `$PWD`（仓库根）；但**本仓库的 `MPW_ROOT` 语义是"工作区根"**（`$MPW_ROOT/allwallpaper`、`$MPW_ROOT/wallpaper_engine/assets` 都从它解析） | 恢复 `$(cd .. && pwd)` 原语义；另导出 `MPW_REPO_ROOT`（仓库根，显式用途）。`tests/_root.mjs` 的 `ROOT` 以**脚本位置**为准，与任何环境变量解耦 |
| 2 | `docs-check` 崩溃 / `diag-flags` 8 个开关消失 | 两者原住在仓库根，把 `import.meta.dirname` / `ROOT` 当仓库根；移入 `tests/` 后指向错处。`diag-flag-check` 另有一处**陈旧写法**：按 `ROOT/dsh-mpkg-wallpaper/...` 找插件（插件是**兄弟目录**，永不可能命中） | 根改为 `path.resolve(import.meta.dirname,'..')`（或统一用 `tests/_root.mjs` 的 `ROOT`）；插件按 `MPW_ROOT` 口径解析到真实落点 ⇒ **顺手修好了基线本身就红的 8 个开关缺失** |
| 3 | `layer-rect-kal` rc=2（打印用法） | `layer-rect-check.mjs` 读**当前目录**的 `./refrender-<id>.json`；而 runner 的 cwd 现为仓库根，标定 json 被归入 `archive/local/` | 三落点候选（cwd → 仓库根 → archive/local）；标定 json 同时放回仓库根（真机标定，可再生性为零） |
| 4 | `visual-diff-kal` 报"无该包基线" | `visual-diff.mjs` 的 `BASELINE` 曾指向仓库根；基线 json 随脚本收进 `tests/` | `BASELINE = path.join(import.meta.dirname, 'visual-baseline.json')` |
| 5 | `quality-tiers` / `camera-pose` ENOENT | 这两个文件的 `ROOT` 原先被 `MPW_ROOT` **覆盖**（= 工作区根），却又读**根级** `core/we-scene-bundle.js` / `demo.html` ⇒ 两个语义撞名 | 拆开：工作区根 `MPW_WS`、仓库根 `ROOT`（来自 `tests/_root.mjs`）；`ROOT` 不再受 `MPW_ROOT` 覆盖 |
| 6 | `packaging` / `pwa` ENOENT `tools/make-icons.mjs` | `tools/make-icons.mjs` 按**自身目录**读写根级 `icons/` 与 `manifest.webmanifest`，被误移进 `tests/` | 移回仓库根（它从来不是测试；`pwa-test` / `packaging-test` 都按根拉起它） |
| 7 | 服务端类用例（`sandbox-cors` / `shot-upload` / `text-font-fallback`）超时 | `server/we-scene-demo-server.mjs` import 的 `server/pack-dir.mjs` / `core/scene-project-json.mjs` 被误移进 `tests/`（服务器起不来） | 两者移回仓库根（**服务端运行时依赖**；`build-pages.mjs` 仍按需排除 `core/scene-project-json.mjs` 不发布） |
| 8 | `hlsl2glsl-coverage` 覆盖率崩到 69.6% | include 解析器只扫"脚本目录"找 `common*.h`；6 个头已移入 `shaders/` | 扫描面 `shaders/` + 旧落点兼容 |
| 9 | `p74-*` / `audio-panel` / `props-panel` / `visual-diff` / `project-json` 读文档失败 | `new URL('./README-DIAGNOSTICS.md', import.meta.url)` 等指向根文档（已移入 `docs/`）；`project-json-test` 指向已回根的 `core/scene-project-json.mjs` | 逐处改成 `../docs/...`；`project-json-test` 的模块引用改指该模块的当时落点（①P-101 起为 `core/scene-project-json.mjs`） |
| 10 | `demo-check` 29→28 | ①我自己的注释里写了**字面** `/root/...`（D3 按任意 `/root/` 判红）；②`demo-check` 自身路径随移动要同步 | 注释改为不写字面路径；新增面扫描清单里的自身路径改 `tests/demo-check.mjs` |

**基线对照（证明"不是所有红都是我的，也不是所有绿都是天生"）**：
把 HEAD（`f0abb1d`）checkout 到独立 worktree 跑同一命令：
```
cd /tmp/we-head && bash run-all-tests.sh --only docs-check diag-flags packaging pwa
→ PASS=0 FAIL=4 / 总 4 项          # 基线这 4 项同样红（缺插件 client.js / 任务书历史引用等）
cd /tmp/we-head && node visual-diff-kal.mjs ; echo rc=$?   → rc=0（基线此项绿，本轮一度被我改红，已修复）
```
### P-98.6 未定 / 待用户决定

1. **`docs/` 是否该进站点产物**：本轮改为**不发**（收拢前也只是 11 份具名 md）。若希望线上提供文档，
   应在 `PAGES_KEEP_DIRS` 里按**具名白名单**加回，而不是整目录（`docs/PATCHES.md` 含描述闸门自身的 `/root/` 字样，
   会让 demo-check D6 与 workflow 的 grep 判红）。
2. **`tools/make-sample.mjs` 留在根**（`samples/README.md` 与 pages 白名单都按根引用它）—— 若希望它也进 `tests/`，
   需同步 `samples/README.md` 的 5 处命令与 `build-pages.mjs` 的白名单。
3. **`docs/README-PUBLIC.md` / `docs/RENDERER-ARCHITECTURE.md` / `docs/PACKAGING.md` 留在根**：它们是 npm `files` 白名单条目，
   移动会改变已发布包结构（用户约束②）。若接受"包内路径变为 `docs/*.md`"（文件数/体积不变），可再动一次。
4. **P-97.6 的五条未定项**（法律定性 U-1/U-5、~~RePKG 许可~~、工作区根 `../docs/PENDING-DECISIONS.md` 第 3/4/5/7/9/10 条、
   字体二进制 11 条 informational、`_site` 与 `.gitignore.public` 两套口径债）**本轮未结**。
   （**`RePKG` 许可一项已于 2026-09-17 结案 = MIT**，见 `docs/COPYING-RULES.md` **§9.10**；余项仍未结。）
   本轮把 `_site` 口径进一步收敛为"白名单 + 显式排除表 + 构建内建闸门"，口径债的**方向**是按用户约束②不动包结构。

## P-99（2026-09-16 口径归零收尾）`wer-ref` 口径残留清零：11 处符号改名（连带修 11 处假陈述）+ 8 个文件补免责段 + 74 行逐条判定（改 3）+ 脚本看不见的同类 26 行

**背景**：P-91/P-95 的口径修正只覆盖了"**同一行**同时出现 `wer-ref` 与 `官方/真值源`"这一形态，且只在 `we-scene-demo/` 内。
本轮复跑防回潮脚本 `tools/neutralize-wer-ref-wording.py --check` 做归零收尾，发现三件事：

1. 脚本自报的"待处理"三项并非全零：**符号改名 11 处**（6 个文件）、**缺统一免责段 3 个文件**（`docs/COPYING-RULES.md`、
   `tools/wer-ref-lineage-retest.py`、`we-scene-demo/docs/COPYING-RULES.md`）、**同行残留 74 行**"请人工判断"（逐处替换已是 0）；
2. `SYMBOL_SUBS` 是**盲替换**，11 处命中**全部**是"旧标识符"语境（改名说明、审计台账的"改前"列），盲替换把句子改**假**了；
3. 脚本的残留判据看不见 `官方 <第三方参考实现的源码文件/符号>`（同行没有 `wer-ref` 字样）——官方发行包 `wallpaper_engine/` 只有 assets、
   不含任何 `.cpp/.hpp`，所以这类写法性质相同。

### 1. 符号改名（脚本建议执行，11 处）

在役名统一为 `alignmentOffsetForToken`（旧标识符在全仓**0 处使用**）。11 处盲替换逐处重写为**不含旧字面量且为真**的表述
（"alignment 偏移旧标识符（逐字引文见 `docs/WER-REF-LICENSE-AUDIT.md` §3.4）"）：`NIGHTLY-REPORT-20260916.md` ×2、
`docs/RENDERER-OPTIMIZATION-REPORT.md` ×4、`we-scene-demo/README.md`、`we-scene-demo/THIRD-PARTY.md`、`docs/PATCHES.md` ×2。

**其中一处是功能性的**：`tools/wer-ref-lineage-retest.py` 用 `audit_old_block('export function <旧标识符>')` 从审计文档
（取证证据，豁免改名）取回"改前"代码块；盲替换后锚点失配、该靶点被**静默跳过**（血缘复测悄悄失去改前对照）。
已改用同块内 P-21 注释行作锚点（n=14）：实测两锚点同值 —— **改前 K12=15、实质命中 0**，旧代码逐行完整保留。

### 2. 74 行"需人工判断"逐行判定：**改 3 行 / 不改 71 行**

判定规则只看**被"官方"修饰的对象**：修饰 WE 官方产物/行为（官方二进制、官方资产、官方预览、官方行为）⇒ 不改；
直接修饰**只在第三方参考实现里存在的源码文件/符号** ⇒ 改；引用旧措辞**作被修正对象**的修正记录 ⇒ 不改；统一免责段自身的否定式表述 ⇒ 不改。

| 判定 | 行数 | 说明 |
|---|---|---|
| **改** | **3** | `REVERSE-FINDINGS-5.md:298`（把第三方参考实现的常量称作"官方 FFT 尺寸"）· `docs/PATCHES.md:392`（`官方 SceneNode.cpp:20`，该文件全仓只在 wer-ref）· `docs/RENDER-MISSING-LAYERS-RECON.md:44`（把 `wer-ref/.../WPParticleRawGener.cpp:85` 直接标成「官方」） |
| 不改-B | 40 | `官方` = WE 官方产物/行为，wer-ref 另列证据（如"官方样例互证""官方 Windows 用 DirectWrite""官方资产"） |
| 不改-A | 12 | 统一免责段自身的否定式引用（"非 WE 官方代码、非「真值源」"）——改了会与既有 37 个文件的措辞不一致 |
| 不改-C | 9 | 引用旧措辞**作被修正对象**的修正记录（如"把 `wer-ref` 被称作「官方真值源」……改成……"）——改了会产出"官方第三方参考实现"这种胡说 |
| 不改-D | 10 | 已是中性口径（"第三方参考实现 `Aromatic05/wallpaper-engine-renderer`，GPL-2.0-only，仅行为对照、未取代码"） |

逐行判定表（74 行：位置 / 原文 / 判定 / 理由）落地在工作区根 `docs/WER-REF-WORDING-VERDICTS-P99.txt`
（以 `.txt` 落盘：整篇是旧措辞的引文，与审计文档同性质，`.txt` 不入脚本扫描面，避免污染 `--check` 的同行残留启发式）。

### 3. 脚本看不见的同类：`官方 <第三方源码文件/符号>` —— 29 行

- **22 行**（`官方` → `第三方参考实现 wer-ref`）：`core/we-scene-bundle.js` 5（`CustomShaderPass.cpp` ×2、`WPTexHeaderParser.cpp`、`WPParticleRawGener.cpp`、`WPSceneParser.cpp`）·
  `docs/PATCHES.md` 5（`WPNodeTransformResolver.cpp`、`WPSoundParser.cpp`、`WPScriptRuntime.cpp`、`WPPuppet.cpp`、`SceneCamera.cpp`）·
  `tests/p74-instanceoverride-test.mjs` 4 · `tests/multi-sprite-test.mjs` 2 · `elysia/scene-scripts.js` 1（`WPSceneScriptHost.cpp`）·
  `core/attach-transform.mjs` 1（`WPPuppet.cpp`）· `docs/README-DIAGNOSTICS.md` 1 · `tests/audio-semantics-test.mjs` 1 · `tests/mock-gl-test.mjs` 1 · `../NIGHTLY-REPORT-20260915.md` 1。
- **7 行**同型（`官方` 直接修饰第三方符号，逐个核过"只在 `wer-ref/**`、不在官方资产"）：`core/we-scene-bundle.js` 2
  （`UpdateActiveCameraLayer`、`SetCamera("global_perspective")`）· `docs/PATCHES.md:684` · `tests/camera-node-test.mjs` 2
  （`UpdateActiveCameraLayer:99`、`SceneCamera:88`，均为断言标签文本）· `tests/p74-instanceoverride-test.mjs:82`（`InitColor`，断言标签文本）·
  `elysia/scene-scripts.js:672`（`WPSceneScriptHost`）。
- **9 行不改**（逐个核过"确实在 WE 官方资产里"）：`common_fragment.h` / `common_particles.h` / `common_blending.h`（含 `ApplyBlending`）·
  `ComputeSpriteFrame` · `ConvertTexture0Format` · `DecompressNormal*` · `g_RenderVar*`（均命中 `wallpaper_engine/assets/**`）⇒ `官方` 用法本来就对。

### 4. 统一免责段：本次新增 8 个文件（全仓实测 **49** 个文件带该段）

- 脚本按契约注入 3 个：`docs/COPYING-RULES.md`、`tools/wer-ref-lineage-retest.py`、`we-scene-demo/docs/COPYING-RULES.md`；
- 同类改动连带 5 个（改后文件提到 `wer-ref`）：`tests/mock-gl-test.mjs`、`tests/multi-sprite-test.mjs`、`tests/p74-instanceoverride-test.mjs`、
  `tests/camera-node-test.mjs`（mjs 首行同排，**0 行位移**）、`../NIGHTLY-REPORT-20260915.md`、`docs/README-DIAGNOSTICS.md`；
- **措辞逐字取自脚本 `MD_NOTE` / `PLAIN_NOTE` 常量，不自创第二种说法**；**位置对 4 个 markdown 文件做了例外**：
  `docs/COPYING-RULES.md`、`we-scene-demo/docs/COPYING-RULES.md`、`docs/README-DIAGNOSTICS.md`、`../NIGHTLY-REPORT-20260915.md`
  改为**文件末尾追加**（措辞不变）——它们在别处被按行号引用（审计 `docs/COPYING-RULES.md:33-34/39-47`、报告 `:42`/`:8`/`:26-60` 等），
  H1 后插 8 行会造成**行号漂移**并让豁免改名的取证文档指向错行；这与脚本对 js/mjs 文件用"单行块注释 0 位移"的理由一致。

### 5. 自证（全部实跑）

| 自证项 | 命令 | 结果 |
|---|---|---|
| 防回潮脚本 | `python3 tools/neutralize-wer-ref-wording.py --check` | **真归零**：逐处替换 **0** 处 / 符号改名 **0** 处 / 补免责段 **0** 个文件（旧标识符 in-scope 计数亦为 0）。残留启发式剩 **90 行**＝**17 行免责段自指**（"非「真值源」"是否定式）+ **9 行本节自身引文**（本节整篇是"被修正对象"的引证）+ **64 行内容**（= 上面 74 行判定表去掉已改净的 1 行、加上同类改动新提及 `wer-ref` 的 3 行），**已逐条判定、无"真错"未改** |
| 文档一致性 | `node tests/docs-check.mjs` | `检查 14 个文档 · 408 个文件引用 · P-编号健康 ✓ · diag-flags ✓` → `✓ 文档一致性全部通过`（rc=0） |
| 全量门禁 | `bash tests/run-all-tests.sh` | `══ 汇总：PASS=68 FAIL=0 SKIP=1 / 总 69 项`（rc=0） |
| 发布闸门 | `node tests/publish-check.mjs` | `✓ 无阻塞项`（告警 2 条：`docs/PATCHES.md:5405` 的个人绝对路径为**既有**、以及未传 `--assets` 跳过专有文件比对） |
| 在线 demo | `node tests/demo-check.mjs` | `===== demo-check: 29 通过 / 0 失败 =====`（rc=0） |

工作区卫生：`diag-flags.json` 被 `docs-check`/`diag-flag-check` 按其自身行为重写（仅 `generatedAt`/格式差异）⇒
各门禁跑完后 `git checkout -- diag-flags.json` 还原，提交前 `git status` 不再含它。

### 6. 未定项

1. **脚本 `--check` 的退出码恒为 0**（`main()` 无条件 `return 0`），不能当闸门信号——真判据是它自报的三个计数；本轮已把三者打到 0。
2. **残留启发式不可能归零**：16 行来自统一免责段自身的否定式表述（"非 WE 官方代码、非「真值源」"）。除非改免责段措辞（会让 49 个文件与既有基线不一致），
   否则这 16 行会一直在；**这是启发式的固有假阳性，不是残留**。
3. **脚本的残留判据本身是过窄的**：它只认"同行共现"。本轮已人工补齐"`官方 <第三方源码文件/符号>`"这一类（29 行：
   22 行文件名 + 7 行符号；另有 9 行经核为官方资产内符号、**不改**），
   但同类更隐蔽的形态（如 `官方 <第三方常量名>`、跨行分列的"官方 ……（见 wer-ref）"）**尚无机器判据**，建议后续把判据扩成
   "`官方` 与 wer-ref 独有标识符表（`wer-ref/**` 文件名 + 导出符号）同行共现"。
4. **法律定性未变**：审计 §7 **U-1 / U-5**（是否构成 GPL-2.0-only 衍生作品、清单是否穷尽）仍需律师；本轮只动文档/注释措辞，未改任何代码逻辑。
5. **工作区根/仓外文档不入库**：`REVERSE-FINDINGS-*`、`../docs/RENDERER-OPTIMIZATION-REPORT.md`、工作区根 `../docs/**` 等不在公开仓库内，
   本节的判定与其改动只留在工作区；公开仓库内可核的部分是上面 §1–§4 的仓内文件。

---

## P-100-R1（2026-09-16 许可收口 · **R1 洁净室重写**）CPU 效果链（混合模式/HSL/像素颜色效果/位移/waterflow）4 处自认 + 12 处上游引注 → 按规格重写（行为逐位不变）+ 新增规格/确定性语料/验收测试

> **编号说明**：`P-100` 已被并行线的 `?charfit`（相机/入场动画）占用（`core/we-scene-bundle.js` 的 `①(P-100 用户真机实测…)`），
> 故本节用后缀形式 **P-100-R1**（`docs-check.mjs` 的 P 编号规则允许后缀，且数字部分 100 ≥ 上一条 99，不回退）。

### 1. R1 的真实身份

| 项 | 内容 |
|---|---|
| 锚点（改前） | `core/we-scene-bundle.js:3875` 的注释 `// 逐行翻译自 WE shader 原文，约定见 docs/WE_RENDER_CONVENTIONS.md。` —— 它压在 `// ===== src/render/effects.js =====` 节的**模块头**上（内容锚点稳定；并发改动会漂行号，本轮实测已由 3875 → 3883）。 |
| 该节是什么 | 「场景效果链的 CPU 侧求值」：混合模式表（blending 1..32 + HSL 26–29）、像素级颜色效果（tint / pulse / colorkey）、位移类（scroll / shake / waves / sway）、waterflow 四相叠加、采样与标量工具。 |
| 节内**另外 3 处**肯定式自认（审计维度 6 未扫出） | `:4245`「WE 混合模式（common_blending.h），**逐字实现**」· `:4312`「HSL 转换（common_blending.h 的 RGBToHSL/HSLToRGB **逐字**）」· `:4196`「waterflow（waterflow.frag:16-45，**全量字面翻译**）」 |
| 上游 `文件:行号` 引注 | **12 处**：`scroll.vert:18-20`、`scroll.frag:10`、`shake.frag:28-79`、`shake.frag:81-85`、`waterwaves.frag:15-23`、`foliagesway.vert:44-50`（+ `frag:24-46`）、`waterflow.frag:16-45`、`tint.frag:14-28`、`pulse.frag:35-63`、`pulse.frag:58-61`、`pulse.frag:63`、`colorkey.frag:14-30` |
| **原件是哪一轴** | **WE 专有资产**，不是 `wer-ref`：`wallpaper_engine/assets/shaders/common_blending.h`（md5 `15e39930cc3fdd95a028e01f576f9ddf`，与 `Delete/we-official-shaders/common_blending.h` 同 md5）+ `wallpaper_engine/assets/effects/{tint,pulse,colorkey,scroll,shake,waterwaves,foliagesway,waterflow}/shaders/effects/*.{frag,vert}`。反证：`grep -rl common_blending wer-ref/` = **0 命中**，`wer-ref` 内也没有任何 `*.frag` 效果着色器 ⇒ **与 P-95（wer-ref / GPL-2.0-only 轴）是两条独立的轴**，P-95 的"事后追加"也明确写了 R1 未动。 |
| 被谁用到 | 该节是**CPU 侧参考实现**：仓库内**当前 0 个调用点**（GPU 路径走 `src/render/renderer.js` 的 GLSL pass 管线）；它是包 `exports["./bundle"]` 的公开面；`docs/RENDERER-ARCHITECTURE.md` 把它登记为「CPU 侧效果参数求值（供 mock-GL 测试与 elysia 对照）」；vendored 构建产物 `demo/assets/renderer-BOSoB05I.js:417` 在注释里把它当"CPU 参考"。 |
| 改前测试覆盖 | **0**：全仓（`tests/**`、`demo.html`、根 `*.mjs`）grep 这些导出名 **0 命中** —— 所以本轮**新增**了语料 + 验收测试（见 §4/§5）。 |

### 2. 判定：**仍为逐行翻译**（"洁净室重写"在 R1 上从未发生）

判据（改前实测，命令与数字见 §6）：

1. **命名回响**：`applyBlending` / `rgbToHsl` / `hslToRgb` / `hueToRgb` 与上游 `ApplyBlending` / `RGBToHSL` / `HSLToRGB` / `HueToRGB` **去大小写后完全同名**（4/4）；另有 `hueBlend/satBlend/colorBlend/lumBlend` 逐词对应上游 `BlendHue/BlendSaturation/BlendColor/BlendLuminosity`。
2. **自认措辞**：4 处（§1 表）。
3. **上游引注**：12 处 `文件名:行号`。
4. **结构同构**：32 个分支与上游 `#if BLENDMODE == n` 表**逐 id 一一对应**，连上游独有的形状都保留（id 5/10 不走 `mix`、id 20 与 4 完全重复、id 22 = `Reflect(B,A)`、id 30 = `max(A)*B`、id 31 = `A + B*opacity`、id 32 = `A + A*B`）；HSL 三分支取最大通道的顺序与 `deltaR/deltaG/deltaB` 公式逐字同形；`pulse`/`colorkey`/`waterflow`/`shake` 的每个中间量都与上游 frag 同名同序。

> 结论：这不是"独立重写"，也不是"部分同源"级别的改写 —— **是逐行翻译**（含 3 处额外自认，审计 §3.5 维度 6 的扫描把它们漏了，见 §7 未定项 ①）。

### 3. 改法（严格按 `docs/COPYING-RULES.md` §5 五步）

1. **先写规格**：新增 `docs/EFFECTS-COMPUTE-SPEC.md` —— 只写**行为需求**（输入/输出/边界/默认/接口契约/等价判据），
   来源限定为"调用方需求与既有对外契约 + **公开标准**（W3C Compositing and Blending Level 1、PDF 1.7 §11.3、
   GLSL 规范的 `smoothstep`/`fract`/线性采样定义）+ 包格式事实 + 本项目自己的历史口径"；
   **不写**任何上游函数名/行号/宏表/分支写法，并显式禁止实现者照外部结构写。
2. **只依据规格重写**（同一工作树内删旧实现，不留注释掉的老代码）。**新旧差异（≥4 点，逐项可 grep）**：

| 维度 | 改前 | 改后 |
|---|---|---|
| **① 命名** | `applyBlending` / `applyColorChain` / `applyDisplacements` / `applyShakeMasks` / `applyFlowMix`；私有 `mix3/overlay3/softLight3/vivid/rgbToHsl/hslToRgb/hueToRgb` | `blendRgbByMode` / `composeColorEffectStack` / `resolveDisplacedUv` / `applyShakeMaskMix` / `applyWaterFlowOverlay`；私有 `lerpRgb/perChannel/hslFromRgb/rgbFromHsl/hueToChannel/darkenChannel/…`。**上游同名回响 4 → 0**（大小写不敏感） |
| **② 控制流结构** | 32 段 `switch/case`（每 case 一个内联三通道数组字面量）+ 长度 3 的 `if/else if` 类型链 + 两处重复的 shake 位移公式 | **表驱动**：`BLEND_TABLE`（`Map`：id → `{ op, weighted }`）+ 三条加权类别；像素效果走 `PIXEL_EFFECTS`（`Map`）、位移走 `UV_OFFSETS`（`Map`）；**shake 的位移量抽成 `shakeOffset` 单一实现**，`resolveDisplacedUv` 与 `applyShakeMaskMix` 共用（改前是两份同式公式，注释还写着"与 applyDisplacements 中同式"） |
| **③ 常量表达** | 常量散在字面量里：`0.498`（流量中性值，两处语义不同却同值）、`0.001/0.002`（colorkey 软边）、`0.2/0.8`（waterflow 斜坡）、`0.005`（sway 幅度）、`0.1`（flow 强度）、`#define` 式宏表 | 具名常量：`FLOW_NEUTRAL` / `SHAKE_WAVE_CENTER`（同值不同义，**拆成两个名字**）/ `KEY_EDGE_MIN` / `KEY_EDGE_BASE` / `FLOW_RAMP_LOW` / `FLOW_RAMP_HIGH` / `SWAY_AMPLITUDE_SCALE` / `FLOW_STRENGTH_SCALE`；混合模式按**公开标准名**组织成算子常量（`colorBurnChannel` / `softLightChannel` / `hardLightChannel` / `glowChannel` …），不再复刻上游宏表 |
| **④ 注释与出处** | 「逐行翻译自 WE shader 原文」「逐字实现」「逐字」「全量字面翻译」+ 12 处 `文件:行号` | **全部归零**；改为「公开标准公式（W3C/PDF/GLSL 规范）」+ 本项目坐标系口径 + 指向 `docs/EFFECTS-COMPUTE-SPEC.md`；数值口径写明"逐位等价"的**理由**（CPU 结果是基准）。悬空引用 WE_RENDER_CONVENTIONS.md（该文件本仓不存在）也从该节删掉 |
| ⑤ 边界/异常与身份契约 | —— | **刻意保持不变并写进规格**：非可迭代输入仍抛 `TypeError`（不"顺手加固"）；`tint` 新建数组、`key`/`pulse` 特定分支**原地改写**入参、`waterflow` 不原地改写 —— 这三条是可观测行为，测试按身份相等逐条断言 |

3. **加验收测试**：新增 `tests/clean-room-effects-blend-test.mjs` + **确定性语料** `tests/effects-corpus.mjs`
   （自造合成贴图，含 RGBA/RG88/mip 链/缺贴图路径，无任何真机壁纸数据），注册进 `run-all-tests.sh` 的
   `clean-room-effects-blend` 项（条件项：缺 WE 资产时血缘层 SKIP 不红）。

### 4. 行为等价证据（**逐位**，比较一律 `Object.is`）

* **冻结真值** = 重写**前**实现在 960 次调用（918 混合 + 92 颜色栈 + 27 位移 + 13 shake 蒙版 + 13 waterflow，含
  `NaN`/`±Infinity`/次正规/`-0`/越界量纲）上的实测输出；重写后必须逐位相同：

| 语料 | 冻结 digest（改前 = 改后） |
|---|---|
| blend（918 次） | `d2b90d19eae6d11a` |
| color-stack（92 次） | `96b707f083a6fdcc` |
| displace（27 次） | `2a7cbeae9ed8e7b2` |
| shake-mask（13 次） | `35f8d8364aeeb101` |
| waterflow（13 次） | `d8c5ea3a5e53399d` |

* 另有 **207 条冻结抽样值**逐条 `Object.is` 对拍（含"调用后入参状态"，专门锁 §3.4 的原地改写契约）。
* **312 断言 / 0 失败**（含：同义 id、op=1 的交换操作数恒等、opacity 无关族、区间界、HSL 往返恒等、蒙版/alpha 恒等、身份与异常语义、源码守卫、血缘阈值）。
* **行为差异 = 无**（逐位）。这也是"视觉等价"的下界：CPU 侧结果是 mock-GL/对拍的数值基准，1 ulp 漂移都会改结论。

### 5. 相似度复测（改前 / 改后，命令与口径见 §6）

| 区域（内容锚点切段） | LCS-token | 其中"去数字" | LCS-char | 标识符重合率 |
|---|---|---|---|---|
| 混合+HSL（125 → 168 行） | 9 → **4** | 10 → **4** | 22 → **13** | 52.9% → **22.7%** |
| 像素颜色效果（60 → 88 行） | 8 → **6** | 6 → **4** | 36 → **20** | 30.3% → **18.4%** |
| 位移+waterflow 整段（167 → 209 行） | 9 → 9 | 5 → 5 | 48 → 48 | 18.0% → **15.2%** |
| waterflow 单列（39 → 42 行） | 8 → **4** | 6 → **3** | 34 → **13** | 14.5% → **5.0%** |
| 模块头/自认措辞 | 4 处自认 + 12 处引注 → **0 / 0** | — | — | 上游同名回响 4 → **0** |

> **第三行的原始字符指标不下降，是预期结果、不是残留**：该段的最长公共子串就是 **sin/cos 级数的公开系数串**
> （`-0.5, 0.041666666, -0.0013888889, 0.000024801587`）——数学常量，值不可改（规格 §7.3/§7.5）。
> 判据因此取五项：① 自认措辞归零 ② 上游引注归零 ③ 上游同名回响归零 ④ 结构去重（同式不再两处各写一份）
> ⑤ "剔除数字 token"后的 LCS 与标识符重合率。五项都在测试里卡阈值（阈值按"改前会被卡红"设定）。

### 6. 自证（本轮实测）

| 自证项 | 命令 | 结果 |
|---|---|---|
| 全量门禁 | `bash tests/run-all-tests.sh` | **`══ 汇总：PASS=70 FAIL=0 SKIP=1 / 总 71 项`（rc=0）**；本项 `PASS clean-room-effects-blend (3389ms)`；唯一 SKIP = `jpeg-decode`（条件项，无真机截图）|
| 文档一致性 | `node tests/docs-check.mjs` | `检查 14 个文档 · 431 个文件引用 · P-编号健康 ✓ · diag-flags ✓` → `✓ 文档一致性全部通过`（rc=0） |
| 诊断开关 | `node tests/diag-flag-check.mjs` | `✓ diag-flag-check：代码 120 个开关 == README 主表 120 行，0 差异`（rc=0） |
| 本项验收 | `node tests/clean-room-effects-blend-test.mjs` | `===== clean-room-effects-blend: 312 通过 / 0 失败 =====`（rc=0；~3.6s） |
| 血缘复测 | 同上（⑥ 层，需 `$MPW_ROOT/wallpaper_engine/assets`） | 见 §5 表 |
| 语法 | `node --check core/we-scene-bundle.js` | 通过 |

复现命令（血缘指标；`before-bundle` 用 `git show HEAD:we-scene-demo/core/we-scene-bundle.js` 复原）：

```bash
cd we-scene-demo                                               # 相对工作区根调用；本文件在 we-scene-demo/docs/
node tests/clean-room-effects-blend-test.mjs                  # ①–⑥ 全层（含血缘指标与阈值）
bash tests/run-all-tests.sh --only clean-room-effects-blend    # 只跑本项
```

### 6.1 与并行线的交叠与排队（合并复核用）

* 本轮的 bundle 改动与并行线（P-99 wer-ref 措辞、P-100 `?charfit`）**同文件、不同 hunk、无交叠**：
  P-100 的 `?charfit` 块插在 `src/render/effects.js` 节的开头（现行 `:3990-4025` 附近，位于 `resolveCamposeMode` 之后），
  本轮的模块头在 `:3882-3889`、下一个改动点从 `:4067`（原 `WHITE_FALLBACK` 注释）起 —— 两者之间隔约 40 行。
  R1 的等价性证据是在**本轮自己的冻结快照**上取得的（改前 digest 与抽样表见 §4），
  并行线引入的差异**没有**计入本轮"行为不变"的结论。
* 本轮踩到并行线的一处**源码守卫**并已修正：`p76-parallax-eye-test.mjs` 的 D5 断言"bundle 非注释代码里
  `volume`/`gain`/`setVolume` 零命中"（音频链整条在宿主）。我最初把 id 30 的局部量命名为 `gain`（增益语义），
  被该守卫如实判红 ⇒ 改名 `peak`（数值不变，digest 复测仍逐位相同）。这是守卫**按设计生效**的一例。
* 门禁排队事实（供复核时序）：并行线的两轮 `run-all-tests.sh` 分别在 22:30–22:54（僵尸锁等待超时）与
  23:01–23:06 运行；本轮在**其结束后**（23:06:20–23:12:57）才注册新项并运行全量门禁，遵守"改 `run-all-tests.sh`
  前确认无门禁在跑"的约定。期间 `docs/README-DIAGNOSTICS.md` 被另一条线补齐了 `railink`/`sbfill` 两行
  （他们那轮因此一度红 `diag-flags`/`docs-check`/`packaging`），本轮 `diag-flag-check` 实测 **0 差异**。

### 7. 回退方式

R1 的改动与并行线（P-99 措辞、P-100 `?charfit`）**同文件但不同 hunk**，所以**不能**用整文件 `git checkout`
（会连带丢掉别人的改动）。精确回退 = 用 HEAD 里的旧块替换现行块（旧块在 HEAD 里与"改前"**逐字节相同**：

```bash
cd we-scene-demo                                               # 相对工作区根
git show HEAD:we-scene-demo/core/we-scene-bundle.js > /tmp/old-bundle.js
python3 - <<'PY'
import io
old = io.open('/tmp/old-bundle.js', encoding='utf-8').read()
cur = io.open('core/we-scene-bundle.js', encoding='utf-8').read()
A, B = '// ---------- 位移类效果（采样坐标） ----------', '// ===== src/render/renderer.js ====='
i, j = old.index(A), old.index(B)                      # 旧块 350 行，md5 d8e4dadcbf3c3bed62f5be8ddf2e0a08
oi, oj = cur.index('// ---------- 通用标量与向量工具'), cur.index(B)
hdr_new = cur[cur.index('// 场景效果链的 CPU 侧求值'):cur.index('export const M_2PI')]
hdr_old = ('// WE 效果链的纯计算实现（CPU 光栅器与数值验证共用）。\n'
           '// 逐行翻译自 WE shader 原文，约定见 docs/WE_RENDER_CONVENTIONS.md。\n'
           '// 空间：显示空间 v-down（v=0 = 图层画面顶部）；效果输入一律采样原始 uv (u0, v0)；\n'
           '// 位移只累加到采样坐标；waterflow/颜色类在采样后处理。\n\n')
cur = cur.replace(hdr_new, hdr_old).replace(cur[oi:oj], old[i:j])
io.open('core/we-scene-bundle.js', 'w', encoding='utf-8').write(cur)
PY
git checkout -- core/we-scene-bundle.js   # 仅当确认没有并发线改动时，才用这条整文件回退
```

回退后 `node tests/clean-room-effects-blend-test.mjs` 会**立刻变红**（⑤ 层：旧名回位、自认措辞复现），
这正是该门禁存在的意义；`docs/EFFECTS-COMPUTE-SPEC.md`、`tests/effects-corpus.mjs`、
`tests/clean-room-effects-blend-test.mjs` 与 `run-all-tests.sh` 的注册项可直接保留（对旧实现同样可跑）。

### 8. 未定项（**不随本轮关闭**）

1. **审计维度 6 的判据缺口（方法论）**：`docs/WER-REF-LICENSE-AUDIT.md` §3.5 写「自认语句扫描（维度 6）的产出：
   全仓只有 **2 处**「逐分支同构」」—— 该结论**不完整**：仅 R1 这一节就另有 **4 处**肯定式自认
   （「逐行翻译自 WE shader 原文」「逐字实现」「逐字」「全量字面翻译」），扫描只认了"逐分支同构"这一种措辞。
   建议把判据放宽为 `逐行|逐字|字面翻译|翻译自|照抄|同构` 的**肯定式**匹配（否定式免责段需排除）。
   该审计文件在工作区根（本轮写入范围被限定为 `we-scene-demo/`）⇒ 未改其既有结论，待追加的"事后追加"文本如下（可直接粘贴）：

   > #### ✅ 事后追加（2026-09-16，**R1 已处置**；本节上述判定一律保留不改）
   > §3.5 末段记的"**不属于 wer-ref 轴**的肯定式自认 —— `core/we-scene-bundle.js` 的「逐行翻译自 WE shader 原文」…
   > 归 §4 那条轴（部分存疑但风险低），**本次未动**" —— **已处置**：
   > 该自认压在 `src/render/effects.js` 节模块头上，节内另有 **3 处**同类自认（「逐字实现」「逐字」「全量字面翻译」）
   > 与 **12 处**上游 `文件:行号` 引注；原件是 **WE 专有**资产（`wallpaper_engine/assets/shaders/common_blending.h`
   > md5 `15e39930…` + 8 个 `assets/effects/*/shaders/effects/*`），**与 wer-ref 无关**（`wer-ref/` 内 `common_blending` 0 命中、无 `*.frag`）。
   > 已按 `we-scene-demo/docs/EFFECTS-COMPUTE-SPEC.md` 洁净室重写（命名/控制流/常量表达/注释全改，**数值逐位不变**），
   > 留痕 `we-scene-demo/docs/PATCHES.md` **P-100-R1**，验收 `we-scene-demo/tests/clean-room-effects-blend-test.mjs`（312 断言）。
   > **同时修正方法论**：维度 6 的判据当时只扫「逐分支同构」，漏掉「逐行翻译/逐字/字面翻译」这类肯定式自认 —— 本节即为其漏网样本。
2. **该节是否需要保留**：它是 CPU 参考实现，仓内 **0 调用点**（GPU 路径另有 GLSL 实现）。本轮按任务书要求"重写"而非"删除"；
   若产品上决定不再维护 CPU 参考链，删除整节是比维护更彻底的血缘处置 —— 属功能/产品决策，另立编号。
3. **`demo/assets/renderer-BOSoB05I.js:417`（vendored webwallgl 构建产物）的注释口径**：该注释称
   "5/10/30/31/32 直接返回不经 opacity 权重"，与我们 id 30（**加权**）不一致。这份产物属另一项目（MIT，构建产物），
   本轮未动；若它真按该注释实现 GLSL，则存在 CPU/GPU 口径差，需在其上游核对。
4. **`src/render/renderer.js` 节头仍写着 docs/WE_RENDER_CONVENTIONS.md**（该文件本仓不存在）：不在 R1 范围内，本轮未动。
5. **法律定性未变**：是否有衍生作品风险仍需律师（审计 §7 U-1）；本轮只改表达与留痕，不改任何对外行为。

## P-100（2026-09-16 渲染正确性 · 用户真机实测）hina 入场动画「把人物固定在屏幕中间、然后去移动背景」—— 根因 = **蒙皮层不接相机**（真机默认路径）+ **角色层兜底适配把 origin 改写成画布中心**（`?skin0`/无蒙皮路径）；新增 `?charfit=auto|off|legacy`

**用户原话**（8899 页 `?id=3554161528`）：
> 第 1 个壁纸（hina）它有一个入场动画。oneincase 做的应该是对的，但是你的动画却把人物固定在屏幕中间，
> 然后去移动背景。你看一下这是因为什么原因，它应该是只移动摄像头，而不是把人物固定在屏幕中间。

### 一、根因（判据式，两条独立机制、同一观感）

**① 真机默认路径（蒙皮开着）= `MESH_VS` 完全不读相机**（用户看到的就是这条）

| 事实 | 证据 |
| --- | --- |
| 相机层（对象 id 3727）**是动的**：`zoom` 关键帧 3→1（`zoomRaw.animation.c0` frame 0=3 / frame 90=1，`fps:18,length:90,mode:single`）、`origin` 关键帧 (−1319.3776,−709.49872)→(0,188.248)→(0,0)，`camNode.active=true` | `core/we-scene-bundle.js:7365` 起 `evalPropAnimation(camNode.originRaw/zoomRaw, time)` → `buildCamera` |
| 四边形层（背景/钢琴/花朵）确实吃相机：`viewProj = cam.projection·cam.view`（含 zoom 窗口 + 平移） | `core/we-scene-bundle.js:7404`（`mat4Multiply(cam.projection, cam.view)`）→ `compositeLayer` |
| **蒙皮层不吃相机**：旧 `MESH_VS` 只按 `u_Proj`（= `general.orthogonalprojection` 3840×2160，设计画布）做 1:1 映射 —— 没有 view 平移、没有 zoom 窗口 | 旧式子 `gl_Position = vec4(wpos.x*2/u_Proj.x−1, 1−wpos.y*2/u_Proj.y, 0, 1)`；`u_Proj` 由 `demo.html:3713` 传设计画布、`demo.html:3736` 进 `renderMeshLayer` |
| hina 的「人物」正是蒙皮层（puppet）：`demo.html:4987` 每帧 `skinLayers.forEach(l => l.__skinReady = true)` ⇒ 渲染循环走 `opts.onMeshLayer(layer)` 并 `continue`，**绕过** `compositeLayer` | `core/we-scene-bundle.js:7500`（`if (opts.onMeshLayer && layer.__skinReady)`） |

命令（真包真渲染，mock-GL，逐帧抓"人物"层的屏幕矩形）：

```
node /tmp/probe-p100.mjs 3554161528 0 1 2 4 8          # CHARFIT=legacy / auto 各跑一次
```

| t | 修前 人物（蒙皮）矩形 | 修后 人物（蒙皮）矩形 | 修前/修后 背景（满幅层）w | 相机 zoom（实测） |
| --- | --- | --- | --- | --- |
| 0s | x[1694,2652] y[372,1578] **c=(2173,975)** | x[5201,8073] y[−3174,447] c=(6637,−1363) | 11750 | 3.0000 |
| 1s | x[1694,2652] y[372,1578] **c=(2173,975)** | x[3397,5922] y[−1697,1486] c=(4660,−105) | 10330 | 2.6374 |
| 2s | x[1694,2652] y[372,1578] **c=(2173,975)** | x[1866,4034] y[−404,2328] c=(2950,962) | 8866 | 2.2638 |
| 4s | x[1694,2652] y[372,1578] **c=(2173,975)** | x[1518,2938] y[168,1958] c=(2228,1063) | 5808 | 1.4830 |
| 8s | x[1694,2652] y[372,1578] c=(2173,975) | x[1694,2652] y[372,1578] c=(2173,975)（= 静止态，逐位相同） | 3916 | 1.0000 |

**判据**：修前 `c` 恒为 (2173,975)、`w` 恒为 958（0/1/2/4s 逐位不动）——画面上"人物钉死"；同期背景 `w` 11750→3916（×3→×1）、钢琴中心 x 从 8335 → 6152 → 2739（跟着镜头走）。
⇒ **是"相机变换没生效"（在蒙皮路径上），不是"相机求值错"**；四边形层的相机求值一直是对的（同表背景/钢琴三档逐位相同）。

**② `?skin0` / 无蒙皮立绘路径 = 兜底适配把 origin 改写成画布中心**

`compositeLayer` 里旧代码：`if (layer.animLayers && layer.parent === undefined)` + 超屏 ⇒
`k = min(1, projW*0.96/w, projH*0.96/h)`、`ox = projW/2`、`oy = projH/2`（`core/we-scene-bundle.js:6919` 起）。
hina 人物 1405×2013 @ origin (2200.54,595.23) ⇒ `oy−h/2 = −411 < 0` 命中、`k = min(1, 2.62, 1.03) = 1`
（**只居中、不缩放**）⇒ 作者摆的位置被换成画布正中。命令与数据：

```
SKIN=0 CHARFIT=legacy node /tmp/probe-p100.mjs 3554161528 0 1 8   # 修前：人物 quad 中心 t=8 = (1921,1080) = 画布正中
SKIN=0 CHARFIT=auto   node /tmp/probe-p100.mjs 3554161528 0 1 8   # 修后：t=8 = (2201,596) = 作者 origin
```

### 二、改了什么

| 文件 | 位置 | 内容 |
| --- | --- | --- |
| `core/we-scene-bundle.js` | `:5076-5107`（`MESH_VS`） | 新增 `u_View`（view 平移）/`u_Framed`（取景窗口），顶点式改为 **`(wpos+cam−c)·2/framed`、`c = u_Proj·0.5`**（与 `mat4Ortho` 同基准=画布中心）。⚠ 缩放基准必须是**中心**：绕 0 缩放会把角色再推出去（实测世界点 (2200.5,595.2) t=0 应为 x=6719.8，绕 0 会算成 10559.8 ⇒ 与四边形层不配准） |
| `core/we-scene-bundle.js` | `:6121-6125`（`renderMeshLayer`） | 上传 `u_View`/`u_Framed`：`opts2.camera = {view,framed}` 存在且合法时用之，否则回落 `(0,0)`/`projWH`（**= 改动前逐位不变**） |
| `core/we-scene-bundle.js` | `:2439`（`buildCamera` 返回） | 回传 `viewX/viewY/framedW/framedH/hasCameraNode` —— 相机参数只算一份，蒙皮层与宿主台账共用（避免两边各算一次必然漂移） |
| `core/we-scene-bundle.js` | `:7412-7415`、`:7501` | `renderScene` 组 `meshCamInfo` 并通过 **`opts.onMeshLayer(layer, camInfo)`** 交宿主；`?charfit=legacy` 时不交（= 旧行为） |
| `core/we-scene-bundle.js` | `:3995-4024` | 新增纯函数 `charfitModeFrom(search)` / `resolveCharfitMode(opts, fallback)`（唯一真值表）+ 模块加载期 `CHARFIT_MODE` |
| `core/we-scene-bundle.js` | `:6919-6931`（`compositeLayer`） | 兜底适配收窄为 `charfitMode !== 'off' && (charfitMode === 'legacy' \|\| !cam.hasCameraNode)`：**有相机层 ⇒ 不适配** |
| `core/we-scene-bundle.js` | `:5970-5976`、`:8979` | 启动日志自报档位（进 #log → 进设备上报）+ `renderer.charfitMode` 只读暴露 |
| `demo.html` | `:3705-3712`、`:3742-3756` | `onMeshLayer(layer, camInfo)`：把 `{view,framed}` 并进 `?meshsize` 的 `opts2`（两旗标正交，不互相覆盖）；台账 `rd` 走**同一相机换算**（旧台账继续报世界坐标 ⇒ 画面上角色已被镜头带走而台账撒谎） |
| `tests/charfit-camera-test.mjs` | 新增 | **44 断言**：真值表 / 蒙皮-四边形**配准**（6 时间点 × 6 世界点，最大偏差 6.4e-4px）/ 三档 × 5 时间点矩形 / camInfo 传递 / 无相机零回归 / 凯尔希兜底保留 / uniform 级 / 源码守卫 |
| `tests/camera-pose-test.mjs` | `:152-166` | ② 段"钉住改动前"的数字改由 `?charfit=legacy` 提供（新增 2 条断言：旧口径逐位保留 + 默认档不再居中）；**46 → 48 断言** |
| `docs/README-DIAGNOSTICS.md` | ① 表 `campose` 行后 | 新增 `charfit` 行（`node tests/diag-flag-check.mjs` = 代码 120 个开关 == 主表 120 行、0 差异） |

### 三、默认值 `auto` 的理由（不是随手选）

1. **作者数据就是世界坐标**：官方 `scene.json` 里「人物」层 `origin = "2200.53784 595.23083"`，把它改写成 `(1920,1080)` 没有任何官方/上游依据（第三方参考实现与上游 web 渲染器都没有"把超屏立绘抠出来居中"这一步）；这条兜底是本仓库早期为"立绘被裁"自造的。
2. **官方预览动图（`$MPW_ROOT/Steam/steamapps/workshop/content/431960/3554161528/preview.gif`，入场后帧）与"不居中"的构图更吻合**：整高方裁窗口搜索（同一窗口 `ox=496` ⇒ 设计 x 992..3152、灰度、Lanczos 到 192²）下，修后 NCC **0.657** > 修前 **0.619**；官方帧里人物 x 目测 ≈0.30..0.73（占帧宽），与修后 t=8 蒙皮矩形换算到该裁窗的 0.325..0.769 基本重合，而"钉画布中心"的 quad 是 0.105..0.755（整体左移约 0.22 帧宽）。
3. **有相机层时兜底必然与相机打架**：兜底改的是**世界坐标**，相机又要在世界坐标上取景 ⇒ 两者语义冲突。全语料 10 包里同时命中"有相机层 + 角色超屏"的**只有 hina 这一层**；无相机层的包（凯尔希「长发3」等）`auto` 与 `legacy` **逐位相同**（兜底照旧生效，P-76 的验收值不变）。
4. **保留兜底而不是"永远关"**：`?charfit=off` 提供"任何包都不适配"的极端档；默认 `auto` 只对"有相机层"的包关掉它，把回归面压到最小。

### 四、量化验收（本机可复跑）

**配准判据**（蒙皮层与四边形层必须落在同一像素）：对 hina 的 6 个时间点 × 6 个世界点，用着色器同式算出的屏幕坐标与 `projection·view` 的结果**最大偏差 6.4e-4 px**（`tests/charfit-camera-test.mjs` ② 段）。
**位移判据**（非满幅层）：`screen_x(t) = (world_x + view_x(t) − 1920)·zoom(t) + 1920`，`view_x = −origin_x`、`zoom = 3840/framedW`：

| t | `origin` 关键帧 x | `view_x` 实测 | `zoom` 实测 | 钢琴中心 x 预期→实测 | 人物（蒙皮）中心 x 预期→实测 |
| --- | --- | --- | --- | --- | --- |
| 0s | −1319.3776 | 1319.38 | 3.0000 | (2738.5+1319.38−1920)·3+1920 = **8333.6** → 8335 | (2172.9+1319.38−1920)·3+1920 = **6636.8** → 6637 |
| 1s | （frame 18） | 785.76 | 2.6374 | **6155.3** → 6152 | **4660.3** → 4660 |
| 2s | （frame 36） | 201.99 | 2.2638 | **2949.6** → 2950 | **2949.6** → 2950 |
| 4s | （frame 72） | −45.29 | 1.4830 | … | **2228.4** → 2228 |
| 8s | frame 90 之后恒 0 | 0 | 1.0000 | 2738.5 → 2739 | 2172.9 → 2173 |

（满幅层「背景」豁免平移：中心恒 (1920,1080)，只有 `w = 3916.8·zoom` = 11750/10330/8866/5808/3916 —— 与 P-76/elysia 的 `viewBg` 口径一致，本轮未动。）

**官方预览动图的量化事实**（`$MPW_ROOT/Steam/steamapps/workshop/content/431960/3554161528/preview.gif`，192²、50 帧、40ms）：

| 量 | 值 | 含义 |
| --- | --- | --- |
| 帧间整幅位移（相位相关，49 组） | **dx=dy=0** | 官方这段预览里**没有任何镜头运动** |
| 人物区（暗色团）质心漂移 | ≤ **0.43px**（192 帧内 ≈4.8 设计像素） | 人物在这 2s 里也没有位移/缩放 |
| 变化像素（std>8）占比 | 8.0% | 只有发丝/光效级别的呼吸动画 |
| 与修前/修后构图的 NCC | **0.657（修后）** vs 0.619（修前） | 同一裁窗下修后更接近官方 |

⇒ 官方素材（那张 192² 的 preview 动图）**答不了"入场时人物是否移动"**（它是入场**之后**的 2s 循环，与 `docs/VISUAL-TESTING.md:49` 的既有结论一致），只能给"静止态构图"这一个真值；"入场镜头该怎么走"仍以用户真机为准（见未定项）。

### 五、回退开关（写法与既有开关同形）

| 开关 | 取值 | 默认 | 一句话 |
| --- | --- | --- | --- |
| `charfit` | `auto` / `off` / `legacy` | `auto` | 角色层适配档：`auto` = 有相机层则不适配、无相机层且超屏才兜底；`off` = 任何包都不适配（相机语义照旧）；`legacy` = **逐位回到改动前**（蒙皮层不接相机 + 角色恒钉画布中心）。非法/未知/空串 → `auto` |

与既有相机档**正交**：`?campose=off`（或页面上的 🎥 相机 按钮）是"整条相机链不接"⇒ 回到上游那种**静止取景**（背景/人物都不动）；`?charfit=legacy` 只回到"角色不吃相机 + 被居中"。两个一起用可得"改动前的画面"。

### 六、影响面（全语料 10 包扫描，`core/we-scene-bundle.js` 的角色层判据）

命中"无父级 + `animationlayers`"的层共 4 个：hina 人物（超屏 ✓、有相机 ✓ ⇒ **行为改变**）、凯尔希「长发3」（超屏 ✓、无相机 ⇒ `auto`==`legacy` 不变）、白子「伊蕾娜」/GirlCat「girl」（不超屏 ⇒ 分支本来就不触发）。
⇒ 默认档的可见变化**只有用户报的那一个包**；蒙皮层相机接线只在 `camPose != null` 时生效 ⇒ 其余 9 包（含 5 个"相机层是逐属性脚本、默认不施加"的包）不受影响。

### 七、门禁

- 新增 `tests/charfit-camera-test.mjs`（44 断言，~1.5s）已注册进 `tests/run-all-tests.sh`（名字 `charfit-camera`）。
- `tests/camera-pose-test.mjs` 48/48（含"旧口径只由 charfit=legacy 提供"与"默认不再居中"两条新断言）。
- `tests/meshsize-test.mjs` 48/48（demo 的 `renderMeshLayer` 调用行未改，`opts2` 合并与 `?meshsize` 正交）。
- P-76/P-84/P-85 回归：凯尔希三档逐位相同 + 背景正常 x0=−208/w=4244 不变；白子三档逐位相同不变（`charfit` 不影响 campose 档位）。

### 八、未定项 / 本机不可验

1. **入场镜头在官方运行时里的真实走向**：本机无 headless WebGL（chromium GPU 进程被沙箱杀掉）、无 WE 运行时；官方预览动图是入场后帧。判据只能到"角色与其它层吃同一个相机"这一层 —— **"入场时人物该不该在画面外（t≈0–2s 相机 3× 对着左下花海）"由用户真机确认**。若用户认为入场不该有运镜，`?campose=off`（或 🎥 按钮切到"关"）就是上游那种静止取景。
2. **相机 `origin` 的 y 符号**（`view = T(−x, +y)`，P-83/P-84 定下的口径）：换符号会让入场起点从"左下花海"变成"左上星空"，本机无官方帧可判；本轮未动（改了会推翻 P-84 的验收）。
3. **非 16:9 画布**：本轮蒙皮层只在"有相机姿态"时接相机，`framed` 窗口随之变化；`?res=WxH`/`auto` 这类非 16:9 画布下蒙皮层与四边形层的窗口一致性**未被真机验证**（16:9 各档逐位不变）。
4. 本机**无真机像素对照**（真机 GL 的混合/浮点差异测不到）；`preview.mjs` CPU 预览不改（它本来就没有相机姿态与适配分支）。

---
## P-101（2026-09-16 目录再整理）仓库按**职责**分四档（`core/` 内核 / `server/` 服务端 / `web/` 站点外壳 / `tools/` 生成器）+ 运行期依赖随包 + 线上 URL 逐字不变

> **本节的来历（为什么这个号此前"有引用无小节"）**：`core/*.mjs`、`server/*.mjs`、`web/*.mjs`、`tools/*.mjs`、
> `build-pages.mjs`、`tests/*.mjs` 共 15 处注释把 2026-09-16 那一轮**代码按职责分层**自述为 `P-101`；
> 但当时它**没有**在本文档留下小节（欠账记录见 §P-105.6 第 1 条、以及 §P-103 开头的编号说明）。
> 本节按号递增插在 **P-100 之后、P-103 之前**补写，只记那一轮整理本身；**同一工作轮**里另立的
> "站点根 = 仓库根 + README 重写 + npm `0.1.1` 发布"已记在 **P-105.1**（含根软链 `we-scene-bundle.js`），
> 两节是同一轮的两面，**互不替代**。

### P-101.1 背景（为什么"移文件"值得单独立号）

1. **脚本位置一改就红**。P-98 的**第一轮**目录收拢（根 `146 → 27`/`29`，见 P-98.5）动的是脚本落点，
   第一轮全量门禁 **PASS=27 FAIL=36**；36 项红的根因**全是"路径语义"**、没有一项是逻辑错
   （逐条根因表在 §P-98.5）。⇒ 结论：这个仓库真正脆的是"**谁按什么口径解析根**"，不是代码。
2. **两个"根"长期同名撞车**：`MPW_ROOT` 在本仓库的既有语义是**工作区根**（`$MPW_ROOT/allwallpaper`、
   `$MPW_ROOT/wallpaper_engine/assets` 都从它解析），而脚本自己的"仓库根"是另一回事；脚本一旦误移，
   两者会互相覆盖（§P-98.5 第 5 条 `quality-tiers` / `camera-pose` ENOENT）。
3. **发布面有硬依赖**：`package.json` 的 `files` 白名单漏了运行期真依赖 ⇒ `0.1.0` 的 `./server` 入口
   在别人机器上**必崩**（`server/pack-dir.mjs` / `web/pwa-inject.mjs` / `core/scene-project-json.mjs`
   三件当时都不在包里）。**这是发出去就会中的 bug**，不能只当"整理"。
4. **站点面有硬约束**：线上 URL 必须逐字不变（`/demo.html`、`/bundle.js`、`/sw.js`、`/icons/…`）；
   而浏览器侧只能写**相对**说明符 —— Pages 项目站点在 `/<repo>/` 下，写 `/bundle.js` 会解析到域名根 ⇒
   在线 demo **一直 404**（`demo.html:872` 的注释）。

### P-101.2 改了什么（文件 : 行 / 路径）

| # | 改动 | 落点 |
|---|---|---|
| 1 | 代码按职责分四档（**只动落点，不动 URL**）：`core/` 7 文件（`we-scene.mjs` 库入口、`we-scene-bundle.js` 渲染内核、`scene-project-json.mjs`、`attach-transform.mjs`、`puppet-skin.js`、`audio-band-array.mjs`…）／`server/` 2 文件（`we-scene-demo-server.mjs`、`pack-dir.mjs`）／`web/` 8 项（`sw.js`、`sw-policy.mjs`、`pwa-inject.mjs`、`manifest.webmanifest`、`icons/`、`diag.html`、`probe.html`、`diag-flags.json`）／`tools/` 2 文件（`make-sample.mjs`、`make-icons.mjs`） | `core/`、`server/`、`web/`、`tools/` |
| 2 | `scene-project-json.mjs` 的 `MPW_ROOT` 兜底：作者机**绝对路径**字面量 → `path.resolve(…'..','..')`（= 本模块的仓库父目录，与其它脚本口径逐字一致；作者机上**解析结果同一个目录**） | `core/scene-project-json.mjs:32-36` |
| 3 | 服务器落点常量集中一处，不再散写相对路径：`REPO_ROOT` / `WEB_DIR` / `CORE_DIR` / `SHADERS_DIR` | `server/we-scene-demo-server.mjs:26-31` |
| 4 | `pack-dir.mjs`、`make-sample.mjs`、`make-icons.mjs` 的 `HERE`/`REPO_ROOT` 随落点重算，**根口径仍取自单一事实源** | `server/pack-dir.mjs:26-28`、`tools/make-sample.mjs:44`、`tools/make-icons.mjs:16` |
| 5 | Pages 发布面白名单从"根级文件名集合"改成**显式 `[仓库内落点, 产物内落点]` 映射**（`core/we-scene-bundle.js` → 产物根 `we-scene-bundle.js` **与另一个产物别名**），线上路径逐字不变 | `build-pages.mjs:31`、`build-pages.mjs:76` |
| 6 | 自带服务器加同名**别名路由**；**不暴露** `/core/**`（发布面仍由白名单唯一决定） | `server/we-scene-demo-server.mjs`（站点路由段） |
| 7 | 浏览器侧说明符一律**相对路径**：`demo.html` 里写的是相对形态的 bundle 说明符（**产物别名**，仓库里没有这个真文件），`elysia/demo-elysia.js` 写 `../we-scene-bundle.js` ⇒ 自带服务器与 `/<repo>/` 两边都命中 | `demo.html:872` |
| 8 | `files` 白名单补运行期真依赖（`core/scene-project-json.mjs`、`server/pack-dir.mjs`、`web/pwa-inject.mjs`、`shaders/`、`docs/DATA-LIMITS.md`…）；`packaging-test` 新增"files 覆盖运行期依赖"判据 | `package.json` 的 `files`、`tests/packaging-test.mjs:182` |
| 9 | 测试侧同步：`tests/_root.mjs` / `tests/diag-flag-check.mjs` / `tests/pwa-test.mjs` 按新落点取根；`tests/docs-check.mjs` 把四档补进"被引用文件候选落点" | `tests/`（4 处） |
| 10 | 根目录 tracked **29 → 12**（`README.md`、`THIRD-PARTY.md`、`LICENSE`、`package.json`、`index.html`、`demo.html`、`build-pages.mjs`、`check.sh`、`start-demo.sh`、`we-scene-bundle.js` 软链 + 2 份 `ref*` 基线） | 仓库根 |

### P-101.3 证据（命令 + 输出摘要，本机实测）

```
# 分档落点数
$ for d in core server web tools; do printf "%-9s %s files\n" "$d/" "$(ls $d | wc -l)"; done
core/     7 files      server/   2 files      web/      8 files      tools/    2 files

# 根目录 tracked 收敛
$ git ls-files | grep -v / | wc -l
12

# package.json 的运行期依赖（曾经漏掉的三件现在都在）
$ node -e "const p=require('./package.json');console.log(p.version+' | '+p.files.length+' 条 files')"
0.1.1 | 28 条 files      # 含 core/scene-project-json.mjs、server/pack-dir.mjs、web/pwa-inject.mjs、shaders/

# 文档一致性（引用完整性 + P-编号非降 + diag-flags 双向）
$ node tests/docs-check.mjs
检查 16 个文档 · 507 个文件引用 · P-编号健康 ✓ · diag-flags ✓
✓ 文档一致性全部通过            # rc=0

# 分发形态（含"files 覆盖运行期依赖"与"打包后零个人绝对路径"两组判据）
$ node tests/packaging-test.mjs
packaging-test：133 通过 / 0 失败（共 133 条断言）

# 服务端上限（同轮 P-104 线）
$ node tests/data-limits-test.mjs
===== data-limits-test: 38 通过 / 0 失败 =====
```

> **未跑项（如实记）**：本轮补写**没有**重跑全量门禁（资源纪律：不跑重活）。`node tests/packaging-test.mjs`
> 在当前工作树上若**带内层 `check.sh` 闸门**运行，会出现 2 条红，**根因是并发线的"旗标登记时差"**：
> `docs-check` 的 `✗ 代码有·文档无（漏写 N 个）: …`（N 个旗标是**其它在飞线**刚加进代码、还没写进
> `docs/README-DIAGNOSTICS.md`），第二条红是内层 `--no-gate` 阶段被它连坐（rc=1）。实测序列：06:22 全量时是
> `submesh, subtri`（子网格探针线，06:29 已自行补登记，并取了 **P-109**）；06:30 复查同类换成
> `baseline, baselinedur, baselineswap, bgwrapfix`（基线快照 / bgWrap 时序两条线，**仍在飞**）。
> 早先那版 `known.json` **悬空引用**（P-108 线首次写入时用了仓库根相对写法）**已修**：改成正确落点
> `tests/known.json` + 行为描述；修完当时（06:27）实测 `docs-check` 的**文件引用**判据 ✓、`P-编号健康` ✓
> ⇒ 本节自身无红（06:32 起 `docs-check` 的引用红全部来自**其它在飞线**新写的 `vendor-ref/…` 与
> `dsh-mpkg-wallpaper/docs/…`，逐行 grep 证明不在 P-108 节内）。
> ⚠ `docs/README-DIAGNOSTICS.md` 属那几条在飞线，**不在本节代改**（对方还在改代码，代写会互相踩）。

### P-101.4 回退（怎么退、退到哪）

| 目标 | 做法 | 代价 |
|---|---|---|
| 退回"根级平铺"（P-98 之后的形态，commit `339f5aa`） | 把四档目录里的文件 `git mv` 回仓库根；`files` 白名单、`build-pages.mjs` 的 `PAGES_KEEP_FILES` 映射、服务器的别名路由、`tests/*` 的取根、`docs-check` 的 `MOVED_DIRS` 五处同步改回 | **约 1 人日**；且会**重新引入**"两个 `MPW_ROOT` 撞名 + 运行期依赖不随包"两类已修 bug ⇒ 不建议整退 |
| 只退"随包分发"那一半（最可能的诉求） | 从 `package.json` 的 `files` 删掉四档条目；**不改**目录布局 | 分钟级；但 `0.1.0` 的 `./server` 入口崩会**立刻复现** |
| 只退某个别名 | `build-pages.mjs` 的映射数组里删对应行 + 服务器删同名路由 | 分钟级；**会改线上 URL**（用户约束②：不动包结构/URL） |

### P-101.5 未定项 / 不随本节关闭

1. **`tools/make-sample.mjs` 的包内路径是否与仓库同形**：它留在 `tools/`，`files` 里按根级产物名
   `make-sample.mjs` 发布（`samples/**` 等按**相对说明符**引用它）—— 若将来要让包内路径与仓库路径同形
   （`tools/…`），要同步 `samples/` 的引用与 `build-pages.mjs` 的映射，属**会改包结构**的改动（用户约束②下先不动）。
2. **`docs/` 是否进站点产物**：本轮口径仍是"**不发**"（只发具名白名单 `docs/COPYING-RULES.md` 一份）。
   要发须按**具名白名单**加回，整目录会让 `demo-check` 的 D6 判红（`docs/PATCHES.md` 含描述闸门自身的 `/root/` 字样）。
   同一未定项在 §P-98.6 第 1 条、§P-105.6 亦有记录，**本节不重复关闭**。
3. **`we-scene-bundle.js` 根软链**：P-105.1 立的（`elysia/we-renderer/textures.js` 必须用站点根的**扁平**说明符，
   而 Node 只按真实相对路径解析）。软链在 `npm pack` / `Pages` 产物里的**打包器支持面**未被逐个验证过
   （`publish-check` 与 `demo-check` 目前按 `lstat` 跳过/断言软链）—— 缺一条"解包后软链仍可解析"的断言。

---
## P-103（2026-09-16/17 粒子渲染正确性 · 用户第 12 条）四项官方口径修复（quad 图层变换 / 粒子自转 / exponent 非线性分布 / 发射器初速）+ 128 元频段数组契约收口

> **编号说明**（补 P-105.6 第 1 条的待办）：本节把**两个在途自述 P-103 的模块**一次收口 ——
> ① `core/we-scene-bundle.js` 的粒子渲染四项修复（源码注释、`tests/particle-render-correctness-test.mjs`、
> `tests/particle-cost-probe.mjs` 三处均自述 P-103）；② `core/audio-band-array.mjs` + `docs/AUDIO-BAND-SPEC.md`
> + `tests/audio-band-array-test.mjs`（自述 P-103，MIT 口径对照，见 §P-103.4 末）。
> 按 `tests/docs-check.mjs` 的"**P 编号按文件顺序非降**"要求，本节插在 **P-100 之后、P-105 之前**；
> `P-101`（目录再整理）与 `P-104`（发布纪律）两号仍归各自那条线，本节不动。
>
> 用户原话（第 12 条）：**"你有一些粒子效果的渲染是有问题的，开源仓库里有方案，去参考一下。"**
> 完整判据式取证（现象 / 两侧数字 / 依据 / 差距表 / 量化）见 **`docs/PARTICLE-RESEARCH.md`**；本节只记"改了什么、凭什么、多少"。

### P-103.1 问题清单（判据式，要点）

本机语料 = **11 个 scene 型真包 / 49 个粒子层**（`$MPW_ROOT/allwallpaper/dd`）。四条判据的命中：

| 判据 | 命中 | 现象（可见） | 改前数字 | 官方应有 |
|---|---|---|---|---|
| R：`rotationrandom`/`angularvelocityrandom` 或 `angular*`/`rotation*` 算子 | **14/49 层** | 花瓣/玻璃碎片/hex 光斑**全部轴对齐**（"僵死的贴片"） | 长轴角散布 **0°**、竖直占比 **100%** | 散布 44–166°、竖直 27–55% |
| Q：图层 `scale≠1` 或 z 角 ≠0 | **35/49 层** | quad 形状不吃图层变换 ⇒ 长宽比恒等于贴图比例 | 长/短边中位恒 **1.78**；3327063360「萤火虫」小 **7.06×** | 长/短边 1.05–1.70；边长 = `size/2 × scale` |
| E：`initializer.exponent` ≠1 | **2/49 层** | 花瓣尺寸"都一样大"、缺小花瓣 | 均值 **60.0**（均匀分布） | 均值 **53.33**（`pow(u,2)`），P(<50) 0.25→**0.50** |
| S：`emitter.speedmin/speedmax` ≠0 | **2/49 层** | 光标处花簇**原地不动** | 出生速度 **恒 0** | `\|v\| ≤ speedmax(20)`，方向 = 基准点→出生点 |

> 口径更正：`docs/README-DIAGNOSTICS.md` 原先写"14/40 个测试包""30/40 层受影响"——分母是本机**粒子层数 49**（分子复算 14 / 35）；
> 该 4 行同时把编号从误标的 `P-101①..④` 更正为 **`P-103①..④`**（代码/测试/探针三处一直自称 P-103）。

### P-103.2 修了什么（四项，各带回退开关）

| # | 修复 | 依据（官方资产 / 开源实现的那段逻辑） | 回退开关 | 登记 |
|---|---|---|---|---|
| ① | quad 的**图层变换**（局部偏移先按 z 角 R(−θ)、再逐轴 ×`scale`，与 `spawnParticle` 发射器偏移**同序**） | 官方 `genericparticle.vert:86-87`（quad 位置整体乘 MVP ⇒ size 偏移也吃图层 T·R·S） | `?pquad=legacy` | `docs/README-DIAGNOSTICS.md` |
| ② | 粒子**自转**（z 轴 roll 的两条局部轴 right/up） | 官方 `common_particles.h:20-38 ComputeParticleTangents` | `?prot=legacy` | 同上 |
| ③ | 随机 initializer 的 **exponent 非线性分布**（`值 = min + pow(u,exp)·(max−min)`，**复用同一次 `rng()` 抽样**） | 官方资产给字段语义 + GPL-3.0-only 参考的**行为**（出生期 `pow(t,exp)` 后再 /2，洁净室自写，差异见 §P-103.3） | `?pexp=legacy` | 同上 |
| ④ | 发射器 **`speedmin/speedmax` 初速**（沿"基准点→出生点"，仅字段非 0 时抽一次随机数） | MIT `webwallgl particles.js:804-806`（口径对照，未复制代码）+ 真包语料 | `?pspeed=legacy` | 同上 |

四项一律 **official ↔ legacy 双向**断言，并额外断言**无该字段/无该初值时两档逐位相同**（防"顺手多抽一次随机数"这类隐性回归）。
`diag-flag-check`：**代码 126 个开关 == README 主表 126 行，0 差异**（本轮未新增开关，只改登记文字与行号指针）。

### P-103.3 洁净室规格与**新旧差异（≥4 点）**

③④ 两项的行为对照源是 **GPL-3.0-only**（`lwe-ref` = linux-wallpaperengine）—— 规矩是"**看行为、写规格、自己实现**"。
规格（只写公开契约与算法事实）：*若 initializer 声明了 `exponent`，标准均匀随机数 `u` 先做幂变换再线性映射到 `[min,max]`；
`exponent` 缺省 = 1（退化为均匀）；`size` 类 initializer 的映射结果在**写出前减半**。发射器若声明了 `speedmin/max`，
出生时给一个沿"发射方向"的初速，大小在该区间内取随机（缺省 0 ⇒ 无初速）。*

新旧差异（**我们 vs 参考实现的行为写法**，逐条可查）：

1. **/2 的落点不同**：参考实现在**出生期**把减半折进粒子自身的尺寸值里存下来；我们保持粒子尺寸为原始值，
   在**几何装配期**统一减半（`PSIZE_MODE`，P-74② 已立档）⇒ 同一份数据在 rope（总宽 = `size`）与 sprite（边长 = `size/2`）
   两条生成器之间只需切换一次口径，且 `?psize=legacy` 的 A/B 只影响一处。
2. **随机源不同**：参考实现用标准库 MT19937 + 逐 initializer 的闭包捕获；我们用**自有种子化整数 PRNG**（`rng()`），
   且 exponent 档位**复用同一次抽样调用**、speed 档位**仅字段非 0 时才抽** ⇒ legacy 档可逐位复现（门禁断言 `Object.is` 级）。
3. **结构与诊断不同**：参考实现把 exponent 展开写在 initializer 工厂返回的闭包里；我们写成显式分支，
   并把"本粒子是否真的吃了 exponent≠1"记进 `particleStats.expApplied`（参考实现无任何等价记账），
   `particle-cost-probe` 与真机面板可直接读。
4. **定义域处理不同**：我们对 `u ∈ [0,1)` 直接做幂变换、不额外 clamp（`min/max` 本身来自解析期数值），
   并在 `exponent` 缺省/为 1 时**走与 legacy 完全相同的算式**（不引入新的分支副作用）。
5. **档位与台账不同**：参考实现没有"档位"概念；我们四项各有 `?x=legacy` 回退口、四条都登记进 `docs/README-DIAGNOSTICS.md`，
   并用**真包语料 + 探针数字**做 A/B（这是本轮新增的能力，不在参考实现的形态里）。

> 音频侧（同属 P-103 编号）：`core/audio-band-array.mjs` 按 `docs/AUDIO-BAND-SPEC.md` 的**行为规格**新写，
> 直接使用方是 **MIT** 的 `oneincase/webwallgl`（`renderer/src/web.ts` 的 128 元数组契约），
> 署名与台账已登记：`THIRD-PARTY.md` §12 + `docs/COPYING-RULES.md` §4 #10（差异清单见规格 §5，未复制代码）。
> **该模块尚未接线**（渲染器目前没有实时频谱源，见规格 §6），验收在 `tests/audio-band-array-test.mjs`。

### P-103.4 量化（几何 / 像素 / 代价）

25 个"有粒子批"的层，official vs legacy（命令与逐层表见 `docs/PARTICLE-RESEARCH.md` §1/§2）：

| 维度 | 改前（legacy） | 改后（official） | 判据 |
|---|---|---|---|
| 长轴角散布 | 25/25 层恒 **0°** | **11/25 层**变为 **44–166°**（其余层语料本就没有自转/图层角 ⇒ 保持轴对齐是正确行为） | `particle-shape-audit` |
| 竖直占比 | 100% | 27% / 40% / 55% / 0%（按层） | 同上 |
| 长/短边中位 | 恒 = 贴图比例（1.78） | 1.05–1.70 | 同上 |
| quad 数 / 存活粒子数 | — | **25/25 层两档逐值相同** | 同上 |
| 四角 alpha / 覆盖均值 alpha / 不透明占比 | — | **25/25 层两档逐值相同**（只动几何、不动像素语义） | 同上 |
| 每帧耗时（hina 13 层 / 凯尔希 8 层，30 帧中位） | 1.69 / 1.91 ms | **1.77 / 1.53 ms**（同量级） | `particle-cost-probe --frames 30` |
| `simSteps`/`simUpdates` 每帧中位 | 6 / 245、7 / 224 | **6 / 245、7 / 224**（逐值相等） | 同上 |

历史基线对照：P-69 曾把 hina 粒子从 **62.8 ms / 96000 次更新** 降到 **1.7 ms / 245**；本轮四项修复**没有回退**该数字。

### P-103.5 本轮顺手修掉的两类"引注真错"（都可 grep 复验）

1. **GPL-2.0-only 的逐字代码引注清零（7 处：`core/we-scene-bundle.js` 6 处 + `tests/mock-gl-test.mjs` 1 处）**：
   这些引注把 `wer-ref/`（GPL-2.0-only）的**代码文本**照抄进了注释（例：尺寸减半、样条尺寸插值、blendmode 覆盖、
   initializer 追加、速度倍率、仿真时钟倍率），与文件头自述的"只引用行为结论，未复制其代码/注释/常量组织"**自相矛盾**
   ⇒ 全部改写成**行为描述**（保留 `文件:行` 指针，不含代码文本），并逐条回读参考实现的行为确认描述属实。
   复验判据：`grep -rnoE '`(WPParticle|WPScene|CustomShaderPass|ParticleSystem|ParticleModify)[A-Za-z]*\.(cpp|h):[0-9]+[^`]*=[^`]*`' core/ tests/` → **0 命中**。
2. **官方着色器引注行号纠错（4 处）**：`genericparticle.vert:56` → **`:86-87`**（56 行是 `in_ParticleVelocity` 宏，
   真正的 MVP 乘法在 87、其输入在 86）；`common_particles.h:41-57` → **`:41-49`（trail 切轴）+ `:52-56`（quad 展开）**；
   `genericropeparticle.vert:105-135` → **`:148-167`**（ribbon 的 right/size 混合与展开）；
   `common_particles.h:20-39` → **`:20-38`**。行号按本机官方资产
   （`$MPW_ROOT/wallpaper_engine/assets/shaders/`）逐一实测。

### P-103.6 门禁接线与自证

| 项 | 结果 |
|---|---|
| `tests/particle-render-correctness-test.mjs` | **33 通过 / 0 失败**（5 组：①quad 图层变换 ②自转 ③exponent ④发射器初速 ⑤真包语料 + 代价不回归）；`--only particle-render-correctness` → **PASS（2046 ms）**；引注清理后**复跑仍 33/0** |
| 受引注改动波及的既有门禁项（定向复跑） | `mock-gl-test` **60/0**；`p74-instanceoverride-test` 打印 **60/60 通过**后进程未自行退出被 `timeout` 计 rc=124（**既有 flake**：成功标记已打印、无残留进程、与本次注释改动无关） |
| 门禁注册 | `tests/run-all-tests.sh` **在 `add` 列表末尾追加** `particle-render-correctness`（既有 74 项 `add` 行号一字未动；`--list` 可见，共 75 项） |
| `node tests/diag-flag-check.mjs`（01:49 实测） | **代码 126 == 主表 126，0 差异** |
| `node tests/docs-check.mjs`（01:49 实测） | **rc=0**（`检查 16 个文档 · 502 个文件引用 · P-编号健康 ✓ · diag-flags ✓`） |
| `bash tests/run-all-tests.sh`（**全量**） | **本轮未跑**：父线因本机 OOM（15.4 GB，另一条线在跑转码）下达资源纪律 —— 重渲染审计一次只跑一个、**禁止并行**、**不跑全量**，全量由父线统一安排。按基线（73/0/1/74）+ 本项 1 ⇒ **预计 74/0/1/75**，待复跑确认 |

**外部红（非本轮改动，已定位到别的线，未越界修改）**：`docs-check` 在 **02:13 之后**转红，唯一差异是
`✗ 代码有·文档无（漏写 1 个）: mpwtranscode` —— 该开关是**插件侧**（`dsh-mpkg-wallpaper/lib/client.js:1093`
的 `?mpwtranscode=legacy|aggressive`）在 **02:13:22** 新增的（同目录 `tools/transcode-limit-test.mjs` 当时 mtime
= 02:13:22），而 `docs/README-DIAGNOSTICS.md` 主表**尚无对应行**。按分工该行由插件线登记（本线不改它仓文件、
也不代登记在途开关，避免与并发写入撞车）；登记后 `docs-check` 即回绿。本轮改动清单里**没有**这个开关。

**本轮修红记录**：接手时 `particle-render-correctness-test.mjs` 为 **32/33**，唯一红项是
"① legacy 档顶点 == 独立复算的 P-100 公式"——根因是**断言容差写错**（顶点流是 `Float32Array`，
NDC 分量 ulp=2⁻²⁴，换算回 3840 宽的设计像素上界 ≈5.7e-5 px，实测最大 3.81e-5 px，而断言用了 `1e-6`）
⇒ 按量化上界改成 **1e-3 px**（实测值的 26 倍余量，仍能抓 ≥0.001 px 的真实几何错位）。几何本身**正确**，不是实现错。

### P-103.7 未定（**不随本轮关闭**）

1. 本机**无 headless WebGL**（chromium GPU 进程被沙箱杀）⇒ 判据止于**顶点流级**，没有真机逐像素对照；
   官方预览动图分辨率/色深不足以做角度与尺寸的统计判据（只作方向性佐证，见研究文档 §2.3）。
2. 帧动画 blend、rope 段数、`spritetrail` 采样数三项本轮**只看未改**（行为已对照，见研究文档 §3），若继续对齐需另开取证。
3. `core/audio-band-array.mjs` **尚未接线**（无实时频谱源），因此"真机频段条形状"仍无现场证据。
4. ~~`P-101`（目录再整理）/`P-104`（发布纪律）两号的小节仍待各自那条线补写（P-105.6 第 1 条的剩余部分）。~~
   **✅ 追记（2026-09-17，纯文档收尾轮）：两号小节均已补写** —— `P-101` 见上面 `## P-101` 节、
   `P-104` 见下面 `## P-104` 节，两侧都按号递增插入（P-100 之后 / P-103 与 P-105 之间）。

---
## P-104（2026-09-17 发布纪律）用户两条原话落地：**自动上报默认关** + **一切"自动落盘"都要有上限**（8 类落盘点逐项封顶 + 启动清理 + 手动入口不被连坐）

> **本节的来历（为什么这个号此前"有引用无小节"）**：`demo.html` 的 `MPW-LS-LIMIT` 块、
> `server/we-scene-demo-server.mjs` 的 `MPW_LIMITS` 块、`tests/data-limits-test.mjs` 三处自述 `P-104`；
> 欠账记录见 §P-105.6 第 1 条、§P-103.7 第 4 条。本节按号递增插在 **P-103 之后、P-105 之前**补写。
> **台账在 `docs/DATA-LIMITS.md`**（逐项：触发者 / 改前上限 / 现上限 / 清理策略 / 常量落点），
> 本节只记"为什么改、改了什么、凭什么、怎么退"。

### P-104.1 背景（用户原话两条，逐字）

> ①「像你这种**测试用的自动上报**的功能，这种你在**上传仓库的时候要把它默认给关掉**。」
> ②「这种自动上报、自动把什么**存储到本地**的类型的东西，这种需要**设置上限**的，这上限别忘记了。」

**为什么两条都成立（当时的实测缺陷，不是假想）**：

1. **默认是开的**：自动上报原先只要"没写 `?noreport`"就启动 ⇒ 任何人克隆仓库跑起来，都会**悄悄把当前画面与诊断
   POST 到本地服务器**。这是"测试用功能"，不该是公开副本的默认。
2. **连坐**：`?noreport` 当时把**整块上报子系统**摘掉 ⇒ 连**手动** `🛰 立即上报` 按钮一起消失 ——
   "想手动发一次现场"反而没有入口（用户显式动作被自动路径的开关连坐）。
3. **有几处落盘**完全没有滚动：`reports/selfcheck-<ts>.json`（`/diag` 路径）**零上限**；
   `reports/shots/**` **无全局上限**（换个壁纸就换一个 id 目录，id 越多磁盘越满）；
   插件宿主端 `~/.dsh/.dsh-mpkg-wallpaper/diag-<epochms>.json` 实测 **3483 个 / 63MB**（无上限）；
   渲染器 `localStorage['mpw-props:<id>']` 键数随壁纸数**无限增长**。

### P-104.2 改了什么（文件 : 行 / 路径）

| # | 改动 | 落点 |
|---|---|---|
| 1 | **纪律①**：自动路径**唯一**开法 = `?report=auto`；**不写 = 一个定时器都不建**（默认值本身就是"关"）；除 `auto` 外的值（含 `1`/空）都按关处理；`?noreport` 仍被尊重且优先级更高 | `demo.html:4134`、`demo.html:4141`、`demo.html:4480` |
| 2 | **解连坐**：上报子系统（`doReport` + `🛰 立即上报` 按钮）**恒装载**，手动入口不再受 `?noreport` 影响；自动路径另有 **4 次**上限（旧实现把上限记在总次数上） | `demo.html:4143`、`demo.html:4265`、`demo.html:4295-4299` |
| 3 | **上限唯一来源**集中成一块（要调只改这里）：`reportsMaxFiles 60` / `selfcheckMaxFiles 40` / `reportsMaxBytes 64MB`（前两类**共享**字节预算）/ `shotPerIdMaxFiles 400` / `shotPerIdMaxBytes 200MB` / `shotTotalMaxBytes 500MB`；env 仅测试/现场调参，**非法值一律回落默认**（绝不出现"配错上限 = 把上限关掉"） | `server/we-scene-demo-server.mjs:55-71` |
| 4 | 通用清理器 `pruneDirToLimits`：**数量 + 总字节**双限，**最旧先删**，排序口径 = 文件名里的 epoch 优先（拿不到才退回 mtime）；**任何失败都吞掉**（清理绝不能让写入路径 500）；每次清理**必打一行日志**（用户点名"已删除 N 个最旧文件，释放 X MB"） | `server/we-scene-demo-server.mjs:73-114` |
| 5 | 写入路径**前+后各收一次**（后一次是把**本次这份**也计入上限）：`/diag`（selfcheck）与 `/report` 各两处、`/shot` 三处（每 id 400 帧/200MB + 全局 500MB，全局超限时**删"所有 id 里最旧的那一帧"**，公平、不会一次掏空某个 id） | `server/we-scene-demo-server.mjs:411`、`:413`、`:492`、`:494`、`:562`、`:579` |
| 6 | **启动清理一次**：服务起来先把上次遗留的超限目录收回限内并留痕 | `server/we-scene-demo-server.mjs:977`、`pruneAllOnStartup()` |
| 7 | **不误删别人的产物**：过滤器只认自己造的文件名（`r*.json` / `selfcheck-*.json` / 图片 / `diag-*.json`）⇒ 同目录的 `parity-*.json`（parity 门禁要读）、插件自造的 `custom-dir` 配置、`ffmpeg/` 目录一个都不碰；`shots/<id>/index.jsonl` 是**台账，按设计永不删** | 同 #4；反面断言 `tests/data-limits-test.mjs` 的 B9/D4 |
| 8 | 渲染器 `localStorage['mpw-props:<id>']`：**24 键 / 单值 64KB / 合计 512KB**；写入时 touch `mpw-ls-lru` 时间戳表，超限**按 LRU 淘汰最旧**；单值超限**拒写 + 明说**（不截断、不静默）；**绝不碰**宿主/壁纸自己的键 | `demo.html:2980-3021`（`MPW-LS-LIMIT-BEGIN` 块，`MPW_LS_LIMITS` 在 `:2989`） |
| 9 | 插件 localStorage 单值上限 **256KB**（超限不写 + 一行警告，大图走 IndexedDB）；插件 `diag-*.json` **50 个 / 32MB** + 启动清理一次、最旧先删 | `lib/client.js:88`（`MPW_LS_MAX_BYTES`）、`lib/index.js:1504-1532`（`DIAG_KEEP` / `DIAG_MAX_BYTES`） |
| 10 | 台账与登记：`docs/DATA-LIMITS.md` 全量清单（8 类落盘点 + 3 处常量唯一来源 + 不受影响的"别人的产物"）+ `docs/README-DIAGNOSTICS.md:148` 的 `report` 行改成"默认关"并写明两个手动入口不受影响 | `docs/DATA-LIMITS.md`、`docs/README-DIAGNOSTICS.md:148` |
| 11 | 门禁注册：`run-all-tests.sh` 新增 `data-limits` 项（38 断言 / 4 段：默认关真值表 + 真源码守卫"两条定时器只在 `if (autoReport)` 里" + 手动按钮不被连坐 + **真服务空跑 3s 零新增**；上限用 env 压到很小才能秒级验完清理路径） | `tests/run-all-tests.sh:166`、`tests/data-limits-test.mjs` |

### P-104.3 证据（命令 + 输出摘要，本机实测）

```
# 纪律① 的机器判据（38 断言 / 4 段）
$ node tests/data-limits-test.mjs
  ✓ D7 插件客户端 **自动 trace 上报默认关**：`mpwTrace` 里先判 localStorage['mpwdiag'] !== '1' 就 return
  ✓ D8 插件客户端 **DOM 诊断自动上报默认关**：`mpwdiag === '1'` 才开（旧实现 !== '0' 默认开）
  ✓ D9 插件客户端 localStorage **单值上限**：超 256KB 不写 + 打警告，两处写入都走 mpwLsSafeSet
===== data-limits-test: 38 通过 / 0 失败 =====        # rc=0

# 开关登记双向一致（README-DIAGNOSTICS ↔ 代码），含本轮的 report 行
$ node tests/diag-flag-check.mjs
diag-flags.json 已写出（common=10 个常用）           # 并入 docs-check 后为 ✓

# 文档一致性（§P-104 与 DATA-LIMITS 的交叉引用都真实存在）
$ node tests/docs-check.mjs
检查 16 个文档 · 507 个文件引用 · P-编号健康 ✓ · diag-flags ✓
✓ 文档一致性全部通过                                  # rc=0

# 拍摄链回归（滚动从"写死 400 的内联 while"升级成上限常量后不劣化）
$ node tests/shot-upload-test.mjs                    # 见该文件 :239 的 P-104 注释
```

### P-104.4 回退

| 目标 | 做法 | 代价 |
|---|---|---|
| 只想做 A/B 观察清理行为 | **不改代码**：用 env 把上限压到很小（`MPW_LIMIT_REPORTS_MAX=3` / `MPW_LIMIT_SHOT_FILES=5` / `DSH_WE_DIAG_KEEP=2`）⇒ 几秒内就能看到"删了几个 / 释放多少 MB"的日志与"别人的产物没动" | 秒级；**非法值会被回落默认**（不会把上限关掉） |
| 退回"写死 400 的内联 while" | 把 `pruneShotsId` / `pruneShotsAll` 换回内联循环，删 `MPW_LIMITS` 块 | **不建议**：会重新丢掉 selfcheck 与 shots 全局两条上限（历史实测那条路**完全没有滚动**） |
| 退回"自动上报默认开" | `demo.html:4141` 的 `autoReport` 判据改回"没写 `?noreport` 即开" | 分钟级；但**正是用户点名要关掉的东西** |

### P-104.5 未定项 / 不随本节关闭

1. **插件宿主端 `diag-*.json` 的 50 个 / 32MB** 是 DSHarea 侧改的（`lib/index.js` 落点）；插件仓库那一份
   **是否要同口径登记**未定 —— 缺"两仓文件同源/各自维护"的判据与比对。
2. **错误自上报（`window.error` / `unhandledrejection`）仍默认开**（每会话 ≤8 次、只在真抛错时发、为保留崩溃现场
   **有意不禁用**）。→ **缺真机长会话数据**（"每会话 ≤8 次"在长时间挂机下是否够）才能决定要不要也设上限。
3. **自动路径 4 次上限 vs 服务端 60 份上限**是多对多的关系（多个客户端 × 多轮会话）—— 两者的**联合最坏情形**
   没有量化推演（只有各自单侧上限）。
4. **本机不可验**：真机 `localStorage` 配额耗尽、移动端 Safari 的 LRU 淘汰实测、`📸 连拍` 与清理并发时的
   帧丢失面 —— 都要真机/真浏览器现场证据。

---
## P-105（2026-09-17 发布收口）仓库按职责分层落地 + README 重写（用户点名 4 处）+ GitHub About + npm `wallpaper-engine-web-loader@0.1.1`

> **编号说明**：本轮编号取"**当前最大 `## P-` 标题号顺延**"= P-102 + 1 → 但写入时 P-102 已被
> 插件视觉轮占用、P-103/P-104 已被在途模块引用（见 P-105.6 第 1 条），故取**首个未被占用的号 P-105**，
> 以保证 `tests/docs-check.mjs` 的"P-编号唯一 + 按文件顺序非降"两条判据同时成立。
> （复测：插件视觉轮随后自行改号为 **P-106** 并移到本节之后 ⇒ 标题序 P-100-R1 / P-100 / P-105 / P-106 仍非降，
> P-102 回归帧几何契约，见 P-105.6 第 2 条。）

### P-105.1 仓库分层整理（代码按职责分档；站点根 = 仓库根，线上 URL 逐字不变）

| 档位 | 内容 |
|---|---|
| `core/` | 解析与渲染内核：`we-scene.mjs`（库入口 `mount()`）、`we-scene-bundle.js`（PKG/TEX/MDL + WebGL2）、`scene-project-json.mjs`、`attach-transform.mjs`、`puppet-skin.js` |
| `server/` | `we-scene-demo-server.mjs`（静态服务 + `/report` `/weassist` `/pkgdir`…）、`pack-dir.mjs`（源目录 → `.mpkg`） |
| `web/` | 站点外壳与 PWA：`sw.js` + `sw-policy.mjs`、`pwa-inject.mjs`、`manifest.webmanifest`、`icons/`、`diag.html` / `probe.html`、`diag-flags.json` |
| `tools/` | 生成器：`make-sample.mjs`（确定性合成样例）、`make-icons.mjs` |
| `docs/` | 说明与审计文档（原根级 md 全部移入）；`tests/` 不变 |

- 根目录 tracked **29 → 11**（`git ls-files | grep -v /`：入口脚本、`README.md`、`LICENSE`、`THIRD-PARTY.md`、`package.json`、`index.html`、`demo.html`、`build-pages.mjs`、`check.sh`、`start-demo.sh`、`.gitignore*`）。
- **线上路径与整理前逐字一致**：`build-pages.mjs` 的白名单从"根级文件名集合"改为显式 `[仓库内落点, 产物内落点]`
  映射（`core/we-scene-bundle.js` → 产物根 `we-scene-bundle.js` 与另一别名 `/bundle.js`、`web/sw.js` → `sw.js`、
  `web/icons` → `icons/`…）；自带服务器同步加同名别名路由（`/we-scene-bundle.js`、`/bundle.js`、
  `/attach-transform.mjs`、`/puppet-skin.js`…）。**服务端不暴露 `/core/**`**（实测 404），发布面仍由白名单唯一决定。
- 浏览器侧说明符一律**相对路径**（`demo.html` 指向产物根那份扁平别名、`elysia/demo-elysia.js` 的 `../we-scene-bundle.js`）：
  自带服务器路由与 Pages 项目站点（`/<repo>/…`）两边都命中。
- **新增根软链 `we-scene-bundle.js → core/we-scene-bundle.js`**：`elysia/we-renderer/textures.js` 与
  `elysia/demo-elysia.js` 必须用站点根的**扁平**说明符（浏览器侧只能这么写），而 Node 只按真实相对路径解析 ⇒
  软链补上 Node 一侧。**修前** `attach-transform` / `camera-node` 两项门禁红
  （`ERR_MODULE_NOT_FOUND: …/we-scene-demo/we-scene-bundle.js`，测试经 `elysia/we-renderer/core.js → textures.js` 传递导入），
  **修后两项全绿**。（与 `demo/samples` 同一手法；`tests/publish-check.mjs` 与 `demo-check` 都按 `lstat` 跳过/断言软链。）

### P-105.2 README 重写（用户点名的 4 处）

1. **定位语移位**：`在浏览器里实时渲染 Wallpaper Engine 的场景壁纸（scene.pkg / .mpkg / workshop 源目录），不需要 Wallpaper Engine、不需要 Windows、不需要 GPU 专用驱动 —— 一个本地 Node 静态服务器 + 支持 WebGL2 的浏览器即可。` 移到第 1 个大标题正下方。
2. **发布信息只留两个文本超链接**：`已发布 [wallpaper-engine-web-loader@0.1.1](https://www.npmjs.com/package/wallpaper-engine-web-loader) · [在线 demo](https://xhr666.github.io/wallpaper-engine-web-loader/)`；删掉 GitHub 链接与 PATCHES 描述。
3. **删啰嗦与重复（已处置过的事只写结果）**：
   - 安装章节里**重复出现三次**的自检命令块合成一行（命令已在 A / B 两处给过，只留 Node/WebGL2 两条硬要求）；
   - §7.4(2) 的"曾判为…/旧实现…"审计叙述（含两行删除线）改为**只写处置结果**，原始判定指向
     `docs/WER-REF-LICENSE-AUDIT.md` §3.4（审计原文一字未改，仍在审计文档里）。
4. **保留并归位**：安装方式（三种）、已知限制（§5）、**数据上限（新增，指向 `docs/DATA-LIMITS.md`）**、
   免责声明（位置 = 已知限制之后、许可 §6 之前）、参考致谢（§7，11 个上游项目**到文件级**）。
   - 新增「数据上限与自动上报（默认关）」一节：自动上报默认关 + 5 类落盘物的数量/字节上限表 + 指向
     `docs/DATA-LIMITS.md`（门禁 `data-limits`）。
   - 该节与「安装方式」「免责声明」一样**不占章节编号**：本 README 的章节号被脚注引用
     （§7 及其 §7.1(2) / §7.4(2)），给它们编号会让后续章节整体位移、把引用指错。
   - 结果：README **348 行**；`grep -n '^## ' README.md` 自查通过。

### P-105.3 GitHub About

```bash
gh repo edit XHR666/wallpaper-engine-web-loader \
  --description "…（见下表）…" \
  --homepage "https://xhr666.github.io/wallpaper-engine-web-loader/" \
  --add-topic wallpaper-engine --add-topic webgl2 --add-topic renderer --add-topic scene-pkg \
  --add-topic wallpaper --add-topic nodejs --add-topic mpkg --add-topic pwa \
  --add-topic glsl --add-topic wallpaper-engine-web-loader
```

| 字段 | 值（`gh repo view --json description,homepageUrl,repositoryTopics` 实测） |
|---|---|
| `description` | 浏览器端 Wallpaper Engine 场景渲染器：不装 WE、不用 Windows、不需要专用 GPU 驱动 —— 一个本地 Node 静态服务器 + 支持 WebGL2 的浏览器就能实时渲染 scene.pkg / .mpkg / workshop 源目录（含离线 PWA 与逐层调试门禁）。本仓库不分发任何真实壁纸。 |
| `homepageUrl` | <https://xhr666.github.io/wallpaper-engine-web-loader/> |
| `repositoryTopics` | `glsl`, `mpkg`, `nodejs`, `pwa`, `renderer`, `scene-pkg`, `wallpaper`, `wallpaper-engine`, `webgl2`, `wallpaper-engine-web-loader`（10 个） |

### P-105.4 npm `0.1.1` 补发（发布记录）

| 项 | 值 |
|---|---|
| 版本 | **`0.1.1`**（`package.json`；此前线上只有 `0.1.0`） |
| 命令 | `npm publish --registry=https://registry.npmjs.org --access public` |
| 发布时刻 | `2026-09-16T17:15:54.376Z`（= 2026-09-17 01:15:54 +08:00；本地 `PUBLISH_START=01:15:34` → `PUBLISH_END=01:15:55` +08:00） |
| 文件数 | **143** |
| 体积 | **2.0 MB（tgz）** / **5 247 574 B（解包）** |
| shasum | `3e434d719361c5a2e59bfcdd56347ffd1dd2b3c6` |
| integrity | `sha512-TPnyoNc3+EMYf…J88drG3+GuMBQ==` |
| tarball | <https://registry.npmjs.org/wallpaper-engine-web-loader/-/wallpaper-engine-web-loader-0.1.1.tgz> |
| `dist-tags` | `{ latest: '0.1.1' }`（`npm view … version dist-tags` 复核；首查曾命中本机 npm 缓存仍显示 0.1.0，加 `--prefer-online` 后一致） |

- 随包新增 **`docs/DATA-LIMITS.md`**（补进 `package.json` `files`）：README 的"数据上限"一节按仓内相对路径指向它，
  npm 包内也必须能找到（README 永远随包分发，指针不能悬空）。
- **隐私修一处**：该文件第 39 行的插件 diag 目录原写作作者机**家目录绝对路径**（`/root/.dsh/…`）⇒ 改为 `~/.dsh/…`
  （`~` = 插件宿主端 home）。**这条是 `tests/packaging-test.mjs` 的 D 段（真打包 → 解包 → grep 家目录前缀）抓到的**：
  `tests/publish-check.mjs` 的 `PATH_RE` 只认三种形态（作者工作区前缀 / `home` 家目录 / Windows 用户目录），认不出 `/root/.dsh/`
  ⇒ **两套隐私判据覆盖面不一致**（口径债，见 P-105.6 第 3 条）。修后 `packaging-test` **133 通过 / 0 失败**。

### P-105.5 发布前闸门（以最终工作树重跑，逐条实测）

| 闸门 | 结果 |
|---|---|
| `bash tests/run-all-tests.sh` | **PASS=73 FAIL=0 SKIP=1 / 总 74 项**（唯一 SKIP = `jpeg-decode`，条件项：本机无该形状数据） |
| `bash check.sh --json` | 见 P-105.5 补充（4 阶段 docs/publish/diag/全量门禁） |
| `node tests/docs-check.mjs` | **rc=0** —— 16 个文档 · **478** 个文件引用 · P-编号健康 ✓ · diag-flags ✓ |
| `node tests/publish-check.mjs` | **0 阻塞**；4 条告警 = `docs/PATCHES.md` 三处**历史记录**里的个人绝对路径（历史留痕，未改）+「未提供 WE 资产根 ⇒ 跳过专有文件比对」（informational） |
| `node tests/packaging-test.mjs` | **133 通过 / 0 失败** |
| `node tests/demo-check.mjs` | **29 通过 / 0 失败**（含 D6 产物零个人路径 + 必需文件齐） |
| `npm pack --dry-run` | **143 文件 / 2.0 MB（tgz）/ 5 247 546 B（解包）**；`docs/DATA-LIMITS.md` 与 `README.md` 均在清单内 |
| `gh repo view --json …` | description / homepageUrl / 10 topics 与 P-105.3 一致 |
| `npm view … version dist-tags` | `0.1.1` / `{ latest: '0.1.1' }` |

**本次修红记录**（上一轮被中断留下的半成品）：`attach-transform`、`camera-node` 两项红 ⇒ 根因与修法见 P-105.1 末条；
`docs-check` / `packaging` / `panel-smoke` / `diag-flags` 四项在接手时即已绿（前一轮报告的
"`docs/README-DIAGNOSTICS.md` 引用不存在的 `docs/DATA-LIMITS.md`"与"`core/scene-project-json.mjs` 含个人绝对路径"
两条，实测**均已清零**：`docs/DATA-LIMITS.md` 已在位且被 4 处按 `:NN` 引用，`core/scene-project-json.mjs` 家目录路径 0 命中）。

### P-105.6 未完成 / 未定（**不随本次发布关闭**）

1. **P-101 / P-103 / P-104 三个号已被"在途"模块占用，但 `PATCHES.md` 尚无对应小节**：
   `core/*.mjs`、`server/*.mjs`、`tools/*.mjs` 的注释把**本轮目录整理**称作 **P-101**；
   `core/audio-band-array.mjs` + `docs/AUDIO-BAND-SPEC.md` + `tests/audio-band-array-test.mjs` 自称 **P-103**；
   `docs/DATA-LIMITS.md` + `tests/data-limits-test.mjs` 自称 **P-104**。这些小节需由各自那条线补写，
   且**必须按号递增插入**（例如 P-103 要插在 P-100 与 P-105 之间），
   否则会触发 `tests/docs-check.mjs` 的"P-编号按文件顺序非降"判据。
   **✅ 追记（2026-09-17，粒子线）：P-103 小节已补写**，插在 P-100 与 P-105 之间，含粒子渲染四项修复
   + 128 元频段数组契约收口（见上面 `## P-103` 节）。
   **✅ 追记（2026-09-17，纯文档收尾轮）：P-101 / P-104 两号小节也已补写完毕 —— 本条欠账清零。**
   `P-101`（目录再整理）插在 **P-100 与 P-103 之间**、`P-104`（发布纪律）插在 **P-103 与 P-105 之间**，
   两节都含"背景 / 改了什么 / 证据（命令+输出）/ 回退 / 未定项"；插完 `node tests/docs-check.mjs` **rc=0**
   （16 个文档 · 514 个文件引用 · P-编号健康 ✓ · diag-flags ✓）。
2. **P-102 一号两用 —— 已由插件视觉轮一侧改号解决**：本节写入时 `PATCHES.md` 曾出现 P-102 = **插件视觉轮**
   （顶栏磨砂/下描边/时间线条），而 **P-102 = 帧几何契约**已被 5 个文件引用（`core/web-frame-geometry.mjs:1`、
   `THIRD-PARTY.md` §11、`docs/COPYING-RULES.md` §4 #9、`tests/web-frame-geometry-test.mjs:1`、
   `docs/WEB-FRAME-GEOMETRY-SPEC.md`）；两条线**并发**写入、互不知情。**01:24 复测**：插件视觉轮已自行改号为
   **P-106**（并移到 P-105 之后），标题序为 P-100-R1 / P-100 / P-105 / P-106 ⇒ **P-102 现在唯一归帧几何，冲突消除**
   （那 5 处引用一字未改）。
3. **两套隐私判据覆盖面不一致**（见 P-105.4）：`publish-check` 的 `PATH_RE` 认不出"家目录下的点目录"
   （`/root/.dsh/…`）一类路径，而 `packaging-test` 认家目录前缀 ⇒ 建议把 `PATH_RE` 放宽为家目录前缀一条判据。
   **本轮未改判据**（不为凑绿掩盖发现），仅把被抓到的那一处改成 `~`。
4. **`tests/particle-render-correctness-test.mjs` 未注册进门禁**（自述 P-103 粒子渲染正确性，38+ 断言），
   且无任何文件引用它 ⇒ 属**粒子线的在途夹具**，本次**未纳入提交**（保持 untracked）。
   **✅ 追记（2026-09-17，粒子线）：已接线并纳入**——该夹具实测 **33 断言**（不是 38+），
   注册进 `tests/run-all-tests.sh` 的 `add` 列表**末尾**（既有 74 项行号未动），并修掉它自己的一处
   **容差错**（float32 量化 vs `1e-6`，见 `## P-103` §P-103.6）；**未提交**状态由本轮后续提交关闭（本线不 push）。
5. **历史记录里的个人绝对路径已就地去个人化（4 行，仅改路径、不动事实）**：`publish-check` 原先告警
   `docs/PATCHES.md` 三处（P-98.1 的 CI 复现命令行、P-100 的两处官方预览动图证据路径）＋ 本节自己的一处
   （引用了那个前缀）⇒ 统一改成项目既有约定形态：工作区路径写 **`$MPW_ROOT/`**（= 本仓库的父目录，README §4 的定义）、
   判据描述改成"作者工作区前缀 / `home` 家目录 / Windows 用户目录"文字，**语义与证据链不变**
   （包号 `431960/3554161528`、`192²/50 帧/40ms`、`exit 1 ⇒ 本步骤红` 等事实一字未动）。
   改后 `publish-check` **0 隐私告警**（恢复 P-97.2 记录过的 0 告警口径）。
6. P-97.6 的**法律定性**（审计 §7 U-1 / U-5）仍未结案（需律师意见），不随本次发布关闭；
   ~~RePKG 许可~~ **`notscuffed/repkg` 许可已于 2026-09-17 结案 = MIT**（依据 = 上游 `LICENSE` 原文 + 项目所有者确认），
   该项**从"未结"清单移除**，见 `docs/COPYING-RULES.md` **§9.10**。

---

## P-106（2026-09-16 插件视觉轮 · 用户真机三连反馈）顶栏磨砂「层在但看不见」的真根因（`z-index:-1` 被父底整片盖住）+ 我们**两条规则**把顶栏下描边抹成 transparent 的回归 + 右侧时间线条的对比度定案

> 归属：**插件侧**（`dsh-mpkg-wallpaper`），本文档收口是因为三个现象里有两条要跨仓库取证
> （宿主 CSS 产物 + 渲染器/插件共用的门禁）。不改渲染器任何行为、不改任何开关默认值，
> `diag-flag-check` 仍是 **代码 126 == 主表 126**（本轮**没有新增 URL 开关**）。
> 插件侧详述见 `dsh-mpkg-wallpaper/docs/HEADER-FROST.md` §0/§0b/§6 与 `dsh-mpkg-wallpaper/docs/TIMELINE-RAIL-TOKEN.md` §3b。

### 一、三个现象与归因（都有实测判据，不是推断）

| # | 用户原话/现象 | 归因（**哪条规则**） | 修法 |
| --- | --- | --- | --- |
| ① | 「顶栏磨砂仍然没有」（前一轮已修掉 `normalizeSection` 的 `ReferenceError`，真机 diag 已显示 `injected=true/px=30/bdf=blur(30px)`） | **不是**磨砂链没跑：注入层用了 `z-index:-1`，而宿主顶栏 `position:relative` + `z-index:auto` + `isolation:auto` + `transform:none` **不是层叠上下文** ⇒ 负 z 子层画在顶栏 `background-color`（`rgba(255,255,255,.38)`）**之下**，模糊一点都透不出来 | ① 内联样式 `z-index:-1` → **`0`**；② `.mpw-hdrFrost { z-index:0 }` 等三条层叠规则改为**无条件输出**（原来落在 `if (headerBg)` 分支里）；③ 宿主顶栏直接子节点抬到 `z-index:1`（只改绘制序、不改布局）⇒ 层不盖标题/按钮 |
| ② | 「顶栏下面一部分的描边你给它去掉了」 | **我们两条规则**各带一条 `border-bottom: 1px solid transparent !important;`：`.wSkVaW_header` 基础块 + `if (headerBg && !headerBlur)` 分支（**用户真机命中的就是后者**）。带 `!important` 权重压过宿主，下描边整条变透明 | 两条**全部删除**：插件只改 `background-color`，描边一律交还宿主（亮 `rgba(19,45,83,.26)` / 暗 `rgba(148,180,220,.32)`） |
| ③ | 「右侧时间线条仍不可见」 | **不是我们把条删了**：无头 Firefox + 真 DSH 页面实测 `.eGxaPq_mark::before` computed `background = rgba(0,0,0,0.42)`（我们的 `--mpw-rail-ink` 生效）、`12px×2px`、`opacity=1`、无裁切祖先；宿主 token `--dsw-alias-border-l4` 在 body 上正常解析（`#00000029`）。看不见的是**对比度**：2px 高、16%~42% alpha 的细条压在任意深浅壁纸上会同色系糊掉 | **保留**覆盖（删掉只会更看不见）并按"一定能实现"加强：新增反色描边晕 `--mpw-rail-halo`（`box-shadow: 0 0 0 1px`，亮 `rgba(255,255,255,.55)` / 暗 `rgba(0,0,0,.55)`），几何仍由宿主决定；另修 `hasWall` 判据与磨砂链对齐（原来只看持久化字段 ⇒ 同页面"顶栏有磨砂、rail 判无壁纸"） |

### 二、判据（可复算，两个新探针）

| 探针 | 做什么 | 证据落盘 |
| --- | --- | --- |
| `dsh-mpkg-wallpaper/tools/header-rail-collect.mjs` | 无头 Firefox 打开**真 DSH 页面**（`127.0.0.1:3080` + 会话 cookie），采顶栏/磨砂层/rail 的 computed + 几何 + 祖先裁切 + token 解析值 | `tools/probe-out/<label>.collect.{json,txt}` |
| `dsh-mpkg-wallpaper/tools/header-rail-replica.mjs --both` | **真宿主 CSS + 真插件 `buildCss()` 产物**的最小复刻页；`before` 变体把本轮修复逐条还原 ⇒ 同一 DOM 下的"改前/改后"对照表，且 before↔after **双向断言**（防"探针假绿"） | `tools/probe-out/replica-ab.txt`、`replica-{before,after}/` |

改前/改后（复刻实测，节选）：

| 指标 | 改前 | 改后 |
| --- | --- | --- |
| 顶栏 `border-bottom` | `1px solid rgba(0, 0, 0, 0)`（alpha 0） | `1px solid rgba(19, 45, 83, 0.26)`（alpha 0.26） |
| 磨砂层 `z-index` | `-1`（顶栏底色 alpha 0.38 ⇒ 被整片盖住） | `0` + 宿主内容层 `z-index:1` |
| 磨砂层 `covers header` | true（但被盖） | true（可见） |
| rail `::before` background | `rgba(0,0,0,0.42)`、`box-shadow: none` | 同前 + `rgba(255,255,255,0.55) 0 0 0 1px` |

**像素判据的边界（重要）**：本机是**无 GPU 容器**，无头 Firefox 里 `CSS.supports('backdrop-filter')` 为真但
**不合成** backdrop-filter —— 5 个相同面板分别 `none/blur(10px)/blur(30px)/+isolation/+will-change` 的截图
**逐像素完全相同**（`dsh-mpkg-wallpaper/docs/HEADER-FROST.md` §6 有数据）。
所以本轮把"模糊可见性"的判据从像素差改成**结构性事实**（层叠位置/覆盖/描边 alpha/晕），
观感强度仍留给真机确认（`?hdrfrost=off`、`?railink=off` 都是一秒对照开关）。

### 三、开销（用户要求"开销不要太大"）

只在**状态变化**时同步（设置提交/壁纸切换/主题翻转各一次）+ **3s 一次**低频保险（单例
`setInterval`）。**不装**全树 `MutationObserver`、不监听 `scroll/resize/pointermove`、不做 rAF 轮询、
不在高频路径里反复 `getComputedStyle`。理由与逐项清单写在 `dsh-mpkg-wallpaper/docs/HEADER-FROST.md` §2b。

### 四、门禁（两侧）

- 插件侧 `bash tools/check.sh` —— **9 步全绿**（新增第 9 步 = 真机复刻 A/B）；
  `node tools/frost-rail-test.mjs` 断言**只增不减**（新增 PART 1b：每个设置组合都查
  "下描边未被我们抹透明 / rail 覆盖带晕且无 `!important` 且不碰宿主 token / 磨砂层 `z-index:0` +
  宿主内容抬到 `z-index:1`"，PART 3 追加源码级防复发）。
- 渲染器侧 `node tests/docs-check.mjs`、`node tests/diag-flag-check.mjs`（126==126，0 差异）、
  `bash tests/run-all-tests.sh`（本文件追加**不动 runner**）。

### 五、未定项 / 本机不可验

1. **磨砂观感强度**：本机不合成 backdrop-filter ⇒ "30px 在你的壁纸上够不够/会不会过糊"只能真机看。
2. **rail 条的观感**：反色晕保证"有一圈对比边"，但"这一圈在你的壁纸上够不够显眼"同样只能真机定；
   `?railink=off` 可一秒回到宿主原样对照。
3. **`z-index:0` 的层叠上下文副作用面**：顶栏成为层叠上下文只影响内部谁盖谁（不改 containing block），
   已用 `tools/css-matrix.mjs` 全组合 + 复刻 A/B 覆盖；但**顶栏内第三方插件浮层**（非本仓库）
   若依赖"负 z 子层在顶栏背景之下"这一罕见行为，本轮未真机验证。
4. 真机需要确认的点：刷新后 `?diag` 里 `headerFrost.computed.frostElZ` 应为 `0`、
   `computed.headerBg` 的 alpha < 1、host `border-bottom` 非透明；`rail.markBoxShadow` 非 `none`。

---

## P-107（2026-09-17 透视相机 · 任务书 P1-3 / `UNTOUCHED-AREAS` J 项结案）`buildCamera` 新增透视档（`mat4Perspective`）+ `?projmode=persp|ortho|auto` 回退；语料首次拿到"非正交（3D）包"样本

> **编号说明**：本节按 `tests/docs-check.mjs` 的"P 编号按文件顺序非降"要求**接在文件末尾**（当时最大号 = P-106）；
> `P-101`（目录再整理）/ `P-104`（发布纪律）两号仍归各自那条线（P-105.6 第 1 条的剩余部分不动）。

### P-107.0 长期未定项与本次任务

`UNTOUCHED-AREAS` 的 **J 项**（透视相机 `fov`）从 2026-09-12 起一直标注"**无样本可验**"：
`buildCamera` 只构造 `mat4Ortho`，而当时语料里**每一个**相机对象都带 `general.orthogonalprojection`
⇒ `fov` 写进 pose 也没有落点（只剩一条"fov 10 vs 120 投影逐位相同"的回归断言）。

2026-09-17 用户新下的 `allwallpaper/0917/` 批次补上了这个缺口：**`3509243656` 是语料里第一个（也是唯一一个）
没有正交投影的包** —— 一个真正的 3D 场景。本轮据此把 J 项做成"有样本 + 有实现 + 有回退开关"。

### P-107.1 语义核实：`3509243656` 的相机对象到底是什么（fov / zoom / origin）

**包级读数**（`allwallpaper/0917/3509243656/scene.pkg`，158 MB）：

| 项 | 值 | 判读 |
|---|---|---|
| `general.orthogonalprojection` | **`null`**（字段在、值为 null） | 不是"缺字段"，是作者**明确没勾**正交投影 ⇒ 3D 透视场景 |
| `general.fov` | `50` | 场景级默认视场（度） |
| `general.nearz` / `farz` | `0.0099999998` / `10000` | 就是透视的 near/far（**正交档根本不用它们**，正交恒 ±10000） |
| `general.zoom` | `1` | 场景级缩放 |
| `general.cameraparallax` / `camerashake` | `false` / `false` | 没有鼠标视差/镜头抖动 |
| 对象总数 | 142（59 image + 53 text + 8 model + 4 particle + 1 camera + 1 sound + 16 组） | 图/文本是 HUD 与星空贴片，模型是 3 个星球 + 3 个天空盒 + 圆柱，粒子是星尘 |
| 对象 z 分布 | `{0:96, 5.1:24, 4:10, 4.5:2, 1.68:1, 1.74:1, −0.71:1, −6.36:1, −21:2, −25:1, −30:1, −50:1, 6:1(相机)}` | 世界单位很小（对象有效尺寸 ~1–10），相机 z=6 与内容 −50…+6 **同一量纲** |

**唯一的相机对象（id=443）逐字段**：

| 字段 | 原文 | 判读 |
|---|---|---|
| `camera` | `"default"` | 相机层（官方 runtime 属性按 camera target kind 路由，见 P-81 引注） |
| `origin` | `"0.00000 0.00000 6.00000"` | **静态字符串**（不是 `{animation}`、不是 `{script}`、不是 `{user}`）⇒ 相机位置 = 世界 (0,0,6)，即"相机在 z=6、朝 −z 看" |
| `zoom` | `1`（静态数） | 镜头缩放；1 = 不缩放 |
| `fov` | `{"user":"newproperty71","value":50}` | **用户属性绑定**（面板滑块）——**不是**关键帧、**不是**逐属性脚本。取值 50 |
| `path` | `"scripts/camera_paths_443.json"` | 内容是 `{"paths":[]}` ⇒ **没有运镜关键帧**（相机不动） |
| `angles` | **缺省** | 相机朝向 = 默认（朝 −z）；本轮不猜朝向，见 P-107.6 |
| `queuemode` / `solid` / `disablepropagation` | `sequential` / `true` / `false` | 与投影无关 |

**`project.json` 里的绑定目标**：`newproperty71 = {type:"slider", text:"视场", min:40, max:65, step:0.1,
precision:2, value:50, order:118}` —— 中文 text 就是"**视场**"（= fov），量程 40–65 度是典型镜头视场区间。
⇒ **这是"fov 是运行时相机属性、且是垂直视场角（度）"的直接、可判据证据**（面板上真实可拖）。

**同批对照样本（说明"为什么 2D 包不受影响"）**：

- `3448877775` / `3462491575`：`general.orthogonalprojection = {width:3840,height:2160}`（**有**正交矩形）
  + 相机对象 origin 是**逐属性脚本**（`value.x = scriptProperties.x * engine.canvasSize.x` ⇒ 相机坐标单位 = **画布像素**，
  静态快照 `2434.38477 725.25134 500.00000`）+ `zoom = {"user":"newproperty30","value":1}`
  （**用户属性绑定，不是关键帧** —— 修正任务书里"zoom 关键帧"的说法）+ z=500。
- ⇒ 分界线很清楚：**有正交矩形的包（2D 壁纸）即使带相机层也走正交**；只有"没有正交矩形 + 有 fov"的 3D 包才谈得上透视。

**语料计数（本轮实测，38 个容器）**：`allwallpaper/`（21 个 scene.pkg）+ 插件缓存 `/root/.dsh-mpkg-wallpaper`
（11 个 mpkg）+ `/mnt/sdcard/wallpapertest1`（6 个）⇒ **非正交包恰好 1 个 = `3509243656`**；
带相机对象的包 10 个（dd 4 + 0917 3 + 缓存 3），其中 7 个 origin 是逐属性脚本、2 个是静态串/静态用户属性、1 个（hina）是关键帧动画。

### P-107.2 证据面与许可边界（"官方语义"我们到底有多少）

- **WE 官方没有任何公开文档**给出"fov 如何变成投影矩阵"；本轮**没有**去读 `linux-wallpaperengine`
  （GPL-3.0-only ⇒ 只允许洁净室/行为对照），也**没有**引用 `wer-ref`（GPL-2.0-only）与 `we-layerd-ref`
  （无许可）的任何代码/注释/常量组织。本节所有"上游/官方"陈述都只是**行为结论**，且都沿用本仓库既有引注（见 P-69/P-76/P-81）。
- 我们手里真正可用的两条行为证据：
  1. **相机层的 `zoom`/`fov` 是"camera target kind"运行时属性**（只对相机层扫描，注册 Property/Animation/Script
     三种绑定）—— P-81 已引注。这条支持"fov 有落点是预期内的，不是我们发明的"。
  2. **2D 场景被强制透视时，第三方参考实现用"相机 z=1000 + `fov = atan(h/1000/2)×2`"**（h = 设计画布高）——
     P-69/RE-37 的 `dsOf` 注释已记。这条正是我们"**帧平面锚定 + 由 fov 反求 d**"的同族口径
     （1080p / fov 50 ⇒ d = 1080/2/tan25° ≈ 1158，与 1000 同量级）。
- 结论：**"fov 存在、单位是度、语义是垂直视场、相机在相机层 origin 处、朝 −z"= 语料级证据（可判据）**；
  **"官方如何把 fov 落成矩阵、near/far 与 zoom 如何耦合"= 只有行为对照级证据** ⇒ 全部列入 P-107.6 未定项。

### P-107.3 实现（`core/we-scene-bundle.js`）

1. **新增 `mat4Perspective(fovy, aspect, near, far)`**：与 glMatrix `perspective` 逐式同构
   （`out[0]=f/aspect`、`out[5]=f`、`out[10]=(far+near)/(near−far)`、`out[11]=−1`、`out[14]=2·far·near/(near−far)`、
   `out[15]=0`；Float32 存储），与既有 `mat4LookAt`（同布局：行=相机基向量、平移在第 4 列）配套 ——
   `clip.w = −z_view` ⇒ **可见点的视空间 z 必须为负**，这是本档最容易写错的一处。
2. **`buildCamera` 新增 `wantPersp`**（唯一判据）：
   `auto`（缺省）= `!orthoRect && !!general.fov`（= 旧 `isOrtho` 谓词取反，正是"3D 场景"的判据）；
   `persp` = 强制；`ortho` = 强制关。**正交档一行未动**（只有 `const projection` → `let projection` 这一处形参改动，
   表达式逐字保留）⇒ 要求里的"正交路径逐位不变"是靠"不碰它"保证的，再由测试冻结对拍兜住。
3. **两条锚定**（透视档唯一真值表，都在 `buildCamera` 内同一段）：
   - **节点锚定**（非正交包 **且** 相机节点原点 z 可用）：相机 = 相机层 origin（`x,y,z` 就是世界坐标里的相机位置），
     朝 **−z**。`parseScene` 把世界 y 翻成 `PROJ_H − 作者y`（2D 口径）⇒ 相机的 y 必须按**同一式子**搬
     （`ey = PROJ_H − origin.y`），屏幕仍保持 y-down（`view_y = −(world_y − ey)`，即相机 up = 作者 +y）——
     这样屏幕方向与正交档**同号**，贴图 v 不会翻。深度 `view_z = world_z − ez`，`w = ez − z` = 距离。
     矩阵形式：`view = S(1,−1,1)·T(−ex, ey, −oz)`；`zoom` 只能进投影（`proj[0]/proj[5] × zoom`，与 elysia
     `elysia/we-renderer/camera.js` 的透视分支同式）。
   - **帧平面锚定**（其余一切透视档，含把正交包强制成 persp 的 A/B）：相机钉在 (取景窗口中心, −d)、
     `d = (framedH/2)/tan(fovy/2)` ⇒ **z=0 平面与正交档逐位相同（到 Float32 舍入）**，`z≠0` 的层按 `d/(d−z)` 缩放；
     `zoom` 已经进了 `framedH` ⇒ 这一档**不再**乘 zoom（否则双重施加）。
4. **near/far**：透视档用 `general.nearz`/`general.farz`（缺省 0.01/10000）；正交档保持历史值 ±10000。
5. **`fov` 取值链**（与 `zoom` 的三级回退同形）：`pose.fov`（关键帧动画）→ **用户属性绑定**
   （`cameraNode.fovFromUser`，由 `applyUserProperties` 从 `fovBinding` 解析，**与 P-76 给 zoom 做的完全同形**）
   → 绑定原文静态值 → 相机节点值 → `general.fov` → 50；并 clamp 到 (1°,179°)。
6. **只读台账**：`buildCamera` 回传 `projMode` / `projKind` / `projAnchor` / `fovY` / `perspDist`
   （宿主/`?audit`/测试都靠它回答"这一帧走没走透视、fov 多少"）；启动日志加一行 `P-107 投影档 projmode=…`（进 #log → 进上报）。
7. **周边接线两处**：①`?cam=node` 的静态回退从 `originRaw.value` 改成 `parseVec3(originRaw)`
   （原来对**静态字符串** origin 会得到 [0,0,0]，`3509243656` 的相机位置永远施加不上；语料 10 个相机对象里只有它用字符串 ⇒ 其余逐位不变）；
   ②`__pointerDesign` 在透视档改用台账 `framedW/framedH`（透视矩阵的 `proj[0]` 反推不出窗口宽度；正交档两者逐位相同）。

### P-107.4 回退开关与登记

- **`?projmode=persp|ortho|auto`**，默认 `auto`。**默认取 auto 的理由**：跟随场景自己的声明 ⇒ 正交包（语料 20/21）
  **零变化**，而"没有正交矩形 + 有 fov"本身就是 WE 的 3D 判据。
- ⚠ **名字不能叫 `?proj=`**：那个名字在 `demo.html` 里已被 P-85 占用（`?proj=off` = 跳过官方 project.json 读取），
  两者语义无关，共用一个名字会"改属性表 + 改投影"同时发生（`?camera=` 也被 demo 的 auto-fit 占用）。
- 优先级：`opts.proj`（测试/宿主显式传）> `window.__mpwProjMode`（宿主实时写）> `?projmode=`（加载时读一次）；
  真值表 = 纯函数 `projModeFrom()` / `resolveProjMode()`，非法/未知/空串 → `auto`（不静默变成 persp/ortho）。
- 登记：`docs/README-DIAGNOSTICS.md` 主表"① 渲染语义"组新增 `projmode` 一行；
  `node tests/diag-flag-check.mjs` 双侧一致（本轮开始时该闸门是 **127==127 且有一个红项 `mpwtranscode`（插件侧、
  不属本任务）**，收尾时插件那条线已补齐 ⇒ 现为 **128==128，0 差异**）。

### P-107.5 验收（可判据 + 实测数字，全部由 `tests/camera-persp-test.mjs` 复跑）

**① 正交路径逐位不变（硬要求）**
- 与**冻结参考实现**（改动前的 `buildCamera` 投影/view 表达式，逐字抄在测试里）逐元素 `===`：
  合成正交包 × 5 档（缺省 + 4 种 fillmode + cameraPose）+ 3 个真包（`3719111841`/`3554161528`/`3327063360`）
  × 3 档（缺省 / cameraPose / `cam=node`）+ 3 个真包的 `?projmode=ortho` ⇒ **全部逐位相同**。
- 另做一次性取证：把 `git show HEAD:core/we-scene-bundle.js` 的旧 bundle 拿出来与现状同进程对拍
  5 个包 × 2 种姿态 = **10 组 projection/view/viewBg/framedW/framedH 全 `===`**。

**② 透视包在 `persp` 与 `ortho` 下确有差异，且方向合理（1920×1080 出图口径）**

| 层（世界 z） | persp 屏宽 | ortho 屏宽 | 比值 |
|---|---|---|---|
| Custom BG（z=−50，最远） | 55.9px | 2.63px | 21.26× |
| Sun png（z=−30） | 173.7px | 5.25px | 33.07× |
| BB8k3 / st2（z=−21） | 5621.7px | 127.5px | 44.09× |
| 迟滞滑块（z=0） | 86.9px | 0.44px | 198.4× |

- **近大远小**：Custom BG（世界宽 2.70）与 Sun png（世界宽 5.40）的屏宽比 **实测 3.1072 = 预测 3.1072**
  （预测 = (5.40/2.70)×(56/36)，即 `w ∝ 世界宽/(z_cam − z)`，z_cam = 6）⇒ 误差 < 0.01%。
- **层间距被压缩**：近层 z=5.1 与远层 z=−50 的**同一世界偏移**屏距比 = **62.2×**。
- **fov 真的改变投影**：`Sun png` 屏宽 fov40 = 222.5px → fov65 = 127.1px（**×1.519 = tan32.5°/tan20°**）；
  `proj[5]` 之比 = 1.7503（同值）。面板"视场"滑块：`newproperty71=65` ⇒ `fovFromUser=65` ⇒ 投影响应 65；
  属性表清空后回落绑定静态值 50（幂等）。
- **旧断言改口径**：正交档 fov 10 vs 120 **仍逐位相同**（保留在原 `camera-pose-test` ③）；
  透视档 fov 10 vs 120 **必须不同**（`proj[5]` 11.4301 vs 0.5774，比 = tan60°/tan5° = 19.81）。

**③ 正交包被强制透视时的 A/B 安全性**：凯尔希 `3719111841` 39 层 z **全为 0** ⇒ `?projmode=persp` 下
投影矩阵确实换成透视（`proj[11]=−1`），但**层矩形 maxΔ = 1.74e-4px**（Float32 舍入量级）—— 这就是"帧平面锚定"的设计不变式。

**④ mock-GL 真实 `renderScene`（不是只测 `buildCamera`）**：合成 3D 场景（无正交矩形 + 相机 origin `0 0 6`）
三层 z = 3 / 0 / −3 ⇒ persp 档屏宽比 **6 : 3 : 2**（实测 2.000 : 0.667 = `d/(z_cam−z)` 透视律），
`mvp` 的 w 行 = `[0,0,−1,3]`（w = 相机距离）；ortho 档三层屏宽**完全相同**（10.000px）、w 行 = `[0,0,0,1]`。

**⑤ 与官方预览动图的对照**：`allwallpaper/0917/3509243656/preview.gif`（224×224、50 帧、2.0s、25fps）抽帧目测
= **深色星空底 + 左中部一团星体 + HUD 文本/时间/波形条**，2 秒内基本静止（相机不动，与 `paths:[]` 一致）。
这与我们的读数自洽（黑底、星球/星云贴图在 z=−6…−30、HUD 文本在 z=4…5.1、相机 z=6）⇒
**只有透视才能把这 56 单位的 z 跨度压成这样一幅画面**；但**像素级对齐不可比**（我们的 3D 网格/脚本宿主未接，见 P-107.6）。

### P-107.6 未定项 / 未完成（不随本节关闭）

1. **相机 `angles`（朝向）未接**：透视档固定"朝 −z"。`3509243656` 的相机没有 angles（= 默认朝向）⇒ 本轮无可对照样本；
   出现带 angles 的 3D 包时再补（要先把欧拉角的三轴顺序钉死）。
2. **3D 网格（`MESH_VS`）与粒子的 CPU NDC 通路没有接透视相机**：蒙皮层仍按设计画布 1:1 映射（P-100 的 u_View/u_Framed），
   粒子仍在自己的 `perspCam`（材质 flags bit2）通路上算 NDC。⇒ `3509243656` 的 8 个模型 / 4 个粒子层**不会**随本档改变，
   整包画面因此不可能与官方 GIF 像素对齐（本轮只保证**四边形层**的投影语义正确）。
3. **官方口径未证实**：fov 是垂直还是水平视场、near/far 的确切含义、`zoom` 与 `fov` 的耦合关系（我们是"zoom 乘进投影"），
   只有行为对照级证据（P-107.2）。
4. **逐属性脚本 origin 仍不求解**（P-81 既有结论）：若某 3D 包的相机位置来自 `{script:…}`，节点锚定只能用编辑器静态快照。
5. **`scene.camera.eye/center/up` 在透视档不参与**（正交档照旧参与）：`3509243656` 的 `scene.camera` 是编辑器残留
   （eye 与 center 只差 ≈1.0 世界单位），当 3D 相机用会明显错；若将来遇到"没有相机层但 `scene.camera` 是真运镜"的 3D 包，
   需要单开一条锚定（届时先取证再动）。

### P-107.7 自证（本轮实测）

- `node tests/camera-persp-test.mjs` ⇒ **57 通过 / 0 失败**（⑦ 段走真实 `renderScene`）。
- `bash tests/run-all-tests.sh --only …`（定向子集，未跑全量门禁）⇒ 全绿，见本轮汇报（`camera-persp` 新增项已注册在 `tests/run-all-tests.sh` **末尾**）。
- `node tests/docs-check.mjs` ⇒ rc=0；`node tests/diag-flag-check.mjs` ⇒ 代码 128 == README 主表 128，**0 差异**。
- 并发提示（写进这里以免后人误判）：本轮进行时另有发布/插件线在**同一工作树**上改 `docs/README-DIAGNOSTICS.md`、
  `docs/PATCHES.md`、`core/we-scene-bundle.js` 的非相机区段；本节只新增自己的行/段，未动他线内容。

## P-108（2026-09-17 权威全量唯一红项 `package-matrix`）判据式结案：10 项 `NEW` = **语料新增**（不是渲染回归）+ `known.json` 白名单落点回归修复 + `--absorb-new` 只登记新包

### P-108.0 症状（复跑原文，不是转述）

`node tests/package-matrix.mjs --check` ⇒ **rc=1**，全文只有一类失败断言 = `NEW`（基线中不存在），10 条：

```
✗ 与基线相比 10 项退化：
  ✗ 3195212886 基线中不存在（新包）      ✗ 3233141951 基线中不存在（新包）
  ✗ 3250755486 基线中不存在（新包）      ✗ 3299228616 基线中不存在（新包）
  ✗ 3351163962 基线中不存在（新包）      ✗ 3448877775 基线中不存在（新包）
  ✗ 3462491575 基线中不存在（新包）      ✗ 3509243656 基线中不存在（新包）
  ✗ 3588181703 基线中不存在（新包）      ✗ 3600630828 基线中不存在（新包）
```

审计自述之外，另写脚本把**基线 107 行 vs 本次 117 行**按 path 全字段对拍（比 `--check` 自己比得更多）：
`drawnLayers / whiteFallback / transparentFallback / decodeFail / layerErrors` **5 项逐值全同**，
`particles.layers / particles.maxcount / skippedLayers / draws / issues 集合` 也**全同** ⇒ **107/107 零变化**；
且基线里 **0 个 path 从语料消失**。

**三选一定性 = 第三类「环境/语料变化」**（不是真回归，也不是"有意的行为变化"）：

| 判据 | 实测 |
|---|---|
| 既有包有没有被今天的改动弄丢层/粒子/矩形 | **没有**：107 包 5 项门禁字段 + 粒子字段 + issues 集合逐值未变 ⇒ P-103（粒子四项）/P-107（透视相机）/P-100（charfit）/P-91·92·94（分发/PWA/字体）对**既有语料**零影响 |
| 失败断言的语义 | `NEW` 只表示"这个 path 不在基线里"，**不比较任何数值** ⇒ 它不含退化信息 |
| 新包从哪来 | 10 个 id **全部**位于 `allwallpaper/0917/`（该目录 12 个子目录 mtime 全是 `2026-09-17 02:10`），而基线冻结于 `2026-09-16 06:36`（`generatedAt 2026-09-15T22:36:34Z`、107 行）⇒ 语料在基线之后增长 |
| 107 + 10 = 117 | 与本次扫描包数逐位吻合（无第三种来源） |

> 同目录另两个子目录**不**入扫描且是对的：`3314492008` 是**未打包**视频壁纸（mp4 + preview.gif + project.json），
> `884307090` 是**网页型**工程（index.html/js/video/webm）——两者都不是场景包容器（没有任何包文件入口），与 10 项 NEW 无关。
> 10 个新包里含 P-107 要的**语料首个非正交 3D 包 `3509243656`**（见 P-107 节）。

### P-108.1 为什么不能走 `EXPLAINED_BASE_DROPS`（代码判据）

`compareToBaseline` 对 NEW 是在查表**之前**就 `continue` 的（`tests/package-matrix.mjs:555`：
`if (!b) { diffs.push({ id, kind: 'NEW', … }); continue }`），而 `EXPLAINED_BASE_DROPS` 的四元组
`id+field+base+now` 对 NEW **无 base/now 可匹配**。语义上也对：新包**没有基线**，谈不上"下降"。
⇒ **NEW 没有豁免通路，把新包注册进基线是唯一正确的收口方式**（这正是本次的做法，见 P-108.4①）。

### P-108.2 交叉验证（独立手段，不只看一个测试的自述）

**① `particle-shape-audit`（P-103 的独立取证工具）重跑 + 与昨晚原始产物逐层对拍**（无一行不同）：

```bash
node tests/particle-shape-audit.mjs 3326873240 3327063360 3544152633 3554161528 3660962877 3719111841
PQUAD_MODE=legacy PROT_MODE=legacy PEXP_MODE=legacy PSPEED_MODE=legacy \
  node tests/particle-shape-audit.mjs 3326873240 3327063360 3544152633 3554161528 3660962877 3719111841
```

- **不变量成立**：25 个有粒子批的层 **25/25** quad 数两档逐值相同、**25/25** 存活粒子相同、
  **25/25** 像素指标（四角 alpha / 覆盖均值 alpha / 不透明占比）相同 ⇒ P-103 只动几何、不动数量与像素语义。
- **几何变化面**：长轴角散布变化 **6/25** 层（0°→11–166°，其中 5 层 ≥42°：166/51/46/44/42）；
  长轴角中位变化 **10/25**；竖直占比变化 **8/25**；任一几何指标变化 **13/25**。
- ⚠ **口径更正（就地改了 `docs/PARTICLE-RESEARCH.md` §4.3）**：该节原写"**11/25** 层角度散布由 0° 变为 44–166°"，
  复算两套产物（昨晚 `-on-official` / `-on-pquad=legacy…` 与本次重跑）都**不成立**：散布变化是 **6/25**，
  11 既不等于 6，也不等于角中位变化 10 或任一指标变化 13 ⇒ 已改为上面三个可复算的数（命令与产物路径同处给出）。
- **与门禁红的关系 = 无因果**：`--check` 的 5 项判据里**根本没有**粒子几何字段，且 107 个既有包的
  `particles.layers/maxcount` 与 `issues` 集合逐值未变。

**② CPU 预览出图（`tests/preview.mjs`，与 mock-GL 审计不同通路）**：

```bash
MPW_SCENE_ROOT=$MPW_ROOT/allwallpaper/0917 PROJ=auto node tests/preview.mjs 3509243656 /tmp/p107-auto.png 960 540
```

⇒ 出图（`drawn layers: 101`）但**画面近空白**（auto 档白底 + 底部一条黑线；ortho 档全黑）。
与 **P-107.6 第 2 条**自洽：该包 8 个模型 / 4 个粒子层**不走**透视四边形通路，CPU 预览可见内容以四边形/solid 层为主
（日志里 12 次整屏 `[solid 写入像素] 518400`）。⇒ 既**不能**据此判回归，也**没能**用它证实该包观感（列入 P-108.7）。

**③ 新包自身健康**：10/10 `decodeFail=0`、`layerErrors=0`、`whiteFallback=0`、`drawnLayers>0`；
5 个带 `TRANSPARENT_FALLBACK`（纯色/bloom/model 占位层，与既有 19 个包同类，非致命）。

### P-108.3 改了什么

① **基线登记（只追加，不改判据）**：`node tests/package-matrix.mjs --absorb-new --reason "…"` ⇒ 107 → **117** 行。
既有 107 行**逐字节保留**（校验：逐行 `JSON.stringify` 相等 **107/107**，`generatedAt` 也没动），
理由 + id 落进新增顶层字段 `absorbed[]`。**刻意不用 `--write-baseline`**：那会把既有 107 行连同
**在本机负载下测出的 timing** 一起重写（= P-75f 明确反对的"一把梭"，会掩盖其它真退化、并放宽 SLOW 阈值）。

② **新机制 `--absorb-new`**（`tests/package-matrix.mjs`，新增开关，不动 `--check`/默认/`--json`/`--pkg` 行为）：
全量扫描 → 既有 path **一律原样保留** → 任一既有包 5 项门禁退化**或**任一既有 path 从语料消失 ⇒ **拒绝写入 rc=2**（列出明细）
→ 新 path **逐条打印**（id + 层/可见/绘制/白块/透明/解码败/粒子/门禁）后追加 → `--reason` **必填**、与 `--json/--pkg` 互斥
（前置校验放在扫描前，不白烧 ~46s 重渲染）。

③ **真回归修复：`known.json` 白名单落点**。2026-09-16 目录收拢 `0d29bdd` 把 `known.json => tests/known.json`（`git mv`），
而脚本仍按**仓库根**找同名白名单文件 ⇒ 文件不存在、`loadKnown()` **静默**返回空表 ⇒ 白名单机制自那次收拢起**从未生效**
（`2aeac838640589c66efc315e821c44b6|SCENE` 的豁免一直没打出来）。正确落点是 `tests/known.json`；脚本改为
**`tests/` 优先 + 仓库根兜底**，
并在文件缺失/不可读时**显式告警**（不再静默）。实测：门禁汇总 ❌ **25 → 24 包**，并新增打印
`已豁免 1 项：· 2aeac838640589c66efc315e821c44b6 [SCENE] no scene.json（known: …）`。
**未**借此往 `known.json` 塞新豁免（那是 P-75f 反对的白名单式糊过去）。

④ 文档：`docs/TESTING.md`（2 处 107→117 包；基线段补 `--absorb-new` 用法与纪律）、`docs/SELFCHECK.md`（107→117 包）、
`docs/PARTICLE-RESEARCH.md` §4.3 口径更正（见 P-108.2①）。

### P-108.4 验收（复跑）

- `node tests/package-matrix.mjs --check` ⇒ **rc=0**，`✓ --check：与基线逐包比对无退化`（117 包；
  门禁汇总 24 包有未豁免异常 = `TRANSPARENT_FALLBACK` 类，按现有设计**不进退出码**，见 P-108.6）。
- **一致性**：`--absorb-new` 的扫描与随后 `--check` 的扫描，10 个新包的控制台行**逐字相同**
  （层/可见/绘制/白块/透明/解码败/粒子/门禁 9 列全等）。
- `bash tests/run-all-tests.sh` ⇒ **PASS=73 / FAIL=2 / SKIP=1 / 总 76 项**（跑前 `pgrep -f run-all-tests` 无并发门禁；
  06:22–06:26 那次）。**`package-matrix` 项 = PASS**；两条 FAIL = `docs-check` + `packaging`，失败原文是
  `✗ 代码有·文档无（漏写 2 个）: submesh, subtri` —— **并发线**（子网格探针 P-109）新增 `?submesh=` / `?subtri=`
  两档探针时尚未登记进 `docs/README-DIAGNOSTICS.md`，`packaging` 是它的内层 `--no-gate` 阶段连坐（同一根因，非两条独立红）。
  该线已于 06:29 补登记；06:30 复查又出现同类 4 项（`baseline`/`baselinedur`/`baselineswap`/`bgwrapfix`，属基线快照 / bgWrap 时序两条线）
  ⇒ 这是**并发线的登记时差**，与本节的改动**无因果**（修完当时 06:27 实测：`docs-check` 的**文件引用**判据 ✓、`P-编号健康` ✓；
  本节 6616–6747 行内逐行 grep `vendor-ref` / `dsh-mpkg-wallpaper` = **0 处**；`package-matrix` 项在那次全量里就是 PASS）。
  06:32 起另有**其它在飞线**引入的 7 处悬空引用（`vendor-ref/…` 6 处 + `dsh-mpkg-wallpaper/docs/…` 1 处），同样不在本节内。
  **未跑第二次全量**：并发线仍在写代码/文档，按资源纪律不在在飞编辑期间重跑；待各线收工后由协调线复跑收口（见 P-108.6 第 5 条）。
- 磁盘：跑前跑后 `/` 均 **81G 可用**（本次无残留增长）。

### P-108.5 回退

- **基线**：`cp /tmp/package-baseline.before-p108.json package-baseline.json`
  （本次跑前备份：md5 `951c99142c45a4fab6bff3e48ee2e708`、107 行）。
  ⚠ 基线**不在 git 里**（被 `.gitignore` 覆盖）⇒ 回退只能靠备份或 `--write-baseline` 重生成。
- **代码**：`git checkout -- tests/package-matrix.mjs`（本节只改这一个脚本；改前它与 HEAD 逐字一致）。
- 开关级回退：不传 `--absorb-new` 即回到原行为；`--check` 的判据、阈值（3.0×）、`EXPLAINED_BASE_DROPS` 表**一条没动**。

### P-108.6 未定项（不随本节关闭）

1. **`--check` 不报"基线里有、本次语料里没有"**：消失的包会**静默通过**。本次实测消失 0 项，故**没动判据**
   （改它会改变跨机语义：小语料机器会从绿变红）。要补需单开一轮。
2. **24 个包的 `TRANSPARENT_FALLBACK`**（缺纹理/纯色占位层的既有异常，P-34"白块→透明"的预期副作用）既不进退出码、
   也不在 `known.json` 里。是"该收紧成红"还是"该按 reason+date 登记进白名单"，属策略决定，留给用户/后续会话。
3. **`3509243656` 的观感对齐**仍是 P-107.6.2 的开放项（模型/粒子未接透视相机）；本次 CPU 预览近空白，
   **没有**独立证据证明该包画面正确（只证明了门禁字段干净）。
4. 本次**没有**重跑 `--write-baseline`，所以既有 107 行的 timing 基线仍是 2026-09-16 的值（更严：不会被本次负载放宽）。
5. **全量的收口数不是本节能单独给的**：06:22 那次全量 `PASS=73 FAIL=2 SKIP=1`，两条 FAIL 全属**并发线未登记的 diag 旗标**
   （先 `submesh`/`subtri`，后 `baseline`/`baselinedur`/`baselineswap`/`bgwrapfix`）。`package-matrix` 项**已 PASS**。
   要拿到"全绿"的全量数，需在**所有并发线收工后**再跑一次（本条不代跑：在飞编辑期间跑全量会互相踩，见 P-75g①）。

## P-109-BASELINE（2026-09-17 §5-⑨ 真机基线快照）采集器 + `/baseline` 落盘 + `baseline-diff` 回归闸门 —— "变慢了"以后有数据可查

> 编号说明：**P-109 已被并发线的 `?submesh=`/`?subtri=` 子网格探针取走**（见上一条"编号分配"记录），
> 本节取 **P-109-BASELINE**（与 `P-75b`/`P-100-R1` 同一套后缀写法）。`docs-check` 的编号健康检查只要求
> "完整 id 唯一 + 数字部分非降"，所以两节谁先写进本文件都不会让它变红。

### P-109-BASELINE.1 做了什么（交付物四件）

① **采集器（浏览器侧，默认关）**：`demo.html` 新增 `MPW-BASELINE-BEGIN/END` 段 + 新模块
`core/baseline-metrics.mjs`（纯函数内核：分位/滚动窗/启动/GL 代理计数/开关解析/三阶段流转/快照校验）。
开关三个，与既有 `?flag` 同形：`?baseline=1`（或 `?baseline=<秒>`）、`?baselinedur=<秒>`、`?baselineswap=<另一 id>`。
采：**FPS（500ms 滚动窗中位 + 1% low）**、**每帧耗时 ms 分位（p50/p95/p99/max/mean）**、
**启动耗时（导航→首帧→"纹理齐全/第 90 帧"）**、**层数/纹理数/活 FBO 数/活纹理数/draw 数/上传字节**、
**壁纸切换耗时（切过去 + 切回来各一次）**，并（同开 `?perf=1` 时）附**渲染主体耗时** `render.p50/p95`。

② **落盘端点**：`POST /baseline`（新端点）⇒ `reports/baselines/<epochms>.json`，返回
`{"ok":true,"schema":1,"file":"baselines/<ts>.json","bytes":N}`；残缺快照 **400 不落盘**，非 POST **405**。

③ **对照闸门**：`tools/baseline-diff.mjs` —— 两份快照逐指标差异表 + 阈值集中一处（`THRESHOLDS`）+
env 覆盖（`MPW_BASELINE_TH_*`）+ 退出码 **0/1/2**。

④ **文档与登记**：新建 `docs/BASELINE.md`（指标定义/VRAM 代理局限/真机跑法/解读与设阈值）；
`README.md` 加一行指向它；`docs/README-DIAGNOSTICS.md` 主表加 `baseline`/`baselinedur`/`baselineswap` 三行；
`docs/DATA-LIMITS.md` 加第 9 行（`reports/baselines/` 上限 200 份 / 32MB + 三条日志格式）。

### P-109-BASELINE.2 为什么这样选（三条都要能说清）

**① 为什么另开 `/baseline` 而不是复用 `/report`**（任务书要求二选一 + 说明理由）：
`/report` 落 `reports/r<ts>.json` 且受"60 份 + 64MB **最旧先删**"滚动 —— 而基线是**趋势数据**，
恰恰要留得住（今天的快照不能被明天的报告挤掉）；且载荷语义不同（`kind:'baseline'` 的 FPS/分位/启动/代理
vs `r*.json` 的逐层对账），混进去会让 `report-audit`/`parity-check` 那套消费端读到不认识的结构。
**不另造一套**的部分照旧复用：同一条 POST + JSON 通路、同一套 `mkdirSyncSafe` + `pruneDirToLimits` 上限机制、
同一个 `MPW_REPORTS_DIR` 根、同一个 CORS/预检处理、同一个"写入前后各清一次"的纪律。

**② 为什么"帧间隔分位"和"渲染主体耗时"分开两个字段**：rAF 时间戳之差是**帧间隔**（受 vsync/合成节流，
60Hz 上限下恒 ≈16.7ms），把它当"渲染开销"会得出错误结论；真正的渲染主体耗时只在 `?perf=1` 时才有
（bundle 的 `stats` 钩子）。未开 `?perf` 时 `render.*` 一律 `null` + `available:false` + 一行口径 note，
**不编造**。

**③ VRAM 只给代理（诚实说明写进文档、也写进每份快照的 `vramProxy.note`）**：浏览器**拿不到**真实显存
（WebGL 无此 API）⇒ 只给 `Σ(活纹理 level-0 的 w×h×bpp)`（**含 FBO 附件纹理**、漏 mip/驱动对齐，
认不出的格式按 4 计并记 `unknownFormats`）+ `performance.memory` 的 **JS 堆**（**不是显存**，
Firefox/Safari 为 `null`）+ 活 FBO/活纹理**个数**（真计数）。字段名一律 `*Est`/`*Proxy`，
**永不**命名为"显存实测值"。

### P-109-BASELINE.3 口径（唯一实现处 `core/baseline-metrics.mjs`，测试逐值钉死）

- **最近秩分位** `idx = ceil(q×n)−1`（不插值；偶数样本 `q=0.5` 取**下中位**）——"中位"与"p50"同一函数。
- **1% low** = `1000 / mean(最慢 max(1, ceil(n×0.01)) 帧)`。
- **滚动窗 FPS**：只统计**完整覆盖**的 500ms 窗；总时长不足一窗时给一个 `partial:true` 的窗（超短采集也有数）。
- **就绪判据**：纹理齐全（每 250ms 探一次）**或**第 90 帧，谁先到算谁（`readyReason` = `tex-complete`/`frame-target`/`timeout`）；
  `frame-target` 档的 `readyFrame` 精确 = 90，`tex-complete` 档是探测时刻的近似值（时间同样是上界）。
- **切换测量 = 整页导航口径**（本渲染器没有 `?id=` 热切换路径）：三段导航 + `sessionStorage` 交接，
  指标取首段，`switch.swapTo/swapBack.ms` 各取那一段的 `startup.totalMs`；`sessionStorage` 不可用 ⇒
  自动跳过并打日志；`?baselineswap=<当前包>` 识别为自我导航 ⇒ 按单段处理（**防死循环**）。
- **实测地板 = `min(配置地板, |基线|)`**：配置地板是"这点抖动不算数"，但它绝不能大于基线本身 ——
  否则小量纲指标（例如纹理估算只有 2KB 的场景）会被地板整段吞掉（+877% 也判"噪声内"）。
  这条是**写测试时被自己的断言抓出来的**（T5a 一开始红）。

### P-109-BASELINE.4 验收（可复跑）

```bash
bash tests/run-all-tests.sh --only baseline          # 门禁项名 baseline（新增，追加在 add 列表末尾）
node tests/diag-flag-check.mjs                       # 代码 134 个开关 == README 主表 134 行，0 差异
node tests/docs-check.mjs                            # rc=0
node tests/demo-syntax-check.mjs                     # demo.html 8/8 内联脚本语法通过
```

`tests/baseline-test.mjs`（5 组）关键断言：

- **T1** 分位/中位/1% low/滚动窗逐值钉死（含"不修改入参顺序""空输入 → null 不冒充 0"）；
- **T2** 合成时间戳跑采样器 ⇒ 快照必填字段/类型/就绪三档（纹理齐全 / 第 90 帧 / 超时）逐项验，`mpwValidateSnapshot` 拒绝残缺；
- **T3** 假 gl 上验代理计数（活 FBO/纹理、Σw×h×bpp、重传不重复计活字节、删除回落、**幂等**、无 gl 不炸）；
- **T4** 开关解析（默认关真值表 / 非法值 → 关 + note / 时长钳制 / swap id 过滤）+ 三阶段流转四档 + 合并取首段；
- **T5** `baseline-diff` 纯判据 + CLI 退出码 `0/1/2` + env 覆盖（含"非法 env 忽略 ≠ 关掉闸门"）
  + **真子进程服务**：合法 200 + 落盘、残缺 400、坏 JSON 400、GET 405、灌 6 份（上限 3）只留 3 份、
  `/baseline-metrics.mjs` 静态路由 200、启动日志播报上限；
  + **默认关时零行为变化**：把 `demo.html` 的采集块**真源码切出来**、用桩 DOM/桩 gl 跑 ——
    不开参数 ⇒ `MPW_BASELINE === null`、**GL 未被包装**、零日志/零请求/零徽标；
    开了 ⇒ 真跑到点并把快照 POST 出去（快照通过校验、代理计数来自真 gl、页面出摘要徽标）；
    回传失败 ⇒ 日志与红色徽标都指向 `window.__mpwBaselineSnapshot`（手工兜底）。

本机（**无 GPU / 无 WebGL2**）跑前后 `df -h` 均 **81G 可用**（无残留增长）。

### P-109-BASELINE.5 回退

- 代码：`git checkout -- demo.html core/baseline-metrics.mjs tools/baseline-diff.mjs server/we-scene-demo-server.mjs`
  （新文件直接删；`demo.html` 只有"import 一行 + 采集块 + 帧循环一行"三处增量）。
- 行为开关级回退：**不写 `?baseline`** ⇒ 采集器完全不装载（默认关）；`?baseline=0`/非法值同样关。
- 服务端回退：删掉 `/baseline` 路由即回到改动前（`reports/baselines/` 目录留着不参与任何既有滚动策略）。

### P-109-BASELINE.6 未定项（不随本节关闭）

1. **真实 VRAM 仍然拿不到**（只能代理，见 .2③）；要更准只有厂商扩展或换平台，不在本仓库范围。
2. **趋势图/多份汇总脚本未做**：现在只有"两份对比"；`reports/baselines/*.json` 是稳定 schema，随时可加。
3. **多实例（`?ids=`）只测 primary 实例**（其余格子的帧不进快照）。
4. **切换测量是整页导航口径**，不是热切换；将来若加了热切换需另定字段，不能与现在的数字混在一列比。
5. **本机不产出任何真机数字**：门禁只验工具链；真实基线必须由用户按 `docs/BASELINE.md` §3 在真机上跑。
6. 并发线（`submesh`/`bgwrapfix`）在飞期间的**全量门禁**没有代跑：本节只跑相关项（`--only baseline
   diag-flags docs-check demo-syntax data-limits`）。全绿的全量数需等所有并发线收工后再跑。

## P-109（2026-09-17 任务书 P1-4 · `UNTOUCHED-AREAS` D 项）子网格隔离探针 `?submesh=` / `?subtri=`：把 hina 面部"眉毛/眼睛到底是哪几根骨、哪几个顶点"钉死 —— 并顺带用它的台账拿住「眉毛翻转」的**候选根因（数值）**

> **编号说明**：`## P-108` 已归 `package-matrix` 线、`## P-109-BASELINE` 归基线采集线（后缀形式，见 P-100-R1 先例），
> 本节用 **`## P-109`**（完整 id 唯一；数字部分 109 ≥ 前一条 109，不回退 ⇒ `docs-check` 的"非降"规则满足）。

### P-109.0 工具语义（`core/we-scene-bundle.js`，**只读探针**）

- **`?submesh=<骨筛选>`**（默认关）：按 `blendIndices` 把顶点按**主影响骨**分组（主影响骨 = 4 个 `blendWeights`
  里最大的那根、并列取小下标；权重全零退回 `blendIndices[0]`），**只画"选中骨组"的顶点/三角形**，其余跳过。
  筛选语法（逗号分隔）：`24`（单骨）/ `24-27`（闭区间）/ `24*`、`24-27*`（该骨 + `mesh.bones[].parent`
  父链下的**所有后代**）；`all` = **只出台账、绘制逐位不变**；`off`/`0`/`none`/空 = 关。
- **`?subtri=all|major|any`**（默认 `all`）：三角形的三个顶点主骨不同组时算谁的 —— `all` = 三顶点同组（严格）、
  `major` = ≥2 个、`any` = ≥1 个（边界三角形；同一三角形可被多组计入）。**台账里三种条数始终都给**。
- **台账** `globalThis.__mpwSubMesh`：每组 顶点数 / bbox / 质心（bind 网格空间）+ **影响该组的骨表**（骨号/权重和/
  顶点数）+ 主骨**父链** + `tri.{all,major,any}` + **蒙皮后**的位移时程 `hist:[[t,dx,dy]…]`（相对首帧，skin 空间；
  世界设计像素 = `origin + scale⊙skin`）+ **翻转计数**（本组三角形**有向面积变号**条数 —— "眉毛翻转"的机器可判形式）
  + `disp`（会话累计最大位移与时刻）；每 ~2s 往 `#log` 打一行摘要（进设备上报）。与 `?bones=` **可叠加**（两个全局互不覆盖）。
- **两条硬纪律**：① 默认关 ⇒ 不写字段、不建分组表、**不改 `drawElements` 实参**（见 P-109.5 的反向变异对拍）；
  ② 选中集合为空（骨号不存在/越界）⇒ **一个 draw 都不发**，绝不退回全量（否则"按不存在的骨号筛选"会画出整个网格）。
- 实现位置：`core/we-scene-bundle.js:6361`（常量/语义注释）、`:6453`（绘制接线）、`:7382`（探针实现）；
  取证工具 `tests/submesh-evidence.mjs`（浏览器通路 + Node 探针通路）；测试 `tests/submesh-probe-test.mjs`。

### P-109.1 证据一：hina 3554161528 面部 = 哪几组顶点 + 哪几根骨（`reports/submesh-3554161528/ledger-all.json`）

`models/人物_puppet.mdl`：**497 顶点 / 32 骨 / 741 三角形 / 3 条动画**；按主影响骨分成 **29 组**（顶点数求和 = 497）。
面部簇（世界设计像素 x∈[1818,1890]、y∈[780,842]，与贴图 UV 一一对应，见 `reports/submesh-3554161528/viz-face-uv-groups.png`）：

| 组（主影响骨） | 顶点 | bind bbox（网格单位） | 质心 | 骨父链 | 权重来源（骨:权重和） | 严格归属三角形 | **画的是贴图上哪一块**（UV 裁剪判定） |
|---|---|---|---|---|---|---|---|
| **b16** | 22 | [−346.9,−228.3,−312.2,−191.6] | (−332.2,−212.5) | 15←4←3←0 | 16:18.99, 30:3.01 | 17 | **眼睛本体**（含紫色虹膜的整块眼形） |
| **b17** | 11 | [−367.6,−208.7,−335.5,−186.1] | (−347.6,−196.4) | 15←4←3←0 | 17:7.33, 18:2.14, 19:1.52, 1:0.01 | 8 | **眉毛**（眼角上方那条细斜线） |
| **b18** | 15 | [−364.7,−222.6,−341.6,−201.2] | (−355.1,−213.1) | 17←15←4←3←0 | 18:12.64, 17:2.24, 19:0.09, 1:0.03 | 16 | **睫毛 / 上眼睑线**（眼左侧的深色弧线） |
| **b19** | 12 | [−331.9,−205.1,−310.7,−185.4] | (−320.0,−194.4) | 17←15←4←3←0 | 19:11.08, 17:0.91, 18:0.01 | 14 | **外眼角睫毛**（眼右侧的深色小簇） |
| **b30** | 18 | [−335.7,−214.8,−320.4,−200.2] | (−328.6,−207.8) | 16←15←4←3←0 | 30:14.96, 16:3.04 | 23 | **瞳孔 / 虹膜高光**（b16 的子骨，压在眼中央的紫色块） |

判读链条（两步互相独立）：① 面部 5 组的 **UV 包围盒**落在 `materials/人物.tex` 同一小块（u≈0.60–0.65、
v≈0.33–0.37）上，把该块贴图放大 6 倍后逐组套框（`reports/submesh-3554161528/viz-face-uv-groups.png`）—— 眼睛/眉毛/睫毛/瞳孔四类特征
与 5 个组的对应关系**肉眼可判**；② 这 5 组在同一坐标系下的**空间排布**（`reports/submesh-3554161528/viz-face-groups-time.png` 的 t=0 格）
与贴图位置一致（b16 眼 + b30 瞳孔居中、b18/b19 分列左右、b17 在上）。⇒ 结论：**眉毛 = b17（11 顶点，骨 17）**，
**眼 = b16（22 顶点，骨 16）+ b30（18 顶点，骨 30）**，**睫毛/眼睑 = b18（15 顶点，骨 18）+ b19（12 顶点，骨 19）**；
"眼睛/眉毛没有独立层"的数据事实（D 项原判）由此**在骨/顶点粒度上补齐**。

### P-109.2 证据二：这些组在时间上到底动了多少、有没有"翻转"（**当前渲染口径**，t=0→9s、1/30s 步长、271 帧）

`?submesh=all` 台账（`reports/submesh-3554161528/ledger-all.json`，gBones 由 demo 同款 `updateSkinBones` 管线给出；位移是**蒙皮后组质心**位移）：

| 组 | 最大位移（skin/设计像素 1:1） | 出现时刻 | 组内三角形**有向面积变号**最多 | 出现时刻 |
|---|---|---|---|---|
| **b18** 睫毛/上眼睑线 | **102.07 px**（dx=+90.76, dy=+46.69） | **8.50 s** | **14 / 16** | **0.40 s** |
| **b17** 眉毛 | 27.5 px | 8.53 s | **8 / 8（整组全翻）** | **0.33 s** |
| **b19** 外眼角睫毛 | 55.66 px | 0.47 s | 6 / 14 | 0.23 s |
| **b16** 眼 | 13.6 px | 3.70 s | 12 / 17 | 0.87 s |
| **b30** 瞳孔 | 16.1 px | 3.70 s | 15 / 23 | 6.13 s |

- **周期性**：0.10–0.87 s 一次、**8.10–8.87 s 原样再来一次** ⇒ 周期 **8.0 s = 动画 2 的 240 帧 / 30fps**（三条
  additive 层里只有它这么长）。逐帧可见"眼皮+眉毛整片往上飞出去再收回来"（`reports/submesh-3554161528/viz-face-groups-time.png` 的
  t=0.233/0.4/0.6/8.5 四格，红 = 变号三角形；t=1.0/2.5/6.0 正常）。
- **不是"退化塌陷"而是真的翻过去**：b18 组做最小二乘仿射拟合，其行列式由 bind 的 **+1.000** 变成 **−1.567**
  （t=0.50 s）—— 面积符号翻转 = 该片被**镜像/内外翻转**；而骨 18 自己的位姿矩阵 det **恒 +1.000**（骨没镜像）
  ⇒ 翻转来自**组内多骨权重**（18 占 12.64、17 占 2.24、19 占 0.09）在骨 18 大幅位移时的内部剪切。
- **位移量级**：t=0.5 s 时骨 18 的蒙皮矩阵平移 = **(144.9, −69.5) px**，而 b18 那片几何自身只有 23×21 单位大
  ⇒ "睫毛条"被搬走 **4 个眼宽**；同一时刻组质心位移 84.4 px。

### P-109.3 候选根因（数值）：**bind 世界链的乘法顺序**与动画链相反 ⇒ 合成基准与增量不在同一空间

用探针台账追到骨一级后，把两条"局部→世界"链放在一起对拍（`core/attach-transform.mjs` 与
`elysia/we-renderer/puppet.js` 的 `_matMulRow` 逐字相同，故两条链都可复算）：

| 口径 | 公式 | 与 `sampleAnimRT(帧0)` 的最大差 | 全 32 骨"骨位置 ↔ 自己顶点质心"距离 |
|---|---|---|---|
| **现渲染器/demo**（`bindWorld[b] = matMulRow(bindWorld[parent], bind[b])`） | 父先乘 | **340.76 px**（骨 b30） | 平均 **122.1 px** / 最大 341.7 px |
| **一致序**（`bindWorld[b] = matMulRow(bind[b], bindWorld[parent])`） | 子先乘 | **0.0000 px / 0.00000 rad**（32 骨全中） | 平均 **47.3 px** / 最大 208.5 px |

- **判据为什么成立**：MDLA 每条动画的**帧 0 逐骨局部量 == `bind` 局部量**（实测 b0/b1/b3/b4/b15/b16/b17/b18/b19/b30
  逐位相同），所以"链 bind"与"链动画帧 0"**必须**给出同一个世界姿势 —— 只有"子先乘"这一序做到（32 骨 maxΔ=0），
  父先乘差到 341 px。再叠加"骨应落在它自己顶点附近"的几何常识（122 px vs 47 px），**父先乘这一序可判为错**。
- **为什么以前看不出来**：`bindRT`（合成基准）与 `bindInv`（`gBones` 的逆绑定）都由同一条（错序）链导出，
  而 `t=0` 时"增量=0"⇒ `gBones = bindInv × bindRT = I` ⇒ **静止帧逐位正确**（所以标定/截图一直对得上）；
  一旦动画走动，`final = bindRT + Σ(p_k(t) − p_k(0))` 把**错序空间的基准**与 **`sampleAnimRT`（正确序空间）的增量**
  相加 ⇒ 骨被搬到几百像素外（表 P-109.2 的一切现象）。
- **换成一致序会怎样**（同一份数据、同一套合成规则，只换 bind 链顺序）：

| | 眉毛 b17 最大变号 | 睫毛 b18 最大位移 | b18 最大变号 | 29 组平均最大位移 |
|---|---|---|---|---|
| 现口径 | **8 / 8** @0.33 s | **102.1 px** @8.50 s | **14 / 16** @0.40 s | 14.48 px |
| 一致序 | **0 / 8** | **11.1 px**（↓89%） | 4 / 16 | **8.07 px**（↓44%） |

⇒ **"眉毛整组翻转 + 睫毛飞出 102px"在一致序下消失/大幅收敛**；这不是调参，是"把基准与增量放回同一空间"。
残余变号（一致序下 b16 8/17、b30 8/23、b18 4/16）**未定**（见 P-109.6）。

- ⚠ **本轮不改渲染器**：`bindWorld` 的链序属 `UNTOUCHED-AREAS` **A 项（多 additive 合成/蒙皮矩阵）**，
  改一处影响**全部**蒙皮角色（语料 6 包里 5 个有 puppet）⇒ 本轮只交付**探针 + 数值证据**，
  修复另开一条线并按 A 项要求做全语料回归（P-109.6 第 1 条）。

### P-109.4 与官方的对照（能拿到什么、拿到多少）

- **官方静态** `Testphoto/TP11/W1.jpg`（2009×1135，官方 WE 渲染）：面部裁剪（放大 4×）显示**眼形完整、眉毛在眼上方、
  无折叠/镜像痕迹** —— 该帧相位未知，但至少说明"官方存在正常帧"，与"翻转只在特定 0.8s 窗口内发生"不冲突。
- **官方动图**（Steam 工坊目录 `431960/3554161528/` 下的预览动图）：**192×192 / 50 帧 / 40ms**，整幅缩到 1/20 ⇒ 眼宽 ≈ **1.7 px**、
  眉毛 **< 1 px** ⇒ **像素级判读不可能**（这正是任务书"别指望像素级"的那条）。改做**可判据的粗对照**：
  取头部区域暗像素（lum<70）重心逐帧跟踪（灵敏度 ≈0.5 px）：我们探针标出的**事件窗口 t=0.08–0.88 s**
  重心 x 跨度 **0.65 px** / y 跨度 **0.63 px**，对照窗口 t=0.96–1.76 s 为 **0.46 / 0.50 px** —— 若官方也有
  我们口径下的 102 px 位移（= **5.1 GIF px**），这里应当看到同量级跳变；实测没有 ⇒ **官方动图不支持"该位移是作者本意"**，
  与 P-109.3"这是我们的口径产物"一致（**不能**据此判官方逐帧语义，只是"没看到反证"）。
- **本机拿不到"我们的像素"**：无头 Firefox 建不了 WebGL（`AllowWebgl2:false restricts context creation on this system`
  / `tryNativeGL / Exhausted GL driver options (FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS)`；无 `/dev/dri`）；
  Chromium+SwiftShader 在本机 PRoot 下 `newPage` 挂起（`tests/headless-shot.mjs` 的档位表早已记）。
  ⇒ 本轮"我们的渲染"全部走 **mock-GL 驱动真实 `renderMeshLayer`**（同一条被 `?submesh=` 接管的路径）+ 真实
  MDL/贴图/动画，出图用**软栅格化**（`viz-*.png`），**不冒充 GPU 截图**。

### P-109.5 登记与验收（本轮实测）

- `docs/README-DIAGNOSTICS.md` 主表新增 **`submesh`** / **`subtri`** 两行（表头计数 126 → **134**，与抓取一致）。
- `tests/submesh-probe-test.mjs` ⇒ **56 通过 / 0 失败**，5 组断言：
  ① **默认关逐位不变**：把**当前源码反向变异**成"删掉探针块 + 还原旧绘制尾巴"的临时模块，跑同一帧 ⇒
     GL 调用序列**逐条相同**（20 条）、绘制实参 == 冻结旧写法 `[TRIANGLES, 2223, UNSIGNED_SHORT, 0]`、
     不多建 VAO、默认路径不建过滤 EBO、不写 `__mpwSubMesh`；`?submesh=all` 的调用序列与默认档亦逐条相同；
     （源标记缺失/绘制接线被改写 ⇒ 该测试**必红** —— 这就是"改回旧写法要能红"的机器化形式）
  ② **分组正确性**：台账 vs **独立复算**（`attach-transform.parseMdl` 自己再算一遍）逐字段一致（组数 29、顶点和 497、
     bbox、质心、影响骨表（骨号/权重和/顶点数/排序）、父链）；**区分力对照**：用 `blendIndices[0]` 分组只得 13 组、
     116/497 顶点归属不同 ⇒ 断言不是恒真；
  ③ **筛选语义**：`16` / `17-19` / `24*` / `16-19,30` × `all|major|any` 共 12 组，**实绘索引集**（mock GL 记录
     `bufferData(ELEMENT_ARRAY_BUFFER)` 内容）与独立期望**逐位一致**；`24*` 必须选中 {25,26,27}（父链）；
     `24`（骨 24 无顶点）与 `99`（越界）⇒ **0 次 draw**、`missing` 记账、不崩；
  ④ **台账字段**：质心落 bbox 内、`hist` 按时间递增、`disp.mag ≥ hist` 最大、summary 计数、与 `?bones=` 叠加互不覆盖；
  ⑤ **口径自证**：姿态=bind（gBones=I）⇒ 位移恒 0、变号恒 0、`world == origin + scale⊙skin`（逐位对拍）。
- 取证脚本 `tests/submesh-evidence.mjs`（浏览器通路 + Node 探针通路）+ 产出 `reports/submesh-3554161528/`：
  `reports/submesh-3554161528/ledger-all.json`（271 帧会话台账）、`reports/submesh-3554161528/ledger-<规格>.json` ×6、`reports/submesh-3554161528/render.json`（10 个时间点的蒙皮顶点/三角形/UV）、
  `reports/submesh-3554161528/tex-人物.png`（1405×2013 真实贴图）、`reports/submesh-3554161528/viz-face-uv-groups.png` / `reports/submesh-3554161528/viz-face-groups-time.png` /
  `reports/submesh-3554161528/viz-uv-sheet-all-groups.png` / `reports/submesh-3554161528/viz-body-t0.png`、`log.txt`。
- `node tests/diag-flag-check.mjs`：代码侧 **134** 个开关；**本节两个开关 0 差异**（当时文档侧尚缺
  `baseline`/`baselinedur`/`baselineswap`/`bgwrapfix` 四个 —— 属 `P-109-BASELINE` 那条线，
  故 `docs-check` 的 rc 由那条线决定，见本轮汇报）。
- `bash tests/run-all-tests.sh --only submesh-probe …`（定向子集，**未跑全量**）：见本轮汇报；新增项
  `submesh-probe` 注册在 `tests/run-all-tests.sh` 的 `add` 列表**末尾**（既有行未动）。

### P-109.6 未定项（不随本节关闭）

1. **渲染器未改**：P-109.3 的链序候选根因只出证据；修它要按 `UNTOUCHED-AREAS` **A 项**的口径，
   对 5 个蒙皮包（hina/凯尔希/GirlCat/白子/…）做"改前改后"逐层对照，且要同时定 `gBones` 的组装顺序
   （demo 是 `bindInv × m`，`elysia/we-renderer/puppet.js` 是 `m × bindInv` —— 两者不可能都对）。
2. **残余变号未定**：一致序下 b16 8/17、b30 8/23、b18 4/16 仍会变号（时刻与现口径不同），可能是强蒙皮固有形变、
   也可能是 additive 参考姿势（`帧0` vs `bind`）口径问题 ⇒ 需要"哪一帧哪根骨的数值"继续钉（探针已具备）。
3. **官方像素级对照仍缺**：本机两侧都拿不到 GL（P-109.4）；要定案需有 GPU 的机器或用户在真机上截同一相位的图。
4. **B/C 项未动**：权重表本身（B）本轮只证"分组自洽 + 每组权重和/影响骨表可复算"，**没有**上游 ground truth；
   `MDLE0002`（C）仍未参与任何计算。
5. `?submesh=` 只对**蒙皮层**（`renderMeshLayer`）生效：四边形/粒子层没有"子网格"概念（也不该有）。

## P-110（2026-09-17 任务书第 1 项 · `UNTOUCHED-AREAS` A 项）puppet 蒙皮的 **bind 世界链乘法顺序**修正：`W[b] = L_b × W[parent]`（子先乘）—— "眉毛整组翻转 180°"的数值根因结案

> **编号说明**：`## P-109`（`?submesh=` 子网格探针）与 `## P-109-BASELINE`（真机基线快照）已占用，
> 本节顺延取 **`## P-110`**（数字部分 110 ≥ 前一条 109 ⇒ 顺序非降规则满足）。
> 上游：P-109.3 只把链序写成"候选根因（数值，未动手）"，P-109.6 第 1/2 条把"改渲染器 + 定 `gBones` 顺序 + 全语料回归"
> 列为未定项 —— **本节就是把这两条收口**。

### P-110.0 根因（一句话 + 数值）

蒙皮要成立必须满足：**bind 世界链与动画世界链在同一空间**。
- 动画链 `core/attach-transform.mjs::sampleAnimRT`（elysia 移植）= **子先乘**：子骨局部位姿 `(px,py,rotZ)` 的平移被
  **父骨角度旋转**后加到父骨世界上（`tx = parent.tx + px·cos(pa) − py·sin(pa)`）⇒ 局部量按"**父坐标系**"解释。
- P-110 之前的 bind 链（4 处各写一遍：`core/attach-transform.mjs::puppetBoneFinal`、
  `core/we-scene-bundle.js` 的 `?bones=` 探针、`demo.html` 的 `updateSkinBones` 预计算、以及镜像它的若干测试）
  = **父先乘** `W[b] = W[parent] × L_b` ⇒ 把局部量当"世界坐标里绕原点后置"，**不是同一空间**。

判据（不猜）：MDLA 动画**帧 0 的逐骨局部量 == `bones[b].bind`**（hina 32 骨实测逐位相同；`elysia/we-renderer/puppet.js:92`
的原注释也写着这条），所以"链 bind"与"链动画帧 0"**必须**给出同一世界姿势。实测（`tests/bind-order-test.mjs` TN1，全语料）：

| 包（puppet 层） | 父先乘（旧）与"帧0==bind"动画的最大差 | 子先乘（修正） | 与动画链递推式独立复算的差 |
|---|---|---|---|
| hina 3554161528（人物 32 骨） | **340.76 px** | **0.000 px** | 旧 340.76 → 新 5.2e-6 px |
| 凯尔希 3719111841（眼睛组合 14 骨） | **391.90 px** | **0.000 px** | 旧 391.90 → 新 3.0e-5 px |
| 0917·3233141951（朱鹤 9 骨 / 全 6 层） | 60.73 px | **0.000 px** | 旧 60.73 → 新 2.3e-6 px |
| 0917·3462491575（耳朵 5 骨 / 全 6 层） | 14.00 px | **0.000 px** | 旧 14.00 → 新 1.6e-6 px |
| girl 3544152633（girl 13 骨） | 0.00 px（**该 rig 的两种序逐位等价**：bind 姿态无父级旋转） | 0.00 px | 0 → 0 |

**为什么以前一直没被发现**：`bindInv`（逆绑定）与 `bindRT`（additive 合成的基准）都由**同一条错序链**导出，
而 t=0 时"增量=0"⇒ `gBones = bindInv × bindRT = I`（**静止帧逐位正确**，标定/截图全对得上）；
一旦动画走动，`final = bindRT + Σ(p_k(t) − p_k(0))` 就把**错序空间的基准**与**正确序空间的增量**相加
⇒ 骨被搬到几百像素外（P-109.2 的整组翻转/位移）。**"只换一处"也不行**：半修（`bindInv` 用修正序、`bindRT` 仍旧序）
实测 b17 仍 2/8 —— 两处必须同源（见 P-110.4）。

### P-110.1 `gBones` 组装顺序的判据（任务书第 1 项"不许猜"）

结论：**`g_Bones[b] = bindInv[b] × W_anim[b]`（行主序，`bindInv` 先乘）**。判据分两层，缺一不可：

1. **静止帧恒等式不能判序**（所以 P-109.3 只到这里不够）：姿态 =bind 时 `bindInv × m = m × bindInv = I`
   （互为逆阵）⇒ 两种顺序**都**满足"静止帧必须等于 bind 姿态"。实测：旧序/新序在同一 rig 上
   `max|g − I|` 分别为 5.37e-5 / 5.29e-5（差异只是极坐标 `(angle,tx,ty)` 往返舍入），蒙皮后顶点与原始顶点差
   **7.10e-3 px（两序完全相同）**。
2. **能判序的是"绕骨骼枢轴的刚性旋转"**（row-vector 语义）：顶点 v 的绑定位姿在骨 b 下的局部坐标 = `v × bindInv[b]`，
   再乘当前世界位姿回到模型空间 ⇒ 对该骨主导（w≈1）的顶点必有 `|v − P_bind| == |v′ − P_anim|`
   （P = 各自的世界平移）。实测：`bindInv × m` 误差 **2.6e-5 px（刚性 ✓）**；`m × bindInv` 最大偏 **2.12 px**、
   最远把顶点甩到离枢轴 **490.29 px** 处（✗）。合成算例同结论（保距误差 0 vs 实测距 179.23 vs 应 33.54）。
   语义上也一致：官方着色器是 `position' = position × Σ w·g_Bones`，标准 LBS 是 `v_bind × bindInv × W_anim`。
3. **两侧实现的对账**：`demo.html` 生产路径从 P-42 起就是 `bindInv × m`；**elysia 移植侧
   `elysia/we-renderer/puppet.js:174` 是 `m × bindInv`**（上游 main 的同类缺陷；elysia 注释自述"main 错、dev 修"）
   ⇒ 那个顺序被判为**错**，本轮**只读不改** elysia（它是 MIT 移植参考件；`?mode=elysia` A/B 通路，见 P-110.6）。

### P-110.2 改了什么（4 处源码 + 3 处测试/登记）

| 位置 | 改动 |
|---|---|
| `core/puppet-skin.js:93` | 新增 **`bindWorldChain(bones, opts)`**：bind 世界链的**唯一实现处**（缺省子先乘；`opts.legacy`/`'legacy'` ⇒ 父先乘）、`bindWorldPolar(worlds)`、`bindOrderLegacy(search)`（`?bindorder=legacy` 的唯一判定式）。文件头把 `g_Bones` 的公式改写成 `bindInv × Rz(finalWorld)` 并写上 P-110.1 的判据 |
| `core/attach-transform.mjs:23,296-297,394,451` | `puppetBoneFinal` 改走 `bindWorldChain(bones, { legacy: opts.bindOrder === 'legacy' })`；`buildAttachOffsets` 把 `opts.bindOrder` 下传给 `attachmentOffset`（附件锚点与 gBones 必须同链序） |
| `core/we-scene-bundle.js:6-7,995,6372,7722` | 转发导出 `bindWorldChain/bindWorldPolar/bindOrderLegacy`（宿主与测试共用一份）；`parseScene` 的 `attachCtx.bindOrder` 下传；新增 `?bindorder=legacy` 解析（`BIND_ORDER_LEGACY`，与既有 `?parspace=legacy` 同形）；`?bones=` 探针的 `bindWorld` 改走同一实现处 |
| `demo.html:1678,2214,2621` | `BIND_ORDER_LEGACY` 一次解析、**一个开关同时作用于两处**：① 蒙皮 `bindWorld/bindInv/bindRT`（`lib.bindWorldChain`）；② `parseScene` 的附件锚点 `attachCtx.bindOrder` |
| `tests/bind-order-test.mjs`（新，629 行） | TN1 链序恒等式（组成律 + 数据）/ TN2 静止帧逐位 / TN3 `gBones` 顺序判据 / TN4 全语料回归 + 残余变号定性 / TN5 回退开关 / TN6 反向变异必红；**76 断言** |
| `tests/submesh-probe-test.mjs:394-399`、`tests/submesh-evidence.mjs:139` | 这两处原先各自写了一遍**父先乘**（等于让探针量"改前的口径"）⇒ 改走 `lib.bindWorldChain`，与渲染器逐位同源 |
| `tests/projection-y-test.mjs:370`、`tests/p76-parallax-eye-test.mjs:408` | 同理（这两项**会**与 `?bones=` 探针的反解对拍 ⇒ 不换就红）：改走 `lib.bindWorldChain`；改后 projection-y **49/0**、p76-parallax-eye **111/0** |
| `tests/run-all-tests.sh:223` | 新项 `bind-order` **追加在 `add` 列表末尾**（既有行未动） |

### P-110.3 全语料回归（改前 legacy ↔ 改后 default；mock-GL 驱动真 `renderMeshLayer`）

5 个**有 puppet** 的包 + 1 个对照包。⚠ 任务书把 **伊蕾娜 3660962877** 列为"蒙皮包"，但它实测
**0 个 puppet 层**（127 个对象 / 5 个 models json，`"puppet"` 命中数 = 0）⇒ 作"无蒙皮对照"，
其 127 层矩形/几何改前改后**逐位不变**（`tests/bind-order-test.mjs --report`）。

| 包 | 层 | 骨/顶点/三角 | 组数 | 网格 bbox | 层矩形 同/异 | 最大位移 旧→新 | 组均位移 旧→新 | 变号三角 旧→新 |
|---|---|---|---|---|---|---|---|---|
| hina 3554161528 | 人物 | 32/497/741 | 29 | [-506.33,-983.18,451.20,223.62] | **37/0**（逐位不变） | **b18 102.07 → b12 24.59 px** | **13.64 → 7.59 px** | **25 → 1** |
| girl 3544152633 | girl | 13/438/758 | 13 | [-510,-481,508,480] | 70/0 | b3 103.92 → 103.92（链序等价） | 39.06 → 39.06 | 1 → 1 |
| 凯尔希 3719111841 | 主体 | 6/412/690 | 6 | [-1009,-1563,1009,1427] | 43/0 | b0 0.00 → 0.00 | 0.00 → 0.00 | 0 → 0 |
| 0917·3233141951 | 龙 | 21/8089/15067 | 19 | [-1779,-1155,1668,1089] | 65/0 | b20 165.46 → 165.46（链序等价） | 127.75 → 127.75 | 123 → 123 |
| 0917·3462491575 | 身体 | 10/487/794 | 8 | [-715,-917,711,861] | 75/0 | b3 75.97 → 75.97（链序等价） | 36.31 → 36.31 | 0 → 0 |
| 伊蕾娜 3660962877 | —（无 puppet） | — | — | — | 127/0 | — | — | — |

- **网格 bbox / 层矩形**：6 包**全部逐位不变**（层矩形含 19 个附件锚点层；`parseScene` 的锚点基准随开关走，
  但本语料里锚点层所在模型的动画层是"非 additive blend=1"或"帧0==层姿势"⇒ 基准被整层替换，链序不改变最终锚点）。
  测试仍守一条**结构性**断言：改前/改后**只可能**在带 `attachment` 的层上出现差异（非附件层必须逐位相同）。
- **`?bones=` 台账**：探针反解 `pose = bindWorld × gBones` 与宿主喂进去的 RT **逐帧逐骨 maxΔ ≤ 6.6e-5 px**
  （同开关时 0；开关不一致时 340.76 px —— 这条就是"探针与渲染同空间"的判据）；台账帧数=会话帧数
  （>180 帧时长会话只留环形缓冲尾部 180 帧，判定按尾部对齐）。会话摘要例：hina `maxΔty=5.01px(b30)` / `maxΔang=0.0417rad(b18)`、
  `mirrorEver=[]`（无骨级镜像）。
- **`?submesh=` 分组表**（组号:顶点数）6 包**逐位相同**（分组只依赖 `blendIndices`）。
- **链序等价的包**（girl / 龙 / 身体）两种顺序**逐位等价**：这些 rig 的 bind 姿态没有父级旋转（`cos=1,sin=0`），
  `W[parent] × L = L × W[parent]` ⇒ 修正对它们零变化 —— 这也是"改前/改后逐位一致"的回归证据。

### P-110.4 翻转消除 + 残余变号的定性

hina 面部 5 组（`?submesh=all`，271 帧 × 1/30s，t=0→9s）：

| 骨 | 组 | 最大位移 旧→新 | 最大变号 旧→新 |
|---|---|---|---|
| b16 眼 | 22 顶点/17 三角 | 13.70@3.7s → 6.26@0.467s | **1/17@0.5s → 1/17@0.5s**（不变） |
| b17 眉毛 | 11/8 | 29.36@8.53s → 14.06@8.5s | **8/8@0.267s → 0/8** |
| b18 睫毛 | 15/16 | **102.07@8.5s → 11.09@8.5s** | **12/16@0.367s → 0/16** |
| b19 外眼角 | 12/14 | 55.66@0.467s → 13.02@8.5s | 3/14@0.3s → 0/14 |
| b30 瞳孔 | 18/23 | 16.11@3.7s → 6.40@0.433s | 1/23@8.5s → 0/23 |

- **b17 整组翻转消失（8/8 → 0/8）**，b18 位移降到 11.09 px（↓89%），组级变号总数 25 → 1。
- **残余变号（b16 1/17）的定性 = 多骨权重剪切（LBS 固有），不是本 bug 的残余**，三条机器判据：
  ① **单骨三角形永不翻**：三顶点权重全给同一根骨时，蒙皮 = **一个**正行列式仿射变换（实测所有帧所有骨
     `det(gBone) > 0`、`mirrorBones=[]`），有向面积不可能变号。实测单骨三角 **65582** 个（帧×三角）变号 **0** 个；
     残余 61 个变号事件（6 个不同三角形）**全部**是多骨混合（最"重"者 `maxW=0.9524 < 1`，即第二根骨仍有贡献）。
  ② **与链序无关**：b16 的 `1/17@0.5s` 在 **全旧 / 半修 / 全修** 三种口径下**完全相同**（半修 = `bindInv` 修正序
     + `bindRT` 旧序）⇒ 它不是链序错配的产物。
  ③ **量级收敛**：变号事件 1369 → 61（不同三角形 43 → 6），且旧口径里那种"整个骨组 8/8 同时翻"的结构消失
     （修正后**任何组的**组级最大变号 = 1）。残余 6 个三角形是否肉眼可见 **未定**（需 GPU 像素，见 P-110.6）。
- ⚠ **P-109.6 第 2 条引用的残余数字（b16 8/17、b30 8/23、b18 4/16）作废**：那是"只换一处"的半修实验形态
  （或不同时间网格）的数字；**两处同源**的正确修法下残余是 b16 1/17（且三口径不变），b30/b18/b19 全 0。

### P-110.5 登记与验收（本轮实测）

- **回退开关** `?bindorder=legacy`：写法与既有 `?x=legacy` 同形（`core/puppet-skin.js::bindOrderLegacy` 是唯一判定式，
  `core/we-scene-bundle.js:6372` 与 `demo.html:1678` 各有同形解析点供 `diag-flag-check` 抓取）。
  语义：缺省/空/`=1`/大小写不符 ⇒ **修正序**；`legacy` ⇒ 父先乘旧序（b17 复现 8/8、b18 复现 102.07 px）。
  `docs/README-DIAGNOSTICS.md` 主表已收录（表头计数与抓取一致：**136 == 136，0 差异**）。
- `node tests/bind-order-test.mjs` ⇒ **ALL PASS（76 通过 / 0 失败）**，覆盖 TN1–TN6（含
  "**改回旧写法必须红**"的反向变异：临时副本里把默认序换回父先乘 ⇒ TN1a/TN1b 差 340.76 px、b17 端到端又 8/8）。
- `node tests/submesh-probe-test.mjs` ⇒ **ALL PASS（56 通过 / 0 失败）**（§5 改走同一份链后，真动画段读数 =
  修正后的口径：最大位移 b12 24.57/组，残余变号 b16 1/17@0.5s）。
- `node tests/docs-check.mjs` rc=0；`bash tests/run-all-tests.sh --only bind-order submesh-probe attach-transform
  blink-phase animation-badframe projection-y skin-order-kal meshsize bundle-syntax demo-syntax docs-check diag-flags`
  ⇒ 见本轮汇报（**未跑全量**；本机无 GPU/WebGL2，全部经 mock-GL 驱动真实 `renderMeshLayer`，不做像素级对照）。

### P-110.6 未定项（不随本节关闭）

1. **elysia 移植侧的 `m × bindInv` 未改**：`elysia/we-renderer/puppet.js:174` 与它的 bind 链
   （`elysia/we-renderer/puppet.js:120` / `core.js:322`，父先乘）仍保留上游形态 ⇒ `?mode=elysia` CPU 对照通路
   里同一个缺陷还在。判定已给（P-110.1），但它是 MIT 移植参考件/对照通路，改动会污染 A/B 基准 ⇒ 留给
   "elysia 对齐"专线（需要时按同一判据改两处：链序 + `gBones` 顺序）。
2. **残余 6 个变号三角形的可见性未定**：已证"单骨不翻 + 与链序无关 + 多骨混合"，但"这 6 个三角形在
   真机 GPU 上是否看得出"仍需像素（本机无 `/dev/dri`、无头 Firefox `AllowWebgl2:false`、Chromium+SwiftShader 挂起）。
3. **帧 0 ≠ bind 的动画**：龙 anim0 差 1472.69 px、3462491575 anim1/2 差 8.83/55.43 px（模型自身口径，
   P-110.3 的"数据恒等"只对"帧0==bind"子集断言 0）⇒ 这些动画的 additive 基准要不要改成 `bind` 另作一题
   （P-109.6 第 2 条的残留疑问）。
4. **官方像素级对照仍缺**（与 P-109.6 第 3 条同）：需要 GPU 机器或用户在真机截同一相位。
5. **不参与链序断言的镜像副本未动**：`tests/animation-badframe-test.mjs` / `tests/blink-phase-test.mjs` /
   `tests/package-matrix.mjs` / `tests/render-audit.mjs` / `tests/skin-order-verify.mjs` 各自仍留一份
   **自洽**的 bind 世界链（父先乘 + 自算 `bindInv`，因此断言全绿、测的是"自己被测的那个变量"）；
   `skin-order-verify` 只判 `gBones` 顺序（`bindInv × m`，未变）故无需改。**要不要把它们也收敛到唯一实现处**
   属独立清理项（动 `package-matrix`/`render-audit` 会改冻结基线的数字，需另开一轮）——本轮不动。

## P-111（2026-09-17 门禁回归收口）冻结全量门禁 5 个红项（`mdla-walk` / `text-font-fallback` / `web-frame-geometry` / `audio-band-array` / `data-limits`）—— 逐项定性、修根因、每项带反向证据

> **触发**：`/tmp/gate-p110.log`（全量 `PASS=74 / FAIL=5 / SKIP=1 / 总 80`）。本机 `df` 运行前后均为 79G 可用。
> 逐项**先取报错原文**（`bash tests/run-all-tests.sh --only <5 项>`），不按猜测改。归因：**5 项全部是今晚
> 三条并行线（P-110 bind 链序 / 文档整理线 / 持久化轮）的连带回归**，没有一项是渲染管线本身的功能退化。

### P-111.0 五个红项的报错原文（定性唯一依据）

```
FAIL mdla-walk (321ms) — 退出码 1
  ✗ T5c 修复后：蒙皮层层数 > 0（Girl and cat 实测 1 层 girl）  [skins=0 frameCount=[]]
  ✗ T5e 修复后无蒙皮错误日志  [["❌ 蒙皮准备失败 girl: BIND_ORDER_LEGACY is not defined（该层将退化为静态四边形）"]]
  ✗ T5g 变异时不再静默：catch 报出 frameCount is not defined  [（同上 BIND_ORDER_LEGACY…）]
  ✗ T5h 凯尔希 3719111841：蒙皮层 5 层（设备上报 25→0 的那 5 层）  [skins=0 fc=[]]
FAIL text-font-fallback (825ms) — 退出码 1
  ✗ T4h THIRD-PARTY.md 的 Spin Cycle 节有逐条件对照表（条件 / 怎么满足 / 证据）      （105 通过 / 1 失败）
FAIL web-frame-geometry (140ms) — 退出码 1
  FAIL T4e docs/COPYING-RULES.md §4 台账含本模块条目
FAIL audio-band-array (140ms) — 退出码 1
  FAIL T4b docs/COPYING-RULES.md §4 台账含本模块条目
FAIL data-limits (5322ms) — 退出码 1
  ✗ D9 插件客户端 localStorage **单值上限**：超 256KB 不写 + 打警告（大图走 IndexedDB），两处写入都走 `mpwLsSafeSet`
    （37 通过 / 1 失败）
```

### P-111.1 逐项根因（一句一条）

| 红项 | 根因（不是猜测，是报错直接给出的事实） | 归属线 |
|---|---|---|
| `mdla-walk` | T5 的 harness 用 `new Function(lib, pkg, …9 个参数)` 抽出 `demo.html` 的蒙皮准备块来跑；P-110 起块内新增 `lib.bindWorldChain(mesh.bones, { legacy: BIND_ORDER_LEGACY })`，而 `BIND_ORDER_LEGACY` 是 `demo.html` 顶层 const（同作用域，**真机不红**）⇒ 沙箱里裸引用 ReferenceError，被块自己的 catch 吞成"蒙皮准备失败" ⇒ `skinLayers` 恒空 | P-110（bind 链序线） |
| `text-font-fallback` | 文档整理线把 `THIRD-PARTY.md` §4.6.1 的表改成**双语三列**并另起「未定项」段 ⇒ 旧断言写死的英文列名 `How this repository satisfies it` 消失（同节英文变 `how we satisfy it`） | 文档整理线 |
| `web-frame-geometry` | `docs/COPYING-RULES.md` §4 台账的 **#9 整行被删**（该行就是本模块的登记行），而 `THIRD-PARTY.md` §11 仍写 `Ledger: … entry #9` ⇒ 指针悬空 | 文档整理线 |
| `audio-band-array` | 同一条：§4 台账 **#10 整行被删**，`THIRD-PARTY.md` §12 指针悬空 | 文档整理线 |
| `data-limits` | 持久化轮把 STORE_KEY 的落盘收敛成唯一入口 `mpwPersistSection`（受控调用形态由 2 处 `mpwLsSafeSet(STORE_KEY, JSON.stringify(…))` 变成 6 处 `mpwLsSafeSet(STORE_KEY, <变量>)`），并新增"抽 image 落 IndexedDB + 回读校验"；D9 数的还是旧形态 ⇒ 两条计数全错（2→0、0→2）。其中 2 处裸写是**真的**绕过了单值上限（`mpwMarkPersistFail` / `mpwClearPersistFail` 里的失败留痕写） | 持久化轮 |

**不是**参考区搬迁（`references/`）或 `MPW_ROOT` 口径问题：这 5 个测试全部经 `tests/_root.mjs` 的 `ROOT`（= 仓库根，
`MPW_REPO_ROOT` 可覆盖）与仓库内相对路径取文件，`bash tests/run-all-tests.sh` 也已把 `MPW_REPO_ROOT` / `MPW_ROOT`
（工作区根）按既有语义导出；`vendor-ref/…` / `wer-ref/…` 在这 5 条里 0 处引用（`grep` 复核）。

### P-111.2 修法（改根因；没有跳过、没有放宽、没有删断言）

1. **`tests/mdla-walk-test.mjs`**：把 `demo.html` 里**那一行 `const BIND_ORDER_LEGACY = …` 原文抽出来**，
   注入到被 `new Function` 执行的块前面 —— 与浏览器里的作用域形状一致（不是复制表达式、不是写死布尔）。
   新增 **T5a2** 断言该行确实存在于 `demo.html` 顶层且被抽到 ⇒ 声明被改名/删除时立刻变红，不再退化成"参数缺失"。
2. **`docs/COPYING-RULES.md` §4**：按 §5.1 口径（"按规格独立实现"，不再自称洁净室）**补回 #9/#10 两行**
   （上游 = `oneincase/webwallgl`，**MIT**，不属 §9 阶梯的"无许可/不兼容"适用范围 ⇒ 本就该登记在本台账），
   六列齐全 + 指向规格文档与 THIRD-PARTY §11/§12，并加一条脚注记录"本轮整理曾整行删掉、五处指针悬空"。
   悬空指针因此全部复位：`THIRD-PARTY.md:712/762`、`docs/WEB-FRAME-GEOMETRY-SPEC.md:6/165`、
   `docs/AUDIO-BAND-SPEC.md:6/102`、`docs/PATCHES.md:6088/6356`。
3. **`tests/text-font-fallback-test.mjs` T4h**：改成按**新口径**判同一件事，且比旧断言严 ——
   先在 `THIRD-PARTY.md` 里**切出 §4.6.1 这一段**（`#### 4.6.1` → `### 4.7`），再要求：标题含 `condition by condition`、
   表头三列齐（`逐条义务（作者条款原话 / the author's words）` + `我们如何满足（how we satisfy it）` +
   `待律师确认项（pending counsel）`）、**≥6 条编号条件行**、作者字体页 URL、证据（`44,228` / `44,640` / `sha256`）、
   以及新增的「未定项」段。
   **旧断言为何过时**：旧表第三列是 `Evidence`，本轮律师意见要求把"已满足"与"待确认"分开 ⇒ 证据逐条并进
   "如何满足"列、第三列改为 `pending counsel` 并另起「未定项」段；旧断言钉的那句英文列名已不存在于新表，
   继续钉它等于把**文档口径升级**判成回归。新断言同时覆盖旧断言的全部三要素（逐条件、如何满足、证据）+
   新增的待确认项分列，不是放宽。
4. **`dsh-mpkg-wallpaper/lib/client.js`**（本批唯一插件侧改动，两行）：`mpwMarkPersistFail` / `mpwClearPersistFail`
   里那两处**裸** `localStorage.setItem(STORE_KEY, JSON.stringify(cur))` 改回受控入口 `mpwLsSafeSet(STORE_KEY, …)`
   —— 上限"在每一处写入都生效"这条不变量不能有例外（写路径本就为失败标记留了 160 字节余量）。行为不变：
   标记仍然写入、仍然 `console.warn`；插件自带 `tools/persist-test.mjs` 复跑 **49 通过 / 0 失败**。
5. **`tests/data-limits-test.mjs` D9** 拆成三条**新口径**断言（阈值仍集中、失败仍不静默、入口仍唯一）：
   - `D9`：`MPW_LS_MAX_BYTES` / `MPW_LS_SPILL_BYTES` **各只定义一次**，且**求值**分别 == `262144` / `2097152`
     （不再钉 `256 * 1024` 这种写法），超限分支仍"警告 + `return false`"；
   - `D9b`：**0 处**裸 `localStorage.setItem(STORE_KEY…`，受控调用 ≥6 处；
   - `D9c`：`mpwSpillImage` + `mpwIdbBgKind` **回读校验** + `回读校验失败(` 分支 + `MPW_PERSIST_FAIL_KEY` 留痕 +
     `mpwPersistOnMsg` 面板告警通道 + `?mpwpersist=legacy` 回退开关仍在。
   **旧断言为何过时**：它把"集中"实现成"某一种调用写法的出现次数 == 2" —— 持久化轮把 stringify 提前到唯一入口后
   这个数必然变成 0；而"0 处裸写"那一半当时恰好被两处失败留痕违反（所以旧断言当时既是**过时的**、也**抓到了真的问题**）。
   新断言把"集中"改成"定义只有一份 + 值正确 + 入口唯一（裸写 0 处）"，比旧断言更强（多判了 spill 阈值与回读校验）。

### P-111.3 反向证据（改回旧写法/旧路径必须变红）

| 项 | 变异（临时，跑完立即按字节还原） | 结果 |
|---|---|---|
| `data-limits` | `mpwClearPersistFail` 里改回裸 `localStorage.setItem(STORE_KEY, …)` | **✗ D9b** `[raw=1 guarded=5]`（39 通过 / 1 失败） |
| `data-limits` | `MPW_LS_MAX_BYTES` 再定义一份（`const MPW_LS_MAX_BYTES = 262144;`，破坏"阈值集中"） | **✗ D9** `[defs=2/1 …]`（39 通过 / 1 失败） |
| `web-frame-geometry` | `docs/COPYING-RULES.md` 里把 `web-frame-geometry` 全部改名（台账行消失） | **FAIL T4e docs/COPYING-RULES.md §4 台账含本模块条目**（1 项失败） |
| `mdla-walk` | `demo.html` 顶层 `const BIND_ORDER_LEGACY` 改名 | **✗ T5a2/T5c/T5e/T5g**（21 通过 / 5 失败：`skins=0` + `BIND_ORDER_LEGACY is not defined` 复现） |
| `text-font-fallback` | `THIRD-PARTY.md` 三列表头里的 `我们如何满足（how we satisfy it）` 改名 | **✗ T4h**（105 通过 / 1 失败） |

（`mdla-walk` 另有**内建**反向变异：T5f/T5g 把修复行改回裸 `frameCount` ⇒ 必须复现 `meshDraws=0` + 报错日志，
见 P-59 A1；本轮同样复跑通过。）

### P-111.4 验收（本轮实测）

- 五条单跑：`bash tests/run-all-tests.sh --only mdla-walk text-font-fallback web-frame-geometry audio-band-array data-limits`
  ⇒ **PASS=5 / FAIL=0 / SKIP=0**（逐条细节：`mdla-walk` 26/0、`text-font-fallback` 106/0、
  `web-frame-geometry` ALL PASS、`audio-band-array` ALL PASS、`data-limits` 40/0）。
- 全量：见本轮汇报的汇总行（目标 `FAIL=0`，`SKIP=1` = `jpeg-decode` 的有意条件项）。
- 插件侧复跑：`node tools/persist-test.mjs`（`dsh-mpkg-wallpaper`）⇒ **49 通过 / 0 失败**（证明 P-111.2 第 4 条零行为变化）。

### P-111.5 未定项（不随本节关闭）

1. **工作区根的 `docs/COPYING-RULES.md` 副本已不同步**：它是独立副本（非硬链接），内容停在 06:32 的版本
   （同样缺 #9/#10）。本批只被允许改 `we-scene-demo/` 与 `dsh-mpkg-wallpaper/` ⇒ 未动它；而**仓库内**所有引用
   （含 `tests/_root.mjs` 的 `ROOT`、`run-all-tests.sh` 的 `MPW_REPO_ROOT`）都解析到仓库内这份，门禁不受影响。
   要不要把副本改成软链或删除，属工作区根文档线的决定。
2. **别的 harness 也可能漏注入外层作用域符号**：本轮只修了 `mdla-walk` 的蒙皮块。同类"从 `demo.html` 抽块
   + `new Function(...)` 跑"的用例若将来引用新的顶层 const，会以同样方式变红（好在 T5e 那类"无错误日志"断言会抓到）。
   是否抽一个共用的"作用域注入"helper 属独立清理项。
3. **`?bindorder=legacy` 的 harness 覆盖**：`mdla-walk` 的 T5 只跑缺省（修正序）。legacy 档的端到端回归由
   `tests/bind-order-test.mjs` 负责（P-110.5），本轮未重复接线。

## P-112-BANDGEOM（2026-09-17 任务书 §5 第 4 条 / P1-5）两个"写完但没接线"的模块接线：128 元频段数组（`?bandfeed=`）+ 帧几何（`?framegeom=`）

> 编号说明：`P-111` 已被门禁回归收口那条线占用 ⇒ 本号带 `-BANDGEOM` 后缀（与 `P-109-BASELINE`/`P-100-R1` 同形：
> 唯一 + 数字非降即可）。任务书**不在本仓库**（工作区根 `docs/MASTER-TODO.md`），其 §5 第 4 条与 P1-5/P1-6 行已同步更新。

### P-112-BANDGEOM.0 接线前的状态（事实）
- `core/audio-band-array.mjs`（P-103 交付，规格 `docs/AUDIO-BAND-SPEC.md`）与 `core/web-frame-geometry.mjs`
  （P-102 交付，规格 `docs/WEB-FRAME-GEOMETRY-SPEC.md`）**零 import**：两个规格 §6/§5 都自己写着"尚未接线"。
- 渲染器侧的音频只有两条**不同口径**：① 脚本侧 `audioBuffers(n)`（n 元均值，`demo.html`）；
  ② 插件/网页壁纸侧要的是 **128 元**（左 0..63 + 右 64..127）。缺这一层 ⇒ 作者侧阈值型音条无从验证（P1-5）。
- 帧几何模块的**指针口径**在 `core/we-scene-bundle.js` 里有一份内联等价物（`(clientX−left)/rect.width`），
  它不补偿祖先 CSS `transform` 的缩放（显示盒含缩放、`clientWidth/Height` 不含）⇒ 在被缩放的宿主 iframe 里
  指针位置会整体偏且不报错；`space:'css'` 那条注入路径只有一行恒等返回（注释指向一个**不存在**的换算分支）。

### P-112-BANDGEOM.1 改了什么（全部缺省关，逐位可回退）
1. **音频**（`demo.html`，切片段 `MPW-BANDFEED` / `MPW-AUDIOBUFFERS`，开关 `?bandfeed=1|sim|real`）：
   128 元数组按规格 γ=1.8/gain=1.8（模拟源）或 `clampOnly`（真实源）产生；
   ① 场景层脚本路径 `audioBuffers(n)` 改为从 128 元数组重采样（与网页壁纸同口径）；
   ② 宿主路径按 20Hz 节流 `postMessage {type:'mpw-audio-bands', len:128, source, t, bands}`（**契约未确认**，见接线文档 §4）；
   诊断面 `window.__mpwAudioBands` / `__mpwAudioBandStats()` / `__mpwAudioBandSource`（`silent` = 到底接上没有）。
2. **帧几何**（`core/we-scene-bundle.js` 指针口径 + `demo.html` video 壁纸帧盒，开关 `?framegeom=cover|contain|stretch`）：
   指针换算改走模块 `framePointerMap`（DOM `pointermove` 与 `space:'css'` 注入两条），
   `?frame=legacy|off|0` 仍是**最高优先**回退；帧盒用 `coverViewport`/`contentAspectOf`/`frameVisibleRect`
   算（内在尺寸优先，量不到**不处理**）。
3. **产物根三处落点**（否则浏览器相对说明符 404、静默失效）：`server/we-scene-demo-server.mjs` 两条同名路由、
   `build-pages.mjs` 两条产物根映射、源码里的相对 import（与 `attach-transform.mjs`/`baseline-metrics.mjs` 同形）。

### P-112-BANDGEOM.2 反向证据（改回旧行为必须变红；绿色运行也打印 RED 行）
- 音频两条：① 真源分支去掉 `clampOnly` ⇒ 0.2 变成 0.271993（测试里"没有套 γ"的断言变红）；
  ② 关掉脚本侧 `BANDFEED` 分支 ⇒ `audioBuffers(16)` 变回 `null`（"三件套长度 = n"变红）。
- 几何两条：① 帧盒块强制 legacy ⇒ cover 帧盒不再计算（1280×1280 @(0,−280) 的断言变红）；
  ② `framePointerMap` 的 cover 支退化成旧算式 ⇒ 显示盒 400/内部 800 时 x=200 而非 400（祖先 transform 补偿断言变红）。

### P-112-BANDGEOM.3 未定/缺证据（不猜，写在接线文档 §4）
- **web 壁纸 iframe 的尺寸路径不可注入**：三方 minified 渲染器私有 `nw()`/`Y1()`（公开面 `window.__wp` 无几何 setter），
  另一宿主在插件树（本任务禁改）⇒ 只接了本仓库自己的 DOM 帧（video 壁纸）。
- **渲染器 → 宿主的音频消息契约未确认**（in-repo 无消费者；插件侧的频谱桥是父页 → 帧内 `op:'audio'`）。
- **无系统声卡环回**：真实源 = 包内音频（需 `?audio=1` 且真在播），不是系统音乐。
- **`__mpwPointer.space='css'` 的口径未定**（全仓库无生产者；本次按窗口坐标解释）。

### P-112-BANDGEOM.4 验收
- 新增两项门禁（`tests/run-all-tests.sh` **末尾**）：`audio-band-wiring`（36 断言）、`frame-geometry-wiring`（43 断言），
  两项都含 RED-IF-REVERTED，纯 Node、无 GPU/网络，~0.2s。
- 既有模块契约两项不变（`audio-band-array` 35 / `web-frame-geometry` 50）。
- 开关主表：`?bandfeed=`/`?framegeom=` 已登记 `docs/README-DIAGNOSTICS.md`（`diag-flag-check` 双向归零；
  顺手代登记了插件线新增但未登记的 `hdrfrostwatch`，理由与 `mpwshim` 行相同 —— 该脚本按设计同时扫插件 `lib/client.js`）。
- 文档：新增 `docs/AUDIO-BAND-WIRING.md`（接线/开关/实测数字/未定清单/复现命令）；
  两份规格的"未接线"段已更新（`AUDIO-BAND-SPEC.md` §6、`WEB-FRAME-GEOMETRY-SPEC.md` §5），
  模块头部与差异清单（洁净室判据）**一字未动**。

## P-113（2026-09-17 任务书"能力对齐线"）壁纸显示选项落地：水平翻转 / 播放速度 0.5–2× / 颜色选项（亮度·对比度·饱和度·色调偏移）+ `__wp` 三个 API

> 契约已在**测试台「壁纸设置」页**（`demo/index.html` 的对照表）与插件 `dsh-mpkg-wallpaper`（MIT）侧写好
> ⇒ 本条只做"渲染器侧按同一套机制补齐"，不改契约、不改测试台（`we-scene-demo/demo/` 与
> `references/vendor-ref/ww-pages/**` 属另一条工作流的禁改区）。

### P-113.0 机制定案（为什么是 CSS 而不是重写渲染器）

- 与上游 `oneincase/webwallgl`（MIT，见 `THIRD-PARTY.md`）的 `?fx=`/`setFilter` **同一套机制**：
  **CSS `filter` / `transform` 作用在"拥有渲染输出的元素"上**（上游是 wrap 容器，本仓库是 canvas `#sc`；
  多实例 `?ids=` 时是每格自己的画布）——不重挂载、不进 GL 管线、不改 `renderer.render()` 的入参。
- **一处修正**：任务书写"复用 `demo.html` 的 `?fx=` CSS 滤镜机制"，但本仓库 `demo.html` 里**没有**该功能
  （实测 `grep -c filter demo.html` 的 28 处全是 `Array.prototype.filter`；`#fx`/`toolbar.filterTip` 属测试台
  页面 `demo/index.html:205` + `demo/bench-patch.js` 的 i18n 字典，禁改区）⇒ 本条的落点是**同一机制的一个
  单写入点**：颜色串**追加**在"既有 filter 串"之后、关掉时逐字还原（`composeFilterCss`），
  宿主/测试台/未来任何 `?fx=` 实现都能与它合成而不打架。

### P-113.1 改了什么（全部缺省关，逐位可回退）

1. **纯逻辑**（`core/we-scene-bundle.js` 的「显示选项」节，唯一实现处，Node 侧可直测）：
   `parseDisplayOptions` / `parsePlaybackRate` / `clampDisplayNumber` / `applyDisplayPatch` /
   `buildDisplayFilter`（**四项全中性 ⇒ 空串**，不留空合成层）/ `buildDisplayTransform` /
   `composeFilterCss` / `composeTransformCss` / `applyDisplayOptions` / `displayFlipH` /
   `createSceneClock`（**没被 `setRate` 碰过 ⇒ 原样返回调用方的改动前算式**）/ `scaleSceneDt` /
   `syncVideoPlaybackRate`。区间：亮/对比/饱和 `[0,2]`、色相 `[-180,180]`、倍率 `[0.5,2]`；
   越界**钳位**、非法/空 ⇒ 默认（理由：`brightness(-1)` 会让**整条** filter 声明失效，钳位才保证串合法）。
2. **接线**（`demo.html` 的 `MPW-DISPLAY` 块 + 帧循环三处 + 两条纯视频路径）：
   解析（`?fliph=`/`?rate=`/`?coloropts=`/`?bright=`/`?contrast=`/`?satur=`/`?hue=`/`?display=legacy`）→
   持久化（单键 `mpw-display`，512 B 上限、超限拒写并记日志，P-104 纪律）→ 应用 CSS → 顶栏工具条
   （8 个控件，区间与 `DISPLAY_LIMITS` **同源**）→ `window.__wp`；帧循环的 `tSec` 与 `engine.frametime`
   走倍率、`<video>.playbackRate` 双向同步；`window.__mpwDisplay` 是引擎指针路径读的**实时**对象。
3. **指针**（`core/we-scene-bundle.js`）：`framePointerMap(ev, el, mode, flipX)` 新增第四参数
   （**缺省 false ⇒ 与改动前逐位同值**）；flipH 时归一坐标镜像**恰好一次**（`nx' = 1 − nx`；
   `?framegeom=cover` 档镜像帧内 client 像素），因为 `scaleX(-1)` 让屏幕 `x` 处看到的是内容的 `1 − x`。
   **注入通道不镜像**：`window.__mpwPointer` 是**设计坐标**（宿主算好的场景空间），
   `__pointerDesign` 对它原样透传 `[inj.x, inj.y]` ⇒ 不是镜像两次。指针优先级链与 `resolveProjMode` 同形：
   `opts.displayFlipH` → `window.__mpwDisplay.flipH` → `?fliph=`。
4. **公共 API**（`window.__wp`，已存在的键不覆盖）：`setDisplay(patch)` / `setPlaybackRate(r)`（幂等，
   返回生效后的完整状态：含**真的写进输出元素**的 `filter`/`transform` 串）、`displayState()`（只读快照）。
   `?display=legacy` 是总回退：忽略全部开关（含持久化状态），**连 API 也只读**。
5. **优先级**（逐键）：`?display=legacy` > URL 里真正出现的开关 > `localStorage['mpw-display']` > 中性默认。
   ⇒ **参数全缺省 + 空存储 = 与改动前完全一致**（画布 style 一个字符不写、时钟/frametime 逐位不变、
   视频零写入、零日志）。

### P-113.2 反向证据（RED-IF-REVERTED：把真源码改回旧写法 ⇒ 对应断言必红；绿色运行也打印 RED 行）

| 变异 | 实测后果 | 变红的断言 |
|---|---|---|
| ① 删掉 `framePointerMap` 的镜像支（= 翻转被忽略） | flipH 下 `nx=0.2`（与不翻转同值） | T5c / T5e（指针映射） |
| ② 把显示块里的 `createSceneClock({rate: MPW_DISPLAY.playbackRate})` 写死成 `rate: 1` | 16 帧推进 `0.234375` ≠ `2 × 0.234375` | T6b / T6c / T6e（倍率与**被求值的动画值**） |
| ③ `buildDisplayFilter` 的中性早退改成"永远返回空串" | 颜色选项不再产生任何 CSS | T2c / T2e（filter 串逐字） |

另有正向数值证据（非"看着像"）：`brightness(1.1) contrast(1.05) saturate(1.2) hue-rotate(15deg)` 逐字命中；
16 帧 × 15.625ms（二进制精确）下 rate=2 的推进 `===` 2 × rate=1；`evalPropAnimation` 求出的层属性值
rate=2 时为 100 = 时间翻倍处独立求值（rate=1 时为 75）；屏幕左半边 300px 在翻转下映射到设计 x=3072（不翻转 768）。

### P-113.3 未定/缺证据（不猜；细节与复现见 `docs/DISPLAY-OPTIONS.md` §8/§9）

- **本机无 GPU/WebGL2 ⇒ 只做 DOM/数值级断言**（`style` 属性、纯函数、被求值的动画值），
  "翻转/滤镜在屏幕上看起来对不对"**未证实**，需真机复看。
- `?mode=elysia`（CPU 对照路径）：CSS 层照样生效（同一张 `#sc`），但该路径没有本仓库的帧循环时钟
  ⇒ **播放速度对 elysia 的 CPU 动画不生效**（未接线；无人提出需求，故不猜做法）。
- 网页壁纸（sandbox iframe 内的三方渲染器）的输出元素在**另一个文档**里，本仓库无注入点（同 `AUDIO-BAND-WIRING.md` §4）。
- 上游 `?fx=` 的**预设滤镜白名单**（blur/grayscale/sepia…）未移植（本组只提供"与任意既有 filter 串合成"的机制）。

### P-113.4 验收

- 新增门禁项 `display-options`（`tests/run-all-tests.sh` **末尾**追加，既有 add 行一字未动）：
  71 断言 / 12 组，纯 Node、~0.3s、无 GPU/网络依赖，含 3 条 RED-IF-REVERTED 与"缺省零行为变化"整组。
- 开关主表：8 个新开关（`fliph`/`rate`/`coloropts`/`bright`/`contrast`/`satur`/`hue`/`display`）已登记
  `docs/README-DIAGNOSTICS.md` §⑦（`diag-flag-check` 实测 **147 == 147**，0 差异）。
- 文档：新增 `docs/DISPLAY-OPTIONS.md`（契约 / 机制与落点（含与 `?fx=` 的合成与优先级）/ 区间与取值语义 /
  指针行为 / 倍率语义 / 持久化 / API / 判据 / 未定 / 复现）。

## P-114（2026-09-18 任务书 P0-5）hlsl2glsl「只 vendored 未接线」的**诚实收口**：实测证明接进去**更差** ⇒ 保持自研、把门禁从"守没在跑的 vendored"改为"守在跑的自研"（+ 仪器化接线证明 + 反向变异必红）

**依据（P0-5 原文）**：*"把 `vendor/hlsl2glsl/` 接进 bundle 的转译路径，覆盖率 97.8% 作为会变红的门槛（已具备）；
验收：覆盖率不降 + 6 真包渲染对账不劣化 + 新增断言"*。**审计（同日）先修正了事实前提**：`core/we-scene-bundle.js`
用的是**自研**那份（`:4106` 定义、`:7268-7269` 调用，全文件 **0** 处引用 vendor），而 P-93 的
`tests/hlsl2glsl-coverage-test.mjs` import 的是 `vendor/hlsl2glsl/` ⇒ **门禁当时守着一份没在跑的实现**。

**结论（先说人话）**：**不接 vendored**。理由不是"怕动渲染路径"，而是**实测接进去更差**：
真实渲染路径口径下自研 **128/128** 真编译通过、vendored **120/128**（vendored 编不过 8 个作业，自研全过；
反方向 **0** 个）。根因清楚且可复核：我们**自己重写的** `shaders/common*.h` 头表依赖自研实现里若干自有修复
（尤其 **uniform 声明提前** `:4358`），而 vendored 那份是按上游 `headers.ts` 头表写的（那份头表 P-93 明确
**没有** vendored）。所以 P0-5 那句"未接线"的技术前提（接上会更好）**是陈旧的**；按"绝不为了满足一条陈旧
to-do 而接线"的纪律，本补丁交付的是 **门禁对准在跑的实现 + 接线证明**，不是"把渲染器换成 vendored"。

### P-114.1 取证：三个口径的实测数字（本机，`glslangValidator` 在场 ⇒ 严格口径）

| 口径 | 语料 | 自研（**在跑**） | vendored（未接） | 判别力 |
|---|---|---|---|---|
| **真渲染路径**：真 effect 链 + 真 combos（复刻 `tests/glsl-validate.mjs` 的走法，`combos = mp.combos ∪ ov.combos`） | `$MPW_ROOT/allwallpaper/dd` **11 包**（22 个数字目录里含 scene.pkg 的 11 个）**/ 128 个 (shader,combos,stage) 作业** | **128/128 = 100.0%** | 120/128 = 93.8% | vendored **8 个作业编不过**而自研全过；**自研编不过而 vendored 过 = 0 个** |
| **P-93 门禁口径**：4 包（按体积升序：`3715743282@3.7MB, 3721991999@8.3MB, 3554161528@22.5MB, 3778592720@41.3MB`）/ 46 去重文件 / `combos={}` | 同上 | **46/46 = 100.0%** | 45/46 = 97.8% | 唯一分歧：`blur_precise_gaussian.frag`（自研过 / vendored 不过） |
| 同上门禁口径，但**按 P-93 当时的括号检查**（数全文，注释也算） | 同上 | 32/46 = 69.6% | 45/46 = 97.8% | **假阴性**（见 P-114.2） |

`MPW_H2G_IMPL=vendor node tests/hlsl2glsl-coverage-test.mjs` 可原样复现 P-93 记录的 **45/46 = 97.8%**
（⇒ 旧口径没有被改坏，只是默认被测对象换了）。

### P-114.2 顺手修掉的一个**假阴性**：括号检查数了注释散文

P-93 的"括号/花括号平衡"是直接数 **全文**。但自研实现**保留注释**（vendored 那份调 `stripComments`），
而我们自己的 `shaders/common*.h` 注释正文里就有不成对的 `(`（例：`common.h` 的
`// Only the entry points that the shipped shaders (and the wallpaper packages they` / `// come from) actually call …`
跨行一开一合，全文计数就多一个 `)`）⇒ 旧口径把这 14 个**glslangValidator 真编译通过**的 shader 判成
"括号不平衡 ⇒ 可疑"，把自研的 69.6% 打了出来。现在：**剥掉注释与字符串字面量后再数**（原文计数仍打印作对照），
剥后 52/52 平衡、真编译 46/46 全过。**这不是放宽门槛**：残留 token 检查同样改成剥后文本；`MPW_H2G_MIN_RATIO`
自证仍在（把被测实现指回 vendored 并抬高门槛 ⇒ 红，见 P-114.5）。

### P-114.3 vendored 输在哪（三个根因，逐条可复现）

| shader（语料里的真包内路径） | vendored 的 glslang 报错 | 根因（自研有、vendored 没有） |
|---|---|---|
| `workshop/2981960200/effects/blur_precise_gaussian.frag`（3 个包共用同一份内容） | `0:37: 'g_Texture0' : undeclared identifier` | **uniform 声明提前**（`core/we-scene-bundle.js:4358`）：`shaders/common_blur.h:31` 在 `blur13a()` 函数体里引用 `g_Texture0`，而 shader 的 `uniform sampler2D g_Texture0;` 写在 `#include "common_blur.h"` **之后**（源文件 L4 是 include、L8 才是 uniform）⇒ 自研把 uniform 行提到最前（输出 L4–L6），vendored 不提前（函数在 L35、uniform 在 L112）⇒ 先使用后声明 |
| `workshop/3573886911/effects/frame_builder_by_gariam.frag`（`REF_RES=1`） | `0:389: '' : boolean expression expected` | **`float/int` 当 `if`/三元条件**（非零即真，`:4334`）：`vec4 final = vec4(outside ? inSmooth : outSmooth);` 里 `outside` 是数值类型，GLSL ES 只接受 `bool` |
| `workshop/3578699527/effects/audioline.frag` | `0:32: '-' : wrong operand types: no operation '-' exists that takes a left-hand operand of type 'const mediump int'` | **int→float 字面量归一化**：vendored 留下 `clamp(index, 0.0, BANDS - 1.0)`（`BANDS` 展开成整型常量）⇒ `int - float`；自研把该处补成浮点 |

### P-114.4 切换成本（实测；供将来复议，本补丁**未**付出这些成本）

| 维度 | 数字 |
|---|---|
| 体积 | vendored 两文件 **92,924 字节**（`vendor/hlsl2glsl/hlsl2glsl.js` 77,953 + `vendor/hlsl2glsl/hlsl-preprocessor.js` 14,971）；自研那一节（`core/we-scene-bundle.js:3721-4381`）**26,408 字节**；bundle 共 592,560 字节 ⇒ 内联约 **+15.7%** |
| 启动/解析 | `import` 实测 **15–17ms**（vendored 两文件）vs **32–33ms**（整个 bundle，已付）；46 文件转译 **235ms**（vendored）vs **187–243ms**（自研，两次取样） |
| 确定性 | 两份**都是确定性纯函数**：同一批 46 文件两次运行输出 sha256 相同（自研 `9ea12140b5dec6d8` / vendored `3e2334533f00d8d2`） |

### P-114.5 改了什么（4 处，渲染路径**零改动**）

1. `tests/hlsl2glsl-coverage-test.mjs`：默认被测实现从 `vendor/hlsl2glsl/` 改为 **`core/we-scene-bundle.js`
   导出的 `hlsl2glsl`**（= 渲染路径调用的同一个模块内绑定）；括号/残留检查改为**剥注释后**（P-114.2）；
   新增**接线身份** 3 条断言（被测实现 ≡ bundle 导出 / **bundle 源码 0 处引用 `vendor/hlsl2glsl`** /
   渲染路径调用点 `hlsl2glsl(src.frag|vert, 'frag'|'vert', effectiveCombos, resolver)` 在位）；
   新增 **A/B 对照** 2 条断言（vendored 不存在"自研编不过而它编得过"的文件；自研覆盖率 ≥ vendored）。
   `MPW_H2G_IMPL=vendor|wired`（默认 wired）、`MPW_H2G_COMPARE=0` 可关对照。
2. `tests/hlsl2glsl-wiring-test.mjs`（**新**，13 断言，~0.6s）：**仪器化真渲染路径** —— 把 bundle 的
   **真源码**复制到临时模块、只在转译调用点插 2 行探针（记录 `shaderName/stage/effectiveCombos`），
   用 mock-GL 捕获 `gl.shaderSource()` 真正收到的 GLSL，再与两份实现**逐字节**对拍。真实性边界如实写明：
   shader 字节 / effect 链 / combos / include 解析器**全部取自真包**（`3715743282` 的
   `blur_precise_gaussian.frag`，sha `7d613ded`）；只有**承载该效果链的那一层是合成的** —— 因为本机无 GPU/
   文字渲染器/蒙皮数据，语料里这些 shader 只挂在**文字层/蒙皮 mesh 层**上（实测：直接渲染真包一帧，
   `shaderResolver` **0 次**调用、效果链根本没执行）。合成载体层是 `tests/mock-gl-test.mjs` 已在用的写法。
3. `tests/run-all-tests.sh`：**末尾**追加 `add "hlsl2glsl-wiring"`（既有 85 行 add 一字未动 ⇒ 现 **86 项**）。
   同一提交里带入**并发的另一条线**对锁块的改动（`mkdir` → `flock` 统一锁协议，见该文件 `:307-315` 注释）——
   如实在此登记，不是本补丁的成果。
4. `docs/PATCHES.md` 本节；工作区根 `docs/HLSL2GLSL-COVERAGE.md` 新增 **§9**（把 98.2% 的适用对象写清楚：
   那是 vendored 的数字，并附上面三口径复测表）；`docs/MASTER-TODO.md` P0-5 行改为已收口（只改那一行）。

**回退开关**（本形状 (b) **不需要**回退渲染路径 —— 渲染路径一行未动；下面两个只为"将来复议时能复现旧口径"）：
`MPW_H2G_IMPL=vendor`（门禁改测 vendored）、`MPW_H2G_COMPARE=0`（关 A/B 对照）、
`MPW_H2G_WIRE_MAX_MB=<n>`（接线测试的语料包体积上限，默认 32MB）。

### P-114.6 自证："这条断言真的会变红"

```
$ MPW_H2G_IMPL=vendor MPW_H2G_MIN_RATIO=0.99 node tests/hlsl2glsl-coverage-test.mjs; echo rc=$?
✗ hlsl2glsl 覆盖率回归：2 条断言失败
  - 覆盖率 ≥ 99.0%（子集回归下限） — 97.8% = 45/46
rc=1
```
> ⚠ 口径变了之后的诚实说明：默认（自研）在本机是 **46/46 = 100%**，所以 P-93 记录的
> `MPW_H2G_MIN_RATIO=0.999` **不再会红**（1.0 ≥ 0.999）。上面这条是现在可复现的自证。

接线测试自带 **RED-IF-REVERTED**（绿色运行也打印 RED 行）——把真源码变异成"接 vendored"
（注入 vendored import + 重命名自研声明 ⇒ 渲染路径调用点落到 vendored）后，同一帧重跑：

```
   RED 变异后捕获到的是 **vendored** 的输出、不再是自研的 ⇒ W2e 会变红
   RED 变异后捕获的 GLSL 真编译**不过**（ERROR: 0:37: 'g_Texture0' : undeclared identifier）⇒ W2g 会变红
  ✓ W3b RED-IF-REVERTED：变异成"接 vendored"后 W2 的判定确实翻转  [2 条]
```

### P-114.7 6 真包渲染对账（**不劣化**；数字取自既有口径，未新造 harness）

**结构性前提**：本补丁**没有改渲染路径的任何一行** —— `core/we-scene-bundle.js` 的 sha256 与改动前**逐字节相同**
（`9c6b0cf80ac805862ebdb77fbf0b8ade13a5615b96d97f27e3a2452109d4ad4c`）；`git status` 里 `core/` 下的改动全部来自
**并发其它线**（`attach-transform.mjs` / `puppet-skin.js`），本补丁对 `core/` 的 diff 为空 ⇒ "逐位不变"是结构性的。
仍按验收逐项跑既有对账口径并记录实测数字（2026-09-18，本机）：

| 既有对账项（命令） | 实测数字 | 结论 |
|---|---|---|
| `node tests/glsl-validate.mjs`（**真渲染路径**：全 dd 包真 effect 链 + 真 combos + glslang 真编译） | `共 128 个 (shader, combos, stage) 待真编译` → **`结果: 128/128 通过`** | 无回归（与 P-114.1 独立复刻的双跑一致：自研 128/128、vendored 120/128） |
| `node tests/package-matrix.mjs --check`（6 真包矩阵 vs 冻结基线） | `✓ --check：与基线逐包比对无退化` | 无退化 |
| `node tests/layer-rect-check.mjs 3719111841 --refrender`（层矩形 vs 官方标定） | 与标定矩形中心距离 **中位 0px / 最大 79px**；非 center 对齐 **0 层**；有父级 22 层；attachment 19 层；puppet 网格 5 层；标定不可达 1 层（`115:眼睛组合`，判据 P-30） | 与 P-30/P-76 记录一致，无回归 |
| `node tests/projection-y-test.mjs`（相机投影 y 口径 + 粒子增量缓存不变量） | **49 通过 / 0 失败**（`?bones=人物` 逐骨 32 根；姿态=bind 反解 `maxErr=0.0e+0`） | 无回归 |
| `node tests/mock-gl-test.mjs`（mock-GL 调用序列） | **60 通过 / 0 失败** | 无回归 |
| `node tests/parity-check.mjs`（场景级对账） | `✓ 2 场景对账完成，无越界差异` | 无回归 |
| `node tests/skin-order-verify.mjs 3719111841 主体`（蒙皮链序） | 骨骼=6 顶点=412 采样144；正确序 `bindInv×W` 到枢轴最大误差 **0.0000**；旧序 `W×bindInv` **53.0** | 无回归（P-110 口径保持） |
| `node tests/render-audit.mjs 3719111841`（首帧逐层台账） | 首帧逐层 `vis/tex/skin/fx` 台账正常输出（`右侧发` 等 `fx=1` 层照常进效果链） | 无回归 |
| `bind-order`（TN4 全语料回归）/ `render-audit-kal` / `skin-order-kal` | 全量门禁内 **PASS** | 无回归 |

> 口径说明：这里**只跑仓内既有对账**（层矩形 / 投影 / mock-GL 调用序列 / 真编译覆盖率 / 逐包基线矩阵），
> **没有**新造 harness；`glsl-validate` 的 128 作业正是"真渲染路径转译 + 真编译"那一项，也是本补丁决策的主证据。

### P-114.8 未做 / 未证实（不猜）

- **本机无 GPU/WebGL2** ⇒ 上面全部是 `glslangValidator`（GLSL ES 300 参考前端）+ mock-GL + 逐字节文本级
  证据，**不是**真机 ANGLE/像素结果；"vendored 接进去在真机上会不会也差"未证实（差在编译期，与 GPU 无关，
  但按纪律不越界断言）。
- vendored 在**上游 `headers.ts` 头表**下的表现未在本仓复现（那份头表 P-93 决定不 vendored）⇒ "vendored 在它
  自己的配套头表下是否 100%"**未证实**，本补丁只断言"在我们这套自研头表 + 真语料下它 120/128"。
- 未删除 `vendor/hlsl2glsl/`：它仍是 P-93 登记的台账 #8/#9v（MIT 全文 + sha256 在 `THIRD-PARTY.md` §9、
  `docs/COPYING-RULES.md` §4），删它要动发布面与合规台账，且本次门禁仍用它做 A/B 对照 ⇒ 保留并说明用途。
- 未把 `?` 开关加进 `docs/README-DIAGNOSTICS.md`：本补丁**没有新增任何 URL 开关**（只有测试侧环境变量
  `MPW_H2G_*`），故该表无需新行（`diag-flag-check` 实测 **147 == 147** 仍绿）。

### P-114.9 全量门禁（本补丁的收口运行）

```
$ bash tests/run-all-tests.sh          # 脚本自持 flock；调用方**不要**再套外层锁
PASS hlsl2glsl-coverage (5947ms)       # 改后：守"在跑的实现"，46/46 = 100%（+ 接线身份 / A-B 对照断言）
PASS hlsl2glsl-wiring (559ms)          # 新增：13 断言（仪器化真渲染路径 + RED-IF-REVERTED）
PASS glsl-validate (9902ms)  PASS package-matrix (57856ms)  PASS layer-rect-kal (292ms)
PASS projection-y (2229ms)   PASS mock-gl (257ms)           PASS parity-check (585ms)
PASS bind-order (2035ms)     PASS docs-check (955ms)        PASS diag-flags (434ms)
══ 汇总：PASS=85 FAIL=0 SKIP=1 / 总 86 项        # SKIP = jpeg-decode（条件项：本机无真机截图，按设计不红）
```

**过程中修掉的一个环境产物**（不是本补丁的代码问题，如实登记）：第一次全量运行在第 3 次系统重启时被打断，
`reports/real-machine/` 里留下一个**被截断的 5 字节快照**（内容字面量 `null`，01:07 写入）；`baseline-trend`
于是 `JSON.parse` 出 `null` → 在 `tests/baseline-trend.mjs:74` 抛 `TypeError` ⇒ 那一轮 `FAIL baseline-trend`。
该文件属 `reports/`（`.gitignore:13` 忽略的本机滚动产物）且内容为空 ⇒ 删除后复跑 `baseline-trend` 得
`✓ 没有超阈值的退化`（`startup.totalMs 527 → 489 = −7.2%`、`switch.swapTo.ms 1099 → 839 = −23.7%`），
全量门禁随即 **85/0/1 全绿**。**未**顺手改 `tests/baseline-trend.mjs`（那是另一条线的文件；它的既有设计是
"不合 schema 的快照算红"，只是"截断成 null"会以 TypeError 的形式炸而不是走它的 `invalid` 分支——
建议那条线补一行 `if (!o || typeof o !== 'object')` 的空值守卫，按"绝不并发改同一文件"的纪律留给他们）。


## P-115（2026-09-18 门禁红项 `baseline-trend` 的**真因**收口）半截快照（顶层 `null`）不再把趋势脚本炸在赋值行：坏输入 ⇒ 指名文件 + 退出码 1（+ 反向变异必红）

**缘起**：P-114 收尾时登记过一次 `FAIL baseline-trend` —— 真因不是趋势逻辑，而是 `reports/real-machine/` 里一份
**被中断的采集留下的 5 字节文件**（内容字面量 `null`）。`JSON.parse('null')` **不抛异常**，于是
`tests/baseline-trend.mjs` 在 `o.file = rel(file)` 那行抛 `TypeError: Cannot set properties of null`
⇒ 症状是"趋势门禁红"，真因是"有份数据没写完"，两者都该报红，但报法完全不同：**要能一眼看出是哪份文件、坏在哪**。
P-114 当时按"绝不并发改同一文件"的纪律把守卫留给了本条线；本补丁就是那次移交的收口。

### P-115.1 改了什么（两处，均在测试侧）

| # | 文件:行 | 内容 | 为什么 |
|---|---|---|---|
| ① | `tests/baseline-trend.mjs:73-81` | 读盘后加**顶层类型守卫**：`o === null \|\| typeof o !== 'object' \|\| Array.isArray(o)` ⇒ 走既有 `invalid` 分支（退出码 1），并打印**文件名 + 类型 + 原文前 40 字符** | `null`/数字/字符串都过得了 `JSON.parse`，但下一行对它们赋属性在严格模式（ESM）下必抛 `TypeError`。这类文件是**坏输入**，该走"不合 schema"这条路 |
| ② | `tests/baseline-test.mjs:342-386` | 新增 **T5g**（6 条静态断言，8 次执行）：真子进程跑 `tests/baseline-trend.mjs --dir=<临时目录>`，覆盖 `null` / `5` / `"x"` / `[1,2]` 四种顶层 + "同一目录里的好报告仍入表" + "删掉坏文件回到 rc=0" + "空目录仍 SKIP/rc=0" | 把这条行为钉死；**判据含 `!/TypeError/`**，因为"崩掉"的退出码恰好也是 1，只看退出码区分不出来 |

**语义边界（刻意不动）**：`reports/` 一份都没有 ⇒ 仍然 `SKIP baseline-trend` + 退出码 0（条件项）；
有坏文件 ⇒ 退出码 1（红）。"没数据" ≠ "数据坏了"，这条既有口径一个字没改。
`tools/baseline-diff.mjs` **无需改**：它先 `mpwValidateSnapshot(obj)` 再取字段，非对象实测得 `{ok:false,errors:["不是对象"]}`
⇒ `die()` 退出码 2（已由 T5b"坏 JSON / 残缺快照 ⇒ 2"覆盖）。

### P-115.2 正常运行证据

```
$ node tests/baseline-test.mjs
== T5g 趋势脚本对半截快照的容错（坏输入报红，不崩在赋值行） ==
  ✓ T5g 目录里有 `null` 半截快照 → 退出码 1（坏输入=红），且**不**以 TypeError 崩掉  [rc=1]
  ✓ T5g 报错**指名文件** + 说清"顶层不是 JSON 对象" + 带上原文片段（能直接定位是半截文件）
  ✓ T5g 同一目录里的好报告仍照常入表（不是"一份坏就全丢"）
  ✓ T5g 顶层是 num（5）/ str（"x"）/ arr（[1,2]）→ 退出码 1 且不崩          [rc=1 / rc=1 / rc=1]
  ✓ T5g 删掉半截文件后 → 退出码 0（2026-09-18 的手工处置，现在脚本自己会报红）  [rc=0]
  ✓ T5g 一份都快照都没有 → `SKIP baseline-trend` + 退出码 0（条件项，门禁不红）  [rc=0]
ALL PASS （130 项）        # 本补丁前 122 项
```

### P-115.3 反向证据（RED-IF-REVERTED：把守卫删掉 ⇒ T5g 必红）

隔离手法：`/tmp` 建沙箱，顶层条目**软链**回真树，`tests/` 下除 `baseline-trend.mjs`（变异副本）与
`baseline-test.mjs`（真副本，靠自身位置把 `ROOT` 定到沙箱）外也全是软链 ⇒ 子进程跑的是**变异版**。

```
$ node mutate.mjs tests/baseline-trend.mjs <沙箱>/tests/baseline-trend.mjs   # 删掉 355 字节守卫
$ (cd <沙箱> && node tests/baseline-test.mjs)
  ✗ T5g 目录里有 `null` 半截快照 → …不…以 TypeError 崩掉                    # ← 变异后必红
  ✗ T5g 报错指名文件 + 说清"顶层不是 JSON 对象" …                            # ← 变异后必红
  ✗ T5g 同一目录里的好报告仍照常入表 …                                       # ← 变异后必红
  ✗ T5g 顶层是 num / str …                                                  # ← 变异后必红（严格模式赋属性）
  ✓ T5g 顶层是 arr（[1,2]）…                                                # ← 数组本来就不崩（旧代码也走 invalid），**不**是变异敏感项
12 项失败（对照：同一沙箱**不**变异 = 7 项失败 ⇒ 我的变异净增 **5** 项红）
$ 变异版单独跑同一份坏输入：`TypeError: Cannot set properties of null (setting 'file')` @ `<沙箱>/tests/baseline-trend.mjs:78`
$ sha256sum tests/baseline-trend.mjs   # 真树 cb4a851b… 变异前后逐字节相同
```

### P-115.4 过程事故（如实登记，已复原）

做上面的沙箱隔离时，`printf … > "$SB/tests/_root.mjs"` 里 `$SB/tests/_root.mjs` **还是个指向真树的软链**
（重定向默认跟随软链）⇒ 把真树的 `tests/_root.mjs` 覆盖成 3 行简版（掉 28 行文档与 `MPW_REPO_ROOT` 支持）。
`git status` 当场发现，`git show HEAD:tests/_root.mjs > tests/_root.mjs` 还原，`git diff --exit-code -- tests/_root.mjs`
证明与 HEAD **逐字节一致**；随后在沙箱脚本里加了 `rm -f` 防呆重跑，才拿到 P-115.3 那组干净结论。
教训一句话：**沙箱里凡"写文件"前先 `rm -f`（或 `[ -L ] && 退出`），不要假设路径还没被软链占住。**

### P-115.5 未做 / 未证实

- 未改 `reports/` 的产出侧（`tests/real-machine-check.mjs` 写盘是否可能留下半截文件）：本次只处理**读侧**，
  写侧是否要"先写临时文件再改名"**未查证**（按纪律不越界断言，留作后续项）。
- 未把 T5g 的四种顶层类型收进 `docs/REAL-MACHINE-AUTOMATION.md` 的故障排查表（该表的"数据坏了"一行已覆盖语义）。
- 本补丁**没有新增任何 URL 开关**（全是测试侧行为）⇒ `docs/README-DIAGNOSTICS.md` 无需新行（`diag-flag-check` 复跑仍 `147 == 147`）。

## P-116（2026-09-18 真机：OPPO Pad 4 Pro 平板"桌面版网站"）窄屏判定阈值 860→1180 + 修掉被删掉 `@media` 开头留下的"孤立窄屏块" + 舞台框不再超宽 + 根元素裁横向溢出

**真机环境**（用户提供）：OPPO Pad 4 Pro，13.2″ 3392×2400（12.7:9），Via 浏览器**开着"桌面版网站"**（标识 Windows/Chrome）。
⇒ 布局视口恒为 **980 CSS px**，`screen.width=1696`，`matchMedia('(pointer:coarse)')` 不再可靠。
**症状**：手机上那套"单列堆叠"完全没生效，平板拿到的仍是**桌面三列塞进 980px**。

### P-116.1 复现（无头 Firefox，视口 980×1200 / screen.width 拷成 1696，UA=Windows Chrome）

```
改前：类=bench-shell bench-mid（**没有** bench-narrow）  workbench display=grid  列=240px 260px 480px
      #stage-slot=480×707   #stage-scale=448×252   document.scrollWidth=2940（视口 980 的 3 倍）
改后：类=bench-shell bench-narrow                     workbench display=block 列=240px auto minmax(0px,1fr)
      #stage-slot=980×666   #stage-scale=964×542   document.scrollWidth=980 == clientWidth
```

### P-116.2 四个根因（都在 `demo/index.html`，逐个带证据）

| # | 根因 | 证据 | 修法 |
|---|---|---|---|
| ① | **判定阈值 860 < 980**：桌面版网站的布局视口恒为 980px，`vw <= 860` 永不命中（那份注释自己写着"实测 clientWidth=980"，阈值却仍留在 860） | 改前 980 视口下 `html` 只有 `bench-shell bench-mid` | 阈值改 **1180**（=「三列放不下」的实测分界），并删掉被它包含的旧兜底分支 |
| ② | **窄屏块被删掉了 `@media(…){` 开头**：规则裸露在顶层 + 末尾多一个孤立 `}`；连带 4 条"只在窄屏生效"的规则（工具栏字号 / `.site-tab` / `#settings-pop`）**在桌面宽度也生效**，其中一条选择器写成 `…bench-narrow  html.bench-shell #toolbar`（元素不可能是自己的后代 ⇒ 死规则） | 剥注释后大括号计数在第 148 行出现多余的 `}`；桌面实测 `.site-tab` 左边距 9px（产物原值 14px，同特异度且本块更靠后 ⇒ 改前必然被覆盖成 9px，属级联推理） | 删孤立 `}`、4 条规则收进 `.bench-narrow`、死选择器改正；**闸门不再用 @media**（类由 head 同步脚本加） |
| ③ | **舞台框比视口还宽**：`#stage-scale{height:46vh!important; width:auto!important; max-width:100%!important; aspect-ratio:16/9}` —— 高度先定、宽高比反推宽度，`max-width` 夹住宽度**却不会把高度按比例收回去**，实测 980×1696 视口下缩放框宽 **1387px**（比视口宽 407px，右侧被裁） | 改前矩阵：`缩放框=1387x780`（视口 980）、`1425x802`（视口 980） | 换成"取两者较小"的写法 `width:min(100%,calc(46vh * 16 / 9))!important; height:auto!important` ⇒ 宽不超容器、高不超 46vh（实测 980 视口下 964×542；1696 高时仍是 964×542） |
| ④ | **横向溢出没在根元素裁**：`#pages-track` 是 300% 宽（三页并排、translate 切换），只写 `body{overflow-x:hidden}` 时**部分引擎不把它传播到视口** —— 实测 `window.scrollTo(9999,0)` 后 `window.scrollX=1960`（真能横拖两屏；`scrollingElement.scrollWidth=2940`、body 计算值 hidden、html 计算值 visible）。桌面宽度同样存在（1440 → 2880） | 改前矩阵：`可横滚=1960`（980 视口）/ `2880`（1440 视口） | 补一条 `html.bench-shell{overflow-x:hidden}`（与 body 那条并存），实测 `scrollWidth == clientWidth`、`window.scrollX=0` |

另外两处**顺带**收口：`demo/bench-patch.js` 的 `maxLogsForLayout()` 原先自己又写了一遍 `innerWidth <= 860`
（阈值复制两份必然漂移）⇒ 改成读**同一个闸门** `html.classList.contains('bench-narrow')`；
外壳版本标记从 `2026-09-18a` 提到 `2026-09-18b`（旧缓存核对面）。

### P-116.3 静态把守：`tests/demo-check.mjs` 新增 D9（7 条断言）

D9 全部是**纯静态**判据（真机才看得出的东西没法靠无头环境兜住），**实测 10 条**（原先这里写「7 条」是漏数了后加的三条）：大括号平衡（**先剥注释**——
自测时我写在注释里的一个 `}` 就让初版检查误报，与 P-114.2"括号检查数了注释散文"是同一类假阳性）、
判定表达式里阈值恰好一处且 =1180、阈值不是 860、判定仍在首屏同步路径上（加类之前不许等事件）、
`.bench-narrow` 类块在 @media 之外、无"自己是自己后代"的死选择器、安全网每条规则在类块里有**逐字同款**（零漂移）、
根元素裁横向溢出在位。`node tests/demo-check.mjs` ⇒ **45 通过 / 0 失败**（本补丁前 35；后续 D10 品牌改名断言并入 ⇒ 现为 **62 通过 / 0 失败**）。

另加一层**纯 CSS 安全网** `@media (max-width:1180px){ … }`：即便 head 脚本没跑成（抛异常/被拦），
光靠宽度也能让三列改堆叠、舞台不塌。它只放 6 条结构规则，且每条都由 D9 断言与类块逐字对齐。

### P-116.4 验收（单个无头浏览器实例，7 个视口，跑完即关）

```
                                             窄屏  视口/屏     布局    列                            舞台      缩放框   可见溢出 可横滚
平板桌面模式 980x1200 (用户机)                  true  980/1696  block  240px auto minmax(0px,1fr)    980x576   964x542   0       0  ✓
平板桌面模式 980x1387 (按 2400/DPR2 折算真实高)  true  980/1696  block  同左                          980x666   964x542   0       0  ✓
手机桌面模式 980x1743                          true  980/412   block  同左                          980x837   964x542   0       0  ✓
正常手机 412x915                               true  412/412   block  同左                          412x439   396x223   0       0  ✓
桌面 1440x900                                 false 1440/1440  grid   300px 320px 820px             820x474   796x448   0       0  ✓
桌面 1024x768                                  true 1024/1024  block  240px auto minmax(0px,1fr)   1024x369   628x353   0       0  ✓
边界 1181x800                                 false 1181/1181  grid   300px 320px 561px             561x340   537x302   0       0  ✓
```

桌面 1440 的三列（300/320/820）与舞台（820×474）与改前**逐值相同** ⇒ 宽屏零回归；1024×768 由"挤成三列"
变为堆叠（有意的行为变更：三列在 1024 下本来就放不下）。
其余：参考区那份补丁行为测试（`references/vendor-ref/ww-pages/bench-patch.test.mjs`，**不在本仓**）**355/0**（T24 的"head 内联脚本 <1600 字符"一度被我加长的注释顶到 1607 ⇒ 已压缩到 1392）、
`demo-syntax-check` 10/10、全量门禁见 P-116.5。

### P-116.5 全量门禁 + 未证实

- 全量：`bash tests/run-all-tests.sh` ⇒ 见本节末尾追加的运行结果。
- **未证实**：①用户真机（Via / Chromium 内核）的像素结果——上面全部是无头 **Firefox** 的几何/computed-style
  数字，Chromium 内核未在本机跑过（本机无 playwright-chromium）；②平板竖屏与横屏的真实可用宽度以
  `2400/DPR2≈1200`、`3392/DPR2≈1696` 折算，DPR 若不是 2 则 `46vh` 的实际像素高度会等比变化；
  ③"横拖两屏"在 Chromium 上是否**也**存在未逐条实测（根元素那条裁法在两种内核下都安全，故照样补上）。

## P-117（2026-09-18 任务书 P1-4 残留）"眉毛整组翻转"的**残留 b16** 结案：判据从"三角形有向面积变号"升级为**组级方向判据**（det<0 ⟺ 该组被镜像），并把变号基线从"首帧"改成 **bind 姿态** —— 残留被定性为**作者数据驱动的局部折面（非镜像）**，渲染器数学经第三方参考实现**五项对拍**判为正确

> **编号说明**：`## P-115`（`baseline-trend` 半截快照）与 `## P-116`（OPPO Pad 窄屏）已被同轮并行的两条线占用
> ⇒ 本节顺延取 **`## P-117`**（数字部分 117 ≥ 前一条 116 ⇒ 顺序非降规则满足）。
> **范围声明**：本节**没有改渲染路径的任何一行**（无 shader / 无 `gBones` 组装 / 无 draw 调用）——真正的视觉修复是
> **P-110**（bind 世界链序，已合并）。本节交付的是 ①**把"眉毛翻转"变成可判、可守、不会漏报的机器判据**；
> ②把残留 b16 的**根因钉死到作者数据的字节**上，并如实说明它为什么不是渲染器缺陷。

### P-117.0 一句话结论（三条，都是判据式）

1. **用户报的"整组翻 180°"在组级判据下不存在**：hina 3554161528 真动画 **271 帧**（t=0→9.0s，逐帧）× **28 个非退化骨组**，
   组方向行列式（`bind→蒙皮`最小二乘仿射）最小值 **0.935**、**没有任何一帧为负** ⇒ `mirrorGroups = 0`。
   把链序改回 P-110 之前的父先乘（`?bindorder=legacy`）⇒ 立刻变红：**2 个组被镜像**（b17 眉毛、b18 睫毛），
   minDet **−1.753** —— 判据抓的正是用户报的那一组。
2. **残留 b16 的 1/17 是"折面"不是"镜像"**：全 271 帧逐帧扫描，变号事件 **61** 个、只落在 **6 个三角形** 上，
   这 6 个三角形的 `bind→蒙皮` 组级 det 全程 ≥ **0.954**（从不为负）⇒ 它们是**局部塌陷/越过零面积**，不是整组方向反转。
   6 个三角形占整块网格面积的 **0.0005%–0.0025%**（合计 130 / 2 150 479 单位²），单帧"镜像面积"峰值 = **2.78e-3 %**（≈60 单位²）。
3. **驱动源是作者数据里的一帧跳变**：动画 1（240 帧）**轨 30（瞳孔骨 b30，父=b16）第 14→15 行平移跳 9.3976 px**
   （f14 =( −1.782, −2.358) → f15 =(−6.941, +5.496)，随后保持；该轨 241 行里**只有这 1 处** >3 px 的步长）。
   该跳变由**两种互相独立的寻址**从原始字节复核**逐位相同**（`maxΔ = 0`），且**第三方参考实现的采样语义**（`cur/frame_time` → 行号）
   在同一时刻读的就是这一行 ⇒ **不是我们的读法/合成/蒙皮算出来的**。

### P-117.1 现状数字（改前，命令 + 输出）

```bash
$ node tests/submesh-probe-test.mjs        # 既有探针（真包真动画，91 个时间点）
  ✓ 真动画下最大位移非平凡（b12 位移 24.57 skin 单位 @3.8s）
  ✓ 真动画下存在"组内三角形有向面积变号"（b16 最多 1/17 条 @0.5s）
  ALL PASS（56 通过 / 0 失败）              # ← 改前改后逐字相同（见 P-117.8 的"零改动"论证）
$ node tests/bind-order-test.mjs --report  # 既有链序台账（P-110 口径）
  b16 | 22/17 | 13.70@3.7s → 6.26@0.467s | 1/17@0.5s → 1/17@0.5s
  b17 | 11/8  | 29.36@8.533s → 14.06@8.5s | 8/8@0.267s → 0/8@0s
  b18 | 15/16 | 102.07@8.5s → 11.09@8.5s | 12/16@0.367s → 0/16@0s
  ALL PASS（76 通过 / 0 失败）
```

本轮**新增**的逐帧扫描（271 帧、每帧都算；不是每 3 帧采样）：

| 三角形 | 顶点 | 逐顶点权重（骨:权重） | bind 面积 | 占整网格 | 变号事件 | 变号期间 max\|面积比\| |
|---|---|---|---|---|---|---|
| 604 | 409,368,408 | `{b16:0.3459,b30:0.6541}` `{b16:0.9524,b16:0.0476}` `{b30:1.0}` | 24.30 | 0.0011% | 18（f15..f263） | **2.462** |
| 582 | 409,372,368 | `{b16:0.3459,b30:0.6541}` `{b16:0.7177,b30:0.2630,b16:0.0193}` `{b16:0.9524,b16:0.0476}` | 53.32 | 0.0025% | 14（f15..f261） | 0.897 |
| 590 | 407,417,422 | `{b16:0.9524,b16:0.0476}` `{b16:0.5728,b30:0.4272}` `{b30:1.0}` | 18.62 | 0.0009% | 8（f15..f258） | 0.238 |
| 622 | 410,419,411 | `{b16:0.6410,b30:0.3437,b16:0.0153}` `{b30:1.0}` `{b16:0.3703,b30:0.6297}` | 12.52 | 0.0006% | 8（f15..f258） | 0.314 |
| 592 | 417,407,428 | `{b16:0.5728,b30:0.4272}` `{b16:0.9524,b16:0.0476}` `{b16:0.7285,b30:0.2579,b16:0.0136}` | 11.18 | 0.0005% | 7（f15..f258） | 0.181 |
| 617 | 421,407,422 | `{b30:1.0}` `{b16:0.9524,b16:0.0476}` `{b30:1.0}` | 10.11 | 0.0005% | 6（f15..f257） | 0.110 |

**对 P-110 结论的一处细化（有证据）**：P-110 写"残余 61 个变号事件**全部**是多骨混合"。按逐顶点权重看，
**5/6** 个三角形确实含"权重跨 ≥2 根骨"的顶点（每顶点 LBS 插值剪切，如 tri 592 的 v417 = b16 0.5728 + b30 0.4272）；
但 **tri 617 的三个顶点各自只绑一根骨**（两个绑 b30、一个绑 b16），它的变号来自 **b16 与 b30 两个刚体位姿相互越过**
（`?submesh=` 的"严格归属"规则把它算进 b16 组）⇒ 残余的机器定性应写"**三角形跨 ≥2 根骨**"（而不是"每个顶点都混合"）。

**亚帧连续性（证明是"过零塌陷"而不是"跳变/镜像"）**：把 t 按 1/300 s 细分（`sampleCompositeAdditivePose` 的帧间插值），
tri 592 的面积比走 `1.0014 → 0.075 → −0.041 → −0.157 → …`（**连续穿过 0**），tri 604 穿到 **−2.46** 后再回正
⇒ 这是 LBS 的**体积塌陷/折面**（线性混合两个不同旋转的矩阵必然经过奇异），不是"镜像"。

### P-117.2 根因：作者数据（原始字节，两种独立寻址）

```bash
$ node /tmp/…（本轮临时脚本，逻辑已固化进 tests/submesh-mirror-test.mjs 的 T6）
  轨 30（瞳孔骨 b30）第 14→15 行存在一帧 9.4px 级跳变（独立寻址实测 9.3976px）
    f14=(-1.782,-2.358) f15=(-6.941,5.496)      ← f14 恰是 b30 的 bind 局部量；f15 起"跳过去并保持"
  每条轨的头 byteSize 都等于 segBytes=8676（= 241 行×36B ⇒ 独立布局自洽）  tracks=32
  两种独立寻址（本仓 `segs[b]+36f+8b` vs wer-ref 顺序布局 `[int32 flags][uint32 byteSize][N×36B]`）
    读到的字节**逐位相同**  [maxΔ=0]
  t=0 的 3 层 additive 合成逐位等于 bind 基准  [maxΔ=0]
```

- **两种寻址**：本仓用"首轨数据起点 + `36·f + 8·b` 交错式"，wer-ref 用"逐轨顺序读 `[8B 头][N×36B]`" ——
  两者覆盖全部 32 轨 × 240 行的每一个字节，**maxΔ = 0**。⇒ 跳变在**文件里**，不在读法里。
- **同一跳变会被参考实现同样采到**：`wer-ref src/backend/scene/internal/animation/WPPuppet.cpp:216-222`
  的采样是 `cur = fmod(cur, max_time); _rate = cur/frame_time` ⇒ 行号 = `floor(t·fps·rate)`，t=0.5s 时**就是第 15 行**
  （`src/backend/scene/internal/animation/WPPuppet.cpp:242-244` 的 `frame_position` 同式）；它对该行**不做**坏帧修正。

### P-117.3 渲染器数学的对照（第三方参考实现，只引行为结论、不取代码）

`wer-ref/`（Aromatic05/wallpaper-engine-renderer，**GPL-2.0-only**，非官方、非真值源；本仓库既有纪律：
**只作行为对照，不复制代码/注释/常量组织**）逐项对拍，**五项全部与我们一致**：

| # | 判据 | 参考实现（行为） | 我们 | 结论 |
|---|---|---|---|---|
| 1 | bind 世界链序 | `WPPuppet.cpp:167` `affine = parent * affine`（Eigen 列主序）= 子先乘 | `core/puppet-skin.js::bindWorldChain` 缺省 `matMulRow(local, parentWorld)` | **一致** ⇒ 独立复证 P-110 |
| 2 | `g_Bones` 组装 | `WPPuppet.cpp:191` `m_final_affines[i] *= bones[i].inv_bind.matrix()`（= `world × inv_bind`） | `bindInv × RT`（行主序语义等价） | **一致** ⇒ 复证 P-110.1 |
| 3 | 顶点属性布局 | `WPMdlParser.cpp:438`：alt 布局 stride `4×(3+4+4+2+7) = 80`，顺序 pos→7×u32→blendIndices(u32×4)→weights(f32×4)→uv | `core/attach-transform.mjs` 读 80B：pos@0、idx@40/44/48/52、w@56/60/64/68、uv@72/76 | **逐偏移一致** |
| 4 | 属性类型/蒙皮式 | `GenPuppetMesh`：`a_BlendIndices = UINT4`、`a_BlendWeights = FLOAT4`；官方着色器 `position' = mul(vec4(position,1), Σ w·g_Bones[bi])` | `MESH_VS`：`in vec4 a_BlendIdx/a_BlendWeight`、`sk += (p * u_Bones[bi]) * w`（w==0 跳过） | **一致** |
| 5 | additive 合成空间与基准 | `WPPuppet.cpp:135-160`：每骨**局部**量对**该轨 `frames[0]`** 取差分，按 `blend` 加权累加；基准 = 首个"有作者轨"的层 `frames[0]`（否则 bind） | `sampleCompositeAdditivePose`：`final += (层相位世界姿势 − 该动画帧0世界)×blend` | **在 hina 上等价**（该包首层 anim1 的 `frames[0]` 逐骨 == bind，T6 有断言） |

另外两条排除项（都带证据）：
- **不是 MDLV21"世界锚定骨骼"**：语料 puppet 模型头是 **`MDLV0023`**（`models/人物_puppet.mdl` 前 12 字节），
  而参考实现的判据是 `world_anchored_bones = (mdlv == 21)`（`PuppetSemantics.cpp:15`）⇒ 不适用，父相对链才是对的。
- **权重无需归一化**：497 个顶点里 `|Σw − 1| > 1e-4` 的有 **0 个**，最大偏差 **1.004e-05**
  ⇒ 官方着色器确实不做归一化，我们也不做，**不是**缺陷。
- **elysia 侧交叉验证不可用**（如实登记）：`elysia/we-renderer/puppet.js::_parseMdl` 对 hina 返回 **0 条动画**
  （它自己注释里记着"animations[1..] 的 id 读成 0/name 乱码"的同类问题）⇒ 本轮**没有**用它做独立解析对拍。

### P-117.4 改了什么（渲染路径**零改动**；改动全在 `?submesh=` 探针台账 + 一个新测试）

| 位置 | 改动 |
|---|---|
| `core/we-scene-bundle.js:6773-6782` | 新增 `?subbase=legacy` 的**唯一判定式** `SUB_BASE_LEGACY`（正则字面量，与既有 `?x=legacy` 同形；`diag-flag-check` 规则 c 抓取） |
| `core/we-scene-bundle.js:7832-7880` | 新增三个纯函数：`__subBindTriSign`（bind 逐三角形绕序符号）、`__subFitMat`（**每组一次**的 bind 位置法方程 3×3 求逆）、`__subFit`（由 6 个右端项算 2×2 线性部分行列式） |
| `core/we-scene-bundle.js:7994-8001` | 每层首次进入时建 `st.fit`（每组一个 3×3 逆；顶点 <3 或共线 ⇒ `null`，**不猜 det**） |
| `core/we-scene-bundle.js:8025-8060` | 组循环里**顺带**累计 6 个右端项（同一趟 `g.verts` 循环，**零额外遍历**）→ 算 `det`，累计 `detMin/detMinAt/detMirror`；`invert` 的基线改成 `table.triSign[ti]`（缺省）或 `rs.baseSign[k]`（`?subbase=legacy`） |
| `core/we-scene-bundle.js:8080-8103` | 每组新增 `orient:{det,minDet,minDetAt,mirror,nv}`；`summary` 新增 `mirrorGroups/mirrorBones/minDet/minDetGroup/minDetAt`；台账新增自描述字段 `base:'bind'\|'legacy'` |
| `tests/submesh-mirror-test.mjs`（**新**，38 断言，~0.9s） | T1 判据自证 / T2 用户可见不变量 / T3 RED-IF-REVERTED / T4 判据灵敏度反证 / T5 残余定性 / T6 根因钉死（原始字节两种寻址）/ T7 基线口径修正自证 / T8 全语料不回归 / T9 零副作用 |
| `tests/run-all-tests.sh:282-290` | 新项 `submesh-mirror` **追加在 `add` 列表末尾**（既有 86 行 `add` 一字未动 ⇒ 现 **87 项**） |
| `docs/README-DIAGNOSTICS.md:41` | 新增 `subbase` 行（7 列格式）⇒ `diag-flag-check` **148 == 148，0 差异**（P-114 时为 147） |
| 工作区根 `docs/MASTER-TODO.md` | **只改 P1-4 那一行**（写明已交付/已收口 + 仍未证实项），未改编号 |

**没有任何既有字段被改名/删除**：`invert`、`disp`、`hist`、`bbox`、`bones`、`chain`、`tri`、`summary` 的既有键全部原位保留，
新增键都是**只增**（`submesh-probe-test` 的 56 条断言未改一字仍全绿）。

### P-117.5 回退开关 `?subbase=legacy`（只改台账口径，不改画面）

- **缺省（修正口径）**：变号基线 = **bind 姿态**（顶点原始绕序，由 `mesh.positions` 算出）⇒ 台账回答
  "这一帧有没有三角形相对**绑定姿态**翻了"，与"探针从哪一帧开始记账"**无关**。
- **`legacy`** = P-109 旧口径：基线取**探针看到的第一个采样帧**。旧口径的**真实缺陷（实测）**：

| 会话（4 帧：0.267→0.367s） | 组级 det 判据 | 变号计数（bind 基线，缺省） | 变号计数（`?subbase=legacy`，旧） |
|---|---|---|---|
| 默认链序（P-110 修正后） | 0 个镜像组 | b17 **0/8** | b17 0/8 |
| `?bindorder=legacy`（= 那个 bug） | **2 个镜像组**（b17,b18） | b17 **8/8** ✅ 抓住 | b17 **0/8** ❌ **整个漏报** |

> 为什么旧口径会漏：这 4 帧**整段都落在翻转窗口内**（legacy 序下 b17/b18 的 det<0 覆盖 f7..f23），
> 首帧基线本身就是"已翻过去"的符号 ⇒ 后面每一帧与它一致 ⇒ 计数 0。**基线必须锚在 bind 姿态**上，
> 这条与 P-110"静止帧不能判序、要用刚性/绕序判据"是同一类教训。

### P-117.6 反向变异必红（两条，各自指名失败的断言）

**（a）把渲染器的链序改回去**（用现成开关 `?bindorder=legacy`，即 P-110 之前的父先乘）⇒ 新测试的**红项**：

```
  ✗ legacy 序 ⇒ 判据变红：0 个组被镜像            ← 正常应为 2
  ✗ legacy 序下**眉毛组 b17** 就在被镜像的组里
  ✗ legacy 序下最差组 det 明显为负（= 真的翻过去，不是塌陷）：minDet=-1.75321739 @b18
  ✗ b17 的 orient.mirror=true、minDet<0（逐组字段可定位到具体骨）：minDet=-1.45521272 @8.5s
```
（红项同轮实测：`mirrorGroups=2`、`mirrorBones=[17,18]`、b18 变号 12 条 @0.367s —— 与 P-110 记录的 b18 12/16 同量级。）

**（b）把"基线口径"变异回旧缺省**（临时副本里把 `SUB_BASE_LEGACY` 的判定式换成 `return true`）：

```
  ✗ 台账自描述基线口径（缺省 = bind）              [base=legacy]
  ✗ 口径自描述：`?subbase=legacy` 时台账 base=legacy，缺省 base=bind   [legacy / legacy]
  ✗ bind 基线（缺省）：这 4 帧里 b17 **全翻**被抓住（0/8）
  FAILED 3（35 通过 / 3 失败）
```

**（c）把"判据"变异成空断言**（临时副本里把 `det` 恒置 1）⇒ 6 条红（证明 T2/T3/T4 不是"永远绿"）：

```
  ✗ legacy 序 ⇒ 判据变红：0 个组被镜像            [mirrorBones=[]]
  ✗ 合成镜像（骨 16 矩阵第一行取负）⇒ 恰好 1 个组被判镜像且就是 b16   [[] minDet=1]
  FAILED 6（32 通过 / 6 失败）
```

### P-117.7 全语料不回归（新判据 + 既有对账口径）

| 包 | 层/模型 | 骨 | 组 | 真动画帧 | `mirrorGroups` | minDet | maxInvert | maxDisp |
|---|---|---|---|---|---|---|---|---|
| 3554161528 hina | 人物 | 32 | 29 | 271（t=0→9s） | **0** | 0.935（b17） | 1（b16，折面） | 24.59 |
| 3544152633 girl | girl | 13 | 13 | 61（t=0→2s） | **0** | 0.954（b11） | 0 | 103.96 |
| 3327063360 伊蕾娜 | 伊蕾娜 | 2 | 2 | 61 | **0** | 0.907（b1） | 10（b0） | 119.44 |
| 3719111841 凯尔希 | 主体 | 6 | 6 | 61 | **0** | 0.985（b3） | 0 | 54.75 |
| 3326873240 | 0 个带 puppet 的模型 | — | — | — | — | — | — | 探针无物可测（62 层） |
| 3660962877 伊蕾娜 | 0 个带 puppet 的模型 | — | — | — | — | — | — | 探针无物可测（127 层） |

既有对账口径（本轮**未新造 harness**，全用仓内既有命令）：见 P-117.9 的门禁逐项（`layer-rect-kal` / `projection-y` /
`mock-gl` / `parity-check` / `package-matrix --check` / `skin-order-kal` / `render-audit-kal` / `bind-order` / `submesh-probe` 全 PASS）。

### P-117.8 为什么"渲染路径零改动"是可证的

新增代码全部落在 `SUB_WANT`（`?submesh=`）非空才执行的块里，且**不触碰** `drawElements` 尾部：
- 既有 `submesh-probe-test` 的**反向变异**断言（把整段 P-109 探针从源码里删掉 → GL 调用序列必须逐条相同）**未改一字仍绿**；
- 新测试 T9：`?submesh=all` vs `?submesh=all&subbase=legacy` 的 **GL 调用序列（42 条）与 `drawElements` 实参逐条相同**；
- 默认（不开 `?submesh=`）⇒ `globalThis.__mpwSubMesh` 仍**不写**（`off.ledger === undefined` 有断言）。

### P-117.9 门禁（本补丁的实测记录）

> ⚠ **本会话没有跑全量门禁**（如实登记，不是省略）：本轮宿主机**两次因并发无头浏览器把 15GB 内存压死而整机重启**，
> 恢复后的资源硬约束是"**禁止本会话跑 >60s 的重活**（`run-all-tests.sh` / `package-matrix` / `glsl-validate`），
> 重活由主对话全局排队"。**主对话的那次全量门禁已包含本项**（本会话从 `/tmp/run-all-tests-last.log` 读到）：

```
== PASS submesh-mirror
  ✓ 不开 `?submesh=` ⇒ `globalThis.__mpwSubMesh` 仍不写（新增判据也走同一开关，零副作用）
  ALL PASS（38 通过 / 0 失败）
```

**本会话实际跑过的单项**（全部 **rc=0**，每项秒级；命令逐字如下，可复现）：

| 命令 | 退出码 | 读数 |
|---|---|---|
| `node --check core/we-scene-bundle.js` | 0 | 语法 OK |
| `node tests/submesh-mirror-test.mjs` | 0 | **38 通过 / 0 失败**（本补丁新增） |
| `node tests/submesh-probe-test.mjs` | 0 | **56 通过 / 0 失败**（既有，未改一字） |
| `node tests/bind-order-test.mjs` | 0 | **76 通过 / 0 失败**（既有，P-110 口径） |
| `node tests/mock-gl-test.mjs` | 0 | 60 通过 / 0 失败 |
| `node tests/docs-check.mjs` | 0 | 16 文档 / 568 文件引用 / P-编号健康 ✓ / diag-flags ✓ |
| `node tests/diag-flag-check.mjs` | 0 | **代码 148 == README 148，0 差异**（P-114 时 147） |
| `node tests/projection-y-test.mjs` | 0 | 49 通过 / 0 失败 |
| `node tests/p76-parallax-eye-test.mjs` | 0 | 111 断言通过 / 0 失败 |
| `node tests/skin-order-verify.mjs 3719111841 主体` | 0 | `bindInv×W` 到枢轴最大误差正常 |
| `node tests/render-audit.mjs 3719111841` | 0 | mesh 回调命中 5/5 层 ✓ |
| `node tests/layer-rect-check.mjs 3719111841 --refrender` | 0 | 与官方标定对账通过 |
| `node tests/parity-check.mjs` | 0 | 2 场景对账完成，无越界差异 |
| `node tests/attach-transform-test.mjs` | 0 | ALL PASS |
| `node tests/render-closeout-test.mjs` | 0 | 22/22 通过 |

**未在本会话跑的项及理由**（由主对话排队）：`package-matrix --check`（58s，重活）、`glsl-validate`（真编译 128 作业，重活）、
`hlsl2glsl-coverage`/`hlsl2glsl-wiring`（与本补丁无关，上一轮 P-114 已绿）、其余非蒙皮项（零影响面）。
**本补丁对渲染路径零改动**（P-117.8 有三条结构性断言），故这些项的结论不受影响；但按纪律**不把它们算作本轮的验收证据**。

### P-117.10 未证实 / 未做（不猜）

1. **真机像素未验**：本机**无 GPU**（无 `/dev/dri`；无头 Firefox `AllowWebgl2:false`；Chromium+SwiftShader 在 PRoot 下挂起），
   且本轮**按纪律未启动任何浏览器**（宿主机两次因并发无头浏览器被压死）。所以"这 6 个三角形的塌陷/镜面在屏幕上**看不看得见**"
   **未证实**。可算出的量级供参考：最坏的瞬时镜像面积 ≈ **60 单位²**（≈ 8×8 设计像素 @1:1），每 8 s 周期出现 **≤6 帧**（≈0.2 s）。
2. **官方二进制同帧是否也跳**未证实：只对拍到**第三方参考实现**的采样语义（行号 = `floor(t·fps·rate)`、不做坏帧修正），
   没有官方 WE 可执行文件可跑（不可再分发）。
3. **判据的覆盖面**：`orient.det` 判的是**几何方向**（镜像）；若某子网格是** UV/贴图侧**被翻（几何不变），本判据**抓不到**。
   本文所示的面部是**一整块 497 顶点网格 + 一张贴图**（`materials/人物.tex`），"逐子网格 UV 翻转"只可能来自作者数据，
   本轮**未**排查（无官方渲染可作对照）。
4. **wer-ref 的 `replace_base_frame` 规则未采纳**：它的 additive 基准取"首个有作者轨的层的 `frames[0]`"（不是 bind）。
   对 hina 是**零差异**（首层 anim1 的 `frames[0]` == bind）；但对"帧 0 ≠ bind"的包（P-110.6 第 3 条：龙 anim0 差 1472.69 px）
   会改变结果 ⇒ 属**另一条线**（会改全部 puppet 包的画面），本轮**只记录、不动手**。
5. **坏帧检测器没动**：anim1 轨 30 的这处单帧跳变，`detectBadAnimFrames` 的 B 段判据用的是**逐骨求和后的签名** `sig`
   （骨骼间会互相抵消）⇒ 没被标成坏帧、因而没有跨帧插值。但"把逐骨步长也纳入坏帧判据"会**改变所有 puppet 包的动画采样**
   （= 画面变化），不在"视觉正确性修复"的安全范围内 ⇒ 本轮**只登记**（新测试 T6 会把这条数据钉住，将来谁要改判据有现成靶子）。
6. **elysia 移植侧仍未对拍**（P-110.6 第 1 条继续挂）：其 `_parseMdl` 对 hina 返回 0 条动画（它自己的 MDLA 头解析问题）
   ⇒ 本轮**没能**用它做独立解析器交叉验证；已改用"两种独立寻址 + 第三方参考实现语义"替代。

### P-117.11 本轮改动的文件清单（提交只含这些）

```
core/we-scene-bundle.js        （+106/-5：全部在 ?submesh= 探针块内）
tests/submesh-mirror-test.mjs  （新增，38 断言）
tests/run-all-tests.sh         （末尾追加 1 项 add）
docs/PATCHES.md                （本节）
docs/README-DIAGNOSTICS.md     （新增 subbase 行）
<工作区根>/docs/MASTER-TODO.md  （只改 P1-4 一行）
```

## P-118（2026-09-18 任务书 §7-H 指针跟随线）`lockToPointer`（指针跟随粒子/鼠标拖尾）在**出货页面里一次都不发射**的根因 = 自举死锁；外加两条同源缺陷（注入通道盖过画布 `pointerleave` / `inside:false` 回落到旧坐标）

**一句话**：渲染器把"装指针钩子"这件事**挂在了"本帧已经有指针"上**，而"有指针"又只能来自"钩子已装"或"宿主注入"；
全仓库 `window.__mpwPointer` **零生产者** ⇒ 出货页面（`demo.html` → 服务器路由 ./bundle.js = `core/we-scene-bundle.js`）里
`controlpoint[].flags:1`（lockToPointer）发射器**从来没发射过** —— "鼠标拖尾"这个壁纸特性整条是死的（不是"偶尔不动"）。

### P-118.1 现象与复现（修复前，逐字实测输出）

复现载体 = `tests/pointer-leave-test.mjs`（假 DOM + mock-GL + 真 `createRenderer`，无浏览器/无 GPU；本机 Node 24）：

```
$ node tests/pointer-leave-test.mjs --only G4 --no-mutation      # 出货页面的加载路径（不注入）
  ! XFAIL（已知缺口·不计票） G4 未注入时画布 pointermove 也能让 lockToPointer 层发射（DOM 路径应能自举）
      — 实测 alive=0、画布监听器=[]（派发命中 0 个监听器）…
$ node tests/pointer-leave-test.mjs --only G1 --no-mutation      # 宿主注入 + 画布 pointerleave
  ! XFAIL（已知缺口·不计票） G1 … — 离开后累计 39→54（仍在发射；基准点=[800,400]）…
  ✓ G1b 同一发 pointerleave 在注入撤掉后**立刻生效**（事件确实到达…）
$ node tests/pointer-leave-test.mjs --only G5 --no-mutation      # 宿主注入 inside:false + 画布有旧坐标
  ! XFAIL（已知缺口·不计票） G5 … — inside:false 后累计 189→276、基准点=[1439.9999749660506,810.0000047776848]…
```

三条与任务书描述**逐字一致**（G4：0 监听器 0 粒；G1：39→54 且仍 (800,400)；G5：189→276 且仍 (1440,810)）。
关键区别：G1 的那发 `pointerleave` 在**注入撤掉后立刻生效**（G1b ✓）⇒ 事件确实到达了，是**优先级**把它盖住的，不是事件没到。

### P-118.2 三条根因（file:line 均为修复前）

| # | 位置（修复前） | 根因 |
|---|---|---|
| G4 | `core/we-scene-bundle.js:9560` `if (!CURSOR_OFF && __ptrNow) __hookPointer()` | **自举死锁**：`__ptrNow = __pointerDesign(cam)` 只能来自 ① 宿主注入 `window.__mpwPointer` 或 ② 画布钩子已装后记下的归一坐标；而钩子只能由这一行装上 ⇒ 不注入就永远装不上。全仓库 grep `__mpwPointer` 的**生产者为零**（`demo.html` 里那个 window `pointermove` 是日志面板拖动）⇒ 出货页面走的就是这条死路。 |
| G1 | `core/we-scene-bundle.js:6651`（旧）`if (inj && inj.inside !== false && …) return [inj.x, inj.y]` 先于 `__pointerN` | **注入无条件优先**：画布 `pointerleave` 只清 `__pointerN`，注入值原封不动 ⇒ 宿主按"每次 pointermove 就写注入值"这种自然写法喂坐标时，人把鼠标移出画布后**发射器继续在旧坐标发射**。 |
| G5 | `core/we-scene-bundle.js:6665`（旧）`if (__pointerN && cam) return __pointerDesignFromNorm(…)` | `inside:false` 只被读成"**别信注入值**"，随后**回落到上一次画布内 `pointermove`** 的归一坐标 ⇒ 宿主用 `inside` 声明"指针不在画布内"时，发射器继续在旧画布坐标发射（只有"画布从没记过坐标"时才真的停）。 |

（门控落点未动：`core/we-scene-bundle.js:3346-3347` `em.__ptrLocked && !__P ⇒ sys.__ptrSkipped++ / 不发射`。`?cursor=off` 语义未动。）

### P-118.3 改法（**两条输入源分开判**，不是把 `__ptrNow` 恒为真）

| 位置（修复后） | 改动（一句话） |
|---|---|
| `core/we-scene-bundle.js:6666` | **G4**：`if (!CURSOR_OFF) __hookPointer()` —— **建渲染器即装 DOM 钩子**，与"本帧有没有指针"解耦（`?cursor=off` 下不装、也不发射，逃生口语义一字未改）。 |
| `core/we-scene-bundle.js:9600/9604` | **G4**：每层那处从 `if (!CURSOR_OFF && __ptrNow) __hookPointer()` 改成 `if (!CURSOR_OFF) __hookPointer()`（幂等兜底：函数首行 `if (__pointerHooked) return`）。 |
| `core/we-scene-bundle.js:6631/6638` | 新增 `__injectedPointer()`（`window.__mpwPointer` → `globalThis.__mpwPointer`，与旧内联式同序）与 `__injKey(inj)`（`x\|y\|inside` 指纹），供两个通道各自判定；**注入通道的读取口只有这一处**。 |
| `core/we-scene-bundle.js:6652` | `pointermove`/`pointerdown` 记录归一坐标时顺带清 `__pointerGone`（画布又收到新坐标 ⇒ "已离开"作废）。 |
| `core/we-scene-bundle.js:6657` | `pointerleave` 除清 `__pointerN` 外，记下"**已离开** + 那一刻注入值的对象引用与指纹"（`__pointerGone/__pointerGoneInj/__pointerGoneKey`）。 |
| `core/we-scene-bundle.js:6644-6646` | `__hookPointer()` 挂不上元素时**不再置位** `__pointerHooked`（旧写法先进门就置位 ⇒ 之后即使元素可用也永不再试）。 |
| `core/we-scene-bundle.js:6686` | **G5**：`if (inj && inj.inside === false) return null` —— 显式"不在画布内"直接停发，**不回落到任何缓存坐标**。 |
| `core/we-scene-bundle.js:6691` | **G1**：注入值与 `pointerleave` 那一刻**同一份**（同对象 + 同指纹）⇒ `return null`（DOM 的"已离开"优先于注入旧值）；注入变了 ⇒ `__pointerGone = false` 当新证据接受（纯注入的台子不会被一发 stray `pointerleave` 永久锁死）。 |

优先规则（`core/we-scene-bundle.js:6600-6605` 注释里写全，README-DIAGNOSTICS `cursor` 行同步）：
**宿主显式 `inside:false` ⇒ 无指针** > **画布已宣告离开且注入没变 ⇒ 无指针** > **注入（变了/在场）** > **画布归一坐标** > null。

### P-118.4 判据（断言 + 实际读数）

原三条 XFAIL **改成真断言**（`ok()`，不再是缺口），并各补一条方向性断言：

| 断言 | 内容 | 实测（修复后） |
|---|---|---|
| `G4a ★` | **第一帧之前**画布钩子就已装上（不注入任何指针） | 监听集合 `["pointermove","pointerdown","pointerleave"]`（修复前 `[]`） |
| `G4b ★` | 未注入 + 画布 `pointermove(960,540)` ⇒ 真发射且基准点 = (960,540) ±1px | alive=8、命中 1 个监听器、ptr=[960,540] |
| `G1 ★` | 注入在场 + 画布 `pointerleave` ⇒ 累计冻结、指针 null、alive=0 | 累计 39→39、ptr=null（修复前 39→54、(800,400)） |
| `G1b` | 同一发 leave 在注入撤掉后立刻生效（G1 是优先级问题） | ptr=null alive=0（未改） |
| `G1c` | 注入**变了** ⇒ 恢复认注入（不会永久锁死纯注入台子） | ptr=[320,240] alive>0 |
| `G5 ★` | `inside:false`（画布有旧坐标）⇒ 累计冻结、指针 null、alive=0 | 189→189、ptr=null（修复前 189→276、(1440,810)） |
| `D4b` | `?cursor=off` 下**连钩子都不装**（一个监听器都不加） | `listeners.size === 0` |
| `A0/A1/A2/A3/P3/P4/D1/D2/D4/E1–E5` | 既有 35 项（无指针不发射 / 画布内发射与坐标 / 离开后冻结 / 重新进入恢复 / `?cursor=off` / 真包 id389） | 全部未改，全绿 |

```
$ node tests/pointer-leave-test.mjs
(计票：pass=45 fail=0 skip=0 xfail=2 xpass=0)
已知缺口 XFAIL 2 条（不计票；P-118 已闭合 G1/G4/G5 三条…）：等价路径未监听（pointerout）/ 页面级离开未监听（blur·visibilitychange）
ALL PASS （45 项，另记录缺口 2）        # rc=0，0.85s；其中 8 项 = 内置红-if-reverted（4 变异 × 2）
```

**缺口表仍在工作**：`G2`（`pointerout`+`relatedTarget=null` 等价路径未监听）与 `G3`（`blur`/`visibilitychange`
页面级离开未监听）**仍是 XFAIL**（本轮未修，两条的 XFAIL 输出照旧打印）⇒ 断言/缺口两个方向都出声，没有静默。

### P-118.5 red-if-reverted（真跑到；每处修复各一条"改回旧写法"）

隔离副本：`mkdtemp` + **逐文件真副本**（`readFileSync`/`writeFileSync`；用 `statSync` 判类型 —— 本机 `fs.cpSync` 抛 EINVAL、
`Dirent.isFile()` 有误报），子进程用 `MPW_POINTER_BUNDLE=<副本>` 跑同一测试文件。两个独立入口都跑过：
① 测试文件内置 M 阶段（`node tests/pointer-leave-test.mjs`，8 项自检全绿）；② `/tmp/p118-red-if-reverted.mjs`（独立脚本，再跑一遍并额外核对真树未动）。

| 变异 | 改回旧写法 | 子进程 | 变红的断言 |
|---|---|---|---|
| M1-G4 | 拆掉"建渲染器即装钩子" + 帧内恢复 `if (!CURSOR_OFF && __ptrNow) __hookPointer()` | rc=1 | `✗ G4a`（监听集合回到 `[]`） |
| M2-G1 | 注入分支去掉"与 `pointerleave` 那一刻同一份"判定 | rc=1 | `✗ G1 ★`（39→54） |
| M3-G5 | 去掉 `inside === false ⇒ null`，并把 `inside !== false` 加回注入条件 | rc=1 | `✗ G5 ★`（189→276）；`D1b` 仍 ✓ ⇒ 只打破被点名那条 |
| M4 | `pointerleave` 处理器改成空操作 | rc=1 | `✗ P3a`（离开后 63,71,79 一直在发射） |

四个变异里 `A3a`/`P4a`（绿前提：画布内发射 + 重新进入恢复）**仍为 ✓** ⇒ 变异只打破被点名的那条语义，不是把整条路弄挂。
独立脚本 `node /tmp/p118-red-if-reverted.mjs` ⇒ **rc=0，4/4 全红**，且 **真树未被改动**：
跑前/跑后 `git status --porcelain` 全等（28 行，含 20+ 条别人的未提交改动）+ `core/*.{js,mjs}` 8 个文件 sha256 全等 +
`core/we-scene-bundle.js` sha256 = `cd0c510916d0e7f88664422d4270fb8a5342b57c6810a571462bb975e662b3ca`。

**无回归**（全部 rc=0，逐个秒级）：`node tests/pointer-leave-test.mjs`（45 项 + 2 缺口）、`node tests/mock-gl-test.mjs`
（60 通过 / 0 失败）、`node tests/display-options-test.mjs`（71 断言）、`node tests/web-frame-geometry-wiring-test.mjs`、
`node tests/diag-flag-check.mjs`（**代码 148 == README 主表 148，0 差异**）、`node --check core/we-scene-bundle.js`。

### P-118.6 未证实 / 未做（不猜）

1. **真机鼠标时序未测**（本轮硬约束：禁浏览器 ⇒ 无 X11、无 GPU/WebGL2）：`pointerleave` 与"最后一发 `pointermove`"的
   真实先后、触摸（`pointerup` 后紧接 `pointerleave`）时的观感、以及**宿主是否在指针离开画布后仍持续写 `__mpwPointer`**
   —— 都只有**合成事件**证据（假 DOM）。真机行为需主对话排队（浏览器/真机项不在本会话权限内）。
2. **宿主持续写"新对象但同坐标"时 G1 的判定未定**：本轮把"注入变了（换对象或换数值）"当新证据 ⇒ 若某宿主每帧都
   `window.__mpwPointer = {x,y,inside:true}` 新建对象、且坐标与离开前相同，本实现会**重新认注入**（继续发射）。
   仓库内**没有**这样的生产者（`demo.html` 零注入；`package-matrix`/`projection-y-test` 是 Node 侧一次性注入、不发 pointerleave），
   真机宿主是否有这种写法**未证实** ⇒ 若真机复现"移出画布仍在发射"，第一刀就砍这条（把判据收紧成"只认数值变化"或"只认画布 `pointermove`"）。
3. `pointerout`（`relatedTarget=null`）与 `blur`/`visibilitychange` 两条等价"离开"路径**本轮未修**（仍是 XFAIL G2/G3）。
4. 出货页面 `demo.html` 的真实浏览器里"鼠标拖尾**看得见**"未验证（无 GPU/浏览器）——本轮只把"发射器会发射"这一层
   用 mock-GL 钉住（粒子出生点在指针附近、`?cursor=off` 仍能杀）；像素/观感属真机项。

### P-118.7 本轮改动的文件清单（提交只含这些）

```
core/we-scene-bundle.js        （+51/-7：指针源判定 + 自举；其余路径零改动）
tests/pointer-leave-test.mjs   （G1/G4/G5 三条 XFAIL → 真断言 + G1c/D4b/G4a 新断言 + M 阶段改成 4 变异）
docs/PATCHES.md                （本节 P-118）
docs/README-DIAGNOSTICS.md     （只改 `cursor` 行的口径与代码位置；**未新增 URL 开关**）
```

未登记项：`tests/run-all-tests.sh` 里**仍没有** `pointer-leave` 这一项（该文件本轮被另一条线占用/dirty，按纪律不改它）⇒
待办照旧：`add "pointer-leave" "node tests/pointer-leave-test.mjs"`（等它释放）。重活（`package-matrix --check`、
`glsl-validate`、`run-all-tests.sh`）本会话**未跑**（>60s 硬约束）⇒ 由主对话排队。

## P-119（2026-09-18 用户要求）测试台页签改成**互斥的独立页面**（去掉左右滑动与 340ms 过渡）+ 窄屏面板降高让"壁纸首屏可见"

**用户原话**：「左右切换的效果去掉 变成一个个页面(不要加载过程)」；另补充「我平板使用浏览器是给它横过来的」（横屏优先）。

### P-119.1 原来是什么样、为什么真机上会"整页空白"

三个页签（控制台 / 说明 / 壁纸设置）原本是**一条 300% 宽的横排轨道** `#pages-track`，靠
`transform: translateX(-(100/3)·i%)` 切换，`transition: transform .28s`；切页后还要等 **340ms 定时器**
才把非当前页 `visibility:hidden`（补丁里那句注释自己写着："否则控制台页里那个 iframe（壁纸）会**盖在**
「说明 / 壁纸设置」页上面 —— 真机实测那两页整个空白"）。⇒ 那 340ms 就是用户说的"**加载过程**"。

### P-119.2 改法（页签）

| 位置 | 改前 → 改后 |
|---|---|
| `demo/index.html:52`（静态首屏表） | `#pages-track{…width:300%;display:flex;transition:transform .28s…}` → `width:auto;display:flex;flex-direction:column;transform:none!important;transition:none!important` |
| `demo/index.html:53` | `.page{flex:0 0 calc(100%/3)}` → `.page{flex:1 1 auto;width:100%}`（一页 = 整屏一页） |
| `demo/index.html:54` | `#site-tab-ink{transition:transform .26s,width .26s}` → `transition:none`（下划线不再滑动） |
| `demo/bench-patch.js` `setPage()` | 删掉 `track.style.transform = translateX(...)` 与 340ms `setTimeout` 定时器；改成对三页逐个 `display:''`（当前页，交回样式表：窄屏控制台页是 `block`、其余是 `flex`）/`display:'none'`（其余页）+ `aria-hidden`；轨道只写 `data-active` |
| `demo/bench-patch.js` | `pageHideTimer` 变量与"先全部 visible"那段一并删除（不再有任何定时器）；切页后主动 `dispatchEvent(new Event('resize'))` 一次，让目标页里的 iframe/画布立刻按真实尺寸重算 |
| `demo/bench-patch.js` SITE_LAYOUT_CSS | 三条 CSS 与静态表**同步改**（D8 逐条比对要求两处一致） |
| 版本标记 | `bench-shell 2026-09-18b` → **`2026-09-18a`**（真机核对"我现在到底是哪一版"） |

**为什么用 `display` 而不是继续 `visibility`**：`display:none` 的页**不占布局也不参与合成**，iframe 不可能
再盖住别的页（P-119.1 那个真机 bug 的根因消失）；而且 iframe/画布**不重建** ⇒ 没有加载过程，
切回来时浏览器给 iframe 发一次 resize，渲染器按新尺寸自行重算（下面有实测）。

### P-119.3 顺带：窄屏面板降高（横屏"壁纸首屏可见"）

窄屏堆叠时侧栏与属性栏原来各占 `max-height:34vh` ⇒ 横屏 980×690 下两栏 + 工具栏把舞台挤到折叠线以下
（实测舞台可见高度只有 **133px / 317px = 42%**）。改成 `max-height:clamp(140px,22vh,320px)`（仍可滚动）。

### P-119.4 验收（单浏览器实例、5 视口 + 页签行为，跑完即关；无 GPU ⇒ 只有几何/computed-style，无像素结论）

```
── A. 页签（980×690 横屏桌面模式）
   版本=bench-shell 2026-09-18a | 轨道 display=flex flexDirection=column 宽=980 scrollW=980 transition=0s transform=none
   下划线 transition=0s | 初始三页：#page-console=block #page-docs=none #page-wpset=none
   点「说明」后**同 tick**：docs=flex console=none wpset=none transform=none      ← 无中间态、无定时器
   切到「壁纸设置」→ 回「控制台」：iframe=564.3×317.4 舞台=564×317               ← iframe 往返正常
── B. 视口矩阵（窄屏标志 / 舞台可见覆盖 / 缩放框不超宽 / 可见溢出 / 横向不滚）
   平板横屏(真实) 980x690   窄=true 舞台=980x333(可见244) 缩放框=564x317 覆盖=77% 溢出=0  ✓
   平板横屏(矮) 980x600     窄=true 舞台=980x292(可见178) 缩放框=491x276 覆盖=64% 溢出=0  ✓
   平板竖屏 980x1387        窄=true 舞台=980x666(可见666) 缩放框=964x542 覆盖=123% 溢出=0 ✓
   正常手机 412x915         窄=true 舞台=412x439(可见265) 缩放框=396x223 覆盖=119% 溢出=0 ✓
   桌面 1440x900            窄=false 舞台=820x474        缩放框=796x448 覆盖=106% 溢出=0 ✓
```

（改前同一脚本：980×690 覆盖 **42%**、980×600 覆盖 **35%**；桌面 1440 各值与改前逐值相同 ⇒ 宽屏零回归。）

### P-119.5 未证实

- 无 GPU ⇒ 「壁纸在真机上是否**继续渲染**（切页时被浏览器节流/暂停）」未测；只证明了 iframe 尺寸与生命周期正常。
- 真机（Via/Chromium）像素与观感未测；本机只有无头 **Firefox** 的几何/computed-style。
- 键盘 `←/→` 在页签上的快捷键保留（ARIA tablist 惯例），但它现在是"瞬时切页"，不再有滑动动画。

## P-120（2026-09-18 任务书 P1-1）带 `origin.script` 的相机对象**真的跑脚本** —— 相机取景不再用静态快照

**一句话**：语料 14 个相机对象的 `origin` 是 `{script:…, value:…}`（作者原意 = 按用户属性滑块算镜头位置），
渲染器此前只认 `{animation}` ⇒ 这 14 个包的相机脚本**一次都没跑**；现在相机解析路径用**既有脚本宿主**
（`elysia/scene-scripts.js`）的求值结果代替静态 `.value`，并按输入签名重算、失败回退快照且留痕。

### P-120.1 现象与复现（先证差异真实存在；命令 + 数字）

```
$ node tests/camera-script-origin-probe.mjs          # rc=0，14/14 命中，~1.1s，峰值 RSS 111MB
── 速览：包 id → 对象 id → 静态/求值 origin → Δ ──（节选；14 行全表见该工具输出/JSON）
   0917/3448877775                    id=1297271  static[2434.38477 725.25134 500.00000]  eval[0.000000 0.000000 500.000000]  Δ x −2434.38477  y −725.25134
   0917/3462491575                    id=1297271  static[2434.38477 725.25110 500.00003]  eval[0.000000 0.000000 500.000030]  Δ x −2434.38477  y −725.25110
   dd/3326873240                      id=1297271  static[2434.38477 725.25134 500.00000]  eval[0.000000 0.000000 500.000000]  Δ x −2434.38477  y −725.25134
   dd/3327063360                      id=1297271  static[2434.38477 725.25116 500.00000]  eval[0.000000 0.000000 500.000000]  Δ x −2434.38477  y −725.25116
   dd/3470764447                      id=1297271  static[2434.38477 725.25134 500.00000]  eval[0.000000 0.000000 500.000000]  Δ x −2434.38477  y −725.25134
   wallpaperE/other/…【time_variation_时间变化】…    id=1297271  static[2434.38477 725.25134 500.00000]  eval[0.000000 0.000000 500.000000]  Δ x −2434.38477  y −725.25134
   wallpaperE/伊蕾娜/…day_night                     id=1297271  static[2434.38477 725.25134 500.00000]  eval[0.000000 0.000000 500.000000]  Δ x −2434.38477  y −725.25134
   wallpaperE/流萤/…【customize自定义】…            id=1297271  static[2434.38477 725.25110 500.00003]  eval[0.000000 0.000000 500.000030]  Δ x −2434.38477  y −725.25110
   wallpaperE/砂狼白子/砂狼白子11_03                 id=1297271  static[2434.38477 725.25116 500.00000]  eval[0.000000 0.000000 500.000000]  Δ x −2434.38477  y −725.25116
   wallpaperE/遐蝶/…The Etern                       id=1297271  static[2434.38477 725.25110 500.00003]  eval[0.000000 0.000000 500.000030]  Δ x −2434.38477  y −725.25110
   wallpapertest1/夜莺Night/夜莺night/…（4 个 .mpkg）  id=1297271  static[2434.38477 725.2511x 500.0000x]  eval[0.000000 0.000000 500.0000xx]  Δ x −2434.38477  y ≈ −725.2511
   ⇒ 14/14 同一段 781 字符脚本（sha256 151da98895ccdaed…），脚本自定义属性 {"x":{"user":"x3","value":0.5},"y":{"user":"y1","value":0.5}}
     脚本正文：value.x = scriptProperties.x * engine.canvasSize.x（y 同理）
```

**"今天渲染器实际用的 origin"是什么**（这句话必须说准）：这 14 个包的 `origin` 是 `{script,value}` 而不是
`{animation}` ⇒ `cameraNode.active === false` ⇒ `renderScene` 的相机姿态分支**根本不进** ⇒ **施加的平移是 0**
（既不是静态快照、也不是脚本值）。静态 `.value` 只在两处被读到：`?cam=node` 的强制 A/B（`camera-pose-test` ⑤
实测非满幅层 Δx −2434）与透视档的节点锚定（`buildCamera` 的 `cStat`，这 14 个正交包用不到）。
因此本次改动**不是**"把静态快照换成脚本值"，而是"**把这个从未接线的相机 origin 按脚本接通**"：

| 档 | 改动前施加的相机 origin | 改动后 |
|---|---|---|
| 14 个脚本相机包（默认档 `full`） | 无姿态（平移 0；静态快照只被 `?cam=node` 用） | 宿主求值结果（默认 userProps 下 = `0 0 500` ⇒ 平移仍为 0；滑块一动镜头就动） |
| `?cam=node`（既有 A/B 开关） | 施加快照 `2434.38477 725.25116 500`（−2434px） | **不变**（`camera-pose-test` ⑤ 逐字同输出） |
| `3554161528`（唯一关键帧相机） | `{animation}` 关键帧 | **不变** |
| `3509243656`（唯一静态字符串 origin / 透视） | 作者静态 `0 0 6` 节点锚定 | **不变** |

### P-120.2 根因（file:line 为改动前）

1. `core/we-scene-bundle.js:1515`（改前）`const animated = !!(o.origin && typeof o.origin === 'object' && o.origin.animation)`
   —— 相机节点"激活"的唯一判据是**关键帧**；`{script,value}` 既不是 `animation` 也没有任何其它落点。
2. `core/we-scene-bundle.js:8490`（改前）`if ((__camposeMode === 'full') && (camNode.active || force))`
   —— 姿态分支把脚本相机挡在外面；`:8496` 的 `?cam=node` 静态回退还写着"实测 −2434px，默认不碰"。
3. `elysia/scene-scripts.js` 的 `applySceneScripts` **本来就会**跑相机对象上的 `{script,value}`（`collect()` 扫全树，
   `scriptVal.value` 就地写回）—— 缺的只是**渲染路径去读它、并且知道它跑成功了没有**。

### P-120.3 改法（**只改最小面**；每处一句话）

| 位置 | 改动 |
|---|---|
| `core/we-scene-bundle.js:1512-1558`（`parseScene` 的 `cameraNode`） | 多存 5 个只读字段：`originObj`（原始相机对象=宿主 owner+写回点）、`originStatic`（**解析那一刻冻结**的静态快照）、`originScriptSrc`、`originScriptAnchor`、`originScriptProps`（语料实测挂在 `origin.scriptproperties` 上），外加 `originEval/originEvalState/originEvalWhy/originEvalStats` 台账；**`active` 语义一字未改**（仍是"有关键帧"） |
| `core/we-scene-bundle.js:4586-4705`（模块级接线层） | `setCameraScriptHost()/getCameraScriptHost()` 宿主注册口（**不 import `../elysia/…`**：发布产物把本文件放在站点根，跨目录相对路径线上会 404；隔离副本型测试也只拷 `core/`）；`cameraScriptModeFrom()`（`opts` > `window.__mpwCameraScript` > 缺省 `on`，**不新增 `?` 开关**）；`userPropsStamp()` 指纹；`evalCameraOriginScriptOnce()` = 在**相机对象局部**调既有宿主并读回宿主写进原对象树的值，宿主 entry 的 `error/disabled/updateErrors` 与 `onError` 一起作为"跑成了没有"的判据 |
| `core/we-scene-bundle.js:8501-8610`（`createRenderer` 闭包） | 每渲染器一个专属 `createScriptCache()` + 输入签名备忘 + 台账；`cameraOriginFromScript()` 是唯一出口，**每条出口都记台账**（`ok/static/off/nohost/nouserprops/error`） |
| `core/we-scene-bundle.js:8765-8793`（`renderScene` 相机分支） | 新增 `else if (__camposeMode === 'full' && !force && camNode.originScriptSrc)`：用**求值结果**当 pose 的 x/y/z，zoom/fov 取值链与关键帧档同形（zoom 一处刻意差异：**用户绑定优先**，因为改动前这 14 个包走的是 P-76 的 `__zoomOnly` 兜底，用户体验必须逐值不变） |
| `core/we-scene-bundle.js:10438`（渲染器 API） | 只读台账 `get cameraOriginScript()`；浏览器里同一份写到 `window.__mpwCameraOriginScript` |
| `demo.html:4505-4512`（真实路径接线） | `lib.createRenderer(cv, { …, cameraScriptHost: { applySceneScripts, createScriptCache } })` —— 把**本页已经在用的**那个宿主实例交给相机分支，不自造求值器 |

**多久重算一次 / 什么触发（渲染器既有节奏 = 每个渲染帧检查一次签名，签名不变就不调宿主）**：
签名 = ① 脚本源长度 ② 对象 `scriptproperties` 经 `resolveScriptProperties` 解析出的字面量（用户属性绑定的落点）
③ `userProps` 全表指纹（对象没写 `scriptproperties` 时用户属性仍会影响脚本内属性默认值）④ `canvasSize`
⑤ 相机 origin **原文串**（宿主按自己的 4Hz/30Hz 脚本趟写回时会改它 ⇒ 与 demo 既有节拍天然对齐，时间型相机脚本
不会被备忘冻住）。**失败/缺失** ⇒ 回退 `originStatic` + `camNode.originEvalStats.fallbacks++` + 一条
`⚠ P-120 …` 日志（每个失败原因只打一次）。**唯二不套快照的例外**：没有注册宿主（`nohost`）或没有用户属性表
（`nouserprops`）时**保持不施加**（= 改动前行为）—— 那种环境下"施加快照"就是 P-69 量到的 −2434px 编辑器残留，
属于回归。**任何异常都在接线层内吞掉**，相机解析不外抛。

### P-120.4 判据 (a)-(d)：`node tests/camera-origin-script-test.mjs`（rc=0，**78 pass / 0 fail / 0 skip**，1.6s，峰值 RSS 293MB）

```
══ (a) 14 个 `origin.script` 相机包：渲染路径的相机 origin == 宿主求值结果 ══
  ✓ a1 0917/3448877775 渲染路径有相机 origin 脚本台账且 state=ok  [state=ok]
  ✓ a2 0917/3448877775 相机 origin 逐分量 == 独立参考求值 [0,0,500]  [not台=[0,0,500] 参考=[0,0,500]]
  ✓ a3 0917/3448877775 相机 origin ≠ 冻结静态快照 [2434.38477,725.25134,500]  [Δx=-2434.38477]
  …（a1/a2/a3 逐包 14×3 = 42 条，全绿；"独立参考求值"= 真宿主 + 全场景 + 全新缓存，**不复用**渲染路径那趟）
  ✓ a4 (a) 覆盖 14 个包且逐包求值成功  [包=14 求值对齐=14 跳过=0]
  ✓ a5 (a) 14 个包用的是**同一段**脚本（sha256 前缀 151da98895ccdaed）
  ✓ a6 (a) 14/14 的求值结果都与静态快照不同（证明确实不是抄 `.value`）  [14/14]
══ (c) 用户属性 → 相机 origin：project.json 默认值 vs x3=0.25 ══
  · 默认 userProps：求值 [0,0,500] / 参考 [0,0,500] / 静态 [2434.38477,725.25116,500]
  · x3=0.25    ：求值 [960,0,500] / 参考 [960,0,500]
  ✓ c1 默认用户属性 ⇒ 求值结果 == 参考求值 [0,0,500]
  ✓ c2 默认用户属性 ⇒ **取景逐位不变**（与"接线关"的实绘矩形逐值相同）  [10 层]      ← 硬判据 (b) 的脚本侧
  ✓ c3 改一个用户属性（x3 0→0.25）⇒ 相机 origin 跟着变：[0,0,500] → [960,0,500]  [Δ=960]
  ✓ c4 改属性后**取景真的跟着动**：非满幅层 Δx == −960（9 层位移）  [纯色 Δx=-960 | 文本1 Δx=-960 | 文本2 Δx=-960]
  ✓ c5 同签名连渲两帧只求值一次（第二次 cached=true）⇒ 重算是"按输入签名"不是每帧无脑跑  [evals=1 cached=true]
  ✓ c6 canvasSize 变化 ⇒ 相机 origin 跟着重算（x3=0.5：3840→1920 / 1920→960，与参考求值同值）  [3840 画布=[1920,0,500] 1920 画布=[960,0,500]]
══ (b) 反向：无脚本相机包（关键帧 / 静态字符串）逐值不变 ══
  ✓ b1 dd/3554161528（关键帧 origin）接线开/关的实绘矩形**逐位相同**  [11 层]
  ✓ b2 dd/3554161528 相机节点仍是"关键帧驱动"（active=true）且**没有** origin 脚本字段  [active=true src=null]
  ✓ b3 dd/3554161528 两档都没有相机 origin 脚本台账（P-120 分支不进）
  ✓ b4 0917/3509243656（静态字符串 origin）没有 origin 脚本字段、无台账
  ✓ b5 0917/3509243656 冻结静态快照仍等于作者原文 "0 0 6"（逐值不变）
  ✓ b6 0917/3509243656 透视档仍按**作者静态 origin** 节点锚定（projKind=persp / anchor=node / dist=6）
  ✓ b7 无相机节点的包（dd/3544152633）：cameraNode===null 且不产生任何相机 origin 台账
══ (d) 坏脚本 / 坏宿主：不抛 + 只可能"回退静态快照"或"不施加" ══
  ✓ d1 坏脚本：renderScene **不抛**且落点 ∈ {回退静态快照, 不施加}  [应用=[2434.38477,725.25116,500] 静态=同值]
  ✓ d2 坏脚本：落点绝无第三种可能（半成品/NaN 都会红）
  ✓ d3 坏宿主（applySceneScripts 抛）：renderScene **不抛**且落点 ∈ {回退静态快照, 不施加}
  ✓ x1 坏脚本：台账 state=static 且回退计数 ≥1  [why=compile: vm shim parse error: Unexpected identifier 'is']
  ✓ x2 坏脚本：日志里有一条 P-120 的失败痕迹（不是静默回退）
  ✓ x3 坏宿主：台账 state=static 且 value == 静态快照  [why=host-throw: P-120 坏宿主（测试夹具）]
  ✓ x4 开关 opts.cameraScript='off' ⇒ 不施加（落点 = null）且台账 state='off'
  ✓ x5 没有用户属性表 ⇒ 不施加（state=nouserprops；绝不套用静态残留）
```
> `d*` 故意写成**变异安全**形式（"落点 ∈ {静态快照, 不施加}"、"绝无第三种可能"）：接线被撤时落点 = 不施加，
> 同样为真 ⇒ 反转后 (d) 仍绿。`x*` 是**接线期才有**的痕迹证据，不参与"反转后 (b)(d) 仍绿"的判据。

### P-120.5 red-if-reverted（隔离副本 + 真树未改动证明；同一次 `node tests/camera-origin-script-test.mjs` 内完成）

```
══ (m) 红-if-reverted：隔离副本改回"不跑脚本" ⇒ (a)(c) 必红、(b)(d) 仍绿 ══
  · 隔离副本 = /tmp/p120-mutant-XXXXXX（真文件副本 85 个文件；不含 node_modules/reports/语料）
  ✓ m1 隔离副本的入口脚本是真文件副本（inode 不同且内容 sha256 相同）  [ino 1618042 vs 2005750]
  ✓ m2 变异点存在且唯一（`originScriptSrc` 相机分支守卫）  [命中 1 次]
  ✓ m3 子进程真的在隔离副本里跑（ROOT == /tmp/p120-mutant-XXXXXX）  [rc=1]
  · 变异体计票：a=45(红44) b=7(红0) c=5(红4) d=3(红0) x=2(红2) rc=1
  ✓ m4 变异体里 (a) 逐包判据（a1/a2/a3 共 42 条 + a4/a6）全部变红
  ✓ m5 变异体里 (c) 的求值/位移判据（c1/c3/c4）全部变红，而 c2（默认属性取景不变）留绿
  ✓ m6 变异体里 (b) **仍全绿**（无脚本包逐值不变）  [b 共 7 条，红 0]
  ✓ m7 变异体里 (d) **仍全绿**（坏脚本/坏宿主不抛、落点两态之一）  [d 共 3 条，红 0]
  ✓ m8 变异体整体 rc=1（有判据红 ⇒ 不冒充通过）
  ✓ m9 接线期才有的痕迹判据 (x) 在变异体里变红（证明 (a)(c) 的红不是"整轮跑不起来"）
  ✓ m10 真树 core/we-scene-bundle.js sha256 跑前跑后一致  [9b7467e17ad10bdd…]
  ✓ m11 真树 core/* 全部文件 sha256 跑前跑后一致  [8 个文件]
  ✓ m12 真树 `git status --porcelain` 跑前跑后逐字一致（未新增/未改动）  [3 行未提交改动（跑前=跑后）]
```
- **变异点**：隔离副本 `core/we-scene-bundle.js` 的 `} else if (__camposeMode === 'full' && !force && camNode.originScriptSrc) {`
  → `} else if (false && …) {`（一行，= 接线改回"不跑脚本"）。**失败断言名**：变异体里 `a1/a2/a3`（逐包 42 条）、
  `a4`、`a6`、`c1`、`c3`、`c4`、`x1`、`x2` 全红；子进程 **rc=1**。
- **入口脚本是真文件副本**：`readFileSync/writeFileSync` 逐文件复制 + `statSync` 判类型（不用 `fs.cpSync`——本机抛
  EINVAL；不用 `Dirent.isFile()`——有误报），并用 inode 不同 + 内容 sha256 相同双向证明（m1）。

### P-120.6 不回归（逐个贴退出码）

```
$ node tests/camera-script-origin-probe.mjs   rc=0  1.0s   ← 与改动前**逐字相同**（只差报告文件名的时间戳）
$ node tests/camera-node-test.mjs             rc=0  1.5s   ← 输出与改动前逐字相同（T3 仍"相机节点 inert（null 或非动画）且 view 恒等"）
$ node tests/camera-pose-test.mjs             rc=0  1.1s   ← 输出逐字相同：⑤ full/legacy/off 三档实绘矩形**逐位相同**、`?cam=node` 仍 Δx −2434
$ node tests/camera-persp-test.mjs            rc=0  0.5s   ← 输出逐字相同（3509243656 透视档不受影响）
$ node tests/projection-y-test.mjs            rc=0  1.8s   ← 输出逐字相同
$ node tests/charfit-camera-test.mjs          rc=0  1.0s   ← 输出逐字相同
$ node tests/mock-gl-test.mjs                 rc=0  0.2s   ← 输出逐字相同
$ node --check core/we-scene-bundle.js        rc=0
（追加自查，均 rc=0：camera-fillmode-test 0.09s / bind-order-test 1.7s（隔离副本 import 未受影响：本改动**没有**给
 bundle 加任何跨目录 import）/ pointer-leave-test 1.1s / diag-flag-check 0.3s（**本次 rc=0**；文档里记的 rc=1-lgcss
 已由插件线修掉，本改动未碰 README 与 web/diag-flags.json）/ demo-syntax-check 0.7s / docs-check 0.7s /
 canvas-size-test 0.2s / p76-parallax-eye-test 3.6s / fullscreen-recenter-test 0.1s）
重活（`tests/run-all-tests.sh`、`package-matrix.mjs`、`glsl-validate.mjs`、`build-pages.mjs`）**本会话未跑**（>60s 硬约束）⇒ 由主对话排队。
```

### P-120.7 未证实 / 未做（不猜）

- **真机画面与官方是否一致：未证实**（本机无 GPU/无 WebGL2、禁止启动浏览器 ⇒ 只有 mock-GL 的矩阵/矩形/数值）。
  尤其"默认 userProps 下这 14 个包的取景与官方逐像素一致"**没有像素级证据**，只有"求值 = 0 0 500 ⇒ 平移 0 ⇒
  与改动前的矩形逐位相同"这条数值证据。
- `canvasSize` 口径沿用 demo 既有脚本趟（`mpwEngineCanvasSize()` 缺省 = **渲染输出尺寸**，本测试用 3840×2160）。
  真机上画布可能是别的尺寸 ⇒ 滑块非默认时相机位移量 = `滑块 × 画布尺寸`，**与官方 engine.canvasSize 的确切口径
  仍未与真机对拍**（P-78 已记录两种口径都在画布内）。
- **时间型相机脚本**（用 `engine.time/frametime` 而非用户属性）在"没有任何输入变化、也没有别的宿主趟写回 origin"
  的环境下会被签名备忘冻住（浏览器里 demo 的 4Hz/30Hz 脚本趟会写回 ⇒ 每趟重算；见 P-120.3 触发条件）。
- `?campose=legacy` 档**不接**脚本 origin（= P-76 行为，只有用户绑定的 zoom 生效）；这是刻意的档位语义，未改。
- 相机对象上**除 origin 以外**的 `{script}` 节点（语料 0 例）会跟 origin 一起被局部趟跑到（作用域 = 相机对象），
  其 thisLayer/thisScene 只看得见相机对象本身（`renderObjects:[camObj]`）—— 语料无此形状，未测。
- `elysia/we-renderer/core.js`（elysia 参考渲染器）的 `_setupCamera` **本来就不读相机层 origin**（`cameraNode`
  零命中）⇒ 本次不涉及；`tests/preview.mjs:10` 走的是 bundle，已被本测试覆盖。
- 旁注（**改动前就存在**的宿主隔离缺陷，P-120 当时只记录不修；**①(P-121) 已修**，见 P-121 A 节）：`allwallpaper/0917/3462491575` 包里的作者脚本执行
  `console.log = () => {}`，而脚本沙箱共享**真的** `console` 对象 ⇒ 该包一开始跑，宿主进程的 `console.log`
  就被全局静音（本测试因此改用 `fs.writeSync`；`camera-script-origin-probe.mjs` 的 `muteConsole` 是同一原因的
  另一处规避）。修它要动 `elysia/scene-scripts.js` 的沙箱，超出 P1-1 最小面。

### P-120.8 本轮改动的文件清单（提交只含这些）

| 文件 | 说明 |
|---|---|
| `core/we-scene-bundle.js` | 接线本体（parseScene 字段 / 宿主注册口 + 局部求值 / renderScene 分支 / 台账 API）+ 4 处过时注释更正 |
| `demo.html` | 真实路径接线：`createRenderer(..., { cameraScriptHost: { applySceneScripts, createScriptCache } })`（一行 + 注释） |
| `tests/camera-origin-script-test.mjs` | **新增**：判据 (a)-(d) + 痕迹 (x) + 红-if-reverted (m)，78 断言，1.6s，峰值 RSS 293MB（`camera-pose-test` 同口径实测 330MB，两者都在本机既有真包类用例的同一量级） |
| `docs/PATCHES.md` | 本节 P-120 |
| **未改**：`tests/run-all-tests.sh`（门禁登记待办，见下）、`docs/README-DIAGNOSTICS.md`（没新增 `?` 开关）、`web/diag-flags.json`、`elysia/scene-scripts.js`（求值器一行未动） | |

登记待办：`add "camera-origin-script" "node tests/camera-origin-script-test.mjs" "" "^SKIP camera-origin-script"`。
`tests/run-all-tests.sh` 本轮**未改**（工作树里它是干净的，但登记属于门禁线的动作；本会话按纪律只提交自己的路径）。

## P-121（2026-09-18/19）两处"已知缺口"收口：① 脚本沙箱不再能静音**宿主** `console`（P-120.7 旁注那条）；② 指针"离开"的两条等价路径（`pointerout` / `blur`·`visibilitychange`）真正停发（P-118 G2/G3 XFAIL → 真断言）

**一句话**：两处都是"改法很小、但必须有判据"的收口 —— ① 沙箱此前把**宿主真 `console` 对象**塞进脚本作用域，
语料 `0917/3462491575` 的作者脚本 `console.log = () => {}` 跑过之后**宿主进程的 `console.log` 被全局改写**
（本次实测复现 → 修 → 逐属性 `===` 钉住）；② 渲染器的指针钩子只认画布 `pointerleave`，"切窗口/切标签/系统弹窗"
（`pointerout`+`relatedTarget=null`、`blur`、`visibilitychange`）三条等价路径一条都不停发（本次补齐 + 恢复面一起钉）。

### P-121.1 现象与复现（先证差异真实存在；命令 + 数字）

```
$ node /tmp/probe-gapA.mjs                      # 改动前：合成脚本 + 真语料，两路都复现
① 合成脚本跑一趟后：宿主 console.log 与跑之前 === 同一引用 ? false
   宿主 console.log.name =  / 宿主 console.log === 静音函数 ? true      # ← 被换成空箭头函数
② 真包 0917/3462491575：含 `console.log =` 的脚本节点数 = 1
   现场原文片段："logInterrupts, tips, globalReplayable;\n\nif (!isRunningInEditor) {\n\tconsole.log = () => { }"
   真包跑完（t=0 init+update、t=0.5 update）后：宿主 console.log === 跑之前 ? false
   脚本条目数 = 9；其中 error 条目 = 0
③ 宿主 console.log 现在还能输出吗？→ 这一行本身就是证据（若上面 === false，本行由 SAVED 写出，仍可读）
peak RSS (VmHWM) = 120MB
```

```
$ node tests/pointer-leave-test.mjs --no-mutation      # 改动前（P-118 那版）
  ! XFAIL（已知缺口·不计票） G2 pointerout(+relatedTarget=null) 也能停发（等价"离开"路径应等价）
      — pointerout 派发命中 0 个监听器；离开后累计 157→173（仍在发射）；实测画布监听集合=["pointermove","pointerdown","pointerleave"]
  ! XFAIL（已知缺口·不计票） G3 blur / visibilitychange（页面级离开）也能停发（当前零监听）
      — blur 命中 0 个、visibilitychange 命中 0 个；离开后累计 173→189（仍在发射）
```

旁证（P-120 交付里记的原始观察）：上一位代理的测试被迫改用 `fs.writeSync` 输出、
`tests/camera-script-origin-probe.mjs` 里专门有 `muteConsole` 规避 ⇒ 这条**在真实运行路径上会污染宿主**，不只是测试不便。

### P-121.2 根因（file:line 为改动前）

1. **沙箱没有独立 realm**：`elysia/nsl.js:19-43` 的"vm 替身"是 `new Function('__nslCtx', 'with (__nslCtx) { … }')`
   —— `with` 只**遮蔽** ctx 上已有的键，兜底作用域是**宿主全局**（Node 侧连 `process`/`Buffer`/`global` 都直达）。
   所以"塞进 ctx 的对象"仍与宿主**共享**：写它 = 写宿主。
2. `elysia/scene-scripts.js:321`（改前）：`Date, Math, console, JSON, …` —— `console` 的值就是**宿主真 console 对象**。
   语料 `0917/3462491575` 的作者脚本在顶层执行 `console.log = () => {}` ⇒ 改写的是宿主的那个对象。
3. 指针侧（`core/we-scene-bundle.js:6640`/`:6677`，改前）：钩子只装 `pointermove`/`pointerdown`/`pointerleave`
   三个，`__pointerDesign` 也只认"注入"与"画布归一坐标"两条来源 ⇒ `pointerout`（relatedTarget=null）、
   `blur`、`visibilitychange` 三条等价"离开"路径**没有任何落点**（渲染器一行都没引用 window/document 级事件）。

### P-121.3 改法（每处一句话；行号为**改动后**）

| 位置 | 改动 |
|---|---|
| `elysia/scene-scripts.js:259-306`（新增 `makeSandboxConsole()`） | **每个沙箱一个** `console` 门面（Proxy）：`set` 只落门面自己的键（作者"静音"的意图在**它自己的沙箱内**照常生效），`get` 未写过时**按名字转发**到*当前*宿主 `console` 的同名方法（调用时重取 ⇒ 宿主后替换 `console.warn/error` 也跟得上）；门面**不冻结**（`'use strict'` 下 `console.log = …` 必须赋值成功，否则作者脚本会加载失败 = 更重的行为改变） |
| `elysia/scene-scripts.js:321-325` | `console: makeSandboxConsole()` 替掉 `console`；`...SANDBOX_HOST_ONLY_GLOBALS`（`:309-317`）把**宿主进程句柄**显式 shadow 成 `undefined`：`process/require/module/exports/Buffer/global`（WE 运行时不提供、浏览器里本来就不存在 ⇒ Node 侧从此与浏览器/WE 同形；语料 11 个 dd 包 `typeof process` **零命中**） |
| `core/we-scene-bundle.js:6776-6796`（新增 `__pointerLeave(why)` / `__pointerSuspend` / `__pointerResume`） | 把"离开"的处置**收成一处**：`pointerleave` / `pointerout` 走 `__pointerLeave`（清归一坐标 + 记"已离开" + 记下那一刻注入值指纹，语义与 P-118 逐字相同）；页面级失焦/隐藏走 `__pointerSuspend`（**保留** `__pointerN` ⇒ 焦点回来时若指针仍在画布内就能立刻续发） |
| `core/we-scene-bundle.js:6808-6825`（新增 `__hookPageLeave()`） | 页面级钩子：`window` 上 `blur`/`focus`、`document` 上 `visibilitychange`（按 `document.hidden`/`visibilityState` 分隐藏/可见）。**幂等 + 目标可变**：只在"换了个 window/document 对象"时重挂（一开始没有 window/document 也能后补装上，与 `__hookPointer` 的"挂不上就不置位"同一纪律） |
| `core/we-scene-bundle.js:6850-6857`（`__hookPointer` 内新增） | 画布 `pointerout`：`relatedTarget == null`（离开文档/窗口）或 `relatedTarget` **不在画布内**（`el.contains` 判定）⇒ `__pointerLeave('pointerout(…)')`；`relatedTarget` 在画布**内部**（pointerout 会从子元素冒泡）⇒ **不停发**（不误伤） |
| `core/we-scene-bundle.js:6884`（`__pointerDesign` 首行） | `if (__pointerSuspended) return null` —— 页面级"离开"时**注入通道与 DOM 通道一起让路**（放在最前 ⇒ 与"宿主还在写注入值"这种自然写法无关） |
| `core/we-scene-bundle.js:6865/6868`、`:9956/9958` | 两个安装点（建渲染器自举 + 每层帧内幂等兜底）都补 `__hookPageLeave()`；两处都在 `if (!CURSOR_OFF)` 之下 ⇒ **`?cursor=off` 语义一字未改**（D4b/D4c 钉住：画布侧 + 页面侧一个监听器都不装） |

### P-121.4 判据（实测；逐条可复现）

```
$ node tests/script-sandbox-globals-test.mjs            # 新增，31 断言，rc=0，0.87s，PeakRSS=126MB
  ✓ S1a ★ 跑过 `console.log = () => {}` 的脚本后，宿主 console 的 5 个写方法**逐个 === 同一引用**
        [log:=== warn:=== error:=== info:=== debug:===]
  ✓ S1d 门面 ≠ 宿主 console（沙箱拿到的是每沙箱一个的独立对象）  [ctx.console===console ? false]
  ✓ S1e 作者的"静音"意图在**它自己的沙箱内**仍然生效（只是不再污染宿主）  [ctx.console.log=() => {}]
  ✓ S2b ★★ 真包跑两趟后，宿主 console 的 5 个写方法仍逐个 === 同一引用
        [log:=== warn:=== error:=== info:=== debug:===；脚本条目=9 编译失败=0]
  ✓ S3a ★ 正常脚本的 console.log **逐字**出现在宿主 stdout（沙箱没把日志吞掉）    # 子进程 stdout 字节证据
  ✓ S3b ★★ 宿主自己的 console.log 在脚本静音之后**仍然真的会输出**  [identity=true HostMarker=true]
  ✓ S3d 静音**之后**那条日志不再出现（门面是每沙箱一个，不是全局开关）
  ✓ S4b A 静音不影响 B：B 的门面 log 仍转发到**当前**宿主方法（换掉宿主 console.log 后调用被记到）
  ✓ S4c 同一机制的出货用法：宿主把 console.warn 桥到页面 #log 之后，沙箱 warn 照样进那条桥（demo.html:929-931）
  ✓ S5a ★ 沙箱里 `globalThis` = 沙箱 ctx：脚本写 `globalThis.__p121CtxMark` **没有**落到宿主 global
  ✓ S5b 那它落到哪了：沙箱条目自己的 context 上（可观测落点 = entry.context）
  ✓ S6  ★ 宿主进程句柄 6 个全被 shadow 成 undefined  [Process=undefined Require=undefined Module=undefined Exports=undefined Buffer=undefined Global=undefined]
  ✓ S7a localStorage = 沙箱自己的内存实现（不是宿主页面的 Storage）
  ✓ S7b `engine.setTimeout` 是宿主 API（≠ 宿主全局 setTimeout）
```

```
$ node tests/pointer-leave-test.mjs                     # 64 断言（原 45 + 2 XFAIL），rc=0，1.87s，xfail 0
  ✓ G2a pointerout + relatedTarget 在画布**内部** ⇒ **不停发**（防误伤）
  ✓ G2b ★★ pointerout + relatedTarget 在画布**外** ⇒ 停发（`contains` 判定生效）  [命中 1 个监听器；离开后累计 244→244]
  ✓ G2c ★★ pointerout(+relatedTarget=null) 停发（真断言；修复前 157→173）
        [命中 1 个监听器（修复前 = 0）；累计 347→347；实测画布监听集合=["pointermove","pointerdown","pointerleave","pointerout"]]
  ✓ G3-pre 页面级监听真的装上了  [实测={"win":["blur","focus"],"doc":["visibilitychange"]}（修复前 = {"win":[],"doc":[]}）]
  ✓ G3a ★★ blur（窗口失焦）⇒ 停发：累计冻结 + 无存活粒子 + 指针为空  [blur 命中 1 个；累计 475→475 ptr=null]
  ✓ G3b ★★ focus 恢复 ⇒ 继续发射，且基准点仍是离开前的画布内坐标 (640,480)±1px  [累计 475→626 ptr=[640,480]]
  ✓ G3c ★★ visibilitychange + document.hidden=true（切标签）⇒ 停发  [累计 785→785 ptr=null]
  ✓ G3d ★★ visibilitychange + visible 恢复 ⇒ 继续发射  [累计 785→968]
  ✓ G3e ★★ 失焦期间指针真离开画布 ⇒ 恢复焦点后**仍不发射**  [累计 968→968 ptr=null]
  ✓ D4c ?cursor=off ⇒ 页面级（win blur/focus、doc visibilitychange）也一个监听器都不装  [实测={"win":[],"doc":[]}]
  ...
  已知缺口 0 条（P-118 闭合 G1/G4/G5 三条；P-121 闭合 G2/G3 两条 —— 等效"离开"路径已全部转真断言）
  ALL PASS （64 项，缺口 0）
```

**闭环条件（缺口表数字如实下降）**：`xfail` 从 **2 → 0**、`xpass` 0、`fail` 0；G2/G3 用的是 `ok()` 真断言
（不是删断言、不是标 SKIP）。反假绿的**非平凡前置**：G2/G3 每条子用例都先 `pointermove` 重新进入画布、
断言"正在发射"，再派发离开信号 —— 第一版就撞见过"G2 已经把发射冻住 ⇒ G3 的冻结是平凡真"的假绿，已修。

### P-121.5 红-if-reverted（真跑到；**真文件副本**在 `/tmp`，真树 sha256 前后不变）

```
$ MUT=/tmp/p121-manual-b; cp core/*.js $MUT/core/     # 逐文件复制（fs.cpSync 本机抛 EINVAL；用 statSync 判类型 + readFileSync/writeFileSync）
# M5：删掉画布 pointerout 监听  →  MPW_POINTER_BUNDLE=$MUT/core/we-scene-bundle.js node tests/pointer-leave-test.mjs --no-mutation --only G2   （rc=1）
  ✗ G2a pointerout + relatedTarget 在画布**内部** ⇒ **不停发**  — 派发命中 0 个监听器；累计 157→165
  ✗ G2b ★★ pointerout + relatedTarget 在画布**外** ⇒ 停发  — 派发命中 0 个监听器；离开后累计 244→260
  ✗ G2c ★★ pointerout(+relatedTarget=null) 停发  — pointerout 派发命中 0 个监听器（修复前 = 0）；离开后累计 363→379；实测画布监听集合=["pointermove","pointerdown","pointerleave"]
# M6+M7：删掉 window blur 与 document visibilitychange 监听  →  … --only G3   （rc=1）
  ✗ G3-pre 页面级监听真的装上了  — 实测={"win":["focus"],"doc":[]}
  ✗ G3a ★★ blur（窗口失焦）⇒ 停发  — blur 命中 0 个监听器；累计 475→491 ptr=[640.0000,479.9999]
  ✗ G3c ★★ visibilitychange + hidden ⇒ 停发  — 命中 0 个监听器；累计 658→674
# M8：删掉 window focus 监听（"修好一个 bug 造出另一个"）  →  … --only G3   （rc=1）
  ✗ G3b ★★ focus 恢复 ⇒ 继续发射  — focus 命中 0 个；累计 475→475 ptr=null
$ sha256sum core/we-scene-bundle.js    # 变异跑完前后逐字节相同
c7d6d5a4b0732bc9ee1d30c43a7a624de997a090228ab2541ad8af0533c9fbc1
```

缺口 A 的变异（同款"真副本"手法，锚点各命中 1 次）：
```
# M1：`console: makeSandboxConsole(),` → `console,`（回到共享宿主 console）
$ MPW_SCENE_SCRIPTS=$MUT/elysia/scene-scripts.js node tests/script-sandbox-globals-test.mjs --no-mutation   （rc=1）
  ✗ S1a ★ 跑过 `console.log = () => {}` 的脚本后，宿主 console 的 5 个写方法逐个 === 同一引用  — log:≠ warn:≠ error:≠ info:≠ debug:≠
  ✗ S1b 宿主 console 的对象身份也没被换  — name=（被换成空箭头函数）
  ✗ S2b ★★ 真包跑两趟后…  — log:≠ warn:=== error:=== info:=== debug:===
  ✗ S3a ★ 正常脚本的 console.log 逐字出现在宿主 stdout  — 捕获 63 字节（原本 128）
  ✗ S3b ★★ 宿主自己的 console.log 仍然真的会输出  — identity=false HostMarker=false
  （计票：pass=18 fail=9）→ 9 项失败
# M2：删掉 `...SANDBOX_HOST_ONLY_GLOBALS,`（进程句柄可直达）
  ✗ S6 ★ 宿主进程句柄 6 个全被 shadow  — Process=object Require=undefined … Buffer=function Global=object
  ✗ S6a ★★ 沙箱内 typeof process === "undefined"  — sandbox=object host=object
  （计票：pass=25 fail=2）→ 2 项失败
```
两个变异体里基线断言（`S0a`/`S5`）仍为 ✓ ⇒ 红是"变异打破被点名的那条语义"，不是"副本加载不起来"。
测试文件内置的 8 个变异（M1~M8）各配一条"绿前提仍成立"复核，`pass=64` 里含 16 项自检。
**变异全部只写 `/tmp` 副本**：真树 `core/we-scene-bundle.js` sha256 跑变异前后同为 `c7d6d5a4…`（上面已贴）。

### P-121.6 验收（逐个贴退出码；全部只读真树、全部秒级）

```
$ node tests/pointer-leave-test.mjs                 # rc=0  ALL PASS（64 项，缺口 0）       1.87s
$ node tests/script-sandbox-globals-test.mjs        # rc=0  ALL PASS（31 项）PeakRSS=126MB  0.87s
$ node tests/mock-gl-test.mjs                       # rc=0  60 通过 / 0 失败
$ node tests/script-origin-sync-test.mjs            # rc=0  9 pass / 0 fail
$ node tests/camera-origin-script-test.mjs          # rc=0  ALL PASS（78 项）
$ node tests/display-options-test.mjs               # rc=0  ALL PASS（71 断言）
$ node tests/bind-order-test.mjs                    # rc=0  ALL PASS（76 通过 / 0 失败）
$ node tests/data-limits-test.mjs                   # rc=0  40 通过 / 0 失败
$ node --check core/we-scene-bundle.js && node --check elysia/scene-scripts.js && \
  node --check tests/pointer-leave-test.mjs && node --check tests/script-sandbox-globals-test.mjs   # rc=0
```
**没有跑**（硬约束）：全量 `tests/run-all-tests.sh`、`tests/package-matrix.mjs`、`tests/glsl-validate.mjs`、
`build-pages.mjs`；也没有启动任何浏览器（本机无 X11/GPU，证据只有 Node + 假 DOM + mock-GL + 数值 + 逐字节）。

### P-121.7 未证实项（**不许当已解决**）

- **浏览器分支未执行**：沙箱是同一份 `elysia/nsl.js`（`new Function` + `with`），本机没有浏览器 ⇒
  "出货页面里沙箱日志进 `#log` 面板（demo.html:929-931 的 console.warn/error 桥）"只有**源码 + Node 侧
  等价转发**证据（S4c 用"换掉宿主 console.warn"模拟了那条桥），**没有**真机 DOM 证据。
- **真机事件时序未测**：`pointerout`/`blur`/`visibilitychange` 与最后一发 `pointermove` 的真实先后、
  以及真机壁纸引擎（Qt）是否**发** `blur`/`visibilitychange`，都只有合成事件证据。若真机不发这两类事件，
  本补丁在该环境下等价于"没接"，不会更差（唯一新增的 DOM 依赖是 `pointerout`，它是 DOM 标准事件）。
- **三条剩余隔离面（本轮只记录、不修；`tests/script-sandbox-globals-test.mjs` 的 S8 段用 NOTE 打印实测值）**：
  ① bare `setTimeout`/`fetch` 未遮蔽 ⇒ 直达宿主全局（本机 Node 实测 `typeof fetch`/`typeof setTimeout` 都是 `function`）；
  ② 未声明标识符的松散赋值落**宿主** global（实测 `__p121Loose = 'leak'` ⇒ 宿主 `globalThis.__p121Loose === 'leak'`）；
  ③ 内建对象（`Object`/`Array`/…）与宿主**同 realm** ⇒ `Object.prototype.__p121Proto = 'proto'` 写穿宿主原型链（实测成立）。
  要真隔离得给沙箱独立 realm，而**浏览器侧没有 `node:vm`**（这正是 `elysia/nsl.js` 存在的理由）⇒
  这不是"补一行"的事，本轮**不假装已隔离**。
- `Buffer` 的语料命中都是 `MpwBuffer`/`vertexBuffer` 一类**名字**（不是 Node 全局），据此把 `Buffer` 一起 shadow；
  `typeof process` 在 11 个 dd 包正文里零命中 —— 但**没有**扫描全部 13GB 语料（全量审计 `script-corpus-audit.mjs`
  属重活，本轮按纪律不跑）⇒ "shadow 不影响其它语料"只在这些包的范围内成立。
- 页面级"挂起"期间的语义选择：`blur`/`hidden` 时**保留** `__pointerN`（焦点回来若指针仍在画布内 ⇒ 立刻续发）。
  若真机上"失焦期间用户其实把鼠标移到了别的窗口、画布内坐标已过期"，则恢复瞬间会用一次**旧坐标**发一帧；
  下一发 `pointermove`/`pointerout` 立即纠正。这条取舍**未在真机验证**（G3b 钉的是"能续发"，不是"续发坐标一定新鲜"）。

### P-121.8 本轮改动的文件清单（提交只含这些）

| 文件 | 说明 |
|---|---|
| `elysia/scene-scripts.js` | **缺口 A 本体**：`makeSandboxConsole()`（每沙箱一个 console 门面）+ `SANDBOX_HOST_ONLY_GLOBALS`（进程句柄 shadow）+ context 两行接线 |
| `core/we-scene-bundle.js` | **缺口 B 本体**：`__pointerLeave`/`__pointerSuspend`/`__pointerResume`/`__hookPageLeave` + 画布 `pointerout` + `__pointerDesign` 挂起判定 + 两个安装点 |
| `tests/pointer-leave-test.mjs` | G2/G3 由 XFAIL 改**真断言**（含 G2a 误伤面、G3b/G3d 恢复面、G3e 反"无中生有"面、D4c 逃生口面）+ 假 window/document 目标 + 变异扩到 8 个（M5~M8 是本轮两条缺口的红-if-reverted） |
| `tests/script-sandbox-globals-test.mjs` | **新增**：缺口 A 的 31 条判据（① 逐属性 `===` + stdout 字节证据；② 日志去向；③ globalThis/进程句柄/localStorage 钉住；S8 如实记录三条剩余面）+ M1/M2 变异自检；0.87s / 126MB |
| `docs/PATCHES.md` | 本节 P-121（+ 回填 P-120.7 那条旁注的"已修"指针） |
| `docs/README-DIAGNOSTICS.md` | `cursor` 行的"不开时"语义补两条等价"离开"信号（P-121） |
| **未改**：`tests/run-all-tests.sh` | 新测试的登记待办见下；`pointer-leave` 那行**已在**门禁里（且没有写死断言条数的注释 ⇒ 不需要跟着改） |

登记待办：`add "script-sandbox-globals" "node tests/script-sandbox-globals-test.mjs"`。

## P-124（2026-09-18 用户第 6 项 ④⑤⑥）渲染器演示页浮窗取色器三连修：同一个色块再点一次=关闭且**任何时刻最多一个浮窗**、颜色行读数只留 3 位小数（**只改显示**）、面板滚动跟随 + 面板收起即关

**一句话**：三条用户反馈 = **一个真机根因 + 一条缺失能力 + 一处显示缺陷**。①浮窗关闭路径写成
`wrap.parent.removeChild(wrap)` —— `parent` **不是 DOM 属性**（它只存在于场景对象上），浏览器里恒 `undefined`
⇒ 旧浮窗**永远摘不掉**，而 `outside` 里 `if (t === anchor) return` 又让"点色块自己"不触发关闭 ⇒
同一个色块点几次就叠几个浮窗（"侧边的阴影越来越重" = 多个 `box-shadow:0 12px 40px rgba(0,0,0,.5)` 叠加）。
②位置只在开浮窗那一刻算一次，且 `.mpw_pickerWrap` 是 `position:fixed` ⇒ 面板里上下滑动时它不动、面板收起
（`display:none`）时它也不关。③颜色行读数把作者写的**满精度 0..1 串**原样铺在行尾（`fmtValue()` 对字符串原样
返回），行尾被撑长 = "数据太长导致位置有点不对"。

### P-124.1 现象与复现（先证差异真实存在；命令 + 数字）

用户原话（任务书第 6 项）：
- ④"那些取色盘，点一下再点一下，不会给它关掉，而是叠加几个取色盘在上面，我看他侧边的阴影越来越重了"
- ⑤"有的颜色选取的地方，后面有他的一些很长的一串小数数据，给这个小数数据取前几位就行了，你这个数据太长，导致它放的位置有点不对"
- ⑥(a)"在属性上下滑动的时候不会跟随移动" ⑥(b)"在属性这个选项整体关闭的情况下，你取色盘不会自动关闭"

改动前跑**新增**断言（`node tests/props-panel-test.mjs`，exit 1，263 通过 / 13 失败）：

```
  ✗ T23c **同一个色块再点一次 = 关闭**…  [wraps=2 open=true]
  ✗ T23f 点 A 再点 B：.mpw_pickerWrap 计数恒为 1…  [mid=3 wraps=4 sameEl=false]
  ✗ T23h **面板滚动一次 → 浮窗跟着色块走**…  [72px,30px]
  ✗ T23k 颜色行读数 = 3 位小数…  ["0.5294117647058824 0.4627450980392157 0.8313725490196079"]
  ✗ T23o **面板整体收起 ⇒ 取色浮窗自动关闭**…  [before=1 after=1 root=""]
```

`wraps=2 / 4` 就是"叠几个取色盘"的量化：**每次点击 body 里多一个 `.mpw_pickerWrap`**（假 DOM 的
`strictDom` 模式不提供非标准 `parent` 别名 ⇒ 与浏览器同一套属性面）。

### P-124.2 根因（file:line 为改动前）

| # | 现场 | 根因 |
|---|---|---|
| ④ | `demo.html:683` `if (wrap.parent && wrap.parent.removeChild) wrap.parent.removeChild(wrap)` | **`parent` 不是 DOM 属性**（真实 DOM 只有 `parentNode`/`parentElement`）⇒ 浏览器里恒 `undefined` ⇒ cleanup 里摘节点是 no-op，旧浮窗永久留在 `body`。假 DOM 当年给节点塞了非标准别名 `parent`（改动前 `tests/props-panel-test.mjs:48`（字面量）/`:50`（`appendChild`））⇒ 这条真机 bug 被假绿 |
| ④ | `demo.html:672-677` `outside()`：`if (t === anchor) return` + `demo.html:743-749` 色块 `click` 无条件 `openPicker` | 点色块自己**既不关闭**（outside 早退）**又重开一层**（旧节点又摘不掉）⇒ 连点两次 = 2 个浮窗；`PICKER.el` 只指向最新那个 |
| ⑤ | `demo.html:886` `r.readout.textContent = … API.fmtValue(it.value, it.precision)` | 颜色项 `it.value` 是**字符串**（真包 hina `newproperty24`：`0.5294117647058824 0.4627450980392157 0.8313725490196079`；`precision=null`），而 `fmtValue`（`demo.html:452-455`）对非 number **原样 `String(v)`** ⇒ 满精度整串进 `.vl` |
| ⑥(a) | `demo.html:691-698`（定位）+ `demo.html:586`（`PICKER` 无 anchor/无 scroll 监听） | 位置只在 `openPicker` 里算一次；`.mpw_pickerWrap` 是 `position:fixed`（`demo.html:66`）⇒ 面板滚动它不动 |
| ⑥(b) | `demo.html:3942-3947` `setOpen()` 只切 `root.className` | 面板收起 = `display:none`（`demo.html:23-24`）时没有任何人通知取色器 |

### P-124.3 改法（行号为**改动后**）

1. `demo.html:734`：摘节点改用**标准** `wrap.parentNode`（`var par = wrap.parentNode; if (par && par.removeChild) par.removeChild(wrap)`）。
2. `demo.html:640-646`：`openPicker` 里加"最多一个浮窗"兜底 —— 开新浮窗前按类名清掉 `body` 里的残留 `.mpw_pickerWrap`
   （即使上一实例的 cleanup 被外部摘掉/覆盖也保证计数不增长）。
3. `demo.html:795`：色块 `click` 变 toggle —— `if (API.pickerAnchor() === ctrl) { API.closePicker(); return }`；
   `PICKER.anchor` 在 `openPicker` 里记录（`demo.html:744`），`API.pickerAnchor()` 见 `demo.html:628`。点**别的**色块仍走
   `openPicker → closePicker()` 先收旧的（`outside` 的 `t === anchor` 早退保持不变，鼠标按下不再闪一下）。
4. `demo.html:719-725` + `demo.html:752`：抽出 `place(pr)`，并加 `onScroll`：`window` 上 **capture** 注册 `scroll`
   （scroll 不冒泡但捕获阶段经过 window ⇒ 一个监听覆盖任意滚动容器）；`cleanup` 里成对解绑（`demo.html:732`）。
   锚点矩形 `0×0`（= 已不可见）时直接关闭（⑥(b) 兜底）。
5. `demo.html:4000`：`setOpen(false)` 时 `API.closePicker()`（面板收起 ⇒ 浮窗跟着关）。
6. `demo.html:460-472` 新增 `API.fmtColorReadout(v)`（按空白/逗号切分，每段四舍五入到 **3 位小数**，非数字原样保留），
   `demo.html:939-940` 颜色行读数与"作者默认"提示都走它。**只改显示**：`readValue()`/`hexToColor()` 的写入链路一行没动
   （emit 仍是 `1 0.533333 0` 这类 6 位小数，见 T23m）。
7. 色块 `title` 补一句"在同一个色块上再点一次关闭"（`demo.html:790`）。

### P-124.4 判据（实测；逐条可复现）

`tests/props-panel-test.mjs` 新增 `[T23]` 共 **16 条**（T23a–T23r），全部跑 demo.html 的**真源码切片** + 真包 hina
（`general.properties` 35 条 / 3 个 color 项）：
- ④：连点两次后 body 里 `.mpw_pickerWrap` 计数 **0**；点 A 再点 B ⇒ 计数**恒 1** 且 `PICKER.el` 指向 B 的浮窗、
  A 的节点被真摘掉（计数桩：`body.removeChild` 摘到 1 个 `mpw_pickerWrap`；`doc.removeEventListener`+2、
  `window.removeEventListener`+3 = 旧实例 cleanup 真被调用）；`mousedown`/`keydown`/`mousemove`/`mouseup`/`scroll`
  监听归零；残留浮窗被兜底清掉（T23q/T23r）。
- ⑤：读数 `"0.529 0.463 0.831"`（正则 `^\d(\.\d{1,3})?( \d(\.\d{1,3})?){2}$` 且无 `\.\d{4,}`）、title 同口径；
  **emit 不变**：`"1 0.533333 0"`。
- ⑥(a)：滚一次 ⇒ `top` 从 `30px` → `290px`（与新 `getBoundingClientRect()` 同步），贴屏幕底仍走上弹公式（`496px`）。
- ⑥(b)：锚点 0×0 ⇒ 滚一次自动关；面板收起（⚙ 属性再点一次）⇒ 计数 0 且不留下延后 arm 的 `outside` 监听。

```
$ node tests/props-panel-test.mjs      # exit 0   —— 全部通过：278 通过 / 0 失败（本轮前 260/0，不许降）
$ node tests/demo-syntax-check.mjs     # exit 0   —— demo 内联脚本语法：10/10 通过
$ node tests/docs-check.mjs            # exit 0   —— 文档一致性全部通过
```

### P-124.5 红-if-reverted（真跑到；**真文件副本**在 `/tmp/p124/mut`，真树 sha256 前后不变）

变异脚本 `/tmp/p124/mutate.mjs`：`readFileSync/writeFileSync` 复制 `demo.html` + `tests/props-panel-test.mjs` +
`core/`+`elysia/`（模块图的相对 import 必须齐）+ `docs/README-DIAGNOSTICS.md`，逐条把修复退回旧写法再跑测试。
**6/6 全部变红**，真树 7 个文件 sha256 前后逐字节相同（末次自检：`demo.html 01b8fa6f…`、`tests/props-panel-test.mjs 885f3ef4…`，两次打印一致）：

| 变异 | 退回的写法 | RED |
|---|---|---|
| M1 | `wrap.parentNode` → `wrap.parent` | T23c/T23d/T23f/T23j/T23r（`wraps=1`、`removed=[]`） |
| M2 | 删掉 toggle 分支 | T23c/T23e（`wraps=1 open=true`、`win=1/1/1` 监听不归零） |
| M3 | 关掉兜底清理 | T23q/T23r（`wraps=2`） |
| M4 | 删掉 `window scroll` 监听 | T23h/T23i/T23j（`top` 停在 `30px`） |
| M5 | 颜色读数退回 `fmtValue` | T23k/T23m（满精度串、读数 `1 0.533333 0`） |
| M6 | 删掉 `setOpen` 里的 `closePicker()` | T23o/T23p（`before=1 after=1`、`doc.mousedown=1`） |

### P-124.6 测试台（`:8901`，`demo/bench-patch.js`）同一份移植版的对照 —— **本轮不改，只报告**

`grep -n` 实测（行号为当前工作树）：
- **不叠加（这份做得对，可作对照）**：`demo/bench-patch.js:2717-2721` 的 `closePicker()` 用标准
  `pickerEl.remove()` 摘节点，且 `openColorPicker` 第一行就 `closePicker()` ⇒ 不会像我们那份越点越多。
- **④"再点一次不关"在**：`demo/bench-patch.js:2771` `onDocDown` 里 `e.target !== anchor` 早退 +
  `:2790-2793` 色块 `click` 无条件 `openColorPicker` ⇒ 同一个色块再点只是把浮窗**原样重开**（不叠加、但也不关闭）。
  建议照 P-124.3 第 3 条加 toggle。
- **⑥(a) 在**：`:2746-2749` 位置只算一次；全文件 `addEventListener('scroll'` 只命中 `:2569` 的目录列表 ⇒
  取色浮窗不跟随（`#props-body` 是 `overflow-y:auto`、`.bench-picker` 是 `position:fixed`）。
  建议照第 4 条加 `window` capture `scroll` + 成对解绑。
- **⑥(b) 在**：`demo/bench-patch.js` 里没有任何 `#props-close` 钩子（`grep -n "props-close"` 只命中 `:1607` 的
  `BACKEND_ONLY_CONTROLS` 名单）；面板收起由**预构建产物** `demo/assets/bench-DSKWIqmS.js`（单行压缩，第 210 行）
  的 `l("#props-close").onclick=()=>{ue(!1)}` → `Le.hidden=!0` 处理 ⇒ 浮窗留着。建议照第 5 条在收起路径上 close。
- **⑤ 在产物里、视觉被 ellipsis 挡住**：测试台颜色行的读数不是 `demo/bench-patch.js` 渲染的，而是同一个预构建产物的
  `case"color":{…const i=document.createElement("span");i.className="prop-key",i.textContent=String(h??"")…}`；
  满精度串仍在 DOM 里，只是 `.prop-key{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}` 把它省略号截断
  ⇒ 视觉上没我们这份严重（真机仍可 hover 到 title？不可 —— 该 span 没有 title）。**产物不属本轮路径**，只登记。

### P-124.7 未证实项（**不许当已解决**）+ 需要真浏览器验证的清单

1. **本机不能起浏览器**（无 X11/无 GPU）⇒ 全部判据是"假 DOM + 真源码切片 + 静态断言"。真浏览器里要人眼确认的是：
   ① 同一个色块点两次浮窗消失、屏幕里始终只有一层阴影；② 面板里上下滚动时浮窗跟着色块走（不抖、不跳）；
   ③ ⚙ 属性收起后浮窗消失；④ 颜色行读数显示 `0.529 0.463 0.831` 且行尾不再被撑长。
2. `window` 上 `scroll` 的 **capture** 监听能否收到 `#mpw-props-panel`（`overflow-y:auto`）**内部**滚动：
   依据是 DOM 规范的捕获路径（scroll 不冒泡但经过 window），**未真机验证**。兜底：即便收不到，点外部/Esc/
   面板收起三条关闭路径仍在，浮窗不会永久悬空（只是不跟随）。
3. `display:none` 元素的 `getBoundingClientRect()` 返回全 0（⑥(b) 兜底判据）—— 规范如此，未真机验证；主路径是
   `setOpen` 里的显式 `closePicker()`。
4. 锚点被**滚出可视区**时，跟随会把浮窗移到屏幕外（本实现**不做**"滚出即隐藏"）—— 有意的取舍（跟随优先），真机手感待验。
5. 跟随频率 = 每个 `scroll` 事件一次重排（`st()` 写两个内联样式，无读-写回环）⇒ 理论上是 O(1)/事件；**没有**做
   rAF 节流，真机上长列表快速滚动的实际帧率未测（本机禁止跑浏览器）。

### P-124.8 本轮改动的文件清单（提交只含这些）

| 文件 | 说明 |
|---|---|
| `demo.html` | **本体**：`API.fmtColorReadout` + `PICKER.anchor`/`API.pickerAnchor` + 开前兜底清理 + toggle + `place/onScroll`（window capture scroll 跟随 + 不可见即关）+ `cleanup` 改 `parentNode` 并解绑 scroll + `setOpen(false)` 关浮窗 + 颜色读数 3 位小数 |
| `tests/props-panel-test.mjs` | 假 DOM 加 `strictDom`（不提供非标准 `parent` —— 这条真机 bug 当年就是被它假绿的）+ T23 共 16 条判据（T23a–T23r，含计数桩/监听归零/emit 不变/兜底网） |
| `docs/PATCHES.md` | 本节 P-124（P-122/P-123 是并行线占号，故用 P-124；写入前 `grep -n '^## P-12'` 确认未占用） |
| **未改**：`web/diag-flags.json` | 它是 `tests/diag-flag-check.mjs` 的生成物（`JSON_OUT`）；`node tests/docs-check.mjs` 会连带跑它，本轮因 `demo.html` 行号位移**自动重写**（`generatedAt` + `sites[].line`）⇒ 工作树多一条 ` M web/diag-flags.json`。按"只提交自己路径"未进本次提交（仓库既有惯例：生成物单独一次提交，见 `f9983cd`/`f86f911`），**留给集成线** |
| **未改**：`tests/run-all-tests.sh` | 第 130 行注释里写死的"106 断言"已过期（本轮后 278）。已确认没有脚本校验这个计数（不是门禁红项）；登记待办：把该行 `106 断言` 改成 `278 断言` |
| **未改**：`demo/bench-patch.js`、`demo/assets/bench-*` | 另有并行线在改；本节 P-124.6 只给清单与对照做法 |

## P-125（2026-09-19 用户第 ⑪/⑫/⑬ 条 · 窄屏"桌面版网站"平板真机实测）输出区整块在折叠线以下 + 「壁纸配置」收不起 + 设置弹层被自己的点击捕手盖住 + 主题收敛成两态 + 分辨率/DPR 下拉被祖先 overflow 裁成一块

> **编号说明**：任务书写的是"追加 P-123"，但写入前 `grep -n '^## P-12' docs/PATCHES.md` 实测 **P-122/P-123 已被并行线占号**
> （见 P-124 节末的"P-122/P-123 是并行线占号"），且 `tests/docs-check.mjs` 的 ② 要求 P-编号**唯一 + 按文件顺序非降**
> ⇒ 本节取 **P-125**（在 P-124 之后追加，两条件都满足）。
> **范围声明**：本节只改 `demo/index.html`（首屏静态 CSS + DOM + head 脚本）、`demo/bench-patch.js`（外壳逻辑/i18n/SITE_LAYOUT_CSS）、
> `tests/demo-check.mjs`（新增 D11）与仓外参考测试 `references/vendor-ref/ww-pages/bench-patch.test.mjs`（T19/T19c，**不在 git 里**，已如实登记）。
> **不改**：minified 产物 `demo/assets/**`（许可口径：一个字节都不动）、上游归属行、URL 别名。

### P-125.0 一句话结论（四条，都是判据式）

| # | 用户现象 | 根因（一句话） | 判据 |
|---|---|---|---|
| ⑪ | 「下面的输出的地方…可见的范围非常小，你能看到它自带的第1行文字，静态托管无diag后端」 | 窄屏是"文档流 + 页面内滚动"：**侧栏 152 + 属性栏 152** 压在 `#main` 之前，`#logs` 的 top=779 > 视口高 690 ⇒ **首屏可见高度 0**；且 `#logs{flex:none}` 的高度纯由内容决定（静态托管下 `#logbody` 只有 1~2 行）⇒ 即便滚到底也只有 ~105px | 980×690 首屏可见高度 ≥120px（算术 + 真机复测） |
| ⑫a | 「壁纸配置」面板上的「收起」点了没效果 | 我们自己的锁 `#props[hidden]{display:flex!important}`（静态表 + SITE_LAYOUT_CSS 各一份）把 `hidden` 变成空操作，`paintPropsEmpty()` 又会摘掉 `hidden` ⇒ 产物 `#props-close.onclick = () => ue(!1)` 一直在跑、但看不见效果 | 收起后 `#props` 挂 `bench-props-collapsed`（display:none）+ 持久化 1（假 DOM 行为断言） |
| ⑫b | 设置弹层里点「语言」把设置窗口自己关掉 | `#site-header{position:relative;z-index:30}` 是层叠上下文 ⇒ 弹层自己的 `z-index:40` **只在 header 内部有效**；捕手挂在 body 上、`z-index:35` 是**根级** ⇒ 捕手盖在整个 header（含弹层）之上，点语言命中的是捕手 ⇒ `pointerdown` 直接 `popOpen(false)` | 捕手 z-index < header 的 30 < 弹层的 40（静态层叠判据） |
| ⑫c | 「切换深色暗色的地方…留两个开关，一个深色一个暗色，不要跟随系统」 | 主题是三态（auto→dark→light→auto）：产物 `#theme-toggle.onclick` 走三态，DICT/静态 `title` 还带 `theme.auto`；按钮 `#theme-toggle` 只有 UA 默认按钮样式 ⇒ 内联 SVG 走**基线对齐**、下方留降部空白 ⇒ 图标看着偏上 | 两态纯函数 + 两个开关在位 + `.theme-btn` inline-flex 居中 + svg 块级化 |
| ⑬ | 「点开之后它下面的菜单不是悬浮在下面看壁纸的地方的，而是单独的一块，我可以给上面这一块划到空白的地方去」 | `.bench-rd-list{position:absolute}`，包含块 = `.bench-rd`（在 `#toolbar` 内）⇒ 被 `#toolbar{overflow-y:auto}`（以及 `#workbench{overflow:hidden}`）**裁成一块**并进入工具栏的**可滚动溢出区**（真机：`inViewport=false`） | `.bench-rd-list{position:fixed}` + 祖先链上无 transform/filter/contain（`#pages-track` 的 `contain:paint` 是唯一会裁它的盒子）+ 纯函数几何三条 |

### P-125.1 现场证据（真机实测 + 静态读代码，先证据后改）

**A. 真机实测（980×690 横屏 + 浏览器"桌面版网站"，有头浏览器）**

```
⑪ #logs = {w:980, h:105, top:779, bottom:884}  视口高=690 ⇒ #logs 可见高度 = 0（整块在折叠线以下）
   --mpw-logs-h = 220px；#page-console scrollHeight=840 / clientHeight=628（页面在滚）
⑫a 点 #props-close 之后 #props 的 computed display 仍是 flex ⇒ 收起确实无效
⑫c 主题按钮只有 1 个 .theme-btn（title="主题：浅色"，内含 svg）⇒ 一个按钮循环三态
⑬ #bench-rd-list：position=absolute、z-index=40、top=450、left=98、inViewport=false
   祖先链 = span[pos=relative,ovf=visible] → label[ovf=visible] → #toolbar[ovf=auto] →
            #editor-chrome[ovf=visible] → #main[ovf=visible] → #workbench[ovf=hidden]
```

**B. 静态读代码（"为什么只剩一行"的三个候选逐个判）**

| 候选 | 判据 | 结论 |
|---|---|---|
| `--mpw-logs-h` 被钳到很小 | `--mpw-logs-h` 的**唯一消费者**是 `demo/index.html:74` 的桌面网格 `#main{grid-template-rows:…minmax(60px,var(--mpw-logs-h,220px))}`；窄屏 `#main{display:flex!important}`（`:172`）让 grid-template-rows **整条失效** | **不成立**（窄屏无关） |
| `clampLogsHeight/maxLogsForLayout` 算成 60px | `maxLogsForLayout()` 在窄屏直接 `return 100000`（`demo/bench-patch.js:1450`）；`Math.max(60, …)` 那条只在**桌面网格**下生效（已顺手抬到 120：`:1457`）。但 `clampLogsHeight()` 的 `<24 ⇒ 0`（`:1127`）会让 `#main.logs-collapsed` ⇒ 产物 `#main.logs-collapsed #logbody{display:none}` ⇒ 面板只剩 head + 离线原因行 —— 这是**另一条**"只剩一行"的合法路径（用户主动收起 / 桌面上把分隔条拖到底后持久化成 `'collapsed'`） | **窄屏不成立**（但已用 `#main:not(.logs-collapsed)` 把收起态与下限解耦） |
| 被排在折叠线以下 | 窄屏 `#workbench{display:block}`（改前 `:164`）+ DOM 顺序 = 侧栏 → 属性栏 → #main ⇒ 首屏 628px 里先塞 152+152，`#logs` top=779 | **成立（真因）** |
| 面板本身高度纯由内容决定 | `#logs{flex:none;max-height:70vh;overflow:auto}`（`:186`）+ 产物 `#logbody{flex:1;min-height:0}` ⇒ 静态托管下 `#logbody` 内容少 ⇒ 面板 ≈ `.logs-head`(35px)+`#diag-offline`(≈40px)+几行 = 105px | **成立（叠加因素）** |

### P-125.2 改法（file:line）

| # | 文件:行 | 改法 |
|---|---|---|
| ⑪ | `demo/index.html:171-172`（类块）/ `:212-213`（安全网） | 窄屏 `#workbench` 由 `display:block` 改 **flex 列** + `#main{order:-1}` ⇒ 首屏 = 切换栏 32 + 工具条 112 + 舞台 331 + 输出；**只动 CSS order，不动 DOM**（id 结构/产物契约不变） |
| ⑪ | `demo/index.html:194`（类块）/ `:217`（安全网） | `#main:not(.logs-collapsed) #logs{min-height:clamp(180px,38vh,320px)}`（≈9 行起，随视口长到 320px）；收起态豁免，收起仍是用户的显式选择 |
| ⑪ | `demo/bench-patch.js:1457` | 桌面网格的地板 `Math.max(60, …)` → `Math.max(120, …)`（≈5 行；`stageFloorPx()=140` 已把舞台保底留出） |
| ⑫a | `demo/index.html:75` + `demo/bench-patch.js:2260` | 新增 `#props.bench-props-collapsed{display:none!important}`：与 `#props[hidden]` **同特异度**（1 id+2 class+1 元素）且**源序在后** ⇒ 压得住那把锁；`!important` 同时压掉产物 CSS 的 `[hidden]{display:none!important}` |
| ⑫a | `demo/bench-patch.js:1409-1434` | 收起状态改用类 + `localStorage['bench-props-collapsed']`；`#props-close` 点击 ⇒ 收起；`#toggle-props` 用 `onclick = null` **摘掉产物那个"没选壁纸就弹错"的处理器**再挂自己的两态开关；顺带摘掉产物会加到 `#workspace` 上的 `props-open`（产物 CSS `#workspace.props-open{grid-template-columns:minmax(0,1fr) 360px}` 会让舞台白丢 360px 宽） |
| ⑫b | `demo/index.html:55` + `demo/bench-patch.js:2238` | 捕手 `z-index:35 → 29`（根级：高于内容层 `#pages-track` 的 auto、低于 `#site-header` 的 30）⇒ 弹层收得到点击；点页面其它地方仍然"先命中捕手 ⇒ 关"。不改挂点（仍是 body + pointerdown/click 两条） |
| ⑫c | `demo/bench-patch.js:333-361` | `nextThemeMode()` 两态（dark↔light）；新增 `normalizeThemeMode()`；`themePlan()` 把历史 `'auto'`/非法值**按系统偏好一次性迁移**成具体一态。DICT 的 `theme.auto` **保留**（T1 与上游 `bench/i18n.ts` 逐键比对），只是 UI 不再使用 |
| ⑫c | `demo/bench-patch.js:1700-1730` + `:3532` | 抽 `applyThemeMode()`（落 `data-theme`/`data-mode`/title/图标/存储 + 通知外壳重绘）；bundle 活着时用**属性赋值**换掉产物三态 `onclick`（不与兜底那条 `addEventListener` 叠加）；`ensureThemeFallback()` 的兜底循环也改两态；系统主题变化时**把自己的两态模式钉回去**（迁移前产物内部还记着 `auto`） |
| ⑫c | `demo/index.html:42-48`、`:299-308` | `.theme-btn` 加 `display:inline-flex;align-items:center;justify-content:center;padding:0;line-height:1` + `#theme-toggle .ic{display:block;flex:none}`（消掉内联 SVG 的基线降部留白）；设置弹层删掉 `#theme-state`（"跟随系统"那行），换成 `.theme-seg` + `#theme-dark`/`#theme-light` 两个 `.theme-opt` 开关（`aria-pressed` 表达按下态） |
| ⑬ | `demo/index.html:83` + `demo/bench-patch.js:2268` | `.bench-rd-list{position:fixed;z-index:70;top:auto;left:auto;min-width:0;max-height:min(280px,42vh);overflow-y:auto}`：`fixed` 让浮层脱离 `#toolbar/#main/#workbench/#props-body` 的 overflow 裁剪（这些祖先都没有 transform/contain ⇒ 不是固定定位的包含块）；`min-width:0` 压掉产物那条 `min-width:100%`（fixed 下 100% = 视口宽） |
| ⑬ | `demo/bench-patch.js:576-612` | 新增纯函数 `dropdownLayerPlan(btn, clip, vp, listH)`：贴下方；下方放不下翻上方；左右夹回裁剪盒（`#pages-track` 的 `contain:paint` 盒）；最少给 80px（≈4 行），宁可溢出也不塌成一条缝 |
| ⑬ | `demo/bench-patch.js:645-663`、`:688-690`、`:1788-1790` | 展开时算内联 `left/top/min-width/max-height`（在 `wrap.classList.add('open')` **之后**量 `scrollHeight`，否则 display:none 下量到 0）；`scroll`（**capture**，`#pages-track` 内的滚动不冒泡到 window）+ `resize` ⇒ 直接收起（"不会被滚走"的最简可靠实现） |

### P-125.3 判据与退出码

```
$ node tests/demo-check.mjs                     → 90 通过 / 0 失败   （改前 62/0；新增 D11 共 28 条）  exit=0
$ node tests/demo-syntax-check.mjs              → demo 内联脚本语法：10/10 通过（扫 demo.html + demo/index.html）  exit=0
$ node references/vendor-ref/ww-pages/bench-patch.test.mjs
                                                → 384 通过 / 0 失败  （改前 375/0；新增 T19c 9 条 + T19 主题两态重写）  exit=0
```

D11（`tests/demo-check.mjs:469-633`）逐条覆盖：⑪ 下限在位 / 下限 ≥180px / 收起态豁免 / 顺序改对（类块 + 安全网同款）/
首屏可见高度算术 ≥120px（**读 CSS 里的 order 决定面板算不算在上面**）；⑫a 源序 + 同特异度 + 两个文件都带锁 + JS 四件齐 +
产物 `props-open` 被摘；⑫b 三层 z-index 关系 + 弹层确实在 header 内 + 捕手挂点/事件类型；⑫c 两态纯函数 + DICT 三键仍在 +
两个开关在位且无 `theme-state`/`theme.auto` 钩子 + 不再用 `theme.auto` 渲染 + 居中两声明；⑬ `position:fixed` + `min-width:0` +
祖先链无 transform/filter/contain（逐条规则解析选择器，含属性面板与设置弹层两处下拉的祖先）+ `position()` 时机 +
`scroll(capture)/resize` 收起 + 三条纯函数几何。

### P-125.4 反向变异（每条都是真跑到；下面是实测 RED 原文）

| 变异 | RED（摘录） |
|---|---|
| M1 ⑪ 删掉窄屏下限 | `✗ D9 安全网（@media ≤1180）的每条规则都在 .bench-narrow 类块里有逐字同款（零漂移） — 漂移 1：#main:not(.logs-collapsed) #logs{min-height:clamp(180px,38vh,320px)}` / `✗ D11 ⑪ 窄屏给输出区 #logs 一个可见高度下限…` |
| M2 ⑪ 下限压到 60px | `✗ D11 ⑪ 下限至少 180px（≈9 行 @12px/1.55；改小即红） — 60px` |
| M3 ⑪ 去掉 `order:-1` | `✗ D11 ⑪ 窄屏把 #main 排到面板之前…` / `✗ D11 ⑪ 安全网 @media 里两条同款齐全（下限 + 顺序）` / `✗ D11 ⑪ 980×690 首屏内输出区可见高度 ≥120px… — 顺序=面板之后，可见高度 -151px` |
| M4 ⑫a 折叠规则挪到 `#props[hidden]` 之前 | `✗ D11 ⑫a #props.bench-props-collapsed 的 display:none!important 在 #props[hidden] 之后（源序决胜） — hidden@4360 collapsed@-1` |
| M5 ⑫a 不再摘产物 `#toggle-props` 处理器 | `✗ D11 ⑫a JS：收起按钮 / 工具栏按钮 / 持久化 / 产物处理器摘除 四件都在` |
| M6 ⑫b 捕手 z-index 改回 35 | `✗ D11 ⑫b 捕手 z-index < #site-header 的 30 < 弹层的 40… — catcher=35 header=30 pop=40` |
| M7 ⑫c `nextThemeMode` 改回三态 | `✗ D11 ⑫c 纯函数：两态循环 + 历史 auto 迁移（不再有第三态）` / `✗ T19 主题循环两态 dark ↔ light（不再有第三态 auto）` / `✗ T19 第三次 → dark（两态循环闭合，永不停在 auto）` |
| M8 ⑫c 去掉 flex 居中 | `✗ D11 ⑫c 图标居中：.theme-btn 走 inline-flex 居中 + 内联 svg 块级化（去掉基线降部留白）` |
| M9 ⑬ `.bench-rd-list` 改回 `position:absolute` | `✗ D11 ⑬ .bench-rd-list 改成 position:fixed（脱离 #toolbar{overflow:auto} / #workbench{overflow:hidden} 的裁剪）` |
| M10 ⑬ `dropdownLayerPlan` 不再夹右边界 | `✗ D11 ⑬ 几何③：触发器贴右边界 ⇒ 左缘夹回裁剪盒内（不横溢出） — {"left":940,…}` |
| M11/M11b/M11c/M11d ⑬ 给 `#toolbar` 加 `transform`、`#workbench` 加 `will-change`、`#settings-pop` 加 `contain`、`#props-body` 加 `filter` | 四条都 `✗ D11 ⑬ 固定定位的祖先链上只有 #pages-track 会裁（contain:paint）——其余祖先不得声明 transform/filter/contain/will-change` |
| M12 ⑫a 删掉 `#props-close` 的点击接线 | `✗ T19c 点面板上的「收起」⇒ #props 挂 bench-props-collapsed + 持久化 1… — ["",null]` / `✗ T19c 收起状态可查询（shell API = 探针/测试同一入口） — false` / `✗ T19c 收起后工具栏按钮不再"已按下"… — ["true","checked"]` |

### P-125.5 ⑨ 名称残留清单（"名称没改"到底指哪一处）

扫描面 = `:8901` 真正会发出的文件（`/wallpaper-engine-webgl/` → `we-scene-demo/demo/`；`:8901/` 也被软链指向同一份 `index.html`
⇒ **仓库根那份落地页 `index.html` 在 :8901 上不可达**，它只在 GitHub Pages 的 `/`）。分四类：

| 类别 | 位置（file:line） | 用户是否看得见 |
|---|---|---|
| **(C) URL 别名** | 地址栏 `/wallpaper-engine-webgl/`（软链名 = `references/vendor-ref/ww-pages/wallpaper-engine-webgl` → `we-scene-demo/demo`；服务器打印见 `serve-8901.mjs:81`，说明见 `:14-16`）；运行期前缀改写 `demo/bench-patch.js:549-555/3572/3583`、SW 注册 `/wallpaper-engine-webgl/sw.js`、iframe 缺省 src `demo/bench-patch.js:1988` | **看得见（最可能的那一处）** —— 链接/地址栏文字里的名字 |
| **(B) 上游归属（有意保留）** | 设置弹层 credit 行 `demo/index.html:314`（文案来自 `demo/bench-patch.js:49` DICT `credit.link`）+ 两份许可链接 `:315`；说明页「许可与归属」`demo/index.html:560-564`（zh）/ `:615-619`（en） | **看得见**：一开「设置」就有一条「WebWallGL · oneincase（MIT 许可）」；说明页还有整段命名说明 |
| **(A) 品牌位（运行期已覆盖成 WEwebLoader）** | 静态 `<title>` `demo/index.html:16`、`#site-brand` 静态文本 `:261`、DICT `app.title` `demo/bench-patch.js:49`（zh/en）、产物内 DICT `demo/assets/bench-DSKWIqmS.js:2`（2 处，许可口径不动） | 运行期**应为 WEwebLoader**（`applySiteBrandNow()`，`demo/bench-patch.js:3409-3429`，在 `applyStaticI18n` 之后重放）。**若用户看到旧名**：①刷新前那一帧；②`?shell=off`/`?appname=upstream`；③产物或补丁没跑起来（旧缓存） |
| **(D) 内部/历史（页面上不可见）** | `demo/bench-patch.js` 顶部注释链（`:1/28-31/37-43`）、`THEME_KEY='webwallgl-theme'`（`:1694`）、`demo/sw.js:9/11`（缓存名 `webwallgl-bench-v2`）、产物内的上游 README/`#docs-body`（被 `#docs-view{display:none!important}` 锁住，`demo/index.html:119`）、`demo/assets/renderer-BOSoB05I.js:717` 的**模拟媒体源**品牌（曲名 `WebWallGL`/歌手 `oneincase`，运行期由补丁的 `applyMediaBranding()` 换成壁纸自己的 title/preview；`?brand=0` 才还原） | 不可见（除 `?brand=0` 时壁纸内的媒体组件） |

**候选清单（按"用户最可能看到"排序，供裁定，**本轮未擅自改动归属行**）**：
1. **地址栏 / 链接文字里的 `/wallpaper-engine-webgl/`（C 类，URL 别名）** —— 与用户原话"那个链接里的名称没改"最吻合；
2. **设置弹层里的「WebWallGL · oneincase（MIT 许可）」+ 两份 LICENSE 链接（B 类）** —— 打开「设置」必见；
3. **说明页「许可与归属」那一段（B 类）** —— 打开「说明」必见，且该段自己写着"本产品现名 WEwebLoader"；
4. **浏览器标签标题**（A 类）—— 运行期应是 WEwebLoader；若仍是旧名 ⇒ 需要查"补丁是否真的跑起来"（`window.__benchShellVersion` / `<html data-bench-shell-version>`）。

### P-125.6 未证实项（**不许当已解决**）+ 需要真浏览器验证的清单

1. **⑪ 的首屏判据需要真机复测**：静态侧只证到"顺序 + 下限 + 算术 ≥120px"；真实像素/滚动体感要看
   ① 980×690 下 `#logs` 的 `getBoundingClientRect()`（期望 top≈475、可见高度 ≈153px）；
   ② 面板（资源管理器 / 壁纸配置）现在排在输出之后，用户在横屏下"换壁纸"是否还顺手（**这是本轮唯一有取舍的 UX 变更**）；
   ③ 竖屏 412×915 / 桌面 1440×900 是否零回归（桌面**完全没动**：`order` 只在 `.bench-narrow` 与 ≤1180 安全网里）。
2. **⑫b 的"点语言不再关窗"必须真浏览器验证**：这是纯层叠问题（假 DOM 没有命中测试）——
   要验：打开设置 → 点语言触发器 → 弹层**仍在**且下拉浮层浮在壁纸上 → 选 English → 语言真的切了。
3. **⑬ 的"浮层真的盖在壁纸上"必须真浏览器验证**：要验 `#bench-rd-list` 的 `getBoundingClientRect()` 在视口内、
   `position` 计算值 = `fixed`、展开时 `#toolbar` **不出现滚动条**、页面**不被撑高**、滚一下浮层就收起；
   另外验 `#pages-track{contain:paint}` 这个唯一裁剪盒在 980×690 下不会切掉 280px 的列表（几何上 bottom=690）。
4. **⑫c 的外观需要真浏览器验证**：设置里两个开关的按下态（深色高亮 / 浅色高亮）、
   太阳/月亮图标是否**居中**（本轮只做了 `inline-flex` 居中 + `svg{display:block}` 的静态判据）。
5. **未证实**：`scroll` 的 capture 监听能否收到 `#pages-track` / `#toolbar` 这类**内部滚动容器**的滚动事件（依据是 DOM 捕获路径，
   未真机验证）；即便收不到，`resize`/点外部/Esc 三条收起路径仍在（浮层不会永久悬空，只是滚动时不跟随）。
6. **未证实**：用户机上 `we-bench-theme`/`webwallgl-theme` 若仍是历史 `'auto'`，本轮做法是"启动时迁移 + 系统主题变化时把两态模式钉回去"；
   "迁移后这一次会话里系统主题变化是否 100% 不闪"没有真机数据（`matchMedia` 变更事件的时序未测）。
7. **⑨ 未做**：没有改任何一处旧名（归属行/URL 别名/许可文件名都是有意保留）；"用户看到的到底是哪一处"只给候选清单，等裁定。

### P-125.7 本轮改动文件清单（提交只含这些）

| 文件 | 说明 |
|---|---|
| `demo/index.html` | 静态 CSS：`.theme-btn` 居中 + `.theme-opt` 两开关 + 捕手 `z-index:29` + `#props.bench-props-collapsed` + `.bench-rd-list{position:fixed}`；窄屏块/安全网：`#workbench` flex 列 + `#main{order:-1}` + `#logs` 下限；DOM：主题两个开关、`#theme-state` 删除、`#theme-toggle` 的 `data-i18n-title` 改 `theme.dark`；说明页主题文案（zh/en） |
| `demo/bench-patch.js` | 主题两态纯函数（`nextThemeMode`/`normalizeThemeMode`/`themePlan`）+ `applyThemeMode` + 产物三态处理器替换 + 历史 auto 迁移；`dropdownLayerPlan` + `bindDropdown.position()` + scroll/resize 收起；`setPropsCollapsed` 收起链路；`maxLogsForLayout` 地板 60→120；SITE_LAYOUT_CSS 同步全部新增/修改的全局规则 |
| `tests/demo-check.mjs` | 新增 D11（28 条）+ D8/D9 自动纳入新规则 |
| `docs/PATCHES.md` | 本节 P-125 |
| **仓外（不在 git）**：`references/vendor-ref/ww-pages/bench-patch.test.mjs` | T19 主题段按两态**重写**（4 条断言）+ 新增 T19c 9 条 ⇒ 375/0 → **384/0**。这条改动是"用户新要求覆盖旧规格"（旧规格写的就是三态循环），已在回报中显著登记 |
| **未改**：`web/diag-flags.json` | 它是 `tests/diag-flag-check.mjs` 的生成物（本轮**没有**主动跑它；工作树里那条 ` M` 是并行线跑门禁时按 `demo.html` 行号位移重算的，`generatedAt` 也变了）。按"只提交自己路径"未进本次提交（与 P-124.8 同一处置），**留给集成线** |
| **未改**：`tests/run-all-tests.sh` | 本轮新增 28 条 D11 断言后，脚本里若有写死的断言计数会过期；已确认没有脚本校验这个计数（不是门禁红项），登记待办 |

---

## P-126（2026-09-19 用户第 ⑦/⑧ 项 · 粒子/萤火虫）萤火虫 authored 紫色整条不上屏 + 雾 2 精灵表帧时序倒放/慢 4 倍 + 四个粒子算子口径（含"⑧-4/⑧-5 必须同批"）

> **判据来源**：`docs/PARTICLE-FIREFLY-INVESTIGATION.md`（同工作区 `dsbw-ref` 侧的**只读**调查报告，2026-09-18）§4 的
> "能变红"判据清单。本节的每一个数字都是**秒级单项**命令实测（**未开浏览器、未跑 `run-all-tests.sh`/`package-matrix`/
> `glsl-validate`/`build-pages.mjs`**）。
> **许可**：调查里引的 `lwe-ref`（linux-wallpaperengine，GPL-3.0-only）与 `wer-ref`（GPL-2.0-only）是**第三方参考实现**，
> 本批**只读其行为结论**；实现按**官方 WE shader 资产**（`assets/shaders/genericparticle.frag`）与**本机 `.tex` 帧表实测**
> 独立写出，**未复制/未逐行翻译**其代码、注释、常量组织或错误文案（照抄检查见本节 P-126.9）。
> **编号**：任务书指定 P-125，但 `docs/PATCHES.md` 的 **P-125 已被并行线占用**（用户第 ⑪/⑫/⑬ 条，commit `5349b16`）；
> 按"号段不许撞"改用 **P-126**。

### P-126.1 ⑧-1 逐粒子 RGB：萤火虫从"白点"回到 authored 紫色（用户最显眼的那条）

**现场**（改动前，`core/we-scene-bundle.js`）：
* `:10153` `const color1 = [1,1,1], color2 = [1,1,1]` —— **硬编码恒白**；
  `:10165-10168` `colorR/G/B = mix(color1, color2, clamp01(p.color[0]))` ⇒ **三个分量恒等于 1**。
  ⚠ 真正把颜色丢掉的是**这一步**（调查 §2 ⑧-1 只点到 `:10197` 的"解构时空位跳过"）—— 即使把 `vis[3..5]` 接进顶点，
  只要还走这个 `mix` 就仍然是白色。
* 顶点布局 36B = pos3+uv2+uv2B+blend+alpha（`:7366`），**没有颜色属性**；FS `:5841` 旧式 `u_Color * tex.rgb`；
  绘制时 `u_Color` 恒 `(1,1,1)`。⇒ `colorrandom`（hina 4569 = `102 100 188`→`66 35 148`）与
  `instanceoverride.colorn=[0.41176,0.30588,0.69412]`（`replacesColor:true`）**永远不上屏**。

**改法**（三处，缺一不可）：
1. **颜色源**：`p.color`（`colorrandom` 插值 / `colorchange` / `applyInstanceOverride` 的 `colorn|color`）直接作为逐粒子 RGB
   —— 官方 `genericparticle.frag:39/43/46` 是 `color = v_Color * Convert(tex)`，**没有 color1/color2 uniform**。
2. **颜色通道**：新增**独立顶点缓冲** `partColorVBO` + 属性 `a_Color`（3 float/顶点、stride 12，`getAttribLocation >= 0` 才启用）。
   **几何缓冲一个字节都不动**（仍 36B/9 float）—— 这样既有 mock-GL 顶点流断言、`particle-shape-audit` 的 9-float 解析、
   `render-audit` 参考产物**全部逐位不变**（比"把 stride 扩到 48"少了 6 个测试文件的连带改动与参考产物失效）。
3. **整批同色上提**：整批粒子颜色相同（`io.replacesColor` 层、无 `colorrandom` 层、`min==max` 层）时把颜色写进
   `u_Color`、顶点色恒 1；逐粒子不同色时才走 `a_Color`。FS = `u_Color * v_Color * tex.rgb`，两者都为 1 时与改前**逐位一致**。

**判据实测**（`node tests/particle-render-correctness-test.mjs`，mock-GL 记录 draw 时的 uniform 与颜色缓冲）：

| 断言 | 实测 |
|---|---|
| ⑥A 层4569 萤火虫 `u_Color` | **`[0.41176,0.30588,0.69412]`** = `instanceoverride.colorn`（旧实现 `[1,1,1]`） |
| ⑥A 层4569 通道记账 | `colorUni=1 / colorAttr=0`（整批同色走上提） |
| ⑥A 层6271 萤火虫（无 colorn） | `colorAttr=1`、逐顶点色 **spread=5** 且全在 authored 紫区间 `[66..102, 35..100, 148..188]/255` |
| ⑥A 默认层（无 colorrandom） | `u_Color=(1,1,1)`、顶点色恒 1（**与改前逐位一致**） |

### P-126.2 ⑦a 精灵表帧时序：雾 2 从"16 帧/s 倒放、逐粒子各自相位"改成"64 帧/s 正放、同年龄同帧"

**现场**：`:10155 / :10162`（旧）`fv = (1 − lifePos) · (sys.seqMul || 1)` ⇒ 速率 = 1/life
（hina 雾 2 的 `lifetimerandom 3..5` ⇒ **≈16 帧/s**）、lifePos 增大 ⇒ `fv` 减小 ⇒ **倒放**、
且每个粒子按**自己的寿命**算相位 ⇒ **同屏粒子显示不同帧**。
**改法**：`spriteFrameValue()` = `frac(age · seqMul / duration)`，`duration` = TEXS 帧表 Σ `frametime`
（fog3 实测 64 帧 / `frametime 0.015625` / `duration 1`）；`?pframe=legacy` 回退旧式。只在 `duration > 0` 时改变行为。

**判据实测**（真 fog3 贴图 + 合成 def ⇒ 年龄精确可钉）：

| 量 | official（本批） | legacy（`?pframe=legacy`） | 调查 §2.3 的官方对拍值 |
|---|---|---|---|
| `age=0.25s` | **frame 16** | 59~62 | 官方 16 / 我们 60 ✅ |
| `age=0.5s` | frame 32 | 54~56 | — |
| `age=1.0s`（= duration） | frame 0（整圈折返） | 44~48 | 官方 0 / 我们 48 ✅ |

### P-126.3 ⑧-3 `oscillatealpha` 加性 → 乘性

**现场** `:3595-3610`（旧）：`alpha = clamp(base + a·cos(2πft+φ), 0, 1)`，且 `scalemax` 缺省**取 `smin`**
⇒ 只写 `scalemin` 的层（语料三处萤火虫 def 都是 `{frequencymin:10..20, scalemin:0.7}`）**幅度恒 0 / 摆动过深**。
**改法**：官方乘性 `alpha = base · mix(smin, smax, (cos(2πf·age+φ)+1)/2)`、`scalemax` 缺省 **1**；
同文件里那段被**重复 `case`** 挡成死代码的 `:3703-3712` 一并**删除**（连同另外 3 段重复 `case`：`turbulence`/`oscillatesize`/`oscillateposition`
—— JS `switch` 取第一个匹配分支，留着既是"看着像已修其实没生效"的来源，也是一颗雷）。

**判据实测**（60s × 0.05s 步进）：

| base | official | legacy（P-124） |
|---|---|---|
| 0.5 | **[0.3500, 0.5000]**、`zeroFrac = 0%` | `[0, 1]`、**24.9% 周期 α=0（整颗消失）** |
| 1.0 | **[0.7000, 1.0000]** | `[0.3000, 1.0000]` |

### P-126.4 ⑧-4 + ⑧-5 **同批**：`oscillateposition` 逐轴增量 + `controlpointattract` 判据方向

**现场**：`:3615-3626`（旧）`p.pos = 首次锚点 + 幅度·cos(单一频率/相位)` —— **每帧覆盖位置** ⇒
`movement`/`turbulence`/`attract` 累积的漂移**全被抹掉**；`:3641`（旧）`if (d > thr)` 与官方 `d < threshold/2` **正好相反**。
**改法**：`pos[ax] += −sc[ax]·ω·sin(ω·age+φ[ax])·dt`（三轴各自频率/幅度/相位）；判据翻成 `d < thr`。
⚠ 三轴参数由出生时**同一个 `p.random`** 派生（`×1/7919/104729`），**不额外抽 `rng()`** —— 否则整条 RNG 流平移，
发射数/其它算子全变，"只改本算子"的 A/B 就不可比（也与既有"不偷抽随机数"惯例一致）。

**判据实测**（hina 4569 真 def + 真 `instanceoverride`，240 帧 × 1/60s，逐粒子轨迹）：

| 量 | official | legacy（P-124） |
|---|---|---|
| 每颗粒子 `corr(x,y)` | `[0.188, −0.739, 0.066]` ⇒ **maxAbs 0.7387 < 0.99** | `[−1.000, −1.000, −1.000]` ⇒ **maxAbs 1.0000** |
| 平均位置漂移（前后半段） | **493.5 px ≠ 0** | 0（被覆盖式抹掉） |
| 出生域 bbox 内？ | ✅ `x∈[3891,4594] ⊂ [1205,5189]`、`y∈[1767,2253] ⊂ [1163,3099]` | ✅（但沿固定对角线） |

**⑧-5 单点判据**（无指针、退化目标 = 层空间 offset 当世界坐标 ⇒ 目标 (0,0)、`threshold 70` ⇒ `thr 35`）：

| 距离 | official | legacy |
|---|---|---|
| `d=500px` | **\|Δv\| = 0（不施力）** | \|Δv\| = 16.6667（施力 ⇒ 推飞） |
| `d=10px` | \|Δv\| = 16.6667（= \|scale\|·dt） | 0 |

**并联判据实测**（任务书点名的那条）：把**只** attract 判据改回反向、`oscillateposition` 保持官方（= 变异 M6），
萤火虫 240 帧跑到 `x∈[3990,5535]`，**越过出生域 bbox 上界 5189** ⇒ 断言
`⑥D 并联判据：官方口径下粒子全程落在出生域 bbox 内` **变红**（rc=1）。
调查 §2 ⑧-5 预测"漂到 x≈9700px"；本批实现的实测落点是 **5535px** —— **方向一致、量级不同**
（原因：本实现的三轴参数不抽 `rng()`、且 240 帧窗口比调查那次短），已在 P-126.8 登记。

### P-126.5 F：`turbulence` mask 缺省 + `starttime` 语义文档化

* **⑧-6**：`turbulence` 的 `mask` 缺省 `[1,0,0]` → **(1,1,0)**（`?pops=legacy` 回退）。
  hina 两个萤火虫 def **都没写 mask** ⇒ 旧行为只沿 x 推。实测：无 mask 的 def 跑 120 帧，
  `max|vy| = 12.61`（official）/ **`0.00`**（legacy）。
* **⑧-8**：`starttime=15` 是**官方语义**（不是 bug），本轮加一条**文档化断言**钉住：
  4569 的 `starttime === 15`、`simulateParticleSystem(t=10)` 存活 **0** 颗、`t=25` 存活 **10** 颗。
  （真机验收必须先等到 `t>15s`，否则"看不到萤火虫"会被误判成没修。）

### P-126.6 门禁与单项回归（逐个 rc，全绿）

| 命令 | 结果 |
|---|---|
| `node tests/particle-render-correctness-test.mjs` | **54 通过 / 0 失败**（原 33 → **+21 条 P-126 断言**）rc=0 |
| `node tests/p74-instanceoverride-test.mjs` | 60/60 rc=0 |
| `node tests/mock-gl-test.mjs` | 60/60 rc=0（**stride=36 断言仍成立** ⇒ 几何布局确实没动） |
| `node tests/particle-shape-audit.mjs 3554161528` | rc=0（形状/贴图像素通道逐值不变） |
| `node tests/submesh-probe-test.mjs` | 56/0 rc=0 |
| `node tests/render-audit.mjs 3719111841` | rc=0 |
| `node tests/particle-sprite-verify.mjs` | 10/10 rc=0 |
| `node tests/multi-sprite-test.mjs` | 28/28 rc=0 |
| `node tests/sprite-sheet-test.mjs` | rc=0 |
| `node tests/particle-preset-fallback-test.mjs` | 57/57 rc=0 |
| `node tests/p74-instanceoverride-audit.mjs` | rc=0 |
| `node tests/diag-flag-check.mjs` | **151 == 151，0 差异** rc=0（新开关 `pframe`/`pops` 已进主表） |
| `node tests/docs-check.mjs` | rc=0 |
| `node --check core/we-scene-bundle.js` | rc=0 |

### P-126.7 变异矩阵（**在 `/tmp` 真文件副本上做**；真树跑前跑后 sha256 逐字节相同）

`/tmp/p125-probe/mutate.mjs`：手工 `readFileSync/writeFileSync` 拷贝**整个 `core/`**（bundle 还 import 兄弟模块）
+ 测试文件到 `/tmp/p125-mut/<id>/`，逐条把修复改回旧写法后跑门禁。真树 `core/we-scene-bundle.js` 的 sha256 = `2f46137b…`、`tests/particle-render-correctness-test.mjs` 的 sha256 = `a83e52fb…`，
**跑前 = 跑后**（`/tmp/p125-probe/mut-final.txt` 是最后一次完整矩阵输出）。

| 变异 | 改回什么 | rc | 变红的断言 |
|---|---|---|---|
| M1 | A：`u_Color` 恢复恒 `(1,1,1)` | 1 | `⑥A 层4569 … u_Color = instanceoverride.colorn` |
| M2 | A：颜色源恢复恒白 `mix(color1,color2,·)` | 1 | `⑥A 层4569` + `⑥A 层6271`（spread=1、样本 1,1,1） |
| M3 | B：帧值退回 `(1−lifePos)·seqMul` | 1 | `⑥B fog3 age=0.25s ⇒ frame 16`（得 `{60,59}`）+ 0.5s + 1.0s 三条 |
| M4 | C：`oscillatealpha` 退回加性+clamp | 1 | `⑥C base=0.5`（得 `[0,1]`、24.9% 触 0）+ `⑥C base=1` |
| M5 | D⑧-4：`oscillateposition` 退回每帧覆盖 | 1 | `⑥D 萤火虫 240 帧：每颗粒子 \|corr\| < 0.99`（得 maxAbs 1.0000） |
| M6 | D⑧-5：**只**把 attract 判据改回反向 | 1 | `⑥D 并联判据`（x 越界到 5535）+ 两条 `⑥D ⑧-5` |
| M7 | F⑧-6：`turbulence` mask 缺省退回 `[1,0,0]` | 1 | `⑥F turbulence 无 mask ⇒ 缺省 (1,1,0)`（得 max\|vy\|=0.00） |

### P-126.8 未做 / 未证实（下一轮开工点）

1. **⑧-2 `children`（eventfollow → `firefliestrail`（.json，包内条目）本轮未做** —— 萤火虫**没有拖尾**这条仍在。
   **开工点**（已探明，下一轮可直接照做）：
   * `grep -c children core/we-scene-bundle.js` 仍为 **0**；缺失在三处：`buildParticleSystem`（`:3200-3280` 不读 `def.children`）、
     `stepParticles`（`:3289-3345` 没有"父粒子事件 → 生成子系"）、`renderParticleLayer`（`:10200+` 只画一个 `sys`）。
   * 语料真实字段（hina 4569/6271 逐字读到）：`children:[{type:"eventfollow", name:"particles/presets/firefliestrail.json",
     maxcount:20, scale:"1.5 1.5 1", origin:"0 0 0", angles:"0 0 0", probability:1, controlpointstartindex:null, flags:null}]`
     （上行 `name` 里的 json 后缀是 **pkg 内条目**，不是磁盘文件）
     —— 与调查 §2.5 行 2 一致（`wer-ref` 只作行为对照：`eventfollow → EVENT_FOLLOW`）。
   * **缺的数据是"贴图"**：子系有自己的 `material`（`firefliestrail`（.json）→ 它自己的 `.tex`），而
     `textures` 映射是**宿主**（`demo.html:1733/1767-1772` 逐层读 `layer.particleTexName`）准备的；核心侧拿不到子系贴图
     ⇒ 必须先在**宿主**加"把子系材质的纹理也加载进 `textures`（键名建议 `child:<name>`）"，核心再按 `sys.children[]` 分组绘制。
     另一条更省的路（次选）：把子系当**独立的临时粒子层**渲染（复用同一 `renderParticleLayer` 的绘制块，传子系的 tex/blending）。
   * ⚠ `demo.html` 当前**正被并行线修改**（工作树里 ` M demo.html`），下一轮开工前先 `git status` / 与集成线对齐再动它。
2. **⑧-7 `constantshadervalues`（overbright）未做**：粒子路径仍不读材质常量 ⇒ `overbright>1` 的层（雪景远景 1.77、cherry 1.21）
   仍比官方暗。**卡点同 1**：材质 JSON 是宿主读的（`demo.html:1733` 只把 `passes[0].textures[0]` 与 `blending` 交给渲染器），
   核心侧没有材质对象 ⇒ 需要宿主多传一行（建议 `layer.particleConstants = passes[0].constantshadervalues`），
   核心再 `u_Color *= clamp(overbright,0,5)`（官方 `genericparticle.frag:10/:61`）。同属"要动并行线文件"。
3. **报告勘误（供集成线回写调查 §1 ⑦-3 / §4 ⑦c）**：`colorrandom` 只写 `min:"255 255 255"`（无 `max`）时，
   我们的缺省 `max=[1,1,1]` + `k=1/255` ⇒ 颜色 = `(255 + rng·(1−255))/255 = 1 − rng·254/255 ∈ [0.0039, 1]`，
   **恒为非负**；调查报告写的"∈[−1,1]、可为负"是算式笔误（`255/255` 被算成了 2）。⇒ §4 ⑦c 那条判据
   （"今天会得到负值 ⇒ 红"）**不成立**，本轮未按它改；`colorrandom` 缺 `max` 的**官方缺省口径**仍未证实（需要官方资产/二进制证据）。
4. **`controlpointattract` 的目标空间**仍未定：官方是"控制点位置 + origin"，我们把层空间 `controlpoint.offset`
   当世界坐标用（无指针时退化成世界 `(0,0)`）。本批**只纠正判据方向**；正确换算（层 origin + 旋转/缩放后的 offset）
   与"flags=1 且无鼠标时控制点到底停在哪"需要真机/官方对照（调查 §5.4）。
5. **`oscillatesize` 的相位基准仍是全局 `t`**（不是 `age`）：调查未把它列为缺陷，本批不动（改它会平移整批粒子的尺寸相位）。
6. **`oscillate*` 的 `phasemax + 2π`**（调查 §5.3 存疑项）：未采纳，`phasemax` 缺省仍 `2π`。
7. **`turbulence` 的 `scale`/`speed` 缺省**仍是 `0.002`/`0..0`（官方 `0.005`/`500..1000`）：只改了 `mask` 缺省
   （任务书点名的那条）。改 speed 缺省会让"没写 speed 的层"从空转变成长距离漂移，风险大于收益，未做。
8. **真机像素确认清单**（需要头浏览器，本机禁开）：
   * `?id=3554161528&ln=17`（第 18 层 = `objects[17]` = id 835「雾 2」）：雾应**快速翻滚、同屏一致**（64 帧/s 正放）；
     对照 `&pframe=legacy` 应看到"帧几乎不动/缓慢倒放"。⚠ 该层贴图 `particle/fog/fog3` **不在包内**，
     依赖宿主 `/weassist` 兜底（本机 `wallpaper_engine/assets/materials/particle/fog/fog3.tex` 存在）；
     若页内出现 `[粒子] 跳过无贴图层 "雾 2"` ⇒ 该环境整层没画（与帧时序无关）。
   * `?id=3554161528&ln=22`（第 23 层 = `objects[22]` = id 4569「萤火虫」）：**紫色**萤火虫（不再是白点）、
     **等 `t>15s`**（`starttime=15`）才出现；对照 `&pops=legacy` 应看到"沿固定对角线来回 + 高频闪没"。
     第 24 层 `&ln=23`（id 6271，无 `colorn`，走 `colorrandom`）应看到**逐粒子深浅不同的紫**。
   * 拖尾（⑧-2）**本轮不会出现** —— 别把它当成"没修好"的判据。
9. **预构建产物**：`demo/assets/renderer-BOSoB05I.js`（Pages/在线 demo 外壳用的产物）**是旧的** ——
   本机 dev server 的 `demo.html` 走 `/bundle.js` 路由 → 服务端**实时读 `core/we-scene-bundle.js`**（`server/we-scene-demo-server.mjs:388-396`），
   所以**本地服务器刷新即生效**；但**在线/Pages 产物要等集成线重跑 `build-pages.mjs`**（重活，本轮禁跑）。

### P-126.9 本轮改动文件清单（提交只含这些）

| 文件 | 说明 |
|---|---|
| `core/we-scene-bundle.js` | A：`a_Color`/`partColorVBO`（独立 VBO、几何 36B 不动）+ 颜色源改 `p.color` + 整批同色上提 `u_Color` + FS `u_Color*v_Color*tex.rgb`；B：`spriteFrameValue()`（age/duration）+ `PFRAME_MODE`；C/D/F：`oscillatealpha` 乘性、`oscillateposition` 逐轴增量、`controlpointattract` 判据、`turbulence` mask 缺省 + `POPS_MODE` + 删 4 段重复 `case` 死代码；`partStat.colorUni/colorAttr/pframeMode/popsMode` |
| `tests/particle-render-correctness-test.mjs` | mock-GL 扩展（逐 draw uniform 快照 / 按缓冲 id 的顶点流 / `a_Color` 槽位）；`setModes` 增 `pframe`/`pops`；`renderQuad`/`renderRealLayer` 增可选贴图与按 id 选层；**新增 ⑥A–⑥F 共 21 条断言**（33 → 54） |
| `docs/README-DIAGNOSTICS.md` | 主表新增 `pframe` / `pops` 两行（`diag-flag-check` 双向比对 **151 == 151**） |
| `docs/PATCHES.md` | 本节 P-126 |
| `docs/AUDIT.md` | 第 6 条（"粒子 alpha/颜色被丢弃"）补一句更正：alpha 半在 P-59 已修、**RGB 半由 P-126 才真正修**（原文"rgb 选择器暂无观感差异"已不成立——萤火虫本是紫色） |
| **未改**：`tests/run-all-tests.sh` | 本轮**没有新增测试文件**（断言加在既有 `particle-render-correctness-test.mjs` 内）⇒ 无需新增注册行；该脚本一行未动 |
| **未改**：`web/diag-flags.json` | `tests/diag-flag-check.mjs` 的生成物；本轮跑过该脚本（工作树里那条 ` M` 是生成物刷新，与并行线同一处置）⇒ **不进本次提交**，留给集成线 |
| **未改**：`demo.html` / `demo/index.html` / `demo/bench-patch.js` / `tests/demo-check.mjs` | 并行线正在改，本轮零触碰（⑧-2/⑧-7 的宿主接线因此留给下一轮） |
| **未改**：`/root/Desktop/DSHarea/docs/PARTICLE-FIREFLY-INVESTIGATION.md` | 调查报告（工作区级、非本仓），本轮只读；勘误写在 P-126.8-3 |
