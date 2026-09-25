"use client";

import { Clock, X } from "lucide-react";
import { useState } from "react";
import { endNotice, formatElapsed } from "@/lib/meeting-time";

/** Elapsed time since the meeting started, shown in the meeting's top bar. */
export function MeetingTimer({ startedAt, now }: { startedAt: string | null; now: number }) {
  if (!startedAt) return null;
  return (
    <span className="tabular-nums text-xs text-room-text/70" aria-label="Meeting duration">
      {formatElapsed(now - Date.parse(startedAt))}
    </span>
  );
}

/**
 * "This meeting ends in 5 minutes" warning for scheduled meetings, then an "over time" notice.
 * Each can be dismissed once.
 */
export function EndTimeBanner({ scheduledStart, durationMinutes, now }: { scheduledStart: string | null; durationMinutes: number; now: number }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const notice = endNotice(now, scheduledStart, durationMinutes);
  if (!notice || dismissed.has(notice.kind)) return null;

  const text =
    notice.kind === "ending-soon"
      ? `This meeting is scheduled to end in ${notice.minutesLeft} minute${notice.minutesLeft === 1 ? "" : "s"}.`
      : "The scheduled time for this meeting has ended.";

  return (
    <div role="status" className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-[#2b2b2b] px-3 py-2 text-sm text-room-text shadow-pop ring-1 ring-white/10">
      <Clock className="h-4 w-4 shrink-0 text-amber-400" />
      <span>{text}</span>
      <button
        onClick={() => setDismissed((d) => new Set(d).add(notice.kind))}
        className="rounded p-0.5 text-room-text/60 hover:bg-white/10 hover:text-white"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
