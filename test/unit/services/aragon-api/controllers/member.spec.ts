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
import { HexAddress, IPluginInterfaceType } from '@types'
import { NetworksEnum } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import ModelUtils from '@models/utils/models'

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
      tokenAddress: rawDaoMemberMapping.tokenAddress,
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

  describe.only('getMembersWithPagination', () => {
    it('should call findPaginatedMembersOnly when no pluginAddress and daoAddress', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {}
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})
      const findPaginatedSpy = sandbox.spy(Models.Member, 'findPaginatedMembersOnly')

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(findPaginatedSpy.calledOnce).to.be.true
      expect(findPaginatedSpy.calledWith({ paginationParams })).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMember.address)
      expect(response.data[0].ens).to.eq(rawMember.ens)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should call DaoMemberMapping.findAndPaginate when only daoAddress is provided', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        daoAddress: rawDaoMemberMapping.daoAddress,
        network: rawDaoMemberMapping.network,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      const daoMemberMappingSpy = sandbox.spy(Models.DaoMemberMapping, 'findAndPaginate')

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(daoMemberMappingSpy.calledOnce).to.be.true
      expect(
        daoMemberMappingSpy.calledWith({
          extraParams,
          paginationParams,
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawDaoMemberMapping.memberAddress)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    // Test for tokenVoting plugin
    it('should call MemberBalance.findAndPaginate when plugin has tokenAddress and interfaceType is tokenVoting', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams = {
        daoAddress: rawDaoMemberMapping.daoAddress,
        network: rawDaoMemberMapping.network,
        pluginAddress: rawDaoMemberMapping.pluginAddress,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(filterParams)
      const tokenVotingPlugin = {
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: rawDaoMemberMapping.tokenAddress,
      }
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(tokenVotingPlugin)

      const memberBalanceSpy = sandbox.spy(Models.MemberBalance, 'findAndPaginate')

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams, pairParams)

      expect(memberBalanceSpy.calledOnce).to.be.true
      expect(
        memberBalanceSpy.calledWith({
          paginationParams,
          extraParams: {
            ...filterParams,
            tokenAddress: tokenVotingPlugin.tokenAddress,
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawMemberBalance.address)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    // Test for non-tokenVoting plugin
    it('should call DaoMemberMapping.findAndPaginate when plugin has no tokenAddress or interfaceType is not tokenVoting', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams = {
        daoAddress: rawDaoMemberMapping.daoAddress,
        network: rawDaoMemberMapping.network,
        pluginAddress: rawDaoMemberMapping.pluginAddress,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(filterParams)
      const nonTokenVotingPlugin = {
        interfaceType: 'Multisig', // non-token voting interface type
      }
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(nonTokenVotingPlugin)

      const daoMemberMappingSpy = sandbox.spy(Models.DaoMemberMapping, 'findAndPaginate')

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams, pairParams)

      expect(daoMemberMappingSpy.calledOnce).to.be.true
      expect(
        daoMemberMappingSpy.calledWith({
          extraParams: filterParams,
          paginationParams,
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawDaoMemberMapping.memberAddress)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should throw an error when plugin is not found', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams = {
        daoAddress: rawDaoMemberMapping.daoAddress,
        network: rawDaoMemberMapping.network,
        pluginAddress: 'nonExistentPluginAddress',
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(filterParams)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)

      try {
        await MemberController.getMembersWithPagination(paginationParams, filterParams, pairParams)
        // If we get here, the test should fail
        expect.fail('Expected an error to be thrown')
      } catch (err: any) {
        expect(err.message).to.include('notFound')
      }
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
    sandbox.stub(RabbitMQHelper, 'sendMessage')
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
      currentDelegate: '0xdelegate',
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
        pluginAddress: rawDaoMemberMapping.pluginAddress,
      },
    })
    expect(response.address).to.eq(rawMember.address)
    expect(response.ens).to.eq(rawMember.ens)
    expect(response.tokenBalance).to.eq('1')
    expect(response.votingPower).to.eq('1')
    expect(response.currentDelegate).to.eq('0xdelegate')
  })

  it('should return the member even if RabbitMQHelper.sendMessage throws an error', async () => {
    const filterParams = {
      daoAddress: rawDaoMemberMapping.daoAddress,
      network: rawDaoMemberMapping.network,
      pluginAddress: rawDaoMemberMapping.pluginAddress,
      tokenAddress: rawDaoMemberMapping.tokenAddress,
    }

    const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').throws(new Error('RabbitMQ error'))

    const response = await MemberController.getMemberByAddress(rawMember.address as HexAddress, filterParams, {})

    expect(rabbitMqStub.calledOnce).to.be.true
    expect(rabbitMqStub.args[0][1]).to.deep.eq({
      id: `memberBalance-${rawMember.address}-${rawDaoMemberMapping.tokenAddress}-${rawDaoMemberMapping.network}`,
      params: {
        userAddress: rawMember.address,
        tokenAddress: rawDaoMemberMapping.tokenAddress,
        network: rawDaoMemberMapping.network,
        pluginAddress: rawDaoMemberMapping.pluginAddress,
      },
    })

    expect(response.address).to.eq(rawMember.address)
    expect(response.ens).to.eq(rawMember.ens)
    expect(response.votingPower).to.be.null
    expect(response.currentDelegate).to.be.undefined
  })
})
