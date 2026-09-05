"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/area-chart";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import React, { useEffect, useState, useMemo } from "react";
import { getBaseUrl, fmt, INDICATOR_ACCENT, feedPath } from "../../utils";

type SeriesKey = "ipv4" | "ipv6" | "cidrs" | "domains" | "hashes" | "urls";

const chartConfig = {
  ipv4: { label: "IPv4", color: INDICATOR_ACCENT.ip },
  domains: { label: "Domains", color: INDICATOR_ACCENT.domain },
  hashes: { label: "Hashes", color: INDICATOR_ACCENT.hash },
  urls: { label: "URLs", color: INDICATOR_ACCENT.url },
  cidrs: { label: "CIDRs", color: INDICATOR_ACCENT.cidr },
  ipv6: { label: "IPv6", color: INDICATOR_ACCENT.ipv6 },
} satisfies ChartConfig;

const SERIES_ORDER: SeriesKey[] = ["ipv4", "domains", "hashes", "urls", "cidrs", "ipv6"];

// How often to poll for fresh history while the dashboard is open.
const HISTORY_REFRESH_MS = 5 * 60 * 1000

const HISTORY_FIELDS = [
  'date', 'total_unique_ips', 'total_unique_ipv6', 'total_unique_cidrs',
  'total_unique_domains', 'total_unique_hashes', 'total_unique_urls',
] as const

// True when the freshly fetched series differs from what we already render
// (a new day was appended, or the latest day's counts changed).
function historyChanged(prev: any[], next: any[]): boolean {
  if (prev.length !== next.length) return true
  if (next.length === 0) return false
  const a = prev[prev.length - 1], b = next[next.length - 1]
  return HISTORY_FIELDS.some((k) => a?.[k] !== b?.[k])
}

