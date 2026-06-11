import '@test/environment'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import { DaoExecutionHandler } from '@src/handlers/daoExecutionHandler'
import { ITransactionType } from '@src/types/transfer'
import { EnumQueueName, IPluginInterfaceType, IPluginStatus, ITransactionSide, NetworksEnum } from '@types'
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

      // classified as a plugin execution purely from the callId — no DB lookup, no decode, no source
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
  })
})
