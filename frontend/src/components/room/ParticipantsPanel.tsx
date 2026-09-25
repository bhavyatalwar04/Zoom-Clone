"use client";

import { Check, Hand, Mic, MicOff, MonitorUp, MoreHorizontal, Search, Video, VideoOff } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MenuItem, Popover } from "@/components/ui/Popover";
import { type HostAction, isModerator, type PeerInfo, type Security, type WaitingPerson } from "@/lib/rtc/room-client";
import { feedbackEmoji } from "./feedback";
import { SidePanel } from "./SidePanel";

type ActionPayload = { target?: number | null; name?: string } & Partial<Security>;

export interface ParticipantsPanelProps {
  self: PeerInfo;
  peers: PeerInfo[];
  waiting: WaitingPerson[];
  security: Security;
  pinnedId: number | null;
  spotlightId: number | null;
  onClose: () => void;
  onInvite: () => void;
  onToggleHand: () => void;
  onHostAction: (action: HostAction, payload?: ActionPayload) => void;
  onPin: (id: number | null) => void;
  onRename: (target: { id: number; name: string; isSelf: boolean }) => void;
}

const ROLE_ORDER = { host: 0, co_host: 1, attendee: 2 } as const;

function roleTags(peer: PeerInfo, isSelf: boolean) {
  const tags = [peer.role === "host" && "Host", peer.role === "co_host" && "Co-host", isSelf && "me"].filter(Boolean);
  return tags.join(", ");
}

