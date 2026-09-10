import type {
  EngineFactory,
  ExperimentDefinition,
  ExperimentSession,
  ExperimentType,
} from '../types/experiment'
import { binaryEngine } from './models/binary'
import { cpuEngine } from './models/cpu'
import { cacheEngine } from './models/cache'
import { processEngine } from './models/process'
import { vmEngine } from './models/virtual-memory'
import { handshakeEngine } from './models/tcp-handshake'
import { closeEngine } from './models/tcp-close'
import { dnsEngine } from './models/dns'
import { httpEngine } from './models/http'
import { btreeEngine } from './models/btree'

const engines: Record<ExperimentType, EngineFactory> = {
  binary: binaryEngine,
  cpu: cpuEngine,
  cache: cacheEngine,
  process: processEngine,
  'virtual-memory': vmEngine,
  'tcp-handshake': handshakeEngine,
  'tcp-close': closeEngine,
  dns: dnsEngine,
  http: httpEngine,
  btree: btreeEngine,
}
export function createExperiment(definition: ExperimentDefinition): ExperimentSession {
  const factory = engines[definition.type]
  if (!factory) throw new Error('Unknown experiment engine: ' + definition.type)
  return factory(definition.config)
}
