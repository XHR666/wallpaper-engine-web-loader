#!/bin/bash
# run-all-tests.sh — we-scene-demo 全量门禁一键回归（MERGED-2 第 4 项 I；任务书 C5.1 条件项机制）
# 用法: bash run-all-tests.sh [--fast] [--json] [--list] [--only <name> ...]
#   --fast        跳过最慢项（package-matrix --check、perf-profile 冒烟、layer-rect-check、parity-check）
#   --json        末尾追加机读 JSON 汇总
#   --list        列出全部测试项（标注 slow/条件项）后退出
#   --only <name> 只跑指定项（名字见 --list；未知名字报错退出 2）
#   ITEM_TIMEOUT  环境变量：单项超时秒数（默认 600）。超时按 FAIL 计并回收该项进程组，
#                 避免单项挂死把整条门禁静默拖住（曾发生：runner 阻塞在 pipe_read 20 分钟无输出）。
# 条件项（无数据自动 SKIP，不红）：工具自身输出 "SKIP <name>" 且退出 0 时按 SKIP 计（如 parity-check
#   在 reports/ 无含 layerLedger 的上报时）。本地无真机数据时门禁仍应全绿。
# 退出码：全绿/SKIP 0；有失败 1；用法错误 2（失败项最后 20 行见 /tmp/run-all-tests-last.log）
# ①(2026-09-16 目录整理) 本脚本住在 tests/，但**所有测试项的名称都相对仓库根**：
#   `cd` 到仓库根（不是脚本目录）⇒ 子进程拿到的相对路径与收拢前逐字一致，69 个测试项无需改命令。
cd "$(dirname "$0")/.." || exit 2
# ①(第16项 去个人化) 供子进程使用的根目录/测试包路径：环境变量可覆盖，默认值等价旧行为
export MPW_REPO_ROOT="${MPW_REPO_ROOT:-$PWD}"   # ②(2026-09-16) 仓库根（cd 已在此）
# ③(2026-09-16 修回归) **MPW_ROOT 的语义是"工作区根"**（本仓库既有口径）：`$MPW_ROOT/allwallpaper`、
#   `$MPW_ROOT/wallpaper_engine/assets` 都从它解析 ⇒ 它是**仓库的上一级**，不是仓库本身。
#   我在目录整理时曾把它写成 `$PWD`（仓库根）⇒ 所有依赖语料/WE 资产的用例集体变红（真包类 30+ 项）。
#   现已恢复原语义（与收拢前 `$(cd .. && pwd)` 逐字等价）。
export MPW_ROOT="${MPW_ROOT:-$(cd .. && pwd)}"
export MPW_PERF_PKG="${MPW_PERF_PKG:-$HOME/.dsh-mpkg-wallpaper/d5007a52866682e2210d9d855d170c80.mpkg}"

FAST=0; JSON=0; LIST=0; ONLY=()
while [ $# -gt 0 ]; do
  case "$1" in
    --fast) FAST=1;;
    --json) JSON=1;;
    --list) LIST=1;;
    --only) shift; while [ $# -gt 0 ] && ! [[ "$1" == --* ]]; do ONLY+=("$1"); shift; done; continue;;
    *) echo "未知参数 $1（用法见文件头）"; exit 2;;
  esac
  shift
done

declare -a NAMES CMDS SLOWPAT SKIPPAT
# add <name> <cmd> [slow] [skip-pattern]
#   slow=slow       → --fast 跳过
#   skip-pattern    → 退出 0 且输出匹配该模式时按 SKIP 计（条件项"无数据不红"）
add() { NAMES+=("$1"); CMDS+=("$2"); SLOWPAT+=("${3:-}"); SKIPPAT+=("${4:-}"); }

