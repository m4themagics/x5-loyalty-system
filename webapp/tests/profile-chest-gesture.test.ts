import { expect, test } from 'bun:test'

import {
  SHAKE_DISTANCE_REQUIRED,
  addShakeMovement,
} from '../src/features/home/profile-chest-gesture'

test('chest shaking accumulates real pointer movement', () => {
  const distance = addShakeMovement(100, { x: 20, y: 20 }, { x: 50, y: 60 })

  expect(distance).toBe(150)
})

test('one artificial pointer jump cannot instantly open the chest', () => {
  const distance = addShakeMovement(0, { x: 0, y: 0 }, { x: 2_000, y: 2_000 })

  expect(distance).toBe(90)
})

test('shake progress is capped when the required movement is reached', () => {
  const distance = addShakeMovement(
    SHAKE_DISTANCE_REQUIRED - 20,
    { x: 0, y: 0 },
    { x: 50, y: 0 },
  )

  expect(distance).toBe(SHAKE_DISTANCE_REQUIRED)
})
