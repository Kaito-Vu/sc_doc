import "@/ee/styles/sc-skin.css";

// Modern UI skin switch. The skin is pure CSS scoped to
// html[data-sc-ui="modern"], so "classic" is simply the attribute being absent.
// Default on; opt out with localStorage "sc-ui" = "classic" (or setModernUi(false)).
const KEY = "sc-ui";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "classic";
  } catch {
    return true;
  }
}

export function setModernUi(enabled: boolean): void {
  if (enabled) document.documentElement.setAttribute("data-sc-ui", "modern");
  else document.documentElement.removeAttribute("data-sc-ui");
  try {
    localStorage.setItem(KEY, enabled ? "modern" : "classic");
  } catch {
    /* storage unavailable: preference is session-only */
  }
}

export function isModernUi(): boolean {
  return document.documentElement.getAttribute("data-sc-ui") === "modern";
}

if (read()) document.documentElement.setAttribute("data-sc-ui", "modern");
