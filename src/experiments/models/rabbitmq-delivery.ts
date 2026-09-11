import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
export function topicMatches(pattern: string, key: string): boolean {
  const p = pattern.split('.'),
    k = key.split('.')
  const visit = (i: number, j: number): boolean =>
    i === p.length
      ? j === k.length
      : p[i] === '#'
        ? visit(i + 1, j) || (j < k.length && visit(i, j + 1))
        : j < k.length && (p[i] === '*' || p[i] === k[j]) && visit(i + 1, j + 1)
  return visit(0, 0)
}
interface Message {
  id: string
  value: string
  publication: number
  redelivered: boolean
}
interface Queue {
  name: string
  binding: string
  ready: Message[]
}
interface Delivery {
  tag: number
  queue: string
  message: Message
  processed: boolean
}
export interface RabbitState {
  exchange: 'topic' | 'direct'
  routing: string
  id: string
  value: string
  queue: string
  dedup: boolean
  prefetch: number
  queues: Queue[]
  unacked: Delivery[]
  publications: { id: number; messageId: string; routes: string[]; confirmed: boolean; returned: boolean }[]
  nextPublication: number
  nextTag: number
  inbox: string[]
  effects: { queue: string; id: string; value: string }[]
  acks: number
  skips: number
  redeliveredSeen: boolean
  returnSeen: boolean
  error: string | null
  log: Observation[]
}
export function initialRabbit(): RabbitState {
  return {
    exchange: 'topic',
    routing: 'orders.created',
    id: 'order-1',
    value: 'charge 20',
    queue: 'orders',
    dedup: true,
    prefetch: 1,
    queues: [
      { name: 'orders', binding: 'orders.*', ready: [] },
      { name: 'audit', binding: 'orders.#', ready: [] },
      { name: 'dead', binding: '(DLX only)', ready: [] },
    ],
    unacked: [],
    publications: [],
    nextPublication: 1,
    nextTag: 1,
    inbox: [],
    effects: [],
    acks: 0,
    skips: 0,
    redeliveredSeen: false,
    returnSeen: false,
    error: null,
    log: [],
  }
}
export function rabbitTransition(state: RabbitState, a: ExperimentAction): RabbitState {
  if (['routing', 'id', 'value'].includes(a.type)) return { ...state, [a.type]: String(a.value ?? '') }
  if (a.type === 'exchange' && ['topic', 'direct'].includes(String(a.value)))
    return { ...state, exchange: a.value as RabbitState['exchange'] }
  if (a.type === 'queue' && ['orders', 'audit', 'dead'].includes(String(a.value)))
    return { ...state, queue: String(a.value) }
  if (a.type === 'dedup' && ['on', 'off'].includes(String(a.value)))
    return { ...state, dedup: a.value === 'on' }
  if (a.type === 'prefetch' && ['1', '2'].includes(String(a.value)))
    return { ...state, prefetch: Number(a.value) }
  if (
    !['publish', 'confirm', 'deliver', 'process', 'ack', 'disconnect', 'nack-requeue', 'nack-dead'].includes(
      a.type,
    )
  )
    return state
  const s = structuredClone(state)
  s.error = null
  let detail = ''
  if (a.type === 'publish') {
    if (
      !s.id ||
      s.id.length > 24 ||
      s.value.length > 32 ||
      !s.routing ||
      s.routing.split('.').length > 6 ||
      s.routing.length > 64
    )
      return { ...state, error: '请使用短 message id、载荷与最多六段 routing key。' }
    if (s.publications.length >= 20) return { ...state, error: '教学发布轨迹最多 20 次。' }
    const publication = s.nextPublication++,
      routes = s.queues
        .filter(
          (q) =>
            q.name !== 'dead' &&
            (s.exchange === 'topic' ? topicMatches(q.binding, s.routing) : q.binding === s.routing),
        )
        .map((q) => q.name)
    for (const name of routes)
      s.queues
        .find((q) => q.name === name)!
        .ready.push({ id: s.id, value: s.value, publication, redelivered: false })
    s.publications.push({
      id: publication,
      messageId: s.id,
      routes,
      confirmed: false,
      returned: routes.length === 0,
    })
    s.returnSeen ||= routes.length === 0
    detail = `Exchange 路由到 ${routes.join(', ') || '无队列'}。${routes.length ? '每个匹配队列各有一份副本；相同 message id 的再次发布不会由 broker 自动去重。' : '本课 mandatory=true，basic.return 把不可路由消息退还。'}`
  } else if (a.type === 'confirm') {
    for (const p of s.publications) p.confirmed = true
    detail =
      'Publisher confirm 确认 broker 已处理发布；unroutable 的 mandatory return 可先发生，随后仍有 confirm。它不证明消费者已执行业务。'
  } else if (a.type === 'deliver') {
    if (s.unacked.length >= s.prefetch)
      return { ...state, error: '当前 channel 未确认数量达到 prefetch，暂停进一步投递。' }
    const queue = s.queues.find((q) => q.name === s.queue)!,
      message = queue.ready.shift()
    if (!message) return { ...state, error: '当前队列没有 ready 消息。' }
    s.unacked.push({ tag: s.nextTag++, queue: queue.name, message, processed: false })
    s.redeliveredSeen ||= message.redelivered
    detail = `basic.deliver ${message.id}，delivery tag 属于当前 channel，redelivered=${message.redelivered}；消息现在是 unacked。`
  } else if (a.type === 'disconnect') {
    for (const delivery of [...s.unacked].reverse())
      s.queues
        .find((q) => q.name === delivery.queue)!
        .ready.unshift({ ...delivery.message, redelivered: true })
    s.unacked = []
    detail = '消费者 channel 断开，未确认消息重新入队；已经发生的外部业务副作用不自动回滚。'
  } else {
    const delivery = s.unacked[0]
    if (!delivery) return { ...state, error: '当前 channel 没有待确认投递。' }
    if (a.type === 'process') {
      if (delivery.processed) return { ...state, error: '此投递已处理；重复场景通过断连重投观察。' }
      const inboxKey = `${delivery.queue}:${delivery.message.id}`
      delivery.processed = true
      if (s.dedup && s.inbox.includes(inboxKey)) {
        s.skips++
        detail = `应用 inbox 已有 ${inboxKey}，跳过重复业务。`
      } else {
        if (s.dedup) s.inbox.push(inboxKey)
        s.effects.push({ queue: delivery.queue, id: delivery.message.id, value: delivery.message.value })
        detail = '应用在同一个本地事务中写入唯一 inbox id 与业务效果；随后仍需独立发送 consumer ack。'
      }
    } else if (a.type === 'ack') {
      s.unacked.shift()
      s.acks++
      detail = `basic.ack ${delivery.tag} 移除未确认消息。Broker 不知道业务是否处理，过早 ack 也会删除它；此处 processed=${delivery.processed}。`
    } else if (a.type === 'nack-requeue') {
      s.unacked.shift()
      s.queues
        .find((q) => q.name === delivery.queue)!
        .ready.unshift({ ...delivery.message, redelivered: true })
      detail = 'basic.nack(requeue=true) 重新排队；无上限重试可能形成失败循环。'
    } else {
      s.unacked.shift()
      s.queues.find((q) => q.name === 'dead')!.ready.push({ ...delivery.message, redelivered: false })
      detail =
        'basic.nack(requeue=false) 通过本课配置的 DLX 路由到 dead 队列，供单独检查；不是自动修复失败原因。'
    }
  }
  s.log = addLog(s.log, a.type, detail)
  return s
}
export function presentRabbit(s: RabbitState): ExperimentView {
  const reached =
    s.publications.some((p) => p.confirmed) && s.returnSeen && s.redeliveredSeen && s.skips > 0 && s.acks > 0
  return {
    scene: {
      kind: 'data',
      title: 'Exchange 路由，Queue 保存，publisher confirm 与 consumer ack 各有方向',
      tables: [
        {
          id: 'rabbit-queues',
          title: '绑定与 ready 队列',
          columns: ['队列', 'binding', 'ready 消息 id'],
          rows: s.queues.map((q) => ({
            id: q.name,
            values: [
              q.name,
              q.binding,
              q.ready.map((m) => m.id + (m.redelivered ? ' ↻' : '')).join(', ') || '空',
            ],
          })),
        },
        {
          id: 'rabbit-unacked',
          title: '单个消费者 channel 的 unacked',
          columns: ['tag', '队列', 'message id', '业务已处理', 'redelivered'],
          rows: s.unacked.map((d) => ({
            id: String(d.tag),
            values: [d.tag, d.queue, d.message.id, String(d.processed), String(d.message.redelivered)],
          })),
        },
        {
          id: 'rabbit-publisher',
          title: '发布确认 / mandatory return',
          columns: ['发布', 'message id', '路由', 'confirm', 'returned'],
          rows: s.publications.map((p) => ({
            id: String(p.id),
            values: [p.id, p.messageId, p.routes.join(', ') || '无', String(p.confirmed), String(p.returned)],
          })),
        },
        {
          id: 'rabbit-effects',
          title: '应用本地事务中的业务效果',
          columns: ['队列 / 应用', 'message id', '效果'],
          rows: s.effects.map((e, i) => ({ id: String(i), values: [e.queue, e.id, e.value] })),
        },
      ],
      caption:
        'Topic / Direct exchange、两个绑定队列、一个显式 DLX 目标与单 consumer channel；topic * 匹配一段，# 匹配零或多段。队列中的副本可由不同应用独立消费；inbox 唯一键按应用队列 + message id。假设 broker 已可靠存储被确认发布，未模拟 quorum queues、持久盘故障、TTL、优先级或消费者竞争时的重投排序。',
    },
    metrics: [
      { label: '业务效果次数', value: s.effects.length },
      { label: '应用去重跳过次数', value: s.skips },
      { label: 'consumer ack 次数', value: s.acks },
      { label: 'unacked 数量', value: s.unacked.length },
    ],
    controls: [
      {
        id: 'exchange',
        kind: 'select',
        label: '发布 exchange 类型',
        value: s.exchange,
        options: [
          { value: 'topic', label: 'topic / 词段匹配' },
          { value: 'direct', label: 'direct / 完全相等' },
        ],
      },
      { id: 'routing', kind: 'text', label: 'routing key', value: s.routing },
      { id: 'id', kind: 'text', label: 'message id', value: s.id },
      { id: 'value', kind: 'text', label: '消息载荷', value: s.value },
      {
        id: 'queue',
        kind: 'select',
        label: '当前消费队列',
        value: s.queue,
        options: ['orders', 'audit', 'dead'].map((id) => ({ value: id, label: id })),
      },
      {
        id: 'dedup',
        kind: 'select',
        label: '应用是否启用事务 inbox',
        value: s.dedup ? 'on' : 'off',
        options: [
          { value: 'on', label: '唯一 inbox + 业务效果' },
          { value: 'off', label: '无应用去重' },
        ],
      },
      {
        id: 'prefetch',
        kind: 'select',
        label: '当前 channel prefetch',
        value: String(s.prefetch),
        options: ['1', '2'].map((id) => ({ value: id, label: id })),
      },
      ...[
        ['publish', 'basic.publish · 发布消息'],
        ['confirm', '接收 publisher confirm'],
        ['deliver', '向消费者投递一条消息'],
        ['process', '处理当前投递的业务'],
        ['ack', 'basic.ack · 确认当前投递'],
        ['disconnect', '断开消费者 channel 并重连'],
        ['nack-requeue', 'basic.nack · 重新入队'],
        ['nack-dead', 'basic.nack · 进入死信队列'],
      ].map(([id, label]) => ({
        id: id!,
        label: label!,
        kind: 'button' as const,
        primary: id === 'deliver',
      })),
    ],
    status: {
      title: s.error
        ? '投递操作暂不能继续'
        : reached
          ? '路由、双向确认与应用去重已验证'
          : '确认发布不等于确认业务效果',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '发布并确认，处理后不 ack 就断连，再重投去重并 ack；另发无法路由的 key 检查 mandatory return。',
      tone: s.error ? 'warning' : reached ? 'success' : 'neutral',
    },
    goal: {
      label: '观察 publisher confirm、未 ack 重投与应用去重，再处理一次 mandatory 不可路由返回。',
      reached,
    },
    log: s.log,
  }
}
export const rabbitEngine: EngineFactory = () => createSession(initialRabbit, rabbitTransition, presentRabbit)
