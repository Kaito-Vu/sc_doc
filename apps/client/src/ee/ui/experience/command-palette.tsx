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
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { buildPageUrl } from "@/features/page/page.utils";
import { getSpaceUrl } from "@/lib/config";
import { searchSpotlight } from "@/features/search/constants";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
import {
  commandPaletteOpenedAtom,
  quickCreateOpenedAtom,
  recentPagesListAtom,
} from "./atoms";

type CommandItem = {
  id: string;
  label: string;
  section: string;
  icon: React.ReactNode;
  hint?: string;
  run: () => void;
};

const SECTION_ORDER = ["Actions", "Pages", "Spaces", "Recent"];

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

  const aiChatEnabled = workspace?.settings?.ai?.chat === true;

  const { data: spacesData } = useGetSpacesQuery({ limit: 100 });
  const { data: searchResults, isFetching } = useUnifiedSearch(
    { query: debouncedQuery, contentType: "page" },
    opened && debouncedQuery.trim().length >= 2,
  );

  const close = () => {
    setOpened(false);
    setQuery("");
    setActiveIndex(0);
  };

  const run = (action: () => void) => {
    close();
    action();
  };

  useHotkeys([["mod+Shift+K", () => setOpened((value) => !value)]]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, opened]);

  const items = useMemo<CommandItem[]>(() => {
    const term = query.trim().toLocaleLowerCase();

    const matches = (label: string) =>
      !term || label.toLocaleLowerCase().includes(term);

    const actions: CommandItem[] = [
      {
        id: "new-document",
        label: t("New document"),
        section: "Actions",
        icon: <IconPlus size={18} />,
        run: () => setQuickCreateOpened(true),
      },
      {
        id: "search",
        label: t("Search documents"),
        section: "Actions",
        icon: <IconSearch size={18} />,
        hint: "mod+K",
        run: () => searchSpotlight.open(),
      },
      {
        id: "reviews",
        label: t("Review queue"),
        section: "Actions",
        icon: <IconClipboardCheck size={18} />,
        run: () => navigate("/reviews"),
      },
      {
        id: "documents",
        label: t("Document library"),
        section: "Actions",
        icon: <IconLibrary size={18} />,
        run: () => navigate("/documents"),
      },
      {
        id: "home",
        label: t("Home"),
        section: "Actions",
        icon: <IconHome size={18} />,
        run: () => navigate("/home"),
      },
      {
        id: "spaces",
        label: t("Spaces"),
        section: "Actions",
        icon: <IconLayoutGrid size={18} />,
        run: () => navigate("/spaces"),
      },
      {
        id: "favorites",
        label: t("Favorites"),
        section: "Actions",
        icon: <IconStar size={18} />,
        run: () => navigate("/favorites"),
      },
      {
        id: "settings",
        label: t("Preferences"),
        section: "Actions",
        icon: <IconSettings size={18} />,
        run: () => navigate("/settings/account/preferences"),
      },
    ];

    if (aiChatEnabled) {
      actions.splice(2, 0, {
        id: "ask-ai",
        label: t("Ask AI"),
        section: "Actions",
        icon: <IconSparkles size={18} />,
        run: () => navigate("/ai"),
      });
    }

    const actionItems = actions.filter((item) => matches(item.label));

    const pageItems: CommandItem[] =
      debouncedQuery.trim().length >= 2
        ? ((searchResults ?? []) as IPageSearch[]).slice(0, 8).map((result) => ({
            id: `page-${result.id}`,
            label: result.title || t("Untitled"),
            section: "Pages",
            icon: <IconFileText size={18} />,
            hint: result.space?.name,
            run: () =>
              navigate(
                buildPageUrl(
                  result.space.slug,
                  result.slugId,
                  result.title,
                ),
              ),
          }))
        : [];

    const spaceItems: CommandItem[] = (spacesData?.items ?? [])
      .filter((space) => matches(space.name))
      .slice(0, 8)
      .map((space) => ({
        id: `space-${space.id}`,
        label: space.name,
        section: "Spaces",
        icon: <IconLayoutGrid size={18} />,
        run: () => navigate(getSpaceUrl(space.slug)),
      }));

    const recentItems: CommandItem[] = recentPages
      .filter((page) => matches(page.title || ""))
      .slice(0, 6)
      .map((page) => ({
        id: `recent-${page.pageId}`,
        label: page.title || t("Untitled"),
        section: "Recent",
        icon: <IconFileText size={18} />,
        hint: page.spaceName,
        run: () =>
          navigate(
            buildPageUrl(page.spaceSlug, page.slugId, page.title),
          ),
      }));

    return [...actionItems, ...pageItems, ...spaceItems, ...recentItems];
  }, [
    aiChatEnabled,
    debouncedQuery,
    navigate,
    query,
    recentPages,
    searchResults,
    setQuickCreateOpened,
    spacesData,
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

  const grouped = SECTION_ORDER.map((section) => ({
    section,
    items: items.filter((item) => item.section === section),
  })).filter((group) => group.items.length > 0);

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
      if (item) run(item.run);
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
        aria-controls="sc-command-listbox"
        aria-activedescendant={
          items[activeIndex]
            ? `sc-command-option-${items[activeIndex].id}`
            : undefined
        }
        leftSection={<IconSearch size={18} />}
        rightSection={
          isFetching ? <Loader size="xs" /> : <Kbd size="xs">Esc</Kbd>
        }
        variant="unstyled"
        size="lg"
        px="md"
        py="sm"
      />

      <Divider />

      <VisuallyHidden role="status" aria-live="polite">
        {items.length > 0
          ? t("{{count}} results", { count: items.length })
          : t("No results")}
      </VisuallyHidden>

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
                      onClick={() => run(item.run)}
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
