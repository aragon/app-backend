import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { expect } from 'chai'

describe('LockToVote', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle the lock to vote functionality', async function () {
    this.timeout(1600000)
    UnitDepUtils.stubRabbitmqSend(sandbox)
    const daoAddress = '0x3bCd976E756EA18fe2d02724757237Cfa8DB3A92'
    const network = NetworksEnum.ethereumSepolia

    await UnitDepUtils.syncACompleteDao(daoAddress, network)
    const plugin = await Models.Plugin.findOne({
      interfaceType: IPluginInterfaceType.lockToVote,
    })

    expect(plugin.isSupported).to.be.true
    expect(plugin.lockManagerAddress).to.be.not.null
    expect(plugin).to.exist
    const setting = await Models.PluginSetting.findOne({
      pluginAddress: plugin.address,
    })

    expect(setting).to.exist
    const members = await Models.LockManagerMember.find({
      pluginAddress: plugin.address,
      network,
    })

    expect(members).to.have.lengthOf(1)
  })
})
