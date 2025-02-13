import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { MemberInfo } from '@services/aragon-dao/memberInfo'
import Web3Helper from '@helpers/web3'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

describe('AragonDao: memberInfo', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getByTokenAddress', () => {
    it('should return balance and voting power', async () => {
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves('100' as any)
      const getVotesStub = sandbox.stub(GovernanceErc20Helper, 'getVotes').resolves(200n)

      const result = await MemberInfo.getByTokenAddress('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)

      expect(getERC20BalanceStub.calledOnce).to.be.true
      expect(getERC20BalanceStub.calledWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(getVotesStub.calledOnce).to.be.true
      expect(getVotesStub.calledWith('0xUserAddress', '0xTokenAddress', NetworksEnum.ethereumSepolia)).to.be.true
      expect(result).to.deep.equal({
        balance: '100',
        votingPower: '200',
      })
    })
  })
})
