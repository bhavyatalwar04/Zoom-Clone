"use client";

import { useState } from "react";
import { ActionTiles } from "@/components/home/ActionTiles";
import { CalendarCard } from "@/components/home/CalendarCard";
import { RecentMeetings } from "@/components/home/RecentMeetings";
import { JoinMeetingModal } from "@/components/meetings/JoinMeetingModal";
import { useDeleteMeeting } from "@/components/meetings/MeetingActionsMenu";
import { ScheduleMeetingModal } from "@/components/meetings/ScheduleMeetingModal";
import type { Meeting } from "@/lib/types";

type Dialog = { kind: "join" } | { kind: "share" } | { kind: "schedule"; meeting?: Meeting } | null;

export default function HomePage() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const { requestDelete, dialog: deleteDialog } = useDeleteMeeting();
  const close = () => setDialog(null);

  return (
    <div className="flex flex-1 justify-center bg-white px-4 py-8 sm:py-12">
      <div className="grid w-full max-w-5xl items-start gap-10 lg:grid-cols-[1fr_minmax(0,460px)] lg:gap-14">
        <div className="flex flex-col items-center gap-10 lg:pt-10">
          <ActionTiles
            onJoin={() => setDialog({ kind: "join" })}
            onSchedule={() => setDialog({ kind: "schedule" })}
            onShare={() => setDialog({ kind: "share" })}
          />
          <div className="w-full max-w-md">
            <RecentMeetings />
          </div>
        </div>

        <CalendarCard
          onSchedule={() => setDialog({ kind: "schedule" })}
          onEdit={(meeting) => setDialog({ kind: "schedule", meeting })}
          onDelete={requestDelete}
        />
      </div>

      <JoinMeetingModal open={dialog?.kind === "join" || dialog?.kind === "share"} mode={dialog?.kind === "share" ? "share" : "join"} onClose={close} />
      <ScheduleMeetingModal
        open={dialog?.kind === "schedule"}
        meeting={dialog?.kind === "schedule" ? dialog.meeting : null}
        onClose={close}
      />
      {deleteDialog}
    </div>
  );
}
