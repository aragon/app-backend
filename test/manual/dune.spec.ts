import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import DuneHelper from '@helpers/dune'

describe('Manual: Dune', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should getDaos', async () => {
    const response = await DuneHelper.getDaos()
    console.log(response)
  })
})
