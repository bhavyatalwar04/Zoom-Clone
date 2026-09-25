/** Time helpers for the in-meeting timer and the "meeting ends soon" warning. */

export const ENDING_SOON_MINUTES = 5;

export type EndNotice = { kind: "ending-soon"; minutesLeft: number } | { kind: "overtime" } | null;

/**
 * Which end-of-meeting notice (if any) applies right now. Only scheduled meetings have an end
 * time; instant meetings return null.
 */
export function endNotice(nowMs: number, scheduledStart: string | null, durationMinutes: number): EndNotice {
  if (!scheduledStart) return null;
  const end = Date.parse(scheduledStart) + durationMinutes * 60_000;
  if (Number.isNaN(end)) return null;
  if (nowMs >= end) return { kind: "overtime" };
  const left = end - nowMs;
  if (left <= ENDING_SOON_MINUTES * 60_000) return { kind: "ending-soon", minutesLeft: Math.ceil(left / 60_000) };
  return null;
}

/** 754_000 -> "12:34", 3_723_000 -> "1:02:03" (Zoom's meeting timer format). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
