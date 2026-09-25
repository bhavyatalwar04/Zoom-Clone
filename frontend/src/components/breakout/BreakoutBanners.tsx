"use client";

import { DoorOpen, HelpCircle, LifeBuoy, Megaphone, Timer, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { BreakoutState } from "@/lib/types";

const pill = "flex items-center gap-2 rounded-lg bg-[#2b2b2b] px-3 py-1.5 text-xs text-room-text shadow-pop ring-1 ring-white/10";
const action = "rounded-md px-2 py-0.5 font-bold ring-1 ring-white/20 hover:bg-white/10";

interface BreakoutBannersProps {
  breakout: BreakoutState | null;
  myRoomName: string | null;
  selfId: number;
  isModerator: boolean;
  closingAt: number | null;
  broadcast: { text: string; from: string } | null;
  helpRequest: { from: string; roomName: string; position: number } | null;
  now: number;
  /** Push the banners below the whiteboard toolbar while the whiteboard is open. */
  belowToolbar?: boolean;
  onJoin: (position: number) => void;
  onLeave: () => void;
  onAskForHelp: () => void;
  onDismissBroadcast: () => void;
  onDismissHelp: () => void;
}

/** Status strip shown during breakout sessions: where I am, countdowns, messages, help requests. */
export function BreakoutBanners(props: BreakoutBannersProps) {
  const { breakout, myRoomName, now } = props;
  const [helpSent, setHelpSent] = useState(false);
  useEffect(() => setHelpSent(false), [myRoomName]);

  const myAssignment = breakout?.rooms.find((r) => r.assigned.includes(props.selfId));
  const secondsLeft = props.closingAt ? Math.max(0, Math.ceil((props.closingAt - now) / 1000)) : null;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center gap-1.5 px-3 ${props.belowToolbar ? "top-14" : "top-2"}`}
    >
      {myRoomName && (
        <div className={`${pill} pointer-events-auto`} role="status">
          <DoorOpen className="h-4 w-4 text-[#6ea1ff]" />
          You are in <span className="font-bold text-white">{myRoomName}</span>
          {!props.isModerator && (
            <button
              onClick={() => {
                props.onAskForHelp();
                setHelpSent(true);
              }}
              disabled={helpSent}
              className={`${action} disabled:opacity-50`}
            >
              <HelpCircle className="mr-1 inline h-3.5 w-3.5" />
              {helpSent ? "Host notified" : "Ask for Help"}
            </button>
          )}
          <button onClick={props.onLeave} className={action}>
            Leave Room
          </button>
        </div>
      )}

      {!myRoomName && breakout?.open && myAssignment && !props.isModerator && (
        <div className={`${pill} pointer-events-auto`} role="status">
          Breakout rooms are open.
          <button onClick={() => props.onJoin(myAssignment.position)} className="rounded-md bg-zoom-blue px-2 py-0.5 font-bold text-white">
            Join {myAssignment.name}
          </button>
        </div>
      )}

      {secondsLeft !== null && breakout?.open && (
        <div className={pill} role="status">
          <Timer className="h-4 w-4 text-amber-400" /> Breakout rooms will close in {secondsLeft} seconds
        </div>
      )}

      {props.broadcast && (
        <div className={`${pill} pointer-events-auto max-w-xl`} role="alert">
          <Megaphone className="h-4 w-4 shrink-0 text-[#6ea1ff]" />
          <span>
            <span className="font-bold text-white">{props.broadcast.from}:</span> {props.broadcast.text}
          </span>
          <button onClick={props.onDismissBroadcast} className="rounded p-0.5 hover:bg-white/10" aria-label="Dismiss message">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {props.helpRequest && props.isModerator && (
        <div className={`${pill} pointer-events-auto`} role="alert">
          <LifeBuoy className="h-4 w-4 text-amber-400" />
          <span>
            <span className="font-bold text-white">{props.helpRequest.from}</span> in {props.helpRequest.roomName} asked for help
          </span>
          <button onClick={() => props.onJoin(props.helpRequest!.position)} className="rounded-md bg-zoom-blue px-2 py-0.5 font-bold text-white">
            Join Room
          </button>
          <button onClick={props.onDismissHelp} className={action}>
            Later
          </button>
        </div>
      )}
    </div>
  );
}
