import { describe, expect, it } from "vitest";
import { passau, startPosition, step } from "../src/movement.js";

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("movement", () => {
  it("starts inside the area", () => {
    const random = seeded(1);
    for (let i = 0; i < 100; i++) {
      const p = startPosition(passau, random);
      expect(p.lat).toBeGreaterThanOrEqual(passau.minLat);
      expect(p.lat).toBeLessThanOrEqual(passau.maxLat);
      expect(p.lng).toBeGreaterThanOrEqual(passau.minLng);
      expect(p.lng).toBeLessThanOrEqual(passau.maxLng);
      expect(p.heading).toBeGreaterThanOrEqual(0);
      expect(p.heading).toBeLessThan(360);
    }
  });

  it("moves roughly speed times seconds", () => {
    const start = { lat: 48.575, lng: 13.46, heading: 0 };
    const next = step(start, passau, 3, 10, () => 0.5); // no heading drift
    const metres = (next.lat - start.lat) * 111_320;
    expect(metres).toBeGreaterThan(29);
    expect(metres).toBeLessThan(31);
  });

  it("never leaves the area and always sends valid readings", () => {
    const random = seeded(7);
    let pos = startPosition(passau, random);
    for (let i = 0; i < 5000; i++) {
      pos = step(pos, passau, 3, 40, random);
      expect(pos.lat).toBeGreaterThanOrEqual(passau.minLat);
      expect(pos.lat).toBeLessThanOrEqual(passau.maxLat);
      expect(pos.lng).toBeGreaterThanOrEqual(passau.minLng);
      expect(pos.lng).toBeLessThanOrEqual(passau.maxLng);
      expect(pos.heading).toBeGreaterThanOrEqual(0);
      expect(pos.heading).toBeLessThanOrEqual(360);
    }
  });

  it("turns around at the edge", () => {
    const edge = { lat: passau.maxLat, lng: 13.46, heading: 0 };
    const next = step(edge, passau, 3, 10, () => 0.5);
    expect(next.heading).toBe(180);
  });
});
