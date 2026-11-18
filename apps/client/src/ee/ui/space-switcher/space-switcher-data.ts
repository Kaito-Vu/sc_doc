// Pure helpers for the space switcher (kept free of React so they are unit-testable).
export const MAX_RECENT_SPACES = 8;

export type SwitcherSpace = {
  id: string;
  slug: string;
  name: string;
  logo?: string | null;
  isArchived?: boolean;
  isPublished?: boolean;
  isPersonal?: boolean;
};

export type RecentSpace = {
  id: string;
  slug: string;
  name: string;
  logo?: string | null;
  visitedAt: number;
};

export type SwitcherSections = {
  favorites: SwitcherSpace[];
  recent: SwitcherSpace[];
  all: SwitcherSpace[];
};

/** MRU insert: newest first, deduped by id, capped. */
export function pushRecentSpace(
  list: RecentSpace[],
  item: RecentSpace,
  max = MAX_RECENT_SPACES,
): RecentSpace[] {
  return [item, ...list.filter((s) => s.id !== item.id)].slice(0, max);
}

function dedupe(spaces: SwitcherSpace[]): SwitcherSpace[] {
  const seen = new Set<string>();
  return spaces.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

export function buildSwitcherSections(input: {
  favorites: SwitcherSpace[];
  recent: RecentSpace[];
  all: SwitcherSpace[];
  query: string;
  /** When the full list is known (no more pages, no query), recents not in it are dropped. */
  knownIds?: Set<string>;
}): SwitcherSections {
  const q = input.query.trim().toLowerCase();
  const searching = q.length > 0;
  const visible = (s: SwitcherSpace) => searching || !s.isArchived;
  const matches = (s: SwitcherSpace) =>
    !searching ||
    s.name.toLowerCase().includes(q) ||
    s.slug.toLowerCase().includes(q);

  const favorites = dedupe(input.favorites).filter(
    (s) => visible(s) && matches(s),
  );
  const favoriteIds = new Set(input.favorites.map((s) => s.id));

  const recent = dedupe(
    input.recent
      .filter((s) => !favoriteIds.has(s.id))
      .filter((s) => !input.knownIds || input.knownIds.has(s.id))
      .map((s) => ({ id: s.id, slug: s.slug, name: s.name, logo: s.logo })),
  )
    // Archived/public flags are not stored in recents: take them from the live list when present.
    .map((s) => input.all.find((a) => a.id === s.id) ?? s)
    .filter((s) => visible(s) && matches(s));

  const all = dedupe(input.all)
    .filter(visible)
    .sort((a, b) => Number(!!b.isPersonal) - Number(!!a.isPersonal)); // stable: personal first

  return { favorites, recent, all };
}
