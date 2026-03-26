import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Minimize2, MonitorOff, Volume2, VolumeX, CheckCircle2, Circle, CloudRain, Coffee, Wind, Music, Waves, TreePine } from "lucide-react";
import { useTimerStore } from "@/stores/timerStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTaskStore, type Task } from "@/stores/taskStore";
import TimerDisplay from "./TimerDisplay";
import TimerControls from "./TimerControls";
import TaskQueue from "./TaskQueue";
import SessionLog from "./SessionLog";
import LockerBadge from "./LockerBadge";
import { extractUrls, getHostname } from "@/lib/urlUtils";
import { playAmbientSound, stopAmbientSound, setAmbientVolume } from "@/lib/audioManager";
import { minimizeToFloating } from "@/lib/windowManager";

const FOCUS_BG: Record<string, string> = {
  dark: "bg-[#0D0D0D]",
  "gradient-warm": "bg-gradient-to-br from-[#1a0a00] via-[#0D0D0D] to-[#1a0800]",
  "gradient-cool": "bg-gradient-to-br from-[#000a1a] via-[#0D0D0D] to-[#00081a]",
  "gradient-purple": "bg-gradient-to-br from-[#0f001a] via-[#0D0D0D] to-[#10001a]",
  nature: "bg-[#060d06]",
};

const EMPTY_SUBTASKS: Task[] = [];

const SOUND_OPTIONS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "rain",       label: "Rain",        icon: <CloudRain size={13} /> },
  { key: "cafe",       label: "Cafe",        icon: <Coffee size={13} /> },
  { key: "whitenoise", label: "White Noise", icon: <Wind size={13} /> },
  { key: "lofi",       label: "Lo-fi",       icon: <Music size={13} /> },
  { key: "ocean",      label: "Ocean",       icon: <Waves size={13} /> },
  { key: "forest",     label: "Forest",      icon: <TreePine size={13} /> },
];

type Props = {
  onExit: () => void;
};

