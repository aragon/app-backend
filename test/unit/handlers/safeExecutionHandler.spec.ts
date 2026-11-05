import TransactionController from '@api/controllers/transaction'
import { SafeExecutionEvents } from '@artifacts/Safe'
import { Models } from '@dbModels'
import { DaoExecutionHandler } from '@handlers/daoExecutionHandler'
import { SafeExecutionHandler } from '@handlers/safeExecutionHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import SafeExecutionTransactionsModule from '@modules/safe/safeExecutionTransactions'
import SafeTrackingModule from '@modules/safe/safeTracking'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import {
  EnumQueueName,
  type HexAddress,
  type ILogInfo,
  IPluginInterfaceType,
  IPluginStatus,
  type ISafeMultisigTransaction,
  ISafeReadKind,
  ISafeTransactionState,
  ITransactionType,
  NetworksEnum,
  ProposalActionType,
} from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0xd84C233A7D1578021d21E39785439bEdDB165F3D' as HexAddress
const DAO = '0x2222222222222222222222222222222222222222' as HexAddress
const OWNER = '0x1111111111111111111111111111111111111111' as HexAddress
const RELAYER = '0x3333333333333333333333333333333333333333' as HexAddress
const WINNER = `0x${'a'.repeat(64)}`
const RIVAL = `0x${'b'.repeat(64)}`

const transaction = (safeTxHash: string, nonce: string): ISafeMultisigTransaction =>
  ({
    safeTxHash,
    nonce,
    from: OWNER,
    to: DAO,
    value: '0',
    data: '0x',
    operation: 0,
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: OWNER,
    refundReceiver: OWNER,
    confirmations: [],
    confirmationsRequired: 1,
    signatures: null,
    isExecuted: false,
    isSuccessful: null,
    submissionDate: '2026-09-20T12:00:00.000Z',
  }) as ISafeMultisigTransaction

const event = (txHash: string) => ({ args: { txHash } }) as never
const EXECUTION_HASH = `0x${'e'.repeat(64)}`
const info: ILogInfo = {
  network: NETWORK,
  address: SAFE,
  blockNumber: 500,
  transactionHash: EXECUTION_HASH,
  transactionIndex: 17,
  logIndex: 59,
  eventName: 'ExecutionSuccess',
}
const actions = [
  { from: SAFE, to: DAO, value: '0', data: '0x', type: ProposalActionType.TransferNative, inputData: null },
]

