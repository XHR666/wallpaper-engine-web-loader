# 发布就绪清单（RELEASE.md）

> 为什么有这份文件：`npm publish` 是**不可逆**动作（发布后只能 `deprecate` 或补丁版），
> 而本仓库的门禁是"一条命令全量自检"（`bash tests/run-all-tests.sh`，116 项）。
> 这份文件把**发布前置**、**确切命令**、**发布后验证**、**回滚**钉成可复制的步骤 —— 照着跑，不靠记忆。
>
> 状态（2026-09-20 01:2x 实测）：本地 `package.json` = **0.2.0**；npm 官方 registry 上
> `latest` = **0.2.0**（`npm view wallpaper-engine-web-loader dist-tags --registry=https://registry.npmjs.org`）。
> 历史：0.1.1（2026-09-16 建仓首发）→ 0.2.0（2026-09-20，见文末发布记录）。

## 0. 版本号是否要动

- 规则：`package.json.version` 必须**严格大于**官方 registry 上的 `latest`（否则 `npm publish` 直接 403
  `cannot publish over the previously published versions`）。
- **两处必须同时改**（有门禁钉着，改一处会红）：
  1. `package.json` 的 `version`；
  2. `core/we-scene.mjs` 的 `export const VERSION`（判据：`tests/mount-test.mjs` §6 `VERSION === package.json.version`）。
- 还要顺手改的限制引用：`README.md` 里三处版本号（顶部"已发布 …@x.y.z"、安装命令 `npm i …@x.y.z`、
  `npm pack …@x.y.z` 与 `tar -xzf …-x.y.z.tgz`）。
- semver 口径：**加功能/加导出/加路由 ⇒ minor**；只修 bug ⇒ patch；破坏兼容 ⇒ major。
  先例：`0.1.0`（建仓）→ `0.1.1`（打包白名单 + 首轮修复）→ `0.2.0`（P-101…P-166 一大批运行时与测试台能力）。

## 1. 发布前置（逐条跑，全绿才谈第 2 节）

```bash
cd <仓库根>

# ① 全量门禁（重活，**先串行化**再跑，避免与别的重任务撞车 OOM）
#    注意：脚本自带 flock，**不要**在外面再包一层 flock（会自锁）。
bash tests/run-all-tests.sh                  # 期望末行 "全部通过" + 0 FAIL
#    想先快跑一遍：bash tests/run-all-tests.sh --fast（跳最慢项）—— **发布前那次必须是全量**

# ② 发布面闸门：必需文件 / 元数据 / 白名单 / 个人路径 / 凭据 / 反向流动（插件指纹不许进渲染器发布物）
node tests/publish-check.mjs                 # 期望 findings.blocking 为空
# ③ 打包面：白名单里的每个路径真的存在、LICENSE 口径、tarball 内容
node tests/packaging-test.mjs                # 期望 137 通过 / 0 失败
# ④ 版本口径：VERSION === package.json.version
node tests/mount-test.mjs
# ⑤ 看 tarball 到底是什么（**发布前必看**）：文件数、体积、有没有夹带
npm pack --dry-run

# ⑥ 浏览器纪律（若这一轮跑过浏览器）：跑完不该有残留
ps -eo comm | grep -cx firefox                # 期望 0
```

## 2. 发布（确切命令）

```bash
cd <仓库根>
# registry **必须显式写**：本机 ~/.npmrc 的默认 registry 是 npmmirror（镜像），
# 直接 `npm publish` 会发到镜像/或报未登录；npmjs 的 token 在同一份 .npmrc 里（key 带 //registry.npmjs.org/）。
npm publish --registry=https://registry.npmjs.org/
```

- 发布**不需要**改 `.npmrc`、不需要 `npm adduser`（token 已在），但 `npm whoami` **也要带上 `--registry`** 才有用：
  `npm whoami --registry=https://registry.npmjs.org/` ⇒ `xferoni66`。
- `files` 白名单是**唯一**发布面（`package.json.files`）；`demo/`（测试台）**不在**白名单里 —— 见第 5 节。

## 3. 发布后验证（逐条跑，别只看"发布成功"那一行）

