# BENCH-8902 —— 一站式测试台服务（`server/we-scene-demo-server-8902.mjs`）

> 用户原话：「我现在打开的离线页面是这样的，**怎么去进入一个在线的页面**」。
> 他看到的 `:8901` 是**纯静态**：`/api/*` 与 `/diag` **全 404** ⇒ 壁纸库列表、属性保存、删除、打开所在文件夹、
> 渲染器诊断流**一个都用不了**（页面左侧栏自己会写「静态托管（无 /api 后端）」，诊断区置灰）。
> 本文件交付的就是那个"带后端的页面"：**一个 origin 同时提供 静态测试台 + `/api/*` + 渲染器 iframe 页 + 壁纸媒体面 + 诊断流**。

* 服务文件：`server/we-scene-demo-server-8902.mjs`（零依赖，与既有 `server/we-scene-demo-server.mjs` 同风格）
* 自证测试：`tests/bench-server-test.mjs`（秒级；含变异 RED）
* 端口：默认 **8902**（`:8899` 渲染器页 / `:8901` 纯静态台**都不动**，本服务是**新增**）

---

## 1. 为什么要有第三个端口（与 `:8899` / `:8901` 的关系）

| 服务 | 是什么 | 有 `/api/*` 吗 | 有测试台页面吗 | 有渲染器 iframe 页吗 | 有诊断流吗 |
|---|---|---|---|---|---|
| `:8899` `server/we-scene-demo-server.mjs` | **渲染器**演示页（`/`、`/bundle.js`、`/elysia/**`、`/shaders/**`、`/diag`、`/baseline`、`/ext`、`/noise`） | ✗ | ✗ | ✗（它自己就是渲染器页，但不是产物写死的那条 URL） | ✓（它自己的 `/diag`） |
| `:8901` 纯静态台 | 把 `demo/` 的**产物**按 Pages 布局静态托管（`/`、`/demo/`、`/WEwebLoader/`、`/wallpaper-engine-webgl/`） | ✗（**404**） | ✓ | ✓（同布局下 `/wallpaper-engine-webgl/renderer/index.html` 200） | ✗（404） |
| **`:8902`（本服务）** | 上面两半的**合成**：静态面照抄 `:8901` 口径 + 测试台要的 8 个 `/api/*` + 媒体面 + 诊断流 | ✓ | ✓ | ✓（**同一条写死的 URL**） | ✓（本服务自己的环形缓冲） |

**为什么不能"直接在 `:8901` 上加 API"**：`:8901` 是"线上静态托管形态"的**真访问口径**（`docs/ONLINE-DEMO.md` §1 明确它要能代表 GitHub Pages：
没有本机后端时页面该显示什么）。给它塞 `/api/*` 会让"静态托管的降级形态"没法再被验证。
**为什么不加在 `:8899` 上**：`:8899` 的 URL 契约（`/bundle.js`、`/elysia/**`、`/baseline`…）被 60+ 个测试当**判据**用，
增删路由会污染那些判据；且 `:8899` 的 `/` 是渲染器页而不是测试台。⇒ **新增第三个端口**，互不影响。

### 1.1 一个必须写下来的发现：测试台 iframe 的渲染器 URL 是**写死的绝对旧路径**

产物里（`demo/assets/bench-DSKWIqmS.js` @83849、@93800）：

```js
const Ye="dev",re=`${location.origin}/media/${Ye}`,It=`${location.origin}/web/${Ye}`   // ← 媒体面基址
…
k.src=`/wallpaper-engine-webgl/renderer/index.html?${e}&_t=${Date.now()}`              // ← 3 处，绝对路径
```

⇒ **`:8902` 必须**让 `/wallpaper-engine-webgl/renderer/index.html` 指向 `demo/renderer/index.html`，否则"列表点得动、画面永远出不来"。
本服务把 `demo/` 同时挂在 **`/`、`/demo/`、`/WEwebLoader/`、`/wallpaper-engine-webgl/`** 四个挂载点下（最后一个就是为这条写死路径）。
另外 `demo/index.html` 是 `<base href="./">` + `./assets/…` ⇒ 挂在 `/` 时资源在 `/assets/**`，本服务也照此服务（即"根挂载点"）。

---

## 2. 8 个 `/api/*` 的**真实契约**（逐条给产物里的证据片段）

> 下面每条的"调用方"都是**预构建产物**（不可重建的 minified 包）：`demo/assets/bench-DSKWIqmS.js`（下称 **bundle**）
> 与 `demo/bench-patch.js`（下称 **patch**）。`@<字节偏移>` 是指令 `node -e '…s.indexOf(…)'` 在文件里的偏移，便于复核。
> **形状以调用方为准**，本服务只做"它读什么就给什么"，不发明字段。

### 2.1 `GET /api/library` —— 列表

```js
// bundle @89060（加载列表）
const t=await(await fetch("/api/library")).json();
if(B.textContent=t.dir,B.title=t.dir,le.textContent=t.dir,t.error){b(t.error,!0);return}
ne=t.items;const n=a=>ne.filter(o=>rt(o)===a).length
// bundle @89726（启动探测：200 + JSON ⇒ "本机 Node 后端在"，否则静态托管）
const e=await fetch("/api/library",{headers:{accept:"application/json"}});
return e.ok&&(e.headers.get("content-type")??"").includes("application/json")
```

