import { useEffect } from "react";

/** One document title per route. */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Tributary`;
  }, [title]);
}
