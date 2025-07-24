import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { ProxyMember } from '@modules/proxyMember'
import EnsHelper from '@helpers/ens'
import { IMetricAction, NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
import DbTx from '@modules/dbTx'
import Web3Utils from '@helpers/web3Utils'

describe('Modules:ProxyMember', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('createMember', () => {
    it('should create a new member', async () => {
      const parsedMemberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'

      const findExistingLogStub = sandbox.stub(Models.Member, 'findExistingLog').resolves(null)
      const getEnsWithUniversalResolverStub = sandbox
        .stub(EnsHelper, 'getEnsWithUniversalResolver')
        .resolves('louis.eth' as any)

      const createdMember = await ProxyMember.createMember(parsedMemberAddress)

      expect(createdMember).to.be.an('object')
      expect(createdMember?.address).to.equal(parsedMemberAddress)
      expect(createdMember?.ens).to.equal('louis.eth')
      expect(findExistingLogStub.calledOnceWith({ address: parsedMemberAddress })).to.be.true
      expect(getEnsWithUniversalResolverStub.calledOnceWith(parsedMemberAddress)).to.be.true
    })

    it('should return an existing member if it already exists', async () => {
      const parsedMemberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const existingMember = {
        address: parsedMemberAddress,
        ens: 'louis.eth',
      }

      const findExistingLogStub = sandbox.stub(Models.Member, 'findExistingLog').resolves(existingMember as any)

      const result = await ProxyMember.createMember(parsedMemberAddress)

      expect(result).to.deep.equal(existingMember)
      expect(findExistingLogStub.calledOnceWith({ address: parsedMemberAddress })).to.be.true
    })

    it('should handle errors gracefully and return null', async () => {
      const parsedMemberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'

      const findExistingLogStub = sandbox.stub(Models.Member, 'findExistingLog').throws(new Error('Database error'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.createMember(parsedMemberAddress)

      expect(result).to.be.null
      expect(findExistingLogStub.calledOnceWith({ address: parsedMemberAddress })).to.be.true
      expect(loggerErrorStub.calledOnce).to.be.true
    })

    it('should create a new member in parallel calls', async () => {
      const parsedMemberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'

      const findExistingLogStub = sandbox.stub(Models.Member, 'findExistingLog').resolves(null)
      const getEnsWithUniversalResolverStub = sandbox
        .stub(EnsHelper, 'getEnsWithUniversalResolver')
        .resolves('louis.eth' as any)

      const [result1, result2, result3] = await Promise.all([
        ProxyMember.createMember(parsedMemberAddress),
        ProxyMember.createMember(parsedMemberAddress),
        ProxyMember.createMember(parsedMemberAddress),
      ])

      expect(result1?.address).to.equal(parsedMemberAddress)
      expect(result2?.address).to.equal(parsedMemberAddress)
      expect(result3?.address).to.equal(parsedMemberAddress)
      expect(findExistingLogStub.callCount).to.be.at.least(3)
      expect(getEnsWithUniversalResolverStub.callCount).to.be.at.least(3)
    })

    it('should force create a new member with shitty address', async () => {
      const parsedMemberAddress = 'invalid-address'

      const findExistingLogStub = sandbox.stub(Models.Member, 'findExistingLog').resolves(null)
      const getEnsWithUniversalResolverStub = sandbox
        .stub(EnsHelper, 'getEnsWithUniversalResolver')
        .resolves('louis.eth' as any)

      const createdMember = await ProxyMember.createMember(parsedMemberAddress)

      expect(createdMember).to.be.an('object')
      expect(createdMember?.address).to.equal(parsedMemberAddress)
      expect(createdMember?.ens).to.equal('louis.eth')
      expect(findExistingLogStub.calledOnceWith({ address: parsedMemberAddress })).to.be.true
      expect(getEnsWithUniversalResolverStub.calledOnceWith(parsedMemberAddress)).to.be.true
    })
  })

  describe('createMetrics', () => {
    it('should create new metrics when none exist', async () => {
      const address = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const pluginAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(Models.MemberMetrics, 'findOne').resolves(null)
      const createStub = sandbox.stub(Models.MemberMetrics, 'create').resolves({ id: 'metrics-id' })

      const result = await ProxyMember.createMetrics({ address, pluginAddress, network })

      expect(result).to.be.an('object')
      expect(result?.id).to.equal('metrics-id')
      expect(
        Models.MemberMetrics.findOne.calledOnceWith({ address, pluginAddress, network }, null, {
          session: sinon.match.any,
        }),
      ).to.be.true
      expect(createStub.calledOnceWith({ address, pluginAddress, network }, { session: sinon.match.any })).to.be.true
    })

    it('should return existing metrics if they exist', async () => {
      const address = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const pluginAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet
      const existingMetrics = { id: 'existing-metrics-id' }

      sandbox.stub(Models.MemberMetrics, 'findOne').resolves(existingMetrics)
      const createStub = sandbox.stub(Models.MemberMetrics, 'create')

      const result = await ProxyMember.createMetrics({ address, pluginAddress, network })

      expect(result).to.equal(existingMetrics)
      expect(
        Models.MemberMetrics.findOne.calledOnceWith({ address, pluginAddress, network }, null, {
          session: sinon.match.any,
        }),
      ).to.be.true
      expect(createStub.notCalled).to.be.true
    })

    it('should handle errors during metrics creation and return null', async () => {
      const address = '0x123'
      const pluginAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(Models.MemberMetrics, 'findOne').rejects(new Error('Database error'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.createMetrics({ address, pluginAddress, network })

      expect(result).to.be.null
      expect(loggerErrorStub.calledOnce).to.be.true
    })

    it('should handle invalid input parameters gracefully', async () => {
      const invalidParams = { address: null, pluginAddress: '0xabc', network: NetworksEnum.ethereumMainnet } as any
      const loggerStub = sandbox.stub(Logger, 'error')
      const result = await ProxyMember.createMetrics(invalidParams)

      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
    })
  })

  describe('getBalances', () => {
    it('should return existing token balance if found', async () => {
      const address = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const tokenAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet

      const existingToken = { id: 'token-id', address, tokenAddress, network }
      const findByAddressAndTokenStub = sandbox
        .stub(Models.MemberBalance, 'findByAddressAndToken')
        .resolves(existingToken)

      const result = await ProxyMember.getBalances({ address, tokenAddress, network })
      expect(result).to.equal(existingToken)
      expect(findByAddressAndTokenStub.calledWith({ address, tokenAddress, network })).to.be.true
    })

    it('should create new token balance if not found', async () => {
      const address = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const tokenAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet

      const findByAddressAndTokenStub = sandbox.stub(Models.MemberBalance, 'findByAddressAndToken').resolves(null)
      const data = { address, tokenAddress, network }

      const result = await ProxyMember.getBalances({ address, tokenAddress, network })
      expect(result?.address).to.equal(data.address)
      expect(findByAddressAndTokenStub.calledWith({ address, tokenAddress, network })).to.be.true
    })

    it('should create new token balance in parallel', async () => {
      const address = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const tokenAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet

      const data = { address, tokenAddress, network }
      const [result1, result2, result3] = await Promise.all([
        ProxyMember.getBalances({ address, tokenAddress, network }),
        ProxyMember.getBalances({ address, tokenAddress, network }),
        ProxyMember.getBalances({ address, tokenAddress, network }),
      ])

      expect(result1?.address).to.equal(data.address)
      expect(result2?.address).to.equal(data.address)
      expect(result3?.address).to.equal(data.address)

      const items = await Models.MemberBalance.countDocuments()
      expect(items).to.equal(1)
    })

    it('should return null if address is invalid', async () => {
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await ProxyMember.getBalances({
        address: 'invalid',
        tokenAddress: '0xabc',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const address = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      sandbox.stub(Web3Utils, 'parseAddress').returns(address)
      sandbox.stub(Models.MemberBalance, 'findByAddressAndToken').rejects(new Error('Database error'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.getBalances({
        address,
        tokenAddress: '0xabc',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.null
      expect(loggerErrorStub.calledOnce).to.be.true
    })
  })

  describe('updateActivity', () => {
    it('should update activity and set firstActivity if not set', async () => {
      const memberAddress = '0x123'
      const pluginAddress = '0xabc'
      const blockNumber = 100
      const network = NetworksEnum.ethereumMainnet

      const member = { id: 'member-id', firstActivity: null } as any
      const updatedMemberMetrics = { id: 'metrics-id', lastActivity: 1680000000, firstActivity: 1680000000 }
      const memberMetrics = {
        id: 'metrics-id',
        update: sandbox.stub().resolves(updatedMemberMetrics),
      } as any
      const blockTimestamp = 1680000000

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member)
      const createMetricsStub = sandbox.stub(ProxyMember, 'createMetrics').resolves(memberMetrics)
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(blockTimestamp)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.updateActivity({ memberAddress, pluginAddress, blockNumber, network })

      expect(result).to.equal(updatedMemberMetrics)
      expect(createMemberStub.calledOnceWithExactly(memberAddress)).to.be.true
      expect(createMetricsStub.calledOnceWithExactly({ address: memberAddress, pluginAddress, network })).to.be.true
      expect(getBlockTimestampStub.calledOnceWithExactly(blockNumber, network)).to.be.true
      expect(
        memberMetrics.update.calledOnceWithExactly(
          { lastActivity: blockTimestamp, firstActivity: blockTimestamp },
          { session: sinon.match.any },
        ),
      ).to.be.true
      expect(loggerVerboseStub.calledOnceWith('Update Member activity' as any)).to.be.true
    })

    it('should update activity and not set firstActivity if already set', async () => {
      const memberAddress = '0x123'
      const pluginAddress = '0xabc'
      const blockNumber = 100
      const network = NetworksEnum.ethereumMainnet

      const existingFirstActivity = new Date('2023-01-01')
      const member = { id: 'member-id', firstActivity: existingFirstActivity } as any
      const updatedMemberMetrics = { id: 'metrics-id', lastActivity: 1680000000 }
      const memberMetrics = {
        id: 'metrics-id',
        update: sandbox.stub().resolves(updatedMemberMetrics),
      } as any
      const blockTimestamp = 1680000000

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member)
      const createMetricsStub = sandbox.stub(ProxyMember, 'createMetrics').resolves(memberMetrics)
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(blockTimestamp)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.updateActivity({ memberAddress, pluginAddress, blockNumber, network })

      expect(result).to.equal(updatedMemberMetrics)
      expect(createMemberStub.calledOnceWithExactly(memberAddress)).to.be.true
      expect(createMetricsStub.calledOnceWithExactly({ address: memberAddress, pluginAddress, network })).to.be.true
      expect(getBlockTimestampStub.calledOnceWithExactly(blockNumber, network)).to.be.true
      expect(memberMetrics.update.calledOnceWithExactly({ lastActivity: blockTimestamp }, { session: sinon.match.any }))
        .to.be.true
      expect(loggerVerboseStub.calledOnceWith('Update Member activity' as any)).to.be.true
    })

    it('should return null if createMember fails', async () => {
      const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const pluginAddress = '0xabc'
      const blockNumber = 100
      const network = NetworksEnum.ethereumMainnet

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').rejects(new Error('Some error'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.updateActivity({ memberAddress, pluginAddress, blockNumber, network })

      expect(result).to.be.null
      expect(createMemberStub.calledOnceWithExactly(memberAddress)).to.be.true
      expect(loggerErrorStub.calledOnceWith('Error updating member activity' as any)).to.be.true
    })

    it('should handle errors from Web3Helper.getBlockTimestamp and return null', async () => {
      const memberAddress = '0x123'
      const pluginAddress = '0xabc'
      const blockNumber = 100
      const network = NetworksEnum.ethereumMainnet

      const member = { id: 'member-id', firstActivity: null } as any
      const memberMetrics = {
        id: 'metrics-id',
        update: sandbox.stub().resolves({ id: 'metrics-id' }),
      } as any

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member)
      const createMetricsStub = sandbox.stub(ProxyMember, 'createMetrics').resolves(memberMetrics)
      const getBlockTimestampStub = sandbox
        .stub(Web3Helper, 'getBlockTimestamp')
        .rejects(new Error('Block fetch error'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.updateActivity({ memberAddress, pluginAddress, blockNumber, network })

      expect(result).to.be.null
      expect(createMemberStub.calledOnceWithExactly(memberAddress)).to.be.true
      expect(createMetricsStub.calledOnceWithExactly({ address: memberAddress, pluginAddress, network })).to.be.true
      expect(getBlockTimestampStub.calledOnceWithExactly(blockNumber, network)).to.be.true
      expect(loggerErrorStub.calledOnceWith('Error updating member activity' as any)).to.be.true
    })

    it('should return null if createMetrics fails', async () => {
      const memberAddress = '0x123'
      const pluginAddress = '0xabc'
      const blockNumber = 100
      const network = NetworksEnum.ethereumMainnet

      const member = { id: 'member-id' } as any

      sandbox.stub(ProxyMember, 'createMember').resolves(member)
      sandbox.stub(ProxyMember, 'createMetrics').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1680000000)

      const result = await ProxyMember.updateActivity({ memberAddress, pluginAddress, blockNumber, network })

      expect(result).to.be.null
    })

    it('should handle errors from memberMetrics.update and return null', async () => {
      const memberAddress = '0x123'
      const pluginAddress = '0xabc'
      const blockNumber = 100
      const network = NetworksEnum.ethereumMainnet

      const member = { id: 'member-id', firstActivity: null } as any
      const memberMetrics = {
        id: 'metrics-id',
        update: sandbox.stub().rejects(new Error('Update failed')),
      } as any

      sandbox.stub(ProxyMember, 'createMember').resolves(member)
      sandbox.stub(ProxyMember, 'createMetrics').resolves(memberMetrics)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1680000000)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.updateActivity({ memberAddress, pluginAddress, blockNumber, network })

      expect(result).to.be.null
      expect(loggerErrorStub.calledOnce).to.be.true
    })
  })

  describe('updateMetricsByAction', () => {
    it('should update metrics by valid action and return true', async () => {
      const metricAction = IMetricAction.increaseProposalCount
      const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const pluginAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet

      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      await ProxyMember.updateMetricsByAction(metricAction, { memberAddress, pluginAddress, network })

      expect(loggerVerboseStub.calledWith('Updated Member DAO metrics' as any)).to.be.true
    })

    it('should not update metrics and return false if action is invalid', async () => {
      const metricAction = 'invalidAction' as IMetricAction
      const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const pluginAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet

      const mockMetrics = {
        id: 'metrics-id',
      } as any
      const createMetricsStub = sandbox.stub(ProxyMember, 'createMetrics').resolves(mockMetrics)

      const loggerErrorStub = sandbox.stub(Logger, 'error')

      await ProxyMember.updateMetricsByAction(metricAction, {
        memberAddress,
        pluginAddress,
        network,
      })

      expect(createMetricsStub.calledOnce).to.be.true
      expect(mockMetrics.increaseProposalCount).to.be.undefined
      expect(mockMetrics.increaseVoteCount).to.be.undefined
      expect(mockMetrics.increaseDelegateReceivedCount).to.be.undefined

      const executeTxFnSpy = sandbox.spy(DbTx, 'executeTxFn')
      expect(executeTxFnSpy.notCalled).to.be.true

      expect(loggerErrorStub.calledOnceWith('Unsupported metric action' as any)).to.be.true
    })

    it('should return false if createMetrics returns null', async () => {
      const metricAction = IMetricAction.increaseVoteCount
      const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const pluginAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet

      const createMetricsStub = sandbox.stub(ProxyMember, 'createMetrics').resolves(null)

      await ProxyMember.updateMetricsByAction(metricAction, {
        memberAddress,
        pluginAddress,
        network,
      })

      expect(createMetricsStub.calledOnce)
    })

    it('should return null if address is invalid', async () => {
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await ProxyMember.updateMetricsByAction(IMetricAction.increaseProposalCount, {
        memberAddress: 'invalid',
        pluginAddress: '0xabc',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.null
    })

    it('should handle increaseVoteCount action', async () => {
      const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const metrics = {
        id: 'metrics-id',
        increaseVoteCount: sandbox.stub().resolves({ id: 'metrics-id' }),
      } as any

      sandbox.stub(Web3Utils, 'parseAddress').returns(memberAddress)
      sandbox.stub(ProxyMember, 'createMetrics').resolves(metrics)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      await ProxyMember.updateMetricsByAction(IMetricAction.increaseVoteCount, {
        memberAddress,
        pluginAddress: '0xabc',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(metrics.increaseVoteCount.calledOnceWith(1, { session: sinon.match.any })).to.be.true
      expect(loggerVerboseStub.calledOnce).to.be.true
    })

    it('should handle increaseDelegateReceivedCount action', async () => {
      const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const metrics = {
        id: 'metrics-id',
        increaseDelegateReceivedCount: sandbox.stub().resolves({ id: 'metrics-id' }),
      } as any

      sandbox.stub(Web3Utils, 'parseAddress').returns(memberAddress)
      sandbox.stub(ProxyMember, 'createMetrics').resolves(metrics)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      await ProxyMember.updateMetricsByAction(IMetricAction.increaseDelegateReceivedCount, {
        memberAddress,
        pluginAddress: '0xabc',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(metrics.increaseDelegateReceivedCount.calledOnceWith(1, { session: sinon.match.any })).to.be.true
      expect(loggerVerboseStub.calledOnce).to.be.true
    })

    it('should handle decreaseDelegateReceivedCount action', async () => {
      const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const metrics = {
        id: 'metrics-id',
        decreaseDelegateReceivedCount: sandbox.stub().resolves({ id: 'metrics-id' }),
      } as any

      sandbox.stub(Web3Utils, 'parseAddress').returns(memberAddress)
      sandbox.stub(ProxyMember, 'createMetrics').resolves(metrics)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      await ProxyMember.updateMetricsByAction(IMetricAction.decreaseDelegateReceivedCount, {
        memberAddress,
        pluginAddress: '0xabc',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(metrics.decreaseDelegateReceivedCount.calledOnceWith(1, { session: sinon.match.any })).to.be.true
      expect(loggerVerboseStub.calledOnce).to.be.true
    })

    it('should handle errors during metric update', async () => {
      const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const metrics = {
        id: 'metrics-id',
        increaseProposalCount: sandbox.stub().rejects(new Error('Update failed')),
      } as any

      sandbox.stub(Web3Utils, 'parseAddress').returns(memberAddress)
      sandbox.stub(ProxyMember, 'createMetrics').resolves(metrics)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      await ProxyMember.updateMetricsByAction(IMetricAction.increaseProposalCount, {
        memberAddress,
        pluginAddress: '0xabc',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(metrics.increaseProposalCount.calledOnce).to.be.true
      expect(loggerErrorStub.calledOnce).to.be.true
    })

    describe('addToDao', () => {
      it('should add member to DAO if not already a member', async () => {
        const params = {
          memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
          daoAddress: '0xdao',
          pluginAddress: '0xplugin',
          network: NetworksEnum.ethereumMainnet,
        }

        const parsedMemberAddress = '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19'
        const member = { id: 'member-id', address: params.memberAddress }
        const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').returns(parsedMemberAddress)
        const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
        const findMappingStub = sandbox.stub(Models.DaoMemberMapping, 'findMapping').resolves(null)
        const createMappingStub = sandbox.stub(Models.DaoMemberMapping, 'create').resolves({ id: 'mapping-id' })
        const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

        const result = await ProxyMember.addToDao(params)

        expect(result).to.equal(member)
        expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(createMemberStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(findMappingStub.calledOnce).to.be.true
        expect(createMappingStub.calledOnce).to.be.true
        expect(loggerVerboseStub.calledOnce).to.be.true
      })

      it('should not add member to DAO if already a member', async () => {
        const params = {
          memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
          daoAddress: '0xdao',
          pluginAddress: '0xplugin',
          network: NetworksEnum.ethereumMainnet,
        }

        const parsedMemberAddress = '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19'
        const member = { id: 'member-id', address: params.memberAddress }
        const existingDaoMember = { id: 'mapping-id' }

        const parseAddressStub = sandbox
          .stub(Web3Utils, 'parseAddress')
          .withArgs(params.memberAddress)
          .returns(parsedMemberAddress)
        const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
        const findMappingStub = sandbox.stub(Models.DaoMemberMapping, 'findMapping').resolves(existingDaoMember)
        const createMappingStub = sandbox.stub(Models.DaoMemberMapping, 'create')
        const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

        const result = await ProxyMember.addToDao(params)

        expect(result).to.equal(member)
        expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(createMemberStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(findMappingStub.calledOnce).to.be.true
        expect(createMappingStub.notCalled).to.be.true
        expect(loggerVerboseStub.notCalled).to.be.true
      })

      it('should not add a member if member address is invalid', async () => {
        const params = {
          memberAddress: '0x12',
          daoAddress: '0xdao',
          pluginAddress: '0xplugin',
          network: NetworksEnum.ethereumMainnet,
        }

        const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').withArgs(params.memberAddress).returns(null)
        const createMemberStub = sandbox.stub(ProxyMember, 'createMember')
        const loggerErrorStub = sandbox.stub(Logger, 'error')

        const result = await ProxyMember.addToDao(params)

        expect(result).to.be.null
        expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(createMemberStub.notCalled).to.be.true
        expect(loggerErrorStub.notCalled).to.be.true
      })

      it('should return null and log error if createMember fails', async () => {
        const params = {
          memberAddress: '0xValidAddress',
          daoAddress: '0xdao',
          pluginAddress: '0xplugin',
          network: NetworksEnum.ethereumMainnet,
        }

        const parsedMemberAddress = '0xValidAddress'
        const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(null)
        const loggerErrorStub = sandbox.stub(Logger, 'error')

        const parseAddressStub = sandbox
          .stub(Web3Utils, 'parseAddress')
          .withArgs(params.memberAddress)
          .returns(parsedMemberAddress)

        const result = await ProxyMember.addToDao(params)

        expect(result).to.be.null
        expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(createMemberStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(loggerErrorStub.calledOnceWith('Failed to add member to dao' as any)).to.be.true
      })

      it('should return null and log error if DbTx.executeTxFn throws an error', async () => {
        const params = {
          memberAddress: '0xValidAddress',
          daoAddress: '0xdao',
          pluginAddress: '0xplugin',
          network: NetworksEnum.ethereumMainnet,
        }

        const parsedMemberAddress = '0xValidAddress'
        const member = { id: 'member-id', address: params.memberAddress }

        const parseAddressStub = sandbox
          .stub(Web3Utils, 'parseAddress')
          .withArgs(params.memberAddress)
          .returns(parsedMemberAddress)
        const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
        const executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn').rejects(new Error('Transaction failed'))
        const loggerErrorStub = sandbox.stub(Logger, 'error')

        const result = await ProxyMember.addToDao(params)

        expect(result).to.be.null
        expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(createMemberStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(executeTxFnStub.calledOnce).to.be.true
        expect(loggerErrorStub.calledOnceWith('Error in addToDao' as any)).to.be.true
      })

      it('should handle concurrent addToDao calls correctly without creating duplicate mappings', async () => {
        const params = {
          memberAddress: '0xConcurrentMember',
          daoAddress: '0xdao',
          pluginAddress: '0xplugin',
          network: NetworksEnum.ethereumMainnet,
        }

        const parsedMemberAddress = '0xConcurrentMember'
        const member = { id: 'member-id', address: params.memberAddress }

        const parseAddressStub = sandbox
          .stub(Web3Utils, 'parseAddress')
          .withArgs(params.memberAddress)
          .returns(parsedMemberAddress)

        const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
        const findMappingStub = sandbox.stub(Models.DaoMemberMapping, 'findMapping')
        findMappingStub.onCall(0).resolves(null).onCall(1).resolves({ id: 'existing-mapping-id' })

        const createMappingStub = sandbox.stub(Models.DaoMemberMapping, 'create').resolves({ id: 'mapping-id' })
        const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

        const [result1, result2] = await Promise.all([ProxyMember.addToDao(params), ProxyMember.addToDao(params)])

        expect(result1).to.equal(member)
        expect(result2).to.equal(member)

        expect(parseAddressStub.calledTwice).to.be.true
        expect(createMemberStub.calledTwice).to.be.true
        expect(findMappingStub.calledTwice).to.be.true
        expect(createMappingStub.calledOnce).to.be.true
        expect(loggerVerboseStub.calledOnce).to.be.true
      })
    })

    describe('removeFromDao', () => {
      it('should remove member from DAO if member is part of the DAO', async () => {
        const params = {
          memberAddress: '0xMemberToRemove',
          daoAddress: '0xdao',
          pluginAddress: '0xplugin',
          network: NetworksEnum.ethereumMainnet,
        }

        const parsedMemberAddress = '0xMemberToRemove'
        const member: any = { id: 'member-id', address: params.memberAddress }

        const existingDaoMember = {
          id: 'mapping-id',
          removeSelf: sandbox.stub().resolves({ id: 'removed-log-id' }),
        }

        const parseAddressStub = sandbox
          .stub(Web3Utils, 'parseAddress')
          .withArgs(params.memberAddress)
          .returns(parsedMemberAddress)

        const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)

        const findMappingStub = sandbox.stub(Models.DaoMemberMapping, 'findMapping').resolves(existingDaoMember)
        const createMappingStub = sandbox.stub(Models.DaoMemberMapping, 'create')

        const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

        const result = await ProxyMember.removeFromDao(params)

        expect(result).to.equal(member)
        expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(createMemberStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(findMappingStub.calledOnce).to.be.true
        expect(existingDaoMember.removeSelf.calledOnce).to.be.true
        expect(createMappingStub.notCalled).to.be.true
        expect(loggerVerboseStub.calledOnceWith('Remove DaoMemberMapping' as any)).to.be.true
      })

      it('should return member without removing DAO mapping if member is not part of the DAO', async () => {
        const params = {
          memberAddress: '0xNonMember',
          daoAddress: '0xdao',
          pluginAddress: '0xplugin',
          network: NetworksEnum.ethereumMainnet,
        }

        const parsedMemberAddress = '0xNonMember'
        const member: any = { id: 'member-id', address: params.memberAddress }

        const parseAddressStub = sandbox
          .stub(Web3Utils, 'parseAddress')
          .withArgs(params.memberAddress)
          .returns(parsedMemberAddress)

        const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
        const findMappingStub = sandbox.stub(Models.DaoMemberMapping, 'findMapping').resolves(null)
        const createMappingStub = sandbox.stub(Models.DaoMemberMapping, 'create')
        const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

        const result = await ProxyMember.removeFromDao(params)

        expect(result).to.equal(member)
        expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(createMemberStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(findMappingStub.calledOnce).to.be.true
        expect(loggerVerboseStub.notCalled).to.be.true
        expect(createMappingStub.notCalled).to.be.true
      })

      it('should not remove DAO mapping and return null if member address is invalid', async () => {
        const params = {
          memberAddress: '0xInvalid',
          daoAddress: '0xdao',
          pluginAddress: '0xplugin',
          network: NetworksEnum.ethereumMainnet,
        }

        const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').withArgs(params.memberAddress).returns(null)
        const createMemberStub = sandbox.stub(ProxyMember, 'createMember')
        const loggerErrorStub = sandbox.stub(Logger, 'error')

        const result = await ProxyMember.removeFromDao(params)

        expect(result).to.be.null
        expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(createMemberStub.notCalled).to.be.true
        expect(loggerErrorStub.notCalled).to.be.true
      })

      it('should return null and log error if ProxyMember.createMember throw an error', async () => {
        const params = {
          memberAddress: '0xValidMember',
          daoAddress: '0xdao',
          pluginAddress: '0xplugin',
          network: NetworksEnum.ethereumMainnet,
        }

        const parsedMemberAddress = '0xValidMember'
        sandbox.stub(Models.DaoMemberMapping, 'findMapping').rejects(new Error('Database error'))
        const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').returns(parsedMemberAddress)
        const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(null)
        const loggerErrorStub = sandbox.stub(Logger, 'error')

        const result = await ProxyMember.removeFromDao(params)

        expect(result).to.be.null
        expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(createMemberStub.calledOnceWithExactly(params.memberAddress)).to.be.true
        expect(loggerErrorStub.calledOnceWith('Error in removeFromDao' as any)).to.be.true
      })

      it('should handle concurrent removeFromDao calls correctly without errors', async () => {
        const params = {
          memberAddress: '0xConcurrentMember',
          daoAddress: '0xdao',
          pluginAddress: '0xplugin',
          network: NetworksEnum.ethereumMainnet,
        }

        const parsedMemberAddress = '0xConcurrentMember'
        const member: any = { id: 'member-id', address: params.memberAddress }

        const existingDaoMember = {
          id: 'mapping-id',
          removeSelf: sandbox.stub().resolves({ id: 'removed-log-id' }),
        }

        const parseAddressStub = sandbox
          .stub(Web3Utils, 'parseAddress')
          .withArgs(params.memberAddress)
          .returns(parsedMemberAddress)

        const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)

        const findMappingStub = sandbox
          .stub(Models.DaoMemberMapping, 'findMapping')
          .onCall(0)
          .resolves(existingDaoMember)
          .onCall(1)
          .resolves(null)

        const createMappingStub = sandbox.stub(Models.DaoMemberMapping, 'create')
        const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

        const [result1, result2] = await Promise.all([
          ProxyMember.removeFromDao(params),
          ProxyMember.removeFromDao(params),
        ])

        expect(result1).to.equal(member)
        expect(result2).to.equal(member)

        expect(parseAddressStub.calledTwice).to.be.true
        expect(createMemberStub.calledTwice).to.be.true
        expect(findMappingStub.calledTwice).to.be.true
        expect(existingDaoMember.removeSelf.calledOnce).to.be.true
        expect(createMappingStub.notCalled).to.be.true
        expect(loggerVerboseStub.calledOnceWith('Remove DaoMemberMapping' as any)).to.be.true
      })
    })
  })

  describe('updateDelegationMetrics', () => {
    it('should update delegation metrics successfully', async () => {
      const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const pluginAddress = '0xabc'
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.ethereumMainnet

      const metrics = {
        id: 'metrics-id',
        update: sandbox.stub().resolves({ id: 'metrics-id', delegateReceivedCount: 5 }),
      } as any

      sandbox.stub(Web3Utils, 'parseAddress').returns(memberAddress)
      sandbox.stub(ProxyMember, 'createMetrics').resolves(metrics)
      sandbox.stub(Models.MemberTransaction, 'getReceiveDelegationCount').resolves(5)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.updateDelegationMetrics({
        memberAddress,
        pluginAddress,
        tokenAddress,
        network,
      })

      expect(result).to.be.an('object')
      expect(result?.delegateReceivedCount).to.equal(5)
      expect(metrics.update.calledOnceWith({ delegateReceivedCount: 5 }, { session: sinon.match.any })).to.be.true
      expect(loggerVerboseStub.calledOnce).to.be.true
    })

    it('should return null if address is invalid', async () => {
      sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await ProxyMember.updateDelegationMetrics({
        memberAddress: 'invalid',
        pluginAddress: '0xabc',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.null
    })

    it('should return undefined and log error if createMetrics fails', async () => {
      const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'

      sandbox.stub(Web3Utils, 'parseAddress').returns(memberAddress)
      sandbox.stub(ProxyMember, 'createMetrics').resolves(null)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.updateDelegationMetrics({
        memberAddress,
        pluginAddress: '0xabc',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.undefined
      expect(loggerErrorStub.calledOnce).to.be.true
    })

    it('should handle errors during update', async () => {
      const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const metrics = {
        id: 'metrics-id',
        update: sandbox.stub().rejects(new Error('Update failed')),
      } as any

      sandbox.stub(Web3Utils, 'parseAddress').returns(memberAddress)
      sandbox.stub(ProxyMember, 'createMetrics').resolves(metrics)
      sandbox.stub(Models.MemberTransaction, 'getReceiveDelegationCount').resolves(5)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.updateDelegationMetrics({
        memberAddress,
        pluginAddress: '0xabc',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.undefined
      expect(loggerErrorStub.calledOnce).to.be.true
    })
  })

  describe('isMemberOfDao', () => {
    it('should find existing member mapping', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as any,
        daoAddress: '0xdao' as any,
        pluginAddress: '0xplugin' as any,
        network: NetworksEnum.ethereumMainnet,
        tokenAddress: '0xtoken' as any,
      }
      const mapping = { id: 'mapping-id' }

      const findMappingStub = sandbox.stub(Models.DaoMemberMapping, 'findMapping').resolves(mapping)

      const result = await ProxyMember.isMemberOfDao(params)

      expect(result).to.equal(mapping)
      expect(findMappingStub.calledOnceWith(params, { session: undefined })).to.be.true
    })

    it('should pass session when provided', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as any,
        daoAddress: '0xdao' as any,
        pluginAddress: '0xplugin' as any,
        network: NetworksEnum.ethereumMainnet,
      }
      const session = { id: 'session-id' }
      const mapping = { id: 'mapping-id' }

      const findMappingStub = sandbox.stub(Models.DaoMemberMapping, 'findMapping').resolves(mapping)

      const result = await ProxyMember.isMemberOfDao(params, session)

      expect(result).to.equal(mapping)
      expect(findMappingStub.calledOnceWith(params, { session })).to.be.true
    })

    it('should return null when no mapping exists', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C' as any,
        daoAddress: '0xdao' as any,
        pluginAddress: '0xplugin' as any,
        network: NetworksEnum.ethereumMainnet,
      }

      sandbox.stub(Models.DaoMemberMapping, 'findMapping').resolves(null)

      const result = await ProxyMember.isMemberOfDao(params)

      expect(result).to.be.null
    })
  })
})
