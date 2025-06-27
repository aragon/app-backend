import { SinonSandbox } from 'sinon'
import * as sinon from 'sinon'
import { IPluginInterfaceType, ITokenType, NetworksEnum, TokenSyncTagName } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { PluginList } from '@test/mock/fakePlugins'
import { FakeToken } from '@test/mock/fakeToken'
import { Models } from '@dbModels'
import { TokenHolderSync } from '@plugins/tokenHolderSync'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import { expect } from 'chai'

describe('token holder sync case', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should check if token exceeds holder threshold', async () => {
    const tokenAddress = '0x4200000000000000000000000000000000000042'

    const plugin = {
      ...PluginList[0],
      network: NetworksEnum.optimismMainnet,
      tokenAddress: tokenAddress,
      blockNumber: 10000000,
      interfaceType: IPluginInterfaceType.tokenVoting,
    }

    const token = {
      ...FakeToken,
      network: NetworksEnum.optimismMainnet,
      address: tokenAddress,
      blockNumber: 123123,
      type: ITokenType.ERC20,
      hasDelegate: true,
    }

    const pluginDb = await Models.Plugin.create(plugin)
    const tokenDb = await Models.Token.create(token)

    sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')

    const syncDelegationEventSpy = sandbox.spy(TokenHolderSync, 'syncDelegationEvents')

    await LogTokenVoting.start(pluginDb, tokenDb, false)

    expect(syncDelegationEventSpy.calledOnce).to.be.true
    const tokenReloaded = await Models.Token.findOne({
      id: tokenDb.id,
    })
    expect(tokenReloaded.ignoreTransfer).to.be.true
    const configIndexerDefault = await Models.ConfigIndexer.findOne({
      service: TokenHolderSync.getTagName(pluginDb, tokenDb, TokenSyncTagName.Default),
    })
    expect(configIndexerDefault).to.be.not.null
    expect(configIndexerDefault.network).to.be.equal(pluginDb.network)
    expect(configIndexerDefault.lastSync).to.be.eq(plugin.blockNumber)
  })
})
