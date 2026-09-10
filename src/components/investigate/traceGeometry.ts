/** Pure ring layout for the trace graph — deterministic, unit-tested in
 *  traceGeometry.test.ts. Mirrors the plan's Task 6 geometry verbatim. */
import type { Relation } from '@/investigationTypes'

// type → arc sector order: net (domain/ipv4/ipv6) first, urls, hashes last
const ORDER: Record<string, number> = { domain: 0, ipv4: 0, ipv6: 0, url: 1, md5: 2, sha1: 2, sha256: 2 }

export function ringLayout(relations: Relation[], width = 720, height = 460) {
  const groups = [0, 1, 2].map((g) => relations.filter((r) => ORDER[r.type] === g))
  const pos: { r: Relation; x: number; y: number; radius: number }[] = []
  const R = Math.min(width, height) / 2 - 54
  const cx = width / 2, cy = height / 2
  const total = Math.max(1, relations.length)
  let i = 0
  for (const g of groups) for (const r of g) {
    const a = (i++ / total) * Math.PI * 2 - Math.PI / 2 + (Number(ORDER[r.type]) * 0.35)
    const radius = R * (0.72 + 0.28 * Math.min(1, (r.weight || 0) / 8))
    pos.push({ r, radius, x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius })
  }
  return { cx, cy, pos }
}
