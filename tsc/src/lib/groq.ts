// Groq client — thin wrapper around the OpenAI-compatible chat completions
// endpoint. No SDK dependency: keeps the bundle small and avoids version
// drift with the OpenAI npm package.
//
// Server-only. Never import from a "use client" file — the API keys are
// in private env vars (GROQ_API_KEY_* — see .env.local). Exposing this to
// the browser would leak the key.
//
// Models we use:
//   trade grader:   llama-3.3-70b-versatile  (quality > speed for grading)
//   weekly recap:   llama-3.3-70b-versatile  (same)
// Both share the same chat-completions surface, so this single function
// fits every Groq feature we'll build.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export type GroqMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type GroqChatArgs = {
  apiKey: string
  model: string
  messages: GroqMessage[]
  // When true, ask Groq for strict JSON via response_format. Caller must
  // also instruct the model to produce JSON in the prompt.
  json?: boolean
  temperature?: number
  maxTokens?: number
}

export type GroqUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export type GroqResult = {
  text: string
  model: string
  usage: GroqUsage | null
}

export class GroqError extends Error {
  constructor(public status: number, public body: string) {
    super(`Groq ${status}: ${body.slice(0, 400)}`)
  }
}

// Single chat completion. Throws on non-2xx so callers can catch and decide
// whether to retry / fall back. Returns the raw text (caller parses JSON if
// json=true was set).
//
// Retries on 429 (rate-limit) using the suggested wait. Groq returns both a
// `retry-after` header (seconds, may be fractional) and an embedded "try
// again in X.Xs" string in the JSON body. We honor whichever we can parse,
// up to MAX_RETRIES total attempts. Token-per-minute limits on the free tier
// (12000 TPM) hit often when grading more than ~13 trades back-to-back.
const MAX_RETRIES = 3

export async function groqChat(args: GroqChatArgs): Promise<GroqResult> {
  let lastErr: GroqError | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        temperature: args.temperature ?? 0.3,
        max_tokens: args.maxTokens ?? 1024,
        ...(args.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      cache: 'no-store',
    })

    if (res.ok) {
      const data = await res.json()
      const text = data?.choices?.[0]?.message?.content
      if (typeof text !== 'string') {
        throw new GroqError(200, `unexpected response shape: ${JSON.stringify(data).slice(0, 400)}`)
      }
      return {
        text,
        model: args.model,
        usage: (data?.usage as GroqUsage) ?? null,
      }
    }

    const body = await res.text().catch(() => '')
    lastErr = new GroqError(res.status, body)

    // Only retry rate-limit / server errors. 4xx other than 429 means the
    // request is wrong and won't get better on retry.
    if (res.status !== 429 && res.status < 500) throw lastErr

    if (attempt === MAX_RETRIES - 1) throw lastErr

    const waitMs = parseRetryDelayMs(res.headers.get('retry-after'), body)
    await sleep(waitMs)
  }

  // Loop exits via return on success or throw on retry exhaustion — this
  // line is defensive (the throw above is what actually fires).
  throw lastErr ?? new GroqError(0, 'unknown')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Pick a wait time from (in order): the `retry-after` header, the "try again
// in X.Xs" hint in the body, or a fallback of 4 seconds. Adds a 500ms buffer
// so we don't fire right as the window opens.
function parseRetryDelayMs(headerVal: string | null, body: string): number {
  if (headerVal) {
    const sec = Number(headerVal)
    if (Number.isFinite(sec) && sec >= 0) return Math.min(sec * 1000 + 500, 30_000)
  }
  const m = body.match(/try again in\s+([\d.]+)\s*s/i)
  if (m) {
    const sec = Number(m[1])
    if (Number.isFinite(sec) && sec >= 0) return Math.min(sec * 1000 + 500, 30_000)
  }
  return 4000
}

// Convenience helper — returns the parsed JSON object. Use when you've set
// json: true and instructed the model to return strict JSON. Throws if the
// model produces invalid JSON (rare with response_format set, but handle it).
export async function groqChatJson<T = unknown>(args: GroqChatArgs): Promise<{ data: T; raw: GroqResult }> {
  const raw = await groqChat({ ...args, json: true })
  let data: T
  try {
    data = JSON.parse(raw.text) as T
  } catch (e) {
    throw new GroqError(200, `model returned invalid JSON: ${(e as Error).message}; text=${raw.text.slice(0, 400)}`)
  }
  return { data, raw }
}
