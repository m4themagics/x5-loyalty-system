/**
 * Builds the reference PoC requests from the game modules and hand-written profiles.
 * Run from the repository root: `bun webapp/scripts/build-demo-contract-examples.ts`.
 * Drift check: `bun webapp/scripts/build-demo-contract-examples.ts --check`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEMO_CONTRACT_VERSION,
  demoDecisionRequestSchema,
  demoTitleRequestSchema,
  type DemoProfileSnapshot,
} from '@pyaterochka-game-demo/contracts'

import {
  buildDemoGameFeatures,
  buildDemoGameSnapshot,
} from '../src/features/home/demo-game-snapshot'
import { fromDemoInventory } from '../src/features/home/demo-game-snapshot'

const examplesDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../recsys/contract/examples',
)

const NOW_MS = 1_788_598_800_000

const requests = [
  { profile: 'profile-empty.json', output: 'decision-request-empty.json', requestId: 'req-demo-decision-empty' },
  { profile: 'profile-breakfast-seeded.json', output: 'decision-request-seeded.json', requestId: 'req-demo-decision-seeded' },
] as const

const budget = readJson('budget.json')
const ads = readJson('ads.json')
const generated = new Map<string, string>([
  ['game-snapshot.json', serialize(buildDemoGameSnapshot())],
  ['title-request-seeded.json', serialize(demoTitleRequestSchema.parse({
    contract_version: DEMO_CONTRACT_VERSION,
    request_id: 'req-demo-title-seeded',
    now_ms: NOW_MS,
    profile: readJson('profile-breakfast-seeded.json'),
    game: buildDemoGameSnapshot(),
  }))],
])

for (const request of requests) {
  const profile = readJson(request.profile) as DemoProfileSnapshot
  generated.set(request.output, serialize(demoDecisionRequestSchema.parse({
    contract_version: DEMO_CONTRACT_VERSION,
    request_id: request.requestId,
    now_ms: NOW_MS,
    profile,
    game: buildDemoGameSnapshot(),
    game_features: buildDemoGameFeatures(fromDemoInventory(profile.inventory)),
    budget,
    ads,
  })))
}

const isCheck = process.argv.includes('--check')
const drifted: string[] = []

for (const [name, content] of generated) {
  const target = path.join(examplesDirectory, name)
  if (isCheck) {
    if (readFileSync(target, 'utf8') !== content) drifted.push(name)
    continue
  }
  writeFileSync(target, content, 'utf8')
  console.log(`wrote ${name}`)
}

if (isCheck) {
  if (drifted.length > 0) {
    console.error(`the reference drifted from the game modules: ${drifted.join(', ')}`)
    process.exit(1)
  }
  console.log(`reference requests match the game modules: ${generated.size} files`)
}

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(path.join(examplesDirectory, name), 'utf8')) as unknown
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
