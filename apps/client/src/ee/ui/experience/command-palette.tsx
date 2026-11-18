import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Divider,
  Group,
  Kbd,
  Loader,
  Modal,
  ScrollArea,
  Text,
  TextInput,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue, useHotkeys } from "@mantine/hooks";
import {
  IconArrowRight,
  IconClipboardCheck,
  IconCommand,
  IconFileText,
  IconHome,
  IconLayoutGrid,
  IconLibrary,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconStar,
} from "@tabler/icons-react";
import { useAtom, useAtomValue } from "jotai";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUnifiedSearch } from "@/features/search/hooks/use-unified-search";
import type { IPageSearch } from "@/features/search/types/search.types";
import { useParams } from "react-router-dom";
import { useFavoriteIds } from "@/features/favorite/queries/favorite-query";
import { useSpaceSwitcherData } from "@/ee/ui/space-switcher/use-space-switcher-data";
import { parseSpacesMode, SPACES_MODE_PREFIX } from "./palette-spaces-mode";
import {
  buildActionItems,
  buildPageItems,
  buildRecentPageItems,
  buildSpaceItems,
  groupItems,
  PaletteIconKey,
  PaletteItem,
  PaletteNav,
} from "./palette-items";
import { buildPageUrl } from "@/features/page/page.utils";
import { getSpaceUrl } from "@/lib/config";
import { searchSpotlight } from "@/features/search/constants";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
import {
  commandPaletteInitialQueryAtom,
  commandPaletteOpenedAtom,
  quickCreateOpenedAtom,
  recentPagesListAtom,
} from "./atoms";
import { isModernUi, setModernUi } from "@/ee/modern-ui";

type CommandItem = Omit<PaletteItem, "icon"> & { icon: React.ReactNode };

const ICONS: Record<PaletteIconKey, React.ReactNode> = {
  plus: <IconPlus size={18} />,
  search: <IconSearch size={18} />,
  review: <IconClipboardCheck size={18} />,
  library: <IconLibrary size={18} />,
  home: <IconHome size={18} />,
  layout: <IconLayoutGrid size={18} />,
  star: <IconStar size={18} />,
  settings: <IconSettings size={18} />,
  sparkles: <IconSparkles size={18} />,
  file: <IconFileText size={18} />,
};

