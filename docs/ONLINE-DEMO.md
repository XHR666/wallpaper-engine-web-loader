# ONLINE-DEMO.md — 在线 demo 的发布形态（GitHub Pages）

> 本文是**发布形态的唯一口径**：页面结构、Pages 的源与构建方式、以及"哪些东西**不**会出现在线上"。
> 代码先落到这个形态上，再谈部署。**不引入任何需要联网安装的构建步骤**（纯静态优先）。
> 相关：`PATCHES.md` P-93（本批改动）、`../THIRD-PARTY.md` §6（webwallgl MIT）、`COPYING-RULES.md`。

## 1. 一句话形态

**一个静态站点，三个入口，零后端。**

- 站点根 = 本仓库根目录（`we-scene-demo/`）。Pages 直接发根，不做 Jekyll（`.nojekyll`）。
- 页面之间**只有超链接**：没有路由、没有打包、没有 SSR、没有第三方 CDN。
- 线上**没有任何服务端**：`/api/*`、`/diag`、`/pkgdir`、`/weassist/*` 全部不存在（Pages 是纯文件托管）。
  测试台自己会探测到这一点并**优雅降级**（见 §4），不使用本机后端的控件会置灰并写明原因。

## 2. 页面结构

| 线上路径 | 源文件 | 作用 |
|---|---|---|
| `/` | `index.html` | **落地页**：一句话定位 + 中英免责声明（逐字）+ 三个入口 + 许可与致谢链接 |
| `/demo/` | `demo/index.html` | **测试台**（打过我们补丁的 WebWallGL 静态产物）。横幅写明"在线版没有本机后端"；默认载入合成样例 |
| `/demo/renderer/index.html` | `demo/renderer/index.html` | 渲染器页（被测试台以 iframe 载入；单独打开是**黑底全屏**渲染画布，无 UI） |
| `/demo.html` | `demo.html` | **渲染器 demo**（本仓库自己的渲染器 + 逐层调试面板）。需要本机 Node 后端才能列壁纸，无后端时用 `?id=`/`?pkgurl=` 或内置合成样例 |
| `/samples/README.md` | `samples/README.md` | **合成样例说明**（`samples/sample-synthetic/` 的来源、字节数与再生成命令） |
| `/README.md` · `/THIRD-PARTY.md` · `/docs/COPYING-RULES.md` | 同名文件 | 许可与致谢 |

落地页的三个入口就是上表的 **`/demo/`（测试台）**、**`/demo.html`（渲染器 demo）**、**`/samples/README.md`（合成样例说明）**。

### 2.1 为什么测试台要落在仓库根的 `demo/` 子目录

上游静态产物（`demo/assets/*.js`，minified、**不可重建**：本机离线装不上依赖，见 `../PATCH-NOTES.md` §0）
里有**三条硬编码绝对路径**：

- `/wallpaper-engine-webgl/renderer/index.html`（测试台 iframe 的渲染器页，3 处 `iframe.src=`）
- `/wallpaper-engine-webgl/sw.js`（Service Worker 注册，产物里其实**没有** `serviceWorker.register` 调用 ⇒ 惰性文件）
- `/wallpaper-engine-webgl/default-wallpaper/index.html`（渲染器页的兜底壁纸）

所以源文件里这些路径**保持绝对路径不动**（改 minified 产物风险大于收益）。让它们同时成立的唯一办法：
**部署产物里把测试台也挂到仓库根下的 `wallpaper-engine-webgl/`**。这件事由一条简单规则完成：
Pages 的产物 = **仓库根 + `demo/` 目录的一份副本（放在根下）**，见 §3。

> 一句话：源里 `demo/` 是**唯一真源**，Pages 产物里它出现两次（`/demo/` 与 `/wallpaper-engine-webgl/`）。
> 两份是同一份文件的拷贝，**仓库里只有一份**（不是"两份副本只改一份"那类事故：仓库侧不存在第二个物理副本）。

## 3. Pages 的源与构建方式

**源**：本仓库（`XHR666/wallpaper-engine-web-loader`）`main` 分支根目录。

**构建**：`pnpm run build:pages` → `node build-pages.mjs [--out _site]`，纯 Node、零依赖、**不联网**：

1. 按**显式白名单**拷贝（`build-pages.mjs` 顶部的 `PAGES_KEEP_DIRS` / `PAGES_KEEP_FILES`，
   外加 `PAGES_SKIP_RE` 排除 `*-test.mjs` / `*-check.mjs` / `*.sh` 这类工具形状）——
   站点只放"能看的东西"：落地页、测试台、渲染器、样例、许可与文档；
   **测试脚本、打包工具、服务端、本机清单一律不进产物**。白名单是发布面的唯一口径，读得出来、审得动；
