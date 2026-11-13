import SimulationController from '@api/controllers/simulation'
import SimulationQueue from '@api/controllers/simulationQueue'
import { Models } from '@dbModels'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import TenderlyProposal from '@modules/tenderly/proposal'
import { ProposalList } from '@test/mock/fakeProposal'
import { type HexAddress, ISafeTransactionState, ISimulationStatus, ITenderlyOperation, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const PLUGIN = '0x3333333333333333333333333333333333333333'
const DAO = '0x4444444444444444444444444444444444444444'
const FROM = '0x5555555555555555555555555555555555555555'
const actions = [{ data: '0xabcdef1234567890', value: '100', to: '0x1111111111111111111111111111111111111111' }]

const result = {
  status: ISimulationStatus.SUCCESS,
  url: 'https://tenderly.co/simulation/123',
  runAt: 1234567890,
  network: NetworksEnum.ethereumMainnet,
}

describe('Controller: Simulation', () => {
  let sandbox: SinonSandbox
  let request: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    request = sandbox.stub(SimulationQueue, 'request').resolves(result)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('simulate', () => {
    it('queues a plugin actions request with a server side sent time', async () => {
      const before = Date.now()

      const answer = await SimulationController.simulate(PLUGIN, actions, NetworksEnum.ethereumMainnet)

      expect(answer).to.equal(result)
      expect(request.firstCall.args[0]).to.include({
        operation: ITenderlyOperation.pluginActions,
        pluginAddress: PLUGIN,
        network: NetworksEnum.ethereumMainnet,
      })
      expect(request.firstCall.args[0].actions).to.equal(actions)
      expect(request.firstCall.args[0].sentAt).to.be.at.least(before)
    })
  })

  describe('simulateDirectExecute', () => {
    it('queues a direct execute request with the DAO and the caller', async () => {
      await SimulationController.simulateDirectExecute(DAO, FROM, actions, NetworksEnum.ethereumMainnet)

      expect(request.firstCall.args[0]).to.include({
        operation: ITenderlyOperation.directExecute,
        daoAddress: DAO,
        from: FROM,
        network: NetworksEnum.ethereumMainnet,
      })
      expect(request.firstCall.args[0].sentAt).to.be.a('number')
    })
  })

  describe('simulateProposal', () => {
    it('queues a proposal request with only the id', async () => {
      await SimulationController.simulateProposal('proposal-123')

      const sent = request.firstCall.args[0]
      expect(sent).to.include({ operation: ITenderlyOperation.proposal, proposalId: 'proposal-123' })
      expect(Object.keys(sent).sort()).to.deep.equal(['operation', 'proposalId', 'sentAt'])
    })
  })

  describe('getSimulationResultOfProposal', () => {
    const raw = ProposalList[1] as any
    let id: string

    beforeEach(() => {
      id = Models.Proposal.getEntityId({
        transactionHash: raw.transactionHash,
        pluginAddress: raw.pluginAddress,
        proposalIndex: raw.proposalIndex,
      })
    })

    const seed = async (simulation: Record<string, unknown>) => {
      const proposal = await Models.Proposal.create({ ...raw, id, simulation })
      return TenderlyProposal.inputHash(proposal)
    }

    it('returns a legacy result that has no input hash without the match flag', async () => {
      await seed({ url: 'https://tenderly.co/simulation/789', runAt: 1700000000000, status: ISimulationStatus.SUCCESS })

      const answer = await SimulationController.getSimulationResultOfProposal(id)

      expect(answer).to.deep.equal({
        url: 'https://tenderly.co/simulation/789',
        status: ISimulationStatus.SUCCESS,
        runAt: 1700000000000,
      })
    })

    it('answers 404 when the saved result has no url', async () => {
      const proposal = await Models.Proposal.create({ ...raw, id })
      const inputHash = TenderlyProposal.inputHash(proposal)
      await Models.Proposal.updateOne(
        { id },
        { $set: { simulation: { inputHash, runAt: 1700000000000, status: ISimulationStatus.FAILED } } },
      )

      const thrown: any = await SimulationController.getSimulationResultOfProposal(id).catch(error => error)

      expect(thrown.message).to.equal('notFound')
      expect(thrown.status).to.equal(404)
    })

    it('marks the run stale after an edit', async () => {
      const inputHash = await seed({
        url: 'https://tenderly.co/simulation/789',
        runAt: 1700000000000,
        status: ISimulationStatus.SUCCESS,
      })
      await Models.Proposal.updateOne(
        { id },
        { $set: { 'simulation.inputHash': inputHash, 'rawActions.0.value': '1' } },
      )

      const answer = await SimulationController.getSimulationResultOfProposal(id)

      expect(answer).to.deep.equal({
        url: 'https://tenderly.co/simulation/789',
        status: ISimulationStatus.SUCCESS,
        runAt: 1700000000000,
        matchesCurrentActions: false,
      })
    })

    it('answers 404 when the proposal was never simulated', async () => {
      await Models.Proposal.create({ ...raw, id })

      const thrown: any = await SimulationController.getSimulationResultOfProposal(id).catch(error => error)

      expect(thrown.message).to.equal('notFound')
    })

    it('answers 404 when the proposal does not exist', async () => {
      const thrown: any = await SimulationController.getSimulationResultOfProposal('missing').catch(error => error)

      expect(thrown.message).to.equal('notFound')
    })
  })

  describe('safe transaction', () => {
    const SAFE = '0x6666666666666666666666666666666666666666' as HexAddress
    const SAFE_TX_HASH = `0x${'ab'.repeat(32)}`
    const network = NetworksEnum.ethereumMainnet

    const seed = (simulation?: Record<string, unknown>) =>
      Models.SafeTransaction.create({
        id: Models.SafeTransaction.buildId(network, SAFE, SAFE_TX_HASH),
        network,
        safeAddress: SAFE,
        safeTxHash: SAFE_TX_HASH,
        nonce: '1',
        state: ISafeTransactionState.live,
        to: SAFE,
        refreshedAt: new Date(),
        ...(simulation ? { simulation } : {}),
      })

    it('queues a run for a tracked Safe with no calldata', async () => {
      sandbox.stub(SafeBodyMembersModule, 'assertTracked').resolves()

      await SimulationController.simulateSafeTransaction(network, SAFE, SAFE_TX_HASH)

      expect(request.firstCall.args[0]).to.include({
        operation: ITenderlyOperation.safeTransaction,
        network,
        safeAddress: SAFE,
        safeTxHash: SAFE_TX_HASH,
      })
      expect(request.firstCall.args[0]).to.not.have.any.keys('data', 'actions')
    })

    it('answers 404 for a Safe it does not track, before queueing', async () => {
      const thrown: any = await SimulationController.simulateSafeTransaction(network, SAFE, SAFE_TX_HASH).catch(
        error => error,
      )

      expect(thrown.message).to.equal('notFound')
      expect(thrown.status).to.equal(404)
      expect(request.called).to.be.false
    })

    it('returns the last stored run', async () => {
      sandbox.stub(SafeBodyMembersModule, 'assertTracked').resolves()
      await seed({ url: 'https://share', runAt: 1700000000000, status: ISimulationStatus.FAILED })

      const answer = await SimulationController.getSimulationResultOfSafeTransaction(network, SAFE, SAFE_TX_HASH)

      expect(answer).to.deep.equal({ url: 'https://share', runAt: 1700000000000, status: ISimulationStatus.FAILED })
    })

    it('answers 404 for a run kept on a transaction that is no longer pending', async () => {
      sandbox.stub(SafeBodyMembersModule, 'assertTracked').resolves()
      const row = await seed({ url: 'https://share', runAt: 1700000000000, status: ISimulationStatus.SUCCESS })
      await Models.SafeTransaction.updateOne({ id: row.id }, { $set: { state: ISafeTransactionState.superseded } })

      const thrown: any = await SimulationController.getSimulationResultOfSafeTransaction(
        network,
        SAFE,
        SAFE_TX_HASH,
      ).catch(error => error)

      expect(thrown.status).to.equal(404)
    })

    it('answers 404 when the transaction was never simulated or is unknown', async () => {
      sandbox.stub(SafeBodyMembersModule, 'assertTracked').resolves()
      await seed()

      const never: any = await SimulationController.getSimulationResultOfSafeTransaction(
        network,
        SAFE,
        SAFE_TX_HASH,
      ).catch(error => error)
      const unknown: any = await SimulationController.getSimulationResultOfSafeTransaction(
        network,
        SAFE,
        `0x${'cd'.repeat(32)}`,
      ).catch(error => error)

      expect(never.status).to.equal(404)
      expect(unknown.status).to.equal(404)
    })
  })
})
