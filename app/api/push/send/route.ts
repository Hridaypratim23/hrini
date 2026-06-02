import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServerSupabaseClient } from '@/lib/supabase-server'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, body, url, targetUserId } = await req.json()

  // Get push subscription for the target user (partner or self)
  const { data: profile } = await supabase
    .from('profiles')
    .select('push_subscription')
    .eq('id', targetUserId)
    .single()

  if (!profile?.push_subscription) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 404 })
  }

  const subscription = JSON.parse(profile.push_subscription)

  // Count unread messages from the sender so the badge reflects the actual backlog
  const { count: unreadCount } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('from_user_id', user.id)
    .is('read_at', null)

  try {
    await webpush.sendNotification(subscription, JSON.stringify({ title, body, url, badge: unreadCount ?? 1 }))
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send notification'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
