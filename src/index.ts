/**
 * tool-loop-guard: 滑动窗口 + KMP 最小周期检测
 *
 * 检测工具调用的循环模式，分级干预：
 *   p < W/2        → block（阻止执行）
 *   W/2 ≤ p < W    → block + terminate（本轮强制结束）
 *   连续触发 3 次   → compact（重置上下文）
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ─── 配置 ─────────────────────────────────────────────────────────────

/** 滑动窗口大小 */
const W = 8;

/** 时间窗口（毫秒），超过此时间的调用不参与计算 */
const TIME_WINDOW_MS = 120_000;

/** p < BLOCK_THRESHOLD 时阻止 */
const BLOCK_THRESHOLD = Math.floor(W / 2);

/** 连续触发 compact 的次数阈值 */
const COMPACT_THRESHOLD = 3;

/** 白名单：这些工具不受限制 */
const WHITELIST = new Set(["ask_user_question", "todo"]);

// ─── 签名生成 ─────────────────────────────────────────────────────────

export function makeSignature(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "bash":
      return `bash:${String((input as { command?: string }).command ?? "").trim()}`;
    case "read":
      return `read:${String((input as { path?: string }).path ?? "")}`;
    case "write":
      return `write:${String((input as { path?: string }).path ?? "")}`;
    case "edit":
      return `edit:${String((input as { path?: string }).path ?? "")}`;
    case "grep":
      return `grep:${String((input as { pattern?: string }).pattern ?? "")}:${String((input as { path?: string }).path ?? "")}`;
    case "find":
      return `find:${String((input as { pattern?: string }).pattern ?? "")}:${String((input as { path?: string }).path ?? "")}`;
    case "ls":
      return `ls:${String((input as { path?: string }).path ?? ".")}`;
    default:
      return `${toolName}:${JSON.stringify(input)}`;
  }
}

// ─── KMP 最小周期 ─────────────────────────────────────────────────────

/**
 * 计算序列的最小周期。
 * 返回 { period, hasCycle }:
 *   - period: 最小周期长度
 *   - hasCycle: 是否存在精确周期（n % period == 0）
 *
 * 如果无周期返回 { period: n, hasCycle: false }。
 */
export function minimumPeriod(seq: string[]): { period: number; hasCycle: boolean } {
  const n = seq.length;
  if (n <= 1) return { period: n, hasCycle: false };

  // KMP failure function
  const fail = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    let j = fail[i - 1];
    while (j > 0 && seq[i] !== seq[j]) {
      j = fail[j - 1];
    }
    if (seq[i] === seq[j]) j++;
    fail[i] = j;
  }

  const lastFail = fail[n - 1];
  const p = n - lastFail;

  if (lastFail > 0 && n % p === 0) {
    return { period: p, hasCycle: true };
  }

  return { period: n, hasCycle: false };
}

// ─── 模板 ─────────────────────────────────────────────────────────────

function buildSteerMessage(toolName: string, timeWindowSec: number, count: number): string {
  return `${toolName} 在过去 ${timeWindowSec}s 内已执行 ${count} 次，输出无变化。请基于当前已有信息继续任务。`;
}

// ─── 扩展主体 ─────────────────────────────────────────────────────────

interface CallRecord {
  signature: string;
  toolName: string;
  timestamp: number;
}

export default function (pi: ExtensionAPI) {
  const history: CallRecord[] = [];
  let blockCount = 0;

  pi.on("tool_call", async (event, ctx) => {
    const now = Date.now();

    // 白名单
    if (WHITELIST.has(event.toolName)) {
      blockCount = 0;
      return;
    }

    // 清理过期记录
    while (history.length > 0 && now - history[0].timestamp > TIME_WINDOW_MS) {
      history.shift();
    }

    // 生成签名并记录
    const signature = makeSignature(event.toolName, event.input as Record<string, unknown>);
    history.push({ signature, toolName: event.toolName, timestamp: now });

    // 对窗口内序列计算最小周期
    const seq = history.map((r) => r.signature);
    const { period, hasCycle } = minimumPeriod(seq);

    if (!hasCycle || period >= seq.length) {
      blockCount = 0;
      return;
    }

    // 计算重复次数
    const repeatCount = Math.floor(seq.length / period);

    // 时间跨度
    const firstIdx = seq.indexOf(seq[0]);
    const firstTime = history[firstIdx]?.timestamp ?? now;
    const timeWindowSec = Math.round((now - firstTime) / 1000);

    // 工具名
    const toolName = history[firstIdx]?.toolName ?? event.toolName;

    // 分级干预
    if (period < BLOCK_THRESHOLD) {
      blockCount++;

      if (blockCount >= COMPACT_THRESHOLD) {
        blockCount = 0;
        ctx.compact({
          customInstructions:
            "你已陷入工具调用循环，上下文已被重置。请基于之前已完成的工作直接输出结果，不要再调用工具。",
          onComplete: () => {
            ctx.ui.notify("已压缩上下文以打破循环", "info");
          },
        });
        return;
      }

      return {
        block: true,
        reason: buildSteerMessage(toolName, timeWindowSec, repeatCount),
        terminate: true,
      };
    }

    if (period < W) {
      blockCount++;
      return {
        block: true,
        reason: buildSteerMessage(toolName, timeWindowSec, repeatCount),
      };
    }
  });

  // 新会话重置
  pi.on("session_start", async () => {
    history.length = 0;
    blockCount = 0;
  });
}
