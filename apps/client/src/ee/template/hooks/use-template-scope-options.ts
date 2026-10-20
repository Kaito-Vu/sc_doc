import { useTranslation } from "react-i18next";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import useUserRole from "@/hooks/use-user-role";

export function useTemplateScopeOptions() {
  const { t } = useTranslation();
  const { isAdmin: isWorkspaceAdmin } = useUserRole();
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });

  return [
    ...(isWorkspaceAdmin
      ? [
          { group: t("Workspace"), items: [{ value: "", label: t("Global") }] },
        ]
      : []),
    ...(spaces?.items?.length
      ? [
          {
            group: t("Spaces"),
            items: spaces.items.map((s) => ({ value: s.id, label: s.name })),
          },
        ]
      : []),
  ];
}
