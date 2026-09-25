"use client";

import { UserRoundPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ZoomLogo } from "@/components/ui/ZoomLogo";
import type { WaitingPerson } from "@/lib/rtc/room-client";

/** What an attendee sees until a host admits them. */
export function WaitingRoomScreen({ title, onLeave }: { title: string | null; onLeave: () => void }) {
  return (
    <div className="flex h-dvh flex-col bg-white">
      <header className="flex h-14 items-center justify-between border-b border-line px-5">
        <ZoomLogo />
        <Button variant="secondary" size="sm" onClick={onLeave}>
          Leave
        </Button>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-zoom-blue border-r-transparent" />
        <h1 className="mt-6 text-xl font-bold text-ink">Please wait, the meeting host will let you in soon.</h1>
        {title && <p className="mt-2 text-sm text-ink-2">{title}</p>}
      </main>
    </div>
  );
}

/**
 * Pop-up for hosts / co-hosts when someone enters the waiting room, with a quick Admit button.
 * It reappears whenever the waiting list grows.
 */
export function WaitingRoomAlert({
  waiting,
  onAdmit,
  onOpenList,
}: {
  waiting: WaitingPerson[];
  onAdmit: (id: number) => void;
  onOpenList: () => void;
}) {
  const [dismissedCount, setDismissedCount] = useState(0);
  const previous = useRef(waiting.length);

  useEffect(() => {
    // Someone new arrived: show the alert again.
    if (waiting.length > previous.current) setDismissedCount(0);
    previous.current = waiting.length;
  }, [waiting.length]);

  if (!waiting.length || dismissedCount === waiting.length) return null;
  const newest = waiting[waiting.length - 1];
  const others = waiting.length - 1;

  return (
    <div role="alert" className="absolute right-3 top-3 z-30 w-72 animate-pop rounded-xl bg-[#2b2b2b] p-3 text-sm text-room-text shadow-pop ring-1 ring-white/10">
      <div className="flex items-start gap-2">
        <UserRoundPlus className="mt-0.5 h-4 w-4 shrink-0 text-[#6ea1ff]" />
        <p className="flex-1">
          <span className="font-bold text-white">{newest.display_name}</span>
          {others > 0 && ` and ${others} other${others > 1 ? "s" : ""}`} {others > 0 ? "are" : "is"} in the waiting room
        </p>
        <button onClick={() => setDismissedCount(waiting.length)} className="rounded p-0.5 text-room-text/60 hover:bg-white/10" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onOpenList} className="rounded-md px-3 py-1 text-xs font-bold text-room-text ring-1 ring-white/20 hover:bg-white/10">
          See waiting room
        </button>
        <button onClick={() => onAdmit(newest.id)} className="rounded-md bg-zoom-blue px-3 py-1 text-xs font-bold text-white hover:bg-zoom-blue-hover">
          Admit
        </button>
      </div>
    </div>
  );
}
