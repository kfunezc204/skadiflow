import {
  addDays,
  addWeeks,
  addMonths,
  isWeekend,
  format,
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
