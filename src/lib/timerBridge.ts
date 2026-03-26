import { emit, listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { TimerPhase, TimerStatus } from "@/stores/timerStore";

export type TimerSnapshot = {
  phase: TimerPhase;
  status: TimerStatus;
  secondsRemaining: number;
  totalSeconds: number;
  currentCycle: number;
  activeTaskId: string | null;
  activeTaskTitle: string | null;
  cyclesBeforeLong: number;
  taskEstimateSeconds: number | null;
  taskElapsedFocusSeconds: number;
  isExtraTime: boolean;
  currentSubtaskTitle: string | null;
  currentSubtaskEstimateSeconds: number | null;
  currentSubtaskElapsedSeconds: number;
  subtaskProgress: { done: number; total: number } | null;
  focusSound: string;
};

export type TimerAction = "pause" | "resume" | "skip" | "done" | "expand" | "exit" | "minimize-tray";

const TIMER_STATE_EVENT = "skadiflow:timer-state";
const TIMER_ACTION_EVENT = "skadiflow:timer-action";
const SOUND_CHANGE_EVENT = "skadiflow:sound-change";

export function broadcastTimerState(snapshot: TimerSnapshot): Promise<void> {
  return emit(TIMER_STATE_EVENT, snapshot);
}

export function onTimerState(cb: (s: TimerSnapshot) => void): Promise<UnlistenFn> {
  return listen<TimerSnapshot>(TIMER_STATE_EVENT, (event) => cb(event.payload));
}

export function sendTimerAction(action: TimerAction): Promise<void> {
  return emit(TIMER_ACTION_EVENT, action);
}

export function onTimerAction(cb: (a: TimerAction) => void): Promise<UnlistenFn> {
  return listen<TimerAction>(TIMER_ACTION_EVENT, (event) => cb(event.payload));
}

export function sendSoundChange(sound: string): Promise<void> {
  return emit(SOUND_CHANGE_EVENT, sound);
}

export function onSoundChange(cb: (sound: string) => void): Promise<UnlistenFn> {
  return listen<string>(SOUND_CHANGE_EVENT, (event) => cb(event.payload));
}
