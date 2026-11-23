import { describe, it, expect } from "vitest";
import {
  initialChatStreamState as init,
  reduceStreamEvent as r,
  type ChatStreamAction,
} from "./chat-stream-reducer";

const run = (...evs: ChatStreamAction[]) => evs.reduce(r, init);
const done: ChatStreamAction = {
  type: "done",
  messageId: "m1",
  chatId: "c1",
  now: "t",
};

describe("reduceStreamEvent", () => {
  it("accumulates content", () => {
    const s = run(
      { type: "content", text: "He" },
      { type: "content", text: "llo" },
    );
    expect(s.streamingContent).toBe("Hello");
  });

  it("tool_call then tool_result", () => {
    const s = run(
      { type: "tool_call", id: "t1", name: "x", args: { a: 1 } },
      { type: "tool_result", id: "t1", result: "ok" },
    );
    expect(s.streamingToolCalls).toEqual([
      { id: "t1", name: "x", args: { a: 1 }, result: "ok" },
    ]);
  });

  it("done flushes the assistant message exactly once, even if run twice", () => {
    const before = run(
      { type: "content", text: "hi" },
      { type: "tool_call", id: "t1", name: "x", args: {} },
    );
    const a = r(before, done);
    const b = r(before, done); // StrictMode double invoke on same input
    expect(a).toEqual(b);
    expect(a.messages).toHaveLength(1);
    expect(a.messages[0]).toMatchObject({
      id: "m1",
      role: "assistant",
      content: "hi",
      chatId: "c1",
    });
    expect(a.messages[0].toolCalls).toHaveLength(1);
    expect(a.streamingContent).toBe("");
    expect(a.streamingToolCalls).toEqual([]);
    expect(a.isStreaming).toBe(false);
  });

  it("stop with partial content appends a partial message; empty stop appends nothing", () => {
    const s = r(run({ type: "content", text: "par" }), {
      type: "stop",
      id: "stopped-1",
      chatId: "c1",
      now: "t",
    });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0]).toMatchObject({
      id: "stopped-1",
      content: "par",
      metadata: null,
    });
    expect(
      r(init, { type: "stop", id: "s", chatId: "c1", now: "t" }).messages,
    ).toHaveLength(0);
  });

  it("error sets error fields and stops streaming", () => {
    const s = run(
      {
        type: "send",
        userMessage: {
          id: "u",
          chatId: "",
          role: "user",
          content: "q",
          toolCalls: null,
          metadata: null,
          createdAt: "t",
        },
      },
      { type: "error", message: "boom", code: "E", retryable: true },
    );
    expect(s).toMatchObject({
      error: "boom",
      errorCode: "E",
      isRetryable: true,
      isStreaming: false,
    });
    expect(s.messages).toHaveLength(1);
  });
});
