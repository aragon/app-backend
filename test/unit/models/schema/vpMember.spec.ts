import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import VpMember from '@models/schema/vpMember'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import ModelUtils from '@models/utils/models'

describe('Model: VpMember', () => {
  let sandbox: SinonSandbox
  let rawVpMember: Partial<VpMember>

  before(async () => {
    // Ensure models are loaded when running test directly
    const { ModelProxy } = await import('@src/models')
    await ModelProxy.setMongoModels()
  })

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawVpMember = {
      memberAddress: '0x123456789012345678901234567890123456789A',
      tokenAddress: '0xA23456789012345678901234567890123456789B',
      votingPower: '1000000',
      network: NetworksEnum.ethereumMainnet,
      tokenIds: ['1', '2', '3'],
      delegateReceivedCount: 5,
      lastVPBlockNumber: 1000000,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create VpMember', async () => {
    const entityId = Models.VpMember.getEntityId({
      network: rawVpMember.network!,
      tokenAddress: rawVpMember.tokenAddress!,
      memberAddress: rawVpMember.memberAddress!,
    })
    const vpMember = await Models.VpMember.create(rawVpMember)
    expect(vpMember.id).to.eq(entityId)
    expect(vpMember.memberAddress).to.eq(rawVpMember.memberAddress)
    expect(vpMember.tokenAddress).to.eq(rawVpMember.tokenAddress)
    expect(vpMember.votingPower).to.eq(rawVpMember.votingPower)
    expect(vpMember.network).to.eq(rawVpMember.network)
    expect(vpMember.tokenIds).to.deep.eq(rawVpMember.tokenIds)
    expect(vpMember.delegateReceivedCount).to.eq(rawVpMember.delegateReceivedCount)
    expect(vpMember.lastVPBlockNumber).to.eq(rawVpMember.lastVPBlockNumber)
  })

  it('Should create VpMember with default values', async () => {
    const minimalData = {
      memberAddress: '0x123456789012345678901234567890123456789A',
      tokenAddress: '0xA23456789012345678901234567890123456789B',
      network: NetworksEnum.ethereumMainnet,
    }
    const vpMember = await Models.VpMember.create(minimalData)
    expect(vpMember.votingPower).to.eq('0')
    expect(vpMember.tokenIds).to.deep.eq([])
    expect(vpMember.delegateReceivedCount).to.eq(0)
    expect(vpMember.lastVPBlockNumber).to.eq(0)
  })

  it('Should getEntityId', async () => {
    const params = {
      network: NetworksEnum.ethereumMainnet,
      tokenAddress: '0xToken',
      memberAddress: '0xMember',
    }
    const entityId = Models.VpMember.getEntityId(params)
    expect(entityId).to.eq(`${params.network}-${params.tokenAddress}-${params.memberAddress}`)
  })

  it('Should findExistingLog', async () => {
    const createdVpMember = await Models.VpMember.create(rawVpMember)
    const foundVpMember = await Models.VpMember.findExistingLog({
      network: rawVpMember.network!,
      tokenAddress: rawVpMember.tokenAddress!,
      memberAddress: rawVpMember.memberAddress!,
    })
    expect(foundVpMember?.id).to.eq(createdVpMember.id)
  })

  it('Should findByEntityId', async () => {
    const createdVpMember = await Models.VpMember.create(rawVpMember)
    const foundVpMember = await Models.VpMember.findByEntityId(createdVpMember.id)
    expect(foundVpMember?.id).to.eq(createdVpMember.id)
  })

  it('should findByTokenAndMember', async () => {
    const createdVpMember = await Models.VpMember.create(rawVpMember)
    const vpMember = await Models.VpMember.findByTokenAndMember(
      rawVpMember.network!,
      rawVpMember.tokenAddress!,
      rawVpMember.memberAddress!,
    )
    expect(vpMember?.id).to.eq(createdVpMember.id)
  })

  it('should findByToken', async () => {
    await Models.VpMember.create(rawVpMember)
    const anotherMember = {
      ...rawVpMember,
      memberAddress: '0x223456789012345678901234567890123456789A',
    }
    await Models.VpMember.create(anotherMember)

    const vpMembers = await Models.VpMember.findByToken(rawVpMember.network!, rawVpMember.tokenAddress!)
    expect(vpMembers).to.have.lengthOf(2)
    expect(vpMembers[0].tokenAddress).to.eq(rawVpMember.tokenAddress)
    expect(vpMembers[1].tokenAddress).to.eq(rawVpMember.tokenAddress)
  })

  it('should findByMember', async () => {
    await Models.VpMember.create(rawVpMember)
    const anotherToken = {
      ...rawVpMember,
      tokenAddress: '0xB23456789012345678901234567890123456789B',
    }
    await Models.VpMember.create(anotherToken)

    const vpMembers = await Models.VpMember.findByMember(rawVpMember.network!, rawVpMember.memberAddress!)
    expect(vpMembers).to.have.lengthOf(2)
    expect(vpMembers[0].memberAddress).to.eq(rawVpMember.memberAddress)
    expect(vpMembers[1].memberAddress).to.eq(rawVpMember.memberAddress)
  })

  it('should update VpMember', async () => {
    const vpMember = await Models.VpMember.create(rawVpMember)
    const updatedVpMember = await vpMember.update({
      votingPower: '2000000',
      tokenIds: ['1', '2', '3', '4'],
      delegateReceivedCount: 10,
    })
    expect(updatedVpMember.votingPower).to.eq('2000000')
    expect(updatedVpMember.tokenIds).to.deep.eq(['1', '2', '3', '4'])
    expect(updatedVpMember.delegateReceivedCount).to.eq(10)
  })

  it('Should reload', async () => {
    const createdVpMember = await Models.VpMember.create(rawVpMember)
    await createdVpMember.reload()

    expect(createdVpMember.memberAddress).to.eq(rawVpMember.memberAddress)
  })

  describe('countHoldersWithVotingPower', () => {
    it('should count holders with voting power > 0', async () => {
      // Create members with different voting powers
      await Models.VpMember.create(rawVpMember) // votingPower: '1000000'
      await Models.VpMember.create({
        ...rawVpMember,
        memberAddress: '0x223456789012345678901234567890123456789A',
        votingPower: '500000',
      })
      await Models.VpMember.create({
        ...rawVpMember,
        memberAddress: '0x323456789012345678901234567890123456789A',
        votingPower: '0',
      })

      const count = await Models.VpMember.countHoldersWithVotingPower(rawVpMember.tokenAddress!, rawVpMember.network!)
      expect(count).to.eq(2)
    })

    it('should return 0 when no holders have voting power', async () => {
      await Models.VpMember.create({
        ...rawVpMember,
        votingPower: '0',
      })
      await Models.VpMember.create({
        ...rawVpMember,
        memberAddress: '0x223456789012345678901234567890123456789A',
        votingPower: '0',
      })

      const count = await Models.VpMember.countHoldersWithVotingPower(rawVpMember.tokenAddress!, rawVpMember.network!)
      expect(count).to.eq(0)
    })

    it('should filter by tokenAddress and network', async () => {
      await Models.VpMember.create(rawVpMember)
      await Models.VpMember.create({
        ...rawVpMember,
        tokenAddress: '0xDifferentToken',
      })
      await Models.VpMember.create({
        ...rawVpMember,
        network: NetworksEnum.polygonMainnet,
      })

      const count = await Models.VpMember.countHoldersWithVotingPower(rawVpMember.tokenAddress!, rawVpMember.network!)
      expect(count).to.eq(1)
    })
  })

  describe('findAndPaginate', () => {
    beforeEach(async () => {
      // Create a member first
      await Models.Member.create({
        address: rawVpMember.memberAddress,
        ens: 'test.eth',
        avatar: 'avatar.png',
      })

      await Models.VpMember.create(rawVpMember)
    })

    it('should find and paginate vpMembers with all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'votingPower',
      }

      const extraParams = {
        tokenAddress: rawVpMember.tokenAddress,
        network: rawVpMember.network,
      }

      const aggregateSpy = sandbox.spy(Models.VpMember, 'aggregate')

      const response = await Models.VpMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(aggregateSpy.calledTwice).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawVpMember.memberAddress)
      expect(response.data[0].votingPower).to.eq(rawVpMember.votingPower)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should filter by votingPower > 0', async () => {
      // Create a member with 0 voting power
      await Models.Member.create({
        address: '0x223456789012345678901234567890123456789A',
        ens: 'zero.eth',
      })
      await Models.VpMember.create({
        ...rawVpMember,
        memberAddress: '0x223456789012345678901234567890123456789A',
        votingPower: '0',
      })

      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'votingPower',
      }

      const extraParams = {
        tokenAddress: rawVpMember.tokenAddress,
        network: rawVpMember.network,
      }

      const response = await Models.VpMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawVpMember.memberAddress)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should apply search filter on member info', async () => {
      await Models.Member.create({
        address: '0x223456789012345678901234567890123456789A',
        ens: 'searchable.eth',
      })
      await Models.VpMember.create({
        ...rawVpMember,
        memberAddress: '0x223456789012345678901234567890123456789A',
      })

      const paginationParams = {
        search: 'searchable',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'votingPower',
      }

      const extraParams = {
        tokenAddress: rawVpMember.tokenAddress,
        network: rawVpMember.network,
      }

      const response = await Models.VpMember.findAndPaginate({
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
        sort: 'votingPower',
      }

      const extraParams = {
        tokenAddress: rawVpMember.tokenAddress,
        network: rawVpMember.network,
      }

      const paginateEmptyResponseSpy = sandbox.spy(ModelUtils, 'paginateEmptyResponse')

      const response = await Models.VpMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(paginateEmptyResponseSpy.calledOnce).to.be.true
      expect(response.data).to.be.an('array').that.is.empty
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(0)
    })
  })
})
