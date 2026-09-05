/**
 * Проверяет JSON локального PoC против общего Zod-контракта.
 * `bun webapp/scripts/validate-demo-payload.ts decision_response out.json`
 * Файл `-` читает stdin. Код возврата 0 — валидно, 1 — нарушение контракта.
 */
import { readFileSync } from 'node:fs'

import {
  demoDecisionRequestSchema,
  demoDecisionResponseSchema,
  demoErrorResponseSchema,
  demoEventRequestSchema,
  demoEventResponseSchema,
  demoGameSnapshotSchema,
  demoProfileSnapshotSchema,
} from '@pyaterochka-game-demo/contracts'

const schemas = {
  decision_request: demoDecisionRequestSchema,
  decision_response: demoDecisionResponseSchema,
  event_request: demoEventRequestSchema,
  event_response: demoEventResponseSchema,
  error_response: demoErrorResponseSchema,
  game_snapshot: demoGameSnapshotSchema,
  profile: demoProfileSnapshotSchema,
}

const [schemaName, filePath] = process.argv.slice(2)
const schema = schemas[schemaName as keyof typeof schemas]

if (schema === undefined || filePath === undefined) {
  console.error(`использование: bun webapp/scripts/validate-demo-payload.ts <${Object.keys(schemas).join('|')}> <файл|->`)
  process.exit(2)
}

const result = schema.safeParse(JSON.parse(readFileSync(filePath === '-' ? 0 : filePath, 'utf8')))

if (!result.success) {
  for (const issue of result.error.issues) {
    console.error(`${issue.path.join('.') || '<корень>'}: ${issue.message}`)
  }
  process.exit(1)
}

console.log(`${schemaName}: валидно`)
