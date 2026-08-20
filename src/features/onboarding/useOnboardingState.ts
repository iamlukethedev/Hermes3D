/**
 * useOnboardingState — Tracks whether onboarding has been completed.
 *
 * Uses localStorage so the wizard only shows once per browser.
 * The key is scoped to the Hermes3D app to avoid collisions.
 *
 * localStorage is an external store, so the value is read through
 * useSyncExternalStore: the server snapshot reports "completed" (the wizard
 * never flashes during SSR/hydration) and the client corrects it right after
 * hydration, which is the same first paint the old mount-effect produced
 * without setting state from an effect.
 */
import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "hermes3d:onboarding:completed";

const listeners = new Set<() => void>();

const emitChange = (): void => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  // Keep multiple tabs in sync: "storage" fires for writes from other tabs.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

const readCompleted = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const readCompletedOnServer = (): boolean => true;

const writeCompleted = (value: boolean): void => {
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage might be unavailable in some environments.
  }
  emitChange();
};

export type OnboardingStateReturn = {
  /** Whether the wizard should be shown. */
  showOnboarding: boolean;
  /** Mark onboarding as complete (hides the wizard). */
  completeOnboarding: () => void;
  /** Reset onboarding (shows the wizard again). */
  resetOnboarding: () => void;
};

export const useOnboardingState = (): OnboardingStateReturn => {
  const completed = useSyncExternalStore(
    subscribe,
    readCompleted,
    readCompletedOnServer,
  );

  const completeOnboarding = useCallback(() => {
    writeCompleted(true);
  }, []);

  const resetOnboarding = useCallback(() => {
    writeCompleted(false);
  }, []);

  return {
    showOnboarding: !completed,
    completeOnboarding,
    resetOnboarding,
  };
};
