import { describe, it, expect } from 'vitest'
import { commentsSettled } from './commentsState'

describe('commentsSettled', () => {
  it('treats a zero-row read as ready, so the empty state is honest', () => {
    expect(commentsSettled({ data: [], error: null })).toEqual({ rows: [], status: 'ready' })
  })

  it('treats a null result with no error as an error, not as "no comments"', () => {
    // What an abort resolves to. Previously rendered as the empty state.
    expect(commentsSettled({ data: null, error: null })).toEqual({ rows: [], status: 'error' })
  })

  it('treats an explicit error as an error and does not keep stale rows', () => {
    expect(commentsSettled({ data: null, error: { message: 'aborted' } }))
      .toEqual({ rows: [], status: 'error' })
  })

  it('passes rows through on success', () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    expect(commentsSettled({ data: rows, error: null })).toEqual({ rows, status: 'ready' })
  })
})
