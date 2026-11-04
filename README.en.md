# dsh-plain-talk

<p align="center">
  <img src="https://raw.githubusercontent.com/lizilong1993/dsh-plain-talk/main/assets/banner.jpg" alt="dsh-plain-talk — plain talk" width="100%">
</p>

<p align="center">
  <strong>English</strong> · <a href="README.md">中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/dsh-plain-talk"><img alt="npm" src="https://img.shields.io/npm/v/dsh-plain-talk?style=flat-square"></a>
  <img alt="dsh-plugin" src="https://img.shields.io/badge/dsh--plugin-ready-478CBF?style=flat-square&logo=deepseek&logoColor=white">
</p>

A reply-shaping plugin for DeepSeek Harness: one composer switch. When it is on, replies lead with the conclusion, stay under 12 lines by default, paste the text they cite, gloss an opaque code the first time it appears, and stop re-explaining words you already use.

## What it does

- **Conclusion first.** The first line is the answer or the verdict. No restating the question, no "let me take a look".
- **Short by default.** ≤12 lines / 300 characters unless you ask for depth.
- **Standalone.** No "as mentioned above" / "the previous step"; codes such as `EXP-7`, `DEV-1K`, `run-3` get a one-line gloss at first use.
- **Citations you can read.** A `file:line` reference always comes with the quoted lines.
- **User vocabulary.** Words you have used, project names and common terms count as known; "research X" still explains X on the first reply. Codes never enter the vocabulary.

## Results

Environment: DeepSeek Harness `desktop` profile running headless, model `cmc/deepseek/deepseek-v4.1-flash` (high), 2026-11-04. Same prompt, same workspace, only the switch changes.

### Output comparison