# —— 语法/静态 ——
add "bundle-syntax"      "node --check core/we-scene-bundle.js"
add "demo-syntax"        "node tests/demo-syntax-check.mjs"
# ①(P-70b 2026-09-15) **把它排到重项之前**：单独跑 4.9s，但排在 `tex-fmt5`(45s)/`package-matrix`(38–52s)
#   之后时会因内存压力（本机 15G、free 0）换页抖动到 >600s 被超时中止 —— 实测 120× 慢、
#   单独复跑永远绿、`--out` 换新目录也绿（所以**不是** P-70 的唯一临时目录导致的）。
#   排到最前面 = 在最干净的内存状态下跑，flake 消失；顺序变化不影响任何判定。
add "visual-diff-kal"    "node tests/visual-diff-kal.mjs"   # P-79：包一层"以成功标记为判定"的包装器 —— 直接跑 visual-diff 时本机约 1/6 次
#   在打印 `✓ --check：与基线一致` 之后**不退出**（进程停在 futex，无子进程；已排除磁盘/内存/线程池/退出钩子），
#   被 timeout 判 rc=124 → 假红。包装器只在**见到显式成功标记**时按成功收尾并打印 ⚠，未见标记一律如实上报子进程 rc。
add "script-origin-sync" "node tests/script-origin-sync-test.mjs"
add "text-script-props"  "node tests/text-script-props-test.mjs"
add "script-owner-live"  "node tests/script-owner-live-test.mjs"  # P-60：脚本宿主 thisLayer/thisObject 错绑回归（首属性捕获"编译那一刻"的 ref.current = 上一个脚本节点的层；真机 3554161528 时钟层 id398 origin 被 id1592 改写 2833,1379；11 断言；~0.5s）
add "script-api-corpus"  "node tests/script-corpus-audit.mjs --strict"
add "media-host"         "node tests/media-host-test.mjs" "" "^SKIP media-host"  # P-62：媒体集成 + 音频响应宿主（官方 5 个 media*Changed 回调 / registerAudioBuffers 同一对象原地更新 / 封面 URL+字节两形态 / 歌词 LRC 解析+二分 / dispatchScriptEvent 多条目广播且 thisLayer 不串层＝P-60 防回归；真包 3554161528+3544152633+3660962877；109 断言；~0.9s）。①(P-87) 真包只从本机语料取（仓库内 samples/wallpapers 已因版权整体移除）⇒ 缺语料时**整体 SKIP**，门禁不红
add "internal-shaders"   "node tests/internal-shader-validate.mjs"
add "glsl-validate"      "node tests/glsl-validate.mjs"
# —— 渲染器语义套件（mock-GL / 纯 JS）——
add "mock-gl"            "node tests/mock-gl-test.mjs"
add "sprite-sheet"       "node tests/sprite-sheet-test.mjs"
add "particle-sprite"    "node tests/particle-sprite-verify.mjs"
add "text-layout"        "node tests/text-layout-test.mjs"
add "bloom"              "node tests/bloom-verify.mjs"
add "script-tolerance"   "node tests/script-tolerance-test.mjs"
add "frame-map"          "node tests/frame-map-verify.mjs"
add "tex-fmt5"           "node tests/tex-fmt5-test.mjs"
add "video-quality"      "node tests/video-quality-test.mjs"     # P-68：用户第20项 MP4 画质（?res= 档位 720p/1080p/1440p/2160p 默认 1080p、?res=720p|legacy 与改动前逐值对拍、视频上传上限/直传/imageSmoothingQuality=high/可配节流、videoStats 台账、?perf=auto 高分辨率档抑制 fboCap、脚本 __videoPlay 读取点；148 断言；~2.5s）
add "jpeg-decode"        "node tests/jpeg-decode-test.mjs" "" "^SKIP jpeg-decode"  # P-67：自带 baseline JPEG 解码器（FF00 填充丢数据字节=根因 / DRI+RSTn 跳过并复位 DC 预测器 / 4:2:0·4:2:2·4:4:4 / 截断必须抛错不许静默半张图）；3 份真机截图（ffmpeg 对照常量）+ 6 个内嵌合成向量 + 2 张真 FIF=JPEG 贴图；104 断言；~3s；真机截图缺失时 SKIP
add "alignment"          "node tests/alignment-test.mjs"
# ①(P-91 2026-09-16) 洁净室重写验收：alpha 量纲归一化 + alignment token→偏移 两个 helper 在
#   `docs/WER-REF-LICENSE-AUDIT.md` §3.4 被判「逐行翻译 / 同源改写」，已按行为规格
#   `docs/IMAGE-ALPHA-ALIGN-SPEC.md` 重写（命名/结构/常量表达/返回风格全改，行为逐位不变）。
#   四层断言：冻结真值表（期望值=改前实现实测输出）/ 边界与幂等 / 与改前实现逐位对拍（Object.is）
#   + 源码守卫（旧标识符与 `/= 100` 已消失）/ 6 个真包全部原始输入与 parseScene 接线。
#   **1008 断言**；~2.4s；缺真包语料时整体 SKIP 不红。
add "clean-room-alpha"   "node tests/clean-room-alpha-align-test.mjs" "" "^SKIP clean-room-alpha"
# ①(P-100-R1 2026-09-16) 洁净室重写验收：**R1** = `src/render/effects.js` 节（CPU 效果链：混合模式/HSL/
#   像素颜色效果/位移/waterflow）。改前自述「逐行翻译自 WE shader 原文」（另有 3 处自认 + 12 处上游
#   `文件:行号` 引注；原件是 **WE 专有**资产，与 P-95 的 wer-ref 轴无关），已按行为规格
#   `docs/EFFECTS-COMPUTE-SPEC.md` 重写（命名/控制流/常量表达/注释全改，行为**逐位不变**）。
#   六层断言：冻结真值 digest（5 个函数的改前实测输出，FNV-1a 64 over IEEE-754 位模式）/
#   207 条冻结抽样值 Object.is 逐值对拍（含"调用后入参状态"，锁住原地改写契约）/ 规格性质（同义 id、
#   交换操作数、opacity 无关族、区间界、HSL 往返恒等）/ 契约（返回数组身份、未知 type 跳过、
#   非可迭代输入抛 TypeError）/ 源码守卫（旧名·上游同名回响·引注·自认措辞归零）/ 血缘复测阈值。
#   **312 断言**；实测 ~3.6s（门禁内 ~5.9s，含血缘指标的全量 LCS；缺 WE 资产时该层 SKIP）。
#   语料见 `tests/effects-corpus.mjs`（全自造合成贴图，无真机壁纸数据）。
add "clean-room-effects-blend" "node tests/clean-room-effects-blend-test.mjs" "" "^SKIP clean-room-effects-blend"
add "attach-transform"   "node tests/attach-transform-test.mjs"
add "multi-sprite"       "node tests/multi-sprite-test.mjs"
add "audio-semantics"    "node tests/audio-semantics-test.mjs"
add "camera-fillmode"    "node tests/camera-fillmode-test.mjs"
add "camera-node"        "node tests/camera-node-test.mjs"
add "blink-phase"        "node tests/blink-phase-test.mjs"
add "hdr-bloom"          "node tests/hdr-bloom-test.mjs"
add "render-closeout"    "node tests/render-closeout-test.mjs"
add "tex-upload-guard"   "node tests/tex-upload-guard-test.mjs"
add "mesh-badframe"      "node tests/mesh-badframe-test.mjs"      # A 会话新增（W6 帧采样守卫），C 注册
add "sandbox-cors"       "node tests/sandbox-cors-test.mjs"       # B6：:8899 的 CORS/预检（不透明源下渲染器自身 fetch 也变跨源）
# ①(P-88 2026-09-15 用户点名「一键连拍上报截图」)：真子进程服务收**原始图片字节**（真 JPEG 向量往返：字节逐字节相同
#   /index.jsonl 台账字段/415·413·400 三条反面用例 + shots 每 id 400 帧滚动与 /report 60 份互不影响）+
#   📸 连拍按钮/j·J 快捷键源码守卫（挂 #bar、__mpwSafeDataURL 读回、原分辨率仅 >1920 缩、进度文案、
#   帧末取样且无 setInterval 调用、无新增 ?flag 开关）+ shotScale·shotDue 纯函数边界；**51 断言**；~0.5s
add "shot-upload"        "node tests/shot-upload-test.mjs"
add "time-variation"     "node tests/time-variation-test.mjs"     # P-55：日月循环（属性转发/getVideoTexture/day 豁免/?time/?hour/mpw-ln-key；~0.6s，TZ 子进程钉死）
add "particle-presets"   "node tests/particle-preset-fallback-test.mjs"  # P-56 Q5：粒子默认开 + 官方预设 basename 兜底（118 条索引同步/25 ref 候选链/真实 bundle 建系+模拟；~1.2s）
add "p74-particles"      "node tests/p74-instanceoverride-test.mjs"  # P-74：instanceoverride 9 字段（size 倍率/count→发射率/rate→仿真时钟/colorn 替换/color 字节色）+ quad 边长=size/2（真顶点流 official:legacy = 2.0000）+ velocityrandom y 与 gravity 同口径（下落层平均 y 位移方向 ±75px/帧）+ 效果链 FBO 尺寸 0×0 哨兵回归（cat 603×389）；60 断言；~7s
add "log-panel"          "node tests/log-panel-collapse-test.mjs"  # P-56 Q8：8899 底部日志区收纳（假 DOM 驱动真实内联脚本；~0.2s）
add "p76-parallax-eye"   "node tests/p76-parallax-eye-test.mjs"  # P-76：①对象级视差位移被 mat4Scale 后乘放大（0.386px→1639.4px ⇒ 真机台账 rd x0=1430 应 −209、每帧【帧N】左缘=页面灰、背景整层被推下屏）+ parallaxOff 不门控对象级项；②?eyehack 在蒙皮路径覆写 layer.scale（0.693→1 ⇒ 眼睛网格 1.4431 倍、右移 260.6px）；追加A ③?bones= 逐骨探针补 det/镜像通道（角度分不出镜像）；追加B ④volume 无落点不接 + zoom 绑定接通（?props=newproperty30=1.6 ⇒ 投影 ×1.6000，默认逐位不变）；P-80 ⑤?bones= 会话累计极值 ext/dty/dang + 眨眼事件 blinks(±5 帧片段)/summary + ?blinkty= 阈值。mock-GL 走真实 renderScene/compositeLayer 六态对拍 + 官方标定 refrender 对账；111 断言；~5s
add "camera-pose"        "node tests/camera-pose-test.mjs"  # P-81：相机层姿态完整接（`camPose` 过去从未交给 `buildCamera` ⇒ origin/zoom 关键帧动画在真实路径从未生效）。三档真值表（full 缺省 / legacy = P-76 行为 / off = 逐位回到 P-76 前，非法值→full）；hina 3554161528 是语料里唯一有相机层动画的包：t=0 人物 w=4215（×3.00 镜头）、t=1 w=3705（×2.64）；legacy/off 逐位相同且复现改动前取景；凯尔希（无相机对象）三档逐位相同；砂狼白子脚本 origin 的快照默认不施加（`?cam=node` 才是那个 A/B，实测 −2434px）；fov 在正交渲染器无落点（逐位回归）。26 断言；~2s
add "charfit-camera"    "node tests/charfit-camera-test.mjs"  # P-100：用户真机实测「入场动画把人物固定在屏幕中间、去移动背景」 —— 根因 = ①真机默认路径的**蒙皮层不接相机**（旧 `MESH_VS` 只按设计画布 1:1 映射 ⇒ 相机层 origin/zoom 关键帧带不动 puppet，背景/钢琴/花朵却跟着镜头走）+ ②`?skin0`/无蒙皮路径的「角色层自动适配」把超屏角色 origin 改写成画布中心。修：`MESH_VS` 新增 `u_View/u_Framed`（**以画布中心为缩放基准**，与四边形层 `viewProj` 同式，配准实测 ≤6.4e-4px）+ 适配收窄为「有相机层 ⇒ 不适配，无相机层且超屏才兜底」；回退 `?charfit=auto|off|legacy`（legacy = 逐位回到改动前）。真包 hina 5 时间点矩形 × 三档 + 凯尔希兜底保留 + uniform 级 + 源码守卫；46 断言；~1.5s
add "quality-tiers"      "node tests/quality-tiers-test.mjs"  # P-90：质量档位 `?q`（内部渲染 0.5/0.75/1×，off=关闭离屏路径）+ `?aa`（off/fxaa/msaa2/msaa4；MSAA 不可用或 q!=off 时**回落 FXAA 并记日志**）+ `?pp`（off/low/medium/high，照上游 POST_FBO_CAP；off 门控图层效果链+Bloom），FXAA 片元着色器借自 oneincase/webwallgl（MIT，已署名）。六组断言：真值表（非法/空值/大小写/共存/pp=0 旧义）/ 默认档逐位相同（GL 调用序列与显式默认逐项相等、零额外 FBO·纹理·draw、逐层 rect·mvp 一致）/ 各档确有差异（q=low 内部 1280×720→640×360、pp=off 51→25 draw）/ FXAA 真在链里（帧末 1 次全屏 draw、懒编译、帧内幂等）/ 热更（setQuality 不重挂载、下一帧生效、msaa 档如实报"需刷新"）/ 与 `?res`·`?nofx`·`?perf` 组合不冲突。90 断言；~4s；缺夹具整体 SKIP 不红
add "fullscreen-recenter" "node tests/fullscreen-recenter-test.mjs"  # P-57 N1+N2：近整屏层兜底按 alignment 判据/放锚点（3660962877 真实值；~0.1s）
add "animation-badframe" "node tests/animation-badframe-test.mjs" "" "^SKIP animation-badframe"  # P-57 N3：多 additive 层按动画好帧表+跨坏帧插值（真包 3544152633 复刻合成+蒙皮，位移 ≤50；~0.3s；缺包 SKIP）
add "mdla-walk"          "node tests/mdla-walk-test.mjs" "" "^SKIP mdla-walk"  # P-57 N4：MDLA 记录游走修 id/name + fps 解析（帧数据新旧逐位一致；~0.2s；缺包 SKIP）
add "text-switches"      "node tests/text-switches-test.mjs" "" "^SKIP text-switches"  # P-57 N5：四类文本开关（showclock/showdate/showweekday/showfps 默认口径 + showui 优先 + 时段层豁免 + 真包 6→17 计数）+ embed=1 收起日志（~0.2s）
add "script-tick"        "node tests/script-tick-test.mjs"       # P-57 N7：真实 frametime + 文本/时钟/帧率脚本 ≥30Hz（语料真实 FPS 脚本实测 60Hz→"fps: 60" / 4Hz→"fps: 4"；~3.4s）
add "audio-panel"        "node tests/audio-panel-test.mjs"       # P-57 N6：🔊 音频面板（切真实区块 + 假 DOM/假包：枚举去重/magic MIME/播放暂停/下载/localStorage/__mpwAudio 预留位；~0.1s）
add "audio-real-pkg"     "node tests/audio-panel-real-test.mjs" "" "^SKIP audio-real-pkg"  # P-57 N6：真实包音轨枚举（凯尔希 3719111841 的 4 条 MP3；~1.2s；缺包 SKIP）
add "hdr-predicate"      "node tests/hdr-predicate-test.mjs"    # P-58 H0：自动 HDR 判据真值表（hdr×bloom×?hdr=0/1×会话熔断）+ hina/3778592720 真实 general（~0.3s）
add "meshsize"           "node tests/meshsize-test.mjs"          # P-58 H1：?meshsize 网格 scale/origin 算术（真包 3719111841 + 官方标定 refrender 对账 + crop 位移；~1.5s）
# —— 真实包审计 ——
add "render-audit-kal"   "node tests/render-audit.mjs 3719111841"
add "skin-order-kal"     "node tests/skin-order-verify.mjs 3719111841 主体"
add "layer-rect-kal"     "node tests/layer-rect-check.mjs 3719111841 --refrender" "slow"
# —— 质量门禁 / 矩阵 ——
add "package-matrix"     "node tests/package-matrix.mjs --check" "slow"
add "panel-smoke"        "node \"$MPW_ROOT/dsh-mpkg-wallpaper/tools/panel-smoke.mjs\""
add "props-panel"        "node tests/props-panel-test.mjs" "" "^SKIP props-panel"  # P-61：官方属性面板（真包 hina 3554161528 的 35 条 general.properties 通用渲染：计数+order/condition 门控与"不生效"/绑定生效/combo 脚本属性/持久化/URL ?props= 优先/N5 不打架/装载块真源码切片；106 断言；~0.25s）。①(P-87) 真包只从本机语料取（仓库内 samples/wallpapers 已因版权整体移除）⇒ 缺语料时**整体 SKIP**，门禁不红
add "project-json"       "node tests/project-json-test.mjs"        # P-85：官方 project.json 查找链（core/scene-project-json.mjs）+ 服务端契约：5 档顺序/逐档降级/坏 JSON 不致命（10）+ 6 真包非空与 we-workshop 隔离可达（18）+ 白子 4 个 Clock 变体默认属性下恰 1 个可见（id639）与"秒"可见、缺失全可见对照（6）+ hina 绑定引用完整性（2）+ 优雅降级（2）+ 子进程起服务验 /project 200+x-project-source+404（5）；43 断言；~0.7s
add "perf-profile-smoke" "node tests/perf-profile.mjs --pkg \"$MPW_PERF_PKG\"" "slow"
add "projection-y"       "node tests/projection-y-test.mjs"       # P-69：相机投影 y 轴口径（真值表 世界y0→NDC+1 / fix↔legacy 互镜 / 真包 3554161528 花朵落点 1640.55 vs legacy 519.45 + 钢琴对照 54px）+ 粒子 incr 缓存不变量（首帧与 replay 逐位同、第二帧粒子更新次数 ≥20× 下降）；34 断言；~2s
add "multi-instance"     "node tests/multi-instance-test.mjs"    # P-77 用户第 4 项「一页多实例」：无 ?ids= 时单实例逐位不变（红线）/ ids 解析(非法·去重·顺序) / maxinst 超出不建上下文+占位原因 / 同一时刻仅一个 active 且未选中 0 帧(桩 rAF) / dispose→loseContext+摘除(桩上下文计数回落) / 一帧至多 1 active / 报告 instances 键（单实例无·多实例全）/ 预算降档 / 布局与 instlog + **真接线动态跑**（切 demo.html 的多实例接线块 + 桩 bootInstance）；87 断言；~0.3s（纯 Node：桩 DOM+rAF+boot）
add "canvas-size"        "node tests/canvas-size-test.mjs" "" "^SKIP canvas-size"  # P-78 追加任务：engine.canvasSize 口径（默认仍=渲染分辨率⇒逐位不变；?csz=ortho 为 A/B）。真包 3327063360+真机 userProps 复现：**两种口径都在画布内** ⇒ 证伪"口径导致 12 层不上屏"；11 断言；~0.9s；缺真包 SKIP
add "text-font-fallback" "node tests/text-font-fallback-test.mjs" "" "^SKIP text-font-fallback"  # P-81 用户第 1 项最后缺口：文本字体**三级来源链**（①包内 → ②本机 WE 安装目录 /weassist/fonts/<basename> → ③sans-serif）。纯函数节选 + 桩 fetch/Blob/FontFace：包内有⇒fetch 0 次（绝不走第二级）/ 空格·CJK basename 编码 / 404·reject·空体都不抛异常且落第三级 / missing 去重 + **调用点也认 missing**（否则缺字体的层永不渲染）；真包 3554161528 时钟层 id398（包内无 Monofur）复现 + 千图马克层走第一级；45 断言；~0.2s；缺真包 SKIP
# ①(P-102 2026-09-16 第 10 条·移植项) 帧几何：宿主 iframe 形态下的"窗口坐标 → 帧内 client 像素"与
#   "内容比例 ≠ 舞台比例时的覆盖式视口"。**规格先行**（docs/WEB-FRAME-GEOMETRY-SPEC.md，只写公开契约）
#   → 按规格新写 core/web-frame-geometry.mjs（参照 oneincase/webwallgl MIT 的 renderer/src/web.ts 的
#   **行为契约**，未复制代码；差异清单见规格 §6，台账 docs/COPYING-RULES.md §4 #9）。50 断言；~0.05s
add "web-frame-geometry" "node tests/web-frame-geometry-test.mjs"
# ①(P-103 2026-09-16 第 10 条·移植项) 音频频段契约：128 元数组（左 0..63 + 右 64..127）/ 0..1 钳位 /
#   γ 对比扩展曲线（"频谱要尖"）/ 确定性纯函数模拟源 / bandStats 诊断。规格先行（docs/AUDIO-BAND-SPEC.md）
#   → 按规格新写 core/audio-band-array.mjs（参照 oneincase/webwallgl MIT 的 renderer/src/web.ts 的
#   **行为契约**，未复制代码；差异见规格 §5，台账 docs/COPYING-RULES.md §4 #10）。35 断言；~0.05s
add "audio-band-array"   "node tests/audio-band-array-test.mjs"
add "diag-flags"         "node tests/diag-flag-check.mjs"
# —— C 会话新增：文档一致性 + 平价基线（条件项）——
add "docs-check"         "node tests/docs-check.mjs"
add "parity-check"       "node tests/parity-check.mjs" "slow" "^SKIP parity-check"
# —— ①(P-91/P-92/P-93 分发与可见性线) 分发形态 / 离线 PWA / hlsl2glsl 覆盖率 ——
#   `docs/SIMILAR-PROJECTS-RESEARCH.md` §6.1 第 1、3 条 + §6.3 的 P0/P1 完成判据落地后的回归项。
add "mount"              "node tests/mount-test.mjs"     # P-91：库入口 `mount(container, opts)` 的对外契约（容器/画布口径/帧序=demo.html 逐条一致/生命周期/DI 注入点/健壮性）；40 断言；~0.3s（桩 renderer+rAF，不需要真 GL）
add "pwa"                "node tests/pwa-test.mjs"       # P-92：离线 PWA —— 缓存判据**绝不缓存用户壁纸**（正面 16/反面 21/响应 10 条）+ manifest 与图标尺寸自洽 + sw.js 预缓存清单无用户端点 + 注入开关默认关/幂等/缺 </head> 不吞页面 + 真子进程服务验 6 条静态路由与首页注入是纯增量；107 断言；~1s
add "packaging"          "node tests/packaging-test.mjs" # P-91：可分发形态自证 —— package.json 契约（license 与 LICENSE 一致、exports 每条存在）+ files 白名单（运行所需全覆盖/本机数据全排除）+ `npm pack --dry-run` 体积 + **真打包解包后 grep 个人绝对路径 0 命中** + start-demo.sh 真起服务 200 + check.sh 汇总口径；122 断言；~9s（两次 npm pack）
add "hlsl2glsl-coverage" "node tests/hlsl2glsl-coverage-test.mjs" "" "^SKIP hlsl2glsl-coverage"  # P-93：把 `docs/HLSL2GLSL-COVERAGE.md` §0 的 98.2% 变成**会变红的断言**（vendored 上游 MIT 转译器逐文件过语料：0 抛错 + 覆盖率下限 + 每个"可疑"都带原因；本机实测 45/46=97.8%，语料被裁剪时按子集下限并在输出里标明；`MPW_H2G_MIN_RATIO=0.999` 可自证会红）；~3s；无语料/无包解析器时 SKIP，门禁不红

