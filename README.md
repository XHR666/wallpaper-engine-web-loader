# WE-Scene Web Renderer（浏览器端 Wallpaper Engine 场景渲染器）

> **已发布 `wallpaper-engine-web-loader@0.1.0`** —— npm：<https://www.npmjs.com/package/wallpaper-engine-web-loader>
> （tarball <https://registry.npmjs.org/wallpaper-engine-web-loader/-/wallpaper-engine-web-loader-0.1.0.tgz>）
> · GitHub：<https://github.com/XHR666/wallpaper-engine-web-loader>（public）
> · 在线 demo：<https://xhr666.github.io/wallpaper-engine-web-loader/>
> · 发布记录（版本 / 文件数 / 体积 / 时间 / 闸门）见 `PATCHES.md` **P-97**。

> **参照来源许可声明**：本文档引用的 `wer-ref/` 是**第三方参考实现**
> （`Aromatic05/wallpaper-engine-renderer`，为 `catsout/wallpaper-scene-renderer` 的 fork，
> **GPL-2.0-only**），**不是 Wallpaper Engine 官方代码，也不是"真值源"**。
> 与本项目渲染器（GPL-3.0-or-later）**许可不兼容**：仅用于**行为对照**，
> **不得复制、改写、逐行翻译其代码、注释、常量组织或错误文案**。
> `we-layerd-ref/`（`Aromatic05/we-layerd`）**无任何许可**（保留所有权利），同样只可读行为结论。
> 血缘自查结论见 `docs/WER-REF-LICENSE-AUDIT.md`。

在浏览器里**实时渲染 Wallpaper Engine 的场景壁纸**（`scene.pkg` / 本项目的 `.mpkg` 容器 / workshop 源目录），
不需要 Wallpaper Engine、不需要 Windows、不需要 GPU 专用驱动 —— 一个本地 Node 静态服务器 + 支持 WebGL2 的浏览器即可。

> 本文件是本仓库的**主 README**（GitHub 首页展示）。面向下载者的详细说明另见 `README-PUBLIC.md`；
> 内部开发/诊断文档见 `RENDERER-ARCHITECTURE.md`、`README-DIAGNOSTICS.md`、`TESTING.md`、`PATCHES.md`；
> **第三方代码与许可的法律文本以 `THIRD-PARTY.md` 为准**，复制/借鉴台账见 `docs/COPYING-RULES.md`。

---


## 1. 快速开始（两条路，任选）

### A. 用自带服务器（推荐，功能最全）
```bash
node we-scene-demo-server.mjs          # 默认监听 0.0.0.0:8899
# 浏览器打开 http://127.0.0.1:8899/
```
自带服务器提供：包/目录读取、`/report` 上报落盘、`/weassist` WE 资产兜底、CORS（供 iframe 嵌入）、
离线 PWA（`manifest.webmanifest` + `sw.js`，**缓存判据明确排除用户壁纸**，见 `pwa-test.mjs`）等。
端口可用环境变量覆盖：`PORT=9000 node we-scene-demo-server.mjs`。
一键脚本：`bash start-demo.sh`；自检：`bash check.sh` / `npm run check`。

首屏：本机有语料就渲染默认包；**没有语料**（本仓库不分发真实壁纸）时页面会明确提示并自动渲染自带的合成样例
（也可直接打开 `http://127.0.0.1:8899/?id=sample-synthetic`）。

### B. 任意静态服务器（只读模式）
```bash
python3 -m http.server 8899            # 或 npx serve -l 8899
# 浏览器打开 http://127.0.0.1:8899/demo.html?id=<包id>   （需要自带包文件时用方案 A）
```
静态模式下渲染器仍可打开，但依赖服务器端点的功能（包代理、`/report`、WE 资产兜底）不可用。

---

## 安装方式（三种，按场景选）

> **位置口径（2026-09-16 目录整理）**：本章**故意不占章节编号** —— 本 README 的章节号被脚注引用
> （§7 及其 §7.1(2) / §7.4(2)），给本章编号会让后续章节整体位移、把那些引用全部指向错处。
> 故编号章节从 §1 直接跳到 §2；结构自查：`grep -n '^## ' README.md`。

### A. npm 安装（把渲染器作为依赖嵌进你自己的站点/app）
```bash
npm i wallpaper-engine-web-loader@0.1.0     # 锁定已发布版本
npm i wallpaper-engine-web-loader           # 或跟随 latest
```
最小用法（**只用真实存在的导出**；下面这段已实测跑通：`parsePkg` 8 个入口、`parseScene` 5 层）：
```js
import fs from 'node:fs'
import { mount, parseScene } from 'wallpaper-engine-web-loader'         // 库入口 = we-scene.mjs
import { parsePkg, getEntry } from 'wallpaper-engine-web-loader/bundle' // 低层解析 = we-scene-bundle.js

const pkg       = parsePkg(new Uint8Array(fs.readFileSync('scene.pkg')))
const sceneJson = JSON.parse(new TextDecoder().decode(getEntry(pkg, 'scene.json')))
const project   = JSON.parse(fs.readFileSync('project.json', 'utf8'))   // 没有属性表就传 null
const scene     = parseScene(sceneJson, project, {})

// 浏览器里挂载（mount 要 requestAnimationFrame；Node 端由宿主注入 opts.raf）
const h = mount('#stage', { scene, textures /* Map<名字, {glTex}>，与 demo.html 同形状 */ })
h.setQuality({ q: 'high', aa: 'fxaa', pp: 'high' })   // 热更新，不用重新挂载
h.dispose()
```
- **适用**：自己已有页面/框架，只想要"画布 + 帧循环 + 帧末后处理链"这一层。
  `mount` 的职责边界**只有**这些；**取包 / 解包 / 贴图上传 / 字体 / 音频 / 上报 / UI 面板**都属宿主侧
  （完整参考实现是 `demo.html` 的 `bootInstance()`，帧序与 `mount` 逐条一致）。
