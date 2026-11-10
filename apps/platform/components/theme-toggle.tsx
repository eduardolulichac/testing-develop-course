"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Toggles between light and dark. Renders a neutral placeholder until mounted. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const isDark = mounted && resolvedTheme === "dark";
  const label = isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted hover:text-foreground"
    >
      <span aria-hidden="true">{mounted ? (isDark ? "☀" : "☾") : "◐"}</span>
    </button>
  );
}
