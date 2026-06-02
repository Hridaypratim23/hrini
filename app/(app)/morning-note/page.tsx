'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { formatRelativeTime } from '@/lib/utils'

const MORNING_PROMPTS = [
  "What's one thing you love about her today?",
  "Describe a moment with her that made you smile recently.",
  "What's something you're grateful she does for you?",
  "If you could plan the perfect day for her, what would it look like?",
  "What quality of hers inspires you the most?",
  "Write her three words that describe how she makes you feel.",
  "What's a small thing she does that means the world to you?",
  "What adventure do you want to take with her next?",
]

function getTodayPrompt(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  )
  return MORNING_PROMPTS[dayOfYear % MORNING_PROMPTS.length]
}

interface NoteEntry {
  id: string
  from_user_id: string
  content: string
  prompt: string
  created_at: string
}

export default function MorningNotePage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState('Rajreeni')
  const [content, setContent] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [myNote, setMyNote] = useState<NoteEntry | null>(null)
  const [partnerNote, setPartnerNote] = useState<NoteEntry | null>(null)
  const [loading, setLoading] = useState(true)

  const todayPrompt = getTodayPrompt()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: myProf } = await supabase
        .from('profiles')
        .select('partner_id')
        .eq('id', user.id)
        .single()

      let pid: string | null = null
      if (myProf?.partner_id) {
        pid = myProf.partner_id
        setPartnerId(pid)
        const { data: partnerProf } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', pid)
          .single()
        if (partnerProf?.name) setPartnerName(partnerProf.name)
      }

      // Load today's notes
      const today = new Date().toISOString().split('T')[0]

      const { data: notes } = await supabase
        .from('morning_notes')
        .select('*')
        .gte('created_at', today)
        .order('created_at', { ascending: false })

      if (notes) {
        const mine = (notes as NoteEntry[]).find((n) => n.from_user_id === user.id)
        const partner = pid ? (notes as NoteEntry[]).find((n) => n.from_user_id === pid) : null
        if (mine) { setMyNote(mine); setSubmitted(true); setContent(mine.content) }
        if (partner) setPartnerNote(partner)
      }

      // Also check for yesterday's partner note
      if (pid && !partnerNote) {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = yesterday.toISOString().split('T')[0]

        const { data: yesterdayNotes } = await supabase
          .from('morning_notes')
          .select('*')
          .eq('from_user_id', pid)
          .gte('created_at', yesterdayStr)
          .lt('created_at', today)
          .order('created_at', { ascending: false })
          .limit(1)

        if (yesterdayNotes && yesterdayNotes.length > 0) {
          setPartnerNote(yesterdayNotes[0] as NoteEntry)
        }
      }

      setLoading(false)
    }
    load()
  }, [])

  async function submitNote() {
    if (!content.trim() || !userId) return
    setSubmitting(true)
    const trimmed = content.trim()
    const { data } = await supabase
      .from('morning_notes')
      .insert({
        from_user_id: userId,
        content: trimmed,
        prompt: todayPrompt,
      })
      .select()
      .single()

    if (data) setMyNote(data as NoteEntry)
    await supabase.from('messages').insert({
      from_user_id: userId,
      content: `📝 Morning Note\n"${todayPrompt}"\n\n${trimmed}`,
      type: 'text',
    })
    setSubmitted(true)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pb-28" style={{ backgroundColor: 'rgba(28,25,23,0.55)' }}>
        <p style={{ color: '#A8A29E' }}>Loading…</p>
  
      </div>
    )
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
          Morning Note 📝
        </h1>
        <p
          className="mt-1 text-lg"
          style={{
            fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
            color: '#D4A0A7',
          }}
        >
          Start the day with love
        </p>
      </header>

      <div className="px-4 space-y-5">
        {/* Today's prompt */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'linear-gradient(135deg, rgba(212,160,167,0.15) 0%, rgba(201,162,96,0.08) 100%)',
            border: '1px solid rgba(212,160,167,0.2)',
          }}
        >
          <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#A8A29E' }}>
            Today&apos;s prompt
          </p>
          <p
            className="text-2xl leading-relaxed"
            style={{
              fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
              color: '#F5F0E8',
            }}
          >
            {todayPrompt}
          </p>
        </div>

        {/* Write area */}
        {!submitted ? (
          <div
            className="rounded-2xl p-5 border"
            style={{ backgroundColor: '#292524', borderColor: '#3D3633' }}
          >
            <textarea
              placeholder="Write from the heart…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="w-full rounded-xl border px-4 py-3 outline-none resize-none mb-4"
              style={{
                backgroundColor: '#1C1917',
                borderColor: '#3D3633',
                color: '#F5F0E8',
                fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
                fontSize: '1.1rem',
                lineHeight: '1.8',
              }}
            />
            <button
              onClick={submitNote}
              disabled={!content.trim() || submitting}
              className="w-full py-3 rounded-xl font-semibold text-base disabled:opacity-50"
              style={{ backgroundColor: '#D4A0A7', color: '#1C1917' }}
            >
              {submitting ? 'Sending…' : `Send to ${partnerName}'s heart 💕`}
            </button>
          </div>
        ) : (
          /* Submitted state */
          <div
            className="rounded-2xl p-5 border"
            style={{
              backgroundColor: '#292524',
              borderColor: '#D4A0A7',
              boxShadow: '0 0 0 1px rgba(212,160,167,0.1)',
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                style={{ backgroundColor: '#D4A0A7', color: '#1C1917' }}
              >
                ✓
              </div>
              <p className="font-semibold text-sm" style={{ color: '#86EFAC' }}>
                Sent to {partnerName}&apos;s heart 💕
              </p>
            </div>

            <div
              className="p-4 rounded-xl mb-2"
              style={{ backgroundColor: '#1C1917' }}
            >
              <p
                className="text-lg leading-relaxed"
                style={{
                  fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
                  color: '#F5F0E8',
                }}
              >
                &ldquo;{myNote?.content ?? content}&rdquo;
              </p>
            </div>

            {myNote && (
              <p className="text-xs" style={{ color: '#A8A29E' }}>
                Written {formatRelativeTime(myNote.created_at)}
              </p>
            )}
          </div>
        )}

        {/* Partner's note */}
        {partnerNote && (
          <div>
            <h2
              className="text-lg font-bold mb-3"
              style={{
                fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
                color: '#F5F0E8',
              }}
            >
              From {partnerName} 💕
            </h2>
            <div
              className="rounded-2xl p-5 border"
              style={{
                backgroundColor: '#292524',
                borderColor: '#C9A260',
                boxShadow: '0 0 0 1px rgba(201,162,96,0.1)',
              }}
            >
              {partnerNote.prompt && (
                <p className="text-xs mb-3 italic" style={{ color: '#A8A29E' }}>
                  &ldquo;{partnerNote.prompt}&rdquo;
                </p>
              )}
              <p
                className="text-lg leading-relaxed mb-3"
                style={{
                  fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
                  color: '#F5F0E8',
                }}
              >
                &ldquo;{partnerNote.content}&rdquo;
              </p>
              <p className="text-xs" style={{ color: '#A8A29E' }}>
                Written {formatRelativeTime(partnerNote.created_at)}
              </p>
            </div>
          </div>
        )}

        {submitted && !partnerNote && (
          <div
            className="rounded-2xl p-5 border text-center"
            style={{ backgroundColor: '#292524', borderColor: '#3D3633' }}
          >
            <p
              className="text-base"
              style={{
                fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
                color: '#A8A29E',
              }}
            >
              Waiting for {partnerName}&apos;s morning note… 🌸
            </p>
          </div>
        )}
      </div>


    </div>
  )
}
