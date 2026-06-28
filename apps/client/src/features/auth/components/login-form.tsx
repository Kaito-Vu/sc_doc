import { z } from "zod/v4";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import useAuth from "@/features/auth/hooks/use-auth";
import {
  Container,
  Title,
  TextInput,
  Button,
  PasswordInput,
  Box,
  Anchor,
  Group,
} from "@mantine/core";
import classes from "./auth.module.css";
import { useRedirectIfAuthenticated } from "@/features/auth/hooks/use-redirect-if-authenticated.ts";
import { Link } from "react-router-dom";
import APP_ROUTE from "@/lib/app-route.ts";
import { useTranslation } from "react-i18next";
import SsoLogin from "@/ee/components/sso-login.tsx";
import { useWorkspacePublicDataQuery } from "@/features/workspace/queries/workspace-query.ts";
import { Error404 } from "@/components/ui/error-404.tsx";
import React from "react";
import { AuthLayout } from "./auth-layout.tsx";
import { getRecaptchaConfig } from "@/ee/plugins/recaptcha/services/recaptcha-config.service";
import { useRecaptcha } from "@/ee/plugins/recaptcha/hooks/use-recaptcha";

const formSchema = z.object({
  email: z
    .email()
    .min(1, { message: "email is required" }),
  password: z.string().min(1, { message: "Password is required" }),
});
type FormValues = z.infer<typeof formSchema>;

export function LoginForm() {
  const { t } = useTranslation();
  const { signIn, isLoading } = useAuth();
  useRedirectIfAuthenticated();
  const {
    data,
    isLoading: isDataLoading,
    isError,
    error,
  } = useWorkspacePublicDataQuery();

  const [recaptchaSiteKey, setRecaptchaSiteKey] = React.useState("");
  const [recaptchaLoginEnabled, setRecaptchaLoginEnabled] = React.useState(false);

  React.useEffect(() => {
    getRecaptchaConfig().then((config) => {
      if (config.enabled && config.actions.login?.enabled && config.siteKey) {
        setRecaptchaSiteKey(config.siteKey);
        setRecaptchaLoginEnabled(true);
      }
    });
  }, []);

  const { getToken: getRecaptchaToken } = useRecaptcha({
    siteKey: recaptchaSiteKey,
    enabled: recaptchaLoginEnabled,
  });

  const form = useForm<FormValues>({
    validate: zod4Resolver(formSchema),
    initialValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(data: FormValues) {
    if (recaptchaLoginEnabled) {
      const recaptchaToken = await getRecaptchaToken("login");
      await signIn({ ...data, recaptchaToken });
    } else {
      await signIn(data);
    }
  }

  function handleValidationFailure(errors: Record<string, unknown>) {
    const firstInvalidId = Object.keys(errors)[0];
    if (firstInvalidId) {
      document.getElementById(firstInvalidId)?.focus();
    }
  }

  if (isDataLoading) {
   return null;
  }

  if (isError && error?.["response"]?.status === 404) {
    return <Error404 />;
  }

  return (
    <AuthLayout>
      <Container size={420} className={classes.container}>
        <Box p="xl" className={classes.containerBox}>
          <Title order={1} size="h2" ta="center" fw={500} mb="md">
            {t("Login")}
          </Title>

          <SsoLogin />

          {!data?.enforceSso && (
            <>
              <form onSubmit={form.onSubmit(onSubmit, handleValidationFailure)}>
                <TextInput
                  id="email"
                  type="email"
                  label={t("Email")}
                  placeholder="email@example.com"
                  variant="filled"
                  autoComplete="email"
                  errorProps={{ role: "alert" }}
                  {...form.getInputProps("email")}
                />

                <PasswordInput
                  id="password"
                  label={t("Password")}
                  placeholder={t("Your password")}
                  variant="filled"
                  mt="md"
                  autoComplete="current-password"
                  errorProps={{ role: "alert" }}
                  visibilityToggleButtonProps={{
                    "aria-label": t("Toggle password visibility"),
                    "aria-hidden": false,
                    tabIndex: 0,
                  }}
                  {...form.getInputProps("password")}
                />

                <Group justify="flex-end" mt="sm">
                  <Anchor
                    to={APP_ROUTE.AUTH.FORGOT_PASSWORD}
                    component={Link}
                    underline="never"
                    size="sm"
                  >
                    {t("Forgot your password?")}
                  </Anchor>
                </Group>

                <Button type="submit" fullWidth mt="md" loading={isLoading}>
                  {t("Sign In")}
                </Button>
              </form>
            </>
          )}
        </Box>
      </Container>
    </AuthLayout>
  );
}
