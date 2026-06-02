'use client'

import { useEffect } from 'react'
import { registerPushNotifications } from '@/lib/push'

export function usePush() {
  useEffect(() => {
    registerPushNotifications().then(async (sub) => {
      if (!sub) return
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      })
    })
  }, [])
}

export async function notifyPartner(
  partnerId: string,
  title: string,
  body: string,
  url = '/home'
) {
  await fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, url, targetUserId: partnerId }),
  })
}
