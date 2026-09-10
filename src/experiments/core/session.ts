import type {
  ExperimentAction,
  ExperimentSession,
  ExperimentView,
  Observation,
  Tone,
} from '../../types/experiment'

/** Wraps a pure model in a small, framework-independent session. */
export function createSession<S>(
  initial: () => S,
  transition: (state: S, action: ExperimentAction) => S,
  present: (state: S) => ExperimentView,
): ExperimentSession {
  let state = initial()
  return {
    view: () => present(state),
    dispatch: (action) => {
      state = transition(state, action)
    },
    reset: () => {
      state = initial()
    },
  }
}

export function addLog(
  log: Observation[],
  label: string,
  detail: string,
  tone: Tone = 'neutral',
): Observation[] {
  return [...log, { step: (log.at(-1)?.step ?? 0) + 1, label, detail, tone }].slice(-60)
}

export function integer(
  value: string | number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || String(value).trim() === '') return fallback
  const n = Number(value)
  return Number.isSafeInteger(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function address(value: string | number | undefined, max = 0xffff): number | null {
  const input = String(value ?? '').trim()
  if (!/^(?:0x[\da-f]+|\d+)$/i.test(input)) return null
  const n = Number(input)
  return Number.isSafeInteger(n) && n >= 0 && n <= max ? n : null
}

export function hex(n: number, digits = 4): string {
  return '0x' + n.toString(16).toUpperCase().padStart(digits, '0')
}