```bash
V=0.2.1
# ① 先看 registry 认不认这个版本（发布处理有几分钟延迟，404 属正常，等一会儿再试）
npm view wallpaper-engine-web-loader@$V version dist.tarball --registry=https://registry.npmjs.org/
npm view wallpaper-engine-web-loader dist-tags --registry=https://registry.npmjs.org/    # latest 应指向新版本
# 真下载一份、逐条核对内容（不是看本地目录）：体积、文件数、关键路径在不在
cd /tmp && rm -rf npmpub && mkdir npmpub && cd npmpub
npm pack wallpaper-engine-web-loader@$V --registry=https://registry.npmjs.org/
tar -tzf wallpaper-engine-web-loader-$V.tgz | sort > files.txt
wc -l files.txt && grep -c "package/web/icons/brand-" files.txt      # 品牌图标应 4 条
grep -E "package/(core/we-scene.mjs|server/we-scene-demo-server-8902.mjs|web/manifest.webmanifest)$" files.txt
# ② **必做**：装一份到干净目录，跑一次真实装载 —— 0.2.0 就是这一步抓出来的（包缺文件 ⇒ MODULE_NOT_FOUND）
mkdir app && cd app && npm init -y >/dev/null && npm i wallpaper-engine-web-loader@$V --registry=https://registry.npmjs.org/
node -e "import('wallpaper-engine-web-loader').then(m=>console.log('VERSION=',m.VERSION,'mount=',typeof m.mount))"
cd /tmp/npmpub && tar -xzf wallpaper-engine-web-loader-$V.tgz && node package/server/we-scene-demo-server-8902.mjs --help >/dev/null 2>&1; echo "8902 server 启动脚本可执行=$?"
```

- 打 tag + 推送（GitHub Release 可选）：
  ```bash
  git tag -a v$V -m "wallpaper-engine-web-loader $V" && git push origin v$V && git push origin main
  ```

## 4. 回滚 / 出问题怎么办

npm **不能撤回**已发布版本（72 小时内可 `unpublish`，但那会破坏依赖它的项目；本仓库不用这条路）。可选动作：

1. **打补丁版**（首选）：修完 bump 到 `0.2.1` 再发一次。
2. **标记弃用**（让 `npm i` 的人看到警告，但已装的人不受影响）：
   ```bash
   npm deprecate wallpaper-engine-web-loader@0.2.0 "原因 + 建议升到 0.2.1" --registry=https://registry.npmjs.org/
   ```
3. **dist-tag 回退**（只影响"跟随 latest"的新安装）：
   ```bash
   npm dist-tag add wallpaper-engine-web-loader@0.1.1 latest --registry=https://registry.npmjs.org/
   ```
4. git 侧：`git push --force-with-lease` **不要**用；发布记录以"再补一条"的方式留在本文件里（历史可读）。

## 5. 未证实 / 边界（诚实记录）

1. **测试台（`demo/`）不进 tarball**：`package.json.files` 里没有 `demo/` 任何路径
   （它 66MB，其中 `demo/now-playing/` 64MB 是本机构建残留）。后果：**包里的
   `server/we-scene-demo-server-8902.mjs` 起得来、但静态面没有测试台页**（默认 `STATIC_ROOT=<包根>/demo`
   不存在）⇒ 装包的人只能用 `:8899` 渲染器页，或把仓库 clone 下来跑测试台。
   绕开办法：`MPW_BENCH_STATIC_DIR=<仓库>/demo node server/we-scene-demo-server-8902.mjs`。
   要真正修好得把测试台按白名单（`demo/index.html` / `bench-patch.js` / `assets/**` / `icons/**` /
   `now-playing/dist/**` / `renderer/**` / `default-wallpaper/**`，约 2MB）加进 `files` —— 属于**发布面变更**，
   需要单独一轮（`publish-check` 的反向流动断言会一并扫这批文件）。
2. **GitHub Pages 在线 demo** 是 `node build-pages.mjs` 的产物（白名单静态站），与 npm 包**不是同一套文件**：
   在线版没有 `/api/*`，属设计如此（README「任意静态服务器」节）。
