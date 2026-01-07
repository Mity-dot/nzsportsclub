-- Allow staff to update member profiles (for promotion/demotion member_type changes)
CREATE POLICY "Staff can update profiles" 
ON public.profiles 
FOR UPDATE 
USING (is_staff_or_admin(auth.uid()));