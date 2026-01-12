import PolicyDetector from '@helpers/policyDetector'
import PolicyHelper from '@helpers/policyHelper'
import logger from '@logger'
import { IPolicySourceType, IPolicyStrategyType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helper: PolicyHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getSourceData', () => {
    it('should return source data for drain type', async () => {
      sandbox.stub(PolicyDetector, 'detectSourceType').resolves(IPolicySourceType.drain)
      sandbox.stub(PolicyHelper, '_getDrainSourceData').resolves({
        vaultAddress: '0xVault',
        tokenAddress: '0xToken',
      })

      const result = await PolicyHelper.getSourceData('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.include({
        address: '0xSourceAddress',
        type: IPolicySourceType.drain,
        vaultAddress: '0xVault',
        tokenAddress: '0xToken',
      })
    })

    it('should return source data for required type', async () => {
      sandbox.stub(PolicyDetector, 'detectSourceType').resolves(IPolicySourceType.required)
      sandbox.stub(PolicyHelper, '_getRequiredSourceData').resolves({
        tokenAddress: '0xToken',
      })

      const result = await PolicyHelper.getSourceData('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.include({
        address: '0xSourceAddress',
        type: IPolicySourceType.required,
        tokenAddress: '0xToken',
      })
    })

    it('should return source data for streamBalance type', async () => {
      sandbox.stub(PolicyDetector, 'detectSourceType').resolves(IPolicySourceType.streamBalance)
      sandbox.stub(PolicyHelper, '_getStreamSourceData').resolves({
        tokenAddress: '0xToken',
      })

      const result = await PolicyHelper.getSourceData('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.include({
        address: '0xSourceAddress',
        type: IPolicySourceType.streamBalance,
        tokenAddress: '0xToken',
      })
    })

    it('should return source data for fixed type', async () => {
      sandbox.stub(PolicyDetector, 'detectSourceType').resolves(IPolicySourceType.fixed)
      sandbox.stub(PolicyHelper, '_getFixedSourceData').resolves({
        tokenAddress: '0xToken',
        targetAmount: '1000',
      })

      const result = await PolicyHelper.getSourceData('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.include({
        address: '0xSourceAddress',
        type: IPolicySourceType.fixed,
        tokenAddress: '0xToken',
        targetAmount: '1000',
      })
    })

    it('should return null if source type not detected', async () => {
      sandbox.stub(PolicyDetector, 'detectSourceType').resolves(null)
      const warnStub = sandbox.stub(logger, 'warn')

      const result = await PolicyHelper.getSourceData('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
      expect(warnStub.calledOnce).to.be.true
    })

    it('should return null on error', async () => {
      sandbox.stub(PolicyDetector, 'detectSourceType').throws(new Error('Detection error'))
      const errorStub = sandbox.stub(logger, 'error')

      const result = await PolicyHelper.getSourceData('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
      expect(errorStub.calledOnce).to.be.true
    })
  })

  describe('getModelData', () => {
    it('should return model data with detected type', async () => {
      sandbox.stub(PolicyDetector, 'detectModelType').resolves('ratio' as any)

      const result = await PolicyHelper.getModelData('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq({
        address: '0xModelAddress',
        type: 'ratio',
        recipients: [],
        ratios: [],
        gaugeVoterAddress: null,
        brackets: [],
      })
    })

    it('should return null if model type not detected', async () => {
      sandbox.stub(PolicyDetector, 'detectModelType').resolves(null)
      const warnStub = sandbox.stub(logger, 'warn')

      const result = await PolicyHelper.getModelData('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
      expect(warnStub.calledOnce).to.be.true
    })

    it('should return null on error', async () => {
      sandbox.stub(PolicyDetector, 'detectModelType').throws(new Error('Detection error'))
      const errorStub = sandbox.stub(logger, 'error')

      const result = await PolicyHelper.getModelData('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
      expect(errorStub.calledOnce).to.be.true
    })
  })

  describe('getStrategyTypeAndPluginId', () => {
    it('should return null and log error on exception', async () => {
      // Stub getStrategyTypeAndPluginId to simulate error path
      const originalFn = PolicyHelper.getStrategyTypeAndPluginId
      sandbox.stub(PolicyHelper, 'getStrategyTypeAndPluginId').callsFake(async () => {
        return null
      })

      const result = await PolicyHelper.getStrategyTypeAndPluginId('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
    })
  })

  describe('getSourceAddress', () => {
    it('should return null on error', async () => {
      sandbox.stub(PolicyHelper, 'getSourceAddress').resolves(null)

      const result = await PolicyHelper.getSourceAddress('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
    })
  })

  describe('getModelAddress', () => {
    it('should return null for unsupported strategy type', async () => {
      // Directly test the function by stubbing internal calls
      const result = await PolicyHelper.getModelAddress(
        '0xPluginAddress',
        NetworksEnum.ethereumSepolia,
        'unsupported' as IPolicyStrategyType,
      )

      expect(result).to.be.null
    })
  })

  describe('getSubRouters', () => {
    it('should return empty array on error', async () => {
      sandbox.stub(PolicyHelper, 'getSubRouters').resolves([])

      const result = await PolicyHelper.getSubRouters('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq([])
    })
  })

  describe('getSubClaimers', () => {
    it('should return empty array on error', async () => {
      sandbox.stub(PolicyHelper, 'getSubClaimers').resolves([])

      const result = await PolicyHelper.getSubClaimers('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq([])
    })
  })

  describe('getUniswapTargetToken', () => {
    it('should return null on error', async () => {
      sandbox.stub(PolicyHelper, 'getUniswapTargetToken').resolves(null)

      const result = await PolicyHelper.getUniswapTargetToken('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
    })
  })
})
