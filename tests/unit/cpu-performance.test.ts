import { describe, expect, it } from 'vitest'
import {
  initialPipeline,
  pipelineStep,
  pipelineTransition,
  presentPipeline,
  runPipeline,
} from '../../src/experiments/models/pipeline'
import {
  branchPredictionStep,
  branchPredictionTransition,
  initialBranchPrediction,
  parseBranchSequence,
  presentBranchPrediction,
  runBranchPrediction,
} from '../../src/experiments/models/branch-prediction'

describe('five-stage instruction pipeline', () => {
  it.each([
    { example: 'independent', registers: { R1: 5, R2: 7, R3: 11, R4: 13 }, stored: 0, without: 8, with: 8 },
    { example: 'dependency', registers: { R1: 5, R2: 10, R3: 15, R4: 25 }, stored: 0, without: 14, with: 8 },
    { example: 'load-use', registers: { R1: 21, R2: 42, R3: 63, R4: 0 }, stored: 63, without: 14, with: 9 },
  ] as const)('preserves $example results across serial execution and both forwarding modes', (example) => {
    const variants = [
      { mode: 'serial', forwarding: false, cycles: 20 },
      { mode: 'pipeline', forwarding: false, cycles: example.without },
      { mode: 'pipeline', forwarding: true, cycles: example.with },
    ] as const
    for (const variant of variants) {
      const initial = initialPipeline(example.example, variant.mode, variant.forwarding)
      const original = structuredClone(initial)
      const result = runPipeline(initial)
      expect(initial).toEqual(original)
      expect(result.registers).toEqual(example.registers)
      expect(result.memory[17]).toBe(example.stored)
      expect(result.retired).toBe(4)
      expect(result.cycles).toBe(variant.cycles)
      expect(result.history.flatMap((cycle) => (cycle.stages[4] === null ? [] : [cycle.stages[4]]))).toEqual([
        0, 1, 2, 3,
      ])
      if (variant.mode === 'serial')
        expect(
          result.history.every((cycle) => cycle.stages.filter((stage) => stage !== null).length === 1),
        ).toBe(true)
      else expect(result.cycles).toBe(4 + 4 + result.stalls)
      expect(pipelineStep(result)).toBe(result)
    }
  })

  it('inserts one load-use bubble, keeps IF/ID in place and commits only at WB', () => {
    let s = initialPipeline()
    for (let i = 0; i < 3; i++) s = pipelineStep(s)
    expect(s.stages.map((flight) => flight?.index ?? null)).toEqual([2, 1, 0, null, null])
    expect(s.registers.R1).toBe(0)
    s = pipelineStep(s)
    expect(s.stages.map((flight) => flight?.index ?? null)).toEqual([2, 1, null, 0, null])
    expect(s.pc).toBe(3)
    expect(s.stalls).toBe(1)
    expect(s.stages[3]?.result).toBe(21)
    expect(s.registers.R1).toBe(0)
    s = pipelineStep(s)
    expect(s.stages[2]?.result).toBe(42)
    expect(s.registers.R1).toBe(21)
    expect(s.registers.R2).toBe(0)
    expect(s.retired).toBe(1)
    expect(runPipeline(s).stalls).toBe(1)
  })

  it('waits for register write-back when forwarding is disabled', () => {
    let s = initialPipeline('dependency', 'pipeline', false)
    for (let i = 0; i < 5; i++) s = pipelineStep(s)
    expect(s.stalls).toBe(2)
    expect(s.stages[1]?.index).toBe(1)
    expect(s.stages[2]).toBeNull()
    expect(s.registers.R1).toBe(5)
    s = pipelineStep(s)
    expect(s.stages[2]?.result).toBe(10)
    expect(s.registers.R2).toBe(0)
  })

  it('forwards the youngest writer and keeps arithmetic within 16 bits', () => {
    const s = initialPipeline()
    s.program = [
      { op: 'MOV', target: 'R1', value: 5 },
      { op: 'MOV', target: 'R1', value: 40000 },
      { op: 'ADD', target: 'R2', left: 'R1', right: 'R1' },
      { op: 'ADD', target: 'R1', left: 'R1', right: 'R2' },
    ]
    const result = runPipeline(s)
    expect(result.registers.R2).toBe(14464)
    expect(result.registers.R1).toBe(54464)
    expect(result.stalls).toBe(0)
  })

  it('uses the newer LOAD even when an older ALU result is available for the same register', () => {
    const s = initialPipeline()
    s.program = [
      { op: 'MOV', target: 'R1', value: 5 },
      { op: 'LOAD', target: 'R1', address: 16 },
      { op: 'ADD', target: 'R2', left: 'R1', right: 'R1' },
      { op: 'STORE', source: 'R2', address: 17 },
    ]
    const result = runPipeline(s)
    expect(result.registers.R2).toBe(42)
    expect(result.memory[17]).toBe(42)
    expect(result.stalls).toBe(1)
  })

  it('compares cold runs without advancing the active run and resets evidence when inputs change', () => {
    const started = pipelineStep(initialPipeline())
    const compared = pipelineTransition(started, { type: 'compare' })
    expect(compared.cycles).toBe(1)
    expect(compared.registers).toEqual(started.registers)
    expect(compared.comparison.map((row) => [row.cycles, row.stalls])).toEqual([
      [20, 0],
      [14, 6],
      [9, 1],
    ])
    expect(presentPipeline(compared).goal.reached).toBe(false)
    const finished = runPipeline(compared)
    expect(presentPipeline(finished).goal.reached).toBe(true)
    const changed = pipelineTransition(finished, { type: 'example', value: 'independent' })
    expect(changed.cycles).toBe(0)
    expect(changed.comparison).toEqual([])
    expect(presentPipeline(changed).goal.reached).toBe(false)
    expect(pipelineTransition(changed, { type: 'mode', value: 'invalid' })).toBe(changed)
  })
})

