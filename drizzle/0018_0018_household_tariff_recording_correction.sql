CREATE TABLE IF NOT EXISTS "monthly_due_recording_corrections" (
	"rt_unit_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"monthly_due_id" uuid NOT NULL,
	"recorded_amount" integer NOT NULL,
	"collection_target_amount" integer NOT NULL,
	"correction_code" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_due_recording_corrections_pk" PRIMARY KEY("monthly_due_id"),
	CONSTRAINT "monthly_due_recording_corrections_recorded_amount_positive" CHECK ("monthly_due_recording_corrections"."recorded_amount" > 0),
	CONSTRAINT "monthly_due_recording_corrections_collection_target_positive" CHECK ("monthly_due_recording_corrections"."collection_target_amount" > 0),
	CONSTRAINT "monthly_due_recording_corrections_code" CHECK ("monthly_due_recording_corrections"."correction_code" = '2026_household_tariff_recording_v1')
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'monthly_due_recording_corrections_due_scope_fk'
      AND conrelid = 'public.monthly_due_recording_corrections'::regclass
  ) THEN
    ALTER TABLE public.monthly_due_recording_corrections
      ADD CONSTRAINT monthly_due_recording_corrections_due_scope_fk
      FOREIGN KEY (rt_unit_id, household_id, monthly_due_id)
      REFERENCES public.monthly_dues(rt_unit_id, household_id, id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.due_effective_target_phase11_v1(target_due_id uuid) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT coalesce(correction.collection_target_amount, due.amount)::numeric
       + coalesce(sum(adjustment.amount_delta), 0)
  FROM public.monthly_dues due
  LEFT JOIN public.monthly_due_recording_corrections correction
    ON correction.monthly_due_id = due.id
   AND correction.rt_unit_id = due.rt_unit_id
   AND correction.household_id = due.household_id
  LEFT JOIN public.due_adjustments adjustment
    ON adjustment.monthly_due_id = due.id
   AND adjustment.rt_unit_id = due.rt_unit_id
   AND adjustment.household_id = due.household_id
  WHERE due.id = target_due_id
  GROUP BY due.amount, correction.collection_target_amount
$$;
--> statement-breakpoint
DO $$
DECLARE
  target_households bigint;
  target_due_count bigint;
  existing_corrections bigint;
  invalid_existing_corrections bigint;
  invalid_due_rows bigint;
BEGIN
  SELECT count(*) INTO existing_corrections
  FROM public.monthly_due_recording_corrections;

  IF existing_corrections = 24 THEN
    SELECT count(*) INTO invalid_existing_corrections
    FROM public.monthly_due_recording_corrections correction
    JOIN public.monthly_dues due
      ON due.id = correction.monthly_due_id
     AND due.rt_unit_id = correction.rt_unit_id
     AND due.household_id = correction.household_id
    JOIN public.households household
      ON household.id = correction.household_id
     AND household.rt_unit_id = correction.rt_unit_id
    JOIN public.houses house
      ON house.id = household.house_id
     AND house.rt_unit_id = household.rt_unit_id
    JOIN public.billing_years year
      ON year.id = due.billing_year_id
     AND year.rt_unit_id = due.rt_unit_id
    WHERE year.year <> 2026
       OR upper(house.number) NOT IN ('BLOKD1', 'BLOKC2B')
       OR correction.correction_code <> '2026_household_tariff_recording_v1'
       OR correction.recorded_amount <> CASE upper(house.number)
            WHEN 'BLOKD1' THEN 50000 ELSE 25000 END
       OR correction.collection_target_amount <> CASE
            WHEN due.status = 'unpaid' THEN correction.recorded_amount
            ELSE due.amount END;
    IF invalid_existing_corrections <> 0 THEN
      RAISE EXCEPTION 'Existing 2026 household tariff recording corrections do not match the approved correction set.';
    END IF;
    RETURN;
  ELSIF existing_corrections <> 0 THEN
    RAISE EXCEPTION 'Partial household tariff recording corrections exist; migration stopped without changing them.';
  END IF;

  SELECT count(*) INTO target_households
  FROM public.households household
  JOIN public.houses house
    ON house.id = household.house_id
   AND house.rt_unit_id = household.rt_unit_id
  WHERE upper(house.number) IN ('BLOKD1', 'BLOKC2B');

  IF target_households = 0 THEN
    RETURN;
  END IF;
  IF target_households <> 2 OR EXISTS (
    SELECT 1
    FROM public.households household
    JOIN public.houses house
      ON house.id = household.house_id
     AND house.rt_unit_id = household.rt_unit_id
    WHERE upper(house.number) IN ('BLOKD1', 'BLOKC2B')
    GROUP BY upper(house.number)
    HAVING count(*) <> 1
  ) OR (
    SELECT count(DISTINCT household.rt_unit_id)
    FROM public.households household
    JOIN public.houses house
      ON house.id = household.house_id
     AND house.rt_unit_id = household.rt_unit_id
    WHERE upper(house.number) IN ('BLOKD1', 'BLOKC2B')
  ) <> 1 THEN
    RAISE EXCEPTION 'The two approved household identifiers are ambiguous; migration stopped.';
  END IF;

  SELECT count(*) INTO target_due_count
  FROM public.monthly_dues due
  JOIN public.billing_years year
    ON year.id = due.billing_year_id
   AND year.rt_unit_id = due.rt_unit_id
  JOIN public.households household
    ON household.id = due.household_id
   AND household.rt_unit_id = due.rt_unit_id
  JOIN public.houses house
    ON house.id = household.house_id
   AND house.rt_unit_id = household.rt_unit_id
  WHERE year.year = 2026
    AND upper(house.number) IN ('BLOKD1', 'BLOKC2B');
  IF target_due_count <> 24 THEN
    RAISE EXCEPTION 'Expected exactly twelve 2026 dues for each approved household; migration stopped.';
  END IF;

  SELECT count(*) INTO invalid_due_rows
  FROM public.monthly_dues due
  JOIN public.billing_years year
    ON year.id = due.billing_year_id
   AND year.rt_unit_id = due.rt_unit_id
  JOIN public.households household
    ON household.id = due.household_id
   AND household.rt_unit_id = due.rt_unit_id
  JOIN public.houses house
    ON house.id = household.house_id
   AND house.rt_unit_id = household.rt_unit_id
  JOIN public.fee_rates rate
    ON rate.id = due.fee_rate_id
   AND rate.billing_year_id = due.billing_year_id
  WHERE year.year = 2026
    AND upper(house.number) IN ('BLOKD1', 'BLOKC2B')
    AND (
      household.status <> 'active'
      OR household.starts_on <> DATE '2026-01-01'
      OR household.ends_on IS NOT NULL
      OR due.amount <> 40000
      OR rate.monthly_amount <> 40000
      OR due.status <> CASE
        WHEN upper(house.number) = 'BLOKD1' AND due.month BETWEEN 1 AND 10 THEN 'paid'::public.monthly_due_status
        WHEN upper(house.number) = 'BLOKC2B' AND due.month BETWEEN 1 AND 8 THEN 'paid'::public.monthly_due_status
        ELSE 'unpaid'::public.monthly_due_status END
      OR (due.status = 'paid' AND (
        (SELECT count(*) FROM public.sheet2_opening_balance_items opening WHERE opening.monthly_due_id = due.id) <> 1
        OR (SELECT coalesce(sum(opening.amount), 0) FROM public.sheet2_opening_balance_items opening WHERE opening.monthly_due_id = due.id) <> 40000
      ))
      OR (due.status = 'unpaid' AND EXISTS (
        SELECT 1 FROM public.sheet2_opening_balance_items opening WHERE opening.monthly_due_id = due.id
      ))
      OR EXISTS (SELECT 1 FROM public.due_adjustments adjustment WHERE adjustment.monthly_due_id = due.id)
      OR EXISTS (SELECT 1 FROM public.payment_allocations allocation WHERE allocation.monthly_due_id = due.id)
      OR EXISTS (
        SELECT 1
        FROM public.payment_request_claims claim
        JOIN public.payment_requests request ON request.id = claim.request_id
        WHERE claim.monthly_due_id = due.id AND request.status = 'pending'
      )
    );
  IF invalid_due_rows <> 0 THEN
    RAISE EXCEPTION 'The 2026 dues do not match the approved tariff and payment-state preflight; migration stopped.';
  END IF;

  INSERT INTO public.monthly_due_recording_corrections (
    rt_unit_id, household_id, monthly_due_id, recorded_amount,
    collection_target_amount, correction_code
  )
  SELECT
    due.rt_unit_id,
    due.household_id,
    due.id,
    CASE upper(house.number) WHEN 'BLOKD1' THEN 50000 ELSE 25000 END,
    CASE WHEN due.status = 'unpaid'
      THEN CASE upper(house.number) WHEN 'BLOKD1' THEN 50000 ELSE 25000 END
      ELSE due.amount END,
    '2026_household_tariff_recording_v1'
  FROM public.monthly_dues due
  JOIN public.billing_years year
    ON year.id = due.billing_year_id
   AND year.rt_unit_id = due.rt_unit_id
  JOIN public.households household
    ON household.id = due.household_id
   AND household.rt_unit_id = due.rt_unit_id
  JOIN public.houses house
    ON house.id = household.house_id
   AND house.rt_unit_id = household.rt_unit_id
  WHERE year.year = 2026
    AND upper(house.number) IN ('BLOKD1', 'BLOKC2B');
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.reject_monthly_due_recording_correction_mutation_v1() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Monthly due recording corrections are append-only.'
    USING ERRCODE = '55000', CONSTRAINT = 'monthly_due_recording_corrections_append_only';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.guard_monthly_due_recording_correction_insert_v1() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  correction_table_owner name;
  due_row record;
  expected_recorded_amount integer;
  expected_collection_target integer;
BEGIN
  SELECT role.rolname INTO correction_table_owner
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_roles role ON role.oid = relation.relowner
  WHERE relation.oid = TG_RELID;
  IF current_user <> correction_table_owner THEN
    RAISE EXCEPTION 'Recording corrections may only be inserted by the migration owner.'
      USING ERRCODE = '42501', CONSTRAINT = 'monthly_due_recording_corrections_owner_insert';
  END IF;

  SELECT due.amount, due.status, year.year, upper(house.number) AS house_number
  INTO due_row
  FROM public.monthly_dues due
  JOIN public.billing_years year
    ON year.id = due.billing_year_id
   AND year.rt_unit_id = due.rt_unit_id
  JOIN public.households household
    ON household.id = due.household_id
   AND household.rt_unit_id = due.rt_unit_id
  JOIN public.houses house
    ON house.id = household.house_id
   AND house.rt_unit_id = household.rt_unit_id
  WHERE due.id = NEW.monthly_due_id
    AND due.rt_unit_id = NEW.rt_unit_id
    AND due.household_id = NEW.household_id
  FOR KEY SHARE OF due, year, household, house;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A recording correction must match an active 2026 due in the same household.'
      USING ERRCODE = '23514', CONSTRAINT = 'monthly_due_recording_corrections_due_scope';
  END IF;
  IF due_row.year <> 2026 OR due_row.status NOT IN ('paid', 'unpaid') THEN
    RAISE EXCEPTION 'A recording correction must match an active 2026 due in the same household.'
      USING ERRCODE = '23514', CONSTRAINT = 'monthly_due_recording_corrections_due_scope';
  END IF;
  expected_recorded_amount := CASE due_row.house_number
    WHEN 'BLOKD1' THEN 50000
    WHEN 'BLOKC2B' THEN 25000
    ELSE NULL END;
  expected_collection_target := CASE WHEN due_row.status = 'unpaid'
    THEN expected_recorded_amount ELSE due_row.amount END;
  IF expected_recorded_amount IS NULL
     OR NEW.correction_code <> '2026_household_tariff_recording_v1'
     OR NEW.recorded_amount <> expected_recorded_amount
     OR NEW.collection_target_amount <> expected_collection_target THEN
    RAISE EXCEPTION 'The 2026 recording correction does not match the approved household tariff.'
      USING ERRCODE = '23514', CONSTRAINT = 'monthly_due_recording_corrections_tariff_scope';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS monthly_due_recording_corrections_reject_update_delete_v1
  ON public.monthly_due_recording_corrections;
CREATE TRIGGER monthly_due_recording_corrections_reject_update_delete_v1
BEFORE UPDATE OR DELETE ON public.monthly_due_recording_corrections
FOR EACH ROW EXECUTE FUNCTION public.reject_monthly_due_recording_correction_mutation_v1();
--> statement-breakpoint
DROP TRIGGER IF EXISTS monthly_due_recording_corrections_reject_truncate_v1
  ON public.monthly_due_recording_corrections;
CREATE TRIGGER monthly_due_recording_corrections_reject_truncate_v1
BEFORE TRUNCATE ON public.monthly_due_recording_corrections
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_monthly_due_recording_correction_mutation_v1();
--> statement-breakpoint
DROP TRIGGER IF EXISTS monthly_due_recording_corrections_guard_insert_v1
  ON public.monthly_due_recording_corrections;
CREATE TRIGGER monthly_due_recording_corrections_guard_insert_v1
BEFORE INSERT ON public.monthly_due_recording_corrections
FOR EACH ROW EXECUTE FUNCTION public.guard_monthly_due_recording_correction_insert_v1();
