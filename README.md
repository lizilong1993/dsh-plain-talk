# dsh-plain-talk（说人话）

<p align="center">
  <img src="https://raw.githubusercontent.com/lizilong1993/dsh-plain-talk/main/assets/banner.jpg" alt="dsh-plain-talk — 说人话" width="100%">
</p>

<p align="center">
  <a href="README.en.md">English</a> · <strong>中文</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-263146?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/dsh-plain-talk"><img alt="npm" src="https://img.shields.io/npm/v/dsh-plain-talk?style=flat-square"></a>
  <img alt="dsh-plugin" src="https://img.shields.io/badge/dsh--plugin-ready-478CBF?style=flat-square&logo=deepseek&logoColor=white">
</p>

DeepSeek Harness 的回复优化插件：输入框里一个「说人话」开关。打开后，回复先给结论、默认不超过 12 行、引用直接贴原文、代号第一次出现时用一句人话解释，并记住你已经认识的词。

## 它做什么

- **结论先行**：第一行就是答案或判定，不复述问题，不写"我来看看"。
- **默认短**：≤12 行 / 300 字；你要求展开时才放开深度。
- **自包含**：不用"上述 / 前面 / 上一轮"；代号（EXP-7、DEV-1K、run-3）第一次出现写成 `EXP-7（一句话说明）`。
- **引用可读**：给 `文件:行号` 的同时贴出那几行原文。
- **词汇清单**：你说过的词、项目名、常见术语默认已知；"调研 X"的第一轮仍会解释 X，回复交付后才记住。

## 效果

测试环境：DeepSeek Harness `desktop` profile、headless 运行、模型 `cmc/deepseek/deepseek-v4.1-flash`（high），2026-11-04。同一提示词、同一工作区，只切换开关；两侧开始前都清空词汇清单。

### 汇总

| 场景 | 指标 | 关闭 | 开启 | 变化 |
|---|---|---|---|---|
| A 完成类任务（建 4 个文件并验证） | 最终回复字数 | 144 | 189 | +45（多"达标"和"你自己确认"） |
| | 输出 token | 2,333 | 1,344 | **−42%** |
| | 工具调用 | 12 | 11 | −1 |
| | 耗时 | 131 s | 107 s | −24 s |
| B 解释类（为什么模型会忘事） | 最终回复字数 | 410 | 350 | **−15%** |
| | 输出 token | 732 | 326 | **−55%** |
| | 回指次数 | 2 | 0 | **−2** |
| C 报告整理（把草稿改成给用户的汇报） | 最终回复字数 | 558 | 496 | **−11%** |
| | 输出 token | 2,781 | 3,066 | +10%（多一次自检） |
| | 未解释代号 | 6 | 0 | **−6** |
| | 只给指针的引用 | 1 | 0 | **−1** |

规则段每步约 +589 input token（C 组单步、零工具：260,351 → 260,940）。

### A 完成类：同一任务，两侧输出

| 对比点 | 关闭 | 开启 |
|---|---|---|
| 首行 | 任务完成，产物都在 `bench-demo/` 目录： | 已达标：`bench-demo` 下四个文件已就位，运行脚本输出 `ABC`。 |
| 产物说明 | `a.txt`、`b.txt`、`c.txt` 内容分别是 A、B、C；`check.mjs` 按 a→b→c 顺序读取，去掉换行后拼接输出 | `a.txt`、`b.txt`、`c.txt` 各只有一行 `A`、`B`、`C`；`check.mjs` 按 a → b → c 读取、拼接并打印，实测输出：`ABC` |
| 读者确认 | 运行 `node check.mjs`，输出 `ABC`，退出码 0。 | 你自己确认：在 `bench-demo` 目录执行 `node check.mjs`，应看到一行 `ABC`。 |
| 字数 / 输出 token | 144 / 2,333 | 189 / 1,344 |

### B 解释类：同一问题，两侧输出

| 对比点 | 关闭 | 开启 |
|---|---|---|
| 第一段 | 多数人以为这只是"上下文窗口不够长"，其实窗口够长也会忘。一是截断与压缩……二是注意力是软检索……三是位置编码在超长距离上外推能力下降。 | 简单说，模型没有"记忆"，它每次回答只能看到当前上下文窗口里的全部 token；窗口塞满后，早先的对话要么被截断、要么被压缩成摘要。 |
| 第二段 | 再往深一层，是训练目标没给"长期记忆"发工资。预训练是逐 token 预测，几乎不惩罚"忘了前面说过什么"…… | 另一层原因是训练时的分布。模型主要在短文本上学习长距离依赖，真到几万 token 的跨度，关联能力本来就弱…… |
| 回指 | 2 处（"前面说过"等） | 0 |
| 字数 / 输出 token | 410 / 732 | 350 / 326 |

