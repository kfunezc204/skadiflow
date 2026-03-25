# Productivity App — Build Plan

> A desktop productivity app inspired by [Blitzit](https://www.blitzit.app): task management, focus timers, time tracking, and analytics. Dark mode by default.

---

## Tech Stack

| Layer            | Technology                                | Why                                               |
| ---------------- | ----------------------------------------- | ------------------------------------------------- |
| Desktop Shell    | **Tauri v2** (Rust)                       | Lightweight, fast, native APIs, small bundle      |
| Frontend         | **React 18 + TypeScript + Vite**          | Fast DX, strong ecosystem                         |
| UI Components    | **Shadcn/ui**                             | Unstyled-by-default, fully customizable           |
| Styling          | **Tailwind CSS v4**                       | Utility-first, dark mode via `class` strategy     |
| State Management | **Zustand**                               | Minimal boilerplate, works great with local-first |
| Local Database   | **SQLite** via `tauri-plugin-sql`         | Zero-config, offline-first                        |
| Optional Cloud   | **Supabase** (Postgres + Auth + Realtime) | Sync when online, auth for multi-device           |
| Drag & Drop      | **@dnd-kit/core**                         | Accessible, touch-friendly                        |
| Charts           | **Recharts**                              | Lightweight, composable                           |
| Animations       | **Framer Motion**                         | Smooth task completion, panel transitions         |
| Forms            | **React Hook Form + Zod**                 | Type-safe validation                              |
| Dates            | **date-fns**                              | Lightweight, tree-shakable                        |
| AI               | **Anthropic SDK** (Claude)                | AI task assistant                                 |
| Integrations     | **Notion REST API**                       | Import/migrate tasks                              |
| Icons            | **Lucide React**                          | Consistent icon set                               |

---

## Color & Design

- **Default**: Dark mode (`class="dark"` on `<html>`)
- **Toggle**: Persisted in localStorage + SQLite settings
- **Accent**: Orange/coral tones (`#F97316` orange-500) — matches Blitzit energy
- **Font**: Inter (system UI fallback)
- **Radius**: `--radius: 0.5rem` (Shadcn default)
- **Shadows**: Subtle, layered for cards/panels

---

## Database Schema (SQLite)

```sql
-- Lists (projects/categories)
CREATE TABLE lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  position INTEGER,
  created_at TEXT,
  updated_at TEXT
);

-- Tasks
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  list_id TEXT REFERENCES lists(id),
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'backlog',  -- backlog | this_week | today | done
  priority INTEGER DEFAULT 0,
  est_minutes INTEGER,            -- estimated duration
  actual_minutes INTEGER,         -- logged time
  due_date TEXT,
  is_recurring INTEGER DEFAULT 0,
  recurrence_rule TEXT,           -- cron-like string
  completed_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

-- Timer Sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  started_at TEXT,
  ended_at TEXT,
  duration_seconds INTEGER,
  type TEXT DEFAULT 'focus',      -- focus | break
  created_at TEXT
);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Tags
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT,
  color TEXT
);

CREATE TABLE task_tags (
  task_id TEXT,
  tag_id TEXT,
  PRIMARY KEY (task_id, tag_id)
);
```

---

## App Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo]  [Lists Sidebar]           [Search]  [Settings]  [User] │  ← Titlebar
├──────────┬──────────────────────────────────────────────────────┤
│          │                                                       │
│  LISTS   │   KANBAN BOARD   /   FOCUS MODE   /   REPORTS        │
│  ──────  │                                                       │
│  Inbox   │  ┌─────────┐  ┌───────────┐  ┌──────────────┐       │
│  Work    │  │ BACKLOG │  │ THIS WEEK │  │    TODAY     │       │
│  Personal│  │         │  │           │  │              │       │
│  ──────  │  │ task    │  │ task      │  │ task ▶       │       │
│  + List  │  │ task    │  │ task      │  │ task ▶       │       │
│          │  │ + Add   │  │ + Add     │  │ + Add        │       │
│          │  └─────────┘  └───────────┘  └──────────────┘       │
│  ──────  │                                                       │
│  Reports │                                                       │
│  Settings│                                                       │
└──────────┴──────────────────────────────────────────────────────┘
```

---

## Features (Full Scope — same as Blitzit)

### Task Management

- Create tasks with title, EST, notes, links
- 3-column Kanban: Backlog / This Week / Today
- Drag & drop between and within columns
- Reorder via arrow icons on hover
- Task priority ordering
- Inline title editing
- Checkbox completion with confetti/celebration animation
- Recurring tasks (daily / weekly / monthly / custom)
- Task notes with rich text + URL links
- Multiple lists (projects/categories)

### Focus Mode (Blitz Mode)

- One-click start Focus Session from Today column
- Current task highlighted with live timer
- Auto-advance to next task on completion
- Pomodoro intervals (25/5, 50/10, custom)
- Break timer with auto-resume
- Keyboard shortcuts (Space = pause/resume, Skip, Done)
- Full-screen focus overlay (distraction-free)
- Session history log

### Focus Locker (Website Blocker)

- Dedicated **Locker** page/panel to manage a blocklist of URLs/domains
- Add, edit, and remove domains (e.g. `twitter.com`, `youtube.com`, `reddit.com`)
- Organize blocklists into named **profiles** (e.g. "Deep Work", "No Social")
- Assign a profile to each Focus session (or use a global default)
- While Focus Mode is active → blocked domains redirect to `127.0.0.1` via hosts file edit
- Session ends or is paused → hosts file rules are automatically removed
- Requires one-time OS permission (Tauri runs elevated command via `tauri-plugin-shell`)
- Visual indicator in Focus overlay showing "Locker is ON" with blocked domain count
- Breaks respect Locker (sites stay blocked during short breaks, unlocked on long break — configurable)

### Time Tracking

- Auto-track time when timer runs
- Manual time adjustment (while paused)
- EST vs Actual time display on tasks
- Total time per list/day/week

### Analytics & Reports

- Daily/weekly productivity summary
- Time breakdown by list/category (donut chart)
- Tasks completed per day (bar chart)
- Punctuality score (EST accuracy)
- Streak tracking
- PDF export

### Settings & UX

- Dark / Light mode toggle (persisted)
- Pomodoro timer durations (customizable)
- Notification alerts (system tray + sound)
- Keyboard shortcuts cheatsheet
- Auto-start timer option
- Week start day (Mon/Sun)

### Integrations (MCP-powered)

- **Notion**: Import tasks from Notion databases (migration helper)
- **Google Calendar**: Sync today's tasks as calendar events
- **Claude AI**: Brain dump → organized tasks, smart scheduling

---

## Milestones

---

### Milestone 1 — Project Foundation

**Goal**: Runnable app with correct tech stack, layout shell, and database.

**Tasks:**

- [ ] Scaffold Tauri v2 + React + TypeScript + Vite project
- [ ] Install and configure Tailwind CSS v4 + dark mode class strategy
- [ ] Install and configure Shadcn/ui (dark theme, orange accent)
- [ ] Set up tauri-plugin-sql + SQLite
- [ ] Run and test all DB migrations on first launch
- [ ] Build app shell: sidebar + main content area + custom titlebar
- [ ] Set up React Router (routes: `/`, `/focus`, `/reports`, `/settings`)
- [ ] Set up Zustand stores (tasks, lists, settings, timer)
- [ ] Set up window drag region for custom titlebar
- [ ] Configure Tauri window settings (min size, decorations, tray)

**Deliverable**: App opens, sidebar visible, routes working, DB initialized.

---

### Milestone 2 — Task Management Core

**Goal**: Full CRUD task management with 3-column Kanban.

**Tasks:**

- [ ] Lists sidebar (create, rename, delete, color/icon picker)
- [ ] 3-column Kanban board (Backlog / This Week / Today)
- [ ] Task cards with: title, EST badge, time-taken badge, list color dot
- [ ] Add task inline (bottom of column) with quick EST parsing (`"30 min"`, `"1 hr"`)
- [ ] Task detail side panel (click to expand): notes, links, recurrence, EST/actual edit
- [ ] Inline title editing on card
- [ ] Drag & drop between and within columns (@dnd-kit)
- [ ] Arrow icon hover actions (move up/down, move to next column)
- [ ] Checkbox completion with confetti (canvas-confetti)
- [ ] Move completed tasks to Done (hidden by default, toggle to show)
- [ ] Recurring task engine: auto-recreate tasks based on recurrence rule
- [ ] Task due date picker

**Deliverable**: Can create, organize, and complete tasks across columns.

---

### Milestone 3 — Focus Mode & Timer

**Goal**: Pomodoro-based focus sessions with live timer.

**Tasks:**

- [ ] Focus Mode route (`/focus`) with full-screen overlay
- [ ] Start Focus Session button on Today column
- [ ] Live timer display (MM:SS) per current task
- [ ] Pomodoro cycle: focus → short break → focus → long break
- [ ] Timer controls: Start / Pause / Resume / Skip / Done
- [ ] Keyboard shortcuts: `Space` (pause/resume), `S` (skip), `D` (done), `Esc` (exit)
- [ ] Auto-advance to next task in Today queue on completion
- [ ] Progress bar for current Pomodoro interval
- [ ] Session log: task name, duration, type (focus/break), timestamp
- [ ] System notification when break starts/ends
- [ ] Timer persistence: resume timer if app is closed and reopened mid-session
- [ ] Mini timer widget in sidebar (visible while browsing other views)

#### Focus Locker (Website Blocker)

- [ ] Locker page/panel (`/settings/locker` or sidebar section)
- [ ] Add/remove/edit blocked domains with validation
- [ ] Named blocklist profiles (create, rename, delete)
- [ ] Assign profile to a Focus session before starting
- [ ] On Focus start → write blocked domains to system hosts file (`/etc/hosts` or `C:\Windows\System32\drivers\etc\hosts`) via Tauri shell with elevated privileges
- [ ] On Focus end/pause → clean up injected hosts entries
- [ ] "Locker ON" badge in Focus overlay with count of blocked sites
- [ ] Configurable: keep Locker active during short breaks (toggle in settings)
- [ ] Graceful fallback if permission denied (warn user, skip blocking)

**Deliverable**: Full focus session flow with timer, breaks, task queue, and website blocking.

---

### Milestone 4 — Time Tracking & Reports

**Goal**: Analytics dashboard showing productivity metrics.

**Tasks:**

- [ ] Auto-log session durations to `sessions` table
- [ ] Manual time correction UI on task card (paused state only)
- [ ] EST vs Actual time indicator on task cards (green/yellow/red)
- [ ] Reports page (`/reports`)
  - [ ] Date range picker (today / this week / this month / custom)
  - [ ] Total focus time card
  - [ ] Tasks completed card
  - [ ] Avg. EST accuracy card
  - [ ] Time by list (donut chart — Recharts)
  - [ ] Tasks per day bar chart (Recharts)
  - [ ] Session history table (task, duration, date)
- [ ] Streak counter (days with at least one completed task)
- [ ] PDF report export (using Tauri's print/PDF API)

**Deliverable**: Reports page with charts and exportable summary.

---

### Milestone 5 — Settings, Polish & UX

**Goal**: Production-quality UX with all settings and shortcuts.

**Tasks:**

- [ ] Settings page (`/settings`)
  - [ ] Dark/light mode toggle
  - [ ] Pomodoro durations (focus, short break, long break)
  - [ ] Notification sound on/off
  - [ ] Week start day
  - [ ] Auto-start next Pomodoro toggle
  - [ ] Account section (placeholder for cloud sync)
- [ ] System tray icon (show/hide window, quick add task)
- [ ] Global keyboard shortcuts (via Tauri globalShortcut)
  - [ ] `Ctrl+N` → New task
  - [ ] `Ctrl+F` → Start Focus Mode
  - [ ] `Ctrl+,` → Settings
- [ ] Keyboard shortcut modal (cheatsheet)
- [ ] Smooth animations: task add/remove, column transitions (Framer Motion)
- [ ] Onboarding flow for first-time users (3-step modal)
- [ ] Empty state illustrations for columns
- [ ] Toast notifications (Shadcn Sonner)
- [ ] App auto-updater (Tauri updater plugin)

**Deliverable**: Polished, shippable v1 app.

---

### Milestone 6 — Subtasks

**Goal**: Add subtask support to tasks — create, check off, reorder, and display progress.

**Tasks:**

#### Database
- [ ] Migration `003_subtasks.sql`: `ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE`
- [ ] Add index: `CREATE INDEX idx_tasks_parent ON tasks(parent_task_id)`
- [ ] Register migration in `src-tauri/src/lib.rs`

#### Data Layer (`src/lib/db.ts`)
- [ ] Add `parent_task_id` to `TaskRow` type
- [ ] Update `rowToTask()` mapping → `parentTaskId`
- [ ] New: `getSubtasks(parentTaskId)` — SELECT where parent_task_id = ?
- [ ] New: `createSubtask(parentTaskId, title)` — INSERT with parent_task_id
- [ ] New: `toggleSubtask(id, completed)` — toggle done/undone
- [ ] New: `deleteSubtask(id)` — DELETE single subtask
- [ ] New: `reorderSubtasks(parentTaskId, updates)` — batch position update
- [ ] Update `getAllTasks()` → add `WHERE parent_task_id IS NULL` to exclude subtasks from Kanban

#### Store (`src/stores/taskStore.ts`)
- [ ] Add `parentTaskId: string | null` to `Task` type
- [ ] New state: `subtasks: Record<string, Task[]>` — keyed by parent task ID
- [ ] New actions: `loadSubtasks(parentId)`, `addSubtask(parentId, title)`, `toggleSubtask(id, parentId)`, `deleteSubtask(id, parentId)`, `reorderSubtasks(parentId, orderedIds)`
- [ ] New selector: `useSubtasks(parentId)` — returns subtasks for a given parent
- [ ] New selector: `useSubtaskProgress(parentId)` — returns `{ done: number, total: number }`
- [ ] Update `useTasksByColumn` to filter out tasks where `parentTaskId !== null`
- [ ] Update `deleteTask` — CASCADE handles DB, but also clear subtasks from state
- [ ] Update `completeTask` — auto-complete all subtasks when parent is completed

#### UI — TaskCard (`src/components/tasks/TaskCard.tsx`)
- [ ] Add subtask progress badge in meta row (e.g., "2/5 ✓") when task has subtasks
- [ ] Use `useSubtaskProgress(task.id)` selector
- [ ] Only show badge when total > 0

#### UI — TaskDetailPanel (`src/components/tasks/TaskDetailPanel.tsx`)
- [ ] Add subtask section between Recurrence and Notes
- [ ] List subtasks with checkbox + title (inline edit on click)
- [ ] "Add subtask" inline input at bottom of list
- [ ] Delete button (X icon) on hover per subtask
- [ ] Drag-to-reorder or up/down arrow buttons
- [ ] Progress bar or fraction display at section header

**Deliverable**: Tasks can have subtasks; subtask checkboxes work in detail panel; progress shown on cards.

---

### Milestone 7 — List Filtering & All Lists View

**Goal**: Make list selection in sidebar actually filter the Kanban board; "All Tasks" shows combined view.

**Tasks:**

#### Store Changes (`src/stores/taskStore.ts`)
- [ ] Update `useTasksByColumn(status)` to accept or read `selectedListId` from `listStore`
- [ ] When `selectedListId === null` → show all tasks (current behavior)
- [ ] When `selectedListId !== null` → filter tasks by `listId === selectedListId`
- [ ] Cross-store access: use `useListStore.getState().selectedListId` inside selector, or pass as parameter

#### Kanban Board Header
- [ ] Show current list name + color in board header area
- [ ] When "All Tasks" selected → show "All Tasks" header
- [ ] When specific list selected → show list name + icon

#### Task Card Enhancement (`src/components/tasks/TaskCard.tsx`)
- [ ] In "All Tasks" view: show list name label next to the color dot
- [ ] In single-list view: hide list name label (color dot sufficient)

#### Sidebar Polish (`src/components/layout/Sidebar.tsx`)
- [ ] Ensure "All Tasks" has visual distinction (bold or different icon) when active
- [ ] Show task count per list in sidebar
- [ ] Show total task count next to "All Tasks"

#### InlineTaskAdd (`src/components/tasks/InlineTaskAdd.tsx`)
- [ ] When in "All Tasks" view and adding a task → show a list picker dropdown to choose which list
- [ ] Default to "Inbox" if no list selected

**Deliverable**: Clicking a list in the sidebar filters the board to that list's tasks; "All Tasks" shows everything.

---

### Milestone 8 — Focus Mode Enhancements

**Goal**: Floating always-on-top timer window (Blitzit-style), auto-open task links, custom backgrounds, and ambient sounds.

**Tasks:**

#### Floating Focus Timer (core feature)

When the user starts a Focus session, the main window hides to the system tray and a small always-on-top floating timer window appears. This mirrors Blitzit's Blitz Mode UX.

##### Tauri Window Setup
- [ ] Add `"floating-timer"` window to `src-tauri/tauri.conf.json`:
  - `label: "floating-timer"`, `url: "/floating-timer"`, `width: 340`, `height: 88`
  - `decorations: false`, `alwaysOnTop: true`, `visible: false`, `transparent: true`
  - `resizable: false`, `skipTaskbar: true`, `center: true`
- [ ] Update `src-tauri/capabilities/default.json`: add `"floating-timer"` to `windows` array
- [ ] Add permissions: `core:window:allow-start-dragging`, `core:event:allow-emit`, `core:event:allow-listen`

##### Cross-Window State Sync (Tauri Events)
- [ ] Create `src/lib/timerBridge.ts` — cross-window event bridge:
  - `broadcastTimerState(state)` — main window emits `"timer-state"` event every tick
  - `listenTimerState(callback)` — floating window subscribes to `"timer-state"` events
  - `sendTimerAction(action)` — floating window emits `"timer-action"` event
  - `listenTimerAction(callback)` — main window subscribes and dispatches to `timerStore`
- [ ] In `timerStore.ts` `tick()`: call `broadcastTimerState()` on every tick
- [ ] In `timerStore.ts` setup: call `listenTimerAction()` to receive commands from floating window

##### Floating Timer UI
- [ ] Create `src/components/focus/FloatingTimer.tsx`:
  - Frameless, draggable (`data-tauri-drag-region` on container)
  - Compact layout (~340×88px): phase dot, task title, MM:SS timer, progress bar
  - Control buttons on hover: Pause/Resume, Skip, Done
  - Expand button → restores main window + hides floating timer
  - Dark translucent background (`bg-[#1A1A1A]/95 backdrop-blur`)
- [ ] Create `src/pages/FloatingTimerPage.tsx` — minimal page wrapper (no AppShell)

##### Routing & Entry Point
- [ ] Add `/floating-timer` route in `src/App.tsx` — renders `FloatingTimerPage` OUTSIDE `<AppShell>`
- [ ] In `App.tsx`: detect floating-timer window (check `getCurrentWindow().label`) and skip settings loading

##### Window Lifecycle
- [ ] On Focus session start: show floating-timer window, hide main window
- [ ] On Expand click or session end: show main window, hide floating-timer window
- [ ] On Esc in floating timer → same as Expand (restore main)
- [ ] On tray icon click while focus active → restore main window + hide floating timer

##### Focus Overlay Update
- [ ] Add "Minimize to floating timer" button in `FocusOverlay.tsx` (top-right)
- [ ] Add "Expand from floating" handler when main window is restored during active focus

#### Auto-Open Links
- [ ] Create `src/lib/urlUtils.ts` — `extractUrls(text: string): string[]`
- [ ] On focus task activation, extract URLs from `activeTask.description` and open via `tauri-plugin-opener`
- [ ] Add setting `autoOpenLinks: boolean` (default `true`) in `settingsStore.ts`
- [ ] Add toggle in Settings page under Focus section
- [ ] Show extracted links in FocusOverlay below task title (clickable, muted style)

#### Custom Focus Backgrounds
- [ ] Add setting `focusBackground: string` (values: `"dark"`, `"gradient-warm"`, `"gradient-cool"`, `"gradient-purple"`, `"nature"`)
- [ ] Default: `"dark"` (current `bg-[#0D0D0D]`)
- [ ] Add background picker in Settings page (visual grid of thumbnails)
- [ ] Apply selected background class in `FocusOverlay.tsx`

#### Ambient Focus Sounds
- [ ] Create `src/lib/audioManager.ts` — manages HTML5 Audio for ambient sounds
- [ ] Bundle 3-4 royalty-free ambient tracks in `public/sounds/` (rain, lo-fi, white noise, cafe)
- [ ] Add setting `focusSound: string | null` and `focusSoundVolume: number` in `settingsStore.ts`
- [ ] Sound selector in FocusOverlay (icon button → dropdown + volume slider)
- [ ] Auto-play on focus start, pause on break, stop on session end
- [ ] Add toggle in Settings page

**Deliverable**: Focus session hides app to tray with floating timer on top; links auto-open; selectable backgrounds and ambient sounds.

---

### Milestone 9 — Integrations (MCP-powered)

> **Status: DEFERRED — not required for MVP**

**Goal**: Connect to Notion, Google Calendar, and Claude AI.

#### Notion Integration (Task Import/Migration)

- [ ] Notion OAuth setup (Tauri opens browser for OAuth flow)
- [ ] List Notion databases and pages
- [ ] Map Notion properties to app task fields (title, date, status)
- [ ] One-time import + optional recurring sync
- [ ] Show import preview before confirming

#### Google Calendar Sync

- [ ] Google OAuth (open browser via Tauri shell)
- [ ] Sync Today tasks as all-day or timed events
- [ ] Pull calendar events for today as read-only reference
- [ ] Conflict warnings

#### Claude AI Assistant

- [ ] AI panel in sidebar (toggle)
- [ ] Brain dump: paste freeform text → Claude extracts structured tasks
- [ ] Smart scheduling: "What should I work on today?" based on tasks + deadlines
- [ ] Voice-to-task (via Web Speech API → Claude)
- [ ] Settings: enter Anthropic API key (stored in Tauri secure store)

**Deliverable**: Notion import works, Calendar syncs, AI assistant creates tasks.

---

### Milestone 10 — Cloud Sync (Optional)

> **Status: DEFERRED — not required for MVP**

**Goal**: Multi-device sync via Supabase with auth.

**Tasks:**

- [ ] Supabase project setup (Postgres schema mirrors SQLite)
- [ ] Email/password + OAuth login (Supabase Auth)
- [ ] Conflict resolution strategy (last-write-wins for tasks)
- [ ] Real-time sync via Supabase Realtime
- [ ] Offline queue: changes made offline sync when back online
- [ ] Account management UI (sign in, sign out, subscription)

**Deliverable**: Sign in, data syncs across devices, works offline.

---

## Folder Structure

```
productivity-app/
├── src/                          # React frontend
│   ├── components/
│   │   ├── ui/                   # Shadcn/ui components
│   │   ├── layout/               # Sidebar, Titlebar, Shell
│   │   ├── tasks/                # TaskCard, TaskDetail, KanbanColumn
│   │   ├── focus/                # FocusOverlay, Timer, SessionLog
│   │   ├── reports/              # Charts, ReportCards
│   │   └── integrations/         # Notion, Calendar, AI panels
│   ├── stores/                   # Zustand stores
│   │   ├── taskStore.ts
│   │   ├── timerStore.ts
│   │   ├── listStore.ts
│   │   └── settingsStore.ts
│   ├── lib/
│   │   ├── db.ts                 # SQLite via tauri-plugin-sql
│   │   ├── recurrence.ts         # Recurrence rule engine
│   │   ├── timeUtils.ts
│   │   └── ai.ts                 # Claude API client
│   ├── hooks/                    # Custom React hooks
│   ├── pages/                    # Route components
│   └── main.tsx
├── src-tauri/                    # Tauri Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/             # Tauri commands (notifications, file ops)
│   │   └── migrations/           # SQLite migrations
│   ├── tauri.conf.json
│   └── Cargo.toml
├── Plan.md                       # This file
└── package.json
```

---

## Development Order

```
M1 Foundation → M2 Task Core → M3 Focus Timer → M4 Reports → M5 Polish → M6 Subtasks → M7 All Lists → M8 Focus Enhancements → M9 Integrations → M10 Cloud
```

Each milestone produces a working, demonstrable version of the app.

---

## Out of Scope (v1)

- Mobile app
- Team/collaboration features
- ClickUp / Asana integrations
- Public API / webhooks
- Custom themes beyond dark/light

---

_Last updated: 2026-03-24_
