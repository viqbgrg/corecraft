import { describe, expect, it } from 'vitest'
import { initialHandshake, seqNext, transitionHandshake } from '../../src/experiments/models/tcp-handshake'
import { initialClose, transitionClose } from '../../src/experiments/models/tcp-close'

describe('three-way TCP handshake', () => {
  it('requires both SYN acknowledgments, keeping endpoint states distinct', () => {
    let s = initialHandshake()
    expect(transitionHandshake(s, { type: 'ack' })).toEqual(s)
    s = transitionHandshake(s, { type: 'syn' })
    expect([s.client, s.server]).toEqual(['SYN_SENT', 'SYN_RCVD'])
    s = transitionHandshake(s, { type: 'syn-ack' })
    expect([s.client, s.server]).toEqual(['ESTABLISHED', 'SYN_RCVD'])
    s = transitionHandshake(s, { type: 'ack' })
    expect([s.client, s.server]).toEqual(['ESTABLISHED', 'ESTABLISHED'])
  })
  it.each(['syn', 'syn-ack', 'ack'])(
    'recovers from a lost %s without consuming a new sequence number',
    (lost) => {
      let s = initialHandshake()
      for (const type of ['syn', 'syn-ack', 'ack']) {
        if (type === lost) {
          s = transitionHandshake(s, { type: 'transport', value: 'drop' })
          s = transitionHandshake(s, { type })
          expect(s.server).not.toBe('ESTABLISHED')
        }
        s = transitionHandshake(s, { type })
      }
      expect(s.server).toBe('ESTABLISHED')
      expect(s.clientIsn).toBe(1000)
      expect(s.serverIsn).toBe(8000)
      expect(s.dropped).toBe(1)
    },
  )
  it('rejects the wrong ACK and exposes the rejection response', () => {
    let s = transitionHandshake(transitionHandshake(initialHandshake(), { type: 'syn' }), { type: 'syn-ack' })
    s = transitionHandshake(s, { type: 'ack-number', value: 8000 })
    s = transitionHandshake(s, { type: 'ack' })
    expect(s.server).toBe('SYN_RCVD')
    expect(s.errors).toBe(1)
    expect(s.messages.at(-1)?.label).toContain('RST')
    s = transitionHandshake(s, { type: 'ack-number', value: 8001 })
    expect(transitionHandshake(s, { type: 'ack' }).server).toBe('ESTABLISHED')
  })
  it('does not create new sequence space for a duplicate SYN', () => {
    let s = transitionHandshake(initialHandshake(), { type: 'syn' })
    s = transitionHandshake(s, { type: 'duplicate-syn' })
    expect(s.server).toBe('SYN_RCVD')
    expect(s.clientIsn).toBe(1000)
    expect(s.duplicates).toBe(1)
  })
  it('handles unsigned 32-bit sequence wraparound', () => {
    let s = transitionHandshake(initialHandshake(), { type: 'server-isn', value: 0xffffffff })
    for (const type of ['syn', 'syn-ack', 'ack']) s = transitionHandshake(s, { type })
    expect(s.ack).toBe(0)
    expect(s.server).toBe('ESTABLISHED')
    expect(seqNext(0xffffffff)).toBe(0)
  })
})

describe('independent TCP close directions', () => {
  it('allows server data after the client FIN and waits two MSL', () => {
    let s = initialClose()
    for (const type of ['client-fin', 'server-ack', 'data']) s = transitionClose(s, { type })
    expect([s.client, s.server]).toEqual(['FIN_WAIT_2', 'CLOSE_WAIT'])
    expect(s.transferred).toBe(12)
    expect(s.sSeq).toBe(8013)
    s = transitionClose(s, { type: 'server-fin' })
    expect([s.client, s.server]).toEqual(['TIME_WAIT', 'LAST_ACK'])
    s = transitionClose(s, { type: 'client-ack' })
    expect(s.cSeq).toBe(1002)
    expect(s.sSeq).toBe(8014)
    expect(s.server).toBe('CLOSED')
    s = transitionClose(s, { type: 'tick' })
    expect(s.client).toBe('TIME_WAIT')
    s = transitionClose(s, { type: 'tick' })
    expect(s.client).toBe('CLOSED')
  })
  it('can re-acknowledge a retransmitted FIN after the last ACK is lost', () => {
    let s = initialClose()
    for (const type of ['client-fin', 'server-ack', 'server-fin']) s = transitionClose(s, { type })
    s = transitionClose(s, { type: 'ack-delivery', value: 'drop' })
    s = transitionClose(s, { type: 'client-ack' })
    expect(s.server).toBe('LAST_ACK')
    const seq = s.sSeq
    s = transitionClose(s, { type: 'retransmit-fin' })
    expect(s.sSeq).toBe(seq)
    expect(s.messages.at(-1)?.detail).toContain('Seq = 8001')
    s = transitionClose(s, { type: 'client-ack' })
    expect(s.server).toBe('CLOSED')
  })
})
