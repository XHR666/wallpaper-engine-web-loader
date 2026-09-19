# README-DIAGNOSTICS.md — we-scene 渲染器诊断/控制开关总表（2026-09-14，P-109 追加 `submesh`/`subtri` 两行）

> **本表由代码确认，非手抄**：开关全集由 `node diag-flag-check.mjs`（MERGED-3 2.2）从
> `core/we-scene-bundle.js` / `demo.html` / `elysia/**/*.js` / `dsh-mpkg-wallpaper/lib/client.js`
> 的 `URLSearchParams` / `new URL(...).searchParams` / 正则 `[?&]name=` / 白名单 localStorage
> 解析点抓取（当前 **153** 个：含 P-112-BANDGEOM 的 `bandfeed`/`framegeom`、P-131 批D 的 `audioemit` 与插件侧 `lgcss`）。本表主表与其双向比对，任何一侧多出/缺失都会非零退出。
> ①(2026-09-19) 本行计数以 `node tests/diag-flag-check.mjs` 的实际输出为准；批 D 之前本行写 149、实测 152（陈旧 3），本批一并更正并 +1（`audioemit`）。
> **插件侧开关也在本表**：扫描面含 `dsh-mpkg-wallpaper/lib/client.js`，所以插件新增的开关（如 `hdrfrostwatch`）同样必须登记 —— 缺一条 `diag-flag-check` 就会报红。
>
> - 用法：把开关拼到渲染器页 URL，如 `http://127.0.0.1:8899/?id=3719111841&audit=3&showui`。
>   插件场景 iframe 由 `applySceneViaRenderer` 自动携带 `embed=1&noreport=1&thumbpost=…`
>   （`extbase` 由设置项 `sceneExtUrl` 决定）。
>   ⚠ **`skin0` 绝不能进生产壁纸 URL**：它是"存在即关蒙皮"的二分开关（见下表），带上它壁纸里
>   5 个 mesh 层会退化成未蒙皮 quad，画面永远对不上标定/测试验证过的路径。历史上误带过一次，
>   已在插件侧移除并对已存 `webUrl` 做就地清理（PATCHES P-31、PLUGIN-BUGS-TRACKER 批次 14）。
> - "默认"列 = 不加该参数时的行为。"解析位置" = 文件:行（行号随代码漂移，以文件为准）。
> - 计划中：`?perf=1`、`?selfcheck=1`（合并任务书 ② 引入后由脚本自动收编，本表暂无 → 不许提前写）。

<!-- FLAG-TABLE-BEGIN -->

## ① 渲染语义（A/B 对照官方实现）

