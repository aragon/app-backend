import { Models } from '@dbModels'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import TenderlyModule from '@modules/tenderly'
import TenderlyDispatch from '@modules/tenderly/dispatch'
import { DaoList } from '@test/mock/fakeDao'
import {
  ErrorKeyEnum,
  IPluginInterfaceType,
  IPluginStatus,
  ISimulationStatus,
  type ITenderlyAssetChange,
  type ITenderlyFullResult,
  ITenderlyOperation,
  type ITenderlyRequest,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const dao = DaoList[1]
const POLICY = '0x1234567890123456789012345678901234567890'
const FROM = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const CODE = '0x608060405234801561001057600080fd5b50'

const request = (
  changes: Partial<ITenderlyRequest<ITenderlyOperation.dispatch>> = {},
): ITenderlyRequest<ITenderlyOperation.dispatch> => ({
  operation: ITenderlyOperation.dispatch,
  policyAddress: POLICY,
  network: NetworksEnum.ethereumMainnet,
  from: FROM,
  sentAt: Date.now(),
  ...changes,
})

const seedPolicy = () =>
  Models.Plugin.create({
    id: 'policy-1',
    address: POLICY,
    daoAddress: dao.address,
    network: NetworksEnum.ethereumMainnet,
    interfaceType: IPluginInterfaceType.unknown,
    status: IPluginStatus.installed,
    isPolicy: true,
    transactionHash: '0xinstall',
    blockNumber: 10,
  })

const tenderlyResult = (changes: Partial<ITenderlyFullResult> = {}): ITenderlyFullResult => ({
  status: ISimulationStatus.SUCCESS,
  shareUrl: 'https://tenderly.co/simulation/abc123',
  assetChanges: [],
  balanceChanges: [],
  contracts: [],
  ...changes,
})

const transfer = (from: string, to: string): ITenderlyAssetChange => ({
  type: 'Transfer',
  from,
  to,
  amount: '100',
  raw_amount: '100000000',
  token_info: {
    standard: 'ERC20',
    type: 'Fungible',
    contract_address: USDC,
    symbol: 'USDC',
    name: 'USDC',
    decimals: 6,
  },
})

describe('Module: tenderly/dispatch/dispatchSimulationService', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
    await Models.Dao.create(dao)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('load', () => {
    it('answers 400 when the policy is not installed', async () => {
      const thrown: any = await TenderlyDispatch.load(request()).catch(error => error)

      expect(thrown.message).to.equal(ErrorKeyEnum.badSimulationRequest)
      expect(thrown.status).to.equal(400)
      expect(thrown.description).to.equal('Policy not found or not installed')
    })

    it('answers 400 when the DAO of the policy is not indexed', async () => {
      await Models.Dao.deleteMany({})
      await seedPolicy()

      const thrown: any = await TenderlyDispatch.load(request()).catch(error => error)

      expect(thrown.message).to.equal(ErrorKeyEnum.badSimulationRequest)
      expect(thrown.status).to.equal(400)
      expect(thrown.description).to.equal('DAO not found')
    })

    it('builds the policy call with the default selector and the supplied caller', async () => {
      await seedPolicy()

      const loaded = await TenderlyDispatch.load(request())

      expect(loaded.input).to.deep.equal({
        network: NetworksEnum.ethereumMainnet,
        daoAddress: dao.address,
        from: FROM,
        actions: [{ to: POLICY, data: '0xc6c4df0c', value: '0' }],
      })
      expect(loaded.dao.address).to.equal(dao.address)
      expect(loaded.dao.name).to.equal(dao.name)
    })

    it('keeps the supplied calldata', async () => {
      await seedPolicy()

      const loaded = await TenderlyDispatch.load(request({ data: '0xc0ffee' }))

      expect(loaded.input.actions[0].data).to.equal('0xc0ffee')
    })
  })

  describe('simulate', () => {
    let simulateFull: sinon.SinonStub
    let getCode: sinon.SinonStub
    let loaded: Awaited<ReturnType<typeof TenderlyDispatch.load>>
    const deadlineAt = () => Date.now() + 30_000

    beforeEach(async () => {
      await seedPolicy()
      loaded = await TenderlyDispatch.load(request())
      simulateFull = sandbox.stub(TenderlyModule, 'simulateFull').resolves(tenderlyResult())
      getCode = sinon.stub().resolves(CODE)
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getCode } as any)
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => Promise<any>) => fn() } as any)
    })

    it('sends the policy call and charges the DAO of the policy', async () => {
      const at = deadlineAt()

      await TenderlyDispatch.simulate(loaded, at)

      expect(simulateFull.calledOnce).to.be.true
      const [simulation, network, context] = simulateFull.firstCall.args
      expect(simulation).to.deep.equal({ to: POLICY, data: '0xc6c4df0c', value: '0', from: FROM })
      expect(network).to.equal(NetworksEnum.ethereumMainnet)
      expect(context).to.deep.equal({
        operation: ITenderlyOperation.dispatch,
        network: NetworksEnum.ethereumMainnet,
        daoAddress: dao.address,
        deadlineAt: at,
      })
    })

    it('returns an empty summary when nothing moved', async () => {
      const summary = await TenderlyDispatch.simulate(loaded, deadlineAt())

      expect(summary).to.deep.equal({
        status: 'success',
        tenderlyUrl: 'https://tenderly.co/simulation/abc123',
        summaryGroups: [],
      })
    })

    it('returns a failed summary with the revert reason instead of throwing', async () => {
      simulateFull.resolves(tenderlyResult({ status: ISimulationStatus.FAILED, error: 'execution reverted' }))

      const summary = await TenderlyDispatch.simulate(loaded, deadlineAt())

      expect(summary).to.deep.equal({
        status: 'failed',
        error: 'execution reverted',
        tenderlyUrl: 'https://tenderly.co/simulation/abc123',
        summaryGroups: [],
      })
    })

    it('groups the DAO side and the external side of a transfer', async () => {
      const external = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
      simulateFull.resolves(tenderlyResult({ assetChanges: [transfer(dao.address, external)] }))
      getCode.resolves('0x')

      const summary = await TenderlyDispatch.simulate(loaded, deadlineAt())

      expect(summary.status).to.equal('success')
      expect(summary.summaryGroups.map(group => group.kind)).to.deep.equal(['dao', 'external'])
      const [daoGroup, externalGroup] = summary.summaryGroups
      expect(daoGroup.items[0].label).to.equal(dao.name)
      expect(daoGroup.items[0].tokens[0].amount).to.equal('-100.0')
      expect(externalGroup.items[0].tokens[0].amount).to.equal('100.0')
    })

    it('labels a contract that Tenderly listed', async () => {
      const pool = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'
      simulateFull.resolves(
        tenderlyResult({
          contracts: [{ address: pool, contract_name: 'UniswapV3Pool' }],
          assetChanges: [transfer(dao.address, pool)],
        }),
      )

      const summary = await TenderlyDispatch.simulate(loaded, deadlineAt())

      const item = summary.summaryGroups.find(group => group.kind === 'external')!.items[0]
      expect(item).to.include({ address: pool.toLowerCase(), label: 'UniswapV3Pool', role: 'contract' })
      expect(getCode.called).to.be.false
    })

    it('marks an address as a contract when the chain has code for it', async () => {
      const unknown = '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'
      simulateFull.resolves(tenderlyResult({ assetChanges: [transfer(dao.address, unknown)] }))

      const summary = await TenderlyDispatch.simulate(loaded, deadlineAt())

      const item = summary.summaryGroups.find(group => group.kind === 'external')!.items[0]
      expect(item).to.include({ address: unknown.toLowerCase(), role: 'contract', isKnown: false })
    })

    it('keeps an address a wallet when the chain has no code for it', async () => {
      const unknown = '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'
      simulateFull.resolves(tenderlyResult({ assetChanges: [transfer(dao.address, unknown)] }))
      getCode.resolves('0x')

      const summary = await TenderlyDispatch.simulate(loaded, deadlineAt())

      const item = summary.summaryGroups.find(group => group.kind === 'external')!.items[0]
      expect(item.role).to.equal('wallet')
    })

    it('keeps an address a wallet when the chain read fails', async () => {
      sandbox.stub(logger, 'debug')
      const unknown = '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'
      simulateFull.resolves(tenderlyResult({ assetChanges: [transfer(dao.address, unknown)] }))
      getCode.rejects(new Error('RPC error'))

      const summary = await TenderlyDispatch.simulate(loaded, deadlineAt())

      const item = summary.summaryGroups.find(group => group.kind === 'external')!.items[0]
      expect(item.role).to.equal('wallet')
    })

    it('returns the summary without asking the chain when no provider is set', async () => {
      ;(ProviderModule.getAnyRpcProvider as sinon.SinonStub).returns(null)
      const unknown = '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'
      simulateFull.resolves(tenderlyResult({ assetChanges: [transfer(dao.address, unknown)] }))

      const summary = await TenderlyDispatch.simulate(loaded, deadlineAt())

      expect(summary.status).to.equal('success')
      expect(getCode.called).to.be.false
    })

    it('asks the chain about at most 50 distinct addresses', async () => {
      const address = (i: number) => `0x${i.toString(16).padStart(40, '0')}`
      const assetChanges: ITenderlyAssetChange[] = []
      for (let i = 1; i <= 60; i += 2) {
        assetChanges.push(transfer(address(i), address(i + 1)))
      }
      assetChanges.push(assetChanges[0], assetChanges[1])
      simulateFull.resolves(tenderlyResult({ assetChanges }))

      await TenderlyDispatch.simulate(loaded, deadlineAt())

      expect(getCode.callCount).to.equal(50)
    })
  })
})
