"use client";

import Link from "next/link";
import clsx from "clsx";
import { hostStartPath } from "@/hooks/useStartMeeting";
import { useMe } from "@/hooks/useMeetings";
import type { Meeting } from "@/lib/types";

/** "Start" for meetings you host, "Join" for meetings you are invited to. */
export function MeetingJoinButton({ meeting, className }: { meeting: Meeting; className?: string }) {
  const { data: me } = useMe();
  return (
    <Link
      href={meeting.is_host ? hostStartPath(meeting) : inviteeJoinPath(meeting, me?.full_name)}
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

/** The name marks this as the account joining from its dashboard, not a guest with an invite link. */
function inviteeJoinPath(meeting: Meeting, name: string | undefined) {
  const params = new URLSearchParams();
  if (meeting.passcode) params.set("pwd", meeting.passcode);
  if (name) params.set("name", name);
  const query = params.toString();
  return `/j/${meeting.code}${query ? `?${query}` : ""}`;
}
