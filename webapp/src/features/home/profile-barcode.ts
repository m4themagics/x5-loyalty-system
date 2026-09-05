const LEFT_ODD = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
] as const
const LEFT_EVEN = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
] as const
const RIGHT = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100',
] as const
const PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
] as const

export function createEan13(createdAt: number, randomValue: number): string {
  const timePart = Math.abs(Math.trunc(createdAt)) % 1_000_000
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
    : 0
  const randomPart = Math.floor(normalizedRandom * 1_000)
  const body = `460${String(timePart).padStart(6, '0')}${String(randomPart).padStart(3, '0')}`
  return `${body}${calculateCheckDigit(body)}`
}

export function isValidEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false
  return Number(value[12]) === calculateCheckDigit(value.slice(0, 12))
}

export function encodeEan13(value: string): string {
  if (!isValidEan13(value)) throw new Error('Invalid EAN-13 barcode')

  const digits = [...value].map(Number)
  const parity = PARITY[digits[0]]
  const left = digits.slice(1, 7).map((digit, index) =>
    parity[index] === 'L' ? LEFT_ODD[digit] : LEFT_EVEN[digit],
  ).join('')
  const right = digits.slice(7).map((digit) => RIGHT[digit]).join('')

  return `101${left}01010${right}101`
}

function calculateCheckDigit(body: string): number {
  if (!/^\d{12}$/.test(body)) throw new Error('EAN-13 body must contain 12 digits')
  const sum = [...body].reduce((total, digit, index) =>
    total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
  return (10 - (sum % 10)) % 10
}