| 开关 | 取值 | 默认 | 作用（一句话） | 什么时候用 | 回退/风险 | 解析位置 |
|---|---|---|---|---|---|---|
| `att` | `legacy` | elysia 移植锚点 | 附件锚点走旧的 anchorsOf/mkOff 自算路径 | 锚点数学回归 A/B | 旧路径位置误差大（中位 782px），仅对照用 | demo.html:434 |
| `mcc` | `1` / `0` | 关 | 强制开启"网格包围盒中心补偿"（旧自造行为） | 位置 A/B（`?mcc=1` 开 / 不加或 `=0` 关） | 开启会让附件层偏移（官方无此步） | core/we-scene-bundle.js:2626 |
| `piv` | `1` / `0` | 仅"眼睛组合" | 子网格中心补偿(pivot)全开 / 全关 | pivot 回归 A/B | 全开会让长发等附件甩出屏外 | demo.html:641 |
| `align` | `0` | 官方对齐 | `?align=0` 复现旧行为（origin 恒几何中心，非 center 对齐层不偏移） | 对齐语义 A/B | 旧行为有 60 层非 center 对齐误差 | demo.html:1719 |
| `parallax` | `legacy` | 官方公式 | 视差鼠标向量退回旧 lwe 近似式 `(depth+amount)×disp` | 视差 A/B（官方式默认） | legacy 式量级/方向不对（3840 倍差） | demo.html:1717 |
| `parspace` | `legacy` | 世界像素（与 origin 合并平移） | **对象级视差位移的空间口径回退**（P-76 修 ①-A）：`legacy` = 位移在 `mat4Scale(m,w,h,1)` **之后**后乘 ⇒ 被本层 `w/h` 再放大一次。凯尔希 3719111841 `背景正常` w=4244.28 ⇒ 世界位移 0.3863px 被放大成 **1639.4px**、2341.0px，正是用户"身后的背景没有/屏幕左侧盖不到"与真机每帧 `【帧N】左缘=178,178,178`（页面灰）+ 台账 `rd=[1430,-2518,4246,2546]`（官方标定应 `[-208.63,-208.73,4244.28,2546.57]`）的根因。不写 = 位移按**世界像素**与 origin 合并成一次平移 | 怀疑"某个大尺寸层（尤其满幅背景）整体被平移出屏"时；`?parspace=legacy` 复现旧 bug 做 A/B | 官方公式 `offset=((node_pos−cam_pos)+mouse)∘depth×amount` 的量纲就是设计像素，legacy 只作 bug 复现，**不是**可选画风 | core/we-scene-bundle.js:3889 |
| `paroff` | `legacy` | 受门控关 | **`parallaxOff` 对对象级视差的门控回退**（P-76 修 ①-B）：demo.html 默认 `parallaxOff=true`（"视差整体停用"），旧实现只把鼠标项 `parDispX/Y` 置 0、对象级 `(node_pos−cam_pos)` 项照旧生效 ⇒ "关掉视差"后仍有与鼠标无关的常量位移。`legacy` = 回到不门控的旧口径。不写 = `parallaxOff` 时对象级视差整体停用（与场景级门控 + demo 注释契约一致） | 想验证"关掉视差后仍有常量位移"这条旧行为时；单独用 `?paroff=legacy` 即可复现（位移只 0.386 世界像素，无害；要凑出真机那个 1639px 必须叠加 `?parspace=legacy`） | 与 `parallax=1` 配合：视差开时两种口径一致；`?paroff=legacy` 下 `?parallax` 不写也会保留 (o−cam) 常量项 | core/we-scene-bundle.js:3899 |
| `qflip` | `1` / `0` | **跟随 `projy`**（fix → 关；legacy → 开） | 四边形层纹理 v 轴翻转。①(P-69 修正定案) 2026-09-12 的"四边形路径 v 轴与官方相反"是**误诊**：真因是相机投影 y 轴反了（世界 y=0 被画到屏幕底），而 v 翻转对**中心恰在 y=1080 的层**等价于那次镜像 ⇒ 背景/满幅层看起来"同时变正"；对中心不在 1080 的层（花朵 cy=1640.55、时钟 cy=8）只能翻内容、翻不动位置 ⇒ 位置误差一直留着 | 排查"某层内容上下颠倒" | 修正口径下再 `?qflip=1` 会与正确内容叠加 → 内容真的上下颠倒 | core/we-scene-bundle.js:5128 |
| `projy` | `legacy` | fix（世界 y=0 → 屏幕顶） | **相机投影 y 轴口径**（P-69 用户第 1 项根因；①P-133 起**粒子 CPU NDC 也归它管**）：`legacy` = 旧的镜像口径（世界 y=0 → NDC −1 = 屏幕底），所有走 `viewProj` 的**四边形层**以及**粒子层**（P-133 #2：粒子路径的 NDC 由 CPU 直算、`u_MVP` 是 IDENT_M4 ⇒ 此前一直停在 P-69 之前的镜像口径，鼠标尾迹因此「鼠标往上、粒子往下」）**绕屏幕水平中线镜像**（真机 3554161528 花朵 1640.55→519.45 画到上半屏；钢琴 1053→1107 只差 54px 所以"只有花朵看着不对"）。不写 = 修正口径，与 `MESH_VERT`（蒙皮层，本来就是 y-down）、`preview.mjs` 的 `orthoYDown` 同式 | 怀疑"某四边形层位置上下不对 / 整屏像翻过来"时；对照旧口径复现 bug | ⚠ **默认值与 `qflip` 耦合**：`projy` 不写(fix) ⇒ `qflip` 默认**关**；`?projy=legacy` ⇒ `qflip` 默认**开**（改 `qflip` 默认值时必须一起想，见 PATCHES P-69 的误诊说明）。`legacy` 与改动前逐位一致，画面退回镜像构图 | core/we-scene-bundle.js:2262 |
| `parenty` | `legacy` | 同 `projy` | `projy=legacy` 的**别名**（任务书/用户口述里用的名字）。注意真因**不是**"子层 y 被当成 y 向下加"：父子合并的两种口径都算过，`钢琴` 对照层证明父链合并是对的（见 PATCHES.md P-69 假设裁定） | 同 `projy` | 同 `projy` | core/we-scene-bundle.js:2262 |
| `projmode` | `persp` / `ortho` / `auto` | `auto` | **投影档（P-107）：透视相机（`general.fov`）的落地开关**。`auto` = 按场景自己的声明走 —— `general.orthogonalprojection` 有矩形 ⇒ 正交（**逐位**等于改动前）；矩形缺省/`null` **且**声明了 `general.fov`（= 旧 `isOrtho` 谓词取反，正是「3D 场景」的判据）⇒ 透视（`buildCamera` 才构造 `mat4Perspective`）。`persp` = 强制透视（正交包也照 fov 画：**z=0 平面与正交档只差 Float32 舍入**（凯尔希 39 层实测 maxΔ=1.74e-4px），z≠0 的层按 `d/(d−z)` 近大远小 ⇒ 安全的 A/B 探针）。`ortho` = 强制正交 = **全语料逐位回到改动前**。透视有两条锚定（唯一真值表在 `buildCamera` 内）：**节点锚定**（非正交包 + 相机节点有可用 `origin.z`，如 3509243656 的 `0 0 6` ⇒ 相机=作者位置、朝 −z；y 按 `PROJ_H − origin.y` 同式翻转补偿，屏幕仍是 y-down）与**帧平面锚定**（其余情况：相机钉在 (取景窗口中心, −d)、`d = (framedH/2)/tan(fov/2)` ⇒ z=0 平面即正交档；zoom 已进 framed 窗口故不重复乘）。fov 取值链 = pose 关键帧 → **用户属性绑定**（面板「视场」滑块，如 `newproperty71` ↦ `fovFromUser`）→ 绑定静态值 → 相机节点值 → `general.fov` → 50；`zoom` 在节点锚定档进投影（`proj[0]/proj[5] × zoom`，与 elysia 透视分支同式） | 怀疑「没有正交矩形的 3D 包被压成一个平面 / fov 不起作用」时；`?projmode=ortho` 一键回到改动前画面，`?projmode=persp` 把 2D 包也按 fov 画来做 A/B（z=0 层不动、只有立体层变） | ⚠ **不能写成 `?proj=`**：那个名字属 P-85（`?proj=off` = 跳过官方 project.json 读取，demo.html:3039），语义无关，混用会"改属性表 + 改投影"同时发生。正交包（语料 20/21）在 `auto` 下**零变化**（`camera-persp-test` ③ 冻结实现对拍 3 真包 × 3 档 + 合成包 × 5 档全 `===`）；**未定**：相机 `angles`（朝向）未接、蒙皮层 `MESH_VS` 与粒子 CPU NDC 仍走各自旧通路（本档只改走 `viewProj` 的四边形层/粒子层投影） | core/we-scene-bundle.js:4212 |
| `psim` | `replay` | incr（按输入签名缓存 + 每帧只推进 dt） | **粒子模拟档**（P-69 用户第 2 项"很多粒子一直在一起渲染，非常卡"）：`replay` = 旧行为（每帧重建粒子系统并从 0 重放历史；hina id389 `cherry blossoms on cursor` 每帧 1286 步 × ~165 粒 ≈ 9.2 万次更新、单层 62.8ms/帧）；不写 = incr（稳态 6 步 / 410 次更新、2.2ms/帧，**存活粒子数与顶点流逐位不变**）。时间倒退或层输入变化 → 自动重建重放（首帧与旧行为一致） | 帧率低且包内有高 rate/大 maxcount 粒子层时；`?psim=replay` 做 A/B | `replay` 只是更慢、画面不变；incr 在 `?time=` 循环/改属性触发重建时有一次重放 | core/we-scene-bundle.js:6981 |
| `bones` | 层 id 或层名（子串） | 无（**关**） | **逐骨位姿只读探针**（P-69 第 4 项取证；给"眉毛眨眼翻 180°"/"眼睛随呼吸左右移"用）：点名一层后，每帧反解该层每根骨的 `(angle, tx, ty)` 写进 `window.__mpwBones = {layer, id, nb, frames:[{t, bones:[[ang,tx,ty]…], flips:[{b,from,to,d}]}]}`（环形缓冲 180 帧，浏览器里 `window===globalThis`），并**每 2s 往 #log 打一行结构化摘要**（角度/tx/ty 极值 + 跨帧跳变 ≥90° 的骨 + 水平位移最大的骨）—— log 会进设备上报，用户刷新一次即可回传逐骨数据。口径：demo 每帧填 `gBones[b] = bindInv[b] × RT(angle,tx,ty)`（行主序），故反解 `pose = bindWorld[b] × gBones[b] = RT`，与 `sampleAnimRT`/`sampleCompositeAdditivePose` **同空间同量纲可逐位对拍**（测试里用"姿态=bind"验证反解 == `bindWorld` 极坐标，maxErr=0） | 皮影戏骨（眉毛/眼睛/发片/飘带）位置或角度在动、但 `?ln` 只到层粒度看不到时 | **纯只读**：不开时一个字段都不写、不建 bindWorld、不跑反解 ⇒ 渲染逐位不变（`projection-y-test` 有"默认不写 `__mpwBones`"断言）；开着时只有被点名那一层有开销（32 骨 × 每帧一次 4×4 乘法）。专用上报字段（而不是 log 行）需 demo.html 在 payload 里加一行 `bones: window.__mpwBones` | core/we-scene-bundle.js:5256、core/we-scene-bundle.js:6075 |。①(P-76) **追加 5 个量：`detS`/`sxS`/`syS`/`|sx|`/`|sy|`**（索引 3..7，既有 `[ang,tx,ty]` 前缀顺序不变）：`detS=sign(m00·m11−m01·m10)`、`sxS=sign(m00)`、`syS=sign(m11)`。**为什么必须加**：角度是反解出来的，**负行列式（镜像）解出的角度可以完全正常** ⇒ 只看 `[ang,tx,ty]` 排除不了"眉毛左右翻转"是镜像。判定规则：`|Δang|≈π` **且 det 翻转** = 镜像；`|Δang|≈π` 且 det 不变 = 真转了 180°。同时 `globalThis.__mpwBones.mirror` = 本帧 `det<0` 的骨号数组，`[bones]` 摘要行新增「镜像骨(det<0)」与「det跨帧翻转」两节。默认关时仍**一个字段都不写**。①(P-80) **再追加会话级字段**（不受 180 帧环形缓冲窗口限制，一次刷新就能回答"这次会话里到底有没有眨眼"）：`ext`（32×6 = 每骨 `angMin,angMax,txMin,txMax,tyMin,tyMax`，会话累计）、`extT`（对应极值时刻）、`dty`/`dang`（每骨会话累计 max|Δty| / max|Δang|）、`blinks`（眨眼事件 + **该帧前后各 5 帧**的 `[t,ty,ang,detS]` 片段，独立于环形缓冲）、`summary`（`{frames, sessionSec, maxDtyBone, maxDty, maxDtyAt, maxDangBone, maxDang, maxDangAt, blinkCount, blinkSamples, blinksPending, mirrorEver, blinkThreshold}`（`blinkCount` 是**累计**计数、`blinkSamples` 是被截到 20 条的样本数））。`#log` 的 `[bones]` 行同步加一节「【会话累计】…maxΔty=b?@?s=?px 眨眼事件=N」
| `bindorder` | `legacy` | 无（= 子先乘修正序） | **bind 世界链序回退开关**（P-110，2026-09-17；属渲染器线，本行由插件持久化线为其补登记以保证 `diag-flag-check` 双向归零）：缺省 = 子先乘 `W[b] = L_b × W[parent]`（与 `sampleAnimRT` 同空间）；`legacy` = P-110 之前的父先乘 `W[b] = W[parent] × L_b`（"眉毛整组翻转 / 睫毛位移 102px"的数值根因，只作 A/B 复现）。判定式唯一实现处在 `core/puppet-skin.js::bindOrderLegacy`，`core/we-scene-bundle.js`（`?bones=` 探针反解基准）与 `demo.html`（`bindInv`/`bindRT`/附件锚点 `attachCtx.bindOrder`）各有一处同形解析点 | 排查/复现蒙皮绑定链序回归（眉毛翻转、睫毛位移）时做单变量 A/B | `legacy` = 回到父先乘旧序（就是被修掉的那个 bug 的数值表现）；影响 `?bones=` 探针与附件锚点基准 | core/we-scene-bundle.js:6370 / demo.html:1678 |
| `blinkty` | px（数） | `25` | **眨眼判定阈值**（P-80，配合 `?bones=`）：单帧某骨 `|Δty| ≥ 该值` 即记一条眨眼事件（`__mpwBones.blinks`，含该帧前后各 5 帧片段）并在 `summary.blinkCount` 计数。为什么做成开关：真机第一轮 3.01s 采样里全骨 max\|Δty\| 只有 14.9px（= 那次**没有眨眼**），而"眨眼时眼皮骨到底动多少"还**没有实测值** ⇒ 阈值必须能在真机上现场调（`?blinkty=15` 更灵敏、`=60` 更保守），不用重编译 | 等到画面里出现一次眨眼再点「立即上报」；若仍 `blinkCount=0`，说明**眨眼不走骨骼**（指向贴图/UV 帧切换那条假设） | 阈值取太小会把呼吸/飘动误记成眨眼；只影响探针记账，**不开 `?bones=` 时零开销** | core/we-scene-bundle.js:5494 |
| `submesh` | 骨筛选串：`24` / `24-27`（闭区间）/ `24*` / `24-27*`（含父链后代，逗号分隔多段）/ `all` / `off` | **关**（缺省/空/`off`/`0`/`none`） | **子网格隔离探针**（P-109，任务书 P1-4 / `UNTOUCHED-AREAS` D 项，唯一能直接解"眉毛翻转"悬案的工具）：按 `blendIndices` 把顶点按**主影响骨**分组（主影响骨 = 4 个 `blendWeights` 里最大的那根、并列取小下标；权重全零退回 `blendIndices[0]`），**只画"选中骨组"的顶点/三角形**（其余跳过）——把"眉毛/眼睛到底是哪几根骨、哪几个顶点"钉死。`*` = 该骨 + 其在 `mesh.bones[].parent` 父链下的**所有后代**（例：`?submesh=24*` = 骨 24 及其子骨影响的顶点）；`all` = **只出台账、绘制逐位不变**（给"权重表/分组表对不对"做对照）。台账写 `globalThis.__mpwSubMesh`：每组的顶点数/bbox/质心（bind 网格空间）+ 影响该组的骨表（骨号/权重和/顶点数）+ 主骨父链 + 三种规则下的三角形数 + **蒙皮后**的位移时程 `hist`（`[t,dx,dy]`，相对首帧，skin 空间；世界设计像素 = `origin + scale⊙skin`，见台账 `origin`/`scale`/`view`）+ **翻转计数**（本组三角形**有向面积变号**条数 —— "眉毛翻转"的机器可判形式），并每 ~2s 往 `#log` 打一行摘要（进设备上报）。与 `?bones=` **可叠加**（两个全局互不覆盖） | 想回答"眼/眉/发片是哪些骨+哪些顶点""某组在一段时间里位移/翻转了多少"（`?submesh=all` 出全量台账）时；怀疑某几根骨对应的子网格画错/翻面时（`?submesh=24-27*` 只留那几组） | ⚠ **纯只读**：不开时一个字段都不写、不建分组表、不改 `drawElements` 实参（`submesh-test` 用"把源码反向变异回旧写法"跑同一帧，GL 调用序列逐条相同）；选中集合为空（如骨号不存在）时**一个 draw 都不发**，**绝不退回全量**。只对**蒙皮层**（`renderMeshLayer`）生效，四边形/粒子层不受影响 | core/we-scene-bundle.js:6383、core/we-scene-bundle.js:7529 |
| `subtri` | `all` / `major` / `any` | `all` | **三角归属规则**（P-109，配合 `?submesh=`）：决定"一个三角形的三个顶点主骨不同组时算谁的" —— `all` = 三顶点同组（严格＝"只画本组顶点"，默认）、`major` = ≥2 个顶点同组（含边界）、`any` = ≥1 个（同一三角形可被多组计入）。非法值 → `all` | 怀疑"选中骨组的可见范围比预期小/大"时做三档对照：`?submesh=16-19,30&subtri=major` 会把交界三角形一起画上（`all` 只画严格归属的），`any` 用于"邻组边界在哪" | 只改**画哪些三角形**，不改材质/混合/坐标；台账里每组的 `tri.{all,major,any}` 三种条数**始终**都给（不受本开关影响），便于交叉核对 | core/we-scene-bundle.js:6391、core/we-scene-bundle.js:7484 |
| `subbase` | `legacy` | 无（= **bind 姿态**基线） | **`?submesh=` 台账里"三角形有向面积变号"的基线口径回退**（P-117，2026-09-18）：缺省 = 基线取 **bind 姿态**（顶点原始绕序，由 `mesh.positions` 算出）⇒ 台账回答"这一帧有没有三角形相对**绑定姿态**翻了"，与探针从哪一帧开始记账**无关**；`legacy` = P-109 旧口径（基线取**探针看到的第一个采样帧**）。旧口径的真缺陷：会话起点若落在"已经折叠/已经镜像"的那一帧（`?time=`、刷新时机、中途打开 `?submesh=`），基线就把翻转态当正常态 ⇒ **持续存在的镜像整个漏报**（实测：`?bindorder=legacy` 下只取 f8..f11 这 4 帧，b17 明明 8/8 全翻，旧口径报 `invert.max=0`；同段的组级 det 判据照常报出 2 个镜像组） | 复现/对照 P-109 的旧读数（"同一段动画换个起点得到不同翻转条数"）时用；或怀疑"变号计数随会话开始时刻漂移"时做单变量 A/B | 只改**台账口径**，不改画面：`?subbase=legacy` 下 GL 调用序列与 drawElements 实参逐条相同（`submesh-mirror-test` T9 有断言）；`orient.det/minDet/mirrorGroups`（P-117 新增的组级镜像判据）**不受**本开关影响 | core/we-scene-bundle.js:6782 |
| `cursor` | `off` | 开（按官方 `controlpoint[].flags:1` = lockToPointer 语义） | **指针锁定发射器**（P-69 用户第 6 项）：`?cursor=off` = 所有 lockToPointer 发射器不发射（与 `?noparticles` 全局关不同，只关这一类）。不开时：`window.__mpwPointer={x,y,inside}`（**设计坐标** 0..3840/0..2160，y 向下；宿主/测试注入，优先）或画布 `pointermove`（按画布归一化 0..1 × 相机 framed 窗口换算）→ 发射基准点=指针；**没有指针信息就不发射**（官方 3554161528 截图画面正中无放射花瓣爆，我们旧实现把 id389 的发射器退化到 authored origin=画布正中 (1920,1080) ⇒ 永久中心爆 + 9 万次/帧）。**P-118 把两条通道的优先规则说全**（每条都有 `tests/pointer-leave-test.mjs` 断言 + 反向变异）：① DOM 通道**自举** —— 建渲染器即装画布钩子（不再要求"本帧已经有指针"；否则出货页面 `demo.html`（全仓库 `__mpwPointer` 零生产者）里这类发射器**一次都不发射**）；② 画布 `pointerleave` 之后注入值**没变** ⇒ 停发（宿主喂的还是"离开前那份旧坐标"，不许盖过"人真的把鼠标移出画布"；注入值变了 = 新证据 ⇒ 认注入）；③ 注入 `inside:false` = 宿主**显式**声明"指针不在画布内" ⇒ 停发，**不**回落到上一次画布坐标。**P-121 把"离开"的等价路径补齐**（同样每条都有断言 + 反向变异）：④ 画布 `pointerout`（`relatedTarget=null` = 离开文档/窗口，或 `relatedTarget` 落在画布外；落在画布**内部**子元素不算离开）⇒ 与 `pointerleave` 同一处置；⑤ **页面级离开**：`window` 的 `blur`（切窗口/系统弹窗）与 `document` 的 `visibilitychange`+`hidden`（切标签）⇒ 挂起停发，`focus`/`visible` 回来后若指针仍在画布内 ⇒ **继续发射**（不误判成永久停发） | 画面上多出一个"跟着鼠标/停在屏幕中间"的粒子源；用户要立刻消灭中心爆时用 `?cursor=off` | 关掉后该层完全不发射（作者本意的鼠标拖尾也没了，属预期；且 `?cursor=off` 下**画布钩子与页面钩子都不装**，D4b/D4c 钉住）；`flags` 位定义未见官方文档，按 `flags:1` 推断（PATCHES P-69 标未定） | core/we-scene-bundle.js:6865、core/we-scene-bundle.js:6892、core/we-scene-bundle.js:6897、core/we-scene-bundle.js:6868 |
| `vflip` | 存在即开 | 关 | 全局 v 轴翻转（mesh+quad） | 纹理行序诊断 | 画面整体上下颠倒 | core/we-scene-bundle.js:3583 |
| `framegeom` | `cover`/`frame`（覆盖式视口 / 模块换算）/ `contain`·`fit`（完整可见）/ `stretch`·`fill`（拉伸）/ `legacy`·`off`·`0`·空 | **legacy（关）** | **帧几何接线**（P-112-BANDGEOM，任务书 §5-4）：把 `core/web-frame-geometry.mjs`（规格 `docs/WEB-FRAME-GEOMETRY-SPEC.md`）接进两条本仓库自己的路径 —— ① 指针口径（`core/we-scene-bundle.js` 的 DOM `pointermove` 与 `__mpwPointer.space='css'` 注入）：用 `frameClientPoint` 换算"窗口坐标 → 帧内 client 像素"，**补偿祖先 CSS transform 的缩放**（显示盒含缩放、`clientWidth/Height` 不含；legacy 的内联式在"被缩放的宿主"下会把指针算偏，不报错）；② video 壁纸帧盒（`demo.html`）：用 `coverViewport`/`contentAspectOf`/`frameVisibleRect` 算覆盖式视口并写进元素样式（内在尺寸优先，量不到就**不处理**） | 怀疑"宿主 iframe 里指针位置整体偏 / 视频壁纸该裁该留边"时做单变量 A/B（`?framegeom=cover` 对比不加） | ⚠ web 壁纸 iframe 的**尺寸**路径本仓库不可注入（三方 minified 渲染器私有函数 + 插件树）⇒ **未接**，见 `docs/AUDIO-BAND-WIRING.md` §4；`__mpwPointer.space='css'` 的"窗口坐标 vs 帧内 CSS 像素"口径**未定**（无生产者可证），本档按窗口坐标解释。关时逐位回到旧算式（含 NaN 透传）、video 元素样式一字不动 | core/we-scene-bundle.js:6322、core/we-scene-bundle.js:6333 / demo.html:1557 |
| `hier` | `0` | 父链合成 | `?hier=0` 回退 refrender 绝对定位兜底 | 父链合成回归 | 绝对定位仅对已标定场景有效 | demo.html:1523、demo.html:758 |
| `copybg` | 存在即开 | 关 | 开启 copyBackground（渲染器背景拷贝路径） | 背景拷贝路径调试 | 实验开关，可能引入额外开销 | demo.html:1720 |
| `fit` | 存在即开 | 关 | 官方预览同款"适应取景"（union 包围盒 + 居中，缩放 0.75–1.0） | 立绘超屏被裁时 | 改变取景，非官方默认链路 | demo.html:1635 |
| `pp` | `off` / `low` / `medium` / `high`（**`0` 保留旧义**，见左栏末） | `high` | **后处理档位**（P-90，照上游 `oneincase/webwallgl` 1.3.23 的 `?pp=`）：`off` = 图层效果链整体直通 + 关闭内置 Bloom（**上游三处门控我们落两处**，第三处"整屏后期层"本渲染器**源树不解析** `isPostProcess`（**源树 0 命中实代码，仅 2 处注释**；预构建参考产物 `demo/assets/renderer-BOSoB05I.js` 例外 **8 处**，见 PATCHES P-90.10）⇒ 无落点，见 PATCHES P-90 未定项）；`low` / `medium` / `high` = 效果链**保持开启**，只改效果链 FBO 的分辨率预算 `fboCapFactor` = **0.5 / 1 / 0**（**逐值照抄上游 `POST_FBO_CAP`**，0 = 全质量即"不设上限"）。非法值 → `high` 并**在启动日志里点名**。**①`pp=0` 是既有开关、语义不变**：`?pp=0` 走 RE-37 的"粒子退回正交相机"（`/[?&]pp=0/` 正则，`PP_DISABLED`），**不进**后处理档（档位保持 `high`），日志里写一行 `pp=0 走既有粒子正交相机旧义(RE-37)` | 想让"水面/波纹/光晕"这类效果链整体停下做 A/B 时用 `?pp=off`（实测凯尔希 3719111841 draw 51 → 25）；怀疑效果链 FBO 分辨率预算影响画质/带宽时用 `?pp=low`（= 0.5× 上限） | ⚠ `low` 比 `medium` **更糊**（上限更低），顺序是 `low < medium < high`；`off` 不是"最低画质档"而是"效果链整个不跑"（画质取决于壁纸本身）。与 `?nofx` **同向叠加**（两者任一为真即关效果链） | core/we-scene-bundle.js:3991、core/we-scene-bundle.js:5169、core/we-scene-bundle.js:5306 |
| `q` | `off` / `low` / `medium` / `high` | **`off`** | **内部渲染档位（内部渲染分辨率比例）**（P-90，**我们自研**：上游 1.3.23 没有这一档，它的画布尺寸由 `shell.ts` 的 `renderDpr` 管）：`off` = **不启用**离屏内部渲染路径（不建 FBO、不加帧末上采样 ⇒ 与改动前**逐位相同**）；`low` / `medium` / `high` = 把整场景画进 **0.5× / 0.75× / 1.0×**（偶数对齐）的离屏 FBO，帧末**双线性上采样**回画布（1 次全屏 draw）。与 `?res=` **正交**：`res` 定画布尺寸、`q` 定"画布不变、内部怎么渲"（`?res=720p&q=low` ⇒ 1280×720 画布 / 640×360 内部）。非法值 → `off` 并在启动日志点名。启动日志写 `[P-90] q=…(内部×0.5)` | 移动 GPU 上"画面要留、像素要省"时用 `?q=low`（内部像素降到 1/4）；`?q=high` 用来验证"走离屏路径本身"是否改变观感（内部尺寸 = 画布，但多一次上采样） | ⚠ `q != off` 时场景在**单采样**离屏 FBO 里 ⇒ `?aa=msaa2`/`msaa4` **无法生效**，会自动**回落 FXAA** 并记日志（不静默）；要与原生 MSAA 同时用就别开 `q`。`off` 之外每档固定多 1 次全屏 draw | core/we-scene-bundle.js:5304 |
| `aa` | `off` / `fxaa` / `msaa2` / `msaa4` | **`off`** | **抗锯齿档**（P-90，枚举与语义照抄上游 `oneincase/webwallgl` 1.3.23 `antiAliasing`）：`off` = 关（**与改动前逐位相同**：`getContext` 实参仍是 `antialias:false`、不建 FXAA 程序、不加上采样 pass）；`fxaa` = **帧末全屏 FXAA pass**（`runAA` 在 demo 帧循环里排在 `runBloom` **之后**，1 次全屏 draw；平滑**所有**边缘含纹理 alpha 边）；`msaa2` / `msaa4` = WebGL2 **原生多重采样**（context 创建时 `antialias:true`，浏览器在 present 时自动 resolve；只平滑**几何**边缘）。**两条回落路径都写日志、不静默**：① 实测 `gl.getParameter(gl.SAMPLES) < 请求档`（`antialias:true` 只是请求不是保证）⇒ 回落 `fxaa`（reason `ctx-samples-N`）；② `q != off`（场景在单采样离屏 FBO）⇒ 回落 `fxaa`（reason `internal-render`）。上游此处是"回退 **off**"，**我们改回退 FXAA**（用户显式要抗锯齿，回退 off 等于静默丢掉该诉求）。非法值 → `off` | 边缘锯齿明显、壁纸多为**贴图 alpha 边**（发丝/花瓣/光晕）时优先 `?aa=fxaa`；`msaa2/msaa4` 只治几何边（本渲染器语料以四边形贴图层为主，几何边少）。真机排查"是不是 MSAA 没拿到"看启动日志的 `实测 SAMPLES=` | ⚠ **`msaa2`/`msaa4` 档改档需刷新页面**：`antialias` 是 **context 创建属性**，WebGL 规范无运行期改采样数的 API（`gl.getContextAttributes()` 只读）。运行期 `setQuality({aa:'msaa4'})` 会**显式记一行"需刷新页面"**并把档位如实回退（不谎报已生效）—— 上游把 MSAA 做在离屏多重采样 FBO/RBO 上所以能热切，我们走默认帧缓冲原生 antialias ⇒ 换来零额外 FBO/零 resolve blit（避开上游注释里记的 WebKit `INVALID_OPERATION` 坑），代价就是这一档要刷新。`off ↔ fxaa` 是**热更**的 | core/we-scene-bundle.js:5305 |
| `whitefallback` | `0` | 白块回退 | 缺失纹理回退改透明（官方一致为白块） | 缺纹理排查（想看清"哪层没纹理"） | 关闭后缺纹理层透明不可见 | core/we-scene-bundle.js:2641 |
| `cam` | `0` / `node` | active 即用 | 关节点相机：`0`=静态、`node`=强制节点姿态 | 相机节点 A/B（MERGED-1 D） | 仅 3554161528 有动画相机；关掉回静态取景 | demo.html:1752 |。①(P-76/P-81) 相机层姿态的接线与口径见 `campose` 行：`camPose` 过去**从未交给 `buildCamera`**（`opts.cameraPose` 全仓库只有 `camera-node-test.mjs` 传），P-81 已接。`?cam=0` 仍是「关相机层」总闸；**`?cam=node` 的语义不变**（强制按静态基值启用相机节点 —— 语料里它就是「施加逐属性脚本 origin 的保存快照」的口子，实测砂狼白子 3327063360 会整体偏 **−2434px**，故默认不用它）
| `campose` | `full` / `legacy` / `off` | `full` | **相机层姿态口径**（P-81，用户批准「相机层动画要完整接 **但是你要保留可以回退的按钮**」）：`full` = 完整接 —— 相机层激活时把 `origin`（**关键帧动画**逐帧求值）与 `zoom`（动画 → 用户属性绑定 → 静态值）交给 `buildCamera`（`view = T(−origin.x, +origin.y)`、窗口 `framed/zoom`），消费点是 `opts.cameraPose`；`legacy` = **P-76 的行为**（只接「用户属性绑定的 zoom」，origin 平移恒等）；`off` = 完全不接（**逐位**回到 P-76 之前）。非法值/未知值 → `full`。纯函数 `camposeModeFrom()` 是唯一真值表来源 | 怀疑「某包取景被相机层带动得不对」时；`?campose=off` 一键回到「相机层完全不生效」的旧画面做 A/B。**①(P-84) 页面右下/顶部工具栏有真按钮 `🎥 相机`（`#mpw-campose-btn`）**：点一下在 完整→旧档→关→完整 之间循环，**当场生效、不用刷新**（写 `window.__mpwCampose`，并 `history.replaceState` 同步进地址栏 ⇒ 刷新后保持同档、上报日志里可查）。档位优先级 = `opts.campose`（测试/宿主显式传）> `window.__mpwCampose`（按钮）> `?campose=`（加载时读一次），唯一真值表 = 纯函数 `resolveCamposeMode()`（camera-pose-test ⑥ 段 20 条断言，含真包真渲染证明按钮档进了 `buildCamera`） | ⚠ **默认 full 会改变取景**：语料 15 个相机对象里只有 **1 个**（hina 3554161528）有**关键帧动画** ⇒ 只有它变；实测 t=0 人物层 w 1405→4215（**×3.00 镜头**）、t=1 w 3705（×2.64，与独立算得的 zoom=2.6374 一致）。其余 5 个包的 `origin` 是**逐属性脚本**（`{script:…}`），我们**不求解它** ⇒ 静态快照**默认不施加**（施加会偏 −2434px，见 `cam` 行）⇒ 这些包三档逐位相同。`fov` 在本渲染器**无落点**（`buildCamera` 只有 `mat4Ortho` 分支，语料 15 个相机对象全部带 `general.orthogonalprojection`） | core/we-scene-bundle.js:3960 |
| `charfit` | `auto` / `off` / `legacy` | `auto` | **角色层（无父级 + `animationlayers` 的 puppet/立绘层）适配口径**（P-100，用户真机实测「入场动画把人物固定在屏幕中间、去移动背景 —— 它应该是只移动摄像头」）：`auto` = 官方语义优先 —— **场景里有相机节点 ⇒ 一律不适配**（角色只吃世界变换 + 相机取景：蒙皮层 `MESH_VS` 走 `u_View`/`u_Framed`，与四边形层 `viewProj` **同一个相机变换**），**无相机节点**且该层确实超出投影时才保留旧兜底（等比缩到赛宽内 + 画布中心）；`off` = 任何包都不适配（相机语义照旧）；`legacy` = 逐位回到改动前（蒙皮层不接相机 + 角色恒按旧判据钉在画布中心）。非法/未知/空串 → `auto`。纯函数 `charfitModeFrom()` / `resolveCharfitMode()` 是唯一真值表 | 怀疑「角色不动、背景自己动」或「角色被抠出来居中」时；`?charfit=legacy` 一键复现旧画面做 A/B，`?charfit=off` 关掉一切兜底 | ⚠ **默认 `auto` 会改变 hina 3554161528 的取景**（全语料 10 包里只有它同时命中「有相机层 + 角色超屏」）：入场镜头下角色从「钉在屏幕上」变成「随镜头一起缩放平移」；无相机层的包（凯尔希 3719111841 的「长发3」等）`auto` == `legacy` **逐位不变**。`?charfit=legacy` 同时是「蒙皮层不接相机」的逃生口（`?campose=off`/🎥 按钮是另一条：整条相机链都不接） | core/we-scene-bundle.js:3995 |
| `hdr` | `0` / `1` | 跟随 general.hdr | `0`=强制 LDR、`1`=强制尝试浮点 RT | HDR/LDR A/B（MERGED-1 C） | 设备无浮点扩展时 `1` 走 LDR+日志 | demo.html:1757 |
| `pts` | `raw` | 官方 300 DPI | **字号口径**：`raw` = 回到旧行为（`pointsize` 直接当 CSS px，字小 4.1667 倍）；缺省 = 官方换算 `px = pointsize×300/72` | 文字大小 A/B（用户第 3/11 项） | `raw` 下所有文本层小 4.17 倍（仅对照用） | demo.html:1797 |
| `res` | `720p` / `1080p` / `1440p` / `2160p`（`4k` 同义）/ 显式 `WxH` / `auto` / `legacy` | **1080p** | **画布尺寸 + 视频纹理上传上限的档位**（P-68 用户第 20 项）：`1080p`=1920×1080、`1440p`=2560×1440、`2160p`=3840×2160；显式 `WxH` 与命名档同尺寸时归一成该档（`?res=1280x720` ≡ `?res=720p`）、否则成 `custom` 档；`auto` = 按 `innerWidth×min(dpr,2)` 选"≥物理宽的最小档"（夹在 720p–2160p）；**非法值 → 回退 1080p 并在日志/`videoStats.invalid` 里显式标记**。`720p` 与 `legacy` 是**改动前行为逐位兼容档**（节流 33ms、不写 `imageSmoothingQuality`、超限必走 2D canvas） | 想要清晰就 `?res=1440p`（`?res=2160p` 上行带宽 4 倍，见 PATCHES P-68 四档表）；怀疑分辨率回归就用 `?res=720p` 与旧截图对拍 | 画布像素 ×2.25/×4/×9 → 显存与每帧上传字节同步放大；移动 GPU 上 4K 档不现实（本机未测真机 FPS） | demo.html:3702、core/we-scene-bundle.js:4667/4812 |
| `vthrottle` | 裸数字 = 目标 fps / `NNms` = 毫秒 / `0`\|`off`\|`none` = 不节流 | 档位默认（`legacy`/`720p` = 33ms，其余 = 60fps → 16.67ms） | **视频纹理上传节流**（P-68）。改动前硬编码 `(now-lastUploadAt) < 33` ⇒ 60fps 源最多 30fps 上屏；现在默认目标 60fps，实测值记 `videoStats.upFps` | 真机上传带宽吃紧（4K 源 + 1440p 档）时降到 `?vthrottle=30`；排查"是不是节流丢了帧"用 `?vthrottle=off` | `off` 时每帧都上传（CPU/带宽最高）；非法值回退档位默认且 `videoStats.throttleSrc` 记为 `url-invalid:*` | core/we-scene-bundle.js:4736/4814 |
| `fbocap` | `low` | 高分辨率档**抑制**效果链降采样 | **`?perf=auto` 的效果链 FBO 阶梯回退**（P-68）：非 legacy 档（如默认 1080p）下 `?perf=auto` 只降粒子、**不再把效果链 FBO 降到 0.75/0.5/0.35**（否则等于把刚提上去的分辨率糊回去）；`?fbocap=low` 恢复旧阶梯做 A/B | 高分辨率档下想复现旧 auto 行为 / 量"fboCap 对画质的影响" | 打开后高分辨率档仍会被 auto 降采样（画面更糊），仅在对照时用 | core/we-scene-bundle.js:4757/4816 |

