# `vendor/hlsl2glsl/` —— vendored 上游 HLSL→GLSL 转译器（**MIT**）

本目录是 **`oneincase/webwallgl`（MIT © 2026 oneincase）** 的两个文件的**逐字节副本**，用于
`docs/HLSL2GLSL-COVERAGE.md` §0 结论的**可复现门禁**（把"真实语料 112/114 = 98.2%"从文档里的数字
变成会变红的断言，见 `hlsl2glsl-coverage-test.mjs`）。依据：`docs/SIMILAR-PROJECTS-RESEARCH.md` §6.1 第 3 条
（"借上游实现，不重写"）与 `docs/COPYING-RULES.md` §2.1（MIT → GPL ✅，须保留 MIT 声明）。

## 1. 逐文件台账

| 本仓路径 | 上游路径 | 上游 blob（`origin/main`） | 字节 | 行数 | sha256 | SPDX |
|---|---|---|---|---|---|---|
| `hlsl2glsl.js` | `renderer/vendor/we-scene/render/hlsl2glsl.js` | `66efe02d2f25c2369decee0f92ed655a5855715b` | 93,531 | 1658 | `574fa82372bccc78efb12db958e31dc315bf9df2eac302be9e8982482293bc8f` | MIT |
| `hlsl-preprocessor.js` | `renderer/vendor/we-scene/render/hlsl-preprocessor.js` | `5544c1359a61c2ee5dd137b6ec1fa46b1a1ae65b` | 14,920 | 418 | `ced8a2ceaea4e0137dfc185b248529eaf8051ae61ad8f632fdc5084c941ec907` | MIT |
| `LICENSE` | `LICENSE` | （仓库根） | 1,085 | 21 | `857432ca4f48930e6079aca25164c27b791576ee2a7d3e3c9d6a92a089fe4948` | MIT |

- **来源仓库**：`oneincase/webwallgl`（本地检出 `../vendor-ref/webwallgl`，`origin/main`）
- **commit**：`fdfc578a577d0e680a9cfe2cf2e3e825d3cd2372`（1.3.23，2026-09-15 22:56:43 +0800）
- **引入日期**：2026-09-16
- **引入人**：渲染器侧（P-93）
- **进哪个仓库**：`we-scene-demo`（GPL-3.0-or-later）
- **处置**：**逐字节复制，未改一字**（`git diff origin/main -- <两个文件>` 为空 ⇒ 工作区副本 = 上游 blob）。
  署名与许可全文：`THIRD-PARTY.md` §7；台账：`docs/COPYING-RULES.md` §4 台账 #7。

## 2. 只 vendored 了这些，**没有** vendored 什么（边界）

| 上游文件 | 是否引入 | 理由 |
|---|---|---|
| `render/hlsl2glsl.js` | ✅ 是 | 转译器主体；只 `import` 同目录的 `hlsl-preprocessor.js`，**自足** |
| `render/hlsl-preprocessor.js` | ✅ 是 | 上者的唯一依赖（宏展开/`#if` 折叠/`splitArgs`） |
| `render/headers.ts` | ❌ 否 | include **解析器由调用方注入**（`hlsl2glsl(src, stage, combos, includeResolver, siblingSrc)` 第 4 参）；本仓用**自己的** `common*.h`（`docs/COMMON-HEADERS-REPLACEMENT.md`），不复制上游头表 |
| `render/quality.ts` | ❌ 否 | P-90 已声明：只对齐档位语义、**实现自写** |
| `renderer.js` / `renderer-glsl.js` / `shaders/**` | ❌ 否 | 与本次门禁无关；`renderer-glsl.js` 的 `FXAA_FRAG` 是**另一条独立登记**（台账 #6） |

## 3. 复现（本目录自证）

```bash
cd we-scene-demo
sha256sum vendor/hlsl2glsl/*.js vendor/hlsl2glsl/LICENSE     # 与上表逐行比对
node vendor/hlsl2glsl/hlsl2glsl.js 2>/dev/null; echo "rc=$?（无副作用：只定义函数）"
node hlsl2glsl-coverage-test.mjs                             # 覆盖率门禁（无语料时 SKIP，不红）
```

⚠ **本目录的代码按 MIT 分发**，但它是 `we-scene-demo`（GPL-3.0-or-later）的一部分：
再分发时**两份声明都要保留**（见 `THIRD-PARTY.md` §7 与本目录 `LICENSE`）。
