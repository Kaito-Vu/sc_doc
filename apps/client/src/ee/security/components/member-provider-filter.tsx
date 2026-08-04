import { Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useMemberAuthProvidersQuery } from "@/ee/security/queries/security-query.ts";

interface MemberProviderFilterProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function MemberProviderFilter({
  value,
  onChange,
}: Readonly<MemberProviderFilterProps>) {
  const { t } = useTranslation();
  const { data: providers } = useMemberAuthProvidersQuery();

  const options = [
    { value: "local", label: t("Local") },
    ...(providers ?? []).map((provider) => ({
      value: provider.id,
      label: provider.name,
    })),
  ];

  return (
    <Select
      placeholder={t("Filter by provider")}
      data={options}
      value={value}
      onChange={onChange}
      clearable
      w={220}
    />
  );
}
