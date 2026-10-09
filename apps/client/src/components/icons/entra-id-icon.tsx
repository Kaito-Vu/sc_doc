import { rem } from "@mantine/core";

interface Props {
  size?: number | string;
}

export function EntraIdIcon({ size }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      style={{ width: rem(size), height: rem(size) }}
    >
      <defs>
        <linearGradient
          id="entra-bg-grad"
          x1="16"
          y1="2"
          x2="16"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#00BCF2" />
          <stop offset="100%" stopColor="#0078D4" />
        </linearGradient>

        <linearGradient
          id="entra-key-grad"
          x1="12"
          y1="10"
          x2="22"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E0F2FE" />
        </linearGradient>
      </defs>

      <path
        d="M16 2.5L5 6.5V14.5C5 21.5 9.7 27.9 16 29.5C22.3 27.9 27 21.5 27 14.5V6.5L16 2.5Z"
        fill="url(#entra-bg-grad)"
      />

      <path
        d="M16 8C13.8 8 12 9.8 12 12C12 13.5 12.8 14.8 14 15.5V22C14 22.6 14.4 23 15 23H17C17.6 23 18 22.6 18 22V20H19C19.6 20 20 19.6 20 19V18C20 17.4 19.6 17 19 17H18V15.5C19.2 14.8 20 13.5 20 12C20 9.8 18.2 8 16 8ZM16 13.5C15.2 13.5 14.5 12.8 14.5 12C14.5 11.2 15.2 10.5 16 10.5C16.8 10.5 17.5 11.2 17.5 12C17.5 12.8 16.8 13.5 16 13.5Z"
        fill="url(#entra-key-grad)"
      />
    </svg>
  );
}
