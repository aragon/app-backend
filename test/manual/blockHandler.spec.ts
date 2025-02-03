import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import { BlockHandler } from '@services/aragon-transactions/blockHandler'

describe.skip('Manual: Block Handler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle reconnection during a loop', async function () {
    this.timeout(1600000) // Increase timeout for the test

    await ProviderModule.connectToAllNetworks()

    const blockNumber = 7630101

    const network = NetworksEnum.ethereumSepolia

    await BlockHandler._checkIfDepositEvents({ number: blockNumber }, network)
  })
})
