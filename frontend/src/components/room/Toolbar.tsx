"use client";

import clsx from "clsx";
import {
  Captions,
  Check,
  ChevronUp,
  CircleDot,
  FileText,
  Hand,
  Keyboard,
  LayoutGrid,
  Link2,
  Maximize,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  PictureInPicture2,
  SmilePlus,
  UserPlus,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MenuItem, Popover } from "@/components/ui/Popover";

export const REACTIONS = ["👏", "👍", "❤️", "😂", "😮", "🎉"];

interface ControlButtonProps {
  icon: React.ReactNode;
  label: string;
  /** Keyboard shortcut shown in the tooltip, e.g. "Alt+A". */
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
  badge?: number | string | null;
  /** "count" is a plain number (participants), "alert" a red pill (unread chat). */
  badgeTone?: "count" | "alert";
  className?: string;
  /** Renders the small ^ menu trigger next to the button (mic / camera device pickers). */
  caret?: { onClick: () => void; ref: React.RefObject<HTMLButtonElement | null>; label: string };
}

function ControlButton({ icon, label, shortcut, onClick, active, badge, badgeTone = "alert", className, caret }: ControlButtonProps) {
  return (
    <div className={clsx("relative flex items-stretch", className)}>
      <button
        onClick={onClick}
        aria-label={label}
        title={shortcut ? ` ()` : label}
        className={clsx(
          "flex min-w-[52px] flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-room-text transition-colors hover:bg-room-hover sm:min-w-[68px]",
          active && "text-white",
        )}
      >
        <span className="relative">
          {icon}
          {badge ? (
            <span
              className={clsx(
                "absolute -right-3 -top-1.5 min-w-4 text-center text-[10px] font-bold leading-4",
                badgeTone === "alert" ? "rounded-full bg-zoom-red px-1 text-white" : "text-room-text",
              )}
            >
              {badge}
            </span>
          ) : null}
        </span>
        <span className="hidden whitespace-nowrap sm:block">{label}</span>
      </button>
      {caret && (
        <button
          ref={caret.ref}
          onClick={caret.onClick}
          aria-label={caret.label}
          className="-ml-1 hidden self-start rounded p-0.5 pt-1.5 text-room-text/70 hover:bg-room-hover hover:text-white sm:block"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function useDevices(kind: MediaDeviceKind, open: boolean) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    if (!open) return;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((all) => setDevices(all.filter((d) => d.kind === kind && d.deviceId)))
      .catch(() => setDevices([]));
  }, [kind, open]);
  return devices;
}

function DeviceMenu({
  open,
  onClose,
  anchor,
  kind,
  title,
  activeId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  kind: MediaDeviceKind;
  title: string;
  activeId: string | null;
  onSelect: (deviceId: string) => void;
}) {
  const devices = useDevices(kind, open);
  return (
    <Popover open={open} onClose={onClose} anchorRef={anchor} className="bottom-[68px] left-2 w-72 bg-[#2b2b2b] p-1.5 text-room-text">
      <p className="px-3 pb-1 pt-1.5 text-xs font-bold text-room-text/60">{title}</p>
      {devices.length === 0 && <p className="px-3 py-2 text-sm text-room-text/60">No devices found</p>}
      {devices.map((d, i) => (
        <MenuItem
          key={d.deviceId}
          tone="dark"
          onClick={() => {
            onSelect(d.deviceId);
            onClose();
          }}
        >
          <span className="w-4">{d.deviceId === activeId && <Check className="h-4 w-4 text-zoom-blue" />}</span>
          <span className="truncate">{d.label || `${title} ${i + 1}`}</span>
        </MenuItem>
      ))}
    </Popover>
  );
}

export interface ToolbarProps {
  audio: boolean;
  video: boolean;
  sharing: boolean;
  handRaised: boolean;
  isHost: boolean;
  participantCount: number;
  unreadMessages: number;
  panel: "participants" | "chat" | null;
  view: "gallery" | "speaker";
  activeDevices: { audio: string | null; video: string | null };
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleShare: () => void;
  onTogglePanel: (panel: "participants" | "chat") => void;
  onReaction: (emoji: string) => void;
  onToggleHand: () => void;
  onChangeView: (view: "gallery" | "speaker") => void;
  onInvite: () => void;
  onCopyLink: () => void;
  onRecord: () => void;
  captionsOn: boolean;
  onToggleCaptions: () => void;
  onOpenTranscript: () => void;
  pipSupported: boolean;
  onPictureInPicture: () => void;
  onShowShortcuts: () => void;
  onSelectMic: (deviceId: string) => void;
  onSelectCamera: (deviceId: string) => void;
  /** When false, attendees leave immediately instead of confirming in a popover. */
  confirmLeave: boolean;
  /** Incremented by the Alt+Q shortcut: open the leave menu (or leave right away). */
  leaveRequest: number;
  onLeave: () => void;
  onEndForAll: () => void;
}

export function Toolbar(props: ToolbarProps) {
  const [menu, setMenu] = useState<"mic" | "cam" | "reactions" | "more" | "leave" | null>(null);
  const micCaret = useRef<HTMLButtonElement>(null);
  const camCaret = useRef<HTMLButtonElement>(null);
  const reactionsBtn = useRef<HTMLDivElement>(null);
  const moreBtn = useRef<HTMLDivElement>(null);
  const leaveBtn = useRef<HTMLButtonElement>(null);
  const close = () => setMenu(null);
  const requestLeave = () => (props.isHost || props.confirmLeave ? setMenu("leave") : props.onLeave());

  // Alt+Q from the keyboard shortcuts.
  const leaveRequest = useRef(props.leaveRequest);
  useEffect(() => {
    if (props.leaveRequest === leaveRequest.current) return;
    leaveRequest.current = props.leaveRequest;
    requestLeave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.leaveRequest]);
  const toggle = (m: NonNullable<typeof menu>) => setMenu((cur) => (cur === m ? null : m));
  /** Menu item handler: close the menu, then run the action. */
  const pick = (action: () => void) => () => {
    close();
    action();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <footer className="relative flex h-16 shrink-0 items-center justify-between bg-room-bar px-1 sm:h-[72px] sm:px-3">
      <div className="flex items-center">
        <ControlButton
          label={props.audio ? "Mute" : "Unmute"}
          shortcut="Alt+A"
          onClick={props.onToggleAudio}
          icon={props.audio ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6 text-[#ff4d4d]" />}
          caret={{ onClick: () => toggle("mic"), ref: micCaret, label: "Audio options" }}
        />
        <ControlButton
          label={props.video ? "Stop Video" : "Start Video"}
          shortcut="Alt+V"
          onClick={props.onToggleVideo}
          icon={props.video ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6 text-[#ff4d4d]" />}
          caret={{ onClick: () => toggle("cam"), ref: camCaret, label: "Video options" }}
        />
      </div>

      <div className="flex items-center">
        <ControlButton
          label="Participants"
          shortcut="Alt+U"
          onClick={() => props.onTogglePanel("participants")}
          active={props.panel === "participants"}
          icon={<Users className="h-6 w-6" />}
          badge={props.participantCount}
          badgeTone="count"
        />
        <ControlButton
          label="Chat"
          shortcut="Alt+H"
          onClick={() => props.onTogglePanel("chat")}
          active={props.panel === "chat"}
          icon={<MessageSquare className="h-6 w-6" />}
          badge={props.unreadMessages || null}
        />
        <ControlButton
          label={props.sharing ? "Stop Share" : "Share Screen"}
          shortcut="Alt+S"
          onClick={props.onToggleShare}
          className="hidden md:flex"
          icon={
            <span className={clsx("flex h-6 w-7 items-center justify-center rounded-md", props.sharing ? "bg-zoom-red" : "bg-[#23a55a]")}>
              <MonitorUp className="h-4 w-4 text-white" />
            </span>
          }
        />
        <ControlButton label="Record" onClick={props.onRecord} className="hidden xl:flex" icon={<CircleDot className="h-6 w-6" />} />
        <ControlButton
          label={props.captionsOn ? "Hide Captions" : "Show Captions"}
          shortcut="Alt+C"
          onClick={props.onToggleCaptions}
          active={props.captionsOn}
          className="hidden lg:flex"
          icon={<Captions className={clsx("h-6 w-6", props.captionsOn && "text-[#6ea1ff]")} />}
        />
        <div ref={reactionsBtn}>
          <ControlButton label="Reactions" onClick={() => toggle("reactions")} icon={<SmilePlus className="h-6 w-6" />} />
        </div>
        <div ref={moreBtn}>
          <ControlButton label="More" onClick={() => toggle("more")} icon={<MoreHorizontal className="h-6 w-6" />} />
        </div>
      </div>

      <div className="flex items-center pr-1">
        <button
          ref={leaveBtn}
          onClick={() => (menu === "leave" ? close() : requestLeave())}
          title="Alt+Q"
          className="h-8 rounded-lg bg-zoom-red px-4 text-sm font-bold text-white hover:bg-zoom-red-hover sm:h-9"
        >
          {props.isHost ? "End" : "Leave"}
        </button>
      </div>

      <DeviceMenu
        open={menu === "mic"}
        onClose={close}
        anchor={micCaret}
        kind="audioinput"
        title="Select a Microphone"
        activeId={props.activeDevices.audio}
        onSelect={props.onSelectMic}
      />
      <DeviceMenu
        open={menu === "cam"}
        onClose={close}
        anchor={camCaret}
        kind="videoinput"
        title="Select a Camera"
        activeId={props.activeDevices.video}
        onSelect={props.onSelectCamera}
      />

      <Popover
        open={menu === "reactions"}
        onClose={close}
        anchorRef={reactionsBtn}
        className="bottom-[76px] left-1/2 w-[300px] -translate-x-1/2 bg-[#2b2b2b] p-3"
      >
        <div className="flex justify-between">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                props.onReaction(emoji);
                close();
              }}
              className="rounded-lg p-1.5 text-2xl transition-transform hover:scale-110 hover:bg-white/10"
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            props.onToggleHand();
            close();
          }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 py-2 text-sm text-room-text hover:bg-white/15"
        >
          <Hand className="h-4 w-4" /> {props.handRaised ? "Lower Hand" : "Raise Hand"}
        </button>
      </Popover>

      <Popover open={menu === "more"} onClose={close} anchorRef={moreBtn} className="bottom-[76px] right-4 w-60 bg-[#2b2b2b] p-1.5 sm:left-1/2 sm:right-auto sm:translate-x-8">
        <MenuItem tone="dark" icon={<UserPlus className="h-4 w-4" />} onClick={pick(props.onInvite)}>
          Invite
        </MenuItem>
        <MenuItem tone="dark" icon={<Link2 className="h-4 w-4" />} onClick={pick(props.onCopyLink)}>
          Copy invite link
        </MenuItem>
        <MenuItem tone="dark" className="md:hidden" icon={<MonitorUp className="h-4 w-4" />} onClick={pick(props.onToggleShare)}>
          {props.sharing ? "Stop share" : "Share screen"}
        </MenuItem>
        <MenuItem
          tone="dark"
          icon={<LayoutGrid className="h-4 w-4" />}
          onClick={pick(() => props.onChangeView(props.view === "gallery" ? "speaker" : "gallery"))}
        >
          {props.view === "gallery" ? "Speaker view" : "Gallery view"}
        </MenuItem>
        <MenuItem tone="dark" icon={<Maximize className="h-4 w-4" />} onClick={pick(toggleFullscreen)}>
          Enter / exit full screen
        </MenuItem>
        <MenuItem tone="dark" className="lg:hidden" icon={<Captions className="h-4 w-4" />} onClick={pick(props.onToggleCaptions)}>
          {props.captionsOn ? "Hide captions" : "Show captions"}
        </MenuItem>
        <MenuItem tone="dark" icon={<FileText className="h-4 w-4" />} onClick={pick(props.onOpenTranscript)}>
          View full transcript
        </MenuItem>
        {props.pipSupported && (
          <MenuItem tone="dark" icon={<PictureInPicture2 className="h-4 w-4" />} onClick={pick(props.onPictureInPicture)}>
            Picture-in-picture
          </MenuItem>
        )}
        <MenuItem tone="dark" icon={<Keyboard className="h-4 w-4" />} onClick={pick(props.onShowShortcuts)}>
          Keyboard shortcuts
        </MenuItem>
      </Popover>

      <Popover open={menu === "leave"} onClose={close} anchorRef={leaveBtn} className="bottom-[76px] right-3 w-64 bg-[#2b2b2b] p-3">
        {props.isHost && (
          <button
            onClick={pick(props.onEndForAll)}
            className="mb-2 h-9 w-full rounded-lg bg-zoom-red text-sm font-bold text-white hover:bg-zoom-red-hover"
          >
            End meeting for all
          </button>
        )}
        <button
          onClick={pick(props.onLeave)}
          className={clsx(
            "h-9 w-full rounded-lg text-sm font-bold",
            props.isHost ? "bg-white/10 text-room-text hover:bg-white/15" : "bg-zoom-red text-white hover:bg-zoom-red-hover",
          )}
        >
          Leave meeting
        </button>
      </Popover>
    </footer>
  );
}