3. **`VERSION` 只反映"包版本"**：渲染器页头部那个 `#app-version`（`v1.3.16`）由自带 demo 产物写，
   两者本来就不是同一个号（前者是本仓 semver，后者是上游渲染产物的版本），别把它们对齐。
4. **发布不改 `~/.npmrc`**：本机默认 registry 是 npmmirror ⇒ 任何 `npm view/publish/whoami` 都要显式
   `--registry=https://registry.npmjs.org/`，否则读到的是镜像的（可能滞后）状态。

## 6. 发布记录：0.1.1（2026-09-16 建仓首发）

* 内容：仓库首次公开（渲染核心 + 自带服务器 + 离线 PWA + 自带合成样例），GPL-3.0-or-later。
* tarball：见 npm 上的 0.1.1。

## 发布记录：0.2.0（2026-09-20）

**为什么发**：0.1.1 之后本仓累积了一大批**用户可见**的能力与修复，而版本号一直没动 ⇒ 用户在 npm 上看到的
还是旧包（这是"渲染器为什么没推 npm"的直接原因）。

**这一版包含（按 P-编号）**：

| 面 | 内容 | 条目 |
| --- | --- | --- |
| 运行时能力 | 8K 贴图的**选级解码**（按目标尺寸挑 mip，实测解码量 −72.6%、峰值位图 −75%）+ 上传失败不再注册坏纹理（原来表现为"整屏纯黑"） | P-163 |
| 运行时能力 | 上游 1.3.17–1.3.23 的一批修复移植（粒子/效果/语法容错/相机/文本层…） | P-101…P-165 各条 |
| 自带服务器 | `/report`（诊断现场快照）与 `/baseline`（真机基线趋势）两条落盘路由；四个 POST 接收端超限一律**干净的 413**（旧实现先掐连接 ⇒ 客户端只看得到 ECONNRESET） | P-166 |
| 自带服务器 | `:8902` 一站式测试台服务（测试台静态面 + `/api/*` + 渲染器 iframe + 媒体面 + 诊断流） | P2-2 / P-158…P-164 |
| 站点外壳 | 品牌图标（`web/icons/brand-*.png`）+ manifest/pwa-inject/sw 一致改指；程序化生成的 `icon-*.png` 保留且 URL 仍 200 | P-166 |
| 文档 | `docs/PATCHES.md`（逐条根因+判据台账）、`docs/BENCH-8902.md`、`docs/DATA-LIMITS.md`、本文件 | 各批 |

**发布前置读数**（本机实测，命令见第 1 节）：

| 闸门 | 读数 |
| --- | --- |
| `bash tests/run-all-tests.sh` | 116 项（见文末补记的下方一行"发布那一刻"读数） |
| `node tests/publish-check.mjs` | 无 blocking findings |
| `node tests/packaging-test.mjs` | 137 通过 / 0 失败 |
| `node tests/mount-test.mjs` | VERSION === package.json.version ✓ |
| `npm pack --dry-run` | 见第 3 节的 tarball 核对 |

**发布后验证**：第 3 节四条命令逐条跑过（`npm view` / 真下载 `npm pack` 核文件清单 / 干净目录安装后
`import` 出 `VERSION` 与 `mount` / 包里 8902 服务脚本语法可执行），结果记在本节下方的"发布那一刻读数"。

**已知边界**：见第 5 节（测试台不在 tarball 内、在线 demo 与包不是同一套文件、`VERSION` ≠ 页面 `#app-version`）。

### 事故与修复记录：0.2.0 的包**坏了**，0.2.1 修好（2026-09-20）

* **0.2.0（已弃用 `deprecated`）**：`import('wallpaper-engine-web-loader')` 直接
  `Cannot find module '…/core/we-particle-pointer.mjs'`。根因：`files` 白名单漏了 0.1.1 之后新增的三张源文件
  （`core/we-pointer-source.mjs`、`core/we-particle-pointer.mjs`、`server/pkg-entry-index.mjs`）——
  `core/` 是**逐文件**列白名单，不是整目录。**0.1.1 同法核过 = 0 条缺失**（那三张当时还不存在）⇒ 是 0.2.0 引入的回归。
  为什么老门禁没红：`packaging-test` 查的是"白名单里的路径存在"（反方向），`mount-test` 在仓库里跑（文件都在），
  `publish-check` 管许可/隐私/反向流动。**是第 3 节"装到干净目录再 import 一次"这一步抓出来的。**
