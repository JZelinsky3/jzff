#!/usr/bin/env node
// One-shot bypass: set a password on an existing Supabase user directly.
// Useful when the Auth email rate limit / SMTP is blocking magic links and
// you need to get back in.
//
// Usage:
//   node scripts/set-user-password.mjs you@email.com 'your-new-password'
//
// Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
// Uses the Auth admin API so it works regardless of email confirmation state.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.env.local')
let envText
try {
  envText = readFileSync(envPath, 'utf8')
} catch {
  console.error(`Could not read ${envPath} — run this from your project root.`)
  process.exit(1)
}

const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (!m) continue
  let val = m[2].trim()
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
  env[m[1]] = val
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env.local')
  process.exit(1)
}

const [email, password] = process.argv.slice(2)
if (!email || !password) {
  console.error('Usage: node scripts/set-user-password.mjs <email> <password>')
  process.exit(1)
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.')
  process.exit(1)
}

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

// Find the user by email. The admin API's list-users endpoint accepts a
// filter via the `email` query param on most Supabase versions; we scan
// the first 1000 to be safe in case the project has many users.
const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers })
if (!listRes.ok) {
  console.error(`List users failed: HTTP ${listRes.status} ${await listRes.text()}`)
  process.exit(1)
}
const { users } = await listRes.json()
const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
if (!user) {
  console.error(`No user with email ${email} found in this project.`)
  process.exit(1)
}

// Update the password + mark email confirmed (so they don't get stuck on
// an unconfirmed-email error if confirmation was previously pending).
const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    password,
    email_confirm: true,
    user_metadata: { ...(user.user_metadata ?? {}), has_password_set: true },
  }),
})
if (!updateRes.ok) {
  console.error(`Update failed: HTTP ${updateRes.status} ${await updateRes.text()}`)
  process.exit(1)
}

console.log(`Password set for ${email}. Sign in at /login with that email + the password you just set.`)
