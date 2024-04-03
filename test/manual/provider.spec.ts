import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderHelper from '@modules/provider'

describe('Manual: Provider', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should connectToAllNetworks', async () => {
    await ProviderHelper.connectToAllNetworks()
  })
})
