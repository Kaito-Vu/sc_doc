import { ActionIcon } from "@mantine/core";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  useAddFavoriteMutation,
  useFavoriteIds,
  useRemoveFavoriteMutation,
} from "@/features/favorite/queries/favorite-query";

export function useToggleSpaceFavorite() {
  const favoriteIds = useFavoriteIds("space");
  const add = useAddFavoriteMutation();
  const remove = useRemoveFavoriteMutation();
  return {
    favoriteIds,
    toggle: (spaceId: string) =>
      (favoriteIds.has(spaceId) ? remove : add).mutate({
        type: "space",
        spaceId,
      }),
  };
}

type Props = { spaceId: string; tabIndex?: number };

export function SpaceFavoriteButton({ spaceId, tabIndex }: Props) {
  const { t } = useTranslation();
  const { favoriteIds, toggle } = useToggleSpaceFavorite();
  const active = favoriteIds.has(spaceId);
  const label = active ? t("Remove from favorites") : t("Add to favorites");

  return (
    <ActionIcon
      variant="subtle"
      color={active ? "yellow" : "gray"}
      size={26}
      tabIndex={tabIndex}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={(e) => e.preventDefault()} // keep focus where it is (search box)
      onClick={(e) => {
        e.stopPropagation();
        toggle(spaceId);
      }}
    >
      {active ? <IconStarFilled size={16} /> : <IconStar size={16} />}
    </ActionIcon>
  );
}
