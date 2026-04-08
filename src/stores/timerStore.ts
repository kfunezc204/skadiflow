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
import { broadcastTimerState } from "@/lib/timerBridge";

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
  isLockerEnabled: boolean;
  taskElapsedFocusSeconds: number;
  activeSubtaskIndex: number;
  activeSubtaskTitle: string | null;
  isExtraTime: boolean;
  isTrayMinimized: boolean;
};

type TimerActions = {
  startFocusSession: (taskIds: string[], enableLocker?: boolean) => Promise<void>;
  tick: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  skip: () => Promise<void>;
  markDone: () => Promise<void>;
  nextPhase: () => Promise<void>;
  endSession: () => Promise<void>;
  persistState: () => Promise<void>;
  loadPersistedTimer: () => Promise<void>;
  broadcastCurrentState: () => Promise<void>;
  initTimerActionListener: () => Promise<() => void>;
  minimizeFocusToTray: () => Promise<void>;
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

async function activateLocker() {
  try {
    const { useLockerStore } = await import("@/stores/lockerStore");
    const domains = useLockerStore.getState().blockedDomains;
    if (domains.length > 0) {
      await invoke("activate_locker", { domains });
    }
  } catch (e) {
    console.warn("Locker activation failed:", e);
    toast.error("Website blocker failed — run SkadiFlow as administrator");
  }
}

async function syncTaskActualMinutes(taskId: string | null) {
  if (!taskId) return;
  const total = await getTaskTotalFocusMinutes(taskId);
  await dbUpdateTask(taskId, { actualMinutes: total });
  useTaskStore.getState().updateTaskInMemory(taskId, { actualMinutes: total });
}

/** Compute stable title for the current active subtask. Only called at transition points. */
function getActiveSubtaskTitle(taskId: string | null, index: number): string | null {
  if (!taskId) return null;
  const subs = useTaskStore.getState().subtasks[taskId] ?? [];
  const sub = subs.find((s, i) => i >= index && s.completedAt === null);
  return sub?.title ?? null;
}

/** Load subtasks for a task and return seeded elapsed/index to skip already-done ones. */
async function seedSubtaskProgress(taskId: string): Promise<{ taskElapsedFocusSeconds: number; activeSubtaskIndex: number }> {
  await useTaskStore.getState().loadSubtasks(taskId);
  const subs = useTaskStore.getState().subtasks[taskId] ?? [];
  let elapsed = 0;
  let index = 0;
  for (let i = 0; i < subs.length; i++) {
    if (subs[i].completedAt !== null) {
      elapsed += (subs[i].estimatedMinutes ?? 0) * 60;
      index = i + 1;
    } else {
      break;
    }
  }
  return { taskElapsedFocusSeconds: elapsed, activeSubtaskIndex: index };
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
  isLockerEnabled: false,
  taskElapsedFocusSeconds: 0,
  activeSubtaskIndex: 0,
  activeSubtaskTitle: null,
  isExtraTime: false,
  isTrayMinimized: false,

  startFocusSession: async (taskIds, enableLocker) => {
    if (taskIds.length === 0) return;
    clearIntervalSafe();

    const { useLockerStore } = await import("@/stores/lockerStore");
    const lockerState = useLockerStore.getState();
    if (!lockerState.isLoaded) await lockerState.loadBlockedDomains();
    const hasBlockedDomains = useLockerStore.getState().blockedDomains.length > 0;
    const shouldLock = (enableLocker !== false) && hasBlockedDomains;

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
      isLockerEnabled: shouldLock,
      taskElapsedFocusSeconds: 0,
      activeSubtaskIndex: 0,
      isExtraTime: false,
    });

    // Seed elapsed/index to skip already-completed subtasks
    const seed = await seedSubtaskProgress(taskIds[0]);
    if (seed.taskElapsedFocusSeconds > 0 || seed.activeSubtaskIndex > 0) {
      set(seed);
    }
    set({ activeSubtaskTitle: getActiveSubtaskTitle(taskIds[0], seed.activeSubtaskIndex) });

    startInterval();

    if (shouldLock) {
      await activateLocker();
    }

    await get().persistState();
    await get().broadcastCurrentState();

    // Auto-show floating timer and minimize main window
    try {
      const { showFloatingTimer, hideMainWindow } = await import("@/lib/windowManager");
      await showFloatingTimer();
      await hideMainWindow();
    } catch (e) {
      console.warn("Auto-show floating timer on session start failed:", e);
    }
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

    // Estimate tracking — only during focus phase
    if (state.phase === "focus") {
      const newElapsed = state.taskElapsedFocusSeconds + 1;
      const updates: Partial<TimerState> = { taskElapsedFocusSeconds: newElapsed };

      const activeTask = useTaskStore.getState().tasks.find((t) => t.id === state.activeTaskId);
      const subtaskList = state.activeTaskId
        ? (useTaskStore.getState().subtasks[state.activeTaskId] ?? [])
        : [];

      let completedTitles: string[] = [];

      if (subtaskList.length > 0) {
        let cumulativeSeconds = 0;
        let newIndex = subtaskList.length; // past all = extra time
        for (let i = 0; i < subtaskList.length; i++) {
          cumulativeSeconds += (subtaskList[i].estimatedMinutes ?? 0) * 60;
          if (newElapsed <= cumulativeSeconds) {
            newIndex = i;
            break;
          }
        }

        if (newIndex > state.activeSubtaskIndex) {
          for (let i = state.activeSubtaskIndex; i < Math.min(newIndex, subtaskList.length); i++) {
            const sub = subtaskList[i];
            if (sub.completedAt === null) {
              useTaskStore.getState().toggleSubtask(state.activeTaskId!, sub.id);
              completedTitles.push(sub.title);
            }
          }
        }

        // Guard: index may only increase — prevents concurrent ticks from reading stale index
        const rawIndex = Math.min(newIndex, subtaskList.length);
        const finalIndex = Math.max(rawIndex, state.activeSubtaskIndex);
        updates.activeSubtaskIndex = finalIndex;
        if (finalIndex !== state.activeSubtaskIndex) {
          updates.activeSubtaskTitle = getActiveSubtaskTitle(state.activeTaskId, finalIndex);
        }
        const totalEstSec = subtaskList.reduce((s, t) => s + (t.estimatedMinutes ?? 0) * 60, 0);
        updates.isExtraTime = totalEstSec > 0 && newElapsed > totalEstSec;
      } else if (activeTask?.estimatedMinutes) {
        updates.isExtraTime = newElapsed >= activeTask.estimatedMinutes * 60;
      }

      // Commit state BEFORE any async work — prevents concurrent ticks from reading stale index
      set(updates);

      // Async side-effects after state is committed
      if (completedTitles.length > 0) {
        try {
          const { playTaskCompleteChime } = await import("@/lib/audioManager");
          playTaskCompleteChime();
        } catch (e) {
          console.warn("Subtask chime failed:", e);
        }
        for (const title of completedTitles) {
          toast(`✅ "${title}" completada`);
        }
      }

      // Mid-session reminder notifications
      const { notificationsEnabled, reminderIntervalMinutes } = useSettingsStore.getState();
      if (
        notificationsEnabled &&
        reminderIntervalMinutes > 0 &&
        newElapsed > 0 &&
        newElapsed % (reminderIntervalMinutes * 60) === 0
      ) {
        const minutesIn = Math.round(newElapsed / 60);
        try {
          const { sendNotification } = await import("@tauri-apps/plugin-notification");
          await sendNotification({
            title: "Focus check-in",
            body: `${minutesIn} min in — keep going!`,
          });
        } catch (e) {
          console.warn("Reminder notification failed:", e);
        }
      }
    }

    await get().broadcastCurrentState();

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
    await get().broadcastCurrentState();
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
    await get().broadcastCurrentState();
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
          taskElapsedFocusSeconds: 0,
          activeSubtaskIndex: 0,
          isExtraTime: false,
        });
        const skipSeed = await seedSubtaskProgress(nextTask);
        if (skipSeed.taskElapsedFocusSeconds > 0 || skipSeed.activeSubtaskIndex > 0) {
          set(skipSeed);
        }
        set({ activeSubtaskTitle: getActiveSubtaskTitle(nextTask, skipSeed.activeSubtaskIndex) });
        startInterval();
        await get().persistState();
        await get().broadcastCurrentState();
      } else {
        await get().endSession();
      }
    } else {
      // Skip break → jump straight to focus
      const total = getPhaseSeconds("focus");
      const sessionId = crypto.randomUUID();
      const now = new Date().toISOString();
      await dbCreateSession(sessionId, state.activeTaskId, "focus", now);

      if (state.isLockerEnabled && !useSettingsStore.getState().lockerDuringBreaks) {
        await activateLocker();
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
      await get().broadcastCurrentState();
    }
  },

  markDone: async () => {
    const state = get();
    if (!state.activeTaskId) return;

    const completedTitle =
      useTaskStore.getState().tasks.find((t) => t.id === state.activeTaskId)?.title ?? "Tarea";

    await syncTaskActualMinutes(state.activeTaskId);
    await useTaskStore.getState().completeTask(state.activeTaskId);

    const [nextTask, ...rest] = state.taskQueue;

    // Play chime regardless of window state (AudioContext runs in background)
    try {
      const { playTaskCompleteChime } = await import("@/lib/audioManager");
      playTaskCompleteChime();
    } catch (e) {
      console.warn("Chime failed:", e);
    }

    if (!nextTask) {
      // No more tasks — endSession will show its own toast
      try {
        const { sendNotification } = await import("@tauri-apps/plugin-notification");
        await sendNotification({
          title: "🎉 ¡Sesión completa!",
          body: `"${completedTitle}" fue la última tarea.`,
        });
      } catch (e) {
        console.warn("Notification failed:", e);
      }
      await get().endSession();
      return;
    }

    const nextTitle =
      useTaskStore.getState().tasks.find((t) => t.id === nextTask)?.title ?? "Siguiente tarea";

    // System notification — visible even when minimized or in tray
    try {
      const { sendNotification } = await import("@tauri-apps/plugin-notification");
      await sendNotification({
        title: `✅ "${completedTitle}" completada`,
        body: `Ahora trabajando en: "${nextTitle}"`,
      });
    } catch (e) {
      console.warn("Notification failed:", e);
    }

    // In-app toast for when the window is visible
    toast(`✅ "${completedTitle}" lista → Ahora: "${nextTitle}"`);

    set({
      activeTaskId: nextTask,
      taskQueue: rest,
      taskElapsedFocusSeconds: 0,
      activeSubtaskIndex: 0,
      isExtraTime: false,
    });
    const doneSeed = await seedSubtaskProgress(nextTask);
    if (doneSeed.taskElapsedFocusSeconds > 0 || doneSeed.activeSubtaskIndex > 0) {
      set(doneSeed);
    }
    set({ activeSubtaskTitle: getActiveSubtaskTitle(nextTask, doneSeed.activeSubtaskIndex) });
    await get().persistState();
    await get().broadcastCurrentState();
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
      new CustomEvent("skadiflow:phase-complete", { detail: { phase: state.phase } })
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

      if (state.isLockerEnabled && !settings.lockerDuringBreaks) {
        await deactivateLockerSafe();
      }
    } else {
      // Break ended → start next focus
      const total = getPhaseSeconds("focus");

      if (settings.autoStartNextPomodoro) {
        const sessionId = crypto.randomUUID();
        const now = new Date().toISOString();
        await dbCreateSession(sessionId, state.activeTaskId, "focus", now);
        set({
          phase: "focus",
          secondsRemaining: total,
          totalSeconds: total,
          activeSessionId: sessionId,
        });
        if (state.isLockerEnabled && !settings.lockerDuringBreaks) {
          await activateLocker();
        }
      } else {
        // User must manually resume — pause at the start of the next focus interval
        set({
          phase: "focus",
          secondsRemaining: total,
          totalSeconds: total,
          activeSessionId: null,
          status: "paused",
        });
      }
    }

    // Restore window if user had minimized to tray — phase transition needs attention
    if (state.isTrayMinimized) {
      set({ isTrayMinimized: false });
      try {
        const { showMainWindow } = await import("@/lib/windowManager");
        await showMainWindow();
      } catch (e) {
        console.warn("restoreFromTray failed:", e);
      }
    }

    // Only start the interval if the timer is still running (autoStartNextPomodoro may have paused it)
    if (get().status === "running") {
      startInterval();
    }
    await get().persistState();
    await get().broadcastCurrentState();
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

    if (state.isLockerEnabled) {
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
      isLockerEnabled: false,
      taskElapsedFocusSeconds: 0,
      activeSubtaskIndex: 0,
      activeSubtaskTitle: null,
      isExtraTime: false,
      isTrayMinimized: false,
    });

    await get().broadcastCurrentState();

    // Return to main window if floating timer was showing
    try {
      const { hideFloatingTimer, showMainWindow } = await import("@/lib/windowManager");
      await hideFloatingTimer();
      await showMainWindow();
    } catch (e) {
      console.warn("Window management after endSession failed:", e);
    }
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
        setSetting("timer_task_elapsed_focus_seconds", String(state.taskElapsedFocusSeconds)),
      ].map((p) => p.catch(() => {}))
    );
  },

  loadPersistedTimer: async () => {
    try {
      const [statusVal, phaseVal, secRemVal, cycleVal, taskIdVal, queueVal, lastTickVal, elapsedVal] =
        await Promise.all([
          getSetting("timer_status"),
          getSetting("timer_phase"),
          getSetting("timer_seconds_remaining"),
          getSetting("timer_current_cycle"),
          getSetting("timer_active_task_id"),
          getSetting("timer_task_queue"),
          getSetting("timer_last_tick_at"),
          getSetting("timer_task_elapsed_focus_seconds"),
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
      const taskElapsedFocusSeconds = elapsedVal ? parseInt(elapsedVal) : 0;

      set({
        phase,
        status: "paused",
        secondsRemaining,
        totalSeconds,
        currentCycle,
        activeTaskId,
        taskQueue,
        activeSessionId: null,
        taskElapsedFocusSeconds,
      });

      // Recompute activeSubtaskIndex and isExtraTime from restored elapsed
      if (activeTaskId && taskElapsedFocusSeconds > 0) {
        try {
          await useTaskStore.getState().loadSubtasks(activeTaskId);
          const subtaskList = useTaskStore.getState().subtasks[activeTaskId] ?? [];
          if (subtaskList.length > 0) {
            let cumSec = 0;
            let idx = subtaskList.length;
            for (let i = 0; i < subtaskList.length; i++) {
              cumSec += (subtaskList[i].estimatedMinutes ?? 0) * 60;
              if (taskElapsedFocusSeconds <= cumSec) {
                idx = i;
                break;
              }
            }
            const totalEstSec = subtaskList.reduce((s, t) => s + (t.estimatedMinutes ?? 0) * 60, 0);
            const restoredIndex = Math.min(idx, subtaskList.length);
            set({
              activeSubtaskIndex: restoredIndex,
              activeSubtaskTitle: getActiveSubtaskTitle(activeTaskId, restoredIndex),
              isExtraTime: totalEstSec > 0 && taskElapsedFocusSeconds > totalEstSec,
            });
          }
        } catch (e) {
          console.warn("Could not restore subtask index:", e);
        }
      }

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

  broadcastCurrentState: async () => {
    try {
      const state = get();
      const activeTask = state.activeTaskId
        ? useTaskStore.getState().tasks.find((t) => t.id === state.activeTaskId)
        : null;
      const subtaskList = state.activeTaskId
        ? (useTaskStore.getState().subtasks[state.activeTaskId] ?? [])
        : [];

      // Derive the current subtask title live from index + list to prevent stale-value cycling
      const currentSubtaskTitle = getActiveSubtaskTitle(state.activeTaskId, state.activeSubtaskIndex);

      // Elapsed within current subtask (numeric — no flicker concern)
      let currentSubtaskElapsedSeconds = 0;
      const idx = state.activeSubtaskIndex;
      if (currentSubtaskTitle !== null && idx < subtaskList.length) {
        let preceding = 0;
        for (let i = 0; i < idx; i++) {
          preceding += (subtaskList[i].estimatedMinutes ?? 0) * 60;
        }
        currentSubtaskElapsedSeconds = Math.max(0, state.taskElapsedFocusSeconds - preceding);
      }

      const currentSubtaskEstimateSeconds =
        currentSubtaskTitle !== null && idx < subtaskList.length && subtaskList[idx]?.estimatedMinutes
          ? subtaskList[idx].estimatedMinutes! * 60
          : null;

      const doneCount = subtaskList.filter((s) => s.completedAt !== null).length;

      await broadcastTimerState({
        phase: state.phase,
        status: state.status,
        secondsRemaining: state.secondsRemaining,
        totalSeconds: state.totalSeconds,
        currentCycle: state.currentCycle,
        activeTaskId: state.activeTaskId,
        activeTaskTitle: activeTask?.title ?? null,
        cyclesBeforeLong: useSettingsStore.getState().pomodoroCyclesBeforeLongBreak,
        taskEstimateSeconds: activeTask?.estimatedMinutes ? activeTask.estimatedMinutes * 60 : null,
        taskElapsedFocusSeconds: state.taskElapsedFocusSeconds,
        isExtraTime: state.isExtraTime,
        currentSubtaskTitle,
        currentSubtaskEstimateSeconds,
        currentSubtaskElapsedSeconds,
        subtaskProgress: subtaskList.length > 0 ? { done: doneCount, total: subtaskList.length } : null,
        focusSound: useSettingsStore.getState().focusSound,
      });
    } catch {
      // Broadcast failures are non-critical — ignore
    }
  },

  initTimerActionListener: async () => {
    const { onTimerAction, onSoundChange } = await import("@/lib/timerBridge");
    const unlisten = await onTimerAction(async (action) => {
      const store = useTimerStore.getState();
      switch (action) {
        case "pause":   await store.pause();   break;
        case "resume":  await store.resume();  break;
        case "skip":    await store.skip();    break;
        case "done":    await store.markDone(); break;
        case "exit":    await store.endSession(); break;
        case "expand": {
          try {
            const { expandToMain } = await import("@/lib/windowManager");
            await expandToMain();
          } catch (e) {
            console.warn("expandToMain failed:", e);
          }
          break;
        }
        case "minimize-tray": {
          await store.minimizeFocusToTray();
          break;
        }
      }
    });

    const unlistenSound = await onSoundChange(async (sound) => {
      try {
        const { setFocusSound, focusSoundVolume } = useSettingsStore.getState();
        await setFocusSound(sound);
        const { playAmbientSound, stopAmbientSound } = await import("@/lib/audioManager");
        if (sound === "none") {
          stopAmbientSound();
        } else {
          playAmbientSound(sound, focusSoundVolume);
        }
        await useTimerStore.getState().broadcastCurrentState();
      } catch (e) {
        console.warn("Sound change from floating timer failed:", e);
      }
    });

    return () => {
      unlisten();
      unlistenSound();
    };
  },

  minimizeFocusToTray: async () => {
    set({ isTrayMinimized: true });
    try {
      const { minimizeFocusToTray } = await import("@/lib/windowManager");
      await minimizeFocusToTray();
    } catch (e) {
      console.warn("minimizeFocusToTray failed:", e);
      set({ isTrayMinimized: false });
    }
  },
}));
