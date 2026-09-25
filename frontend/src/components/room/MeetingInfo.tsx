"use client";

import { Copy, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { Popover } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { formatMeetingId } from "@/lib/format";
import { copyToClipboard } from "@/lib/invitation";
import type { InviteDetails } from "./InviteModal";

/** The green shield in the meeting's top-left corner, opening the meeting information card. */
export function MeetingInfo({ details, selfName }: { details: InviteDetails; selfName: string }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const toast = useToast();

  const rows: [string, string][] = [
    ["Meeting ID", formatMeetingId(details.code)],
    ["Host", details.hostName],
    ...(details.passcode ? ([["Passcode", details.passcode]] as [string, string][]) : []),
    ["Participant", selfName],
  ];

  return (
    <div className="relative">
      <button
        ref={anchor}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-room-hover"
        aria-label="Meeting information"
      >
        <ShieldCheck className="h-5 w-5 text-[#23d959]" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} className="left-0 top-9 w-80 bg-[#2b2b2b] p-4 text-room-text">
        <h3 className="mb-3 truncate text-base font-bold text-white">{details.title}</h3>
        <dl className="space-y-1.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[96px_1fr] gap-2">
              <dt className="text-room-text/60">{label}</dt>
              <dd className="truncate">{value}</dd>
            </div>
          ))}
          <div className="grid grid-cols-[96px_1fr] gap-2">
            <dt className="text-room-text/60">Invite link</dt>
            <dd className="min-w-0">
              <p className="truncate text-[#6ea1ff]">{details.join_url}</p>
              <button
                onClick={async () => {
                  if (await copyToClipboard(details.join_url)) toast.success("Invite link copied to clipboard");
                }}
                className="mt-1 flex items-center gap-1 text-xs font-bold text-[#6ea1ff] hover:underline"
              >
                <Copy className="h-3.5 w-3.5" /> Copy link
              </button>
            </dd>
          </div>
        </dl>
        <p className="mt-3 flex items-center gap-1.5 border-t border-white/10 pt-3 text-xs text-room-text/60">
          <ShieldCheck className="h-3.5 w-3.5 text-[#23d959]" /> Media is sent directly between participants (WebRTC, encrypted).
        </p>
      </Popover>
    </div>
  );
}
