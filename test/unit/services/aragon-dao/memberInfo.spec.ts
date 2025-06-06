import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { MemberInfo } from '@services/aragon-dao/memberInfo'
import Web3Helper from '@helpers/web3'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import GovernanceVeHelper from '@helpers/governanceVe'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { ProxyToken } from '@modules/proxyToken'
import { Models } from '@dbModels'

describe('AragonDao: memberInfo', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getByTokenAddress', () => {
    it('should return when token is not found', async () => {
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').rejects('error')
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').rejects('error')

      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
      const getDelegateStub = sandbox.stub(GovernanceErc20Helper, 'getDelegates').rejects('error')

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        null,
        '0xTokenAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(proxyTokenStub.calledOnce).to.be.true
      expect(proxyTokenStub.calledWith('0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getERC20BalanceStub.calledOnce).to.be.false
      expect(getVotesStub.calledOnce).to.be.false
      expect(getDelegateStub.calledOnce).to.be.false
      expect(result).to.deep.equal({
        balance: null,
        votingPower: null,
        currentDelegate: null,
      })
    })

    it('should return balance and voting power', async () => {
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves('100' as any)
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(200n)

      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasDelegate: false } as any)
      const getDelegateStub = sandbox.stub(GovernanceErc20Helper, 'getDelegates').resolves(null)

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        null,
        '0xTokenAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(getERC20BalanceStub.calledOnce).to.be.true
      expect(getERC20BalanceStub.calledWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getVotesStub.calledOnce).to.be.true
      expect(getVotesStub.calledWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(proxyTokenStub.calledOnce).to.be.true
      expect(proxyTokenStub.calledWith('0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getDelegateStub.calledOnce).to.be.false
      expect(result).to.deep.equal({
        balance: '100',
        votingPower: '200',
        currentDelegate: null,
      })
    })

    it('should return balance, voting power and current delegate', async () => {
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves('100' as any)
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(200n)

      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasDelegate: true } as any)
      const getDelegateStub = sandbox.stub(GovernanceErc20Helper, 'getDelegates').resolves('0xDelegateAddress')

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        null,
        '0xTokenAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(getERC20BalanceStub.calledOnce).to.be.true
      expect(getERC20BalanceStub.calledWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getVotesStub.calledOnce).to.be.true
      expect(getVotesStub.calledWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(proxyTokenStub.calledOnce).to.be.true
      expect(proxyTokenStub.calledWith('0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getDelegateStub.calledOnce).to.be.true
      expect(getDelegateStub.calledWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(result).to.deep.equal({
        balance: '100',
        votingPower: '200',
        currentDelegate: '0xDelegateAddress',
      })
    })

    it('should return empty response on error', async () => {
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').rejects('error')
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').rejects('error')

      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasDelegate: true } as any)
      const getDelegateStub = sandbox.stub(GovernanceErc20Helper, 'getDelegates').rejects('error')

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        null,
        '0xTokenAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(getERC20BalanceStub.calledOnce).to.be.true
      expect(getERC20BalanceStub.calledWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getVotesStub.calledOnce).to.be.false
      expect(proxyTokenStub.calledOnce).to.be.true
      expect(proxyTokenStub.calledWith('0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getDelegateStub.calledOnce).to.be.false
      expect(result).to.deep.equal({
        balance: null,
        votingPower: null,
        currentDelegate: null,
      })
    })

    it('should return if both token and plugin is not passed', async () => {
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').rejects('error')
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').rejects('error')

      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
      const getDelegateStub = sandbox.stub(GovernanceErc20Helper, 'getDelegates').rejects('error')

      const result = await MemberInfo.getByTokenAddress('0xUserAddress', null, null, NetworksEnum.ethereumSepolia)

      expect(getERC20BalanceStub.calledOnce).to.be.false
      expect(getVotesStub.calledOnce).to.be.false
      expect(proxyTokenStub.calledOnce).to.be.false
      expect(getDelegateStub.calledOnce).to.be.false
      expect(result).to.deep.equal({
        balance: null,
        votingPower: null,
        currentDelegate: null,
      })
    })

    it('should return if plugin is not tokenVoting', async () => {
      const pluginStub = sandbox
        .stub(Models.Plugin, 'findByAddress')
        .resolves({ interfaceType: 'notTokenVoting' } as any)
      const proxyTokenStub = sandbox
        .stub(ProxyToken, 'saveAndGetToken')
        .resolves({ interfaceType: 'notTokenVoting' } as any)

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        '0xPluginAddress',
        null,
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(proxyTokenStub.calledOnce).to.be.false
      expect(result).to.deep.equal({
        balance: null,
        votingPower: null,
        currentDelegate: null,
      })
    })

    it('should return if plugin not found', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const proxyTokenStub = sandbox
        .stub(ProxyToken, 'saveAndGetToken')
        .resolves({ interfaceType: 'tokenVoting' } as any)

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        '0xPluginAddress',
        null,
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(proxyTokenStub.calledOnce).to.be.false
      expect(result).to.deep.equal({
        balance: null,
        votingPower: null,
        currentDelegate: null,
      })
    })

    it('should get the token address from the plugin and continue', async () => {
      const pluginStub = sandbox
        .stub(Models.Plugin, 'findByAddress')
        .resolves({ interfaceType: IPluginInterfaceType.tokenVoting, tokenAddress: '0xTokenAddress' } as any)
      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ hasDelegate: true } as any)
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves('100' as any)
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(200n)

      const getDelegateStub = sandbox.stub(GovernanceErc20Helper, 'getDelegates').resolves('0xDelegateAddress')
      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        '0xPluginAddress',
        null,
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(proxyTokenStub.calledOnce).to.be.true
      expect(proxyTokenStub.calledWith('0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getERC20BalanceStub.calledOnce).to.be.true
      expect(getVotesStub.calledOnce).to.be.true
      expect(getDelegateStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        balance: '100',
        votingPower: '200',
        currentDelegate: '0xDelegateAddress',
      })
    })
  })

  describe('canCreateProposal', () => {
    it('should return false when plugin is not found', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(result).to.be.false
    })

    it('should return false when settings are not found', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves(null)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(result).to.be.false
    })

    it('should return false for unsupported plugin interface type', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: 'unsupported',
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(result).to.be.false
    })

    it('should return false for tokenVoting when tokenAddress is missing', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: null,
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(result).to.be.false
    })

    it('should return false for tokenVoting when voting power is 0', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xTokenAddress',
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({
        minParticipation: 100,
      } as any)

      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(0n)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(getVotesStub.calledOnce).to.be.true
      expect(getVotesStub.calledWith('0xMemberAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(result).to.be.false
    })

    it('should return false for tokenVoting when voting power is less than minimum participation', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xTokenAddress',
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({
        minParticipation: 100,
      } as any)

      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(50n)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(getVotesStub.calledOnce).to.be.true
      expect(result).to.be.false
    })

    it('should return true for tokenVoting when voting power is greater than minimum participation', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xTokenAddress',
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({
        minParticipation: 100,
      } as any)

      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(150n)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(getVotesStub.calledOnce).to.be.true
      expect(result).to.be.true
    })

    it('should return true for multisig when onlyListed is false', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.multisig,
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({
        onlyListed: false,
      } as any)

      const isMemberStub = sandbox.stub(Web3Helper, 'isMember').resolves(false)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(isMemberStub.called).to.be.false
      expect(result).to.be.true
    })

    it('should return false for multisig when onlyListed is true and member is not listed', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.multisig,
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({
        onlyListed: true,
      } as any)

      const isMemberStub = sandbox.stub(Web3Helper, 'isMember').resolves(false)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(isMemberStub.calledOnce).to.be.true
      expect(isMemberStub.calledWith('0xPluginAddress', '0xMemberAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(result).to.be.false
    })

    it('should return true for multisig when onlyListed is true and member is listed', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.multisig,
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({
        onlyListed: true,
      } as any)

      const isMemberStub = sandbox.stub(Web3Helper, 'isMember').resolves(true)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(isMemberStub.calledOnce).to.be.true
      expect(result).to.be.true
    })

    it('should return true for admin when daoMemberMapping exists', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.admin,
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const daoMemberMappingStub = sandbox.stub(Models.DaoMemberMapping, 'findOne').resolves({
        daoAddress: '0xDaoAddress',
        memberAddress: '0xMemberAddress',
        network: NetworksEnum.ethereumSepolia,
      } as any)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(daoMemberMappingStub.calledOnce).to.be.true
      expect(
        daoMemberMappingStub.calledWith({
          daoAddress: '0xDaoAddress',
          memberAddress: '0xMemberAddress',
          network: NetworksEnum.ethereumSepolia,
        }),
      ).to.be.true
      expect(result).to.be.true
    })

    it('should return false for admin when daoMemberMapping does not exist', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.admin,
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const daoMemberMappingStub = sandbox.stub(Models.DaoMemberMapping, 'findOne').resolves(null)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(daoMemberMappingStub.calledOnce).to.be.true
      expect(result).to.be.false
    })

    it('should return false on error', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').rejects(new Error('Test error'))

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(result).to.be.false
    })
  })

  describe('getLockVotingPower', () => {
    it('should return false when lock is not found', async () => {
      const lockStub = sandbox.stub(Models.Lock, 'findOne').resolves(null)
      const governanceVeStub = sandbox.stub(GovernanceVeHelper, 'getLockVotingPowerAt')

      const result = await MemberInfo.getLockVotingPower('lock-123')

      expect(lockStub.calledOnce).to.be.true
      expect(lockStub.calledWith({ id: 'lock-123' })).to.be.true
      expect(governanceVeStub.called).to.be.false
      expect(result).to.be.false
    })

    it('should return voting power when lock is found', async () => {
      const mockLock = {
        id: 'lock-123',
        memberAddress: '0xMemberAddress',
        tokenId: '456',
        epochStartAt: 1640995200,
        network: NetworksEnum.ethereumMainnet,
      }

      const lockStub = sandbox.stub(Models.Lock, 'findOne').resolves(mockLock as any)
      const governanceVeStub = sandbox.stub(GovernanceVeHelper, 'getLockVotingPowerAt').resolves(500000000000000000n)

      const result = await MemberInfo.getLockVotingPower('lock-123')

      expect(lockStub.calledOnce).to.be.true
      expect(lockStub.calledWith({ id: 'lock-123' })).to.be.true
      expect(governanceVeStub.calledOnce).to.be.true
      expect(
        governanceVeStub.calledWith(mockLock.memberAddress, mockLock.tokenId, mockLock.epochStartAt, mockLock.network),
      ).to.be.true
      expect(result).to.equal(500000000000000000)
    })

    it('should return 0 when getLockVotingPowerAt returns 0n', async () => {
      const mockLock = {
        id: 'lock-123',
        memberAddress: '0xMemberAddress',
        tokenId: '456',
        epochStartAt: 1640995200,
        network: NetworksEnum.ethereumMainnet,
      }

      const lockStub = sandbox.stub(Models.Lock, 'findOne').resolves(mockLock as any)
      const governanceVeStub = sandbox.stub(GovernanceVeHelper, 'getLockVotingPowerAt').resolves(0n)

      const result = await MemberInfo.getLockVotingPower('lock-123')

      expect(lockStub.calledOnce).to.be.true
      expect(governanceVeStub.calledOnce).to.be.true
      expect(result).to.equal(0)
    })

    it('should handle large voting power values correctly', async () => {
      const mockLock = {
        id: 'lock-123',
        memberAddress: '0xMemberAddress',
        tokenId: '456',
        epochStartAt: 1640995200,
        network: NetworksEnum.ethereumMainnet,
      }

      const lockStub = sandbox.stub(Models.Lock, 'findOne').resolves(mockLock as any)
      const governanceVeStub = sandbox
        .stub(GovernanceVeHelper, 'getLockVotingPowerAt')
        .resolves(1000000000000000000000n)

      const result = await MemberInfo.getLockVotingPower('lock-123')

      expect(lockStub.calledOnce).to.be.true
      expect(governanceVeStub.calledOnce).to.be.true
      expect(result).to.equal(1000000000000000000000)
    })
  })
})
