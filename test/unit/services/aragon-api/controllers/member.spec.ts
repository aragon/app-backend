import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MemberController from '@services/aragon-api/controllers/member'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Member from '@models/schema/member'

describe('Controller: Member', () => {
  let sandbox: SinonSandbox
  let rawMember: Partial<Member>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawMember = {
      address: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      ens: undefined,
      daos: [
        {
          daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          network: NetworksEnum.ethereumMainnet,
          pluginAddress: '0x12366cae2b9c6c3055e9e3c78936a69006be5409',
          fromBlockNumber: 1,
          toBlockNumber: 2,
          fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          toTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
          delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
          votingPower: '100',
          pluginSubdomain: NetworksEnum.ethereumMainnet,
        },
      ],
    }

    await Models.Member.create(rawMember)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getMembersWithPagination', () => {
    it('should get members with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        endDate: '',
        startDate: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawMember.daos?.[0].network,
        daoAddress: rawMember.daos?.[0].daoAddress,
        pluginAddress: rawMember.daos?.[0].pluginAddress,
      }

      const spyReq = sandbox.spy(Models.Member, 'findWithPagination')

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            endDate: '',
            startDate: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.data[0].ens).to.eq(null)
      expect(response.data[0].fromBlockNumber).to.eq(rawMember.daos?.[0].fromBlockNumber)
      expect(response.data[0].toBlockNumber).to.eq(rawMember.daos?.[0].toBlockNumber)
      expect(response.data[0].votingPower).to.eq(rawMember.daos?.[0].votingPower)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get members no params', async () => {
      const paginationParams = {
        search: '',
        endDate: '',
        startDate: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}

      const spyReq = sandbox.spy(Models.Member, 'findWithPagination')

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            endDate: '',
            startDate: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.data[0].ens).to.eq(null)
      expect(response.data[0].fromBlockNumber).to.eq(rawMember.daos?.[0].fromBlockNumber)
      expect(response.data[0].toBlockNumber).to.eq(rawMember.daos?.[0].toBlockNumber)
      expect(response.data[0].votingPower).to.eq(rawMember.daos?.[0].votingPower)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })
  })
})
