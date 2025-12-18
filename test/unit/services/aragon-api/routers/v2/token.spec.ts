import TokenController from '@api/controllers/token'
import TokenRouter from '@api/routers/v2/token'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { getAddress } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('RouterV2: Token', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getTokenByAddress', () => {
    it('Should getTokenByAddress', async () => {
      const params = {
        network: NetworksEnum.ethereumMainnet,
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      }

      const stubCtrl = sandbox.stub(TokenController, 'getTokenByAddress').returns(true as any)

      const ctx: any = {
        params,
        query: {},
      }

      await TokenRouter.getTokenByAddress(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0]?.[0]).to.deep.eq({
        address: getAddress(params.address),
        network: params.network,
      })
    })

    it('Should handle lowercase address and checksum it', async () => {
      const params = {
        network: NetworksEnum.ethereumMainnet,
        address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      }

      const stubCtrl = sandbox.stub(TokenController, 'getTokenByAddress').returns(true as any)

      const ctx: any = {
        params,
        query: {},
      }

      await TokenRouter.getTokenByAddress(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true
      expect(stubCtrl.args[0]?.[0]).to.deep.eq({
        address: getAddress(params.address),
        network: params.network,
      })
    })

    it('Should handle different network values', async () => {
      const networks = [NetworksEnum.polygonMainnet, NetworksEnum.arbitrumMainnet, NetworksEnum.baseMainnet]

      const address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      const stubCtrl = sandbox.stub(TokenController, 'getTokenByAddress')

      for (const network of networks) {
        stubCtrl.reset()
        stubCtrl.returns(`token-${network}` as any)

        const ctx: any = {
          params: { network, address },
          query: {},
        }

        await TokenRouter.getTokenByAddress(ctx)

        expect(stubCtrl.calledOnce).to.be.true
        expect(stubCtrl.args[0]?.[0]).to.deep.eq({
          address: getAddress(address),
          network,
        })
        expect(ctx.body).to.equal(`token-${network}`)
      }
    })

    it('Should fail validation when address is invalid', async () => {
      const params = {
        network: NetworksEnum.ethereumMainnet,
        address: '0xinvalid',
      }

      const ctx: any = {
        params,
        query: {},
      }

      let error: any
      try {
        await TokenRouter.getTokenByAddress(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"address" is not a valid address')
    })

    it('Should fail validation when address is missing', async () => {
      const params = {
        network: NetworksEnum.ethereumMainnet,
      }

      const ctx: any = {
        params,
        query: {},
      }

      let error: any
      try {
        await TokenRouter.getTokenByAddress(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"address" is required')
    })

    it('Should fail validation when network is invalid', async () => {
      const params = {
        network: 'invalid-network',
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      }

      const ctx: any = {
        params,
        query: {},
      }

      let error: any
      try {
        await TokenRouter.getTokenByAddress(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"network"')
    })

    it('Should fail validation when network is missing', async () => {
      const params = {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      }

      const ctx: any = {
        params,
        query: {},
      }

      let error: any
      try {
        await TokenRouter.getTokenByAddress(ctx)
      } catch (e) {
        error = e
      }

      expect(error).to.exist
      expect(error.message).to.equal('badParams')
      expect(error.exposeMeta.validationError.errors[0]).to.include('"network" is required')
    })

    it('Should handle token not found response', async () => {
      const params = {
        network: NetworksEnum.ethereumMainnet,
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      }

      const stubCtrl = sandbox.stub(TokenController, 'getTokenByAddress').returns(null as any)

      const ctx: any = {
        params,
        query: {},
      }

      await TokenRouter.getTokenByAddress(ctx)

      expect(ctx.body).to.be.null
      expect(stubCtrl.calledOnce).to.be.true
    })

    it('Should handle complex token response', async () => {
      const params = {
        network: NetworksEnum.ethereumMainnet,
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      }

      const tokenResponse = {
        address: params.address,
        network: params.network,
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
        logoUrl: 'https://example.com/weth.png',
        price: {
          usd: 3000,
          change24h: 2.5,
        },
      }

      const stubCtrl = sandbox.stub(TokenController, 'getTokenByAddress').returns(tokenResponse as any)

      const ctx: any = {
        params,
        query: {},
      }

      await TokenRouter.getTokenByAddress(ctx)

      expect(ctx.body).to.deep.eq(tokenResponse)
      expect(stubCtrl.calledOnce).to.be.true
    })
  })
})
