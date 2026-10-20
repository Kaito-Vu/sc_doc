import React from "react";
import { Anchor, Button, Divider, Group, Space, Text } from "@mantine/core";
import { Trans, useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title";
import { ApiKeyTable } from "@/ee/api-key/components/api-key-table";
import { CreateApiKeyModal } from "@/ee/api-key/components/create-api-key-modal";
import { ApiKeyCreatedModal } from "@/ee/api-key/components/api-key-created-modal";
import { UpdateApiKeyModal } from "@/ee/api-key/components/update-api-key-modal";
import { RevokeApiKeyModal } from "@/ee/api-key/components/revoke-api-key-modal";
import Paginate from "@/components/common/paginate";
import { useCursorPaginate } from "@/hooks/use-cursor-paginate";
import { useGetApiKeysQuery } from "@/ee/api-key/queries/api-key-query.ts";
import { IApiKey } from "@/ee/api-key";
import { useCredentialModals } from "@/ee/api-key/hooks/use-credential-modals";
import useUserRole from '@/hooks/use-user-role.tsx';
import RestrictApiToAdmins from "@/ee/api-key/components/restrict-api-to-admins";
import { DocumentTitle } from "@/components/ui/document-title.tsx";

export default function WorkspaceApiKeys() {
  const { t } = useTranslation();
  const { cursor, goNext, goPrev } = useCursorPaginate();
  const modals = useCredentialModals<IApiKey>();
  const { data, isLoading } = useGetApiKeysQuery({ cursor, adminView: true });
  const { isAdmin } = useUserRole();

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <DocumentTitle title={t("API management")} />

      <SettingsTitle title={t("API management")} />

      <Text size="sm" c="dimmed" mb="md">
        <Trans
          i18nKey="Manage API keys for all users in the workspace. View the <anchor>API documentation</anchor> for usage details."
          components={{
            anchor: <Anchor href="https://docmost.com/api-docs" target="_blank" size="sm" />,
          }}
        />
      </Text>

      <RestrictApiToAdmins />
      <Divider my="lg" />

      <Group justify="flex-end" mb="md">
        <Button onClick={modals.openCreate}>
          {t("Create API Key")}
        </Button>
      </Group>

      <ApiKeyTable
        apiKeys={data?.items}
        isLoading={isLoading}
        showUserColumn
        onUpdate={modals.openUpdate}
        onRevoke={modals.openRevoke}
      />

      <Space h="md" />

      {data?.items.length > 0 && (
        <Paginate
          hasPrevPage={data?.meta?.hasPrevPage}
          hasNextPage={data?.meta?.hasNextPage}
          onNext={() => goNext(data?.meta?.nextCursor)}
          onPrev={goPrev}
        />
      )}

      <CreateApiKeyModal
        opened={modals.createOpened}
        onClose={modals.closeCreate}
        onSuccess={modals.setCreated}
      />

      <ApiKeyCreatedModal
        opened={!!modals.created}
        onClose={() => modals.setCreated(null)}
        apiKey={modals.created}
      />

      <UpdateApiKeyModal
        opened={modals.updateOpened}
        onClose={modals.closeUpdate}
        apiKey={modals.selected}
      />

      <RevokeApiKeyModal
        opened={modals.revokeOpened}
        onClose={modals.closeRevoke}
        apiKey={modals.selected}
      />
    </>
  );
}
