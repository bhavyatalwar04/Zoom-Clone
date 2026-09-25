"use client";

import { addDays, addMinutes, format, setMinutes, startOfHour } from "date-fns";
import { CalendarCheck2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldError, FieldLabel, Input, Select, inputClass } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useMe, useRefreshMeetings } from "@/hooks/useMeetings";
import { api } from "@/lib/api";
import { describeRecurrence, formatDayLabel, formatMeetingId, formatTimeRange, timeZoneLabel, toZonedParts } from "@/lib/format";
import { buildInvitation, copyToClipboard } from "@/lib/invitation";
import type { Meeting, RecurrenceType, ScheduleMeetingInput } from "@/lib/types";
import { InviteeInput } from "./InviteeInput";

interface ScheduleMeetingModalProps {
  open: boolean;
  onClose: () => void;
  /** When given, the dialog edits this meeting instead of creating a new one. */
  meeting?: Meeting | null;
  onSaved?: (meeting: Meeting) => void;
}

interface FormState {
  title: string;
  description: string;
  date: string; // yyyy-MM-dd
  time: string; // HH:mm
  hours: number;
  minutes: number;
  timezone: string;
  invitees: string[];
  requirePasscode: boolean;
  passcode: string;
  hostVideo: boolean;
  participantVideo: boolean;
  joinBeforeHost: boolean;
  muteOnEntry: boolean;
  waitingRoom: boolean;
  recurring: boolean;
  recurrence: RecurrenceType;
  interval: number;
  endMode: "count" | "date";
  count: number;
  endDate: string; // yyyy-MM-dd
}

const MAX_INTERVAL: Record<RecurrenceType, number> = { daily: 15, weekly: 12, monthly: 3 };
const UNIT: Record<RecurrenceType, string> = { daily: "day", weekly: "week", monthly: "month" };

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Every 15 minutes of the day as ["HH:mm", "h:mm a"]. */
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const d = setMinutes(new Date(2000, 0, 1, 0, 0), i * 15);
  return [format(d, "HH:mm"), format(d, "h:mm a")] as const;
});

const defaultTopic = (hostName: string) => `${hostName}'s Zoom Meeting`;

function emptyForm(hostName: string | undefined): FormState {
  // Next half hour, like Zoom's default.
  const now = new Date();
  const start = now.getMinutes() < 30 ? setMinutes(startOfHour(now), 30) : addMinutes(startOfHour(now), 60);
  return {
    title: hostName ? defaultTopic(hostName) : "",
    description: "",
    date: format(start, "yyyy-MM-dd"),
    time: format(start, "HH:mm"),
    hours: 1,
    minutes: 0,
    timezone: browserTimeZone(),
    invitees: [],
    requirePasscode: true,
    passcode: "",
    hostVideo: true,
    participantVideo: true,
    joinBeforeHost: false,
    muteOnEntry: false,
    waitingRoom: false,
    recurring: false,
    recurrence: "weekly",
    interval: 1,
    endMode: "count",
    count: 7,
    endDate: format(addDays(start, 30), "yyyy-MM-dd"),
  };
}

function formFromMeeting(m: Meeting): FormState {
  // Recurring meetings are edited as a series, from their first occurrence.
  const first = m.series_start ?? m.scheduled_start!;
  const { date, time } = toZonedParts(first, m.timezone);
  const r = m.recurrence;
  return {
    title: m.title,
    description: m.description ?? "",
    date,
    time,
    hours: Math.floor(m.duration_minutes / 60),
    minutes: m.duration_minutes % 60,
    timezone: m.timezone,
    invitees: m.invitees,
    requirePasscode: !!m.passcode,
    passcode: m.passcode ?? "",
    hostVideo: m.host_video_on,
    participantVideo: m.participant_video_on,
    joinBeforeHost: m.join_before_host,
    muteOnEntry: m.mute_on_entry,
    waitingRoom: m.waiting_room,
    recurring: !!r,
    recurrence: r?.type ?? "weekly",
    interval: r?.interval ?? 1,
    endMode: r?.until ? "date" : "count",
    count: r?.count ?? 7,
    endDate: r?.until ? toZonedParts(r.until, m.timezone).date : format(addDays(new Date(first), 30), "yyyy-MM-dd"),
  };
}

