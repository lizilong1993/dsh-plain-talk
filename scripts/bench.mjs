#!/usr/bin/env node
// Benchmark: run the same prompts through the headless profile with the
// plain-talk switch on and off, then read the resulting session logs for token
// usage and the final reply.
//
// Usage:
//   node scripts/bench.mjs           # all scenarios, both modes
//   node scripts/bench.mjs A C       # selected scenarios
//
// Requires: dsh on PATH, the plugin installed in the `headless` profile, and
// the same workspace directory for every run.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { analyze } from '../dsh/check.js'

const BENCH_DIR = 'C:/Users/lizilong/Downloads/plain-talk-bench'
const SESSION_ROOT = join(homedir(), '.dsh', 'sessions', '--C-Users-lizilong-Downloads-plain-talk-bench--')
const VOCAB = join(homedir(), '.dsh', 'plain-talk-vocab.json')
const OUT = 'C:/Users/lizilong/Downloads/dsh-plain-talk/scripts/bench-result.json'

const SCENARIOS = {
  A: '在工作区创建 bench-demo 目录，里面放三个文件：a.txt 写 A、b.txt 写 B、c.txt 写 C；再写一个 check.mjs 读取三个文件并按 ABC 顺序打印；运行它确认输出 ABC；最后向我汇报这次任务的结果。',
  B: '查看工作区里的 dsh-plain-talk 目录，汇报它的文件结构、每个目录的用途，以及你认为缺什么。不要修改任何文件。',
  C: '用不超过两段话解释：为什么大语言模型在长对话里会忘记早期内容。',
  D: '读取 draft.md，把这份草稿整理成给我的最终汇报，直接给结论。',
}

const chosen = process.argv.slice(2).filter((x) => SCENARIOS[x])
const ids = chosen.length ? chosen : Object.keys(SCENARIOS)

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd]

function decodeSession(path) {
  const buf = readFileSync(path)
  const offsets = []
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] === MAGIC[0] && buf[i + 1] === MAGIC[1] && buf[i + 2] === MAGIC[2] && buf[i + 3] === MAGIC[3]) offsets.push(i)
  }
  const events = []
  for (let k = 0; k < offsets.length; k++) {
    const start = offsets[k]
    const end = k + 1 < offsets.length ? offsets[k + 1] : buf.length
    let text = null
    try { text = zstdDecompressSync(buf.subarray(start, end)).toString('utf8') } catch { continue }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try { events.push(JSON.parse(line)) } catch { /* skip */ }
    }
  }
  return events
}

const textOf = (message) => {
  if (!message || !Array.isArray(message.content)) return ''
  return message.content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n').trim()
}

function newestSession(since) {
  if (!statSync(SESSION_ROOT, { throwIfNoEntry: false })) return undefined
  let best
  for (const dir of readdirSync(SESSION_ROOT)) {
    const path = join(SESSION_ROOT, dir)
    const candidates = readdirSync(path).filter((f) => /^session\.v[34]\.jsonl\.zstd$/.test(f))
    for (const name of candidates) {
      const file = join(path, name)
      const st = statSync(file, { throwIfNoEntry: false })
      if (!st || st.mtimeMs < since) continue
      if (!best || st.mtimeMs > best.mtimeMs) best = { dir, file, mtimeMs: st.mtimeMs }
    }
  }
  return best
}

function summarize(sessionPath) {
  const events = decodeSession(sessionPath)
  let outputTokens = 0
  let inputTokens = 0
  let steps = 0
  let toolCalls = 0
  let finalText = ''
  for (const ev of events) {
    if (ev.type === 'assistant/message') {
      const usage = ev.data?.usage
      if (usage) {
        outputTokens += Number(usage.outputTokens ?? 0)
        inputTokens += Number(usage.inputTokens ?? 0)
      }
      const text = textOf(ev.data?.message)
      if (text) finalText = text
    }
    if (ev.type === 'step/start') steps += 1
    if (ev.type === 'tool/call') toolCalls += 1
  }
  const stats = analyze(finalText, { language: 'zh' }).stats
  return { finalText, outputTokens, inputTokens, steps, toolCalls, stats }
}

const results = []
let previous = []
try { previous = JSON.parse(readFileSync(OUT, 'utf8')) } catch { previous = [] }
mkdirSync(BENCH_DIR, { recursive: true })

for (const id of ids) {
  for (const mode of ['off', 'on']) {
    // Start each run from the same vocabulary: the checker must not learn
    // from the previous arm of the comparison.
    rmSync(VOCAB, { force: true })
    const since = Date.now() - 1000
    const env = { ...process.env, PLAIN_TALK_DEFAULT: mode === 'on' ? 'on' : 'off' }
    let stdout = ''
    const started = Date.now()
    try {
      const command = process.platform === 'win32' ? 'cmd.exe' : 'dsh'
      const args = process.platform === 'win32'
        ? ['/d', '/c', 'dsh', '--profile', 'headless', SCENARIOS[id]]
        : ['--profile', 'headless', SCENARIOS[id]]
      stdout = execFileSync(command, args, {
        cwd: BENCH_DIR,
        env,
        encoding: 'utf8',
        timeout: 480000,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      stdout = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
    }
    const elapsedMs = Date.now() - started
    const session = newestSession(since)
    const summary = session ? summarize(session.file) : { finalText: stdout.trim(), outputTokens: 0, inputTokens: 0, steps: 0, toolCalls: 0, stats: {} }
    results.push({ id, mode, elapsedMs, ...summary, session: session?.dir })
    console.log(`${id} ${mode}: ${summary.stats.chars ?? 0} chars, out ${summary.outputTokens} tok, in ${summary.inputTokens} tok, ${elapsedMs} ms`)
    const merged = [...previous.filter((r) => !(r.id === id && r.mode === mode)), ...results]
    writeFileSync(OUT, JSON.stringify(merged, null, 2))
  }
}

writeFileSync(OUT, JSON.stringify(results, null, 2))
console.log(`\nwrote ${OUT}`)
