import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'
type DeliveryMode = 'at-least' | 'at-most' | 'transactional'
interface KafkaRecord {
  offset: number
  key: string
  value: number
  producerSeq: number
}
interface Pending {
  partition: number
  offset: number
  value: number
  processed: boolean
  generation: number
}
interface Consumer {
  id: string
  position: number[]
  pending: Pending | null
}
interface KafkaOutput {
  partition: number
  offset: number
  value: number
  generation: number
  state: 'pending' | 'committed' | 'aborted'
}
export interface KafkaState {
  mode: DeliveryMode
  idempotent: boolean
  key: string
  value: number
  partition: number
  selected: string
  logs: KafkaRecord[][]
  producerSeq: number[]
  lastSend: { partition: number; record: Omit<KafkaRecord, 'offset'> } | null
  members: string[]
  assignment: string[]
  generation: number
  consumers: Consumer[]
  committed: number[]
  externalEffects: { partition: number; offset: number; value: number }[]
  output: KafkaOutput[]
  dedup: number
  dedupSeen: boolean
  duplicateSeen: boolean
  lossSeen: boolean
  transactionSeen: boolean
  error: string | null
  log: Observation[]
}
export function initialKafka(): KafkaState {
  return {
    mode: 'at-least',
    idempotent: true,
    key: 'B',
    value: 1,
    partition: 0,
    selected: 'C1',
    logs: [[], []],
    producerSeq: [0, 0],
    lastSend: null,
    members: ['C1'],
    assignment: ['C1', 'C1'],
    generation: 1,
    consumers: ['C1', 'C2'].map((id) => ({ id, position: [0, 0], pending: null })),
    committed: [0, 0],
    externalEffects: [],
    output: [],
    dedup: 0,
    dedupSeen: false,
    duplicateSeen: false,
    lossSeen: false,
    transactionSeen: false,
    error: null,
    log: [],
  }
}
export const kafkaPartition = (key: string) =>
  [...new TextEncoder().encode(key)].reduce((n, b) => n + b, 0) % 2
