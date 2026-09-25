"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RoomClient } from "@/lib/rtc/room-client";
import { SPEAKER_SAMPLE_MS } from "./useActiveSpeaker";

const REPORT_INTERVAL_MS = 5000;

/**
 * Measures how long I speak and reports it to the server in small increments, which the
 * post-meeting insights add up. Returns the `onSample` callback for `useActiveSpeaker`.
 * (A muted microphone sends silence, so muted time is never counted.)
 */
export function useTalkTime(client: RoomClient, selfId: number | null) {
  const pendingMs = useRef(0);

  const onSample = useCallback(
    (speakingIds: number[]) => {
      if (selfId !== null && speakingIds.includes(selfId)) pendingMs.current += SPEAKER_SAMPLE_MS;
    },
    [selfId],
  );

  const flush = useCallback(() => {
    client.reportTalkTime(pendingMs.current);
    pendingMs.current = 0;
  }, [client]);

  useEffect(() => {
    const id = setInterval(flush, REPORT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [flush]);

  return { onSample, flush };
}
