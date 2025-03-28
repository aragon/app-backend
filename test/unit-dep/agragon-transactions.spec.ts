import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProviderModule from '@modules/provider'
import AragonTransactionsService from '@services/aragon-transactions'
import { NetworksEnum } from '@types'
import utils from '@helpers/utils'

describe('AragonTransactions', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('Aragon Indexer should start realtime', async () => {
    sandbox.stub(utils, 'wait').resolves()
    const stubProcessBlock = sandbox.stub(AragonTransactionsService, 'processNewBlock').resolves()

    await AragonTransactionsService.start()

    await new Promise(resolve => {
      const checkCalls = setInterval(() => {
        if (stubProcessBlock.callCount >= 2) {
          clearInterval(checkCalls)
          resolve(null)
        }
      }, 50)
    })

    expect(stubProcessBlock.callCount).to.be.at.least(2)

    // Stop listening to new blocks after processNewBlock gets called
    Object.keys(ProviderModule.providerProxies).forEach(network => {
      const proxy = ProviderModule.providerProxies[network as NetworksEnum]
      if (proxy?.aragon?.ws) proxy.aragon.ws.removeAllListeners('block')
      if (proxy?.alchemy?.ws) proxy.alchemy.ws.removeAllListeners('block')
    })
  })
})
