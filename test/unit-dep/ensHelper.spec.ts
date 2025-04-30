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

  it('getEnsWithUniversalResolver', async () => {
    const memberAddress = '0x42E6DD8D517abB3E4f6611Ca53a8D1243C183fB0'
    const ens = await EnsHelper.getEnsWithUniversalResolver(memberAddress)
    expect(ens).to.eq('amiru.eth')

  })

  it.only('getEnsAvatar', async () => {
    const memberAvatar = 'amiru.eth'
    const avatar = await EnsHelper.getEnsAvatar(memberAvatar)
    expect(avatar).to.eq('amiru.eth')
  })
})
