create extension if not exists postgis;

create type user_role as enum ('passenger', 'driver', 'admin');
create type driver_status as enum ('offline', 'online', 'busy');
create type ride_status as enum ('SEARCHING', 'ASSIGNED', 'ARRIVING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
create type offer_result as enum ('pending', 'accepted', 'declined', 'expired');

create table users (
  id uuid primary key default gen_random_uuid(),
  role user_role not null,
  name text not null,
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

-- Vehicle details are filled in later, so they may be empty for now.
create table drivers (
  user_id uuid primary key references users (id) on delete cascade,
  vehicle_plate text,
  vehicle_model text,
  status driver_status not null default 'offline'
);

create table rides (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references users (id),
  driver_id uuid references users (id),
  status ride_status not null default 'SEARCHING',
  pickup geography (point, 4326) not null,
  dropoff geography (point, 4326) not null,
  requested_at timestamptz not null default now(),
  assigned_at timestamptz,
  completed_at timestamptz,
  cancel_reason text,
  -- once a driver is involved the ride must name one
  constraint driver_when_assigned check (status in ('SEARCHING', 'CANCELLED') or driver_id is not null)
);
create index rides_status_idx on rides (status);
create index rides_driver_idx on rides (driver_id);
create index rides_pickup_gix on rides using gist (pickup);
-- A driver can only have one active ride. This is the safety net behind "no double booking".
create unique index one_active_ride_per_driver on rides (driver_id)
  where status in ('ASSIGNED', 'ARRIVING', 'IN_PROGRESS');

create table ride_offers (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides (id) on delete cascade,
  driver_id uuid not null references users (id),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  result offer_result not null default 'pending',
  unique (ride_id, driver_id)
);

create table location_samples (
  id bigint generated always as identity primary key,
  driver_id uuid not null references users (id),
  ride_id uuid references rides (id),
  position geography (point, 4326) not null,
  recorded_at timestamptz not null default now()
);
create index location_samples_position_gix on location_samples using gist (position);
create index location_samples_driver_time_idx on location_samples (driver_id, recorded_at);
