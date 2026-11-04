# dsh-plain-talk (Plain Talk)

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

A reply-shaping plugin for DeepSeek Harness: a "Plain talk" switch in the composer. When on, replies lead with the conclusion, stay under 12 lines by default, paste cited text directly, gloss a code with one plain sentence the first time it appears, and remember the words you already know.

## What it does

* **Conclusion first**: the first line is the answer or the verdict; no restating the question, no "let me take a look".
* **Short by default**: ≤12 lines / 300 characters; depth only when you ask for it.
* **Self-contained**: no "as mentioned above / earlier / last round"; a code (EXP-7, DEV-1K, run-3) is written as `EXP-7 (one sentence explaining it)` on first use.
* **Readable citations**: when giving `file:line`, paste the quoted lines.
* **Vocabulary**: words you have used, project names and common terms count as known; "research X" still explains X on the first reply, then remembers it. Codes never enter the list.

## Results

Environment: DeepSeek Harness `desktop` profile, headless run, model `command code/deepseek-v4.1-flash (high)`, 2026-11-04. Same prompt, same workspace, only the switch changes.

### Output comparison

|Case|Off|On|
|-|-|-|
|A1 Create and verify files|Task complete; the artifacts are in `bench-demo/`:<br><br>- `a.txt`, `b.txt`, `c.txt` contain A, B, C<br>- `check.mjs`: reads the three files in a→b→c order, strips newlines and joins them<br><br>Run `node check.mjs`; it prints `ABC`, exit code 0.|Done: the four files are in `bench-demo/`, and running the script prints `ABC`.<br><br>- `a.txt`, `b.txt`, `c.txt` each hold a single line `A`, `B`, `C`<br>- `check.mjs` reads a → b → c, joins and prints; measured output: `ABC`<br><br>Check it yourself: run `node check.mjs` in `bench-demo`; you should see one line `ABC`.|
|A2 Write and read back|Done.<br><br>- Created `hello.txt` with `Hello`<br>- Read back confirms 1 line containing `Hello`<br><br>File path: `<workspace>/hello.txt`|I created hello.txt in the workspace root with `Hello` : <br>`1: Hello`.<br><br>File path: `<workspace>/hello.txt`|
|B1 Why models forget|Most people think this is only "the context window is too short"; even a long window forgets. First, truncation and compression: early turns beyond the window are dropped by the sliding window or summarized by the system, and the detail is gone. Second, attention is soft retrieval with no index guarantee — the more candidates, the more the weights are diluted, and position bias is obvious ("lost in the middle": the start and end stick, the middle is ignored). Third, positional encoding extrapolates worse over very long distances, so the signal linking early tokens to the current one is weaker.<br><br>Deeper down, the training objective never paid for "long-term memory". Pretraining predicts the next token and barely penalizes forgetting what was said earlier, so the model never learns an explicit memory read/write mechanism; early information survives only by being re-encoded through residual streams, which have limited bandwidth and accumulate error. Real products also do KV-cache compression, history summarization and retrieval stitching, so early content reaches the present in lossy form. The workable fix is not "make it remember" but externalize the key facts: retrieval, write them into the system prompt, or restate them when needed.|Put simply, the model has no "memory"; each answer sees only the tokens in the current context window. Once the window fills, earlier turns are truncated or compressed into a summary and the original text is gone. A bigger window is still finite, and the fuller it gets the more attention is diluted: distant information has low weight and is easily buried in the middle (the so-called lost-in-the-middle), so it is "visible but unusable".<br><br>The other cause is the training distribution. Models mostly learn long-range dependencies on short text; at tens of thousands of tokens, linking "the constraint from turn 3" to "the question at turn 80" is naturally weaker than human comprehension and recall. On top of that, systems drop KV cache and keep only recent turns to save compute, so early content is structurally discarded. It is not that the model "forgot" — the content was never continuously retained. Anything that must survive a long conversation needs an external record: write it to a file, retrieve it, or restate the key constraints each turn.|
|B2 merge vs rebase|`git merge` keeps the full history of both branches and creates a merge commit, so the history is truthful but forked and not linear in time. `git rebase` replays your branch's commits one by one onto the latest commit of the target branch, producing a linear, clean history but rewriting commit hashes. In practice, prefer merge on shared branches so you do not disturb others' history; use rebase to integrate the latest code on a personal branch and keep commits tidy.|**merge keeps the fork and joins it; rebase moves commits onto a new base and rewrites history.** merge creates a new merge commit joining the two branches and leaves existing hashes unchanged; rebase replays your branch's commits onto the target's latest commit, creating new commits (all hashes change) and a straight line. So merge is safer for commits already pushed to a shared branch; rebase is only for local commits not yet pushed, otherwise it breaks references others hold to the old history.|
|C1 Experiment draft|Conclusion: EXP-7 is not merging this time. With it, CAND's localization accuracy went 61.2% → 63.8%, +2.6 points, short of the 3-point bar. This is a decision after a real run, not "cannot evaluate".<br><br>But the external version has two numbers that contradict each other; check that first.<br><br>First, the opening says "no accuracy gain", which conflicts with +2.6pp later; it should say "a gain, but under the bar".<br><br>Second, 1198/1200 predictions are byte-identical. Only 2 differ, which can move at most 0.17 points — not 2.6pp. At least one of these numbers is wrong, and 2.6pp sits just under the bar; until that contradiction is resolved the conclusion does not hold.<br><br>Three things are also missing: AUROC is only cited as reports/exp7/summary.md:42 with no value, and the file is not here; sharded merging is not a claim-eligible EvalRun and must be labelled a directional comparison; there is no confidence interval — at n=1200, 2.6pp is about 31 samples, so significance is unknown.<br><br>What you can do now: run a full per-item diff to see whether "1198/1200 identical" or "+2.6pp" is right, check why fixing two known defects changed only 2 predictions, and put the AUROC value into the report. If the gain really is 2.6pp, do not start round-2 yet.|Conclusion: EXP-7 (the experiment that adds an "instance verification" step to the inference flow) did not reach the merge bar; do not merge.<br><br>- On DEV-1K (the 1200-sample dev set) localization accuracy went 61.2% → 63.8%, +2.6 points; the merge bar is 3 points.<br>- The comparison run is run-3: BASE (baseline, config name base_v3) vs CAND (BASE plus exp7_verify, keeping the previous two rounds' config). Same manifest (SHA-256 a1b2c3d…), seed 42, code e4f5a6b, 4×GPU in 4 shards of 300 each merged into 1200.<br>- This is a measured comparison, not a failed run: 1198 of 1200 predictions are byte-identical; two known defects are fixed.<br>- Caveat: a sharded merge is not an EvalRun that can enter the record; it only shows the denominator, manifest and seed match.<br>- AUROC has no verifiable value: the draft points at reports/exp7/summary.md, which is not in the repository, so this line is not cited.<br><br>Next step: produce summary.md, or run round-2 as a single full run to re-check CAND.|
|C2 Release-check draft|**Conclusion**: you cannot issue a "ready to ship" report now. The draft puts "ready to ship" next to "run-7 regression is not finished" without stating the condition, so sending it would read as unconditional approval. The accurate wording is **conditional release: decide after the run-7 regression wraps up**.<br><br>**Confirmed**<br>- The check covers login, payment and export<br>- Export time dropped from 4.2s to 3.1s<br>- The payment callback failed once in run-7; the draft points to logs/run-7.txt:88<br><br>**Two things required before release**<br>- Finish the run-7 regression and state clearly "all green" or "still failing"<br>- Classify that payment failure: a transient timeout, retryable, or reproducible. This decides whether a known problem can ship and is the most important unknown in the report.<br><br>**What the draft does not say**<br>- Who ran it, when, on which version or environment<br>- Whether "covered three paths" means ran or passed<br>- Whether the failure succeeded on retry<br><br>**What I checked**<br>- There is no `logs/` directory here, so `run-7.txt:88` cannot be verified; it is only relayed as the draft's citation<br>- `draft.md` in the same directory is a report from another experiment and unrelated to the release; I did not merge it in<br><br>**One-paragraph version** (ready to paste): The login, payment and export paths of BUILD-42 were checked, and export time dropped from 4.2s to 3.1s; but the run-7 regression is unfinished and the payment callback failed once in run-7. Decide after the regression wraps up and the nature of that failure is confirmed.<br><br>Do you want me to rewrite this as a formal report, or update `draft2.md` to this version first?|Conclusion: do not ship BUILD-42 (the build about to go out) yet. The draft's own conclusion says "ready to ship", but the same draft says run-7 (the 7th regression round) is unfinished and the payment callback failed once in run-7; both point to not releasing, so the conclusion contradicts the draft body.<br><br>- Coverage: login, payment and export.<br>- Payment: the callback failed once in run-7, recorded at line 88 of run-7's log logs/run-7.txt; the file is not in the current directory, so I cannot quote it — provide the path or paste it.<br>- Export: time dropped from 4.2s to 3.1s.<br>- Regression: run-7 is unfinished and the cause of the payment failure is unknown.<br><br>Next step: rerun run-7 first and check whether the payment failure reproduces; if it does, do not ship.|

