import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { InitialData } from '../../initialData'
import { LogMember } from '@services/aragon-indexer/logMember'
import IndexerService from '@services/aragon-indexer'

describe('Manual: Indexer', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('index', async function () {
    this.timeout(1000000000000000)
    // await ProviderModule.connectToAllNetworks()
    // await InitialData.start()
    // await LogMember.start()
    await IndexerService.start()
    console.log('end')
  })
})
