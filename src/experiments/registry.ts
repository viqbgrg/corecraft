import type {
  EngineFactory,
  ExperimentDefinition,
  ExperimentSession,
  ExperimentType,
} from '../types/experiment'
import { binaryEngine } from './models/binary'
import { cpuEngine } from './models/cpu'
import { pipelineEngine } from './models/pipeline'
import { branchPredictionEngine } from './models/branch-prediction'
import { cacheEngine } from './models/cache'
import { processEngine } from './models/process'
import { vmEngine } from './models/virtual-memory'
import { handshakeEngine } from './models/tcp-handshake'
import { closeEngine } from './models/tcp-close'
import { dnsEngine } from './models/dns'
import { httpEngine } from './models/http'
import { btreeEngine } from './models/btree'
import { schedulingEngine } from './models/scheduling'
import { replacementEngine } from './models/page-replacement'
import { reliabilityEngine } from './models/tcp-reliability'
import { congestionEngine } from './models/tcp-congestion'
import { linearEngine } from './models/linear-storage'
import { queueEngine } from './models/stack-queue'
import { hashEngine } from './models/hash-table'
import { searchEngine } from './models/search'
import { sortingEngine } from './models/sorting'
import { treesEngine } from './models/trees-heaps'
import { graphEngine } from './models/graph'
import { optimizationEngine } from './models/optimization'
import { modelingEngine } from './models/modeling'
import { signedEngine } from './models/signed-number'
import { floatEngine } from './models/floating-point'
import { encodingEngine } from './models/encoding'
import { logicEngine } from './models/logic'
import { transferEngine } from './models/interrupt-dma'
import { fileSystemEngine } from './models/filesystem'
import { pageCacheEngine } from './models/page-cache'
import { ioEngine } from './models/io-multiplexing'
import { layersEngine } from './models/network-layers'
import { tlsEngine } from './models/tls'
import { databasePagesEngine } from './models/database-pages'
import { walEngine } from './models/wal'
import { transactionsEngine } from './models/transactions'
import { optimizerEngine } from './models/query-optimizer'
import { innoIndexesEngine } from './models/innodb-indexes'
import { innoCommitEngine } from './models/innodb-commit'
import { readViewEngine } from './models/innodb-read-view'
import { innoLocksEngine } from './models/innodb-locks'
import { executionEngine } from './models/mysql-execution'
import { objectsEngine } from './models/java-objects'
import { classesEngine } from './models/java-classes'
import { collectionsEngine } from './models/java-collections'
import { jmmEngine } from './models/java-memory-model'
import { javaIoEngine } from './models/java-io-apis'
import { runtimeEngine } from './models/jvm-runtime'
import { gcEngine } from './models/jvm-gc'
import { relocationEngine } from './models/jvm-collectors'
import { jitEngine } from './models/jvm-jit'
import { atomicsEngine } from './models/java-atomics'
import { locksEngine } from './models/java-locks'
import { coordinationEngine } from './models/java-coordination'
import { executorEngine } from './models/java-executors'
import { concurrentMapEngine } from './models/java-concurrent-map'
import { futuresEngine } from './models/java-futures'

import { fileIoEngine } from './models/java-file-io'
import { selectorEngine } from './models/nio-selector'
import { reactorEngine } from './models/netty-reactor'

import { containerEngine } from './models/spring-container'
import { springTxEngine } from './models/spring-transactions'
import { mvcEngine } from './models/spring-mvc'

import { bootConfigEngine } from './models/boot-configuration'
import { bootWebEngine } from './models/boot-web'

import { redisStructuresEngine } from './models/redis-structures'
import { expirationEngine } from './models/redis-expiration'
import { persistenceEngine } from './models/redis-persistence'
import { topologyEngine } from './models/redis-topology'

import { kafkaEngine } from './models/kafka-delivery'
import { rabbitEngine } from './models/rabbitmq-delivery'

