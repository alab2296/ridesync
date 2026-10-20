# API outline (to become an OpenAPI file in M1)

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | /auth/register, /auth/login | public | Account and JWT |
| POST | /rides | passenger | Request a ride |
| GET | /rides/:id | passenger/driver | Ride status |
| POST | /rides/:id/cancel | passenger/driver | Cancel |
| POST | /driver/online, /driver/offline | driver | Availability |
| POST | /rides/:id/accept | driver | Accept offer (atomic; 200 or 409) |
| POST | /rides/:id/decline | driver | Decline offer |
| POST | /rides/:id/start, /complete | driver | Trip steps |
| GET | /admin/drivers, /admin/rides | admin | Fleet and trips |

## WebSocket events
- Driver to server: `location {lat, lng, heading, ts}`
- Server to driver: `offer {rideId, pickup, expiresAt}`
- Server to passenger: `driver_location`, `ride_status`
- Server to admin: `fleet_snapshot`

Errors use one shape: `{ "error": { "code": "RIDE_TAKEN", "message": "..." } }`.
