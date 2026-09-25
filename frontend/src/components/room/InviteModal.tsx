"use client";

import { Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatMeetingId } from "@/lib/format";
import { buildInvitation, copyToClipboard } from "@/lib/invitation";

export interface InviteDetails {
  title: string;
  code: string;
  passcode: string | null;
  join_url: string;
  hostName: string;
  scheduled_start: string | null;
}

export function InviteModal({ open, onClose, details }: { open: boolean; onClose: () => void; details: InviteDetails }) {
  const toast = useToast();

  const copy = async (text: string, what: string) => {
    if (await copyToClipboard(text)) toast.success(`${what} copied to clipboard`);
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite people to join meeting">
      <p className="text-sm text-ink-2">{details.title}</p>
      <div className="mt-3 space-y-1 rounded-lg bg-surface p-3 text-sm">
        <p>
          <span className="text-muted">Meeting ID:</span> {formatMeetingId(details.code)}
        </p>
        {details.passcode && (
          <p>
            <span className="text-muted">Passcode:</span> {details.passcode}
          </p>
        )}
        <p className="truncate text-zoom-blue">{details.join_url}</p>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => copy(details.join_url, "Invite link")}>
          <Link2 className="h-4 w-4" /> Copy Invite Link
        </Button>
        <Button className="flex-1" onClick={() => copy(buildInvitation(details), "Invitation")}>
          <Copy className="h-4 w-4" /> Copy Invitation
        </Button>
      </div>
    </Modal>
  );
}