- 其它子路径导出：`wallpaper-engine-web-loader/server`（自带服务器）、`/hlsl2glsl`（vendored MIT 转译器）。

### B. 直接从源码跑（本地/开发推荐）
```bash
git clone https://github.com/XHR666/wallpaper-engine-web-loader.git
cd wallpaper-engine-web-loader
bash start-demo.sh                    # 预检 + 起服务器（默认端口 8899）
bash start-demo.sh --port 9000        # 换端口（等价 PORT=9000；端口被占预检会直接报）
```
浏览器打开 **<http://127.0.0.1:8899/>** —— 自带合成样例直达 `/?id=sample-synthetic`；
逐层调试 `/?ln=1`；诊断页 `/diag.html`。只想预检不起服务：`bash start-demo.sh --check`。
- **适用**：本地开发；要跑门禁（`bash check.sh`）；要"打开即玩"而不配任何东西。
- 这条路**功能最全**：包代理、`/report` 上报落盘、WE 资产兜底、离线 PWA 只有自带服务器提供。
- 自带服务器需要一个包解析器（MIT 插件 `dsh-mpkg-wallpaper` 的 `lib/pkg-extract.js`）：把它与渲染器
  放在同一父目录即可，否则用 `MPW_PKG_EXTRACT=/绝对路径/pkg-extract.js` 指定（`start-demo.sh`
  的预检会把三条修法直接打出来）。
- 真实壁纸请放仓库**外**，用 `MPW_SCENE_ROOT` / `?pkgpath=` / `?pkgurl=` 指过去（见 §2/§3）。

### C. 纯静态 / 离线（只读模式，任意静态服务器）
```bash
git clone --depth 1 https://github.com/XHR666/wallpaper-engine-web-loader.git
cd wallpaper-engine-web-loader
python3 -m http.server 8899           # 或 npx serve -l 8899；任何静态服务器都行
```
也可以只用 `npm pack` 的产物（解开即是可静态托管的目录）：
```bash
npm pack wallpaper-engine-web-loader@0.1.0     # 得到 wallpaper-engine-web-loader-0.1.0.tgz
tar -xzf wallpaper-engine-web-loader-0.1.0.tgz && cd package
python3 -m http.server 8899
```
浏览器打开 **<http://127.0.0.1:8899/demo.html?id=sample-synthetic>**。
- **适用**：没有 Node 环境 / 要丢到 GitHub Pages、对象存储、内网静态站。
- **限制（只读模式的代价）**：没有服务器端点 ⇒ 包代理、`/report` 落盘、WE 资产兜底、目录打包（`/pkgdir`）
  都不可用；只能用**浏览器直接取得到**的包（自带样例，或与页面同源的 `scene.pkg`）。
- 在线版就是这个形态：<https://xhr666.github.io/wallpaper-engine-web-loader/>（构建脚本 `build-pages.mjs`）。
- **PWA 是可选的**：默认关；只有**自带服务器**加 `MPW_PWA=1` 才注入
  （`MPW_PWA=1 bash start-demo.sh`，或单次请求 `?pwa=1`）。静态托管不会自动获得离线能力。

### 环境要求与"装好了没有"的自检
- **Node ≥ 20**（`package.json` 的 `engines.node` = `>=20`；脚本用到 `??`、可选链、顶层 await、`node:` 前缀
  内置模块；**ESM only**，无 CJS 出口）。浏览器侧需要 **WebGL2**（无 GPU 会退回 CPU 路径，明显更慢）。
- 验证安装（在仓库根，均不需要联网）：
```bash
bash check.sh --json        # 期望 {"pass":4,...,"fail":0} —— 4 阶段（docs/publish/diag/全量门禁）全 PASS
bash check.sh --no-gate     # 只跑三项静态闸门（秒级）
node tests/demo-check.mjs   # 在线发布形态自证（落地页 / demo/ / 构建产物）
npm run test:fast           # 全量回归（跳最慢项）
```

---

## 2. 加载一张壁纸

| 方式 | URL | 说明 |
|---|---|---|
| 内置样例 | `?id=sample-synthetic` | 仓库**唯一**自带的场景：程序化生成的合成样例（无第三方素材），见 `samples/` |
| 打开首页 | 无 `?id=` | 本机没有默认语料时页面会**明确提示**并自动改渲染上面的合成样例 |
| 本地包文件 | `?pkgpath=/绝对路径/scene.pkg` | 服务器白名单内的路径（白名单用 `MPW_ALLOW_DIRS` 覆盖，冒号分隔；仓库自带 `samples/` 已在默认白名单里） |
| 远程包 URL | `?pkgurl=https://…/scene.pkg` | 服务器**代理抓取**（绕 CORS） |
| **workshop 源目录** | `?pkgurl=http://127.0.0.1:8899/pkgdir?d=/绝对目录` | 服务器**即时把目录打包成容器**再喂给渲染器；`/pkgdir?scan=1` 可列出可打包目录 |
| 包 id | `?id=<目录名>` | 在 `MPW_SCENE_ROOT` 与 `<repo>/samples` 两档里按目录名匹配；**真实壁纸要你自己提供语料** |

`?ln=<N>` 逐层调试、`?time=`/`?hour=` 固定时段、`?showui` 显示被隐藏的 UI 层等调试开关见 `README-DIAGNOSTICS.md`。

---

## 3. 内置样例（`samples/`）——**本仓库不分发任何真实壁纸**

