import { Monitor, Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { Button, Tip } from "./primitives";

/** What the user chose. "system" follows the OS, live. */
export type ThemePreference = "system" | "light" | "dark";
/** What is actually painted. */
export type Theme = "light" | "dark";

const STORAGE_KEY = "voicedesk.theme"; // keep in sync with public/theme-init.js
const ORDER: ThemePreference[] = ["system", "light", "dark"];
const LABELS: Record<ThemePreference, string> = { system: "System", light: "Light", dark: "Dark" };

function systemTheme(): Theme {
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage unavailable: fall through to following the system.
  }
  return "system";
}

function resolve(pref: ThemePreference): Theme {
  return pref === "system" ? systemTheme() : pref;
}

function paint(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme; // native controls and scrollbars follow too
}

function savePreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Private mode or storage disabled: the theme still applies for this visit.
  }
}

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>(readPreference);

  // While following the system, repaint whenever the OS flips (e.g. scheduled dark mode at sunset).
  useEffect(() => {
    if (pref !== "system") return;
    const query = matchMedia("(prefers-color-scheme: light)");
    const onChange = () => paint(systemTheme());
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [pref]);

  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]!;
  const label = `Theme: ${LABELS[pref]}. Switch to ${LABELS[next]}`;
  const Icon = ICONS[pref];

  return (
    <Tip label={label}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        onClick={(event) => {
          const commit = () => {
            paint(resolve(next));
            savePreference(next);
            setPref(next);
          };

          const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
          const visuallyChanges = resolve(next) !== resolve(pref);
          if (!("startViewTransition" in document) || reduceMotion || !visuallyChanges) {
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
        {/* The icon turns out and the next turns in. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={pref}
            className="grid"
            initial={{ y: 12, rotate: -80, opacity: 0 }}
            animate={{ y: 0, rotate: 0, opacity: 1 }}
            exit={{ y: -12, rotate: 80, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Icon size={17} />
          </motion.span>
        </AnimatePresence>
      </Button>
    </Tip>
  );
}
