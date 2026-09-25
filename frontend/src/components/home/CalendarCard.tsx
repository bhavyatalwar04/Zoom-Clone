"use client";

import { format } from "date-fns";
import { CalendarX2, RefreshCw, Repeat } from "lucide-react";
import { useEffect, useState } from "react";
import { MeetingActionsMenu } from "@/components/meetings/MeetingActionsMenu";
import { MeetingJoinButton } from "@/components/meetings/MeetingJoinButton";
import { useUpcomingMeetings } from "@/hooks/useMeetings";
import { formatDayLabel, formatMeetingId, formatTimeRange } from "@/lib/format";
import type { Meeting } from "@/lib/types";

function useClock() {
  const [now, setNow] = useState<Date | null>(null); // null during SSR to avoid hydration mismatch
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function groupByDay(meetings: Meeting[]) {
  const groups = new Map<string, Meeting[]>();
  for (const m of meetings) {
    const label = formatDayLabel(m.scheduled_start!);
    groups.set(label, [...(groups.get(label) ?? []), m]);
  }
  return [...groups.entries()];
}

interface CalendarCardProps {
  onSchedule: () => void;
  onEdit: (m: Meeting) => void;
  onDelete: (m: Meeting) => void;
}

export function CalendarCard({ onSchedule, onEdit, onDelete }: CalendarCardProps) {
  const now = useClock();
  const { data: meetings, isLoading, error, mutate, isValidating } = useUpcomingMeetings();

  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-line" aria-labelledby="upcoming-heading">
      {/* Header with the big clock, like the Zoom Workplace home screen */}
      <div className="relative h-36 overflow-hidden bg-[linear-gradient(135deg,#0b5cff_0%,#3d7bff_45%,#7aa7ff_100%)] px-6 py-6 text-white sm:h-40">
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute -bottom-24 right-24 h-48 w-48 rounded-full bg-white/10" />
        <p className="relative text-[40px] font-bold leading-none tracking-tight sm:text-5xl" suppressHydrationWarning>
          {now ? format(now, "h:mm a") : " "}
        </p>
        <p className="relative mt-2 text-sm font-bold text-white/90">{now ? format(now, "EEEE, MMMM d") : " "}</p>
      </div>

      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 id="upcoming-heading" className="text-[15px] font-bold text-ink">
          Upcoming meetings
        </h2>
        <button
          onClick={() => mutate()}
          className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink"
          aria-label="Refresh upcoming meetings"
        >
          <RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="scroll-thin max-h-[420px] overflow-y-auto px-2 pb-3">
        {isLoading && <ListSkeleton />}
        {error && <p className="px-3 py-6 text-center text-sm text-zoom-red">Couldn&apos;t load meetings. {error.message}</p>}
        {meetings && meetings.length === 0 && (
          <div className="flex flex-col items-center px-3 py-10 text-center">
            <CalendarX2 className="h-10 w-10 text-[#c9ccd2]" />
            <p className="mt-3 text-sm text-ink-2">No upcoming meetings</p>
            <button onClick={onSchedule} className="mt-1 text-sm font-bold text-zoom-blue hover:underline">
              Schedule a meeting
            </button>
          </div>
        )}
        {meetings &&
          groupByDay(meetings).map(([day, items]) => (
            <div key={day}>
              <p className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-muted">{day}</p>
              <ul>
                {items.map((m) => (
                  <li key={`${m.code}-${m.scheduled_start}`} className="group flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-surface">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-bold text-ink">
                        {m.title}
                        {m.recurrence && <Repeat className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Recurring meeting" />}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        {formatTimeRange(m.scheduled_start!, m.duration_minutes)}
                        {m.status === "live" && (
                          <span className="rounded bg-green-50 px-1.5 py-px font-bold text-zoom-green">In progress</span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        Meeting ID: {formatMeetingId(m.code)}
                        {!m.is_host && ` · Host: ${m.host.full_name}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <MeetingJoinButton meeting={m} />
                      <MeetingActionsMenu meeting={m} onEdit={onEdit} onDelete={onDelete} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </section>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-3 py-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="animate-pulse space-y-2">
          <div className="h-3.5 w-2/3 rounded bg-surface" />
          <div className="h-3 w-1/3 rounded bg-surface" />
        </div>
      ))}
    </div>
  );
}
