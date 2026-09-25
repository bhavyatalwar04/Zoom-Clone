"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PermissionState = "idle" | "granted" | "denied";

/**
 * Camera / microphone preview for the pre-join screen.
 * The resulting stream is handed to the RoomClient on join (via `takeStream`) so the browser
 * does not prompt for permissions a second time.
 */
export function useLocalPreview(initial: { audio: boolean; video: boolean }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioOn, setAudioOn] = useState(initial.audio);
  const [videoOn, setVideoOn] = useState(initial.video);
  const [micState, setMicState] = useState<PermissionState>("idle");
  const [camState, setCamState] = useState<PermissionState>("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const handedOver = useRef(false);

  const publish = (next: MediaStream) => {
    streamRef.current = next;
    setStream(new MediaStream(next.getTracks()));
  };

  // Ask for the microphone once up front (muted state is applied via track.enabled).
  useEffect(() => {
    let cancelled = false;
    const base = new MediaStream();
    streamRef.current = base;
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        base.addTrack(s.getAudioTracks()[0]);
        setMicState("granted");
        publish(base);
      })
      .catch(() => !cancelled && setMicState("denied"));
    return () => {
      cancelled = true;
      if (!handedOver.current) streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Keep the audio track's enabled flag in sync with the mute toggle.
  useEffect(() => {
    stream?.getAudioTracks().forEach((t) => (t.enabled = audioOn));
  }, [audioOn, stream]);

  // Start / stop the camera as the video toggle changes.
  useEffect(() => {
    const current = streamRef.current;
    if (!current) return;
    if (!videoOn) {
      current.getVideoTracks().forEach((t) => {
        t.stop();
        current.removeTrack(t);
      });
      publish(current);
      return;
    }
    if (current.getVideoTracks().length) return;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 1280, height: 720 } })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        current.addTrack(s.getVideoTracks()[0]);
        setCamState("granted");
        publish(current);
      })
      .catch(() => {
        if (cancelled) return;
        setCamState("denied");
        setVideoOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [videoOn]);

  /** Transfer ownership of the tracks to the caller (they will no longer be stopped on unmount). */
  const takeStream = useCallback(() => {
    handedOver.current = true;
    return streamRef.current;
  }, []);

  return { stream, audioOn, setAudioOn, videoOn, setVideoOn, micState, camState, takeStream };
}
