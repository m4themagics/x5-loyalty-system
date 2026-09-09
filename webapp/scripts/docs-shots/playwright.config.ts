import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

/**
 * Capturing documentation images. It lives in the repository on purpose: while it sat in a
 * temporary folder the screenshots lagged the interface by several releases and nobody noticed.
 */
const webPort = 5205
const webUrl = `http://127.0.0.1:${webPort}`
const webappRoot = fileURLToPath(new URL('../../', import.meta.url))

export default defineConfig({
  testDir: fileURLToPath(new URL('.', import.meta.url)),
  outputDir: fileURLToPath(new URL('../../e2e/.artifacts/docs-shots/', import.meta.url)),
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Pixel 5'],
    baseURL: webUrl,
    deviceScaleFactor: 2,
  },
  webServer: {
    command: `bun run dev --host 127.0.0.1 --port ${webPort}`,
    cwd: webappRoot,
    env: { ...process.env, LLM_PROVIDER: 'template' },
    url: webUrl,
    reuseExistingServer: false,
    timeout: 90_000,
  },
})
