import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEMO_CONTRACT_VERSION,
  demoDecisionRequestSchema,
  demoDecisionResponseSchema,
  demoErrorResponseSchema,
  demoEventRequestSchema,
  demoEventResponseSchema,
  demoSeedProfilesResponseSchema,
} from '@pyaterochka-game-demo/contracts'
import type { Connect } from 'vite'
import { z } from 'zod'

/**
 * Обработчик локального демонстрационного API.
 *
 * Этот модуль загружает сам Vite во время работы dev-сервера, а не загрузчик конфига: только так
 * workspace-пакет контрактов резолвится одинаково при `vite dev` и при `vite build`.
 *
 * Движок вызывается фиксированным argv без shell-интерполяции и обменивается версионированным
 * JSON через stdin/stdout. Ни один секрет LLM не покидает серверный процесс.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const EXAMPLES_DIRECTORY = path.join(REPO_ROOT, 'recsys/contract/examples')
const ENGINE_ENTRY = 'recsys/engine/cli.py'
const ENGINE_TIMEOUT_MS = 15_000
const MAX_BODY_BYTES = 1_000_000

const PROFILE_FILES = ['profile-empty.json', 'profile-breakfast-seeded.json'] as const

type ErrorCode = z.infer<typeof demoErrorResponseSchema>['error']['code']

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  engine_failed: 500,
  engine_timeout: 504,
  engine_invalid_output: 502,
}

export async function handleDemoRequest(
  request: Connect.IncomingMessage,
  response: import('node:http').ServerResponse,
  next: Connect.NextFunction,
): Promise<void> {
  const route = (request.url ?? '/').split('?')[0]

  if (route === '/profiles' && request.method === 'GET') {
    sendJson(response, 200, readSeedProfiles())
    return
  }

  const engineCommand = route === '/decision' ? 'decision' : route === '/event' ? 'event' : null
  if (engineCommand === null) {
    next()
    return
  }

  if (request.method !== 'POST') {
    sendError(response, 'unknown', 'bad_request', 'ожидается POST')
    return
  }

  let payload: unknown
  try {
    payload = JSON.parse(await readBody(request))
  } catch (error) {
    sendError(response, 'unknown', 'bad_request', `тело запроса не является JSON: ${String(error)}`)
    return
  }

  const requestId = readRequestId(payload)
  const requestSchema = engineCommand === 'decision' ? demoDecisionRequestSchema : demoEventRequestSchema
  const parsedRequest = requestSchema.safeParse(payload)
  if (!parsedRequest.success) {
    sendError(response, requestId, 'bad_request', formatIssues(parsedRequest.error))
    return
  }

  const engine = await runEngine(engineCommand, JSON.stringify(parsedRequest.data))
  if (engine.timedOut) {
    sendError(response, requestId, 'engine_timeout', `движок не ответил за ${ENGINE_TIMEOUT_MS} мс`)
    return
  }
  if (engine.spawnError !== null) {
    sendError(response, requestId, 'engine_failed', engine.spawnError)
    return
  }

  let engineOutput: unknown
  try {
    engineOutput = JSON.parse(engine.stdout)
  } catch {
    sendError(
      response,
      requestId,
      engine.exitCode === 0 ? 'engine_invalid_output' : 'engine_failed',
      engine.stderr.trim() || 'движок не вернул JSON',
    )
    return
  }

  if (engine.exitCode !== 0) {
    const parsedError = demoErrorResponseSchema.safeParse(engineOutput)
    if (parsedError.success) {
      sendJson(response, STATUS_BY_CODE[parsedError.data.error.code], parsedError.data)
      return
    }
    sendError(response, requestId, 'engine_failed', engine.stderr.trim() || 'движок завершился с ошибкой')
    return
  }

  const responseSchema = engineCommand === 'decision' ? demoDecisionResponseSchema : demoEventResponseSchema
  const parsedResponse = responseSchema.safeParse(engineOutput)
  if (!parsedResponse.success) {
    sendError(response, requestId, 'engine_invalid_output', formatIssues(parsedResponse.error))
    return
  }

  sendJson(response, 200, parsedResponse.data)
}

type EngineRun = {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  spawnError: string | null
}

function runEngine(command: 'decision' | 'event', input: string): Promise<EngineRun> {
  return new Promise((resolve) => {
    const child = spawn('python3', [ENGINE_ENTRY, command], { cwd: REPO_ROOT })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish({ stdout, stderr, exitCode: null, timedOut: true, spawnError: null })
    }, ENGINE_TIMEOUT_MS)

    const finish = (run: EngineRun) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(run)
    }

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', (error) => {
      finish({ stdout, stderr, exitCode: null, timedOut: false, spawnError: `не удалось запустить python3 ${ENGINE_ENTRY}: ${error.message}` })
    })
    child.on('close', (code) => {
      finish({ stdout, stderr, exitCode: code, timedOut: false, spawnError: null })
    })

    child.stdin.on('error', () => {})
    child.stdin.end(input, 'utf8')
  })
}

function readSeedProfiles() {
  return demoSeedProfilesResponseSchema.parse({
    contract_version: DEMO_CONTRACT_VERSION,
    profiles: PROFILE_FILES.map((file) => readExample(file)),
    budget: readExample('budget.json'),
  })
}

function readExample(name: string): unknown {
  return JSON.parse(readFileSync(path.join(EXAMPLES_DIRECTORY, name), 'utf8')) as unknown
}

function readBody(request: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8')
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('тело запроса слишком велико'))
        request.destroy()
      }
    })
    request.on('end', () => resolve(body))
    request.on('error', reject)
  })
}

function readRequestId(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null && 'request_id' in payload) {
    const value = (payload as { request_id?: unknown }).request_id
    if (typeof value === 'string' && value.length > 0) return value
  }
  return 'unknown'
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '<корень>'}: ${issue.message}`)
    .join('; ')
}

function sendError(
  response: import('node:http').ServerResponse,
  requestId: string,
  code: ErrorCode,
  message: string,
): void {
  sendJson(response, STATUS_BY_CODE[code], {
    contract_version: DEMO_CONTRACT_VERSION,
    request_id: requestId,
    error: { code, message: message.slice(0, 500) },
  })
}

function sendJson(
  response: import('node:http').ServerResponse,
  status: number,
  payload: unknown,
): void {
  const body = JSON.stringify(payload)
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(body)
}
