# Build plan

Scope: backend, tests and admin web, built at a normal working pace (about one small item per working day, so roughly 4 to 5 weeks). There is no deadline; quality and understanding matter more than speed. The passenger and driver mobile apps are a later phase (see the backlog).

How to read this:

- **Live** items are done together in a working session, step by step, because they are the hard or interesting parts.
- **Routine** items are small and well understood, and can be done on their own.
- One item = one branch = one pull request. Tick the box when it is merged.

## Phase 1: rides core (M2)

- [x] Auth: register, login, JWT and role guards (Routine)
- [x] Database schema and migrations: users, drivers, rides, ride_offers (Routine)
- [x] Postgres user repository, replacing the in-memory one (Routine)
- [x] Request a ride and read its status: `POST /rides`, `GET /rides/:id` (Live)
- [x] Driver online and offline: `POST /driver/online`, `POST /driver/offline` (Routine)
- [x] Atomic accept with the concurrency test: `POST /rides/:id/accept` (Live)
- [ ] Offers with a timeout, and decline (Live)
- [ ] Cancel, start and complete a ride (Routine)

## Phase 2: live location (M3)

- [ ] WebSocket gateway with JWT auth (Live)
- [ ] Driver location ingest and the Redis geo index (Live)
- [ ] Nearby-driver search used by the matcher (Live)
- [ ] Passenger live stream: `driver_location` and `ride_status` events (Routine)

## Phase 3: proof (M4)

- [ ] Simulator for 250 drivers sending a location every 3 seconds (Routine)
- [ ] Native arm64 PostGIS image for local runs (Routine)
- [ ] k6 load test, with the results table in the README (Routine)
- [ ] Tag `v0.1.0`

## Phase 4: admin and polish (M6, web only)

- [ ] Admin endpoints: `GET /admin/drivers`, `GET /admin/rides` (Routine)
- [ ] Admin web with Vite and React: trips list (Routine)
- [ ] Admin web: live map of online drivers (Routine)
- [ ] OpenAPI file, README, architecture diagram (Routine)
- [ ] Tag `v1.0.0`

## Notes

- `main` is protected. Every change goes through a pull request with CI green, then a squash merge.
- Run `colima start` after a reboot, then `docker compose up -d --wait db redis`.
