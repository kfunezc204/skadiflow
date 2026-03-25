import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settingsStore";
import { toast } from "@/lib/toast";
import ShortcutModal from "@/components/layout/ShortcutModal";

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.2 },
  }),
};

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
      {title}
    </h2>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-[#2A2A2A] last:border-0">
      <div className="flex-1 mr-4">
        <p className="text-sm text-white/80">{label}</p>
        {description && (
          <p className="text-xs text-white/30 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function SettingCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg overflow-hidden">
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const {
    theme,
    pomodoroFocusMinutes,
    pomodoroShortBreakMinutes,
    pomodoroLongBreakMinutes,
    pomodoroCyclesBeforeLongBreak,
    autoStartNextPomodoro,
    notificationsEnabled,
    weekStart,
    lockerDuringBreaks,
    setTheme,
    setPomodoroFocusMinutes,
    setPomodoroShortBreakMinutes,
    setPomodoroLongBreakMinutes,
    setPomodoroCyclesBeforeLongBreak,
    setAutoStartNextPomodoro,
    setNotificationsEnabled,
    setWeekStart,
    setLockerDuringBreaks,
  } = useSettingsStore();

  const [shortcutModalOpen, setShortcutModalOpen] = useState(false);

  // Extract single value from base-ui Slider (returns number | readonly number[])
  function sliderVal(v: number | readonly number[]): number {
    return Array.isArray(v) ? (v as number[])[0] : (v as number);
  }

  // Debounced toast for slider changes
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      toast.success("Settings updated");
    }, 600);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
          <h1 className="text-xl font-bold text-white">Settings</h1>
          <p className="text-xs text-white/40 mt-0.5">Configure BlitzDesk to your workflow</p>
        </motion.div>

        {/* Appearance */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={1}>
          <SectionHeader title="Appearance" />
          <SettingCard>
            <SettingRow label="Dark Mode" description="Use dark theme across the app">
              <Switch
                checked={theme === "dark"}
                onCheckedChange={async (checked) => {
                  await setTheme(checked ? "dark" : "light");
                  toast.success("Settings updated");
                }}
              />
            </SettingRow>
          </SettingCard>
        </motion.div>

        {/* Pomodoro */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={2}>
          <SectionHeader title="Pomodoro" />
          <SettingCard>
            <SettingRow
              label="Focus Duration"
              description={`${pomodoroFocusMinutes} minutes`}
            >
              <div className="w-40">
                <Slider
                  min={5}
                  max={90}
                  step={5}
                  value={[pomodoroFocusMinutes]}
                  onValueChange={async (v) => {
                    await setPomodoroFocusMinutes(sliderVal(v));
                    debouncedToast();
                  }}
                  className="w-full"
                />
              </div>
            </SettingRow>

            <SettingRow
              label="Short Break"
              description={`${pomodoroShortBreakMinutes} minutes`}
            >
              <div className="w-40">
                <Slider
                  min={1}
                  max={30}
                  step={1}
                  value={[pomodoroShortBreakMinutes]}
                  onValueChange={async (v) => {
                    await setPomodoroShortBreakMinutes(sliderVal(v));
                    debouncedToast();
                  }}
                  className="w-full"
                />
              </div>
            </SettingRow>

            <SettingRow
              label="Long Break"
              description={`${pomodoroLongBreakMinutes} minutes`}
            >
              <div className="w-40">
                <Slider
                  min={5}
                  max={60}
                  step={5}
                  value={[pomodoroLongBreakMinutes]}
                  onValueChange={async (v) => {
                    await setPomodoroLongBreakMinutes(sliderVal(v));
                    debouncedToast();
                  }}
                  className="w-full"
                />
              </div>
            </SettingRow>

            <SettingRow
              label="Cycles Before Long Break"
              description={`${pomodoroCyclesBeforeLongBreak} focus intervals`}
            >
              <div className="w-40">
                <Slider
                  min={1}
                  max={8}
                  step={1}
                  value={[pomodoroCyclesBeforeLongBreak]}
                  onValueChange={async (v) => {
                    await setPomodoroCyclesBeforeLongBreak(sliderVal(v));
                    debouncedToast();
                  }}
                  className="w-full"
                />
              </div>
            </SettingRow>

            <SettingRow
              label="Auto-start Next Pomodoro"
              description="Automatically begin the next interval"
            >
              <Switch
                checked={autoStartNextPomodoro}
                onCheckedChange={async (checked) => {
                  await setAutoStartNextPomodoro(checked);
                  toast.success("Settings updated");
                }}
              />
            </SettingRow>
          </SettingCard>
        </motion.div>

        {/* Notifications */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3}>
          <SectionHeader title="Notifications" />
          <SettingCard>
            <SettingRow
              label="System Notifications"
              description="Alert when timer phase changes"
            >
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={async (checked) => {
                  await setNotificationsEnabled(checked);
                  toast.success("Settings updated");
                }}
              />
            </SettingRow>
          </SettingCard>
        </motion.div>

        {/* General */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={4}>
          <SectionHeader title="General" />
          <SettingCard>
            <SettingRow label="Week Starts On">
              <Label className="sr-only">Week start day</Label>
              <Select
                value={String(weekStart)}
                onValueChange={async (val) => {
                  await setWeekStart(parseInt(val ?? "1"));
                  toast.success("Settings updated");
                }}
              >
                <SelectTrigger className="w-32 h-8 text-sm bg-[#111] border-[#2A2A2A] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A1A1A] border-[#2A2A2A] text-white">
                  <SelectItem value="0" className="focus:bg-white/10 focus:text-white">
                    Sunday
                  </SelectItem>
                  <SelectItem value="1" className="focus:bg-white/10 focus:text-white">
                    Monday
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          </SettingCard>
        </motion.div>

        {/* Focus Locker */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={5}>
          <SectionHeader title="Focus Locker" />
          <SettingCard>
            <SettingRow
              label="Keep Locker Active During Breaks"
              description="Block sites during short and long breaks"
            >
              <Switch
                checked={lockerDuringBreaks}
                onCheckedChange={async (checked) => {
                  await setLockerDuringBreaks(checked);
                  toast.success("Settings updated");
                }}
              />
            </SettingRow>
          </SettingCard>
        </motion.div>

        {/* Keyboard Shortcuts */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={6}>
          <SectionHeader title="Keyboard Shortcuts" />
          <SettingCard>
            <SettingRow
              label="View All Shortcuts"
              description="Quick reference for keyboard shortcuts"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShortcutModalOpen(true)}
                className="h-8 text-xs border-[#2A2A2A] bg-transparent text-white/60 hover:text-white hover:bg-white/5"
              >
                Show shortcuts
              </Button>
            </SettingRow>
          </SettingCard>
        </motion.div>

        {/* Account */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={7}>
          <SectionHeader title="Account" />
          <SettingCard>
            <div className="px-4 py-3">
              <p className="text-sm text-white/30">
                Cloud sync coming in a future update.
              </p>
            </div>
          </SettingCard>
        </motion.div>

        {/* About */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={8}>
          <SectionHeader title="About" />
          <SettingCard>
            <SettingRow label="BlitzDesk" description="v0.1.0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.info("Auto-updates coming in a future release")}
                className="h-8 text-xs border-[#2A2A2A] bg-transparent text-white/30 disabled:cursor-default"
              >
                Check for updates
              </Button>
            </SettingRow>
          </SettingCard>
        </motion.div>
      </div>

      <ShortcutModal open={shortcutModalOpen} onClose={() => setShortcutModalOpen(false)} />
    </div>
  );
}
