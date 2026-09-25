"use client";

import { useSyncExternalStore } from "react";

/** Per-browser client preferences (the Settings dialog), persisted in localStorage. */
export interface ClientSettings {
  startWithVideo: boolean;
  /** New meeting starts my Personal Meeting Room instead of a fresh Meeting ID. */
  usePmi: boolean;
  muteOnJoin: boolean;
  confirmLeave: boolean;
  mirrorVideo: boolean;
  showNamesOnVideo: boolean;
  displayName: string;
  status: "available" | "away" | "busy";
}

const KEY = "zoom-clone:settings";
const DEFAULTS: ClientSettings = {
  startWithVideo: true,
  usePmi: false,
  muteOnJoin: false,
  confirmLeave: true,
  mirrorVideo: true,
  showNamesOnVideo: true,
  displayName: "",
  status: "available",
};

let cache: ClientSettings | null = null;
const listeners = new Set<() => void>();

function read(): ClientSettings {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    cache = DEFAULTS;
  }
  return cache!;
}

export function updateSettings(patch: Partial<ClientSettings>) {
  cache = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable (private mode) - keep the in-memory value
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): [ClientSettings, typeof updateSettings] {
  const settings = useSyncExternalStore(subscribe, read, () => DEFAULTS);
  return [settings, updateSettings];
}
