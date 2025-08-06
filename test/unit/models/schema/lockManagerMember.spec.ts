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
    }
  })

  afterEach(async () => {
    sandbox?.restore()
    // Clean up all test data
    await Models.LockManagerMember.deleteMany({})
    await Models.Member.deleteMany({})
    await Models.Plugin.deleteMany({})
    await Models.MemberMetrics.deleteMany({})
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

    it('should create member without optional fields', async () => {
      const minimalMemberData = {
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xplugin456',
        memberAddress: '0xmember456',
        daoAddress: '0xdao456',
      }

      const createdMember = await Models.LockManagerMember.create(minimalMemberData)

      expect(createdMember.network).to.eq(minimalMemberData.network)
      expect(createdMember.pluginAddress).to.eq(minimalMemberData.pluginAddress)
      expect(createdMember.memberAddress).to.eq(minimalMemberData.memberAddress)
      expect(createdMember.daoAddress).to.eq(minimalMemberData.daoAddress)
      expect(createdMember.votingPower).to.eq('0')
      expect(createdMember.transactionHash).to.be.undefined
      expect(createdMember.blockNumber).to.be.undefined
      expect(createdMember.blockTimestamp).to.be.undefined
    })

    it('should throw error if network is missing', async () => {
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

    it('should throw error if pluginAddress is missing', async () => {
      const memberWithoutPluginAddress = {
        ...mockLockManagerMemberData,
        pluginAddress: undefined,
      }

      try {
        await Models.LockManagerMember.create(memberWithoutPluginAddress as any)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.include('pluginAddress is required')
      }
    })

    it('should throw error if memberAddress is missing', async () => {
      const memberWithoutMemberAddress = {
        ...mockLockManagerMemberData,
        memberAddress: undefined,
      }

      try {
        await Models.LockManagerMember.create(memberWithoutMemberAddress as any)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.include('memberAddress is required')
      }
    })

    it('should create member with string votingPower', async () => {
      const memberWithStringVotingPower = {
        ...mockLockManagerMemberData,
        votingPower: '999999999999999999999',
      }

      const createdMember = await Models.LockManagerMember.create(memberWithStringVotingPower)
      expect(createdMember.votingPower).to.eq('999999999999999999999')
    })

    it('should create member with zero votingPower', async () => {
      const memberWithZeroVotingPower = {
        ...mockLockManagerMemberData,
        votingPower: '0',
      }

      const createdMember = await Models.LockManagerMember.create(memberWithZeroVotingPower)
      expect(createdMember.votingPower).to.eq('0')
    })
  })

  describe('getEntityId', () => {
    it('should generate correct entity id', () => {
      const entityId = Models.LockManagerMember.getEntityId({
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xplugin123',
        memberAddress: '0xmember123',
      })

      expect(entityId).to.eq(`${NetworksEnum.ethereumMainnet}-0xplugin123-0xmember123`)
    })

    it('should generate entity id with different network', () => {
      const entityId = Models.LockManagerMember.getEntityId({
        network: NetworksEnum.polygonMainnet,
        pluginAddress: '0xplugin789',
        memberAddress: '0xmember789',
      })

      expect(entityId).to.eq(`${NetworksEnum.polygonMainnet}-0xplugin789-0xmember789`)
    })

    it('should generate entity id with uppercase addresses', () => {
      const entityId = Models.LockManagerMember.getEntityId({
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xPLUGIN123',
        memberAddress: '0xMEMBER123',
      })

      expect(entityId).to.eq(`${NetworksEnum.ethereumMainnet}-0xPLUGIN123-0xMEMBER123`)
    })
  })

  describe('findByEntityId', () => {
    it('should find member by entity id', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)
      const foundMember = await Models.LockManagerMember.findByEntityId(createdMember.id)

      expect(foundMember).to.not.be.null
      expect(foundMember!.id).to.eq(createdMember.id)
      expect(foundMember!.memberAddress).to.eq(createdMember.memberAddress)
      expect(foundMember!.pluginAddress).to.eq(createdMember.pluginAddress)
      expect(foundMember!.network).to.eq(createdMember.network)
    })

    it('should return null if member not found', async () => {
      const foundMember = await Models.LockManagerMember.findByEntityId('non-existent-id')
      expect(foundMember).to.be.null
    })

    it('should find member with custom id', async () => {
      const customId = 'custom-unique-id'
      await Models.LockManagerMember.create({
        ...mockLockManagerMemberData,
        id: customId,
      })

      const foundMember = await Models.LockManagerMember.findByEntityId(customId)
      expect(foundMember).to.not.be.null
      expect(foundMember!.id).to.eq(customId)
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

    it('should find correct member when multiple exist', async () => {
      // First member uses the existing mockMember from beforeEach
      const firstMemberData = {
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: mockPlugin.address,
        memberAddress: mockMember.address,
        daoAddress: mockPlugin.daoAddress,
        votingPower: '1000000000000000000',
        transactionHash: '0xfirst123',
        blockNumber: 12345,
        blockTimestamp: 1620000000,
      }
      const firstMember = await Models.LockManagerMember.create(firstMemberData)

      // Create a new mock member for second member
      const secondMockMember = await Models.Member.create({
        id: crypto.randomUUID(),
        address: '0xmember999',
        ens: 'member999.eth',
        avatar: 'avatar-999',
      })

      // Create second member with different address
      const secondMemberData = {
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: mockPlugin.address,
        memberAddress: secondMockMember.address,
        daoAddress: mockPlugin.daoAddress,
        votingPower: '2000000000000000000',
        transactionHash: '0xsecond123',
        blockNumber: 12346,
        blockTimestamp: 1620000001,
      }
      const secondMember = await Models.LockManagerMember.create(secondMemberData)

      // Find the first member
      const foundFirstMember = await Models.LockManagerMember.findMemberByPlugin({
        network: firstMemberData.network!,
        pluginAddress: firstMemberData.pluginAddress!,
        memberAddress: firstMemberData.memberAddress!,
      })

      // Find the second member
      const foundSecondMember = await Models.LockManagerMember.findMemberByPlugin({
        network: secondMemberData.network!,
        pluginAddress: secondMemberData.pluginAddress!,
        memberAddress: secondMemberData.memberAddress!,
      })

      expect(foundFirstMember).to.not.be.null
      expect(foundFirstMember!.memberAddress).to.eq(firstMemberData.memberAddress)
      expect(foundFirstMember!.id).to.eq(firstMember.id)

      expect(foundSecondMember).to.not.be.null
      expect(foundSecondMember!.memberAddress).to.eq('0xmember999')
      expect(foundSecondMember!.id).to.eq(secondMember.id)
    })

    it('should not find member with wrong network', async () => {
      await Models.LockManagerMember.create(mockLockManagerMemberData)

      const foundMember = await Models.LockManagerMember.findMemberByPlugin({
        network: NetworksEnum.polygonMainnet, // Different network
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        memberAddress: mockLockManagerMemberData.memberAddress!,
      })

      expect(foundMember).to.be.null
    })
  })

  describe('findActiveMembers', () => {
    it('should find only active members (votingPower > 0) for a plugin', async () => {
      // Create active member with positive voting power
      const activeMember = await Models.LockManagerMember.create({
        ...mockLockManagerMemberData,
        memberAddress: '0xactivemember',
        votingPower: '1000000000000000000',
      })

      // Create inactive member with zero voting power
      await Models.LockManagerMember.create({
        ...mockLockManagerMemberData,
        memberAddress: '0xinactivemember',
        votingPower: '0',
      })

      const activeMembers = await Models.LockManagerMember.findActiveMembers({
        network: mockLockManagerMemberData.network!,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
      })

      expect(activeMembers).to.have.lengthOf(1)
      expect(activeMembers[0].id).to.eq(activeMember.id)
      expect(activeMembers[0].memberAddress).to.eq('0xactivemember')
      expect(activeMembers[0].votingPower).to.not.eq('0')
    })

    it('should return empty array if no active members found', async () => {
      // Create only inactive members
      await Models.LockManagerMember.create({
        ...mockLockManagerMemberData,
        votingPower: '0',
      })

      const activeMembers = await Models.LockManagerMember.findActiveMembers({
        network: mockLockManagerMemberData.network!,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
      })

      expect(activeMembers).to.be.an('array').that.is.empty
    })

    it('should return empty array for non-existent plugin', async () => {
      const activeMembers = await Models.LockManagerMember.findActiveMembers({
        network: NetworksEnum.ethereumSepolia,
        pluginAddress: '0xnonexistent',
      })

      expect(activeMembers).to.be.an('array').that.is.empty
    })

    it('should find multiple active members', async () => {
      // Create multiple active members
      const memberAddresses = ['0xactive1', '0xactive2', '0xactive3']

      for (const address of memberAddresses) {
        await Models.LockManagerMember.create({
          ...mockLockManagerMemberData,
          memberAddress: address,
          votingPower: '1000000000000000000',
        })
      }

      const activeMembers = await Models.LockManagerMember.findActiveMembers({
        network: mockLockManagerMemberData.network!,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
      })

      expect(activeMembers).to.have.lengthOf(3)
      const foundAddresses = activeMembers.map(m => m.memberAddress)
      expect(foundAddresses).to.include.members(memberAddresses)
    })

    it('should not find members from different network', async () => {
      await Models.LockManagerMember.create({
        ...mockLockManagerMemberData,
        network: NetworksEnum.polygonMainnet,
        votingPower: '1000000000000000000',
      })

      const activeMembers = await Models.LockManagerMember.findActiveMembers({
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
      })

      expect(activeMembers).to.be.an('array').that.is.empty
    })
  })

  describe('update', () => {
    it('should update votingPower', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)
      const newVotingPower = '2000000000000000000'

      const updatedMember = await createdMember.update({
        votingPower: newVotingPower,
      })

      expect(updatedMember.votingPower).to.eq(newVotingPower)
    })

    it('should update transactionHash and blockNumber', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)

      const updatedMember = await createdMember.update({
        transactionHash: '0xnewHash123',
        blockNumber: 54321,
      })

      expect(updatedMember.transactionHash).to.eq('0xnewHash123')
      expect(updatedMember.blockNumber).to.eq(54321)
    })

    it('should update blockTimestamp', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)
      const newTimestamp = 1630000000

      const updatedMember = await createdMember.update({
        blockTimestamp: newTimestamp,
      })

      expect(updatedMember.blockTimestamp).to.eq(newTimestamp)
    })

    it('should update votingPower to zero', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)

      const updatedMember = await createdMember.update({
        votingPower: '0',
      })

      expect(updatedMember.votingPower).to.eq('0')
    })

    it('should not update if value is the same', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)
      const originalVotingPower = createdMember.votingPower

      const saveSpy = sandbox.spy(createdMember, 'save')

      const updatedMember = await createdMember.update({
        votingPower: originalVotingPower,
      })

      expect(updatedMember.votingPower).to.eq(originalVotingPower)
      // Save is still called but no actual change occurs
      expect(saveSpy.calledOnce).to.be.true
    })

    it('should ignore invalid fields', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)

      const updatedMember = await createdMember.update({
        invalidField: 'should not update',
        anotherInvalidField: 123,
      } as any)

      expect((updatedMember as any).invalidField).to.be.undefined
      expect((updatedMember as any).anotherInvalidField).to.be.undefined
    })

    it('should not update required fields to null', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)
      const originalNetwork = createdMember.network
      const originalPluginAddress = createdMember.pluginAddress

      const updatedMember = await createdMember.update({
        network: null,
        pluginAddress: null,
      } as any)

      expect(updatedMember.network).to.eq(originalNetwork)
      expect(updatedMember.pluginAddress).to.eq(originalPluginAddress)
    })

    it('should update multiple fields at once', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)

      const updatedMember = await createdMember.update({
        votingPower: '3000000000000000000',
        transactionHash: '0xmultiple123',
        blockNumber: 99999,
        blockTimestamp: 1640000000,
      })

      expect(updatedMember.votingPower).to.eq('3000000000000000000')
      expect(updatedMember.transactionHash).to.eq('0xmultiple123')
      expect(updatedMember.blockNumber).to.eq(99999)
      expect(updatedMember.blockTimestamp).to.eq(1640000000)
    })

    it('should handle empty update object', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)
      const originalData = createdMember.toObject()

      const updatedMember = await createdMember.update({})

      expect(updatedMember.votingPower).to.eq(originalData.votingPower)
      expect(updatedMember.transactionHash).to.eq(originalData.transactionHash)
      expect(updatedMember.blockNumber).to.eq(originalData.blockNumber)
    })
  })

  describe('reload', () => {
    it('should reload member from database', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)

      // Update the member directly in database
      await Models.LockManagerMember.updateOne({ _id: createdMember._id }, { votingPower: '9999999999' })

      const reloadedMember = await createdMember.reload()

      expect(reloadedMember).to.not.be.null
      expect(reloadedMember!.id).to.eq(createdMember.id)
      expect(reloadedMember!.votingPower).to.eq('9999999999')
    })

    it('should return null if member was deleted', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)

      // Delete the member from database
      await Models.LockManagerMember.deleteOne({ _id: createdMember._id })

      const reloadedMember = await createdMember.reload()
      expect(reloadedMember).to.be.null
    })

    it('should reload with latest data after external update', async () => {
      const createdMember = await Models.LockManagerMember.create(mockLockManagerMemberData)

      // Simulate external update
      await Models.LockManagerMember.findByIdAndUpdate(createdMember._id, {
        votingPower: '5000000000000000000',
        transactionHash: '0xexternalupdate',
        blockNumber: 77777,
      })

      const reloadedMember = await createdMember.reload()

      expect(reloadedMember).to.not.be.null
      expect(reloadedMember!.votingPower).to.eq('5000000000000000000')
      expect(reloadedMember!.transactionHash).to.eq('0xexternalupdate')
      expect(reloadedMember!.blockNumber).to.eq(77777)
    })
  })

  describe('findAndPaginate', () => {
    beforeEach(async () => {
      // Create multiple test members
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

    it('should paginate with custom page size', async () => {
      const paginationParams = {
        pageSize: 2,
        page: 1,
      }

      const response = await Models.LockManagerMember.findAndPaginate({
        paginationParams,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      expect(response.data).to.have.lengthOf(2)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.pageSize).to.eq(2)
      expect(response.metadata.totalRecords).to.eq(5)
      expect(response.metadata.totalPages).to.eq(3)
    })

    it('should paginate to specific page', async () => {
      const paginationParams = {
        pageSize: 2,
        page: 2,
      }

      const response = await Models.LockManagerMember.findAndPaginate({
        paginationParams,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      expect(response.data).to.have.lengthOf(2)
      expect(response.metadata.page).to.eq(2)
      expect(response.metadata.pageSize).to.eq(2)
    })

    it('should handle last page with fewer items', async () => {
      const paginationParams = {
        pageSize: 2,
        page: 3,
      }

      const response = await Models.LockManagerMember.findAndPaginate({
        paginationParams,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      expect(response.data).to.have.lengthOf(1) // Only 1 item on last page
      expect(response.metadata.page).to.eq(3)
      expect(response.metadata.totalPages).to.eq(3)
    })

    it('should sort by votingPower descending', async () => {
      const paginationParams = {
        sort: 'votingPower',
        order: 'desc',
      }

      const response = await Models.LockManagerMember.findAndPaginate({
        paginationParams,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      // Check that voting powers are in descending order
      const votingPowers = response.data.map((m: any) => BigInt(m.votingPower))
      for (let i = 1; i < votingPowers.length; i++) {
        expect(votingPowers[i - 1] >= votingPowers[i]).to.be.true
      }
    })

    it('should sort by votingPower ascending', async () => {
      const paginationParams = {
        sort: 'votingPower',
        order: 'asc',
      }

      const response = await Models.LockManagerMember.findAndPaginate({
        paginationParams,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      // Check that voting powers are in ascending order
      const votingPowers = response.data.map((m: any) => BigInt(m.votingPower))
      for (let i = 1; i < votingPowers.length; i++) {
        expect(votingPowers[i - 1] <= votingPowers[i]).to.be.true
      }
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

    it('should handle empty result set', async () => {
      const response = await Models.LockManagerMember.findAndPaginate({
        pluginAddress: '0xnonexistentplugin999',
        network: NetworksEnum.arbitrumMainnet,
      })

      expect(response).to.have.property('data').that.is.empty
      expect(response.metadata.totalRecords).to.eq(0)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.page).to.eq(1)
    })

    it('should include member details in response', async () => {
      const response = await Models.LockManagerMember.findAndPaginate({
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      const firstMember = response.data[0]
      expect(firstMember).to.have.property('address')
      expect(firstMember).to.have.property('ens')
      expect(firstMember).to.have.property('avatar')
      expect(firstMember.address).to.match(/^0xmember\d$/)
      expect(firstMember.ens).to.match(/^member\d\.eth$/)
      expect(firstMember.avatar).to.match(/^avatar-\d$/)
    })

    it('should include member metrics in response', async () => {
      // Create member metrics for one member
      await Models.MemberMetrics.create({
        id: crypto.randomUUID(),
        address: '0xmember0',
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
      expect(memberWithMetrics.metrics.lastActivity).to.eq(1620000000)
      expect(memberWithMetrics.metrics.firstActivity).to.eq(1619000000)
    })

    it('should provide default metrics when member has no metrics', async () => {
      const response = await Models.LockManagerMember.findAndPaginate({
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      // Find a member without metrics (we only created metrics for 0xmember0 in previous test)
      const memberWithoutMetrics = response.data.find((member: any) => member.address === '0xmember1')
      expect(memberWithoutMetrics).to.exist
      expect(memberWithoutMetrics.metrics).to.exist
      expect(memberWithoutMetrics.metrics.lastActivity).to.be.null
      expect(memberWithoutMetrics.metrics.firstActivity).to.be.null
      expect(memberWithoutMetrics.metrics.voteCount).to.eq(0)
      expect(memberWithoutMetrics.metrics.proposalCount).to.eq(0)
      expect(memberWithoutMetrics.metrics.delegateReceivedCount).to.eq(0)
    })

    it('should handle member without Member model entry', async () => {
      // Create a LockManagerMember without corresponding Member entry
      await Models.LockManagerMember.create({
        network: mockLockManagerMemberData.network!,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        memberAddress: '0xorphanmember',
        daoAddress: mockLockManagerMemberData.daoAddress!,
        votingPower: '1000000000000000000',
        transactionHash: '0xorphanhash',
        blockNumber: 99999,
        blockTimestamp: 1620000000,
      })

      const response = await Models.LockManagerMember.findAndPaginate({
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      const orphanMember = response.data.find((member: any) => member.address === '0xorphanmember')
      expect(orphanMember).to.exist
      expect(orphanMember.address).to.eq('0xorphanmember')
      expect(orphanMember.ens).to.be.null
      expect(orphanMember.avatar).to.be.null
    })

    it('should filter by network correctly', async () => {
      // Create member in different network
      await Models.LockManagerMember.create({
        network: NetworksEnum.polygonMainnet,
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        memberAddress: '0xpolygonmember',
        daoAddress: mockLockManagerMemberData.daoAddress!,
        votingPower: '1000000000000000000',
        transactionHash: '0xpolygonhash',
        blockNumber: 88888,
        blockTimestamp: 1620000000,
      })

      const response = await Models.LockManagerMember.findAndPaginate({
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      // Should not include the polygon member
      const addresses = response.data.map((member: any) => member.address)
      expect(addresses).to.not.include('0xpolygonmember')
      expect(response.metadata.totalRecords).to.eq(5) // Only the original 5 members
    })

    it('should filter by pluginAddress correctly', async () => {
      // Create member for different plugin
      await Models.LockManagerMember.create({
        network: mockLockManagerMemberData.network!,
        pluginAddress: '0xdifferentplugin',
        memberAddress: '0xdifferentpluginmember',
        daoAddress: mockLockManagerMemberData.daoAddress!,
        votingPower: '1000000000000000000',
        transactionHash: '0xdifferenthash',
        blockNumber: 77777,
        blockTimestamp: 1620000000,
      })

      const response = await Models.LockManagerMember.findAndPaginate({
        pluginAddress: mockLockManagerMemberData.pluginAddress!,
        network: mockLockManagerMemberData.network!,
      })

      // Should not include the member from different plugin
      const addresses = response.data.map((member: any) => member.address)
      expect(addresses).to.not.include('0xdifferentpluginmember')
      expect(response.metadata.totalRecords).to.eq(5) // Only the original 5 members
    })
  })
})
