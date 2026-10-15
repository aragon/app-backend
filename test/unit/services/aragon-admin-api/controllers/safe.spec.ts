import SafeAdminController from '@admin-api/controllers/safe'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import SafeReadRequestModule from '@modules/safe/safeReadRequest'
import { EnumQueueName, ErrorKeyEnum, ISafeReadKind, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const SAFE = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
const params = { network: NETWORK, address: SAFE }

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
})
