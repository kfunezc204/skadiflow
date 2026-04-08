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
  focusBackground: string;
  focusSound: string;
  focusSoundVolume: number;
  autoOpenLinks: boolean;
  reminderIntervalMinutes: number;
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
  setFocusBackground: (val: string) => Promise<void>;
  setFocusSound: (val: string) => Promise<void>;
  setFocusSoundVolume: (val: number) => Promise<void>;
  setAutoOpenLinks: (val: boolean) => Promise<void>;
  setReminderIntervalMinutes: (val: number) => Promise<void>;
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
    focusBackground: "dark",
    focusSound: "none",
    focusSoundVolume: 50,
    autoOpenLinks: true,
    reminderIntervalMinutes: 0,
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
        focusBg,
        focusSound,
        focusSoundVol,
        autoOpenLinks,
        reminderInterval,
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
        getSetting("focus_background"),
        getSetting("focus_sound"),
        getSetting("focus_sound_volume"),
        getSetting("auto_open_links"),
        getSetting("reminder_interval_minutes"),
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
        focusBackground: focusBg || "dark",
        focusSound: focusSound || "none",
        focusSoundVolume: focusSoundVol ? parseInt(focusSoundVol) : 50,
        autoOpenLinks: autoOpenLinks !== "false",
        reminderIntervalMinutes: reminderInterval ? parseInt(reminderInterval) : 0,
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

    setFocusBackground: async (val: string) => {
      await setSetting("focus_background", val);
      set({ focusBackground: val });
    },

    setFocusSound: async (val: string) => {
      await setSetting("focus_sound", val);
      set({ focusSound: val });
    },

    setFocusSoundVolume: async (val: number) => {
      await setSetting("focus_sound_volume", String(val));
      set({ focusSoundVolume: val });
    },

    setAutoOpenLinks: async (val: boolean) => {
      await setSetting("auto_open_links", String(val));
      set({ autoOpenLinks: val });
    },

    setReminderIntervalMinutes: async (val: number) => {
      await setSetting("reminder_interval_minutes", String(val));
      set({ reminderIntervalMinutes: val });
    },
  })
);
