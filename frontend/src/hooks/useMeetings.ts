"use client";

import useSWR, { useSWRConfig } from "swr";
import { api } from "@/lib/api";

export const meetingKeys = {
  upcoming: "meetings:upcoming",
  recent: "meetings:recent",
  me: "users:me",
  contacts: "users:contacts",
};

export function useMe() {
  return useSWR(meetingKeys.me, api.me, { revalidateOnFocus: false });
}

export function useContacts() {
  return useSWR(meetingKeys.contacts, api.contacts, { revalidateOnFocus: false });
}

export function useUpcomingMeetings() {
  // Poll so meetings that go live / finish update without a refresh.
  return useSWR(meetingKeys.upcoming, () => api.meetings("upcoming"), { refreshInterval: 30000 });
}

export function useRecentMeetings() {
  return useSWR(meetingKeys.recent, () => api.meetings("recent"), { refreshInterval: 60000 });
}

/** Re-fetch every meeting list after a create / edit / delete. */
export function useRefreshMeetings() {
  const { mutate } = useSWRConfig();
  return () => Promise.all([mutate(meetingKeys.upcoming), mutate(meetingKeys.recent)]);
}
