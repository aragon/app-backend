import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DeviceInfo from '@helpers/device'
import logger from '@logger'

describe('Helpers: Device', () => {
  let sandbox: SinonSandbox
  let stubLogger: any = null

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    stubLogger = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should log error empty user agent data', async () => {
    const res = DeviceInfo.getDeviceInfo()
    expect(res).to.be.deep.eq({})
    expect(stubLogger.calledOnce).to.be.true
  })

  it('should get user agent data mobile', async () => {
    const userAgent =
      'Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Mobile Safari/537.36'

    const res = DeviceInfo.getDeviceInfo(userAgent)
    expect(res).to.be.deep.eq({
      name: 'Mobile Chrome',
      type: 'mobile',
      ua: 'Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Mobile Safari/537.36',
      vendor: 'Google',
      version: '88.0.4324.182',
    })
    expect(stubLogger.calledOnce).to.be.false
  })

  it('should get user agent data web', async () => {
    const userAgent =
      ' Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36'

    const res = DeviceInfo.getDeviceInfo(userAgent)
    expect(res).to.be.deep.eq({
      name: 'Chrome',
      type: 'web',
      ua: ' Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36',
      vendor: 'web',
      version: '88.0.4324.182',
    })
    expect(stubLogger.calledOnce).to.be.false
  })
})
