"use client";

import { Check } from "lucide-react";
import type { Security } from "@/lib/rtc/room-client";

const MEETING_OPTIONS: { key: keyof Security; label: string }[] = [
  { key: "locked", label: "Lock Meeting" },
  { key: "waiting_room", label: "Enable Waiting Room" },
];

const PARTICIPANT_OPTIONS: { key: keyof Security; label: string }[] = [
  { key: "allow_share", label: "Share Screen" },
  { key: "allow_chat", label: "Chat" },
  { key: "allow_rename", label: "Rename Themselves" },
  { key: "allow_unmute", label: "Unmute Themselves" },
];

/** Contents of the host's Security popover (a checklist of switches, like Zoom's). */
export function SecurityMenu({ security, onChange }: { security: Security; onChange: (patch: Partial<Security>) => void }) {
  const item = (option: { key: keyof Security; label: string }) => (
    <button
      key={option.key}
      onClick={() => onChange({ [option.key]: !security[option.key] })}
      role="menuitemcheckbox"
      aria-checked={security[option.key]}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm text-room-text hover:bg-white/10"
    >
      <span className="flex w-4 justify-center">{security[option.key] && <Check className="h-4 w-4 text-[#6ea1ff]" />}</span>
      {option.label}
    </button>
  );

  return (
    <div role="menu" aria-label="Security">
      {MEETING_OPTIONS.map(item)}
      <p className="mt-2 border-t border-white/10 px-3 pb-1 pt-2 text-xs font-bold text-room-text/60">Allow all participants to:</p>
      {PARTICIPANT_OPTIONS.map(item)}
    </div>
  );
}
