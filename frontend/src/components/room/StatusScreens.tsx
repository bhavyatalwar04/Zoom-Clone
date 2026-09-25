"use client";

import { CircleSlash, DoorOpen, Loader2, PhoneOff, UserX, WifiOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { formatDayLabel, formatTime } from "@/lib/format";
import type { EndReason } from "@/lib/rtc/room-client";
import type { MeetingLookup } from "@/lib/types";

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">{children}</div>;
}

export function WaitingForHost({ meeting, onLeave }: { meeting: MeetingLookup; onLeave: () => void }) {
  return (
    <Centered>
      <Loader2 className="h-10 w-10 animate-spin text-zoom-blue" />
      <h1 className="mt-6 text-xl font-bold">Waiting for the host to start this meeting.</h1>
      <p className="mt-2 text-sm text-ink-2">{meeting.title}</p>
      {meeting.scheduled_start && (
        <p className="text-sm text-muted">
          {formatDayLabel(meeting.scheduled_start)}, {formatTime(meeting.scheduled_start)}
        </p>
      )}
      <p className="mt-4 max-w-sm text-xs text-muted">You will join automatically as soon as {meeting.host_name} starts the meeting.</p>
      <Button variant="secondary" className="mt-6" onClick={onLeave}>
        Leave
      </Button>
    </Centered>
  );
}

const ENDED_COPY: Record<EndReason, { icon: React.ReactNode; title: string; body: string }> = {
  left: { icon: <DoorOpen className="h-10 w-10 text-zoom-blue" />, title: "You have left the meeting", body: "Thanks for joining." },
  ended: { icon: <PhoneOff className="h-10 w-10 text-zoom-red" />, title: "This meeting has been ended by host", body: "The host ended the meeting for everyone." },
  removed: { icon: <UserX className="h-10 w-10 text-zoom-red" />, title: "You have been removed from this meeting", body: "The host removed you from the meeting." },
  error: { icon: <WifiOff className="h-10 w-10 text-muted" />, title: "Unable to connect", body: "The connection to the meeting was lost." },
};

export function MeetingEnded({ reason, onRejoin }: { reason: EndReason; onRejoin: () => void }) {
  const copy = ENDED_COPY[reason];
  return (
    <Centered>
      {copy.icon}
      <h1 className="mt-5 text-xl font-bold">{copy.title}</h1>
      <p className="mt-2 text-sm text-muted">{copy.body}</p>
      <div className="mt-6 flex gap-2">
        {(reason === "left" || reason === "error") && (
          <Button variant="secondary" onClick={onRejoin}>
            Rejoin
          </Button>
        )}
        <Link href="/" className="inline-flex h-9 items-center rounded-lg bg-zoom-blue px-4 text-sm font-bold text-white hover:bg-zoom-blue-hover">
          Back to Home
        </Link>
      </div>
    </Centered>
  );
}

export function MeetingNotFound({ message }: { message: string }) {
  return (
    <Centered>
      <CircleSlash className="h-10 w-10 text-muted" />
      <h1 className="mt-5 text-xl font-bold">Unable to join this meeting</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">{message}</p>
      <div className="mt-6 flex gap-2">
        <Link href="/join" className="inline-flex h-9 items-center rounded-lg px-4 text-sm font-bold text-ink ring-1 ring-line hover:bg-surface">
          Try another ID
        </Link>
        <Link href="/" className="inline-flex h-9 items-center rounded-lg bg-zoom-blue px-4 text-sm font-bold text-white hover:bg-zoom-blue-hover">
          Back to Home
        </Link>
      </div>
    </Centered>
  );
}
