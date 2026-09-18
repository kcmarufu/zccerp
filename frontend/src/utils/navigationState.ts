/**
 * Navigation helpers that keep a list page the way the user left it.
 *
 * usePersistentState — a useState whose value survives leaving the page and
 *   coming back (open an item, press Back, and the search, filters, tab and
 *   page are still applied). Held in sessionStorage, so it lasts for the
 *   browser tab and is cleared on logout.
 *
 * useGoBack — return to wherever the user came from inside the app (an
 *   approval queue, a filtered list), and only fall back to a fixed route when
 *   the page was opened directly (a link, a notification, a refresh).
 */

import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PREFIX = 'ui-state:';

export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = PREFIX + key;

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // Unavailable or corrupt storage — start from the default.
    }
    return initial;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Storage full or blocked — the page still works, it just won't remember.
    }
  }, [storageKey, value]);

  return [value, setValue];
}

/** Forget every remembered filter — called on logout so the next user starts clean. */
export function clearPersistentState(): void {
  try {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => sessionStorage.removeItem(k));
  } catch {
    // Nothing to clear.
  }
}

export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    // React Router records each in-app entry's position as history.state.idx;
    // 0 means this page was the first one opened in the tab.
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  }, [navigate, fallback]);
}
