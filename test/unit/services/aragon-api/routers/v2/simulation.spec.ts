import CrossChainGasController from '@api/controllers/crossChainGas'
import SimulationController from '@api/controllers/simulation'
import SimulationRouter from '@api/routers/v2/simulation'
import { ICrossChainGasStatus, ISimulationStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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

  describe('simulateDirectExecute', () => {
    it('should call SimulationController.simulateDirectExecute with correct parameters', async () => {
      const mockActions = [
        { data: '0xabcdef1234567890', value: '100', to: '0x1111111111111111111111111111111111111111' },
      ]
      const mockResult = {
        status: ISimulationStatus.SUCCESS,
        url: 'https://tenderly.co/simulation/direct',
        runAt: 1234567890,
        network: NetworksEnum.ethereumMainnet,
      }

      const stubCtrl = sandbox.stub(SimulationController, 'simulateDirectExecute').resolves(mockResult)

      const daoAddress = '0x4444444444444444444444444444444444444444'
      const fromAddress = '0x5555555555555555555555555555555555555555'
      const ctx: any = {
        request: { body: { from: fromAddress, actions: mockActions } },
        params: {
          daoAddress,
          network: 'ethereum-mainnet',
        },
        query: {},
      }

      await SimulationRouter.simulateDirectExecute(ctx)

      expect(ctx.body).to.deep.equal(mockResult)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.firstCall.args[0]).to.equal(daoAddress)
      expect(stubCtrl.firstCall.args[1]).to.equal(fromAddress)
      expect(stubCtrl.firstCall.args[2]).to.deep.equal(mockActions)
      expect(stubCtrl.firstCall.args[3]).to.equal('ethereum-mainnet')
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

  describe('estimateCrossChainGasLimit', () => {
    it('should call CrossChainGasController.estimateGasLimit with correct parameters', async () => {
      const mockActions = [{ to: '0x4200000000000000000000000000000000000006', value: '0', data: '0x095ea7b3' }]
      const mockResult = {
        status: ICrossChainGasStatus.SUCCESS,
        requiredGas: '228100',
        simulationUrl: 'https://tenderly.co/shared/simulation/abc',
        runAt: 1754400000000,
      }

      const stubCtrl = sandbox.stub(CrossChainGasController, 'estimateGasLimit').resolves(mockResult)

      const controllerAddress = '0x1111111111111111111111111111111111111111'
      const ctx: any = {
        request: { body: { destinationChainId: 8453, actions: mockActions } },
        params: { controllerAddress, network: 'ethereum-mainnet' },
        query: {},
      }

      await SimulationRouter.estimateCrossChainGasLimit(ctx)

      expect(ctx.body).to.deep.equal(mockResult)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.firstCall.args[0]).to.equal('ethereum-mainnet')
      expect(stubCtrl.firstCall.args[1]).to.equal(controllerAddress)
      expect(stubCtrl.firstCall.args[2]).to.equal(8453)
      expect(stubCtrl.firstCall.args[3]).to.deep.equal(mockActions)
    })

    it('should reject a destination chain id that is not a positive integer', async () => {
      const stubCtrl = sandbox.stub(CrossChainGasController, 'estimateGasLimit')

      const ctx: any = {
        request: {
          body: {
            destinationChainId: -1,
            actions: [{ to: '0x4200000000000000000000000000000000000006', value: '0', data: '0x' }],
          },
        },
        params: { controllerAddress: '0x1111111111111111111111111111111111111111', network: 'ethereum-mainnet' },
        query: {},
      }

      await expect(SimulationRouter.estimateCrossChainGasLimit(ctx)).to.be.rejectedWith('badParams')
      expect(stubCtrl.called).to.be.false
    })
  })

  describe('router', () => {
    it('should create router with correct routes', () => {
      const router = SimulationRouter.router()

      expect(router).to.exist
      expect(router.stack).to.have.lengthOf(6)

      const routes = router.stack.map((layer: any) => ({
        path: layer.path,
        methods: layer.methods,
      }))

      expect(routes).to.deep.include.members([
        { path: '/:network/plugin/:pluginAddress/simulate', methods: ['POST'] },
        { path: '/:network/dao/:daoAddress/simulate', methods: ['POST'] },
        { path: '/proposal/:proposalId', methods: ['POST'] },
        { path: '/proposal/:proposalId', methods: ['HEAD', 'GET'] },
        { path: '/:network/dispatch/:policyAddress', methods: ['POST'] },
        { path: '/:network/cross-chain/:controllerAddress/gas-limit', methods: ['POST'] },
      ])
    })

    it('should have correct route handlers', () => {
      const router = SimulationRouter.router()
      const layers = router.stack

      const simulateLayer = layers.find(
        (layer: any) => layer.path === '/:network/plugin/:pluginAddress/simulate' && layer.methods.includes('POST'),
      )
      expect(simulateLayer?.stack[0]).to.equal(SimulationRouter.simulate)

      const simulateDirectExecuteLayer = layers.find(
        (layer: any) => layer.path === '/:network/dao/:daoAddress/simulate' && layer.methods.includes('POST'),
      )
      expect(simulateDirectExecuteLayer?.stack[0]).to.equal(SimulationRouter.simulateDirectExecute)

      const simulateProposalLayer = layers.find(
        (layer: any) => layer.path === '/proposal/:proposalId' && layer.methods.includes('POST'),
      )
      expect(simulateProposalLayer?.stack[0]).to.equal(SimulationRouter.simulateProposal)

      const getResultLayer = layers.find(
        (layer: any) => layer.path === '/proposal/:proposalId' && layer.methods.includes('GET'),
      )
      expect(getResultLayer?.stack[0]).to.equal(SimulationRouter.getSimulationResultOfProposal)

      const crossChainGasLayer = layers.find(
        (layer: any) =>
          layer.path === '/:network/cross-chain/:controllerAddress/gas-limit' && layer.methods.includes('POST'),
      )
      expect(crossChainGasLayer?.stack[0]).to.equal(SimulationRouter.estimateCrossChainGasLimit)
    })
  })
})
