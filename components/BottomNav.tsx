'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/home', label: 'Home', icon: '🏠' },
  { href: '/love-jar', label: 'Love Jar', icon: '💌' },
  { href: '/games', label: 'Games', icon: '🎮' },
  { href: '/bucket-list', label: 'Dreams', icon: '🗺️' },
  { href: '/love-language', label: 'Love Log', icon: '💕' },
]

export default function BottomNav() {
  const pathname = usePathname()

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
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-0"
              style={{
                color: isActive ? '#D4A0A7' : '#A8A29E',
              }}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
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
                <div
                  className="w-1 h-1 rounded-full mt-0.5"
                  style={{ backgroundColor: '#D4A0A7' }}
                />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