export function ParticipantsPanel(props: ParticipantsPanelProps) {
  const { self, peers, waiting, security, onHostAction } = props;
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "mute-all" } | { kind: "remove"; peer: PeerInfo } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreAnchor = useRef<HTMLButtonElement>(null);
  const moderator = isModerator(self);

  // Me first, then raised hands, then host / co-hosts, then alphabetical (Zoom's ordering).
  const others = [...peers].sort(
    (a, b) =>
      Number(b.hand_raised) - Number(a.hand_raised) ||
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      a.display_name.localeCompare(b.display_name),
  );
  const matches = (name: string) => name.toLowerCase().includes(query.toLowerCase());
  const everyone = [self, ...others].filter((p) => matches(p.display_name));
  const waitingShown = moderator ? waiting.filter((w) => matches(w.display_name)) : [];

  const toggle = (key: keyof Security) => onHostAction("security", { [key]: !security[key] });

  return (
    <SidePanel
      title={`Participants (${peers.length + 1})`}
      onClose={props.onClose}
      footer={
        <div className="relative flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={props.onInvite}>
            Invite
          </Button>
          {moderator ? (
            <>
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => setConfirm({ kind: "mute-all" })} disabled={!peers.length}>
                Mute All
              </Button>
              <Button ref={moreAnchor} variant="secondary" size="sm" onClick={() => setMoreOpen((v) => !v)} aria-label="More participant options">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              <Popover open={moreOpen} onClose={() => setMoreOpen(false)} anchorRef={moreAnchor} className="bottom-10 right-0 w-72 bg-white p-1">
                <MenuItem
                  onClick={() => {
                    setMoreOpen(false);
                    onHostAction("lower-hands");
                  }}
                >
                  Lower all hands
                </MenuItem>
                {(
                  [
                    ["allow_unmute", "Allow participants to unmute themselves"],
                    ["allow_rename", "Allow participants to rename themselves"],
                    ["waiting_room", "Enable waiting room"],
                    ["locked", "Lock meeting"],
                  ] as const
                ).map(([key, label]) => (
                  <MenuItem key={key} onClick={() => toggle(key)} role="menuitemcheckbox" aria-checked={security[key]}>
                    <span className="flex w-4 justify-center">{security[key] && <Check className="h-4 w-4 text-zoom-blue" />}</span>
                    {label}
                  </MenuItem>
                ))}
              </Popover>
            </>
          ) : (
            <Button variant="secondary" size="sm" className="flex-1" onClick={props.onToggleHand}>
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

      {waitingShown.length > 0 && (
        <section className="mb-2 border-b border-line px-1.5 pb-2" aria-label="Waiting room">
          <div className="flex items-center justify-between px-2 py-1">
            <h3 className="text-xs font-bold text-muted">Waiting Room ({waiting.length})</h3>
            <button onClick={() => onHostAction("admit-all")} className="text-xs font-bold text-zoom-blue hover:underline">
              Admit all
            </button>
          </div>
          <ul>
            {waitingShown.map((w) => (
              <li key={w.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface">
                <Avatar name={w.display_name} size={28} shape="square" />
                <span className="min-w-0 flex-1 truncate text-sm">{w.display_name}</span>
                <button
                  onClick={() => onHostAction("remove", { target: w.id })}
                  className="rounded-md px-2 py-0.5 text-xs font-bold text-ink ring-1 ring-line hover:bg-white"
                >
                  Remove
                </button>
                <button
                  onClick={() => onHostAction("admit", { target: w.id })}
                  className="rounded-md bg-zoom-blue px-2 py-0.5 text-xs font-bold text-white hover:bg-zoom-blue-hover"
                >
                  Admit
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {moderator && waiting.length > 0 && <h3 className="px-3.5 pb-1 text-xs font-bold text-muted">In the meeting ({peers.length + 1})</h3>}
      <ul className="px-1.5">
        {everyone.map((p) => (
          <ParticipantRow
            key={p.id}
            peer={p}
            self={self}
            security={security}
            pinned={props.pinnedId === p.id}
            spotlighted={props.spotlightId === p.id}
            onHostAction={onHostAction}
            onPin={props.onPin}
            onRename={props.onRename}
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
                if (confirm?.kind === "mute-all") onHostAction("mute-all");
                else if (confirm?.kind === "remove") onHostAction("remove", { target: confirm.peer.id });
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
            ? security.allow_unmute
              ? "Everyone except the host and co-hosts will be muted. Participants can unmute themselves."
              : "Everyone except the host and co-hosts will be muted and cannot unmute themselves."
            : `Do you want to remove ${confirm?.kind === "remove" ? confirm.peer.display_name : ""} from this meeting? They will not be able to rejoin.`}
        </p>
      </Modal>
    </SidePanel>
  );
}

interface RowProps {
  peer: PeerInfo;
  self: PeerInfo;
  security: Security;
  pinned: boolean;
  spotlighted: boolean;
  onHostAction: ParticipantsPanelProps["onHostAction"];
  onPin: ParticipantsPanelProps["onPin"];
  onRename: ParticipantsPanelProps["onRename"];
  onRemove: () => void;
}

function ParticipantRow({ peer, self, security, pinned, spotlighted, onHostAction, onPin, onRename, onRemove }: RowProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const isSelf = peer.id === self.id;
  const moderator = isModerator(self);
  const isHost = self.role === "host";
  const canManage = moderator && !isSelf;
  const canRename = isSelf ? security.allow_rename || moderator : moderator;
  const tags = roleTags(peer, isSelf);
  const feedback = feedbackEmoji(peer.feedback);

  const act = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <li className="group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface">
      <Avatar name={peer.display_name} size={28} shape="square" />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">
        {peer.display_name}
        {tags && <span className="text-muted"> ({tags})</span>}
        {spotlighted && <span className="ml-1 text-xs text-zoom-blue">· Spotlight</span>}
        {pinned && <span className="ml-1 text-xs text-zoom-blue">· Pinned</span>}
      </span>

      {canManage && (
        <button
          onClick={() => onHostAction(peer.audio ? "mute" : "ask-unmute", { target: peer.id })}
          className="hidden rounded-md px-2 py-0.5 text-xs font-bold text-ink ring-1 ring-line hover:bg-white group-hover:block"
        >
          {peer.audio ? "Mute" : "Ask to Unmute"}
        </button>
      )}
      <button
        ref={anchor}
        onClick={() => setOpen((v) => !v)}
        className="hidden rounded-md p-1 ring-1 ring-line hover:bg-white group-hover:block"
        aria-label={`More options for ${peer.display_name}`}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>

      <span className="flex items-center gap-1.5 text-muted group-hover:hidden">
        {feedback && <span className="text-sm" aria-label={`Feedback ${peer.feedback}`}>{feedback}</span>}
        {peer.hand_raised && <Hand className="h-4 w-4 text-amber-500" aria-label="Hand raised" />}
        {peer.screen && <MonitorUp className="h-4 w-4 text-zoom-green" aria-label="Sharing screen" />}
        {peer.audio ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4 text-zoom-red" aria-label="Muted" />}
        {peer.video ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4 text-zoom-red" aria-label="Video off" />}
      </span>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} className="right-2 top-9 w-52 bg-white p-1">
        <MenuItem onClick={act(() => onPin(pinned ? null : peer.id))}>{pinned ? "Unpin" : "Pin"}</MenuItem>
        {canRename && (
          <MenuItem onClick={act(() => onRename({ id: peer.id, name: peer.display_name, isSelf }))}>Rename</MenuItem>
        )}
        {moderator && (
          <MenuItem onClick={act(() => onHostAction("spotlight", { target: spotlighted ? null : peer.id }))}>
            {spotlighted ? "Remove Spotlight" : "Spotlight for Everyone"}
          </MenuItem>
        )}
        {canManage && peer.video && <MenuItem onClick={act(() => onHostAction("stop-video", { target: peer.id }))}>Stop Video</MenuItem>}
        {isHost && !isSelf && peer.role === "attendee" && (
          <MenuItem onClick={act(() => onHostAction("make-cohost", { target: peer.id }))}>Make Co-Host</MenuItem>
        )}
        {isHost && peer.role === "co_host" && (
          <MenuItem onClick={act(() => onHostAction("revoke-cohost", { target: peer.id }))}>Withdraw Co-Host Permission</MenuItem>
        )}
        {isHost && !isSelf && <MenuItem onClick={act(() => onHostAction("make-host", { target: peer.id }))}>Make Host</MenuItem>}
        {canManage && peer.role !== "host" && (
          <MenuItem danger onClick={act(onRemove)}>
            Remove
          </MenuItem>
        )}
      </Popover>
    </li>
  );
}
