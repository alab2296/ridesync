import { useEffect, useState } from "react";
import { listDriverLocations, type DriverLocation } from "./api";
import { boundsOf, project } from "./mapView";

const WIDTH = 640;
const HEIGHT = 400;
const REFRESH_MS = 3000;

export function DriversMap({ token }: { token: string }) {
  const [drivers, setDrivers] = useState<DriverLocation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await listDriverLocations(token);
        if (cancelled) return;
        setDrivers(data);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Request failed");
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  const bounds = boundsOf(drivers.map((d) => d.location));

  return (
    <section>
      <h2>Online drivers ({drivers.length})</h2>
      {error && <p role="alert">{error}</p>}
      <svg width={WIDTH} height={HEIGHT} style={{ border: "1px solid #ccc" }}>
        {bounds &&
          drivers.map((d) => {
            const { x, y } = project(d.location, bounds, WIDTH, HEIGHT);
            return (
              <circle key={d.id} cx={x} cy={y} r={5} fill={d.status === "busy" ? "#d33" : "#2a7"}>
                <title>{`${d.name} (${d.status})`}</title>
              </circle>
            );
          })}
      </svg>
      <p>Green: online and free. Red: on a ride. Updates every 3 seconds.</p>
    </section>
  );
}
