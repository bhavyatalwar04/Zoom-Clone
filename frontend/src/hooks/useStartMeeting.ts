"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { Meeting } from "@/lib/types";
import { useSettings } from "./useSettings";

/** Path that opens a meeting as its host (Zoom's "start URL"). */
export function hostStartPath(meeting: Pick<Meeting, "code" | "passcode" | "start_token">): string {
  const params = new URLSearchParams();
  if (meeting.passcode) params.set("pwd", meeting.passcode);
  if (meeting.start_token) params.set("st", meeting.start_token);
  return `/j/${meeting.code}?${params}`;
}

/** Creates an instant meeting and takes the host straight into it. */
export function useStartInstantMeeting() {
  const router = useRouter();
  const toast = useToast();
  const [settings] = useSettings();
  const [starting, setStarting] = useState(false);

  const start = async (withVideo = settings.startWithVideo) => {
    setStarting(true);
    try {
      const meeting = await api.createInstant({ host_video_on: withVideo });
      router.push(`${hostStartPath(meeting)}&video=${withVideo ? 1 : 0}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to start the meeting.");
      setStarting(false);
    }
  };

  return { start, starting };
}
