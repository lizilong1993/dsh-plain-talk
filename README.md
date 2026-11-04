# dsh-plain-talk（说人话）

<p align="center">
  <img src="icon.svg" alt="dsh-plain-talk" width="72" height="72">
</p>

<p align="center">
  <a href="README.en.md">English</a> · <strong>中文</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/dsh-plain-talk"><img alt="npm" src="https://img.shields.io/npm/v/dsh-plain-talk?style=flat-square"></a>
  <img alt="dsh-plugin" src="https://img.shields.io/badge/dsh--plugin-ready-478CBF?style=flat-square&logo=deepseek&logoColor=white">
</p>

DeepSeek Harness 的回复优化插件：输入框里一个「说人话」开关。打开后，模型回复先给结论、默认不超过 12 行、引用直接贴原文、代号第一次出现时用一句人话解释，并且记住你已经认识的词。

> 它只优化回复内容，不制定计划、不设定验收标准，也不写任何 session 事件。

## 它做什么

- **结论先行**：第一行就是答案或判定，不复述问题、不写"我来看看"。
- **默认短**：≤12 行 / 300 字；能一句说清就一句。你要求展开时才放开深度。
- **自包含**：禁止"上述 / 前面 / 上一轮"；代号（M11、dev-1200、c590）第一次出现写成 `M11（一句话说明）`。
- **引用可读**：给 `文件:行号` 的同时把那几行原文贴出来，不让读者自己翻。
- **用户词汇清单**：你说过的词、项目名、常见术语默认已知，不再反复解释；"调研 X"的第一轮回复例外——X 仍按未知处理，回复交付后才进入清单。

## 实验结果

测试环境：DeepSeek Harness `desktop` profile、headless 运行、模型 `cmc/deepseek/deepseek-v4.1-flash`（high）、2026-11-04。同一提示词、同一工作区，只切换「说人话」开关；每轮开始前清空词汇清单，保证两侧起点一致。

### 汇总

| 场景 | 指标 | 关闭 | 开启 | 变化 |
|---|---|---|---|---|
| A 完成类任务（建 4 个文件并验证） | 最终回复字数 | 144 | 189 | +45（多了"达标"和"你自己确认"） |
| | 输出 token | 2,333 | 1,344 | **−42%** |
| | 工具调用 | 12 | 11 | −1 |
| | 耗时 | 131 s | 107 s | −24 s |
| C 解释类（为什么模型会忘事） | 最终回复字数 | 410 | 350 | **−15%** |
| | 输出 token | 732 | 326 | **−55%** |
| | 回指次数 | 2 | 0 | **−2** |
| D 报告整理（把草稿改成给用户的汇报） | 最终回复字数 | 558 | 496 | **−11%** |
| | 输出 token | 2,781 | 3,066 | +10%（多了一次自检回合） |
| | 未解释代号 | 6 | 0（草稿里的 M11/dev-1200/c590 都补了解释） | **−6** |
| | 只给指针的引用 | 1 | 0 | **−1** |

输入 token 总量（含系统提示词、工具 schema、每一步的上下文）：A 1,832,985 → 1,572,409，C 260,351 → 260,940，D 1,570,662 → 1,573,950。这个数字主要随回合数和工具数量变化，不能当成规则段的成本。

规则段本身的开销可以直接量：C 是单步、零工具运行，输入从 260,351 涨到 260,940，即**每步约 +589 token**。开着插件不是免费的，这部分成本如实列出。

### 输出对比 D：同一份草稿，两侧整理结果

草稿里刻意放了 `M11`、`dev-1200`、`c590`、`G18/G19`、`上述`、`上一轮`、只给 `reports/m11/summary.md:42` 的引用。

**关闭**

```text
结论：M11（新加的实例校验模块）这次不合并。加了它的 G19 定位精度 61.2% → 63.8%，涨 2.6 个百分点，没到 3 个点的门槛。这是跑完实测后的决定，不是"无法评估"。

但对外的版本里有两个数字打架，得先查。

一是开头写"没有带来定位精度提升"，和后面的 +2.6pp 冲突，应改成"有提升，但不够门槛"。

二是 1198/1200 条预测逐字节相同。只剩 2 条不同，最多撬动 0.17 个百分点，凑不出 2.6pp。这两个数至少错一个，而 2.6pp 又刚好卡在门槛下面，不解决这个矛盾，结论就站不住。

另外缺三样：AUROC（排序质量指标）只写了见 reports/m11/summary.md:42，没给数值，文件也不在当前目录；分片合并的结果本身不是 claim-eligible EvalRun（可引用评测记录），要注明是方向性对照；没有置信区间，n=1200 时 2.6pp 约等于 31 条样本的差异，是否显著未知。

你现在就能做的：跑一次全量逐条 diff，确认到底是"1198/1200 相同"还是"+2.6pp"准确，顺带查为什么 B1/B2 两个 bug 修完预测只变了 2 条；把 AUROC 数值补进报告。如果精度确实只有 2.6pp，round10 先别跑。
```

