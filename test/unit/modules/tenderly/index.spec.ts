import config from '@config'
import { Models } from '@dbModels'
import { throwExposable } from '@errors'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import DbTx from '@modules/dbTx'
import ProviderModule from '@modules/provider'
import TenderlyModule from '@modules/tenderly'
import TenderlyProposal from '@modules/tenderly/proposal'
import TenderlyTransport from '@modules/tenderly/transport'
import { DaoList } from '@test/mock/fakeDao'
import { ProposalList } from '@test/mock/fakeProposal'
import {
  ErrorKeyEnum,
  IPluginInterfaceType,
  IPluginStatus,
  ISimulationStatus,
  ITenderlyCallCacheKind,
  ITenderlyOperation,
  type ITenderlyRequest,
  type ITenderlySendContext,
  NetworksEnum,
} from '@types'
import axios from 'axios'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const DAO = '0x1111111111111111111111111111111111111111'
const PLUGIN = '0x2222222222222222222222222222222222222222'

const simulation = { to: DAO, data: '0xabcdef', from: PLUGIN }

const exposable = (key: ErrorKeyEnum) => {
  try {
    throwExposable(key)
  } catch (error) {
    return error
  }
}

const context = (): ITenderlySendContext => ({
  operation: ITenderlyOperation.pluginActions,
  network: NetworksEnum.ethereumMainnet,
  daoAddress: DAO,
  deadlineAt: Date.now() + 30_000,
})

