"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/area-chart";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";
import React, { useEffect, useState } from "react";
import { getBaseUrl } from "../../utils";

const animationConfig = {
  glowWidth: 300,
};

const chartConfig = {
  ipv4: {
    label: "IPv4",
    color: "#ef4444",
  },
  domains: {
    label: "Domains",
    color: "#3b82f6",
  },
} satisfies ChartConfig;

export default function AnimatedHighlightedAreaChart({ feedVersion }: { feedVersion?: any }) {
  const [xAxis, setXAxis] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    const RAW = getBaseUrl()
    fetch(RAW + 'history.json?v=' + (feedVersion || Date.now()))
      .then((r) => {
        if (!r.ok) return null
        return r.json()
      })
      .then((data) => {
        if (!data || data.length === 0) return
        setHistory(data)
      })
      .catch((e) => console.warn('history.json unavailable', e))
  }, [feedVersion])

  const chartData = history.length > 0 ? history.map((h) => {
    const d = new Date(h.date)
    return {
      dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      ipv4: h.total_unique_ips || 0,
      domains: h.total_unique_domains || 0,
    }
  }) : []

  return (
    <Card className="rounded-3xl border border-white/10 bg-slate-900/60 backdrop-blur-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] p-2 relative overflow-hidden group">
      <div className="absolute top-0 inset-x-0 h-[2px] w-full bg-gradient-to-r from-transparent via-red-500/50 to-transparent"></div>
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay pointer-events-none"></div>
      
      <div className="relative z-10">
        <CardHeader>
          <CardTitle className="text-xl font-extrabold flex items-center gap-2 text-white tracking-tight">
            Threat Landscape Trends
            <Badge
              variant="outline"
              className="text-emerald-500 bg-emerald-500/10 border-none ml-2"
            >
              <TrendingUp className="h-4 w-4 mr-1" />
              <span>Live Updates</span>
            </Badge>
          </CardTitle>
          <CardDescription className="text-slate-400 font-medium mt-1">
            Tracking malicious IPv4 and Domains activity over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="w-full h-72">
          <AreaChart
            accessibilityLayer
            data={chartData}
            onMouseMove={(e) => setXAxis(e.chartX as number)}
            onMouseLeave={() => setXAxis(null)}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="dateLabel"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fill: "#64748b" }}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <defs>
              <linearGradient
                id="animated-highlighted-mask-grad"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor="transparent" />
                <stop offset="50%" stopColor="white" />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
              <linearGradient
                id="animated-highlighted-grad-ipv4"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor="#ef4444"
                  stopOpacity={0.4}
                />
                <stop
                  offset="95%"
                  stopColor="#ef4444"
                  stopOpacity={0}
                />
              </linearGradient>
              <linearGradient
                id="animated-highlighted-grad-domains"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor="#3b82f6"
                  stopOpacity={0.4}
                />
                <stop
                  offset="95%"
                  stopColor="#3b82f6"
                  stopOpacity={0}
                />
              </linearGradient>
              {xAxis && (
                <mask id="animated-highlighted-mask">
                  <rect
                    x={xAxis - animationConfig.glowWidth / 2}
                    y={0}
                    width={animationConfig.glowWidth}
                    height="100%"
                    fill="url(#animated-highlighted-mask-grad)"
                  />
                </mask>
              )}
            </defs>
            <Area
              dataKey="domains"
              type="natural"
              fill={"url(#animated-highlighted-grad-domains)"}
              fillOpacity={0.4}
              stroke="#3b82f6"
              stackId="a"
              strokeWidth={0.8}
              mask="url(#animated-highlighted-mask)"
            />
            <Area
              dataKey="ipv4"
              type="natural"
              fill={"url(#animated-highlighted-grad-ipv4)"}
              fillOpacity={0.4}
              stroke="#ef4444"
              stackId="a"
              strokeWidth={0.8}
              mask="url(#animated-highlighted-mask)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
      </div>
    </Card>
  );
}
