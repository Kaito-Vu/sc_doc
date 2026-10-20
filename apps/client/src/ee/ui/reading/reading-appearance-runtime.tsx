import "@fontsource-variable/inter/wght.css";
import "./reading-appearance.css";
import { useApplyReadingAppearance } from "./use-reading-appearance";

export function ReadingAppearanceRuntime() {
  useApplyReadingAppearance();
  return null;
}
