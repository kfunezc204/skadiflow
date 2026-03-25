import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { LayoutDashboard, Timer, BarChart2 } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";

const STEPS = 3;

export default function OnboardingModal() {
  const [step, setStep] = useState(0);
  const {
    theme,
    pomodoroFocusMinutes,
    setTheme,
    setPomodoroFocusMinutes,
    setOnboardingCompleted,
  } = useSettingsStore();

  async function finish() {
    await setOnboardingCompleted(true);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-white max-w-md w-full mx-4 overflow-hidden">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="p-8 text-center"
            >
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center">
                  <Timer size={32} className="text-orange-500" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Welcome to BlitzDesk</h1>
              <p className="text-sm text-white/50">
                Your focused productivity workspace. Kanban boards, Pomodoro timer, and deep work — all in one place.
              </p>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="p-8"
            >
              <h2 className="text-xl font-bold text-white mb-1 text-center">How It Works</h2>
              <p className="text-xs text-white/40 mb-6 text-center">Three tools to master your day</p>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                    <LayoutDashboard size={18} className="text-white/60" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/80">Kanban Board</p>
                    <p className="text-xs text-white/40">Organize tasks across Backlog, This Week, and Today.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                    <Timer size={18} className="text-orange-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/80">Focus Mode</p>
                    <p className="text-xs text-white/40">Pomodoro timer with website blocker to eliminate distractions.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                    <BarChart2 size={18} className="text-white/60" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/80">Reports</p>
                    <p className="text-xs text-white/40">Track focus time, task completion, and productivity trends.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="p-8"
            >
              <h2 className="text-xl font-bold text-white mb-1 text-center">Quick Setup</h2>
              <p className="text-xs text-white/40 mb-6 text-center">You can change these any time in Settings</p>

              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white/80">Dark Mode</p>
                    <p className="text-xs text-white/30">Use dark theme</p>
                  </div>
                  <Switch
                    checked={theme === "dark"}
                    onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-white/80">Focus Duration</p>
                    <span className="text-xs text-orange-400">{pomodoroFocusMinutes} min</span>
                  </div>
                  <Slider
                    min={5}
                    max={60}
                    step={5}
                    value={[pomodoroFocusMinutes]}
                    onValueChange={(v) => {
                      const val = Array.isArray(v) ? (v as number[])[0] : (v as number);
                      setPomodoroFocusMinutes(val);
                    }}
                    className="w-full"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="px-8 pb-6 flex flex-col gap-4">
          {/* Dot indicators */}
          <div className="flex justify-center gap-1.5">
            {Array.from({ length: STEPS }).map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === step ? "bg-orange-500" : "bg-white/20"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={finish}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Skip
            </button>

            <Button
              onClick={() => {
                if (step < STEPS - 1) {
                  setStep(step + 1);
                } else {
                  finish();
                }
              }}
              className="bg-orange-500 hover:bg-orange-600 text-white px-6"
            >
              {step < STEPS - 1 ? "Next" : "Get Started"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
