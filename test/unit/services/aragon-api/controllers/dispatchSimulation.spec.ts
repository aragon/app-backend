import { Models } from '@dbModels'
import ProviderModule from '@modules/provider'
import TenderlyModule from '@modules/tenderly'
import DispatchSimulationController from '@services/aragon-api/controllers/dispatchSimulation'
import { IPluginStatus, ISimulationStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Controller: DispatchSimulation', () => {
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
    it('should return success result when simulation succeeds', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPolicy)
      sandbox.stub(Models.Dao, 'getDaoDetailsWithoutPlugins').resolves(mockDao)
      sandbox.stub(TenderlyModule, 'simulateFull').resolves(mockTenderlySuccessResult)
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(null)

      const result = await DispatchSimulationController.simulateDispatchSummary(
        mockPolicy.address,
        NetworksEnum.ethereumMainnet,
        '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      )

      expect(result.status).to.equal('success')
      expect(result.tenderlyUrl).to.equal('https://tenderly.co/simulation/abc123')
    })

    it('should pass custom data to simulation', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(mockPolicy)
      sandbox.stub(Models.Dao, 'getDaoDetailsWithoutPlugins').resolves(mockDao)
      const simulateStub = sandbox.stub(TenderlyModule, 'simulateFull').resolves(mockTenderlySuccessResult)
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(null)

      const customData = '0xcustomdata'
      await DispatchSimulationController.simulateDispatchSummary(
        mockPolicy.address,
        NetworksEnum.ethereumMainnet,
        '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        customData,
      )

      expect(simulateStub.firstCall.args[0].data).to.equal(customData)
    })

    it('should throw error when policy not found', async () => {
      sandbox.stub(Models.Plugin, 'findOne').resolves(null)

      await expect(
        DispatchSimulationController.simulateDispatchSummary(
          '0x1234567890123456789012345678901234567890',
          NetworksEnum.ethereumMainnet,
          '0xfrom',
        ),
      ).to.be.rejectedWith('badSimulationRequest')
    })
  })
})
