/**
 * /mcp — Threatbase MCP server (Model Context Protocol over Streamable HTTP).
 *
 * Lets AI agents (Claude Desktop, Cursor, Hermes, any MCP client) call
 * Threatbase directly: scan one IOC or a batch, and read feed health/stats.
 *
 * Design notes:
 * - STATELESS: no sessionIdGenerator. Each POST builds a fresh McpServer +
 *   transport pair, handles one JSON-RPC turn, and is discarded. That is the
 *   supported shape for serverless fetch hosts (Hono docs show the same) and
 *   avoids pinning sessions to a Cloudflare isolate. Clients may send an
 *   `initialize` per request; the SDK answers inline. SSE GET streaming and
 *   DELETE are refused with 405 per spec.
 * - Lives OUTSIDE /api/v1, so the x-api-key middleware does not apply.
 *   Free-tier abuse is bounded instead by a per-IP KV counter (same pattern
 *   as the v1 middleware) sized for chat-style agents: 300 requests/day/IP.
 * - Tools are thin wrappers over the same logic as POST /api/v1/scan, so
 *   MCP and REST can never disagree about a verdict.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { validateTypedIndicator, BATCH_SCAN_TYPES } from '../../src/scanner'
import { scanIndicatorIntel } from '../api/_intel'
import { json, corsHeaders, ensureAbsoluteFetch } from '../api/_common'

/** Per-IP MCP request budget per day. Chat agents fire 5–15 lookups per
 *  conversation; 300 covers heavy use while a scraper still can't mine the
 *  whole corpus. Batch scan is charged at ceil(items/20) units. */
const MCP_DAILY_LIMIT = 300

const BATCH_MAX = 100
const RAW_BASE = 'https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/'

