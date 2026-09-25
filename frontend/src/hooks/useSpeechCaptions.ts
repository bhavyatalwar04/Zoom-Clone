"use client";

import { useEffect, useRef } from "react";

// The Web Speech API is not in TypeScript's DOM lib yet; declare the small part we use.
interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: SpeechRecognitionResult };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechCaptionsSupported = () => getRecognitionCtor() !== null;

/**
 * Live captions of *my own* microphone using the browser's speech recognition (Chrome / Edge).
 * Each participant transcribes themselves, so every caption is attributed to the right speaker
 * and no audio ever has to be sent to our server.
 *
 * Runs only while `active` (captions on for the meeting AND my microphone unmuted).
 */
export function useSpeechCaptions(active: boolean, onResult: (text: string, final: boolean) => void) {
  const callback = useRef(onResult);
  callback.current = onResult;

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!active || !Ctor) return;

    let stopped = false;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript.trim();
        if (text) callback.current(text, result.isFinal);
      }
    };
    recognition.onerror = (event) => {
      // Permission problems will not fix themselves; anything else (e.g. "no-speech") is retried.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") stopped = true;
    };
    // Chrome ends recognition after a pause in speech; keep it running while captions are on.
    recognition.onend = () => {
      if (stopped) return;
      try {
        recognition.start();
      } catch {
        // already restarting
      }
    };

    try {
      recognition.start();
    } catch {
      return;
    }
    return () => {
      stopped = true;
      recognition.onend = null;
      recognition.stop();
    };
  }, [active]);
}
