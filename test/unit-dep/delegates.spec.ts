import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { IEventLogMember, ITransferSide, NetworksEnum } from '@types'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { Models } from '@dbModels'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import { ProxyMember } from '@modules/proxyMember'
import UnitDepUtils from '@test/lib/unit-dep/utils'

describe('Integ: Delegates', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should test moving delegation from an member to another', async function () {
    this.timeout(1600000) // Increase timeout for the test
    const network = NetworksEnum.ethereumSepolia
    const daoAddress = '0x93368A3b5CFf6EbDa9306C0A6238A2c618fEdc8b'
    const tokenAddress = '0xA72a261d67d065e5722C39D1F9CfB7e7aCbffd8B'
    const pluginAddress = '0xb63B12FF0E70a30E2D3386bd491Aaf2dB4a769e6'
    const member1 = '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31'
    const member2 = '0xeF32DC2B02bFA082F11aa6f57154f4079FFE9Bbc'
    const member3 = '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5'

    await Models.Plugin.create({
      id: 'ethereum-sepolia-0x09d09ce070dc07a6793becb16b48f2ea8ad928a78cb2cf7fab10df2b1a320526-0xb63B12FF0E70a30E2D3386bd491Aaf2dB4a769e6',
      transactionHash: '0x09d09ce070dc07a6793becb16b48f2ea8ad928a78cb2cf7fab10df2b1a320526',
      blockNumber: 7802904,
      blockTimestamp: 1740737700,
      network,
      address: pluginAddress,
      implementationAddress: '0x0749047B49B472a7f80C1c8f0a4dbBcecBc54339',
      interfaceType: 'tokenVoting',
      status: 'installed',
      isSupported: true,
      daoAddress,
      tokenAddress,
      pluginSetupRepoAddress: '0x424F4cA6FA9c24C03f2396DF0E96057eD11CF7dF',
      sender: '0x7a62da7B56fB3bfCdF70E900787010Bc4c9Ca42e',
      release: '1',
      build: '2',
      subdomain: 'token-voting',
      permissions: [],
      uninstalled: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
      isProcess: true,
      isBody: true,
      isSubPlugin: false,
      metadataIpfs: null,
      name: null,
      description: null,
      processKey: null,
      subPlugins: [],
      links: [],
    })

    // contract deployed
    const tx1 = await UnitDepUtils.getData(
      GovernanceERC20.abi,
      IEventLogMember.DelegateVotesChanged,
      '0x09d09ce070dc07a6793becb16b48f2ea8ad928a78cb2cf7fab10df2b1a320526',
      network,
    )

    for (const { event, logInfo } of tx1) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // test member created
    expect(await Models.Member.findByAddress(member1)).to.exist

    // test member1 have a transaction, balance and correct metrics
    let member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    let member1Balance = await Models.VpMember.findOne({ memberAddress: member1, tokenAddress })

    expect(member1Txs).to.have.length(1)
    expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member1Txs[0].from).to.eq(utils.zeroAddress)
    // expect(member1Txs[0].to).to.eq(member1)
    expect(member1Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member1Balance.votingPower).to.eq('1000000000000000000')
    expect(member1Balance.delegateReceivedCount).to.eq(1)

    // Update delegation metrics
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member1,
      tokenAddress,
      network,
    })

    console.log('end tx1')

    // member 1 delegate to member 2
    const tx2 = await UnitDepUtils.getData(
      GovernanceERC20.abi,
      IEventLogMember.DelegateVotesChanged,
      '0x633784b253c0b57bf673ce5f54e181ced04db805a117fe99015184cf55c1762e',
      network,
    )

    for (const { event, logInfo } of tx2) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // test member created
    expect(await Models.Member.findByAddress(member2)).to.exist

    // Update delegation metrics first
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member1,
      tokenAddress,
      network,
    })
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member2,
      tokenAddress,
      network,
    })

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.VpMember.findOne({ memberAddress: member1, tokenAddress })

    expect(member1Txs).to.have.length(2)
    expect(member1Txs[0].side).to.eq(ITransferSide.outgoing)
    // expect(member1Txs[0].from).to.eq(member1)
    // expect(member1Txs[0].to).to.eq(member2)
    expect(member1Txs[0].memberVotingPower).to.eq('0')
    expect(member1Balance.votingPower).to.eq('0')
    // expect(member1Balance.delegateReceivedCount).to.eq(0) // with peter it was 0
    expect(member1Balance.delegateReceivedCount).to.eq(1)

    // test member2 have a transaction, balance and correct metrics
    let member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    let member2Balance = await Models.VpMember.findOne({ memberAddress: member2, tokenAddress })

    expect(member2Txs).to.have.length(1)
    expect(member2Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member2Txs[0].from).to.eq(member1)
    // expect(member2Txs[0].to).to.eq(member2)
    expect(member2Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member2Balance.votingPower).to.eq('1000000000000000000')
    expect(member2Balance.delegateReceivedCount).to.eq(1)

    console.log('end tx2')

    // member1 move delegation from member2 to member3
    const tx3 = await UnitDepUtils.getData(
      GovernanceERC20.abi,
      IEventLogMember.DelegateVotesChanged,
      '0xae2279736a8a881eebddf8852f2e66248dd3d55bc9317c56dab2e214232fcd31',
      network,
    )

    for (const { event, logInfo } of tx3) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // test member created
    expect(await Models.Member.findByAddress(member3)).to.exist

    // Update delegation metrics first
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member1,
      tokenAddress,
      network,
    })
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member2,
      tokenAddress,
      network,
    })
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member3,
      tokenAddress,
      network,
    })

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.VpMember.findOne({ memberAddress: member1, tokenAddress })

    expect(member1Txs).to.have.length(2)
    expect(member1Txs[0].side).to.eq(ITransferSide.outgoing)
    // expect(member1Txs[0].from).to.eq(member1)
    // expect(member1Txs[0].to).to.eq(member2)
    expect(member1Txs[0].memberVotingPower).to.eq('0')
    expect(member1Balance.votingPower).to.eq('0')
    // expect(member1Balance.delegateReceivedCount).to.eq(0) // with peter it was 0 (-1 when outgoing)
    expect(member1Balance.delegateReceivedCount).to.eq(1)

    // test member2 have a transaction, balance and correct metrics
    member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    member2Balance = await Models.VpMember.findOne({ memberAddress: member2, tokenAddress })

    expect(member2Txs).to.have.length(2)
    expect(member2Txs[0].side).to.eq(ITransferSide.outgoing)
    // expect(member2Txs[0].from).to.eq(member2)
    // expect(member2Txs[0].to).to.eq(member3)
    expect(member2Txs[0].memberVotingPower).to.eq('0')
    expect(member2Balance.votingPower).to.eq('0')
    expect(member2Balance.delegateReceivedCount).to.eq(1)
    // expect(member2Balance.delegateReceivedCount).to.eq(0) // with peter it was 0 (-1 when outgoing)

    // test member3 have a transaction, balance and correct metrics
    let member3Txs = await Models.MemberTransaction.find({ address: member3 }).sort({ createdAt: -1 })
    let member3Balance = await Models.VpMember.findOne({ memberAddress: member3, tokenAddress })

    expect(member3Txs).to.have.length(1)
    expect(member3Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member3Txs[0].from).to.eq(member2)
    // expect(member3Txs[0].to).to.eq(member3)
    expect(member3Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member3Balance.votingPower).to.eq('1000000000000000000')
    expect(member3Balance.delegateReceivedCount).to.eq(1)

    console.log('end tx3')

    // member 1 move delegation from member 3 to him self
    const tx4 = await UnitDepUtils.getData(
      GovernanceERC20.abi,
      IEventLogMember.DelegateVotesChanged,
      '0x839ac0af396be4c3ba0129841a56c30cdf3527e237db806bab9a74639192676b',
      network,
    )

    for (const { event, logInfo } of tx4) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // Update delegation metrics first
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member1,
      tokenAddress,
      network,
    })
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member3,
      tokenAddress,
      network,
    })

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.VpMember.findOne({ memberAddress: member1, tokenAddress })

    expect(member1Txs).to.have.length(3)
    expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member1Txs[0].from).to.eq(member3)
    // expect(member1Txs[0].to).to.eq(member1)
    expect(member1Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member1Balance.votingPower).to.eq('1000000000000000000')
    // expect(member1Balance.delegateReceivedCount).to.eq(1) // with peter it was 1 (-1 when outgoing)
    expect(member1Balance.delegateReceivedCount).to.eq(2)

    // test member3 have a transaction, balance and correct metrics
    member3Txs = await Models.MemberTransaction.find({ address: member3 }).sort({ createdAt: -1 })
    member3Balance = await Models.VpMember.findOne({ memberAddress: member3, tokenAddress })

    expect(member3Txs).to.have.length(2)
    expect(member3Txs[0].side).to.eq(ITransferSide.outgoing)
    // expect(member3Txs[0].from).to.eq(member3)
    // expect(member3Txs[0].to).to.eq(member1)
    expect(member3Txs[0].memberVotingPower).to.eq('0')
    expect(member3Balance.votingPower).to.eq('0')
    // expect(member3Balance.delegateReceivedCount).to.eq(0) // 0 with peter (-1 when outgoing)
    expect(member3Balance.delegateReceivedCount).to.eq(1)

    console.log('end tx4')
  })

  it('should test delegates', async function () {
    this.timeout(1600000) // Increase timeout for the test
    const network = NetworksEnum.ethereumSepolia
    const daoAddress = '0x3e5fba52959d12f41266028f3a3d7ecc7462dd81'
    const tokenAddress = '0xa936c7F3913941e64CAdF88d61c3a8846C8Ef426'
    const pluginAddress = '0x5a0C67d574F6155bfe500a746AbEAE14C5b0a674'
    const member1 = '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31'
    const member2 = '0xeF32DC2B02bFA082F11aa6f57154f4079FFE9Bbc'
    const member3 = '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5'
    const member4 = '0x009b2D4661bE94d312f72F7A90925d2122B66437'
    const member5 = '0xfd322fb61FEBFa9Ac2a4588Cbe598b4021888519'

    // create plugin
    await Models.Plugin.create({
      transactionHash: '0x7ff387b7d8888eda314289be41a475acbf9a6ca0d163175332859b75d54549f2',
      blockNumber: 7637365,
      blockTimestamp: 1738662396,
      network,
      address: pluginAddress,
      implementationAddress: '0x0749047B49B472a7f80C1c8f0a4dbBcecBc54339',
      interfaceType: 'tokenVoting',
      status: 'installed',
      isSupported: true,
      daoAddress,
      tokenAddress,
      pluginSetupRepoAddress: '0x424F4cA6FA9c24C03f2396DF0E96057eD11CF7dF',
      sender: '0x7a62da7B56fB3bfCdF70E900787010Bc4c9Ca42e',
      release: '1',
      build: '2',
      subdomain: 'token-voting',
      permissions: [],
      uninstalled: {
        status: false,
        transactionHash: null,
        blockNumber: null,
        blockTimestamp: null,
      },
      isProcess: true,
      isBody: true,
      isSubPlugin: false,
      metadataIpfs: null,
      name: null,
      description: null,
      processKey: null,
      subPlugins: [],
      links: [],
    })

    // contract deployed
    const tx1 = await UnitDepUtils.getData(
      GovernanceERC20.abi,
      IEventLogMember.DelegateVotesChanged,
      '0x7ff387b7d8888eda314289be41a475acbf9a6ca0d163175332859b75d54549f2',
      network,
    )

    for (const { event, logInfo } of tx1) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    expect(await Models.Member.findByAddress(member1)).to.exist
    expect(await Models.Member.findByAddress(member2)).to.exist
    expect(await Models.Member.findByAddress(member3)).to.exist
    expect(await Models.Member.findByAddress(member4)).to.exist
    expect(await Models.Member.findByAddress(member5)).to.exist

    // test member1 have a transaction, balance and correct metrics
    let member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    let member1Balance = await Models.VpMember.findOne({ memberAddress: member1, tokenAddress })

    expect(member1Txs).to.have.length(1)
    expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member1Txs[0].from).to.eq(utils.zeroAddress)
    // expect(member1Txs[0].to).to.eq(member1)
    expect(member1Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member1Balance.votingPower).to.eq('1000000000000000000')
    expect(member1Balance.delegateReceivedCount).to.eq(1)

    // test member2 have a transaction, balance and correct metrics
    let member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    let member2Balance = await Models.VpMember.findOne({ memberAddress: member2, tokenAddress })

    expect(member2Txs).to.have.length(1)
    expect(member2Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member2Txs[0].from).to.eq(utils.zeroAddress)
    // expect(member2Txs[0].to).to.eq(member2)
    expect(member2Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member2Balance.votingPower).to.eq('1000000000000000000')
    expect(member2Balance.delegateReceivedCount).to.eq(1)

    // test member3 have a transaction, balance and correct metrics
    let member3Txs = await Models.MemberTransaction.find({ address: member3 }).sort({ createdAt: -1 })
    let member3Balance = await Models.VpMember.findOne({ memberAddress: member3, tokenAddress })
    let member3Metrics = await Models.PluginMetrics.findOne({ memberAddress: member3, pluginAddress })

    expect(member3Txs).to.have.length(1)
    expect(member3Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member3Txs[0].from).to.eq(utils.zeroAddress)
    // expect(member3Txs[0].to).to.eq(member3)
    expect(member3Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member3Balance.votingPower).to.eq('1000000000000000000')
    expect(member3Balance.delegateReceivedCount).to.eq(1)

    // test member4 have a transaction, balance and correct metrics
    let member4Txs = await Models.MemberTransaction.find({ address: member4 }).sort({ createdAt: -1 })
    let member4Balance = await Models.VpMember.findOne({ memberAddress: member4, tokenAddress })
    let member4Metrics = await Models.PluginMetrics.findOne({ memberAddress: member4, pluginAddress })

    expect(member4Txs).to.have.length(1)
    expect(member4Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member4Txs[0].from).to.eq(utils.zeroAddress)
    // expect(member4Txs[0].to).to.eq(member4)
    expect(member4Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member4Balance.votingPower).to.eq('1000000000000000000')
    expect(member4Balance.delegateReceivedCount).to.eq(1)

    // test member5 have a transaction, balance and correct metrics
    let member5Txs = await Models.MemberTransaction.find({ address: member5 }).sort({ createdAt: -1 })
    let member5Balance = await Models.VpMember.findOne({ memberAddress: member5, tokenAddress })
    let member5Metrics = await Models.PluginMetrics.findOne({ memberAddress: member5, pluginAddress })

    expect(member5Txs).to.have.length(1)
    expect(member5Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member5Txs[0].from).to.eq(utils.zeroAddress)
    // expect(member5Txs[0].to).to.eq(member5)
    expect(member5Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member5Balance.votingPower).to.eq('1000000000000000000')
    expect(member5Balance.delegateReceivedCount).to.eq(1)

    console.log('end tx1')

    // member1 receive delegation from member2
    const tx2 = await UnitDepUtils.getData(
      GovernanceERC20.abi,
      IEventLogMember.DelegateVotesChanged,
      '0x9ecf9ba7aa3838893d5f57216e38dcfd74fcd76b8fc4755f5f29ba390e38cd25',
      network,
    )

    for (const { event, logInfo } of tx2) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // Update delegation metrics first
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member1,
      tokenAddress,
      network,
    })
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member2,
      tokenAddress,
      network,
    })

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.VpMember.findOne({ memberAddress: member1, tokenAddress })

    expect(member1Txs).to.have.length(2)
    expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member1Txs[0].from).to.eq(member2)
    // expect(member1Txs[0].to).to.eq(member1)
    expect(member1Txs[0].memberVotingPower).to.eq('2000000000000000000')
    expect(member1Balance.votingPower).to.eq('2000000000000000000')
    expect(member1Balance.delegateReceivedCount).to.eq(2)

    // test member1 have a transaction, balance and correct metrics
    member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    member2Balance = await Models.VpMember.findOne({ memberAddress: member2, tokenAddress })

    expect(member2Txs).to.have.length(2)
    expect(member2Txs[0].side).to.eq(ITransferSide.outgoing)
    // expect(member2Txs[0].from).to.eq(member2)
    // expect(member2Txs[0].to).to.eq(member1)
    expect(member2Txs[0].memberVotingPower).to.eq('0')
    expect(member2Balance.votingPower).to.eq('0')
    // expect(member2Balance.delegateReceivedCount).to.eq(0) // with peter it was 0 (-1 when outgoing)
    expect(member2Balance.delegateReceivedCount).to.eq(1)

    console.log('end tx2')

    // member1 receive delegation from member3
    const tx3 = await UnitDepUtils.getData(
      GovernanceERC20.abi,
      IEventLogMember.DelegateVotesChanged,
      '0x1127fa7b1df29f6dbcbdd5d385f8c0eda48e73ad2ed808d1eb5dffb053053a76',
      network,
    )

    for (const { event, logInfo } of tx3) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // Update delegation metrics first
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member1,
      tokenAddress,
      network,
    })
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member3,
      tokenAddress,
      network,
    })

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.VpMember.findOne({ memberAddress: member1, tokenAddress })

    expect(member1Txs).to.have.length(3)
    expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member1Txs[0].from).to.eq(member3)
    // expect(member1Txs[0].to).to.eq(member1)
    expect(member1Txs[0].memberVotingPower).to.eq('3000000000000000000')
    expect(member1Balance.votingPower).to.eq('3000000000000000000')
    expect(member1Balance.delegateReceivedCount).to.eq(3)

    // test member3 have a transaction, balance and correct metrics
    member3Txs = await Models.MemberTransaction.find({ address: member3 }).sort({ createdAt: -1 })
    member3Balance = await Models.VpMember.findOne({ memberAddress: member3, tokenAddress })

    expect(member3Txs).to.have.length(2)
    expect(member3Txs[0].side).to.eq(ITransferSide.outgoing)
    // expect(member3Txs[0].from).to.eq(member3)
    // expect(member3Txs[0].to).to.eq(member1)
    expect(member3Txs[0].memberVotingPower).to.eq('0')
    expect(member3Balance.votingPower).to.eq('0')
    expect(member3Balance.delegateReceivedCount).to.eq(1)
    // expect(member2Balance.delegateReceivedCount).to.eq(0) // with peter it was 0 (-1 when outgoing)

    console.log('end tx3')

    // member1 receive delegation from member4
    const tx4 = await UnitDepUtils.getData(
      GovernanceERC20.abi,
      IEventLogMember.DelegateVotesChanged,
      '0xf703823a43620c92eedf5100c8f0e47d1a1e960c4c3d14abf8353aab7b5d443d',
      network,
    )

    for (const { event, logInfo } of tx4) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // Update delegation metrics first
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member1,
      tokenAddress,
      network,
    })
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member4,
      tokenAddress,
      network,
    })

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.VpMember.findOne({ memberAddress: member1, tokenAddress })

    expect(member1Txs).to.have.length(4)
    expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member1Txs[0].from).to.eq(member4)
    // expect(member1Txs[0].to).to.eq(member1)
    expect(member1Txs[0].memberVotingPower).to.eq('4000000000000000000')
    expect(member1Balance.votingPower).to.eq('4000000000000000000')
    expect(member1Balance.delegateReceivedCount).to.eq(4)

    // test member4 have a transaction, balance and correct metrics
    member4Txs = await Models.MemberTransaction.find({ address: member4 }).sort({ createdAt: -1 })
    member4Balance = await Models.VpMember.findOne({ memberAddress: member4, tokenAddress })

    expect(member4Txs).to.have.length(2)
    expect(member4Txs[0].side).to.eq(ITransferSide.outgoing)
    // expect(member4Txs[0].from).to.eq(member4)
    // expect(member4Txs[0].to).to.eq(member1)
    expect(member4Txs[0].memberVotingPower).to.eq('0')
    expect(member4Balance.votingPower).to.eq('0')
    expect(member4Balance.delegateReceivedCount).to.eq(1)
    // expect(member4Balance.delegateReceivedCount).to.eq(0) // with peter it was 0 (-1 when outgoing)

    console.log('end tx4')

    // member1 delegate to member2
    const tx5 = await UnitDepUtils.getData(
      GovernanceERC20.abi,
      IEventLogMember.DelegateVotesChanged,
      '0x4ac08441f32f2b13dd5b3897cc1ae13bd6164e6b79699511f5923b00d801419c',
      network,
    )

    for (const { event, logInfo } of tx5) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // Update delegation metrics first
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member1,
      tokenAddress,
      network,
    })
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member2,
      tokenAddress,
      network,
    })

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.VpMember.findOne({ memberAddress: member1, tokenAddress })

    expect(member1Txs).to.have.length(5)
    expect(member1Txs[0].side).to.eq(ITransferSide.outgoing)
    // expect(member1Txs[0].from).to.eq(member1)
    // expect(member1Txs[0].to).to.eq(member2)
    expect(member1Txs[0].memberVotingPower).to.eq('3000000000000000000')
    expect(member1Balance.votingPower).to.eq('3000000000000000000')
    // expect(member1Balance.delegateReceivedCount).to.eq(3) // 3 with peter
    expect(member1Balance.delegateReceivedCount).to.eq(4)

    // test member2 have a transaction, balance and correct metrics
    member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    member2Balance = await Models.VpMember.findOne({ memberAddress: member2, tokenAddress })

    expect(member2Txs).to.have.length(3)
    expect(member2Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member2Txs[0].from).to.eq(member1)
    // expect(member2Txs[0].to).to.eq(member2)
    expect(member2Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member2Balance.votingPower).to.eq('1000000000000000000')
    // expect(member2Balance.delegateReceivedCount).to.eq(1) // 1 with peter
    expect(member2Balance.delegateReceivedCount).to.eq(2)

    console.log('end tx5')

    // member2 move delegation from member1 to himself
    const tx6 = await UnitDepUtils.getData(
      GovernanceERC20.abi,
      IEventLogMember.DelegateVotesChanged,
      '0x2744c5a3f65084d54bd8a972a3743925b1dea2565ee1e9002061ef653ffd7e50',
      network,
    )

    for (const { event, logInfo } of tx6) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // Update delegation metrics first
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member1,
      tokenAddress,
      network,
    })
    await ProxyMember.updateDelegationMetrics({
      memberAddress: member2,
      tokenAddress,
      network,
    })

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.VpMember.findOne({ memberAddress: member1, tokenAddress })

    expect(member1Txs).to.have.length(6)
    expect(member1Txs[0].side).to.eq(ITransferSide.outgoing)
    // expect(member1Txs[0].from).to.eq(member1)
    // expect(member1Txs[0].to).to.eq(member2)
    expect(member1Txs[0].memberVotingPower).to.eq('2000000000000000000')
    expect(member1Balance.votingPower).to.eq('2000000000000000000')
    // expect(member1Balance.delegateReceivedCount).to.eq(2) // 2 with peter
    expect(member1Balance.delegateReceivedCount).to.eq(4)

    // test member2 have a transaction, balance and correct metrics
    member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    member2Balance = await Models.VpMember.findOne({ memberAddress: member2, tokenAddress })

    expect(member2Txs).to.have.length(4)
    expect(member2Txs[0].side).to.eq(ITransferSide.incoming)
    // expect(member2Txs[0].from).to.eq(member1)
    // expect(member2Txs[0].to).to.eq(member2)
    expect(member2Txs[0].memberVotingPower).to.eq('2000000000000000000')
    expect(member2Balance.votingPower).to.eq('2000000000000000000')
    // expect(member2Balance.delegateReceivedCount).to.eq(2) // 2 with peter
    expect(member2Balance.delegateReceivedCount).to.eq(3)

    console.log('end tx6')

    console.log('end')
  })
})
