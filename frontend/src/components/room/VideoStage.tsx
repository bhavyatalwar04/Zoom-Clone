"use client";

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

function Gallery({ tiles, showNames }: { tiles: TileModel[]; showNames: boolean }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const { w, h } = bestGrid(tiles.length, width, height);
  return (
    <div ref={ref} className="flex h-full w-full flex-wrap content-center items-center justify-center" style={{ gap: GAP }}>
      {w > 0 &&
        tiles.map((tile) => <VideoTile key={tile.id} tile={tile} showName={showNames} style={{ width: w, height: h }} />)}
    </div>
  );
}

function Strip({ tiles, showNames, direction }: { tiles: TileModel[]; showNames: boolean; direction: "row" | "column" }) {
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

interface VideoStageProps {
  tiles: TileModel[];
  view: ViewMode;
  activeSpeakerId: number | null;
  showNames: boolean;
}

/**
 * Zoom-style layouts:
 *  - someone (else) is sharing: the shared screen is large, videos in a side strip
 *  - speaker view: active speaker large, everyone else in a strip on top
 *  - gallery view: equal tiles in the best-fitting grid
 */
export function VideoStage({ tiles, view, activeSpeakerId, showNames }: VideoStageProps) {
  const sharer = tiles.find((t) => t.screen && !t.isSelf);

  if (sharer) {
    return (
      <div className="flex h-full w-full flex-col gap-2 p-2 lg:flex-row">
        <div className="min-h-0 flex-1">
          <VideoTile tile={sharer} variant="main" className="h-full w-full" showName={showNames} />
        </div>
        <Strip tiles={tiles.filter((t) => t.id !== sharer.id)} showNames={showNames} direction="column" />
      </div>
    );
  }

  if (view === "speaker" && tiles.length > 1) {
    const others = tiles.filter((t) => !t.isSelf);
    const main = tiles.find((t) => t.id === activeSpeakerId && !t.isSelf) ?? others[0];
    return (
      <div className="flex h-full w-full flex-col gap-2 p-2">
        <Strip tiles={tiles.filter((t) => t.id !== main.id)} showNames={showNames} direction="row" />
        <div className="min-h-0 flex-1">
          <VideoTile tile={main} variant="main" className="h-full w-full" showName={showNames} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full p-2">
      <Gallery tiles={tiles} showNames={showNames} />
    </div>
  );
}
