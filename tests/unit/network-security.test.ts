import { describe, expect, it } from 'vitest'
import { initialLayers, ipv4, layerTransition, sameSubnet } from '../../src/experiments/models/network-layers'
import {
  initialTls,
  modPow,
  presentTls,
  teachingCertificate,
  tlsHostname,
  tlsTransition,
  verifyTeachingCertificate,
  type CertificateKind,
  type TlsTamper,
} from '../../src/experiments/models/tls'

describe('layering, next-hop routing and socket demultiplexing', () => {
  it('computes subnet membership from bounded IPv4 values', () => {
    expect(ipv4('255.255.255.255')).toBe(0xffffffff)
    for (const invalid of ['1.2.3', '1.2.3.256', '01.2.3.4', '1.2.3.-1', '1.2.3.4.5'])
      expect(ipv4(invalid)).toBeNull()
    expect(sameSubnet('192.0.2.10', '192.0.2.200')).toBe(true)
    expect(sameSubnet('192.0.2.10', '198.51.100.20')).toBe(false)
    expect(sameSubnet('128.0.0.1', '255.0.0.1', 1)).toBe(true)
    expect(sameSubnet('128.0.0.1', '127.0.0.1', 1)).toBe(false)
    expect(sameSubnet('1.2.3.4', '5.6.7.8', 0)).toBe(true)
    expect(sameSubnet('1.2.3.4', '1.2.3.5', 32)).toBe(false)
  })
  it('resolves next-hop MACs and rewrites only link headers and TTL at the router', () => {
    const initial = initialLayers(),
      s = layerTransition(initial, { type: 'run' })
    expect(s.received).toBe('hello')
    expect(s.frames.map((f) => f.ttl)).toEqual([3, 2])
    expect(s.frames.map((f) => f.srcIp)).toEqual(['192.0.2.10', '192.0.2.10'])
    expect(s.frames.map((f) => f.dstIp)).toEqual(['198.51.100.20', '198.51.100.20'])
    expect(s.frames[0]!.dstMac).toBe('02:00:00:00:00:01')
    expect(s.frames[1]!.srcMac).toBe('02:00:00:00:01:01')
    expect(s.arp.map((entry) => entry.ip)).toEqual(['192.0.2.1', '198.51.100.20'])
    expect(initial.arp).toEqual([])
    const again = layerTransition(layerTransition(s, { type: 'again' }), { type: 'run' })
    expect(again.arpRequests).toBe(0)
    expect(again.received).toBe('hello')
    const local = layerTransition(initialLayers('192.0.2.20', 'udp', 9000, 1), { type: 'run' })
    expect(local.frames).toHaveLength(1)
    expect(local.remainingTtl).toBe(1)
    expect(local.received).toBe('hello')
  })
  it('locates ARP, TTL, route and transport-port failures before application delivery', () => {
    const cases = [
      { s: initialLayers('192.0.2.99'), error: 'ARP 未应答', frames: 0 },
      { s: initialLayers('203.0.113.20'), error: 'Destination Unreachable', frames: 1 },
      { s: initialLayers('198.51.100.20', 'udp', 9000, 1), error: 'Time Exceeded', frames: 1 },
      { s: initialLayers('198.51.100.20', 'udp', 8000), error: 'Port Unreachable', frames: 2 },
      { s: initialLayers('198.51.100.20', 'tcp', 9000, 3, 'hello', false), error: 'TCP RST', frames: 2 },
    ]
    for (const row of cases) {
      const result = layerTransition(row.s, { type: 'run' })
      expect(result.error).toContain(row.error)
      expect(result.received).toBeNull()
      expect(result.frames).toHaveLength(row.frames)
    }
    expect(() => initialLayers('198.51.100.20', 'udp', 0)).toThrow()
  })
})

describe('TLS teaching handshake and certificate conditions', () => {
  it('derives the same toy DH value from independent exponentiation', () => {
    for (let a = 2; a <= 20; a++)
      for (let b = 2; b <= 20; b++) {
        const s = tlsTransition(initialTls(a, b), { type: 'run' })
        const expected = Number(5n ** BigInt(a * b) % 23n)
        expect(s.clientKey).toBe(expected)
        expect(s.serverKey).toBe(expected)
        expect(s.received).toBe('hello')
      }
    expect(modPow(5, 6, 23)).toBe(8)
    expect(modPow(5, 15, 23)).toBe(19)
    expect(() => modPow(5, -1, 23)).toThrow()
  })
  it('independently checks trust, hostname and inclusive validity bounds', () => {
    const cert = teachingCertificate('valid')
    expect(verifyTeachingCertificate(cert, tlsHostname, 1).valid).toBe(true)
    expect(verifyTeachingCertificate(cert, tlsHostname, 20).valid).toBe(true)
    expect(verifyTeachingCertificate(cert, tlsHostname, 21).time).toBe(false)
    for (const kind of ['untrusted', 'wrong-host', 'expired'] as CertificateKind[]) {
      const s = tlsTransition(initialTls(6, 15, kind), { type: 'run' })
      expect(s.clientKey).toBe(s.serverKey)
      expect(s.phase).toBe(3)
      expect(s.error).toContain('身份验证失败')
      expect(s.received).toBeNull()
      expect(presentTls(s).goal.reached).toBe(false)
    }
  })
  it('refuses tampered transcript or Finished and never produces application ciphertext on failure', () => {
    for (const tamper of ['key', 'finished'] as TlsTamper[]) {
      const s = tlsTransition(initialTls(6, 15, 'valid', 10, tamper), { type: 'run' })
      expect(s.identity).toBe(true)
      expect(s.phase).toBe(tamper === 'key' ? 4 : 5)
      expect(s.error).not.toBeNull()
      expect(s.cipher).toEqual([])
      expect(s.received).toBeNull()
    }
    let s = tlsTransition(initialTls(), { type: 'run' })
    expect(s.cipher).toEqual([106, 103, 110, 110, 109])
    s = tlsTransition(s, { type: 'audit' })
    expect(s.audit.map((row) => row.checks.valid)).toEqual([true, false, false, false])
    expect(presentTls(s).goal.reached).toBe(true)
  })
})
