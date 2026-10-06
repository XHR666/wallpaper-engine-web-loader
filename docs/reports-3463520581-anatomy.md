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