2. 把 `demo/` 整棵子树再拷一份到 `<out>/wallpaper-engine-webgl/`（见 §2.1 的三条绝对路径）；
   软链**跟随解引用**（`demo/samples` → `../samples`）：Pages 不解析软链，产物里必须是真文件；
3. 写 `<out>/.nojekyll`（关掉 Jekyll，保住 `_` 开头的文件名）；
4. **产物自检**：12 条必需文件缺一个就非零退出（`index.html`、`demo/{index.html,bench-patch.js,LICENSE-webwallgl-MIT.txt}`、
   `wallpaper-engine-webgl/{index.html,bench-patch.js,renderer/index.html}`、
   `samples/sample-synthetic/{scene.pkg,project.json}`、`THIRD-PARTY.md`、`LICENSE`、`.nojekyll`）。

**发布**：`.github/workflows/pages.yml`（`workflow_dispatch` 手动触发；`main` 推送自动触发，纯文档改动不触发），
产物 = 上面 1–4 步的结果，由 `actions/upload-pages-artifact` + `actions/deploy-pages` 发布。
workflow 里**没有** `pnpm install` / `npm ci` / `vite build`，另有一条"产物里不得出现个人绝对路径"的 `grep` 闸门。

**明确不做**（都是"需要联网安装"或"会引入第二份真源"的路）：

- ❌ `pnpm install` / `vite build` / 任何 npm 依赖：CI 里也不装，构建脚本只用 Node 内置模块。
- ❌ 从 `vendor-ref/` 拷贝测试台：测试台的真源是 `demo/`，`vendor-ref/ww-pages/` 只是**历史读取路径**
  （它下面 `wallpaper-engine-webgl` 是指向 `demo/` 的软链，见 §5）。
- ❌ 真实壁纸、本机路径、上报/私有清单（见 §6）。

## 4. 测试台在本机 vs 在线：同一份文件，两种后端状态

`demo/bench-patch.js` 是**唯一真源**（1 个物理文件，2 条符号链接指向它，见 §5）。它同时服务两种环境：

| | 本机（`:8901` 静态 / `:1430` vite 宿主） | 在线（GitHub Pages） |
|---|---|---|
| `/api/library`、`/api/diag-stream` | 本机 Node 宿主在 ⇒ 壁纸库列表 / 属性保存 / 删除 / 诊断流可用 | 404 ⇒ **全部置灰 + 写明原因**，左栏与诊断区都给出"为什么不可用 + 怎么办" |
| 「选择文件夹」 | 纯前端扫描（`webkitdirectory`），scene 包直接预览 | 同样可用（**唯一**的本地载入方式） |
| `/demo/samples/sample-synthetic/scene.pkg` | 页面**默认载入**这张合成样例 | 同样默认载入（`fetch` + `Blob`，不经任何后端） |
| 静态提示 | `static.notice`：列表/保存/删除/诊断流需要本机后端 | 同一句，外加 §4.1 的"在线版"横幅 |

### 4.1 在线版横幅（页面上写清楚"没有本机后端"）

落地页与测试台页脚各有一条**静态**横幅（不依赖 JS、不依赖后端）：

- 测试台：`demo/index.html` 里的 `#online-notice`（中英双语），文案为
  「在线演示版：本页**没有任何本机后端**（`/api/*`、`/diag` 在 GitHub Pages 上全是 404）……」
- 落地页：`index.html`（仓库根）里的同名区块。

运行期文案由 `bench-patch.js` 的 `onlineDemoNotice()` 产出（纯函数、可单测），
与页面静态文案同源同义；`backendNotice()` 在在线形态下**不再**说"去跑 `pnpm dev`"
（对访客无意义），改说"在线版就是没有后端，这是设计如此"。

## 5. 单一真源：`bench-patch.js` 只有一份物理文件

```
we-scene-demo/demo/bench-patch.js                      ← 唯一物理文件（真源，随仓库分发）
vendor-ref/ww-pages/wallpaper-engine-webgl/bench-patch.js  → 软链 ../../../we-scene-demo/demo/bench-patch.js
vendor-ref/webwallgl/bench-patch.js                        → 软链 ../ww-pages/wallpaper-engine-webgl/bench-patch.js
```

- `:8901` 静态台（`python3 -m http.server` 起在 `vendor-ref/ww-pages/`）与 `:1430` vite 宿主
  （`vendor-ref/webwallgl/`，`vite.config.ts` 的 `server.fs.allow: ['..']`）经**链式软链**加载**同一个 inode**。
- **历史事故**：曾有两份 `bench-patch.js` 副本，只改了一份 ⇒ 测试绿而页面照旧坏。本形态下仓库里只有一份物理文件，
  软链不可能"漂移"。回归钉子：`vendor-ref/ww-pages/bench-patch.test.mjs` 的 **T28**（`realpath`+`fs.statSync().ino` 比对两侧同一 inode），
  以及 T24「补丁脚本仍是唯一一份」。
