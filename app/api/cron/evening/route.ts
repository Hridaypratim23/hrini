import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

// Called by Vercel Cron at 9:00pm IST (15:30 UTC)
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, push_subscription')
    .not('push_subscription', 'is', null)

  const results = await Promise.allSettled(
    (profiles || []).map((p) =>
      webpush.sendNotification(
        JSON.parse(p.push_subscription),
        JSON.stringify({
          title: '🌙 End of day, ' + (p.name || 'love'),
          body: 'Share a highlight from your day with her 📸',
          url: '/home',
        })
      )
    )
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  return NextResponse.json({ ok: true, sent })
}
