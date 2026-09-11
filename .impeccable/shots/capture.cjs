const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const dossier = fs.readFileSync(path.join(__dirname, 'dossier.json'), 'utf8')
const BASE = 'http://localhost:5199'
const OUT = __dirname

;(async () => {
  const browser = await chromium.launch()
  const shots = [
    { name: 'empty-1440', w: 1440, h: 900, route: '/investigate', mock: false, wait: 2500 },
    { name: 'empty-390', w: 390, h: 844, route: '/investigate', mock: false, wait: 2500 },
    { name: 'loading-1440', w: 1440, h: 900, route: '/investigate?q=45.148.10.182', mock: 'slow', wait: 900 },
    { name: 'report-1440', w: 1440, h: 2400, route: '/investigate?q=45.148.10.182', mock: 'fast', wait: 4500 },
    { name: 'report-390', w: 390, h: 3200, route: '/investigate?q=45.148.10.182', mock: 'fast', wait: 4500 },
  ]
  for (const s of shots) {
    const page = await browser.newPage({ viewport: { width: s.w, height: Math.min(s.h, 1100) }, deviceScaleFactor: 1 })
    if (s.mock) {
      await page.route('**/api/investigate**', async (route) => {
        if (s.mock === 'slow') await new Promise((r) => setTimeout(r, 5000))
        await route.fulfill({ status: 200, contentType: 'application/json', body: dossier })
      })
    }
    await page.goto(BASE + s.route, { waitUntil: 'networkidle' }).catch(() => {})
    await page.waitForTimeout(s.wait)
    await page.screenshot({ path: path.join(OUT, s.name + '.png'), fullPage: s.h > 1100 })
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e)))
    if (errs.length) console.log(s.name, 'PAGE ERRORS:', errs.slice(0, 3))
    await page.close()
    console.log('shot:', s.name)
  }
  await browser.close()
})()
