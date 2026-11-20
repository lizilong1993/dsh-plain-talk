// 先量噪声底：同一规则、同一问题重复采样，看字数波动有多大；
// 再比两版规则的中位数差，判断差异是否超过噪声。
import fs from 'node:fs';
import { analyze } from '../dsh/check.js';

const bt = String.fromCharCode(96);
const bodyOf = (p) => {
  const s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const i = s.indexOf(bt);
  const j = s.indexOf(bt, i + 1);
  return s.slice(i + 1, j);
};
const base = 'C:/Users/lizilong/AppData/Local/Temp/pt-verify';
const ARMS = [
  ['v0.1.10', bodyOf(base + '/pkg-0.1.10/package/dsh/rules.js')],
  ['v0.1.11', bodyOf(base + '/pkg-0.1.11/package/dsh/rules.js')],
];
const QUESTIONS = [
  'Nginx 502 和 504 分别说明什么？',
  '为什么 git push 会被拒绝 non-fast-forward？',
  '调研一下 WebAssembly 现在适合用在什么场景。',
  '线上 CPU 突然打满，按可能性从高到低给我排查顺序。',
];
const N = 4; // 每臂每题采样次数

const call = async (system, user) => {
  const res = await fetch('http://127.0.0.1:3425/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'group/free', temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error('http ' + res.status);
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
};
const chars = (t) => analyze(t, { language: 'zh' }).stats.chars;

const data = {};
for (const [armName, rules] of ARMS) {
  for (const q of QUESTIONS) {
    data[armName] = data[armName] || {};
    data[armName][q] = [];
    for (let i = 0; i < N; i++) data[armName][q].push(chars(await call(rules, q)));
    process.stdout.write('.');
  }
}
process.stdout.write('\n');

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const spread = (xs) => Math.max(...xs) - Math.min(...xs);

console.log('\nquestion\tarm\tsamples\tmedian\trange');
let noiseFloor = 0;
for (const q of QUESTIONS) {
  for (const [arm] of ARMS) {
    const xs = data[arm][q];
    const sp = spread(xs);
    noiseFloor = Math.max(noiseFloor, sp);
    console.log([q.slice(0, 18), arm, xs.join('/'), median(xs), sp].join('\t'));
  }
}
console.log('\nnoise floor (max within-arm range):', noiseFloor);
console.log('\nBetween-arm median diff per question:');
const diffs = [];
for (const q of QUESTIONS) {
  const d = median(data[ARMS[1][0]][q]) - median(data[ARMS[0][0]][q]);
  diffs.push(d);
  console.log('  ' + q.slice(0, 18) + ' -> ' + d + ' chars');
}
const meanDiff = Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
console.log('mean diff (0.1.11 - 0.1.10):', meanDiff, '| noise floor:', noiseFloor,
  '| verdict:', Math.abs(meanDiff) > noiseFloor ? 'difference exceeds noise' : 'INDISTINGUISHABLE from noise');
fs.writeFileSync('test/noise.json', JSON.stringify({ data, noiseFloor, meanDiff }, null, 2), 'utf8');
