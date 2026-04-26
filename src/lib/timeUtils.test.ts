import { describe, it, expect } from "vitest";
import {
  parseEstimate,
  formatMinutes,
  formatSeconds,
  extractEstFromTitle,
} from "./timeUtils";

describe("parseEstimate", () => {
  it("parses bare numbers as minutes", () => {
    expect(parseEstimate("90")).toBe(90);
  });

  it("parses minutes suffix variants", () => {
    expect(parseEstimate("30m")).toBe(30);
    expect(parseEstimate("45min")).toBe(45);
    expect(parseEstimate("15 minutes")).toBe(15);
  });

  it("parses hour suffix variants", () => {
    expect(parseEstimate("1h")).toBe(60);
    expect(parseEstimate("2hr")).toBe(120);
    expect(parseEstimate("1.5h")).toBe(90);
  });

  it("parses combined hours and minutes", () => {
    expect(parseEstimate("1h30m")).toBe(90);
    expect(parseEstimate("2h 15m")).toBe(135);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(parseEstimate("  1H  ")).toBe(60);
  });

  it("returns null for invalid input", () => {
    expect(parseEstimate("")).toBeNull();
    expect(parseEstimate("abc")).toBeNull();
    expect(parseEstimate("1d")).toBeNull();
  });
});

describe("formatMinutes", () => {
  it("returns 0m for non-positive values", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(-5)).toBe("0m");
  });

  it("formats minutes only when under an hour", () => {
    expect(formatMinutes(45)).toBe("45m");
  });

  it("formats whole hours without minute suffix", () => {
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(120)).toBe("2h");
  });

  it("combines hours and minutes when both present", () => {
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(formatMinutes(135)).toBe("2h 15m");
  });
});

describe("formatSeconds", () => {
  it("renders MM:SS with zero-padding", () => {
    expect(formatSeconds(1500)).toBe("25:00");
    expect(formatSeconds(90)).toBe("01:30");
    expect(formatSeconds(5)).toBe("00:05");
  });

  it("clamps negative values to 00:00", () => {
    expect(formatSeconds(-10)).toBe("00:00");
  });

  it("floors fractional seconds", () => {
    expect(formatSeconds(59.9)).toBe("00:59");
  });
});

describe("extractEstFromTitle", () => {
  it("strips trailing estimate from title", () => {
    expect(extractEstFromTitle("Design homepage 45m")).toEqual({
      title: "Design homepage",
      est: 45,
    });
  });

  it("recognizes hour and combined formats", () => {
    expect(extractEstFromTitle("Write report 1h30m")).toEqual({
      title: "Write report",
      est: 90,
    });
    expect(extractEstFromTitle("Quick task 1h")).toEqual({
      title: "Quick task",
      est: 60,
    });
  });

  it("treats trailing bare number as minutes estimate", () => {
    expect(extractEstFromTitle("Sync 30")).toEqual({
      title: "Sync",
      est: 30,
    });
  });

  it("leaves title intact when no trailing estimate is present", () => {
    expect(extractEstFromTitle("Refactor login flow")).toEqual({
      title: "Refactor login flow",
      est: null,
    });
  });
});
