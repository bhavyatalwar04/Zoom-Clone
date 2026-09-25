"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pops the featured video (active speaker / shared screen) out into a floating
 * picture-in-picture window, so the meeting stays visible while you work in other tabs.
 *
 * - Manual: `enter()` from a click (browsers require a user gesture).
 * - Automatic: registers the Media Session "enterpictureinpicture" action, which recent Chrome
 *   versions invoke for video-call pages when the user switches tabs.
 */
export function usePictureInPicture(stream: MediaStream | null) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [active, setActive] = useState(false);
  const supported = typeof document !== "undefined" && "pictureInPictureEnabled" in document && document.pictureInPictureEnabled;

  // A detached <video> element keeps playing the featured stream for the PiP window.
  useEffect(() => {
    if (!supported) return;
    const video = document.createElement("video");
    video.muted = true; // audio is already played by the meeting page
    video.playsInline = true;
    video.addEventListener("enterpictureinpicture", () => setActive(true));
    video.addEventListener("leavepictureinpicture", () => setActive(false));
    videoRef.current = video;
    return () => {
      if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => undefined);
      video.srcObject = null;
      videoRef.current = null;
    };
  }, [supported]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
  }, [stream]);

  const enter = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.srcObject) return false;
    try {
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise((resolve) => video.addEventListener("loadedmetadata", resolve, { once: true }));
      }
      await video.requestPictureInPicture();
      return true;
    } catch {
      return false;
    }
  }, []);

  const exit = useCallback(() => {
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!supported || !("mediaSession" in navigator)) return;
    try {
      // Not in every TS lib / browser yet, hence the cast and try/catch.
      navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, () => void enter());
    } catch {
      return;
    }
    return () => {
      try {
        navigator.mediaSession.setActionHandler("enterpictureinpicture" as MediaSessionAction, null);
      } catch {
        // unsupported
      }
    };
  }, [supported, enter]);

  return { supported, active, enter, exit };
}
