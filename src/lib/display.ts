import type { BossGroup, Status } from './types'

export const GROUP_COLORS: Record<BossGroup, string> = {
  'gym-leader': '#e8453c',
  'elite-four': '#a55ce0',
  rival: '#3a8ce0',
  'evil-team': '#6a5548',
  'mini-boss': '#e2a33c',
  'ace-trainer': '#3fb8a6',
  boss: '#9fa19f'
}

export const GROUP_LABELS: Record<BossGroup, string> = {
  'gym-leader': 'Gym Leader',
  'elite-four': 'Elite Four',
  rival: 'Rival',
  'evil-team': 'Team Rocket',
  'mini-boss': 'Mini-boss',
  'ace-trainer': 'Ace Trainer',
  boss: 'Boss'
}

export const STATUS_META: Record<Status, { label: string; glyph: string; tone: string }> = {
  party: { label: 'Party', glyph: '⚔️', tone: 'good' },
  box: { label: 'Boxed', glyph: '📦', tone: '' },
  dead: { label: 'Dead', glyph: '💀', tone: 'bad' },
  missed: { label: 'Missed', glyph: '✖️', tone: 'dim' }
}
