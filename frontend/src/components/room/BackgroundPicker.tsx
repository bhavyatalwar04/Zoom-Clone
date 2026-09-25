"use client";

import clsx from "clsx";
import { Ban, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { BackgroundEffect } from "@/lib/rtc/background-processor";
import { builtInBackgrounds, type VirtualBackground } from "@/lib/rtc/virtual-backgrounds";

interface BackgroundPickerProps {
  open: boolean;
  onClose: () => void;
  current: BackgroundEffect;
  loading: boolean;
  /** My (processed) camera, for the live preview. */
  preview: MediaStream | null;
  mirror: boolean;
  onSelect: (effect: BackgroundEffect) => void;
}

function effectKey(effect: BackgroundEffect) {
  return effect.kind === "image" ? `image:${effect.id}` : effect.kind;
}

/** Zoom's "Backgrounds & effects": none, blur, built-in images or your own picture. */
export function BackgroundPicker({ open, onClose, current, loading, preview, mirror, onSelect }: BackgroundPickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [custom, setCustom] = useState<VirtualBackground | null>(null);
  const images = useMemo(() => (open ? builtInBackgrounds() : []), [open]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = preview;
  }, [preview, open]);

  const pickFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = { id: "custom", label: file.name, src: String(reader.result) };
      setCustom(image);
      onSelect({ kind: "image", id: image.id, src: image.src });
    };
    reader.readAsDataURL(file);
  };

  const options: { key: string; label: string; effect: BackgroundEffect; thumb: React.ReactNode }[] = [
    { key: "none", label: "None", effect: { kind: "none" }, thumb: <Ban className="h-6 w-6 text-muted" /> },
    { key: "blur", label: "Blur", effect: { kind: "blur" }, thumb: <Sparkles className="h-6 w-6 text-zoom-blue" /> },
    ...[...images, ...(custom ? [custom] : [])].map((bg) => ({
      key: `image:${bg.id}`,
      label: bg.label,
      effect: { kind: "image" as const, id: bg.id, src: bg.src },
      // eslint-disable-next-line @next/next/no-img-element
      thumb: <img src={bg.src} alt="" className="h-full w-full object-cover" />,
    })),
  ];

  return (
    <Modal open={open} onClose={onClose} title="Backgrounds & effects" className="sm:max-w-lg">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-room">
        <video ref={videoRef} autoPlay playsInline muted className={clsx("h-full w-full object-cover", mirror && "mirror")} />
        {!preview && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Turn on your camera to preview</p>}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 text-sm text-white">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading background effects…
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Background">
        {options.map((o) => (
          <button
            key={o.key}
            role="radio"
            aria-checked={effectKey(current) === o.key}
            aria-label={o.label}
            title={o.label}
            onClick={() => onSelect(o.effect)}
            className={clsx(
              "flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-surface ring-2 transition",
              effectKey(current) === o.key ? "ring-zoom-blue" : "ring-transparent hover:ring-line",
            )}
          >
            {o.thumb}
          </button>
        ))}
        <label
          className="flex aspect-video cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-line text-muted hover:border-zoom-blue hover:text-zoom-blue"
          title="Add image"
        >
          <ImagePlus className="h-6 w-6" />
          <input type="file" accept="image/*" className="sr-only" aria-label="Add image" onChange={(e) => pickFile(e.target.files?.[0])} />
        </label>
      </div>
      <p className="mt-3 text-xs text-muted">Effects run on your device. Nothing about your background is sent to our server.</p>
    </Modal>
  );
}
