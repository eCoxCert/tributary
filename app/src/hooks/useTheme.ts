import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "trib-theme";

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}
const system = (): Theme => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

/** System theme by default; an explicit choice is saved (localStorage may be blocked, so every access is guarded). */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => stored() ?? system());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.dispatchEvent(new CustomEvent("trib:theme"));
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => {
      if (!stored()) setThemeState(system());
    };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* blocked: the choice lasts for this page view only */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
