"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /** Element(s) that toggle the popover, ignored by the outside-click handler. */
  anchorRef?: React.RefObject<HTMLElement | null>;
}

/** An absolutely positioned floating panel that closes on outside click / Escape. */
export function Popover({ open, onClose, children, className, anchorRef }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchorRef?.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return (
    <div ref={ref} className={clsx("absolute z-40 animate-pop rounded-xl shadow-pop", className)}>
      {children}
    </div>
  );
}

interface MenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  danger?: boolean;
  tone?: "light" | "dark";
}

export function MenuItem({ icon, danger, tone = "light", className, children, ...rest }: MenuItemProps) {
  return (
    <button
      className={clsx(
        "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm disabled:opacity-50",
        tone === "light" ? "hover:bg-surface" : "hover:bg-white/10",
        danger ? "text-zoom-red" : tone === "light" ? "text-ink" : "text-room-text",
        className,
      )}
      {...rest}
    >
      {icon && <span className="flex h-4 w-4 items-center justify-center">{icon}</span>}
      {children}
    </button>
  );
}
