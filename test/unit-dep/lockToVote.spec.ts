import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { expect } from 'chai'
import Web3Helper from '@helpers/web3'
import MemberController from '@api/controllers/member'

describe('LockToVote', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it.skip('should handle the lock to vote functionality', async function () {
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

  it('should not handle the lock to vote functionality for with manual transactions', async function () {
    this.timeout(1600000)
    const txns = [
      '0x4d41de9ba02c542690cebc996d49a18dcbc4a40c09052f3c8b3f4d9ff4124ef2',
      '0xefdaca60ccc30c7536d62535c6c0fbfbda7a78d32767ef81c0c67f1a618f3254',
      '0xcb06eed7a476101c464cda96f6b418a20cb28177de60e35fe37639d5f72a2079',
      '0xb27a41dd325113e3ece68eabf4a487021cd9f74f94e4d3a278ff44c6947a8721',
    ]

    const multipleEventsData = await Promise.all(
      txns.map(async txn => {
        const receipt = await Web3Helper.getTransactionReceipt(txn, NetworksEnum.ethereumSepolia)
        return UnitDepUtils.parseLogsByConfig(receipt?.logs as any, NetworksEnum.ethereumSepolia)
      }),
    )

    for (const events of multipleEventsData) {
      for (const event of events) {
        await event.handler(event.event, event.info)
      }
    }

    const daoAddress = '0x3bCd976E756EA18fe2d02724757237Cfa8DB3A92'
    const network = NetworksEnum.ethereumSepolia

    const plugin = await Models.Plugin.findOne({
      daoAddress,
      interfaceType: IPluginInterfaceType.lockToVote,
    })

    expect(plugin).to.exist
    expect(plugin.isSupported).to.be.true
    expect(plugin.lockManagerAddress).to.be.not.null

    const members = await MemberController.getMembersWithPagination(
      {
        page: 1,
      },
      {
        daoAddress,
        network,
        pluginAddress: plugin.address,
      },
    )

    expect(members.data).to.have.lengthOf(1)
  })
})