## ② 诊断与审计

| 开关 | 取值 | 默认 | 作用（一句话） | 什么时候用 | 回退/风险 | 解析位置 |
|---|---|---|---|---|---|---|
| `audit` | `1`–`N` | 1 | 首帧逐层审计帧数（[首帧] 日志定位卡层） | 定位"渲染卡在哪一层" | N 大时日志量大 | demo.html:1739 |
| `selfcheck` | 存在即开 | 关 | 页内自检：首帧后统计层/纹理/白块/脚本错误，POST /diag（回退 /report），右下角徽标显示「自检: OK/异常 N 项」 | 真机单包快照（字段与 package-matrix 对齐） | 只读；默认关，详见 SELFCHECK.md | demo.html:1953 |
| `perf` | `1` / `auto` | 关 | 性能计时：GPU 计时优先（EXT_disjoint_timer_query_webgl2）缺扩展退 CPU；`auto` 另开自适应降级（粒子×1/2→×1/4 不停发、fboCap 0.75/0.5/0.35、解码超 220MB 非关键层 1/2 上传） | 帧时间画像/低端设备 | 关闭路径零额外 GL 调用；auto 会降画质（有 [perf] 日志） | core/we-scene-bundle.js:3634、demo.html:186 |
| `perfreport` | 存在即开 | 关 | `?perf=1&perfreport=1`：12s 起每 30s POST 一份 perf 摘要到 /diag（回退 /report） | 真机帧时间样本采集 | 需与 `perf` 同用 | demo.html:2059 |
| `hdrblur` | 存在即开 | 关 | 插件侧 HDR 模糊开关（面板透传） | 插件面板调试 | 插件侧行为，非渲染器 | dsh-mpkg-wallpaper/lib/client.js:2075 |
| `trace` | 存在即开 | 关 | 渲染器 trace 日志（bundle 层） | 深度排查渲染内部 | 日志噪音 | core/we-scene-bundle.js:4379、demo.html:1713 |
| `isolate` | 层名(逗号分隔) | 全可见 | 只保留名字含关键词的层可见（容器保留） | 判定"某层是否真的画了" | 无 | demo.html:1552 |
| `showui` | 存在即开 | 隐藏 | 显示 UI/音频层 | 检查 UI 层是否被误画/误藏 | UI 大层会遮挡画面 | demo.html:1542 |
| `showclock` | `0` / `1` | 显示 | **时钟类文本层**（`__text` 且名字命中 `Clock`/`时间`）可见性；同名**非文本**层（时钟底板 solid/分组）与 `Clock Container` 保持旧口径隐藏 | 想让桌面干净、不要壁纸自带时钟时 `?showclock=0` | 关闭后时钟文本不再绘制（帧率同族见 `showfps`） | core/we-scene-bundle.js:1427、demo.html:2162 |
| `showdate` | `0` / `1` | 显示 | **日期类文本层**（`__text` 且名字命中 `Date`/`日期`）可见性 | 同上，只关日期 `?showdate=0` | 关闭后日期文本不再绘制 | core/we-scene-bundle.js:1428、demo.html:2163 |
| `showweekday` | `0` / `1` | 显示 | **星期类文本层**（`__text` 且名字命中 `D a y`/`Day`/`星期`）可见性 | 同上，只关星期 `?showweekday=0`；时段变体层（`day`）仍由 TIME-VARIATION 豁免 | 关闭后星期文本不再绘制 | core/we-scene-bundle.js:1429、demo.html:2164 |
| `showfps` | `0` / `1` | **隐藏** | **帧率类**层可见性：文本层（`帧率`/`FPS`/独立词 `Frame`）+ 整块帧率 widget 的容器/装饰层（`帧率位置`、`帧率三角*`——只藏数字会剩悬空装饰） | 想看壁纸自带帧率表 `?showfps=1`（N7 起 tick ≥30Hz，显示的是真实帧率） | 默认隐藏（用户口径）；打开后壁纸自带帧率表会出现在画面上 | core/we-scene-bundle.js:1430、demo.html:2165 |
| `noparticles` | 存在即关 | 粒子**开** | **关闭全部粒子层**（显式关；`?np` 为等价历史别名） | 粒子问题二分（画质/性能 A/B） | 粒子层 `visible=false` → 画面粒子消失 | demo.html:2191、demo.html:2642 |
| `np` | 存在即关 | 粒子**开** | `noparticles` 的历史别名（代码里一直是"存在即关 = 隐藏全部粒子"，旧文档写成"存在即开/显示粒子"——本次按代码订正） | 同上（兼容旧链接/脚本） | 同上 | demo.html:2191、demo.html:2642 |
| `lowmem` | `1` / `0` | 默认档 | **粒子预算激进档**（P-59）：单层 240→**80** 粒、整帧 1200→**320** 粒、最多 16→**6** 个粒子层、历史重放 400→**200** 步、单层发射率 240→**80** 粒/秒 | 低内存/低端 GPU 机型（插件 B5 按 `deviceMemory`/`hardwareConcurrency` 自动透传 `&lowmem=1`）；真机仍卡时的第一档 | 粒子变稀（不停发，只封顶本帧模拟/绘制数） | core/we-scene-bundle.js:4029 |
| `pmax` | 粒数 | 240（默认档）/ 80（`lowmem`） | **单层粒子本帧上限覆盖**（P-59，现场调参用，不动档位） | 真机上"某粒子层太稀/太密"时单参数微调，如 `?pmax=500` | 只改单层上限；整帧总上限（1200 / `lowmem` 320）仍生效 | core/we-scene-bundle.js:4030 |
| `novideo` | 存在即开 | 叠加 | 关掉"视频作最底层"的合成（容器里同时有 scene.json 与 project.json.file 视频时，默认把视频铺最底再叠加场景层） | 对照"视频+场景文本"叠加是否生效 | 有的作品只显示场景层（无视频背景） | demo.html:484 |
| `ln` | 层序号 | 全部显示 | **逐层调试**：只渲染第 N 层（容器层保留，父链/定位不变），页内 ←/→ 翻层、Home 退出 | 定位"哪一层画错了/哪一层是白块" | 只看到一层（排查用） | demo.html:1610 |
| `ownsize` | `1` | 关 | 旧行为：把"自带 puppet 的附件层"的 size 覆盖成网格 bbox（实测只有 authored 的 ~1/1.9，会压扁/拉伸；CPU 预览不执行） | 与旧行为 A/B 对照 | 人物/发片被压扁拉伸 | demo.html:1784 |
| `meshsize` | `1` / `crop` | **关**（= 官方 1:1 口径） | **网格层**（puppet 蒙皮，走 `onMeshLayer`）改按作者 size 框缩放/定位：`1` = `scaleXY = size·layer.scale / meshBBox`、网格 bbox 中心落到 `origin + alignment` 枢轴偏移；`crop` = 同上但网格空间中心改用 `model.cropoffset`（研究稿提案，RE-02 判定官方运行时不消费该字段）。旗标开时同时停用 `mesh.__center` 补偿（避免双重校正） | 用户第4项 凯尔希"发片尺寸/位置"真机 A/B（`?id=3719111841&meshsize=1`）；`?meshsize=crop` 单独试 cropoffset。**手拼 URL 即可**（尚未进插件面板白名单 `MPW_SCENE_DEBUG_KEYS`） | 默认关；`1` 会把网格放大约 1.19/1.17/1.89 倍（主体/长发3/左耳朵1），与官方标定 refrender 的差 269/342/399px —— 真机确认观感前不要写进壁纸 URL；`crop` 会再整体位移（长发3 +852.7/−300.5px） | demo.html:2468、core/we-scene-bundle.js:3491 |
| `hdrfrost` | `off` / `legacy` | 自动 | `off` = **彻底关闭**标题栏磨砂链（清注入层 + 清半透明属性，不留残留）；`legacy` = 回到旧门控 `(headerBlur \|\| unifyTint) && headerBg`。①(2026-09-16 P-102) 磨砂层内联 `z-index` 由 **-1 改 0**（`-1` 会被顶栏自己的半透明底色整片盖住 ⇒ "层在但看不见"）；同时 `.mpw-hdrFrost` 的层叠规则改为**无条件输出**，并把宿主顶栏直接子节点抬到 `z-index:1`（不盖标题/按钮） | 磨砂 A/B、或想保留顶栏原本不透明外观 | `off` = 顶栏无磨砂；`legacy` = 开关没配好时磨砂不出现 | dsh-mpkg-wallpaper/lib/client.js |
| `railink` | `off` | 开（有壁纸时） | `off` = 关掉「右侧轮次导航条（DSH TurnNavigator rail / `.eGxaPq_mark::before`）对比色补偿」——该条宿主用 `--dsw-alias-border-l4`（16%/20% alpha），壁纸模式把表面透明化后与壁纸混色即"看不见" | 判定"条看不见"是不是我们的补偿色造成的（一秒对照） | `off` = 宿主原样（16% 淡条，壁纸上可能仍看不清）。①(2026-09-16 P-102) 真机取证：我们的覆盖**一直在生效**（`::before` computed `rgba(0,0,0,.42)`、12×2px、无裁切）⇒ 看不见的是**对比度**，故新增反色描边晕 `--mpw-rail-halo`（`box-shadow: 0 0 0 1px`，亮/暗取反色），并让 `hasWall` 判据与磨砂链对齐（加 DOM 兜底） | dsh-mpkg-wallpaper/lib/client.js |
| `sbfill` | `wide` | 收窄 | `wide` = `--dsw-specific-sidebar-fill` 的覆盖恢复**旧的全局 `html body` 写法**（默认只覆盖侧栏白名单容器，避免误伤宿主 trajectory 表头等无关组件） | 侧栏"透出壁纸"收窄后出现双层色块时的 A/B | 全局改宿主 token 会让无关组件（如轨迹表头）一起变透明 | dsh-mpkg-wallpaper/lib/client.js |
| `bgwrapfix` | `legacy` | 开（修复后行为） | **壁纸层可见性修复的回退开关**（2026-09-17 判据轮；判据/证据/复测方法见 `dsh-mpkg-wallpaper/docs/BGWRAP-VISIBILITY.md`）。默认 = `showImageEl()` 以 `keepSrc=true` 解除场景看门狗（**不再**顺手清掉调用方刚设好的 `img.src`）+ 每次 apply 后 1.2s 做一次"有源是否真挂上"的**有界**复核（补挂一次 + `console.warn` + `window.__mpwBgSrcHeal` 计数）；`legacy` = 回到改动前（无条件清 src、不复核） | 图片/GIF 壁纸"图层在但没有画面"（刷新后尤其明显）排障时一秒 A/B；怀疑补挂兜底本身在抖动时也可回退 | `legacy` = 图片/GIF 壁纸刷新后可能又没有画面（就是被修掉的那个 bug）；场景看门狗兜底语义不变 | dsh-mpkg-wallpaper/lib/client.js |
| `mpwsandbox` | `legacy`/`strict` | 自动（有 token 即 strict） | 强制壁纸 iframe 沙箱模式：`legacy`=带 `allow-same-origin`（今天的行为）、`strict`=不透明源 + 场景级 30 分钟 token | 沙箱回退/对照排查（strict 下 8s 没出首帧会自动回退 legacy） | `legacy` = 保留混淆代理面；`strict` 且宿主未重启 → 仍走 legacy | dsh-mpkg-wallpaper/lib/client.js |
| `mpwtranscode` | `probe` / `legacy` / `aggressive` | `probe` | **可播性闸门**（用户第 1 条「我没用转码，为什么有个 ffmpeg 常驻转我正在放的壁纸」）：`probe` = 先探测能否直读，可直读就不起 ffmpeg；`legacy` = 不看探测、一律自动转码（改动前行为）；`aggressive` = 连 fpsCap/resMax 上限设置也先探测，可直读就不转码 | 排查「明明能直读却被 ffmpeg 转码 / 转码进程常驻」；需要逐位回到旧行为做 A/B | `legacy` = 可能恢复用户报的 ffmpeg 常驻；`aggressive` = 用户设的上限不再强制触发转码，个别机器直读可能卡顿 | dsh-mpkg-wallpaper/lib/client.js:1093 |
| `sandbox` | `strict` | 无 | **插件注入的模式信号**（非手输）：告诉渲染器当前是不透明源 → 给 http(s) 纹理/视频加 `crossOrigin`、上报走 `thumbtoken` | 渲染器侧无需手配 | 无（不带就按旧行为逐像素一致） | demo.html |
| `navicon` | `old` | 内联 SVG | `old` = 设置导航图标切回旧的 base64 位图图标（默认用用户指定的内联 SVG，`currentColor` 跟随主题） | 图标 A/B 对照 | 回到旧图标 | dsh-mpkg-wallpaper/lib/client.js |
| `nofx` | 存在即开 | 关 | 关闭全部效果链 | 效果链问题二分 | 画面变"素"（无效果） | core/we-scene-bundle.js:4393 |
| `fx` | 效果名子串 | 全部 | 只允许名字含子串的效果链运行 | 单独调试某效果 | 其他效果被跳过 | core/we-scene-bundle.js:4394 |
| `nofxfb` | 存在即开 | 回退开 | 关闭效果链 GPU 错误→直绘的 FBO 回退 | 回退路径对照 | GPU 错误层会消失（0x502 等） | core/we-scene-bundle.js:4404 |
| `simplefx` | 存在即开 | 关 | 含效果链的层强制直绘（剥掉效果数组） | 灰层 fx=1 规律验证 | 同 nofx但按层生效 | demo.html:1497 |
| `nobg` | 存在即开 | 关 | 隐藏 ≥3800px 的"背景"类大层 | 粒子融合前看全貌 | 背景消失 | demo.html:1566 |
| `dbgred` | 存在即开 | 关 | 9 个灰名单层改纯红块绘制（draw vs 纹理二分） | 判断"画了但纹理坏" | 画面被红块覆盖 | demo.html:1502、demo.html:1544 |
| `eyehack` | `1` / `0` / `legacy` | 白名单 | 长条眼窗（眼睛组合 uvRect 横带 + 405×120）只对凯尔希 3719111841 生效；`1` 对任意场景强制开、`0` 对凯尔希也关。①(P-76) `legacy` = **旧写法回退**：把 es 覆写进 `l.scale=[1,1]`（`size=405×120` + `scale=1`）。**默认新写法**改为"把 es 反向折进 `size`（`size×scale ≡ es`）"，因为本层是 puppet 蒙皮层、demo 把 `layer.scale` 直接当 `u_Scale` 交给 `renderMeshLayer`（**不读** `size`/`uvRect`）⇒ 旧写法把父链解析出的世界 scale 0.69297 覆写成 1，眼睛网格被放大 1.4431 倍、实绘框从 `x[2219,2430]` 挪到 `x[1912,2217]`（真机台账 `rd=[1912,541,305,253] sc=[1,1]`，用户"眼睛位置不对"） | 眼睛错位 A/B 对照（W3 P-36）；`?eyehack=legacy` 回退到覆写 scale 的旧口径 | 强制开时非标定场景眼睛会被压成横条 | demo.html:1637、core/we-scene-bundle.js:1917 |
| `skiny` | `0` | -y 翻转 | 蒙皮 y 方向改 +y（关闭翻转） | 蒙皮朝向 A/B | +y 时蒙皮上下颠倒 | demo.html:17、demo.html:1707 |
| `anim` | `1` 或 fps 值 | 关 | 开启 MDLA 附件逐帧动画并调帧率（默认静态帧 0） | 附件动画对照 | 旧路径下头发会被整体拖动（官方=顶点蒙皮） | demo.html:443、demo.html:452 |
| `animloop` | `saw` | pingpong | MDLA 帧回绕改 saw（`floor(t*fps)%len`） | 回绕阶跃对照 | saw 有 90 帧窗截断阶跃 | demo.html:446 |
| `animoff` | 存在即开 | 动帧 | 附件动画冻结在帧 0 | 静态对照 | 无 | demo.html:442 |
| `ay` | 存在即开 | y 不翻 | MDLA 附件动画 y 语义翻转（?ay=flip） | 附件动画方向对照 | 方向反 | demo.html:636、demo.html:1690 |
| `bars` | 存在即开 | 隐藏 | 强制显示父组下被旋转 90° 的纯色遮罩条 | 遮罩条对照 | 画面中央出现竖条 | demo.html:1546、demo.html:1759 |
| `eyedy` | 像素数 | 0 | 眼睛族层整体 y 偏移 N 像素 | 眼睛位置微调实验 | 仅调试，勿用于成品 | demo.html:1572 |
| `bgfx` | 存在即开 | 清除 | 保留背景**效果链**（恢复官方光晕）；粒子自 P-56 起默认开，不再由本开关控制 | 背景效果对照 | 早期为消白块默认清 | demo.html:1545、demo.html:1722 |
| `noscript` | 存在即开 | 脚本开 | 关闭场景脚本运行时（NSL，4Hz 时间/属性驱动） | 脚本问题二分 | 时钟/属性驱动层不再更新 | demo.html:978 |
| `scripthz` | 数值（Hz） | 30 | **文本/时钟/帧率类脚本的节拍**（其余脚本固定 4Hz）：WE 无 FPS API，壁纸自带"帧率显示"是文本脚本自计时（`fps=1000/Δt`），4Hz 下恒显示 `fps: 4`；`?scripthz=0` 回退旧的"全部 4Hz"行为做 A/B | 帧率文本/秒针卡顿；`?scripthz=0` 对照旧观感；低端机可降到 15 省 CPU | 节拍越高 CPU 越高（只跑文本层子树的脚本节点，且高频趟不重复触发 `scene.on('update')`） | demo.html:1614 |
| `nouserprops` | 存在即开 | 关 | 关闭"用户属性转交脚本"（`applyUserProperties` 仍收到空表 = 旧行为） | 脚本属性二分的回退口（TIME-VARIATION S1） | 依赖用户属性的脚本（日月循环 `timevarying`/`display`）读不到值 → 时段层停在 authored 状态 | demo.html:1286 |
| `nopanel` | 存在即关 | 面板**开** | 关闭**官方属性面板**（P-61：把包内 `project.json → general.properties` 的 35/102/237… 条属性通用渲染成控件）；**只关 UI**，`{user:...}` 绑定与 `?props=` 覆盖照常生效 | 面板挡住画面、或只想用 `?props=` 驱动属性时 | 无渲染影响（纯前端 UI）；关掉后只能靠 URL `?props=` 改属性 | demo.html:2524 |
| `scriptcache` | `0` | **开**（官方语义：同一源码只编译/`init` 一次；P-64 裁定 1 反转默认值） | **脚本缓存开关**。默认开 = 官方语义 + 媒体集成的前提（P-62 陷阱 A）；`?scriptcache=0` 回到旧的"每帧重编译"路径（A/B 逃生口，行为逐位等于改动前）。开着时实时性由两条保证：① 面板/`?props=` 改值 → `invalidateUserProps(cache)` 复位 `applyUserProperties`（日月循环 3326873240 的 `timevarying`/`display`/`morningtime`… 立刻收到新表）；② 媒体事件走 `dispatchScriptEvent(cache,…)` | 性能/行为 A/B：默认开省 CPU（不再逐帧重编译）；怀疑"某个只在 `init` 里读一次属性的脚本"行为变化时用 `?scriptcache=0` 对照 | `?scriptcache=0` 时行为与 P-61 之前逐位相同，且**媒体集成不启用**（无缓存 → 无媒体回调，日志会说明） | demo.html:1966、demo.html:2957、demo.html:3068 |
| `media` | `k=v,k=v` | 无（不注入） | **媒体集成测试注入口**（P-64-MEDIA 用户第 9④ 项）：手工指定当前媒体，键 = `title` / `artist` / `album` / `albumartist` / `subtitle` / `genres` / `type` / `cover`（**包内条目路径**，如 `images/cover*.png`）/ `coverurl` / `color`（`#rrggbb` → 线性 0..1 三色）/ `position`（秒）/ `duration`（秒）/ `playback`（`playing`/`paused`/`stopped`）。走 `createMediaHost` 的官方五回调（`mediaPropertiesChanged` / `mediaThumbnailChanged` / `mediaPlaybackChanged` / `mediaTimelineChanged` / `mediaStatusChanged`）；**首帧之后**才投递（此前 cache 里没有脚本条目） | 没有真实播放器时验证"歌名/歌手/封面/进度/时长/音频响应"链路；例如 `?id=3554161528&media=title=测试曲,artist=测试歌手,duration=200,position=30,playback=playing`（进度条会自己走） | 只影响脚本看到的媒体状态；**不注入 = 什么都不派发**（作者层停在 authored 占位文本，不报错）。「封面进画面」还差渲染端 `$mediaThumbnail` 材质纹理槽（属 `core/we-scene-bundle.js`） | demo.html:4533 |
| `psize` | `legacy` | official（`p.size/2`） | **粒子 quad 尺寸口径回退**（并行 bundle 子任务 P-74 新增）：official = 按官方 `ComputeParticlePosition`（跨度 = `positionAndSize.w` = `p.size/2`）；`legacy` = 回到 P-65 旧口径（跨度 = `p.size`，是官方的 2×） | 粒子明显偏大/偏小时的 A/B 对照 | 回退档下粒子尺寸翻倍（逐位复现 P-65 行为） | core/we-scene-bundle.js:5160 |
| `io` | `off` | on（按官方语义吃 `instanceoverride`） | **粒子 `instanceoverride` 总开关**（P-74 用户第 4 项「粒子太多太大」主因）：on = 逐字段生效 `size`(倍率)/`count`(→发射率)/`alpha`/`rate`(→仿真时钟)/`speed`/`lifetime`/`colorn`/`color`(字节色)/`controlpointN`（出处：第三方参考实现 wer-ref `WPParticleParser.cpp:297-312`、`WPSceneParser.cpp:1435-1440`、`ParticleSystem.cpp:329`，GPL-2.0-only，仅行为对照）；`off` = 回到 P-73「一个字段都不读」（41/49 个粒子层按资产原值 → 粒子数量/尺寸偏大） | 怀疑「粒子太多/太大/颜色不对」时做 A/B | 回退档失去 84% 粒子层的作者覆写：凯尔希 Bokeh 直径 199→738 设计像素（3.7×）、日月循环 Trails 2 颜色退回灰绿 | core/we-scene-bundle.js:5171 |
| `vy` | `legacy` | official（`velocityrandom` 翻 y） | **`velocityrandom` 的 y 口径**（P-74 用户第 2 项「雨从下往上」根因）：official = 作者 y-up 矢量进入 y-down 的 `p.vel` 时翻一次（与 `movement.gravity`、发射器偏移同一口径；官方 `lwe-ref CParticle.cpp:775 vel.y = -vel.y`）；`legacy` = P-73 原样（不翻） | 雨/雪/花瓣/火星方向可疑时；`?vy=legacy` 复现「雨往上跑」 | 回退档下定号 −Y 的 12/19 个 `velocityrandom` 层方向反（`Rain perspective` 平均 y 速度 +2250 → −2250 px/s） | core/we-scene-bundle.js:5193 |
| `maxtex` | `0` | fix（按设备 `MAX_TEXTURE_SIZE` 正确封顶 + 退化链短路） | **效果链 FBO 尺寸档**（P-74 用户第 2 项第 27 层 `cat` 不显示 / 第 3 项时钟不显示的**共同根因**）：fix = `MAX_TEX_SIZE_CACHE` 以 `>0` 判定「未查询」；`0` = 复现 P-73（其初值 0 使查询分支永假 ⇒ **每一层**效果 FBO 被打成 0×0、`getFBO` 钳到 1×1 ⇒ 层「画了但零像素」）并关掉退化短路 | 排查「效果层整体不可见 / 只有极少数层显示」时；对照 0×0 复现 | 回退档下所有效果层输出 1×1（3544152633 的 `cat`/`girl` 直接消失；凯尔希 13 个有贴图效果层全部退化） | core/we-scene-bundle.js:5183 |
| `trail` | `quad` / `off` | on（官方几何） | **粒子拖尾几何回退**（并行 bundle 子任务 P-63 新增）：`quad` = 退回 P-59 的普通贴图 quad 近似（长条贴图会画成竖线，对照用）、`off` = 该层整层跳过（『宁可没有，也不要画成竖线』的兜底） | 粒子拖尾（`spritetrail`/`rope`/`ropetrail`）画成竖线或想整层跳过时 | 回退/跳过都改变画面（默认 `on` 是官方几何） | core/we-scene-bundle.js:4726、core/we-scene-bundle.js:6608 |

