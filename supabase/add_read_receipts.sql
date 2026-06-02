-- Add read_at to messages for read receipts
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Allow partner to mark messages as read (update read_at only)
CREATE POLICY "messages_update_read" ON public.messages
  FOR UPDATE USING (
    -- Partner can mark your messages as read
    from_user_id = (SELECT partner_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    from_user_id = (SELECT partner_id FROM public.profiles WHERE id = auth.uid())
  );

-- Allow owner to update their own messages (for edit/unsend)
CREATE POLICY "messages_update_own" ON public.messages
  FOR UPDATE USING (auth.uid() = from_user_id)
  WITH CHECK (auth.uid() = from_user_id);

-- Allow owner to delete their own messages (for unsend)
CREATE POLICY "messages_delete_own" ON public.messages
  FOR DELETE USING (auth.uid() = from_user_id);

-- Enable realtime for messages (needed for read receipt updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
