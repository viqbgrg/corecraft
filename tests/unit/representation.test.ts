import { describe, expect, it } from 'vitest'
import {
  initialModeling,
  machineStep,
  modelingTransition,
  parseMachineProgram,
} from '../../src/experiments/models/modeling'
import {
  initialSigned,
  signedCalculation,
  signedTransition,
} from '../../src/experiments/models/signed-number'
import {
  calculateFloat32,
  decodeFloat32Bits,
  floatTransition,
  initialFloat,
  parseFloatInput,
  rational,
  roundToFloat32,
} from '../../src/experiments/models/floating-point'
import {
  decodeUtf8,
  encodeUtf8,
  encodingTransition,
  initialEncoding,
} from '../../src/experiments/models/encoding'
import {
  evaluateBoolean,
  initialLogic,
  logicTransition,
  parseBooleanExpression,
  truthTable,
} from '../../src/experiments/models/logic'

describe('programmable state machine', () => {
  it('checks predictions against the actual next state and runs a conditional loop', () => {
    const initial = initialModeling(),
      snapshot = structuredClone(initial)
    let s = modelingTransition(initial, { type: 'predict' })
    expect(initial).toEqual(snapshot)
    expect(s).toMatchObject({ accumulator: 3, pc: 1, correct: 1, predictions: 1 })
    s = modelingTransition(s, { type: 'run' })
    expect(s).toMatchObject({ accumulator: 0, pc: 4, steps: 11, output: [3, 2, 1], halted: true })
    expect(machineStep(s)).toBe(s)
    const wrong = modelingTransition({ ...initial, guess: 9 }, { type: 'predict' })
    expect(wrong).toMatchObject({ accumulator: 3, correct: 0, predictions: 1 })
  })
  it('pauses a live loop without falsely marking it halted and rejects invalid jumps', () => {
    const loop = modelingTransition(initialModeling('SET 1; JNZ 1'), { type: 'run' })
    expect(loop).toMatchObject({ halted: false, paused: true, pc: 1, steps: 200 })
    expect(modelingTransition(loop, { type: 'run' }).steps).toBe(400)
    expect(parseMachineProgram('IN; JNZ 2')).toBeNull()
    expect(parseMachineProgram('eval(1)')).toBeNull()
    const missingHalt = modelingTransition(initialModeling('IN; OUT'), { type: 'run' })
    expect(missingHalt.error).toContain('PC 已越过')
    expect(modelingTransition(missingHalt, { type: 'program', value: 'IN; OUT; HALT' })).toMatchObject({
      pc: 0,
      output: [],
      error: null,
    })
  })
})

describe('two’s complement and flags', () => {
  it('agrees with mathematical range and independent unsigned carry rules for every four-bit pair', () => {
    for (let a = -8; a <= 7; a++)
      for (let b = -8; b <= 7; b++)
        for (const op of ['add', 'sub'] as const) {
          const result = signedCalculation(a, b, op, 4),
            mathematical = op === 'add' ? a + b : a - b
          const raw = ((mathematical % 16) + 16) % 16
          expect(result.signed).toBe(raw >= 8 ? raw - 16 : raw)
          expect(result.overflow).toBe(mathematical < -8 || mathematical > 7)
          expect(result.carry).toBe(Number(op === 'add' ? (a & 15) + (b & 15) >= 16 : (a & 15) >= (b & 15)))
        }
  })
  it('distinguishes carry, signed overflow, and subtraction without borrow', () => {
    expect(signedCalculation(127, 1, 'add')).toMatchObject({ signed: -128, carry: 0, overflow: true })
    expect(signedCalculation(-1, 1, 'add')).toMatchObject({ signed: 0, carry: 1, overflow: false })
    expect(signedCalculation(-128, 1, 'sub')).toMatchObject({ signed: 127, carry: 1, overflow: true })
    expect(signedCalculation(0, 1, 'sub')).toMatchObject({ signed: -1, carry: 0, overflow: false })
    expect(() => initialSigned(4, 8)).toThrow()
    const partial = signedTransition(initialSigned(), { type: 'step' })
    expect(partial.cursor).toBe(1)
    const compared = signedTransition(partial, { type: 'compare' })
    expect(compared.cursor).toBe(1)
    expect(compared.comparison.map((row) => row.result.overflow)).toEqual([true, false, true])
  })
})

