-- A ride is offered to one driver at a time (ADR 0002), so at most one offer
-- per ride can be waiting for an answer.
create unique index one_pending_offer_per_ride on ride_offers (ride_id)
  where result = 'pending';
