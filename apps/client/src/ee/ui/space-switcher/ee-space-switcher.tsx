import { useCallback, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge, Button, Popover, Text, TextInput } from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp, IconWorld } from "@tabler/icons-react";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { AvatarIconType } from "@/features/attachments/types/attachment.types.ts";
import { getSpaceUrl } from "@/lib/config";
import { useSpaceSwitcherData } from "./use-space-switcher-data";
import { useToggleSpaceFavorite } from "./space-favorite-button";
import { SpaceOption, SpaceOptionData } from "./space-option";
import { useListboxNav } from "./use-listbox-nav";
import classes from "./space-switcher.module.css";

interface Props {
  spaceId?: string;
  spaceName: string;
  spaceSlug: string;
  spaceIcon?: string | null;
  isPublished?: boolean;
  isArchived?: boolean;
}

type Section = SpaceOptionData["section"];

/**
 * Trigger button (aria-haspopup="dialog") opens a popover holding a combobox: the search input
 * is the combobox, the list is its listbox. Focus stays in the input (aria-activedescendant).
 * Up/Down/Home/End move, Enter opens, Shift+Enter pins/unpins the highlighted space
 * (the per-row star is mouse/touch only, tabIndex -1, outside the option), Esc closes, Tab leaves.
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
  const focusInput = useCallback((el: HTMLInputElement | null) => el?.focus(), []);

  const { sections, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useSpaceSwitcherData(opened ? query : "", opened);
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
          options: sections[section].map<SpaceOptionData>((space) => ({
            key: `${section}:${space.id}`,
            section,
            space,
          })),
        }))
        .filter((g) => g.options.length > 0),
    [sections, t],
  );
  const options = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const optionDomId = useCallback((o: SpaceOptionData) => `${uid}-${o.key}`, [uid]);

  const { active, setActiveKey, reset, onKeyDown } = useListboxNav({
    options,
    getDomId: optionDomId,
    onEnter: (o, e) => (e.shiftKey ? toggle(o.space.id) : select(o)),
  });

  const close = useCallback(() => {
    setOpened(false);
    setQuery("");
    reset();
  }, [reset]);
  const select = useCallback(
    (o: SpaceOptionData) => {
      navigate(getSpaceUrl(o.space.slug));
      close();
    },
    [navigate, close],
  );

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
          aria-haspopup="dialog"
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
      <Popover.Dropdown p="xs" role="dialog" aria-label={t("Switch space")}>
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
        <div className={classes.scroll} onScroll={onScroll}>
          <div id={listId} role="listbox" aria-label={t("Switch space")}>
            {groups.map((g) => (
              <div key={g.section} role="group" aria-label={g.label}>
                <div className={classes.groupLabel} aria-hidden="true">
                  {g.label}
                </div>
                {g.options.map((o) => (
                  <SpaceOption
                    key={o.key}
                    option={o}
                    domId={optionDomId(o)}
                    isCurrent={o.space.id === spaceId || o.space.slug === spaceSlug}
                    isActive={o === active}
                    pinned={favoriteIds.has(o.space.id)}
                    onSelect={select}
                    onHighlight={setActiveKey}
                  />
                ))}
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