| 目录 | 内容 |
|---|---|
| `samples/sample-synthetic/` | 合成样例包：`scene.pkg`（≈33KB）+ `project.json`。5 层：渐变背景、组合容器、动画纯色条、随动+缩放循环的圆点、绑定属性的文字标签 |
| `samples/sample-synthetic-src/` | 同一场景的**松散源文件**（`scene.json`、`models/`、`materials/`）。把它打包出来的结果与上面的 `scene.pkg` **逐字节相同** ⇒ 同时是"目录源"夹具 |
| `make-sample.mjs` | 生成器：`node make-sample.mjs`（确定性，同参数同 sha256）；`--prod-verify` 会用生产解析器逐条校验 |

样例**不含任何第三方素材或音频**（纹理全部由脚本程序化生成）。
`samples/wallpapers/` 曾随仓库分发 4 个真实 Steam 工坊壁纸（198MB）——**因版权已整体删除**（记录见 `PATCHES.md` P-87）；
真实壁纸请放在仓库**外**，用 `MPW_SCENE_ROOT` / `?pkgpath=` / `?pkgurl=` 指向你自己的副本（细节见 `samples/README.md`）。

---

## 4. 环境变量（都有默认值，不改即等价于作者本机）

| 变量 | 默认 | 用途 |
|---|---|---|
| `PORT` | `8899` | 监听端口 |
| `MPW_ROOT` | 作者机工作区（公开副本请设成你的仓库父目录） | 其它路径的基准 |
| `MPW_SCENE_ROOT` | 存在的第一个：`$MPW_ROOT/allwallpaper/dd` → `<repo>/samples`；都不存在则是一个**明确不存在**的占位路径（启动日志会写明，`?id=` 一律 404） | `?id=` 的包目录根 |
| `MPW_REPORTS_DIR` | `$MPW_ROOT/reports` | `/report` 上报落盘目录（只保留最新 60 份） |
| `MPW_WE_ASSETS` | 自动探测本机 Steam/WE 安装目录 | WE 官方资产兜底（着色器/粒子预设/材质）；**不随仓库分发**，找不到就跳过 |
| `MPW_ALLOW_DIRS` | 若干本地目录 + `<repo>/samples` | `?pkgpath=`/`/pkgdir` 的路径白名单（冒号分隔） |
| `MPW_PLUGIN_CACHE` / `MPW_SD_ROOT` | 作者机的插件下载缓存 / 备用语料根 | 语料扫描工具的额外根目录 |
| `MPW_PKG_EXTRACT` | 同目录 `pkg-extract.mjs`，否则插件仓库路径 | 包解析器（公开副本请把 `pkg-extract.mjs` 放在服务器同目录） |

---

## 5. 已知限制

- 需要 WebGL2；无 GPU 时会退回 CPU 路径（功能受限、明显更慢）。
- 复杂的蒙皮/粒子/效果链仍在持续完善，问题清单与进展见 `known-issues.json` 与 `PATCHES.md`。
- 音频不会随仓库分发：载入含音频的包时，由页面**在你本地现场解析**播放/导出（详见渲染器顶栏音频面板）。

> **位置口径（2026-09-16 目录整理，随 README 结构调整）**：本声明块按项目所有者要求**逐字不变**搬迁 ——
> 原文位置在标题下方，现挪到「已知限制」之后、「许可」之前（所有者原话："放到已知限制下面、许可上面"）。
> 它**故意不占章节编号**：脚注要引用 §7 的两条例外（`§7.1(2)` / `§7.4(2)`），一旦给本块编号就会把
> 「参考与致谢」挤到 §8 ⇒ 脚注里的 §7 全部失效。故此处保持 §5 → 本块 → §6 的顺序、编号不动。

## 免责声明

> **免责声明**
> 本项目与 Wallpaper Engine 官方**无任何关联**，不包含 Wallpaper Engine 本体、Steam 创意工坊内容或任何受版权保护的壁纸资源。本项目**不分发**任何壁纸包（scene 场景包、视频壁纸、网页壁纸）、预览图、音视频或美术素材；仓库内随附的字体仅为各自许可允许再分发的开源字体，逐条见 THIRD-PARTY。用户需自行提供**合法获得**的壁纸，并自行承担因读取、转换或播放相关内容而产生的合规责任。"Wallpaper Engine" 及其相关名称与标识为其各自权利人的商标，本项目仅出于说明兼容性之目的进行指称。本项目渲染器以 GPL-3.0-or-later 发布、插件以 MIT 发布；第三方组件与参考资料（**仅行为对照、未复制代码**）的许可与归属见 THIRD-PARTY.md 与 docs/COPYING-RULES.md。
>
> *（上段按项目所有者指定原文采用。为使声明与仓库自身的审计记录一致，须并列阅读 §7 的两条例外：`oneincase/webwallgl`（MIT）的 FXAA 片元着色器为**逐字复制**、其 HLSL→GLSL 转译器为**逐字节 vendored**（MIT 声明均已保留，§7.1(2)）；`Aromatic05/wallpaper-engine-renderer`（GPL-2.0-only）曾被本仓库审计判定有 **2 处点状同源**，**已于 2026-09-16 按书面规格洁净室重写**（`PATCHES.md` **P-95**；旧实现已删除、行为逐位一致，§7.4(2)），剩余未定项为**法律定性**（审计 U-1/U-5）与**编号/表述不一致**。RePKG 的许可在既有文档中自相矛盾（MIT vs GPL），**未定/待核**。）*

