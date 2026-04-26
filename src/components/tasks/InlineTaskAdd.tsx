import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { useTaskStore, type TaskStatus } from "@/stores/taskStore";
import { useListStore } from "@/stores/listStore";
import { extractEstFromTitle } from "@/lib/timeUtils";

type Props = {
  status: TaskStatus;
};

export default function InlineTaskAdd({ status }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [notesFormOpen, setNotesFormOpen] = useState(false);
  const [pickedListId, setPickedListId] = useState<string | null>(null);
  const selectOpenRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addTask } = useTaskStore();
  const { selectedListId, lists } = useListStore();

  // Derive the effective list ID — always a valid list or the first one
  const effectiveListId =
    pickedListId && lists.some((l) => l.id === pickedListId)
      ? pickedListId
      : lists[0]?.id ?? "";

  function openInput() {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function resetForm() {
    setOpen(false);
    setValue("");
    setNotesInput("");
    setNotesFormOpen(false);
  }

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed) {
      resetForm();
      return;
    }
    const { title, est } = extractEstFromTitle(trimmed);
    const notes = notesInput.trim() || null;
    await addTask(title, status, selectedListId ?? effectiveListId, est, notes);
    setValue("");
    setNotesInput("");
    // Keep open for rapid entry
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") resetForm();
  }

  // Listen for quick-add DOM event (dispatched centrally by AppShell) — only "today" column responds
  useEffect(() => {
    if (status !== "today") return;
    function handleDomQuickAdd() { openInput(); }
    window.addEventListener("skadiflow:quick-add", handleDomQuickAdd);
    return () => window.removeEventListener("skadiflow:quick-add", handleDomQuickAdd);
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
            <div
              ref={containerRef}
              className="flex flex-col"
              onBlur={(e) => {
                if (selectOpenRef.current) return;
                if (!containerRef.current?.contains(e.relatedTarget as Node)) {
                  if (!value.trim()) resetForm();
                }
              }}
            >
              {/* Row 1: List picker + Title input */}
              <div className="flex gap-1.5">
                {selectedListId === null && (
                  <Select
                    value={effectiveListId}
                    onValueChange={(v) => {
                      if (v) setPickedListId(v);
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    onOpenChange={(o) => {
                      selectOpenRef.current = o;
                    }}
                  >
                    <SelectTrigger className="w-[120px] h-8 text-xs bg-[#111] border-[#2A2A2A] text-white/60 flex-shrink-0">
                      <span className="truncate">
                        {lists.find((l) => l.id === effectiveListId)?.name ?? "Select list"}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A1A1A] border-[#2A2A2A] text-white">
                      {lists.map((l) => (
                        <SelectItem key={l.id} value={l.id} className="text-xs text-white/70 focus:text-white focus:bg-white/10">
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Input
                  ref={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onFocus={() => setNotesFormOpen(true)}
                  onKeyDown={handleKeyDown}
                  onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => {
                    const text = e.clipboardData.getData("text");
                    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
                    if (lines.length <= 1) return; // single line — normal paste
                    e.preventDefault();
                    const listId = selectedListId ?? effectiveListId;
                    lines.forEach((line) => {
                      const { title, est } = extractEstFromTitle(line);
                      addTask(title, status, listId, est);
                    });
                  }}
                  placeholder="Task title… (append 30m for estimate)"
                  className="h-8 text-sm bg-[#111] border-[#2A2A2A] focus:border-orange-500/50 text-white placeholder:text-white/25"
                />
              </div>

              {/* Row 2: Notes textarea (expandable on focus) */}
              <AnimatePresence initial={false}>
                {notesFormOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <Textarea
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          submit();
                        }
                        if (e.key === "Escape") resetForm();
                      }}
                      placeholder="Notes (optional)…"
                      rows={2}
                      className="mt-1 bg-[#0D0D0D] border-[#2A2A2A] focus:border-orange-500/30 text-white text-sm placeholder:text-white/25 resize-none w-full"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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
