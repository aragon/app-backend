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

  describe('getMembersWithPagination', () => {
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

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({
        network: NetworksEnum.polygonMainnet,
      })
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

    it('should call MemberBalance.findAndPaginate when plugin has tokenAddress and interfaceType is tokenVoting', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams = {
        network: rawDaoMemberMapping.network,
        pluginAddress: rawDaoMemberMapping.pluginAddress,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(filterParams)
      const tokenVotingPlugin = {
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: rawDaoMemberMapping.tokenAddress,
        votingEscrow: null,
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

    it('should call getMembersOfVeLockPlugin when plugin has tokenAddress and votingEscrow', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams = {
        network: rawDaoMemberMapping.network,
        pluginAddress: rawDaoMemberMapping.pluginAddress,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(filterParams)

      const veLockPlugin = {
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: rawDaoMemberMapping.tokenAddress,
        address: rawDaoMemberMapping.pluginAddress,
        daoAddress: rawDaoMemberMapping.daoAddress,
        network: rawDaoMemberMapping.network,
        votingEscrow: {
          escrowAddress: '0xEscrowAddress123',
        },
      }
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(veLockPlugin)

      // Mock the dependencies for getMembersOfVeLockPlugin
      const mockSettings = {
        votingEscrow: {
          maxTime: 1000,
          slope: 100,
          bias: 50,
        },
      }
      const mockToken = {
        decimals: 18,
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSettings)
      sandbox.stub(Models.Token, 'findOne').resolves(mockToken)

      const mockVeLockResponse = {
        data: [{ address: rawMember.address, votingPower: '1000' }],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      }
      const veLockSpy = sandbox.stub(Models.Lock, 'getMembersOfVeLockPlugin').resolves(mockVeLockResponse)

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams, pairParams)

      expect(veLockSpy.calledOnce).to.be.true
      expect(
        veLockSpy.calledWith({
          paginationParams,
          pluginAddress: veLockPlugin.address,
          settings: {
            currentTime: sinon.match.number,
            maxTime: mockSettings.votingEscrow.maxTime,
            slope: mockSettings.votingEscrow.slope,
            bias: mockSettings.votingEscrow.bias,
            decimals: (BigInt(10) ** BigInt(mockToken.decimals)).toString(),
          },
          tokenAddress: veLockPlugin.tokenAddress,
          network: veLockPlugin.network,
        }),
      ).to.be.true

      expect(response).to.deep.equal(mockVeLockResponse)
    })

    it('should call DaoMemberMapping.findAndPaginate when plugin has no tokenAddress or interfaceType is not tokenVoting', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams = {
        network: rawDaoMemberMapping.network,
        pluginAddress: rawDaoMemberMapping.pluginAddress,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(filterParams)
      const nonTokenVotingPlugin = {
        interfaceType: 'Multisig',
        votingEscrow: null,
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

    it('should call getMembersOfLockManagerPlugin when plugin has lockToVote interface type', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams = {
        network: rawDaoMemberMapping.network,
        pluginAddress: rawDaoMemberMapping.pluginAddress,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(filterParams)

      const lockToVotePlugin = {
        interfaceType: IPluginInterfaceType.lockToVote,
        address: rawDaoMemberMapping.pluginAddress,
        network: rawDaoMemberMapping.network,
        lockManagerAddress: '0xLockManager123',
        tokenAddress: rawDaoMemberMapping.tokenAddress,
      }
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(lockToVotePlugin)

      const mockLockManagerResponse = {
        data: [
          {
            address: rawMember.address,
            ens: rawMember.ens,
            avatar: rawMember.avatar,
            votingPower: '1000000000000000000',
            metrics: {
              lastActivity: 1620000000,
              firstActivity: 1619000000,
              voteCount: 5,
              proposalCount: 2,
              delegateReceivedCount: 1,
            },
          },
        ],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      }

      const lockManagerSpy = sandbox.stub(Models.LockManagerMember, 'findAndPaginate').resolves(mockLockManagerResponse)

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams, pairParams)

      expect(lockManagerSpy.calledOnce).to.be.true
      expect(
        lockManagerSpy.calledWith({
          paginationParams,
          pluginAddress: lockToVotePlugin.address,
          network: lockToVotePlugin.network,
        }),
      ).to.be.true

      expect(response).to.deep.equal(mockLockManagerResponse)
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
        expect.fail('Expected an error to be thrown')
      } catch (err: any) {
        expect(err.message).to.include('notFound')
      }
    })
  })

  describe('getMemberByAddress', () => {
    it('should get member by address', async () => {
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

    it('should throw an error when member is not found', async () => {
      try {
        await MemberController.getMemberByAddress('0xnonexistent' as HexAddress, {}, {})
        expect.fail('Expected an error to be thrown')
      } catch (err: any) {
        expect(err.message).to.include('notFound')
      }
    })

    it('should get member by address when only pluginAddress is provided (without tokenAddress)', async () => {
      const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').returns({
        votingPower: '2',
        balance: '2',
        currentDelegate: null,
      } as any)

      const response = await MemberController.getMemberByAddress(
        rawMember.address as HexAddress,
        {
          daoAddress: rawDaoMemberMapping.daoAddress,
          network: rawDaoMemberMapping.network,
          pluginAddress: rawDaoMemberMapping.pluginAddress,
        },
        {},
      )

      expect(rabbitMqStub.calledOnce).to.be.true
      expect(rabbitMqStub.args[0][1]).to.deep.eq({
        id: `memberBalance-${rawMember.address}-${rawDaoMemberMapping.pluginAddress}-${rawDaoMemberMapping.network}`,
        params: {
          userAddress: rawMember.address,
          tokenAddress: undefined,
          network: rawDaoMemberMapping.network,
          pluginAddress: rawDaoMemberMapping.pluginAddress,
        },
      })
      expect(response.address).to.eq(rawMember.address)
      expect(response.ens).to.eq(rawMember.ens)
      expect(response.tokenBalance).to.eq('2')
      expect(response.votingPower).to.eq('2')
      expect(response.currentDelegate).to.be.null
    })
  })

  describe('isMemberOfPlugin', () => {
    it('should return true when member is part of plugin', async () => {
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

    it('should return false when member is not part of plugin', async () => {
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

  describe('getMemberLocks', () => {
    it('should return empty response when no locks exist', async () => {
      const expectedResponse = {
        data: [],
        metadata: {
          page: 1,
          totalPages: 0,
          totalRecords: 0,
        },
      }

      const lockSpy = sandbox.stub(Models.Lock, 'findWithPagination').resolves(expectedResponse)

      const response = await MemberController.getMemberLocks()

      expect(lockSpy.calledOnce).to.be.true
      expect(
        lockSpy.calledWith({
          extraParams: {},
          paginationParams: {},
        }),
      ).to.be.true

      expect(response).to.deep.equal(expectedResponse)
    })

    it('should calculate voting power when locks exist', async () => {
      const mockLock = {
        id: 'lock-123',
        tokenId: 'token-456',
        memberAddress: rawMember.address,
        amount: '1000000000000000000',
        pluginAddress: rawDaoMemberMapping.pluginAddress,
        network: rawDaoMemberMapping.network,
        escrowAddress: '0xEscrowAddress123',
        blockTimestamp: 1234567890,
      }

      const expectedResponse = {
        data: [mockLock],
        metadata: {
          page: 1,
          totalPages: 1,
          totalRecords: 1,
        },
      }

      const lockSpy = sandbox.stub(Models.Lock, 'findWithPagination').resolves(expectedResponse)

      const extraParams = { memberAddress: rawMember.address }
      const paginationParams = { page: 1, pageSize: 10 }

      const response = await MemberController.getMemberLocks(extraParams, paginationParams)

      expect(lockSpy.calledOnce).to.be.true

      expect(response.data[0]).to.deep.include({
        ...mockLock,
      })
      expect(response.metadata).to.deep.equal(expectedResponse.metadata)
    })
  })

  describe('getMembersOfVeLockPlugin', () => {
    it('should return members with voting power for VeLock plugin', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const mockPlugin = {
        address: rawDaoMemberMapping.pluginAddress,
        daoAddress: rawDaoMemberMapping.daoAddress,
        network: rawDaoMemberMapping.network,
        tokenAddress: rawDaoMemberMapping.tokenAddress,
      }

      const mockSettings = {
        votingEscrow: {
          maxTime: 1000,
          slope: 100,
          bias: 50,
        },
      }

      const mockToken = {
        decimals: 18,
      }

      const mockVeLockResponse = {
        data: [
          {
            address: rawMember.address,
            votingPower: '1000000000000000000',
            lockEnd: 1234567890,
          },
        ],
        metadata: {
          page: 1,
          totalPages: 1,
          totalRecords: 1,
        },
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSettings)
      sandbox.stub(Models.Token, 'findOne').resolves(mockToken)
      const veLockSpy = sandbox.stub(Models.Lock, 'getMembersOfVeLockPlugin').resolves(mockVeLockResponse)

      const response = await MemberController.getMembersOfVeLockPlugin(paginationParams, mockPlugin as any)

      expect(veLockSpy.calledOnce).to.be.true
      expect(
        veLockSpy.calledWith({
          paginationParams,
          pluginAddress: mockPlugin.address,
          settings: {
            currentTime: sinon.match.number,
            maxTime: mockSettings.votingEscrow.maxTime,
            slope: mockSettings.votingEscrow.slope,
            bias: mockSettings.votingEscrow.bias,
            decimals: (BigInt(10) ** BigInt(mockToken.decimals)).toString(),
          },
          tokenAddress: mockPlugin.tokenAddress,
          network: mockPlugin.network,
        }),
      ).to.be.true

      expect(response).to.deep.equal(mockVeLockResponse)
    })

    it('should throw an error when settings or token not found', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const mockPlugin = {
        address: rawDaoMemberMapping.pluginAddress,
        daoAddress: rawDaoMemberMapping.daoAddress,
        network: rawDaoMemberMapping.network,
        tokenAddress: rawDaoMemberMapping.tokenAddress,
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(null)
      sandbox.stub(Models.Token, 'findOne').resolves(null)

      try {
        await MemberController.getMembersOfVeLockPlugin(paginationParams, mockPlugin as any)
        expect.fail('Expected an error to be thrown')
      } catch (err: any) {
        expect(err.message).to.include('notFound')
      }
    })
  })

  describe('getMembersOfLockManagerPlugin', () => {
    it('should return members from LockManagerMember model for lockToVote plugin', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const mockPlugin = {
        address: rawDaoMemberMapping.pluginAddress,
        network: rawDaoMemberMapping.network,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xLockManager123',
        tokenAddress: rawDaoMemberMapping.tokenAddress,
      }

      const mockLockManagerResponse = {
        data: [
          {
            address: rawMember.address,
            ens: rawMember.ens,
            avatar: rawMember.avatar,
            votingPower: '2000000000000000000',
            metrics: {
              lastActivity: 1620100000,
              firstActivity: 1619000000,
              voteCount: 10,
              proposalCount: 3,
              delegateReceivedCount: 2,
            },
          },
          {
            address: '0xmember2',
            ens: 'member2.eth',
            avatar: 'avatar2-url',
            votingPower: '1500000000000000000',
            metrics: {
              lastActivity: 1620200000,
              firstActivity: 1619100000,
              voteCount: 8,
              proposalCount: 1,
              delegateReceivedCount: 0,
            },
          },
        ],
        metadata: {
          page: 1,
          totalPages: 1,
          totalRecords: 2,
        },
      }

      const lockManagerSpy = sandbox.stub(Models.LockManagerMember, 'findAndPaginate').resolves(mockLockManagerResponse)

      const response = await MemberController.getMembersOfLockManagerPlugin(paginationParams, mockPlugin as any)

      expect(lockManagerSpy.calledOnce).to.be.true
      expect(
        lockManagerSpy.calledWith({
          paginationParams,
          pluginAddress: mockPlugin.address,
          network: mockPlugin.network,
        }),
      ).to.be.true

      expect(response).to.deep.equal(mockLockManagerResponse)
    })

    it('should handle pagination parameters correctly', async () => {
      const paginationParams = {
        search: 'test',
        pageSize: 5,
        page: 2,
        order: 'desc',
        sort: 'votingPower',
      }

      const mockPlugin = {
        address: '0xPluginLockToVote',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xLockManager456',
      }

      const mockResponse = {
        data: [],
        metadata: {
          page: 2,
          totalPages: 3,
          totalRecords: 12,
          pageSize: 5,
        },
      }

      const lockManagerSpy = sandbox.stub(Models.LockManagerMember, 'findAndPaginate').resolves(mockResponse)

      const response = await MemberController.getMembersOfLockManagerPlugin(paginationParams, mockPlugin as any)

      expect(lockManagerSpy.calledOnce).to.be.true
      expect(
        lockManagerSpy.calledWith({
          paginationParams: {
            search: 'test',
            pageSize: 5,
            page: 2,
            order: 'desc',
            sort: 'votingPower',
          },
          pluginAddress: '0xPluginLockToVote',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true

      expect(response.metadata.page).to.eq(2)
      expect(response.metadata.pageSize).to.eq(5)
      expect(response.metadata.totalRecords).to.eq(12)
    })

    it('should return empty result when no members exist', async () => {
      const paginationParams = {}

      const mockPlugin = {
        address: '0xEmptyPlugin',
        network: NetworksEnum.arbitrumMainnet,
        interfaceType: IPluginInterfaceType.lockToVote,
      }

      const emptyResponse = {
        data: [],
        metadata: {
          page: 1,
          totalPages: 1,
          totalRecords: 0,
        },
      }

      sandbox.stub(Models.LockManagerMember, 'findAndPaginate').resolves(emptyResponse)

      const response = await MemberController.getMembersOfLockManagerPlugin(paginationParams, mockPlugin as any)

      expect(response.data).to.be.an('array').that.is.empty
      expect(response.metadata.totalRecords).to.eq(0)
    })
  })
})
