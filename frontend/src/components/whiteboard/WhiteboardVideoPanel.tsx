"use client";

import clsx from "clsx";
import { ChevronDown, ChevronUp, GripHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type TileModel, VideoTile } from "@/components/room/VideoTile";

interface WhiteboardVideoPanelProps {
  tiles: TileModel[];
  showNames: boolean;
}

/**
 * A floating, draggable strip of everyone's video shown on top of the whiteboard, so the
 * meeting stays face to face while drawing. Tiles with the camera off show the person's name.
 */
export function WhiteboardVideoPanel({ tiles, showNames }: WhiteboardVideoPanelProps) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  // null = docked in the bottom-right corner; set once the panel has been dragged.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // A dragged position may fall outside a resized board, so re-dock on resize.
  useEffect(() => {
    const reset = () => setPos(null);
    window.addEventListener("resize", reset);
    return () => window.removeEventListener("resize", reset);
  }, []);

  // The host first, then everyone else in join order.
  const ordered = [...tiles].sort((a, b) => Number(b.isHost) - Number(a.isHost));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = panel.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = panel.current;
    const parent = el?.offsetParent?.getBoundingClientRect();
    if (!drag.current || !el || !parent) return;
    const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));
    setPos({
      x: clamp(e.clientX - parent.left - drag.current.dx, parent.width - el.offsetWidth),
      y: clamp(e.clientY - parent.top - drag.current.dy, parent.height - el.offsetHeight),
    });
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  if (!ordered.length) return null;

  return (
    <div
      ref={panel}
      className={clsx(
        "absolute z-10 flex max-h-[70%] w-32 flex-col overflow-hidden rounded-lg bg-[#1a1a1a]/90 shadow-pop ring-1 ring-white/10 backdrop-blur sm:w-48",
        !pos && "bottom-3 right-3",
      )}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      aria-label="Participant videos"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="flex shrink-0 cursor-move touch-none select-none items-center gap-1 px-2 py-1 text-xs text-room-text/80"
        title="Drag to move"
      >
        <GripHorizontal className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate">Videos ({ordered.length})</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setCollapsed((c) => !c)}
          className="rounded p-0.5 hover:bg-white/10"
          aria-label={collapsed ? "Show videos" : "Hide videos"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>
      {/* Kept mounted while collapsed so the video elements stay bound to their streams. */}
      <div className={clsx("scroll-dark flex min-h-0 flex-col gap-1.5 overflow-y-auto px-1.5 pb-1.5", collapsed && "hidden")}>
        {ordered.map((tile) => (
          <VideoTile key={tile.id} tile={tile} showName={showNames} variant="strip" className="aspect-video w-full shrink-0" />
        ))}
      </div>
    </div>
  );
}
