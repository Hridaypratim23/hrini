'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const WYR_QUESTIONS = [
  { id: 1, a: 'Watch the sunrise together', b: 'Watch the sunset together' },
  { id: 2, a: 'Go on a spontaneous road trip', b: 'Plan a dream vacation' },
  { id: 3, a: 'Cook a meal together at home', b: 'Be surprised at a mystery restaurant' },
  { id: 4, a: 'Dance in the rain', b: 'Cuddle by a fireplace' },
  { id: 5, a: 'Spend a weekend in the mountains', b: 'Spend a weekend by the beach' },
  { id: 6, a: 'Write each other love letters', b: 'Make each other mixtapes' },
  { id: 7, a: 'Have a picnic under the stars', b: 'Have a rooftop dinner' },
  { id: 8, a: 'Learn to dance together', b: 'Learn to cook together' },
  { id: 9, a: 'Revisit where we first met', b: 'Create a brand new memory spot' },
  { id: 10, a: 'Travel to 10 countries', b: 'Master 1 country deeply' },
  { id: 11, a: 'Be able to read each other\'s minds', b: 'Always know when the other is sad' },
  { id: 12, a: 'Have a lazy Sunday every week', b: 'Have an adventure every weekend' },
  { id: 13, a: 'Live in a cozy cottage in the hills', b: 'Live in a penthouse in the city' },
  { id: 14, a: 'Know all of each other\'s secrets', b: 'Have some beautiful mysteries left' },
  { id: 15, a: 'Grow old together slowly', b: 'Stay forever young together' },
  { id: 16, a: 'Have a dog together', b: 'Have a cat together' },
  { id: 17, a: 'Build something with our hands', b: 'Create something through art' },
  { id: 18, a: 'Spend a year abroad together', b: 'Spend a year exploring our own city' },
  { id: 19, a: 'Give up social media for a year', b: 'Give up streaming services for a year' },
  { id: 20, a: 'Have breakfast in bed every morning', b: 'Have candlelit dinners every night' },
]

const KWYM_QUESTIONS = [
  { id: 101, q: 'What is my favorite comfort food?' },
  { id: 102, q: 'What song reminds me of you?' },
  { id: 103, q: 'What\'s my biggest dream right now?' },
  { id: 104, q: 'What makes me feel most loved?' },
  { id: 105, q: 'What\'s my go-to stress relief?' },
  { id: 106, q: 'What\'s a place I\'ve always wanted to visit?' },
  { id: 107, q: 'What\'s my favorite time of day?' },
  { id: 108, q: 'What movie could I watch forever?' },
  { id: 109, q: 'What\'s something I\'m quietly proud of?' },
  { id: 110, q: 'What\'s my love language?' },
  { id: 111, q: 'What do I worry about most?' },
  { id: 112, q: 'What\'s my favorite season and why?' },
  { id: 113, q: 'What\'s a childhood memory I treasure?' },
  { id: 114, q: 'What skill do I wish I had?' },
  { id: 115, q: 'What does a perfect day look like to me?' },
]

function getTodayQuestionId(questions: { id: number }[]): number {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  )
  return questions[dayOfYear % questions.length].id
}

