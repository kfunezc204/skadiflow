import { useEffect, useRef, useState } from "react";
import { getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle } from "lucide-react";

const TOAST_W = 360;
const TOAST_H = 84;
const MARGIN = 16;
const TASKBAR = 48;
const DURATION = 4000;

export default function TaskToastPage() {
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const dismiss = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    await getCurrentWindow().hide();
  };

  useEffect(() => {
    const unlisten = listen<{ title: string }>("task-completed-toast", async (event) => {
      // Clear any previous timers
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);

      setTitle(event.payload.title);
      setProgress(100);

      try {
        const win = getCurrentWindow();
        const monitor = await primaryMonitor();
        if (monitor) {
          const sf = monitor.scaleFactor;
          const sw = monitor.size.width;
          const sh = monitor.size.height;
          const x = Math.round(sw - TOAST_W * sf - MARGIN * sf);
          const y = Math.round(sh - TOAST_H * sf - (MARGIN + TASKBAR) * sf);
          await win.setPosition(new PhysicalPosition(x, y));
        }
        await win.show();
        await win.setFocus();
      } catch (e) {
        console.error("toast position error", e);
      }

      const start = Date.now();
      intervalRef.current = window.setInterval(() => {
        const pct = Math.max(0, 100 - ((Date.now() - start) / DURATION) * 100);
        setProgress(pct);
      }, 40);

      timerRef.current = window.setTimeout(async () => {
        clearInterval(intervalRef.current!);
        await getCurrentWindow().hide();
      }, DURATION);
    });

    return () => {
      unlisten.then((fn) => fn());
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div
      className="h-screen w-screen flex items-center p-2"
      style={{ background: "transparent" }}
      onClick={dismiss}
    >
      <div className="w-full bg-[#1C1C1C] border border-[#2E2E2E] rounded-xl shadow-2xl overflow-hidden cursor-pointer select-none">
        <div className="flex items-center gap-3 px-4 py-[10px]">
          <div className="shrink-0 w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-white/40 font-medium leading-none mb-[3px]">
              Task completed
            </p>
            <p className="text-[13px] text-white font-medium truncate leading-tight">
              {title}
            </p>
          </div>
        </div>
        <div className="h-[2px] bg-[#2A2A2A]">
          <div
            className="h-full bg-green-500 transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
