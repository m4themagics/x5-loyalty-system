import { expect, test } from 'bun:test'

import { navigateHomeScreen } from '../src/features/home/navigation'

test('profile and home tabs switch between the two available demo screens', () => {
  expect(navigateHomeScreen('home', 'profile')).toBe('profile')
  expect(navigateHomeScreen('profile', 'home')).toBe('home')
})

test('unfinished tabs leave the current demo screen unchanged', () => {
  expect(navigateHomeScreen('home', 'catalog')).toBe('home')
  expect(navigateHomeScreen('profile', 'orange')).toBe('profile')
})
