import React, { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTaskStore } from "@/stores/taskStore";
import { useListStore } from "@/stores/listStore";
import { extractEstFromTitle } from "@/lib/timeUtils";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function GlobalQuickAddDialog({ open, onClose }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { addTask } = useTaskStore();
  const { selectedListId, lists } = useListStore();

  const listId = selectedListId ?? lists[0]?.id ?? "";

  useEffect(() => {
    if (open) {
      setValue("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed) { onClose(); return; }
    const { title, est } = extractEstFromTitle(trimmed);
    await addTask(title, "today", listId, est);
    setValue("");
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-[#1C1C1C] border-[#2A2A2A] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-white/80">
            Quick Add Task → Today
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 mt-1">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Task title… (e.g. "Write report 30m")'
            className="flex-1 bg-[#111] border-[#333] text-white placeholder:text-white/20 focus-visible:ring-orange-500"
          />
          <Button
            onClick={submit}
            disabled={!value.trim()}
            className="bg-orange-500 hover:bg-orange-600 text-white px-4"
          >
            Add
          </Button>
        </div>
        <p className="text-[10px] text-white/20 mt-1">
          Tip: append time estimate like "30m" or "1h" to set EST automatically.
        </p>
      </DialogContent>
    </Dialog>
  );
}
