'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { AppProvider, useApp } from '@/contexts/AppContext'
import { createClient } from '@/lib/supabase'

const LAST_SEEN_KEY = 'last_seen_messages'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/')
    })
  }, [])

  return <>{children}</>
}

function PersistentNav() {
  const pathname = usePathname()
  const { userId, partnerProfile } = useApp()
  const supabase = createClient()
  const [unreadCount, setUnreadCount] = useState(0)
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  const isOnMessages = pathname === '/messages'

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => setKeyboardVisible(window.innerHeight - vv.height > 150)
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  // Mark as seen when on messages page
  useEffect(() => {
    if (isOnMessages) {
      setUnreadCount(0)
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString())
    }
  }, [isOnMessages])

  // Load unread count and subscribe to realtime
  useEffect(() => {
    if (!userId || !partnerProfile?.id) return

    async function fetchUnread() {
      if (isOnMessages) return

      const lastSeen = localStorage.getItem(LAST_SEEN_KEY)
      const since = lastSeen ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('from_user_id', partnerProfile!.id)
        .gt('created_at', since)

      setUnreadCount(count ?? 0)
    }

    fetchUnread()

    // Realtime subscription: increment when new message arrives from partner
    const channel = supabase
      .channel('unread-badge')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `from_user_id=eq.${partnerProfile.id}`,
      }, () => {
        if (!isOnMessages) {
          setUnreadCount((prev) => prev + 1)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, partnerProfile?.id, isOnMessages])

  const tabs = [
    { href: '/home', label: 'Home', icon: '🏠' },
    { href: '/messages', label: 'Messages', icon: '💬', badge: unreadCount > 0 },
    { href: '/morning-note', label: 'Notes', icon: '✍️' },
    { href: '/love-jar', label: 'Love Jar', icon: '💌' },
    { href: '/love-language', label: 'Love Log', icon: '❤️' },
    { href: '/milestones', label: 'Story', icon: '💍' },
  ]

  if (isOnMessages && keyboardVisible) return null

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t"
      style={{
        backgroundColor: '#1C1917',
        borderColor: '#3D3633',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex items-center justify-around px-2 py-2">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={true}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-0 relative"
              style={{ color: isActive ? '#D4A0A7' : '#A8A29E' }}
            >
              <span className="text-xl leading-none relative">
                {tab.icon}
                {'badge' in tab && tab.badge && (
                  <span
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: '#ef4444' }}
                  />
                )}
              </span>
              <span
                className="text-xs font-medium truncate"
                style={{
                  fontSize: '0.65rem',
                  color: isActive ? '#D4A0A7' : '#A8A29E',
                  fontWeight: isActive ? '600' : '400',
                }}
              >
                {tab.label}
              </span>
              {isActive && (
                <div className="w-1 h-1 rounded-full mt-0.5" style={{ backgroundColor: '#D4A0A7' }} />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AuthGuard>
        {children}
        <PersistentNav />
      </AuthGuard>
    </AppProvider>
  )
}
