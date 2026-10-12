-- Backfill releasedAmount / releaseCount for payments that were fully
-- released before the partial-release feature existed.
--
-- Context: the `releasedAmount` and `releaseCount` columns were added
-- alongside the new PaymentRelease table. Every existing Payment row was
-- written before those columns existed, so Postgres filled them with the
-- column default (0). That makes historical RELEASED payments look like
-- nothing was ever released — they vanish from the worker's earnings page
-- and don't count toward the worker's withdrawable balance.
--
-- Every RELEASED payment in the DB at this point was, by definition, 100%
-- released (partial releases did not exist). So it's safe to mark them as
-- fully released by setting releasedAmount = workerPayout and releaseCount
-- to at least 1.
UPDATE "Payment"
SET "releasedAmount" = "workerPayout",
    "releaseCount"   = GREATEST("releaseCount", 1)
WHERE "status" = 'RELEASED'
  AND "releasedAmount" = 0;
