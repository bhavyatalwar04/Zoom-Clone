import type { LiveCaption } from "@/lib/rtc/room-client";

/** Zoom-style caption lines at the bottom of the video area. */
export function CaptionsOverlay({ captions, selfId }: { captions: LiveCaption[]; selfId: number }) {
  if (!captions.length) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-1 px-4" aria-live="polite">
      {captions.map((c) => (
        <p key={c.peerId} className="max-w-3xl rounded-md bg-black/75 px-3 py-1.5 text-center text-[15px] leading-snug text-white">
          <span className="font-bold text-white/70">{c.peerId === selfId ? "You" : c.name}: </span>
          {c.text}
        </p>
      ))}
    </div>
  );
}
