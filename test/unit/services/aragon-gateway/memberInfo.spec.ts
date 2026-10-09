import { DAO } from '@artifacts/dao'
import { Models } from '@dbModels'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import LockToVoteHelper from '@helpers/lockToVoteHelper'
import Web3Helper from '@helpers/web3'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import logger from '@logger'
import { ProxyToken } from '@modules/proxyToken'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import { MemberInfo } from '@services/aragon-gateway/memberInfo'
import { IConditionInterfaceType, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { expect } from 'chai'
import { Interface } from 'ethers'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonDao: memberInfo', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getByTokenAddress', () => {
    it('should return balance, voting power and delegate fetched in parallel', async () => {
      const tokenStub = sandbox
        .stub(Models.Token, 'findByTokenAddressAndNetwork')
        .resolves({ hasDelegate: true } as any)
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves(100n)
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(200n)
      const getDelegateStub = sandbox.stub(GovernanceErc20Helper, 'getDelegates').resolves('0xDelegateAddress')

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        null,
        '0xTokenAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(tokenStub.calledOnceWith('0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getERC20BalanceStub.calledOnceWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be
        .true
      expect(getVotesStub.calledOnceWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getDelegateStub.calledOnceWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(result).to.deep.equal({
        balance: '100',
        votingPower: '200',
        currentDelegate: '0xDelegateAddress',
      })
    })

    it('should not fetch delegate when token has no delegation', async () => {
      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves({ hasDelegate: false } as any)
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves(100n)
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(200n)
      const getDelegateStub = sandbox.stub(GovernanceErc20Helper, 'getDelegates').resolves('0xDelegateAddress')

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        null,
        '0xTokenAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(getERC20BalanceStub.calledOnce).to.be.true
      expect(getVotesStub.calledOnce).to.be.true
      expect(getDelegateStub.called).to.be.false
      expect(result).to.deep.equal({
        balance: '100',
        votingPower: '200',
        currentDelegate: null,
      })
    })

    it('should fill only the settled results when some calls fail', async () => {
      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves({ hasDelegate: true } as any)
      sandbox.stub(Web3Helper, 'getERC20Balance').resolves(100n)
      sandbox.stub(GovernanceErc20Helper, 'getVotes').rejects(new Error('rpc error'))
      sandbox.stub(GovernanceErc20Helper, 'getDelegates').resolves('0xDelegateAddress')
      sandbox.stub(logger, 'warn')

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        null,
        '0xTokenAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(result).to.deep.equal({
        balance: '100',
        votingPower: null,
        currentDelegate: '0xDelegateAddress',
      })
    })

    it('should return empty response when all calls fail', async () => {
      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves({ hasDelegate: true } as any)
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').rejects(new Error('rpc error'))
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').rejects(new Error('rpc error'))
      const getDelegateStub = sandbox.stub(GovernanceErc20Helper, 'getDelegates').rejects(new Error('rpc error'))
      sandbox.stub(logger, 'warn')

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        null,
        '0xTokenAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(getERC20BalanceStub.calledOnce).to.be.true
      expect(getVotesStub.calledOnce).to.be.true
      expect(getDelegateStub.calledOnce).to.be.true
      expect(result).to.deep.equal({
        balance: null,
        votingPower: null,
        currentDelegate: null,
      })
    })

    it('should return when token is not found in the database', async () => {
      const tokenStub = sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(null)
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves(100n)
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(200n)

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        null,
        '0xTokenAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(tokenStub.calledOnceWith('0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getERC20BalanceStub.called).to.be.false
      expect(getVotesStub.called).to.be.false
      expect(result).to.deep.equal({
        balance: null,
        votingPower: null,
        currentDelegate: null,
      })
    })

    it('should return if both token and plugin is not passed', async () => {
      const tokenStub = sandbox
        .stub(Models.Token, 'findByTokenAddressAndNetwork')
        .resolves({ hasDelegate: true } as any)
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves(100n)

      const result = await MemberInfo.getByTokenAddress('0xUserAddress', null, null, NetworksEnum.ethereumSepolia)

      expect(tokenStub.called).to.be.false
      expect(getERC20BalanceStub.called).to.be.false
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
      const tokenStub = sandbox
        .stub(Models.Token, 'findByTokenAddressAndNetwork')
        .resolves({ hasDelegate: true } as any)

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        '0xPluginAddress',
        null,
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(tokenStub.called).to.be.false
      expect(result).to.deep.equal({
        balance: null,
        votingPower: null,
        currentDelegate: null,
      })
    })

    it('should return if plugin not found', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const tokenStub = sandbox
        .stub(Models.Token, 'findByTokenAddressAndNetwork')
        .resolves({ hasDelegate: true } as any)

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        '0xPluginAddress',
        null,
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(tokenStub.called).to.be.false
      expect(result).to.deep.equal({
        balance: null,
        votingPower: null,
        currentDelegate: null,
      })
    })

    it('should keep a DAO-scoped Safe from resolving a colliding token plugin', async () => {
      const safeAddress = '0x1111111111111111111111111111111111111111'
      const daoAddress = '0x2222222222222222222222222222222222222222'
      const network = NetworksEnum.ethereumSepolia
      await Models.Plugin.create({
        id: 'safe-dao-a',
        address: safeAddress,
        daoAddress,
        network,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isSupported: true,
        transactionHash: '0xsafe-a',
        blockNumber: 1,
      })
      await Models.Plugin.create({
        id: 'token-dao-b',
        address: safeAddress,
        daoAddress: '0x3333333333333333333333333333333333333333',
        network,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: IPluginStatus.installed,
        isSupported: true,
        tokenAddress: '0x4444444444444444444444444444444444444444',
        transactionHash: '0xtoken-b',
        blockNumber: 2,
      })
      const token = sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves({ hasDelegate: false } as any)
      sandbox.stub(Web3Helper, 'getERC20Balance').resolves(100n)
      sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(200n)

      const result = await MemberInfo.getByTokenAddress(
        '0x5555555555555555555555555555555555555555',
        safeAddress,
        null,
        network,
        daoAddress,
      )

      expect(result).to.deep.equal({ balance: null, votingPower: null, currentDelegate: null })
      expect(token.called).to.be.false
    })

    it('should get the token address from the plugin and continue', async () => {
      const pluginStub = sandbox
        .stub(Models.Plugin, 'findByAddress')
        .resolves({ interfaceType: IPluginInterfaceType.tokenVoting, tokenAddress: '0xTokenAddress' } as any)
      const tokenStub = sandbox
        .stub(Models.Token, 'findByTokenAddressAndNetwork')
        .resolves({ hasDelegate: true } as any)
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves(100n)
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(200n)
      const getDelegateStub = sandbox.stub(GovernanceErc20Helper, 'getDelegates').resolves('0xDelegateAddress')

      const result = await MemberInfo.getByTokenAddress(
        '0xUserAddress',
        '0xPluginAddress',
        null,
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(tokenStub.calledOnceWith('0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getERC20BalanceStub.calledOnceWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be
        .true
      expect(getVotesStub.calledOnceWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getDelegateStub.calledOnceWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
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

      const isMemberStub = sandbox.stub(Web3Helper, 'isMultisigMember').resolves(false)

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

      const isMemberStub = sandbox.stub(Web3Helper, 'isMultisigMember').resolves(false)

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

      const isMemberStub = sandbox.stub(Web3Helper, 'isMultisigMember').resolves(true)

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

      const pluginMemberStub = sandbox.stub(Models.PluginMember, 'exists').resolves({ _id: 'member-id' } as any)

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
          pluginAddress: '0xPluginAddress',
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

      const pluginMemberStub = sandbox.stub(Models.PluginMember, 'exists').resolves(null)

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

    it('should return false for admin when only a multisig signer row exists', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xAdminPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.admin,
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      // A signer row for the same DAO but a different plugin (the multisig) must not read as an
      // admin proposer - `_checkForAdmin` scopes to the admin plugin's own address.
      await Models.PluginMember.create({
        daoAddress: '0xDaoAddress',
        pluginAddress: '0xMultisigPluginAddress',
        memberAddress: '0xMemberAddress',
        network: NetworksEnum.ethereumSepolia,
      })

      const result = await MemberInfo.canCreateProposal(
        '0xAdminPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(result).to.be.false
    })

    it('should return false for lockToVote when lockManagerAddress is missing', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: null,
        conditionAddress: '0xConditionAddress',
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

    it('should return false for lockToVote when conditionAddress is missing', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xLockManagerAddress',
        conditionAddress: null,
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

    it('should return false for lockToVote when settings are missing', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xLockManagerAddress',
        conditionAddress: '0xConditionAddress',
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

    it('should return false for lockToVote when user has no locked balance', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xLockManagerAddress',
        proposalCreationConditionAddress: '0xConditionAddress',
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const getLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves('0')
      const getRequiredVotingPowerStub = sandbox
        .stub(LockToVoteHelper, 'getRequiredVotingPowerForProposal')
        .resolves('100')

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(getLockedBalanceStub.calledOnce).to.be.true
      expect(getLockedBalanceStub.calledWith(NetworksEnum.ethereumSepolia, '0xLockManagerAddress', '0xMemberAddress'))
        .to.be.true
      expect(getRequiredVotingPowerStub.calledOnce).to.be.true
      expect(
        getRequiredVotingPowerStub.calledWith('0xConditionAddress', '0xMemberAddress', NetworksEnum.ethereumSepolia),
      ).to.be.true
      expect(result).to.be.false
    })

    it('should return false for lockToVote when user has locked balance less than required', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xLockManagerAddress',
        proposalCreationConditionAddress: '0xConditionAddress',
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const getLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves('50')
      const getRequiredVotingPowerStub = sandbox
        .stub(LockToVoteHelper, 'getRequiredVotingPowerForProposal')
        .resolves('100')

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(getLockedBalanceStub.calledOnce).to.be.true
      expect(getRequiredVotingPowerStub.calledOnce).to.be.true
      expect(result).to.be.false
    })

    it('should return true for lockToVote when user has locked balance equal to required', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xLockManagerAddress',
        proposalCreationConditionAddress: '0xConditionAddress',
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const getLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves('100')
      const getRequiredVotingPowerStub = sandbox
        .stub(LockToVoteHelper, 'getRequiredVotingPowerForProposal')
        .resolves('100')

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(getLockedBalanceStub.calledOnce).to.be.true
      expect(getRequiredVotingPowerStub.calledOnce).to.be.true
      expect(result).to.be.true
    })

    it('should return true for lockToVote when user has locked balance greater than required', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xLockManagerAddress',
        proposalCreationConditionAddress: '0xConditionAddress',
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const getLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves('200')
      const getRequiredVotingPowerStub = sandbox
        .stub(LockToVoteHelper, 'getRequiredVotingPowerForProposal')
        .resolves('100')

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(getLockedBalanceStub.calledOnce).to.be.true
      expect(getRequiredVotingPowerStub.calledOnce).to.be.true
      expect(result).to.be.true
    })

    it('should return false for lockToVote when getRequiredVotingPowerForProposal returns undefined', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xLockManagerAddress',
        proposalCreationConditionAddress: '0xConditionAddress',
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const getLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves('100')
      const getRequiredVotingPowerStub = sandbox
        .stub(LockToVoteHelper, 'getRequiredVotingPowerForProposal')
        .resolves(undefined)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(getLockedBalanceStub.calledOnce).to.be.true
      expect(getRequiredVotingPowerStub.calledOnce).to.be.true
      expect(result).to.be.false
    })

    it('should return false on error', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').rejects(new Error('Test error'))
      sandbox.stub(logger, 'warn')

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(result).to.be.false
    })

    it('should return false for lockToVote when both votingPower and requiredVotingPower are 0', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xLockManagerAddress',
        proposalCreationConditionAddress: '0xConditionAddress',
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const getLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves('0')
      const getRequiredVotingPowerStub = sandbox
        .stub(LockToVoteHelper, 'getRequiredVotingPowerForProposal')
        .resolves('0')

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(getLockedBalanceStub.calledOnce).to.be.true
      expect(getRequiredVotingPowerStub.calledOnce).to.be.true
      expect(result).to.be.false
    })

    it('should return false for lockToVote when votingPower is null', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xLockManagerAddress',
        proposalCreationConditionAddress: '0xConditionAddress',
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const getLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves(null)
      const getRequiredVotingPowerStub = sandbox
        .stub(LockToVoteHelper, 'getRequiredVotingPowerForProposal')
        .resolves('100')

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(getLockedBalanceStub.calledOnce).to.be.true
      expect(getRequiredVotingPowerStub.calledOnce).to.be.true
      expect(result).to.be.false
    })

    it('should return false for lockToVote when requiredVotingPower is null', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xLockManagerAddress',
        proposalCreationConditionAddress: '0xConditionAddress',
      } as any)

      const settingsStub = sandbox.stub(Models.Setting, 'findActive').resolves({} as any)

      const getLockedBalanceStub = sandbox.stub(LockToVoteHelper, 'getUserLockedBalance').resolves('100')
      const getRequiredVotingPowerStub = sandbox
        .stub(LockToVoteHelper, 'getRequiredVotingPowerForProposal')
        .resolves(null)

      const result = await MemberInfo.canCreateProposal(
        '0xPluginAddress',
        '0xMemberAddress',
        NetworksEnum.ethereumSepolia,
      )

      expect(pluginStub.calledOnce).to.be.true
      expect(settingsStub.calledOnce).to.be.true
      expect(getLockedBalanceStub.calledOnce).to.be.true
      expect(getRequiredVotingPowerStub.calledOnce).to.be.true
      expect(result).to.be.false
    })

    it('should return false for multisig when settings is null', async () => {
      const pluginStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        address: '0xPluginAddress',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.multisig,
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

    describe('a Safe process', () => {
      const network = NetworksEnum.ethereumSepolia
      const safe = '0x1111111111111111111111111111111111111111'
      const daoA = '0x2222222222222222222222222222222222222222'
      const daoB = '0x3333333333333333333333333333333333333333'
      const owner = '0x5043b9fE61961a46BE7f2930452d0833103f0Ca1'
      const stranger = '0x251DB905400412a538072563212B4Ae7e23F96B8'

      let readOwners: sinon.SinonStub
      let isGranted: sinon.SinonStub

      const createSafeRow = (
        daoAddress: string,
        status = IPluginStatus.installed,
        conditionAddress?: string,
        conditionInterfaceType: IConditionInterfaceType | null = conditionAddress
          ? IConditionInterfaceType.executeSelector
          : null,
      ) =>
        Models.Plugin.create({
          id: `${safe}-${daoAddress}${conditionAddress ? `-${conditionAddress}` : ''}`,
          address: safe,
          daoAddress,
          network,
          interfaceType: IPluginInterfaceType.safe,
          status,
          isSupported: true,
          conditionAddress,
          conditionInterfaceType,
          transactionHash: '0xtx',
          blockNumber: 1,
        })

      const conditionAddress = '0x4444444444444444444444444444444444444444'
      const selector = '0x12345678'
      const target = '0x5555555555555555555555555555555555555555'

      const createSelectorPermissionRow = (overrides: Record<string, unknown> = {}) =>
        Models.SelectorPermission.create({
          network,
          transactionHash: '0xallow',
          transactionIndex: 0,
          logIndex: 1,
          blockNumber: 1,
          conditionAddress,
          daoAddress: daoA,
          pluginAddress: safe,
          selector,
          target,
          chainId: 1,
          isAllowed: true,
          ...overrides,
        })

      beforeEach(() => {
        readOwners = sandbox.stub(SafeChainReaderModule, 'readOwners').resolves([owner])
        isGranted = sandbox.stub(Web3Helper, 'isGranted').resolves(true)
      })

      it('should let an owner create when the Safe still holds execute, asked with an empty execute', async () => {
        await createSafeRow(daoA)

        expect(await MemberInfo.canCreateProposal(safe as any, owner as any, network, daoA as any)).to.be.true

        const executeSelector = new Interface(DAO.abi).getFunction('execute')!.selector
        expect(isGranted.firstCall.args[5].startsWith(executeSelector)).to.be.true
      })

      it('should treat an active conditional Execute grant as eligible without empty calldata', async () => {
        await createSafeRow(daoA, IPluginStatus.installed, conditionAddress)

        expect(await MemberInfo.canCreateProposal(safe, owner, network, daoA)).to.be.true
        expect(isGranted.notCalled).to.be.true
      })

      it('should allow an indexed conditional grant with an effectively allowed selector', async () => {
        await createSafeRow(daoA, IPluginStatus.installed, conditionAddress)
        await createSelectorPermissionRow()

        expect(await MemberInfo.canCreateProposal(safe, owner, network, daoA)).to.be.true
        expect(isGranted.notCalled).to.be.true
      })

      it('should reject an indexed conditional grant when a later block-wide log disallows the selector', async () => {
        await createSafeRow(daoA, IPluginStatus.installed, conditionAddress)
        await createSelectorPermissionRow({
          blockNumber: 20,
          transactionIndex: 1,
          logIndex: 5,
        })
        await createSelectorPermissionRow({
          transactionHash: '0xdisallow',
          blockNumber: 10,
          transactionIndex: 0,
          logIndex: 0,
          disallowed: {
            status: true,
            transactionHash: '0xdisallow',
            blockNumber: 20,
            logIndex: 6,
          },
          isAllowed: false,
        })

        expect(await MemberInfo.canCreateProposal(safe, owner, network, daoA)).to.be.false
        expect(isGranted.notCalled).to.be.true
      })

      it('should reject an owner when the effective Execute grant is denied', async () => {
        await createSafeRow(daoA)
        isGranted.resolves(false)

        expect(await MemberInfo.canCreateProposal(safe, owner, network, daoA)).to.be.false
        expect(isGranted.calledOnce).to.be.true
      })

      it('should check an SPP rule condition on-chain instead of treating it as selector eligibility', async () => {
        await createSafeRow(daoA, IPluginStatus.installed, conditionAddress, IConditionInterfaceType.sppRule)
        isGranted.resolves(false)

        expect(await MemberInfo.canCreateProposal(safe, owner, network, daoA)).to.be.false
        expect(isGranted.calledOnce).to.be.true
      })

      it('should check an unknown condition on-chain instead of treating it as selector eligibility', async () => {
        await createSafeRow(daoA, IPluginStatus.installed, conditionAddress, null)
        isGranted.resolves(false)

        expect(await MemberInfo.canCreateProposal(safe, owner, network, daoA)).to.be.false
        expect(isGranted.calledOnce).to.be.true
      })

      it('should fail closed when owners cannot be read', async () => {
        await createSafeRow(daoA)
        readOwners.rejects(new Error('rpc unavailable'))

        expect(await MemberInfo.canCreateProposal(safe, owner, network, daoA)).to.be.false
        expect(isGranted.notCalled).to.be.true
      })

      it('should not let someone who is not an owner create, without asking the DAO', async () => {
        await createSafeRow(daoA)

        expect(await MemberInfo.canCreateProposal(safe, stranger, network, daoA)).to.be.false
        expect(isGranted.notCalled).to.be.true
      })

      it('should not let an owner create once execute was revoked from the Safe', async () => {
        await createSafeRow(daoA, IPluginStatus.uninstalled)

        expect(await MemberInfo.canCreateProposal(safe, owner, network, daoA)).to.be.false
        expect(readOwners.notCalled).to.be.true
      })

      it('should ask the DAO it is called for when the Safe is a process of two DAOs', async () => {
        await createSafeRow(daoA)
        await createSafeRow(daoB)

        await MemberInfo.canCreateProposal(safe, owner, network, daoB)

        expect(isGranted.firstCall.args[0]).to.equal(daoB)
      })

      it('should reject the same Safe in a DAO where it is not a process', async () => {
        await createSafeRow(daoA)

        expect(await MemberInfo.canCreateProposal(safe, owner, network, daoB)).to.be.false
        expect(readOwners.notCalled).to.be.true
      })

      it('should scope any plugin lookup to the DAO when one is supplied', async () => {
        await Models.Plugin.create({
          id: 'multisig-row',
          address: safe,
          daoAddress: daoA,
          network,
          interfaceType: IPluginInterfaceType.multisig,
          status: IPluginStatus.installed,
          transactionHash: '0xtx',
          blockNumber: 1,
        })
        const findByAddress = sandbox.spy(Models.Plugin, 'findByAddress')

        await MemberInfo.canCreateProposal(safe, owner, network, daoA)

        expect(findByAddress.notCalled).to.be.true
      })

      it('should not find the Safe without a DAO', async () => {
        await createSafeRow(daoA)

        expect(await MemberInfo.canCreateProposal(safe, owner, network)).to.be.false
        expect(readOwners.notCalled).to.be.true
      })
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

    it('should return zero voting power when results is null or not an array', async () => {
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

      const web3BatchHelperStub = sandbox.stub(Web3BatchHelper, 'getLockVotingPowerAtInBatch').resolves(null as any)

      const result = await MemberInfo.getLockVotingPowerBatch(locks)

      expect(web3BatchHelperStub.calledOnce).to.be.true
      expect(result).to.deep.equal([
        { tokenId: 'token1', votingPower: '0' },
        { tokenId: 'token2', votingPower: '0' },
      ])
    })
  })
})
