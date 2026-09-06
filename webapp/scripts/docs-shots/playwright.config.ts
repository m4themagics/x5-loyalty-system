import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

/**
 * Съёмка картинок для документации. Живёт в репозитории намеренно: пока она лежала во
 * временной папке, скриншоты отставали от интерфейса на несколько релизов и никто этого не видел.
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
