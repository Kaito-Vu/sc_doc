import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Text } from "@mantine/core";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { AvatarIconType } from "@/features/attachments/types/attachment.types.ts";
import { SpaceFavoriteButton } from "./space-favorite-button";
import { SwitcherSpace } from "./space-switcher-data";
import classes from "./space-switcher.module.css";

export type SpaceOptionData = {
  key: string;
  section: "favorites" | "recent" | "all";
  space: SwitcherSpace;
};

type Props = {
  option: SpaceOptionData;
  domId: string;
  isCurrent: boolean;
  /** keyboard/mouse highlighted option (aria-selected) */
  isActive: boolean;
  pinned: boolean;
  onSelect: (option: SpaceOptionData) => void;
  onHighlight: (key: string) => void;
};

function Marker({ children }: { children: React.ReactNode }) {
  return (
    <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
      {children}
    </Badge>
  );
}

/**
 * Row = presentational wrapper holding the option and, as a SIBLING, the favorite star, so
 * no interactive content is nested inside role="option". Keyboard users pin via Shift+Enter.
 */
export const SpaceOption = memo(function SpaceOption({
  option: o,
  domId,
  isCurrent,
  isActive,
  pinned,
  onSelect,
  onHighlight,
}: Props) {
  const { t } = useTranslation();
  return (
    <div
      role="presentation"
      className={classes.option}
      data-active={isActive}
      onMouseEnter={() => onHighlight(o.key)}
    >
      <div
        id={domId}
        role="option"
        aria-selected={isActive}
        aria-current={isCurrent ? "true" : undefined}
        className={classes.optionMain}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSelect(o)}
      >
        <CustomAvatar
          name={o.space.name}
          avatarUrl={o.space.logo ?? undefined}
          type={AvatarIconType.SPACE_ICON}
          color="initials"
          variant="filled"
          size={20}
        />
        <Text className={classes.optionName} size="sm" lineClamp={1} title={o.space.name}>
          {o.space.name}
        </Text>
        {isCurrent && <Marker>{t("Current")}</Marker>}
        {o.space.isPersonal && <Marker>{t("Personal")}</Marker>}
        {o.space.isArchived && <Marker>{t("Archived")}</Marker>}
        {o.space.isPublished && <Marker>{t("Public")}</Marker>}
        {o.section !== "favorites" && pinned && <Marker>{t("Pinned")}</Marker>}
      </div>
      <SpaceFavoriteButton spaceId={o.space.id} tabIndex={-1} />
    </div>
  );
});