| 事实 | 证据 |
|---|---|
| 方法 `GET`，`Accept: application/json` | @89726 |
| 200 时 body `{dir:string, items:[]}`（`dir` 显示在左侧栏/标题） | @89060 |
| `error` 字段存在并被显示 ⇒ **库根不存在时给 `items:[]` + `error`**，且**仍是 200**（探测靠 `e.ok` 判"后端在"，用 5xx 会让页面误判成静态托管） | @89060/@89726 |
| 列表项筛选：`rt(o)` = `o.hasScene ? "scene" : o.type.toLowerCase()`，只有 `web`/`video`/`gif` 三类能上屏 | @86703 |
| 列表项字段：`n.itemId`、`n.title`、`n.preview` ⇒ `img.src = \`${re}/${n.itemId}/${n.preview}\``（`re` = `/media/dev`） | @91239/@83849 |
| 打开壁纸：`e.hasScene?"scene":e.type.toLowerCase()`；scene ⇒ `src=e.itemId`；web ⇒ `src=\`${It}/${e.itemId}/${e.file??"index.html"}\``；video ⇒ `src=\`${re}/${e.itemId}/${e.file}\`` | @93620 |
| patch 侧：`hostLibrary()` 读 `j.items`；`brandingForItemId()` 用 **`it.itemId` / `it.preview` / `it.title`**；`propertiesForItemId()` 直接把 **`it.properties`** 交给 `dragPropsToDisable()`（它读 `v.type`/`v.text`）⇒ **`properties` 必须是 project.json 里的原始 map** | patch @192363/@192516/@192681 |

**本服务的响应**（`items[]` 每项）：

```json
{ "itemId": "3554161528", "dir": "3554161528", "title": "Blue Archive-Sorasaki Hina 空崎日奈[4K]",
  "type": "Scene", "hasScene": true, "file": "scene.json", "preview": "preview.gif",
  "scenePkg": "scene.pkg", "kind": "scene", "workshopid": "3554161528",
  "properties": { "clock": { "type": "bool", "text": "时钟", "value": false, … } } }
```

* `hasScene`：按 **renderer bundle 的候选表**逐字判定 `scene.pkg` / `scenes/scene.pkg` / `gifscene.pkg`（`c1`，见 §2.9）。
* `type`：`project.json.type` 原样（真实语料是 `scene/Scene/web/Web/video/…` 大小写混写）；缺失时按文件嗅探。
* `preview`：`project.json.preview` 或 `preview.gif|jpg|jpeg|png|webp` 里的第一个（**只给文件名**：调用方自己拼 `/media/dev/<id>/<preview>`）。
* `properties`：`project.json.general.properties` 的**原始 map**（不是 §2.3 的描述子数组；patch 的 `dragPropsToDisable()` 要原始 `{type,text}`）。
* `dir`：相对库根（列表里不铺绝对路径；顶层绝对根在 `library.dir`）。
* 逃出库根的符号链接条目**直接跳过**（不列出来，也不让整表报错）。

### 2.2 `POST /api/library-dir` —— "选择文件夹"

```js
// bundle @88253（用户手输/回退路径都被接受）
const t=await fetch("/api/library-dir",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dir:e})});
const n=await t.json(); if(!t.ok||n.error)throw new Error(n.error||`HTTP ${t.status}`); localStorage.setItem(Me, n.dir??e)
// bundle @88546（点「选择文件夹」按钮）
const e=await fetch("/api/library-dir",{method:"POST",…,body:JSON.stringify({pick:!0})}),t=await e.json();
if(!e.ok||t.error) throw new Error(t.error||`HTTP ${e.status}`);
if(t.cancelled){ if(!t.unsupported) return; const n=window.prompt(p("prompt.libDir"),…); … await ut(n.trim()) }   // ← 回退到"手输"
else if(t.dir) localStorage.setItem(Me,t.dir)
```

| 事实 | 证据 |
|---|---|
| `POST` + JSON body | @88253 |
| `{dir:"…"}` ⇒ `{dir:"<生效的库根>"}`；**非 2xx 或 `error` ⇒ 前端抛错** | @88253 |
| `{pick:true}` ⇒ 宿主对话框；**本服务没有宿主**，要触发前端自己的 `window.prompt` 回退 **必须**回 `200 + {cancelled:true, unsupported:true}`：`if(!e.ok||t.error) throw` **在** `if(t.cancelled)` **之前** | @88546 |

**本服务的实现（`/__health.degraded[]` 里如实登记）**：

* `{pick:true}` → **200** + `{cancelled:true, unsupported:true, degraded:true, degradedStatus:501, picker:"unsupported", reason, hint}`
  —— 能力状态**就是 501（没有宿主对话框）**，但 HTTP 状态**故意用 200**：调用方把非 2xx 当硬失败（上面那行 `throw`），
  回 501 会**掐掉它自己的 prompt 回退**。所以"降级"用 body 说清楚（`cancelled` 已经表示"没选成"），**不假装成功**。
* `{dir:"…"}` → **真能力**：把**活动库根收窄到配置库根内的子目录**（词法 + 真身双校验）；`{reset:true}` 还原。
  越根 ⇒ 403，相对 `..` ⇒ 400。响应回生效的 `dir`，前端存进 localStorage 后重新 `GET /api/library`。
* `GET /api/library-dir?dir=…` → **只读枚举**库根内子目录（本服务自加的脚本化能力，前端不用；逃逸符号链接不列出）。

### 2.3 `GET /api/props` / `POST /api/props` —— 用户属性读/写

