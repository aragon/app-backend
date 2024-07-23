import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import IndexerService from '@services/aragon-indexer'
import Web3Helper from '@helpers/web3'

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
    await IndexerService.start()
    console.log('end')
  })
})
