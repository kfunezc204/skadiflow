import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { toast } from "@/lib/toast";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  getAllTasks,
  getDoneTasks,
  createTask as dbCreateTask,
  updateTask as dbUpdateTask,
  deleteTask as dbDeleteTask,
  completeTask as dbCompleteTask,
  uncompleteTask as dbUncompleteTask,
  getMaxPosition,
  reorderTasks as dbReorderTasks,
  getSubtasks as dbGetSubtasks,
  getSubtaskCounts as dbGetSubtaskCounts,
  createSubtask as dbCreateSubtask,
  toggleSubtask as dbToggleSubtask,
  deleteSubtask as dbDeleteSubtask,
  reorderSubtasks as dbReorderSubtasks,
  getMaxSubtaskPosition,
} from "@/lib/db";

export type TaskStatus = "backlog" | "this_week" | "today" | "done";

export type Task = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  estimatedMinutes: number | null;
  actualMinutes: number;
  position: number;
  dueDate: string | null;
  recurrenceRule: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  parentTaskId: string | null;
};

type TaskState = {
  tasks: Task[];
  doneTasks: Task[];
  selectedTaskId: string | null;
  showDone: boolean;
  isLoaded: boolean;
  subtasks: Record<string, Task[]>;
  subtaskCounts: Record<string, { total: number; done: number; estimatedMinutesSum: number | null }>;
};

type TaskActions = {
  loadTasks: () => Promise<void>;
  loadDoneTasks: () => Promise<void>;
  addTask: (
    title: string,
    status: TaskStatus,
    listId: string,
    estimatedMinutes?: number | null
  ) => Promise<void>;
  updateTask: (id: string, fields: Parameters<typeof dbUpdateTask>[1]) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  completeTask: (id: string) => Promise<Task | null>;
  uncompleteTask: (id: string, restoreStatus: TaskStatus) => Promise<void>;
  moveTask: (id: string, newStatus: TaskStatus) => Promise<void>;
  reorderTasks: (updates: Array<{ id: string; position: number; status?: TaskStatus }>) => Promise<void>;
  selectTask: (id: string | null) => void;
  toggleShowDone: () => void;
  updateTaskInMemory: (id: string, fields: Partial<Pick<Task, "actualMinutes" | "estimatedMinutes">>) => void;
  loadSubtasks: (parentId: string) => Promise<void>;
  loadSubtaskCounts: () => Promise<void>;
  addSubtask: (parentId: string, title: string, estimatedMinutes?: number | null) => Promise<void>;
  updateSubtask: (parentId: string, subtaskId: string, fields: Parameters<typeof dbUpdateTask>[1]) => Promise<void>;
  toggleSubtask: (parentId: string, subtaskId: string) => Promise<void>;
  deleteSubtask: (parentId: string, subtaskId: string) => Promise<void>;
  reorderSubtasks: (parentId: string, orderedIds: string[]) => Promise<void>;
};

function calcEstSum(subs: Task[]): number | null {
  const sum = subs.reduce((acc, s) => acc + (s.estimatedMinutes ?? 0), 0);
  return sum > 0 ? sum : null;
}

