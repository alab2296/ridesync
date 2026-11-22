import { describe, expect, it } from "vitest";
import { formatPoint, formatTime } from "./format";

describe("format helpers", () => {
  it("rounds coordinates to four decimals", () => {
    expect(formatPoint({ lat: 24.860735, lng: 67.001137 })).toBe("24.8607, 67.0011");
  });

  it("formats an ISO timestamp in UTC", () => {
    expect(formatTime("2026-11-21T09:33:11.000Z")).toBe("2026-11-21 09:33 UTC");
  });

  it("shows a dash for missing or invalid times", () => {
    expect(formatTime(null)).toBe("-");
    expect(formatTime("not a date")).toBe("-");
  });
});
