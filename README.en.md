# dsh-plain-talk

<p align="center">
  <img src="https://raw.githubusercontent.com/lizilong1993/dsh-plain-talk/main/assets/banner.jpg" alt="dsh-plain-talk — 说人话" width="100%">
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
- **User vocabulary.** Words you have used, project names and common terms count as known; "research X" still explains X on the first reply, then remembers it.

## Results

Environment: DeepSeek Harness `desktop` profile running headless, model `cmc/deepseek/deepseek-v4.1-flash` (high), 2026-11-04. Same prompt, same workspace, only the switch changes; the vocabulary is cleared before each arm.

### Summary

| Scenario | Metric | Off | On | Change |
|---|---|---|---|---|
| A. Completion task (4 files + verification) | final reply chars | 144 | 189 | +45 (adds a verdict and a self-check step) |
| | output tokens | 2,333 | 1,344 | **−42%** |
| | tool calls | 12 | 11 | −1 |
| | elapsed | 131 s | 107 s | −24 s |
| B. Explanation | final reply chars | 410 | 350 | **−15%** |
| | output tokens | 732 | 326 | **−55%** |
| | cross-turn references | 2 | 0 | **−2** |
| C. Report rewrite (turn a draft into a user-facing report) | final reply chars | 558 | 496 | **−11%** |
| | output tokens | 2,781 | 3,066 | +10% (one extra self-check round) |
| | unexplained codes | 6 | 0 | **−6** |
| | pointer-only citations | 1 | 0 | **−1** |

The rules section costs about +589 input tokens per step (single-step, zero-tool B run: 260,351 → 260,940).

### A. Completion task

| Aspect | Off | On |
|---|---|---|
| First line | 任务完成，产物都在 `bench-demo/` 目录： | 已达标：`bench-demo` 下四个文件已就位，运行脚本输出 `ABC`。 |
| Artifacts | `a.txt`, `b.txt`, `c.txt` hold A, B, C; `check.mjs` reads them in order and prints the joined result | Each file holds exactly one line; `check.mjs` reads, joins and prints, measured output `ABC` |
| Reader check | Run `node check.mjs`; output `ABC`, exit code 0. | Run `node check.mjs` in `bench-demo`; expect one line `ABC`. |
| Chars / output tokens | 144 / 2,333 | 189 / 1,344 |

### B. Explanation

| Aspect | Off | On |
|---|---|---|
| Paragraph 1 | 多数人以为这只是"上下文窗口不够长"，其实窗口够长也会忘。一是截断与压缩……二是注意力是软检索……三是位置编码在超长距离上外推能力下降。 | 简单说，模型没有"记忆"，它每次回答只能看到当前上下文窗口里的全部 token；窗口塞满后，早先的对话要么被截断、要么被压缩成摘要。 |
| Paragraph 2 | 再往深一层，是训练目标没给"长期记忆"发工资。预训练是逐 token 预测，几乎不惩罚"忘了前面说过什么"…… | 另一层原因是训练时的分布。模型主要在短文本上学习长距离依赖，真到几万 token 的跨度，关联能力本来就弱…… |
| Cross-turn references | 2 | 0 |
| Chars / output tokens | 410 / 732 | 350 / 326 |

### C. Report rewrite

The draft contains codes, cross-turn wording and a pointer-only citation. Project codes are replaced with neutral placeholders in this example.

| Aspect | Off | On |
|---|---|---|
| Verdict line | 结论：EXP-7（新加的实例校验模块）这次不合并。加了它的 CAND 定位精度 61.2% → 63.8%……没到 3 个点的门槛。 | 结论：EXP-7（给推理流程加"实例验证"一步的实验）没达到合并门槛，不合并。 |
| Codes | EXP-7 and CAND glossed; AUROC, pp, round-2 left bare | EXP-7, DEV-1K, run-3, BASE, CAND, round-2 all glossed in place |
| Citation | "see reports/exp7/summary.md:42", no quoted content | says the file is not in the repository and drops the citation |
| Next step | several options in one paragraph | one action |
| Chars / output tokens | 558 / 2,781 | 496 / 3,066 |

## Install

Requires a DeepSeek Harness build with the `conversation.input.left` slot (0.2.x line).

```sh
dsh plugin --profile desktop add dsh-plain-talk
dsh plugin --profile desktop add github:lizilong1993/dsh-plain-talk
dsh plugin --profile desktop add ./dsh-plain-talk
```

Restart DSH afterwards.

## Use

1. Open any session: a speech-bubble icon appears next to the permission selector in the composer.
2. It starts on (blue). Click it to turn it off (grey) for that session only.
3. State lives in `$DSH_HOME/plain-talk.json` and survives restarts.
4. Want new sessions to start off? Set `PLAIN_TALK_DEFAULT=off` where DSH launches.

## Vocabulary

`$DSH_HOME/plain-talk-vocab.json`, shared across sessions.

| Category | Meaning | Examples |
|---|---|---|
| common | built in, never explained | arXiv, DOI, API, GPU |
| domain | field terms you have used | diffusion model, AUROC |
| project | repositories, products, workspace names | AcmeService_V2, DataHub_V3 |
| internal | experiment/task/commit codes | EXP-7, DEV-1K, run-3 |
| unclassified | recorded, not classified yet | other detected codes |

"Research X" is two-phase: X is marked pending, the first reply still explains it, and the turn end records it. Common terms such as arXiv are unaffected.

Maintain it with `plain_talk_vocab` (`list` / `add` / `remove` / `classify`) or by editing the JSON.

## Self-check tool

`plain_talk_check` takes a draft and reports:

- errors: cross-turn wording, session/subagent/tool names, pointer-only citations;
- warnings: unexplained codes, over 12 lines / 300 characters, lists over 5, preamble, closing offer, English-only reply to a Chinese user.

The section asks the model to run it for completion reports and replies over 12 lines.

## How it works

- Host (`dsh/index.js`) registers one `systemPrompt` section (`plain-talk`, order 55) whose text function returns the rules only while that session's switch is on.
- Browser half (`lib/client.js`) registers into `conversation.input.left` and renders a 24×24 button.
- The switch is read and written over the loopback route `/plain-talk/state` (127.0.0.1 / ::1 only, 8 KB body limit).
- Switch and vocabulary are atomic JSON sidecar files; no session events are written.

## Data

Only `$DSH_HOME/plain-talk.json` and `$DSH_HOME/plain-talk-vocab.json` are written. No network, no upload, no credential access. A corrupt state file reads as "no choice recorded".

## Configuration

Environment variable `PLAIN_TALK_DEFAULT` (`on` / `off`, default `on`).

## Notes

- The button position depends on `conversation.input.left`; a host redesign may move it beside other left-side controls.
- Rules are prompt constraints; `plain_talk_check` warns but never blocks a send.
- Vocabulary is shared per user, not per project; code detection is heuristic.
- With the mode on, each request carries about 590 extra input tokens.

## License

MIT — see [LICENSE](./LICENSE).
