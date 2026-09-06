import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

/**
 * Собирает картинки документации из кадров, снятых `shots.spec.ts`.
 * Скриншоты уходят в WebP, записи экрана — в GIF с реальными интервалами записи.
 */
const raw = fileURLToPath(new URL('../../e2e/.artifacts/docs-shots/raw/', import.meta.url))
const out = fileURLToPath(new URL('../../../docs/assets/screenshots/', import.meta.url))

if (!existsSync(raw)) {
  console.error('Нет снятых кадров. Сначала: bun run docs:shots')
  process.exit(1)
}

const SCREENSHOT_WIDTH = 540
const GIF_WIDTH = 260
const GIF_FPS = 9

for (const file of readdirSync(raw).filter((name) => name.endsWith('.png'))) {
  const name = file.replace(/\.png$/, '')
  await sharp(`${raw}${file}`)
    .resize({ width: SCREENSHOT_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toFile(`${out}${name}.webp`)
  console.log(`${name}.webp`)
}

for (const dir of readdirSync(raw).filter((name) => name.startsWith('frames-'))) {
  await buildGif(`${raw}${dir}/`, `${out}${dir.replace('frames-', '')}.gif`)
}

async function buildGif(dir, output) {
  const files = readdirSync(dir).filter((file) => file.endsWith('.jpg')).sort()
  if (files.length === 0) return
  const stamps = JSON.parse(readFileSync(`${dir}meta.json`, 'utf8'))

  // Равномерная выборка по реальному времени записи, чтобы темп совпал с живым интерфейсом.
  const picked = []
  for (let time = stamps[0]; time <= stamps.at(-1) + 1e-6; time += 1 / GIF_FPS) {
    let best = 0
    let bestDelta = Infinity
    stamps.forEach((stamp, index) => {
      const delta = Math.abs(stamp - time)
      if (delta < bestDelta) { bestDelta = delta; best = index }
    })
    if (picked.at(-1) !== best) picked.push(best)
  }

  const delays = picked.map((frameIndex, order) => {
    const next = picked[order + 1]
    if (next === undefined) return 900
    return Math.max(40, Math.min(400, Math.round((stamps[next] - stamps[frameIndex]) * 1000)))
  })

  const first = await sharp(`${dir}${files[0]}`).resize({ width: GIF_WIDTH }).toBuffer({ resolveWithObject: true })
  const height = first.info.height
  const pages = []
  for (const index of picked) {
    pages.push(await sharp(`${dir}${files[index]}`)
      .resize({ width: GIF_WIDTH, height, fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer())
  }

  await sharp(Buffer.concat(pages), {
    raw: { width: GIF_WIDTH, height: height * pages.length, channels: 3, pageHeight: height },
  })
    .gif({ delay: delays, loop: 0, colours: 48, dither: 0.5 })
    .toFile(output)

  console.log(`${output.split('/').at(-1)}: ${pages.length} кадров, ${GIF_WIDTH}x${height}`)
}
