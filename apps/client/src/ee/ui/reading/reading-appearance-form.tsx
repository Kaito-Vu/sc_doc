import {
  Button,
  Group,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  UnstyledButton,
  useComputedColorScheme,
} from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import classes from "./reading-appearance.module.css";
import {
  READING_FONTS,
  READING_THEMES,
  READING_WIDTHS,
  readingFontFeatures,
  resolveReadingFont,
  resolveReadingPalette,
} from "./reading-preferences";
import type {
  ReadingFontId,
  ReadingThemeId,
  ReadingWidthId,
} from "./reading-preferences";
import { useReadingPreferences } from "./use-reading-appearance";

export function ReadingAppearanceForm() {
  const { t } = useTranslation();
  const { preferences, update, reset } = useReadingPreferences();
  const colorScheme = useComputedColorScheme("light");
  const font = resolveReadingFont(preferences.font);
  const palette = resolveReadingPalette(preferences.theme, colorScheme);

  return (
    <Stack gap="lg" className={classes.root}>
      <Select
        label={t("Reading font")}
        description={t(
          "Choosing a font with distinct I, l and 1 makes scanning easier.",
        )}
        data={READING_FONTS.map((option) => ({
          value: option.id,
          label: t(option.label),
        }))}
        value={preferences.font}
        onChange={(value) => {
          if (value) {
            update({ font: value as ReadingFontId });
          }
        }}
        allowDeselect={false}
        checkIconPosition="right"
      />

      <div className={classes.control}>
        <div className={classes.sliderHeader}>
          <Text size="sm">{t("Font size")}</Text>
          <span className={classes.sliderValue}>{preferences.fontSize}px</span>
        </div>
        <Slider
          min={14}
          max={24}
          step={1}
          value={preferences.fontSize}
          onChange={(value) => update({ fontSize: value })}
          label={(value) => `${value}px`}
          marks={[
            { value: 14, label: "14" },
            { value: 16, label: "16" },
            { value: 20, label: "20" },
            { value: 24, label: "24" },
          ]}
          aria-label={t("Font size")}
        />
      </div>

      <div className={classes.control}>
        <div className={classes.sliderHeader}>
          <Text size="sm">{t("Line height")}</Text>
          <span className={classes.sliderValue}>
            {preferences.lineHeight.toFixed(2)}
          </span>
        </div>
        <Slider
          min={1.4}
          max={2}
          step={0.05}
          value={preferences.lineHeight}
          onChange={(value) => update({ lineHeight: value })}
          label={(value) => value.toFixed(2)}
          marks={[
            { value: 1.4, label: "1.4" },
            { value: 1.75, label: "1.75" },
            { value: 2, label: "2.0" },
          ]}
          aria-label={t("Line height")}
        />
      </div>

      <div className={classes.control}>
        <div className={classes.sliderHeader}>
          <Text size="sm">{t("Letter spacing")}</Text>
          <span className={classes.sliderValue}>
            {preferences.letterSpacing.toFixed(3)}em
          </span>
        </div>
        <Slider
          min={-0.01}
          max={0.06}
          step={0.005}
          value={preferences.letterSpacing}
          onChange={(value) => update({ letterSpacing: value })}
          label={(value) => `${value.toFixed(3)}em`}
          marks={[
            { value: -0.01, label: "-0.01" },
            { value: 0, label: "0" },
            { value: 0.03, label: "0.03" },
            { value: 0.06, label: "0.06" },
          ]}
          aria-label={t("Letter spacing")}
        />
      </div>

      <div className={classes.control}>
        <Text size="sm">{t("Background")}</Text>
        <div className={classes.swatchGrid}>
          {READING_THEMES.map((theme) => {
            const themePalette = resolveReadingPalette(theme.id, colorScheme);
            return (
              <UnstyledButton
                key={theme.id}
                className={classes.swatchButton}
                data-active={preferences.theme === theme.id || undefined}
                onClick={() => update({ theme: theme.id as ReadingThemeId })}
                aria-pressed={preferences.theme === theme.id}
                aria-label={t(theme.label)}
              >
                <span
                  className={classes.swatch}
                  style={{
                    backgroundColor: themePalette.bg,
                    color: themePalette.fg,
                  }}
                >
                  Aa
                </span>
                <span className={classes.swatchLabel}>{t(theme.label)}</span>
              </UnstyledButton>
            );
          })}
        </div>
      </div>

      <div className={classes.control}>
        <Text size="sm">{t("Reading width")}</Text>
        <SegmentedControl
          size="xs"
          fullWidth
          value={preferences.width}
          onChange={(value) => update({ width: value as ReadingWidthId })}
          data={READING_WIDTHS.map((width) => ({
            label: t(width.label),
            value: width.id,
          }))}
          aria-label={t("Reading width")}
        />
        <Text className={classes.note}>
          {t(
            "Reading width applies when full page width is off in your page preferences.",
          )}
        </Text>
      </div>

      <Switch
        checked={preferences.disambiguate}
        onChange={(event) =>
          update({ disambiguate: event.currentTarget.checked })
        }
        label={t("Distinguish I / l / 1")}
        description={t(
          "Uses OpenType features supported by Inter. Other fonts may ignore this.",
        )}
      />

      <div
        className={classes.preview}
        style={{
          backgroundColor: palette.bg,
          color: palette.fg,
          fontFamily: font.stack,
          fontSize: `${preferences.fontSize}px`,
          lineHeight: preferences.lineHeight,
          letterSpacing: `${preferences.letterSpacing}em`,
          fontFeatureSettings: readingFontFeatures(preferences.disambiguate),
        }}
      >
        <span className={classes.previewLabel}>{t("Preview")}</span>
        <p className={classes.previewSample}>
          {t(
            "The quick brown fox jumps over the lazy dog. Il1 O0 0123456789",
          )}
        </p>
        <p className={classes.previewMeta}>
          {t("I l 1 | O 0 | rn m | 5 S | 8 B")}
        </p>
      </div>

      <Text className={classes.note}>
        {t(
          "Settings apply to this browser. The document content is not changed.",
        )}
      </Text>

      <Group className={classes.footer}>
        <Button
          variant="subtle"
          size="xs"
          leftSection={<IconRefresh size={14} />}
          onClick={reset}
        >
          {t("Reset to defaults")}
        </Button>
      </Group>
    </Stack>
  );
}
