import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MemberController from '@services/aragon-api/controllers/member'
import { Models } from '@dbModels'
import Member from '@models/schema/member'
import PairDataModule from '@modules/pairData'
import { FakeMember } from '@test/mock/fakeMember'
import { DaoList } from '@test/mock/fakeDao'
import PluginMember from '@models/schema/pluginMember'
import TokenMember from '@models/schema/tokenMember'
import LockManagerMember from '@models/schema/lockManagerMember'
import type Dao from '@models/schema/dao'
import { PluginList } from '@test/mock/fakePlugins'
import { HexAddress, IPluginInterfaceType, ITokenType, NetworksEnum, ErrorKeyEnum, EnumQueueName } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { MemberGovernanceFactory } from '@src/governance'

describe('Controller: Member', () => {
  let sandbox: SinonSandbox
  let rawMember: Partial<Member>
  let rawPluginMember: Partial<PluginMember>
  let rawDao: Partial<Dao>
  let rawTokenMember: Partial<TokenMember>
  let rawLockManagerMember: Partial<LockManagerMember>
  let rawPlugin: any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawMember = {
      ...(FakeMember as any),
    }

    rawDao = {
      ...(DaoList[0] as any),
    }

    rawPlugin = {
      ...PluginList[0],
      daoAddress: rawDao.address,
      network: rawDao.network,
    }

    rawPluginMember = {
      memberAddress: FakeMember.address,
      daoAddress: rawDao.address,
      pluginAddress: rawPlugin.address,
      network: rawDao.network,
    }

    rawTokenMember = {
      memberAddress: FakeMember.address,
      tokenAddress: rawPlugin.tokenAddress,
      network: rawDao.network,
      votingPower: '1000000000000000000',
      delegateReceivedCount: 0,
      tokenIds: [],
    }

    rawLockManagerMember = {
      memberAddress: FakeMember.address,
      lockManagerAddress: '0xLockManager123',
      network: rawDao.network,
      votingPower: '1000000000000000000',
      lastVPBlockNumber: 12345,
    }

    await Models.Member.create(rawMember)
    await Models.PluginMember.create(rawPluginMember)
    await Models.Dao.create(rawDao)
    await Models.TokenMember.create(rawTokenMember)
    await Models.LockManagerMember.create(rawLockManagerMember)
    await Models.Plugin.create(rawPlugin)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getMembersWithPagination', () => {
    it('should throw badParams error when network is missing', async () => {
      const paginationParams = {}
      const extraParams = {}
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})

      await expect(
        MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams),
      ).to.be.rejectedWith('badParams')
    })

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

      const stubPairFromExtraParams = sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({
        network: NetworksEnum.polygonMainnet,
      })
      const stubFindPaginatedMembersOnly = sandbox.stub(Models.Member, 'findPaginatedMembersOnly').resolves({
        data: [rawMember],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      } as any)

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(stubPairFromExtraParams.calledOnce).to.be.true
      expect(stubFindPaginatedMembersOnly.calledOnce).to.be.true
      expect(stubFindPaginatedMembersOnly.calledWith({ paginationParams })).to.be.true
      expect(response.data).to.have.lengthOf(1)
      expect((response as any).data[0].address).to.equal(rawMember.address)
    })

    it('should throw error when only daoAddress is provided without pluginAddress', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      const extraParams = {
        daoAddress: rawDao.address,
        network: rawDao.network,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)

      await expect(
        MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams),
      ).to.be.rejectedWith('pluginNotFound')
    })

    it('should use MemberGovernanceFactory for tokenVoting plugin with ERC20 token', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      const extraParams = {
        network: rawPlugin.network,
        pluginAddress: rawPlugin.address,
        daoAddress: rawPlugin.daoAddress,
      }
      const pairParams = {}

      const mockToken = {
        address: rawPlugin.tokenAddress,
        network: rawPlugin.network,
        type: ITokenType.ERC20,
      }

      const mockResult = {
        data: [{ address: rawTokenMember.memberAddress }],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      }

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        ...rawPlugin,
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: rawPlugin.tokenAddress,
        network: rawPlugin.network,
        address: rawPlugin.address,
      })
      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(mockToken)

      const mockGovernance = {
        findAndPaginateMembers: sandbox.stub().resolves(mockResult),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(
        (MemberGovernanceFactory.create as sinon.SinonStub).calledWith({
          address: rawPlugin.address,
          network: rawPlugin.network,
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenType: ITokenType.ERC20,
        }),
      ).to.be.true
      expect(
        (mockGovernance.findAndPaginateMembers as sinon.SinonStub).calledWith({
          paginationParams,
          extraParams: {
            ...extraParams,
            tokenAddress: rawPlugin.tokenAddress,
          },
        }),
      ).to.be.true
      expect(response).to.deep.equal(mockResult)
    })

    it('should use MemberGovernanceFactory for VE lock plugin', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      const extraParams = {
        network: rawPlugin.network,
        pluginAddress: rawPlugin.address,
        daoAddress: rawPlugin.daoAddress,
      }
      const pairParams = {}

      const mockToken = {
        address: rawPlugin.tokenAddress,
        network: rawPlugin.network,
        type: ITokenType.escrowAdapter,
      }

      const mockResult = {
        data: [],
        metadata: { page: 1, totalPages: 0, totalRecords: 0 },
      }

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        ...rawPlugin,
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: rawPlugin.tokenAddress,
        network: rawPlugin.network,
        address: rawPlugin.address,
      })
      sandbox.stub(Models.Token, 'findByTokenAddressAndNetwork').resolves(mockToken)

      const mockGovernance = {
        findAndPaginateMembers: sandbox.stub().resolves(mockResult),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(
        (MemberGovernanceFactory.create as sinon.SinonStub).calledWith({
          address: rawPlugin.address,
          network: rawPlugin.network,
          interfaceType: IPluginInterfaceType.tokenVoting,
          tokenType: ITokenType.escrowAdapter,
        }),
      ).to.be.true
      expect(
        (mockGovernance.findAndPaginateMembers as sinon.SinonStub).calledWith({
          paginationParams,
          extraParams: {
            ...extraParams,
            tokenAddress: rawPlugin.tokenAddress,
          },
        }),
      ).to.be.true
      expect(response).to.deep.equal(mockResult)
    })

    it('should use MemberGovernanceFactory for lockToVote plugin', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      const extraParams = {
        network: rawPlugin.network,
        pluginAddress: rawPlugin.address,
        daoAddress: rawPlugin.daoAddress,
      }
      const pairParams = {}

      const lockToVotePlugin = {
        ...rawPlugin,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0xLockManager123',
        network: rawPlugin.network,
        address: rawPlugin.address,
      }

      const mockResult = {
        data: [{ address: rawPluginMember.memberAddress }],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      }

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(lockToVotePlugin)

      const mockGovernance = {
        findAndPaginateMembers: sandbox.stub().resolves(mockResult),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(
        (MemberGovernanceFactory.create as sinon.SinonStub).calledWith({
          address: lockToVotePlugin.lockManagerAddress,
          network: rawPlugin.network,
          interfaceType: IPluginInterfaceType.lockToVote,
        }),
      ).to.be.true
      expect(
        (mockGovernance.findAndPaginateMembers as sinon.SinonStub).calledWith({
          paginationParams,
          extraParams: {
            ...extraParams,
            lockManagerAddress: lockToVotePlugin.lockManagerAddress,
          },
        }),
      ).to.be.true
      expect(response.data).to.have.lengthOf(1)
      expect((response as any).data[0].address).to.equal(rawPluginMember.memberAddress)
    })

    it('should use MemberGovernanceFactory for non-tokenVoting plugin (multisig/admin)', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      const extraParams = {
        network: rawPlugin.network,
        pluginAddress: rawPlugin.address,
        daoAddress: rawPlugin.daoAddress,
      }
      const pairParams = {}

      const mockResult = {
        data: [{ address: rawPluginMember.memberAddress }],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      }

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        ...rawPlugin,
        interfaceType: IPluginInterfaceType.multisig,
        network: rawPlugin.network,
        address: rawPlugin.address,
      })

      const mockGovernance = {
        findAndPaginateMembers: sandbox.stub().resolves(mockResult),
      }
      sandbox.stub(MemberGovernanceFactory, 'create').returns(mockGovernance as any)

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(
        (MemberGovernanceFactory.create as sinon.SinonStub).calledWith({
          address: rawPlugin.address,
          network: rawPlugin.network,
          interfaceType: IPluginInterfaceType.multisig,
        }),
      ).to.be.true
      expect(
        (mockGovernance.findAndPaginateMembers as sinon.SinonStub).calledWith({
          paginationParams,
          extraParams,
        }),
      ).to.be.true
      expect(response).to.deep.equal(mockResult)
    })

    it('should throw notFound error when plugin not found', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      const extraParams = {
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xNonExistent',
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      sandbox.stub(Models.Plugin, 'findOne').resolves(null)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)

      await expect(
        MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams),
      ).to.be.rejectedWith('pluginNotFound')
    })

    it('should throw error when tokenVoting plugin has no tokenAddress', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      const extraParams = {
        network: rawPlugin.network,
        pluginAddress: rawPlugin.address,
        daoAddress: rawPlugin.daoAddress,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      // First check if plugin exists
      sandbox.stub(Models.Plugin, 'findOne').resolves(rawPlugin)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: null,
        votingEscrow: null,
      })

      await expect(
        MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams),
      ).to.be.rejectedWith('notFound')
    })

    it('should throw error when lockToVote plugin has no lockManagerAddress', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      const extraParams = {
        network: rawPlugin.network,
        pluginAddress: rawPlugin.address,
        daoAddress: rawPlugin.daoAddress,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      sandbox.stub(Models.Plugin, 'findOne').resolves(rawPlugin)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: null,
      })

      await expect(
        MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams),
      ).to.be.rejectedWith('notFound')
    })
  })

  describe('getMemberByAddress', () => {
    it('should get member by address without tokenAddress', async () => {
      const stubFindMemberByAddress = sandbox.stub(Models.Member, 'findMemberByAddress').resolves({
        address: rawMember.address,
        ens: rawMember.ens,
        avatar: rawMember.avatar,
      } as any)

      const response = await MemberController.getMemberByAddress(
        rawMember.address as HexAddress,
        {
          daoAddress: rawDao.address,
          network: rawDao.network,
          pluginAddress: rawPlugin.address,
        },
        {},
      )

      expect(stubFindMemberByAddress.calledOnce).to.be.true
      expect(response.address).to.equal(rawMember.address)
      expect(response.ens).to.equal(rawMember.ens)
    })

    it('should get member with token balance when tokenAddress provided', async () => {
      const mockMemberData = {
        address: rawMember.address,
        ens: rawMember.ens,
        avatar: rawMember.avatar,
        votingPower: null,
      }

      sandbox.stub(Models.Member, 'findMemberByAddress').resolves(mockMemberData as any)
      const stubSendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({
        votingPower: '1000',
        balance: '2000',
        currentDelegate: '0xDelegate',
      })

      const response = await MemberController.getMemberByAddress(
        rawMember.address as HexAddress,
        {
          daoAddress: rawDao.address,
          network: rawDao.network,
          pluginAddress: rawPlugin.address,
          tokenAddress: rawPlugin.tokenAddress,
        },
        {},
      )

      expect(stubSendMessage.calledOnce).to.be.true
      expect(
        stubSendMessage.calledWith(EnumQueueName.memberBalance, {
          id: `memberBalance-${rawMember.address}-${rawPlugin.tokenAddress}-${rawDao.network}`,
          params: {
            userAddress: rawMember.address,
            tokenAddress: rawPlugin.tokenAddress,
            network: rawDao.network,
            pluginAddress: rawPlugin.address,
          },
        }),
      ).to.be.true
      expect(response.votingPower).to.equal('1000')
      expect(response.tokenBalance).to.equal('2000')
      expect(response.currentDelegate).to.equal('0xDelegate')
    })

    it('should handle RabbitMQ error gracefully', async () => {
      const mockMemberData = {
        address: rawMember.address,
        ens: rawMember.ens,
        avatar: rawMember.avatar,
        votingPower: null,
      }

      sandbox.stub(Models.Member, 'findMemberByAddress').resolves(mockMemberData as any)
      const stubSendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('RabbitMQ error'))

      const response = await MemberController.getMemberByAddress(
        rawMember.address as HexAddress,
        {
          daoAddress: rawDao.address,
          network: rawDao.network,
          pluginAddress: rawPlugin.address,
          tokenAddress: rawPlugin.tokenAddress,
        },
        {},
      )

      expect(stubSendMessage.calledOnce).to.be.true
      expect(response.address).to.equal(rawMember.address)
      expect(response.votingPower).to.be.null
      expect(response.currentDelegate).to.be.undefined
    })

    it('should throw notFound error when member not found', async () => {
      sandbox.stub(Models.Member, 'findMemberByAddress').resolves(null)

      await expect(MemberController.getMemberByAddress('0xNonExistent' as HexAddress, {}, {})).to.be.rejectedWith(
        ErrorKeyEnum.notFound,
      )
    })

    it('should use pluginAddress as tokenAddress when tokenAddress not provided', async () => {
      const mockMemberData = {
        address: rawMember.address,
        ens: rawMember.ens,
        avatar: rawMember.avatar,
        votingPower: null,
      }

      sandbox.stub(Models.Member, 'findMemberByAddress').resolves(mockMemberData as any)
      const stubSendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({
        votingPower: '500',
        balance: '1000',
        currentDelegate: null,
      })

      const response = await MemberController.getMemberByAddress(
        rawMember.address as HexAddress,
        {
          daoAddress: rawDao.address,
          network: rawDao.network,
          pluginAddress: rawPlugin.address,
        },
        {},
      )

      expect(stubSendMessage.calledOnce).to.be.true
      expect(stubSendMessage.firstCall.args[1].id).to.equal(
        `memberBalance-${rawMember.address}-${rawPlugin.address}-${rawDao.network}`,
      )
      expect(stubSendMessage.firstCall.args[1].params.tokenAddress).to.be.undefined
      expect(response.votingPower).to.equal('500')
    })
  })

  describe('isMemberOfPlugin', () => {
    it('should return true when member exists in plugin', async () => {
      const stubFindOne = sandbox.stub(Models.PluginMember, 'findOne').resolves({ id: 'exists' })

      const result = await MemberController.isMemberOfPlugin('0xMember', '0xPlugin')

      expect(stubFindOne.calledOnce).to.be.true
      expect(
        stubFindOne.calledWith({
          memberAddress: '0xMember',
          pluginAddress: '0xPlugin',
        }),
      ).to.be.true
      expect(result).to.be.true
    })

    it('should return false when member not in plugin', async () => {
      const stubFindOne = sandbox.stub(Models.PluginMember, 'findOne').resolves(null)

      const result = await MemberController.isMemberOfPlugin('0xMember', '0xPlugin')

      expect(stubFindOne.calledOnce).to.be.true
      expect(result).to.be.false
    })
  })

  describe('getMemberLocks', () => {
    it('should get member locks without calculating voting power', async () => {
      const mockResponse = {
        data: [],
        metadata: { page: 1, totalPages: 0, totalRecords: 0 },
      }

      const stubFindWithPagination = sandbox.stub(Models.Lock, 'findWithPagination').resolves(mockResponse)

      const result = await MemberController.getMemberLocks()

      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(
        stubFindWithPagination.calledWith({
          extraParams: {},
          paginationParams: {},
        }),
      ).to.be.true
      expect(result).to.deep.equal(mockResponse)
    })

    it('should get member locks with parameters', async () => {
      const mockLock = {
        id: 'lock-123',
        tokenId: 'token-456',
        memberAddress: rawMember.address,
        amount: '1000000000000000000',
        pluginAddress: rawPlugin.address,
        network: rawDao.network,
        escrowAddress: '0xEscrowAddress123',
        blockTimestamp: 1234567890,
      }

      const mockResponse = {
        data: [mockLock],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      }

      const stubFindWithPagination = sandbox.stub(Models.Lock, 'findWithPagination').resolves(mockResponse)

      const extraParams = { memberAddress: rawMember.address }
      const paginationParams = { page: 1, pageSize: 10 }

      const result = await MemberController.getMemberLocks(extraParams, paginationParams)

      expect(stubFindWithPagination.calledOnce).to.be.true
      expect(
        stubFindWithPagination.calledWith({
          extraParams,
          paginationParams,
        }),
      ).to.be.true
      expect(result.data).to.have.lengthOf(1)
      expect(result.data[0]).to.deep.include(mockLock)
    })
  })
})
