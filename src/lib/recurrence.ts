import {
  addDays,
  addWeeks,
  addMonths,
  isWeekend,
  format,
  startOfDay,
  differenceInCalendarDays,
  nextMonday,
} from "date-fns";

export type RecurrenceRule = "daily" | "weekdays" | "weekly" | "monthly";

/**
 * Returns the next due date as a YYYY-MM-DD string in the user's *local* timezone.
 * Uses date-fns `format` (not `toISOString`) to avoid UTC drift on late-evening inputs.
 */
export function getNextDueDate(rule: RecurrenceRule, fromDate: Date): string {
  let next: Date;

  switch (rule) {
    case "daily":
      next = addDays(fromDate, 1);
      break;

    case "weekdays": {
      next = addDays(fromDate, 1);
      while (isWeekend(next)) {
        next = addDays(next, 1);
      }
      break;
    }

    case "weekly":
      next = addWeeks(fromDate, 1);
      break;

    case "monthly":
      next = addMonths(fromDate, 1);
      break;

    default:
      next = addDays(fromDate, 1);
  }

  return format(next, "yyyy-MM-dd");
}

/**
 * Rolls an overdue recurring task's due date forward to its next occurrence on or
 * after `today`, preserving the rule's cadence and (for weekly/monthly) the anchor's
 * weekday / day-of-month.
 *
 * Computed arithmetically — there is NO per-elapsed-day loop — so it stays O(1) no
 * matter how many days the task is overdue. This is what keeps the app fast after the
 * user goes a long time without opening it, instead of "catching up" day by day.
 *
 * If `anchor` is already on or after `today`, it is returned unchanged.
 * Returns a YYYY-MM-DD string in local time.
 */
export function getNextOccurrenceOnOrAfter(
  rule: RecurrenceRule,
  anchor: Date,
  today: Date
): string {
  const a = startOfDay(anchor);
  const t = startOfDay(today);
  if (a.getTime() >= t.getTime()) return format(a, "yyyy-MM-dd");

  let next: Date;
  switch (rule) {
    case "daily":
      // Due every day → the next occurrence on/after today is today.
      next = t;
      break;

    case "weekdays":
      // Due every weekday → today if it's a weekday, otherwise the upcoming Monday.
      next = isWeekend(t) ? nextMonday(t) : t;
      break;

    case "weekly": {
      // Keep the anchor's weekday; jump whole weeks until we land on/after today.
      const weeks = Math.ceil(differenceInCalendarDays(t, a) / 7);
      next = addWeeks(a, weeks);
      break;
    }

    case "monthly": {
      // Keep the anchor's day-of-month; jump whole months until on/after today.
      const monthsApart =
        (t.getFullYear() - a.getFullYear()) * 12 + (t.getMonth() - a.getMonth());
      next = addMonths(a, Math.max(0, monthsApart));
      // addMonths clamps short months (e.g. Jan 31 → Feb 28), which can land just
      // before today — bump one more month in that case.
      if (startOfDay(next).getTime() < t.getTime()) {
        next = addMonths(a, monthsApart + 1);
      }
      break;
    }

    default:
      next = t;
  }

  return format(next, "yyyy-MM-dd");
}
