# 2887099508：图层触发条件与四条渲染投诉的取证（2026-10-05）

> 口径：本文只写**读数与可复核的事实**。工具：离线层归因 `tests/layer-attribution.mjs`（真 parseScene + mock GL +
> 真 renderScene，整帧无 `__lnHidden`）、语料结构扫描（`core/we-scene-bundle.js` 的 `parsePkg`/`getEntry`）、
> 真机台账读数（8902 预览 iframe 的 `__sceneLayers`）。语料：`allwallpaper/0923/2887099508`。

## 1. 图层触发条件总表（回答「哪些层默认加载 / 哪些要条件」）

包内 82 层、232 条目。**触发面共四类**，逐层明细落 `/tmp/triggers-2887099508.json`（本机临时读数，不入库）：

| 类别 | 层数 | 机制 | 本仓现状 |
|---|---|---|---|
| 默认可见 | 多数 | `visible` 缺省（= 可见） | 照常绘制 |
| **作者声明默认隐藏（`visible:false`）** | 12 | 只在作者脚本/属性把它打开后才出现 | 正确隐藏（与数据一致） |
| **用户属性绑定**（`{user:…}`） | 16 | 属性值驱动可见性/颜色/音量等 | 已支持（P-234 起含场景级） |
| **作者脚本**（`visible`/属性里内联 `{script:…}`，导出 `cursorClick/cursorEnter/cursorLeave/update`） | 11 | 鼠标进入/离开/点击某层、每帧 `update` | 脚本宿主在跑；P-233 起 `cursorClick/Down/Up` 已端到端派发 |
| 粒子层 | 4 | 粒子系统（`particles/presets/*`） | 见 §3 |

**16 个属性绑定层（原样读数）**：`wind.mp3`→`windsound`；`BBB`/`CCC`/`XR`/`HF`/`桥`→`bgm`/`defaultbgm`；
`sound line`→`aucolor,audioline`；`ey00000`→`crstarefront`；三个 `Clock`→`timecolor,time`；
`Sakura`→`flower`；`右-菜单-底色`/`中-菜单-浮动`→`newproperty1`；`后处理层`→`volumetriclight`；
`tim logo`→`timlogohide`（**同时**带脚本）。

**脚本层的动作（去混淆后的语义，逐条可复核）**：

- `设置2-穿上内内`：`cursorClick` 里 `getLayer('panci cover up').visible = true` + `getLayer('pussy').visible = false`；
  `cursorEnter/Leave` 切换 `中-菜单-浮动` 的某个效果的 `visible`。
- `设置1-返回` / `设置3-我要涩涩` / `安全模式`：`cursorClick`（含双击判定 `doubleClickFrameTime = 500ms`）与每帧
  `update()` 一起改 `阴影-设置1`、`中-菜单-浮动`、`健康壁纸`、`pussy`、`panci cover up` 等层的 `visible`。
- `tim logo`：`update()` 依 `shared` 计数与层坐标（`thisLayer.origin.x != 0x15c3`）决定 `健康壁纸`/自身可见性，
  `cursorClick` 是双击计数器（`count % 2` + `Date.now()-firstClickTime > 500`）。

⇒ **「有些层要点击/悬浮才会出现」是真的，而且触发点就是这些菜单层**；`pussy` 的可见性由脚本写，不由静态数据决定。

## 2. 四条渲染投诉的取证与状态

