import { Anchor, Group, List, Stack, Table, Text, ThemeIcon } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { Trans, useTranslation } from "react-i18next";

const enterpriseFeatures = [
  "AI Integration (Chat, Search & Assistant)",
  "MCP Support",
  "SSO (SAML, OIDC, LDAP)",
  "SCIM Provisioning",
  "Multi-factor Authentication (2FA)",
  "Page-level Permissions",
  "Page Verification & Approval Workflow",
  "Audit Logs",
  "Enterprise Controls",
  "API Keys",
  "Advanced Search Engine Support",
  "Full-text Search in Attachments (PDF, DOCX)",
  "Resolve Comments",
  "Confluence Import",
  "PDF & DOCX Import",
  "Bases",
  "Kanban",
  "Templates",
  "Personal Spaces",
];

export default function OssDetails() {
  const { t } = useTranslation();

  return (
    <Stack gap="lg">
      <Table.ScrollContainer minWidth={500} py="md">
        <Table
          variant="vertical"
          verticalSpacing="sm"
          layout="fixed"
          withTableBorder
        >
          <Table.Tbody>
            <Table.Tr>
              <Table.Th w={160}>{t("Edition")}</Table.Th>
              <Table.Td>
                <Group wrap="nowrap">
                  {t("Open Source")}
                  <div>
                    <ThemeIcon
                      color="green"
                      variant="light"
                      size={24}
                      radius="xl"
                    >
                      <IconCheck size={16} />
                    </ThemeIcon>
                  </div>
                </Group>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Stack gap="md">
        <Text fw={500}>
          {t("Upgrade to the Enterprise Edition to unlock:")}
        </Text>

        <List
          spacing={4}
          size="sm"
          icon={
            <ThemeIcon size={20} color={"gray"} radius="xl">
              <IconCheck size={14} />
            </ThemeIcon>
          }
        >
          {enterpriseFeatures.map((feature) => (
            <List.Item key={feature}>{t(feature)}</List.Item>
          ))}
        </List>

        <Text size="sm" c="dimmed">
          <Trans
            i18nKey="Get an enterprise trial key at <anchor>customers.docmost.com</anchor>."
            components={{
              anchor: (
                <Anchor
                  href="https://customers.docmost.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ),
            }}
          />
        </Text>

        <Text size="sm" c="dimmed">
          <Trans
            i18nKey="Visit <anchor>docmost.com/pricing</anchor> to purchase an enterprise license."
            components={{
              anchor: (
                <Anchor
                  href="https://docmost.com/pricing"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ),
            }}
          />
        </Text>
        <Text size="sm" c="dimmed">
          <Trans
            i18nKey="For inquiries, contact <anchor>sales@docmost.com</anchor>"
            components={{
              anchor: <Anchor href="mailto:sales@docmost.com" />,
            }}
          />
        </Text>
      </Stack>
    </Stack>
  );
}
