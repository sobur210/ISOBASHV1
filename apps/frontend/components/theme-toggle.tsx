"use client";

import { useCallback, useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@/components/ui/icons";

/**
 * The theme lives on `<html class="light">`, which is also what the server-rendered
 * markup and the theme script agree on. Deriving it with `useSyncExternalStore`
 * means there is no `useEffect` that sets state on mount: React uses the server
 * snapshot for hydration and then re-renders with the real one, which is exactly
 * the behaviour the `mounted` flag was emulating.
 */
const themeListeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function subscribe(onStoreChange: () => void) {
  themeListeners.add(onStoreChange);
  if (!observer) {
    observer = new MutationObserver(() => {
      for (const listener of themeListeners) listener();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
  return () => {
    themeListeners.delete(onStoreChange);
    if (themeListeners.size === 0) {
      observer?.disconnect();
      observer = null;
    }
  };
}

function getSnapshot() {
  return document.documentElement.classList.contains("light");
}

/** The server has no idea which theme the visitor chose, so it renders dark. */
function getServerSnapshot() {
  return false;
}

export function ThemeToggle({
  className = "",
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const isLight = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = !document.documentElement.classList.contains("light");
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem("isobash_theme", next ? "light" : "dark");
    } catch {}
    document.cookie = `isobash_theme=${next ? "light" : "dark"}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface-2 p-2 text-muted-foreground transition-all hover:border-primary/40 hover:bg-surface-3 hover:text-primary active:scale-95 cursor-pointer ${className}`}
    >
      {isLight ? (
        <SunIcon className="h-4 w-4 text-amber-500 transition-transform duration-300 hover:rotate-90" />
      ) : (
        <MoonIcon className="h-4 w-4 text-indigo-400 transition-transform duration-300 hover:-rotate-12" />
      )}
      {showLabel ? (
        <span className="text-xs font-medium text-foreground">
          {isLight ? "Light Mode" : "Dark Mode"}
        </span>
      ) : null}
    </button>
  );
}
