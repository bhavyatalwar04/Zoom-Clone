import { addMinutes, format, isToday, isTomorrow, isYesterday } from "date-fns";

/** "84529310472" -> "845 2931 0472" (Zoom's grouping). */
export function formatMeetingId(code: string): string {
  const digits = code.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return digits;
}

/** Extracts the digits of a Meeting ID from "845 2931 0472", "845-2931-0472" or a full invite link. */
export function parseMeetingInput(input: string): { code: string; passcode: string | null } {
  const value = input.trim();
  const linkMatch = value.match(/\/j\/(\d+)(?:\?[^#]*?pwd=([^&#\s]+))?/);
  if (linkMatch) return { code: linkMatch[1], passcode: linkMatch[2] ? decodeURIComponent(linkMatch[2]) : null };
  return { code: value.replace(/\D/g, ""), passcode: null };
}

export const formatTime = (iso: string | Date) => format(new Date(iso), "h:mm a");

export function formatTimeRange(startIso: string, durationMinutes: number): string {
  const start = new Date(startIso);
  return `${format(start, "h:mm a")} - ${format(addMinutes(start, durationMinutes), "h:mm a")}`;
}

/** "Today", "Tomorrow", "Yesterday" or "Mon, Sep 28". */
export function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEE, MMM d");
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function minutesBetween(startIso: string, endIso: string): number {
  return Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable colour for people without a stored avatar colour (e.g. meeting guests). */
export function colorForName(name: string): string {
  const palette = ["#0B5CFF", "#E8710A", "#12A150", "#9334E6", "#D93025", "#0E7490", "#B45309", "#C026D3"];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

/** Wall-clock date ("2026-09-26") and time ("10:30") of an instant in a given IANA time zone. */
export function toZonedParts(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** "(GMT+05:30) Asia/Kolkata" style label for a time zone. */
export function timeZoneLabel(timeZone: string): string {
  try {
    const offset =
      new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    return `(${offset === "GMT" ? "GMT+00:00" : offset}) ${timeZone.replace(/_/g, " ")}`;
  } catch {
    return timeZone;
  }
}
