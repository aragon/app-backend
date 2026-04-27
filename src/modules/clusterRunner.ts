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
    forkWorker(i, partitions[i], workers)
  }

  cluster.on('exit', (worker, code, signal) => {
    const state = workers.get(worker.id)
    if (!state) return

    if (signal === 'SIGTERM' || signal === 'SIGINT') {
      logger.info('Worker stopped gracefully', llo({ workerId: worker.id, pid: worker.process.pid, signal }))
      workers.delete(worker.id)
      if (workers.size === 0) process.exit(0)
      return
    }

    logger.warn('Worker exited unexpectedly', llo({ workerId: worker.id, pid: worker.process.pid, code, signal }))

    const now = Date.now()
    state.restarts = state.restarts.filter(t => now - t < RESTART_WINDOW_MS)

    if (state.restarts.length >= MAX_RESTARTS) {
      logger.error(
        'Worker exceeded max restarts, not restarting',
        llo({ workerId: worker.id, networks: state.networks, restarts: state.restarts.length }),
      )
      workers.delete(worker.id)
      if (workers.size === 0) process.exit(1)
      return
    }

    state.restarts.push(now)
    workers.delete(worker.id)

    const workerIndex = worker.id - 1
    forkWorker(workerIndex, state.networks, workers)
  })

  const shutdown = () => {
    logger.info('Cluster primary shutting down', llo({ workerCount: workers.size }))
    for (const worker of Object.values(cluster.workers || {})) {
      worker?.process.kill('SIGTERM')
    }
    setTimeout(() => process.exit(0), 20_000)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

function forkWorker(index: number, networks: string[], workers: Map<number, WorkerState>) {
  const worker = cluster.fork({
    WORKER_NETWORKS: networks.join(','),
    WORKER_ID: String(index),
  })

  workers.set(worker.id, { networks, restarts: [] })

  logger.info('Worker forked', llo({ workerId: worker.id, pid: worker.process.pid, networks }))
}

export function ClusterRunner(app: IService) {
  const networks = config.SUPPORTED_NETWORKS as string[]
  const cpuCount = os.cpus().length
  const configWorkers = Number.parseInt(process.env.CLUSTER_WORKERS || '0', 10)

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
    // Auto: min of CPU cores and network count
    workerCount = Math.min(cpuCount, networks.length)
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
