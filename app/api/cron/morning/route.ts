import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

// Called by Vercel Cron at 7:30am IST (02:00 UTC)
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

  if (!profiles?.length) return NextResponse.json({ ok: true, sent: 0 })

  const results = await Promise.allSettled(
    profiles.map((p) =>
      webpush.sendNotification(
        JSON.parse(p.push_subscription),
        JSON.stringify({
          title: '🌄 Good morning, ' + (p.name || 'love'),
          body: "Write today's morning note for her 💌",
          url: '/morning-note',
        })
      )
    )
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  return NextResponse.json({ ok: true, sent })
}
