import type { Course } from '../types/course'
import modeling from './modeling'
import binary from './binary'
import signedNumber from './signed-number'
import floatingPoint from './floating-point'
import encoding from './encoding'
import logic from './logic'
import interruptDma from './interrupt-dma'
import filesystem from './filesystem'
import pageCache from './page-cache'
import ioMultiplexing from './io-multiplexing'
import networkLayers from './network-layers'
import tls from './tls'
import databasePages from './database-pages'
import wal from './wal'
import transactions from './transactions'
import queryOptimizer from './query-optimizer'
import innoIndexes from './innodb-indexes'
import innoCommit from './innodb-commit'
import innoReadView from './innodb-read-view'
import innoLocks from './innodb-locks'
import mysqlExecution from './mysql-execution'
import javaObjects from './java-objects'
import javaClasses from './java-classes'
import javaCollections from './java-collections'
import javaMemoryModel from './java-memory-model'
import javaIoApis from './java-io-apis'
import jvmRuntime from './jvm-runtime'
import jvmGc from './jvm-gc'
import jvmCollectors from './jvm-collectors'
import jvmJit from './jvm-jit'
import cpu from './cpu'
import pipeline from './pipeline'
import branchPrediction from './branch-prediction'
import cache from './cache'
import process from './process'
import virtualMemory from './virtual-memory'
import handshake from './tcp-handshake'
import close from './tcp-close'
import dns from './dns'
import http from './http'
import btree from './btree'
import scheduling from './scheduling'
import pageReplacement from './page-replacement'
import tcpReliability from './tcp-reliability'
import tcpCongestion from './tcp-congestion'
import linearStorage from './linear-storage'
import stackQueue from './stack-queue'
import hashTable from './hash-table'
import binarySearch from './binary-search'
import sorting from './sorting'
import treesHeaps from './trees-heaps'
import graph from './graph'
import dynamicProgramming from './dynamic-programming'

import javaAtomics from './java-atomics'

import javaLocks from './java-locks'

import javaCoordination from './java-coordination'

import javaExecutors from './java-executors'

import javaConcurrentMap from './java-concurrent-map'

import javaFutures from './java-futures'

import javaFileIo from './java-file-io'

import nioSelector from './nio-selector'

import nettyReactor from './netty-reactor'

import springContainer from './spring-container'

import springTransactions from './spring-transactions'

import springMvc from './spring-mvc'

import bootConfiguration from './boot-configuration'

import bootWeb from './boot-web'

import redisStructures from './redis-structures'

import redisExpiration from './redis-expiration'

import redisPersistence from './redis-persistence'

import redisTopology from './redis-topology'

import kafkaDelivery from './kafka-delivery'

import rabbitmqDelivery from './rabbitmq-delivery'

import distributedConsistency from './distributed-consistency'

import raftConsensus from './raft-consensus'

import distributedLocks from './distributed-locks'

import distributedTransactions from './distributed-transactions'

import serviceResilience from './service-resilience'

import backendCapacity from './backend-capacity'

import backendConsistency from './backend-consistency'

import backendObservability from './backend-observability'

export const courses: Course[] = [
  modeling,
  binary,
  signedNumber,
  floatingPoint,
  encoding,
  logic,
  cpu,
  pipeline,
  branchPrediction,
  cache,
  interruptDma,
  process,
  scheduling,
  virtualMemory,
  pageReplacement,
  filesystem,
  pageCache,
  ioMultiplexing,
  networkLayers,
  handshake,
  close,
  tcpReliability,
  tcpCongestion,
  dns,
  http,
  tls,
  linearStorage,
  stackQueue,
  hashTable,
  binarySearch,
  sorting,
  treesHeaps,
  btree,
  graph,
  dynamicProgramming,
  databasePages,
  wal,
  transactions,
  queryOptimizer,
  innoIndexes,
  innoCommit,
  innoReadView,
  innoLocks,
  mysqlExecution,
  javaObjects,
  javaClasses,
  javaCollections,
  javaMemoryModel,
  javaIoApis,
  jvmRuntime,
  jvmGc,
  jvmCollectors,
  jvmJit,
  javaAtomics,
  javaLocks,
  javaCoordination,
  javaExecutors,
  javaConcurrentMap,
  javaFutures,
  javaFileIo,
  nioSelector,
  nettyReactor,
  springContainer,
  springTransactions,
  springMvc,
  bootConfiguration,
  bootWeb,
  redisStructures,
  redisExpiration,
  redisPersistence,
  redisTopology,
  kafkaDelivery,
  rabbitmqDelivery,
  distributedConsistency,
  raftConsensus,
  distributedLocks,
  distributedTransactions,
  serviceResilience,
  backendCapacity,
  backendConsistency,
  backendObservability,
]
export const getCourse = (slug: string): Course | undefined => courses.find((course) => course.slug === slug)
