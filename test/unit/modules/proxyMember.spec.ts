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
  })

  describe('createMetrics', () => {
    it('should create new metrics when none exist', async () => {
      const address = '0x123'
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
      const address = '0x123'
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

      const errorLoggerStub = sandbox.stub(Logger, 'error')
      const result = await ProxyMember.createMetrics(invalidParams)

      expect(errorLoggerStub.calledOnce).to.be.true
      expect(errorLoggerStub.calledWith('Error creating new member metrics' as any)).to.be.true
      expect(result).to.be.null
    })
  })

  describe('getBalances', () => {
    it('should return existing token balance if found', async () => {
      const address = '0x123'
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
      const address = '0x123'
      const tokenAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet

      const findByAddressAndTokenStub = sandbox.stub(Models.MemberBalance, 'findByAddressAndToken').resolves(null)
      const data = { address, tokenAddress, network }

      const result = await ProxyMember.getBalances({ address, tokenAddress, network })
      expect(result?.address).to.equal(data.address)
      expect(findByAddressAndTokenStub.calledWith({ address, tokenAddress, network })).to.be.true
    })

    it('should create new token balance in parallel', async () => {
      const address = '0x123'
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
      const memberAddress = '0x123'
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
        .rejects(new Error('Database connection failed'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.updateActivity({ memberAddress, pluginAddress, blockNumber, network })

      expect(result).to.be.null
      expect(createMemberStub.calledOnceWithExactly(memberAddress)).to.be.true
      expect(createMetricsStub.calledOnceWithExactly({ address: memberAddress, pluginAddress, network })).to.be.true
      expect(getBlockTimestampStub.calledOnceWithExactly(blockNumber, network)).to.be.true
      expect(loggerErrorStub.calledOnce).to.be.true

      // Check that the logger was called with the correct error message
      const loggerCall = loggerErrorStub.getCall(0)
      expect(loggerCall.args[0]).to.equal('Error updating member activity')
    })
  })

  describe('updateMetricsByAction', () => {
    it('should update metrics by valid action and return true', async () => {
      const metricAction = IMetricAction.increaseProposalCount
      const memberAddress = '0x123'
      const pluginAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet

      const mockMetrics = {
        id: 'metrics-id',
        increaseProposalCount: sandbox.stub().resolves({ id: 'updated-id' }),
      } as any

      const createMetricsStub = sandbox.stub(ProxyMember, 'createMetrics').resolves(mockMetrics)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      await ProxyMember.updateMetricsByAction(metricAction, { memberAddress, pluginAddress, network })

      expect(createMetricsStub.calledOnce).to.be.true
      expect(mockMetrics.increaseProposalCount.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Updated Member DAO metrics' as any)).to.be.true
    })

    it('should not update metrics and log error if action is invalid', async () => {
      const metricAction = 'invalidAction' as IMetricAction
      const memberAddress = '0x123'
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
      expect(loggerErrorStub.calledOnceWith('Unsupported metric action' as any)).to.be.true
    })

    it('should return early if createMetrics returns null', async () => {
      const metricAction = IMetricAction.increaseVoteCount
      const memberAddress = '0x123'
      const pluginAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet

      const createMetricsStub = sandbox.stub(ProxyMember, 'createMetrics').resolves(null)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      await ProxyMember.updateMetricsByAction(metricAction, {
        memberAddress,
        pluginAddress,
        network,
      })

      expect(createMetricsStub.calledOnce).to.be.true
      expect(loggerVerboseStub.notCalled).to.be.true
    })
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
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(null)
      const createMappingStub = sandbox.stub(Models.DaoMemberMapping, 'create').resolves({ id: 'mapping-id' })

      const result = await ProxyMember.addToDao(params)

      expect(result).to.equal(member)
      expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
      expect(createMemberStub.calledOnceWithExactly(params.memberAddress)).to.be.true
      expect(isMemberOfDaoStub.calledOnce).to.be.true
      expect(createMappingStub.calledOnce).to.be.true
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

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').returns(parsedMemberAddress)
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(existingDaoMember)
      const createMappingStub = sandbox.stub(Models.DaoMemberMapping, 'create')

      const result = await ProxyMember.addToDao(params)

      expect(result).to.equal(member)
      expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
      expect(createMemberStub.calledOnceWithExactly(params.memberAddress)).to.be.true
      expect(isMemberOfDaoStub.calledOnce).to.be.true
      expect(createMappingStub.notCalled).to.be.true
    })

    it('should not add a member if member address is invalid', async () => {
      const params = {
        memberAddress: '0x12',
        daoAddress: '0xdao',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').returns(null)
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember')

      const result = await ProxyMember.addToDao(params)

      expect(result).to.be.null
      expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
      expect(createMemberStub.notCalled).to.be.true
    })

    it('should return null and log error if createMember fails', async () => {
      const params = {
        memberAddress: '0xValidAddress',
        daoAddress: '0xdao',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      const parsedMemberAddress = '0xValidAddress'
      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').returns(parsedMemberAddress)
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(null)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

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

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').returns(parsedMemberAddress)
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

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').returns(parsedMemberAddress)
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(existingDaoMember)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.removeFromDao(params)

      expect(result).to.equal(member)
      expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
      expect(createMemberStub.calledOnceWithExactly(params.memberAddress)).to.be.true
      expect(isMemberOfDaoStub.calledOnce).to.be.true
      expect(existingDaoMember.removeSelf.calledOnce).to.be.true
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

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').returns(parsedMemberAddress)
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const isMemberOfDaoStub = sandbox.stub(ProxyMember, 'isMemberOfDao').resolves(null)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.removeFromDao(params)

      expect(result).to.equal(member)
      expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
      expect(createMemberStub.calledOnceWithExactly(params.memberAddress)).to.be.true
      expect(isMemberOfDaoStub.calledOnce).to.be.true
      expect(loggerVerboseStub.notCalled).to.be.true
    })

    it('should not remove DAO mapping and return null if member address is invalid', async () => {
      const params = {
        memberAddress: '0xInvalid',
        daoAddress: '0xdao',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').returns(null)
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember')

      const result = await ProxyMember.removeFromDao(params)

      expect(result).to.be.null
      expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
      expect(createMemberStub.notCalled).to.be.true
    })

    it('should return null and log error if transaction fails', async () => {
      const params = {
        memberAddress: '0xValidMember',
        daoAddress: '0xdao',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      const parsedMemberAddress = '0xValidMember'
      const member = { id: 'member-id', address: params.memberAddress }
      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').returns(parsedMemberAddress)
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn').rejects(new Error('Database error'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.removeFromDao(params)

      expect(result).to.be.null
      expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
      expect(createMemberStub.calledOnceWithExactly(params.memberAddress)).to.be.true
      expect(executeTxFnStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledOnceWith('Error in removeFromDao' as any)).to.be.true
    })
  })

  describe('bulkMemberCreation', () => {
    it('should create new members when they do not exist', async () => {
      const memberAddresses = ['0x123', '0x456', '0x789']
      const network = NetworksEnum.ethereumMainnet

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress')
      parseAddressStub.withArgs('0x123').returns('0x123')
      parseAddressStub.withArgs('0x456').returns('0x456')
      parseAddressStub.withArgs('0x789').returns('0x789')

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves([])
      const findStub = sandbox.stub(Models.Member, 'find').returns({ lean: leanStub } as any)
      const insertManyStub = sandbox.stub(Models.Member, 'insertMany').resolves([])
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth')

      await ProxyMember.bulkMemberCreation(memberAddresses as any, network)

      expect(parseAddressStub.callCount).to.equal(3)
      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(insertManyStub.calledOnce).to.be.true
    })

    it('should filter out existing members', async () => {
      const memberAddresses = ['0x123', '0x456']
      const network = NetworksEnum.ethereumMainnet
      const existingMembers = [{ address: '0x123' }]

      sandbox.stub(Web3Utils, 'parseAddress').returnsArg(0)

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves(existingMembers)
      const findStub = sandbox.stub(Models.Member, 'find').returns({ lean: leanStub } as any)
      const insertManyStub = sandbox.stub(Models.Member, 'insertMany').resolves([])
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth')

      await ProxyMember.bulkMemberCreation(memberAddresses as any, network)

      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(insertManyStub.calledOnce).to.be.true
    })

    it('should handle duplicate addresses correctly', async () => {
      const memberAddresses = ['0x123', '0x123', '0x456']
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(Web3Utils, 'parseAddress').returnsArg(0)

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves([])
      const findStub = sandbox.stub(Models.Member, 'find').returns({ lean: leanStub } as any)
      const insertManyStub = sandbox.stub(Models.Member, 'insertMany').resolves([])
      const getEnsStub = sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth')

      await ProxyMember.bulkMemberCreation(memberAddresses as any, network)

      expect(getEnsStub.callCount).to.equal(2) // Only unique addresses
      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(insertManyStub.calledOnce).to.be.true
    })

    it('should handle insertMany errors gracefully', async () => {
      const memberAddresses = ['0x123']
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(Web3Utils, 'parseAddress').returnsArg(0)

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves([])
      const findStub = sandbox.stub(Models.Member, 'find').returns({ lean: leanStub } as any)
      sandbox.stub(Models.Member, 'insertMany').rejects({ writeErrors: [{ code: 11000 }] })
      sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth')
      const loggerWarnStub = sandbox.stub(Logger, 'warn')

      await ProxyMember.bulkMemberCreation(memberAddresses as any, network)

      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledOnce).to.be.true
    })

    it('should skip ENS resolution for non-supported networks', async () => {
      const memberAddresses = ['0x123']
      const network = NetworksEnum.polygonMainnet

      sandbox.stub(Web3Utils, 'parseAddress').returnsArg(0)

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves([])
      const findStub = sandbox.stub(Models.Member, 'find').returns({ lean: leanStub } as any)
      sandbox.stub(Models.Member, 'insertMany').resolves([])
      const getEnsStub = sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver')

      await ProxyMember.bulkMemberCreation(memberAddresses as any, network)

      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(getEnsStub.notCalled).to.be.true
    })

    it('should filter out invalid addresses', async () => {
      const memberAddresses = ['0x123', null, '0x456']
      const network = NetworksEnum.ethereumMainnet

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress')
      parseAddressStub.withArgs('0x123').returns('0x123')
      parseAddressStub.withArgs(null as any).returns(null)
      parseAddressStub.withArgs('0x456').returns('0x456')

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves([])
      const findStub = sandbox.stub(Models.Member, 'find').returns({ lean: leanStub } as any)
      sandbox.stub(Models.Member, 'insertMany').resolves([])
      const getEnsStub = sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves('test.eth')

      await ProxyMember.bulkMemberCreation(memberAddresses as any, network)

      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(getEnsStub.callCount).to.equal(2) // Only valid addresses
    })
  })

  describe('bulkBalanceCreation', () => {
    it('should create new balances and update existing ones', async () => {
      const balanceParams = [
        { address: '0x123', balance: '100' },
        { address: '0x456', balance: '200' },
      ]
      const network = NetworksEnum.ethereumMainnet
      const tokenAddress = '0xtoken'
      const blockNumber = 12345

      const existingBalances = [{ id: 'balance1', address: '0x123', tokenAddress, network }]

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves(existingBalances)
      const findStub = sandbox.stub(Models.MemberBalance, 'find').returns({ lean: leanStub } as any)
      const bulkWriteStub = sandbox.stub(Models.MemberBalance, 'bulkWrite').resolves({} as any)
      const insertManyStub = sandbox.stub(Models.MemberBalance, 'insertMany').resolves([])
      sandbox.stub(Models.MemberBalance, 'getEntityId').returns('balance-id')

      await ProxyMember.bulkBalanceCreation(balanceParams as any, network, tokenAddress as any, blockNumber)

      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(bulkWriteStub.calledOnce).to.be.true
      expect(insertManyStub.calledOnce).to.be.true
    })

    it('should handle only new balances', async () => {
      const balanceParams = [{ address: '0x123', balance: '100' }]
      const network = NetworksEnum.ethereumMainnet
      const tokenAddress = '0xtoken'
      const blockNumber = 12345

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves([])
      const findStub = sandbox.stub(Models.MemberBalance, 'find').returns({ lean: leanStub } as any)
      const bulkWriteStub = sandbox.stub(Models.MemberBalance, 'bulkWrite')
      const insertManyStub = sandbox.stub(Models.MemberBalance, 'insertMany').resolves([])
      sandbox.stub(Models.MemberBalance, 'getEntityId').returns('balance-id')

      await ProxyMember.bulkBalanceCreation(balanceParams as any, network, tokenAddress as any, blockNumber)

      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(bulkWriteStub.notCalled).to.be.true
      expect(insertManyStub.calledOnce).to.be.true
    })

    it('should handle only existing balances', async () => {
      const balanceParams = [{ address: '0x123', balance: '100' }]
      const network = NetworksEnum.ethereumMainnet
      const tokenAddress = '0xtoken'
      const blockNumber = 12345

      const existingBalances = [{ id: 'balance1', address: '0x123', tokenAddress, network }]

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves(existingBalances)
      const findStub = sandbox.stub(Models.MemberBalance, 'find').returns({ lean: leanStub } as any)
      const bulkWriteStub = sandbox.stub(Models.MemberBalance, 'bulkWrite').resolves({} as any)
      const insertManyStub = sandbox.stub(Models.MemberBalance, 'insertMany')

      await ProxyMember.bulkBalanceCreation(balanceParams as any, network, tokenAddress as any, blockNumber)

      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(bulkWriteStub.calledOnce).to.be.true
      expect(insertManyStub.notCalled).to.be.true
    })

    it('should handle insertMany errors gracefully', async () => {
      const balanceParams = [{ address: '0x123', balance: '100' }]
      const network = NetworksEnum.ethereumMainnet
      const tokenAddress = '0xtoken'
      const blockNumber = 12345

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves([])
      const findStub = sandbox.stub(Models.MemberBalance, 'find').returns({ lean: leanStub } as any)
      sandbox.stub(Models.MemberBalance, 'insertMany').rejects({ writeErrors: [{ code: 11000 }] })
      const loggerWarnStub = sandbox.stub(Logger, 'warn')

      await ProxyMember.bulkBalanceCreation(balanceParams as any, network, tokenAddress as any, blockNumber)

      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledOnce).to.be.true
    })
  })

  describe('bulkDaoMembershipManagement', () => {
    it('should add and remove members based on balance status', async () => {
      const params = [
        { memberAddress: '0x123', hasBalance: true },
        { memberAddress: '0x456', hasBalance: false },
      ]
      const daoAddress = '0xdao'
      const pluginAddress = '0xplugin'
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.ethereumMainnet

      const existingMemberships = [{ memberAddress: '0x456' }]

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves(existingMemberships)
      const findStub = sandbox.stub(Models.DaoMemberMapping, 'find').returns({ lean: leanStub } as any)
      const insertManyStub = sandbox.stub(Models.DaoMemberMapping, 'insertMany').resolves([])
      const deleteManyStub = sandbox.stub(Models.DaoMemberMapping, 'deleteMany').resolves({} as any)

      const result = await ProxyMember.bulkDaoMembershipManagement(
        params as any,
        daoAddress as any,
        pluginAddress as any,
        tokenAddress as any,
        network,
      )

      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(insertManyStub.calledOnce).to.be.true
      expect(deleteManyStub.calledOnce).to.be.true
      expect(result).to.be.undefined // Function returns void
    })

    it('should handle only additions', async () => {
      const params = [{ memberAddress: '0x123', hasBalance: true }]
      const daoAddress = '0xdao'
      const pluginAddress = '0xplugin'
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.ethereumMainnet

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves([])
      const findStub = sandbox.stub(Models.DaoMemberMapping, 'find').returns({ lean: leanStub } as any)
      const insertManyStub = sandbox.stub(Models.DaoMemberMapping, 'insertMany').resolves([])
      const deleteManyStub = sandbox.stub(Models.DaoMemberMapping, 'deleteMany')

      const result = await ProxyMember.bulkDaoMembershipManagement(
        params as any,
        daoAddress as any,
        pluginAddress as any,
        tokenAddress as any,
        network,
      )

      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(insertManyStub.calledOnce).to.be.true
      expect(deleteManyStub.notCalled).to.be.true
      expect(result).to.be.undefined // Function returns void
    })

    it('should handle only removals', async () => {
      const params = [{ memberAddress: '0x123', hasBalance: false }]
      const daoAddress = '0xdao'
      const pluginAddress = '0xplugin'
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.ethereumMainnet

      const existingMemberships = [{ memberAddress: '0x123' }]

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves(existingMemberships)
      const findStub = sandbox.stub(Models.DaoMemberMapping, 'find').returns({ lean: leanStub } as any)
      const insertManyStub = sandbox.stub(Models.DaoMemberMapping, 'insertMany')
      const deleteManyStub = sandbox.stub(Models.DaoMemberMapping, 'deleteMany').resolves({} as any)

      const result = await ProxyMember.bulkDaoMembershipManagement(
        params as any,
        daoAddress as any,
        pluginAddress as any,
        tokenAddress as any,
        network,
      )

      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(insertManyStub.notCalled).to.be.true
      expect(deleteManyStub.calledOnce).to.be.true
      expect(result).to.be.undefined // Function returns void
    })

    it('should handle insertMany errors gracefully', async () => {
      const params = [{ memberAddress: '0x123', hasBalance: true }]
      const daoAddress = '0xdao'
      const pluginAddress = '0xplugin'
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.ethereumMainnet

      // Mock the chained query properly
      const leanStub = sandbox.stub().resolves([])
      const findStub = sandbox.stub(Models.DaoMemberMapping, 'find').returns({ lean: leanStub } as any)
      sandbox.stub(Models.DaoMemberMapping, 'insertMany').rejects({ writeErrors: [{ code: 11000 }] })
      const loggerWarnStub = sandbox.stub(Logger, 'warn')

      const result = await ProxyMember.bulkDaoMembershipManagement(
        params as any,
        daoAddress as any,
        pluginAddress as any,
        tokenAddress as any,
        network,
      )

      expect(findStub.calledOnce).to.be.true
      expect(leanStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(result).to.be.undefined // Function returns void
    })

    it('should handle errors and log them', async () => {
      const params = [{ memberAddress: '0x123', hasBalance: true }]
      const daoAddress = '0xdao'
      const pluginAddress = '0xplugin'
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.ethereumMainnet

      sandbox.stub(Models.DaoMemberMapping, 'find').rejects(new Error('Database error'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.bulkDaoMembershipManagement(
        params as any,
        daoAddress as any,
        pluginAddress as any,
        tokenAddress as any,
        network,
      )

      expect(loggerErrorStub.calledOnce).to.be.true
      expect(result).to.be.undefined // Function returns void
    })
  })

  describe('optimizedDaoMembershipManagement', () => {
    it('should call all three bulk operations successfully', async () => {
      const params = [{ address: '0x123', value: '100' }]
      const daoAddress = '0xdao'
      const pluginAddress = '0xplugin'
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const blockNumber = 12345

      const bulkMemberCreationStub = sandbox.stub(ProxyMember, 'bulkMemberCreation').resolves()
      const bulkBalanceCreationStub = sandbox.stub(ProxyMember, 'bulkBalanceCreation').resolves()
      const bulkDaoMembershipManagementStub = sandbox.stub(ProxyMember, 'bulkDaoMembershipManagement').resolves()

      await ProxyMember.optimizedDaoMembershipManagement(
        params as any,
        daoAddress as any,
        pluginAddress as any,
        tokenAddress as any,
        network,
        blockNumber,
      )

      expect(bulkMemberCreationStub.calledOnce).to.be.true
      expect(bulkBalanceCreationStub.calledOnce).to.be.true
      expect(bulkDaoMembershipManagementStub.calledOnce).to.be.true
    })

    it('should handle errors and rethrow them', async () => {
      const params = [{ address: '0x123', value: '100' }]
      const daoAddress = '0xdao'
      const pluginAddress = '0xplugin'
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const blockNumber = 12345

      const bulkMemberCreationStub = sandbox
        .stub(ProxyMember, 'bulkMemberCreation')
        .rejects(new Error('Member creation failed'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      try {
        await ProxyMember.optimizedDaoMembershipManagement(
          params as any,
          daoAddress as any,
          pluginAddress as any,
          tokenAddress as any,
          network,
          blockNumber,
        )
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Member creation failed')
        expect(bulkMemberCreationStub.calledOnce).to.be.true
        expect(loggerErrorStub.calledOnce).to.be.true
      }
    })

    it('should handle balance creation errors', async () => {
      const params = [{ address: '0x123', value: '100' }]
      const daoAddress = '0xdao'
      const pluginAddress = '0xplugin'
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const blockNumber = 12345

      const bulkMemberCreationStub = sandbox.stub(ProxyMember, 'bulkMemberCreation').resolves()
      const bulkBalanceCreationStub = sandbox
        .stub(ProxyMember, 'bulkBalanceCreation')
        .rejects(new Error('Balance creation failed'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      try {
        await ProxyMember.optimizedDaoMembershipManagement(
          params as any,
          daoAddress as any,
          pluginAddress as any,
          tokenAddress as any,
          network,
          blockNumber,
        )
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Balance creation failed')
        expect(bulkMemberCreationStub.calledOnce).to.be.true
        expect(bulkBalanceCreationStub.calledOnce).to.be.true
        expect(loggerErrorStub.calledOnce).to.be.true
      }
    })

    it('should handle membership management errors', async () => {
      const params = [{ address: '0x123', value: '100' }]
      const daoAddress = '0xdao'
      const pluginAddress = '0xplugin'
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const blockNumber = 12345

      const bulkMemberCreationStub = sandbox.stub(ProxyMember, 'bulkMemberCreation').resolves()
      const bulkBalanceCreationStub = sandbox.stub(ProxyMember, 'bulkBalanceCreation').resolves()
      const bulkDaoMembershipManagementStub = sandbox
        .stub(ProxyMember, 'bulkDaoMembershipManagement')
        .rejects(new Error('Membership management failed'))
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      try {
        await ProxyMember.optimizedDaoMembershipManagement(
          params as any,
          daoAddress as any,
          pluginAddress as any,
          tokenAddress as any,
          network,
          blockNumber,
        )
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Membership management failed')
        expect(bulkMemberCreationStub.calledOnce).to.be.true
        expect(bulkBalanceCreationStub.calledOnce).to.be.true
        expect(bulkDaoMembershipManagementStub.calledOnce).to.be.true
        expect(loggerErrorStub.calledOnce).to.be.true
      }
    })

    it('should pass correct parameters to each bulk operation', async () => {
      const params = [
        { address: '0x123', value: '100' },
        { address: '0x456', value: '0' },
      ]
      const daoAddress = '0xdao'
      const pluginAddress = '0xplugin'
      const tokenAddress = '0xtoken'
      const network = NetworksEnum.ethereumMainnet
      const blockNumber = 12345

      const bulkMemberCreationStub = sandbox.stub(ProxyMember, 'bulkMemberCreation').resolves()
      const bulkBalanceCreationStub = sandbox.stub(ProxyMember, 'bulkBalanceCreation').resolves()
      const bulkDaoMembershipManagementStub = sandbox.stub(ProxyMember, 'bulkDaoMembershipManagement').resolves()

      await ProxyMember.optimizedDaoMembershipManagement(
        params as any,
        daoAddress as any,
        pluginAddress as any,
        tokenAddress as any,
        network,
        blockNumber,
      )

      expect(bulkMemberCreationStub.calledWith(['0x123', '0x456'], network)).to.be.true
      expect(
        bulkBalanceCreationStub.calledWith(
          [
            { address: '0x123', balance: '100' },
            { address: '0x456', balance: '0' },
          ],
          network,
          tokenAddress,
          blockNumber,
        ),
      ).to.be.true
      expect(
        bulkDaoMembershipManagementStub.calledWith(
          [
            { memberAddress: '0x123', hasBalance: true },
            { memberAddress: '0x456', hasBalance: false },
          ],
          daoAddress,
          pluginAddress,
          tokenAddress,
          network,
        ),
      ).to.be.true
    })
  })
})
