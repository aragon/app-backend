import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import config from '@config'
import StatusController from '@services/aragon-api/controllers/status'
import * as packageJson from '@package'

describe('Controller: Status', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('get status', async () => {
    const status = await StatusController.getStatus()

    expect(Object.keys(status).length).to.be.eq(8)
    expect(status.status).to.eq('healthy')
    expect(status.appName).to.eq(config.APP_NAME)
    expect(status.service).to.eq(config.SERVICES.ARAGON_API.NAME)
    expect(status.nodeVersion).to.eq(process.version)
    expect(status.environment).to.eq(config.ENVIRONMENT)
    expect(status.supportedNetworks).to.eq(config.SUPPORTED_NETWORKS)
    expect(status.appVersionPackage).to.eq(packageJson.version)
    expect(status.time).to.exist
  })
})
