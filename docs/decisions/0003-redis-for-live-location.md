# ADR 0003: Redis for live location, Postgres for history
Status: Accepted
Context: About 83 location writes per second would be wasteful to store in full.
Decision: Keep the latest position in Redis (geo index with expiry) and publish to subscribers; store a sample every 15 to 30 seconds in PostGIS.
Consequences: Fast reads and cheap storage; history is sampled, not complete.
