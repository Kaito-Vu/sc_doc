import React, { useId, useState } from "react";
import clsx from "clsx";
import {
  Collapse,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { Link } from "react-router-dom";
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

  const className = clsx(classes.item);
  const shared = {
    className,
    "data-active": active || undefined,
    "data-disabled": disabled || undefined,
    "aria-current": active ? ("page" as const) : undefined,
    "aria-disabled": disabled || undefined,
  };

  const item =
    to && !disabled ? (
      <Link {...shared} to={to} onClick={onNavigate}>
        {content}
      </Link>
    ) : (
      <UnstyledButton
        {...shared}
        onClick={disabled ? undefined : onClick}
        tabIndex={disabled ? -1 : undefined}
      >
        {content}
      </UnstyledButton>
    );

  if (disabled && disabledReason) {
    return (
      <Tooltip label={disabledReason} position="right" withArrow>
        <span style={{ display: "block" }}>{item}</span>
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

  return (
    <section className={classes.section} aria-label={title}>
      <div className={classes.sectionHeader}>
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
              style={{
                transform: opened ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 160ms ease",
              }}
            />
          </UnstyledButton>
        ) : (
          <span className={classes.sectionTitleButton}>{title}</span>
        )}
        {action ? <div className={classes.sectionAction}>{action}</div> : null}
      </div>

      {collapsible ? (
        <Collapse
          id={contentId}
          expanded={opened}
          transitionDuration={160}
        >
          {children}
        </Collapse>
      ) : (
        children
      )}
    </section>
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

export function SidebarSpaceRow({
  space,
  active,
  meta,
  onClick,
}: SidebarSpaceRowProps) {
  return (
    <Link
      className={classes.spaceRow}
      data-active={active || undefined}
      aria-current={active ? "page" : undefined}
      to={getSpaceUrl(space.slug)}
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
  );
}

export function SidebarEmpty({ children }: { children: React.ReactNode }) {
  return <div className={classes.empty}>{children}</div>;
}
