import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import TenderlySafe from '@modules/tenderly/safe/safeSimulationService'
import {
  ISafeTransactionState,
  ISimulationStatus,
  type ITenderlyFullSimulationResponse,
  ITenderlyOperation,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import { concat, getAddress, Interface, id, ZeroAddress, ZeroHash, zeroPadValue } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumMainnet
const SAFE = getAddress('0x1111111111111111111111111111111111111111')
const OWNER_A = getAddress('0x2222222222222222222222222222222222222222')
const OWNER_B = getAddress('0x3333333333333333333333333333333333333333')
const MULTISEND = getAddress('0x40a2accbd92bca938b02010e17a5b8929b49130d')
const SAFE_TX_HASH = `0x${'ab'.repeat(32)}`

const safeInterface = new Interface([
  'function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures)',
])

const seed = (changes: Record<string, unknown> = {}) =>
  Models.SafeTransaction.create({
    id: Models.SafeTransaction.buildId(NETWORK, SAFE, SAFE_TX_HASH),
    network: NETWORK,
    safeAddress: SAFE,
    safeTxHash: SAFE_TX_HASH,
    nonce: '7',
    state: ISafeTransactionState.live,
    to: MULTISEND,
    value: '1000',
    data: '0x8d80ff0a',
    operation: 1,
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: ZeroAddress,
    refundReceiver: ZeroAddress,
    from: OWNER_B,
    refreshedAt: new Date(),
    ...changes,
  })

const request = (changes: Record<string, unknown> = {}) => ({
  operation: ITenderlyOperation.safeTransaction as const,
  network: NETWORK,
  safeAddress: SAFE,
  safeTxHash: SAFE_TX_HASH,
  sentAt: Date.now(),
  ...changes,
})

describe('Module: tenderly safe simulation service', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('load', () => {
    it('reads the stored pending transaction by Safe and hash, in any casing', async () => {
      await seed()

      const transaction = await TenderlySafe.load(
        request({ safeAddress: SAFE.toLowerCase(), safeTxHash: SAFE_TX_HASH.toUpperCase().replace('0X', '0x') }),
      )

      expect(transaction).to.include({ safeTxHash: SAFE_TX_HASH, nonce: '7', operation: 1 })
    })

    it('answers 404 for a missing transaction or one that is no longer pending', async () => {
      await seed({ state: ISafeTransactionState.executed })

      const executed: any = await TenderlySafe.load(request()).catch(error => error)
      const missing: any = await TenderlySafe.load(request({ safeTxHash: `0x${'cd'.repeat(32)}` })).catch(
        error => error,
      )

      expect(executed.message).to.equal('notFound')
      expect(executed.status).to.equal(404)
      expect(missing.message).to.equal('notFound')
    })

    it('answers 400 on a network the Safe service does not serve', async () => {
      const error: any = await TenderlySafe.load(request({ network: NetworksEnum.citreaMainnet })).catch(e => e)

      expect(error.message).to.equal('badSimulationRequest')
      expect(error.status).to.equal(400)
    })
  })

  describe('recent', () => {
    it('returns a stored run younger than the re-simulation window', async () => {
      const runAt = Date.now() - 1000
      const transaction = (await seed({
        simulation: { url: 'https://old', runAt, status: ISimulationStatus.FAILED },
      })) as any

      expect(TenderlySafe.recent(transaction)).to.deep.equal({
        status: ISimulationStatus.FAILED,
        url: 'https://old',
        runAt,
        network: NETWORK,
      })
    })

    it('returns nothing for an old run or no run', async () => {
      const old = (await seed({
        simulation: {
          url: 'https://old',
          runAt: Date.now() - config.TENDERLY.RE_SIMULATION_TIME - 1,
          status: ISimulationStatus.SUCCESS,
        },
      })) as any

      expect(TenderlySafe.recent(old)).to.be.null
      expect(TenderlySafe.recent({ ...old.toObject(), simulation: null })).to.be.null
    })
  })

  describe('build', () => {
    let readNonce: sinon.SinonStub

    beforeEach(() => {
      readNonce = sandbox.stub(SafeChainReaderModule, 'readNonce').resolves('7')
    })

    it('calls execTransaction with every queued field, from the proposer, with overrides', async () => {
      sandbox.stub(SafeChainReaderModule, 'readOwners').resolves([OWNER_A, OWNER_B])
      const transaction = (await seed({ safeTxGas: '50000', gasPrice: '1', refundReceiver: OWNER_A })) as any

      const simulation = await TenderlySafe.build(transaction)

      expect(simulation).to.include({ to: SAFE, from: OWNER_B, value: '0' })
      const args = safeInterface.decodeFunctionData('execTransaction', simulation.data)
      expect(args[0]).to.equal(MULTISEND)
      expect(args[1]).to.equal(1000n)
      expect(args[2]).to.equal('0x8d80ff0a')
      expect(args[3]).to.equal(1n)
      expect(args[4]).to.equal(50000n)
      expect(args[6]).to.equal(1n)
      expect(args[8]).to.equal(OWNER_A)
      expect(args[9]).to.equal(`${zeroPadValue(OWNER_B, 32)}${ZeroHash.slice(2)}01`.toLowerCase())
      expect(simulation.stateObjects).to.deep.equal({
        [SAFE]: {
          storage: {
            [zeroPadValue('0x04', 32)]: zeroPadValue('0x01', 32),
            [zeroPadValue('0x05', 32)]: zeroPadValue('0x07', 32),
          },
        },
      })
    })

    it('sends from the first owner when the proposer is no longer an owner', async () => {
      sandbox.stub(SafeChainReaderModule, 'readOwners').resolves([OWNER_A])
      const transaction = (await seed()) as any

      const simulation = await TenderlySafe.build(transaction)

      expect(simulation.from).to.equal(OWNER_A)
    })

    it('answers 400 when the Safe has no owners', async () => {
      sandbox.stub(SafeChainReaderModule, 'readOwners').resolves(null)
      const transaction = (await seed()) as any

      const error: any = await TenderlySafe.build(transaction).catch(e => e)

      expect(error.message).to.equal('badSimulationRequest')
    })

    it('answers 404 for a nonce the Safe has already used, even while the row is still live', async () => {
      sandbox.stub(SafeChainReaderModule, 'readOwners').resolves([OWNER_A])
      readNonce.resolves('8')
      const transaction = (await seed()) as any

      const error: any = await TenderlySafe.build(transaction).catch(e => e)

      expect(error.message).to.equal('notFound')
      expect(error.status).to.equal(404)
    })

    it('runs a transaction queued behind the onchain nonce', async () => {
      sandbox.stub(SafeChainReaderModule, 'readOwners').resolves([OWNER_A])
      readNonce.resolves('5')
      const transaction = (await seed()) as any

      const simulation = await TenderlySafe.build(transaction)

      expect(simulation.stateObjects![SAFE].storage![zeroPadValue('0x05', 32)]).to.equal(zeroPadValue('0x07', 32))
    })
  })

  describe('status', () => {
    const TX = { network: NETWORK, safeAddress: SAFE, safeTxHash: SAFE_TX_HASH }
    const SUCCESS_TOPIC = id('ExecutionSuccess(bytes32,uint256)')
    const FAILURE_TOPIC = id('ExecutionFailure(bytes32,uint256)')
    const PAYMENT = zeroPadValue('0x00', 32)
    /** Newer Safe versions index `txHash`. */
    const indexed = (hash: string, address: string = SAFE.toLowerCase(), topic = SUCCESS_TOPIC) => ({
      raw: { address, topics: [topic, hash], data: PAYMENT },
    })
    /** Older Safe versions put `txHash` in the first data word. */
    const unindexed = (hash: string) => ({
      raw: { address: SAFE.toLowerCase(), topics: [SUCCESS_TOPIC], data: concat([hash, PAYMENT]) },
    })
    const response = (transactionInfo: Record<string, unknown> = {}): ITenderlyFullSimulationResponse => ({
      simulation: { id: 'sim' } as any,
      transaction: { status: true, transaction_info: transactionInfo as any },
    })
    const executed = (logs: unknown[]) =>
      response({ logs, call_trace: { from: OWNER_A, to: SAFE, output: zeroPadValue('0x01', 32) } })

    it('is success when the Safe executed under the transaction hash', () => {
      const newer = TenderlySafe.status(executed([indexed(SAFE_TX_HASH)]), ISimulationStatus.SUCCESS, TX)
      const older = TenderlySafe.status(executed([unindexed(SAFE_TX_HASH)]), ISimulationStatus.SUCCESS, TX)

      expect(newer).to.equal(ISimulationStatus.SUCCESS)
      expect(older).to.equal(ISimulationStatus.SUCCESS)
    })

    it('is failed when the run reverted', () => {
      expect(TenderlySafe.status(response(), ISimulationStatus.FAILED, TX)).to.equal(ISimulationStatus.FAILED)
    })

    it('is failed when the Safe caught a failed inner call', () => {
      const logged = response({ logs: [indexed(SAFE_TX_HASH, SAFE.toLowerCase(), FAILURE_TOPIC)] })
      const returnedFalse = response({
        logs: [indexed(SAFE_TX_HASH)],
        call_trace: { from: OWNER_A, to: SAFE, output: ZeroHash },
      })

      expect(TenderlySafe.status(logged, ISimulationStatus.SUCCESS, TX)).to.equal(ISimulationStatus.FAILED)
      expect(TenderlySafe.status(returnedFalse, ISimulationStatus.SUCCESS, TX)).to.equal(ISimulationStatus.FAILED)
    })

    it('ignores an ExecutionFailure emitted by another contract', () => {
      const other = executed([indexed(SAFE_TX_HASH, OWNER_A, FAILURE_TOPIC), indexed(SAFE_TX_HASH)])

      expect(TenderlySafe.status(other, ISimulationStatus.SUCCESS, TX)).to.equal(ISimulationStatus.SUCCESS)
    })

    it('is failed, and logged, when the Safe executed a different payload', () => {
      const error = sandbox.stub(logger, 'error')

      const status = TenderlySafe.status(executed([indexed(`0x${'cd'.repeat(32)}`)]), ISimulationStatus.SUCCESS, TX)

      expect(status).to.equal(ISimulationStatus.FAILED)
      expect(error.calledOnce).to.be.true
    })

    it('is failed when the Safe emitted no execution hash', () => {
      sandbox.stub(logger, 'error')

      expect(TenderlySafe.status(executed([]), ISimulationStatus.SUCCESS, TX)).to.equal(ISimulationStatus.FAILED)
    })

    it('reads the outer execution when the transaction calls back into the Safe', () => {
      const nested = executed([indexed(`0x${'cd'.repeat(32)}`), indexed(SAFE_TX_HASH)])

      expect(TenderlySafe.status(nested, ISimulationStatus.SUCCESS, TX)).to.equal(ISimulationStatus.SUCCESS)
    })
  })

  describe('save', () => {
    it('stores the run on the transaction row', async () => {
      const transaction = await seed()

      await TenderlySafe.save(transaction.id, {
        status: ISimulationStatus.SUCCESS,
        url: 'https://share',
        runAt: 42,
        network: NETWORK,
      })

      const stored = await Models.SafeTransaction.findOne({ id: transaction.id }).lean()
      expect(stored!.simulation).to.deep.equal({ url: 'https://share', runAt: 42, status: ISimulationStatus.SUCCESS })
    })

    it('never replaces a newer stored run with an older one', async () => {
      const transaction = await seed({
        simulation: { url: 'https://newer', runAt: 100, status: ISimulationStatus.FAILED },
      })

      await TenderlySafe.save(transaction.id, {
        status: ISimulationStatus.SUCCESS,
        url: 'https://older',
        runAt: 50,
        network: NETWORK,
      })

      const stored = await Models.SafeTransaction.findOne({ id: transaction.id }).lean()
      expect(stored!.simulation!.url).to.equal('https://newer')
    })

    it('only logs when the row cannot be written', async () => {
      sandbox.stub(Models.SafeTransaction, 'updateOne').rejects(new Error('down'))
      const warn = sandbox.stub(logger, 'warn')

      await TenderlySafe.save('id', { status: ISimulationStatus.SUCCESS, url: 'u', runAt: 1, network: NETWORK })

      expect(warn.calledOnce).to.be.true
    })
  })
})
