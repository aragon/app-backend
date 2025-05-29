import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import proxyquire from 'proxyquire'

describe('Helpers: GovernanceVe', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
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

  describe('getSlope', () => {
    it('Should make a successful getSlope call', async () => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      const getSlopeStub = sandbox.stub().resolves(1000000000000000000n)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { slope: getSlopeStub }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedGovernanceVeHelper.getSlope('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(1000000000000000000n)
      expect(getSlopeStub.calledOnce).to.be.true
    })

    it('should handle errors in getSlope', async () => {
      const expectedResult = new Error('RPC Call Failed')
      const getSlopeStub = sandbox.stub().rejects(expectedResult)

      const { default: MockedGovernanceVeHelper } = proxyquire.noCallThru()('@helpers/governanceVe', {
        ethers: {
          Contract: function () {
            return { slope: getSlopeStub }
          },
        },
      })

      const result = await MockedGovernanceVeHelper.getSlope('0x123', NetworksEnum.ethereumMainnet)
      expect(result).to.eq(0n)
      expect(getSlopeStub.calledOnce).to.be.true
    })
  })
})