function toPayload(f: FormState): ScheduleMeetingInput {
  return {
    title: f.title.trim(),
    description: f.description.trim() || null,
    start_time: `${f.date}T${f.time}:00`,
    timezone: f.timezone,
    duration_minutes: f.hours * 60 + f.minutes,
    invitees: f.invitees,
    require_passcode: f.requirePasscode,
    passcode: f.requirePasscode ? f.passcode.trim() || null : null,
    host_video_on: f.hostVideo,
    participant_video_on: f.participantVideo,
    join_before_host: f.joinBeforeHost,
    mute_on_entry: f.muteOnEntry,
    waiting_room: f.waitingRoom,
    recurrence: f.recurring ? f.recurrence : null,
    recurrence_interval: f.recurring ? f.interval : 1,
    recurrence_count: f.recurring && f.endMode === "count" ? f.count : null,
    recurrence_end_date: f.recurring && f.endMode === "date" ? f.endDate : null,
  };
}

function validate(f: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!f.title.trim()) errors.title = "Please enter a topic.";
  if (!f.date) errors.date = "Please choose a date.";
  if (f.hours * 60 + f.minutes < 15) errors.duration = "Meetings must be at least 15 minutes long.";
  if (f.requirePasscode && f.passcode && !/^[A-Za-z0-9@_*-]{1,10}$/.test(f.passcode))
    errors.passcode = "Up to 10 characters: letters, numbers and @ - _ *";
  if (f.recurring && f.endMode === "date" && (!f.endDate || f.endDate < f.date))
    errors.recurrence = "The end date must be on or after the first meeting.";
  return errors;
}

