// 可复现的效果对照：把 npm 上指定版本的规则正文拉下来，用同一组问题分别生成，配对比较。
//
// 用法：
//   node test/bench.mjs --versions 0.1.10,0.1.11 --reps 3
//   node test/bench.mjs --versions 0.1.10,0.1.12
//
// 需要本地模型网关（默认 http://127.0.0.1:3425/v1/chat/completions），可用 --endpoint 覆盖。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { analyze } from '../dsh/check.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const VERSIONS = opt('versions', '0.1.10,0.1.11').split(',').map((s) => s.trim()).filter(Boolean);
const REPS = Number(opt('reps', '1'));
const ENDPOINT = opt('endpoint', 'http://127.0.0.1:3425/v1/chat/completions');
const MODEL = opt('model', 'group/free');

const QUESTIONS = [
  'Kubernetes 的 liveness 和 readiness 探针有什么区别？',
  '为什么 git push 会被拒绝 non-fast-forward？',
  'React 的 useEffect 依赖数组留空会怎样？',
  'MySQL 索引失效常见的原因有哪些？',
  '这段日志什么意思：OOMKilled exit code 137',
  '我要从 Vue2 迁到 Vue3，先做哪一步？',
  '调研一下 WebAssembly 现在适合用在什么场景。',
  '线上 CPU 突然打满，按可能性从高到低给我排查顺序。',
  'Postgres 的 vacuum 为什么必须定期跑？',
  '帮我把这段 SQL 改成走索引，只给改后的语句。',
  'Nginx 502 和 504 分别说明什么？',
  '调研一下 OpenTelemetry 相比自建埋点的取舍。',
];

const BT = String.fromCharCode(96);
const bodyOf = (src) => {
  const s = src.replace(/\r\n/g, '\n');
  const i = s.indexOf(BT);
  const j = s.indexOf(BT, i + 1);
  if (i < 0 || j <= i) throw new Error('rule body not found');
  return s.slice(i + 1, j);
};

// 取指定版本已发布的规则正文；本地未发布时用 --local <version> 直接读工作区
function rulesOf(version) {
  const dir = path.join(os.tmpdir(), 'plain-talk-bench', version);
  const file = path.join(dir, 'rules.js');
  if (fs.existsSync(file)) return bodyOf(fs.readFileSync(file, 'utf8'));
  fs.mkdirSync(dir, { recursive: true });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npm, ['pack', 'dsh-plain-talk@' + version, '--pack-destination', dir], {
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  const tgz = fs.readdirSync(dir).find((f) => f.endsWith('.tgz'));
  if (!tgz) throw new Error('pack failed for ' + version);
  execFileSync('tar', ['-xzf', path.join(dir, tgz), '-C', dir], { stdio: 'ignore' });
  const inner = path.join(dir, 'package', 'dsh', 'rules.js');
  const body = bodyOf(fs.readFileSync(inner, 'utf8'));
  fs.writeFileSync(file, 'export const RULES = ' + BT + body + BT + ';\n', 'utf8');
  return body;
}

const call = async (system, user) => {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error('http ' + res.status + ' ' + (await res.text()).slice(0, 160));
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('empty completion');
  return text;
};

const score = (text) => {
  const r = analyze(text, { language: 'zh' });
  return {
    chars: r.stats.chars,
    lines: r.stats.lines,
    errors: r.issues.filter((i) => i.severity === 'error').length,
    warns: r.issues.filter((i) => i.severity === 'warn').length,
    firstLine: text.trim().split(/\n/)[0].slice(0, 60),
  };
};

const arms = VERSIONS.map((v) => ({ version: v, rules: rulesOf(v) }));
const rows = [];
for (let q = 0; q < QUESTIONS.length; q++) {
  for (let rep = 1; rep <= REPS; rep++) {
    for (const arm of arms) {
      try {
        rows.push({ q: q + 1, rep, version: arm.version, ...score(await call(arm.rules, QUESTIONS[q])) });
      } catch (e) {
        rows.push({ q: q + 1, rep, version: arm.version, error: e.message });
      }
    }
    process.stdout.write('.');
  }
}
process.stdout.write('\n');

const agg = (version) => {
  const xs = rows.filter((r) => r.version === version && !r.error);
  if (!xs.length) return { n: 0 };
  const s = (k) => xs.reduce((p, b) => p + b[k], 0);
  return {
    n: xs.length,
    avgChars: Math.round(s('chars') / xs.length),
    avgLines: +(s('lines') / xs.length).toFixed(1),
    errors: s('errors'),
    warns: s('warns'),
  };
};

// 配对：同一题、同一轮次，比较字数与 warn
const pairs = [];
for (let q = 1; q <= QUESTIONS.length; q++) {
  for (let rep = 1; rep <= REPS; rep++) {
    const xs = rows.filter((r) => r.q === q && r.rep === rep && !r.error);
    if (xs.length < 2) continue;
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) {
      pairs.push({
        pair: xs[i].version + '/' + xs[j].version,
        chars: xs[j].chars - xs[i].chars,
        warns: xs[j].warns - xs[i].warns,
      });
    }
  }
}
const pairSummary = {};
for (const p of pairs) {
  const acc = (pairSummary[p.pair] = pairSummary[p.pair] || { n: 0, charsDelta: 0, warnsDelta: 0, shorter: 0, longer: 0 });
  acc.n++;
  acc.charsDelta += p.chars; // >0 表示后者更长
  acc.warnsDelta += p.warns;
  if (p.chars > 0) acc.longer++;
  else if (p.chars < 0) acc.shorter++;
}
for (const k of Object.keys(pairSummary)) {
  const a = pairSummary[k];
  a.avgCharsDelta = Math.round(a.charsDelta / a.n);
  a.avgWarnsDelta = +(a.warnsDelta / a.n).toFixed(2);
}

const summary = {
  versions: VERSIONS,
  reps: REPS,
  questions: QUESTIONS.length,
  runs: rows.filter((r) => !r.error).length,
  model: MODEL,
  arms: Object.fromEntries(VERSIONS.map((v) => [v, agg(v)]).filter(([, a]) => a.n)),
  pairs: pairSummary,
};
console.log('=== SUMMARY ===');
console.log(JSON.stringify(summary, null, 1));

const out = 'test/bench-result.json';
fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 2), 'utf8');
console.log('\nwritten ' + out);
