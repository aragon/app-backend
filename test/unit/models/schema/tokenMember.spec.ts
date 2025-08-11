import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import TokenMember from '@models/schema/tokenMember'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import ModelUtils from '@models/utils/models'

describe('Model: TokenMember', () => {
  let sandbox: SinonSandbox
  let rawTokenMember: Partial<TokenMember>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawTokenMember = {
      memberAddress: '0x123456789012345678901234567890123456789A',
      tokenAddress: '0xA23456789012345678901234567890123456789B',
      votingPower: '1000000',
      network: NetworksEnum.ethereumMainnet,
      tokenIds: ['1', '2', '3'],
      delegateReceivedCount: 5,
      lastVPBlockNumber: 1000000,
    }
  })

  afterEach(async () => {
    sandbox?.restore()
    // Clean up database to prevent duplicate key errors
    await Models.TokenMember.deleteMany({})
    await Models.Member.deleteMany({})
  })

  it('Should create TokenMember', async () => {
    const entityId = Models.TokenMember.getEntityId({
      network: rawTokenMember.network!,
      tokenAddress: rawTokenMember.tokenAddress!,
      memberAddress: rawTokenMember.memberAddress!,
    })
    const tokenMember = await Models.TokenMember.create(rawTokenMember)
    expect(tokenMember.id).to.eq(entityId)
    expect(tokenMember.memberAddress).to.eq(rawTokenMember.memberAddress)
    expect(tokenMember.tokenAddress).to.eq(rawTokenMember.tokenAddress)
    expect(tokenMember.votingPower).to.eq(rawTokenMember.votingPower)
    expect(tokenMember.network).to.eq(rawTokenMember.network)
    expect(tokenMember.tokenIds).to.deep.eq(rawTokenMember.tokenIds)
    expect(tokenMember.delegateReceivedCount).to.eq(rawTokenMember.delegateReceivedCount)
    expect(tokenMember.lastVPBlockNumber).to.eq(rawTokenMember.lastVPBlockNumber)
  })

  it('Should create TokenMember with default values', async () => {
    const minimalData = {
      memberAddress: '0x123456789012345678901234567890123456789A',
      tokenAddress: '0xA23456789012345678901234567890123456789B',
      network: NetworksEnum.ethereumMainnet,
    }
    const tokenMember = await Models.TokenMember.create(minimalData)
    expect(tokenMember.votingPower).to.eq('0')
    expect(tokenMember.tokenIds).to.deep.eq([])
    expect(tokenMember.delegateReceivedCount).to.eq(0)
    expect(tokenMember.lastVPBlockNumber).to.eq(0)
  })

  it('Should getEntityId', async () => {
    const params = {
      network: NetworksEnum.ethereumMainnet,
      tokenAddress: '0xToken',
      memberAddress: '0xMember',
    }
    const entityId = Models.TokenMember.getEntityId(params)
    expect(entityId).to.eq(`${params.network}-${params.tokenAddress}-${params.memberAddress}`)
  })

  it('Should findExistingLog', async () => {
    const createdTokenMember = await Models.TokenMember.create(rawTokenMember)
    const foundTokenMember = await Models.TokenMember.findExistingLog({
      network: rawTokenMember.network!,
      tokenAddress: rawTokenMember.tokenAddress!,
      memberAddress: rawTokenMember.memberAddress!,
    })
    expect(foundTokenMember?.id).to.eq(createdTokenMember.id)
  })

  it('Should findByEntityId', async () => {
    const createdTokenMember = await Models.TokenMember.create(rawTokenMember)
    const foundTokenMember = await Models.TokenMember.findByEntityId(createdTokenMember.id)
    expect(foundTokenMember?.id).to.eq(createdTokenMember.id)
  })

  it('should findByTokenAndMember', async () => {
    const createdTokenMember = await Models.TokenMember.create(rawTokenMember)
    const tokenMember = await Models.TokenMember.findByTokenAndMember(
      rawTokenMember.network!,
      rawTokenMember.tokenAddress!,
      rawTokenMember.memberAddress!,
    )
    expect(tokenMember?.id).to.eq(createdTokenMember.id)
  })

  it('should findByToken', async () => {
    await Models.TokenMember.create(rawTokenMember)
    const anotherMember = {
      memberAddress: '0x223456789012345678901234567890123456789A',
      tokenAddress: rawTokenMember.tokenAddress,
      votingPower: '500000',
      network: rawTokenMember.network,
      tokenIds: ['4', '5'],
      delegateReceivedCount: 2,
      lastVPBlockNumber: 1000001,
    }
    await Models.TokenMember.create(anotherMember)

    const tokenMembers = await Models.TokenMember.findByToken(rawTokenMember.network!, rawTokenMember.tokenAddress!)
    expect(tokenMembers).to.have.lengthOf(2)
    expect(tokenMembers[0].tokenAddress).to.eq(rawTokenMember.tokenAddress)
    expect(tokenMembers[1].tokenAddress).to.eq(rawTokenMember.tokenAddress)
  })

  it('should findByMember', async () => {
    await Models.TokenMember.create(rawTokenMember)
    const anotherToken = {
      memberAddress: rawTokenMember.memberAddress,
      tokenAddress: '0xB23456789012345678901234567890123456789B',
      votingPower: '750000',
      network: rawTokenMember.network,
      tokenIds: ['6', '7'],
      delegateReceivedCount: 3,
      lastVPBlockNumber: 1000002,
    }
    await Models.TokenMember.create(anotherToken)

    const tokenMembers = await Models.TokenMember.findByMember(rawTokenMember.network!, rawTokenMember.memberAddress!)
    expect(tokenMembers).to.have.lengthOf(2)
    expect(tokenMembers[0].memberAddress).to.eq(rawTokenMember.memberAddress)
    expect(tokenMembers[1].memberAddress).to.eq(rawTokenMember.memberAddress)
  })

  it('should update TokenMember', async () => {
    const tokenMember = await Models.TokenMember.create(rawTokenMember)
    const updatedTokenMember = await tokenMember.update({
      votingPower: '2000000',
      tokenIds: ['1', '2', '3', '4'],
      delegateReceivedCount: 10,
    })
    expect(updatedTokenMember.votingPower).to.eq('2000000')
    expect(updatedTokenMember.tokenIds).to.deep.eq(['1', '2', '3', '4'])
    expect(updatedTokenMember.delegateReceivedCount).to.eq(10)
  })

  it('Should reload', async () => {
    const createdTokenMember = await Models.TokenMember.create(rawTokenMember)
    await createdTokenMember.reload()

    expect(createdTokenMember.memberAddress).to.eq(rawTokenMember.memberAddress)
  })

  describe('countHoldersWithVotingPower', () => {
    it('should count holders with voting power > 0', async () => {
      // Create members with different voting powers
      await Models.TokenMember.create(rawTokenMember) // votingPower: '1000000'
      await Models.TokenMember.create({
        memberAddress: '0x223456789012345678901234567890123456789A',
        tokenAddress: rawTokenMember.tokenAddress,
        votingPower: '500000',
        network: rawTokenMember.network,
        tokenIds: ['4'],
        delegateReceivedCount: 1,
        lastVPBlockNumber: 1000001,
      })
      await Models.TokenMember.create({
        memberAddress: '0x323456789012345678901234567890123456789A',
        tokenAddress: rawTokenMember.tokenAddress,
        votingPower: '0',
        network: rawTokenMember.network,
        tokenIds: [],
        delegateReceivedCount: 0,
        lastVPBlockNumber: 1000002,
      })

      const count = await Models.TokenMember.countHoldersWithVotingPower(rawTokenMember.tokenAddress!, rawTokenMember.network!)
      expect(count).to.eq(2)
    })

    it('should return 0 when no holders have voting power', async () => {
      await Models.TokenMember.create({
        memberAddress: rawTokenMember.memberAddress,
        tokenAddress: rawTokenMember.tokenAddress,
        votingPower: '0',
        network: rawTokenMember.network,
        tokenIds: [],
        delegateReceivedCount: 0,
        lastVPBlockNumber: 1000000,
      })
      await Models.TokenMember.create({
        memberAddress: '0x223456789012345678901234567890123456789A',
        tokenAddress: rawTokenMember.tokenAddress,
        votingPower: '0',
        network: rawTokenMember.network,
        tokenIds: [],
        delegateReceivedCount: 0,
        lastVPBlockNumber: 1000001,
      })

      const count = await Models.TokenMember.countHoldersWithVotingPower(rawTokenMember.tokenAddress!, rawTokenMember.network!)
      expect(count).to.eq(0)
    })

    it('should filter by tokenAddress and network', async () => {
      await Models.TokenMember.create(rawTokenMember)
      await Models.TokenMember.create({
        memberAddress: '0x223456789012345678901234567890123456789A',
        tokenAddress: '0xDifferentToken',
        votingPower: '1000000',
        network: rawTokenMember.network,
        tokenIds: ['4'],
        delegateReceivedCount: 1,
        lastVPBlockNumber: 1000001,
      })
      await Models.TokenMember.create({
        memberAddress: '0x323456789012345678901234567890123456789A',
        tokenAddress: rawTokenMember.tokenAddress,
        votingPower: '1000000',
        network: NetworksEnum.polygonMainnet,
        tokenIds: ['5'],
        delegateReceivedCount: 1,
        lastVPBlockNumber: 1000002,
      })

      const count = await Models.TokenMember.countHoldersWithVotingPower(rawTokenMember.tokenAddress!, rawTokenMember.network!)
      expect(count).to.eq(1)
    })
  })

  describe('findAndPaginate', () => {
    beforeEach(async () => {
      // Create a member first
      await Models.Member.create({
        address: rawTokenMember.memberAddress,
        ens: 'test.eth',
        avatar: 'avatar.png',
      })

      await Models.TokenMember.create(rawTokenMember)
    })

    it('should find and paginate tokenMembers with all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'votingPower',
      }

      const extraParams = {
        tokenAddress: rawTokenMember.tokenAddress,
        network: rawTokenMember.network,
      }

      const aggregateSpy = sandbox.spy(Models.TokenMember, 'aggregate')

      const response = await Models.TokenMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(aggregateSpy.calledTwice).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawTokenMember.memberAddress)
      expect(response.data[0].votingPower).to.eq(Number(rawTokenMember.votingPower))
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
      await Models.TokenMember.create({
        memberAddress: '0x223456789012345678901234567890123456789A',
        tokenAddress: rawTokenMember.tokenAddress,
        votingPower: '0',
        network: rawTokenMember.network,
        tokenIds: [],
        delegateReceivedCount: 0,
        lastVPBlockNumber: 1000001,
      })

      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'votingPower',
      }

      const extraParams = {
        tokenAddress: rawTokenMember.tokenAddress,
        network: rawTokenMember.network,
      }

      const response = await Models.TokenMember.findAndPaginate({
        paginationParams,
        extraParams,
      })

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawTokenMember.memberAddress)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should apply search filter on member info', async () => {
      await Models.Member.create({
        address: '0x223456789012345678901234567890123456789A',
        ens: 'searchable.eth',
      })
      await Models.TokenMember.create({
        memberAddress: '0x223456789012345678901234567890123456789A',
        tokenAddress: rawTokenMember.tokenAddress,
        votingPower: '750000',
        network: rawTokenMember.network,
        tokenIds: ['4'],
        delegateReceivedCount: 1,
        lastVPBlockNumber: 1000001,
      })

      const paginationParams = {
        search: 'searchable',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'votingPower',
      }

      const extraParams = {
        tokenAddress: rawTokenMember.tokenAddress,
        network: rawTokenMember.network,
      }

      const response = await Models.TokenMember.findAndPaginate({
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
        tokenAddress: rawTokenMember.tokenAddress,
        network: rawTokenMember.network,
      }

      const paginateEmptyResponseSpy = sandbox.spy(ModelUtils, 'paginateEmptyResponse')

      const response = await Models.TokenMember.findAndPaginate({
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
