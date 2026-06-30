import { useState } from "react";
import { Text, Collapse, Group } from "@mantine/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { getSpaceUrl } from "@/lib/config";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { AvatarIconType } from "@/features/attachments/types/attachment.types";
import { IconChevronDown } from "@tabler/icons-react";
import classes from "@/components/layouts/global/global-sidebar.module.css";
import styles from "./all-spaces-sidebar-section.module.css";

interface AllSpacesSidebarSectionProps {
  readonly onNavigate?: () => void;
}

export default function AllSpacesSidebarSection({
  onNavigate,
}: AllSpacesSidebarSectionProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(true);
  const { data: spacesData, isPending: isSpacesPending } = useGetSpacesQuery({ limit: 50 });
  const allSpaces = spacesData?.items ?? [];

  const handleNavClick = () => {
    onNavigate?.();
  };

  if (!allSpaces || allSpaces.length === 0) {
    return null;
  }

  return (
    <div>
      <Collapse
        expanded={opened}
        transitionDuration={200}
        transitionTimingFunction="ease-in-out"
      >
        <div className={classes.section}>
          <Group
            justify="space-between"
            align="center"
            className={styles.header}
            onClick={() => setOpened(!opened)}
            style={{ cursor: "pointer", padding: "8px 12px", marginBottom: "4px" }}
          >
            <Text component="h2" className={classes.sectionHeader}>
              {t("All spaces")}
            </Text>
            <IconChevronDown
              size={16}
              style={{
                transform: opened ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 200ms ease-in-out",
              }}
            />
          </Group>
          {!isSpacesPending && allSpaces.length > 0 ? (
            <>
              {allSpaces.slice(0, 15).map((space) => (
                <Link
                  key={space.id}
                  className={classes.spaceItem}
                  to={getSpaceUrl(space.slug)}
                  onClick={handleNavClick}
                >
                  <CustomAvatar
                    name={space.name}
                    avatarUrl={space.logo}
                    type={AvatarIconType.SPACE_ICON}
                    color="initials"
                    variant="filled"
                    size={20}
                  />
                  <Text size="sm" fw={500} lineClamp={1}>
                    {space.name}
                  </Text>
                </Link>
              ))}
              {allSpaces.length > 15 && (
                <Link
                  className={classes.spaceItem}
                  to="/spaces"
                  onClick={handleNavClick}
                >
                  <Text size="xs" c="dimmed">
                    {t("View all")}
                  </Text>
                </Link>
              )}
            </>
          ) : null}
        </div>
      </Collapse>
    </div>
  );
}
