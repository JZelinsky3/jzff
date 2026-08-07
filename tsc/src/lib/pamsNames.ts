// What PA Milk Society calls its managers.
//
// The platform's display_name and the name the league actually uses are not
// the same string for everybody, and in two cases they are actively
// misleading: the manager whose Sleeper name is "Connor" is Cat to the league,
// and the manager whose Sleeper name is "Cat" is Connie. Matching on
// display_name therefore swaps two real people, which is why everything in the
// offseason features keys on managers.id and resolves the name through here.
//
// The right-hand side matches the roster the win-total ballot ran on
// (src/lib/winBallot.ts), so the same twelve people read the same way across
// the ballot, the bracket, and the awards.
//
// There is also a 2019-only alumnus whose display_name is "Sean", distinct
// from the seven-season "sean" who is on the current roster. Keying on id is
// what keeps those two apart as well.

export const PAMS_NAMES: Readonly<Record<string, string>> = {
  '196e3501-8cec-49b4-a09b-17771bc997f1': 'Joey',
  'eaeedefa-2711-4d93-b0ce-a795c5f4d55a': 'Mason',
  'dca75bbf-9c3e-4576-b6c4-845e6dc20030': 'Chris',
  '6f92aba6-b4b6-4321-bd61-e8af54e54cef': 'Isaac',
  'f28186ad-c398-4bf5-a425-e387fa1e03a3': 'Cat',
  'ca70f1bc-3bc8-4ab3-af35-3b3ee25c157f': 'Ricci',
  '6897f929-c070-4e0e-9633-d9e90794a1c0': 'Sean',
  'c8db587f-7936-4cd7-a4d7-a3efa9edbe4c': 'Kyle',
  '55ab525f-9fa0-4bdd-a842-a0dcc99577b1': 'Luke',
  'f0320789-0aa0-4184-8fb1-75b3b85255c2': 'Connie',
  '6bb9d0d4-b205-4004-8ecd-c2010826c5b2': 'Charlie',
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
