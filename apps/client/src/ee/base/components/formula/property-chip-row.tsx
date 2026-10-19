import { useState, useMemo } from "react";
import { Group, TextInput, UnstyledButton, Text } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import type { IBaseProperty } from "@/ee/base/types/base.types";
import classes from "@/ee/base/styles/formula.module.css";
import { useTranslation } from "react-i18next";

export function PropertyChipRow({
  properties,
  onInsert,
}: {
  properties: IBaseProperty[];
  onInsert: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((p) => p.name.toLowerCase().includes(q));
  }, [properties, query]);

  return (
    <div>
      <Group justify="space-between" mb={8}>
        <Text size="xs" fw={600} c="gray.7">
          {t("Properties")}
        </Text>
        <TextInput
          size="xs"
          placeholder={t("Search")}
          leftSection={<IconSearch size={12} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          w={140}
        />
      </Group>
      {visible.length === 0 ? (
        <Text size="xs" c="dimmed" py={6}>
          {t("No matches.")}
        </Text>
      ) : (
        <Group gap={6}>
          {visible.map((p) => (
            <UnstyledButton
              key={p.id}
              onClick={() => onInsert(p.name)}
              className={classes.propChip}
            >
              {p.name}
            </UnstyledButton>
          ))}
        </Group>
      )}
    </div>
  );
}
