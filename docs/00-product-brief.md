# Product brief

## Problem
Passengers in a single city want a taxi quickly and want to see it coming. Drivers want fair, fast ride offers without double-assigned rides. Operators want live visibility of the fleet.

## Goals
- A passenger can request a ride and watch the driver arrive on a map.
- A driver can go online, receive one offer at a time, accept, and share location in the background.
- An admin can see drivers and trips live.
- The system handles 250 licensed taxis updating location every 3 seconds.

## Non-goals (v1)
Real payments (Stripe test mode only, optional), multi-city, ratings, surge pricing, chat, driver payouts.

## Success measures
- Two simultaneous accepts: exactly one succeeds (automated test).
- 250 simulated drivers at 3 s intervals: p95 location-ingest latency under 200 ms on one small instance (load test).
- Android background location verified on a real device; iOS notes honest about what was tested.

## Users
Passenger, Driver, Admin.

## Constraints
Solo developer, part-time, free or test-mode services only, public GitHub repo.

## Risks
| Risk | Mitigation |
|---|---|
| No Mac/iPhone for iOS testing | Android first; document iOS design and mark untested parts |
| Maps billing | MapLibre + OSM |
| Scope creep | Milestones; non-goals above |
