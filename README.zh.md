[English](./README.md)

# tool-loop-guard

利用时间受限的滑动窗口与 KMP 最小周期检测识别工具调用的循环，把 agent 从重复调用中拉出来，而不是放任它一直重复同一次调用。

## 功能特性

扩展注册两个 `pi.on` 监听，不注册任何工具或命令。

`tool_call` —— 对每次工具调用：

- 生成调用签名：`bash` 使用去掉首尾空白的 `command`；`read`、`write`、`edit` 使用 `path`；`grep`、`find` 使用 `pattern` + `path`；`ls` 使用 `path`（缺省为 `.`）；其他工具回退为 `<工具名>:<JSON.stringify(input)>`。
- 丢弃超过 120s（`TIME_WINDOW_MS`）的记录并追加新签名，因此参与检测的序列就是该时间窗口内的调用历史；`W = 8` 是下面阈值使用的窗口大小。
- 对序列做 KMP 最小周期检测（`minimumPeriod`）。仅当序列长度为检出周期的整数倍、且周期短于序列长度时才算命中循环。
- 按周期 `p` 分级处理：
  - `p < W / 2`（即 `p < 4`）：阻止该次调用，把引导语作为阻止原因返回，并结束本轮。
  - `W / 2 <= p < W`：阻止该次调用并返回同样的原因，但不结束本轮。
  - 未命中循环，或周期等于整个序列：放行该次调用，并重置连续阻止计数。
- 统计连续阻止次数：连续 3 次（`COMPACT_THRESHOLD`）时改为压缩上下文，附带要求模型基于已完成工作直接作答的自定义指令，并通过 `ctx.ui.notify` 提示 `已压缩上下文以打破循环`；其余命中阻止时计数加 1。
- 永不阻止 `ask_user_question` 与 `todo`（白名单）；调用其中之一会重置计数。
- 引导语（即阻止原因）：`<工具名> 在过去 <n>s 内已执行 <k> 次，输出无变化。请基于当前已有信息继续任务。`，其中 `<n>` 为距最早一条记录经过的秒数，`<k>` 为 `floor(序列长度 / 周期)`。

`session_start` —— 清空调用历史与阻止计数。

扩展不发起网络连接、不启动外部进程、不写文件。

## 快速开始

### 环境要求

- Node.js >= 22
- npm

### 安装

```bash
pi install git:github.com/ZouZhao321/tool-loop-guard
```

### 运行

本地开发时直接安装工作副本：

```bash
pi install ./tool-loop-guard
```

### 开发

```bash
npm ci
npm run typecheck    # tsc --noEmit
npm test             # node scripts/smoke.mjs
npm run format       # prettier --write src/
npm run format:check # prettier --check src/
npm pack --dry-run   # 查看发布文件清单
```

### 测试

`scripts/smoke.mjs` 加载 `src/index.ts`（Node 22 直接剥离类型，入口无需构建），对导出的纯函数 `makeSignature` 与 `minimumPeriod` 用固定输入序列断言，并校验 `package.json` 清单与 `pi.extensions` 指向的入口文件存在。

## 配置

没有配置文件、环境变量或命令行开关，行为由 `src/index.ts` 顶部的常量决定：

| 常量                | 取值                        | 含义                                   |
| ------------------- | --------------------------- | -------------------------------------- |
| `W`                 | `8`                         | 阻止阈值使用的窗口大小                 |
| `TIME_WINDOW_MS`    | `120000`                    | 超过 120s 的调用不参与检测             |
| `BLOCK_THRESHOLD`   | `Math.floor(W / 2)` = `4`   | `p < BLOCK_THRESHOLD` 时阻止并结束本轮 |
| `COMPACT_THRESHOLD` | `3`                         | 触发上下文压缩的连续阻止次数           |
| `WHITELIST`         | `ask_user_question`、`todo` | 永不阻止的工具                         |

修改这些常量需要改动源码。

## 项目结构

```
├── src/index.ts     # 扩展入口
├── scripts/         # 冒烟测试
├── README.md        # 英文文档
├── README.zh.md     # 中文文档
└── package.json
```

## 贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何参与贡献。

## 许可证

[MIT](LICENSE)
