import { create } from "zustand";
import { getSetting, setSetting } from "@/lib/db";

type Theme = "dark" | "light";

type SettingsState = {
  theme: Theme;
  pomodoroFocusMinutes: number;
  pomodoroShortBreakMinutes: number;
  pomodoroLongBreakMinutes: number;
  pomodoroCyclesBeforeLongBreak: number;
  weekStart: number; // 0 = Sunday, 1 = Monday
  notificationsEnabled: boolean;
  lockerDuringBreaks: boolean;
  autoStartNextPomodoro: boolean;
  onboardingCompleted: boolean;
  isLoaded: boolean;
};

type SettingsActions = {
  loadSettings: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  setLockerDuringBreaks: (val: boolean) => Promise<void>;
  setPomodoroFocusMinutes: (val: number) => Promise<void>;
  setPomodoroShortBreakMinutes: (val: number) => Promise<void>;
  setPomodoroLongBreakMinutes: (val: number) => Promise<void>;
  setPomodoroCyclesBeforeLongBreak: (val: number) => Promise<void>;
  setWeekStart: (val: number) => Promise<void>;
  setNotificationsEnabled: (val: boolean) => Promise<void>;
  setAutoStartNextPomodoro: (val: boolean) => Promise<void>;
  setOnboardingCompleted: (val: boolean) => Promise<void>;
};

export const useSettingsStore = create<SettingsState & SettingsActions>(
  (set) => ({
    theme: "dark",
    pomodoroFocusMinutes: 25,
    pomodoroShortBreakMinutes: 5,
    pomodoroLongBreakMinutes: 15,
    pomodoroCyclesBeforeLongBreak: 4,
    weekStart: 1,
    notificationsEnabled: true,
    lockerDuringBreaks: false,
    autoStartNextPomodoro: true,
    onboardingCompleted: false,
    isLoaded: false,

    loadSettings: async () => {
      const [
        theme,
        focusMin,
        shortBreakMin,
        longBreakMin,
        cycles,
        weekStart,
        notifs,
        lockerBreaks,
        autoStart,
        onboarding,
      ] = await Promise.all([
        getSetting("theme"),
        getSetting("pomodoro_focus_minutes"),
        getSetting("pomodoro_short_break_minutes"),
        getSetting("pomodoro_long_break_minutes"),
        getSetting("pomodoro_cycles_before_long_break"),
        getSetting("week_start"),
        getSetting("notifications_enabled"),
        getSetting("locker_during_breaks"),
        getSetting("auto_start_next_pomodoro"),
        getSetting("onboarding_completed"),
      ]);

      const resolvedTheme: Theme =
        theme === "light" ? "light" : "dark";

      // Apply theme to DOM
      document.documentElement.classList.toggle(
        "dark",
        resolvedTheme === "dark"
      );

      set({
        theme: resolvedTheme,
        pomodoroFocusMinutes: focusMin ? parseInt(focusMin) : 25,
        pomodoroShortBreakMinutes: shortBreakMin ? parseInt(shortBreakMin) : 5,
        pomodoroLongBreakMinutes: longBreakMin ? parseInt(longBreakMin) : 15,
        pomodoroCyclesBeforeLongBreak: cycles ? parseInt(cycles) : 4,
        weekStart: weekStart ? parseInt(weekStart) : 1,
        notificationsEnabled: notifs !== "false",
        lockerDuringBreaks: lockerBreaks === "true",
        autoStartNextPomodoro: autoStart !== "false",
        onboardingCompleted: onboarding === "true",
        isLoaded: true,
      });
    },

    setTheme: async (theme: Theme) => {
      await setSetting("theme", theme);
      document.documentElement.classList.toggle("dark", theme === "dark");
      set({ theme });
    },

    setLockerDuringBreaks: async (val: boolean) => {
      await setSetting("locker_during_breaks", String(val));
      set({ lockerDuringBreaks: val });
    },

    setPomodoroFocusMinutes: async (val: number) => {
      await setSetting("pomodoro_focus_minutes", String(val));
      set({ pomodoroFocusMinutes: val });
    },

    setPomodoroShortBreakMinutes: async (val: number) => {
      await setSetting("pomodoro_short_break_minutes", String(val));
      set({ pomodoroShortBreakMinutes: val });
    },

    setPomodoroLongBreakMinutes: async (val: number) => {
      await setSetting("pomodoro_long_break_minutes", String(val));
      set({ pomodoroLongBreakMinutes: val });
    },

    setPomodoroCyclesBeforeLongBreak: async (val: number) => {
      await setSetting("pomodoro_cycles_before_long_break", String(val));
      set({ pomodoroCyclesBeforeLongBreak: val });
    },

    setWeekStart: async (val: number) => {
      await setSetting("week_start", String(val));
      set({ weekStart: val });
    },

    setNotificationsEnabled: async (val: boolean) => {
      await setSetting("notifications_enabled", String(val));
      set({ notificationsEnabled: val });
    },

    setAutoStartNextPomodoro: async (val: boolean) => {
      await setSetting("auto_start_next_pomodoro", String(val));
      set({ autoStartNextPomodoro: val });
    },

    setOnboardingCompleted: async (val: boolean) => {
      await setSetting("onboarding_completed", String(val));
      set({ onboardingCompleted: val });
    },
  })
);
