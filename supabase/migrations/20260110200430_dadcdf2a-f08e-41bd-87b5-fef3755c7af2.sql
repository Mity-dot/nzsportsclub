-- Create a database function to get public reservation count
-- This bypasses RLS so all users see consistent spot counts
CREATE OR REPLACE FUNCTION public.get_reservation_count(p_workout_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM reservations
  WHERE workout_id = p_workout_id
  AND is_active = true;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_reservation_count TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reservation_count TO anon;