import { FC } from "react";
import { Group, Select, Text, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { NumberingLevelConfig, NumberingLevelFormat } from "@docmost/editor-ext";

const FORMAT_OPTIONS: { value: NumberingLevelFormat; label: string }[] = [
  { value: "decimal", label: "1, 2, 3" },
  { value: "lowerRoman", label: "i, ii, iii" },
  { value: "upperRoman", label: "I, II, III" },
  { value: "lowerLetter", label: "a, b, c" },
  { value: "upperLetter", label: "A, B, C" },
  { value: "bullet", label: "Bullet" },
];

interface Props {
  level: number; // 1-10
  config: NumberingLevelConfig;
  onChange: (config: NumberingLevelConfig) => void;
}

export const NumberingLevelRow: FC<Props> = ({ level, config, onChange }) => {
  const { t } = useTranslation();

  return (
    <Group wrap="nowrap" gap="xs" data-testid={`numbering-level-row-${level}`}>
      <Text size="sm" w={60}>
        {t("Level {{level}}", { level })}
      </Text>
      <Select
        size="xs"
        data={FORMAT_OPTIONS}
        value={config.format}
        onChange={(value) =>
          value && onChange({ ...config, format: value as NumberingLevelFormat })
        }
        w={140}
      />
      <TextInput
        size="xs"
        value={config.text}
        onChange={(e) => onChange({ ...config, text: e.currentTarget.value })}
        placeholder={t("e.g. %1.%2.")}
        w={140}
      />
    </Group>
  );
};