export default function GamesPage() {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState('Rajreeni')
  const [activeTab, setActiveTab] = useState<'wyr' | 'kwym' | 'streak'>('wyr')

  // WYR state
  const todayWyrId = getTodayQuestionId(WYR_QUESTIONS)
  const todayWyr = WYR_QUESTIONS.find((q) => q.id === todayWyrId)!
  const [wyrAnswer, setWyrAnswer] = useState<'a' | 'b' | null>(null)
  const [partnerWyrAnswer, setPartnerWyrAnswer] = useState<'a' | 'b' | null>(null)
  const [savingWyr, setSavingWyr] = useState(false)

  // KWYM state
  const todayKwymId = getTodayQuestionId(KWYM_QUESTIONS)
  const todayKwym = KWYM_QUESTIONS.find((q) => q.id === todayKwymId)!
  const [kwymAnswer, setKwymAnswer] = useState('')
  const [partnerKwymAnswer, setPartnerKwymAnswer] = useState<string | null>(null)
  const [savedKwym, setSavedKwym] = useState(false)
  const [savingKwym, setSavingKwym] = useState(false)

  // Streak state
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      // Load partner info
      const { data: myProf } = await supabase.from('profiles').select('partner_id').eq('id', user.id).single()
      let partnerId: string | null = null
      if (myProf?.partner_id) {
        partnerId = myProf.partner_id
        const { data: partnerProf } = await supabase.from('profiles').select('name').eq('id', partnerId).single()
        if (partnerProf?.name) setPartnerName(partnerProf.name)
      }

      // Load today's WYR answers
      const today = new Date().toISOString().split('T')[0]
      const { data: wyrData } = await supabase
        .from('game_responses')
        .select('*')
        .eq('game_type', 'wyr')
        .eq('question_id', todayWyrId)
        .gte('created_at', today)

      if (wyrData) {
        const mine = wyrData.find((r: { user_id: string; answer: string }) => r.user_id === user.id)
        const partner = wyrData.find((r: { user_id: string; answer: string }) => r.user_id === partnerId)
        if (mine) setWyrAnswer(mine.answer as 'a' | 'b')
        if (partner) setPartnerWyrAnswer(partner.answer as 'a' | 'b')
      }

      // Load today's KWYM answer
      const { data: kwymData } = await supabase
        .from('game_responses')
        .select('*')
        .eq('game_type', 'kwym')
        .eq('question_id', todayKwymId)
        .gte('created_at', today)

      if (kwymData) {
        const mine = kwymData.find((r: { user_id: string; answer: string }) => r.user_id === user.id)
        const partner = kwymData.find((r: { user_id: string; answer: string }) => r.user_id === partnerId)
        if (mine) { setKwymAnswer(mine.answer); setSavedKwym(true) }
        if (partner) setPartnerKwymAnswer(partner.answer)
      }

      // Calculate streak (days both checked in)
      const { data: checkins } = await supabase
        .from('mood_checkins')
        .select('user_id, created_at')
        .order('created_at', { ascending: false })
        .limit(100)

      if (checkins && partnerId) {
        let s = 0
        const now = new Date()
        for (let i = 0; i < 60; i++) {
          const d = new Date(now)
          d.setDate(d.getDate() - i)
          const dayStr = d.toISOString().split('T')[0]
          const hasMe = checkins.some((c: { user_id: string; created_at: string }) =>
            c.user_id === user.id && c.created_at.startsWith(dayStr)
          )
          const hasPartner = checkins.some((c: { user_id: string; created_at: string }) =>
            c.user_id === partnerId && c.created_at.startsWith(dayStr)
          )
          if (hasMe && hasPartner) s++
          else if (i > 0) break
        }
        setStreak(s)
      }
    }
    load()
  }, [])

  async function saveWyr(choice: 'a' | 'b') {
    if (!userId || wyrAnswer) return
    setSavingWyr(true)
    await supabase.from('game_responses').insert({
      user_id: userId,
      game_type: 'wyr',
      question_id: todayWyrId,
      answer: choice,
    })
    setWyrAnswer(choice)
    const chosen = choice === 'a' ? todayWyr.a : todayWyr.b
    await supabase.from('messages').insert({
      from_user_id: userId,
      content: `🎮 Would You Rather\n"${todayWyr.a}" or "${todayWyr.b}"\n\nI chose: ${chosen}`,
      type: 'text',
    })
    setSavingWyr(false)
  }

  async function saveKwym() {
    if (!userId || !kwymAnswer.trim() || savedKwym) return
    setSavingKwym(true)
    const answer = kwymAnswer.trim()
    await supabase.from('game_responses').insert({
      user_id: userId,
      game_type: 'kwym',
      question_id: todayKwymId,
      answer,
    })
    setSavedKwym(true)
    await supabase.from('messages').insert({
      from_user_id: userId,
      content: `💭 Know Me?\n${todayKwym.q}\n\nMy answer: ${answer}`,
      type: 'text',
    })
    setSavingKwym(false)
  }

  const tabs = [
    { id: 'wyr', label: 'Would You Rather', icon: '🤔' },
    { id: 'kwym', label: 'Know Me?', icon: '💭' },
    { id: 'streak', label: 'Streak', icon: '🔥' },
  ] as const

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
          Daily Games
        </h1>
        <p
          className="mt-1 text-lg"
          style={{
            fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
            color: '#D4A0A7',
          }}
        >
          Play together, grow together
        </p>
      </header>

      {/* Tab bar */}
      <div className="px-4 mb-4">
        <div
          className="flex rounded-xl p-1 gap-1"
          style={{ backgroundColor: '#292524' }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1"
              style={{
                backgroundColor: activeTab === tab.id ? '#1C1917' : 'transparent',
                color: activeTab === tab.id ? '#D4A0A7' : '#A8A29E',
                border: activeTab === tab.id ? '1px solid #3D3633' : 'none',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4">
        {/* Would You Rather */}
        {activeTab === 'wyr' && (
          <div
            className="rounded-2xl p-5 border"
            style={{ backgroundColor: '#292524', borderColor: '#3D3633' }}
          >
            <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#A8A29E' }}>
              Today&apos;s Question
            </p>
            <h2
              className="text-xl font-bold mb-5"
              style={{
                fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
                color: '#F5F0E8',
              }}
            >
              Would you rather…
            </h2>

            <div className="space-y-3 mb-5">
              {(['a', 'b'] as const).map((choice) => {
                const label = choice === 'a' ? todayWyr.a : todayWyr.b
                const isMyChoice = wyrAnswer === choice
                const isPartnerChoice = partnerWyrAnswer === choice
                const bothAnswered = wyrAnswer !== null && partnerWyrAnswer !== null

                return (
                  <button
                    key={choice}
                    onClick={() => saveWyr(choice)}
                    disabled={wyrAnswer !== null || savingWyr}
                    className="w-full text-left p-4 rounded-xl border transition-all disabled:cursor-default"
                    style={{
                      backgroundColor: isMyChoice ? 'rgba(212,160,167,0.15)' : '#1C1917',
                      borderColor: isMyChoice ? '#D4A0A7' : isPartnerChoice && bothAnswered ? '#C9A260' : '#3D3633',
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className="text-xs font-bold uppercase tracking-wider"
                          style={{ color: '#A8A29E' }}
                        >
                          {choice.toUpperCase()}
                        </span>
                        <p className="mt-1 font-medium" style={{ color: '#F5F0E8' }}>{label}</p>
                      </div>
                      <div className="flex gap-1 shrink-0 mt-1">
                        {isMyChoice && <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(212,160,167,0.2)', color: '#D4A0A7' }}>You</span>}
                        {isPartnerChoice && bothAnswered && <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(201,162,96,0.2)', color: '#C9A260' }}>{partnerName}</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {wyrAnswer && partnerWyrAnswer && (
              <div
                className="p-4 rounded-xl text-center"
                style={{
                  backgroundColor: wyrAnswer === partnerWyrAnswer
                    ? 'rgba(134,239,172,0.1)'
                    : 'rgba(212,160,167,0.1)',
                  border: `1px solid ${wyrAnswer === partnerWyrAnswer ? '#86EFAC' : '#D4A0A7'}`,
                }}
              >
                <p
                  className="text-lg font-semibold"
                  style={{ color: wyrAnswer === partnerWyrAnswer ? '#86EFAC' : '#D4A0A7' }}
                >
                  {wyrAnswer === partnerWyrAnswer ? '🎉 You both matched!' : '💕 Different choices, same love'}
                </p>
              </div>
            )}

            {wyrAnswer && !partnerWyrAnswer && (
              <p className="text-center text-sm" style={{ color: '#A8A29E' }}>
                Waiting for {partnerName} to answer…
              </p>
            )}

            {!wyrAnswer && (
              <p
                className="text-center text-base"
                style={{
                  fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
                  color: '#A8A29E',
                }}
              >
                Tap to share your choice 💭
              </p>
            )}
          </div>
        )}

        {/* How Well Do You Know Me */}
        {activeTab === 'kwym' && (
          <div
            className="rounded-2xl p-5 border"
            style={{ backgroundColor: '#292524', borderColor: '#3D3633' }}
          >
            <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#A8A29E' }}>
              Today&apos;s Question
            </p>
            <h2
              className="text-xl font-bold mb-2"
              style={{
                fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
                color: '#F5F0E8',
              }}
            >
              {todayKwym.q}
            </h2>
            <p className="text-sm mb-4" style={{ color: '#A8A29E' }}>
              Answer about yourself — {partnerName} will see your answer
            </p>

            {!savedKwym ? (
              <div>
                <textarea
                  placeholder="Your answer…"
                  value={kwymAnswer}
                  onChange={(e) => setKwymAnswer(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none resize-none mb-3"
                  style={{
                    backgroundColor: '#1C1917',
                    borderColor: '#3D3633',
                    color: '#F5F0E8',
                  }}
                />
                <button
                  onClick={saveKwym}
                  disabled={!kwymAnswer.trim() || savingKwym}
                  className="w-full py-3 rounded-xl font-semibold text-base disabled:opacity-50"
                  style={{ backgroundColor: '#D4A0A7', color: '#1C1917' }}
                >
                  {savingKwym ? 'Saving…' : 'Submit Answer 💕'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  className="p-4 rounded-xl border"
                  style={{ backgroundColor: 'rgba(212,160,167,0.1)', borderColor: '#D4A0A7' }}
                >
                  <p className="text-xs mb-1 font-medium" style={{ color: '#D4A0A7' }}>Your answer</p>
                  <p style={{ color: '#F5F0E8' }}>{kwymAnswer}</p>
                </div>

                {partnerKwymAnswer ? (
                  <div
                    className="p-4 rounded-xl border"
                    style={{ backgroundColor: 'rgba(201,162,96,0.1)', borderColor: '#C9A260' }}
                  >
                    <p className="text-xs mb-1 font-medium" style={{ color: '#C9A260' }}>{partnerName}&apos;s answer</p>
                    <p style={{ color: '#F5F0E8' }}>{partnerKwymAnswer}</p>
                  </div>
                ) : (
                  <p className="text-center text-sm" style={{ color: '#A8A29E' }}>
                    Waiting for {partnerName} to answer…
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Streak */}
        {activeTab === 'streak' && (
          <div
            className="rounded-2xl p-8 border text-center"
            style={{ backgroundColor: '#292524', borderColor: '#3D3633' }}
          >
            <div className="text-7xl mb-4">🔥</div>
            <div
              className="text-8xl font-bold mb-2"
              style={{
                fontFamily: 'var(--font-playfair, "Playfair Display", Georgia, serif)',
                color: '#D4A0A7',
              }}
            >
              {streak}
            </div>
            <p className="text-lg font-semibold mb-2" style={{ color: '#F5F0E8' }}>
              {streak === 1 ? 'day' : 'days'} together
            </p>
            <p
              className="text-base"
              style={{
                fontFamily: 'var(--font-dancing, "Dancing Script", cursive)',
                color: '#C9A260',
              }}
            >
              Both checked in {streak === 1 ? 'today' : `for ${streak} days in a row`}
            </p>

            <div
              className="mt-6 p-4 rounded-xl"
              style={{ backgroundColor: '#1C1917' }}
            >
              <p className="text-sm" style={{ color: '#A8A29E' }}>
                Streak counts when both of you check in your mood on the same day. Keep it going! 💕
              </p>
            </div>
          </div>
        )}
      </div>


    </div>
  )
}
