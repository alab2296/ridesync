import { WebSocket } from "ws";
import { passau, startPosition, step, type Position } from "./movement.js";

const apiUrl = process.env.API_URL ?? "http://localhost:3000";
const drivers = Number(process.env.DRIVERS ?? 250);
const intervalMs = Number(process.env.INTERVAL_MS ?? 3000);
const durationS = Number(process.env.DURATION_S ?? 0); // 0 = run until stopped
const runId = process.env.RUN_ID ?? Date.now().toString(36);
const password = "simulator-password";

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Registers a driver (or logs in when the email already exists) and returns a token. */
async function getToken(n: number): Promise<string> {
  const email = `sim-${runId}-${n}@example.com`;
  let res = await post("/auth/register", { name: `Sim ${n}`, email, password, role: "driver" });
  if (res.status === 409) res = await post("/auth/login", { email, password });
  if (!res.ok) throw new Error(`auth failed for driver ${n}: ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

const stats = { sent: 0, acked: 0, applied: 0, errors: 0 };

async function runDriver(n: number, stop: AbortSignal): Promise<void> {
  const token = await getToken(n);
  const online = await fetch(`${apiUrl}/driver/online`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!online.ok) throw new Error(`driver ${n} could not go online: ${online.status}`);

  const ws = new WebSocket(`${apiUrl.replace(/^http/, "ws")}/ws?token=${token}`);
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString()) as { type: string; data: { applied?: boolean } };
    if (msg.type === "location_ack") {
      stats.acked++;
      if (msg.data.applied) stats.applied++;
    } else if (msg.type === "error") {
      stats.errors++;
    }
  });

  let pos: Position = startPosition(passau, Math.random);
  // Spread the drivers out so they do not all send in the same instant.
  await new Promise((r) => setTimeout(r, Math.random() * intervalMs));
  const timer = setInterval(() => {
    pos = step(pos, passau, intervalMs / 1000, 8 + Math.random() * 6, Math.random);
    ws.send(JSON.stringify({ type: "location", data: { ...pos, ts: Date.now() } }));
    stats.sent++;
  }, intervalMs);

  await new Promise<void>((resolve) => stop.addEventListener("abort", () => resolve()));
  clearInterval(timer);
  ws.close();
}

async function main() {
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort());
  if (durationS > 0) setTimeout(() => controller.abort(), durationS * 1000);

  console.log(`starting ${drivers} drivers against ${apiUrl}, one location every ${intervalMs} ms`);
  const running = Array.from({ length: drivers }, (_, i) => runDriver(i, controller.signal));
  const report = setInterval(() => {
    console.log(
      `sent=${stats.sent} acked=${stats.acked} applied=${stats.applied} errors=${stats.errors}`,
    );
  }, 5000);
  const results = await Promise.allSettled(running);
  clearInterval(report);
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) console.error(`${failed.length} drivers failed to start`, failed[0]);
  console.log(`done: sent=${stats.sent} acked=${stats.acked} errors=${stats.errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
