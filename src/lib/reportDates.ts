import { format, subDays, parseISO } from "date-fns";

/**
 * Pure report-date helpers. Day keys are local "yyyy-MM-dd" strings (the SQL
 * layer buckets with `localtime`, so keys arriving here are already local days).
 * "Today" is always injected so this module is clock-independent and testable.
 */

/**
 * Length of the streak of consecutive days ending today or yesterday.
 * `dates` are local day keys, in any order, possibly with duplicates.
 */
export function calcStreak(dates: string[], today: Date): number {
  if (dates.length === 0) return 0;
  const sorted = [...new Set(dates)].sort().reverse(); // descending
  const todayKey = format(today, "yyyy-MM-dd");
  const yesterdayKey = format(subDays(today, 1), "yyyy-MM-dd");

  // Streak must reach today or yesterday to be "active"
  if (sorted[0] !== todayKey && sorted[0] !== yesterdayKey) return 0;

  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseISO(sorted[i - 1]);
    const curr = parseISO(sorted[i]);
    const diff = Math.round((prev.getTime() - curr.getTime()) / 86_400_000);
    if (diff === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Estimate accuracy as the average of min(est, actual) / max(est, actual) per
 * task, as a 0–100 percentage. 100 = perfect estimate; over- and under-
 * estimating are penalized symmetrically, so a single outlier can't push the
 * average outside 0–100. Tasks lacking an estimate or recorded time are
 * ignored; returns null when no task qualifies.
 */
export function estimateAccuracy(
  tasks: Array<{ estimatedMinutes: number | null; actualMinutes: number }>
): number | null {
  const qualifying = tasks.filter(
    (t) => t.estimatedMinutes != null && t.estimatedMinutes > 0 && t.actualMinutes > 0
  );
  if (qualifying.length === 0) return null;
  const sum = qualifying.reduce((acc, t) => {
    const est = t.estimatedMinutes!;
    const ratio = Math.min(est, t.actualMinutes) / Math.max(est, t.actualMinutes);
    return acc + ratio;
  }, 0);
  return (sum / qualifying.length) * 100;
}
