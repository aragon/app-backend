import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import config from '@config'
import { LogDao } from '@services/indexer/logDao'
import { InitialData } from '../../initialData'
import { Models } from '@dbModels'
import { NetworksEnum, PluginSubDomains } from '@types'
import { LogMember } from '@services/indexer/logMember'

describe('Manual: Indexer', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    config.BLOCKCHAIN_NODES.MAINNET = 'wss://eth-mainnet.g.alchemy.com/v2/REDACTED_ALCHEMY'
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('index', async function () {
    await ProviderModule.connectToAllNetworks()
    await InitialData.start()
    await LogMember.start()
  })
})
