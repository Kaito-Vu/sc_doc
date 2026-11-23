import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORM_VALUES,
  SECRET_MASK,
  toPayload,
  validateForm,
} from "./destination-form";

const base = { ...DEFAULT_FORM_VALUES, name: "n" };

describe("validateForm", () => {
  it("requires name", () => {
    expect(validateForm({ ...base, name: " " }).name).toBeDefined();
  });

  describe("splunk_hec", () => {
    const v = { ...base, type: "splunk_hec" as const, url: "https://h:8088", token: "t" };
    it("accepts valid", () => expect(validateForm(v)).toEqual({}));
    it("requires token unless stored", () => {
      expect(validateForm({ ...v, token: "" }).token).toBeDefined();
      expect(validateForm({ ...v, token: "" }, { token: true }).token).toBeUndefined();
    });
    it("rejects bad url and bad path", () => {
      expect(validateForm({ ...v, url: "nope" }).url).toBeDefined();
      expect(validateForm({ ...v, url: "https://h/other" }).url).toBeDefined();
      expect(validateForm({ ...v, url: "https://h/services/collector/event/" }).url).toBeUndefined();
    });
  });

  describe("datadog", () => {
    const v = { ...base, type: "datadog" as const, apiKey: "k" };
    it("accepts valid without url", () => expect(validateForm(v)).toEqual({}));
    it("requires apiKey unless stored", () => {
      expect(validateForm({ ...v, apiKey: "" }).apiKey).toBeDefined();
      expect(validateForm({ ...v, apiKey: "" }, { apiKey: true }).apiKey).toBeUndefined();
    });
    it("rejects unknown site", () => {
      expect(validateForm({ ...v, site: "x.com" }).site).toBeDefined();
    });
  });

  describe("http", () => {
    const v = { ...base, type: "http" as const, url: "http://h/x" };
    it("accepts valid", () => expect(validateForm(v)).toEqual({}));
    it("rejects bad url and header name", () => {
      expect(validateForm({ ...v, url: "ftp://h" }).url).toBeDefined();
      expect(validateForm({ ...v, authHeaderName: "a b" }).authHeaderName).toBeDefined();
    });
  });
});

describe("toPayload", () => {
  it("splunk_hec", () => {
    expect(
      toPayload({ ...base, type: "splunk_hec", url: " https://h ", token: " t ", host: " x ", source: "", sourcetype: "" }),
    ).toEqual({
      name: "n",
      type: "splunk_hec",
      config: { url: "https://h", index: "", source: "docmost", sourcetype: "docmost:audit", host: "x", tls: { rejectUnauthorized: true } },
      secrets: { token: "t" },
      enabled: true,
    });
  });
  it("datadog omits masked secret", () => {
    expect(toPayload({ ...base, type: "datadog", apiKey: SECRET_MASK, service: "", tags: " a " })).toEqual({
      name: "n",
      type: "datadog",
      config: { site: DEFAULT_FORM_VALUES.site, service: "docmost", tags: "a" },
      secrets: {},
      enabled: true,
    });
  });
  it("http", () => {
    expect(toPayload({ ...base, type: "http", url: "http://h", token: "t", rejectUnauthorized: false })).toEqual({
      name: "n",
      type: "http",
      config: { url: "http://h", authHeaderName: "Authorization", authHeaderPrefix: "Bearer ", format: "json", tls: { rejectUnauthorized: false } },
      secrets: { token: "t" },
      enabled: true,
    });
  });
});
