'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { formatRelativeTime } from '@/lib/utils'
import type { BucketItem } from '@/types'

export default function BucketListPage() {
  const supabase = createClient()
  const [items, setItems] = useState<BucketItem[]>([])
  const [completed, setCompleted] = useState<BucketItem[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [adding, setAdding] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Record<string, string>>({})

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data } = await supabase
        .from('bucket_list')
        .select('*')
        .order('created_at', { ascending: false })

      if (data) {
        setItems((data as BucketItem[]).filter((i) => !i.completed))
        setCompleted((data as BucketItem[]).filter((i) => i.completed))
      }

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

  async function addItem() {
    if (!title.trim() || !userId) return
    setAdding(true)
    const { data } = await supabase
      .from('bucket_list')
      .insert({
        created_by: userId,
        title: title.trim(),
        description: description.trim() || null,
        completed: false,
      })
      .select()
      .single()

    if (data) {
      setItems((prev) => [data as BucketItem, ...prev])
    }
    setTitle('')
    setDescription('')
    setShowForm(false)
    setAdding(false)
    showToast('Dream added ✨')
  }

  async function markDone(id: string) {
    const now = new Date().toISOString()
    await supabase
      .from('bucket_list')
      .update({ completed: true, completed_at: now })
      .eq('id', id)

    const item = items.find((i) => i.id === id)
    if (item) {
      setItems((prev) => prev.filter((i) => i.id !== id))
      setCompleted((prev) => [{ ...item, completed: true, completed_at: now }, ...prev])
    }
    showToast('Memory made! 🎉')
  }

  async function deleteItem(id: string, createdBy: string) {
    if (createdBy !== userId) {
      showToast('Only the creator can delete this')
      return
    }
    await supabase.from('bucket_list').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
    setCompleted((prev) => prev.filter((i) => i.id !== id))
    showToast('Removed from list')
  }

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: 'rgba(28,25,23,0.55)' }}>
      {/* Header */}
      <header className="px-4 pt-6 pb-4 flex items-start justify-between">
        <div>
          <h1
            className="text-3xl font-bold"
            style={{
              fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
              color: '#F5F0E8',
            }}
          >
            Our Dreams 🗺️
          </h1>
          <p
            className="mt-1 text-lg"
            style={{
              fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
              color: '#D4A0A7',
            }}
          >
            Adventures waiting to be lived
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="mt-1 w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold"
          style={{ backgroundColor: '#D4A0A7', color: '#1C1917' }}
        >
          +
        </button>
      </header>

      <div className="px-4 space-y-5">
        {/* Add form */}
        {showForm && (
          <div
            className="rounded-2xl p-5 border animate-fade-in"
            style={{ backgroundColor: '#292524', borderColor: '#C9A260' }}
          >
            <h3
              className="text-lg font-bold mb-4"
              style={{
                fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
                color: '#F5F0E8',
              }}
            >
              Add a dream ✨
            </h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="What do you want to do together?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addItem()}
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
                style={{
                  backgroundColor: '#1C1917',
                  borderColor: '#3D3633',
                  color: '#F5F0E8',
                }}
              />
              <textarea
                placeholder="Tell me more (optional)…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none"
                style={{
                  backgroundColor: '#1C1917',
                  borderColor: '#3D3633',
                  color: '#F5F0E8',
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={addItem}
                  disabled={!title.trim() || adding}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
                  style={{ backgroundColor: '#D4A0A7', color: '#1C1917' }}
                >
                  {adding ? 'Adding…' : 'Add to Our List ✨'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-3 rounded-xl text-sm border"
                  style={{ borderColor: '#3D3633', color: '#A8A29E' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active dreams */}
        {items.length > 0 && (
          <div>
            <h2
              className="text-base font-bold mb-3"
              style={{ color: '#A8A29E', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.75rem' }}
            >
              Dreams to Chase ({items.length})
            </h2>
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl p-4 border"
                  style={{ backgroundColor: '#292524', borderColor: '#3D3633' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold" style={{ color: '#F5F0E8' }}>{item.title}</p>
                      {item.description && (
                        <p className="text-sm mt-1" style={{ color: '#A8A29E' }}>{item.description}</p>
                      )}
                      <p className="text-xs mt-2" style={{ color: '#A8A29E' }}>
                        Added by {profiles[item.created_by] ?? 'someone'} · {formatRelativeTime(item.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => markDone(item.id)}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold border"
                      style={{ borderColor: '#86EFAC', color: '#86EFAC' }}
                    >
                      Mark Done 🎉
                    </button>
                    {item.created_by === userId && (
                      <button
                        onClick={() => deleteItem(item.id, item.created_by)}
                        className="px-4 py-2 rounded-xl text-sm border"
                        style={{ borderColor: '#3D3633', color: '#A8A29E' }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed dreams */}
        {completed.length > 0 && (
          <div>
            <h2
              className="text-base font-bold mb-3"
              style={{ color: '#A8A29E', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.75rem' }}
            >
              Memories We Made 💕 ({completed.length})
            </h2>
            <div className="space-y-3">
              {completed.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl p-4 border"
                  style={{
                    backgroundColor: '#292524',
                    borderColor: '#3D3633',
                    opacity: 0.8,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5"
                      style={{ backgroundColor: 'rgba(212,160,167,0.2)', color: '#D4A0A7' }}
                    >
                      ✓
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-semibold line-through"
                        style={{ color: '#A8A29E', textDecorationColor: '#D4A0A7' }}
                      >
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-sm mt-1 line-through" style={{ color: '#6B6560' }}>
                          {item.description}
                        </p>
                      )}
                      {item.completed_at && (
                        <p className="text-xs mt-1" style={{ color: '#D4A0A7' }}>
                          Completed {formatRelativeTime(item.completed_at)} 🎉
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-8" style={{ color: '#A8A29E' }}>Loading…</div>
        )}

        {!loading && items.length === 0 && completed.length === 0 && (
          <div className="text-center py-12">
            <p className="text-5xl mb-4">🗺️</p>
            <p
              className="text-xl"
              style={{
                fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
                color: '#A8A29E',
              }}
            >
              Your adventures await. Add your first dream!
            </p>
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
