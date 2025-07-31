import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import {
  IPluginInterfaceType, IPluginStatus,
  NetworksEnum,
} from '@types'
import { TokenHolderSync } from '@plugins/tokenHolderSync'
import { ProxyToken } from '@modules/proxyToken'

import { PluginList } from '@test/mock/fakePlugins'
import { Models } from '@dbModels'

describe.skip('Batch Request', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('usage of delegation events', async function() {
    this.timeout(10000000)
    const tokenAddress = '0x4200000000000000000000000000000000000042'
    const network = NetworksEnum.optimismMainnet
    const fakePlugin = {
      ...PluginList[0],
      tokenAddress,
      status: IPluginStatus.installed,
      interfaceType: IPluginInterfaceType.tokenVoting,
      network,
      address: '0x6Adb3baB5730852eB53987EA89D8e8f16393C200',
    }
    const plugin = await Models.Plugin.create(fakePlugin)
    const token = await ProxyToken.saveAndGetToken(tokenAddress, network)
    await TokenHolderSync.syncDelegationEvents(plugin, token!)
  })
})