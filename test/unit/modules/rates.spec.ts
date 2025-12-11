import sinon from 'sinon'
import { expect } from 'chai'
import { ZeroAddress } from 'ethers'
import { NetworksEnum } from '@types'
import { RateModule } from '@modules/rates'
import CoinGeckoHelper from '@helpers/coinGecko'
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
      sandbox.stub(CoinGeckoHelper, 'isTestNetwork').returns(true)

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
