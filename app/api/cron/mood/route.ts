import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

// Called by Vercel Cron at 12:00pm IST (06:30 UTC)
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Only ping users who haven't checked in today
  const today = new Date().toISOString().slice(0, 10)
  const { data: checkedIn } = await supabase
    .from('mood_checkins')
    .select('user_id')
    .gte('created_at', today)

  const checkedInIds = new Set((checkedIn || []).map((c) => c.user_id))

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, push_subscription')
    .not('push_subscription', 'is', null)

  const pending = (profiles || []).filter((p) => !checkedInIds.has(p.id))

  const results = await Promise.allSettled(
    pending.map((p) =>
      webpush.sendNotification(
        JSON.parse(p.push_subscription),
        JSON.stringify({
          title: '💭 Midday check-in',
          body: 'How are you feeling right now? Let her know 💕',
          url: '/home',
        })
      )
    )
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  return NextResponse.json({ ok: true, sent })
}
