import type { WhiteboardStroke } from "../types";

/** The board is always 16:9; points are stored as fractions of its width / height. */
export const BOARD_ASPECT = 16 / 9;
export const BOARD_BACKGROUND = "#ffffff";

/** Draws one element onto a canvas of the given pixel size. */
export function drawStroke(ctx: CanvasRenderingContext2D, stroke: WhiteboardStroke, width: number, height: number) {
  const pts = stroke.points.map(([x, y]) => [x * width, y * height] as const);
  if (!pts.length) return;
  const scale = width / 1280; // widths are defined for a 1280px wide board
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (stroke.tool) {
    case "pen":
    case "highlighter": {
      if (stroke.tool === "highlighter") {
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = stroke.width * 4 * scale;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.1, pts[0][1]); // a dot
      // Smooth the line through the midpoints of consecutive points.
      for (let i = 1; i < pts.length - 1; i++) {
        const [x, y] = pts[i];
        const [nx, ny] = pts[i + 1];
        ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
      }
      if (pts.length > 1) ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      ctx.stroke();
      break;
    }
    case "line": {
      const [a, b] = [pts[0], pts[pts.length - 1]];
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      break;
    }
    case "rect": {
      const [a, b] = [pts[0], pts[pts.length - 1]];
      ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      break;
    }
    case "ellipse": {
      const [a, b] = [pts[0], pts[pts.length - 1]];
      ctx.beginPath();
      ctx.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "text": {
      ctx.font = `${Math.round(stroke.width * 6 * scale + 12 * scale)}px Lato, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(stroke.text ?? "", pts[0][0], pts[0][1]);
      break;
    }
  }
  ctx.restore();
}

export function drawBoard(canvas: HTMLCanvasElement, strokes: WhiteboardStroke[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = BOARD_BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) drawStroke(ctx, stroke, canvas.width, canvas.height);
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Ids of the elements under a point (all in normalised board coordinates), for the eraser.
 * Shapes are hit on their outline; text on its approximate box.
 */
export function hitTest(strokes: WhiteboardStroke[], x: number, y: number, tolerance = 0.012): string[] {
  const hits: string[] = [];
  for (const s of strokes) {
    const pts = s.points;
    if (!pts.length) continue;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    let hit = false;
    if (s.tool === "text") {
      const w = ((s.text?.length ?? 1) * (s.width * 6 + 12) * 0.55) / 1280;
      const h = ((s.width * 6 + 12) / 1280) * BOARD_ASPECT;
      hit = x >= a[0] - tolerance && x <= a[0] + w && y >= a[1] - tolerance && y <= a[1] + h;
    } else if (s.tool === "rect") {
      const corners: [number, number][] = [a, [b[0], a[1]], b, [a[0], b[1]], a];
      hit = corners.slice(1).some((c, i) => distanceToSegment(x, y, corners[i][0], corners[i][1], c[0], c[1]) < tolerance);
    } else if (s.tool === "ellipse") {
      const cx = (a[0] + b[0]) / 2;
      const cy = (a[1] + b[1]) / 2;
      const rx = Math.abs(b[0] - a[0]) / 2 || 1e-6;
      const ry = Math.abs(b[1] - a[1]) / 2 || 1e-6;
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      hit = Math.abs(d - 1) * Math.min(rx, ry) < tolerance;
    } else if (s.tool === "line") {
      hit = distanceToSegment(x, y, a[0], a[1], b[0], b[1]) < tolerance;
    } else {
      const reach = tolerance + (s.tool === "highlighter" ? (s.width * 2) / 1280 : 0);
      hit = pts.length === 1
        ? Math.hypot(x - a[0], y - a[1]) < reach
        : pts.slice(1).some((p, i) => distanceToSegment(x, y, pts[i][0], pts[i][1], p[0], p[1]) < reach);
    }
    if (hit) hits.push(s.id);
  }
  return hits;
}

export function newStrokeId(selfId: number | undefined) {
  return `${selfId ?? 0}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
