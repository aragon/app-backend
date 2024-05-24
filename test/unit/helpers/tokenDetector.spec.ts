import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import TokenDetector from '@helpers/tokenDetector'

import { beforeEach } from 'mocha'
import { ITokenType, NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import { expect } from 'chai'

describe('Helper: TokenDetector', () => {
  let sandbox: SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should detect if its erc20 governance token', async () => {
    await ProviderModule.connectToAllNetworks()
    const tokenType = await TokenDetector.detectTokenType(
      '0xEd02082BD33bE0d2953D1430a130c5Ea9b17F871',
      NetworksEnum.mainnet,
    )
    expect(tokenType?.type).to.equal(ITokenType.ERC721)
  })
})
