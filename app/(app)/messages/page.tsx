'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/contexts/AppContext'
import { notifyPartner } from '@/hooks/usePush'
import { getRandomQuote, formatRelativeTime } from '@/lib/utils'
import type { Message, MessageReaction } from '@/types'

const REACTION_EMOJIS = ['❤️', '😘', '🥰', '😂', '💕', '🔥']

const EMOJI_PICKER_LIST = [
  '❤️', '💕', '🥰', '😘', '💋', '😊',
  '😂', '🤣', '😍', '🫶', '💗', '🌹',
  '✨', '💫', '🔥', '😌', '😴', '💭',
  '🎉', '🥂', '🌸', '🤗', '😎', '🌙',
  '⭐', '💎', '🙈', '🤭', '🥺', '😭',
  '💯', '🫦', '🤌', '🫠', '🥳', '👑',
]

type ReactionsMap = Record<string, MessageReaction[]>
type MessageWithRead = Message & { read_at?: string | null; _status?: 'sending' | 'failed' }

// contextMenu holds just the messageId; shown as a bottom sheet (no position needed)
type ContextMenuState = string | null

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1280
      let w = img.width, h = img.height
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX }
        else { w = Math.round(w * MAX / h); h = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file),
        'image/jpeg', 0.82
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

function formatLastSeen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

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
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [connected, setConnected] = useState(true)
  const [partnerOnline, setPartnerOnline] = useState(false)
  const [partnerLastSeen, setPartnerLastSeen] = useState<string | null>(null)
  const [floatingHearts, setFloatingHearts] = useState<Array<{ id: number; x: number; y: number }>>([])
  const lastTouchPos = useRef({ x: 0, y: 0 })

  const PAGE_SIZE = 60

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const loadOlderRef = useRef<() => Promise<void>>(async () => {})
  const broadcastChannelRef = useRef<any>(null)
  const markedRead = useRef(false)
  const seenMsgIds = useRef(new Set<string>())
  const lastTypingSent = useRef(0)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const lastTapTime = useRef<Record<string, number>>({})
  const isTouchDevice = useRef(false)
  const longPressTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const swipeState = useRef<{
    msgId: string; startX: number; startY: number; startTime: number
    el: HTMLElement; triggered: boolean; noSwipe?: boolean
  } | null>(null)
  const firstLoadDone = useRef(false)

  const partnerName = partnerProfile?.name || 'Rajreeni'
  const myName = profile?.name || 'Hriday'

  // ── Effects ──────────────────────────────────────────────

  useEffect(() => { if (userId) loadMessages() }, [userId])

  // Seed last_seen from the most recent message from partner once messages load
  useEffect(() => {
    if (!partnerProfile?.id || partnerOnline || partnerLastSeen) return
    const lastMsg = [...messages].reverse().find((m) => m.from_user_id === partnerProfile.id)
    if (lastMsg) setPartnerLastSeen(lastMsg.created_at)
  }, [messages, partnerProfile?.id, partnerOnline])

  // Auto-scroll when new messages arrive (only after initial load is done)
  useLayoutEffect(() => {
    const el = messageListRef.current
    if (!el || messages.length === 0 || !firstLoadDone.current) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages.length])

  useEffect(() => {
    if (messages.length > 0) loadReactions(messages.map((m) => m.id))
  }, [messages.length])

  // Re-anchor to bottom after reactions load (they expand message heights and shift the viewport up)
  useEffect(() => {
    if (!firstLoadDone.current) return
    const el = messageListRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 400
    if (isNearBottom) el.scrollTop = el.scrollHeight
  }, [reactions])

  useEffect(() => {
    if (replyTo || editingId) composerRef.current?.focus()
  }, [replyTo, editingId])

  useEffect(() => {
    loadOlderRef.current = loadOlderMessages
  }, [loadingMore, hasMore, messages])

  useEffect(() => {
    const el = messageListRef.current
    if (!el) return
    const onScroll = () => {
      setScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 120)
      if (el.scrollTop < 100) loadOlderRef.current()
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

  useEffect(() => {
    if (!navigator.onLine) setConnected(false)
    const onOnline = () => setConnected(true)
    const onOffline = () => setConnected(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
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
        setPartnerLastSeen(msg.created_at)
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
    broadcastChannelRef.current = broadcastChannel

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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnected(true)
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnected(false)
      })

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
      broadcastChannelRef.current = null
      supabase.removeChannel(broadcastChannel)
      supabase.removeChannel(pgChannel)
      supabase.removeChannel(readChannel)
    }
  }, [userId, partnerProfile?.id])

  // ── Presence + last seen ─────────────────────────────────
  // last_seen is derived from partner's most recent message; updated to "now" when they leave presence

  useEffect(() => {
    if (!userId || !partnerProfile?.id) return

    const presenceChannel = supabase.channel('hrini-presence-v1')
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState<{ user_id: string }>()
        const online = Object.values(state).flat().some((p) => p.user_id === partnerProfile.id)
        setPartnerOnline(online)
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        if ((newPresences as unknown as Array<{ user_id: string }>).some((p) => p.user_id === partnerProfile.id))
          setPartnerOnline(true)
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        if ((leftPresences as unknown as Array<{ user_id: string }>).some((p) => p.user_id === partnerProfile.id)) {
          setPartnerOnline(false)
          setPartnerLastSeen(new Date().toISOString())
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ user_id: userId })
        }
      })

    return () => { supabase.removeChannel(presenceChannel) }
  }, [userId, partnerProfile?.id])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('reactions-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, (payload) => {
        const r = payload.new as MessageReaction
        setReactions((prev) => {
          const existing = prev[r.message_id] ?? []
          if (existing.some((x) => x.id === r.id)) return prev
          return { ...prev, [r.message_id]: [...existing, r] }
        })
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
    const { data } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (data) {
      const msgs = (data as MessageWithRead[]).reverse()
      msgs.forEach(m => seenMsgIds.current.add(m.id))
      setMessages(msgs)
      setHasMore(data.length === PAGE_SIZE)
      if (partnerProfile?.id && !markedRead.current) {
        markedRead.current = true
        markPartnerMessagesRead(partnerProfile.id)
      }
      // Scroll to very last message after layout settles (double-RAF ensures DOM is painted)
      requestAnimationFrame(() => requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
        firstLoadDone.current = true
      }))
    }
  }

  async function loadOlderMessages() {
    if (loadingMore || !hasMore || messages.length === 0) return
    const oldest = messages[0].created_at
    const el = messageListRef.current
    const prevScrollHeight = el?.scrollHeight ?? 0
    setLoadingMore(true)
    const { data } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .lt('created_at', oldest)
      .limit(PAGE_SIZE)
    if (data) {
      const older = (data as MessageWithRead[]).reverse()
      older.forEach(m => seenMsgIds.current.add(m.id))
      setMessages((prev) => [...older, ...prev])
      setHasMore(data.length === PAGE_SIZE)
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevScrollHeight
      })
    }
    setLoadingMore(false)
  }

  function retryMessage(msg: MessageWithRead) {
    setMessages((prev) => prev.filter((m) => m.id !== msg.id))
    send(msg.content, msg.type, msg.photo_url ?? undefined)
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
      _status: 'sending',
    }
    setMessages((prev) => [...prev, optimisticMsg])
    setReplyTo(null)

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({ from_user_id: userId, content, type, photo_url: photoUrl ?? null, reply_to_id: replyId, reply_to_content: replyContent })
      .select().single()

    if (error) {
      setMessages((prev) => prev.map((m) => m.id === optimisticId ? { ...m, _status: 'failed' as const } : m))
      setSending(false)
      return
    }

    setMessages((prev) => {
      // pgChannel may have already inserted the real message — avoid duplicate
      const alreadyReal = prev.some((m) => m.id === (inserted as MessageWithRead).id)
      if (alreadyReal) return prev.filter((m) => m.id !== optimisticId)
      return prev.map((m) => m.id === optimisticId ? { ...(inserted as MessageWithRead), _status: undefined } : m)
    })

    await broadcastChannelRef.current?.send({
      type: 'broadcast', event: 'new_message',
      payload: { ...(inserted as Message), optimistic_id: optimisticId },
    })

    if (partnerProfile?.id) {
      const titles: Record<Message['type'], string> = {
        text: `${myName} 💬`, miss_you: `${myName} misses you 💭`,
        love_quote: `${myName} sent a quote 💫`, photo: `${myName} shared a photo 📸`,
        plan: `${myName} added a plan 🗓️`,
      }
      const bodies: Record<Message['type'], string> = {
        text: content.slice(0, 80), miss_you: 'They are thinking of you right now',
        love_quote: content.slice(0, 80), photo: 'Open HRINI to see it',
        plan: (() => { try { const p = JSON.parse(content); return p.title } catch { return content } })(),
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
      broadcastChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: {} })
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
    setShowEmojiPicker(false)
    if (composerRef.current) composerRef.current.innerHTML = ''
  }

  function cancelCompose() {
    setReplyTo(null)
    setEditingId(null)
    setText('')
    setShowEmojiPicker(false)
    if (composerRef.current) composerRef.current.innerHTML = ''
  }

  async function sendMissYou() { setShowActions(false); await send('Missing you right now 💭', 'miss_you') }
  async function sendQuote() { setShowActions(false); await send(getRandomQuote(), 'love_quote') }

  async function sendPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) { setShowActions(false); return }
    setShowActions(false); setSending(true)
    const compressed = await compressImage(file)
    const path = `${userId}/${Date.now()}.jpg`
    const { data: up, error } = await supabase.storage.from('photos').upload(path, compressed)
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

  function insertEmoji(emoji: string) {
    const el = composerRef.current
    if (!el) return
    el.focus()
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).startContainer)) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const node = document.createTextNode(emoji)
      range.insertNode(node)
      range.setStartAfter(node)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      const node = document.createTextNode(emoji)
      el.appendChild(node)
      const range = document.createRange()
      range.setStartAfter(node)
      range.collapse(true)
      const sel2 = window.getSelection()
      sel2?.removeAllRanges()
      sel2?.addRange(range)
    }
    setText(el.innerText)
  }

  function HighlightedText({ text, isMe }: { text: string; isMe: boolean }) {
    const q = searchQuery.trim()
    if (!q) return <>{text}</>
    const idx = text.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return <>{text}</>
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ backgroundColor: isMe ? 'rgba(28,25,23,0.35)' : 'rgba(212,160,167,0.45)', color: 'inherit', borderRadius: '3px', padding: '0 1px' }}>
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    )
  }

  // ── Double-tap to ❤️ ─────────────────────────────────────

  function handleDoubleTap(msg: MessageWithRead) {
    const now = Date.now()
    const last = lastTapTime.current[msg.id] ?? 0
    if (now - last < 500) {
      toggleReaction(msg.id, '❤️')
      const id = now
      setFloatingHearts((prev) => [...prev, { id, x: lastTouchPos.current.x, y: lastTouchPos.current.y }])
      setTimeout(() => setFloatingHearts((prev) => prev.filter((h) => h.id !== id)), 1000)
    }
    lastTapTime.current[msg.id] = now
  }

  // ── Swipe to reply ────────────────────────────────────────

  function onTouchStart(msg: MessageWithRead, e: React.TouchEvent) {
    isTouchDevice.current = true  // suppress mouseenter-based HoverBar on iOS
    const touch = e.touches[0]
    lastTouchPos.current = { x: touch.clientX, y: touch.clientY }
    const el = e.currentTarget as HTMLElement
    const now = Date.now()
    const lastTap = lastTapTime.current[msg.id] ?? 0
    swipeState.current = {
      msgId: msg.id, startX: touch.clientX, startY: touch.clientY,
      startTime: now, el, triggered: false,
      // Suppress swipe if this might be a double-tap (within 600ms of last tap)
      noSwipe: now - lastTap < 600,
    }
    longPressTimer.current[msg.id] = setTimeout(() => {
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
    // Layer 1: double-tap suppression
    if (s.noSwipe) return
    if (dy > 14 && dy > Math.abs(dx)) { resetSwipe(msg.id); return }
    if (dx <= 0) return
    // Layer 2: higher distance threshold (30px) prevents accidental swipe on tap
    if (dx < 30) return
    // Layer 3: time threshold — a real swipe takes at least 80ms to start
    if (Date.now() - s.startTime < 80) return
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
    if (msg.from_user_id !== userId) return null
    if (msg._status === 'sending') return null
    if (!msg.read_at) return null
    return (
      <span style={{ fontSize: '0.6rem', color: dark ? '#8B6914' : 'rgba(212,160,167,0.8)', flexShrink: 0 }}>read</span>
    )
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

  function HoverBar({ msg, isMe }: { msg: MessageWithRead; isMe: boolean }) {
    if (hoveredMsgId !== msg.id) return null
    const btnStyle: React.CSSProperties = {
      width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #3D3633',
      backgroundColor: '#292524', cursor: 'pointer', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', flexShrink: 0,
    }
    return (
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
        <button style={btnStyle} onMouseDown={(e) => e.preventDefault()}
          onClick={() => { replyToMsg(msg); setHoveredMsgId(null) }} title="Reply">
          ↩
        </button>
        <button style={btnStyle} onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleReaction(msg.id, '❤️')} title="Love">
          ❤️
        </button>
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
    const isNew = !seenMsgIds.current.has(msg.id)
    if (isNew) seenMsgIds.current.add(msg.id)
    const animStyle: React.CSSProperties = isNew
      ? { animationName: isMe ? 'msg-out' : (msg.type === 'miss_you' || msg.type === 'love_quote' || msg.type === 'plan' ? 'msg-center' : 'msg-in'), animationDuration: '0.42s', animationTimingFunction: 'ease-out', animationFillMode: 'both' }
      : {}
    const sharedStyle = { touchAction: 'manipulation' as const, ...animStyle }

    const touchProps = {
      onTouchStart: (e: React.TouchEvent) => onTouchStart(msg, e),
      onTouchMove: (e: React.TouchEvent) => onTouchMove(msg, e),
      onTouchEnd: () => onTouchEnd(msg),
      onDoubleClick: () => toggleReaction(msg.id, '❤️'),
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setContextMenu(msg.id) },
      onMouseEnter: () => { if (!isTouchDevice.current) setHoveredMsgId(msg.id) },
      onMouseLeave: () => setHoveredMsgId(null),
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

    if (msg.type === 'plan') {
      let planTitle = msg.content
      let planDate: string | null = null
      let isCompleted = false
      try {
        const parsed = JSON.parse(msg.content)
        planTitle = parsed.title
        isCompleted = parsed.status === 'completed'
        if (parsed.planned_at) {
          const d = new Date(parsed.planned_at)
          const today = new Date(); today.setHours(0,0,0,0)
          const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1)
          const planDay = new Date(d); planDay.setHours(0,0,0,0)
          const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0
          const dayStr = planDay.getTime() === today.getTime() ? 'Today'
            : planDay.getTime() === tomorrow.getTime() ? 'Tomorrow'
            : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const timeStr = hasTime ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''
          planDate = timeStr ? `${dayStr} · ${timeStr}` : dayStr
        }
      } catch {}

      if (isCompleted) {
        return (
          <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el }}
            style={{ display: 'flex', justifyContent: 'center', margin: `${grouped ? '2px' : '10px'} 16px 0`, ...sharedStyle }}
            {...touchProps}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '300px' }}>
              <div style={{ width: '100%', padding: '14px 16px', borderRadius: '18px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.3rem' }}>✅</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4ade80' }}>{planTitle}</p>
                    <p style={{ fontSize: '0.68rem', color: '#86efac', marginTop: '1px' }}>Plan completed 🎉</p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px' }}>
                  <p style={{ fontSize: '0.62rem', color: '#A8A29E' }}>{isMe ? 'You' : name} · {time}</p>
                  <ReadLabel msg={msg} />
                </div>
              </div>
              <Reactions msgId={msg.id} />
            </div>
          </div>
        )
      }

      return (
        <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el }}
          style={{ display: 'flex', justifyContent: 'center', margin: `${grouped ? '2px' : '10px'} 16px 0`, ...sharedStyle }}
          {...touchProps}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '300px' }}>
            <div style={{ width: '100%', padding: '14px 16px', borderRadius: '18px', background: 'rgba(201,162,96,0.1)', border: '1px solid rgba(201,162,96,0.25)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: planDate ? '5px' : '0' }}>
                <span style={{ fontSize: '1.1rem' }}>🗓️</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#E8E0D8' }}>{planTitle}</p>
                  {planDate && <p style={{ fontSize: '0.68rem', color: '#C9A260', marginTop: '2px' }}>{planDate}</p>}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
                <p style={{ fontSize: '0.62rem', color: '#A8A29E' }}>{isMe ? 'You' : name} added a plan · {time}</p>
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
          style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: `${grouped ? '2px' : '8px'} 16px 0`, justifyContent: isMe ? 'flex-end' : 'flex-start', ...sharedStyle }}
          onTouchStart={(e) => onTouchStart(msg, e)}
          onTouchMove={(e) => onTouchMove(msg, e)}
          onTouchEnd={() => onTouchEnd(msg, () => { if (msg.photo_url) setFullscreenPhoto(msg.photo_url) })}
          onDoubleClick={() => toggleReaction(msg.id, '❤️')}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(msg.id) }}
          onMouseEnter={() => { if (!isTouchDevice.current) setHoveredMsgId(msg.id) }}
          onMouseLeave={() => setHoveredMsgId(null)}>
          {!isMe && <HoverBar msg={msg} isMe={isMe} />}
          <div style={{ maxWidth: '70%' }}>
            {msg.photo_url && (
              <div style={{ borderRadius: '18px', overflow: 'hidden', border: `2px solid ${isMe ? '#D4A0A7' : '#3D3633'}` }}>
                <img src={msg.photo_url} alt="shared photo"
                  style={{ width: '100%', maxHeight: '260px', objectFit: 'cover', display: 'block' }} />
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <p style={{ fontSize: '0.6rem', color: '#A8A29E' }}>{time}</p>
              {msg._status === 'sending' && (
                <span style={{ display: 'inline-block', width: '8px', height: '8px', border: '1.5px solid #3D3633', borderTopColor: '#A8A29E', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              )}
              <ReadLabel msg={msg} />
            </div>
            {msg._status === 'failed' && (
              <button onClick={() => retryMessage(msg)} style={{ display: 'block', fontSize: '0.62rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 2px', textAlign: isMe ? 'right' : 'left', width: '100%' }}>
                ⚠ Failed · Tap to retry
              </button>
            )}
            <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <Reactions msgId={msg.id} />
            </div>
          </div>
          {isMe && <HoverBar msg={msg} isMe={isMe} />}
        </div>
      )
    }

    // Text bubble
    const bubbleRadius = grouped
      ? (isMe ? '18px 4px 4px 18px' : '4px 18px 18px 4px')
      : (isMe ? '18px 18px 4px 18px' : '4px 18px 18px 18px')
    const tailClass = !grouped ? (isMe ? 'bubble-tail-me' : 'bubble-tail-partner') : ''

    return (
      <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el }}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: `${grouped ? '1px' : '8px'} 16px 0`, justifyContent: isMe ? 'flex-end' : 'flex-start', ...sharedStyle }}
        {...touchProps}>
        {!isMe && <HoverBar msg={msg} isMe={isMe} />}
        <div style={{ maxWidth: '78%' }}>
          <div className={tailClass} style={{
            padding: '9px 13px',
            backgroundColor: isMe ? (msg._status === 'failed' ? '#B8767D' : '#D4A0A7') : '#1f1c1a',
            color: isMe ? '#1C1917' : '#F0EBE3',
            borderRadius: bubbleRadius,
            opacity: msg._status === 'sending' ? 0.7 : 1,
            boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
          }}>
            <ReplyQuote msg={msg} isMe={isMe} />
            <p style={{ fontSize: '0.92rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}><HighlightedText text={msg.content} isMe={isMe} /></p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <p style={{ color: isMe ? 'rgba(28,25,23,0.42)' : 'rgba(255,255,255,0.3)', fontSize: '0.6rem' }}>{time}</p>
              {msg.edited_at && !msg._status && <span style={{ fontSize: '0.55rem', color: isMe ? 'rgba(28,25,23,0.3)' : 'rgba(255,255,255,0.2)' }}>edited</span>}
              {msg._status === 'sending' && (
                <span style={{ display: 'inline-block', width: '8px', height: '8px', border: `1.5px solid ${isMe ? 'rgba(28,25,23,0.2)' : '#3D3633'}`, borderTopColor: isMe ? 'rgba(28,25,23,0.6)' : '#A8A29E', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              )}
              <ReadLabel msg={msg} dark={isMe} />
            </div>
          </div>
          {msg._status === 'failed' && (
            <button onClick={() => retryMessage(msg)} style={{ display: 'block', fontSize: '0.62rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '3px 2px', textAlign: isMe ? 'right' : 'left', width: '100%' }}>
              ⚠ Failed · Tap to retry
            </button>
          )}
          <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
            <Reactions msgId={msg.id} />
          </div>
        </div>
        {isMe && <HoverBar msg={msg} isMe={isMe} />}
      </div>
    )
  }

  // ── Search filter ────────────────────────────────────────

  const displayMessages = searchQuery.trim()
    ? messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages

  // ── Context menu helpers ──────────────────────────────────

  const ctxMsg = contextMenu ? messages.find((m) => m.id === contextMenu) : null
  const isCtxMine = ctxMsg?.from_user_id === userId
  const isCtxText = ctxMsg?.type === 'text'

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="flex flex-col" style={{ height: '100dvh', backgroundColor: 'rgba(28,25,23,0.55)', position: 'relative', overflowX: 'hidden' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
        @keyframes msg-out {
          0%   { opacity:0; transform: translateX(60px) scale(0.7); }
          60%  { opacity:1; transform: translateX(-6px) scale(1.04); }
          80%  { transform: translateX(3px) scale(0.98); }
          100% { transform: translateX(0) scale(1); }
        }
        @keyframes msg-in {
          0%   { opacity:0; transform: translateX(-60px) scale(0.7); }
          60%  { opacity:1; transform: translateX(6px) scale(1.04); }
          80%  { transform: translateX(-3px) scale(0.98); }
          100% { transform: translateX(0) scale(1); }
        }
        @keyframes msg-center {
          0%   { opacity:0; transform: translateY(24px) scale(0.75); }
          60%  { opacity:1; transform: translateY(-4px) scale(1.03); }
          80%  { transform: translateY(2px) scale(0.99); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes heart-float {
          0%   { opacity: 1; transform: scale(0.5) translateY(0); }
          40%  { opacity: 1; transform: scale(1.5) translateY(-40px); }
          100% { opacity: 0; transform: scale(1.2) translateY(-90px); }
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
        .bubble-tail-me { position: relative; overflow: visible; }
        .bubble-tail-me::after {
          content: ''; position: absolute; bottom: 0; right: -7px;
          width: 14px; height: 14px; background: transparent;
          border-bottom-left-radius: 14px;
          box-shadow: -7px 4px 0 0 #D4A0A7;
        }
        .bubble-tail-partner { position: relative; overflow: visible; }
        .bubble-tail-partner::after {
          content: ''; position: absolute; bottom: 0; left: -7px;
          width: 14px; height: 14px; background: transparent;
          border-bottom-right-radius: 14px;
          box-shadow: 7px 4px 0 0 #1f1c1a;
        }
      `}</style>

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex-none flex items-center gap-3 px-4 border-b"
        style={{ backgroundColor: '#1C1917', borderColor: '#3D3633', paddingTop: 'max(env(safe-area-inset-top, 0px), 10px)', paddingBottom: '10px' }}>
        {showSearch ? (
          <>
            <div className="flex-1 flex items-center gap-2 rounded-xl border px-3" style={{ backgroundColor: '#292524', borderColor: '#3D3633', height: '38px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6A6460" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                ref={searchInputRef}
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages…"
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#F5F0E8', fontSize: '0.88rem' }}
              />
              {searchQuery && (
                <span style={{ fontSize: '0.65rem', color: '#6A6460', whiteSpace: 'nowrap' }}>
                  {displayMessages.length} found
                </span>
              )}
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: '#6A6460', cursor: 'pointer', padding: '0 2px', fontSize: '0.8rem' }}>✕</button>
              )}
            </div>
            <button onClick={() => { setShowSearch(false); setSearchQuery('') }} style={{ background: 'none', border: 'none', color: '#D4A0A7', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap', padding: '0' }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <div className="relative w-9 h-9 flex-none">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm"
                style={{ backgroundColor: '#292524', color: '#D4A0A7', border: '1.5px solid #D4A0A7' }}>
                {partnerName.charAt(0)}
              </div>
              {partnerOnline && (
                <span style={{ position: 'absolute', bottom: 0, right: 0, width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#4ade80', border: '2px solid #1C1917' }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold leading-tight truncate"
                style={{ fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)', color: '#F5F0E8', fontSize: '1rem' }}>
                {partnerName}
              </p>
              <p style={{ color: partnerOnline ? '#4ade80' : '#A8A29E', fontSize: '0.7rem' }}>
                {partnerOnline
                  ? 'Online'
                  : partnerLastSeen
                    ? `Last seen ${formatLastSeen(partnerLastSeen)}`
                    : 'your person 💕'}
              </p>
            </div>
            <button onClick={() => { setShowSearch(true); setShowEta(false); setShowActions(false) }}
              style={{ width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid #3D3633', color: '#A8A29E', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            <button onClick={() => setShowEta(!showEta)} className="flex-none px-3 py-1.5 rounded-xl text-xs font-medium border"
              style={{ borderColor: showEta ? '#C9A260' : '#3D3633', color: '#C9A260', backgroundColor: showEta ? 'rgba(201,162,96,0.12)' : 'transparent' }}>
              🏡 ETA
            </button>
          </>
        )}
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
        {loadingMore && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
            <div style={{ width: '18px', height: '18px', border: '2px solid #3D3633', borderTopColor: '#D4A0A7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}
        {!loadingMore && !hasMore && messages.length > 0 && (
          <p style={{ textAlign: 'center', fontSize: '0.65rem', color: '#3D3633', padding: '14px 0' }}>beginning of your conversation 💕</p>
        )}
        {!connected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 16px', padding: '9px 14px', borderRadius: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#ef4444', flexShrink: 0, animation: 'pulse 1.5s ease infinite' }} />
            <p style={{ fontSize: '0.72rem', color: '#fca5a5' }}>Reconnecting — messages will send when back online</p>
          </div>
        )}
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
        {displayMessages.map((msg, idx, arr) => renderMessage(msg, idx, arr))}
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
        <div className="fixed inset-0 z-[100]" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onClick={closeContextMenu}>
          <div
            className="fixed bottom-0 left-0 right-0"
            style={{
              backgroundColor: '#1a1613',
              borderTop: '1px solid #3D3633',
              borderRadius: '24px 24px 0 0',
              padding: '0 16px',
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
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
              { icon: '🗑️', label: 'Unsend', onClick: () => deleteMessage(contextMenu!), show: isCtxMine, danger: true },
            ].filter((a) => a.show).map((a, i, arr) => (
              <button key={a.label} onClick={a.onClick}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px', width: '100%',
                  padding: '13px 8px', borderRadius: '12px', fontSize: '0.9rem',
                  color: (a as any).danger ? '#ef4444' : '#E8E0D8',
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  borderTop: (a as any).danger && i > 0 ? '1px solid #2E2822' : 'none',
                  marginTop: (a as any).danger && i > 0 ? '4px' : '0',
                }}>
                <span style={{ fontSize: '1.1rem', width: '24px', textAlign: 'center' }}>{a.icon}</span>
                {a.label}
              </button>
            ))}

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

      {/* ── Emoji Picker ───────────────────────────────────── */}
      {showEmojiPicker && (
        <div className="flex-none border-t" style={{ backgroundColor: '#1a1613', borderColor: '#3D3633', padding: '10px 12px 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
            {EMOJI_PICKER_LIST.map((emoji) => (
              <button
                key={emoji}
                onMouseDown={(e) => { e.preventDefault(); insertEmoji(emoji) }}
                onTouchEnd={(e) => { e.preventDefault(); insertEmoji(emoji) }}
                style={{ fontSize: '1.4rem', padding: '6px', borderRadius: '10px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Floating hearts ───────────────────────────────── */}
      {floatingHearts.map((h) => (
        <div key={h.id} style={{
          position: 'fixed', left: h.x - 16, top: h.y - 16,
          width: '32px', height: '32px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.8rem', pointerEvents: 'none', zIndex: 99,
          animation: 'heart-float 0.9s ease-out forwards',
        }}>❤️</div>
      ))}

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
            if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); sendOrUpdate() }
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
        <button
          onMouseDown={(e) => { e.preventDefault(); setShowEmojiPicker((v) => !v) }}
          className="w-10 h-10 flex-none rounded-full flex items-center justify-center text-lg"
          style={{
            backgroundColor: showEmojiPicker ? 'rgba(212,160,167,0.15)' : '#292524',
            border: `1.5px solid ${showEmojiPicker ? '#D4A0A7' : '#3D3633'}`,
            cursor: 'pointer',
          }}>
          😊
        </button>
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
