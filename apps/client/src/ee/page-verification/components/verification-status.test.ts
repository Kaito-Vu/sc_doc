import { describe, expect, it } from "vitest";
import {
  getStatusBadgeColor,
  getStatusColor,
  getStatusCssColor,
  getStatusLabel,
} from "./verification-status";

const t = (k: string) => `T:${k}`;
const cases: Array<[string, string, string, string]> = [
  ["verified", "blue", "blue.7", "T:Verified"],
  ["approved", "blue", "blue.7", "T:Approved"],
  ["expiring", "orange", "orange.8", "T:Review needed"],
  ["invalidated", "orange", "orange.8", "T:Unverified changes"],
  ["in_approval", "orange", "orange.8", "T:In Approval"],
  ["needs_clarification", "orange", "orange.8", "T:Needs Clarification"],
  ["expired", "red", "red.7", "T:Verification expired"],
  ["obsolete", "red", "red.7", "T:Obsolete"],
  ["draft", "gray", "gray.6", "T:Draft"],
  ["none", "gray", "gray.6", ""],
];

describe("verification status", () => {
  it.each(cases)("%s", (s, badge, color, label) => {
    const st = s as any;
    expect(getStatusBadgeColor(st)).toBe(badge);
    expect(getStatusColor(st)).toBe(color);
    expect(getStatusCssColor(st)).toBe(`var(--mantine-color-${color.replace(".", "-")})`);
    expect(getStatusLabel(st, t)).toBe(label);
  });
  it("unknown falls back to gray / empty label", () => {
    expect(getStatusColor("zzz" as any)).toBe("gray.6");
    expect(getStatusLabel("zzz" as any, t)).toBe("");
  });
});
