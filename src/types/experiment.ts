export type ExperimentType =
  | 'binary'
  | 'cpu'
  | 'cache'
  | 'process'
  | 'virtual-memory'
  | 'tcp-handshake'
  | 'tcp-close'
  | 'dns'
  | 'http'
  | 'btree'
export type Tone = 'neutral' | 'success' | 'warning' | 'danger'
export type ExperimentConfig = Readonly<Record<string, string | number | boolean | readonly number[]>>
export interface ExperimentDefinition {
  id: string
  title: string
  description: string
  question: string
  type: ExperimentType
  config: ExperimentConfig
}
export interface ExperimentAction {
  type: string
  value?: string | number
}
export interface Metric {
  label: string
  value: string | number
  unit?: string
  tone?: Tone
}
export interface Observation {
  step: number
  label: string
  detail: string
  tone: Tone
}
export interface Control {
  id: string
  kind: 'button' | 'number' | 'text' | 'select'
  label: string
  value?: string | number
  min?: number
  max?: number
  options?: { label: string; value: string }[]
  disabled?: boolean
  primary?: boolean
  hint?: string
}
export interface BinaryScene {
  kind: 'binary'
  width: number
  a: number
  b: number
  operation: 'AND' | 'OR' | 'XOR' | 'ADD'
  result: number
  carry: number
}
export interface CpuScene {
  kind: 'cpu'
  phase: string
  pc: number
  activeInstruction: number | null
  registers: Record<string, number>
  instruction: string
  alu: string
  program: string[]
  memory: { address: number; value: number }[]
  halted: boolean
}
export interface CacheScene {
  kind: 'cache'
  address: number | null
  lineSize: number
  path: 'L1' | 'L2' | 'RAM' | null
  levels: {
    name: string
    latency: number
    lines: { index: number; block: number | null; active: boolean }[]
  }[]
  recent: { address: number; source: 'L1' | 'L2' | 'RAM'; cycles: number }[]
}
export type ThreadState = 'Ready' | 'Running' | 'Blocked' | 'Waiting'
export interface ProcessScene {
  kind: 'process'
  processes: { id: string; name: string; memory: number }[]
  threads: { id: string; process: string; name: string; state: ThreadState; pc: number; stack: number[] }[]
  running: string | null
  quantum: number
  used: number
  switches: number
}
export interface VirtualMemoryScene {
  kind: 'virtual-memory'
  address: number
  pageSize: number
  vpn: number
  offset: number
  physical: number | null
  tlb: { vpn: number; frame: number }[]
  pages: { vpn: number; frame: number | null; active: boolean }[]
  stage: string
}
export interface NetworkNode {
  id: string
  label: string
  subtitle: string
  state: string
  active?: boolean
}
export interface NetworkMessage {
  from: string
  to: string
  label: string
  detail: string
  tone: Tone
  lost?: boolean
}
export interface NetworkScene {
  kind: 'network'
  layout: 'sequence' | 'pipeline'
  nodes: NetworkNode[]
  messages: NetworkMessage[]
  caption: string
}
export interface TreeScene {
  kind: 'tree'
  width: number
  height: number
  nodes: { id: string; keys: number[]; leaf: boolean; x: number; y: number; width: number }[]
  edges: { from: string; to: string }[]
  leafLinks: { from: string; to: string }[]
  path: string[]
  found: number | null
}
export type ExperimentScene =
  BinaryScene | CpuScene | CacheScene | ProcessScene | VirtualMemoryScene | NetworkScene | TreeScene
export interface ExperimentView {
  scene: ExperimentScene
  metrics: Metric[]
  controls: Control[]
  status: { title: string; detail: string; tone: Tone }
  log: Observation[]
  goal: { label: string; reached: boolean }
}
export interface ExperimentSession {
  view(): ExperimentView
  dispatch(action: ExperimentAction): void
  reset(): void
}
export type EngineFactory = (config: ExperimentConfig) => ExperimentSession