- 页面里的引入路径仍是 `/wallpaper-engine-webgl/bench-patch.js`（与产物 assets 同基）⇒ 在 Pages 产物里该路径存在（§3 第 2 步）。

## 6. 哪些东西**不**会出现在线上

| 不会出现 | 为什么 / 怎么保证 |
|---|---|
| **任何真实壁纸**（Steam 创意工坊包、`scene.pkg`/`.mpkg`、视频壁纸、网页壁纸） | 仓库里本来就没有（P-87 已删 198 MB 测试语料）；`samples/` 只有 `tools/make-sample.mjs` 从算术生成的合成样例（33 299 B）。发布闸门 `publish-check.mjs` 与 `.gitignore.public` 兜底 |
| **预览图 / 音视频 / 美术素材** | 同上一行；测试台自带的 `demo/imgs/` 只有 PWA 图标（`icons/*.png`），赞赏二维码已删（T27） |
| **个人绝对路径**（Linux 家目录、macOS `/Users`、Windows 盘符路径） | `demo/**` 里 **0 命中**（自查命令见 §7 第 ② 条）；发布闸门 `publish-check.mjs` 的 ② 会对任何文本文件里的个人绝对路径报警（环境变量默认值除外），Pages workflow 里也有一条同样的 `grep` 闸门 |
| **本机后端的本地依赖**（`server/we-scene-demo-server.mjs` 的 `/api/*`、`/diag`、`/pkgdir`、`/weassist/*`；`dsh-mpkg-wallpaper` 的 `pkg-extract`） | 线上是纯文件托管 ⇒ 这些端点不存在；页面探测到 404 后**降级并说明**，不假装能用；渲染器 demo（`/demo.html`）在无后端时也只用 `?pkgurl=`/内置合成样例 |
| **上报与私有清单**（`reports/`、`library-manifest.json`、`package-matrix.json`、`perf-*.json`） | `.gitignore.public` / `.gitignore` 排除；`publish-check.mjs` 对私有清单类文件**阻塞** |
| **Service Worker 离线缓存** | 产物里没有 `serviceWorker.register` 调用（`demo/sw.js` 是惰性文件，仅为保持产物结构）⇒ 线上不会出现"旧版本被 SW 缓存住"的经典事故 |

## 7. 本地自证（发布前每次都跑）

```bash
# ① 静态托管真访问（带 cache-buster：本机 :8901 不发 Cache-Control）
curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:8901/demo/?t=$RANDOM"          # 期望 200
curl -s -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:8901/?t=$RANDOM"               # 期望 200

# ② 隐私：新目录里不得有个人绝对路径（模式串拆开写，免得本文件自己命中那道闸门）
grep -rn "/ro""ot/" demo/ || echo "0 命中"

# ③ 补丁回归（含单一真源 T28）；$MPW_ROOT = 工作区根（作者本机的默认值见 README §4）
node "$MPW_ROOT/vendor-ref/ww-pages/bench-patch.test.mjs"

# ③b Pages 产物构建（零依赖、不联网；产物自检 12 项）
node build-pages.mjs --out /tmp/site && ls /tmp/site

# ④ 文档一致性与发布闸门
node docs-check.mjs          # 期望退出码 0
node publish-check.mjs       # 期望 0 阻塞项
```

**GitHub Pages 线上地址**（部署后）：`https://xhr666.github.io/wallpaper-engine-web-loader/`
（仓库 `homepage` 字段同值）。**本机无法验证线上**：Pages 需要 `git push` + 仓库 Settings → Pages
选 "GitHub Actions"，这两步都不在本次任务范围内。

## 8. 未定项（如实列出）

1. **线上没验过**：本文写的是形态与本地自证；`pages.yml` 的首次运行、`build-pages.mjs` 在 CI 上的产物、
   Pages 的真机观感都**没有**证据（需要建仓线先 push 仓库并在 Settings 里开 Pages）。
2. **`build-pages.mjs` 的"发布面"口径与 `.gitignore.public` 是两处**：脚本读同一份忽略清单，
   但两者不同步时会出现"本地构建产物多/少文件"。目前靠 `publish-check.mjs` 交叉核对。
3. **`/demo.html` 在纯静态下的完整体验**：无后端时它靠 `?pkgurl=`/合成样例；真正"点一下就能看"的
   画廊入口（`?id=` 列本地语料）在线上**故意不可用**（不分发真实壁纸）。
4. **PWA/离线**：线上不注册 Service Worker（§6），所以"装成 App / 离线可用"是**不做**的，
   不是"没做完"。
5. **移动端**：测试台是桌面工作台布局（三栏 + 工具条），窄屏只是可用性下降，未做专门适配。
