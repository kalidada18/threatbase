/**
 * Split `top_contributors` rows into the promoted leader plus the ranked
 * detail rows beneath them.
 *
 * Pure, so the rank numbering is testable without a DOM — this repo renders no
 * components in tests (vitest runs in the `node` environment, no
 * testing-library). Numbering is the fragile part: the podium owns rank 01, so
 * the list must start at 02 and an off-by-one would silently render the top
 * contributor a second time.
 */

export interface Scored {
  reports_count: number
}

export interface RankedRow<T> {
  entry: T
  /** 1-based overall rank. The podium holds 1, so this starts at 2. */
  rank: number
  /** Share of the leader's volume, as a whole percent. Floored at 2 so the
   *  bar stays visible as a hairline rather than vanishing on a small count. */
  share: number
}

export function splitLeaderboard<T extends Scored>(rows: T[]): {
  leader: T | null
  ranked: RankedRow<T>[]
  max: number
} {
  const [leader, ...rest] = rows
  // `|| 1` keeps this a safe divisor even if the leader somehow has 0 reports.
  const max = leader?.reports_count || 1

  return {
    leader: leader ?? null,
    max,
    ranked: rest.map((entry, i) => ({
      entry,
      rank: i + 2,
      share: Math.max(2, Math.round((entry.reports_count / max) * 100)),
    })),
  }
}
