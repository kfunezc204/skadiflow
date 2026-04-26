import { describe, it, expect } from "vitest";
import { extractUrls, getHostname } from "./urlUtils";

describe("extractUrls", () => {
  it("returns an empty array for plain text without URLs", () => {
    expect(extractUrls("just a regular task title")).toEqual([]);
  });

  it("extracts a fully-qualified https URL", () => {
    expect(extractUrls("see https://example.com/page for details")).toEqual([
      "https://example.com/page",
    ]);
  });

  it("extracts a bare domain and prefixes https://", () => {
    expect(extractUrls("read reddit.com later")).toEqual(["https://reddit.com"]);
  });

  it("does not double-add a domain that already appears as a full URL in the text", () => {
    const out = extractUrls("https://github.com is great, github.com rocks");
    expect(out).toEqual(["https://github.com"]);
  });

  it("extracts multiple distinct URLs from one string", () => {
    const out = extractUrls("docs at https://docs.example.com and forum at example.org");
    expect(out).toContain("https://docs.example.com");
    expect(out).toContain("https://example.org");
    expect(out).toHaveLength(2);
  });

  it("handles www prefix on bare domains", () => {
    expect(extractUrls("visit www.openai.com today")).toEqual(["https://www.openai.com"]);
  });

  it("ignores file-extension-looking strings that are not real domains", () => {
    expect(extractUrls("update file.txt and image.png")).toEqual([]);
  });
});

describe("getHostname", () => {
  it("returns the hostname for valid URLs", () => {
    expect(getHostname("https://example.com/page?x=1")).toBe("example.com");
    expect(getHostname("https://www.openai.com")).toBe("www.openai.com");
  });

  it("returns the input unchanged for invalid URLs", () => {
    expect(getHostname("not a url")).toBe("not a url");
  });
});
