import type { ChatMessage, ParticipantRole, TranscriptSegment } from "../types";

/**
 * RoomClient: everything that happens inside a meeting, framework independent.
 *
 * - Signalling and meeting events go through one WebSocket to the FastAPI backend.
 * - Media is sent peer-to-peer over WebRTC (a full mesh: one RTCPeerConnection per remote peer).
 * - The newcomer always sends the offers, so two peers never offer to each other at once.
 * - Every connection is created with one audio and one video transceiver up front, so muting,
 *   turning the camera off or sharing the screen is only ever a `replaceTrack` - no renegotiation.
 *
 * - Server messages are handled strictly one at a time, in arrival order (see `inbox`): several
 *   of them await WebRTC calls, and interleaving e.g. a `peer-left` with that peer's offer would
 *   operate on a connection that was closed underneath it.
 *
 * React reads state through `subscribe` / `getSnapshot` (useSyncExternalStore). Snapshots are
 * immutable: every change produces a new object.
 */

export interface PeerInfo {
  id: number;
  display_name: string;
  role: ParticipantRole;
  audio: boolean;
  video: boolean;
  screen: boolean;
  hand_raised: boolean;
}

export interface RemotePeer extends PeerInfo {
  stream: MediaStream | null;
  connection: RTCPeerConnectionState | "new";
}

export interface Reaction {
  key: number;
  peerId: number;
  emoji: string;
}

/** The latest (possibly still changing) caption line of one speaker. */
export interface LiveCaption {
  peerId: number;
  name: string;
  text: string;
  final: boolean;
  at: number;
}

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "closed";
export type EndReason = "left" | "ended" | "removed" | "error";

export type RoomNotice =
  | { kind: "force-mute" }
  | { kind: "ask-unmute" }
  | { kind: "force-stop-video" }
  | { kind: "now-host" }
  | { kind: "captions"; enabled: boolean }
  | { kind: "error"; message: string }
  | { kind: "media-error"; message: string };

export interface RoomSnapshot {
  status: ConnectionStatus;
  endReason: EndReason | null;
  self: PeerInfo | null;
  /** My camera, for the self view. */
  localStream: MediaStream | null;
  /** My screen while I am sharing it. */
  screenStream: MediaStream | null;
  /** My microphone track (used for the speaking indicator). */
  micTrack: MediaStreamTrack | null;
  peers: RemotePeer[];
  messages: ChatMessage[];
  reactions: Reaction[];
  /** Captions are switched on for the whole meeting by the host. */
  captionsEnabled: boolean;
  liveCaptions: LiveCaption[];
  /** Finalised captions, i.e. the meeting transcript so far. */
  transcript: TranscriptSegment[];
  notice: { id: number; notice: RoomNotice } | null;
}

interface PeerLink {
  pc: RTCPeerConnection;
  stream: MediaStream;
  pendingCandidates: RTCIceCandidateInit[];
}

type ServerMessage =
  | {
      type: "welcome";
      self: PeerInfo;
      peers: PeerInfo[];
      messages: ChatMessage[];
      transcript: TranscriptSegment[];
      captions_enabled: boolean;
    }
  | { type: "host-changed"; id: number }
  | { type: "captions-state"; enabled: boolean }
  | { type: "caption"; from: number; name: string; text: string; final: boolean; segment?: TranscriptSegment }
  | { type: "peer-joined"; peer: PeerInfo }
  | { type: "peer-updated"; peer: PeerInfo }
  | { type: "peer-left"; id: number }
  | { type: "signal"; from: number; data: SignalData }
  | { type: "chat"; message: ChatMessage }
  | { type: "reaction"; from: number; emoji: string }
  | { type: "force-mute" | "ask-unmute" | "force-stop-video" | "removed" | "meeting-ended" | "pong" }
  | { type: "error"; code: string; message: string };

type SignalData = { sdp: RTCSessionDescriptionInit } | { candidate: RTCIceCandidateInit };

export interface RoomClientOptions {
  wsUrl: string;
  /** Tracks from the pre-join preview, handed over so the browser doesn't prompt again. */
  initialStream: MediaStream | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  iceServers?: RTCIceServer[];
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];
const REACTION_TTL_MS = 8000;
const PING_INTERVAL_MS = 20000;
const MAX_RECONNECT_ATTEMPTS = 5;
const CAPTION_TTL_MS = 5500;
const INTERIM_CAPTION_INTERVAL_MS = 250;

