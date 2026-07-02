import { describe, it, expect } from "vitest";
import {
  startPhase,
  pause,
  resume,
  remainingSeconds,
  isComplete,
  elapsedSeconds,
  sessionMinutes,
} from "./timerEngine";

const T0 = 1_750_000_000_000; // fixed epoch ms — the engine never reads Date.now() itself

describe("timerEngine", () => {
  it("a freshly started phase has the full duration remaining", () => {
    const clock = startPhase(25 * 60, T0);
    expect(remainingSeconds(clock, T0)).toBe(25 * 60);
  });

  it("remaining time follows the wall clock, even across a large jump (throttled ticks / suspend)", () => {
    const clock = startPhase(25 * 60, T0);
    expect(remainingSeconds(clock, T0 + 1_000)).toBe(25 * 60 - 1);
    // 10 minutes pass with no ticks at all — the answer is still exact
    expect(remainingSeconds(clock, T0 + 10 * 60_000)).toBe(15 * 60);
  });

  it("pausing freezes the remaining time no matter how much wall time passes", () => {
    const clock = startPhase(25 * 60, T0);
    const paused = pause(clock, T0 + 5 * 60_000); // pause at minute 5
    expect(remainingSeconds(paused, T0 + 5 * 60_000)).toBe(20 * 60);
    expect(remainingSeconds(paused, T0 + 2 * 60 * 60_000)).toBe(20 * 60); // 2h later, unchanged
  });

  it("resuming continues from where the pause left off, excluding all paused time", () => {
    let clock = startPhase(25 * 60, T0);
    clock = pause(clock, T0 + 5 * 60_000);            // worked 5 min
    clock = resume(clock, T0 + 35 * 60_000);          // paused 30 min
    expect(remainingSeconds(clock, T0 + 35 * 60_000)).toBe(20 * 60);
    // 5 more minutes of work after resuming
    expect(remainingSeconds(clock, T0 + 40 * 60_000)).toBe(15 * 60);
  });

  it("survives multiple pause/resume cycles without gaining or losing time", () => {
    let clock = startPhase(25 * 60, T0);
    let now = T0;
    for (let i = 0; i < 3; i++) {
      now += 2 * 60_000; // work 2 min
      clock = pause(clock, now);
      now += 7 * 60_000; // pause 7 min
      clock = resume(clock, now);
    }
    expect(remainingSeconds(clock, now)).toBe(25 * 60 - 6 * 60); // exactly 6 min worked
  });

  it("reports completion once the duration is used up, and remaining clamps at zero", () => {
    const clock = startPhase(25 * 60, T0);
    expect(isComplete(clock, T0 + 24 * 60_000)).toBe(false);
    expect(isComplete(clock, T0 + 25 * 60_000)).toBe(true);
    // way past the end (machine slept through the phase)
    expect(isComplete(clock, T0 + 3 * 60 * 60_000)).toBe(true);
    expect(remainingSeconds(clock, T0 + 3 * 60 * 60_000)).toBe(0);
  });

  it("a paused phase is not complete even if wall time has long passed the duration", () => {
    let clock = startPhase(25 * 60, T0);
    clock = pause(clock, T0 + 60_000); // paused at minute 1
    expect(isComplete(clock, T0 + 5 * 60 * 60_000)).toBe(false);
  });
});

describe("session accounting", () => {
  it("each session records only its own span — the audit's pause/resume scenario", () => {
    // 25-min pomodoro. Session 1 starts with the phase; pause at minute 5.
    let clock = startPhase(25 * 60, T0);
    const session1Start = 0;
    const pausedAt = T0 + 5 * 60_000;
    expect(sessionMinutes(session1Start, clock, pausedAt)).toBe(5);

    clock = pause(clock, pausedAt);
    const resumedAt = pausedAt + 3 * 60_000;
    clock = resume(clock, resumedAt);

    // Session 2 starts at resume (5 min of phase elapsed); pause again 5 min later.
    const session2Start = elapsedSeconds(clock, resumedAt);
    const secondPauseAt = resumedAt + 5 * 60_000;
    // The old bug credited 10 minutes here (elapsed since phase start).
    expect(sessionMinutes(session2Start, clock, secondPauseAt)).toBe(5);
  });

  it("a session ending at phase completion is capped at the phase duration", () => {
    let clock = startPhase(25 * 60, T0);
    clock = pause(clock, T0 + 10 * 60_000);
    clock = resume(clock, T0 + 20 * 60_000);
    const session2Start = elapsedSeconds(clock, T0 + 20 * 60_000); // 10 min

    // The machine sleeps and the phase-end is only observed 2h later —
    // the session still records 15 min (25 - 10), never the wall gap.
    const observedEndAt = T0 + 2 * 60 * 60_000;
    expect(sessionMinutes(session2Start, clock, observedEndAt)).toBe(15);
  });

  it("a full uninterrupted pomodoro records the configured duration", () => {
    const clock = startPhase(25 * 60, T0);
    expect(sessionMinutes(0, clock, T0 + 25 * 60_000)).toBe(25);
  });
});