export const useTaskStore = create<TaskState & TaskActions>((set, get) => ({
  tasks: [],
  doneTasks: [],
  selectedTaskId: null,
  showDone: false,
  isLoaded: false,
  subtasks: {},
  subtaskCounts: {},

  loadTasks: async () => {
    try {
      const [tasks, subtaskCounts] = await Promise.all([getAllTasks(), dbGetSubtaskCounts()]);
      set({ tasks, subtaskCounts, isLoaded: true });
    } catch (e) {
      console.error("loadTasks failed:", e);
      set({ isLoaded: true }); // unblock UI
    }
  },

  loadDoneTasks: async () => {
    const doneTasks = await getDoneTasks();
    set({ doneTasks });
  },

  addTask: async (title, status, listId, estimatedMinutes) => {
    const id = crypto.randomUUID();
    const maxPos = await getMaxPosition(status);
    const position = maxPos + 1;
    await dbCreateTask(id, listId, title, status, position, estimatedMinutes);
    const newTask: Task = {
      id,
      listId,
      title,
      description: null,
      status,
      estimatedMinutes: estimatedMinutes ?? null,
      actualMinutes: 0,
      position,
      dueDate: null,
      recurrenceRule: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parentTaskId: null,
    };
    set((state) => ({ tasks: [...state.tasks, newTask] }));
  },

  updateTask: async (id, fields) => {
    await dbUpdateTask(id, fields);
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              ...(fields.title !== undefined && { title: fields.title }),
              ...(fields.description !== undefined && { description: fields.description }),
              ...(fields.status !== undefined && { status: fields.status as TaskStatus }),
              ...(fields.estimatedMinutes !== undefined && { estimatedMinutes: fields.estimatedMinutes }),
              ...(fields.actualMinutes !== undefined && { actualMinutes: fields.actualMinutes }),
              ...(fields.position !== undefined && { position: fields.position }),
              ...(fields.dueDate !== undefined && { dueDate: fields.dueDate }),
              ...(fields.recurrenceRule !== undefined && { recurrenceRule: fields.recurrenceRule }),
              ...(fields.listId !== undefined && { listId: fields.listId }),
            }
          : t
      ),
    }));
  },

  deleteTask: async (id) => {
    await dbDeleteTask(id);
    set((state) => {
      const subtasks = { ...state.subtasks };
      delete subtasks[id];
      const subtaskCounts = { ...state.subtaskCounts };
      delete subtaskCounts[id];
      return {
        tasks: state.tasks.filter((t) => t.id !== id),
        selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
        subtasks,
        subtaskCounts,
      };
    });
  },

  completeTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return null;
    await dbCompleteTask(id);

    // Cascade completion to any incomplete subtasks
    const incompleteSubs = (get().subtasks[id] ?? []).filter((s) => s.completedAt === null);
    for (const sub of incompleteSubs) {
      await dbToggleSubtask(sub.id, true, task.status);
    }
    if (incompleteSubs.length > 0) {
      const now = new Date().toISOString();
      set((state) => {
        const updated = (state.subtasks[id] ?? []).map((s) => ({
          ...s,
          completedAt: s.completedAt ?? now,
          status: "done" as TaskStatus,
        }));
        return {
          subtasks: { ...state.subtasks, [id]: updated },
          subtaskCounts: {
            ...state.subtaskCounts,
            [id]: {
              total: updated.length,
              done: updated.length,
              estimatedMinutesSum: state.subtaskCounts[id]?.estimatedMinutesSum ?? null,
            },
          },
        };
      });
    }

    try {
      const isVisible = await getCurrentWindow().isVisible();
      if (isVisible) {
        toast.success("Task completed!");
      } else {
        await emit("task-completed-toast", { title: task.title });
      }
    } catch {
      toast.success("Task completed!");
    }
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }));
    // Handle recurring tasks
    if (task.recurrenceRule) {
      const { getNextDueDate } = await import("@/lib/recurrence");
      const fromDate = task.dueDate ? new Date(task.dueDate) : new Date();
      const nextDue = getNextDueDate(
        task.recurrenceRule as import("@/lib/recurrence").RecurrenceRule,
        fromDate
      );
      const newId = crypto.randomUUID();
      const maxPos = await getMaxPosition("backlog");
      await dbCreateTask(newId, task.listId, task.title, "backlog", maxPos + 1, task.estimatedMinutes);
      await dbUpdateTask(newId, { dueDate: nextDue, recurrenceRule: task.recurrenceRule });
      const newTask: Task = {
        id: newId,
        listId: task.listId,
        title: task.title,
        description: task.description,
        status: "backlog",
        estimatedMinutes: task.estimatedMinutes,
        actualMinutes: 0,
        position: maxPos + 1,
        dueDate: nextDue,
        recurrenceRule: task.recurrenceRule,
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parentTaskId: null,
      };
      set((state) => ({ tasks: [...state.tasks, newTask] }));
    }
    return task;
  },

  uncompleteTask: async (id, restoreStatus) => {
    await dbUncompleteTask(id, restoreStatus);
    await get().loadTasks();
    await get().loadDoneTasks();
  },

  moveTask: async (id, newStatus) => {
    const maxPos = await getMaxPosition(newStatus);
    await dbUpdateTask(id, { status: newStatus, position: maxPos + 1 });
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, status: newStatus, position: maxPos + 1 } : t
      ),
    }));
  },

  reorderTasks: async (updates) => {
    await dbReorderTasks(updates);
    set((state) => {
      const updatesMap = new Map(updates.map((u) => [u.id, u]));
      return {
        tasks: state.tasks.map((t) => {
          const u = updatesMap.get(t.id);
          if (!u) return t;
          return {
            ...t,
            position: u.position,
            status: (u.status as TaskStatus) ?? t.status,
          };
        }),
      };
    });
  },

  selectTask: (id) => {
    set({ selectedTaskId: id });
  },

  toggleShowDone: () => {
    const { showDone } = get();
    if (!showDone) {
      get().loadDoneTasks();
    }
    set({ showDone: !showDone });
  },

  updateTaskInMemory: (id, fields) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...fields } : t)),
    }));
  },

  loadSubtasks: async (parentId) => {
    const items = await dbGetSubtasks(parentId);
    set((state) => ({ subtasks: { ...state.subtasks, [parentId]: items } }));
  },

  loadSubtaskCounts: async () => {
    const counts = await dbGetSubtaskCounts();
    set({ subtaskCounts: counts });
  },

  addSubtask: async (parentId, title, estimatedMinutes) => {
    const parent = get().tasks.find((t) => t.id === parentId);
    if (!parent) return;
    const id = crypto.randomUUID();
    const maxPos = await getMaxSubtaskPosition(parentId);
    const position = maxPos + 1;
    await dbCreateSubtask(id, parentId, parent.listId, title, parent.status, position, estimatedMinutes);
    const newSubtask: Task = {
      id,
      listId: parent.listId,
      title,
      description: null,
      status: parent.status,
      estimatedMinutes: estimatedMinutes ?? null,
      actualMinutes: 0,
      position,
      dueDate: null,
      recurrenceRule: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parentTaskId: parentId,
    };
    set((state) => {
      const updated = [...(state.subtasks[parentId] ?? []), newSubtask];
      return {
        subtasks: { ...state.subtasks, [parentId]: updated },
        subtaskCounts: {
          ...state.subtaskCounts,
          [parentId]: {
            total: (state.subtaskCounts[parentId]?.total ?? 0) + 1,
            done: state.subtaskCounts[parentId]?.done ?? 0,
            estimatedMinutesSum: calcEstSum(updated),
          },
        },
      };
    });
  },

  updateSubtask: async (parentId, subtaskId, fields) => {
    await dbUpdateTask(subtaskId, fields);
    set((state) => {
      const updated = (state.subtasks[parentId] ?? []).map((s) =>
        s.id === subtaskId
          ? {
              ...s,
              ...(fields.estimatedMinutes !== undefined && { estimatedMinutes: fields.estimatedMinutes }),
              ...(fields.title !== undefined && { title: fields.title }),
            }
          : s
      );
      return {
        subtasks: { ...state.subtasks, [parentId]: updated },
        subtaskCounts: {
          ...state.subtaskCounts,
          [parentId]: {
            ...(state.subtaskCounts[parentId] ?? { total: updated.length, done: 0 }),
            estimatedMinutesSum: calcEstSum(updated),
          },
        },
      };
    });
  },

  toggleSubtask: async (parentId, subtaskId) => {
    const list = get().subtasks[parentId] ?? [];
    const subtask = list.find((s) => s.id === subtaskId);
    if (!subtask) return;
    const isDone = subtask.completedAt !== null;
    const restoreStatus = get().tasks.find((t) => t.id === parentId)?.status ?? "today";
    await dbToggleSubtask(subtaskId, !isDone, restoreStatus);
    set((state) => {
      const updated = (state.subtasks[parentId] ?? []).map((s) =>
        s.id === subtaskId
          ? { ...s, completedAt: isDone ? null : new Date().toISOString(), status: (isDone ? restoreStatus : "done") as TaskStatus }
          : s
      );
      const doneCount = updated.filter((s) => s.completedAt !== null).length;
      return {
        subtasks: { ...state.subtasks, [parentId]: updated },
        subtaskCounts: {
          ...state.subtaskCounts,
          [parentId]: { total: updated.length, done: doneCount, estimatedMinutesSum: calcEstSum(updated) },
        },
      };
    });
  },

  deleteSubtask: async (parentId, subtaskId) => {
    await dbDeleteSubtask(subtaskId);
    set((state) => {
      const updated = (state.subtasks[parentId] ?? []).filter((s) => s.id !== subtaskId);
      const doneCount = updated.filter((s) => s.completedAt !== null).length;
      return {
        subtasks: { ...state.subtasks, [parentId]: updated },
        subtaskCounts: {
          ...state.subtaskCounts,
          [parentId]: { total: updated.length, done: doneCount, estimatedMinutesSum: calcEstSum(updated) },
        },
      };
    });
  },

  reorderSubtasks: async (parentId, orderedIds) => {
    const updates = orderedIds.map((id, i) => ({ id, position: i }));
    await dbReorderSubtasks(updates);
    set((state) => {
      const map = new Map((state.subtasks[parentId] ?? []).map((s) => [s.id, s]));
      const reordered = orderedIds.map((id, i) => ({ ...map.get(id)!, position: i }));
      return { subtasks: { ...state.subtasks, [parentId]: reordered } };
    });
  },
}));

/** Selector: tasks for a given status column, sorted by position */
export function useTasksByColumn(status: TaskStatus, listId?: string | null): Task[] {
  return useTaskStore(
    useShallow((state) =>
      state.tasks
        .filter((t) => t.status === status && t.parentTaskId === null && (listId == null || t.listId === listId))
        .sort((a, b) => a.position - b.position)
    )
  );
}

/** Selector: subtasks for a given parent task */
export function useSubtasks(parentId: string): Task[] {
  return useTaskStore(
    useShallow((state) => state.subtasks[parentId] ?? [])
  );
}

/** Selector: subtask progress for a given parent task */
export function useSubtaskProgress(parentId: string): { done: number; total: number } | null {
  return useTaskStore((state) => {
    const counts = state.subtaskCounts[parentId];
    if (!counts || counts.total === 0) return null;
    return counts;
  });
}
