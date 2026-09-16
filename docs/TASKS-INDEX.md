# 任务索引（TASKS-INDEX）—— 三个并行会话的进度与交付物

> 为什么有这份文件：A（渲染器）/ B（插件）/ C（工具链）三会话并行，需要一处能看见"谁在做什么、
> 验收证据在哪、哪些文件归谁"。**规则**：每个会话只追加自己的行；文件所有权见每本任务书开头。
> 会话结束前更新本表；`docs-check.mjs` 会校验本文件引用的文件都存在。

## 0. 文件所有权（写冲突的唯一根源）
| 归属 | 文件 |
|---|---|
| 会话 A（渲染器） | `we-scene-demo/demo.html`、`core/we-scene-bundle.js`、`elysia/**`、`server/we-scene-demo-server.mjs` |
| 会话 B（插件） | `dsh-mpkg-wallpaper/**`（`lib/**`、`tools/**`、`package.json`、`icon.svg`） |
| 会话 C（工具链/文档） | `run-all-tests.sh`、`parity-check.mjs`、`report-audit.mjs`、`library-manifest.mjs`、`docs-check.mjs`、新增 `*-test.mjs`、`*.md`（追加式） |
| 主会话（整合） | 跨会话整合、编号/文档一致性修订、`PATCHES.md` 编号仲裁 |

## 1. 任务书与状态
| 任务书 | 会话 | 状态 | 关键交付物 | 验收证据 |
|---|---|---|---|---|
| `TASK-A-RENDERER.md`（W6–W12） | A | 已完成 | A1 hina（HDR 熔断 + 坏帧 v3）、A2 GirlCat 拉伸、A4 日月循环白屏、A3/A5 子网格+台账+`layerHealth` | `PATCHES.md` P-41…P-44；`mesh-badframe-test.mjs`（22 断言，门禁项 `mesh-badframe`） |
| `TASK-B-PLUGIN.md`（B1–B5） | B | 已完成 | 首帧看门狗+兜底、故障信号、调试参数白名单、低内存档、**`__mpwSceneUiBridge` 作用域修复（P0）** | `PATCHES.md` P-52；`tools/scene-watchdog-test.mjs`（39 断言） |
| `TASK-C-TOOLCHAIN.md`（C1–C6） | C | 已完成 | 平价基线、`known-issues.json`、`docs/RENDERER-ARCHITECTURE.md`、语料清单、门禁条件项、报告六段 | `PATCHES.md` P-51；门禁 **36/36** |
| `ZCODE-MERGED-5-RENDERER-DEEP.md` | 参考 | 参考 | W6–W12 细节 + R 系列（重写）硬门槛 | — |
| `ZCODE-MERGED-6-PARALLEL-TRACKS.md` | 参考 | 参考 | 并行调度与所有权规则 | — |
| `PROMPT-B.md` | B | 未发（B 已自行完成） | 现成 Prompt（含 B6 沙箱+场景 token 安全项） | — |

## 2. 门禁现状（本文件更新时的基线）
- 渲染器：`bash we-scene-demo/run-all-tests.sh` → **37 项**（含条件项：无真机数据自动 SKIP）。
- 插件：`bash dsh-mpkg-wallpaper/tools/check.sh` → **5 步全通过**（新增第 5 步 B6：客户端 23 断言 + 宿主 18 断言）。
- 文档一致性：`node we-scene-demo/docs-check.mjs`（P 编号健康 / 任务书引用 / diag 开关 68==68）。
- **运行器健壮性（P-53，主会话整合修）**：单项超时 `ITEM_TIMEOUT`（默认 600s，超时→该项 FAIL 并回收进程组）；
  输出改临时文件捕获，修掉"泄漏子进程持有 `$(...)` 管道 → 整条门禁静默挂死"（实测曾挂 20 分钟零输出）。
- **B6 沙箱（契约 `RENDERER-SANDBOX-CONTRACT.md`）**：去 `allow-same-origin` + 场景级 30 分钟 token；
  激活需**宿主重启一次**（token 路由属宿主代码），之前插件自动停在 legacy。

## 3. 待办（跨会话）
| # | 事项 | 归属 | 前置/备注 |
|---|---|---|---|
| 1 | 真机复验：hina 非白、GirlCat 比例、日月循环 morning、标题栏磨砂、导航图标 | 用户 + 主会话 | 刷新浏览器即生效（client 侧） |
| 2 | 宿主侧改动生效需**重启 dsh 一次**（`/custom-scene-thumb`、信标路由当前 401；看门狗已优雅降级） | 用户 | 不重启则缩略图缓存/完整看门狗不可用 |
| 3 | ~~B6 渲染器沙箱化 + 场景级短期 token~~ **已完成**（批次18 / P-54） | 主会话整合 | 两侧代码 + 回归测试齐；**激活需宿主重启一次**，之前自动 legacy |
| 4 | 层树面板（页内点选层/子块）与 `?texbudget` 时间预算 | A | A 报告"时间所限未做" |
| 5 | `?att=legacy` 退场 | B + 用户确认 | **按预案前置条件未满足不能删**：`archive/LEGACY.md` 要求"真机连续 2 次验收、间隔 ≥1 周"，本轮不动 |
| 6 | mpkg 场景 parity 对账需插件 diag 带场景身份 | B → C | 插件侧**已具备**（diag `sandbox.last.ident`、`renderer-iframe` 事件带 ident、`mpw-cap.sceneId`）；消费端（parity-check 读 reports）待 C |
| 7 | 重启后真机复验 B6：壁纸照常出画 + 缩略图缓存仍写入 + `?mpwdiag=1` 里 `sandbox.mode=strict` | 用户 + 主会话 | 若黑屏/异常，插件 8s 内自动回退 legacy 并落 diag `scene-sandbox/strict-fallback` |