```js
// bundle @99446（读）
const n=await(await fetch(`/api/props?item=${encodeURIComponent(e)}`)).json();
if(n.error)throw new Error(n.error);
z=n.props??[], y=Object.fromEntries(z.filter(o=>o.value!==null).map(o=>[o.name,o.value]));
const a=z.filter(o=>o.overridden).length
// bundle @100008（写：**body 就是"属性名→值"的覆盖表**，只发与默认不同的项）
const n=await(await fetch(`/api/props?item=${encodeURIComponent(S)}`,{method:"POST",…,body:JSON.stringify(e)})).json();
if(n.error)throw new Error(n.error)
```

描述子（`props[]` 的元素）**被读到的字段**（渲染分支 @103903–@105900）：

| 字段 | 读它的地方 | 说明 |
|---|---|---|
| `name` | `y[e.name]`、`x(e.name,…)`、过滤 `${s.name} ${s.text}` | 属性名（WE 作者自定：`clock`、`newproperty1`…） |
| `text` | `se(e)` → 标题；`Be()` 判"这串 HTML 像不像图片地址" | 原始文案（可含 HTML） |
| `ptype` | `s.ptype==="group"/"text"/"bool"/"color"/"slider"/"combo"/"file"/"directory"/"scenetexture"`，默认 ⇒ 文本框 | **就是 WE 的 `type`**（无 `type` ⇒ `"text"`） |
| `value` | `y[e.name]`；`value===null` 的项**不进覆盖表** | 生效值（有覆盖用覆盖，否则用 `default`） |
| `default` | `!xe(y[e.name],e.default)` ⇒ `overridden` 样式；`↺` 恢复默认 | project.json 里的值 |
| `overridden` | `z.filter(o=>o.overridden).length`（"已改 N 项"） | 覆盖文件里有没有这个键 |
| `condition` | `me(s.condition, y)` 客户端求值 | 原样透传（表达式引擎在页面里） |
| `media` | `St(e)` → `{src,href}`，相对 src 用 `${re}/${itemId}/${src}` | 本服务从 `text` 的 `<img>/<a href>` 里**抽出来**（宿主职责） |
| `min`/`max`/`precision`/`step` | slider 分支 | 原样透传 |
| `options` | combo 分支：`d.label` 显示、`d.value` 回写 | 原样透传（`{label,value,condition?}`） |
| `fileType` | `dn(e.fileType)` → `input.accept` | 原样透传 |

**本服务的实现**：

* 读：`<库根>/<itemId>/project.json` → `general.properties`（**真实 WE 是 map**：`{属性名: {type,value,text,condition,order,…}}`，
  实测 3554161528 的 35 项 `{bool:15,color:4,slider:7,group:5,combo:1,无type:3}`）⇒ 按 `order ?? 100+index` 稳定排序输出**扁平数组**，
  `group` 作为分隔项（调用方自己把其后的项归到该组）。`text` 里的 `<img>` 抽成 `media`。
* 写：`POST` body（覆盖表）落 **`<MPW_REPORTS_DIR>/bench-props/<itemId>.json`**（原子写：临时文件 + rename），
  **绝不写进壁纸包**（测试 D7 用"目录 名字+大小 指纹前后逐字相同"钉死这一条）。
* 校验：属性名必须单段（`/^[A-Za-z0-9_][A-Za-z0-9._-]*$/`），值只允许 `string|number|boolean|null`（`null` = 删除该项覆盖）。

### 2.4 `POST /api/props-dir` —— 目录型属性的"选择目录"

```js
// bundle @102037
const n=await fetch("/api/props-dir",{method:"POST"}), a=await n.json();
if(!n.ok||a.error) throw new Error(a.error||`HTTP ${n.status}`);
if(a.cancelled){ if(!a.unsupported) return; const o=window.prompt(p("props.dirPh"), String(y[e]??"")); … x(e,o.trim()); return }
a.value && x(e,a.value)
```

⇒ 与 §2.2 同构：`{pick}`（无 body）要宿主对话框；**本服务回 200 + `{cancelled:true, unsupported:true, degraded:true, degradedStatus:501}`**，
前端回退到 `window.prompt` 让用户手输绝对路径（用户输入的值只写进"属性覆盖文件"，服务侧**不读**这个路径）。
本服务另给脚本化能力：`GET /api/props-dir?item=` 枚举库根内目录；`POST {dir:"库根内的路径"}` 回该目录的绝对路径 `value`。

### 2.5 `POST /api/props-file` —— 文件型属性导入

```js
// bundle @101630
const o=await fetch(`/api/props-file?item=${encodeURIComponent(S)}&name=${encodeURIComponent(e)}`,
  {method:"POST",headers:{"X-Filename":encodeURIComponent(t.name)},body:t});     // body = File 本体（原始字节）
const r=await o.json(); if(!o.ok||r.error||!r.value) throw new Error(r.error||`HTTP ${o.status}`); x(e,r.value)
```

* 文件名走 **`X-Filename` 头**（`encodeURIComponent` 后的），**不在 query 里**；query 只有 `item` 与 `name`。
* 响应必须有 **`value`**（调用方 `!r.value` 就抛），并被写进属性覆盖。
* **本服务**：字节落 `<reports>/bench-props/files/<itemId>/<name>/<filename>`（**不进壁纸包**），
  `value` 回**同源可回读的 URL** `/api/props-file/<itemId>/<name>/<filename>`（`GET` 原样回字节），另附 `filePath` 绝对路径。
  文件名必须单段（`..`/分隔符 ⇒ 400）。**未证实**：renderer 的贴图解析会不会认这个 URL（见 §6）。

