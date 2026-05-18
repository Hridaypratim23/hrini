'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/contexts/AppContext'
import { notifyPartner } from '@/hooks/usePush'
import { getRandomQuote, formatRelativeTime } from '@/lib/utils'
import type { Message, MessageReaction } from '@/types'

const REACTION_EMOJIS = ['❤️', '😘', '🥰', '😂', '💕', '🔥']

type ReactionsMap = Record<string, MessageReaction[]>
type MessageWithRead = Message & { read_at?: string | null }

// contextMenu holds just the messageId; shown as a bottom sheet (no position needed)
type ContextMenuState = string | null

export default function MessagesPage() {
  const { userId, profile, partnerProfile } = useApp()
  const supabase = createClient()

  const [messages, setMessages] = useState<MessageWithRead[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [eta, setEta] = useState('')
  const [showEta, setShowEta] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [reactions, setReactions] = useState<ReactionsMap>({})
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [partnerTyping, setPartnerTyping] = useState(false)
  const [replyTo, setReplyTo] = useState<MessageWithRead | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null)
  const [scrolledUp, setScrolledUp] = useState(false)
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const markedRead = useRef(false)
  const lastTypingSent = useRef(0)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const lastTapTime = useRef<Record<string, number>>({})
  const longPressTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const swipeState = useRef<{
    msgId: string; startX: number; startY: number
    el: HTMLElement; triggered: boolean
  } | null>(null)

  const partnerName = partnerProfile?.name || 'Rajreeni'
  const myName = profile?.name || 'Hriday'

  // ── Effects ──────────────────────────────────────────────

  useEffect(() => { if (userId) loadMessages() }, [userId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
  }, [messages.length])

  useEffect(() => {
    if (messages.length > 0) loadReactions(messages.map((m) => m.id))
  }, [messages.length])

  useEffect(() => {
    if (replyTo || editingId) composerRef.current?.focus()
  }, [replyTo, editingId])

  useEffect(() => {
    const el = messageListRef.current
    if (!el) return
    const onScroll = () => {
      setScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 120)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => setKeyboardVisible(window.innerHeight - vv.height > 150)
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  // ── Realtime ─────────────────────────────────────────────

  useEffect(() => {
    if (!userId) return
    const seenIds = new Set<string>()

    const broadcastChannel = supabase
      .channel('hrini-messages-broadcast', { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        const msg = payload as MessageWithRead
        if (seenIds.has(msg.id)) return
        seenIds.add(msg.id)
        setPartnerTyping(false)
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== msg.id && m.id !== payload.optimistic_id)
          return [...filtered, msg].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        })
        if (partnerProfile?.id) markPartnerMessagesRead(partnerProfile.id)
      })
      .on('broadcast', { event: 'typing' }, () => {
        setPartnerTyping(true)
        if (typingTimeout.current) clearTimeout(typingTimeout.current)
        typingTimeout.current = setTimeout(() => setPartnerTyping(false), 3000)
      })
      .subscribe()

    const pgChannel = supabase
      .channel('messages-pg-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as MessageWithRead
        if (seenIds.has(msg.id)) return
        seenIds.add(msg.id)
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== msg.id)
          return [...filtered, msg].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const updated = payload.new as MessageWithRead
        setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        const deleted = payload.old as { id: string }
        setMessages((prev) => prev.filter((m) => m.id !== deleted.id))
      })
      .subscribe()

    const readChannel = supabase
      .channel('messages-read-receipts')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `from_user_id=eq.${userId}` }, (payload) => {
        const updated = payload.new as MessageWithRead
        if (updated.read_at) {
          setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, read_at: updated.read_at } : m))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(broadcastChannel)
      supabase.removeChannel(pgChannel)
      supabase.removeChannel(readChannel)
    }
  }, [userId, partnerProfile?.id])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('reactions-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, (payload) => {
        const r = payload.new as MessageReaction
        setReactions((prev) => ({ ...prev, [r.message_id]: [...(prev[r.message_id] ?? []), r] }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, (payload) => {
        const r = payload.old as MessageReaction
        setReactions((prev) => ({ ...prev, [r.message_id]: (prev[r.message_id] ?? []).filter((x) => x.id !== r.id) }))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  // ── Data ─────────────────────────────────────────────────

  async function markPartnerMessagesRead(partnerId: string) {
    if (!userId) return
    await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('from_user_id', partnerId).is('read_at', null)
    setMessages((prev) => prev.map((m) => m.from_user_id === partnerId && !m.read_at ? { ...m, read_at: new Date().toISOString() } : m))
  }

  async function loadMessages() {
    if (!userId) return
    const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(100)
    if (data) {
      setMessages(data as MessageWithRead[])
      if (partnerProfile?.id && !markedRead.current) {
        markedRead.current = true
        markPartnerMessagesRead(partnerProfile.id)
      }
    }
  }

  async function loadReactions(messageIds: string[]) {
    if (!messageIds.length) return
    const { data } = await supabase.from('message_reactions').select('*').in('message_id', messageIds)
    if (!data) return
    const map: ReactionsMap = {}
    for (const r of data as MessageReaction[]) {
      if (!map[r.message_id]) map[r.message_id] = []
      map[r.message_id].push(r)
    }
    setReactions(map)
  }

  // ── Send / Edit ───────────────────────────────────────────

  async function send(content: string, type: Message['type'], photoUrl?: string) {
    if (!userId) return
    setSending(true)
    const replyId = replyTo?.id ?? null
    const replyContent = replyTo
      ? (replyTo.type === 'photo' ? '📸 Photo' : replyTo.content.slice(0, 120))
      : null
    const optimisticId = `opt-${Date.now()}`
    const optimisticMsg: MessageWithRead = {
      id: optimisticId, from_user_id: userId, content, type,
      photo_url: photoUrl ?? null, created_at: new Date().toISOString(),
      read_at: null, reply_to_id: replyId, reply_to_content: replyContent, edited_at: null,
    }
    setMessages((prev) => [...prev, optimisticMsg])
    setReplyTo(null)

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({ from_user_id: userId, content, type, photo_url: photoUrl ?? null, reply_to_id: replyId, reply_to_content: replyContent })
      .select().single()

    if (error) { setMessages((prev) => prev.filter((m) => m.id !== optimisticId)); setSending(false); return }

    setMessages((prev) => prev.map((m) => m.id === optimisticId ? inserted as MessageWithRead : m))

    await supabase.channel('hrini-messages-broadcast').send({
      type: 'broadcast', event: 'new_message',
      payload: { ...(inserted as Message), optimistic_id: optimisticId },
    })

    if (partnerProfile?.id) {
      const titles: Record<Message['type'], string> = {
        text: `${myName} 💬`, miss_you: `${myName} misses you 💭`,
        love_quote: `${myName} sent a quote 💫`, photo: `${myName} shared a photo 📸`,
      }
      const bodies: Record<Message['type'], string> = {
        text: content.slice(0, 80), miss_you: 'They are thinking of you right now',
        love_quote: content.slice(0, 80), photo: 'Open HRINI to see it',
      }
      notifyPartner(partnerProfile.id, titles[type], bodies[type], '/messages')
    }
    setSending(false)
  }

  function handleTextChange(e: React.FormEvent<HTMLDivElement>) {
    const content = e.currentTarget.innerText ?? ''
    setText(content)
    const now = Date.now()
    if (now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now
      supabase.channel('hrini-messages-broadcast').send({ type: 'broadcast', event: 'typing', payload: {} })
    }
  }

  async function sendOrUpdate() {
    const trimmed = text.trim()
    if (!trimmed) return
    if (editingId) {
      const now = new Date().toISOString()
      await supabase.from('messages').update({ content: trimmed, edited_at: now }).eq('id', editingId).eq('from_user_id', userId!)
      setMessages((prev) => prev.map((m) => m.id === editingId ? { ...m, content: trimmed, edited_at: now } : m))
      setEditingId(null); setText('')
      if (composerRef.current) composerRef.current.innerHTML = ''
      return
    }
    await send(trimmed, 'text')
    setText('')
    if (composerRef.current) composerRef.current.innerHTML = ''
  }

  function cancelCompose() {
    setReplyTo(null)
    setEditingId(null)
    setText('')
    if (composerRef.current) composerRef.current.innerHTML = ''
  }

  async function sendMissYou() { setShowActions(false); await send('Missing you right now 💭', 'miss_you') }
  async function sendQuote() { setShowActions(false); await send(getRandomQuote(), 'love_quote') }

  async function sendPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) { setShowActions(false); return }
    setShowActions(false); setSending(true)
    const path = `${userId}/${Date.now()}.${file.name.split('.').pop()}`
    const { data: up, error } = await supabase.storage.from('photos').upload(path, file)
    if (!error && up) {
      const { data: url } = supabase.storage.from('photos').getPublicUrl(up.path)
      await send('📸 Photo', 'photo', url.publicUrl)
    } else { setSending(false) }
    e.target.value = ''
  }

  async function saveEta() {
    if (!eta || !userId) return
    await supabase.from('profiles').update({ coming_home_time: eta }).eq('id', userId)
    await send(`🏡 Coming home at ${eta}`, 'text')
    setShowEta(false); setEta('')
  }

  // ── Reactions ─────────────────────────────────────────────

  async function toggleReaction(messageId: string, emoji: string) {
    if (!userId) return
    setContextMenu(null)
    const existing = (reactions[messageId] ?? []).find((r) => r.user_id === userId && r.emoji === emoji)
    if (existing) {
      await supabase.from('message_reactions').delete().eq('id', existing.id)
      setReactions((prev) => ({ ...prev, [messageId]: (prev[messageId] ?? []).filter((r) => r.id !== existing.id) }))
    } else {
      const { data } = await supabase.from('message_reactions').insert({ message_id: messageId, user_id: userId, emoji }).select().single()
      if (data) setReactions((prev) => ({ ...prev, [messageId]: [...(prev[messageId] ?? []), data as MessageReaction] }))
    }
  }

  // ── Actions ───────────────────────────────────────────────

  async function deleteMessage(messageId: string) {
    setContextMenu(null)
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
    await supabase.from('messages').delete().eq('id', messageId).eq('from_user_id', userId!)
  }

  function startEdit(msg: MessageWithRead) {
    setContextMenu(null)
    setEditingId(msg.id)
    setText(msg.content)
    setReplyTo(null)
    requestAnimationFrame(() => {
      if (!composerRef.current) return
      composerRef.current.innerText = msg.content
      composerRef.current.focus()
      const range = document.createRange()
      const sel = window.getSelection()
      range.selectNodeContents(composerRef.current)
      range.collapse(false)
      sel?.removeAllRanges()
      sel?.addRange(range)
    })
  }

  function copyText(content: string) {
    setContextMenu(null)
    navigator.clipboard.writeText(content).catch(() => {})
  }

  function replyToMsg(msg: MessageWithRead) {
    setContextMenu(null)
    setReplyTo(msg)
    setEditingId(null)
  }

  // ── Double-tap to ❤️ ─────────────────────────────────────

  function handleDoubleTap(msg: MessageWithRead) {
    const now = Date.now()
    const last = lastTapTime.current[msg.id] ?? 0
    // 500ms window — generous enough for iOS
    if (now - last < 500) toggleReaction(msg.id, '❤️')
    lastTapTime.current[msg.id] = now
  }

  // ── Swipe to reply ────────────────────────────────────────

  function onTouchStart(msg: MessageWithRead, e: React.TouchEvent) {
    const touch = e.touches[0]
    // Capture el synchronously — e.currentTarget becomes null inside setTimeout
    const el = e.currentTarget as HTMLElement
    swipeState.current = { msgId: msg.id, startX: touch.clientX, startY: touch.clientY, el, triggered: false }
    longPressTimer.current[msg.id] = setTimeout(() => {
      // Read el from swipeState (captured above), not from e.currentTarget
      if (!swipeState.current || swipeState.current.msgId !== msg.id) return
      swipeState.current = null
      setContextMenu(msg.id)
    }, 500)
  }

  function onTouchMove(msg: MessageWithRead, e: React.TouchEvent) {
    const s = swipeState.current
    if (!s || s.msgId !== msg.id) return
    const touch = e.touches[0]
    const dx = touch.clientX - s.startX
    const dy = Math.abs(touch.clientY - s.startY)
    if (Math.abs(dx) > 8 || dy > 8) clearTimeout(longPressTimer.current[msg.id])
    if (dy > 14 && dy > Math.abs(dx)) { resetSwipe(msg.id); return }
    if (dx <= 0) return
    const clamped = Math.min(dx * 0.65, 72)
    s.el.style.transform = `translateX(${clamped}px)`
    s.el.style.transition = 'none'
    if (clamped >= 58 && !s.triggered) s.triggered = true
  }

  function onTouchEnd(msg: MessageWithRead, onTap?: () => void) {
    clearTimeout(longPressTimer.current[msg.id])
    const s = swipeState.current
    if (!s || s.msgId !== msg.id) return
    const triggered = s.triggered
    resetSwipe(msg.id)
    if (triggered) { setReplyTo(msg); setEditingId(null) }
    else if (onTap) onTap()
    else handleDoubleTap(msg)
  }

  function resetSwipe(msgId: string) {
    const s = swipeState.current
    if (!s || s.msgId !== msgId) return
    s.el.style.transition = 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1)'
    s.el.style.transform = 'translateX(0)'
    setTimeout(() => { if (s.el) s.el.style.transition = '' }, 290)
    swipeState.current = null
  }

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // ── Grouping ─────────────────────────────────────────────

  function isGrouped(msg: MessageWithRead, idx: number, arr: MessageWithRead[]) {
    if (idx === 0) return false
    const prev = arr[idx - 1]
    return (
      prev.from_user_id === msg.from_user_id &&
      new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 90_000 &&
      !msg.reply_to_id
    )
  }

  // ── Sub-components ────────────────────────────────────────

  function ReadLabel({ msg, dark }: { msg: MessageWithRead; dark?: boolean }) {
    if (msg.from_user_id !== userId || !msg.read_at) return null
    return <span style={{ fontSize: '0.58rem', color: dark ? 'rgba(28,25,23,0.5)' : '#D4A0A7', fontWeight: 500 }}>read</span>
  }

  function ReplyQuote({ msg, isMe }: { msg: MessageWithRead; isMe: boolean }) {
    if (!msg.reply_to_id || !msg.reply_to_content) return null
    const origin = messages.find((m) => m.id === msg.reply_to_id)
    const sender = origin
      ? (origin.from_user_id === userId ? myName.split(' ')[0] : partnerName.split(' ')[0])
      : '…'
    return (
      <button
        onClick={() => {
          const el = messageRefs.current[msg.reply_to_id!]
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.style.transition = 'background 0.15s'
            el.style.background = 'rgba(212,160,167,0.18)'
            setTimeout(() => { if (el) { el.style.background = ''; el.style.transition = '' } }, 900)
          }
        }}
        style={{
          display: 'block', textAlign: 'left', width: '100%',
          boxShadow: `inset 2px 0 0 ${isMe ? 'rgba(28,25,23,0.4)' : '#D4A0A7'}`,
          background: isMe ? 'rgba(0,0,0,0.12)' : 'rgba(212,160,167,0.12)',
          borderRadius: '6px', padding: '4px 8px', marginBottom: '5px',
          cursor: 'pointer', border: 'none', outline: 'none',
        }}
      >
        <p style={{ fontSize: '0.6rem', fontWeight: 700, color: isMe ? 'rgba(28,25,23,0.6)' : '#D4A0A7', marginBottom: '1px' }}>{sender}</p>
        <p style={{ fontSize: '0.7rem', color: isMe ? 'rgba(28,25,23,0.5)' : '#A8A29E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
          {msg.reply_to_content}
        </p>
      </button>
    )
  }

  function Reactions({ msgId }: { msgId: string }) {
    const grouped: Record<string, { count: number; mine: boolean }> = {}
    for (const r of reactions[msgId] ?? []) {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, mine: false }
      grouped[r.emoji].count++
      if (r.user_id === userId) grouped[r.emoji].mine = true
    }
    if (!Object.keys(grouped).length) return null
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '3px' }}>
        {Object.entries(grouped).map(([emoji, { count, mine }]) => (
          <button key={emoji} onClick={() => toggleReaction(msgId, emoji)} style={{
            display: 'flex', alignItems: 'center', gap: '2px',
            padding: '2px 7px', borderRadius: '99px', fontSize: '0.75rem',
            backgroundColor: mine ? 'rgba(212,160,167,0.2)' : 'rgba(61,54,51,0.6)',
            border: `1px solid ${mine ? '#D4A0A7' : '#3D3633'}`,
            color: '#F5F0E8', cursor: 'pointer',
          }}>
            <span>{emoji}</span>
            {count > 1 && <span style={{ color: '#A8A29E', fontSize: '0.58rem' }}>{count}</span>}
          </button>
        ))}
      </div>
    )
  }

  // ── Render message ────────────────────────────────────────

  function renderMessage(msg: MessageWithRead, idx: number, arr: MessageWithRead[]) {
    const isMe = msg.from_user_id === userId
    const name = isMe ? myName : partnerName
    const time = formatRelativeTime(msg.created_at)
    const grouped = isGrouped(msg, idx, arr)

    // touch-action: manipulation prevents iOS double-tap zoom, keeps our double-tap ❤️ working
    const sharedStyle = { touchAction: 'manipulation' as const }

    const touchProps = {
      onTouchStart: (e: React.TouchEvent) => onTouchStart(msg, e),
      onTouchMove: (e: React.TouchEvent) => onTouchMove(msg, e),
      onTouchEnd: () => onTouchEnd(msg),
      // desktop right-click → context menu
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setContextMenu(msg.id) },
    }

    if (msg.type === 'miss_you') {
      return (
        <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el }}
          style={{ display: 'flex', justifyContent: 'center', margin: `${grouped ? '2px' : '10px'} 16px 0`, ...sharedStyle }}
          {...touchProps}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ padding: '12px 20px', borderRadius: '18px', textAlign: 'center', maxWidth: '260px', background: 'rgba(212,160,167,0.15)', border: '1px solid rgba(212,160,167,0.3)' }}>
              <p style={{ fontSize: '1.4rem', marginBottom: '3px' }}>💭</p>
              <p style={{ fontSize: '0.85rem', fontWeight: 500, color: '#D4A0A7' }}>
                {isMe ? 'You sent a miss you' : `${name} misses you 💕`}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '3px' }}>
                <p style={{ fontSize: '0.62rem', color: '#A8A29E' }}>{time}</p>
                <ReadLabel msg={msg} />
              </div>
            </div>
            <Reactions msgId={msg.id} />
          </div>
        </div>
      )
    }

    if (msg.type === 'love_quote') {
      return (
        <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el }}
          style={{ display: 'flex', justifyContent: 'center', margin: `${grouped ? '2px' : '10px'} 16px 0`, ...sharedStyle }}
          {...touchProps}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '340px' }}>
            <div style={{ width: '100%', padding: '16px 18px', borderRadius: '18px', textAlign: 'center', background: 'rgba(201,162,96,0.12)', border: '1px solid rgba(201,162,96,0.25)' }}>
              <p style={{ fontSize: '1rem', marginBottom: '5px' }}>💫</p>
              <p style={{ fontFamily: 'var(--font-dancing, "Dancing Script", cursive)', color: '#C9A260', fontSize: '1.05rem', fontStyle: 'italic', lineHeight: 1.5 }}>
                &ldquo;{msg.content}&rdquo;
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '6px' }}>
                <p style={{ fontSize: '0.62rem', color: '#A8A29E' }}>from {name} · {time}</p>
                <ReadLabel msg={msg} />
              </div>
            </div>
            <Reactions msgId={msg.id} />
          </div>
        </div>
      )
    }

    if (msg.type === 'photo') {
      return (
        <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el }}
          style={{ display: 'flex', margin: `${grouped ? '2px' : '8px'} 16px 0`, justifyContent: isMe ? 'flex-end' : 'flex-start', ...sharedStyle }}
          onTouchStart={(e) => onTouchStart(msg, e)}
          onTouchMove={(e) => onTouchMove(msg, e)}
          // single tap on photo → fullscreen; swipe → reply; long press → menu
          onTouchEnd={() => onTouchEnd(msg, () => { if (msg.photo_url) setFullscreenPhoto(msg.photo_url) })}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(msg.id) }}>
          <div style={{ maxWidth: '70%' }}>
            {msg.photo_url && (
              <div style={{ borderRadius: '18px', overflow: 'hidden', border: `2px solid ${isMe ? '#D4A0A7' : '#3D3633'}` }}>
                <img src={msg.photo_url} alt="shared photo"
                  style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', display: 'block' }} />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <p style={{ fontSize: '0.6rem', color: '#A8A29E' }}>{time}</p>
              <ReadLabel msg={msg} />
            </div>
            <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <Reactions msgId={msg.id} />
            </div>
          </div>
        </div>
      )
    }

    // Text bubble
    const bubbleRadius = grouped
      ? (isMe ? '18px 4px 4px 18px' : '4px 18px 18px 4px')
      : (isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px')

    return (
      <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el }}
        style={{ display: 'flex', margin: `${grouped ? '1px' : '8px'} 16px 0`, justifyContent: isMe ? 'flex-end' : 'flex-start', ...sharedStyle }}
        {...touchProps}>
        <div style={{ maxWidth: '78%' }}>
          <div style={{
            padding: '9px 13px',
            backgroundColor: isMe ? '#D4A0A7' : '#292524',
            color: isMe ? '#1C1917' : '#F5F0E8',
            borderRadius: bubbleRadius,
          }}>
            <ReplyQuote msg={msg} isMe={isMe} />
            <p style={{ fontSize: '0.9rem', lineHeight: 1.45 }}>{msg.content}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <p style={{ color: isMe ? 'rgba(28,25,23,0.48)' : '#A8A29E', fontSize: '0.58rem' }}>{time}</p>
              {msg.edited_at && <span style={{ fontSize: '0.55rem', color: isMe ? 'rgba(28,25,23,0.38)' : '#5A5450' }}>edited</span>}
              <ReadLabel msg={msg} dark={isMe} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
            <Reactions msgId={msg.id} />
          </div>
        </div>
      </div>
    )
  }

  // ── Context menu helpers ──────────────────────────────────

  const ctxMsg = contextMenu ? messages.find((m) => m.id === contextMenu) : null
  const isCtxMine = ctxMsg?.from_user_id === userId
  const isCtxText = ctxMsg?.type === 'text'

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="flex flex-col" style={{ height: '100dvh', backgroundColor: '#1C1917', position: 'relative', overflowX: 'hidden' }}>
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        .typing-dot {
          display: inline-block; width: 7px; height: 7px;
          border-radius: 50%; background: #A8A29E;
          animation: typing-bounce 1.2s ease-in-out infinite;
        }
        .typing-dot:nth-child(2) { animation-delay: 0.18s; }
        .typing-dot:nth-child(3) { animation-delay: 0.36s; }
        .composer-input:empty::before {
          content: attr(data-placeholder);
          color: #6A6460;
          pointer-events: none;
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex-none flex items-center gap-3 px-4 border-b"
        style={{ backgroundColor: '#1C1917', borderColor: '#3D3633', paddingTop: 'max(env(safe-area-inset-top, 0px), 10px)', paddingBottom: '10px' }}>
        <div className="w-9 h-9 flex-none rounded-full flex items-center justify-center font-semibold text-sm"
          style={{ backgroundColor: '#292524', color: '#D4A0A7', border: '1.5px solid #D4A0A7' }}>
          {partnerName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold leading-tight truncate"
            style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', color: '#F5F0E8', fontSize: '1rem' }}>
            {partnerName}
          </p>
          <p style={{ color: '#A8A29E', fontSize: '0.7rem' }}>your person 💕</p>
        </div>
        <button onClick={() => setShowEta(!showEta)} className="flex-none px-3 py-1.5 rounded-xl text-xs font-medium border"
          style={{ borderColor: showEta ? '#C9A260' : '#3D3633', color: '#C9A260', backgroundColor: showEta ? 'rgba(201,162,96,0.12)' : 'transparent' }}>
          🏡 ETA
        </button>
      </header>

      {/* ── ETA Picker ─────────────────────────────────────── */}
      {showEta && (
        <div className="flex-none flex gap-2 px-4 py-3 border-b" style={{ backgroundColor: '#292524', borderColor: '#3D3633' }}>
          <input type="time" value={eta} onChange={(e) => setEta(e.target.value)}
            className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: '#1C1917', borderColor: '#3D3633', color: '#F5F0E8' }} />
          <button onClick={saveEta} className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: '#C9A260', color: '#1C1917' }}>Share</button>
        </div>
      )}

      {/* ── Messages ───────────────────────────────────────── */}
      <div ref={messageListRef} className="flex-1 overflow-y-auto py-2 min-h-0" style={{ overflowX: 'hidden' }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-8">
            <p className="text-4xl">💌</p>
            <p className="text-center text-lg" style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', color: '#F5F0E8' }}>
              Start your conversation
            </p>
            <p className="text-center text-sm" style={{ color: '#A8A29E' }}>
              Swipe right on a message to reply · Double-tap to ❤️
            </p>
          </div>
        )}
        {messages.map((msg, idx, arr) => renderMessage(msg, idx, arr))}
        {partnerTyping && (
          <div className="flex px-4 my-2">
            <div className="px-4 py-3 rounded-2xl flex items-center gap-1"
              style={{ backgroundColor: '#292524', borderBottomLeftRadius: '4px' }}>
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Scroll to bottom ───────────────────────────────── */}
      {scrolledUp && (
        <button onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          style={{
            position: 'absolute', right: '16px',
            bottom: 'calc(env(safe-area-inset-bottom, 16px) + 168px)',
            width: '36px', height: '36px', borderRadius: '50%',
            backgroundColor: '#292524', border: '1px solid #3D3633',
            color: '#A8A29E', fontSize: '1rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          }}>
          ↓
        </button>
      )}

      {/* ── Context menu (bottom sheet) ─────────────────────── */}
      {contextMenu && (
        <div className="fixed inset-0 z-50" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onClick={closeContextMenu}>
          <div
            className="fixed bottom-0 left-0 right-0"
            style={{
              backgroundColor: '#1a1613',
              borderTop: '1px solid #3D3633',
              borderRadius: '24px 24px 0 0',
              padding: '0 16px',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <div style={{ width: '36px', height: '4px', borderRadius: '99px', backgroundColor: '#3D3633', margin: '14px auto 18px' }} />

            {/* Reaction row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px', padding: '0 4px' }}>
              {REACTION_EMOJIS.map((emoji) => {
                const isMine = (reactions[contextMenu] ?? []).some((r) => r.user_id === userId && r.emoji === emoji)
                return (
                  <button key={emoji} onClick={() => toggleReaction(contextMenu, emoji)}
                    style={{
                      width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: '50%', fontSize: '1.4rem', cursor: 'pointer',
                      backgroundColor: isMine ? 'rgba(212,160,167,0.2)' : 'rgba(41,37,36,0.8)',
                      border: isMine ? '2px solid #D4A0A7' : '2px solid transparent',
                      transform: isMine ? 'scale(1.1)' : 'scale(1)',
                      transition: 'transform 0.15s',
                    }}>
                    {emoji}
                  </button>
                )
              })}
            </div>

            <div style={{ height: '1px', backgroundColor: '#2E2822', marginBottom: '8px' }} />

            {/* Action list */}
            {[
              { icon: '↩️', label: 'Reply', onClick: () => ctxMsg && replyToMsg(ctxMsg), show: true },
              { icon: '📋', label: 'Copy text', onClick: () => ctxMsg && copyText(ctxMsg.content), show: isCtxText },
              { icon: '✏️', label: 'Edit', onClick: () => ctxMsg && startEdit(ctxMsg), show: isCtxMine && isCtxText },
            ].filter((a) => a.show).map((a) => (
              <button key={a.label} onClick={a.onClick}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px', width: '100%',
                  padding: '13px 8px', borderRadius: '12px', fontSize: '0.9rem',
                  color: '#E8E0D8', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}>
                <span style={{ fontSize: '1.1rem', width: '24px', textAlign: 'center' }}>{a.icon}</span>
                {a.label}
              </button>
            ))}

            {isCtxMine && (
              <>
                <div style={{ height: '1px', backgroundColor: '#2E2822', margin: '4px 0' }} />
                <button onClick={() => deleteMessage(contextMenu)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px', width: '100%',
                    padding: '13px 8px', borderRadius: '12px', fontSize: '0.9rem',
                    color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}>
                  <span style={{ fontSize: '1.1rem', width: '24px', textAlign: 'center' }}>🗑️</span>
                  Unsend
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Fullscreen photo ───────────────────────────────── */}
      {fullscreenPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
          onClick={() => setFullscreenPhoto(null)}>
          <img src={fullscreenPhoto} alt="full size"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
          <button onClick={() => setFullscreenPhoto(null)}
            style={{
              position: 'absolute', top: 'max(env(safe-area-inset-top, 0px), 16px)', right: '16px',
              width: '36px', height: '36px', borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff',
              border: 'none', fontSize: '1rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
        </div>
      )}

      {/* ── Quick actions ──────────────────────────────────── */}
      {showActions && (
        <div className="flex-none flex gap-2 px-3 py-2 border-t" style={{ backgroundColor: '#1C1917', borderColor: '#3D3633' }}>
          <button onClick={sendMissYou} disabled={sending} className="flex-1 py-2.5 rounded-xl text-xs font-medium border"
            style={{ borderColor: '#D4A0A7', color: '#D4A0A7', backgroundColor: 'rgba(212,160,167,0.08)', opacity: sending ? 0.5 : 1 }}>
            💭 Miss You
          </button>
          <button onClick={sendQuote} disabled={sending} className="flex-1 py-2.5 rounded-xl text-xs font-medium border"
            style={{ borderColor: '#C9A260', color: '#C9A260', backgroundColor: 'rgba(201,162,96,0.08)', opacity: sending ? 0.5 : 1 }}>
            💫 Quote
          </button>
          <label htmlFor="photo-file-input" className="flex-1 py-2.5 rounded-xl text-xs font-medium border text-center cursor-pointer"
            style={{ borderColor: '#A8A29E', color: '#A8A29E', backgroundColor: 'rgba(168,162,158,0.08)', opacity: sending ? 0.5 : 1, pointerEvents: sending ? 'none' : 'auto' }}>
            📸 Photo
          </label>
        </div>
      )}
      <input id="photo-file-input" ref={fileRef} type="file" accept="image/*" onChange={sendPhoto}
        style={{ position: 'fixed', top: -9999, left: -9999, opacity: 0 }} />

      {/* ── Reply / Edit bar ───────────────────────────────── */}
      {(replyTo || editingId) && (
        <div className="flex-none flex items-center gap-2 px-4 py-2 border-t"
          style={{ backgroundColor: '#1a1613', borderColor: '#3D3633' }}>
          <div style={{ width: '3px', alignSelf: 'stretch', borderRadius: '99px', backgroundColor: editingId ? '#C9A260' : '#D4A0A7', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '0.62rem', color: editingId ? '#C9A260' : '#D4A0A7', fontWeight: 600, marginBottom: '1px' }}>
              {editingId
                ? 'Editing message'
                : `Replying to ${replyTo?.from_user_id === userId ? 'yourself' : partnerName.split(' ')[0]}`}
            </p>
            <p style={{ fontSize: '0.72rem', color: '#6A6460', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {editingId ? text : (replyTo?.type === 'photo' ? '📸 Photo' : replyTo?.content)}
            </p>
          </div>
          <button onClick={cancelCompose}
            style={{ width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#3D3633', color: '#A8A29E', border: 'none', cursor: 'pointer', fontSize: '0.7rem', flexShrink: 0 }}>
            ✕
          </button>
        </div>
      )}

      {/* ── Composer ───────────────────────────────────────── */}
      <div className="flex-none flex items-center gap-2 px-3 pt-3 border-t"
        style={{
          backgroundColor: '#1C1917', borderColor: '#3D3633',
          paddingBottom: keyboardVisible ? '10px' : 'calc(env(safe-area-inset-bottom, 16px) + 88px)',
        }}>
        <button onClick={() => setShowActions(!showActions)} disabled={sending}
          className="w-10 h-10 flex-none rounded-full flex items-center justify-center text-lg font-light transition-all disabled:opacity-40"
          style={{
            backgroundColor: showActions ? 'rgba(212,160,167,0.15)' : '#292524',
            border: `1.5px solid ${showActions ? '#D4A0A7' : '#3D3633'}`,
            color: showActions ? '#D4A0A7' : '#A8A29E',
          }}>
          {showActions ? '✕' : '+'}
        </button>
        <div
          ref={composerRef}
          contentEditable
          suppressContentEditableWarning
          className="composer-input flex-1 rounded-2xl border px-4 py-2.5 text-sm outline-none"
          data-placeholder={editingId ? 'Edit message…' : 'Say something sweet…'}
          onInput={handleTextChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendOrUpdate() }
          }}
          onPaste={(e) => {
            e.preventDefault()
            const plain = e.clipboardData.getData('text/plain')
            document.execCommand('insertText', false, plain)
          }}
          style={{
            backgroundColor: '#292524',
            borderColor: editingId ? '#C9A260' : '#3D3633',
            color: '#F5F0E8',
            WebkitTextFillColor: '#F5F0E8',
            minHeight: '44px',
            maxHeight: '100px',
            overflowY: 'auto',
            wordBreak: 'break-word',
            lineHeight: '1.4',
          }}
        ></div>
        <button onClick={sendOrUpdate} disabled={sending || !text.trim()}
          className="w-10 h-10 flex-none rounded-full flex items-center justify-center transition-opacity disabled:opacity-40"
          style={{ backgroundColor: editingId ? '#C9A260' : '#D4A0A7', color: '#1C1917' }}>
          {editingId
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          }
        </button>
      </div>
    </div>
  )
}
