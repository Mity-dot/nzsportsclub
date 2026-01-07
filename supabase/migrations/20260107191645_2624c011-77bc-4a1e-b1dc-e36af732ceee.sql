-- Allow staff to insert reservations for any member
CREATE POLICY "Staff can insert reservations" 
ON public.reservations 
FOR INSERT 
WITH CHECK (is_staff_or_admin(auth.uid()));

-- Allow staff to delete/deactivate any reservation
CREATE POLICY "Staff can delete reservations" 
ON public.reservations 
FOR DELETE 
USING (is_staff_or_admin(auth.uid()));