describe('Indexer: SafeExecutionHandler', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'debug')
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'error')
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
    sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
      from: RELAYER,
      status: 1,
      hash: EXECUTION_HASH,
      blockNumber: 500,
      index: 17,
      logs: [],
    } as never)
    sandbox.stub(DaoExecutionHandler, 'decodeExecutionActions').resolves(actions as any)
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getBlockNumber: async () => 500 } as any)
    await SafeTransactionsModule.upsert(NETWORK, SAFE, [transaction(WINNER, '7'), transaction(RIVAL, '7')], Date.now())
  })

  afterEach(() => sandbox?.restore())

  const trackTheSafe = () =>
    Models.Plugin.create({
      address: SAFE,
      daoAddress: DAO,
      network: NETWORK,
      transactionHash: `0x${'d'.repeat(64)}`,
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.safe,
      status: IPluginStatus.installed,
      isSupported: true,
    })

  it('settles the executed transaction and kills the rival holding its nonce', async () => {
    await trackTheSafe()

    await SafeExecutionHandler.executionSuccess(event(WINNER), info)

    const winner = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: WINNER })
    const rival = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: RIVAL })

    expect(winner?.state).to.equal(ISafeTransactionState.executed)
    expect(winner?.isSuccessful).to.be.true
    expect(winner?.transactionHash).to.equal(EXECUTION_HASH)
    expect(winner?.executionBlockNumber).to.equal(500)
    expect(winner?.executionDate).to.equal(new Date(1700000000 * 1000).toISOString())
    expect(winner?.executionDate).to.equal('2023-11-14T22:13:20.000Z')
    expect(rival?.state).to.equal(ISafeTransactionState.superseded)
    expect((RabbitMQHelper.sendMessage as sinon.SinonStub).notCalled).to.be.true
  })

  it('records a failed execution as executed, because the nonce is spent either way', async () => {
    await trackTheSafe()

    await SafeExecutionHandler.executionFailure(event(WINNER), info)

    const winner = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: WINNER })

    expect(winner?.state).to.equal(ISafeTransactionState.executed)
    expect(winner?.isSuccessful).to.be.false
  })

  for (const succeeded of [true, false]) {
    it(`clears cached info after a ${succeeded ? 'successful' : 'failed'} execution`, async () => {
      await trackTheSafe()
      const id = Models.SafeCache.cacheKey(NETWORK, SAFE, ISafeReadKind.info)
      const missId = Models.SafeCache.infoNotFoundKey(NETWORK, SAFE)
      await Models.SafeCache.write(id, { nonce: '7' }, Date.now(), 300000, 3600000)
      await Models.SafeCache.write(missId, { notFound: true }, Date.now(), 60_000, 0)
      expect(await Models.SafeCache.findOne({ id })).not.to.be.null
      expect(await Models.SafeCache.findOne({ id: missId })).not.to.be.null

      const handler = succeeded ? SafeExecutionHandler.executionSuccess : SafeExecutionHandler.executionFailure
      await handler(event(WINNER), info)

      expect(await Models.SafeCache.findOne({ id })).to.be.null
      expect(await Models.SafeCache.findOne({ id: missId })).to.be.null
    })
  }

  it('only clears info for the executed Safe on its network', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)
    const keys = [
      Models.SafeCache.cacheKey(NETWORK, SAFE, ISafeReadKind.info),
      Models.SafeCache.infoNotFoundKey(NETWORK, SAFE),
      Models.SafeCache.cacheKey(NETWORK, OWNER, ISafeReadKind.info),
      Models.SafeCache.infoNotFoundKey(NETWORK, OWNER),
      Models.SafeCache.cacheKey(NetworksEnum.ethereumMainnet, SAFE, ISafeReadKind.info),
      Models.SafeCache.infoNotFoundKey(NetworksEnum.ethereumMainnet, SAFE),
      Models.SafeCache.cacheKey(NETWORK, SAFE, ISafeReadKind.queue, Models.SafeCache.queuePage(20, 0)),
      Models.SafeCache.cacheKey(
        NETWORK,
        SAFE,
        ISafeReadKind.history,
        Models.SafeCache.historyPage({ limit: 20, offset: 0 }),
      ),
    ]
    await Promise.all(keys.map(id => Models.SafeCache.write(id, { nonce: '7' }, Date.now(), 300000, 3600000)))
    expect(await Models.SafeCache.distinct('id')).to.have.members(keys)

    await SafeExecutionHandler.executionSuccess(event(WINNER), info)

    expect(await Models.SafeCache.distinct('id')).to.have.members(keys.slice(2))
  })

  it('ignores a Safe nobody has asked us to track', async () => {
    await SafeExecutionHandler.executionSuccess(event(WINNER), info)

    const winner = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: WINNER })

    expect(winner?.state).to.equal(ISafeTransactionState.live)
    expect(await Models.Transaction.countDocuments()).to.equal(0)
    expect((Web3Helper.getTransactionReceipt as sinon.SinonStub).notCalled).to.be.true
  })

  it('asks for a full sync when it never saw the executed transaction', async () => {
    await trackTheSafe()
    const sendStub = RabbitMQHelper.sendMessage as sinon.SinonStub

    await SafeExecutionHandler.executionSuccess(event(`0x${'f'.repeat(64)}`), info)

    expect(await Models.SafeTransaction.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
    expect(sendStub.calledOnce).to.be.true
    expect(sendStub.args[0][0]).to.equal('safe.refresh')
    expect(sendStub.args[0][1].params.historyPages).to.be.greaterThan(1)
  })

  for (const succeeded of [true, false]) {
    it(`settles a registered Safe after a ${succeeded ? 'successful' : 'failed'} execution`, async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)

      const handler = succeeded ? SafeExecutionHandler.executionSuccess : SafeExecutionHandler.executionFailure
      await handler(event(WINNER), info)

      const winner = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: WINNER })
      const rival = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: RIVAL })
      expect(winner).to.include({
        state: ISafeTransactionState.executed,
        isSuccessful: succeeded,
        transactionHash: EXECUTION_HASH,
        executionBlockNumber: 500,
        executionDate: '2023-11-14T22:13:20.000Z',
      })
      expect(rival?.state).to.equal(ISafeTransactionState.superseded)
      const send = RabbitMQHelper.sendMessage as sinon.SinonStub
      expect(send.args).to.deep.equal([
        [
          EnumQueueName.daoTransactions,
          { id: `${NETWORK}-${SAFE}`, params: { daoAddress: SAFE, network: NETWORK } },
          { throwOnError: false },
        ],
        [
          EnumQueueName.daoAssets,
          { id: `${NETWORK}-${SAFE}-native`, params: { address: SAFE, network: NETWORK, native: true } },
          { throwOnError: false },
        ],
      ])
    })
  }

  for (const succeeded of [true, false]) {
    it(`queues a backfill for an unknown ${succeeded ? 'successful' : 'failed'} execution of a registered Safe`, async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)
      const handler = succeeded ? SafeExecutionHandler.executionSuccess : SafeExecutionHandler.executionFailure

      await handler(event(`0x${'f'.repeat(64)}`), info)

      const send = RabbitMQHelper.sendMessage as sinon.SinonStub
      expect(send.callCount).to.equal(3)
      expect(send.firstCall.args[0]).to.equal('safe.refresh')
      expect(send.firstCall.args[1].params).to.include({ network: NETWORK, address: SAFE })
      expect(send.firstCall.args[1].params.historyPages).to.be.greaterThan(1)
      expect(send.secondCall.args).to.deep.equal([
        EnumQueueName.daoTransactions,
        { id: `${NETWORK}-${SAFE}`, params: { daoAddress: SAFE, network: NETWORK } },
        { throwOnError: false },
      ])
      expect(send.thirdCall.args).to.deep.equal([
        EnumQueueName.daoAssets,
        { id: `${NETWORK}-${SAFE}-native`, params: { address: SAFE, network: NETWORK, native: true } },
        { throwOnError: false },
      ])
      expect(await Models.SafeTransaction.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
      expect(await Models.SafeTransaction.countDocuments({ state: ISafeTransactionState.live })).to.equal(2)
    })
  }

  it('ignores executions after a registration is removed', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)
    await Models.SafeAccount.untrack(NETWORK, SAFE)

    await SafeExecutionHandler.executionSuccess(event(WINNER), info)
    await SafeExecutionHandler.executionFailure(event(`0x${'f'.repeat(64)}`), info)

    expect(await Models.SafeTransaction.countDocuments({ state: ISafeTransactionState.live })).to.equal(2)
    expect((RabbitMQHelper.sendMessage as sinon.SinonStub).notCalled).to.be.true
    expect((Web3Helper.getBlockTimestamp as sinon.SinonStub).notCalled).to.be.true
  })

  it('ignores a registration on another network', async () => {
    await Models.SafeAccount.track(NetworksEnum.ethereumMainnet, SAFE)

    await SafeExecutionHandler.executionSuccess(event(WINNER), info)

    expect(await Models.SafeTransaction.countDocuments({ state: ISafeTransactionState.live })).to.equal(2)
    expect((RabbitMQHelper.sendMessage as sinon.SinonStub).notCalled).to.be.true
  })

  it('still settles a DAO Safe after its registration is removed', async () => {
    await trackTheSafe()
    await Models.SafeAccount.track(NETWORK, SAFE)
    await Models.SafeAccount.untrack(NETWORK, SAFE)

    await SafeExecutionHandler.executionSuccess(event(WINNER), info)

    const winner = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: WINNER })
    expect(winner?.state).to.equal(ISafeTransactionState.executed)
    expect((RabbitMQHelper.sendMessage as sinon.SinonStub).notCalled).to.be.true
  })

  for (const succeeded of [true, false]) {
    it(`keeps a ${succeeded ? 'successful' : 'failed'} execution settled when the transfer queue throws`, async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)
      const send = RabbitMQHelper.sendMessage as sinon.SinonStub
      send.withArgs(EnumQueueName.daoTransactions).callsFake(async () => {
        const row = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: WINNER })
        expect(row).to.include({
          state: ISafeTransactionState.executed,
          isSuccessful: succeeded,
          transactionHash: EXECUTION_HASH,
        })
        throw new Error('transfer queue down')
      })
      const onExecution = sandbox.spy(SafeTrackingModule, 'onExecution')

      const handler = succeeded ? SafeExecutionHandler.executionSuccess : SafeExecutionHandler.executionFailure
      await handler(event(WINNER), info)

      const winner = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: WINNER })
      const rival = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: RIVAL })
      expect(winner).to.include({
        state: ISafeTransactionState.executed,
        isSuccessful: succeeded,
        transactionHash: EXECUTION_HASH,
        executionBlockNumber: 500,
      })
      expect(rival?.state).to.equal(ISafeTransactionState.superseded)
      expect(onExecution.calledOnceWith(NETWORK, SAFE)).to.be.true
      expect(send.calledWith(EnumQueueName.daoTransactions)).to.be.true
      expect(send.calledWith(EnumQueueName.safeRefresh)).to.be.true
    })
  }

  for (const succeeded of [true, false]) {
    it(`stores a ${succeeded ? 'successful' : 'failed'} Safe execution`, async () => {
      await trackTheSafe()
      await SafeTransactionsModule.decode(Models.SafeTransaction.buildId(NETWORK, SAFE, WINNER))

      const handler = succeeded ? SafeExecutionHandler.executionSuccess : SafeExecutionHandler.executionFailure
      await handler(event(WINNER), info)

      const id = `${SAFE}-${NETWORK}-${EXECUTION_HASH}-17-59-execution`
      const row = await Models.Transaction.findOne({ id })
      expect(row).to.include({
        daoAddress: SAFE,
        fromAddress: RELAYER,
        toAddress: SAFE,
        transactionHash: EXECUTION_HASH,
        blockNumber: 500,
        transactionIndex: 17,
        logIndex: 59,
        type: ITransactionType.execution,
        side: 'execution',
        value: '0',
        amountUsd: '0',
        safeTxHash: WINNER,
        nonce: '7',
        isSuccessful: succeeded,
        source: 'safe',
        actionCount: 1,
      })
      expect(row?.toObject().rawActions).to.deep.equal([{ to: DAO, value: '0', data: '0x' }])
      expect(row?.actions).to.deep.equal(actions)
      const detail = await TransactionController.getExecutionActions({ id, network: NETWORK })
      expect(detail).to.include({ executedBy: RELAYER, isSuccessful: succeeded, decoding: false })
      expect(detail.actions).to.deep.equal(actions)
    })
  }

  it('keeps one row when an execution is replayed', async () => {
    await trackTheSafe()
    await SafeTransactionsModule.decode(Models.SafeTransaction.buildId(NETWORK, SAFE, WINNER))

    await Promise.all([
      SafeExecutionHandler.executionSuccess(event(WINNER), info),
      SafeExecutionHandler.executionSuccess(event(WINNER), info),
    ])
    await SafeExecutionHandler.executionSuccess(event(WINNER), info)

    const rows = await Models.Transaction.find({ network: NETWORK, daoAddress: SAFE })
    expect(rows).to.have.length(1)
    expect(rows[0].id).to.equal(`${SAFE}-${NETWORK}-${EXECUTION_HASH}-17-59-execution`)
    expect(rows[0].actions).to.deep.equal(actions)
  })

  it('updates one execution row when a reorg changes its inclusion', async () => {
    await trackTheSafe()
    await SafeExecutionHandler.executionSuccess(event(WINNER), info)
    const nextHash = `0x${'9'.repeat(64)}` as HexAddress

    await SafeExecutionHandler.executionFailure(event(WINNER), {
      ...info,
      transactionHash: nextHash,
      blockNumber: 501,
      transactionIndex: 2,
      logIndex: 4,
    })

    const rows = await Models.Transaction.find({ network: NETWORK, daoAddress: SAFE, safeTxHash: WINNER })
    expect(rows).to.have.length(1)
    expect(rows[0]).to.include({
      id: `${SAFE}-${NETWORK}-${nextHash}-2-4-execution`,
      transactionHash: nextHash,
      blockNumber: 501,
      transactionIndex: 2,
      logIndex: 4,
      isSuccessful: false,
    })
  })

  it('keeps one execution when reorg inclusions write from concurrent snapshots', async () => {
    let entered = 0
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const update = Models.Transaction.updateOne.bind(Models.Transaction)
    sandbox.stub(Models.Transaction, 'updateOne').callsFake((async (filter: any, change: any, options: any) => {
      if (entered < 2) {
        await Models.Transaction.findOne({ id: 'missing' }).session(options.session)
        entered++
        if (entered === 2) release()
        await gate
      }
      return update(filter, change, options)
    }) as any)
    const execution = {
      network: NETWORK,
      daoAddress: SAFE,
      fromAddress: RELAYER,
      transactionHash: EXECUTION_HASH,
      blockNumber: 500,
      transactionIndex: 17,
      logIndex: 59,
      blockTimestamp: 1700000000,
      safeTxHash: WINNER,
      isSuccessful: true,
    }

    await Promise.all([
      SafeExecutionTransactionsModule._write(execution, null),
      SafeExecutionTransactionsModule._write(
        { ...execution, transactionHash: `0x${'9'.repeat(64)}`, blockNumber: 501, logIndex: 4 },
        null,
      ),
    ])

    expect(
      await Models.Transaction.countDocuments({ network: NETWORK, daoAddress: SAFE, safeTxHash: WINNER }),
    ).to.equal(1)
  })

  it('keeps the Safe row and the DAO row', async () => {
    await trackTheSafe()
    await SafeExecutionHandler.executionSuccess(event(WINNER), info)
    await DaoExecutionHandler.createExecutionTransaction({
      network: NETWORK,
      daoAddress: DAO,
      fromAddress: SAFE,
      toAddress: DAO,
      transactionHash: EXECUTION_HASH,
      blockNumber: 500,
      transactionIndex: 17,
      logIndex: 58,
    })

    expect(await Models.Transaction.countDocuments({ transactionHash: EXECUTION_HASH })).to.equal(2)
    for (const daoAddress of [SAFE, DAO]) {
      const page = await TransactionController.getTransactionsWithPagination(
        {},
        {
          network: NETWORK,
          daoAddress,
          type: ITransactionType.execution,
        },
      )
      expect(page.metadata.totalRecords).to.equal(1)
      expect(page.data[0].daoAddress).to.equal(daoAddress)
      expect(page.data[0].id).to.equal(
        `${daoAddress}-${NETWORK}-${EXECUTION_HASH}-17-${daoAddress === SAFE ? 59 : 58}-execution`,
      )
      if (daoAddress === SAFE) {
        expect(page.data[0].isSuccessful).to.be.true
        expect(page.data[0].nonce).to.equal('7')
      } else expect(page.data[0]).not.to.have.property('isSuccessful')
    }
  })

  it('fills the actions when the Safe transaction arrives later', async () => {
    await trackTheSafe()
    const hash = `0x${'f'.repeat(64)}`
    await SafeExecutionHandler.executionSuccess(event(hash), info)
    const id = `${SAFE}-${NETWORK}-${EXECUTION_HASH}-17-59-execution`
    expect((await Models.Transaction.findOne({ id }))?.nonce).to.be.null
    expect(await TransactionController.getExecutionActions({ id, network: NETWORK })).to.include({
      decoding: true,
      source: null,
    })
    const receipt = Web3Helper.getTransactionReceipt as sinon.SinonStub
    receipt.resetHistory()

    await SafeTransactionsModule.upsert(
      NETWORK,
      SAFE,
      [
        {
          ...transaction(hash, '8'),
          isExecuted: true,
          isSuccessful: true,
          transactionHash: EXECUTION_HASH,
          executionDate: '2023-11-14T22:13:20.000Z',
        },
      ],
      Date.now(),
    )
    await Models.SafeTransaction.updateOne({ safeTxHash: hash }, { executionBlockNumber: 500 })
    expect((await Models.Transaction.findOne({ id }))?.nonce).to.equal('8')
    const safeId = Models.SafeTransaction.buildId(NETWORK, SAFE, hash)
    await SafeTransactionsModule.decode(safeId)
    let detail = await TransactionController.getExecutionActions({ id, network: NETWORK })
    expect(detail).to.include({ source: 'safe', isSuccessful: true, decoding: false, actionCount: 1 })
    expect(detail.actions).to.deep.equal(actions)
    expect((await Models.Transaction.findOne({ id }))?.nonce).to.equal('8')

    await Models.Transaction.updateOne({ id }, { $set: { source: null, actions: [] } })
    const decode = DaoExecutionHandler.decodeExecutionActions as sinon.SinonStub
    decode.resetHistory()
    await SafeTransactionsModule.decode(safeId)

    detail = await TransactionController.getExecutionActions({ id, network: NETWORK })
    expect(detail.decoding).to.be.false
    expect(detail.actions).to.deep.equal(actions)
    expect(decode.notCalled).to.be.true
    expect(receipt.notCalled).to.be.true
    expect(await Models.Transaction.countDocuments()).to.equal(1)
  })

  it('fills a missing nonce on an enriched execution during sync', async () => {
    await trackTheSafe()
    await SafeExecutionHandler.executionSuccess(event(WINNER), info)
    await SafeTransactionsModule.decode(Models.SafeTransaction.buildId(NETWORK, SAFE, WINNER))
    await Models.Transaction.updateOne({ safeTxHash: WINNER }, { $set: { nonce: null } })

    await SafeExecutionTransactionsModule.sync(NETWORK, SAFE, [WINNER])

    const execution = await Models.Transaction.findOne({ safeTxHash: WINNER })
    expect(execution).to.include({ source: 'safe', nonce: '7' })
  })

  for (const succeeded of [true, false]) {
    it(`queues history for a ${succeeded ? 'successful' : 'failed'} execution when its summary receipt is missing`, async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)
      ;(Web3Helper.getTransactionReceipt as sinon.SinonStub).resolves(null)
      const handler = succeeded ? SafeExecutionHandler.executionSuccess : SafeExecutionHandler.executionFailure

      await handler(event(WINNER), info)

      const executed = await Models.SafeTransaction.find({ state: ISafeTransactionState.executed })
      expect(executed).to.have.length(1)
      expect(executed[0]).to.include({
        safeTxHash: WINNER,
        transactionHash: EXECUTION_HASH,
        executionBlockNumber: 500,
        executionDate: '2023-11-14T22:13:20.000Z',
        isSuccessful: succeeded,
      })
      expect((await Models.SafeTransaction.findOne({ safeTxHash: RIVAL }))?.state).to.equal(
        ISafeTransactionState.superseded,
      )
      expect(await Models.Transaction.countDocuments()).to.equal(0)
      const send = RabbitMQHelper.sendMessage as sinon.SinonStub
      expect(send.getCalls().map(call => call.args[0])).to.deep.equal([
        EnumQueueName.daoTransactions,
        EnumQueueName.daoAssets,
        EnumQueueName.safeRefresh,
      ])
      expect(send.firstCall.args[1].params).to.deep.equal({ daoAddress: SAFE, network: NETWORK })
      expect(send.secondCall.args[1].params).to.deep.equal({ address: SAFE, network: NETWORK, native: true })
      expect(send.thirdCall.args[1].params).to.include({ network: NETWORK, address: SAFE })
      expect(send.thirdCall.args[1].params.historyPages).to.be.greaterThan(1)
      expect((logger.warn as sinon.SinonStub).calledOnceWith('Unable to settle a Safe transaction')).to.be.true
      ;(Web3Helper.getTransactionReceipt as sinon.SinonStub).resolves({ from: RELAYER, logs: [] } as never)
      await handler(event(WINNER), info)
      expect(await Models.Transaction.countDocuments({ safeTxHash: WINNER })).to.equal(1)
    })
  }

  it('queues history when the execution block timestamp is missing', async () => {
    await trackTheSafe()
    ;(Web3Helper.getBlockTimestamp as sinon.SinonStub).resolves(0)

    await SafeExecutionHandler.executionSuccess(event(WINNER), info)

    expect((await Models.SafeTransaction.findOne({ safeTxHash: WINNER }))?.state).to.equal(ISafeTransactionState.live)
    expect(await Models.Transaction.countDocuments()).to.equal(0)
    expect((RabbitMQHelper.sendMessage as sinon.SinonStub).calledOnceWith(EnumQueueName.safeRefresh)).to.be.true
  })

  it('queues history and lets the next event run when settlement fails', async () => {
    await trackTheSafe()
    const mark = sandbox.stub(SafeTransactionsModule, 'markExecuted').rejects(new Error('settlement failed'))

    await SafeExecutionHandler.executionSuccess(event(WINNER), info)

    expect((RabbitMQHelper.sendMessage as sinon.SinonStub).calledOnceWith(EnumQueueName.safeRefresh)).to.be.true
    expect(await Models.Transaction.countDocuments()).to.equal(0)
    mark.restore()
    await SafeExecutionHandler.executionSuccess(event(WINNER), info)
    expect(await Models.Transaction.countDocuments({ safeTxHash: WINNER })).to.equal(1)
  })

  it('queues history and transfer refreshes when an unknown execution has no summary receipt', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)
    ;(Web3Helper.getTransactionReceipt as sinon.SinonStub).resolves(null)

    await SafeExecutionHandler.executionSuccess(event(`0x${'f'.repeat(64)}`), info)

    const send = RabbitMQHelper.sendMessage as sinon.SinonStub
    expect(send.getCalls().map(call => call.args[0])).to.deep.equal([
      EnumQueueName.safeRefresh,
      EnumQueueName.daoTransactions,
      EnumQueueName.daoAssets,
    ])
    expect(send.firstCall.args[1].params).to.include({ network: NETWORK, address: SAFE })
    expect(send.firstCall.args[1].params.historyPages).to.be.greaterThan(1)
    expect(await Models.Transaction.countDocuments()).to.equal(0)
  })

  describe('backfill', () => {
    beforeEach(() => {
      const encoded = new Interface(SafeExecutionEvents.abi).encodeEventLog('ExecutionSuccess', [WINNER, 0n])
      ;(Web3Helper.getTransactionReceipt as sinon.SinonStub).resolves({
        from: RELAYER,
        status: 1,
        logs: [
          {
            ...encoded,
            address: SAFE,
            blockNumber: 500,
            transactionIndex: 17,
            index: 59,
            transactionHash: EXECUTION_HASH,
          },
        ],
      } as never)
    })

    const executedRow = async () => {
      await SafeTransactionsModule.markExecuted(NETWORK, SAFE, WINNER, {
        transactionHash: EXECUTION_HASH,
        blockNumber: 500,
        blockTimestamp: 1700000000,
        succeeded: true,
      })
      const id = Models.SafeTransaction.buildId(NETWORK, SAFE, WINNER)
      await Models.SafeTransaction.updateOne({ id }, { $set: { actions, decoding: false } })
      return (await Models.SafeTransaction.findOne({ id }))!
    }

    it('inserts a missing execution when a tracked Safe history is synced', async () => {
      await trackTheSafe()
      const row = await executedRow()

      await SafeExecutionTransactionsModule.sync(NETWORK, SAFE, [row.safeTxHash])

      const stored = await Models.Transaction.find({ safeTxHash: WINNER })
      expect(stored).to.have.length(1)
      expect(stored[0]).to.include({ transactionHash: EXECUTION_HASH, source: 'safe', actionCount: 1, nonce: '7' })
      expect((Web3Helper.getTransactionReceipt as sinon.SinonStub).calledOnce).to.be.true
    })

    it('uses actions decoded after the Safe row was read', async () => {
      await trackTheSafe()
      const row = await executedRow()
      await Models.SafeTransaction.updateOne({ id: row.id }, { $set: { actions: [], decoding: true } })
      const write = SafeExecutionTransactionsModule._write.bind(SafeExecutionTransactionsModule)
      sandbox.stub(SafeExecutionTransactionsModule, '_write').callsFake(async (execution, stale) => {
        await Models.SafeTransaction.updateOne({ id: row.id }, { $set: { actions, decoding: false } })
        return write(execution, stale)
      })

      await SafeExecutionTransactionsModule.backfill((await Models.SafeTransaction.findOne({ id: row.id }))!)

      const stored = await Models.Transaction.findOne({ safeTxHash: WINNER })
      expect(stored?.source).to.equal('safe')
      expect(stored?.actions).to.deep.equal(actions)
    })

    it('stores and enriches one execution from a matching receipt', async () => {
      const row = await executedRow()

      expect(await SafeExecutionTransactionsModule.backfill(row)).to.deep.equal({ inserted: true, enriched: true })

      const stored = await Models.Transaction.find({ transactionHash: EXECUTION_HASH })
      expect(stored).to.have.length(1)
      expect(stored[0]).to.include({
        id: `${SAFE}-${NETWORK}-${EXECUTION_HASH}-17-59-execution`,
        source: 'safe',
        safeTxHash: WINNER,
        isSuccessful: true,
        fromAddress: RELAYER,
        blockNumber: 500,
        transactionIndex: 17,
        logIndex: 59,
        actionCount: 1,
      })
      expect(stored[0].actions).to.deep.equal(actions)
      expect(stored[0].toObject().rawActions).to.deep.equal([{ to: DAO, value: '0', data: '0x' }])
      expect(await SafeExecutionTransactionsModule.backfill(row)).to.deep.equal({ inserted: false, enriched: true })
      expect(await Models.Transaction.countDocuments()).to.equal(1)
    })

    it('stores nothing when the receipt has no matching execution', async () => {
      const row = await executedRow()
      const receipt = await Web3Helper.getTransactionReceipt(EXECUTION_HASH, NETWORK)
      const encoded = new Interface(SafeExecutionEvents.abi).encodeEventLog('ExecutionSuccess', [RIVAL, 0n])
      ;(Web3Helper.getTransactionReceipt as sinon.SinonStub).resolves({
        ...receipt,
        logs: [{ ...receipt!.logs[0], ...encoded }],
      } as never)

      await expect(SafeExecutionTransactionsModule.backfill(row)).to.be.rejectedWith('one matching event')

      expect(await Models.Transaction.countDocuments()).to.equal(0)
    })

    it('does not store a backfill with a missing block timestamp and recovers on retry', async () => {
      const row = await executedRow()
      await Models.SafeTransaction.updateOne({ id: row.id }, { $set: { executionDate: null } })
      const withoutDate = (await Models.SafeTransaction.findOne({ id: row.id }))!
      ;(Web3Helper.getBlockTimestamp as sinon.SinonStub).resolves(0)

      await expect(SafeExecutionTransactionsModule.backfill(withoutDate)).to.be.rejectedWith(
        'block timestamp not found',
      )
      expect(await Models.Transaction.countDocuments()).to.equal(0)

      ;(Web3Helper.getBlockTimestamp as sinon.SinonStub).resolves(1700000000)
      await SafeExecutionTransactionsModule.backfill(withoutDate)
      expect((await Models.Transaction.findOne({ safeTxHash: WINNER }))?.blockTimestamp).to.equal(1700000000)
    })

    it('continues syncing later executions when one receipt is missing', async () => {
      await trackTheSafe()
      const first = await executedRow()
      const nextHash = `0x${'9'.repeat(64)}` as HexAddress
      await Models.SafeTransaction.updateOne(
        { safeTxHash: RIVAL },
        {
          $set: {
            state: ISafeTransactionState.executed,
            transactionHash: nextHash,
            executionDate: first.executionDate,
          },
        },
      )
      const receipt = await Web3Helper.getTransactionReceipt(EXECUTION_HASH, NETWORK)
      const encoded = new Interface(SafeExecutionEvents.abi).encodeEventLog('ExecutionSuccess', [RIVAL, 0n])
      const fetchReceipt = Web3Helper.getTransactionReceipt as sinon.SinonStub
      fetchReceipt.withArgs(EXECUTION_HASH).resolves(null)
      fetchReceipt.withArgs(nextHash).resolves({
        ...receipt,
        logs: [{ ...receipt!.logs[0], ...encoded, transactionHash: nextHash }],
      } as never)

      await SafeExecutionTransactionsModule.sync(NETWORK, SAFE, [WINNER, RIVAL])

      expect(await Models.Transaction.countDocuments({ safeTxHash: WINNER })).to.equal(0)
      expect(await Models.Transaction.countDocuments({ safeTxHash: RIVAL })).to.equal(1)
      expect((logger.warn as sinon.SinonStub).calledOnceWith('Unable to sync Safe execution')).to.be.true
    })

    it('rolls back the summary when enrichment fails and stores it on retry', async () => {
      const row = await executedRow()
      const write = sandbox.stub(Models.Transaction, 'updateOne').callThrough()
      write
        .withArgs(sinon.match.any, sinon.match({ $set: { source: 'safe' } }))
        .rejects(new Error('enrichment write failed'))

      await expect(SafeExecutionTransactionsModule.backfill(row)).to.be.rejectedWith('enrichment write failed')
      expect(await Models.Transaction.countDocuments()).to.equal(0)
      write.restore()

      expect(await SafeExecutionTransactionsModule.backfill(row)).to.deep.equal({ inserted: true, enriched: true })
      const stored = await Models.Transaction.find({ transactionHash: EXECUTION_HASH })
      expect(stored).to.have.length(1)
      expect(stored[0].source).to.equal('safe')
      expect(stored[0].actions).to.deep.equal(actions)
    })

    it('enriches a competing insert and reports that it did not insert a row', async () => {
      const row = await executedRow()
      const competing = {
        network: NETWORK,
        daoAddress: SAFE,
        fromAddress: RELAYER,
        toAddress: SAFE,
        transactionHash: EXECUTION_HASH,
        blockNumber: 500,
        transactionIndex: 17,
        logIndex: 59,
        safeTxHash: WINNER,
        isSuccessful: true,
      }
      const write = sandbox.stub(Models.Transaction, 'updateOne').callThrough()
      write.onFirstCall().callsFake((async () => {
        await DaoExecutionHandler.createExecutionTransaction(competing)
        await DaoExecutionHandler.createExecutionTransaction(competing)
      }) as any)

      expect(await SafeExecutionTransactionsModule.backfill(row)).to.deep.equal({ inserted: false, enriched: true })

      const stored = await Models.Transaction.find({ transactionHash: EXECUTION_HASH })
      expect(stored).to.have.length(1)
      expect(stored[0].source).to.equal('safe')
      expect(stored[0].actions).to.deep.equal(actions)
    })
  })
})
