import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import QueueAdminRouter from '@services/aragon-admin-api/routers/queue'
import QueueAdminController from '@services/aragon-admin-api/controllers/queue'
import { NetworksEnum } from '@types'

describe('Router: QueueAdmin', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
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
      params
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
      params
    }

    await QueueAdminRouter.queueDaoTransactions(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.args[0][0].address).to.eq(params.daoAddress)
    expect(stubCtrl.args[0][0].network).to.eq(params.network)
  })

  it('queueDaoAssets', async () => {
    const params = {
      daoAddress: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      network: NetworksEnum.ethereumMainnet,
    }

    const stubCtrl = sandbox.stub(QueueAdminController, 'queueDaoAssets').returns(true as any)

    const ctx: any = {
      params
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
      params
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
      params
    }

    await QueueAdminRouter.queueProposalMetrics(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true
    expect(stubCtrl.args[0][0].proposalIndex).to.eq(params.proposalIndex)
    expect(stubCtrl.args[0][0].pluginAddress).to.eq(params.pluginAddress)
    expect(stubCtrl.args[0][0].network).to.eq(params.network)
  })
})
