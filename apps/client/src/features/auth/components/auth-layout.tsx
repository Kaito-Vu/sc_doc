import React from "react";
import { Group } from "@mantine/core";
import { BrandLogo } from "@/ee/ui/brand/brand-logo";
import { MAIN_CONTENT_ID } from "@/components/ui/skip-to-main.tsx";
import AnnouncementBanners from "@/ee/announcement/components/announcement-banners.tsx";
import classes from "./auth.module.css";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <>
      <AnnouncementBanners surface="public" />
      <Group justify="center" gap={8} className={classes.logo}>
        <BrandLogo height={48} />
      </Group>
      <main id={MAIN_CONTENT_ID} tabIndex={-1}>{children}</main>
    </>
  );
}
