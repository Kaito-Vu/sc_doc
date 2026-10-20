import { Button, Group, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useEffect } from "react";
import { z } from "zod/v4";
import { useTranslation } from "react-i18next";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
});
type FormValues = z.infer<typeof formSchema>;

interface RenameCredentialFormProps {
  opened: boolean;
  currentName?: string;
  placeholder: string;
  loading: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<unknown> | void;
}

export function RenameCredentialForm({
  opened,
  currentName,
  placeholder,
  loading,
  onClose,
  onSubmit,
}: RenameCredentialFormProps) {
  const { t } = useTranslation();
  const form = useForm<FormValues>({
    validate: zod4Resolver(formSchema),
    initialValues: { name: "" },
  });

  useEffect(() => {
    if (opened && currentName !== undefined) {
      form.setValues({ name: currentName });
    }
  }, [opened, currentName]);

  return (
    <form
      onSubmit={form.onSubmit(async (values) => {
        await onSubmit(values.name);
        onClose();
      })}
    >
      <Stack gap="md">
        <TextInput
          label={t("Name")}
          placeholder={placeholder}
          required
          {...form.getInputProps("name")}
        />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="submit" loading={loading}>
            {t("Update")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
