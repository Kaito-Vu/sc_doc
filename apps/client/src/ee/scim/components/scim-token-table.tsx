import { Group, Table, Text } from "@mantine/core";
import { CredentialRowMenu } from "@/ee/components/credential-row-menu";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import React from "react";
import NoTableResults from "@/components/common/no-table-results";
import { IScimToken } from "@/ee/scim/types/scim-token.types";
import { formatLocalized, useDateFnsLocale } from "@/lib/date-locale.ts";

interface ScimTokenTableProps {
  tokens: IScimToken[];
  isLoading?: boolean;
  onUpdate?: (token: IScimToken) => void;
  onRevoke?: (token: IScimToken) => void;
}

export function ScimTokenTable({
  tokens,
  isLoading,
  onUpdate,
  onRevoke,
}: ScimTokenTableProps) {
  const { t } = useTranslation();
  const locale = useDateFnsLocale();

  const formatDate = (date: Date | string | null) => {
    if (!date) return t("Never");
    return formatLocalized(date, "MMM dd, yyyy", "PP", locale);
  };

  return (
    <Table.ScrollContainer minWidth={500}>
      <Table highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("Name")}</Table.Th>
            <Table.Th>{t("Token")}</Table.Th>
            <Table.Th>{t("Created by")}</Table.Th>
            <Table.Th>{t("Last used")}</Table.Th>
            <Table.Th>{t("Created")}</Table.Th>
            <Table.Th aria-label={t("Action")} />
          </Table.Tr>
        </Table.Thead>

        <Table.Tbody>
          {tokens && tokens.length > 0 ? (
            tokens.map((token) => (
              <Table.Tr key={token.id}>
                <Table.Td>
                  <Text fz="sm" fw={500}>
                    {token.name}
                  </Text>
                </Table.Td>

                <Table.Td>
                  <Text fz="sm" ff="monospace" c="dimmed">
                    ••••{token.tokenLastFour}
                  </Text>
                </Table.Td>

                {token.creator ? (
                  <Table.Td>
                    <Group gap="4" wrap="nowrap">
                      <CustomAvatar
                        avatarUrl={token.creator?.avatarUrl}
                        name={token.creator.name}
                        size="sm"
                      />
                      <Text fz="sm" lineClamp={1}>
                        {token.creator.name}
                      </Text>
                    </Group>
                  </Table.Td>
                ) : (
                  <Table.Td>
                    <Text fz="sm" c="dimmed">
                      —
                    </Text>
                  </Table.Td>
                )}

                <Table.Td>
                  <Text fz="sm" style={{ whiteSpace: "nowrap" }}>
                    {formatDate(token.lastUsedAt)}
                  </Text>
                </Table.Td>

                <Table.Td>
                  <Text fz="sm" style={{ whiteSpace: "nowrap" }}>
                    {formatDate(token.createdAt)}
                  </Text>
                </Table.Td>

                <Table.Td>
                  <CredentialRowMenu
                    ariaLabel={t("Token actions")}
                    onRename={onUpdate && (() => onUpdate(token))}
                    onRevoke={onRevoke && (() => onRevoke(token))}
                  />
                </Table.Td>
              </Table.Tr>
            ))
          ) : (
            <NoTableResults colSpan={6} />
          )}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
