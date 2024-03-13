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
      address: '0xe0bd0fe4e70478d5aaf9df546fc76b964ce0bc54',
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
    console.log(stubCtrl.args)
    console.log(params)

    expect(
      stubCtrl.calledWith({
        address: getAddress(params.address),
        network: params.network,
      } as any),
    ).to.be.true
  })
})
