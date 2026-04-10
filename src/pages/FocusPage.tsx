import { useState, useEffect } from "react";
import { Play, ChevronUp, ChevronDown, Timer as TimerIcon, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTimerStore } from "@/stores/timerStore";
import { useTaskStore, useTasksByColumn } from "@/stores/taskStore";
import { useListStore } from "@/stores/listStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useLockerStore } from "@/stores/lockerStore";
import FocusOverlay from "@/components/focus/FocusOverlay";
import LockerPanel from "@/components/focus/LockerPanel";
import { minimizeToFloating } from "@/lib/windowManager";
import EmptyState from "@/components/layout/EmptyState";
import { formatMinutes } from "@/lib/timeUtils";

function TaskRow({
  id,
  selected,
  order,
  total,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  id: string;
  selected: boolean;
  order: number;
  total: number;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === id));
  if (!task) return null;

  return (
    <div
      className={`group flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
        selected
          ? "border-orange-500/40 bg-orange-500/5"
          : "border-white/5 bg-[#1A1A1A] hover:border-white/10"
      }`}
      onClick={onToggle}
    >
      <span
        className={`h-4 w-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${
          selected
            ? "border-orange-500 bg-orange-500 text-white"
            : "border-white/20 bg-transparent"
        }`}
      >
        {selected && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/80 truncate">{task.title}</p>
        {task.estimatedMinutes && (
          <span className="text-[10px] text-white/30">{formatMinutes(task.estimatedMinutes)}</span>
        )}
      </div>

      {selected && (
        <span className="text-[10px] text-orange-500/60 mr-1">#{order}</span>
      )}

      {selected && (
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            disabled={order <= 1}
            className="p-0.5 rounded text-white/30 hover:text-white/60 disabled:opacity-20"
          >
            <ChevronUp size={10} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            disabled={order >= total}
            className="p-0.5 rounded text-white/30 hover:text-white/60 disabled:opacity-20"
          >
            <ChevronDown size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function FocusPage() {
  const status = useTimerStore((s) => s.status);
  const { startFocusSession, endSession } = useTimerStore.getState();

  const selectedListId = useListStore((s) => s.selectedListId);
  const todayTasks = useTasksByColumn("today", selectedListId);
  const pomodoroFocusMinutes = useSettingsStore((s) => s.pomodoroFocusMinutes);

  const blockedDomains = useLockerStore((s) => s.blockedDomains);
  const hasLockerPermission = useLockerStore((s) => s.hasPermission);
  const lockerStoreLoaded = useLockerStore((s) => s.isLoaded);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showLocker, setShowLocker] = useState(false);
  const [lockerEnabled, setLockerEnabled] = useState(true);

  // Load blocked domains and check permission once
  useEffect(() => {
    const store = useLockerStore.getState();
    if (!lockerStoreLoaded) {
      store.loadBlockedDomains();
    }
    if (store.hasPermission === null) {
      store.checkPermission();
    }
  }, [lockerStoreLoaded]);

  // Pre-select all today tasks (re-run when list changes or tasks change)
  const todayTaskIds = todayTasks.map((t) => t.id).join(",");
  useEffect(() => {
    setSelectedIds(todayTasks.map((t) => t.id));
  }, [todayTaskIds]);  // eslint-disable-line

  // When running/paused, show overlay
  if (status !== "idle") {
    return <FocusOverlay onExit={endSession} />;
  }

  function toggleTask(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function moveUp(id: string) {
    setSelectedIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function moveDown(id: string) {
    setSelectedIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  async function handleStart() {
    if (selectedIds.length === 0) return;
    // Proxy-based blocker doesn't need admin — always allow start
    await startFocusSession(selectedIds, lockerEnabled);
    minimizeToFloating().catch(console.warn);
  }

  // Render tasks in selection order, then unselected tasks after
  const selectedSet = new Set(selectedIds);
  const orderedTasks = [
    ...selectedIds.map((id) => todayTasks.find((t) => t.id === id)).filter(Boolean),
    ...todayTasks.filter((t) => !selectedSet.has(t.id)),
  ];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main setup panel */}
      <div className="flex flex-1 flex-col overflow-y-auto p-8">
        <div className="max-w-lg mx-auto w-full">
          <h1 className="text-2xl font-bold text-white mb-1">Focus Mode</h1>
          <p className="text-sm text-white/40 mb-8">
            Select tasks from Today and start a Pomodoro session.
          </p>

          {/* Today task list */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">
                Today's Tasks
              </span>
              {todayTasks.length > 0 && (
                <button
                  className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
                  onClick={() => {
                    if (selectedIds.length === todayTasks.length) {
                      setSelectedIds([]);
                    } else {
                      setSelectedIds(todayTasks.map((t) => t.id));
                    }
                  }}
                >
                  {selectedIds.length === todayTasks.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            {todayTasks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10">
                <EmptyState
                  icon={<TimerIcon size={32} />}
                  title="No tasks in Today"
                  description="Move tasks to Today on the Board first."
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {orderedTasks.map((task) => {
                  const selIdx = selectedIds.indexOf(task!.id);
                  const isSelected = selIdx !== -1;
                  return (
                    <TaskRow
                      key={task!.id}
                      id={task!.id}
                      selected={isSelected}
                      order={isSelected ? selIdx + 1 : 0}
                      total={selectedIds.length}
                      onToggle={() => toggleTask(task!.id)}
                      onMoveUp={() => moveUp(task!.id)}
                      onMoveDown={() => moveDown(task!.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Session info */}
          <div className="mb-4 flex items-center gap-2 text-xs text-white/30">
            <span>{selectedIds.length} task{selectedIds.length !== 1 ? "s" : ""} selected</span>
            <span>·</span>
            <span>{pomodoroFocusMinutes}min focus intervals</span>
          </div>

          {/* Locker toggle — only show when there are blocked domains */}
          {blockedDomains.length > 0 && (
            <div className="mb-6 flex flex-col gap-2">
              <button
                onClick={() => setLockerEnabled((v) => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-full border text-xs font-medium transition-colors w-fit ${
                  lockerEnabled
                    ? "border-orange-500/40 bg-orange-500/10 text-orange-400 hover:bg-orange-500/15"
                    : "border-white/10 bg-white/5 text-white/40 hover:bg-white/8"
                }`}
              >
                {lockerEnabled ? (
                  <>
                    <ShieldCheck size={13} />
                    Block {blockedDomains.length} site{blockedDomains.length !== 1 ? "s" : ""}
                  </>
                ) : (
                  <>
                    <ShieldOff size={13} />
                    No blocking
                  </>
                )}
              </button>

            </div>
          )}

          {/* Start button */}
          <Button
            onClick={handleStart}
            disabled={selectedIds.length === 0}
            className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-base disabled:opacity-40"
          >
            <Play size={18} className="mr-2" />
            Start Focus Session
          </Button>
        </div>
      </div>

      {/* Locker panel (right sidebar) */}
      <div className="hidden lg:flex w-80 flex-col border-l border-[#2A2A2A] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-white/60">Website Blocker</span>
          <button
            onClick={() => setShowLocker(!showLocker)}
            className="text-[10px] text-white/30 hover:text-white/60 transition-colors"
          >
            {showLocker ? "Hide" : "Manage"}
          </button>
        </div>
        {showLocker ? (
          <LockerPanel />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-white/20">
              Block distracting websites during focus sessions.
            </p>

            {blockedDomains.length > 0 ? (
              <div className="flex flex-col gap-1">
                {blockedDomains.map((domain) => (
                  <div
                    key={domain}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06]"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-500/50 flex-shrink-0" />
                    <span className="text-xs text-white/40 truncate">{domain}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-white/10 p-4">
                <p className="text-[11px] text-white/30 leading-relaxed">
                  No sites added yet. Add websites you want to block during focus sessions.
                </p>
                <button
                  onClick={() => setShowLocker(true)}
                  className="flex items-center gap-1.5 text-[11px] font-medium text-orange-400 hover:text-orange-300 transition-colors"
                >
                  <ShieldCheck size={12} />
                  Add blocked websites
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