# ——— ①(P-104 2026-09-17 发布纪律①②：**自动上报默认关** + 一切"自动落盘"都要有上限） ———
# 用户原话："像你这种测试用的自动上报的功能，这种你在上传仓库的时候要把它默认给关掉。"
#          "这种自动上报、自动把什么存储到本地的类型的东西，这种需要设置上限的，这上限别忘记了。"
# 38 断言 / 4 段：默认关真值表 + 真源码守卫（两条定时器只在 `if (autoReport)` 里）+ 手动按钮不被连坐
#   + 真服务空跑 3s reports/ 零新增；服务端上限（reports 60 份/64MB、selfcheck 40 份、shots 每 id 400 帧
#   /200MB + 全局 500MB，超限最旧先删 + 清理日志 + 启动清理一次 + 别人的产物不误删）；
#   渲染器 localStorage（键数/单值/总量 + LRU + 日志）；插件 diag-*.json（50 个/32MB + 客户端默认关）。
# ~6s（起 4 个真服务子进程；上限用 env 压到很小才能秒级验完清理路径）。上限唯一来源：docs/DATA-LIMITS.md
add "data-limits"        "node tests/data-limits-test.mjs"

# ——— ①(P-103 2026-09-17 粒子渲染正确性 · 用户第 12 条："你有一些粒子效果的渲染是有问题的，开源仓库里有方案"）———
# 注册位置：**追加在 `add` 列表末尾**（既有 74 项的 `add` 行号一字未动，只在其后顺延 2 行；
#   仓内 `run-all-tests.sh:91`/`:98-99` 两处历史引用都在本行之前，不受影响）。
# 33 断言 / 5 组：四档 official↔legacy **双向**（quad 图层变换 / 粒子自转 / exponent 非线性分布 /
#   发射器 speedmin-speedmax 初速）+ 真包语料（凯尔希 3719111841 Glass Shards·Bokeh Hex·尘埃、
#   hina 3554161528 落花、orb 3660962877 cherry blossoms）+ 仿真代价不回归（两档 simSteps/simUpdates 相等）。
#   真包缺失时内部 SKIP-视作-PASS（不红），与其余真包类条件项同口径。~30s。
add "particle-render-correctness" "node tests/particle-render-correctness-test.mjs"
add "camera-persp"       "node tests/camera-persp-test.mjs"       # P-107：**透视相机（fov）**落地 + `?projmode=persp|ortho|auto` 回退（UNTOUCHED-AREAS J 项"无样本"结案）。语料唯一非正交包 3509243656（3D 场景，`orthogonalprojection=null`，相机 origin "0 0 6"、fov 是"视场"滑块 newproperty71∈[40,65]）：auto ⇒ 节点锚定透视（fov50/相机 z=6）；透视律实测（Custom BG z=−50 与 Sun png z=−30 屏宽比 3.1072 = 预测值）；近层/远层同世界偏移屏距比 62.2×；fov 40→65 屏宽 ×1.519；面板滑块真的驱动 fov；**正交路径逐位不变**（冻结实现对拍 3 真包 × 3 档 + 合成包 5 档，全 `===`）；正交包强制透视时 z=0 平面 maxΔ=1.74e-4px（Float32 舍入）；mock-GL 真实 renderScene 里 mvp 的 w 行 = [0,0,−1,距离] 且三层 z 屏宽 6:3:2。57 断言；~6s

