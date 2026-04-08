import Database from "@tauri-apps/plugin-sql";

// Promise singleton — prevents race condition when multiple callers hit getDb()
// before the first Database.load() completes (e.g. React StrictMode double-invoke).
let _dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!_dbPromise) {
    _dbPromise = Database.load("sqlite:skadiflow.db");
  }
  return _dbPromise;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<Array<{ value: string }>>(
    "SELECT value FROM settings WHERE key = $1",
    [key]
  );
  return rows.length > 0 ? rows[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value]
  );
}

// ─── Internal row types (snake_case from SQLite) ─────────────────────────────

type ListRow = {
  id: string;
  name: string;
  color: string;
  icon: string;
  position: number;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: string;
  list_id: string;
  title: string;
  description: string | null;
  status: string;
  estimated_minutes: number | null;
  actual_minutes: number;
  position: number;
  due_date: string | null;
  recurrence_rule: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  parent_task_id: string | null;
};

// ─── List helpers ─────────────────────────────────────────────────────────────

import type { List } from "@/stores/listStore";

function rowToList(row: ListRow): List {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAllLists(): Promise<List[]> {
  const db = await getDb();
  const rows = await db.select<ListRow[]>(
    "SELECT * FROM lists ORDER BY position ASC"
  );
  return rows.map(rowToList);
}

export async function createList(
  id: string,
  name: string,
  color: string,
  icon: string,
  position: number
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO lists (id, name, color, icon, position) VALUES ($1, $2, $3, $4, $5)",
    [id, name, color, icon, position]
  );
}

export async function updateList(
  id: string,
  fields: Partial<{ name: string; color: string; icon: string; position: number }>
): Promise<void> {
  const db = await getDb();
  const parts: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (fields.name !== undefined) { parts.push(`name = $${i++}`); values.push(fields.name); }
  if (fields.color !== undefined) { parts.push(`color = $${i++}`); values.push(fields.color); }
  if (fields.icon !== undefined) { parts.push(`icon = $${i++}`); values.push(fields.icon); }
  if (fields.position !== undefined) { parts.push(`position = $${i++}`); values.push(fields.position); }
  if (parts.length === 0) return;
  parts.push(`updated_at = datetime('now')`);
  values.push(id);
  await db.execute(
    `UPDATE lists SET ${parts.join(", ")} WHERE id = $${i}`,
    values
  );
}

export async function deleteList(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM lists WHERE id = $1", [id]);
}

export async function reorderLists(
  updates: Array<{ id: string; position: number }>
): Promise<void> {
  const db = await getDb();
  for (const u of updates) {
    await db.execute(
      "UPDATE lists SET position = $1, updated_at = datetime('now') WHERE id = $2",
      [u.position, u.id]
    );
  }
}

// ─── Task helpers ─────────────────────────────────────────────────────────────

import type { Task } from "@/stores/taskStore";

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    description: row.description,
    status: row.status as Task["status"],
    estimatedMinutes: row.estimated_minutes,
    actualMinutes: row.actual_minutes,
    position: row.position,
    dueDate: row.due_date,
    recurrenceRule: row.recurrence_rule,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    parentTaskId: row.parent_task_id,
  };
}

export async function getAllTasks(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<TaskRow[]>(
    "SELECT * FROM tasks WHERE status != 'done' AND parent_task_id IS NULL ORDER BY position ASC"
  );
  return rows.map(rowToTask);
}

export async function getDoneTasks(limit = 50): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<TaskRow[]>(
    "SELECT * FROM tasks WHERE status = 'done' AND parent_task_id IS NULL ORDER BY completed_at DESC LIMIT $1",
    [limit]
  );
  return rows.map(rowToTask);
}

export async function createTask(
  id: string,
  listId: string,
  title: string,
  status: string,
  position: number,
  estimatedMinutes?: number | null
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO tasks (id, list_id, title, status, position, estimated_minutes) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, listId, title, status, position, estimatedMinutes ?? null]
  );
}

