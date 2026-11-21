import { useEffect, useState } from "react";
import { listRides, type Ride, type RideStatus } from "./api";
import { formatPoint, formatTime, STATUS_OPTIONS } from "./format";

const PAGE_SIZE = 20;

export function TripsPage({ token }: { token: string }) {
  const [status, setStatus] = useState<RideStatus | "">("");
  const [offset, setOffset] = useState(0);
  const [rides, setRides] = useState<Ride[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listRides(token, { status: status || undefined, limit: PAGE_SIZE, offset })
      .then((data) => {
        if (cancelled) return;
        setRides(data);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Request failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, status, offset]);

  return (
    <section>
      <h2>Trips</h2>
      <label>
        Status{" "}
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as RideStatus | "");
            setOffset(0);
          }}
        >
          <option value="">All</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {loading && <p>Loading...</p>}
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Pickup</th>
            <th>Dropoff</th>
            <th>Requested</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          {rides.map((r) => (
            <tr key={r.id}>
              <td>{r.status}</td>
              <td>{formatPoint(r.pickup)}</td>
              <td>{formatPoint(r.dropoff)}</td>
              <td>{formatTime(r.requestedAt)}</td>
              <td>{formatTime(r.completedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
        Previous
      </button>{" "}
      <button disabled={rides.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
        Next
      </button>
    </section>
  );
}
