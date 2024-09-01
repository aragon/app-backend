import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum } from '@types'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import ModelUtils from '@models/utils/models'
import Vote from '@models/schema/vote'
import { FakeVote } from '@test/mock/fakeVote'

describe('Model: Vote', () => {
  let sandbox: SinonSandbox
  let rawVote: Partial<Vote>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawVote = {
      ...FakeVote,
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create Vote', async () => {
    it('Should create Vote', async () => {
      const entityId = Models.Vote.getEntityId({
        network: rawVote.network!,
        transactionHash: rawVote.transactionHash!,
        pluginAddress: rawVote.pluginAddress!,
        proposalIndex: rawVote.proposalIndex!,
      })
      const vote = await Models.Vote.create(rawVote)
      expect(vote.id).to.eq(entityId)
      expect(vote.transactionHash).to.eq(rawVote.transactionHash)
      expect(vote.blockNumber).to.eq(rawVote.blockNumber)
      expect(vote.blockTimestamp).to.eq(rawVote.blockTimestamp)
      expect(vote.voteOption).to.eq(rawVote.voteOption)
      expect(vote.votingPower).to.eq(rawVote.votingPower)
      expect(vote.daoAddress).to.eq(rawVote.daoAddress)
      expect(vote.pluginAddress).to.eq(rawVote.pluginAddress)
      expect(vote.memberAddress).to.eq(rawVote.memberAddress)
      expect(vote.proposalIndex).to.eq(rawVote.proposalIndex)
    })

    it('should update Vote', async () => {
      const vote = await Models.Vote.create(rawVote)
      const updatedVote = await vote.update({ memberAddress: '0x00' })
      expect(updatedVote.memberAddress).to.eq('0x00')
    })

    it('Should getEntityId', async () => {
      const entityId = Models.Vote.getEntityId({
        network: rawVote.network!,
        transactionHash: rawVote.transactionHash!,
        pluginAddress: rawVote.pluginAddress!,
        proposalIndex: rawVote.proposalIndex!,
      })
      expect(entityId).to.eq(
        `${rawVote.network}-${rawVote.transactionHash}-${rawVote.pluginAddress}-${rawVote.proposalIndex}`,
      )
    })

    it('Should findExistingLog', async () => {
      const createdVote = await Models.Vote.create(rawVote)
      const foundVote = await Models.Vote.findExistingLog({
        network: rawVote.network!,
        transactionHash: rawVote.transactionHash!,
        pluginAddress: rawVote.pluginAddress!,
        proposalIndex: rawVote.proposalIndex!,
      })
      expect(foundVote?.id).to.eq(createdVote.id)
    })

    it('should reload Vote', async () => {
      const createdVote = await Models.Vote.create(rawVote)
      const foundVote = await createdVote.reload()
      expect(foundVote?.id).to.eq(createdVote.id)
    })
  })

  it('Should getEntityId', async () => {
    const network = NetworksEnum.ethereumSepolia
    const transactionHash = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const pluginAddress = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1960'
    const proposalIndex = 1
    const entityId = Models.Vote.getEntityId({
      network,
      transactionHash,
      pluginAddress,
      proposalIndex,
    })
    expect(entityId).to.eq(`${network}-${transactionHash}-${pluginAddress}-${proposalIndex}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.Vote.create(rawVote)
    const foundLogDao = await Models.Vote.findExistingLog({
      network: rawVote.network!,
      transactionHash: rawVote.transactionHash!,
      pluginAddress: rawVote.pluginAddress!,
      proposalIndex: rawVote.proposalIndex!,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.Vote.create(rawVote)
    const foundLogDao = await Models.Vote.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  describe('Pagination', () => {
    beforeEach(async () => {
      const votes = [
        {
          network: NetworksEnum.ethereumSepolia,
          pluginAddress: '0x8B7AfAA4BD333dEE5fDbE0e3B6D89121e05d4D2F',
          proposalIndex: 3,
          memberAddress: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
          transactionHash: '0x2cfefef4716452284b5c3152d3cc112d1512c9c2faf5e67347d6d4d2c03bd22d',
          blockTimestamp: 1219577223,
          blockNumber: 4879275,
          daoAddress: '0xDb8a4b71D328F4B883Ea891a038519Afe07F3804',
          token: null,
        },
        {
          network: NetworksEnum.ethereumSepolia,
          pluginAddress: '0x8B7AfAA4BD333dEE5fDbE0e3B6D89121e05d4D20',
          proposalIndex: 3,
          memberAddress: '0x284803C34A3F049f787E2562e6F8C084bdBC3193',
          voteOption: 2,
          votingPower: '4000000000000000000',
          transactionHash: '0x2cfefef4716452284b5c3152d3cc112d1512c9c2faf5e67347d6d4d2c03bd221',
          blockTimestamp: 1219577223,
          blockNumber: 4879275,
          daoAddress: '0xDb8a4b71D328F4B883Ea891a038519Afe07F3800',
          tokenAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        },
        {
          network: NetworksEnum.ethereumSepolia,
          pluginAddress: '0x8B7AfAA4BD333dEE5fDbE0e3B6D89121e05d4D21',
          proposalIndex: 3,
          memberAddress: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
          voteOption: 2,
          votingPower: '4000000000000000000',
          transactionHash: '0x2cfefef4716452284b5c3152d3cc112d1512c9c2faf5e67347d6d4d2c03bd22d',
          blockTimestamp: 1219577223,
          blockNumber: 4879275,
          daoAddress: '0xDb8a4b71D328F4B883Ea891a038519Afe07F3801',
          tokenAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        },
      ]

      await Promise.all(votes.map(vote => Models.Vote.create(vote)))
    })

    it('should find with pagination', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Vote.findWithPagination({
        extraParams: {
          includeInfo: true,
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination with daoAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Vote.findWithPagination({
        extraParams: { daoAddress: '0xDb8a4b71D328F4B883Ea891a038519Afe07F3804' },
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination with pluginAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Vote.findWithPagination({
        extraParams: { pluginAddress: '0x8B7AfAA4BD333dEE5fDbE0e3B6D89121e05d4D20' },
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination with tokenAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Vote.findWithPagination({
        extraParams: { tokenAddress: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F' },
        paginationParams: {},
      })

      expect(data.length).to.eq(2)
      expect(totalRecords).to.eq(2)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination empty result', async () => {
      const spyUtils = sandbox.spy(ModelUtils, 'paginateEmptyResponse')
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Vote.findWithPagination({
        extraParams: { pluginAddress: '0x0000000000000000000000000000000000000000' },
        paginationParams: {},
      })

      expect(spyUtils.calledOnce).to.be.true
      expect(data.length).to.eq(0)
      expect(totalRecords).to.eq(0)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.Vote.create(rawVote)
    await createdLogDao.reload()

    expect(createdLogDao.memberAddress).to.eq(rawVote.memberAddress)
  })
})
