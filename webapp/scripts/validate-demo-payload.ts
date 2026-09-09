/**
 * Validates local PoC JSON against the shared Zod contract.
 * `bun webapp/scripts/validate-demo-payload.ts decision_response out.json`
 * The file `-` reads stdin. Exit code 0 means valid, 1 means a contract violation.
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
  console.error(`usage: bun webapp/scripts/validate-demo-payload.ts <${Object.keys(schemas).join('|')}> <file|->`)
  process.exit(2)
}

const result = schema.safeParse(JSON.parse(readFileSync(filePath === '-' ? 0 : filePath, 'utf8')))

if (!result.success) {
  for (const issue of result.error.issues) {
    console.error(`${issue.path.join('.') || '<root>'}: ${issue.message}`)
  }
  process.exit(1)
}

console.log(`${schemaName}: valid`)
