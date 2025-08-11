import { Interface } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import { IEventLogMember, ITransferSide, NetworksEnum } from '@types'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import Web3Helper from '@helpers/web3'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { Models } from '@dbModels'
import { expect } from 'chai'
import Web3Utils from '@helpers/web3Utils'

const getData = async (txHash: string, network: NetworksEnum): Promise<{ event: any; logInfo: any }[]> => {
  const txReceipt = await Web3Helper.getTransactionReceipt(txHash, network)

  const delegationVotesChangedLogs = Web3Utils.findLogsByName(
    txReceipt!,
    IEventLogMember.DelegateVotesChanged,
    GovernanceERC20.abi,
  )

  const data: any = []
  for (const log of delegationVotesChangedLogs) {
    const logInfo = Web3Utils.parseInfoLog(log.txLog, 'DelegateVotesChanged', network)
    const iFace = new Interface(GovernanceERC20.abi)
    const event = Web3Utils.parseLog(log.txLog, iFace)!
    data.push({ event, logInfo })
  }

  return data
}

describe('Manual: Delegate', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('test delegation flow', async function () {
    this.timeout(1600000) // Increase timeout for the test

    await ProviderModule.connectToAllNetworks()

    const network = NetworksEnum.ethereumSepolia
    const daoAddress = '0x3e5fba52959d12f41266028f3a3d7ecc7462dd81'
    const tokenAddress = '0xa936c7F3913941e64CAdF88d61c3a8846C8Ef426'
    const member1 = '0x42c9A3f034592C39028AEa70A6e69Fbc6cCf6C31' // init balance 1000000000000000000
    const member2 = '0xeF32DC2B02bFA082F11aa6f57154f4079FFE9Bbc' // init balance 1000000000000000000
    const member3 = '0x65D9d3887aa9a9ee78901E96819B574160E4EAC5' // init balance 1000000000000000000
    const member4 = '0x009b2D4661bE94d312f72F7A90925d2122B66437' // init balance 1000000000000000000

    // create plugin
    await Models.Plugin.create({
      transactionHash: '0x7ff387b7d8888eda314289be41a475acbf9a6ca0d163175332859b75d54549f2',
      blockNumber: 7637365,
      blockTimestamp: 1738662396,
      network,
      address: '0x5a0C67d574F6155bfe500a746AbEAE14C5b0a674',
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

    // member2 delegate to member1 1 token
    // member1 prev balance 1000000000000000000 new balance 2000000000000000000
    // member2 prev balance 1000000000000000000 new balance 0
    const tx1 = await getData('0x9ecf9ba7aa3838893d5f57216e38dcfd74fcd76b8fc4755f5f29ba390e38cd25', network)

    for (const { event, logInfo } of tx1) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // test member created
    expect(await Models.Member.findByAddress(member1)).to.exist
    expect(await Models.Member.findByAddress(member2)).to.exist

    // test member1 have a transaction, balance and correct metrics
    let member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    let member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    let member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(1)
    expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member1Txs[0].from).to.eq(member2)
    expect(member1Txs[0].to).to.eq(member1)
    expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member1Txs[0].memberVotingPower).to.eq('2000000000000000000')
    expect(member1Balance.votingPower).to.eq('2000000000000000000')
    expect(member1Balance.amount).to.eq('0')
    expect(member1Metrics.delegateReceivedCount).to.eq(1)

    // test member2 have a transaction, balance and correct metrics
    let member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    let member2Balance = await Models.MemberBalance.findOne({ address: member2 })
    let member2Metrics = await Models.MemberMetrics.findOne({ address: member2 })

    expect(member2Txs).to.have.length(1)
    expect(member2Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member2Txs[0].from).to.eq(member2)
    expect(member2Txs[0].to).to.eq(member1)
    expect(member2Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member2Txs[0].memberVotingPower).to.eq('0')
    expect(member2Balance.votingPower).to.eq('0')
    expect(member2Balance.amount).to.eq('0')
    expect(member2Metrics.delegateReceivedCount).to.eq(0)

    console.log('end tx1')

    // member3 delegate to member1 1 token
    // member1 prev balance 2000000000000000000 new balance 3000000000000000000
    // member3 prev balance 1000000000000000000 new balance 0
    const tx2 = await getData('0x1127fa7b1df29f6dbcbdd5d385f8c0eda48e73ad2ed808d1eb5dffb053053a76', network)

    for (const { event, logInfo } of tx2) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // test member created
    expect(await Models.Member.findByAddress(member3)).to.exist

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.TokenMember.findOne({ address: member1 })
    member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(2)
    expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member1Txs[0].from).to.eq(member3)
    expect(member1Txs[0].to).to.eq(member1)
    expect(member1Txs[0].memberVotingPower).to.eq('3000000000000000000')
    expect(member1Balance.votingPower).to.eq('3000000000000000000')
    expect(member1Balance.amount).to.eq('0')
    expect(member1Metrics.delegateReceivedCount).to.eq(2)

    // test member3 have a transaction, balance and correct metrics
    let member3Txs = await Models.MemberTransaction.find({ address: member3 }).sort({ createdAt: -1 })
    let member3Balance = await Models.MemberBalance.findOne({ address: member3 })
    let member3Metrics = await Models.MemberMetrics.findOne({ address: member3 })

    expect(member3Txs).to.have.length(1)
    expect(member3Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member3Txs[0].from).to.eq(member3)
    expect(member3Txs[0].to).to.eq(member1)
    expect(member3Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member3Txs[0].memberVotingPower).to.eq('0')
    expect(member3Balance.votingPower).to.eq('0')
    expect(member3Balance.amount).to.eq('0')
    expect(member3Metrics.delegateReceivedCount).to.eq(0)

    console.log('end tx2')

    // member4 delegate to member1 1 token
    // member1 prev balance 3000000000000000000 new balance 4000000000000000000
    // member4 prev balance 1000000000000000000 new balance 0
    const tx3 = await getData('0xf703823a43620c92eedf5100c8f0e47d1a1e960c4c3d14abf8353aab7b5d443d', network)

    for (const { event, logInfo } of tx3) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // test member created
    expect(await Models.Member.findByAddress(member4)).to.exist

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(3)
    expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member1Txs[0].from).to.eq(member4)
    expect(member1Txs[0].to).to.eq(member1)
    expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member1Txs[0].memberVotingPower).to.eq('4000000000000000000')
    expect(member1Balance.votingPower).to.eq('4000000000000000000')
    expect(member1Balance.amount).to.eq('0')
    expect(member1Metrics.delegateReceivedCount).to.eq(3)

    // test member4 have a transaction, balance and correct metrics
    let member4Txs = await Models.MemberTransaction.find({ address: member4 }).sort({ createdAt: -1 })
    let member4Balance = await Models.MemberBalance.findOne({ address: member4 })
    let member4Metrics = await Models.MemberMetrics.findOne({ address: member4 })

    expect(member4Txs).to.have.length(1)
    expect(member4Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member4Txs[0].from).to.eq(member4)
    expect(member4Txs[0].to).to.eq(member1)
    expect(member4Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member4Txs[0].memberVotingPower).to.eq('0')
    expect(member4Balance.votingPower).to.eq('0')
    expect(member4Balance.amount).to.eq('0')
    expect(member4Metrics.delegateReceivedCount).to.eq(0)

    console.log('end tx3')

    // member1 remove delegation to member2 1 token
    // member1 prev balance 4000000000000000000 new balance 3000000000000000000
    // member2 prev balance 0 new balance 1000000000000000000
    const tx4 = await getData('0x4ac08441f32f2b13dd5b3897cc1ae13bd6164e6b79699511f5923b00d801419c', network)

    for (const { event, logInfo } of tx4) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(4)
    expect(member1Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member1Txs[0].from).to.eq(member1)
    expect(member1Txs[0].to).to.eq(member2)
    expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member1Txs[0].memberVotingPower).to.eq('3000000000000000000')
    expect(member1Balance.votingPower).to.eq('3000000000000000000')
    expect(member1Balance.amount).to.eq('0')
    expect(member1Metrics.delegateReceivedCount).to.eq(3)

    // test member2 have a transaction, balance and correct metrics
    member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    member2Balance = await Models.MemberBalance.findOne({ address: member2 })
    member2Metrics = await Models.MemberMetrics.findOne({ address: member2 })

    expect(member2Txs).to.have.length(2)
    expect(member2Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member2Txs[0].from).to.eq(member1)
    expect(member2Txs[0].to).to.eq(member2)
    expect(member2Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member2Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member2Balance.votingPower).to.eq('1000000000000000000')
    expect(member2Balance.amount).to.eq('0')
    expect(member2Metrics.delegateReceivedCount).to.eq(1)

    console.log('end tx4')

    // member1 delegate to member2
    // member1 prev balance 3000000000000000000 new balance 2000000000000000000
    // member2 prev balance 1000000000000000000 new balance 2000000000000000000
    const tx5 = await getData('0x2744c5a3f65084d54bd8a972a3743925b1dea2565ee1e9002061ef653ffd7e50', network)

    for (const { event, logInfo } of tx5) {
      await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
    }

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(5)
    expect(member1Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member1Txs[0].from).to.eq(member1)
    expect(member1Txs[0].to).to.eq(member2)
    expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member1Txs[0].memberVotingPower).to.eq('2000000000000000000')
    expect(member1Balance.votingPower).to.eq('2000000000000000000')
    expect(member1Balance.amount).to.eq('0')
    expect(member1Metrics.delegateReceivedCount).to.eq(3)

    // test member2 have a transaction, balance and correct metrics
    member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    member2Balance = await Models.MemberBalance.findOne({ address: member2 })
    member2Metrics = await Models.MemberMetrics.findOne({ address: member2 })

    expect(member2Txs).to.have.length(3)
    expect(member2Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member2Txs[0].from).to.eq(member1)
    expect(member2Txs[0].to).to.eq(member2)
    expect(member2Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member2Txs[0].memberVotingPower).to.eq('2000000000000000000')
    expect(member2Balance.votingPower).to.eq('2000000000000000000')
    expect(member2Balance.amount).to.eq('0')
    expect(member2Metrics.delegateReceivedCount).to.eq(2)

    console.log('end tx5')

    console.log('end')
  })

  it('should fetch delegator', async function () {
    this.timeout(1600000) // Increase timeout for the test

    await ProviderModule.connectToAllNetworks()

    await Models.Plugin.create({
      transactionHash: '0x7ff387b7d8888eda314289be41a475acbf9a6ca0d163175332859b75d54549f2',
      blockNumber: 7637365,
      blockTimestamp: 1738662396,
      network: NetworksEnum.ethereumSepolia,
      address: '0x5a0C67d574F6155bfe500a746AbEAE14C5b0a674',
      implementationAddress: '0x0749047B49B472a7f80C1c8f0a4dbBcecBc54339',
      interfaceType: 'tokenVoting',
      status: 'installed',
      isSupported: true,
      daoAddress: '0x3E5FBa52959d12F41266028f3a3d7ecC7462DD81',
      tokenAddress: '0xa936c7F3913941e64CAdF88d61c3a8846C8Ef426',
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

    const txReceipt = await Web3Helper.getTransactionReceipt(
      '0x2744c5a3f65084d54bd8a972a3743925b1dea2565ee1e9002061ef653ffd7e50',
      NetworksEnum.ethereumSepolia,
    )

    const delegationVotesChangedLogs = Web3Utils.findLogsByName(
      txReceipt!,
      IEventLogMember.DelegateVotesChanged,
      GovernanceERC20.abi,
    )

    const logInfo = Web3Utils.parseInfoLog(
      delegationVotesChangedLogs[0].txLog,
      'DelegateVotesChanged',
      NetworksEnum.ethereumSepolia,
    )

    const iFace = new Interface(GovernanceERC20.abi)
    const event = Web3Utils.parseLog(delegationVotesChangedLogs[0].txLog, iFace)!

    await GovernanceErc20Handler.delegateVotesChanged(event, logInfo)
  })
})
