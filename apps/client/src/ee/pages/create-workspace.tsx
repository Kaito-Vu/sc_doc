import { SetupWorkspaceForm } from "@/features/auth/components/setup-workspace-form.tsx";
import React from "react";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { useTranslation } from "react-i18next";

export default function CreateWorkspace() {
  const { t } = useTranslation();
  return (
    <>
      <DocumentTitle title={t("Create Workspace")} />
      <SetupWorkspaceForm />
    </>
  );
}