# ——— ①(P-109 2026-09-17 任务书 P1-4 · UNTOUCHED-AREAS D 项）———
# 注册位置：**追加在 `add` 列表末尾**（既有 add 行一字未动，只在其后顺延 1 行）。
# 56 断言 / 5 组：默认关逐位不变（把源码**反向变异成"去掉探针的旧写法"**再跑同一帧 ⇒ GL 调用序列逐条
#   相同）+ 分组正确性（探针台账 vs 独立复算：主影响骨/bbox/质心/影响骨表/父链；含"blendIndices[0]
#   分组会得到 13 组 ≠ 29 组"的区分力对照）+ 筛选语义（单骨/闭区间/`*` 后代/all 四种规格的**实绘索引集**
#   与独立期望逐位一致；三档 `?subtri=` 条数一致；空集筛选 0 次 draw）+ 台账字段与真动画判别力
#   （hina 三条 additive 层：位移时程/三角形变号计数非平凡）。真包缺失时内部 SKIP-视作-PASS。~40s。
add "submesh-probe"      "node tests/submesh-probe-test.mjs"

# ——— ①(P-109-BASELINE 2026-09-17 §5-⑨ 真机基线快照：FPS / 分位 / 启动 / 切换 / 显存代理）———
# 注册位置：**追加在 `add` 列表末尾**（既有 add 行号一字未动；仓内 `run-all-tests.sh:91`/`:98-99`/`:170`
#   三处历史引用都在本行之前，不受影响）。编号带 `-BASELINE` 后缀：并行会话的 P-109 已用在
#   `?submesh=` 子网格探针上（`docs/PATCHES.md` 的编号健康检查只要求"唯一 + 非降"，后缀与
#   `P-75b`/`P-100-R1` 是同一套写法 ⇒ 两节谁先写进 PATCHES 都不会让 docs-check 红）。
# 覆盖：分位/滚动窗口径逐值钉死 + 快照字段齐全与校验 + GL 代理计数（假 gl）+ 开关解析/三阶段切换/合并
#   + `tools/baseline-diff.mjs` 的阈值与环境变量覆盖与退出码 0/1/2 + 真子进程服务 `POST /baseline`
#   落盘与 400/405/上限滚动 + **默认关时零行为变化**（把 demo.html 的采集块真源码切出来，用桩 DOM/桩 gl
#   跑：不开参数 ⇒ 不包装 GL / 零日志 / 零请求；开了 ⇒ 真跑到点并把快照 POST 出去）。
#   ~2s（含一次真服务子进程）。**本机没有 GPU/WebGL2 ⇒ 本项只验工具链，不产出任何真机数字**。
add "baseline"           "node tests/baseline-test.mjs"

