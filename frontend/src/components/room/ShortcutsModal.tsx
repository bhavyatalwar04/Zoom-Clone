import { Modal } from "@/components/ui/Modal";
import { PUSH_TO_TALK, SHORTCUTS } from "@/hooks/useMeetingShortcuts";

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows = [...SHORTCUTS.map(({ keys, label }) => ({ keys, label })), PUSH_TO_TALK];
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
      <ul className="divide-y divide-line">
        {rows.map(({ keys, label }) => (
          <li key={keys} className="flex items-center justify-between gap-4 py-2 text-sm">
            <span className="text-ink-2">{label}</span>
            <kbd className="shrink-0 rounded-md bg-surface px-2 py-0.5 font-sans text-xs font-bold text-ink ring-1 ring-line">
              {keys}
            </kbd>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">On macOS use the Option key instead of Alt.</p>
    </Modal>
  );
}
