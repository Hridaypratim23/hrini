export type Mood = 'happy' | 'loved' | 'tired' | 'missing_you' | 'excited' | 'calm'
export type LoveLanguage = 'words' | 'acts' | 'gifts' | 'time' | 'touch'
export type MessageType = 'text' | 'photo' | 'miss_you' | 'love_quote' | 'plan'

export interface UserProfile {
  id: string
  phone: string
  name: string
  partner_id: string | null
  coming_home_time: string | null
  push_subscription: string | null
  avatar_url: string | null
  couple_since: string | null
  meetup_time: string | null
  meetup_time_set_at: string | null
  last_seen_at: string | null
}

export interface MessageReaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

export interface MoodCheckin {
  id: string
  user_id: string
  mood: Mood
  note: string | null
  created_at: string
}

export interface LoveJarNote {
  id: string
  from_user_id: string
  message: string
  created_at: string
  revealed_at: string | null
}

export interface BucketItem {
  id: string
  created_by: string
  title: string
  description: string | null
  completed: boolean
  completed_at: string | null
  created_at: string
}

export interface LoveLanguageEntry {
  id: string
  user_id: string
  type: LoveLanguage
  note: string | null
  created_at: string
}

export interface Message {
  id: string
  from_user_id: string
  content: string
  type: MessageType
  photo_url: string | null
  created_at: string
  reply_to_id: string | null
  reply_to_content: string | null
  edited_at: string | null
}

export interface GameResponse {
  id: string
  user_id: string
  game_type: string
  question_id: number
  answer: string
  created_at: string
}

export interface MorningNote {
  id: string
  from_user_id: string
  content: string
  prompt: string
  created_at: string
}
