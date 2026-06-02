-- Add 'plan' to messages type constraint
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_type_check
  CHECK (type IN ('text', 'photo', 'miss_you', 'love_quote', 'plan'));
