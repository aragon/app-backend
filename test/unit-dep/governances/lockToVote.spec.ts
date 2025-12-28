import MemberController from '@api/controllers/member'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { LibUtils } from '@test/lib/unit-dep/lib'
import { IMembersResponse, IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Integ: LockToVote', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('LockToVote flow', () => {
    const networks = [
      {
        network: NetworksEnum.ethereumSepolia,
        daoAddress: '0x9AEC04370195A24E3674f52Bd660C45Bf88E4166',
        fromBlock: 9117761,
        toBlock: 9124851,
      },
    ]

    for (const { network, daoAddress, fromBlock, toBlock } of networks) {
      it(`should handle veLock all events properly ${network}`, async function () {
        this.timeout(100000000)

        const libUtils = new LibUtils({
          daoAddress,
          network,
          config: {
            sandbox,
            blockLimit: toBlock,
          },
        })
        await libUtils.syncCompleteDao(fromBlock)

        const plugin = await Models.Plugin.findOne({
          interfaceType: IPluginInterfaceType.lockToVote,
          address: '0x0B959aaE24D257847829dfdb1e4359245AcCB41F',
          daoAddress,
          network,
        })

        expect(plugin).to.exist
        expect(plugin.isSupported).to.be.true
        expect(plugin.lockManagerAddress).to.be.not.null

        const setting = await Models.Setting.findOne({
          pluginAddress: plugin.address,
        })
        expect(setting).to.exist

        const membersFromQuery = await Models.LockToVoteMember.find({ lockManagerAddress: plugin.lockManagerAddress })
        const members = await MemberController.getMembersWithPagination(
          {
            page: 1,
            limit: 100,
            sort: 'votingPower',
            order: 'desc',
          },
          {
            daoAddress,
            network,
            pluginAddress: plugin.address,
          },
        )

        expect(members.data.length).to.eq(membersFromQuery.length)
        const sortedMembers = members.data.sort(
          (a: any, b: any) => parseFloat(b.votingPower) - parseFloat(a.votingPower),
        )
        expect(members.data).to.deep.equal(sortedMembers)

        const member = members.data[0] as IMembersResponse
        expect(member.address).to.eq('0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759')
        expect(member.ens).to.eq('ea1.aragonx.eth')
        expect(member.votingPower?.toString()).to.eq('1000000')
        expect(member.metrics.voteCount).to.eq(0)
        expect(member.metrics.proposalCount).to.eq(0)
        expect(member.metrics.firstActivity).to.eq(9124841)
        expect(member.metrics.lastActivity).to.eq(9124841)
      })
    }
  })

  it.skip('should handle lockToVote + endpoint with manual transactions', async function () {
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
        return LibUtils.parseLogsByConfig(receipt?.logs as any, NetworksEnum.ethereumSepolia)
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

    const membersFromQuery = await Models.LockToVoteMember.find({ lockManagerAddress: plugin.lockManagerAddress })
    const members = await MemberController.getMembersWithPagination(
      {
        page: 1,
        limit: 100,
        sort: 'votingPower',
        order: 'desc',
      },
      {
        daoAddress,
        network,
        pluginAddress: plugin.address,
      },
    )

    expect(members.data.length).to.eq(membersFromQuery.length)
    const sortedMembers = members.data.sort((a: any, b: any) => parseFloat(b.votingPower) - parseFloat(a.votingPower))
    expect(members.data).to.deep.equal(sortedMembers)

    const member = members.data[0] as IMembersResponse
    expect(member.address).to.eq('0x17366cae2b9c6C3055e9e3C78936a69006BE5409')
    expect(member.ens).to.eq('cgero.eth')
    expect(member.votingPower).to.eq('386000000000000000000')
    expect(member.metrics.voteCount).to.eq(0)
    expect(member.metrics.proposalCount).to.eq(0)
    expect(member.metrics.firstActivity).to.eq(8911665)
    expect(member.metrics.lastActivity).to.eq(8911665)
  })
})
