// dsh-plain-talk — host half.
//
// Four jobs:
//  - one persisted switch per Session (`$DSH_HOME/plain-talk.json`) that the
//    composer button flips over the loopback state route;
//  - one system-prompt section whose text appears only while that Session's
//    switch is on;
//  - one user vocabulary (`$DSH_HOME/plain-talk-vocab.json`) shared by every
//    Session, so "the user already knows this word" survives restarts;
//  - two optional tools: a reply self-check and vocabulary maintenance.
//
// Research requests are two-phase: "调研 X" marks X pending for that Session,
// so the first reply must still explain it; the next turn end promotes X into
// the vocabulary.
//
// The plugin writes no session events: switches and vocabulary are sidecar
// files, and the prompt section is derived state.

import { readFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { RULES } from './rules.js'
import { analyze, scanIdentifiers, isCommonTerm } from './check.js'
import {
  CATEGORIES,
  addTerm,
  knownSet,
  listByCategory,
  loadVocab,
  markPending,
  pendingFor,
  promotePending,
  removeTerm,
  saveVocab,
  setCategory,
  researchTargets,
} from './vocab.js'

export const name = 'plain-talk'

// systemPrompt and tools are required; webServer is reached through ctx.inject
// so the plugin still mounts in profiles without the Web surface.
export const inject = ['systemPrompt', 'tools']

const SECTION_NAME = 'plain-talk'
// After the persona (0) and next to the other reply-style sections, before
// tool guidance (100+).
const SECTION_ORDER = 55

const ROUTE_STATE = '/plain-talk/state'
const MAX_BODY = 8 * 1024
const MAX_SESSIONS = 256

/** New Sessions start with the mode on; a click records an explicit choice.
 *  PLAIN_TALK_DEFAULT=off makes unseen Sessions start off (benchmarks and
 *  opt-in setups); any click still records an explicit per-Session choice. */
const DEFAULT_ON = String(process.env.PLAIN_TALK_DEFAULT ?? 'on').toLowerCase() !== 'off'

function dshHome() {
  return process.env.DSH_HOME && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
}

function statePath() {
  return join(dshHome(), 'plain-talk.json')
}

function vocabPath() {
  return join(dshHome(), 'plain-talk-vocab.json')
}

function emptyState() {
  return { version: 1, sessions: {} }
}

function readState() {
  try {
    const parsed = JSON.parse(readFileSync(statePath(), 'utf8'))
    const raw = parsed && typeof parsed === 'object' && parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {}
    const sessions = {}
    for (const [id, value] of Object.entries(raw)) {
      if (typeof id === 'string' && id.length > 0 && typeof value === 'boolean') sessions[id] = value
    }
    return { version: 1, sessions }
  } catch {
    // A missing, unreadable or malformed file reads as "no choices recorded";
    // DEFAULT_ON then applies, and a broken file can never lock the mode on.
    return emptyState()
  }
}

function sessionEnabled(state, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return false
  if (Object.prototype.hasOwnProperty.call(state.sessions, sessionId)) return state.sessions[sessionId] === true
  return DEFAULT_ON
}

function persistJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmp, file)
}

function setSessionEnabled(state, sessionId, enabled) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('sessionId is required')
  const sessions = { ...state.sessions }
  sessions[sessionId] = enabled === true
  while (Object.keys(sessions).length > MAX_SESSIONS) {
    const oldest = Object.keys(sessions)[0]
    if (oldest === undefined) break
    delete sessions[oldest]
  }
  const next = { version: 1, sessions }
  persistJson(statePath(), next)
  return next
}

function sessionIdOf(context) {
  const agent = context === undefined || context === null ? undefined : context.agent
  if (agent === undefined || agent === null) return undefined
  const direct = agent.session !== undefined && agent.session !== null ? agent.session.id : undefined
  if (typeof direct === 'string' && direct.length > 0) return direct
  if (typeof agent.id === 'string' && agent.id.length > 0) return agent.id
  return undefined
}

