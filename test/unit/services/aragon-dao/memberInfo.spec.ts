import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { MemberInfo } from '@services/aragon-dao/memberInfo'
import Web3Helper from '@helpers/web3'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import GovernanceErc20Helper from '@helpers/governanceErc20'
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

    it('should return true when voting power is 0 and there is the balance', async () => {
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
      const getBalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves(200n)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(getVotesStub.calledOnce).to.be.true
      expect(getVotesStub.calledWith('0xMemberAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getBalanceStub.calledOnce).to.be.true
      expect(getBalanceStub.calledWith('0xMemberAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(result).to.be.true
    })

    it('should return false for tokenVoting when voting power is 0 and balance also 0', async () => {
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
      sandbox.stub(Web3Helper, 'getERC20Balance').resolves(0n)

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
      sandbox.stub(Web3Helper, 'getERC20Balance').resolves(0n)

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
      sandbox.stub(Web3Helper, 'getERC20Balance').resolves(200n)

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

    it('should return true for admin when pluginMember exists', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.admin,
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const pluginMemberStub = sandbox.stub(Models.PluginMember, 'findOne').resolves({
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
      expect(pluginMemberStub.calledOnce).to.be.true
      expect(
        pluginMemberStub.calledWith({
          daoAddress: '0xDaoAddress',
          memberAddress: '0xMemberAddress',
          network: NetworksEnum.ethereumSepolia,
        }),
      ).to.be.true
      expect(result).to.be.true
    })

    it('should return false for admin when pluginMember does not exist', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.admin,
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const pluginMemberStub = sandbox.stub(Models.PluginMember, 'findOne').resolves(null)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(pluginMemberStub.calledOnce).to.be.true
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

  describe('getVotingPower', () => {
    it('should return 0 when token is not found', async () => {
      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(null)
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(0n)

      const result = await MemberInfo.getVotingPower('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)

      expect(proxyTokenStub.calledOnce).to.be.true
      expect(proxyTokenStub.calledWith('0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getVotesStub.called).to.be.false
      expect(result).to.equal('0')
    })

    it('should return voting power when token is found', async () => {
      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ address: '0xTokenAddress' } as any)
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(200n)

      const result = await MemberInfo.getVotingPower('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)

      expect(proxyTokenStub.calledOnce).to.be.true
      expect(getVotesStub.calledOnce).to.be.true
      expect(getVotesStub.calledWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(result).to.equal('200')
    })

    it('should return 0 when an error occurs', async () => {
      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ address: '0xTokenAddress' } as any)
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').rejects(new Error('Test error'))

      const result = await MemberInfo.getVotingPower('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)

      expect(proxyTokenStub.calledOnce).to.be.true
      expect(getVotesStub.calledOnce).to.be.true
      expect(result).to.equal('0')
    })
  })

  describe('getLockVotingPowerBatch', () => {
    it('should return empty array when locks array is empty', async () => {
      const web3BatchHelperStub = sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch')

      const result = await MemberInfo.getLockVotingPowerBatch([])

      expect(web3BatchHelperStub.called).to.be.false
      expect(result).to.deep.equal([])
    })

    it('should return voting power for each lock', async () => {
      const locks = [
        {
          lockId: 'lock1',
          tokenId: 'token1',
          escrowAddress: '0xEscrowAddress1',
          timestamp: 123456,
          network: NetworksEnum.ethereumSepolia,
        },
        {
          lockId: 'lock2',
          tokenId: 'token2',
          escrowAddress: '0xEscrowAddress2',
          timestamp: 123457,
          network: NetworksEnum.ethereumSepolia,
        },
      ]

      const batchResults = [
        { tokenId: 'token1', votingPower: 100n },
        { tokenId: 'token2', votingPower: 200n },
      ]

      const web3BatchHelperStub = sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves(batchResults)

      const result = await MemberInfo.getLockVotingPowerBatch(locks)

      expect(web3BatchHelperStub.calledOnce).to.be.true
      expect(web3BatchHelperStub.firstCall.args[0]).to.deep.equal([
        { escrowAddress: '0xEscrowAddress1', tokenId: 'token1', ts: 123456 },
        { escrowAddress: '0xEscrowAddress2', tokenId: 'token2', ts: 123457 },
      ])
      expect(web3BatchHelperStub.firstCall.args[1]).to.equal(NetworksEnum.ethereumSepolia)
      expect(result).to.deep.equal([
        { tokenId: 'token1', votingPower: '100' },
        { tokenId: 'token2', votingPower: '200' },
      ])
    })

    it('should return zero voting power when an error occurs', async () => {
      const locks = [
        {
          lockId: 'lock1',
          tokenId: 'token1',
          escrowAddress: '0xEscrowAddress1',
          timestamp: 123456,
          network: NetworksEnum.ethereumSepolia,
        },
        {
          lockId: 'lock2',
          tokenId: 'token2',
          escrowAddress: '0xEscrowAddress2',
          timestamp: 123457,
          network: NetworksEnum.ethereumSepolia,
        },
      ]

      const web3BatchHelperStub = sandbox
        .stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch')
        .rejects(new Error('Test error'))

      const result = await MemberInfo.getLockVotingPowerBatch(locks)

      expect(web3BatchHelperStub.calledOnce).to.be.true
      expect(result).to.deep.equal([
        { tokenId: 'token1', votingPower: '0' },
        { tokenId: 'token2', votingPower: '0' },
      ])
    })
  })
})
