import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTaskStore, type TaskStatus } from "@/stores/taskStore";
import { useListStore } from "@/stores/listStore";
import { extractEstFromTitle } from "@/lib/timeUtils";

type Props = {
  status: TaskStatus;
};

export default function InlineTaskAdd({ status }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { addTask } = useTaskStore();
  const { selectedListId } = useListStore();

  function openInput() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed) {
      setOpen(false);
      setValue("");
      return;
    }
    const { title, est } = extractEstFromTitle(trimmed);
    const listId = selectedListId ?? "inbox-default";
    await addTask(title, status, listId, est);
    setValue("");
    // Keep open for rapid entry
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") {
      setOpen(false);
      setValue("");
    }
  }

  // Listen for quick-add events (from tray or global shortcut) — only "today" column responds
  useEffect(() => {
    if (status !== "today") return;

    // DOM custom event (from global shortcut hook)
    function handleDomQuickAdd() {
      openInput();
    }
    window.addEventListener("blitzdesk:quick-add", handleDomQuickAdd);

    // Tauri event (from tray menu)
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("quick-add", () => {
        openInput();
      }).then((fn) => {
        unlisten = fn;
      });
    }).catch(() => {});

    return () => {
      window.removeEventListener("blitzdesk:quick-add", handleDomQuickAdd);
      if (unlisten) unlisten();
    };
  }, [status]);

  return (
    <div className="mt-2">
      <AnimatePresence>
        {open ? (
          <motion.div
            key="input"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <Input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (!value.trim()) {
                  setOpen(false);
                  setValue("");
                }
              }}
              placeholder="Task title… (append 30m for estimate)"
              className="h-8 text-sm bg-[#111] border-[#2A2A2A] focus:border-orange-500/50 text-white placeholder:text-white/25"
            />
          </motion.div>
        ) : (
          <motion.button
            key="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={openInput}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
          >
            <Plus size={13} />
            <span>Add task</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
