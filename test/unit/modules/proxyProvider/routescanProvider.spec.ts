import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import RoutescanProvider from '@modules/proxyProvider/routescanProvider'
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
