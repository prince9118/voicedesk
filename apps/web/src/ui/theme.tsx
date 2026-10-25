import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { flushSync } from "react-dom";
import { Button, Tip } from "./primitives";

export type Theme = "light" | "dark";
const STORAGE_KEY = "voicedesk.theme"; // keep in sync with public/theme-init.js

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme; // native controls and scrollbars follow too
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode or storage disabled: the theme still applies for this visit.
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <Tip label={label}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        onClick={(event) => {
          const next: Theme = theme === "dark" ? "light" : "dark";
          const commit = () => {
            applyTheme(next);
            setTheme(next);
          };

          const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (!("startViewTransition" in document) || reduceMotion) {
            commit();
            return;
          }

          // View Transitions: the browser snapshots the old page, we apply the new theme, then reveal it
          // as a circle growing from the button. flushSync makes React render inside the snapshot window.
          const { clientX: x, clientY: y } = event;
          const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
          const transition = document.startViewTransition(() => flushSync(commit));
          void transition.ready.then(() => {
            document.documentElement.animate(
              { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
              { duration: 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
            );
          });
        }}
      >
        {/* The icon turns out and the other turns in. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            className="grid"
            initial={{ y: 12, rotate: -80, opacity: 0 }}
            animate={{ y: 0, rotate: 0, opacity: 1 }}
            exit={{ y: -12, rotate: 80, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}
          </motion.span>
        </AnimatePresence>
      </Button>
    </Tip>
  );
}