### Characters and token difference

|Case|Characters (off / on)|Output tokens (off / on)|
|-|-|-|
|A1 Create and verify files|144 → 189, 31.25%↑|2,333 → 1,344, 42.39%↓|
|A2 Write and read back|124 → 238, 91.94%↑|220 → 398, 80.91%↑|
|B1 Why models forget|410 → 350, 14.63%↓|732 → 326, 55.46%↓|
|B2 merge vs rebase|184 → 194, 5.43%↑|150 → 366, 144.00%↑|
|C1 Experiment draft|558 → 496, 11.11%↓|2,781 → 3,066, 10.25%↑|
|C2 Release-check draft|672 → 331, 50.74%↓|1,636 → 2,092, 27.87%↑|

About +589 input token per step.

## Install

```sh
# npm
dsh plugin --profile desktop add dsh-plain-talk

# GitHub
dsh plugin --profile desktop add github:lizilong1993/dsh-plain-talk

# local directory
dsh plugin --profile desktop add ./dsh-plain-talk
```

Restart DSH after installing.

## Use

1. Open any session; a smiley speech-bubble icon appears to the right of the permission selector in the composer.
2. Off by default (plain smile); one click turns it into the open smile with three sound waves, meaning this session is on. Affects only the current session.
3. State is written to `$DSH_HOME/plain-talk.json` and survives a restart.
4. To make new sessions start on: set `PLAIN_TALK_DEFAULT=on` in the launch environment.

