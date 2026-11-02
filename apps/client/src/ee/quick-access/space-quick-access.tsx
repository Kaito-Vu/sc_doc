import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ScrollArea, Text, UnstyledButton } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { useFavoritesQuery } from "@/features/favorite/queries/favorite-query";
import { useRecentChangesQuery } from "@/features/page/queries/page-query";
import { buildPageUrl, getPageTitle } from "@/features/page/page.utils";
import { PageListIcon } from "@/components/common/page-list-icon";
import classes from "./space-quick-access.module.css";

const LIMIT = 5;
const storageKey = (id: string) => `sc-qa-${id}`;

type Item = {
  id: string;
  slugId: string;
  title: string;
  icon: string | null;
  isBase: boolean;
};

function Section({
  id,
  label,
  items,
  spaceSlug,
}: {
  id: string;
  label: string;
  items: Item[];
  spaceSlug: string | undefined;
}) {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storageKey(id)) !== "closed";
    } catch {
      return true;
    }
  });

  if (items.length === 0) return null;

  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(storageKey(id), open ? "closed" : "open");
    } catch {
      /* preference is session-only */
    }
  };

  return (
    <div>
      <UnstyledButton
        className={classes.heading}
        onClick={toggle}
        aria-expanded={open}
      >
        <IconChevronRight
          size={12}
          className={clsx(classes.chevron, open && classes.chevronOpen)}
        />
        <Text size="xs" fw={500} c="dimmed">
          {label}
        </Text>
      </UnstyledButton>
      {open &&
        items.map((p) => {
          const url = buildPageUrl(spaceSlug, p.slugId, p.title);
          return (
            <UnstyledButton
              key={p.id}
              component={Link}
              to={url}
              className={clsx(
                classes.row,
                pageSlug && decodeURIComponent(pageSlug).includes(p.slugId) && classes.active,
              )}
            >
              <span className={classes.icon}>
                <PageListIcon icon={p.icon} isBase={p.isBase} />
              </span>
              <span className={classes.title}>
                {getPageTitle(p.title, p.isBase, t)}
              </span>
            </UnstyledButton>
          );
        })}
    </div>
  );
}

/** Favorites + recently changed pages for the current space, above the tree. */
export function SpaceQuickAccess({
  spaceId,
  spaceSlug,
}: {
  spaceId: string;
  spaceSlug: string | undefined;
}) {
  const { t } = useTranslation();
  const favorites = useFavoritesQuery("page", spaceId);
  const recent = useRecentChangesQuery(spaceId);

  const favItems: Item[] = (favorites.data?.pages[0]?.items ?? [])
    .flatMap((f) => (f.page ? [f.page] : []))
    .slice(0, LIMIT)
    .map((p) => ({ ...p, icon: p.icon ?? null }));
  const recentItems: Item[] = (recent.data?.pages[0]?.items ?? [])
    .slice(0, LIMIT)
    .map((p) => ({ ...p, icon: p.icon ?? null }));

  if (favItems.length === 0 && recentItems.length === 0) return null;

  return (
    <ScrollArea.Autosize mah={220} scrollbarSize={5} className={classes.root}>
      <Section id="fav" label={t("Favorites")} items={favItems} spaceSlug={spaceSlug} />
      <Section id="recent" label={t("Recent")} items={recentItems} spaceSlug={spaceSlug} />
    </ScrollArea.Autosize>
  );
}
