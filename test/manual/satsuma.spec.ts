import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import SatsumaHelper from '@helpers/satsuma'
import { NetworksEnum } from '@types'

describe('Manual: Satsuma', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should getDaos', async () => {
    const network = NetworksEnum.ethereum

    const response = await SatsumaHelper.getDaos(network, {
      limit: 100,
      skip: 0,
    })
    console.log(response) // eslint-disable-line no-console
  })
})
