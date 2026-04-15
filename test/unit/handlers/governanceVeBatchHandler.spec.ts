import { ExitQueue } from '@artifacts/ExitQueue'
import { VotingEscrow } from '@artifacts/VotingEscrow'
import { VotingEscrowIncreasing } from '@artifacts/VotingEscrowIncreasing'
import { Models } from '@dbModels'
import { GovernanceVeBatchHandler, VE_TOPICS, VeBatchProcessor } from '@handlers/governanceVeBatchHandler'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import { TickContext } from '@modules/crawlers/tickContext'
import { MemberGovernanceFactory } from '@src/governance'
import { IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import { AbiCoder, ethers, Interface, type Log } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const veIncreasingIface = new Interface(VotingEscrowIncreasing.abi)
const exitQueueIface = new Interface(ExitQueue.abi)
const votingEscrowIface = new Interface(VotingEscrow.abi)

const ESCROW_ADDRESS = ethers.getAddress('0x641DdEdc2139d9948e8dcC936C1Ab2314D9181E6')
const EXIT_QUEUE_ADDRESS = ethers.getAddress('0x0000000000000000000000000000000000000EE1')
const TOKEN_ADDRESS = ethers.getAddress('0x0000000000000000000000000000000000000AA1')
const NFT_LOCK_ADDRESS = ethers.getAddress('0x0000000000000000000000000000000000000BB1')
const DAO_ADDRESS = ethers.getAddress('0x0000000000000000000000000000000000000DD1')
const DEPOSITOR = ethers.getAddress('0x65D9d3887aa9a9ee78901E96819B574160E4EAC5')
const DELEGATEE = ethers.getAddress('0x0000000000000000000000000000000000000CC1')
const NETWORK = NetworksEnum.ethereumMainnet

const coder = AbiCoder.defaultAbiCoder()

function makeLog(overrides: Partial<Log> & { topics: string[]; data: string; address: string }): Log {
  const { address, data, topics, ...rest } = overrides
  return {
    blockNumber: 100,
    blockHash: '0x' + '00'.repeat(32),
    transactionIndex: 0,
    removed: false,
    address,
    data,
    topics,
    transactionHash: '0x' + 'ab'.repeat(32),
    index: rest.index ?? 0,
    ...rest,
  } as unknown as Log
}

function encodeDepositLog(
  depositor: string,
  tokenId: bigint,
  startTs: bigint,
  value: bigint,
  newTotalLocked: bigint,
): Log {
  const fragment = veIncreasingIface.getEvent('Deposit')!
  const topics = [
    fragment.topicHash,
    coder.encode(['address'], [depositor]),
    coder.encode(['uint256'], [tokenId]),
    coder.encode(['uint256'], [startTs]),
  ]
  const data = coder.encode(['uint256', 'uint256'], [value, newTotalLocked])
  return makeLog({ topics, data, address: ESCROW_ADDRESS })
}

function encodeWithdrawLog(depositor: string, tokenId: bigint, value: bigint, ts: bigint, newTotalLocked: bigint): Log {
  const fragment = veIncreasingIface.getEvent('Withdraw')!
  const topics = [fragment.topicHash, coder.encode(['address'], [depositor]), coder.encode(['uint256'], [tokenId])]
  const data = coder.encode(['uint256', 'uint256', 'uint256'], [value, ts, newTotalLocked])
  return makeLog({ topics, data, address: ESCROW_ADDRESS })
}

function encodeMergedLog(
  sender: string,
  from: bigint,
  to: bigint,
  fromAmount: bigint,
  toAmount: bigint,
  newTotalAmount: bigint,
): Log {
  const fragment = veIncreasingIface.getEvent('Merged')!
  const topics = [
    fragment.topicHash,
    coder.encode(['address'], [sender]),
    coder.encode(['uint256'], [from]),
    coder.encode(['uint256'], [to]),
  ]
  const data = coder.encode(['uint208', 'uint208', 'uint208'], [fromAmount, toAmount, newTotalAmount])
  return makeLog({ topics, data, address: ESCROW_ADDRESS })
}

function encodeTokensDelegatedLog(sender: string, delegatee: string, tokenIds: bigint[]): Log {
  const fragment = votingEscrowIface.getEvent('TokensDelegated')!
  const topics = [fragment.topicHash, coder.encode(['address'], [sender]), coder.encode(['address'], [delegatee])]
  const data = coder.encode(['uint256[]'], [tokenIds])
  return makeLog({ topics, data, address: TOKEN_ADDRESS })
}

function encodeTokensUndelegatedLog(sender: string, delegatee: string, tokenIds: bigint[]): Log {
  const fragment = votingEscrowIface.getEvent('TokensUndelegated')!
  const topics = [fragment.topicHash, coder.encode(['address'], [sender]), coder.encode(['address'], [delegatee])]
  const data = coder.encode(['uint256[]'], [tokenIds])
  return makeLog({ topics, data, address: TOKEN_ADDRESS })
}

function encodeExitQueuedV2Log(tokenId: bigint, holder: string, queuedAt: bigint): Log {
  const fragment = exitQueueIface.getEvent('ExitQueuedV2')!
  const topics = [fragment.topicHash, coder.encode(['uint256'], [tokenId]), coder.encode(['address'], [holder])]
  const data = coder.encode(['uint256'], [queuedAt])
  return makeLog({ topics, data, address: EXIT_QUEUE_ADDRESS })
}

function encodeSplitLog(from: bigint, newTokenId: bigint, sender: string, amt1: bigint, amt2: bigint): Log {
  const fragment = veIncreasingIface.getEvent('Split')!
  const topics = [fragment.topicHash, coder.encode(['uint256'], [from]), coder.encode(['uint256'], [newTokenId])]
  const data = coder.encode(['address', 'uint208', 'uint208'], [sender, amt1, amt2])
  return makeLog({ topics, data, address: ESCROW_ADDRESS })
}

function createPlugin(overrides: any = {}) {
  return {
    id: 'test-plugin-1',
    address: TOKEN_ADDRESS,
    daoAddress: DAO_ADDRESS,
    tokenAddress: TOKEN_ADDRESS,
    network: NETWORK,
    interfaceType: IPluginInterfaceType.tokenVoting,
    status: IPluginStatus.installed,
    votingEscrow: {
      escrowAddress: ESCROW_ADDRESS,
      nftLockAddress: NFT_LOCK_ADDRESS,
      exitQueueAddress: EXIT_QUEUE_ADDRESS,
    },
    ...overrides,
  }
}

describe('Handler: GovernanceVeBatchHandler', () => {
  let sandbox: SinonSandbox
  let tickCtx: TickContext
  const timestampCache = new Map<number, number>([[100, 1700000000]])

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves(new Map([[100, 1700000000]]))
  })

  afterEach(() => {
    sandbox.restore()
  })

  function makeTickCtx(logs: Log[]): TickContext {
    const ctx = new TickContext(NETWORK, logs)
    // Stub the init to avoid actual web3 calls (timestamps already stubbed)
    sandbox.stub(ctx, 'getBlockTimestamps').resolves(new Map([[100, 1700000000]]))
    return ctx
  }

  describe('VE_TOPICS', () => {
    it('should contain topic hashes for all 7 registered events', () => {
      const expectedEvents = [
        { iface: veIncreasingIface, name: 'Deposit' },
        { iface: veIncreasingIface, name: 'Withdraw' },
        { iface: veIncreasingIface, name: 'Split' },
        { iface: veIncreasingIface, name: 'Merged' },
        { iface: exitQueueIface, name: 'ExitQueuedV2' },
        { iface: votingEscrowIface, name: 'TokensDelegated' },
        { iface: votingEscrowIface, name: 'TokensUndelegated' },
      ]

      expect(VE_TOPICS.size).to.equal(7)

      for (const { iface, name } of expectedEvents) {
        const topicHash = iface.getEvent(name)!.topicHash
        expect(VE_TOPICS.has(topicHash), `missing topic for ${name}`).to.be.true
      }
    })
  })

  describe('VeBatchProcessor', () => {
    describe('parseLogs', () => {
      it('should parse valid logs and populate events', () => {
        const depositLog = encodeDepositLog(DEPOSITOR, 1n, 1000n, 500n, 500n)
        const withdrawLog = encodeWithdrawLog(DEPOSITOR, 2n, 300n, 2000n, 200n)
        const logs = [depositLog, withdrawLog]

        tickCtx = makeTickCtx(logs)
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        const result = processor.parseLogs(logs)

        expect(result).to.equal(processor)
        // Access private events via casting to check count
        const events = (processor as any).events
        expect(events).to.have.lengthOf(2)
        expect(events[0].eventName).to.equal('Deposit')
        expect(events[1].eventName).to.equal('Withdraw')
      })

      it('should skip logs with unknown topics', () => {
        const unknownLog = makeLog({
          topics: ['0x' + 'ff'.repeat(32)],
          data: '0x',
          address: ESCROW_ADDRESS,
        })
        const depositLog = encodeDepositLog(DEPOSITOR, 1n, 1000n, 500n, 500n)

        tickCtx = makeTickCtx([unknownLog, depositLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([unknownLog, depositLog])

        const events = (processor as any).events
        expect(events).to.have.lengthOf(1)
        expect(events[0].eventName).to.equal('Deposit')
      })

      it('should preserve order of logs', () => {
        const log1 = encodeDepositLog(DEPOSITOR, 1n, 1000n, 100n, 100n)
        const log2 = encodeMergedLog(DEPOSITOR, 1n, 2n, 50n, 50n, 100n)
        const log3 = encodeWithdrawLog(DEPOSITOR, 3n, 200n, 3000n, 0n)

        tickCtx = makeTickCtx([log1, log2, log3])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([log1, log2, log3])

        const events = (processor as any).events
        expect(events[0].eventName).to.equal('Deposit')
        expect(events[1].eventName).to.equal('Merged')
        expect(events[2].eventName).to.equal('Withdraw')
      })
    })

    describe('resolvePlugins', () => {
      it('should filter out events without matching plugins', async () => {
        const depositLog = encodeDepositLog(DEPOSITOR, 1n, 1000n, 500n, 500n)

        tickCtx = makeTickCtx([depositLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([depositLog])

        // No plugins in DB => all events should be filtered out
        sandbox.stub(Models.Plugin, 'find').returns({ lean: sandbox.stub().resolves([]) } as any)

        await processor.resolvePlugins()

        const events = (processor as any).events
        expect(events).to.have.lengthOf(0)
      })

      it('should attach plugins to matching events', async () => {
        const depositLog = encodeDepositLog(DEPOSITOR, 1n, 1000n, 500n, 500n)
        const plugin = createPlugin()

        tickCtx = makeTickCtx([depositLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([depositLog])

        const findStub = sandbox.stub(Models.Plugin, 'find')
        findStub.returns({ lean: sandbox.stub().resolves([plugin]) } as any)

        await processor.resolvePlugins()

        const events = (processor as any).events
        expect(events).to.have.lengthOf(1)
        expect(events[0].plugins).to.deep.include(plugin)
      })
    })

    describe('createMembers', () => {
      it('should bulk create members from event addresses', async () => {
        const depositLog = encodeDepositLog(DEPOSITOR, 1n, 1000n, 500n, 500n)
        const plugin = createPlugin()

        tickCtx = makeTickCtx([depositLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([depositLog])

        // Manually inject plugins on events
        ;(processor as any).events[0].plugins = [plugin]

        const bulkWriteStub = sandbox.stub(Models.Member, 'bulkWrite').resolves()

        await processor.createMembers()

        expect(bulkWriteStub.calledOnce).to.be.true
        const ops = bulkWriteStub.firstCall.args[0]
        expect(ops).to.have.lengthOf(1)
        expect(ops[0].updateOne.filter.id).to.equal(ethers.getAddress(DEPOSITOR))
        expect(ops[0].updateOne.update.$setOnInsert.address).to.equal(ethers.getAddress(DEPOSITOR))
        expect(ops[0].updateOne.upsert).to.be.true
      })

      it('should create member for delegatee on TokensDelegated', async () => {
        const delegateLog = encodeTokensDelegatedLog(DEPOSITOR, DELEGATEE, [1n])
        const plugin = createPlugin()

        tickCtx = makeTickCtx([delegateLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([delegateLog])
        ;(processor as any).events[0].plugins = [plugin]

        const bulkWriteStub = sandbox.stub(Models.Member, 'bulkWrite').resolves()

        await processor.createMembers()

        expect(bulkWriteStub.calledOnce).to.be.true
        const ops = bulkWriteStub.firstCall.args[0]
        expect(ops).to.have.lengthOf(2)
        const addresses = ops.map((op: any) => op.updateOne.filter.id)
        expect(addresses).to.include(ethers.getAddress(DEPOSITOR))
        expect(addresses).to.include(ethers.getAddress(DELEGATEE))
      })

      it('should not call bulkWrite when there are no events', async () => {
        tickCtx = makeTickCtx([])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)

        const bulkWriteStub = sandbox.stub(Models.Member, 'bulkWrite').resolves()

        await processor.createMembers()

        expect(bulkWriteStub.called).to.be.false
      })
    })

    describe('processDeposits', () => {
      it('should create lock records via bulkWrite', async () => {
        const depositLog = encodeDepositLog(DEPOSITOR, 1n, 1000n, 500n, 500n)
        const plugin = createPlugin()

        tickCtx = makeTickCtx([depositLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([depositLog])
        ;(processor as any).events[0].plugins = [plugin]

        const bulkWriteStub = sandbox.stub(Models.Lock, 'bulkWrite').resolves()

        await processor.processDeposits()

        expect(bulkWriteStub.calledOnce).to.be.true
        const ops = bulkWriteStub.firstCall.args[0]
        expect(ops).to.have.lengthOf(1)

        const setOnInsert = ops[0].updateOne.update.$setOnInsert
        expect(setOnInsert.memberAddress).to.equal(DEPOSITOR)
        expect(setOnInsert.tokenId).to.equal('1')
        expect(setOnInsert.amount).to.equal('500')
        expect(setOnInsert.totalLocked).to.equal('500')
        expect(setOnInsert.nftAddress).to.equal(NFT_LOCK_ADDRESS)
        expect(setOnInsert.tokenAddress).to.equal(TOKEN_ADDRESS)
        expect(setOnInsert.exitQueueAddress).to.equal(EXIT_QUEUE_ADDRESS)
      })

      it('should skip when no deposit events exist', async () => {
        const withdrawLog = encodeWithdrawLog(DEPOSITOR, 1n, 300n, 2000n, 200n)
        const plugin = createPlugin()

        tickCtx = makeTickCtx([withdrawLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([withdrawLog])
        ;(processor as any).events[0].plugins = [plugin]

        const bulkWriteStub = sandbox.stub(Models.Lock, 'bulkWrite').resolves()

        await processor.processDeposits()

        expect(bulkWriteStub.called).to.be.false
      })
    })

    describe('processDelegations', () => {
      it('should create TokenDelegation records and update locks for delegate', async () => {
        const delegateLog = encodeTokensDelegatedLog(DEPOSITOR, DELEGATEE, [1n, 2n])
        const plugin = createPlugin()

        tickCtx = makeTickCtx([delegateLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([delegateLog])
        ;(processor as any).events[0].plugins = [plugin]

        const tokenDelegationBulkWrite = sandbox.stub(Models.TokenDelegation, 'bulkWrite').resolves()
        const lockBulkWrite = sandbox.stub(Models.Lock, 'bulkWrite').resolves()

        await processor.processDelegations('delegate')

        expect(tokenDelegationBulkWrite.calledOnce).to.be.true
        const delegationOps = tokenDelegationBulkWrite.firstCall.args[0]
        expect(delegationOps).to.have.lengthOf(1)

        const setOnInsert = delegationOps[0].updateOne.update.$setOnInsert
        expect(setOnInsert.delegator).to.equal(DEPOSITOR)
        expect(setOnInsert.delegate).to.equal(DELEGATEE)
        expect(setOnInsert.tokenIds).to.deep.equal(['1', '2'])
        expect(setOnInsert.action).to.equal('delegate')
        expect(setOnInsert.blockTimestamp).to.equal(1700000000)

        expect(lockBulkWrite.calledOnce).to.be.true
        const lockOps = lockBulkWrite.firstCall.args[0]
        expect(lockOps[0].updateMany.update.$set.delegateReceiverAddress).to.equal(DELEGATEE)
      })

      it('should set delegateReceiverAddress to null for undelegate', async () => {
        const undelegateLog = encodeTokensUndelegatedLog(DEPOSITOR, DELEGATEE, [1n])
        const plugin = createPlugin()

        tickCtx = makeTickCtx([undelegateLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([undelegateLog])
        ;(processor as any).events[0].plugins = [plugin]

        const tokenDelegationBulkWrite = sandbox.stub(Models.TokenDelegation, 'bulkWrite').resolves()
        const lockBulkWrite = sandbox.stub(Models.Lock, 'bulkWrite').resolves()

        await processor.processDelegations('undelegate')

        expect(tokenDelegationBulkWrite.calledOnce).to.be.true
        const setOnInsert = tokenDelegationBulkWrite.firstCall.args[0][0].updateOne.update.$setOnInsert
        expect(setOnInsert.action).to.equal('undelegate')

        expect(lockBulkWrite.calledOnce).to.be.true
        const lockOps = lockBulkWrite.firstCall.args[0]
        expect(lockOps[0].updateMany.update.$set.delegateReceiverAddress).to.be.null
      })

      it('should skip when no delegation events exist', async () => {
        tickCtx = makeTickCtx([])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)

        const bulkWriteStub = sandbox.stub(Models.TokenDelegation, 'bulkWrite').resolves()

        await processor.processDelegations('delegate')

        expect(bulkWriteStub.called).to.be.false
      })
    })

    describe('processMerges', () => {
      it('should batch fetch lock amounts and update via bulkWrite', async () => {
        const mergeLog = encodeMergedLog(DEPOSITOR, 1n, 2n, 100n, 200n, 300n)
        const plugin = createPlugin()

        tickCtx = makeTickCtx([mergeLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([mergeLog])
        ;(processor as any).events[0].plugins = [plugin]

        sandbox.stub(Models.Lock, 'find').returns({
          lean: sandbox.stub().resolves([{ tokenId: '1', escrowAddress: ESCROW_ADDRESS, amount: '100' }]),
        } as any)
        const bulkWriteStub = sandbox.stub(Models.Lock, 'bulkWrite').resolves()

        await processor.processMerges()

        expect(bulkWriteStub.calledOnce).to.be.true
        const ops = bulkWriteStub.firstCall.args[0]
        // Two ops: one to zero out the from lock, one to update the to lock
        expect(ops).to.have.lengthOf(2)

        // From lock set to 0 with withdraw info
        const fromOp = ops[0].updateOne
        expect(fromOp.update.$set.amount).to.equal('0')
        expect(fromOp.update.$set.lockWithdraw.status).to.be.true
        expect(fromOp.update.$set.lockWithdraw.amount).to.equal('100')

        // To lock updated with new total
        const toOp = ops[1].updateOne
        expect(toOp.update.$set.amount).to.equal('300')
        expect(toOp.update.$set.memberAddress).to.equal(DEPOSITOR)
      })

      it('should skip merge if source lock not found', async () => {
        const mergeLog = encodeMergedLog(DEPOSITOR, 99n, 2n, 100n, 200n, 300n)
        const plugin = createPlugin()

        tickCtx = makeTickCtx([mergeLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([mergeLog])
        ;(processor as any).events[0].plugins = [plugin]

        sandbox.stub(Models.Lock, 'find').returns({
          lean: sandbox.stub().resolves([]),
        } as any)
        const bulkWriteStub = sandbox.stub(Models.Lock, 'bulkWrite').resolves()

        await processor.processMerges()

        // No ops should be created since source lock was not found
        expect(bulkWriteStub.called).to.be.false
      })

      it('should skip when no merge events exist', async () => {
        tickCtx = makeTickCtx([])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)

        const findStub = sandbox.stub(Models.Lock, 'find')

        await processor.processMerges()

        expect(findStub.called).to.be.false
      })
    })

    describe('processMetrics', () => {
      it('should bulk upsert PluginMetrics for event participants', async () => {
        const depositLog = encodeDepositLog(DEPOSITOR, 1n, 1000n, 500n, 500n)
        const plugin = createPlugin()

        tickCtx = makeTickCtx([depositLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([depositLog])
        ;(processor as any).events[0].plugins = [plugin]

        const bulkWriteStub = sandbox.stub(Models.PluginMetrics, 'bulkWrite').resolves()

        await processor.processMetrics()

        expect(bulkWriteStub.calledOnce).to.be.true
        const ops = bulkWriteStub.firstCall.args[0]
        expect(ops).to.have.lengthOf(1)

        const setOnInsert = ops[0].updateOne.update.$setOnInsert
        expect(setOnInsert.memberAddress).to.equal(ethers.getAddress(DEPOSITOR))
        expect(setOnInsert.pluginAddress).to.equal(TOKEN_ADDRESS)
        expect(setOnInsert.daoAddress).to.equal(DAO_ADDRESS)
        expect(setOnInsert.proposalCount).to.equal(0)
        expect(setOnInsert.voteCount).to.equal(0)
      })

      it('should add metrics for both depositor and delegatee on TokensDelegated', async () => {
        const delegateLog = encodeTokensDelegatedLog(DEPOSITOR, DELEGATEE, [1n])
        const plugin = createPlugin()

        tickCtx = makeTickCtx([delegateLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([delegateLog])
        ;(processor as any).events[0].plugins = [plugin]

        const bulkWriteStub = sandbox.stub(Models.PluginMetrics, 'bulkWrite').resolves()

        await processor.processMetrics()

        expect(bulkWriteStub.calledOnce).to.be.true
        const ops = bulkWriteStub.firstCall.args[0]
        expect(ops).to.have.lengthOf(2)

        const addresses = ops.map((op: any) => op.updateOne.update.$setOnInsert.memberAddress)
        expect(addresses).to.include(ethers.getAddress(DEPOSITOR))
        expect(addresses).to.include(ethers.getAddress(DELEGATEE))
      })

      it('should not call bulkWrite when no events', async () => {
        tickCtx = makeTickCtx([])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)

        const bulkWriteStub = sandbox.stub(Models.PluginMetrics, 'bulkWrite').resolves()

        await processor.processMetrics()

        expect(bulkWriteStub.called).to.be.false
      })
    })

    describe('processWithdraws', () => {
      it('should update locks with withdraw info', async () => {
        const withdrawLog = encodeWithdrawLog(DEPOSITOR, 1n, 300n, 2000n, 200n)
        const plugin = createPlugin()

        tickCtx = makeTickCtx([withdrawLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([withdrawLog])
        ;(processor as any).events[0].plugins = [plugin]

        const bulkWriteStub = sandbox.stub(Models.Lock, 'bulkWrite').resolves()

        await processor.processWithdraws()

        expect(bulkWriteStub.calledOnce).to.be.true
        const ops = bulkWriteStub.firstCall.args[0]
        expect(ops).to.have.lengthOf(1)

        const update = ops[0].updateOne.update.$set
        expect(update.memberAddress).to.equal(DEPOSITOR)
        expect(update.delegateReceiverAddress).to.be.null
        expect(update.lockWithdraw.status).to.be.true
        expect(update.lockWithdraw.amount).to.equal('300')
        expect(update.lockWithdraw.totalLocked).to.equal('200')
      })
    })

    describe('processExitQueued', () => {
      it('should update locks with exit queue info', async () => {
        const exitLog = encodeExitQueuedV2Log(1n, DEPOSITOR, 1700000000n)
        const plugin = createPlugin()

        tickCtx = makeTickCtx([exitLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([exitLog])
        ;(processor as any).events[0].plugins = [plugin]

        const bulkWriteStub = sandbox.stub(Models.Lock, 'bulkWrite').resolves()

        await processor.processExitQueued()

        expect(bulkWriteStub.calledOnce).to.be.true
        const ops = bulkWriteStub.firstCall.args[0]
        expect(ops).to.have.lengthOf(1)

        const update = ops[0].updateOne.update.$set
        expect(update.memberAddress).to.equal(DEPOSITOR)
        expect(update.lockExit.status).to.be.true
        expect(update.lockExit.tokenId).to.equal('1')
        expect(update.lockExit.holder).to.equal(DEPOSITOR)
        expect(update.lockExit.exitDateAt).to.equal(1700000000)
      })
    })

    describe('processSplits', () => {
      it('should create new lock and update original via bulkWrite', async () => {
        const splitLog = encodeSplitLog(1n, 2n, DEPOSITOR, 300n, 200n)
        const plugin = createPlugin()

        tickCtx = makeTickCtx([splitLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([splitLog])
        ;(processor as any).events[0].plugins = [plugin]

        sandbox.stub(Models.Lock, 'find').returns({
          lean: sandbox.stub().resolves([
            {
              tokenId: '1',
              escrowAddress: ESCROW_ADDRESS,
              epochStartAt: 1000,
              amount: '500',
            },
          ]),
        } as any)

        const bulkWriteStub = sandbox.stub(Models.Lock, 'bulkWrite').resolves()

        await processor.processSplits()

        expect(bulkWriteStub.calledOnce).to.be.true
        const ops = bulkWriteStub.firstCall.args[0]
        expect(ops).to.have.lengthOf(2)

        // New lock from split
        const newLock = ops[0].updateOne.update.$setOnInsert
        expect(newLock.tokenId).to.equal('2')
        expect(newLock.amount).to.equal('200')
        expect(newLock.splitFromTokenId).to.equal('1')
        expect(newLock.epochStartAt).to.equal(1000)

        // Original lock amount updated
        const originalUpdate = ops[1].updateOne.update.$set
        expect(originalUpdate.amount).to.equal('300')
        expect(originalUpdate.memberAddress).to.equal(DEPOSITOR)
      })
    })
  })

  describe('resolvePlugins with ExitQueuedV2 events', () => {
    it('should attach plugins to ExitQueuedV2 events via exitQueueAddress', async () => {
      const exitLog = encodeExitQueuedV2Log(1n, DEPOSITOR, 1700000000n)
      const plugin = createPlugin()

      tickCtx = makeTickCtx([exitLog])
      const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
      processor.parseLogs([exitLog])

      const events = (processor as any).events
      expect(events).to.have.lengthOf(1)
      expect(events[0].eventName).to.equal('ExitQueuedV2')

      // Plugin.find should be called with exitQueueAddress filter
      const findStub = sandbox.stub(Models.Plugin, 'find')
      findStub.returns({ lean: sandbox.stub().resolves([plugin]) } as any)

      await processor.resolvePlugins()

      const resolvedEvents = (processor as any).events
      expect(resolvedEvents).to.have.lengthOf(1)
      expect(resolvedEvents[0].plugins).to.deep.include(plugin)
    })
  })

  describe('processExitQueued with lock update ops', () => {
    it('should create lock update ops for ExitQueuedV2 events', async () => {
      const exitLog = encodeExitQueuedV2Log(1n, DEPOSITOR, 1234567890n)
      const plugin = createPlugin()

      tickCtx = makeTickCtx([exitLog])
      const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
      processor.parseLogs([exitLog])
      ;(processor as any).events[0].plugins = [plugin]

      const bulkWriteStub = sandbox.stub(Models.Lock, 'bulkWrite').resolves()

      await processor.processExitQueued()

      expect(bulkWriteStub.calledOnce).to.be.true
      const ops = bulkWriteStub.firstCall.args[0]
      expect(ops).to.have.lengthOf(1)

      const filter = ops[0].updateOne.filter
      expect(filter.exitQueueAddress).to.equal(EXIT_QUEUE_ADDRESS)
      expect(filter.tokenId).to.equal('1')

      const update = ops[0].updateOne.update.$set
      expect(update.memberAddress).to.equal(DEPOSITOR)
      expect(update.lockExit.status).to.be.true
      expect(update.lockExit.tokenId).to.equal('1')
      expect(update.lockExit.holder).to.equal(DEPOSITOR)
      expect(update.lockExit.exitDateAt).to.equal(1234567890)
    })
  })

  describe('updateDaoMetrics', () => {
    it('should call MemberGovernanceFactory.create and gov.updateDaoMetrics for unique escrow addresses', async () => {
      const depositLog = encodeDepositLog(DEPOSITOR, 1n, 1000n, 500n, 500n)
      const plugin = createPlugin()

      tickCtx = makeTickCtx([depositLog])
      const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
      processor.parseLogs([depositLog])
      ;(processor as any).events[0].plugins = [plugin]

      const updateDaoMetricsStub = sandbox.stub().resolves()
      const factoryStub = sandbox.stub(MemberGovernanceFactory, 'create').returns({
        updateDaoMetrics: updateDaoMetricsStub,
      } as any)

      await processor.updateDaoMetrics()

      expect(factoryStub.calledOnce).to.be.true
      expect(factoryStub.firstCall.args[0].address).to.equal(ESCROW_ADDRESS)
      expect(factoryStub.firstCall.args[0].network).to.equal(NETWORK)
      expect(updateDaoMetricsStub.calledOnce).to.be.true
    })

    it('should deduplicate by escrow address', async () => {
      const depositLog1 = encodeDepositLog(DEPOSITOR, 1n, 1000n, 500n, 500n)
      const depositLog2 = encodeDepositLog(DEPOSITOR, 2n, 2000n, 300n, 800n)
      const plugin = createPlugin()

      tickCtx = makeTickCtx([depositLog1, depositLog2])
      const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
      processor.parseLogs([depositLog1, depositLog2])
      ;(processor as any).events[0].plugins = [plugin]
      ;(processor as any).events[1].plugins = [plugin]

      const updateDaoMetricsStub = sandbox.stub().resolves()
      sandbox.stub(MemberGovernanceFactory, 'create').returns({
        updateDaoMetrics: updateDaoMetricsStub,
      } as any)

      await processor.updateDaoMetrics()

      // Only called once despite two events with the same escrow address
      expect(updateDaoMetricsStub.calledOnce).to.be.true
    })
  })

  describe('GovernanceVeBatchHandler.processVeEventsBatch', () => {
    it('should return immediately for empty logs', async () => {
      const pluginFindStub = sandbox.stub(Models.Plugin, 'find')

      await GovernanceVeBatchHandler.processVeEventsBatch([], NETWORK)

      expect(pluginFindStub.called).to.be.false
    })

    it('should orchestrate the full flow', async () => {
      const depositLog = encodeDepositLog(DEPOSITOR, 1n, 1000n, 500n, 500n)
      const plugin = createPlugin()

      // Stub Plugin.find for resolvePlugins
      sandbox.stub(Models.Plugin, 'find').returns({
        lean: sandbox.stub().resolves([plugin]),
      } as any)

      // Stub all model writes
      sandbox.stub(Models.Member, 'bulkWrite').resolves()
      sandbox.stub(Models.Lock, 'bulkWrite').resolves()
      sandbox.stub(Models.Lock, 'find').returns({ lean: sandbox.stub().resolves([]) } as any)
      sandbox.stub(Models.Lock, 'findOne').resolves(null)
      sandbox.stub(Models.TokenDelegation, 'bulkWrite').resolves()
      sandbox.stub(Models.PluginMetrics, 'bulkWrite').resolves()

      // Stub MemberGovernanceFactory
      sandbox.stub(MemberGovernanceFactory, 'create').returns({
        updateDaoMetrics: sandbox.stub().resolves(),
      } as any)

      await GovernanceVeBatchHandler.processVeEventsBatch([depositLog], NETWORK)

      // Verify Member.bulkWrite was called (members created)
      expect((Models.Member.bulkWrite as sinon.SinonStub).calledOnce).to.be.true
      // Verify Lock.bulkWrite was called (deposits processed)
      expect((Models.Lock.bulkWrite as sinon.SinonStub).called).to.be.true
      // Verify PluginMetrics.bulkWrite was called (metrics processed)
      expect((Models.PluginMetrics.bulkWrite as sinon.SinonStub).calledOnce).to.be.true
    })

    it('should sort logs by blockNumber, transactionIndex, and index', async () => {
      const log1 = encodeDepositLog(DEPOSITOR, 1n, 1000n, 500n, 500n)
      const log2 = encodeDepositLog(DEPOSITOR, 2n, 2000n, 300n, 800n)
      // Make log2 appear before log1 in block order
      ;(log1 as any).blockNumber = 200
      ;(log1 as any).transactionIndex = 1
      ;(log1 as any).index = 0
      ;(log2 as any).blockNumber = 100
      ;(log2 as any).transactionIndex = 0
      ;(log2 as any).index = 0

      const plugin = createPlugin()

      sandbox.stub(Models.Plugin, 'find').returns({
        lean: sandbox.stub().resolves([plugin]),
      } as any)
      sandbox.stub(Models.Member, 'bulkWrite').resolves()
      sandbox.stub(Models.Lock, 'bulkWrite').resolves()
      sandbox.stub(Models.Lock, 'find').returns({ lean: sandbox.stub().resolves([]) } as any)
      sandbox.stub(Models.Lock, 'findOne').resolves(null)
      sandbox.stub(Models.TokenDelegation, 'bulkWrite').resolves()
      sandbox.stub(Models.PluginMetrics, 'bulkWrite').resolves()
      sandbox.stub(MemberGovernanceFactory, 'create').returns({
        updateDaoMetrics: sandbox.stub().resolves(),
      } as any)

      await GovernanceVeBatchHandler.processVeEventsBatch([log1, log2], NETWORK)

      // If sort works, log2 (block 100) should be before log1 (block 200)
      expect((Models.Member.bulkWrite as sinon.SinonStub).calledOnce).to.be.true
    })
  })

  describe('VeBatchProcessor edge cases', () => {
    describe('createMembers with duplicate addresses', () => {
      it('should merge min/max blockNumbers for same address across events', async () => {
        const log1 = encodeDepositLog(DEPOSITOR, 1n, 1000n, 500n, 500n)
        const log2 = encodeWithdrawLog(DEPOSITOR, 1n, 300n, 2000n, 200n)
        ;(log1 as any).blockNumber = 100
        ;(log2 as any).blockNumber = 200

        const plugin = createPlugin()

        tickCtx = makeTickCtx([log1, log2])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([log1, log2])
        ;(processor as any).events[0].plugins = [plugin]
        ;(processor as any).events[1].plugins = [plugin]

        const bulkWriteStub = sandbox.stub(Models.Member, 'bulkWrite').resolves()

        await processor.createMembers()

        expect(bulkWriteStub.calledOnce).to.be.true
        const ops = bulkWriteStub.firstCall.args[0]
        // Same address should be deduplicated into one op
        expect(ops).to.have.lengthOf(1)
        expect(ops[0].updateOne.update.$setOnInsert.firstActivity).to.equal(100)
        expect(ops[0].updateOne.update.$max.lastActivity).to.equal(200)
      })
    })

    describe('processSplits when lock not found', () => {
      it('should skip split and continue when original lock not found', async () => {
        const splitLog = encodeSplitLog(1n, 2n, DEPOSITOR, 300n, 200n)
        const plugin = createPlugin()

        tickCtx = makeTickCtx([splitLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([splitLog])
        ;(processor as any).events[0].plugins = [plugin]

        sandbox.stub(Models.Lock, 'find').returns({ lean: sandbox.stub().resolves([]) } as any)
        const bulkWriteStub = sandbox.stub(Models.Lock, 'bulkWrite').resolves()

        await processor.processSplits()

        expect(bulkWriteStub.called).to.be.false
      })
    })

    describe('resolvePlugins with TOKEN_EVENTS', () => {
      it('should resolve TokensDelegated events via tokenMap', async () => {
        const delegateLog = encodeTokensDelegatedLog(DEPOSITOR, DELEGATEE, [1n])
        const plugin = createPlugin()

        tickCtx = makeTickCtx([delegateLog])
        const processor = new VeBatchProcessor(NETWORK, tickCtx, timestampCache)
        processor.parseLogs([delegateLog])

        sandbox.stub(Models.Plugin, 'find').returns({
          lean: sandbox.stub().resolves([plugin]),
        } as any)

        await processor.resolvePlugins()

        const events = (processor as any).events
        expect(events).to.have.lengthOf(1)
        expect(events[0].plugins).to.deep.include(plugin)
      })
    })
  })
})
