import { expect, test } from 'bun:test'
import { profileInitial, shortProfileName } from '../src/features/home/demo-format'

test('the header name drops the explanation that follows the profile kind', () => {
  expect(shortProfileName('Показательный профиль: три предмета набора и дубликат для обмена'))
    .toBe('Показательный профиль')
  expect(shortProfileName('Новый участник, пустой инвентарь (синтетический профиль)'))
    .toBe('Новый участник')
  expect(shortProfileName('Аня')).toBe('Аня')
})

test('an empty or punctuation-only label still yields a name and an initial', () => {
  expect(shortProfileName(': пусто')).toBe('Профиль')
  expect(profileInitial(': пусто')).toBe('П')
  expect(profileInitial('Борис')).toBe('Б')
})
