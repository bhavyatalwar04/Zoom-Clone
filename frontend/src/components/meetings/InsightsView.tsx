"use client";

import { useState } from "react";
import { formatDuration } from "@/lib/format";
import type { MeetingInsights, ParticipantInsight } from "@/lib/types";

/** 272 -> "4m 32s", 45 -> "45s". */
export function formatTalk(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** Short form for stat tiles: 45 -> "45 min", 65 -> "1h 5m". */
const compactDuration = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 whitespace-nowrap text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

/**
 * Talk time per person: one series, so one hue and no legend; the value sits at each bar's tip
 * and the full numbers are in the tooltip and the table below.
 */
function TalkTimeChart({ people }: { people: ParticipantInsight[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(...people.map((p) => p.talk_seconds), 1);

  return (
    <ul className="space-y-1" aria-label="Talk time per participant">
      {people.map((p) => {
        const width = (p.talk_seconds / max) * 100;
        const isHovered = hovered === p.display_name;
        return (
          <li
            key={p.display_name}
            className="relative grid grid-cols-[minmax(84px,140px)_1fr] items-center gap-3 rounded-md px-1 py-1.5 hover:bg-surface"
            onMouseEnter={() => setHovered(p.display_name)}
            onMouseLeave={() => setHovered(null)}
            tabIndex={0}
            onFocus={() => setHovered(p.display_name)}
            onBlur={() => setHovered(null)}
          >
            <span className="truncate text-sm text-ink-2" title={p.display_name}>
              {p.display_name}
              {p.is_host && <span className="text-muted"> (Host)</span>}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              {/* 12px bar, square at the baseline, 4px rounded at the data end */}
              <span className="h-3 shrink-0 rounded-r bg-zoom-blue" style={{ width: `calc(${width}% * 0.78)`, minWidth: p.talk_seconds ? 2 : 0 }} />
              <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-ink-2">
                {formatTalk(p.talk_seconds)} · {percent(p.talk_share)}
              </span>
            </span>
            {isHovered && (
              <span role="tooltip" className="pointer-events-none absolute left-[150px] top-full z-10 mt-1 w-56 rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-pop">
                <span className="block font-bold">{p.display_name}</span>
                <span className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-white/80">
                  <span>Talk time</span>
                  <span className="text-right text-white">{formatTalk(p.talk_seconds)}</span>
                  <span>Share of talk</span>
                  <span className="text-right text-white">{percent(p.talk_share)}</span>
                  <span>Attended</span>
                  <span className="text-right text-white">{formatDuration(p.attended_minutes)}</span>
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function InsightsView({ insights }: { insights: MeetingInsights }) {
  const { participants } = insights;
  const talkers = participants.filter((p) => p.talk_seconds > 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Duration" value={compactDuration(insights.duration_minutes)} />
        <StatTile label="Participants" value={insights.participant_count} />
        <StatTile label="Chat messages" value={insights.total_messages} />
        <StatTile label="Reactions" value={insights.total_reactions} />
      </div>

      <section>
        <h3 className="text-sm font-bold text-ink">Talk time</h3>
        <p className="mb-3 text-xs text-muted">How long each person spoke, and their share of all speaking time.</p>
        {talkers.length ? (
          <TalkTimeChart people={participants} />
        ) : (
          <p className="rounded-lg bg-surface px-4 py-6 text-center text-sm text-muted">No speech was detected in this meeting.</p>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-bold text-ink">Engagement</h3>
        <div className="overflow-x-auto rounded-lg ring-1 ring-line">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-surface text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-bold">Participant</th>
                {["Attended", "Talk time", "Messages", "Reactions", "Raised hand"].map((h) => (
                  <th key={h} className="px-3 py-2 text-right font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {participants.map((p) => (
                <tr key={p.display_name}>
                  <td className="px-3 py-2 text-ink">
                    {p.display_name}
                    {p.is_host && <span className="text-muted"> (Host)</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-2">{formatDuration(p.attended_minutes)}</td>
                  <td className="px-3 py-2 text-right text-ink-2">{formatTalk(p.talk_seconds)}</td>
                  <td className="px-3 py-2 text-right text-ink-2">{p.messages}</td>
                  <td className="px-3 py-2 text-right text-ink-2">{p.reactions}</td>
                  <td className="px-3 py-2 text-right text-ink-2">{p.hand_raises}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-bold text-ink">Reactions</h3>
          {insights.reactions_by_emoji.length ? (
            <ul className="flex flex-wrap gap-2">
              {insights.reactions_by_emoji.map((r) => (
                <li key={r.emoji} className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm">
                  <span className="text-base">{r.emoji}</span>
                  <span className="tabular-nums text-ink-2">{r.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No reactions.</p>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold text-ink">Also in this meeting</h3>
          <ul className="space-y-1 text-sm text-ink-2">
            <li>{insights.total_hand_raises} raised hand{insights.total_hand_raises === 1 ? "" : "s"}</li>
            <li>{insights.screen_shares} screen share{insights.screen_shares === 1 ? "" : "s"}</li>
            <li>{insights.transcript_lines} transcript line{insights.transcript_lines === 1 ? "" : "s"}</li>
            <li>{insights.polls} poll{insights.polls === 1 ? "" : "s"}</li>
            {insights.recordings.map((r, i) => (
              <li key={i}>
                Recorded locally by {r.recorded_by} ({formatTalk(r.duration_seconds)})
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
