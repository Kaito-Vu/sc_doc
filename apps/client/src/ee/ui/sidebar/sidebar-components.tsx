import React, { memo, useId, useState } from "react";
import clsx from "clsx";
import {
  Collapse,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { useReducedMotion } from "@mantine/hooks";
import { Link } from "react-router-dom";
import { SpaceFavoriteButton } from "@/ee/ui/space-switcher/space-favorite-button";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { AvatarIconType } from "@/features/attachments/types/attachment.types";
import { getSpaceUrl } from "@/lib/config";
import classes from "./sidebar-components.module.css";

type SidebarNavItemProps = {
  icon: React.ElementType;
  label: string;
  to?: string;
  onClick?: () => void;
  active?: boolean;
  badge?: number | string;
  hint?: string;
  disabled?: boolean;
  disabledReason?: string;
  onNavigate?: () => void;
};

export function SidebarNavItem({
  icon: Icon,
  label,
  to,
  onClick,
  active,
  badge,
  hint,
  disabled,
  disabledReason,
  onNavigate,
}: SidebarNavItemProps) {
  const content = (
    <>
      <span className={classes.icon}>
        <Icon size={17} stroke={1.8} />
      </span>
      <span className={classes.label}>{label}</span>
      {hint ? <span className={classes.hint}>{hint}</span> : null}
      {badge !== undefined && badge !== 0 ? (
        <span className={classes.badge}>{badge}</span>
      ) : null}
    </>
  );

  const reasonId = useId();
  const hasReason = !!(disabled && disabledReason);
  const shared = {
    className: clsx(classes.item),
    "data-active": active || undefined,
    "data-disabled": disabled || undefined,
    "aria-current": active ? ("page" as const) : undefined,
    "aria-disabled": disabled || undefined,
    "aria-describedby": hasReason ? reasonId : undefined,
  };

  const item =
    to && !disabled ? (
      <Link {...shared} to={to} onClick={onNavigate}>
        {content}
      </Link>
    ) : (
      <UnstyledButton
        {...shared}
        onClick={disabled ? (e: React.MouseEvent) => e.preventDefault() : onClick}
      >
        {content}
      </UnstyledButton>
    );

  if (hasReason) {
    return (
      <Tooltip label={disabledReason} position="right" withArrow>
        <span style={{ display: "block" }}>
          {item}
          <span id={reasonId} className={classes.srOnly}>
            {disabledReason}
          </span>
        </span>
      </Tooltip>
    );
  }

  return item;
}

type SidebarSectionProps = {
  title: string;
  action?: React.ReactNode;
  collapsible?: boolean;
  defaultOpened?: boolean;
  children: React.ReactNode;
};

export function SidebarSection({
  title,
  action,
  collapsible,
  defaultOpened = true,
  children,
}: SidebarSectionProps) {
  const [opened, setOpened] = useState(defaultOpened);
  const contentId = useId();
  const reduceMotion = useReducedMotion();

  return (
    <div className={classes.section}>
      <div className={classes.sectionHeader}>
        <h3 className={classes.sectionHeading}>
          {collapsible ? (
            <UnstyledButton
              className={classes.sectionTitleButton}
              onClick={() => setOpened((value) => !value)}
              aria-expanded={opened}
              aria-controls={contentId}
            >
              <span>{title}</span>
              <IconChevronDown
                size={13}
                aria-hidden="true"
                className={classes.chevron}
                data-opened={opened || undefined}
              />
            </UnstyledButton>
          ) : (
            <span className={classes.sectionTitleButton}>{title}</span>
          )}
        </h3>
        {action ? <div className={classes.sectionAction}>{action}</div> : null}
      </div>

      {collapsible ? (
        <Collapse
          id={contentId}
          expanded={opened}
          transitionDuration={reduceMotion ? 0 : 160}
        >
          {children}
        </Collapse>
      ) : (
        children
      )}
    </div>
  );
}

type SidebarSpaceRowProps = {
  space: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
  };
  active?: boolean;
  meta?: string;
  onClick?: () => void;
};

// memo: rendered per space in long lists; callers pass a boolean `active` and a stable onClick.
export const SidebarSpaceRow = memo(function SidebarSpaceRow({
  space,
  active,
  meta,
  onClick,
}: SidebarSpaceRowProps) {
  return (
    <div className={classes.spaceRowWrap} data-active={active || undefined}>
      <Link
        className={classes.spaceRow}
        data-active={active || undefined}
        aria-current={active ? "page" : undefined}
        to={getSpaceUrl(space.slug)}
        title={space.name}
        onClick={onClick}
      >
        <CustomAvatar
          name={space.name}
          avatarUrl={space.logo}
          type={AvatarIconType.SPACE_ICON}
          color="initials"
          variant="filled"
          size={20}
        />
        <span className={classes.spaceName}>{space.name}</span>
        {meta ? <span className={classes.spaceMeta}>{meta}</span> : null}
      </Link>
      <span className={classes.spaceFav}>
        <SpaceFavoriteButton spaceId={space.id} />
      </span>
    </div>
  );
});

export function SidebarEmpty({ children }: { children: React.ReactNode }) {
  return <div className={classes.empty}>{children}</div>;
}
