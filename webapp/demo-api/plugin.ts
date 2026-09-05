import type { Connect, Plugin, ViteDevServer } from 'vite'

/**
 * Подключает локальный демонстрационный API к dev-серверу.
 *
 * Плагин намеренно ничего не импортирует, кроме типов Vite: обработчик и его контракты
 * загружаются модульным раннером Vite уже после старта сервера. Иначе загрузчик конфига тянул бы
 * workspace-пакет контрактов в Node и ломал `vite build`.
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
            contract_version: 1,
            request_id: 'unknown',
            error: {
              code: 'engine_failed',
              message: `не удалось загрузить демонстрационный обработчик: ${String(error)}`.slice(0, 500),
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
