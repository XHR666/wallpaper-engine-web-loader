# assets/fonts — 随仓库分发的字体（P-86）

本目录是渲染器的**第二级字体来源**（四级链：包内 → **仓库自带** → 本机 WE → `sans-serif`）。
`server/we-scene-demo-server.mjs` 把本目录挂在 `/assets/fonts/<文件名>` 下（含 `licenses/` 子目录）。

> **一句话纪律**：本目录里**没有**任何一个文件是从 Wallpaper Engine 安装目录
> （`<WE>/assets/fonts/`）复制来的。每个文件都能追溯到作者/上游的下载 URL，
> 逐个文件的许可、版权行、上游 URL、获取日期与 sha256 见上级目录的 `THIRD-PARTY.md` §4。

## 目录内容

| 仓库里的文件 | 许可 | 上游来源（唯一取件口） |
|---|---|---|
| `Blackout 2 AM.ttf` | OFL-1.1（RFN `Blackout`） | `https://github.com/theleagueof/blackout` |
| `monof55.ttf` | OFL-1.1（作者邮件确认；见 `licenses/monofur-author-OFL-email.txt`） | Debian `fonts-monofur` 1.0 上游 tarball（`https://deb.debian.org/debian/pool/main/f/fonts-monofur/`） |
| `NotoSans-Regular.ttf` | OFL-1.1 | `https://github.com/notofonts/noto-fonts` |
| `RobotoMono-Regular.ttf` | OFL-1.1（上游现行版；**不是** Apache-2.0） | `https://github.com/googlefonts/RobotoMono` |
| `Segment7Standard.otf` | OFL-1.1（RFN `Segment7`） | `https://fontlibrary.org/en/font/segment7` |
| `spincycle_3d_ot.otf` | 作者 freeware 条款（可商用、可再分发；见下 §Spin Cycle） | `https://www.bvfonts.com/fonts/details.php?id=44` |
| `Twemoji.Mozilla.ttf` | 美术 CC-BY-4.0 / 代码 Apache-2.0 | `https://github.com/mozilla/twemoji-colr`（release v0.7.0） |

许可全文/归属声明全部在 `licenses/`（`OFL-*.txt`、`Apache-2.0.txt`、
`CC-BY-4.0-Twemoji-attribution.txt`）。

## WE 引用名 → 仓库文件名（映射表）

工坊壁纸的 `scene.json` 里写的是 WE 内置字体的**文件名**（例如时钟层的
`fonts/Monofur-PK7og.ttf`）。我们按上游取件，因此**保留上游文件名**；名字与 WE 引用名不同的两个，
在 `demo.html` 的 `REPO_FONT_ALIASES` 常量里显式对应（其余为同名恒等）：

| 壁纸里的 `fonts/<名>` | 本目录的实际文件 | 为什么不同名 |
|---|---|---|
| `Monofur-PK7og.ttf` | `monof55.ttf` | Debian/作者上游发布名就是 `monof55.ttf`（Regular）；不重命名上游文件 |
| `TwemojiMozilla.ttf` | `Twemoji.Mozilla.ttf` | Mozilla 上游发布名带点号 |
| `Blackout 2 AM.ttf` / `NotoSans-Regular.ttf` / `RobotoMono-Regular.ttf` / `Segment7Standard.otf` / `spincycle_3d_ot.otf` | 同名 | — |

映射只在**取 URL 时**生效（`repoFontUrl()`），字体族名仍由文件自己的 sfnt `name` 表决定
（例如 `monof55.ttf` 的族名是 `monofur`），渲染器给每个字体注册的 CSS 族名是
`mpw-<hash>`，与文件名无关。

## Spin Cycle 3D：作者条款与回链（**显著位置，请勿删除**）

`spincycle_3d_ot.otf` 由作者 **Jess Latham**（旧名 Blue Vinyl Fonts / BV Fonts）免费发布。
**官方站点：<https://www.bvfonts.com/>** —— 字体页 <https://www.bvfonts.com/fonts/details.php?id=44>，
条款 <https://www.bvfonts.com/tou.php>，FAQ <https://www.bvfonts.com/faq.php>。
请到作者站点下载最新版；作者原话：*"It's always a good idea to download the latest version from
bvfonts.com, archive sites don't always update their files."*

本仓库遵守的条件（逐条对照见 `THIRD-PARTY.md` §4.6）：

1. **允许**个人与商业使用、允许再分发（`All free fonts at bvfonts.com are freeware. You may use
   them in personal or commercial work.`）。
2. **不得**放进 CD-ROM / 合集光盘或任何"字体合集"形态的产物 —— 本目录**不是**字体合集：
   它只带渲染器真正会用到的那几个字体，且整个仓库是免费、GPL-3.0-or-later 许可的源码仓库，不售卖。
3. **不得**转售、重新包装销售、**不得重编译** —— 我们原样分发作者 zip 里的
   `Open Type/spincycle_3d_ot.otf`（未改名、未转格式、未重编译、未修改一个字节，sha256 见 `THIRD-PARTY.md`）。
4. **回链**作者站点：本文件（字体所在目录的说明文件）、`THIRD-PARTY.md`、
   以及 `demo.html` 的字体来源日志/注释里都指向 <https://www.bvfonts.com/>。

作者保留随时改条款的权利；条款原文快照（含抓取日期与页面 sha256）在
`licenses/spincycle-bvfonts-TOU.txt`，随字体一起分发的原始说明在
`licenses/spincycle-bvfonts-README.txt`。

## 本目录**未**包含的字体

WE `assets/fonts/` 里另外那些字体（`Alcubierre.otf`、`Atami-Regular.otf`、
`CursedTimerUlil-Aznm.ttf`、`Lazer84.ttf`、`kust.ttf`、`opensticks.ttf`、`summer85.ttf`）
回溯作者上游后查不到任何再分发授权，**不随仓库分发**；运行时仍从用户本机 WE 安装目录读
（`/weassist/fonts/<名>`），没装 WE 就回退 `sans-serif`。
`8bitOperatorPlus8-Regular.ttf` 虽内嵌 OFL-1.1，但作者现行发布页本次**取不到**（见 `THIRD-PARTY.md` §4.7），
按"宁可缺、不可用来路不明副本"的口径**未收录**。

背景调研（为什么不能从 WE 目录复制、15 个字体逐个的许可证据）见
`docs/FONT-REDISTRIBUTION-RESEARCH.md`。
