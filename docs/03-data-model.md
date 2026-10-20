# Data model (draft)

- **users**(id, role[passenger|driver|admin], name, email, password_hash, created_at)
- **drivers**(user_id PK/FK, vehicle_plate, vehicle_model, status[offline|online|busy])
- **rides**(id, passenger_id, driver_id NULL, status, pickup geography(Point), dropoff geography(Point), requested_at, assigned_at, completed_at, cancel_reason NULL)
- **ride_offers**(id, ride_id, driver_id, offered_at, expires_at, result[pending|accepted|declined|expired])
- **location_samples**(id, driver_id, ride_id NULL, position geography(Point), recorded_at) - sampled, not every ping

Indexes: GiST on positions; rides(status); rides(driver_id).
Constraint: a driver can have at most one active ride (partial unique index on rides(driver_id) where status in active states).
