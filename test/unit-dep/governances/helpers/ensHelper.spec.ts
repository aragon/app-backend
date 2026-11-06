import EnsHelper from '@helpers/ens'
import { expect } from 'chai'

describe('Integ: EnsHelper', () => {
  it('returns the DAO ENS name when it resolves to the DAO', async () => {
    const daoAddress = '0xa5D15946645fB52707E63Be59c9Ea1c4125859D8'
    const subdomain = 'airalab.dao.eth'

    const ens = await EnsHelper.getDaoEns({ daoAddress, subdomain })
    expect(ens).to.eq('airalab.dao.eth')
  })
})
