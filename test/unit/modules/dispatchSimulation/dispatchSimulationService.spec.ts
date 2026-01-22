import { Models } from '@dbModels'
import ProviderModule from '@modules/provider'
import TenderlyModule from '@modules/tenderly'
import { simulateDispatchSummary } from '@modules/dispatchSimulation/dispatchSimulationService'
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
})
