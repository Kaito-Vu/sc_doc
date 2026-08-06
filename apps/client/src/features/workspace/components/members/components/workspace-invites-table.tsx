import { Group, Table, Avatar, Text, Alert, Paper } from "@mantine/core";
import { useWorkspaceInvitationsQuery } from "@/features/workspace/queries/workspace-query.ts";
import React from "react";
import { getUserRoleLabel } from "@/features/workspace/types/user-role-data.ts";
import InviteActionMenu from "@/features/workspace/components/members/components/invite-action-menu.tsx";
import { IconInfoCircle } from "@tabler/icons-react";
import { timeAgo } from "@/lib/time.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useTranslation } from "react-i18next";
import Paginate from "@/components/common/paginate.tsx";
import { useCursorPaginate } from "@/hooks/use-cursor-paginate";

export default function WorkspaceInvitesTable() {
  const { t } = useTranslation();
  const { cursor, goNext, goPrev } = useCursorPaginate();
  const { data, isLoading } = useWorkspaceInvitationsQuery({
    cursor,
    limit: 100,
  });
  const { isAdmin } = useUserRole();

  return (
    <>
      <Alert variant="light" color="blue" icon={<IconInfoCircle />}>
        {t(
          "Invited members who are yet to accept their invitation will appear here.",
        )}
      </Alert>

      <Paper withBorder radius="md" mt="md">
        <Table.ScrollContainer minWidth={600}>
          <Table verticalSpacing="md" horizontalSpacing="lg">
            <Table.Thead>
              <Table.Tr>
                <Table.Th c="dimmed" fz="xs" tt="uppercase" fw={600}>
                  {t("Email")}
                </Table.Th>
                <Table.Th c="dimmed" fz="xs" tt="uppercase" fw={600}>
                  {t("Role")}
                </Table.Th>
                <Table.Th c="dimmed" fz="xs" tt="uppercase" fw={600}>
                  {t("Date")}
                </Table.Th>
                <Table.Th aria-label={t("Action")} />
              </Table.Tr>
            </Table.Thead>

            <Table.Tbody>
              {data?.items.map((invitation, index) => (
                <Table.Tr key={index}>
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <Avatar name={invitation.email} color="initials" radius="xl" />
                      <div>
                        <Text fz="sm" fw={500}>
                          {invitation.email}
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>

                  <Table.Td>
                    <Text fz="sm">{t(getUserRoleLabel(invitation.role))}</Text>
                  </Table.Td>

                  <Table.Td>
                    <Text fz="sm" c="dimmed">
                      {timeAgo(invitation.createdAt)}
                    </Text>
                  </Table.Td>

                  <Table.Td>
                    {isAdmin && (
                      <InviteActionMenu invitationId={invitation.id} />
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      {data?.items.length > 0 && (
        <Paginate
          hasPrevPage={data?.meta?.hasPrevPage}
          hasNextPage={data?.meta?.hasNextPage}
          onNext={() => goNext(data?.meta?.nextCursor)}
          onPrev={goPrev}
        />
      )}
    </>
  );
}