> **Disclaimer**
> This project is **not affiliated with Wallpaper Engine** in any way. It does not include the Wallpaper Engine application, any Steam Workshop content, or any copyrighted wallpaper assets. It **does not redistribute** wallpaper packages (scene, video, or web), preview images, audio/video, or artwork; the fonts bundled in this repository are only those open-licensed fonts whose licences permit redistribution (see THIRD-PARTY). **Users must supply their own lawfully obtained wallpapers** and are solely responsible for compliance when reading, converting, or playing such content. "Wallpaper Engine" and related names and marks belong to their respective owners and are referenced here only to describe compatibility. The renderer is released under GPL-3.0-or-later and the plugin under MIT; see THIRD-PARTY.md and docs/COPYING-RULES.md for third-party components and reference material (used for **behavioural comparison only — no code was copied**).
>
> *The paragraph above is reproduced verbatim at the project owner's request. To keep it consistent with this repository's own audit record, read it together with the two exceptions in §7: the FXAA fragment shader in `oneincase/webwallgl` (MIT) is a **verbatim copy**, and its HLSL→GLSL translator is **vendored byte-for-byte** (MIT notices retained, §7.1(2)); and `Aromatic05/wallpaper-engine-renderer` (GPL-2.0-only), where our audit once found **two point-like same-origin fragments**, was **clean-room rewritten from a written specification on 2026-09-16** (`PATCHES.md` **P-95** — old implementation deleted, behaviour bit-identical, §7.4(2)), with the remaining open items being the **legal characterisation** (audit U-1/U-5) and **numbering/wording inconsistencies**. RePKG's licence is **contradictory** across our own records (MIT vs GPL) and is **unresolved**.*

---

## 6. 许可

- **本项目自有代码：GNU GPL 第 3 版或更新版本（`GPL-3.0-or-later`）**，全文见仓库 `LICENSE`
  （上半部分 = GNU GPL v3 条款原文，未改动；末尾附版权声明与 "either version 3 … or (at your option)
  any later version" 措辞）。SPDX 标识：`GPL-3.0-or-later`。
- **本仓库不含任何 WE（Wallpaper Engine）素材**：不分发 `scene.pkg`/`.mpkg`、贴图、官方着色器头、
  音频、视频或任何工坊作品；自带样例只有程序化生成的 `samples/sample-synthetic*`。真实壁纸请自备语料（见 §2/§3）。
- **本渲染器 import 了 MIT 许可的插件 `dsh-mpkg-wallpaper`**（包解析器）。该插件**保持 MIT**；
  借用在 MIT → GPL 的允许方向上，**插件的 MIT 声明随之保留**，不得被本仓库的 GPL 覆盖或删除。
- 第三方组件的逐条归属、许可全文与复制台账见 `THIRD-PARTY.md` 与 `docs/COPYING-RULES.md`；
  换 GPL 的决定与落地记录见 `PATCHES.md` P-89。本文件不是法律意见。

---

## 7. 参考与致谢 / References & Credits

本节逐个列出本项目**真正参考过的**上游项目，并区分三种性质：
① **复制了代码/素材**（必须保留其许可声明）；② **作为依赖 import**（非复制）；
③ **仅"行为/格式对照"**（未复制代码，或按审计结论如实标注点状同源）。
**凡本机无法证实的一律写"未定/待核"，不臆想**；法律文本与全文许可以 `THIRD-PARTY.md` 为准，复制台账以 `docs/COPYING-RULES.md` 为准。

### 7.1 复制了代码 —— 必须保留其许可声明

#### (1) elysia395/dsh-wallpaper-engine — MIT
- 仓库：<https://github.com/elysia395/dsh-wallpaper-engine> ｜ 许可：**MIT**（`Copyright (c) 2026 elysia395`）
- **参考/复制了什么（到文件级）**：`elysia/**` 与 `attach-transform.mjs` 整体是上游 `lib/we-renderer/**` 与 `lib/*.js` 的**移植/衍生作品**：
  - `elysia/we-renderer/**` —— 43 个文件里 **30 个与上游逐字节相同**（`cmp` 逐字节核对）；其余 13 个只带浏览器可移植性补丁（最小的只改 2 行 import 路径，最大的 `textures.js` 135 行差异）。
    覆盖的功能：CPU 场景渲染器核心、`model.js`+`mdl.js`（MDL 解析）、`puppet.js`（骨骼/蒙皮网格光栅化）、`effects/**`（模糊/云/水波/上帝光/景深视差等效果实现）、`glsl/**`（GLSL 解释器与 HLSL→GLSL 转译）、`jpeg.js`、`camera.js`、`bloom.js`、`canvas.js`、`text.js`。
  - `elysia/font-render.js`（1 行差）、`elysia/scene-scripts.js`（311 行差，已在上游基础上大幅扩展）、`elysia/scene-script-apis.js`（56 行差）—— 场景脚本运行时与 CFF 文字光栅化。
  - `attach-transform.mjs` —— 上游 **4 个函数的逐字移植**（`_mdlAnchors` / `_puppetBoneFinal` / `_attachmentOffset` / `resolveTransform`），用于附件锚点变换。
  - 合计 69 个文件 / 约 1.15 MiB。
- **是否直接复制过代码**：**是**（衍生作品，非独立实现）。渲染器部分由上游贡献者 **YV3507** 编写（`lib/we-renderer/` 下全部 16 个提交）；以 PR #47 于 2026-08-25 合并。
- **许可声明保留在**：`elysia/LICENSE`（MIT 全文，随目录分发）、`THIRD-PARTY.md` §1（MIT 全文）、`docs/COPYING-RULES.md` §4 台账 **#1**。
- **未定/待核**：`elysia/scene-scripts.js` 与 `wer-ref` 内嵌 C++ 字符串之间共享的 JS，其真实来源（elysia MIT 还是共同的 WE-API 祖先）**未定**；建议的三方 diff 尚未做。

