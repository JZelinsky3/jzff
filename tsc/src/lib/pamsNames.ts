// What PA Milk Society calls its managers.
//
// Mostly the platform's display_name is already what the league says. Several
// are not, because the same real person accumulates a different manager row
// per platform/season: raw display_name "Cat" and "Atkinsson" are both
// Connor; raw "Cnnr430" is Connie; raw "tinfoil99" is Charlie; and "sean" is
// written Sean.
//
// The raw display_name "Connor" (id f28186ad…) is, despite the name, also
// Connie — that account is "Milk Man," the 2023 champion. Confirmed directly
// by Joey twice (2026-08-08 and again 2026-08-20) after a session on
// 2026-08-20 nearly flipped this to "Connor" off a plausible-looking but
// wrong inference; do not repeat that. Full mapping confirmed 2026-08-20.
//
// CAUTION: src/lib/winBallot.ts has Cat and Connie transposed — its "Cat" row
// carries Connie's career record (46-50, the 3-11 in 2021, the 9-5 in 2024)
// and its "Connie" row carries Cat's (42-54, the 2-12 in 2022). That ballot
// has already run, so the rows are left alone rather than rewritten under it;
// do NOT use winBallot's roster to resolve identity, and do not "correct"
// this file to agree with it.
//
// There is also a 2019-only alumnus whose display_name is "Sean", distinct
// from the seven-season "sean" who is on the current roster. Keying on id is
// what keeps those two apart as well.

export const PAMS_NAMES: Readonly<Record<string, string>> = {
  '196e3501-8cec-49b4-a09b-17771bc997f1': 'Joey',
  'eaeedefa-2711-4d93-b0ce-a795c5f4d55a': 'Mason',
  'dca75bbf-9c3e-4576-b6c4-845e6dc20030': 'Chris',
  '6f92aba6-b4b6-4321-bd61-e8af54e54cef': 'Isaac',
  'f28186ad-c398-4bf5-a425-e387fa1e03a3': 'Connie',
  '0f563eef-b031-475b-b007-2a6e228bdeb6': 'Connie',
  'ca70f1bc-3bc8-4ab3-af35-3b3ee25c157f': 'Ricci',
  '6897f929-c070-4e0e-9633-d9e90794a1c0': 'Sean',
  'c8db587f-7936-4cd7-a4d7-a3efa9edbe4c': 'Kyle',
  '55ab525f-9fa0-4bdd-a842-a0dcc99577b1': 'Luke',
  'f0320789-0aa0-4184-8fb1-75b3b85255c2': 'Connor',
  '3e646fd9-2ead-40d9-a172-da5ae57a0ec8': 'Connor',
  '6bb9d0d4-b205-4004-8ecd-c2010826c5b2': 'Charlie',
  '18eab12d-3c0e-4b90-a4e9-b62658682600': 'Charlie',
  '97231b80-a376-475c-869f-dd8916de26ab': 'Evan',
}

/**
 * The league's name for a manager, falling back to whatever the platform had
 * if the id is one this map has never seen (an alumnus, or a league other than
 * PAMS reusing these helpers).
 */
export function leagueName(managerId: string, displayName: string): string {
  return PAMS_NAMES[managerId] ?? displayName
}
