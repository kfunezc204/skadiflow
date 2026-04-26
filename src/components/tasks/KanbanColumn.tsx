import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ClipboardList, Play } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import TaskCard from "./TaskCard";
import InlineTaskAdd from "./InlineTaskAdd";
import EmptyState from "@/components/layout/EmptyState";
import { type Task, type TaskStatus } from "@/stores/taskStore";
import { useTimerStore } from "@/stores/timerStore";
import { minimizeToFloating } from "@/lib/windowManager";

type Props = {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  accentColor?: string;
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: "#6B7280",
  this_week: "#3B82F6",
  today: "#F97316",
  done: "#22C55E",
};

export default function KanbanColumn({ status, title, tasks, accentColor }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const color = accentColor ?? STATUS_COLORS[status];
  const itemIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const timerStatus = useTimerStore((s) => s.status);
  const navigate = useNavigate();

  async function handleStartFocus() {
    const ids = [...tasks].sort((a, b) => a.position - b.position).map((t) => t.id);
    if (ids.length === 0) return;
    await useTimerStore.getState().startFocusSession(ids);
    navigate("/focus");
    minimizeToFloating().catch(() => {});
  }

  return (
    <div className="flex flex-col min-w-[280px] flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-sm font-semibold text-white/80">{title}</span>
          <span className="text-xs text-white/30 tabular-nums">
            {tasks.length}
          </span>
        </div>
        {status === "today" && tasks.length > 0 && timerStatus === "idle" && (
          <button
            onClick={handleStartFocus}
            className="flex items-center h-7 px-3 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white rounded-md transition-colors"
          >
            <Play size={12} className="mr-1" />
            Start Focus
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-0 rounded-lg border transition-colors ${
          isOver ? "border-orange-500/30 bg-orange-500/5" : "border-[#2A2A2A] bg-[#111111]"
        }`}
      >
        <ScrollArea className="h-full">
          <SortableContext
            items={itemIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-2 p-2">
              {tasks.length === 0 && (
                <EmptyState
                  icon={<ClipboardList size={32} />}
                  title="No tasks yet"
                  description="Add a task below"
                />
              )}
              <AnimatePresence initial={false}>
                {tasks.map((task) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                  >
                    <TaskCard
                      task={task}
                      columnStatus={status}
                      columnTasks={tasks}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              <InlineTaskAdd status={status} />
            </div>
          </SortableContext>
        </ScrollArea>
      </div>
    </div>
  );
}
