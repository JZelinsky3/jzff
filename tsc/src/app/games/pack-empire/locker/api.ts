// The Locker's calls to the server, for the pages in here.

export async function lockerPost<T>(path: '' | '/field-general', body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/games/pack-empire/locker${path}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!data?.ok) throw new Error(data?.error ?? 'That did not go through. Try again.')
  return data as T
}
