# COPYING-RULES —— 许可单向流动规则、借鉴台账与协议边界

> **①(2026-09-16 随仓库分发)** 本文件是**随本仓库公开分发**的副本。
> 原文件在工作区根的 `docs/COPYING-RULES.md`（多条线共同维护）；公开读者与发布产物只能看到这一份，
> 因此**本仓库内的所有引用都指向 `docs/COPYING-RULES.md`**。
> 若两份不一致，**以工作区根那份为准**，并把差异同步回本文件。

> 适用仓库：`dsh-mpkg-wallpaper`（DSH 插件，**MIT**）与 `we-scene-demo`（浏览器端 WE 场景渲染器，**GPL-3.0-or-later**）。
> 本文是工程规则，**不是法律意见**；出现疑问时以各仓库 `LICENSE` 全文与原始上游许可为准，必要时咨询律师。
> 落地记录：`we-scene-demo/PATCHES.md` P-89（2026-09-16）；事实依据：`LICENSE-COMPAT-REVIEW.md`、`PLUGIN-POLLUTION-AUDIT.md`。

---

## 1. 现状（2026-09-16 起）

| 仓库 | 许可 | 依据文件 |
|---|---|---|
| `dsh-mpkg-wallpaper`（插件，DSH 宿主侧） | **MIT**（保持不变） | `dsh-mpkg-wallpaper/LICENSE` 首行 `MIT License`；`package.json` `"license": "MIT"` |
| `we-scene-demo`（渲染器） | **GPL-3.0-or-later** | `we-scene-demo/LICENSE` = GNU GPL v3 条款原文（35,147 字节，逐字节未改）+ 末尾版权声明与 "either version 3 … or (at your option) any later version" |

**依赖方向是既成事实**：渲染器 import 插件的包解析器（`server/we-scene-demo-server.mjs` 等 12 个 `.mjs`、34 处引用
`parsePkg`/`readPkgEntry`）。因此渲染器分发时**必须携带插件的 MIT 声明**（`THIRD-PARTY.md` §7）。

---

## 2. 单向流动规则（硬规则）

```
  dsh-mpkg-wallpaper (MIT)  ──✅ 允许──▶  we-scene-demo (GPL-3.0-or-later)
  we-scene-demo (GPL)       ──❌ 禁止──▶  dsh-mpkg-wallpaper (MIT)
  任何第三方 GPL-3.0 代码    ──⚠️ 只允许──▶ we-scene-demo，且必须登记台账（§4）
```

2.1 **MIT → GPL ✅**：MIT 代码可以进 GPL 项目；进入后该副本按 GPL 分发，但**原 MIT 声明必须保留**
（渲染器的 `THIRD-PARTY.md`、`LICENSE` 附近的第三方清单就是为此存在）。

2.2 **GPL → MIT ❌**：GPL 代码**不得**进入插件（不得复制、改写、逐行翻译、粘贴注释/常量顺序）。
判定不看"改了变量名没有"，看**表达是否同源**：判定顺序、位掩码、错误文案、注释文字、
常量组织方式、数据结构形态同时对上 = 同源。

2.3 **第三方 GPL-3.0 → 渲染器**：只有 GPL-3.0（含 `-only`/`-or-later`）代码允许进渲染器；
**GPL-2.0-only 不可借**（与 GPL-3.0 不兼容）。据 `LICENSE-COMPAT-REVIEW.md`：

| 上游 | 许可 | 能否借进渲染器 |
|---|---|---|
| `linux-wallpaperengine` | GPL-3.0-only | ✅ 可借（须台账 + 保留声明） |
| `AnisPaper` | GPL-3.0 | ✅ 可借（注意其 only/or-later 表述冲突，未定项） |
| `catsout/wallpaper-scene-renderer` | GPL-2.0-only | ❌ 不可借 |
| `Aromatic05/wallpaper-engine-renderer`（本机 `wer-ref/`） | **GPL-2.0-only** | ❌ **不可借**（与 GPL-3.0 双向不兼容）。**仅行为对照 / 洁净室**：可读其行为结论，**严禁复制代码、注释、常量组织或错误文案**；**不得进入任何发布产物**。本机副本 = `wer-ref/`（仓库外，从未被 import / readFile） |
| `Aromatic05/we-layerd`（本机 `we-layerd-ref/`） | ⚠ **无许可**（上游 `/license` = HTTP 404；本机 `LICENSE*`/`COPYING*` = 0 个）⇒ **保留所有权利** | ❌ **不可借**（比 GPL 更严）。**仅行为对照 / 洁净室**：只可读行为结论，**严禁复制代码**；**不得进入任何发布产物**。本机副本 = `we-layerd-ref/` |
| `waywallen/open-wallpaper-engine` | GPL-2.0-only | ❌ 不可借 |
| `waywallen/waywallen` | MIT | ✅ 可借（按 MIT 署名；若进渲染器同样登记） |
| `oneincase/webwallgl` | MIT | ✅ 可借（**P-90 已借**：`FXAA_FRAG` 一个 shader，见 §4 台账 #6 与 `THIRD-PARTY.md` §6；**P-93 已借**：转译器两个文件**逐字节 vendored** 到 `we-scene-demo/vendor/hlsl2glsl/`，见 §4 台账 #8 与 `THIRD-PARTY.md` §9；其余仍只作研读对照） |
| `elysia395/dsh-wallpaper-engine` | MIT | ✅ 已借（`elysia/**`、`core/attach-transform.mjs`，见 `THIRD-PARTY.md` §1） |

