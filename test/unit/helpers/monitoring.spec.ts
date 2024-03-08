import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Monitoring from '@helpers/monitoring'
import logger from '@logger'
import { ErrorKey } from '@types'

function tightWork(duration: number) {
  const start = Date.now()
  while (Date.now() - start < duration) {
    for (let i = 0; i < 1e5; ) i++
  }
}

describe('Module:Monitoring', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    Monitoring.maxLag(10)
    Monitoring.interval(50)
  })

  after(() => {
    Monitoring.maxLag(70)
    Monitoring.interval(500)
    sandbox?.restore()
  })

  it.skip('logs if too much work', done => {
    const warn = sandbox.stub(logger, 'warn')

    function load() {
      if (warn.callCount > 0) {
        expect(warn.args[0][0]).to.eq(ErrorKey.tooBusy)
        done()
        return
      }
      tightWork(100)
      setTimeout(load, 0)
    }

    load()
  })
})
