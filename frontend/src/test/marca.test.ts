import { readFileSync, statSync } from 'node:fs'

import { expect, test } from 'vitest'

const FAVICON = 'public/favicon.ico'
const APPLE_TOUCH_ICON = 'public/apple-touch-icon.png'
const SHIELD = 'src/assets/marca/escudo-ap.webp'
const LOGO = 'src/assets/marca/logo.webp'

test('publica favicon ICO verdadeiro e Apple Touch Icon', () => {
  expect([...readFileSync(FAVICON).subarray(0, 4)]).toEqual([0, 0, 1, 0])
  expect([...readFileSync(APPLE_TOUCH_ICON).subarray(0, 8)]).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])

  const html = readFileSync('index.html', 'utf8')
  expect(html).toContain('href="/favicon.ico"')
  expect(html).toContain('href="/apple-touch-icon.png"')
})

test('arte leve respeita os orçamentos da marca', () => {
  expect(statSync(FAVICON).size).toBeLessThanOrEqual(15 * 1024)
  expect(statSync(SHIELD).size).toBeLessThanOrEqual(10 * 1024)
  expect(statSync(LOGO).size).toBeLessThanOrEqual(60 * 1024)
})