2.4 **工作流（用户拍板）**：以后**先改 MIT 的插件，GPL 的渲染器再借用**。反向（先在渲染器写完再
"搬回"插件）一律禁止——这正是 2026-09-16 洁净室重写要修掉的历史问题。

---

## 3. 协议边界规则（插件侧）

3.1 插件**不得** import、内嵌、转译渲染器的任何 GPL 代码；渲染器是 GPL 侧，插件是 MIT 侧。

3.2 两侧只能走**进程 / HTTP 协议**交互（例：插件宿主路由 `/raw`（Range/206）、
`/custom-scene-audio`、`/custom-scene-video-check`）。协议本身（路由名、字段名、JSON 形状）
不受版权保护，可以自由对齐——但**实现**必须各写各的。

3.3 跨仓测试也不得"切片执行"对方文件：插件测试**不得**读取 / `new Function()` 执行渲染器的
`demo.html` 区块当基准（旧的 `tools/audio-scan-test.mjs` 就是这么做的，已在 P-89 删除 ~40 行）。
需要基准时：**写规格 → 按规格字面量在插件测试内自建期望值**。

3.4 插件仓库**不得**对渲染器仓库产生硬路径依赖（`../we-scene-demo/**`）；反之亦然（渲染器
可以 import 插件的发布产物，但不应依赖插件的开发机路径）。

---

## 4. 借鉴台账（每引入一处第三方代码必须登记）

格式（一行一条，必须六列齐全）：

