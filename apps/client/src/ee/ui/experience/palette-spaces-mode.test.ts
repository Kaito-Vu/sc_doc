import { describe, expect, it } from "vitest";
import { parseSpacesMode } from "./palette-spaces-mode";

describe("parseSpacesMode", () => {
  it("detects the prefix and strips it", () => {
    expect(parseSpacesMode("s ")).toEqual({ spacesMode: true, term: "" });
    expect(parseSpacesMode("s  eng ")).toEqual({ spacesMode: true, term: "eng" });
  });
  it("ignores other queries", () => {
    expect(parseSpacesMode("s")).toEqual({ spacesMode: false, term: "s" });
    expect(parseSpacesMode("sales")).toEqual({ spacesMode: false, term: "sales" });
    expect(parseSpacesMode(" s x")).toEqual({ spacesMode: false, term: "s x" });
  });
});