* **0.2.1（修复版）**：`files` 补三条；新增 **`tests/pack-closure-test.mjs`**（12 断言）把这一类钉死：
  真打 tarball → 解开 → **在包内真 `import` 三个入口**（消费者视角）+ 两个服务入口 `PORT=0` 跑到 banner；
  再静态核对 import 闭包/URL 引用/死文件；**复现力自证**：从包里删掉一条被 import 的模块 ⇒ 必须失败。
  该测试已进全量门禁（116 → **117** 项）。
* **这一版学到的（写进流程）**：
  1. 第 3 节那句 `node -e "import('…')"` **不是可选项** —— 它是唯一能抓住"包缺文件"的一步；已提到第 3 节第 1 条。
  2. 发版前跑 `node tests/pack-closure-test.mjs`（秒级到十几秒），别只跑 `packaging-test`。
  3. `files` 是白名单 ⇒ **新增 `core/` 下的模块时，必须同步加白名单**；`pack-closure` 会替你把关。
* 0.2.0 的处理：**不 unpublish**（会破坏已装下游），用 `npm deprecate` 指向 0.2.1（已执行，`npm view …@0.2.0 deprecated` 能读到原因）。

### 0.2.1 发布后验证读数（2026-09-20 实测，命令即第 3 节）

| 检查 | 读数 |
| --- | --- |
| `npm view … dist-tags` / `@0.2.1 version` | `{ latest: '0.2.1' }` / `0.2.1`（发布后约 3 分钟才可见 —— registry 的"being processed"延迟，属正常） |
| 真下载 `npm pack …@0.2.1` | 156 个文件 / 2.44 MB |
| 三张此前缺失的模块 | `core/we-pointer-source.mjs` ✓ · `core/we-particle-pointer.mjs` ✓ · `server/pkg-entry-index.mjs` ✓ |
| 品牌图标 | `web/icons/brand-*.png` 4 条 ✓ |
| 干净目录 `npm i` + `import` | `LIB OK VERSION=0.2.1 mount=function parseScene=function` · `BUNDLE OK 204 导出` · `HLSL OK 2 导出` |
| `@0.2.0 deprecated` | 能读到原因文案（指向 0.2.1 与本文档） |
| git tag | `v0.2.1` 已推送 |

## 发布记录：0.3.0（2026-09-21 · 音频美术层不再被自家规则吞掉 + 跨平台静态门禁 + 导入白名单 + 测试台两批）

**为什么是 minor**：有**用户可见的行为变化**（音频响应型美术层从"被隐藏"变成"按作者意图显示"）、
一个新模块与新语义（导入文件的统一白名单/内容嗅探 ⇒ 415/413），以及测试台一批能力（渲染器页反代、属性面板/外壳修复）。
按 semver「加功能 = minor」取 **0.3.0**（0.x 阶段沿用本仓 0.2.0 的口径）。

