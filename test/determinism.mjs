// 判定网关是否可复现：同一 system+user 连续调用 3 次，比较输出。
const ENDPOINT = 'http://127.0.0.1:3425/v1/chat/completions';
const sys = '读者只看这一条回复就要能做决定。先给结论，再给必要细节。默认不超过 12 行、300 字。';
const user = 'Nginx 502 和 504 分别说明什么？';

const call = async () => {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'group/free', temperature: 0, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
  });
  const j = await res.json();
  return j.choices?.[0]?.message?.content ?? '';
};

const outs = [];
for (let i = 0; i < 3; i++) outs.push(await call());
console.log('lengths:', outs.map((o) => o.length).join(', '));
console.log('identical:', outs[0] === outs[1] && outs[1] === outs[2]);
console.log('unique outputs:', new Set(outs).size);
for (const [i, o] of outs.entries()) console.log('--- run ' + (i + 1) + ' ---\n' + o.slice(0, 220));
