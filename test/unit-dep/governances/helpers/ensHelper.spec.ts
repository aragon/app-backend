import EnsHelper from '@helpers/ens'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Integ: EnsHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('getEnsWithUniversalResolver', async () => {
    const memberAddress = '0xD70aa9d7280E6FEe89B86f53c0B2A363478D5e94'
    const ens = await EnsHelper.getEnsWithUniversalResolver(memberAddress)
    expect(ens).to.eq('amiru.eth')
  })

  it('returns the DAO ENS name when it resolves to the DAO', async () => {
    const daoAddress = '0xa5D15946645fB52707E63Be59c9Ea1c4125859D8'
    const subdomain = 'airalab.dao.eth'

    const ens = await EnsHelper.getDaoEns({ daoAddress, subdomain })
    expect(ens).to.eq('airalab.dao.eth')
  })
})
