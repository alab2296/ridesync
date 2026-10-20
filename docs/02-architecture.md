# Architecture

## Context (C4 level 1)

Passenger app, Driver app and Admin web talk to the RideSync API (REST + WebSocket). The API uses PostgreSQL/PostGIS, Redis and an external map/routing provider.

## Containers (C4 level 2)

- **apps/passenger, apps/driver**: React Native, TypeScript.
- **apps/admin**: React + Vite.
- **services/api**: Node.js + TypeScript (Fastify). REST for commands, WebSocket for live updates.
- **PostgreSQL + PostGIS**: users, drivers, rides, trip history (sampled locations).
- **Redis**: latest driver position (geo index with expiry), ride offer locks, pub/sub fan-out.
- **tools/simulator, tools/loadtest**: 250 fake drivers, k6 scripts.

## Key flows

1. **Request**: passenger POST /rides -> status SEARCHING -> matcher finds nearby online drivers (Redis geo search).
2. **Offer**: one driver at a time, with a timeout. Offer is stored in Redis with TTL.
3. **Accept**: atomic update `rides SET driver_id, status='ASSIGNED' WHERE id=? AND status='SEARCHING'`. One row updated = winner; zero = 409.
4. **Location**: driver sends position -> API validates -> Redis GEOADD + pub/sub to the passenger on that ride -> sampled insert to Postgres.
5. **Trip**: ASSIGNED -> ARRIVING -> IN_PROGRESS -> COMPLETED (or CANCELLED).

## Ride state machine

SEARCHING -> ASSIGNED -> ARRIVING -> IN_PROGRESS -> COMPLETED
SEARCHING/ASSIGNED/ARRIVING -> CANCELLED. Illegal transitions are rejected.

## Scaling note

About 83 location messages/s is small. One Node instance plus Redis is enough. To scale out, add instances behind a load balancer using the Redis adapter for pub/sub.

## Cross-cutting

Auth: JWT with roles. Validation: schema validation on every input. Logging: structured JSON. Config: environment variables, `.env.example` only.
