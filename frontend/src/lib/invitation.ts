import { format } from "date-fns";
import { describeRecurrence, formatMeetingId } from "./format";
import type { Recurrence } from "./types";

interface InvitationSource {
  title: string;
  code: string;
  passcode: string | null;
  join_url: string;
  scheduled_start?: string | null;
  hostName: string;
  recurrence?: Recurrence | null;
  series_start?: string | null;
}

/** Plain-text invitation in the same shape as Zoom's "Copy Invitation". */
export function buildInvitation(m: InvitationSource): string {
  const lines = [
    `${m.hostName} is inviting you to a ${m.scheduled_start ? "scheduled " : ""}Zoom meeting.`,
    "",
    `Topic: ${m.title}`,
  ];
  if (m.scheduled_start) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    lines.push(`Time: ${format(new Date(m.scheduled_start), "MMM d, yyyy hh:mm a")} ${tz}`);
    if (m.recurrence) lines.push(`        ${describeRecurrence(m.recurrence, m.series_start ?? m.scheduled_start)}`);
  }
  lines.push("", "Join Zoom Meeting", m.join_url, "", `Meeting ID: ${formatMeetingId(m.code)}`);
  if (m.passcode) lines.push(`Passcode: ${m.passcode}`);
  return lines.join("\n");
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts (e.g. LAN IP over http).
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}
