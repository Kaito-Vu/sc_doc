import { Anchor, Group, Table, Text, Badge, Paper } from "@mantine/core";
import {
  useChangeMemberRoleMutation,
  useWorkspaceMembersQuery,
} from "@/features/workspace/queries/workspace-query.ts";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import React, { useState } from "react";
import RoleSelectMenu from "@/components/ui/role-select-menu.tsx";
import {
  getUserRoleLabel,
  userRoleData,
} from "@/features/workspace/types/user-role-data.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { UserRole } from "@/lib/types.ts";
import { useTranslation } from "react-i18next";
import Paginate from "@/components/common/paginate.tsx";
import { SearchInput } from "@/components/common/search-input.tsx";
import NoTableResults from "@/components/common/no-table-results.tsx";
import { usePaginateAndSearch } from "@/hooks/use-paginate-and-search.tsx";
import MemberActionMenu from "@/features/workspace/components/members/components/members-action-menu.tsx";
import { MemberProviderFilter } from "@/ee/security/components/member-provider-filter.tsx";
import { OnlineDot } from "@/ee/presence/online-dot.tsx";
import { MemberProviderBadge } from "@/ee/security/components/member-provider-badge.tsx";
import MemberStatusFilter from "@/features/workspace/components/members/components/member-status-filter.tsx";
import { MemberListStatus } from "@/features/workspace/types/workspace.types.ts";
import { Link } from "react-router-dom";
import { getUserProfileUrl } from "@/lib/config.ts";
import { UserHoverCard } from "@/features/user/components/user-hover-card";
import { formatLocalized, useDateFnsLocale } from "@/lib/date-locale.ts";
import rowClasses from "@/components/ui/clickable-table-row.module.css";

export default function WorkspaceMembersTable() {
  const { t } = useTranslation();
  const locale = useDateFnsLocale();
  const { search, cursor, goNext, goPrev, handleSearch, resetPagination } =
    usePaginateAndSearch();
  const [providerId, setProviderId] = useState<string | null>(null);
  const [status, setStatus] = useState<MemberListStatus>("active");
  const { data, isLoading } = useWorkspaceMembersQuery({
    cursor,
    limit: 100,
    query: search,
    providerId: providerId || undefined,
    status,
  });
  const changeMemberRoleMutation = useChangeMemberRoleMutation();
  const { isAdmin, isOwner } = useUserRole();

  const handleStatusChange = (value: MemberListStatus) => {
    setStatus(value);
    resetPagination();
  };

  const assignableUserRoles = isOwner
    ? userRoleData
    : userRoleData.filter((role) => role.value !== UserRole.OWNER);

  const handleProviderFilterChange = (value: string | null) => {
    setProviderId(value);
    resetPagination();
  };

  const handleRoleChange = async (
    userId: string,
    currentRole: string,
    newRole: string,
  ) => {
    if (newRole === currentRole) {
      return;
    }

    const memberRoleUpdate = {
      userId: userId,
      role: newRole,
    };

    await changeMemberRoleMutation.mutateAsync(memberRoleUpdate);
  };

  return (
    <>
      <Group mb="sm" align="flex-end">
        <SearchInput onSearch={handleSearch} mb={0} />
        {isAdmin && (
          <MemberStatusFilter status={status} onChange={handleStatusChange} />
        )}
        <MemberProviderFilter
          value={providerId}
          onChange={handleProviderFilterChange}
        />
      </Group>
      <Paper withBorder radius="md">
        <Table.ScrollContainer minWidth={600} scrollAreaProps={{ scrollbars: false }}>
          <Table verticalSpacing="md" horizontalSpacing="lg">
            <Table.Thead>
              <Table.Tr>
                <Table.Th c="dimmed" fz="xs" tt="uppercase" fw={600}>
                  {t("User")}
                </Table.Th>
                <Table.Th c="dimmed" fz="xs" tt="uppercase" fw={600}>
                  {t("Status")}
                </Table.Th>
                <Table.Th c="dimmed" fz="xs" tt="uppercase" fw={600}>
                  {t("Provider")}
                </Table.Th>
                <Table.Th c="dimmed" fz="xs" tt="uppercase" fw={600}>
                  {t("Role")}
                </Table.Th>
                <Table.Th aria-label={t("Action")} />
              </Table.Tr>
            </Table.Thead>

            <Table.Tbody>
              {data?.items.length > 0 ? (
                data?.items.map((user, index) => (
                  <Table.Tr key={index} className={rowClasses.row}>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <OnlineDot userId={user.id}>
                          <CustomAvatar
                            avatarUrl={user.avatarUrl}
                            name={user.name}
                            radius="xl"
                          />
                        </OnlineDot>
                        <div>
                          {user.deletedAt ? (
                            <Text fz="sm" fw={500} lineClamp={1}>
                              {user.name}
                            </Text>
                          ) : (
                            <UserHoverCard userId={user.id}>
                            <Anchor
                              component={Link}
                              to={getUserProfileUrl(user.id)}
                              size="sm"
                              fw={500}
                              underline="never"
                              lineClamp={1}
                              className={rowClasses.link}
                              style={{ color: "var(--mantine-color-text)" }}
                            >
                              {user.name}
                            </Anchor>
                            </UserHoverCard>
                          )}
                          <Text fz="xs" c="dimmed">
                            {user.deletedAt
                              ? t("Deleted on {{date}}", {
                                  date: formatLocalized(
                                    user.deletedAt,
                                    "MMM d, yyyy",
                                    "PP",
                                    locale,
                                  ),
                                })
                              : user.email}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      {user.deletedAt ? (
                        <Badge
                          variant="light"
                          color="red"
                          radius="sm"
                          tt="none"
                          fw={500}
                        >
                          {t("Deleted")}
                        </Badge>
                      ) : user.deactivatedAt ? (
                        <Badge
                          variant="light"
                          color="orange"
                          radius="sm"
                          tt="none"
                          fw={500}
                        >
                          {t("Deactivated")}
                        </Badge>
                      ) : (
                        <Badge
                          variant="light"
                          color="green"
                          radius="sm"
                          tt="none"
                          fw={500}
                        >
                          {t("Active")}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <MemberProviderBadge user={user} />
                    </Table.Td>
                    <Table.Td>
                      {isAdmin && !user.deletedAt ? (
                        <RoleSelectMenu
                          roles={assignableUserRoles}
                          roleName={getUserRoleLabel(user.role)}
                          onChange={(newRole) =>
                            handleRoleChange(user.id, user.role, newRole)
                          }
                        />
                      ) : (
                        <Text fz="sm">{t(getUserRoleLabel(user.role))}</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {isAdmin && !user.deletedAt && (
                        <MemberActionMenu
                          userId={user.id}
                          name={user.name}
                          deactivatedAt={user.deactivatedAt}
                        />
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))
              ) : (
                <NoTableResults colSpan={4} />
              )}
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
