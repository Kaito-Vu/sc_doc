import React from "react";
import { Group } from "@mantine/core";
import { BrandLogo } from "@/ee/ui/brand/brand-logo";
import classes from "./auth.module.css";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <>
      <Group justify="center" gap={8} className={classes.logo}>
        <BrandLogo height={48} />
      </Group>
      <main>{children}</main>
    </>
  );
}
