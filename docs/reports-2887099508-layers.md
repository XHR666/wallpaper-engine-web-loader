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

## 2b. 两档对照与"首帧偏慢"读数（2026-10-05 追加）

同一台机器、同一次会话内切换渲染器档（工具条「渲染器」），画布同尺寸 666×374、同一条包：

| 档位 | 时刻（挂载后） | mean | 采样到的不同色数 | 备注 |
|---|---|---|---|---|
| 本仓 | ≈6s | **0.00** | 1 | 仍是**黑帧**（还没出内容） |
| 本仓 | ≈12s | 166.34 | 203 | 已出内容 |
| 本仓 | ≈20s | 168.78 | 466 | 细节继续增加 |
| 本仓 | ≈30s | 161.71 | 246 | 相位不同 ⇒ 色数随画面变 |
| 上游产物 | 切档后 ≈3s | 179.93 | 267 | 同尺寸、同一条包 |

- **两档都能出内容**（不是"本仓渲染不出来"）；早期快照（≈6–9s）会读到"单一色的灰/黑帧"，那是
  **开场运镜还在 3×→1× 的过程中**（相机贴在背景大图的平坦区域）⇒ 拿单帧截图判"只渲染出背景"会误判。
- **首帧偏慢是可解释的**：`scene.pkg` **119.9 MB**、82 层、效果链 5 段级别；离线归因一次解析约 9s，
  真机解析 + 纹理上传到出内容 ≈10s 量级。若与上游档的首帧时间相比明显更慢，下一步量的是
  "取包/解析/首帧"三段各自耗时（`?diag=1` 的时长行 + `performance` 打点），而不是画面本身。
- 真机叠加读数（`__sceneLayers`）：82 层、可见 **63→64**、`__mpwLayerErrors` **0** —— 与离线归因一致
  （不可见层都是作者 `visible:false` / 属性门控 / 脚本门控，见 §1）。

## 2c. 指针管线实测：脚本**被调到**了，但作者菜单没打开（2026-10-05 追加）

方法：真机点预览画布（设计空间 6080×3420，82 层），位置由 `window.__mpwSceneInfo` 的设计投影换算，
读数取 `window.__mpwCursorDispatch`（P-233 台账）与 `__sceneLayers` 的可见性/origin。

| 动作 | 台账读数 | 层状态变化 |
|---|---|---|
| 点画布角（设计 ≈ (18,16)） | `hits:["ldfk","new background1","Solid"]`；`lastDispatch:{calls:1,errors:0,entries:42}` | 无 |
| 点 `tim logo`（设计 (5571,234)） | `hits` 含 `tim logo`；`{calls:2,errors:0,entries:84}` | 无 |
| **双击** `tim logo`（间隔 200ms，脚本是"500ms 内第二次点击"判定） | `clicks:4`、`{calls:2,errors:0,entries:84}` | **菜单 `中-菜单-浮动` 的 origin 仍是 (-3189,622)、`设置2-穿上内内` 仍在 (-3159,1122)** ⇒ 菜单没打开 |

结论（本次能确定的部分）：
1. **指针管线是通的**：命中测试、owner 映射、脚本派发都成功（`calls ≥ 1`、`errors=0`、`entries` 42/84）；
2. **分歧在脚本宿主语义里**，不在指针层：`tim logo` 的 `cursorClick` 是"点击计数 + 500ms 窗口"的判定，
   它内部还读 `shared[...]` 计数与 `thisScene.getLayer(...).visible`（去混淆后的分支），
   本次两支都没落到"移动菜单"的那条 ⇒ 需要下一步把 `thisScene.getLayer/getEffect` 的调用序列打成读数，
   与 WE 的期望序列逐条对比（这是脚本宿主保真度问题，独立于本包的层数据）。
3. 顺带修掉一个真机可见缺陷（P-228i）：`dispatchCursor` 在**空命中**时读循环体内的 `st` ⇒
   每点一次空白抛一次 `ReferenceError: st is not defined`，且 `lastDispatch` 恒 `null`；现已改成都写台账。

## 2d. 菜单脚本的**门控到底是什么**（2026-10-05 追加，去混淆读数）

把 `tim logo`（id 500）脚本里的 `update()`/`mimi()` 与 `cursorClick` 逐分支读出来（脚本是 `_0x…` 混淆，
但字符串字面量与数值常量可读），门控形态是：

- `mimi()`：连续若干条**计数门** —— `if (shared[<key>] != 0x2ae /*686*/) { …; thisLayer.visible = false; return }`、
  `!= 0x364 /*868*/`、`!= 0x29a /*666*/`，再加 `thisScene.getLayerId(thisLayer) != 0x4e /*78*/` 与
  `thisLayer.origin.x != 0x15c3 /*5571*/`；任一不满足 ⇒ 自身隐藏 + 提前 return。
