import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShell from "@/components/layout/AppShell";
import OnboardingModal from "@/components/layout/OnboardingModal";
import BoardPage from "@/pages/BoardPage";
import FocusPage from "@/pages/FocusPage";
import ReportsPage from "@/pages/ReportsPage";
import SettingsPage from "@/pages/SettingsPage";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTimerStore } from "@/stores/timerStore";

export default function App() {
  const isLoaded = useSettingsStore((s) => s.isLoaded);
  const onboardingCompleted = useSettingsStore((s) => s.onboardingCompleted);

  // Empty deps: run once on mount via getState() — avoids Zustand v5 reference instability
  useEffect(() => {
    useSettingsStore.getState().loadSettings().then(() => {
      useTimerStore.getState().loadPersistedTimer();
    });
  }, []);

  if (!isLoaded) {
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
