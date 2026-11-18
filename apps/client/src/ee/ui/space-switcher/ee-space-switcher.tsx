import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge, Button, Popover, Text, TextInput } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp, IconWorld } from "@tabler/icons-react";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { AvatarIconType } from "@/features/attachments/types/attachment.types.ts";
import { getSpaceUrl } from "@/lib/config";
import { useSpaceSwitcherData } from "./use-space-switcher-data";
import { SpaceFavoriteButton, useToggleSpaceFavorite } from "./space-favorite-button";
import { SwitcherSpace } from "./space-switcher-data";
import classes from "./space-switcher.module.css";

interface Props {
  spaceId?: string;
  spaceName: string;
  spaceSlug: string;
  spaceIcon?: string | null;
  isPublished?: boolean;
  isArchived?: boolean;
}

type Section = "favorites" | "recent" | "all";
type Option = { key: string; section: Section; space: SwitcherSpace };

/**
 * Keyboard model: focus stays in the search box (aria-activedescendant).
 * Up/Down/Home/End move, Enter opens, Shift+Enter pins/unpins the highlighted space
 * (the per-row star is mouse/touch only, tabIndex -1), Esc closes, Tab leaves.
 */
export function EeSpaceSwitcher({
  spaceId,
  spaceName,
  spaceSlug,
  spaceIcon,
  isPublished,
  isArchived,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const uid = useId();
  const listId = `${uid}-list`;
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusInput = useCallback((el: HTMLInputElement | null) => el?.focus(), []);

  const { sections, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useSpaceSwitcherData(opened ? query : "");
  const { favoriteIds, toggle } = useToggleSpaceFavorite();

  const groups = useMemo(
    () =>
      (
        [
          ["favorites", t("Favorites")],
          ["recent", t("Recent")],
          ["all", t("All spaces")],
        ] as [Section, string][]
      )
        .map(([section, label]) => ({
          section,
          label,
          options: sections[section].map<Option>((space) => ({
            key: `${section}:${space.id}`,
            section,
            space,
          })),
        }))
        .filter((g) => g.options.length > 0),
    [sections, t],
  );
  const options = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const active = options.find((o) => o.key === activeKey) ?? options[0];
  const optionDomId = (o: Option) => `${uid}-${o.key}`;

  const close = () => {
    setOpened(false);
    setQuery("");
    setActiveKey(null);
  };
  const select = (o: Option) => {
    navigate(getSpaceUrl(o.space.slug));
    close();
  };

  useEffect(() => {
    if (!active) return;
    document
      .getElementById(optionDomId(active))
      ?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.key]);

  const move = (to: number) => {
    if (options.length) {
      setActiveKey(options[Math.max(0, Math.min(options.length - 1, to))].key);
    }
  };
  const activeIndex = active ? options.indexOf(active) : -1;

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        return move(activeIndex + 1);
      case "ArrowUp":
        e.preventDefault();
        return move(activeIndex - 1);
      case "Home":
        e.preventDefault();
        return move(0);
      case "End":
        e.preventDefault();
        return move(options.length - 1);
      case "Enter":
        e.preventDefault();
        if (!active) return;
        return e.shiftKey ? toggle(active.space.id) : select(active);
    }
  };

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      el.scrollHeight - el.scrollTop - el.clientHeight < 48
    ) {
      fetchNextPage();
    }
  };

  const liveMessage = !opened
    ? ""
    : isPending
      ? t("Loading spaces")
      : options.length === 0
        ? t("No spaces found")
        : t("{{n}} spaces found", { n: options.length });

  return (
    <Popover
      width={320}
      position="bottom"
      withArrow
      shadow="md"
      opened={opened}
      onChange={(o) => (o ? setOpened(true) : close())}
      returnFocus
      withRoles={false}
      transitionProps={{ duration: reducedMotion ? 0 : 150 }}
    >
      <Popover.Target>
        <Button
          variant="subtle"
          fullWidth
          justify="space-between"
          color="gray"
          aria-label={`${t("Switch space")}: ${spaceName}`}
          aria-haspopup="listbox"
          aria-expanded={opened}
          rightSection={opened ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
          onClick={() => (opened ? close() : setOpened(true))}
        >
          <CustomAvatar
            name={spaceName}
            avatarUrl={spaceIcon ?? undefined}
            type={AvatarIconType.SPACE_ICON}
            color="initials"
            variant="filled"
            size={20}
          />
          <Text className={classes.spaceName} size="md" fw={500} lineClamp={1} title={spaceName}>
            {spaceName}
          </Text>
          {isArchived && (
            <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
              {t("Archived")}
            </Badge>
          )}
          {isPublished && (
            <IconWorld
              size={14}
              role="img"
              aria-label={t("This space is public")}
              style={{ flexShrink: 0 }}
            />
          )}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <TextInput
          ref={focusInput}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder={t("Search spaces")}
          aria-label={t("Search spaces")}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active ? optionDomId(active) : undefined}
          aria-describedby={`${uid}-hint`}
          autoComplete="off"
        />
        <span id={`${uid}-hint`} className={classes.srOnly}>
          {t("Press Shift+Enter to pin or unpin the highlighted space")}
        </span>
        <div aria-live="polite" role="status" className={classes.srOnly}>
          {liveMessage}
        </div>
        <div ref={scrollRef} className={classes.scroll} onScroll={onScroll}>
          <div id={listId} role="listbox" aria-label={t("Switch space")}>
            {groups.map((g) => (
              <div key={g.section} role="group" aria-label={g.label}>
                <div className={classes.groupLabel} aria-hidden="true">
                  {g.label}
                </div>
                {g.options.map((o) => {
                  const isCurrent = o.space.id === spaceId || o.space.slug === spaceSlug;
                  return (
                    <div
                      key={o.key}
                      id={optionDomId(o)}
                      role="option"
                      aria-selected={isCurrent}
                      data-active={o === active}
                      className={classes.option}
                      onMouseEnter={() => setActiveKey(o.key)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => select(o)}
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
                      {o.section !== "favorites" && favoriteIds.has(o.space.id) && (
                        <Marker>{t("Pinned")}</Marker>
                      )}
                      <SpaceFavoriteButton spaceId={o.space.id} tabIndex={-1} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {!isPending && options.length === 0 && (
            <Text size="sm" c="dimmed" p="xs">
              {t("No spaces found")}
            </Text>
          )}
          {hasNextPage && (
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              fullWidth
              loading={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            >
              {t("Load more")}
            </Button>
          )}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

function Marker({ children }: { children: React.ReactNode }) {
  return (
    <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
      {children}
    </Badge>
  );
}