### 2.6 `POST /api/delete` —— 删除（**默认 dryRun**）

```js
// bundle @93296
if(window.confirm(p("confirm.delete",{title:e.title,id:e.itemId})))
  { const t=await fetch("/api/delete",{method:"POST",…,body:JSON.stringify({itemId:e.itemId})}),n=await t.json();
    if(!t.ok||n.error) throw new Error(n.error||`HTTP ${t.status}`); … await Te() }        // Te() = 重新 GET /api/library
```

* 请求只有 `{itemId}`，**没有** confirm/dryRun 字段 ⇒ **默认行为由服务定**：本服务**默认 dryRun**（只回计划，一个文件都不动），
  真删要显式 `POST /api/delete?confirm=1`（query 是服务侧扩展：调用方不会拼它，所以"页面点删除"永远是安全的 dryRun）。
* 真删 = **移到** `<MPW_ROOT>/Delete/bench-trash/<ISO 时间戳>/<itemId>/`（先 `rename`，跨设备 `EXDEV` 时才 `cp+rm`），
  响应回 `to` 与 `rollback`（一条 `mv` 命令）⇒ **可回滚**。
* 页面表现：dryRun 时调用方仍显示"已删除：<id>"（它只看 `error`）⇒ 本服务**同时往诊断流写一条**
  `bench: 删除为 dryRun（未移动任何文件）…真要删请用 ?confirm=1`，让用户在页面的日志区看见真相。

### 2.7 `POST /api/reveal` —— 打开所在文件夹

```js
// bundle @91972
const t=await fetch("/api/reveal",{method:"POST",…,body:JSON.stringify({itemId:e})}),n=await t.json();
if(!t.ok||n.error) throw new Error(n.error||`HTTP ${t.status}`); b(p("ok.reveal",{id:e}))
```

* 只接受**库根内**的 `{itemId}` 或 `{path}`（先做路径校验，**再看打开器**：逃逸 ⇒ 403，不是 501）。
* 打开器按 `MPW_OPEN_CMD` → `termux-open` → `xdg-open` → `open` 找；**找不到 ⇒ 501 + `{unsupported:true, error, reason, hint}`**
  （绝不 500、绝不假装成功）；启动失败同样 501。本服务**不会**替你启动浏览器（测试里用 `MPW_OPEN_CMD=/bin/true` 验证成功分支，
  用 `PATH=""` 验证 501 分支，全程零 X11/零浏览器）。

### 2.8 `GET /api/diag-stream` —— SSE 诊断流

```js
// bundle @87359
function Jt(){const e=new EventSource("/api/diag-stream");
  e.onmessage=t=>{try{const{msg:n}=JSON.parse(t.data);b(n,/fail|error|ERROR/.test(n))}catch{}},
  e.onerror=()=>b(p("err.diagStream"),!0)}
```

* 事件必须是**默认 message 类型**（`onmessage` 只收默认/`message`），`data` 是 JSON，**字段名 `msg`**。
* 页面还会探一次 `/api/diag-stream` 的**状态码**决定诊断区是否置灰（patch 的 `diagOfflineState(httpStatus)`：非 2xx ⇒ offline）⇒ 本服务必须 200。

**数据源选择（写清）**：**本服务自己维护环形缓冲**（上限 200 条，内存，不落盘），**不代理 `:8899/diag`**。理由是产物里的上报路径是
**同源**：renderer bundle 的 `ce()`：

```js
const r=e.mediaBase?new URL(e.mediaBase,window.location.href).origin:"";
if(r){const i=new Image;i.src=`${r}/diag?msg=${encodeURIComponent(`scene ${e.src??"?"}: ${n.slice(0,500)}`)}`}
```

⇒ 本服务接 **`GET /diag?msg=…`**（回 1×1 GIF：`new Image()` 不报错、控制台不刷错误）与 **`POST /diag`**（JSON body 或纯文本），
写环形缓冲并广播给所有 SSE 订阅者（连上先回放最近 50 条），15s 一次 `: ping` 心跳。

### 2.9 媒体面（不是 `/api/*`，但**没有它测试台就是"能点不能用"**）

```js
// renderer bundle：场景源 = `${mediaBase}/${src}`，依次试这三个文件名 + project.json
const c1=["scene.pkg","scenes/scene.pkg","gifscene.pkg"];
function l1(t,e){const n=t.replace(/\/+$/,"");return{key:n,async scenePkg(r){for(const o of c1){…fetch(`${n}/${o}`)…}}, async project(r){…}}}
const p=e.source??l1(`${e.mediaBase}/${e.src}`)
```

⇒ 本服务提供 **`/media/dev/<itemId>/<rel…>`**（scene.pkg/preview/视频/音频…）与 **`/web/dev/<itemId>/<rel…>`**（web 壁纸 iframe 的 src），
都**只读、库根内、支持 Range**（`206 + Content-Range`；视频拖动进度必需）。

---

## 3. 能力清单与**降级为 501 的端点**

`GET /__health` 是自述的唯一入口（启动日志同内容）。`capabilities` 里 `true/false`，`degraded[]` 逐条给"哪个端点、什么条件、能力状态、HTTP 用几、为什么"。