function newKafkaScenario(s: KafkaState): KafkaState {
  return {
    ...initialKafka(),
    mode: s.mode,
    idempotent: s.idempotent,
    dedupSeen: s.dedupSeen,
    duplicateSeen: s.duplicateSeen,
    lossSeen: s.lossSeen,
    transactionSeen: s.transactionSeen,
    log: addLog(s.log, '新消息场景', '从空 Topic / 同一消费组开始，保留已验证的投递语义证据。'),
  }
}
function appendKafka(s: KafkaState, partition: number, record: Omit<KafkaRecord, 'offset'>) {
  const log = s.logs[partition]!
  if (s.idempotent && log.some((r) => r.producerSeq === record.producerSeq)) {
    s.dedup++
    s.dedupSeen = true
    return
  }
  log.push({ ...record, offset: log.length })
}
function abortPendingOutput(s: KafkaState, p: Pending) {
  for (const out of s.output)
    if (
      out.partition === p.partition &&
      out.offset === p.offset &&
      out.generation === p.generation &&
      out.state === 'pending'
    )
      out.state = 'aborted'
}
export function kafkaTransition(state: KafkaState, a: ExperimentAction): KafkaState {
  if (a.type === 'mode' && ['at-least', 'at-most', 'transactional'].includes(String(a.value)))
    return { ...newKafkaScenario(state), mode: a.value as DeliveryMode }
  if (a.type === 'idempotent' && ['on', 'off'].includes(String(a.value)))
    return { ...newKafkaScenario(state), idempotent: a.value === 'on' }
  if (a.type === 'key') return { ...state, key: String(a.value ?? '') }
  if (a.type === 'value') {
    const n = boundedInteger(a.value, 1, 9)
    return n === null ? state : { ...state, value: n }
  }
  if (a.type === 'partition' && ['0', '1'].includes(String(a.value)))
    return { ...state, partition: Number(a.value) }
  if (a.type === 'selected' && ['C1', 'C2'].includes(String(a.value)))
    return { ...state, selected: String(a.value) }
  if (!['send', 'retry', 'fetch', 'process', 'commit', 'crash', 'rebalance', 'read-output'].includes(a.type))
    return state
  const s = structuredClone(state),
    c = s.consumers.find((c) => c.id === s.selected)!
  s.error = null
  let detail = ''
  if (a.type === 'send' || a.type === 'retry') {
    if (s.logs.flat().length >= 20) return { ...state, error: '教学 Topic 最多 20 条记录。' }
    if (a.type === 'send') {
      if (!s.key || s.key.length > 16) return { ...state, error: '教学 key 长度为 1–16。' }
      const partition = kafkaPartition(s.key)
      s.lastSend = {
        partition,
        record: { key: s.key, value: s.value, producerSeq: s.producerSeq[partition]!++ },
      }
    }
    if (!s.lastSend) return { ...state, error: '先发送一条记录，再模拟相同 producer sequence 的重试。' }
    appendKafka(s, s.lastSend.partition, s.lastSend.record)
    detail = `Producer → Broker P${s.lastSend.partition}，seq=${s.lastSend.record.producerSeq}；日志长度=${s.logs[s.lastSend.partition]!.length}。同键分区只保证该分区内顺序。`
  } else if (a.type === 'rebalance') {
    s.members = s.members.length === 1 ? ['C1', 'C2'] : ['C1']
    s.generation++
    s.assignment = [s.members[0]!, s.members.length === 2 ? s.members[1]! : s.members[0]!]
    for (const consumer of s.consumers) {
      if (consumer.pending) abortPendingOutput(s, consumer.pending)
      consumer.position = [...s.committed]
    }
    detail = `消费组 generation=${s.generation}，P0→${s.assignment[0]}、P1→${s.assignment[1]}；从已提交 next offset 恢复。旧代未完成调用保留供检查，不能提交给新代。`
  } else if (a.type === 'crash') {
    if (c.pending) {
      const p = c.pending
      s.lossSeen ||= s.mode === 'at-most' && !p.processed && s.committed[p.partition]! > p.offset
      abortPendingOutput(s, p)
    }
    c.pending = null
    c.position = [...s.committed]
    detail = `${c.id} 崩溃并重启，本地 position 回到组 committed next offset；外部副作用没有因此回滚。`
  } else if (a.type === 'read-output') {
    detail = `read_committed 只返回 ${s.output.filter((o) => o.state === 'committed').length} 条已提交输出；pending / aborted 不可见。`
  } else if (a.type === 'fetch') {
    if (c.pending) return { ...state, error: '当前消费者仍有一条未完成记录，请提交或重启。' }
    if (s.assignment[s.partition] !== c.id) return { ...state, error: '此分区分配给同组另一消费者。' }
    const record = s.logs[s.partition]![c.position[s.partition]!]
    if (!record) return { ...state, error: '当前分区没有更多记录。' }
    c.pending = {
      partition: s.partition,
      offset: record.offset,
      value: record.value,
      processed: false,
      generation: s.generation,
    }
    c.position[s.partition] = record.offset + 1
    if (s.mode === 'at-most') s.committed[s.partition] = record.offset + 1
    detail = `${c.id} fetch P${s.partition}@${record.offset}，position 指向 ${record.offset + 1}；${s.mode === 'at-most' ? '先提交 offset，再执行业务。' : '尚未提交组 offset。'}`
  } else {
    const p = c.pending
    if (!p) return { ...state, error: '先 fetch 当前消费者的一条记录。' }
    if (p.generation !== s.generation || s.assignment[p.partition] !== c.id)
      return { ...state, error: 'CommitFailed / 旧 generation 或分区已撤销，不能继续本次处理与提交。' }
    if (a.type === 'process') {
      if (p.processed) return { ...state, error: '本次 delivery 已处理；要验证重复投递请在未提交时重启。' }
      p.processed = true
      s.externalEffects.push({ partition: p.partition, offset: p.offset, value: p.value })
      s.duplicateSeen ||=
        s.mode === 'at-least' &&
        s.externalEffects.filter((e) => e.partition === p.partition && e.offset === p.offset).length > 1
      if (s.mode === 'transactional')
        s.output.push({
          partition: p.partition,
          offset: p.offset,
          value: p.value,
          generation: p.generation,
          state: 'pending',
        })
      detail = `业务执行 +${p.value}。${s.mode === 'transactional' ? 'Kafka 输出暂未提交；此处额外展示的外部数据库副作用不在 Kafka 事务内。' : '外部效果已发生，消费 offset 是另一项提交。'}`
    } else {
      if (!p.processed)
        return { ...state, error: '正常完成路径先处理记录；at-most 的提前提交已在 fetch 发生。' }
      s.committed[p.partition] = p.offset + 1
      if (s.mode === 'transactional') {
        const current = [...s.output]
          .reverse()
          .find((o) => o.partition === p.partition && o.offset === p.offset && o.state === 'pending')!
        current.state = 'committed'
        s.transactionSeen ||=
          s.output.some(
            (o) => o.state === 'aborted' && o.partition === p.partition && o.offset === p.offset,
          ) &&
          s.output.filter(
            (o) => o.state === 'committed' && o.partition === p.partition && o.offset === p.offset,
          ).length === 1
      }
      c.pending = null
      detail = `组 offset=${p.offset + 1}（下一条）。${s.mode === 'transactional' ? '输出与消费 offset 在同一 Kafka 事务中原子提交。' : 'offset 提交不会重写已经发生的外部副作用。'}`
    }
  }
  s.log = addLog(s.log, a.type, detail)
  return s
}
export function presentKafka(s: KafkaState): ExperimentView {
  const reached = s.dedupSeen && s.duplicateSeen && s.lossSeen && s.transactionSeen
  return {
    scene: {
      kind: 'data',
      title: 'Partition 日志、消费 next offset 与业务效果分别记录',
      tables: [
        {
          id: 'kafka-log',
          title: 'Topic input / Broker 分区日志',
          columns: ['分区', 'offset', 'key', 'value', 'producer seq'],
          rows: s.logs.flatMap((log, p) =>
            log.map((r) => ({
              id: `${p}:${r.offset}`,
              values: [p, r.offset, r.key, r.value, r.producerSeq],
            })),
          ),
        },
        {
          id: 'kafka-group',
          title: `同一 Consumer Group / generation ${s.generation}`,
          columns: ['分区', '拥有者', 'committed next offset', 'C1 position', 'C2 position'],
          rows: s.assignment.map((owner, p) => ({
            id: String(p),
            values: [p, owner, s.committed[p]!, s.consumers[0]!.position[p]!, s.consumers[1]!.position[p]!],
          })),
        },
        {
          id: 'kafka-output',
          title: '事务 Topic output / read_committed 隐藏未提交及中止记录',
          columns: ['来源', 'value', '状态'],
          rows: s.output.map((o, i) => ({
            id: String(i),
            values: [`P${o.partition}@${o.offset}`, o.value, o.state],
          })),
        },
      ],
      caption:
        '两分区、一个消费组、同一 producer 会话；key 字节和取模为教学分区器，不是 Kafka 默认哈希算法。幂等按分区 sequence 去重，事务输出和 offset 原子提交；额外外部效果明确不在事务内。省略 ISR/复制持久化、真实 broker RPC、事务 marker、LSO、生产者 fencing 和完整 rebalance 协议。',
    },
    metrics: [
      { label: 'Broker 去重次数', value: s.dedup },
      { label: '外部业务效果总和', value: s.externalEffects.reduce((n, e) => n + e.value, 0) },
      { label: 'read_committed 输出数', value: s.output.filter((o) => o.state === 'committed').length },
    ],
    controls: [
      {
        id: 'mode',
        kind: 'select',
        label: '新场景消费语义',
        value: s.mode,
        options: [
          { value: 'at-least', label: '处理后提交 / at-least-once' },
          { value: 'at-most', label: '先提交再处理 / at-most-once' },
          { value: 'transactional', label: 'Kafka 输出 + offset 事务' },
        ],
      },
      {
        id: 'idempotent',
        kind: 'select',
        label: '新 Producer 场景是否幂等',
        value: s.idempotent ? 'on' : 'off',
        options: [
          { value: 'on', label: '幂等序列去重' },
          { value: 'off', label: '重试可重复追加' },
        ],
      },
      { id: 'key', kind: 'text', label: '新消息 key', value: s.key },
      { id: 'value', kind: 'number', label: '消息业务增量', value: s.value, min: 1, max: 9 },
      {
        id: 'partition',
        kind: 'select',
        label: 'fetch 分区',
        value: String(s.partition),
        options: [
          { value: '0', label: 'P0' },
          { value: '1', label: 'P1' },
        ],
      },
      {
        id: 'selected',
        kind: 'select',
        label: '当前消费者',
        value: s.selected,
        options: ['C1', 'C2'].map((id) => ({ value: id, label: id })),
      },
      ...[
        ['send', 'Producer 发送新记录'],
        ['retry', '模拟确认丢失后的相同序列重试'],
        ['fetch', 'Consumer fetch 一条记录'],
        ['process', '执行业务并生成适用的事务输出'],
        ['commit', '提交处理结果与适用的 offset'],
        ['crash', '消费者崩溃并从 committed 重启'],
        ['rebalance', '切换 C2 入组 / 离组并重分配'],
        ['read-output', '以 read_committed 读取输出'],
      ].map(([id, label]) => ({ id: id!, label: label!, kind: 'button' as const, primary: id === 'fetch' })),
    ],
    status: {
      title: s.error
        ? '消费者或提交前提不满足'
        : reached
          ? '三种投递语义与事务作用域已验证'
          : '消息顺序、投递次数与外部副作用是不同保证',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先重试 Producer 验证去重，再在处理和提交之间崩溃；切换另外两种消费协议对照结果。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label:
        '验证 Producer 去重、at-least-once 重复、at-most-once 丢失，并让 Kafka 事务输出在重试后只提交一次。',
      reached,
    },
    log: s.log,
  }
}
export const kafkaEngine: EngineFactory = () => createSession(initialKafka, kafkaTransition, presentKafka)
