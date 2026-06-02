export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function formatTimeLeft(seconds: number): string {
  if (seconds <= 0) return '0h 0m'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export function getMoodEmoji(mood: string): string {
  const map: Record<string, string> = {
    happy: '😊',
    loved: '🥰',
    tired: '😴',
    missing_you: '💭',
    excited: '🎉',
    calm: '😌',
  }
  return map[mood] ?? '💕'
}

export function getMoodLabel(mood: string): string {
  const map: Record<string, string> = {
    happy: 'Happy',
    loved: 'Loved',
    tired: 'Tired',
    missing_you: 'Missing You',
    excited: 'Excited',
    calm: 'Calm',
  }
  return map[mood] ?? mood
}

export function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function isToday(dateString: string): boolean {
  const date = new Date(dateString)
  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'yesterday'
  return `${diffDays}d ago`
}

export const LOVE_QUOTES = [
  "In all the world, there is no heart for me like yours.",
  "You are my today and all of my tomorrows.",
  "I love you not only for what you are, but for what I am when I am with you.",
  "Whatever our souls are made of, his and mine are the same.",
  "I look at you and see the rest of my life in front of my eyes.",
  "You make my heart smile.",
  "I choose you. And I'll choose you over and over.",
  "Being deeply loved by someone gives you strength.",
  "You are my sun, my moon, and all my stars.",
  "Every love story is beautiful, but ours is my favorite.",
]

export function getRandomQuote(): string {
  return LOVE_QUOTES[Math.floor(Math.random() * LOVE_QUOTES.length)]
}
