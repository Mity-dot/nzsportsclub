-- Allow staff to update any reservation (for cancelling members from workouts)
CREATE POLICY "Staff can update reservations" 
ON public.reservations 
FOR UPDATE 
USING (is_staff_or_admin(auth.uid()));