| 端点 | 状态 | 说明 |
|---|---|---|
| `GET /`、`/demo/**`、`/WEwebLoader/**`、`/wallpaper-engine-webgl/**` | ✅ | 静态测试台（`demo/`），**no-store**（`Cache-Control: no-store, must-revalidate`，与 `:8901` 逐字同口径） |
| `GET /assets/**`、`/icons/**`、`/bench-patch.js`、`/renderer/**`、`/samples/**` | ✅ | 同上（`<base href="./">` ⇒ 根挂载点也必须服务） |
| `GET /media/dev/**`、`/web/dev/**` | ✅ | 库根内只读 + Range |
| `GET /api/library` | ✅ | 列表（只读） |
| `POST /api/library-dir {dir}` / `GET /api/library-dir` | ✅ | 库根内**收窄** / 枚举 |
| `POST /api/library-dir {pick:true}` | ⚠️ **能力 501** | 没有宿主对话框；HTTP 回 **200** + `cancelled/unsupported/degradedStatus:501`（理由见 §2.2） |
| `GET/POST /api/props` | ✅ | 读 project.json / 覆盖写 reports（不写壁纸包） |
| `POST /api/props-dir {pick:true}` | ⚠️ **能力 501** | 同上（前端回退到 `window.prompt` 手输绝对路径） |
| `GET /api/props-dir`、`POST {dir}` | ✅ | 库根内枚举 / 取绝对目录 |
| `POST /api/props-file`、`GET /api/props-file/<id>/<name>/<file>` | ✅ | 导入到 reports + 回读（**不写壁纸包**） |
| `POST /api/delete` | ✅ | **默认 dryRun**；`?confirm=1` 移到 `Delete/bench-trash/<ts>/`（可回滚） |
| `POST /api/reveal` | ✅ / ⚠️ | 有打开器 ⇒ 200；**没有 ⇒ 501 + 说明**（能力 501，HTTP 也真是 501） |
| `GET /api/diag-stream`、`GET /diag?msg=`、`POST /diag` | ✅ | 本服务环形缓冲（**不代理 `:8899`**） |
| `GET /__health` | ✅ | 端口/库根/能力/降级/上限/诊断缓冲 |
| **没有的能力（不存在，也不假装）** | ❌ | 任意路径读/写、真实文件系统对话框、宿主转码（video 转码）、HTTP 代理 |

**"降级为 501"的三条**（`/__health.degraded[]` 逐条）：

1. `POST /api/library-dir {pick:true}` ⇒ 能力 501（native-folder-picker）。**HTTP 用 200**：调用方 `if(!e.ok||t.error) throw` 在 `if(t.cancelled)` 之前，501 会掐掉它自己的 `window.prompt` 回退 ⇒ 用 body 的 `unsupported/degraded/degradedStatus` 如实说明"没选成、因为没对话框"。
2. `POST /api/props-dir {pick:true}` ⇒ 同上（目录型用户属性）。
3. `POST /api/reveal`（找不到/起不动打开器）⇒ 能力 501，**HTTP 也 501**（调用方本来就把它当错误显示）+ `error/reason/hint/tried`。

---

## 4. 安全模型（红线逐条 + 对应用例）

| 措施 | 实现 | 对应用例 |
|---|---|---|
| 规范化后**前缀校验** | `safeJoin()`：`path.resolve` 后 `path.relative(root,p)` 必须在根内，否则 **403**；相对路径里出现 `..` 直接 **400** | `F5`（`../outside`、`/etc`）、`G2`、`C5` |
| **拒绝 `..`（URL 层）** | `new URL()` 会把 `..` 规范化掉 ⇒ 先用**原始** `req.url`（`%2e%2e` 解码后）按段判 `..` ⇒ **400** | `A7`、`A8`、`G7` |
| **符号链接逃逸** | 真身二次校验：`realpathSync` 逐级回溯（缺失尾段也校验最长存在前缀）⇒ 越根 **403** | `F6`、`G1`、`G3`、`G6`（外部文件 `TOP-SECRET-OUTSIDE` 读不到） |
| `itemId` 只允许**单段** | `/^[A-Za-z0-9][A-Za-z0-9._-]*$/` ⇒ `../`、绝对路径、`a/b`、`.`、`..` 全 **400** | `F5`、`G3` |
| 上传文件名只允许**单段** | `X-Filename` 解码后禁分隔符/`..`/绝对路径 ⇒ **400**；落点复核仍在 `reports` 内 | `E5`、`E6` |
| **没有**任意路径读/写 | 库根内的读只有列表/`project.json`/`media,web`；写只有 `reports/bench-props/**`（属性覆盖）与 `Delete/bench-trash/**`（删除） | `D6`/`D7`（写不进壁纸包）、`H8` |
| **默认不删真文件** | `POST /api/delete` 默认 dryRun：只回 `{dryRun:true, from, to, files[], fileCount, bytes}`，**一个文件都不移** | `F1`、`F2` |
| 真删 = 移进回收站（**可回滚**） | `?confirm=1` ⇒ `rename(库项 → <MPW_ROOT>/Delete/bench-trash/<ts>/<itemId>)`（`EXDEV` 才 `cp+rm`），响应回 `to` 与 `rollback` | `F3`、`F4` |
| 不启动浏览器/X11 | `reveal` 只 `spawn(opener)`；测试用 `MPW_OPEN_CMD=/bin/true` 与 `PATH=""` 两条路，全程零浏览器 | `G8`、`I1`、`I2` |
| 落盘/内存上限 | 上传单文件 ≤64MB、JSON body ≤2MB、列表 ≤5000 项、诊断环形缓冲 200 条 × 2000 字符 | `/__health.limits` |
| 一个坏请求不许打崩服务 | 处理函数**同步 throw 也被接住**（`done()` 里 try 包住 `fn()`）⇒ 404/400 之后 `/__health` 仍 200 | `H7`（这是实测踩到的真 bug，已修） |

