export type MeetingType = "instant" | "scheduled";
export type MeetingStatus = "scheduled" | "live" | "ended";
export type ParticipantRole = "host" | "attendee";

export interface User {
  id: number;
  full_name: string;
  email: string;
  avatar_color: string;
  job_title: string | null;
  timezone: string;
}

export interface MeetingOptions {
  join_before_host: boolean;
  mute_on_entry: boolean;
  host_video_on: boolean;
  participant_video_on: boolean;
}

export interface Meeting extends MeetingOptions {
  code: string;
  title: string;
  description: string | null;
  meeting_type: MeetingType;
  status: MeetingStatus;
  scheduled_start: string | null;
  duration_minutes: number;
  timezone: string;
  passcode: string | null;
  join_url: string;
  host: User;
  is_host: boolean;
  start_token: string | null;
  invitees: string[];
  participant_count: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface MeetingLookup {
  code: string;
  title: string;
  host_name: string;
  status: MeetingStatus;
  meeting_type: MeetingType;
  scheduled_start: string | null;
  requires_passcode: boolean;
  join_before_host: boolean;
}

export interface ScheduleMeetingInput extends MeetingOptions {
  title: string;
  description: string | null;
  /** Wall-clock time in `timezone`, e.g. "2026-09-26T10:30:00". */
  start_time: string;
  timezone: string;
  duration_minutes: number;
  require_passcode: boolean;
  passcode: string | null;
  invitees: string[];
}

export interface Participant {
  id: number;
  user_id: number | null;
  display_name: string;
  role: ParticipantRole;
  joined_at: string;
  left_at: string | null;
  was_removed: boolean;
}

export interface JoinResponse {
  participant: Participant;
  ws_token: string;
  meeting: MeetingLookup;
  is_host: boolean;
  passcode: string | null;
  join_url: string;
  mute_on_entry: boolean;
  video_on_entry: boolean;
}

export interface ChatMessage {
  id: number;
  participant_id: number;
  sender_name: string;
  content: string;
  sent_at: string;
}
