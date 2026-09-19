import { describe, it, expect } from 'vitest'
import { describeUserAgent } from './userAgent'

// Real-world user-agent strings captured from current browsers. The point of
// pinning the exact strings is that the specific-token-before-generic ordering
// (Edge/Opera/CriOS contain "Chrome"; iPad contains "Safari") is the part most
// likely to regress.
const UA = {
  chromeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  edgeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  firefoxLinux:
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  ipadOs:
    'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.12 Mobile/15E148 Safari/604.1',
  opera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0',
} as const

describe('describeUserAgent', () => {
  it('classifies Chrome on Windows desktop', () => {
    const d = describeUserAgent(UA.chromeWin)
    expect(d.browser).toBe('Chrome')
    expect(d.os).toBe('Windows')
    expect(d.device).toBe('desktop')
    expect(d.label).toBe('Chrome on Windows')
  })

  it('prefers Edge over the Chrome token it also carries', () => {
    const d = describeUserAgent(UA.edgeWin)
    expect(d.browser).toBe('Edge')
    expect(d.os).toBe('Windows')
    expect(d.device).toBe('desktop')
  })

  it('prefers Opera over Chrome', () => {
    expect(describeUserAgent(UA.opera).browser).toBe('Opera')
  })

  it('classifies Safari on macOS as desktop', () => {
    const d = describeUserAgent(UA.safariMac)
    expect(d.browser).toBe('Safari')
    expect(d.os).toBe('macOS')
    expect(d.device).toBe('desktop')
  })

  it('classifies Firefox on Linux', () => {
    const d = describeUserAgent(UA.firefoxLinux)
    expect(d.browser).toBe('Firefox')
    expect(d.os).toBe('Linux')
    expect(d.device).toBe('desktop')
  })

  it('classifies Chrome on Android as mobile', () => {
    const d = describeUserAgent(UA.chromeAndroid)
    expect(d.browser).toBe('Chrome')
    expect(d.os).toBe('Android')
    expect(d.device).toBe('mobile')
  })

  it('classifies Safari on iPhone as mobile iOS', () => {
    const d = describeUserAgent(UA.safariIphone)
    expect(d.browser).toBe('Safari')
    expect(d.os).toBe('iOS')
    expect(d.device).toBe('mobile')
  })

  it('reports iPad as iPadOS tablet', () => {
    const d = describeUserAgent(UA.ipadOs)
    expect(d.os).toBe('iPadOS')
    expect(d.device).toBe('tablet')
  })

  it('reports a Mobile-less Android as a tablet, not a phone', () => {
    expect(describeUserAgent(UA.androidTablet).device).toBe('tablet')
  })

  it('reports iOS Chrome (CriOS) as Chrome, not Safari', () => {
    const d = describeUserAgent(UA.iosChrome)
    expect(d.browser).toBe('Chrome')
    expect(d.device).toBe('mobile')
  })

  it('falls back to the unknown device for null / empty / junk', () => {
    expect(describeUserAgent(null).label).toBe('Unknown device')
    expect(describeUserAgent('').device).toBe('unknown')
    expect(describeUserAgent('totally-not-a-user-agent').browser).toBe('Unknown browser')
  })
})
