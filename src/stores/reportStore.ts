import { create } from "zustand";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay, eachDayOfInterval, format, parseISO } from "date-fns";
import {
  getCompletedTasksByDateRange,
  getFocusMinutesByList,
  getTasksCompletedPerDay,
  getFocusMinutesPerDay,
  getSessionsWithTaskNames,
  getAllFocusSessionDates,
  DELETED_LIST_ID,
  type SessionWithTask,
} from "@/lib/db";
import { calcStreak, estimateAccuracy } from "@/lib/reportDates";
import { useListStore } from "@/stores/listStore";
import { useSettingsStore } from "@/stores/settingsStore";

export type DateRangeLabel = "today" | "this_week" | "this_month" | "custom";

export type DateRange = {
  from: string; // ISO datetime string
  to: string;   // ISO datetime string
  label: DateRangeLabel;
};

export type ReportStats = {
  totalFocusMinutes: number;
  tasksCompleted: number;
  avgEstAccuracy: number | null; // percentage 0-100
  currentStreak: number;
};

export type TimeByList = {
  listId: string;
  listName: string;
  listColor: string;
  minutes: number;
};

export type DailyStats = {
  date: string; // "YYYY-MM-DD"
  count: number;
  focusMinutes: number;
};

type ReportState = {
  dateRange: DateRange;
  stats: ReportStats;
  timeByList: TimeByList[];
  tasksPerDay: DailyStats[];
  sessions: SessionWithTask[];
  isLoaded: boolean;
};

type ReportActions = {
  setDateRange: (range: DateRange) => Promise<void>;
  loadReport: () => Promise<void>;
};

function getDefaultRange(): DateRange {
  const weekStart = useSettingsStore.getState().weekStart;
  const now = new Date();
  return {
    from: startOfWeek(now, { weekStartsOn: weekStart as 0 | 1 }).toISOString(),
    to: endOfWeek(now, { weekStartsOn: weekStart as 0 | 1 }).toISOString(),
    label: "this_week",
  };
}

export const useReportStore = create<ReportState & ReportActions>((set, get) => ({
  dateRange: {
    from: "",
    to: "",
    label: "this_week",
  },
  stats: {
    totalFocusMinutes: 0,
    tasksCompleted: 0,
    avgEstAccuracy: null,
    currentStreak: 0,
  },
  timeByList: [],
  tasksPerDay: [],
  sessions: [],
  isLoaded: false,

  setDateRange: async (range) => {
    set({ dateRange: range, isLoaded: false });
    await get().loadReport();
  },

  loadReport: async () => {
    const { dateRange } = get();
    const from = dateRange.from || getDefaultRange().from;
    const to = dateRange.to || getDefaultRange().to;

    if (!get().dateRange.from) {
      const def = getDefaultRange();
      set({ dateRange: def });
    }

    const [completedTasks, focusByList, tasksPerDayRaw, focusPerDayRaw, sessions, allFocusDates] =
      await Promise.all([
        getCompletedTasksByDateRange(from, to),
        getFocusMinutesByList(from, to),
        getTasksCompletedPerDay(from, to),
        getFocusMinutesPerDay(from, to),
        getSessionsWithTaskNames(from, to),
        getAllFocusSessionDates(),
      ]);

    // Total focus minutes
    const totalFocusMinutes = sessions
      .filter((s) => s.sessionType === "focus" && s.durationMinutes != null)
      .reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);

    // EST accuracy: symmetric min/max ratio per task, always bounded 0-100
    const avgEstAccuracy = estimateAccuracy(completedTasks);

    // Streak (dates are local day keys from SQL; "today" injected here)
    const currentStreak = calcStreak(allFocusDates, new Date());

    // Enrich timeByList with list metadata
    const lists = useListStore.getState().lists;
    const timeByList: TimeByList[] = focusByList
      .map((item) => {
        if (item.listId === DELETED_LIST_ID) {
          return {
            listId: item.listId,
            listName: "(Deleted list)",
            listColor: "#6b7280",
            minutes: item.minutes,
          };
        }
        const list = lists.find((l) => l.id === item.listId);
        return {
          listId: item.listId,
          listName: list?.name ?? "(Deleted list)",
          listColor: list?.color ?? "#6b7280",
          minutes: item.minutes,
        };
      })
      .filter((item) => item.minutes > 0);

    // Build daily stats for every date in range (fill zeros)
    const fromDate = parseISO(from);
    const toDate = parseISO(to);
    const allDates = eachDayOfInterval({ start: fromDate, end: toDate });

    const countMap = new Map(tasksPerDayRaw.map((r) => [r.date, r.count]));
    const focusMap = new Map(focusPerDayRaw.map((r) => [r.date, r.focusMinutes]));

    const tasksPerDay: DailyStats[] = allDates.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      return {
        date: key,
        count: countMap.get(key) ?? 0,
        focusMinutes: focusMap.get(key) ?? 0,
      };
    });

    set({
      stats: {
        totalFocusMinutes,
        tasksCompleted: completedTasks.length,
        avgEstAccuracy,
        currentStreak,
      },
      timeByList,
      tasksPerDay,
      sessions,
      isLoaded: true,
    });
  },
}));
