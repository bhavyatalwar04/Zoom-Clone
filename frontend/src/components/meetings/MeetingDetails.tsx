"use client";

import { format } from "date-fns";
import clsx from "clsx";
import { ChartColumn, ChevronLeft, Copy, Download, FileText, ListChecks, MessageSquare, PenLine, Pencil, Trash2, Users } from "lucide-react";
import { useRef, useState } from "react";
import useSWR from "swr";
import { PollResults } from "@/components/polls/PollResults";
import { TranscriptView } from "@/components/transcript/TranscriptView";
import { WhiteboardCanvas, type WhiteboardCanvasHandle } from "@/components/whiteboard/WhiteboardCanvas";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import {
  describeRecurrence,
  formatDayLabel,
  formatDuration,
  formatMeetingId,
  formatTimeRange,
  minutesBetween,
  timeZoneLabel,
} from "@/lib/format";
import { buildInvitation } from "@/lib/invitation";
import type { Meeting } from "@/lib/types";
import { InsightsView } from "./InsightsView";
import { copyInvitation } from "./MeetingActionsMenu";
import { MeetingJoinButton } from "./MeetingJoinButton";

interface MeetingDetailsProps {
  meeting: Meeting;
  onBack: () => void;
  onEdit: (m: Meeting) => void;
  onDelete: (m: Meeting) => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-2 text-sm sm:grid-cols-[140px_1fr]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

export function MeetingDetails({ meeting: m, onBack, onEdit, onDelete }: MeetingDetailsProps) {
  const toast = useToast();
  const [showInvite, setShowInvite] = useState(false);
  const past = m.status === "ended";
  const canManage = m.is_host && m.meeting_type === "scheduled" && !past;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-6 sm:px-8 sm:py-8">
      <button onClick={onBack} className="mb-4 flex items-center gap-1 text-sm font-bold text-zoom-blue md:hidden">
        <ChevronLeft className="h-4 w-4" /> Meetings
      </button>

      <h1 className="text-2xl font-bold text-ink">{m.title}</h1>
      <p className="mt-1 text-sm text-ink-2">
        {past && m.started_at
          ? `${formatDayLabel(m.started_at)}, ${format(new Date(m.started_at), "h:mm a")}${m.ended_at ? ` - ${format(new Date(m.ended_at), "h:mm a")}` : ""}`
          : m.scheduled_start
            ? `${formatDayLabel(m.scheduled_start)}, ${formatTimeRange(m.scheduled_start, m.duration_minutes)}`
            : m.meeting_type === "personal"
              ? "Personal Meeting Room · always available"
              : "Instant meeting"}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {!past && <MeetingJoinButton meeting={m} className="h-9 px-5" />}
        <Button variant="secondary" onClick={() => copyInvitation(m, toast)}>
          <Copy className="h-4 w-4" /> Copy invitation
        </Button>
        {canManage && (
          <>
            <Button variant="secondary" onClick={() => onEdit(m)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button variant="secondary" className="text-zoom-red" onClick={() => onDelete(m)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </>
        )}
      </div>

      <dl className="mt-6 divide-y divide-line border-y border-line">
        <Row label="Meeting ID">{formatMeetingId(m.code)}</Row>
        {m.passcode && <Row label="Passcode">{m.passcode}</Row>}
        <Row label="Host">{m.is_host ? `${m.host.full_name} (you)` : m.host.full_name}</Row>
        {!past && m.scheduled_start && <Row label="Time zone">{timeZoneLabel(m.timezone)}</Row>}
        {m.recurrence && (
          <Row label="Recurrence">
            {describeRecurrence(m.recurrence, m.series_start ?? m.scheduled_start!)}
            {!past && m.next_occurrences.length > 1 && (
              <span className="mt-1 block text-xs text-muted">
                Next: {m.next_occurrences.slice(0, 4).map((d) => format(new Date(d), "EEE, MMM d")).join(" · ")}
              </span>
            )}
          </Row>
        )}
        {past && m.started_at && m.ended_at && <Row label="Duration">{formatDuration(minutesBetween(m.started_at, m.ended_at))}</Row>}
        {m.description && <Row label="Description">{m.description}</Row>}
        <Row label="Invite link">
          <a href={m.join_url} className="text-zoom-blue hover:underline">
            {m.join_url}
          </a>
        </Row>
        {!past && m.invitees.length > 0 && <Row label="Attendees">{m.invitees.join(", ")}</Row>}
        {!past && (
          <Row label="Video">
            Host {m.host_video_on ? "on" : "off"} · Participants {m.participant_video_on ? "on" : "off"}
          </Row>
        )}
        {!past && (
          <Row label="Options">
            {[m.waiting_room && "Waiting room", m.join_before_host && "Participants can join anytime", m.mute_on_entry && "Mute participants upon entry"]
              .filter(Boolean)
              .join(" · ") || "—"}
          </Row>
        )}
      </dl>

      {!past && (
        <div className="mt-4">
          <button onClick={() => setShowInvite((v) => !v)} className="text-sm font-bold text-zoom-blue hover:underline">
            {showInvite ? "Hide meeting invitation" : "Show meeting invitation"}
          </button>
          {showInvite && (
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-surface p-4 font-sans text-[13px] leading-relaxed text-ink-2">
              {buildInvitation({ ...m, hostName: m.host.full_name })}
            </pre>
          )}
        </div>
      )}

      {past && <MeetingHistory code={m.code} title={m.title} />}
    </div>
  );
}

const HISTORY_TABS = [
  { id: "insights", label: "Insights", icon: ChartColumn },
  { id: "participants", label: "Participants", icon: Users },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "polls", label: "Polls", icon: ListChecks },
  { id: "transcript", label: "Transcript", icon: FileText },
  { id: "whiteboard", label: "Whiteboard", icon: PenLine },
] as const;

type HistoryTab = (typeof HISTORY_TABS)[number]["id"];

/** What happened in a past meeting: insights, attendance, chat and transcript. */
function MeetingHistory({ code, title }: { code: string; title: string }) {
  const [tab, setTab] = useState<HistoryTab>("insights");
  const { data: insights, error: insightsError } = useSWR(["insights", code], () => api.insights(code));
  const { data: participants } = useSWR(["participants", code], () => api.participants(code));
  const { data: messages } = useSWR(["messages", code], () => api.messages(code));
  const { data: transcript } = useSWR(["transcript", code], () => api.transcript(code));
  const { data: polls } = useSWR(["polls", code], () => api.polls(code));
  const { data: breakouts } = useSWR(["breakouts", code], () => api.breakouts(code));
  const { data: strokes } = useSWR(["whiteboard", code], () => api.whiteboard(code));
  const board = useRef<WhiteboardCanvasHandle>(null);

  // One row per person, even if they re-joined several times.
  const people = participants
    ? [...new Map(participants.map((p) => [p.display_name.toLowerCase(), p])).values()]
    : [];

  return (
    <div className="mt-8">
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {HISTORY_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={clsx(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-sm font-bold",
              tab === id ? "border-zoom-blue text-zoom-blue" : "border-transparent text-muted hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4" /> {label}
            {id === "participants" && participants && <span className="font-normal">({people.length})</span>}
          </button>
        ))}
      </div>

      {tab === "insights" &&
        (insights ? (
          <InsightsView insights={insights} />
        ) : (
          <p className="text-sm text-muted">{insightsError ? "Couldn't load insights." : "Loading insights…"}</p>
        ))}

      {tab === "participants" && (
        <ul className="space-y-2.5">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5 text-sm">
              <Avatar name={p.display_name} size={28} shape="square" />
              <span className="min-w-0 flex-1 truncate">
                {p.display_name}
                {p.role === "host" && <span className="text-muted"> (Host)</span>}
                {p.was_removed && <span className="text-zoom-red"> · removed</span>}
              </span>
              <span className="text-xs text-muted">Joined {format(new Date(p.joined_at), "h:mm a")}</span>
            </li>
          ))}
        </ul>
      )}

      {tab === "participants" && breakouts && breakouts.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-sm font-bold text-ink">Breakout rooms</h3>
          <ul className="space-y-1.5 text-sm">
            {breakouts.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-20 shrink-0 font-bold text-ink-2">{b.name}</span>
                <span className="text-muted">{b.participants.join(", ") || "Empty"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "whiteboard" &&
        (strokes && strokes.length > 0 ? (
          <div>
            <div className="aspect-video w-full rounded-lg bg-surface p-2">
              <WhiteboardCanvas ref={board} strokes={strokes} />
            </div>
            <button
              onClick={() => {
                const url = board.current?.toPng();
                if (url) Object.assign(document.createElement("a"), { href: url, download: `whiteboard_${code}.png` }).click();
              }}
              className="mt-3 flex items-center gap-1.5 text-sm font-bold text-zoom-blue hover:underline"
            >
              <Download className="h-4 w-4" /> Save as PNG
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">The whiteboard wasn&apos;t used in this meeting.</p>
        ))}

      {tab === "chat" && (
        <>
          {messages?.length === 0 && <p className="text-sm text-muted">No messages were sent in this meeting.</p>}
          <ul className="space-y-3">
            {messages?.map((msg) => (
              <li key={msg.id} className="text-sm">
                <p className="text-xs text-muted">
                  <span className="font-bold text-ink-2">{msg.sender_name}</span> · {format(new Date(msg.sent_at), "h:mm a")}
                </p>
                <p className="mt-0.5 text-ink">{msg.content}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "polls" && (
        <div className="space-y-4">
          {polls?.length === 0 && <p className="text-sm text-muted">No polls were run in this meeting.</p>}
          {polls?.map((poll) => (
            <article key={poll.id} className="rounded-xl p-4 ring-1 ring-line">
              <h3 className="mb-3 text-sm font-bold text-ink">{poll.question}</h3>
              <PollResults poll={poll} />
              <p className="mt-2 text-xs text-muted">
                {poll.total_voters} {poll.total_voters === 1 ? "person" : "people"} answered{poll.is_anonymous && " · Anonymous"}
              </p>
            </article>
          ))}
        </div>
      )}

      {tab === "transcript" && (
        <TranscriptView title={title} segments={transcript ?? []} emptyText="Live captions were not turned on in this meeting." />
      )}
    </div>
  );
}