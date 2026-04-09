import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

// Mark floating-timer window immediately — before React renders.
// With HashRouter, the route is in window.location.hash (e.g. "#/floating-timer")
if (window.location.hash === "#/floating-timer") {
  document.documentElement.classList.add("floating-timer-window");
  // Remove "dark" — forces color-scheme:dark which makes WebView2 paint an opaque background.
  document.documentElement.classList.remove("dark");
  // Belt-and-suspenders: force transparent via inline style before any CSS loads.
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
