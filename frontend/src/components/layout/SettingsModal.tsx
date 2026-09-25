"use client";

import clsx from "clsx";
import { Mic, Settings2, Video } from "lucide-react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { useSettings } from "@/hooks/useSettings";

const SECTIONS = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "video", label: "Video", icon: Video },
  { id: "audio", label: "Audio", icon: Mic },
] as const;

type Section = (typeof SECTIONS)[number]["id"];

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [section, setSection] = useState<Section>("general");
  const [settings, update] = useSettings();

  return (
    <Modal open={open} onClose={onClose} title="Settings" className="sm:max-w-2xl">
      <div className="flex min-h-72 flex-col gap-4 sm:flex-row">
        <nav className="flex gap-1 sm:w-44 sm:flex-col">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={clsx(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold",
                section === id ? "bg-zoom-blue-soft text-zoom-blue" : "text-ink-2 hover:bg-surface",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>
        <div className="flex-1 space-y-4 sm:border-l sm:border-line sm:pl-5">
          {section === "general" && (
            <>
              <Checkbox
                checked={settings.confirmLeave}
                onChange={(v) => update({ confirmLeave: v })}
                label="Ask me to confirm when I leave a meeting"
              />
              <Checkbox
                checked={settings.showNamesOnVideo}
                onChange={(v) => update({ showNamesOnVideo: v })}
                label="Always display participant names on their video"
              />
            </>
          )}
          {section === "video" && (
            <>
              <Checkbox
                checked={settings.startWithVideo}
                onChange={(v) => update({ startWithVideo: v })}
                label="Start my video when starting a new meeting"
              />
              <Checkbox
                checked={settings.mirrorVideo}
                onChange={(v) => update({ mirrorVideo: v })}
                label="Mirror my video"
              />
            </>
          )}
          {section === "audio" && (
            <Checkbox
              checked={settings.muteOnJoin}
              onChange={(v) => update({ muteOnJoin: v })}
              label="Mute my microphone when joining a meeting"
            />
          )}
          <p className="pt-2 text-xs text-muted">Settings are saved in this browser.</p>
        </div>
      </div>
    </Modal>
  );
}
