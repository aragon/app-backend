import { Models } from '@dbModels'
import { DaoTransferHandler } from '@handlers/daoTransferHanlder'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { ProxyToken } from '@modules/proxyToken'
import MultiSendModule from '@modules/safe/multiSend'
import SafeNativeTransfersModule from '@modules/safe/safeNativeTransfers'
import { type HexAddress, type ILogInfo, ITokenType, ITransactionSide, ITransactionType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { AbiCoder, concat, toBeHex } from 'ethers'
import * as sinon from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0xd84C233A7D1578021d21E39785439bEdDB165F3D' as HexAddress
const RECIPIENT = '0x5F1680d0c2c5E9d3615a036FbDc7432E7bf246FB' as HexAddress
const SENDER = '0x1111111111111111111111111111111111111111' as HexAddress
const SAFE_TX_HASH = `0x${'a'.repeat(64)}`
const EXECUTION_HASH = `0x${'e'.repeat(64)}` as HexAddress

const execution = {
  network: NETWORK,
  daoAddress: SAFE,
  transactionHash: EXECUTION_HASH,
  blockNumber: 500,
  blockTimestamp: 1700000000,
  transactionIndex: 17,
  logIndex: 59,
  isSuccessful: true,
}

describe('Module: SafeNativeTransfers', () => {
  let sandbox: sinon.SinonSandbox

  const storedRow = (fields: Record<string, unknown> = {}, network = NETWORK) =>
    Models.SafeTransaction.create({
      id: Models.SafeTransaction.buildId(network, SAFE, SAFE_TX_HASH),
      network,
      safeAddress: SAFE,
      safeTxHash: SAFE_TX_HASH,
      nonce: '7',
      to: RECIPIENT,
      value: '5000000000000000',
      data: null,
      operation: 0,
      refreshedAt: new Date(),
      ...fields,
    })
  const nativeRows = (network = NETWORK) =>
    Models.Transaction.find({ network, daoAddress: SAFE, type: ITransactionType.native })
      .sort({ actionIndex: 1 })
      .lean()

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    for (const level of ['info', 'verbose', 'debug', 'warn', 'error'] as const) sandbox.stub(logger, level)
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox
      .stub(ProxyToken, 'saveAndGetToken')
      .callsFake(
        async (address, network) =>
          ({ address, network, type: ITokenType.native, decimals: 18, symbol: 'ETH', name: 'Ether' }) as any,
      )
  })

  afterEach(() => sandbox.restore())

  it('stores a plain native send as one withdraw row', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)

    await SafeNativeTransfersModule.record(execution, await storedRow())

    const rows = await nativeRows()
    expect(rows).to.have.length(1)
    expect(rows[0]).to.include({
      side: ITransactionSide.withdraw,
      fromAddress: SAFE,
      toAddress: RECIPIENT,
      value: '0.005',
      actionIndex: 0,
    })
  })

  it('fails the Safe withdraw when token details are missing', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)
    ;(ProxyToken.saveAndGetToken as sinon.SinonStub).resolves(null)

    await expect(SafeNativeTransfersModule.record(execution, await storedRow())).to.be.rejectedWith(
      `Unable to save Safe native withdraw: ${NETWORK} ${EXECUTION_HASH} action 0`,
    )
    expect(await nativeRows()).to.have.length(0)
  })

  it('stores no row when the Safe transaction sends no native', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)

    await SafeNativeTransfersModule.record(execution, await storedRow({ value: '0', data: '0xa9059cbb' }))

    expect(await nativeRows()).to.have.length(0)
  })

  it('stores no row for a delegatecall that is not a MultiSend', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)

    await SafeNativeTransfersModule.record(execution, await storedRow({ operation: 1, data: '0xdeadbeef' }))

    expect(await nativeRows()).to.have.length(0)
  })

  it('stores no row for a Safe that is not registered', async () => {
    await SafeNativeTransfersModule.record(execution, await storedRow())

    expect(await nativeRows()).to.have.length(0)
  })

  it('stores no row on zkSync, where the token crawler already has the native send', async () => {
    const network = NetworksEnum.zksyncMainnet
    await Models.SafeAccount.track(network, SAFE)

    await SafeNativeTransfersModule.record({ ...execution, network }, await storedRow({}, network))

    expect(await nativeRows(network)).to.have.length(0)
  })

  it('keeps the deposit and the send of one transaction as two rows', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)
    const info = { ...execution, address: SAFE, eventName: 'SafeReceived' } as ILogInfo
    const received = Object.assign([SENDER, 10000000000000000n], { sender: SENDER, value: 10000000000000000n })
    await DaoTransferHandler.incomingNativeDeposits({ args: received } as any, info)

    await SafeNativeTransfersModule.record(execution, await storedRow())

    const rows = await Models.Transaction.find({ network: NETWORK, daoAddress: SAFE }).lean()
    expect(rows.map(row => row.side)).to.have.members([ITransactionSide.deposit, ITransactionSide.withdraw])
  })

  describe('MultiSend batch', () => {
    const MULTI_SEND = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526' as HexAddress
    const SECOND_RECIPIENT = '0xc18021bF09671A21F474A8C059c987BA895bDBF7' as HexAddress

    /** `operation(1) to(20) value(32) dataLength(32) data(n)` per inner call, packed with no padding. */
    const packCall = (operation: number, to: string, value: bigint, data = '0x') =>
      concat([toBeHex(operation, 1), to, toBeHex(value, 32), toBeHex((data.length - 2) / 2, 32), data])
    const multiSend = (...calls: string[]) =>
      concat([MultiSendModule.SELECTOR, AbiCoder.defaultAbiCoder().encode(['bytes'], [concat(calls)])])
    const batchRow = (data: string) => storedRow({ to: MULTI_SEND, value: '0', operation: 1, data })

    beforeEach(() => Models.SafeAccount.track(NETWORK, SAFE))

    it('stores one withdraw row per MultiSend call that carries value', async () => {
      const data = multiSend(
        packCall(0, RECIPIENT, 5000000000000000n),
        packCall(0, SENDER, 0n, '0xa9059cbb'),
        packCall(0, SECOND_RECIPIENT, 250000000000000000n),
      )

      await SafeNativeTransfersModule.record(execution, await batchRow(data))

      const rows = await nativeRows()
      expect(rows.map(row => [row.actionIndex, row.toAddress, row.value])).to.deep.equal([
        [0, RECIPIENT, '0.005'],
        [2, SECOND_RECIPIENT, '0.25'],
      ])
      expect(rows.map(row => row.id)).to.deep.equal([
        `${SAFE}-${NETWORK}-${EXECUTION_HASH}-native-action0`,
        `${SAFE}-${NETWORK}-${EXECUTION_HASH}-native-action2`,
      ])
    })

    it('stores no row for an inner delegatecall, its value moves nothing', async () => {
      const data = multiSend(packCall(1, RECIPIENT, 5000000000000000n))

      await SafeNativeTransfersModule.record(execution, await batchRow(data))

      expect(await nativeRows()).to.have.length(0)
    })

    it('stores no row for a batch that does not split clean', async () => {
      await SafeNativeTransfersModule.record(execution, await batchRow(`${MultiSendModule.SELECTOR}1234`))

      expect(await nativeRows()).to.have.length(0)
    })

    it('stores a call to the MultiSend contract as one plain send to it', async () => {
      const data = multiSend(packCall(0, RECIPIENT, 5000000000000000n))

      await SafeNativeTransfersModule.record(
        execution,
        await storedRow({ to: MULTI_SEND, value: '5000000000000000', operation: 0, data }),
      )

      const rows = await nativeRows()
      expect(rows).to.have.length(1)
      expect(rows[0]).to.include({ toAddress: MULTI_SEND, value: '0.005', actionIndex: 0 })
    })
  })

  describe('sync', () => {
    const storedExecution = () =>
      Models.Transaction.create({
        ...execution,
        type: ITransactionType.execution,
        side: ITransactionSide.execution,
        fromAddress: SENDER,
        toAddress: SAFE,
        safeTxHash: SAFE_TX_HASH,
      })

    it('stores the native rows of the executions a Safe already has', async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)
      await storedRow()
      await storedExecution()

      await SafeNativeTransfersModule.sync(NETWORK, SAFE)
      await SafeNativeTransfersModule.sync(NETWORK, SAFE)

      const rows = await nativeRows()
      expect(rows).to.have.length(1)
      expect(rows[0]).to.include({ toAddress: RECIPIENT, value: '0.005', blockNumber: 500, logIndex: 59 })
    })

    it('stores nothing for an execution whose Safe transaction is not stored', async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)
      await storedExecution()

      await SafeNativeTransfersModule.sync(NETWORK, SAFE)

      expect(await nativeRows()).to.have.length(0)
    })

    it('stores nothing for a Safe with no executions', async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)
      await storedRow()

      await SafeNativeTransfersModule.sync(NETWORK, SAFE)

      expect(await nativeRows()).to.have.length(0)
    })
  })
})
