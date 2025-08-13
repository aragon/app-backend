import VeLockIntMockTestData from '@test/unit-dep/mockData/veLockIntTestMock.json'
import sinon from 'sinon'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { IMembersResponse, IPluginInterfaceType, NetworksEnum } from '@types'
import logger from '@logger'
import configIndexer from '@indexer/configIndexer'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { expect } from 'chai'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import MemberController from '@api/controllers/member'
import { MemberGovernanceFactory } from '@modules/memberGovernance'

describe.only('GovernanceVeLock: Integration Test', () => {
  let sandbox: sinon.SinonSandbox
  const eventsToLook = ['Deposit', 'Withdraw', 'MinDepositSet', 'ExitQueued', 'MinLockSet']

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(RabbitMQHelper, 'sendMessage')
  })

  afterEach(() => {
    sandbox.restore()
  })

  async function init() {
    await Models.Dao.create({
      ...VeLockIntMockTestData.dao,
    })

    await Models.Plugin.create({
      ...VeLockIntMockTestData.plugin,
    })
  }

  async function parseLogsAndGet(txHash: string, network: NetworksEnum) {
    const receipt = await Web3Helper.getTransactionReceipt(txHash, network)
    if (!receipt) {
      logger.warn('Transaction receipt not found', { txHash, network })
      throw new Error('Transaction receipt not found')
    }

    const topicsToLook = configIndexer.filter(config => eventsToLook.includes(config.event)).map(config => config.topic)
    const filteredLogs = receipt.logs.filter(log => topicsToLook.includes(log.topics[0]))

    const sortedLogs = filteredLogs.sort((a, b) => a.index - b.index)

    return UnitDepUtils.parseLogsByConfig(sortedLogs, network)
  }

  it('should handle veLock deposit, exitqueue, and withdraw events', async () => {
    await init()
    const depositTx = '0x19db860dd4e0eff8e9f571c7cc2faf8e605bbb99e2ab8ce3d3739a405e3f989f'
    const parsedLogs = await parseLogsAndGet(depositTx, NetworksEnum.ethereumSepolia)

    for (const { event, handler, info } of parsedLogs) {
      await handler(event, info)
    }

    const lock = await Models.Lock.findOne({
      transactionHash: depositTx,
      network: NetworksEnum.ethereumSepolia,
    })

    const plugin = await Models.Plugin.findOne({
      'votingEscrow.escrowAddress': lock?.escrowAddress,
    })

    expect(plugin).to.be.exist
    expect(lock).to.exist
    expect(lock.escrowAddress).to.be.eq(parsedLogs[0].info.address)
    const daoMemberMapping = await Models.DaoMemberMapping.findOne({
      memberAddress: lock?.memberAddress,
    })
    expect(daoMemberMapping).to.be.exist

    //let's try now exitQueue event by modifying the plugin itself
    const exitQueueTx = '0x342bd9c6291872eff745618bbfeaee56cf8a68900914603d6a2a3c5dbbd9686f'
    const exitQueueParsedLogs = await parseLogsAndGet(exitQueueTx, NetworksEnum.ethereumSepolia)

    //set the exitQueueAddress in the plugin
    plugin.votingEscrow.exitQueueAddress = '0x93008b28002c5a77620c2cF8548E5665326640D0'
    await plugin.save()

    // set the exitQueueAddress in the lock as well
    lock.exitQueueAddress = plugin.votingEscrow.exitQueueAddress
    lock.tokenId = '2'
    lock.memberAddress = '0x17366cae2b9c6C3055e9e3C78936a69006BE5409'

    await lock.save()

    for (const { event, handler, info } of exitQueueParsedLogs) {
      await handler(event, info)
    }

    const lockReloaded = await Models.Lock.findOne({
      id: lock.id,
    })

    expect(lockReloaded).to.be.exist
    expect(lockReloaded.lockExit?.status).to.be.true
    expect(lockReloaded.lockExit?.transactionHash).to.be.eq(exitQueueTx)

    // now let's try withdraw event
    const withdrawTx = '0x1172a27d62f48e2b4d9b1ce9f86d261cc4b5cd65924185b20e1744906d7ef1ab'
    const withdrawParsedLogs = await parseLogsAndGet(withdrawTx, NetworksEnum.ethereumSepolia)

    plugin.votingEscrow = VeLockIntMockTestData.plugin.votingEscrow
    await plugin.save()

    lockReloaded.escrowAddress = plugin.votingEscrow.escrowAddress
    lockReloaded.exitQueueAddress = plugin.votingEscrow.exitQueueAddress
    lockReloaded.tokenId = '10'
    lockReloaded.memberAddress = '0x17366cae2b9c6C3055e9e3C78936a69006BE5409'

    await lockReloaded.save()

    for (const { event, handler, info } of withdrawParsedLogs) {
      await handler(event, info)
    }

    const lockAfterWithdraw = await Models.Lock.findOne({
      id: lockReloaded.id,
    })

    expect(lockAfterWithdraw).to.be.exist
    expect(lockAfterWithdraw.lockWithdraw?.status).to.be.true
    expect(lockAfterWithdraw.lockWithdraw?.transactionHash).to.be.eq(withdrawTx)
    const daoMemberMappingAfterWithdraw = await Models.DaoMemberMapping.findOne({
      daoAddress: plugin.daoAddress,
    })
    expect(daoMemberMappingAfterWithdraw).to.be.not.exist
  })

  it.only('should handle veLock all events properly', async function() {
    this.timeout(100000000)
    const daoAddress = '0x9418fcf1Aa0dCEB9090F2bBA06E70d94E10e46b1'
    await UnitDepUtils.syncACompleteDao(daoAddress, NetworksEnum.ethereumSepolia)
    const plugins = await Models.Plugin.find({
      daoAddress,
    })
    expect(plugins).to.be.an('array')
    expect(plugins.length).to.be.gt(1)

    const veLockPlugin = plugins.find(plugin => plugin.votingEscrow !== null)
    expect(veLockPlugin).to.be.exist
    const token = await Models.Token.findOne({
      address: veLockPlugin.tokenAddress,
    })

    await LogTokenVoting.start(veLockPlugin, token)

    const membersFromQuery = await Models.TokenMember.find({ tokenAddress: token.address, votingPower: {$ne: '0'} })
    const members = await MemberController.getMembersWithPagination(
      {
        page: 1, limit: 100, sort: 'votingPower', order: 'desc',
      },
      {
        daoAddress,
        network: veLockPlugin.network,
        pluginAddress: veLockPlugin.address,
      },
    )

    expect(members.data.length).to.eq(membersFromQuery.length)
    const sortedMembers = members.data.sort((a: any, b: any) => parseFloat(b.votingPower) - parseFloat(a.votingPower))
    expect(members.data).to.deep.equal(sortedMembers)

    const member = members.data[0] as IMembersResponse
    expect(member.address).to.eq('0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759')
    expect(member.ens).to.eq('ea1.aragonx.eth')
    expect(member.votingPower?.toString()).to.eq('902791016093683639820506')
    expect(member.metrics.voteCount).to.eq(0)
    expect(member.metrics.proposalCount).to.eq(0)
    expect(member.metrics.firstActivity).to.eq(8618799)
    expect(member.metrics.lastActivity).to.eq(8618799)
  })
})


  // [
  // {
  //   "_id": "689bbeb36ca6a0d0dc9041b9",
  //   "id": "ethereum-sepolia-0x211aEa089C589bbCB636A52283B520E1b4F7c1b3-0x17366cae2b9c6C3055e9e3C78936a69006BE5409",
  //   "memberAddress": "0x17366cae2b9c6C3055e9e3C78936a69006BE5409",
  //   "votingPower": "834270833333288393000",
  //   "tokenAddress": "0x211aEa089C589bbCB636A52283B520E1b4F7c1b3",
  //   "tokenIds": [
  //     "1",
  //     "2",
  //     "6"
  //   ],
  //   "network": "ethereum-sepolia",
  //   "delegateReceivedCount": 0,
  //   "lastVPBlockNumber": 8627064,
  //   "createdAt": "2025-08-12T22:22:43.371Z",
  //   "updatedAt": "2025-08-12T22:22:48.858Z",
  //   "__v": 3
  // },
  //   {
  //     "_id": "689bbeb66ca6a0d0dc9041ed",
  //     "id": "ethereum-sepolia-0x211aEa089C589bbCB636A52283B520E1b4F7c1b3-0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759",
  //     "memberAddress": "0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759",
  //     "votingPower": "902791016093683639820506",
  //     "tokenAddress": "0x211aEa089C589bbCB636A52283B520E1b4F7c1b3",
  //     "tokenIds": [
  //       "3",
  //       "4",
  //       "7",
  //       "9"
  //     ],
  //     "network": "ethereum-sepolia",
  //     "delegateReceivedCount": 0,
  //     "lastVPBlockNumber": 8770637,
  //     "createdAt": "2025-08-12T22:22:46.349Z",
  //     "updatedAt": "2025-08-12T22:22:53.506Z",
  //     "__v": 4
  //   },
  //   {
  //     "_id": "689bbeb76ca6a0d0dc90420d",
  //     "id": "ethereum-sepolia-0x211aEa089C589bbCB636A52283B520E1b4F7c1b3-0xE3217A7790BB9bb60D4712B86E96B5f77AF7a747",
  //     "memberAddress": "0xE3217A7790BB9bb60D4712B86E96B5f77AF7a747",
  //     "votingPower": "0",
  //     "tokenAddress": "0x211aEa089C589bbCB636A52283B520E1b4F7c1b3",
  //     "tokenIds": [
  //       "5"
  //     ],
  //     "network": "ethereum-sepolia",
  //     "delegateReceivedCount": 0,
  //     "lastVPBlockNumber": 8626049,
  //     "createdAt": "2025-08-12T22:22:47.894Z",
  //     "updatedAt": "2025-08-12T22:22:48.053Z",
  //     "__v": 1
  //   },
  //   {
  //     "_id": "689bbeba6ca6a0d0dc904243",
  //     "id": "ethereum-sepolia-0x211aEa089C589bbCB636A52283B520E1b4F7c1b3-0x061BB58c8C726e545618d9D594bb81D38fabe405",
  //     "memberAddress": "0x061BB58c8C726e545618d9D594bb81D38fabe405",
  //     "votingPower": "0",
  //     "tokenAddress": "0x211aEa089C589bbCB636A52283B520E1b4F7c1b3",
  //     "tokenIds": [
  //       "8"
  //     ],
  //     "network": "ethereum-sepolia",
  //     "delegateReceivedCount": 0,
  //     "lastVPBlockNumber": 8726507,
  //     "createdAt": "2025-08-12T22:22:50.846Z",
  //     "updatedAt": "2025-08-12T22:22:50.999Z",
  //     "__v": 1
  //   }
  // ]


  // [
