'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { LoveLanguage, LoveLanguageEntry } from '@/types'

const LOVE_LANGUAGES: { value: LoveLanguage; icon: string; label: string; description: string }[] = [
  { value: 'words', icon: '💬', label: 'Words of Affirmation', description: 'Expressions of love through words' },
  { value: 'acts', icon: '🤝', label: 'Acts of Service', description: 'Showing love through helpful actions' },
  { value: 'gifts', icon: '🎁', label: 'Gifts', description: 'Thoughtful gestures and surprises' },
  { value: 'time', icon: '⏰', label: 'Quality Time', description: 'Undivided attention and presence' },
  { value: 'touch', icon: '🤗', label: 'Physical Touch', description: 'Connection through gentle touch' },
]

function getWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now.setDate(diff))
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString()
}

export default function LoveLanguagePage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [partnerId, setPartnerId] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState('Rajreeni')
  const [myName, setMyName] = useState('Hriday')
  const [myCounts, setMyCounts] = useState<Record<LoveLanguage, number>>({ words: 0, acts: 0, gifts: 0, time: 0, touch: 0 })
  const [partnerCounts, setPartnerCounts] = useState<Record<LoveLanguage, number>>({ words: 0, acts: 0, gifts: 0, time: 0, touch: 0 })
  const [loading, setLoading] = useState(true)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [selectedLang, setSelectedLang] = useState<LoveLanguage | null>(null)
  const [logNote, setLogNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const weekStart = getWeekStart()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: myProf } = await supabase.from('profiles').select('name, partner_id').eq('id', user.id).single()
      if (myProf?.name) setMyName(myProf.name)
      let pid: string | null = null
      if (myProf?.partner_id) {
        pid = myProf.partner_id
        setPartnerId(pid)
        const { data: partnerProf } = await supabase.from('profiles').select('name').eq('id', pid).single()
        if (partnerProf?.name) setPartnerName(partnerProf.name)
      }

      // This week's logs
      const { data: logs } = await supabase
        .from('love_language_log')
        .select('*')
        .gte('created_at', weekStart)

      if (logs) {
        const myC: Record<LoveLanguage, number> = { words: 0, acts: 0, gifts: 0, time: 0, touch: 0 }
        const partnerC: Record<LoveLanguage, number> = { words: 0, acts: 0, gifts: 0, time: 0, touch: 0 }
        ;(logs as LoveLanguageEntry[]).forEach((entry) => {
          if (entry.user_id === user.id && entry.type in myC) {
            myC[entry.type]++
          } else if (entry.user_id === pid && entry.type in partnerC) {
            partnerC[entry.type]++
          }
        })
        setMyCounts(myC)
        setPartnerCounts(partnerC)
      }

      setLoading(false)
    }
    load()
  }, [])

  function openModal(lang: LoveLanguage) {
    setSelectedLang(lang)
    setLogNote('')
    setShowModal(true)
  }

  async function logLoveLanguage() {
    if (!selectedLang || !userId) return
    setSaving(true)
    await supabase.from('love_language_log').insert({
      user_id: userId,
      type: selectedLang,
      note: logNote.trim() || null,
    })
    setMyCounts((prev) => ({ ...prev, [selectedLang]: prev[selectedLang] + 1 }))
    setShowModal(false)
    setSaving(false)
    showToast('Love expressed 💕')
  }

  const maxCount = Math.max(1, ...Object.values(myCounts), ...Object.values(partnerCounts))

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'rgba(28,25,23,0.55)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)' }}>
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <h1
          className="text-3xl font-bold"
          style={{
            fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
            color: '#F5F0E8',
          }}
        >
          Love Log
        </h1>
        <p
          className="mt-1 text-lg"
          style={{
            fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
            color: '#D4A0A7',
          }}
        >
          How we speak love this week
        </p>
      </header>

      <div className="px-4 space-y-4">
        {/* Love language cards */}
        {LOVE_LANGUAGES.map((lang) => (
          <button
            key={lang.value}
            onClick={() => openModal(lang.value)}
            className="w-full text-left rounded-2xl p-4 border transition-colors"
            style={{ backgroundColor: '#292524', borderColor: '#3D3633' }}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">{lang.icon}</span>
              <div className="flex-1">
                <p className="font-semibold text-sm" style={{ color: '#F5F0E8' }}>{lang.label}</p>
                <p className="text-xs" style={{ color: '#A8A29E' }}>{lang.description}</p>
              </div>
              <div
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: 'rgba(212,160,167,0.15)', color: '#D4A0A7' }}
              >
                Log it
              </div>
            </div>

            {/* Bar visualization */}
            <div className="space-y-1.5">
              {/* My bar */}
              <div className="flex items-center gap-2">
                <span className="text-xs w-12 text-right shrink-0" style={{ color: '#D4A0A7' }}>
                  {myName.split(' ')[0]}
                </span>
                <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: '#1C1917' }}>
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${(myCounts[lang.value] / maxCount) * 100}%`,
                      minWidth: myCounts[lang.value] > 0 ? '8px' : '0',
                      backgroundColor: '#D4A0A7',
                    }}
                  />
                </div>
                <span className="text-xs w-4 shrink-0" style={{ color: '#D4A0A7' }}>
                  {myCounts[lang.value]}
                </span>
              </div>

              {/* Partner bar */}
              <div className="flex items-center gap-2">
                <span className="text-xs w-12 text-right shrink-0" style={{ color: '#C9A260' }}>
                  {partnerName.split(' ')[0]}
                </span>
                <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: '#1C1917' }}>
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${(partnerCounts[lang.value] / maxCount) * 100}%`,
                      minWidth: partnerCounts[lang.value] > 0 ? '8px' : '0',
                      backgroundColor: '#C9A260',
                    }}
                  />
                </div>
                <span className="text-xs w-4 shrink-0" style={{ color: '#C9A260' }}>
                  {partnerCounts[lang.value]}
                </span>
              </div>
            </div>
          </button>
        ))}

        {/* Weekly summary */}
        <div
          className="rounded-2xl p-5 border"
          style={{ backgroundColor: '#292524', borderColor: '#3D3633' }}
        >
          <h2
            className="text-lg font-bold mb-4"
            style={{
              fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
              color: '#F5F0E8',
            }}
          >
            This Week&apos;s Summary
          </h2>

          {/* Find most expressed */}
          {(() => {
            const total = LOVE_LANGUAGES.map((l) => ({
              ...l,
              count: myCounts[l.value] + partnerCounts[l.value],
            })).sort((a, b) => b.count - a.count)

            const topLang = total[0]
            const totalExpressions = total.reduce((s, l) => s + l.count, 0)

            return (
              <div className="space-y-3">
                {totalExpressions > 0 ? (
                  <>
                    <div
                      className="p-4 rounded-xl"
                      style={{ backgroundColor: 'rgba(212,160,167,0.1)' }}
                    >
                      <p className="text-sm" style={{ color: '#A8A29E' }}>Most expressed this week</p>
                      <p className="text-xl font-semibold mt-1" style={{ color: '#D4A0A7' }}>
                        {topLang.icon} {topLang.label}
                      </p>
                    </div>
                    <p className="text-sm text-center" style={{ color: '#A8A29E' }}>
                      {totalExpressions} total expressions of love this week 💕
                    </p>
                  </>
                ) : (
                  <p
                    className="text-center text-base"
                    style={{
                      fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
                      color: '#A8A29E',
                    }}
                  >
                    Start logging to see your love patterns 💕
                  </p>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Log Modal */}
      {showModal && selectedLang && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div
            className="w-full max-w-lg rounded-t-3xl p-6"
            style={{ backgroundColor: '#292524', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)', maxHeight: '90dvh', overflowY: 'auto' }}
          >
            <div className="w-10 h-1 rounded-full mx-auto mb-6" style={{ backgroundColor: '#3D3633' }} />
            {(() => {
              const lang = LOVE_LANGUAGES.find((l) => l.value === selectedLang)!
              return (
                <>
                  <div className="text-center mb-5">
                    <span className="text-4xl">{lang.icon}</span>
                    <h3
                      className="text-xl font-bold mt-2"
                      style={{
                        fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
                        color: '#F5F0E8',
                      }}
                    >
                      {lang.label}
                    </h3>
                  </div>
                  <p className="text-sm mb-3" style={{ color: '#A8A29E' }}>What did you do? (optional)</p>
                  <textarea
                    placeholder={`Describe how you expressed ${lang.label.toLowerCase()}…`}
                    value={logNote}
                    onChange={(e) => setLogNote(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none mb-4"
                    style={{
                      backgroundColor: '#1C1917',
                      borderColor: '#3D3633',
                      color: '#F5F0E8',
                    }}
                  />
                  <button
                    onClick={logLoveLanguage}
                    disabled={saving}
                    className="w-full py-3 rounded-xl font-semibold text-base disabled:opacity-50"
                    style={{ backgroundColor: '#D4A0A7', color: '#1C1917' }}
                  >
                    {saving ? 'Logging…' : 'Log It 💕'}
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      )}

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
