-- Add per-user auto-reserve preference (for card members)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS auto_reserve_enabled boolean NOT NULL DEFAULT true;