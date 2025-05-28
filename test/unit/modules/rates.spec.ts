import sinon from 'sinon'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { HexAddress, ITokenType, NetworksEnum } from '@types'
import { RateModule } from '@modules/rates'
import CovalentHelper from '@helpers/covalent'
import axios from 'axios'
import dayjs from '@helpers/dayjs'

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
      const expectedPrice = { priceUsd: '1', logo: 'fake-logo' }
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
      const expectedPrice = { priceUsd: '1', logo: 'fake-logo', type: ITokenType.native }
      const getCoinPriceStub = sandbox.stub(CovalentHelper, 'getToken').resolves(expectedPrice as any)

      const result = await RateModule.fetchRateWithCovalent(ZeroAddress as any, NetworksEnum.ethereumMainnet)

      expect(result.address).to.equal(ZeroAddress)
      expect(result.priceUsd).to.equal('1')
      expect(result.logo).to.equal('fake-logo')
      expect(result.type).to.equal(ITokenType.native)
      expect(result.lastUpdatedAt).to.exist
      expect(getCoinPriceStub.calledOnce).to.be.true
      expect(getCoinPriceStub.calledWithExactly(ZeroAddress, NetworksEnum.ethereumMainnet, undefined)).to.be.true
    })
  })

  describe('fetchHistoricalRate', () => {
    it('should fetch historical rate with address', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              value: 100.5,
            },
          ],
        },
      }
      const axiosPostStub = sandbox.stub(axios, 'post').resolves(mockResponse)

      const params = {
        address: ZeroAddress,
        network: NetworksEnum.ethereumMainnet,
        symbol: 'ETH',
        timestamp: dayjs().unix(),
      }

      const result = await RateModule.fetchHistoricalRate(params)

      expect(result).to.equal('100.5')
      expect(axiosPostStub.calledOnce).to.be.true
    })

    it('should fetch historical rate with symbol', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              value: 50.25,
            },
          ],
        },
      }
      const axiosPostStub = sandbox.stub(axios, 'post').resolves(mockResponse)

      const params = {
        address: null,
        network: NetworksEnum.ethereumMainnet,
        symbol: 'USDC',
        timestamp: dayjs().unix(),
      }

      const result = await RateModule.fetchHistoricalRate(params)

      expect(result).to.equal('50.25')
      expect(axiosPostStub.calledOnce).to.be.true
    })

    it('should return "0" when axios request fails', async () => {
      const axiosPostStub = sandbox.stub(axios, 'post').rejects(new Error('Network error'))

      const params = {
        address: ZeroAddress,
        network: NetworksEnum.ethereumMainnet,
        symbol: 'ETH',
        timestamp: dayjs().unix(),
      }

      const result = await RateModule.fetchHistoricalRate(params)

      expect(result).to.equal('0')
      expect(axiosPostStub.calledOnce).to.be.true
    })

    it('should return "0" for test networks', async () => {
      const axiosPostStub = sandbox.stub(axios, 'post')
      sandbox.stub(CovalentHelper, 'skipTestNetworks').value({ [NetworksEnum.ethereumSepolia]: true })

      const params = {
        address: ZeroAddress,
        network: NetworksEnum.ethereumSepolia,
        symbol: 'ETH',
        timestamp: dayjs().unix(),
      }

      const result = await RateModule.fetchHistoricalRate(params)

      expect(result).to.equal('0')
      expect(axiosPostStub.called).to.be.false
    })
  })
})
