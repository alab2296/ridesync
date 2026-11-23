import { describe, expect, it } from "vitest";
import { boundsOf, project } from "./mapView";

describe("map projection", () => {
  const points = [
    { lat: 24.8, lng: 67.0 },
    { lat: 24.9, lng: 67.1 },
  ];

  it("has no bounds for an empty list", () => {
    expect(boundsOf([])).toBeNull();
  });

  it("puts the north-west corner at the top left and south-east at the bottom right", () => {
    const b = boundsOf(points)!;
    expect(project({ lat: 24.9, lng: 67.0 }, b, 220, 120, 20)).toEqual({ x: 20, y: 20 });
    const se = project({ lat: 24.8, lng: 67.1 }, b, 220, 120, 20);
    expect(se.x).toBeCloseTo(200);
    expect(se.y).toBeCloseTo(100);
  });

  it("centres a single point", () => {
    const b = boundsOf([points[0]!])!;
    expect(project(points[0]!, b, 200, 100)).toEqual({ x: 100, y: 50 });
  });
});
