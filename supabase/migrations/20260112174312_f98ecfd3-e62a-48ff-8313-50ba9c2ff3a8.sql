-- Fix the broken RLS policy for reservations
-- The current policy has "r.workout_id = r.workout_id" which always evaluates to true
-- This causes the EXISTS check to always be true, blocking all reservations

DROP POLICY IF EXISTS "Members can create reservations" ON public.reservations;

CREATE POLICY "Members can create reservations" 
ON public.reservations 
FOR INSERT 
WITH CHECK (
  (auth.uid() = user_id) 
  AND is_member_or_card_member(auth.uid()) 
  AND (NOT EXISTS (
    SELECT 1
    FROM public.reservations r
    WHERE r.workout_id = reservations.workout_id
      AND r.user_id = auth.uid()
      AND r.is_active = true
  ))
);