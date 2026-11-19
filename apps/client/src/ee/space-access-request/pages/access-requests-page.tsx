import { Container, Stack, Text, Title } from "@mantine/core";
import { IconInbox } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { DocumentTitle } from "@/components/ui/document-title";
import { EmptyState } from "@/components/ui/empty-state";
import { AccessRequestRow } from "@/ee/space-access-request/components/access-request-row";
import {
  useAccessRequestListQuery,
  useApproveAccessRequestMutation,
  useRejectAccessRequestMutation,
} from "@/ee/space-access-request/queries/space-access-request-query";

export function AccessRequestsPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useAccessRequestListQuery();
  const approve = useApproveAccessRequestMutation();
  const reject = useRejectAccessRequestMutation();
  const items = data?.items ?? [];

  return (
    <Container size="sm" py="lg">
      <DocumentTitle title={t("Access requests")} />
      <Title order={3} mb="xs">
        {t("Access requests")}
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        {t("Approve or reject requests to join spaces you manage.")}
      </Text>
      {!isLoading && items.length === 0 ? (
        <EmptyState
          icon={IconInbox}
          title={t("No pending requests")}
          description={t("New requests will appear here.")}
        />
      ) : (
        <Stack gap="sm">
          {items.map((r) => (
            <AccessRequestRow
              key={r.id}
              request={r}
              busy={approve.isPending || reject.isPending}
              onApprove={(role) => approve.mutate({ id: r.id, role })}
              onReject={(reason) => reject.mutate({ id: r.id, reason })}
            />
          ))}
        </Stack>
      )}
    </Container>
  );
}
