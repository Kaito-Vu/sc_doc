import { Badge } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IUser } from "@/features/user/types/user.types.ts";

type UserWithAuthProvider = IUser & {
  authProvider?: { id: string; name: string; type: string } | null;
};

interface MemberProviderBadgeProps {
  user: IUser;
}

export function MemberProviderBadge({ user }: Readonly<MemberProviderBadgeProps>) {
  const { t } = useTranslation();
  const authProvider = (user as UserWithAuthProvider).authProvider;

  return (
    <Badge variant="light" color="gray">
      {authProvider?.name || t("Local")}
    </Badge>
  );
}
