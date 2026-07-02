import { create } from "zustand";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTaskStore } from "@/stores/taskStore";
import { toast } from "@/lib/toast";
import {
  createSession as dbCreateSession,
  endSession as dbEndSession,
  closeOrphanSession,
  getSetting,
  setSetting,
  getTaskTotalFocusMinutes,
  updateTask as dbUpdateTask,
} from "@/lib/db";
import { invoke } from "@tauri-apps/api/core";
import { broadcastTimerState } from "@/lib/timerBridge";
import { openUrl } from "@tauri-apps/plugin-opener";
import { extractUrls } from "@/lib/urlUtils";
import {
  type PhaseClock,
  startPhase,
  pause as pauseClock,
  resume as resumeClock,
  elapsedSeconds,
  remainingSeconds,
  isComplete,
  sessionMinutes,
} from "@/lib/timerEngine";

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
  /**
   * Wall-clock source of truth for the current phase. `secondsRemaining` and
   * `taskElapsedFocusSeconds` are values DERIVED from this clock on each tick —
   * the interval only refreshes the UI, it never counts time itself.
   */
  clock: PhaseClock | null;
  secondsRemaining: number;
  totalSeconds: number;
  currentCycle: number;
  activeTaskId: string | null;
  taskQueue: string[];
  activeSessionId: string | null;
  /** Phase-elapsed seconds at the moment the active session started (see sessionMinutes). */
  sessionStartElapsedSeconds: number;
  completedIntervals: CompletedInterval[];
  isLoaded: boolean;
  isLockerEnabled: boolean;
  /** Derived: taskSeedSeconds + (phase elapsed − taskAnchorElapsedSeconds) during focus. */
  taskElapsedFocusSeconds: number;
  /** Focus seconds the active task had accumulated before/outside the current phase. */
  taskSeedSeconds: number;
  /** Phase-elapsed seconds at the moment the active task became active within this phase. */
  taskAnchorElapsedSeconds: number;
  activeSubtaskIndex: number;
  activeSubtaskTitle: string | null;
  isExtraTime: boolean;
  isTrayMinimized: boolean;
  isMarkingDone: boolean;
};

