import { expect, test } from '@playwright/test'
import { click, fill, finishCourse, metric, openCourse, select } from './course-helpers'
test('Redis values preserve type semantics and update actual skip-list order', async ({ page }) => {
  await openCourse(page, 'redis-structures')
  const run = async (command: string, key: string, value?: string, score?: string) => {
    await select(page, 'command', command)
    await fill(page, 'key', key)
    if (value !== undefined) await fill(page, 'value', value)
    if (score !== undefined) await fill(page, 'score', score)
    await click(page, '执行当前 Redis 命令')
  }
  await run('SET', 'counter', '5')
  await run('INCR', 'counter')
  await run('LPUSH', 'jobs', 'A')
  await run('LPUSH', 'jobs', 'B')
  await run('RPOP', 'jobs')
  await expect(metric(page, '最近命令返回')).toHaveText('A')
  await run('HSET', 'user', 'Ada')
  await run('HGET', 'user')
  await run('SADD', 'tags', 'java')
  await run('SADD', 'tags', 'java')
  for (const [member, score] of [
    ['Alice', '10'],
    ['Bob', '5'],
    ['Carol', '10'],
    ['Alice', '3'],
  ])
    await run('ZADD', 'rank', member, score)
  await run('ZRANGE', 'rank')
  await expect(metric(page, '最近命令返回')).toContainText('[["Alice",3],["Bob",5],["Carol",10]]')
  await finishCourse(page, /更新唯一 Alice 的分数并重新定位/)
})
test('Redis TTL expiration, noeviction rejection and LRU eviction have distinct causes', async ({ page }) => {
  await openCourse(page, 'redis-expiration')
  await click(page, '推进一秒')
  await click(page, 'GET · 访问并检查到期')
  await fill(page, 'key', 'D')
  await click(page, 'SET · 写入并执行容量准入')
  await fill(page, 'key', 'E')
  await click(page, 'SET · 写入并执行容量准入')
  await expect(metric(page, '拒绝写入数量')).toHaveText('1')
  await fill(page, 'key', 'A')
  await click(page, 'GET · 访问并检查到期')
  await select(page, 'policy', 'allkeys-lru')
  await fill(page, 'key', 'E')
  await click(page, 'SET · 写入并执行容量准入')
  await expect(page.locator('[data-table="redis-removals"]')).toContainText('evicted')
  await finishCourse(page, /没有符合条件的淘汰候选/)
})
test('Redis recovers RDB start snapshots and AOF durable prefixes according to policy', async ({ page }) => {
  await openCourse(page, 'redis-persistence')
  for (const name of [
    'INCR 并观察客户端确认',
    'BGSAVE · 固定快照时点',
    'INCR 并观察客户端确认',
    '完成 RDB 并替换稳定文件',
    '模拟整机断电',
    '按当前策略恢复实例',
  ])
    await click(page, name)
  await expect(metric(page, '内存 counter')).toHaveText('1')
  for (const mode of ['everysec', 'always']) {
    await select(page, 'mode', mode)
    await click(page, 'INCR 并观察客户端确认')
    await click(page, '模拟整机断电')
    await click(page, '按当前策略恢复实例')
    await expect(metric(page, '恢复丢失写入数')).toHaveText(mode === 'everysec' ? '1' : '0')
  }
  await finishCourse(page, /开始快照时的逻辑状态 1/)
})
test('Redis Sentinel majority failover and Cluster ASK/MOVED update different state', async ({ page }) => {
  await openCourse(page, 'redis-topology')
  for (const name of [
    '向当前主写入并确认',
    '读取选中副本的值',
    '把主节点历史复制到选中副本',
    '隔离旧主 M 与多数节点',
    '隔离客户端向旧主 M 写入',
    '当前 Sentinel 投出一次授权票',
  ])
    await click(page, name)
  await select(page, 'sentinel', 'S2')
  await click(page, '当前 Sentinel 投出一次授权票')
  await click(page, '按多数授权提升最前副本')
  await click(page, '恢复链路并将旧主重配为副本')
  await expect(metric(page, '丢失的已确认写入')).toHaveText('2')
  for (const name of [
    '开始迁移当前槽',
    '迁移当前槽的唯一教学键',
    '按客户端槽缓存执行 GET',
    'ASKING 后临时重试本次命令',
    '发布新的槽归属',
    '按客户端槽缓存执行 GET',
    '按 MOVED 更新槽缓存并重试',
  ])
    await click(page, name)
  await finishCourse(page, /ASK 使用 ASKING 临时重试本次命令/)
})
