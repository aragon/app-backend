import '@test/environment'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { DaoExecutionHandler } from '@src/handlers/daoExecutionHandler'
import { ITransactionType } from '@src/types/transfer'
import DecodeActions from '@helpers/decodeAction'
import {
  EnumQueueName,
  IPluginInterfaceType,
  IPluginStatus,
  ITransactionSide,
  NetworksEnum,
  ProposalActionType,
} from '@types'
import { expect } from 'chai'
import { afterEach, beforeEach } from 'mocha'
import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'

describe('Indexer: DaoExecutionHandler', () => {
  let sandbox: SinonSandbox
  let sendDelayedStub: SinonStub

  const dao = '0x0000000000000000000000000000000000000123'
  const actor = '0x0000000000000000000000000000000000000111'
  const network = NetworksEnum.ethereumMainnet

  const createExecutedEvent = (actorAddress: string, actions: any[], callId = '0xcallid') => {
    const event: any = {
      name: 'Executed',
      signature: 'Executed(address,bytes32,Action[],uint256,uint256,bytes[])',
      args: [actorAddress, callId, actions, BigInt('0'), BigInt('0'), []],
    }
    event.args.actor = actorAddress
    event.args.callId = callId
    return event
  }

  // Aragon OSx encodes the DAO callId as bytes32(proposalId); bytes32(0) means a direct execution
  const callIdForProposal = (proposalId: number) => `0x${proposalId.toString(16).padStart(64, '0')}`

  const createInfo = (transactionHash: string, overrides: Record<string, any> = {}) =>
    ({
      address: dao,
      network,
      transactionHash,
      blockNumber: 6000,
      transactionIndex: 1,
      logIndex: 5,
      ...overrides,
    }) as any

  const findExecution = (transactionHash: string) =>
    Models.Transaction.findOne({ transactionHash, type: ITransactionType.execution })

  const createPlugin = () =>
    Models.Plugin.create({
      transactionHash: '0xplugin',
      blockNumber: 1,
      network,
      address: actor,
      status: IPluginStatus.installed,
      isSupported: true,
      interfaceType: IPluginInterfaceType.tokenVoting,
      daoAddress: dao,
    })

  const createProposal = (proposalIndex: string) =>
    Models.Proposal.create({
      daoAddress: dao,
      proposalIndex,
      incrementalId: 1,
      blockNumber: 1,
      pluginAddress: actor,
      transactionHash: '0xcreate',
      network,
      startDate: 1,
      endDate: 1,
      creatorAddress: '0x0000000000000000000000000000000000000777',
      rawActions: [{ to: '0x0000000000000000000000000000000000000222', value: '0', data: '0x' }],
    })

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    await Models.Dao.create({
      address: dao,
      network,
      blockNumber: 1000,
      blockTimestamp: 1620000000,
      transactionHash: '0xdao123',
      name: 'Test DAO',
      creatorAddress: '0x0000000000000000000000000000000000000999',
    })

    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000100)
    sandbox.stub(logger, 'verbose')
    sendDelayedStub = sandbox.stub(RabbitMQHelper, 'sendDelayedMessage').resolves()
  })

  afterEach(async () => {
    sandbox?.restore()
    await Models.Transaction.deleteMany({})
    await Models.Dao.deleteMany({})
    await Models.Proposal.deleteMany({})
    await Models.Plugin.deleteMany({})
    await Models.PluginSlug.deleteMany({})
  })

  describe('write path (event facts + callId classification)', () => {
    it('records a plugin execution from the callId and defers source/decode to the worker', async () => {
      await createPlugin()

      const parsedEvent = createExecutedEvent(
        actor,
        [
          { to: '0x0000000000000000000000000000000000000222', value: BigInt('1000000000000000000'), data: '0x' },
          { to: '0x0000000000000000000000000000000000000333', value: BigInt('0'), data: '0x' },
        ],
        callIdForProposal(9),
      )

      await DaoExecutionHandler.executedEvent(parsedEvent, createInfo('0xexec'))

      const execution = await findExecution('0xexec')
      expect(execution).to.exist
      expect(execution.id).to.equal(`${dao}-${network}-0xexec-1-5-execution`)
      expect(execution.side).to.equal(ITransactionSide.execution)
      expect(execution.actionCount).to.equal(2)
      expect(execution.fromAddress).to.equal(actor)
      expect(execution.toAddress).to.equal(dao)
      expect(execution.value).to.equal('0')

      // classified as a plugin execution: non-zero callId AND the actor is a known plugin
      expect(execution.pluginAddress).to.equal(actor)
      expect(execution.proposalIndex).to.equal('9')
      expect(execution.rawActions).to.have.lengthOf(2)
      expect(execution.rawActions[0].value).to.equal('1000000000000000000')
      expect(execution.actions).to.have.lengthOf(0)
      expect(execution.source).to.be.null

      // finalization is deferred to the delayed executionActions worker
      expect(sendDelayedStub.calledOnce).to.be.true
      expect(sendDelayedStub.firstCall.args[0]).to.equal(EnumQueueName.executionActions)
      expect(sendDelayedStub.firstCall.args[1].params.id).to.equal(execution.id)
    })

    it('classifies a direct execution (zero callId) with no plugin link', async () => {
      const parsedEvent = createExecutedEvent(
        actor,
        [{ to: '0x0000000000000000000000000000000000000222', value: BigInt('0'), data: '0x' }],
        callIdForProposal(0),
      )

      await DaoExecutionHandler.executedEvent(parsedEvent, createInfo('0xexecDirect'))

      const execution = await findExecution('0xexecDirect')
      expect(execution).to.exist
      expect(execution.pluginAddress).to.be.null
      expect(execution.proposalIndex).to.be.null
      expect(sendDelayedStub.calledOnce).to.be.true
    })

    it('finalizes inline (source + link, no decode queue) when the proposal is already indexed', async () => {
      await Models.PluginSlug.create({ network, daoAddress: dao, pluginAddress: actor, slug: 'core' })
      await createPlugin()
      await createProposal('9')

      const parsedEvent = createExecutedEvent(
        actor,
        [{ to: '0x0000000000000000000000000000000000000222', value: BigInt('0'), data: '0x' }],
        callIdForProposal(9),
      )

      await DaoExecutionHandler.executedEvent(parsedEvent, createInfo('0xexecInline'))

      const execution = await findExecution('0xexecInline')
      expect(execution).to.exist
      expect(execution.pluginAddress).to.equal(actor)
      expect(execution.proposalIndex).to.equal('9')
      expect(execution.source).to.equal('core') // resolved inline, not deferred
      expect(execution.actions).to.have.lengthOf(0) // served through the proposal
      // proposal already indexed → no async finalization
      expect(sendDelayedStub.called).to.be.false
    })

    it('classifies an EOA execution with a non-zero callId as direct (actor is not a known plugin)', async () => {
      // an EOA/Safe with EXECUTE_PERMISSION can pass any callId — it must not become a pluginAddress
      const parsedEvent = createExecutedEvent(
        actor,
        [{ to: '0x0000000000000000000000000000000000000222', value: BigInt('0'), data: '0x' }],
        callIdForProposal(42),
      )

      await DaoExecutionHandler.executedEvent(parsedEvent, createInfo('0xexecEoa'))

      const execution = await findExecution('0xexecEoa')
      expect(execution).to.exist
      expect(execution.pluginAddress).to.be.null
      expect(execution.proposalIndex).to.be.null
    })

    it('skips events from addresses that are not a known DAO', async () => {
      const parsedEvent = createExecutedEvent(actor, [])
      const info = createInfo('0xunknown', { address: '0x0000000000000000000000000000000000000bad' })

      await DaoExecutionHandler.executedEvent(parsedEvent, info)

      const executions = await Models.Transaction.find({ transactionHash: '0xunknown' })
      expect(executions).to.have.lengthOf(0)
    })

    it('is idempotent on re-index (one execution row per Executed event)', async () => {
      const parsedEvent = createExecutedEvent(
        actor,
        [{ to: '0x0000000000000000000000000000000000000222', value: BigInt('0'), data: '0x' }],
        callIdForProposal(9),
      )

      await DaoExecutionHandler.executedEvent(parsedEvent, createInfo('0xexec'))
      await DaoExecutionHandler.executedEvent(parsedEvent, createInfo('0xexec'))

      const executions = await Models.Transaction.find({ transactionHash: '0xexec', type: ITransactionType.execution })
      expect(executions).to.have.lengthOf(1)
      expect(sendDelayedStub.calledOnce).to.be.true
    })

    it('records one row per Executed event when a tx holds two executions on the same DAO', async () => {
      // e.g. a nested dao.execute action or a multicall executing two proposals in one tx
      const firstEvent = createExecutedEvent(
        actor,
        [{ to: '0x0000000000000000000000000000000000000222', value: BigInt('0'), data: '0x' }],
        callIdForProposal(9),
      )
      const secondEvent = createExecutedEvent('0x0000000000000000000000000000000000000444', [], callIdForProposal(10))

      await DaoExecutionHandler.executedEvent(firstEvent, createInfo('0xexecMulti', { logIndex: 5 }))
      await DaoExecutionHandler.executedEvent(secondEvent, createInfo('0xexecMulti', { logIndex: 9 }))

      const executions = await Models.Transaction.find({
        transactionHash: '0xexecMulti',
        type: ITransactionType.execution,
      }).sort({ id: 1 })
      expect(executions).to.have.lengthOf(2)
      expect(executions.map(e => e.id)).to.deep.equal([
        `${dao}-${network}-0xexecMulti-1-5-execution`,
        `${dao}-${network}-0xexecMulti-1-9-execution`,
      ])
    })
  })

  describe('executionActions worker (source + decode)', () => {
    const runWorker = async (transactionHash: string) => {
      const execution = await findExecution(transactionHash)
      await DaoExecutionHandler.decodeExecutionTransaction(execution.id)
      return await findExecution(transactionHash)
    }

    it('plugin execution: resolves source from the plugin slug, keeps the link, stores no actions', async () => {
      await Models.PluginSlug.create({ network, daoAddress: dao, pluginAddress: actor, slug: 'core' })
      await createPlugin()
      await createProposal('9')

      const parsedEvent = createExecutedEvent(
        actor,
        [{ to: '0x0000000000000000000000000000000000000222', value: BigInt('0'), data: '0x' }],
        callIdForProposal(9),
      )
      await DaoExecutionHandler.executedEvent(parsedEvent, createInfo('0xexec2'))

      const execution = await runWorker('0xexec2')
      expect(execution.source).to.equal('core')
      expect(execution.pluginAddress).to.equal(actor)
      expect(execution.proposalIndex).to.equal('9')
      // actions are served by reading through to the proposal — the row stores none
      expect(execution.actions).to.have.lengthOf(0)
    })

    it('plugin execution: falls back to the plugin interface type when no slug exists', async () => {
      await createPlugin()
      await createProposal('9')

      const parsedEvent = createExecutedEvent(
        actor,
        [{ to: '0x0000000000000000000000000000000000000222', value: BigInt('0'), data: '0x' }],
        callIdForProposal(9),
      )
      await DaoExecutionHandler.executedEvent(parsedEvent, createInfo('0xexec3'))

      const execution = await runWorker('0xexec3')
      expect(execution.source).to.equal(IPluginInterfaceType.tokenVoting)
      expect(execution.actions).to.have.lengthOf(0)
    })

    it('plugin-classified execution with no backing proposal: decodes the actions as a fallback', async () => {
      await createPlugin()

      // non-zero callId that no proposal backs (e.g. a direct executor using a custom callId)
      const parsedEvent = createExecutedEvent(
        actor,
        [{ to: '0x0000000000000000000000000000000000000222', value: BigInt('0'), data: '0x' }],
        callIdForProposal(424242),
      )
      await DaoExecutionHandler.executedEvent(parsedEvent, createInfo('0xexecNoProposal'))

      const execution = await runWorker('0xexecNoProposal')
      expect(execution.source).to.equal(IPluginInterfaceType.tokenVoting)
      // the link is kept for a later read-through, but the row is not left undecodable
      expect(execution.pluginAddress).to.equal(actor)
      expect(execution.proposalIndex).to.equal('424242')
      expect(execution.actions).to.have.lengthOf(1)
    })

    it('direct execution: decodes and stores the event actions', async () => {
      const parsedEvent = createExecutedEvent(
        actor,
        [{ to: '0x0000000000000000000000000000000000000222', value: BigInt('0'), data: '0x' }],
        callIdForProposal(0),
      )
      await DaoExecutionHandler.executedEvent(parsedEvent, createInfo('0xexecRaw'))

      const execution = await runWorker('0xexecRaw')
      expect(execution.pluginAddress).to.be.null
      expect(execution.proposalIndex).to.be.null
      expect(execution.actionCount).to.equal(1)
      // the row is the sole owner of its actions
      expect(execution.rawActions[0].to).to.equal('0x0000000000000000000000000000000000000222')
      expect(execution.actions).to.have.lengthOf(1)
    })

    it('is a no-op for an unknown id or a non-execution transaction', async () => {
      await DaoExecutionHandler.decodeExecutionTransaction('non-existent-id')

      await Models.Transaction.create({
        transactionHash: '0xtransfer',
        blockNumber: 10,
        blockTimestamp: 10,
        network,
        side: ITransactionSide.deposit,
        type: ITransactionType.native,
        fromAddress: actor,
        toAddress: dao,
        value: '1',
        daoAddress: dao,
      })
      const transfer = await Models.Transaction.findOne({ transactionHash: '0xtransfer' })
      await DaoExecutionHandler.decodeExecutionTransaction(transfer.id)

      expect(await Models.Transaction.countDocuments({ source: { $ne: null } })).to.equal(0)
    })
  })

  describe('event parsing and source resolution edge cases', () => {
    it('keeps a malformed actor as-is and reads positional args when names are missing', async () => {
      // tuple-style event: positional args only, actor is not a valid address
      const parsedEvent: any = {
        name: 'Executed',
        args: ['not-an-address', callIdForProposal(0), [['0x0000000000000000000000000000000000000222', 5n, '0x']]],
      }

      // also exercises the crawl-context block-timestamp path
      const info = createInfo('0xtuple', { context: { getBlockTimestamp: async () => 1620000200 } })
      await DaoExecutionHandler.executedEvent(parsedEvent, info)

      const execution = await findExecution('0xtuple')
      expect(execution).to.exist
      expect(execution.blockTimestamp).to.equal(1620000200)
      expect(execution.fromAddress).to.equal('not-an-address')
      expect(execution.rawActions.map((a: any) => ({ to: a.to, value: a.value, data: a.data }))).to.deep.equal([
        { to: '0x0000000000000000000000000000000000000222', value: '5', data: '0x' },
      ])
    })

    it('extractEventActions returns [] when the event carries no action array', () => {
      expect(DaoExecutionHandler.extractEventActions({ args: ['0xactor', '0x0'] } as any)).to.deep.equal([])
      expect(DaoExecutionHandler.extractEventActions({} as any)).to.deep.equal([])
    })

    it('decodeExecutionActions returns [] for no actions and an Unknown fallback for undecodable data', async () => {
      const context = { daoAddress: dao, network, blockNumber: 6000 }

      expect(await DaoExecutionHandler.decodeExecutionActions([], context)).to.deep.equal([])

      // first action: the decoder throws; second action: the decoder finds nothing
      const decodeDataStub = sandbox.stub(DecodeActions.prototype, 'decodeData')
      decodeDataStub.onFirstCall().rejects(new Error('decode failed'))
      decodeDataStub.onSecondCall().resolves(null)
      sandbox.stub(logger, 'warn')

      const undecodable = { to: '0x0000000000000000000000000000000000000222', value: '0', data: '0xdeadbeef00' }
      const decoded = await DaoExecutionHandler.decodeExecutionActions([undecodable, undecodable], context)
      expect(decoded).to.have.lengthOf(2)
      for (const action of decoded) {
        expect(action.type).to.equal(ProposalActionType.Unknown)
        expect(action.to).to.equal(undecodable.to)
      }
    })

    it('callIdToProposalIndex handles missing and non-numeric callIds', () => {
      expect(DaoExecutionHandler.callIdToProposalIndex({ args: ['0xactor'] } as any)).to.be.null
      expect(DaoExecutionHandler.callIdToProposalIndex({ args: ['0xactor', 'not-a-bigint'] } as any)).to.be.null
      expect(DaoExecutionHandler.callIdToProposalIndex({ args: ['0xactor', callIdForProposal(7)] } as any)).to.equal(
        '7',
      )
    })

    it('resolveExecutionSource falls back to the DAO name and finally the actor itself', async () => {
      // actor is another known DAO -> its name
      expect(await DaoExecutionHandler.resolveExecutionSource(dao, dao, network)).to.equal('Test DAO')

      // actor unknown everywhere -> the actor address
      const stranger = '0x0000000000000000000000000000000000000555'
      expect(await DaoExecutionHandler.resolveExecutionSource(stranger, dao, network)).to.equal(stranger)
    })
  })
})
