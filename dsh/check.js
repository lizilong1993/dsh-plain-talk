// Reply checker for dsh-plain-talk.
//
// This is deliberately a checker, not a gate: it reports what a reader would
// stumble on, with the exact replacement form. The model decides what to keep.
//
// Three principles learned from real sessions in this workspace:
//  - Common terms and project names are not errors. Only opaque codes the
//    reader has never seen (M11, dev-1200, c590) need a first-use gloss.
//  - A pointer is not a citation: `file.py:42` alone sends the reader away.
//  - Cross-turn wording ("上述", "上一轮") is the main reason a report cannot
//    be read on its own.

const ALLOW = new Set([
  'api', 'json', 'jsonl', 'yaml', 'yml', 'html', 'css', 'http', 'https', 'url', 'uri',
  'cli', 'ui', 'ux', 'gpu', 'cpu', 'ram', 'ssd', 'hdd', 'ai', 'llm', 'sdk', 'ide',
  'csv', 'tsv', 'ts', 'js', 'py', 'sh', 'md', 'txt', 'png', 'jpg', 'jpeg', 'svg',
  'gif', 'webp', 'sql', 'xml', 'toml', 'npm', 'pnpm', 'git', 'ssh', 'dns', 'tcp',
  'udp', 'tls', 'ssl', 'jwt', 'oauth', 'cors', 'orm', 'crud', 'rest', 'grpc',
  'wasm', 'dom', 'smtp', 'imap', 'vpn', 'utf8', 'utf-8', 'utf16', 'utf-16',
  'sha1', 'sha256', 'sha-256', 'sha512', 'sha-512', 'md5', 'x86', 'x64', 'arm64',
  'mp3', 'mp4', 'pdf', 'h264', 'hevc', 'ipv4', 'ipv6', 'k8s', 'i18n', 'l10n',
  '2d', '3d', '4k', 'v1', 'v2', 'v3', 'v4', 'ci', 'pr', 'id', 'ok', 'vs', 'iso',
  'doi', 'arxiv', 'p50', 'p95', 'p99', '2x', '4x', '8x', '16x', 'gpt', 'llm',
  'linux', 'windows', 'macos', 'node', 'react', 'github', 'python', 'javascript',
  'typescript', 'docker', 'sqlite', 'postgres', 'redis',
])

const MODEL_FAMILY = /^(?:gpt|claude|gemini|llama|qwen|deepseek|mistral|phi|o1|o3|o4|glm|kimi|mimo|hy)\d*[-.]?\d*/i

const BACKREF_ZH = [
  '上述', '上面', '前述', '前文', '前面提到', '前面说', '之前提到', '之前说',
  '此前', '上一步', '上一轮', '前一轮', '刚才', '该方案', '该项', '该任务',
  '前者', '后者', '如上', '见上文', '先前', '那次', '前面', '之前',
]
const BACKREF_EN = [
  'as mentioned', 'aforementioned', 'as discussed', 'the above', 'previous step',
  'earlier', 'previously', 'the former', 'the latter',
]

const PLUMBING = [
  /\bsession[-_][0-9a-z-]{6,}/i,
  /子代理|子会话|父代理|父会话|\bsubagent\b|\bparent agent\b|report sent to/i,
  /\b(?:plain_talk_check|run_code|ops_bash|ops_grep|todo_write)\b/,
]

const PREAMBLE = /^(好的|好|当然|没问题|收到|明白|我来|让我|让我先|我们先|首先，我|先看一[下看])/
const CLOSER = /(需要我|要不要|如果你愿意|希望(这|以上)|随时告诉我|还需要我|要我继续)/

const FILE_EXT = 'py|js|mjs|cjs|ts|tsx|json|jsonl|md|ya?ml|toml|sh|ps1|bat|csv|tsv|txt|ipynb|log|html|css|tex|bib|pdf|zip|sql|db|pt|pth|ckpt|npy|npz|parquet|docx|xlsx|pptx'

