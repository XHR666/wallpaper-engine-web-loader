// pkg-entry-index.mjs —— ①(P-135 丙 2026-09-19) 服务端两处单线程热点的公共底座
//
// 背景（docs/RENDER-BUGS-20260918.md §1.3 实测）：
//   · `/noise`（we-scene-demo-server.mjs 同名路由）旧实现**逐个整包 readFileSync + parsePkg**，
//     直到命中第一个 `*noise*.tex`。本机语料顺序下**实测 657.9MB/次**（235.4 + 59.5 + 320.6 + 42.4MB），
//     热缓存 1.05s、冷缓存数十秒，而且这几百 MB 分配发生在**单线程**服务里 —— 页面正在 await 它，
//     同时并发发的其它请求全部排队（"只有 loading"的观感来源之一）。
//   · `/shader/<id>/…` 旧实现**每请求**重读整包 + parsePkg（336MB 包 = 每请求 336MB，每包 4–8 次）。
//
// 本模块只做两件事，且**行为与旧实现逐位一致**（含 404/500 分支与字节内容）：
//   1) `tableFor(pkgPath)`：只读**目录表**（PKGV 的目录表在文件开头；64KB 起步，不够 ×4 倍增，
//      上限 8MB），按 (size, mtimeMs) 缓存 —— 之后同一包不再读一个字节。
//   2) `entryBytes(pkgPath, entry)`：只读**命中条目**那一段，再交给**生产解析器自身**
//      （parsePkg + readPkgEntry，同一个 pkg-extract 模块）算出返回值 —— 因此 LZ4 压缩条目、
//      未压缩条目、`flags/size` 判定全部与"整包 parsePkg"逐位相同（不是另写一套解压）。
//      做法：把该条目的原始字节拼成一个"单条目 PKGV"临时容器（目录表由本模块按格式写：magic +
//      count=1 + [nameLen,name,offset=0,length]），parsePkg 在这份真实字节上探测压缩链、readPkgEntry 取字节。
//
// 错误语义（**逐字保留**，否则 500 的响应体就变了）：
//   · 文件打不开 ⇒ `fs.openSync` 抛的 `ENOENT/EACCES: … open '<path>'`（与 readFileSync 同形）。
//   · 目录表解析失败 ⇒ 退回**旧路径**（整包 readFileSync + parsePkg）—— 让旧错误原样抛出。
//   · 任一条目越界 ⇒ 抛与 parsePkg 逐字相同的 `pkg: entry '<path>' out of bounds`（按目录表顺序取第一条）。
//   · pkg-extract 版本过老（没有导出的 parsePkgIndex）⇒ 全程退回旧路径（服务照样能起）。
//
// 可观测性：`stats()` 给出"这次请求到底读了多少字节/多少次"，新门禁
// tests/server-pkg-index-test.mjs 用它断言 `/noise` **只读命中条目**（不是整包）。
import fs from 'node:fs'

// 目录表首读窗口：本机最大包（320.6MB / 54 条目）目录表 3076B，最大条目数 255（15KB）⇒ 64KB 绰绰有余。
// 倍增上限：即使遇到异常大的目录表也只读到 8MB，绝不整包读。
export const PKG_HEAD_BYTES = 64 * 1024
export const PKG_MAX_HEAD_BYTES = 8 * 1024 * 1024

function encodeSizedString(s) {
  const body = Buffer.from(String(s), 'utf8')
  const head = Buffer.allocUnsafe(4)
  head.writeInt32LE(body.length, 0)
  return Buffer.concat([head, body])
}

/** 单条目 PKGV 容器：目录表 + 该条目原始字节（偏移相对 dataStart）。 */
function synthOneEntryPkg(magic, name, raw) {
  const magicBuf = encodeSizedString(magic)
  const nameBuf = encodeSizedString(name)
  const count = Buffer.allocUnsafe(4)
  count.writeInt32LE(1, 0)
  const off = Buffer.allocUnsafe(4); off.writeUInt32LE(0, 0)
  const len = Buffer.allocUnsafe(4); len.writeUInt32LE(raw.length, 0)
  return Buffer.concat([magicBuf, count, nameBuf, off, len, raw])
}

