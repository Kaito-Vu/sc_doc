import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useUserProfileExtrasQuery } from "./user-profile-extras.api";

// job title / department / employee ID rows, shared by the hover card and the profile page
export function UserCardExtras({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { data } = useUserProfileExtrasQuery(userId);
  if (!data) return null;

  const rows = [
    [t("Job title"), data.jobTitle],
    [t("Department"), data.department],
    [t("Employee ID"), data.employeeId],
  ].filter(([, value]) => !!value);
  if (!rows.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map(([label, value]) => (
        <Text key={label} fz="sm" style={{ overflowWrap: "anywhere" }}>
          <Text span c="dimmed">
            {label}:{" "}
          </Text>
          {value}
        </Text>
      ))}
    </div>
  );
}
