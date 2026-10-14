# Changelog

所有重要的版本变更都会记录在此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

## [0.1.0] - 2026-10-14

### Added

- 时间受限的滑动窗口调用历史，丢弃超过 120 秒的记录，仅对窗口内的调用序列做循环检测。
- `makeSignature` 生成调用签名：`bash` 取去掉首尾空白的 `command`，`read`、`write`、`edit` 取 `path`，`grep`、`find` 取 `pattern` 与 `path`，`ls` 取 `path`（缺省为 `.`），其余工具回退为工具名加输入 JSON。
- `minimumPeriod` 用 KMP 失配函数计算序列的最小周期，仅当序列长度为检出周期的整数倍且周期短于序列长度时判定为循环。
- 按周期 `p` 分级干预：`p < W / 2` 时阻止该次调用并结束本轮，`W / 2 <= p < W` 时阻止该次调用但不结束本轮，两种情形都把引导语作为阻止原因返回。
- 引导语按窗口内最早一条记录的时间跨度与重复次数生成，形如 `<工具名> 在过去 <n>s 内已执行 <k> 次，输出无变化。请基于当前已有信息继续任务。`。
- 连续阻止达到 3 次时压缩上下文，附带要求基于已完成工作直接作答的自定义指令，并提示已压缩上下文以打破循环。
- `ask_user_question` 与 `todo` 白名单，调用时不参与检测并重置连续阻止计数。
- 监听 `tool_call` 与 `session_start` 事件，后者在会话开始时清空调用历史与阻止计数。
- 常量可配置项 `W`、`TIME_WINDOW_MS`、`BLOCK_THRESHOLD`、`COMPACT_THRESHOLD`、`WHITELIST`，修改行为需改动 `src/index.ts`。