- `cursorClick()`：`count++`；偶数次且与上一次间隔 **≤500ms**（`doubleClickFrameTime = 0x1f4`）才走"切换
  `健康壁纸` 可见性"那条，否则把 `firstClickTime` 重置并 `count--`。
- **属性门**：`project.json` 里 `timlogohide` = **bool，默认 `True`，文案「显示tim菜单（show tim menu）」**；
  `右-菜单-底色`(489)/`中-菜单-浮动`(503) 带 `{user:newproperty1}`（菜单背景色）。
- 菜单层在 scene.json 里的静态位置就是**屏幕外**（`中-菜单-浮动` origin (-3189,622)、`设置2-穿上内内` (-3159,1122)）
  ⇒ 它们上屏必须靠脚本/属性路径把它移回来，而不是"默认就该在屏幕上"。

**推理链（可复核）**：指针链路已验通（`calls ≥ 1`、`errors = 0`，§2c）⇒ 脚本确实在跑；脚本的内部计数门
（686/868/666/78）由**别的脚本/交互**填 `shared`；本机这次没有任何一条把 `shared` 填到门槛值 ⇒
菜单停在屏幕外、`pussy`/`panci cover up` 也就不会因为"设置2"的点击而翻转。

**已做的最小实验（2026-10-05，真机读数）**：宿主把脚本缓存发布成 `window.__mpwScriptCache`，而它的
`.shared` 就是**跨脚本共享的那本账**（`demo.html:5063/5074`）。挂载后与点击后各 dump 一次：

```
shared = { kkyy: 686, yykk: 868, eee: 666, mus: '枫桥雨' }      // 挂载后
shared = { kkyy: 686, yykk: 868, eee: 666, mus: '枫桥雨' }      // 双击 tim logo + 点菜单底色/菜单层之后
```

⇒ **三条计数门（0x2ae=686 / 0x364=868 / 0x29a=666）本来就是满足的**（值就写在那里，且点子后没变），
`tim logo` 的 `origin.x` 也等于 0x15c3=5571（§2c 读数）。所以"菜单不打开"**不是**计数门的问题，
剩下的只可能是 `mimi()` 末尾那两条：`thisScene.<某方法>(thisLayer) != 0x4e /*78*/` 与
`thisLayer.<某属性> != '<字符串>'`（脚本里那两条的比较对象都在混淆字符串里，本轮无法逐字解码）。

**再往下的两条硬读数（2026-10-05 追加）**：

- 第四条门（`thisScene.<方法>(thisLayer) != 0x4e /*78*/`）**很可能是满足的**：
  `tim logo` 在 `scene.json.objects` 里就是 **index 78**（0-based，实测 `objects[78].id = 500`）；
  而宿主的 `getLayerIndex()`（`elysia/scene-scripts.js:1137-1151`）**专门为 `thisLayer` 留了
  `hooks.ownerLayerRef()/ownerObj()` 这条缝**（源码注释里写明语料就是传 `thisLayer` 的）⇒ 解析得出 78。
  要 100% 确认只需读它的诊断计数（`SCENE_SCRIPT_API_DIAG.getLayerIndex / getLayerIndexUnresolved`）。
- 第五条门里的字符串常量 `'sitFK'` **在整个 scene.json 里只出现在 object 78（`tim logo`）自己的脚本正文里**
  （全库 grep：仅此一处）⇒ 它是**脚本的反混淆字符串表里的成员名**（属性/方法名），不是壁纸数据字段
  （对照：`tim logo` 的数据字段只有 alignment/alpha/angles/brightness/color/colorBlendMode/
  copybackground/id/image/ledsource/locktransforms/name/origin/parallaxDepth/perspective/scale/size/solid/visible）。

⇒ **结论**：五条门里三条（686/868/666）已确证满足、一条（78）结构上满足、**只剩一条**用的是反混淆成员名
（`sitFK` 一类），必须靠"记录脚本宿主上未知成员的访问"来定位 —— 也就是下一步的只读探针。

**下一步（更精确、仍然独立）**：给脚本宿主加一条**只读取证**：把 `mimi()` 里那两类调用的实际返回值
（层 id / 层属性）打出来（例如在 `thisScene` 门面上加一个 `__mpwScriptProbe` 记录最近 N 次未知成员的
`get` 与调用结果），就能定位是"宿主缺这个方法"还是"属性值不同"。这属于**脚本宿主保真度**的取证，
不动渲染语义。

**下一步最小实验（明确、独立）**：在真机上把 `scriptShared`（宿主 `demo.html:5063` 的 `const scriptShared = {}`）
在一个挂载周期内**打成读数**（点几次菜单/按钮后 dump 键与值），与上面四个门槛值逐条对比 ⇒ 判定是
"某个脚本没被调到 / 被调到了但写的是别的键 / 我们缺某条 API（`getLayerId` 一类）"，再决定改宿主还是记边界。

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
