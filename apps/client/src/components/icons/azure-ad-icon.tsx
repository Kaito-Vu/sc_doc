import { rem } from "@mantine/core";

interface Props {
  size?: number | string;
}

export function AzureAdIcon({ size }: Readonly<Props>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      style={{ width: rem(size), height: rem(size) }}
    >
      {/* Azure blue circle background */}
      <circle cx="12" cy="12" r="11" fill="#0078D4" opacity="0.1" />

      {/* Azure AD "A" letter */}
      <path
        d="M9 16h2l0.5-1.5h3l0.5 1.5h2l-3.5-10h-2l-2.5 10zm2.5-3l1-3 1 3h-2z"
        fill="#0078D4"
      />

      {/* Azure square accent (optional, adds more Azure branding) */}
      <rect x="6" y="6" width="2" height="2" fill="#0078D4" opacity="0.3" />
    </svg>
  );
}
