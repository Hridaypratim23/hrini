'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { formatRelativeTime } from '@/lib/utils'
import type { LoveJarNote } from '@/types'

export default function LoveJarPage() {
  const supabase = createClient()

  const [notes, setNotes] = useState<LoveJarNote[]>([])
  const [revealed, setRevealed] = useState<LoveJarNote[]>([])
  const [sealedCount, setSealedCount] = useState(0)
  const [newNote, setNewNote] = useState('')
  const [sealing, setSealing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      // Load all notes visible to this couple
      const { data } = await supabase
        .from('love_jar_notes')
        .select('*')
        .order('created_at', { ascending: false })

      if (data) {
        const rev = (data as LoveJarNote[]).filter((n) => n.revealed_at !== null)
        const sealed = (data as LoveJarNote[]).filter((n) => n.revealed_at === null)
        setRevealed(rev)
        setSealedCount(sealed.length)
      }

      // Load profiles for names
      const { data: profs } = await supabase.from('profiles').select('id, name')
      if (profs) {
        const map: Record<string, string> = {}
        profs.forEach((p: { id: string; name: string }) => { map[p.id] = p.name })
        setProfiles(map)
      }

      setLoading(false)
    }
    load()
  }, [])

  async function sealNote() {
    if (!newNote.trim() || !userId) return
    setSealing(true)
    const { data } = await supabase
      .from('love_jar_notes')
      .insert({ from_user_id: userId, message: newNote.trim(), revealed_at: null })
      .select()
      .single()
    if (data) {
      setSealedCount((c) => c + 1)
    }
    setNewNote('')
    setSealing(false)
    showToast('Sealed with love 💌')
  }

  async function revealRandomNote() {
    const { data } = await supabase
      .from('love_jar_notes')
      .select('*')
      .is('revealed_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (data) {
      const now = new Date().toISOString()
      await supabase
        .from('love_jar_notes')
        .update({ revealed_at: now })
        .eq('id', data.id)
      const updated = { ...data, revealed_at: now } as LoveJarNote
      setRevealed((prev) => [updated, ...prev])
      setSealedCount((c) => Math.max(0, c - 1))
      showToast('A note was revealed 💕')
    } else {
      showToast('No sealed notes to reveal')
    }
  }

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: 'rgba(28,25,23,0.55)' }}>
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <h1
          className="text-3xl font-bold"
          style={{
            fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
            color: '#F5F0E8',
          }}
        >
          Love Jar
        </h1>
        <p
          className="mt-1 text-lg"
          style={{
            fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
            color: '#D4A0A7',
          }}
        >
          Little notes, big feelings
        </p>
      </header>

      <div className="px-4 space-y-6">
        {/* Jar illustration */}
        <div className="flex flex-col items-center py-4">
          <svg width="140" height="160" viewBox="0 0 140 160" fill="none" className="animate-float">
            {/* Jar body */}
            <ellipse cx="70" cy="140" rx="50" ry="14" fill="#3D3633" opacity="0.5" />
            <path d="M20 60 Q15 80 18 120 Q20 145 70 148 Q120 145 122 120 Q125 80 120 60 Z" fill="#292524" stroke="#3D3633" strokeWidth="1.5" />
            {/* Notes inside jar - glowing */}
            <ellipse cx="50" cy="110" rx="12" ry="8" fill="#D4A0A7" opacity="0.8" transform="rotate(-15 50 110)" />
            <ellipse cx="75" cy="120" rx="11" ry="7" fill="#C9A260" opacity="0.7" transform="rotate(10 75 120)" />
            <ellipse cx="90" cy="100" rx="10" ry="6" fill="#D4A0A7" opacity="0.6" transform="rotate(-5 90 100)" />
            <ellipse cx="55" cy="90" rx="9" ry="6" fill="#C9A260" opacity="0.5" transform="rotate(20 55 90)" />
            <ellipse cx="80" cy="85" rx="8" ry="5" fill="#D4A0A7" opacity="0.4" transform="rotate(-10 80 85)" />
            {/* Jar neck */}
            <rect x="45" y="45" width="50" height="18" rx="4" fill="#292524" stroke="#3D3633" strokeWidth="1.5" />
            {/* Lid */}
            <rect x="38" y="35" width="64" height="14" rx="7" fill="#3D3633" />
            <rect x="42" y="37" width="56" height="10" rx="5" fill="#D4A0A7" opacity="0.6" />
            {/* Glow */}
            <ellipse cx="70" cy="105" rx="40" ry="35" fill="#D4A0A7" opacity="0.05" />
          </svg>

          {/* Sealed count badge */}
          <div
            className="mt-3 px-4 py-2 rounded-full text-sm font-medium border"
            style={{
              backgroundColor: 'rgba(212,160,167,0.1)',
              borderColor: '#D4A0A7',
              color: '#D4A0A7',
            }}
          >
            🔒 {sealedCount} sealed {sealedCount === 1 ? 'note' : 'notes'} waiting to be found
          </div>

          {sealedCount > 0 && (
            <button
              onClick={revealRandomNote}
              className="mt-3 px-5 py-2 rounded-xl text-sm font-semibold border"
              style={{ borderColor: '#C9A260', color: '#C9A260' }}
            >
              Reveal a Note ✨
            </button>
          )}
        </div>

        {/* Add note section */}
        <div
          className="rounded-2xl p-5 border"
          style={{ backgroundColor: '#292524', borderColor: '#C9A260', boxShadow: '0 0 0 1px rgba(201,162,96,0.1)' }}
        >
          <h2
            className="text-lg font-bold mb-3"
            style={{
              fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
              color: '#F5F0E8',
            }}
          >
            Add a secret note
          </h2>
          <textarea
            placeholder="Write something from the heart…"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none mb-3"
            style={{
              backgroundColor: '#1C1917',
              borderColor: '#3D3633',
              color: '#F5F0E8',
              fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
              fontSize: '1rem',
            }}
          />
          <button
            onClick={sealNote}
            disabled={!newNote.trim() || sealing}
            className="w-full py-3 rounded-xl font-semibold text-base disabled:opacity-50"
            style={{ backgroundColor: '#D4A0A7', color: '#1C1917' }}
          >
            {sealing ? 'Sealing…' : 'Seal It 💌'}
          </button>
        </div>

        {/* Revealed notes */}
        {revealed.length > 0 && (
          <div>
            <h2
              className="text-lg font-bold mb-3"
              style={{
                fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
                color: '#F5F0E8',
              }}
            >
              Revealed Notes
            </h2>
            <div className="space-y-3">
              {revealed.map((note) => (
                <div
                  key={note.id}
                  className="rounded-2xl p-5 border"
                  style={{
                    backgroundColor: '#292524',
                    borderColor: '#D4A0A7',
                    boxShadow: '0 0 0 1px rgba(212,160,167,0.1)',
                  }}
                >
                  {/* Wax seal aesthetic */}
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                      style={{ backgroundColor: '#D4A0A7', color: '#1C1917' }}
                    >
                      ✦
                    </div>
                    <span className="text-xs" style={{ color: '#A8A29E' }}>
                      {note.revealed_at ? formatRelativeTime(note.revealed_at) : ''}
                    </span>
                  </div>
                  <p
                    className="text-lg leading-relaxed mb-3"
                    style={{
                      fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
                      color: '#F5F0E8',
                    }}
                  >
                    &ldquo;{note.message}&rdquo;
                  </p>
                  <p className="text-xs" style={{ color: '#A8A29E' }}>
                    From {profiles[note.from_user_id] ?? 'someone special'} with love 💕
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-8" style={{ color: '#A8A29E' }}>
            Loading…
          </div>
        )}

        {!loading && revealed.length === 0 && (
          <div
            className="text-center py-8"
            style={{
              fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
              color: '#A8A29E',
              fontSize: '1.1rem',
            }}
          >
            Revealed notes will appear here 💌
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg animate-fade-in"
          style={{ backgroundColor: '#292524', color: '#86EFAC', border: '1px solid #3D3633' }}
        >
          {toast}
        </div>
      )}


    </div>
  )
}