export class RoomClient {
  private ws: WebSocket | null = null;
  private links = new Map<number, PeerLink>();
  private pendingSignals = new Map<number, RTCIceCandidateInit[]>();
  private listeners = new Set<() => void>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private disposed = false;
  private reactionKey = 0;
  private noticeId = 0;
  private lastInterimCaption = 0;
  private mediaRequested = false;
  /** Tail of the message queue: each server message is handled after the previous one. */
  private inbox: Promise<void> = Promise.resolve();

  private audioTrack: MediaStreamTrack | null;
  private cameraTrack: MediaStreamTrack | null;
  private screenTrack: MediaStreamTrack | null = null;
  private audioEnabled: boolean;

  private snapshot: RoomSnapshot;

  constructor(private readonly options: RoomClientOptions) {
    this.audioTrack = options.initialStream?.getAudioTracks()[0] ?? null;
    this.cameraTrack = options.videoEnabled ? (options.initialStream?.getVideoTracks()[0] ?? null) : null;
    if (!options.videoEnabled) options.initialStream?.getVideoTracks().forEach((t) => t.stop());
    this.audioEnabled = options.audioEnabled && !!this.audioTrack;
    if (this.audioTrack) this.audioTrack.enabled = this.audioEnabled;

    this.snapshot = {
      status: "connecting",
      endReason: null,
      self: null,
      localStream: this.buildLocalStream(),
      screenStream: null,
      micTrack: this.audioTrack,
      peers: [],
      messages: [],
      reactions: [],
      captionsEnabled: false,
      liveCaptions: [],
      transcript: [],
      notice: null,
    };
  }

  // ------------------------------------------------------------------ store API

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private update(patch: Partial<RoomSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  private updatePeer(id: number, patch: Partial<RemotePeer>) {
    this.update({ peers: this.snapshot.peers.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }

  private notify(notice: RoomNotice) {
    this.update({ notice: { id: ++this.noticeId, notice } });
  }

  // ------------------------------------------------------------------ lifecycle

  connect() {
    if (this.disposed) return;
    if (!this.mediaRequested) {
      this.mediaRequested = true;
      // Joined before the preview finished opening the camera / mic: open them ourselves.
      if (this.options.videoEnabled && !this.cameraTrack) void this.setVideoEnabled(true);
      if (this.options.audioEnabled && !this.audioTrack) void this.setAudioEnabled(true);
    }
    const url = new URL(this.options.wsUrl);
    url.searchParams.set("audio", String(this.audioEnabled));
    url.searchParams.set("video", String(!!this.cameraTrack));

    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.pingTimer = setInterval(() => this.send({ type: "ping" }), PING_INTERVAL_MS);
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return console.error("Bad message from server", event.data);
      }
      this.inbox = this.inbox
        .then(() => this.handleMessage(msg))
        .catch((err) => console.warn(`Failed to handle "${msg.type}"`, err));
    };
    ws.onclose = (event) => {
      if (this.ws !== ws) return; // an older socket we already replaced
      this.clearPing();
      if (this.disposed || this.snapshot.endReason) return;
      if (event.code === 4401) return this.finish("error");
      if (event.code === 4003) return this.finish("removed");
      if (event.code === 4004) return this.finish("ended");
      // Network hiccup: tear down the peer connections and rejoin; peers will be re-offered.
      this.closeAllLinks();
      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return this.finish("error");
      this.reconnectAttempts += 1;
      this.update({ status: "reconnecting", peers: [] });
      setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
    };
  }

  /** Leave the meeting and release the camera / microphone. */
  leave(reason: EndReason = "left") {
    this.finish(reason);
  }

  private finish(reason: EndReason) {
    if (this.snapshot.endReason) return;
    this.disposed = true;
    this.clearPing();
    this.ws?.close(1000);
    this.ws = null;
    this.closeAllLinks();
    [this.audioTrack, this.cameraTrack, this.screenTrack].forEach((t) => t?.stop());
    this.update({ status: "closed", endReason: reason, peers: [], localStream: null, screenStream: null, micTrack: null });
  }

  private clearPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private send(message: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  // ------------------------------------------------------------------ server messages

  private async handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "welcome": {
        this.update({
          status: "connected",
          self: { ...msg.self, audio: this.audioEnabled, video: !!this.cameraTrack, screen: !!this.screenTrack },
          messages: msg.messages,
          transcript: msg.transcript,
          captionsEnabled: msg.captions_enabled,
          peers: msg.peers.map((p) => ({ ...p, stream: null, connection: "new" })),
        });
        // Re-announce our real state (e.g. screen share survived a reconnect).
        this.sendMediaState();
        for (const peer of msg.peers) await this.callPeer(peer.id);
        break;
      }
      case "peer-joined": {
        this.closeLink(msg.peer.id); // a reconnecting peer gets a fresh connection
        const others = this.snapshot.peers.filter((p) => p.id !== msg.peer.id);
        this.update({ peers: [...others, { ...msg.peer, stream: null, connection: "new" }] });
        break; // the newcomer will send us an offer
      }
      case "peer-updated":
        this.updatePeer(msg.peer.id, msg.peer);
        break;
      case "host-changed":
        if (msg.id === this.snapshot.self?.id) {
          this.update({ self: { ...this.snapshot.self, role: "host" } });
          this.notify({ kind: "now-host" });
        } else {
          this.updatePeer(msg.id, { role: "host" });
        }
        break;
      case "captions-state":
        this.update({ captionsEnabled: msg.enabled, liveCaptions: msg.enabled ? this.snapshot.liveCaptions : [] });
        this.notify({ kind: "captions", enabled: msg.enabled });
        break;
      case "caption":
        this.showCaption(msg.from, msg.name, msg.text, msg.final);
        if (msg.segment) this.update({ transcript: [...this.snapshot.transcript, msg.segment] });
        break;
      case "peer-left":
        this.closeLink(msg.id);
        this.update({ peers: this.snapshot.peers.filter((p) => p.id !== msg.id) });
        break;
      case "signal":
        await this.handleSignal(msg.from, msg.data);
        break;
      case "chat":
        this.update({ messages: [...this.snapshot.messages, msg.message] });
        break;
      case "reaction":
        this.showReaction(msg.from, msg.emoji);
        break;
      case "force-mute":
        this.setAudioEnabled(false);
        this.notify({ kind: "force-mute" });
        break;
      case "force-stop-video":
        await this.setVideoEnabled(false);
        this.notify({ kind: "force-stop-video" });
        break;
      case "ask-unmute":
        this.notify({ kind: "ask-unmute" });
        break;
      case "removed":
        this.finish("removed");
        break;
      case "meeting-ended":
        this.finish("ended");
        break;
      case "error":
        this.notify({ kind: "error", message: msg.message });
        break;
    }
  }

