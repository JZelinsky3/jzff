// A player's finished Versus and Mega Draft games against people. SERVER ONLY.
//
// The profile page needs them three times over (head-to-heads on the friend
// list, the record book's W-L, the profile's own record and facts), so it loads
// them once here and hands the same rows to each.

import type { MegaResultRow } from './mega'
import type { VersusResultRow } from './versus'

export type PeResults = { vs: VersusResultRow[]; mega: MegaResultRow[] }

export async function peResults(userId: string): Promise<PeResults> {
  // Imported here rather than at the top: versus.ts imports friends.ts for
  // friendOf, and a cycle at module load leaves one side undefined.
  const [{ versusResults }, { megaResults }] = await Promise.all([import('./versus'), import('./mega')])
  const [vs, mega] = await Promise.all([versusResults(userId), megaResults(userId)])
  return { vs, mega }
}
