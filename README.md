# SkadiFlow

A focused productivity desktop app for Windows (cross-platform soon), inspired by [Blitzit](https://www.blitzit.app).

Built with **Tauri v2 + React + TypeScript + SQLite** — local-first, fast, and open source.

---

## Features

- **Kanban task board** — Backlog / This Week / Today / Done columns
- **Focus Mode** — full-screen focus sessions with Pomodoro timer
- **Floating timer** — always-on-top compact timer widget
- **Website Locker** — OS-level domain blocking during focus sessions
- **Time tracking & reports** — session history, charts, streak counter
- **Subtasks** — nested task hierarchy with progress badges
- **Ambient sounds** — rain, lofi, cafe, ocean, forest, white noise
- **System tray** — quick task add, show/hide from tray
- **Dark/light mode** — dark by default, persisted in SQLite

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 18 + TypeScript + Vite |
| UI components | shadcn/ui |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Local DB | SQLite via tauri-plugin-sql |
| Drag & drop | @dnd-kit/core |
| Charts | Recharts |
| Animations | Framer Motion |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable toolchain)
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS

### Install & run

```bash
git clone https://github.com/kfunezc204/skadiflow.git
cd skadiflow
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

---

## Project Structure

```
src/
├── components/
│   ├── ui/         # shadcn/ui components
│   ├── layout/     # AppShell, Sidebar, Titlebar
│   ├── tasks/      # Kanban board, task cards, detail panel
│   ├── focus/      # Focus overlay, timer, locker
│   └── reports/    # Charts, stats, session history
├── stores/         # Zustand stores (tasks, timer, lists, settings)
├── lib/            # DB layer, utilities, audio, AI
├── pages/          # Route-level page components
└── hooks/          # Custom React hooks
src-tauri/
├── src/
│   ├── commands/   # Tauri Rust commands (locker, notifications)
│   └── migrations/ # SQLite migration files
└── icons/          # App icons
```

See [CLAUDE.md](./CLAUDE.md) for full architecture details, coding conventions, and contribution guidelines.

---

## Contributing

Contributions are welcome. Please read [CLAUDE.md](./CLAUDE.md) before submitting a PR — it covers the tech stack, coding conventions, DB rules, and project structure.

1. Fork the repo
2. Create a branch: `git checkout -b feat/your-feature`
3. Commit your changes
4. Open a pull request

---

## License

MIT
