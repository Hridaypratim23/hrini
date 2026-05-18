-- HRINI App - Supabase Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  partner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  coming_home_time TIME,                   -- e.g. '18:30:00'
  push_subscription TEXT,                  -- JSON string of PushSubscription
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own and their partner's profile
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id OR
    auth.uid() = partner_id OR
    id = (SELECT partner_id FROM public.profiles WHERE id = auth.uid())
  );

-- Users can insert their own profile
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.phone, ''),
    COALESCE(NEW.raw_user_meta_data->>'name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- MOOD CHECKINS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mood_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mood TEXT NOT NULL CHECK (mood IN ('happy', 'loved', 'tired', 'missing_you', 'excited', 'calm')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.mood_checkins ENABLE ROW LEVEL SECURITY;

-- Users and their partners can read mood checkins
CREATE POLICY "mood_checkins_select" ON public.mood_checkins
  FOR SELECT USING (
    auth.uid() = user_id OR
    user_id = (SELECT partner_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "mood_checkins_insert" ON public.mood_checkins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- LOVE JAR NOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.love_jar_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revealed_at TIMESTAMPTZ
);

ALTER TABLE public.love_jar_notes ENABLE ROW LEVEL SECURITY;

-- Both partners can read all jar notes
CREATE POLICY "love_jar_notes_select" ON public.love_jar_notes
  FOR SELECT USING (
    auth.uid() = from_user_id OR
    from_user_id = (SELECT partner_id FROM public.profiles WHERE id = auth.uid()) OR
    auth.uid() = (SELECT partner_id FROM public.profiles WHERE id = from_user_id)
  );

CREATE POLICY "love_jar_notes_insert" ON public.love_jar_notes
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "love_jar_notes_update" ON public.love_jar_notes
  FOR UPDATE USING (
    auth.uid() = from_user_id OR
    auth.uid() = (SELECT partner_id FROM public.profiles WHERE id = from_user_id)
  );

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'photo', 'miss_you', 'love_quote')),
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select" ON public.messages
  FOR SELECT USING (
    auth.uid() = from_user_id OR
    from_user_id = (SELECT partner_id FROM public.profiles WHERE id = auth.uid()) OR
    auth.uid() = (SELECT partner_id FROM public.profiles WHERE id = from_user_id)
  );

CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- ============================================================
-- BUCKET LIST
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bucket_list (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bucket_list ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bucket_list_select" ON public.bucket_list
  FOR SELECT USING (
    auth.uid() = created_by OR
    created_by = (SELECT partner_id FROM public.profiles WHERE id = auth.uid()) OR
    auth.uid() = (SELECT partner_id FROM public.profiles WHERE id = created_by)
  );

CREATE POLICY "bucket_list_insert" ON public.bucket_list
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "bucket_list_update" ON public.bucket_list
  FOR UPDATE USING (
    auth.uid() = created_by OR
    created_by = (SELECT partner_id FROM public.profiles WHERE id = auth.uid()) OR
    auth.uid() = (SELECT partner_id FROM public.profiles WHERE id = created_by)
  );

CREATE POLICY "bucket_list_delete" ON public.bucket_list
  FOR DELETE USING (auth.uid() = created_by);

-- ============================================================
-- LOVE LANGUAGE LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS public.love_language_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('words', 'acts', 'gifts', 'time', 'touch')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.love_language_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "love_language_log_select" ON public.love_language_log
  FOR SELECT USING (
    auth.uid() = user_id OR
    user_id = (SELECT partner_id FROM public.profiles WHERE id = auth.uid()) OR
    auth.uid() = (SELECT partner_id FROM public.profiles WHERE id = user_id)
  );

CREATE POLICY "love_language_log_insert" ON public.love_language_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- MILESTONES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  milestone_date DATE NOT NULL,
  emoji TEXT NOT NULL DEFAULT '✨',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "milestones_select" ON public.milestones
  FOR SELECT USING (
    auth.uid() = created_by OR
    created_by = (SELECT partner_id FROM public.profiles WHERE id = auth.uid()) OR
    auth.uid() = (SELECT partner_id FROM public.profiles WHERE id = created_by)
  );

CREATE POLICY "milestones_insert" ON public.milestones
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "milestones_delete" ON public.milestones
  FOR DELETE USING (auth.uid() = created_by);

-- ============================================================
-- GAME RESPONSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL CHECK (game_type IN ('wyr', 'kwym')),
  question_id INTEGER NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.game_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game_responses_select" ON public.game_responses
  FOR SELECT USING (
    auth.uid() = user_id OR
    user_id = (SELECT partner_id FROM public.profiles WHERE id = auth.uid()) OR
    auth.uid() = (SELECT partner_id FROM public.profiles WHERE id = user_id)
  );

CREATE POLICY "game_responses_insert" ON public.game_responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- MORNING NOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.morning_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.morning_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "morning_notes_select" ON public.morning_notes
  FOR SELECT USING (
    auth.uid() = from_user_id OR
    from_user_id = (SELECT partner_id FROM public.profiles WHERE id = auth.uid()) OR
    auth.uid() = (SELECT partner_id FROM public.profiles WHERE id = from_user_id)
  );

CREATE POLICY "morning_notes_insert" ON public.morning_notes
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- ============================================================
-- STORAGE BUCKET for photos
-- ============================================================
-- Run in Supabase dashboard: Storage > New Bucket > "photos" (public)
-- Or via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', true);

-- Storage policies (run after creating bucket)
-- CREATE POLICY "photos_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'photos' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "photos_select" ON storage.objects FOR SELECT USING (bucket_id = 'photos');

-- ============================================================
-- REALTIME
-- ============================================================
-- Enable realtime on these tables in Supabase Dashboard > Database > Replication:
-- mood_checkins, messages, love_jar_notes, morning_notes