# ——— ①(2026-09-17 参考资料隔离护栏，依律师意见）———
# 断言对象：工作区根的 6 个第三方参考副本（归一后唯一内容落点 = `../references/**`）与取证归档
#   `../Delete/**`（如 `Delete/we-official-shaders/`）。律师要的不是"我们说过没引用"，而是
#   **可机器复核的"从未被引用 / 未进构建"**；本项把它变成 44 条断言（每条都带判别力自检）：
#   ① ref-import-free      全仓源码/测试/脚本中 import/require/readFile/fetch 的**实参位置**
#                          指向参考副本或归档目录 = **0 处**（注释/文档引注 **允许**，那是行为对照的写法）；
#   ② pack-and-site-clean  `npm pack --dry-run` 清单（144 个文件）与真跑 `build-pages.mjs --out <tmp>`
#                          的站点产物（189 个文件）中 = **0 个**来自上述目录；
#   ③ ignore-and-whitelist `.gitignore` 显式覆盖 `references/`、`Delete/` 与 6 个旧路径名，
#                          且 `package.json` 的 `files` 白名单一旦收录它们 → 立即变红；
#   ④ legacy-path-shim     工作区根的同名旧路径**只允许是符号链接**（解析到 `references/**`）——
#                          换回真实目录（内容回流）立即变红。旧路径必须保留可解析：历史取证命令
#                          `git -C …/wer-ref remote -v` 与 `docs-check` 的引用存在性校验都按旧路径走。
# 注册位置：**追加在 `add` 列表末尾**。~3s（含一次 npm pack 与一次站点构建，产物写 os.tmpdir()）。
# 详细口径与"若权利人联系"的处置指向：`docs/REFERENCE-ISOLATION.md`（工作区根 `docs/`）。
add "reference-isolation" "node tests/reference-isolation-check.mjs"

