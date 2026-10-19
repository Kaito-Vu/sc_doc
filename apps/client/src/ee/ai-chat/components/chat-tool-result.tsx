import { useState } from "react";
import { IconChevronRight, IconChevronDown } from "@tabler/icons-react";
import type { AiChatToolCall } from "../types/ai-chat.types";
import classes from "../styles/chat-message.module.css";
import i18n from "@/i18n";

export const TOOL_LABELS: Record<string, string> = {
  list_spaces: i18n.t("Listed spaces"),
  search_pages: i18n.t("Searched pages"),
  get_page: i18n.t("Read page"),
  create_page: i18n.t("Created page"),
  update_page: i18n.t("Updated page"),
};

type Props = {
  toolCall: AiChatToolCall;
};

export default function ChatToolResult({ toolCall }: Props) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[toolCall.name] || toolCall.name;

  return (
    <div className={classes.toolStep}>
      <div
        className={classes.toolStepRow}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className={classes.toolStepBullet}>·</span>
        {expanded ? (
          <IconChevronDown size={12} />
        ) : (
          <IconChevronRight size={12} />
        )}
        <span>{label}</span>
      </div>
      {expanded && (
        <div className={classes.toolStepDetails}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {JSON.stringify(
              { args: toolCall.args, result: toolCall.result },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </div>
  );
}
