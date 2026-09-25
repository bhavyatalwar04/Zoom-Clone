"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { WhiteboardStroke } from "@/lib/types";
import { BOARD_ASPECT, drawBoard } from "@/lib/whiteboard/render";

export interface WhiteboardCanvasHandle {
  canvas: HTMLCanvasElement | null;
  /** Export the board as a PNG (drawn at a fixed 1920px width, independent of screen size). */
  toPng: () => string;
}

interface WhiteboardCanvasProps {
  strokes: WhiteboardStroke[];
  className?: string;
  children?: React.ReactNode;
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  cursor?: string;
}

/**
 * A 16:9 board that fills its container and redraws whenever the strokes change. Used both
 * interactively (in the meeting) and read-only (meeting history).
 */
export const WhiteboardCanvas = forwardRef<WhiteboardCanvasHandle, WhiteboardCanvasProps>(function WhiteboardCanvas(
  { strokes, className, children, onPointerDown, onPointerMove, onPointerUp, cursor },
  ref,
) {
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Fit the largest 16:9 box into the container.
  useLayoutEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const w = Math.min(width, height * BOARD_ASPECT);
      setSize({ width: Math.floor(w), height: Math.floor(w / BOARD_ASPECT) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !size.width) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.width * dpr);
    c.height = Math.round(size.height * dpr);
    drawBoard(c, strokes);
  }, [strokes, size]);

  useImperativeHandle(ref, () => ({
    get canvas() {
      return canvas.current;
    },
    toPng: () => {
      const out = document.createElement("canvas");
      out.width = 1920;
      out.height = Math.round(1920 / BOARD_ASPECT);
      drawBoard(out, strokes);
      return out.toDataURL("image/png");
    },
  }));

  return (
    <div ref={wrapper} className={className ?? "flex h-full w-full items-center justify-center"}>
      <div className="relative" style={{ width: size.width, height: size.height }}>
        <canvas
          ref={canvas}
          className="h-full w-full touch-none rounded-lg shadow-pop"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          aria-label="Whiteboard"
          role="img"
        />
        {children}
      </div>
    </div>
  );
});