### C 报告整理：同一份草稿，两侧整理结果

草稿里放了代号、回指和只给指针的引用。示例中的项目代号已替换为中性占位符。

| 对比点 | 关闭 | 开启 |
|---|---|---|
| 结论句 | 结论：EXP-7（新加的实例校验模块）这次不合并。加了它的 CAND 定位精度 61.2% → 63.8%，涨 2.6 个百分点，没到 3 个点的门槛。 | 结论：EXP-7（给推理流程加"实例验证"一步的实验）没达到合并门槛，不合并。 |
| 代号处理 | EXP-7、CAND 有解释；AUROC、pp、round-2 仍是裸代号 | EXP-7、DEV-1K、run-3、BASE、CAND、round-2 全部就地解释 |
| 引用 | 只写"见 reports/exp7/summary.md:42"，没有原文 | 说明该文件不在仓库里，这条不引用 |
| 下一步 | 一段话里给了多个选项 | 只给一个动作 |
| 字数 / 输出 token | 558 / 2,781 | 496 / 3,066 |

## 安装

需要带 `conversation.input.left` 插槽的 DeepSeek Harness（0.2.x 线）。

```sh
# npm（推荐，预构建）
dsh plugin --profile desktop add dsh-plain-talk

# GitHub
dsh plugin --profile desktop add github:lizilong1993/dsh-plain-talk

# 本地目录
dsh plugin --profile desktop add ./dsh-plain-talk
```

装完重启 DSH。

## 使用

1. 打开任意会话，输入框权限选择器右侧会多一个气泡图标。
2. 默认开启（蓝色）；点一下变灰，只关掉当前会话。
3. 状态写在 `$DSH_HOME/plain-talk.json`，重启后保持。
4. 想让新会话默认关闭：启动环境里设 `PLAIN_TALK_DEFAULT=off`。

## 词汇清单

`$DSH_HOME/plain-talk-vocab.json`，跨会话共享。

| 类别 | 含义 | 例子 |
|---|---|---|
| 常识词汇 | 内置，不解释 | arXiv、DOI、API、GPU |
| 专业词汇 | 你用过的领域词 | 扩散模型、AUROC |
| 项目 / 产品名 | 仓库、产品、工作区名 | AcmeService_V2、DataHub_V3 |
| 内部代号 | 实验号、任务号、提交号 | EXP-7、DEV-1K、run-3 |
| 待归类 | 已记录、未分类 | 其他识别到的代号 |

"调研 X"分两步：X 先记为待确认，第一轮回复照常解释；回复交付后写入词表。常识词（如 arXiv）不受影响。

维护用 `plain_talk_vocab`：`list` / `add` / `remove` / `classify`；也可以直接改 JSON。

## 自检工具

`plain_talk_check` 接收一条草稿，返回问题清单：

- 必须改：回指词、会话号 / 子代理 / 工具名、只给指针没有原文。
- 建议改：未解释代号、超过 12 行 / 300 字、列表超过 5 条、开头寒暄、结尾征询、中文用户却整段英文。

规则区段要求模型在完成类回复或超过 12 行的回复发送前调用它。

## 工作原理

- 宿主端（`dsh/index.js`）注册一个系统提示词段落（`plain-talk`，order 55），只有当前会话开关打开时返回规则正文。
- 浏览器端（`lib/client.js`）注册进 `conversation.input.left`，渲染 24×24 气泡按钮。
- 开关经 loopback 路由 `/plain-talk/state` 读写（仅 127.0.0.1 / ::1，body ≤8 KB）。
- 状态与词表都是 JSON sidecar，原子写；不写 session 事件。

## 数据与权限

只写 `$DSH_HOME/plain-talk.json` 和 `$DSH_HOME/plain-talk-vocab.json`。不联网、不上传、不读凭据；状态文件损坏时按"无记录"处理。

## 配置

只有环境变量 `PLAIN_TALK_DEFAULT`（`on` / `off`，默认 `on`）。

## 注意

- 按钮位置依赖 `conversation.input.left`，宿主改版后可能移到其它左侧控件旁。
- 规则是提示词约束，`plain_talk_check` 只提醒、不拦截发送。
- 词表按用户共享，不按项目隔离；代号识别是启发式判断。
- 默认开启时每个请求多约 590 input token。

## 许可

MIT —— 见 [LICENSE](./LICENSE)。
