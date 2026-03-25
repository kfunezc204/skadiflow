import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { toast } from "@/lib/toast";
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
};

type TaskState = {
  tasks: Task[];
  doneTasks: Task[];
  selectedTaskId: string | null;
  showDone: boolean;
  isLoaded: boolean;
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
};

export const useTaskStore = create<TaskState & TaskActions>((set, get) => ({
  tasks: [],
  doneTasks: [],
  selectedTaskId: null,
  showDone: false,
  isLoaded: false,

  loadTasks: async () => {
    try {
      const tasks = await getAllTasks();
      set({ tasks, isLoaded: true });
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
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
    }));
  },

  completeTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id);
    if (!task) return null;
    await dbCompleteTask(id);
    toast.success("Task completed!");
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
}));

/** Selector: tasks for a given status column, sorted by position */
export function useTasksByColumn(status: TaskStatus): Task[] {
  return useTaskStore(
    useShallow((state) =>
      state.tasks
        .filter((t) => t.status === status)
        .sort((a, b) => a.position - b.position)
    )
  );
}
