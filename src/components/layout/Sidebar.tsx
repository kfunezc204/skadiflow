import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import MiniTimer from "@/components/focus/MiniTimer";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Timer,
  BarChart2,
  Settings,
  Plus,
  MoreHorizontal,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useListStore, type List } from "@/stores/listStore";
import { useTaskStore } from "@/stores/taskStore";
import { ListIcon } from "@/lib/iconMap";
import ListDialog from "@/components/tasks/ListDialog";
import DeleteListDialog from "@/components/tasks/DeleteListDialog";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Board" },
  { to: "/focus", icon: Timer, label: "Focus" },
  { to: "/reports", icon: BarChart2, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];


export default function Sidebar() {
  const lists = useListStore((s) => s.lists);
  const selectedListId = useListStore((s) => s.selectedListId);
  const selectList = useListStore((s) => s.selectList);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState<List | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<List | null>(null);

  const tasks = useTaskStore((s) => s.tasks);
  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const t of tasks) {
      if (t.parentTaskId !== null) continue;
      counts[t.listId] = (counts[t.listId] ?? 0) + 1;
      total++;
    }
    return { counts, total };
  }, [tasks]);

  function openCreate() {
    setEditingList(null);
    setDialogOpen(true);
  }

  function openEdit(list: List) {
    setEditingList(list);
    setDialogOpen(true);
  }

  function openDelete(list: List) {
    setDeleteTarget(list);
  }

  return (
    <aside className="flex w-60 flex-col border-r border-[#2A2A2A] bg-[#111111] flex-shrink-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto py-4">
        {/* Lists header */}
        <div className="flex items-center justify-between px-3 mb-2">
          <span className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">
            Lists
          </span>
          <button
            onClick={openCreate}
            className="p-0.5 rounded text-white/20 hover:text-white/60 hover:bg-white/10 transition-colors"
            title="New list"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* All Tasks */}
        <button
          onClick={() => selectList(null)}
          className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
            selectedListId === null
              ? "bg-orange-500/10 text-orange-500 font-medium"
              : "text-white/60 hover:bg-white/5 hover:text-white"
          }`}
        >
          <LayoutDashboard size={15} className="flex-shrink-0" />
          <span className="truncate">All Tasks</span>
          {taskCounts.total > 0 && (
            <span className="text-[10px] text-white/30 tabular-nums ml-auto">{taskCounts.total}</span>
          )}
        </button>

        {/* Dynamic lists */}
        {lists.map((list, i) => (
          <motion.div
            key={list.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.2 }}
            className="group flex items-center"
          >
            <button
              onClick={() => selectList(list.id)}
              className={`flex flex-1 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors min-w-0 ${
                selectedListId === list.id
                  ? "bg-orange-500/10 text-orange-400 font-medium"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <ListIcon icon={list.icon} color={list.color} />
              <span className="truncate">{list.name}</span>
              {(taskCounts.counts[list.id] ?? 0) > 0 && (
                <span className="text-[10px] text-white/30 tabular-nums ml-auto">{taskCounts.counts[list.id]}</span>
              )}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger
                className="opacity-0 group-hover:opacity-100 mr-2 p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-all flex-shrink-0"
              >
                <MoreHorizontal size={12} />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-[#1A1A1A] border-[#2A2A2A] text-white text-xs min-w-[140px]"
              >
                <DropdownMenuItem
                  onClick={() => openEdit(list)}
                  className="text-white/70 hover:text-white focus:text-white focus:bg-white/10 cursor-pointer"
                >
                  Rename / Edit
                </DropdownMenuItem>
                {lists.length > 1 && (
                  <DropdownMenuItem
                    onClick={() => openDelete(list)}
                    className="text-red-400 hover:text-red-300 focus:text-red-300 focus:bg-red-500/10 cursor-pointer"
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </motion.div>
        ))}

        <Separator className="my-4 bg-[#2A2A2A]" />

        {/* Navigation */}
        <div className="px-3 mb-2">
          <span className="text-[10px] font-semibold tracking-widest text-white/30 uppercase">
            Navigation
          </span>
        </div>

        <nav className="flex flex-col gap-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-orange-500/10 text-orange-500 font-medium"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon size={15} className="flex-shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Footer — Mini Timer */}
      <div className="border-t border-[#2A2A2A] p-3">
        <MiniTimer />
      </div>

      <ListDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        editingList={editingList}
      />
      <DeleteListDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        list={deleteTarget}
      />
    </aside>
  );
}
