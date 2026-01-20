import { Models } from '@dbModels'
import { SyncCmsSpamTokens } from '@services/aragon-rates/handlers/syncCmsSpamTokens'
import { ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'

describe('Integ: Scam Token Sync From CMS', () => {
  const ethSpamToken = '0x2747eE1EE8490Ce2f1853600c28a3846353d9d31'
  const polySpamToken = '0xcf68f02d7dD6a4642AE6a77f6A3676D0CBC834c9'

  it('should mark tokens as spam from CMS list', async function () {
    this.timeout(60000)

    await Models.Token.create({
      network: NetworksEnum.ethereumMainnet,
      type: ITokenType.ERC20,
      address: ethSpamToken,
      name: 'ETH Spam Token',
      symbol: 'ETHS',
      decimals: 18,
      isSpam: false,
      spamSource: null,
    })

    await Models.Token.create({
      network: NetworksEnum.polygonMainnet,
      type: ITokenType.ERC20,
      address: polySpamToken,
      name: 'Poly Spam Token',
      symbol: 'POLYS',
      decimals: 18,
      isSpam: false,
      spamSource: null,
    })

    await SyncCmsSpamTokens.start()

    const updatedEthToken = await Models.Token.findOne({
      address: ethSpamToken,
      network: NetworksEnum.ethereumMainnet,
    })
    const updatedPolyToken = await Models.Token.findOne({
      address: polySpamToken,
      network: NetworksEnum.polygonMainnet,
    })

    expect(updatedEthToken?.isSpam).to.be.true
    expect(updatedEthToken?.spamSource).to.equal('cms')
    expect(updatedPolyToken?.isSpam).to.be.true
    expect(updatedPolyToken?.spamSource).to.equal('cms')
  })
})