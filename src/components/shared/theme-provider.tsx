"use client";

import * as React from "react";

type Theme = "dark" | "light" | "system";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = localStorage.getItem("chronos_theme");
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch {}
  return "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("dark");
  const [resolvedTheme, setResolvedTheme] = React.useState<"dark" | "light">("dark");
  const [mounted, setMounted] = React.useState(false);

  // Apply theme to DOM
  const applyTheme = React.useCallback((targetTheme: Theme) => {
    const root = document.documentElement;
    const resolved = targetTheme === "system" ? getSystemTheme() : targetTheme;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
    root.setAttribute("data-theme", resolved);
    setResolvedTheme(resolved);
  }, []);

  // Sync state on client mount from localStorage without overwriting
  React.useEffect(() => {
    const saved = getStoredTheme();
    setThemeState(saved);
    applyTheme(saved);
    setMounted(true);
  }, [applyTheme]);

  const setTheme = React.useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      try {
        localStorage.setItem("chronos_theme", newTheme);
      } catch {}
      applyTheme(newTheme);
    },
    [applyTheme]
  );

  const toggleTheme = React.useCallback(() => {
    // Read current state from the DOM to avoid any stale closures
    const currentIsDark = document.documentElement.classList.contains("dark");
    const nextTheme: Theme = currentIsDark ? "light" : "dark";
    setTheme(nextTheme);
  }, [setTheme]);

  // Listen for OS preference changes if theme is set to 'system'
  React.useEffect(() => {
    if (!mounted || theme !== "system") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      applyTheme("system");
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [mounted, theme, applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
