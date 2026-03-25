import { create } from "zustand";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTaskStore } from "@/stores/taskStore";
import { toast } from "@/lib/toast";
import {
  createSession as dbCreateSession,
  endSession as dbEndSession,
  getSetting,
  setSetting,
  getTaskTotalFocusMinutes,
  updateTask as dbUpdateTask,
} from "@/lib/db";
import { invoke } from "@tauri-apps/api/core";

export type TimerPhase = "focus" | "short_break" | "long_break";
export type TimerStatus = "idle" | "running" | "paused";

export type CompletedInterval = {
  sessionId: string;
  taskId: string | null;
  taskTitle: string | null;
  phase: TimerPhase;
  durationMinutes: number;
  endedAt: string;
};

type TimerState = {
  phase: TimerPhase;
  status: TimerStatus;
  secondsRemaining: number;
  totalSeconds: number;
  currentCycle: number;
  activeTaskId: string | null;
  taskQueue: string[];
  activeSessionId: string | null;
  completedIntervals: CompletedInterval[];
  isLoaded: boolean;
  activeLockerProfileId: string | null;
};

type TimerActions = {
  startFocusSession: (taskIds: string[], lockerProfileId?: string | null) => Promise<void>;
  tick: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  skip: () => Promise<void>;
  markDone: () => Promise<void>;
  nextPhase: () => Promise<void>;
  endSession: () => Promise<void>;
  persistState: () => Promise<void>;
  loadPersistedTimer: () => Promise<void>;
  setLockerProfile: (profileId: string | null) => void;
};

// Module-scoped interval — survives route changes (store is a singleton)
let intervalId: ReturnType<typeof setInterval> | null = null;

function clearIntervalSafe() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function startInterval() {
  clearIntervalSafe();
  intervalId = setInterval(() => {
    useTimerStore.getState().tick();
  }, 1000);
}

function phaseToSessionType(phase: TimerPhase): "focus" | "break" {
  return phase === "focus" ? "focus" : "break";
}

function getPhaseSeconds(phase: TimerPhase): number {
  const s = useSettingsStore.getState();
  switch (phase) {
    case "focus":       return s.pomodoroFocusMinutes * 60;
    case "short_break": return s.pomodoroShortBreakMinutes * 60;
    case "long_break":  return s.pomodoroLongBreakMinutes * 60;
  }
}

async function activateLockerForProfile(profileId: string) {
  try {
    const { useLockerStore } = await import("@/stores/lockerStore");
    const profile = useLockerStore.getState().profiles.find((p) => p.id === profileId);
    if (profile && profile.domains.length > 0) {
      await invoke("activate_locker", { domains: profile.domains });
    }
  } catch (e) {
    console.warn("Locker activation failed:", e);
  }
}

async function syncTaskActualMinutes(taskId: string | null) {
  if (!taskId) return;
  const total = await getTaskTotalFocusMinutes(taskId);
  await dbUpdateTask(taskId, { actualMinutes: total });
  useTaskStore.getState().updateTaskInMemory(taskId, { actualMinutes: total });
}

async function deactivateLockerSafe() {
  try {
    await invoke("deactivate_locker");
  } catch (e) {
    console.warn("Locker deactivation failed:", e);
  }
}