export async function updateTask(
  id: string,
  fields: Partial<{
    title: string;
    description: string | null;
    status: string;
    estimatedMinutes: number | null;
    actualMinutes: number;
    position: number;
    dueDate: string | null;
    recurrenceRule: string | null;
    listId: string;
  }>
): Promise<void> {
  const db = await getDb();
  const parts: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (fields.title !== undefined) { parts.push(`title = $${i++}`); values.push(fields.title); }
  if (fields.description !== undefined) { parts.push(`description = $${i++}`); values.push(fields.description); }
  if (fields.status !== undefined) { parts.push(`status = $${i++}`); values.push(fields.status); }
  if (fields.estimatedMinutes !== undefined) { parts.push(`estimated_minutes = $${i++}`); values.push(fields.estimatedMinutes); }
  if (fields.actualMinutes !== undefined) { parts.push(`actual_minutes = $${i++}`); values.push(fields.actualMinutes); }
  if (fields.position !== undefined) { parts.push(`position = $${i++}`); values.push(fields.position); }
  if (fields.dueDate !== undefined) { parts.push(`due_date = $${i++}`); values.push(fields.dueDate); }
  if (fields.recurrenceRule !== undefined) { parts.push(`recurrence_rule = $${i++}`); values.push(fields.recurrenceRule); }
  if (fields.listId !== undefined) { parts.push(`list_id = $${i++}`); values.push(fields.listId); }
  if (parts.length === 0) return;
  parts.push(`updated_at = datetime('now')`);
  values.push(id);
  await db.execute(
    `UPDATE tasks SET ${parts.join(", ")} WHERE id = $${i}`,
    values
  );
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
}

export async function completeTask(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET status = 'done', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = $1",
    [id]
  );
}

export async function uncompleteTask(
  id: string,
  restoreStatus: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET status = $1, completed_at = NULL, updated_at = datetime('now') WHERE id = $2",
    [restoreStatus, id]
  );
}

export async function getMaxPosition(status: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<Array<{ max_pos: number | null }>>(
    "SELECT COALESCE(MAX(position), -1) as max_pos FROM tasks WHERE status = $1",
    [status]
  );
  return rows[0]?.max_pos ?? -1;
}

export async function reorderTasks(
  updates: Array<{ id: string; position: number; status?: string }>
): Promise<void> {
  const db = await getDb();
  for (const u of updates) {
    if (u.status !== undefined) {
      await db.execute(
        "UPDATE tasks SET position = $1, status = $2, updated_at = datetime('now') WHERE id = $3",
        [u.position, u.status, u.id]
      );
    } else {
      await db.execute(
        "UPDATE tasks SET position = $1, updated_at = datetime('now') WHERE id = $2",
        [u.position, u.id]
      );
    }
  }
}

// ─── Subtask helpers ──────────────────────────────────────────────────────────

export async function getSubtasks(parentId: string): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<TaskRow[]>(
    "SELECT * FROM tasks WHERE parent_task_id = $1 ORDER BY position ASC",
    [parentId]
  );
  return rows.map(rowToTask);
}

export async function getSubtaskCounts(): Promise<Record<string, { total: number; done: number; estimatedMinutesSum: number | null }>> {
  const db = await getDb();
  const rows = await db.select<Array<{ parent_task_id: string; total: number; done: number; est_sum: number | null }>>(
    `SELECT parent_task_id,
            COUNT(*) as total,
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
            SUM(estimated_minutes) as est_sum
     FROM tasks
     WHERE parent_task_id IS NOT NULL
     GROUP BY parent_task_id`
  );
  const result: Record<string, { total: number; done: number; estimatedMinutesSum: number | null }> = {};
  for (const r of rows) {
    result[r.parent_task_id] = { total: r.total, done: r.done, estimatedMinutesSum: r.est_sum };
  }
  return result;
}

export async function createSubtask(
  id: string,
  parentId: string,
  listId: string,
  title: string,
  status: string,
  position: number,
  estimatedMinutes?: number | null,
  description?: string | null
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO tasks (id, list_id, title, description, status, position, parent_task_id, estimated_minutes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [id, listId, title, description ?? null, status, position, parentId, estimatedMinutes ?? null]
  );
}

