import type { EngineFactory, ExperimentDefinition, ExperimentSession, ExperimentType } from '../types/experiment'
import { binaryEngine } from './models/binary'
import { cpuEngine } from './models/cpu'
import { cacheEngine } from './models/cache'

const engines: Partial<Record<ExperimentType, EngineFactory>> = { binary: binaryEngine, cpu: cpuEngine, cache: cacheEngine }
export function createExperiment(definition: ExperimentDefinition): ExperimentSession {
  const factory = engines[definition.type]
  if (!factory) throw new Error('Unknown experiment engine: ' + definition.type)
  return factory(definition.config)
}