| 面 | 内容 | 判据读数 |
| --- | --- | --- |
| **音频美术层**（P-170，`193ad99`） | 「我的音频条没有做出来」的真因是**我们自己的两条隐藏启发式**：`hideUI` 的名字正则含 `Audio\|音频\|Spectrum\|播放\|音量\|sound`；`hideBars` 关掉「父组纯色遮罩条」，而可视化条**自己就是** `models/util/solidlayer.json` 的实体遮罩层。新增 `audioArtIds(scene)`（名字命中音频美术词 **且** 有特效/粒子/作者绑定 ⇒ 豁免），两条启发式都查它；`?audioart=hide` 做对照。语料实测：`3544152633` 可见层 23→24、`3326873240` 29→30、`3719111841` 的 `音频线Audio Spectrum Visualizer` 可见；`Song Title`/`Play Icon`/`.mp3`/`MUSIC PLAYER` 仍隐藏 | `tests/scene-layer-baseline-test.mjs` **20 通过 / 0 失败 / 1 SKIP**（含读数确定性、语料缺失明确 SKIP、两条分辨力自证）；`tests/render-audit.mjs` 新增机读契约 `MPW-AUDIT-JSON` |
| **逐层基线夹具**（P-170） | `tests/fixtures/scene-layer-baseline.json` 钉住四条记录（自带样例 + 三个语料包）的逐层事实：可见层/带纹理可见层/蒙皮隐藏与命中/每帧 draw 数/音频美术层可见性/外壳层可见数（必须 0） | 同上（20 断言）；进全量门禁（121 → **122** 项） |
| **跨平台静态门禁**（P-169，`d3f7e31`） | 新增 `tests/cross-platform-gate-test.mjs`（18 断言）：代码里的本机绝对路径必须可覆盖、写死的 `'/tmp/…'` 判红（白名单逐条带理由 + 反查防腐烂）、打开器必须四平台齐（`xdg-open`/`open`/`explorer` + 环境覆盖口）、`.sh` 不许用 bash 4+ 特性、文件名可移植性、BOM/CRLF、11 条分辨力自证 | 18 通过 / 0 失败；进全量门禁（118 → 121 项） |
| **顺着它修的真问题** | `server/we-scene-demo-server.mjs` **11 处**写死 `/tmp` ⇒ `TMP_ROOT = process.env.MPW_TMP_ROOT \|\| os.tmpdir()`；`tests/` **8 个文件 13 处** `mkdtempSync('/tmp/…')`/默认输出路径 ⇒ `os.tmpdir()`；`:8902` 打开器候选链补 **Windows**（`explorer`，否则 Windows 上「打开文件夹」必回 501） | 门禁本身即判据；`:8902` 相关断言在 `bench-server-test` 内 |
| **导入白名单 + 内容嗅探**（`9a9165f`） | 新模块 `server/upload-policy.mjs`：`checkUpload({filename,buf,maxBytes})`（后缀 + magic 双判）、`sniffKind`/`sniffDanger`/`checkName`/`mimeForKind`、ISO-BMFF 品牌拆分（`m4a`=audio vs `isom`=video）；接进 `POST /api/props-file` ⇒ **415**（类型）/**413**（超限），并进 `package.json.files` | `tests/upload-policy-test.mjs` **46/0**；`bench-server-test` 的 E3b/E3c |
| **测试台（`:8902`）两批**（`c32018f` / `2021329` / `234e62e`） | ①`/webloader/**` 反向代理到渲染器页 ⇒ 8K 贴图壁纸不再只能看黑屏（`?id=3669681034`）；②外壳第三批 10 条（目录浏览器卡 `Reading…` 的根因是产物同元素 `onclick` 的模态 `prompt()` 阻塞主线程）；③属性面板 10 条（收起态切壁纸一行不刷、内部项隐藏名单、富文本只留颜色/换行/图/链接、数字统一解析、外链二次确认倒计时、列表 ID 分行） | `bench-server-test` 137 项、`bench-shell-fixes-test` **263/0**、`bench-ui-headless-test` **147/0**（无 X11 浏览器判定）、`demo-check` 132/0、`demo-syntax` 11/11 |

**发布前置读数**：`bash tests/run-all-tests.sh` ⇒ 全量 **122 项**（本轮收口跑，读数见下）；
`node tests/pack-closure-test.mjs` ⇒ 真打 tarball → 解开 → 包内 `import` 三个入口 + 两个服务入口；
`tools/` 下的冒烟与 `bench-ui-headless` 读数同上表。

**诚实清单**
1. 浏览器拿不到**系统声卡环回**：音频条的**电平**仍只有两个真实源（包内音轨 `?audio=1`、显式/已授权的麦克风），
   都没有 ⇒ 全 0 + `silent`（`window.__mpwAudioBandSource` / `__mpwAudioBandStats().silent` 可查，不假装有声音）；
   模拟源只在显式 `?bandfeed=sim`。本轮修的是"**显示**"这一半（层级可见性）。
2. 逐层基线夹具里的语料包在**本机没有语料**时明确 SKIP（不假装通过）；夹具是"当前形态"的快照，
   任何有意的渲染变化都要 `--update` 并复核（改数前先确认变化是有意的）。
3. `?audioart=hide` 只影响本插件/本仓的渲染配置，不改作者包里的 `visible` 数据。
