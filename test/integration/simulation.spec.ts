import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'

describe('Simulation', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should test', async () => {
    expect(true).to.be.true
  })
})
