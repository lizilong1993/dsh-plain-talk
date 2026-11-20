// 离线自检：不需要模型网关。校验规则正文的契约与检查器行为。
// 重点防回归：0.1.11 曾把新旧条款并列写进同一份规则，导致自相矛盾、回复变长。
import fs from 'node:fs';
import path from 'node:path';
import { analyze } from '../dsh/check.js';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const rulesSrc = fs.readFileSync(path.join(root, '..', 'dsh', 'rules.js'), 'utf8');
const bt = String.fromCharCode(96);
const i = rulesSrc.indexOf(bt);
const j = rulesSrc.indexOf(bt, i + 1);
const body = rulesSrc.slice(i + 1, j).replace(/\r\n/g, '\n');

let pass = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) pass++;
  else fails.push(name + (detail ? ' :: ' + detail : ''));
};
const rulesOf = (t) => analyze(t, { language: 'zh' }).issues.map((x) => x.rule);
const countOf = (needle) => body.split(needle).length - 1;

// 1. 文件与声明
check('declaration', /export const RULES = `/.test(rulesSrc));
check('body not empty', body.trim().length > 500, 'len=' + body.length);

// 2. 长度与列表必须有确定的硬上限（这是实测能压住篇幅的关键）
check('has line/char cap', body.includes('默认不超过 12 行、300 字'));
check('has list cap', body.includes('列表最多 5 条'));

// 3. 不许自相矛盾：同一约束只能有一种说法
const capVariants = ['默认不超过 12 行、300 字', '普通回复以 12 行、300 字以内为参考'];
check('one length cap only', capVariants.filter((v) => body.includes(v)).length === 1,
  JSON.stringify(capVariants.map((v) => [v, countOf(v)])));
const listVariants = ['列表最多 5 条；只给一个下一步', '用列表呈现并列项，按需保留完整条目'];
check('one list rule only', listVariants.filter((v) => body.includes(v)).length === 1);
check('no expand-anything clause', !body.includes('按任务需要展开'));

// 4. 原有硬性禁令仍在
check('bans preamble', body.includes('希望这有帮助'));
check('bans process diary', body.includes('我先…然后…'));
check('bans backref', body.includes('前者') || body.includes('上述'));
check('keeps evidence rule', body.includes('原文'));
check('has checklist call', body.includes('plain_talk_check'));

// 5. 检查器行为（不依赖模型，只验证它按预期抓问题）
const zhLong = '这是一段用来测试长度规则的中文内容，'.repeat(20);
check('flags length', rulesOf(zhLong).includes('length'));
check('flags preamble', rulesOf('好的，我来看看。' + zhLong).includes('preamble'));
check('flags backref', rulesOf('上述问题已经修复。' + zhLong).includes('backref'));
check('flags closer', rulesOf('结论：已完成。还需要我做什么？').includes('closer'));
const clean = analyze('结论：接口从 180ms 降到 96ms。改动是加了 60 秒缓存，命中率 71%。', { language: 'zh' });
check('clean reply has no error', clean.issues.every((x) => x.severity !== 'error'), JSON.stringify(clean.issues));

console.log(`selftest: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log('  FAIL ' + f);
process.exit(fails.length ? 1 : 0);