| # | 来源仓库 | 文件（上游路径） | commit / tag | SPDX | 引入日期 | 谁引入 | 进哪个仓库 | 处置 |
|---|---|---|---|---|---|---|---|---|
| 1 | `elysia395/dsh-wallpaper-engine` | `lib/we-renderer/**`、`lib/*.js` 四个函数 | PR #47（merged 2026-08-25） | MIT | 2026-08 | 渲染器作者 YV3507 | we-scene-demo | 已署名（`THIRD-PARTY.md` §1 + `elysia/LICENSE`） |
| 2 | `@shaderfrog/glsl-parser` 7.0.1 | 整包（vendored） | 7.0.1 | ISC | 2026-08 | 同上 | we-scene-demo | 已补 `elysia/vendor/@shaderfrog/glsl-parser/LICENSE` |
| 3 | 字体 7 个文件（Blackout/monofur/Noto/RobotoMono/Segment7/Twemoji） | `assets/fonts/**` | 见 `THIRD-PARTY.md` §4.1 逐文件 URL+sha256 | OFL-1.1 / Apache-2.0 / CC-BY-4.0 | 2026-09-15 | 渲染器侧（P-86） | we-scene-demo | 已逐文件署名 + 许可全文随仓 |
| 4 | 渲染器 `demo.html` `MPW-AUDIO-PANEL` 区块（P-57，2026-09-14，当时渲染器为 MIT） | 音轨判定/收集（约 210 行同源改写） | 未提交工作区（插件侧从未提交） | MIT（当时） | 2026-09-15 | 插件侧 | **曾被改写进插件（违反 §2.4 方向）** | **2026-09-16 洁净室重写替换**（`docs/AUDIO-TRACK-SPEC.md`；见 `dsh-mpkg-wallpaper/THIRD-PARTY.md` §1） |
| 5 | `oneincase/webwallgl` | 仅研读对照（`vendor-ref/webwallgl` 在仓库外） | — | MIT | 2026-09 | — | 未分发 | 未 vendored；若引入需升级为正式条目 |
| 6 | `oneincase/webwallgl` | `renderer/vendor/we-scene/render/renderer-glsl.js` 的 `FXAA_FRAG`（上游 452–489 行） | `fdfc578a577d0e680a9cfe2cf2e3e825d3cd2372`（1.3.23，2026-09-15） | MIT | 2026-09-16 | 渲染器侧（P-90） | we-scene-demo | **已署名**：`THIRD-PARTY.md` §6 升级为完整条目（含 MIT 全文 + 逐文件表 + 字节级核对结论「38/38 行 GLSL 无差异」）→ 落点是 `core/we-scene-bundle.js` 的 `FXAA_FS` 常量。**仅此一个 shader**；`quality.ts` **未**复制（只对齐档位语义，实现自写） |
| 7 | `oneincase/webwallgl` | `renderer/src/web-shim.js`、`renderer/src/web.ts`、`renderer/src/web-rewrite.ts`（**仅研读 API 名单与语义**） | `b61e8910ae0a176288aed99ce9a93a13ea07df57` | MIT | 2026-09-16 | 插件侧（缺口 I 项：web 类壁纸） | **dsh-mpkg-wallpaper（MIT）** | **仅参考、未复制代码**（无 vendored 文件、无逐行翻译）：`lib/web-wallpaper.js` 的 WE API 名单与语义按该项目对照，实现（属性时序、URL 改写、postMessage 控制协议、错误边界）为本仓库自写；差异清单 `dsh-mpkg-wallpaper/docs/WEB-WALLPAPER.md` §10，机器断言 `tools/web-wallpaper-test.mjs` D4/D5（含"参考未 vendored"与 API 名单一致性） |
| 10 | `oneincase/webwallgl` | `renderer/src/web.ts` 的 `packWebAudioArray` / `shapeWebAudioBand` / `WEB_SIM_AUDIO_*`（**仅对齐行为契约**：128 元频段数组=左 0..63+右 64..127、0..1 钳位、γ 对比扩展曲线、"频谱要尖"的观感） | `b61e8910ae0a176288aed99ce9a93a13ea07df57`（1.3.16，2026-09-15） | MIT | 2026-09-16 | 渲染器侧（P-103） | we-scene-demo | **规格先行**：`docs/AUDIO-BAND-SPEC.md`（只写公开契约）→ 按规格新写 `core/audio-band-array.mjs`（命名/打包形态/常量覆盖方式/真实源口径/模拟源状态模型/新增诊断均不同，差异清单见规格 §5）与 `tests/audio-band-array-test.mjs`（35 断言）。**未复制代码**；纯函数模拟源（无内部状态、无 dt）与 `bandStats` 诊断为本实现独有；**尚未接线**（渲染器目前没有实时频谱源，见规格 §6） |
| 9 | `oneincase/webwallgl` | `renderer/src/web.ts` 的 `webPointerToClient` / `webCoverViewport` / `measureWebLetterbox`（**仅对齐行为契约**：u/v → 帧内 client 像素、覆盖式视口取内容比例并居中裁切） | `b61e8910ae0a176288aed99ce9a93a13ea07df57`（1.3.16，2026-09-15） | MIT | 2026-09-16 | 渲染器侧（P-102） | we-scene-demo | **规格先行**：`docs/WEB-FRAME-GEOMETRY-SPEC.md`（只写公开契约与算法事实）→ 按规格新写 `core/web-frame-geometry.mjs`（命名/参数形态/三态适配/常量组织/回退开关均不同，差异清单见规格 §6）与 `tests/web-frame-geometry-test.mjs`（43 断言）。**未复制代码**（无 vendored、无逐行翻译）；回退开关 `?frame=legacy`（登记在 `docs/README-DIAGNOSTICS.md` 主表） |
| 8 | `oneincase/webwallgl` | `renderer/vendor/we-scene/render/hlsl2glsl.js`（blob `f5725e92…`）、`renderer/vendor/we-scene/render/hlsl-preprocessor.js`（blob `dd9dba1d…`） | `fdfc578a577d0e680a9cfe2cf2e3e825d3cd2372`（1.3.23，2026-09-15） | MIT | 2026-09-16 | 渲染器侧（P-93） | we-scene-demo | **已署名**：`THIRD-PARTY.md` §9（含 MIT 全文 + 逐文件 blob/sha256 表 + "哪些**没有** vendored"边界表）；落点 `vendor/hlsl2glsl/`（**逐字节**副本，`git diff origin/main -- <两路径>` 为空，含上游 `LICENSE`）。用途 = 覆盖率门禁 `hlsl2glsl-coverage-test.mjs`（把 98.2% 变成会变红的断言）；**渲染器着色器路径尚未接线** |

新增条目要求：**commit/tag 必填**（拿不到就写"未提交/工作区"并说明）、**SPDX 必填**、
**日期与引入人必填**；进渲染器的 GPL-3.0 条目还要在 `THIRD-PARTY.md` 附许可全文与文件清单。

---

## 5. 洁净室（clean-room）重写流程

当某段代码被判定同源而必须保住 MIT 侧时，按以下顺序做（P-89 的实际做法）：

1. 写**规格文档**：只写公开格式事实与该模块的对外契约（输入/输出/不变量/边界），
   放进 MIT 仓库（例 `dsh-mpkg-wallpaper/docs/AUDIO-TRACK-SPEC.md`）。
