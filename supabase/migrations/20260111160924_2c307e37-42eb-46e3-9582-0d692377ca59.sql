-- Automatically promote users from waiting_list when a spot frees up.

-- Promote as many users as there are free spots (keeps waiting_list order by position).
CREATE OR REPLACE FUNCTION public.promote_waiting_list_until_full(p_workout_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max_spots integer;
  v_active_count integer;
  v_promoted_user uuid;
  v_promoted_count integer := 0;
BEGIN
  SELECT max_spots INTO v_max_spots
  FROM public.workouts
  WHERE id = p_workout_id;

  IF v_max_spots IS NULL THEN
    RETURN 0;
  END IF;

  LOOP
    SELECT COUNT(*)::integer INTO v_active_count
    FROM public.reservations
    WHERE workout_id = p_workout_id
      AND is_active = true;

    EXIT WHEN v_active_count >= v_max_spots;

    -- This function already picks the lowest position active entry first.
    SELECT public.promote_from_waiting_list(p_workout_id) INTO v_promoted_user;

    EXIT WHEN v_promoted_user IS NULL;

    v_promoted_count := v_promoted_count + 1;
  END LOOP;

  RETURN v_promoted_count;
END;
$$;

-- Trigger function: when an active reservation becomes inactive (or is deleted), promote from waiting list.
CREATE OR REPLACE FUNCTION public.on_reservation_spot_freed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_active = true AND NEW.is_active = false THEN
      PERFORM public.promote_waiting_list_until_full(OLD.workout_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_active = true THEN
      PERFORM public.promote_waiting_list_until_full(OLD.workout_id);
    END IF;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Recreate triggers (idempotent)
DROP TRIGGER IF EXISTS reservations_promote_waiting_list_on_update ON public.reservations;
CREATE TRIGGER reservations_promote_waiting_list_on_update
AFTER UPDATE OF is_active ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.on_reservation_spot_freed();

DROP TRIGGER IF EXISTS reservations_promote_waiting_list_on_delete ON public.reservations;
CREATE TRIGGER reservations_promote_waiting_list_on_delete
AFTER DELETE ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.on_reservation_spot_freed();