export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [opened, setOpened] = useAtom(commandPaletteOpenedAtom);
  const [, setQuickCreateOpened] = useAtom(quickCreateOpenedAtom);
  const recentPages = useAtomValue(recentPagesListAtom);
  const workspace = useAtomValue(workspaceAtom);
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query, 250);
  const [activeIndex, setActiveIndex] = useState(0);
  const [initialQuery, setInitialQuery] = useAtom(commandPaletteInitialQueryAtom);
  const { spaceSlug: currentSpaceSlug } = useParams();
  const favoriteIds = useFavoriteIds("space");
  const { spacesMode, term: spaceTerm } = parseSpacesMode(query);

  const aiChatEnabled = workspace?.settings?.ai?.chat === true;

  const spaceData = useSpaceSwitcherData(
    opened && (spacesMode || spaceTerm.length > 0) ? spaceTerm : "",
    opened && (spacesMode || spaceTerm.length > 0),
  );
  const { data: searchResults, isFetching } = useUnifiedSearch(
    { query: debouncedQuery, contentType: "page" },
    opened && !spacesMode && debouncedQuery.trim().length >= 2,
  );

  const close = () => {
    setOpened(false);
    setQuery("");
    setActiveIndex(0);
  };

  const run = (item: CommandItem) => {
    if (!item.keepOpen) close();
    item.run();
  };

  useHotkeys([["mod+Shift+K", () => setOpened((value) => !value)]]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, opened]);

  useEffect(() => {
    if (opened && initialQuery) {
      setQuery(initialQuery);
      setInitialQuery("");
    }
  }, [opened, initialQuery, setInitialQuery]);

  const nav = useMemo<PaletteNav>(
    () => ({
      to: (path) => navigate(path),
      space: (slug) => navigate(getSpaceUrl(slug)),
      page: (spaceSlug, slugId, title) =>
        navigate(buildPageUrl(spaceSlug, slugId, title)),
    }),
    [navigate],
  );

  const items = useMemo<CommandItem[]>(() => {
    const term = query.trim().toLocaleLowerCase();
    const common = { t, nav, spacesMode };

    return [
      ...buildActionItems({
        ...common,
        term,
        aiChatEnabled,
        modernUi: isModernUi(),
        newDocument: () => setQuickCreateOpened(true),
        openSearch: () => searchSpotlight.open(),
        toggleModernUi: () => {
          setModernUi(!isModernUi());
          window.location.reload();
        },
      }),
      ...buildPageItems({
        ...common,
        results: (searchResults ?? []) as IPageSearch[],
        enabled: !spacesMode && debouncedQuery.trim().length >= 2,
      }),
      ...buildSpaceItems({
        ...common,
        sections: spaceData.sections,
        hasNextPage: spaceData.hasNextPage,
        spaceTerm,
        currentSpaceSlug,
        favoriteIds,
        fetchNextPage: spaceData.fetchNextPage,
        showMoreSpaces: () => setQuery(`${SPACES_MODE_PREFIX}${spaceTerm}`),
      }),
      ...buildRecentPageItems({ ...common, recentPages, term }),
    ].map((item) => ({ ...item, icon: ICONS[item.icon] }));
  }, [
    aiChatEnabled,
    currentSpaceSlug,
    favoriteIds,
    nav,
    spaceData,
    spaceTerm,
    spacesMode,
    debouncedQuery,
    query,
    recentPages,
    searchResults,
    setQuickCreateOpened,
    t,
  ]);

  useEffect(() => {
    if (activeIndex > items.length - 1) {
      setActiveIndex(Math.max(0, items.length - 1));
    }
  }, [activeIndex, items.length]);

  useEffect(() => {
    if (!opened) return;
    document
      .querySelector('[data-command-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, opened]);

  const grouped = groupItems(items);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        items.length === 0 ? 0 : (index + 1) % items.length,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        items.length === 0 ? 0 : (index - 1 + items.length) % items.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[activeIndex];
      if (item) run(item);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      withCloseButton={false}
      size="lg"
      radius="md"
      padding={0}
      centered
      trapFocus
      returnFocus
      aria-label={t("Command palette")}
    >
      <TextInput
        data-autofocus
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("Search or run a command...")}
        aria-label={t("Search or run a command...")}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={opened}
        aria-controls={grouped.length > 0 ? "sc-command-listbox" : undefined}
        aria-activedescendant={
          items[activeIndex]
            ? `sc-command-option-${items[activeIndex].id}`
            : undefined
        }
        leftSection={<IconSearch size={18} />}
        rightSection={
          isFetching || spaceData.isPending ? (
            <Loader size="xs" />
          ) : (
            <Kbd size="xs">Esc</Kbd>
          )
        }
        variant="unstyled"
        size="lg"
        px="md"
        py="sm"
      />

      <Divider />

      <VisuallyHidden role="status" aria-live="polite">
        {spaceData.isPending
          ? t("Loading spaces")
          : items.length > 0
            ? t("{{count}} results", { count: items.length })
            : t("No results")}
      </VisuallyHidden>

      {spacesMode ? (
        <Group gap="xs" px="md" py={6}>
          <Badge size="sm" variant="filled">
            {t("Spaces")}
          </Badge>
          <Text size="xs" c="dimmed">
            {t("Searching spaces only")}
          </Text>
        </Group>
      ) : null}

      <ScrollArea.Autosize mah={420} type="scroll">
        {grouped.length === 0 ? (
          <Box p="xl">
            <Text size="sm" c="dimmed" ta="center">
              {t("No commands or documents found.")}
            </Text>
          </Box>
        ) : (
          <Box
            py="xs"
            id="sc-command-listbox"
            role="listbox"
            aria-label={t("Commands and documents")}
          >
            {grouped.map((group) => (
              <Box
                key={group.section}
                mb={4}
                role="group"
                aria-label={t(group.section)}
              >
                <Text
                  size="xs"
                  fw={700}
                  c="dimmed"
                  tt="uppercase"
                  px="md"
                  py={6}
                  aria-hidden="true"
                >
                  {t(group.section)}
                </Text>
                {group.items.map((item) => {
                  const index = items.findIndex(
                    (candidate) => candidate.id === item.id,
                  );
                  const isActive = index === activeIndex;
                  return (
                    <Box
                      key={item.id}
                      id={`sc-command-option-${item.id}`}
                      role="option"
                      aria-selected={isActive}
                      tabIndex={-1}
                      data-command-active={isActive || undefined}
                      onClick={() => run(item)}
                      onMouseEnter={() => setActiveIndex(index)}
                      w="100%"
                      px="md"
                      py={9}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        background: isActive
                          ? "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))"
                          : undefined,
                      }}
                    >
                      <Box c="dimmed" style={{ display: "flex" }}>
                        {item.icon}
                      </Box>
                      <Text size="sm" style={{ flex: 1 }} ta="left">
                        {item.label}
                      </Text>
                      {item.markers?.map((marker) => (
                        <Badge
                          key={marker}
                          size="xs"
                          variant="outline"
                          color="gray"
                        >
                          {marker}
                        </Badge>
                      ))}
                      {item.hint ? (
                        <Badge
                          size="xs"
                          variant="light"
                          color="gray"
                          tt="lowercase"
                        >
                          {item.hint}
                        </Badge>
                      ) : null}
                      <IconArrowRight size={14} opacity={0.45} />
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        )}
      </ScrollArea.Autosize>

      <Divider />

      <Group justify="space-between" px="md" py="xs" wrap="nowrap">
        <Group gap={6}>
          <IconCommand size={14} />
          <Text size="xs" c="dimmed">
            {t("Command palette")}
          </Text>
        </Group>
        <Group gap="md">
          <Group gap={4}>
            <Kbd size="xs">↑</Kbd>
            <Kbd size="xs">↓</Kbd>
            <Text size="xs" c="dimmed">
              {t("Navigate")}
            </Text>
          </Group>
          <Group gap={4}>
            <Kbd size="xs">↵</Kbd>
            <Text size="xs" c="dimmed">
              {t("Open")}
            </Text>
          </Group>
          <Group gap={4}>
            <Kbd size="xs">esc</Kbd>
            <Text size="xs" c="dimmed">
              {t("Close")}
            </Text>
          </Group>
        </Group>
      </Group>
    </Modal>
  );
}