describe('exact IEEE 754 binary32 rounding', () => {
  it('decomposes normals, subnormals, signed zeros, infinities and NaN', () => {
    expect(decodeFloat32Bits(0x3f800000)).toMatchObject({
      value: 1,
      sign: 0,
      exponent: 127,
      fraction: 0,
      exact: { n: 1n, d: 1n },
    })
    expect(decodeFloat32Bits(1)).toMatchObject({ category: '次正规数', exact: { n: 1n, d: 2n ** 149n } })
    expect(decodeFloat32Bits(0x00800000).exact).toEqual({ n: 1n, d: 2n ** 126n })
    expect(Object.is(decodeFloat32Bits(0x80000000).value, -0)).toBe(true)
    expect(decodeFloat32Bits(0x7f800000).value).toBe(Infinity)
    expect(decodeFloat32Bits(0x7fc00000).category).toBe('NaN')
  })
  it('rounds ties to even on both sides of normal and subnormal boundaries', () => {
    expect(roundToFloat32(rational(2n ** 24n + 1n, 2n ** 24n)).bits).toBe(0x3f800000)
    expect(roundToFloat32(rational(2n ** 24n + 3n, 2n ** 24n)).bits).toBe(0x3f800002)
    expect(roundToFloat32(rational(1n, 2n ** 150n)).bits).toBe(0)
    expect(roundToFloat32(rational(-1n, 2n ** 150n)).bits).toBe(0x80000000)
    expect(roundToFloat32(rational(3n, 2n ** 150n)).bits).toBe(2)
    const normalBoundary = rational(2n ** 24n - 1n, 2n ** 150n)
    expect(roundToFloat32(normalBoundary).bits).toBe(0x00800000)
    const overflowBoundary = rational((2n ** 25n - 1n) * 2n ** 103n, 1n)
    expect(roundToFloat32(overflowBoundary).bits).toBe(0x7f800000)
  })
  it('avoids decimal-to-binary64 double rounding and measures error against an exact decimal target', () => {
    expect(calculateFloat32('1.0000000596046448', '0', 'convert')!.parts.bits).toBe(0x3f800001)
    expect(calculateFloat32('1.0000000596046447', '0', 'convert')!.parts.bits).toBe(0x3f800000)
    const sum = calculateFloat32('0.1', '0.2', 'add')!
    expect(sum.parts.bits).toBe(0x3e99999a)
    expect(sum.target).toEqual({ n: 3n, d: 10n })
    expect(sum.error).toEqual({ n: 1n, d: 83886080n })
    expect(calculateFloat32('16777216', '1', 'add')!.parts.value).toBe(16777216)
    expect(calculateFloat32('16777216', '2', 'add')!.parts.value).toBe(16777218)
  })
  it('handles exceptional values without pretending there is a finite mathematical error', () => {
    expect(calculateFloat32('1e60', '0', 'convert')!.parts.value).toBe(Infinity)
    expect(calculateFloat32('-1e-60', '0', 'convert')!.parts.bits).toBe(0x80000000)
    expect(calculateFloat32('Infinity', '-Infinity', 'add')!.parts.category).toBe('NaN')
    expect(calculateFloat32('-0', '-0', 'add')!.parts.bits).toBe(0x80000000)
    expect(calculateFloat32('-0', '0', 'add')!.parts.bits).toBe(0)
    expect(calculateFloat32('NaN', '1', 'add')!.error).toBeNull()
    for (const invalid of ['', '1e61', '0x10', '1_000', '1.2.3']) expect(parseFloatInput(invalid)).toBeNull()
    const bad = floatTransition(floatTransition(initialFloat(), { type: 'a', value: 'oops' }), {
      type: 'compute',
    })
    expect(bad.error).toBeTruthy()
    expect(
      floatTransition(floatTransition(bad, { type: 'a', value: '0.5' }), { type: 'compute' }).error,
    ).toBeNull()
  })
})

