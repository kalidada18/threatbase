import { describe, it, expect } from 'vitest'
import { splitLeaderboard } from './leaderboardRanking'

const rows = (...counts: number[]) => counts.map((reports_count) => ({ reports_count }))

describe('splitLeaderboard', () => {
  it('promotes the first row and starts the list at rank 02', () => {
    const { leader, ranked } = splitLeaderboard([
      { reports_count: 53, reporter_alias: 'a' },
      { reports_count: 34, reporter_alias: 'b' },
      { reports_count: 5, reporter_alias: 'c' },
    ])

    expect(leader?.reporter_alias).toBe('a')
    // Never re-emits rank 01 — the podium already shows that row.
    expect(ranked.map((r) => r.rank)).toEqual([2, 3])
    expect(ranked.map((r) => r.entry.reporter_alias)).toEqual(['b', 'c'])
  })

  it('numbers continuously past rank 09 so padStart does not collide', () => {
    const { ranked } = splitLeaderboard(rows(...Array.from({ length: 11 }, (_, i) => 50 - i)))
    expect(ranked.map((r) => r.rank)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('returns no ranked rows when only the leader exists', () => {
    const { leader, ranked } = splitLeaderboard([{ reports_count: 7 }])
    expect(leader?.reports_count).toBe(7)
    expect(ranked).toEqual([])
  })

  it('handles an empty table', () => {
    const { leader, ranked, max } = splitLeaderboard([])
    expect(leader).toBeNull()
    expect(ranked).toEqual([])
    expect(max).toBe(1)
  })

  it('measures share against the leader and floors it at 2%', () => {
    const { ranked } = splitLeaderboard(rows(100, 50, 1))
    // 1/100 rounds to 1%, which would render as an invisible bar.
    expect(ranked.map((r) => r.share)).toEqual([50, 2])
  })

  it('gives a tied runner-up 100% rather than dividing by zero', () => {
    const { ranked } = splitLeaderboard(rows(20, 20))
    expect(ranked[0].share).toBe(100)
  })

  it('survives a zero-report leader', () => {
    const { ranked, max } = splitLeaderboard(rows(0, 0))
    expect(max).toBe(1)
    expect(ranked[0].share).toBe(2)
  })
})
