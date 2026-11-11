import SimulationController from '@api/controllers/simulation'
import SimulationQueue from '@api/controllers/simulationQueue'
import { Models } from '@dbModels'
import TenderlyProposal from '@modules/tenderly/proposal'
import { ProposalList } from '@test/mock/fakeProposal'
import { ISimulationStatus, ITenderlyOperation, NetworksEnum } from '@types'
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
})