#### (2) oneincase/webwallgl — MIT
- 仓库：<https://github.com/oneincase/webwallgl> ｜ 许可：**MIT**（`Copyright (c) 2026 oneincase`）
- 核对基准 commit：`fdfc578a577d0e680a9cfe2cf2e3e825d3cd2372`（v1.3.23，2026-09-15）。
- **复制了什么（一件，到行级）**：上游 `renderer/vendor/we-scene/render/renderer-glsl.js` 里的 **`FXAA_FRAG`（452–489 行）逐字**搬进本仓库 `we-scene-bundle.js`，常量名 **`FXAA_FS`**。归一化（去注释/空行/缩进）后 **38/38 行 GLSL 完全一致**，算法常量同上游（`SPAN_MAX=8.0`、`REDUCE_MUL=1/8`、`REDUCE_MIN=1/128`、`LUMA=(.299,.587,.114)`）。
- **仅行为对照（不是复制）**：
  - `?q` / `?aa` / `?pp` 质量档位与 `setQuality` 热更新 API —— 自己写；上游 `renderer/src/quality.ts` **未复制**（只对齐档位**含义**，那是 WE 客户端选项的事实而非受保护表达）；AA/`pp` 的常量**取值表**按值取自 MIT 的 `quality.ts`（MIT 允许，已致谢）。
  - 顶点阶段复用了本仓库既有的全屏三角 `BLOOM_VS`，而非上游自己的 quad；pass 编排（`runAAPass`、回读纹理、帧令牌幂等、`resolveAaMode`、MSAA 回退策略）均为自研。
  - 插件侧 `lib/web-wallpaper.js`（WE API shim）**0 行复制**，仅按 commit `b61e8910…` 对照行为。
- **是否直接复制过代码**：**是**（一个片元着色器 + 两个整文件 vendored，见下条）。
- **(2b) 同一上游的第二次 vendoring（P-93）**：`vendor/hlsl2glsl/` 是上游 **HLSL→GLSL 转译器**的
  **逐字节 vendored 副本** —— `hlsl2glsl.js`（77,953 B / 1401 行）、`hlsl-preprocessor.js`（14,971 B / 423 行），
  外加上游 `LICENSE`（1,085 B，byte-identical）；三者 sha256 与上游 blob 见 `THIRD-PARTY.md` §9.1，
  **一个字符都没改**（上游检出里 `git diff origin/main` 为空）。**未** vendored 的：`render/headers.ts`
  （转译器把 include 解析器作为第 4 个参数，本项目传**自己的** `common*.h`，不需要上游头表）、`quality.ts` 及其余文件。
  当前唯一消费者是覆盖度门禁 `hlsl2glsl-coverage-test.mjs`；**渲染器自身着色器路径尚未接线**（`PATCHES.md` P-93 记为"未做"）。
- **许可声明保留在**：`we-scene-bundle.js` 中 `FXAA_FS` 上方的来源注释、`vendor/hlsl2glsl/LICENSE`、
  `THIRD-PARTY.md` **§6 与 §9**（MIT 全文）、`docs/COPYING-RULES.md` §4 台账 **#6**（FXAA）与 **#8**（转译器）。
- **研读记录**：`docs/WEBWALLGL-UPSTREAM-STUDY.md`、`docs/WEBWALLGL-DEMO-STUDY.md`。
- **⚠ 注意：源码未 vendored，但静态构建产物**再分发**在本仓库 `demo/**`** —— 上游检出本身在仓库外的
  `vendor-ref/webwallgl/`（不入库）；而 `demo/**` 是**打过本项目补丁的 WebWallGL 在线测试台静态产物**
  （`demo/assets/renderer-*.js`、`demo/assets/bench-*.js`、`demo/index.html` 等上游产物**原样再分发**，
  `demo/bench-patch.js` 是本项目的运行期补丁，属本项目 GPL-3.0-or-later、不改动 minified 产物）。
  ⇒ **MIT 声明随目录分发**：`demo/LICENSE-webwallgl-MIT.txt`（MIT 全文 + 署名 + 说明哪些是上游、哪些是我们的）。
  `demo/` 内**不含任何壁纸包、预览图、音视频或工坊内容**，默认场景是本仓库自带的合成样例。
  详见 `THIRD-PARTY.md` §6.4 与 `docs/ONLINE-DEMO.md`。

#### (3) @shaderfrog/glsl-parser 7.0.1 — ISC（Andrew Ray）
- 仓库：<https://github.com/ShaderFrog/glsl-parser> ｜ 许可：**ISC**（依其 `package.json` 的 `"license": "ISC"`、`"author": "Andrew Ray"`）
- **参考/复制了什么**：整体 **vendored、未修改** —— `elysia/vendor/@shaderfrog/glsl-parser/`（18 个文件 / 685,630 B），被 `elysia/we-renderer/glsl/{executor,preprocess}.js` 使用（GLSL 解释器的解析前端）。
- **是否直接复制过代码**：**是**（原样 vendored）。
- **许可声明保留在**：`elysia/vendor/@shaderfrog/glsl-parser/LICENSE`、`elysia/LICENSE`、`THIRD-PARTY.md` §2。
- **未定/待核（重要）**：上游仓库**没有** LICENSE 文件，README 也无许可章节（GitHub `/license` = 404，npm 包内 `/LICENSE` = 404）⇒ 那个 LICENSE 文件是**我们按包元数据补写**的；其中版权年 `2022` 是依 npm 首发日期**推定**，非上游原文。

### 7.2 随仓库分发的第三方素材 —— 必须保留其许可

- **字体（7 个文件 + 12 个许可/声明文件）** —— 逐文件的**上游 URL、取得日期、字节数、sha256、版权行**见 `THIRD-PARTY.md` §4.1，许可全文随仓库放在 `assets/fonts/licenses/`：

