"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";

interface RenameModalProps {
  /** The person being renamed, or null when the dialog is closed. */
  target: { id: number; name: string; isSelf: boolean } | null;
  onClose: () => void;
  onRename: (name: string) => void;
}

export function RenameModal({ target, onClose, onRename }: RenameModalProps) {
  const [name, setName] = useState("");
  useEffect(() => setName(target?.name ?? ""), [target]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    onRename(clean);
    onClose();
  };

  return (
    <Modal open={!!target} onClose={onClose} title={target?.isSelf ? "Rename" : `Rename ${target?.name ?? ""}`}>
      <form onSubmit={submit} className="space-y-4 pt-1">
        <Input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="New name" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()}>
            Rename
          </Button>
        </div>
      </form>
    </Modal>
  );
}
