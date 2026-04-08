import { Play, Pause, SkipForward, CheckCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTimerStore } from "@/stores/timerStore";

type Props = {
  onExit: () => void;
};

export default function TimerControls({ onExit }: Props) {
  const status = useTimerStore((s) => s.status);
  const phase = useTimerStore((s) => s.phase);
  const isMarkingDone = useTimerStore((s) => s.isMarkingDone);
  const activeSubtaskTitle = useTimerStore((s) => s.activeSubtaskTitle);
  const { pause, resume, skip, markSubtaskDone } = useTimerStore.getState();

  const isRunning = status === "running";
  const doneLabel = activeSubtaskTitle
    ? "Completar subtarea actual (D)"
    : "Marcar tarea como completada (D)";

  return (
    <div className="flex items-center gap-3">
      {/* Pause / Resume */}
      <Button
        onClick={isRunning ? pause : resume}
        title={isRunning ? "Pausar (Space)" : "Reanudar (Space)"}
        className="h-12 w-12 rounded-full bg-orange-500 hover:bg-orange-600 text-white p-0"
      >
        {isRunning ? <Pause size={20} /> : <Play size={20} />}
      </Button>

      {/* Skip */}
      <Button
        variant="outline"
        onClick={skip}
        title="Saltar intervalo (S)"
        className="h-10 w-10 rounded-full border-white/20 bg-transparent text-white/60 hover:text-white hover:bg-white/10 p-0"
      >
        <SkipForward size={16} />
      </Button>

      {/* Mark done — subtask-aware */}
      {phase === "focus" && (
        <Button
          variant="outline"
          onClick={markSubtaskDone}
          disabled={isMarkingDone}
          title={doneLabel}
          className="h-10 w-10 rounded-full border-white/20 bg-transparent text-white/60 hover:text-white hover:bg-white/10 p-0 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <CheckCheck size={16} />
        </Button>
      )}

      {/* Exit */}
      <Button
        variant="ghost"
        onClick={onExit}
        title="Salir de la sesión (Esc)"
        className="h-10 w-10 rounded-full text-white/30 hover:text-white/60 hover:bg-white/10 p-0"
      >
        <LogOut size={16} />
      </Button>
    </div>
  );
}
