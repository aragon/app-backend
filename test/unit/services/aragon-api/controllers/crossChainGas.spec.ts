import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import CrossChainGasController from '@services/aragon-api/controllers/crossChainGas'
import { EnumQueueName, ICrossChainGasStatus, IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const CONTROLLER = '0x53D16018a33f10D0b067fC70bf8FCF10a5da23Cb'
const TARGET = '0x4200000000000000000000000000000000000006'
const ACTIONS = [{ to: TARGET, value: '0', data: '0x095ea7b3' }]

describe('Controller: CrossChainGas', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(Models.Plugin, 'findByAddress').resolves({
      address: CONTROLLER,
      network: NetworksEnum.baseMainnet,
      interfaceType: IPluginInterfaceType.crossChainController,
    })
  })

  afterEach(() => {
    sandbox?.restore()
  })

  const estimate = () => CrossChainGasController.estimateGasLimit(NetworksEnum.baseMainnet, CONTROLLER, 1, ACTIONS)

  it('delegates to the gateway over the queue and waits for the reply', async () => {
    const reply = { status: ICrossChainGasStatus.SUCCESS, requiredGas: '228100', runAt: 1 }
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(reply)

    const result = await estimate()

    expect(result).to.deep.equal(reply)
    expect(sendMessage.calledOnce).to.be.true

    const [queueName, payload, opts] = sendMessage.firstCall.args
    expect(queueName).to.equal(EnumQueueName.crossChainGasLimit)
    expect(payload.params).to.deep.include({
      network: NetworksEnum.baseMainnet,
      controllerAddress: CONTROLLER,
      destinationChainId: 1,
      actions: ACTIONS,
    })
    expect(payload.params.sentAt).to.be.a('number')
    // Without waitResponse the helper fire-and-forgets and the caller gets null.
    expect(opts?.waitResponse).to.be.true
    expect(opts?.timeout).to.equal(config.RABBITMQ.TIMEOUT)
  })

  it('keys the message by origin, controller and destination so logs are traceable', async () => {
    const sendMessage = sandbox
      .stub(RabbitMQHelper, 'sendMessage')
      .resolves({ status: ICrossChainGasStatus.SUCCESS, requiredGas: '1', runAt: 1 })

    await estimate()

    expect(sendMessage.firstCall.args[1].id).to.equal(`${NetworksEnum.baseMainnet}-${CONTROLLER}-1`)
  })

  it('rejects with 502 when the consumer never replies', async () => {
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(null)

    await expect(estimate()).to.be.rejectedWith('crossChainSimulationFailed')
  })

  it('does not echo actions in timeout error metadata', async () => {
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(null)

    const thrown: any = await estimate().catch(error => error)

    expect(thrown.exposeMeta).to.deep.equal({
      network: NetworksEnum.baseMainnet,
      controllerAddress: CONTROLLER,
      destinationChainId: 1,
    })
    expect(thrown.exposeMeta).to.not.have.property('actions')
  })

  it('rejects a controller that is not an indexed cross-chain controller before publishing', async () => {
    ;(Models.Plugin.findByAddress as sinon.SinonStub).resolves({ interfaceType: IPluginInterfaceType.admin })
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')

    const thrown: any = await estimate().catch(error => error)

    expect(thrown.status).to.equal(400)
    expect(thrown.message).to.equal('crossChainControllerNotFound')
    expect(thrown.description).to.equal('Cross-chain controller not found')
    expect(sendMessage.called).to.be.false
  })

  describe('error keys crossing the queue', () => {
    // A thrown handler never replies, so the consumer returns the error key as a value and the
    // controller rebuilds the status. Each key must map back to its original meaning.
    const cases = [
      { errorKey: 'crossChainLaneNotConfigured', error: 'No cross-chain lane is configured' },
      { errorKey: 'crossChainBridgeUnsupported', error: 'The configured adapter is not a CCIP adapter' },
      { errorKey: 'crossChainSimulationFailed', error: 'The delivery simulation could not be run' },
    ]

    for (const { errorKey, error } of cases) {
      it(`rethrows ${errorKey} with its own description`, async () => {
        sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({ error, errorKey })

        const thrown = await estimate().catch((e: any) => e)

        expect(thrown.message).to.equal(errorKey)
        expect(thrown.description).to.equal(error)
        expect(thrown.exposeCustom_).to.be.true
      })
    }

    it('falls back to a simulation failure when the key is unrecognised', async () => {
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({ error: 'boom', errorKey: 'somethingElse' })

      await expect(estimate()).to.be.rejectedWith('crossChainSimulationFailed')
    })

    for (const errorKey of ['toString', 'constructor', '__proto__']) {
      it(`falls back to a simulation failure for the inherited key ${errorKey}`, async () => {
        sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({ error: 'boom', errorKey })

        // Read as a key these give back something inherited from Object, not undefined, so the
        // caller used to end up with a 500 instead of the 502 the real key carries.
        const thrown: any = await estimate().catch(error => error)

        expect(thrown.message).to.equal('crossChainSimulationFailed')
        expect(thrown.status).to.equal(502)
      })
    }

    it('falls back to a simulation failure when no key is given', async () => {
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({ error: 'boom' })

      await expect(estimate()).to.be.rejectedWith('crossChainSimulationFailed')
    })
  })
})
