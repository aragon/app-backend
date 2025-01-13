import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MemberController from '@services/aragon-api/controllers/member'
import { Models } from '@dbModels'
import Member from '@models/schema/member'
import PairDataModule from '@modules/pairData'
import { FakeMember } from '@test/mock/fakeMember'
import { FakeDaoMemberMappings } from '@test/mock/fakeDaoMappings'
import { DaoList } from '@test/mock/fakeDao'
import DaoMemberMapping from '@models/schema/daoMemberMapping'
import type Dao from '@models/schema/dao'
import { fakeMemberBalance } from '@test/mock/fakeMemberBalance'
import MemberBalance from '@models/schema/memberBalance'
import { HexAddress } from '@types'
import { NetworksEnum } from '@types'
import { RabbitMQHelper } from '@helpers/radditMQ'

describe('Controller: Member', () => {
  let sandbox: SinonSandbox
  let rawMember: Partial<Member>
  let rawDaoMemberMapping: Partial<DaoMemberMapping>
  let rawDao: Partial<Dao>
  let rawMemberBalance: Partial<MemberBalance>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawMember = {
      ...(FakeMember as any),
    }

    rawDaoMemberMapping = {
      ...(FakeDaoMemberMappings[0] as any),
      memberAddress: FakeMember.address,
      daoAddress: DaoList[0].address,
      pluginAddress: FakeDaoMemberMappings[0].pluginAddress,
    }

    rawDao = {
      ...(DaoList[0] as any),
    }

    rawMemberBalance = {
      ...(fakeMemberBalance as any),
      address: FakeMember.address,
    }

    rawDaoMemberMapping.memberAddress = FakeMember.address
    rawDaoMemberMapping.daoAddress = rawDao.address
    rawDaoMemberMapping.network = rawDao.network

    await Models.Member.create(rawMember)
    await Models.DaoMemberMapping.create(rawDaoMemberMapping)
    await Models.Dao.create(rawDao)
    await Models.MemberBalance.create(rawMemberBalance)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getMembersWithPagination', () => {
    it('should get members with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        daoAddress: rawDaoMemberMapping.daoAddress,
        network: rawDaoMemberMapping.network,
        pluginAddress: rawDaoMemberMapping.pluginAddress,
        tokenAddress: rawDaoMemberMapping.tokenAddress,
      }

      const spyReq = sandbox.spy(Models.Member, 'findWithPagination')
      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams)

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
          extraQueryData: {
            memberAddresses: ['0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'],
          },
        }),
      ).to.be.true
      //
      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.data[0].ens).to.eq('louis.eth')
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get members no params', async () => {
      const paginationParams = {
        search: '',
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
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
          extraQueryData: {
            memberAddresses: [],
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.data[0].ens).to.eq('louis.eth')
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get members with pagination - daoId', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawDaoMemberMapping.network}-${rawDaoMemberMapping.daoAddress}`,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({
        daoAddress: rawDaoMemberMapping.daoAddress,
        network: rawDaoMemberMapping.network,
      })
      const spyReq = sandbox.spy(Models.Member, 'findWithPagination')

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: {
            daoAddress: rawDaoMemberMapping.daoAddress,
            network: rawDaoMemberMapping.network,
          },
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
          extraQueryData: {
            memberAddresses: ['0x187a34c86aA6378333cE9033Aa34718D2CEdEd2C'],
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.data[0].ens).to.eq(rawMember.ens)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get members with pagination - daoId not found', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `xxx-xxx`,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})
      const spyReq = sandbox.spy(Models.Member, 'findWithPagination')

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
    })
  })

  describe('isMemberOfPlugin', () => {
    it('isMemberOfPlugin', async () => {
      await Models.DaoMemberMapping.create({
        memberAddress: '0x0',
        pluginAddress: '0x1',
        daoAddress: '0x0',
        network: NetworksEnum.arbitrumMainnet,
      })

      const memberAddress = '0x0'
      const pluginAddress = '0x1'

      const spyReq = sandbox.spy(Models.DaoMemberMapping, 'findOne')
      const response = await MemberController.isMemberOfPlugin(memberAddress, pluginAddress)

      expect(response).to.be.true

      expect(
        spyReq.calledOnceWith({
          memberAddress,
          pluginAddress,
        }),
      ).to.be.true
    })

    it('isMemberOfPlugin - not a member', async () => {
      const memberAddress = '0x0'
      const pluginAddress = '0x1'

      const spyReq = sandbox.spy(Models.DaoMemberMapping, 'findOne')
      const response = await MemberController.isMemberOfPlugin(memberAddress, pluginAddress)

      expect(response).to.be.false

      expect(
        spyReq.calledOnceWith({
          memberAddress,
          pluginAddress,
        }),
      ).to.be.true
    })
  })

  it('it should get member by address', async () => {
    const response = await MemberController.getMemberByAddress(
      rawMember.address as HexAddress,
      {
        daoAddress: rawDaoMemberMapping.daoAddress,
        network: rawDaoMemberMapping.network,
        pluginAddress: rawDaoMemberMapping.pluginAddress,
      },
      {},
    )

    expect(response.address).to.eq(rawMember.address)
    expect(response.ens).to.eq(rawMember.ens)
  })

  it('should get member by address when token address is also provided', async () => {
    const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').returns({
      votingPower: '1',
      balance: '1',
    } as any)

    const response = await MemberController.getMemberByAddress(
      rawMember.address as HexAddress,
      {
        daoAddress: rawDaoMemberMapping.daoAddress,
        network: rawDaoMemberMapping.network,
        pluginAddress: rawDaoMemberMapping.pluginAddress,
        tokenAddress: rawDaoMemberMapping.tokenAddress,
      },
      {},
    )

    expect(rabbitMqStub.calledOnce).to.be.true
    expect(rabbitMqStub.args[0][1]).to.deep.eq({
      id: `memberBalance-${rawMember.address}-${rawDaoMemberMapping.tokenAddress}-${rawDaoMemberMapping.network}`,
      params: {
        userAddress: rawMember.address,
        tokenAddress: rawDaoMemberMapping.tokenAddress,
        network: rawDaoMemberMapping.network,
      },
    })
    expect(response.address).to.eq(rawMember.address)
    expect(response.ens).to.eq(rawMember.ens)
    expect(response.balance).to.eq('1')
    expect(response.votingPower).to.eq('1')
  })
})
