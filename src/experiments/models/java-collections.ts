import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export interface JavaValue {
  type: 'String' | 'Integer'
  value: string | number
}
export interface JavaMapEntry {
  key: string
  value: JavaValue
}
export type JavaContainer = 'list' | 'map' | 'set'
export interface JavaCollectionsState {
  container: JavaContainer
  list: JavaValue[]
  capacity: number
  map: JavaMapEntry[][]
  set: JavaMapEntry[][]
  key: string
  draft: string
  type: JavaValue['type']
  raw: boolean
  index: number
  moves: number
  collisions: number
  modCounts: Record<JavaContainer, number>
  iterator: { container: JavaContainer; expected: number; cursor: number } | null
  result: string
  grew: boolean
  castFailed: boolean
  error: string | null
  log: Observation[]
}
export function javaStringHash(key: string): number {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0
  return hash
}
export function javaBucket(key: string, capacity: number): number {
  const hash = javaStringHash(key)
  return (hash ^ (hash >>> 16)) & (capacity - 1)
}
export function putJavaMap(
  buckets: JavaMapEntry[][],
  key: string,
  value: JavaValue,
): { buckets: JavaMapEntry[][]; added: boolean; collided: boolean; rehashed: number } {
  let next = buckets.map((bucket) => bucket.map((entry) => ({ key: entry.key, value: { ...entry.value } })))
  const bucket = next[javaBucket(key, next.length)]!,
    existing = bucket.find((entry) => entry.key === key),
    collided = !existing && bucket.length > 0
  if (existing) existing.value = { ...value }
  else bucket.push({ key, value: { ...value } })
  let rehashed = 0
  if (next.flat().length > next.length * 0.75) {
    const entries = next.flat()
    next = Array.from({ length: next.length * 2 }, () => [])
    for (const entry of entries) {
      next[javaBucket(entry.key, next.length)]!.push(entry)
      rehashed++
    }
  }
  return { buckets: next, added: !existing, collided, rehashed }
}
export function initialJavaCollections(): JavaCollectionsState {
  return {
    container: 'list',
    list: [],
    capacity: 2,
    map: Array.from({ length: 4 }, () => []),
    set: Array.from({ length: 4 }, () => []),
    key: 'Aa',
    draft: 'A',
    type: 'String',
    raw: false,
    index: 0,
    moves: 0,
    collisions: 0,
    modCounts: { list: 0, map: 0, set: 0 },
    iterator: null,
    result: '尚未读取',
    grew: false,
    castFailed: false,
    error: null,
    log: [],
  }
}
const show = (value: JavaValue) => `${value.type}(${value.value})`
export function collectionsTransition(
  state: JavaCollectionsState,
  a: ExperimentAction,
): JavaCollectionsState {
  if (a.type === 'container' && ['list', 'map', 'set'].includes(String(a.value)))
    return { ...state, container: a.value as JavaContainer, error: null }
  if (a.type === 'key' || a.type === 'draft')
    return { ...state, [a.type]: String(a.value ?? '').slice(0, 32), error: null }
  if (a.type === 'type' && ['String', 'Integer'].includes(String(a.value)))
    return { ...state, type: a.value as JavaValue['type'], error: null }
  if (a.type === 'raw' && ['typed', 'raw'].includes(String(a.value)))
    return { ...state, raw: a.value === 'raw', error: null }
  if (a.type === 'index') {
    const index = boundedInteger(a.value, 0, 16)
    return index === null ? state : { ...state, index, error: null }
  }
  if (!['add', 'get', 'remove', 'iterator', 'next'].includes(a.type)) return state
  const s = structuredClone(state),
    kind = s.container
  s.error = null
  let detail = ''
  if (a.type === 'add') {
    const value: JavaValue = {
      type: s.type,
      value: s.type === 'String' ? s.draft : (boundedInteger(s.draft, -999, 999) ?? NaN),
    }
    if (typeof value.value === 'number' && !Number.isFinite(value.value))
      return { ...state, error: 'Integer 输入需要 −999 到 999 的整数。' }
    if (s.type !== 'String' && (!s.raw || kind === 'set'))
      return {
        ...state,
        error: '泛型检查拒绝 Integer：声明需要 String。本模型仅在 List / Map 演示 raw 引用绕过编译检查。',
      }
    if (kind === 'list') {
      if (s.list.length >= 16) return { ...state, error: '教学 List 最多 16 项。' }
      if (s.list.length === s.capacity) {
        s.moves += s.list.length
        s.capacity += Math.max(1, Math.floor(s.capacity / 2))
        s.grew = true
      }
      s.list.push(value)
      s.modCounts.list++
      detail = `ArrayList.add 写入 ${show(value)}；size=${s.list.length}，capacity=${s.capacity}。泛型擦除后容器按对象引用存放，读取 String 时仍需类型转换。`
    } else {
      const key = kind === 'map' ? s.key : s.draft
      if (!key) return { ...state, error: '教学键不能为空。' }
      if (s[kind].flat().length >= 16 && !s[kind].flat().some((entry) => entry.key === key))
        return { ...state, error: '教学哈希容器最多 16 个唯一键。' }
      const result = putJavaMap(s[kind], key, kind === 'set' ? { type: 'String', value: 'PRESENT' } : value)
      s[kind] = result.buckets
      s.collisions += Number(result.collided)
      s.moves += result.rehashed
      if (result.added) s.modCounts[kind]++
      detail = `${kind === 'map' ? 'HashMap.put' : 'HashSet.add'}(${key})：hash=${javaStringHash(key)}，${result.added ? '新增键' : kind === 'set' ? '重复元素不增加大小' : '替换同键的值'}${result.collided ? '，与已有不同键碰撞，按 equals 区分' : ''}${result.rehashed ? `；重分布 ${result.rehashed} 项` : ''}。`
    }
  } else if (a.type === 'get') {
    if (kind === 'set') {
      s.result = String(s.set[javaBucket(s.draft, s.set.length)]!.some((entry) => entry.key === s.draft))
      detail = `HashSet.contains(${s.draft}) → ${s.result}。`
    } else {
      const value =
        kind === 'list'
          ? s.list[s.index]
          : s.map[javaBucket(s.key, s.map.length)]!.find((entry) => entry.key === s.key)?.value
      if (!value) {
        if (kind === 'list') return { ...state, error: 'IndexOutOfBoundsException：索引必须小于 size。' }
        s.result = 'null'
        detail = 'Map 中不存在该键，get 返回 null。'
      } else if (value.type !== 'String') {
        s.castFailed = true
        s.error = `ClassCastException：实际为 ${value.type}，调用点尝试转换为 String。`
        s.result = '读取失败'
        detail = s.error
      } else {
        s.result = String(value.value)
        detail = `读取 ${show(value)}，调用点的 String 类型转换成功。`
      }
    }
  } else if (a.type === 'remove') {
    if (kind === 'list') {
      if (s.index >= s.list.length)
        return { ...state, error: 'IndexOutOfBoundsException：没有这个 List 下标。' }
      s.moves += s.list.length - s.index - 1
      s.list.splice(s.index, 1)
      s.modCounts.list++
      detail = '移除 List 项并移动后缀；size 减少，capacity 不自动缩小。'
    } else {
      const key = kind === 'map' ? s.key : s.draft,
        index = javaBucket(key, s[kind].length),
        before = s[kind][index]!.length
      s[kind][index] = s[kind][index]!.filter((entry) => entry.key !== key)
      if (before !== s[kind][index]!.length) s.modCounts[kind]++
      detail = `删除键 ${key}，桶中其他碰撞键仍然保留。`
    }
  } else if (a.type === 'iterator') {
    s.iterator = { container: kind, expected: s.modCounts[kind], cursor: 0 }
    detail = `迭代器记录 ${kind} 的结构修改计数 ${s.modCounts[kind]}。`
  } else {
    if (!s.iterator) return { ...state, error: '先创建迭代器。' }
    const iterator = s.iterator
    if (iterator.expected !== s.modCounts[iterator.container])
      return {
        ...state,
        error: 'ConcurrentModificationException：迭代器之外发生结构修改。fail-fast 不是线程安全保证。',
      }
    const values =
      iterator.container === 'list'
        ? s.list.map(show)
        : s[iterator.container].flat().map((entry) => entry.key)
    if (iterator.cursor >= values.length) return { ...state, error: 'NoSuchElementException：迭代已经结束。' }
    s.result = values[iterator.cursor++]!
    detail = `Iterator.next → ${s.result}。哈希桶迭代顺序不是 API 的排序保证。`
  }
  s.log = addLog(s.log, a.type, detail, s.error ? 'warning' : 'neutral')
  return s
}
export function presentJavaCollections(s: JavaCollectionsState): ExperimentView {
  const reached = s.grew && s.collisions > 0 && s.castFailed
  return {
    scene: {
      kind: 'data',
      title: '泛型约束调用点，集合结构决定存取工作',
      tables: [
        {
          id: 'java-array-list',
          title: 'ArrayList<String> / 连续引用槽位',
          columns: ['下标', '运行时对象', '使用状态'],
          rows: Array.from({ length: s.capacity }, (_, i) => ({
            id: String(i),
            values: [i, s.list[i] ? show(s.list[i]!) : '空槽', i < s.list.length ? 'size 内' : '预留容量'],
          })),
        },
        ...(['map', 'set'] as const).map((kind) => ({
          id: `java-hash-${kind}`,
          title: kind === 'map' ? 'HashMap<String,String> / 碰撞桶' : 'HashSet<String> / 用 Map 的键去重',
          columns: ['桶', '键 → 值', '项数'],
          rows: s[kind].map((bucket, i) => ({
            id: String(i),
            values: [
              i,
              bucket.map((entry) => `${entry.key} → ${show(entry.value)}`).join('\n') || '空',
              bucket.length,
            ],
          })),
        })),
      ],
      caption:
        'Java API 语义与算法教学：String.hashCode 的 32 位计算、扰动与链式桶；List 起始容量 2，以约 1.5 倍增长；Map 负载阈值 0.75、容量倍增。未实现红黑树桶、null、可变键、并发或所有 JDK 版本细节。泛型擦除并不等于所有泛型签名元数据消失；raw 污染只在 List / Map 演示。',
    },
    metrics: [
      { label: 'List size / capacity', value: `${s.list.length} / ${s.capacity}` },
      { label: 'Map / Set 唯一键', value: `${s.map.flat().length} / ${s.set.flat().length}` },
      { label: '不同键碰撞次数', value: s.collisions },
      { label: '复制 / 搬移 / 重分布', value: s.moves },
      { label: '最近读取结果', value: s.result },
    ],
    controls: [
      {
        id: 'container',
        kind: 'select',
        label: 'Java 集合实现',
        value: s.container,
        options: [
          { value: 'list', label: 'ArrayList<String>' },
          { value: 'map', label: 'HashMap<String,String>' },
          { value: 'set', label: 'HashSet<String>' },
        ],
      },
      { id: 'key', kind: 'text', label: 'HashMap 字符串键', value: s.key },
      { id: 'draft', kind: 'text', label: '元素 / 值 / Set 查询键', value: s.draft },
      {
        id: 'type',
        kind: 'select',
        label: '待写入对象的运行时类型',
        value: s.type,
        options: [
          { value: 'String', label: 'String' },
          { value: 'Integer', label: 'Integer / 装箱整数' },
        ],
      },
      {
        id: 'raw',
        kind: 'select',
        label: 'List / Map 写入调用点',
        value: s.raw ? 'raw' : 'typed',
        options: [
          { value: 'typed', label: '有泛型检查的代码' },
          { value: 'raw', label: 'raw 引用 / 未检查调用' },
        ],
      },
      { id: 'index', kind: 'number', label: 'List 下标', value: s.index, min: 0, max: 16 },
      { id: 'add', kind: 'button', label: 'add / put · 写入集合', primary: true },
      { id: 'get', kind: 'button', label: 'get / contains · 读取集合' },
      { id: 'remove', kind: 'button', label: 'remove · 删除集合项' },
      { id: 'iterator', kind: 'button', label: '创建当前集合的 Iterator' },
      { id: 'next', kind: 'button', label: 'Iterator.next', disabled: !s.iterator },
    ],
    status: {
      title: s.error
        ? '集合操作暴露类型或状态边界'
        : reached
          ? '结构成本与泛型检查发生在不同层'
          : '相同接口可以有不同存储机制',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '向 List 添加三项触发增长，再 raw 插入 Integer 并按 String 读取；Map 用 Aa 与 BB 两个键制造真实 hashCode 碰撞。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '观察 List 扩容、Aa / BB 不同键碰撞，并用 raw 污染触发读取时的 ClassCastException。',
      reached,
    },
    log: s.log,
  }
}
export const collectionsEngine: EngineFactory = () =>
  createSession(initialJavaCollections, collectionsTransition, presentJavaCollections)