export function createPkgEntryIndex(opts = {}) {
  const { parsePkg, readPkgEntry, parsePkgIndex, indexCacheMax = 8 } = opts
  if (typeof parsePkg !== 'function' || typeof readPkgEntry !== 'function') {
    throw new Error('pkg-entry-index: 需要 pkg-extract 的 parsePkg/readPkgEntry')
  }
  const useIndex = typeof parsePkgIndex === 'function'
  const C = {
    indexAvailable: useIndex,
    tableReads: 0, tableBytes: 0,        // 目录表读取（真正落盘的字节）
    tableCacheHits: 0,
    entryReads: 0, entryBytes: 0,        // 单条目读取（只该等于命中条目的长度）
    noiseCacheHits: 0,
    legacyFallbacks: 0, legacyFallbackBytes: 0,
  }
  const tableCache = new Map()   // pkgPath -> { key, magic, dataStart, entries, fileSize, tableBytes }
  const noiseCache = new Map()   // pkgPath -> { key, entry|null }

  function stats() { return { ...C, indexAvailable: useIndex } }   // 快照（只读；门禁用它断言"读了多少字节"）
  function resetStats() {
    for (const k of Object.keys(C)) if (typeof C[k] === 'number') C[k] = 0
  }

  function statKey(st) { return st.size + ':' + Math.round(st.mtimeMs) }

  /** 只读 [at, at+len) —— 落盘字节的**唯一**计数点（表读与条目读都走它，kind 区分用途）。 */
  function readRange(fd, at, len, kind) {
    const out = Buffer.allocUnsafe(len)
    let got = 0
    while (got < len) {
      const n = fs.readSync(fd, out, got, len - got, at + got)
      if (n <= 0) break
      got += n
    }
    const buf = got === len ? out : out.subarray(0, got)
    if (kind === 'table') { C.tableReads++; C.tableBytes += buf.length }
    else { C.entryReads++; C.entryBytes += buf.length }
    return buf
  }

  /** 旧路径（**行为基准**）：整包读 + parsePkg；错误原样抛出（与改动前的 500/日志逐字一致）。 */
  function legacyTable(pkgPath, why) {
    C.legacyFallbacks++
    const buf = new Uint8Array(fs.readFileSync(pkgPath))
    C.legacyFallbackBytes += buf.length
    const entries = parsePkg(buf)   // 抛错 = 旧实现的错，原样冒泡
    return { key: 'legacy', magic: null, dataStart: 0, entries, fileSize: buf.length, tableBytes: buf.length, legacy: true, why }
  }

  /**
   * 目录表（缓存）：返回 { magic, dataStart, entries, fileSize, tableBytes, key, legacy }。
   * entries[].offset 是**绝对偏移**（与 parsePkg 同形）。
   */
  function tableFor(pkgPath) {
    let fd = null
    try { fd = fs.openSync(pkgPath, 'r') } catch (e) { throw e }   // 与 readFileSync 同形的 ENOENT/EACCES
    try {
      const st = fs.fstatSync(fd)
      const key = statKey(st)
      const hit = tableCache.get(pkgPath)
      if (hit && hit.key === key) { C.tableCacheHits++; return hit }
      if (!useIndex) {
        const rec = legacyTable(pkgPath, 'pkg-extract 未导出 parsePkgIndex')
        tableCache.set(pkgPath, rec)
        return rec
      }
      // ── 只读目录表（64KB 起步，×4 倍增；parsePkgIndex 容错截断，条目内容一律不读）──
      let n = Math.min(PKG_HEAD_BYTES, st.size)
      for (;;) {
        const head = readRange(fd, 0, n, 'table')
        let parsed = null, needMore = false
        try { parsed = parsePkgIndex(head, { tolerateTruncated: true }) }
        catch (e) {
          if (/unexpected end of data/.test(String((e && e.message) || ''))) needMore = true
          else {
            // 目录表本身非法（magic/count）：退回旧路径，让旧错误原样抛出
            const rec = legacyTable(pkgPath, '目录表非法: ' + (e && e.message))
            tableCache.set(pkgPath, rec)
            return rec
          }
        }
        if (parsed) {
          // 越界条目：旧 parsePkg 会抛 —— 逐字复刻（按目录表顺序取第一条，错误信息一致）
          for (const e of parsed.entries) {
            if (!(e.offset >= 0) || e.offset + e.compressedSize > st.size) {
              throw new Error("pkg: entry '" + e.path + "' out of bounds")
            }
          }
          const rec = {
            key, magic: parsed.magic, dataStart: parsed.dataStart, entries: parsed.entries,
            fileSize: st.size, tableBytes: parsed.dataStart, headBytes: head.length, legacy: false,
          }
          tableCache.set(pkgPath, rec)
          while (tableCache.size > indexCacheMax) tableCache.delete(tableCache.keys().next().value)
          return rec
        }
        if (needMore && n < st.size && n < PKG_MAX_HEAD_BYTES) { n = Math.min(st.size, n * 4); continue }
        const rec2 = legacyTable(pkgPath, '目录表超窗口（已读 ' + n + ' 字节）')
        tableCache.set(pkgPath, rec2)
        return rec2
      }
    } finally { try { fs.closeSync(fd) } catch (e) { /* ignore */ } }
  }

  /** 命中条目的**精确字节**（与"整包 readFileSync + parsePkg + readPkgEntry"逐位相同）。 */
  function entryBytes(pkgPath, entry) {
    if (!entry || typeof entry.path !== 'string') throw new Error('pkg-entry-index: 非法条目')
    const rec = tableFor(pkgPath)             // 缓存命中 ⇒ 0 字节
    const len = entry.compressedSize
    let fd = null
    try { fd = fs.openSync(pkgPath, 'r') } catch (e) { throw e }
    let raw
    try { raw = readRange(fd, entry.offset, len, 'entry') } finally { try { fs.closeSync(fd) } catch (e) { /* ignore */ } }
    if (raw.length !== len) throw new Error("pkg: entry '" + entry.path + "' 读取不足（要 " + len + ' 字节，得 ' + raw.length + '）')
    // magic：正常路径来自目录表；旧路径记录没有它 ⇒ 只读前 12 字节拿一次（4B 长度前缀 + 8B 'PKGVxxxx'）
    let magic = rec.magic
    if (!magic && !rec.legacy) magic = 'PKGV0000'
    if (!magic) {
      let fd2 = null
      try {
        fd2 = fs.openSync(pkgPath, 'r')
        const head = readRange(fd2, 0, 12, 'table')
        const n = head.readInt32LE(0)
        magic = (n > 0 && n <= 16 && 4 + n <= head.length) ? head.subarray(4, 4 + n).toString('utf8') : 'PKGV0000'
      } catch (e) { magic = 'PKGV0000' } finally { try { fs.closeSync(fd2) } catch (e) { /* ignore */ } }
    }
    const synthetic = synthOneEntryPkg(magic, entry.path, raw)
    const one = parsePkg(new Uint8Array(synthetic.buffer, synthetic.byteOffset, synthetic.byteLength))
    return readPkgEntry(synthetic, one[0])
  }

  /** `/noise` 语义（与旧实现同一判定、同一顺序）：第一个 `/noise/i` 且 `.tex` 结尾的条目。 */
  function noiseEntry(pkgPath) {
    const rec = tableFor(pkgPath)
    const hit = noiseCache.get(pkgPath)
    if (hit && hit.key === rec.key) { C.noiseCacheHits++; return hit.entry }
    const e = rec.entries.find((x) => /noise/i.test(x.path) && x.path.toLowerCase().endsWith('.tex')) || null
    noiseCache.set(pkgPath, { key: rec.key, entry: e })
    return e
  }

  return { tableFor, entryBytes, noiseEntry, stats, resetStats }
}

export default { createPkgEntryIndex, PKG_HEAD_BYTES, PKG_MAX_HEAD_BYTES }
