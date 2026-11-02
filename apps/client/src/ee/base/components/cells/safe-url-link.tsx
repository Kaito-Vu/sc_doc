import { CSSProperties, ReactNode } from "react";
import { sanitizeUrl } from "@docmost/editor-ext";
import { Tooltip } from "@mantine/core";
import cellClasses from "@/ee/base/styles/cells.module.css";

type SafeUrlLinkProps = {
  value: string;
  style?: CSSProperties;
  /** Rendered when the URL is rejected by sanitizeUrl (e.g. javascript:). */
  fallback: ReactNode;
};

/** User-entered URL rendered as an external link; unsafe schemes fall back to plain text. */
export function SafeUrlLink({ value, style, fallback }: SafeUrlLinkProps) {
  const href = sanitizeUrl(value);
  if (!href) return <>{fallback}</>;

  return (
    <Tooltip label={value} multiline withinPortal openDelay={400} maw={420}>
      <a
        className={cellClasses.urlLink}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={style}
      >
        {value}
      </a>
    </Tooltip>
  );
}