---

## 5. 怎么用

```bash
# 1) 起服务（默认 8902；默认库根 = <仓库上一级>/allwallpaper/dd，默认 no-store）
node server/we-scene-demo-server-8902.mjs

# 2) 换端口/库根/静态根（环境变量优先于 CLI，与既有服务同风格）
PORT=8902 MPW_LIBRARY_DIR=/path/to/allwallpaper/dd node server/we-scene-demo-server-8902.mjs
node server/we-scene-demo-server-8902.mjs 8902 --library=/path/to/allwallpaper/dd --no-store

# 3) 打开（**带后端**的测试台：列表/属性/删除/诊断流都活）
xdg-open http://127.0.0.1:8902/          # 或者浏览器里直接输这个地址
curl -s http://127.0.0.1:8902/__health | head -40     # 自述：库根 + 能力 + 降级 + 上限
curl -s http://127.0.0.1:8902/api/library | head -40   # 列表
```

页面里应当看到：左侧栏"壁纸库"有项、点一下 iframe 里出画面（`/wallpaper-engine-webgl/renderer/index.html`）、
右侧"壁纸配置"能读写、右键"删除壁纸"是 dryRun（日志区会写"未移动任何文件"）、日志区有渲染器诊断。

**相关环境变量**：`MPW_ROOT`（工作区根，决定库根/回收站/reports 默认落点）、`MPW_LIBRARY_DIR`（库根，**只读**）、
`MPW_REPORTS_DIR`（属性覆盖落点）、`MPW_BENCH_STATIC_DIR`（静态面根，测试的变异副本靠它指回真树）、
`MPW_BENCH_STORE=1`（关掉 no-store）、`MPW_OPEN_CMD`（reveal 打开器）、`MPW_LIMIT_*` **不由本服务读取**（本服务只写属性覆盖，见 §3 上限表）。

**自证**：`node tests/bench-server-test.mjs`（63 断言 + 2 个变异 RED；秒级；不启浏览器、不碰真库、不连 `:8899/:8901`）。
**登记待办**：`tests/run-all-tests.sh` 的 `add` 列表由主对话加 `add "bench-8902" "node tests/bench-server-test.mjs"`（本批**不改**该文件）。

---

## 6. 未证实项（**需要主对话用有头浏览器确认**）

| # | URL + 操作 | 期望 |
|---|---|---|
| U1 | 打开 `http://127.0.0.1:8902/` | 左侧栏"壁纸库"**真的列出**真实库项（`curl /api/library` 已证 200+items；页面渲染未用浏览器验） |
| U2 | 点列表里一个 **scene** 项 | iframe 加载 `/wallpaper-engine-webgl/renderer/index.html?type=scene&src=<id>…` ⇒ `/media/dev/<id>/scene.pkg` 被取；画面出现（scene.pkg 解析在浏览器里，本批只验到"字节可服务"） |
| U3 | 点一个 **web** 项 | `/web/dev/<id>/index.html` 在 iframe 里加载（同源、无 CSP 头，理论可行；**未在浏览器里跑过**） |
| U4 | 点一个 **video** 项 | `/media/dev/<id>/<file>.mp4` 走 Range 播放（206 已用 curl 验；`<video>` 真实拖动未验） |
| U5 | 属性面板改一个值 → 保存 → **刷新页面** | 值还在（覆盖在 `reports/bench-props/<id>.json`；curl 已证读写往返） |
| U6 | 属性面板里"选择文件/选择目录" | 弹 `window.prompt`（手输）而不是报错；输入后值写进覆盖文件。**注意**：`选择文件夹`（左侧栏）与属性里的目录选择在 `bench-patch.js` 下走的是**纯前端选择器**（patch 在捕获阶段抢走点击），`/api/library-dir {pick:true}` 的降级分支只在**未加载 patch** 时才走到 ⇒ 浏览器里可能看不到那条降级提示，这是预期的 |
| U7 | 日志区/控制台 | `/api/diag-stream` 建立（SSE 200）、日志区出现渲染器诊断行；`curl` 侧已证"`POST /diag` → SSE 收到"。另：页面顶部/侧栏**不应**再出现"静态托管（无 /api 后端）"的字样（那是 `/api/library` 404 时的分支） |
| U8 | 右键"删除壁纸" | 日志区出现 `bench: 删除为 dryRun（未移动任何文件）…` 且**列表项仍在**（安全默认）；真删需 `curl -X POST 'http://127.0.0.1:8902/api/delete?confirm=1' -H 'content-type: application/json' -d '{"itemId":"<id>"}'` |
| U9 | 视频/网页壁纸以外的窄屏（手机/Pad "桌面版网站"） | 本批未涉及布局改动；`:8902` 与 `:8901` 是同一份产物 ⇒ 布局行为应当一致 |
| U10 | `/api/props-file` 导入的贴图 | `value` 是**同源 URL**（`/api/props-file/<id>/<name>/<file>`）；**未证实** renderer 的贴图解析是否接受 URL（若只认包内相对路径，需要宿主侧把文件拷进壁纸包 —— 本批**故意不写进壁纸包**，安全优先） |

