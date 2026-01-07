-- Fix the function search_path issue
CREATE OR REPLACE FUNCTION public.get_next_waiting_list_position(p_workout_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(MAX(position), 0) + 1
  FROM public.waiting_list
  WHERE workout_id = p_workout_id AND is_active = true
$$;