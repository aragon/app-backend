import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'

describe('Logger', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('logMeta', () => {
    const llo = logger.logMeta.bind(null, null, { a: 1 }, { b: 2 })

    const logInfo = llo({ c: 3 })

    expect(logInfo).to.deep.eq({
      a: 1,
      b: 2,
      c: 3,
    })
  })
})
