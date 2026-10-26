import { Models } from '@dbModels'
import { SafeGovernance } from '@governance/safeGovernance'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import type Dao from '@models/schema/dao'
import LockToVoteMember from '@models/schema/lockToVoteMember'
import Member from '@models/schema/member'
import PluginMember from '@models/schema/pluginMember'
import TokenMember from '@models/schema/tokenMember'
import PairDataModule from '@modules/pairData'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import MemberController from '@services/aragon-api/controllers/member'
import { MemberGovernanceFactory } from '@src/governance'
import { DaoList } from '@test/mock/fakeDao'
import { FakeMember } from '@test/mock/fakeMember'
import { PluginList } from '@test/mock/fakePlugins'
import {
  EnumQueueName,
  ErrorKeyEnum,
  HexAddress,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const SAFE = '0x8442c05d620e11009bdaEDdefDA3b5303725c39A'
const SPP = '0x000000000000000000000000000000000000a001'
const SECOND_OWNER = '0x251DB905400412a538072563212b4Ae7e23F96B8'

describe('Controller: Member', () => {
  let sandbox: SinonSandbox
  let rawMember: Partial<Member>
  let rawPluginMember: Partial<PluginMember>
  let rawDao: Partial<Dao>
  let rawTokenMember: Partial<TokenMember>
  let rawLockToVoteMember: Partial<LockToVoteMember>
  let rawPlugin: any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'debug')
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'error')

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

    rawLockToVoteMember = {
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
    await Models.LockToVoteMember.create(rawLockToVoteMember)
    await Models.Plugin.create(rawPlugin)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  const seedSafeRelation = async (status = ISettingStatus.active) => {
    await Models.Plugin.create({
      ...rawPlugin,
      id: 'safe-spp-parent',
      address: SPP,
      interfaceType: IPluginInterfaceType.spp,
      status: IPluginStatus.installed,
    })
    await Models.Setting.create({
      transactionHash: '0xsetting',
      blockNumber: 1,
      network: rawDao.network,
      daoAddress: rawDao.address,
      pluginAddress: SPP,
      status,
      stages: [{ stageIndex: 0, plugins: [{ address: SAFE, brandId: VotingBodyBrandIdentity.SAFE }] }],
    })
  }

  const seedSafeOwners = async () => {
    await Models.Member.updateOne({ address: rawMember.address }, { ens: 'alice.eth' })
    await Models.Member.create({ ...rawMember, id: SECOND_OWNER, address: SECOND_OWNER, ens: 'bob.eth' })
    for (const memberAddress of [rawMember.address!, SECOND_OWNER]) {
      await Models.SafeMember.create({ network: rawDao.network, safeAddress: SAFE, memberAddress })
    }
  }

  describe('registered Safes without a DAO', () => {
    beforeEach(async () => {
      await Models.SafeAccount.track(rawDao.network, SAFE)
      await seedSafeOwners()
    })

    it('rejects owner details without a DAO relation', async () => {
      await expect(
        MemberController.getMemberByAddress(rawMember.address!, { network: rawDao.network, pluginAddress: SAFE }, {}),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })

    it('rejects membership without a DAO relation', async () => {
      expect(await MemberController.isMemberOfPlugin(rawMember.address!, SAFE, rawDao.network)).to.be.false
    })

    it('rejects the owner list in an unrelated DAO', async () => {
      await expect(
        MemberController.getMembersWithPagination(
          { page: 1, pageSize: 10 },
          { network: rawDao.network, daoAddress: rawDao.address, pluginAddress: SAFE },
        ),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })

    it('rejects owner details in an unrelated DAO', async () => {
      await expect(
        MemberController.getMemberByAddress(
          rawMember.address!,
          { network: rawDao.network, daoAddress: rawDao.address, pluginAddress: SAFE },
          {},
        ),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })

    it('rejects membership in an unrelated DAO', async () => {
      expect(await MemberController.isMemberOfPlugin(rawMember.address!, SAFE, rawDao.network, rawDao.address)).to.be
        .false
    })
  })

  describe('getMembersWithPagination', () => {
    it('lists an uninstalled ordinary plugin in its DAO without Safe discovery', async () => {
      await Models.Plugin.updateOne(
        { address: rawPlugin.address },
        {
          status: IPluginStatus.uninstalled,
          interfaceType: IPluginInterfaceType.multisig,
        },
      )
      const relations = sandbox.spy(SafeBodyMembersModule, 'findDaosWithSafeBody')
      const owners = sandbox.spy(Models.SafeMember, 'findAndPaginate')

      const response = await MemberController.getMembersWithPagination(
        { page: 1, pageSize: 10 },
        { network: rawDao.network, daoAddress: rawDao.address, pluginAddress: rawPlugin.address },
      )

      expect(response.data.map(member => member.address)).to.deep.equal([rawMember.address])
      expect(relations.notCalled).to.be.true
      expect(owners.notCalled).to.be.true
    })

    it('lists Safe owners before a generic row at the same address', async () => {
      await seedSafeRelation()
      await seedSafeOwners()
      await Models.Plugin.create({ ...rawPlugin, id: 'generic-collision', address: SAFE })
      const generic = sandbox.spy(Models.Plugin, 'findOneByDao')

      const response = await MemberController.getMembersWithPagination(
        { page: 1, pageSize: 10 },
        { network: rawDao.network, daoAddress: rawDao.address, pluginAddress: SAFE },
      )

      expect(response.data.map(member => member.address)).to.have.members([rawMember.address, SECOND_OWNER])
      expect(generic.notCalled).to.be.true
    })

    it('rejects a Safe belonging to another DAO despite a generic collision', async () => {
      await seedSafeRelation()
      await seedSafeOwners()
      const otherDao = '0x3333333333333333333333333333333333333333'
      await Models.Plugin.create({ ...rawPlugin, id: 'foreign-collision', address: SAFE, daoAddress: otherDao })
      const generic = sandbox.spy(Models.Plugin, 'findOneByDao')

      await expect(
        MemberController.getMembersWithPagination(
          { page: 1, pageSize: 10 },
          { network: rawDao.network, daoAddress: otherDao, pluginAddress: SAFE },
        ),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
      expect(generic.notCalled).to.be.true
    })

    it('rejects an uninstalled Safe with no settings before the generic lookup', async () => {
      await Models.Plugin.create({
        ...rawPlugin,
        id: 'revoked-safe',
        address: SAFE,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.uninstalled,
      })
      const generic = sandbox.spy(Models.Plugin, 'findOneByDao')

      await expect(
        MemberController.getMembersWithPagination(
          { page: 1, pageSize: 10 },
          { network: rawDao.network, daoAddress: rawDao.address, pluginAddress: SAFE },
        ),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
      expect(generic.notCalled).to.be.true
    })

    it('should throw pluginNotFound error when required params missing', async () => {
      const paginationParams = {}
      const extraParams = {}
      const pairParams = {}

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})

      await expect(
        MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams),
      ).to.be.rejectedWith('pluginNotFound')
    })

    it('should throw pluginNotFound when missing required parameters', async () => {
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

      await expect(
        MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams),
      ).to.be.rejectedWith('pluginNotFound')

      expect(stubPairFromExtraParams.calledOnce).to.be.true
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

    it('should use MemberGovernanceFactory.createFromPlugin for tokenVoting plugin with ERC20 token', async () => {
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
        data: [{ address: rawTokenMember.memberAddress }],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      }

      const mockPlugin = {
        ...rawPlugin,
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: rawPlugin.tokenAddress,
        network: rawPlugin.network,
        address: rawPlugin.address,
      }

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findOneByDao').resolves(mockPlugin)

      const mockGovernance = {
        findAndPaginateMembers: sandbox.stub().resolves(mockResult),
        countDelegatorsForMembers: sandbox.stub().resolves({}),
      }
      const createFromPluginStub = sandbox
        .stub(MemberGovernanceFactory, 'createFromPlugin')
        .returns(mockGovernance as any)

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(createFromPluginStub.calledOnce).to.be.true
      expect(createFromPluginStub.calledWith(mockPlugin)).to.be.true
      expect(
        (mockGovernance.findAndPaginateMembers as sinon.SinonStub).calledWith({
          paginationParams,
          extraParams,
        }),
      ).to.be.true
      expect(response).to.deep.equal(mockResult)
    })

    it('should use MemberGovernanceFactory.createFromPlugin for VE lock plugin', async () => {
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
        data: [],
        metadata: { page: 1, totalPages: 0, totalRecords: 0 },
      }

      const mockPlugin = {
        ...rawPlugin,
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: rawPlugin.tokenAddress,
        network: rawPlugin.network,
        address: rawPlugin.address,
        votingEscrow: {
          escrowAddress: '0xEscrowAddress123',
        },
      }

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findOneByDao').resolves(mockPlugin)

      const mockGovernance = {
        findAndPaginateMembers: sandbox.stub().resolves(mockResult),
        countDelegatorsForMembers: sandbox.stub().resolves({}),
      }
      const createFromPluginStub = sandbox
        .stub(MemberGovernanceFactory, 'createFromPlugin')
        .returns(mockGovernance as any)

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(createFromPluginStub.calledOnce).to.be.true
      expect(createFromPluginStub.calledWith(mockPlugin)).to.be.true
      expect(
        (mockGovernance.findAndPaginateMembers as sinon.SinonStub).calledWith({
          paginationParams,
          extraParams,
        }),
      ).to.be.true
      expect(response).to.deep.equal(mockResult)
    })

    it('should use MemberGovernanceFactory.createFromPlugin for lockToVote plugin', async () => {
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
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findOneByDao').resolves(lockToVotePlugin)

      const mockGovernance = {
        findAndPaginateMembers: sandbox.stub().resolves(mockResult),
        countDelegatorsForMembers: sandbox.stub().resolves({}),
      }
      const createFromPluginStub = sandbox
        .stub(MemberGovernanceFactory, 'createFromPlugin')
        .returns(mockGovernance as any)

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(createFromPluginStub.calledOnce).to.be.true
      expect(createFromPluginStub.calledWith(lockToVotePlugin)).to.be.true
      expect(
        (mockGovernance.findAndPaginateMembers as sinon.SinonStub).calledWith({
          paginationParams,
          extraParams,
        }),
      ).to.be.true
      expect(response.data).to.have.lengthOf(1)
      expect((response as any).data[0].address).to.equal(rawPluginMember.memberAddress)
    })

    it('should use MemberGovernanceFactory.createFromPlugin for non-tokenVoting plugin (multisig/admin)', async () => {
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

      const mockPlugin = {
        ...rawPlugin,
        interfaceType: IPluginInterfaceType.multisig,
        network: rawPlugin.network,
        address: rawPlugin.address,
      }

      const mockResult = {
        data: [{ address: rawPluginMember.memberAddress }],
        metadata: { page: 1, totalPages: 1, totalRecords: 1 },
      }

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      const stubFindByAddress = sandbox.stub(Models.Plugin, 'findOneByDao').resolves(mockPlugin)

      const mockGovernance = {
        findAndPaginateMembers: sandbox.stub().resolves(mockResult),
        countDelegatorsForMembers: sandbox.stub().resolves({}),
      }
      const createFromPluginStub = sandbox
        .stub(MemberGovernanceFactory, 'createFromPlugin')
        .returns(mockGovernance as any)

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(stubFindByAddress.calledOnce).to.be.true
      expect(createFromPluginStub.calledOnce).to.be.true
      expect(createFromPluginStub.calledWith(mockPlugin)).to.be.true
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
      const mockPlugin = {
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress: '0xNonExistent',
        votingEscrow: null,
        network: rawPlugin.network,
        address: rawPlugin.address,
      }
      sandbox.stub(Models.Plugin, 'findOneByDao').resolves(mockPlugin)

      const result = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(result).to.deep.equal({
        metadata: {
          page: 1,
          pageSize: 10,
          totalRecords: 0,
          totalPages: 1,
        },
        data: [],
      })
    })

    it('should handle lockToVote plugin with no lockManagerAddress', async () => {
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
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: null,
        network: rawPlugin.network,
        address: rawPlugin.address,
      }

      const mockResult = {
        data: [],
        metadata: { page: 1, totalPages: 0, totalRecords: 0 },
      }

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      sandbox.stub(Models.Plugin, 'findOneByDao').resolves(lockToVotePlugin)

      const mockGovernance = {
        findAndPaginateMembers: sandbox.stub().resolves(mockResult),
        countDelegatorsForMembers: sandbox.stub().resolves({}),
      }
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernance as any)

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(response).to.deep.equal(mockResult)
    })
    it('paginates searched owners through the active Safe relation', async () => {
      const paginationParams = {
        search: 'alice',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      const extraParams = {
        network: rawDao.network,
        pluginAddress: SAFE,
        daoAddress: rawDao.address,
      }
      const pairParams = {}
      await seedSafeRelation()
      await seedSafeOwners()
      const safeAddressesSpy = sandbox.spy(SafeBodyMembersModule, 'isTracked')
      const paginateSpy = sandbox.spy(SafeGovernance.prototype, 'findAndPaginateMembers')

      const response = await MemberController.getMembersWithPagination(paginationParams, extraParams, pairParams)

      expect(safeAddressesSpy.calledOnceWith(SAFE, extraParams.network, extraParams.daoAddress)).to.be.true
      expect(paginateSpy.calledOnceWith({ paginationParams, extraParams })).to.be.true
      expect(safeAddressesSpy.calledBefore(paginateSpy)).to.be.true
      expect(response.metadata).to.deep.equal({ page: 1, pageSize: 10, totalPages: 1, totalRecords: 1 })
      expect(response.data.map(member => member.address)).to.deep.equal([rawMember.address])
    })

    it('lists both owners of a Safe body through its installed SPP relation', async () => {
      await seedSafeRelation()
      await seedSafeOwners()

      const response = await MemberController.getMembersWithPagination(
        { page: 1, pageSize: 10 },
        { network: rawDao.network, daoAddress: rawDao.address, pluginAddress: SAFE },
      )

      expect(response.data.map(member => member.address)).to.have.members([rawMember.address, SECOND_OWNER])
      expect(response.data).to.have.lengthOf(2)
      expect(response.metadata).to.deep.equal({ page: 1, pageSize: 10, totalPages: 1, totalRecords: 2 })
    })

    it('rejects Safe owners when the relation is inactive', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }
      const extraParams = {
        network: rawDao.network,
        pluginAddress: SAFE,
        daoAddress: rawDao.address,
      }

      await seedSafeRelation(ISettingStatus.inactive)
      await seedSafeOwners()
      const paginateSpy = sandbox.spy(SafeGovernance.prototype, 'findAndPaginateMembers')

      await expect(MemberController.getMembersWithPagination(paginationParams, extraParams, {})).to.be.rejectedWith(
        'notFound',
      )
      expect(paginateSpy.notCalled).to.be.true
    })

    it('answers not found for a Safe nobody lists', async () => {
      await seedSafeOwners()

      await expect(
        MemberController.getMembersWithPagination(
          { page: 1, pageSize: 10 },
          { network: rawDao.network, daoAddress: rawDao.address, pluginAddress: SAFE },
        ),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })

  describe('getMemberByAddress', () => {
    for (const collision of ['none', 'same DAO', 'other DAO']) {
      it(`returns a body-only Safe owner with ${collision} generic collision`, async () => {
        await seedSafeRelation()
        await seedSafeOwners()
        if (collision !== 'none') {
          await Models.Plugin.create({
            ...rawPlugin,
            id: 'detail-collision',
            address: SAFE,
            daoAddress: collision === 'same DAO' ? rawDao.address : '0x3333333333333333333333333333333333333333',
          })
        }
        await Models.PluginMetrics.create({ ...rawPluginMember, voteCount: 9, firstActivity: 100, lastActivity: 200 })
        const generic = sandbox.spy(Models.Plugin, 'findOneByDao')
        const balance = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

        const response = await MemberController.getMemberByAddress(
          rawMember.address!,
          { network: rawDao.network, daoAddress: rawDao.address, pluginAddress: SAFE },
          {},
        )

        expect(response).to.include({
          address: rawMember.address,
          ens: 'alice.eth',
          metrics: null,
          tokenBalance: null,
          votingPower: null,
          currentDelegate: null,
          firstActive: 100,
          lastActive: 200,
        })
        expect(generic.notCalled).to.be.true
        expect(balance.notCalled).to.be.true
      })
    }

    it('finds a tracked Safe owner without a DAO', async () => {
      await seedSafeRelation()
      await seedSafeOwners()
      const response = await MemberController.getMemberByAddress(
        rawMember.address!,
        { network: rawDao.network, pluginAddress: SAFE },
        {},
      )
      expect(response).to.include({ address: rawMember.address, metrics: null, firstActive: null, lastActive: null })
    })

    it('rejects a non-owner even when the base member exists', async () => {
      await seedSafeRelation()
      await expect(
        MemberController.getMemberByAddress(
          rawMember.address!,
          { network: rawDao.network, daoAddress: rawDao.address, pluginAddress: SAFE },
          {},
        ),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })

    it('uses the installed supported generic row from the requested DAO for detail enrichment', async () => {
      await Models.Plugin.updateOne({ address: rawPlugin.address }, { status: IPluginStatus.uninstalled })
      await Models.Plugin.create({
        ...rawPlugin,
        id: 'installed-detail',
        status: IPluginStatus.installed,
        tokenAddress: SECOND_OWNER,
        isSupported: true,
        blockNumber: 2,
      })
      await Models.Plugin.create({
        ...rawPlugin,
        id: 'unsupported-detail',
        status: IPluginStatus.installed,
        tokenAddress: SAFE,
        isSupported: false,
        blockNumber: 3,
      })
      await Models.Plugin.create({
        ...rawPlugin,
        id: 'other-dao-detail',
        daoAddress: SAFE,
        status: IPluginStatus.installed,
        tokenAddress: SAFE,
        blockNumber: 4,
      })
      const balance = sandbox
        .stub(RabbitMQHelper, 'sendMessage')
        .resolves({ balance: '2', votingPower: '3', currentDelegate: null })

      const response = await MemberController.getMemberByAddress(
        rawMember.address!,
        { network: rawDao.network, daoAddress: rawDao.address, pluginAddress: rawPlugin.address },
        {},
      )

      expect(response).to.include({ tokenBalance: '2', votingPower: '3', currentDelegate: null })
      expect(balance.firstCall.args[1].params).to.include({ daoAddress: rawDao.address, tokenAddress: SECOND_OWNER })
    })

    it('should get member by address without tokenAddress', async () => {
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(null)
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
          id: `memberBalance-${rawMember.address}-${rawPlugin.tokenAddress}-${rawDao.network}-${rawDao.address}`,
          params: {
            daoAddress: rawDao.address,
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
  })

  describe('isMemberOfPlugin', () => {
    it('does not use a legacy member after the last Safe relation is revoked', async () => {
      await seedSafeRelation()
      await seedSafeOwners()
      await Models.PluginMember.create({ ...rawPluginMember, id: undefined, pluginAddress: SAFE })
      await Models.Setting.updateMany({ pluginAddress: SPP }, { status: ISettingStatus.inactive })
      const generic = sandbox.spy(Models.PluginMember, 'findOne')

      expect(await MemberController.isMemberOfPlugin(rawMember.address!, SAFE, rawDao.network, rawDao.address)).to.be
        .false
      expect(generic.notCalled).to.be.true
    })

    it('requires the requested DAO relation for a Safe owner', async () => {
      await seedSafeRelation()
      await seedSafeOwners()
      expect(await MemberController.isMemberOfPlugin(rawMember.address!, SAFE, rawDao.network, SECOND_OWNER)).to.be
        .false
      expect(await MemberController.isMemberOfPlugin(rawMember.address!, SAFE, rawDao.network, rawDao.address)).to.be
        .true
    })

    it('does not use legacy members when the Safe body parent is uninstalled', async () => {
      await seedSafeRelation()
      await Models.Plugin.updateOne({ address: SPP }, { status: IPluginStatus.uninstalled })
      await Models.PluginMember.create({ ...rawPluginMember, id: undefined, pluginAddress: SAFE })
      const generic = sandbox.spy(Models.PluginMember, 'findOne')
      expect(await MemberController.isMemberOfPlugin(rawMember.address!, SAFE, rawDao.network, rawDao.address)).to.be
        .false
      expect(generic.notCalled).to.be.true
    })

    it('scopes ordinary membership by DAO without discovering Safe relations or owners', async () => {
      const relations = sandbox.spy(SafeBodyMembersModule, 'findDaosWithSafeBody')
      const owners = sandbox.spy(Models.SafeMember, 'findOwner')
      const generic = sandbox.spy(Models.PluginMember, 'findOne')

      expect(
        await MemberController.isMemberOfPlugin(rawMember.address!, rawPlugin.address, rawDao.network, SECOND_OWNER),
      ).to.be.false
      expect(
        await MemberController.isMemberOfPlugin(rawMember.address!, rawPlugin.address, rawDao.network, rawDao.address),
      ).to.be.true
      expect(generic.lastCall.args[0]).to.deep.equal({
        memberAddress: rawMember.address,
        pluginAddress: rawPlugin.address,
        network: rawDao.network,
        daoAddress: rawDao.address,
      })
      expect(relations.notCalled).to.be.true
      expect(owners.notCalled).to.be.true
    })

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
    it('answers true for a Safe owner with a relation and no PluginMember row', async () => {
      await seedSafeRelation()
      await Models.SafeMember.create({ network: rawDao.network, safeAddress: SAFE, memberAddress: rawMember.address })
      expect(await Models.PluginMember.countDocuments({ pluginAddress: SAFE })).to.equal(0)
      const relationSpy = sandbox.spy(SafeBodyMembersModule, 'findDaosWithSafeBody')
      const findOwnerSpy = sandbox.spy(SafeGovernance.prototype, 'findOne')
      const pluginMemberSpy = sandbox.spy(Models.PluginMember, 'findOne')

      const result = await MemberController.isMemberOfPlugin(rawMember.address!, SAFE, rawDao.network)

      expect(relationSpy.calledOnceWith([SAFE], rawDao.network)).to.be.true
      expect(findOwnerSpy.calledOnceWith(rawMember.address!)).to.be.true
      expect(pluginMemberSpy.notCalled).to.be.true
      expect(result).to.be.true
    })

    it('rejects stale Safe owners when no active relation remains', async () => {
      await Models.SafeMember.create({ network: rawDao.network, safeAddress: SAFE, memberAddress: rawMember.address })
      const findOwnerSpy = sandbox.spy(SafeGovernance.prototype, 'findOne')

      const result = await MemberController.isMemberOfPlugin(rawMember.address!, SAFE, rawDao.network)

      expect(findOwnerSpy.notCalled).to.be.true
      expect(result).to.be.false
    })

    it('ignores a stale PluginMember row for a non-owner of an active Safe', async () => {
      await seedSafeRelation()
      await Models.PluginMember.create({ ...rawPluginMember, id: undefined, pluginAddress: SAFE })
      expect(await Models.SafeMember.countDocuments({ safeAddress: SAFE })).to.equal(0)
      const pluginMemberSpy = sandbox.spy(Models.PluginMember, 'findOne')

      const result = await MemberController.isMemberOfPlugin(rawMember.address!, SAFE, rawDao.network)

      expect(result).to.be.false
      expect(pluginMemberSpy.notCalled).to.be.true
    })

    it('falls back to PluginMember when no Safe relation exists', async () => {
      await Models.PluginMember.create({ ...rawPluginMember, id: undefined, pluginAddress: SAFE })
      const findOwnerSpy = sandbox.spy(SafeGovernance.prototype, 'findOne')

      const result = await MemberController.isMemberOfPlugin(rawMember.address!, SAFE, rawDao.network)

      expect(result).to.be.true
      expect(findOwnerSpy.notCalled).to.be.true
    })

    it('skips the Safe relation when no network is given', async () => {
      await seedSafeRelation()
      await Models.PluginMember.create({ ...rawPluginMember, id: undefined, pluginAddress: SAFE })
      const relationSpy = sandbox.spy(SafeBodyMembersModule, 'findDaosWithSafeBody')
      const pluginMemberSpy = sandbox.spy(Models.PluginMember, 'findOne')

      const result = await MemberController.isMemberOfPlugin(rawMember.address!, SAFE)

      expect(result).to.be.true
      expect(relationSpy.notCalled).to.be.true
      expect(pluginMemberSpy.calledOnceWith({ memberAddress: rawMember.address, pluginAddress: SAFE })).to.be.true
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

  describe('getDelegatorsForMember', () => {
    it('should throw pluginNotFound when network/pluginAddress missing', async () => {
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})

      await expect(
        MemberController.getDelegatorsForMember(rawMember.address as HexAddress, {}, {}, {}),
      ).to.be.rejectedWith('pluginNotFound')
    })

    it('should throw notFound when plugin does not exist', async () => {
      const extraParams = {
        network: rawPlugin.network,
        pluginAddress: '0x0000000000000000000000000000000000000000' as HexAddress,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)

      await expect(
        MemberController.getDelegatorsForMember(rawMember.address as HexAddress, {}, extraParams, {}),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })

    it('should route through governance factory and return its result', async () => {
      const extraParams = {
        network: rawPlugin.network,
        pluginAddress: rawPlugin.address,
      }
      const paginationParams = { page: 1, pageSize: 10 }
      const mockResult = {
        metadata: { page: 1, pageSize: 10, totalPages: 1, totalRecords: 2 },
        data: [
          { address: '0xAAA', ens: null, votingPower: '100' },
          { address: '0xBBB', ens: 'bob.eth', votingPower: '50' },
        ],
      }

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(rawPlugin)
      const mockGovernance = {
        findDelegatorsForMember: sandbox.stub().resolves(mockResult),
      }
      const factoryStub = sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernance as any)

      const result = await MemberController.getDelegatorsForMember(
        rawMember.address as HexAddress,
        paginationParams,
        extraParams,
        {},
      )

      expect(factoryStub.calledOnceWith(rawPlugin as any)).to.be.true
      expect(
        (mockGovernance.findDelegatorsForMember as sinon.SinonStub).calledWith(
          rawMember.address,
          paginationParams,
          extraParams,
        ),
      ).to.be.true
      expect(result).to.deep.equal(mockResult)
    })

    it('should return empty paginated response when governance throws', async () => {
      const extraParams = {
        network: rawPlugin.network,
        pluginAddress: rawPlugin.address,
      }
      const paginationParams = { pageSize: 25, page: 1 }

      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(rawPlugin)
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').throws(new Error('Unsupported plugin interface type'))

      const result = await MemberController.getDelegatorsForMember(
        rawMember.address as HexAddress,
        paginationParams,
        extraParams,
        {},
      )

      expect(result.data).to.deep.equal([])
      expect(result.metadata.totalRecords).to.equal(0)
      expect(result.metadata.pageSize).to.equal(25)
    })

    it('should rethrow exposable errors from governance', async () => {
      const extraParams = {
        network: rawPlugin.network,
        pluginAddress: rawPlugin.address,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(rawPlugin)

      const exposable: any = new Error(ErrorKeyEnum.notFound)
      exposable.exposeCustom_ = true

      const mockGovernance = { findDelegatorsForMember: sandbox.stub().rejects(exposable) }
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns(mockGovernance as any)

      await expect(
        MemberController.getDelegatorsForMember(rawMember.address as HexAddress, {}, extraParams, {}),
      ).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })

    it('should default pageSize to 10 when omitted and governance throws', async () => {
      const extraParams = {
        network: rawPlugin.network,
        pluginAddress: rawPlugin.address,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves(extraParams)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(rawPlugin)
      sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').throws(new Error('unsupported'))

      const result = await MemberController.getDelegatorsForMember(rawMember.address as HexAddress, {}, extraParams, {})

      expect(result.metadata.pageSize).to.equal(10)
    })
  })
})
