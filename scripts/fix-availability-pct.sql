-- Fix availabilityPct to IEC 61400-26-2: T1 / (T1 + T5) * 100
-- Run on production DB via Portainer postgres container:
-- docker exec -i windparkmanager-postgres-1 psql -U wpm -d windparkmanager < fix-availability-pct.sql

UPDATE scada_availability
SET "availabilityPct" = CASE
  WHEN (t1 + t5) > 0 THEN ROUND((t1::numeric / (t1 + t5)) * 100, 3)
  ELSE NULL
END;

-- Verify: show sample of updated values
SELECT "turbineId", date, "periodType",
  t1, t5, "availabilityPct",
  ROUND((t1::numeric / NULLIF(t1 + t5, 0)) * 100, 3) AS recalculated
FROM scada_availability
WHERE "periodType" = 'MONTHLY'
ORDER BY date DESC
LIMIT 10;
