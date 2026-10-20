# Backlog and milestones

## M1 Foundations (days 1-2)
- Monorepo, TypeScript config, lint, formatter
- Docker Compose (Postgres+PostGIS, Redis, API)
- Health endpoint, config, logging
- GitHub Actions CI (lint, typecheck, test, build)
- OpenAPI skeleton

## M2 Rides core (days 3-4)
- Auth and roles (US-1)
- Ride request and state machine (US-2)
- Atomic accept + concurrency test (US-5)
- Offer with timeout (US-4)

## M3 Live location (days 5-6)
- WebSocket gateway, driver location ingest (US-7 backend)
- Redis geo index, nearby-driver search
- Passenger live-position stream (US-6 backend)

## M4 Proof (days 7-8)  -> tag v0.1
- Simulator (250 drivers, 3 s)
- k6 load test, results table in README

## M5 Mobile apps (days 9-13)
- Passenger app, driver app, maps, background location (Android first)

## M6 Admin and polish (days 14-15)
- Admin live map and trips list
- README, diagram, demo GIF, v1.0 tag

Each item becomes a GitHub Issue with acceptance criteria, labelled by milestone.
