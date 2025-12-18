import config from '@config'
import { Models } from '@dbModels'
import DbOperations from '@models/utils/dbOperations'
import TenderlyModule from '@modules/tenderly'
import SimulationController from '@services/aragon-api/controllers/simulation'
import { IPluginStatus, ISimulationStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Controller: Simulation', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('validateAction', () => {
    it('should return plugin when valid plugin exists', async () => {
      const mockPlugin = {
        address: '0x1234567890123456789012345678901234567890',
        status: IPluginStatus.installed,
        network: NetworksEnum.ethereumMainnet,
        isSupported: true,
        daoAddress: '0x0987654321098765432109876543210987654321',
      }

      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPlugin)

      const result = await SimulationController.validateAction(
        '0x1234567890123456789012345678901234567890',
        NetworksEnum.ethereumMainnet,
      )
      expect(result).to.equal(mockPlugin)
    })

    it('should throw error when plugin not found', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(null)

      await expect(
        SimulationController.validateAction('0x1234567890123456789012345678901234567890', NetworksEnum.ethereumMainnet),
      ).to.be.rejectedWith('badSimulationRequest')
    })

    it('should throw error when plugin not installed', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(null)

      await expect(
        SimulationController.validateAction('0x1234567890123456789012345678901234567890', NetworksEnum.ethereumMainnet),
      ).to.be.rejectedWith('badSimulationRequest')
    })
  })

  describe('simulate', () => {
    const mockActions = [
      { data: '0xabcdef1234567890', value: '100', to: '0x1111111111111111111111111111111111111111' },
      { data: '0x9876543210fedcba', value: '0', to: '0x2222222222222222222222222222222222222222' },
    ]

    const mockPlugin = {
      address: '0x3333333333333333333333333333333333333333',
      daoAddress: '0x4444444444444444444444444444444444444444',
      status: IPluginStatus.installed,
      network: NetworksEnum.ethereumMainnet,
      isSupported: true,
    }

    it('should successfully run simulation', async () => {
      sandbox.stub(SimulationController, 'validateAction').resolves(mockPlugin)
      sandbox.stub(TenderlyModule, 'simulate').resolves({
        url: 'https://tenderly.co/simulation/123',
        runAt: 1234567890,
        status: ISimulationStatus.SUCCESS,
      })

      const result = await SimulationController.simulate(
        '0x3333333333333333333333333333333333333333',
        mockActions,
        NetworksEnum.ethereumMainnet,
      )

      expect(result).to.deep.equal({
        status: ISimulationStatus.SUCCESS,
        url: 'https://tenderly.co/simulation/123',
        runAt: 1234567890,
        network: NetworksEnum.ethereumMainnet,
      })
    })

    it('should throw error when simulation not implemented', async () => {
      sandbox.stub(SimulationController, 'validateAction').resolves(mockPlugin)
      sandbox.stub(TenderlyModule, 'simulate').resolves(false)

      await expect(
        SimulationController.simulate(
          '0x3333333333333333333333333333333333333333',
          mockActions,
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.rejectedWith('badSimulationRequest')
    })

    it('should format actions correctly', async () => {
      sandbox.stub(SimulationController, 'validateAction').resolves(mockPlugin)
      const simulateStub = sandbox.stub(TenderlyModule, 'simulate').resolves({
        url: 'https://tenderly.co/simulation/123',
        runAt: 1234567890,
        status: ISimulationStatus.SUCCESS,
      })

      await SimulationController.simulate(
        '0x3333333333333333333333333333333333333333',
        mockActions,
        NetworksEnum.ethereumMainnet,
      )

      const simulationCall = simulateStub.firstCall.args[0]
      expect(simulationCall.to).to.equal('0x4444444444444444444444444444444444444444')
      expect(simulationCall.from).to.equal('0x3333333333333333333333333333333333333333')
      expect(simulationCall.value).to.equal('0')
      expect(simulationCall.data).to.be.a('string')
    })

    it('should handle actions with missing value', async () => {
      const actionsWithoutValue = [
        { data: '0xabcdef1234567890', to: '0x5555555555555555555555555555555555555555', value: '0' },
      ]

      sandbox.stub(SimulationController, 'validateAction').resolves(mockPlugin)
      const simulateStub = sandbox.stub(TenderlyModule, 'simulate').resolves({
        status: ISimulationStatus.SUCCESS,
      })

      await SimulationController.simulate(
        '0x3333333333333333333333333333333333333333',
        actionsWithoutValue,
        NetworksEnum.ethereumMainnet,
      )

      expect(simulateStub.calledOnce).to.be.true
    })
  })

  describe('simulateProposal', () => {
    const mockProposal = {
      entityId: 'proposal-123',
      daoAddress: '0x6666666666666666666666666666666666666666',
      pluginAddress: '0x7777777777777777777777777777777777777777',
      network: NetworksEnum.ethereumMainnet,
      rawActions: [
        { to: '0x8888888888888888888888888888888888888888', value: '100', data: '0xabcdef1234567890' },
        { to: '0x9999999999999999999999999999999999999999', data: '0x1234567890abcdef' },
      ],
      update: sinon.stub().resolves(),
    }

    it('should successfully simulate proposal', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(mockProposal)
      sandbox.stub(TenderlyModule, 'simulate').resolves({
        url: 'https://tenderly.co/simulation/456',
        runAt: 1234567890,
        status: ISimulationStatus.SUCCESS,
      })
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      const result = await SimulationController.simulateProposal('proposal-123')

      expect(result).to.deep.equal({
        status: ISimulationStatus.SUCCESS,
        url: 'https://tenderly.co/simulation/456',
        runAt: 1234567890,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(updateDocumentStub.calledOnce).to.be.true
      const updateCall = updateDocumentStub.firstCall.args[1]
      expect(updateCall.simulation.status).to.equal(ISimulationStatus.SUCCESS)
      expect(updateCall.simulation.url).to.equal('https://tenderly.co/simulation/456')
    })

    it('should throw error when proposal not found', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(null)

      await expect(SimulationController.simulateProposal('proposal-123')).to.be.rejectedWith('notFound')
    })

    it('should throw error when proposal has no actions', async () => {
      const proposalWithoutActions = { ...mockProposal, rawActions: [] }
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(proposalWithoutActions)

      await expect(SimulationController.simulateProposal('proposal-123')).to.be.rejectedWith('notFound')
    })

    it('should throw error when simulation not implemented', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(mockProposal)
      sandbox.stub(TenderlyModule, 'simulate').resolves(false)

      await expect(SimulationController.simulateProposal('proposal-123')).to.be.rejectedWith('badSimulationRequest')
    })

    it('should handle actions with missing data or value', async () => {
      const proposalWithIncompleteActions = {
        ...mockProposal,
        rawActions: [
          { to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          { to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', value: '100' },
        ],
      }

      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(proposalWithIncompleteActions)
      const simulateStub = sandbox.stub(TenderlyModule, 'simulate').resolves({
        status: ISimulationStatus.SUCCESS,
      })

      await SimulationController.simulateProposal('proposal-123')

      expect(simulateStub.calledOnce).to.be.true
    })

    it('should update proposal with runAt when not provided', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(mockProposal)
      sandbox.stub(TenderlyModule, 'simulate').resolves({
        status: ISimulationStatus.FAILED,
      })
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      await SimulationController.simulateProposal('proposal-123')

      const updateCall = updateDocumentStub.firstCall.args[1]
      expect(updateCall.simulation.runAt).to.be.instanceOf(Date)
    })

    it('should allow re-simulation when enough time has passed', async () => {
      const oldRunAt = Date.now() - config.TENDERLY.RE_SIMULATION_TIME - 1000
      const proposalWithOldSimulation = {
        ...mockProposal,
        simulation: { runAt: oldRunAt },
      }

      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(proposalWithOldSimulation)
      sandbox.stub(TenderlyModule, 'simulate').resolves({
        url: 'https://tenderly.co/simulation/new',
        runAt: Date.now(),
        status: ISimulationStatus.SUCCESS,
      })

      const result = await SimulationController.simulateProposal('proposal-123')

      expect(result.status).to.equal(ISimulationStatus.SUCCESS)
      expect(result.url).to.equal('https://tenderly.co/simulation/new')
    })

    it('should throw error when re-simulation attempted too soon', async () => {
      const recentRunAt = Date.now() - 5000
      const proposalWithRecentSimulation = {
        ...mockProposal,
        simulation: { runAt: recentRunAt },
      }

      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(proposalWithRecentSimulation)

      await expect(SimulationController.simulateProposal('proposal-123')).to.be.rejectedWith('badSimulationRequest')
    })
  })

  describe('getSimulationResultOfProposal', () => {
    it('should return simulation result when available', async () => {
      const mockProposal = {
        simulation: {
          url: 'https://tenderly.co/simulation/789',
          runAt: new Date('2023-01-01'),
          status: ISimulationStatus.SUCCESS,
        },
      }

      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(mockProposal)

      const result = await SimulationController.getSimulationResultOfProposal('proposal-123')

      expect(result).to.deep.equal({
        url: 'https://tenderly.co/simulation/789',
        status: ISimulationStatus.SUCCESS,
        runAt: mockProposal.simulation.runAt,
      })
    })

    it('should throw error when proposal has no simulation', async () => {
      const mockProposal = { simulation: null }
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(mockProposal)

      await expect(SimulationController.getSimulationResultOfProposal('proposal-123')).to.be.rejected
    })

    it('should throw error when proposal not found', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(null)

      await expect(SimulationController.getSimulationResultOfProposal('proposal-123')).to.be.rejected
    })
  })
})
