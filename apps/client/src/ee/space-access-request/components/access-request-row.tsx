import { useState } from "react";
import { Avatar, Button, Group, Paper, Select, Stack, Text, Textarea } from "@mantine/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { spaceRoleData } from "@/features/space/types/space-role-data.ts";
import { SpaceRole } from "@/lib/types.ts";
import { IPendingAccessRequest } from "@/ee/space-access-request/types/space-access-request.types";

type Props = {
  request: IPendingAccessRequest;
  busy?: boolean;
  onApprove: (role: SpaceRole) => void;
  onReject: (reason?: string) => void;
};

export function AccessRequestRow({ request, busy, onApprove, onReject }: Props) {
  const { t } = useTranslation();
  const [role, setRole] = useState<string>(request.roleRequested);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group wrap="nowrap" gap="sm">
            <Avatar src={request.requesterAvatarUrl} name={request.requesterName} size="sm" />
            <div>
              <Text size="sm" fw={500}>
                {request.requesterName}
              </Text>
              <Text size="xs" c="dimmed">
                {t("Requests access to")}{" "}
                <Link to={`/s/${request.spaceSlug}`}>{request.spaceName}</Link>
              </Text>
            </div>
          </Group>
          <Select
            aria-label={t("Permission")}
            size="xs"
            w={140}
            allowDeselect={false}
            value={role}
            onChange={(v) => v && setRole(v)}
            data={spaceRoleData.map((r) => ({ value: r.value, label: t(r.label) }))}
          />
        </Group>
        {request.message && (
          <Text size="sm" c="dimmed">
            {request.message}
          </Text>
        )}
        {rejecting ? (
          <Stack gap="xs">
            <Textarea
              aria-label={t("Reason (optional)")}
              placeholder={t("Reason (optional)")}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Button
                size="xs"
                color="red"
                loading={busy}
                onClick={() => onReject(reason.trim() || undefined)}
              >
                {t("Confirm reject")}
              </Button>
              <Button size="xs" variant="default" onClick={() => setRejecting(false)}>
                {t("Cancel")}
              </Button>
            </Group>
          </Stack>
        ) : (
          <Group gap="xs">
            <Button size="xs" loading={busy} onClick={() => onApprove(role as SpaceRole)}>
              {t("Approve")}
            </Button>
            <Button size="xs" variant="default" onClick={() => setRejecting(true)}>
              {t("Reject")}
            </Button>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
