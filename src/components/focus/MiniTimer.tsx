import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Pause, Play, Focus, Coffee } from "lucide-react";
import { useTimerStore } from "@/stores/timerStore";
import { useTaskStore } from "@/stores/taskStore";
import { formatSeconds } from "@/lib/timeUtils";

export default function MiniTimer() {
  const status = useTimerStore((s) => s.status);
  const phase = useTimerStore((s) => s.phase);
  const secondsRemaining = useTimerStore((s) => s.secondsRemaining);
  const activeTaskId = useTimerStore((s) => s.activeTaskId);
  const { pause, resume } = useTimerStore.getState();

  const activeTask = useTaskStore((s) => s.tasks.find((t) => t.id === activeTaskId));
  const navigate = useNavigate();

  if (status === "idle") {
    return (
      <p className="text-[10px] text-white/20 text-center">SkadiFlow v0.1</p>
    );
  }

  const isRunning = status === "running";
  const isFocus = phase === "focus";
  const PhaseIcon = isFocus ? Focus : Coffee;
  const timeColor = isFocus ? "text-orange-500" : "text-blue-400";

  return (
    <button
      onClick={() => navigate("/focus")}
      className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors group"
      title="Open Focus Mode"
    >
      {/* Pulse dot */}
      <div className="relative flex-shrink-0">
        {isRunning && (
          <motion.span
            className={`absolute inset-0 rounded-full ${isFocus ? "bg-orange-500" : "bg-blue-400"} opacity-40`}
            animate={{ scale: [1, 1.8, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <PhaseIcon size={12} className={`relative ${timeColor}`} />
      </div>

      {/* MM:SS */}
      <span className={`font-mono text-xs font-semibold tabular-nums ${timeColor} flex-shrink-0`}>
        {formatSeconds(secondsRemaining)}
      </span>

      {/* Task title */}
      {activeTask && (
        <span className="flex-1 truncate text-[10px] text-white/40 min-w-0">
          {activeTask.title}
        </span>
      )}

      {/* Pause/Resume button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          isRunning ? pause() : resume();
        }}
        className="flex-shrink-0 p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {isRunning ? <Pause size={10} /> : <Play size={10} />}
      </button>
    </button>
  );
}
