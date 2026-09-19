#!/bin/bash
# keep-servers.sh —— 三个本地服务（:8899 渲染器演示 / :8901 测试台静态 / :8902 统一测试台）的看门狗
#
# 为什么需要（2026-09-19 实测）：宿主机重启后，这几个 node 服务**会不明原因地周期性消失**
#   （12:19 起 :8899/:8901/:8902 各死过一次以上；`/tmp/8901.log` 只有启动 banner，dmesg 读不到 OOM
#    ⇒ 被外部杀掉，死因未确证，疑似 Android 后台/phantom 进程回收）。早先的 `keep-demo-server.sh`
#   只盯 :8899 且没常驻 ⇒ 表现为"刚才还 200，过一会儿全 000"，浪费排查时间。
#
# 用法：作为**受管后台作业**跑（不要用 setsid nohup，重启后会被回收 —— 见 OPERATING-LESSONS L-07/L-24）：
#   bash tests/keep-servers.sh            # 前台循环，每 10s 探一次
# 日志：/tmp/keep-servers.log（每次拉起都记一行时间戳 + 端口）
REPO="$(cd "$(dirname "$0")/.." && pwd)"
WS="$(cd "$REPO/.." && pwd)"
LOG=/tmp/keep-servers.log
mkdir -p "$(dirname "$LOG")"

say() { echo "[watchdog $(date '+%F %T')] $*" | tee -a "$LOG"; }

up() { curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$1/"; }

start_8899() { (cd "$REPO" && setsid node server/we-scene-demo-server.mjs 8899 >>/tmp/we-scene-8899.log 2>&1 &) ; }
start_8901() { (cd "$WS/references/vendor-ref/ww-pages" && setsid node serve-8901.mjs 8901 >>/tmp/8901.log 2>&1 &) ; }
start_8902() { (cd "$REPO" && setsid node server/we-scene-demo-server-8902.mjs 8902 >>/tmp/8902.log 2>&1 &) ; }

# ①(2026-09-19 用户明确要求) OpenViking 记忆服务（:1933）：**没起来就先拉起来**。
#   用官方的 restart-openviking.sh（它自己锚定路径匹配 python 进程、不会误杀别的）；只在 health 不 200 时动手。
OV_HEALTH="http://127.0.0.1:1933/health"
ov_up() { curl -s -o /dev/null --max-time 2 "$OV_HEALTH"; }
start_openviking() {
  if [ -x "$WS/restart-openviking.sh" ]; then
    (cd "$WS" && bash restart-openviking.sh >>/tmp/keep-servers-openviking.log 2>&1 &)
  else
    say "找不到 $WS/restart-openviking.sh ⇒ 无法自动拉起 OpenViking"
  fi
}
if ov_up; then say "OpenViking(:1933) 已在"; else say "OpenViking(:1933) 不在，拉起…"; start_openviking; sleep 6; ov_up && say "OpenViking 已恢复" || say "OpenViking 仍不可达（下一轮再试）"; fi

say "启动：盯 :8899 :8901 :8902 + OpenViking(:1933)（每 10s 一次；:3080 是用户的 DSH，**不碰**）"
for p in 8899 8901 8902; do
  if up "$p"; then say ":$p 已在"; else say ":$p 不在，拉起…"; "start_$p"; sleep 2; up "$p" && say ":$p 起来了" || say ":$p 仍不可达"; fi
done

while true; do
  # OpenViking 只在"掉下去"时才拉（健康时一个请求都不多发）
  if ! ov_up; then say "OpenViking(:1933) 掉了，拉起…"; start_openviking; sleep 6; ov_up && say "OpenViking 已恢复" || say "OpenViking 仍不可达（下一轮再试）"; fi
  for p in 8899 8901 8902; do
    if ! up "$p"; then
      say ":$p 掉了，拉起…"
      "start_$p"
      sleep 2
      up "$p" && say ":$p 已恢复" || say ":$p 仍不可达（下一轮再试）"
    fi
  done
  sleep 10
done
