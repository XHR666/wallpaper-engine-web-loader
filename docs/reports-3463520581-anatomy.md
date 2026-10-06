# 3463520581「头发位置整体错」取证（P-240 开工轮）

## 已量到的三种口径（离线，HEAD 0.5.19）

场景：74 层（42 可见），93 张贴图全部上传成功，无脚本异常；`KIRITO PUPPET lil`（id 360）与 id 34 两个 puppet 根，
`hair kirito front/back`、`kirito face/body/arm` 等部件都是 `parent=<puppet>` + `attachment:"Attachment"`。

| 口径 | 结果 |
|---|---|
| ① 原始 `origin`（scene.json） | `hair kirito front` (152.70, 815.30)、`hair kirito back` (203.64, 804.47)、`kirito face` (24.35, 723.65)、**`kirito body` 没有 `origin` 字段** |
| ② 父链合成后（`parseScene`） | face (2603, 294)、hair front (2737, 199)、hair back (2790, 210)、body (2578, 1047) —— **相对关系解剖上自洽**（前/后发都压在脸上、身体在下方） |
| ③ 附件锚点偏移（`buildAttachOffsets`，58 条 / 45ms） | **所有部件都是 `[0.04, −6.97]`（同一个 "Attachment" 锚点）** ⇒ 小量、不可能造成"整体错位" |

⇒ ①②③ 三条都**排除**：位置数据本身没错，"头发整体错位"的高度嫌疑落在**puppet/骨骼蒙皮路径**
（部件是被 puppet 的骨骼/`animationlayers` 驱动的，不是静态贴图）。旁证：加载期有
`[P-152] MDLS bone layout rescued @+89454: declared=7 parsed=7 layout=C variant=name-fronted+slot`
（该 puppet 的骨骼布局是靠"骨名前置"兜底扫出来的）。

## 下一步最小实验（一条命令级别）

1. 真机读 puppet 部件状态：`window.__mpwBones`（骨骼表）与各部件 `l.__skin` / `l.__boneBind`；
   对比 `hair kirito front` 与 `kirito face` 拿到的**骨索引/绑定矩阵**是否一致（若头发绑到别的骨 ⇒ 定位完成）。
2. 逐层隔离要用 **`__lnHidden`**（保留父链）而不是 `?ln=`：本包 `?ln=<任意>` 会让整帧变黑（隔离档在这里不可用，
   实测 `?ln=999` 空帧 mean=0 而基线 mean≈137），原因待查（很可能是隔离档下 puppet 根/蒙皮输入缺失）。
3. 真值对照：上游**桌面 WE** 截图（网页产物档对 puppet 的支持也不同源，只能看"大致相对位置"）。

## 真机看到的现象与机制（第 62 轮，HEAD 0.5.19，`/tmp/kirito-live.png`）

**现象**：整场景渲染出来了（云、草原、远景城、女孩 Asuna 有头发），但**男孩 Kirito 是"光头"** ——
他的 `hair kirito front` / `hair kirito back` 两层没有画在头上（画面里能看到的少量错位发丝落在女孩一侧）。
这正是"人物头发的位置完全错了"。

**机制（本轮量到的链路）**：

| 事实 | 读数 |
|---|---|
| 可见 puppet 部件的蒙皮状态 | `kirito face`(层 55) 有 `__skin={mesh,nb,bindInv,bindRT,animIdx,fps}` + `__skinReady:true`；**`hair kirito front`(57) / `hair kirito back`(56) / `kirito body`(58) 完全没有 skin 字段** |
| 部件模型 | `models/hair kirito front.json` 键 = `autosize, cropoffset, material` ⇒ **没有 `puppet` 键**（数据上确实不是蒙皮层）；`models/puppet - Copy.json` 才有 `puppet` |
| puppet 文件解析 | `models/puppet - Copy_puppet.mdl`（MDLV0023，17 503 B）经 `parseMdl` 得到 **bones=1、anchors=0**（`parseMdatAnchors` 也是 0） |
| 附件偏移 | `buildAttachOffsets` 给所有部件都是 `[0.04, −6.97]`（同一 `"Attachment"` 锚点；锚点表为空 ⇒ 实质等于"没有偏移"） |
| 第二条 puppet（层 63–66） | 同样只有 `kirito face` 有 skin；该组 `visible:false`（另一姿态变体） |

⇒ 结论：**这些"挂在 puppet 上的静态部件"应该跟随父级 puppet 的骨骼/锚点变换（官方语义），而我们把它们当纯静态贴图**，
位置停在 rest pose；同一个 puppet 的 `kirito face` 是蒙皮的、跟着动画走 ⇒ 脸动了、头发没动 ⇒ 光头/错位。
根因落在 **puppet `.mdl` 的骨骼/锚点解析**（本文件解析出 bones=1、anchors=0，明显偏少；同包另有
`[P-152] MDLS bone layout rescued … declared=7 parsed=7` 说明骨架解析本身有已知的脆弱点）。

## 下一步（最小实验，按顺序）

1. 把 `models/puppet - Copy_puppet.mdl`（17 503 B）与"解析正常"的 puppet 逐块对比（`MDLV0023` 头 + 各 chunk），
   确认 bones=1/anchors=0 是**解析缺口**还是文件本身如此；若是缺口 ⇒ 修 `parseMdl`（有判据可加：
   该文件应解析出 ≥7 骨骼 / 命名锚点）。
2. 若文件本身没有锚点 ⇒ 按官方语义补"**被 attach 的静态层跟随父级骨骼变换**"这条链路（当前只有
   `kirito face` 走了蒙皮），判据用本包：Kirito 头部区域应出现黑发（与 `hair kirito front` 的贴图内容相符）。
3. 复验时逐层隔离**必须用 `__lnHidden`**（本包 `?ln=` 会让整帧变黑，已记在上面）。

## 第 63 轮：**该包 65/67 个材质 pass 用的是 `genericimage4`，而本仓 bundle 里 0 处引用** ⇒ 主因方向

| 读数 | 值 |
|---|---|
| 全包材质 pass 的 shader 分布 | **`genericimage4`: 65**、`genericimage2`: 2（共 67） |
| 本仓 `core/we-scene-bundle.js` 里 `genericimage4` 出现次数 | **0**（⇒ 没有专门分支，走的是某个兜底图像路径） |
| 两条头发层的材质 | `materials/hair kirito front.json` / `hair kirito back.json`：`shader: "genericimage4"`、`blending: translucent`、`combos: {}`、贴图**在包内**（`materials/hair kirito *.tex` 都存在；不是缺纹理） |
| 官方 shader 源（本机 WE 安装，可直接读） | `/root/Desktop/DSHarea/wallpaper_engine/assets/shaders/genericimage4.{vert,frag}`（`genericimage{,2,3,4}` 都在同一目录） |

**现象对照**（截图已存）：全画档 Kirito 头上有黑发（隐藏两条 `hair kirito *` 后变光头 ⇒ 这两层确实在画、位置大体在头上）；
但"只留 Kirito 头发"档里除了顶部那块黑发，还出现一个**孤立的小白方块**（≈ 屏 (715,290)）
——正是"不认识的 shader 走了兜底、某些 pass 画成白片/漏采样"的典型症状。

**下一轮第一步**：读官方 `genericimage4.vert/.frag` 与本仓现有图像路径逐条对照（重点：它比 `genericimage2` 多了什么——
顶点动画/`VERTEXCOLOR`/多 pass/`combos`），把 `genericimage4` 接进材质→shader 选择表；
判据：本包"只留 Kirito 头发"档不再出现孤立白方块，且隐藏/显示两条头发层对头部黑发的影响与全画档一致。
