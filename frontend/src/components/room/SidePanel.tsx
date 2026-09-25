import { X } from "lucide-react";

/** The white panel docked to the right of the meeting (full screen on mobile). */
export function SidePanel({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <aside className="fixed inset-0 z-30 flex flex-col bg-white text-ink md:static md:inset-auto md:z-auto md:w-[320px] md:shrink-0 md:rounded-l-lg">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="text-sm font-bold">{title}</h2>
        <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink" aria-label="Close panel">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pt-3">{children}</div>
      {footer && <div className="shrink-0 border-t border-line p-3">{footer}</div>}
    </aside>
  );
}
