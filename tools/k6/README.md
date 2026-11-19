# k6 load test

Simulates drivers that each hold one WebSocket to `/ws` and send a `location` message every 3 seconds. The test measures how long the API takes to answer each message with a `location_ack`.

## Before you run

1. Start the stack: `docker compose up -d --wait db redis`, then the API (`pnpm --filter @ridesync/api dev`).
2. Install k6 (https://grafana.com/docs/k6/latest/set-up/install-k6/).

## Run

```bash
k6 run -e DRIVERS=250 -e DURATION=60s tools/k6/drivers.js
```

| Variable      | Default                 | Meaning                                  |
| ------------- | ----------------------- | ---------------------------------------- |
| `API_URL`     | `http://localhost:3000` | Base URL of the API                      |
| `DRIVERS`     | `250`                   | Number of virtual drivers                |
| `DURATION`    | `60s`                   | How long the load lasts                  |
| `INTERVAL_MS` | `3000`                  | Time between locations from one driver   |
| `RUN_ID`      | time based              | Prefix for the test accounts (see below) |

## What happens

- `setup()` registers one driver account per virtual driver (`k6-<RUN_ID>-<n>@example.com`) and sets each online. Reuse a `RUN_ID` to log in to the same accounts again instead of creating new ones.
- Each virtual user opens a WebSocket for about 30 seconds, sends locations, then reconnects.

## Pass criteria

- `location_ack_ms` p95 below 200 ms
- `ws_connecting` p95 below 1 s
- more than 99% of checks pass
