"use client";

import clsx from "clsx";
import { Check, EyeOff, LayoutGrid, Loader2, Maximize2, MonitorUp, UserRound, VideoOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MenuItem, Popover } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { BreakoutBanners } from "@/components/breakout/BreakoutBanners";
import { BreakoutPanel } from "@/components/breakout/BreakoutPanel";
import { PollsPanel } from "@/components/polls/PollsPanel";
import { Whiteboard } from "@/components/whiteboard/Whiteboard";
import { PollVoteModal } from "@/components/polls/PollVoteModal";
import { useActiveSpeaker } from "@/hooks/useActiveSpeaker";
import { useMeetingRecorder } from "@/hooks/useMeetingRecorder";
import { useMeetingShortcuts } from "@/hooks/useMeetingShortcuts";
import { useNow } from "@/hooks/useNow";
import { usePictureInPicture } from "@/hooks/usePictureInPicture";
import { useSettings } from "@/hooks/useSettings";
import { speechCaptionsSupported, useSpeechCaptions } from "@/hooks/useSpeechCaptions";
import { useTalkTime } from "@/hooks/useTalkTime";
import { WS_URL } from "@/lib/api";
import { copyToClipboard } from "@/lib/invitation";
import { type EndReason, isModerator, type RoomNotice, RoomClient } from "@/lib/rtc/room-client";
import type { RecorderSource } from "@/lib/recording/meeting-recorder";
import type { JoinResponse, PollView } from "@/lib/types";
import { BackgroundPicker } from "./BackgroundPicker";
import { CaptionsOverlay } from "./CaptionsOverlay";
import { ChatPanel } from "./ChatPanel";
import { InviteModal, type InviteDetails } from "./InviteModal";
import { EndTimeBanner, MeetingTimer } from "./MeetingClock";
import { MeetingInfo } from "./MeetingInfo";
import { ParticipantsPanel } from "./ParticipantsPanel";
import { RecordingIndicator } from "./RecordingIndicator";
import { RenameModal } from "./RenameModal";
import { ShortcutsModal } from "./ShortcutsModal";
import { Toolbar } from "./Toolbar";
import { TranscriptPanel } from "./TranscriptPanel";
import { type ViewMode, VideoStage } from "./VideoStage";
import type { TileModel } from "./VideoTile";
import { RemoteAudio } from "./VideoTile";
import { WaitingRoomAlert, WaitingRoomScreen } from "./WaitingRoom";

type Panel = "participants" | "chat" | "transcript" | "polls" | "breakout";

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

