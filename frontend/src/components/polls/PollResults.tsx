import clsx from "clsx";
import { Check } from "lucide-react";
import type { PollView } from "@/lib/types";

/**
 * Horizontal result bars for one poll. A single series, so one hue and no legend; each bar's
 * count and share sit at its tip. `tone` switches between the white panels and the dark meeting.
 */
export function PollResults({ poll, tone = "light" }: { poll: PollView; tone?: "light" | "dark" }) {
  const total = poll.total_voters ?? 0;
  const max = Math.max(1, ...poll.options.map((o) => o.votes ?? 0));

  return (
    <ul className="space-y-2.5">
      {poll.options.map((option) => {
        const votes = option.votes ?? 0;
        const share = total ? Math.round((votes / total) * 100) : 0;
        const mine = poll.my_votes.includes(option.id);
        return (
          <li key={option.id} title={option.voters?.length ? `Voted: ${option.voters.join(", ")}` : undefined}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className={clsx("flex min-w-0 items-center gap-1", tone === "dark" ? "text-room-text" : "text-ink")}>
                {mine && <Check className="h-3.5 w-3.5 shrink-0 text-zoom-blue" aria-label="Your answer" />}
                <span className="truncate">{option.text}</span>
              </span>
              <span className={clsx("shrink-0 text-xs tabular-nums", tone === "dark" ? "text-room-text/70" : "text-muted")}>
                {share}% ({votes})
              </span>
            </div>
            <div className={clsx("mt-1 h-2 rounded-r", tone === "dark" ? "bg-white/10" : "bg-surface")}>
              {/* square at the baseline, rounded at the data end */}
              <div className="h-2 rounded-r bg-zoom-blue" style={{ width: `${(votes / max) * 100}%` }} />
            </div>
            {option.voters && option.voters.length > 0 && (
              <p className={clsx("mt-0.5 truncate text-[11px]", tone === "dark" ? "text-room-text/50" : "text-muted")}>
                {option.voters.join(", ")}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