**开启**

```text
结论：M11（给推理流程加“实例验证”一步的实验）没达到合并门槛，不合并。

- dev-1200（1200 条开发集）上定位精度 61.2% → 63.8%，+2.6 个百分点，合并线 3 个百分点。
- 对照批次是 c590：G18（基线，配置名 G18_region_gate_v3）对 G19（G18 加 m11_instance_verify 这一步，保留更早两轮的 m9/m10）。同 manifest（SHA-256 26e3406e…）、seed 42、代码 71e6489，4×V100 分 4 片各 300 条合并成 1200。
- 这是实测对照，不是跑不出来：1200 条里 1198 条预测逐字节相同；B1/B2 两个 bug 已修复。
- 口径瑕疵：分片合并的结果不算可入库的 EvalRun，只能说明分母、manifest、seed 一致。
- AUROC 没有可核对的数值：草稿指向的 reports/m11/summary.md 不在仓库里，这条不引。

下一步：补出 summary.md，或开 round10（下一轮实验）用单个全量 run 复核 G19。
```

差异：开启侧把 `M11`、`dev-1200`、`c590`、`G18`、`G19`、`round10` 全部就地解释；"上述设置"被改成直陈；`reports/m11/summary.md:42` 这种只给指针的引用被替换成"文件不在仓库里，这条不引"；结尾只留一个下一步。关闭侧虽然也解释了 M11，但 `AUROC`、`pp`、`round10` 仍然裸奔，且没有给出下一步选项。

### 输出对比 C：解释类

**关闭**（410 字，回指 2 次）

```text
多数人以为这只是“上下文窗口不够长”，其实窗口够长也会忘。一是截断与压缩：超过窗口的早期轮次会被滑窗丢弃，或者被系统摘要掉，原本的细节就没了。二是注意力是软检索，没有索引保证——候选内容越多，权重越被摊薄，而且位置偏差很明显（“lost in the middle”：开头和结尾记得住，中间段最容易被忽略）。三是位置编码在超长距离上外推能力下降，早期 token 与当前 token 的关联信号本来就更弱。

再往深一层，是训练目标没给“长期记忆”发工资。预训练是逐 token 预测，几乎不惩罚“忘了前面说过什么”，模型因此没学出显式的记忆读写机制；早期信息只能靠每层残差流反复重编码往后传，而这条通道带宽有限，误差逐层累积。加上实际产品还会做 KV cache 压缩、历史摘要、检索式拼接，早期内容往往以有损形式才活到当下。所以真正管用的办法不是“让它记住”，而是把关键事实外置：检索、写进系统提示、或在需要时重述。
```

**开启**（350 字，回指 0 次）

```text
简单说，模型没有“记忆”，它每次回答只能看到当前上下文窗口里的全部 token；窗口塞满后，早先的对话要么被截断、要么被压缩成摘要，原文就没了。窗口再大也不是无限，而塞得越满，注意力被稀释得越厉害：远处的信息权重低、容易被中间位置淹没（常说的 lost-in-the-middle），于是“看得见但用不上”。

另一层原因是训练时的分布。模型主要在短文本上学习长距离依赖，真到几万 token 的跨度，它把“第 3 轮的约束”和“第 80 轮的问题”关联起来的能力，本来就弱于人类的理解记忆；加上系统端为了省算力会做 KV 缓存淘汰、滑动窗口保留最近若干轮，早期内容被结构性丢弃。所以这不是“忘了”，而是从没被持续保留——需要跨长对话保持的信息，得靠外部记录（写入文件、检索、每轮重述关键约束）来补。
```

### 输出对比 A：完成类任务

**关闭**（144 字）

```text
任务完成，产物都在 `bench-demo/` 目录：

- `a.txt`、`b.txt`、`c.txt`，内容分别是 A、B、C
- `check.mjs`：按 a→b→c 顺序读取三个文件，去掉换行后拼接输出

运行 `node check.mjs`，输出 `ABC`，退出码 0。
```

