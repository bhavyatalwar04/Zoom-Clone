import clsx from "clsx";
import { colorForName, initials } from "@/lib/format";

interface AvatarProps {
  name: string;
  color?: string | null;
  size?: number;
  className?: string;
  /** Zoom uses rounded squares for people in meetings and circles in the app chrome. */
  shape?: "circle" | "square";
  status?: "available" | "away" | "busy" | null;
}

const STATUS_COLORS = { available: "bg-zoom-green", away: "bg-amber-400", busy: "bg-zoom-red" };

export function Avatar({ name, color, size = 32, className, shape = "circle", status }: AvatarProps) {
  return (
    <span className={clsx("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      <span
        className={clsx(
          "flex h-full w-full items-center justify-center font-bold text-white",
          shape === "circle" ? "rounded-full" : "rounded-[22%]",
        )}
        style={{ backgroundColor: color ?? colorForName(name), fontSize: Math.max(10, size * 0.38) }}
      >
        {initials(name)}
      </span>
      {status && (
        <span
          className={clsx(
            "absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-white",
            STATUS_COLORS[status],
          )}
          style={{ width: Math.max(8, size * 0.3), height: Math.max(8, size * 0.3) }}
        />
      )}
    </span>
  );
}
