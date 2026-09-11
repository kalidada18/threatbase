import { json } from '../_common'
import { proStatus } from '../_pro'

export const onRequestGet = async (context: any) => {
  const { request, env } = context
  const s = await proStatus(request, env)
  if (s === 'pro') return json({ is_pro: true }, 200, request)
  if (s === 'not-pro') return json({ is_pro: false }, 200, request)
  if (s === 'no-auth') return json({ error: 'sign in required' }, 401, request)
  return json({ error: 'pro check unavailable' }, 503, request)
}