export const useTimerStore = create<TimerState & TimerActions>((set, get) => ({
  phase: "focus",
  status: "idle",
  secondsRemaining: 25 * 60,
  totalSeconds: 25 * 60,
  currentCycle: 1,
  activeTaskId: null,
  taskQueue: [],
  activeSessionId: null,
  completedIntervals: [],
  isLoaded: false,
  activeLockerProfileId: null,

  startFocusSession: async (taskIds, lockerProfileId = null) => {
    if (taskIds.length === 0) return;
    clearIntervalSafe();

    const phase: TimerPhase = "focus";
    const total = getPhaseSeconds(phase);
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    await dbCreateSession(sessionId, taskIds[0], phase, now);

    set({
      phase,
      status: "running",
      secondsRemaining: total,
      totalSeconds: total,
      currentCycle: 1,
      activeTaskId: taskIds[0],
      taskQueue: taskIds.slice(1),
      activeSessionId: sessionId,
      completedIntervals: [],
      activeLockerProfileId: lockerProfileId,
    });

    startInterval();

    if (lockerProfileId) {
      await activateLockerForProfile(lockerProfileId);
    }

    await get().persistState();
  },

  tick: async () => {
    const state = get();
    if (state.status !== "running") return;

    const next = state.secondsRemaining - 1;
    if (next <= 0) {
      set({ secondsRemaining: 0 });
      clearIntervalSafe();
      await get().nextPhase();
      return;
    }

    set({ secondsRemaining: next });

    // Auto-complete task when elapsed time reaches its estimate
    if (state.phase === "focus" && state.activeTaskId) {
      const activeTask = useTaskStore.getState().tasks.find((t) => t.id === state.activeTaskId);
      if (activeTask?.estimatedMinutes) {
        const elapsedSeconds = state.totalSeconds - next;
        if (elapsedSeconds >= activeTask.estimatedMinutes * 60) {
          clearIntervalSafe();
          await get().markDone();
          return;
        }
      }
    }

    if (next % 30 === 0) {
      await get().persistState();
    }
  },

  pause: async () => {
    const state = get();
    if (state.status !== "running") return;

    clearIntervalSafe();

    if (state.activeSessionId) {
      const now = new Date().toISOString();
      const totalSec = getPhaseSeconds(state.phase);
      const elapsed = totalSec - state.secondsRemaining;
      await dbEndSession(state.activeSessionId, now, Math.max(1, Math.round(elapsed / 60)));
      if (state.phase === "focus") {
        await syncTaskActualMinutes(state.activeTaskId);
      }
    }

    set({ status: "paused", activeSessionId: null });
    await get().persistState();
  },

  resume: async () => {
    const state = get();
    if (state.status !== "paused") return;

    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    await dbCreateSession(sessionId, state.activeTaskId, phaseToSessionType(state.phase), now);

    set({ status: "running", activeSessionId: sessionId });
    startInterval();
    await get().persistState();
  },

  skip: async () => {
    const state = get();
    if (state.status === "idle") return;

    clearIntervalSafe();

    // End current session early
    if (state.activeSessionId) {
      const now = new Date().toISOString();
      const totalSec = getPhaseSeconds(state.phase);
      const elapsed = totalSec - state.secondsRemaining;
      await dbEndSession(state.activeSessionId, now, Math.max(1, Math.round(elapsed / 60)));
      set({ activeSessionId: null });
    }

    if (state.phase === "focus") {
      await syncTaskActualMinutes(state.activeTaskId);
      const [nextTask, ...rest] = state.taskQueue;
      if (nextTask) {
        const total = getPhaseSeconds("focus");
        const sessionId = crypto.randomUUID();
        const now = new Date().toISOString();
        await dbCreateSession(sessionId, nextTask, "focus", now);
        set({
          activeTaskId: nextTask,
          taskQueue: rest,
          secondsRemaining: total,
          totalSeconds: total,
          activeSessionId: sessionId,
          status: "running",
        });
        startInterval();
        await get().persistState();
      } else {
        await get().endSession();
      }
    } else {
      // Skip break → jump straight to focus
      const total = getPhaseSeconds("focus");
      const sessionId = crypto.randomUUID();
      const now = new Date().toISOString();
      await dbCreateSession(sessionId, state.activeTaskId, "focus", now);

      if (state.activeLockerProfileId && !useSettingsStore.getState().lockerDuringBreaks) {
        await activateLockerForProfile(state.activeLockerProfileId);
      }

      set({
        phase: "focus",
        secondsRemaining: total,
        totalSeconds: total,
        activeSessionId: sessionId,
        status: "running",
      });
      startInterval();
      await get().persistState();
    }
  },

  markDone: async () => {
    const state = get();
    if (!state.activeTaskId) return;

    await syncTaskActualMinutes(state.activeTaskId);
    await useTaskStore.getState().completeTask(state.activeTaskId);

    const [nextTask, ...rest] = state.taskQueue;
    if (!nextTask) {
      await get().endSession();
      return;
    }

    set({ activeTaskId: nextTask, taskQueue: rest });
    await get().persistState();
  },

  nextPhase: async () => {
    const state = get();
    const settings = useSettingsStore.getState();

    // Log completed interval
    if (state.activeSessionId) {
      const now = new Date().toISOString();
      const totalSec = getPhaseSeconds(state.phase);
      const elapsed = totalSec - state.secondsRemaining;
      const durationMinutes = Math.max(1, Math.round((totalSec - Math.min(state.secondsRemaining, 0)) / 60));

      // Use full duration since timer reached 0
      const fullDuration = Math.round(totalSec / 60);
      await dbEndSession(state.activeSessionId, now, fullDuration);

      const taskTitle = state.activeTaskId
        ? (useTaskStore.getState().tasks.find((t) => t.id === state.activeTaskId)?.title ?? null)
        : null;

      set((s) => ({
        completedIntervals: [
          ...s.completedIntervals,
          {
            sessionId: state.activeSessionId!,
            taskId: state.activeTaskId,
            taskTitle,
            phase: state.phase,
            durationMinutes: fullDuration,
            endedAt: now,
          },
        ],
      }));

      // Silence TS unused warning
      void elapsed;
      void durationMinutes;
    }

    // Sync actual minutes after focus phase ends
    if (state.phase === "focus") {
      await syncTaskActualMinutes(state.activeTaskId);
    }

    // Notify listeners (useFocusNotifications hook)
    window.dispatchEvent(
      new CustomEvent("blitzdesk:phase-complete", { detail: { phase: state.phase } })
    );

    if (state.phase === "focus") {
      const isLongBreak = state.currentCycle >= settings.pomodoroCyclesBeforeLongBreak;
      const nextPhase: TimerPhase = isLongBreak ? "long_break" : "short_break";
      const newCycle = isLongBreak ? 1 : state.currentCycle + 1;
      const total = getPhaseSeconds(nextPhase);
      const sessionId = crypto.randomUUID();
      const now = new Date().toISOString();

      await dbCreateSession(sessionId, null, "break", now);

      set({
        phase: nextPhase,
        secondsRemaining: total,
        totalSeconds: total,
        currentCycle: newCycle,
        activeSessionId: sessionId,
      });

      if (state.activeLockerProfileId && !settings.lockerDuringBreaks) {
        await deactivateLockerSafe();
      }
    } else {
      // Break ended → start next focus
      const total = getPhaseSeconds("focus");
      const sessionId = crypto.randomUUID();
      const now = new Date().toISOString();

      await dbCreateSession(sessionId, state.activeTaskId, "focus", now);

      set({
        phase: "focus",
        secondsRemaining: total,
        totalSeconds: total,
        activeSessionId: sessionId,
      });

      if (state.activeLockerProfileId && !settings.lockerDuringBreaks) {
        await activateLockerForProfile(state.activeLockerProfileId);
      }
    }

    startInterval();
    await get().persistState();
  },

  endSession: async () => {
    clearIntervalSafe();
    const state = get();

    if (state.activeSessionId) {
      const now = new Date().toISOString();
      const totalSec = getPhaseSeconds(state.phase);
      const elapsed = totalSec - state.secondsRemaining;
      await dbEndSession(state.activeSessionId, now, Math.max(1, Math.round(elapsed / 60)));
      if (state.phase === "focus") {
        await syncTaskActualMinutes(state.activeTaskId);
      }
    }

    if (state.activeLockerProfileId) {
      await deactivateLockerSafe();
    }

    const clearKeys = [
      "timer_status",
      "timer_phase",
      "timer_seconds_remaining",
      "timer_current_cycle",
      "timer_active_task_id",
      "timer_task_queue",
      "timer_last_tick_at",
      "timer_active_session_id",
    ];
    await Promise.all(clearKeys.map((k) => setSetting(k, "").catch(() => {})));

    toast("Focus session complete");

    set({
      phase: "focus",
      status: "idle",
      secondsRemaining: getPhaseSeconds("focus"),
      totalSeconds: getPhaseSeconds("focus"),
      currentCycle: 1,
      activeTaskId: null,
      taskQueue: [],
      activeSessionId: null,
      completedIntervals: [],
      activeLockerProfileId: null,
    });
  },

  persistState: async () => {
    const state = get();
    await Promise.all(
      [
        setSetting("timer_status", state.status),
        setSetting("timer_phase", state.phase),
        setSetting("timer_seconds_remaining", String(state.secondsRemaining)),
        setSetting("timer_current_cycle", String(state.currentCycle)),
        setSetting("timer_active_task_id", state.activeTaskId ?? ""),
        setSetting("timer_task_queue", JSON.stringify(state.taskQueue)),
        setSetting("timer_last_tick_at", new Date().toISOString()),
        setSetting("timer_active_session_id", state.activeSessionId ?? ""),
      ].map((p) => p.catch(() => {}))
    );
  },

  loadPersistedTimer: async () => {
    try {
      const [statusVal, phaseVal, secRemVal, cycleVal, taskIdVal, queueVal, lastTickVal] =
        await Promise.all([
          getSetting("timer_status"),
          getSetting("timer_phase"),
          getSetting("timer_seconds_remaining"),
          getSetting("timer_current_cycle"),
          getSetting("timer_active_task_id"),
          getSetting("timer_task_queue"),
          getSetting("timer_last_tick_at"),
        ]);

      set({ isLoaded: true });

      if (!statusVal || statusVal === "" || statusVal === "idle") return;

      const status = statusVal as TimerStatus;
      const phase = (phaseVal as TimerPhase) ?? "focus";
      let secondsRemaining = secRemVal ? parseInt(secRemVal) : getPhaseSeconds(phase);

      // Correct for wall-clock drift
      if (status === "running" && lastTickVal) {
        const elapsed = Math.floor((Date.now() - new Date(lastTickVal).getTime()) / 1000);
        secondsRemaining = Math.max(0, secondsRemaining - elapsed);
      }

      const taskQueue: string[] = queueVal ? (JSON.parse(queueVal) as string[]) : [];
      const activeTaskId = taskIdVal || null;
      const currentCycle = cycleVal ? parseInt(cycleVal) : 1;
      const totalSeconds = getPhaseSeconds(phase);

      set({
        phase,
        status: "paused",
        secondsRemaining,
        totalSeconds,
        currentCycle,
        activeTaskId,
        taskQueue,
        activeSessionId: null,
      });

      // Auto-resume if was running
      if (status === "running" && secondsRemaining > 0) {
        const sessionId = crypto.randomUUID();
        const now = new Date().toISOString();
        await dbCreateSession(sessionId, activeTaskId, phaseToSessionType(phase), now);
        set({ status: "running", activeSessionId: sessionId });
        startInterval();
        await get().persistState();
      }
    } catch (e) {
      console.error("loadPersistedTimer failed:", e);
      set({ isLoaded: true });
    }
  },

  setLockerProfile: (profileId) => {
    set({ activeLockerProfileId: profileId });
  },
}));
