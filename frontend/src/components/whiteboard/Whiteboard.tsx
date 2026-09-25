"use client";

import clsx from "clsx";
import { Circle, Download, Eraser, Highlighter, Minus, Pen, Square, Trash2, Type, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WhiteboardStroke, WhiteboardTool } from "@/lib/types";
import { hitTest, newStrokeId } from "@/lib/whiteboard/render";
import { WhiteboardCanvas, type WhiteboardCanvasHandle } from "./WhiteboardCanvas";

type Tool = WhiteboardTool | "eraser";

const TOOLS: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: "pen", label: "Pen", icon: <Pen className="h-4 w-4" /> },
  { tool: "highlighter", label: "Highlighter", icon: <Highlighter className="h-4 w-4" /> },
  { tool: "line", label: "Line", icon: <Minus className="h-4 w-4" /> },
  { tool: "rect", label: "Rectangle", icon: <Square className="h-4 w-4" /> },
  { tool: "ellipse", label: "Ellipse", icon: <Circle className="h-4 w-4" /> },
  { tool: "text", label: "Text", icon: <Type className="h-4 w-4" /> },
  { tool: "eraser", label: "Eraser", icon: <Eraser className="h-4 w-4" /> },
];
const COLORS = ["#131619", "#0b5cff", "#e02828", "#12a150", "#e8710a", "#9334e6"];
const WIDTHS = [2, 4, 8];
const FLUSH_MS = 50; // stream pen strokes to others in small chunks

interface WhiteboardProps {
  strokes: WhiteboardStroke[];
  selfId: number | undefined;
  openedByName: string | null;
  canManage: boolean;
  title: string;
  onStroke: (chunk: WhiteboardStroke, done: boolean) => void;
  onErase: (ids: string[]) => void;
  onClear: () => void;
  onClose: () => void;
}

export function Whiteboard({ strokes, selfId, openedByName, canManage, title, onStroke, onErase, onClear, onClose }: WhiteboardProps) {
  const board = useRef<WhiteboardCanvasHandle>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[1]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [preview, setPreview] = useState<WhiteboardStroke | null>(null);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const drawing = useRef<{ stroke: WhiteboardStroke; pending: [number, number][]; timer: ReturnType<typeof setInterval> } | null>(null);
  const erasing = useRef(false);

  const toBoard = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
  };

  const flush = useCallback(
    (done: boolean) => {
      const d = drawing.current;
      if (!d || (!d.pending.length && !done)) return;
      onStroke({ ...d.stroke, points: d.pending }, done);
      d.pending = [];
    },
    [onStroke],
  );

  useEffect(() => () => {
    if (drawing.current) clearInterval(drawing.current.timer);
  }, []);

  const eraseAt = (x: number, y: number) => onErase(hitTest(strokes, x, y));

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [x, y] = toBoard(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "eraser") {
      erasing.current = true;
      eraseAt(x, y);
    } else if (tool === "text") {
      setTextDraft({ x, y, value: "" });
    } else if (tool === "pen" || tool === "highlighter") {
      const stroke: WhiteboardStroke = { id: newStrokeId(selfId), tool, color, width, points: [] };
      drawing.current = { stroke, pending: [[x, y]], timer: setInterval(() => flush(false), FLUSH_MS) };
      flush(false);
    } else {
      setPreview({ id: newStrokeId(selfId), tool, color, width, points: [[x, y], [x, y]] });
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.buttons) return;
    const [x, y] = toBoard(e);
    if (erasing.current) eraseAt(x, y);
    else if (drawing.current) drawing.current.pending.push([x, y]);
    else if (preview) setPreview({ ...preview, points: [preview.points[0], [x, y]] });
  };

  const onPointerUp = () => {
    erasing.current = false;
    if (drawing.current) {
      clearInterval(drawing.current.timer);
      flush(true);
      drawing.current = null;
    }
    if (preview) {
      onStroke(preview, true); // shapes are sent once, when finished
      setPreview(null);
    }
  };

  const commitText = () => {
    if (textDraft?.value.trim()) {
      onStroke(
        { id: newStrokeId(selfId), tool: "text", color, width, text: textDraft.value.trim(), points: [[textDraft.x, textDraft.y]] },
        true,
      );
    }
    setTextDraft(null);
  };

  const undo = () => {
    const mine = strokes.filter((s) => s.by === selfId);
    if (mine.length) onErase([mine[mine.length - 1].id]);
  };

  const exportPng = () => {
    const url = board.current?.toPng();
    if (!url) return;
    Object.assign(document.createElement("a"), { href: url, download: `${title.replace(/[^\w-]+/g, "_")}_whiteboard.png` }).click();
  };

  const visible = useMemo(() => (preview ? [...strokes, preview] : strokes), [strokes, preview]);

  return (
    <div className="flex h-full w-full flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#2b2b2b] px-2 py-1.5 text-room-text" role="toolbar" aria-label="Whiteboard tools">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            onClick={() => setTool(t.tool)}
            aria-pressed={tool === t.tool}
            aria-label={t.label}
            title={t.label}
            className={clsx("rounded-md p-1.5", tool === t.tool ? "bg-zoom-blue text-white" : "hover:bg-white/10")}
          >
            {t.icon}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/15" />
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            aria-label={`Color ${c}`}
            aria-pressed={color === c}
            className={clsx("h-5 w-5 rounded-full ring-2", color === c ? "ring-white" : "ring-transparent")}
            style={{ backgroundColor: c }}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-white/15" />
        {WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => setWidth(w)}
            aria-label={`Width ${w}`}
            aria-pressed={width === w}
            className={clsx("flex h-7 w-7 items-center justify-center rounded-md", width === w ? "bg-white/15" : "hover:bg-white/10")}
          >
            <span className="rounded-full bg-room-text" style={{ width: w + 2, height: w + 2 }} />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/15" />
        <button onClick={undo} className="rounded-md p-1.5 hover:bg-white/10" aria-label="Undo" title="Undo my last stroke">
          <Undo2 className="h-4 w-4" />
        </button>
        {canManage && (
          <button onClick={onClear} className="rounded-md p-1.5 hover:bg-white/10" aria-label="Clear whiteboard" title="Clear">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button onClick={exportPng} className="rounded-md p-1.5 hover:bg-white/10" aria-label="Export whiteboard" title="Save as PNG">
          <Download className="h-4 w-4" />
        </button>
        <span className="ml-auto hidden text-xs text-room-text/60 sm:inline">{openedByName ? `${openedByName}'s whiteboard` : "Whiteboard"}</span>
        {canManage && (
          <button onClick={onClose} className="ml-2 flex items-center gap-1 rounded-md bg-zoom-red px-2 py-1 text-xs font-bold text-white hover:bg-zoom-red-hover">
            <X className="h-3.5 w-3.5" /> Close
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <WhiteboardCanvas
          ref={board}
          strokes={visible}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          cursor={tool === "eraser" ? "cell" : tool === "text" ? "text" : "crosshair"}
        >
          {textDraft && (
            <input
              autoFocus
              value={textDraft.value}
              onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitText();
                if (e.key === "Escape") setTextDraft(null);
              }}
              onBlur={commitText}
              maxLength={200}
              aria-label="Whiteboard text"
              className="absolute min-w-40 rounded border border-zoom-blue bg-white/90 px-1 text-sm text-ink outline-none"
              style={{ left: `${textDraft.x * 100}%`, top: `${textDraft.y * 100}%`, color }}
            />
          )}
        </WhiteboardCanvas>
      </div>
    </div>
  );
}
