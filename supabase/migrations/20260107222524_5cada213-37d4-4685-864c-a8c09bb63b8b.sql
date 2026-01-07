-- Add workout_type column to workouts (early/late)
ALTER TABLE public.workouts 
ADD COLUMN workout_type text NOT NULL DEFAULT 'early' CHECK (workout_type IN ('early', 'late'));

-- Add preferred_workout_type to profiles for card members auto-reserve preference
ALTER TABLE public.profiles 
ADD COLUMN preferred_workout_type text DEFAULT NULL CHECK (preferred_workout_type IS NULL OR preferred_workout_type IN ('early', 'late'));

-- Create waiting_list table for members waiting for spots
CREATE TABLE public.waiting_list (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workout_id UUID NOT NULL,
  user_id UUID NOT NULL,
  position INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  UNIQUE(workout_id, user_id)
);

-- Enable RLS on waiting_list
ALTER TABLE public.waiting_list ENABLE ROW LEVEL SECURITY;

-- RLS policies for waiting_list
CREATE POLICY "Users can view own waiting list entries"
ON public.waiting_list
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own waiting list entries"
ON public.waiting_list
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own waiting list entries"
ON public.waiting_list
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own waiting list entries"
ON public.waiting_list
FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all waiting list entries"
ON public.waiting_list
FOR SELECT
USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can manage all waiting list entries"
ON public.waiting_list
FOR ALL
USING (is_staff_or_admin(auth.uid()));

-- Create function to get next position in waiting list
CREATE OR REPLACE FUNCTION public.get_next_waiting_list_position(p_workout_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(MAX(position), 0) + 1
  FROM public.waiting_list
  WHERE workout_id = p_workout_id AND is_active = true
$$;

-- Create function to promote first waiting list member to reservation
CREATE OR REPLACE FUNCTION public.promote_from_waiting_list(p_workout_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_user_id UUID;
  v_waiting_id UUID;
BEGIN
  -- Get the first active waiting list entry
  SELECT id, user_id INTO v_waiting_id, v_next_user_id
  FROM public.waiting_list
  WHERE workout_id = p_workout_id AND is_active = true
  ORDER BY position ASC
  LIMIT 1;
  
  IF v_next_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Mark waiting list entry as inactive
  UPDATE public.waiting_list
  SET is_active = false, notified_at = now()
  WHERE id = v_waiting_id;
  
  -- Create or reactivate reservation for this user
  INSERT INTO public.reservations (workout_id, user_id, is_active, reserved_at)
  VALUES (p_workout_id, v_next_user_id, true, now())
  ON CONFLICT (workout_id, user_id) 
  DO UPDATE SET is_active = true, cancelled_at = NULL, reserved_at = now();
  
  RETURN v_next_user_id;
END;
$$;

-- Add unique constraint on reservations for conflict handling
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'reservations_workout_user_unique'
  ) THEN
    ALTER TABLE public.reservations 
    ADD CONSTRAINT reservations_workout_user_unique UNIQUE (workout_id, user_id);
  END IF;
END $$;