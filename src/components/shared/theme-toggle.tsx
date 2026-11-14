"use client";

import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { toggleTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      className={`h-7 w-7 p-0 rounded-md border border-border bg-panel text-foreground hover:bg-elevated cursor-pointer transition-colors ${className || ""}`}
      title="Toggle light/dark theme"
      aria-label="Toggle light/dark theme"
    >
      {/* Shown in dark mode */}
      <Sun className="h-3.5 w-3.5 text-[#FBBF24] chronos-logo-dark" />
      {/* Shown in light mode */}
      <Moon className="h-3.5 w-3.5 text-primary chronos-logo-light" />
    </Button>
  );
}