describe('branch direction prediction', () => {
  it('predicts without consulting the current outcome or training before resolution', () => {
    const taken = initialBranchPrediction('two-bit', 'T')
    const notTaken = initialBranchPrediction('two-bit', 'N')
    const predicted = branchPredictionStep(taken)
    expect(predicted.pending).toEqual(branchPredictionStep(notTaken).pending)
    expect(predicted.pending?.predicted).toBe(false)
    expect(predicted.counter).toBe(1)
    expect(predicted.cursor).toBe(0)
    expect(predicted.trials).toEqual([])
    expect(taken.pending).toBeNull()
    const resolved = branchPredictionStep(predicted)
    expect(resolved.counter).toBe(2)
    expect(resolved.cursor).toBe(1)
    expect(resolved.pending).toBeNull()
    expect(resolved.trials[0]).toMatchObject({ predicted: false, actual: true, correct: false, penalty: 2 })
  })

  it('retains a taken prediction after one loop exit while a one-bit predictor flips', () => {
    for (const strategy of ['one-bit', 'two-bit'] as const) {
      let s = initialBranchPrediction(strategy, 'TTTTNT')
      for (let i = 0; i < 10; i++) s = branchPredictionStep(s)
      expect(s.counter).toBe(strategy === 'one-bit' ? 0 : 2)
      s = branchPredictionStep(s)
      expect(s.pending?.predicted).toBe(strategy === 'two-bit')
    }
  })

  it('saturates at both bounds and counts only resolved failures', () => {
    const allTaken = runBranchPrediction(initialBranchPrediction('two-bit', 'T'.repeat(64), 7))
    expect(allTaken.counter).toBe(3)
    expect(allTaken.trials.filter((trial) => !trial.correct)).toHaveLength(1)
    expect(allTaken.trials.reduce((sum, trial) => sum + trial.penalty, 0)).toBe(7)
    const allNotTaken = runBranchPrediction(initialBranchPrediction('two-bit', 'N'.repeat(64)))
    expect(allNotTaken.counter).toBe(0)
    expect(allNotTaken.trials.every((trial) => trial.correct)).toBe(true)
    expect(allTaken.log).toHaveLength(60)
    expect(branchPredictionStep(allTaken)).toBe(allTaken)
  })

  it('compares the exact same trace including cold training and leaves the pending prediction intact', () => {
    const s = branchPredictionStep(initialBranchPrediction())
    const result = branchPredictionTransition(s, { type: 'compare' })
    expect(result.pending).toEqual(s.pending)
    expect(result.counter).toBe(1)
    expect(result.trials).toEqual([])
    expect(result.comparison.map((row) => row.misses)).toEqual([12, 6, 4])
    expect(result.comparison.map((row) => row.extraCycles)).toEqual([24, 12, 8])
    expect(presentBranchPrediction(result).goal.reached).toBe(false)
    expect(presentBranchPrediction(runBranchPrediction(result)).goal.reached).toBe(true)
  })

  it('does not assume two bits always outperform one bit', () => {
    const result = branchPredictionTransition(initialBranchPrediction('two-bit', 'TTNNTTNN'), {
      type: 'compare',
    })
    expect(result.comparison.map((row) => row.misses)).toEqual([4, 4, 6])
  })

  it('rejects malformed, empty and overlong traces without running a stale trace', () => {
    expect(parseBranchSequence('t, n\nT')).toEqual([true, false, true])
    for (const invalid of ['', ' , ', 'TTX', 'T0N', 'N'.repeat(65)]) {
      expect(parseBranchSequence(invalid)).toBeNull()
      const initial = branchPredictionStep(initialBranchPrediction())
      const changed = branchPredictionTransition(initial, { type: 'sequence', value: invalid })
      expect(changed.sequence).toEqual(initial.sequence)
      expect(changed.pending).toEqual(initial.pending)
      expect(changed.error).not.toBeNull()
      expect(runBranchPrediction(changed)).toBe(changed)
      expect(branchPredictionTransition(changed, { type: 'compare' })).toBe(changed)
      expect(presentBranchPrediction(changed).goal.reached).toBe(false)
      const recovered = branchPredictionTransition(changed, { type: 'sequence', value: 'n,t' })
      expect(recovered.error).toBeNull()
      expect(recovered.cursor).toBe(0)
      expect(recovered.pending).toBeNull()
      expect(runBranchPrediction(recovered).cursor).toBe(2)
    }
  })

  it('restarts when strategy or penalty changes and rejects invalid values', () => {
    const finished = runBranchPrediction(initialBranchPrediction())
    const changed = branchPredictionTransition(finished, { type: 'strategy', value: 'one-bit' })
    expect(changed.counter).toBe(0)
    expect(changed.cursor).toBe(0)
    expect(changed.sequence).toEqual(finished.sequence)
    const penalty = branchPredictionTransition(changed, { type: 'penalty', value: 5 })
    expect(penalty.penalty).toBe(5)
    for (const value of [-1, 0, 11, 1.5, '', 'invalid'])
      expect(branchPredictionTransition(penalty, { type: 'penalty', value })).toBe(penalty)
    expect(branchPredictionTransition(penalty, { type: 'strategy', value: 'invalid' })).toBe(penalty)
  })
})
