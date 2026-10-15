import SafeAdminController from '@admin-api/controllers/safe'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import SafeReadRequestModule from '@modules/safe/safeReadRequest'
import {
  EnumQueueName,
  ErrorKeyEnum,
  IPluginInterfaceType,
  IPluginStatus,
  ISafeReadKind,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
const params = { network: NETWORK, address: SAFE }
const DAO = '0x3333333333333333333333333333333333333333'
const SPP = '0x4444444444444444444444444444444444444444'
const REMOVE_MESSAGE = 'The Safe belongs to a DAO or SPP, only a custom Safe can be removed'

const seedDaoUse = async (kind: 'SPP body' | 'Safe process', network = NETWORK) => {
  await Models.Dao.create({ address: DAO, network, transactionHash: '0xdao', blockNumber: 1, creatorAddress: SAFE })
  const pluginAddress = kind === 'SPP body' ? SPP : SAFE
  await Models.Plugin.create({
    address: pluginAddress,
    daoAddress: DAO,
    network,
    transactionHash: '0xplugin',
    blockNumber: 1,
    interfaceType: kind === 'SPP body' ? IPluginInterfaceType.spp : IPluginInterfaceType.safe,
    status: IPluginStatus.installed,
    isSupported: true,
    isProcess: true,
    isBody: false,
  })
  if (kind === 'SPP body') {
    await Models.Setting.create({
      network,
      daoAddress: DAO,
      pluginAddress: SPP,
      transactionHash: '0xsetting',
      blockNumber: 1,
      status: ISettingStatus.active,
      stages: [{ stageIndex: 0, plugins: [{ address: SAFE, brandId: VotingBodyBrandIdentity.SAFE }] }],
    })
  }
  return pluginAddress
}

describe('Controller: SafeAdmin', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'verbose')
    sandbox.stub(logger, 'debug')
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'error')
    sandbox.stub(SafeReadRequestModule, 'send').resolves({ owners: [SAFE], threshold: 1 })
  })

  afterEach(() => {
    sandbox.restore()
    RabbitMQHelper.queuedMessages.clear()
    RabbitMQHelper.activeJobs.clear()
  })

  it('checks the Safe before storing it and queues the tracked address', async () => {
    const read = SafeReadRequestModule.send as sinon.SinonStub
    read.callsFake(async () => {
      expect(await Models.SafeAccount.countDocuments()).to.equal(0)
      return { owners: [SAFE], threshold: 1 }
    })
    const send = sandbox.stub(RabbitMQHelper, 'sendMessage').callsFake(async () => {
      expect(await Models.SafeAccount.findTracked(NETWORK, SAFE)).not.to.be.null
    })

    expect(await SafeAdminController.add(params)).to.be.true

    expect(read.calledOnce).to.be.true
    expect(read.firstCall.args[0]).to.include({ network: NETWORK, address: SAFE, kind: ISafeReadKind.info })
    expect(read.firstCall.args[0].sentAt).to.be.a('number')
    expect(send.calledOnce).to.be.true
    expect(send.firstCall.args).to.deep.equal([
      EnumQueueName.safeTrack,
      { id: `safe-track-${NETWORK}-${SAFE}`, params },
    ])
  })

  it('adds the same Safe twice without adding another account row', async () => {
    const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

    await SafeAdminController.add(params)
    await SafeAdminController.add(params)

    expect(await Models.SafeAccount.countDocuments()).to.equal(1)
    expect(await Models.SafeAccount.findTracked(NETWORK, SAFE)).not.to.be.null
    expect(send.callCount).to.equal(2)
    expect(send.firstCall.args[1]).to.deep.equal(send.secondCall.args[1])
  })

  it('publishes a re-add after the previous publish has finished', async () => {
    const publish = sandbox.stub().resolves()
    sandbox.stub(RabbitMQ, 'getChannel').returns({ sendToQueue: publish } as any)

    await SafeAdminController.add(params)
    await SafeAdminController.remove(params)
    await SafeAdminController.add(params)

    expect(publish.callCount).to.equal(2)
    expect(publish.firstCall.args[1].id).to.equal(publish.secondCall.args[1].id)
    expect(await Models.SafeAccount.findTracked(NETWORK, SAFE)).not.to.be.null
    expect(RabbitMQHelper.queuedMessages.size).to.equal(0)
  })

  it('writes nothing when the Safe check fails', async () => {
    ;(SafeReadRequestModule.send as sinon.SinonStub).rejects(new Error('gateway down'))
    const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

    await expect(SafeAdminController.add(params)).to.be.rejectedWith('gateway down')

    expect(await Models.SafeAccount.countDocuments()).to.equal(0)
    expect(send.notCalled).to.be.true
  })

  it('does not queue tracking when the account write fails', async () => {
    sandbox.stub(Models.SafeAccount, 'track').rejects(new Error('database down'))
    const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

    await expect(SafeAdminController.add(params)).to.be.rejectedWith('database down')

    expect(await Models.SafeAccount.countDocuments()).to.equal(0)
    expect(send.notCalled).to.be.true
  })

  it('removes the registration without removing the account or its owners', async () => {
    await Models.SafeAccount.track(NETWORK, SAFE)
    await Models.SafeMember.ensure(NETWORK, SAFE, SAFE)
    const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

    expect(await SafeAdminController.remove(params)).to.be.true

    expect(await Models.SafeAccount.findTracked(NETWORK, SAFE)).to.be.null
    expect(await Models.SafeAccount.countDocuments()).to.equal(1)
    expect(await Models.SafeMember.findOwner(NETWORK, SAFE, SAFE)).not.to.be.null
    expect((SafeReadRequestModule.send as sinon.SinonStub).notCalled).to.be.true
    expect(send.notCalled).to.be.true
    await expect(SafeAdminController.remove(params)).to.be.rejectedWith(ErrorKeyEnum.notFound)
  })

  for (const kind of ['SPP body', 'Safe process'] as const) {
    it(`keeps a registered ${kind} tracked when removal is requested`, async () => {
      await seedDaoUse(kind)
      const before = await Models.SafeAccount.track(NETWORK, SAFE)
      await Models.SafeMember.ensure(NETWORK, SAFE, SAFE)
      const untrack = sandbox.spy(Models.SafeAccount, 'untrack')
      const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      const error = await SafeAdminController.remove(params).then(
        () => null,
        error => error,
      )

      expect(error).to.include({ message: ErrorKeyEnum.badParams, status: 400, description: REMOVE_MESSAGE })
      expect(await Models.SafeAccount.findTracked(NETWORK, SAFE)).to.deep.equal(before)
      expect(await Models.SafeMember.findOwner(NETWORK, SAFE, SAFE)).not.to.be.null
      expect(untrack.notCalled).to.be.true
      expect(send.notCalled).to.be.true
      expect((SafeReadRequestModule.send as sinon.SinonStub).notCalled).to.be.true
    })

    it(`removes a custom registration when its ${kind} is on another network`, async () => {
      await seedDaoUse(kind, NetworksEnum.ethereumMainnet)
      await Models.SafeAccount.track(NETWORK, SAFE)
      await Models.SafeAccount.track(NetworksEnum.ethereumMainnet, SAFE)
      const send = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      expect(await SafeAdminController.remove(params)).to.be.true

      expect(await Models.SafeAccount.findTracked(NETWORK, SAFE)).to.be.null
      expect(await Models.SafeAccount.findTracked(NetworksEnum.ethereumMainnet, SAFE)).not.to.be.null
      expect(send.notCalled).to.be.true
    })

    it(`allows removal after the ${kind === 'SPP body' ? 'SPP' : 'Safe process'} is uninstalled`, async () => {
      const pluginAddress = await seedDaoUse(kind)
      await Models.SafeAccount.track(NETWORK, SAFE)
      await Models.Plugin.updateOne(
        { network: NETWORK, address: pluginAddress },
        { $set: { status: IPluginStatus.uninstalled } },
      )

      expect(await SafeAdminController.remove(params)).to.be.true

      expect(await Models.SafeAccount.findTracked(NETWORK, SAFE)).to.be.null
      expect(await Models.SafeAccount.countDocuments()).to.equal(1)
    })
  }
})
