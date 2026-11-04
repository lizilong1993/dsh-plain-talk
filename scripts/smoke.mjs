#!/usr/bin/env node
// Smoke test: exercises dsh-plain-talk without the Harness.
//
// 1. checker — back-references, internal ids, pointer-only citations are
//    errors; opaque codes are warnings; common terms, project names and words
//    the user typed are not flagged.
// 2. host — default-on section, per-session switch over the loopback route,
//    persistence, tool registration, and user-vocabulary forgiveness.

import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let failures = 0
function check(label, ok) {
  console.log((ok ? 'ok   ' : 'FAIL ') + label)
  if (!ok) failures++
}

const { analyze, scanIdentifiers } = await import('../dsh/check.js')
const { RULES } = await import('../dsh/rules.js')
const plugin = await import('../dsh/index.js')

// --- 1. checker -------------------------------------------------------------

const base = {
  headline: '结论：这件事做完了。',
}

const backref = analyze('结论：按上述方案完成。', base)
check('back-reference is an error', backref.issues.some((i) => i.rule === 'backref' && i.severity === 'error'))

const internal = analyze('结论：已完成。结果已发给子代理 session-abc12345。', base)
check('internal session/subagent is an error', internal.issues.some((i) => i.rule === 'internal' && i.severity === 'error'))

const pointer = analyze('结论：已修复。改动在 src/auth.ts:42。', base)
check('pointer without a quote is an error', pointer.issues.some((i) => i.rule === 'citation' && i.severity === 'error'))

const quoted = analyze('结论：已修复。src/auth.ts:42 写着 `if (!token) return 401`。', base)
check('pointer with a pasted line passes', !quoted.issues.some((i) => i.rule === 'citation'))

const opaque = analyze('结论：M11 和 dev-1200 都跑完了，c590 也通过了。', base)
const opaqueIssue = opaque.issues.find((i) => i.rule === 'identifier')
check('opaque codes are warned', opaqueIssue?.severity === 'warn')
check('opaque warning lists all three', /M11/.test(opaqueIssue?.message ?? '') && /dev-1200/.test(opaqueIssue?.message ?? '') && /c590/.test(opaqueIssue?.message ?? ''))

const explained = analyze('结论：M11（把实例验证加进推理流程的实验）跑完了。', base)
check('inline gloss clears the warning', !explained.issues.some((i) => i.rule === 'identifier'))

const common = analyze('结论：arXiv 上的论文和 DOI 都对上了，MechDW_V1 仓库也能打开。', base)
check('arXiv / DOI / project name are not flagged', !common.issues.some((i) => i.rule === 'identifier'))

const known = analyze('结论：M11 跑完了，dev-1200 也跑完了。', { knownTokens: ['M11', 'dev-1200'] })
check('words the user already used are not flagged', !known.issues.some((i) => i.rule === 'identifier'))

const english = analyze('Conclusion: the task is done and all checks passed. '.repeat(6), { language: 'zh' })
check('English-only reply for a Chinese user is warned', english.issues.some((i) => i.rule === 'language'))

const shape = analyze(['好的，我来看看。', '- a', '- b', '- c', '- d', '- e', '- f', '结论：做完了。需要我继续吗？'].join('\n'))
check('preamble is warned', shape.issues.some((i) => i.rule === 'preamble'))
check('overlong list is warned', shape.issues.some((i) => i.rule === 'list'))
check('closing offer is warned', shape.issues.some((i) => i.rule === 'closer'))

const long = analyze('结论：这是一段很长的说明。'.repeat(40))
check('long reply is warned', long.issues.some((i) => i.rule === 'length'))

check('scan finds code-shaped and path tokens', scanIdentifiers('M11 和 src/a.ts:9').length >= 2)

// --- 2. host ----------------------------------------------------------------

const home = mkdtempSync(join(tmpdir(), 'dsh-plain-talk-smoke-'))
process.env.DSH_HOME = home

function mockCtx() {
  const state = { sections: [], tools: new Map(), routes: new Map(), listeners: new Map(), disposers: [] }
  const scope = {
    effect(fn) { const d = fn(); state.disposers.push(d); return d },
    webServer: {
      register(route) { state.routes.set(route.path, route); return () => state.routes.delete(route.path) },
    },
  }
  const ctx = {
    state,
    systemPrompt: {
      section(spec) { state.sections.push(spec); return () => {} },
    },
    tools: {
      register(tool) { state.tools.set(tool.name, tool); return () => {} },
    },
    on(event, fn) { state.listeners.set(event, fn); return () => {} },
    effect(fn) { const d = fn(); state.disposers.push(d); return d },
    inject(deps, cb) { if (deps.includes('webServer')) cb(scope) },
  }
  return ctx
}

function mockRequest({ method, url, body, ip = '127.0.0.1' }) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method,
    url,
    socket: { remoteAddress: ip },
    async *[Symbol.asyncIterator]() { for (const c of chunks) yield c },
  }
}

function mockResponse() {
  return {
    statusCode: 0,
    headers: {},
    payload: undefined,
    setHeader(k, v) { this.headers[k] = v },
    end(text) { this.payload = JSON.parse(text) },
  }
}

const ctx = mockCtx()
plugin.apply(ctx)

check('registers the prompt section', ctx.state.sections.length === 1 && ctx.state.sections[0].name === 'plain-talk')
check('registers plain_talk_check', ctx.state.tools.has('plain_talk_check'))
check('registers the state route', ctx.state.routes.has('/plain-talk/state'))

