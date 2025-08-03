import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MemberController from '@services/aragon-api/controllers/member'
import { Models } from '@dbModels'
import Member from '@models/schema/member'
import PairDataModule from '@modules/pairData'
import { FakeMember } from '@test/mock/fakeMember'
import { fakePluginMembers } from '@test/mock/fakePluginMember'
import { fakeVpMembers } from '@test/mock/fakeVpMember'
import { DaoList } from '@test/mock/fakeDao'
import PluginMember from '@models/schema/pluginMember'
import VpMember from '@models/schema/vpMember'
import type Dao from '@models/schema/dao'
import { PluginList } from '@test/mock/fakePlugins'
import { HexAddress, IPluginInterfaceType } from '@types'
import { NetworksEnum } from '@types'
import RabbitMQHelper from '@helpers/rabbitMQ'

describe('Controller: Member', () => {
  let sandbox: SinonSandbox
  let rawMember: Partial<Member>
  let rawPluginMember: Partial<PluginMember>
  let rawDao: Partial<Dao>
  let rawVpMember: Partial<VpMember>
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

    rawVpMember = {
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
    await Models.VpMember.create(rawVpMember)
    await Models.Plugin.create(rawPlugin)
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

    it('should call PluginMember.findAndPaginate when only daoAddress is provided', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const extraParams = {
        daoAddress: rawPluginMember.daoAddress,
        network: rawPluginMember.network,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      const pluginMemberSpy = sandbox.spy(Models.PluginMember, 'findAndPaginate')

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(pluginMemberSpy.calledOnce).to.be.true
      expect(
        pluginMemberSpy.calledWith({
          extraParams,
          paginationParams,
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawPluginMember.memberAddress)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should call VpMember.findAndPaginate when plugin has tokenAddress and interfaceType is tokenVoting', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams = {
        network: rawPlugin.network,
        pluginAddress: rawPlugin.address,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(filterParams)
      const tokenVotingPlugin = {
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: rawPlugin.tokenAddress,
        votingEscrow: null,
      }
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(tokenVotingPlugin)

      const vpMemberSpy = sandbox.spy(Models.VpMember, 'findAndPaginate')

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams, pairParams)

      expect(vpMemberSpy.calledOnce).to.be.true
      expect(
        vpMemberSpy.calledWith({
          paginationParams,
          extraParams: {
            ...filterParams,
            tokenAddress: tokenVotingPlugin.tokenAddress,
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawVpMember.memberAddress)
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
        network: rawPlugin.network,
        pluginAddress: rawPlugin.address,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(filterParams)

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

    it('should call PluginMember.findAndPaginate when plugin has no tokenAddress or interfaceType is not tokenVoting', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams = {
        network: rawPlugin.network,
        pluginAddress: rawPlugin.address,
      }
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(filterParams)
      const nonTokenVotingPlugin = {
        interfaceType: 'Multisig',
        votingEscrow: null,
      }
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(nonTokenVotingPlugin)

      const pluginMemberSpy = sandbox.spy(Models.PluginMember, 'findAndPaginate')

      const response = await MemberController.getMembersWithPagination(paginationParams, filterParams, pairParams)

      expect(pluginMemberSpy.calledOnce).to.be.true
      expect(
        pluginMemberSpy.calledWith({
          extraParams: filterParams,
          paginationParams,
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].address).to.eq(rawPluginMember.memberAddress)
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
        daoAddress: rawDao.address,
        network: rawDao.network,
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
          daoAddress: rawDao.address,
          network: rawDao.network,
          pluginAddress: rawPlugin.address,
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
          daoAddress: rawDao.address,
          network: rawDao.network,
          pluginAddress: rawPlugin.address,
          tokenAddress: rawPlugin.tokenAddress,
        },
        {},
      )

      expect(rabbitMqStub.calledOnce).to.be.true
      expect(rabbitMqStub.args[0][1]).to.deep.eq({
        id: `memberBalance-${rawMember.address}-${rawPlugin.tokenAddress}-${rawDao.network}`,
        params: {
          userAddress: rawMember.address,
          tokenAddress: rawPlugin.tokenAddress,
          network: rawDao.network,
          pluginAddress: rawPlugin.address,
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
        daoAddress: rawDao.address,
        network: rawDao.network,
        pluginAddress: rawPlugin.address,
        tokenAddress: rawPlugin.tokenAddress,
      }

      const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').throws(new Error('RabbitMQ error'))

      const response = await MemberController.getMemberByAddress(rawMember.address as HexAddress, filterParams, {})

      expect(rabbitMqStub.calledOnce).to.be.true
      expect(rabbitMqStub.args[0][1]).to.deep.eq({
        id: `memberBalance-${rawMember.address}-${rawPlugin.tokenAddress}-${rawDao.network}`,
        params: {
          userAddress: rawMember.address,
          tokenAddress: rawPlugin.tokenAddress,
          network: rawDao.network,
          pluginAddress: rawPlugin.address,
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
          daoAddress: rawDao.address,
          network: rawDao.network,
          pluginAddress: rawPlugin.address,
        },
        {},
      )

      expect(rabbitMqStub.calledOnce).to.be.true
      expect(rabbitMqStub.args[0][1]).to.deep.eq({
        id: `memberBalance-${rawMember.address}-${rawPlugin.address}-${rawDao.network}`,
        params: {
          userAddress: rawMember.address,
          tokenAddress: undefined,
          network: rawDao.network,
          pluginAddress: rawPlugin.address,
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
      await Models.PluginMember.create({
        memberAddress: '0x0',
        pluginAddress: '0x1',
        daoAddress: '0x0',
        network: NetworksEnum.arbitrumMainnet,
      })

      const memberAddress = '0x0'
      const pluginAddress = '0x1'

      const spyReq = sandbox.spy(Models.PluginMember, 'findOne')
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

      const spyReq = sandbox.spy(Models.PluginMember, 'findOne')
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
        pluginAddress: rawPlugin.address,
        network: rawDao.network,
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
        address: rawPlugin.address,
        daoAddress: rawDao.address,
        network: rawDao.network,
        tokenAddress: rawPlugin.tokenAddress,
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
})
