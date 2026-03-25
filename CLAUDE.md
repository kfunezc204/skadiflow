# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Name**: BlitzDesk
**Type**: Desktop productivity app (Windows-first, cross-platform later)
**Inspired by**: [Blitzit](https://www.blitzit.app)
**Full plan**: See `Plan.md`

---

## Tech Stack (Non-Negotiable)

| Layer | Technology |
|---|---|
| Desktop | Tauri v2 (Rust) |
| Frontend | React 18 + TypeScript + Vite |
| UI | Shadcn/ui |
| Styling | Tailwind CSS v4 — dark mode via `class` strategy |
| State | Zustand |
| Local DB | SQLite via `tauri-plugin-sql` |
| Optional Cloud | Supabase |
| Drag & Drop | @dnd-kit/core |
| Charts | Recharts |
| Animations | Framer Motion |
| Forms | React Hook Form + Zod |
| Dates | date-fns |
| AI | Anthropic SDK (Claude) |
| Icons | Lucide React |

**Never** substitute a library from the stack above without explicit approval.

---

## Design Rules

- **Dark mode is the default** — `<html class="dark">` always on first load
- Light mode is a toggle persisted in SQLite `settings` table
- **Accent color**: orange-500 (`#F97316`) for interactive elements, timers, CTAs
- **Font**: Inter via CSS variable, system-ui fallback
- **Border radius**: `--radius: 0.5rem` (Shadcn default)
- Use Shadcn/ui components first — only build custom components when Shadcn doesn't cover the use case
- All spacing via Tailwind utilities — no inline styles
- Animations via Framer Motion — no CSS keyframes unless trivial

---

## Project Root Structure

```
productivity-app/
├── src/
│   ├── components/
│   │   ├── ui/           # Shadcn/ui auto-generated — never edit manually
│   │   ├── layout/       # Sidebar, Titlebar, AppShell
│   │   ├── tasks/        # TaskCard, TaskDetail, KanbanColumn, KanbanBoard
│   │   ├── focus/        # FocusOverlay, Timer, SessionLog, LockerPanel
│   │   ├── reports/      # ReportPage, Charts, StatCard
│   │   └── integrations/ # NotionPanel, CalendarPanel, AIPanel
│   ├── stores/
│   │   ├── taskStore.ts
│   │   ├── timerStore.ts
│   │   ├── listStore.ts
│   │   ├── settingsStore.ts
│   │   └── lockerStore.ts
│   ├── lib/
│   │   ├── db.ts          # All SQLite queries — no raw SQL outside this file
│   │   ├── recurrence.ts  # Recurring task engine
│   │   ├── timeUtils.ts   # Duration formatting helpers
│   │   └── ai.ts          # Claude API client
│   ├── hooks/
│   ├── pages/
│   └── main.tsx
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/      # Tauri invoke commands (notifications, hosts file, tray)
│   │   └── migrations/    # SQL migration files (001_init.sql, 002_*.sql ...)
│   ├── tauri.conf.json
│   └── Cargo.toml
├── CLAUDE.md              # This file
├── Plan.md                # Full feature plan + milestone checklist
└── PRD.md                 # Product requirements
```

---

## Architecture & Data Flow

### App Startup Sequence
1. `main.tsx` mounts `<App>` inside `<BrowserRouter>`
2. `App.tsx` calls `settingsStore.loadSettings()` in a `useEffect`
3. While `isLoaded === false`, a full-screen spinner is shown (hardcoded `bg-[#1A1A1A]`)
4. `loadSettings` reads all settings from SQLite in parallel, applies the theme class to `document.documentElement`, then sets `isLoaded: true`
5. Routes render inside `AppShell` (Titlebar → Sidebar → `<Outlet>`)

### DB Layer
- **File**: `sqlite:blitzdesk.db` (Tauri app data directory)
- **Singleton**: `getDb()` in `src/lib/db.ts` lazily loads the connection and caches it — all store and lib code calls `getDb()`, never `Database.load()` directly
- **Migrations**: Registered in `src-tauri/src/lib.rs` as a `vec![Migration { ... }]` and run automatically on startup via `tauri-plugin-sql`
- **Settings** are stored as plain strings in the `settings` table and parsed to typed values inside the store (e.g. `parseInt(focusMin)`)

### DB Schema
| Table | Migration | Purpose |
|---|---|---|
| `lists` | 001 | User-defined task lists (Inbox, Work, etc.) with color + icon |
| `tasks` | 001 | All tasks; `status` ∈ `backlog\|this_week\|today\|done`; `list_id` FK |
| `sessions` | 001 | Focus/break time log; linked to a task via nullable `task_id` |
| `settings` | 001 | Key/value app settings (theme, pomodoro config, etc.) |
| `tags` | 001 | Global tags with color |
| `task_tags` | 001 | Many-to-many join between tasks and tags |
| `blocker_profiles` | 002 | Named website blocklist profiles |
| `blocker_domains` | 002 | Domains per profile; CASCADE delete on profile removal |
| `tasks.parent_task_id` | 003 | Nullable FK column added to `tasks`; enables subtask hierarchy |

Default "Inbox" list (`id: 'inbox-default'`) is seeded by migration 001. Migration 002 also seeds `locker_during_breaks = 'false'` into `settings`. Migration 003 adds `parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE` to `tasks` plus an index on that column.

### Zustand Store Pattern
Each store exports a single `use*Store` hook. Stores separate state shape (`*State` type) from actions (`*Actions` type). All stores have an `isLoaded: boolean` flag. DB calls flow: **component → store action → `src/lib/db.ts` function → SQLite**. Never skip `db.ts`.

### Task Status → Kanban Column Mapping
```
backlog    → Backlog column
this_week  → This Week column
today      → Today column
done       → Done column (hidden by default)
```

### Tauri Plugins Registered (lib.rs)
- `tauri-plugin-sql` — SQLite access
- `tauri-plugin-shell` — shell commands
- `tauri-plugin-notification` — system notifications
- `tauri-plugin-store` — secure key/value store (for API keys)
- `tauri-plugin-opener` — open URLs/files

---

## Coding Conventions

### TypeScript
- Strict mode on — no `any`, no `@ts-ignore`
- Prefer `type` over `interface` for data shapes
- All Zod schemas colocated with their forms
- IDs are always `string` (UUID via `crypto.randomUUID()`)
- Dates stored as ISO 8601 strings in SQLite (`TEXT`)

### React
- Functional components only — no class components
- Custom hooks in `src/hooks/` prefixed with `use`
- No prop drilling beyond 2 levels — use Zustand store instead
- `useEffect` only for side effects, not derived state
- Colocate component styles with the component file

### Zustand Stores
- One store per domain: tasks, timer, lists, settings
- Stores handle all DB reads/writes via `src/lib/db.ts`
- Never call SQLite directly from a component

### SQLite / DB
- All migrations numbered sequentially: `001_init.sql`, `002_add_tags.sql`
- Migrations run on app startup via `tauri-plugin-sql`
- Never drop columns in migrations — use nullable additions only
- All DB functions in `src/lib/db.ts` must be `async` and handle errors

### Tauri Commands
- Rust commands in `src-tauri/src/commands/` — one file per domain
- Always use `tauri::command` macro with typed returns
- Sensitive operations (hosts file, secure store) only in Rust — never in JS
- Locker commands in `commands/locker.rs`: `check_locker_permission`, `activate_locker(domains)`, `deactivate_locker`
  - Hosts file entries are wrapped in `# BLITZDESK-LOCKER-START` / `# BLITZDESK-LOCKER-END` sentinels so they can be cleanly removed

---

## Milestone Progress

Update checkboxes here AND in `Plan.md` as tasks are completed.

### Milestone 1 — Project Foundation
- [x] Tauri v2 + React + TypeScript + Vite scaffold
- [x] Tailwind CSS v4 + dark mode
- [x] Shadcn/ui configured (dark theme, orange accent)
- [x] tauri-plugin-sql + SQLite setup
- [x] DB migrations run on startup
- [x] App shell: sidebar + main area + custom titlebar
- [x] React Router setup (`/`, `/focus`, `/reports`, `/settings`)
- [x] Zustand stores scaffolded
- [x] Window drag region for titlebar
- [x] Tauri window config (min size, tray, decorations)

**Status**: COMPLETE

---

### Milestone 2 — Task Management Core
- [x] Lists sidebar (CRUD + color/icon)
- [x] 3-column Kanban board (Backlog / This Week / Today)
- [x] Task cards (title, EST, time badges)
- [x] Inline task add with EST parsing
- [x] Task detail side panel
- [x] Inline title editing
- [x] Drag & drop (@dnd-kit)
- [x] Arrow hover actions
- [x] Completion + confetti
- [x] Done column (hidden toggle)
- [x] Recurring task engine
- [x] Due date picker

**Status**: COMPLETE

---

### Milestone 3 — Focus Mode & Timer
- [x] Focus Mode route + full-screen overlay
- [x] Start Focus Session from Today column
- [x] Live MM:SS timer per task
- [x] Pomodoro cycle (focus → break → repeat)
- [x] Timer controls (Start/Pause/Resume/Skip/Done)
- [x] Keyboard shortcuts (Space, S, D, Esc)
- [x] Auto-advance on task completion
- [x] Pomodoro progress bar
- [x] Session log
- [x] System notifications
- [x] Timer persistence (survive app restart)
- [x] Mini timer widget in sidebar
- [x] Focus Locker panel (URL blocklist manager)
- [x] Named blocklist profiles
- [x] Assign profile to session
- [x] Hosts file write on Focus start
- [x] Hosts file cleanup on Focus end
- [x] "Locker ON" badge in overlay
- [x] Locker behavior during breaks (toggle)
- [x] Graceful fallback if permission denied

**Status**: COMPLETE

---

### Milestone 4 — Time Tracking & Reports
- [x] Auto-log sessions to DB
- [x] Manual time correction on cards
- [x] EST vs Actual indicator (green/yellow/red)
- [x] Reports page
- [x] Date range picker
- [x] Stat cards (focus time, tasks done, EST accuracy)
- [x] Time by list donut chart
- [x] Tasks per day bar chart
- [x] Session history table
- [x] Streak counter
- [x] PDF export

**Status**: COMPLETE

---

### Milestone 5 — Settings, Polish & UX
- [x] Settings page (theme, Pomodoro, notifications, week start)
- [x] System tray (show/hide, quick add)
- [x] Global hotkeys (Ctrl+N, Ctrl+Shift+F, Ctrl+,)
- [x] Keyboard shortcut modal
- [x] Framer Motion animations
- [x] Onboarding flow (3-step modal)
- [x] Empty state illustrations
- [x] Toast notifications (Sonner)
- [ ] Auto-updater (deferred — requires code signing + update server infrastructure)

**Status**: COMPLETE (auto-updater deferred)

---

### Milestone 6 — Subtasks
- [ ] Migration `003_subtasks.sql`: `parent_task_id` column + index
- [ ] Register migration in `lib.rs`
- [ ] `getSubtasks`, `createSubtask`, `toggleSubtask`, `deleteSubtask`, `reorderSubtasks` in `db.ts`
- [ ] `getAllTasks()` excludes subtasks (`WHERE parent_task_id IS NULL`)
- [ ] `Task` type gains `parentTaskId: string | null`
- [ ] `subtasks: Record<string, Task[]>` state + load/add/toggle/delete/reorder actions
- [ ] `useSubtasks(parentId)` and `useSubtaskProgress(parentId)` selectors
- [ ] `useTasksByColumn` filters out subtasks
- [ ] Subtask progress badge on TaskCard ("2/5 ✓")
- [ ] Subtask section in TaskDetailPanel (list, add, delete, reorder)

**Status**: NOT STARTED

---

### Milestone 7 — List Filtering & All Lists View
- [ ] `useTasksByColumn` reads `selectedListId` from listStore for filtering
- [ ] Kanban board header shows current list name/icon or "All Tasks"
- [ ] TaskCard shows list name label in "All Tasks" view
- [ ] Sidebar: "All Tasks" active state, task counts per list
- [ ] InlineTaskAdd: list picker dropdown when in "All Tasks" view

**Status**: NOT STARTED

---

### Milestone 8 — Focus Mode Enhancements
- [ ] `"floating-timer"` window in `tauri.conf.json` (340×88, always-on-top, transparent, hidden)
- [ ] `floating-timer` in `capabilities/default.json` + drag/event permissions
- [ ] `src/lib/timerBridge.ts` — cross-window Tauri event bridge
- [ ] `timerStore` broadcasts state on tick; listens for actions from floating window
- [ ] `src/components/focus/FloatingTimer.tsx` — compact draggable timer UI
- [ ] `src/pages/FloatingTimerPage.tsx` — minimal page (no AppShell)
- [ ] `/floating-timer` route in `App.tsx` outside `<AppShell>`
- [ ] Focus session start → show floating window, hide main window
- [ ] Session end / Expand → show main window, hide floating window
- [ ] "Minimize to floating" button in FocusOverlay
- [ ] `src/lib/urlUtils.ts` — URL extraction; auto-open on task activation
- [ ] `autoOpenLinks` setting + Settings toggle + link display in FocusOverlay
- [ ] `focusBackground` setting (dark/gradient-warm/gradient-cool/gradient-purple/nature)
- [ ] Background picker in Settings; applied in FocusOverlay
- [ ] `src/lib/audioManager.ts` + ambient sound assets in `public/sounds/`
- [ ] `focusSound` / `focusSoundVolume` settings; sound selector in FocusOverlay + Settings

**Status**: NOT STARTED

---

### Milestone 9 — Integrations
- [ ] Notion OAuth + task import
- [ ] Google Calendar OAuth + sync
- [ ] Claude AI panel (brain dump, smart scheduling, voice-to-task)
- [ ] API key storage (Tauri secure store)

**Status**: DEFERRED — not required for MVP

---

### Milestone 10 — Cloud Sync
- [ ] Supabase project + schema
- [ ] Auth (email + OAuth)
- [ ] Conflict resolution
- [ ] Realtime sync
- [ ] Offline queue
- [ ] Account UI

**Status**: DEFERRED — not required for MVP

---

## Active Session Rules

When working on any milestone:

1. **Read before writing** — always read a file before editing it
2. **One concern per file** — don't mix DB logic with UI components
3. **Mark tasks done** — update checkboxes in this file AND `Plan.md` when complete
4. **No orphan files** — every new file must fit the folder structure above
5. **Validate visually** — after building any UI component, describe or screenshot the result
6. **Ask before adding dependencies** — no new npm packages without mentioning it
7. **Migrations are permanent** — never edit an existing migration, always add a new one
8. **Security** — never expose API keys in frontend code; always use Tauri secure store or env vars

---

## Key Decisions Log

| Date | Decision | Reason |
|---|---|---|
| 2026-03-24 | Tauri v2 over Electron | Smaller bundle, better performance, Rust native APIs |
| 2026-03-24 | Local-first SQLite + optional Supabase | Works offline, sync is additive not required |
| 2026-03-24 | Notion as first integration | Serves as migration/import path for existing users |
| 2026-03-24 | Hosts file for website blocking | OS-level blocking works across all browsers |
| 2026-03-24 | Shadcn/ui (not MUI/Chakra) | Full control over styles, no runtime overhead |

---

## Commands Reference

```bash
# Dev
npm run tauri dev

# Build
npm run tauri build

# Add Shadcn component
npx shadcn@latest add <component>

# Run type check
npx tsc --noEmit

# Add Tauri plugin (example)
npm run tauri add sql
```

---

*Last updated: 2026-03-25 (Milestones 6–8 added — Subtasks, List Filtering, Focus Mode Enhancements; M9/M10 are deferred Integrations/Cloud Sync)*