import { consistencyEngine } from './models/distributed-consistency'
import { raftEngine } from './models/raft-consensus'
import { leaseEngine } from './models/distributed-locks'
import { distributedTxEngine } from './models/distributed-transactions'
import { resilienceEngine } from './models/service-resilience'

import { capacityEngine } from './models/backend-capacity'
import { integrationEngine } from './models/backend-consistency'
import { observabilityEngine } from './models/backend-observability'

const engines: Record<ExperimentType, EngineFactory> = {
  modeling: modelingEngine,
  'signed-number': signedEngine,
  'floating-point': floatEngine,
  encoding: encodingEngine,
  logic: logicEngine,
  'interrupt-dma': transferEngine,
  filesystem: fileSystemEngine,
  'page-cache': pageCacheEngine,
  'io-multiplexing': ioEngine,
  'network-layers': layersEngine,
  tls: tlsEngine,
  'database-pages': databasePagesEngine,
  wal: walEngine,
  transactions: transactionsEngine,
  'query-optimizer': optimizerEngine,
  'innodb-indexes': innoIndexesEngine,
  'innodb-commit': innoCommitEngine,
  'innodb-read-view': readViewEngine,
  'innodb-locks': innoLocksEngine,
  'mysql-execution': executionEngine,
  'java-objects': objectsEngine,
  'java-classes': classesEngine,
  'java-collections': collectionsEngine,
  'java-memory-model': jmmEngine,
  'java-io-apis': javaIoEngine,
  'jvm-runtime': runtimeEngine,
  'jvm-gc': gcEngine,
  'jvm-collectors': relocationEngine,
  'jvm-jit': jitEngine,
  'java-atomics': atomicsEngine,
  'java-locks': locksEngine,
  'java-coordination': coordinationEngine,
  'java-executors': executorEngine,
  'java-concurrent-map': concurrentMapEngine,
  'java-futures': futuresEngine,
  'java-file-io': fileIoEngine,
  'nio-selector': selectorEngine,
  'netty-reactor': reactorEngine,
  'spring-container': containerEngine,
  'spring-transactions': springTxEngine,
  'spring-mvc': mvcEngine,
  'boot-configuration': bootConfigEngine,
  'boot-web': bootWebEngine,
  'redis-structures': redisStructuresEngine,
  'redis-expiration': expirationEngine,
  'redis-persistence': persistenceEngine,
  'redis-topology': topologyEngine,
  'kafka-delivery': kafkaEngine,
  'rabbitmq-delivery': rabbitEngine,
  'distributed-consistency': consistencyEngine,
  'raft-consensus': raftEngine,
  'distributed-locks': leaseEngine,
  'distributed-transactions': distributedTxEngine,
  'service-resilience': resilienceEngine,
  'backend-capacity': capacityEngine,
  'backend-consistency': integrationEngine,
  'backend-observability': observabilityEngine,
  binary: binaryEngine,
  cpu: cpuEngine,
  pipeline: pipelineEngine,
  'branch-prediction': branchPredictionEngine,
  cache: cacheEngine,
  process: processEngine,
  'virtual-memory': vmEngine,
  'tcp-handshake': handshakeEngine,
  'tcp-close': closeEngine,
  dns: dnsEngine,
  http: httpEngine,
  btree: btreeEngine,
  scheduling: schedulingEngine,
  'page-replacement': replacementEngine,
  'tcp-reliability': reliabilityEngine,
  'tcp-congestion': congestionEngine,
  'linear-storage': linearEngine,
  'stack-queue': queueEngine,
  'hash-table': hashEngine,
  search: searchEngine,
  sorting: sortingEngine,
  'trees-heaps': treesEngine,
  graph: graphEngine,
  optimization: optimizationEngine,
}
export function createExperiment(definition: ExperimentDefinition): ExperimentSession {
  const factory = engines[definition.type]
  if (!factory) throw new Error('Unknown experiment engine: ' + definition.type)
  return factory(definition.config)
}
