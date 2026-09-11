/** Strict bounded input parsing shared by the teaching models. Never clamp silently. */
export function boundedInteger(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (String(value).trim() === '') return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null
}

export function integerList(value: string, min: number, max: number, limit = 40): number[] | null {
  const tokens = value.trim().split(/[\s,]+/)
  if (!value.trim() || tokens.length > limit || tokens.some((token) => !/^-?\d+$/.test(token))) return null
  const values = tokens.map(Number)
  return values.every((number) => Number.isSafeInteger(number) && number >= min && number <= max)
    ? values
    : null
}
