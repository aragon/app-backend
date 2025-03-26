import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import StatusAdminRouter from '@services/aragon-admin-api/routers/status'
import StatusAdminController from '@services/aragon-admin-api/controllers/status'
import { NetworksEnum } from '@types'

describe('Router: StatusAdmin', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should get status', async () => {
    const fakeRes = {
      status: 'status',
      appName: 'appName',
      nodeVersion: 'nodeVersion',
      service: 'appService',
      environment: 'environment',
      supportedNetworks: [NetworksEnum.ethereumMainnet],
      appVersionPackage: 'appVersionPackage',
      time: 'time',
    }

    sandbox.stub(StatusAdminController, 'getStatus').returns(fakeRes)
    const ctx: any = {}
    await StatusAdminRouter.status(ctx)

    expect(ctx.body).to.eq(fakeRes)
  })
})
