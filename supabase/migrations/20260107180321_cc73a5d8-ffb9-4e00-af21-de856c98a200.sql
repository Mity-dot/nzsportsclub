-- Allow staff/admin to INSERT into user_roles for activating members
CREATE POLICY "Staff can insert member roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_staff_or_admin(auth.uid()) AND
  role IN ('member', 'card_member')
);