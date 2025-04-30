import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import EnsHelper from '@helpers/ens'

describe('EnsHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it.skip('getEnsWithUniversalResolver', async () => {
    const memberAddress = '0xD70aa9d7280E6FEe89B86f53c0B2A363478D5e94'
    const ens = await EnsHelper.getEnsWithUniversalResolver(memberAddress)
    expect(ens).to.eq('amiru.eth')
  })
})
