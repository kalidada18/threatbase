/** In-graph pivot state for TraceGraph (Task D). Pure module — no React, no
 *  fetch — so the merge/restore/collapse logic is unit-testable in node.
 *  Mirrors the plan's Step D-1 verbatim plus two prunings the handlers need:
 *  nodeKey() and collapseGraph(). */
import type { IndicatorType, Relation } from '@/investigationTypes'

export type GraphNode = {
  type: IndicatorType
  value: string
  malicious?: boolean | null
  weight: number
  ring: number // 0 = root, 1 = first pivot, 2 = second pivot
  expanded: boolean
  edge?: string
  via?: string
  /** Verdict part of this node's sub-dossier, captured at expansion time
   *  (Task F inspector). Undefined until a dossier has been fetched for it. */
  mal_by?: number
  engines?: number
}

export type GraphEdge = {
  from: string // `${type}:${value}`
  to: string
  edge: string
  weight: number
}

export type GraphState = {
  nodes: Map<string, GraphNode> // key = `${type}:${value}`
  edges: GraphEdge[]
  pivotStack: string[] // ordered pivot history for breadcrumb + URL
}

export const MAX_RINGS = 3
export const MAX_NODES_PER_RING = 40

/** URL ?pivots= restore is capped below the 8/min rl_inv limiter: root (free,
 *  already fetched as q) + at most MAX_RESTORE_PIVOTS re-fetches. */
export const MAX_RESTORE_PIVOTS = 7

export const nodeKey = (type: string, value: string) => `${type}:${value.toLowerCase()}`

export function mergeRelationsIntoGraph(
  state: GraphState,
  relations: Relation[],
  fromKey: string,
  ring: number
): GraphState {
  const next: GraphState = {
    nodes: new Map(state.nodes),
    edges: [...state.edges],
    pivotStack: [...state.pivotStack],
  }
  let added = 0
  for (const r of relations) {
    if (!r.value || !r.type) continue
    if (added >= MAX_NODES_PER_RING) break
    const k = nodeKey(r.type, r.value)
    if (!next.nodes.has(k)) {
      next.nodes.set(k, { type: r.type, value: r.value, malicious: r.malicious ?? null, weight: r.weight, ring, expanded: false, edge: r.edge, via: r.via })
      added++
    }
    next.edges.push({ from: fromKey, to: k, edge: r.edge, weight: r.weight })
  }
  return next
}

/** Collapse back to breadcrumb depth `i`: breadcrumb index == node ring, so
 *  keeping the trail 0..i means keeping rings 0..i+1 (the last trail member's
 *  own children) and dropping everything deeper. Frontier nodes (ring i+1) had
 *  their children pruned, so reset `expanded` to allow re-expanding. Edges are
 *  rebuilt so none dangle to pruned nodes. */
export function collapseGraph(state: GraphState, depth: number): GraphState {
  const nodes = new Map<string, GraphNode>()
  for (const [k, n] of state.nodes) {
    if (n.ring > depth + 1) continue
    nodes.set(k, n.ring === depth + 1 && n.expanded ? { ...n, expanded: false } : n)
  }
  return {
    nodes,
    edges: state.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to)),
    pivotStack: state.pivotStack.slice(0, depth + 1),
  }
}

/** Restore queue from a deserialized ?pivots= stack: skip index 0 (that's the
 *  root == current q, already fetched) and cap the re-fetch count so a shared
 *  link can't blow the 8/min rl_inv limiter. */
export function restoreQueue(stack: string[]): string[] {
  return stack.slice(1, 1 + MAX_RESTORE_PIVOTS)
}

export function serializePivotStack(stack: string[]): string {
  return stack.map(encodeURIComponent).join(',')
}

export function deserializePivotStack(s: string): string[] {
  // ?pivots= is untrusted input — a lone '%' makes decodeURIComponent throw;
  // drop that entry, keep the rest (degrade, never crash the effect).
  return s ? s.split(',').map((x) => { try { return decodeURIComponent(x) } catch { return null } }).filter((x): x is string => x !== null) : []
}