export default function FocusOverlay({ onExit }: Props) {
  const phase = useTimerStore((s) => s.phase);
  const status = useTimerStore((s) => s.status);
  const secondsRemaining = useTimerStore((s) => s.secondsRemaining);
  const totalSeconds = useTimerStore((s) => s.totalSeconds);
  const currentCycle = useTimerStore((s) => s.currentCycle);
  const activeTaskId = useTimerStore((s) => s.activeTaskId);
  const isLockerEnabled = useTimerStore((s) => s.isLockerEnabled);
  const { pause, resume } = useTimerStore.getState();

  const cyclesBeforeLong = useSettingsStore((s) => s.pomodoroCyclesBeforeLongBreak);
  const focusBackground = useSettingsStore((s) => s.focusBackground);
  const focusSound = useSettingsStore((s) => s.focusSound);
  const focusSoundVolume = useSettingsStore((s) => s.focusSoundVolume);
  const autoOpenLinks = useSettingsStore((s) => s.autoOpenLinks);
  const { setFocusSound, setFocusSoundVolume } = useSettingsStore.getState();

  const activeTask = useTaskStore((s) => s.tasks.find((t) => t.id === activeTaskId));
  const subtaskList = useTaskStore((s) => (activeTaskId ? (s.subtasks[activeTaskId] ?? EMPTY_SUBTASKS) : EMPTY_SUBTASKS));

  const taskElapsedFocusSeconds = useTimerStore((s) => s.taskElapsedFocusSeconds);
  const activeSubtaskIndex = useTimerStore((s) => s.activeSubtaskIndex);
  const isExtraTime = useTimerStore((s) => s.isExtraTime);

  // Estimate progress values
  const totalEstimateSeconds =
    subtaskList.length > 0
      ? subtaskList.reduce((sum, t) => sum + (t.estimatedMinutes ?? 0) * 60, 0)
      : (activeTask?.estimatedMinutes ?? 0) * 60;



  // Load subtasks for active task
  useEffect(() => {
    if (activeTaskId) useTaskStore.getState().loadSubtasks(activeTaskId);
  }, [activeTaskId]);

  // Track previous activeTaskId to avoid auto-opening on mount
  const prevActiveTaskIdRef = useRef<string | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (status === "running") pause();
          else if (status === "paused") resume();
          break;
        case "s":
        case "S":
          useTimerStore.getState().skip();
          break;
        case "d":
        case "D":
          if (phase === "focus") useTimerStore.getState().markDone();
          break;
        case "Escape":
          onExit();
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [status, phase, pause, resume, onExit]);

  // Auto-open URLs on task transition
  useEffect(() => {
    if (!autoOpenLinks || phase !== "focus" || !activeTaskId) return;
    if (activeTaskId === prevActiveTaskIdRef.current) return;
    prevActiveTaskIdRef.current = activeTaskId;

    const urls = extractUrls(activeTask?.title ?? "");
    if (urls.length === 0) return;

    import("@tauri-apps/plugin-shell").then(({ open }) => {
      urls.forEach((url) => open(url).catch(console.warn));
    }).catch(console.warn);
  }, [activeTaskId, autoOpenLinks, phase, activeTask?.title]);

  // Ambient sound — start/stop with session
  useEffect(() => {
    if (status === "running" && focusSound !== "none") {
      playAmbientSound(focusSound, focusSoundVolume);
    } else {
      stopAmbientSound();
    }
    return () => stopAmbientSound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, focusSound]);

  // Volume changes without restarting the track
  useEffect(() => {
    setAmbientVolume(focusSoundVolume);
  }, [focusSoundVolume]);

  // Cycle dots
  const dots = Array.from({ length: cyclesBeforeLong }, (_, i) => i + 1);

  // Extracted URLs for display
  const taskUrls = phase === "focus" ? extractUrls(activeTask?.title ?? "") : [];

  const bgClass = FOCUS_BG[focusBackground] ?? FOCUS_BG.dark;

  return (
    <div className={`fixed inset-0 z-50 flex flex-col ${bgClass}`}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <span className="text-sm font-semibold text-white/40 tracking-wider">SkadiFlow</span>

        {/* Center items */}
        <div className="flex items-center gap-3">
          {isLockerEnabled && <LockerBadge />}

          {/* Sound control — inline icon strip */}
          <div className="flex items-center gap-1">
            {/* Mute toggle */}
            <button
              onClick={() => setFocusSound(focusSound === "none" ? "rain" : "none")}
              title={focusSound === "none" ? "Enable sound" : "Mute"}
              className={`p-1.5 rounded transition-colors ${
                focusSound === "none"
                  ? "text-white/20 hover:text-white/50"
                  : "text-orange-400 hover:text-orange-300"
              }`}
            >
              {focusSound === "none" ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>

            {/* Sound icons */}
            {SOUND_OPTIONS.map(({ key, label, icon }) => (
              <button
                key={key}
                title={label}
                onClick={() => setFocusSound(focusSound === key ? "none" : key)}
                className={`p-1.5 rounded transition-colors ${
                  focusSound === key
                    ? "text-orange-400 bg-orange-500/15"
                    : "text-white/20 hover:text-white/50 hover:bg-white/5"
                }`}
              >
                {icon}
              </button>
            ))}

            {/* Volume slider — only when a sound is active */}
            <AnimatePresence>
              {focusSound !== "none" && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 80, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden flex items-center ml-1"
                >
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={focusSoundVolume}
                    onChange={(e) => setFocusSoundVolume(Number(e.target.value))}
                    className="w-20 accent-orange-500 cursor-pointer"
                    title={`Volume ${focusSoundVolume}%`}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right items */}
        <div className="flex items-center gap-3">
          {/* Minimize to tray */}
          <button
            onClick={() => useTimerStore.getState().minimizeFocusToTray().catch(console.warn)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            title="Minimizar ventana al tray"
          >
            <MonitorOff size={12} />
            <span className="hidden sm:inline">Minimizar ventana</span>
          </button>

          {/* Minimize to floating */}
          <button
            onClick={() => minimizeToFloating().catch(console.warn)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            title="Minimize to floating timer"
          >
            <Minimize2 size={12} />
            <span className="hidden sm:inline">Float</span>
          </button>

          {/* Cycle dots */}
          <div className="flex items-center gap-1.5">
            {dots.map((dot) => (
              <span
                key={dot}
                className={`h-2 w-2 rounded-full transition-colors ${
                  dot <= currentCycle ? "bg-orange-500" : "bg-white/10"
                }`}
              />
            ))}
            <span className="ml-2 text-xs text-white/30">
              Cycle {currentCycle}/{cyclesBeforeLong}
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — Task Queue */}
        <div className="hidden lg:flex w-64 flex-col border-r border-white/5 p-6">
          <TaskQueue />
        </div>

        {/* Center — Timer */}
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8">
          {/* Task title + estimate + subtasks */}
          <div className="text-center max-w-lg w-full">
            {phase === "focus" ? (
              <>
                <p className="text-xl font-medium text-white/80 leading-snug">
                  {activeTask?.title ?? "Focus time"}
                </p>

                {/* EST badge */}
                {totalEstimateSeconds > 0 && !isExtraTime && (
                  <p className="mt-1 text-xs text-white/30">
                    EST {Math.round(totalEstimateSeconds / 60)} min
                  </p>
                )}

                {/* EXTRA TIME badge */}
                <AnimatePresence>
                  {isExtraTime && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/40"
                    >
                      <span className="text-xs font-semibold text-orange-400 tracking-widest uppercase">
                        Extra Time
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* URL links */}
                {taskUrls.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 mt-2">
                    {taskUrls.map((url) => (
                      <button
                        key={url}
                        onClick={() =>
                          import("@tauri-apps/plugin-shell")
                            .then(({ open }) => open(url))
                            .catch(console.warn)
                        }
                        className="text-[10px] text-orange-500/60 hover:text-orange-400 transition-colors underline underline-offset-2"
                      >
                        {getHostname(url)}
                      </button>
                    ))}
                  </div>
                )}

                {/* Subtask list */}
                {subtaskList.length > 0 && (
                  <div className="mt-3 space-y-1 text-left max-w-xs mx-auto">
                    {subtaskList.map((sub, idx) => {
                      const isDone = sub.completedAt !== null;
                      const isCurrent = idx === activeSubtaskIndex && !isDone;
                      return (
                        <div
                          key={sub.id}
                          className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${
                            isCurrent ? "bg-white/10" : ""
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 size={13} className="text-white/20 flex-shrink-0" />
                          ) : isCurrent ? (
                            <Circle size={13} className="text-orange-400 flex-shrink-0" />
                          ) : (
                            <Circle size={13} className="text-white/15 flex-shrink-0" />
                          )}
                          <span
                            className={`text-xs flex-1 truncate ${
                              isDone ? "line-through text-white/20" : isCurrent ? "text-white/70" : "text-white/30"
                            }`}
                          >
                            {sub.title}
                          </span>
                          {sub.estimatedMinutes != null && (
                            <span className="text-[10px] text-white/20 flex-shrink-0">
                              {sub.estimatedMinutes}m
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <p className="text-lg text-white/40">
                {phase === "short_break" ? "Take a short break" : "Take a long break — you earned it"}
              </p>
            )}
          </div>

          {/* Timer */}
          <TimerDisplay
            secondsRemaining={secondsRemaining}
            totalSeconds={totalSeconds}
            phase={phase}
          />

          {/* Controls */}
          <TimerControls onExit={onExit} />

          {/* Keyboard hints */}
          <div className="flex gap-4 text-[10px] text-white/20">
            <span>Space — pause/resume</span>
            <span>S — skip</span>
            {phase === "focus" && <span>D — done</span>}
            <span>Esc — exit</span>
          </div>
        </div>

        {/* Right panel — Session Log */}
        <div className="hidden lg:flex w-64 flex-col border-l border-white/5 p-6">
          <SessionLog />
        </div>
      </div>
    </div>
  );
}
