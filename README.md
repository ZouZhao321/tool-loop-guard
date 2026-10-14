[中文](./README.zh.md)

# tool-loop-guard

A pi extension that watches tool calls with a time-bounded sliding window and KMP minimal-period detection, then steers the agent out of a loop instead of letting it repeat the same call forever.

## Install

```bash
pi install git:github.com/ZouZhao321/tool-loop-guard
```

For local development, install the working copy instead:

```bash
pi install ./tool-loop-guard
```

## What it does

The extension registers two `pi.on` listeners and no tools or commands.

`tool_call` — for every tool call it:

- Builds a signature for the call: `bash` uses the trimmed `command`; `read`, `write` and `edit` use `path`; `grep` and `find` use `pattern` + `path`; `ls` uses `path` (defaulting to `.`); every other tool falls back to `<toolName>:<JSON.stringify(input)>`.
- Drops records older than 120 s (`TIME_WINDOW_MS`) and appends the new signature, so the analysed sequence is the call history inside that time window. `W = 8` is the window size used for the thresholds below.
- Runs KMP minimal-period detection (`minimumPeriod`) over that sequence. A cycle counts only when the sequence length is an exact multiple of the detected period and the period is shorter than the sequence.
- Escalates on the period `p`:
  - `p < W / 2` (that is `p < 4`): blocks the call, returns the steering message as the reason, and terminates the current turn.
  - `W / 2 <= p < W`: blocks the call with the same reason, without terminating.
  - no cycle, or a period equal to the whole sequence: the call goes through and the consecutive-block counter is reset.
- Counts consecutive blocks. After 3 consecutive blocks (`COMPACT_THRESHOLD`) it compacts the context with a custom instruction telling the model to answer from the work already done, then notifies `已压缩上下文以打破循环` through `ctx.ui.notify`. Any other detected block adds 1 to that counter.
- Never blocks `ask_user_question` or `todo` (whitelist); calling one of them resets the counter.
- Steering message, sent as the block reason: `<toolName> 在过去 <n>s 内已执行 <k> 次，输出无变化。请基于当前已有信息继续任务。`, where `<n>` is the elapsed seconds since the oldest recorded call and `<k>` is `floor(sequenceLength / period)`.

`session_start` — clears the recorded history and the block counter.

The extension opens no network connection, runs no external process and writes no files.

## Configuration

There is no configuration file, no environment variable and no command-line flag. The behaviour is fixed by constants at the top of `src/index.ts`:

| Constant            | Value                       | Meaning                                              |
| ------------------- | --------------------------- | ---------------------------------------------------- |
| `W`                 | `8`                         | window size used for the block thresholds            |
| `TIME_WINDOW_MS`    | `120000`                    | calls older than 120 s do not take part in detection |
| `BLOCK_THRESHOLD`   | `Math.floor(W / 2)` = `4`   | `p < BLOCK_THRESHOLD` blocks and terminates the turn |
| `COMPACT_THRESHOLD` | `3`                         | consecutive blocks before the context is compacted   |
| `WHITELIST`         | `ask_user_question`, `todo` | tools that are never blocked                         |

Changing them means editing the source.

## Development

Requirements: Node.js >= 22 and npm.

```bash
npm ci
npm run typecheck    # tsc --noEmit
npm test             # node scripts/smoke.mjs
npm run format       # prettier --write src/
npm run format:check # prettier --check src/
npm pack --dry-run   # inspect the published file list
```

`scripts/smoke.mjs` loads `src/index.ts` (Node 22 strips the types directly, the entry has no build step) and asserts the exported pure functions `makeSignature` and `minimumPeriod` against fixed input sequences, plus the `package.json` manifest and the existence of the `pi.extensions` entry file.

pi loads the extension from `./src/index.ts` as declared in `package.json`; there is no compile step to run before installing.

## License

[MIT](./LICENSE)
