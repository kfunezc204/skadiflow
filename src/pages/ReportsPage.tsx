import { useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { useReportStore } from "@/stores/reportStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { startOfWeek, endOfWeek } from "date-fns";
import DateRangePicker from "@/components/reports/DateRangePicker";
import StatsRow from "@/components/reports/StatsRow";
import TimeByListChart from "@/components/reports/TimeByListChart";
import TasksPerDayChart from "@/components/reports/TasksPerDayChart";
import SessionHistoryTable from "@/components/reports/SessionHistoryTable";
import EmptyState from "@/components/layout/EmptyState";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.25 },
  }),
};

export default function ReportsPage() {
  const { loadReport, setDateRange } = useReportStore.getState();
  const isLoaded = useReportStore((s) => s.isLoaded);
  const dateRangeFrom = useReportStore((s) => s.dateRange.from);
  const weekStart = useSettingsStore((s) => s.weekStart) as 0 | 1;
  const totalFocusMinutes = useReportStore((s) => s.stats.totalFocusMinutes);
  const tasksCompleted = useReportStore((s) => s.stats.tasksCompleted);

  useEffect(() => {
    if (!dateRangeFrom) {
      const now = new Date();
      setDateRange({
        from: startOfWeek(now, { weekStartsOn: weekStart }).toISOString(),
        to: endOfWeek(now, { weekStartsOn: weekStart }).toISOString(),
        label: "this_week",
      });
    } else {
      loadReport();
    }
  }, []); // eslint-disable-line

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 print:p-4 print:space-y-4">
      {/* Header */}
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        custom={0}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-bold text-white">Reports</h1>
          <p className="text-xs text-white/40 mt-0.5">Focus time, tasks, and productivity trends</p>
        </div>
      </motion.div>

      {/* Date Range Picker */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={1}>
        <DateRangePicker />
      </motion.div>

      {/* Stats Row */}
      <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={2}>
        <StatsRow />
      </motion.div>

      {/* Empty state when no activity */}
      {isLoaded && totalFocusMinutes === 0 && tasksCompleted === 0 ? (
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3}>
          <EmptyState
            icon={<BarChart3 size={40} />}
            title="No activity yet"
            description="Complete a focus session to see your reports"
          />
        </motion.div>
      ) : (
        <>
          {/* Charts */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={3}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            <TimeByListChart />
            <TasksPerDayChart />
          </motion.div>

          {/* Session History */}
          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={4}>
            <SessionHistoryTable />
          </motion.div>
        </>
      )}

      {/* Print styles handled via Tailwind print: variants */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
