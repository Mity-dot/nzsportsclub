-- Allow users to update their own push subscriptions
CREATE POLICY "Users can update own subscriptions"
ON public.push_subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);