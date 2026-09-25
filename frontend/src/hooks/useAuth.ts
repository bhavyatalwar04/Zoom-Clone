"use client";

import { useSyncExternalStore } from "react";
import { getToken, subscribeToAuth } from "@/lib/auth";

/** Whether this browser has a signed-in session (false = acting as the demo user). */
export function useSignedIn(): boolean {
  return useSyncExternalStore(subscribeToAuth, () => !!getToken(), () => false);
}