## ③ 数据源与模式

| 开关 | 取值 | 默认 | 作用（一句话） | 什么时候用 | 回退/风险 | 解析位置 |
|---|---|---|---|---|---|---|
| `pkgpath` | 本地绝对路径 | — | 服务端直读本地容器（scene.pkg/mpkg） | 本机调试容器 | 仅本机（服务端读文件） | demo.html:403、demo.html:2072 |
| `pkgurl` | http url | — | 浏览器直连（带 cookie）失败再服务端代理拉容器 | 插件场景链路（/raw） | 依赖宿主可达 | demo.html:403、demo.html:2072 |
| `id` | 场景目录名 | 3554161528 | 从库目录 SCENE_ROOT/<id> 加载 scene.pkg | 演示/回归固定场景 | 需服务端有该目录 | demo.html:77、demo.html:89、demo.html:2072 |
| `props` | `k=v,k=v` | 无 | 手工指定用户属性（覆盖 project.json 作者默认与 localStorage 改动，**优先级最高**）；P-61 起被它钉住的键在属性面板里置灰 + `data-locked=1`，`condition` 门控也用 URL 覆盖后的值判定 | 属性驱动调试（如 `?props=clock=0` 看时钟关掉的样子） | 覆盖官方属性表；值会按该属性的官方类型规范化（bool→boolean / slider→number / combo→string） | demo.html:2401、demo.html:2410、demo.html:2516 |
| `proj` | `off` | 读官方 project.json | **跳过** `/project/<id>` 的官方属性表读取 = 回到"无属性表"旧行为（属性面板空白、`{user:...}` 绑定回落作者默认、`visible:{user:{condition:…}}` 全按可见 ⇒ 白子 3327063360 的 4 个 Clock 变体会同屏出现）。服务端正常路径按 显式目录→MPW_PROJECT_JSON_DIR→语料目录→Steam 工坊→allwallpaper扁平 的查找链给表（core/scene-project-json.mjs，命中响应头 `x-project-source` 标来源） | 怀疑"画面/面板被属性表带偏"、要做**有无属性表** A/B 时（P-85 查找链的对侧回退口，用户点名要保留） | 纯数据源开关，不改渲染管线；off 时日志写"被回退开关关闭"而不是"拿不到"，不会误导排查 | demo.html:2931 |
| `time` | `morning`/`day`/`dusk`/`night`/`mddn` 或条件值 | 时钟 | 钉住某个时段变体层（渲染器内置的"日月循环"选层，不随时钟/脚本变化） | 手动看某个时段（用户第 5 项）；`?time=night&hour=14` 做确定性检查 | 钉住后与真实时间脱钩，`恢复时钟`（Home/按钮）可解 | demo.html:1889 |
| `hour` | 0–23 | 真实小时 | 把内置时段选择器的"现在"固定为 N 点 | 无浏览器自检/对照（配合 `time`） | 只影响渲染器内置选层，不改系统时间 | demo.html:1886 |
| `extbase` | url | 无 | 扩展钩子索引地址（`<base>` 下加载模块） | 外部钩子注入 | 钩子异常被吞，不影响画面 | demo.html:811 |
| `exthooks` | url[,url] | 无 | 直接列出扩展模块地址（免索引） | 同上（无索引服务时） | 同上 | demo.html:813 |
| `skin0` | 存在即开 | 蒙皮开 | 关闭 GPU 蒙皮（mesh 不画，走 quad） | 蒙皮问题二分（**仅限临时二分，勿写进壁纸 URL**） | 主体/长发 mesh 消失 | demo.html:1033 |
| `audio` | `1` | 静音 | 开启 sound 层播放（每层一条流） | 听音频语义（loop/single/random） | 浏览器自动播放策略需用户手势 | demo.html:839 |
| `bandfeed` | ①(P-131 批D) **缺省 = `auto`**（有数据源就开）：`auto`/`1`/`on`/`true`/空/**非法值** = 有真实源（包内音轨 AnalyserNode / **已授权**的麦克风）就用真实源，没有就**全 0**；`mic`/`microphone` = 只用麦克风（**会请求权限**）；`sim`/`simulated` = 只用确定性模拟源；`real`/`analyser` = 只认包内音轨的 AnalyserNode（没有 ⇒ 全 0）；`0`·`off`·`no`·`false` = **关**（= 批 D 之前的旧行为，逐位） | **auto（有源就开）** | **128 元频段数组接线 + 16 段活视图**（P-112-BANDGEOM；P-131 批D 翻缺省/加麦克风源）：把 `core/audio-band-array.mjs`（规格 `docs/AUDIO-BAND-SPEC.md`）接进三条消费路径 —— ① 场景层脚本的 `registerAudioBuffers`：`audioBuffers(n)` 返回**活视图**（同一 n 同一批 `Float32Array`、每帧原地刷新 = 官方 AudioBuffers 语义；`average` 逐段 = (left+right)/2）；② 渲染器粒子 `audioprocessing*`（官方 *Audio response*）：16 段活视图经 `lib.setAudioBands(view)` 注入，按 mode/bounds/exponent/frequency 调制发射率/相位/速度（**缺省档 `auto` 在没有采集源时保持旧行为不调制**，见 `audioemit`）；③ 宿主（父页）按 20Hz 节流收 `{type:'mpw-audio-bands', len:128, source, t, bands}`。真实源 ⇒ `clampOnly`（不套 γ）；模拟源 ⇒ γ=1.8/gain=1.8。诊断：`window.__mpwAudioBands` / `__mpwAudioBandStats()`（`silent`）/ `__mpwAudioBandSource` / `__mpwAudioBandReason` / `__mpwAudioBandInfo()`（feed/source/hasSource/mic/emit） | 排查“音条不动 / 星点不跳”时**先看 `source` 与 `silent`**：区分“**没有数据源**”（`silent` + 一条一次性日志；处置 = 接 `?audio=1` 或 `?bandfeed=mic`）与“**数据源很安静**”（`source=analyser` 但 `silent`；处置 = 让音乐响）；`sim` 做单变量 A/B 与自动化；`real` 验“无源不报错、不阻塞” | ⚠ **本机没有系统声卡环回** ⇒ “真实源”只能是**包内音频**或**麦克风**（都不是系统音乐）；缺省档**不弹麦克风权限框**，只在已授权时静默启用（`?bandfeed=mic` 才显式请求）；渲染器 → 宿主的消息**契约未确认**（in-repo 无消费者）⇒ 只是“缺的那一半”的提案，见 `docs/AUDIO-BAND-WIRING.md` §4。`?bandfeed=off` 时零 `postMessage`、零新字段、脚本侧退回旧 `audioBuffers` 路径（逐位） | demo.html:2761 |
| `audioemit` | `auto`（缺省）/ `strict` / `legacy`（或 `off`·`0`） | **auto** | **音频驱动发射档位**（P-131 批D）：粒子 `audioprocessing*`（官方编辑器 *Audio response*）在 `auto` 档“**有采集源**（`?bandfeed=` 的 16 段活视图 `hasSource=true`）就按官方语义调制、**没有采集源就保持旧行为不调制**”（并把“开了但没源”的层记进 `particleStats.audioNoSource` + 一条一次性日志）；`strict` = 没有采集源也照官方算（全 0 频段 ⇒ env=0 ⇒ **不发射**，复现官方“没音乐就不发射”的画面）；`legacy` = **完全不调制**（批 D 之前的画面，逐位） | 想看“官方的静音画面”（星点整片消失）用 `strict`；想 A/B 本批的音频驱动发射用 `legacy`；真机上“有音乐但不跳”时先确认 `?bandfeed=` 有源、再看 `particleStats.audioLayers[*].env` | ⚠ 官方语义取自官方设计文档三页的 *Audio response* 段落 + 官方二进制字符串池的缺省（`docs/PATCHES.md` P-131 列了逐条出处）；**包络在 `[freqstart,freqend]` 上取均值还是峰值、16 段的频率切分**未证实（我们取均值 + 128 元 4:1 折叠）；`auto` 档在“无采集源”时不调制是**有意的偏离**（否则 52 层会因“我们没有采集能力”而整片消失 = 用户报过的“少了几层”） | core/we-scene-bundle.js:3100 |
| `ids` | `a,b,c,d`（逗号分隔的包 id） | 无（**单实例**） | **一页多实例入口**（P-77 用户第 4 项）：一页铺 N 个 `<div class="mpw-inst">` 格子，每格一个 canvas + 独立 WebGL 上下文；**点选激活**、其余完全暂停；顺序即布局顺序 | 对比多个壁纸 / 交付多实例页 | 每个实例一份上下文与纹理（≤ `maxinst`）；写错 id 的格子会装载失败并写明原因。**不传 `ids` 时单实例路径逐位不变**（红线） | demo.html:908、elysia/multi-instance.js:mpwMultiParseIds |
| `layout` | `grid` / `row` / `col` | `grid` | 多实例布局（网格 / 横排 / 竖排） | 按屏幕比例摆放 | 非法值回 `grid` 并记日志 | demo.html:908、elysia/multi-instance.js:mpwMultiParseOpts |
| `maxinst` | 正整数（硬上限 8） | `4` | 实例数**硬上限**：超出部分**不创建 WebGL 上下文**，占位块写明"已跳过：超出实例上限"（浏览器上下文上限约 8–16，本机 15G 内存曾 swap） | 低配机降到 2；想看更多格子上调 | 超过 8 按 8 计并在日志说明；`≥ 3` 触发自动降档（见下） | demo.html:908、elysia/multi-instance.js:mpwMultiBudget |
| `instfps` | `active,idle`（0 = 不限） | `0,4` | active / idle 两档目标帧率（默认非当前实例是 `pause`，故 `idle` 档只在 `?inactive=idle` 时生效） | 想让未选中格子轻微动起来 | idle 档每帧最多推进 1 个到期实例 | demo.html:908、elysia/multi-instance.js:mpwMultiParseOpts |
| `inactive` | `pause` / `idle` | **`pause`（用户 2026-09-15 拍板）** | 非当前实例的策略：`pause` = **完全暂停（0 帧）**；`idle` = 降到 `instfps.idle` 帧率 | `idle` 仅作将来可选档 / A/B | 默认 pause 时未选中实例**一帧都不跑**（桩 rAF 计数断言） | demo.html:908、elysia/multi-instance.js:mpwMultiParseOpts |
| `instlog` | `active` / `all` | `active` | 多实例日志视图：默认只显示 **active 实例**的日志（N 份日志不刷屏）；`all` 全开并带 `[id]` 前缀 | 排查某个格子 | `all` 时日志行数 ×N（每实例有环形上限 300 行） | demo.html:908、elysia/multi-instance.js:createMultiInstanceHost |
| `csz` | `ortho` | 渲染分辨率 | `engine.canvasSize` 口径：缺省 = **渲染分辨率** `cv.width/height`（改动前行为）；`ortho` = **场景正交尺寸** `scene.general.orthogonalprojection`（`elysia/we-renderer/core.js:562-569` 的口径） | 真机 A/B：`?id=3327063360&csz=ortho` 与官方对照后再决定是否翻默认 | P-78 真包复现证明**两种口径都把 12 层放进画布** ⇒ 它不是"日期/时间不上屏"的原因（详见 PATCHES P-78、`canvas-size-test.mjs`）；`ortho` 会改变文字落点 | demo.html:2052 |
| `video` | 相对路径 | 无 | 纯视频模式：直接播库内原始 mp4 | 验证视频层 | 跳过场景解析 | demo.html:385 |
| `view` | `x,y,w,h` | 无 | 视口窗口覆盖（原点平移 + 正交投影宽高） | 官方窗口值复现 | 需 4 个正数否则忽略 | demo.html:1622 |
| `camera` | `fit` | 全投影 | 启用内容 bbox auto-fit 相机（contain 缩放+居中） | 取景对照 | 改变取景 | demo.html:1585 |
| `embed` | `1`（`0` 关） | 关 | **壁纸 iframe 模式**：插件 `applySceneViaRenderer` 恒带 `embed=1`；渲染器据此在首次加载时**完全收起底部日志区并隐藏右下角手柄**（该 iframe `pointer-events:none`，日志展开后用户无法手动关闭 = 第 15 项） | 由插件自动携带，无需手配；`?embed=0` 可强制关掉（在 iframe 里调试仍想看日志时） | 无渲染影响（纯前端 UI）；已存 localStorage 高度的用户手动调整优先，不会被覆盖 | demo.html:261、demo.html:1506 |
| `mode` | `elysia` | WebGL | 走 elysia CPU 渲染器（对照路径） | CPU/GPU 对照 | 慢（CPU 光栅化） | demo.html:75 |
| `lyrics` | 包内条目路径，或 `0`/`off`/`none` | 自动探测 | 指定**包内自带**的 `.lrc` 条目（`=0`/`=off` 显式关闭歌词）；不填则按通用优先级探测：音频同目录同名 → 音频目录 `lyrics/` 下同名 → 包根 `lyrics/` 下同名 → 包内唯一/最浅的 `.lrc`；探不到就是"无歌词" | 手工挂歌词；或对照"有/无歌词"两种表现 | **只读壁纸包内文件，绝不联网抓歌词**（用户口径：自带才用，没自带就不做）；路径取不到 → 视为无歌词、不报错 | elysia/media-lyrics.js:119 |
| `repofonts` | `off` | 开（包内没有时先试仓库自带） | **四级字体链的「仓库自带」一级**（P-86）：`off` = 跳过本仓库 `assets/fonts/<文件>` 这一级，逐位回到 P-81 的三级链（包内 → `/weassist/fonts/` 本机 WE → `sans-serif`）。不写 = 包内没有时先试**仓库自带**（这一级只放我们有权分发的字体：只从作者/上游取件，**绝不从 `<WE>/assets/fonts/` 复制** —— 逐文件许可/版权行/上游 URL/取件日期/sha256 见 `THIRD-PARTY.md` §4），该级 404 再落本机 WE | 怀疑"某个字的字形其实来自我们自带的字体而不是本机 WE"时做 A/B；也可用来对照"没装 WE 的机器"到底停在哪一级 | 纯来源开关，不改渲染管线、不改字号/排版；off 时**完全不请求** `/assets/fonts/**`（日志写 `?repofonts=off 关了仓库自带一级`）；命中哪一级都会打一行 `🔤 文本字体 <名>：包内/仓库自带/WE 内置` | demo.html:2593 |

## ④ 降噪与上报（自动化）

| 开关 | 取值 | 默认 | 作用（一句话） | 什么时候用 | 回退/风险 | 解析位置 |
|---|---|---|---|---|---|---|
| `noreport` | 存在即开 | **上报关（默认已关）** | 关闭日志+截图+逐层诊断自动上报（**优先级高于 `?report=auto`**） | 插件 iframe（已自动带）/降噪/想显式钉死"绝不上报" | 设备端状态不再落 reports/ | demo.html:4141 |
| `report` | `auto` | **关（不自动上报）** | **①(P-104 2026-09-17 用户发布纪律①)「像你这种测试用的自动上报的功能，这种你在上传仓库的时候要把它默认给关掉。」**：写 `?report=auto` 才启动自动路径（首帧 700ms 一次 + 之后每 10s 一次，自动上限 4 次），把**当前画面截图 + 日志 + 逐层诊断** POST 到本地服务器 `/report`；**不写 = 一个定时器都不建**（默认值本身就是"关"）。除 `auto` 以外的值（含 `1` / 空）都按关处理。`?noreport` 仍被尊重且优先级更高 | 只有在需要设备端连续现场证据时才显式打开 | ⚠ 打开即等于**自动把当前画面与诊断写进本地 `reports/`**（服务端上限 60 份 / 64MB，最旧先删，见 `docs/DATA-LIMITS.md`）。手动入口 `🛰 立即上报` 与 `window.__mpwReport.now()` **不受此开关影响**（用户显式动作，恒可用） | demo.html:4142 |
| `baseline` | `1` / `on` / `yes` / `true` / `≥2 的秒数` / `0`·`off`·`no`·`false` | **关** | **①(§5-⑨ 真机基线快照)**：打开就按固定口径采集一段（默认 **10s**）并 POST 到 `/baseline` ⇒ 落盘 `reports/baselines/<时间戳>.json`（独立目录 + 独立上限 200 份/32MB，**不受** `/report` 的 60 份滚动影响），页面右下角出一行摘要。采：**FPS（500ms 滚动窗中位 + 1% low）**、**每帧耗时 ms 分位（p50/p95/p99/max）**、**启动耗时**（导航→首帧→"纹理齐全/第 90 帧"）、**纹理/层数/活 FBO·活纹理数/draw 数**、**壁纸切换耗时**（见 `baselineswap`）、以及 **VRAM 代理**。同开 `?perf=1` 时会多收"渲染主体耗时"（`render.*`）。`?baseline=<秒>` 顺带定时长；非法值 → **保持关**并打一行原因（不静默） | 真机上定期抓趋势、发版前后对拍同一个包时；`node tools/baseline-diff.mjs <旧.json> <新.json>` 直接给逐指标差异表（退化 → 退出码 1） | ⚠ **VRAM 只有代理**：浏览器拿不到真实显存（WebGL 无此 API）—— `vramProxy.textureBytesEst` 是 Σ(活纹理 level-0 的 w×h×bpp，含 FBO 附件纹理、漏 mip/驱动对齐)，`jsHeap*` 是 **JS 堆**（Firefox/Safari 为 null），**不要**当"显存占用 = X MB"引用；细节与跑法见 `docs/BASELINE.md`。默认关 = 不包装 GL、不建定时器、零记账 | demo.html:1079 |
| `baselinedur` | 秒（2..120） | `10` | **基线采集时长**（①§5-⑨，配合 `?baseline=`）：越界钳到 2..120；非法值 → 用默认 10s 并打一行警告；只写 `?baselinedur` 而不开 `?baseline` ⇒ **仍然不采集**（默认关是纪律，但会打一行说明"写了没生效"） | 想要更稳的样本（真机抖动大）用 `?baseline=1&baselinedur=30`；移动端排查用 30s，快速冒烟用 2..5s | 时长越长快照越稳，但 `?baselineswap` 时总耗时 ≈ 3 × 本值 | demo.html:1079 |
| `baselineswap` | 另一个壁纸 id（`[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}`，拒 `..`） | 无（**不测切换**） | **壁纸切换耗时测量**（①§5-⑨，配合 `?baseline=`）：三段导航口径 —— 测完当前包 → 跳 `<id2>`（记**切过去**耗时）→ 跳回（记**切回来**耗时）→ 合并成**一份**快照上报；指标取首段，`switch.swapTo/swapBack.ms` 各记一次。交接走 `sessionStorage`；不可用时自动跳过并打日志（不静默）。`?baselineswap=<当前包>` 识别为"自我导航"⇒ 直接按单段处理（防死循环） | 用户报"换壁纸很慢/换完卡一下"时量一次；对照换包前后的真实代价 | ⚠ 换包 = **整页重新导航**（本渲染器没有热切换路径），所以这个数字包含卸载/建档/首帧，**不是**"热切换"；总耗时 ≈ 3 × `baselinedur` | demo.html:1079 |
| `prot` | `legacy` | `official` | **粒子 quad 旋转档位**（P-103①）：`legacy` = `p.rot` 逐帧算但从不进顶点 ⇒ 花瓣/玻璃碎片/hex 光斑全部轴对齐（"僵死的贴片"）。本机语料判据命中 **14/49 个粒子层**（11 个 scene 型真包；判据 = `rotationrandom`/`angularvelocityrandom` 或 `angular*`/`rotation*` 算子），分布 3544152633×5 / 3554161528×5 / 3719111841×4 | 复现"粒子不转"的旧画面做 A/B | 仅对照用，非可选画风 | core/we-scene-bundle.js:5870 |
| `pquad` | `legacy` | `official` | **粒子 quad 图层变换档位**（P-103②）：`legacy` = 每颗粒子自己的尺寸/朝向不吃图层 `scale`/z 角 ⇒ 尺寸偏差最大 **7.059×/7.147×**（3327063360「萤火虫」图层 scale=7.059,7.147 实测）与长宽比错化。判据命中 **35/49 个粒子层**（图层 `scale≠1` 或 z 角≠0） | 复现旧尺寸/朝向做 A/B | 仅对照用 | core/we-scene-bundle.js:5887 |
| `pexp` | `legacy` | `official` | **随机 initializer 的 exponent 非线性分布档位**（P-103③）：`legacy` = 完全不读 `exponent` ⇒ 官方的 `pow(u, exponent)` 退化成均匀分布（hina「落花」尺寸均值 60 而非 53.33）。判据命中 **2/49 个粒子层**（均在本机 3554161528「落花」，`sizerandom` exponent=2） | 复现旧分布做 A/B | 仅对照用 | core/we-scene-bundle.js:5903 |
| `pspeed` | `legacy` | `official` | **发射器 `speedmin/speedmax` 初速档位**（P-103④）：`legacy` = 不读这两个字段 ⇒ 只写 speedmin/speedmax 的发射器粒子**原地不动**（缺初速）。判据命中 **2/49 个粒子层**（3554161528 与 3660962877 的 `cherry blossoms on cursor`，speedmin=0/speedmax=20） | 复现"粒子不动"的旧画面做 A/B | 仅对照用 | core/we-scene-bundle.js:5917 |
| `pframe` | `legacy` | `official` | **精灵表（spritesheet）帧时序档位**（P-126B 用户⑦「第 18 层雾 2」）：官方 = 按 TEXS 帧表的 `duration` 与**粒子年龄**取帧 `frame = fmod(age·speed, duration)/duration·N`（正放、与 age 同步）；`legacy` = P-124 的 `fv = (1 − lifePos)·sequencemultiplier` ⇒ **倒放**、速率 = 1/life、**逐粒子各自相位**。hina 3554161528「雾 2」（fog3 = 64 帧 / duration 1）实测 `age=0.25s`：official 帧 **16** / legacy 帧 **59~62**；只有 `duration>0`（TEXS 帧表带 frametime）的贴图受影响，其余粒子层两档逐位一致 | 复现"雾几乎不动/缓慢倒放"的旧画面做 A/B；真机 `?ln=17` 对照 | 仅对照用，非可选画风 | core/we-scene-bundle.js:6577 |
| `pops` | `legacy` | `official` | **粒子算子口径档位**（P-126C/D/F 用户⑧ 四件事 + ①P-133 追加三件：`vortex` 的 `distanceinner/distanceouter/speedinner/speedouter` 字段名与「圆心 = 控制点（lockToPointer ⇒ 光标）」、`sizechange`/`alphachange` 的 `FadeValueChange` **线性**曲线、以及 `vortex`/`sizechange`/`alphachange` 各 case 内的旧口径分支 —— 同一批）：`legacy` = ①`oscillatealpha` 加性+clamp（base=0.5 时 **24.9% 周期 α=0 ⇒ 整颗消失**）②`oscillateposition` **每帧覆盖位置**（每颗粒子 `corr(x,y) = −1.0000` = 沿固定对角线机械摆动，movement/turbulence 的漂移被抹掉）③`controlpointattract` 判据 `d > threshold/2`（**反了**，官方 `d < threshold/2`）④`turbulence` 的 `mask` 缺省 `[1,0,0]`（只沿 x 推）。official 对应：乘性摆动（base=0.5 时 α∈[0.35,0.5]）、逐轴增量、近距才施力、缺省 `(1,1,0)`。hina 两个萤火虫 def 四项全中 | 复现"萤火虫沿固定对角线来回闪"的旧画面做 A/B；真机 `?ln=22` 对照 | ⚠ `legacy` 下 ②③ 必须**同批**：只回退 ②会让反判据 + 退化目标把粒子推离画布（实测 x≈9700px / 画布宽 3840） | core/we-scene-bundle.js:6596 |
| `pcolor` | `legacy` | `official` | **A 类粒子颜色口径档位**（P-130 批A「颜色路径回退口」，跨批必做）：`official` = 本批修完的口径 —— ① `colorrandom` **缺 `max`** 时用官方缺省 `{255,255,255}`（与 `min` 同域 = 字节域）⇒ 只写 `min:"255 255 255"` 的 **68 层 / 13 包**（含 hina `dd/3554161528` ln=17「雾 2」）应为**恒白**；② `colorchange` 用官方的**乘**（`MutiplyColor`：逐帧从"出生期快照色"乘一次）⇒ 逐粒子色差保留。`legacy` = P-126 及之前的**颜色计算**口径（= 改动前画面）：① 缺 `max` 用旧**归一化域**缺省 `[1,1,1]` ⇒ 与字节域 `min` 混算成随机灰度 `1−0.996·u`（最暗近黑，实测 R∈[0.007,0.999]）；② `colorchange` 用旧的**赋值**式（`mix(startvalue, endvalue, age/endtime)`）⇒ 末段所有粒子同色（13 层 / 4 包被抹平，实测全 0.5）。两档都**照常上屏**（只回退"颜色怎么算"、不回退"颜色上不上屏"） | 真机对拍本批两条颜色修复：hina `3554161528&ln=17`「雾 2」默认应**整片纯白**、加 `?pcolor=legacy` 回到**灰白噪点雾**（实测顶点色 ∈[0.004,0.968]、colorAttr=1）；`3544152633&ln=25`「Vapor (double)」默认逐粒子色只会**变暗**（≤206/255），legacy 下上界 **0.9802**（与自身颜色无关的赋值色） | ⚠ 与 `docs/PARTICLE-CORPUS-SCAN.md` §4 的措辞差异：那里把这条备注成"回退成恒 `(1,1,1)`"——那是 **P-126 之前**的*绘制常量*（颜色算完但不进顶点 ⇒ 白点）；本批按仓库既有 legacy 约定（`?pops`/`?pframe`/`?psize` 都是"回到改动前的画面"）实现为**颜色计算口径**档位，理由：A 类回退口的用途是真机 A/B 本批两条颜色修复，若连绘制也退回恒白，legacy 与 official **两侧都是白点**、等于没有回退口。只影响粒子层（`renderParticleLayer`），不碰层/效果链 | core/we-scene-bundle.js:6719 |
| `pturb` | `legacy` | `official` | **粒子湍流初速场口径档位**（P-140 用户第 7 项「第 2 个壁纸第 26 层 vapor 被渲染成各种发散的线条」）：`turbulentvelocityrandom` initializer 的**初速方向**怎么算。`official` = **方向是位置的函数**（相干场）：`dir = normalize(f(p.pos·PTURB_K, 出生时刻×timescale))` ⇒ **同一处出生的粒子同向、相邻位置方向平滑**（官方语义 = 按位置采样的 curl 噪声场；三个独立参考实现都如此）。`legacy` = P-139 及之前的口径：方向 = `p.random` 抽的**独立随机出生角**（`cos/sin(p.random·2π)`）⇒ **同处出生的粒子各自飞散**。⚠ 为什么这条是 bug 而不是"近似"：`renderer=rope` 的层把存活粒子按**发射序**连成 ribbon （`dd/3544152633` 第 26 层「Vapor (double)」就是），粒子一散 ⇒ 屏幕上是一堆细长交错的线（用户原话"各种发散的线条"）。语料里吃到这条 initializer（`speedmin/speedmax≠0`）的共 **28 层**：rope 13 / sprite 14 / spritetrail 1；rope 族的"发散长线"判据命中数 **13 → 0**（`dd/3544152633 ln=25` 段长中位 172→16px、ribbon 总长 7000→807px、>60px 的段 27→2，`0917/3233141951` 龙烟 2221→62px；粒子出生期方向序参量 `|Σv̂|/n` 0.04~0.11 → **1.00**）。sprite 族（落花/樱花/灰烬）观感变化方向相反、**必须真机逐层对拍 `$MPW_ROOT/allwallpaper/dd/3544152633/preview.gif`**：从"四散"变成"整团漂移"。⚠ `PTURB_K`（缺省 `0.002` ≈ 500px 特征尺度）是**待标定量、不是官方值**：三个参考实现对 def 里 `scale: 0.1` 的**量纲互相冲突**，我们没有官方二进制可对拍 ⇒ 真机对拍后第一刀调相位/手性、第二刀才谈 scale 量纲。音频语义**保留**（P-132 批 D）：**每粒子相位**乘 `(1+env)`（与旧算式 `p.random·2π·(1+env)` 的落点逐字同构；`phasemax=0` 的层 —— 就是本层 —— 按官方那句 "no effect on particles with a `0.00` phase" 音频对它**无影响**）；`env=0`/无音频视图时逐位不变。⚠ 与取证报告 §4.1 代码片段有一处**必要偏离**：该片段在 `p.pos=(0,0)` 处 `n1≡n2` 退化（方向只剩 ±45°，相位只影响符号 ⇒ `particle-render-correctness` ⑧-6 实测变红）⇒ 本实现按该片段自己说的"复用 turbulence operator 的 sin/cos 场"，把两个分量的**时间系数拆开**（operator 是 `t·0.7`/`t·0.5`） | ①`dd/3544152633&ln=25` 默认应看到**小烟团**而不是线团，加 `?pturb=legacy` 应**逐位回到线团**；②`?id=3233141951&ln=13`「龙烟」不再有横贯全屏的长线；③同族 sprite 层（`?id=3554161528&ln=3/20` 落花、`?id=3233141951&ln=51` 樱花）对拍官方 `$MPW_ROOT/allwallpaper/**/preview.gif` 决定要不要分批放默认 | `legacy` 逐位回到改动前画面（同种子/同帧数出同数字，28 层全表已对拍）；单变量、只影响 `turbulentvelocityrandom` 一个 case，**不动** RNG 流（`amp` 的那次 `rng()` 位置与次数不变）、不动 `one_per_frame`/`subdivision`/`children` | core/we-scene-bundle.js:7249 |
| `children` | `legacy` | `official` | **粒子 `children`（子系 / 拖尾）全家族口径档位**（P-144 批 B，语料最大单项）：`official` = 按官方语义生成子系 —— `type` ∈ {`static`（缺省，官方 `ParseSpawnType` 只认另外三个字符串）, `eventfollow`, `eventspawn`, `eventdeath`}，缺省 `maxcount 20` / `probability 1.0` / `controlpointstartindex 0`；`static` 常驻锚在「父层变换 × 子系 authored origin」（走 `localToWorld`）、`eventfollow` 的原点每帧对到父系**最早出生的活粒子**（这就是萤火虫拖尾）、`eventspawn`/`eventdeath` 在父粒子**出生/死亡那一帧**于父粒子位置各吐一发（`probability` 逐事件门控、`maxcount` = 并发实例上限）。`legacy` = P-143 及之前：**一条子系都不生成、一个随机数都不抽**，连父系的出生/死亡事件数组都不建 ⇒ 顶点流 / 粒子数 / RNG 流逐位回到改动前。语料命中 **76 个父层 / 21 个包 / 149 条子系**（`eventfollow` 37、`static` 34、`eventdeath` 30、`eventspawn` 8、`type` 缺失 40 = 官方缺省 `static`），其中 **83 条子系的贴图在包外**（走 `/weassist` 回退链；缺贴图**只跳该条子系**，父层与其余子系照画，不画白块） | 真机逐层对拍官方 `$MPW_ROOT/allwallpaper/**/preview.gif` 前先看"没有拖尾"的旧画面；或某条 `eventfollow` 让本来安静的一层多出一条尾巴、需要临时关掉整族定位是谁加的 | `legacy` **逐位可回退**（同种子/同帧数出同 sha256：`dd/3554161528` 萤火虫层 legacy 与"源码级换回旧实现"变异体的顶点流 sha 逐位相同），且**父系 RNG 流与父系顶点流两档完全一致**（门禁 `particle-children` ③-a/③-b/④-g 钉住）。⚠ 子系本身是**新画的一批 quad**（`dd/3554161528` ln=22 实测：子系 quad 0 → 7、子系存活粒子 0 → 7、每帧更新 5 → 12）⇒ 真机对拍时"多了东西"是预期行为、不是回归 | core/we-scene-bundle.js:7563 |
| `nodiag` | 存在即开 | 采样开 | 关闭渲染后逐层 quad 中心 readPixels 采样（3s 后打一行 `【DIAG】层名@(x,y)R,G,B …`）。P-64-MEDIA 轮起**采样坐标按投影系通用换算**：`px = round(设计x / 投影宽 × cv.width)`（投影宽取 `scene.general.orthogonalprojection.width`，缺省 3840×2160）——旧写法写死 1280×720，`?res=` 换档后坐标会整体偏 | 极致性能排查；对照某层画在哪/什么颜色时看这行 | 少了逐层中心采样证据 | demo.html:3735 |
| `nodebug` | 存在即开 | 打印开 | 关闭图层清单等启动日志 | 降噪 | 无 | demo.html:1938 |
| `autorun` | 存在即开 | 关 | 每 45s 自动跳下一个固定场景并持续上报 | 批量真机回归 | 会自动换页 | demo.html:92 |
| `autorundone` | 存在即开 | — | 自动化完成页（只显示结论，不再开始） | autorun 单程结束落地 | 无 | demo.html:350 |

## ⑤ 插件侧（DSH 宿主页）

| 开关 | 取值 | 默认 | 作用（一句话） | 什么时候用 | 回退/风险 | 解析位置 |
|---|---|---|---|---|---|---|
| `mpwdiag` | localStorage `mpwdiag=0` | 上报开 | 关闭设置面板/菜单 DOM 诊断自动上报（`?mpwdiag=1` 历史形式已改零操作自动） | 需要静默时 | 少了 DOM 诊断证据 | dsh-mpkg-wallpaper/lib/client.js:2185 |
| `inlinefrost` | `1` | CSS 接管 | 恢复旧"内联样式磨砂"行为做对照（现由 buildCss 纯 CSS 接管） | 磨砂消失类回归 A/B | 旧内联路径与 React 冲突（模糊间歇消失） | dsh-mpkg-wallpaper/lib/client.js:2237 |
| `thumbpost` | url | 无 | 渲染器首帧/第 90 帧 POST 缩略图到该地址（宿主 `/custom-scene-thumb`） | 场景缩略图缓存（渲染器离线仍显示） | 失败仅日志，不影响渲染 | demo.html:2056 |
| `mpwinteract` | `full` / `pointer` / `off`(\|`0`)；`1`(\|`on`) = 挂载后自动开 | `pointer`（设置项 `webInteraction` 可改；缺省**不自动**接管输入） | **网页壁纸交互档位**（插件侧）：`pointer` = 可点/可滚但不注入键盘，`full` = 连键盘一起接管，`off` = 完全旁路；`?mpwinteract=1`/`on` = 壁纸挂载后**立即**进入交互模式（否则要用户点面板按钮） | 排查「网页壁纸点不动 / 滚不动 / 键位被壁纸吃掉」；自动化需要开屏即可交互时 | 只影响**网页壁纸**（帧内 shim 通道），本渲染器与场景壁纸不受影响；`off` 时页面内按钮/滚动条回到宿主 | dsh-mpkg-wallpaper/lib/client.js:2167 / :2321 |
| `mpwpersist` | `legacy` | 关（= 修复后行为） | **壁纸持久化修复的回退开关**（2026-09-17 独立成线）：默认 = 大 dataURL（≥ `MPW_LS_SPILL_BYTES` = 2097152 字节 / 2048 KB）落 **IndexedDB**、localStorage（单值硬顶 `MPW_LS_MAX_BYTES` = 262144 字节 / 256 KB）里只留 `idb:img` 哨兵，读侧两种形态（Blob/dataURL）都能恢复；localStorage 拒写且 IDB 不可用时**留痕 + 面板弹窗告警**（不静默丢）。`legacy` = 回到改动前（只有 >2MB 才落 IDB、落在 (256KB, 2MB] 的壁纸两边都不落 ⇒ 刷新回默认壁纸，且不告警） | 真机 A/B「刷新后壁纸选择丢失 / 回到默认」这类回归；怀疑落 IDB 分支本身在捣乱时也可回退 | `legacy` = 刷新/重启后壁纸选择可能丢（就是被修掉的那个 bug）；阈值表与失败降级行为见 `dsh-mpkg-wallpaper/docs/PERSISTENCE.md` | dsh-mpkg-wallpaper/lib/client.js（`mpwPersistLegacy`，正则 `[?&]mpwpersist=legacy`） |
| `mpwshim` | `1` | 无（不注入 shim） | **网页壁纸「宿主注入 shim」通道标记**（P-90 期间由**插件侧**新增；本行是为了让 `diag-flag-check` 的**双向**比对归零 —— 该脚本按设计同时扫 `dsh-mpkg-wallpaper/lib/client.js`，插件新增开关必须在本表登记）。带 `mpwshim=1` 的帧 URL 走**不透明源**沙箱（`allow-scripts`），作者脚本摸不到宿主 DOM / localStorage，静音/倍速/暂停由 shim 在帧内执行；兼容模式（`allow-scripts allow-same-origin allow-pointer-lock`，等价改动前的裸 iframe）在确认弹窗里可选 | 由插件自动携带，**无需手配**；排查「网页壁纸的脚本读不到 localStorage / 设置面板打不开」时用它区分两条沙箱通道 | 只影响**网页壁纸**（`mpwWebSandboxAttr`），本渲染器与场景壁纸不受影响；去掉该参数即回到兼容模式沙箱 | dsh-mpkg-wallpaper/lib/client.js:1401 |
| `lgcss` | `off` | 开（`lgCss` 设置项打开且环境支持时） | **纯 CSS/SVG 液态玻璃的一键回退口**（插件侧）：`off` = 整块「液态玻璃（折射 + 高光边缘）」不生成（不清设置、不改 DOM，刷新页面即回默认） | 该特性 2026-09-18 才**首次真正启用**（此前因 `bdSupported` 同函数作用域 **TDZ** `ReferenceError` 被 `catch` 吞掉，整块从未执行）；真机观感/性能未验 —— 中低端 + 场景壁纸同时跑若掉帧，用这个口子一秒对照 | `off` = 侧栏/顶栏/输入框/设置面板失去 SVG 折射玻璃（回退到普通磨砂 blur，不是坏掉）；判据：`dsh-mpkg-wallpaper/tools/switch-wiring-test.mjs` 的 A3 段（双向断言 + 变异自证） | dsh-mpkg-wallpaper/lib/client.js（`lgCssOff`，正则 `[?&]lgcss=off`，见插件仓 `dsh-mpkg-wallpaper/docs/TOKEN-NAMESPACE.md` §3b） |

## ⑥ elysia CPU 渲染器（`?mode=elysia` 专用）

| 开关 | 取值 | 默认 | 作用（一句话） | 什么时候用 | 回退/风险 | 解析位置 |
|---|---|---|---|---|---|---|
| `w` | 像素 | 640 | CPU 渲染画布宽 | CPU 对照调分辨率 | 大=慢 | elysia/demo-elysia.js:66 |
| `h` | 像素 | 360 | CPU 渲染画布高 | 同上 | 同上 | elysia/demo-elysia.js:67 |
| `fps` | 帧率 | 2 | CPU 渲染目标帧率（最小间隔） | 降载 | 动画变卡顿 | elysia/demo-elysia.js:68 |
| `t` | 秒 | 0 | CPU 渲染初始时间 | 定格某时刻 | 无 | elysia/demo-elysia.js:69 |
| `hdrfrostwatch` | `off` / 其它值 | **开**（有观察器） | **顶栏磨砂重挂观察器**的回退开关（**插件侧** `dsh-mpkg-wallpaper/lib/client.js`）：顶栏被宿主整块重建时靠 childList 观察器在 ~60ms 内把磨砂层补回新顶栏 | 顶栏磨砂在切会话后短暂消失（旧行为要等 3s 低频保险）时做单变量 A/B | `off` = 退回旧行为（只在设置/主题变化 + 3s 保险时同步）⇒ 相位对齐最坏 ≈3000ms；默认开时实测 ≈66ms。只在浏览器侧生效，宿主重启不涉及 | dsh-mpkg-wallpaper/lib/client.js:3413 |

## ⑦ 显示选项（P-113：水平翻转 / 播放速度 / 颜色选项四项）

机制（与上游 `oneincase/webwallgl` MIT 的 `?fx=`/`setFilter` 同一套，非同一份代码）：**CSS `filter`/`transform` 作用在"拥有渲染输出的元素"上**（本仓库 = canvas `#sc`；多实例时各自的画布）——不重挂载、不进 GL 管线、不改一帧像素。完整口径/区间/优先级/指针行为见 `docs/DISPLAY-OPTIONS.md`；断言在 `tests/display-options-test.mjs`（门禁项 `display-options`）。

