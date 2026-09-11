import { describe, it, expect } from 'vitest'
import {
  bootConfigTransition,
  initialBootConfig,
  presentBootConfig,
} from '../../src/experiments/models/boot-configuration'
import { bootWebTransition, initialBootWeb, presentBootWeb } from '../../src/experiments/models/boot-web'
describe('Boot typed properties and conditional auto-configuration', () => {
  it('fails invalid binding, resolves source precedence and backs off for user beans', () => {
    let s = initialBootConfig()
    const act = (type: string, value?: string) => {
      s = bootConfigTransition(s, { type, value })
    }
    act('build')
    expect(s.running).toBe(false)
    expect(s.beans).toEqual([])
    expect(s.error).toContain('绑定')
    act('env', 'APP_CLIENT_POOLSIZE=6;APP_CLIENT_TIMEOUT=750ms')
    act('build')
    expect(s.bound).toEqual({ timeoutMs: 1000, poolSize: 6, enabled: true, port: 8080 })
    expect(s.beans).toEqual([{ name: 'client', origin: '自动配置 @Bean', timeout: 1000 }])
    act('custom', 'yes')
    act('build')
    expect(s.beans).toHaveLength(1)
    expect(s.beans[0]!.origin).toBe('用户 @Bean')
    expect(s.conditions[2]!.match).toBe(false)
    expect(presentBootConfig(s).goal.reached).toBe(true)
  })
  it('honors absent classes and disabling properties and keeps running bindings unchanged until restart', () => {
    let s = { ...initialBootConfig(), env: 'APP_CLIENT_ENABLED=false', starter: true }
    s = bootConfigTransition(s, { type: 'build' })
    expect(s.running).toBe(true)
    expect(s.beans).toEqual([])
    s = bootConfigTransition(s, { type: 'cli', value: 'app.client.timeout=3s;app.client.enabled=true' })
    expect(s.bound!.timeoutMs).toBe(1000)
    s = bootConfigTransition(s, { type: 'starter', value: 'no' })
    s = bootConfigTransition(s, { type: 'build' })
    expect(s.bound!.timeoutMs).toBe(3000)
    expect(s.conditions[0]!.match).toBe(false)
    expect(s.beans).toEqual([])
    s = bootConfigTransition(s, { type: 'cli', value: 'app.client.pool-size=1.5' })
    s = bootConfigTransition(s, { type: 'build' })
    expect(s.running).toBe(false)
  })
})
describe('Boot validation and configured Actuator management', () => {
  it('rejects constraints before writes and differentiates readiness, liveness, exposure and authorization', () => {
    let s = initialBootWeb()
    const act = (type: string, value?: string) => {
      s = bootWebTransition(s, { type, value })
    }
    act('request')
    expect(s.response).toBeNull()
    act('start')
    act('request')
    expect(s.response!.status).toBe(400)
    expect(s.violations).toHaveLength(3)
    expect(s.orders).toEqual([])
    act('body', '{"email":"ada@example.test","quantity":2,"address":{"city":"杭州"}}')
    act('request')
    expect(s.response!.status).toBe(201)
    act('db', 'off')
    act('endpoint', 'readiness')
    act('request')
    expect(s.response!.status).toBe(503)
    act('endpoint', 'liveness')
    act('request')
    expect(s.response!.status).toBe(200)
    act('endpoint', 'metrics')
    act('request')
    expect(s.response!.status).toBe(404)
    act('metricsExposed', 'on')
    act('request')
    expect(s.response!.status).toBe(403)
    act('role', 'operator')
    act('request')
    expect(s.response!.status).toBe(200)
    expect(presentBootWeb(s).goal.reached).toBe(true)
    expect(s.metrics.reduce((n, m) => n + m.count, 0)).toBe(7)
  })
  it('keeps binding, constraints and nested @Valid separate, including null @NotNull addresses', () => {
    let s = { ...initialBootWeb(), running: true, validation: false }
    s = bootWebTransition(s, { type: 'request' })
    expect(s.response!.status).toBe(201)
    expect(s.createdSeen).toBe(false)
    s = {
      ...initialBootWeb(),
      running: true,
      cascade: false,
      body: '{"email":"a@b.test","quantity":1,"address":{"city":""}}',
    }
    s = bootWebTransition(s, { type: 'request' })
    expect(s.response!.status).toBe(201)
    s = bootWebTransition(s, { type: 'body', value: '{"email":"a@b.test","quantity":1,"address":null}' })
    s = bootWebTransition(s, { type: 'request' })
    expect(s.response!.status).toBe(400)
    expect(s.violations).toEqual(['address: @NotNull'])
    s = bootWebTransition(s, { type: 'body', value: '{"email":"a@b.test","quantity":"1","address":null}' })
    s = bootWebTransition(s, { type: 'request' })
    expect(s.response!.body).toContain('binding failure')
  })
})
