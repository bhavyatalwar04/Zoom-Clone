/**
 * "Record on this computer": draws everyone's video into one canvas (gallery grid, or the
 * shared screen large with a strip of videos), mixes all audio with the Web Audio API, and
 * records both with MediaRecorder into a .webm file that is downloaded when recording stops.
 */

export interface RecorderSource {
  id: number;
  name: string;
  stream: MediaStream | null;
  showVideo: boolean;
  screen: boolean;
}

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 25;
const GAP = 8;
const BACKGROUND = "#1a1a1a";
const TILE = "#242424";

function pickMimeType(): string {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export class MeetingRecorder {
  static isSupported(): boolean {
    return typeof window !== "undefined" && "MediaRecorder" in window && "captureStream" in HTMLCanvasElement.prototype;
  }

  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private videos = new Map<number, HTMLVideoElement>();
  private audioContext = new AudioContext();
  private destination = this.audioContext.createMediaStreamDestination();
  private audioNodes = new Map<string, MediaStreamAudioSourceNode>();
  private sources: RecorderSource[] = [];
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    const stream = new MediaStream([
      ...this.canvas.captureStream(FPS).getVideoTracks(),
      ...this.destination.stream.getAudioTracks(),
    ]);
    this.recorder = new MediaRecorder(stream, { mimeType: pickMimeType(), videoBitsPerSecond: 2_500_000 });
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
  }

  start() {
    void this.audioContext.resume();
    this.recorder.start(1000); // a chunk every second, so a crash loses little
    // setInterval rather than requestAnimationFrame: rAF stops when the tab is in the background.
    this.timer = setInterval(() => this.draw(), 1000 / FPS);
  }

  pause() {
    if (this.recorder.state === "recording") this.recorder.pause();
  }

  resume() {
    if (this.recorder.state === "paused") this.recorder.resume();
  }

  get state() {
    return this.recorder.state;
  }

  /** Keep the recording in sync with who is in the meeting (videos) and who can be heard (audio). */
  update(sources: RecorderSource[], audioTracks: MediaStreamTrack[]) {
    this.sources = sources;

    for (const [id, video] of this.videos) {
      const source = sources.find((s) => s.id === id);
      if (!source?.stream) {
        video.srcObject = null;
        this.videos.delete(id);
      } else if (video.srcObject !== source.stream) {
        video.srcObject = source.stream;
      }
    }
    for (const source of sources) {
      if (!source.stream || this.videos.has(source.id)) continue;
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = source.stream;
      void video.play().catch(() => undefined);
      this.videos.set(source.id, video);
    }

    const live = new Set(audioTracks.filter((t) => t.readyState === "live").map((t) => t.id));
    for (const [trackId, node] of this.audioNodes) {
      if (!live.has(trackId)) {
        node.disconnect();
        this.audioNodes.delete(trackId);
      }
    }
    for (const track of audioTracks) {
      if (!live.has(track.id) || this.audioNodes.has(track.id)) continue;
      const node = this.audioContext.createMediaStreamSource(new MediaStream([track]));
      node.connect(this.destination);
      this.audioNodes.set(track.id, node);
    }
  }

  /** Stops recording and returns the finished file. */
  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      this.recorder.onstop = () => {
        this.cleanup();
        resolve(new Blob(this.chunks, { type: this.recorder.mimeType || "video/webm" }));
      };
      if (this.recorder.state === "inactive") this.recorder.onstop(new Event("stop"));
      else this.recorder.stop();
    });
  }

  private cleanup() {
    if (this.timer) clearInterval(this.timer);
    this.videos.forEach((v) => (v.srcObject = null));
    this.videos.clear();
    this.audioNodes.forEach((n) => n.disconnect());
    this.audioNodes.clear();
    void this.audioContext.close().catch(() => undefined);
  }

  // ------------------------------------------------------------------ drawing

  private draw() {
    const { ctx } = this;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const sharer = this.sources.find((s) => s.screen);
    if (sharer) {
      const stripWidth = this.sources.length > 1 ? 240 : 0;
      this.drawTile(sharer, GAP, GAP, WIDTH - stripWidth - GAP * 2, HEIGHT - GAP * 2, true);
      const others = this.sources.filter((s) => s !== sharer).slice(0, 5);
      others.forEach((s, i) => this.drawTile(s, WIDTH - stripWidth, GAP + i * (135 + GAP), stripWidth - GAP, 135));
      return;
    }

    const count = Math.max(1, this.sources.length);
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const w = (WIDTH - GAP * (cols + 1)) / cols;
    const h = (HEIGHT - GAP * (rows + 1)) / rows;
    this.sources.forEach((s, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      this.drawTile(s, GAP + col * (w + GAP), GAP + row * (h + GAP), w, h);
    });
  }

  private drawTile(source: RecorderSource, x: number, y: number, w: number, h: number, contain = false) {
    const { ctx } = this;
    ctx.fillStyle = TILE;
    ctx.fillRect(x, y, w, h);

    const video = this.videos.get(source.id);
    if (source.showVideo && video && video.videoWidth) {
      // cover (crop) for cameras, contain (letterbox) for shared screens
      const scale = contain
        ? Math.min(w / video.videoWidth, h / video.videoHeight)
        : Math.max(w / video.videoWidth, h / video.videoHeight);
      const dw = video.videoWidth * scale;
      const dh = video.videoHeight * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(video, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.max(14, Math.min(36, w / 12))}px Lato, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(source.name, x + w / 2, y + h / 2, w - 16);
    }

    // name label, bottom-left, like the meeting UI
    ctx.font = "14px Lato, sans-serif";
    const label = source.screen ? `${source.name}'s screen` : source.name;
    const labelWidth = Math.min(ctx.measureText(label).width + 12, w - 12);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x + 6, y + h - 28, labelWidth, 22);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 12, y + h - 17, labelWidth - 12);
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
