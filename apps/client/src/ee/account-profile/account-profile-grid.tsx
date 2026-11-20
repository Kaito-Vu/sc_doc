import { Grid } from "@mantine/core";
import AccountAvatar from "@/features/user/components/account-avatar";
import AccountProfileSection from "./account-profile-section";

// Avatar and profile fields share one grid row (stacks on mobile).
export default function AccountProfileGrid() {
  return (
    <Grid gap="xl" align="flex-start">
      <Grid.Col span={{ base: 12, sm: "content" }}>
        <AccountAvatar />
      </Grid.Col>
      <Grid.Col span={{ base: 12, sm: "auto" }}>
        <AccountProfileSection />
      </Grid.Col>
    </Grid>
  );
}
