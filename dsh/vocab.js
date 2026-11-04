// The user vocabulary file.
//
// One file for the whole profile, not per Session: "the user already knows this
// word" is a property of the reader, not of one conversation. Sessions only add
// observations; the checker reads the result.
//
// Categories, from broadest to most specific:
//   common        常识词汇 — built in, never needs an explanation
//   domain        专业词汇 — field terms the user has already met
//   project       项目 / 产品名 — repositories, products, workspace names
//   internal      内部代号 — experiment ids, task numbers, build codes
//   unclassified  待归类 — recorded but not yet classified
//
// Two-phase learning for research requests: when the user says "调研 X", X is
// marked pending for that Session, so the first reply must still explain it;
// the next turn end promotes it into the vocabulary.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const CATEGORIES = {
  common: '常识词汇',
  domain: '专业词汇',
  project: '项目 / 产品名',
  internal: '内部代号',
  unclassified: '待归类',
}

const MAX_TERMS = 2000
const MAX_PENDING_PER_SESSION = 20

const cjkCount = (s) => (s.match(/[\u4e00-\u9fff]/g) ?? []).length

/** Classify one learned term from its shape alone. */
export function classify(term, cwdName) {
  const text = String(term ?? '').trim()
  if (!text) return 'unclassified'
  if (cwdName && text === cwdName) return 'project'
  if (/^[A-Za-z]{1,10}[-_.]?\d{1,6}$/.test(text)) return 'internal'
  if (/^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/.test(text) && (text.match(/[A-Z]/g) ?? []).length >= 2) return 'project'
  if (/^[A-Z][A-Za-z0-9]+$/.test(text) && /[A-Z]/.test(text.slice(1))) return 'project'
  if (cjkCount(text) >= 2) return 'domain'
  if (/^[A-Z]{2,8}$/.test(text)) return 'domain'
  return 'unclassified'
}

export function emptyVocab() {
  return { version: 1, updatedAt: new Date(0).toISOString(), terms: {}, pending: {} }
}

export function loadVocab(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const terms = {}
    const raw = parsed && typeof parsed === 'object' && parsed.terms && typeof parsed.terms === 'object' ? parsed.terms : {}
    for (const [key, value] of Object.entries(raw)) {
      if (!key || key.length > 80) continue
      if (!value || typeof value !== 'object') continue
      const category = Object.prototype.hasOwnProperty.call(CATEGORIES, value.category) ? value.category : 'unclassified'
      terms[key] = {
        category,
        firstSeen: typeof value.firstSeen === 'string' ? value.firstSeen : new Date(0).toISOString(),
        lastSeen: typeof value.lastSeen === 'string' ? value.lastSeen : new Date(0).toISOString(),
        count: Number.isFinite(value.count) ? value.count : 1,
        sessions: Array.isArray(value.sessions) ? value.sessions.filter((s) => typeof s === 'string').slice(-5) : [],
        source: typeof value.source === 'string' ? value.source : 'user',
      }
    }
    const pending = {}
    const rawPending = parsed && typeof parsed === 'object' && parsed.pending && typeof parsed.pending === 'object' ? parsed.pending : {}
    for (const [sessionId, list] of Object.entries(rawPending)) {
      if (!Array.isArray(list)) continue
      pending[sessionId] = list
        .filter((item) => item && typeof item.term === 'string' && item.term.length > 0 && item.term.length <= 80)
        .slice(-MAX_PENDING_PER_SESSION)
        .map((item) => ({ term: item.term, at: typeof item.at === 'string' ? item.at : new Date(0).toISOString() }))
    }
    return { version: 1, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(), terms, pending }
  } catch {
    return emptyVocab()
  }
}

export function saveVocab(file, vocab) {
  const next = { ...vocab, version: 1, updatedAt: new Date().toISOString() }
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  renameSync(tmp, file)
  return next
}

function evict(vocab) {
  const keys = Object.keys(vocab.terms)
  if (keys.length <= MAX_TERMS) return
  keys
    .sort((a, b) => String(vocab.terms[a].lastSeen).localeCompare(String(vocab.terms[b].lastSeen)))
    .slice(0, keys.length - MAX_TERMS)
    .forEach((key) => delete vocab.terms[key])
}

