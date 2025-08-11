import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MemberController from '@services/aragon-api/controllers/member'
import { Models } from '@dbModels'
import Member from '@models/schema/member'
import PairDataModule from '@modules/pairData'
import { FakeMember } from '@test/mock/fakeMember'
import { fakePluginMembers } from '@test/mock/fakePluginMember'
import { fakeTokenMembers } from '@test/mock/fakeTokenMember'
import { DaoList } from '@test/mock/fakeDao'
import PluginMember from '@models/schema/pluginMember'
import TokenMember from '@models/schema/tokenMember'
import type Dao from '@models/schema/dao'
import { PluginList } from '@test/mock/fakePlugins'
import { HexAddress, IPluginInterfaceType, NetworksEnum, ErrorKeyEnum, EnumQueueName } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'

describe('Controller: Member', () => {
  let sandbox: SinonSandbox
  let rawMember: Partial<Member>
  let rawPluginMember: Partial<PluginMember>
  let rawDao: Partial<Dao>
  let rawTokenMember: Partial<TokenMember>
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

    await Models.Member.create(rawMember)
    await Models.PluginMember.create(rawPluginMember)
    await Models.Dao.create(rawDao)
    await Models.TokenMember.create(rawTokenMember)
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
      expect(response.data[0].address).to.equal(rawMember.address)
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

    it('should call TokenMember.findAndPaginate for tokenVoting plugin with token', async () => {
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
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: rawPlugin.tokenAddress,
        votingEscrow: null,
      })
      const stubFindAndPaginate = sandbox.stub(Models.TokenMember, 'findAndPaginate').resolves({
        data: [{ address: rawTokenMember.memberAddress }],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      } as any)

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(stubFindAndPaginate.calledOnce).to.be.true
      expect(
        stubFindAndPaginate.calledWith({
          paginationParams,
          extraParams: {
            ...extraParams,
            tokenAddress: rawPlugin.tokenAddress,
          },
        }),
      ).to.be.true
    })

    it('should call getMembersOfVeLockPlugin for VE lock plugin', async () => {
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

      const veLockPlugin = {
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: rawPlugin.tokenAddress,
        address: rawPlugin.address,
        daoAddress: rawPlugin.daoAddress,
        network: rawPlugin.network,
        votingEscrow: {
          escrowAddress: '0xEscrowAddress123',
        },
      }

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      // First check if plugin exists
      sandbox.stub(Models.Plugin, 'findOne').resolves(rawPlugin)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(veLockPlugin)

      const stubGetMembersOfVeLockPlugin = sandbox.stub(MemberController, 'getMembersOfVeLockPlugin').resolves({
        data: [],
        metadata: { page: 1, totalPages: 0, totalRecords: 0 },
      })

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(stubGetMembersOfVeLockPlugin.calledOnce).to.be.true
      expect(
        stubGetMembersOfVeLockPlugin.calledWith(
          paginationParams,
          sinon.match({
            interfaceType: IPluginInterfaceType.tokenVoting,
            tokenAddress: rawPlugin.tokenAddress,
            address: rawPlugin.address,
            daoAddress: rawPlugin.daoAddress,
            network: rawPlugin.network,
            votingEscrow: sinon.match({
              escrowAddress: '0xEscrowAddress123',
            }),
          }),
        ),
      ).to.be.true
      expect(response).to.deep.equal({
        data: [],
        metadata: { page: 1, totalPages: 0, totalRecords: 0 },
      })
    })

    it('should call PluginMember.findAndPaginate for non-tokenVoting plugin', async () => {
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
        interfaceType: IPluginInterfaceType.multisig,
        votingEscrow: null,
      })
      const stubFindAndPaginate = sandbox.stub(Models.PluginMember, 'findAndPaginate').resolves({
        data: [{ address: rawPluginMember.memberAddress }],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      } as any)

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(stubFindAndPaginate.calledOnce).to.be.true
      expect(
        stubFindAndPaginate.calledWith({
          extraParams,
          paginationParams,
        }),
      ).to.be.true
    })

    it('should throw pluginNotFound error when plugin not found', async () => {
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

    it('should handle plugin without tokenAddress', async () => {
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
      const stubFindAndPaginate = sandbox.stub(Models.PluginMember, 'findAndPaginate').resolves({
        data: [],
        metadata: { page: 1, totalPages: 0, totalRecords: 0 },
      } as any)

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(stubFindAndPaginate.calledOnce).to.be.true
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

  describe('getMembersOfVeLockPlugin', () => {
    it('should get members of VE lock plugin successfully', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const mockPlugin = {
        address: rawPlugin.address,
        daoAddress: rawDao.address,
        network: rawDao.network,
        tokenAddress: rawPlugin.tokenAddress,
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

      const mockResponse = {
        data: [
          {
            address: rawMember.address,
            votingPower: '1000000000000000000',
            lockEnd: 1234567890,
          },
        ],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      }

      const stubFindActive = sandbox.stub(Models.Setting, 'findActive').resolves(mockSettings)
      const stubFindOne = sandbox.stub(Models.Token, 'findOne').resolves(mockToken)
      const stubGetMembersOfVeLockPlugin = sandbox.stub(Models.Lock, 'getMembersOfVeLockPlugin').resolves(mockResponse)

      const result = await MemberController.getMembersOfVeLockPlugin(paginationParams, mockPlugin as any)

      expect(stubFindActive.calledOnce).to.be.true
      expect(stubFindOne.calledOnce).to.be.true
      expect(stubGetMembersOfVeLockPlugin.calledOnce).to.be.true
      expect(
        stubGetMembersOfVeLockPlugin.calledWith({
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
      expect(result).to.deep.equal(mockResponse)
    })

    it('should throw notFound error when settings not found', async () => {
      const paginationParams = {}
      const mockPlugin = {
        address: rawPlugin.address,
        daoAddress: rawDao.address,
        network: rawDao.network,
        tokenAddress: rawPlugin.tokenAddress,
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(null)
      sandbox.stub(Models.Token, 'findOne').resolves({ decimals: 18 })

      await expect(MemberController.getMembersOfVeLockPlugin(paginationParams, mockPlugin as any)).to.be.rejectedWith(
        ErrorKeyEnum.notFound,
      )
    })

    it('should throw notFound error when token not found', async () => {
      const paginationParams = {}
      const mockPlugin = {
        address: rawPlugin.address,
        daoAddress: rawDao.address,
        network: rawDao.network,
        tokenAddress: rawPlugin.tokenAddress,
      }

      sandbox.stub(Models.Setting, 'findActive').resolves({
        votingEscrow: { maxTime: 1000, slope: 100, bias: 50 },
      })
      sandbox.stub(Models.Token, 'findOne').resolves(null)

      await expect(MemberController.getMembersOfVeLockPlugin(paginationParams, mockPlugin as any)).to.be.rejectedWith(
        ErrorKeyEnum.notFound,
      )
    })

    it('should handle missing votingEscrow in settings', async () => {
      const paginationParams = {}
      const mockPlugin = {
        address: rawPlugin.address,
        daoAddress: rawDao.address,
        network: rawDao.network,
        tokenAddress: rawPlugin.tokenAddress,
      }

      sandbox.stub(Models.Setting, 'findActive').resolves({
        /* no votingEscrow property */
      } as any)
      sandbox.stub(Models.Token, 'findOne').resolves({ decimals: 18 })

      await expect(MemberController.getMembersOfVeLockPlugin(paginationParams, mockPlugin as any)).to.be.rejectedWith(
        ErrorKeyEnum.notFound,
      )
    })

    it('should calculate currentTime correctly', async () => {
      const paginationParams = {}
      const mockPlugin = {
        address: rawPlugin.address,
        daoAddress: rawDao.address,
        network: rawDao.network,
        tokenAddress: rawPlugin.tokenAddress,
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

      const mockResponse = {
        data: [],
        metadata: { page: 1, totalPages: 0, totalRecords: 0 },
      }

      sandbox.stub(Models.Setting, 'findActive').resolves(mockSettings)
      sandbox.stub(Models.Token, 'findOne').resolves(mockToken)
      const stubGetMembersOfVeLockPlugin = sandbox.stub(Models.Lock, 'getMembersOfVeLockPlugin').resolves(mockResponse)

      const timeBeforeCall = Math.floor(Date.now() / 1000)
      await MemberController.getMembersOfVeLockPlugin(paginationParams, mockPlugin as any)
      const timeAfterCall = Math.floor(Date.now() / 1000)

      const callArgs = stubGetMembersOfVeLockPlugin.firstCall.args[0]
      expect(callArgs.settings.currentTime).to.be.at.least(timeBeforeCall)
      expect(callArgs.settings.currentTime).to.be.at.most(timeAfterCall)
    })
  })
})
