CREATE TABLE IF NOT EXISTS public.couple_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  planned_at TIMESTAMPTZ,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  done_by UUID REFERENCES public.profiles(id),
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.couple_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "couple_plans_select" ON public.couple_plans
  FOR SELECT USING (
    auth.uid() = created_by OR
    created_by = (SELECT partner_id FROM public.profiles WHERE id = auth.uid()) OR
    auth.uid() = (SELECT partner_id FROM public.profiles WHERE id = created_by)
  );

CREATE POLICY "couple_plans_insert" ON public.couple_plans
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "couple_plans_update" ON public.couple_plans
  FOR UPDATE USING (
    auth.uid() = created_by OR
    created_by = (SELECT partner_id FROM public.profiles WHERE id = auth.uid()) OR
    auth.uid() = (SELECT partner_id FROM public.profiles WHERE id = created_by)
  );

CREATE POLICY "couple_plans_delete" ON public.couple_plans
  FOR DELETE USING (
    auth.uid() = created_by OR
    created_by = (SELECT partner_id FROM public.profiles WHERE id = auth.uid()) OR
    auth.uid() = (SELECT partner_id FROM public.profiles WHERE id = created_by)
  );
