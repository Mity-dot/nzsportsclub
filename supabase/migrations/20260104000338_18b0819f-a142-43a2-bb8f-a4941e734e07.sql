-- Create storage bucket for card images
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-images', 'card-images', false);

-- RLS policies for card images bucket
CREATE POLICY "Users can upload their own card image"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'card-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own card image"
ON storage.objects FOR SELECT
USING (bucket_id = 'card-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Staff can view all card images"
ON storage.objects FOR SELECT
USING (bucket_id = 'card-images' AND public.is_staff_or_admin(auth.uid()));

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_queue;