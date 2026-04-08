import { useEffect, useRef } from "react";
import { Routes, Route } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShell from "@/components/layout/AppShell";
import OnboardingModal from "@/components/layout/OnboardingModal";
import BoardPage from "@/pages/BoardPage";
import FocusPage from "@/pages/FocusPage";
import ReportsPage from "@/pages/ReportsPage";
import SettingsPage from "@/pages/SettingsPage";
import FloatingTimerPage from "@/pages/FloatingTimerPage";
import TaskToastPage from "@/pages/TaskToastPage";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTimerStore } from "@/stores/timerStore";

export default function App() {
  const isLoaded = useSettingsStore((s) => s.isLoaded);
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted);

  const actionListenerCleanup = useRef<(() => void) | null>(null);

  // Empty deps: run once on mount via getState() — avoids Zustand v5 reference instability
  useEffect(() => {
    useSettingsStore.getState().loadSettings().then(() => {
      // Only the main window runs the timer — floating window is a passive display
      if (window.location.pathname !== "/floating-timer" && window.location.pathname !== "/task-toast") {
        useTimerStore.getState().loadPersistedTimer();
      }
    });

    // Only the main window listens for timer actions from the floating window
    if (window.location.pathname !== "/floating-timer" && window.location.pathname !== "/task-toast") {
      useTimerStore.getState().initTimerActionListener().then((unlisten) => {
        actionListenerCleanup.current = unlisten;
      });
    }

    return () => {
      actionListenerCleanup.current?.();
    };
  }, []);

  const isFloating = window.location.pathname === "/floating-timer";
  const isTaskToast = window.location.pathname === "/task-toast";

  if (!isLoaded) {
    if (isFloating || isTaskToast) return null;
    return (
      <div className="flex h-screen items-center justify-center bg-[#1A1A1A]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          <span className="text-sm text-white/40">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      {!onboardingCompleted && <OnboardingModal />}
      <Routes>
        {/* Floating timer window — outside AppShell, no sidebar/titlebar */}
        <Route path="/floating-timer" element={<FloatingTimerPage />} />
        {/* Task completion toast window — always-on-top overlay */}
        <Route path="/task-toast" element={<TaskToastPage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<BoardPage />} />
          <Route path="/focus" element={<FocusPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </TooltipProvider>
  );
}