| 文件 | 许可 | 上游 |
|---|---|---|
| `Blackout 2 AM.ttf` | OFL-1.1（RFN `Blackout`） | <https://github.com/theleagueof/blackout> |
| `monof55.ttf` | OFL-1.1 | Debian `fonts-monofur` 1.0 上游 tarball |
| `NotoSans-Regular.ttf` | OFL-1.1 | <https://github.com/notofonts/noto-fonts> |
| `RobotoMono-Regular.ttf` | OFL-1.1（**非** Apache-2.0；WE 里那份 2015 构建才是） | <https://github.com/googlefonts/RobotoMono> |
| `Segment7Standard.otf` | OFL-1.1（RFN `Segment7`） | fontlibrary.org `/en/font/segment7` |
| `Twemoji.Mozilla.ttf` | 美术 CC-BY-4.0 / 代码 Apache-2.0 | <https://github.com/mozilla/twemoji-colr>（v0.7.0） |
| `spincycle_3d_ot.otf` | 作者 freeware 条款（Jess Latham / bvfonts.com） | <https://www.bvfonts.com/>（逐条条件对照见 `THIRD-PARTY.md` §4.6.1） |

  **硬性 provenance 规则**：`assets/fonts/` 里**没有任何文件取自 Wallpaper Engine 安装目录**；WE 自带的字体目录只在**运行时**读取（`/weassist/fonts/<name>`），从不作为打包来源。
  **故意不打包**：`Alcubierre.otf`、`Atami-Regular.otf`、`CursedTimerUlil-Aznm.ttf`、`Lazer84.ttf`、`kust.ttf`、`opensticks.ttf`、`summer85.ttf`（未找到任何再分发授权），以及 `8bitOperatorPlus8-Regular.ttf`（内嵌声明是 OFL-1.1 本可分发，但作者当前发布页不可达，且规则禁止用 WE 里的副本顶替）—— **未定/待核**，见 `THIRD-PARTY.md` §4.7。
- **Peggy（MIT）** —— **仅致谢，未分发**：`elysia/vendor/@shaderfrog/glsl-parser/parser/parser.js` 是 Peggy 1.2.0 的机器生成产物（<https://peggyjs.org>）；Peggy 本身不随仓库分发。见 `THIRD-PARTY.md` §3。

### 7.3 作为依赖 import（非复制代码）

#### dsh-mpkg-wallpaper — MIT
- 仓库：<https://github.com/XHR666/dsh-mpkg-wallpaper> ｜ 许可：**MIT**
- **参考/使用方式**：渲染器 **import** 插件的包解析器（如 `we-scene-demo-server.mjs` 里的 `parsePkg` / `readPkgEntry`）；全仓库共 **12 个 `.mjs` / 34 处引用**。这是**依赖**，不是复制来的代码。
- **是否直接复制过代码**：**否**。
- **义务**：再分发本渲染器时**必须携带插件的 MIT 声明**；插件**保持 MIT**，不得被本仓库的 GPL 覆盖（MIT → GPL 是允许的单向流动；反向禁止）。见 `THIRD-PARTY.md` §7、`docs/COPYING-RULES.md`。
- 机器校验：`publish-check.mjs` 的许可自检断言插件包里**没有** GPL 文本。

### 7.4 仅"行为/格式对照"，未复制代码（逐项说明）

#### (1) Almamu/linux-wallpaperengine — GPL-3.0-only
- 仓库：<https://github.com/Almamu/linux-wallpaperengine> ｜ 许可：**GPL-3.0-only**（其 `packaging/archlinux/PKGBUILD` 写 `license=('GPL-3.0-only')`）
- **参考了什么（到文件/功能级）**：作为 `.tex` 容器与粒子/对象属性的**格式与默认值权威**，在代码注释里逐处标注依据，例如 `we-scene-bundle.js` 中：
  - 纹理容器格式依据（实测 `TEXV0005` + `TEXI0001` + `TEXB0001~0004`）—— 与 `TextureParser` 对照；
  - 非 MP4 时降级为 **V3 布局**的行为一致性；
  - 对象属性默认值 `ObjectParser.cpp:770`（`lengthDefault = (name=="ropetrail") ? 1.0 : 0.05`）；
  - 粒子初始化器 `CParticle.cpp:767-778`（`createVelocityRandomInitializer`）与控制点 flags。
- **是否直接复制过代码**：**否**（`docs/COPYING-RULES.md` §4 台账中**没有**它的条目 ⇒ 从未借用）。本机检出副本在仓库外的 `lwe-ref/`，不入库。
- **未定/待核**：粒子 flags 的 bit 定义在 `lwe-ref` / `wer-ref` 里**都找不到权威出处** ⇒ 标注"未定"（见 `PATCHES.md`）。

#### (2) Aromatic05/wallpaper-engine-renderer — GPL-2.0-only ✅ **点状同源已洁净室重写**
- 仓库：<https://github.com/Aromatic05/wallpaper-engine-renderer> ｜ 许可：**GPL-2.0-only**（为 `catsout/wallpaper-scene-renderer` 的 fork）
- **审计结论（与"仅行为对照"的默认口径不同，此处以事实为准）**：`docs/WER-REF-LICENSE-AUDIT.md` §3.4 曾判定本仓库有 **2 处点状同源**：
  1. ~~`normalizeImageAlpha`（曾位于 `we-scene-bundle.js:951-956`）↔ 上游 `WPImageObject.cpp:59-63`~~ —— 曾判为"**逐行翻译**"（同名仅大小写、同 3 分支顺序、同魔数 `1`/`100`、同返回钳位）。
  2. ~~alignment 偏移（曾位于 `we-scene-bundle.js:4430-4441`）↔ 上游 `WPImageAlignment.hpp:24-36`~~ —— 曾判为"**同源改写，不是洁净室产物**"（同一张 token→轴→方向表 + 同种子串分派 + 同 `center` 短路）。
  - 另有 2 处较弱形态：视差 `mouse_vec` 公式（注释里照写了上游表达式）、`elysia/scene-scripts.js` 里的 `__makeNoopVideoTexture` 命名被称为"官方"实为 `wer-ref` 私有名。