const sectionText = (sessionId) => ctx.state.sections[0].text({ agent: { id: sessionId } })
check('a new session starts on', sectionText('s1') === RULES)
check('a missing session id yields no section', sectionText(undefined) === '')

const route = ctx.state.routes.get('/plain-talk/state')
const res1 = mockResponse()
await route.handler(mockRequest({ method: 'GET', url: '/plain-talk/state?sessionId=s1' }), res1)
check('GET reports the default state', res1.payload?.enabled === true)

const res2 = mockResponse()
await route.handler(mockRequest({ method: 'POST', url: '/plain-talk/state', body: { sessionId: 's1', enabled: false } }), res2)
check('POST flips the session off', res2.payload?.enabled === false)
check('the section disappears for that session', sectionText('s1') === '')
check('another session is unaffected', sectionText('s2') === RULES)

const stored = JSON.parse(readFileSync(join(home, 'plain-talk.json'), 'utf8'))
check('state is persisted per session', stored.sessions.s1 === false)

const res3 = mockResponse()
await route.handler(mockRequest({ method: 'POST', url: '/plain-talk/state', body: { sessionId: 's1', enabled: true } }), res3)
check('POST flips it back on', sectionText('s1') === RULES)

const res4 = mockResponse()
await route.handler(mockRequest({ method: 'POST', url: '/plain-talk/state', body: { sessionId: 's1', enabled: true }, ip: '10.0.0.1' }), res4)
check('non-loopback requests are refused', res4.statusCode === 403)

const res5 = mockResponse()
await route.handler(mockRequest({ method: 'POST', url: '/plain-talk/state' , body: { enabled: true } }), res5)
check('missing sessionId is refused', res5.statusCode === 400)

// A fresh mount keeps the persisted choice (default only applies to unseen ids).
const ctx2 = mockCtx()
plugin.apply(ctx2)
check('restart keeps the recorded choice', ctx2.state.sections[0].text({ agent: { id: 's1' } }) === RULES)
check('restart keeps the default for unseen sessions', ctx2.state.sections[0].text({ agent: { id: 's9' } }) === RULES)

// User vocabulary: after the user says "M11", the checker stops warning.
const listener = ctx.state.listeners.get('session/event')
listener({ id: 's3' }, { type: 'user/message', data: { content: [{ type: 'text', text: '请把 M11（实例验证实验）跑一遍' }] } })
const tool = ctx.state.tools.get('plain_talk_check')
const toolResult = await tool.execute({ draft: '结论：M11 跑完了。' }, { agent: { id: 's3' } })
check('tool accepts a word the user just used', !toolResult.issues.some((i) => i.rule === 'identifier'))

const toolResult2 = await tool.execute({ draft: '结论：XR-88 跑完了。' }, { agent: { id: 's4' } })
check('an unseen code is still warned in another session', toolResult2.issues.some((i) => i.rule === 'identifier'))

// --- research vocabulary: unknown on the first reply, known after it ---------
const sessionEvent = ctx.state.listeners.get('session/event')
const turnStopping = ctx.state.listeners.get('agent/turn-stopping')
check('registers the turn-stopping listener', typeof turnStopping === 'function')

sessionEvent({ id: 's5' }, { type: 'user/message', data: { content: [{ type: 'text', text: '帮我调研 XR-77 这个实验' }] } })
const beforeTurnEnd = await tool.execute({ draft: '结论：XR-77 跑完了。' }, { agent: { id: 's5' } })
check('a research subject is unknown on the first reply', beforeTurnEnd.issues.some((i) => i.rule === 'identifier'))

await turnStopping({ agent: { id: 's5' } })
const afterTurnEnd = await tool.execute({ draft: '结论：XR-77 跑完了。' }, { agent: { id: 's5' } })
check('the research subject becomes known after the reply', !afterTurnEnd.issues.some((i) => i.rule === 'identifier'))

const vocabTool = ctx.state.tools.get('plain_talk_vocab')
check('registers plain_talk_vocab', Boolean(vocabTool))
const listed = await vocabTool.execute({ action: 'list' }, { agent: { id: 's5' } })
check('vocab list shows categories', /内部代号/.test(listed.text) && /XR-77/.test(listed.text))

const classified = await vocabTool.execute({ action: 'classify', term: 'XR-77', category: 'domain' }, { agent: { id: 's5' } })
check('vocab classify works', classified.ok && /专业词汇/.test(classified.text))
const removed = await vocabTool.execute({ action: 'remove', terms: ['XR-77'] }, { agent: { id: 's5' } })
check('vocab remove works', removed.ok)

sessionEvent({ id: 's6' }, { type: 'user/message', data: { source: { kind: 'user-approval' }, content: [{ type: 'text', text: 'XR-99 approved' }] } })
const approvalDraft = await tool.execute({ draft: '结论：XR-99 跑完了。' }, { agent: { id: 's6' } })
check('approval notices do not teach vocabulary', approvalDraft.issues.some((i) => i.rule === 'identifier'))

const durations = analyze('结论：跑了 10m，提升了 4x。', {})
check('durations are not identifiers', !durations.issues.some((i) => i.rule === 'identifier'))

check('rules mention the gloss form', RULES.includes('M11（'))
check('state file exists', existsSync(join(home, 'plain-talk.json')))

rmSync(home, { recursive: true, force: true })

if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('all checks passed')
