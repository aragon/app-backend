import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import RoutescanProvider from '@modules/proxyProvider/routescanProvider'
import ProxyUtils from '@modules/proxyProvider/utils'
import { IContractAddressType, NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('RoutescanProvider', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getTokenBalances', () => {
    it('should call evmExplorerClient and enrichTokenBalances', async () => {
      const address = '0x123'
      const network = NetworksEnum.chilizMainnet
      const mockTokensBalance = [
        {
          contractAddress: '0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fb',
          tokenBalance: '1.0',
          originalBalance: '1000000000000000000',
          priceUsd: '10.5',
        },
      ]
      const enrichedResult = [
        {
          contractAddress: '0x5f1680d0c2c5e9d3615a036fbdc7432e7bf246fb',
          tokenBalance: '1.0',
          originalBalance: '1000000000000000000',
          priceUsd: '10.5',
        },
      ]

      const getTokenBalancesStub = sandbox.stub(evmExplorerClient, 'getTokenBalances').resolves(mockTokensBalance)
      const enrichStub = sandbox.stub(ProxyUtils, 'enrichTokenBalances').resolves(enrichedResult)

      const result = await RoutescanProvider.getTokenBalances({ address, network })

      expect(getTokenBalancesStub.calledOnceWith(EvmExplorerEnum.ROUTESCAN, address, network)).to.be.true
      expect(enrichStub.calledOnceWith(mockTokensBalance, network)).to.be.true
      expect(result).to.deep.equal(enrichedResult)
    })
  })

  describe('fetchContractCreation', () => {
    it('should call evmExplorerClient with ROUTESCAN', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet
      const expectedResult = {
        blockNumber: 100,
        transactionHash: '0xtxhash',
        address,
      }

      const stub = sandbox.stub(evmExplorerClient, 'fetchContractCreation').resolves(expectedResult)

      const result = await RoutescanProvider.fetchContractCreation({ address, network })

      expect(stub.calledOnceWith(EvmExplorerEnum.ROUTESCAN, address, network)).to.be.true
      expect(result).to.deep.equal(expectedResult)
    })
  })

  describe('fetchContractSourceCode', () => {
    it('should call evmExplorerClient with ROUTESCAN', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.cornMainnet
      const expectedResult = [
        {
          SourceCode: 'contract source code',
          ContractName: 'TestContract',
          ABI: '[]',
        },
      ]

      const stub = sandbox.stub(evmExplorerClient, 'fetchContractSourceCode').resolves(expectedResult)

      const result = await RoutescanProvider.fetchContractSourceCode({ address, network })

      expect(stub.calledOnceWith(EvmExplorerEnum.ROUTESCAN, address, network)).to.be.true
      expect(result).to.deep.equal(expectedResult)
    })
  })

  describe('searchDetailsOfContract', () => {
    it('should return contract name from source code', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet
      const sourceCode = [{ ContractName: 'TestContract' }]

      sandbox.stub(evmExplorerClient, 'fetchContractSourceCode').resolves(sourceCode as any)

      const result = await RoutescanProvider.searchDetailsOfContract({ address, network })

      expect(result).to.deep.equal({
        type: IContractAddressType.ADDRESS,
        name: 'TestContract',
      })
    })

    it('should return null name when contract source code is not available', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.chilizMainnet

      sandbox.stub(evmExplorerClient, 'fetchContractSourceCode').resolves(null)

      const result = await RoutescanProvider.searchDetailsOfContract({ address, network })

      expect(result).to.deep.equal({
        type: IContractAddressType.ADDRESS,
        name: null,
      })
    })

    it('should return null name when contract source code is empty array', async () => {
      const address = '0xcontract'
      const network = NetworksEnum.cornMainnet

      sandbox.stub(evmExplorerClient, 'fetchContractSourceCode').resolves([])

      const result = await RoutescanProvider.searchDetailsOfContract({ address, network })

      expect(result).to.deep.equal({
        type: IContractAddressType.ADDRESS,
        name: null,
      })
    })
  })
})