function noticeMessage(notice: RoomNotice): { tone: "info" | "success" | "error"; text: string } | null {
  switch (notice.kind) {
    case "force-mute":
      return { tone: "info", text: "You have been muted by the host" };
    case "force-stop-video":
      return { tone: "info", text: "The host has stopped your video" };
    case "now-host":
      return { tone: "success", text: "You are now the host of this meeting" };
    case "captions":
      if (!notice.enabled) return { tone: "info", text: "Live captions have been turned off" };
      return speechCaptionsSupported()
        ? { tone: "info", text: "Live captions are on" }
        : { tone: "info", text: "Live captions are on. Use Chrome or Edge to caption your own speech." };
    case "blocked":
      return { tone: "info", text: notice.message };
    case "error":
    case "media-error":
      return { tone: "error", text: notice.message };
    default:
      return null;
  }
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
  const now = useNow(1000);

  const [panel, setPanel] = useState<Panel | null>(null);
  const [view, setView] = useState<ViewMode>("gallery");
  const [viewMenu, setViewMenu] = useState(false);
  const viewAnchor = useRef<HTMLButtonElement>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [askUnmute, setAskUnmute] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const [showCaptions, setShowCaptions] = useState(true);
  const [leaveRequest, setLeaveRequest] = useState(0);
  const [pinned, setPinned] = useState<number | null>(null);
  const [hideSelf, setHideSelf] = useState(false);
  const [hideNonVideo, setHideNonVideo] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: number; name: string; isSelf: boolean } | null>(null);
  const [answering, setAnswering] = useState<PollView | null>(null);
  const [backgroundsOpen, setBackgroundsOpen] = useState(false);
  const seenPolls = useRef(new Set<number>());
  const [closingAt, setClosingAt] = useState<number | null>(null);
  const [broadcast, setBroadcast] = useState<{ text: string; from: string } | null>(null);
  const [helpRequest, setHelpRequest] = useState<{ from: string; roomName: string; position: number } | null>(null);

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

  // Host actions, role changes and errors arriving from the server.
  useEffect(() => {
    if (!room.notice) return;
    const n = room.notice.notice;
    if (n.kind === "ask-unmute") return setAskUnmute(true);
    if (n.kind === "breakout-closing") return setClosingAt(Date.now() + n.seconds * 1000);
    if (n.kind === "broadcast") return setBroadcast({ text: n.text, from: n.from });
    if (n.kind === "help") return setHelpRequest({ from: n.from, roomName: n.roomName, position: n.position });
    if (n.kind === "moved") return toast.info(n.roomName ? `You joined ${n.roomName}` : "You returned to the main session");
    const message = noticeMessage(room.notice.notice);
    if (message) toast[message.tone](message.text);
  }, [room.notice, toast]);

  // Breakout countdown ends when the rooms close; host broadcasts disappear after a while.
  useEffect(() => {
    if (!room.breakout?.open) setClosingAt(null);
  }, [room.breakout?.open]);
  useEffect(() => {
    if (!broadcast) return;
    const id = setTimeout(() => setBroadcast(null), 15000);
    return () => clearTimeout(id);
  }, [broadcast]);

  // Unread badge on the Chat button.
  useEffect(() => {
    if (panel === "chat") setReadCount(room.messages.length);
  }, [panel, room.messages.length]);
  const unread = panel === "chat" ? 0 : Math.max(0, room.messages.length - readCount);

  // Speaking detection drives the green border, speaker view and the talk-time insights.
  const talkTime = useTalkTime(client, room.self?.id ?? null);
  const speakerTracks = useMemo(() => {
    const map = new Map<number, MediaStreamTrack | null>();
    if (room.self) map.set(room.self.id, room.micTrack);
    room.peers.forEach((p) => map.set(p.id, p.stream?.getAudioTracks()[0] ?? null));
    return map;
  }, [room.self, room.micTrack, room.peers]);
  const activeSpeaker = useActiveSpeaker(speakerTracks, talkTime.onSample);

  // Live captions: I transcribe my own microphone while captions are on and I'm unmuted.
  useSpeechCaptions(room.captionsEnabled && !!room.self?.audio, (text, final) => client.sendCaption(text, final));

  // Picture-in-picture follows the shared screen, else the active speaker.
  const featuredStream = useMemo(() => {
    const sharer = room.peers.find((p) => p.screen && p.stream);
    const speaker = room.peers.find((p) => p.id === activeSpeaker && p.video && p.stream);
    const anyVideo = room.peers.find((p) => p.video && p.stream);
    return (sharer ?? speaker ?? anyVideo)?.stream ?? room.localStream;
  }, [room.peers, room.localStream, activeSpeaker]);
  const pip = usePictureInPicture(featuredStream);

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
      feedback: room.self.feedback,
      pinned: pinned === room.self.id,
      spotlighted: room.spotlightId === room.self.id,
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
      feedback: p.feedback,
      pinned: pinned === p.id,
      spotlighted: room.spotlightId === p.id,
      reaction: reactionFor(p.id),
      speaking: activeSpeaker === p.id,
      connecting: p.connection === "new" || p.connection === "connecting",
      mirror: false,
    }));
    return [me, ...others];
  }, [room.self, room.peers, room.localStream, room.reactions, room.spotlightId, pinned, activeSpeaker, settings.mirrorVideo]);

  // Recording: everyone's video (my screen while I share) and every audio track, mixed locally.
  const recorderSources = useMemo<RecorderSource[]>(
    () =>
      tiles.map((t) =>
        t.isSelf
          ? { id: t.id, name: t.name, stream: room.screenStream ?? room.localStream, showVideo: !!(room.screenStream ?? room.localStream), screen: !!room.screenStream }
          : { id: t.id, name: t.name, stream: t.stream, showVideo: t.showVideo, screen: t.screen },
      ),
    [tiles, room.screenStream, room.localStream],
  );
  const recorderAudio = useMemo(
    () => [room.micTrack, ...room.peers.map((p) => p.stream?.getAudioTracks()[0] ?? null)].filter((t): t is MediaStreamTrack => !!t),
    [room.micTrack, room.peers],
  );
  const recorder = useMeetingRecorder({
    client,
    title: join.meeting.title,
    sources: recorderSources,
    audioTracks: recorderAudio,
    onError: (message) => toast.error(message),
    onSaved: (filename) => toast.success(`Recording saved: ${filename}`),
  });

  // A pin only applies while that person is still here.
  const pinnedId = pinned !== null && tiles.some((t) => t.id === pinned) ? pinned : null;

  const self = room.self;
  const isHost = self?.role === "host";
  const moderator = isModerator(self);
  const whiteboardManager = moderator || room.whiteboard.opened_by === self?.id;
  const toggleWhiteboard = () => {
    if (!room.whiteboard.open) client.setWhiteboardOpen(true);
    else if (whiteboardManager) client.setWhiteboardOpen(false);
    else toast.info(`The whiteboard was opened by ${room.whiteboard.opened_by_name}`);
  };
  const pendingPoll = moderator ? undefined : room.polls.find((p) => p.status === "open" && !p.my_votes.length);
  const toggleRecording = () => {
    if (!moderator) return toast.info("Only the host and co-hosts can record this meeting.");
    if (recorder.state === "idle") recorder.start();
    else void recorder.stop();
  };
  const captionsVisible = room.captionsEnabled && showCaptions;

  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const toggleShare = () => {
    if (self?.screen) void client.stopScreenShare();
    else if (!navigator.mediaDevices?.getDisplayMedia) toast.error("Screen sharing is not supported on this device.");
    else void client.startScreenShare();
  };
  /** Host: captions on/off for everyone. Attendee: show/hide them for myself. */
  const toggleCaptions = () => {
    if (isHost) {
      client.setCaptionsEnabled(!room.captionsEnabled);
      setShowCaptions(true);
    } else if (!room.captionsEnabled) {
      toast.info("Captions are off. Ask the host to turn on live captions.");
    } else {
      setShowCaptions((v) => !v);
    }
  };
  const leave = () => {
    talkTime.flush();
    client.leave("left");
  };
  const endForAll = () => {
    talkTime.flush();
    client.hostAction("end");
  };

  const pushToTalkActive = useRef(false);
  useMeetingShortcuts({
    muted: !self?.audio,
    handlers: {
      toggleAudio: () => void client.setAudioEnabled(!self?.audio),
      toggleVideo: () => void client.setVideoEnabled(!self?.video),
      toggleShare,
      toggleChat: () => togglePanel("chat"),
      toggleParticipants: () => togglePanel("participants"),
      toggleHand: () => client.setHandRaised(!self?.hand_raised),
      toggleCaptions,
      leave: () => setLeaveRequest((n) => n + 1),
    },
    onPushToTalk: (pressed) => {
      if (pressed) {
        pushToTalkActive.current = true;
        void client.setAudioEnabled(true);
      } else if (pushToTalkActive.current) {
        pushToTalkActive.current = false;
        void client.setAudioEnabled(false);
      }
    },
  });

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

  // Pop the voting dialog up once for each new poll (participants only).
  useEffect(() => {
    if (!pendingPoll || seenPolls.current.has(pendingPoll.id)) return;
    seenPolls.current.add(pendingPoll.id);
    setAnswering(pendingPoll);
  }, [pendingPoll]);

  if (room.status === "waiting") {
    return <WaitingRoomScreen title={room.waitingTitle} onLeave={() => client.leave("left")} />;
  }

  if (!self) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-room text-room-text">
        <Loader2 className="h-8 w-8 animate-spin text-zoom-blue" />
        <p className="text-sm">{room.status === "reconnecting" ? "Reconnecting…" : "Connecting to meeting…"}</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-room text-room-text">
      {room.peers.map((p) => (
        <RemoteAudio key={p.id} stream={p.stream} />
      ))}

      <header className="relative flex h-11 shrink-0 items-center justify-between px-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <MeetingInfo details={inviteDetails} selfName={self.display_name} />
          <span className="hidden truncate text-xs text-room-text/70 sm:inline">{join.meeting.title}</span>
          <MeetingTimer startedAt={join.meeting.started_at} now={now} />
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
          <Popover open={viewMenu} onClose={() => setViewMenu(false)} anchorRef={viewAnchor} className="right-0 top-9 w-64 bg-[#2b2b2b] p-1.5">
            <MenuItem tone="dark" icon={<UserRound className="h-4 w-4" />} onClick={() => chooseView("speaker")}>
              Speaker {view === "speaker" && "✓"}
            </MenuItem>
            <MenuItem tone="dark" icon={<LayoutGrid className="h-4 w-4" />} onClick={() => chooseView("gallery")}>
              Gallery {view === "gallery" && "✓"}
            </MenuItem>
            <div className="my-1 border-t border-white/10" />
            <MenuItem tone="dark" icon={<EyeOff className="h-4 w-4" />} onClick={() => setHideSelf((v) => !v)}>
              <span className="flex-1">Hide Self View</span> {hideSelf && <Check className="h-4 w-4 text-[#6ea1ff]" />}
            </MenuItem>
            <MenuItem tone="dark" icon={<VideoOff className="h-4 w-4" />} onClick={() => setHideNonVideo((v) => !v)}>
              <span className="flex-1">Hide Non-video Participants</span> {hideNonVideo && <Check className="h-4 w-4 text-[#6ea1ff]" />}
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
        <main className={clsx("relative min-w-0 flex-1", panel && "hidden md:block")}>
          <EndTimeBanner scheduledStart={join.meeting.scheduled_start} durationMinutes={join.meeting.duration_minutes} now={now} />
          <div className="absolute left-3 top-3 z-20">
            <RecordingIndicator
              mine={recorder.state}
              elapsedMs={recorder.elapsedMs(now)}
              onPause={recorder.pause}
              onResume={recorder.resume}
              onStop={() => void recorder.stop()}
              othersRecording={recorder.state === "idle" ? room.recording.by : []}
            />
          </div>
          <BreakoutBanners
            breakout={room.breakout}
            myRoomName={room.myRoomName}
            selfId={self.id}
            isModerator={moderator}
            closingAt={closingAt}
            broadcast={broadcast}
            helpRequest={helpRequest}
            now={now}
            belowToolbar={room.whiteboard.open}
            onJoin={(position) => {
              setHelpRequest(null);
              client.breakoutJoin(position);
            }}
            onLeave={() => client.breakoutLeave()}
            onAskForHelp={() => client.breakoutAskForHelp()}
            onDismissBroadcast={() => setBroadcast(null)}
            onDismissHelp={() => setHelpRequest(null)}
          />
          {room.whiteboard.open ? (
            <Whiteboard
              strokes={room.whiteboard.strokes}
              selfId={self.id}
              openedByName={room.whiteboard.opened_by_name}
              canManage={whiteboardManager}
              title={join.meeting.title}
              onStroke={(chunk, done) => client.sendStroke(chunk, done)}
              onErase={(ids) => client.eraseStrokes(ids)}
              onClear={() => client.clearWhiteboard()}
              onClose={() => client.setWhiteboardOpen(false)}
            />
          ) : (
            <VideoStage
              tiles={tiles}
              view={view}
              activeSpeakerId={activeSpeaker}
              pinnedId={pinnedId}
              spotlightId={room.spotlightId}
              hideSelf={hideSelf}
              hideNonVideo={hideNonVideo}
              showNames={settings.showNamesOnVideo}
              onTogglePin={(id) => setPinned((cur) => (cur === id ? null : id))}
            />
          )}
          {moderator && panel !== "participants" && (
            <WaitingRoomAlert
              waiting={room.waiting}
              onAdmit={(id) => client.hostAction("admit", { target: id })}
              onOpenList={() => setPanel("participants")}
            />
          )}
          {captionsVisible && <CaptionsOverlay captions={room.liveCaptions} selfId={self.id} />}
        </main>
        {panel === "participants" && (
          <ParticipantsPanel
            self={self}
            peers={room.peers}
            waiting={room.waiting}
            security={room.security}
            pinnedId={pinnedId}
            spotlightId={room.spotlightId}
            onClose={() => setPanel(null)}
            onInvite={() => setInviteOpen(true)}
            onToggleHand={() => client.setHandRaised(!self.hand_raised)}
            onHostAction={(action, payload) => {
              client.hostAction(action, payload);
              if (action === "mute-all") toast.success("All participants have been muted");
            }}
            onPin={setPinned}
            onRename={setRenameTarget}
          />
        )}
        {panel === "chat" && (
          <ChatPanel
            messages={room.messages}
            self={self}
            peers={room.peers}
            chatAllowed={room.security.allow_chat}
            onSend={(text, to) => client.sendChat(text, to)}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === "breakout" && (
          <BreakoutPanel
            breakout={room.breakout}
            peers={room.peers}
            myGroup={self.group}
            onCreate={(count, auto) => client.breakoutCreate(count, auto)}
            onAssign={(id, position) => client.breakoutAssign(id, position)}
            onOpen={() => client.breakoutOpen()}
            onClose={() => client.breakoutClose()}
            onJoin={(position) => client.breakoutJoin(position)}
            onLeave={() => client.breakoutLeave()}
            onBroadcast={(text) => client.breakoutBroadcast(text)}
            onClosePanel={() => setPanel(null)}
          />
        )}
        {panel === "polls" && (
          <PollsPanel
            polls={room.polls}
            isModerator={moderator}
            onLaunch={(draft) => client.launchPoll(draft)}
            onEnd={(id) => client.endPoll(id)}
            onAnswer={setAnswering}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === "transcript" && (
          <TranscriptPanel
            title={join.meeting.title}
            segments={room.transcript}
            captionsEnabled={room.captionsEnabled}
            onClose={() => setPanel(null)}
          />
        )}
      </div>

      <Toolbar
        audio={self.audio}
        video={self.video}
        sharing={self.screen}
        handRaised={self.hand_raised}
        isHost={isHost}
        isModerator={moderator}
        security={room.security}
        onSecurityChange={(patch) => client.hostAction("security", patch)}
        waitingCount={moderator ? room.waiting.length : 0}
        feedback={self.feedback}
        onFeedback={(value) => client.setFeedback(value)}
        participantCount={room.peers.length + 1}
        unreadMessages={unread}
        panel={panel === "transcript" ? null : panel}
        view={view}
        activeDevices={client.activeDevices}
        onToggleAudio={() => void client.setAudioEnabled(!self.audio)}
        onToggleVideo={() => void client.setVideoEnabled(!self.video)}
        onToggleShare={toggleShare}
        onTogglePanel={togglePanel}
        onReaction={(emoji) => client.sendReaction(emoji)}
        onToggleHand={() => client.setHandRaised(!self.hand_raised)}
        onChangeView={setView}
        onInvite={() => setInviteOpen(true)}
        onCopyLink={async () => {
          if (await copyToClipboard(join.join_url)) toast.success("Invite link copied to clipboard");
        }}
        onRecord={toggleRecording}
        recording={recorder.state !== "idle"}
        pollPending={!!pendingPoll}
        blurOn={room.background.kind === "blur"}
        onToggleBlur={() => void client.setBackground(room.background.kind === "blur" ? { kind: "none" } : { kind: "blur" })}
        onChooseBackground={() => setBackgroundsOpen(true)}
        whiteboardOpen={room.whiteboard.open}
        onToggleWhiteboard={toggleWhiteboard}
        captionsOn={captionsVisible}
        onToggleCaptions={toggleCaptions}
        onOpenTranscript={() => setPanel("transcript")}
        pipSupported={pip.supported}
        onPictureInPicture={async () => {
          if (!(await pip.enter())) toast.info("Picture-in-picture needs someone's video to be on.");
        }}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onSelectMic={(id) => void client.switchMicrophone(id)}
        onSelectCamera={(id) => void client.switchCamera(id)}
        confirmLeave={settings.confirmLeave}
        leaveRequest={leaveRequest}
        onLeave={leave}
        onEndForAll={endForAll}
      />

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} details={inviteDetails} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <PollVoteModal poll={answering} onClose={() => setAnswering(null)} onSubmit={(id, options) => client.votePoll(id, options)} />
      <BackgroundPicker
        open={backgroundsOpen}
        onClose={() => setBackgroundsOpen(false)}
        current={room.background}
        loading={room.backgroundLoading}
        preview={room.localStream}
        mirror={settings.mirrorVideo}
        onSelect={(effect) => void client.setBackground(effect)}
      />
      <RenameModal
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRename={(name) =>
          renameTarget?.isSelf ? client.renameSelf(name) : client.hostAction("rename", { target: renameTarget?.id, name })
        }
      />
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
