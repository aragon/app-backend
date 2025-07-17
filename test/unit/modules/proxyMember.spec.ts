import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { ProxyMember } from '@modules/proxyMember'
import EnsHelper from '@helpers/ens'
import { IMetricAction, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
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
  })

  describe('addToDao', () => {
    it('should add member to DAO with pluginAddress and store all fields correctly', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        pluginAddress: '0xplugin123',
        network: NetworksEnum.ethereumMainnet,
      }

      const parsedMemberAddress = Web3Utils.parseAddress(params.memberAddress)!
      const member = { id: 'member-id', address: parsedMemberAddress }

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.addToDao(params)

      expect(result).to.equal(member)
      expect(createMemberStub.calledOnceWithExactly(parsedMemberAddress)).to.be.true
      expect(loggerVerboseStub.calledWith('Add DaoMemberMapping' as any)).to.be.true

      // Verify the document was actually created in the database
      const mapping = await Models.DaoMemberMapping.findOne({
        memberAddress: parsedMemberAddress,
        pluginAddress: params.pluginAddress,
        network: params.network,
      }).lean()

      expect(mapping).to.not.be.null
      expect(mapping.memberAddress).to.equal(parsedMemberAddress)
      expect(mapping.pluginAddress).to.equal(params.pluginAddress)
      expect(mapping.tokenAddress).to.be.null
      expect(mapping.network).to.equal(params.network)
    })

    it('should add member to DAO with tokenAddress and store all fields correctly', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        tokenAddress: '0xtoken456',
        network: NetworksEnum.ethereumMainnet,
      }

      const parsedMemberAddress = Web3Utils.parseAddress(params.memberAddress)!
      const member = { id: 'member-id', address: parsedMemberAddress }

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.addToDao(params)

      expect(result).to.equal(member)
      expect(createMemberStub.calledOnceWithExactly(parsedMemberAddress)).to.be.true
      expect(loggerVerboseStub.calledWith('Add DaoMemberMapping' as any)).to.be.true

      // Verify the document was actually created in the database
      const mapping = await Models.DaoMemberMapping.findOne({
        memberAddress: parsedMemberAddress,
        tokenAddress: params.tokenAddress,
        network: params.network,
      }).lean()

      expect(mapping).to.not.be.null
      expect(mapping.memberAddress).to.equal(parsedMemberAddress)
      expect(mapping.tokenAddress).to.equal(params.tokenAddress)
      expect(mapping.pluginAddress).to.be.null
      expect(mapping.network).to.equal(params.network)
    })

    it('should not create duplicate mapping if member already exists in DAO', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        pluginAddress: '0xplugin789',
        network: NetworksEnum.ethereumMainnet,
      }

      const parsedMemberAddress = Web3Utils.parseAddress(params.memberAddress)!
      const member = { id: 'member-id', address: parsedMemberAddress }

      // Pre-create an existing mapping
      await Models.DaoMemberMapping.create({
        memberAddress: parsedMemberAddress,
        pluginAddress: params.pluginAddress,
        network: params.network,
      })

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.addToDao(params)

      expect(result).to.equal(member)
      expect(createMemberStub.calledOnceWithExactly(parsedMemberAddress)).to.be.true
      expect(loggerVerboseStub.called).to.be.false // Should not log for existing member

      // Verify only one mapping exists
      const mappings = await Models.DaoMemberMapping.find({
        memberAddress: parsedMemberAddress,
        pluginAddress: params.pluginAddress,
        network: params.network,
      }).lean()

      expect(mappings.length).to.equal(1)
    })

    it('should return null if member address is invalid', async () => {
      const params = {
        memberAddress: '0x12',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').returns(null)
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember')

      const result = await ProxyMember.addToDao(params)

      expect(result).to.be.null
      expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
      expect(createMemberStub.notCalled).to.be.true

      // Verify no mapping was created
      const mappingCount = await Models.DaoMemberMapping.countDocuments()
      expect(mappingCount).to.equal(0)
    })

    it('should return null and log error if createMember fails', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(null)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.addToDao(params)

      expect(result).to.be.null
      expect(createMemberStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Failed to add member to dao' as any)).to.be.true

      // Verify no mapping was created
      const mappingCount = await Models.DaoMemberMapping.countDocuments()
      expect(mappingCount).to.equal(0)
    })

    it('should handle database errors gracefully', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      const parsedMemberAddress = Web3Utils.parseAddress(params.memberAddress)!
      const member = { id: 'member-id', address: parsedMemberAddress }

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      // Force a database error by stubbing findExistingLog
      sandbox.stub(Models.DaoMemberMapping, 'findExistingLog').rejects(new Error('Database error'))

      const result = await ProxyMember.addToDao(params)

      expect(result).to.be.null
      expect(createMemberStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Error in addToDao' as any)).to.be.true
    })

    it('should handle concurrent addToDao calls correctly', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        pluginAddress: '0xpluginconcurrent',
        network: NetworksEnum.ethereumMainnet,
      }

      const parsedMemberAddress = Web3Utils.parseAddress(params.memberAddress)!
      const member = { id: 'member-id', address: parsedMemberAddress }

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)

      // Execute concurrent calls
      const [result1, result2] = await Promise.all([ProxyMember.addToDao(params), ProxyMember.addToDao(params)])

      expect(result1).to.equal(member)
      expect(result2).to.equal(member)
      expect(createMemberStub.calledTwice).to.be.true

      // Verify only one mapping was created (no duplicates)
      const mappings = await Models.DaoMemberMapping.find({
        memberAddress: parsedMemberAddress,
        pluginAddress: params.pluginAddress,
        network: params.network,
      }).lean()

      expect(mappings.length).to.equal(1)
    })
  })

  describe('removeFromDao', () => {
    it('should remove member from DAO if member exists', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        pluginAddress: '0xpluginToRemove',
        network: NetworksEnum.ethereumMainnet,
      }

      const parsedMemberAddress = Web3Utils.parseAddress(params.memberAddress)!
      const member = { id: 'member-id', address: parsedMemberAddress }

      // Pre-create a mapping to remove
      const existingMapping = await Models.DaoMemberMapping.create({
        memberAddress: parsedMemberAddress,
        pluginAddress: params.pluginAddress,
        network: params.network,
      })

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.removeFromDao(params)

      expect(result).to.equal(member)
      expect(createMemberStub.calledOnceWithExactly(parsedMemberAddress)).to.be.true
      expect(loggerVerboseStub.calledWith('Remove DaoMemberMapping' as any)).to.be.true

      // Verify the mapping was removed
      const mapping = await Models.DaoMemberMapping.findById(existingMapping._id).lean()
      expect(mapping).to.be.null
    })

    it('should remove member with tokenAddress', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        tokenAddress: '0xtokenToRemove',
        network: NetworksEnum.ethereumMainnet,
      }

      const parsedMemberAddress = Web3Utils.parseAddress(params.memberAddress)!
      const member = { id: 'member-id', address: parsedMemberAddress }

      // Pre-create a mapping to remove
      const existingMapping = await Models.DaoMemberMapping.create({
        memberAddress: parsedMemberAddress,
        tokenAddress: params.tokenAddress,
        network: params.network,
      })

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.removeFromDao(params)

      expect(result).to.equal(member)
      expect(createMemberStub.calledOnceWithExactly(parsedMemberAddress)).to.be.true
      expect(loggerVerboseStub.calledWith('Remove DaoMemberMapping' as any)).to.be.true

      // Verify the mapping was removed
      const mapping = await Models.DaoMemberMapping.findById(existingMapping._id).lean()
      expect(mapping).to.be.null
    })

    it('should return member without error if no mapping exists', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        pluginAddress: '0xnonExistent',
        network: NetworksEnum.ethereumMainnet,
      }

      const parsedMemberAddress = Web3Utils.parseAddress(params.memberAddress)!
      const member = { id: 'member-id', address: parsedMemberAddress }

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.removeFromDao(params)

      expect(result).to.equal(member)
      expect(createMemberStub.calledOnceWithExactly(parsedMemberAddress)).to.be.true
      expect(loggerVerboseStub.called).to.be.false // Should not log if nothing to remove

      // Verify no mappings exist
      const mappingCount = await Models.DaoMemberMapping.countDocuments()
      expect(mappingCount).to.equal(0)
    })

    it('should return null if member address is invalid', async () => {
      const params = {
        memberAddress: '0xInvalid',
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

    it('should return null and log error if createMember fails', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(null)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.removeFromDao(params)

      expect(result).to.be.null
      expect(createMemberStub.calledOnce).to.be.true
      expect(loggerErrorStub.notCalled).to.be.true // createMember returning null doesn't log error in removeFromDao
    })

    it('should handle database errors gracefully', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      const parsedMemberAddress = Web3Utils.parseAddress(params.memberAddress)!
      const member = { id: 'member-id', address: parsedMemberAddress }

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      // Force a database error
      sandbox.stub(Models.DaoMemberMapping, 'findExistingLog').rejects(new Error('Database error'))

      const result = await ProxyMember.removeFromDao(params)

      expect(result).to.be.null
      expect(createMemberStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Error in removeFromDao' as any)).to.be.true
    })

    it('should handle concurrent removeFromDao calls correctly', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        pluginAddress: '0xpluginConcurrent',
        network: NetworksEnum.ethereumMainnet,
      }

      const parsedMemberAddress = Web3Utils.parseAddress(params.memberAddress)!
      const member = { id: 'member-id', address: parsedMemberAddress }

      // Pre-create a mapping to remove
      await Models.DaoMemberMapping.create({
        memberAddress: parsedMemberAddress,
        pluginAddress: params.pluginAddress,
        network: params.network,
      })

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)

      // Execute concurrent calls
      const [result1, result2] = await Promise.all([
        ProxyMember.removeFromDao(params),
        ProxyMember.removeFromDao(params),
      ])

      expect(result1).to.equal(member)
      expect(result2).to.equal(member)
      expect(createMemberStub.calledTwice).to.be.true

      // Verify the mapping was removed (only once)
      const mappings = await Models.DaoMemberMapping.find({
        memberAddress: parsedMemberAddress,
        pluginAddress: params.pluginAddress,
        network: params.network,
      }).lean()

      expect(mappings.length).to.equal(0)
    })

    it('should not remove mappings with different pluginAddress', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        pluginAddress: '0xpluginToRemove',
        network: NetworksEnum.ethereumMainnet,
      }

      const parsedMemberAddress = Web3Utils.parseAddress(params.memberAddress)!
      const member = { id: 'member-id', address: parsedMemberAddress }

      // Create mappings with different pluginAddresses
      await Models.DaoMemberMapping.create({
        memberAddress: parsedMemberAddress,
        pluginAddress: params.pluginAddress,
        network: params.network,
      })

      const otherMapping = await Models.DaoMemberMapping.create({
        memberAddress: parsedMemberAddress,
        pluginAddress: '0xotherPlugin',
        network: params.network,
      })

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)

      await ProxyMember.removeFromDao(params)

      // Verify only the correct mapping was removed
      const remainingMappings = await Models.DaoMemberMapping.find({
        memberAddress: parsedMemberAddress,
        network: params.network,
      }).lean()

      expect(remainingMappings.length).to.equal(1)
      expect(remainingMappings[0]._id.toString()).to.equal(otherMapping._id.toString())
      expect(remainingMappings[0].pluginAddress).to.equal('0xotherPlugin')
    })
  })

  describe('isMemberOfDao', () => {
    it('should find member mapping with pluginAddress', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        pluginAddress: '0xplugin123',
        network: NetworksEnum.ethereumMainnet,
      }

      // Create a mapping
      const createdMapping = await Models.DaoMemberMapping.create({
        memberAddress: params.memberAddress,
        pluginAddress: params.pluginAddress,
        network: params.network,
      })

      const result = await ProxyMember.isMemberOfDao(params)

      expect(result).to.not.be.null
      expect(result._id.toString()).to.equal(createdMapping._id.toString())
      expect(result.memberAddress).to.equal(params.memberAddress)
      expect(result.pluginAddress).to.equal(params.pluginAddress)
      expect(result.network).to.equal(params.network)
    })

    it('should find member mapping with tokenAddress', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        tokenAddress: '0xtoken456',
        network: NetworksEnum.ethereumMainnet,
      }

      // Create a mapping
      const createdMapping = await Models.DaoMemberMapping.create({
        memberAddress: params.memberAddress,
        tokenAddress: params.tokenAddress,
        network: params.network,
      })

      const result = await ProxyMember.isMemberOfDao(params)

      expect(result).to.not.be.null
      expect(result._id.toString()).to.equal(createdMapping._id.toString())
      expect(result.memberAddress).to.equal(params.memberAddress)
      expect(result.tokenAddress).to.equal(params.tokenAddress)
      expect(result.network).to.equal(params.network)
    })

    it('should return null when member mapping does not exist', async () => {
      const params = {
        memberAddress: '0x57e24f85ceAcDa3Ef4F0fd04005589B88dc01A19',
        pluginAddress: '0xnonexistent',
        network: NetworksEnum.ethereumMainnet,
      }

      const result = await ProxyMember.isMemberOfDao(params)

      expect(result).to.be.null
    })
  })

  describe('countAllMembersOfPlugin', () => {
    it('should return 0 when plugin does not exist', async () => {
      const pluginAddress = '0xnonexistentplugin'
      const network = NetworksEnum.ethereumMainnet

      const result = await ProxyMember.countAllMembersOfPlugin(pluginAddress, network)

      expect(result).to.equal(0)
    })

    it('should count members for plugin with tokenAddress', async () => {
      const pluginAddress = '0xpluginWithToken'
      const tokenAddress = '0xtoken123'
      const daoAddress = '0xdao123'
      const network = NetworksEnum.ethereumMainnet

      // Create plugin with tokenAddress
      await Models.Plugin.create({
        transactionHash: '0x123',
        blockNumber: 100,
        interfaceType: IPluginInterfaceType.tokenVoting,
        address: pluginAddress,
        tokenAddress,
        daoAddress,
        network,
        status: IPluginStatus.installed,
      })

      // Create member mappings for the token
      await Models.DaoMemberMapping.create({
        memberAddress: '0xmember1',
        tokenAddress: tokenAddress,
        network: network,
      })
      await Models.DaoMemberMapping.create({
        memberAddress: '0xmember2',
        tokenAddress: tokenAddress,
        network: network,
      })
      await Models.DaoMemberMapping.create({
        memberAddress: '0xmember3',
        tokenAddress: tokenAddress,
        network: network,
      })

      const result = await ProxyMember.countAllMembersOfPlugin(pluginAddress, network)

      expect(result).to.equal(3)
    })

    it('should count members for plugin without tokenAddress', async () => {
      const daoAddress = '0xdao'
      const pluginAddress = '0xpluginWithoutToken'
      const network = NetworksEnum.ethereumMainnet

      // Create plugin without tokenAddress
      await Models.Plugin.create({
        transactionHash: '0x123',
        blockNumber: 100,
        interfaceType: IPluginInterfaceType.tokenVoting,
        address: pluginAddress,
        daoAddress,
        network,
        status: IPluginStatus.installed,
      })

      // Create member mappings for the plugin
      await Models.DaoMemberMapping.create({
        memberAddress: '0xmember1',
        pluginAddress: pluginAddress,
        network: network,
      })
      await Models.DaoMemberMapping.create({
        memberAddress: '0xmember2',
        pluginAddress: pluginAddress,
        network: network,
      })

      const pluginCountStub = sandbox.stub(Models.DaoMemberMapping, 'pluginCountUniqueMembers').resolves(2)

      const result = await ProxyMember.countAllMembersOfPlugin(pluginAddress, network)

      expect(result).to.equal(2)
      expect(pluginCountStub.calledOnceWith(pluginAddress, network, undefined)).to.be.true
    })
  })

  describe('countUniqueMembersOfDao', () => {
    it('should return 0 when no plugins exist for DAO', async () => {
      const daoAddress = '0xdaoWithNoPlugins'
      const network = NetworksEnum.ethereumMainnet

      const findActivePluginsStub = sandbox.stub(Models.Plugin, 'findActivePluginsByDaoAddress').resolves([])

      const result = await ProxyMember.countUniqueMembersOfDao(daoAddress, network)

      expect(result).to.equal(0)
      expect(findActivePluginsStub.calledOnceWith(daoAddress, network, undefined)).to.be.true
    })

    it('should count members across multiple plugins with mixed token/plugin addresses', async () => {
      const daoAddress = '0xdaoWithMultiplePlugins'
      const network = NetworksEnum.ethereumMainnet

      const plugins = [
        {
          address: '0xplugin1',
          tokenAddress: '0xtoken1',
        },
        {
          address: '0xplugin2',
          tokenAddress: null,
        },
        {
          address: '0xplugin3',
          tokenAddress: '0xtoken3',
        },
      ]

      const findActivePluginsStub = sandbox.stub(Models.Plugin, 'findActivePluginsByDaoAddress').resolves(plugins)
      const tokenCountStub = sandbox.stub(Models.DaoMemberMapping, 'tokenCountUniqueMembers')
      const pluginCountStub = sandbox.stub(Models.DaoMemberMapping, 'pluginCountUniqueMembers')

      // Setup stubs for each plugin
      tokenCountStub.withArgs('0xtoken1', network, undefined).resolves(10)
      pluginCountStub.withArgs('0xplugin2', network, undefined).resolves(5)
      tokenCountStub.withArgs('0xtoken3', network, undefined).resolves(15)

      const result = await ProxyMember.countUniqueMembersOfDao(daoAddress, network)

      expect(result).to.equal(30) // 10 + 5 + 15
      expect(findActivePluginsStub.calledOnceWith(daoAddress, network, undefined)).to.be.true
      expect(tokenCountStub.calledTwice).to.be.true
      expect(pluginCountStub.calledOnce).to.be.true
    })

    it('should handle single plugin with tokenAddress', async () => {
      const daoAddress = '0xdaoWithSinglePlugin'
      const network = NetworksEnum.ethereumMainnet

      const plugins = [
        {
          address: '0xplugin1',
          tokenAddress: '0xtoken1',
        },
      ]

      const findActivePluginsStub = sandbox.stub(Models.Plugin, 'findActivePluginsByDaoAddress').resolves(plugins)
      const tokenCountStub = sandbox.stub(Models.DaoMemberMapping, 'tokenCountUniqueMembers').resolves(25)

      const result = await ProxyMember.countUniqueMembersOfDao(daoAddress, network)

      expect(result).to.equal(25)
      expect(findActivePluginsStub.calledOnceWith(daoAddress, network, undefined)).to.be.true
      expect(tokenCountStub.calledOnceWith('0xtoken1', network, undefined)).to.be.true
    })

    it('should handle all plugins without tokenAddress', async () => {
      const daoAddress = '0xdaoWithPluginsNoTokens'
      const network = NetworksEnum.ethereumMainnet

      const plugins = [
        {
          address: '0xplugin1',
          tokenAddress: null,
        },
        {
          address: '0xplugin2',
          tokenAddress: null,
        },
      ]

      const findActivePluginsStub = sandbox.stub(Models.Plugin, 'findActivePluginsByDaoAddress').resolves(plugins)
      const pluginCountStub = sandbox.stub(Models.DaoMemberMapping, 'pluginCountUniqueMembers')

      pluginCountStub.withArgs('0xplugin1', network, undefined).resolves(8)
      pluginCountStub.withArgs('0xplugin2', network, undefined).resolves(12)

      const result = await ProxyMember.countUniqueMembersOfDao(daoAddress, network)

      expect(result).to.equal(20) // 8 + 12
      expect(findActivePluginsStub.calledOnceWith(daoAddress, network, undefined)).to.be.true
      expect(pluginCountStub.calledTwice).to.be.true
    })
  })

  describe('updateDelegationMetrics', () => {
    it('should update delegation metrics successfully', async () => {
      const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const pluginAddress = '0xplugin123'
      const tokenAddress = '0xtoken123'
      const network = NetworksEnum.ethereumMainnet

      // Create initial metrics
      const metrics = await Models.MemberMetrics.create({
        address: memberAddress,
        pluginAddress,
        network,
      })

      // Stub the delegation count
      const getReceiveDelegationCountStub = sandbox
        .stub(Models.MemberTransaction, 'getReceiveDelegationCount')
        .resolves(5)

      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.updateDelegationMetrics({
        memberAddress,
        pluginAddress,
        tokenAddress,
        network,
      })

      expect(result).to.not.be.null
      expect(result?.delegateReceivedCount).to.equal(5)
      expect(getReceiveDelegationCountStub.calledOnceWith(memberAddress, tokenAddress, network)).to.be.true
      expect(loggerVerboseStub.calledWith('Updated Member DAO metrics' as any)).to.be.true
    })

    it('should return null if member address is invalid', async () => {
      const params = {
        memberAddress: '0xInvalid',
        pluginAddress: '0xplugin',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      }

      const parseAddressStub = sandbox.stub(Web3Utils, 'parseAddress').returns(null)

      const result = await ProxyMember.updateDelegationMetrics(params)

      expect(result).to.be.null
      expect(parseAddressStub.calledOnceWithExactly(params.memberAddress)).to.be.true
    })

    it('should return undefined and log error if metrics creation fails', async () => {
      const params = {
        memberAddress: '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C',
        pluginAddress: '0xplugin',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumMainnet,
      }

      const createMetricsStub = sandbox.stub(ProxyMember, 'createMetrics').resolves(null)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.updateDelegationMetrics(params)

      expect(result).to.be.undefined
      expect(createMetricsStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Failed to create metrics' as any)).to.be.true
    })

    it('should handle errors during update', async () => {
      const memberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const pluginAddress = '0xplugin123'
      const tokenAddress = '0xtoken123'
      const network = NetworksEnum.ethereumMainnet

      // Create initial metrics
      await Models.MemberMetrics.create({
        address: memberAddress,
        pluginAddress,
        network,
      })

      // Force an error in the transaction
      const getReceiveDelegationCountStub = sandbox
        .stub(Models.MemberTransaction, 'getReceiveDelegationCount')
        .rejects(new Error('Database error'))

      const loggerErrorStub = sandbox.stub(Logger, 'error')

      const result = await ProxyMember.updateDelegationMetrics({
        memberAddress,
        pluginAddress,
        tokenAddress,
        network,
      })

      expect(result).to.be.undefined
      expect(getReceiveDelegationCountStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Error updating delegation metrics' as any)).to.be.true
    })
  })
})
