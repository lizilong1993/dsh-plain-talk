# dsh-plain-talk

<p align="center">
  <img src="https://raw.githubusercontent.com/lizilong1993/dsh-plain-talk/main/icon.svg" alt="dsh-plain-talk" width="72" height="72">
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

> It shapes replies only. It does not plan work, does not set acceptance criteria, and writes no session events.

## What it does

- **Conclusion first.** The first line is the answer or the verdict. No restating the question, no "let me take a look".
- **Short by default.** ≤12 lines / 300 characters unless you ask for depth.
- **Standalone.** No "as mentioned above" / "the previous step"; codes such as `M11`, `dev-1200`, `c590` get a one-line gloss at first use.
- **Citations you can read.** A `file:line` reference is always accompanied by the quoted lines.
- **User vocabulary.** Words you have used, project names and common terms count as known. "Research X" is the exception: X stays unknown for the first reply, then joins the vocabulary.

## Results

Environment: DeepSeek Harness `desktop` profile running headless, model `cmc/deepseek/deepseek-v4.1-flash` (high), 2026-11-04. Same prompt, same workspace, only the switch changes; the vocabulary is reset before each arm.

| Scenario | Metric | Off | On | Change |
|---|---|---|---|---|
| A. Completion task (4 files + verification) | final reply chars | 144 | 189 | +45 (adds a verdict and a self-check step) |
| | output tokens | 2,333 | 1,344 | **−42%** |
| | tool calls | 12 | 11 | −1 |
| | elapsed | 131 s | 107 s | −24 s |
| C. Explanation | final reply chars | 410 | 350 | **−15%** |
| | output tokens | 732 | 326 | **−55%** |
| | cross-turn references | 2 | 0 | **−2** |
| D. Report rewrite (turn a draft into a user-facing report) | final reply chars | 558 | 496 | **−11%** |
| | output tokens | 2,781 | 3,066 | +10% (one extra self-check round) |
| | unexplained codes | 6 | 0 | **−6** |
| | pointer-only citations | 1 | 0 | **−1** |

Total input tokens (system prompt + tool schemas + every step): A 1,832,985 → 1,572,409; C 260,351 → 260,940; D 1,570,662 → 1,573,950. That number tracks the number of steps and tools, not the rules section.

The rules section costs about **+589 tokens per step** (measured on the single-step C run). Mode on is not free, and this README says so.

### D: the same draft, two rewrites

The draft deliberately contains `M11`, `dev-1200`, `c590`, `G18/G19`, "上述", "上一轮", and a `reports/m11/summary.md:42` pointer with no quoted content.

**Off**

```text
结论：M11（新加的实例校验模块）这次不合并。加了它的 G19 定位精度 61.2% → 63.8%，涨 2.6 个百分点，没到 3 个点的门槛。这是跑完实测后的决定，不是"无法评估"。

但对外的版本里有两个数字打架，得先查。

一是开头写"没有带来定位精度提升"，和后面的 +2.6pp 冲突，应改成"有提升，但不够门槛"。

二是 1198/1200 条预测逐字节相同。只剩 2 条不同，最多撬动 0.17 个百分点，凑不出 2.6pp。这两个数至少错一个，而 2.6pp 又刚好卡在门槛下面，不解决这个矛盾，结论就站不住。

另外缺三样：AUROC（排序质量指标）只写了见 reports/m11/summary.md:42，没给数值，文件也不在当前目录；分片合并的结果本身不是 claim-eligible EvalRun（可引用评测记录），要注明是方向性对照；没有置信区间，n=1200 时 2.6pp 约等于 31 条样本的差异，是否显著未知。

你现在就能做的：跑一次全量逐条 diff，确认到底是"1198/1200 相同"还是"+2.6pp"准确，顺带查为什么 B1/B2 两个 bug 修完预测只变了 2 条；把 AUROC 数值补进报告。如果精度确实只有 2.6pp，round10 先别跑。
```

**On**

