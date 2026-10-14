import { ActionIcon, Button, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CopyButton } from "@/components/common/copy-button";

interface Props {
  value: string;
  /** "button" = text button with icon, "icon" = icon-only with tooltip. */
  variant?: "button" | "icon";
  /** Icon variant: colour once copied. */
  copiedColor?: string;
  /** Icon variant: subtle ActionIcon style. */
  subtle?: boolean;
}

/** Copy-to-clipboard control that flips to a "Copied" state for a moment. */
export function CopyValueButton({
  value,
  variant = "button",
  copiedColor = "green",
  subtle,
}: Props) {
  const { t } = useTranslation();

  return (
    <CopyButton value={value} timeout={2000}>
      {({ copied, copy }) =>
        variant === "button" ? (
          <Button
            size="xs"
            variant="subtle"
            onClick={copy}
            leftSection={
              copied ? <IconCheck size={14} /> : <IconCopy size={14} />
            }
          >
            {copied ? t("Copied") : t("Copy")}
          </Button>
        ) : (
          <Tooltip label={copied ? t("Copied") : t("Copy")} withArrow>
            <ActionIcon
              aria-label={t("Copy")}
              color={copied ? copiedColor : "gray"}
              variant={subtle ? "subtle" : undefined}
              onClick={copy}
            >
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          </Tooltip>
        )
      }
    </CopyButton>
  );
}
