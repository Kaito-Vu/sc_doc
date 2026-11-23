import type {
  AiChatMessage,
  AiChatStreamEvent,
  AiChatToolCall,
} from "../types/ai-chat.types";

export type ChatStreamState = {
  messages: AiChatMessage[];
  streamingContent: string;
  streamingToolCalls: AiChatToolCall[];
  isStreaming: boolean;
  error: string | null;
  errorCode: string | null;
  isRetryable: boolean;
};

export const initialChatStreamState: ChatStreamState = {
  messages: [],
  streamingContent: "",
  streamingToolCalls: [],
  isStreaming: false,
  error: null,
  errorCode: null,
  isRetryable: false,
};

// Impure inputs (ids, timestamps, chat id) are carried on the action so the
// reducer stays pure and safe to run twice under StrictMode.
export type ChatStreamAction =
  | Exclude<AiChatStreamEvent, { type: "done" } | { type: "chat_created" }>
  | {
      type: "done";
      messageId: string;
      usage?: Record<string, number>;
      chatId: string;
      now: string;
    }
  | { type: "reset" }
  | { type: "hydrate"; messages: AiChatMessage[] }
  | { type: "send"; userMessage: AiChatMessage }
  | { type: "stop"; id: string; chatId: string; now: string }
  | { type: "stream_error"; message: string }
  | { type: "stream_end" };

function flush(
  state: ChatStreamState,
  msg: Pick<AiChatMessage, "id" | "chatId" | "metadata" | "createdAt">,
  force: boolean,
): ChatStreamState {
  const { streamingContent: c, streamingToolCalls: tc } = state;
  const append = force || c || tc.length > 0;
  return {
    ...state,
    messages: append
      ? [
          ...state.messages,
          {
            ...msg,
            role: "assistant",
            content: c || null,
            toolCalls: tc.length ? tc : null,
          },
        ]
      : state.messages,
    streamingContent: "",
    streamingToolCalls: [],
    isStreaming: false,
  };
}

export function reduceStreamEvent(
  state: ChatStreamState,
  event: ChatStreamAction,
): ChatStreamState {
  switch (event.type) {
    case "reset":
      return {
        ...state,
        messages: [],
        error: null,
        errorCode: null,
        isRetryable: false,
      };
    case "hydrate":
      return { ...state, messages: event.messages };
    case "send":
      return {
        ...state,
        error: null,
        errorCode: null,
        isRetryable: false,
        isStreaming: true,
        streamingContent: "",
        streamingToolCalls: [],
        messages: [...state.messages, event.userMessage],
      };
    case "content":
      return {
        ...state,
        streamingContent: state.streamingContent + event.text,
      };
    case "tool_call":
      return {
        ...state,
        streamingToolCalls: [
          ...state.streamingToolCalls,
          { id: event.id, name: event.name, args: event.args },
        ],
      };
    case "tool_result":
      return {
        ...state,
        streamingToolCalls: state.streamingToolCalls.map((tc) =>
          tc.id === event.id ? { ...tc, result: event.result } : tc,
        ),
      };
    case "done":
      return flush(
        state,
        {
          id: event.messageId,
          chatId: event.chatId,
          metadata: event.usage ? { tokenUsage: event.usage } : null,
          createdAt: event.now,
        },
        true,
      );
    case "stop":
      return flush(
        state,
        { id: event.id, chatId: event.chatId, metadata: null, createdAt: event.now },
        false,
      );
    case "error":
      return {
        ...state,
        error: event.message,
        errorCode: event.code || null,
        isRetryable: event.retryable || false,
        isStreaming: false,
      };
    case "stream_error":
      return { ...state, error: event.message, isStreaming: false };
    case "stream_end":
      return { ...state, isStreaming: false };
  }
}
