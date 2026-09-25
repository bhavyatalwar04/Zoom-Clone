"use client";

import clsx from "clsx";
import { format } from "date-fns";
import { CalendarClock, Plus, RefreshCw, Repeat } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { ListSkeleton } from "@/components/home/CalendarCard";
import { useDeleteMeeting } from "@/components/meetings/MeetingActionsMenu";
import { MeetingDetails } from "@/components/meetings/MeetingDetails";
import { ScheduleMeetingModal } from "@/components/meetings/ScheduleMeetingModal";
import { useRecentMeetings, useUpcomingMeetings } from "@/hooks/useMeetings";
import { formatDayLabel, formatMeetingId } from "@/lib/format";
import { api } from "@/lib/api";
import type { Meeting } from "@/lib/types";

type Tab = "upcoming" | "previous" | "personal";
const TAB_LABELS: Record<Tab, string> = { upcoming: "Upcoming", previous: "Previous", personal: "Personal Room" };

function meetingDate(m: Meeting) {
  return m.status === "ended" ? m.started_at! : (m.scheduled_start ?? m.created_at);
}

function MeetingsView() {
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "previous" || tabParam === "personal" ? tabParam : "upcoming";
  const selectedCode = params.get("code");
  // Occurrences of a recurring meeting share a code, so the occurrence start picks one.
  const selectedAt = params.get("at");

  const lists = { upcoming: useUpcomingMeetings(), previous: useRecentMeetings() };
  const personal = useSWR(tab === "personal" ? "meetings:personal" : null, api.personalRoom);
  const source = tab === "personal" ? personal : lists[tab];
  const data = tab === "personal" ? (personal.data ? [personal.data] : undefined) : lists[tab].data;
  const { isLoading, isValidating } = source;
  const refresh = () => void source.mutate();

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);

  const go = (next: { tab?: Tab; code?: string | null; at?: string | null }) => {
    const q = new URLSearchParams();
    q.set("tab", next.tab ?? tab);
    const code = next.code === undefined ? selectedCode : next.code;
    if (code) q.set("code", code);
    if (code && next.at) q.set("at", next.at);
    router.replace(`/meetings?${q}`, { scroll: false });
  };

  const { requestDelete, dialog: deleteDialog } = useDeleteMeeting(() => go({ code: null }));
  // On desktop the first meeting is shown by default; on mobile the list is shown until one is picked.
  const selected =
    data?.find((m) => m.code === selectedCode && (!selectedAt || m.scheduled_start === selectedAt)) ??
    (selectedCode ? null : data?.[0]) ??
    null;

  const groups = new Map<string, Meeting[]>();
  data?.forEach((m) => {
    const label = tab === "personal" ? "Personal Meeting ID" : formatDayLabel(meetingDate(m));
    groups.set(label, [...(groups.get(label) ?? []), m]);
  });

  return (
    <div className="flex h-[calc(100dvh-57px)] min-h-0">
      <aside
        className={clsx(
          "flex w-full flex-col border-r border-line bg-white md:w-[340px] md:shrink-0",
          selectedCode && "hidden md:flex",
        )}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h1 className="text-lg font-bold">Meetings</h1>
          <div className="flex gap-1">
            <button onClick={refresh} className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink" aria-label="Refresh">
              <RefreshCw className={clsx("h-4 w-4", isValidating && "animate-spin")} />
            </button>
            <button
              onClick={() => setScheduleOpen(true)}
              className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink"
              aria-label="Schedule a meeting"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex gap-5 border-b border-line px-4" role="tablist">
          {(["upcoming", "previous", "personal"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => go({ tab: t, code: null })}
              className={clsx(
                "-mb-px whitespace-nowrap border-b-2 pb-2 pt-1 text-sm font-bold",
                tab === t ? "border-zoom-blue text-zoom-blue" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-2 py-2">
          {isLoading && <ListSkeleton rows={4} />}
          {data?.length === 0 && (
            <p className="px-3 py-10 text-center text-sm text-muted">
              {tab === "upcoming" ? "No upcoming meetings" : "No previous meetings"}
            </p>
          )}
          {[...groups.entries()].map(([day, items]) => (
            <div key={day}>
              <p className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-muted">{day}</p>
              {items.map((m) => (
                <button
                  key={`${m.code}-${m.scheduled_start}`}
                  onClick={() => go({ code: m.code, at: m.scheduled_start })}
                  className={clsx(
                    "flex w-full flex-col rounded-xl px-3 py-2.5 text-left",
                    selected === m ? "bg-zoom-blue-soft" : "hover:bg-surface",
                  )}
                >
                  <span className="flex items-center gap-1 text-xs text-muted">
                    {tab === "personal" ? "Always available" : format(new Date(meetingDate(m)), "h:mm a")}
                    {m.recurrence && <Repeat className="h-3 w-3" aria-label="Recurring" />}
                    {m.status === "live" && <span className="ml-2 font-bold text-zoom-green">In progress</span>}
                  </span>
                  <span className="truncate text-sm font-bold text-ink">{m.title}</span>
                  <span className="text-xs text-muted">Meeting ID: {formatMeetingId(m.code)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <section className={clsx("scroll-thin flex-1 overflow-y-auto", !selectedCode && "hidden md:block")}>
        {selected ? (
          <MeetingDetails
            key={selected.code}
            meeting={selected}
            onBack={() => go({ code: null })}
            onEdit={setEditing}
            onDelete={requestDelete}
          />
        ) : (
          !isLoading && (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <CalendarClock className="h-12 w-12 text-[#c9ccd2]" />
              <p className="mt-3 text-sm text-ink-2">Select a meeting to see its details</p>
            </div>
          )
        )}
      </section>

      <ScheduleMeetingModal
        open={scheduleOpen || !!editing}
        meeting={editing}
        onClose={() => {
          setScheduleOpen(false);
          setEditing(null);
        }}
        onSaved={(m) => go({ tab: "upcoming", code: m.code })}
      />
      {deleteDialog}
    </div>
  );
}

export default function MeetingsPage() {
  return (
    <Suspense fallback={null}>
      <MeetingsView />
    </Suspense>
  );
}
