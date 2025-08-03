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

  before(async () => {
    // Ensure models are loaded when running test directly
    const { ModelProxy } = await import('@src/models')
    await ModelProxy.setMongoModels()
  })

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawPluginMember = {
      memberAddress: '0x123456789012345678901234567890123456789A',
      pluginAddress: '0xA23456789012345678901234567890123456789B',
      daoAddress: '0xB23456789012345678901234567890123456789C',
      network: NetworksEnum.ethereumMainnet,
    }
  })

  afterEach(() => {
    sandbox?.restore()
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
    await Models.PluginMember.create(rawPluginMember)
    const anotherMember = {
      ...rawPluginMember,
      memberAddress: '0x223456789012345678901234567890123456789A',
    }
    await Models.PluginMember.create(anotherMember)

    const pluginMembers = await Models.PluginMember.findAllMembersOfPlugin({
      pluginAddress: rawPluginMember.pluginAddress!,
      network: rawPluginMember.network!,
    })
    expect(pluginMembers).to.have.lengthOf(2)
    expect(pluginMembers[0].pluginAddress).to.eq(rawPluginMember.pluginAddress)
    expect(pluginMembers[1].pluginAddress).to.eq(rawPluginMember.pluginAddress)
  })

  it('should findAllMembersOfDao', async () => {
    await Models.PluginMember.create(rawPluginMember)
    const anotherMember = {
      ...rawPluginMember,
      memberAddress: '0x223456789012345678901234567890123456789A',
    }
    await Models.PluginMember.create(anotherMember)

    const daoMembers = await Models.PluginMember.findAllMembersOfDao({
      daoAddress: rawPluginMember.daoAddress!,
      network: rawPluginMember.network!,
    })
    expect(daoMembers).to.have.lengthOf(2)
    expect(daoMembers[0].daoAddress).to.eq(rawPluginMember.daoAddress)
    expect(daoMembers[1].daoAddress).to.eq(rawPluginMember.daoAddress)
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

  describe('findAndPaginate', () => {
    beforeEach(async () => {
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
      // Create another plugin member for different DAO
      await Models.Member.create({
        address: '0x223456789012345678901234567890123456789A',
        ens: 'other.eth',
      })
      await Models.PluginMember.create({
        ...rawPluginMember,
        memberAddress: '0x223456789012345678901234567890123456789A',
        daoAddress: '0xOtherDao',
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
      await Models.Member.create({
        address: '0x223456789012345678901234567890123456789A',
        ens: 'searchable.eth',
      })
      await Models.PluginMember.create({
        ...rawPluginMember,
        memberAddress: '0x223456789012345678901234567890123456789A',
      })

      const paginationParams = {
        search: 'searchable',
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
  })
})
