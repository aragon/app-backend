import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import ProviderModule from '@modules/provider'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { IClockMode, NetworksEnum } from '@types'

describe('Manual: GovernanceErc20', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should get past total supply', async () => {
    await ProviderModule.connectToAllNetworks()

    const response = await GovernanceErc20Helper.getPastVotes(
      '0xB7259b2eea4675A6a0B93B36AF3aC60115345dEd',
      '0xADcEc38b47FeeB585988a6342aacdBcA86042bCA',
      6726542,
      1634016000,
      NetworksEnum.ethereumSepolia,
      IClockMode.BlockNumber,
    )

    console.log(response)
  })
})
