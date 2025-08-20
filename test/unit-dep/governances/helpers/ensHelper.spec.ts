import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import EnsHelper from '@helpers/ens'

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

  it('getDaoEthSubdomain for airalab', async () => {
    const address = '0xa5D15946645fB52707E63Be59c9Ea1c4125859D8'
    const subdomain = 'airalab'
    const ens = await EnsHelper.getDaoEthSubdomain(subdomain)
    expect(ens).to.eq('airalab.dao.eth')

    const isOwner = await EnsHelper.isAddressOwnerOfSubdomain(address, subdomain)
    expect(isOwner).to.be.true
  })

  it('getDaoEns', async () => {
    const daoAddress = '0xa5D15946645fB52707E63Be59c9Ea1c4125859D8'
    const subdomain = 'airalab'

    const ens = await EnsHelper.getDaoEns({ daoAddress, subdomain })
    expect(ens).to.eq('airalab.dao.eth')
  })
})