describe('strict UTF-8', () => {
  it('matches standard encoding at every sequence-length and scalar boundary', () => {
    const text = String.fromCodePoint(0, 0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xe000, 0xffff, 0x10000, 0x10ffff)
    const encoded = encodeUtf8(text)
    expect(encoded.bytes).toEqual([...new TextEncoder().encode(text)])
    expect(decodeUtf8(encoded.bytes).text).toBe(text)
    const sample = encodeUtf8('A中🙂')
    expect(sample.bytes).toEqual([0x41, 0xe4, 0xb8, 0xad, 0xf0, 0x9f, 0x99, 0x82])
    expect(sample.scalars.map((scalar) => scalar.units)).toEqual([1, 1, 2])
    expect(decodeUtf8([0xef, 0xbb, 0xbf]).text).toBe('\ufeff')
  })
  it('rejects truncated, overlong, surrogate, out-of-range and isolated-continuation sequences', () => {
    for (const bytes of [
      [0x80],
      [0xc0, 0xaf],
      [0xe0, 0x80, 0x80],
      [0xf0, 0x80, 0x80, 0x80],
      [0xed, 0xa0, 0x80],
      [0xf4, 0x90, 0x80, 0x80],
      [0xe4, 0xb8],
      [0xe4, 0x41, 0xad],
      [256],
    ])
      expect(() => decodeUtf8(bytes)).toThrow()
    expect(() => encodeUtf8('\ud800')).toThrow('未配对')
  })
  it('requires an actual multibyte round trip and can recover after a corrupted byte edit', () => {
    const encoded = encodingTransition(initialEncoding(), { type: 'encode' })
    expect(encoded.roundTrip).toBe(false)
    const bad = encodingTransition(encodingTransition(encoded, { type: 'hex', value: 'E4 B8' }), {
      type: 'decode',
    })
    expect(bad.error).toContain('不完整')
    const fixed = encodingTransition(encodingTransition(bad, { type: 'hex', value: encoded.hex }), {
      type: 'decode',
    })
    expect(fixed).toMatchObject({ text: 'A中🙂', roundTrip: true, error: null })
    expect(
      encodingTransition(encodingTransition(initialEncoding('ASCII'), { type: 'encode' }), { type: 'decode' })
        .roundTrip,
    ).toBe(false)
  })
})

describe('Boolean gates and exhaustive equivalence', () => {
  it('respects operator precedence and verifies De Morgan for all eight inputs', () => {
    const table = truthTable(parseBooleanExpression('!(A & B)'), parseBooleanExpression('!A | !B'))
    expect(table).toHaveLength(8)
    expect(table.every((row) => row.left === row.right)).toBe(true)
    for (const row of table) expect(row.left).toBe(Number(!(row.inputs.A && row.inputs.B)))
    expect(evaluateBoolean(parseBooleanExpression('A | B & C'), { A: 1, B: 0, C: 0 }).value).toBe(1)
    expect(evaluateBoolean(parseBooleanExpression('(A | B) & C'), { A: 1, B: 0, C: 0 }).value).toBe(0)
  })
  it('finds and applies an actual counterexample, and rejects malformed expressions', () => {
    let s = logicTransition(initialLogic('!(A & B)', '!A & !B'), { type: 'compare' })
    s = logicTransition(s, { type: 'counterexample' })
    expect(s.inputs).toEqual({ A: 0, B: 1, C: 0 })
    expect(s.evaluated!.left.value).toBe(1)
    expect(s.evaluated!.right.value).toBe(0)
    for (const invalid of ['', 'A && B', 'A|', '(A', 'A B', 'alert(1)', 'D'])
      expect(() => parseBooleanExpression(invalid)).toThrow()
    const bad = logicTransition(logicTransition(s, { type: 'right', value: '(B' }), { type: 'compare' })
    expect(bad).toMatchObject({ evaluated: null, table: [] })
    expect(bad.error).toBeTruthy()
  })
})