| # | 投诉 | 读数 | 判定 |
|---|---|---|---|
| 1 | 播放速度较快（像倍速） | 本仓渲染器的场景时钟缺省 = `(now - last0)/1000`（墙钟 1:1）；`MPW_SCENE_CLOCK.rate` 只有被 `setPlaybackRate` 碰过才不是 1。P-232 修的是**相机 3× 定格**（`general.zoom` 被脚本 round-trip 写穿），与播放倍率是两件事 | **待真机 A/B**：同一段墙钟内对比本仓与上游产物档的骨骼/粒子推进（离线无脚本相位可对） |
| 2 | 层 21 `pussy` 先出现后消失 | 离线：`visible:false`（作者声明隐藏）+ `fx=2 effects/shake`；真机 `__sceneLayers` 两个时刻都是 `visible:false` | **机制已定位为脚本驱动**（`设置2-穿上内内` 的 `cursorClick` 会写它）：需要「点一次设置菜单」的 A/B 才能判"我们的脚本宿主是否按 WE 的时序写」——见 §4 最小实验 |
| 3 | 26/27 层 `Light shafts 0` 渲染有问题 | 两层都是**粒子层**（id 243/137），预设都在包内（`particles/presets/light_shafts_0.json`、`particles/workshop/2628698137/presets/light_shafts_0.json`）；`instanceoverride` 显式给 `alpha 0.24/0.35、rate 0.79、speed 0.47/0.65、size 0.71、lifetime 1.14`。**新增读数**：① 离线 CPU 模拟按 t=1/3/6/12/20 五点采样 ⇒ 前四点两层**存活 0 粒**（`particle-idle`），t=20 时 #26 `bind=particle`（出粒并上屏）、#25 仍 `not-drawn`；② 真机逐层隔离（`?ln=25`/`?ln=26`，同帧统计画布像素）：正常帧 mean 168.35，`ln=25` 在 t≈14s/26s 分别 181.0/178.2，`ln=26` 分别 178.0/**193.9** ⇒ 两层**都真的在画**，且 #26 随时间变亮（粒子在累积） | **判定：不是"没画"，是"发射率极低"** —— `rate 0.79/s × lifetime 1.14s ⇒ 期望存活 ≈0.9 粒`，所以大部分时刻只有 0–1 粒、光束很淡；与"渲染错了"的观感差别需要一次**上游产物档对照**（同 t 同层）才能定案，见 §4-2 |
| 4 | 叠层失效（单层能看、叠起来看不见） | 离线归因整帧无 `__lnHidden` 时，`bind=rtcopy` 的层有 6 个（`支持 Tim`/`记事本`/`中-菜单-浮动` 等，fx>0 + copybackground）；P-230/P-231 已把「无 fx 的 copybg 不换入」「composelayer+fx 才是效果载体」分开 | **待复现**：需要用户指明"哪一层 + 与哪一层叠加"——离线只能对静态帧，叠层顺序/混合模式需要真机逐步开关 |

## 3. 已知与本包相关的既有修复（回归背景）

- **P-229**：`demo.html` 台账 composite 条目全灭（`mpwLedgerYDown` 块级作用域）——量法已恢复；
- **P-230**：`copybackground` 只在**有效果链**时换入（官方 helper 语义）；
- **P-231**：`composelayer` + fx>0 视作效果载体不再被容器跳层吞掉（本包 154 个受益面之一）；
- **P-232**：作者脚本 `setCameraTransforms(getCameraTransforms())` 盲 round-trip 把 `general.zoom` 动画写穿成常数
  ⇒ 全场景 3× 定格（本包就是探针包）——已修，真机宽景回归。

## 4. 下一步最小实验（各一条命令/一次探针）

1. **pussy 时序**：真机点一次「设置2-穿上内内」层（用 `?ln=` 先定位其屏幕坐标），前后各读 `__sceneLayers` 里
   `pussy`/`panci cover up` 的 `visible`，与 WE 语义（click ⇒ 前者隐藏、后者显示）对账；
2. **light shafts（已完成一半）**：五点采样 + 逐层隔离像素统计见上表 ⇒ 机制是"低发射率 + 稀疏存活"，不是不画。
   剩下的一步 = **上游产物档同 t 对照**（本仓 vs 上游同帧同层隔离像素/形态），若上游明显更亮/更密 ⇒ 再查
   `instanceoverride` 的 `rate/count` 语义（乘法 vs 绝对值）与发射器 `env` 路径；
3. **倍速**：同一段墙钟内，本仓档与上游产物档各取 3 张帧的 `unique colors` 与骨骼层实绘矩形，比较推进量；
4. **叠层**：让用户给"单层可显、叠加不可显"的具体层对，再用 `?ln=` 逐层开关复现。

## 5. 结论（可直接回给用户的短版）

- 「哪些层要条件」已查清：**16 层吃用户属性、11 层吃作者脚本（鼠标进入/离开/点击 + 双击判定 + 每帧 update）、
  4 层是粒子、12 层作者默认隐藏**；点击触发点就是右/中菜单那几层（`设置1-返回`/`设置2-穿上内内`/`设置3-我要涩涩`/`安全模式`/`tim logo`）。
- `pussy` 是先出现后消失的**脚本写可见性**层；`Light shafts 0` 两层**确实在画**，只是发射率极低
  （`rate 0.79 × lifetime 1.14 ⇒ 期望存活 ≈0.9 粒`；真机隔离统计 mean 168→181/194 证明有内容）；
  倍速与 3× 定格是两件事（后者 P-232 已修）；叠层失效需要具体层对才能定位。
