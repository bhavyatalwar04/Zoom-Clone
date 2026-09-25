"use client";

import clsx from "clsx";
import { CalendarDays, ChevronDown, MonitorUp, Plus, Video } from "lucide-react";
import { useRef, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Popover } from "@/components/ui/Popover";
import { useStartInstantMeeting } from "@/hooks/useStartMeeting";
import { useSettings } from "@/hooks/useSettings";

interface ActionTilesProps {
  onJoin: () => void;
  onSchedule: () => void;
  onShare: () => void;
}

function Tile({
  color,
  icon,
  label,
  onClick,
  busy,
  children,
}: {
  color: "orange" | "blue";
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  busy?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <button
        onClick={onClick}
        disabled={busy}
        aria-label={label}
        className={clsx(
          "flex h-[72px] w-[72px] items-center justify-center rounded-[22px] text-white shadow-sm transition-all sm:h-20 sm:w-20",
          "hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 disabled:opacity-70",
          color === "orange" ? "bg-zoom-orange hover:bg-zoom-orange-hover" : "bg-zoom-blue hover:bg-zoom-blue-hover",
        )}
      >
        {busy ? <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-white border-r-transparent" /> : icon}
      </button>
      <div className="flex items-center gap-0.5 text-[13px] text-ink-2">
        {label}
        {children}
      </div>
    </div>
  );
}

export function ActionTiles({ onJoin, onSchedule, onShare }: ActionTilesProps) {
  const { start, starting } = useStartInstantMeeting();
  const [settings, update] = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const caret = useRef<HTMLButtonElement>(null);

  return (
    <div className="grid grid-cols-2 gap-x-10 gap-y-7 sm:gap-x-14">
      <Tile color="orange" label="New meeting" onClick={() => start()} busy={starting} icon={<Video className="h-9 w-9" fill="currentColor" strokeWidth={1.5} />}>
        <div className="relative">
          <button ref={caret} onClick={() => setMenuOpen((v) => !v)} className="rounded p-0.5 hover:bg-surface" aria-label="New meeting options">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <Popover open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={caret} className="left-1/2 top-6 w-56 -translate-x-1/2 bg-white p-3">
            <Checkbox checked={settings.startWithVideo} onChange={(v) => update({ startWithVideo: v })} label="Start with video" />
          </Popover>
        </div>
      </Tile>
      <Tile color="blue" label="Join" onClick={onJoin} icon={<Plus className="h-10 w-10" strokeWidth={2.5} />} />
      <Tile color="blue" label="Schedule" onClick={onSchedule} icon={<CalendarDays className="h-9 w-9" strokeWidth={2} />} />
      <Tile color="blue" label="Share screen" onClick={onShare} icon={<MonitorUp className="h-9 w-9" strokeWidth={2} />} />
    </div>
  );
}
