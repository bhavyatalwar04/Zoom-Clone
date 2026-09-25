"use client";

import clsx from "clsx";
import { Hand, MicOff, WifiOff } from "lucide-react";
import { memo, useEffect, useRef } from "react";

export interface TileModel {
  id: number;
  name: string;
  isSelf: boolean;
  isHost: boolean;
  stream: MediaStream | null;
  /** Whether a video track is being sent (camera on or screen sharing). */
  showVideo: boolean;
  audio: boolean;
  screen: boolean;
  handRaised: boolean;
  reaction: { key: number; emoji: string } | null;
  speaking: boolean;
  connecting: boolean;
  mirror: boolean;
}

/** Binds a MediaStream to a muted <video>; audio is played separately by <RemoteAudio>. */
function StreamVideo({ stream, mirror, contain }: { stream: MediaStream | null; mirror: boolean; contain: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={clsx("h-full w-full", contain ? "object-contain" : "object-cover", mirror && "mirror")}
    />
  );
}

interface VideoTileProps {
  tile: TileModel;
  showName?: boolean;
  /** Screen shares are letterboxed rather than cropped. */
  variant?: "grid" | "main" | "strip";
  className?: string;
  style?: React.CSSProperties;
}

export const VideoTile = memo(function VideoTile({ tile, showName = true, variant = "grid", className, style }: VideoTileProps) {
  const contain = tile.screen || variant === "main";
  return (
    <div
      style={style}
      className={clsx(
        "relative overflow-hidden rounded-lg bg-room-tile",
        tile.speaking && tile.audio ? "ring-[3px] ring-[#23d959]" : "ring-1 ring-white/5",
        className,
      )}
    >
      {/* Always mounted so the stream stays bound while the camera is toggled. */}
      <div className={clsx("absolute inset-0", !tile.showVideo && "invisible")}>
        <StreamVideo stream={tile.stream} mirror={tile.mirror && !tile.screen} contain={contain} />
      </div>

      {!tile.showVideo && (
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <span
            className={clsx(
              "truncate text-center font-bold text-white",
              variant === "strip" ? "text-sm" : "text-xl sm:text-3xl",
            )}
          >
            {tile.name}
          </span>
        </div>
      )}

      {tile.connecting && (
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white/80">
          <WifiOff className="h-3 w-3" /> Connecting…
        </div>
      )}

      {(tile.handRaised || tile.reaction) && (
        <div className="absolute left-2 top-2 flex items-center gap-1">
          {tile.handRaised && (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#f7c948] text-ink shadow">
              <Hand className="h-4 w-4" />
            </span>
          )}
          {tile.reaction && (
            <span key={tile.reaction.key} className="animate-float-up text-3xl drop-shadow" aria-label={`Reaction ${tile.reaction.emoji}`}>
              {tile.reaction.emoji}
            </span>
          )}
        </div>
      )}

      {showName && (
        <div className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-12px)] items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
          {!tile.audio && <MicOff className="h-3.5 w-3.5 shrink-0 text-[#ff4d4d]" aria-label="Muted" />}
          <span className="truncate">
            {tile.name}
            {tile.screen && variant === "main" ? "'s screen" : ""}
          </span>
        </div>
      )}
    </div>
  );
});

/** Plays a remote participant's audio regardless of where (or whether) their tile is shown. */
export function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [stream]);
  return <audio ref={ref} autoPlay className="hidden" />;
}
