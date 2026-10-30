// Renders every fixture in a real browser — with the canvas measurer, as a
// page would — and checks what a test in Node cannot: every label lies inside the
// drawing, and the page logs no errors.
// Screenshots land in tests/browser/output, in the light and the dark theme.
//
//   pnpm build && node scripts/browser-check.mjs [filter]
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const root = new URL('..', import.meta.url).pathname
const out = join(root, 'tests/browser/output')
mkdirSync(out, { recursive: true })
const filter = process.argv[2] ?? ''
const fixtures = readdirSync(join(root, 'tests/fixtures'))
  .filter((f) => /\.drawio$/.test(f) && f.includes(filter))
  .map((f) => ({ name: f.replace(/\.drawio$/, ''), dmn: false, source: readFileSync(join(root, 'tests/fixtures', f), 'utf8') }))

const DARK = `.dark { background: #111827; color-scheme: dark;
  --drawio-fill: #1f2937; --drawio-stroke: #d1d5db; --drawio-text: #e5e7eb; --drawio-label-background: #111827; }`

const html = `<!doctype html><meta charset="utf-8">
<style>body{margin:0;font-family:system-ui} .case{padding:16px;display:inline-block} ${DARK}</style>
<body><div id="root"></div>
<script type="module">
  import { render, parseDrawio } from '/index.mjs'
  const fixtures = ${JSON.stringify(fixtures)}
  const root = document.getElementById('root')
  const results = []
  for (const f of fixtures) {
    for (const theme of ['light', 'dark']) {
      const box = document.createElement('div')
      box.className = 'case ' + theme
      box.id = f.name + '--' + theme
      try {
        const file = parseDrawio(f.source)
        box.innerHTML = file.pages.map((_, i) => '<div style="margin-bottom:16px">' + render(file, { page: i, idPrefix: 'd-' + f.name + '-' + theme + '-' + i }).svg + '</div>').join('')
      } catch (e) {
        results.push({ name: f.name, error: String(e) })
      }
      root.appendChild(box)
    }
  }
  await document.fonts.ready
  for (const f of fixtures) {
    const problems = []
    for (const svg of document.querySelectorAll('#' + CSS.escape(f.name + '--light') + ' svg')) {
      const view = svg.viewBox.baseVal
      const toSvg = svg.getScreenCTM().inverse()
      // Every label inside the drawing.
      for (const text of svg.querySelectorAll('text')) {
        const b = text.getBBox()
        const m = toSvg.multiply(text.getScreenCTM())
        const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m))
        const xs = corners.map((p) => p.x)
        const ys = corners.map((p) => p.y)
        const t = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
        if (t.x < view.x - 1 || t.y < view.y - 1 || t.x + t.width > view.x + view.width + 1 || t.y + t.height > view.y + view.height + 1) problems.push({ clipped: text.textContent })
      }
    }
    results.push({ name: f.name, problems })
  }
  window.__results = results
</script>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })
await page.route('http://check.local/**', (route) => {
  const url = new URL(route.request().url())
  if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html })
  // The entry and the chunks it imports.
  const file = join(root, 'dist', url.pathname.replace(/^\/+/, ''))
  if (/^\/[\w.-]+\.(m?js)$/.test(url.pathname) && existsSync(file)) return route.fulfill({ contentType: 'text/javascript', body: readFileSync(file) })
  return route.fulfill({ status: 404 })
})
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto('http://check.local/')
await page.waitForFunction(() => window.__results, null, { timeout: 30000 })
const results = await page.evaluate(() => window.__results)
for (const f of fixtures) {
  for (const theme of ['light', 'dark']) {
    const el = await page.$('#' + f.name + '--' + theme)
    if (el) await el.screenshot({ path: join(out, `${f.name}--${theme}.png`) })
  }
}
await browser.close()

let failed = errors.length > 0
for (const e of errors) console.error('page error:', e)
for (const r of results) {
  if (r.error) {
    failed = true
    console.error(`✗ ${r.name}: ${r.error}`)
  } else if (r.problems.length > 0) {
    failed = true
    console.error(`✗ ${r.name}:`, JSON.stringify(r.problems))
  } else {
    console.log(`✓ ${r.name}`)
  }
}
process.exit(failed ? 1 : 0)
