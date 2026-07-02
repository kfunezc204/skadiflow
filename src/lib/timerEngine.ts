/**
 * Pure wall-clock timer engine.
 *
 * The single source of truth for "how much time is left" is a set of epoch-ms
 * timestamps — never a decremented counter. Callers pass `nowMs` explicitly, so
 * the engine is immune to setInterval throttling, machine suspend, and drift,
 * and is fully testable with a fake clock.
 */

export type PhaseClock = {
  /** Configured length of the phase in seconds. */
  durationSeconds: number;
  /** Epoch ms when the phase started. */
  startedAtMs: number;
  /** Epoch ms when the current pause began, or null while running. */
  pausedAtMs: number | null;
  /** Total ms spent paused within this phase (excluding an ongoing pause). */
  pausedAccumMs: number;
};

export function startPhase(durationSeconds: number, nowMs: number): PhaseClock {
  return {
    durationSeconds,
    startedAtMs: nowMs,
    pausedAtMs: null,
    pausedAccumMs: 0,
  };
}

export function pause(clock: PhaseClock, nowMs: number): PhaseClock {
  if (clock.pausedAtMs !== null) return clock;
  return { ...clock, pausedAtMs: nowMs };
}

export function resume(clock: PhaseClock, nowMs: number): PhaseClock {
  if (clock.pausedAtMs === null) return clock;
  return {
    ...clock,
    pausedAtMs: null,
    pausedAccumMs: clock.pausedAccumMs + (nowMs - clock.pausedAtMs),
  };
}

/** Active (non-paused) seconds since the phase started. Not capped at the duration. */
export function elapsedSeconds(clock: PhaseClock, nowMs: number): number {
  const end = clock.pausedAtMs ?? nowMs;
  const activeMs = end - clock.startedAtMs - clock.pausedAccumMs;
  return Math.max(0, Math.floor(activeMs / 1000));
}

export function remainingSeconds(clock: PhaseClock, nowMs: number): number {
  return Math.max(0, clock.durationSeconds - elapsedSeconds(clock, nowMs));
}

export function isComplete(clock: PhaseClock, nowMs: number): boolean {
  return elapsedSeconds(clock, nowMs) >= clock.durationSeconds;
}

/**
 * Minutes to record for a session that began when the phase had
 * `sessionStartElapsedSeconds` of active time elapsed. Measured in phase-time
 * (pauses excluded) and capped at the phase duration, so a phase-end observed
 * hours late (suspend, throttling) never inflates the recorded time.
 */
export function sessionMinutes(
  sessionStartElapsedSeconds: number,
  clock: PhaseClock,
  nowMs: number
): number {
  const endElapsed = Math.min(elapsedSeconds(clock, nowMs), clock.durationSeconds);
  return Math.max(0, Math.round((endElapsed - sessionStartElapsedSeconds) / 60));
}
