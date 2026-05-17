'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const ALLOWED_EMAILS = ['hridaypratim86@gmail.com', 'rajreeni123@gmail.com']

  async function handleSendLink() {
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address')
      return
    }
    if (!ALLOWED_EMAILS.includes(email.trim().toLowerCase())) {
      setError('This email is not authorized to access HRINI.')
      return
    }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (err) {
      setError(err.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#1C1917' }}
    >
      {/* Ambient rose glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(212,160,167,0.12) 0%, transparent 70%)',
        }}
      />

      {/* Mountain silhouette bottom left */}
      <svg
        className="absolute bottom-0 left-0 opacity-20"
        width="220"
        height="100"
        viewBox="0 0 220 100"
        fill="none"
      >
        <polygon points="0,100 60,30 100,60 140,10 180,50 220,100" fill="#C9A260" />
      </svg>

      {/* Floral element bottom right */}
      <svg
        className="absolute bottom-0 right-0 opacity-15"
        width="160"
        height="120"
        viewBox="0 0 160 120"
        fill="none"
      >
        <circle cx="120" cy="100" r="30" fill="#D4A0A7" />
        <circle cx="100" cy="80" r="20" fill="#D4A0A7" opacity="0.7" />
        <circle cx="140" cy="75" r="18" fill="#D4A0A7" opacity="0.5" />
        <circle cx="115" cy="65" r="12" fill="#C9A260" opacity="0.6" />
        <ellipse cx="90" cy="110" rx="25" ry="12" fill="#D4A0A7" opacity="0.4" />
      </svg>

      {/* Content */}
      <div className="relative z-10 w-full max-w-sm px-6 flex flex-col items-center">
        {/* Logo */}
        <div className="mb-2 text-center">
          <h1
            className="text-7xl font-bold tracking-wider"
            style={{
              fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
              color: '#D4A0A7',
              textShadow: '0 0 40px rgba(212,160,167,0.4)',
            }}
          >
            HRINI
          </h1>
          <p
            className="mt-2 text-2xl"
            style={{
              fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
              color: '#C9A260',
            }}
          >
            Two hearts, one app
          </p>
        </div>

        {/* Decorative divider */}
        <div className="flex items-center gap-3 my-8 w-full">
          <div
            className="flex-1 h-px"
            style={{ background: 'linear-gradient(to right, transparent, #3D3633)' }}
          />
          <span style={{ color: '#D4A0A7' }}>✦</span>
          <div
            className="flex-1 h-px"
            style={{ background: 'linear-gradient(to left, transparent, #3D3633)' }}
          />
        </div>

        {/* Auth Card */}
        <div
          className="w-full rounded-2xl p-6 border"
          style={{ backgroundColor: '#292524', borderColor: '#3D3633' }}
        >
          {!sent ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm mb-2 font-medium" style={{ color: '#A8A29E' }}>
                  Your email address
                </p>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendLink()}
                  className="w-full rounded-xl border px-4 py-3 text-base outline-none transition-colors"
                  style={{
                    backgroundColor: '#1C1917',
                    borderColor: '#3D3633',
                    color: '#F5F0E8',
                  }}
                  inputMode="email"
                  autoComplete="email"
                />
              </div>

              {error && (
                <p className="text-sm text-center" style={{ color: '#E07B7B' }}>
                  {error}
                </p>
              )}

              <button
                onClick={handleSendLink}
                disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-base transition-opacity disabled:opacity-50 cursor-pointer"
                style={{ backgroundColor: '#D4A0A7', color: '#1C1917' }}
              >
                {loading ? 'Sending…' : 'Send Magic Link ✦'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="text-4xl">💌</div>
              <p
                className="text-lg font-semibold text-center"
                style={{
                  fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
                  color: '#F5F0E8',
                }}
              >
                Check your inbox
              </p>
              <p className="text-sm text-center leading-relaxed" style={{ color: '#A8A29E' }}>
                We sent a magic link to{' '}
                <span style={{ color: '#D4A0A7' }}>{email}</span>.
                <br />
                Tap it to enter HRINI.
              </p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="text-xs underline mt-2"
                style={{ color: '#A8A29E' }}
              >
                Use a different email
              </button>
            </div>
          )}
        </div>

        <p
          className="mt-8 text-center"
          style={{
            fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
            color: '#A8A29E',
            fontSize: '1rem',
          }}
        >
          A private space for just the two of us 💕
        </p>
      </div>
    </div>
  )
}