# ——— ①(P-110 2026-09-17 bind 世界链乘法顺序修正：UNTOUCHED-AREAS A 项"眉毛翻转"数值根因）———
# 注册位置：**追加在 `add` 列表末尾**（既有 add 行一字未动）。覆盖：TN1 链序恒等式（组成律 + 数据，
#   5 个蒙皮包逐骨）+ TN2 静止帧逐位不变（gBones=I 且蒙皮后顶点=原始顶点；改前/改后逐顶点对拍）
#   + TN3 `gBones` 组装顺序判据（`bindInv × m` 保枢轴距 / `m × bindInv` 不保；含 elysia 反例）
#   + TN4 全语料回归（hina/girl/凯尔希/0917×2 + 伊蕾娜无 puppet 对照：几何 bbox、层矩形、`?bones=`
#   台账、`?submesh=` 分组位移与翻转计数，改前 legacy vs 改后 default 逐包表）+ TN5 `?bindorder=legacy`
#   回退语义 + TN6 反向变异（把默认序改回父先乘 ⇒ 本测试必红）。mock-GL 驱动真 `renderMeshLayer`。~2s。
add "bind-order"         "node tests/bind-order-test.mjs"

# ——— ①(P-112-BANDGEOM 2026-09-17 任务书 §5 第 4 条 / P1-5：两个"写完但没接线"的模块接线验收）———
# 注册位置：**追加在 `add` 列表末尾**（既有 add 行一字未动，只在其后顺延 2 行）。
# 模块契约另有既有两项（`web-frame-geometry` 50 断言 / `audio-band-array` 35 断言）；这两项只验**接线**：
#   切 `demo.html` 的 MPW-BANDFEED / MPW-AUDIOBUFFERS / MPW-FRAMEGEOM 三个真源码块 + 内核的真导出，
#   注入桩（假 analyser / 假 video 元素 / 假 window.parent）跑真实分支；不碰 DOM/GPU/网络，~0.2s。
#   口径：`?bandfeed=`（128 元数组 → 场景层 `registerAudioBuffers` + 宿主消息）、
#   `?framegeom=`（帧盒三态 + 指针口径的祖先 transform 补偿）；**两项都缺省关**，且
#   "关 = 逐位不变"与"开 = 真的到达消费点"各自有独立断言（含 NaN 透传、零 postMessage 等边界）。
#   每项自带 **RED-IF-REVERTED**：把真源码切片改回旧行为 ⇒ 对应结论必须变红（绿色运行也打印 RED 行）。
#   接线说明/开关/实测数字/未定清单：`docs/AUDIO-BAND-WIRING.md`。
add "audio-band-wiring"  "node tests/audio-band-wiring-test.mjs"
add "frame-geometry-wiring" "node tests/web-frame-geometry-wiring-test.mjs"

