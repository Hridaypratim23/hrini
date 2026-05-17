'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const STARS = Array.from({ length: 48 }, (_, i) => ({
  id: i,
  x: ((i * 47 + 13) % 97) + 1.5,
  y: ((i * 31 + 7) % 72) + 2,
  size: i % 5 === 0 ? 2 : i % 3 === 0 ? 1.5 : 1,
  delay: (i * 0.27) % 4,
  duration: 2.5 + (i % 4) * 0.6,
}))

const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  x: ((i * 83 + 29) % 90) + 5,
  delay: i * 1.4,
  duration: 8 + (i % 5) * 2,
  size: i % 3 === 0 ? 3 : 2,
}))

export default function AuthPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState<'email' | 'password' | null>(null)

  const supabase = createClient()

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password')
      return
    }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError('Wrong email or password')
    } else {
      router.push('/home')
    }
    setLoading(false)
  }

  return (
    <div
      style={{
        minHeight: '100svh',
        backgroundColor: '#0C0A08',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.3); }
        }
        @keyframes float-logo {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes glow-breathe {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.06); }
        }
        @keyframes particle-rise {
          0% { transform: translateY(100vh) translateX(0); opacity: 0; }
          5% { opacity: 1; }
          95% { opacity: 0.6; }
          100% { transform: translateY(-10vh) translateX(15px); opacity: 0; }
        }
        @keyframes shimmer-text {
          0% { background-position: -300% center; }
          100% { background-position: 300% center; }
        }
        @keyframes ring-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-up-1 { animation: fade-up 0.8s ease forwards; }
        .fade-up-2 { animation: fade-up 0.8s 0.15s ease both; }
        .fade-up-3 { animation: fade-up 0.8s 0.3s ease both; }
        .fade-up-4 { animation: fade-up 0.8s 0.45s ease both; }
      `}</style>

      {/* ── Deep glow orbs ────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 70% 55% at 50% 35%, rgba(212,160,167,0.09) 0%, transparent 65%)',
      }} />
      <div style={{
        position: 'absolute',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(212,160,167,0.07) 0%, transparent 70%)',
        top: '-180px', right: '-150px', pointerEvents: 'none',
        animation: 'glow-breathe 8s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute',
        width: '350px', height: '350px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(201,162,96,0.06) 0%, transparent 70%)',
        bottom: '-100px', left: '-80px', pointerEvents: 'none',
        animation: 'glow-breathe 10s 2s ease-in-out infinite',
      }} />

      {/* ── Stars ─────────────────────────────────────────────── */}
      {STARS.map((s) => (
        <div
          key={s.id}
          style={{
            position: 'absolute',
            width: s.size, height: s.size,
            borderRadius: '50%',
            backgroundColor: s.id % 7 === 0 ? '#C9A260' : '#F5F0E8',
            left: `${s.x}%`, top: `${s.y}%`,
            animation: `twinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* ── Floating particles ────────────────────────────────── */}
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            bottom: '-10px',
            left: `${p.x}%`,
            width: p.size, height: p.size,
            borderRadius: '50%',
            backgroundColor: p.id % 3 === 0 ? '#C9A260' : '#D4A0A7',
            animation: `particle-rise ${p.duration}s ${p.delay}s linear infinite`,
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* ── Cherry blossom branch — top left ─────────────────── */}
      <svg
        style={{ position: 'absolute', top: 0, left: 0, opacity: 0.18, pointerEvents: 'none' }}
        width="260" height="220" viewBox="0 0 260 220" fill="none"
      >
        <path d="M10 220 Q40 160 80 120 Q120 80 160 50 Q200 20 240 5" stroke="#D4A0A7" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M80 120 Q60 90 50 70" stroke="#D4A0A7" strokeWidth="1" fill="none" strokeLinecap="round" />
        <path d="M120 80 Q110 55 115 35" stroke="#D4A0A7" strokeWidth="1" fill="none" strokeLinecap="round" />
        <path d="M160 50 Q170 25 180 15" stroke="#D4A0A7" strokeWidth="1" fill="none" strokeLinecap="round" />
        {/* Blossoms */}
        {[
          [50,70],[115,35],[180,15],[95,100],[145,62],[210,20],[65,88],[130,68],
        ].map(([cx, cy], i) => (
          <g key={i}>
            <circle cx={cx} cy={cy} r="5" fill="#D4A0A7" opacity="0.9" />
            <circle cx={cx - 5} cy={cy - 3} r="3.5" fill="#D4A0A7" opacity="0.7" />
            <circle cx={cx + 5} cy={cy - 3} r="3.5" fill="#D4A0A7" opacity="0.7" />
            <circle cx={cx} cy={cy - 7} r="3.5" fill="#C9A260" opacity="0.5" />
            <circle cx={cx} cy={cy} r="1.5" fill="#F5F0E8" opacity="0.8" />
          </g>
        ))}
      </svg>

      {/* ── Wisteria — top right ──────────────────────────────── */}
      <svg
        style={{ position: 'absolute', top: 0, right: 0, opacity: 0.15, pointerEvents: 'none' }}
        width="200" height="260" viewBox="0 0 200 260" fill="none"
      >
        <path d="M200 0 Q170 30 150 60 Q130 90 120 130" stroke="#C9A260" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M150 60 Q180 70 190 90" stroke="#C9A260" strokeWidth="1" fill="none" strokeLinecap="round" />
        {/* Hanging clusters */}
        {[
          [[140,80],[145,95],[135,105]],
          [[125,110],[130,125],[120,135]],
          [[185,95],[190,110],[180,120]],
          [[115,140],[120,155],[110,165]],
        ].map((cluster, ci) => cluster.map(([x, y], i) => (
          <ellipse key={`${ci}-${i}`} cx={x} cy={y} rx="5" ry="7" fill="#C9A260" opacity={0.7 - i * 0.15} />
        )))}
      </svg>

      {/* ── Mountain layers — bottom ──────────────────────────── */}
      <svg
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, pointerEvents: 'none' }}
        width="100%" height="130" viewBox="0 0 400 130" preserveAspectRatio="none"
        fill="none"
      >
        <path d="M0 130 L0 90 L50 50 L90 75 L130 30 L170 60 L210 20 L250 55 L290 35 L330 65 L370 40 L400 60 L400 130 Z" fill="#1C1917" opacity="0.6" />
        <path d="M0 130 L0 100 L40 70 L80 90 L120 55 L160 80 L200 45 L240 70 L280 50 L320 75 L360 55 L400 70 L400 130 Z" fill="#1C1917" opacity="0.8" />
        <path d="M0 130 L0 110 L60 85 L100 100 L140 75 L180 95 L220 70 L260 90 L300 72 L340 88 L380 75 L400 82 L400 130 Z" fill="#0C0A08" />
      </svg>

      {/* ── Crescent moon ─────────────────────────────────────── */}
      <svg
        style={{ position: 'absolute', top: '6%', right: '8%', opacity: 0.25, pointerEvents: 'none', animation: 'glow-breathe 12s ease-in-out infinite' }}
        width="36" height="36" viewBox="0 0 36 36" fill="none"
      >
        <path d="M22 6 A14 14 0 1 0 22 30 A10 10 0 1 1 22 6 Z" fill="#C9A260" />
      </svg>

      {/* ── Main content ──────────────────────────────────────── */}
      <div style={{
        position: 'relative', zIndex: 10,
        width: '100%', maxWidth: '360px',
        padding: '0 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>

        {/* Floating emblem */}
        <div className="fade-up-1" style={{ marginBottom: '20px', position: 'relative', animation: 'float-logo 6s ease-in-out infinite' }}>
          {/* Outer decorative ring */}
          <div style={{
            position: 'absolute', inset: '-18px', borderRadius: '50%',
            border: '1px solid rgba(212,160,167,0.12)',
            animation: 'ring-spin 20s linear infinite',
          }}>
            {[0, 90, 180, 270].map((deg) => (
              <div key={deg} style={{
                position: 'absolute',
                width: '4px', height: '4px', borderRadius: '50%',
                backgroundColor: '#D4A0A7', opacity: 0.5,
                top: '50%', left: '50%',
                transform: `rotate(${deg}deg) translateX(18px) translateY(-50%)`,
              }} />
            ))}
          </div>
          {/* Inner ring */}
          <div style={{
            position: 'absolute', inset: '-9px', borderRadius: '50%',
            border: '1px solid rgba(201,162,96,0.2)',
          }} />
          {/* Circle */}
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(212,160,167,0.2) 0%, rgba(201,162,96,0.15) 100%)',
            border: '1.5px solid rgba(212,160,167,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.8rem',
            boxShadow: '0 0 30px rgba(212,160,167,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}>
            💕
          </div>
        </div>

        {/* HRINI — gradient shimmer */}
        <h1
          className="fade-up-2"
          style={{
            fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
            fontSize: '5.5rem',
            fontWeight: 700,
            letterSpacing: '0.25em',
            lineHeight: 1,
            margin: 0,
            background: 'linear-gradient(135deg, #C9A260 0%, #D4A0A7 35%, #F5F0E8 50%, #D4A0A7 65%, #C9A260 100%)',
            backgroundSize: '300% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'shimmer-text 6s linear infinite',
          }}
        >
          HRINI
        </h1>

        {/* Tagline */}
        <p
          className="fade-up-2"
          style={{
            fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
            color: '#C9A260',
            fontSize: '1.25rem',
            marginTop: '6px',
            letterSpacing: '0.02em',
            opacity: 0.9,
          }}
        >
          our little universe
        </p>

        {/* Elegant divider */}
        <div className="fade-up-3" style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', margin: '22px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, rgba(212,160,167,0.35))' }} />
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            <div style={{ width: '3px', height: '3px', backgroundColor: 'rgba(212,160,167,0.4)', transform: 'rotate(45deg)' }} />
            <div style={{ width: '5px', height: '5px', backgroundColor: '#D4A0A7', transform: 'rotate(45deg)' }} />
            <div style={{ width: '3px', height: '3px', backgroundColor: 'rgba(212,160,167,0.4)', transform: 'rotate(45deg)' }} />
          </div>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, rgba(212,160,167,0.35))' }} />
        </div>

        {/* Auth card — frosted glass */}
        <div
          className="fade-up-4"
          style={{
            width: '100%',
            background: 'rgba(28,25,23,0.75)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            borderRadius: '24px',
            padding: '28px 22px',
            border: '1px solid rgba(61,54,51,0.7)',
            boxShadow: '0 8px 48px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset',
          }}
        >
          {/* Email */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#A8A29E', marginBottom: '8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Email
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              autoComplete="email"
              style={{
                width: '100%',
                borderRadius: '14px',
                border: `1px solid ${focused === 'email' ? 'rgba(212,160,167,0.5)' : 'rgba(61,54,51,0.8)'}`,
                padding: '12px 16px',
                fontSize: '0.95rem',
                outline: 'none',
                backgroundColor: 'rgba(12,10,8,0.6)',
                color: '#F5F0E8',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
                boxShadow: focused === 'email' ? '0 0 0 3px rgba(212,160,167,0.08)' : 'none',
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: '#A8A29E', marginBottom: '8px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              autoComplete="current-password"
              style={{
                width: '100%',
                borderRadius: '14px',
                border: `1px solid ${focused === 'password' ? 'rgba(212,160,167,0.5)' : 'rgba(61,54,51,0.8)'}`,
                padding: '12px 16px',
                fontSize: '0.95rem',
                outline: 'none',
                backgroundColor: 'rgba(12,10,8,0.6)',
                color: '#F5F0E8',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box',
                boxShadow: focused === 'password' ? '0 0 0 3px rgba(212,160,167,0.08)' : 'none',
              }}
            />
          </div>

          {error && (
            <p style={{ fontSize: '0.85rem', color: '#E07B7B', textAlign: 'center', marginBottom: '16px' }}>
              {error}
            </p>
          )}

          {/* CTA button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '14px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              background: 'linear-gradient(135deg, #D4A0A7 0%, #C9A260 100%)',
              color: '#1C1917',
              fontWeight: 700,
              fontSize: '0.95rem',
              letterSpacing: '0.04em',
              boxShadow: '0 4px 20px rgba(212,160,167,0.25)',
              transition: 'opacity 0.2s, transform 0.1s',
            }}
            onMouseDown={(e) => { if (!loading) (e.target as HTMLElement).style.transform = 'scale(0.98)' }}
            onMouseUp={(e) => { (e.target as HTMLElement).style.transform = 'scale(1)' }}
          >
            {loading ? 'Entering…' : 'Enter our space ✦'}
          </button>
        </div>

        {/* Footer */}
        <p
          className="fade-up-4"
          style={{
            fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
            color: 'rgba(168,162,158,0.6)',
            fontSize: '1rem',
            textAlign: 'center',
            marginTop: '28px',
            lineHeight: 1.5,
          }}
        >
          A private world for just the two of us
        </p>
      </div>
    </div>
  )
}