const IDENT_PATTERNS = [
  ['file', new RegExp(`(?:[A-Za-z]:[\\\\/]|\\/)?[A-Za-z0-9_.-]+(?:[\\\\/][A-Za-z0-9_.-]+)*\\.(?:${FILE_EXT})\\b`, 'gi')],
  ['hash', /\b[0-9a-f]{7,40}\b/gi],
  ['snake', /\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g],
  ['camel', /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b(?:[A-Z][a-z0-9]+){2,}[A-Za-z0-9]*\b|\b[A-Z][a-z]+[A-Z]{2,}[A-Za-z0-9]*\b/g],
  ['acronym', /\b[A-Z]{2,8}\b/g],
  ['code', /\b[A-Za-z]{1,10}[-_.]?\d{1,6}[A-Za-z]?\b|\b\d{1,4}[A-Za-z]{1,6}\b/g],
]

export const LIMITS = {
  boxChars: 300,
  boxLines: 12,
  listRun: 5,
  identifierWarns: 8,
}

const cjkCount = (s) => (s.match(/[\u4e00-\u9fff]/g) ?? []).length
const latinCount = (s) => (s.match(/[A-Za-z]/g) ?? []).length
const len = (s) => [...s].length

function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
}

export function isCommonTerm(term) {
  const text = String(term ?? '').trim()
  if (!text) return false
  return ALLOW.has(text.toLowerCase()) || MODEL_FAMILY.test(text)
}

export function scanIdentifiers(input) {  const text = stripCode(String(input ?? ''))
  const found = []
  for (const [kind, re] of IDENT_PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(text))) {
      const raw = m[0].replace(/[.,;:]+$/, '')
      if (!raw) continue
      found.push({ kind, token: raw, start: m.index, end: m.index + raw.length })
    }
  }
  found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
  const accepted = []
  for (const item of found) {
    if (accepted.some((a) => item.start < a.end && item.end > a.start)) continue
    accepted.push(item)
  }
  return accepted
}

function isAllowed(token, known) {
  const lower = token.toLowerCase()
  if (ALLOW.has(lower)) return true
  if (MODEL_FAMILY.test(token)) return true
  // Durations and multipliers ("10m", "3s", "4x") are measurements, not names.
  if (/^\d+(?:ms|s|m|h|d|w|k|m|b|x)$/i.test(token)) return true
  // Product-style names (MechDW_V1, GeoEvidence_V2) are project vocabulary the
  // reader already holds; a lower-case internal key (tier_reaudit) is not.
  if (/^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/.test(token) && (token.match(/[A-Z]/g) ?? []).length >= 2) return true
  if (known && (known.has(token) || known.has(lower))) return true
  return false
}

function explainedAfter(text, end) {
  const after = text.slice(end, end + 60)
  const m = /^\s*[（(]([^）)]{4,})[）)]/.exec(after)
  if (!m) return false
  return cjkCount(m[1]) >= 3 || latinCount(m[1]) >= 8
}

function knownFrom(text, known) {
  return { text, known }
}

/**
 * Analyze one reply draft.
 *
 * @param draft - the reply text the model is about to send.
 * @param options - `knownTokens` (project/user vocabulary) and `language`
 *                  (`zh` when the user writes Chinese).
 * @returns issues plus the measurements the README benchmark reports.
 */
