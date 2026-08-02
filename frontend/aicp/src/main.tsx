import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Suppress browser extension noise (e.g., wallet contentscript.js warnings)
if (typeof window !== "undefined") {
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args: unknown[]) => {
    const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    if (
      msg.includes("MaxListenersExceededWarning") ||
      msg.includes("ObjectMultiplex") ||
      msg.includes("contentscript.js")
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };

  console.error = (...args: unknown[]) => {
    const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    if (
      msg.includes("MaxListenersExceededWarning") ||
      msg.includes("ObjectMultiplex") ||
      msg.includes("contentscript.js")
    ) {
      return;
    }
    originalError.apply(console, args);
  };
}

createRoot(document.getElementById("root")!).render(<App />);
