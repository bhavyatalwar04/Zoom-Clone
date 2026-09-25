"use client";

import { Send, Users } from "lucide-react";
import { useState } from "react";
import { SidePanel } from "@/components/room/SidePanel";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import type { PeerInfo } from "@/lib/rtc/room-client";
import type { BreakoutState } from "@/lib/types";

interface BreakoutPanelProps {
  breakout: BreakoutState | null;
  /** People in my current session (everyone, before rooms open). */
  peers: PeerInfo[];
  myGroup: string | null;
  onCreate: (count: number, auto: boolean) => void;
  onAssign: (participantId: number, position: number | null) => void;
  onOpen: () => void;
  onClose: () => void;
  onJoin: (position: number) => void;
  onLeave: () => void;
  onBroadcast: (text: string) => void;
  onClosePanel: () => void;
}

function MoveSelect({
  value,
  rooms,
  onChange,
  label,
}: {
  value: number | null;
  rooms: BreakoutState["rooms"];
  onChange: (position: number | null) => void;
  label: string;
}) {
  return (
    <div className="w-28 shrink-0">
      <Select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        aria-label={label}
        className="h-7 px-2 text-xs"
      >
        <option value="">Unassigned</option>
        {rooms.map((r) => (
          <option key={r.position} value={r.position}>
            {r.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** The host's Breakout Rooms window: create, assign, open, visit, message and close rooms. */
export function BreakoutPanel(props: BreakoutPanelProps) {
  const { breakout } = props;
  const [count, setCount] = useState(2);
  const [auto, setAuto] = useState(true);
  const [message, setMessage] = useState("");

  const attendees = props.peers.filter((p) => p.role === "attendee");
  const assignedIds = new Set(breakout?.rooms.flatMap((r) => r.assigned) ?? []);
  const unassigned = attendees.filter((p) => !assignedIds.has(p.id));
  const positionOf = (id: number) => breakout?.rooms.find((r) => r.assigned.includes(id))?.position ?? null;

  const createForm = (
    <div className="space-y-3 rounded-xl bg-surface p-3">
      <label className="flex items-center justify-between gap-2 text-sm">
        Create
        <Select value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-8 w-20" aria-label="Number of rooms">
          {Array.from({ length: 20 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </Select>
        rooms
      </label>
      <fieldset className="space-y-1.5 text-sm">
        {[
          [true, "Assign automatically"],
          [false, "Assign manually"],
        ].map(([value, label]) => (
          <label key={String(value)} className="flex cursor-pointer items-center gap-2">
            <input type="radio" className="accent-zoom-blue" checked={auto === value} onChange={() => setAuto(value as boolean)} />
            {label as string}
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-muted">{attendees.length} participants · about {Math.ceil(attendees.length / count) || 0} per room</p>
      <Button className="w-full" onClick={() => props.onCreate(count, auto)}>
        Create
      </Button>
    </div>
  );

  return (
    <SidePanel
      title="Breakout Rooms"
      onClose={props.onClosePanel}
      footer={
        breakout && (
          <div className="space-y-2">
            {breakout.open && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!message.trim()) return;
                  props.onBroadcast(message);
                  setMessage("");
                }}
              >
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Broadcast a message to all rooms"
                  maxLength={300}
                  aria-label="Broadcast message"
                  className="h-8 flex-1 rounded-lg bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-zoom-blue"
                />
                <Button size="sm" type="submit" aria-label="Send broadcast" disabled={!message.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            )}
            {breakout.open ? (
              <Button variant="danger" className="w-full" onClick={props.onClose} disabled={breakout.closing}>
                {breakout.closing ? "Closing rooms…" : "Close All Rooms"}
              </Button>
            ) : (
              <Button className="w-full" onClick={props.onOpen}>
                Open All Rooms
              </Button>
            )}
          </div>
        )
      }
    >
      <div className="space-y-3 px-4 pb-4">
        {!breakout ? (
          createForm
        ) : (
          <>
            <p className="text-xs text-muted">
              {breakout.open ? "Rooms are open. You can join any room." : "Rooms are not open yet. Adjust the assignments, then open them."}
            </p>
            {props.myGroup && (
              <Button variant="secondary" size="sm" className="w-full" onClick={props.onLeave}>
                Return to main session
              </Button>
            )}
            {breakout.rooms.map((room) => {
              const people = breakout.open ? room.members : attendees.filter((p) => room.assigned.includes(p.id));
              return (
                <section key={room.position} className="rounded-xl p-3 ring-1 ring-line" aria-label={room.name}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
                      {room.name}
                      <span className="flex items-center gap-0.5 text-xs font-normal text-muted">
                        <Users className="h-3 w-3" /> {people.length}
                      </span>
                    </h3>
                    {breakout.open && room.group !== props.myGroup && (
                      <Button size="sm" variant="secondary" onClick={() => props.onJoin(room.position)}>
                        Join
                      </Button>
                    )}
                  </div>
                  {people.length === 0 && <p className="text-xs text-muted">No one yet</p>}
                  <ul className="space-y-1">
                    {people.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{p.display_name}</span>
                        <MoveSelect value={positionOf(p.id) ?? room.position} rooms={breakout.rooms} onChange={(pos) => props.onAssign(p.id, pos)} label={`Move ${p.display_name}`} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {!breakout.open && unassigned.length > 0 && (
              <section className="rounded-xl bg-surface p-3" aria-label="Unassigned">
                <h3 className="mb-2 text-sm font-bold text-ink">Unassigned ({unassigned.length})</h3>
                <ul className="space-y-1">
                  {unassigned.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{p.display_name}</span>
                      <MoveSelect value={null} rooms={breakout.rooms} onChange={(pos) => props.onAssign(p.id, pos)} label={`Assign ${p.display_name}`} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {!breakout.open && (
              <details className="text-sm">
                <summary className="cursor-pointer font-bold text-zoom-blue">Recreate rooms</summary>
                <div className="mt-2">{createForm}</div>
              </details>
            )}
          </>
        )}
      </div>
    </SidePanel>
  );
}
