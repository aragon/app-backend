import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Connections from '@modules/connections'
import Runner from '@modules/runner'
import { expect } from 'chai'
import utils from '@helpers/utils'
import { EnumConnection } from '@types'

describe.skip('Module: runner', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should start all apps and open connections', async function () {
    const appMock = {
      start: sandbox.stub().resolves(),
      stop: sandbox.stub().resolves(),
      NEED_CONNECTIONS: [EnumConnection.MONGODB],
    }

    const connectionsMock = sandbox.stub(Connections, 'open').resolves()
    sandbox.stub(Connections, 'close').resolves()

    Runner(appMock)
    await utils.wait(100)
    expect(appMock.start.calledOnce).to.be.true
    expect(connectionsMock.calledOnce).to.be.true
    expect(connectionsMock.args[0][0][0]).to.eq(EnumConnection.MONGODB)
  })

  it('handles errors when starting apps', async function () {
    const appMock = {
      start: sandbox.stub().resolves(),
      stop: sandbox.stub().resolves(),
      NEED_CONNECTIONS: [EnumConnection.MONGODB],
    }

    try {
      Runner(appMock)
      await utils.wait(100)
      expect.fail('Expected runApps to throw')
    } catch (err: any) {
      expect(err.message).to.equal('Expected runApps to throw')
    }
  })
})
