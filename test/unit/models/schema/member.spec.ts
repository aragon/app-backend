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
    const address = '0x17366cae2b9c6c3055e9e3c78936a69006be5409'

    rawMember = {
      address,
      daos: [
        {
          daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          network: NetworksEnum.mainnet,
          pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
          fromBlockNumber: 1,
          toBlockNumber: 2,
          fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          toTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          votingPower: '100',
        },
      ],
    }
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Create Member', async () => {
    it('Should create Member', async () => {
      const member = await Models.Member.create(rawMember)
      expect(member.entityId).to.exist
    })

    it('should update Member', async () => {
      const member = await Models.Member.create(rawMember)
      const updatedMember = await member.update({ address: '0x00' })
      expect(updatedMember.address).to.eq('0x00')
    })

    it('Should getEntityId', async () => {
      const entityId = await Models.Member.getEntityId(rawMember.address)
      expect(entityId).to.eq(`${rawMember.address}`)
    })

    it('Should findExistingLog', async () => {
      const createdMember = await Models.Member.create(rawMember)
      const foundMember = await Models.Member.findExistingLog(rawMember.address)
      expect(foundMember?.entityId).to.eq(createdMember.entityId)
    })

    it('should reload Member', async () => {
      const createdMember = await Models.Member.create(rawMember)
      const foundMember = await createdMember.reload()
      expect(foundMember?.entityId).to.eq(createdMember.entityId)
    })
  })

  describe('Pagination', () => {
    beforeEach(async () => {
      const rawDao = {
        daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        network: NetworksEnum.mainnet,
        pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
        fromBlockNumber: 1,
        toBlockNumber: 2,
        fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        toTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
        votingPower: '100',
      }

      const members = [
        {
          address: '0x17366cae2b9c6c3055e9e3c78936a69006be5408',
          daos: [rawDao],
        },
        {
          address: '0x17366cae2b9c6c3055e9e3c78936a69006be5407',
          daos: [rawDao],
        },
        {
          address: '0x17366cae2b9c6c3055e9e3c78936a69006be5404',
          daos: [rawDao],
        },
      ]

      await Promise.all(members.map(member => Models.Member.create(member)))
    })

    it('should find with pagination', async () => {
      const {
        data,
        metadata: { totalRecords, currentPage, totalPages },
      } = await Models.Member.findWithPagination({ daoAddress: null, pluginAddress: null }, {})

      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)
      expect(currentPage).to.eq(1)
      expect(totalPages).to.eq(1)
    })

    it('should find with pagination with daoAddress', async () => {
      const {
        data,
        metadata: { totalRecords, currentPage, totalPages },
      } = await Models.Member.findWithPagination({ daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409' }, {})

      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)
      expect(currentPage).to.eq(1)
      expect(totalPages).to.eq(1)
    })

    it('should find with pagination with pluginAddress', async () => {
      const {
        data,
        metadata: { totalRecords, currentPage, totalPages },
      } = await Models.Member.findWithPagination({ pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409' }, {})

      expect(data.length).to.eq(3)
      expect(totalRecords).to.eq(3)
      expect(currentPage).to.eq(1)
      expect(totalPages).to.eq(1)
    })

    it('should find with pagination empty result', async () => {
      const spyUtils = sandbox.spy(ModelUtils, 'paginateEmptyResponse')
      const {
        data,
        metadata: { totalRecords, currentPage, totalPages },
      } = await Models.Member.findWithPagination({ pluginAddress: '0x0000000000000000000000000000000000000000' }, {})

      expect(spyUtils.calledOnce).to.be.true
      expect(data.length).to.eq(0)
      expect(totalRecords).to.eq(0)
      expect(currentPage).to.eq(1)
      expect(totalPages).to.eq(1)
    })
  })
})
