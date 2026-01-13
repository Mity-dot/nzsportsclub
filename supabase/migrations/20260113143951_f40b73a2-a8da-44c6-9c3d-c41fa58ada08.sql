-- Backfill missing profiles for existing auth users
-- (Fixes staff seeing 'Member' instead of names and prevents reservation RLS failures)
INSERT INTO public.profiles (user_id, email, full_name, member_type)
SELECT
  u.id AS user_id,
  COALESCE(u.email, '') AS email,
  NULLIF(COALESCE(u.raw_user_meta_data ->> 'full_name', ''), '') AS full_name,
  COALESCE((u.raw_user_meta_data ->> 'member_type')::public.member_type, 'regular'::public.member_type) AS member_type
FROM auth.users u
LEFT JOIN public.profiles p
  ON p.user_id = u.id
WHERE p.user_id IS NULL
  AND u.email IS NOT NULL;