/** Record one term as known. Existing terms keep their category. */
export function addTerm(vocab, term, options = {}) {
  const key = String(term ?? '').trim()
  if (!key || key.length > 80) return vocab
  const now = options.now ?? new Date().toISOString()
  const session = typeof options.session === 'string' ? options.session : undefined
  const existing = vocab.terms[key]
  if (existing) {
    existing.lastSeen = now
    existing.count += 1
    if (session && !existing.sessions.includes(session)) existing.sessions = [...existing.sessions.slice(-4), session]
    if (options.category && CATEGORIES[options.category]) existing.category = options.category
  } else {
    vocab.terms[key] = {
      category: options.category && CATEGORIES[options.category] ? options.category : classify(key, options.cwdName),
      firstSeen: now,
      lastSeen: now,
      count: 1,
      sessions: session ? [session] : [],
      source: options.source ?? 'user',
    }
  }
  evict(vocab)
  return vocab
}

export function removeTerm(vocab, term) {
  delete vocab.terms[String(term ?? '').trim()]
  return vocab
}

export function setCategory(vocab, term, category) {
  const key = String(term ?? '').trim()
  if (!vocab.terms[key] || !CATEGORIES[category]) return vocab
  vocab.terms[key].category = category
  return vocab
}

/** Mark a research subject as not-yet-known for this Session. */
export function markPending(vocab, sessionId, term, now = new Date().toISOString()) {
  const key = String(term ?? '').trim()
  if (!sessionId || !key || key.length > 80) return vocab
  const list = vocab.pending[sessionId] ?? []
  if (!list.some((item) => item.term === key)) list.push({ term: key, at: now })
  vocab.pending[sessionId] = list.slice(-MAX_PENDING_PER_SESSION)
  return vocab
}

export function pendingFor(vocab, sessionId) {
  return (vocab.pending?.[sessionId] ?? []).map((item) => item.term)
}

/** Turn end: the reply has been delivered, so the research subject is now known. */
export function promotePending(vocab, sessionId, options = {}) {
  const list = vocab.pending?.[sessionId] ?? []
  if (list.length === 0) return []
  for (const item of list) addTerm(vocab, item.term, { ...options, session: sessionId, category: options.category ?? 'domain', source: 'research' })
  delete vocab.pending[sessionId]
  return list.map((item) => item.term)
}

/**
 * Terms the checker may treat as known for one Session.
 * Pending research subjects are excluded even when the profile learned them
 * earlier: the user asked to research them, so the first reply must not assume.
 */
export function knownSet(vocab, sessionId) {
  const suspended = new Set(pendingFor(vocab, sessionId))
  const known = new Set()
  for (const key of Object.keys(vocab.terms)) {
    if (!suspended.has(key)) known.add(key)
  }
  return known
}

export function listByCategory(vocab) {
  const groups = {}
  for (const key of Object.keys(CATEGORIES)) groups[key] = []
  for (const [term, value] of Object.entries(vocab.terms)) {
    const category = CATEGORIES[value.category] ? value.category : 'unclassified'
    groups[category].push({ term, count: value.count, lastSeen: value.lastSeen })
  }
  for (const key of Object.keys(groups)) groups[key].sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
  return groups
}

/** Extract "research X" subjects from one user message. */
export function researchTargets(text) {
  const found = []
  const input = String(text ?? '')
  // A captured phrase may carry a code inside it ("调研 XR-77 这个实验"):
  // the code is the subject, not the surrounding words.
  const codePattern = /\b[A-Za-z]{1,10}[-_.]?\d{1,6}[A-Za-z]?\b/g
  const push = (phrase) => {
    const codes = phrase.match(codePattern) ?? []
    if (codes.length > 0) {
      for (const code of codes) if (code.length >= 2) found.push(code)
      return
    }
    if (phrase.length >= 2) found.push(phrase)
  }
  const zh = /(?:调研|研究|调查|了解一下|了解下|查一下|查查|梳理一下|分析一下)\s*([^\n。！？；;]{1,40})/g
  let m
  while ((m = zh.exec(input))) {
    const term = m[1].trim().replace(/^(?:一下|下)\s*/, '').replace(/[，,、\s]+$/, '')
    push(term)
  }
  const en = /\b(?:research|investigate|look into|study)\s+([A-Za-z0-9][A-Za-z0-9 ._/-]{1,40})/gi
  while ((m = en.exec(input))) {
    const term = m[1].trim().replace(/[.,;:\s]+$/, '')
    push(term)
  }
  return [...new Set(found)]
}