export async function toggleSubtask(id: string, done: boolean, restoreStatus: string): Promise<void> {
  const db = await getDb();
  if (done) {
    await db.execute(
      "UPDATE tasks SET status = 'done', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = $1",
      [id]
    );
  } else {
    await db.execute(
      "UPDATE tasks SET status = $1, completed_at = NULL, updated_at = datetime('now') WHERE id = $2",
      [restoreStatus, id]
    );
  }
}

export async function deleteSubtask(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
}

export async function reorderSubtasks(
  updates: Array<{ id: string; position: number }>
): Promise<void> {
  const db = await getDb();
  for (const u of updates) {
    await db.execute(
      "UPDATE tasks SET position = $1, updated_at = datetime('now') WHERE id = $2",
      [u.position, u.id]
    );
  }
}

export async function getMaxSubtaskPosition(parentId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<Array<{ max_pos: number | null }>>(
    "SELECT COALESCE(MAX(position), -1) as max_pos FROM tasks WHERE parent_task_id = $1",
    [parentId]
  );
  return rows[0]?.max_pos ?? -1;
}

// ─── Session helpers ──────────────────────────────────────────────────────────

type SessionRow = {
  id: string;
  task_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  session_type: string;
  notes: string | null;
};

export type Session = {
  id: string;
  taskId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  sessionType: "focus" | "break";
  notes: string | null;
};

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    taskId: row.task_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMinutes: row.duration_minutes,
    sessionType: row.session_type as "focus" | "break",
    notes: row.notes,
  };
}

export async function createSession(
  id: string,
  taskId: string | null,
  sessionType: "focus" | "break",
  startedAt: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO sessions (id, task_id, session_type, started_at) VALUES ($1, $2, $3, $4)",
    [id, taskId, sessionType, startedAt]
  );
}

export async function endSession(
  id: string,
  endedAt: string,
  durationMinutes: number
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE sessions SET ended_at = $1, duration_minutes = $2 WHERE id = $3",
    [endedAt, durationMinutes, id]
  );
}

export async function getSessionsByDateRange(
  from: string,
  to: string
): Promise<Session[]> {
  const db = await getDb();
  const rows = await db.select<SessionRow[]>(
    "SELECT * FROM sessions WHERE started_at >= $1 AND started_at <= $2 ORDER BY started_at DESC",
    [from, to]
  );
  return rows.map(rowToSession);
}

export async function getSessionsByTaskId(taskId: string): Promise<Session[]> {
  const db = await getDb();
  const rows = await db.select<SessionRow[]>(
    "SELECT * FROM sessions WHERE task_id = $1 ORDER BY started_at DESC",
    [taskId]
  );
  return rows.map(rowToSession);
}

// ─── Report query helpers ─────────────────────────────────────────────────────

export async function getTaskTotalFocusMinutes(taskId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.select<Array<{ total: number | null }>>(
    "SELECT SUM(duration_minutes) as total FROM sessions WHERE task_id = $1 AND session_type = 'focus' AND duration_minutes IS NOT NULL",
    [taskId]
  );
  return rows[0]?.total ?? 0;
}

export async function getCompletedTasksByDateRange(from: string, to: string): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<TaskRow[]>(
    "SELECT * FROM tasks WHERE status = 'done' AND parent_task_id IS NULL AND completed_at >= $1 AND completed_at <= $2 ORDER BY completed_at DESC",
    [from, to]
  );
  return rows.map(rowToTask);
}

export type FocusByList = {
  listId: string;
  minutes: number;
};

export async function getFocusMinutesByList(from: string, to: string): Promise<FocusByList[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ list_id: string; minutes: number }>>(
    `SELECT t.list_id, SUM(s.duration_minutes) as minutes
     FROM sessions s
     JOIN tasks t ON s.task_id = t.id
     WHERE s.session_type = 'focus'
       AND s.started_at >= $1
       AND s.started_at <= $2
       AND s.duration_minutes IS NOT NULL
     GROUP BY t.list_id`,
    [from, to]
  );
  return rows.map((r) => ({ listId: r.list_id, minutes: r.minutes }));
}

