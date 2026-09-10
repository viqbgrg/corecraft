import { courses } from '../courses'
import type { ConceptReference } from '../types/course'

const planned: ConceptReference[] = [
  { id: 'signed-number', title: '有符号数与补码', level: 1 },
  { id: 'pipeline', title: '指令流水线', level: 2 },
  { id: 'process', title: '进程', level: 3 },
  { id: 'thread', title: '线程', level: 3 },
  { id: 'context-switch', title: '上下文切换', level: 3 },
  { id: 'virtual-memory', title: '虚拟内存', level: 3 },
  { id: 'page', title: '页与页表', level: 3 },
  { id: 'tlb', title: 'TLB', level: 3 },
  { id: 'page-fault', title: '缺页异常', level: 3 },
  { id: 'page-cache', title: 'Page Cache', level: 3 },
  { id: 'socket', title: 'Socket', level: 4 },
  { id: 'reactor', title: 'Reactor', level: 11 },
  { id: 'tcp', title: 'TCP 连接', level: 4 },
  { id: 'sequence', title: 'Sequence / ACK', level: 4 },
  { id: 'retransmission', title: '丢包与重传', level: 4 },
  { id: 'tcp-close', title: 'TCP 关闭', level: 4 },
  { id: 'time-wait', title: 'TIME_WAIT', level: 4 },
  { id: 'dns', title: 'DNS', level: 4 },
  { id: 'dns-cache', title: 'DNS 缓存与 TTL', level: 4 },
  { id: 'http', title: 'HTTP', level: 4 },
  { id: 'tls', title: 'TLS', level: 4 },
  { id: 'btree', title: 'B+Tree', level: 5 },
  { id: 'index', title: '数据库索引', level: 6 },
  { id: 'buffer-pool', title: 'Buffer Pool', level: 6 },
  { id: 'clustered-index', title: 'InnoDB 聚簇索引', level: 7 },
  { id: 'java-thread', title: 'Java Thread', level: 10 },
  { id: 'jmm', title: 'Java Memory Model', level: 10 },
  { id: 'volatile', title: 'volatile', level: 10 },
  { id: 'cas', title: 'CAS', level: 10 },
  { id: 'aqs', title: 'AQS', level: 10 },
  { id: 'reentrant-lock', title: 'ReentrantLock', level: 10 },
]
const references = new Map(planned.map((c) => [c.id, c]))
for (const course of courses) {
  references.set(course.id, {
    id: course.id,
    title: course.title,
    level: course.level,
    courseId: course.slug,
  })
  for (const concept of course.concepts)
    references.set(concept.id, {
      id: concept.id,
      title: concept.title,
      level: course.level,
      courseId: course.slug,
    })
}
export function conceptReference(id: string): ConceptReference {
  return references.get(id) ?? { id, title: id, level: 0 }
}
export const knowledgePaths = [
  ['cpu', 'cache', 'memory', 'virtual-memory', 'page', 'page-cache', 'buffer-pool'],
  ['thread', 'java-thread', 'jmm', 'volatile', 'cas', 'aqs', 'reentrant-lock'],
]
