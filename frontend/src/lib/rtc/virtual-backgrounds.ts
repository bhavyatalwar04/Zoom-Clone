/**
 * Built-in virtual backgrounds, drawn with the Canvas API at first use (no image files to ship
 * or license). Each is a 1280x720 PNG data URL.
 */

export interface VirtualBackground {
  id: string;
  label: string;
  src: string;
}

const W = 1280;
const H = 720;

type Painter = (ctx: CanvasRenderingContext2D) => void;

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

const PAINTERS: { id: string; label: string; paint: Painter }[] = [
  {
    id: "aurora",
    label: "Aurora",
    paint: (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#0b1030");
      g.addColorStop(1, "#1b2a5a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      glow(ctx, 300, 200, 520, "rgba(64, 224, 180, 0.55)");
      glow(ctx, 900, 160, 480, "rgba(140, 90, 255, 0.5)");
      glow(ctx, 640, 620, 600, "rgba(11, 92, 255, 0.35)");
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    paint: (ctx) => {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#2e1a47");
      g.addColorStop(0.5, "#e8577e");
      g.addColorStop(1, "#ffb56b");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      glow(ctx, 900, 520, 260, "rgba(255, 236, 170, 0.9)");
      ctx.fillStyle = "rgba(40, 20, 60, 0.55)";
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, 560);
      ctx.quadraticCurveTo(320, 470, 640, 560);
      ctx.quadraticCurveTo(960, 640, W, 540);
      ctx.lineTo(W, H);
      ctx.fill();
    },
  },
  {
    id: "office",
    label: "Office",
    paint: (ctx) => {
      const wall = ctx.createLinearGradient(0, 0, W, H);
      wall.addColorStop(0, "#efe6da");
      wall.addColorStop(1, "#d9cbb8");
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#b99b7a"; // floor
      ctx.fillRect(0, 600, W, 120);
      ctx.fillStyle = "#8a6a4d"; // shelves
      for (const y of [220, 360]) ctx.fillRect(820, y, 360, 14);
      const books = ["#0b5cff", "#e8710a", "#12a150", "#9334e6", "#d93025"];
      books.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(840 + i * 34, 150, 26, 70);
        ctx.fillRect(1000 + i * 30, 300, 22, 60);
      });
      ctx.fillStyle = "#3f7d4b"; // plant
      ctx.beginPath();
      ctx.ellipse(170, 470, 90, 130, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c46a3c";
      ctx.fillRect(120, 540, 100, 70);
    },
  },
  {
    id: "zoom-blue",
    label: "Blue",
    paint: (ctx) => {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#0b5cff");
      g.addColorStop(1, "#7aa7ff");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      for (const [x, y, r] of [
        [1100, 120, 260],
        [200, 640, 320],
        [700, 80, 120],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
];

let cache: VirtualBackground[] | null = null;

export function builtInBackgrounds(): VirtualBackground[] {
  if (cache) return cache;
  cache = PAINTERS.map(({ id, label, paint }) => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    paint(c.getContext("2d")!);
    return { id, label, src: c.toDataURL("image/png") };
  });
  return cache;
}