## Vocabulary

`$DSH_HOME/plain-talk-vocab.json`, shared across sessions.

|Category|Meaning|Examples|
|-|-|-|
|common|built in, not explained|arXiv, DOI, API, GPU|
|domain|field terms you have used|diffusion models, AUROC|
|project / product name|repositories, products, workspace names|AcmeService_V2, DataHub_V3|
|unclassified|recorded, not classified|other detected terms|

Internal codes (EXP-7, DEV-1K, run-3) never enter the list: every occurrence is treated as unknown so the model explains it again.

"Research X" has two steps: X is first marked pending and the first reply explains it as usual; after the reply is delivered it is written into the list. Common terms (such as arXiv) are unaffected; internal codes are never recorded.

Maintain it with `plain_talk_vocab`: `list` / `add` / `remove` / `classify`; you can also edit the JSON directly.

## Self-check tool

`plain_talk_check` takes a draft and returns a list of issues:

* Must fix: back-references, session ids / subagents / tool names, pointer-only citations with no quoted text.
* Suggested fixes: unexplained codes, over 12 lines / 300 characters, lists over 5, opening pleasantries, closing requests for more work, a Chinese user receiving an all-English reply.

The rules section asks the model to call it before sending a completion reply or any reply over 12 lines.

## How it works

* Host (`dsh/index.js`) registers a system-prompt section (`plain-talk`, order 55) that returns the rules only when the current session's switch is on.
* Browser half (`lib/client.js`) registers into `conversation.input.left` and renders an 18×18 smiley button.
* The switch is read and written over the loopback route `/plain-talk/state` (127.0.0.1 / ::1 only, body ≤8 KB).
* State and vocabulary are atomic JSON sidecars; no session events are written.

## Data and permissions

Only `$DSH_HOME/plain-talk.json` and `$DSH_HOME/plain-talk-vocab.json` are written. No network, no upload, no credential access; a corrupt state file is treated as "no record".

## Configuration

Only the environment variable `PLAIN_TALK_DEFAULT` (`on` / `off`, default `off`).

## Notes

* Button position depends on `conversation.input.left`; a host redesign may move it beside other left-side controls.
* Rules are prompt constraints; `plain_talk_check` only warns and does not block sending.
* Vocabulary is shared per user, not isolated per project.
* With the switch on, each request carries about 590 extra input tokens.

## License

MIT — see [LICENSE](./LICENSE).