| 开关 | 取值 | 默认 | 作用（一句话） | 什么时候用 | 回退/风险 | 解析位置 |
|---|---|---|---|---|---|---|
| `fliph` | `1`（`on`/`yes`/只写名字也算） / `0`（`off`/`no`/`false`） | 关 | **水平翻转**：渲染输出 `transform: scaleX(-1)`（CSS 层，画面左右镜像）。**指针同口径镜像一次**：DOM `pointermove` 的归一坐标按 `1 − nx` 换算，指针仍指着"光标底下那点内容"（`framePointerMap` 第四参数）；注入通道 `window.__mpwPointer` 给的是**设计坐标** ⇒ 不镜像（不是镜像两次） | 想验证"画面左右反了/镜像贴图"或与 WE 原生"水平翻转"选项对齐时 | 关（缺省）= 一个属性都不写、指针逐位不变；开着时 `transform` 由本开关**独占**（demo.html 里 0 处别的 transform 写入者）；与 `?fx=`/宿主 filter 无冲突（filter/transform 是两个属性） | core/we-scene-bundle.js:46、core/we-scene-bundle.js:271 / demo.html:977 |
| `rate` | 数（0.5–2） | `1` | **播放速度（全局时间倍率）**：场景时钟按"墙上时间 × rate"推进（`tSec` → 动画/脚本/精灵播放全跟着走，`engine.frametime` 同步乘倍率），并把所有 `<video>` 的 `playbackRate` 设成同一值 | 慢放看细节（0.5×）、快进看循环（2×）；与 WE 原生"播放速度"滑块对齐 | 越界**钳位**（不是非法⇒1）、非法/空 ⇒ `1`；`rate=1` 时时钟走**改动前的原式**且视频零写入（逐位不变）；从非 1 倍切回 1 会把视频写回 1（双向） | core/we-scene-bundle.js:156、core/we-scene-bundle.js:284 / demo.html:1031 |
| `coloropts` | `0`（`off`/`no`/`false`）/ 其它 = 开 | **开** | **颜色选项总开关**：关掉时下面四项**完全不进 filter 串**（即使写了 `?bright=` 也不产生任何 CSS filter） | 用户只想用翻转/倍率、不想让颜色项参与时；或 A/B"颜色项到底有没有生效" | `coloropts=0` 只影响 CSS filter，不动渲染管线；四项本身的值仍被记住（面板/持久化），再打开就恢复 | core/we-scene-bundle.js:141、core/we-scene-bundle.js:213 / demo.html:977 |
| `bright` | 数（0–2） | `1` | 颜色项之一：`brightness(b)`（0 = 全黑、1 = 不变、2 = 提亮一倍） | 壁纸偏暗/偏亮时微调（与 WE 原生"亮度"对齐） | 越界钳位到 [0,2]；非有限 ⇒ 1。**四项全中性时不产生 filter 串**（缺省零行为变化），所以 `?bright=1` 与不写等价 | core/we-scene-bundle.js:80、core/we-scene-bundle.js:213 / demo.html:109 |
| `contrast` | 数（0–2） | `1` | 颜色项之一：`contrast(c)` | 同上 | 同 `bright` | core/we-scene-bundle.js:80、core/we-scene-bundle.js:213 / demo.html:109 |
| `satur` | 数（0–2） | `1` | 颜色项之一：`saturate(s)`（0 = 灰度、1 = 不变） | 同上 | 同 `bright` | core/we-scene-bundle.js:80、core/we-scene-bundle.js:213 / demo.html:109 |
| `hue` | 数（−180…180，度） | `0` | 颜色项之一：`hue-rotate(hdeg)`（色相环偏移） | 同上（注意：它同时会改变整幅画面的色调） | 越界钳位到 [−180,180]；CSS `hue-rotate` 对灰阶像素无效（不是 bug） | core/we-scene-bundle.js:80、core/we-scene-bundle.js:213 / demo.html:109 |
| `display` | `legacy`（`off`/`0`/`no`/`false`） | 无（正常生效） | **总回退开关**：忽略本组**全部**开关（含 `localStorage['mpw-display']` 里的持久化 UI 状态），并且 `__wp.setDisplay` / `__wp.setPlaybackRate` 变成**只读**（返回中性状态、不写任何属性） | 怀疑"画面/指针/速度不对是这组选项引起的"时一键排除；插件侧也用它做"渲染器内部不加任何滤镜"的逃生口 | 回退档 = 画布 style 一字不写、场景时钟与 frametime 逐位回到改动前、控件在工具条里被置灰 | core/we-scene-bundle.js:132 / demo.html:980 |
<!-- FLAG-TABLE-END -->

