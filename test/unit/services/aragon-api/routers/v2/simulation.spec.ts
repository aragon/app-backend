import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import SimulationRouter from '@api/routers/v2/simulation'
import SimulationController from '@api/controllers/simulation'
import { NetworksEnum, ISimulationStatus } from '@types'

describe('RouterV2: Simulation', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('simulate', () => {
    it('should call SimulationController.simulate with correct parameters', async () => {
      const mockActions = [
        { data: '0xabcdef1234567890', value: '100', to: '0x1111111111111111111111111111111111111111' },
      ]
      const mockResult = {
        status: ISimulationStatus.SUCCESS,
        url: 'https://tenderly.co/simulation/123',
        runAt: 1234567890,
        network: NetworksEnum.ethereumMainnet,
      }

      const stubCtrl = sandbox.stub(SimulationController, 'simulate').resolves(mockResult)

      const ctx: any = {
        request: { body: { actions: mockActions } },
        params: {
          pluginAddress: '0x3333333333333333333333333333333333333333',
          network: 'ethereum-mainnet',
        },
        query: {},
      }

      await SimulationRouter.simulate(ctx)

      expect(ctx.body).to.deep.equal(mockResult)
      expect(stubCtrl.calledOnce).to.be.true
    })
  })

  describe('simulateProposal', () => {
    it('should call SimulationController.simulateProposal with correct parameters', async () => {
      const mockResult = {
        status: ISimulationStatus.SUCCESS,
        url: 'https://tenderly.co/simulation/456',
        runAt: 1234567890,
        network: NetworksEnum.ethereumMainnet,
      }

      const stubCtrl = sandbox.stub(SimulationController, 'simulateProposal').resolves(mockResult)

      const ctx: any = {
        params: { proposalId: 'proposal-123' },
        query: {},
      }

      await SimulationRouter.simulateProposal(ctx)

      expect(ctx.body).to.deep.equal(mockResult)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.firstCall.args[0]).to.equal('proposal-123')
    })
  })

  describe('getSimulationResultOfProposal', () => {
    it('should call SimulationController.getSimulationResultOfProposal with correct parameters', async () => {
      const mockResult = {
        url: 'https://tenderly.co/simulation/789',
        status: ISimulationStatus.SUCCESS,
        runAt: new Date('2023-01-01'),
      }

      const stubCtrl = sandbox.stub(SimulationController, 'getSimulationResultOfProposal').resolves(mockResult)

      const ctx: any = {
        params: { proposalId: 'proposal-123' },
        query: {},
      }

      await SimulationRouter.getSimulationResultOfProposal(ctx)

      expect(ctx.body).to.deep.equal(mockResult)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.firstCall.args[0]).to.equal('proposal-123')
    })
  })

  describe('router', () => {
    it('should create router with correct routes', () => {
      const router = SimulationRouter.router()

      expect(router).to.exist
      expect(router.stack).to.have.lengthOf(3)

      const routes = router.stack.map((layer: any) => ({
        path: layer.path,
        methods: layer.methods,
      }))

      expect(routes).to.deep.include.members([
        { path: '/:network/plugin/:pluginAddress/simulate', methods: ['POST'] },
        { path: '/proposal/:proposalId', methods: ['POST'] },
        { path: '/proposal/:proposalId', methods: ['HEAD', 'GET'] },
      ])
    })

    it('should have correct route handlers', () => {
      const router = SimulationRouter.router()
      const layers = router.stack

      const simulateLayer = layers.find(
        (layer: any) => layer.path === '/:network/plugin/:pluginAddress/simulate' && layer.methods.includes('POST'),
      )
      expect(simulateLayer?.stack[0]).to.equal(SimulationRouter.simulate)

      const simulateProposalLayer = layers.find(
        (layer: any) => layer.path === '/proposal/:proposalId' && layer.methods.includes('POST'),
      )
      expect(simulateProposalLayer?.stack[0]).to.equal(SimulationRouter.simulateProposal)

      const getResultLayer = layers.find(
        (layer: any) => layer.path === '/proposal/:proposalId' && layer.methods.includes('GET'),
      )
      expect(getResultLayer?.stack[0]).to.equal(SimulationRouter.getSimulationResultOfProposal)
    })
  })
})
