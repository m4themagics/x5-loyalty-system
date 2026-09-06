import { expect, test } from 'bun:test'

import {
  createOfflineSeedProfiles,
  fetchSeedProfiles,
} from '../src/features/home/demo-api'

test('offline seed stays valid and provides two verified purchase days', () => {
  const seed = createOfflineSeedProfiles(1_788_700_000_000)

  expect(seed.profiles).toHaveLength(1)
  expect(seed.profiles[0]?.synthetic).toBe(true)
  expect(seed.profiles[0]?.receipts).toHaveLength(2)
  expect(seed.ads).toEqual({ campaigns: [], exposures: [], billings: [] })
})

test('profile loading falls back to the browser demo when the API is unavailable', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch

  try {
    const result = await fetchSeedProfiles()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.profiles[0]?.profile_id).toBe('demo-offline')
  } finally {
    globalThis.fetch = originalFetch
  }
})