// {
//   "votingPower": "1660157840375607403798261",
//   "address": "0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759",
//   "ens": "ea1.aragonx.eth",
//   "avatar": null,
//   "metrics": {
//     "voteCount": 0,
//     "proposalCount": 0,
//     "firstActivity": 8618799,
//     "lastActivity": 8618799,
//     "delegateReceivedCount": 0
//   }
// },
//   {
//     "votingPower": "22118213074637564350466",
//     "address": "0xE3217A7790BB9bb60D4712B86E96B5f77AF7a747",
//     "ens": "ea2.aragonx.eth",
//     "avatar": null,
//     "metrics": {
//       "voteCount": 0,
//       "proposalCount": 0,
//       "firstActivity": 8626049,
//       "lastActivity": 8626049,
//       "delegateReceivedCount": 0
//     }
//   },
//   {
//     "votingPower": "6847285052909510282000",
//     "address": "0x061BB58c8C726e545618d9D594bb81D38fabe405",
//     "ens": null,
//     "avatar": null,
//     "metrics": {
//       "voteCount": 0,
//       "proposalCount": 0,
//       "firstActivity": 8726507,
//       "lastActivity": 8726507,
//       "delegateReceivedCount": 0
//     }
//   },
//   {
//     "votingPower": "3246549768518249718700",
//     "address": "0x17366cae2b9c6C3055e9e3C78936a69006BE5409",
//     "ens": "cgero.eth",
//     "avatar": null,
//     "metrics": {
//       "voteCount": 0,
//       "proposalCount": 0,
//       "firstActivity": 8576026,
//       "lastActivity": 8576026,
//       "delegateReceivedCount": 0
//     }
//   }
// ]


  // [
  // {
  //   "votingPower": "1660200048694059780833710",
  //   "address": "0x455e3DEFBC6b48D9127CF6acC609F5cEa87cA759",
  //   "ens": "ea1.aragonx.eth",
  //   "avatar": null,
  //   "metrics": {
  //     "voteCount": 0,
  //     "proposalCount": 0,
  //     "firstActivity": 8618799,
  //     "lastActivity": 8618799,
  //     "delegateReceivedCount": 0
  //   }
  // },
  //   {
  //     "votingPower": "22118775243960976996710",
  //     "address": "0xE3217A7790BB9bb60D4712B86E96B5f77AF7a747",
  //     "ens": "ea2.aragonx.eth",
  //     "avatar": null,
  //     "metrics": {
  //       "voteCount": 0,
  //       "proposalCount": 0,
  //       "firstActivity": 8626049,
  //       "lastActivity": 8626049,
  //       "delegateReceivedCount": 0
  //     }
  //   },
  //   {
  //     "votingPower": "6847509920634377986000",
  //     "address": "0x061BB58c8C726e545618d9D594bb81D38fabe405",
  //     "ens": null,
  //     "avatar": null,
  //     "metrics": {
  //       "voteCount": 0,
  //       "proposalCount": 0,
  //       "firstActivity": 8726507,
  //       "lastActivity": 8726507,
  //       "delegateReceivedCount": 0
  //     }
  //   },
  //   {
  //     "votingPower": "3246628472221953415100",
  //     "address": "0x17366cae2b9c6C3055e9e3C78936a69006BE5409",
  //     "ens": "cgero.eth",
  //     "avatar": null,
  //     "metrics": {
  //       "voteCount": 0,
  //       "proposalCount": 0,
  //       "firstActivity": 8576026,
  //       "lastActivity": 8576026,
  //       "delegateReceivedCount": 0
  //     }
  //   }
  // ]
