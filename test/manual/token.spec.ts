import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'

describe('Manual: Provider', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle reconnection during a loop', async function () {
    this.timeout(60000) // Increase timeout for the test

    await ProviderModule.connectToAllNetworks()

    await ProxyToken.saveAndGetToken('0xD3596C81FcAb699192dc79C8e25f1362E3dFf89A', NetworksEnum.polygonMainnet)
  })
})
