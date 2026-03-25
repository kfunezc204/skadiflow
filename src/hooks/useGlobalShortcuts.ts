import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";

export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    let registered = false;
    let cleanup = () => {};

    async function tryRegisterTauri() {
      try {
        const { register, unregisterAll } = await import(
          "@tauri-apps/plugin-global-shortcut"
        );

        await register("CmdOrCtrl+N", (e: ShortcutEvent) => {
          if (e.state === "Pressed") {
            navigate("/");
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("blitzdesk:quick-add"));
            }, 100);
          }
        });

        await register("CmdOrCtrl+Shift+F", (e: ShortcutEvent) => {
          if (e.state === "Pressed") navigate("/focus");
        });

        await register("CmdOrCtrl+,", (e: ShortcutEvent) => {
          if (e.state === "Pressed") navigate("/settings");
        });

        registered = true;
        cleanup = () => {
          unregisterAll().catch(() => {});
        };
      } catch {
        // Not in Tauri context or plugin unavailable — no-op
      }
    }

    tryRegisterTauri();

    return () => {
      if (registered) cleanup();
    };
  }, [navigate]);
}
