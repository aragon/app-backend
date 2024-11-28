import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'

describe('Manual: Token', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle reconnection during a loop', async function () {
    this.timeout(160000) // Increase timeout for the test

    await ProviderModule.connectToAllNetworks()

    await ProxyToken.saveAndGetToken('0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', NetworksEnum.ethereumMainnet)
  })
})
