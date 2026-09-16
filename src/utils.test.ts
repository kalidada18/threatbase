import { describe, it, expect } from 'vitest'
import { selectChunkFor, type FeedChunk } from './utils'

// Regression for the 2026-09-16 audit: stats.json bounds carry the feed's
// `key,last_seen` suffix, and a bare query sorts BELOW its own suffixed chunk
// head ('gangnam-rabbit.com' < 'gangnam-rabbit.com,2026-09-02'), so every
// chunk-first IOC fell in a phantom gap and scanned "clean" with zero fetches.
const chunks: FeedChunk[] = [
  { file: 'domain/threatbase-domain-01.txt', first: '0--4.com,2026-09-05', last: 'ganglplast.rest,2026-09-02', lines: 1, bytes: 1 },
  { file: 'domain/threatbase-domain-02.txt', first: 'gangnam-rabbit.com,2026-09-02', last: 'sex.hotblog.top,2026-09-02', lines: 1, bytes: 1 },
  { file: 'domain/threatbase-domain-03.txt', first: 'sex.klingeltoene.sms.sms13.de,2026-09-02', last: 'zzzzzzzzzzzzz.com,2026-09-02', lines: 1, bytes: 1 },
]

describe('selectChunkFor', () => {
  it('finds a query equal to a chunk head (was: false-negative "clean")', () => {
    expect(selectChunkFor(chunks, 'gangnam-rabbit.com')?.file).toBe('domain/threatbase-domain-02.txt')
    expect(selectChunkFor(chunks, '0--4.com')?.file).toBe('domain/threatbase-domain-01.txt')
  })

  it('finds a query equal to a chunk tail', () => {
    expect(selectChunkFor(chunks, 'zzzzzzzzzzzzz.com')?.file).toBe('domain/threatbase-domain-03.txt')
  })

  it('finds interior queries', () => {
    expect(selectChunkFor(chunks, 'example.com')?.file).toBe('domain/threatbase-domain-01.txt')
  })

  it('returns null only for a true inter-chunk gap', () => {
    // 'gangm.com' sorts between chunk-01's tail 'ganglplast.rest' ('l' < 'm')
    // and chunk-02's head 'gangnam-rabbit.com' ('m' < 'n') — a real gap.
    expect(selectChunkFor(chunks, 'gangm.com')).toBeNull()
  })
})
