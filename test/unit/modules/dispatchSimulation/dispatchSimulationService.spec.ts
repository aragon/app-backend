import { Models } from '@dbModels'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import TenderlyModule from '@modules/tenderly'
import dispatchSimulationService, {
  simulateDispatchSummary,
} from '@modules/dispatchSimulation/dispatchSimulationService'
import { createAddressMapper } from '@modules/dispatchSimulation/addressMapper'
import { IPluginStatus, ISimulationStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Module: dispatchSimulation/dispatchSimulationService', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  const mockPolicy = {
    address: '0x1234567890123456789012345678901234567890',
    daoAddress: '0xDAODAODAODAODAODAODAODAODAODAODAODAODAOD',
    network: NetworksEnum.ethereumMainnet,
    isPolicy: true,
    status: IPluginStatus.installed,
  }

  const mockDao = {
    address: '0xDAODAODAODAODAODAODAODAODAODAODAODAODAOD',
    name: 'Test DAO',
    subDaos: [],
  }

  const mockTenderlySuccessResult = {
    status: ISimulationStatus.SUCCESS,
    shareUrl: 'https://tenderly.co/simulation/abc123',
    assetChanges: [],
    balanceChanges: [],
    contracts: [],
  }

  describe('simulateDispatchSummary', () => {
    it('should return failed result when policy not found', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(null)

      await expect(
        simulateDispatchSummary(mockPolicy.address, NetworksEnum.ethereumMainnet, '0xfrom'),
      ).to.be.rejectedWith('badSimulationRequest')
    })

    it('should return failed result when DAO not found', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPolicy)
      sandbox.stub(Models.Dao, 'getDaoDetailsWithoutPlugins').resolves(null)

      await expect(
        simulateDispatchSummary(mockPolicy.address, NetworksEnum.ethereumMainnet, '0xfrom'),
      ).to.be.rejectedWith('badSimulationRequest')
    })

    it('should return failed result when Tenderly returns false', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPolicy)
      sandbox.stub(Models.Dao, 'getDaoDetailsWithoutPlugins').resolves(mockDao)
      sandbox.stub(TenderlyModule, 'simulateFull').resolves(false)

      const result = await simulateDispatchSummary(mockPolicy.address, NetworksEnum.ethereumMainnet, '0xfrom')

      expect(result.status).to.equal('failed')
      expect(result.error).to.equal('Tenderly simulation failed or not configured')
    })

    it('should return failed result when Tenderly simulation fails', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPolicy)
      sandbox.stub(Models.Dao, 'getDaoDetailsWithoutPlugins').resolves(mockDao)
      sandbox.stub(TenderlyModule, 'simulateFull').resolves({
        ...mockTenderlySuccessResult,
        status: ISimulationStatus.FAILED,
        error: 'execution reverted',
      })

      await expect(
        simulateDispatchSummary(mockPolicy.address, NetworksEnum.ethereumMainnet, '0xfrom'),
      ).to.be.rejectedWith('badSimulationRequest')
    })

    it('should return success result with empty summary when no asset changes', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPolicy)
      sandbox.stub(Models.Dao, 'getDaoDetailsWithoutPlugins').resolves(mockDao)
      sandbox.stub(TenderlyModule, 'simulateFull').resolves(mockTenderlySuccessResult)
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(null)

      const result = await simulateDispatchSummary(mockPolicy.address, NetworksEnum.ethereumMainnet, '0xfrom')

      expect(result.status).to.equal('success')
      expect(result.tenderlyUrl).to.equal('https://tenderly.co/simulation/abc123')
      expect(result.summaryGroups).to.deep.equal([])
    })

    it('should call TenderlyModule.simulateFull with correct params', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPolicy)
      sandbox.stub(Models.Dao, 'getDaoDetailsWithoutPlugins').resolves(mockDao)
      const simulateFullStub = sandbox.stub(TenderlyModule, 'simulateFull').resolves(mockTenderlySuccessResult)
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(null)

      const fromAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
      await simulateDispatchSummary(mockPolicy.address, NetworksEnum.ethereumMainnet, fromAddress)

      expect(simulateFullStub.calledOnce).to.be.true
      const [simulation, network] = simulateFullStub.firstCall.args
      expect(simulation.to).to.equal(mockPolicy.address)
      expect(simulation.from).to.equal(fromAddress)
      expect(simulation.value).to.equal('0')
      expect(simulation.data).to.equal('0xc6c4df0c') // default dispatch() selector
      expect(network).to.equal(NetworksEnum.ethereumMainnet)

      // Test with custom data
      await simulateDispatchSummary(mockPolicy.address, NetworksEnum.ethereumMainnet, fromAddress, '0xcustomdata')
      expect(simulateFullStub.secondCall.args[0].data).to.equal('0xcustomdata')
    })

    it('should process asset changes and create summary groups', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPolicy)
      sandbox.stub(Models.Dao, 'getDaoDetailsWithoutPlugins').resolves(mockDao)

      const externalAddress = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
      sandbox.stub(TenderlyModule, 'simulateFull').resolves({
        ...mockTenderlySuccessResult,
        assetChanges: [
          {
            type: 'Transfer',
            from: mockDao.address,
            to: externalAddress,
            amount: '100',
            raw_amount: '100000000',
            token_info: {
              standard: 'ERC20',
              type: 'Fungible',
              contract_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              symbol: 'USDC',
              name: 'USDC',
              decimals: 6,
            },
          },
        ],
      })
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(null)

      const result = await simulateDispatchSummary(mockPolicy.address, NetworksEnum.ethereumMainnet, '0xfrom')

      expect(result.status).to.equal('success')
      expect(result.summaryGroups).to.have.length(2)

      const daoGroup = result.summaryGroups.find(g => g.kind === 'dao')
      const externalGroup = result.summaryGroups.find(g => g.kind === 'external')

      expect(daoGroup).to.exist
      expect(daoGroup!.items[0].label).to.equal('Test DAO')
      expect(daoGroup!.items[0].tokens[0].amount).to.equal('-100.0')

      expect(externalGroup).to.exist
      expect(externalGroup!.items[0].tokens[0].amount).to.equal('100.0')
    })

    it('should include contracts in address mapping', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPolicy)
      sandbox.stub(Models.Dao, 'getDaoDetailsWithoutPlugins').resolves(mockDao)

      const contractAddress = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'
      sandbox.stub(TenderlyModule, 'simulateFull').resolves({
        ...mockTenderlySuccessResult,
        contracts: [
          {
            address: contractAddress,
            contract_name: 'UniswapV3Pool',
          },
        ],
        assetChanges: [
          {
            type: 'Transfer',
            from: mockDao.address,
            to: contractAddress,
            amount: '50',
            raw_amount: '50000000',
            token_info: {
              standard: 'ERC20',
              type: 'Fungible',
              contract_address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              symbol: 'USDC',
              name: 'USDC',
              decimals: 6,
            },
          },
        ],
      })
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(null)

      const result = await simulateDispatchSummary(mockPolicy.address, NetworksEnum.ethereumMainnet, '0xfrom')

      const externalGroup = result.summaryGroups.find(g => g.kind === 'external')
      expect(externalGroup).to.exist

      const contractItem = externalGroup!.items.find(i => i.address === contractAddress.toLowerCase())
      expect(contractItem).to.exist
      expect(contractItem!.label).to.equal('UniswapV3Pool')
      expect(contractItem!.role).to.equal('contract')
    })
  })

  describe('enrichMapperWithOnChainContracts', () => {
    it('should detect contract and update mapper when provider returns bytecode', async () => {
      const mockProvider = {
        getCode: sinon.stub().resolves('0x608060405234801561001057600080fd5b50'),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

      const mockLimiter = {
        schedule: sinon.stub().callsFake(async (fn: () => Promise<any>) => fn()),
      }
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns(mockLimiter as any)

      const mapper = createAddressMapper({ network: NetworksEnum.ethereumMainnet })
      const unknownAddress = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

      // Before: address is unknown wallet
      expect(mapper.resolve(unknownAddress).role).to.equal('wallet')

      await dispatchSimulationService.enrichMapperWithOnChainContracts({
        network: NetworksEnum.ethereumMainnet,
        addresses: [unknownAddress],
        mapper,
      })

      // After: address is detected as contract
      expect(mapper.resolve(unknownAddress).role).to.equal('contract')
      expect(mapper.resolve(unknownAddress).isKnown).to.equal(false)
    })

    it('should not update mapper when provider returns empty bytecode (0x)', async () => {
      const mockProvider = {
        getCode: sinon.stub().resolves('0x'),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

      const mockLimiter = {
        schedule: sinon.stub().callsFake(async (fn: () => Promise<any>) => fn()),
      }
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns(mockLimiter as any)

      const mapper = createAddressMapper({ network: NetworksEnum.ethereumMainnet })
      const unknownAddress = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

      await dispatchSimulationService.enrichMapperWithOnChainContracts({
        network: NetworksEnum.ethereumMainnet,
        addresses: [unknownAddress],
        mapper,
      })

      // Address remains wallet since no contract code
      expect(mapper.resolve(unknownAddress).role).to.equal('wallet')
    })

    it('should skip address if already known (not wallet)', async () => {
      const mockProvider = {
        getCode: sinon.stub().resolves('0x608060405234801561001057600080fd5b50'),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

      const mockLimiter = {
        schedule: sinon.stub().callsFake(async (fn: () => Promise<any>) => fn()),
      }
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns(mockLimiter as any)

      const contractAddress = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'
      const mapper = createAddressMapper({
        network: NetworksEnum.ethereumMainnet,
        contracts: [{ address: contractAddress, contract_name: 'KnownContract' }],
      })

      await dispatchSimulationService.enrichMapperWithOnChainContracts({
        network: NetworksEnum.ethereumMainnet,
        addresses: [contractAddress],
        mapper,
      })

      // getCode should not be called since address is already known as contract
      expect(mockProvider.getCode.called).to.be.false
    })

    it('should handle provider error gracefully and continue', async () => {
      const mockProvider = {
        getCode: sinon.stub().rejects(new Error('RPC error')),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

      const mockLimiter = {
        schedule: sinon.stub().callsFake(async (fn: () => Promise<any>) => fn()),
      }
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns(mockLimiter as any)

      const mapper = createAddressMapper({ network: NetworksEnum.ethereumMainnet })
      const unknownAddress = '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'

      // Should not throw
      await dispatchSimulationService.enrichMapperWithOnChainContracts({
        network: NetworksEnum.ethereumMainnet,
        addresses: [unknownAddress],
        mapper,
      })

      // Address remains wallet since detection failed
      expect(mapper.resolve(unknownAddress).role).to.equal('wallet')
    })

    it('should deduplicate and limit addresses to 50', async () => {
      const mockProvider = {
        getCode: sinon.stub().resolves('0x608060405234801561001057600080fd5b50'),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

      const mockLimiter = {
        schedule: sinon.stub().callsFake(async (fn: () => Promise<any>) => fn()),
      }
      sandbox.stub(BottleneckModule, 'getNodeLimiter').returns(mockLimiter as any)

      const mapper = createAddressMapper({ network: NetworksEnum.ethereumMainnet })

      // Create 60 addresses (more than limit of 50), starting from 1 to avoid burn address (0x000...000)
      const addresses: string[] = []
      for (let i = 1; i <= 60; i++) {
        addresses.push(`0x${i.toString(16).padStart(40, '0')}`)
      }
      // Add duplicates
      addresses.push(addresses[0], addresses[1])

      await dispatchSimulationService.enrichMapperWithOnChainContracts({
        network: NetworksEnum.ethereumMainnet,
        addresses,
        mapper,
      })

      // Should only call getCode 50 times (limit) despite 62 addresses (60 unique + 2 duplicates)
      expect(mockProvider.getCode.callCount).to.equal(50)
    })
  })
})
