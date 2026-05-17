'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/contexts/AppContext'
import { getGreeting, getMoodEmoji, getMoodLabel, formatCountdown, getRandomQuote, isToday, formatRelativeTime } from '@/lib/utils'
import { usePush, notifyPartner } from '@/hooks/usePush'
import type { Mood } from '@/types'

const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 'happy', emoji: '😊', label: 'Happy' },
  { value: 'loved', emoji: '🥰', label: 'Loved' },
  { value: 'tired', emoji: '😴', label: 'Tired' },
  { value: 'missing_you', emoji: '💭', label: 'Missing You' },
  { value: 'excited', emoji: '🎉', label: 'Excited' },
  { value: 'calm', emoji: '😌', label: 'Calm' },
]

type FeedItem =
  | { kind: 'message'; id: string; created_at: string; from_user_id: string; type: string; content: string; photo_url: string | null }
  | { kind: 'mood'; id: string; created_at: string; user_id: string; mood: string; note: string | null }
  | { kind: 'morning_note'; id: string; created_at: string; from_user_id: string; content: string; prompt: string }

function dateSeparatorLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function formatCoupleSince(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

function getLoveMeterLabel(score: number): string {
  if (score <= 30) return '💤 Quiet day'
  if (score <= 60) return '💕 Warming up'
  if (score <= 85) return '🔥 Connected'
  return '✨ Deeply in love'
}

export default function HomeClient() {
  const router = useRouter()
  const supabase = createClient()
  const { userId, profile, partnerProfile, partnerMood, myMoodToday, setMyMoodToday } = useApp()

  const [showMoodModal, setShowMoodModal] = useState(false)
  const [selectedMood, setSelectedMood] = useState<Mood | null>(null)
  const [moodNote, setMoodNote] = useState('')
  const [savingMood, setSavingMood] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [showEtaInput, setShowEtaInput] = useState(false)
  const [etaTime, setEtaTime] = useState('')
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [sendingNote, setSendingNote] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(true)

  const [coupleSinceInput, setCoupleSinceInput] = useState('')
  const [showCoupleSincePicker, setShowCoupleSincePicker] = useState(false)
  const [savingCoupleSince, setSavingCoupleSince] = useState(false)

  type MemoryItem = { id: string; type: string; content: string; photo_url: string | null; created_at: string; from_user_id: string }
  const [memory, setMemory] = useState<MemoryItem | null>(null)

  const [loveScore, setLoveScore] = useState(0)
  const [loveScoreLoaded, setLoveScoreLoaded] = useState(false)

  usePush()

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    if (profile && !myMoodToday) setTimeout(() => setShowMoodModal(true), 800)
  }, [profile?.id])

  useEffect(() => {
    if (profile?.coming_home_time) updateCountdown(profile.coming_home_time)
  }, [profile?.coming_home_time])

  function updateCountdown(timeStr: string) {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      const now = new Date()
      const [h, m] = timeStr.split(':').map(Number)
      const target = new Date()
      target.setHours(h, m, 0, 0)
      if (target <= now) target.setDate(target.getDate() + 1)
      setSecondsLeft(Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000)))
    }, 1000)
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  useEffect(() => { if (!userId) return; loadFeed() }, [userId, partnerProfile?.id])
  useEffect(() => { if (!userId) return; loadMemory() }, [userId])
  useEffect(() => { if (!userId || !partnerProfile) return; loadLoveScore() }, [userId, myMoodToday])

  async function loadFeed() {
    if (!userId) return
    setFeedLoading(true)
    const [messagesRes, moodsRes, notesRes] = await Promise.all([
      supabase.from('messages').select('id, created_at, from_user_id, type, content, photo_url').order('created_at', { ascending: false }).limit(30),
      supabase.from('mood_checkins').select('id, created_at, user_id, mood, note').order('created_at', { ascending: false }).limit(20),
      supabase.from('morning_notes').select('id, created_at, from_user_id, content, prompt').order('created_at', { ascending: false }).limit(10),
    ])
    const all: FeedItem[] = [
      ...(messagesRes.data ?? []).map((m) => ({ kind: 'message' as const, ...m })),
      ...(moodsRes.data ?? []).map((m) => ({ kind: 'mood' as const, ...m })),
      ...(notesRes.data ?? []).map((m) => ({ kind: 'morning_note' as const, ...m })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 20)
    setFeedItems(all)
    setFeedLoading(false)
  }

  async function loadMemory() {
    if (!userId) return
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const { data } = await supabase.from('messages').select('id, type, content, photo_url, created_at, from_user_id').in('type', ['photo', 'love_quote', 'text']).lt('created_at', thirtyDaysAgo.toISOString()).order('created_at', { ascending: false }).limit(50)
    if (data && data.length > 0) setMemory(data[Math.floor(Math.random() * data.length)])
  }

  async function loadLoveScore() {
    if (!userId) return
    const todayStr = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
    const [myMoodRes, partnerMoodRes, myMsgRes, noteRes, missRes, loveLangRes] = await Promise.all([
      supabase.from('mood_checkins').select('id').eq('user_id', userId).gte('created_at', todayStr).limit(1),
      partnerProfile ? supabase.from('mood_checkins').select('id').eq('user_id', partnerProfile.id).gte('created_at', todayStr).limit(1) : Promise.resolve({ data: [] }),
      supabase.from('messages').select('id').eq('from_user_id', userId).gte('created_at', todayStr).limit(1),
      supabase.from('morning_notes').select('id').eq('from_user_id', userId).gte('created_at', todayStr).limit(1),
      supabase.from('messages').select('id').eq('from_user_id', userId).eq('type', 'miss_you').gte('created_at', todayStr).limit(1),
      supabase.from('love_language_log').select('id').eq('user_id', userId).gte('created_at', todayStr).limit(1),
    ])
    let score = 0
    if ((myMoodRes.data?.length ?? 0) > 0) score += 20
    if ((partnerMoodRes.data?.length ?? 0) > 0) score += 20
    if ((myMsgRes.data?.length ?? 0) > 0) score += 15
    if ((noteRes.data?.length ?? 0) > 0) score += 15
    if ((missRes.data?.length ?? 0) > 0) score += 10
    if ((loveLangRes.data?.length ?? 0) > 0) score += 20
    setLoveScore(Math.min(100, score))
    setLoveScoreLoaded(true)
  }

  async function saveMood() {
    if (!selectedMood) return
    setSavingMood(true)
    await supabase.from('mood_checkins').insert({ user_id: userId, mood: selectedMood, note: moodNote || null })
    setMyMoodToday({ id: '', user_id: userId!, mood: selectedMood, note: moodNote || null, created_at: new Date().toISOString() })
    setShowMoodModal(false)
    setSavingMood(false)
    showToast('Mood saved 💕')
    if (partnerProfile?.id) notifyPartner(partnerProfile.id, `${profile?.name || 'Your love'} checked in ${getMoodEmoji(selectedMood)}`, moodNote || `Feeling ${getMoodLabel(selectedMood)} right now`, '/home')
    loadFeed(); loadLoveScore()
  }

  async function saveEta() {
    if (!etaTime || !userId) return
    await supabase.from('profiles').update({ coming_home_time: etaTime }).eq('id', userId)
    updateCountdown(etaTime)
    setShowEtaInput(false)
    showToast('ETA updated ✦')
  }

  async function sendMissYou() {
    await supabase.from('messages').insert({ from_user_id: userId, content: 'Missing you right now 💭', type: 'miss_you', photo_url: null })
    showToast('Miss you sent 💌')
    if (partnerProfile?.id) notifyPartner(partnerProfile.id, `${profile?.name || 'Your love'} misses you 💭`, 'They are thinking of you right now', '/home')
    loadFeed(); loadLoveScore()
  }

  async function sendQuote() {
    const quote = getRandomQuote()
    await supabase.from('messages').insert({ from_user_id: userId, content: quote, type: 'love_quote', photo_url: null })
    showToast('Quote sent 💫')
    if (partnerProfile?.id) notifyPartner(partnerProfile.id, `${profile?.name || 'Your love'} sent you a love quote 💫`, quote.slice(0, 80), '/home')
    loadFeed(); loadLoveScore()
  }

  async function sendNote() {
    if (!noteText.trim()) return
    setSendingNote(true)
    await supabase.from('messages').insert({ from_user_id: userId, content: noteText, type: 'text', photo_url: null })
    setNoteText(''); setShowNoteModal(false); setSendingNote(false)
    showToast('Note sent 💌')
    if (partnerProfile?.id) notifyPartner(partnerProfile.id, `${profile?.name || 'Your love'} sent you a note 💌`, noteText.slice(0, 80), '/home')
    loadFeed(); loadLoveScore()
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const path = `${userId}/${Date.now()}.${file.name.split('.').pop()}`
    const { data: uploadData, error: uploadErr } = await supabase.storage.from('photos').upload(path, file)
    if (!uploadErr && uploadData) {
      const { data: urlData } = supabase.storage.from('photos').getPublicUrl(uploadData.path)
      await supabase.from('messages').insert({ from_user_id: userId, content: '📸 Shared a photo', type: 'photo', photo_url: urlData.publicUrl })
      showToast('Photo sent 📸')
      if (partnerProfile?.id) notifyPartner(partnerProfile.id, `${profile?.name || 'Your love'} sent you a photo 📸`, 'Open HRINI to see it', '/home')
    }
    e.target.value = ''
    loadFeed(); loadLoveScore()
  }

  async function saveCoupleSince() {
    if (!coupleSinceInput || !userId) return
    setSavingCoupleSince(true)
    await supabase.from('profiles').update({ couple_since: coupleSinceInput }).eq('id', userId)
    setSavingCoupleSince(false); setShowCoupleSincePicker(false)
    showToast('Anniversary saved 💕')
    if (profile) profile.couple_since = coupleSinceInput
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const myName = profile?.name || 'Hriday'
  const partnerName = partnerProfile?.name || 'Rajreeni'
  const greeting = getGreeting()
  const hour = new Date().getHours()

  // Countdown split into h/m/s
  const countdownH = secondsLeft !== null ? Math.floor(secondsLeft / 3600) : null
  const countdownM = secondsLeft !== null ? Math.floor((secondsLeft % 3600) / 60) : null
  const countdownS = secondsLeft !== null ? secondsLeft % 60 : null

  function renderFeedItem(item: FeedItem, idx: number, items: FeedItem[]) {
    const prevItem = idx > 0 ? items[idx - 1] : null
    const showSeparator = !prevItem || dateSeparatorLabel(item.created_at) !== dateSeparatorLabel(prevItem.created_at)

    const separator = showSeparator ? (
      <div key={`sep-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0 6px' }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#2A2421' }} />
        <span style={{ fontSize: '0.65rem', color: '#5A5450', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {dateSeparatorLabel(item.created_at)}
        </span>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#2A2421' }} />
      </div>
    ) : null

    let card: React.ReactNode = null
    const isMe = item.kind === 'message' ? item.from_user_id === userId : item.kind === 'mood' ? item.user_id === userId : item.from_user_id === userId
    const senderName = isMe ? 'You' : partnerName

    if (item.kind === 'message') {
      if (item.type === 'miss_you') {
        card = (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '16px', background: 'rgba(212,160,167,0.1)', border: '1px solid rgba(212,160,167,0.2)' }}>
            <span style={{ fontSize: '1.3rem' }}>💭</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '0.85rem', color: '#D4A0A7', fontWeight: 500 }}>{isMe ? 'You sent a miss you' : `${partnerName} misses you`}</p>
              <p style={{ fontSize: '0.7rem', color: '#5A5450', marginTop: '2px' }}>{formatRelativeTime(item.created_at)}</p>
            </div>
          </div>
        )
      } else if (item.type === 'love_quote') {
        card = (
          <div key={item.id} style={{ padding: '14px', borderRadius: '16px', background: 'rgba(201,162,96,0.08)', border: '1px solid rgba(201,162,96,0.18)' }}>
            <p style={{ fontSize: '0.7rem', color: '#5A5450', marginBottom: '6px' }}>{senderName} shared a quote</p>
            <p style={{ fontFamily: 'var(--font-dancing, "Dancing Script", cursive)', color: '#C9A260', fontSize: '1.05rem', lineHeight: 1.5, fontStyle: 'italic' }}>&ldquo;{item.content}&rdquo;</p>
            <p style={{ fontSize: '0.7rem', color: '#5A5450', marginTop: '6px' }}>{formatRelativeTime(item.created_at)}</p>
          </div>
        )
      } else if (item.type === 'photo') {
        card = (
          <div key={item.id} style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #2A2421' }}>
            {item.photo_url && <img src={item.photo_url} alt="shared" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', display: 'block' }} />}
            <div style={{ padding: '8px 12px', backgroundColor: '#1E1B18' }}>
              <p style={{ fontSize: '0.7rem', color: '#5A5450' }}>{senderName} shared a photo · {formatRelativeTime(item.created_at)}</p>
            </div>
          </div>
        )
      } else {
        card = (
          <div key={item.id} style={{ padding: '12px 14px', borderRadius: '16px', backgroundColor: '#1E1B18', border: '1px solid #2A2421' }}>
            <p style={{ fontSize: '0.72rem', fontWeight: 600, color: isMe ? '#D4A0A7' : '#C9A260', marginBottom: '4px' }}>{senderName}</p>
            <p style={{ fontSize: '0.85rem', color: '#D8D0C8', lineHeight: 1.5 }}>{item.content}</p>
            <p style={{ fontSize: '0.7rem', color: '#5A5450', marginTop: '4px' }}>{formatRelativeTime(item.created_at)}</p>
          </div>
        )
      }
    } else if (item.kind === 'mood') {
      card = (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '16px', backgroundColor: '#1E1B18', border: '1px solid #2A2421' }}>
          <span style={{ fontSize: '1.4rem' }}>{getMoodEmoji(item.mood)}</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.85rem', color: '#D8D0C8' }}>
              <span style={{ color: isMe ? '#D4A0A7' : '#C9A260', fontWeight: 600 }}>{senderName}</span>
              {' '}feeling <span style={{ color: '#D4A0A7' }}>{getMoodLabel(item.mood)}</span>
            </p>
            {item.note && <p style={{ fontSize: '0.75rem', color: '#7A7470', marginTop: '2px' }}>{item.note}</p>}
            <p style={{ fontSize: '0.7rem', color: '#5A5450', marginTop: '2px' }}>{formatRelativeTime(item.created_at)}</p>
          </div>
        </div>
      )
    } else if (item.kind === 'morning_note') {
      card = (
        <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', borderRadius: '16px', background: 'rgba(201,162,96,0.07)', border: '1px solid rgba(201,162,96,0.12)' }}>
          <span style={{ fontSize: '1.1rem', marginTop: '2px' }}>📝</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '0.72rem', color: '#7A7470', marginBottom: '4px' }}>{senderName} wrote a morning note</p>
            <p style={{ fontSize: '0.85rem', color: '#D8D0C8', lineHeight: 1.5 }}>{item.content}</p>
            <p style={{ fontSize: '0.7rem', color: '#5A5450', marginTop: '4px' }}>{formatRelativeTime(item.created_at)}</p>
          </div>
        </div>
      )
    }

    return (
      <div key={`wrapper-${item.id}`}>
        {separator}
        {card}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', paddingBottom: '96px', backgroundColor: '#111009', position: 'relative' }}>
      <style>{`
        @keyframes home-glow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes score-fill {
          from { width: 0%; }
          to { width: var(--score-width); }
        }
        .score-bar { animation: score-fill 1.2s 0.3s cubic-bezier(0.16,1,0.3,1) both; }
      `}</style>

      {/* Ambient background glow */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(212,160,167,0.07) 0%, transparent 60%)',
      }} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px 12px',
        backgroundColor: 'rgba(17,16,9,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(61,54,51,0.3)',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
          fontSize: '1.25rem', fontWeight: 700, letterSpacing: '0.2em', color: '#D4A0A7',
        }}>
          HRINI
        </h2>
        <button
          onClick={handleSignOut}
          style={{
            width: '36px', height: '36px', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#1E1B18', border: '1px solid #3D3633',
            color: '#A8A29E', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          {myName.charAt(0).toUpperCase()}
        </button>
      </header>

      <div style={{ position: 'relative', zIndex: 1, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>

        {/* ── Hero Banner ─────────────────────────────────────────── */}
        <div style={{
          borderRadius: '24px', overflow: 'hidden', position: 'relative',
          background: 'linear-gradient(145deg, #1A1210 0%, #201610 40%, #1A100E 100%)',
          border: '1px solid rgba(212,160,167,0.15)',
          padding: '24px 20px',
        }}>
          {/* background glow blobs */}
          <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '180px', height: '180px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(212,160,167,0.12), transparent 70%)', pointerEvents: 'none', animation: 'home-glow 6s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', bottom: '-30px', left: '-30px', width: '140px', height: '140px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,162,96,0.08), transparent 70%)', pointerEvents: 'none', animation: 'home-glow 8s 2s ease-in-out infinite' }} />

          {/* Greeting */}
          <p style={{ fontSize: '0.72rem', color: '#7A7470', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '4px' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 style={{
            fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
            fontSize: '1.85rem', fontWeight: 700, color: '#F5F0E8', lineHeight: 1.2, marginBottom: '12px',
          }}>
            {greeting}, {myName} {hour < 12 ? '🌅' : hour < 17 ? '☀️' : hour < 21 ? '🌆' : '🌙'}
          </h1>

          {/* Days together */}
          {profile?.couple_since && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '14px' }}>
              <span style={{
                fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
                fontSize: '3rem', fontWeight: 700, lineHeight: 1,
                background: 'linear-gradient(135deg, #C9A260, #D4A0A7)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                {daysSince(profile.couple_since).toLocaleString()}
              </span>
              <div>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#A8A29E', lineHeight: 1 }}>days</p>
                <p style={{ fontSize: '0.7rem', color: '#5A5450', lineHeight: 1.4 }}>together 💕</p>
              </div>
            </div>
          )}

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: 'rgba(61,54,51,0.5)', margin: '12px 0' }} />

          {/* Partner mood */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              {partnerMood && isToday(partnerMood.created_at) ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.4rem' }}>{getMoodEmoji(partnerMood.mood)}</span>
                  <div>
                    <p style={{ fontSize: '0.72rem', color: '#7A7470' }}>{partnerName} is feeling</p>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#C9A260' }}>{getMoodLabel(partnerMood.mood)}</p>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.2rem', opacity: 0.4 }}>💭</span>
                  <p style={{ fontSize: '0.8rem', color: '#5A5450' }}>{partnerName} hasn&apos;t checked in yet</p>
                </div>
              )}
            </div>
            {myMoodToday && (
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.65rem', color: '#5A5450' }}>you</p>
                <span style={{ fontSize: '1.4rem' }}>{getMoodEmoji(myMoodToday.mood)}</span>
              </div>
            )}
          </div>

          {/* Set anniversary prompt if not set */}
          {!profile?.couple_since && !showCoupleSincePicker && (
            <button onClick={() => setShowCoupleSincePicker(true)} style={{ marginTop: '14px', fontSize: '0.8rem', color: '#C9A260', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              + Set your anniversary date
            </button>
          )}
          {showCoupleSincePicker && (
            <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
              <input type="date" value={coupleSinceInput} onChange={(e) => setCoupleSinceInput(e.target.value)} style={{ flex: 1, borderRadius: '12px', border: '1px solid #3D3633', padding: '10px 12px', fontSize: '0.85rem', outline: 'none', backgroundColor: '#0C0A08', color: '#F5F0E8' }} />
              <button onClick={saveCoupleSince} disabled={!coupleSinceInput || savingCoupleSince} style={{ padding: '10px 16px', borderRadius: '12px', backgroundColor: '#C9A260', color: '#1C1917', fontWeight: 700, fontSize: '0.85rem', border: 'none', cursor: 'pointer', opacity: savingCoupleSince ? 0.5 : 1 }}>
                {savingCoupleSince ? '…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* ── Love Meter ──────────────────────────────────────────── */}
        {loveScoreLoaded && (
          <div style={{ borderRadius: '20px', padding: '18px 20px', backgroundColor: '#161310', border: '1px solid #2A2421' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '10px' }}>
              <div>
                <p style={{ fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, color: '#5A5450' }}>Today&apos;s Connection</p>
                <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#F5F0E8', marginTop: '2px' }}>{getLoveMeterLabel(loveScore)}</p>
              </div>
              <span style={{
                fontSize: '1.5rem', fontWeight: 700,
                fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
                background: 'linear-gradient(135deg, #D4A0A7, #C9A260)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                {loveScore}
              </span>
            </div>
            <div style={{ height: '6px', borderRadius: '99px', backgroundColor: '#2A2421', overflow: 'hidden' }}>
              <div
                className="score-bar"
                style={{
                  height: '100%', borderRadius: '99px',
                  background: 'linear-gradient(90deg, #D4A0A7 0%, #C9A260 100%)',
                  ['--score-width' as string]: `${loveScore}%`,
                  boxShadow: loveScore > 50 ? '0 0 8px rgba(212,160,167,0.4)' : 'none',
                }}
              />
            </div>
          </div>
        )}

        {/* ── Countdown ───────────────────────────────────────────── */}
        <div style={{ borderRadius: '20px', padding: '18px 20px', backgroundColor: '#161310', border: '1px solid #2A2421' }}>
          {profile?.coming_home_time && secondsLeft !== null ? (
            <>
              <p style={{ fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, color: '#5A5450', marginBottom: '12px' }}>
                Coming home in
              </p>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                {[
                  { val: countdownH, unit: 'h' },
                  { val: countdownM, unit: 'm' },
                  { val: countdownS, unit: 's' },
                ].map(({ val, unit }, i) => (
                  <div key={unit} style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                    {i > 0 && <span style={{ fontSize: '2rem', fontWeight: 300, color: '#3D3633', lineHeight: 1.1, marginTop: '2px' }}>:</span>}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
                        fontSize: '2.8rem', fontWeight: 700, lineHeight: 1,
                        color: secondsLeft < 3600 ? '#D4A0A7' : '#F5F0E8',
                        minWidth: '2.2ch',
                      }}>
                        {String(val ?? 0).padStart(2, '0')}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: '#5A5450', fontWeight: 500, marginTop: '2px' }}>{unit}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowEtaInput(true)} style={{ marginTop: '10px', fontSize: '0.75rem', color: '#5A5450', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Edit · {profile.coming_home_time}
              </button>
              {showEtaInput && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <input type="time" value={etaTime} onChange={(e) => setEtaTime(e.target.value)} style={{ flex: 1, borderRadius: '12px', border: '1px solid #3D3633', padding: '10px 12px', fontSize: '0.85rem', outline: 'none', backgroundColor: '#0C0A08', color: '#F5F0E8' }} />
                  <button onClick={saveEta} style={{ padding: '10px 16px', borderRadius: '12px', backgroundColor: '#D4A0A7', color: '#1C1917', fontWeight: 700, fontSize: '0.85rem', border: 'none', cursor: 'pointer' }}>Set</button>
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#A8A29E', marginBottom: '10px' }}>Set your homecoming time 🏡</p>
              {showEtaInput ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="time" value={etaTime} onChange={(e) => setEtaTime(e.target.value)} style={{ flex: 1, borderRadius: '12px', border: '1px solid #3D3633', padding: '10px 12px', fontSize: '0.85rem', outline: 'none', backgroundColor: '#0C0A08', color: '#F5F0E8' }} />
                  <button onClick={saveEta} style={{ padding: '10px 16px', borderRadius: '12px', backgroundColor: '#D4A0A7', color: '#1C1917', fontWeight: 700, fontSize: '0.85rem', border: 'none', cursor: 'pointer' }}>Set</button>
                </div>
              ) : (
                <button onClick={() => setShowEtaInput(true)} style={{ fontSize: '0.85rem', color: '#D4A0A7', background: 'none', border: '1px solid rgba(212,160,167,0.3)', borderRadius: '10px', padding: '8px 16px', cursor: 'pointer' }}>
                  Pick a time
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Quick Actions ───────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          {[
            { icon: '📸', label: 'Photo', isFile: true },
            { icon: '💌', label: 'Miss You', isFile: false, onClick: sendMissYou },
            { icon: '💬', label: 'Note', isFile: false, onClick: () => setShowNoteModal(true) },
            { icon: '💫', label: 'Quote', isFile: false, onClick: sendQuote },
          ].map((action) => (
            <div key={action.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              {action.isFile ? (
                <label style={{ width: '52px', height: '52px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', cursor: 'pointer', backgroundColor: '#1E1B18', border: '1px solid #2A2421' }}>
                  {action.icon}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
                </label>
              ) : (
                <button onClick={action.onClick} style={{ width: '52px', height: '52px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', cursor: 'pointer', backgroundColor: '#1E1B18', border: '1px solid #2A2421', outline: 'none' }}>
                  {action.icon}
                </button>
              )}
              <span style={{ fontSize: '0.65rem', color: '#7A7470', fontWeight: 500 }}>{action.label}</span>
            </div>
          ))}
        </div>

        {/* ── Memory of the Day ───────────────────────────────────── */}
        {memory && (
          <div style={{ borderRadius: '20px', overflow: 'hidden', position: 'relative', border: '1px solid rgba(201,162,96,0.15)' }}>
            {memory.type === 'photo' && memory.photo_url ? (
              <>
                <img src={memory.photo_url} alt="memory" style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '24px 16px 14px', background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}>
                  <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>Memory 💭</p>
                  <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>from {memory.from_user_id === userId ? myName : partnerName} · {formatRelativeTime(memory.created_at)}</p>
                </div>
              </>
            ) : (
              <div style={{ padding: '16px 18px', background: 'linear-gradient(135deg, rgba(201,162,96,0.1), rgba(212,160,167,0.06))' }}>
                <p style={{ fontSize: '0.65rem', color: '#7A7470', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500, marginBottom: '8px' }}>Memory 💭 · {formatRelativeTime(memory.created_at)}</p>
                {memory.type === 'love_quote' ? (
                  <p style={{ fontFamily: 'var(--font-dancing, "Dancing Script", cursive)', color: '#C9A260', fontSize: '1.1rem', fontStyle: 'italic', lineHeight: 1.5 }}>&ldquo;{memory.content}&rdquo;</p>
                ) : (
                  <p style={{ fontSize: '0.9rem', color: '#D8D0C8', lineHeight: 1.6 }}>{memory.content}</p>
                )}
                <p style={{ fontSize: '0.7rem', color: '#5A5450', marginTop: '8px' }}>from {memory.from_user_id === userId ? myName : partnerName}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Activity Feed ───────────────────────────────────────── */}
        <div>
          <p style={{ fontSize: '0.65rem', color: '#5A5450', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '10px' }}>
            Recent Activity
          </p>
          {feedLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ height: '60px', borderRadius: '16px', backgroundColor: '#1A1714', animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }} />
              ))}
            </div>
          ) : feedItems.length === 0 ? (
            <div style={{ borderRadius: '20px', padding: '28px', textAlign: 'center', backgroundColor: '#161310', border: '1px solid #2A2421' }}>
              <p style={{ fontSize: '2rem', marginBottom: '8px' }}>💕</p>
              <p style={{ fontSize: '0.85rem', color: '#5A5450' }}>Your love story starts here. Send something beautiful.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {feedItems.map((item, idx, arr) => renderFeedItem(item, idx, arr))}
            </div>
          )}
        </div>

      </div>

      {/* ── Mood Modal ──────────────────────────────────────────────── */}
      {showMoodModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowMoodModal(false) }}>
          <div style={{ width: '100%', maxWidth: '480px', borderRadius: '28px 28px 0 0', padding: '24px 20px 40px', backgroundColor: '#1A1714', border: '1px solid #2A2421', borderBottom: 'none' }}>
            <div style={{ width: '36px', height: '4px', borderRadius: '99px', backgroundColor: '#3D3633', margin: '0 auto 20px' }} />
            <h3 style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', fontSize: '1.25rem', fontWeight: 700, color: '#F5F0E8', textAlign: 'center', marginBottom: '4px' }}>
              How are you feeling today?
            </h3>
            <p style={{ fontFamily: 'var(--font-dancing, "Dancing Script", cursive)', fontSize: '1.1rem', color: '#D4A0A7', textAlign: 'center', marginBottom: '20px' }}>
              Let {partnerName} know 💕
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
              {MOODS.map((m) => (
                <button key={m.value} onClick={() => setSelectedMood(m.value)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '14px 8px', borderRadius: '16px', cursor: 'pointer', transition: 'all 0.15s', backgroundColor: selectedMood === m.value ? 'rgba(212,160,167,0.12)' : '#111009', border: `1px solid ${selectedMood === m.value ? '#D4A0A7' : '#2A2421'}`, outline: 'none' }}>
                  <span style={{ fontSize: '1.8rem' }}>{m.emoji}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 500, color: selectedMood === m.value ? '#D4A0A7' : '#7A7470' }}>{m.label}</span>
                </button>
              ))}
            </div>
            <input type="text" placeholder="Add a note (optional)…" value={moodNote} onChange={(e) => setMoodNote(e.target.value)} style={{ width: '100%', borderRadius: '14px', border: '1px solid #2A2421', padding: '12px 16px', fontSize: '0.9rem', outline: 'none', backgroundColor: '#111009', color: '#F5F0E8', marginBottom: '14px', boxSizing: 'border-box' }} />
            <button onClick={saveMood} disabled={!selectedMood || savingMood} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: 'linear-gradient(135deg, #D4A0A7, #C9A260)', color: '#1C1917', fontWeight: 700, fontSize: '0.95rem', border: 'none', cursor: 'pointer', opacity: (!selectedMood || savingMood) ? 0.5 : 1 }}>
              {savingMood ? 'Saving…' : 'Share My Mood 💕'}
            </button>
          </div>
        </div>
      )}

      {/* ── Note Modal ──────────────────────────────────────────────── */}
      {showNoteModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowNoteModal(false) }}>
          <div style={{ width: '100%', maxWidth: '480px', borderRadius: '28px 28px 0 0', padding: '24px 20px 40px', backgroundColor: '#1A1714', border: '1px solid #2A2421', borderBottom: 'none' }}>
            <div style={{ width: '36px', height: '4px', borderRadius: '99px', backgroundColor: '#3D3633', margin: '0 auto 20px' }} />
            <h3 style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', fontSize: '1.25rem', fontWeight: 700, color: '#F5F0E8', textAlign: 'center', marginBottom: '16px' }}>
              Send a note 💬
            </h3>
            <textarea placeholder={`Say something to ${partnerName}…`} value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} style={{ width: '100%', borderRadius: '14px', border: '1px solid #2A2421', padding: '12px 16px', fontSize: '0.9rem', outline: 'none', backgroundColor: '#111009', color: '#F5F0E8', resize: 'none', marginBottom: '14px', boxSizing: 'border-box' }} />
            <button onClick={sendNote} disabled={!noteText.trim() || sendingNote} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: 'linear-gradient(135deg, #D4A0A7, #C9A260)', color: '#1C1917', fontWeight: 700, fontSize: '0.95rem', border: 'none', cursor: 'pointer', opacity: (!noteText.trim() || sendingNote) ? 0.5 : 1 }}>
              {sendingNote ? 'Sending…' : 'Send Note 💌'}
            </button>
          </div>
        </div>
      )}

      {/* ── Toast ───────────────────────────────────────────────────── */}
      {toast && (
        <div style={{ position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '10px 20px', borderRadius: '99px', backgroundColor: '#1E1B18', color: '#86EFAC', border: '1px solid #2A2421', fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
