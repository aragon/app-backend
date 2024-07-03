import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { NetworksEnum } from '@types'
import Member from '@models/schema/member'
import { afterEach, beforeEach } from 'mocha'
import { expect } from 'chai'
import { Models } from '@dbModels'
import ModelUtils from '@models/utils/models'

describe('Model: Member', () => {
  let sandbox: SinonSandbox
  let rawMember: Partial<Member>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawMember = {
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      ens: undefined,
      history: [
        {
          network: NetworksEnum.ethereumMainnet,
          daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          tokenAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
          fromBlockNumber: 1,
          toBlockNumber: 2,
          fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          toTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          votingPower: '100',
          pluginSubdomain: 'token-voting',
        },
      ],
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should create Member', async () => {
    const entityId = Models.Member.getEntityId({ address: rawMember.address! })
    const member = await Models.Member.create(rawMember)
    expect(member.id).to.eq(entityId)
    expect(member.address).to.eq(rawMember.address)
    expect(member.ens).to.be.null
    expect(member.history.length).to.eq(1)
    expect(member.history[0].daoAddress).to.eq(rawMember?.history?.[0].daoAddress)
    expect(member.history[0].tokenAddress).to.eq(rawMember?.history?.[0].tokenAddress)
    expect(member.history[0].pluginAddress).to.eq(rawMember?.history?.[0].pluginAddress)
    expect(member.history[0].network).to.eq(rawMember?.history?.[0].network)
    expect(member.history[0].fromTxHash).to.eq(rawMember?.history?.[0].fromTxHash)
    expect(member.history[0].fromBlockNumber).to.eq(rawMember?.history?.[0].fromBlockNumber)
    expect(member.history[0].toBlockNumber).to.eq(rawMember?.history?.[0].toBlockNumber)
    expect(member.history[0].toTxHash).to.eq(rawMember?.history?.[0].toTxHash)
    expect(member.history[0].delegateToAddress).to.eq(rawMember?.history?.[0].delegateFromAddress)
    expect(member.history[0].delegateFromAddress).to.eq(rawMember?.history?.[0].delegateToAddress)
    expect(member.history[0].votingPower).to.eq(rawMember?.history?.[0].votingPower)
    expect(member.history[0].pluginSubdomain).to.eq(rawMember?.history?.[0].pluginSubdomain)
  })

  it('Should getEntityId', async () => {
    const address = '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969'
    const entityId = Models.Member.getEntityId({ address })
    expect(entityId).to.eq(`${address}`)
  })

  it('Should findExistingLog', async () => {
    const createdLogDao = await Models.Member.create(rawMember)
    const foundLogDao = await Models.Member.findExistingLog({
      address: createdLogDao.address!,
    })
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  it('Should findByEntityId', async () => {
    const createdLogDao = await Models.Member.create(rawMember)
    const foundLogDao = await Models.Member.findByEntityId(createdLogDao.id)
    expect(foundLogDao?.id).to.eq(createdLogDao.id)
  })

  describe('Pagination', () => {
    beforeEach(async () => {
      const rawDao = {
        network: NetworksEnum.ethereumMainnet,
        daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        tokenAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
        fromBlockNumber: 1,
        toBlockNumber: 2,
        fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        toTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        votingPower: '100',
        pluginSubdomain: 'token-voting',
      }

      const members = [
        {
          address: '0x17366cae2b9c6c3055e9e3c78936a69006be5408',
          history: [rawDao],
        },
        {
          address: '0x17366cae2b9c6c3055e9e3c78936a69006be5407',
          history: [rawDao],
        },
        {
          address: '0x17366cae2b9c6c3055e9e3c78936a69006be5404',
          history: [{ ...rawDao, ...{ toBlockNumber: null, toTxHash: null } }],
        },
      ]

      await Promise.all(members.map(member => Models.Member.create(member)))
    })

    it('should find with pagination', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Member.findWithPagination({
        extraParams: {},
        paginationParams: {},
      })

      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination with onlyActive', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Member.findWithPagination({
        extraParams: { onlyActive: true, daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409' },
        paginationParams: {},
      })

      expect(data.length).to.eq(1)
      expect(totalRecords).to.eq(1)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination with daoAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Member.findWithPagination({
        extraParams: { daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409' },
        paginationParams: {},
      })

      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination with pluginAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Member.findWithPagination({
        extraParams: { pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409' },
        paginationParams: {},
      })

      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination empty result', async () => {
      const spyUtils = sandbox.spy(ModelUtils, 'paginateEmptyResponse')
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Member.findWithPagination({
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

  describe('findActiveWithPagination', () => {
    beforeEach(async () => {
      const rawDao = {
        network: NetworksEnum.ethereumMainnet,
        daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        tokenAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
        fromBlockNumber: 1,
        toBlockNumber: null,
        fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        toTxHash: null,
        delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        votingPower: '100',
        pluginSubdomain: 'token-voting',
      }

      const members = [
        {
          address: '0x17366cae2b9c6c3055e9e3c78936a69006be5408',
          history: [rawDao],
        },
        {
          address: '0x17366cae2b9c6c3055e9e3c78936a69006be5407',
          history: [rawDao],
        },
        {
          address: '0x17366cae2b9c6c3055e9e3c78936a69006be5404',
          history: [{ ...rawDao, ...{ toBlockNumber: null, toTxHash: null } }],
        },
      ]

      await Promise.all(members.map(member => Models.Member.create(member)))
    })

    it('should find with pagination', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Member.findActiveWithPagination({
        extraParams: {},
        paginationParams: {},
      })

      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination with pluginAddress', async () => {
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Member.findActiveWithPagination({
        extraParams: {
          pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
          network: NetworksEnum.ethereumMainnet,
        },
        paginationParams: {},
      })

      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)
      expect(page).to.eq(1)
      expect(totalPages).to.eq(1)
      expect(pageSize).to.eq(10)
    })

    it('should find with pagination empty result', async () => {
      const spyUtils = sandbox.spy(ModelUtils, 'paginateEmptyResponse')
      const {
        data,
        metadata: { totalRecords, page, pageSize, totalPages },
      } = await Models.Member.findActiveWithPagination({
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

  it('should findActiveMember', async () => {
    const dbMember = await Models.Member.create(rawMember)
    const member = await Models.Member.findActiveMember(dbMember.address!, {})
    expect(member.address).to.eq(dbMember.address)
  })

  it('should update Member', async () => {
    const member = await Models.Member.create(rawMember)
    const updatedMember = await member.update({ address: '0x00' })
    expect(updatedMember.address).to.eq('0x00')
  })

  it('Should reload', async () => {
    const createdLogDao = await Models.Member.create(rawMember)
    await createdLogDao.reload()

    expect(createdLogDao.address).to.eq(rawMember.address)
  })

  it('Should filterKeys', async () => {
    const createdDao = await Models.Member.create(rawMember)
    const filterDao = createdDao.filterKeys()

    expect(filterDao.history).to.exist
    expect(filterDao.id).to.be.undefined
    expect(filterDao._id).to.be.undefined
    expect(filterDao.__v).to.be.undefined
    expect(filterDao.createdAt).to.be.undefined
    expect(filterDao.updatedAt).to.be.undefined
    expect(Object.keys(filterDao).length).to.eq(3)
    expect(Object.keys(filterDao.history[0]).length).to.eq(12)
  })

  it('Should filterMemberOnlyKeys', async () => {
    const createdDao = await Models.Member.create(rawMember)
    const filterDao = createdDao.filterMemberOnlyKeys()

    expect(filterDao.id).to.be.undefined
    expect(filterDao._id).to.be.undefined
    expect(filterDao.__v).to.be.undefined
    expect(filterDao.history).to.be.undefined
    expect(filterDao.createdAt).to.be.undefined
    expect(filterDao.updatedAt).to.be.undefined
    expect(Object.keys(filterDao).length).to.eq(2)
  })
})
