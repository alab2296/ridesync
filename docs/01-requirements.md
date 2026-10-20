# Requirements and user stories

## Functional (MoSCoW)
**Must**
- US-1 As a passenger, I register and log in.
- US-2 As a passenger, I set pickup and drop-off and request a ride.
- US-3 As a driver, I go online/offline.
- US-4 As a driver, I receive a ride offer with a timeout and accept or decline it.
- US-5 As a system, I assign a ride to exactly one driver (no double booking).
- US-6 As a passenger, I see the driver's live position and the trip status.
- US-7 As a driver, my location is sent while the app is in the background.
- US-8 As an admin, I see all online drivers on a live map and a list of trips.

**Should**
- US-9 Cancel a ride (passenger or driver) with a reason.
- US-10 Estimated distance and fare.
- US-11 Trip history.

**Could**
- US-12 Stripe test-mode payment.
- US-13 Push notifications for offers.

## Non-functional
- Performance: ingest 250 locations / 3 s (about 83 msg/s) with p95 < 200 ms.
- Reliability: reconnect automatically; no lost state after a dropped socket.
- Security: JWT auth, role checks, input validation, rate limiting, no secrets in git.
- Privacy: location kept only as long as needed; sampled history.
- Observability: structured logs, health endpoint, basic metrics.
- Maintainability: TypeScript strict, lint, tests, CI green before merge.

## Acceptance criteria (examples)
- US-5: Given a ride in SEARCHING, when two drivers accept at once, then one gets 200 and the other 409 "ride already taken", and the ride has one driver.
- US-7: Given the driver app in background for 10 min on Android, location updates continue at the configured interval.