```text
结论：M11（给推理流程加“实例验证”一步的实验）没达到合并门槛，不合并。

- dev-1200（1200 条开发集）上定位精度 61.2% → 63.8%，+2.6 个百分点，合并线 3 个百分点。
- 对照批次是 c590：G18（基线，配置名 G18_region_gate_v3）对 G19（G18 加 m11_instance_verify 这一步，保留更早两轮的 m9/m10）。同 manifest（SHA-256 26e3406e…）、seed 42、代码 71e6489，4×V100 分 4 片各 300 条合并成 1200。
- 这是实测对照，不是跑不出来：1200 条里 1198 条预测逐字节相同；B1/B2 两个 bug 已修复。
- 口径瑕疵：分片合并的结果不算可入库的 EvalRun，只能说明分母、manifest、seed 一致。
- AUROC 没有可核对的数值：草稿指向的 reports/m11/summary.md 不在仓库里，这条不引。

下一步：补出 summary.md，或开 round10（下一轮实验）用单个全量 run 复核 G19。
```

The switch glosses `M11`, `dev-1200`, `c590`, `G18`, `G19` and `round10` in place, replaces "上述设置" with the actual setting, drops the pointer-only citation, and closes with exactly one next step. The off arm keeps `AUROC`, `pp` and `round10` unexplained.

### C: explanation

Off: 410 chars, 2 cross-turn references, 732 output tokens. On: 350 chars, 0 cross-turn references, 326 output tokens. The on version also replaces "lost in the middle" jargon with a one-line explanation of what it means.

### A: completion task

Off: 144 chars. On: 189 chars, but the first line is a verdict ("已达标") and it adds a step the reader can run; output tokens drop from 2,333 to 1,344.

### Reading the numbers honestly

- Output tokens fell in two scenarios (−42%, −55%) and rose in one (+10%, one extra self-check round). **The plugin does not guarantee fewer tokens in every case.**
- The rules section adds a fixed ~590 input tokens per step; the more turns, the more it costs.
- A fourth scenario (survey) produced an invalid off arm: it stopped after 24 tool calls and returned 87 characters. It is excluded rather than spun.
- Reproduce by running the same model, prompt and workspace twice, switching the composer toggle between the runs; the vocabulary is cleared before each arm.

## Install

Requires a DeepSeek Harness version with the `conversation.input.left` slot (0.2.x line).

```sh
dsh plugin --profile desktop add dsh-plain-talk
dsh plugin --profile desktop add github:lizilong1993/dsh-plain-talk
dsh plugin --profile desktop add ./dsh-plain-talk
```

Restart DSH afterwards. `bundles` decides whether it loads; `cordis.patch.yml` is only the config layer.

## Use

1. Open any session: a speech-bubble icon appears in the composer tool row, after the permission selector.
2. It starts on (blue). Click it to turn it off (grey) for that session only.
3. State lives in `$DSH_HOME/plain-talk.json`, keyed by session id, and survives restarts.
4. Want new sessions to start off? Set `PLAIN_TALK_DEFAULT=off` in the environment that launches DSH.

A failed write rolls the button back, so the UI never claims a state the model did not receive.

## Vocabulary

`$DSH_HOME/plain-talk-vocab.json`, shared across sessions:

| Category | Meaning | Examples |
|---|---|---|
| common | built in, never explained | arXiv, DOI, API, GPU |
| domain | field terms you have used | diffusion model, AUROC |
| project | repositories, products, workspace names | MechDW, GeoEvidence_V2 |
| internal | experiment/task/commit codes | M11, dev-1200, c590 |
| unclassified | recorded, not classified yet | other detected codes |

"Research X" is two-phase: X is marked pending for that session, the first reply still explains it, and the turn end moves it into the vocabulary. Common terms are exempt.

Maintain it with `plain_talk_vocab` (`list` / `add` / `remove` / `classify`) or by editing the JSON.

## Self-check tool

`plain_talk_check` takes a draft and reports:

- errors: cross-turn wording, session/subagent/tool names, pointer-only citations;
- warnings: unexplained codes, over 12 lines / 300 characters, lists over 5, preamble, closing offer, English-only reply to a Chinese user.

The section asks the model to run it for completion reports and replies over 12 lines. It advises; it never blocks.

## How it works

- Host (`dsh/index.js`) registers one `systemPrompt` section (`plain-talk`, order 55) whose text function returns the rules only while that session's switch is on.
- Browser half (`lib/client.js`) registers into `conversation.input.left` and renders a 24×24 button.
- Loopback route `/plain-talk/state` (GET/POST, 127.0.0.1/::1 only, 8 KB body limit).
- Two atomic sidecar files; 256 sessions and 2,000 vocabulary terms are bounded.
- No session events are written.

## Permissions and data

It writes only those two JSON files. No network, no upload, no credential access. A corrupt state file reads as "no choice recorded".

## Configuration

No profile config; only `PLAIN_TALK_DEFAULT=on|off`.

## Known limits

- The button position depends on `conversation.input.left`; a host redesign may move it, without breaking the feature.
- Rules are prompt constraints, not enforcement. `plain_talk_check` warns; it cannot stop a send.
- Vocabulary is per user, not per project.
- Code detection is heuristic: `M11`, `dev-1200`, `c590` are flagged; plain English project names and Chinese terms are not forced into glosses.
- Mode on adds roughly 590 input tokens per step.

## Repository contents

The repository keeps runtime and documentation only: `dsh/` (host), `lib/` (browser), `cordis.patch.yml`, `locale/`, `icon.svg`, both READMEs, `CHANGELOG.md`, `LICENSE`, `package.json`. Test scripts, benchmark data, screenshots and local debugging files are not committed and never enter the npm tarball.

## Publishing to npm

1. Keep `files` to runtime needs only: `dsh/`, `lib/`, `cordis.patch.yml`, `locale/`, `icon.svg`, `README*.md`, `CHANGELOG.md`, `LICENSE`. Test scripts, screenshots and benchmark data stay out.
2. Use raw absolute URLs for README images (`https://raw.githubusercontent.com/lizilong1993/dsh-plain-talk/main/...`); a relative path does not render on npm.
3. Ship the prebuilt client; users never run the build.
4. Check the tarball before publishing:

```sh
npm pack --dry-run
```

The current tarball is **14 files / 30.9 kB** (`npm pack --dry-run`, 2026-11-04); re-check after any change so screenshots or test data do not slip in.

5. With 2FA enabled, a classic token is rejected with 403. Use an Automation token or a Granular token with "Bypass 2FA":

```sh
npm config set //registry.npmjs.org/:_authToken=<token>
npm publish
```

## Listing on awesome-dsh-plugin

One file is the whole submission: `data/plugins/<owner>__<repo>.yml`.

```yaml
# data/plugins/lizilong1993__dsh-plain-talk.yml
url: https://github.com/lizilong1993/dsh-plain-talk
name: lizilong1993/dsh-plain-talk
category: ui
description:
  en: 'Composer toggle that shapes replies: conclusion first, inline quotes, no cross-turn references.'
  zh: '输入框「说人话」开关：结论先行、引用原文、去掉需要翻前文的表述。'
```

Requirements:

- `package.json` declares `dsh.bundle.patch` and the repo has `cordis.patch.yml` (`dsh.client` alone is not installable).
- The repository is at least one day old and carries the `dsh-plugin` topic.
- Real, working code; accurate description, no marketing; quote a description that contains `: `.
- One PR adds only that file; never edit the generated READMEs or another entry.

Local pre-check (run inside the upstream `awesome-dsh-plugin` repository; needs `GITHUB_TOKEN`):

```sh
git clone https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
cd awesome-dsh-plugin
node scripts/check-submission.mjs --base origin/main
```

## License

MIT — see [LICENSE](./LICENSE).