/** The Session's directory, when the runtime exposes it. */
function cwdOf(agent) {
  const session = agent && agent.session
  const header = session && session.header
  const value = (header && header.cwd) || (session && session.cwd) || (agent && agent.cwd)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function projectName(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) return undefined
  const parts = cwd.split(/[\\/]/).filter(Boolean)
  const last = parts[parts.length - 1]
  return last && last.length >= 3 ? last : undefined
}

function textOf(message) {
  if (!message || !Array.isArray(message.content)) return ''
  return message.content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n')
}

function isLoopback(req) {
  const address = req && req.socket ? req.socket.remoteAddress : undefined
  if (typeof address !== 'string') return false
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) return undefined
    chunks.push(chunk)
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

const VALID_SESSION_ID = /^[A-Za-z0-9_.:-]{1,200}$/

export function apply(ctx) {
  let state = readState()
  let userVocab = loadVocab(vocabPath())

  // Language mix per Session. Vocabulary is profile-wide; this is not.
  const language = new Map()

  const rememberUserText = (sessionId, text) => {
    if (!sessionId || !text) return
    const entry = language.get(sessionId) ?? { zh: 0, latin: 0 }
    entry.zh += (text.match(/[\u4e00-\u9fff]/g) ?? []).length
    entry.latin += (text.match(/[A-Za-z]/g) ?? []).length
    language.set(sessionId, entry)
    while (language.size > MAX_SESSIONS) {
      const oldest = language.keys().next().value
      if (oldest === undefined) break
      language.delete(oldest)
    }

    // Research subjects stay unknown until this turn's reply is delivered.
    const targets = researchTargets(text).filter((term) => !isCommonTerm(term))
    for (const term of targets) markPending(userVocab, sessionId, term)

    // Everything else the user typed is vocabulary they already hold.
    const pending = new Set(targets)
    for (const found of scanIdentifiers(text)) {
      if (found.token.includes('/') || found.token.includes('\\')) continue
      if (pending.has(found.token)) continue
      addTerm(userVocab, found.token, { session: sessionId, source: 'user' })
    }
    saveVocab(vocabPath(), userVocab)
  }

  const knownFor = (sessionId, agent) => {
    const tokens = new Set(knownSet(userVocab, sessionId))
    const project = projectName(cwdOf(agent))
    if (project) tokens.add(project)
    return [...tokens]
  }

  const languageFor = (sessionId) => {
    const entry = language.get(sessionId)
    if (!entry) return 'unknown'
    const total = entry.zh + entry.latin
    if (total === 0) return 'unknown'
    return entry.zh / total >= 0.3 ? 'zh' : 'en'
  }

  ctx.effect(() => ctx.on('session/event', (session, event) => {
    if (!event || event.type !== 'user/message') return
    const sessionId = session?.id ?? session?.sessionId
    const text = textOf(event.data)
    if (!sessionId || !text) return
    // Only the human's own words count as vocabulary. Approval notices,
    // runtime reminders and time-sampled injects are not the user's language.
    const source = event.data?.source
    if (source && source.kind !== 'user') return
    if (/^(?:Time sampled|Elapsed since|Current runtime context|Current working directory|<system-reminder>)/i.test(text.trim())) return
    rememberUserText(String(sessionId), text)
  }))

  // Turn end: the reply has been sent, so a research subject is now known.
  ctx.effect(() => ctx.on('agent/turn-stopping', (payload) => {
    const sessionId = payload?.agent?.id
    if (!sessionId) return
    const promoted = promotePending(userVocab, String(sessionId), { cwdName: projectName(cwdOf(payload.agent)) })
    if (promoted.length > 0) saveVocab(vocabPath(), userVocab)
  }))

  // Prompt section: empty string when the Session has the switch off.
  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text: (context) => {
      try {
        const sessionId = sessionIdOf(context)
        if (!sessionId) return ''
        return sessionEnabled(state, sessionId) ? RULES : ''
      } catch {
        return ''
      }
    },
  }))

  // Loopback state route used by the composer button.
  ctx.inject(['webServer'], (scope) => {
    const server = scope.webServer
    if (!server || typeof server.register !== 'function') return
    scope.effect(() => server.register({
      kind: 'exact',
      path: ROUTE_STATE,
      handler: async (req, res) => {
        try {
          if (!isLoopback(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' })
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')
          if (req.method === 'GET') {
            const sessionId = url.searchParams.get('sessionId')
            if (!sessionId || !VALID_SESSION_ID.test(sessionId)) {
              return sendJson(res, 400, { ok: false, error: 'sessionId is required' })
            }
            return sendJson(res, 200, {
              ok: true,
              sessionId,
              enabled: sessionEnabled(state, sessionId),
              defaultOn: DEFAULT_ON,
            })
          }
          if (req.method === 'POST') {
            const body = await readJson(req)
            if (!body) return sendJson(res, 400, { ok: false, error: 'invalid JSON body' })
            const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
            if (!VALID_SESSION_ID.test(sessionId)) {
              return sendJson(res, 400, { ok: false, error: 'sessionId is required' })
            }
            if (typeof body.enabled !== 'boolean') {
              return sendJson(res, 400, { ok: false, error: 'enabled must be a boolean' })
            }
            state = setSessionEnabled(state, sessionId, body.enabled)
            return sendJson(res, 200, { ok: true, sessionId, enabled: body.enabled, defaultOn: DEFAULT_ON })
          }
          return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        } catch (error) {
          return sendJson(res, 500, { ok: false, error: error?.message ?? 'state route failed' })
        }
      },
    }))
  })

  // Optional self-check tool.
  ctx.effect(() => ctx.tools.register({
    name: 'plain_talk_check',
    description:
      'Self-check one reply draft against the plain-talk rules before sending it. ' +
      'Call it for a completion report or any reply longer than about 12 lines. ' +
      'It reports cross-turn wording, internal identifiers, pointer-only citations, ' +
      'unexplained opaque codes, and length/shape problems. All user-facing strings are Chinese.',
    parameters: {
      type: 'object',
      properties: {
        draft: { type: 'string', description: 'The full reply text you are about to send.' },
      },
      required: ['draft'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                severity: { type: 'string' },
                rule: { type: 'string' },
                message: { type: 'string' },
                fix: { type: 'string' },
              },
            },
          },
          stats: {
            type: 'object',
            properties: {
              chars: { type: 'number' },
              cjk: { type: 'number' },
              lines: { type: 'number' },
              cjkRatio: { type: 'number' },
              identifiers: { type: 'number' },
              backrefs: { type: 'number' },
              maxListRun: { type: 'number' },
              hasNext: { type: 'boolean' },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderCheck(value) }],
    },
    async execute(args, exec) {
      const draft = typeof args?.draft === 'string' ? args.draft : ''
      const sessionId = exec?.agent?.id ? String(exec.agent.id) : ''
      const result = analyze(draft, {
        knownTokens: knownFor(sessionId, exec?.agent),
        language: languageFor(sessionId),
      })
      return result
    },
  }))

  // Vocabulary maintenance.
  ctx.effect(() => ctx.tools.register({
    name: 'plain_talk_vocab',
    description:
      'Read or maintain the user vocabulary that decides which terms no longer need an explanation. ' +
      'Categories: common (built in), domain, project, internal, unclassified. ' +
      'Use action=list to show it, add/remove/classify to correct it. All user-facing strings are Chinese.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'remove', 'classify'] },
        terms: { type: 'array', items: { type: 'string' }, description: 'Terms for add/remove.' },
        term: { type: 'string', description: 'One term for classify.' },
        category: { type: 'string', enum: Object.keys(CATEGORIES) },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          text: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }],
    },
    async execute(args, exec) {
      const action = String(args?.action ?? '')
      const sessionId = exec?.agent?.id ? String(exec.agent.id) : ''
      const cwdName = projectName(cwdOf(exec?.agent))

      if (action === 'list') {
        const groups = listByCategory(userVocab)
        const total = Object.keys(userVocab.terms).length
        const lines = [`词汇清单：已记录 ${total} 条；本会话待确认 ${pendingFor(userVocab, sessionId).length} 条。`]
        for (const [key, label] of Object.entries(CATEGORIES)) {
          const items = groups[key] ?? []
          if (key === 'common') {
            lines.push(`${label}：内置常用词（不占文件），例如 arXiv、DOI、API。`)
            continue
          }
          if (items.length === 0) {
            lines.push(`${label}：0 条`)
            continue
          }
          const shown = items.slice(0, 12).map((item) => `${item.term}(${item.count})`).join('、')
          lines.push(`${label}：${items.length} 条 — ${shown}${items.length > 12 ? ' …' : ''}`)
        }
        const pending = pendingFor(userVocab, sessionId)
        if (pending.length) lines.push(`本次调研、尚未转为已知：${pending.join('、')}`)
        return { ok: true, text: lines.join('\n') }
      }

      if (action === 'add') {
        const terms = (Array.isArray(args?.terms) ? args.terms : []).map((t) => String(t).trim()).filter(Boolean)
        if (terms.length === 0) return { ok: false, text: '没有要加入的词：给 terms 一个非空数组。' }
        for (const term of terms) addTerm(userVocab, term, { session: sessionId, cwdName, source: 'manual' })
        saveVocab(vocabPath(), userVocab)
        return { ok: true, text: `已加入 ${terms.length} 条：${terms.join('、')}` }
      }

      if (action === 'remove') {
        const terms = (Array.isArray(args?.terms) ? args.terms : []).map((t) => String(t).trim()).filter(Boolean)
        if (terms.length === 0) return { ok: false, text: '没有要删除的词：给 terms 一个非空数组。' }
        for (const term of terms) removeTerm(userVocab, term)
        saveVocab(vocabPath(), userVocab)
        return { ok: true, text: `已删除 ${terms.length} 条：${terms.join('、')}` }
      }

      if (action === 'classify') {
        const term = String(args?.term ?? '').trim()
        const category = String(args?.category ?? '')
        if (!term || !CATEGORIES[category]) {
          return { ok: false, text: '需要 term 和有效 category（common/domain/project/internal/unclassified）。' }
        }
        if (!userVocab.terms[term]) addTerm(userVocab, term, { session: sessionId, cwdName, category, source: 'manual' })
        else setCategory(userVocab, term, category)
        saveVocab(vocabPath(), userVocab)
        return { ok: true, text: `已把「${term}」归到「${CATEGORIES[category]}」。` }
      }

      return { ok: false, text: `未知 action「${action}」。用 list / add / remove / classify。` }
    },
  }))

  console.log(`[plain-talk] host active (default ${DEFAULT_ON ? 'on' : 'off'}; section ${SECTION_NAME}@${SECTION_ORDER}; vocab ${Object.keys(userVocab.terms).length} terms)`)
}

function renderCheck(value) {
  const issues = Array.isArray(value?.issues) ? value.issues : []
  const stats = value?.stats ?? {}
  if (issues.length === 0) {
    return `说人话自检：通过。\n字数 ${stats.chars ?? 0}，行数 ${stats.lines ?? 0}，未解释代号 ${stats.identifiers ?? 0}，回指 ${stats.backrefs ?? 0}。`
  }
  const errors = issues.filter((i) => i.severity === 'error').length
  const warns = issues.length - errors
  const lines = [`说人话自检：${errors} 个必须改，${warns} 个建议改。`, '']
  for (const issue of issues) {
    lines.push(`[${issue.severity === 'error' ? '必须改' : '建议改'}] ${issue.message}`)
    if (issue.fix) lines.push(`  改法：${issue.fix}`)
  }
  return lines.join('\n')
}