# —— --list ——
if [ "$LIST" = 1 ]; then
  echo "共 ${#NAMES[@]} 项（slow=--fast 跳过；条件项=无数据自动 SKIP）："
  for i in "${!NAMES[@]}"; do
    tag=""
    [ -n "${SLOWPAT[$i]}" ] && tag="$tag slow"
    [ -n "${SKIPPAT[$i]}" ] && tag="$tag 条件项"
    echo "  ${NAMES[$i]}$tag"
  done
  exit 0
fi

# —— --only 过滤（保留选中项的 slow/条件项属性）——
if [ "${#ONLY[@]}" -gt 0 ]; then
  declare -a FNAMES FCMDS FSLOWPAT FSKIPPAT
  for want in "${ONLY[@]}"; do
    hit=-1
    for i in "${!NAMES[@]}"; do [ "${NAMES[$i]}" = "$want" ] && hit=$i; done
    if [ "$hit" = -1 ]; then echo "未知测试项：$want（可用项见 --list）"; exit 2; fi
    FNAMES+=("${NAMES[$hit]}"); FCMDS+=("${CMDS[$hit]}"); FSLOWPAT+=("${SLOWPAT[$hit]}"); FSKIPPAT+=("${SKIPPAT[$hit]}")
  done
  NAMES=("${FNAMES[@]}"); CMDS=("${FCMDS[@]}"); SLOWPAT=("${FSLOWPAT[@]}"); SKIPPAT=("${FSKIPPAT[@]}")
fi

PASS=0; FAIL=0; SKIP=0
declare -a RESULTS FAILNAMES
# ①(P-70 2026-09-15) **门禁互斥锁**：两个 run-all-tests 并发跑会互相抢 CPU/swap，把
#   `visual-diff-kal`（整条门禁里偶发挂到 600s 超时、单独跑 1.1s）、`time-variation`、
#   `package-matrix` 拖成**假红**，并共享 /tmp 临时产物互相踩。实证：本轮 P-64/P-65/P-67/P-68
#   四个会话各遇到一次，每次单独复跑都绿。这里用 mkdir 原子性做锁：拿不到就等待（最多 20 分钟），
#   超过 30 分钟的锁视为陈旧自动回收。`MPW_GATE_NOLOCK=1` 可显式跳过（逃生口）。
LOCKDIR=/tmp/.mpw-gate.lock
if [ "${MPW_GATE_NOLOCK:-0}" != "1" ]; then
  _waited=0
  while ! mkdir "$LOCKDIR" 2>/dev/null; do
    if [ -d "$LOCKDIR" ] && [ -n "$(find "$LOCKDIR" -maxdepth 0 -mmin +30 2>/dev/null)" ]; then
      echo "⚠ 发现超过 30 分钟的门禁锁（$LOCKDIR），按陈旧回收" >&2
      rmdir "$LOCKDIR" 2>/dev/null; continue
    fi
    if [ "$_waited" = 0 ]; then echo "⏳ 另一个 run-all-tests 正在运行 —— 等待它结束（最多 20 分钟；MPW_GATE_NOLOCK=1 可跳过）"; fi
    _waited=$((_waited+1))
    if [ "$_waited" -gt 240 ]; then echo "✗ 等待超时（20 分钟），另一个门禁仍未结束" >&2; exit 1; fi
    sleep 5
  done
  trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT INT TERM
