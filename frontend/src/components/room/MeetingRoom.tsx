"use client";

import clsx from "clsx";
import { LayoutGrid, Loader2, Maximize2, MonitorUp, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MenuItem, Popover } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { useActiveSpeaker } from "@/hooks/useActiveSpeaker";
import { useSettings } from "@/hooks/useSettings";
import { WS_URL } from "@/lib/api";
import { copyToClipboard } from "@/lib/invitation";
import { type EndReason, RoomClient } from "@/lib/rtc/room-client";
import type { JoinResponse } from "@/lib/types";
import { ChatPanel } from "./ChatPanel";
import { InviteModal, type InviteDetails } from "./InviteModal";
import { MeetingInfo } from "./MeetingInfo";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { Toolbar } from "./Toolbar";
import { type ViewMode, VideoStage } from "./VideoStage";
import type { TileModel } from "./VideoTile";
import { RemoteAudio } from "./VideoTile";

interface MeetingRoomProps {
  join: JoinResponse;
  initialStream: MediaStream | null;
  audio: boolean;
  video: boolean;
  startShare: boolean;
  onExit: (reason: EndReason) => void;
}

function iceServersFromEnv(): RTCIceServer[] | undefined {
  const turn = process.env.NEXT_PUBLIC_TURN_URL;
  if (!turn) return undefined;
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: turn.split(","), username: process.env.NEXT_PUBLIC_TURN_USERNAME, credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL },
  ];
}

