'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { AppProvider, useApp } from '@/contexts/AppContext'
import { createClient } from '@/lib/supabase'

const MORE_ITEMS = [
  { href: '/morning-note', label: 'Notes', icon: '✍️', description: 'Morning notes & prompts' },
  { href: '/love-jar', label: 'Love Jar', icon: '💌', description: 'Secret love notes' },
  { href: '/games', label: 'Games', icon: '🎮', description: 'Play together' },
]
const MORE_PATHS = MORE_ITEMS.map((m) => m.href)

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
  const router = useRouter()
  const { userId, partnerProfile } = useApp()
  const supabase = createClient()
  const [unreadCount, setUnreadCount] = useState(0)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [showMore, setShowMore] = useState(false)

  const isOnMessages = pathname === '/messages'
  const isMoreActive = MORE_PATHS.includes(pathname)

  useEffect(() => { setShowMore(false) }, [pathname])

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
    { href: '/love-language', label: 'Love Log', icon: '❤️' },
    { href: '/milestones', label: 'Story', icon: '💍' },
  ]

  if (isOnMessages && keyboardVisible) return null

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t"
        style={{ backgroundColor: '#1C1917', borderColor: '#3D3633', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around px-2 py-2">
          {/* Regular tabs */}
          {tabs.slice(0, 2).map((tab) => {
            const isActive = pathname === tab.href
            return (
              <Link key={tab.href} href={tab.href} prefetch={true}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-0 relative"
                style={{ color: isActive ? '#D4A0A7' : '#A8A29E' }}>
                <span className="text-xl leading-none relative">
                  {tab.icon}
                  {'badge' in tab && tab.badge && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                  )}
                </span>
                <span style={{ fontSize: '0.65rem', color: isActive ? '#D4A0A7' : '#A8A29E', fontWeight: isActive ? '600' : '400' }}>
                  {tab.label}
                </span>
                {isActive && <div className="w-1 h-1 rounded-full mt-0.5" style={{ backgroundColor: '#D4A0A7' }} />}
              </Link>
            )
          })}

          {/* More button */}
          <button
            onClick={() => setShowMore((v) => !v)}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-0 relative"
            style={{ color: isMoreActive || showMore ? '#D4A0A7' : '#A8A29E', background: 'none', border: 'none', cursor: 'pointer' }}>
            <span className="text-xl leading-none">✨</span>
            <span style={{ fontSize: '0.65rem', color: isMoreActive || showMore ? '#D4A0A7' : '#A8A29E', fontWeight: isMoreActive || showMore ? '600' : '400' }}>
              More
            </span>
            {(isMoreActive || showMore) && <div className="w-1 h-1 rounded-full mt-0.5" style={{ backgroundColor: '#D4A0A7' }} />}
          </button>

          {/* Remaining tabs */}
          {tabs.slice(2).map((tab) => {
            const isActive = pathname === tab.href
            return (
              <Link key={tab.href} href={tab.href} prefetch={true}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-0 relative"
                style={{ color: isActive ? '#D4A0A7' : '#A8A29E' }}>
                <span className="text-xl leading-none">{tab.icon}</span>
                <span style={{ fontSize: '0.65rem', color: isActive ? '#D4A0A7' : '#A8A29E', fontWeight: isActive ? '600' : '400' }}>
                  {tab.label}
                </span>
                {isActive && <div className="w-1 h-1 rounded-full mt-0.5" style={{ backgroundColor: '#D4A0A7' }} />}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* More sheet */}
      {showMore && (
        <div
          className="fixed inset-0 z-[55]"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowMore(false)}>
          <div
            className="fixed bottom-0 left-0 right-0"
            style={{
              backgroundColor: '#1a1613',
              borderTop: '1px solid #2E2822',
              borderRadius: '24px 24px 0 0',
              padding: '0 20px',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
            }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '36px', height: '4px', borderRadius: '99px', backgroundColor: '#3D3633', margin: '14px auto 20px' }} />
            <p style={{ fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4A4440', fontWeight: 600, marginBottom: '14px' }}>
              More
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {MORE_ITEMS.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link key={item.href} href={item.href}
                    style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 16px', borderRadius: '16px', textDecoration: 'none', backgroundColor: isActive ? 'rgba(212,160,167,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isActive ? 'rgba(212,160,167,0.25)' : '#2E2822'}` }}>
                    <span style={{ fontSize: '1.6rem', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.04)' }}>
                      {item.icon}
                    </span>
                    <div>
                      <p style={{ fontSize: '0.95rem', fontWeight: 600, color: isActive ? '#D4A0A7' : '#E8E0D8' }}>{item.label}</p>
                      <p style={{ fontSize: '0.72rem', color: '#5A5450', marginTop: '2px' }}>{item.description}</p>
                    </div>
                    {isActive && <div style={{ marginLeft: 'auto', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#D4A0A7' }} />}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
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
