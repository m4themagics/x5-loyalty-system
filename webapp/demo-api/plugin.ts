import type { Connect, Plugin, ViteDevServer } from 'vite'

const DEMO_CONTRACT_VERSION = 2

/**
 * Mounts the local demo API on the dev server.
 *
 * The plugin deliberately imports nothing but Vite types: the handler and its contracts are
 * loaded by Vite's module runner after the server starts. Otherwise the config loader would pull
 * the workspace contracts package into Node and break `vite build`.
 */
export function demoApiPlugin(): Plugin {
  return {
    name: 'x5-checkpoint-demo-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/demo', async (request, response, next) => {
        try {
          const handler = await loadHandler(server)
          await handler(request, response, next)
        } catch (error) {
          response.statusCode = 500
          response.setHeader('content-type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({
            contract_version: DEMO_CONTRACT_VERSION,
            request_id: 'unknown',
            error: {
              code: 'engine_failed',
              message: `failed to load the demo handler: ${String(error)}`.slice(0, 500),
            },
          }))
        }
      })
    },
  }
}

type DemoHandler = (
  request: Connect.IncomingMessage,
  response: import('node:http').ServerResponse,
  next: Connect.NextFunction,
) => Promise<void>

async function loadHandler(server: ViteDevServer): Promise<DemoHandler> {
  const module = await server.ssrLoadModule('/demo-api/handler.ts')
  return (module as { handleDemoRequest: DemoHandler }).handleDemoRequest
}
