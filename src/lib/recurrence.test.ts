import { describe, it, expect } from "vitest";
import { addDays, format } from "date-fns";
import { getNextDueDate } from "./recurrence";

describe("getNextDueDate", () => {
  describe("daily", () => {
    it("returns the day after the reference date", () => {
      // Wed 2026-04-15 → Thu 2026-04-16
      const next = getNextDueDate("daily", new Date(2026, 3, 15));
      expect(next).toBe("2026-04-16");
    });
  });

  describe("weekdays", () => {
    it("skips Saturday and Sunday — Friday becomes Monday", () => {
      // Fri 2026-04-17 → Mon 2026-04-20
      const next = getNextDueDate("weekdays", new Date(2026, 3, 17));
      expect(next).toBe("2026-04-20");
    });

    it("Monday becomes Tuesday", () => {
      // Mon 2026-04-13 → Tue 2026-04-14
      const next = getNextDueDate("weekdays", new Date(2026, 3, 13));
      expect(next).toBe("2026-04-14");
    });
  });

  describe("weekly", () => {
    it("adds 7 days", () => {
      // Wed 2026-04-15 → Wed 2026-04-22
      const next = getNextDueDate("weekly", new Date(2026, 3, 15));
      expect(next).toBe("2026-04-22");
    });
  });

  describe("monthly", () => {
    it("adds 1 calendar month", () => {
      // 2026-04-15 → 2026-05-15
      const next = getNextDueDate("monthly", new Date(2026, 3, 15));
      expect(next).toBe("2026-05-15");
    });

    it("clamps to last valid day when next month is shorter (Jan 31 → Feb 28)", () => {
      // 2026-01-31 → 2026-02-28 (date-fns addMonths behavior)
      const next = getNextDueDate("monthly", new Date(2026, 0, 31));
      expect(next).toBe("2026-02-28");
    });
  });

  describe("local timezone correctness (bug B5)", () => {
    // Late-evening local time must still produce the *next local calendar day*.
    // The old impl used `toISOString().split('T')[0]` which returns UTC date,
    // so for users east of UTC at late hours it would return the SAME local day.
    it("11:30 PM local input still returns next local day for daily", () => {
      const d = new Date(2026, 3, 15, 23, 30, 0); // Apr 15 23:30 local
      const expected = format(addDays(d, 1), "yyyy-MM-dd");
      expect(getNextDueDate("daily", d)).toBe(expected);
    });
  });
});
