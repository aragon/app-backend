import VeLockIntMockTestData from '@test/unit-dep/mockData/veLockIntTestMock.json'
import sinon from 'sinon'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { NetworksEnum } from '@types'
import logger from '@logger'
import configIndexer from '@indexer/configIndexer'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { expect } from 'chai'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import MemberController from '@api/controllers/member'

describe.skip('GovernanceVeLock: Integration Test', () => {
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

  it('should handle veLock deposit, exitque, and withdraw events', async () => {
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

  it('should handle veLock all events properly', async function () {
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

    const members = await MemberController.getMembersOfVeLockPlugin(
      { page: 1, limit: 100, sort: 'votingPower', order: 'desc' },
      veLockPlugin,
    )

    expect(members).to.be.exist
    expect(members.data).to.be.an('array')
    expect(members.data.length).to.be.gt(0)

    const sortedMembers = members.data.sort((a: any, b: any) => parseFloat(b.votingPower) - parseFloat(a.votingPower))
    expect(members.data).to.deep.equal(sortedMembers)
  })
})
