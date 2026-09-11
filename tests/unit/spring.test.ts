import { describe, it, expect } from 'vitest'
import {
  containerTransition,
  initialContainer,
  presentContainer,
} from '../../src/experiments/models/spring-container'
import {
  initialSpringTx,
  presentSpringTx,
  springTxTransition,
} from '../../src/experiments/models/spring-transactions'
import { initialMvc, mvcTransition, presentMvc } from '../../src/experiments/models/spring-mvc'
describe('Spring dependency resolution and lifecycle', () => {
  it('resolves ambiguity, caches singletons and creates prototypes without managing their destruction', () => {
    let s = initialContainer()
    const act = (type: string, value?: string) => {
      s = containerTransition(s, { type, value })
    }
    act('register')
    expect(s.objects).toEqual([])
    act('get')
    expect(s.error).toContain('NoUnique')
    expect(s.objects).toEqual([])
    act('qualifier', 'memoryRepo')
    act('register')
    act('refresh')
    expect(s.objects).toHaveLength(4)
    act('get')
    act('get')
    expect(s.lookups[0]!.id).toBe(s.lookups[1]!.id)
    act('scope', 'prototype')
    act('target', 'service')
    act('register')
    act('get')
    act('get')
    expect(s.lookups[0]!.id).not.toBe(s.lookups[1]!.id)
    act('close')
    expect(s.objects.filter((o) => o.name === 'service').every((o) => o.phase === 'processed')).toBe(true)
    expect(s.objects.find((o) => o.name === 'memoryRepo')!.phase).toBe('destroyed')
    expect(presentContainer(s).goal.reached).toBe(true)
  })
  it('rejects constructor cycles, permits only configured singleton property cycles, and injects a prototype once into a singleton', () => {
    let s = { ...initialContainer(), qualifier: 'memoryRepo' as const, cycle: true, allowEarly: true }
    s = containerTransition(s, { type: 'register' })
    s = containerTransition(s, { type: 'get' })
    expect(s.error).toContain('BeanCurrentlyInCreation')
    s = containerTransition(s, { type: 'injection', value: 'setter' })
    s = containerTransition(s, { type: 'register' })
    s = containerTransition(s, { type: 'get' })
    expect(s.error).toBeNull()
    const service = s.objects.find((o) => o.name === 'service')!,
      audit = s.objects.find((o) => o.name === 'audit')!
    expect(service.deps.audit).toBe(audit.id)
    expect(audit.deps.service).toBe(service.id)
    s = { ...initialContainer(), qualifier: 'jdbcRepo', scope: 'prototype' }
    s = containerTransition(s, { type: 'register' })
    s = containerTransition(s, { type: 'get' })
    s = containerTransition(s, { type: 'get' })
    expect(s.objects.filter((o) => o.name === 'service')).toHaveLength(1)
  })
})
describe('Spring proxy and transaction boundaries', () => {
  it('stops a run when the transfer cannot enter instead of retrying indefinitely', () => {
    const state = { ...initialSpringTx(), balances: [10, 50] }
    const result = springTxTransition(state, { type: 'run' })
    expect(result.error).toBe('余额不足。')
    expect(result.phase).toBe('idle')
    expect(result.balances).toEqual([10, 50])
    expect(result.pending).toBeNull()
    expect(result.advice).toEqual([])
    expect(state.error).toBeNull()
  })
  it('exposes partial writes on self invocation and restores atomicity through proxy interception', () => {
    let s = initialSpringTx()
    const act = (type: string, value?: string) => {
      s = springTxTransition(s, { type, value })
    }
    act('path', 'self')
    act('failure', 'runtime')
    act('run')
    expect(s.balances).toEqual([80, 50])
    expect(s.advice.join(' ')).not.toContain('begin')
    act('new')
    act('path', 'proxy')
    act('run')
    expect(s.balances).toEqual([100, 50])
    expect(s.result).toBe('RuntimeException')
    act('new')
    act('failure', 'none')
    act('run')
    expect(s.balances).toEqual([80, 70])
    expect(presentSpringTx(s).goal.reached).toBe(true)
  })
  it('distinguishes default checked rules, rollback-only propagation and independent REQUIRES_NEW commit', () => {
    for (const checkedRollback of [false, true]) {
      let s = { ...initialSpringTx(), failure: 'checked' as const, checkedRollback }
      s = springTxTransition(s, { type: 'run' })
      expect(s.balances).toEqual(checkedRollback ? [100, 50] : [80, 50])
    }
    let s = { ...initialSpringTx(), propagation: 'required' as const }
    s = springTxTransition(s, { type: 'run' })
    expect(s.result).toBe('UnexpectedRollbackException')
    expect(s.balances).toEqual([100, 50])
    s = { ...initialSpringTx(), propagation: 'requires-new', failure: 'runtime' }
    s = springTxTransition(s, { type: 'run' })
    expect(s.balances).toEqual([100, 50])
    expect(s.auditRows).toBe(1)
  })
})
describe('Spring MVC dispatch and conversion', () => {
  it('stops binding before controller, creates JSON, resolves business errors and escapes view output', () => {
    let s = initialMvc()
    const act = (type: string, value?: string) => {
      s = mvcTransition(s, { type, value })
    }
    act('run')
    expect(s.response!.status).toBe(400)
    expect(s.calls).toBe(0)
    expect(s.orders).toHaveLength(2)
    act('body', '{"quantity":3}')
    act('run')
    expect(s.response!.status).toBe(201)
    expect(s.orders.at(-1)).toEqual({ id: 9, quantity: 3 })
    act('method', 'GET')
    act('url', '/orders/999')
    act('run')
    expect(s.response!.status).toBe(404)
    expect(s.trace.join(' ')).not.toContain('postHandle')
    expect(s.trace).toContain('HandlerInterceptor.afterCompletion')
    act('url', '/hello?name=%3Cscript%3E')
    act('accept', 'text/html')
    act('run')
    expect(s.response!.body).toContain('&lt;script&gt;')
    expect(presentMvc(s).goal.reached).toBe(true)
  })
  it('distinguishes Filter rejection, method mismatch, handler absence and unacceptable representation', () => {
    for (const [patch, status, calls] of [
      [{ authorized: false }, 401, 0],
      [{ method: 'GET' }, 405, 0],
      [{ url: '/absent' }, 404, 0],
      [{ method: 'GET', url: '/orders/7', accept: 'text/html' }, 406, 1],
    ] as const) {
      const s = mvcTransition({ ...initialMvc(), ...patch }, { type: 'run' })
      expect(s.response!.status).toBe(status)
      expect(s.calls).toBe(calls)
    }
  })
})
