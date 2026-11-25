import { afterEach, describe, expect, it, vi } from "vitest";
import { getDrawioUrl, getFileUploadSizeLimit } from "./config";

describe("config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a configured value", () => {
    vi.stubEnv("DRAWIO_URL", "https://drawio.example.com");
    expect(getDrawioUrl()).toBe("https://drawio.example.com");
  });

  it("falls back to the default when a value is blank", () => {
    vi.stubEnv("DRAWIO_URL", "");
    expect(getDrawioUrl()).toBe("https://embed.diagrams.net");
    expect(getFileUploadSizeLimit()).toBe(10 * 1024 * 1024);
  });
});
