import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, isPast, isToday, parseISO } from "date-fns";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Play, Pencil } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useTaskStore, useSubtaskProgress, type Task, type TaskStatus } from "@/stores/taskStore";
import { useListStore } from "@/stores/listStore";
import { useTimerStore } from "@/stores/timerStore";
import { formatMinutes, parseEstimate } from "@/lib/timeUtils";
import { fireConfetti } from "@/lib/confetti";

const STATUS_ORDER: TaskStatus[] = ["backlog", "this_week", "today"];

type Props = {
  task: Task;
  columnStatus: TaskStatus;
  columnTasks: Task[];
};

export default function TaskCard({ task, columnStatus, columnTasks }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const [editingActual, setEditingActual] = useState(false);
  const [actualDraft, setActualDraft] = useState("");
  const actualInputRef = useRef<HTMLInputElement>(null);

  const selectedTaskId = useTaskStore((s) => s.selectedTaskId);
  const { completeTask, updateTask, moveTask, reorderTasks, selectTask } = useTaskStore.getState();
  const lists = useListStore((s) => s.lists);
  const selectedListId = useListStore((s) => s.selectedListId);
  const timerStatus = useTimerStore((s) => s.status);
  const activeTaskId = useTimerStore((s) => s.activeTaskId);
  const navigate = useNavigate();
  const isTimerActiveOnThis = timerStatus !== "idle" && activeTaskId === task.id;

  const list = lists.find((l) => l.id === task.listId);
  const subtaskProgress = useSubtaskProgress(task.id);
  const subtaskEstSum = useTaskStore((s) => s.subtaskCounts[task.id]?.estimatedMinutesSum ?? null);
  const displayedEst = subtaskEstSum ?? task.estimatedMinutes;

  const isSelected = selectedTaskId === task.id;

  // Due date color
  let dueDateClass = "text-white/40";
  if (task.dueDate) {
    const d = parseISO(task.dueDate);
    if (isToday(d)) dueDateClass = "text-orange-400";
    else if (isPast(d)) dueDateClass = "text-red-400";
  }

  // Actual time badge color
  let actualBadgeClass = "bg-white/5 text-white/50";
  let isOvertime = false;
  if (displayedEst && task.actualMinutes > 0) {
    const ratio = task.actualMinutes / displayedEst;
    if (ratio <= 1.0) actualBadgeClass = "bg-green-500/20 text-green-400";
    else if (ratio <= 1.25) actualBadgeClass = "bg-yellow-500/20 text-yellow-400";
    else {
      actualBadgeClass = "bg-red-500/20 text-red-400 animate-pulse";
      isOvertime = true;
    }
  }

  function startActualEdit(e: React.MouseEvent) {
    e.stopPropagation();
    if (isTimerActiveOnThis) return;
    setActualDraft(task.actualMinutes > 0 ? `${task.actualMinutes}m` : "");
    setEditingActual(true);
    setTimeout(() => actualInputRef.current?.select(), 0);
  }

  async function saveActualEdit() {
    const parsed = parseEstimate(actualDraft);
    if (parsed !== null && parsed !== task.actualMinutes) {
      await updateTask(task.id, { actualMinutes: parsed });
    }
    setEditingActual(false);
  }

  function handleActualKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") saveActualEdit();
    if (e.key === "Escape") setEditingActual(false);
  }

  async function handleComplete(e: React.MouseEvent) {
    e.stopPropagation();
    await completeTask(task.id);
    fireConfetti();
  }

  function handleCardClick() {
    if (!editingTitle) {
      selectTask(task.id);
    }
  }

  function startTitleEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setTitleDraft(task.title);
    setEditingTitle(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function saveTitleEdit() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) {
      await updateTask(task.id, { title: trimmed });
    }
    setEditingTitle(false);
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") saveTitleEdit();
    if (e.key === "Escape") setEditingTitle(false);
  }

  // Arrow reorder helpers
  const colTasks = [...columnTasks].sort((a, b) => a.position - b.position);
  const myIndex = colTasks.findIndex((t) => t.id === task.id);

  async function moveUp(e: React.MouseEvent) {
    e.stopPropagation();
    if (myIndex <= 0) return;
    const swapped = [...colTasks];
    [swapped[myIndex - 1], swapped[myIndex]] = [swapped[myIndex], swapped[myIndex - 1]];
    await reorderTasks(swapped.map((t, i) => ({ id: t.id, position: i, status: columnStatus })));
  }

  async function moveDown(e: React.MouseEvent) {
    e.stopPropagation();
    if (myIndex >= colTasks.length - 1) return;
    const swapped = [...colTasks];
    [swapped[myIndex], swapped[myIndex + 1]] = [swapped[myIndex + 1], swapped[myIndex]];
    await reorderTasks(swapped.map((t, i) => ({ id: t.id, position: i, status: columnStatus })));
  }

  async function moveLeft(e: React.MouseEvent) {
    e.stopPropagation();
    const idx = STATUS_ORDER.indexOf(columnStatus);
    if (idx <= 0) return;
    await moveTask(task.id, STATUS_ORDER[idx - 1]);
  }

  async function moveRight(e: React.MouseEvent) {
    e.stopPropagation();
    const idx = STATUS_ORDER.indexOf(columnStatus);
    if (idx >= STATUS_ORDER.length - 1) return;
    await moveTask(task.id, STATUS_ORDER[idx + 1]);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleCardClick}
      className={`group relative rounded-lg border p-3 cursor-pointer select-none transition-colors ${
        isSelected
          ? "border-orange-500/50 bg-orange-500/5"
          : "border-[#2A2A2A] bg-[#1A1A1A] hover:border-[#3A3A3A] hover:bg-[#1E1E1E]"
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Checkbox */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 flex-shrink-0"
        >
          <Checkbox
            checked={false}
            onCheckedChange={async () => {
              await completeTask(task.id);
              fireConfetti();
            }}
            className="border-white/20 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          {editingTitle ? (
            <Input
              ref={inputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitleEdit}
              onKeyDown={handleTitleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="h-6 px-1 py-0 text-sm bg-[#111] border-orange-500/50 text-white"
            />
          ) : (
            <p
              onDoubleClick={startTitleEdit}
              className="text-sm text-white/90 leading-snug line-clamp-2 break-words"
            >
              {task.title}
            </p>
          )}

          {/* Meta row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* List color dot + name (name only in All Tasks view) */}
            {list && (
              <>
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: list.color }}
                  title={list.name}
                />
                {selectedListId === null && (
                  <span className="text-[10px] text-white/30 truncate max-w-[60px]">{list.name}</span>
                )}
              </>
            )}

            {/* EST badge */}
            {displayedEst != null && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] bg-white/5 text-white/50 border-0">
                {formatMinutes(displayedEst)}
              </Badge>
            )}

            {/* Actual time badge */}
            {editingActual ? (
              <Input
                ref={actualInputRef}
                value={actualDraft}
                onChange={(e) => setActualDraft(e.target.value)}
                onBlur={saveActualEdit}
                onKeyDown={handleActualKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-14 px-1 py-0 text-[10px] bg-[#111] border-orange-500/50 text-white"
              />
            ) : task.actualMinutes > 0 ? (
              <span
                className="group/actual flex items-center gap-0.5 cursor-default"
                onClick={(e) => e.stopPropagation()}
              >
                <Badge
                  variant="secondary"
                  className={`h-4 px-1.5 text-[10px] border-0 ${actualBadgeClass}`}
                >
                  {formatMinutes(task.actualMinutes)}{isOvertime ? " · OT" : ""}
                </Badge>
                {!isTimerActiveOnThis && (
                  <button
                    onClick={startActualEdit}
                    className="opacity-0 group-hover/actual:opacity-100 transition-opacity p-0.5 rounded text-white/30 hover:text-white/60"
                    title="Edit actual time"
                  >
                    <Pencil size={8} />
                  </button>
                )}
              </span>
            ) : null}

            {/* Due date */}
            {task.dueDate && (
              <span className={`text-[10px] ${dueDateClass}`}>
                {format(parseISO(task.dueDate), "MMM d")}
              </span>
            )}

            {/* Subtask progress badge */}
            {subtaskProgress && (
              <Badge
                variant="secondary"
                className={`h-4 px-1.5 text-[10px] border-0 ${
                  subtaskProgress.done === subtaskProgress.total
                    ? "bg-green-500/20 text-green-400"
                    : "bg-white/5 text-white/50"
                }`}
              >
                {subtaskProgress.done}/{subtaskProgress.total} ✓
              </Badge>
            )}
          </div>
        </div>

        {/* Focus button — Today tasks only, when timer is idle */}
        {columnStatus === "today" && timerStatus === "idle" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              useTimerStore.getState().startFocusSession([task.id]).then(() => navigate("/focus"));
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-1 rounded text-orange-500/50 hover:text-orange-500 hover:bg-orange-500/10"
            title="Start focus session"
          >
            <Play size={12} />
          </button>
        )}

        {/* Arrow actions — hover only */}
        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={moveUp}
            className="p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10"
            title="Move up"
          >
            <ChevronUp size={11} />
          </button>
          <button
            onClick={moveLeft}
            className="p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10"
            title="Move left"
          >
            <ChevronLeft size={11} />
          </button>
          <button
            onClick={moveRight}
            className="p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10"
            title="Move right"
          >
            <ChevronRight size={11} />
          </button>
          <button
            onClick={moveDown}
            className="p-0.5 rounded text-white/30 hover:text-white/70 hover:bg-white/10"
            title="Move down"
          >
            <ChevronDown size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}