2. **只依据规格**重新实现；旧段直接删除（不保留"注释掉的老代码"）。
3. 实现必须与原版在这些维度上**可证明不同**：① 命名 ② 分支/判定顺序 ③ 常量组织方式
   ④ 错误文案与注释 ⑤ 边界处理。差异清单记入 `THIRD-PARTY.md`。
4. 测试**不得**依赖对方仓库；改为对规格表格的独立断言 + 自造夹具（覆盖判定表、收集去重、
   边界：无/多音轨、同名不同目录、损坏头）。
5. 行为差异必须写明（例：`0xFFF1` ADTS 由 `audio/mpeg` 修正为 `audio/aac`）。

---

## 6. `tools/*.py` 删除记录（P-89，2026-09-16）

`dsh-mpkg-wallpaper/tools/` 下 4 个 Python 工具**已删除**，原因是**无法排除与 GPL 项目存在代码级血缘**
（`unmpkg.py` 自述 "format from aqnya/unmpkg"（GPL-3.0）；`tex2png.py` 自述参考 `notscuffed/repkg`（GPL））：

| 删除的文件 | 行数 | md5（删前） | 删除理由 |
|---|---|---|---|
| `tools/unmpkg.py` | 38 | `ed665b75bfd6…` | 自述格式来源 `aqnya/unmpkg`（GPL-3.0），无法排除代码级血缘 |
| `tools/tex2png.py` | 267 | `ac85955599c3…` | 自述参考 `notscuffed/repkg`（GPL），无法排除代码级血缘 |
| `tools/mdl_explorer.py` | 75 | `418db8e95573…` | 与上两者同一批研究脚本，同一标准处理（无法自证血缘） |
| `tools/xref.py` | 94 | `b4fffcf46ef1…` | 依赖 capstone 反汇编 wallpaper64.exe，研究脚本，同一标准处理 |

**分发口径**：`package.json` 的 `files` 白名单不含 `tools/`，所以它们**不进 npm 包**；
但本仓库是**公开 git 仓库**，`tools/` 仍随仓库分发 ⇒ 按"分发"处理，血缘存疑即删除。
**未删**：`tools/check.sh`（8 步门禁）与 `tools/*.mjs`（测试/基准）——它们是插件质量门禁的基础，
且都是本仓库自写、无外部血缘。

---

## 7. CLA（贡献者许可协议）说明

7.1 现状：**未引入 CLA**。两仓库按各自 `LICENSE` 接收贡献（插件 MIT；渲染器 GPL-3.0-or-later）——
以 GPL/MIT 接收的贡献**不能**直接用于闭源授权。

7.2 若将来要对插件做**闭源商业授权**（双许可），需要：
- 引入 **CLA**（贡献者把版权许可授予维护者，允许在其它许可下再分发），并在 `CONTRIBUTING` 中显著提示；
- 逐个追溯**已合并**贡献者的同意（GitHub 提交历史 + 联系方式）；
- CLA 只对**签署之后**的贡献生效，历史贡献仍需单独取得授权。

7.3 在此之前，任何"把插件闭源/换许可"的动作都**不得**进行（`LICENSE` 保持 MIT）。

---

## 8. 发布前自检（机器闸门）

- 渲染器：`node we-scene-demo/publish-check.mjs` 必须 **0 阻塞**，其中许可一致性四条：
  ① `LICENSE` 与 `package.json.license`（若存在）一致且为 GPL-3.0-or-later；
  ② 发布物不含插件的 GPL 违规内容（插件包里不得出现 GPL 文本）；
  ③ `COPYING-RULES.md` 与 `THIRD-PARTY.md` 在位；
  ④ vendored `webwallgl` 的 MIT 声明与字体许可文件在位（未 vendored 时按"不适用"记录）。
- 插件：`cd dsh-mpkg-wallpaper && bash tools/check.sh` 必须 8 步全绿；`LICENSE` 仍为 MIT。
- 任何"借来的"代码：先在本文件 §4 台账登记，再合入。

> **参照来源许可声明**：本文档引用的 `wer-ref/` 是**第三方参考实现**
> （`Aromatic05/wallpaper-engine-renderer`，为 `catsout/wallpaper-scene-renderer` 的 fork，
> **GPL-2.0-only**），**不是 Wallpaper Engine 官方代码，也不是"真值源"**。
> 与本项目渲染器（GPL-3.0-or-later）**许可不兼容**：仅用于**行为对照**，
> **不得复制、改写、逐行翻译其代码、注释、常量组织或错误文案**。
> `we-layerd-ref/`（`Aromatic05/we-layerd`）**无任何许可**（保留所有权利），同样只可读行为结论。
> 血缘自查结论见 `docs/WER-REF-LICENSE-AUDIT.md`。
