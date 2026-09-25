import { describe, expect, it } from "vitest";
import { describeRecurrence, formatDuration, formatMeetingId, initials, parseMeetingInput, toZonedParts } from "./format";
import { buildInvitation } from "./invitation";

describe("formatMeetingId", () => {
  it("groups 11 digit IDs like Zoom", () => {
    expect(formatMeetingId("84529310472")).toBe("845 2931 0472");
  });
  it("groups 10 digit IDs", () => {
    expect(formatMeetingId("8452931047")).toBe("845 293 1047");
  });
});

describe("parseMeetingInput", () => {
  it("accepts spaced and dashed IDs", () => {
    expect(parseMeetingInput("845 2931 0472")).toEqual({ code: "84529310472", passcode: null });
    expect(parseMeetingInput(" 845-2931-0472 ")).toEqual({ code: "84529310472", passcode: null });
  });
  it("extracts the ID and passcode from an invite link", () => {
    expect(parseMeetingInput("https://zoom-clone.app/j/84529310472?pwd=aB3xY9")).toEqual({
      code: "84529310472",
      passcode: "aB3xY9",
    });
  });
  it("handles an invite link without a passcode", () => {
    expect(parseMeetingInput("http://localhost:3000/j/84529310472")).toEqual({ code: "84529310472", passcode: null });
  });
});

describe("toZonedParts", () => {
  it("returns the wall-clock time in another time zone", () => {
    // 04:30 UTC is 10:00 in India (UTC+05:30)
    expect(toZonedParts("2026-09-26T04:30:00Z", "Asia/Kolkata")).toEqual({ date: "2026-09-26", time: "10:00" });
    // ...and still the previous evening in New York
    expect(toZonedParts("2026-09-26T02:00:00Z", "America/New_York")).toEqual({ date: "2026-09-25", time: "22:00" });
  });
});

describe("small formatters", () => {
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(95)).toBe("1 hr 35 min");
  });
  it("builds initials", () => {
    expect(initials("Bhavya Talwar")).toBe("BT");
    expect(initials("Mary Ann van Dyke")).toBe("MD");
    expect(initials("cher")).toBe("CH");
  });
});

describe("buildInvitation", () => {
  it("contains the link, formatted ID and passcode", () => {
    const text = buildInvitation({
      title: "Weekly Sync",
      code: "84529310472",
      passcode: "abc123",
      join_url: "http://localhost:3000/j/84529310472?pwd=abc123",
      hostName: "Bhavya Talwar",
    });
    expect(text).toContain("Bhavya Talwar is inviting you to a Zoom meeting.");
    expect(text).toContain("Topic: Weekly Sync");
    expect(text).toContain("http://localhost:3000/j/84529310472?pwd=abc123");
    expect(text).toContain("Meeting ID: 845 2931 0472");
    expect(text).toContain("Passcode: abc123");
  });
});

describe("describeRecurrence", () => {
  // 2026-10-01 is a Thursday
  const start = "2026-10-01T04:30:00Z";
  it("describes weekly series ending after N occurrences", () => {
    expect(describeRecurrence({ type: "weekly", interval: 1, count: 8, until: null }, start)).toBe("Every week on Thu, 8 occurrences");
  });
  it("describes intervals and end dates", () => {
    expect(describeRecurrence({ type: "daily", interval: 2, count: null, until: "2026-10-12T18:29:59Z" }, start)).toBe(
      "Every 2 days, until Oct 12, 2026",
    );
    expect(describeRecurrence({ type: "monthly", interval: 1, count: 3, until: null }, start)).toBe("Every month on day 1, 3 occurrences");
  });
});