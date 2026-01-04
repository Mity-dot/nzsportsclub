-- Drop the existing staff profile access policy
DROP POLICY IF EXISTS "Staff can view all profiles" ON public.profiles;

-- Create new policy for staff to only see names and card images (limited profile data)
CREATE POLICY "Staff can view limited profile data" 
ON public.profiles 
FOR SELECT 
USING (
  is_staff_or_admin(auth.uid()) 
  AND auth.uid() IS NOT NULL
);

-- Note: The actual data limitation will be handled in the application query
-- since RLS policies can't limit specific columns

-- Add explicit anonymous access prevention for profiles
-- This ensures unauthenticated requests cannot access profiles
CREATE POLICY "Require authentication for profiles" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Drop the existing reservation insert policy
DROP POLICY IF EXISTS "Authenticated users can create reservations" ON public.reservations;

-- Create helper function to check if user is a member (not staff/admin only)
CREATE OR REPLACE FUNCTION public.is_member_or_card_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('staff', 'admin')
      AND is_approved = true
  )
$$;

-- Create new reservation policy - only members/card members can reserve (not staff)
CREATE POLICY "Only members can create reservations" 
ON public.reservations 
FOR INSERT 
WITH CHECK (
  auth.uid() = user_id 
  AND is_member_or_card_member(auth.uid())
);