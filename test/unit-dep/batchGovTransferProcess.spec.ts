import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ITransferSide, ITransferType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import utils from '@helpers/utils'
import TransferCrawler from '@services/aragon-transfers/transferCrawler'

/**
 * TODO: In Local the test works and on CI it fails. Needs to be investigated.
 */
describe.skip('Integ: Batch Transfer Processor', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should test moving delegation from an member to another using batch processor', async function () {
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

    await Models.Token.create({
      id: `${tokenAddress}-${network}`,
      network,
      address: tokenAddress,
      name: 'Test Token',
      symbol: 'TEST',
      decimals: 18,
      type: 'ERC20',
      isGovernance: true,
    })

    // contract deployed
    const tx1Logs = await UnitDepUtils.getTokenLogsFromReceipt(
      '0x09d09ce070dc07a6793becb16b48f2ea8ad928a78cb2cf7fab10df2b1a320526',
      network,
    )

    await TransferCrawler.parseAndProcessTransferLogs(tx1Logs, network)

    expect(await Models.Member.findByAddress(member1)).to.exist

    let member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1, logIndex: -1 })
    let member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    let member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(2)
    const transferTx = member1Txs.find(tx => tx.type === ITransferType.tokenTransfer)
    const delegateTx = member1Txs.find(tx => tx.type === ITransferType.delegate)

    expect(transferTx.side).to.eq(ITransferSide.incoming)
    expect(transferTx.from).to.eq(utils.zeroAddress)
    expect(transferTx.to).to.eq(member1)
    expect(transferTx.memberBalance).to.eq('1000000000000000000')
    expect(transferTx.memberVotingPower).to.eq('0')

    expect(delegateTx.side).to.eq(ITransferSide.incoming)
    expect(delegateTx.from).to.eq(utils.zeroAddress)
    expect(delegateTx.to).to.eq(member1)
    expect(delegateTx.memberVotingPower).to.eq('1000000000000000000')

    expect(member1Balance.votingPower).to.eq('1000000000000000000')
    expect(member1Balance.amount).to.eq('1000000000000000000')

    expect(member1Metrics.delegateReceivedCount).to.eq(1)

    console.log('end tx1')

    // member 1 delegate to member 2
    const tx2Logs = await UnitDepUtils.getTokenLogsFromReceipt(
      '0x633784b253c0b57bf673ce5f54e181ced04db805a117fe99015184cf55c1762e',
      network,
    )

    await TransferCrawler.parseAndProcessTransferLogs(tx2Logs, network)

    // test member created
    expect(await Models.Member.findByAddress(member2)).to.exist

    // test member1 have 2 transaction,first transfer delegation received and second delegate
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1, logIndex: -1 })
    member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(3)
    expect(member1Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member1Txs[0].from).to.eq(member1)
    expect(member1Txs[0].to).to.eq(member2)
    expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member1Txs[0].memberVotingPower).to.eq('0')
    expect(member1Balance.votingPower).to.eq('0')
    expect(member1Balance.amount).to.eq('1000000000000000000')
    expect(member1Metrics.delegateReceivedCount).to.eq(0)

    // test member2 have a transaction, balance and correct metrics
    let member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    let member2Balance = await Models.MemberBalance.findOne({ address: member2 })
    let member2Metrics = await Models.MemberMetrics.findOne({ address: member2 })

    expect(member2Txs).to.have.length(1)
    expect(member2Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member2Txs[0].from).to.eq(member1)
    expect(member2Txs[0].to).to.eq(member2)
    expect(member2Txs[0].memberBalance).to.eq('0')
    expect(member2Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member2Balance.votingPower).to.eq('1000000000000000000')
    expect(member2Balance.amount).to.eq('0')
    expect(member2Metrics.delegateReceivedCount).to.eq(1)

    console.log('end tx2')

    // member1 move delegation from member2 to member3
    const tx3Logs = await UnitDepUtils.getTokenLogsFromReceipt(
      '0xae2279736a8a881eebddf8852f2e66248dd3d55bc9317c56dab2e214232fcd31',
      network,
    )

    await TransferCrawler.parseAndProcessTransferLogs(tx3Logs, network)

    // test member created
    expect(await Models.Member.findByAddress(member3)).to.exist

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(3)
    expect(member1Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member1Txs[0].from).to.eq(member1)
    expect(member1Txs[0].to).to.eq(member2)
    expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member1Txs[0].memberVotingPower).to.eq('0')
    expect(member1Balance.votingPower).to.eq('0')
    expect(member1Balance.amount).to.eq('1000000000000000000') //he has only delegated not transferred the token
    expect(member1Metrics.delegateReceivedCount).to.eq(0)

    // test member2 have a transaction, balance and correct metrics
    member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    member2Balance = await Models.MemberBalance.findOne({ address: member2 })
    member2Metrics = await Models.MemberMetrics.findOne({ address: member2 })

    expect(member2Txs).to.have.length(2)
    expect(member2Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member2Txs[0].from).to.eq(member2)
    expect(member2Txs[0].to).to.eq(member3)
    expect(member2Txs[0].memberBalance).to.eq('0')
    expect(member2Txs[0].memberVotingPower).to.eq('0')
    expect(member2Balance.votingPower).to.eq('0')
    expect(member2Balance.amount).to.eq('0')
    expect(member2Metrics.delegateReceivedCount).to.eq(0)

    // test member3 have a transaction, balance and correct metrics
    let member3Txs = await Models.MemberTransaction.find({ address: member3 }).sort({ createdAt: -1 })
    let member3Balance = await Models.MemberBalance.findOne({ address: member3 })
    let member3Metrics = await Models.MemberMetrics.findOne({ address: member3 })

    expect(member3Txs).to.have.length(1)
    expect(member3Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member3Txs[0].from).to.eq(member2)
    expect(member3Txs[0].to).to.eq(member3)
    expect(member3Txs[0].memberBalance).to.eq('0')
    expect(member3Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member3Balance.votingPower).to.eq('1000000000000000000')
    expect(member3Balance.amount).to.eq('0')
    expect(member3Metrics.delegateReceivedCount).to.eq(1)

    // member 1 move delegation from member 3 to him self
    const tx4Logs = await UnitDepUtils.getTokenLogsFromReceipt(
      '0x839ac0af396be4c3ba0129841a56c30cdf3527e237db806bab9a74639192676b',
      network,
    )

    await TransferCrawler.parseAndProcessTransferLogs(tx4Logs, network)

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(4)
    expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member1Txs[0].from).to.eq(member3)
    expect(member1Txs[0].to).to.eq(member1)
    expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member1Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member1Balance.votingPower).to.eq('1000000000000000000')
    expect(member1Balance.amount).to.eq('1000000000000000000')
    expect(member1Metrics.delegateReceivedCount).to.eq(1)

    // test member3 have a transaction, balance and correct metrics
    member3Txs = await Models.MemberTransaction.find({ address: member3 }).sort({ createdAt: -1 })
    member3Balance = await Models.MemberBalance.findOne({ address: member3 })
    member3Metrics = await Models.MemberMetrics.findOne({ address: member3 })

    expect(member3Txs).to.have.length(2)
    expect(member3Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member3Txs[0].from).to.eq(member3)
    expect(member3Txs[0].to).to.eq(member1)
    expect(member3Txs[0].memberBalance).to.eq('0')
    expect(member3Txs[0].memberVotingPower).to.eq('0')
    expect(member3Balance.votingPower).to.eq('0')
    expect(member3Balance.amount).to.eq('0')
    expect(member3Metrics.delegateReceivedCount).to.eq(0)
  })

  it('should test delegates using batch processor', async function () {
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

    // Create a token record
    await Models.Token.create({
      id: `${tokenAddress}-${network}`,
      network,
      address: tokenAddress,
      name: 'Test Token',
      symbol: 'TEST',
      decimals: 18,
      type: 'ERC20',
      isGovernance: true,
    })

    // contract deployed
    const tx1Logs = await UnitDepUtils.getTokenLogsFromReceipt(
      '0x7ff387b7d8888eda314289be41a475acbf9a6ca0d163175332859b75d54549f2',
      network,
    )

    await TransferCrawler.parseAndProcessTransferLogs(tx1Logs, network)

    expect(await Models.Member.findByAddress(member1)).to.exist
    expect(await Models.Member.findByAddress(member2)).to.exist
    expect(await Models.Member.findByAddress(member3)).to.exist
    expect(await Models.Member.findByAddress(member4)).to.exist
    expect(await Models.Member.findByAddress(member5)).to.exist

    // test member1 have a transaction, balance and correct metrics
    let member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    let member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    let member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(2)

    const transferTx = member1Txs.find(tx => tx.type === ITransferType.tokenTransfer)
    const delegateTx = member1Txs.find(tx => tx.type === ITransferType.delegate)

    expect(transferTx.side).to.eq(ITransferSide.incoming)
    expect(transferTx.from).to.eq(utils.zeroAddress)
    expect(transferTx.to).to.eq(member1)
    expect(transferTx.memberBalance).to.eq('1000000000000000000')
    expect(transferTx.memberVotingPower).to.eq('0')

    expect(delegateTx.side).to.eq(ITransferSide.incoming)
    expect(delegateTx.from).to.eq(utils.zeroAddress)
    expect(delegateTx.to).to.eq(member1)
    expect(delegateTx.memberBalance).to.eq('1000000000000000000')
    expect(delegateTx.memberVotingPower).to.eq('1000000000000000000')

    expect(member1Balance.votingPower).to.eq('1000000000000000000')
    expect(member1Balance.amount).to.eq('1000000000000000000')
    expect(member1Metrics.delegateReceivedCount).to.eq(1)

    // test member2 have a transaction, balance and correct metrics
    let member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    let member2Balance = await Models.MemberBalance.findOne({ address: member2 })
    let member2Metrics = await Models.MemberMetrics.findOne({ address: member2 })

    expect(member2Txs).to.have.length(2) //transfer and delegate received
    expect(member2Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member2Txs[0].from).to.eq(utils.zeroAddress)
    expect(member2Txs[0].to).to.eq(member2)
    expect(member2Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member2Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member2Balance.votingPower).to.eq('1000000000000000000')
    expect(member2Balance.amount).to.eq('1000000000000000000')
    expect(member2Metrics.delegateReceivedCount).to.eq(1)

    // test member3 have a transaction, balance and correct metrics
    let member3Txs = await Models.MemberTransaction.find({ address: member3 }).sort({ createdAt: -1 })
    let member3Balance = await Models.MemberBalance.findOne({ address: member3 })
    let member3Metrics = await Models.MemberMetrics.findOne({ address: member3 })

    expect(member3Txs).to.have.length(2)
    expect(member3Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member3Txs[0].from).to.eq(utils.zeroAddress)
    expect(member3Txs[0].to).to.eq(member3)
    expect(member3Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member3Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member3Balance.votingPower).to.eq('1000000000000000000')
    expect(member3Balance.amount).to.eq('1000000000000000000')
    expect(member3Metrics.delegateReceivedCount).to.eq(1)

    // test member4 have a transaction, balance and correct metrics
    let member4Txs = await Models.MemberTransaction.find({ address: member4 }).sort({ createdAt: -1 })
    let member4Balance = await Models.MemberBalance.findOne({ address: member4 })
    let member4Metrics = await Models.MemberMetrics.findOne({ address: member4 })

    expect(member4Txs).to.have.length(2)
    expect(member4Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member4Txs[0].from).to.eq(utils.zeroAddress)
    expect(member4Txs[0].to).to.eq(member4)
    expect(member4Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member4Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member4Balance.votingPower).to.eq('1000000000000000000')
    expect(member4Balance.amount).to.eq('1000000000000000000')
    expect(member4Metrics.delegateReceivedCount).to.eq(1)

    // test member5 have a transaction, balance and correct metrics
    let member5Txs = await Models.MemberTransaction.find({ address: member5 }).sort({ createdAt: -1 })
    let member5Balance = await Models.MemberBalance.findOne({ address: member5 })
    let member5Metrics = await Models.MemberMetrics.findOne({ address: member5 })

    expect(member5Txs).to.have.length(2)
    expect(member5Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member5Txs[0].from).to.eq(utils.zeroAddress)
    expect(member5Txs[0].to).to.eq(member5)
    expect(member5Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member5Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member5Balance.votingPower).to.eq('1000000000000000000')
    expect(member5Balance.amount).to.eq('1000000000000000000')
    expect(member5Metrics.delegateReceivedCount).to.eq(1)

    console.log('end tx1')

    // member1 receive delegation from member2
    const tx2Logs = await UnitDepUtils.getTokenLogsFromReceipt(
      '0x9ecf9ba7aa3838893d5f57216e38dcfd74fcd76b8fc4755f5f29ba390e38cd25',
      network,
    )

    await TransferCrawler.parseAndProcessTransferLogs(tx2Logs, network)

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(3)
    expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member1Txs[0].from).to.eq(member2)
    expect(member1Txs[0].to).to.eq(member1)
    expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member1Txs[0].memberVotingPower).to.eq('2000000000000000000')
    expect(member1Balance.votingPower).to.eq('2000000000000000000')
    expect(member1Balance.amount).to.eq('1000000000000000000')
    expect(member1Metrics.delegateReceivedCount).to.eq(2)

    // test member2 have a transaction, balance and correct metrics
    member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    member2Balance = await Models.MemberBalance.findOne({ address: member2 })
    member2Metrics = await Models.MemberMetrics.findOne({ address: member2 })

    expect(member2Txs).to.have.length(3)
    expect(member2Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member2Txs[0].from).to.eq(member2)
    expect(member2Txs[0].to).to.eq(member1)
    expect(member2Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member2Txs[0].memberVotingPower).to.eq('0')
    expect(member2Balance.votingPower).to.eq('0')
    expect(member2Balance.amount).to.eq('1000000000000000000')
    expect(member2Metrics.delegateReceivedCount).to.eq(0)

    console.log('end tx2')

    // member1 receive delegation from member3
    const tx3Logs = await UnitDepUtils.getTokenLogsFromReceipt(
      '0x1127fa7b1df29f6dbcbdd5d385f8c0eda48e73ad2ed808d1eb5dffb053053a76',
      network,
    )

    await TransferCrawler.parseAndProcessTransferLogs(tx3Logs, network)

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(4)
    expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member1Txs[0].from).to.eq(member3)
    expect(member1Txs[0].to).to.eq(member1)
    expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member1Txs[0].memberVotingPower).to.eq('3000000000000000000')
    expect(member1Balance.votingPower).to.eq('3000000000000000000')
    expect(member1Balance.amount).to.eq('1000000000000000000')
    expect(member1Metrics.delegateReceivedCount).to.eq(3)

    // test member3 have a transaction, balance and correct metrics
    member3Txs = await Models.MemberTransaction.find({ address: member3 }).sort({ createdAt: -1 })
    member3Balance = await Models.MemberBalance.findOne({ address: member3 })
    member3Metrics = await Models.MemberMetrics.findOne({ address: member3 })

    expect(member3Txs).to.have.length(3)
    expect(member3Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member3Txs[0].from).to.eq(member3)
    expect(member3Txs[0].to).to.eq(member1)
    expect(member3Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member3Txs[0].memberVotingPower).to.eq('0')
    expect(member3Balance.votingPower).to.eq('0')
    expect(member3Balance.amount).to.eq('1000000000000000000')
    expect(member3Metrics.delegateReceivedCount).to.eq(0)

    console.log('end tx3')

    // member1 receive delegation from member4
    const tx4Logs = await UnitDepUtils.getTokenLogsFromReceipt(
      '0xf703823a43620c92eedf5100c8f0e47d1a1e960c4c3d14abf8353aab7b5d443d',
      network,
    )

    await TransferCrawler.parseAndProcessTransferLogs(tx4Logs, network)

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(5)
    expect(member1Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member1Txs[0].from).to.eq(member4)
    expect(member1Txs[0].to).to.eq(member1)
    expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member1Txs[0].memberVotingPower).to.eq('4000000000000000000')
    expect(member1Balance.votingPower).to.eq('4000000000000000000')
    expect(member1Balance.amount).to.eq('1000000000000000000')
    expect(member1Metrics.delegateReceivedCount).to.eq(4)

    // test member4 have a transaction, balance and correct metrics
    member4Txs = await Models.MemberTransaction.find({ address: member4 }).sort({ createdAt: -1 })
    member4Balance = await Models.MemberBalance.findOne({ address: member4 })
    member4Metrics = await Models.MemberMetrics.findOne({ address: member4 })

    expect(member4Txs).to.have.length(3)
    expect(member4Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member4Txs[0].from).to.eq(member4)
    expect(member4Txs[0].to).to.eq(member1)
    expect(member4Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member4Txs[0].memberVotingPower).to.eq('0')
    expect(member4Balance.votingPower).to.eq('0')
    expect(member4Balance.amount).to.eq('1000000000000000000')
    expect(member4Metrics.delegateReceivedCount).to.eq(0)

    console.log('end tx4')

    // member1 delegate to member2
    const tx5Logs = await UnitDepUtils.getTokenLogsFromReceipt(
      '0x4ac08441f32f2b13dd5b3897cc1ae13bd6164e6b79699511f5923b00d801419c',
      network,
    )

    await TransferCrawler.parseAndProcessTransferLogs(tx5Logs, network)

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(6)
    expect(member1Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member1Txs[0].from).to.eq(member1)
    expect(member1Txs[0].to).to.eq(member2)
    expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member1Txs[0].memberVotingPower).to.eq('3000000000000000000')
    expect(member1Balance.votingPower).to.eq('3000000000000000000')
    expect(member1Balance.amount).to.eq('1000000000000000000')
    expect(member1Metrics.delegateReceivedCount).to.eq(3)

    // test member2 have a transaction, balance and correct metrics
    member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    member2Balance = await Models.MemberBalance.findOne({ address: member2 })
    member2Metrics = await Models.MemberMetrics.findOne({ address: member2 })

    expect(member2Txs).to.have.length(4)
    expect(member2Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member2Txs[0].from).to.eq(member1)
    expect(member2Txs[0].to).to.eq(member2)
    expect(member2Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member2Txs[0].memberVotingPower).to.eq('1000000000000000000')
    expect(member2Balance.votingPower).to.eq('1000000000000000000')
    expect(member2Balance.amount).to.eq('1000000000000000000')
    expect(member2Metrics.delegateReceivedCount).to.eq(1)

    console.log('end tx5')

    // member2 move delegation from member1 to himself
    const tx6Logs = await UnitDepUtils.getTokenLogsFromReceipt(
      '0x2744c5a3f65084d54bd8a972a3743925b1dea2565ee1e9002061ef653ffd7e50',
      network,
    )

    await TransferCrawler.parseAndProcessTransferLogs(tx6Logs, network)

    // test member1 have a transaction, balance and correct metrics
    member1Txs = await Models.MemberTransaction.find({ address: member1 }).sort({ createdAt: -1 })
    member1Balance = await Models.MemberBalance.findOne({ address: member1 })
    member1Metrics = await Models.MemberMetrics.findOne({ address: member1 })

    expect(member1Txs).to.have.length(7)
    expect(member1Txs[0].side).to.eq(ITransferSide.outgoing)
    expect(member1Txs[0].from).to.eq(member1)
    expect(member1Txs[0].to).to.eq(member2)
    expect(member1Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member1Txs[0].memberVotingPower).to.eq('2000000000000000000')
    expect(member1Balance.votingPower).to.eq('2000000000000000000')
    expect(member1Balance.amount).to.eq('1000000000000000000')
    expect(member1Metrics.delegateReceivedCount).to.eq(2)

    // test member2 have a transaction, balance and correct metrics
    member2Txs = await Models.MemberTransaction.find({ address: member2 }).sort({ createdAt: -1 })
    member2Balance = await Models.MemberBalance.findOne({ address: member2 })
    member2Metrics = await Models.MemberMetrics.findOne({ address: member2 })

    expect(member2Txs).to.have.length(5)
    expect(member2Txs[0].side).to.eq(ITransferSide.incoming)
    expect(member2Txs[0].from).to.eq(member1)
    expect(member2Txs[0].to).to.eq(member2)
    expect(member2Txs[0].memberBalance).to.eq('1000000000000000000')
    expect(member2Txs[0].memberVotingPower).to.eq('2000000000000000000')
    expect(member2Balance.votingPower).to.eq('2000000000000000000')
    expect(member2Balance.amount).to.eq('1000000000000000000')
    expect(member2Metrics.delegateReceivedCount).to.eq(2)

    console.log('end tx6')

    console.log('end')
  })
})