export function ScheduleMeetingModal({ open, onClose, meeting, onSaved }: ScheduleMeetingModalProps) {
  const { data: me } = useMe();
  const refresh = useRefreshMeetings();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(() => emptyForm(undefined));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Meeting | null>(null);
  const editing = !!meeting;

  useEffect(() => {
    if (!open) return;
    setForm(meeting ? formFromMeeting(meeting) : emptyForm(me?.full_name));
    setErrors({});
    setServerError(null);
    setSaved(null);
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meeting]);

  // The dialog can open before the current user has loaded; fill in the default topic then.
  useEffect(() => {
    if (open && !meeting && me) setForm((f) => (f.title ? f : { ...f, title: defaultTopic(me.full_name) }));
  }, [open, meeting, me]);

  const timeZones = useMemo(() => {
    const zones = new Set(Intl.supportedValuesOf?.("timeZone") ?? []);
    zones.add(browserTimeZone());
    zones.add(form.timezone);
    zones.add("UTC");
    return [...zones].map((z) => ({ value: z, label: timeZoneLabel(z) })).sort((a, b) => a.label.localeCompare(b.label));
    // Computing ~400 labels is not free; only recompute when a new zone must be included.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setSaving(true);
    setServerError(null);
    try {
      const payload = toPayload(form);
      const result = editing ? await api.update(meeting!.code, payload) : await api.schedule(payload);
      await refresh();
      onSaved?.(result);
      if (editing) {
        toast.success("Meeting updated");
        onClose();
      } else {
        setSaved(result);
      }
    } catch (err) {
      setServerError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <Modal open={open} onClose={onClose} title="">
        <div className="flex flex-col items-center pb-2 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zoom-blue-soft">
            <CalendarCheck2 className="h-6 w-6 text-zoom-blue" />
          </div>
          <h3 className="text-lg font-bold">Meeting scheduled</h3>
          <p className="mt-1 text-sm text-ink">{saved.title}</p>
          <p className="text-sm text-muted">
            {formatDayLabel(saved.scheduled_start!)}, {formatTimeRange(saved.scheduled_start!, saved.duration_minutes)}
          </p>
          <div className="mt-4 w-full rounded-lg bg-surface p-3 text-left text-sm">
            <p>
              <span className="text-muted">Meeting ID:</span> {formatMeetingId(saved.code)}
            </p>
            {saved.passcode && (
              <p>
                <span className="text-muted">Passcode:</span> {saved.passcode}
              </p>
            )}
            <p className="mt-1 truncate text-zoom-blue">{saved.join_url}</p>
          </div>
          <div className="mt-5 flex w-full gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={async () => {
                await copyToClipboard(buildInvitation({ ...saved, hostName: saved.host.full_name }));
                toast.success("Invitation copied to clipboard");
              }}
            >
              Copy invitation
            </Button>
            <Button className="flex-1" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit meeting" : "Schedule meeting"}
      className="sm:max-w-xl"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="schedule-form" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="schedule-form" onSubmit={submit} className="space-y-5 pt-2">
        <div>
          <FieldLabel htmlFor="topic">Topic</FieldLabel>
          <Input id="topic" value={form.title} maxLength={200} onChange={(e) => set("title", e.target.value)} invalid={!!errors.title} />
          <FieldError>{errors.title}</FieldError>
        </div>

        <div>
          <FieldLabel htmlFor="description">Description (optional)</FieldLabel>
          <textarea
            id="description"
            rows={2}
            maxLength={2000}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className={`${inputClass} h-auto resize-none py-2`}
            placeholder="Enter a meeting description"
          />
        </div>

        <div>
          <FieldLabel>When</FieldLabel>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input
              type="date"
              value={form.date}
              min={editing ? undefined : format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => set("date", e.target.value)}
              invalid={!!errors.date}
              aria-label="Date"
            />
            <Select value={form.time} onChange={(e) => set("time", e.target.value)} aria-label="Time" className="w-32">
              {!TIME_OPTIONS.some(([v]) => v === form.time) && <option value={form.time}>{form.time}</option>}
              {TIME_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <FieldError>{errors.date}</FieldError>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>Duration</FieldLabel>
            <div className="flex items-center gap-2">
              <Select value={form.hours} onChange={(e) => set("hours", Number(e.target.value))} aria-label="Hours">
                {Array.from({ length: 25 }, (_, h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
              <span className="text-sm text-muted">hr</span>
              <Select value={form.minutes} onChange={(e) => set("minutes", Number(e.target.value))} aria-label="Minutes">
                {[0, 15, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
              <span className="text-sm text-muted">min</span>
            </div>
            <FieldError>{errors.duration}</FieldError>
          </div>
          <div>
            <FieldLabel htmlFor="tz">Time zone</FieldLabel>
            <Select id="tz" value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {timeZones.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <Checkbox checked={form.recurring} onChange={(v) => set("recurring", v)} label="Recurring meeting" />
          {form.recurring && (
            <div className="grid gap-3 rounded-lg bg-surface p-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="recurrence">Recurrence</FieldLabel>
                <Select
                  id="recurrence"
                  value={form.recurrence}
                  onChange={(e) => {
                    const next = e.target.value as RecurrenceType;
                    setForm((f) => ({ ...f, recurrence: next, interval: Math.min(f.interval, MAX_INTERVAL[next]) }));
                  }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="interval">Repeat every</FieldLabel>
                <div className="flex items-center gap-2">
                  <Select id="interval" value={form.interval} onChange={(e) => set("interval", Number(e.target.value))} className="w-20">
                    {Array.from({ length: MAX_INTERVAL[form.recurrence] }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                  </Select>
                  <span className="text-sm text-muted">
                    {UNIT[form.recurrence]}
                    {form.interval > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <fieldset className="space-y-2 sm:col-span-2">
                <legend className="mb-1.5 text-[13px] font-bold text-ink-2">End</legend>
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="radio" className="accent-zoom-blue" checked={form.endMode === "count"} onChange={() => set("endMode", "count")} />
                  After
                  <Select
                    value={form.count}
                    onChange={(e) => setForm((f) => ({ ...f, count: Number(e.target.value), endMode: "count" }))}
                    aria-label="Number of occurrences"
                    className="h-8 w-20"
                  >
                    {Array.from({ length: 49 }, (_, i) => (
                      <option key={i + 2} value={i + 2}>
                        {i + 2}
                      </option>
                    ))}
                  </Select>
                  occurrences
                </label>
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="radio" className="accent-zoom-blue" checked={form.endMode === "date"} onChange={() => set("endMode", "date")} />
                  By
                  <Input
                    type="date"
                    value={form.endDate}
                    min={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value, endMode: "date" }))}
                    aria-label="Recurrence end date"
                    className="h-8 w-44"
                  />
                </label>
                <FieldError>{errors.recurrence}</FieldError>
              </fieldset>
              <p className="text-xs text-muted sm:col-span-2">
                {describeRecurrence(
                  {
                    type: form.recurrence,
                    interval: form.interval,
                    count: form.endMode === "count" ? form.count : null,
                    until: form.endMode === "date" && form.endDate ? `${form.endDate}T12:00:00` : null,
                  },
                  `${form.date}T${form.time}:00`,
                )}
              </p>
            </div>
          )}
        </div>

        <div>
          <FieldLabel>Attendees</FieldLabel>
          <InviteeInput value={form.invitees} onChange={(v) => set("invitees", v)} />
        </div>

        <div>
          <FieldLabel>Meeting ID</FieldLabel>
          <p className="text-sm text-ink-2">
            {editing ? formatMeetingId(meeting!.code) : "Generate automatically"}
          </p>
        </div>

        <div className="space-y-2.5">
          <FieldLabel>Security</FieldLabel>
          <div className="flex flex-wrap items-center gap-3">
            <Checkbox checked={form.requirePasscode} onChange={(v) => set("requirePasscode", v)} label="Passcode" />
            {form.requirePasscode && (
              <Input
                value={form.passcode}
                onChange={(e) => set("passcode", e.target.value)}
                placeholder="Auto-generate"
                maxLength={10}
                className="h-8 w-40"
                invalid={!!errors.passcode}
                aria-label="Passcode"
              />
            )}
          </div>
          <FieldError>{errors.passcode}</FieldError>
          <p className="text-xs text-muted">Only users who have the invite link or passcode can join the meeting.</p>
          <Checkbox
            checked={form.waitingRoom}
            onChange={(v) => set("waitingRoom", v)}
            label="Waiting Room"
            description="Only users admitted by the host can join the meeting."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <RadioPair label="Host video" value={form.hostVideo} onChange={(v) => set("hostVideo", v)} />
          <RadioPair label="Participant video" value={form.participantVideo} onChange={(v) => set("participantVideo", v)} />
        </div>

        <div className="space-y-2.5">
          <FieldLabel>Options</FieldLabel>
          <Checkbox
            checked={form.joinBeforeHost}
            onChange={(v) => set("joinBeforeHost", v)}
            label="Allow participants to join anytime"
          />
          <Checkbox checked={form.muteOnEntry} onChange={(v) => set("muteOnEntry", v)} label="Mute participants upon entry" />
        </div>

        {serverError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-zoom-red">{serverError}</p>}
      </form>
    </Modal>
  );
}

function RadioPair({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-bold text-ink-2">{label}</legend>
      <div className="flex gap-5 text-sm">
        {[true, false].map((option) => (
          <label key={String(option)} className="flex cursor-pointer items-center gap-1.5">
            <input type="radio" className="accent-zoom-blue" checked={value === option} onChange={() => onChange(option)} />
            {option ? "On" : "Off"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
