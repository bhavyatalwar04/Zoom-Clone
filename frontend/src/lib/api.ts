import type {
  ChatMessage,
  JoinResponse,
  Meeting,
  MeetingInsights,
  MeetingLookup,
  Participant,
  PollView,
  ScheduleMeetingInput,
  TranscriptSegment,
  User,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const WS_URL = API_URL.replace(/^http/, "ws");

/** Error thrown for non-2xx responses; `code` mirrors the backend's machine readable error code. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Unable to reach the server. Please check your connection.");
  }
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail;
    if (detail && typeof detail === "object" && "code" in detail) {
      throw new ApiError(res.status, detail.code, detail.message);
    }
    // FastAPI validation errors: [{ loc, msg }, ...]
    const message = Array.isArray(detail)
      ? detail.map((d: { msg: string }) => d.msg.replace(/^Value error, /, "")).join(". ")
      : "Something went wrong. Please try again.";
    throw new ApiError(res.status, "REQUEST_FAILED", message);
  }
  return body as T;
}

const json = (data: unknown) => JSON.stringify(data);

export const api = {
  me: () => request<User>("/api/users/me"),
  contacts: () => request<User[]>("/api/users"),

  meetings: (scope: "upcoming" | "recent") => request<Meeting[]>(`/api/meetings?scope=${scope}`),
  meeting: (code: string) => request<Meeting>(`/api/meetings/${encodeURIComponent(code)}`),
  participants: (code: string) => request<Participant[]>(`/api/meetings/${encodeURIComponent(code)}/participants`),
  messages: (code: string) => request<ChatMessage[]>(`/api/meetings/${encodeURIComponent(code)}/messages`),
  transcript: (code: string) => request<TranscriptSegment[]>(`/api/meetings/${encodeURIComponent(code)}/transcript`),
  polls: (code: string) => request<PollView[]>(`/api/meetings/${encodeURIComponent(code)}/polls`),
  insights: (code: string) => request<MeetingInsights>(`/api/meetings/${encodeURIComponent(code)}/insights`),

  createInstant: (data: { title?: string; host_video_on?: boolean } = {}) =>
    request<Meeting>("/api/meetings/instant", { method: "POST", body: json(data) }),
  schedule: (data: ScheduleMeetingInput) => request<Meeting>("/api/meetings", { method: "POST", body: json(data) }),
  update: (code: string, data: ScheduleMeetingInput) =>
    request<Meeting>(`/api/meetings/${code}`, { method: "PUT", body: json(data) }),
  remove: (code: string) => request<void>(`/api/meetings/${code}`, { method: "DELETE" }),

  lookup: (code: string) => request<MeetingLookup>(`/api/meetings/${encodeURIComponent(code)}/lookup`),
  join: (code: string, data: { display_name: string; passcode?: string | null; start_token?: string | null }) =>
    request<JoinResponse>(`/api/meetings/${encodeURIComponent(code)}/join`, { method: "POST", body: json(data) }),
};
