import { describe, it, expect } from "vitest";
import { addDays, format } from "date-fns";
import { getNextDueDate, getNextOccurrenceOnOrAfter } from "./recurrence";

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

describe("getNextOccurrenceOnOrAfter (roll-forward of overdue recurring tasks)", () => {
  it("leaves a non-overdue anchor unchanged", () => {
    const anchor = new Date(2026, 5, 10); // Jun 10
    const today = new Date(2026, 5, 7); // Jun 7
    expect(getNextOccurrenceOnOrAfter("daily", anchor, today)).toBe("2026-06-10");
  });

  it("daily: a month-overdue task rolls forward to today (no day-by-day catch-up)", () => {
    const anchor = new Date(2026, 4, 6); // May 6
    const today = new Date(2026, 5, 7); // Jun 7
    expect(getNextOccurrenceOnOrAfter("daily", anchor, today)).toBe("2026-06-07");
  });

  it("weekdays: rolls to today when today is a weekday", () => {
    const anchor = new Date(2026, 4, 5); // May 5
    const today = new Date(2026, 5, 8); // Mon Jun 8
    expect(getNextOccurrenceOnOrAfter("weekdays", anchor, today)).toBe("2026-06-08");
  });

  it("weekdays: rolls to the upcoming Monday when today is a weekend", () => {
    const anchor = new Date(2026, 4, 5); // May 5
    const today = new Date(2026, 5, 7); // Sun Jun 7
    expect(getNextOccurrenceOnOrAfter("weekdays", anchor, today)).toBe("2026-06-08");
  });

  it("weekly: preserves the anchor's weekday and lands on/after today", () => {
    const anchor = new Date(2026, 4, 4); // Mon May 4
    const today = new Date(2026, 5, 7); // Sun Jun 7
    const result = getNextOccurrenceOnOrAfter("weekly", anchor, today);
    expect(result).toBe("2026-06-08"); // next Monday on/after Jun 7
  });

  it("weekly: when today is exactly a multiple of 7 days after anchor, returns today", () => {
    const anchor = new Date(2026, 5, 1); // Mon Jun 1
    const today = new Date(2026, 5, 8); // Mon Jun 8 (7 days later)
    expect(getNextOccurrenceOnOrAfter("weekly", anchor, today)).toBe("2026-06-08");
  });

  it("monthly: preserves day-of-month and lands on/after today", () => {
    const anchor = new Date(2026, 0, 15); // Jan 15
    const today = new Date(2026, 2, 20); // Mar 20
    expect(getNextOccurrenceOnOrAfter("monthly", anchor, today)).toBe("2026-04-15");
  });

  it("monthly: clamps short months when rolling forward (Jan 31 anchor)", () => {
    const anchor = new Date(2026, 0, 31); // Jan 31
    const today = new Date(2026, 1, 15); // Feb 15
    expect(getNextOccurrenceOnOrAfter("monthly", anchor, today)).toBe("2026-02-28");
  });
});
