"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Dark style used inside the meeting room. */
  tone?: "light" | "dark";
}

export function Modal({ open, onClose, title, children, footer, className, tone = "light" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx(
          "flex max-h-[92vh] w-full animate-pop flex-col overflow-hidden rounded-t-2xl shadow-pop sm:max-w-md sm:rounded-2xl",
          tone === "dark" ? "bg-[#2b2b2b] text-room-text" : "bg-white text-ink",
          className,
        )}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h2 className="text-base font-bold">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className={clsx(
                "-mr-1 rounded-md p-1",
                tone === "dark" ? "text-room-text/70 hover:bg-white/10" : "text-muted hover:bg-surface",
              )}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="scroll-thin flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line/70 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
