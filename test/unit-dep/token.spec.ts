import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'
import { Models } from '@dbModels'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import AragonPluginsService from '@plugins/index'
import ConfigIndexerHelper from '@helpers/configIndexer'
import PoolingCrawler from '@modules/poolingCrawler'

describe('Integ: Token', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('test get token', async () => {
    const network = NetworksEnum.ethereumSepolia
    const tokenAddress = '0x78AB36461370261268516F389F5F82EDBE7aA234'

    await ProxyToken.saveAndGetToken(tokenAddress, network)

    sandbox.stub(Models.Plugin, 'findByAddress').resolves({
      address: '0xPluginAddress',
      network: NetworksEnum.ethereumSepolia,
      interfaceType: IPluginInterfaceType.tokenVoting,
      tokenAddress,
    })

    const startStub = sandbox.stub(LogTokenVoting, 'start').resolves()

    await AragonPluginsService.pluginQueue({
      address: '0xPluginAddress',
      network: NetworksEnum.ethereumSepolia,
    })

    expect(startStub.called).to.be.true
  })

  it.skip('test the crawler issue', async function () {
    this.timeout(10000000000)
    const network = NetworksEnum.cornMainnet
    const blockNumber = 913077
    const logService = ConfigIndexerHelper.builders.indexer(network)

    await Models.ConfigIndexer.create({
      network,
      service: logService,
      lastSync: blockNumber,
    })

    await PoolingCrawler.start({
      logService,
      network,
    })
  })
})
