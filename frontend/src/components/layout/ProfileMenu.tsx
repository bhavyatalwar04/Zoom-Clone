"use client";

import clsx from "clsx";
import { Check, LogOut, Settings, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { MenuItem, Popover } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { useMe } from "@/hooks/useMeetings";
import { type ClientSettings, useSettings } from "@/hooks/useSettings";

const STATUSES: { value: ClientSettings["status"]; label: string; dot: string }[] = [
  { value: "available", label: "Available", dot: "bg-zoom-green" },
  { value: "away", label: "Away", dot: "bg-amber-400" },
  { value: "busy", label: "Do not disturb", dot: "bg-zoom-red" },
];

export function ProfileMenu({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { data: me } = useMe();
  const [settings, update] = useSettings();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const toast = useToast();
  const name = me?.full_name ?? "…";

  return (
    <div className="relative">
      <button ref={anchor} onClick={() => setOpen((v) => !v)} className="rounded-full p-0.5" aria-label="Profile">
        <Avatar name={name} color={me?.avatar_color} size={32} status={settings.status} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} className="right-0 top-11 w-72 bg-white p-2">
        <div className="flex items-center gap-3 px-2 pb-3 pt-2">
          <Avatar name={name} color={me?.avatar_color} size={48} status={settings.status} />
          <div className="min-w-0">
            <p className="truncate font-bold text-ink">{name}</p>
            <p className="truncate text-xs text-muted">{me?.email}</p>
            <span className="mt-1 inline-block rounded bg-zoom-blue-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zoom-blue">
              Licensed
            </span>
          </div>
        </div>
        <div className="border-t border-line py-1">
          {STATUSES.map((s) => (
            <MenuItem key={s.value} onClick={() => update({ status: s.value })}>
              <span className={clsx("h-2.5 w-2.5 rounded-full", s.dot)} />
              <span className="flex-1">{s.label}</span>
              {settings.status === s.value && <Check className="h-4 w-4 text-zoom-blue" />}
            </MenuItem>
          ))}
        </div>
        <div className="border-t border-line pt-1">
          <MenuItem icon={<UserRound className="h-4 w-4" />} onClick={() => toast.info("Profile editing is not part of this demo.")}>
            My profile
          </MenuItem>
          <MenuItem
            icon={<Settings className="h-4 w-4" />}
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            Settings
          </MenuItem>
          <MenuItem icon={<LogOut className="h-4 w-4" />} onClick={() => toast.info("You are signed in as the demo user.")}>
            Sign out
          </MenuItem>
        </div>
      </Popover>
    </div>
  );
}
