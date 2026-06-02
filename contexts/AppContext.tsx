'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import type { UserProfile, MoodCheckin } from '@/types'

interface AppContextValue {
  userId: string | null
  profile: UserProfile | null
  partnerProfile: UserProfile | null
  partnerMood: MoodCheckin | null
  myMoodToday: MoodCheckin | null
  setMyMoodToday: (m: MoodCheckin | null) => void
  setPartnerMood: (m: MoodCheckin | null) => void
  refreshProfile: () => Promise<void>
}

const AppContext = createContext<AppContextValue>({
  userId: null,
  profile: null,
  partnerProfile: null,
  partnerMood: null,
  myMoodToday: null,
  setMyMoodToday: () => {},
  setPartnerMood: () => {},
  refreshProfile: async () => {},
})

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null)
  const [partnerMood, setPartnerMood] = useState<MoodCheckin | null>(null)
  const [myMoodToday, setMyMoodToday] = useState<MoodCheckin | null>(null)

  async function loadData(uid: string) {
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', uid).single()
    if (!prof) return
    setProfile(prof as UserProfile)

    if (prof.partner_id) {
      const [{ data: partner }, { data: pMood }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', prof.partner_id).single(),
        supabase
          .from('mood_checkins')
          .select('*')
          .eq('user_id', prof.partner_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
      ])
      if (partner) setPartnerProfile(partner as UserProfile)
      if (pMood) setPartnerMood(pMood as MoodCheckin)
    }

    const today = new Date().toISOString().split('T')[0]
    const { data: myMood } = await supabase
      .from('mood_checkins')
      .select('*')
      .eq('user_id', uid)
      .gte('created_at', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (myMood) setMyMoodToday(myMood as MoodCheckin)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUserId(session.user.id)
        loadData(session.user.id)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id)
        loadData(session.user.id)
      } else {
        setUserId(null)
        setProfile(null)
        setPartnerProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Realtime: partner mood updates
  useEffect(() => {
    if (!profile?.partner_id) return
    const channel = supabase
      .channel('partner-mood-ctx')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'mood_checkins',
        filter: `user_id=eq.${profile.partner_id}`,
      }, (payload) => {
        setPartnerMood(payload.new as MoodCheckin)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.partner_id])

  return (
    <AppContext.Provider value={{
      userId,
      profile,
      partnerProfile,
      partnerMood,
      myMoodToday,
      setMyMoodToday,
      setPartnerMood,
      refreshProfile: () => userId ? loadData(userId) : Promise.resolve(),
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
