import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import useCurrentUser from "@/features/user/hooks/use-current-user";

export function usePasswordConfirmForm() {
  const { t } = useTranslation();
  const { data: currentUser } = useCurrentUser();
  const requiresPassword = !currentUser?.user?.hasGeneratedPassword;

  const formSchema = requiresPassword
    ? z.object({
        confirmPassword: z.string().min(1, { message: t("Password is required") }),
      })
    : z.object({
        confirmPassword: z.string().optional(),
      });

  const form = useForm({
    validate: zod4Resolver(formSchema),
    initialValues: {
      confirmPassword: "",
    },
  });

  return { form, requiresPassword };
}
