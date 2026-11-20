// v4 出厂前验证：4 题对比 0.1.12 基线，看篇幅/清单结构/是否乱猜。
import fs from 'node:fs';

const bt = String.fromCharCode(96);
const bodyOf = (p) => {
  const s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const i = s.indexOf(bt);
  const j = s.indexOf(bt, i + 1);
  return s.slice(i + 1, j);
};
const BASE = bodyOf('C:/Users/lizilong/AppData/Local/Temp/pt-verify/pkg-0.1.10/package/dsh/rules.js');
const V4 = fs.readFileSync('test/rules-v4.txt', 'utf8');

const CASES = [
  ['f1', 'Nginx 502 和 504 分别说明什么？'],
  ['f2', '帮我把这个接口改成幂等的，先告诉我改哪几处。'],
  ['f3', '把这个目录下所有 .log 按大小列出来，只给我结果。'],
  ['f4', '给我写一段本周进展，发给老板，就说接口优化上线了、延迟降了一半、有个遗留问题没解决。'],
];

const call = async (system, user) => {
  const res = await fetch('http://127.0.0.1:3425/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'group/free', temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
};

const stats = (t) => {
  const lines = t.split('\n').filter((l) => l.trim());
  const numbered = lines.filter((l) => /^\s*(\d+[.、)]|[-*])\s?/.test(l)).length;
  return {
    chars: t.length,
    lines: lines.length,
    longestLine: Math.max(...lines.map((l) => l.length)),
    semicolons: (t.match(/；/g) || []).length,
    numbered,
    metaTalk: /(措辞|建议用|示例如下|要不要我)/.test(t),
    fakeSearch: /(没有找到|未找到).{0,6}(文件|目录)/.test(t),
  };
};

const rows = [];
for (const [id, q] of CASES) {
  for (const [arm, rules] of [['base', BASE], ['v4', V4]]) {
    const t = await call(rules, q);
    rows.push({ id, arm, text: t, ...stats(t) });
    process.stdout.write('.');
  }
}
process.stdout.write('\n');

for (const id of CASES.map((c) => c[0])) {
  const a = rows.find((r) => r.id === id && r.arm === 'base');
  const b = rows.find((r) => r.id === id && r.arm === 'v4');
  console.log('\n== ' + id);
  for (const [name, r] of [['base', a], ['v4', b]]) {
    console.log('  ' + name + ' chars=' + r.chars + ' lines=' + r.lines + ' longest=' + r.longestLine + ' 分号=' + r.semicolons + ' 条目=' + r.numbered + ' 元话=' + r.metaTalk + ' 假搜索=' + r.fakeSearch);
  }
}
fs.writeFileSync('test/v4-check.json', JSON.stringify(rows, null, 2), 'utf8');
