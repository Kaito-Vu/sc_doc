import { useComputedColorScheme } from "@mantine/core";

export function BrandLogo({ height = 28 }: { height?: number }) {
  const dark = useComputedColorScheme("light") === "dark";
  return (
    <img
      src={dark ? "/icons/logo-negative.png" : "/icons/logo.png"}
      alt="ETC"
      height={height}
      style={{ userSelect: "none", display: "block" }}
    />
  );
}
