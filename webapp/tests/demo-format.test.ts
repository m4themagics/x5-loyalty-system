import { expect, test } from 'bun:test'
import { profileInitial, shortProfileName } from '../src/features/home/demo-format'

test('the header name drops the explanation that follows the profile kind', () => {
  expect(shortProfileName('Showcase profile: three items of a set and a duplicate to trade'))
    .toBe('Showcase profile')
  expect(shortProfileName('New member, empty inventory (synthetic profile)'))
    .toBe('New member')
  expect(shortProfileName('Anna')).toBe('Anna')
})

test('an empty or punctuation-only label still yields a name and an initial', () => {
  expect(shortProfileName(': empty')).toBe('Profile')
  expect(profileInitial(': empty')).toBe('P')
  expect(profileInitial('Boris')).toBe('B')
})
