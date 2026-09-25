import clsx from "clsx";

/** Wordmark in the style of the Zoom Workplace header (drawn with text, not the trademarked asset). */
export function ZoomLogo({ className, product = "Workplace" }: { className?: string; product?: string | null }) {
  return (
    <span className={clsx("inline-flex items-baseline gap-1.5 select-none", className)}>
      <span className="text-[26px] font-black leading-none tracking-[-0.06em] text-zoom-blue">zoom</span>
      {product && <span className="text-[15px] font-bold leading-none text-ink">{product}</span>}
    </span>
  );
}
