import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAtom } from "jotai";
import { useMantineColorScheme } from "@mantine/core";
import { createSpotlight, Spotlight, SpotlightActionData } from "@mantine/spotlight";
import { useHotkeys } from "@mantine/hooks";
import {
  IconHome,
  IconLayoutSidebar,
  IconListDetails,
  IconMessage,
  IconMoon,
  IconSearch,
  IconSparkles,
  IconSettings,
  IconBuildingCommunity,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import APP_ROUTE from "@/lib/app-route";
import { searchSpotlight } from "@/features/search/constants";
import useToggleAside from "@/hooks/use-toggle-aside";
import { desktopSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import { isModernUi, setModernUi } from "@/ee/modern-ui";

const [commandStore, commandPalette] = createSpotlight();

/** Mod+Shift+P: jump anywhere / toggle UI. Mod+K stays page search. */
export function CommandPalette() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toggleAside = useToggleAside();
  const { toggleColorScheme } = useMantineColorScheme();
  const [sidebarOpen, setSidebarOpen] = useAtom(desktopSidebarAtom);
  const onPage = useLocation().pathname.includes("/p/");

  useHotkeys([["mod+shift+P", () => commandPalette.toggle()]], []);

  const actions = useMemo<SpotlightActionData[]>(() => {
    const list: SpotlightActionData[] = [
      {
        id: "home",
        label: t("Home"),
        leftSection: <IconHome size={18} />,
        onClick: () => navigate(APP_ROUTE.HOME),
      },
      {
        id: "spaces",
        label: t("Spaces"),
        leftSection: <IconBuildingCommunity size={18} />,
        onClick: () => navigate(APP_ROUTE.SPACES),
      },
      {
        id: "search",
        label: t("Search"),
        leftSection: <IconSearch size={18} />,
        onClick: () => searchSpotlight.open(),
      },
      {
        id: "ai",
        label: t("AI Chat"),
        leftSection: <IconSparkles size={18} />,
        onClick: () => navigate("/ai"),
      },
      {
        id: "settings",
        label: t("Settings"),
        leftSection: <IconSettings size={18} />,
        onClick: () => navigate("/settings/account/profile"),
      },
      {
        id: "sidebar",
        label: t("Sidebar toggle"),
        leftSection: <IconLayoutSidebar size={18} />,
        onClick: () => setSidebarOpen(!sidebarOpen),
      },
      {
        id: "theme",
        label: t("Toggle color scheme"),
        leftSection: <IconMoon size={18} />,
        onClick: () => toggleColorScheme(),
      },
      {
        id: "classic-ui",
        label: isModernUi() ? t("Switch to classic UI") : t("Switch to modern UI"),
        leftSection: <IconLayoutSidebar size={18} />,
        onClick: () => {
          setModernUi(!isModernUi());
          window.location.reload(); // header/strip visibility depends on the skin
        },
      },
    ];
    if (onPage) {
      list.push(
        {
          id: "comments",
          label: t("Comments"),
          leftSection: <IconMessage size={18} />,
          onClick: () => toggleAside("comments"),
        },
        {
          id: "toc",
          label: t("Table of contents"),
          leftSection: <IconListDetails size={18} />,
          onClick: () => toggleAside("toc"),
        },
      );
    }
    return list;
    // toggleAside is recreated each render; actions only depend on route state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, navigate, onPage, sidebarOpen]);

  return (
    <Spotlight
      store={commandStore}
      actions={actions}
      shortcut={null}
      highlightQuery
      searchProps={{ placeholder: t("Type a command…") }}
      nothingFound={t("Nothing found")}
    />
  );
}
