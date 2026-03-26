import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import type { TimerPhase } from "@/stores/timerStore";

const PHASE_MESSAGES: Record<TimerPhase, { title: string; body: string }> = {
  focus: {
    title: "Break's over — back to work!",
    body: "Your focus session has started.",
  },
  short_break: {
    title: "Focus session complete!",
    body: "Time for a short break.",
  },
  long_break: {
    title: "Great work! Take a long break.",
    body: "You've completed a full Pomodoro cycle.",
  },
};

export function useFocusNotifications() {
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);

  useEffect(() => {
    async function handlePhaseComplete(e: Event) {
      if (!notificationsEnabled) return;
      const phase = (e as CustomEvent<{ phase: TimerPhase }>).detail.phase;

      // The event fires when a phase *ends*, so we notify about what comes *next*
      // focus ends → notify about the break phase that just started
      // break ends → notify that focus is starting
      // We read the new phase from the detail (the phase that just ended)
      // and craft the message about what's coming
      let nextPhase: TimerPhase;
      if (phase === "focus") {
        // We don't know if it's short or long break from here, use generic
        nextPhase = "short_break";
      } else {
        nextPhase = "focus";
      }

      const msg = PHASE_MESSAGES[nextPhase];
      try {
        const { sendNotification } = await import("@tauri-apps/plugin-notification");
        await sendNotification({ title: msg.title, body: msg.body });
      } catch (err) {
        console.warn("Notification failed:", err);
      }
    }

    window.addEventListener("skadiflow:phase-complete", handlePhaseComplete);
    return () => window.removeEventListener("skadiflow:phase-complete", handlePhaseComplete);
  }, [notificationsEnabled]);
}
