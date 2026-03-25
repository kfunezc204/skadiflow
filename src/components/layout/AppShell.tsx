import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "sonner";
import Titlebar from "./Titlebar";
import Sidebar from "./Sidebar";
import ShortcutModal from "./ShortcutModal";
import { useFocusNotifications } from "@/hooks/useFocusNotifications";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";

export default function AppShell() {
  useFocusNotifications();
  useGlobalShortcuts();

  const location = useLocation();
  const [shortcutModalOpen, setShortcutModalOpen] = useState(false);

  // "?" key opens shortcut modal (guard against typing in inputs)
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "?") {
        e.preventDefault();
        setShortcutModalOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#1A1A1A] text-white overflow-hidden">
      <Titlebar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 overflow-hidden flex flex-col"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <Toaster
        theme="dark"
        position="bottom-right"
        richColors
        toastOptions={{
          className: "!bg-[#1A1A1A] !border-[#2A2A2A] !text-white",
        }}
      />

      <ShortcutModal
        open={shortcutModalOpen}
        onClose={() => setShortcutModalOpen(false)}
      />
    </div>
  );
}
