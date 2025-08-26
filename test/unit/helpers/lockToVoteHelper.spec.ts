import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { NetworksEnum } from '@types'
import proxyquire from 'proxyquire'
import LockToVoteHelper from '@helpers/lockToVoteHelper'
import ProviderModule from '@modules/provider'

describe('Helpers: LockToVoteHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('getVotingToken', () => {
    it('should make a successful getVotingToken call', async () => {
      const mockLockManagerAddress = '0x1234567890123456789012345678901234567890'
      const mockTokenAddress = '0x9876543210987654321098765432109876543210'

      const tokenStub = sandbox.stub().resolves(mockTokenAddress)

      const { default: MockedLockToVoteHelper } = proxyquire.noCallThru()('@helpers/lockToVoteHelper', {
        ethers: {
          Contract: function () {
            return { token: tokenStub }
          },
        },
      })

      // Mock getLockManager to return an address
      sandbox.stub(MockedLockToVoteHelper, 'getLockManager').resolves(mockLockManagerAddress)

      const result = await MockedLockToVoteHelper.getVotingToken(NetworksEnum.ethereumMainnet, '0xPlugin123')

      expect(result).to.equal(mockTokenAddress)
      expect(tokenStub.calledOnce).to.be.true
    })

    it('should return null when getLockManager returns null', async () => {
      const { default: MockedLockToVoteHelper } = proxyquire.noCallThru()('@helpers/lockToVoteHelper', {
        ethers: {
          Contract: function () {
            return {}
          },
        },
      })

      sandbox.stub(MockedLockToVoteHelper, 'getLockManager').resolves(null)

      const result = await MockedLockToVoteHelper.getVotingToken(NetworksEnum.ethereumMainnet, '0xPlugin123')

      expect(result).to.be.null
    })

    it('should handle errors in getVotingToken', async () => {
      const mockLockManagerAddress = '0x1234567890123456789012345678901234567890'
      const tokenStub = sandbox.stub().rejects(new Error('Contract call failed'))

      const { default: MockedLockToVoteHelper } = proxyquire.noCallThru()('@helpers/lockToVoteHelper', {
        ethers: {
          Contract: function () {
            return { token: tokenStub }
          },
        },
      })

      sandbox.stub(MockedLockToVoteHelper, 'getLockManager').resolves(mockLockManagerAddress)

      const result = await MockedLockToVoteHelper.getVotingToken(NetworksEnum.ethereumMainnet, '0xPlugin123')

      expect(result).to.be.null
      expect(tokenStub.calledOnce).to.be.true
    })
  })

  describe('getLockManager', () => {
    it('should make a successful getLockManager call', async () => {
      const mockLockManagerAddress = '0x1234567890123456789012345678901234567890'

      const lockManagerStub = sandbox.stub().resolves(mockLockManagerAddress)

      const { default: MockedLockToVoteHelper } = proxyquire.noCallThru()('@helpers/lockToVoteHelper', {
        ethers: {
          Contract: function () {
            return { lockManager: lockManagerStub }
          },
        },
      })

      const result = await MockedLockToVoteHelper.getLockManager(NetworksEnum.ethereumMainnet, '0xPlugin123')

      expect(result).to.equal(mockLockManagerAddress)
      expect(lockManagerStub.calledOnce).to.be.true
    })

    it('should handle errors in getLockManager', async () => {
      const lockManagerStub = sandbox.stub().rejects(new Error('Contract call failed'))

      const { default: MockedLockToVoteHelper } = proxyquire.noCallThru()('@helpers/lockToVoteHelper', {
        ethers: {
          Contract: function () {
            return { lockManager: lockManagerStub }
          },
        },
      })

      const result = await MockedLockToVoteHelper.getLockManager(NetworksEnum.ethereumMainnet, '0xPlugin123')

      expect(result).to.be.null
      expect(lockManagerStub.calledOnce).to.be.true
    })
  })

  describe('getUserLockedBalance', () => {
    it('should make a successful getUserLockedBalance call', async () => {
      const mockBalance = 1000000000000000000n

      const getLockedBalanceStub = sandbox.stub().resolves(mockBalance)

      const { default: MockedLockToVoteHelper } = proxyquire.noCallThru()('@helpers/lockToVoteHelper', {
        ethers: {
          Contract: function () {
            return { getLockedBalance: getLockedBalanceStub }
          },
        },
      })

      const result = await MockedLockToVoteHelper.getUserLockedBalance(
        NetworksEnum.ethereumMainnet,
        '0xLockManager123',
        '0xUser456',
      )

      expect(result).to.equal(mockBalance.toString())
      expect(getLockedBalanceStub.calledOnceWith('0xUser456')).to.be.true
    })

    it('should handle errors in getUserLockedBalance', async () => {
      const getLockedBalanceStub = sandbox.stub().rejects(new Error('Contract call failed'))

      const { default: MockedLockToVoteHelper } = proxyquire.noCallThru()('@helpers/lockToVoteHelper', {
        ethers: {
          Contract: function () {
            return { getLockedBalance: getLockedBalanceStub }
          },
        },
      })

      const result = await MockedLockToVoteHelper.getUserLockedBalance(
        NetworksEnum.ethereumMainnet,
        '0xLockManager123',
        '0xUser456',
      )

      expect(result).to.be.null
      expect(getLockedBalanceStub.calledOnce).to.be.true
    })
  })

  describe('getCurrentTotalSupply', () => {
    it('should successfully get current total supply', async () => {
      const mockSupply = BigInt(100000000000000000000)
      const mockProvider = {
        call: sandbox.stub().resolves(mockSupply),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider)

      const result = await LockToVoteHelper.getCurrentTotalSupply(NetworksEnum.ethereumMainnet, '0xPlugin123', 12345678)

      expect(result).to.equal(mockSupply.toString())
    })

    it('should return "0" when provider call throws error', async () => {
      const mockProvider = {
        call: sandbox.stub().rejects(new Error('Provider call failed')),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider)

      const result = await LockToVoteHelper.getCurrentTotalSupply(NetworksEnum.ethereumMainnet, '0xPlugin123', 12345678)

      expect(result).to.equal('0')
    })
  })

  describe('getRequiredVotingPowerForProposal', () => {
    it('should successfully get required voting power', async () => {
      const mockRequiredPower = BigInt(1000000000000000000)
      const mockProvider = {
        call: sandbox.stub().resolves(mockRequiredPower),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider)

      const result = await LockToVoteHelper.getRequiredVotingPowerForProposal(
        '0x1234567890123456789012345678901234567890',
        '0x9876543210987654321098765432109876543210',
        NetworksEnum.ethereumMainnet,
      )

      expect(result).to.equal(mockRequiredPower.toString())
      expect(mockProvider.call.calledOnce).to.be.true
    })

    it('should return undefined when provider call throws error', async () => {
      const mockProvider = {
        call: sandbox.stub().rejects(new Error('Provider call failed')),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider)

      const result = await LockToVoteHelper.getRequiredVotingPowerForProposal(
        '0x1234567890123456789012345678901234567890',
        '0x9876543210987654321098765432109876543210',
        NetworksEnum.ethereumMainnet,
      )

      expect(result).to.be.undefined
      expect(mockProvider.call.calledOnce).to.be.true
    })
  })
})
