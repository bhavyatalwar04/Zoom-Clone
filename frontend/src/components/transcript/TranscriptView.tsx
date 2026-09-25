"use client";

import clsx from "clsx";
import { format } from "date-fns";
import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { TranscriptSegment } from "@/lib/types";

/** Wraps every case-insensitive occurrence of `query` in a highlight. */
function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    <>
      {text.split(new RegExp(`(${escaped})`, "gi")).map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="rounded bg-amber-200 px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function transcriptToText(title: string, segments: TranscriptSegment[]): string {
  const lines = segments.map((s) => `[${format(new Date(s.spoken_at), "HH:mm:ss")}] ${s.speaker_name}: ${s.content}`);
  return [`Transcript: ${title}`, "", ...lines].join("\n");
}

function download(title: string, segments: TranscriptSegment[]) {
  const blob = new Blob([transcriptToText(title, segments)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `${title.replace(/[^\w-]+/g, "_")}_transcript.txt` });
  a.click();
  URL.revokeObjectURL(url);
}

interface TranscriptViewProps {
  title: string;
  segments: TranscriptSegment[];
  emptyText: string;
  className?: string;
}

/** Searchable, downloadable transcript. Used in the meeting side panel and on past meetings. */
export function TranscriptView({ title, segments, emptyText, className }: TranscriptViewProps) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const visible = useMemo(
    () =>
      q
        ? segments.filter((s) => `${s.speaker_name} ${s.content}`.toLowerCase().includes(q.toLowerCase()))
        : segments,
    [segments, q],
  );

  return (
    <div className={clsx("flex flex-col", className)}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcript"
            aria-label="Search transcript"
            className="h-8 w-full rounded-lg bg-surface pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-zoom-blue"
          />
        </div>
        <button
          onClick={() => download(title, segments)}
          disabled={!segments.length}
          className="rounded-lg p-1.5 text-muted ring-1 ring-line hover:bg-surface hover:text-ink disabled:opacity-40"
          aria-label="Download transcript"
          title="Download transcript (.txt)"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
      {q && (
        <p className="mt-2 text-xs text-muted">
          {visible.length} of {segments.length} lines match &ldquo;{q}&rdquo;
        </p>
      )}
      {segments.length === 0 && <p className="py-8 text-center text-sm text-muted">{emptyText}</p>}
      <ol className="mt-3 space-y-3">
        {visible.map((s) => (
          <li key={s.id} className="text-sm">
            <p className="text-xs text-muted">
              <span className="font-bold text-ink-2">
                <Highlighted text={s.speaker_name} query={q} />
              </span>{" "}
              · {format(new Date(s.spoken_at), "h:mm:ss a")}
            </p>
            <p className="mt-0.5 leading-relaxed text-ink">
              <Highlighted text={s.content} query={q} />
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
