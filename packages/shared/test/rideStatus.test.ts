import { describe, expect, it } from "vitest";
import { canTransition } from "../src/index.js";

describe("canTransition", () => {
  it("allows the happy path", () => {
    expect(canTransition("SEARCHING", "ASSIGNED")).toBe(true);
    expect(canTransition("ASSIGNED", "ARRIVING")).toBe(true);
    expect(canTransition("ARRIVING", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
  });
  it("rejects illegal jumps", () => {
    expect(canTransition("SEARCHING", "COMPLETED")).toBe(false);
    expect(canTransition("COMPLETED", "SEARCHING")).toBe(false);
    expect(canTransition("IN_PROGRESS", "CANCELLED")).toBe(false);
  });
});