  // ------------------------------------------------------------------ WebRTC

  private createLink(peerId: number): PeerLink {
    const pc = new RTCPeerConnection({ iceServers: this.options.iceServers ?? DEFAULT_ICE_SERVERS });
    const link: PeerLink = { pc, stream: new MediaStream(), pendingCandidates: this.pendingSignals.get(peerId) ?? [] };
    this.pendingSignals.delete(peerId);
    this.links.set(peerId, link);

    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ type: "signal", to: peerId, data: { candidate: e.candidate.toJSON() } });
    };
    pc.ontrack = (e) => {
      link.stream.addTrack(e.track);
      // New MediaStream object so React notices the change and re-binds <video>.
      this.updatePeer(peerId, { stream: new MediaStream(link.stream.getTracks()) });
    };
    pc.onconnectionstatechange = () => this.updatePeer(peerId, { connection: pc.connectionState });
    return link;
  }

  /** Outgoing video is the screen while sharing, otherwise the camera (or nothing). */
  private get outgoingVideo(): MediaStreamTrack | null {
    return this.screenTrack ?? this.cameraTrack;
  }

  private async callPeer(peerId: number) {
    this.closeLink(peerId);
    const { pc } = this.createLink(peerId);
    const audio = pc.addTransceiver("audio", { direction: "sendrecv" });
    const video = pc.addTransceiver("video", { direction: "sendrecv" });
    await audio.sender.replaceTrack(this.audioTrack);
    await video.sender.replaceTrack(this.outgoingVideo);
    await pc.setLocalDescription(await pc.createOffer());
    this.send({ type: "signal", to: peerId, data: { sdp: pc.localDescription!.toJSON() } });
  }

  private async handleSignal(from: number, data: SignalData) {
    if ("candidate" in data) {
      const link = this.links.get(from);
      if (!link) {
        // Candidate raced ahead of its offer; keep it until the connection exists.
        this.pendingSignals.set(from, [...(this.pendingSignals.get(from) ?? []), data.candidate]);
      } else if (!link.pc.remoteDescription) {
        link.pendingCandidates.push(data.candidate);
      } else {
        await link.pc.addIceCandidate(data.candidate).catch(() => undefined);
      }
      return;
    }

    const { sdp } = data;
    if (sdp.type === "offer") {
      this.closeLink(from);
      const link = this.createLink(from);
      const { pc } = link;
      await pc.setRemoteDescription(sdp);
      for (const transceiver of pc.getTransceivers()) {
        transceiver.direction = "sendrecv";
        const kind = transceiver.receiver.track.kind;
        await transceiver.sender.replaceTrack(kind === "audio" ? this.audioTrack : this.outgoingVideo);
      }
      await pc.setLocalDescription(await pc.createAnswer());
      this.send({ type: "signal", to: from, data: { sdp: pc.localDescription!.toJSON() } });
      await this.flushCandidates(link);
    } else if (sdp.type === "answer") {
      const link = this.links.get(from);
      if (!link || link.pc.signalingState !== "have-local-offer") return;
      await link.pc.setRemoteDescription(sdp);
      await this.flushCandidates(link);
    }
  }

  private async flushCandidates(link: PeerLink) {
    const candidates = link.pendingCandidates.splice(0);
    for (const candidate of candidates) await link.pc.addIceCandidate(candidate).catch(() => undefined);
  }

  private closeLink(peerId: number) {
    const link = this.links.get(peerId);
    if (!link) return;
    link.pc.onicecandidate = link.pc.ontrack = link.pc.onconnectionstatechange = null;
    link.pc.close();
    this.links.delete(peerId);
  }

  private closeAllLinks() {
    [...this.links.keys()].forEach((id) => this.closeLink(id));
    this.pendingSignals.clear();
  }

  private async replaceOutgoing(kind: "audio" | "video", track: MediaStreamTrack | null) {
    const jobs: Promise<void>[] = [];
    for (const { pc } of this.links.values()) {
      for (const t of pc.getTransceivers()) {
        if (t.receiver.track.kind === kind && t.currentDirection !== "stopped") jobs.push(t.sender.replaceTrack(track).catch(() => undefined));
      }
    }
    await Promise.all(jobs);
  }

  // ------------------------------------------------------------------ local media controls

  private buildLocalStream(): MediaStream | null {
    // Video only: the self view must never play back our own microphone.
    return this.cameraTrack ? new MediaStream([this.cameraTrack]) : null;
  }

  private sendMediaState() {
    const state = { audio: this.audioEnabled, video: !!this.cameraTrack, screen: !!this.screenTrack };
    if (this.snapshot.self) this.update({ self: { ...this.snapshot.self, ...state } });
    this.send({ type: "media", ...state });
  }

  get hasMicrophone() {
    return !!this.audioTrack;
  }

  async setAudioEnabled(enabled: boolean) {
    if (enabled && !this.audioTrack) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioTrack = stream.getAudioTracks()[0];
        await this.replaceOutgoing("audio", this.audioTrack);
        this.update({ micTrack: this.audioTrack });
      } catch {
        this.notify({ kind: "media-error", message: "Unable to access your microphone." });
        return;
      }
    }
    this.audioEnabled = enabled && !!this.audioTrack;
    if (this.audioTrack) this.audioTrack.enabled = this.audioEnabled;
    this.sendMediaState();
  }

  async setVideoEnabled(enabled: boolean) {
    if (enabled === !!this.cameraTrack) return;
    if (enabled) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        this.cameraTrack = stream.getVideoTracks()[0];
      } catch {
        this.notify({ kind: "media-error", message: "Unable to access your camera." });
        return;
      }
    } else {
      this.cameraTrack?.stop();
      this.cameraTrack = null;
    }
    if (!this.screenTrack) await this.replaceOutgoing("video", this.cameraTrack);
    this.update({ localStream: this.buildLocalStream() });
    this.sendMediaState();
  }

  async startScreenShare(): Promise<boolean> {
    if (this.screenTrack) return true;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      track.contentHint = "detail";
      track.addEventListener("ended", () => void this.stopScreenShare());
      this.screenTrack = track;
    } catch {
      return false; // user cancelled the picker
    }
    await this.replaceOutgoing("video", this.screenTrack);
    this.update({ screenStream: new MediaStream([this.screenTrack]) });
    this.sendMediaState();
    return true;
  }

  async stopScreenShare() {
    if (!this.screenTrack) return;
    this.screenTrack.stop();
    this.screenTrack = null;
    await this.replaceOutgoing("video", this.cameraTrack);
    this.update({ screenStream: null });
    this.sendMediaState();
  }

  /** Device ids currently in use, for the microphone / camera pickers. */
  get activeDevices() {
    return {
      audio: this.audioTrack?.getSettings().deviceId ?? null,
      video: this.cameraTrack?.getSettings().deviceId ?? null,
    };
  }

  async switchMicrophone(deviceId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      const track = stream.getAudioTracks()[0];
      track.enabled = this.audioEnabled;
      this.audioTrack?.stop();
      this.audioTrack = track;
      await this.replaceOutgoing("audio", track);
      this.update({ micTrack: track });
    } catch {
      this.notify({ kind: "media-error", message: "Unable to switch microphone." });
    }
  }

  async switchCamera(deviceId: string) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: 1280, height: 720 },
      });
      this.cameraTrack?.stop();
      this.cameraTrack = stream.getVideoTracks()[0];
      if (!this.screenTrack) await this.replaceOutgoing("video", this.cameraTrack);
      this.update({ localStream: this.buildLocalStream() });
      this.sendMediaState();
    } catch {
      this.notify({ kind: "media-error", message: "Unable to switch camera." });
    }
  }

  // ------------------------------------------------------------------ meeting actions

  sendChat(text: string) {
    const trimmed = text.trim();
    if (trimmed) this.send({ type: "chat", text: trimmed });
  }

  sendReaction(emoji: string) {
    this.send({ type: "reaction", emoji });
  }

  setHandRaised(raised: boolean) {
    if (this.snapshot.self) this.update({ self: { ...this.snapshot.self, hand_raised: raised } });
    this.send({ type: "hand", raised });
  }

  private showReaction(peerId: number, emoji: string) {
    const reaction = { key: ++this.reactionKey, peerId, emoji };
    this.update({ reactions: [...this.snapshot.reactions.filter((r) => r.peerId !== peerId), reaction] });
    setTimeout(() => {
      this.update({ reactions: this.snapshot.reactions.filter((r) => r.key !== reaction.key) });
    }, REACTION_TTL_MS);
  }

  hostAction(action: "mute-all" | "end"): void;
  hostAction(action: "mute" | "ask-unmute" | "stop-video" | "remove", target: number): void;
  hostAction(action: string, target?: number) {
    this.send({ type: `host:${action}`, target });
  }

  // ------------------------------------------------------------------ captions & insights

  /** Host only: turn live captions on or off for everyone. */
  setCaptionsEnabled(enabled: boolean) {
    this.send({ type: "host:captions", enabled });
  }

  /** Publish a caption of my own speech. Interim (still changing) results are rate limited. */
  sendCaption(text: string, final: boolean) {
    if (!this.snapshot.captionsEnabled || !text.trim()) return;
    const now = Date.now();
    if (!final && now - this.lastInterimCaption < INTERIM_CAPTION_INTERVAL_MS) return;
    this.lastInterimCaption = final ? 0 : now;
    this.send({ type: "caption", text, final });
  }

  /** Report how long I spoke since the last report (feeds the post-meeting insights). */
  reportTalkTime(ms: number) {
    if (ms > 0) this.send({ type: "talk-time", ms: Math.round(ms) });
  }

  private showCaption(peerId: number, name: string, text: string, final: boolean) {
    const caption: LiveCaption = { peerId, name, text, final, at: Date.now() };
    const others = this.snapshot.liveCaptions.filter((c) => c.peerId !== peerId);
    // Keep the two most recent speakers on screen, like Zoom's caption area.
    this.update({ liveCaptions: [...others, caption].slice(-2) });
    setTimeout(() => {
      const fresh = this.snapshot.liveCaptions.filter((c) => Date.now() - c.at < CAPTION_TTL_MS);
      if (fresh.length !== this.snapshot.liveCaptions.length) this.update({ liveCaptions: fresh });
    }, CAPTION_TTL_MS);
  }
}
