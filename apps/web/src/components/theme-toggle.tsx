"use client";
import { Button } from "@sibol-cse/ui/components/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useAppearance } from "./appearance-provider";

export function ThemeToggle() {
  const { setTheme } = useTheme();
  const appearance = useAppearance();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label="Toggle light and dark theme"
        disabled={!!appearance && (appearance.pending || !appearance.settings)}
        onClick={() => {
          const theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
          if (appearance) void appearance.update({ theme }).catch(() => {});
          else setTheme(theme);
        }}
      >
        <Moon className="dark:hidden" aria-hidden="true" />
        <Sun className="hidden dark:block" aria-hidden="true" />
      </Button>
      {appearance?.error && (
        <span role="alert" className="max-w-64 text-sm text-destructive">
          {appearance.error}
        </span>
      )}
    </div>
  );
}
