import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import StatusRouter from '@api/status'
import StatusController from '@api/controllers/status'
import { NetworksEnum } from '@types'

describe('Router: Status', () => {
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
      service: 'appService',
      nodeVersion: 'nodeVersion',
      environment: 'environment',
      supportedNetworks: [NetworksEnum.ethereumMainnet],
      appVersionPackage: 'appVersionPackage',
      time: 'time',
    }

    sandbox.stub(StatusController, 'getStatus').returns(fakeRes)
    const ctx: any = {}
    await StatusRouter.status(ctx)

    expect(ctx.body).to.eq(fakeRes)
  })
})
