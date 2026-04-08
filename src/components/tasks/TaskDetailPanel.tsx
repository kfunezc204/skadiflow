import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, Calendar, GripVertical, Plus } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTaskStore, useSubtasks, type Task, type TaskStatus } from "@/stores/taskStore";
import { Badge } from "@/components/ui/badge";
import { useListStore } from "@/stores/listStore";
import { formatMinutes, parseEstimate, extractEstFromTitle } from "@/lib/timeUtils";

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  this_week: "This Week",
  today: "Today",
  done: "Done",
};

const RECURRENCE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

function SortableSubtaskRow({
  subtask,
  onToggle,
  onDelete,
  onUpdateEst,
}: {
  subtask: Task;
  onToggle: () => void;
  onDelete: () => void;
  onUpdateEst: (est: number | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const isDone = subtask.completedAt !== null;
  const [editingEst, setEditingEst] = useState(false);
  const [estDraft, setEstDraft] = useState("");
  const estInputRef = useRef<HTMLInputElement>(null);

  function startEstEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEstDraft(subtask.estimatedMinutes != null ? formatMinutes(subtask.estimatedMinutes) : "");
    setEditingEst(true);
    setTimeout(() => estInputRef.current?.select(), 0);
  }

  function saveEstEdit() {
    onUpdateEst(parseEstimate(estDraft));
    setEditingEst(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 group/row py-1"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={12} />
      </button>
      <Checkbox
        checked={isDone}
        onCheckedChange={onToggle}
        className="border-white/20 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500 flex-shrink-0"
      />
      <span
        className={`flex-1 text-xs leading-snug ${
          isDone ? "line-through text-white/30" : "text-white/80"
        }`}
      >
        {subtask.title}
      </span>

      {/* EST badge / inline edit */}
      {editingEst ? (
        <Input
          ref={estInputRef}
          value={estDraft}
          onChange={(e) => setEstDraft(e.target.value)}
          onBlur={saveEstEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveEstEdit();
            if (e.key === "Escape") setEditingEst(false);
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-14 px-1 py-0 text-[10px] bg-[#111] border-orange-500/50 text-white flex-shrink-0"
        />
      ) : subtask.estimatedMinutes != null ? (
        <Badge
          variant="secondary"
          onClick={startEstEdit}
          className="h-4 px-1.5 text-[10px] bg-white/5 text-white/50 border-0 cursor-pointer hover:bg-orange-500/20 hover:text-orange-300 flex-shrink-0"
        >
          {formatMinutes(subtask.estimatedMinutes)}
        </Badge>
      ) : (
        <button
          onClick={startEstEdit}
          className="opacity-0 group-hover/row:opacity-100 transition-opacity text-[10px] text-white/25 hover:text-white/50 flex-shrink-0 px-1"
        >
          est
        </button>
      )}

      <button
        onClick={onDelete}
        className="opacity-0 group-hover/row:opacity-100 transition-opacity text-white/20 hover:text-red-400 flex-shrink-0 p-0.5"
      >
        <X size={11} />
      </button>
    </div>
  );
}

export default function TaskDetailPanel() {
  const tasks = useTaskStore((s) => s.tasks);
  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const { selectTask, updateTask, deleteTask, loadSubtasks, addSubtask, updateSubtask, toggleSubtask, deleteSubtask, reorderSubtasks } = useTaskStore.getState();
  const subtaskCounts = useTaskStore((s) => s.subtaskCounts);
  const lists = useListStore((s) => s.lists);
  const task = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const subtaskList = useSubtasks(task?.id ?? "");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estInput, setEstInput] = useState("");
  const [calOpen, setCalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [subtaskEstInput, setSubtaskEstInput] = useState("");
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  const subtaskSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setEstInput(task.estimatedMinutes != null ? formatMinutes(task.estimatedMinutes) : "");
      setConfirmDelete(false);
      setSubtaskInput("");
      setSubtaskEstInput("");
      loadSubtasks(task.id);
    }
  }, [task?.id]);

  if (!task) return null;

  async function saveTitle() {
    if (!task) return;
    const trimmed = title.trim();
    if (trimmed && trimmed !== task.title) {
      await updateTask(task.id, { title: trimmed });
    }
  }

  async function saveDescription() {
    if (!task) return;
    const val = description.trim() || null;
    if (val !== task.description) {
      await updateTask(task.id, { description: val });
    }
  }

  async function saveEst() {
    if (!task) return;
    const mins = parseEstimate(estInput);
    if (mins !== task.estimatedMinutes) {
      await updateTask(task.id, { estimatedMinutes: mins });
    }
  }

  async function handleStatusChange(s: string | null) {
    if (!task || !s) return;
    await updateTask(task.id, { status: s as TaskStatus });
  }

  async function handleListChange(listId: string | null) {
    if (!task || !listId) return;
    await updateTask(task.id, { listId });
  }

  async function handleDueDateSelect(date: Date | undefined) {
    if (!task) return;
    const val = date ? date.toISOString().split("T")[0] : null;
    await updateTask(task.id, { dueDate: val });
    setCalOpen(false);
  }

  async function handleRecurrenceChange(val: string | null) {
    if (!task || !val) return;
    await updateTask(task.id, { recurrenceRule: val === "none" ? null : val });
  }

  async function handleDelete() {
    if (!task) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteTask(task.id);
    selectTask(null);
  }

  async function handleAddSubtask() {
    if (!task) return;
    const trimmed = subtaskInput.trim();
    if (!trimmed) return;
    setSubtaskInput("");
    const estFromField = parseEstimate(subtaskEstInput);
    setSubtaskEstInput("");
    const { title: cleanTitle, est: estFromTitle } = extractEstFromTitle(trimmed);
    const est = estFromField ?? estFromTitle;
    await addSubtask(task.id, cleanTitle, est);
  }

  function handleSubtaskDragEnd(event: DragEndEvent) {
    if (!task) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = subtaskList.findIndex((s) => s.id === active.id);
    const newIndex = subtaskList.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(subtaskList, oldIndex, newIndex);
    reorderSubtasks(task.id, reordered.map((s) => s.id));
  }

  const dueDateObj = task.dueDate ? parseISO(task.dueDate) : undefined;

  return (
    <AnimatePresence>
      {selectedTaskId && (
        <motion.aside
          key="detail"
          initial={{ x: 360, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 360, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-[340px] flex-shrink-0 border-l border-[#2A2A2A] bg-[#111111] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A2A2A]">
            <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">
              Task Detail
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-white/30 hover:text-white"
              onClick={() => selectTask(null)}
            >
              <X size={13} />
            </Button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 flex flex-col gap-4">
            {/* Title */}
            <div>
              <label className="text-[10px] text-white/30 uppercase tracking-wider mb-1 block">
                Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => e.key === "Enter" && saveTitle()}
                className="bg-[#1A1A1A] border-[#2A2A2A] focus:border-orange-500/50 text-white text-sm"
              />
            </div>

            {/* Status + List row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-white/30 uppercase tracking-wider mb-1 block">
                  Status
                </label>
                <Select value={task.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="h-8 text-xs bg-[#1A1A1A] border-[#2A2A2A] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A1A1A] border-[#2A2A2A]">
                    {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
                      <SelectItem key={s} value={s} className="text-xs text-white/80">
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] text-white/30 uppercase tracking-wider mb-1 block">
                  List
                </label>
                <Select value={task.listId} onValueChange={handleListChange}>
                  <SelectTrigger className="h-8 text-xs bg-[#1A1A1A] border-[#2A2A2A] text-white overflow-hidden">
                    <span className="truncate">
                      {lists.find((l) => l.id === task.listId)?.name ?? "Select list"}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A1A1A] border-[#2A2A2A]">
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={l.id} className="text-xs text-white/80">
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* EST + Actual */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-white/30 uppercase tracking-wider mb-1 block">
                  Estimate
                </label>
                {(() => {
                  const estSum = task.id ? subtaskCounts[task.id]?.estimatedMinutesSum : null;
                  return estSum != null ? (
                    <div className="h-8 flex items-center gap-1.5 px-3 rounded-md border border-[#2A2A2A] bg-[#1A1A1A]">
                      <span className="text-xs text-white/70">{formatMinutes(estSum)}</span>
                      <span className="text-[10px] text-white/30">(from subtasks)</span>
                    </div>
                  ) : (
                    <Input
                      value={estInput}
                      onChange={(e) => setEstInput(e.target.value)}
                      onBlur={saveEst}
                      onKeyDown={(e) => e.key === "Enter" && saveEst()}
                      placeholder="e.g. 30m, 1h"
                      className="h-8 text-xs bg-[#1A1A1A] border-[#2A2A2A] focus:border-orange-500/50 text-white placeholder:text-white/25"
                    />
                  );
                })()}
              </div>
              <div>
                <label className="text-[10px] text-white/30 uppercase tracking-wider mb-1 block">
                  Actual
                </label>
                <div className="h-8 flex items-center px-3 rounded-md border border-[#2A2A2A] bg-[#1A1A1A]">
                  <span className="text-xs text-white/40">
                    {task.actualMinutes > 0 ? formatMinutes(task.actualMinutes) : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Due date */}
            <div>
              <label className="text-[10px] text-white/30 uppercase tracking-wider mb-1 block">
                Due Date
              </label>
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger className="flex items-center gap-2 w-full h-8 px-3 rounded-md border border-[#2A2A2A] bg-[#1A1A1A] text-xs text-white/70 hover:border-[#3A3A3A] transition-colors text-left">
                    <Calendar size={12} className="text-white/30" />
                    {dueDateObj
                      ? format(dueDateObj, "MMM d, yyyy")
                      : <span className="text-white/25">Pick a date</span>}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#1A1A1A] border-[#2A2A2A]" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={dueDateObj}
                    onSelect={handleDueDateSelect}
                    initialFocus
                    className="text-white"
                  />
                  {task.dueDate && (
                    <div className="px-3 pb-3">
                      <button
                        onClick={() => handleDueDateSelect(undefined)}
                        className="text-xs text-white/40 hover:text-white/70 underline"
                      >
                        Clear date
                      </button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Recurrence */}
            <div>
              <label className="text-[10px] text-white/30 uppercase tracking-wider mb-1 block">
                Repeat
              </label>
              <Select
                value={task.recurrenceRule ?? "none"}
                onValueChange={handleRecurrenceChange}
              >
                <SelectTrigger className="h-8 text-xs bg-[#1A1A1A] border-[#2A2A2A] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A1A1A] border-[#2A2A2A]">
                  {RECURRENCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs text-white/80">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div>
              <label className="text-[10px] text-white/30 uppercase tracking-wider mb-1 block">
                Notes
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={saveDescription}
                placeholder="Add notes…"
                rows={4}
                className="bg-[#1A1A1A] border-[#2A2A2A] focus:border-orange-500/50 text-white text-xs placeholder:text-white/25 resize-none"
              />
            </div>

            {/* Subtasks */}
            <div>
              <label className="text-[10px] text-white/30 uppercase tracking-wider mb-2 block">
                Subtasks
              </label>

              {subtaskList.length > 0 && (
                <DndContext
                  id="subtask-dnd"
                  sensors={subtaskSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleSubtaskDragEnd}
                >
                  <SortableContext
                    items={subtaskList.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <AnimatePresence initial={false}>
                      {subtaskList.map((subtask) => (
                        <motion.div
                          key={subtask.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <SortableSubtaskRow
                            subtask={subtask}
                            onToggle={() => toggleSubtask(task.id, subtask.id)}
                            onDelete={() => deleteSubtask(task.id, subtask.id)}
                            onUpdateEst={(est) => updateSubtask(task.id, subtask.id, { estimatedMinutes: est })}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </SortableContext>
                </DndContext>
              )}

              {/* Add subtask input */}
              <div className="flex items-center gap-1.5 mt-1.5">
                <Input
                  ref={subtaskInputRef}
                  value={subtaskInput}
                  onChange={(e) => setSubtaskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddSubtask();
                    if (e.key === "Escape") setSubtaskInput("");
                  }}
                  placeholder="Add a subtask…"
                  className="h-7 text-xs bg-[#1A1A1A] border-[#2A2A2A] focus:border-orange-500/50 text-white placeholder:text-white/25 min-w-0"
                />
                <Input
                  value={subtaskEstInput}
                  onChange={(e) => setSubtaskEstInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddSubtask();
                    if (e.key === "Escape") setSubtaskEstInput("");
                  }}
                  placeholder="est"
                  className="h-7 w-16 text-xs bg-[#1A1A1A] border-[#2A2A2A] focus:border-orange-500/50 text-white placeholder:text-white/25 flex-shrink-0"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleAddSubtask}
                  className="h-7 w-7 flex-shrink-0 text-white/30 hover:text-orange-400 hover:bg-orange-500/10"
                >
                  <Plus size={13} />
                </Button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-[#2A2A2A] flex flex-col gap-2">
            <Button
              size="sm"
              onClick={() => selectTask(null)}
              className="w-full text-xs bg-orange-500 hover:bg-orange-600 text-white"
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className={`w-full text-xs gap-2 ${
                confirmDelete
                  ? "text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  : "text-white/30 hover:text-red-400 hover:bg-red-500/10"
              }`}
            >
              <Trash2 size={12} />
              {confirmDelete ? "Confirm delete?" : "Delete task"}
            </Button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
