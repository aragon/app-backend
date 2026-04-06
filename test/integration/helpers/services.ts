import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import ConfigIndexerHelper from '@helpers/configIndexer'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Connections from '@modules/connections'
import AragonDaoService from '@services/aragon-dao'
import AragonGatewayService from '@services/aragon-gateway'
import AragonIndexerService from '@services/aragon-indexer'
import AragonPluginsService from '@services/aragon-plugins'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworksEnum } from '@types'
import sinon from 'sinon'
import { getAnvilProvider } from './constants'
import { generateWallet } from './wallet'
import MongoDB from '@modules/mongo'

async function seedForkBlock(forkBlock: number): Promise<void> {
  const network = NetworksEnum.ethereumMainnet
  const service = ConfigIndexerHelper.builders.indexer(network)
  const id = Models.ConfigIndexer.getEntityId({ network, service })
  await Models.ConfigIndexer.findOneAndUpdate(
    { id },
    { $set: { lastSync: forkBlock, network, service, id } },
    { upsert: true },
  )
}

const SERVICES = [AragonIndexerService, AragonGatewayService, AragonDaoService, AragonPluginsService]

export async function startServices(forkBlock?: number): Promise<void> {
  await generateWallet()
  // Drop all stale data from previous test runs
  await MongoDB.drop()
  await seedForkBlock(forkBlock ?? (await getAnvilProvider().getBlockNumber()) - 1)
  sinon.stub(CoinGeckoHelper, 'getToken').resolves(false)
  sinon.stub(CoinGeckoHelper, 'getNativeToken').resolves(false)
  sinon.stub(RabbitMQHelper, 'sendMessage').resolves()
  for (const service of SERVICES) {
    await Connections.open(service.NEED_CONNECTIONS ?? [], service.options)
    await service.start()
  }
}

export function stopServices(): void {
  const scheduler = TaskSchedulerState.getInstance()
  scheduler.stopAllTasks()
  // Clear the tasks map so next startServices can re-schedule without "Task is already scheduled"
  ;(scheduler as any).tasks = {}
  ;(scheduler as any).taskRunners = {}
  sinon.restore()
}

export async function waitForIndexerCatchup(targetBlock: number, timeoutMs = 60_000): Promise<void> {
  const network = NetworksEnum.ethereumMainnet
  const service = ConfigIndexerHelper.builders.indexer(network)
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const progress = await Models.ConfigIndexer.findOne({ network, service })
    if (progress && progress.lastSync >= targetBlock) return
    await new Promise(r => setTimeout(r, 1_000))
  }
  throw new Error(`Indexer did not catch up to block ${targetBlock} within ${timeoutMs}ms`)
}
