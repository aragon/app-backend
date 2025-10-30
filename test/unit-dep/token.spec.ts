import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'
import { Models } from '@dbModels'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import AragonPluginsService from '@plugins/index'
import UnitDepUtils from '@test/lib/unit-dep/utils'

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

  it('should test gauge voting', async function () {
    this.timeout(100000000)

    const daoAddress = '0x6361CbCB86121FB3cb4FA358AECB0E96119A7314'
    const network = NetworksEnum.ethereumSepolia

    UnitDepUtils.stubRabbitmqSend(sandbox)
    await UnitDepUtils.syncACompleteDao(daoAddress, network)
  })
})