export function MeetingRoom({ join, initialStream, audio, video, startShare, onExit }: MeetingRoomProps) {
  const toast = useToast();
  const [settings] = useSettings();
  const [client] = useState(
    () =>
      new RoomClient({
        wsUrl: `${WS_URL}/ws/meetings/${join.meeting.code}?token=${encodeURIComponent(join.ws_token)}`,
        initialStream,
        audioEnabled: audio,
        videoEnabled: video,
        iceServers: iceServersFromEnv(),
      }),
  );
  const room = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);

  const [panel, setPanel] = useState<"participants" | "chat" | null>(null);
  const [view, setView] = useState<ViewMode>("gallery");
  const [viewMenu, setViewMenu] = useState(false);
  const viewAnchor = useRef<HTMLButtonElement>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [askUnmute, setAskUnmute] = useState(false);
  const [readCount, setReadCount] = useState(0);

  // Connect once; leaving the page (or unmounting) leaves the meeting and frees the devices.
  useEffect(() => {
    client.connect();
    const onUnload = () => client.leave();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      client.leave();
    };
  }, [client]);

  useEffect(() => {
    if (room.endReason) onExit(room.endReason);
  }, [room.endReason, onExit]);

  // "Share screen" from the dashboard: start sharing as soon as we are in.
  const sharedOnJoin = useRef(false);
  useEffect(() => {
    if (!startShare || sharedOnJoin.current || room.status !== "connected") return;
    sharedOnJoin.current = true;
    void client.startScreenShare().then((ok) => !ok && toast.info("Click Share Screen to start sharing."));
  }, [startShare, room.status, client, toast]);

  // Host actions and errors arriving from the server.
  useEffect(() => {
    if (!room.notice) return;
    const { notice } = room.notice;
    if (notice.kind === "force-mute") toast.info("You have been muted by the host");
    else if (notice.kind === "force-stop-video") toast.info("The host has stopped your video");
    else if (notice.kind === "ask-unmute") setAskUnmute(true);
    else toast.error(notice.message);
  }, [room.notice, toast]);

  // Unread badge on the Chat button.
  useEffect(() => {
    if (panel === "chat") setReadCount(room.messages.length);
  }, [panel, room.messages.length]);
  const unread = panel === "chat" ? 0 : Math.max(0, room.messages.length - readCount);

  const speakerTracks = useMemo(() => {
    const map = new Map<number, MediaStreamTrack | null>();
    if (room.self) map.set(room.self.id, room.micTrack);
    room.peers.forEach((p) => map.set(p.id, p.stream?.getAudioTracks()[0] ?? null));
    return map;
  }, [room.self, room.micTrack, room.peers]);
  const activeSpeaker = useActiveSpeaker(speakerTracks);

  const tiles = useMemo<TileModel[]>(() => {
    if (!room.self) return [];
    const reactionFor = (id: number) => room.reactions.find((r) => r.peerId === id) ?? null;
    const me: TileModel = {
      id: room.self.id,
      name: room.self.display_name,
      isSelf: true,
      isHost: room.self.role === "host",
      stream: room.localStream,
      showVideo: !!room.localStream,
      audio: room.self.audio,
      screen: false, // my own share is never shown back to me
      handRaised: room.self.hand_raised,
      reaction: reactionFor(room.self.id),
      speaking: activeSpeaker === room.self.id,
      connecting: false,
      mirror: settings.mirrorVideo,
    };
    const others = room.peers.map<TileModel>((p) => ({
      id: p.id,
      name: p.display_name,
      isSelf: false,
      isHost: p.role === "host",
      stream: p.stream,
      showVideo: (p.video || p.screen) && !!p.stream,
      audio: p.audio,
      screen: p.screen,
      handRaised: p.hand_raised,
      reaction: reactionFor(p.id),
      speaking: activeSpeaker === p.id,
      connecting: p.connection === "new" || p.connection === "connecting",
      mirror: false,
    }));
    return [me, ...others];
  }, [room.self, room.peers, room.localStream, room.reactions, activeSpeaker, settings.mirrorVideo]);

  const inviteDetails: InviteDetails = {
    title: join.meeting.title,
    code: join.meeting.code,
    passcode: join.passcode,
    join_url: join.join_url,
    hostName: join.meeting.host_name,
    scheduled_start: join.meeting.scheduled_start,
  };

  const chooseView = (next: ViewMode) => {
    setView(next);
    setViewMenu(false);
  };

  if (!room.self) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-room text-room-text">
        <Loader2 className="h-8 w-8 animate-spin text-zoom-blue" />
        <p className="text-sm">{room.status === "reconnecting" ? "Reconnecting…" : "Connecting to meeting…"}</p>
      </div>
    );
  }

  const self = room.self;
  const isHost = self.role === "host";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-room text-room-text">
      {room.peers.map((p) => (
        <RemoteAudio key={p.id} stream={p.stream} />
      ))}

      <header className="relative flex h-11 shrink-0 items-center justify-between px-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <MeetingInfo details={inviteDetails} selfName={self.display_name} />
          <span className="truncate text-xs text-room-text/70">{join.meeting.title}</span>
        </div>
        {room.status === "reconnecting" && (
          <span className="absolute left-1/2 -translate-x-1/2 rounded bg-amber-500/90 px-2 py-0.5 text-xs font-bold text-black">
            Reconnecting…
          </span>
        )}
        <div className="relative flex items-center gap-1">
          <button
            ref={viewAnchor}
            onClick={() => setViewMenu((v) => !v)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-room-hover"
          >
            <LayoutGrid className="h-4 w-4" /> View
          </button>
          <Popover open={viewMenu} onClose={() => setViewMenu(false)} anchorRef={viewAnchor} className="right-0 top-9 w-44 bg-[#2b2b2b] p-1.5">
            <MenuItem tone="dark" icon={<UserRound className="h-4 w-4" />} onClick={() => chooseView("speaker")}>
              Speaker {view === "speaker" && "✓"}
            </MenuItem>
            <MenuItem tone="dark" icon={<LayoutGrid className="h-4 w-4" />} onClick={() => chooseView("gallery")}>
              Gallery {view === "gallery" && "✓"}
            </MenuItem>
          </Popover>
          <button
            onClick={() =>
              document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.().catch(() => undefined)
            }
            className="hidden rounded-md p-1.5 hover:bg-room-hover sm:block"
            aria-label="Full screen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {self.screen && (
        <div className="mx-auto mb-1 flex items-center gap-3 rounded-lg bg-[#23a55a] px-3 py-1 text-xs font-bold text-white">
          <MonitorUp className="h-4 w-4" /> You are screen sharing
          <button onClick={() => void client.stopScreenShare()} className="rounded bg-zoom-red px-2 py-0.5 hover:bg-zoom-red-hover">
            Stop Share
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <main className={clsx("min-w-0 flex-1", panel && "hidden md:block")}>
          <VideoStage tiles={tiles} view={view} activeSpeakerId={activeSpeaker} showNames={settings.showNamesOnVideo} />
        </main>
        {panel === "participants" && (
          <ParticipantsPanel
            self={self}
            peers={room.peers}
            onClose={() => setPanel(null)}
            onInvite={() => setInviteOpen(true)}
            onToggleHand={() => client.setHandRaised(!self.hand_raised)}
            onMuteAll={() => {
              client.hostAction("mute-all");
              toast.success("All participants have been muted");
            }}
            onHostAction={(action, target) => client.hostAction(action, target)}
          />
        )}
        {panel === "chat" && (
          <ChatPanel messages={room.messages} selfId={self.id} onSend={(t) => client.sendChat(t)} onClose={() => setPanel(null)} />
        )}
      </div>

      <Toolbar
        audio={self.audio}
        video={self.video}
        sharing={self.screen}
        handRaised={self.hand_raised}
        isHost={isHost}
        participantCount={room.peers.length + 1}
        unreadMessages={unread}
        panel={panel}
        view={view}
        activeDevices={client.activeDevices}
        onToggleAudio={() => void client.setAudioEnabled(!self.audio)}
        onToggleVideo={() => void client.setVideoEnabled(!self.video)}
        onToggleShare={() => {
          if (self.screen) void client.stopScreenShare();
          else if (!navigator.mediaDevices?.getDisplayMedia) toast.error("Screen sharing is not supported on this device.");
          else void client.startScreenShare();
        }}
        onTogglePanel={(p) => setPanel((cur) => (cur === p ? null : p))}
        onReaction={(emoji) => client.sendReaction(emoji)}
        onToggleHand={() => client.setHandRaised(!self.hand_raised)}
        onChangeView={setView}
        onInvite={() => setInviteOpen(true)}
        onCopyLink={async () => {
          if (await copyToClipboard(join.join_url)) toast.success("Invite link copied to clipboard");
        }}
        onRecord={() => toast.info("Cloud recording is not available in this demo.")}
        onSelectMic={(id) => void client.switchMicrophone(id)}
        onSelectCamera={(id) => void client.switchCamera(id)}
        confirmLeave={settings.confirmLeave}
        onLeave={() => client.leave("left")}
        onEndForAll={() => client.hostAction("end")}
      />

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} details={inviteDetails} />
      <Modal
        open={askUnmute}
        onClose={() => setAskUnmute(false)}
        title="The host would like you to unmute"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAskUnmute(false)}>
              Stay Muted
            </Button>
            <Button
              onClick={() => {
                void client.setAudioEnabled(true);
                setAskUnmute(false);
              }}
            >
              Unmute
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Your microphone is currently muted.</p>
      </Modal>
    </div>
  );
}
