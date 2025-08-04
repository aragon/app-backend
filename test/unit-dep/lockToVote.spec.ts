import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import UnitDepUtils from '@test/lib/unit-dep/utils'
import { NetworksEnum } from '@types'

describe.only('LockToVote', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should handle the lock to vote functionality', async function ()  {
    this.timeout(1600000)
    await UnitDepUtils.stubRabbitmqSend(sandbox)
    const daoAddress = '0x3bCd976E756EA18fe2d02724757237Cfa8DB3A92'
    const network = NetworksEnum.ethereumSepolia

    await UnitDepUtils.syncACompleteDao(daoAddress, network)

  })
})
