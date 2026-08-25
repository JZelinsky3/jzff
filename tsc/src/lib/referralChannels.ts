// Canonical "where did you hear about us" channels.
//
// This list was previously duplicated in eight places (both login forms, both
// account editors, the account server action, the Google OAuth helper, the
// auth callback, and the admin labels). They drifted: the mobile account
// editor was still missing Instagram and Google months after 0047 added them,
// so anyone who picked one on desktop saw it silently reset to "Prefer not to
// say" on their phone. One source instead.
//
// Order is deliberate — it mirrors observed referrer volume, so the options
// people are most likely to pick sit at the top of the dropdown rather than
// alphabetically or by when they were added.
//
// Any change here must also change the CHECK constraint and the
// handle_new_user allowlist in supabase/migrations (see 0060), or new signups
// picking a new channel get silently nulled.

export const REFERRAL_OPTIONS = [
  { value: '',          label: 'Prefer not to say' },
  { value: 'chatgpt',   label: 'ChatGPT' },
  { value: 'ai',        label: 'Another AI (Claude, Perplexity, Copilot)' },
  { value: 'google',    label: 'Google (search or ad)' },
  { value: 'bing',      label: 'Bing' },
  { value: 'reddit',    label: 'Reddit' },
  { value: 'discord',   label: 'Discord' },
  { value: 'twitter',   label: 'Twitter / X' },
  { value: 'facebook',  label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube',   label: 'YouTube' },
  { value: 'other',     label: 'Other' },
] as const

export type ReferralChannel = (typeof REFERRAL_OPTIONS)[number]['value']

// Every value except the empty "prefer not to say" sentinel. This is what the
// DB constraint accepts and what the validators check against.
export const REFERRAL_CHANNELS = REFERRAL_OPTIONS
  .map((o) => o.value)
  .filter((v): v is Exclude<ReferralChannel, ''> => v !== '')

export const REFERRAL_CHANNEL_SET: ReadonlySet<string> = new Set(REFERRAL_CHANNELS)

// Short labels for the admin table, where column width is tight and the
// parenthetical hints in the dropdown would wrap.
export const REFERRAL_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  ai: 'Other AI',
  google: 'Google',
  bing: 'Bing',
  reddit: 'Reddit',
  discord: 'Discord',
  twitter: 'Twitter/X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
  other: 'Other',
}
