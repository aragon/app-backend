import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import TokenRouter from '@services/api/routers/token'
import TokenController from '@services/api/controllers/token'
import { NetworksEnum } from '@types'
import { getAddress } from 'ethers'

describe('Router: Token', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should get token', async () => {
    const params = {
      network: NetworksEnum.ethereum,
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    }

    const stubCtrl = sandbox
      .stub(TokenController, 'getTokenByAddressAndNetwork')
      .returns(true as any)

    const ctx: any = {
      query: params,
    }

    await TokenRouter.getToken(ctx)

    expect(ctx.body).to.eq(true)
    expect(stubCtrl.calledOnce).to.be.true

    expect(
      stubCtrl.calledWith({
        address: getAddress(params.address),
        network: params.network,
      } as any),
    ).to.be.true
  })
})
