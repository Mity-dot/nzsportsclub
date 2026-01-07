-- Add column to track if auto-reserve has been executed for a workout
ALTER TABLE public.workouts 
ADD COLUMN auto_reserve_executed BOOLEAN DEFAULT false;

-- Add column to enable/disable auto-reserve per workout
ALTER TABLE public.workouts 
ADD COLUMN auto_reserve_enabled BOOLEAN DEFAULT true;