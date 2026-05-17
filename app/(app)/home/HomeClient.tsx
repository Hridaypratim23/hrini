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

function getLoveMeterLabel(score: number) {
  if (score <= 20) return { text: 'Start the day together', icon: '🌙' }
  if (score <= 50) return { text: 'Warming up', icon: '🌤️' }
  if (score <= 80) return { text: 'Connected', icon: '🔥' }
  return { text: 'Deeply in love', icon: '✨' }
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  useEffect(() => { if (profile && !myMoodToday) setTimeout(() => setShowMoodModal(true), 800) }, [profile?.id])
  useEffect(() => { if (profile?.coming_home_time) updateCountdown(profile.coming_home_time) }, [profile?.coming_home_time])

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
    const ago = new Date(); ago.setDate(ago.getDate() - 30)
    const { data } = await supabase.from('messages').select('id, type, content, photo_url, created_at, from_user_id').in('type', ['photo', 'love_quote', 'text']).lt('created_at', ago.toISOString()).order('created_at', { ascending: false }).limit(50)
    if (data && data.length > 0) setMemory(data[Math.floor(Math.random() * data.length)])
  }

  async function loadLoveScore() {
    if (!userId) return
    const todayStr = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
    const [r1, r2, r3, r4, r5, r6] = await Promise.all([
      supabase.from('mood_checkins').select('id').eq('user_id', userId).gte('created_at', todayStr).limit(1),
      partnerProfile ? supabase.from('mood_checkins').select('id').eq('user_id', partnerProfile.id).gte('created_at', todayStr).limit(1) : Promise.resolve({ data: [] }),
      supabase.from('messages').select('id').eq('from_user_id', userId).gte('created_at', todayStr).limit(1),
      supabase.from('morning_notes').select('id').eq('from_user_id', userId).gte('created_at', todayStr).limit(1),
      supabase.from('messages').select('id').eq('from_user_id', userId).eq('type', 'miss_you').gte('created_at', todayStr).limit(1),
      supabase.from('love_language_log').select('id').eq('user_id', userId).gte('created_at', todayStr).limit(1),
    ])
    let s = 0
    if ((r1.data?.length ?? 0) > 0) s += 20
    if ((r2.data?.length ?? 0) > 0) s += 20
    if ((r3.data?.length ?? 0) > 0) s += 15
    if ((r4.data?.length ?? 0) > 0) s += 15
    if ((r5.data?.length ?? 0) > 0) s += 10
    if ((r6.data?.length ?? 0) > 0) s += 20
    setLoveScore(Math.min(100, s)); setLoveScoreLoaded(true)
  }

  async function saveMood() {
    if (!selectedMood) return
    setSavingMood(true)
    await supabase.from('mood_checkins').insert({ user_id: userId, mood: selectedMood, note: moodNote || null })
    setMyMoodToday({ id: '', user_id: userId!, mood: selectedMood, note: moodNote || null, created_at: new Date().toISOString() })
    setShowMoodModal(false); setSavingMood(false)
    showToast('Mood shared 💕')
    if (partnerProfile?.id) notifyPartner(partnerProfile.id, `${profile?.name || 'Your love'} checked in ${getMoodEmoji(selectedMood)}`, moodNote || `Feeling ${getMoodLabel(selectedMood)}`, '/home')
    loadFeed(); loadLoveScore()
  }

  async function saveEta() {
    if (!etaTime || !userId) return
    await supabase.from('profiles').update({ coming_home_time: etaTime }).eq('id', userId)
    updateCountdown(etaTime); setShowEtaInput(false); showToast('ETA set ✦')
  }

  async function sendMissYou() {
    await supabase.from('messages').insert({ from_user_id: userId, content: 'Missing you right now 💭', type: 'miss_you', photo_url: null })
    showToast('Miss you sent 💌')
    if (partnerProfile?.id) notifyPartner(partnerProfile.id, `${profile?.name || 'Your love'} misses you 💭`, 'They are thinking of you', '/home')
    loadFeed(); loadLoveScore()
  }

  async function sendQuote() {
    const quote = getRandomQuote()
    await supabase.from('messages').insert({ from_user_id: userId, content: quote, type: 'love_quote', photo_url: null })
    showToast('Quote sent 💫')
    if (partnerProfile?.id) notifyPartner(partnerProfile.id, `${profile?.name || 'Your love'} sent a love quote 💫`, quote.slice(0, 80), '/home')
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
      if (partnerProfile?.id) notifyPartner(partnerProfile.id, `${profile?.name || 'Your love'} sent a photo 📸`, 'Open HRINI to see it', '/home')
    }
    e.target.value = ''; loadFeed(); loadLoveScore()
  }

  async function saveCoupleSince() {
    if (!coupleSinceInput || !userId) return
    setSavingCoupleSince(true)
    await supabase.from('profiles').update({ couple_since: coupleSinceInput }).eq('id', userId)
    setSavingCoupleSince(false); setShowCoupleSincePicker(false)
    showToast('Anniversary saved 💕')
    if (profile) profile.couple_since = coupleSinceInput
  }

  const myName = profile?.name || 'Hriday'
  const partnerName = partnerProfile?.name || 'Rajreeni'
  const greeting = getGreeting()
  const hour = new Date().getHours()
  const greetingEmoji = hour < 6 ? '🌙' : hour < 12 ? '🌅' : hour < 17 ? '☀️' : hour < 21 ? '🌆' : '🌙'
  const meterLabel = getLoveMeterLabel(loveScore)
  const cH = secondsLeft !== null ? Math.floor(secondsLeft / 3600) : null
  const cM = secondsLeft !== null ? Math.floor((secondsLeft % 3600) / 60) : null
  const cS = secondsLeft !== null ? secondsLeft % 60 : null

  function renderFeedItem(item: FeedItem, idx: number, items: FeedItem[]) {
    const prevItem = idx > 0 ? items[idx - 1] : null
    const showSep = !prevItem || dateSeparatorLabel(item.created_at) !== dateSeparatorLabel(prevItem.created_at)
    const isMe = item.kind === 'message' ? item.from_user_id === userId : item.kind === 'mood' ? item.user_id === userId : item.from_user_id === userId
    const sender = isMe ? 'You' : partnerName

    const sep = showSep ? (
      <div key={`sep-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0 4px' }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#231F1C' }} />
        <span style={{ fontSize: '0.62rem', color: '#4A4440', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{dateSeparatorLabel(item.created_at)}</span>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#231F1C' }} />
      </div>
    ) : null

    let card: React.ReactNode = null

    if (item.kind === 'message') {
      if (item.type === 'miss_you') {
        card = <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', borderRadius: '14px', background: 'rgba(212,160,167,0.08)', border: '1px solid rgba(212,160,167,0.15)' }}>
          <span style={{ fontSize: '1.2rem' }}>💭</span>
          <div>
            <p style={{ fontSize: '0.82rem', color: '#D4A0A7', fontWeight: 500 }}>{isMe ? 'You sent a miss you' : `${partnerName} misses you`}</p>
            <p style={{ fontSize: '0.68rem', color: '#4A4440', marginTop: '1px' }}>{formatRelativeTime(item.created_at)}</p>
          </div>
        </div>
      } else if (item.type === 'love_quote') {
        card = <div key={item.id} style={{ padding: '12px 14px', borderRadius: '14px', background: 'rgba(201,162,96,0.07)', border: '1px solid rgba(201,162,96,0.15)' }}>
          <p style={{ fontSize: '0.68rem', color: '#4A4440', marginBottom: '5px' }}>{sender} · {formatRelativeTime(item.created_at)}</p>
          <p style={{ fontFamily: 'var(--font-dancing, "Dancing Script", cursive)', color: '#C9A260', fontSize: '1rem', lineHeight: 1.55, fontStyle: 'italic' }}>&ldquo;{item.content}&rdquo;</p>
        </div>
      } else if (item.type === 'photo') {
        card = <div key={item.id} style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid #231F1C' }}>
          {item.photo_url && <img src={item.photo_url} alt="shared" style={{ width: '100%', maxHeight: '190px', objectFit: 'cover', display: 'block' }} />}
          <div style={{ padding: '7px 12px', backgroundColor: '#181512' }}>
            <p style={{ fontSize: '0.68rem', color: '#4A4440' }}>{sender} shared a photo · {formatRelativeTime(item.created_at)}</p>
          </div>
        </div>
      } else {
        card = <div key={item.id} style={{ padding: '11px 14px', borderRadius: '14px', backgroundColor: '#181512', border: '1px solid #231F1C' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 600, color: isMe ? '#D4A0A7' : '#C9A260', marginBottom: '3px' }}>{sender}</p>
          <p style={{ fontSize: '0.85rem', color: '#CCC5BC', lineHeight: 1.5 }}>{item.content}</p>
          <p style={{ fontSize: '0.68rem', color: '#4A4440', marginTop: '4px' }}>{formatRelativeTime(item.created_at)}</p>
        </div>
      }
    } else if (item.kind === 'mood') {
      card = <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', borderRadius: '14px', backgroundColor: '#181512', border: '1px solid #231F1C' }}>
        <span style={{ fontSize: '1.3rem' }}>{getMoodEmoji(item.mood)}</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.82rem', color: '#CCC5BC' }}>
            <span style={{ color: isMe ? '#D4A0A7' : '#C9A260', fontWeight: 600 }}>{sender}</span> · feeling {getMoodLabel(item.mood)}
          </p>
          {item.note && <p style={{ fontSize: '0.72rem', color: '#7A7470', marginTop: '2px' }}>{item.note}</p>}
          <p style={{ fontSize: '0.68rem', color: '#4A4440', marginTop: '2px' }}>{formatRelativeTime(item.created_at)}</p>
        </div>
      </div>
    } else {
      card = <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '11px 14px', borderRadius: '14px', background: 'rgba(201,162,96,0.06)', border: '1px solid rgba(201,162,96,0.1)' }}>
        <span style={{ fontSize: '1rem', marginTop: '2px' }}>📝</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.7rem', color: '#4A4440', marginBottom: '3px' }}>{sender} · morning note</p>
          <p style={{ fontSize: '0.82rem', color: '#CCC5BC', lineHeight: 1.5 }}>{item.content}</p>
          <p style={{ fontSize: '0.68rem', color: '#4A4440', marginTop: '3px' }}>{formatRelativeTime(item.created_at)}</p>
        </div>
      </div>
    }

    return <div key={`w-${item.id}`}>{sep}{card}</div>
  }

  // ── Sheet component ──
  const Sheet = ({ show, onDismiss, children }: { show: boolean; onDismiss: () => void; children: React.ReactNode }) => {
    if (!show) return null
    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onDismiss() }}
      >
        <div style={{
          width: '100%', maxWidth: '520px', margin: '0 auto',
          borderRadius: '28px 28px 0 0',
          backgroundColor: '#18140F',
          border: '1px solid #2E2822', borderBottom: 'none',
          padding: '0 20px',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)',
        }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '99px', backgroundColor: '#3D3633', margin: '14px auto 22px' }} />
          {children}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', paddingBottom: '100px', backgroundColor: '#0F0D0A' }}>
      <style>{`
        @keyframes glow-float { 0%,100%{opacity:.5} 50%{opacity:.9} }
        @keyframes bar-grow { from{width:0} to{width:var(--w)} }
        .bar-anim { animation: bar-grow 1.4s .4s cubic-bezier(.16,1,.3,1) both; }
        @keyframes fade-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .section { animation: fade-in .5s ease both; }
      `}</style>

      {/* Global ambient */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse 100% 35% at 50% 0%, rgba(212,160,167,0.06) 0%, transparent 60%)' }} />

      {/* ── Header ─────────────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 12px', backgroundColor: 'rgba(15,13,10,0.9)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.2em', color: '#D4A0A7' }}>HRINI</span>
        <button onClick={() => { supabase.auth.signOut(); router.push('/') }} style={{ width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1C1916', border: '1px solid #2E2822', color: '#7A7470', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
          {myName.charAt(0)}
        </button>
      </header>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>

        {/* ── Hero ──────────────────────────────────────────── */}
        <div className="section" style={{ margin: '12px 16px 0', borderRadius: '22px', overflow: 'hidden', position: 'relative', background: 'linear-gradient(160deg, #1D1208 0%, #180E0A 50%, #130C08 100%)', border: '1px solid rgba(212,160,167,0.12)' }}>
          {/* Glow orbs */}
          <div style={{ position: 'absolute', top: '-60px', right: '-60px', width: '220px', height: '220px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(212,160,167,0.1) 0%, transparent 65%)', animation: 'glow-float 7s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '-40px', left: '-40px', width: '160px', height: '160px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,162,96,0.08) 0%, transparent 65%)', animation: 'glow-float 9s 3s ease-in-out infinite', pointerEvents: 'none' }} />

          <div style={{ padding: '24px 22px 20px', position: 'relative' }}>
            {/* Date */}
            <p style={{ fontSize: '0.68rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5A5450', fontWeight: 500, marginBottom: '6px' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            {/* Greeting */}
            <h1 style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', fontSize: '2rem', fontWeight: 700, color: '#F0EBE3', lineHeight: 1.15, marginBottom: '18px' }}>
              {greeting}, {myName} {greetingEmoji}
            </h1>

            {/* Days together — hero number */}
            {profile?.couple_since ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', fontSize: '2.8rem', fontWeight: 700, lineHeight: 1, background: 'linear-gradient(135deg, #C9A260 0%, #D4A0A7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                    {daysSince(profile.couple_since).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#5A5450', marginTop: '2px' }}>days together since {formatCoupleSince(profile.couple_since)}</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: '2rem' }}>💕</div>
              </div>
            ) : (
              <button onClick={() => setShowCoupleSincePicker(true)} style={{ display: 'block', marginBottom: '16px', fontSize: '0.8rem', color: '#C9A260', background: 'none', border: '1px dashed rgba(201,162,96,0.3)', borderRadius: '12px', padding: '10px 16px', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                + Set your anniversary date to track days together
              </button>
            )}
            {showCoupleSincePicker && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input type="date" value={coupleSinceInput} onChange={(e) => setCoupleSinceInput(e.target.value)} style={{ flex: 1, borderRadius: '12px', border: '1px solid #3D3633', padding: '10px 12px', fontSize: '0.85rem', outline: 'none', backgroundColor: '#0C0A08', color: '#F5F0E8' }} />
                <button onClick={saveCoupleSince} disabled={!coupleSinceInput || savingCoupleSince} style={{ padding: '10px 18px', borderRadius: '12px', background: 'linear-gradient(135deg, #C9A260, #D4A0A7)', color: '#1C1917', fontWeight: 700, fontSize: '0.85rem', border: 'none', cursor: 'pointer', opacity: savingCoupleSince ? 0.5 : 1 }}>
                  Save
                </button>
              </div>
            )}

            {/* Mood row — both people side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '8px' }}>
              {/* My mood */}
              <div style={{ padding: '10px 12px', borderRadius: '14px', backgroundColor: 'rgba(212,160,167,0.07)', border: '1px solid rgba(212,160,167,0.12)', textAlign: 'center' }}>
                {myMoodToday ? (
                  <>
                    <div style={{ fontSize: '1.5rem', marginBottom: '2px' }}>{getMoodEmoji(myMoodToday.mood)}</div>
                    <div style={{ fontSize: '0.62rem', color: '#D4A0A7', fontWeight: 600 }}>{myName.split(' ')[0]}</div>
                    <div style={{ fontSize: '0.65rem', color: '#7A7470' }}>{getMoodLabel(myMoodToday.mood)}</div>
                  </>
                ) : (
                  <>
                    <button onClick={() => setShowMoodModal(true)} style={{ fontSize: '1.3rem', background: 'none', border: 'none', cursor: 'pointer', display: 'block', margin: '0 auto 2px' }}>🫥</button>
                    <div style={{ fontSize: '0.62rem', color: '#D4A0A7', fontWeight: 600 }}>{myName.split(' ')[0]}</div>
                    <div style={{ fontSize: '0.62rem', color: '#5A5450' }}>tap to check in</div>
                  </>
                )}
              </div>

              {/* Connector */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                <div style={{ width: '1px', height: '12px', backgroundColor: '#2E2822' }} />
                <span style={{ fontSize: '0.9rem' }}>💞</span>
                <div style={{ width: '1px', height: '12px', backgroundColor: '#2E2822' }} />
              </div>

              {/* Partner mood */}
              <div style={{ padding: '10px 12px', borderRadius: '14px', backgroundColor: 'rgba(201,162,96,0.07)', border: '1px solid rgba(201,162,96,0.12)', textAlign: 'center' }}>
                {partnerMood && isToday(partnerMood.created_at) ? (
                  <>
                    <div style={{ fontSize: '1.5rem', marginBottom: '2px' }}>{getMoodEmoji(partnerMood.mood)}</div>
                    <div style={{ fontSize: '0.62rem', color: '#C9A260', fontWeight: 600 }}>{partnerName.split(' ')[0]}</div>
                    <div style={{ fontSize: '0.65rem', color: '#7A7470' }}>{getMoodLabel(partnerMood.mood)}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '1.3rem', marginBottom: '2px', opacity: 0.3 }}>🫥</div>
                    <div style={{ fontSize: '0.62rem', color: '#C9A260', fontWeight: 600 }}>{partnerName.split(' ')[0]}</div>
                    <div style={{ fontSize: '0.62rem', color: '#5A5450' }}>not checked in</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Love Meter ─────────────────────────────────────── */}
        {loveScoreLoaded && (
          <div className="section" style={{ margin: '10px 16px 0', padding: '16px 18px', borderRadius: '18px', backgroundColor: '#141210', border: '1px solid #231F1C' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div>
                <p style={{ fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4A4440', fontWeight: 600 }}>Connection today</p>
                <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#E8E0D8', marginTop: '2px' }}>{meterLabel.icon} {meterLabel.text}</p>
              </div>
              <span style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', fontSize: '1.6rem', fontWeight: 700, background: 'linear-gradient(135deg, #D4A0A7, #C9A260)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {loveScore}
              </span>
            </div>
            {/* Segmented bar */}
            <div style={{ display: 'flex', gap: '3px' }}>
              {Array.from({ length: 20 }, (_, i) => (
                <div key={i} style={{ flex: 1, height: '5px', borderRadius: '99px', transition: 'background-color 0.3s', backgroundColor: (i / 20) * 100 < loveScore ? (i < 10 ? '#D4A0A7' : '#C9A260') : '#231F1C' }} />
              ))}
            </div>
          </div>
        )}

        {/* ── Countdown ──────────────────────────────────────── */}
        <div className="section" style={{ margin: '10px 16px 0', padding: '16px 18px', borderRadius: '18px', backgroundColor: '#141210', border: '1px solid #231F1C' }}>
          {profile?.coming_home_time && secondsLeft !== null ? (
            <>
              <p style={{ fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4A4440', fontWeight: 600, marginBottom: '10px' }}>Coming home in</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
                {[{ v: cH, u: 'hr' }, { v: cM, u: 'min' }, { v: cS, u: 'sec' }].map(({ v, u }, i) => (
                  <div key={u} style={{ display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
                    {i > 0 && <span style={{ fontSize: '1.8rem', color: '#2E2822', fontWeight: 300, lineHeight: 1.1, paddingBottom: '10px' }}>:</span>}
                    <div style={{ textAlign: 'center', minWidth: '2.4ch' }}>
                      <div style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', fontSize: '2.4rem', fontWeight: 700, lineHeight: 1, color: secondsLeft < 3600 ? '#D4A0A7' : '#E8E0D8' }}>
                        {String(v ?? 0).padStart(2, '0')}
                      </div>
                      <div style={{ fontSize: '0.58rem', color: '#4A4440', fontWeight: 500, marginTop: '3px', letterSpacing: '0.04em' }}>{u}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowEtaInput(!showEtaInput)} style={{ marginTop: '10px', fontSize: '0.72rem', color: '#4A4440', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Edit time · {profile.coming_home_time}
              </button>
              {showEtaInput && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <input type="time" value={etaTime} onChange={(e) => setEtaTime(e.target.value)} style={{ flex: 1, borderRadius: '10px', border: '1px solid #3D3633', padding: '9px 12px', fontSize: '0.85rem', outline: 'none', backgroundColor: '#0C0A08', color: '#F5F0E8' }} />
                  <button onClick={saveEta} style={{ padding: '9px 16px', borderRadius: '10px', background: 'linear-gradient(135deg, #D4A0A7, #C9A260)', color: '#1C1917', fontWeight: 700, fontSize: '0.85rem', border: 'none', cursor: 'pointer' }}>Set</button>
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.88rem', fontWeight: 600, color: '#7A7470', marginBottom: '10px' }}>🏡 Set homecoming time</p>
              {showEtaInput ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="time" value={etaTime} onChange={(e) => setEtaTime(e.target.value)} style={{ flex: 1, borderRadius: '10px', border: '1px solid #3D3633', padding: '9px 12px', fontSize: '0.85rem', outline: 'none', backgroundColor: '#0C0A08', color: '#F5F0E8' }} />
                  <button onClick={saveEta} style={{ padding: '9px 16px', borderRadius: '10px', background: 'linear-gradient(135deg, #D4A0A7, #C9A260)', color: '#1C1917', fontWeight: 700, fontSize: '0.85rem', border: 'none', cursor: 'pointer' }}>Set</button>
                </div>
              ) : (
                <button onClick={() => setShowEtaInput(true)} style={{ fontSize: '0.82rem', color: '#D4A0A7', background: 'none', border: '1px solid rgba(212,160,167,0.25)', borderRadius: '10px', padding: '8px 14px', cursor: 'pointer' }}>Pick a time</button>
              )}
            </>
          )}
        </div>

        {/* ── Quick Actions ──────────────────────────────────── */}
        <div className="section" style={{ margin: '10px 16px 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {[
            { icon: '💌', label: 'Miss You', bg: 'rgba(212,160,167,0.1)', border: 'rgba(212,160,167,0.2)', isFile: false, onClick: sendMissYou },
            { icon: '💫', label: 'Quote', bg: 'rgba(201,162,96,0.1)', border: 'rgba(201,162,96,0.2)', isFile: false, onClick: sendQuote },
            { icon: '💬', label: 'Note', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.07)', isFile: false, onClick: () => setShowNoteModal(true) },
            { icon: '📸', label: 'Photo', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.07)', isFile: true, onClick: null },
          ].map((a) => (
            <div key={a.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
              {a.isFile ? (
                <label style={{ width: '100%', aspectRatio: '1', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', cursor: 'pointer', backgroundColor: a.bg, border: `1px solid ${a.border}` }}>
                  {a.icon}<input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
                </label>
              ) : (
                <button onClick={a.onClick ?? undefined} style={{ width: '100%', aspectRatio: '1', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', cursor: 'pointer', backgroundColor: a.bg, border: `1px solid ${a.border}`, outline: 'none' }}>
                  {a.icon}
                </button>
              )}
              <span style={{ fontSize: '0.62rem', color: '#5A5450', fontWeight: 500 }}>{a.label}</span>
            </div>
          ))}
        </div>

        {/* ── Memory ────────────────────────────────────────── */}
        {memory && (
          <div className="section" style={{ margin: '10px 16px 0', borderRadius: '18px', overflow: 'hidden', border: '1px solid #231F1C', position: 'relative' }}>
            {memory.type === 'photo' && memory.photo_url ? (
              <>
                <img src={memory.photo_url} alt="memory" style={{ width: '100%', maxHeight: '190px', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '28px 14px 12px', background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)' }}>
                  <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.09em', textTransform: 'uppercase' }}>Memory from {formatRelativeTime(memory.created_at)}</p>
                </div>
              </>
            ) : (
              <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, rgba(201,162,96,0.08), rgba(212,160,167,0.05))' }}>
                <p style={{ fontSize: '0.6rem', color: '#4A4440', letterSpacing: '0.09em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '7px' }}>Memory 💭 · {formatRelativeTime(memory.created_at)}</p>
                {memory.type === 'love_quote'
                  ? <p style={{ fontFamily: 'var(--font-dancing, "Dancing Script", cursive)', color: '#C9A260', fontSize: '1.05rem', fontStyle: 'italic', lineHeight: 1.5 }}>&ldquo;{memory.content}&rdquo;</p>
                  : <p style={{ fontSize: '0.88rem', color: '#CCC5BC', lineHeight: 1.6 }}>{memory.content}</p>}
                <p style={{ fontSize: '0.68rem', color: '#4A4440', marginTop: '6px' }}>from {memory.from_user_id === userId ? myName : partnerName}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Feed ──────────────────────────────────────────── */}
        <div className="section" style={{ margin: '16px 16px 0' }}>
          <p style={{ fontSize: '0.62rem', letterSpacing: '0.09em', textTransform: 'uppercase', color: '#4A4440', fontWeight: 600, marginBottom: '8px' }}>Recent Activity</p>
          {feedLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[1, 2, 3].map((i) => <div key={i} style={{ height: '56px', borderRadius: '14px', backgroundColor: '#181512' }} />)}
            </div>
          ) : feedItems.length === 0 ? (
            <div style={{ borderRadius: '18px', padding: '28px', textAlign: 'center', backgroundColor: '#141210', border: '1px solid #231F1C' }}>
              <p style={{ fontSize: '1.8rem', marginBottom: '8px' }}>💕</p>
              <p style={{ fontSize: '0.82rem', color: '#4A4440' }}>Your love story starts here.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {feedItems.map((item, idx, arr) => renderFeedItem(item, idx, arr))}
            </div>
          )}
        </div>

      </div>

      {/* ── Mood Sheet ──────────────────────────────────────── */}
      <Sheet show={showMoodModal} onDismiss={() => setShowMoodModal(false)}>
        <h3 style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', fontSize: '1.2rem', fontWeight: 700, color: '#F0EBE3', textAlign: 'center', marginBottom: '4px' }}>
          How are you feeling?
        </h3>
        <p style={{ fontFamily: 'var(--font-dancing, "Dancing Script", cursive)', fontSize: '1.05rem', color: '#D4A0A7', textAlign: 'center', marginBottom: '18px' }}>
          Let {partnerName} know 💕
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
          {MOODS.map((m) => (
            <button key={m.value} onClick={() => setSelectedMood(m.value)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '12px 6px', borderRadius: '14px', cursor: 'pointer', backgroundColor: selectedMood === m.value ? 'rgba(212,160,167,0.1)' : '#0F0D0A', border: `1px solid ${selectedMood === m.value ? '#D4A0A7' : '#2E2822'}`, outline: 'none', transition: 'all 0.15s' }}>
              <span style={{ fontSize: '1.7rem' }}>{m.emoji}</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 500, color: selectedMood === m.value ? '#D4A0A7' : '#5A5450' }}>{m.label}</span>
            </button>
          ))}
        </div>
        <input type="text" placeholder="Add a note… (optional)" value={moodNote} onChange={(e) => setMoodNote(e.target.value)} style={{ width: '100%', borderRadius: '12px', border: '1px solid #2E2822', padding: '11px 14px', fontSize: '0.88rem', outline: 'none', backgroundColor: '#0A0906', color: '#F0EBE3', marginBottom: '12px', boxSizing: 'border-box' }} />
        <button onClick={saveMood} disabled={!selectedMood || savingMood} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: 'linear-gradient(135deg, #D4A0A7, #C9A260)', color: '#1C1917', fontWeight: 700, fontSize: '0.95rem', border: 'none', cursor: selectedMood ? 'pointer' : 'default', opacity: (!selectedMood || savingMood) ? 0.45 : 1 }}>
          {savingMood ? 'Sharing…' : 'Share My Mood 💕'}
        </button>
      </Sheet>

      {/* ── Note Sheet ──────────────────────────────────────── */}
      <Sheet show={showNoteModal} onDismiss={() => setShowNoteModal(false)}>
        <h3 style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', fontSize: '1.2rem', fontWeight: 700, color: '#F0EBE3', textAlign: 'center', marginBottom: '16px' }}>
          Send a note 💬
        </h3>
        <textarea placeholder={`Say something to ${partnerName}…`} value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={4} style={{ width: '100%', borderRadius: '12px', border: '1px solid #2E2822', padding: '11px 14px', fontSize: '0.88rem', outline: 'none', backgroundColor: '#0A0906', color: '#F0EBE3', resize: 'none', marginBottom: '12px', boxSizing: 'border-box' }} />
        <button onClick={sendNote} disabled={!noteText.trim() || sendingNote} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: 'linear-gradient(135deg, #D4A0A7, #C9A260)', color: '#1C1917', fontWeight: 700, fontSize: '0.95rem', border: 'none', cursor: noteText.trim() ? 'pointer' : 'default', opacity: (!noteText.trim() || sendingNote) ? 0.45 : 1 }}>
          {sendingNote ? 'Sending…' : 'Send Note 💌'}
        </button>
      </Sheet>

      {/* ── Toast ───────────────────────────────────────────── */}
      {toast && (
        <div style={{ position: 'fixed', top: '22px', left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '9px 18px', borderRadius: '99px', backgroundColor: '#1C1916', color: '#86EFAC', border: '1px solid #2E2822', fontSize: '0.82rem', fontWeight: 500, whiteSpace: 'nowrap', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