**本批已用 curl/node 证实的**（不依赖浏览器）：静态面 200 + no-store（含**产物写死的** `/wallpaper-engine-webgl/renderer/index.html`）、
8 个 `/api/*` 的状态码与 JSON 形状、全部逃逸用例 400/403、dryRun 不移动 / `confirm=1` 进回收站、属性读写往返且不写壁纸包、
SSE 收到 `{msg}`、`/__health` 自述、404 不打崩服务；变异 A/B 必红（RED 原文见 §5 测试输出与 `docs/PATCHES.md` 的 P-131 节）。

---

## 7. 测试台外壳一批 UI/交互修复（P-158/P-159，2026-09-19；只动 `demo/index.html` + `demo/bench-patch.js`）

> 本节补的是**页面外壳**（工具条 / 预览 / 输出 / 切换栏 / 类型过滤 / 库来源 / 归属）的一次性修复。
> 服务端一行未动；上面 §1–§6 的接口契约不变。台账全文见 `docs/PATCHES.md` 的 **P-158** 节。

### 7.1 三条结构性根因（一句话版）

1. **`#main` 的内层网格列被内容撑爆**：产物 `#main{display:grid}` 的单列是 `auto` ⇒ 被 `#editor-tabs` 的
   11 个 tab 撑到 **2279px**（`#main` 真实宽 740），再往下派生：工具条 17 个控件只有 3 个在视口内、
   `#stage-scale` 2255×1268 塞进 508px 高的槽（"只看得见左上角"）、输出栏右侧的清空/复制跑到视口外。
   修法 = `#main{grid-template-columns:minmax(0,1fr)!important}`（+ 工具条 `flex-wrap:wrap` 与纵向滚动兜底）。
2. **`#pages-track{contain:paint}` 是 `position:fixed` 后代的包含块** ⇒ 自绘下拉按"视口坐标"算出的
   `left/top` 会被整体下移一个 header（44px）—— 这就是"下拉与触发框之间露一条缝"（实测 48px）的真因。
   修法 = 写内联坐标时减掉包含块原点（新增纯函数 `layerFixedOffset`），缝宽收到 2px 并按实测几何校正。
3. **一个 `<select>` 被两套自绘控件同时增强** + **类型过滤宿主被当"已删功能"处理**：
   前者让每个选项后面多出一个「（空）」的下拉框（分辨率处甚至有两个"自适应 16:9"）；
   后者把 `#type-filter` 的 `onclick` 摘掉并 `hidden`，产物 `Pe` 恒 `'scene'` ⇒ 明明 `/api/library`
   返回 scene 11 / web 7 / video 4，页面却只有 11 项。修法 = 工具条归 `.bench-rd` 独占（mpw 只留给属性面板）、
   `#type-filter` 搬到左侧可见处并由补丁生成四档（全部/场景/Web/视频，默认「全部」= 三档合并）。

### 7.2 本机 `:8902` 复现与验证（headless Firefox）

```bash
bash tests/run-all-tests.sh --only bench-shell-fixes bench-ui-headless bench-8902
# 期望：三项全 PASS（无浏览器断言 70 条 + 浏览器几何 39 条 + 服务端 116 条）
node tests/bench-ui-headless-test.mjs --url http://127.0.0.1:8902/ --w 1360 --h 900
```

页面里现在应当看到（都已由 `bench-ui-headless` 的 S 组断言钉住）：

| 位置 | 修后 |
|---|---|
| 工具条 | 宽 = `#main` 宽（740@1360），17 个控件**全部在视口内**（换行，超出 30vh 才纵向滚） |
| 分辨率下拉 | 与触发框**贴合 2px**，下方不够时自动上翻也贴合 |
| 每个下拉 | **一个**自绘控件（工具条里 `.bench-rd`×5、`.mpw_select`×0；全页无「（空）」label） |
| 预览 | `#frame` 恒 16:9 且完整落在 `#stage-slot` 内（收起/展开输出都一样）；选 1920×1080 也完整可见 |
| 输出栏 | 行尾「清空 / 复制输出」**两态常驻**；「渲染器诊断（/diag）」是**真页签**，显示 `/api/diag-stream` 的渲染器消息 |
| 切换栏 | 只放已选/常用（当前 + ★ 固定项，位置固定）；`＋` 固定在最右端，点它**显式展开**库列表面板 |
| 左侧库 | 类型四档（全部=22 项：scene 11 / web 7 / video 4），每行有真实类型徽标 |
| 库来源 | `#lib-source` 写明四态之一：无后端 / **本机默认目录（你还没有选择）** / 你选的 / 空 |
| 设置弹层 | **双方共同署名**（本仓库作者 + 上游 oneincase/webwallgl MIT）+ 上游许可全文两个入口 |

### 7.3 仍然是"未证实项/待别的线"的

* **服务端进程已重启，`/api/fs/*` / `/api/library-source` 实测 200**（2026-09-19 复跑；前端两档都断言）：
  * `GET /api/fs/roots` ⇒ 200，4 个快捷根（当前库目录 / 宿主 home `listable:false` / 工作区 / 壁纸总目录）；
  * `GET /api/fs/list?path=…` ⇒ 200，库根 22 个目录；单击进子目录后路径与 `parent` 都更新；
  * `GET /api/library-source` ⇒ 200 `{source:"default", selected:false}` ⇒ 侧栏「库来源」渲染成
    "本机默认目录（你还没有选择）"（**没有假装已选**）。
  * 「选择文件夹」实测：应用内对话框列出 22 项 + 「就选这个目录」+ 4 个快捷根；服务端标 `listable:false`
    的根**灰显**（home，`MPW_PICK_ROOT` 可放宽）；两个兜底按钮（纯前端扫描 / **显式标注**的系统选择器）都在。
  * 路由 404 那一档（静态托管或服务端未落地）仍会明确写出"服务端还没有 /api/fs/* 这条路由" —— 门禁按
    实测状态**两档都判**（`bench-ui-headless` 的 F 组 F3a–F3d / F4a）。
