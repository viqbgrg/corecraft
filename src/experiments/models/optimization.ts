import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger, integerList } from '../core/inputs'

export type OptimizationStrategy = 'greedy' | 'dp'
export interface OptimizationState {
  strategy: OptimizationStrategy
  draft: string
  coins: number[]
  amount: number
  remaining: number
  picked: number[]
  dp: number[]
  choice: (number | null)[]
  cursor: number
  comparisons: number
  done: boolean
  comparison: { name: string; coins: number[] | null; comparisons: number }[]
  error: string | null
  log: Observation[]
}
export function parseCoins(draft: string) {
  const coins = integerList(draft, 1, 20, 6)
  return coins && new Set(coins).size === coins.length ? coins.sort((a, b) => a - b) : null
}
export function initialOptimization(
  strategy: OptimizationStrategy = 'greedy',
  draft = '1 3 4',
  amount = 6,
): OptimizationState {
  const coins = parseCoins(draft)
  if (!coins || !['greedy', 'dp'].includes(strategy) || boundedInteger(amount, 1, 40) === null)
    throw new Error('Coin change requires greedy/dp, 1–6 unique denominations 1–20 and amount 1–40')
  return {
    strategy,
    draft,
    coins,
    amount,
    remaining: amount,
    picked: [],
    dp: Array.from({ length: amount + 1 }, (_, i) => (i ? Infinity : 0)),
    choice: Array.from({ length: amount + 1 }, () => null),
    cursor: 0,
    comparisons: 0,
    done: false,
    comparison: [],
    error: null,
    log: [],
  }
}
export function optimizationStep(state: OptimizationState): OptimizationState {
  if (state.done || state.error) return state
  if (state.strategy === 'greedy') {
    let coin: number | null = null,
      comparisons = state.comparisons
    for (const value of [...state.coins].reverse()) {
      comparisons++
      if (value <= state.remaining) {
        coin = value
        break
      }
    }
    const remaining = coin === null ? state.remaining : state.remaining - coin
    return {
      ...state,
      comparisons,
      remaining,
      picked: coin === null ? state.picked : [...state.picked, coin],
      cursor: state.cursor + 1,
      done: coin === null || remaining === 0,
      log: addLog(
        state.log,
        coin === null ? '贪心走入死路' : `取最大可用面额 ${coin}`,
        coin === null
          ? `剩余 ${remaining} 无法用任何一个面额继续。本次局部选择不会回退。`
          : `剩余 ${remaining}；先做当前最大的选择，不比较后续组合。`,
        coin === null ? 'warning' : 'neutral',
      ),
    }
  }
  const s = { ...state, dp: [...state.dp], choice: [...state.choice] },
    subtotal = state.cursor + 1
  for (const coin of s.coins) {
    if (coin > subtotal) break
    s.comparisons++
    const candidate = s.dp[subtotal - coin]! + 1
    if (candidate < s.dp[subtotal]!) {
      s.dp[subtotal] = candidate
      s.choice[subtotal] = coin
    }
  }
  s.cursor = subtotal
  s.done = subtotal === s.amount
  s.log = addLog(
    s.log,
    `求解金额 ${subtotal}`,
    Number.isFinite(s.dp[subtotal])
      ? `dp[${subtotal}]=${s.dp[subtotal]}，最后一枚选择 ${s.choice[subtotal]}；来自更小金额的最优解。`
      : '所有候选前驱都不可达，该金额保持 ∞。',
    Number.isFinite(s.dp[subtotal]) ? 'success' : 'warning',
  )
  return s
}
export function runOptimization(state: OptimizationState): OptimizationState {
  let s = state
  while (!s.done && !s.error) s = optimizationStep(s)
  return s
}
export function coinSolution(s: OptimizationState): number[] | null {
  if (!s.done) return null
  if (s.strategy === 'greedy') return s.remaining === 0 ? [...s.picked] : null
  if (!Number.isFinite(s.dp[s.amount])) return null
  const solution: number[] = []
  let rest = s.amount
  while (rest > 0) {
    const coin = s.choice[rest]!
    if (coin === null) return null
    solution.push(coin)
    rest -= coin
  }
  return solution
}
export function optimizationTransition(s: OptimizationState, a: ExperimentAction): OptimizationState {
  if (a.type === 'step') return optimizationStep(s)
  if (a.type === 'run') return runOptimization(s)
  if (a.type === 'coins') {
    const draft = String(a.value ?? '')
    return parseCoins(draft)
      ? initialOptimization(s.strategy, draft, s.amount)
      : { ...s, draft, error: '请输入 1–6 个不同的正整数面额（1–20），用空格或逗号分隔。' }
  }
  if (s.error) return s
  if (a.type === 'strategy' && ['greedy', 'dp'].includes(String(a.value)))
    return initialOptimization(a.value as OptimizationStrategy, s.draft, s.amount)
  if (a.type === 'amount') {
    const amount = boundedInteger(a.value, 1, 40)
    if (amount !== null) return initialOptimization(s.strategy, s.draft, amount)
  }
  if (a.type === 'compare')
    return {
      ...s,
      comparison: (['greedy', 'dp'] as const).map((strategy) => {
        const result = runOptimization(initialOptimization(strategy, s.draft, s.amount))
        return {
          name: strategy === 'greedy' ? '贪心' : '动态规划',
          coins: coinSolution(result),
          comparisons: result.comparisons,
        }
      }),
      log: addLog(
        s.log,
        '同一面额与目标的对照',
        '每种面额可无限使用；贪心失败不代表问题无解，DP 的 ∞ 才表示在本模型中不可达。',
        'success',
      ),
    }
  return s
}
export function presentOptimization(s: OptimizationState): ExperimentView {
  const solution = coinSolution(s)
  return {
    scene: {
      kind: 'data',
      title: '局部选择与最优子问题',
      sequence: (s.strategy === 'greedy' ? s.picked : (solution ?? [])).map((coin, i) => ({
        label: `第 ${i + 1} 枚`,
        value: coin,
      })),
      tables: [
        {
          id: 'dp-table',
          title: 'DP 状态（金额从小到大）',
          columns: ['金额', '最少枚数', '最后一枚', '前驱金额'],
          rows:
            s.strategy === 'dp'
              ? s.dp.map((count, i) => ({
                  id: String(i),
                  values: [
                    i,
                    i > s.cursor ? '待计算' : Number.isFinite(count) ? count : '∞',
                    s.choice[i] ?? '—',
                    s.choice[i] === null ? '—' : i - s.choice[i]!,
                  ],
                  tone: i === s.cursor ? 'warning' : 'neutral',
                }))
              : [],
        },
        {
          id: 'optimization-comparison',
          title: '相同问题的求解结果',
          columns: ['策略', '解', '枚数', '候选比较'],
          rows: s.comparison.map((c) => ({
            id: c.name,
            values: [c.name, c.coins?.join(' + ') ?? '未找到解', c.coins?.length ?? '—', c.comparisons],
          })),
        },
      ],
      caption:
        'dp[0]=0，dp[x]=min(dp[x−coin]+1)；正面额确保前驱更小且回溯终止。复杂度 O(金额 × 面额种数)，不是对输入位数的多项式界。',
    },
    metrics: [
      { label: '目标金额', value: s.amount },
      { label: '已求解 / 已选择', value: s.cursor },
      { label: '结果枚数', value: !s.done ? '进行中' : (solution?.length ?? '未找到解') },
      { label: '候选比较次数', value: s.comparisons },
    ],
    controls: [
      { id: 'coins', kind: 'text', label: '可用面额', value: s.draft },
      {
        id: 'amount',
        kind: 'number',
        label: '目标金额',
        value: s.amount,
        min: 1,
        max: 40,
        disabled: !!s.error,
      },
      {
        id: 'strategy',
        kind: 'select',
        label: '求解策略',
        value: s.strategy,
        options: [
          { value: 'greedy', label: 'Greedy · 先取最大' },
          { value: 'dp', label: 'DP · 最优子问题' },
        ],
        disabled: !!s.error,
      },
      {
        id: 'step',
        kind: 'button',
        label: '推进一个选择 / 子问题',
        primary: true,
        disabled: s.done || !!s.error,
      },
      { id: 'run', kind: 'button', label: '求解到结束', disabled: s.done || !!s.error },
      { id: 'compare', kind: 'button', label: '对比贪心与动态规划', disabled: !!s.error },
    ],
    status: {
      title: s.error
        ? '检查面额输入'
        : s.done
          ? solution
            ? '找到一个解'
            : '当前策略未找到解'
          : '一步一步构建解',
      detail: s.error ?? s.log.at(-1)?.detail ?? '面额 1、3、4，目标 6；先取 4 是否真的最省硬币？',
      tone: s.error ? 'danger' : s.done && !solution ? 'warning' : 'neutral',
    },
    goal: {
      label: '完成求解，并用同一面额与金额比较贪心和动态规划。',
      reached: !s.error && s.done && s.comparison.length === 2,
    },
    log: s.log,
  }
}
export const optimizationEngine: EngineFactory = (config) =>
  createSession(
    () =>
      initialOptimization(
        (config.strategy ?? 'greedy') as OptimizationStrategy,
        String(config.coins ?? '1 3 4'),
        Number(config.amount ?? 6),
      ),
    optimizationTransition,
    presentOptimization,
  )
