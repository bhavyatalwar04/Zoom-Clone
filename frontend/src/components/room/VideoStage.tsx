"use client";

import { EyeOff } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { type TileModel, VideoTile } from "./VideoTile";

export type ViewMode = "gallery" | "speaker";

const ASPECT = 16 / 9;
const GAP = 8;

/** Picks the column count that makes 16:9 tiles as large as possible in the available space. */
function bestGrid(count: number, width: number, height: number) {
  let best = { cols: 1, w: 0, h: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const w = Math.min((width - GAP * (cols - 1)) / cols, ((height - GAP * (rows - 1)) / rows) * ASPECT);
    if (w > best.w) best = { cols, w, h: w / ASPECT };
  }
  return best;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

interface LayoutProps {
  showNames: boolean;
  onTogglePin: (id: number) => void;
}

function Gallery({ tiles, showNames, onTogglePin }: { tiles: TileModel[] } & LayoutProps) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { w, h } = bestGrid(tiles.length, width, height);
  return (
    <div ref={ref} className="flex h-full w-full flex-wrap content-center items-center justify-center" style={{ gap: GAP }}>
      {w > 0 &&
        tiles.map((tile) => (
          <VideoTile key={tile.id} tile={tile} showName={showNames} style={{ width: w, height: h }} onTogglePin={onTogglePin} />
        ))}
    </div>
  );
}

function Strip({ tiles, showNames, direction }: { tiles: TileModel[]; direction: "row" | "column" } & Omit<LayoutProps, "onTogglePin">) {
  if (!tiles.length) return null;
  return (
    <div
      className={
        direction === "row"
          ? "scroll-dark flex shrink-0 justify-center gap-2 overflow-x-auto pb-2"
          : "scroll-dark flex shrink-0 flex-row gap-2 overflow-x-auto pb-2 lg:w-56 lg:flex-col lg:overflow-y-auto lg:pb-0 lg:pl-2"
      }
    >
      {tiles.map((tile) => (
        <VideoTile key={tile.id} tile={tile} showName={showNames} variant="strip" className="aspect-video w-40 shrink-0 lg:w-auto" />
      ))}
    </div>
  );
}

interface VideoStageProps extends LayoutProps {
  tiles: TileModel[];
  view: ViewMode;
  activeSpeakerId: number | null;
  /** Pinned by me (local) takes precedence over a spotlight set by the host (for everyone). */
  pinnedId: number | null;
  spotlightId: number | null;
  hideSelf: boolean;
  hideNonVideo: boolean;
}

/**
 * Zoom-style layouts, in priority order:
 *  1. someone else is sharing: the shared screen is large, videos in a side strip
 *  2. a pinned (me) or spotlighted (host) video: that video is large, the rest in a strip
 *  3. speaker view: the active speaker large, everyone else in a strip on top
 *  4. gallery view: equal tiles in the best-fitting grid
 */
export function VideoStage({ tiles, view, activeSpeakerId, pinnedId, spotlightId, hideSelf, hideNonVideo, showNames, onTogglePin }: VideoStageProps) {
  const featuredId = pinnedId ?? spotlightId;
  const visible = tiles.filter(
    (t) => !(hideSelf && t.isSelf) && !(hideNonVideo && !t.showVideo && t.id !== featuredId),
  );
  const sharer = tiles.find((t) => t.screen && !t.isSelf);

  if (sharer) {
    return (
      <div className="flex h-full w-full flex-col gap-2 p-2 lg:flex-row">
        <div className="min-h-0 flex-1">
          <VideoTile tile={sharer} variant="main" className="h-full w-full" showName={showNames} />
        </div>
        <Strip tiles={visible.filter((t) => t.id !== sharer.id)} showNames={showNames} direction="column" />
      </div>
    );
  }

  const featured = tiles.find((t) => t.id === featuredId);
  const speaker =
    view === "speaker" && visible.length > 1
      ? (visible.find((t) => t.id === activeSpeakerId && !t.isSelf) ?? visible.find((t) => !t.isSelf))
      : undefined;
  const main = featured ?? speaker;

  if (main) {
    return (
      <div className="flex h-full w-full flex-col gap-2 p-2">
        <Strip tiles={visible.filter((t) => t.id !== main.id)} showNames={showNames} direction="row" />
        <div className="min-h-0 flex-1">
          <VideoTile tile={main} variant="main" className="h-full w-full" showName={showNames} onTogglePin={onTogglePin} />
        </div>
      </div>
    );
  }

  if (!visible.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-room-text/60">
        <EyeOff className="h-8 w-8" />
        {hideSelf ? "Your self view is hidden." : "Nobody has their video on."}
      </div>
    );
  }

  return (
    <div className="h-full w-full p-2">
      <Gallery tiles={visible} showNames={showNames} onTogglePin={onTogglePin} />
    </div>
  );
}