type TimerActions = {
  startFocusSession: (taskIds: string[], enableLocker?: boolean) => Promise<void>;
  tick: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  skip: () => Promise<void>;
  markDone: () => Promise<void>;
  markSubtaskDone: () => Promise<void>;
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
let lastPersistAtMs = 0;

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

/** End the active session, crediting only its own span (never the whole phase). */
async function endActiveSession(state: TimerState, nowMs: number): Promise<void> {
  if (!state.activeSessionId || !state.clock) return;
  const duration = sessionMinutes(state.sessionStartElapsedSeconds, state.clock, nowMs);
  await dbEndSession(state.activeSessionId, new Date(nowMs).toISOString(), duration);
}

async function activateLocker() {
  try {
    const { useLockerStore } = await import("@/stores/lockerStore");
    const domains = useLockerStore.getState().blockedDomains;
    if (domains.length === 0) return;

    // Primary: local proxy (no admin needed, works immediately)
    const msg = await invoke<string>("activate_proxy_blocker", { domains });
    console.log("[Locker]", msg);

    // Secondary: try hosts file + firewall (needs admin, may fail silently)
    invoke("activate_locker", { domains }).catch((e) =>
      console.log("[Locker] hosts/firewall layer skipped (no admin):", e)
    );
  } catch (e) {
    console.warn("Locker activation failed:", e);
    toast.error("Website blocker failed to start");
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

/** Open URLs found in a task (and its first pending subtask) if autoOpenLinks is enabled. */
async function openTaskUrls(taskId: string) {
  try {
    const { autoOpenLinks } = useSettingsStore.getState();
    if (!autoOpenLinks) return;
    const storeState = useTaskStore.getState();
    const task = storeState.tasks.find((t) => t.id === taskId);
    const subs = storeState.subtasks[taskId] ?? [];
    const firstPending = subs.find((s) => s.completedAt === null);
    const text = [
      task?.title,
      task?.description,
      firstPending?.title,
      firstPending?.description,
    ].filter(Boolean).join(" ");
    const urls = extractUrls(text);
    if (urls.length === 0) return;
    for (const url of urls) {
      openUrl(url).catch((e) => console.warn("openUrl failed:", url, e));
    }
  } catch (e) {
    console.warn("openTaskUrls failed:", e);
  }
}

/** Open URLs found only in a specific subtask (used when advancing to the next subtask). */
async function openSubtaskUrls(taskId: string, subtaskIndex: number) {
  try {
    const { autoOpenLinks } = useSettingsStore.getState();
    if (!autoOpenLinks) return;
    const subs = useTaskStore.getState().subtasks[taskId] ?? [];
    const sub = subs[subtaskIndex];
    if (!sub) return;
    const text = [sub.title, sub.description].filter(Boolean).join(" ");
    const urls = extractUrls(text);
    if (urls.length === 0) return;
    for (const url of urls) {
      openUrl(url).catch((e) => console.warn("openUrl failed:", url, e));
    }
  } catch (e) {
    console.warn("openSubtaskUrls failed:", e);
  }
}

async function deactivateLockerSafe() {
  // Primary: disable proxy (always succeeds)
  try {
    await invoke("deactivate_proxy_blocker");
  } catch (e) {
    console.warn("Proxy deactivation failed:", e);
  }
  // Secondary: clean up hosts/firewall (may fail without admin)
  try {
    await invoke("deactivate_locker");
  } catch (e) {
    console.warn("Hosts/firewall cleanup skipped:", e);
  }
}

const PERSIST_KEYS = [
  "timer_status",
  "timer_phase",
  "timer_current_cycle",
  "timer_active_task_id",
  "timer_task_queue",
  "timer_last_tick_at",
  "timer_active_session_id",
  "timer_task_elapsed_focus_seconds",
  "timer_clock_duration_seconds",
  "timer_clock_started_at_ms",
  "timer_clock_paused_at_ms",
  "timer_clock_paused_accum_ms",
  // Legacy key from the decrement-based timer — kept in the clear list so
  // upgrading users don't resurrect a stale value.
  "timer_seconds_remaining",
];

export const useTimerStore = create<TimerState & TimerActions>((set, get) => ({
  phase: "focus",
  status: "idle",
  clock: null,
  secondsRemaining: 25 * 60,
  totalSeconds: 25 * 60,
  currentCycle: 1,
  activeTaskId: null,
  taskQueue: [],
  activeSessionId: null,
  sessionStartElapsedSeconds: 0,
  completedIntervals: [],
  isLoaded: false,
  isLockerEnabled: false,
  taskElapsedFocusSeconds: 0,
  taskSeedSeconds: 0,
  taskAnchorElapsedSeconds: 0,
  activeSubtaskIndex: 0,
  activeSubtaskTitle: null,
  isExtraTime: false,
  isTrayMinimized: false,
  isMarkingDone: false,

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
    const now = Date.now();

    await dbCreateSession(sessionId, taskIds[0], phase, new Date(now).toISOString());

    set({
      phase,
      status: "running",
      clock: startPhase(total, now),
      secondsRemaining: total,
      totalSeconds: total,
      currentCycle: 1,
      activeTaskId: taskIds[0],
      taskQueue: taskIds.slice(1),
      activeSessionId: sessionId,
      sessionStartElapsedSeconds: 0,
      completedIntervals: [],
      isLockerEnabled: shouldLock,
      taskElapsedFocusSeconds: 0,
      taskSeedSeconds: 0,
      taskAnchorElapsedSeconds: 0,
      activeSubtaskIndex: 0,
      isExtraTime: false,
    });

    // Seed elapsed/index to skip already-completed subtasks
    const seed = await seedSubtaskProgress(taskIds[0]);
    if (seed.taskElapsedFocusSeconds > 0 || seed.activeSubtaskIndex > 0) {
      set({
        taskElapsedFocusSeconds: seed.taskElapsedFocusSeconds,
        taskSeedSeconds: seed.taskElapsedFocusSeconds,
        activeSubtaskIndex: seed.activeSubtaskIndex,
      });
    }
    set({ activeSubtaskTitle: getActiveSubtaskTitle(taskIds[0], seed.activeSubtaskIndex) });

    await openTaskUrls(taskIds[0]);

    startInterval();

    await get().persistState();
    await get().broadcastCurrentState();

    // Show floating timer immediately before activating locker (avoid UI freeze)
    try {
      const { showFloatingTimer, hideMainWindow } = await import("@/lib/windowManager");
      await showFloatingTimer();
      await hideMainWindow();
    } catch (e) {
      console.warn("Auto-show floating timer on session start failed:", e);
    }

    // Activate locker after UI is already visible (hosts file write + async DNS flush)
    if (shouldLock) {
      activateLocker().catch(console.warn);
    }
  },

  tick: async () => {
    const state = get();
    if (state.status !== "running" || !state.clock) return;
    const now = Date.now();

    if (isComplete(state.clock, now)) {
      set({ secondsRemaining: 0 });
      clearIntervalSafe();
      await get().nextPhase();
      return;
    }

    const updates: Partial<TimerState> = {
      secondsRemaining: remainingSeconds(state.clock, now),
    };

    // Estimate tracking — only during focus phase
    if (state.phase === "focus") {
      const prevElapsed = state.taskElapsedFocusSeconds;
      const newElapsed =
        state.taskSeedSeconds + elapsedSeconds(state.clock, now) - state.taskAnchorElapsedSeconds;
      updates.taskElapsedFocusSeconds = newElapsed;

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
          toast(`✅ "${title}" completed`);
        }
      }

      // Mid-session reminder notifications. Interval-boundary CROSSING (not
      // modulo) so a throttled tick that jumps several seconds can't skip one.
      const { notificationsEnabled, reminderIntervalMinutes } = useSettingsStore.getState();
      if (notificationsEnabled && reminderIntervalMinutes > 0 && newElapsed > 0) {
        const intervalSec = reminderIntervalMinutes * 60;
        if (Math.floor(newElapsed / intervalSec) > Math.floor(prevElapsed / intervalSec)) {
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
    } else {
      set(updates);
    }

    await get().broadcastCurrentState();

    if (now - lastPersistAtMs >= 30_000) {
      await get().persistState();
    }
  },

  pause: async () => {
    const state = get();
    if (state.status !== "running" || !state.clock) return;
    const now = Date.now();

    clearIntervalSafe();

    await endActiveSession(state, now);
    if (state.activeSessionId && state.phase === "focus") {
      await syncTaskActualMinutes(state.activeTaskId);
    }

    const clock = pauseClock(state.clock, now);
    set({
      status: "paused",
      activeSessionId: null,
      clock,
      secondsRemaining: remainingSeconds(clock, now),
    });
    await get().persistState();
    await get().broadcastCurrentState();
  },

  resume: async () => {
    const state = get();
    if (state.status !== "paused" || !state.clock) return;
    const now = Date.now();

    const clock = resumeClock(state.clock, now);
    const sessionId = crypto.randomUUID();
    await dbCreateSession(
      sessionId,
      state.activeTaskId,
      phaseToSessionType(state.phase),
      new Date(now).toISOString()
    );

    // Re-activate locker when resuming into a focus phase
    if (state.phase === "focus" && state.isLockerEnabled) {
      activateLocker().catch(console.warn);
    }

    set({
      status: "running",
      activeSessionId: sessionId,
      clock,
      sessionStartElapsedSeconds: elapsedSeconds(clock, now),
    });
    startInterval();
    await get().persistState();
    await get().broadcastCurrentState();
  },

  skip: async () => {
    const state = get();
    if (state.status === "idle") return;
    const now = Date.now();

    clearIntervalSafe();

    // End current session early — credit only its own span
    if (state.activeSessionId) {
      await endActiveSession(state, now);
      set({ activeSessionId: null });
    }

    if (state.phase === "focus") {
      await syncTaskActualMinutes(state.activeTaskId);
      const [nextTask, ...rest] = state.taskQueue;
      if (nextTask) {
        const total = getPhaseSeconds("focus");
        const sessionId = crypto.randomUUID();
        await dbCreateSession(sessionId, nextTask, "focus", new Date(now).toISOString());
        set({
          activeTaskId: nextTask,
          taskQueue: rest,
          clock: startPhase(total, now),
          secondsRemaining: total,
          totalSeconds: total,
          activeSessionId: sessionId,
          sessionStartElapsedSeconds: 0,
          status: "running",
          taskElapsedFocusSeconds: 0,
          taskSeedSeconds: 0,
          taskAnchorElapsedSeconds: 0,
          activeSubtaskIndex: 0,
          isExtraTime: false,
        });
        const skipSeed = await seedSubtaskProgress(nextTask);
        if (skipSeed.taskElapsedFocusSeconds > 0 || skipSeed.activeSubtaskIndex > 0) {
          set({
            taskElapsedFocusSeconds: skipSeed.taskElapsedFocusSeconds,
            taskSeedSeconds: skipSeed.taskElapsedFocusSeconds,
            activeSubtaskIndex: skipSeed.activeSubtaskIndex,
          });
        }
        set({ activeSubtaskTitle: getActiveSubtaskTitle(nextTask, skipSeed.activeSubtaskIndex) });
        await openTaskUrls(nextTask);
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
      await dbCreateSession(sessionId, state.activeTaskId, "focus", new Date(now).toISOString());

      if (state.isLockerEnabled && !useSettingsStore.getState().lockerDuringBreaks) {
        await activateLocker();
      }

      set({
        phase: "focus",
        clock: startPhase(total, now),
        secondsRemaining: total,
        totalSeconds: total,
        activeSessionId: sessionId,
        sessionStartElapsedSeconds: 0,
        taskAnchorElapsedSeconds: 0,
        status: "running",
      });
      startInterval();
      await get().persistState();
      await get().broadcastCurrentState();
    }
  },

  markDone: async () => {
    if (get().isMarkingDone) return;
    set({ isMarkingDone: true });
    const state = get();
    if (!state.activeTaskId) {
      set({ isMarkingDone: false });
      return;
    }
    const now = Date.now();

    const completedTitle =
      useTaskStore.getState().tasks.find((t) => t.id === state.activeTaskId)?.title ?? "Task";

    // Close the running session against the finished task BEFORE completing it,
    // so its focus time is attributed to the task that actually used it.
    await endActiveSession(state, now);
    set({ activeSessionId: null });
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
          title: "🎉 Session complete!",
          body: `"${completedTitle}" was the last task.`,
        });
      } catch (e) {
        console.warn("Notification failed:", e);
      }
      set({ isMarkingDone: false });
      await get().endSession();
      return;
    }

    const nextTitle =
      useTaskStore.getState().tasks.find((t) => t.id === nextTask)?.title ?? "Next task";

    // System notification — visible even when minimized or in tray
    try {
      const { sendNotification } = await import("@tauri-apps/plugin-notification");
      await sendNotification({
        title: `✅ "${completedTitle}" completed`,
        body: `Now working on: "${nextTitle}"`,
      });
    } catch (e) {
      console.warn("Notification failed:", e);
    }

    // In-app toast for when the window is visible
    toast(`✅ "${completedTitle}" done → Now: "${nextTitle}"`);

    // The phase keeps running; a NEW session (anchored at the current phase
    // elapsed) attributes the rest of the pomodoro to the next task.
    const currentElapsed = state.clock ? elapsedSeconds(state.clock, now) : 0;
    const sessionId = crypto.randomUUID();
    await dbCreateSession(sessionId, nextTask, "focus", new Date(now).toISOString());

    set({
      activeTaskId: nextTask,
      taskQueue: rest,
      activeSessionId: sessionId,
      sessionStartElapsedSeconds: currentElapsed,
      taskElapsedFocusSeconds: 0,
      taskSeedSeconds: 0,
      taskAnchorElapsedSeconds: currentElapsed,
      activeSubtaskIndex: 0,
      isExtraTime: false,
    });
    const doneSeed = await seedSubtaskProgress(nextTask);
    if (doneSeed.taskElapsedFocusSeconds > 0 || doneSeed.activeSubtaskIndex > 0) {
      set({
        taskElapsedFocusSeconds: doneSeed.taskElapsedFocusSeconds,
        taskSeedSeconds: doneSeed.taskElapsedFocusSeconds,
        activeSubtaskIndex: doneSeed.activeSubtaskIndex,
      });
    }
    set({ activeSubtaskTitle: getActiveSubtaskTitle(nextTask, doneSeed.activeSubtaskIndex) });
    await openTaskUrls(nextTask);
    set({ isMarkingDone: false });
    await get().persistState();
    await get().broadcastCurrentState();
  },

  markSubtaskDone: async () => {
    if (get().isMarkingDone) return;
    const state = get();
    if (!state.activeTaskId || state.phase !== "focus") return;

    const subtaskList = useTaskStore.getState().subtasks[state.activeTaskId] ?? [];

    // No subtasks → fall through to mark whole task done
    if (subtaskList.length === 0) {
      await get().markDone();
      return;
    }

    // Find current pending subtask at or after activeSubtaskIndex
    const pendingIdx = subtaskList.findIndex(
      (s, i) => i >= state.activeSubtaskIndex && s.completedAt === null
    );

    if (pendingIdx === -1) {
      // All subtasks already done → mark task done
      await get().markDone();
      return;
    }

    const currentSub = subtaskList[pendingIdx];

    set({ isMarkingDone: true });
    await useTaskStore.getState().toggleSubtask(state.activeTaskId, currentSub.id);

    try {
      const { playTaskCompleteChime } = await import("@/lib/audioManager");
      playTaskCompleteChime();
    } catch (e) {
      console.warn("Chime failed:", e);
    }

    toast(`✅ "${currentSub.title}" completed`);

    // Find next pending subtask (from old list — everything after pendingIdx)
    const nextPendingIdx = subtaskList.findIndex((s, i) => i > pendingIdx && s.completedAt === null);

    if (nextPendingIdx === -1) {
      // Last pending subtask completed → mark task done
      set({ isMarkingDone: false });
      await get().markDone();
      return;
    }

    // Advance elapsed so tick() doesn't re-complete the just-finished subtask.
    // Re-anchor the derived elapsed at the new floor.
    let cumulativeSeconds = 0;
    for (let i = 0; i <= pendingIdx; i++) {
      cumulativeSeconds += (subtaskList[i].estimatedMinutes ?? 0) * 60;
    }
    const now = Date.now();
    const engineElapsed = state.clock ? elapsedSeconds(state.clock, now) : 0;
    const newElapsed = Math.max(state.taskElapsedFocusSeconds, cumulativeSeconds);

    set({
      activeSubtaskIndex: nextPendingIdx,
      activeSubtaskTitle: getActiveSubtaskTitle(state.activeTaskId, nextPendingIdx),
      taskElapsedFocusSeconds: newElapsed,
      taskSeedSeconds: newElapsed,
      taskAnchorElapsedSeconds: engineElapsed,
      isExtraTime: false,
      isMarkingDone: false,
    });

    await openSubtaskUrls(state.activeTaskId, nextPendingIdx);
    await get().persistState();
    await get().broadcastCurrentState();
  },

  nextPhase: async () => {
    const state = get();
    const settings = useSettingsStore.getState();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // Log completed interval — credit only this session's span within the phase
    if (state.activeSessionId && state.clock) {
      const duration = sessionMinutes(state.sessionStartElapsedSeconds, state.clock, now);
      await dbEndSession(state.activeSessionId, nowIso, duration);

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
            durationMinutes: duration,
            endedAt: nowIso,
          },
        ],
      }));
    }

    // Fold this phase's focus time into the task's accumulated seed. The phase
    // elapsed is capped at the duration so a phase-end observed hours late
    // (suspend) doesn't inflate the task's elapsed.
    if (state.phase === "focus") {
      if (state.clock) {
        const phaseElapsed = Math.min(
          elapsedSeconds(state.clock, now),
          state.clock.durationSeconds
        );
        const finalElapsed =
          state.taskSeedSeconds + phaseElapsed - state.taskAnchorElapsedSeconds;
        set({
          taskElapsedFocusSeconds: finalElapsed,
          taskSeedSeconds: finalElapsed,
          taskAnchorElapsedSeconds: 0,
        });
      }
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

      await dbCreateSession(sessionId, null, "break", nowIso);

      set({
        phase: nextPhase,
        clock: startPhase(total, now),
        secondsRemaining: total,
        totalSeconds: total,
        currentCycle: newCycle,
        activeSessionId: sessionId,
        sessionStartElapsedSeconds: 0,
      });

      if (state.isLockerEnabled && !settings.lockerDuringBreaks) {
        await deactivateLockerSafe();
      }

      // Play descending chime to signal break time
      try {
        const { playBreakStartChime } = await import("@/lib/audioManager");
        playBreakStartChime(settings.focusSoundVolume / 100);
      } catch (e) {
        console.warn("Break chime failed:", e);
      }

      // Focus ended → break starting: bring app to front so user sees the break prompt
      try {
        const { bringMainWindowToFront, hideFloatingTimer } = await import("@/lib/windowManager");
        await hideFloatingTimer();
        set({ isTrayMinimized: false });
        await bringMainWindowToFront();
      } catch (e) {
        console.warn("breakAlert failed:", e);
      }
    } else {
      // Break ended → start next focus
      const total = getPhaseSeconds("focus");

      if (settings.autoStartNextPomodoro) {
        const sessionId = crypto.randomUUID();
        await dbCreateSession(sessionId, state.activeTaskId, "focus", nowIso);
        set({
          phase: "focus",
          clock: startPhase(total, now),
          secondsRemaining: total,
          totalSeconds: total,
          activeSessionId: sessionId,
          sessionStartElapsedSeconds: 0,
          taskAnchorElapsedSeconds: 0,
        });
        if (state.isLockerEnabled && !settings.lockerDuringBreaks) {
          await activateLocker();
        }
      } else {
        // User must manually resume — pause at the start of the next focus interval
        set({
          phase: "focus",
          clock: pauseClock(startPhase(total, now), now),
          secondsRemaining: total,
          totalSeconds: total,
          activeSessionId: null,
          sessionStartElapsedSeconds: 0,
          taskAnchorElapsedSeconds: 0,
          status: "paused",
        });
      }

      // Play ascending chime to signal focus time
      try {
        const { playFocusStartChime } = await import("@/lib/audioManager");
        playFocusStartChime(settings.focusSoundVolume / 100);
      } catch (e) {
        console.warn("Focus chime failed:", e);
      }

      // Break ended → focus starting: bring app to front so user resumes work
      try {
        const { bringMainWindowToFront, hideFloatingTimer } = await import("@/lib/windowManager");
        await hideFloatingTimer();
        set({ isTrayMinimized: false });
        await bringMainWindowToFront();
      } catch (e) {
        console.warn("focusAlert failed:", e);
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
    const now = Date.now();

    if (state.activeSessionId) {
      await endActiveSession(state, now);
      if (state.phase === "focus") {
        await syncTaskActualMinutes(state.activeTaskId);
      }
    }

    if (state.isLockerEnabled) {
      await deactivateLockerSafe();
    }

    await Promise.all(PERSIST_KEYS.map((k) => setSetting(k, "").catch(() => {})));

    toast("Focus session complete");

    set({
      phase: "focus",
      status: "idle",
      clock: null,
      secondsRemaining: getPhaseSeconds("focus"),
      totalSeconds: getPhaseSeconds("focus"),
      currentCycle: 1,
      activeTaskId: null,
      taskQueue: [],
      activeSessionId: null,
      sessionStartElapsedSeconds: 0,
      completedIntervals: [],
      isLockerEnabled: false,
      taskElapsedFocusSeconds: 0,
      taskSeedSeconds: 0,
      taskAnchorElapsedSeconds: 0,
      activeSubtaskIndex: 0,
      activeSubtaskTitle: null,
      isExtraTime: false,
      isTrayMinimized: false,
      isMarkingDone: false,
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
    lastPersistAtMs = Date.now();
    await Promise.all(
      [
        setSetting("timer_status", state.status),
        setSetting("timer_phase", state.phase),
        setSetting("timer_current_cycle", String(state.currentCycle)),
        setSetting("timer_active_task_id", state.activeTaskId ?? ""),
        setSetting("timer_task_queue", JSON.stringify(state.taskQueue)),
        setSetting("timer_last_tick_at", new Date().toISOString()),
        setSetting("timer_active_session_id", state.activeSessionId ?? ""),
        setSetting("timer_task_elapsed_focus_seconds", String(state.taskElapsedFocusSeconds)),
        setSetting("timer_clock_duration_seconds", state.clock ? String(state.clock.durationSeconds) : ""),
        setSetting("timer_clock_started_at_ms", state.clock ? String(state.clock.startedAtMs) : ""),
        setSetting("timer_clock_paused_at_ms", state.clock?.pausedAtMs != null ? String(state.clock.pausedAtMs) : ""),
        setSetting("timer_clock_paused_accum_ms", state.clock ? String(state.clock.pausedAccumMs) : ""),
      ].map((p) => p.catch(() => {}))
    );
  },

  loadPersistedTimer: async () => {
    try {
      const [
        statusVal,
        phaseVal,
        cycleVal,
        taskIdVal,
        queueVal,
        lastTickVal,
        sessionIdVal,
        elapsedVal,
        clockDurVal,
        clockStartVal,
        clockPausedAtVal,
        clockPausedAccumVal,
      ] = await Promise.all([
        getSetting("timer_status"),
        getSetting("timer_phase"),
        getSetting("timer_current_cycle"),
        getSetting("timer_active_task_id"),
        getSetting("timer_task_queue"),
        getSetting("timer_last_tick_at"),
        getSetting("timer_active_session_id"),
        getSetting("timer_task_elapsed_focus_seconds"),
        getSetting("timer_clock_duration_seconds"),
        getSetting("timer_clock_started_at_ms"),
        getSetting("timer_clock_paused_at_ms"),
        getSetting("timer_clock_paused_accum_ms"),
      ]);

      set({ isLoaded: true });

      // A crash may have left a session without an end. Close it at the last
      // persisted tick so the time worked before the crash isn't lost.
      if (sessionIdVal) {
        try {
          const orphanTaskId = await closeOrphanSession(
            sessionIdVal,
            lastTickVal || new Date().toISOString()
          );
          if (orphanTaskId) {
            await syncTaskActualMinutes(orphanTaskId);
          }
        } catch (e) {
          console.warn("Orphan session cleanup failed:", e);
        }
      }

      if (!statusVal || statusVal === "" || statusVal === "idle") return;
      // Pre-wall-clock persisted state (upgrade path) has no clock — treat as idle.
      if (!clockDurVal || !clockStartVal) return;

      const status = statusVal as TimerStatus;
      const phase = (phaseVal as TimerPhase) ?? "focus";
      const now = Date.now();

      let clock: PhaseClock = {
        durationSeconds: parseInt(clockDurVal),
        startedAtMs: parseInt(clockStartVal),
        pausedAtMs: clockPausedAtVal ? parseInt(clockPausedAtVal) : null,
        pausedAccumMs: clockPausedAccumVal ? parseInt(clockPausedAccumVal) : 0,
      };
      // If it was running when the app closed, pause it now — the user decides
      // when to resume. Wall time while closed has already been consumed by the
      // clock, exactly like the old drift correction.
      clock = pauseClock(clock, now);

      const taskQueue: string[] = queueVal ? (JSON.parse(queueVal) as string[]) : [];
      const activeTaskId = taskIdVal || null;
      const currentCycle = cycleVal ? parseInt(cycleVal) : 1;
      const taskElapsedFocusSeconds = elapsedVal ? parseInt(elapsedVal) : 0;
      const secondsRemaining = remainingSeconds(clock, now);

      set({
        phase,
        status: "paused",
        clock,
        secondsRemaining,
        totalSeconds: clock.durationSeconds,
        currentCycle,
        activeTaskId,
        taskQueue,
        activeSessionId: null,
        sessionStartElapsedSeconds: 0,
        taskElapsedFocusSeconds,
        taskSeedSeconds: taskElapsedFocusSeconds,
        taskAnchorElapsedSeconds: elapsedSeconds(clock, now),
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

      // Auto-resume if it was running when the app closed
      if (status === "running" && secondsRemaining > 0) {
        await get().resume();
      } else {
        await get().persistState();
        await get().broadcastCurrentState();
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
        case "done":         await store.markDone(); break;
        case "subtask-done": await store.markSubtaskDone(); break;
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
