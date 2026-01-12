import PolicyDetector from '@helpers/policyDetector'
import PolicyHelper from '@helpers/policyHelper'
import logger from '@logger'
import { IPolicySourceType, IPolicyStrategyType, NetworksEnum } from '@types'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
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

  describe('_getDrainSourceData', () => {
    it('should return vault and token address when contract calls succeed', async () => {
      const stubVault = sandbox.stub().resolves('0xVaultAddress')
      const stubToken = sandbox.stub().resolves('0xTokenAddress')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { vault: stubVault, token: stubToken }
          },
        },
      })

      const result = await MockedPolicyHelper._getDrainSourceData('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq({
        vaultAddress: '0xVaultAddress',
        tokenAddress: '0xTokenAddress',
      })
      expect(stubVault.calledOnce).to.be.true
      expect(stubToken.calledOnce).to.be.true
    })
  })

  describe('_getRequiredSourceData', () => {
    it('should return token address when contract call succeeds', async () => {
      const stubToken = sandbox.stub().resolves('0xTokenAddress')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { token: stubToken }
          },
        },
      })

      const result = await MockedPolicyHelper._getRequiredSourceData('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq({
        tokenAddress: '0xTokenAddress',
      })
      expect(stubToken.calledOnce).to.be.true
    })
  })

  describe('_getStreamSourceData', () => {
    it('should return token address when contract call succeeds', async () => {
      const stubToken = sandbox.stub().resolves('0xStreamTokenAddress')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { token: stubToken }
          },
        },
      })

      const result = await MockedPolicyHelper._getStreamSourceData('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq({
        tokenAddress: '0xStreamTokenAddress',
      })
      expect(stubToken.calledOnce).to.be.true
    })
  })

  describe('_getFixedSourceData', () => {
    it('should return token address and target amount when contract calls succeed', async () => {
      const stubToken = sandbox.stub().resolves('0xFixedTokenAddress')
      const stubSourceBalance = sandbox.stub().resolves(BigInt(1000000))

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { token: stubToken, sourceBalance: stubSourceBalance }
          },
        },
      })

      const result = await MockedPolicyHelper._getFixedSourceData('0xSourceAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq({
        tokenAddress: '0xFixedTokenAddress',
        targetAmount: '1000000',
      })
      expect(stubToken.calledOnce).to.be.true
      expect(stubSourceBalance.calledOnce).to.be.true
    })
  })

  describe('_getGaugeModelData', () => {
    it('should return gauge voter address when contract call succeeds', async () => {
      const stubGaugeVoter = sandbox.stub().resolves('0xGaugeVoterAddress')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { gaugeVoter: stubGaugeVoter }
          },
        },
      })

      const result = await MockedPolicyHelper._getGaugeModelData('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq({
        gaugeVoterAddress: '0xGaugeVoterAddress',
      })
      expect(stubGaugeVoter.calledOnce).to.be.true
    })
  })

  describe('_getRatioModelData', () => {
    it('should return recipients and ratios when contract calls succeed', async () => {
      const stubRecipientCount = sandbox.stub().resolves(BigInt(2))
      let recipientCallCount = 0
      let ratioCallCount = 0
      const stubRecipients = sandbox.stub().callsFake(() => {
        recipientCallCount++
        return Promise.resolve(`0xRecipient${recipientCallCount}`)
      })
      const stubRatios = sandbox.stub().callsFake(() => {
        ratioCallCount++
        return Promise.resolve(BigInt(5000))
      })

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return {
              recipientCount: stubRecipientCount,
              recipients: stubRecipients,
              ratios: stubRatios,
            }
          },
        },
      })

      const result = await MockedPolicyHelper._getRatioModelData('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq({
        recipients: ['0xRecipient1', '0xRecipient2'],
        ratios: [5000, 5000],
      })
      expect(stubRecipientCount.calledOnce).to.be.true
    })

    it('should return empty arrays when recipient count is zero', async () => {
      const stubRecipientCount = sandbox.stub().resolves(BigInt(0))

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return {
              recipientCount: stubRecipientCount,
              recipients: sandbox.stub(),
              ratios: sandbox.stub(),
            }
          },
        },
      })

      const result = await MockedPolicyHelper._getRatioModelData('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq({
        recipients: [],
        ratios: [],
      })
    })
  })

  describe('_getEqualRatioModelData', () => {
    it('should return recipients when contract calls succeed', async () => {
      const stubRecipientCount = sandbox.stub().resolves(BigInt(3))
      let recipientCallCount = 0
      const stubRecipients = sandbox.stub().callsFake(() => {
        recipientCallCount++
        return Promise.resolve(`0xEqualRecipient${recipientCallCount}`)
      })

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return {
              recipientCount: stubRecipientCount,
              recipients: stubRecipients,
            }
          },
        },
      })

      const result = await MockedPolicyHelper._getEqualRatioModelData('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq({
        recipients: ['0xEqualRecipient1', '0xEqualRecipient2', '0xEqualRecipient3'],
      })
      expect(stubRecipientCount.calledOnce).to.be.true
    })

    it('should return empty array when recipient count is zero', async () => {
      const stubRecipientCount = sandbox.stub().resolves(BigInt(0))

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return {
              recipientCount: stubRecipientCount,
              recipients: sandbox.stub(),
            }
          },
        },
      })

      const result = await MockedPolicyHelper._getEqualRatioModelData('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq({
        recipients: [],
      })
    })
  })

  describe('_getBracketsModelData', () => {
    it('should return brackets when contract calls succeed', async () => {
      let callCount = 0
      const stubBrackets = sandbox.stub().callsFake(() => {
        if (callCount < 2) {
          callCount++
          return Promise.resolve({
            threshold: BigInt(1000 * callCount),
            routerModel: `0xRouterModel${callCount}`,
            claimerModel: `0xClaimerModel${callCount}`,
          })
        }
        return Promise.reject(new Error('Array out of bounds'))
      })

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { brackets: stubBrackets }
          },
        },
      })

      const result = await MockedPolicyHelper._getBracketsModelData('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq({
        brackets: [
          { threshold: '1000', routerModelAddress: '0xRouterModel1', claimerModelAddress: '0xClaimerModel1' },
          { threshold: '2000', routerModelAddress: '0xRouterModel2', claimerModelAddress: '0xClaimerModel2' },
        ],
      })
    })

    it('should return empty brackets array when first call fails', async () => {
      const stubBrackets = sandbox.stub().rejects(new Error('Array out of bounds'))

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { brackets: stubBrackets }
          },
        },
      })

      const result = await MockedPolicyHelper._getBracketsModelData('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq({
        brackets: [],
      })
    })

    it('should set model addresses to null when they are zero address', async () => {
      const zeroAddress = '0x0000000000000000000000000000000000000000'
      let callCount = 0
      const stubBrackets = sandbox.stub().callsFake(() => {
        if (callCount < 1) {
          callCount++
          return Promise.resolve({
            threshold: BigInt(1000),
            routerModel: zeroAddress,
            claimerModel: zeroAddress,
          })
        }
        return Promise.reject(new Error('Array out of bounds'))
      })

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { brackets: stubBrackets }
          },
        },
      })

      const result = await MockedPolicyHelper._getBracketsModelData('0xModelAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq({
        brackets: [{ threshold: '1000', routerModelAddress: null, claimerModelAddress: null }],
      })
    })
  })

  describe('getStrategyTypeAndPluginId', () => {
    it('should return strategyType and policyKey when contract call succeeds', async () => {
      const stubPluginId = sandbox.stub().resolves('org.aragon.router.std')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { pluginId: stubPluginId }
          },
        },
      })

      const result = await MockedPolicyHelper.getStrategyTypeAndPluginId(
        '0xPluginAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(result).to.deep.eq({
        strategyType: IPolicyStrategyType.router,
        policyKey: 'org.aragon.router.std',
      })
      expect(stubPluginId.calledOnce).to.be.true
    })

    it('should return null when pluginId is not recognized', async () => {
      const stubPluginId = sandbox.stub().resolves('unknown.plugin.id')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { pluginId: stubPluginId }
          },
        },
      })

      const result = await MockedPolicyHelper.getStrategyTypeAndPluginId(
        '0xPluginAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(result).to.be.null
    })

    it('should return null and log error when contract call fails', async () => {
      const stubPluginId = sandbox.stub().rejects(new Error('Contract call failed'))
      const stubLogger = sandbox.stub(logger, 'error')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { pluginId: stubPluginId }
          },
        },
      })

      const result = await MockedPolicyHelper.getStrategyTypeAndPluginId(
        '0xPluginAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(result).to.be.null
      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('getSourceAddress', () => {
    it('should return source address when contract call succeeds', async () => {
      const stubSources = sandbox.stub().resolves(['0xSourceAddress'])

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { sources: stubSources }
          },
        },
      })

      const result = await MockedPolicyHelper.getSourceAddress('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.eq('0xSourceAddress')
      expect(stubSources.calledOnce).to.be.true
    })

    it('should return null and log error when contract call fails', async () => {
      const stubSources = sandbox.stub().rejects(new Error('Contract call failed'))
      const stubLogger = sandbox.stub(logger, 'error')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { sources: stubSources }
          },
        },
      })

      const result = await MockedPolicyHelper.getSourceAddress('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('getModelAddress', () => {
    it('should return null for unsupported strategy type', async () => {
      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return {}
          },
        },
      })

      const result = await MockedPolicyHelper.getModelAddress(
        '0xPluginAddress',
        NetworksEnum.ethereumSepolia,
        'unsupported' as IPolicyStrategyType,
      )

      expect(result).to.be.null
    })

    it('should return model address for router strategy type', async () => {
      const stubRouterModel = sandbox.stub().resolves('0xModelAddress')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { routerModel: stubRouterModel }
          },
        },
      })

      const result = await MockedPolicyHelper.getModelAddress(
        '0xPluginAddress',
        NetworksEnum.ethereumSepolia,
        IPolicyStrategyType.router,
      )

      expect(result).to.eq('0xModelAddress')
      expect(stubRouterModel.calledOnce).to.be.true
    })

    it('should return model address for claimer strategy type', async () => {
      const stubClaimerModel = sandbox.stub().resolves('0xClaimerModelAddress')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { claimerModel: stubClaimerModel }
          },
        },
      })

      const result = await MockedPolicyHelper.getModelAddress(
        '0xPluginAddress',
        NetworksEnum.ethereumSepolia,
        IPolicyStrategyType.claimer,
      )

      expect(result).to.eq('0xClaimerModelAddress')
      expect(stubClaimerModel.calledOnce).to.be.true
    })

    it('should return null when model address is zero address', async () => {
      const zeroAddress = '0x0000000000000000000000000000000000000000'
      const stubRouterModel = sandbox.stub().resolves(zeroAddress)

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { routerModel: stubRouterModel }
          },
        },
      })

      const result = await MockedPolicyHelper.getModelAddress(
        '0xPluginAddress',
        NetworksEnum.ethereumSepolia,
        IPolicyStrategyType.router,
      )

      expect(result).to.be.null
    })

    it('should return null and log error when contract call fails', async () => {
      const stubRouterModel = sandbox.stub().rejects(new Error('Contract call failed'))
      const stubLogger = sandbox.stub(logger, 'error')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { routerModel: stubRouterModel }
          },
        },
      })

      const result = await MockedPolicyHelper.getModelAddress(
        '0xPluginAddress',
        NetworksEnum.ethereumSepolia,
        IPolicyStrategyType.router,
      )

      expect(result).to.be.null
      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('getSubRouters', () => {
    it('should return subrouters when contract call succeeds', async () => {
      let callCount = 0
      const stubSubrouters = sandbox.stub().callsFake(() => {
        if (callCount < 2) {
          callCount++
          return Promise.resolve(`0xSubRouter${callCount}`)
        }
        return Promise.reject(new Error('Array out of bounds'))
      })

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { subrouters: stubSubrouters }
          },
        },
      })

      const result = await MockedPolicyHelper.getSubRouters('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq(['0xSubRouter1', '0xSubRouter2'])
    })

    it('should return empty array and log error when provider fails', async () => {
      const stubLogger = sandbox.stub(logger, 'error')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            throw new Error('Contract creation failed')
          },
        },
      })

      const result = await MockedPolicyHelper.getSubRouters('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq([])
      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('getSubClaimers', () => {
    it('should return subclaimers when contract call succeeds', async () => {
      let callCount = 0
      const stubSubclaimers = sandbox.stub().callsFake(() => {
        if (callCount < 2) {
          callCount++
          return Promise.resolve(`0xSubClaimer${callCount}`)
        }
        return Promise.reject(new Error('Array out of bounds'))
      })

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { subclaimers: stubSubclaimers }
          },
        },
      })

      const result = await MockedPolicyHelper.getSubClaimers('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq(['0xSubClaimer1', '0xSubClaimer2'])
    })

    it('should return empty array and log error when provider fails', async () => {
      const stubLogger = sandbox.stub(logger, 'error')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            throw new Error('Contract creation failed')
          },
        },
      })

      const result = await MockedPolicyHelper.getSubClaimers('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.deep.eq([])
      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('getUniswapTargetToken', () => {
    it('should return target token when contract call succeeds', async () => {
      const stubTargetToken = sandbox.stub().resolves('0xTargetToken')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { targetToken: stubTargetToken }
          },
        },
      })

      const result = await MockedPolicyHelper.getUniswapTargetToken('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.eq('0xTargetToken')
      expect(stubTargetToken.calledOnce).to.be.true
    })

    it('should return null when target token is zero address', async () => {
      const zeroAddress = '0x0000000000000000000000000000000000000000'
      const stubTargetToken = sandbox.stub().resolves(zeroAddress)

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { targetToken: stubTargetToken }
          },
        },
      })

      const result = await MockedPolicyHelper.getUniswapTargetToken('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
    })

    it('should return null and log error when contract call fails', async () => {
      const stubTargetToken = sandbox.stub().rejects(new Error('Contract call failed'))
      const stubLogger = sandbox.stub(logger, 'error')

      const { default: MockedPolicyHelper } = proxyquire.noCallThru()('@helpers/policyHelper', {
        ethers: {
          Contract: function () {
            return { targetToken: stubTargetToken }
          },
        },
      })

      const result = await MockedPolicyHelper.getUniswapTargetToken('0xPluginAddress', NetworksEnum.ethereumSepolia)

      expect(result).to.be.null
      expect(stubLogger.calledOnce).to.be.true
    })
  })
})
