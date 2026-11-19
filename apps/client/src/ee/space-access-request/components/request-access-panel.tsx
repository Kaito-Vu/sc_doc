import { useState } from "react";
import { Alert, Button, Group, Loader, Select, Stack, Text, Textarea } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { spaceRoleData } from "@/features/space/types/space-role-data.ts";
import { SpaceRole } from "@/lib/types.ts";
import {
  useAccessInfoQuery,
  useCancelAccessRequestMutation,
  useCreateAccessRequestMutation,
} from "@/ee/space-access-request/queries/space-access-request-query";

// Replaces the 403 body when the user cannot open a space.
export function RequestAccessPanel({ spaceSlug }: { spaceSlug?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useAccessInfoQuery(spaceSlug);
  const create = useCreateAccessRequestMutation(spaceSlug);
  const cancel = useCancelAccessRequestMutation(spaceSlug);
  const [role, setRole] = useState<string>(SpaceRole.READER);
  const [message, setMessage] = useState("");

  if (isLoading) return <Loader m="xl" />;

  const back = (
    <Button component={Link} to="/home" variant="default" size="sm" mt="xs">
      {t("Back to home")}
    </Button>
  );

  if (!data?.space) {
    return (
      <EmptyState
        icon={IconLock}
        title={t("403 - Access denied")}
        description={t("You don't have permission to access this space.")}
        action={back}
      />
    );
  }

  const { space, request } = data;
  const roleLabel = (v?: string | null) =>
    t(spaceRoleData.find((r) => r.value === v)?.label ?? "");

  return (
    <EmptyState
      icon={IconLock}
      title={t("You don't have access to this space")}
      description={space.name}
      action={
        <Stack gap="sm" maw={420} mt="xs">
          {request?.status === "pending" ? (
            <>
              <Alert color="yellow" title={t("Request pending")}>
                {t("Waiting for approval to join as {{role}}.", {
                  role: roleLabel(request.roleRequested),
                })}
              </Alert>
              <Group>
                <Button
                  variant="default"
                  loading={cancel.isPending}
                  onClick={() => cancel.mutate(request.id)}
                >
                  {t("Withdraw request")}
                </Button>
                {back}
              </Group>
            </>
          ) : (
            <>
              {request?.status === "rejected" && (
                <Alert color="red" title={t("Request rejected")}>
                  {request.decisionReason ?? ""}
                </Alert>
              )}
              {request?.status === "approved" && (
                <Alert color="green" title={t("Request approved")}>
                  <Button size="xs" mt="xs" onClick={() => window.location.reload()}>
                    {t("Open space")}
                  </Button>
                </Alert>
              )}
              {data.canRequest ? (
                <>
                  <Text size="sm" fw={500}>
                    {space.name}
                  </Text>
                  <Select
                    label={t("Permission")}
                    value={role}
                    onChange={(v) => v && setRole(v)}
                    allowDeselect={false}
                    data={spaceRoleData.map((r) => ({
                      value: r.value,
                      label: t(r.label),
                    }))}
                  />
                  <Textarea
                    label={t("Message (optional)")}
                    value={message}
                    maxLength={500}
                    onChange={(e) => setMessage(e.currentTarget.value)}
                  />
                  <Group>
                    <Button
                      loading={create.isPending}
                      onClick={() =>
                        create.mutate({
                          spaceId: space.id,
                          role: role as SpaceRole,
                          message: message.trim() || undefined,
                        })
                      }
                    >
                      {t("Send")}
                    </Button>
                    <Button variant="default" onClick={() => navigate("/home")}>
                      {t("Cancel")}
                    </Button>
                  </Group>
                </>
              ) : (
                back
              )}
            </>
          )}
        </Stack>
      }
    />
  );
}
