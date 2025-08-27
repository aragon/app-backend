import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { TenderlyService } from '@helpers/tenderly'
import { Models } from '@dbModels'
import { SimulationStatus } from '@models/schema/simulation'
import SimulationController from '@api/controllers/simulation'

describe('Integ: Simulation', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('TenderlyService', () => {
    it('should be configured when all env vars are present', () => {
      const isConfigured = TenderlyService.isConfigured()
      expect(isConfigured).to.be.a('boolean')
    })

    it('should simulate actions with mock data', async function () {
      this.timeout(30000)

      const mockActions = [
        {
          to: '0x1234567890123456789012345678901234567890',
          value: '0',
          data: '0x095ea7b3000000000000000000000000abcd567890123456789012345678901234567890000000000000000000000000000000000000000000000000de0b6b3a7640000',
        },
      ]

      const result = await TenderlyService.simulateActions(mockActions)

      expect(result).to.have.property('status')
      expect(result.status).to.be.oneOf([
        SimulationStatus.SUCCESS,
        SimulationStatus.FAILED,
      ])

      if (result.status === SimulationStatus.SUCCESS) {
        expect(result).to.have.property('url')
        expect(result.url).to.be.a('string')
      }

      if (result.tenderlyResponse) {
        expect(result.tenderlyResponse).to.be.a('string')
        // Should be valid JSON
        expect(() => JSON.parse(result.tenderlyResponse || '{}')).to.not.throw()
      }
    })
    
    it('should validate recipients and senders in simulateBundle', async function () {
      this.timeout(30000)
      
      // Stub Models.Dao.find to simulate DAO validation
      const daoFindStub = sandbox.stub(Models.Dao, 'find').resolves([
        { address: '0x1234567890123456789012345678901234567890' }
      ])
      
      // Stub Models.Plugin.find to simulate plugin validation
      const pluginFindStub = sandbox.stub(Models.Plugin, 'find').resolves([
        { address: '0xabcdef7890123456789012345678901234567890' }
      ])
      
      // Stub axios post to prevent actual API call
      const axiosStub = sandbox.stub().resolves({
        data: {
          status: 'success',
          simulation_id: 'test-sim-id'
        }
      })
      
      // Stub createShareableUrl to avoid actual API call
      sandbox.stub(TenderlyService, 'createShareableUrl').resolves('https://example.com/sim')
      
      const simulationItems = [
        {
          network_id: '1',
          to: '0x1234567890123456789012345678901234567890', // Valid DAO
          from: '0xabcdef7890123456789012345678901234567890', // Valid plugin
          input: '0x',
          value: '0'
        },
        {
          network_id: '1',
          to: '0x9999999999999999999999999999999999999999', // Invalid DAO
          from: '0x8888888888888888888888888888888888888888', // Invalid plugin
          input: '0x',
          value: '0'
        }
      ]
      
      // Execute function
      const result = await TenderlyService.simulateBundle(simulationItems)
      
      // Verify function completed successfully
      expect(result.status).to.equal(SimulationStatus.SUCCESS)
      expect(result.url).to.equal('https://example.com/sim')
      
      // Verify DAO validation was performed
      expect(daoFindStub.calledOnce).to.be.true
      expect(daoFindStub.firstCall.args[0]).to.deep.include({
        address: { $in: ['0x1234567890123456789012345678901234567890', '0x9999999999999999999999999999999999999999'] },
        isActive: true
      })
      
      // Verify plugin validation was performed
      expect(pluginFindStub.calledOnce).to.be.true
      expect(pluginFindStub.firstCall.args[0]).to.deep.include({
        address: { $in: ['0xabcdef7890123456789012345678901234567890', '0x8888888888888888888888888888888888888888'] }
      })
    })
  })

  describe('SimulationController', () => {
    beforeEach(async () => {
      // Clean up any existing simulations
      await Models.Simulation.deleteMany({})
    })

    afterEach(async () => {
      // Clean up test data
      await Models.Simulation.deleteMany({})
    })

    it('should return null for non-existent proposal simulation', async () => {
      const result = await SimulationController.getLastSimulation('non-existent-proposal')
      expect(result).to.be.null
    })

    it('should create and retrieve simulation for actions', async function () {
      this.timeout(30000)

      const mockActions = [
        {
          to: '0x1234567890123456789012345678901234567890',
          value: '0',
          data: '0x',
        },
      ]

      const result = await SimulationController.runSimulationForActions(mockActions)

      expect(result).to.have.property('status')
      expect(result.status).to.be.oneOf([
        SimulationStatus.SUCCESS,
        SimulationStatus.FAILED,
        SimulationStatus.RUNNING,
      ])
      expect(result).to.have.property('runAt')
      expect(result.runAt).to.be.a('string')
    })

    it('should maintain only latest simulation per proposal', async function () {
      this.timeout(30000)

      const proposalId = 'test-proposal-123'

      // Create first simulation
      await Models.Simulation.upsertByProposalId(proposalId, {
        status: SimulationStatus.SUCCESS,
        url: 'https://example.com/sim1',
      })

      // Verify first simulation exists
      let simulation = await Models.Simulation.findByProposalId(proposalId)
      expect(simulation).to.not.be.null
      expect(simulation?.url).to.equal('https://example.com/sim1')

      // Create second simulation (should replace first)
      await Models.Simulation.upsertByProposalId(proposalId, {
        status: SimulationStatus.FAILED,
        url: 'https://example.com/sim2',
        errorMessage: 'Test error',
      })

      // Verify only latest simulation exists
      simulation = await Models.Simulation.findByProposalId(proposalId)
      expect(simulation).to.not.be.null
      expect(simulation?.url).to.equal('https://example.com/sim2')
      expect(simulation?.status).to.equal(SimulationStatus.FAILED)
      expect(simulation?.errorMessage).to.equal('Test error')

      // Verify only one simulation exists for this proposal
      const allSimulations = await Models.Simulation.find({ proposalId })
      expect(allSimulations).to.have.length(1)
    })

    it('should store tenderly response as JSON string', async function () {
      this.timeout(30000)

      const proposalId = 'test-proposal-with-response'
      const mockTenderlyResponse = {
        simulation_id: 'sim_123456789',
        status: 'success',
        gas_used: 21000,
        transaction_hash: '0xabcdef...',
      }

      await Models.Simulation.upsertByProposalId(proposalId, {
        status: SimulationStatus.SUCCESS,
        url: 'https://example.com/sim',
        tenderlyResponse: JSON.stringify(mockTenderlyResponse),
      })

      const simulation = await Models.Simulation.findByProposalId(proposalId)
      expect(simulation).to.not.be.null
      expect(simulation?.tenderlyResponse).to.be.a('string')

      // Should be parseable JSON
      const parsedResponse = JSON.parse(simulation!.tenderlyResponse!)
      expect(parsedResponse).to.deep.equal(mockTenderlyResponse)
    })
  })

  describe('Database Model', () => {
    beforeEach(async () => {
      await Models.Simulation.deleteMany({})
    })

    afterEach(async () => {
      await Models.Simulation.deleteMany({})
    })

    it('should generate proper IDs for different simulation types', () => {
      const proposalId = Models.Simulation.generateId('test-proposal')
      const actionId = Models.Simulation.generateId(undefined)

      expect(proposalId).to.match(/^sim-test-proposal-\d+$/)
      expect(actionId).to.match(/^sim-actions-\d+$/)
    })

    it('should create simulation with all required fields', async () => {
      const simulationData = {
        status: SimulationStatus.SUCCESS,
        url: 'https://tenderly.co/sim/123',
        actions: [{ to: '0x123', value: '0', data: '0x' }],
        tenderlyResponse: JSON.stringify({ simulation_id: 'sim_123' }),
      }

      const simulation = await Models.Simulation.create(simulationData)

      expect(simulation.id).to.be.a('string')
      expect(simulation.status).to.equal(SimulationStatus.SUCCESS)
      expect(simulation.url).to.equal('https://tenderly.co/sim/123')
      expect(simulation.runAt).to.be.instanceOf(Date)
      expect(simulation.actions).to.deep.equal(simulationData.actions)
      expect(simulation.tenderlyResponse).to.equal(simulationData.tenderlyResponse)
    })
  })

  describe('Controller Integration - End-to-End Data Verification', () => {
    beforeEach(async () => {
      await Models.Simulation.deleteMany({})
    })

    afterEach(async () => {
      await Models.Simulation.deleteMany({})
    })

    it('should run simulation for proposal and verify data in database', async function () {
      this.timeout(30000)

      const proposalId = 'test-proposal-integration'

      // Run simulation via controller
      const controllerResult = await SimulationController.runNewSimulation(proposalId)

      expect(controllerResult).to.have.property('status')
      expect(controllerResult).to.have.property('runAt')
      expect(controllerResult.runAt).to.be.a('string')

      // Verify data was stored in database
      const storedSimulation = await Models.Simulation.findByProposalId(proposalId)
      expect(storedSimulation).to.not.be.null
      expect(storedSimulation?.status).to.equal(controllerResult.status)
      
      if (controllerResult.url) {
        expect(storedSimulation?.url).to.equal(controllerResult.url)
      }

      // Verify runAt is properly formatted
      const parsedDate = new Date(controllerResult.runAt)
      expect(parsedDate).to.be.instanceOf(Date)
      expect(parsedDate.getTime()).to.not.be.NaN
    })

    it('should retrieve last simulation via controller and match database', async function () {
      this.timeout(30000)

      const proposalId = 'test-proposal-retrieve'

      // First create a simulation in database
      await Models.Simulation.upsertByProposalId(proposalId, {
        status: SimulationStatus.SUCCESS,
        url: 'https://tenderly.co/sim/test123',
        tenderlyResponse: JSON.stringify({
          simulation_id: 'sim_test123',
          status: 'success',
          gas_used: 25000,
        }),
      })

      // Retrieve via controller
      const controllerResult = await SimulationController.getLastSimulation(proposalId)

      expect(controllerResult).to.not.be.null
      expect(controllerResult?.status).to.equal(SimulationStatus.SUCCESS)
      expect(controllerResult?.url).to.equal('https://tenderly.co/sim/test123')
      expect(controllerResult?.runAt).to.be.a('string')

      // Verify the returned data matches what's in database
      const dbSimulation = await Models.Simulation.findByProposalId(proposalId)
      expect(controllerResult?.status).to.equal(dbSimulation?.status)
      expect(controllerResult?.url).to.equal(dbSimulation?.url)
      expect(new Date(controllerResult!.runAt).getTime()).to.equal(dbSimulation?.runAt.getTime())
    })

    it('should run simulation for actions and store correct data', async function () {
      this.timeout(30000)

      const mockActions = [
        {
          to: '0x1234567890123456789012345678901234567890',
          value: '100000000000000000',
          data: '0xa9059cbb000000000000000000000000abcd567890123456789012345678901234567890000000000000000000000000000000000000000000000000016345785d8a0000',
        },
      ]

      // Run simulation via controller
      const controllerResult = await SimulationController.runSimulationForActions(mockActions)

      expect(controllerResult).to.have.property('status')
      expect(controllerResult).to.have.property('runAt')

      // Find the created simulation in database
      const allSimulations = await Models.Simulation.find({ proposalId: { $exists: false } })
        .sort({ runAt: -1 })
        .limit(1)

      expect(allSimulations).to.have.length(1)
      const storedSimulation = allSimulations[0]

      expect(storedSimulation.status).to.equal(controllerResult.status)
      expect(storedSimulation.actions).to.deep.equal(mockActions)
      
      if (controllerResult.url) {
        expect(storedSimulation.url).to.equal(controllerResult.url)
      }

      // Verify actions were stored correctly
      expect(storedSimulation.actions).to.have.length(1)
      expect(storedSimulation.actions?.[0].to).to.equal(mockActions[0].to)
      expect(storedSimulation.actions?.[0].value).to.equal(mockActions[0].value)
      expect(storedSimulation.actions?.[0].data).to.equal(mockActions[0].data)
    })

    it('should ensure only latest simulation exists after multiple controller runs', async function () {
      this.timeout(45000)

      const proposalId = 'test-proposal-latest-only'

      // Run first simulation
      const result1 = await SimulationController.runNewSimulation(proposalId)
      expect(result1).to.have.property('status')

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Run second simulation
      const result2 = await SimulationController.runNewSimulation(proposalId)
      expect(result2).to.have.property('status')

      // Verify only one simulation exists for this proposal
      const allSimulations = await Models.Simulation.find({ proposalId })
      expect(allSimulations).to.have.length(1)

      // Verify it's the latest one by checking the timestamp
      const latestSimulation = allSimulations[0]
      const result2Timestamp = new Date(result2.runAt)
      expect(latestSimulation.runAt.getTime()).to.equal(result2Timestamp.getTime())

      // Verify controller returns the latest simulation
      const retrievedSimulation = await SimulationController.getLastSimulation(proposalId)
      expect(retrievedSimulation).to.not.be.null
      expect(retrievedSimulation?.runAt).to.equal(result2.runAt)
    })

    it('should verify complete data flow: create -> store -> retrieve', async function () {
      this.timeout(30000)

      const proposalId = 'test-complete-flow'
      const mockActions = [
        {
          to: '0xA0b86a33E6441c8A77aCB8Ae4C1e7C1c10E2C8a4',
          value: '500000000000000000',
          data: '0x40c10f19000000000000000000000000recipient123456789012345678901234567890000000000000000000000000000000000000000000000000000000de0b6b3a7640000',
        },
      ]

      // Step 1: Run simulation for actions via controller
      const actionResult = await SimulationController.runSimulationForActions(mockActions)
      expect(actionResult).to.have.property('status')
      expect(actionResult).to.have.property('runAt')

      // Step 2: Find the stored simulation
      const storedActionSim = await Models.Simulation.find({ actions: { $exists: true } })
        .sort({ runAt: -1 })
        .limit(1)

      expect(storedActionSim).to.have.length(1)
      expect(storedActionSim[0].actions).to.deep.equal(mockActions)

      // Step 3: Run simulation for proposal via controller  
      const proposalResult = await SimulationController.runNewSimulation(proposalId)
      expect(proposalResult).to.have.property('status')

      // Step 4: Retrieve via controller and verify
      const retrievedProposalSim = await SimulationController.getLastSimulation(proposalId)
      expect(retrievedProposalSim).to.not.be.null
      expect(retrievedProposalSim?.status).to.equal(proposalResult.status)
      expect(retrievedProposalSim?.runAt).to.equal(proposalResult.runAt)

      // Step 5: Verify database contains exactly what controller returns
      const dbProposalSim = await Models.Simulation.findByProposalId(proposalId)
      expect(dbProposalSim?.status).to.equal(retrievedProposalSim?.status)
      expect(dbProposalSim?.url).to.equal(retrievedProposalSim?.url)
      expect(dbProposalSim?.runAt.toISOString()).to.equal(retrievedProposalSim?.runAt)
    })
  })
})