| Case | Off | On |
|---|---|---|
| A1 Create and verify files | 任务完成，产物都在 `bench-demo/` 目录：<br><br>- `a.txt`、`b.txt`、`c.txt`，内容分别是 A、B、C<br>- `check.mjs`：按 a→b→c 顺序读取三个文件，去掉换行后拼接输出<br><br>运行 `node check.mjs`，输出 `ABC`，退出码 0。 | 已达标：`bench-demo` 下四个文件已就位，运行脚本输出 `ABC`。<br><br>- `a.txt`、`b.txt`、`c.txt` 各只有一行 `A`、`B`、`C`<br>- `check.mjs` 按 a → b → c 顺序读取、拼接并打印，实测输出：`ABC`<br><br>你自己确认：在 `bench-demo` 目录执行 `node check.mjs`，应看到一行 `ABC`。 |
| A2 Write and read back | 已完成。<br><br>- 创建了 `hello.txt`，写入内容 `Hello`<br>- 读回确认为 1 行，内容就是 `Hello`<br><br>文件路径：`<工作区>/hello.txt` | 我在工作区根目录创建了 hello.txt，写入内容为 `Hello`（该文件在我操作前已存在，这次是把它覆盖为同一内容），随后读回确认：<br><br>```<br>1: Hello<br>```<br><br>需要注意两点：<br><br>- 已存在同名的 hello.txt，原本内容也是 `Hello`，所以这次覆盖没有造成实际变化。<br>- 文件只有一行，没有换行符，如需要可补一个行尾换行。<br><br>文件路径：`<工作区>/hello.txt` |
| B1 Why models forget | 多数人以为这只是“上下文窗口不够长”，其实窗口够长也会忘。一是截断与压缩：超过窗口的早期轮次会被滑窗丢弃，或者被系统摘要掉，原本的细节就没了。二是注意力是软检索，没有索引保证——候选内容越多，权重越被摊薄，而且位置偏差很明显（“lost in the middle”：开头和结尾记得住，中间段最容易被忽略）。三是位置编码在超长距离上外推能力下降，早期 token 与当前 token 的关联信号本来就更弱。<br><br>再往深一层，是训练目标没给“长期记忆”发工资。预训练是逐 token 预测，几乎不惩罚“忘了前面说过什么”，模型因此没学出显式的记忆读写机制；早期信息只能靠每层残差流反复重编码往后传，而这条通道带宽有限，误差逐层累积。加上实际产品还会做 KV cache 压缩、历史摘要、检索式拼接，早期内容往往以有损形式才活到当下。所以真正管用的办法不是“让它记住”，而是把关键事实外置：检索、写进系统提示、或在需要时重述。 | 简单说，模型没有“记忆”，它每次回答只能看到当前上下文窗口里的全部 token；窗口塞满后，早先的对话要么被截断、要么被压缩成摘要，原文就没了。窗口再大也不是无限，而塞得越满，注意力被稀释得越厉害：远处的信息权重低、容易被中间位置淹没（常说的 lost-in-the-middle），于是“看得见但用不上”。<br><br>另一层原因是训练时的分布。模型主要在短文本上学习长距离依赖，真到几万 token 的跨度，它把“第 3 轮的约束”和“第 80 轮的问题”关联起来的能力，本来就弱于人类的理解记忆；加上系统端为了省算力会做 KV 缓存淘汰、滑动窗口保留最近若干轮，早期内容被结构性丢弃。所以这不是“忘了”，而是从没被持续保留——需要跨长对话保持的信息，得靠外部记录（写入文件、检索、每轮重述关键约束）来补。 |
| B2 merge vs rebase | `git merge` 会保留两条分支的完整历史，并生成一个合并提交，历史因此真实，但会分叉、按时间而言不够线性。`git rebase` 则把你分支上的提交逐个“移接”到目标分支的最新提交之上，从而得到一条线性、干净的历史，但会重写提交哈希。实践中，在共享分支上优先使用 merge，以免打乱别人的历史；在个人分支上整合最新代码时用 rebase，可以保持提交整洁。 | **merge 是保留分叉再合并，rebase 是把提交搬到新基底上重写历史。** merge 会生成一个新的合并提交把两条分支接起来，原有提交的哈希不变；rebase 则把当前分支的提交逐个重放到目标分支最新提交之后，产生全新的提交（哈希全变），历史变成一条直线。所以共享分支上推送过的提交用 merge 更安全，rebase 只适合还没推送的本地提交，否则会打断别人基于旧历史的引用。 |
| C1 Experiment draft | 结论：EXP-7（新加的实例校验模块）这次不合并。加了它的 CAND 定位精度 61.2% → 63.8%，涨 2.6 个百分点，没到 3 个点的门槛。这是跑完实测后的决定，不是"无法评估"。<br><br>但对外的版本里有两个数字打架，得先查。<br><br>一是开头写"没有带来定位精度提升"，和后面的 +2.6pp 冲突，应改成"有提升，但不够门槛"。<br><br>二是 1198/1200 条预测逐字节相同。只剩 2 条不同，最多撬动 0.17 个百分点，凑不出 2.6pp。这两个数至少错一个，而 2.6pp 又刚好卡在门槛下面，不解决这个矛盾，结论就站不住。<br><br>另外缺三样：AUROC（排序质量指标）只写了见 reports/exp7/summary.md:42，没给数值，文件也不在当前目录；分片合并的结果本身不是 claim-eligible EvalRun（可引用评测记录），要注明是方向性对照；没有置信区间，n=1200 时 2.6pp 约等于 31 条样本的差异，是否显著未知。<br><br>你现在就能做的：跑一次全量逐条 diff，确认到底是"1198/1200 相同"还是"+2.6pp"准确，顺带查为什么两个已知缺陷修完预测只变了 2 条；把 AUROC 数值补进报告。如果精度确实只有 2.6pp，round-2 先别跑。 | 结论：EXP-7（给推理流程加"实例验证"一步的实验）没达到合并门槛，不合并。<br><br>- DEV-1K（1200 条开发集）上定位精度 61.2% → 63.8%，+2.6 个百分点，合并线 3 个百分点。<br>- 对照批次是 run-3：BASE（基线，配置名 base_v3）对 CAND（BASE 加 exp7_verify 这一步，保留前两轮配置）。同 manifest（SHA-256 a1b2c3d…）、seed 42、代码 e4f5a6b，4×GPU 分 4 片各 300 条合并成 1200。<br>- 这是实测对照，不是跑不出来：1200 条里 1198 条预测逐字节相同；两个已知缺陷已修复。<br>- 口径瑕疵：分片合并的结果不算可入库的 EvalRun，只能说明分母、manifest、seed 一致。<br>- AUROC 没有可核对的数值：草稿指向的 reports/exp7/summary.md 不在仓库里，这条不引。<br><br>下一步：补出 summary.md，或开 round-2 用单个全量 run 复核 CAND。 |
| C2 Release-check draft | **结论**：现在不能出“可以上线”的汇报。草稿把“可以上线”和“run-7 回归还没跑完”并列写着，但没有说明条件，直接发出去会被读成无条件放行。准确说法是**条件放行：等 run-7 回归收尾后，再决定是否上线**。<br><br>**已经确认的**<br>- 检查覆盖登录、支付、导出三条链路<br>- 导出耗时从 4.2s 降到 3.1s<br>- 支付回调在 run-7 中失败过一次，草稿中指到 logs/run-7.txt:88<br><br>**放行前必须完成的两件事**<br>- 补齐 run-7 回归，给出“全绿”或“仍未通过”的明确状态<br>- 给支付回调那次失败定性：是偶发超时、可重试，还是必现问题。这条决定能不能带问题上线，是整份汇报里最关键的未知项。<br><br>**草稿没有交代的信息**<br>- 谁执行的、什么时候、在哪个版本或环境跑的<br>- “覆盖了三个链路”是指跑过还是跑通了<br>- 失败那次有没有重试成功<br><br>**我另外核了一下**<br>- 工作目录里没有 `logs/` 目录，所以 `run-7.txt:88` 无法核对，只能作为原草稿的引用转述<br>- 同目录的 `draft.md` 是另一轮实验报告，和上线无关，我没并进来<br><br>**一句话版本**（可以直接贴给相关方）：BUILD-42 的登录、支付、导出三条链路已检查，导出耗时从 4.2s 降到 3.1s；但 run-7 的回归尚未跑完，且支付回调在 run-7 中失败过一次，待回归收尾并确认该失败的性质后，再给出上线结论。<br><br>是否需要我照这个改写成正式汇报文档，或先把 `draft2.md` 更新成这版？ | 结论：BUILD-42（这次要上线的构建）先别上线。草稿自己的结论写的是“可以上线”，但同一份草稿又写明 run-7（第 7 轮回归）还没跑完，并且支付回调在 run-7 里失败过一次；这两条都指向不能放行，所以这个结论和草稿正文相互矛盾。<br><br>- 覆盖范围：登录、支付、导出三条链路。<br>- 支付：支付回调在 run-7 里失败过一次，记录在 run-7 的日志 logs/run-7.txt 第 88 行；该文件不在当前目录，我无法贴出原文，需要你提供路径或直接贴出来。<br>- 导出：耗时从 4.2s 降到 3.1s。<br>- 回归：run-7 还没跑完，支付回调失败的原因也还没查清。<br><br>下一步：先补跑 run-7，确认支付回调的失败能否复现；只要能复现，就不上线。 |

