/** Pure layout for the trace graph — deterministic, unit-tested in
 *  traceGeometry.test.ts. ringLayout mirrors the plan's Task 6 geometry
 *  verbatim (single ring); multiRingLayout is Task D's concentric version. */
import type { Relation } from '@/investigationTypes'
import { nodeKey, type GraphNode, type GraphState } from './traceState'

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

export type RingPosition = { x: number; y: number; node: GraphNode }

/** Task D: concentric rings — root at center, pivots on expanding circles.
 *  Ring membership by node.ring; angle order is Map insertion order, so the
 *  same GraphState always yields the same positions. */
export function multiRingLayout(state: GraphState, width = 720, height = 460) {
  const cx = width / 2, cy = height / 2
  const RING_RADII = [0, 160, 270, 360] // ring 0 = center, rings 1-3 = expanding
  const nodesByRing = new Map<number, GraphNode[]>()
  for (const node of state.nodes.values()) {
    const ring = node.ring
    if (!nodesByRing.has(ring)) nodesByRing.set(ring, [])
    nodesByRing.get(ring)!.push(node)
  }
  const positions = new Map<string, RingPosition>()
  for (const [ring, nodes] of nodesByRing) {
    const R = RING_RADII[ring] ?? RING_RADII[RING_RADII.length - 1]
    if (ring === 0) {
      for (const node of nodes) positions.set(nodeKey(node.type, node.value), { x: cx, y: cy, node })
      continue
    }
    nodes.forEach((node, i) => {
      const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2
      positions.set(nodeKey(node.type, node.value), { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, node })
    })
  }
  return { cx, cy, positions }
}

/** Gift-wrap convex hull (Andrew monotone chain — shorter and robust for the
 *  collinear-ish cluster points we get). Returns hull points in CCW order;
 *  <3 points returns them as-is (a hull polygon needs 3). */
export function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 3) return pts.slice()
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: typeof p = []
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q) }
  const upper: typeof p = []
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q) }
  lower.pop(); upper.pop()
  return lower.concat(upper)
}
