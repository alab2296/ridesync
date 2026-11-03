-- A passenger can only wait for or take one ride at a time.
create unique index one_active_ride_per_passenger on rides (passenger_id)
  where status in ('SEARCHING', 'ASSIGNED', 'ARRIVING', 'IN_PROGRESS');
