// 离线自检：不需要模型网关。校验规则正文契约与检查器行为。
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

// 1. 文件与声明
check('declaration', /export const RULES = `/.test(rulesSrc));
check('body not empty', body.trim().length > 500, 'len=' + body.length);

// 2. 篇幅：不设硬上限，但必须禁止"为短漏步骤"和"为长注水"
check('no hard cap', !body.includes('默认不超过 12 行') && !body.includes('300 字'));
check('no hard cap duplicated', body.split('12 行、300 字').length - 1 === 0);
check('forbids dropping steps for brevity', body.includes('别为短漏关键步骤'));
check('forbids padding', body.includes('别为长注水'));
check('conclusion stays first line', body.includes('结论始终在第一行'));

// 3. 信息不足时先要，不猜；有可执行替代才给命令
check('asks for missing input', body.includes('信息不够就直说缺什么'));
check('no guessing', body.includes('别猜'));
check('gives runnable alternative', body.includes('命令给出来'));

// 4. 清单一条一件事
check('one item per line', body.includes('一条一件事'));
check('caps list at five', body.includes('最多 5 条'));

// 5. 原有硬性禁令仍在
check('bans preamble', body.includes('希望这有帮助'));
check('bans process diary', body.includes('我先…然后…'));
check('bans backref', body.includes('前者') || body.includes('上述'));
check('keeps evidence rule', body.includes('原文'));
check('has checklist call', body.includes('plain_talk_check'));

// 6. 检查器行为
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
