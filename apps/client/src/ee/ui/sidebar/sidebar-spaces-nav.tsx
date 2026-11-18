import { useMemo, useState } from "react";
import { ActionIcon, Tooltip, UnstyledButton } from "@mantine/core";
import { IconArrowRight, IconSearch } from "@tabler/icons-react";
import { useSetAtom } from "jotai";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSpaceSwitcherData } from "@/ee/ui/space-switcher/use-space-switcher-data";
import { SPACES_MODE_PREFIX } from "@/ee/ui/experience/palette-spaces-mode";
import {
  commandPaletteInitialQueryAtom,
  commandPaletteOpenedAtom,
} from "@/ee/ui/experience/atoms";
import { SidebarSection, SidebarSpaceRow } from "./sidebar-components";
import classes from "./global-sidebar-v2.module.css";

const MAX_FAVORITES = 8;
const MAX_RECENT = 5;

type Props = {
  isSpaceActive: (slug: string) => boolean;
  personalSpaceId?: string;
  onNavigate: () => void;
};

export function SidebarSpacesNav({
  isSpaceActive,
  personalSpaceId,
  onNavigate,
}: Props) {
  const { t } = useTranslation();
  const [showAllFavorites, setShowAllFavorites] = useState(false);
  const setPaletteOpened = useSetAtom(commandPaletteOpenedAtom);
  const setInitialQuery = useSetAtom(commandPaletteInitialQueryAtom);
  // Same data path as the switcher/palette: favorites/recent/known-ids logic lives in
  // buildSwitcherSections (space-switcher-data.ts).
  const { sections } = useSpaceSwitcherData("");

  const favorites = useMemo(
    () => [...sections.favorites].sort((a, b) => a.name.localeCompare(b.name)),
    [sections.favorites],
  );

  const recentSpaces = useMemo(
    () =>
      sections.recent.filter((s) => s.id !== personalSpaceId).slice(0, MAX_RECENT),
    [sections.recent, personalSpaceId],
  );

  const visibleFavorites = showAllFavorites
    ? favorites
    : favorites.slice(0, MAX_FAVORITES);

  const openFinder = () => {
    setInitialQuery(SPACES_MODE_PREFIX);
    setPaletteOpened(true);
  };

  const renderRows = (spaces: { id: string; name: string; slug: string; logo?: string | null }[]) => (
    <ul className={classes.spaceList}>
      {spaces.map((space) => (
        <li key={space.id}>
          <SidebarSpaceRow
            space={space}
            active={isSpaceActive(space.slug)}
            onClick={onNavigate}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <nav className={classes.spacesNav} aria-label={t("Spaces")}>
      <div className={classes.spacesHeader}>
        <span className={classes.spacesTitle} aria-hidden="true">
          {t("Spaces")}
        </span>
        <Tooltip label={t("Manage spaces")} withArrow>
          <ActionIcon
            component={Link}
            to="/spaces"
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={t("Manage spaces")}
            onClick={onNavigate}
          >
            <IconArrowRight size={14} />
          </ActionIcon>
        </Tooltip>
      </div>

      {favorites.length > 0 && (
        <SidebarSection title={t("Favorite spaces")} collapsible>
          {renderRows(visibleFavorites)}
          {favorites.length > MAX_FAVORITES && (
            <UnstyledButton
              className={classes.viewAll}
              aria-expanded={showAllFavorites}
              onClick={() => setShowAllFavorites((v) => !v)}
            >
              {showAllFavorites
                ? t("Show less")
                : t("Show more ({{count}})", {
                    count: favorites.length - MAX_FAVORITES,
                  })}
            </UnstyledButton>
          )}
        </SidebarSection>
      )}

      {recentSpaces.length > 0 && (
        <SidebarSection title={t("Recent spaces")} collapsible>
          {renderRows(recentSpaces)}
        </SidebarSection>
      )}

      <ul className={classes.spaceList}>
        <li>
          <UnstyledButton className={classes.viewAll} onClick={openFinder}>
            <IconSearch size={13} aria-hidden="true" />
            {t("Find any space…")}
          </UnstyledButton>
        </li>
      </ul>
    </nav>
  );
}
