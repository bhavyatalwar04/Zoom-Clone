import { describe, expect, it } from "vitest";
import { endNotice, formatElapsed } from "./meeting-time";

const START = "2026-09-25T10:00:00Z";
const at = (hhmm: string) => Date.parse(`2026-09-25T${hhmm}:00Z`);

describe("endNotice", () => {
  it("is quiet for most of the meeting", () => {
    expect(endNotice(at("10:00"), START, 30)).toBeNull();
    expect(endNotice(at("10:24"), START, 30)).toBeNull();
  });
  it("warns in the last five minutes", () => {
    expect(endNotice(at("10:25"), START, 30)).toEqual({ kind: "ending-soon", minutesLeft: 5 });
    expect(endNotice(at("10:29"), START, 30)).toEqual({ kind: "ending-soon", minutesLeft: 1 });
  });
  it("reports over time once the scheduled end has passed", () => {
    expect(endNotice(at("10:30"), START, 30)).toEqual({ kind: "overtime" });
  });
  it("never applies to instant meetings", () => {
    expect(endNotice(at("10:29"), null, 30)).toBeNull();
  });
});

describe("formatElapsed", () => {
  it("uses mm:ss under an hour and h:mm:ss after", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(754_000)).toBe("12:34");
    expect(formatElapsed(3_723_000)).toBe("1:02:03");
  });
  it("never shows negative time (clock skew)", () => {
    expect(formatElapsed(-5000)).toBe("00:00");
  });
});
