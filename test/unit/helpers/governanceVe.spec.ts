import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import proxyquire from 'proxyquire'
import Web3Helper from '@helpers/web3'
import GovernanceVeHelper from '@helpers/governanceVe'

describe('Helpers: GovernanceVe', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('getEscrowAddress', () => {
    it('Should make a successful getEscrowAddress call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getEscrowStub = sandbox.stub().resolves('0x1234567890123456789012345678901234567890')

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { escrow: getEscrowStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getEscrowAddress('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq('0x1234567890123456789012345678901234567890')
      expect(getEscrowStub.calledOnce).to.be.true
    })

    it('should handle errors in getEscrowAddress', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getEscrowStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { escrow: getEscrowStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getEscrowAddress('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.be.null
      expect(getEscrowStub.calledOnce).to.be.true
    })
  })

  describe('getClockAddress', () => {
    it('Should make a successful getClockAddress call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getClockStub = sandbox.stub().resolves('0x1234567890123456789012345678901234567890')

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { clock: getClockStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getClockAddress('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq('0x1234567890123456789012345678901234567890')
      expect(getClockStub.calledOnce).to.be.true
    })

    it('should handle errors in getClockAddress', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getClockStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { clock: getClockStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getClockAddress('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.be.null
      expect(getClockStub.calledOnce).to.be.true
    })
  })

  describe('getCurveAddress', () => {
    it('Should make a successful getCurveAddress call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getCurveStub = sandbox.stub().resolves('0x1234567890123456789012345678901234567890')

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { curve: getCurveStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getCurveAddress('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq('0x1234567890123456789012345678901234567890')
      expect(getCurveStub.calledOnce).to.be.true
    })

    it('should handle errors in getCurveAddress', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getCurveStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { curve: getCurveStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getCurveAddress('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.be.null
      expect(getCurveStub.calledOnce).to.be.true
    })
  })

  describe('getExitQueueAddress', () => {
    it('Should make a successful getExitQueueAddress call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getQueueStub = sandbox.stub().resolves('0x1234567890123456789012345678901234567890')

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { queue: getQueueStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getExitQueueAddress('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq('0x1234567890123456789012345678901234567890')
      expect(getQueueStub.calledOnce).to.be.true
    })

    it('should handle errors in getExitQueueAddress', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getQueueStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { queue: getQueueStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getExitQueueAddress('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.be.null
      expect(getQueueStub.calledOnce).to.be.true
    })
  })

  describe('getNftLockAddress', () => {
    it('Should make a successful getNftLockAddress call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getLockNFTStub = sandbox.stub().resolves('0x1234567890123456789012345678901234567890')

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { lockNFT: getLockNFTStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getNftLockAddress('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq('0x1234567890123456789012345678901234567890')
      expect(getLockNFTStub.calledOnce).to.be.true
    })

    it('should handle errors in getNftLockAddress', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getLockNFTStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { lockNFT: getLockNFTStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getNftLockAddress('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.be.null
      expect(getLockNFTStub.calledOnce).to.be.true
    })
  })

  describe('getErc20TokenAddress', () => {
    it('Should make a successful getErc20TokenAddress call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getTokenStub = sandbox.stub().resolves('0x1234567890123456789012345678901234567890')

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { token: getTokenStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getErc20TokenAddress('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq('0x1234567890123456789012345678901234567890')
      expect(getTokenStub.calledOnce).to.be.true
    })

    it('should handle errors in getErc20TokenAddress', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getTokenStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { token: getTokenStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getErc20TokenAddress('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.be.null
      expect(getTokenStub.calledOnce).to.be.true
    })
  })

  describe('getMinDeposit', () => {
    it('Should make a successful getMinDeposit call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getMinDepositStub = sandbox.stub().resolves(1000000000000000000n)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { minDeposit: getMinDepositStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getMinDeposit('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(1000000000000000000n)
      expect(getMinDepositStub.calledOnce).to.be.true
    })

    it('should handle errors in getMinDeposit', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getMinDepositStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { minDeposit: getMinDepositStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getMinDeposit('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(0n)
      expect(getMinDepositStub.calledOnce).to.be.true
    })
  })

  describe('getMinLock', () => {
    it('Should make a successful getMinLock call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getMinLockStub = sandbox.stub().resolves(604800n) // 1 week in seconds

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { minLock: getMinLockStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getMinLock('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(604800n)
      expect(getMinLockStub.calledOnce).to.be.true
    })

    it('should handle errors in getMinLock', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getMinLockStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { minLock: getMinLockStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getMinLock('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(0n)
      expect(getMinLockStub.calledOnce).to.be.true
    })
  })

  describe('getCooldown', () => {
    it('Should make a successful getCooldown call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getCooldownStub = sandbox.stub().resolves(86400n) // 1 day in seconds

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { cooldown: getCooldownStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getCooldown('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(86400n)
      expect(getCooldownStub.calledOnce).to.be.true
    })

    it('should handle errors in getCooldown', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getCooldownStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { cooldown: getCooldownStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getCooldown('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(0n)
      expect(getCooldownStub.calledOnce).to.be.true
    })
  })

  describe('getMaxTime', () => {
    it('Should make a successful getMaxTime call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getMaxTimeStub = sandbox.stub().resolves(126144000n) // 4 years in seconds

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { maxTime: getMaxTimeStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getMaxTime('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(126144000n)
      expect(getMaxTimeStub.calledOnce).to.be.true
    })

    it('should handle errors in getMaxTime', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getMaxTimeStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { maxTime: getMaxTimeStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getMaxTime('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(0n)
      expect(getMaxTimeStub.calledOnce).to.be.true
    })
  })

  describe('getSettingFromCoefficients', () => {
    it('Should make a successful getSettingFromCoefficients call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getCoefficientsStub = sandbox.stub().resolves([0n, 1000000000000000000n, 0n])

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { getCoefficients: getCoefficientsStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getSettingFromCoefficients('0x123', NetworksEnum.ethereumMainnet)
      expect(result.bias).to.eq(0n)
      expect(result.slope).to.eq(1000000000000000000n)
      expect(getCoefficientsStub.calledOnce).to.be.true
    })

    it('should handle errors in getSettingFromCoefficients', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getCoefficientsStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { getCoefficients: getCoefficientsStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getSettingFromCoefficients('0x123', NetworksEnum.ethereumMainnet)
      expect(result.slope).to.eq(0n)
      expect(result.bias).to.eq(0n)
      expect(getCoefficientsStub.calledOnce).to.be.true
    })
  })

  describe('getFeePercent', () => {
    it('Should make a successful getFeePercent call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getFeePercentStub = sandbox.stub().resolves(1000n)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { feePercent: getFeePercentStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getFeePercent('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(1000n)
      expect(getFeePercentStub.calledOnce).to.be.true
    })

    it('should handle errors in getFeePercent', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getFeePercentStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { feePercent: getFeePercentStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getFeePercent('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(0n)
      expect(getFeePercentStub.calledOnce).to.be.true
    })
  })

  describe('getMinFeePercent', () => {
    it('Should make a successful getMinFeePercent call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getMinFeePercentStub = sandbox.stub().resolves(500n)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { minFeePercent: getMinFeePercentStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getMinFeePercent('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(500n)
      expect(getMinFeePercentStub.calledOnce).to.be.true
    })

    it('should handle errors in getMinFeePercent', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getMinFeePercentStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { minFeePercent: getMinFeePercentStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getMinFeePercent('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(0n)
      expect(getMinFeePercentStub.calledOnce).to.be.true
    })
  })

  describe('getMinCooldown', () => {
    it('Should make a successful getMinCooldown call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getMinCooldownStub = sandbox.stub().resolves(1800n)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { minCooldown: getMinCooldownStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getMinCooldown('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(1800n)
      expect(getMinCooldownStub.calledOnce).to.be.true
    })

    it('should handle errors in getMinCooldown', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getMinCooldownStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { minCooldown: getMinCooldownStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getMinCooldown('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(0n)
      expect(getMinCooldownStub.calledOnce).to.be.true
    })
  })

  describe('getUnderlyingTokenNameAndSymbol', () => {
    it('Should make a successful getUnderlyingTokenNameAndSymbol call', async () => {
      const adapterAddress = '0x123'
      const escrowAddress = '0x1234567890123456789012345678901234567890'
      const underlyingAddress = '0x9876543210987654321098765432109876543210'

      const stubGetEscrowAddress = sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(escrowAddress)

      const stubGetUnderlyingAddress = sandbox
        .stub(GovernanceVeHelper, 'getErc20TokenAddress')
        .resolves(underlyingAddress)

      const getTokenNameAndSymbolStub = sandbox
        .stub(Web3Helper, 'getTokenNameAndSymbol')
        .resolves({ name: 'Test Token', symbol: 'TEST' })

      const result = await GovernanceVeHelper.getUnderlyingTokenNameAndSymbol(
        adapterAddress,
        NetworksEnum.ethereumMainnet,
      )
      expect(result.name).to.eq('Test Token')
      expect(result.symbol).to.eq('TEST')
      expect(result.underlying).to.eq(underlyingAddress)
      expect(stubGetEscrowAddress.calledOnceWith(adapterAddress)).to.be.true
      expect(stubGetUnderlyingAddress.calledOnceWith(escrowAddress)).to.be.true
      expect(getTokenNameAndSymbolStub.calledOnceWith(underlyingAddress)).to.be.true
    })

    it('should return empty name and symbol when getEscrowAddress fails', async () => {
      const adapterAddress = '0x123'

      const stubGetEscrowAddress = sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(null)

      const stubGetUnderlyingAddress = sandbox.stub(GovernanceVeHelper, 'getErc20TokenAddress')

      const getTokenNameAndSymbolStub = sandbox.stub(Web3Helper, 'getTokenNameAndSymbol')

      const result = await GovernanceVeHelper.getUnderlyingTokenNameAndSymbol(
        adapterAddress,
        NetworksEnum.ethereumMainnet,
      )
      expect(result.name).to.be.null
      expect(result.symbol).to.be.null
      expect(result.underlying).to.null
      expect(stubGetEscrowAddress.calledOnceWith(adapterAddress)).to.be.true
      expect(stubGetUnderlyingAddress.notCalled).to.be.true
      expect(getTokenNameAndSymbolStub.notCalled).to.be.true
    })

    it('should return empty name and symbol when getEscrowAddress returns null', async () => {
      const adapterAddress = '0x123'
      const escrowAddress = '0x1234567890123456789012345678901234567890'

      const stubGetEscrowAddress = sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(escrowAddress)

      const stubGetUnderlyingAddress = sandbox.stub(GovernanceVeHelper, 'getErc20TokenAddress').resolves(null)

      const getTokenNameAndSymbolStub = sandbox.stub(Web3Helper, 'getTokenNameAndSymbol')

      const result = await GovernanceVeHelper.getUnderlyingTokenNameAndSymbol(
        adapterAddress,
        NetworksEnum.ethereumMainnet,
      )
      expect(result.name).to.null
      expect(result.symbol).to.null
      expect(result.underlying).to.null
      expect(stubGetEscrowAddress.calledOnceWith(adapterAddress)).to.be.true
      expect(stubGetUnderlyingAddress.calledOnceWith(escrowAddress)).to.be.true
      expect(getTokenNameAndSymbolStub.notCalled).to.be.true
    })

    it('should return empty name and symbol when getErc20TokenAddress returns null', async () => {
      const adapterAddress = '0x123'
      const escrowAddress = '0x1234567890123456789012345678901234567890'
      const underlyingAddress = '0x9876543210987654321098765432109876543210'

      const stubGetEscrowAddress = sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(escrowAddress)

      const stubGetUnderlyingAddress = sandbox
        .stub(GovernanceVeHelper, 'getErc20TokenAddress')
        .resolves(underlyingAddress)

      const getTokenNameAndSymbolStub = sandbox
        .stub(Web3Helper, 'getTokenNameAndSymbol')
        .resolves({ name: null, symbol: null })

      const result = await GovernanceVeHelper.getUnderlyingTokenNameAndSymbol(
        adapterAddress,
        NetworksEnum.ethereumMainnet,
      )
      expect(result.name).to.be.null
      expect(result.symbol).to.be.null
      expect(result.underlying).to.eq(underlyingAddress)
      expect(stubGetEscrowAddress.calledOnceWith(adapterAddress)).to.be.true
      expect(stubGetUnderlyingAddress.calledOnceWith(escrowAddress)).to.be.true
      expect(getTokenNameAndSymbolStub.calledOnceWith(underlyingAddress)).to.be.true
    })

    it('should handle errors in getUnderlyingTokenNameAndSymbol', async () => {
      const adapterAddress = '0x123'
      const escrowAddress = '0x1234567890123456789012345678901234567890'
      const underlyingAddress = '0x9876543210987654321098765432109876543210'

      const stubGetEscrowAddress = sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(escrowAddress)

      const stubGetUnderlyingAddress = sandbox
        .stub(GovernanceVeHelper, 'getErc20TokenAddress')
        .resolves(underlyingAddress)

      const getTokenNameAndSymbolStub = sandbox
        .stub(Web3Helper, 'getTokenNameAndSymbol')
        .rejects(new Error('RPC Call Failed'))

      const result = await GovernanceVeHelper.getUnderlyingTokenNameAndSymbol(
        adapterAddress,
        NetworksEnum.ethereumMainnet,
      )
      expect(result.name).to.be.null
      expect(result.symbol).to.be.null
      expect(result.underlying).to.eq(underlyingAddress)
      expect(stubGetEscrowAddress.calledOnceWith(adapterAddress)).to.be.true
      expect(stubGetUnderlyingAddress.calledOnceWith(escrowAddress)).to.be.true
      expect(getTokenNameAndSymbolStub.calledOnceWith(underlyingAddress)).to.be.true
    })
  })
})
