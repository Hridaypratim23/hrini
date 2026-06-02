'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/contexts/AppContext'
import { getGreeting, getMoodEmoji, getMoodLabel, formatCountdown, getRandomQuote, isToday, formatRelativeTime } from '@/lib/utils'
import { usePush, notifyPartner } from '@/hooks/usePush'
import type { Mood } from '@/types'

function Sheet({ show, onDismiss, children }: { show: boolean; onDismiss: () => void; children: React.ReactNode }) {
  if (!show) return null
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <div style={{
        width: '100%', maxWidth: '520px', margin: '0 auto',
        borderRadius: '28px 28px 0 0',
        backgroundColor: '#18140F',
        border: '1px solid #2E2822', borderBottom: 'none',
        padding: '0 20px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 48px)',
      }}>
        <div style={{ width: '36px', height: '4px', borderRadius: '99px', backgroundColor: '#3D3633', margin: '14px auto 22px' }} />
        {children}
      </div>
    </div>
  )
}

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
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [sendingNote, setSendingNote] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [sentPhrase, setSentPhrase] = useState<string | null>(null)
  const [sendingPhrase, setSendingPhrase] = useState<string | null>(null)

  const [myMeetup, setMyMeetup] = useState<{ time: string; setAt: string } | null>(null)
  const [partnerMeetup, setPartnerMeetup] = useState<{ time: string; setAt: string } | null>(null)
  const [meetupSecondsLeft, setMeetupSecondsLeft] = useState<number | null>(null)
  const [showMeetupInput, setShowMeetupInput] = useState(false)
  const [meetupInput, setMeetupInput] = useState('')
  const meetupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(true)

  type Plan = { id: string; created_by: string; title: string; planned_at: string | null; done: boolean; done_at: string | null; created_at: string; message_id: string | null }
  const [plans, setPlans] = useState<Plan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [planTitle, setPlanTitle] = useState('')
  const [planDate, setPlanDate] = useState('')
  const [planTime, setPlanTime] = useState('')
  const [savingPlan, setSavingPlan] = useState(false)

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

  // Initialize meetup state from profiles
  useEffect(() => {
    if (profile?.meetup_time && profile?.meetup_time_set_at) {
      setMyMeetup({ time: profile.meetup_time, setAt: profile.meetup_time_set_at })
    }
  }, [profile?.meetup_time, profile?.meetup_time_set_at])

  useEffect(() => {
    if (partnerProfile?.meetup_time && partnerProfile?.meetup_time_set_at) {
      setPartnerMeetup({ time: partnerProfile.meetup_time, setAt: partnerProfile.meetup_time_set_at })
    }
  }, [partnerProfile?.meetup_time, partnerProfile?.meetup_time_set_at])

  // Run countdown off whichever meetup is more recent
  useEffect(() => {
    const activeTime = (() => {
      if (!myMeetup && !partnerMeetup) return null
      if (myMeetup && !partnerMeetup) return myMeetup.time
      if (!myMeetup && partnerMeetup) return partnerMeetup.time
      return new Date(myMeetup!.setAt) >= new Date(partnerMeetup!.setAt) ? myMeetup!.time : partnerMeetup!.time
    })()
    if (meetupTimerRef.current) clearInterval(meetupTimerRef.current)
    if (!activeTime) { setMeetupSecondsLeft(null); return }
    const tick = () => {
      const now = new Date()
      const [h, m] = activeTime.split(':').map(Number)
      const target = new Date(); target.setHours(h, m, 0, 0)
      if (target <= now) target.setDate(target.getDate() + 1)
      setMeetupSecondsLeft(Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000)))
    }
    tick()
    meetupTimerRef.current = setInterval(tick, 1000)
    return () => { if (meetupTimerRef.current) clearInterval(meetupTimerRef.current) }
  }, [myMeetup?.time, myMeetup?.setAt, partnerMeetup?.time, partnerMeetup?.setAt])

  // Realtime: partner profile meetup_time changes (last-write-wins)
  useEffect(() => {
    if (!partnerProfile?.id) return
    const channel = supabase
      .channel('partner-meetup')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${partnerProfile.id}` }, (payload) => {
        const u = payload.new as { meetup_time?: string; meetup_time_set_at?: string }
        if (u.meetup_time && u.meetup_time_set_at) {
          setPartnerMeetup({ time: u.meetup_time, setAt: u.meetup_time_set_at })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [partnerProfile?.id])

  useEffect(() => { if (!userId) return; loadFeed() }, [userId, partnerProfile?.id])
  useEffect(() => { if (!userId) return; loadPlans() }, [userId])
  // Defer non-critical queries so the hero renders first
  useEffect(() => {
    if (!userId) return
    const t = setTimeout(() => loadMemory(), 1500)
    return () => clearTimeout(t)
  }, [userId])
  useEffect(() => {
    if (!userId || !partnerProfile) return
    const t = setTimeout(() => loadLoveScore(), 1000)
    return () => clearTimeout(t)
  }, [userId, myMoodToday])

  async function loadFeed() {
    if (!userId) return
    setFeedLoading(true)
    const [messagesRes, moodsRes, notesRes] = await Promise.all([
      supabase.from('messages').select('id, created_at, from_user_id, type, content, photo_url').in('type', ['miss_you', 'love_quote']).order('created_at', { ascending: false }).limit(20),
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

  async function loadPlans() {
    setPlansLoading(true)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { data } = await supabase.from('couple_plans').select('*')
      .gte('created_at', todayStart.toISOString())
      .order('done').order('planned_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
    setPlans((data as Plan[]) ?? [])
    setPlansLoading(false)
  }

  async function addPlan() {
    if (!planTitle.trim() || !userId) return
    setSavingPlan(true)
    const title = planTitle.trim()
    let planned_at: string | null = null
    if (planDate) {
      const dt = planTime ? `${planDate}T${planTime}:00` : `${planDate}T00:00:00`
      planned_at = new Date(dt).toISOString()
    }
    // Insert plan first to get its ID
    const { data: planData } = await supabase.from('couple_plans').insert({ created_by: userId, title, planned_at }).select().single()
    if (!planData) { setSavingPlan(false); return }
    const planId = (planData as Plan).id
    // Insert chat message with plan_id so we can find it later
    const { data: msgData } = await supabase.from('messages').insert({
      from_user_id: userId,
      content: JSON.stringify({ title, planned_at, plan_id: planId }),
      type: 'plan',
      photo_url: null,
    }).select('id').single()
    // Link the message back to the plan
    if (msgData) await supabase.from('couple_plans').update({ message_id: (msgData as { id: string }).id }).eq('id', planId)
    const fullPlan: Plan = { ...(planData as Plan), message_id: msgData ? (msgData as { id: string }).id : null }
    setPlans((prev) => [fullPlan, ...prev].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      if (a.planned_at && b.planned_at) return new Date(a.planned_at).getTime() - new Date(b.planned_at).getTime()
      if (a.planned_at) return -1; if (b.planned_at) return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }))
    setPlanTitle(''); setPlanDate(''); setPlanTime(''); setShowPlanModal(false); setSavingPlan(false)
    showToast('Plan added 🗓️')
    const notifBody = planned_at ? `${title} · ${new Date(planned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : title
    if (partnerProfile?.id) notifyPartner(partnerProfile.id, `${profile?.name || 'Your love'} added a plan 🗓️`, notifBody, '/messages')
  }

  async function togglePlanDone(plan: Plan) {
    if (!userId) return
    const done = !plan.done
    const done_at = done ? new Date().toISOString() : null
    await supabase.from('couple_plans').update({ done, done_at }).eq('id', plan.id)
    setPlans((prev) => prev.map((p) => p.id === plan.id ? { ...p, done, done_at } : p))
    if (done) {
      // Post a completion message in chat
      await supabase.from('messages').insert({
        from_user_id: userId,
        content: JSON.stringify({ title: plan.title, plan_id: plan.id, status: 'completed' }),
        type: 'plan',
        photo_url: null,
      })
      const notifBody = `${plan.title} ✅`
      if (partnerProfile?.id) notifyPartner(partnerProfile.id, `${profile?.name || 'Your love'} completed a plan 🎉`, notifBody, '/messages')
    }
  }

  async function deletePlan(id: string) {
    const plan = plans.find((p) => p.id === id)
    if (plan?.message_id) await supabase.from('messages').delete().eq('id', plan.message_id)
    await supabase.from('couple_plans').delete().eq('id', id)
    setPlans((prev) => prev.filter((p) => p.id !== id))
  }

  async function updatePlan() {
    if (!editingPlan || !planTitle.trim()) return
    setSavingPlan(true)
    const title = planTitle.trim()
    let planned_at: string | null = null
    if (planDate) {
      const dt = planTime ? `${planDate}T${planTime}:00` : `${planDate}T00:00:00`
      planned_at = new Date(dt).toISOString()
    }
    await supabase.from('couple_plans').update({ title, planned_at }).eq('id', editingPlan.id)
    if (editingPlan.message_id) {
      await supabase.from('messages').update({
        content: JSON.stringify({ title, planned_at, plan_id: editingPlan.id }),
      }).eq('id', editingPlan.message_id)
    }
    setPlans((prev) => prev.map((p) => p.id === editingPlan.id ? { ...p, title, planned_at } : p))
    setEditingPlan(null); setPlanTitle(''); setPlanDate(''); setPlanTime('')
    setShowPlanModal(false); setSavingPlan(false)
    showToast('Plan updated ✓')
  }

  function openEditPlan(plan: Plan) {
    setEditingPlan(plan)
    setPlanTitle(plan.title)
    if (plan.planned_at) {
      const d = new Date(plan.planned_at)
      setPlanDate(d.toISOString().slice(0, 10))
      const h = String(d.getHours()).padStart(2, '0')
      const m = String(d.getMinutes()).padStart(2, '0')
      if (d.getHours() !== 0 || d.getMinutes() !== 0) setPlanTime(`${h}:${m}`)
      else setPlanTime('')
    } else { setPlanDate(''); setPlanTime('') }
    setShowPlanModal(true)
  }

  function formatPlanDate(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    const planDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0
    const timeStr = hasTime ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''
    let dayStr: string
    if (planDay.getTime() === today.getTime()) dayStr = 'Today'
    else if (planDay.getTime() === tomorrow.getTime()) dayStr = 'Tomorrow'
    else dayStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return timeStr ? `${dayStr} · ${timeStr}` : dayStr
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

  async function saveMeetupTime() {
    if (!meetupInput || !userId) return
    const now = new Date().toISOString()
    await supabase.from('profiles').update({ meetup_time: meetupInput, meetup_time_set_at: now }).eq('id', userId)
    setMyMeetup({ time: meetupInput, setAt: now })
    setShowMeetupInput(false)
    showToast('Meetup time set ✦')
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

  async function sendQuickPhrase(phrase: string) {
    if (!userId || sendingPhrase) return
    setSendingPhrase(phrase)
    await supabase.from('messages').insert({ from_user_id: userId, content: phrase, type: 'text', photo_url: null })
    if (partnerProfile?.id) notifyPartner(partnerProfile.id, `${profile?.name || 'Your love'} 💬`, phrase, '/messages')
    setSendingPhrase(null)
    setSentPhrase(phrase)
    setTimeout(() => setSentPhrase(null), 2200)
    showToast('Sent 💕')
    loadFeed()
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

  const activeMeetup = (() => {
    if (!myMeetup && !partnerMeetup) return null
    if (myMeetup && !partnerMeetup) return { ...myMeetup, setBy: 'me' as const }
    if (!myMeetup && partnerMeetup) return { ...partnerMeetup, setBy: 'partner' as const }
    return new Date(myMeetup!.setAt) >= new Date(partnerMeetup!.setAt)
      ? { ...myMeetup!, setBy: 'me' as const }
      : { ...partnerMeetup!, setBy: 'partner' as const }
  })()
  const mH = meetupSecondsLeft !== null ? Math.floor(meetupSecondsLeft / 3600) : null
  const mM = meetupSecondsLeft !== null ? Math.floor((meetupSecondsLeft % 3600) / 60) : null
  const mS = meetupSecondsLeft !== null ? meetupSecondsLeft % 60 : null

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

  return (
    <div style={{ minHeight: '100svh', paddingBottom: '100px', backgroundColor: 'rgba(15,13,10,0.55)' }}>
      <style>{`
        @keyframes glow-float { 0%,100%{opacity:.5} 50%{opacity:.9} }
        @keyframes bar-grow { from{width:0} to{width:var(--w)} }
        .bar-anim { animation: bar-grow 1.4s .4s cubic-bezier(.16,1,.3,1) both; }
        @keyframes fade-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .section { animation: fade-in .5s ease both; }
        @keyframes phrase-sent { 0%{transform:scale(1)} 40%{transform:scale(1.18)} 70%{transform:scale(0.94)} 100%{transform:scale(1)} }
        .phrase-sent { animation: phrase-sent 0.45s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes phrase-shine {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
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

        {/* ── We Meet Again + Connection Today (side by side) ── */}
        <div className="section" style={{ margin: '10px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', alignItems: 'stretch' }}>

          {/* We Meet Again */}
          <div style={{ padding: '14px', borderRadius: '18px', backgroundColor: '#141210', border: '1px solid #231F1C', display: 'flex', flexDirection: 'column' }}>
            <p style={{ fontSize: '0.58rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4A4440', fontWeight: 600, marginBottom: '8px' }}>We meet again</p>
            {activeMeetup && meetupSecondsLeft !== null ? (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1px', flex: 1 }}>
                  {[{ v: mH, u: 'hr' }, { v: mM, u: 'min' }, { v: mS, u: 's' }].map(({ v, u }, i) => (
                    <div key={u} style={{ display: 'flex', alignItems: 'flex-end', gap: '1px' }}>
                      {i > 0 && <span style={{ fontSize: '1.3rem', color: '#2E2822', fontWeight: 300, lineHeight: 1.1, paddingBottom: '7px' }}>:</span>}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', fontSize: '1.7rem', fontWeight: 700, lineHeight: 1, color: meetupSecondsLeft < 3600 ? '#D4A0A7' : '#E8E0D8' }}>
                          {String(v ?? 0).padStart(2, '0')}
                        </div>
                        <div style={{ fontSize: '0.52rem', color: '#4A4440', fontWeight: 500, marginTop: '2px' }}>{u}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <p style={{ fontSize: '0.58rem', color: '#4A4440' }}>{activeMeetup.time}</p>
                  <button onClick={() => setShowMeetupInput(!showMeetupInput)} style={{ fontSize: '0.6rem', color: '#D4A0A7', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
                </div>
                {showMeetupInput && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <input type="time" value={meetupInput} onChange={(e) => setMeetupInput(e.target.value)} style={{ flex: 1, borderRadius: '8px', border: '1px solid #3D3633', padding: '6px 8px', fontSize: '0.78rem', outline: 'none', backgroundColor: '#0C0A08', color: '#F5F0E8' }} />
                    <button onClick={saveMeetupTime} style={{ padding: '6px 10px', borderRadius: '8px', background: 'linear-gradient(135deg, #D4A0A7, #C9A260)', color: '#1C1917', fontWeight: 700, fontSize: '0.75rem', border: 'none', cursor: 'pointer' }}>Set</button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {showMeetupInput ? (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input type="time" value={meetupInput} onChange={(e) => setMeetupInput(e.target.value)} style={{ flex: 1, borderRadius: '8px', border: '1px solid #3D3633', padding: '6px 8px', fontSize: '0.78rem', outline: 'none', backgroundColor: '#0C0A08', color: '#F5F0E8' }} />
                    <button onClick={saveMeetupTime} style={{ padding: '6px 10px', borderRadius: '8px', background: 'linear-gradient(135deg, #D4A0A7, #C9A260)', color: '#1C1917', fontWeight: 700, fontSize: '0.75rem', border: 'none', cursor: 'pointer' }}>Set</button>
                  </div>
                ) : (
                  <button onClick={() => setShowMeetupInput(true)} style={{ fontSize: '0.78rem', color: '#D4A0A7', background: 'none', border: '1px solid rgba(212,160,167,0.25)', borderRadius: '10px', padding: '8px 10px', cursor: 'pointer', width: '100%' }}>🤝 Set a time</button>
                )}
              </div>
            )}
          </div>

          {/* Connection Today */}
          <div style={{ padding: '14px', borderRadius: '18px', backgroundColor: '#141210', border: '1px solid #231F1C', display: 'flex', flexDirection: 'column' }}>
            <p style={{ fontSize: '0.58rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4A4440', fontWeight: 600, marginBottom: '8px' }}>Connection today</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flex: 1 }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E8E0D8' }}>{meterLabel.icon} {meterLabel.text}</p>
              <span style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', fontSize: '1.7rem', fontWeight: 700, background: 'linear-gradient(135deg, #D4A0A7, #C9A260)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {loveScore}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '2px' }}>
              {Array.from({ length: 20 }, (_, i) => (
                <div key={i} style={{ flex: 1, height: '4px', borderRadius: '99px', transition: 'background-color 0.3s', backgroundColor: (i / 20) * 100 < loveScore ? (i < 10 ? '#D4A0A7' : '#C9A260') : '#231F1C' }} />
              ))}
            </div>
          </div>

        </div>

        {/* ── Our Plans ─────────────────────────────────────── */}
        <div className="section" style={{ margin: '10px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <p style={{ fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4A4440', fontWeight: 600, whiteSpace: 'nowrap' }}>Our Plans</p>
            <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, #2E2822, transparent)' }} />
            <button onClick={() => setShowPlanModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '99px', border: '1px solid rgba(212,160,167,0.3)', backgroundColor: 'rgba(212,160,167,0.08)', color: '#D4A0A7', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', outline: 'none' }}>
              + Add
            </button>
          </div>
          {plansLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[1, 2].map((i) => <div key={i} style={{ height: '48px', borderRadius: '14px', backgroundColor: '#181512' }} />)}
            </div>
          ) : plans.length === 0 ? (
            <button onClick={() => setShowPlanModal(true)} style={{ width: '100%', padding: '18px', borderRadius: '16px', border: '1px dashed #2E2822', backgroundColor: 'transparent', cursor: 'pointer', outline: 'none', textAlign: 'center' }}>
              <p style={{ fontSize: '0.82rem', color: '#4A4440' }}>Nothing planned yet — add something to look forward to 🗓️</p>
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {plans.slice(0, 6).map((plan) => (
                <div key={plan.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '14px', backgroundColor: '#141210', border: `1px solid ${plan.done ? '#1E1B18' : '#231F1C'}`, opacity: plan.done ? 0.55 : 1, transition: 'opacity 0.2s' }}>
                  <button onClick={() => togglePlanDone(plan)} style={{ flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%', border: `2px solid ${plan.done ? '#4ade80' : '#3D3633'}`, backgroundColor: plan.done ? 'rgba(74,222,128,0.15)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', outline: 'none', fontSize: '0.7rem', color: '#4ade80' }}>
                    {plan.done ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.88rem', fontWeight: 500, color: '#E8E0D8', textDecoration: plan.done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan.title}</p>
                    {plan.planned_at && (
                      <p style={{ fontSize: '0.68rem', color: plan.done ? '#4A4440' : '#C9A260', marginTop: '2px' }}>{formatPlanDate(plan.planned_at)}</p>
                    )}
                  </div>
                  <button onClick={() => openEditPlan(plan)} style={{ flexShrink: 0, padding: '4px 6px', borderRadius: '8px', border: 'none', backgroundColor: 'transparent', color: '#5A5450', cursor: 'pointer', fontSize: '0.72rem', outline: 'none' }}>✎</button>
                  <button onClick={() => deletePlan(plan.id)} style={{ flexShrink: 0, padding: '4px 6px', borderRadius: '8px', border: 'none', backgroundColor: 'transparent', color: '#4A4440', cursor: 'pointer', fontSize: '0.75rem', outline: 'none' }}>✕</button>
                </div>
              ))}
              {plans.length > 6 && (
                <p style={{ fontSize: '0.7rem', color: '#4A4440', textAlign: 'center', paddingTop: '4px' }}>{plans.length - 6} more plans</p>
              )}
            </div>
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

        {/* ── Our Phrases ───────────────────────────────────── */}
        <div className="section" style={{ margin: '14px 16px 0' }}>
          {/* Section header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <p style={{ fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#4A4440', fontWeight: 600, whiteSpace: 'nowrap' }}>Quick Links</p>
            <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, #2E2822, transparent)' }} />
            <span style={{ fontSize: '0.75rem' }}>💬</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {([
              {
                phrase: 'Ready moi, Ulai diyu!',
                subtitle: "I'm ready — come get me!",
                icon: '✨',
                accent: '#D4A0A7',
                bg: 'linear-gradient(135deg, rgba(212,160,167,0.1) 0%, rgba(212,160,167,0.03) 100%)',
                border: 'rgba(212,160,167,0.22)',
                iconBg: 'rgba(212,160,167,0.16)',
              },
              {
                phrase: 'Goi pai jonaba',
                subtitle: 'Let me know when you reach',
                icon: '📍',
                accent: '#C9A260',
                bg: 'linear-gradient(135deg, rgba(201,162,96,0.1) 0%, rgba(201,162,96,0.03) 100%)',
                border: 'rgba(201,162,96,0.22)',
                iconBg: 'rgba(201,162,96,0.16)',
              },
              {
                phrase: 'Ahi palu jaan',
                subtitle: "I've arrived, love",
                icon: '🏡',
                accent: '#A8C4A2',
                bg: 'linear-gradient(135deg, rgba(168,196,162,0.1) 0%, rgba(168,196,162,0.03) 100%)',
                border: 'rgba(168,196,162,0.22)',
                iconBg: 'rgba(168,196,162,0.16)',
              },
            ] as const).map(({ phrase, subtitle, icon, accent, bg, border, iconBg }) => {
              const isSending = sendingPhrase === phrase
              const wasSent = sentPhrase === phrase
              return (
                <button
                  key={phrase}
                  onClick={() => sendQuickPhrase(phrase)}
                  disabled={!!sendingPhrase}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '14px 14px 14px 16px',
                    borderRadius: '18px',
                    background: bg,
                    border: `1px solid ${wasSent ? accent : border}`,
                    cursor: sendingPhrase ? 'default' : 'pointer',
                    outline: 'none', textAlign: 'left', width: '100%',
                    opacity: sendingPhrase && !isSending ? 0.45 : 1,
                    transition: 'opacity 0.2s, border-color 0.3s',
                    boxShadow: wasSent ? `0 0 0 1px ${accent}40` : 'none',
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  {/* Shimmer overlay when sent */}
                  {wasSent && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: `linear-gradient(90deg, transparent 0%, ${accent}18 50%, transparent 100%)`,
                      backgroundSize: '200% 100%',
                      animation: 'phrase-shine 0.7s ease-out',
                      pointerEvents: 'none',
                    }} />
                  )}

                  {/* Icon circle */}
                  <div
                    className={wasSent ? 'phrase-sent' : ''}
                    style={{
                      width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: wasSent ? '1.2rem' : '1.3rem',
                      backgroundColor: iconBg,
                      border: `1px solid ${accent}30`,
                      transition: 'font-size 0.2s',
                    }}
                  >
                    {wasSent ? '✓' : isSending ? '…' : icon}
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
                      fontSize: '1.15rem', fontWeight: 600, lineHeight: 1.2,
                      color: wasSent ? accent : '#E8E0D8',
                      transition: 'color 0.3s',
                    }}>
                      {phrase}
                    </p>
                    <p style={{ fontSize: '0.62rem', color: '#4A4440', marginTop: '2px' }}>{subtitle}</p>
                  </div>

                  {/* Send icon */}
                  <div style={{
                    width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: wasSent ? `${accent}25` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${wasSent ? accent + '50' : 'rgba(255,255,255,0.07)'}`,
                    transition: 'background-color 0.3s, border-color 0.3s',
                  }}>
                    {wasSent ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: isSending ? 0.4 : 1 }}>
                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
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

      {/* ── Add Plan Sheet ──────────────────────────────────── */}
      <Sheet show={showPlanModal} onDismiss={() => { setShowPlanModal(false); setEditingPlan(null); setPlanTitle(''); setPlanDate(''); setPlanTime('') }}>
        <h3 style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', fontSize: '1.2rem', fontWeight: 700, color: '#F0EBE3', textAlign: 'center', marginBottom: '16px' }}>
          {editingPlan ? 'Edit Plan ✎' : 'Add a Plan 🗓️'}
        </h3>
        <input
          type="text"
          placeholder="What are you planning? (e.g. Spa session)"
          value={planTitle}
          onChange={(e) => setPlanTitle(e.target.value)}
          style={{ width: '100%', borderRadius: '12px', border: '1px solid #2E2822', padding: '11px 14px', fontSize: '0.88rem', outline: 'none', backgroundColor: '#0A0906', color: '#F0EBE3', marginBottom: '10px', boxSizing: 'border-box' }}
        />
        <p style={{ fontSize: '0.72rem', color: '#4A4440', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>When? (optional)</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
          <div>
            <p style={{ fontSize: '0.68rem', color: '#5A5450', marginBottom: '4px' }}>Date</p>
            <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} style={{ width: '100%', borderRadius: '10px', border: '1px solid #2E2822', padding: '9px 12px', fontSize: '0.85rem', outline: 'none', backgroundColor: '#0A0906', color: planDate ? '#F0EBE3' : '#4A4440', boxSizing: 'border-box' }} />
          </div>
          <div>
            <p style={{ fontSize: '0.68rem', color: '#5A5450', marginBottom: '4px' }}>Time</p>
            <input type="time" value={planTime} onChange={(e) => setPlanTime(e.target.value)} disabled={!planDate} style={{ width: '100%', borderRadius: '10px', border: '1px solid #2E2822', padding: '9px 12px', fontSize: '0.85rem', outline: 'none', backgroundColor: '#0A0906', color: planTime ? '#F0EBE3' : '#4A4440', opacity: planDate ? 1 : 0.4, boxSizing: 'border-box' }} />
          </div>
        </div>
        <button onClick={editingPlan ? updatePlan : addPlan} disabled={!planTitle.trim() || savingPlan} style={{ width: '100%', padding: '14px', borderRadius: '14px', background: 'linear-gradient(135deg, #D4A0A7, #C9A260)', color: '#1C1917', fontWeight: 700, fontSize: '0.95rem', border: 'none', cursor: planTitle.trim() ? 'pointer' : 'default', opacity: (!planTitle.trim() || savingPlan) ? 0.45 : 1 }}>
          {savingPlan ? (editingPlan ? 'Saving…' : 'Adding…') : (editingPlan ? 'Save Changes ✓' : 'Add Plan ✓')}
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
