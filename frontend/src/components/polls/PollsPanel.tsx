"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { SidePanel } from "@/components/room/SidePanel";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Field";
import type { PollDraft, PollView } from "@/lib/types";
import { PollResults } from "./PollResults";

const MAX_OPTIONS = 10;
const EMPTY_DRAFT: PollDraft = { question: "", options: ["", ""], allow_multiple: false, anonymous: false };

interface PollsPanelProps {
  polls: PollView[];
  isModerator: boolean;
  onLaunch: (draft: PollDraft) => void;
  onEnd: (pollId: number) => void;
  onAnswer: (poll: PollView) => void;
  onClose: () => void;
}

function CreatePollForm({ onLaunch, onCancel }: { onLaunch: (d: PollDraft) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<PollDraft>(EMPTY_DRAFT);
  const filled = draft.options.map((o) => o.trim()).filter(Boolean);
  const valid = draft.question.trim() && filled.length >= 2 && new Set(filled.map((o) => o.toLowerCase())).size === filled.length;
  const setOption = (i: number, value: string) =>
    setDraft((d) => ({ ...d, options: d.options.map((o, j) => (j === i ? value : o)) }));

  return (
    <form
      className="space-y-3 rounded-xl bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onLaunch({ ...draft, options: filled });
        setDraft(EMPTY_DRAFT);
      }}
    >
      <Input
        value={draft.question}
        onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
        placeholder="Ask a question"
        maxLength={300}
        aria-label="Poll question"
        autoFocus
      />
      <div className="space-y-2">
        {draft.options.map((option, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input value={option} onChange={(e) => setOption(i, e.target.value)} placeholder={`Answer ${i + 1}`} maxLength={200} aria-label={`Answer ${i + 1}`} className="h-9" />
            {draft.options.length > 2 && (
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, options: d.options.filter((_, j) => j !== i) }))}
                className="rounded p-1 text-muted hover:bg-white hover:text-ink"
                aria-label={`Remove answer ${i + 1}`}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {draft.options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, options: [...d.options, ""] }))}
            className="flex items-center gap-1 text-sm font-bold text-zoom-blue hover:underline"
          >
            <Plus className="h-4 w-4" /> Add answer
          </button>
        )}
      </div>
      <Checkbox checked={draft.allow_multiple} onChange={(v) => setDraft((d) => ({ ...d, allow_multiple: v }))} label="Allow multiple answers" />
      <Checkbox checked={draft.anonymous} onChange={(v) => setDraft((d) => ({ ...d, anonymous: v }))} label="Anonymous" description="Hide who voted for what" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!valid}>
          Launch
        </Button>
      </div>
    </form>
  );
}

export function PollsPanel({ polls, isModerator, onLaunch, onEnd, onAnswer, onClose }: PollsPanelProps) {
  const [creating, setCreating] = useState(false);
  const newestFirst = [...polls].reverse();

  return (
    <SidePanel title="Polls" onClose={onClose}>
      <div className="space-y-4 px-4 pb-4">
        {isModerator &&
          (creating ? (
            <CreatePollForm
              onLaunch={(draft) => {
                onLaunch(draft);
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <Button className="w-full" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Create poll
            </Button>
          ))}

        {polls.length === 0 && !creating && (
          <p className="py-8 text-center text-sm text-muted">
            {isModerator ? "Create a poll to get quick feedback from everyone." : "The host hasn't launched any polls yet."}
          </p>
        )}

        {newestFirst.map((poll) => {
          const answered = poll.my_votes.length > 0;
          const showResults = poll.total_voters !== null;
          return (
            <article key={poll.id} className="rounded-xl p-3 ring-1 ring-line" aria-label={`Poll: ${poll.question}`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold text-ink">{poll.question}</h3>
                <span
                  className={
                    poll.status === "open"
                      ? "shrink-0 rounded bg-green-50 px-1.5 py-px text-[11px] font-bold text-zoom-green"
                      : "shrink-0 rounded bg-surface px-1.5 py-px text-[11px] font-bold text-muted"
                  }
                >
                  {poll.status === "open" ? "Live" : "Ended"}
                </span>
              </div>
              {showResults ? (
                <>
                  <PollResults poll={poll} />
                  <p className="mt-2 text-xs text-muted">
                    {poll.total_voters} {poll.total_voters === 1 ? "person" : "people"} answered
                    {poll.is_anonymous && " · Anonymous"}
                  </p>
                </>
              ) : answered ? (
                <p className="text-sm text-muted">Answer submitted. Results will be shared when the poll ends.</p>
              ) : (
                <Button size="sm" onClick={() => onAnswer(poll)} disabled={poll.status !== "open"}>
                  Answer poll
                </Button>
              )}
              {isModerator && poll.status === "open" && (
                <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => onEnd(poll.id)}>
                  End poll and share results
                </Button>
              )}
            </article>
          );
        })}
      </div>
    </SidePanel>
  );
}
