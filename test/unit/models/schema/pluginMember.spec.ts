import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import PluginMember from '@models/schema/pluginMember'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import ModelUtils from '@models/utils/models'

describe('Model: PluginMember', () => {
  let sandbox: SinonSandbox
  let rawPluginMember: Partial<PluginMember>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawPluginMember = {
      memberAddress: '0x123456789012345678901234567890123456789A',
      pluginAddress: '0xA23456789012345678901234567890123456789B',
      daoAddress: '0xB23456789012345678901234567890123456789C',
      network: NetworksEnum.ethereumMainnet,
    }
  })

  afterEach(async () => {
    sandbox?.restore()
    // Clean up database to prevent duplicate key errors
    await Models.PluginMember.deleteMany({})
    await Models.Member.deleteMany({})
    await Models.Plugin.deleteMany({})
    await Models.PluginMetrics.deleteMany({})
  })

  it('Should create PluginMember', async () => {
    const entityId = Models.PluginMember.getEntityId({
      network: rawPluginMember.network!,
      memberAddress: rawPluginMember.memberAddress!,
      pluginAddress: rawPluginMember.pluginAddress!,
    })
    const pluginMember = await Models.PluginMember.create(rawPluginMember)
    expect(pluginMember.id).to.eq(entityId)
    expect(pluginMember.memberAddress).to.eq(rawPluginMember.memberAddress)
    expect(pluginMember.pluginAddress).to.eq(rawPluginMember.pluginAddress)
    expect(pluginMember.daoAddress).to.eq(rawPluginMember.daoAddress)
    expect(pluginMember.network).to.eq(rawPluginMember.network)
  })

  it('Should getEntityId', async () => {
    const params = {
      network: NetworksEnum.ethereumMainnet,
      memberAddress: '0xMember',
      pluginAddress: '0xPlugin',
    }
    const entityId = Models.PluginMember.getEntityId(params)
    expect(entityId).to.eq(`${params.network}-${params.memberAddress}-${params.pluginAddress}`)
  })

  it('Should findExistingLog', async () => {
    const createdPluginMember = await Models.PluginMember.create(rawPluginMember)
    const foundPluginMember = await Models.PluginMember.findExistingLog({
      network: rawPluginMember.network!,
      memberAddress: rawPluginMember.memberAddress!,
      pluginAddress: rawPluginMember.pluginAddress!,
    })
    expect(foundPluginMember?.id).to.eq(createdPluginMember.id)
  })

  it('Should findByEntityId', async () => {
    const createdPluginMember = await Models.PluginMember.create(rawPluginMember)
    const foundPluginMember = await Models.PluginMember.findByEntityId(createdPluginMember.id)
    expect(foundPluginMember?.id).to.eq(createdPluginMember.id)
  })

  it('should findByPluginAndMember', async () => {
    const createdPluginMember = await Models.PluginMember.create(rawPluginMember)
    const pluginMember = await Models.PluginMember.findByPluginAndMember(
      rawPluginMember.network!,
      rawPluginMember.pluginAddress!,
      rawPluginMember.memberAddress!,
    )
    expect(pluginMember?.id).to.eq(createdPluginMember.id)
  })

  it('should findAllMembersOfPlugin', async () => {
    // Use a unique plugin address to ensure we're testing in isolation
    const uniquePluginAddress = `0x${Date.now().toString(16).padEnd(40, '0')}`
    const testPluginMember1 = {
      memberAddress: '0x1111111111111111111111111111111111111111',
      pluginAddress: uniquePluginAddress,
      daoAddress: rawPluginMember.daoAddress,
      network: rawPluginMember.network,
    }
    const testPluginMember2 = {
      memberAddress: '0x2222222222222222222222222222222222222222',
      pluginAddress: uniquePluginAddress,
      daoAddress: rawPluginMember.daoAddress,
      network: rawPluginMember.network,
    }

    await Models.PluginMember.create(testPluginMember1)
    await Models.PluginMember.create(testPluginMember2)

    const pluginMembers = await Models.PluginMember.findAllMembersOfPlugin({
      pluginAddress: uniquePluginAddress,
      network: rawPluginMember.network!,
    })
    expect(pluginMembers).to.have.lengthOf(2)
    expect(pluginMembers[0].pluginAddress).to.eq(uniquePluginAddress)
    expect(pluginMembers[1].pluginAddress).to.eq(uniquePluginAddress)
  })

  it('should findAllMembersOfDao', async () => {
    // Use a unique DAO address to ensure we're testing in isolation
    const uniqueDaoAddress = `0x${(Date.now() + 1).toString(16).padEnd(40, '0')}`
    const testPluginMember1 = {
      memberAddress: '0x3333333333333333333333333333333333333333',
      pluginAddress: '0x4444444444444444444444444444444444444444',
      daoAddress: uniqueDaoAddress,
      network: rawPluginMember.network,
    }
    const testPluginMember2 = {
      memberAddress: '0x5555555555555555555555555555555555555555',
      pluginAddress: '0x6666666666666666666666666666666666666666',
      daoAddress: uniqueDaoAddress,
      network: rawPluginMember.network,
    }

    await Models.PluginMember.create(testPluginMember1)
    await Models.PluginMember.create(testPluginMember2)

    const daoMembers = await Models.PluginMember.findAllMembersOfDao({
      daoAddress: uniqueDaoAddress,
      network: rawPluginMember.network!,
    })
    expect(daoMembers).to.have.lengthOf(2)
    expect(daoMembers[0].daoAddress).to.eq(uniqueDaoAddress)
    expect(daoMembers[1].daoAddress).to.eq(uniqueDaoAddress)
  })

  it('should update PluginMember', async () => {
    const pluginMember = await Models.PluginMember.create(rawPluginMember)
    const newDaoAddress = '0xC23456789012345678901234567890123456789D'
    const updatedPluginMember = await pluginMember.update({
      daoAddress: newDaoAddress,
    })
    expect(updatedPluginMember.daoAddress).to.eq(newDaoAddress)
  })

  it('Should reload', async () => {
    const createdPluginMember = await Models.PluginMember.create(rawPluginMember)
    await createdPluginMember.reload()

    expect(createdPluginMember.memberAddress).to.eq(rawPluginMember.memberAddress)
  })

  it('Should create PluginMember with existing id', async () => {
    const existingId = 'custom-id-12345'
    const pluginMemberWithId = {
      ...rawPluginMember,
      id: existingId,
    }
    const pluginMember = await Models.PluginMember.create(pluginMemberWithId)
    expect(pluginMember.id).to.eq(existingId)
  })

  it('should findMapping', async () => {
    const createdPluginMember = await Models.PluginMember.create(rawPluginMember)
    const foundMapping = await Models.PluginMember.findMapping({
      memberAddress: rawPluginMember.memberAddress!,
      daoAddress: rawPluginMember.daoAddress!,
      pluginAddress: rawPluginMember.pluginAddress!,
      network: rawPluginMember.network!,
    })
    expect(foundMapping?.id).to.eq(createdPluginMember.id)
  })

  it('should findByPlugin', async () => {
    const uniquePluginAddress = `0x${Date.now().toString(16).padEnd(40, '0')}`
    const testPluginMember = {
      ...rawPluginMember,
      pluginAddress: uniquePluginAddress,
    }
    await Models.PluginMember.create(testPluginMember)

    const pluginMembers = await Models.PluginMember.findByPlugin(rawPluginMember.network!, uniquePluginAddress)
    expect(pluginMembers).to.have.lengthOf(1)
    expect(pluginMembers[0].pluginAddress).to.eq(uniquePluginAddress)
  })

  it('should findByDao', async () => {
    const uniqueDaoAddress = `0x${Date.now().toString(16).padEnd(40, '0')}`
    const testPluginMember = {
      ...rawPluginMember,
      daoAddress: uniqueDaoAddress,
    }
    await Models.PluginMember.create(testPluginMember)

    const daoMembers = await Models.PluginMember.findByDao(rawPluginMember.network!, uniqueDaoAddress)
    expect(daoMembers).to.have.lengthOf(1)
    expect(daoMembers[0].daoAddress).to.eq(uniqueDaoAddress)
  })

  it('should not update when value is equal', async () => {
    const pluginMember = await Models.PluginMember.create(rawPluginMember)
    const saveSpy = sandbox.spy(pluginMember, 'save')

    // Update with the same value
    await pluginMember.update({
      daoAddress: rawPluginMember.daoAddress,
    })

    // Save should still be called but the value should remain the same
    expect(saveSpy.calledOnce).to.be.true
    expect(pluginMember.daoAddress).to.eq(rawPluginMember.daoAddress)
  })

  it('should countUniqueMembers', async () => {
    const uniqueDaoAddress = `0x${Date.now().toString(16).padEnd(40, '0')}`

    // Create multiple members for the same DAO with one duplicate member
    await Models.PluginMember.create({
      memberAddress: '0xAAA456789012345678901234567890123456789A',
      pluginAddress: '0xBBB456789012345678901234567890123456789B',
      daoAddress: uniqueDaoAddress,
      network: rawPluginMember.network,
    })

    await Models.PluginMember.create({
      memberAddress: '0xCCC456789012345678901234567890123456789C',
      pluginAddress: '0xDDD456789012345678901234567890123456789D',
      daoAddress: uniqueDaoAddress,
      network: rawPluginMember.network,
    })

    // Same member, different plugin
    await Models.PluginMember.create({
      memberAddress: '0xAAA456789012345678901234567890123456789A',
      pluginAddress: '0xEEE456789012345678901234567890123456789E',
      daoAddress: uniqueDaoAddress,
      network: rawPluginMember.network,
    })

    const count = await Models.PluginMember.countUniqueMembers(uniqueDaoAddress, rawPluginMember.network!)
    expect(count).to.eq(2) // Only 2 unique members
  })

  it('should countUniqueMembers with session', async () => {
    const uniqueDaoAddress = `0x${(Date.now() + 1).toString(16).padEnd(40, '0')}`

    await Models.PluginMember.create({
      memberAddress: '0xFFF456789012345678901234567890123456789F',
      pluginAddress: '0x111456789012345678901234567890123456789A',
      daoAddress: uniqueDaoAddress,
      network: rawPluginMember.network,
    })

    // Spy on aggregate to verify session is passed
    const aggregateSpy = sandbox.spy(Models.PluginMember, 'aggregate')

    // Create a mock session object (just needs to exist, not be functional)
    const mockSession = {}

    const count = await Models.PluginMember.countUniqueMembers(uniqueDaoAddress, rawPluginMember.network!, {
      session: mockSession,
    } as any)

    // Verify that aggregate was called and session method was chained
    expect(aggregateSpy.calledOnce).to.be.true
    expect(count).to.eq(1)
  })

  it('should return 0 when no members exist for countUniqueMembers', async () => {
    const nonExistentDaoAddress = `0x${Date.now().toString(16).padEnd(40, '0')}`
    const count = await Models.PluginMember.countUniqueMembers(nonExistentDaoAddress, rawPluginMember.network!)
    expect(count).to.eq(0)
  })

  describe('findAndPaginate', () => {
    beforeEach(async () => {
      // Clean up before creating test data
      await Models.PluginMember.deleteMany({})
      await Models.Member.deleteMany({})
      await Models.Plugin.deleteMany({})
      await Models.PluginMetrics.deleteMany({})
      // Create a member first
      await Models.Member.create({
        address: rawPluginMember.memberAddress,
        ens: 'test.eth',
        avatar: 'avatar.png',
      })

      // Create plugin for reference
      await Models.Plugin.create({
        id: 'test-plugin',
        address: rawPluginMember.pluginAddress,
        daoAddress: rawPluginMember.daoAddress,
        network: rawPluginMember.network,
        interfaceType: 'tokenVoting',
        status: 'installed',
        transactionHash: '0xhash',
        blockNumber: 1000,
      })

      await Models.PluginMember.create(rawPluginMember)
    })

    it('should find and paginate plugin members with all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        pluginAddress: rawPluginMember.pluginAddress,
        network: rawPluginMember.network,
      }

      const aggregateSpy = sandbox.spy(Models.PluginMember, 'aggregate')

      const response = await Models.PluginMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(aggregateSpy.calledTwice).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawPluginMember.memberAddress)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should filter by daoAddress when provided', async () => {
      // Create another plugin member for different DAO and member
      const otherMemberAddress = '0x223456789012345678901234567890123456789A'
      await Models.Member.create({
        address: otherMemberAddress,
        ens: 'other.eth',
      })
      await Models.PluginMember.create({
        memberAddress: otherMemberAddress,
        pluginAddress: rawPluginMember.pluginAddress,
        daoAddress: '0xD23456789012345678901234567890123456789E',
        network: rawPluginMember.network,
      })

      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        daoAddress: rawPluginMember.daoAddress,
        network: rawPluginMember.network,
      }

      const response = await Models.PluginMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawPluginMember.memberAddress)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should apply search filter on member info', async () => {
      const searchableMemberAddress = '0x223456789012345678901234567890123456789A'
      const searchablePluginAddress = '0xC23456789012345678901234567890123456789D'

      await Models.Member.create({
        address: searchableMemberAddress,
        ens: 'searchable.eth',
      })

      // Create plugin first
      await Models.Plugin.create({
        id: 'searchable-plugin',
        address: searchablePluginAddress,
        daoAddress: rawPluginMember.daoAddress,
        network: rawPluginMember.network,
        interfaceType: 'tokenVoting',
        status: 'installed',
        transactionHash: '0xhash2',
        blockNumber: 1001,
      })

      // Create with different plugin to avoid conflicts
      await Models.PluginMember.create({
        memberAddress: searchableMemberAddress,
        pluginAddress: searchablePluginAddress,
        daoAddress: rawPluginMember.daoAddress,
        network: rawPluginMember.network,
      })

      const paginationParams = {
        search: 'searchable',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        pluginAddress: searchablePluginAddress,
        network: rawPluginMember.network,
      }

      const response = await Models.PluginMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].ens).to.eq('searchable.eth')
    })

    it('should return empty response when page exceeds total pages', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 999,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        pluginAddress: rawPluginMember.pluginAddress,
        network: rawPluginMember.network,
      }

      const paginateEmptyResponseSpy = sandbox.spy(ModelUtils, 'paginateEmptyResponse')

      const response = await Models.PluginMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(paginateEmptyResponseSpy.calledOnce).to.be.true
      expect(response.data).to.be.an('array').that.is.empty
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(0)
    })

    it('should include plugin metrics when pluginAddress is provided', async () => {
      // Create plugin metrics for the member
      await Models.PluginMetrics.create({
        memberAddress: rawPluginMember.memberAddress,
        pluginAddress: rawPluginMember.pluginAddress,
        network: rawPluginMember.network,
        voteCount: 10,
        proposalCount: 5,
        firstActivity: 1234567800,
        lastActivity: 1234567890,
      })

      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        pluginAddress: rawPluginMember.pluginAddress,
        network: rawPluginMember.network,
      }

      const response = await Models.PluginMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].metrics).to.exist
      expect(response.data[0].metrics.voteCount).to.eq(10)
      expect(response.data[0].metrics.proposalCount).to.eq(5)
    })

    it('should return null metrics when no plugin metrics exist', async () => {
      // Don't create any plugin metrics for this test
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        pluginAddress: rawPluginMember.pluginAddress,
        network: rawPluginMember.network,
      }

      const response = await Models.PluginMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].metrics).to.be.null
    })

    it('should handle empty result when no totalRecords exist', async () => {
      // Delete the plugin member to create an empty result scenario
      await Models.PluginMember.deleteMany({})

      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        pluginAddress: rawPluginMember.pluginAddress,
        network: rawPluginMember.network,
      }

      const response = await Models.PluginMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').that.is.empty
      expect(response.metadata.totalRecords).to.eq(0)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.pageSize).to.eq(10)
      expect(response.metadata.totalPages).to.eq(0)
    })
  })
})