* **旧产物的 `rt()` 只认 `hasScene`**：`kind: 'wallpaper'|'other'` 的条目在左侧列表里永远不出现（需要产物重建，
  或前端自建面板并自行拼 iframe URL —— 后者会绕开 `#current`/属性面板链路，需单独一批）。
* **web 类壁纸的 WE shim**：入口 HTML 挂上了，但渲染器打印「网页壁纸：同源入口未检测到 WE shim（host 未注入？）」
  ⇒ 属 `core/**`/宿主注入面（不是本批）。
* **不点「就选这个目录」**：门禁只断言按钮存在与浏览可用，**不 POST** `/api/library-dir`（那会真的换掉用户的库目录）。
* **真 X11 指针判定**（"用户拿鼠标点得到"）留给主对话的 `tests/x11-e2e/bench-click-test.mjs`；
  本节的可点性用 `elementFromPoint` + 合成事件证明。

---

## 8. web 类壁纸"真的能用"：把渲染器自带的 WE shim 注入同源 web 入口（P-160，2026-09-19）

> 只动 `demo/bench-patch.js`（+ 测试/台账/文档）。服务端与产物一行未改。

### 8.1 症状与真因（逐行可查）

挂 web 档（本机 3580207945）时渲染器自己打印：

```
scene http://127.0.0.1:8902/web/dev/3580207945/index.html:
  网页壁纸：同源入口未检测到 WE shim（host 未注入？）；Spine 类壁纸请确认 /web/ HTML 改写
```

minified 渲染器（`demo/assets/renderer-BOSoB05I.js`）里 web 档有两条路：

* `cw(src)` 为真（**同源**）⇒ `bo(..., {injected:true})` 直接 `<iframe src=入口>`，`load` 时检查
  `typeof frameWindow.__weSetPaused === 'function'` —— **期望宿主注入 shim**。测试台从不注入 ⇒ 告警 + 作者脚本拿不到 API。
* `cw(src)` 为假（跨源）⇒ 渲染器自己 `fetch(入口)` → `L1(html, N1, {baseHref, seedScript})` 把**它自带的 shim**
  （模块内 44.8 KB 常量 `N1`）插到 `<head>` 之后，再用 blob 文档加载。

### 8.2 修法（不抄第三方代码）

1. 纯函数 `shimFromRendererSource(assetText)`：在产物文本里按注释头定位那段模板字符串，按模板字符串规则
   **还原转义**（`decodeTemplateLiteral`，不用 `eval`），并校验契约（必须含 `__weSetPaused` +
   `wallpaperPropertyListener`）⇒ 拿到的就是渲染器自己会注入的**同一份字节**（44 811 B）。
2. 在**渲染器窗口**里包 `HTMLIFrameElement.prototype.src`（幂等）：命中同源 web 入口时先不导航，
   `fetch` 入口 HTML → `injectShimIntoHtml()`（插 `<base href>` + shim 脚本，幂等、非 HTML 拒绝）→
   `Blob` → 一次性导航到 blob 文档。
3. 跨源 / 取不回 / 非 HTML ⇒ 记 `reason` + 日志 + **回退裸 iframe**；blob URL 在 `load` 后 revoke。

### 8.3 判据（`bash tests/run-all-tests.sh --only bench-shell-fixes bench-ui-headless`）

* 真机（`bench-ui-headless` W 组 7 条）：
  * 渲染器日志里**没有**「未检测到 WE shim」、也没有「shim 注入失败」；
  * 壁纸 iframe = `blob:` 文档，含 `data-we-shim-src` 标记与 `<base href="…/web/dev/<id>/">`；
  * 壁纸窗口里 `__weSetPaused/__weSetFps/__weSetVolume` + `wallpaperPropertyListener` + `wallpaperRegisterAudioListener`
    + `wallpaperRequestRandomFileForProperty` + `__wePushPointer/__wePushWheel` 全部就位；
  * 在壁纸文档里挂监听后用真鼠标事件走一遍 ⇒ `{move:2, down:1}`（事件真的进到壁纸页）；
  * `window.__benchWebShim()` 读数：`{installed:true, injected:1, failed:0, shimBytes:44811, shimFrom:<产物URL>, reason:""}`。
* 无浏览器（`bench-shell-fixes` E 组 20 条 + B22–B25 + 变异⑤/⑥）：转义还原、真产物取 shim、注入决策（含
  `cross-origin` 如实拒绝）、注入形态（head/html/裸片段/幂等/`</script` 转义/非 HTML 拒绝）、运行期接线静态钉子。

### 8.4 仍然是"未证实项"

* 跨源 web 入口**做不到**（如实记 `cross-origin`，不假装成功）。
* 只验了 1 张 web 档；其它 web 档只做 API 名单级对齐（shim 自带的兼容层）。
* 画面正确性未做像素判定（只到 API 就位 + 文档加载 + 事件可达）。
* 鼠标可达 = 浏览器原生投递；与 WE 客户端的指针注入语义逐字一致属 `core/**`。
