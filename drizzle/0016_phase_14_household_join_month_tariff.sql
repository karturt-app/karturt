-- Allow a narrowly scoped same-month tariff only while creating a new household.
-- General tariffs and household tariffs for past periods remain future-only.
CREATE OR REPLACE FUNCTION public.validate_fee_rate_phase11_insert_v1() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  year_row public.billing_years%ROWTYPE;
  batch_row public.sheet2_import_batches%ROWTYPE;
  local_year integer;
  local_month integer;
  chairman_count bigint;
BEGIN
  -- Preserve the separately authorized, audited 2026 Sheet2 bootstrap path.
  -- Its deferred batch assertion verifies the System Admin MFA and full import contract.
  IF NEW.sheet2_import_batch_id IS NOT NULL THEN
    SELECT * INTO batch_row
    FROM public.sheet2_import_batches batch
    WHERE batch.id = NEW.sheet2_import_batch_id
      AND batch.rt_unit_id = NEW.rt_unit_id
      AND batch.billing_year_id = NEW.billing_year_id
      AND batch.source_sheet = 'Sheet2';
    IF NOT FOUND OR NEW.household_id IS NULL OR NEW.effective_month <> 1 OR
       NEW.created_by_account_id IS NOT NULL OR NEW.created_by_account_type IS NOT NULL OR
       NEW.idempotency_key IS NOT NULL OR NEW.request_fingerprint IS NOT NULL THEN
      RAISE EXCEPTION 'Sheet2 tariff rows require a matching household-scoped import batch.'
        USING ERRCODE = '23514', CONSTRAINT = 'fee_rate_sheet2_import_scope';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.created_by_account_id IS NULL THEN
    RAISE EXCEPTION 'New tariff rows require Chairman attribution and idempotency metadata.'
      USING ERRCODE = '23514', CONSTRAINT = 'fee_rate_f11_actor_required';
  END IF;
  IF NEW.created_by_account_type <> 'official' OR NEW.idempotency_key IS NULL OR NEW.request_fingerprint IS NULL THEN
    RAISE EXCEPTION 'A F11 tariff requires an official actor and idempotency metadata.'
      USING ERRCODE = '23514', CONSTRAINT = 'fee_rate_f11_actor_required';
  END IF;

  SELECT * INTO year_row
  FROM public.billing_years year
  WHERE year.id = NEW.billing_year_id
    AND year.rt_unit_id = NEW.rt_unit_id
  FOR UPDATE;
  IF NOT FOUND OR year_row.status <> 'open' THEN
    RAISE EXCEPTION 'A tariff can only be scheduled in an open billing year in the same RT.'
      USING ERRCODE = '23514', CONSTRAINT = 'fee_rate_open_year_required';
  END IF;

  SELECT extract(year FROM (now() AT TIME ZONE 'Asia/Jakarta'))::integer,
         extract(month FROM (now() AT TIME ZONE 'Asia/Jakarta'))::integer
  INTO local_year, local_month;
  IF year_row.year < local_year OR (year_row.year = local_year AND NEW.effective_month <= local_month) THEN
    IF NOT (
      year_row.year = local_year
      AND NEW.effective_month = local_month
      AND NEW.household_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.households household
        WHERE household.id = NEW.household_id
          AND household.rt_unit_id = NEW.rt_unit_id
          AND household.status = 'active'
          AND household.ends_on IS NULL
          AND extract(year FROM household.starts_on)::integer = year_row.year
          AND extract(month FROM household.starts_on)::integer = NEW.effective_month
          AND household.created_at = transaction_timestamp()
          AND NOT EXISTS (
            SELECT 1
            FROM public.monthly_dues due
            WHERE due.rt_unit_id = NEW.rt_unit_id
              AND due.household_id = NEW.household_id
              AND due.billing_year_id = year_row.id
          )
      )
    ) THEN
      RAISE EXCEPTION 'A tariff effective period must be in the future.'
        USING ERRCODE = '23514', CONSTRAINT = 'fee_rate_future_period_required';
    END IF;
  END IF;

  SELECT count(*) INTO chairman_count
  FROM public.official_assignments assignment
  JOIN public.app_accounts account
    ON account.id = assignment.app_account_id
   AND account.rt_unit_id = assignment.rt_unit_id
   AND account.account_type = 'official'
   AND account.status = 'active'
  WHERE assignment.rt_unit_id = NEW.rt_unit_id
    AND assignment.app_account_id = NEW.created_by_account_id
    AND assignment.app_account_type = 'official'
    AND assignment.role = 'rt_chairman'
    AND assignment.starts_on <= (now() AT TIME ZONE 'Asia/Jakarta')::date
    AND (assignment.ends_on IS NULL OR assignment.ends_on >= (now() AT TIME ZONE 'Asia/Jakarta')::date);
  IF chairman_count <> 1 THEN
    RAISE EXCEPTION 'Only one active same-RT Chairman may create a tariff.'
      USING ERRCODE = '42501', CONSTRAINT = 'fee_rate_chairman_required';
  END IF;
  RETURN NEW;
END;
$$;
