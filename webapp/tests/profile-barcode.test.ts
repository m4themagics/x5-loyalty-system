import { expect, test } from 'bun:test'

import {
  createEan13,
  encodeEan13,
  isValidEan13,
} from '../src/features/home/profile-barcode'

test('generated discount code is a valid EAN-13 barcode', () => {
  const barcode = createEan13(1_700_000_000_000, .42)

  expect(barcode).toMatch(/^460\d{10}$/)
  expect(isValidEan13(barcode)).toBe(true)
})

test('EAN-13 encoder produces the standard 95 modules and guard bars', () => {
  const modules = encodeEan13('4601234567893')

  expect(modules).toHaveLength(95)
  expect(modules.slice(0, 3)).toBe('101')
  expect(modules.slice(45, 50)).toBe('01010')
  expect(modules.slice(-3)).toBe('101')
})
