import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
export interface SkipNode {
  member: string
  score: number
  next: (string | null)[]
}
export interface SkipList {
  head: (string | null)[]
  nodes: SkipNode[]
  seed: number
  path: string[]
  comparisons: number
}
export function emptySkipList(): SkipList {
  return { head: [null, null, null, null], nodes: [], seed: 19, path: [], comparisons: 0 }
}
const node = (list: SkipList, member: string) => list.nodes.find((n) => n.member === member)!
const compare = (a: Pick<SkipNode, 'score' | 'member'>, b: Pick<SkipNode, 'score' | 'member'>) =>
  a.score - b.score || (a.member < b.member ? -1 : a.member > b.member ? 1 : 0)
export function orderedSkipNodes(list: SkipList): SkipNode[] {
  const result: SkipNode[] = []
  let current = list.head[0]
  while (current !== null && current !== undefined) {
    const n = node(list, current)
    result.push(n)
    current = n.next[0]
    if (result.length > list.nodes.length) throw new Error('skip-list cycle')
  }
  return result
}
export function skipUpsert(list: SkipList, member: string, score: number): SkipList {
  const s = structuredClone(list)
  s.path = []
  s.comparisons = 0
  const existing = s.nodes.find((n) => n.member === member)
  if (existing) {
    for (let level = 0; level < 4; level++) {
      if (s.head[level] === member) s.head[level] = existing.next[level] ?? null
      for (const n of s.nodes) if (n.next[level] === member) n.next[level] = existing.next[level] ?? null
    }
    s.nodes = s.nodes.filter((n) => n.member !== member)
  }
  const update: (SkipNode | null)[] = Array(4).fill(null)
  let current: SkipNode | null = null
  for (let level = 3; level >= 0; level--) {
    let next = (current ? current.next[level] : s.head[level]) ?? null
    while (next !== null) {
      const candidate = node(s, next)
      s.comparisons++
      s.path.push(`L${level + 1}:${candidate.member}`)
      if (compare(candidate, { score, member }) >= 0) break
      current = candidate
      next = current.next[level] ?? null
    }
    update[level] = current
  }
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0
  let height = existing?.next.length ?? 1
  if (!existing) {
    let bits = s.seed >>> 16
    while (height < 4 && (bits & 1) === 0) {
      height++
      bits >>>= 1
    }
  }
  const inserted: SkipNode = { member, score, next: Array(height).fill(null) }
  for (let level = 0; level < height; level++) {
    const previous = update[level]
    inserted.next[level] = (previous ? previous.next[level] : s.head[level]) ?? null
    if (previous) previous.next[level] = member
    else s.head[level] = member
  }
  s.nodes.push(inserted)
  return s
}
type RedisValue =
  | { kind: 'string'; data: string }
  | { kind: 'list'; data: string[] }
  | { kind: 'hash'; data: { field: string; value: string }[] }
  | { kind: 'set'; data: string[] }
  | { kind: 'zset'; data: SkipList }