- **✅ 处置结果（2026-09-16 洁净室重写）**：上述 **2 处已按 `docs/COPYING-RULES.md` §5"五步洁净室"流程重写，旧实现已从 `we-scene-bundle.js` 删除**（`grep` 已无 `normalizeImageAlpha` / `imageAlignmentOffset`）：
  - ①**先写行为规格**：`docs/IMAGE-ALPHA-ALIGN-SPEC.md`（§1 alpha 归一化真值表与"不得做什么"、§2 alignment token 文法与优先级、§4 验收判据）；
  - ②**只依据规格实现**：新实现为 `coerceImageAlphaMode` + `classifyAlphaDomain`/`saturateUnitInterval`（分类与换算分离 + 具名常量 `ALPHA_UNIT_MAX`/`ALPHA_PERCENT_MAX`），以及 `alignmentOffsetForToken` + `readAlignmentAxisSigns` + `ALIGNMENT_HALF_SHIFTS`（**token 字形与偏移量彻底解耦成查表**，键为符号二元组）；
  - ③**五维可证明不同**：命名、分支结构、常量组织、数据结构形态、注释文字均与上游不同（"逐分支同构"在 `we-scene-bundle.js` 已 0 处）；
  - ④**测试不依赖上游**：`clean-room-alpha-align-test.mjs` 只读规格与真语料；
  - ⑤**行为差异：无** —— 该测试 **1008 pass / 0 fail**（我方实测），含"与改前实现 `Object.is` **逐位对拍**"与 6 个真包 / 408 层语料回归。
  - 连带处置：2 处弱形态**已清** —— `__makeNoopVideoTexture` 全仓 **0 命中**，视差注释里的上游表达式与 `WPNodeTransformResolver.cpp:154-156` 行号已删。
- **登记留痕**：`PATCHES.md` **P-95**（洁净室重写专条，含五维差异表与可复跑证据）；`docs/WER-REF-LICENSE-AUDIT.md` §3.4 已加 **"✅ 事后追加（处置结果）"**（原文判定保留不改，另附处置后对照与血缘复测）。
- **规模**：曾为**点状**（约 2 个函数 / ~11 行），从不是段落级或文件级移植；全仓库对其 **0 处 import/require/readFile**。
- **是否直接复制过代码**：**否**（逐字层面：0 处注释复制、0 处错误串复制、0 处常量表照抄）；上述 2 处同源衍生**已清除**。
- **未定/待核**：**法律定性** —— 审计 §7 的 **U-1**（"曾构成 GPL-2.0-only 衍生"这一判断本身仍需律师意见）与 **U-5**（清单是否穷尽）**仍未结案**；代码层的处置与留痕不替代法律意见。
- **已收尾的一致性项**：编号已统一为 **P-95**（源码注释、验收测试、`RENDERER-ARCHITECTURE.md`、`THIRD-PARTY.md` 全部改为 P-95；`PATCHES.md` 里的 P-91 是另一件事 = "分发形态"）；`we-scene-bundle.js` 里最后一处上游表达式括注也已删除。
- 本机检出副本在仓库外的 `wer-ref/`（565 文件 / 9.2M），**不入库**；`docs/COPYING-RULES.md` 的可借表把它列为"❌ 不可借"（重写后也不再需要"借"）。

#### (3) catsout/wallpaper-scene-renderer — GPL-2.0-only
- 仓库：<https://github.com/catsout/wallpaper-scene-renderer> ｜ 许可：**GPL-2.0-only**（**已归档**，默认分支 `master`）
- **参考了什么**：仅作两件事 —— ① `wer-ref` 的**已归档上游 fork 父项目**（两者 LICENSE 为同一 blob）；② 作为"官方行为对不对"的**第三方旁证**，**只引用其行为结论**。
- **是否直接复制过代码**：**否**；本项目**本机没有独立检出副本**。
- **未定/待核**：它与 `waywallen/open-wallpaper-engine` 之间的**逐文件血缘**只在"仓库自述"层面成立（README 全文为 "Moved to …"、同一 LICENSE blob、创建/归档相隔 9 分钟），**未**逐 commit 证实。

#### (4) waywallen/waywallen — MIT
- 仓库：<https://github.com/waywallen/waywallen> ｜ 许可：**MIT**（`bridge/LICENSE` 亦为 MIT，同一持有人）
- **参考了什么**：**仅架构先例** —— "宽松许可宿主 + copyleft 渲染器作为独立进程"的分层方式（依据其 `plugin.toml.in` 的 `[renderers.wescene-renderer]` 段），用以佐证 GPL 组件与 MIT 宿主可以并存而不互相污染。
- **是否直接复制过代码**：**否**。许可兼容性文档记录它"MIT ⇒ 可借"，但**该许可从未被行使**（台账中无条目）。

#### (5) waywallen/open-wallpaper-engine — GPL-2.0-only
- 仓库：<https://github.com/waywallen/open-wallpaper-engine> ｜ 许可：**GPL-2.0-only**
- **参考了什么**：**零接触**。它只出现在两处：许可兼容性分析（判定"❌ 不可借"），以及 `wer-ref` 自己的迁移说明（`This migration ports applicable renderer behavior from ../open-wallpaper-engine …`）——即**上游之间的**血缘，与本仓库无关。
- **是否直接复制过代码**：**否**。

