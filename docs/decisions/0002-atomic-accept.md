# ADR 0002: Atomic database update for ride assignment

Status: Accepted
Context: Two drivers can accept the same ride at once.
Decision: Offer to one driver at a time, and make accept a single conditional UPDATE (`WHERE status='SEARCHING'`). Add a partial unique index so a driver cannot hold two active rides.
Consequences: Correctness comes from the database, not from app-level locks. Redis locks are an optimisation only.
