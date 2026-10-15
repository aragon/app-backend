import config from '@config'
import { Models } from '@dbModels'
import { BaseGovernance } from '@governance/baseGovernance'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import ProxyWeb3Provider from '@modules/proxyProvider'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import SafeTrackingModule from '@modules/safe/safeTracking'
import {
  EnumQueueName,
  IPluginInterfaceType,
  IPluginStatus,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
const OWNER = '0x1111111111111111111111111111111111111111'
const SECOND_OWNER = '0x2222222222222222222222222222222222222222'
const DAO = '0x3333333333333333333333333333333333333333'
const SPP = '0x4444444444444444444444444444444444444444'
const params = { network: NETWORK, address: SAFE }

describe('Module: SafeTracking', () => {
  let sandbox: sinon.SinonSandbox
  let send: sinon.SinonStub
  let readOwners: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'debug')
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'error')
    send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    readOwners = sandbox.stub(SafeChainReaderModule, 'readOwners').resolves([OWNER, SECOND_OWNER])
    sandbox.stub(BaseGovernance, 'ensureBaseMember').resolves({})
  })

  afterEach(() => sandbox.restore())

  it('seeds registered owners before queueing the full backfill', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)
    send.callsFake(async () => {
      expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
    })

    await SafeTrackingModule.start(params)

    expect(await Models.SafeMember.distinct('memberAddress', { network: NETWORK, safeAddress: SAFE })).to.have.members([
      OWNER,
      SECOND_OWNER,
    ])
    expect(send.callCount).to.equal(3)
    expect(send.firstCall.args).to.deep.equal([
      EnumQueueName.safeRefresh,
      {
        id: `safe-refresh-${NETWORK}-${SAFE}-${config.SAFE_API.BACKFILL_HISTORY_PAGES}`,
        params: { network: NETWORK, address: SAFE, historyPages: config.SAFE_API.BACKFILL_HISTORY_PAGES },
      },
    ])
    expect(send.secondCall.args).to.deep.equal([
      EnumQueueName.daoTransactions,
      { id: SAFE, params: { daoAddress: SAFE, network: NETWORK } },
    ])
    expect(send.thirdCall.args).to.deep.equal([
      EnumQueueName.daoAssets,
      { id: `${NETWORK}-${SAFE}-native`, params: { address: SAFE, network: NETWORK, native: true } },
    ])
  })

  it('does not seed or queue an unknown Safe', async () => {
    await SafeTrackingModule.start(params)

    expect(readOwners.notCalled).to.be.true
    expect(send.notCalled).to.be.true
    expect(await Models.SafeMember.countDocuments()).to.equal(0)
    expect(await Models.SafeAccount.countDocuments()).to.equal(0)
  })

  it('does nothing when the Safe is removed before the job runs', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)
    await Models.SafeAccount.untrack(NETWORK, SAFE)

    await SafeTrackingModule.start(params)

    expect(readOwners.notCalled).to.be.true
    expect(send.notCalled).to.be.true
    expect(await Models.SafeMember.countDocuments()).to.equal(0)
  })

  it('does not use a registration from another network', async () => {
    await Models.SafeAccount.track(NetworksEnum.ethereumMainnet, SAFE)

    await SafeTrackingModule.start(params)

    expect(readOwners.notCalled).to.be.true
    expect(send.notCalled).to.be.true
    expect(await Models.SafeMember.countDocuments()).to.equal(0)
  })

  it('keeps one owner set when the job runs twice', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)

    await SafeTrackingModule.start(params)
    await SafeTrackingModule.start(params)

    expect(readOwners.calledOnce).to.be.true
    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
    expect(send.callCount).to.equal(6)
  })

  it('throws a failed seed before queueing the backfill', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)
    readOwners.rejects(new Error('node down'))

    await expect(SafeTrackingModule.start(params)).to.be.rejectedWith('node down')

    expect(send.notCalled).to.be.true
    expect(await Models.SafeMember.countDocuments()).to.equal(0)
  })

  it('can seed the Safe again after a failed attempt', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)
    readOwners.onFirstCall().rejects(new Error('node down'))
    await expect(SafeTrackingModule.start(params)).to.be.rejectedWith('node down')

    await SafeTrackingModule.start(params)

    expect(await Models.SafeMember.countDocuments({ network: NETWORK, safeAddress: SAFE })).to.equal(2)
    expect(send.callCount).to.equal(3)
  })

  it('keeps a DAO body owner set and pulls its history again', async () => {
    await Models.Plugin.create({
      address: SPP,
      daoAddress: DAO,
      network: NETWORK,
      transactionHash: '0xspp',
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.spp,
      status: IPluginStatus.installed,
      isSupported: true,
    })
    await Models.Setting.create({
      network: NETWORK,
      daoAddress: DAO,
      pluginAddress: SPP,
      transactionHash: '0xsetting',
      blockNumber: 1,
      status: ISettingStatus.active,
      stages: [{ stageIndex: 0, plugins: [{ address: SAFE, brandId: VotingBodyBrandIdentity.SAFE }] }],
    })
    await Models.SafeMember.ensure(NETWORK, SAFE, OWNER)
    await Models.SafeAccount.track(NETWORK, SAFE)

    await SafeTrackingModule.start(params)

    expect(readOwners.notCalled).to.be.true
    expect(await Models.SafeMember.distinct('memberAddress', { network: NETWORK, safeAddress: SAFE })).to.deep.equal([
      OWNER,
    ])
    expect(await SafeBodyMembersModule.isTracked(SAFE, NETWORK, DAO)).to.be.true
    expect(send.callCount).to.equal(3)
    await Models.SafeAccount.untrack(NETWORK, SAFE)
    await SafeTrackingModule.start(params)
    expect(send.callCount).to.equal(3)
    expect(await SafeBodyMembersModule.isTracked(SAFE, NETWORK, DAO)).to.be.true
  })

  describe('holder', () => {
    it('stores the creation block once and uses it on later crawls', async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)
      const creation = sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({
        address: SAFE,
        blockNumber: '12345',
        transactionHash: '0xcreation',
      } as any)
      const expected = { id: `${NETWORK}-${SAFE}`, address: SAFE, network: NETWORK, blockNumber: 12345 }

      expect(await SafeTrackingModule.holder(NETWORK, SAFE)).to.deep.equal(expected)
      expect(await SafeTrackingModule.holder(NETWORK, SAFE)).to.deep.equal(expected)

      expect(creation.calledOnceWith({ address: SAFE, network: NETWORK })).to.be.true
      expect((await Models.SafeAccount.findTracked(NETWORK, SAFE))?.blockNumber).to.equal(12345)
    })

    it('uses the stored block without asking the explorer', async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)
      await Models.SafeAccount.updateOne({ safeAddress: SAFE }, { $set: { blockNumber: 321 } })
      const creation = sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').rejects(new Error('explorer down'))

      expect((await SafeTrackingModule.holder(NETWORK, SAFE))?.blockNumber).to.equal(321)
      expect(creation.notCalled).to.be.true
    })

    for (const blockNumber of [0, '0', null, undefined]) {
      it(`leaves the block unset when the explorer returns ${JSON.stringify(blockNumber)}`, async () => {
        await Models.SafeAccount.track(NETWORK, SAFE)
        sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation').resolves({ blockNumber } as any)

        expect(await SafeTrackingModule.holder(NETWORK, SAFE)).to.be.null

        expect((await Models.SafeAccount.findTracked(NETWORK, SAFE))?.blockNumber).to.be.null
        expect(await Models.ConfigIndexer.countDocuments()).to.equal(0)
      })
    }

    it('asks again after the explorer could not find the block', async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)
      const creation = sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation')
      creation.onFirstCall().resolves({ blockNumber: 0 } as any)
      creation.onSecondCall().resolves({ blockNumber: 234 } as any)

      expect(await SafeTrackingModule.holder(NETWORK, SAFE)).to.be.null
      expect((await SafeTrackingModule.holder(NETWORK, SAFE))?.blockNumber).to.equal(234)

      expect(creation.callCount).to.equal(2)
      expect((await Models.SafeAccount.findTracked(NETWORK, SAFE))?.blockNumber).to.equal(234)
    })

    it('does not look up an unknown Safe or one tracked on another network', async () => {
      const creation = sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation')
      await Models.SafeAccount.track(NetworksEnum.ethereumMainnet, SAFE)

      expect(await SafeTrackingModule.holder(NETWORK, SAFE)).to.be.null
      expect(creation.notCalled).to.be.true
    })

    it('keeps the block when a Safe is removed and added again', async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)
      await Models.SafeAccount.updateOne({ safeAddress: SAFE }, { $set: { blockNumber: 321 } })
      await Models.SafeAccount.untrack(NETWORK, SAFE)
      const creation = sandbox.stub(ProxyWeb3Provider, 'fetchContractCreation')

      expect(await SafeTrackingModule.holder(NETWORK, SAFE)).to.be.null
      await Models.SafeAccount.track(NETWORK, SAFE)
      expect((await SafeTrackingModule.holder(NETWORK, SAFE))?.blockNumber).to.equal(321)
      expect(creation.notCalled).to.be.true
    })
  })

  it('queues transfers and the native balance for the given network', async () => {
    await SafeTrackingModule.queueTransfers(NetworksEnum.ethereumMainnet, SAFE)

    expect(send.args).to.deep.equal([
      [
        EnumQueueName.daoTransactions,
        { id: SAFE, params: { daoAddress: SAFE, network: NetworksEnum.ethereumMainnet } },
      ],
      [
        EnumQueueName.daoAssets,
        {
          id: `${NetworksEnum.ethereumMainnet}-${SAFE}-native`,
          params: { address: SAFE, network: NetworksEnum.ethereumMainnet, native: true },
        },
      ],
    ])
  })

  describe('trackedByLower', () => {
    it('maps raw lowercase hex to the stored Safe address', async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)
      await Models.SafeAccount.track(NETWORK, DAO)
      await Models.SafeAccount.track(NetworksEnum.ethereumMainnet, OWNER)
      await Models.SafeAccount.ensure(NETWORK, SECOND_OWNER)

      const tracked = await SafeTrackingModule.trackedByLower(NETWORK)

      expect([...tracked]).to.have.deep.members([
        [SAFE.toLowerCase(), SAFE],
        [DAO.toLowerCase(), DAO],
      ])
    })

    it('drops a removed Safe on the next read and includes it after a re-add', async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)
      expect((await SafeTrackingModule.trackedByLower(NETWORK)).get(SAFE.toLowerCase())).to.equal(SAFE)

      await Models.SafeAccount.untrack(NETWORK, SAFE)
      expect((await SafeTrackingModule.trackedByLower(NETWORK)).size).to.equal(0)

      await Models.SafeAccount.track(NETWORK, SAFE)
      expect((await SafeTrackingModule.trackedByLower(NETWORK)).get(SAFE.toLowerCase())).to.equal(SAFE)
    })
  })

  describe('onExecution', () => {
    it('queues transfers and the native balance for a registered Safe', async () => {
      await Models.SafeAccount.track(NETWORK, SAFE)

      await SafeTrackingModule.onExecution(NETWORK, SAFE)

      expect(send.args).to.deep.equal([
        [EnumQueueName.daoTransactions, { id: SAFE, params: { daoAddress: SAFE, network: NETWORK } }],
        [
          EnumQueueName.daoAssets,
          { id: `${NETWORK}-${SAFE}-native`, params: { address: SAFE, network: NETWORK, native: true } },
        ],
      ])
    })

    it('does not queue for a DAO Safe without a registration', async () => {
      await Models.Plugin.create({
        address: SAFE,
        daoAddress: DAO,
        network: NETWORK,
        transactionHash: '0xplugin',
        blockNumber: 1,
        interfaceType: IPluginInterfaceType.safe,
        status: IPluginStatus.installed,
        isSupported: true,
      })
      expect(await SafeBodyMembersModule.isTracked(SAFE, NETWORK)).to.be.true

      await SafeTrackingModule.onExecution(NETWORK, SAFE)

      expect(send.notCalled).to.be.true
    })

    for (const state of ['unknown', 'removed', 'another network']) {
      it(`does not queue when the Safe is ${state}`, async () => {
        if (state === 'removed') {
          await Models.SafeAccount.track(NETWORK, SAFE)
          await Models.SafeAccount.untrack(NETWORK, SAFE)
        } else if (state === 'another network') await Models.SafeAccount.track(NetworksEnum.ethereumMainnet, SAFE)

        await SafeTrackingModule.onExecution(NETWORK, SAFE)

        expect(send.notCalled).to.be.true
      })
    }
  })
})
