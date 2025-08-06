import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import LockManagerMember from '@models/schema/lockManagerMember'
import { NetworksEnum } from '@types'
import ModelUtils from '@models/utils/models'

describe('Model: LockManagerMember', () => {
  let sandbox: SinonSandbox
  let mockLockManagerMemberData: Partial<LockManagerMember>
  let mockPlugin: any
  let mockMember: any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    // Create mock plugin
    mockPlugin = await Models.Plugin.create({
      address: '0xplugin123',
      daoAddress: '0xdao123',
      network: NetworksEnum.ethereumMainnet,
      status: 'installed',
      blockNumber: 12345,
      transactionHash: '0xtest123',
      pluginSetupRepoAddress: '0xrepo123',
      interfaceType: 'tokenVoting',
    })

    // Create mock member
    mockMember = await Models.Member.create({
      id: crypto.randomUUID(),
      address: '0xmember123',
      ens: 'member.eth',
      avatar: 'avatar-url',
    })

    mockLockManagerMemberData = {
      network: NetworksEnum.ethereumMainnet,
      pluginAddress: mockPlugin.address,
      memberAddress: mockMember.address,
      daoAddress: mockPlugin.daoAddress,
      votingPower: '1000000000000000000',
      transactionHash: '0xabcdef123',
      blockNumber: 12345,
      blockTimestamp: 1620000000,
      isActive: true,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('create', () => {
    it('should create lockManagerMember with all required fields', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)

      expect(createdMember.network).to.eq(mockLockManagerMemberData.network)
      expect(createdMember.pluginAddress).to.eq(mockLockManagerMemberData.pluginAddress)
      expect(createdMember.memberAddress).to.eq(mockLockManagerMemberData.memberAddress)
      expect(createdMember.daoAddress).to.eq(mockLockManagerMemberData.daoAddress)
      expect(createdMember.votingPower).to.eq(mockLockManagerMemberData.votingPower)
      expect(createdMember.transactionHash).to.eq(mockLockManagerMemberData.transactionHash)
      expect(createdMember.blockNumber).to.eq(mockLockManagerMemberData.blockNumber)
      expect(createdMember.blockTimestamp).to.eq(mockLockManagerMemberData.blockTimestamp)
      expect(createdMember.isActive).to.eq(mockLockManagerMemberData.isActive)
      expect(createdMember.id).to.exist
    })

    it('should auto-generate id if not provided', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)
      const expectedId = `${mockLockManagerMemberData.network}-${mockLockManagerMemberData.pluginAddress}-${mockLockManagerMemberData.memberAddress}`

      expect(createdMember.id).to.eq(expectedId)
    })

    it('should create with custom id if provided', async () => {
      const customId = 'custom-id-123'
      const memberWithCustomId = {
        ...mockLockManagerMemberData,
        id: customId,
      }

      const createdMember = await Models.LockManagerMember.create(memberWithCustomId)
      expect(createdMember.id).to.eq(customId)
    })

    it('should set default votingPower to 0 if not provided', async () => {
      const memberWithoutVotingPower = {
        ...mockLockManagerMemberData,
        votingPower: undefined,
      }

      const createdMember = await Models.LockManagerMember.create(memberWithoutVotingPower as any)
      expect(createdMember.votingPower).to.eq('0')
    })

    it('should set default isActive to true if not provided', async () => {
      const memberWithoutIsActive = {
        ...mockLockManagerMemberData,
        isActive: undefined,
      }

      const createdMember = await Models.LockManagerMember.create(memberWithoutIsActive as any)
      expect(createdMember.isActive).to.be.true
    })

    it('should throw error if required fields are missing', async () => {
      const memberWithoutNetwork = {
        ...mockLockManagerMemberData,
        network: undefined,
      }

      try {
        await Models.LockManagerMember.create(memberWithoutNetwork as any)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.include('network is required')
      }
    })
  })

  describe('getEntityId', () => {
    it('should generate correct entity id', async () => {
      const entityId = Models.LockManagerMember.getEntityId({
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xplugin123',
        memberAddress: '0xmember123',
      })

      expect(entityId).to.eq(`${NetworksEnum.ethereumMainnet}-0xplugin123-0xmember123`)
    })
  })

  describe('findByEntityId', () => {
    it('should find member by entity id', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)
      const foundMember = await Models.LockManagerMember.findByEntityId(createdMember.id)

      expect(foundMember).to.not.be.null
      expect(foundMember!.id).to.eq(createdMember.id)
      expect(foundMember!.memberAddress).to.eq(createdMember.memberAddress)
    })

    it('should return null if member not found', async () => {
      const foundMember = await Models.LockManagerMember.findByEntityId('non-existent-id')
      expect(foundMember).to.be.null
    })
  })

  describe('findMemberByPlugin', () => {
    it('should find member by plugin parameters', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)

      const foundMember = await Models.LockManagerMember.findMemberByPlugin({
        network: mockLockManagerMemberData.network!,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        memberAddress: mockLockManagerMemberData.memberAddress!,
      })

      expect(foundMember).to.not.be.null
      expect(foundMember!.id).to.eq(createdMember.id)
      expect(foundMember!.network).to.eq(mockLockManagerMemberData.network)
      expect(foundMember!.pluginAddress).to.eq(mockLockManagerMemberData.pluginAddress)
      expect(foundMember!.memberAddress).to.eq(mockLockManagerMemberData.memberAddress)
    })

    it('should return null if member not found', async () => {
      const foundMember = await Models.LockManagerMember.findMemberByPlugin({
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xnonexistent',
        memberAddress: '0xnonexistent',
      })

      expect(foundMember).to.be.null
    })
  })

  describe('findActiveMembers', () => {
    it('should find only active members for a plugin', async () => {
      // Create active member
      const activeMember = await Models.LockManagerMember.create({
        ...mockLockManagerMemberData,
        memberAddress: '0xactivemember',
        isActive: true,
      })

      // Create inactive member
      await Models.LockManagerMember.create({
        ...mockLockManagerMemberData,
        memberAddress: '0xinactivemember',
        isActive: false,
      })

      const activeMembers = await Models.LockManagerMember.findActiveMembers({
        network: mockLockManagerMemberData.network!,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
      })

      expect(activeMembers).to.have.lengthOf(1)
      expect(activeMembers[0].id).to.eq(activeMember.id)
      expect(activeMembers[0].isActive).to.be.true
      expect(activeMembers[0].memberAddress).to.eq('0xactivemember')
    })

    it('should return empty array if no active members found', async () => {
      const activeMembers = await Models.LockManagerMember.findActiveMembers({
        network: NetworksEnum.ethereumSepolia,
        pluginAddress: '0xnonexistent',
      })

      expect(activeMembers).to.be.an('array').that.is.empty
    })
  })

  describe('update', () => {
    it('should update lockManagerMember fields', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)

      const updatedMember = await createdMember.update({
        votingPower: '2000000000000000000',
        transactionHash: '0xnewHash123',
        blockNumber: 54321,
        isActive: false,
      })

      expect(updatedMember.votingPower).to.eq('2000000000000000000')
      expect(updatedMember.transactionHash).to.eq('0xnewHash123')
      expect(updatedMember.blockNumber).to.eq(54321)
      expect(updatedMember.isActive).to.be.false
    })

    it('should not update invalid fields', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)
      const originalAddress = createdMember.memberAddress

      const updatedMember = await createdMember.update({
        invalidField: 'should not update',
      } as any)

      expect(updatedMember.memberAddress).to.eq(originalAddress)
      expect((updatedMember as any).invalidField).to.be.undefined
    })

    it('should not update required fields to null/empty', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)
      const originalNetwork = createdMember.network

      const updatedMember = await createdMember.update({
        network: null,
      } as any)

      expect(updatedMember.network).to.eq(originalNetwork)
    })
  })

  describe('reload', () => {
    it('should reload member from database', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)
      const reloadedMember = await createdMember.reload()

      expect(reloadedMember).to.not.be.null
      expect(reloadedMember!.id).to.eq(createdMember.id)
      expect(reloadedMember!.network).to.eq(createdMember.network)
    })
  })

  describe('findAndPaginate', () => {
    beforeEach(async () => {
      // Create test members
      for (let i = 0; i < 5; i++) {
        await Models.Member.create({
          id: crypto.randomUUID(),
          address: `0xmember${i}`,
          ens: `member${i}.eth`,
          avatar: `avatar-${i}`,
        })

        await Models.LockManagerMember.create({
          network: mockLockManagerMemberData.network!,
          pluginAddress: mockLockManagerMemberData.pluginAddress!,
          memberAddress: `0xmember${i}`,
          daoAddress: mockLockManagerMemberData.daoAddress!,
          votingPower: `${(i + 1) * 1000000000000000000}`,
          transactionHash: `0xhash${i}`,
          blockNumber: 12345 + i,
          blockTimestamp: 1620000000 + i,
          isActive: true,
        })
      }
    })

    it('should find and paginate members with default params', async () => {
      const response = await Models.LockManagerMember.findAndPaginate({
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      expect(response).to.have.property('data').with.lengthOf(5)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(5)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.data[0]).to.have.property('address')
      expect(response.data[0]).to.have.property('ens')
      expect(response.data[0]).to.have.property('avatar')
      expect(response.data[0]).to.have.property('votingPower')
      expect(response.data[0]).to.have.property('metrics')
    })

    it('should find and paginate with custom pagination params', async () => {
      const paginationParams = {
        pageSize: 2,
        page: 2,
        sort: 'votingPower',
        order: 'desc',
      }

      const response = await Models.LockManagerMember.findAndPaginate({
        paginationParams,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      expect(response).to.have.property('data').with.lengthOf(2)
      expect(response.metadata.page).to.eq(2)
      expect(response.metadata.pageSize).to.eq(2)
      expect(response.metadata.totalRecords).to.eq(5)
      expect(response.metadata.totalPages).to.eq(3)
    })

    it('should return empty response when page exceeds total pages', async () => {
      const paginationParams = {
        pageSize: 10,
        page: 999,
      }

      const paginateEmptyResponseSpy = sandbox.spy(ModelUtils, 'paginateEmptyResponse')

      const response = await Models.LockManagerMember.findAndPaginate({
        paginationParams,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      expect(paginateEmptyResponseSpy.calledOnce).to.be.true
      expect(response.data).to.be.an('array').that.is.empty
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(0)
    })

    it('should only include active members in pagination', async () => {
      // Create an inactive member
      await Models.Member.create({
        id: crypto.randomUUID(),
        address: '0xinactivemember',
        ens: 'inactive.eth',
        avatar: 'inactive-avatar',
      })

      await Models.LockManagerMember.create({
        network: mockLockManagerMemberData.network!,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        memberAddress: '0xinactivemember',
        daoAddress: mockLockManagerMemberData.daoAddress!,
        votingPower: '500000000000000000',
        transactionHash: '0xinactivehash',
        blockNumber: 99999,
        blockTimestamp: 1620000000,
        isActive: false,
      })

      const response = await Models.LockManagerMember.findAndPaginate({
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      // Should still only return 5 active members, not 6
      expect(response).to.have.property('data').with.lengthOf(5)
      expect(response.metadata.totalRecords).to.eq(5)

      // Verify none of the returned members is the inactive one
      const addresses = response.data.map((member: any) => member.address)
      expect(addresses).to.not.include('0xinactivemember')
    })

    it('should handle empty result set', async () => {
      const response = await Models.LockManagerMember.findAndPaginate({
        pluginAddress: '0xnonexistentplugin999',
        network: NetworksEnum.arbitrumMainnet,
      })

      expect(response).to.have.property('data').that.is.empty
      expect(response.metadata.totalRecords).to.eq(0)
      expect(response.metadata.totalPages).to.eq(1)
    })

    it('should include member metrics in response', async () => {
      // Create member metrics
      await Models.MemberMetrics.create({
        id: crypto.randomUUID(),
        address: '0xmember0', // This is the required field, not memberAddress
        network: mockLockManagerMemberData.network!,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        lastActivity: 1620000000,
        firstActivity: 1619000000,
        voteCount: 5,
        proposalCount: 2,
        delegateReceivedCount: 1,
      })

      const response = await Models.LockManagerMember.findAndPaginate({
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      const memberWithMetrics = response.data.find((member: any) => member.address === '0xmember0')
      expect(memberWithMetrics).to.exist
      expect(memberWithMetrics.metrics).to.exist
      expect(memberWithMetrics.metrics.voteCount).to.eq(5)
      expect(memberWithMetrics.metrics.proposalCount).to.eq(2)
      expect(memberWithMetrics.metrics.delegateReceivedCount).to.eq(1)
    })

    it('should provide default metrics when member has no metrics', async () => {
      const response = await Models.LockManagerMember.findAndPaginate({
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      const memberWithoutMetrics = response.data[0]
      expect(memberWithoutMetrics.metrics).to.exist
      expect(memberWithoutMetrics.metrics.lastActivity).to.be.null
      expect(memberWithoutMetrics.metrics.firstActivity).to.be.null
      expect(memberWithoutMetrics.metrics.voteCount).to.eq(0)
      expect(memberWithoutMetrics.metrics.proposalCount).to.eq(0)
      expect(memberWithoutMetrics.metrics.delegateReceivedCount).to.eq(0)
    })
  })
})
