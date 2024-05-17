import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { InitialData } from '../../initialData'
import { LogMember } from '@services/indexer/logMember'

describe('Manual: Indexer', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
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
