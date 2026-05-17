// Run in Supabase SQL Editor (if not done):
// ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

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

interface EmojiPickerState {
  messageId: string
  x: number
  y: number
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
  const [emojiPicker, setEmojiPicker] = useState<EmojiPickerState | null>(null)
  const [partnerTyping, setPartnerTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const markedRead = useRef(false)
  const longPressTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSent = useRef(0)

  const partnerName = partnerProfile?.name || 'Rajreeni'
  const myName = profile?.name || 'Hriday'

  useEffect(() => {
    if (!userId) return
    loadMessages()
  }, [userId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
  }, [messages.length])

  useEffect(() => {
    if (messages.length === 0) return
    loadReactions(messages.map((m) => m.id))
  }, [messages.length])

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
          return [...filtered, msg].sort((a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )
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
      .channel('messages-pg-fallback')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as MessageWithRead
        if (seenIds.has(msg.id)) return
        seenIds.add(msg.id)
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== msg.id)
          return [...filtered, msg].sort((a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          )
        })
      })
      .subscribe()

    // When partner reads our messages, update local read_at
    const readChannel = supabase
      .channel('messages-read-receipts')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `from_user_id=eq.${userId}`,
      }, (payload) => {
        const updated = payload.new as MessageWithRead
        if (updated.read_at) {
          setMessages((prev) =>
            prev.map((m) => m.id === updated.id ? { ...m, read_at: updated.read_at } : m)
          )
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
        setReactions((prev) => ({
          ...prev,
          [r.message_id]: [...(prev[r.message_id] ?? []), r],
        }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, (payload) => {
        const r = payload.old as MessageReaction
        setReactions((prev) => ({
          ...prev,
          [r.message_id]: (prev[r.message_id] ?? []).filter((x) => x.id !== r.id),
        }))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  async function markPartnerMessagesRead(partnerId: string) {
    if (!userId) return
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('from_user_id', partnerId)
      .is('read_at', null)
    setMessages((prev) =>
      prev.map((m) =>
        m.from_user_id === partnerId && !m.read_at
          ? { ...m, read_at: new Date().toISOString() }
          : m
      )
    )
  }

  async function loadMessages() {
    if (!userId) return
    const { data } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(100)
    if (data) {
      setMessages(data as MessageWithRead[])
      if (partnerProfile?.id && !markedRead.current) {
        markedRead.current = true
        markPartnerMessagesRead(partnerProfile.id)
      }
    }
  }

  async function loadReactions(messageIds: string[]) {
    if (messageIds.length === 0) return
    const { data } = await supabase
      .from('message_reactions')
      .select('*')
      .in('message_id', messageIds)
    if (!data) return
    const map: ReactionsMap = {}
    for (const r of data as MessageReaction[]) {
      if (!map[r.message_id]) map[r.message_id] = []
      map[r.message_id].push(r)
    }
    setReactions(map)
  }

  async function send(content: string, type: Message['type'], photoUrl?: string) {
    if (!userId) return
    setSending(true)

    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMsg: MessageWithRead = {
      id: optimisticId,
      from_user_id: userId,
      content,
      type,
      photo_url: photoUrl ?? null,
      created_at: new Date().toISOString(),
      read_at: null,
    }
    setMessages((prev) => [...prev, optimisticMsg])

    const { data: inserted, error: insertErr } = await supabase
      .from('messages')
      .insert({ from_user_id: userId, content, type, photo_url: photoUrl ?? null })
      .select()
      .single()

    if (insertErr) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      setSending(false)
      return
    }

    setMessages((prev) => prev.map((m) => m.id === optimisticId ? inserted as MessageWithRead : m))

    await supabase.channel('hrini-messages-broadcast').send({
      type: 'broadcast',
      event: 'new_message',
      payload: { ...(inserted as Message), optimistic_id: optimisticId },
    })

    if (partnerProfile?.id) {
      const titles: Record<Message['type'], string> = {
        text: `${myName} 💬`,
        miss_you: `${myName} misses you 💭`,
        love_quote: `${myName} sent a quote 💫`,
        photo: `${myName} shared a photo 📸`,
      }
      const bodies: Record<Message['type'], string> = {
        text: content.slice(0, 80),
        miss_you: 'They are thinking of you right now',
        love_quote: content.slice(0, 80),
        photo: 'Open HRINI to see it',
      }
      notifyPartner(partnerProfile.id, titles[type], bodies[type], '/messages')
    }
    setSending(false)
  }

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    setText(e.target.value)
    const now = Date.now()
    if (now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now
      supabase.channel('hrini-messages-broadcast').send({
        type: 'broadcast',
        event: 'typing',
        payload: {},
      })
    }
  }

  async function sendText() {
    if (!text.trim()) return
    await send(text.trim(), 'text')
    setText('')
  }

  async function sendMissYou() {
    setShowActions(false)
    await send('Missing you right now 💭', 'miss_you')
  }

  async function sendQuote() {
    setShowActions(false)
    await send(getRandomQuote(), 'love_quote')
  }

  async function sendPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setShowActions(false)
    const path = `${userId}/${Date.now()}.${file.name.split('.').pop()}`
    const { data: up, error } = await supabase.storage.from('photos').upload(path, file)
    if (!error && up) {
      const { data: url } = supabase.storage.from('photos').getPublicUrl(up.path)
      await send('📸 Photo', 'photo', url.publicUrl)
    }
    e.target.value = ''
  }

  async function saveEta() {
    if (!eta || !userId) return
    await supabase.from('profiles').update({ coming_home_time: eta }).eq('id', userId)
    await send(`🏡 Coming home at ${eta}`, 'text')
    setShowEta(false)
    setEta('')
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!userId) return
    setEmojiPicker(null)

    const existing = (reactions[messageId] ?? []).find(
      (r) => r.user_id === userId && r.emoji === emoji
    )

    if (existing) {
      await supabase.from('message_reactions').delete().eq('id', existing.id)
      setReactions((prev) => ({
        ...prev,
        [messageId]: (prev[messageId] ?? []).filter((r) => r.id !== existing.id),
      }))
    } else {
      const { data } = await supabase
        .from('message_reactions')
        .insert({ message_id: messageId, user_id: userId, emoji })
        .select()
        .single()
      if (data) {
        setReactions((prev) => ({
          ...prev,
          [messageId]: [...(prev[messageId] ?? []), data as MessageReaction],
        }))
      }
    }
  }

  function startLongPress(messageId: string, e: React.TouchEvent | React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    longPressTimers.current[messageId] = setTimeout(() => {
      setEmojiPicker({ messageId, x: rect.left, y: rect.top })
    }, 500)
  }

  function cancelLongPress(messageId: string) {
    if (longPressTimers.current[messageId]) {
      clearTimeout(longPressTimers.current[messageId])
      delete longPressTimers.current[messageId]
    }
  }

  const handleOverlayTap = useCallback(() => setEmojiPicker(null), [])

  function ReadLabel({ msg, dark }: { msg: MessageWithRead; dark?: boolean }) {
    if (msg.from_user_id !== userId || !msg.read_at) return null
    return (
      <span
        style={{
          fontSize: '0.6rem',
          color: dark ? 'rgba(28,25,23,0.55)' : '#D4A0A7',
          fontWeight: 500,
        }}
      >
        read
      </span>
    )
  }

  function renderReactions(msgId: string) {
    const msgReactions = reactions[msgId] ?? []
    if (msgReactions.length === 0) return null

    const grouped: Record<string, { count: number; mine: boolean }> = {}
    for (const r of msgReactions) {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, mine: false }
      grouped[r.emoji].count++
      if (r.user_id === userId) grouped[r.emoji].mine = true
    }

    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {Object.entries(grouped).map(([emoji, { count, mine }]) => (
          <button
            key={emoji}
            onClick={() => toggleReaction(msgId, emoji)}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-all"
            style={{
              backgroundColor: mine ? 'rgba(212,160,167,0.2)' : 'rgba(61,54,51,0.6)',
              border: `1px solid ${mine ? '#D4A0A7' : '#3D3633'}`,
              color: '#F5F0E8',
            }}
          >
            <span>{emoji}</span>
            <span style={{ color: '#A8A29E', fontSize: '0.6rem' }}>{count}</span>
          </button>
        ))}
      </div>
    )
  }

  function renderMessage(msg: MessageWithRead) {
    const isMe = msg.from_user_id === userId
    const name = isMe ? myName : partnerName
    const time = formatRelativeTime(msg.created_at)

    const longPressProps = {
      onTouchStart: (e: React.TouchEvent) => startLongPress(msg.id, e),
      onTouchEnd: () => cancelLongPress(msg.id),
      onTouchMove: () => cancelLongPress(msg.id),
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault()
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setEmojiPicker({ messageId: msg.id, x: rect.left, y: rect.top })
      },
    }

    if (msg.type === 'miss_you') {
      return (
        <div key={msg.id} className="flex justify-center my-3">
          <div className="flex flex-col items-center">
            <div
              className="px-5 py-3 rounded-2xl text-center max-w-xs cursor-pointer"
              style={{ background: 'rgba(212,160,167,0.15)', border: '1px solid rgba(212,160,167,0.3)' }}
              {...longPressProps}
            >
              <p className="text-2xl mb-1">💭</p>
              <p className="text-sm font-medium" style={{ color: '#D4A0A7' }}>
                {isMe ? 'You sent a miss you' : `${name} misses you 💕`}
              </p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <p className="text-xs" style={{ color: '#A8A29E' }}>{time}</p>
                <ReadLabel msg={msg} />
              </div>
            </div>
            <div className="mt-1 px-2">{renderReactions(msg.id)}</div>
          </div>
        </div>
      )
    }

    if (msg.type === 'love_quote') {
      return (
        <div key={msg.id} className="flex justify-center my-3 px-4">
          <div className="flex flex-col items-center w-full max-w-sm">
            <div
              className="w-full px-5 py-4 rounded-2xl text-center cursor-pointer"
              style={{ background: 'rgba(201,162,96,0.12)', border: '1px solid rgba(201,162,96,0.25)' }}
              {...longPressProps}
            >
              <p className="text-lg mb-2">💫</p>
              <p
                className="text-base italic leading-relaxed"
                style={{
                  fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
                  color: '#C9A260',
                  fontSize: '1.1rem',
                }}
              >
                &ldquo;{msg.content}&rdquo;
              </p>
              <div className="flex items-center justify-center gap-1 mt-2">
                <p className="text-xs" style={{ color: '#A8A29E' }}>from {name} · {time}</p>
                <ReadLabel msg={msg} />
              </div>
            </div>
            <div className="mt-1 px-2">{renderReactions(msg.id)}</div>
          </div>
        </div>
      )
    }

    if (msg.type === 'photo') {
      return (
        <div key={msg.id} className={`flex my-2 px-4 ${isMe ? 'justify-end' : 'justify-start'}`}>
          <div className="max-w-[70%]">
            {msg.photo_url && (
              <div className="cursor-pointer" {...longPressProps}>
                <img
                  src={msg.photo_url}
                  alt="shared photo"
                  className="rounded-2xl w-full object-cover"
                  style={{ maxHeight: '280px', border: `2px solid ${isMe ? '#D4A0A7' : '#3D3633'}` }}
                />
              </div>
            )}
            <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
              <p className="text-xs" style={{ color: '#A8A29E' }}>{time}</p>
              <ReadLabel msg={msg} />
            </div>
            <div className={isMe ? 'flex justify-end' : ''}>{renderReactions(msg.id)}</div>
          </div>
        </div>
      )
    }

    // text bubble
    return (
      <div key={msg.id} className={`flex my-1 px-4 ${isMe ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[75%]">
          <div
            className="px-4 py-2.5 rounded-2xl cursor-pointer"
            style={{
              backgroundColor: isMe ? '#D4A0A7' : '#292524',
              color: isMe ? '#1C1917' : '#F5F0E8',
              borderBottomRightRadius: isMe ? '4px' : '16px',
              borderBottomLeftRadius: isMe ? '16px' : '4px',
            }}
            {...longPressProps}
          >
            <p className="text-sm leading-relaxed">{msg.content}</p>
            <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
              <p
                style={{
                  color: isMe ? 'rgba(28,25,23,0.5)' : '#A8A29E',
                  fontSize: '0.6rem',
                }}
              >
                {time}
              </p>
              <ReadLabel msg={msg} dark={isMe} />
            </div>
          </div>
          <div className={isMe ? 'flex justify-end mt-1' : 'mt-1'}>{renderReactions(msg.id)}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col"
      style={{ height: '100dvh', backgroundColor: '#1C1917' }}
    >
      <style>{`
        @keyframes typing-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
        .typing-dot {
          display: inline-block;
          width: 7px; height: 7px;
          border-radius: 50%;
          background: #A8A29E;
          animation: typing-bounce 1.2s ease-in-out infinite;
        }
        .typing-dot:nth-child(2) { animation-delay: 0.18s; }
        .typing-dot:nth-child(3) { animation-delay: 0.36s; }
      `}</style>
      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        className="flex-none flex items-center gap-3 px-4 border-b"
        style={{
          backgroundColor: '#1C1917',
          borderColor: '#3D3633',
          paddingTop: 'max(env(safe-area-inset-top, 0px), 10px)',
          paddingBottom: '10px',
        }}
      >
        <div
          className="w-9 h-9 flex-none rounded-full flex items-center justify-center font-semibold text-sm"
          style={{ backgroundColor: '#292524', color: '#D4A0A7', border: '1.5px solid #D4A0A7' }}
        >
          {partnerName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="font-bold leading-tight truncate"
            style={{
              fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
              color: '#F5F0E8',
              fontSize: '1rem',
            }}
          >
            {partnerName}
          </p>
          <p className="leading-none mt-0.5" style={{ color: '#A8A29E', fontSize: '0.7rem' }}>
            your person 💕
          </p>
        </div>
        <button
          onClick={() => setShowEta(!showEta)}
          className="flex-none px-3 py-1.5 rounded-xl text-xs font-medium border"
          style={{
            borderColor: showEta ? '#C9A260' : '#3D3633',
            color: '#C9A260',
            backgroundColor: showEta ? 'rgba(201,162,96,0.12)' : 'transparent',
          }}
        >
          🏡 ETA
        </button>
      </header>

      {/* ── ETA picker ─────────────────────────────────────────── */}
      {showEta && (
        <div
          className="flex-none flex gap-2 px-4 py-3 border-b"
          style={{ backgroundColor: '#292524', borderColor: '#3D3633' }}
        >
          <input
            type="time"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: '#1C1917', borderColor: '#3D3633', color: '#F5F0E8' }}
          />
          <button
            onClick={saveEta}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: '#C9A260', color: '#1C1917' }}
          >
            Share
          </button>
        </div>
      )}

      {/* ── Messages ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-8">
            <p className="text-4xl">💌</p>
            <p
              className="text-center text-lg"
              style={{
                fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
                color: '#F5F0E8',
              }}
            >
              Start your conversation
            </p>
            <p className="text-center text-sm" style={{ color: '#A8A29E' }}>
              Send a note, a miss you, a photo, or a love quote
            </p>
          </div>
        )}
        {messages.map(renderMessage)}
        {partnerTyping && (
          <div className="flex px-4 my-1">
            <div
              className="px-4 py-3 rounded-2xl flex items-center gap-1"
              style={{ backgroundColor: '#292524', borderBottomLeftRadius: '4px' }}
            >
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Emoji Picker ───────────────────────────────────────── */}
      {emojiPicker && (
        <div className="fixed inset-0 z-50" onClick={handleOverlayTap}>
          <div
            className="absolute flex gap-1 p-2 rounded-2xl shadow-xl"
            style={{
              backgroundColor: '#292524',
              border: '1px solid #3D3633',
              top: Math.max(8, emojiPicker.y - 64),
              left: Math.max(8, Math.min(emojiPicker.x, window.innerWidth - 220)),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {REACTION_EMOJIS.map((emoji) => {
              const isMine = (reactions[emojiPicker.messageId] ?? []).some(
                (r) => r.user_id === userId && r.emoji === emoji
              )
              return (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(emojiPicker.messageId, emoji)}
                  className="w-9 h-9 flex items-center justify-center rounded-xl text-xl transition-all"
                  style={{
                    backgroundColor: isMine ? 'rgba(212,160,167,0.2)' : 'transparent',
                    border: isMine ? '1px solid #D4A0A7' : '1px solid transparent',
                  }}
                >
                  {emoji}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Quick actions strip (collapsible) ──────────────────── */}
      {showActions && (
        <div
          className="flex-none flex gap-2 px-3 py-2 border-t"
          style={{ backgroundColor: '#1C1917', borderColor: '#3D3633' }}
        >
          <button
            onClick={sendMissYou}
            disabled={sending}
            className="flex-1 py-2.5 rounded-xl text-xs font-medium border transition-opacity disabled:opacity-50"
            style={{ borderColor: '#D4A0A7', color: '#D4A0A7', backgroundColor: 'rgba(212,160,167,0.08)' }}
          >
            💭 Miss You
          </button>
          <button
            onClick={sendQuote}
            disabled={sending}
            className="flex-1 py-2.5 rounded-xl text-xs font-medium border transition-opacity disabled:opacity-50"
            style={{ borderColor: '#C9A260', color: '#C9A260', backgroundColor: 'rgba(201,162,96,0.08)' }}
          >
            💫 Quote
          </button>
          <button
            onClick={() => { setShowActions(false); fileRef.current?.click() }}
            disabled={sending}
            className="flex-1 py-2.5 rounded-xl text-xs font-medium border transition-opacity disabled:opacity-50"
            style={{ borderColor: '#A8A29E', color: '#A8A29E', backgroundColor: 'rgba(168,162,158,0.08)' }}
          >
            📸 Photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={sendPhoto} />
        </div>
      )}

      {/* ── Composer ───────────────────────────────────────────── */}
      <div
        className="flex-none flex items-center gap-2 px-3 pt-3 border-t"
        style={{
          backgroundColor: '#1C1917',
          borderColor: '#3D3633',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 88px)',
        }}
      >
        {/* + / × toggle */}
        <button
          onClick={() => setShowActions(!showActions)}
          disabled={sending}
          className="w-10 h-10 flex-none rounded-full flex items-center justify-center text-lg font-light transition-all disabled:opacity-40"
          style={{
            backgroundColor: showActions ? 'rgba(212,160,167,0.15)' : '#292524',
            border: `1.5px solid ${showActions ? '#D4A0A7' : '#3D3633'}`,
            color: showActions ? '#D4A0A7' : '#A8A29E',
          }}
        >
          {showActions ? '✕' : '+'}
        </button>

        {/* Text input */}
        <input
          type="text"
          placeholder="Say something sweet…"
          value={text}
          onChange={handleTextChange}
          onKeyDown={(e) => e.key === 'Enter' && sendText()}
          className="flex-1 rounded-2xl border px-4 py-2.5 text-sm outline-none"
          style={{
            backgroundColor: '#292524',
            borderColor: '#3D3633',
            color: '#F5F0E8',
            minHeight: '44px',
          }}
        />

        {/* Send */}
        <button
          onClick={sendText}
          disabled={sending || !text.trim()}
          className="w-10 h-10 flex-none rounded-full flex items-center justify-center transition-opacity disabled:opacity-40"
          style={{ backgroundColor: '#D4A0A7', color: '#1C1917' }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
