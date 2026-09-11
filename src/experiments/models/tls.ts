import type { EngineFactory, ExperimentAction, ExperimentView, Observation } from '../../types/experiment'
import { addLog, createSession } from '../core/session'
import { boundedInteger } from '../core/inputs'

export type CertificateKind = 'valid' | 'untrusted' | 'wrong-host' | 'expired'
export type TlsTamper = 'none' | 'key' | 'finished'
export interface TeachingCertificate {
  issuer: string
  hostname: string
  notBefore: number
  notAfter: number
}
export const tlsHostname = 'learn.example.test'
const certLabels: Record<CertificateKind, string> = {
  valid: '信任链与名称匹配',
  untrusted: '未知信任根',
  'wrong-host': '证书名称不匹配',
  expired: '第 5 天到期的证书',
}
export function teachingCertificate(kind: CertificateKind): TeachingCertificate {
  if (!Object.hasOwn(certLabels, kind)) throw new Error('Unsupported teaching certificate')
  return {
    issuer: kind === 'untrusted' ? 'Unknown Root' : 'Teaching Root',
    hostname: kind === 'wrong-host' ? 'other.example.test' : tlsHostname,
    notBefore: 1,
    notAfter: kind === 'expired' ? 5 : 20,
  }
}
export function verifyTeachingCertificate(cert: TeachingCertificate, hostname: string, day: number) {
  const trust = cert.issuer === 'Teaching Root',
    name = cert.hostname === hostname,
    time = day >= cert.notBefore && day <= cert.notAfter
  return { trust, name, time, valid: trust && name && time }
}
export function modPow(base: number, exponent: number, modulus: number): number {
  if (
    boundedInteger(base, 0, 1000000) === null ||
    boundedInteger(exponent, 0, 1000000) === null ||
    boundedInteger(modulus, 2, 1000000) === null
  )
    throw new Error('Invalid bounded modular exponentiation')
  let result = 1
  base %= modulus
  while (exponent > 0) {
    if (exponent % 2) result = (result * base) % modulus
    base = (base * base) % modulus
    exponent = Math.floor(exponent / 2)
  }
  return result
}
export interface TlsState {
  clientSecret: number
  serverSecret: number
  certificate: CertificateKind
  day: number
  tamper: TlsTamper
  payload: string
  phase: number
  clientPublic: number | null
  serverPublic: number | null
  observedPublic: number | null
  clientKey: number | null
  serverKey: number | null
  identity: boolean
  proof: boolean
  finished: boolean
  cipher: number[]
  received: string | null
  error: string | null
  audit: { kind: CertificateKind; checks: ReturnType<typeof verifyTeachingCertificate> }[]
  log: Observation[]
}
export function initialTls(
  clientSecret = 6,
  serverSecret = 15,
  certificate: CertificateKind = 'valid',
  day = 10,
  tamper: TlsTamper = 'none',
  payload = 'hello',
): TlsState {
  if (
    boundedInteger(clientSecret, 2, 20) === null ||
    boundedInteger(serverSecret, 2, 20) === null ||
    boundedInteger(day, 1, 30) === null ||
    !Object.hasOwn(certLabels, certificate) ||
    !['none', 'key', 'finished'].includes(tamper) ||
    !/^[\x20-\x7e]{1,32}$/.test(payload)
  )
    throw new Error(
      'TLS teaching model requires bounded secrets, known certificate/tamper modes and 1–32 ASCII bytes',
    )
  return {
    clientSecret,
    serverSecret,
    certificate,
    day,
    tamper,
    payload,
    phase: 0,
    clientPublic: null,
    serverPublic: null,
    observedPublic: null,
    clientKey: null,
    serverKey: null,
    identity: false,
    proof: false,
    finished: false,
    cipher: [],
    received: null,
    error: null,
    audit: [],
    log: [],
  }
}
export function tlsStep(state: TlsState): TlsState {
  if (state.error || state.phase === 6) return state
  const s = { ...state, phase: state.phase + 1 }
  let label = '',
    detail = ''
  if (s.phase === 1) {
    s.clientPublic = modPow(5, s.clientSecret, 23)
    label = 'ClientHello / 玩具公钥'
    detail = `客户端私有指数 a=${s.clientSecret}，发送 A=5^a mod 23=${s.clientPublic}，不发送 a。`
  } else if (s.phase === 2) {
    s.serverPublic = modPow(5, s.serverSecret, 23)
    s.observedPublic = s.tamper === 'key' ? (s.serverPublic % 22) + 1 : s.serverPublic
    s.clientKey = modPow(s.observedPublic, s.clientSecret, 23)
    s.serverKey = modPow(s.clientPublic!, s.serverSecret, 23)
    label = 'ServerHello / 计算共享值'
    detail = `服务器发送 B=${s.serverPublic}，客户端收到 ${s.observedPublic}。客户端计算 B^a=${s.clientKey}，服务器计算 A^b=${s.serverKey}（均 mod 23）；相同值本身不证明对方身份。`
  } else if (s.phase === 3) {
    const cert = teachingCertificate(s.certificate),
      checks = verifyTeachingCertificate(cert, tlsHostname, s.day)
    s.identity = checks.valid
    label = 'Certificate / 身份审查'
    detail = `信任根${checks.trust ? '通过' : '失败'}，主机名${checks.name ? '匹配' : '不匹配'}，有效期${checks.time ? '通过' : '失败'}。`
    if (!s.identity) s.error = '证书身份验证失败，不能继续发送应用数据。'
  } else if (s.phase === 4) {
    s.proof = s.serverPublic === s.observedPublic
    label = 'CertificateVerify / 握手绑定'
    detail = '模型把证书私钥对握手记录的签名验证抽象为“认证的记录与收到的记录是否一致”，不实现真实签名算法。'
    if (!s.proof) s.error = '握手公钥被改动，CertificateVerify 验证失败；拒绝应用数据。'
  } else if (s.phase === 5) {
    s.finished = s.identity && s.proof && s.clientKey === s.serverKey && s.tamper !== 'finished'
    label = 'Finished / 密钥确认'
    detail = '检验双方对共享值与握手记录的一致理解。Finished 的真实 MAC / HKDF 在这里作为验证结果抽象。'
    if (!s.finished) s.error = 'Finished 验证失败；没有完成认证的握手不能进入应用数据阶段。'
  } else {
    if (!s.finished) return state
    s.cipher = [...new TextEncoder().encode(s.payload)].map((byte) => byte ^ s.clientKey!)
    s.received = new TextDecoder().decode(new Uint8Array(s.cipher.map((byte) => byte ^ s.serverKey!)))
    label = 'Application Data / 玩具字节变换'
    detail = `握手验证全部通过后，使用玩具共享值对字节做 XOR 并还原「${s.received}」。XOR 仅用于展示共享值的作用，不是 TLS 加密。`
  }
  s.log = addLog(
    s.log,
    label,
    s.error ? `${detail} ${s.error}` : detail,
    s.error ? 'warning' : s.phase === 6 ? 'success' : 'neutral',
  )
  return s
}
export function tlsTransition(s: TlsState, a: ExperimentAction): TlsState {
  if (['client-secret', 'server-secret', 'certificate', 'day', 'tamper', 'payload'].includes(a.type)) {
    const client = a.type === 'client-secret' ? boundedInteger(a.value, 2, 20) : s.clientSecret,
      server = a.type === 'server-secret' ? boundedInteger(a.value, 2, 20) : s.serverSecret,
      day = a.type === 'day' ? boundedInteger(a.value, 1, 30) : s.day
    if (client === null || server === null || day === null) return s
    try {
      return initialTls(
        client,
        server,
        a.type === 'certificate' ? (a.value as CertificateKind) : s.certificate,
        day,
        a.type === 'tamper' ? (a.value as TlsTamper) : s.tamper,
        a.type === 'payload' ? String(a.value ?? '') : s.payload,
      )
    } catch {
      return s
    }
  }
  if (a.type === 'step') return tlsStep(s)
  if (a.type === 'run') {
    for (let i = 0; i < 6 && s.phase < 6 && !s.error; i++) s = tlsStep(s)
    return s
  }
  if (a.type === 'audit')
    return {
      ...s,
      audit: (Object.keys(certLabels) as CertificateKind[]).map((kind) => ({
        kind,
        checks: verifyTeachingCertificate(teachingCertificate(kind), tlsHostname, s.day),
      })),
      log: addLog(
        s.log,
        '独立检查四张证书',
        `统一按第 ${s.day} 天与主机名 ${tlsHostname} 检查信任、名称和有效期。`,
      ),
    }
  return s
}
export function presentTls(s: TlsState): ExperimentView {
  const cert = teachingCertificate(s.certificate),
    reached = s.finished && s.received === s.payload && s.audit.length === 4
  const phaseNames = [
    '准备',
    'ClientHello',
    'ServerHello',
    'Certificate',
    'CertificateVerify',
    'Finished',
    'Application Data',
  ]
  return {
    scene: {
      kind: 'data',
      title: '身份验证与密钥建立缺一不可',
      cards: [
        {
          id: 'client',
          label: '客户端 / a 仅本地持有',
          value: `A=${s.clientPublic ?? '—'}`,
          detail: `计算得到共享值 ${s.clientKey ?? '—'}`,
        },
        {
          id: 'server',
          label: '服务器 / b 仅本地持有',
          value: `B=${s.serverPublic ?? '—'}`,
          detail: `计算得到共享值 ${s.serverKey ?? '—'}`,
        },
        {
          id: 'identity',
          label: '客户端需要访问的名称',
          value: tlsHostname,
          detail: `证书声明 ${cert.hostname}`,
        },
      ],
      tables: [
        {
          id: 'tls-checks',
          title: '应用数据之前必须通过的检查',
          nowrapColumns: [0],
          columns: ['检查', '模型中的证据', '状态'],
          rows: [
            {
              id: 'identity',
              values: [
                'Certificate',
                `${cert.issuer}，有效期 ${cert.notBefore}..${cert.notAfter} 天`,
                s.phase < 3 ? '未检查' : s.identity ? '通过' : '失败',
              ],
            },
            {
              id: 'proof',
              values: [
                'CertificateVerify',
                `认证的服务器公钥 ${s.serverPublic ?? '—'} / 收到 ${s.observedPublic ?? '—'}`,
                s.phase < 4 ? '未检查' : s.proof ? '通过' : '失败',
              ],
            },
            {
              id: 'finished',
              values: [
                'Finished',
                '共享值与握手记录确认（抽象验证）',
                s.phase < 5 ? '未检查' : s.finished ? '通过' : '失败',
              ],
            },
          ],
        },
        {
          id: 'tls-certificates',
          title: '相同主机名与时间的证书对照',
          columns: ['证书', '信任根', '名称', '有效期', '可接受'],
          rows: s.audit.map((row) => ({
            id: row.kind,
            values: [
              certLabels[row.kind],
              row.checks.trust ? '通过' : '失败',
              row.checks.name ? '通过' : '失败',
              row.checks.time ? '通过' : '失败',
              row.checks.valid ? '是' : '否',
            ],
          })),
        },
      ],
      caption:
        'p=23、g=5 的小群 DH 与单字节 XOR 极易破解，只展示计算和状态关系。实际 TLS 1.3 使用安全密钥交换、证书签名、HKDF、Finished 与 AEAD；本模型没有实现这些密码套件或完整 X.509 链验证。',
    },
    metrics: [
      { label: '握手阶段', value: phaseNames[s.phase]! },
      { label: '客户端共享值', value: s.clientKey ?? '—' },
      { label: '服务器共享值', value: s.serverKey ?? '—' },
      {
        label: '玩具 XOR 字节',
        value: s.cipher.map((byte) => byte.toString(16).padStart(2, '0')).join(' ') || '—',
      },
      { label: '应用收到的文字', value: s.received ?? '未交付' },
    ],
    controls: [
      {
        id: 'client-secret',
        kind: 'number',
        label: '玩具客户端私有指数 a',
        value: s.clientSecret,
        min: 2,
        max: 20,
      },
      {
        id: 'server-secret',
        kind: 'number',
        label: '玩具服务器私有指数 b',
        value: s.serverSecret,
        min: 2,
        max: 20,
      },
      {
        id: 'certificate',
        kind: 'select',
        label: '服务器证书情形',
        value: s.certificate,
        options: (Object.keys(certLabels) as CertificateKind[]).map((kind) => ({
          value: kind,
          label: certLabels[kind],
        })),
      },
      { id: 'day', kind: 'number', label: '验证时间 / 教学日序', value: s.day, min: 1, max: 30 },
      {
        id: 'tamper',
        kind: 'select',
        label: '握手途中改动',
        value: s.tamper,
        options: [
          { value: 'none', label: '无改动' },
          { value: 'key', label: '改动服务器公钥' },
          { value: 'finished', label: '改动 Finished' },
        ],
      },
      { id: 'payload', kind: 'text', label: '握手成功后发送的 ASCII 文字', value: s.payload },
      {
        id: 'step',
        kind: 'button',
        label: '推进一个握手阶段',
        primary: true,
        disabled: !!s.error || s.phase === 6,
      },
      { id: 'run', kind: 'button', label: '运行握手并尝试交付', disabled: !!s.error || s.phase === 6 },
      { id: 'audit', kind: 'button', label: '对比四种证书的验证结果' },
    ],
    status: {
      title: s.error
        ? '认证失败，应用数据未交付'
        : s.received !== null
          ? '验证完成后才允许应用交付'
          : '相同的共享值还不能证明服务器身份',
      detail:
        s.error ??
        s.log.at(-1)?.detail ??
        '先运行成功路径，再选择名称不匹配的证书或篡改握手，观察失败发生在哪一步。',
      tone: s.error ? 'warning' : s.received !== null ? 'success' : 'neutral',
    },
    goal: { label: '完成身份、握手绑定与 Finished 验证并交付文字，再对比四种证书情形。', reached },
    log: s.log,
  }
}
export const tlsEngine: EngineFactory = (config) =>
  createSession(
    () =>
      initialTls(
        Number(config.clientSecret ?? 6),
        Number(config.serverSecret ?? 15),
        (config.certificate ?? 'valid') as CertificateKind,
        Number(config.day ?? 10),
        (config.tamper ?? 'none') as TlsTamper,
        String(config.payload ?? 'hello'),
      ),
    tlsTransition,
    presentTls,
  )
