import config from '@config'
import { Models } from '@dbModels'
import TenderlyCache from '@modules/tenderly/cache'
import {
  ICrossChainGasStatus,
  ISimulationStatus,
  type ITenderlyActionInput,
  ITenderlyOperation,
  type ITenderlyRequestMap,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const DAO = '0xAbCd000000000000000000000000000000000001'
const FROM = '0x2222222222222222222222222222222222222222'
const TOKEN = '0x3333333333333333333333333333333333333333'
const OTHER = '0x4444444444444444444444444444444444444444'

const input = (changes: Partial<ITenderlyActionInput> = {}): ITenderlyActionInput => ({
  network: NetworksEnum.ethereumMainnet,
  daoAddress: DAO,
  from: FROM,
  actions: [
    { to: TOKEN, value: '100', data: '0xa9059cbb' },
    { to: OTHER, value: '0', data: '0x' },
  ],
  ...changes,
})

const key = (
  changes: Partial<ITenderlyActionInput> = {},
  operation: keyof ITenderlyRequestMap = ITenderlyOperation.pluginActions,
) => TenderlyCache.key(operation, input(changes))

const result = () => ({
  status: ISimulationStatus.SUCCESS,
  url: 'https://share.url',
  runAt: Date.now(),
  network: NetworksEnum.ethereumMainnet,
})

describe('Module: tenderly cache', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('key', () => {
    it('names the version, the operation and a bounded hash', () => {
      expect(key()).to.match(/^cache\|v1\|pluginActions\|[0-9a-f]{64}$/)
    })

    it('does not change with the clock', () => {
      const clock = sandbox.useFakeTimers(Date.UTC(2030, 0, 1))
      const first = key()
      clock.tick(60 * 60 * 1000)

      expect(key()).to.equal(first)
    })

    it('treats case only differences in addresses and calldata as the same input', () => {
      const lower = key({
        daoAddress: DAO.toLowerCase(),
        from: FROM.toLowerCase(),
        actions: [
          { to: TOKEN.toLowerCase(), value: '100', data: '0xA9059CBB' },
          { to: OTHER.toLowerCase(), value: '0', data: '0x' },
        ],
      })

      expect(lower).to.equal(key())
    })

    it('treats an empty value or calldata as zero', () => {
      const sparse = key({
        actions: [
          { to: TOKEN, value: '0x64', data: '0xa9059cbb' },
          { to: OTHER, value: '', data: '' },
        ],
      })

      expect(sparse).to.equal(key())
    })

    it('changes when a value changes', () => {
      const changed = key({
        actions: [
          { to: TOKEN, value: '101', data: '0xa9059cbb' },
          { to: OTHER, value: '0', data: '0x' },
        ],
      })

      expect(changed).to.not.equal(key())
    })

    it('changes when calldata changes', () => {
      const changed = key({
        actions: [
          { to: TOKEN, value: '100', data: '0xa9059cbc' },
          { to: OTHER, value: '0', data: '0x' },
        ],
      })

      expect(changed).to.not.equal(key())
    })

    it('changes when the actions are reordered', () => {
      const reordered = key({
        actions: [
          { to: OTHER, value: '0', data: '0x' },
          { to: TOKEN, value: '100', data: '0xa9059cbb' },
        ],
      })

      expect(reordered).to.not.equal(key())
    })

    it('changes with the caller, the DAO, the network, the proposal and the operation', () => {
      const base = key()

      expect(key({ from: OTHER })).to.not.equal(base)
      expect(key({ daoAddress: OTHER })).to.not.equal(base)
      expect(key({ network: NetworksEnum.polygonMainnet })).to.not.equal(base)
      expect(key({ proposalId: 'proposal-1' })).to.not.equal(base)
      expect(key({}, ITenderlyOperation.directExecute)).to.not.equal(base)
    })

    it('refuses a bad address, odd calldata or a value outside uint256', () => {
      const bad = (actions: ITenderlyActionInput['actions']) => (() => key({ actions }) as any) as () => void

      expect(bad([{ to: '0x123', value: '0', data: '0x' }])).to.throw('badSimulationRequest')
      expect(bad([{ to: TOKEN, value: '0', data: '0xabc' }])).to.throw('badSimulationRequest')
      expect(bad([{ to: TOKEN, value: '-1', data: '0x' }])).to.throw('badSimulationRequest')
      expect(bad([{ to: TOKEN, value: 'ten', data: '0x' }])).to.throw('badSimulationRequest')
    })
  })

  describe('read and write', () => {
    it('gives back a fresh result as it was written', async () => {
      const written = result()
      await TenderlyCache.write(ITenderlyOperation.pluginActions, key(), written, written.runAt)

      const read = await TenderlyCache.read(ITenderlyOperation.pluginActions, key(), Date.now())

      expect(read).to.deep.equal(written)
    })

    it('keeps a short result for the configured ttl and a proposal result for the re-simulation time', async () => {
      const now = Date.now()
      await TenderlyCache.write(ITenderlyOperation.pluginActions, key(), result(), now)
      await TenderlyCache.write(ITenderlyOperation.proposal, key({}, ITenderlyOperation.proposal), result(), now)

      const short = await Models.TenderlyCallCache.findOne({ id: key() })
      const long = await Models.TenderlyCallCache.findOne({ id: key({}, ITenderlyOperation.proposal) })

      expect(short!.expiresAt!.getTime()).to.equal(now + config.TENDERLY.CACHE_TTL)
      expect(short!.purgeAt.getTime()).to.equal(now + config.TENDERLY.CACHE_TTL)
      expect(long!.expiresAt!.getTime()).to.equal(now + config.TENDERLY.RE_SIMULATION_TIME)
    })

    it('misses once the result is past its expiry', async () => {
      const old = Date.now() - config.TENDERLY.CACHE_TTL - 1
      await TenderlyCache.write(ITenderlyOperation.pluginActions, key(), result(), old)

      expect(await TenderlyCache.read(ITenderlyOperation.pluginActions, key(), Date.now())).to.be.null
    })

    it('misses once the result is past its purge time even when the expiry is not', async () => {
      await TenderlyCache.write(ITenderlyOperation.pluginActions, key(), result(), Date.now())
      await Models.TenderlyCallCache.updateOne({ id: key() }, { $set: { purgeAt: new Date(Date.now() - 1) } })

      expect(await TenderlyCache.read(ITenderlyOperation.pluginActions, key(), Date.now())).to.be.null
    })

    it('misses when the result was written for another operation', async () => {
      await TenderlyCache.write(ITenderlyOperation.pluginActions, key(), result(), Date.now())

      expect(await TenderlyCache.read(ITenderlyOperation.directExecute, key(), Date.now())).to.be.null
    })

    it('treats a failed read as a miss', async () => {
      sandbox.stub(Models.TenderlyCallCache, 'readResult').rejects(new Error('down'))

      expect(await TenderlyCache.read(ITenderlyOperation.pluginActions, key(), Date.now())).to.be.null
      expect(await TenderlyCache.readRetained(ITenderlyOperation.crossChainGas, key(), Date.now())).to.be.null
    })

    it('keeps a gas result past its ttl for the stale window and says it is no longer fresh', async () => {
      const gas = { status: ICrossChainGasStatus.SUCCESS, requiredGas: '228100', runAt: Date.now() }
      const old = Date.now() - config.CROSS_CHAIN_GAS.CACHE_TTL - 1
      await TenderlyCache.write(ITenderlyOperation.crossChainGas, 'gas-key', gas, old)

      const doc = await Models.TenderlyCallCache.findOne({ id: 'gas-key' })
      expect(doc!.expiresAt!.getTime()).to.equal(old + config.CROSS_CHAIN_GAS.CACHE_TTL)
      expect(doc!.purgeAt.getTime()).to.equal(
        old + config.CROSS_CHAIN_GAS.CACHE_TTL + config.CROSS_CHAIN_GAS.STALE_WINDOW,
      )
      expect(await TenderlyCache.read(ITenderlyOperation.crossChainGas, 'gas-key', Date.now())).to.be.null
      expect(await TenderlyCache.readRetained(ITenderlyOperation.crossChainGas, 'gas-key', Date.now())).to.deep.equal({
        result: gas,
        fresh: false,
      })
    })

    it('swallows a failed write', async () => {
      sandbox.stub(Models.TenderlyCallCache, 'writeResult').rejects(new Error('down'))

      await TenderlyCache.write(ITenderlyOperation.pluginActions, key(), result(), Date.now())
    })
  })
})
