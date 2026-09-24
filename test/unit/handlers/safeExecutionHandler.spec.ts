import { Models } from '@dbModels'
import { SafeExecutionHandler } from '@handlers/safeExecutionHandler'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import {
  type HexAddress,
  IPluginInterfaceType,
  IPluginStatus,
  type ISafeMultisigTransaction,
  ISafeTransactionState,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0xd84C233A7D1578021d21E39785439bEdDB165F3D' as HexAddress
const DAO = '0x2222222222222222222222222222222222222222' as HexAddress
const OWNER = '0x1111111111111111111111111111111111111111' as HexAddress
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
const info = {
  network: NETWORK,
  address: SAFE,
  blockNumber: 500,
  transactionHash: EXECUTION_HASH,
} as never

describe('Indexer: SafeExecutionHandler', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
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
    expect(winner?.executionBlockTimestamp).to.equal(1700000000)
    expect(winner?.executionDate).to.equal('2023-11-14T22:13:20.000Z')
    expect(rival?.state).to.equal(ISafeTransactionState.superseded)
  })

  it('records a failed execution as executed, because the nonce is spent either way', async () => {
    await trackTheSafe()

    await SafeExecutionHandler.executionFailure(event(WINNER), info)

    const winner = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: WINNER })

    expect(winner?.state).to.equal(ISafeTransactionState.executed)
    expect(winner?.isSuccessful).to.be.false
  })

  it('ignores a Safe nobody has asked us to track', async () => {
    await SafeExecutionHandler.executionSuccess(event(WINNER), info)

    const winner = await Models.SafeTransaction.findOne({ network: NETWORK, safeTxHash: WINNER })

    expect(winner?.state).to.equal(ISafeTransactionState.live)
  })

  it('asks for a full sync when it never saw the executed transaction', async () => {
    await trackTheSafe()
    const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

    await SafeExecutionHandler.executionSuccess(event(`0x${'f'.repeat(64)}`), info)

    expect(await Models.SafeTransaction.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
    expect(sendStub.calledOnce).to.be.true
    expect(sendStub.args[0][0]).to.equal('safe.refresh')
    expect(sendStub.args[0][1].params.historyPages).to.be.greaterThan(1)
  })
})
