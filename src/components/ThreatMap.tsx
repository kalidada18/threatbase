import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3-geo'
import * as topojson from 'topojson-client'
import { getBaseUrl, fmt, timeAgo, DATA_RAMP } from '../utils'
import { COUNTRY_COORDS, TARGET_HUBS } from '../lib/countryCoords'

// Fallback origins used until real geo data loads (or if it fails).
const CITIES = [
  { name: "New York", coords: [-74.006, 40.7128] },
  { name: "London", coords: [-0.1276, 51.5074] },
  { name: "Tokyo", coords: [139.6917, 35.6895] },
  { name: "Moscow", coords: [37.6173, 55.7558] },
  { name: "Beijing", coords: [116.4074, 39.9042] },
  { name: "Sydney", coords: [151.2093, -33.8688] },
  { name: "São Paulo", coords: [-46.6333, -23.5505] },
  { name: "Johannesburg", coords: [28.0473, -26.2041] },
  { name: "San Francisco", coords: [-122.4194, 37.7749] },
  { name: "Singapore", coords: [103.8198, 1.3521] },
  { name: "Frankfurt", coords: [8.6821, 50.1109] },
  { name: "Dubai", coords: [55.2708, 25.2048] }
]

// Category → accent colour. The breakdown is always rendered in descending
// volume order, so colour comes from rank position in the single ordered
// DATA_RAMP rather than a per-category rainbow (tasteskill colour lock).
const rampAt = (i: number) => DATA_RAMP[Math.min(i, DATA_RAMP.length - 1)]

// Build an SVG path string for the trend sparkline.
function sparkLine(vals: number[], w: number, h: number) {
  if (vals.length < 2) return ''
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const step = w / (vals.length - 1)
  return vals
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${(h - ((v - min) / span) * h).toFixed(1)}`)
    .join(' ')
}

// Real country flag (flagcdn.com); hides itself if the code has no flag.
function Flag({ cc }: { cc: string }) {
  const code = cc.toLowerCase()
  return (
    <img
      src={`https://flagcdn.com/24x18/${code}.png`}
      srcSet={`https://flagcdn.com/48x36/${code}.png 2x`}
      width={16}
      height={12}
      loading="lazy"
      decoding="async"
      alt=""
      aria-hidden="true"
      className="h-3 w-4 shrink-0 rounded-[2px] object-cover ring-1 ring-white/15"
      onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
    />
  )
}

interface Attack {
  id: number
  sourceLonLat: [number, number]
  targetLonLat: [number, number]
  progress: number
  speed: number
  color: string
}

interface Explosion {
  lonLat: [number, number]
  progress: number
  color: string
}

// A whole-country flash triggered when an attack lands on it.
interface CountryHit {
  feature: any
  progress: number
  color: string
}

// Weighted picker built from real counts (geo countries or categories).
interface Weighted<T> {
  items: T[]
  cumulative: number[]
  total: number
}

function pickWeighted<T>(w: Weighted<T> | null): T | null {
  if (!w || w.total <= 0) return null
  const r = Math.random() * w.total
  let lo = 0, hi = w.cumulative.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (w.cumulative[mid] < r) lo = mid + 1
    else hi = mid
  }
  return w.items[lo]
}

/**
 * Interpolate along a great-circle arc on the globe surface.
 * Returns [lon, lat] at parameter t in [0, 1].
 */
function interpolateGreatArc(src: [number, number], tgt: [number, number], t: number): [number, number] {
  const interp = d3.geoInterpolate(src, tgt)
  return interp(t) as [number, number]
}

