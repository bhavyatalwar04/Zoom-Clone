import type { Feedback } from "@/lib/rtc/room-client";

/** Zoom's non-verbal feedback options. */
export const FEEDBACK: { value: Feedback; emoji: string; label: string }[] = [
  { value: "yes", emoji: "✅", label: "Yes" },
  { value: "no", emoji: "❌", label: "No" },
  { value: "slower", emoji: "⏪", label: "Slow down" },
  { value: "faster", emoji: "⏩", label: "Speed up" },
  { value: "away", emoji: "☕", label: "I'm away" },
];

export const feedbackEmoji = (value: Feedback | null) => FEEDBACK.find((f) => f.value === value)?.emoji ?? null;
