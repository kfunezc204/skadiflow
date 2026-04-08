import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipForward, Maximize2, MonitorOff, X, CloudRain, Coffee, Wind, Music, Waves, TreePine, VolumeX } from "lucide-react";
import Marquee from "@/components/ui/Marquee";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { onTimerState, sendTimerAction, sendSoundChange } from "@/lib/timerBridge";
import type { TimerSnapshot } from "@/lib/timerBridge";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const PHASE_DOT: Record<string, string> = {
  focus: "bg-orange-500",
  short_break: "bg-blue-400",
  long_break: "bg-purple-400",
};

const SOUND_OPTIONS = [
  { value: "rain",       icon: CloudRain, label: "Rain" },
  { value: "cafe",       icon: Coffee,    label: "Cafe" },
  { value: "whitenoise", icon: Wind,      label: "White Noise" },
  { value: "lofi",       icon: Music,     label: "Lo-fi" },
  { value: "ocean",      icon: Waves,     label: "Ocean" },
  { value: "forest",     icon: TreePine,  label: "Forest" },
];

export default function FloatingTimer() {
  const [snapshot, setSnapshot] = useState<TimerSnapshot | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    if (h > 0 && h !== lastHeightRef.current) {
      lastHeightRef.current = h;
      const win = getCurrentWindow();
      win.setMinSize(new LogicalSize(340, h)).catch(console.warn);
      win.setSize(new LogicalSize(340, h)).catch(console.warn);
    }
  });

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    onTimerState((s) => { if (!cancelled) setSnapshot(s); }).then((fn) => {
      unlisten = fn;
      if (cancelled) fn(); // cleanup ran before promise resolved (React StrictMode)
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const currentSound = snapshot?.focusSound ?? "none";

  function handleSoundSelect(sound: string) {
    sendSoundChange(sound).catch(console.warn);
  }

  function handleMuteToggle() {
    sendSoundChange(currentSound === "none" ? "rain" : "none").catch(console.warn);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === " ") {
        e.preventDefault();
        if (snapshot?.status === "running") sendTimerAction("pause").catch(console.warn);
        else if (snapshot?.status === "paused") sendTimerAction("resume").catch(console.warn);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [snapshot?.status]);

  if (!snapshot || snapshot.status === "idle") return null;

  const progress =
    snapshot.totalSeconds > 0
      ? (snapshot.totalSeconds - snapshot.secondsRemaining) / snapshot.totalSeconds
      : 0;

  const phaseLabel =
    snapshot.phase === "focus"
      ? (snapshot.currentSubtaskTitle ?? snapshot.activeTaskTitle ?? "Focus time")
      : snapshot.phase === "short_break"
        ? "Short break"
        : "Long break";

  return (
    // overflow-visible: the sound menu overflows outside the card into the transparent window area
    <div ref={containerRef} className="w-[340px] select-none overflow-visible">

      {/* Card — solid bg, no backdrop-blur (blur breaks WebView2 transparent compositing) */}
      <div
        className="rounded-xl bg-[#1C1C1C] border border-white/10 flex flex-col overflow-hidden shadow-2xl"
        data-tauri-drag-region
      >
        {/* Main row */}
        <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-1" data-tauri-drag-region>
          <span
            className={`h-2 w-2 rounded-full flex-shrink-0 ${PHASE_DOT[snapshot.phase] ?? "bg-white/20"}`}
          />
          <Marquee
            text={phaseLabel}
            className="flex-1 text-[11px] text-white/70 font-medium"
            dragRegion
          />
          {snapshot.subtaskProgress && (
            <span className="text-[10px] text-white/30 flex-shrink-0 tabular-nums">
              {snapshot.subtaskProgress.done}/{snapshot.subtaskProgress.total}
            </span>
          )}
          {snapshot.isExtraTime && (
            <span className="text-[9px] font-semibold text-orange-400 flex-shrink-0 tracking-widest uppercase">
              EXTRA
            </span>
          )}
          <span className="font-mono text-sm font-bold text-white tabular-nums flex-shrink-0">
            {formatTime(snapshot.secondsRemaining)}
          </span>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={() =>
                snapshot.status === "running"
                  ? sendTimerAction("pause").catch(console.warn)
                  : sendTimerAction("resume").catch(console.warn)
              }
              className="h-6 w-6 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              {snapshot.status === "running" ? <Pause size={11} /> : <Play size={11} />}
            </button>
            <button
              onClick={() => sendTimerAction("skip").catch(console.warn)}
              className="h-6 w-6 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <SkipForward size={11} />
            </button>
            <button
              onClick={() => sendTimerAction("expand").catch(console.warn)}
              className="h-6 w-6 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Expandir ventana"
            >
              <Maximize2 size={11} />
            </button>
            <button
              onClick={() => sendTimerAction("minimize-tray").catch(console.warn)}
              className="h-6 w-6 flex items-center justify-center rounded text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Minimizar ventana al tray"
            >
              <MonitorOff size={11} />
            </button>
            <button
              onClick={() => sendTimerAction("exit").catch(console.warn)}
              className="h-6 w-6 flex items-center justify-center rounded text-white/50 hover:text-orange-400 hover:bg-white/10 transition-colors"
            >
              <X size={11} />
            </button>
          </div>
        </div>

        {/* Sound row — inline icon strip */}
        <div className="flex items-center gap-0.5 px-2.5 pb-2" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={handleMuteToggle}
            title={currentSound === "none" ? "Enable sound" : "Mute"}
            className={`h-5 w-5 flex items-center justify-center rounded transition-colors ${
              currentSound === "none" ? "text-white/20 hover:text-white/50" : "text-orange-400 hover:text-orange-300"
            }`}
          >
            <VolumeX size={10} />
          </button>
          {SOUND_OPTIONS.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              title={label}
              onClick={() => handleSoundSelect(currentSound === value ? "none" : value)}
              className={`h-5 w-5 flex items-center justify-center rounded transition-colors ${
                currentSound === value
                  ? "text-orange-400 bg-orange-500/15"
                  : "text-white/20 hover:text-white/50 hover:bg-white/5"
              }`}
            >
              <Icon size={10} />
            </button>
          ))}
        </div>

        {/* Progress bar */}
        <div className="px-3 pb-2">
          <div className="h-[3px] bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