describe('Module: tenderly', () => {
  let sandbox: SinonSandbox
  let send: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(ProviderModule, 'getChainId').returns(1)
    sandbox.stub(TenderlyTransport, 'share').resolves('https://share.url')
    send = sandbox.stub(TenderlyTransport, 'simulate')
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('simulate', () => {
    it('sends the DAO execute call with the context it was given', async () => {
      send.resolves({ simulation: { id: 'sim-1' }, transaction: { status: true } })
      const ctx = context()

      await TenderlyModule.simulate(simulation, NetworksEnum.ethereumMainnet, ctx)

      expect(send.firstCall.args[0]).to.deep.equal({
        network_id: '1',
        from: PLUGIN,
        input: '0xabcdef',
        to: DAO,
        gas: 8000000,
        gas_price: '0',
        value: '0',
        save: true,
        save_if_fails: true,
      })
      expect(send.firstCall.args[1]).to.equal(ctx)
    })

    it('reports success with the share link and the run time', async () => {
      send.resolves({ simulation: { id: 'sim-1' }, transaction: { status: true } })

      const result = await TenderlyModule.simulate(simulation, NetworksEnum.ethereumMainnet, context())

      expect(result.status).to.equal(ISimulationStatus.SUCCESS)
      expect(result.url).to.equal('https://share.url')
      expect(result.runAt).to.be.a('number')
    })

    it('marks the simulation failed when the transaction reverted', async () => {
      send.resolves({ simulation: { id: 'sim-1' }, transaction: { status: false } })

      const result = await TenderlyModule.simulate(simulation, NetworksEnum.ethereumMainnet, context())

      expect(result.status).to.equal(ISimulationStatus.FAILED)
    })

    it('marks the simulation failed when the provider reports an error message', async () => {
      send.resolves({
        simulation: { id: 'sim-1' },
        transaction: { status: true, error_info: { error_message: 'execution reverted' } },
      })

      const result = await TenderlyModule.simulate(simulation, NetworksEnum.ethereumMainnet, context())

      expect(result.status).to.equal(ISimulationStatus.FAILED)
    })
  })

  describe('simulateFull', () => {
    it('marks the simulation failed when the transaction reverted without an error message', async () => {
      send.resolves({ simulation: { id: 'sim-1' }, transaction: { status: false } })

      const result = await TenderlyModule.simulateFull(simulation, NetworksEnum.ethereumMainnet, context())

      expect(result).to.deep.include({
        shareUrl: 'https://share.url',
        status: ISimulationStatus.FAILED,
        error: undefined,
      })
    })

    it('returns the asset changes and contracts when the transaction went through', async () => {
      send.resolves({
        simulation: { id: 'sim-1' },
        transaction: { status: true, transaction_info: { asset_changes: [{ type: 'Transfer' }], balance_changes: [] } },
        contracts: [{ address: DAO }],
      })

      const result = await TenderlyModule.simulateFull(simulation, NetworksEnum.ethereumMainnet, context())

      expect(result.status).to.equal(ISimulationStatus.SUCCESS)
      expect(result.assetChanges).to.deep.equal([{ type: 'Transfer' }])
      expect(result.contracts).to.deep.equal([{ address: DAO }])
    })
  })

  describe('run', () => {
    const ok = { simulation: { id: 'sim-1' }, transaction: { status: true } }
    const actions = [
      { to: '0x3333333333333333333333333333333333333333', value: '100', data: '0xabcdef12' },
      { to: '0x4444444444444444444444444444444444444444', value: '0', data: '0x' },
    ]
    const raw = ProposalList[1] as any
    let proposalId: string

    const pluginRequest = (changes: Partial<ITenderlyRequest<ITenderlyOperation.pluginActions>> = {}) =>
      TenderlyModule.run({
        operation: ITenderlyOperation.pluginActions,
        pluginAddress: PLUGIN,
        network: NetworksEnum.ethereumMainnet,
        actions,
        sentAt: Date.now(),
        ...changes,
      })

    const proposalRequest = () =>
      TenderlyModule.run({ operation: ITenderlyOperation.proposal, proposalId, sentAt: Date.now() })

    const seedProposal = (simulation?: Record<string, unknown>) =>
      Models.Proposal.create({ ...raw, id: proposalId, ...(simulation ? { simulation } : {}) })

    const cacheRows = () => Models.TenderlyCallCache.countDocuments({ kind: ITenderlyCallCacheKind.cache })

    beforeEach(async () => {
      send.resolves(ok)
      proposalId = Models.Proposal.getEntityId({
        transactionHash: raw.transactionHash,
        pluginAddress: raw.pluginAddress,
        proposalIndex: raw.proposalIndex,
      })
      await Models.Plugin.create({
        id: 'plugin-1',
        address: PLUGIN,
        daoAddress: DAO,
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.multisig,
        status: IPluginStatus.installed,
        isSupported: true,
        transactionHash: '0xgrant',
        blockNumber: 10,
      })
    })

    it('pays once and gives the second identical request the original run time', async () => {
      const first = await pluginRequest()
      const second = await pluginRequest()

      expect(send.calledOnce).to.be.true
      expect(second).to.deep.equal(first)
      expect(second.runAt).to.equal(first.runAt)
      expect(second.network).to.equal(NetworksEnum.ethereumMainnet)
      expect(await cacheRows()).to.equal(1)
    })

    it('charges the budget to the DAO of the plugin and simulates from the plugin', async () => {
      await pluginRequest()

      expect(send.firstCall.args[0]).to.include({ from: PLUGIN, to: DAO })
      expect(send.firstCall.args[1]).to.include({ operation: ITenderlyOperation.pluginActions, daoAddress: DAO })
    })

    it('charges a direct execute to the indexed DAO, never to the supplied caller', async () => {
      const dao = DaoList[1]
      await Models.Dao.create(dao)
      const from = '0x5555555555555555555555555555555555555555'

      await TenderlyModule.run({
        operation: ITenderlyOperation.directExecute,
        daoAddress: dao.address,
        from,
        network: NetworksEnum.ethereumMainnet,
        actions,
        sentAt: Date.now(),
      })

      expect(send.firstCall.args[0]).to.include({ from, to: dao.address })
      expect(send.firstCall.args[1]).to.include({
        operation: ITenderlyOperation.directExecute,
        daoAddress: dao.address,
      })
    })

    it('runs two identical requests that arrive together as one simulation', async () => {
      send.callsFake(() => new Promise(resolve => setImmediate(() => resolve(ok))))

      const [first, second] = await Promise.all([pluginRequest(), pluginRequest()])

      expect(send.calledOnce).to.be.true
      expect(second).to.deep.equal(first)
    })

    it('pays again when an action changes', async () => {
      await pluginRequest()
      await pluginRequest({ actions: [{ ...actions[0], value: '101' }, actions[1]] })

      expect(send.calledTwice).to.be.true
    })

    it('does not block the next request after a failed one', async () => {
      send.onFirstCall().rejects(exposable(ErrorKeyEnum.simulationFailed))
      send.onSecondCall().resolves(ok)

      const failed: any = await pluginRequest().catch(error => error)
      const result = await pluginRequest()

      expect(failed.message).to.equal(ErrorKeyEnum.simulationFailed)
      expect(result.status).to.equal(ISimulationStatus.SUCCESS)
      expect(send.calledTwice).to.be.true
    })

    it('never keeps a provider failure or a refusal', async () => {
      send.onFirstCall().rejects(exposable(ErrorKeyEnum.simulationFailed))
      send.onSecondCall().rejects(exposable(ErrorKeyEnum.tooBusy))

      await pluginRequest().catch(() => null)
      await pluginRequest().catch(() => null)

      expect(await cacheRows()).to.equal(0)
    })

    it('keeps a completed revert and reuses it', async () => {
      send.resolves({ simulation: { id: 'sim-1' }, transaction: { status: false } })

      const first = await pluginRequest()
      const second = await pluginRequest()

      expect(first.status).to.equal(ISimulationStatus.FAILED)
      expect(second).to.deep.equal(first)
      expect(send.calledOnce).to.be.true
    })

    it('simulates when the cache cannot be read', async () => {
      sandbox.stub(Models.TenderlyCallCache, 'readResult').rejects(new Error('down'))

      const result = await pluginRequest()

      expect(result.status).to.equal(ISimulationStatus.SUCCESS)
      expect(send.calledOnce).to.be.true
    })

    it('returns the result when the cache cannot be written', async () => {
      sandbox.stub(Models.TenderlyCallCache, 'writeResult').rejects(new Error('down'))

      const result = await pluginRequest()

      expect(result.status).to.equal(ISimulationStatus.SUCCESS)
      expect(send.calledOnce).to.be.true
    })

    it('pays again once the kept result is past its expiry', async () => {
      await pluginRequest()
      await Models.TenderlyCallCache.updateMany(
        { kind: ITenderlyCallCacheKind.cache },
        { $set: { expiresAt: new Date(Date.now() - 1) } },
      )

      await pluginRequest()

      expect(send.calledTwice).to.be.true
    })

    it('answers 503 and pays nothing when the request is already past its deadline', async () => {
      const thrown: any = await pluginRequest({ sentAt: Date.now() - 60_000 }).catch(error => error)

      expect(thrown.message).to.equal(ErrorKeyEnum.tooBusy)
      expect(send.called).to.be.false
    })

    it('stores a proposal result on the proposal with the hash of its input', async () => {
      const proposal = await seedProposal()

      const result = await proposalRequest()

      const stored = (await Models.Proposal.findByEntityId(proposalId))!
      expect(stored.simulation).to.deep.include({
        inputHash: TenderlyProposal.inputHash(proposal),
        url: result.url,
        runAt: result.runAt,
        status: ISimulationStatus.SUCCESS,
      })
      expect(send.firstCall.args[1]).to.include({ operation: ITenderlyOperation.proposal, daoAddress: raw.daoAddress })
    })

    it('pays again for a legacy result that has no input hash', async () => {
      await seedProposal({ url: 'https://old', runAt: Date.now(), status: ISimulationStatus.SUCCESS })

      const result = await proposalRequest()

      expect(send.calledOnce).to.be.true
      expect(result.url).to.equal('https://share.url')
      const stored = (await Models.Proposal.findByEntityId(proposalId))!
      expect(stored.simulation!.inputHash).to.be.a('string')
    })

    it('returns a fresh result from the proposal row without paying or saving', async () => {
      const proposal = await seedProposal()
      const inputHash = TenderlyProposal.inputHash(proposal)
      const runAt = Date.now() - 1000
      await Models.Proposal.updateOne(
        { id: proposalId },
        { $set: { simulation: { inputHash, url: 'https://old', runAt, status: ISimulationStatus.SUCCESS } } },
      )
      const save = sandbox.spy(DbTx, 'executeTxFn')

      const result = await proposalRequest()

      expect(result).to.deep.equal({
        status: ISimulationStatus.SUCCESS,
        url: 'https://old',
        runAt,
        network: raw.network,
      })
      expect(send.called).to.be.false
      expect(save.called).to.be.false
    })

    it('answers 503 and keeps the old result when the actions changed during the simulation', async () => {
      await seedProposal({ url: 'https://old', runAt: 1, status: ISimulationStatus.FAILED })
      send.callsFake(async () => {
        await Models.Proposal.updateOne({ id: proposalId }, { $set: { 'rawActions.0.value': '1' } })
        return ok
      })

      const thrown: any = await proposalRequest().catch(error => error)

      expect(thrown.message).to.equal(ErrorKeyEnum.tooBusy)
      expect(thrown.status).to.equal(503)
      const stored = (await Models.Proposal.findByEntityId(proposalId))!
      expect(stored.simulation).to.deep.include({ url: 'https://old', runAt: 1, status: ISimulationStatus.FAILED })
      expect(await cacheRows()).to.equal(0)
    })

    it('answers 503 and saves nothing when the freshness read fails after the simulation', async () => {
      await seedProposal()
      const real = Models.Proposal.findByEntityId.bind(Models.Proposal)
      const find = sandbox.stub(Models.Proposal, 'findByEntityId')
      find.onFirstCall().callsFake(real)
      find.onSecondCall().rejects(new Error('down'))

      const thrown: any = await proposalRequest().catch(error => error)

      expect(thrown.message).to.equal(ErrorKeyEnum.tooBusy)
      expect(send.calledOnce).to.be.true
      find.restore()
      const stored = (await Models.Proposal.findByEntityId(proposalId))!
      expect(stored.simulation?.runAt ?? null).to.be.null
      expect(await cacheRows()).to.equal(0)
    })
  })

  describe('run dispatch', () => {
    const dao = DaoList[1]
    const POLICY = '0x1234567890123456789012345678901234567890'
    const FROM = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const ok = { simulation: { id: 'sim-1' }, transaction: { status: true } }

    const dispatchRequest = (changes: Partial<ITenderlyRequest<ITenderlyOperation.dispatch>> = {}) =>
      TenderlyModule.run({
        operation: ITenderlyOperation.dispatch,
        policyAddress: POLICY,
        network: NetworksEnum.ethereumMainnet,
        from: FROM,
        sentAt: Date.now(),
        ...changes,
      })

    beforeEach(async () => {
      send.resolves(ok)
      sandbox.stub(logger, 'warn')
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(null)
      await Models.Dao.create(dao)
      await Models.Plugin.create({
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
    })

    it('pays once and gives the second identical request the same summary', async () => {
      const first = await dispatchRequest()
      const second = await dispatchRequest()

      expect(send.calledOnce).to.be.true
      expect(first).to.deep.equal({ status: 'success', tenderlyUrl: 'https://share.url', summaryGroups: [] })
      expect(second).to.deep.equal(first)
      expect(await Models.TenderlyCallCache.countDocuments({ operation: ITenderlyOperation.dispatch })).to.equal(1)
    })

    it('charges the dispatch to the DAO of the policy, never to the caller', async () => {
      await dispatchRequest()

      expect(send.firstCall.args[0]).to.include({
        from: FROM,
        to: POLICY,
        input: '0xc6c4df0c',
        simulation_type: 'full',
      })
      expect(send.firstCall.args[1]).to.include({ operation: ITenderlyOperation.dispatch, daoAddress: dao.address })
    })

    it('keeps a failed summary and reuses it', async () => {
      send.resolves({
        simulation: { id: 'sim-1' },
        transaction: { status: false, error_info: { error_message: 'execution reverted' } },
      })

      const first = await dispatchRequest()
      const second = await dispatchRequest()

      expect(first).to.deep.include({ status: 'failed', error: 'execution reverted' })
      expect(second).to.deep.equal(first)
      expect(send.calledOnce).to.be.true
    })

    it('pays again when the caller changes', async () => {
      await dispatchRequest()
      await dispatchRequest({ from: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' })

      expect(send.calledTwice).to.be.true
    })

    it('treats the default selector and no calldata as the same request', async () => {
      await dispatchRequest()
      await dispatchRequest({ data: '0xc6c4df0c' })

      expect(send.calledOnce).to.be.true
    })

    it('pays again when the calldata changes', async () => {
      await dispatchRequest()
      await dispatchRequest({ data: '0xc0ffee' })

      expect(send.calledTwice).to.be.true
    })

    it('keeps the summary with the fallback link when sharing fails', async () => {
      ;(TenderlyTransport.share as sinon.SinonStub).restore()
      sandbox.stub(config.TENDERLY, 'MIN_TIME').value(0)
      BottleneckModule.tenderlyLimiter = null
      sandbox.stub(axios, 'post').rejects(new Error('down'))

      const summary = await dispatchRequest()

      BottleneckModule.tenderlyLimiter = null
      expect(summary).to.deep.equal({
        status: 'success',
        tenderlyUrl: `${config.TENDERLY.SHARING_BASE_URL}/shared/simulation/sim-1`,
        summaryGroups: [],
      })
    })
  })
})
