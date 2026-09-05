import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

import { applyE2ePortEnv, resolveE2ePorts } from './e2e/ports'

const portPlan = await resolveE2ePorts()
applyE2ePortEnv(portPlan)
const { webPort, webUrl } = portPlan
const webappRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  testDir: './e2e/demo',
  outputDir: './e2e/.artifacts/demo-test-results',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Pixel 5'],
    baseURL: webUrl,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `bun run dev --host 127.0.0.1 --port ${webPort}`,
    cwd: webappRoot,
    env: { ...process.env, LLM_PROVIDER: 'template' },
    url: webUrl,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
