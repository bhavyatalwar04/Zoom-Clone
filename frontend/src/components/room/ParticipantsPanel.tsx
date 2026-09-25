"use client";

import { Hand, Mic, MicOff, MoreHorizontal, MonitorUp, Search, Video, VideoOff } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MenuItem, Popover } from "@/components/ui/Popover";
import type { PeerInfo } from "@/lib/rtc/room-client";
import { SidePanel } from "./SidePanel";

interface ParticipantsPanelProps {
  self: PeerInfo;
  peers: PeerInfo[];
  onClose: () => void;
  onInvite: () => void;
  onToggleHand: () => void;
  onHostAction: (action: "mute" | "ask-unmute" | "stop-video" | "remove", target: number) => void;
  onMuteAll: () => void;
}

export function ParticipantsPanel({ self, peers, onClose, onInvite, onToggleHand, onHostAction, onMuteAll }: ParticipantsPanelProps) {
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "mute-all" } | { kind: "remove"; peer: PeerInfo } | null>(null);
  const isHost = self.role === "host";

  // Me first, then raised hands, then the host, then alphabetical (Zoom's ordering).
  const others = [...peers].sort(
    (a, b) =>
      Number(b.hand_raised) - Number(a.hand_raised) ||
      Number(b.role === "host") - Number(a.role === "host") ||
      a.display_name.localeCompare(b.display_name),
  );
  const everyone = [self, ...others].filter((p) => p.display_name.toLowerCase().includes(query.toLowerCase()));

  return (
    <SidePanel
      title={`Participants (${peers.length + 1})`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onInvite}>
            Invite
          </Button>
          {isHost ? (
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => setConfirm({ kind: "mute-all" })} disabled={!peers.length}>
              Mute All
            </Button>
          ) : (
            <Button variant="secondary" size="sm" className="flex-1" onClick={onToggleHand}>
              {self.hand_raised ? "Lower Hand" : "Raise Hand"}
            </Button>
          )}
        </div>
      }
    >
      <div className="relative mx-3 mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a participant"
          className="h-8 w-full rounded-lg bg-surface pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-zoom-blue"
        />
      </div>
      <ul className="px-1.5">
        {everyone.map((p) => (
          <ParticipantRow
            key={p.id}
            peer={p}
            isSelf={p.id === self.id}
            canManage={isHost && p.id !== self.id}
            onHostAction={onHostAction}
            onRemove={() => setConfirm({ kind: "remove", peer: p })}
          />
        ))}
      </ul>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === "mute-all" ? "Mute all current participants?" : "Remove participant?"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={confirm?.kind === "remove" ? "danger" : "primary"}
              onClick={() => {
                if (confirm?.kind === "mute-all") onMuteAll();
                else if (confirm?.kind === "remove") onHostAction("remove", confirm.peer.id);
                setConfirm(null);
              }}
            >
              {confirm?.kind === "mute-all" ? "Mute All" : "Remove"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          {confirm?.kind === "mute-all"
            ? "Everyone except you will be muted. Participants can unmute themselves."
            : `Do you want to remove ${confirm?.kind === "remove" ? confirm.peer.display_name : ""} from this meeting?`}
        </p>
      </Modal>
    </SidePanel>
  );
}

function ParticipantRow({
  peer,
  isSelf,
  canManage,
  onHostAction,
  onRemove,
}: {
  peer: PeerInfo;
  isSelf: boolean;
  canManage: boolean;
  onHostAction: ParticipantsPanelProps["onHostAction"];
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const act = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const tags = [peer.role === "host" && "Host", isSelf && "me"].filter(Boolean).join(", ");

  return (
    <li className="group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface">
      <Avatar name={peer.display_name} size={28} shape="square" />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">
        {peer.display_name}
        {tags && <span className="text-muted"> ({tags})</span>}
      </span>

      {canManage && (
        <div className="hidden items-center gap-1 group-hover:flex">
          <button
            onClick={() => onHostAction(peer.audio ? "mute" : "ask-unmute", peer.id)}
            className="rounded-md px-2 py-0.5 text-xs font-bold text-ink ring-1 ring-line hover:bg-white"
          >
            {peer.audio ? "Mute" : "Ask to Unmute"}
          </button>
          <button ref={anchor} onClick={() => setOpen((v) => !v)} className="rounded-md p-1 ring-1 ring-line hover:bg-white" aria-label="More">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <span className={`flex items-center gap-1.5 text-muted ${canManage ? "group-hover:hidden" : ""}`}>
        {peer.hand_raised && <Hand className="h-4 w-4 text-amber-500" aria-label="Hand raised" />}
        {peer.screen && <MonitorUp className="h-4 w-4 text-zoom-green" aria-label="Sharing screen" />}
        {peer.audio ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-zoom-red" aria-label="Muted" />}
        {peer.video ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4 text-zoom-red" aria-label="Video off" />}
      </span>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} className="right-2 top-9 w-44 bg-white p-1">
        {peer.video && (
          <MenuItem onClick={act(() => onHostAction("stop-video", peer.id))}>Stop Video</MenuItem>
        )}
        <MenuItem onClick={act(() => onHostAction(peer.audio ? "mute" : "ask-unmute", peer.id))}>
          {peer.audio ? "Mute" : "Ask to Unmute"}
        </MenuItem>
        <MenuItem danger onClick={act(onRemove)}>
          Remove
        </MenuItem>
      </Popover>
    </li>
  );
}
