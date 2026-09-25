"use client";

import Link from "next/link";
import clsx from "clsx";
import { hostStartPath } from "@/hooks/useStartMeeting";
import type { Meeting } from "@/lib/types";

/** "Start" for meetings you host, "Join" for meetings you are invited to. */
export function MeetingJoinButton({ meeting, className }: { meeting: Meeting; className?: string }) {
  const href = meeting.is_host
    ? hostStartPath(meeting)
    : `/j/${meeting.code}${meeting.passcode ? `?pwd=${encodeURIComponent(meeting.passcode)}` : ""}`;
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex h-8 items-center rounded-lg px-4 text-[13px] font-bold transition-colors",
        meeting.is_host || meeting.status === "live"
          ? "bg-zoom-blue text-white hover:bg-zoom-blue-hover"
          : "bg-white text-ink ring-1 ring-inset ring-line hover:bg-surface",
        className,
      )}
    >
      {meeting.is_host && meeting.status !== "live" ? "Start" : "Join"}
    </Link>
  );
}