### Characters and tokens

| Case | Characters (off / on) | Output tokens (off / on) |
|---|---|---|
| A1 Create and verify files | 144 / 189 | 2,333 / 1,344 |
| A2 Write and read back | 124 / 238 | 220 / 398 |
| B1 Why models forget | 410 / 350 | 732 / 326 |
| B2 merge vs rebase | 184 / 194 | 150 / 366 |
| C1 Experiment draft | 558 / 496 | 2,781 / 3,066 |
| C2 Release-check draft | 672 / 331 | 1,636 / 2,092 |

The rules section costs about +589 input tokens per step (single-step, zero-tool B1 run: 260,351 → 260,940).

## Install

```sh
dsh plugin --profile desktop add dsh-plain-talk
dsh plugin --profile desktop add github:lizilong1993/dsh-plain-talk
dsh plugin --profile desktop add ./dsh-plain-talk
```

Restart DSH afterwards.

## Use

1. Open any session: a smiley speech-bubble icon appears next to the permission selector in the composer.
2. On shows the face with three sound waves and an open smile; off shows the plain smile. Click to toggle, for that session only.
3. State lives in `$DSH_HOME/plain-talk.json` and survives restarts.
4. Want new sessions to start off? Set `PLAIN_TALK_DEFAULT=off` where DSH launches.

## Vocabulary

`$DSH_HOME/plain-talk-vocab.json`, shared across sessions.

| Category | Meaning | Examples |
|---|---|---|
| common | built in, never explained | arXiv, DOI, API, GPU |
| domain | field terms you have used | diffusion model, AUROC |
| project | repositories, products, workspace names | AcmeService_V2, DataHub_V3 |
| unclassified | recorded, not classified yet | other detected terms |

Codes such as EXP-7, DEV-1K and run-3 never enter the vocabulary: every use is treated as unknown so the model explains it again.

"Research X" is two-phase: X is marked pending, the first reply still explains it, and the turn end records it. Common terms such as arXiv are unaffected; codes are never recorded.

Maintain it with `plain_talk_vocab` (`list` / `add` / `remove` / `classify`) or by editing the JSON.

## Self-check tool

`plain_talk_check` takes a draft and reports:

- errors: cross-turn wording, session/subagent/tool names, pointer-only citations;
- warnings: unexplained codes, over 12 lines / 300 characters, lists over 5, preamble, closing offer, English-only reply to a Chinese user.

The section asks the model to run it for completion reports and replies over 12 lines.

## How it works

- Host (`dsh/index.js`) registers one `systemPrompt` section (`plain-talk`, order 55) whose text function returns the rules only while that session's switch is on.
- Browser half (`lib/client.js`) registers into `conversation.input.left` and renders an 18×18 smiley button.
- The switch is read and written over the loopback route `/plain-talk/state` (127.0.0.1 / ::1 only, 8 KB body limit).
- Switch and vocabulary are atomic JSON sidecar files; no session events are written.

## Data

Only `$DSH_HOME/plain-talk.json` and `$DSH_HOME/plain-talk-vocab.json` are written. No network, no upload, no credential access. A corrupt state file reads as "no choice recorded".

## Configuration

Environment variable `PLAIN_TALK_DEFAULT` (`on` / `off`, default `on`).

## Notes

- The button position depends on `conversation.input.left`; a host redesign may move it beside other left-side controls.
- Rules are prompt constraints; `plain_talk_check` warns but never blocks a send.
- Vocabulary is shared per user, not per project.
- With the mode on, each request carries about 590 extra input tokens.

## License

MIT — see [LICENSE](./LICENSE).
