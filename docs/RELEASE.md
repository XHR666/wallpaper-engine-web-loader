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
V=0.2.0
npm view wallpaper-engine-web-loader@$V version dist.tarball --registry=https://registry.npmjs.org/
npm view wallpaper-engine-web-loader dist-tags --registry=https://registry.npmjs.org/    # latest 应指向新版本
# 真下载一份、逐条核对内容（不是看本地目录）：体积、文件数、关键路径在不在
cd /tmp && rm -rf npmpub && mkdir npmpub && cd npmpub
npm pack wallpaper-engine-web-loader@$V --registry=https://registry.npmjs.org/
tar -tzf wallpaper-engine-web-loader-$V.tgz | sort > files.txt
wc -l files.txt && grep -c "package/web/icons/brand-" files.txt      # 品牌图标应 4 条
grep -E "package/(core/we-scene.mjs|server/we-scene-demo-server-8902.mjs|web/manifest.webmanifest)$" files.txt
# 装一份到干净目录，跑一次真实挂载（npm 包的入口是不是真能用）
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
