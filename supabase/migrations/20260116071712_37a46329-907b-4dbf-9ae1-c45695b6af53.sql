-- Add policy for users to update their own card image
CREATE POLICY "Users can update their own card image"
ON storage.objects FOR UPDATE
USING (bucket_id = 'card-images' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'card-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add policy for users to delete their own card image (for replacing)
CREATE POLICY "Users can delete their own card image"
ON storage.objects FOR DELETE
USING (bucket_id = 'card-images' AND auth.uid()::text = (storage.foldername(name))[1]);