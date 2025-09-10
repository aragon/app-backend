import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { ProxyToken } from '@modules/proxyToken'
import { Models } from '@dbModels'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import AragonPluginsService from '@plugins/index'

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
})
