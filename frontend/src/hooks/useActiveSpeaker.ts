"use client";

import { useEffect, useRef, useState } from "react";

const SAMPLE_MS = 250;
const SPEAKING_LEVEL = 0.035; // RMS threshold on a 0..1 scale
const HOLD_MS = 1200; // keep the highlight briefly after someone stops talking

interface Source {
  node: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  trackId: string;
}

/**
 * Detects who is talking by measuring the loudness of each audio track (Web Audio API).
 * Returns the id of the loudest speaker above a threshold, or null.
 */
export function useActiveSpeaker(tracks: Map<number, MediaStreamTrack | null>): number | null {
  const [speaker, setSpeaker] = useState<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sources = useRef(new Map<number, Source>());
  const lastHeard = useRef<{ id: number; at: number } | null>(null);

  // Attach an analyser to every live audio track, detach the ones that went away.
  useEffect(() => {
    if (typeof window === "undefined" || !("AudioContext" in window)) return;
    const ctx = (ctxRef.current ??= new AudioContext());
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);

    for (const [id, source] of sources.current) {
      const track = tracks.get(id);
      if (!track || track.id !== source.trackId || track.readyState === "ended") {
        source.node.disconnect();
        sources.current.delete(id);
      }
    }
    for (const [id, track] of tracks) {
      if (!track || track.readyState === "ended" || sources.current.has(id)) continue;
      const node = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      node.connect(analyser); // analysed only, never routed to the speakers
      sources.current.set(id, { node, analyser, trackId: track.id });
    }
  }, [tracks]);

  useEffect(() => {
    const buffer = new Float32Array(512);
    const timer = setInterval(() => {
      let loudest: { id: number; level: number } | null = null;
      for (const [id, { analyser }] of sources.current) {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (const v of buffer) sum += v * v;
        const level = Math.sqrt(sum / buffer.length);
        if (level > SPEAKING_LEVEL && (!loudest || level > loudest.level)) loudest = { id, level };
      }
      const now = Date.now();
      if (loudest) lastHeard.current = { id: loudest.id, at: now };
      const current = lastHeard.current && now - lastHeard.current.at < HOLD_MS ? lastHeard.current.id : null;
      setSpeaker((prev) => (prev === current ? prev : current));
    }, SAMPLE_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const map = sources.current;
    return () => {
      map.forEach((s) => s.node.disconnect());
      map.clear();
      void ctxRef.current?.close().catch(() => undefined);
    };
  }, []);

  return speaker;
}
