// Pure item-building for the command palette (no React / router / icons) so it is unit-testable.
// The component supplies the side effects through `PaletteNav` and maps `icon` keys to elements.
import type { SwitcherSections, SwitcherSpace } from "@/ee/ui/space-switcher/space-switcher-data";
import type { RecentPage } from "./atoms";

export type PaletteIconKey =
  | "plus"
  | "search"
  | "review"
  | "library"
  | "home"
  | "layout"
  | "star"
  | "settings"
  | "sparkles"
  | "file";

export type PaletteItem = {
  id: string;
  label: string;
  section: string;
  icon: PaletteIconKey;
  hint?: string;
  markers?: string[];
  keepOpen?: boolean;
  run: () => void;
};

export type PaletteNav = {
  to: (path: string) => void;
  space: (slug: string) => void;
  page: (spaceSlug: string | undefined, slugId: string, title: string) => void;
};

export type Translate = (key: string) => string;

export const SECTION_ORDER = [
  "Actions",
  "Pages",
  "Recent spaces",
  "Favorite spaces",
  "Spaces",
  "Recent",
];
export const COLLAPSED_SPACES = 8;

export const matchesTerm = (label: string, term: string) =>
  !term || label.toLocaleLowerCase().includes(term);

export function buildActionItems(a: {
  t: Translate;
  nav: PaletteNav;
  term: string;
  spacesMode: boolean;
  aiChatEnabled: boolean;
  modernUi: boolean;
  newDocument: () => void;
  openSearch: () => void;
  toggleModernUi: () => void;
}): PaletteItem[] {
  if (a.spacesMode) return [];
  const { t, nav } = a;
  const act = (
    id: string,
    label: string,
    icon: PaletteIconKey,
    run: () => void,
    hint?: string,
  ): PaletteItem => ({ id, label, section: "Actions", icon, hint, run });

  const items: PaletteItem[] = [
    act("new-document", t("New document"), "plus", a.newDocument),
    act("search", t("Search documents"), "search", a.openSearch, "mod+K"),
    act("reviews", t("Review queue"), "review", () => nav.to("/reviews")),
    act("documents", t("Document library"), "library", () => nav.to("/documents")),
    act("home", t("Home"), "home", () => nav.to("/home")),
    act("spaces", t("Spaces"), "layout", () => nav.to("/spaces")),
    act("favorites", t("Favorites"), "star", () => nav.to("/favorites")),
    act("settings", t("Preferences"), "settings", () =>
      nav.to("/settings/account/preferences"),
    ),
    act(
      "toggle-modern-ui",
      a.modernUi ? t("Switch to classic UI") : t("Switch to modern UI"),
      "layout",
      a.toggleModernUi,
    ),
  ];
  if (a.aiChatEnabled) {
    items.splice(2, 0, act("ask-ai", t("Ask AI"), "sparkles", () => nav.to("/ai")));
  }
  return items.filter((item) => matchesTerm(item.label, a.term));
}

export type PageSearchResult = {
  id: string;
  title: string;
  slugId: string;
  space: { slug?: string; name?: string };
};

export function buildPageItems(a: {
  t: Translate;
  nav: PaletteNav;
  results: PageSearchResult[];
  enabled: boolean;
}): PaletteItem[] {
  if (!a.enabled) return [];
  return a.results.slice(0, 8).map((r) => ({
    id: `page-${r.id}`,
    label: r.title || a.t("Untitled"),
    section: "Pages",
    icon: "file",
    hint: r.space?.name,
    run: () => a.nav.page(r.space.slug, r.slugId, r.title),
  }));
}

export function buildSpaceItems(a: {
  t: Translate;
  nav: PaletteNav;
  sections: SwitcherSections;
  hasNextPage: boolean;
  spacesMode: boolean;
  spaceTerm: string;
  currentSpaceSlug?: string;
  favoriteIds: Set<string>;
  fetchNextPage: () => void;
  /** non-spaces-mode "Show more": switch the palette into spaces mode with the current term */
  showMoreSpaces: () => void;
}): PaletteItem[] {
  const { t, sections: sp } = a;
  const seen = new Set<string>();
  const toItem = (space: SwitcherSpace, section: string): PaletteItem[] => {
    if (seen.has(space.id)) return [];
    seen.add(space.id);
    return [
      {
        id: `space-${section}-${space.id}`,
        label: space.name,
        section,
        icon: "layout",
        markers: [
          space.slug === a.currentSpaceSlug ? t("Current") : "",
          a.favoriteIds.has(space.id) ? t("Pinned") : "",
          space.isPersonal ? t("Personal") : "",
          space.isArchived ? t("Archived") : "",
        ].filter(Boolean),
        run: () => a.nav.space(space.slug),
      },
    ];
  };
  const showMore = (run: () => void): PaletteItem => ({
    id: "spaces-more",
    label: t("Show more spaces"),
    section: "Spaces",
    icon: "plus",
    keepOpen: true,
    run,
  });

  if (a.spacesMode) {
    const items = [
      ...sp.recent.flatMap((s) => toItem(s, "Recent spaces")),
      ...sp.favorites.flatMap((s) => toItem(s, "Favorite spaces")),
      ...sp.all.flatMap((s) => toItem(s, "Spaces")),
    ];
    if (a.hasNextPage) items.push(showMore(a.fetchNextPage));
    return items;
  }
  if (a.spaceTerm) {
    const all = sp.all.flatMap((s) => toItem(s, "Spaces"));
    const items = all.slice(0, COLLAPSED_SPACES);
    if (all.length > COLLAPSED_SPACES || a.hasNextPage) {
      items.push(showMore(a.showMoreSpaces));
    }
    return items;
  }
  return [];
}

export function buildRecentPageItems(a: {
  t: Translate;
  nav: PaletteNav;
  recentPages: RecentPage[];
  term: string;
  spacesMode: boolean;
}): PaletteItem[] {
  if (a.spacesMode) return [];
  return a.recentPages
    .filter((p) => matchesTerm(p.title || "", a.term))
    .slice(0, 6)
    .map((p) => ({
      id: `recent-${p.pageId}`,
      label: p.title || a.t("Untitled"),
      section: "Recent",
      icon: "file",
      hint: p.spaceName,
      run: () => a.nav.page(p.spaceSlug, p.slugId, p.title),
    }));
}

export function groupItems<T extends { section: string }>(items: T[]) {
  return SECTION_ORDER.map((section) => ({
    section,
    items: items.filter((item) => item.section === section),
  })).filter((g) => g.items.length > 0);
}
