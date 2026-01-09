import config from '@config'
import * as retryRequestModule from '@helpers/retryRequest'
import RouteScanHelper from '@helpers/routeScanHelper'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import axios from 'axios'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers: RouteScan', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    // Stub retryRequest to execute immediately without retries
    sandbox.stub(retryRequestModule, 'retryRequest').callsFake(async fn => {
      try {
        return await fn()
      } catch (error) {
        throw error
      }
    })
    // Stub BottleneckModule rate limiter to execute immediately without delays
    sandbox.stub(BottleneckModule, 'getEtherScanLimiter').returns({
      schedule: sandbox.stub().callsFake(async fn => fn()),
    } as any)
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('axiosInstance', () => {
    it('should create axios instance with default URL segment', async () => {
      const stubAxios = sandbox.stub(axios, 'create')

      sandbox.stub(config, 'ROUTESCAN_API').value({
        BASE_URI: 'https://api.routescan.io/v2/network/mainnet/evm',
      })

      RouteScanHelper.axiosInstance(1)

      expect(stubAxios.calledOnce).to.be.true
      expect(stubAxios.firstCall.args[0]).to.deep.include({
        baseURL: 'https://api.routescan.io/v2/network/mainnet/evm/1/etherscan/api',
      })
    })

    it('should create axios instance with custom URL segment', async () => {
      const stubAxios = sandbox.stub(axios, 'create')

      sandbox.stub(config, 'ROUTESCAN_API').value({
        BASE_URI: 'https://api.routescan.io/v2/network/mainnet/evm',
      })

      RouteScanHelper.axiosInstance(1, 'custom/path')

      expect(stubAxios.calledOnce).to.be.true
      expect(stubAxios.firstCall.args[0]).to.deep.include({
        baseURL: 'https://api.routescan.io/v2/network/mainnet/evm/1/custom/path',
      })
    })
  })

  describe('_rpCall', () => {
    it('Should make a successful _rpCall with default URL segment', async () => {
      const expectedResult = { data: { status: '1', message: 'OK', result: [{ SourceCode: 'code' }] } }
      const getCall = sandbox.stub().resolves(expectedResult)
      const axiosInstanceStub = sandbox.stub(RouteScanHelper, 'axiosInstance').returns({
        get: getCall,
      } as any)

      sandbox.stub(ProviderModule, 'getChainId').returns(1)

      sandbox.stub(config, 'ROUTESCAN_API').value({
        BASE_URI: 'https://api.routescan.io/v2/network/mainnet/evm',
      })

      const result = await RouteScanHelper._rpCall(
        {
          module: 'contract',
          action: 'getsourcecode',
        },
        NetworksEnum.ethereumMainnet,
      )

      expect(result).to.deep.equal(expectedResult.data)
      expect(axiosInstanceStub.calledOnce).to.be.true
      expect(axiosInstanceStub.firstCall.args[1]).to.equal('')
      expect(getCall.calledOnce).to.be.true
      expect(getCall.firstCall.args[1]).to.be.deep.equal({
        params: {
          module: 'contract',
          action: 'getsourcecode',
        },
      })
    })

    it('Should make a successful _rpCall with custom URL segment', async () => {
      const expectedResult = { data: { items: [{}], count: 100 } }
      const getCall = sandbox.stub().resolves(expectedResult)
      const axiosInstanceStub = sandbox.stub(RouteScanHelper, 'axiosInstance').returns({
        get: getCall,
      } as any)

      sandbox.stub(ProviderModule, 'getChainId').returns(1)

      sandbox.stub(config, 'ROUTESCAN_API').value({
        BASE_URI: 'https://api.routescan.io/v2/network/mainnet/evm',
      })

      const result = await RouteScanHelper._rpCall(
        { count: true, limit: 1 },
        NetworksEnum.ethereumMainnet,
        'custom/path',
      )

      expect(result).to.deep.equal(expectedResult.data)
      expect(axiosInstanceStub.calledOnce).to.be.true
      expect(axiosInstanceStub.firstCall.args[1]).to.equal('custom/path')
      expect(getCall.calledOnce).to.be.true
      expect(getCall.firstCall.args[1]).to.be.deep.equal({
        params: { count: true, limit: 1 },
      })
    })

    it('Should handle errors in _rpCall', async () => {
      sandbox.stub(ProviderModule, 'getChainId').throws(new Error('fake-error'))
      const loggerStub = sandbox.stub(logger, 'error')

      await expect(
        RouteScanHelper._rpCall(
          {
            module: 'contract',
            action: 'getsourcecode',
          },
          NetworksEnum.ethereumMainnet,
        ),
      ).to.be.rejectedWith(Error, 'fake-error')

      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('Error in RouteScan API call')
    })
  })

  describe('fetchTokenHoldersCount', () => {
    it('should fetch token holders count successfully', async () => {
      const mockResponse = {
        items: [{}],
        count: 567,
      }

      const rpcCallStub = sandbox.stub(RouteScanHelper, '_rpCall').resolves(mockResponse)

      const result = await RouteScanHelper.fetchTokenHoldersCount({
        address: '0xf96e6FD76BD0A15580604e1Ea5818D448b1041C0',
        network: NetworksEnum.ethereumSepolia,
      })

      expect(result).to.equal(567)
      expect(rpcCallStub.calledOnce).to.be.true
      expect(rpcCallStub.firstCall.args[0]).to.deep.equal({
        count: true,
        limit: 1,
      })
      expect(rpcCallStub.firstCall.args[1]).to.equal(NetworksEnum.ethereumSepolia)
      expect(rpcCallStub.firstCall.args[2]).to.equal('erc20/0xf96e6FD76BD0A15580604e1Ea5818D448b1041C0/holders')
    })

    it('should return 0 if API response does not have expected format', async () => {
      const mockResponse = {
        items: [],
        // No count property
      }

      sandbox.stub(RouteScanHelper, '_rpCall').resolves(mockResponse)

      const result = await RouteScanHelper.fetchTokenHoldersCount({
        address: '0xf96e6FD76BD0A15580604e1Ea5818D448b1041C0',
        network: NetworksEnum.ethereumSepolia,
      })

      expect(result).to.equal(0)
    })

    it('should handle errors when fetching token holders count fails', async () => {
      const expectedError = new Error('Failed to fetch token holders count')
      sandbox.stub(RouteScanHelper, '_rpCall').rejects(expectedError)
      const loggerStub = sandbox.stub(logger, 'warn')

      const result = await RouteScanHelper.fetchTokenHoldersCount({
        address: '0xf96e6FD76BD0A15580604e1Ea5818D448b1041C0',
        network: NetworksEnum.ethereumSepolia,
      })

      expect(result).to.equal(0)
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.args[0][0]).to.include('Error fetching token holders count from RouteScan')
    })
  })
})
