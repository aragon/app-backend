import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import config from '@config'
import EnsHelper from '@helpers/ens'

describe('Manual: Web3', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should get ens from address as viem way', async () => {
    config.BLOCKCHAIN_NODES.ETHEREUM_MAINNET = ''

    await ProviderModule.connectToAllNetworks()

    const testAddresses = [
      '0x42E6DD8D517abB3E4f6611Ca53a8D1243C183fB0',
      '0xd5fb864ACfD6BB2f72939f122e89fF7F475924f5',
      '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31',
    ]

    for (const address of testAddresses) {
      const ensName = await EnsHelper.getEnsWithUniversalResolver(address)
      console.log(address, ' => ', ensName)
    }
  })
})