export default function AnimatedHighlightedAreaChart({ feedVersion }: { feedVersion?: any }) {
  const [history, setHistory] = useState<any[]>([]);
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());

  useEffect(() => {
    const GITHUB_RAW = getBaseUrl()
    let cancelled = false

    const apply = (data: any) => {
      if (cancelled || !Array.isArray(data) || data.length === 0) return
      // Only swap state when the data actually moved, so the chart animation
      // doesn't restart on every poll.
      setHistory((prev) => (historyChanged(prev, data) ? data : prev))
    }

    const loadHistory = async () => {
      const bust = 'v=' + (feedVersion || '') + '&_=' + Date.now()
      try {
        const r = await fetch(GITHUB_RAW + feedPath('history.json') + '?' + bust)
        if (!r.ok) throw new Error('HTTP ' + r.status)
        apply(await r.json())
      } catch (err: any) {
        console.error('history.json unavailable on GitHub Raw:', err?.message)
      }
    }

    loadHistory()
    const intervalId = setInterval(loadHistory, HISTORY_REFRESH_MS)
    // Refresh immediately when the user returns to the tab.
    const onVisible = () => { if (document.visibilityState === 'visible') loadHistory() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [feedVersion])

  const chartData = useMemo(() => history.length > 0 ? history.map((h) => {
    const d = new Date(h.date)
    return {
      dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      ipv4: h.total_unique_ips || 0,
      ipv6: h.total_unique_ipv6 || 0,
      cidrs: h.total_unique_cidrs || 0,
      domains: h.total_unique_domains || 0,
      hashes: h.total_unique_hashes || 0,
      urls: h.total_unique_urls || 0,
    }
  }) : [], [history])

  // Latest snapshot totals + period delta across all visible categories.
  const { latestTotal, periodDelta, periodPct, rangeLabel, latestByKey } = useMemo(() => {
    if (chartData.length === 0) {
      return { latestTotal: 0, periodDelta: 0, periodPct: 0, rangeLabel: '', latestByKey: {} as Record<SeriesKey, number> }
    }
    const last = chartData[chartData.length - 1]
    const first = chartData[0]
    const sumRow = (row: any) => SERIES_ORDER.reduce((s, k) => s + (row[k] || 0), 0)
    const lt = sumRow(last)
    const ft = sumRow(first)
    const byKey = {} as Record<SeriesKey, number>
    SERIES_ORDER.forEach((k) => { byKey[k] = last[k] || 0 })
    return {
      latestTotal: lt,
      periodDelta: lt - ft,
      periodPct: ft > 0 ? ((lt - ft) / ft) * 100 : 0,
      rangeLabel: `${first.dateLabel} to ${last.dateLabel}`,
      latestByKey: byKey,
    }
  }, [chartData])

  const toggle = (k: SeriesKey) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      // Never allow hiding every series.
      if (next.size === SERIES_ORDER.length) next.delete(k)
      return next
    })
  }

  const up = periodDelta > 0
  const flat = periodDelta === 0
  const TrendIcon = flat ? Minus : up ? TrendingUp : TrendingDown
  const trendColor = flat ? 'text-slate-400' : up ? 'text-destructive' : 'text-primary'

  const loading = chartData.length === 0

  return (
    <Card className="rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] relative overflow-hidden group h-full flex flex-col">
      <div className="absolute top-0 inset-x-0 h-[2px] w-full bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-white/[0.06]">
          <div>
            <h3 className="text-xl font-extrabold text-white tracking-tight">Daily volume by category</h3>
            <p className="text-slate-400 font-medium text-sm mt-1">
              Six indicator types{rangeLabel ? `, ${rangeLabel}` : ''}
            </p>
          </div>

          {/* Headline total + period delta */}
          <div className="shrink-0 text-left sm:text-right">
            <div className="text-2xl md:text-3xl font-black text-white tabular-nums tracking-tight leading-none">
              {loading
                ? <span className="inline-block h-[0.75em] w-[7ch] rounded-md bg-white/[0.07] animate-pulse align-middle" role="status" aria-label="Loading total" />
                : fmt(latestTotal)}
            </div>
            <div className={`mt-1.5 inline-flex items-center gap-1 text-xs font-bold tabular-nums ${trendColor}`}>
              <TrendIcon size={14} strokeWidth={2.5} />
              {loading ? '' : `${up ? '+' : ''}${fmt(periodDelta)} (${periodPct > 0 ? '+' : ''}${periodPct.toFixed(1)}%)`}
              <span className="text-slate-500 font-medium ml-0.5">this period</span>
            </div>
          </div>
        </div>

        {/* Interactive legend */}
        <div className="px-6 pt-4 flex flex-wrap gap-2">
          {SERIES_ORDER.map((k) => {
            const cfg = chartConfig[k]
            const off = hidden.has(k)
            return (
              <button
                key={k}
                onClick={() => toggle(k)}
                aria-pressed={!off}
                className={`group/chip inline-flex items-center gap-2 pl-2 pr-2.5 py-2.5 md:py-1.5 rounded-xl border text-xs font-bold transition-all ${
                  off
                    ? 'border-white/5 bg-white/[0.02] text-slate-600'
                    : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.07]'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full transition-transform"
                  style={{ backgroundColor: off ? '#475569' : cfg.color, boxShadow: off ? 'none' : `0 0 8px ${cfg.color}80` }}
                />
                {cfg.label}
                <span className={`tabular-nums font-semibold ${off ? 'text-slate-700' : 'text-slate-400'}`}>
                  {loading ? '' : fmt(latestByKey[k] || 0)}
                </span>
              </button>
            )
          })}
        </div>

        {/* Chart */}
        <CardContent className="flex-1 pt-4">
          {loading ? (
            /* Skeleton in the shape of the chart, not a spinner (tasteskill §4.5) */
            <div className="w-full h-72 relative" role="status" aria-label="Loading trend data">
              <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-px w-full bg-white/[0.05]" />
                ))}
              </div>
              <div
                className="absolute inset-x-0 bottom-6 h-2/3 animate-pulse bg-gradient-to-t from-white/[0.06] to-transparent"
                style={{ clipPath: 'polygon(0 78%, 14% 62%, 28% 68%, 43% 44%, 57% 50%, 71% 26%, 86% 33%, 100% 12%, 100% 100%, 0 100%)' }}
              />
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="w-full h-72">
              <AreaChart accessibilityLayer data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="dateLabel"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  width={46}
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
                    if (value >= 1000) return `${(value / 1000).toFixed(0)}k`
                    return value
                  }}
                />
                <ChartTooltip cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }} content={<ChartTooltipContent />} />
                <defs>
                  {SERIES_ORDER.map((k) => (
                    <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartConfig[k].color} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={chartConfig[k].color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                {SERIES_ORDER.map((k) =>
                  hidden.has(k) ? null : (
                    <Area
                      key={k}
                      dataKey={k}
                      type="monotone"
                      fill={`url(#grad-${k})`}
                      fillOpacity={1}
                      stroke={chartConfig[k].color}
                      strokeWidth={2}
                      activeDot={{ r: 3.5, strokeWidth: 0 }}
                    />
                  )
                )}
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </div>
    </Card>
  );
}
