"use client";

import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { MenuItem, Popover } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { useRefreshMeetings } from "@/hooks/useMeetings";
import { api } from "@/lib/api";
import { buildInvitation, copyToClipboard } from "@/lib/invitation";
import type { Meeting } from "@/lib/types";

export async function copyInvitation(meeting: Meeting, toast: ReturnType<typeof useToast>) {
  const ok = await copyToClipboard(buildInvitation({ ...meeting, hostName: meeting.host.full_name }));
  if (ok) toast.success("Meeting invitation copied to clipboard");
  else toast.error("Couldn't copy the invitation");
}

/** Delete confirmation used by both the menu and the meeting details pane. */
export function useDeleteMeeting(onDeleted?: () => void) {
  const [target, setTarget] = useState<Meeting | null>(null);
  const [deleting, setDeleting] = useState(false);
  const refresh = useRefreshMeetings();
  const toast = useToast();

  const confirm = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      await api.remove(target.code);
      await refresh();
      toast.success("Meeting deleted");
      onDeleted?.();
      setTarget(null);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const dialog = (
    <Modal
      open={!!target}
      onClose={() => setTarget(null)}
      title="Delete meeting?"
      footer={
        <>
          <Button variant="secondary" onClick={() => setTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" loading={deleting} onClick={confirm}>
            Delete
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">
        &ldquo;{target?.title}&rdquo; will be deleted and its invite link will stop working. This can&apos;t be undone.
      </p>
    </Modal>
  );

  return { requestDelete: setTarget, dialog };
}

interface MeetingActionsMenuProps {
  meeting: Meeting;
  onEdit: (meeting: Meeting) => void;
  onDelete: (meeting: Meeting) => void;
}

export function MeetingActionsMenu({ meeting, onEdit, onDelete }: MeetingActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const toast = useToast();
  const canManage = meeting.is_host && meeting.meeting_type === "scheduled";

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative">
      <button
        ref={anchor}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink"
        aria-label="More options"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} className="right-0 top-8 w-48 bg-white p-1">
        <MenuItem icon={<Copy className="h-4 w-4" />} onClick={run(() => copyInvitation(meeting, toast))}>
          Copy invitation
        </MenuItem>
        {canManage && (
          <>
            <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={run(() => onEdit(meeting))}>
              Edit
            </MenuItem>
            <MenuItem danger icon={<Trash2 className="h-4 w-4" />} onClick={run(() => onDelete(meeting))}>
              Delete
            </MenuItem>
          </>
        )}
      </Popover>
    </div>
  );
}