**开启**（189 字）

```text
已达标：`bench-demo` 下四个文件已就位，运行脚本输出 `ABC`。

- `a.txt`、`b.txt`、`c.txt` 各只有一行 `A`、`B`、`C`
- `check.mjs` 按 a → b → c 顺序读取、拼接并打印，实测输出：`ABC`

你自己确认：在 `bench-demo` 目录执行 `node check.mjs`，应看到一行 `ABC`。
```

这一组开启侧多了 45 字，但第一行从"任务完成"变成"已达标 + 结论"，并补了一条读者能照做的确认步骤；输出 token 反而少了 42%。

### 怎么读这些数字

- 三个场景里，输出 token 两组下降（−42%、−55%），一组上升（+10%，因为多跑了一次自检回合）。**插件不保证每个场景都更省 token。**
- 输入侧固定多出规则段（约 +590 token/步），回合越多总成本越高；短问答里这笔开销占比明显。
- 另有一个调查类场景 B：关闭侧在 24 次工具调用后提前结束、只回了 87 字，属于无效对照，已从表格剔除；开启侧正常输出 867 字。样本量小，不做结论。
- 复现方式：同一模型、同一提示词、同一工作区，只在输入框切换开关各跑一次；词汇清单在两侧开始前清空。

## 安装

需要 DeepSeek Harness 带 `conversation.input.left` 插槽的版本（0.2.x 线）。

```sh
# npm（推荐，预构建，免安装期构建）
dsh plugin --profile desktop add dsh-plain-talk

# GitHub
dsh plugin --profile desktop add github:lizilong1993/dsh-plain-talk

# 本地目录
dsh plugin --profile desktop add ./dsh-plain-talk
```

装完重启 DSH。`bundles` 决定是否加载；`cordis.patch.yml` 只是配置层。

## 使用

1. 打开任意会话，输入框左下角、权限选择器右侧会多一个气泡图标。
2. 默认开启（蓝色）；点一下变灰，立即关闭，只影响当前会话。
3. 状态写在 `$DSH_HOME/plain-talk.json`，按会话 id 记录，重启后保持；A 会话关掉不影响 B 会话。
4. 想让新会话默认关闭：在启动 DSH 的环境里设 `PLAIN_TALK_DEFAULT=off`，之后每个会话单独点开。

按钮失败时会回滚显示，不会出现"界面显示开着、模型其实没收到规则"的状态。

## 词汇清单

插件维护一份用户级词表 `$DSH_HOME/plain-talk-vocab.json`，跨会话共享。

| 类别 | 含义 | 例子 |
|---|---|---|
| 常识词汇 | 内置，不需要解释 | arXiv、DOI、API、GPU |
| 专业词汇 | 你用过的领域词 | 扩散模型、AUROC |
| 项目 / 产品名 | 仓库、产品、工作区名 | MechDW、GeoEvidence_V2 |
| 内部代号 | 实验号、任务号、提交号 | M11、dev-1200、c590 |
| 待归类 | 记录但还没分类 | 其他被识别到的代号 |

**"调研 X"的两阶段规则**：你说"调研 / 研究 / 查一下 X"时，X 被标记为本会话的待确认词，**第一次回复仍按未知处理并解释**；这条回复交付后，X 才写入词表，之后不再解释。这条规则只对非常识词生效（"调研 arXiv"不会要求解释 arXiv）。

维护方式：模型可以调用 `plain_talk_vocab`（`list` / `add` / `remove` / `classify`），你也可以直接改 JSON。

## 自检工具

`plain_talk_check` 接收一条草稿，返回问题清单：

- 必须改：回指词、会话号 / 子代理 / 工具名、只给 `文件:行号` 没有原文。
- 建议改：未解释的内部代号、超过 12 行 / 300 字、列表超过 5 条、开头寒暄、结尾征询、中文用户却整段英文。

规则区段要求模型在"完成类回复或超过 12 行的回复"发送前调用它；它只是建议工具，不会拦截发送。

## 工作原理

- **Host**（`dsh/index.js`）注册一个系统提示词段落（`plain-talk`，order 55）：文本是函数，只有当前会话开关打开时返回规则正文，否则返回空串。
- **浏览器端**（`lib/client.js`）注册进 `conversation.input.left`，渲染 24×24 气泡按钮；开=强调蓝，关=中性灰。
- **通信**：loopback 路由 `/plain-talk/state`，`GET ?sessionId=` 读、`POST {sessionId, enabled}` 写；只接受 127.0.0.1 / ::1，body ≤8 KB。
- **状态**：`$DSH_HOME/plain-talk.json`（会话开关）与 `$DSH_HOME/plain-talk-vocab.json`（词汇清单），均为原子写；开关最多记 256 个会话，词表最多 2000 条。
- **不写 session 事件**：fork、replay、旧版本读取都不受影响。

