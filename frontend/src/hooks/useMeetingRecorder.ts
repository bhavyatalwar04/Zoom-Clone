"use client";

import { format } from "date-fns";
import { useCallback, useEffect, useRef, useState } from "react";
import { MeetingRecorder, type RecorderSource, downloadBlob } from "@/lib/recording/meeting-recorder";
import type { RoomClient } from "@/lib/rtc/room-client";

export type RecorderState = "idle" | "recording" | "paused";

interface Options {
  client: RoomClient;
  title: string;
  sources: RecorderSource[];
  audioTracks: MediaStreamTrack[];
  onError: (message: string) => void;
  onSaved: (filename: string) => void;
}

/** Local meeting recording: start / pause / resume / stop, elapsed time, and saving the file. */
export function useMeetingRecorder({ client, title, sources, audioTracks, onError, onSaved }: Options) {
  const [state, setState] = useState<RecorderState>("idle");
  // Elapsed time excluding pauses: finished segments + the running one.
  const [elapsed, setElapsed] = useState({ doneMs: 0, runningSince: null as number | null });
  const recorder = useRef<MeetingRecorder | null>(null);
  const latest = useRef({ title, onSaved });
  latest.current = { title, onSaved };

  useEffect(() => {
    recorder.current?.update(sources, audioTracks);
  }, [sources, audioTracks]);

  const start = useCallback(() => {
    if (!MeetingRecorder.isSupported()) return onError("Recording is not supported in this browser.");
    try {
      const rec = new MeetingRecorder();
      rec.update(sources, audioTracks);
      rec.start();
      recorder.current = rec;
    } catch {
      return onError("Could not start recording.");
    }
    client.setRecording(true);
    setElapsed({ doneMs: 0, runningSince: Date.now() });
    setState("recording");
  }, [client, sources, audioTracks, onError]);

  const pause = useCallback(() => {
    recorder.current?.pause();
    setElapsed((e) => ({ doneMs: e.doneMs + (e.runningSince ? Date.now() - e.runningSince : 0), runningSince: null }));
    setState("paused");
  }, []);

  const resume = useCallback(() => {
    recorder.current?.resume();
    setElapsed((e) => ({ ...e, runningSince: Date.now() }));
    setState("recording");
  }, []);

  const stop = useCallback(async () => {
    const rec = recorder.current;
    if (!rec) return;
    recorder.current = null;
    setState("idle");
    client.setRecording(false);
    const blob = await rec.stop();
    const filename = `${latest.current.title.replace(/[^\w-]+/g, "_")}_${format(new Date(), "yyyy-MM-dd_HHmm")}.webm`;
    downloadBlob(blob, filename);
    latest.current.onSaved(filename);
  }, [client]);

  // Leaving the meeting while recording still saves the file (Zoom converts it at the end too).
  useEffect(
    () => () => {
      const rec = recorder.current;
      if (!rec) return;
      void rec.stop().then((blob) => downloadBlob(blob, `${latest.current.title.replace(/[^\w-]+/g, "_")}.webm`));
    },
    [],
  );

  const elapsedMs = (now: number) => elapsed.doneMs + (elapsed.runningSince ? now - elapsed.runningSince : 0);
  return { state, start, pause, resume, stop, elapsedMs };
}
