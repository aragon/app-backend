import cluster from 'node:cluster'
import os from 'node:os'
import config from '@config'
import logger from '@logger'
import type { IService } from '@types'
import Runner from './runner'

const llo = logger.logMeta.bind(null, { service: 'clusterRunner' })

const MAX_RESTARTS = 5
const RESTART_WINDOW_MS = 5 * 60 * 1000

interface WorkerState {
  index: number
  networks: string[]
  restarts: number[]
}

function partitionNetworks(networks: string[], workerCount: number): string[][] {
  const partitions: string[][] = Array.from({ length: workerCount }, () => [])
  for (let i = 0; i < networks.length; i++) {
    partitions[i % workerCount].push(networks[i])
  }
  return partitions
}

function runPrimary(networks: string[], workerCount: number) {
  const partitions = partitionNetworks(networks, workerCount)
  const workers = new Map<number, WorkerState>()
  let shuttingDown = false

  logger.info(
    'Cluster primary started',
    llo({
      pid: process.pid,
      workerCount,
      networks: networks.length,
      partitions: partitions.map((p, i) => `worker-${i}: [${p.join(', ')}]`),
    }),
  )

  for (let i = 0; i < workerCount; i++) {
    forkWorker(i, partitions[i], [], workers)
  }

  cluster.on('exit', (worker, code, signal) => {
    const state = workers.get(worker.id)
    if (!state) return

    if (shuttingDown) {
      logger.info('Worker stopped during shutdown', llo({ workerIndex: state.index, pid: worker.process.pid }))
      workers.delete(worker.id)
      if (workers.size === 0) process.exit(0)
      return
    }

    logger.warn('Worker exited unexpectedly', llo({ workerIndex: state.index, pid: worker.process.pid, code, signal }))

    const now = Date.now()
    const restarts = state.restarts.filter(t => now - t < RESTART_WINDOW_MS)

    if (restarts.length >= MAX_RESTARTS) {
      logger.error(
        'Worker exceeded max restarts, not restarting',
        llo({ workerIndex: state.index, networks: state.networks, restarts: restarts.length }),
      )
      workers.delete(worker.id)
      if (workers.size === 0) process.exit(1)
      return
    }

    restarts.push(now)
    workers.delete(worker.id)

    forkWorker(state.index, state.networks, restarts, workers)
  })

  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('Cluster primary shutting down', llo({ workerCount: workers.size }))
    for (const worker of Object.values(cluster.workers || {})) {
      worker?.process.kill('SIGTERM')
    }
    setTimeout(() => process.exit(0), 20_000)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

function forkWorker(index: number, networks: string[], restarts: number[], workers: Map<number, WorkerState>) {
  const worker = cluster.fork({
    WORKER_NETWORKS: networks.join(','),
    WORKER_ID: String(index),
  })

  workers.set(worker.id, { index, networks, restarts })

  logger.info('Worker forked', llo({ workerIndex: index, pid: worker.process.pid, networks }))
}

function getNetworkList(): string[] {
  const supported = config.SUPPORTED_NETWORKS as string[]
  if (supported.length > 0) return supported
  // Derive from NODES config keys (e.g. ETHEREUM_MAINNET -> ethereum-mainnet)
  return Object.keys(config.NODES || {}).map(k => k.toLowerCase().replace(/_/g, '-'))
}

export function ClusterRunner(app: IService) {
  const networks = getNetworkList()
  const cpuCount = os.cpus().length
  const configWorkers = Number.parseInt(process.env.CLUSTER_WORKERS || '0', 10)
  // Use 70% of CPUs, shared across all clustered services
  const clusteredServices = 2 // indexer + transfers
  const maxAutoWorkers = Math.max(2, Math.floor((cpuCount * 0.7) / clusteredServices))

  // Determine worker count
  let workerCount: number
  if (configWorkers === 1) {
    // Single-process mode, no clustering
    Runner(app)
    return
  }
  if (configWorkers > 1) {
    workerCount = Math.min(configWorkers, networks.length)
  } else {
    // Auto: use 1/4 of CPUs, capped by network count
    workerCount = Math.min(maxAutoWorkers, networks.length)
  }

  // Need at least 2 workers for clustering to make sense
  if (workerCount < 2 || networks.length < 2) {
    Runner(app)
    return
  }

  if (cluster.isPrimary) {
    runPrimary(networks, workerCount)
  } else {
    Runner(app)
  }
}

export default ClusterRunner
