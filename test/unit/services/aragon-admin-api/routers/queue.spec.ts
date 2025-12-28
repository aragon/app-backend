import QueueAdminController from '@services/aragon-admin-api/controllers/queue'
import QueueAdminRouter from '@services/aragon-admin-api/routers/queue'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Router: QueueAdmin', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('queueDaoPlugins', async () => {
    const params = {
      daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      network: NetworksEnum.ethereumMainnet,
    }

    const stubCtrl = sandbox.stub(QueueAdminController, 'queuePlugins').returns(true as any)

    const ctx: any = {
      params,
    }

    await QueueAdminRouter.queueDaoPlugins(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.args[0][0].address).to.eq(params.daoAddress)
    expect(stubCtrl.args[0][0].network).to.eq(params.network)
  })

  it('queueDaoTransactions', async () => {
    const params = {
      daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      network: NetworksEnum.ethereumMainnet,
    }

    const stubCtrl = sandbox.stub(QueueAdminController, 'queueDaoTransactions').returns(true as any)

    const ctx: any = {
      params,
      query: {
        reset: true,
      },
    }

    await QueueAdminRouter.queueDaoTransactions(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.args[0][0].daoAddress).to.eq(params.daoAddress)
    expect(stubCtrl.args[0][0].network).to.eq(params.network)
    expect(stubCtrl.args[0][0].reset).to.eq(true)
  })

  it('queueDaoAssets', async () => {
    const params = {
      daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      network: NetworksEnum.ethereumMainnet,
    }

    const stubCtrl = sandbox.stub(QueueAdminController, 'queueDaoAssets').returns(true as any)

    const ctx: any = {
      params,
    }

    await QueueAdminRouter.queueDaoAssets(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.args[0][0].address).to.eq(params.daoAddress)
    expect(stubCtrl.args[0][0].network).to.eq(params.network)
  })

  it('queueDaoMetrics', async () => {
    const params = {
      daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      network: NetworksEnum.ethereumMainnet,
    }

    const stubCtrl = sandbox.stub(QueueAdminController, 'queueDaoMetrics').returns(true as any)

    const ctx: any = {
      params,
    }

    await QueueAdminRouter.queueDaoMetrics(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.args[0][0].address).to.eq(params.daoAddress)
    expect(stubCtrl.args[0][0].network).to.eq(params.network)
  })

  it('queueProposalMetrics', async () => {
    const params = {
      proposalIndex: '0',
      pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      network: NetworksEnum.ethereumMainnet,
    }

    const stubCtrl = sandbox.stub(QueueAdminController, 'queueProposalMetrics').returns(true as any)

    const ctx: any = {
      params,
    }

    await QueueAdminRouter.queueProposalMetrics(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.args[0][0].proposalIndex).to.eq(params.proposalIndex)
    expect(stubCtrl.args[0][0].pluginAddress).to.eq(params.pluginAddress)
    expect(stubCtrl.args[0][0].network).to.eq(params.network)
  })

  describe('recalculateProposalActions', () => {
    it('should validate and call controller with query parameters', async () => {
      const query = {
        pluginAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
        incrementalId: '1',
        network: NetworksEnum.ethereumMainnet,
      }

      const controllerResponse = {
        success: true,
        message: 'Proposal actions recalculated successfully',
        data: {
          proposalId: 'proposal123',
          actionsCount: 2,
        },
      }

      const stubCtrl = sandbox.stub(QueueAdminController, 'recalculateProposalActions').resolves(controllerResponse)

      const ctx: any = {
        query,
      }

      await QueueAdminRouter.recalculateProposalActions(ctx)

      expect(ctx.body).to.deep.equal(controllerResponse)
      expect(stubCtrl.calledOnce).to.be.true
    })

    it('should handle validation errors', async () => {
      const query = {
        pluginAddress: 'invlidaddress', // Invalid
        incrementalId: '1', // Invalid
        network: NetworksEnum.ethereumMainnet,
      }

      const stubCtrl = sandbox.stub(QueueAdminController, 'recalculateProposalActions')

      const ctx: any = {
        query,
      }

      try {
        await QueueAdminRouter.recalculateProposalActions(ctx)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(stubCtrl.called).to.be.false
      }
    })
  })
})
