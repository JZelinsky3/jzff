#!/usr/bin/env node
// Is Yahoo accepting our client id yet?
//
// Since 2026-08 Yahoo gates the Fantasy Sports API behind an approval list
// (sports.yahoo.com/developer/access). An unapproved client id gets
//   403 "This application is not authorized to perform this action."
// on EVERY endpoint, for every user, including plain game metadata. OAuth is
// unaffected, which is what makes it confusing: the login round-trip succeeds
// and only the Fantasy API refuses.
//
// This script signs three requests with a real user's token and reports which
// layer is failing, so "is it back yet" is one command instead of a guess.
// It prints statuses and counts only, never league or manager names.
//
// Usage:
//   node scripts/yahoo-api-check.mjs              # uses the newest token
//   node scripts/yahoo-api-check.mjs <user_id>    # a specific user's token

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name)
    if (!fs.existsSync(file)) continue
    const env = {}
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const eq = line.indexOf('=')
      if (eq === -1 || line.trimStart().startsWith('#')) continue
      env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
    if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return env
  }
  throw new Error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local')
}

const ENV = loadEnv()
if (!ENV.YAHOO_CLIENT_ID || !ENV.YAHOO_CLIENT_SECRET) {
  throw new Error('Need YAHOO_CLIENT_ID + YAHOO_CLIENT_SECRET in .env.local')
}
const SB = `${ENV.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`
const SH = {
  apikey: ENV.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${ENV.SUPABASE_SERVICE_ROLE_KEY}`,
}

const userArg = process.argv[2] ?? null
const query = userArg
  ? `yahoo_tokens?user_id=eq.${userArg}&select=user_id,refresh_token`
  : 'yahoo_tokens?select=user_id,refresh_token&order=updated_at.desc&limit=1'
const [row] = await (await fetch(`${SB}/${query}`, { headers: SH })).json()
if (!row) throw new Error('No Yahoo token found. Someone has to connect Yahoo first.')
console.log(`token owner: ${row.user_id}`)

// 1. OAuth layer. A 200 here means our credentials and app registration are
//    fine, which isolates any later 403 to the Fantasy API itself.
const tokenRes = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
  method: 'POST',
  headers: {
    Authorization: `Basic ${Buffer.from(`${ENV.YAHOO_CLIENT_ID}:${ENV.YAHOO_CLIENT_SECRET}`).toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
    redirect_uri: 'oob',
  }),
})
console.log(`oauth refresh:  ${tokenRes.status}${tokenRes.ok ? ' ok' : ' FAILED'}`)
if (!tokenRes.ok) {
  console.log((await tokenRes.text()).slice(0, 300))
  process.exit(1)
}
const { access_token: accessToken } = await tokenRes.json()

// 2. Fantasy API layer, cheapest call first: /game/nfl carries no user data, so
//    a 403 on it can only mean the client id is refused.
const BASE = 'https://fantasysports.yahooapis.com/fantasy/v2'
let refused = false

async function probe(label, apiPath) {
  const res = await fetch(`${BASE}${apiPath}?format=json`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const text = await res.text()
  if (res.ok) {
    console.log(`${label}: ${res.status} ok (${text.length} bytes)`)
    return
  }
  let desc = text.replace(/\s+/g, ' ').slice(0, 160)
  try {
    const parsed = JSON.parse(text)
    if (parsed?.error?.description) desc = parsed.error.description
  } catch {
    // Yahoo sometimes answers with an HTML error page.
  }
  if (res.status === 403 && /application is not authorized/i.test(desc)) refused = true
  console.log(`${label}: ${res.status} ${desc}`)
}

const thisYear = new Date().getFullYear()
await probe('game meta   ', '/game/nfl')
await probe('user games  ', '/users;use_login=1/games;game_codes=nfl')
await probe('user leagues', `/users;use_login=1/games;game_codes=nfl;seasons=${thisYear}/leagues`)

console.log('')
if (refused) {
  console.log('VERDICT: Yahoo is still refusing our client id. The Fantasy API is')
  console.log('approval-gated; apply at https://sports.yahoo.com/developer/access/')
  console.log(`client id starts with: ${ENV.YAHOO_CLIENT_ID.slice(0, 16)}...`)
  process.exit(2)
}
console.log('VERDICT: Yahoo access looks live. Yahoo pickers and syncs should work.')
