import { execFileSync } from 'child_process'
import { Models } from '@dbModels'
import ConfigIndexerHelper from '@helpers/configIndexer'
import Runner from '@modules/runner'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import AragonDaoService from '@services/aragon-dao'
import AragonGatewayService from '@services/aragon-gateway'
import AragonIndexerService from '@services/aragon-indexer'
import AragonPluginsService from '@services/aragon-plugins'
import { NetworksEnum } from '@types'
import { generateWallet } from './wallet'

const ANVIL_RPC = process.env.ANVIL_RPC || 'http://localhost:8545'

function getForkBlock(): number {
  const result = execFileSync('curl', [
    '-sf',
    '-X',
    'POST',
    ANVIL_RPC,
    '-H',
    'Content-Type: application/json',
    '-d',
    '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}',
  ]).toString()
  return parseInt(JSON.parse(result).result, 16)
}

async function seedForkBlock(): Promise<void> {
  const network = NetworksEnum.ethereumMainnet
  const service = ConfigIndexerHelper.builders.indexer(network)
  const forkBlock = getForkBlock()
  const existing = await Models.ConfigIndexer.findExistingLog({ network, service })
  if (!existing) {
    await Models.ConfigIndexer.create({ network, service, lastSync: forkBlock - 1 })
  }
}

export async function startServices(): Promise<void> {
  generateWallet()
  await seedForkBlock()
  Runner(AragonIndexerService)
  Runner(AragonGatewayService)
  Runner(AragonDaoService)
  Runner(AragonPluginsService)
}

export function stopServices(): void {
  TaskSchedulerState.getInstance().stopAllTasks()
}
