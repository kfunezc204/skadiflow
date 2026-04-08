import { parseEstimate } from "@/lib/timeUtils";

export type CsvTask = {
  title: string;
  estimatedMinutes?: number;
  listName?: string;
};

/**
 * Parse a CSV string into task rows.
 * Supports an optional header row with columns: title, est, list
 * If no header is detected the columns are assumed to be in that order.
 * Handles double-quoted fields and commas within quotes.
 */
export function parseCsvTasks(text: string): CsvTask[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  // Detect and skip header row
  const firstLineLower = lines[0].toLowerCase();
  const hasHeader =
    firstLineLower.includes("title") ||
    firstLineLower.includes("name") ||
    firstLineLower.includes("task");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.flatMap((line): CsvTask[] => {
    const cols = parseCsvLine(line);
    const title = cols[0]?.trim();
    if (!title) return [];

    const estRaw = cols[1]?.trim();
    const estimatedMinutes = estRaw ? (parseEstimate(estRaw) ?? undefined) : undefined;

    const listName = cols[2]?.trim() || undefined;

    return [{ title, estimatedMinutes, listName }];
  });
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Handle escaped double-quote inside a quoted field ("")
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