## 补丁层开关（`demo/bench-patch.js`；**刻意放在表区之外**，不参与 `diag-flag-check` 双向比对）

> **为什么不登记进上面主表**（与下一节「上游有、我们没有的档位」同一处纪律）：
> `tests/diag-flag-check.mjs` 的抓取源**只有四类** —— `core/we-scene-bundle.js`、`demo.html`、
> `elysia/**/*.js`、`dsh-mpkg-wallpaper/lib/client.js` —— **不含 `demo/bench-patch.js`**
> （补丁是站点侧独立文件，`tools/` 与测试都不进产物，见该文件头注）。所以补丁层的 URL 开关
> 一旦写进 `FLAG-TABLE-BEGIN/END` 之内，立刻变成"文档有·代码无（陈旧）"⇒ 退出码 1。
> **实测（2026-09-19，P-129；/tmp 镜像副本 + 同一份脚本，不动真树）**：
> 把 `openrewrite` 一行插进表区之内 ⇒ `✗ 文档有·代码无（陈旧 1 个）: openrewrite`（exit 1）；
> 插到 `FLAG-TABLE-END` 之后 ⇒ `✓ 代码 151 个开关 == README 主表 151 行，0 差异`（exit 0）。
> 补丁层开关的权威清单在 `demo/bench-patch.js` 文件头的「第五批/第六批/第八批/第九批开关」注释段
> （`?ppark` / `?clocklock` / `?clockdrag` / `?brand` / `?appname` / `?online` / `?sample` / `?openrewrite`…）。