const TOOLS = [
  {
    name: 'scan_ioc',
    description:
      'Check a single threat indicator (IPv4/IPv6, domain, URL, or MD5/SHA1/SHA256 hash) against the Threatbase aggregated OSINT blocklist (54 feeds, deduplicated daily). Returns verdict (malicious / clean / disputed / invalid), risk score, how many feeds listed it, tags, and sources. Use this when an analyst or a tool asks "is this IP/domain/hash malicious?".',
    inputSchema: {
      type: 'object' as const,
      properties: {
        indicator: {
          type: 'string',
          description: 'The indicator to check, e.g. "45.61.137.7", "evil.example.com", "http://x.y/a", or a file hash. CIDRs and defanged forms (hxxp, [.]) are accepted.',
        },
      },
      required: ['indicator'],
    },
  },
  {
    name: 'batch_scan',
    description:
      `Scan up to ${BATCH_MAX} typed indicators in one call. Each item is {type, value} with type one of: ${BATCH_SCAN_TYPES.join(', ')}. Returns one result per submitted indicator, including per-item errors.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        indicators: {
          type: 'array',
          maxItems: BATCH_MAX,
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: [...BATCH_SCAN_TYPES] },
              value: { type: 'string' },
            },
            required: ['type', 'value'],
          },
        },
      },
      required: ['indicators'],
    },
  },
  {
    name: 'feed_stats',
    description:
      'Get Threatbase corpus health: unique IOC counts by type (IPs, IPv6, CIDRs, domains, hashes, URLs), number of active feeds, category breakdown, and last-sync metadata. Use to describe coverage or check freshness.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
]

const scanShape = (r: any) => ({
  type: r.type ?? null,
  value: r.value ?? null,
  status: r.status,
  malicious: r.malicious,
  riskScore: r.riskScore,
  feedCount: r.feedCount,
  tags: r.tags,
  sources: r.sources,
  ...(r.matchedCidr ? { matchedCidr: r.matchedCidr } : {}),
  ...(r.relatedMatch ? { relatedMatch: r.relatedMatch } : {}),
  ...(r.disputeCount ? { disputeCount: r.disputeCount } : {}),
})

/** One scan result, mirroring POST /api/v1/scan single-item semantics. */
async function scanOne(type: string, value: string) {
  const validated = validateTypedIndicator(type, value)
  if ('error' in validated) {
    return { type, value, malicious: false, status: 'error', error: validated.error }
  }
  const r: any = await scanIndicatorIntel(validated.value)
  return scanShape({
    type: type.trim().toLowerCase(),
    value: validated.value,
    status: r.isMalicious ? 'malicious' : r.isDisputed ? 'disputed' : 'clean',
    ...r,
    malicious: r.isMalicious,
  })
}

async function handleToolCall(name: string, args: any) {
  if (name === 'scan_ioc') {
    const parsed = z.object({ indicator: z.string().min(1).max(2048) }).safeParse(args)
    if (!parsed.success) return { isError: true, content: [{ type: 'text', text: 'scan_ioc needs {indicator: string}' }] }
    const r: any = await scanIndicatorIntel(parsed.data.indicator)
    const verdict = r.isMalicious ? 'MALICIOUS' : r.isDisputed ? 'DISPUTED' : r.type === 'invalid' ? 'INVALID INPUT' : 'clean'
    return {
      content: [{ type: 'text', text: `Threatbase verdict: ${verdict} (risk: ${r.riskScore}, feeds: ${r.feedCount}${r.tags?.length ? `, tags: ${r.tags.join(', ')}` : ''})` }],
      structuredContent: { ...r, verdict },
    }
  }

  if (name === 'batch_scan') {
    const parsed = z.object({
      indicators: z.array(z.object({ type: z.enum(BATCH_SCAN_TYPES), value: z.string().min(1).max(2048) })).min(1).max(BATCH_MAX),
    }).safeParse(args)
    if (!parsed.success) return { isError: true, content: [{ type: 'text', text: `batch_scan needs {indicators:[{type,value}]} (1-${BATCH_MAX}, types: ${BATCH_SCAN_TYPES.join('|')})` }] }
    // Sequential on purpose — see the same comment in api/v1/scan.ts: the
    // process-wide feed cache makes item N+1 free after item N pays for it.
    const results = []
    for (const ind of parsed.data.indicators) results.push(await scanOne(ind.type, ind.value))
    return {
      content: [{ type: 'text', text: JSON.stringify({ scanned: results.length, results }) }],
    }
  }

  if (name === 'feed_stats') {
    const res = await fetch(`${RAW_BASE}data/stats.json`, { headers: { 'User-Agent': 'threatbase-mcp' } })
    if (!res.ok) return { isError: true, content: [{ type: 'text', text: 'stats.json unavailable right now' }] }
    const stats = await res.json()
    return {
      content: [{ type: 'text', text: JSON.stringify(stats) }],
      structuredContent: stats,
    }
  }

  return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] }
}

/** Build a fresh stateless MCP server for one request. */
function buildServer() {
  const server = new Server(
    { name: 'threatbase', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))
  server.setRequestHandler(CallToolRequestSchema, async (req) => handleToolCall(req.params.name, req.params.arguments ?? {}))
  return server
}

const MCP_PATH = '/mcp'

export const onRequest = async (context: any) => {
  const { request, env } = context
  const path = new URL(request.url).pathname

  // Only /mcp itself is the endpoint; everything deeper is 404 (avoids the
  // catch-all silently eating future /mcp/... routes).
  if (path !== MCP_PATH) {
    return new Response('Not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, 'GET, POST, OPTIONS') })
  }

  // Stateless host: SSE streams (GET) and session teardown (DELETE) are not
  // supported — clients must POST JSON-RPC. 405 is the spec-correct answer.
  if (request.method !== 'POST') {
    if (request.method === 'GET') {
      return json({
        name: 'Threatbase MCP server',
        transport: 'streamable-http',
        endpoint: '/mcp',
        usage: 'POST JSON-RPC 2.0 messages here (Streamable HTTP). Tools: scan_ioc, batch_scan, feed_stats. GET SSE streaming not supported on this stateless host.',
        docs: 'https://modelcontextprotocol.io',
      }, 200, request)
    }
    return new Response('Method not allowed — POST JSON-RPC to /mcp', {
      status: 405,
      headers: { Allow: 'GET, POST, OPTIONS', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // Relative feed fetches inside scanIndicatorLogic need an origin — see
  // ensureAbsoluteFetch above. Must run before the first scan on this isolate.
  ensureAbsoluteFetch()

  // Per-IP budget (KV is eventually consistent — coarse gate, same
  // read-modify-write tradeoff as the v1 middleware).
  const kv = env.IOC_CACHE
  if (kv) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    const today = new Date().toISOString().split('T')[0]
    try {
      const key = `mcp/${today}/${ip}`
      const cur = await kv.get(key)
      const count = cur ? parseInt(cur, 10) : 0
      if (count >= MCP_DAILY_LIMIT) {
        return json({ error: 'MCP daily limit reached for this IP. For heavier use see /api pricing.' }, 429, request)
      }
      let body: any = null
      try { body = await request.clone().json() } catch { /* handled by transport */ }
      const batchUnits = body?.params?.name === 'batch_scan'
        ? Math.ceil(Math.min((body?.params?.arguments?.indicators?.length ?? 1), BATCH_MAX) / 20)
        : 1
      await kv.put(key, String(count + batchUnits), { expirationTtl: 86400 })
    } catch (err) {
      console.error('mcp rate gate failed (allowing request):', err)
    }
  }

  const server = buildServer()
  // Stateless: no sessionIdGenerator (SDK disables session mgmt), and
  // enableJsonResponse returns plain application/json instead of an SSE
  // stream — the right mode for a serverless host with no push channel.
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    // Stateless: nothing to keep — close both ends so the isolate sheds
    // per-request overhead even if the client abandons the stream.
    try { await transport.close() } catch { /* already closed */ }
    try { await server.close() } catch { /* already closed */ }
  }
}
