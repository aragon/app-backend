import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Proposal Index Finder', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should find proposal index', () => {})
})
