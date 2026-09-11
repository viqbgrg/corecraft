import type { Course } from '../../types/course'
import content from './lesson.md?raw'

export default {
  id: 'distributed-locks',
  slug: 'distributed-locks',
  title: '租约、暂停与 Fencing',
  englishTitle: 'Distributed Leases and Fencing',
  level: 16,
  category: '分布式系统',
  duration: 28,
  description: '暂停旧持有者直到租约过期，让新持有者写入，再用资源端 token 检查拒绝旧请求。',
  question: '锁已过期，为什么旧客户端仍可能继续写资源？',
  objectives: [
    '有限租期避免故障持有者永远占用，但过期不能强制停止旧客户端；释放需比较唯一身份。',
    '新获取产生更大的 token，资源原子拒绝比已接受 token 更旧的写入。',
  ],
  prerequisites: ['raft-consensus', 'redis-expiration'],
  nextConcepts: ['distributed-transactions'],
  concepts: [
    {
      id: 'distributed-lease',
      title: '租约与原子释放',
      content: '有限租期避免故障持有者永远占用，但过期不能强制停止旧客户端；释放需比较唯一身份。',
      why: '服务端锁记录与客户端执行状态独立。',
      relatedConcepts: ['redis-expiration'],
    },
    {
      id: 'fencing-token',
      title: '资源端 fencing',
      content: '新获取产生更大的 token，资源原子拒绝比已接受 token 更旧的写入。',
      why: '安全性要落实到真正被修改的资源。',
      relatedConcepts: ['raft-consensus'],
    },
  ],
  experiments: [
    {
      id: 'distributed-locks-lab',
      type: 'distributed-locks',
      title: '租约、暂停与 Fencing',
      description: '暂停旧持有者直到租约过期，让新持有者写入，再用资源端 token 检查拒绝旧请求。',
      question: '锁已过期，为什么旧客户端仍可能继续写资源？',
      config: {},
    },
  ],
  challenge: {
    question: '资源已经接受 token=2，恢复的旧客户端带 token=1 来写，正确 fencing 行为是什么？',
    options: [
      {
        id: 'a',
        text: '因为旧客户端曾经持锁，所以仍接受。',
      },
      {
        id: 'b',
        text: '资源原子拒绝较旧 token，保持新值；仅锁服务的过期记录无法替资源完成这个检查。',
      },
      {
        id: 'c',
        text: '每次读取客户端时钟就能自动保证全局顺序。',
      },
    ],
    answer: 'b',
    explanation:
      '暂停或网络延迟使旧请求可能在新 owner 之后到达。资源必须持久维护已见 token 并与修改原子比较，才能阻止旧 owner 覆盖。',
    hint: '比较无 fencing 和有 fencing 的相同操作顺序。',
  },
  content,
} satisfies Course