export type DailyStats = {
  date: string;
  count: number;
  focusMinutes: number;
};

export async function getTasksCompletedPerDay(from: string, to: string): Promise<Array<{ date: string; count: number }>> {
  const db = await getDb();
  const rows = await db.select<Array<{ date: string; count: number }>>(
    `SELECT date(completed_at) as date, COUNT(*) as count
     FROM tasks
     WHERE status = 'done' AND parent_task_id IS NULL AND completed_at >= $1 AND completed_at <= $2
     GROUP BY date(completed_at)`,
    [from, to]
  );
  return rows;
}

export async function getFocusMinutesPerDay(from: string, to: string): Promise<Array<{ date: string; focusMinutes: number }>> {
  const db = await getDb();
  const rows = await db.select<Array<{ date: string; focusMinutes: number }>>(
    `SELECT date(started_at) as date, SUM(duration_minutes) as focusMinutes
     FROM sessions
     WHERE session_type = 'focus'
       AND started_at >= $1
       AND started_at <= $2
       AND duration_minutes IS NOT NULL
     GROUP BY date(started_at)`,
    [from, to]
  );
  return rows;
}

export type SessionWithTask = Session & { taskTitle: string | null };

export async function getSessionsWithTaskNames(from: string, to: string): Promise<SessionWithTask[]> {
  const db = await getDb();
  const rows = await db.select<Array<SessionRow & { task_title: string | null }>>(
    `SELECT s.*, t.title as task_title
     FROM sessions s
     LEFT JOIN tasks t ON s.task_id = t.id
     WHERE s.started_at >= $1 AND s.started_at <= $2
       AND s.ended_at IS NOT NULL
     ORDER BY s.started_at DESC`,
    [from, to]
  );
  return rows.map((r) => ({
    ...rowToSession(r),
    taskTitle: r.task_title,
  }));
}

export async function getAllFocusSessionDates(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<Array<{ date: string }>>(
    "SELECT DISTINCT date(started_at) as date FROM sessions WHERE session_type = 'focus' AND duration_minutes IS NOT NULL ORDER BY date DESC"
  );
  return rows.map((r) => r.date);
}

// ─── Blocker profile helpers ──────────────────────────────────────────────────

type BlockerProfileRow = {
  id: string;
  name: string;
  is_default: number;
  created_at: string;
};

type BlockerDomainRow = {
  id: string;
  profile_id: string;
  domain: string;
};

export type BlockerProfile = {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  domains: string[];
};

export async function getAllBlockerProfiles(): Promise<BlockerProfile[]> {
  const db = await getDb();
  const profiles = await db.select<BlockerProfileRow[]>(
    "SELECT * FROM blocker_profiles ORDER BY created_at ASC"
  );
  const domains = await db.select<BlockerDomainRow[]>(
    "SELECT * FROM blocker_domains"
  );
  return profiles.map((p) => ({
    id: p.id,
    name: p.name,
    isDefault: p.is_default === 1,
    createdAt: p.created_at,
    domains: domains.filter((d) => d.profile_id === p.id).map((d) => d.domain),
  }));
}

export async function createBlockerProfile(
  id: string,
  name: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO blocker_profiles (id, name) VALUES ($1, $2)",
    [id, name]
  );
}

export async function updateBlockerProfile(
  id: string,
  name: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE blocker_profiles SET name = $1 WHERE id = $2",
    [name, id]
  );
}

export async function deleteBlockerProfile(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM blocker_profiles WHERE id = $1", [id]);
}

export async function setBlockerDomains(
  profileId: string,
  domains: string[]
): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM blocker_domains WHERE profile_id = $1", [profileId]);
  for (const domain of domains) {
    const trimmed = domain.trim();
    if (!trimmed) continue;
    const id = crypto.randomUUID();
    await db.execute(
      "INSERT INTO blocker_domains (id, profile_id, domain) VALUES ($1, $2, $3)",
      [id, profileId, trimmed]
    );
  }
}
