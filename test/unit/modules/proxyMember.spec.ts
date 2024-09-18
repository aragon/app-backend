import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { ProxyMember } from '@modules/proxyMember'
import EnsHelper from '@helpers/ens'
import DbOperations from '@models/utils/dbOperations'
import { IMetricAction, NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'
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
      const findExistingLogStub = sandbox.stub(Models.Member, 'findExistingLog').returns(null)
      const getEnsWithUniversalResolverStub = sandbox
        .stub(EnsHelper, 'getEnsWithUniversalResolver')
        .returns('louis.eth' as any)
      sandbox.stub(Logger, 'verbose')
      const createdMember = await ProxyMember.createMember(parsedMemberAddress)

      expect(createdMember).to.be.an('object')
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(getEnsWithUniversalResolverStub.calledOnce).to.be.true

      expect(createdMember.address).to.equal(parsedMemberAddress)
      expect(createdMember.ens).to.equal('louis.eth')
    })

    it('should not create a new member if it already exists', async () => {
      const parsedMemberAddress = '0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'
      const findExistingLogStub = sandbox.stub(Models.Member, 'findExistingLog').returns({
        address: parsedMemberAddress,
        ens: 'louis.eth',
      } as any)

      const dbOperationsCreateDocumentStub = sandbox.spy(DbOperations, 'createDocument')

      const existingMember = await ProxyMember.createMember(parsedMemberAddress)

      expect(existingMember).to.be.an('object')
      expect(dbOperationsCreateDocumentStub.calledOnce).to.be.false
      expect(findExistingLogStub.calledOnce).to.be.true
    })
  })

  describe('createMetrics', () => {
    it('should return existing metrics if found', async () => {
      const address = '0x123'
      const pluginAddress = '0x456'
      const network = NetworksEnum.ethereumMainnet

      const existingMetrics = { id: 'metrics-id', address, pluginAddress, network }
      const findOneStub = sandbox.stub(Models.MemberMetrics, 'findOne').resolves(existingMetrics)

      const result = await ProxyMember.createMetrics({ address, pluginAddress, network })

      expect(result).to.equal(existingMetrics)
      expect(findOneStub.calledWith({ address, pluginAddress, network })).to.be.true
    })

    it('should create new metrics if not found', async () => {
      const address = '0x123'
      const pluginAddress = '0x456'
      const network = NetworksEnum.ethereumMainnet
      sandbox.stub(Logger, 'verbose')

      const findOneStub = sandbox.stub(Models.MemberMetrics, 'findOne').resolves(null)
      const createDocumentspy = sandbox.spy(DbOperations, 'createDocument')

      const result = await ProxyMember.createMetrics({ address, pluginAddress, network })
      expect(result.address).to.equal(address)

      expect(findOneStub.calledWith({ address, pluginAddress, network })).to.be.true
      expect(createDocumentspy.calledOnce).to.be.true
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

      sandbox.stub(Logger, 'verbose')

      const findByAddressAndTokenStub = sandbox.stub(Models.MemberBalance, 'findByAddressAndToken').resolves(null)
      const data = { address, tokenAddress, network }
      const createDocumentStub = sandbox.spy(DbOperations, 'createDocument')

      const result = await ProxyMember.getBalances({ address, tokenAddress, network })

      expect(result.address).to.equal(data.address)
      expect(findByAddressAndTokenStub.calledWith({ address, tokenAddress, network })).to.be.true
      expect(createDocumentStub.calledOnce).to.be.true
    })
  })

  describe('updateActivity', () => {
    it('should update activity and set firstActivity if not set', async () => {
      const memberAddress = '0x123'
      const pluginAddress = '0xabc'
      const blockNumber = 100
      const network = NetworksEnum.ethereumMainnet

      const member = { id: 'member-id', firstActivity: null }
      const memberMetrics = { id: 'metrics-id' }
      const blockTimestamp = Math.floor(Date.now() / 1000)

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const createMetricsStub = sandbox.stub(ProxyMember, 'createMetrics').resolves(memberMetrics)
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(blockTimestamp as any)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves(memberMetrics)

      const result = await ProxyMember.updateActivity({ memberAddress, pluginAddress, blockNumber, network })

      expect(result).to.equal(memberMetrics)
      expect(createMemberStub.calledWith(memberAddress)).to.be.true
      expect(createMetricsStub.calledWith({ address: memberAddress, pluginAddress, network })).to.be.true
      expect(getBlockTimestampStub.calledWith(blockNumber, network)).to.be.true
      expect(
        updateDocumentStub.calledWith(
          memberMetrics,
          { lastActivity: blockTimestamp, firstActivity: blockTimestamp },
          { logId: member.id },
          'Update Member activity',
        ),
      ).to.be.true
    })

    it('should update activity and not set firstActivity if already set', async () => {
      const memberAddress = '0x123'
      const pluginAddress = '0xabc'
      const blockNumber = 100
      const network = NetworksEnum.ethereumMainnet

      const member = { id: 'member-id', firstActivity: new Date('2023-01-01') }
      const memberMetrics = { id: 'metrics-id' }
      const blockTimestamp = Math.floor(Date.now() / 1000)

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const createMetricsStub = sandbox.stub(ProxyMember, 'createMetrics').resolves(memberMetrics)
      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(blockTimestamp)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves(memberMetrics)

      const result = await ProxyMember.updateActivity({ memberAddress, pluginAddress, blockNumber, network })

      expect(result).to.equal(memberMetrics)
      expect(createMemberStub.calledWith(memberAddress)).to.be.true
      expect(createMetricsStub.calledWith({ address: memberAddress, pluginAddress, network })).to.be.true
      expect(getBlockTimestampStub.calledWith(blockNumber, network)).to.be.true
      expect(updateDocumentStub.calledOnce).to.be.true
    })
  })

  describe('updateMetricsByAction', () => {
    it('should update metrics by action', async () => {
      const metricAction = IMetricAction.increaseProposalCount
      const memberAddress = '0x123'
      const pluginAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet

      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.updateMetricsByAction(metricAction, { memberAddress, pluginAddress, network })

      expect(result.proposalCount).to.equal(1)
      expect(loggerVerboseStub.calledWith('Updated Member DAO metrics' as any)).to.be.true
    })

    it('should not update metrics if action is invalid', async () => {
      const metricAction = 'invalidAction' as IMetricAction
      const memberAddress = '0x123'
      const pluginAddress = '0xabc'
      const network = NetworksEnum.ethereumMainnet

      const metrics = { id: 'metrics-id' }

      const createMetricsStub = sandbox.stub(ProxyMember, 'createMetrics').resolves(metrics)

      const result = await ProxyMember.updateMetricsByAction(metricAction, { memberAddress, pluginAddress, network })

      expect(result).to.equal(metrics)
      expect(createMetricsStub.calledWith({ address: memberAddress, pluginAddress, network })).to.be.true
    })
  })

  describe('addToDao', () => {
    it('should add member to DAO if not already a member', async () => {
      const params = {
        memberAddress: '0x123',
        daoAddress: '0xdao',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      const member = { id: 'member-id', address: params.memberAddress }
      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const findMappingStub = sandbox.stub(Models.DaoMemberMapping, 'findMapping').resolves(null)
      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument').resolves()

      const result = await ProxyMember.addToDao(params)

      expect(result).to.equal(member)
      expect(createMemberStub.calledWith(params.memberAddress)).to.be.true
      expect(
        findMappingStub.calledWith({
          memberAddress: member.address,
          daoAddress: params.daoAddress,
          pluginAddress: params.pluginAddress,
          network: params.network,
        }),
      ).to.be.true
      expect(
        createDocumentStub.calledWith(
          Models.DaoMemberMapping,
          {
            memberAddress: member.address,
            daoAddress: params.daoAddress,
            pluginAddress: params.pluginAddress,
            network: params.network,
          },
          { logId: member.id },
          'New DaoMemberMapping',
        ),
      ).to.be.true
    })

    it('should not add member to DAO if already a member', async () => {
      const params = {
        memberAddress: '0x123',
        daoAddress: '0xdao',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      const member = { id: 'member-id', address: params.memberAddress }
      const existingDaoMember = { id: 'mapping-id' }

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const findMappingStub = sandbox.stub(Models.DaoMemberMapping, 'findMapping').resolves(existingDaoMember)
      const createDocumentStub = sandbox.stub(DbOperations, 'createDocument')

      const result = await ProxyMember.addToDao(params)

      expect(result).to.equal(member)
      expect(createMemberStub.calledWith(params.memberAddress)).to.be.true
      expect(
        findMappingStub.calledWith({
          memberAddress: member.address,
          daoAddress: params.daoAddress,
          pluginAddress: params.pluginAddress,
          network: params.network,
        }),
      ).to.be.true
      expect(createDocumentStub.notCalled).to.be.true
    })
  })

  describe('removeFromDao', () => {
    it('should remove member from DAO if mapping exists', async () => {
      const params = {
        memberAddress: '0x123',
        daoAddress: '0xdao',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      const member = { id: 'member-id', address: params.memberAddress }
      const existingDaoMember = { id: 'mapping-id', removeSelf: sandbox.stub().resolves({ id: 'removed-id' }) }

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const findMappingStub = sandbox.stub(Models.DaoMemberMapping, 'findMapping').resolves(existingDaoMember)

      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      const result = await ProxyMember.removeFromDao(params)

      expect(result).to.equal(member)
      expect(createMemberStub.calledWith(params.memberAddress)).to.be.true
      expect(
        findMappingStub.calledWith({
          memberAddress: member.address,
          daoAddress: params.daoAddress,
          pluginAddress: params.pluginAddress,
          network: params.network,
        }),
      ).to.be.true

      expect(loggerVerboseStub.calledWith('Remove DaoMemberMapping' as any)).to.be.true
    })

    it('should not remove member from DAO if mapping does not exist', async () => {
      const params = {
        memberAddress: '0x123',
        daoAddress: '0xdao',
        pluginAddress: '0xplugin',
        network: NetworksEnum.ethereumMainnet,
      }

      const member = { id: 'member-id', address: params.memberAddress }

      const createMemberStub = sandbox.stub(ProxyMember, 'createMember').resolves(member as any)
      const findMappingStub = sandbox.stub(Models.DaoMemberMapping, 'findMapping').resolves(null)

      const result = await ProxyMember.removeFromDao(params)

      expect(result).to.equal(member)
      expect(createMemberStub.calledWith(params.memberAddress)).to.be.true
      expect(
        findMappingStub.calledWith({
          memberAddress: member.address,
          daoAddress: params.daoAddress,
          pluginAddress: params.pluginAddress,
          network: params.network,
        }),
      ).to.be.true
    })
  })
})
