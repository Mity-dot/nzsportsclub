-- Add reservation_opens_hours column to workouts table (how many hours before the workout reservations open)
ALTER TABLE public.workouts 
ADD COLUMN IF NOT EXISTS reservation_opens_hours integer DEFAULT 24;

-- Update reservations RLS to allow re-reservation
-- First drop existing policy and recreate
DROP POLICY IF EXISTS "Only members can create reservations" ON public.reservations;

-- New policy: members can reserve, and can re-reserve after canceling (no active reservation for same workout)
CREATE POLICY "Members can create reservations"
ON public.reservations
FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND is_member_or_card_member(auth.uid())
  AND NOT EXISTS (
    SELECT 1 FROM public.reservations r 
    WHERE r.workout_id = workout_id 
    AND r.user_id = auth.uid() 
    AND r.is_active = true
  )
);

-- Allow staff to delete profiles (remove members)
DROP POLICY IF EXISTS "Staff can delete profiles" ON public.profiles;
CREATE POLICY "Staff can delete profiles"
ON public.profiles
FOR DELETE
USING (is_staff_or_admin(auth.uid()));

-- Allow staff to update user_roles (for promotions/demotions)
DROP POLICY IF EXISTS "Staff can update roles" ON public.user_roles;
CREATE POLICY "Staff can update member roles"
ON public.user_roles
FOR UPDATE
USING (
  is_staff_or_admin(auth.uid()) 
  AND role IN ('member', 'card_member')
);

-- Allow staff to delete user_roles (for removing members)
DROP POLICY IF EXISTS "Staff can delete member roles" ON public.user_roles;
CREATE POLICY "Staff can delete member roles"
ON public.user_roles
FOR DELETE
USING (
  is_staff_or_admin(auth.uid())
  AND role IN ('member', 'card_member', 'staff')
);

-- Allow staff to view all user roles (not just admin)
DROP POLICY IF EXISTS "Staff can view all roles" ON public.user_roles;
CREATE POLICY "Staff can view all roles"
ON public.user_roles
FOR SELECT
USING (is_staff_or_admin(auth.uid()));