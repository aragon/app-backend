import { Models } from '@dbModels'
import CoinGeckoHelper from '@helpers/coinGecko'
import ConfigIndexerHelper from '@helpers/configIndexer'
import { evmExplorerClient } from '@helpers/evmExplorerClient'
import Connections from '@modules/connections'
import MongoDB from '@modules/mongo'
import AragonDaoService from '@services/aragon-dao'
import AragonGatewayService from '@services/aragon-gateway'
import AragonIndexerService from '@services/aragon-indexer'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { stubRabbitmqSend } from '@test/lib/stubs/rabbitmq'
import { EnumConnection, NetworksEnum } from '@types'
import mongoose from 'mongoose'
import sinon from 'sinon'
import { getAnvilProvider } from './constants'

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

const SERVICES = [AragonIndexerService, AragonGatewayService, AragonDaoService]

async function dropEntireDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    await MongoDB.drop()
    return
  }
  await mongoose.connection.dropDatabase()
}

export async function startServices(forkBlock?: number): Promise<void> {
  // Open the DB connection first so we can dropDatabase() against it.
  await Connections.open([EnumConnection.MONGODB])
  await dropEntireDatabase()

  await seedForkBlock(forkBlock ?? (await getAnvilProvider().getBlockNumber()) - 1)
  sinon.stub(CoinGeckoHelper, 'getToken').resolves(false)
  sinon.stub(CoinGeckoHelper, 'getNativeToken').resolves(false)
  sinon.stub(evmExplorerClient, 'fetchContractCreation').callsFake(async (_type, address) => ({
    blockNumber: 0,
    transactionHash: '',
    address,
  }))
  sinon.stub(evmExplorerClient, 'fetchContractSourceCode').resolves(null)
  sinon.stub(evmExplorerClient, 'getTokenBalances').resolves([])
  stubRabbitmqSend()
  for (const service of SERVICES) {
    await Connections.open(service.NEED_CONNECTIONS ?? [], service.options)
    await service.start()
  }
}

export function stopServices(): void {
  TaskSchedulerState.getInstance().reset()
  sinon.restore()
}

export async function waitForIndexerCatchup(targetBlock: number, timeoutMs = 60_000): Promise<void> {
  const network = NetworksEnum.ethereumMainnet
  const service = ConfigIndexerHelper.builders.indexer(network)
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const progress = await Models.ConfigIndexer.findOne({ network, service })
    if (progress && progress.lastSync >= targetBlock) return
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error(`Indexer did not catch up to block ${targetBlock} within ${timeoutMs}ms`)
}