fi
LASTLOG=/tmp/run-all-tests-last.log
# ①(P-70) 每次运行一个**唯一**的临时目录：`visual-diff-kal` 等的 --out 不再写死 /tmp/vd，
#   避免并发时互相覆盖产物（即便有锁，手工跑单项也可能并发）。
RUNID="$$-$(date +%s)"
RUNTMP="${TMPDIR:-/tmp}/mpw-gate-$RUNID"
mkdir -p "$RUNTMP"
# ①(P-70 修正) **必须真的导出**：`add` 里写的是 `${MPW_VD_OUT:-/tmp/vd}`，若这里不导出，
#   展开就永远回落到共享的 /tmp/vd —— 即"唯一临时目录"形同虚设（我第一版漏了这行，已补）。
export MPW_VD_OUT="$RUNTMP/vd"
LASTLOG_RUN="$RUNTMP/last.log"
ITEM_TIMEOUT="${ITEM_TIMEOUT:-600}"
: > "$LASTLOG"; : > "$LASTLOG_RUN"

for i in "${!NAMES[@]}"; do
  name="${NAMES[$i]}"; cmd="${CMDS[$i]}"
  # --fast：跳过标记为 slow 的项
  if [ "$FAST" = 1 ] && [ -n "${SLOWPAT[$i]}" ]; then
    RESULTS+=("SKIP"); SKIP=$((SKIP+1)); continue
  fi
  t0=$(date +%s.%N)
  # 输出写临时文件而不是 out=$(...)：$(...) 要求读到 EOF 才返回，若某项泄漏了继承管道写端的子进程，
  # runner 会永远阻塞在 pipe_read（整条门禁静默挂死，无任何输出）。写文件只等直接子进程，泄漏不影响。
  # 同时给单项加超时（timeout 默认按进程组回收），把"挂死"降级为"该项 FAIL + 明确报超时"。
  ITEMLOG=$(mktemp)
  rc=0
  timeout -k 5 "$ITEM_TIMEOUT" bash -c "$cmd" > "$ITEMLOG" 2>&1 || rc=$?
  t1=$(date +%s.%N); ms=$(echo "($t1-$t0)*1000" | bc 2>/dev/null | cut -d. -f1)
  if [ "$rc" -eq 0 ]; then
    # 条件项：退出 0 但输出匹配 SKIP 模式 → 计 SKIP（无数据不红）
    if [ -n "${SKIPPAT[$i]}" ] && head -3 "$ITEMLOG" | grep -qE "${SKIPPAT[$i]}"; then
      echo "SKIP $name (无数据，条件项)"
      RESULTS+=("SKIP"); SKIP=$((SKIP+1))
      echo "== SKIP $name" >> "$LASTLOG"; tail -3 "$ITEMLOG" >> "$LASTLOG"
    else
      echo "PASS $name (${ms}ms)"
      RESULTS+=("PASS"); PASS=$((PASS+1))
      echo "== PASS $name" >> "$LASTLOG"; tail -3 "$ITEMLOG" >> "$LASTLOG"
    fi
  else
    if [ "$rc" -eq 124 ]; then
      echo "FAIL $name (${ms}ms) — 超时 ${ITEM_TIMEOUT}s 被中止（可用 ITEM_TIMEOUT=<秒> 放宽）"
    else
      echo "FAIL $name (${ms}ms) — 退出码 $rc"
    fi
    RESULTS+=("FAIL"); FAIL=$((FAIL+1)); FAILNAMES+=("$name")
    echo "== FAIL $name (rc=$rc)" >> "$LASTLOG"; tail -20 "$ITEMLOG" >> "$LASTLOG"
  fi
  rm -f "$ITEMLOG"
done

echo "══ 汇总：PASS=$PASS FAIL=$FAIL SKIP=$SKIP / 总 ${#NAMES[@]} 项"
# ①(P-70) 本次运行的独立日志副本（并发行排障用；共享 LASTLOG 仍保留给既有习惯/文档）
cp -f "$LASTLOG" "$LASTLOG_RUN" 2>/dev/null || true
echo "（本次运行产物：$RUNTMP ；日志副本：$LASTLOG_RUN）"
if [ "$FAIL" -gt 0 ]; then
  echo "失败项（最后 20 行见 $LASTLOG）："
  for n in "${FAILNAMES[@]}"; do echo "  ✗ $n"; done
fi
if [ "$JSON" = 1 ]; then
  printf '{"pass":%d,"fail":%d,"skip":%d,"results":[' "$PASS" "$FAIL" "$SKIP"
  for i in "${!NAMES[@]}"; do
    printf '%s{"name":"%s","status":"%s"}' "$([ $i -gt 0 ] && echo ,)" "${NAMES[$i]}" "${RESULTS[$i]}"
  done
  printf ']}\n'
fi
[ "$FAIL" -eq 0 ] && exit 0 || exit 1

# 参照来源许可声明：本文件提到的 wer-ref/ 是第三方参考实现
# （Aromatic05/wallpaper-engine-renderer，GPL-2.0-only，非 WE 官方代码、非"真值源"），
# 与本项目（GPL-3.0-or-later）许可不兼容 —— 仅用于行为对照，不得复制代码/注释/常量组织。
# we-layerd-ref/（Aromatic05/we-layerd）无任何许可（保留所有权利），同样仅行为对照。
# 血缘自查结论见 docs/WER-REF-LICENSE-AUDIT.md。
