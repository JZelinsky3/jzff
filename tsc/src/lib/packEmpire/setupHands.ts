// Three cards for each table on the Versus and Mega Draft setup cards, dealt the
// way that difficulty deals them, keyed `format:difficulty`. The art is the
// difference between the tables, so each one shows its own: Versus Classic and
// Even share a position (a pack a position), Mystery is three positions, Mega
// Chemistry is three real teammates from one season (the stacks it deals), and
// the rest of Mega is a mixed board. Recent men people know, mixed rarities.
//
// Server only: maskCard reads the dealer's secret for ranges and salaries.

import { maskCard } from './deal'
import { playerById } from './pool'
import { DIFFICULTIES, type Difficulty, type Player } from './rules'

type Table = Record<Difficulty, string[]>

const VERSUS: Record<string, Table> = {
  classic: {
    open: ['wr-puka-nacua-2023', 'wr-ceedee-lamb-2023-immortal', 'wr-justin-jefferson-2022'],
    range: ['rb-jonathan-taylor-2020', 'rb-christian-mccaffrey-2023', 'rb-saquon-barkley-2022'],
    season: ['te-sam-laporta-2024', 'te-travis-kelce-2022-immortal', 'te-george-kittle-2018'],
    cap: ['qb-joe-burrow-2021', 'qb-josh-allen-2022', 'qb-lamar-jackson-2022'],
  },
  even: {
    open: ['te-brock-bowers-2024', 'te-trey-mcbride-2025', 'te-george-kittle-2023'],
    range: ['qb-patrick-mahomes-2025', 'qb-josh-allen-2020', 'qb-jalen-hurts-2024'],
    season: ['wr-amon-ra-st-brown-2025', 'wr-tyreek-hill-2021', 'wr-jamarr-chase-2025'],
    cap: ['rb-jahmyr-gibbs-2023', 'rb-bijan-robinson-2025', 'rb-derrick-henry-2020'],
  },
  mystery: {
    open: ['rb-bijan-robinson-2023', 'qb-josh-allen-2020', 'te-trey-mcbride-2023'],
    range: ['og-zack-martin-2022', 'wr-justin-jefferson-2021', 'qb-joe-burrow-2020'],
    season: ['c-jason-kelce-2019', 'rb-saquon-barkley-2025', 'wr-ceedee-lamb-2021'],
    cap: ['rb-jonathan-taylor-2023', 'wr-puka-nacua-2025-immortal', 'te-george-kittle-2018'],
  },
}

const MEGA: Record<string, Table> = {
  classic: {
    open: ['og-zack-martin-2021', 'qb-lamar-jackson-2019', 'wr-justin-jefferson-2022'],
    range: ['c-jason-kelce-2019', 'te-brock-bowers-2024', 'rb-derrick-henry-2020'],
    season: ['rb-alvin-kamara-2020', 'wr-cooper-kupp-2021', 'qb-kyler-murray-2020'],
    cap: ['te-mark-andrews-2019', 'qb-justin-herbert-2021', 'rb-dalvin-cook-2020'],
  },
  chem: {
    open: ['te-sam-laporta-2023', 'wr-amon-ra-st-brown-2023', 'rb-jahmyr-gibbs-2023'],
    range: ['te-george-kittle-2023', 'rb-christian-mccaffrey-2023', 'wr-deebo-samuel-2023'],
    season: ['ot-david-bakhtiari-2020', 'qb-aaron-rodgers-2020', 'wr-davante-adams-2020'],
    cap: ['ot-lane-johnson-2024', 'qb-jalen-hurts-2024', 'rb-saquon-barkley-2024'],
  },
  battles: {
    open: ['rb-nick-chubb-2022', 'te-travis-kelce-2020', 'wr-stefon-diggs-2021'],
    range: ['og-joel-bitonio-2022', 'qb-tom-brady-2021', 'wr-dk-metcalf-2020'],
    season: ['wr-mike-evans-2021', 'qb-russell-wilson-2020', 'te-darren-waller-2019'],
    cap: ['ot-tristan-wirfs-2021', 'qb-kyler-murray-2021', 'wr-deandre-hopkins-2020'],
  },
}

export function setupHands(mode: 'versus' | 'mega'): Record<string, Player[]> {
  const tables = mode === 'versus' ? VERSUS : MEGA
  const out: Record<string, Player[]> = {}
  for (const [format, table] of Object.entries(tables)) {
    for (const d of DIFFICULTIES) {
      out[`${format}:${d}`] = table[d].flatMap((id) => {
        const p = playerById(id)
        return p ? [maskCard(p, d)] : []
      })
    }
  }
  return out
}
