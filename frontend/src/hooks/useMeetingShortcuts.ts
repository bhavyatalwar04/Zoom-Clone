"use client";

import { useEffect, useRef } from "react";

export type ShortcutAction =
  | "toggleAudio"
  | "toggleVideo"
  | "toggleShare"
  | "toggleChat"
  | "toggleParticipants"
  | "toggleHand"
  | "toggleCaptions"
  | "leave";

/** Zoom's desktop shortcuts. Matched on `event.code`, so they work on any keyboard layout. */
export const SHORTCUTS: { code: string; keys: string; action: ShortcutAction; label: string }[] = [
  { code: "KeyA", keys: "Alt + A", action: "toggleAudio", label: "Mute / unmute my audio" },
  { code: "KeyV", keys: "Alt + V", action: "toggleVideo", label: "Start / stop my video" },
  { code: "KeyS", keys: "Alt + S", action: "toggleShare", label: "Start / stop screen share" },
  { code: "KeyH", keys: "Alt + H", action: "toggleChat", label: "Show / hide the chat panel" },
  { code: "KeyU", keys: "Alt + U", action: "toggleParticipants", label: "Show / hide the participants panel" },
  { code: "KeyY", keys: "Alt + Y", action: "toggleHand", label: "Raise / lower my hand" },
  { code: "KeyC", keys: "Alt + C", action: "toggleCaptions", label: "Show / hide captions" },
  { code: "KeyQ", keys: "Alt + Q", action: "leave", label: "Leave or end the meeting" },
];

export const PUSH_TO_TALK = { keys: "Hold Space", label: "Temporarily unmute while muted (push to talk)" };

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

interface Options {
  handlers: Record<ShortcutAction, () => void>;
  /** Push to talk: called with true on Space down (while muted) and false on release. */
  onPushToTalk: (pressed: boolean) => void;
  muted: boolean;
}

export function useMeetingShortcuts({ handlers, onPushToTalk, muted }: Options) {
  // Refs so the listeners are attached once but always see the latest callbacks / state.
  const latest = useRef({ handlers, onPushToTalk, muted });
  latest.current = { handlers, onPushToTalk, muted };
  const pushToTalkActive = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { handlers, onPushToTalk, muted } = latest.current;
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const shortcut = SHORTCUTS.find((s) => s.code === e.code);
        if (shortcut) {
          e.preventDefault();
          handlers[shortcut.action]();
        }
        return;
      }
      if (e.code === "Space" && !e.repeat && muted && !isTyping(e.target) && !pushToTalkActive.current) {
        e.preventDefault();
        pushToTalkActive.current = true;
        onPushToTalk(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && pushToTalkActive.current) {
        pushToTalkActive.current = false;
        latest.current.onPushToTalk(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}