export function analyze(draft, options = {}) {
  const text = String(draft ?? '')
  const known = new Set((options.knownTokens ?? []).map((t) => String(t)))
  const knownLower = new Set([...known].map((t) => t.toLowerCase()))
  const language = options.language ?? 'unknown'
  const issues = []

  const add = (severity, rule, message, fix) => issues.push({ severity, rule, message, fix })

  const narrative = stripCode(text)

  // 1. Cross-turn wording.
  const backrefs = [
    ...BACKREF_ZH.filter((w) => narrative.includes(w)),
    ...BACKREF_EN.filter((w) => narrative.toLowerCase().includes(w)),
  ]
  if (backrefs.length) {
    add('error', 'backref', `出现回指词：${backrefs.slice(0, 5).join('、')}。`, '把指代的东西重新写一遍，读者没有前文可翻。')
  }

  // 2. Internal plumbing.
  const plumbing = PLUMBING.find((re) => re.test(narrative))
  if (plumbing) {
    add('error', 'internal', '出现会话号、子代理或工具名等内部信息。', '删掉；只写用户能看见的对象。')
  }

  // 3. Pointer-only citations.
  const pointers = []
  const pointerRe = new RegExp(`(?:[A-Za-z]:[\\\\/]|/)?[\\w.-]+(?:[\\\\/][\\w.-]+)*\\.(?:${FILE_EXT}):\\d+`, 'gi')
  pointerRe.lastIndex = 0
  let pm
  while ((pm = pointerRe.exec(text))) pointers.push(pm[0])
  if (pointers.length) {
    const unquoted = pointers.filter((pointer) => {
      const at = text.indexOf(pointer)
      const window = text.slice(Math.max(0, at - 220), at + pointer.length + 220)
      return !/「[^」]{4,}」|"[^"]{4,}"|『[^』]{4,}』|`[^`]{4,}`|```/.test(window)
    })
    if (unquoted.length) {
      add('error', 'citation', `只有位置没有原文：${unquoted.slice(0, 3).join('、')}。`, '把那几行原文贴出来，再标位置。')
    }
  }

  // 4. Unexplained opaque identifiers.
  const seen = new Set()
  const unknown = []
  for (const token of scanIdentifiers(narrative)) {
    if (seen.has(token.token)) continue
    seen.add(token.token)
    if (isAllowed(token.token, known) || isAllowed(token.token, knownLower)) continue
    if (explainedAfter(narrative, token.end)) continue
    unknown.push(token.token)
  }
  if (unknown.length) {
    add(
      'warn',
      'identifier',
      `有 ${unknown.length} 个代号没有说明：${unknown.slice(0, 6).join('、')}${unknown.length > 6 ? ' 等' : ''}。`,
      '第一次出现写成「M11（一句话说明它是什么）」；用户在本对话用过的词和项目名不用解释。',
    )
  }

  // 5. Shape.
  const lines = text.split('\n').filter((l) => l.trim())
  const cjk = cjkCount(narrative)
  if (cjk > LIMITS.boxChars || lines.length > LIMITS.boxLines) {
    add('warn', 'length', `回复有 ${cjk} 个汉字、${lines.length} 行，超过默认的 ${LIMITS.boxChars} 字 / ${LIMITS.boxLines} 行。`, '删掉读者不决策所需的内容；用户要细节时再展开。')
  }

  let run = 0
  let maxRun = 0
  for (const line of text.split('\n')) {
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) { run++; maxRun = Math.max(maxRun, run) } else if (!line.trim()) { run = 0 }
  }
  if (maxRun > LIMITS.listRun) {
    add('warn', 'list', `有一段列表 ${maxRun} 条，超过 5 条。`, '合并或只留最要紧的五条。')
  }

  const first = lines[0] ?? ''
  if (PREAMBLE.test(first)) {
    add('warn', 'preamble', `开头是「${first.slice(0, 20)}」，属于寒暄或过程宣告。`, '第一行直接给结论。')
  }
  const tail = text.slice(-180)
  const closer = CLOSER.exec(tail)
  if (closer) {
    add('warn', 'closer', `结尾出现「${closer[0]}」，在征求额外任务。`, '删掉；需要下一步就只给一个具体动作。')
  }

  // 6. Language mismatch.
  const total = cjk + latinCount(narrative)
  const cjkRatio = total === 0 ? 0 : cjk / total
  if (language === 'zh' && cjkRatio < 0.2 && latinCount(narrative) > 40) {
    add('warn', 'language', '用户用中文提问，但这条回复几乎全是英文。', '用中文写；命令、路径、报错原文保持原样。')
  }
  const hasNext = /下一步|接下来要|接下来请|你可以先|建议你先|Next step/i.test(text)
  if (!hasNext && (cjk > 200 || lines.length > 10)) {
    add('warn', 'next', '回复较长，但没有给出一个明确的下一步。', '结尾补一个用户现在就能做的事；没有就写"没有待办"。')
  }

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
    stats: {
      chars: text.length,
      cjk,
      lines: lines.length,
      cjkRatio: Number(cjkRatio.toFixed(3)),
      identifiers: unknown.length,
      backrefs: backrefs.length,
      maxListRun: maxRun,
      hasNext,
    },
  }
}

export { cjkCount, latinCount, len }
