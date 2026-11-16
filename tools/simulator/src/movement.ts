export interface Position {
  lat: number;
  lng: number;
  heading: number;
}

/** The box drivers drive around in (central Passau by default). */
export interface Area {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export const passau: Area = { minLat: 48.55, maxLat: 48.6, minLng: 13.42, maxLng: 13.5 };

const METRES_PER_DEGREE_LAT = 111_320;

/** Random start inside the area. `random` returns a number in [0, 1). */
export function startPosition(area: Area, random: () => number): Position {
  return {
    lat: area.minLat + random() * (area.maxLat - area.minLat),
    lng: area.minLng + random() * (area.maxLng - area.minLng),
    heading: random() * 360,
  };
}

/**
 * Moves a driver forward for `seconds` at `speedMps`. The heading drifts a little
 * each step, and the driver turns around when it would leave the area.
 */
export function step(
  pos: Position,
  area: Area,
  seconds: number,
  speedMps: number,
  random: () => number,
): Position {
  let heading = (pos.heading + (random() - 0.5) * 40 + 360) % 360;
  const metres = speedMps * seconds;
  const rad = (heading * Math.PI) / 180;
  const dLat = (Math.cos(rad) * metres) / METRES_PER_DEGREE_LAT;
  const dLng =
    (Math.sin(rad) * metres) / (METRES_PER_DEGREE_LAT * Math.cos((pos.lat * Math.PI) / 180));
  let lat = pos.lat + dLat;
  let lng = pos.lng + dLng;
  if (lat < area.minLat || lat > area.maxLat || lng < area.minLng || lng > area.maxLng) {
    heading = (heading + 180) % 360;
    lat = Math.min(area.maxLat, Math.max(area.minLat, lat));
    lng = Math.min(area.maxLng, Math.max(area.minLng, lng));
  }
  return { lat, lng, heading };
}
