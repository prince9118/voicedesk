import { Moon, Sun } from "lucide-react";
import { useState } from "react";
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
        onClick={() => {
          const next: Theme = theme === "dark" ? "light" : "dark";
          applyTheme(next);
          setTheme(next);
        }}
      >
        {theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}
      </Button>
    </Tip>
  );
}
