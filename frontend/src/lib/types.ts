export type MeetingType = "instant" | "scheduled";
export type MeetingStatus = "scheduled" | "live" | "ended";
export type ParticipantRole = "host" | "co_host" | "attendee";

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
  waiting_room: boolean;
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
  duration_minutes: number;
  started_at: string | null;
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
  /** Set for private messages; null means "to Everyone". */
  recipient_id: number | null;
  recipient_name: string | null;
  content: string;
  sent_at: string;
}

export interface TranscriptSegment {
  id: number;
  participant_id: number;
  speaker_name: string;
  content: string;
  spoken_at: string;
}

export interface ParticipantInsight {
  display_name: string;
  is_host: boolean;
  attended_minutes: number;
  talk_seconds: number;
  talk_share: number;
  messages: number;
  reactions: number;
  hand_raises: number;
  transcript_lines: number;
}

export interface MeetingInsights {
  duration_minutes: number;
  participant_count: number;
  total_talk_seconds: number;
  total_messages: number;
  total_reactions: number;
  total_hand_raises: number;
  screen_shares: number;
  transcript_lines: number;
  polls: number;
  recordings: RecordingInfo[];
  reactions_by_emoji: { emoji: string; count: number }[];
  participants: ParticipantInsight[];
}
export interface PollOptionView {
  id: number;
  text: string;
  /** null while results are hidden from this viewer. */
  votes: number | null;
  voters: string[] | null;
}

export interface PollView {
  id: number;
  question: string;
  allow_multiple: boolean;
  is_anonymous: boolean;
  status: "open" | "closed";
  created_at: string;
  closed_at: string | null;
  options: PollOptionView[];
  total_voters: number | null;
  my_votes: number[];
}

export interface PollDraft {
  question: string;
  options: string[];
  allow_multiple: boolean;
  anonymous: boolean;
}

export interface RecordingInfo {
  recorded_by: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
}
export type WhiteboardTool = "pen" | "highlighter" | "line" | "rect" | "ellipse" | "text";

/** One whiteboard element. Points are normalised to 0..1 of the board's width / height. */
export interface WhiteboardStroke {
  id: string;
  tool: WhiteboardTool;
  color: string;
  width: number;
  points: [number, number][];
  text?: string;
  by?: number;
}

export interface WhiteboardState {
  open: boolean;
  opened_by: number | null;
  opened_by_name: string | null;
}

export interface BreakoutRoomState {
  position: number;
  group: string | null;
  name: string;
  members: { id: number; display_name: string }[];
  assigned: number[];
}

export interface BreakoutState {
  open: boolean;
  closing: boolean;
  rooms: BreakoutRoomState[];
}

export interface BreakoutHistory {
  name: string;
  opened_at: string;
  closed_at: string | null;
  participants: string[];
}