| 开关 | 取值 | 默认 | 作用（一句话） | 什么时候用 | 回退/风险 | 解析位置 |
|---|---|---|---|---|---|---|
| `openrewrite` | `off`（`0` / `false` / `no` 同义） | 开（且**只在线上形态**生效） | **「新窗口」按钮的 `window.open` 前缀改写**（P-129）：产物（minified、不可重建）里 `#open` 的处理器写死 `window.open("/wallpaper-engine-webgl/renderer/index.html?…","_blank")` —— 绝对旧路径，线上子路径部署（Pages 根 = `/wallpaper-engine-web-loader/`）会指到**域名根** ⇒ 404。补丁包一层 `window.open`，把**本站前缀**（旧名 + 新名）改写成相对本页；外链 / `blob:` / `data:` / `about:blank` / 相对路径 / 空串一律原样透传，`target`/`features` 三参照传 | 线上点「新窗口」404 时做单变量 A/B（对照"是不是这条改写"）；或给排查者一个"关掉它"的逃生口 | 关掉 = 回到上游原行为（照旧打开那条绝对旧路径 ⇒ 线上 404）；本机 :8901 不改写（旧路径是软链、原样可用，与 iframe 那条同口径）；任何一步失败只打 `console.warn`，绝不影响按钮本身 | `demo/bench-patch.js` 的 `readPatchFlags`（`openrewrite:`）+ `installOpenRemap` 调用点 |

### 上游有、我们**没有**的档位：`pq`（只记语义结论，不是开关）

> **本小节刻意放在 `FLAG-TABLE-BEGIN/END` 之外**：主表由 `diag-flag-check.mjs` 做**双向**比对
> （代码有·文档无 = 漏写；文档有·代码无 = 陈旧），所以表里**只能**放"代码里真解析的开关"。
> 把上游档位写进表里会把这张表从"代码开关清单"变成"上游功能清单"，比对立即变红。

上游 `oneincase/webwallgl`（**MIT**）1.3.23 的第三组档位是 **`?pq=`**（**粒子**质量 `off/low/medium/high`），
其 `0.4 / 0.7 / 1` 是**粒子数量（`maxcount` 上限）与发射率**的倍率（上游 `renderer/src/quality.ts:29-33`
的 `PARTICLE_QUALITY_SCALE`）—— **不是分辨率比例、也不是内部渲染尺寸**（P-90 专门读了代码确认这一条，
因为字面上很容易被误当成"分辨率比例"）。`pq=off` 由装配层直接跳过粒子系统的推进与渲染。

**我们不引入 `pq`**：本仓库的粒子预算走既有的 `PARTICLE_BUDGET` 与 `?perf=auto` 阶梯
（见 `?perf` / `?psim` 行），另起一套档位会和它们打架。完整对照见 `PATCHES.md` P-90 与
`docs/WEBWALLGL-UPSTREAM-STUDY.md` §5。

## 页面内 UI（非 URL 开关，不进上表）

| 控件 | 位置 | 行为 | 记忆 |
|---|---|---|---|
| 底部日志手柄 `#logbar`（Q8，用户第 15 项） | 日志区上沿（收起时缩成右下角小药丸） | 拖动改日志高度（剩余可见区域继续滚动）、点箭头 ▾/▴ 完全收起/拉出、键盘 ↑/↓±32px、Home=35%、End=收起、Enter=切换；完全收起 = 日志本体 `height:0;display:none`（不遮壁纸），箭头翻转 | `localStorage['mpw-log-h']` = `'collapsed'` 或高度比例（默认 `0.35`，上限 0.85）；不透明源下读写失败自动忽略 |
| 顶栏 🔊 音频按钮 `#mpw-audio-btn` + 面板 `#mpw-audio-panel`（N6，用户决策 C） | 顶栏（`#bar`）内；面板固定右上角 | **现场解析当前包内音轨**（`pkg.entries` 音频扩展名 ∪ `scene.json` `sound` 层引用 → 去重 + "被 N 层引用"；MIME 走 magic 字节嗅探、扩展名兜底）→ 每条一行：文件名 / 大小 / 时长（`loadedmetadata` 后填）/ 格式 / 引用数 + `▶︎`/`⏸` + `↓` 下载（`<a download>` + Blob URL）；复用场景 sound 层那一个 `AudioContext`/`analyser`，暴露 `window.__mpwAudio = { ctx, analyser, current }` 与每帧 `window.__mpwAudioFrame?.(freqData)` **预留位**（本批不实现反应效果）；点播放即用户手势，可 `resume()` 被拦截的 AudioContext | `localStorage['mpw-audio-open']` = `'1'`/`'0'`（默认关）；**仓库不预置任何音频文件**，音轨一律运行时从包内切片 |

| 左侧 ⚙ 属性按钮 `#mpw-props-btn` + 面板 `#mpw-props-panel`（P-61 → P-64；用户第 5/6/11/14/15/16/17/18/22 项） | 顶栏（`#bar`）内按钮（用户给的 `settings` 线条图标）；面板固定左上角（默认展开） | **官方属性面板等价物**：从当前包 `project.json → general.properties` 通用渲染（按 `order` 排序、`group` 成分组标题、`condition` 表达式实时联动显隐、`slider` 用 min/max/step + `precision` 读数、`bool` 用 Uiverse 勾选框（类名 `mpw_cb`/`mpw_checkmark`）、`text` 类文本框（灰边；`:focus` 变亮，无黄框）、`combo` 按字符串值、`color` = `mpw_colorSwatch` 色块 **点开浮窗 HSV 取色器**（色相条 + SV 面板 + hex 输入 + 预览 + 确定；与插件 `dsh-mpkg-wallpaper` 同一套交互，0..1 ↔ `#rrggbb` 双向、写回线性 0..1）；**第 11 项显示层清洗**：作者 `text` 里的 HTML 实体（`&nbsp;` / 无分号 `&nbsp` / `&amp;` / `&lt;` / `&gt;` / `&quot;` / `&#39;` / 数字实体）按 HTML 语义解码成字符再显示，连续空白折叠成 1 个、`\n`（作者的 `<br>`）保留，**键名与 `condition` 一个字都不动**；**第 14 项**：作者只写 HTML 的条目（`<img src=…>` 分隔图 / 营销块）显示成占位符 `🖼 图片 <宽×高>`，全文放 `title`（不再显示 194/195 字符的键名）；**第 17 项**：行高由**文本排版**决定（`align-items:flex-start` + 可换行 + 无 `max-height`/裁剪），面板底部留 18px + `scroll-padding-bottom` → 最后一条（日月循环「声明」1083 字符）能完整滚进视野；`data-bound=1/0` 标出该属性在场景里是否真被引用；尾部「显示跳过的条目」列出 `scenetexture`/`usershortcut`/`file`/`schemecolor`/无 `type` 营销块/空开关各条（第 6 项：解析出来但不假装实现）；改动**即时生效**（写 `window.__mpwUserProps` → `applyUserProperties` 重写层属性 → `applyScriptProps` 重解脚本属性 → 文本绑定按**用户值**同步（第 5 项）→ 时段相关属性（`timevarying`/`display`/`morningtime`/`daytime`/`dusktime`/`nighttime`）改动**当帧重算** `applyTimeVariation`（第 15 项；`?time=` 仍最高优先）→ 有脚本缓存（`?scriptcache=1`）时 `invalidateUserProps` 复位） | `localStorage['mpw-props:<sceneId>']` = 与作者默认的**差异表** JSON（默认 `{}`；`?props=` 钉住的键不写入）；展开状态 `localStorage['mpw-props-open']`（默认展开）；`?nopanel` 整体关闭；`embed=1`（壁纸 iframe）首次加载收起且隐藏按钮；「恢复作者默认」按钮 = 清空差异表 |

