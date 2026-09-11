export type ExperimentType =
  | 'modeling'
  | 'signed-number'
  | 'floating-point'
  | 'encoding'
  | 'logic'
  | 'interrupt-dma'
  | 'filesystem'
  | 'page-cache'
  | 'io-multiplexing'
  | 'network-layers'
  | 'tls'
  | 'database-pages'
  | 'wal'
  | 'transactions'
  | 'query-optimizer'
  | 'innodb-indexes'
  | 'innodb-commit'
  | 'innodb-read-view'
  | 'innodb-locks'
  | 'mysql-execution'
  | 'java-objects'
  | 'java-classes'
  | 'java-collections'
  | 'java-memory-model'
  | 'java-io-apis'
  | 'jvm-runtime'
  | 'jvm-gc'
  | 'jvm-collectors'
  | 'jvm-jit'
  | 'java-atomics'
  | 'java-locks'
  | 'java-coordination'
  | 'java-executors'
  | 'java-concurrent-map'
  | 'java-futures'
  | 'java-file-io'
  | 'nio-selector'
  | 'netty-reactor'
  | 'spring-container'
  | 'spring-transactions'
  | 'spring-mvc'
  | 'boot-configuration'
  | 'boot-web'
  | 'redis-structures'
  | 'redis-expiration'
  | 'redis-persistence'
  | 'redis-topology'
  | 'kafka-delivery'
  | 'rabbitmq-delivery'
  | 'distributed-consistency'
  | 'raft-consensus'
  | 'distributed-locks'
  | 'distributed-transactions'
  | 'service-resilience'
  | 'backend-capacity'
  | 'backend-consistency'
  | 'backend-observability'
  | 'binary'
  | 'cpu'
  | 'pipeline'
  | 'branch-prediction'
  | 'cache'
  | 'process'
  | 'virtual-memory'
  | 'tcp-handshake'
  | 'tcp-close'
  | 'dns'
  | 'http'
  | 'btree'
  | 'scheduling'
  | 'page-replacement'
  | 'tcp-reliability'
  | 'tcp-congestion'
  | 'linear-storage'
  | 'stack-queue'
  | 'hash-table'
  | 'search'
  | 'sorting'
  | 'trees-heaps'
  | 'graph'
  | 'optimization'
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
export type PipelineStage = 'IF' | 'ID' | 'EX' | 'MEM' | 'WB'
export interface PipelineCycle {
  cycle: number
  stages: (number | null)[]
  stalled: boolean
}
export interface PipelineComparison {
  label: string
  cycles: number
  stalls: number
}
export interface PipelineScene {
  kind: 'instruction-pipeline'
  cycle: number
  program: string[]
  stages: { name: PipelineStage; instruction: number | null; note: string }[]
  history: PipelineCycle[]
  registers: Record<string, number>
  memory: { address: number; value: number }[]
  comparison: PipelineComparison[]
  caption: string
}
export interface BranchTrial {
  index: number
  predicted: boolean
  actual: boolean
  before: number
  after: number
  correct: boolean
  penalty: number
}
export interface BranchComparison {
  label: string
  correct: number
  misses: number
  extraCycles: number
}
export interface BranchPredictionScene {
  kind: 'branch-prediction'
  strategy: string
  states: { value: number; label: string; predicts: boolean }[]
  counter: number
  sequence: boolean[]
  cursor: number
  pending: { index: number; predicted: boolean } | null
  trials: BranchTrial[]
  comparison: BranchComparison[]
  caption: string
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
  variant?: 'bplus' | 'bst' | 'heap'
  width: number
  height: number
  nodes: { id: string; keys: number[]; leaf: boolean; x: number; y: number; width: number }[]
  edges: { from: string; to: string }[]
  leafLinks: { from: string; to: string }[]
  path: string[]
  found: number | null
}
/** Shared presentation primitives; algorithms and state stay in their own models. */
export interface DataScene {
  kind: 'data'
  title: string
  cards?: { id: string; label: string; value: string | number; detail?: string; tone?: Tone }[]
  sequence?: { label: string; value: string | number; tone?: Tone }[]
  tables: {
    id: string
    title: string
    columns: string[]
    nowrapColumns?: number[]
    rows: { id: string; values: (string | number)[]; tone?: Tone }[]
  }[]
  caption: string
}
export interface GraphScene {
  kind: 'graph'
  directed: boolean
  nodes: {
    id: string
    x: number
    y: number
    distance: string
    parent: string | null
    visited: boolean
    current: boolean
  }[]
  edges: { from: string; to: string; weight: number; active: boolean }[]
  frontier: string[]
  path: string[]
  caption: string
}
export type ExperimentScene =
  | BinaryScene
  | CpuScene
  | PipelineScene
  | BranchPredictionScene
  | CacheScene
  | ProcessScene
  | VirtualMemoryScene
  | NetworkScene
  | TreeScene
  | DataScene
  | GraphScene
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
