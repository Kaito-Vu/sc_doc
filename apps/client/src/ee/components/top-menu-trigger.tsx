import { Group, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { IUser } from "@/features/user/types/user.types.ts";

interface TopMenuTriggerProps {
  user: IUser;
}

export default function TopMenuTrigger({ user }: TopMenuTriggerProps) {
  return (
    <UnstyledButton>
      <Group gap={7} wrap={"nowrap"}>
        <CustomAvatar size="sm" avatarUrl={user.avatarUrl} name={user.name} />
        <div style={{ maxWidth: 160 }}>
          <Text fw={500} size="sm" lh={1.2} lineClamp={1}>
            {user.name}
          </Text>
          <Text size="xs" c="dimmed" lh={1.2} truncate="end">
            {user.email}
          </Text>
        </div>
        <IconChevronDown size={16} />
      </Group>
    </UnstyledButton>
  );
}