| 媒体集成（P-64-MEDIA，用户第 9④ 项） | 无独立 UI：真实源 = 顶栏 🔊 音频面板**正在播的那条音轨**；注入源 = `?media=…` 或控制台 `window.__mpwMedia` | 把 WE 官方的「媒体集成 + 音频响应」接到脚本宿主：`elysia/media-host.js` 的媒体状态机 → `dispatchScriptEvent(scriptCache, name, payload)` → 作者脚本的 `mediaPropertiesChanged / mediaThumbnailChanged / mediaPlaybackChanged / mediaTimelineChanged / mediaStatusChanged`（语料 6 容器 ≈180 个媒体·音频脚本节点）。**音频响应**：`sceneAudio.analyser`（场景 sound 层那一个 FFT）→ `media.setAudioSpectrum` → `media.audioBuffers(n)`（同一 n 永远同一对象、原地更新）→ 脚本 `engine.registerAudioBuffers(16).average[i]`。**没有媒体时什么都不派发**（作者层停在 authored 占位文本/可见性，不新增报错）；歌词只在**包内自带** `.lrc` 时使用（`?lyrics=` 覆盖/关闭，绝不联网） | `window.__mpwMedia`（`set/play/pause/stop/position/spectrum/lyrics/cover/state/repush`）+ `window.__mpwMediaState`（诊断快照，随 `__mpwProps.media` 上报）。**依赖 `?scriptcache`（默认开）**：`?scriptcache=0` 时不建宿主（P-62 陷阱 A）。**封面进画面还差渲染端**：官方走材质纹理槽 `$mediaThumbnail`（`effects[].passes[].usertextures`），那段解析在 `core/we-scene-bundle.js`（本批未改） |

## 历史开关（代码已不存在，勿再使用；由 diag-flag-check 双向比对自动暴露）

| 开关 | 状态 | 说明 |
|---|---|---|
| `diag` | 已移除 | 旧"渲染后逐层采样"独立开关；现默认常开，用 `?nodiag=0`…即 `?nodiag` 关闭 |
| `embed` | **已消费**（2026-09-14 P-57） | 插件 iframe 的 `embed=1` 现已解析：首次加载收起日志区+隐藏手柄（详见 ③ 数据源与模式表） |
| `mpwcss` | 已移除 | 旧 CSS 开关；磨砂现由 `mpwcss` 取代为 `inlinefrost` 对照位 |
| `perf` / `selfcheck` | 计划中 | 归合并任务书 ②；落地前脚本不会收编，本表不提前登记 |

## `window.__mpwProps`（P-61 属性面板诊断字段，随 `/report` 的 `userProps` 上报）

| 字段 | 含义 |
|---|---|
| `count` | 包内属性总条数（hina 3554161528 = 35） |
| `rendered` | 面板上真实出现的**条目**数（控件 + `group` 标题；hina = 30 = 35 − 5 条跳过） |
| `skipped` | 被跳过的条数（hina = 5） |
| `conditions` | `{total, shown, off:[名]}`：带 `condition` 的条数 / 当前显示的条数 / 门控关闭的属性名（含传递闭包，如 `clock=false` → `_24h,newproperty21,…`） |
| `values` | 生效值表（作者默认 ← localStorage ← URL `?props=`，已按官方类型规范化） |
| `controls` / `groups` | 可操作控件数 / 分组标题数（hina 25 / 5） |
| `skippedByReason` | `{html, editor, unimpl, dead}` 四类被跳过属性名（便于区分"没渲染"的原因） |
| `locked` | 被 URL `?props=` 钉住的键（面板里置灰） |
| `stored` | localStorage 差异表里的键 |
| `urlProps` | 本次 URL 里解析到的覆盖键值 |
| `panel` | 面板自报 `{count, rendered, controls, hidden, skipped, decor}`（`?nopanel` 时为 `null`；`decor` = 作者只写了 HTML/图片的条目数） |
| `lastApply` | 最近一次 `applyUserProperties` 统计 `{layers, bound, applied, gated, missing, fields}` |
| `entityDecoded` | P-64 第 11 项：有多少条标签被**实体解码**改过（真机日月循环实测 31 条无分号 `&nbsp`；>0 说明作者 `text` 里有 HTML 实体） |
| `decorRows` | P-64 第 14 项：作者只写了 HTML（`<img src=…>` 分隔图/营销块）而被显示成 `🖼 图片` 占位符的条目数 |
| `timeVariation` | P-64 第 15 项：`{prop, mode, picked, hour}`（当前时段组 / 模式 `clock` 或 `pin` / 选中层名 / 小时）；面板改 `timevarying`、`display`、`morningtime`… 后当帧更新 |
| `scriptCache` | P-64 第 15 项：`{on, entries}`（`?scriptcache=1` 时 `on=true`，`entries` = 已编译脚本条目数）；`on=true` 时面板每次改值都会 `invalidateUserProps` 复位 |
| `media` | P-64-MEDIA 用户第 9④ 项：媒体集成快照 `{hasMedia, title, artist, playback, position, duration, lyricsPath, cover}`（`playback`：0 停 / 1 播 / 2 暂停；**无宿主或无媒体时为 `null`**，不污染既有字段）。数据源 = `window.__mpwMediaState`（每帧由 `mpwMediaTick` 更新） |

设备端读法：`reports/*.json` → `userProps.rendered` 对不上包内条目数 = 面板渲染丢项；
`userProps.conditions.off` 与画面对不上 = 门控/绑定问题；`userProps.locked` 非空 = 该次运行被 URL 固定了属性。

## `videoStats`（P-68 视频档位/上传台账；`renderer.videoStats`，随 `/report` 的 `videoStats` 上报）

> 取法：`renderer.videoStats`（渲染器对象上的只读 getter，快照拷贝）。**真机上报已接线（P-64-MEDIA 轮顺带，P-68 交接 ⑤.2）**：
> `demo.html` 的 `/report` payload 里有 `videoStats: (renderer && renderer.videoStats) || null`（与 `particleBudget`
> 同一层，demo.html:3905 附近）→ 每次自动上报都带 29 字段台账，不再只靠 5s 一次的日志行。
> 另外渲染器每上传满 5s 仍会打一行 `[we-scene][P-68] videoStats {…}`（payload 的 `log` 过滤含
> `[we-scene]` ⇒ 也落在 `reports/*.json` 里；视频一直没上传时不会打）。

| 字段 | 口径 |
|---|---|
| `res` | URL `?res=` 原值；`null` = 未给（用默认档） |
| `tier` | 解析后的档位名：`720p`/`1080p`/`1440p`/`2160p`/`custom` |
| `legacy` | `1` = **逐位兼容改动前行为**的档（`?res=720p` / `?res=legacy`） |
| `canvas` | 画布尺寸 `WxH`（= 档位尺寸；与 `demo.html` 的 `cv.width/height` 同源同值） |
| `cap` | 视频纹理**上传上限** `WxH`（= 档位尺寸） |
| `throttleMs` / `throttleFps` / `throttleSrc` | 实际上传最小间隔（ms）/ 目标 fps / 来源（`tier-legacy`、`tier-default`、`url-fps`、`url-ms`、`url-unthrottled`、`url-invalid:*`） |
| `smoothing` | 2D 中转时写入的 `imageSmoothingQuality`（`high`；`legacy` 档为 `low` 且**不写**该属性 = 浏览器默认） |
| `mip` | 恒 `0`：视频纹理不建 mip 链（上传上限 ≤ 画布 ⇒ 永不缩小采样；且 4K 源是 NPOT，Adreno 上 `generateMipmap` 有静默失败史） |
| `src` / `up` | **源分辨率** vs **实际上传纹理尺寸**（`WxH`；改动前真机恒为 `3840x2160 → 1280x720`） |
| `direct` | `1` = 最近一次上传**直传 `<video>`**（无 2D canvas 中转）；`0` = 走了 canvas |
| `bytesPerFrame` / `MBps` | 每帧上传字节 = `up` 宽×高×4 / 实测每秒字节 = `bytesPerFrame × upFps / 1e6` |
| `uploads` / `upFps` / `frames` | 累计上传帧数 / **实测上传 fps**（最近 1s 滑动窗）/ 进入上传分支的帧数（含被节流的） |
| `skipThrottle` / `skipNotReady` | 被节流跳过的次数 / `readyState` 未就绪跳过的次数 |
| `viaCanvas` | 走 2D canvas 中转的上传累计次数（`viaCanvas + direct 帧数 = uploads`） |
| `err` / `firstAt` / `lastAt` | 上传异常次数 / 首帧上传时刻 / 末次上传时刻（`performance.now()` ms） |
| `perfMode` / `perfLevel` / `perfFboCap` / `perfSuppressed` | `?perf` 模式（`''`/`1`/`auto`）/ auto 升到的档位 / **实际生效的 fboCap** / 因高分辨率档被抑制的升档次数（`?fbocap=low` 时不抑制） |
| `fboAutoLow` | `1` = 本次运行用了 `?fbocap=low`（恢复旧的 fboCap 阶梯） |
| `tex[]` | 每个视频纹理一条 `{n, src, up, tier, cap, direct, uploads, upFps, viaCanvas}` |
| `play` | 脚本视频控制记账 `{seen, play, pause, seek, rate, src}`：`seen` = 见到脚本标志的帧数，其余 = 真正作用到 `<video>` 的次数（`play/pause` 读 `layer.__videoPlay`；`seek/rate` 读预留的 `__videoSeek`/`__videoRate`，见 P-68 §未定项） |

**`texStats` 的视频条目**另有回填：`demo.html` push 的 `{n,d,kind:'video'}` 上会多出
`src`（源分辨率，与 `d` 同值）、`up`（实际上传分辨率）、`tier`、`cap`、`direct`、`upFps`、`viaCanvas`。
即**同一条上报里既能看源、也能看真实上屏纹理尺寸**。

## 与面板/校验的关系

- 面板"诊断开关速查区"（设置 → 测试 → 场景渲染分组内折叠）展示常用 10 个
  （`att/mcc/piv/align/parallax/audio/whitefallback/hier/isolate/audit`），一键复制 URL 片段；
  数据源 = 本仓库 `web/diag-flags.json`（脚本生成），渲染器在线时取 `GET <renderer>/diag-flags.json`，
  离线用 client.js 内置副本（`tools/panel-smoke.mjs` 断言两者集合一致）。
- 校验：`node diag-flag-check.mjs`（0 差异退出码 0；`--fix-hint` 打印建议增删行；`--list` 只列抓取结果）。

## `layerHealth` / `layerHealthSummary` / `missingLayers`（P-64-MEDIA 轮顺带；随 `/report` 同名字段上报）

> 用途（用户原话）："有好多层数它的渲染它都渲染不出来……它都没有标该层不可见，却渲染不出来" ——
> 上报里必须能分开「**不可见**（谁关的）」与「**可见、有几何、却没画**」。纯记账，不改渲染行为。
> 产出 = `mpwLayerHealth(scene, __mpwLayerLedger, __mpwMeshSkip, __mpwGlErrs, {propsSchema,propsMap,time,uiRe,catRe,catOn})`
> （纯函数，`props-panel-test.mjs` T19 用桩场景断言）；页内一行汇总条 `#__mpwHealthTag`。

| 字段 | 口径 |
|---|---|
| `layerHealth[].name` | 层名（截 24 字符，与 `__mpwMeshSkip` 同口径） |
| `layerHealth[].visible` | **解析后的最终可见性**（`l.__lnHidden` / `l.visible` / 容器语义合成；不是作者存盘值） |
| `layerHealth[].visibleBy` | **谁把它关掉的**：`ln-hidden`（逐层调试）/ `container` / `userProp:<名>`（含 `(gated)`，P-61 属性绑定）/ `timeVariant`（时段选层）/ `uiRe`（UI·音频层正则）/ `N5:<clock\|date\|weekday\|fps>`（四类文本开关）/ `script`（作者脚本写的 `{script,value}`）/ `author`（作者存盘 false）；**可见层为 `null`** |
| `layerHealth[].drawn` / `rect` / `px` / `tex` / `alpha` / `fx` / `glErr` | 同 TASK-A §4 既有契约（台账命中 / 实绘矩形 / 采样色 / 纹理 / 透明度 / 效果数 / GPU 错误）。**`rect` 与 `px` 统一为 y-down（顶左原点，画布像素 ×3 到设计坐标），与 `layers[].origin` 同空间**（P-64-MEDIA 轮修：旧实现把 GL 底左窗口 y 当 y-down 用 → 四边形层 `rect` 成了 `H − y`、`px` 采样点也被镜像，而蒙皮层是真实 y，同一份上报两种口径；现在用 `layer.origin` 当锚自动定符号，quad/mesh 两种矩阵约定都自洽） |
| `layerHealth[].skipReason` | `invisible` / `container` / `ln-hidden` / mesh 跳过原因（既有契约，parity-check 消费） |
| `layerHealthSummary` | `{total, drawn, invisible, skipped, missing}`：`invisible` = 未画且不可见；`skipped` = 可见但带 `skipReason`（容器/mesh 跳过等）；`missing` = **可见、非容器、有纹理或尺寸、却从未进台账**（= 用户说的"该渲染却没渲染"） |
| `missingLayers[]` | `{i, name}`（`i` = `scene.layers` 索引，最多 30 条）—— 下次真机刷新后可直接点名"哪些层该出现却消失了" |

**判据镜像**：`visibleBy` 的 `uiRe` / `N5:*` 两桶用 bundle 里**同一份谓词**（`core/we-scene-bundle.js:2004` 的 `uiRe`、
`:2006-2011` 的 `catRe`+`catOn`）——demo 侧抄一份字面量，`props-panel-test.mjs` T19c **逐字比对两处**，
bundle 一改测试立刻红，不会悄悄漂移。

> **参照来源许可声明**：本文档引用的 `wer-ref/` 是**第三方参考实现**
> （`Aromatic05/wallpaper-engine-renderer`，为 `catsout/wallpaper-scene-renderer` 的 fork，
> **GPL-2.0-only**），**不是 Wallpaper Engine 官方代码，也不是"真值源"**。
> 与本项目渲染器（GPL-3.0-or-later）**许可不兼容**：仅用于**行为对照**，
> **不得复制、改写、逐行翻译其代码、注释、常量组织或错误文案**。
> `we-layerd-ref/`（`Aromatic05/we-layerd`）**无任何许可**（保留所有权利），同样只可读行为结论。
> 血缘自查结论见 `docs/WER-REF-LICENSE-AUDIT.md`。

## `isPostProcess` 口径更正（2026-09-18，P-90.10）

本表 `pp` 行过去写"第三处「整屏后期层」本渲染器不解析 `isPostProcess` ⇒ 无落点"，
而 `docs/PATCHES.md` 的 P-90.1 把同一件事写成了**"全树 `grep isPostProcess|postProcess` 0 命中"** ——
后半句**不成立**（审计点 N10）。逐**出现次数**复核（在本仓库根，`grep -v node_modules`）：

| 类别 | 落点 | 出现次数 | 形态 |
|---|---|---|---|
| **源树 · 实代码** | —— | **0** | 本渲染器源码确实**不解析** `isPostProcess` |
| **源树 · 注释** | `core/we-scene-bundle.js:6028`、`core/we-scene-bundle.js:10544` | **2** | 行首即 `//`，纯叙述 |
| **预构建产物** | `demo/assets/renderer-BOSoB05I.js:265`（×2）、`:606`（×1）、`:607`（×4）、`:717`（×1） | **8** | **全是实代码**（vendored 上游 1.3.23 minified 产物） |

**准确口径**：**源树 0 命中实代码（仅 2 处注释）；预构建参考产物 `demo/assets/renderer-BOSoB05I.js` 例外（8 处）。**

**该产物是"活的 vendored 预构建物"、不是死文件**：它由 `demo/renderer/index.html:36` 的
`<script type="module" src="../assets/renderer-BOSoB05I.js">` 加载；该页同时是本地
`:8901/WEwebLoader/renderer/`（①P-127 新站点路径；旧名软链仍在）与 Pages `/demo/renderer/`、`/WEwebLoader/renderer/`（见该文件 `:34-36` 注释），
并进了 Pages 产物（`build-pages.mjs:34` 整目录收 `demo/`、`:145` 再拷一份到 `WEwebLoader/`（①P-127 改名）、
`MUST` 强制要求该页在新旧两个挂载点下都可解析）。**根 `demo.html` 对它零引用**（`grep -c` → 0），
所以它**不是** `demo.html` 的旧路径，而是**上游参考渲染器页面**的入口。
它自 `987d9b3`（2026-09-16 建仓）引入后**再未改动**、仓库内**不可重建** ⇒
**不修改其字节**。完整证据（file:line / 哈希 / 提交）见 `docs/PATCHES.md` 的 P-90.10。
