-- Add last_seen_at to profiles for online/last-seen status in messages
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
