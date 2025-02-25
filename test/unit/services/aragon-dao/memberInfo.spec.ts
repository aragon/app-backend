import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { MemberInfo } from '@services/aragon-dao/memberInfo'
import Web3Helper from '@helpers/web3'
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
})
