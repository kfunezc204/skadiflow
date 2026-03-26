import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition } from "@tauri-apps/api/window";

const FLOAT_W = 340;
const FLOAT_H = 88;
const MARGIN  = 16;

export async function showFloatingTimer(): Promise<void> {
  try {
    const win = await WebviewWindow.getByLabel("floating-timer");
    if (!win) return;

    // Position at bottom-right first (best-effort — show regardless if this fails)
    try {
      const x = Math.round(window.screen.width  - FLOAT_W - MARGIN);
      const y = Math.round(window.screen.height - FLOAT_H - MARGIN - 48); // 48 ≈ taskbar
      await win.setPosition(new LogicalPosition(x, y));
    } catch (posErr) {
      console.warn("Could not position floating timer:", posErr);
    }

    await win.show();
  } catch (e) {
    console.warn("showFloatingTimer failed:", e);
  }
}

export async function hideFloatingTimer(): Promise<void> {
  try {
    const win = await WebviewWindow.getByLabel("floating-timer");
    if (win) await win.hide();
  } catch (e) {
    console.warn("hideFloatingTimer failed:", e);
  }
}

export async function showMainWindow(): Promise<void> {
  try {
    const win = await WebviewWindow.getByLabel("main");
    if (win) {
      await win.show();
      await win.setFocus();
    }
  } catch (e) {
    console.warn("showMainWindow failed:", e);
  }
}

export async function hideMainWindow(): Promise<void> {
  try {
    const win = await WebviewWindow.getByLabel("main");
    if (win) await win.hide();
  } catch (e) {
    console.warn("hideMainWindow failed:", e);
  }
}

export async function minimizeToFloating(): Promise<void> {
  await showFloatingTimer();
  await hideMainWindow();
}

export async function expandToMain(): Promise<void> {
  await showMainWindow();
  await hideFloatingTimer();
}

export async function minimizeFocusToTray(): Promise<void> {
  await hideFloatingTimer();
  await hideMainWindow();
}