export interface RedisStructuresState {
  key: string
  value: string
  field: string
  score: string
  command: string
  entries: { key: string; value: RedisValue }[]
  result: string
  seen: string[]
  duplicateSeen: boolean
  zUpdated: boolean
  error: string | null
  log: Observation[]
}
export function initialRedisStructures(): RedisStructuresState {
  return {
    key: 'counter',
    value: '5',
    field: 'name',
    score: '10',
    command: 'SET',
    entries: [],
    result: '尚未执行',
    seen: [],
    duplicateSeen: false,
    zUpdated: false,
    error: null,
    log: [],
  }
}
export function redisStructuresTransition(
  state: RedisStructuresState,
  a: ExperimentAction,
): RedisStructuresState {
  if (['key', 'value', 'field', 'score', 'command'].includes(a.type))
    return { ...state, [a.type]: String(a.value ?? '') }
  if (a.type !== 'execute') return state
  if (!/^[A-Za-z][A-Za-z0-9:]{0,23}$/.test(state.key) || state.value.length > 24 || state.field.length > 24)
    return { ...state, error: '键使用 1–24 个字母、数字或冒号，首字符为字母；值和字段最多 24 字符。' }
  const s = structuredClone(state)
  s.error = null
  let entry = s.entries.find((e) => e.key === s.key)
  const type: Record<string, RedisValue['kind']> = {
    SET: 'string',
    GET: 'string',
    INCR: 'string',
    LPUSH: 'list',
    RPOP: 'list',
    HSET: 'hash',
    HGET: 'hash',
    SADD: 'set',
    SMEMBERS: 'set',
    ZADD: 'zset',
    ZRANGE: 'zset',
  }
  const expected = type[s.command]
  if (!expected) return state
  if (entry && entry.value.kind !== expected && s.command !== 'SET')
    return { ...state, error: 'WRONGTYPE：键已经保存另一种数据类型。' }
  if (!entry && ['GET', 'HGET', 'RPOP', 'SMEMBERS', 'ZRANGE'].includes(s.command))
    return { ...s, result: ['SMEMBERS', 'ZRANGE'].includes(s.command) ? '[]' : 'nil' }
  if (!entry) {
    if (s.entries.length >= 8) return { ...state, error: '教学键空间最多 8 个键。' }
    const value: RedisValue =
      expected === 'zset'
        ? { kind: 'zset', data: emptySkipList() }
        : expected === 'string'
          ? { kind: 'string', data: '0' }
          : expected === 'hash'
            ? { kind: 'hash', data: [] }
            : { kind: expected, data: [] }
    entry = { key: s.key, value }
    s.entries.push(entry)
  }
  if (s.command === 'SET') {
    entry.value = { kind: 'string', data: s.value }
    s.result = 'OK'
  } else if (entry.value.kind === 'string') {
    if (s.command === 'GET') s.result = entry.value.data
    else {
      if (!/^-?\d+$/.test(entry.value.data)) return { ...state, error: 'ERR value is not an integer' }
      const value = BigInt(entry.value.data) + 1n
      if (value < -(1n << 63n) || value > (1n << 63n) - 1n)
        return { ...state, error: 'ERR increment would overflow signed 64-bit' }
      entry.value.data = String(value)
      s.result = String(value)
      s.seen.push('string')
    }
  } else if (entry.value.kind === 'list') {
    if (s.command === 'LPUSH') {
      if (entry.value.data.length >= 12) return { ...state, error: '教学 List 最多 12 项。' }
      entry.value.data.unshift(s.value)
      s.result = String(entry.value.data.length)
    } else {
      s.result = entry.value.data.pop() ?? 'nil'
      s.seen.push('list')
      if (!entry.value.data.length) s.entries = s.entries.filter((e) => e.key !== s.key)
    }
  } else if (entry.value.kind === 'hash') {
    const item = entry.value.data.find((i) => i.field === s.field)
    if (s.command === 'HSET') {
      if (item) {
        item.value = s.value
        s.result = '0'
      } else {
        if (entry.value.data.length >= 12) return { ...state, error: '教学 Hash 最多 12 字段。' }
        entry.value.data.push({ field: s.field, value: s.value })
        s.result = '1'
      }
    } else {
      s.result = item?.value ?? 'nil'
      if (item) s.seen.push('hash')
    }
  } else if (entry.value.kind === 'set') {
    if (s.command === 'SADD') {
      const duplicate = entry.value.data.includes(s.value)
      if (!duplicate && entry.value.data.length >= 12) return { ...state, error: '教学 Set 最多 12 项。' }
      if (!duplicate) entry.value.data.push(s.value)
      s.duplicateSeen ||= duplicate
      s.result = duplicate ? '0' : '1'
      s.seen.push('set')
    } else s.result = JSON.stringify(entry.value.data)
  } else {
    if (s.command === 'ZADD') {
      if (
        !/^-?\d+(\.\d+)?$/.test(s.score) ||
        !Number.isFinite(Number(s.score)) ||
        Math.abs(Number(s.score)) > 999 ||
        !/^[A-Za-z][A-Za-z0-9]{0,11}$/.test(s.value)
      )
        return { ...state, error: '教学 score 在 -999–999，member 为 1–12 个 ASCII 字母数字且以字母开头。' }
      const old = entry.value.data.nodes.find((n) => n.member === s.value)
      if (!old && entry.value.data.nodes.length >= 12)
        return { ...state, error: '教学 ZSet 最多 12 个成员。' }
      s.zUpdated ||= !!old && old.score !== Number(s.score)
      entry.value.data = skipUpsert(entry.value.data, s.value, Number(s.score))
      s.result = old ? '0' : '1'
    } else {
      s.result = JSON.stringify(orderedSkipNodes(entry.value.data).map((n) => [n.member, n.score]))
      if (entry.value.data.nodes.length >= 3) s.seen.push('zset')
    }
  }
  s.seen = [...new Set(s.seen)]
  s.log = addLog(
    s.log,
    `${s.command} ${s.key}`,
    `返回 ${s.result}；SET 可以整体替换键，其他命令按当前键类型检查。`,
  )
  return s
}
export function presentRedisStructures(s: RedisStructuresState): ExperimentView {
  const selected = s.entries.find((e) => e.key === s.key)?.value,
    zset = selected?.kind === 'zset' ? selected.data : null,
    reached =
      ['string', 'list', 'hash', 'set', 'zset'].every((kind) => s.seen.includes(kind)) &&
      s.duplicateSeen &&
      s.zUpdated
  return {
    scene: {
      kind: 'data',
      title: '键对应一种 Redis 值类型，ZSet 同时约束成员唯一与分数顺序',
      tables: [
        {
          id: 'redis-values',
          title: '实际键空间',
          columns: ['键', 'TYPE', '值'],
          rows: s.entries.map((e) => ({
            id: e.key,
            values: [
              e.key,
              e.value.kind,
              e.value.kind === 'zset'
                ? JSON.stringify(orderedSkipNodes(e.value.data).map((n) => [n.member, n.score]))
                : JSON.stringify(e.value.data),
            ],
          })),
        },
        {
          id: 'redis-skip-list',
          title: 'ZSet 跳表指针 / 从高层导航到低层',
          columns: ['节点', 'score', 'L1', 'L2', 'L3', 'L4'],
          rows: zset
            ? [
                { id: 'head', values: ['HEAD', '−∞', ...zset.head.map((v) => v ?? '∅')] },
                ...zset.nodes.map((n) => ({
                  id: n.member,
                  values: [
                    n.member,
                    n.score,
                    ...Array.from({ length: 4 }, (_, i) => n.next[i] ?? (i < n.next.length ? '∅' : '—')),
                  ],
                })),
              ]
            : [],
        },
      ],
      caption:
        'String/List/Hash/Set 的逻辑命令与真实四层跳表 ZSet；同分 ASCII member 按字节序排序。固定种子生成层高，score 修改会重新连接指针。Redis 真实编码会按类型与大小使用 listpack、quicklist、字典或跳表等，本课不宣称所有 ZSet 都始终用跳表。String INCR 检查有符号 64 位整数，其他内存与复杂度不以 JS 运行时间度量。',
    },
    metrics: [
      { label: '最近命令返回', value: s.result },
      { label: '已验证值类型数', value: s.seen.length },
      { label: '本次跳表比较次数', value: zset?.comparisons ?? 0 },
    ],
    controls: [
      {
        id: 'command',
        kind: 'select',
        label: 'Redis 命令',
        value: s.command,
        options: [
          'SET',
          'GET',
          'INCR',
          'LPUSH',
          'RPOP',
          'HSET',
          'HGET',
          'SADD',
          'SMEMBERS',
          'ZADD',
          'ZRANGE',
        ].map((id) => ({ value: id, label: id })),
      },
      { id: 'key', kind: 'text', label: 'Redis key', value: s.key },
      { id: 'value', kind: 'text', label: 'value / member', value: s.value },
      { id: 'field', kind: 'text', label: 'Hash field', value: s.field },
      { id: 'score', kind: 'text', label: 'ZSet score', value: s.score },
      { id: 'execute', kind: 'button', label: '执行当前 Redis 命令', primary: true },
    ],
    status: {
      title: s.error ? '命令未执行' : reached ? '五类值与有序跳表操作均已验证' : '根据访问方式选择值类型',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '依次试验计数、列表出队、Hash 字段、Set 去重，再构造三成员 ZSet 并更新分数。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '完成 String 自增、List 出队、Hash 读取、Set 去重，再用三成员 ZSet 验证排序与分数更新。',
      reached,
    },
    log: s.log,
  }
}
export const redisStructuresEngine: EngineFactory = () =>
  createSession(initialRedisStructures, redisStructuresTransition, presentRedisStructures)
