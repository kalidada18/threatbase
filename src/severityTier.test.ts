import { describe, it, expect } from 'vitest'
import { categoryTier, getCategoryIconPath, TIER_CHIP, TIER_TEXT, TIER_ACCENT, type SeverityTier } from './utils'

/**
 * Category chips used to pick colour per category, which is how purple, blue,
 * and cyan kept leaking back onto the page. Colour now comes from severity, so
 * these are the two things worth guarding: the label -> tier mapping stays
 * right, and no tier class string reintroduces an off-palette hue.
 */
describe('categoryTier', () => {
  // The exact labels normalizeTags() emits are what reaches the chips.
  const cases: Array<[string, SeverityTier]> = [
    ['Malware', 'critical'],
    ['Exploit', 'critical'],
    ['Zero-Day', 'critical'],
    ['Command & Control', 'critical'],
    ['Botnet', 'critical'],
    ['Mirai Botnet', 'critical'],
    ['Brute-Force', 'high'],
    ['DDoS', 'high'],
    ['Phishing', 'medium'],
    ['Credential Harvesting', 'medium'],
    ['Spam', 'medium'],
    ['Port Scan', 'low'],
    ['Scanner', 'low'],
    ['SSH', 'unknown'],
    ['Web3', 'unknown'],
  ]

  it.each(cases)('rates %s as %s', (label, tier) => {
    expect(categoryTier(label)).toBe(tier)
  })

  it('falls back to unknown for missing input', () => {
    expect(categoryTier(null)).toBe('unknown')
    expect(categoryTier(undefined)).toBe('unknown')
    expect(categoryTier('')).toBe('unknown')
  })
})

/**
 * Severity and icon now come from one CATEGORY_RULES table. Same labels as
 * above: if a rule row is reordered or its keywords edited, exactly one of
 * these two suites goes red, which is the whole point of merging them.
 */
describe('getCategoryIconPath', () => {
  const icons: Array<[string, string]> = [
    ['Malware', 'malware.png'],
    ['Exploit', 'malware.png'],
    ['Zero-Day', 'malware.png'],
    ['Command & Control', 'botnet.png'],
    ['Botnet', 'botnet.png'],
    ['Mirai Botnet', 'botnet.png'],
    ['Brute-Force', 'bruteforce.png'],
    ['DDoS', 'DDoS.png'],
    ['Phishing', 'phishing.png'],
    ['Credential Harvesting', 'phishing.png'],
    ['Spam', 'spam.png'],
    ['Port Scan', 'other.png'],
    ['SSH', 'other.png'],
  ]

  it.each(icons)('draws %s with %s', (label, icon) => {
    expect(getCategoryIconPath(label)).toContain(`img/${icon}`)
  })

  it('falls back to other.png for missing input', () => {
    expect(getCategoryIconPath(null)).toContain('img/other.png')
    expect(getCategoryIconPath('')).toContain('img/other.png')
  })
})

describe('tier palette lock', () => {
  const tiers: SeverityTier[] = ['critical', 'high', 'medium', 'low', 'unknown']

  it('covers every tier in all three class maps', () => {
    for (const t of tiers) {
      expect(TIER_CHIP[t]).toBeTruthy()
      expect(TIER_TEXT[t]).toBeTruthy()
      expect(TIER_ACCENT[t]).toMatchObject({
        bg: expect.any(String),
        border: expect.any(String),
        card: expect.any(String),
      })
    }
  })

  it('uses no off-palette hue', () => {
    const banned = /(purple|violet|fuchsia|indigo|blue|sky|cyan|teal|green|lime|pink)-/
    const all = [
      ...Object.values(TIER_CHIP),
      ...Object.values(TIER_TEXT),
      ...Object.values(TIER_ACCENT).flatMap((a) => Object.values(a)),
    ]
    for (const cls of all) {
      expect(cls).not.toMatch(banned)
    }
  })
})