export default function ThreatMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Weighted picker over real attacker geography, read live by the render loop.
  const geoRef = useRef<Weighted<{ coords: [number, number]; cc: string }> | null>(null)
  const [topAttackers, setTopAttackers] = useState<{cc: string, name: string, count: number, pct: number}[]>([])
  // Real CTI stats for the "Last 24h" analytics strip.
  const [stats, setStats] = useState<{ total: number; cats: Record<string, number>; feeds: number; updated: string } | null>(null)
  const [trend, setTrend] = useState<{ delta: number; pct: number; spark: number[] } | null>(null)

  // Globe rotation state — stored in refs for non-React render loop access
  const rotationRef = useRef<[number, number]>([30, -20]) // [lambda, phi] starting view
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<[number, number]>([0, 0])
  const rotStartRef = useRef<[number, number]>([0, 0])

  // Hover state — cursor position (canvas-local px) + currently highlighted country
  const mouseRef = useRef<{ x: number; y: number } | null>(null)
  const hoveredFeatureRef = useRef<any>(null)
  // Set only under prefers-reduced-motion, where there is no rAF loop to pick
  // up ref changes: pointer handlers call it to repaint the one static frame.
  // Stays null in normal mode, so calling it there is a no-op.
  const redrawRef = useRef<(() => void) | null>(null)

  // Fetch real attacker geolocation + category mix to drive the map.
  useEffect(() => {
    let cancelled = false

    fetch(getBaseUrl() + 'geo.json?_=' + Date.now())
      .then(r => r.json())
      .then((geo: { countries?: Record<string, number> }) => {
        if (cancelled || !geo?.countries) return
        const items: { coords: [number, number]; cc: string }[] = []
        const cumulative: number[] = []
        let total = 0
        const attackersList: {cc: string, count: number}[] = []
        
        for (const [cc, count] of Object.entries(geo.countries) as [string, number][]) {
          const place = COUNTRY_COORDS[cc]
          if (!place || count <= 0) continue
          total += count
          items.push({ coords: place.coords, cc })
          cumulative.push(total)
          attackersList.push({ cc, count })
        }
        if (items.length > 0) geoRef.current = { items, cumulative, total }
        
        if (total > 0) {
          attackersList.sort((a, b) => b.count - a.count)
          setTopAttackers(attackersList.slice(0, 5).map(a => ({
            cc: a.cc,
            name: COUNTRY_COORDS[a.cc]?.name || a.cc,
            count: a.count,
            pct: (a.count / total) * 100
          })))
        }
      })
      .catch(() => { /* keep CITIES fallback */ })

    fetch(getBaseUrl() + 'stats.json?_=' + Date.now())
      .then(r => r.json())
      .then((data: { category_counts?: Record<string, number>; total_unique_ips?: number; active_feeds?: number; last_updated?: string }) => {
        if (cancelled || !data?.category_counts) return
        const catTotal = Object.values(data.category_counts).reduce((s, n) => s + (n > 0 ? n : 0), 0)
        setStats({
          total: data.total_unique_ips ?? catTotal,
          cats: data.category_counts,
          feeds: data.active_feeds ?? 0,
          updated: data.last_updated ?? '',
        })
      })
      .catch(() => { /* HUD analytics strip stays hidden */ })

    // Daily history → real "last 24h" delta + 14-day trend sparkline.
    fetch(getBaseUrl() + 'history.json?_=' + Date.now())
      .then(r => r.json())
      .then((hist: Array<{ total_unique_ips?: number }>) => {
        if (cancelled || !Array.isArray(hist)) return
        const totals = hist.map(h => h.total_unique_ips ?? 0).filter(n => n > 0)
        if (totals.length < 2) return
        const today = totals[totals.length - 1]
        const prev = totals[totals.length - 2]
        const delta = today - prev
        const pct = prev > 0 ? (delta / prev) * 100 : 0
        setTrend({ delta, pct, spark: totals.slice(-14) })
      })
      .catch(() => { /* no trend strip */ })

    return () => { cancelled = true }
  }, [])

  // ─── Drag-to-rotate handlers (pointer events on the canvas) ───
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true
    dragStartRef.current = [e.clientX, e.clientY]
    rotStartRef.current = [...rotationRef.current]
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch (err) {}
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Always track cursor position (canvas-local px) so the render loop can
    // hit-test which country sits under the pointer.
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      // The canvas is CSS-transformed (rotateX + scale + translateY under a
      // perspective parent), so getBoundingClientRect() is the *transformed*
      // box while the projection hit-test expects the canvas's internal pixel
      // space. Normalize the pointer by the on-screen rect, then rescale to the
      // untransformed layout size so screen px → canvas px. This removes the
      // scale(1.15)/translate offset that made the highlight miss the cursor.
      const W = canvas.clientWidth || rect.width
      const H = canvas.clientHeight || rect.height
      mouseRef.current = {
        x: ((e.clientX - rect.left) / rect.width) * W,
        y: ((e.clientY - rect.top) / rect.height) * H,
      }
    }
    if (!isDraggingRef.current) { redrawRef.current?.(); return }
    const dx = e.clientX - dragStartRef.current[0]
    const dy = e.clientY - dragStartRef.current[1]
    const sensitivity = 0.4
    rotationRef.current = [
      rotStartRef.current[0] + dx * sensitivity,
      Math.max(-80, Math.min(80, rotStartRef.current[1] + dy * sensitivity)),
    ]
    redrawRef.current?.()
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch (err) {}
  }, [])

  const onPointerLeave = useCallback(() => {
    // Clear hover so the highlight + tooltip disappear when the cursor leaves.
    mouseRef.current = null
    isDraggingRef.current = false
    redrawRef.current?.()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let attacks: Attack[] = []
    let explosions: Explosion[] = []
    let countryHits: CountryHit[] = []
    let width = 0
    let height = 0

    // Honour prefers-reduced-motion. A stylesheet cannot reach into a canvas
    // rAF loop, so the map draws a single static frame instead of animating.
    // Drag and hover still repaint, since that motion is user-initiated.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = parent.clientWidth
      height = parent.clientHeight
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      // Resizing clears the bitmap; without a loop nothing would redraw it.
      redrawRef.current?.()
    }

    window.addEventListener('resize', resize)
    resize()

    fetch('https://unpkg.com/world-atlas@2.0.2/countries-110m.json')
      .then(r => r.json())
      .then(world => {
        const land = topojson.feature(world, world.objects.countries) as any
        const countryFeatures = (land.features ?? []) as any[]
        const borders = topojson.mesh(world, world.objects.countries)
        const graticule = d3.geoGraticule().step([15, 15])()

        // Map projection — Equirectangular for flat 2D map effect
        const projection = d3.geoEquirectangular()
          .translate([width / 2, height / 1.7])
          .precision(0.1)

        const path = d3.geoPath().projection(projection)

        // Red attack arcs — Radware structure, ThreatBase brand accent.
        const colors = ['#cf1733', '#e2566c', '#f0768c', '#b3122b']

        const spawnAttack = () => {
          const geoPick = pickWeighted(geoRef.current)
          const srcCoords: [number, number] = geoPick
            ? geoPick.coords
            : CITIES[Math.floor(Math.random() * CITIES.length)].coords as [number, number]

          // Target a victim hub (real) or a random different city (fallback).
          let tgtCoords: [number, number]
          if (geoPick) {
            tgtCoords = TARGET_HUBS[Math.floor(Math.random() * TARGET_HUBS.length)].coords
          } else {
            let t = CITIES[Math.floor(Math.random() * CITIES.length)]
            while (t.coords[0] === srcCoords[0] && t.coords[1] === srcCoords[1]) {
              t = CITIES[Math.floor(Math.random() * CITIES.length)]
            }
            tgtCoords = t.coords as [number, number]
          }

          attacks.push({
            id: Math.random(),
            sourceLonLat: srcCoords,
            targetLonLat: tgtCoords,
            progress: 0,
            speed: 0.003 + Math.random() * 0.004,
            color: colors[Math.floor(Math.random() * colors.length)]
          })
        }

        // With reduced motion the static frame shows the map alone, no arcs
        // frozen mid-flight.
        if (!reduceMotion) for (let i = 0; i < 5; i++) spawnAttack()

        const render = () => {
          // Apply horizontal wrap-around and vertical panning from dragging.
          // Scale is recomputed per-frame so rotate/resize rescale the map.
          projection.scale((width / (2 * Math.PI)) * 1.05)
          projection.rotate([rotationRef.current[0], 0])
          projection.translate([width / 2, height / 1.7 + rotationRef.current[1] * 3])

          ctx.clearRect(0, 0, width, height)

          // ── Map base: cold platinum hairlines on a deep on-brand landmass ──
          // Graticule
          ctx.beginPath()
          path.context(ctx)(graticule as any)
          ctx.lineWidth = 0.6
          ctx.strokeStyle = 'rgba(174, 182, 196, 0.07)'
          ctx.stroke()

          // Filled landmasses — one step above the page surface (#080b12)
          ctx.beginPath()
          path.context(ctx)(land)
          ctx.fillStyle = '#131a26'
          ctx.fill()

          // Country borders
          ctx.beginPath()
          path.context(ctx)(borders as any)
          ctx.lineWidth = 0.5
          ctx.strokeStyle = 'rgba(174, 182, 196, 0.18)'
          ctx.stroke()

          // ── Hover highlight: find + accent the country under the cursor ──
          let hovered: any = null
          if (!isDraggingRef.current && mouseRef.current) {
            const mx = mouseRef.current.x, my = mouseRef.current.y
            const inv = projection.invert ? projection.invert([mx, my]) : null
            if (inv) {
              for (const f of countryFeatures) {
                if (d3.geoContains(f, inv as [number, number])) { hovered = f; break }
              }
            }
          }
          hoveredFeatureRef.current = hovered

          if (hovered) {
            ctx.beginPath()
            path.context(ctx)(hovered)
            ctx.fillStyle = 'rgba(207, 23, 51, 0.16)'
            ctx.fill()
            ctx.lineWidth = 1.2
            ctx.strokeStyle = 'rgba(226, 86, 108, 0.85)'
            ctx.shadowBlur = 8
            ctx.shadowColor = 'rgba(207, 23, 51, 0.45)'
            ctx.stroke()
            ctx.shadowBlur = 0

            if (mouseRef.current) {
              const name = (hovered.properties && hovered.properties.name) || 'Unknown'
              const mx = mouseRef.current.x
              const my = mouseRef.current.y

              ctx.font = '600 11px monospace'
              const textWidth = ctx.measureText(name).width

              // Tooltip background
              ctx.fillStyle = 'rgba(10, 14, 23, 0.9)'
              ctx.beginPath()
              ctx.roundRect(mx + 14, my + 14, textWidth + 16, 24, 4)
              ctx.fill()

              // Tooltip border
              ctx.strokeStyle = 'rgba(207, 23, 51, 0.38)'
              ctx.lineWidth = 1
              ctx.stroke()

              // Tooltip text
              ctx.fillStyle = '#f1f5f9'
              ctx.fillText(name, mx + 22, my + 30)
            }
          }

          // ── Country impact flashes: the whole hit country lights up, then fades ──
          for (let i = countryHits.length - 1; i >= 0; i--) {
            const h = countryHits[i]
            h.progress += 0.014
            if (h.progress >= 1) { countryHits.splice(i, 1); continue }
            // Fast ramp to full, then a slow ease-out fade.
            const intensity = h.progress < 0.12
              ? h.progress / 0.12
              : 1 - ((h.progress - 0.12) / 0.88)
            const opacity = Math.max(0, intensity)
            const rgb = hexToRgb(h.color)

            ctx.beginPath()
            path.context(ctx)(h.feature)
            ctx.fillStyle = `rgba(${rgb}, ${opacity * 0.45})`
            ctx.fill()
            ctx.lineWidth = 1.1
            ctx.strokeStyle = `rgba(${rgb}, ${opacity * 0.95})`
            ctx.shadowBlur = 12 * opacity
            ctx.shadowColor = h.color
            ctx.stroke()
            ctx.shadowBlur = 0
          }

          // ── Spawn new attacks ──
          if (!reduceMotion && Math.random() < 0.03 && attacks.length < 15) {
            spawnAttack()
          }

          // ── Render attack arcs (great-circle arcs on the globe) ──
          ctx.globalCompositeOperation = 'screen'

          for (let i = attacks.length - 1; i >= 0; i--) {
            const a = attacks[i]
            a.progress += a.speed

            if (a.progress >= 1) {
              explosions.push({ lonLat: a.targetLonLat, progress: 0, color: a.color })
              // Light up the whole country that was hit, then let it fade.
              const hitFeature = countryFeatures.find(f => d3.geoContains(f, a.targetLonLat))
              if (hitFeature) {
                const existing = countryHits.find(h => h.feature === hitFeature)
                if (existing) { existing.progress = 0; existing.color = a.color }
                else countryHits.push({ feature: hitFeature, progress: 0, color: a.color })
              }
              attacks.splice(i, 1)
              continue
            }

            const tailLength = 0.15
            const segments = 20

            for (let j = 0; j < segments; j++) {
              const pointT = a.progress - (tailLength * (j / segments))
              if (pointT < 0 || pointT > 1) continue

              // Get point along great-circle arc
              const arcPoint = interpolateGreatArc(a.sourceLonLat, a.targetLonLat, pointT)

              // Flat map: all points are visible

              const projected = projection(arcPoint)
              if (!projected) continue

              // Lift arcs off the surface for 3D effect
              const distLonLat = d3.geoDistance(a.sourceLonLat, a.targetLonLat)
              const maxArcHeight = Math.max(25, distLonLat * 180)
              const arcHeight = Math.sin(pointT * Math.PI) * maxArcHeight
              const py = projected[1] - arcHeight

              const opacity = 1 - (j / segments)
              const radius = 2.5 * opacity

              ctx.beginPath()
              ctx.arc(projected[0], py, radius, 0, Math.PI * 2)
              ctx.fillStyle = `rgba(${hexToRgb(a.color)}, ${opacity})`

              if (j === 0) {
                ctx.shadowBlur = 15
                ctx.shadowColor = a.color
              } else {
                ctx.shadowBlur = 0
              }

              ctx.fill()
              ctx.shadowBlur = 0
            }
          }

          // ── Explosions (impact flares on the globe surface) ──
          for (let i = explosions.length - 1; i >= 0; i--) {
            const e = explosions[i]
            e.progress += 0.025

            if (e.progress >= 1) {
              explosions.splice(i, 1)
              continue
            }

            // Flat map: all explosions are visible

            const projected = projection(e.lonLat)
            if (!projected) continue

            const radius = e.progress * 22
            const opacity = 1 - Math.pow(e.progress, 1.5)

            ctx.beginPath()
            ctx.arc(projected[0], projected[1], radius, 0, Math.PI * 2)
            ctx.strokeStyle = `rgba(${hexToRgb(e.color)}, ${opacity})`
            ctx.lineWidth = 1.5
            ctx.shadowBlur = 12
            ctx.shadowColor = e.color
            ctx.stroke()

            ctx.beginPath()
            ctx.arc(projected[0], projected[1], radius * 0.4, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(${hexToRgb(e.color)}, ${opacity * 0.6})`
            ctx.fill()

            ctx.shadowBlur = 0
          }

          ctx.globalCompositeOperation = 'source-over'
          if (!reduceMotion) animationFrameId = requestAnimationFrame(render)
        }

        render()
        // Only under reduced motion: render() no longer self-schedules, so the
        // pointer handlers and resize become the repaint triggers.
        if (reduceMotion) redrawRef.current = render
      })
      .catch(err => {
        console.error('Failed to load map data:', err)
      })

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationFrameId)
      redrawRef.current = null
    }
  }, [])

  // Attack-type breakdown (real category counts), sorted desc.
  const breakdown = stats
    ? (() => {
      const entries = Object.entries(stats.cats)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
      const sum = entries.reduce((s, [, n]) => s + n, 0) || 1
      return { entries, sum }
    })()
    : null

  // Sparkline geometry for the trend chart.
  const SW = 104, SH = 30
  const sparkD = trend ? sparkLine(trend.spark, SW, SH) : ''
  const sparkLastY = trend && trend.spark.length > 1
    ? (() => {
      const v = trend.spark
      const min = Math.min(...v), max = Math.max(...v)
      const span = max - min || 1
      return SH - ((v[v.length - 1] - min) / span) * SH
    })()
    : 0

  return (
    <>
      <div className="absolute inset-0 z-0 overflow-hidden" style={{ perspective: '1200px' }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full bg-transparent cursor-grab active:cursor-grabbing"
          style={{ 
            touchAction: 'pan-y',
            transform: 'rotateX(20deg) scale(1.15) translateY(-5%)',
            transformOrigin: 'center center'
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
        />
      </div>

      {/* Live CTI HUD — premium cold-luxury threat console, bottom-right of the hero */}
      {stats && (
        <div className="hidden lg:flex flex-col absolute bottom-6 right-6 z-10 w-[23rem] max-h-[400px] overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0a0e17]/75 backdrop-blur-2xl shadow-glass-lux pointer-events-none">
          {/* Platinum top hairline + faint ruby corner glow */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-platinum-300/25 to-transparent" />
          <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-red-500/10 blur-3xl" />

          {/* Header */}
          <div className="relative flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 animate-ping motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(207,23,51,0.9)]" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-platinum-200">
              Live Threat Intel
            </span>
            {stats && (
              <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-slate-500">
                <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                {stats.feeds} FEEDS
              </span>
            )}
          </div>

          {/* Last-24h analytics strip */}
          {stats && (
            <div className="relative border-b border-white/[0.06] px-4 py-3.5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-[28px] font-bold leading-none tracking-tight text-white tabular-nums drop-shadow-[0_2px_10px_rgba(207,23,51,0.18)]">
                    {fmt(stats.total)}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[8.5px] font-semibold uppercase tracking-[0.2em] text-platinum-400">Active Threats</span>
                    {trend && (
                      <span className="flex items-center gap-0.5 font-mono text-[10px] font-semibold tabular-nums text-red-400">
                        <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 stroke-current" fill="none" strokeWidth="1.7" aria-hidden="true">
                          <path d="M5 8V2.2M2.2 5 5 2.2 7.8 5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {fmt(trend.delta)}
                        <span className="ml-0.5 text-slate-600">·24h</span>
                      </span>
                    )}
                  </div>
                </div>
                {trend && sparkD && (
                  <div className="flex flex-col items-end">
                    <svg viewBox={`0 0 ${SW} ${SH}`} className="h-[30px] w-[104px] overflow-visible" aria-hidden="true">
                      <defs>
                        <linearGradient id="tb-spark" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#cf1733" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="#cf1733" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={`${sparkD} L${SW} ${SH} L0 ${SH} Z`} fill="url(#tb-spark)" />
                      <path d={sparkD} fill="none" stroke="#e2566c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx={SW} cy={sparkLastY} r="2.2" fill="#f0768c" />
                    </svg>
                    <span className="mt-1 text-[8px] font-medium uppercase tracking-[0.18em] text-slate-600">14-day trend</span>
                  </div>
                )}
              </div>

              {/* Attack-type breakdown bar + legend */}
              {breakdown && (
                <>
                  <div className="mt-3.5 flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-white/[0.05]">
                    {breakdown.entries.map(([cat, n], i) => (
                      <span
                        key={cat}
                        title={`${cat} · ${((n / breakdown.sum) * 100).toFixed(1)}%`}
                        style={{ width: `${(n / breakdown.sum) * 100}%`, backgroundColor: rampAt(i) }}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {breakdown.entries.slice(0, 3).map(([cat, n], i) => (
                      <span key={cat} className="flex items-center gap-1.5 text-[9px] font-medium text-slate-400">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: rampAt(i) }} />
                        {cat}
                        <span className="tabular-nums text-slate-500">{((n / breakdown.sum) * 100).toFixed(0)}%</span>
                      </span>
                    ))}
                    {breakdown.entries.length > 3 && (
                      <span className="text-[9px] font-medium text-slate-600">+{breakdown.entries.length - 3} more</span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Top Attackers sub-header */}
          <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
            <span className="text-[8.5px] font-semibold uppercase tracking-[0.22em] text-platinum-400">Top Attackers</span>
            {stats?.updated && (
              <span className="font-mono text-[9px] tabular-nums text-slate-600">{timeAgo(stats.updated)}</span>
            )}
          </div>

          {/* Top Attackers List */}
          <div className="relative flex-1 overflow-hidden pb-5">
            <div className="flex flex-col px-4 space-y-3.5 pt-2">
              {topAttackers.length === 0 && (
                <div className="py-2 text-[11px] text-slate-600">Loading top attackers…</div>
              )}
              {topAttackers.map((a) => (
                <div key={a.cc} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Flag cc={a.cc} />
                      <span className="text-[11px] font-medium text-slate-200">{a.name}</span>
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-slate-400">{Math.round(a.pct)} %</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-white/[0.05]">
                    <div className="h-full bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)] transition-all duration-1000" style={{ width: `${Math.max(2, a.pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </>
  )
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ?
    `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '255, 255, 255';
}
