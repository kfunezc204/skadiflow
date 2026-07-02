/**
 * Parses an estimate string into minutes.
 * Accepts: "30m", "1h", "1.5h", "1.5hr", "1h30m", "90" (bare number = minutes)
 */
export function parseEstimate(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // e.g. "1h30m" or "1h 30m"
  const combined = trimmed.match(/^(\d+(?:\.\d+)?)\s*h(?:r|ours?)?\s*(\d+)\s*m(?:in(?:utes?)?)?$/);
  if (combined) {
    return Math.round(parseFloat(combined[1]) * 60 + parseInt(combined[2]));
  }

  // e.g. "1.5h", "1h", "2hr"
  const hoursOnly = trimmed.match(/^(\d+(?:\.\d+)?)\s*h(?:r|ours?)?$/);
  if (hoursOnly) {
    return Math.round(parseFloat(hoursOnly[1]) * 60);
  }

  // e.g. "30m", "45min"
  const minutesOnly = trimmed.match(/^(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?$/);
  if (minutesOnly) {
    return Math.round(parseFloat(minutesOnly[1]));
  }

  // bare number → minutes
  const bare = trimmed.match(/^(\d+)$/);
  if (bare) {
    return parseInt(bare[1]);
  }

  return null;
}

/**
 * Formats a minute count into a human-readable string.
 * e.g. 90 → "1h 30m", 45 → "45m", 60 → "1h"
 */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Formats a total number of seconds into MM:SS display string.
 * e.g. 1500 → "25:00", 90 → "01:30"
 */
export function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Extracts an estimate from the end of a task title string.
 * e.g. "Design homepage 45m" → { title: "Design homepage", est: 45 }
 * Returns null for est if no pattern found at end.
 */
export function extractEstFromTitle(raw: string): { title: string; est: number | null } {
  const trimmed = raw.trim();
  // Match trailing estimate token (e.g. "45m", "1h", "1.5h", "1h30m").
  // An explicit unit (h/m) is required — a trailing bare number ("Comprar 2")
  // is part of the title, not an estimate.
  const estPattern = /\s+(\d+(?:\.\d+)?\s*h(?:r|ours?)?\s*(?:\d+\s*m(?:in(?:utes?)?)?)|\d+(?:\.\d+)?\s*h(?:r|ours?)?|\d+(?:\.\d+)?\s*m(?:in(?:utes?)?)?)$/i;
  const match = trimmed.match(estPattern);
  if (match) {
    const est = parseEstimate(match[1]);
    if (est !== null) {
      return { title: trimmed.slice(0, match.index).trim(), est };
    }
  }
  return { title: trimmed, est: null };
}