## 权限与数据

- 只写上面两个 JSON 文件；不联网、不上传、不读凭据。
- 词表内容来自你自己的消息与手动维护，不上报。
- 状态文件损坏时按"无记录"处理（默认值生效），不会把模式锁死。

## 配置

没有 profile 配置项；只有环境变量 `PLAIN_TALK_DEFAULT`（`on` / `off`，默认 `on`）。

## 已知限制

- 按钮位置依赖 `conversation.input.left` 的渲染方式；宿主改版后可能退到其它左侧控件旁边，功能不受影响。
- 规则是提示词约束，不是硬拦截；模型仍可能违反。`plain_talk_check` 只能提醒，不能阻止发送。
- 词表按"用户"而不是按项目隔离：在 A 项目学到的词，B 项目也视为已知。
- 代号识别是启发式：`M11`、`dev-1200`、`c590` 会被标记；纯英文项目名、中文术语不会被硬性要求解释。
- 默认开启会给每个请求多带约 590 token。

## 仓库内容

仓库只保留运行与文档文件：`dsh/`（宿主端）、`lib/`（浏览器端）、`cordis.patch.yml`、`locale/`、`icon.svg`、两份 README、`CHANGELOG.md`、`LICENSE`、`package.json`。测试脚本、基准数据、截图与本地调试文件不提交，也不进 npm 包。

## 发布到 npm

README 会直接显示在 npm 包页面，所以发布前检查这几件事：

1. `package.json` 的 `files` 只放运行必需：`dsh/`、`lib/`、`cordis.patch.yml`、`locale/`、`icon.svg`、`README*.md`、`CHANGELOG.md`、`LICENSE`。测试脚本、截图与基准数据不进包。
2. 图片用 raw 绝对链接（`https://raw.githubusercontent.com/lizilong1993/dsh-plain-talk/main/...`），否则 npm 页面不显示；不要把大图塞进 `files`。
3. 预构建产物随包提交（本项目的 `lib/client.js` 是手写文件），用户端不跑构建脚本。
4. 发布前核对包装内容与体积：

```sh
npm pack --dry-run
```

5. 账号开了 2FA 时，普通 token 会被 403 拒绝；需要 **Automation token** 或勾选 **Bypass 2FA** 的 Granular token：

```sh
npm config set //registry.npmjs.org/:_authToken=<token>
npm publish
```

`files` 当前打出来是 **14 个文件 / 30.6 kB**（`npm pack --dry-run`，2026-11-04）；改动后重新核对，别让截图或测试数据混进去。

## 收录到 awesome-dsh-plugin

条目是一个文件：`data/plugins/<owner>__<repo>.yml`。本插件对应：

```yaml
# data/plugins/lizilong1993__dsh-plain-talk.yml
url: https://github.com/lizilong1993/dsh-plain-talk
name: lizilong1993/dsh-plain-talk
category: ui
description:
  en: 'Composer toggle that shapes replies: conclusion first, inline quotes, no cross-turn references.'
  zh: '输入框「说人话」开关：结论先行、引用原文、去掉需要翻前文的表述。'
```

前置条件（CI 与人工都会看）：

- `package.json` 声明 `dsh.bundle.patch`，仓库根有 `cordis.patch.yml`（只有 `dsh.client` 不可安装）。
- 仓库创建满 1 天，且加了 `dsh-plugin` topic。
- 有真实可用代码，不是占位或纯 README。
- 描述只说功能、不夸大；写到的命令 / API 必须真实存在；描述含 `: ` 时整行加引号。
- 一个 PR 只加自己这一个文件，不手工编辑生成出来的 README，不改别人的条目。
- 可选：`icon`（GitHub 托管的位图，作为市场卡片）与 `tarball`（预构建包）。

本地预检（在上游 `awesome-dsh-plugin` 仓库里执行，需要 `GITHUB_TOKEN`）：

```sh
git clone https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
cd awesome-dsh-plugin
node scripts/check-submission.mjs --base origin/main
```

## 许可

MIT —— 见 [LICENSE](./LICENSE)。
