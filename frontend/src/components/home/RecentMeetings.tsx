"use client";

import { format } from "date-fns";
import { ChevronRight, History, Users, Video } from "lucide-react";
import Link from "next/link";
import { useRecentMeetings } from "@/hooks/useMeetings";
import { formatDayLabel, formatDuration, minutesBetween } from "@/lib/format";
import { ListSkeleton } from "./CalendarCard";

export function RecentMeetings({ limit = 5 }: { limit?: number }) {
  const { data: meetings, isLoading, error } = useRecentMeetings();

  return (
    <section className="rounded-2xl bg-white ring-1 ring-line" aria-labelledby="recent-heading">
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 id="recent-heading" className="text-[15px] font-bold text-ink">
          Recent meetings
        </h2>
        <Link href="/meetings?tab=previous" className="text-[13px] font-bold text-zoom-blue hover:underline">
          View all
        </Link>
      </div>
      <div className="px-2 pb-3">
        {isLoading && <ListSkeleton rows={2} />}
        {error && <p className="px-3 py-6 text-center text-sm text-zoom-red">Couldn&apos;t load recent meetings.</p>}
        {meetings?.length === 0 && (
          <div className="flex flex-col items-center py-8 text-center">
            <History className="h-9 w-9 text-[#c9ccd2]" />
            <p className="mt-2 text-sm text-ink-2">No recent meetings</p>
          </div>
        )}
        <ul>
          {meetings?.slice(0, limit).map((m) => (
            <li key={m.code}>
              <Link
                href={`/meetings?tab=previous&code=${m.code}`}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zoom-blue-soft text-zoom-blue">
                  <Video className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{m.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>
                      {formatDayLabel(m.started_at!)}, {format(new Date(m.started_at!), "h:mm a")}
                    </span>
                    <span>· {formatDuration(minutesBetween(m.started_at!, m.ended_at ?? m.started_at!))}</span>
                    <span className="inline-flex items-center gap-1">
                      · <Users className="h-3 w-3" /> {m.participant_count}
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
