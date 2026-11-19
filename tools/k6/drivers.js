// k6 scenario: N drivers, each holding one WebSocket and sending a location every few seconds.
// Run: k6 run -e DRIVERS=250 -e DURATION_S=60 tools/k6/drivers.js
import http from "k6/http";
import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const API_URL = __ENV.API_URL || "http://localhost:3000";
const DRIVERS = Number(__ENV.DRIVERS || 250);
const DURATION_S = Number(__ENV.DURATION_S || 60);
const INTERVAL_MS = Number(__ENV.INTERVAL_MS || 3000);
const RUN_ID = __ENV.RUN_ID || Date.now().toString(36);
const PASSWORD = "loadtest-password";

const ackLatency = new Trend("location_ack_ms", true);
const sent = new Counter("locations_sent");
const acked = new Counter("locations_acked");

export const options = {
  scenarios: {
    drivers: {
      executor: "per-vu-iterations",
      vus: DRIVERS,
      iterations: 1,
      maxDuration: `${DURATION_S + 60}s`,
    },
  },
  setupTimeout: "300s",
  thresholds: {
    location_ack_ms: ["p(95)<200"],
    ws_connecting: ["p(95)<1000"],
    checks: ["rate>0.99"],
  },
};

const jsonHeaders = { "Content-Type": "application/json" };

/** Registers every driver once and sets it online. Returns one token per driver. */
export function setup() {
  const tokens = [];
  for (let n = 0; n < DRIVERS; n++) {
    const email = `k6-${RUN_ID}-${n}@example.com`;
    const body = JSON.stringify({
      name: `K6 ${n}`,
      email,
      password: PASSWORD,
      role: "driver",
    });
    let res = http.post(`${API_URL}/auth/register`, body, { headers: jsonHeaders });
    if (res.status === 409) {
      res = http.post(`${API_URL}/auth/login`, JSON.stringify({ email, password: PASSWORD }), {
        headers: jsonHeaders,
      });
    }
    const token = res.json("token");
    http.post(`${API_URL}/driver/online`, null, {
      headers: { Authorization: `Bearer ${token}` },
    });
    tokens.push(token);
  }
  return { tokens };
}

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  const url = `${API_URL.replace(/^http/, "ws")}/ws?token=${token}`;
  let lat = 48.55 + Math.random() * 0.05;
  let lng = 13.42 + Math.random() * 0.08;
  const pending = [];

  const res = ws.connect(url, {}, (socket) => {
    socket.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.type === "location_ack") {
        const t0 = pending.shift();
        if (t0 !== undefined) ackLatency.add(Date.now() - t0);
        acked.add(1);
      }
    });
    socket.setTimeout(() => socket.close(), DURATION_S * 1000);
    socket.setInterval(() => {
      lat += (Math.random() - 0.5) * 0.0005;
      lng += (Math.random() - 0.5) * 0.0005;
      pending.push(Date.now());
      socket.send(
        JSON.stringify({ type: "location", data: { lat, lng, heading: 0, ts: Date.now() } }),
      );
      sent.add(1);
    }, INTERVAL_MS);
  });
  check(res, { "websocket upgraded": (r) => r && r.status === 101 });
  sleep(1);
}
