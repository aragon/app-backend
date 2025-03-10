import sinon from 'sinon'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { HexAddress, ITokenType, NetworksEnum } from '@types'
import { RateModule } from '@modules/rates'
import CovalentHelper from '@helpers/covalent'

describe('Modules:RateModule', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('fetchRate', () => {
    it('should fetchRate with Covalent', async () => {
      const expectedPrice = { priceUsd: '1', priceChangeOnDayUsd: 0.1, logo: 'fake-logo' }
      const getCoinPriceStub = sandbox.stub(RateModule, 'fetchRateWithCovalent').resolves(expectedPrice as any)

      const result = await RateModule.fetchRate(ZeroAddress as any, NetworksEnum.ethereumMainnet)

      expect(result).to.equal(expectedPrice)
      expect(getCoinPriceStub.calledOnce).to.be.true
      expect(getCoinPriceStub.calledWithExactly(ZeroAddress as HexAddress, NetworksEnum.ethereumMainnet, undefined)).to
        .be.true
    })
  })

  describe('fetchRateWithCovalent', () => {
    it('should fetchRateWithCovalent', async () => {
      const expectedPrice = { priceUsd: '1', priceChangeOnDayUsd: '0.1', logo: 'fake-logo', type: ITokenType.native }
      const getCoinPriceStub = sandbox.stub(CovalentHelper, 'getToken').resolves(expectedPrice as any)

      const result = await RateModule.fetchRateWithCovalent(ZeroAddress as any, NetworksEnum.ethereumMainnet)

      expect(result.address).to.equal(ZeroAddress)
      expect(result.priceUsd).to.equal('1')
      expect(result.priceChangeOnDayUsd).to.equal('0.1')
      expect(result.logo).to.equal('fake-logo')
      expect(result.type).to.equal(ITokenType.native)
      expect(result.lastUpdatedAt).to.exist
      expect(getCoinPriceStub.calledOnce).to.be.true
      expect(getCoinPriceStub.calledWithExactly(ZeroAddress, NetworksEnum.ethereumMainnet, undefined)).to.be.true
    })
  })
})
