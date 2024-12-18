import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DelegateController from '@services/aragon-api/controllers/delegate'
import { Models } from '@dbModels'
import MemberTransaction from '@models/schema/memberTransaction'
import PairDataModule from '@modules/pairData'
import { fakeMemberTransactions } from '@test/mock/fakeMemberTransaction'
import { FakeToken } from '@test/mock/fakeToken'
import { FakeMember } from '@test/mock/fakeMember'
import { FakeDaoMemberMappings } from '@test/mock/fakeDaoMappings'
import { DaoList } from '@test/mock/fakeDao'
import Token from '@models/schema/token'
import Member from '@models/schema/member'
import type DaoMemberMapping from '@models/schema/daoMemberMapping'
import Dao from '@models/schema/dao'

describe('Controller: Delegate', () => {
  let sandbox: SinonSandbox
  let rawMemberTx: Partial<MemberTransaction>
  let rawToken: Partial<Token>
  let rawMember1: Partial<Member>
  let rawMember2: Partial<Member>
  let rawDaoMappings1: Partial<DaoMemberMapping>
  let rawDaoMappings2: Partial<DaoMemberMapping>
  let rawDao: Partial<Dao>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawMemberTx = { ...fakeMemberTransactions[0] }
    rawToken = { ...(FakeToken as any), address: rawMemberTx.tokenAddress }
    rawMember1 = { ...(FakeMember as any), address: rawMemberTx.from, id: rawMemberTx.from, ens: 'from.eth' }
    rawMember2 = { ...(FakeMember as any), address: rawMemberTx.to, id: rawMemberTx.to, ens: 'rcv.eth' }

    rawDaoMappings1 = {
      ...FakeDaoMemberMappings[0],
      tokenAddress: rawMemberTx.tokenAddress,
      memberAddress: rawMember1.address,
    }

    rawDaoMappings2 = {
      ...FakeDaoMemberMappings[0],
      tokenAddress: rawMemberTx.tokenAddress,
      memberAddress: rawMember2.address,
    }

    rawDao = {
      ...(DaoList[0] as any),
      address: rawDaoMappings1.daoAddress,
    }

    await Promise.all([
      Models.Member.create(rawMember1),
      Models.Member.create(rawMember2),
      Models.DaoMemberMapping.create(rawDaoMappings1),
      Models.DaoMemberMapping.create(rawDaoMappings2),
      Models.Token.create(rawToken),
      Models.MemberTransaction.create(rawMemberTx),
    ])
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getDelegateWithPagination', () => {
    it('should get delegate with pagination - no params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}

      const spyReq = sandbox.spy(Models.MemberTransaction, 'findWithPagination')

      const response = await DelegateController.getDelegateWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
          extraQueryData: { memberAddresses: [] },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].network).to.eq(rawMemberTx.network)
      expect(response.data[0].blockNumber).to.eq(rawMemberTx.blockNumber)
      expect(response.data[0].transactionHash).to.eq(rawMemberTx.transactionHash)
      expect(response.data[0].from.address).to.eq(rawMemberTx.from)
      expect(response.data[0].to.address).to.eq(rawMemberTx.to)
      expect(response.data[0].token.address).to.eq(rawMemberTx.tokenAddress)
      expect(response.data[0].side).to.be.eq(rawMemberTx.side)
      expect(response.data[0].type).to.be.eq(rawMemberTx.type)
    })
  })

  it('should get delegate with pagination - all params', async () => {
    const paginationParams = {
      search: '',
      pageSize: 10,
      page: 1,
      order: 'asc',
      sort: 'createdAt',
    }

    const filterParams: any = {
      network: rawMemberTx.network,
      daoAddress: rawDaoMappings1.daoAddress,
      pluginAddress: rawDaoMappings1.pluginAddress,
      tokenAddress: rawMemberTx.tokenAddress,
    }

    const pairParams: any = {
      daoId: `${rawMemberTx.network}-${rawDaoMappings1.daoAddress}`,
    }

    const pairFromExtraParamsSpy = sandbox.spy(PairDataModule, 'pairFromExtraParams')

    const spyReq = sandbox.spy(Models.MemberTransaction, 'findWithPagination')

    const response = await DelegateController.getDelegateWithPagination(paginationParams, filterParams, pairParams)

    expect(spyReq.calledOnce).to.be.true
    expect(pairFromExtraParamsSpy.calledOnce).to.be.true

    expect(spyReq.args[0][0].extraParams).to.deep.eq({
      daoAddress: rawDaoMappings1.daoAddress,
      network: rawMemberTx.network,
      tokenAddress: rawMemberTx.tokenAddress,
      pluginAddress: rawDaoMappings1.pluginAddress,
    })

    expect(spyReq.args[0][0].paginationParams).to.deep.eq({
      search: '',
      pageSize: 10,
      page: 1,
      order: 'asc',
      sort: 'createdAt',
    })

    expect(spyReq.args[0][0].extraQueryData.memberAddresses.length).to.eq(2)

    expect(response).to.have.property('data').with.lengthOf(1)
    expect(response.data[0].network).to.eq(rawMemberTx.network)
    expect(response.metadata.page).to.eq(1)
    expect(response.metadata.totalPages).to.eq(1)
    expect(response.metadata.totalRecords).to.eq(1)
    expect(response.data[0].from.address).to.eq(rawMemberTx.from)
    expect(response.data[0].to.address).to.eq(rawMemberTx.to)
    expect(response.data[0].token.address).to.eq(rawMemberTx.tokenAddress)
    expect(response.data[0].side).to.be.eq(rawMemberTx.side)
    expect(response.data[0].type).to.be.eq(rawMemberTx.type)
  })

  it('should get delegate with pagination - daoId not found', async () => {
    const paginationParams = {
      search: '',
      pageSize: 10,
      page: 1,
      order: 'asc',
      sort: 'createdAt',
    }

    const filterParams: any = {}
    const pairParams: any = {
      daoId: `${rawMemberTx.network}-${rawDaoMappings1.daoAddress}`,
    }
    sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})

    const spyReq = sandbox.spy(Models.MemberTransaction, 'findWithPagination')

    const response = await DelegateController.getDelegateWithPagination(paginationParams, filterParams, pairParams)

    expect(spyReq.calledOnce).to.be.true
    expect(response).to.have.property('data').with.lengthOf(1)
  })
})
