import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'

describe.skip('Integ: Token', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('test get token', async () => {
    const network = NetworksEnum.ethereumSepolia
    const tokenAddress = '0xB2f5bC5e7Bb39081811e6a9FE98F6fCa5F5b78a7'

    const token = await ProxyToken.saveAndGetToken(tokenAddress, network)
    expect(token?.address).to.equal(tokenAddress)
  })
})