#### (6) aqnya/unmpkg — GPL-3.0（仅 `.mpkg` 格式参考）
- 仓库：<https://github.com/aqnya/unmpkg> ｜ 许可：**GPL-3.0**
- **参考了什么**：仅 `.mpkg` 二进制**格式**（自述 "format from aqnya/unmpkg"）。
- **是否直接复制过代码**：**否**；自述参考它的那个解析脚本（38 行）已于 **2026-09-16 删除**（因无法排除代码级血缘）。审计对本仓库实现另有"独立实现"的判断（38 行自写 `struct.unpack_from` 顺序解析，无上游函数名/注释/结构）。
- **未定/待核**："仅参考格式"这一声明**无法在本机证实**。本机**无检出副本**。

#### (7) notscuffed/repkg — **许可未定/待核**
- 仓库：<https://github.com/notscuffed/repkg> ｜ 许可：**未定/待核 —— 既有文档自相矛盾**
  - 记 **MIT** 的一侧：`docs/SIMILAR-PROJECTS-RESEARCH.md`（"MIT"，并称其 `THIRD-PARTY-NOTICES.txt` 完全无 WE 声明；"若将来需要成熟的 pkg 写出能力，它是一个可署名的候选"）。
  - 记 **GPL** 的一侧：`PATCHES.md`、`docs/COPYING-RULES.md`、`../docs/PLUGIN-POLLUTION-AUDIT.md`、插件 README（"GPL，仅研究 .tex 格式"）。
  - ⇒ **分发前必须向上游复核**。
- **参考了什么**：作为 `.tex` 解码的**格式/取值权威**被引用（RG88 约定 `(rgb=G, a=R)`、与 ImageSharp `Rgba32` 一致、灰度=第二通道 G / alpha=第一通道 R 等）。
- **是否直接复制过代码**：**否（逐字）**，但 `we-scene-bundle.js` 有一句比"格式参考"更强的表述：BC1/BC2/BC3 "**逐行对齐 RePKG 的 LibSquish 移植实现**，保证像素级一致" ⇒ **待核**。自述参考它的 267 行脚本已于 2026-09-16 删除。本机**无检出副本**（工作区未 vendor）。

#### (8) Aromatic05/we-layerd — **无许可（保留所有权利）**
- 仓库：<https://github.com/Aromatic05/we-layerd> ｜ 许可：**无 LICENSE 文件 = 保留所有权利**（比 GPL 更严）
- **参考了什么**：仅作一次行为对照（"该功能为零实现"的旁证）。
- **是否直接复制过代码**：**否**。本机检出副本在仓库外的 `we-layerd-ref/`，**不入库**。

### 7.5 仅在许可兼容性研究中评估 —— **未参考其代码**

- **NixaXI/AnisPaper** — 仓库 <https://github.com/NixaXI/AnisPaper> ｜ 许可：**GPL-3.0**（其 `LICENSE` 文件只写 GPL-3.0，而项目自述多处写 or-later ⇒ **表述冲突，保守按 GPL-3.0-only 对待**，**未定/待核**）。
  **未参考其代码**：本仓库记录明确写着"本轮未借其代码"，本机**无检出副本**；它只出现在许可兼容性分析里。
  （另注：既有调研文档曾把它描述为 Android/Kotlin，**已更正** —— 实为 C++/CMake + Qt + KDE Plasma 6。）

### 7.6 调研过但**未采用**（列出以说明"没参考过就不写进上面"）

`Paradox07127/macos-wallpaperengine`（MIT）、`oneincase/WallpaperEM`（MIT）、`pbadgpmeb22791-sketch/dsh-we-wallpaper`（MIT）—— 仅调研；
`lucaschnabel42/wallgl`（**无许可 ⇒ 不可借用**）、`NikoPit/wallpaper-engine-assets`（`license: null` ⇒ 不能作为"可分发"的先例）—— 明确排除；
`enenesser/earth-webgl`（检索噪声，不是同类项目）。

### 7.7 Wallpaper Engine 本体（专有）—— 不随仓库分发

- Wallpaper Engine 为 Valve/Steam 上的**专有软件**，其资产受 Steam 订户协议约束。本仓库**不分发**任何 WE 资产：
  贴图、官方着色器头、粒子预设、字体、音频、视频、工坊作品一律不含；运行时从**用户自己的** WE 安装按 `MPW_WE_ASSETS` 读取。
- 本项目内部 shader 曾被指出与 WE 官方着色器头**逐字节相同**；现已换成 **6 个自研的 API 兼容实现**
  （`common.h` / `common_blending.h` / `common_blur.h` / `common_composite.h` / `common_fragment.h` / `common_perspective.h`），
  每个文件头注明 `Original implementation for this project; API-compatible with the shader includes used here. No third-party code.`
- ~~**未定/待核**：既有文档称重写了 7 个头文件，实际只有 6 个~~ → **已收口（P-91，2026-09-16）**：
  留痕范围正式记为 **6 个**；`common_vertex.h` 是**故意不发布**（管线零引用、`BuildTangentSpace` 零调用；
  重写后与 WE 原件"有效行 100% 重合"故不算洁净室产物），原件与替换件都保留在 `Delete/` 证据归档里。
  三条事实与复现命令见 `docs/COMMON-HEADERS-REPLACEMENT.md` **§1.1**。

---

*本节与 `THIRD-PARTY.md`、`docs/COPYING-RULES.md` 的口径核对记录见 `PATCHES.md`；
如发现三者不一致，**以事实为准**并同步修正这三处。*
